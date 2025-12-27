import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useItems, statusConfig, calculateProfit, getProfitLevel, ItemStatus } from '@/hooks/useInventory';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Package, Search, Filter, ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Inventory() {
  const { data: items = [], isLoading } = useItems();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredItems = items.filter((item) => {
    const matchesSearch = !search || 
      item.title?.toLowerCase().includes(search.toLowerCase()) ||
      item.category?.name?.toLowerCase().includes(search.toLowerCase()) ||
      item.acquisition_source?.toLowerCase().includes(search.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Status counts for filter badges
  const statusCounts = items.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (isLoading) {
    return (
      <div className="p-4 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 pb-24">
      <h1 className="text-2xl font-bold text-foreground pt-2">Inventory</h1>

      {/* Search and Filter */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ({items.length})</SelectItem>
            {(Object.keys(statusConfig) as ItemStatus[]).map((status) => (
              <SelectItem key={status} value={status}>
                {statusConfig[status].label} ({statusCounts[status] || 0})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Items List */}
      {filteredItems.length === 0 ? (
        <Card className="bg-secondary/30 border-dashed">
          <CardContent className="py-12 text-center">
            <Package className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-semibold text-foreground mb-1">
              {items.length === 0 ? 'No items yet' : 'No matching items'}
            </h3>
            <p className="text-sm text-muted-foreground">
              {items.length === 0 
                ? 'Add your first item to get started'
                : 'Try adjusting your search or filters'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => {
            const { netProfit, margin } = calculateProfit(item);
            const profitLevel = getProfitLevel(margin);
            const displayPrice = item.actual_price || item.target_price;

            return (
              <Link key={item.id} to={`/item/${item.id}`}>
                <Card className="hover:shadow-md transition-shadow">
                  <CardContent className="p-3">
                    <div className="flex gap-3">
                      {/* Photo or placeholder */}
                      <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                        {item.photos && item.photos.length > 0 ? (
                          <img
                            src={item.photos[0]}
                            alt={item.title || 'Item'}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package className="w-6 h-6 text-muted-foreground" />
                          </div>
                        )}
                      </div>

                      {/* Item details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="font-medium text-foreground truncate">
                              {item.title || item.category?.name || 'Untitled Item'}
                            </h3>
                            <p className="text-xs text-muted-foreground">
                              {item.category?.name}
                              {item.storage_location && ` • ${item.storage_location.name}`}
                            </p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                        </div>

                        <div className="flex items-center gap-2 mt-2">
                          <Badge 
                            variant="secondary" 
                            className={cn('text-xs', statusConfig[item.status].className)}
                          >
                            {statusConfig[item.status].label}
                          </Badge>
                          
                          <div className="flex-1 text-right">
                            <span className="text-sm text-muted-foreground">
                              ${item.original_cost.toFixed(2)}
                            </span>
                            {displayPrice && (
                              <>
                                <span className="text-muted-foreground mx-1">→</span>
                                <span className="text-sm font-medium">
                                  ${displayPrice.toFixed(2)}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        {displayPrice && (
                          <div className="mt-1 text-right">
                            <Badge 
                              variant="secondary"
                              className={cn(
                                'text-xs',
                                profitLevel === 'loss' && 'profit-loss',
                                profitLevel === 'low' && 'profit-low',
                                profitLevel === 'good' && 'profit-good',
                                profitLevel === 'high' && 'profit-high'
                              )}
                            >
                              {netProfit >= 0 ? '+' : ''}${netProfit.toFixed(2)} ({margin.toFixed(0)}%)
                            </Badge>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
