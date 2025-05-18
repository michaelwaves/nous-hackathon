
import { useState, useEffect } from 'react';
import { OptionsInputPanel } from '@/components/options/OptionsInputPanel';
import { OptionsTable } from '@/components/options/OptionsTable';
import { OptionsStats } from '@/components/options/OptionsStats';
import { fetchOptionsData } from '@/services/optionsAPI';
import { OptionChain, OptionsFilters, Moneyness, OptionType } from '@/types/options';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const Options = () => {
  const [loading, setLoading] = useState(false);
  const [optionChain, setOptionChain] = useState<OptionChain | null>(null);
  const [filters, setFilters] = useState<OptionsFilters>({
    ticker: 'AAPL', // Default ticker
    optionType: 'calls',
    expiryDate: null,
    minStrike: null,
    maxStrike: null,
    moneyness: 'ALL',
    minVolume: null,
    showRecommendationsOnly: false
  });

  // Fetch options data when ticker changes
  useEffect(() => {
    if (filters.ticker) {
      loadOptionsData(filters.ticker);
    }
  }, [filters.ticker]);

  // Load options data
  const loadOptionsData = async (symbol: string) => {
    setLoading(true);
    try {
      const data = await fetchOptionsData(symbol);
      setOptionChain(data);
    } catch (error) {
      console.error('Error loading options data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle filter changes
  const handleFilterChange = (newFilters: Partial<OptionsFilters>) => {
    setFilters({ ...filters, ...newFilters });
  };

  // Handle refresh button click
  const handleRefresh = () => {
    if (filters.ticker) {
      loadOptionsData(filters.ticker);
    }
  };

  // Get filtered options
  const getFilteredOptions = () => {
    if (!optionChain) return [];
    
    let filteredOptions = optionChain[filters.optionType];
    
    // Filter by expiration date
    if (filters.expiryDate) {
      filteredOptions = filteredOptions.filter(option => option.expiryDate === filters.expiryDate);
    }
    
    // Filter by strike price range
    if (filters.minStrike !== null) {
      filteredOptions = filteredOptions.filter(option => option.strike >= filters.minStrike!);
    }
    
    if (filters.maxStrike !== null) {
      filteredOptions = filteredOptions.filter(option => option.strike <= filters.maxStrike!);
    }
    
    // Filter by moneyness
    if (filters.moneyness !== 'ALL') {
      switch (filters.moneyness) {
        case 'ITM':
          filteredOptions = filteredOptions.filter(option => option.inTheMoney);
          break;
        case 'OTM':
          filteredOptions = filteredOptions.filter(option => !option.inTheMoney);
          break;
        // For 'ATM', get options within 2% of current price (approximation)
        case 'ATM':
          if (optionChain.strikeRange) {
            const midPrice = (optionChain.strikeRange.min + optionChain.strikeRange.max) / 2;
            const range = midPrice * 0.02;
            filteredOptions = filteredOptions.filter(
              option => option.strike >= midPrice - range && option.strike <= midPrice + range
            );
          }
          break;
      }
    }
    
    // Filter by minimum volume
    if (filters.minVolume !== null) {
      filteredOptions = filteredOptions.filter(option => option.volume >= filters.minVolume!);
    }
    
    // Filter to show recommendations only
    if (filters.showRecommendationsOnly) {
      filteredOptions = filteredOptions.filter(option => option.isRecommended);
    }
    
    return filteredOptions;
  };

  const filteredOptions = getFilteredOptions();
  const expirationDates = optionChain?.expirationDates || [];

  return (
    <div className="container mx-auto p-4">
      <div className="mb-6 mt-2">
        <h1 className="text-3xl font-bold">Options Analysis</h1>
        <p className="text-muted-foreground">
          Analyze options data and get AI model recommendations
        </p>
      </div>
      
      <div className="space-y-6">
        <OptionsInputPanel
          loading={loading}
          filters={filters}
          onFilterChange={handleFilterChange}
          onRefresh={handleRefresh}
          expirationDates={expirationDates}
          strikeRange={optionChain?.strikeRange || null}
        />
        
        <Tabs defaultValue="chains" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="chains">Option Chains</TabsTrigger>
            <TabsTrigger value="analysis">Analysis</TabsTrigger>
          </TabsList>
          
          <TabsContent value="chains" className="m-0">
            <OptionsTable
              options={filteredOptions}
              filters={filters}
              loading={loading}
            />
          </TabsContent>
          
          <TabsContent value="analysis" className="m-0">
            <OptionsStats optionChain={optionChain} />
          </TabsContent>
        </Tabs>

        <div className="text-xs text-muted-foreground mt-6">
          <p>Data provided by Alpha Vantage API. For demo purposes, some data may be simulated.</p>
        </div>
      </div>
    </div>
  );
};

export default Options;
