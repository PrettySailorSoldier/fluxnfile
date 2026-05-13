import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Item, ItemStatus, statusConfig, useStorageLocations, calculateProfit } from '@/hooks/useInventory';

interface QuickEditSheetProps {
  item: Item | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function QuickEditSheet({ item, open, onClose, onSaved }: QuickEditSheetProps) {
  const navigate = useNavigate();
  const { data: storageLocations = [] } = useStorageLocations();

  const [status, setStatus] = useState<ItemStatus>('acquired');
  const [targetPrice, setTargetPrice] = useState('');
  const [actualPrice, setActualPrice] = useState('');
  const [storageLocationId, setStorageLocationId] = useState('');
  const [quickNote, setQuickNote] = useState('');
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (!item) return;
    setStatus(item.status);
    setTargetPrice(item.target_price != null ? String(item.target_price) : '');
    setActualPrice(item.actual_price != null ? String(item.actual_price) : '');
    setStorageLocationId(item.storage_location_id ?? '');
    setQuickNote(item.refurbish_notes ?? '');
    setSaleDate(item.sale_date ?? new Date().toISOString().split('T')[0]);
  }, [item]);

  const showSaleFields = status === 'sold' || status === 'shipped';

  const previewItem: Item | null = item
    ? {
        ...item,
        target_price: targetPrice !== '' ? parseFloat(targetPrice) : null,
        actual_price: actualPrice !== '' ? parseFloat(actualPrice) : null,
      }
    : null;

  const { netProfit, margin } = previewItem
    ? calculateProfit(previewItem)
    : { netProfit: 0, margin: 0 };

  const hasPrice = targetPrice !== '' || actualPrice !== '';
  const sellingFor =
    actualPrice !== '' ? parseFloat(actualPrice) : targetPrice !== '' ? parseFloat(targetPrice) : null;

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!item) return;
      const { error } = await supabase
        .from('items')
        .update({
          status,
          target_price: targetPrice !== '' ? parseFloat(targetPrice) : null,
          actual_price: actualPrice !== '' ? parseFloat(actualPrice) : null,
          storage_location_id: storageLocationId || null,
          refurbish_notes: quickNote || null,
          sale_date: showSaleFields ? saleDate : null,
        })
        .eq('id', item.id);
      if (error) throw error;
    },
    onSuccess: () => {
      onSaved();
    },
    onError: () => {
      toast.error('Failed to save changes');
    },
  });

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="pb-4 text-left">
          <SheetTitle>{item?.title || 'Untitled Item'}</SheetTitle>
          {item?.acquisition_source && (
            <p className="text-sm text-muted-foreground">{item.acquisition_source}</p>
          )}
          {item?.photos && item.photos.length > 0 && (
            <div className="flex gap-2 overflow-x-auto py-1">
              {item.photos.map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt=""
                  className="h-20 w-auto flex-shrink-0 rounded-md object-cover"
                />
              ))}
            </div>
          )}
        </SheetHeader>

        <div className="space-y-4 pb-6">
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as ItemStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(statusConfig) as ItemStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {statusConfig[s].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {showSaleFields && (
            <div className="space-y-1.5">
              <Label>Sale Date</Label>
              <Input
                type="date"
                value={saleDate}
                onChange={(e) => setSaleDate(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Target / Asking Price</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                className="pl-6"
                placeholder="0.00"
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Sold For</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                className="pl-6"
                placeholder="0.00"
                value={actualPrice}
                onChange={(e) => setActualPrice(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Storage Location</Label>
            <Select
              value={storageLocationId || 'none'}
              onValueChange={(v) => setStorageLocationId(v === 'none' ? '' : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {storageLocations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              placeholder="Add a note..."
              value={quickNote}
              onChange={(e) => setQuickNote(e.target.value.slice(0, 200))}
              rows={3}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground text-right">{quickNote.length}/200</p>
          </div>

          {item && hasPrice && (
            <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
              <span className="text-muted-foreground">
                Cost ${item.original_cost.toFixed(2)} → Selling for $
                {sellingFor != null ? sellingFor.toFixed(2) : '—'} = net{' '}
              </span>
              <span
                className={cn(
                  'font-medium',
                  netProfit > 0 && 'text-green-600',
                  netProfit < 0 && 'text-red-500',
                  netProfit === 0 && 'text-muted-foreground'
                )}
              >
                ${netProfit.toFixed(2)} ({margin.toFixed(0)}%)
              </span>
            </div>
          )}

          <button
            type="button"
            className="text-sm text-primary underline-offset-4 hover:underline block"
            onClick={() => {
              onClose();
              navigate(`/item/${item?.id}`);
            }}
          >
            View Full Details →
          </button>

          <Button
            className="w-full"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
