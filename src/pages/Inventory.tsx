import { Package } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export default function Inventory() {
  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold text-foreground pt-2">Inventory</h1>
      
      <Card className="bg-secondary/30 border-dashed">
        <CardContent className="py-12 text-center">
          <Package className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-semibold text-foreground mb-1">No items yet</h3>
          <p className="text-sm text-muted-foreground">
            Add your first item to get started
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
