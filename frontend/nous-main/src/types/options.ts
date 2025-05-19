
export interface OptionContract {
  contractSymbol: string;
  strike: number;
  expiryDate: string;
  lastPrice: number;
  bid: number;
  ask: number;
  change: number;
  percentChange: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  inTheMoney: boolean;
  lastTradeDate: string;
  isRecommended?: boolean;
  confidence?: number;
  // New fields
  timeToExpiry?: number;
  riskFreeRate?: number;
  predictedVolatility?: number;
  volatilityDifference?: number;
  // Greeks
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  rho?: number;
}

export interface OptionChain {
  symbol: string;
  calls: OptionContract[];
  puts: OptionContract[];
  expirationDates: string[];
  strikeRange: {
    min: number;
    max: number;
  };
  lastUpdate: string;
}

export type OptionType = 'calls' | 'puts';
export type Moneyness = 'ITM' | 'ATM' | 'OTM' | 'ALL';

export interface OptionsFilters {
  ticker: string;
  optionType: OptionType;
  expiryDate: string | null;
  minStrike: number | null;
  maxStrike: number | null;
  moneyness: Moneyness;
  minVolume: number | null;
  showRecommendationsOnly: boolean;
}

export interface RecommendationReason {
  id: string;
  text: string;
  importance: 'high' | 'medium' | 'low';
}
