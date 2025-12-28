import { useItems, calculateProfit } from '@/hooks/useInventory';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, DollarSign, TrendingUp, Clock, AlertCircle, CheckCircle2, Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { statusConfig } from '@/hooks/useInventory';
import { cn } from '@/lib/utils';

export default function Dashboard() {
  const navigate = useNavigate();
  const { team, profile } = useAuth();
  const { data: items = [], isLoading } = useItems();

  // Calculate metrics
  const inventoryCount = items.filter(i => !['sold', 'shipped'].includes(i.status)).length;
  const inventoryValue = items
    .filter(i => !['sold', 'shipped'].includes(i.status))
    .reduce((sum, i) => sum + i.original_cost, 0);
  
  const soldItems = items.filter(i => ['sold', 'shipped'].includes(i.status));
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  
  const thisMonthSales = soldItems.filter(i => 
    i.sale_date && new Date(i.sale_date) >= monthStart
  );
  
  const monthlyProfit = thisMonthSales.reduce((sum, i) => {
    const { netProfit } = calculateProfit(i);
    return sum + netProfit;
  }, 0);

  const listedCount = items.filter(i => i.status === 'listed').length;

  // Items needing attention
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const staleItems = items.filter(i => 
    i.status === 'listed' && 
    new Date(i.created_at) < thirtyDaysAgo
  );

  const readyToList = items.filter(i => i.status === 'ready_to_list');
  const recentItems = items.slice(0, 5);

  return (
    <div className="p-4 space-y-6 pb-24">
      {/* Header */}
      <div className="pt-2">
        <h1 className="text-2xl font-bold text-foreground">
          {profile?.full_name ? `Hi, ${profile.full_name.split(' ')[0]}!` : 'Dashboard'}
        </h1>
        <p className="text-muted-foreground text-sm">{team?.name}</p>
      </div>

      {/* Quick Add Button */}
      <Button
        onClick={() => navigate('/add')}
        className="w-full"
        size="lg"
      >
        <Plus className="w-5 h-5 mr-2" />
        Add New Item
      </Button>

      {/* Quick Stats - Clickable */}
      <div className="grid grid-cols-2 gap-3">
        <Card
          className="bg-card cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => navigate('/inventory')}
        >
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Package className="w-4 h-4" />
              Inventory
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold">{inventoryCount}</p>
            <p className="text-xs text-muted-foreground">items</p>
          </CardContent>
        </Card>

        <Card
          className="bg-card cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => navigate('/analytics')}
        >
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Value
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold">${inventoryValue.toFixed(0)}</p>
            <p className="text-xs text-muted-foreground">total cost</p>
          </CardContent>
        </Card>

        <Card
          className="bg-card cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => navigate('/inventory?status=sold')}
        >
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Profit
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className={cn(
              'text-2xl font-bold',
              monthlyProfit >= 0 ? 'text-success' : 'text-destructive'
            )}>
              {monthlyProfit >= 0 ? '+' : ''}${monthlyProfit.toFixed(0)}
            </p>
            <p className="text-xs text-muted-foreground">this month</p>
          </CardContent>
        </Card>

        <Card
          className="bg-card cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => navigate('/inventory?status=listed')}
        >
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Listed
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold">{listedCount}</p>
            <p className="text-xs text-muted-foreground">active</p>
          </CardContent>
        </Card>
      </div>

      {/* Alerts */}
      {(staleItems.length > 0 || readyToList.length > 0) && (
        <div className="space-y-2">
          {readyToList.length > 0 && (
            <Link to="/inventory?status=ready_to_list">
              <Card className="bg-status-ready/20 border-status-ready/30">
                <CardContent className="p-3 flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-foreground" />
                  <div className="flex-1">
                    <p className="font-medium text-sm">{readyToList.length} items ready to list</p>
                    <p className="text-xs text-muted-foreground">Tap to view</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}
          {staleItems.length > 0 && (
            <Card className="bg-warning/20 border-warning/30">
              <CardContent className="p-3 flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-foreground" />
                <div className="flex-1">
                  <p className="font-medium text-sm">{staleItems.length} items listed 30+ days</p>
                  <p className="text-xs text-muted-foreground">Consider repricing</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Recent Items */}
      {recentItems.length > 0 ? (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Recent Items</h2>
            <Link to="/inventory" className="text-sm text-primary">View all</Link>
          </div>
          <div className="space-y-2">
            {recentItems.map((item) => (
              <Link key={item.id} to={`/item/${item.id}`}>
                <Card className="hover:shadow-sm transition-shadow">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                      {item.photos?.[0] ? (
                        <img src={item.photos[0]} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="w-4 h-4 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {item.title || item.category?.name || 'Untitled'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        ${item.original_cost.toFixed(2)}
                      </p>
                    </div>
                    <Badge variant="secondary" className={cn('text-xs', statusConfig[item.status].className)}>
                      {statusConfig[item.status].label}
                    </Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <Card className="bg-secondary/30 border-dashed">
          <CardContent className="py-8 text-center">
            <Package className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-semibold text-foreground mb-1">No items yet</h3>
            <p className="text-sm text-muted-foreground">
              Tap the + button to add your first item
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
