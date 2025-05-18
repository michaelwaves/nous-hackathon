
import React, { useState } from 'react';
import { OptionContract, OptionsFilters } from '@/types/options';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getRecommendationReasons } from '@/services/optionsAPI';
import { ChevronDown, ChevronUp, Info } from 'lucide-react';

interface OptionsTableProps {
  options: OptionContract[];
  filters: OptionsFilters;
  loading: boolean;
}

export function OptionsTable({ options, filters, loading }: OptionsTableProps) {
  const [sortConfig, setSortConfig] = useState<{ key: keyof OptionContract; direction: 'asc' | 'desc' } | null>(
    { key: 'strike', direction: 'asc' }
  );
  const [expandedContract, setExpandedContract] = useState<string | null>(null);

  // Handle sorting
  const requestSort = (key: keyof OptionContract) => {
    let direction: 'asc' | 'desc' = 'asc';
    
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    
    setSortConfig({ key, direction });
  };

  const toggleExpand = (contractSymbol: string) => {
    setExpandedContract(expandedContract === contractSymbol ? null : contractSymbol);
  };

  // Get sorted options
  const getSortedOptions = () => {
    const sortableOptions = [...options];
    
    if (sortConfig !== null) {
      sortableOptions.sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];
        
        if (aValue === undefined || bValue === undefined) return 0;
        
        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    
    return sortableOptions;
  };

  // Format values for display
  const formatValue = (value: number | undefined, type: 'price' | 'percent' | 'numeric' | 'delta') => {
    if (value === undefined || value === null) return 'N/A';
    
    switch (type) {
      case 'price':
        return `$${value.toFixed(2)}`;
      case 'percent':
        return `${value.toFixed(2)}%`;
      case 'delta':
        return value.toFixed(4);
      default:
        return value.toString();
    }
  };

  const getColumnClassName = (key: keyof OptionContract, value: any) => {
    // Basic className
    let className = '';
    
    // Add color for price changes
    if (key === 'change' || key === 'percentChange') {
      className += value > 0 
        ? ' text-profit font-medium' 
        : value < 0 
          ? ' text-loss font-medium'
          : '';
    }
    
    return className;
  };
  
  // Sort icon display
  const getSortDirectionIcon = (key: keyof OptionContract) => {
    if (!sortConfig || sortConfig.key !== key) {
      return null;
    }
    return sortConfig.direction === 'asc' ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />;
  };

  const columnConfig = [
    { key: 'strike', label: 'Strike', type: 'price' as const, sortable: true },
    { key: 'expiryDate', label: 'Expiry', type: 'text' as const, sortable: true },
    { key: 'lastPrice', label: 'Last', type: 'price' as const, sortable: true },
    { key: 'bid', label: 'Bid', type: 'price' as const, sortable: true },
    { key: 'ask', label: 'Ask', type: 'price' as const, sortable: true },
    { key: 'change', label: 'Change', type: 'price' as const, sortable: true },
    { key: 'percentChange', label: '% Chg', type: 'percent' as const, sortable: true },
    { key: 'volume', label: 'Volume', type: 'numeric' as const, sortable: true },
    { key: 'openInterest', label: 'OI', type: 'numeric' as const, sortable: true },
    { key: 'impliedVolatility', label: 'IV', type: 'percent' as const, sortable: true },
    { key: 'delta', label: 'Delta', type: 'delta' as const, sortable: true },
    { key: 'gamma', label: 'Gamma', type: 'delta' as const, sortable: false },
    { key: 'theta', label: 'Theta', type: 'delta' as const, sortable: false },
    { key: 'vega', label: 'Vega', type: 'delta' as const, sortable: false }
  ];

  const sortedOptions = getSortedOptions();

  return (
    <div className="relative overflow-hidden rounded-lg border bg-card">
      <ScrollArea className="h-[calc(100vh-350px)] thin-scrollbar">
        <div className="relative w-full overflow-auto">
          <table className="w-full options-table">
            <thead>
              <tr className="bg-muted/50">
                <th className="sticky top-0 bg-muted/50 z-10 text-left text-xs font-medium"></th>
                {columnConfig.map((column) => (
                  <th 
                    key={String(column.key)}
                    className={`sticky top-0 bg-muted/50 z-10 text-left text-xs font-medium ${column.sortable ? 'cursor-pointer hover:bg-muted' : ''}`}
                    onClick={() => column.sortable && requestSort(column.key as keyof OptionContract)}
                  >
                    <div className="flex items-center gap-1">
                      {column.label}
                      {column.sortable && getSortDirectionIcon(column.key as keyof OptionContract)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={columnConfig.length + 1} className="py-4 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                      <span>Loading options data...</span>
                    </div>
                  </td>
                </tr>
              ) : sortedOptions.length === 0 ? (
                <tr>
                  <td colSpan={columnConfig.length + 1} className="py-4 text-center text-muted-foreground">
                    No options contracts available with the selected filters.
                  </td>
                </tr>
              ) : (
                sortedOptions.map((option) => {
                  const isExpanded = expandedContract === option.contractSymbol;
                  const recommendationReasons = option.isRecommended ? getRecommendationReasons(option) : [];
                  
                  return (
                    <React.Fragment key={option.contractSymbol}>
                      <tr 
                        className={`
                          border-b border-muted/30 transition-colors
                          ${option.isRecommended ? 'bg-option-highlight' : ''}
                          ${isExpanded ? 'bg-secondary/70' : ''}
                        `}
                      >
                        <td className="text-left align-middle">
                          <div className="flex items-center">
                            {option.isRecommended && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge variant="outline" className="border-neutral text-neutral py-0 h-5">
                                      <span className="flex items-center gap-1">
                                        <span className="text-xs">RL</span>
                                        <span className="text-[0.65rem]">
                                          {option.confidence !== undefined
                                            ? `${(Number(option.confidence) * 100).toFixed(0)}%`
                                            : ''}
                                        </span>
                                      </span>
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent side="right">
                                    <p className="font-medium text-xs">AI Model Recommendation</p>
                                    <p className="text-muted-foreground text-xs">{recommendationReasons[0]}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6 rounded-full ml-1" 
                              onClick={() => toggleExpand(option.contractSymbol)}
                            >
                              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            </Button>
                          </div>
                        </td>
                        {columnConfig.map((column) => (
                          <td 
                            key={`${option.contractSymbol}-${String(column.key)}`}
                            className={`text-xs ${getColumnClassName(column.key as keyof OptionContract, option[column.key as keyof OptionContract])}`}
                          >
                            {column.key === 'expiryDate' 
                              ? new Date(option.expiryDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                              : formatValue(option[column.key as keyof OptionContract] as number, column.type === 'text' ? 'numeric' : column.type)}
                          </td>
                        ))}
                      </tr>
                      {isExpanded && (
                        <tr className="bg-secondary/30 border-b">
                          <td colSpan={columnConfig.length + 1} className="p-2">
                            <div className="text-xs p-2 rounded bg-card/50">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div>
                                  <h4 className="font-medium mb-1 flex items-center gap-1">
                                    Contract Details
                                    <Info className="h-3 w-3 text-muted-foreground" />
                                  </h4>
                                  <p><span className="text-muted-foreground">Symbol:</span> {option.contractSymbol}</p>
                                  <p>
                                    <span className="text-muted-foreground">Type:</span> {filters.optionType === 'calls' ? 'Call' : 'Put'}
                                  </p>
                                  <p>
                                    <span className="text-muted-foreground">Moneyness:</span> {option.inTheMoney ? 'In-the-Money' : 'Out-of-the-Money'}
                                  </p>
                                </div>
                                
                                {option.isRecommended && (
                                  <div>
                                    <h4 className="font-medium mb-1 flex items-center gap-1">
                                      AI Model Analysis
                                    </h4>
                                    <ul className="list-disc pl-4 space-y-1">
                                      {recommendationReasons.map((reason, idx) => (
                                        <li key={idx} className="text-muted-foreground">{reason}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </ScrollArea>
    </div>
  );
}
