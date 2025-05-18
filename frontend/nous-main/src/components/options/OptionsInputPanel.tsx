
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { SearchIcon, RefreshCcw } from 'lucide-react';
import { OptionsFilters, Moneyness, OptionType } from '@/types/options';

interface OptionsInputPanelProps {
  loading: boolean;
  filters: OptionsFilters;
  onFilterChange: (filters: Partial<OptionsFilters>) => void;
  onRefresh: () => void;
  expirationDates: string[];
  strikeRange: { min: number; max: number } | null;
}

export function OptionsInputPanel({
  loading,
  filters,
  onFilterChange,
  onRefresh,
  expirationDates,
  strikeRange
}: OptionsInputPanelProps) {
  const [ticker, setTicker] = useState(filters.ticker || '');
  const [minStrike, setMinStrike] = useState<number | null>(filters.minStrike);
  const [maxStrike, setMaxStrike] = useState<number | null>(filters.maxStrike);
  const displayRange = strikeRange || { min: 0, max: 100 };
  
  // Update local strike range when props change
  useEffect(() => {
    if (strikeRange) {
      if (filters.minStrike === null) setMinStrike(strikeRange.min);
      if (filters.maxStrike === null) setMaxStrike(strikeRange.max);
    }
  }, [strikeRange, filters.minStrike, filters.maxStrike]);

  const handleTickerSearch = () => {
    if (ticker && ticker.trim() !== '') {
      onFilterChange({ ticker: ticker.trim().toUpperCase() });
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleTickerSearch();
    }
  };

  const handleOptionTypeChange = (value: string) => {
    onFilterChange({ optionType: value as OptionType });
  };

  const handleExpiryChange = (value: string) => {
    onFilterChange({ expiryDate: value === "all_dates" ? null : value });
  };

  const handleStrikeRangeChange = (values: number[]) => {
    setMinStrike(values[0]);
    setMaxStrike(values[1]);
  };

  const applyStrikeRange = () => {
    onFilterChange({ minStrike, maxStrike });
  };

  const handleResetStrikeRange = () => {
    if (strikeRange) {
      setMinStrike(strikeRange.min);
      setMaxStrike(strikeRange.max);
      onFilterChange({ minStrike: strikeRange.min, maxStrike: strikeRange.max });
    }
  };

  const handleMoneynessChange = (value: string) => {
    onFilterChange({ moneyness: value as Moneyness });
  };

  return (
    <div className="p-4 bg-card rounded-lg shadow-lg">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <div className="flex flex-col space-y-2 md:col-span-2">
          <Label htmlFor="ticker" className="text-sm font-medium">
            Ticker Symbol
          </Label>
          <div className="flex w-full max-w-sm items-center space-x-2">
            <Input
              id="ticker"
              placeholder="Enter symbol (e.g. AAPL)"
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              onKeyDown={handleKeyPress}
              className="flex-1"
              autoComplete="off"
              disabled={loading}
            />
            <Button onClick={handleTickerSearch} disabled={!ticker || loading}>
              <SearchIcon className="size-4 mr-2" />
              Search
            </Button>
            <Button variant="outline" onClick={onRefresh} disabled={loading}>
              <RefreshCcw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
        
        <div className="flex flex-col space-y-2">
          <Label className="text-sm font-medium">Option Type</Label>
          <ToggleGroup
            type="single"
            value={filters.optionType}
            onValueChange={handleOptionTypeChange}
            className="justify-start border rounded-md overflow-hidden"
            disabled={loading}
          >
            <ToggleGroupItem 
              value="calls" 
              className="data-[state=on]:bg-option-call/20 data-[state=on]:text-option-call"
            >
              Calls
            </ToggleGroupItem>
            <ToggleGroupItem 
              value="puts" 
              className="data-[state=on]:bg-option-put/20 data-[state=on]:text-option-put"
            >
              Puts
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="flex flex-col space-y-2">
          <Label className="text-sm font-medium">Moneyness</Label>
          <Select 
            value={filters.moneyness} 
            onValueChange={handleMoneynessChange} 
            disabled={loading}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select moneyness" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All</SelectItem>
              <SelectItem value="ITM">In-the-Money</SelectItem>
              <SelectItem value="ATM">At-the-Money</SelectItem>
              <SelectItem value="OTM">Out-of-the-Money</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="flex flex-col space-y-2">
          <Label className="text-sm font-medium">Expiration Date</Label>
          <Select 
            value={filters.expiryDate || "all_dates"} 
            onValueChange={handleExpiryChange}
            disabled={loading || expirationDates.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select date" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all_dates">All Dates</SelectItem>
              {expirationDates.map(date => (
                <SelectItem key={date} value={date}>
                  {new Date(date).toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'short', 
                    day: 'numeric' 
                  })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex flex-col space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Strike Price Range</Label>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={applyStrikeRange}
                disabled={loading}
              >
                Apply
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleResetStrikeRange}
                disabled={loading}
              >
                Reset
              </Button>
            </div>
          </div>
          {strikeRange && (
            <div className="px-2">
              <Slider
                defaultValue={[displayRange.min, displayRange.max]}
                value={[minStrike || displayRange.min, maxStrike || displayRange.max]}
                max={displayRange.max}
                min={displayRange.min}
                step={(displayRange.max - displayRange.min) / 20}
                onValueChange={handleStrikeRangeChange}
                disabled={loading}
              />
              <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                <span>{minStrike !== null ? minStrike.toFixed(2) : displayRange.min.toFixed(2)}</span>
                <span>{maxStrike !== null ? maxStrike.toFixed(2) : displayRange.max.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
      
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          <Switch 
            id="recommendations" 
            checked={filters.showRecommendationsOnly}
            onCheckedChange={(checked) => onFilterChange({ showRecommendationsOnly: checked })}
            disabled={loading}
          />
          <Label htmlFor="recommendations" className="text-sm">
            Show Recommendations Only
          </Label>
        </div>
        
        <div className="flex items-center space-x-2">
          <Switch 
            id="volume" 
            checked={!!filters.minVolume}
            onCheckedChange={(checked) => onFilterChange({ minVolume: checked ? 100 : null })}
            disabled={loading}
          />
          <Label htmlFor="volume" className="text-sm">
            Hide Low Volume (&lt;100)
          </Label>
        </div>
      </div>
    </div>
  );
}
