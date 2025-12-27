import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, DollarSign, TrendingUp, Clock } from 'lucide-react';

export default function Dashboard() {
  const { team, profile } = useAuth();

  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="pt-2">
        <h1 className="text-2xl font-bold text-foreground">
          {profile?.full_name ? `Hi, ${profile.full_name.split(' ')[0]}!` : 'Dashboard'}
        </h1>
        <p className="text-muted-foreground text-sm">{team?.name}</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-card">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Package className="w-4 h-4" />
              Inventory
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold">0</p>
            <p className="text-xs text-muted-foreground">items</p>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Value
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold">$0</p>
            <p className="text-xs text-muted-foreground">total cost</p>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Profit
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold text-success">$0</p>
            <p className="text-xs text-muted-foreground">this month</p>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Listed
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-2xl font-bold">0</p>
            <p className="text-xs text-muted-foreground">active</p>
          </CardContent>
        </Card>
      </div>

      {/* Empty State */}
      <Card className="bg-secondary/30 border-dashed">
        <CardContent className="py-8 text-center">
          <Package className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-semibold text-foreground mb-1">No items yet</h3>
          <p className="text-sm text-muted-foreground">
            Tap the + button to add your first item
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
