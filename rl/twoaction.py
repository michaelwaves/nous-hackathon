import torch 
import torch.nn as nn
import torch.optim as optim

torch.manual_seed(42)

device = 'cuda' if torch.cuda.is_available() else 'cpu'
print(f"Using device: {device}")
#predicts the best action to take in 2 action environment
#1 rewards 1 0 rewards 0
class Policy(nn.Module):
    def __init__(self):
        super().__init__()
        self.logits = nn.Parameter(torch.tensor([0.0,0.0]))

    def forward(self):
        return torch.softmax(self.logits, dim=0)
    

policy = Policy()
optimizer = optim.Adam(policy.parameters(), lr=0.1)

def get_reward(action):
    return 1.0 if action ==1 else 0.0

for episode in range(100):
    action_probs = policy()

    action_dist = torch.distributions.Categorical(action_probs)
    action  = action_dist.sample()

    reward = get_reward(action.item())

    log_prob = torch.log(action_probs[action])
    loss = -log_prob * reward

    optimizer.zero_grad()
    loss.backward()
    optimizer.step()

    if episode % 10 == 0 or episode ==99:
        print(f"Episode {episode:3d}: Action={action.item()}, reward={reward}, Probs={action_probs.detach().numpy()}")