import { useItems, calculateProfit, statusConfig, ItemStatus } from '@/hooks/useInventory';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, TrendingUp, TrendingDown, Package, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Analytics() {
  const { data: items = [], isLoading } = useItems();

  // Calculate overall stats
  const soldItems = items.filter(i => ['sold', 'shipped'].includes(i.status));
  const totalRevenue = soldItems.reduce((sum, i) => sum + (i.actual_price || 0), 0);
  const totalProfit = soldItems.reduce((sum, i) => {
    const { netProfit } = calculateProfit(i);
    return sum + netProfit;
  }, 0);
  const totalCost = soldItems.reduce((sum, i) => sum + i.original_cost, 0);
  const overallMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  const avgProfitPerItem = soldItems.length > 0 ? totalProfit / soldItems.length : 0;

  // Status breakdown
  const statusCounts = items.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Category performance
  const categoryStats = items.reduce((acc, item) => {
    const catName = item.category?.name || 'Uncategorized';
    if (!acc[catName]) {
      acc[catName] = { count: 0, cost: 0, revenue: 0, profit: 0 };
    }
    acc[catName].count++;
    acc[catName].cost += item.original_cost;
    if (['sold', 'shipped'].includes(item.status)) {
      acc[catName].revenue += item.actual_price || 0;
      const { netProfit } = calculateProfit(item);
      acc[catName].profit += netProfit;
    }
    return acc;
  }, {} as Record<string, { count: number; cost: number; revenue: number; profit: number }>);

  const topCategories = Object.entries(categoryStats)
    .sort((a, b) => b[1].profit - a[1].profit)
    .slice(0, 5);

  // Source performance
  const sourceStats = items.reduce((acc, item) => {
    const source = item.acquisition_source || 'Unknown';
    if (!acc[source]) {
      acc[source] = { count: 0, cost: 0, profit: 0 };
    }
    acc[source].count++;
    acc[source].cost += item.original_cost;
    if (['sold', 'shipped'].includes(item.status)) {
      const { netProfit } = calculateProfit(item);
      acc[source].profit += netProfit;
    }
    return acc;
  }, {} as Record<string, { count: number; cost: number; profit: number }>);

  const topSources = Object.entries(sourceStats)
    .sort((a, b) => b[1].profit - a[1].profit)
    .slice(0, 5);

  if (items.length === 0) {
    return (
      <div className="p-4 space-y-4 pb-24">
        <h1 className="text-2xl font-bold text-foreground pt-2">Analytics</h1>
        
        <Card className="bg-secondary/30 border-dashed">
          <CardContent className="py-12 text-center">
            <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-semibold text-foreground mb-1">No data yet</h3>
            <p className="text-sm text-muted-foreground">
              Add items and make sales to see analytics
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 pb-24">
      <h1 className="text-2xl font-bold text-foreground pt-2">Analytics</h1>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <DollarSign className="w-4 h-4" />
              <span className="text-xs">Total Revenue</span>
            </div>
            <p className="text-xl font-bold">${totalRevenue.toFixed(0)}</p>
            <p className="text-xs text-muted-foreground">{soldItems.length} sales</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              {totalProfit >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <span className="text-xs">Total Profit</span>
            </div>
            <p className={cn(
              'text-xl font-bold',
              totalProfit >= 0 ? 'text-success' : 'text-destructive'
            )}>
              {totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(0)}
            </p>
            <p className="text-xs text-muted-foreground">{overallMargin.toFixed(0)}% margin</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Package className="w-4 h-4" />
              <span className="text-xs">Avg per Item</span>
            </div>
            <p className={cn(
              'text-xl font-bold',
              avgProfitPerItem >= 0 ? 'text-success' : 'text-destructive'
            )}>
              {avgProfitPerItem >= 0 ? '+' : ''}${avgProfitPerItem.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">net profit</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <BarChart3 className="w-4 h-4" />
              <span className="text-xs">Total Items</span>
            </div>
            <p className="text-xl font-bold">{items.length}</p>
            <p className="text-xs text-muted-foreground">all time</p>
          </CardContent>
        </Card>
      </div>

      {/* Status Breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Inventory by Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {(Object.keys(statusConfig) as ItemStatus[]).map((status) => {
              const count = statusCounts[status] || 0;
              const percentage = items.length > 0 ? (count / items.length) * 100 : 0;
              
              return (
                <div key={status} className="flex items-center gap-3">
                  <div className={cn(
                    'w-3 h-3 rounded-full',
                    statusConfig[status].className
                  )} />
                  <span className="text-sm flex-1">{statusConfig[status].label}</span>
                  <span className="text-sm font-medium">{count}</span>
                  <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className={cn('h-full', statusConfig[status].className)}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Top Categories */}
      {topCategories.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Top Categories by Profit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topCategories.map(([name, stats], index) => (
                <div key={name} className="flex items-center gap-3">
                  <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-medium">
                    {index + 1}
                  </span>
                  <span className="text-sm flex-1 truncate">{name}</span>
                  <span className="text-xs text-muted-foreground">{stats.count} items</span>
                  <span className={cn(
                    'text-sm font-medium',
                    stats.profit >= 0 ? 'text-success' : 'text-destructive'
                  )}>
                    {stats.profit >= 0 ? '+' : ''}${stats.profit.toFixed(0)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top Sources */}
      {topSources.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Top Sources by Profit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topSources.map(([name, stats], index) => (
                <div key={name} className="flex items-center gap-3">
                  <span className="w-5 h-5 rounded-full bg-accent/20 text-accent text-xs flex items-center justify-center font-medium">
                    {index + 1}
                  </span>
                  <span className="text-sm flex-1 truncate">{name}</span>
                  <span className="text-xs text-muted-foreground">{stats.count} items</span>
                  <span className={cn(
                    'text-sm font-medium',
                    stats.profit >= 0 ? 'text-success' : 'text-destructive'
                  )}>
                    {stats.profit >= 0 ? '+' : ''}${stats.profit.toFixed(0)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
