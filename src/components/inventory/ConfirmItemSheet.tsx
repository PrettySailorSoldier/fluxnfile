import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Item, useLocationIndex } from '@/hooks/useInventory';
import { LocationPicker } from '@/components/inventory/LocationPicker';
import { OrderDetails } from '@/components/inventory/OrderDetails';
import { useNavigate } from 'react-router-dom';
import { getLabelSettings } from '@/lib/labelSettings';
import { suggestPrice } from '@/lib/productLookup';

export const LAST_LOCATION_KEY = 'confirm-last-storage-location';
export const LAST_DECISION_KEY = 'confirm-last-decision';

interface ConfirmItemSheetProps {
  item: Item | null;
  open: boolean;
  onClose: () => void;
  /** Called after a successful confirm (in addition to onClose). */
  onConfirmed?: (item: Item) => void;
  /** Shows "Not this item" — the scanned box turned out to be a different order */
  onNotThisItem?: (item: Item) => void;
}

export function ConfirmItemSheet({ item, open, onClose, onConfirmed, onNotThisItem }: ConfirmItemSheetProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user, team } = useAuth();
  const { index: locationIndex } = useLocationIndex();

  const [decision, setDecision] = useState<'keep' | 'sell' | null>('sell');
  const [storageLocationId, setStorageLocationId] = useState('');
  const [heldBy, setHeldBy] = useState('');
  const [targetPrice, setTargetPrice] = useState('');

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['team-members', team?.id],
    queryFn: async () => {
      if (!team?.id) return [];
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('team_id', team.id);
      return (data ?? []) as { id: string; full_name: string | null }[];
    },
    enabled: !!team?.id,
  });

  useEffect(() => {
    if (!open) {
      setHeldBy('');
    } else {
      const savedDecision = localStorage.getItem(LAST_DECISION_KEY);
      setDecision(savedDecision === 'keep' ? 'keep' : 'sell');
      const last = localStorage.getItem(LAST_LOCATION_KEY);
      if (last && locationIndex.byId.has(last)) {
        setStorageLocationId((prev) => prev || last);
      } else if (item?.storage_location_id && locationIndex.byId.has(item.storage_location_id)) {
        setStorageLocationId(item.storage_location_id);
      }
      if (item) {
        if (item.target_price != null) {
          setTargetPrice(String(item.target_price));
        } else {
          const basis = item.retail_price ?? item.vine_etv ?? (item.original_cost > 0 ? item.original_cost : null);
          const suggested = suggestPrice(basis, 60, true);
          setTargetPrice(suggested != null ? String(suggested) : '');
        }
      }
    }
  }, [open, item, locationIndex]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!item || !decision) return;
      const parsedPrice = decision === 'sell' && targetPrice.trim() !== '' ? parseFloat(targetPrice) : null;
      const { error } = await supabase
        .from('items')
        .update({
          physical_status: decision,
          confirmed_at: new Date().toISOString(),
          confirmed_by: user?.id ?? null,
          held_by: heldBy || null,
          storage_location_id: storageLocationId || null,
          status: 'acquired',
          ...(parsedPrice != null && !isNaN(parsedPrice) && parsedPrice >= 0 ? { target_price: parsedPrice } : {}),
        })
        .eq('id', item.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['unconfirmed-count'] });
      if (decision) {
        localStorage.setItem(LAST_DECISION_KEY, decision);
      }
      if (storageLocationId) {
        localStorage.setItem(LAST_LOCATION_KEY, storageLocationId);
      }
      const locationName = storageLocationId ? locationIndex.pathText(storageLocationId) : '';
      const confirmed = item;
      // Optional shortcut to a label for the box (Settings → Label printer); never opens the print sheet itself
      const offerLabel = !!confirmed && getLabelSettings().offerAfterSave;
      toast.success(
        locationName ? `Confirmed → ${locationName}` : 'Item confirmed!',
        offerLabel
          ? { action: { label: 'Print label', onClick: () => navigate(`/item/${confirmed!.id}/label`) }, duration: 8000 }
          : undefined
      );
      onClose();
      if (confirmed) onConfirmed?.(confirmed);
    },
    onError: () => {
      toast.error('Failed to confirm item');
    },
  });

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="pb-4 text-left">
          <SheetTitle>Is this the box?</SheetTitle>
          <p className="text-sm text-muted-foreground">Check the order details against the box before confirming.</p>
        </SheetHeader>

        <div className="space-y-4 pb-6">
          {item && (
            <div className="rounded-lg border border-border p-3">
              <OrderDetails item={item} />
            </div>
          )}

          {item && onNotThisItem && (
            <Button variant="outline" className="w-full" onClick={() => onNotThisItem(item)}>
              Not this item — pick the right one
            </Button>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Keep or Sell</Label>
              <div className="grid grid-cols-2 gap-1.5">
                <Button
                  type="button"
                  variant={decision === 'sell' ? 'default' : 'outline'}
                  className="h-11 text-sm"
                  onClick={() => setDecision('sell')}
                >
                  Sell
                </Button>
                <Button
                  type="button"
                  variant={decision === 'keep' ? 'default' : 'outline'}
                  className="h-11 text-sm"
                  onClick={() => setDecision('keep')}
                >
                  Keep
                </Button>
              </div>
            </div>

            {decision === 'sell' && (
              <div className="space-y-1.5">
                <Label htmlFor="confirm-price">Asking price ($)</Label>
                <Input
                  id="confirm-price"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="Optional"
                  value={targetPrice}
                  onChange={(e) => setTargetPrice(e.target.value)}
                  className="h-11"
                />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Storage location</Label>
            <LocationPicker value={storageLocationId} onChange={setStorageLocationId} />
          </div>

          <div className="space-y-1.5">
            <Label>Who has it?</Label>
            <Select
              value={heldBy || 'none'}
              onValueChange={(v) => setHeldBy(v === 'none' ? '' : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select person" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {teamMembers.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.full_name || member.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            className="w-full h-12 text-base"
            onClick={() => saveMutation.mutate()}
            disabled={!decision || saveMutation.isPending}
          >
            {saveMutation.isPending
              ? 'Confirming...'
              : storageLocationId && locationIndex.pathText(storageLocationId)
                ? `Confirm (${decision === 'keep' ? 'Keep' : 'Sell'}) → ${locationIndex.pathText(storageLocationId)}`
                : `Confirm Item (${decision === 'keep' ? 'Keep' : 'Sell'})`}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
