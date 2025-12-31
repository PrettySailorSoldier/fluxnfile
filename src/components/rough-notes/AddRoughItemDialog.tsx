import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useCreateRoughItem, useBoxLabels } from '@/hooks/useRoughItems';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface AddRoughItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultBoxLabel?: string;
}

export function AddRoughItemDialog({ open, onOpenChange, defaultBoxLabel }: AddRoughItemDialogProps) {
  const [boxLabel, setBoxLabel] = useState(defaultBoxLabel || '');
  const [boxDescription, setBoxDescription] = useState('');
  const [itemName, setItemName] = useState('');
  const [itemNotes, setItemNotes] = useState('');
  const [estimatedQuantity, setEstimatedQuantity] = useState('1');
  const [estimatedValue, setEstimatedValue] = useState('');

  const existingBoxLabels = useBoxLabels();
  const createRoughItem = useCreateRoughItem();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!boxLabel.trim() || !itemName.trim()) {
      toast.error('Box label and item name are required');
      return;
    }

    try {
      await createRoughItem.mutateAsync({
        box_label: boxLabel.trim(),
        box_description: boxDescription.trim() || undefined,
        item_name: itemName.trim(),
        item_notes: itemNotes.trim() || undefined,
        estimated_quantity: parseInt(estimatedQuantity) || 1,
        estimated_value: estimatedValue ? parseFloat(estimatedValue) : undefined,
      });

      toast.success('Item added to rough notes');

      // Reset form but keep box label for quick entry of multiple items
      setItemName('');
      setItemNotes('');
      setEstimatedQuantity('1');
      setEstimatedValue('');
    } catch (error) {
      toast.error('Failed to add item');
    }
  };

  const handleClose = () => {
    setBoxLabel(defaultBoxLabel || '');
    setBoxDescription('');
    setItemName('');
    setItemNotes('');
    setEstimatedQuantity('1');
    setEstimatedValue('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Rough Item</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="boxLabel">Box Label *</Label>
            <Input
              id="boxLabel"
              placeholder="e.g., Box A, Kitchen Stuff, Garage 1"
              value={boxLabel}
              onChange={(e) => setBoxLabel(e.target.value)}
              list="box-labels"
            />
            {existingBoxLabels.length > 0 && (
              <datalist id="box-labels">
                {existingBoxLabels.map((label) => (
                  <option key={label} value={label} />
                ))}
              </datalist>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="boxDescription">Box Description</Label>
            <Input
              id="boxDescription"
              placeholder="e.g., Blue tote near garage door"
              value={boxDescription}
              onChange={(e) => setBoxDescription(e.target.value)}
            />
          </div>

          <div className="border-t pt-4">
            <div className="space-y-2">
              <Label htmlFor="itemName">Item Name *</Label>
              <Input
                id="itemName"
                placeholder="e.g., Coffee maker, Blue sweater"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                autoFocus
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="itemNotes">Notes</Label>
            <Textarea
              id="itemNotes"
              placeholder="Any quick notes about the item..."
              value={itemNotes}
              onChange={(e) => setItemNotes(e.target.value)}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="estimatedQuantity">Quantity</Label>
              <Input
                id="estimatedQuantity"
                type="number"
                min="1"
                value={estimatedQuantity}
                onChange={(e) => setEstimatedQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="estimatedValue">Est. Value ($)</Label>
              <Input
                id="estimatedValue"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={estimatedValue}
                onChange={(e) => setEstimatedValue(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Done
            </Button>
            <Button type="submit" disabled={createRoughItem.isPending}>
              {createRoughItem.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Item'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
