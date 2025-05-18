
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OptionChain } from "@/types/options";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface OptionsStatsProps {
  optionChain: OptionChain | null;
}

export function OptionsStats({ optionChain }: OptionsStatsProps) {
  if (!optionChain) return null;
  
  // Calculate some basic stats from the options data
  const currentOptionType = "calls"; // Default to calls for this example
  const options = optionChain[currentOptionType];
  
  // Volume by expiration data
  const volumeByExpiry = optionChain.expirationDates.map(date => {
    const optionsForDate = options.filter(opt => opt.expiryDate === date);
    const totalVolume = optionsForDate.reduce((sum, opt) => sum + opt.volume, 0);
    
    return {
      date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      volume: totalVolume
    };
  });
  
  // Volume by strike data
  const strikeRange = optionChain.strikeRange;
  const strikeInterval = Math.ceil((strikeRange.max - strikeRange.min) / 10);
  const volumeByStrike = Array.from({ length: 10 }, (_, i) => {
    const minStrike = strikeRange.min + (i * strikeInterval);
    const maxStrike = minStrike + strikeInterval;
    const optionsInRange = options.filter(opt => opt.strike >= minStrike && opt.strike < maxStrike);
    const totalVolume = optionsInRange.reduce((sum, opt) => sum + opt.volume, 0);
    
    return {
      strikeRange: `${minStrike}-${maxStrike}`,
      volume: totalVolume
    };
  });

  // Most active options
  const mostActiveOptions = [...options]
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 5);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card className="bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Volume by Expiration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={volumeByExpiry}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="volumeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="date" 
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} 
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                  tickLine={{ stroke: 'hsl(var(--border))' }}
                />
                <YAxis 
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} 
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                  tickLine={{ stroke: 'hsl(var(--border))' }}
                />
                <Tooltip
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    borderColor: 'hsl(var(--border))',
                    fontSize: '12px'
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="volume" 
                  stroke="hsl(var(--primary))" 
                  fillOpacity={1}
                  fill="url(#volumeGradient)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
      
      <Card className="bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Volume by Strike</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={volumeByStrike}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="strikeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--accent))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="strikeRange" 
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} 
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                  tickLine={{ stroke: 'hsl(var(--border))' }}
                />
                <YAxis 
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} 
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                  tickLine={{ stroke: 'hsl(var(--border))' }}
                />
                <Tooltip
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    borderColor: 'hsl(var(--border))',
                    fontSize: '12px'
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="volume" 
                  stroke="hsl(var(--accent))" 
                  fillOpacity={1}
                  fill="url(#strikeGradient)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Most Active Options</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto thin-scrollbar">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-border">
                  <th className="pb-2 font-medium text-muted-foreground">Strike</th>
                  <th className="pb-2 font-medium text-muted-foreground">Expiry</th>
                  <th className="pb-2 font-medium text-muted-foreground">Last</th>
                  <th className="pb-2 font-medium text-muted-foreground">Volume</th>
                  <th className="pb-2 font-medium text-muted-foreground">IV</th>
                  <th className="pb-2 font-medium text-muted-foreground">Delta</th>
                </tr>
              </thead>
              <tbody>
                {mostActiveOptions.map(option => (
                  <tr key={option.contractSymbol} className="hover:bg-muted/20">
                    <td className="py-1.5">${option.strike}</td>
                    <td className="py-1.5">
                      {new Date(option.expiryDate).toLocaleDateString('en-US', { 
                        month: 'short', 
                        day: 'numeric' 
                      })}
                    </td>
                    <td className="py-1.5">${option.lastPrice.toFixed(2)}</td>
                    <td className="py-1.5">{option.volume.toLocaleString()}</td>
                    <td className="py-1.5">{(option.impliedVolatility * 100).toFixed(1)}%</td>
                    <td className="py-1.5">{option.delta?.toFixed(3) || 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
