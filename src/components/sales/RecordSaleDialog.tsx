import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { usePlatforms, type Item, type Platform } from '@/hooks/useInventory';
import { MARKET_CHANNEL, useEvents, useRecordSale, type PaymentMethod } from '@/hooks/useMarket';
import { cents, itemBasis } from '@/lib/market';
import { todayLocal } from '@/lib/dates';
import { sanitizeError } from '@/lib/errorHandler';

const LAST_CHANNEL_KEY = 'fluxnfile:last-sale-channel';
const FLEA_MARKET = 'Flea market';
const FACEBOOK = 'Facebook Marketplace';
const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toFixed(2)}`;

export interface RecordSaleDefaults {
  /** Platform name, e.g. "Facebook Marketplace" */
  channel?: string;
  /** Agreed price — only used when a single item is being sold */
  price?: number | null;
  buyerName?: string | null;
  notes?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What sold. Several items are recorded as one sale to one buyer. */
  items: Item[];
  defaults?: RecordSaleDefaults;
  onRecorded?: () => void;
}

/** What a platform takes from a sale of `total`. */
export function platformFee(p: Platform | undefined, total: number): number {
  if (!p || total <= 0) return 0;
  return cents(
    (total * (Number(p.fee_percentage) + Number(p.processing_percentage))) / 100 +
      Number(p.flat_fee) +
      Number(p.processing_flat_fee)
  );
}

/**
 * The one place a sale gets recorded outside Market Mode: what it sold for,
 * where, how it was paid, and what it cost to sell. Writes to the same ledger
 * as market sales, so the team's numbers agree wherever the sale happened.
 */
export function RecordSaleDialog({ open, onOpenChange, items, defaults, onRecorded }: Props) {
  const { data: platforms = [] } = usePlatforms();
  const { data: events = [] } = useEvents();
  const recordSale = useRecordSale();

  const [prices, setPrices] = useState<Record<string, string>>({});
  const [channel, setChannel] = useState(FACEBOOK);
  const [payment, setPayment] = useState<PaymentMethod>('cash');
  const [fee, setFee] = useState('');
  const [feeEdited, setFeeEdited] = useState(false);
  const [shipping, setShipping] = useState('');
  const [saleDate, setSaleDate] = useState(todayLocal());
  const [buyer, setBuyer] = useState('');

  // A team's own platform row wins over the built-in one of the same name
  const channels = useMemo(() => {
    const byName = new Map<string, Platform>();
    for (const p of platforms) {
      const existing = byName.get(p.name);
      if (!existing || (p.team_id && !existing.team_id)) byName.set(p.name, p);
    }
    return [...byName.values()].sort((a, b) => {
      if (a.name === 'Other') return 1;
      if (b.name === 'Other') return -1;
      return a.name.localeCompare(b.name);
    });
  }, [platforms]);

  const itemKey = items.map((i) => i.id).join(',');
  useEffect(() => {
    if (!open) return;
    const single = items.length === 1;
    setPrices(
      Object.fromEntries(
        items.map((i) => {
          const p = (single ? defaults?.price : null) ?? i.actual_price ?? i.target_price;
          return [i.id, p != null ? String(p) : ''];
        })
      )
    );
    let remembered: string | null = null;
    try {
      remembered = localStorage.getItem(LAST_CHANNEL_KEY);
    } catch {
      // private mode — fall through to the default
    }
    const guess = defaults?.channel ?? (items.some((i) => i.fb_listing_url) ? FACEBOOK : remembered ?? FACEBOOK);
    setChannel(guess);
    setPayment('cash');
    setFee('');
    setFeeEdited(false);
    setShipping('');
    setSaleDate(todayLocal());
    setBuyer(defaults?.buyerName ?? '');
    // Reset only when the dialog opens for a different set of items
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, itemKey]);

  const priceOf = (id: string) => parseFloat(prices[id] ?? '') || 0;
  const total = cents(items.reduce((s, i) => s + priceOf(i.id), 0));
  const platform = channels.find((p) => p.name === channel);
  const autoFee = platformFee(platform, total);
  const feeNum = feeEdited ? parseFloat(fee) || 0 : autoFee;
  const shippingNum = parseFloat(shipping) || 0;
  const cost = items.reduce((s, i) => s + itemBasis(i), 0);
  const profit = cents(total - cost - feeNum - shippingNum);
  const missingPrice = items.some((i) => priceOf(i.id) <= 0);

  // A table sale rung up outside Market Mode still belongs to the market that's open
  const openEvents = events.filter((e) => e.status === 'open');
  const isMarket = channel === FLEA_MARKET;
  const eventId = isMarket && openEvents.length === 1 ? openEvents[0].id : null;

  const submit = async () => {
    try {
      await recordSale.mutateAsync({
        eventId,
        channel: isMarket ? MARKET_CHANNEL : channel,
        paymentMethod: payment,
        lines: items.map((i) => ({
          item: i,
          tag_price: i.tag_price ?? i.target_price ?? null,
          sold_price: cents(priceOf(i.id)),
        })),
        discount: 0,
        tax: 0,
        fee: cents(feeNum),
        shipping: cents(shippingNum),
        total,
        bundleLabel: null,
        notes: defaults?.notes,
        buyerName: buyer.trim() || undefined,
        saleDate,
      });
      try {
        localStorage.setItem(LAST_CHANNEL_KEY, channel);
      } catch {
        // not worth failing a sale over
      }
      toast.success(items.length === 1 ? `Sold for ${money(total)}` : `Sold ${items.length} items for ${money(total)}`);
      onOpenChange(false);
      onRecorded?.();
    } catch (e) {
      toast.error(sanitizeError(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record sale</DialogTitle>
          <DialogDescription>
            {items.length === 1
              ? items[0].title || 'Untitled item'
              : `${items.length} items, one buyer. Sold to different people? Record them separately.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            {items.map((i) => (
              <div key={i.id} className="flex items-center gap-2">
                {items.length > 1 && <span className="flex-1 min-w-0 text-sm truncate">{i.title || 'Untitled item'}</span>}
                {items.length === 1 && <Label className="flex-1">Sold for</Label>}
                <div className="relative w-32">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    className="pl-6 text-right"
                    placeholder="0.00"
                    autoFocus={items.length === 1}
                    value={prices[i.id] ?? ''}
                    onChange={(e) => setPrices((p) => ({ ...p, [i.id]: e.target.value }))}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label>Where it sold</Label>
            <Select
              value={channel}
              onValueChange={(v) => {
                setChannel(v);
                setFeeEdited(false);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {!channels.some((c) => c.name === channel) && <SelectItem value={channel}>{channel}</SelectItem>}
                {channels.map((c) => (
                  <SelectItem key={c.id} value={c.name}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isMarket && (
              <p className="text-xs text-muted-foreground">
                {eventId
                  ? `Counts toward ${openEvents[0].name}.`
                  : 'No market is open, so this won’t be tied to one. Open the market first to count it there.'}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Paid with</Label>
            <div className="grid grid-cols-4 gap-2">
              {(['cash', 'card', 'venmo', 'other'] as PaymentMethod[]).map((m) => (
                <Button
                  key={m}
                  type="button"
                  size="sm"
                  variant={payment === m ? 'default' : 'outline'}
                  className="capitalize"
                  onClick={() => setPayment(m)}
                >
                  {m}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Selling fees</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  className="pl-6"
                  value={feeEdited ? fee : autoFee ? autoFee.toFixed(2) : ''}
                  placeholder="0.00"
                  onChange={(e) => {
                    setFeeEdited(true);
                    setFee(e.target.value);
                  }}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Shipping you paid</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  className="pl-6"
                  value={shipping}
                  placeholder="0.00"
                  onChange={(e) => setShipping(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={saleDate} max={todayLocal()} onChange={(e) => setSaleDate(e.target.value || todayLocal())} />
            </div>
            <div className="space-y-1.5">
              <Label>Buyer (optional)</Label>
              <Input value={buyer} onChange={(e) => setBuyer(e.target.value.slice(0, 80))} placeholder="Name" />
            </div>
          </div>

          <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm flex items-center justify-between">
            <span className="text-muted-foreground">
              {money(total)} − cost {money(cost)}
              {feeNum > 0 && ` − fees ${money(feeNum)}`}
              {shippingNum > 0 && ` − shipping ${money(shippingNum)}`}
            </span>
            <span className={cn('font-semibold tabular-nums', profit > 0 && 'text-green-600', profit < 0 && 'text-destructive')}>
              {money(profit)}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={recordSale.isPending || missingPrice || items.length === 0}>
            {recordSale.isPending ? 'Saving…' : missingPrice ? 'Enter a price' : `Record sale · ${money(total)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
