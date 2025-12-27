import { Camera } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function AddItem() {
  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold text-foreground pt-2">Add Item</h1>
      
      <Card className="bg-secondary/30 border-dashed">
        <CardContent className="py-12 text-center">
          <Camera className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-semibold text-foreground mb-1">Quick Add</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Take a photo to start adding an item
          </p>
          <Button className="bg-primary text-primary-foreground">
            <Camera className="w-4 h-4 mr-2" />
            Take Photo
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
