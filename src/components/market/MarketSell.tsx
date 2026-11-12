import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Camera, CameraOff, Plus, Search, Undo2, X, Zap, ZapOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useLocationSearchOptions, type Item } from '@/hooks/useInventory';
import { useWorkflowSettings } from '@/hooks/useUserPreferences';
import { useContinuousScanner } from '@/hooks/useContinuousScanner';
import {
  MARKET_CHANNEL,
  useCompleteSale,
  useUndoSale,
  type BundleRuleRow,
  type MarketEvent,
  type PaymentMethod,
  type PhaseRow,
  type SaleRow,
} from '@/hooks/useMarket';
import { normalizeUpc } from '@/lib/barcode';
import { parseQuery, searchItems } from '@/lib/itemSearch';
import {
  applyBundles,
  changeDue,
  currentPhase,
  discountedPrice,
  processingFee,
  saleTotals,
  cents,
  type CartLine,
} from '@/lib/market';
import { sanitizeError } from '@/lib/errorHandler';
import { QRCode } from '@/components/QRCode';
import { buildVenmoUrl } from '@/lib/payments';

const SELLABLE = new Set(['acquired', 'refurbishing', 'ready_to_list', 'listed']);
const money = (n: number) => `$${n.toFixed(2)}`;
const itemNo = (it: Item) => (it.tracking_number ? `#${String(it.tracking_number).padStart(5, '0')}` : '');

type Chip = 'tag' | 'phase' | 'p10' | 'p20' | 'floor' | 'custom';

interface CartEntry {
  item: Item;
  chip: Chip;
  /** Typed price for the custom chip */
  custom: string;
  /** Not an inventory item — something off the table that was never entered */
  misc?: boolean;
}

/** A stand-in so a quick-sale line can sit in the cart next to real items. */
const quickSaleItem = (description: string): Item =>
  ({
    id: `quick-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: description,
    status: 'acquired',
    original_cost: 0,
    refurbish_cost: null,
    category_id: null,
    tracking_number: null,
    target_price: null,
    actual_price: null,
    sale_date: null,
    platform_fees: null,
    shipping_cost: null,
    photos: null,
  }) as unknown as Item;

interface Props {
  event: MarketEvent;
  items: Item[];
  sales: SaleRow[];
  phases: PhaseRow[];
  rules: BundleRuleRow[];
}

export function MarketSell({ event, items, sales, phases, rules }: Props) {
  const settings = useWorkflowSettings();
  const searchOpts = useLocationSearchOptions();
  const completeSale = useCompleteSale();
  const undoSale = useUndoSale();

  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [payment, setPayment] = useState<PaymentMethod>('cash');
  const [tendered, setTendered] = useState('');
  const [belowFloorOk, setBelowFloorOk] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickWhat, setQuickWhat] = useState('');
  const [quickPrice, setQuickPrice] = useState('');

  // The markdown phase follows the clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const step = settings.marketRoundStep;
  const phase = useMemo(() => currentPhase(phases, now), [phases, now]);
  const phasePct = phase?.percent_off ?? 0;

  const sellable = useMemo(
    () =>
      items
        .filter((i) => SELLABLE.has(i.status))
        // This event's bring list first, then the rest
        .sort((a, b) => Number(b.packed_for_event_id === event.id) - Number(a.packed_for_event_id === event.id)),
    [items, event.id]
  );
  const inCart = useMemo(() => new Set(cart.map((c) => c.item.id)), [cart]);

  const results = useMemo(() => {
    const terms = parseQuery(query);
    const pool = sellable.filter((i) => !inCart.has(i.id));
    if (terms.length === 0) return pool.filter((i) => i.packed_for_event_id === event.id).slice(0, 12);
    const digits = query.trim().replace(/^#/, '');
    const byNumber = /^\d{1,6}$/.test(digits) ? pool.filter((i) => i.tracking_number === parseInt(digits, 10)) : [];
    const hits = searchItems(pool, terms, searchOpts).map((h) => h.item);
    return [...new Set([...byNumber, ...hits])].slice(0, 12);
  }, [query, sellable, inCart, event.id, searchOpts]);

  // ── Prices ────────────────────────────────────────────────────────────────
  const tagOf = (it: Item) => it.tag_price ?? it.target_price ?? 0;

  const priceFor = (e: CartEntry): number => {
    const tag = tagOf(e.item);
    const floor = e.item.floor_price ?? null;
    switch (e.chip) {
      case 'tag':
        return tag;
      case 'phase':
        return discountedPrice(tag, phasePct, floor, step);
      case 'p10':
        return discountedPrice(tag, 10, null, step);
      case 'p20':
        return discountedPrice(tag, 20, null, step);
      case 'floor':
        return floor ?? tag;
      case 'custom':
        return parseFloat(e.custom) || 0;
    }
  };

  const baseLines: CartLine[] = cart.map((e) => ({
    item_id: e.item.id,
    // A quick-sale line has no sticker: its price is its tag, so it never reads as a discount
    tag_price: e.misc ? priceFor(e) : tagOf(e.item),
    category_id: e.item.category_id,
    price: priceFor(e),
    manual: e.misc || (e.chip !== 'tag' && e.chip !== 'phase'),
  }));
  const priced = useMemo(
    () => applyBundles(baseLines, rules),
    // baseLines is derived from cart/phase/settings each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cart, rules, phasePct, step]
  );
  const totals = saleTotals(priced, settings.marketSalesTaxPercent, settings.marketTaxIncluded);
  const fee = processingFee(payment, totals.total, {
    cardFeePercent: settings.marketCardFeePercent,
    cardFeeFlat: settings.marketCardFeeFlat,
    appFeePercent: settings.marketAppFeePercent,
  });
  const bundleLabels = [...new Set(priced.map((p) => p.bundle).filter(Boolean))] as string[];

  const belowFloor = cart.filter((e, i) => e.item.floor_price != null && priced[i].sold_price < e.item.floor_price);
  const missingPrice = priced.some((p) => p.sold_price <= 0);
  const tenderedNum = parseFloat(tendered) || 0;

  useEffect(() => setBelowFloorOk(false), [cart, payment]);

  // ── Cart actions ──────────────────────────────────────────────────────────
  const add = (item: Item) => {
    if (inCart.has(item.id)) {
      toast.info('Already in the cart');
      return;
    }
    const tag = tagOf(item);
    setCart((c) => [...c, { item, chip: tag > 0 ? (phasePct > 0 ? 'phase' : 'tag') : 'custom', custom: '' }]);
    setQuery('');
  };
  const setChip = (id: string, chip: Chip) => setCart((c) => c.map((e) => (e.item.id === id ? { ...e, chip } : e)));
  const setCustom = (id: string, custom: string) =>
    setCart((c) => c.map((e) => (e.item.id === id ? { ...e, chip: 'custom', custom } : e)));
  const remove = (id: string) => setCart((c) => c.filter((e) => e.item.id !== id));
  const addQuick = () => {
    const price = parseFloat(quickPrice);
    if (!(price > 0)) {
      toast.error('Enter what it sold for');
      return;
    }
    setCart((c) => [
      ...c,
      { item: quickSaleItem(quickWhat.trim() || 'Misc item'), chip: 'custom', custom: String(price), misc: true },
    ]);
    setQuickWhat('');
    setQuickPrice('');
    setQuickOpen(false);
  };

  // ── Scanner ───────────────────────────────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement>(null);
  const itemsRef = useRef(sellable);
  itemsRef.current = sellable;
  const addRef = useRef(add);
  addRef.current = add;

  const scanner = useContinuousScanner((result) => {
    const pool = itemsRef.current;
    let found: Item | undefined;
    if (result.status === 'found') {
      const v = result.value;
      found =
        result.codeType === 'asin'
          ? pool.find((i) => i.amazon_asin?.toUpperCase() === v.toUpperCase())
          : result.codeType === 'fnsku'
            ? pool.find((i) => i.fnsku?.toUpperCase() === v.toUpperCase())
            : pool.find((i) => i.upc && normalizeUpc(i.upc) === normalizeUpc(v));
    } else if (/^\d{1,6}$/.test(result.rawValue)) {
      // A price tag: its barcode is the item number
      found = pool.find((i) => i.tracking_number === parseInt(result.rawValue, 10));
    }
    if (found) {
      if ('vibrate' in navigator) navigator.vibrate(60);
      addRef.current(found);
    } else {
      toast.error(`No sellable item for ${result.rawValue}`);
    }
  });

  useEffect(() => {
    if (cameraOn && videoRef.current) void scanner.start(videoRef.current);
    else scanner.stop();
    // start/stop identity is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOn]);

  // ── Charge ────────────────────────────────────────────────────────────────
  const charge = async () => {
    if (belowFloor.length > 0 && !belowFloorOk) {
      setBelowFloorOk(true);
      return;
    }
    try {
      await completeSale.mutateAsync({
        eventId: event.id,
        channel: MARKET_CHANNEL,
        paymentMethod: payment,
        lines: cart.map((e, i) =>
          e.misc
            ? { item: null, description: e.item.title ?? 'Misc item', tag_price: null, sold_price: priced[i].sold_price }
            : { item: e.item, tag_price: tagOf(e.item), sold_price: priced[i].sold_price }
        ),
        discount: totals.discount,
        tax: totals.tax,
        fee,
        total: totals.total,
        bundleLabel: bundleLabels.length ? bundleLabels.join(', ') : null,
      });
      toast.success(`Sold ${cart.length} for ${money(totals.total)}`);
      setCart([]);
      setTendered('');
      setPayment('cash');
    } catch (e) {
      toast.error(sanitizeError(e));
    }
  };

  const lastSale = sales[sales.length - 1];
  const dayTotal = sales.reduce((s, x) => s + x.total, 0);
  const closed = event.status === 'closed';

  return (
    <div className="space-y-3">
      {/* Day running total */}
      <Card>
        <CardContent className="p-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Today so far</p>
            <p className="text-2xl font-bold tabular-nums">{money(dayTotal)}</p>
            <p className="text-xs text-muted-foreground">
              {sales.length} sale{sales.length === 1 ? '' : 's'} · {sales.reduce((s, x) => s + x.lines.length, 0)} items
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={!lastSale || undoSale.isPending || closed}
            onClick={async () => {
              if (!lastSale) return;
              if (!window.confirm(`Undo the last sale (${money(lastSale.total)}, ${lastSale.lines.length} item${lastSale.lines.length === 1 ? '' : 's'})? The items go back to unsold.`)) return;
              try {
                await undoSale.mutateAsync(lastSale);
                toast.success('Sale undone');
              } catch (e) {
                toast.error(sanitizeError(e));
              }
            }}
          >
            <Undo2 className="w-4 h-4" />
            Undo last
          </Button>
        </CardContent>
      </Card>

      {phase && (
        <div className="rounded-lg bg-primary/10 text-primary px-3 py-2 text-sm flex items-center justify-between">
          <span className="font-medium">{phase.label}</span>
          <span>{phasePct > 0 ? `${phasePct}% off tag (never below floor)` : 'Full tag price'}</span>
        </div>
      )}

      {closed && (
        <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          This market is closed. Reopen it from the event menu to ring up more sales.
        </div>
      )}

      {/* Find items */}
      {!closed && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Item number, title, UPC…"
                inputMode="search"
                className="pl-9 h-11"
              />
            </div>
            <Button
              variant={cameraOn ? 'default' : 'outline'}
              size="icon"
              className="h-11 w-11"
              onClick={() => setCameraOn((v) => !v)}
              aria-label={cameraOn ? 'Stop camera' : 'Scan a tag'}
            >
              {cameraOn ? <CameraOff className="w-5 h-5" /> : <Camera className="w-5 h-5" />}
            </Button>
          </div>

          {cameraOn && (
            <div className="relative rounded-lg overflow-hidden bg-black aspect-[4/3]">
              <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
              {scanner.torchSupported && (
                <Button
                  size="icon"
                  variant="secondary"
                  className="absolute top-2 right-2"
                  onClick={() => void scanner.toggleTorch()}
                  aria-label="Flashlight"
                >
                  {scanner.torchOn ? <ZapOff className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                </Button>
              )}
              {scanner.error && <p className="absolute inset-x-0 bottom-0 bg-black/70 text-white text-xs p-2">{scanner.error}</p>}
            </div>
          )}

          {results.length > 0 && (
            <div className="rounded-lg border divide-y max-h-64 overflow-y-auto">
              {results.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => add(it)}
                  className="w-full flex items-center gap-3 p-2.5 text-left hover:bg-muted active:bg-muted"
                >
                  {it.photos?.[0] ? (
                    <img src={it.photos[0]} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded bg-muted flex-shrink-0" />
                  )}
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium truncate">{it.title || 'Untitled item'}</span>
                    <span className="block text-xs text-muted-foreground">
                      {itemNo(it)} {it.packed_for_event_id === event.id && '· packed'}
                    </span>
                  </span>
                  <span className="text-sm font-semibold tabular-nums">{tagOf(it) > 0 ? money(tagOf(it)) : 'no tag'}</span>
                </button>
              ))}
            </div>
          )}
          {query && results.length === 0 && <p className="text-sm text-muted-foreground px-1">Nothing sellable matches “{query}”.</p>}

          {/* Quick sale: something that was never entered into inventory */}
          {quickOpen ? (
            <div className="rounded-lg border p-2.5 space-y-2">
              <p className="text-xs text-muted-foreground">
                Not in inventory — counts toward today’s sales, with no item cost.
              </p>
              <div className="flex gap-2">
                <Input
                  autoFocus
                  value={quickWhat}
                  onChange={(e) => setQuickWhat(e.target.value.slice(0, 80))}
                  placeholder="What was it? (optional)"
                  className="h-10 flex-1"
                />
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={quickPrice}
                  onChange={(e) => setQuickPrice(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addQuick()}
                  placeholder="$"
                  className="h-10 w-24"
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="flex-1" onClick={addQuick}>Add to sale</Button>
                <Button size="sm" variant="ghost" onClick={() => setQuickOpen(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => setQuickOpen(true)}>
              <Plus className="w-4 h-4" /> Quick sale — not in inventory
            </Button>
          )}
        </div>
      )}

      {/* Cart */}
      {cart.length > 0 && (
        <div className="space-y-2">
          {cart.map((e, i) => {
            const p = priced[i];
            const tag = tagOf(e.item);
            const floor = e.item.floor_price ?? null;
            const below = floor != null && p.sold_price < floor;
            const chips: { id: Chip; label: string; show: boolean }[] = [
              { id: 'tag', label: `Tag ${tag > 0 ? money(tag) : ''}`.trim(), show: tag > 0 },
              { id: 'phase', label: `${phase?.label ?? 'Phase'} ${phasePct}%`, show: tag > 0 && phasePct > 0 },
              { id: 'p10', label: '−10%', show: tag > 0 },
              { id: 'p20', label: '−20%', show: tag > 0 },
              { id: 'floor', label: floor != null ? `Floor ${money(floor)}` : 'Floor', show: floor != null },
              { id: 'custom', label: 'Custom', show: true },
            ];
            return (
              <Card key={e.item.id} className={cn(below && 'border-destructive/60')}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{e.item.title || 'Untitled item'}</p>
                      <p className="text-xs text-muted-foreground">
                        {e.misc ? 'Quick sale · not in inventory' : itemNo(e.item)}
                        {p.bundle && <Badge variant="secondary" className="ml-2 text-[10px]">{p.bundle}</Badge>}
                      </p>
                    </div>
                    <p className={cn('text-lg font-bold tabular-nums', below && 'text-destructive')}>{money(p.sold_price)}</p>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(e.item.id)} aria-label="Remove">
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {chips
                      .filter((c) => c.show)
                      .map((c) => (
                        <Button
                          key={c.id}
                          size="sm"
                          variant={e.chip === c.id ? 'default' : 'outline'}
                          className="h-8 text-xs"
                          onClick={() => setChip(e.item.id, c.id)}
                        >
                          {c.label}
                        </Button>
                      ))}
                  </div>
                  {e.chip === 'custom' && (
                    <Input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      autoFocus
                      placeholder="Price they agreed to"
                      value={e.custom}
                      onChange={(ev) => setCustom(e.item.id, ev.target.value)}
                      className="h-10"
                    />
                  )}
                  {below && (
                    <p className="text-xs text-destructive">
                      Below your floor of {money(floor!)} — you’ll be asked to confirm.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {/* Totals + payment */}
          <Card>
            <CardContent className="p-3 space-y-3">
              <div className="space-y-1 text-sm">
                <Row label="Tag total" value={money(totals.tagTotal)} muted />
                {totals.discount > 0 && <Row label="Discounts / bundles" value={`−${money(totals.discount)}`} muted />}
                {settings.marketSalesTaxPercent > 0 && (
                  <Row
                    label={`Sales tax ${settings.marketSalesTaxPercent}%${settings.marketTaxIncluded ? ' (included)' : ''}`}
                    value={money(totals.tax)}
                    muted
                  />
                )}
                <div className="flex items-center justify-between pt-1">
                  <span className="font-semibold">Total</span>
                  <span className="text-3xl font-bold tabular-nums">{money(totals.total)}</span>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {(['cash', 'card', 'venmo', 'other'] as PaymentMethod[]).map((m) => (
                  <Button key={m} variant={payment === m ? 'default' : 'outline'} className="h-11 capitalize" onClick={() => setPayment(m)}>
                    {m}
                  </Button>
                ))}
              </div>

              {payment === 'cash' && (
                <div className="space-y-2">
                  <div className="flex gap-1.5 flex-wrap">
                    {[totals.total, 5, 10, 20, 50, 100]
                      .filter((v, idx, arr) => v >= totals.total && arr.indexOf(v) === idx)
                      .slice(0, 5)
                      .map((v) => (
                        <Button key={v} size="sm" variant="outline" className="h-9" onClick={() => setTendered(String(v))}>
                          {v === totals.total ? 'Exact' : money(v)}
                        </Button>
                      ))}
                  </div>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      inputMode="decimal"
                      placeholder="Cash handed over"
                      value={tendered}
                      onChange={(ev) => setTendered(ev.target.value)}
                      className="h-11"
                    />
                    <div className="text-right min-w-[5.5rem]">
                      <p className="text-xs text-muted-foreground">Change</p>
                      <p className="text-xl font-bold tabular-nums">{money(changeDue(totals.total, tenderedNum))}</p>
                    </div>
                  </div>
                  {tenderedNum > 0 && tenderedNum < totals.total && (
                    <p className="text-xs text-destructive">Short by {money(cents(totals.total - tenderedNum))}</p>
                  )}
                </div>
              )}

              {payment === 'venmo' && (
                <div className="flex gap-3 items-center p-2.5 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900">
                  <QRCode
                    text={settings.venmoHandle ? buildVenmoUrl(settings.venmoHandle, totals.total, event.name) : 'https://venmo.com'}
                    size={100}
                  />
                  <div className="space-y-1 text-xs">
                    <p className="font-semibold text-blue-600 dark:text-blue-400">Scan to Pay via Venmo</p>
                    <p className="text-muted-foreground">Customer scans with phone camera to pay {money(totals.total)}</p>
                    {settings.venmoHandle ? (
                      <p className="font-mono text-[11px]">@{settings.venmoHandle}</p>
                    ) : (
                      <p className="text-[10px] text-muted-foreground">Set @handle in Settings to prefill</p>
                    )}
                  </div>
                </div>
              )}

              {fee > 0 && <p className="text-xs text-muted-foreground">{payment === 'card' ? 'Card' : 'App'} fee ≈ {money(fee)} (counted against profit)</p>}

              <Button
                size="lg"
                className={cn('w-full h-14 text-lg', belowFloorOk && 'bg-destructive hover:bg-destructive/90')}
                disabled={completeSale.isPending || missingPrice || closed}
                onClick={charge}
              >
                {completeSale.isPending
                  ? 'Saving…'
                  : missingPrice
                    ? 'Enter a price for every item'
                    : belowFloorOk
                      ? `Below floor — sell anyway (${money(totals.total)})`
                      : `Sell · ${money(totals.total)}`}
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">
                Tip: ask what they’d offer first. Only the tag is shown to buyers — your floor stays private.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {cart.length === 0 && !closed && sales.length === 0 && (
        <div className="text-center text-sm text-muted-foreground py-6 space-y-2">
          <Plus className="w-6 h-6 mx-auto opacity-50" />
          <p>Scan a tag or type an item number to start a sale.</p>
          <p className="text-xs">Packed items for this market show up first.</p>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={cn('flex items-center justify-between', muted && 'text-muted-foreground')}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
