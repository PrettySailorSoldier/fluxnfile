import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Flag, Camera, Loader2, X as XIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Item,
  ItemStatus,
  ItemCondition,
  statusConfig,
  conditionLabels,
  useStorageLocations,
  useCategories,
  calculateProfit,
  getMissingDetails,
} from '@/hooks/useInventory';
import { isUnknownTitle } from '@/lib/productLookup';

// Extends Item with the new flag columns (not yet in generated types)
type FlaggedItem = Item & { flagged_for?: string | null; flag_note?: string | null };

interface QuickEditSheetProps {
  item: Item | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** When set, shows "Save & next" — used by the Needs Details queue */
  onSaveNext?: () => void;
  /** e.g. "3 left" */
  queueLabel?: string;
}

export function QuickEditSheet({ item, open, onClose, onSaved, onSaveNext, queueLabel }: QuickEditSheetProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, team } = useAuth();
  const { data: storageLocations = [] } = useStorageLocations();
  const { data: categories = [] } = useCategories();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [status, setStatus] = useState<ItemStatus>('acquired');
  const [targetPrice, setTargetPrice] = useState('');
  const [actualPrice, setActualPrice] = useState('');
  const [storageLocationId, setStorageLocationId] = useState('');
  const [quickNote, setQuickNote] = useState('');
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split('T')[0]);
  const [flagNote, setFlagNote] = useState('');
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [condition, setCondition] = useState<ItemCondition>('good');
  const [cost, setCost] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  // Fetch partner profile (the other team member)
  const { data: partner } = useQuery({
    queryKey: ['partner-profile', team?.id, user?.id],
    queryFn: async () => {
      if (!team?.id || !user?.id) return null;
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('team_id', team.id)
        .neq('id', user.id)
        .limit(1)
        .maybeSingle();
      return data as { id: string; full_name: string | null } | null;
    },
    enabled: !!team?.id && !!user?.id,
  });

  useEffect(() => {
    if (!item) return;
    const fi = item as FlaggedItem;
    setStatus(item.status);
    setTargetPrice(item.target_price != null ? String(item.target_price) : '');
    setActualPrice(item.actual_price != null ? String(item.actual_price) : '');
    setStorageLocationId(item.storage_location_id ?? '');
    setQuickNote(item.refurbish_notes ?? '');
    setSaleDate(item.sale_date ?? new Date().toISOString().split('T')[0]);
    setFlagNote(fi.flag_note ?? '');
    setTitle(isUnknownTitle(item.title) ? '' : item.title ?? '');
    setCategoryId(item.category_id ?? '');
    setCondition(item.condition);
    setCost(String(item.original_cost ?? 0));
    setPhotos(item.photos ?? []);
  }, [item]);

  const missing = item ? getMissingDetails(item) : [];

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !team?.id) return;
    setUploading(true);
    const uploaded: string[] = [];
    for (const file of Array.from(files)) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image must be less than 5MB');
        continue;
      }
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${team.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from('item-photos').upload(path, file);
      if (error) {
        toast.error('Failed to upload image');
        continue;
      }
      uploaded.push(supabase.storage.from('item-photos').getPublicUrl(path).data.publicUrl);
    }
    // Your own photos go first — they're what you'll list with
    setPhotos((prev) => [...uploaded, ...prev]);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const showSaleFields = status === 'sold' || status === 'shipped';

  const previewItem: Item | null = item
    ? {
        ...item,
        original_cost: cost !== '' ? parseFloat(cost) || 0 : item.original_cost,
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
    mutationFn: async (_opts: { next?: boolean } = {}) => {
      if (!item) return;
      const trimmedTitle = title.trim();
      const { error } = await supabase
        .from('items')
        .update({
          status,
          target_price: targetPrice !== '' ? parseFloat(targetPrice) : null,
          actual_price: actualPrice !== '' ? parseFloat(actualPrice) : null,
          storage_location_id: storageLocationId || null,
          refurbish_notes: quickNote || null,
          sale_date: showSaleFields ? saleDate : null,
          // Keep the placeholder title if nothing was typed
          title: trimmedTitle || item.title,
          category_id: categoryId || null,
          condition,
          original_cost: cost !== '' ? Math.max(0, parseFloat(cost) || 0) : item.original_cost,
          photos,
        })
        .eq('id', item.id);
      if (error) throw error;
    },
    onSuccess: (_data, opts) => {
      if (opts?.next && onSaveNext) onSaveNext();
      else onSaved();
    },
    onError: () => {
      toast.error('Failed to save changes');
    },
  });

  const flagMutation = useMutation({
    mutationFn: async () => {
      if (!item || !partner?.id) return;
      const { error } = await supabase
        .from('items')
        .update({ flagged_for: partner.id, flag_note: flagNote || null })
        .eq('id', item.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      toast.success(`Flagged for ${partner?.full_name || 'partner'}`);
    },
    onError: () => {
      toast.error('Failed to flag item');
    },
  });

  const fi = item as FlaggedItem | null;
  const flaggedForMe = fi?.flagged_for != null && fi.flagged_for === user?.id;
  const flaggedForPartner = fi?.flagged_for != null && fi.flagged_for === partner?.id;
  const partnerName = partner?.full_name || 'Partner';

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="pb-4 text-left">
          <SheetTitle>{item?.title || 'Untitled Item'}</SheetTitle>
          {item?.acquisition_source && (
            <p className="text-sm text-muted-foreground">{item.acquisition_source}</p>
          )}
          {queueLabel && <p className="text-xs text-amber-600 font-medium">{queueLabel}</p>}
          <div className="flex gap-2 overflow-x-auto py-1">
            {photos.map((url, i) => (
              <div key={url + i} className="relative flex-shrink-0">
                <img src={url} alt="" className="h-20 w-20 rounded-md object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-background border border-border flex items-center justify-center"
                  aria-label="Remove photo"
                >
                  <XIcon className="w-3 h-3" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="h-20 w-20 flex-shrink-0 rounded-md border-2 border-dashed border-border flex flex-col items-center justify-center text-xs text-muted-foreground gap-1"
            >
              {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
              {uploading ? 'Uploading' : 'Add photo'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={handlePhotoUpload}
            />
          </div>
          {missing.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Missing: <span className="text-amber-600">{missing.join(', ')}</span>
            </p>
          )}
        </SheetHeader>

        <div className="space-y-4 pb-6">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input
              value={title}
              placeholder={isUnknownTitle(item?.title) ? 'What is it?' : 'Item title'}
              onChange={(e) => setTitle(e.target.value.slice(0, 200))}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={categoryId || 'none'} onValueChange={(v) => setCategoryId(v === 'none' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Condition</Label>
              <Select value={condition} onValueChange={(v) => setCondition(v as ItemCondition)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(conditionLabels) as ItemCondition[]).map((c) => (
                    <SelectItem key={c} value={c}>
                      {conditionLabels[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

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
            <Label>Cost</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                className="pl-6"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>
              Target / Asking Price
              {item?.retail_price != null && (
                <span className="ml-2 font-normal text-xs text-muted-foreground">
                  retail ~${Number(item.retail_price).toFixed(2)}
                </span>
              )}
            </Label>
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

          {/* ── Flag for Partner ───────────────────────────────────────────── */}
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-3 space-y-2">
            {flaggedForMe ? (
              <Badge
                variant="outline"
                className="bg-amber-500/15 text-amber-600 border-amber-500/40 text-xs"
              >
                <Flag className="w-3 h-3 mr-1" />
                Flagged for you by {partnerName}
              </Badge>
            ) : (
              <>
                {flaggedForPartner && (
                  <p className="text-xs text-muted-foreground">
                    Already flagged for {partnerName} — you can update the note and re-flag.
                  </p>
                )}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">What needs attention? (optional)</Label>
                  <Textarea
                    placeholder="Add context for your partner..."
                    value={flagNote}
                    onChange={(e) => setFlagNote(e.target.value.slice(0, 300))}
                    rows={2}
                    className="resize-none text-sm"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full border-amber-500/40 text-amber-600 hover:bg-amber-500/10"
                  onClick={() => flagMutation.mutate()}
                  disabled={flagMutation.isPending || !partner}
                >
                  <Flag className="w-3.5 h-3.5 mr-1.5" />
                  {flagMutation.isPending ? 'Flagging…' : `Flag for ${partnerName}`}
                </Button>
              </>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              className="flex-1"
              variant={onSaveNext ? 'outline' : 'default'}
              onClick={() => saveMutation.mutate({})}
              disabled={saveMutation.isPending || uploading}
            >
              {saveMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
            {onSaveNext && (
              <Button
                className="flex-1"
                onClick={() => saveMutation.mutate({ next: true })}
                disabled={saveMutation.isPending || uploading}
              >
                Save &amp; next
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
