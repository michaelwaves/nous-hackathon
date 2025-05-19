import random
import re
from typing import Dict, List, Optional, Tuple, Union

import wandb
from datasets import load_dataset
from tqdm.asyncio import tqdm_asyncio

from yahooquery import Ticker
import pandas as pd

from atroposlib.envs.base import (
    APIServerConfig,
    BaseEnv,
    BaseEnvConfig,
    EvalHandlingEnum,
    Item,
    ScoredDataGroup,
)
from atroposlib.utils.tokenize_for_trainer import tokenize_for_trainer

# System prompt only contains thinking instructions
system_prompt = """You are a deep thinking AI Stock Options analyst.
You may use extremely long chains of thought to deeply consider the problem and deliberate with yourself via systematic reasoning processes to help come to a correct solution prior to answering.

You should enclose your thoughts and internal monologue inside <think> </think> tags, and then provide your final prediction."""  # noqa E501

# User message template that contains task instructions
user_message_template = """Your task is to analyze the following option data:
Option Price: {option_price}
Underlying Stock Price: {underlying_stock_price}
Strike Price: {strike_price}
Time to Expiration (Years): {time_to_expiration_years}
Risk-Free Rate: {risk_free_rate}
Option Type: {option_type}

Predict the implied volatility of the option.

Your final answer MUST use the exact format:
"The implied volatility will be: {{answer}}%"

Where {{answer}} is the implied volatility as a string (e.g., "70.5").

Here is the data to analyze:

{context}"""  # context will be a summary string or can be integrated if needed


class OptionsIVPrediction(BaseEnv):
    def __init__(
        self,
        config: BaseEnvConfig,
        server_configs: List[APIServerConfig],
        slurm=True,
        testing=False,
    ):
        """
        Initialize the Fundamental Metric Prediction environment.

        Args:
            config: Configuration for the base environment
            server_configs: List of server configurations for OpenAI API
            slurm: Whether to use Slurm for distributed training
            testing: Whether in testing mode
        """
        super().__init__(config, server_configs, slurm, testing)
        self.percent_correct_buffer = list() # Tracks format correctness
        self.iv_accuracy_buffer = list()    # Tracks IV prediction accuracy
        self.eval_metrics = list()

    @classmethod
    def config_init(self) -> Tuple[BaseEnvConfig, List[APIServerConfig]]:
        env_config = BaseEnvConfig(
            tokenizer_name="NousResearch/DeepHermes-3-Llama-3-8B-Preview",
            group_size=16,
            use_wandb=True,
            max_num_workers=128,
            rollout_server_url="http://localhost:8000",
            total_steps=2000,
            batch_size=1024,
            steps_per_eval=20,
            max_token_length=1024 * 16,
            inference_weight=1.0,
            wandb_name="options_iv_prediction",
            data_path_to_save_groups=None,
            eval_handling=EvalHandlingEnum.LIMIT_TRAIN,
            eval_limit_ratio=0.1,
        )
        server_configs = [
            APIServerConfig(
                model_name="NousResearch/DeepHermes-3-Llama-3-8B-Preview",
                base_url="http://localhost:9004/v1",
                api_key="x",
                num_requests_for_eval=256,
            )
        ]

        return env_config, server_configs

    async def setup(self):
        """
        Set up the environment by loading and preparing the dataset.
        """
        # Load the full dataset
        # Assuming 'unh_options.csv' has columns:
        # 'lastPrice', 'strike', 'expirationDate', 'impliedVolatility', 'optionType', 'underlyingPrice', 'riskFreeRate'
        # 'expirationDate' should be a parseable date string.
        # 'impliedVolatility' should be a float (e.g., 0.705 for 70.5%)
        full_dataset = load_dataset('csv', data_files={'train': 'unh_options.csv'})['train']


        full_dataset = full_dataset.shuffle(seed=42)

        # Create train/test split (95% train, 5% test)
        split_dataset = full_dataset.train_test_split(test_size=0.05, seed=42)

        # Keep the splits as is - no need to reformat
        self.train = split_dataset["train"]
        self.test = split_dataset["test"]

        # Print some dataset statistics
        print(
            f"Loaded dataset with {len(self.train)} training examples and {len(self.test)} test examples"
        )
        print(f"Example item format: {self.train[0]}")

        # Initialize iteration counter
        self.iter = 0

    def save_checkpoint(self, step, data=None):
        if data is None:
            data = {}
        data["iter"] = self.iter
        super().save_checkpoint(step, data)

    async def get_next_item(self):
        """
        Get the next training item from the dataset.

        Returns:
            A tuple containing prompt, expected IV answer, None (for magnitude), and "implied volatility"
        """
        next_item = self.train[self.iter % len(self.train)]
        self.iter += 1

        # Extract data from the dataset item
        option_price = next_item['lastPrice']
        underlying_stock_price = next_item['underlyingPrice']
        strike_price = next_item['strike']
        
        # Calculate time to expiration
        try:
            expiry_date_str = next_item['expirationDate']
            # Assuming date format in CSV is 'YYYY-MM-DD HH:MM:SS' or similar pd.to_datetime can handle
            expiry_datetime = pd.to_datetime(expiry_date_str)
            now = pd.Timestamp.now(tz=expiry_datetime.tz) # Ensure timezone consistency
            time_to_expiration_years = (expiry_datetime - now).total_seconds() / (365.25 * 24 * 60 * 60)
            if time_to_expiration_years < 0: # Handle expired options if any in dataset
                time_to_expiration_years = 1e-6 # A very small positive number
        except Exception as e:
            print(f"Error processing expiration date: {e}. Using default TTE.")
            time_to_expiration_years = 0.25 # Default TTE if parsing fails

        risk_free_rate = next_item.get('riskFreeRate', 0.05) # Use a default if not present
        option_type = next_item['optionType'] # 'call' or 'put'
        
        # Expected answer: implied volatility as a string percentage (e.g., "70.5")
        expected_iv_float = next_item['impliedVolatility'] 
        expected_iv_answer_str = f"{expected_iv_float * 100:.1f}" # Format to one decimal place

        fundamental_metric = "implied volatility" # This is fixed for this environment

        # Create context string for the prompt
        # The user_message_template now directly includes placeholders for these values.
        # The {context} placeholder in the template can be used for additional narrative if any.
        # For now, we'll pass an empty string or a summary if available.
        # The main data is now part of the template itself.
        
        context_details = (
            f"Option Price: {option_price}, "
            f"Underlying Stock Price: {underlying_stock_price}, "
            f"Strike Price: {strike_price}, "
            f"Time to Expiration (Years): {time_to_expiration_years:.4f}, "
            f"Risk-Free Rate: {risk_free_rate:.4f}, "
            f"Option Type: {option_type}"
        )

        prompt = []
        prompt.append(frozenset({"role": "system", "content": system_prompt}.items()))

        user_content = user_message_template.format(
            option_price=option_price,
            underlying_stock_price=underlying_stock_price,
            strike_price=strike_price,
            time_to_expiration_years=f"{time_to_expiration_years:.4f}",
            risk_free_rate=f"{risk_free_rate:.4f}",
            option_type=option_type,
            context=f"Further details: {next_item.get('context', 'N/A')}" # If there's a generic context field
        )
        prompt.append(frozenset({"role": "user", "content": user_content}.items()))

        # Return (prompt_tuple, expected_iv_str, None for magnitude, "implied volatility")
        return (tuple(prompt), expected_iv_answer_str, None, fundamental_metric)

    async def collect_trajectories(self, item) -> Tuple[ScoredDataGroup, List]:
        """
        Generate and collect model responses for scoring.

        Args:
            item: Input item containing prompt and expected answer

        Returns:
            Tuple of lists containing scored data groups and backlog
        """
        # Extract messages from the item
        messages = []
        for role_dict in item[0]:
            messages.append(dict(role_dict))

        # Apply chat template to convert messages to a single string
        prompt = self.tokenizer.apply_chat_template(
            messages, add_generation_prompt=True, tokenize=False
        )

        # Get completions from the model
        completions = await self.server.completion(
            prompt=prompt,
            n=self.config.group_size,
            max_tokens=1024 * 15,
            temperature=0.8,  # Using higher temperature for diverse responses
        )

        to_score = list()

        for _, completion_choice in enumerate(completions.choices):
            # Create a copy of the prompt messages
            trajectory_messages = []
            for role_dict in item[0]:
                trajectory_messages.append(dict(role_dict))

            # Add the model's response
            trajectory_messages.append(
                {"role": "assistant", "content": completion_choice.text}
            )

            # Add to scoring queue with expected answer (IV string), None (magnitude), and "implied volatility"
            to_score.append(
                (
                    tuple(trajectory_messages),
                    item[1],  # expected_iv_answer_str
                    item[2],  # None (for magnitude placeholder)
                    item[3],  # "implied volatility"
                )
            )

        # Call score to get the scored data
        scored_data = await self.score(to_score)
        to_backlog = []

        return scored_data, to_backlog

    def _extract_prediction(self, text, fundamental_metric):
        """
        Extract the implied volatility from the model's response.

        Args:
            text: Text containing the model's response
            fundamental_metric: Should be "implied volatility"

        Returns:
            Tuple of (iv_prediction_str, None) or (None, None) if extraction fails
        """
        # Check for thinking section
        think_tags = re.findall(r"<think>", text, re.IGNORECASE)
        think_close_tags = re.findall(r"</think>", text, re.IGNORECASE)

        # Verify thinking format - must have exactly one opening and one closing tag
        if len(think_tags) != 1 or len(think_close_tags) != 1:
            return None, None

        # Split on </think> to separate thinking from answer
        parts = re.split(r"</think>", text, flags=re.IGNORECASE, maxsplit=1)
        if len(parts) != 2:
            return None, None

        thinking_section, answer_section = parts

        # Validate thinking section contains opening tag
        if "<think>" not in thinking_section.lower():
            return None, None

        # Escape fundamental_metric for regex (e.g., "implied volatility")
        escaped_metric = re.escape(fundamental_metric)

        # Regex to capture IV: "The implied volatility will be: {{answer}}%"
        # {{answer}} is a number, possibly with decimals.
        pattern = f"The {escaped_metric} will be:\\s*([-+]?\\d+(?:\\.\\d+)?)%"

        all_matches = re.findall(pattern, answer_section, re.IGNORECASE)

        if len(all_matches) != 1:
            return None, None # No match or multiple matches

        # Extract single match
        matches = re.search(pattern, answer_section, re.IGNORECASE)
        if not matches or len(matches.groups()) != 1:
            return None, None

        iv_prediction_str = matches.group(1)

        return iv_prediction_str, None # Return IV string and None for magnitude part

    def _calculate_magnitude_score(self, predicted_iv_str, expected_iv_str):
        """
        Calculate a score for IV prediction accuracy.
        This was originally _calculate_magnitude_score, repurposed for IV.

        Args:
            predicted_iv_str: The model's predicted IV string (e.g., "70.5")
            expected_iv_str: The expected IV string (e.g., "72.0")

        Returns:
            Score between 0.0 and 1.0 based on how close the prediction is
        """
        try:
            pred_iv = float(predicted_iv_str)
            exp_iv = float(expected_iv_str)

            diff = abs(pred_iv - exp_iv) # Difference in percentage points

            # Score based on closeness (adjust thresholds as needed for IV)
            # Perfect match = 1.0
            # Within 1 percentage point = 0.9
            # Within 2.5 percentage points = 0.7
            # Within 5 percentage points = 0.5
            # Within 10 percentage points = 0.3
            # More than 10 percentage points off = 0.0
            if diff == 0:
                return 1.0
            elif diff <= 1.0: # 1% absolute IV difference
                return 0.9
            elif diff <= 2.5: # 2.5% absolute IV difference
                return 0.7
            elif diff <= 5.0: # 5% absolute IV difference
                return 0.5
            elif diff <= 10.0: # 10% absolute IV difference
                return 0.3
            else:
                return 0.0

        except ValueError:
            # If conversion fails, return 0
            return 0.0

    async def score(
        self, rollout_group_data
    ) -> Union[Optional[ScoredDataGroup], List[Optional[ScoredDataGroup]]]:
        """
        Score the generated model responses for implied volatility predictions.

        Args:
            rollout_group_data: List of generated responses with expected answers

        Returns:
            ScoredDataGroup with tokenized inputs and scores, or None if no valid scores
        """
        scores = ScoredDataGroup()
        scores["tokens"] = list()
        scores["masks"] = list()
        scores["scores"] = list()

        # Get the expected answer (IV string) and fundamental metric ("implied volatility")
        expected_iv_str = rollout_group_data[0][1]  # Expected IV string (e.g., "70.5")
        # expected_magnitude is rollout_group_data[0][2], which is None for this env
        fundamental_metric = rollout_group_data[0][3]  # "implied volatility"

        # Shuffle to avoid bias in selection
        random.shuffle(rollout_group_data)

        for item in rollout_group_data:
            # Extract the model's response
            model_response = item[0][-1]["content"]

            # Extract the prediction (IV string) from the model's response
            predicted_iv_str, _ = self._extract_prediction( # Second element is None
                model_response, fundamental_metric
            )

            # Calculate final score
            format_correct_and_extracted = 0.0
            iv_accuracy_score = 0.0

            if predicted_iv_str is None:
                final_score = 0.0  # Invalid format or extraction failure
            else:
                format_correct_and_extracted = 1.0
                # Calculate IV accuracy score
                iv_accuracy_score = self._calculate_magnitude_score(
                    predicted_iv_str, expected_iv_str
                )
                # Base score for correct format + IV accuracy bonus
                final_score = 1.0 + iv_accuracy_score 

            # Apply length penalty for responses that are too long
            response_tokens = len(self.tokenizer.encode(model_response))
            if response_tokens > self.config.max_token_length * 0.95:
                # Penalize responses that are close to the max token limit
                final_score -= 0.5 * (response_tokens / self.config.max_token_length)

            # For binary reward signal, any positive score gets +1, otherwise -1
            binary_reward = 1.0 if final_score > 0 else -1.0

            # Tokenize the conversation for learning
            out_dict = tokenize_for_trainer(self.tokenizer, item[0])
            tokens = out_dict["tokens"]
            masks = out_dict["masks"]

            # Remove examples with insufficient context
            if len([1 for i in masks if i != -100]) < 10:
                continue

            scores["tokens"].append(tokens)
            scores["masks"].append(masks)
            scores["scores"].append(binary_reward)

            # For tracking metrics
            self.percent_correct_buffer.append(format_correct_and_extracted)
            if format_correct_and_extracted == 1.0: # Only record accuracy if format was OK
                self.iv_accuracy_buffer.append(iv_accuracy_score)

            # Break once we have enough examples
            if len(scores["tokens"]) >= self.config.group_size:
                break

        # Return None if all scores are the same (no learning signal)
        if all(scores["scores"][0] == score for score in scores["scores"]):
            return None

        return scores

    async def rollout_and_score_eval(self, test_item):
        """
        Generate and score model responses for a single test item.

        Args:
            test_item: Test item from dataset (already processed by get_next_item structure)

        Returns:
            Dictionary with format_correct_score and iv_accuracy_score
        """
        # Reconstruct prompt and expected values from test_item if it's raw from dataset
        # Or assume test_item is already in the (prompt_tuple, expected_iv_str, None, "implied volatility") format
        # For simplicity, let's assume test_item is raw and we re-process it like in get_next_item
        
        option_price = test_item['lastPrice']
        underlying_stock_price = test_item['underlyingPrice']
        strike_price = test_item['strike']
        try:
            expiry_date_str = test_item['expirationDate']
            expiry_datetime = pd.to_datetime(expiry_date_str)
            now = pd.Timestamp.now(tz=expiry_datetime.tz)
            time_to_expiration_years = (expiry_datetime - now).total_seconds() / (365.25 * 24 * 60 * 60)
            if time_to_expiration_years < 0: time_to_expiration_years = 1e-6
        except Exception: time_to_expiration_years = 0.25
        risk_free_rate = test_item.get('riskFreeRate', 0.05)
        option_type = test_item['optionType']
        expected_iv_float = test_item['impliedVolatility']
        expected_iv_str = f"{expected_iv_float * 100:.1f}"
        fundamental_metric = "implied volatility"

        user_content = user_message_template.format(
            option_price=option_price,
            underlying_stock_price=underlying_stock_price,
            strike_price=strike_price,
            time_to_expiration_years=f"{time_to_expiration_years:.4f}",
            risk_free_rate=f"{risk_free_rate:.4f}",
            option_type=option_type,
            context=f"Further details: {test_item.get('context', 'N/A')}"
        )

        # Create messages for model
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ]

        # Apply chat template to convert messages to a single string
        prompt = self.tokenizer.apply_chat_template(
            messages, add_generation_prompt=True, tokenize=False
        )

        # Get model completion
        completion = await self.server.completion(
            prompt=prompt,
            n=1,
            max_tokens=1024 * 16,
            temperature=0.2,  # Lower for eval
            split="eval",
        )

        # Extract the model's response
        model_response = completion.choices[0].text

        # Extract prediction (IV string)
        predicted_iv_str, _ = self._extract_prediction(
            model_response, fundamental_metric
        )

        # Calculate format correctness score (1 if IV extracted, 0 otherwise)
        format_correct_score = 1.0 if predicted_iv_str is not None else 0.0

        # Calculate IV accuracy score if format is correct
        iv_accuracy_score = 0.0
        if format_correct_score == 1.0:
            iv_accuracy_score = self._calculate_magnitude_score(
                predicted_iv_str, expected_iv_str
            )

        # Calculate combined score (e.g., 1 + iv_accuracy_score if format is correct, 0 otherwise)
        combined_score = (1.0 + iv_accuracy_score) if format_correct_score == 1.0 else 0.0

        return {
            "format_correct_score": format_correct_score, # Renamed from direction_score
            "iv_accuracy_score": iv_accuracy_score,       # Renamed from magnitude_score
            "combined_score": combined_score,
        }

    async def evaluate(self, *args, **kwargs):
        """
        Evaluate the model on test data.
        """
        eval_tasks = []
        for test_item in self.test:
            eval_tasks.append(self.rollout_and_score_eval(test_item))

        # Run evaluation
        all_scores = await tqdm_asyncio.gather(*eval_tasks)

        # Calculate aggregate metrics
        format_correct_scores = [score["format_correct_score"] for score in all_scores]
        iv_accuracy_scores = [
            score["iv_accuracy_score"]
            for score in all_scores
            if score["format_correct_score"] == 1.0 # Only consider accuracy if format was correct
        ]
        combined_scores = [score["combined_score"] for score in all_scores]

        # Calculate and log metrics
        avg_format_correctness = (
            sum(format_correct_scores) / len(format_correct_scores) if format_correct_scores else 0
        )
        avg_iv_accuracy = (
            sum(iv_accuracy_scores) / len(iv_accuracy_scores) if iv_accuracy_scores else 0
        )
        average_combined_score = (
            sum(combined_scores) / len(combined_scores) if combined_scores else 0
        )

        self.eval_metrics.append(("eval/avg_format_correctness", avg_format_correctness))
        self.eval_metrics.append(("eval/avg_iv_accuracy", avg_iv_accuracy))
        self.eval_metrics.append(("eval/combined_score", average_combined_score))

    async def wandb_log(self, wandb_metrics: Optional[Dict] = None):
        if wandb_metrics is None:
            wandb_metrics = {}

        # Calculate and log training format correctness
        try:
            avg_format_correctness = sum(self.percent_correct_buffer) / len(
                self.percent_correct_buffer
            )
            wandb_metrics["train/avg_format_correctness"] = avg_format_correctness
        except ZeroDivisionError:
            pass

        # Calculate and log training IV accuracy
        try:
            avg_iv_accuracy = sum(self.iv_accuracy_buffer) / len(
                self.iv_accuracy_buffer
            )
            wandb_metrics["train/avg_iv_accuracy"] = avg_iv_accuracy
        except ZeroDivisionError:
            pass

        # Calculate combined training score
        try:
            combined_score = 0
            if "train/avg_format_correctness" in wandb_metrics and "train/avg_iv_accuracy" in wandb_metrics:
                 # Example: average of the two, or weighted sum
                combined_score = (wandb_metrics["train/avg_format_correctness"] + wandb_metrics["train/avg_iv_accuracy"]) / 2
            elif "train/avg_format_correctness" in wandb_metrics: # If only format is available
                 combined_score = wandb_metrics["train/avg_format_correctness"]

            wandb_metrics["train/combined_score"] = combined_score
        except Exception as e:
            print(f"Error calculating combined score: {e}")
            pass

        # Clear the buffers after logging
        self.percent_correct_buffer = list()
        self.iv_accuracy_buffer = list()

        # Log evaluation metrics
        for item in self.eval_metrics:
            wandb_metrics[item[0]] = item[1]
        self.eval_metrics = list()

        await super().wandb_log(wandb_metrics)

    async def add_rollouts_for_wandb(
        self,
        scored_data: Union[ScoredDataGroup, List[ScoredDataGroup]],
        item: Item = None, # item is (prompt_tuple, expected_iv_str, None, "implied volatility")
    ):
        # Initialize rollouts_for_wandb if not exists
        if not hasattr(self, "rollouts_for_wandb"):
            self.rollouts_for_wandb = []

        # Get number of examples to keep
        num_keep = getattr(self.config, "num_rollouts_per_group_for_logging", -1)

        if num_keep == -1:
            num_keep = self.config.group_size

        # Get metric type from item
        metric_type = item[3] # Should be "implied volatility"

        # Add examples to rollouts
        self.rollouts_for_wandb.append(
            [
                (
                    self.tokenizer.decode(scored_data["tokens"][i]),
                    scored_data["scores"][i],
                    item[1],  # expected_iv_str
                    None,     # placeholder for expected_magnitude, which is not used here
                    metric_type, 
                )
                for i in range(min(num_keep, len(scored_data["tokens"])))
            ]
        )

        # Keep buffer size limited
        max_rollouts = getattr(self.config, "num_rollouts_to_keep", 10)
        if len(self.rollouts_for_wandb) > max_rollouts:
            self.rollouts_for_wandb.pop(0)

    async def create_rollout_table(self, wandb_metrics):
        if hasattr(self, "rollouts_for_wandb") and len(self.rollouts_for_wandb) > 0:
            table = wandb.Table(
                columns=[
                    "text",
                    "score",
                    "expected_iv", # Renamed from expected_direction
                    "expected_magnitude_placeholder", # Renamed, clarify it's a placeholder
                    "metric_type", # Renamed from fundamental_metric for consistency
                ]
            )

            for group in self.rollouts_for_wandb:
                for item_tuple in group: # Renamed item to item_tuple to avoid conflict
                    table.add_data(item_tuple[0], item_tuple[1], item_tuple[2], item_tuple[3], item_tuple[4])

            wandb_metrics["train/rollouts"] = table

        # Clear rollouts after logging
        self.rollouts_for_wandb = []

        return wandb_metrics


if __name__ == "__main__":
    OptionsIVPrediction.cli()
