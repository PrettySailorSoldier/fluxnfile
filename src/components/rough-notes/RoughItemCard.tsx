import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { MoreVertical, Check, Trash2, Edit2, Package, ArrowRight, Loader2 } from 'lucide-react';
import { RoughItem, useUpdateRoughItem, useDeleteRoughItem } from '@/hooks/useRoughItems';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface RoughItemCardProps {
  item: RoughItem;
}

export function RoughItemCard({ item }: RoughItemCardProps) {
  const navigate = useNavigate();
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const updateRoughItem = useUpdateRoughItem();
  const deleteRoughItem = useDeleteRoughItem();

  // Edit form state
  const [editItemName, setEditItemName] = useState(item.item_name);
  const [editItemNotes, setEditItemNotes] = useState(item.item_notes || '');
  const [editQuantity, setEditQuantity] = useState(item.estimated_quantity.toString());
  const [editValue, setEditValue] = useState(item.estimated_value?.toString() || '');

  const handleToggleProcessed = async () => {
    try {
      await updateRoughItem.mutateAsync({
        id: item.id,
        is_processed: !item.is_processed,
      });
      toast.success(item.is_processed ? 'Marked as pending' : 'Marked as processed');
    } catch {
      toast.error('Failed to update item');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteRoughItem.mutateAsync(item.id);
      toast.success('Item deleted');
      setShowDeleteConfirm(false);
    } catch {
      toast.error('Failed to delete item');
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await updateRoughItem.mutateAsync({
        id: item.id,
        item_name: editItemName.trim(),
        item_notes: editItemNotes.trim() || undefined,
        estimated_quantity: parseInt(editQuantity) || 1,
        estimated_value: editValue ? parseFloat(editValue) : undefined,
      });
      toast.success('Item updated');
      setShowEditDialog(false);
    } catch {
      toast.error('Failed to update item');
    }
  };

  const handleConvertToItem = () => {
    // Navigate to add item page with pre-filled data
    const params = new URLSearchParams();
    params.set('from_rough', item.id);
    params.set('title', item.item_name);
    if (item.item_notes) params.set('notes', item.item_notes);
    if (item.estimated_value) params.set('estimated_value', item.estimated_value.toString());
    if (item.box_label) params.set('box_label', item.box_label);
    navigate(`/add?${params.toString()}`);
  };

  return (
    <>
      <Card className={`transition-all ${item.is_processed ? 'opacity-60 bg-muted/30' : ''}`}>
        <CardContent className="p-3">
          <div className="flex items-start gap-3">
            <Checkbox
              checked={item.is_processed}
              onCheckedChange={handleToggleProcessed}
              className="mt-1"
            />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={`font-medium ${item.is_processed ? 'line-through text-muted-foreground' : ''}`}
                >
                  {item.item_name}
                </span>
                {item.estimated_quantity > 1 && (
                  <Badge variant="secondary" className="text-xs">
                    x{item.estimated_quantity}
                  </Badge>
                )}
              </div>

              {item.item_notes && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                  {item.item_notes}
                </p>
              )}

              {item.estimated_value && (
                <p className="text-sm text-muted-foreground mt-1">
                  Est. ${item.estimated_value.toFixed(2)}
                </p>
              )}
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
                  <Edit2 className="w-4 h-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleToggleProcessed}>
                  <Check className="w-4 h-4 mr-2" />
                  {item.is_processed ? 'Mark Pending' : 'Mark Processed'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleConvertToItem}>
                  <ArrowRight className="w-4 h-4 mr-2" />
                  Convert to Inventory Item
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Item</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleEdit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="editItemName">Item Name</Label>
              <Input
                id="editItemName"
                value={editItemName}
                onChange={(e) => setEditItemName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="editItemNotes">Notes</Label>
              <Textarea
                id="editItemNotes"
                value={editItemNotes}
                onChange={(e) => setEditItemNotes(e.target.value)}
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="editQuantity">Quantity</Label>
                <Input
                  id="editQuantity"
                  type="number"
                  min="1"
                  value={editQuantity}
                  onChange={(e) => setEditQuantity(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editValue">Est. Value ($)</Label>
                <Input
                  id="editValue"
                  type="number"
                  min="0"
                  step="0.01"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowEditDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateRoughItem.isPending}>
                {updateRoughItem.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Save'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Item</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Are you sure you want to delete "{item.item_name}"? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteRoughItem.isPending}
            >
              {deleteRoughItem.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
