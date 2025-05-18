
import { OptionChain } from "@/types/options";
import { toast } from "sonner";

const API_KEY = "5AO91H3GDDKZFDRT"; // Alpha Vantage API Key
const API_BASE_URL = "https://www.alphavantage.co/query";

// Cache for storing fetched data to avoid redundant API calls
const cache: Record<string, { data: any; timestamp: number }> = {};
const CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutes in milliseconds

export const fetchOptionsData = async (symbol: string): Promise<OptionChain | null> => {
  try {
    // Check if we have cached data
    const cacheKey = `options_${symbol.toUpperCase()}`;
    const now = Date.now();
    
    if (cache[cacheKey] && now - cache[cacheKey].timestamp < CACHE_EXPIRY) {
      console.log("Using cached data for", symbol);
      return cache[cacheKey].data;
    }
    
    // Fetch fresh data
    const url = `${API_BASE_URL}?function=REALTIME_OPTIONS&symbol=${symbol}&require_greeks=true&apikey=${API_KEY}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`API request failed with status: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Handle error responses from Alpha Vantage
    if (data["Error Message"]) {
      throw new Error(data["Error Message"]);
    }
    
    if (data["Note"]) {
      // API limit reached
      toast.warning("API call frequency limit reached. Please try again later.");
      return null;
    }
    
    // Process the data into our expected format
    const processedData = processOptionsData(data, symbol);
    
    // Cache the processed data
    cache[cacheKey] = { 
      data: processedData,
      timestamp: now
    };
    
    return processedData;
  } catch (error) {
    console.error("Error fetching options data:", error);
    toast.error(`Failed to fetch options data: ${(error as Error).message}`);
    return null;
  }
};

// Function to process raw API data into our OptionChain format
const processOptionsData = (data: any, symbol: string): OptionChain => {
  // Add mock data for demo purposes since API might have limit
  // In a real app, we would parse the actual API response
  
  // Get today's date for demo purposes
  const today = new Date();
  
  // Generate expiration dates (weekly options for next 4 weeks)
  const expirationDates = Array.from({ length: 4 }, (_, i) => {
    const date = new Date(today);
    date.setDate(today.getDate() + ((5 - today.getDay() + 7) % 7) + (i * 7)); // Next 4 Fridays
    return date.toISOString().split('T')[0]; // Format as YYYY-MM-DD
  });
  
  // Generate mock strike prices around a base price
  const basePrice = 150; // Mock current price
  const strikes = Array.from({ length: 11 }, (_, i) => basePrice - 25 + (i * 5));
  
  // Generate calls and puts
  const generateOptions = (isCall: boolean) => {
    const options = [];
    for (const expiry of expirationDates) {
      for (const strike of strikes) {
        const daysToExpiry = Math.round((new Date(expiry).getTime() - today.getTime()) / (1000 * 3600 * 24));
        const inTheMoney = isCall ? strike < basePrice : strike > basePrice;
        const distanceFromStrike = Math.abs(strike - basePrice);
        
        // Calculate mock prices based on moneyness and days to expiry
        const lastPrice = isCall 
          ? inTheMoney ? (basePrice - strike) + (5 * Math.exp(-0.05 * daysToExpiry)) : (5 * Math.exp(-0.05 * daysToExpiry))
          : inTheMoney ? (strike - basePrice) + (5 * Math.exp(-0.05 * daysToExpiry)) : (5 * Math.exp(-0.05 * daysToExpiry));
        
        const bid = Math.max(0, lastPrice - 0.05).toFixed(2);
        const ask = (Number(bid) + 0.10).toFixed(2);
        const volume = Math.floor(10000 * Math.exp(-0.01 * distanceFromStrike - 0.03 * daysToExpiry));
        const openInterest = Math.floor(volume * 1.5);
        const impliedVolatility = (0.3 + (0.05 * Math.random())).toFixed(2);
        
        // Greeks calculations
        const delta = isCall 
          ? inTheMoney ? 0.5 + (0.5 * (1 - distanceFromStrike/50)) : 0.5 - (0.5 * (distanceFromStrike/50))
          : inTheMoney ? -0.5 - (0.5 * (1 - distanceFromStrike/50)) : -0.5 + (0.5 * (distanceFromStrike/50));
        
        const gamma = (0.04 - (0.03 * Math.min(distanceFromStrike, 25) / 25)).toFixed(4);
        const theta = (-0.03 - (0.02 * Math.random())).toFixed(4);
        const vega = (0.2 - (0.15 * distanceFromStrike / 25)).toFixed(4);
        const rho = ((isCall ? 0.05 : -0.05) * (daysToExpiry / 365)).toFixed(4);
        
        // Randomly mark some options as recommended (for demo purposes)
        const isRecommended = Math.random() < 0.1; // 10% chance
        const confidence = isRecommended ? (0.7 + (0.3 * Math.random())).toFixed(2) : undefined;
        
        options.push({
          contractSymbol: `${symbol}${expiry.replace(/-/g, '')}${isCall ? 'C' : 'P'}${String(strike).padStart(5, '0')}`,
          strike,
          expiryDate: expiry,
          lastPrice: parseFloat(lastPrice.toFixed(2)),
          bid: parseFloat(bid),
          ask: parseFloat(ask),
          change: parseFloat((Math.random() * 2 - 1).toFixed(2)),
          percentChange: parseFloat((Math.random() * 10 - 5).toFixed(2)),
          volume,
          openInterest,
          impliedVolatility: parseFloat(impliedVolatility),
          inTheMoney,
          lastTradeDate: today.toISOString().split('T')[0],
          isRecommended,
          confidence: isRecommended ? parseFloat(confidence as string) : undefined,
          delta: parseFloat(delta.toFixed(4)),
          gamma: parseFloat(gamma),
          theta: parseFloat(theta),
          vega: parseFloat(vega),
          rho: parseFloat(rho)
        });
      }
    }
    return options;
  };
  
  return {
    symbol,
    calls: generateOptions(true),
    puts: generateOptions(false),
    expirationDates,
    strikeRange: {
      min: Math.min(...strikes),
      max: Math.max(...strikes)
    },
    lastUpdate: new Date().toISOString()
  };
};

// Function to get recommendation reasons based on option contract
export const getRecommendationReasons = (option: any): string[] => {
  const reasons = [];
  
  if (option.delta && Math.abs(option.delta) > 0.5) {
    reasons.push(`High delta (${option.delta.toFixed(2)}) suggests strong directional movement opportunity`);
  }
  
  if (option.impliedVolatility > 0.3) {
    reasons.push(`Elevated implied volatility (${(option.impliedVolatility * 100).toFixed(0)}%) may provide premium selling opportunity`);
  } else if (option.impliedVolatility < 0.2) {
    reasons.push(`Low implied volatility (${(option.impliedVolatility * 100).toFixed(0)}%) may present buying opportunity before price movement`);
  }
  
  if (option.volume > 1000 && option.volume / option.openInterest > 0.3) {
    reasons.push(`High volume-to-OI ratio suggests increasing interest in this strike`);
  }
  
  if (option.gamma > 0.03) {
    reasons.push(`High gamma (${option.gamma.toFixed(4)}) indicates potential for delta acceleration`);
  }
  
  if (Math.abs(option.theta) > 0.03) {
    reasons.push(`Significant time decay (${option.theta}) should be monitored closely`);
  }
  
  return reasons.length > 0 ? reasons : ["Based on balanced risk-reward profile"];
};
