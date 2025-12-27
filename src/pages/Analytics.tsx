import { BarChart3 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export default function Analytics() {
  return (
    <div className="p-4 space-y-4">
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
