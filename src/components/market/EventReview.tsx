import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Download, Lock, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { Item } from '@/hooks/useInventory';
import { useWorkflowSettings } from '@/hooks/useUserPreferences';
import {
  useCloseEvent,
  useRouteLeftovers,
  useUpdateEvent,
  type LeftoverAction,
  type MarketEvent,
  type SaleRow,
} from '@/hooks/useMarket';
import {
  cents,
  discountedPrice,
  eventHours,
  expectedCash,
  itemBasis,
  reviewEvent,
  suggestVerdict,
  toCsv,
  verdictLabels,
  type Verdict,
} from '@/lib/market';
import { sanitizeError } from '@/lib/errorHandler';

const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toFixed(2)}`;

const verdictClass: Record<Verdict, string> = {
  book_again: 'bg-green-500/10 text-green-600 border-green-500/30',
  maybe: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
  skip: 'bg-red-500/10 text-red-600 border-red-500/30',
};

interface Props {
  event: MarketEvent;
  items: Item[];
  sales: SaleRow[];
}

export function EventReview({ event, items, sales }: Props) {
  const settings = useWorkflowSettings();
  const updateEvent = useUpdateEvent();
  const closeEvent = useCloseEvent();
  const route = useRouteLeftovers();

  const [counted, setCounted] = useState(event.counted_cash != null ? String(event.counted_cash) : '');
  const [miles, setMiles] = useState(event.mileage_miles != null ? String(event.mileage_miles) : '');

  const packed = useMemo(() => items.filter((i) => i.packed_for_event_id === event.id), [items, event.id]);
  const soldIds = useMemo(() => new Set(sales.flatMap((s) => s.lines.map((l) => l.item_id).filter(Boolean) as string[])), [sales]);
  const unsold = packed.filter((i) => !soldIds.has(i.id) && i.status !== 'sold' && i.status !== 'shipped');
  const brought = new Set([...packed.map((p) => p.id), ...soldIds]).size;

  const hours = eventHours(event.start_time, event.end_time);
  const review = reviewEvent(
    event,
    hours,
    brought,
    sales.map((s) => ({
      sold_at: s.sold_at,
      payment_method: s.payment_method,
      total: s.total,
      tax_amount: s.tax_amount,
      fee_amount: s.fee_amount,
      discount_amount: s.discount_amount,
      lines: s.lines.map((l) => ({
        sold_price: l.sold_price,
        tag_price: l.tag_price,
        cost: l.item ? itemBasis(l.item) : 0,
      })),
    }))
  );

  const suggested = suggestVerdict(review, {
    goodProfitPerHour: settings.marketGoodProfitPerHour,
    minProfitPerHour: settings.marketMinProfitPerHour,
  });
  const verdict = event.verdict ?? null;

  // Cash drawer
  const expected = expectedCash(event.start_cash, review.cashSales);
  const countedNum = counted === '' ? null : parseFloat(counted);
  const variance = countedNum != null && Number.isFinite(countedNum) ? cents(countedNum - expected) : null;

  // Taxes
  const setAside = cents(Math.max(0, review.profit) * (settings.marketTaxSetAsidePercent / 100));
  const milesNum = parseFloat(miles);
  const mileageDeduction = Number.isFinite(milesNum) ? cents(milesNum * settings.marketMileageRate) : null;

  const closed = event.status === 'closed';

  const save = async (patch: Partial<MarketEvent>) => {
    try {
      await updateEvent.mutateAsync({ id: event.id, ...patch });
    } catch (e) {
      toast.error(sanitizeError(e));
    }
  };

  const closeMarket = async () => {
    if (!window.confirm(`Close ${event.name}? Unsold packed items each count one market attempt.`)) return;
    try {
      await closeEvent.mutateAsync({
        eventId: event.id,
        unsold,
        countedCash: countedNum != null && Number.isFinite(countedNum) ? countedNum : null,
        verdict: verdict ?? suggested,
      });
      toast.success('Market closed');
    } catch (e) {
      toast.error(sanitizeError(e));
    }
  };

  const exportCsv = () => {
    const rows: (string | number | null)[][] = [
      ['Date', 'Time', 'Market', 'Item #', 'Item', 'Tag price', 'Sold price', 'Payment', 'Sale discount', 'Sale tax', 'Sale fee', 'Sale total', 'Item cost'],
    ];
    for (const s of sales) {
      const d = new Date(s.sold_at);
      s.lines.forEach((l, idx) =>
        rows.push([
          d.toLocaleDateString(),
          d.toLocaleTimeString(),
          event.name,
          l.item?.tracking_number ? String(l.item.tracking_number).padStart(5, '0') : null,
          l.item?.title ?? null,
          l.tag_price,
          l.sold_price,
          s.payment_method,
          // sale-level amounts appear once per sale so a column sum is right
          idx === 0 ? s.discount_amount : 0,
          idx === 0 ? s.tax_amount : 0,
          idx === 0 ? s.fee_amount : 0,
          idx === 0 ? s.total : 0,
          l.item ? itemBasis(l.item) : null,
        ])
      );
    }
    const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${event.event_date}-${event.name.replace(/[^\w-]+/g, '_')}-sales.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const routeAll = async (list: Item[], action: LeftoverAction) => {
    if (list.length === 0) return;
    try {
      await route.mutateAsync({
        items: list,
        action,
        markdownPercent: 20,
        roundStep: settings.marketRoundStep,
        discount: discountedPrice,
      });
      toast.success(
        action === 'keep' ? 'Kept for the next market'
          : action === 'markdown' ? `Marked down ${list.length}`
          : action === 'list_online' ? `${list.length} sent back to online listing`
          : `${list.length} flagged to donate`
      );
    } catch (e) {
      toast.error(sanitizeError(e));
    }
  };

  return (
    <div className="space-y-4">
      {/* Verdict + close */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            Verdict
            {verdict && <Badge variant="outline" className={cn(verdictClass[verdict])}>{verdictLabels[verdict]}</Badge>}
          </CardTitle>
          <CardDescription>
            Suggested: <span className="font-medium">{verdictLabels[suggested]}</span> — based on profit after booth, costs and fees, hourly profit and the 3× booth rule. You decide.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {(['book_again', 'maybe', 'skip'] as Verdict[]).map((v) => (
              <Button
                key={v}
                size="sm"
                variant={verdict === v ? 'default' : 'outline'}
                onClick={() => save({ verdict: verdict === v ? null : v })}
              >
                {verdictLabels[v]}
              </Button>
            ))}
          </div>
          {closed ? (
            <Button variant="outline" size="sm" className="gap-2" onClick={() => save({ status: 'open' })}>
              <Unlock className="w-4 h-4" /> Reopen market
            </Button>
          ) : (
            <Button size="sm" className="gap-2" onClick={closeMarket} disabled={closeEvent.isPending}>
              <Lock className="w-4 h-4" /> Close market
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Numbers */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Results</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Big label="Profit after booth, costs & fees" value={money(review.profit)} tone={review.profit >= 0 ? 'good' : 'bad'} />
            <Big label="Profit per hour" value={review.profitPerHour != null ? money(review.profitPerHour) : 'Set start/end time'} />
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            <Line k="Sales (before tax)" v={money(review.gross)} />
            <Line k="Cost of items sold" v={money(-review.cogs)} />
            <Line k="Booth + costs" v={money(-review.boothAndCosts)} />
            <Line k="Card / app fees" v={money(-review.fees)} />
            <Line k="Sales made" v={String(review.saleCount)} />
            <Line k="Items sold" v={`${review.itemsSold} of ${brought}`} />
            <Line k="Sell-through" v={review.sellThrough != null ? `${Math.round(review.sellThrough * 100)}%` : '—'} />
            <Line k="Average sale" v={money(review.avgSale)} />
            <Line k="Items per sale" v={String(review.itemsPerSale)} />
            <Line k="Given in discounts" v={money(review.discountTotal)} />
            <Line
              k="Booth share of sales"
              v={review.boothShareOfGross != null ? `${Math.round(review.boothShareOfGross * 100)}%` : '—'}
              warn={review.boothShareOfGross != null && review.boothShareOfGross > 0.2}
            />
            <Line k="3× booth rule" v={event.booth_fee > 0 ? (review.threeX ? 'Met' : 'Missed') : 'n/a'} warn={!review.threeX} />
          </div>
          <div className="flex gap-2 flex-wrap text-xs">
            {(Object.entries(review.paymentMix) as [string, { count: number; total: number }][])
              .filter(([, v]) => v.count > 0)
              .map(([k, v]) => (
                <Badge key={k} variant="secondary" className="capitalize">{k}: {v.count} · {money(v.total)}</Badge>
              ))}
          </div>
        </CardContent>
      </Card>

      {/* Cash */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Cash drawer</CardTitle>
          <CardDescription>Starting float + cash sales (tax included) should match what’s in the box.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Line k="Starting cash" v={money(event.start_cash)} />
          <Line k="Cash sales" v={money(review.cashSales)} />
          <Line k="Expected in box" v={money(expected)} bold />
          <div className="flex items-center gap-2 pt-1">
            <Input
              type="number"
              inputMode="decimal"
              placeholder="Counted cash"
              value={counted}
              onChange={(e) => setCounted(e.target.value)}
              onBlur={() => countedNum != null && Number.isFinite(countedNum) && save({ counted_cash: countedNum })}
              className="h-10"
            />
            {variance != null && (
              <span className={cn('font-semibold tabular-nums whitespace-nowrap', variance === 0 ? 'text-green-600' : 'text-destructive')}>
                {variance === 0 ? 'Matches' : `${variance > 0 ? 'Over' : 'Short'} ${money(Math.abs(variance))}`}
              </span>
            )}
          </div>
          {variance != null && variance < 0 && (
            <p className="text-xs text-muted-foreground">
              Short? Check for sales rung up as card that were cash, undone sales, or change given from the float.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Books */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Books</CardTitle>
          <CardDescription>
            Rough planning figures, not tax advice — confirm with your accountant.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Line k="Sales tax collected" v={money(review.taxCollected)} />
          <Line k={`Set aside (${settings.marketTaxSetAsidePercent}% of profit)`} v={money(setAside)} />
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground flex-1">Round-trip miles</span>
            <Input
              type="number"
              inputMode="decimal"
              value={miles}
              onChange={(e) => setMiles(e.target.value)}
              onBlur={() => save({ mileage_miles: Number.isFinite(milesNum) ? milesNum : null })}
              className="h-9 w-24 text-right"
            />
          </div>
          {mileageDeduction != null && (
            <Line k={`Mileage at $${settings.marketMileageRate}/mi`} v={money(mileageDeduction)} />
          )}
          <Button variant="outline" size="sm" className="gap-2 mt-1" onClick={exportCsv} disabled={sales.length === 0}>
            <Download className="w-4 h-4" /> Export sales CSV
          </Button>
        </CardContent>
      </Card>

      {/* Leftovers */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Leftovers · {unsold.length}</CardTitle>
          <CardDescription>
            Close the market first so each unsold item counts one attempt, then route them. Items that miss two markets are flagged.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {unsold.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing left unsold from this market.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant="outline" onClick={() => routeAll(unsold, 'keep')}>Keep all for next</Button>
                <Button size="sm" variant="outline" onClick={() => routeAll(unsold, 'markdown')}>Mark all down 20%</Button>
                <Button size="sm" variant="outline" onClick={() => routeAll(unsold, 'list_online')}>List all online</Button>
                <Button size="sm" variant="outline" onClick={() => routeAll(unsold, 'donate')}>Donate all</Button>
              </div>
              <div className="space-y-1.5">
                {unsold.map((it) => (
                  <div key={it.id} className="rounded-md border p-2 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <p className="text-sm flex-1 truncate">{it.title || 'Untitled item'}</p>
                      {(it.market_attempts ?? 0) >= 2 && (
                        <Badge variant="destructive" className="text-[10px]">{it.market_attempts}× unsold</Badge>
                      )}
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      {(['keep', 'markdown', 'list_online', 'donate'] as LeftoverAction[]).map((a) => (
                        <Button key={a} size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => routeAll([it], a)}>
                          {a === 'keep' ? 'Keep' : a === 'markdown' ? '−20%' : a === 'list_online' ? 'List online' : 'Donate'}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Big({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-lg bg-muted/60 p-3">
      <p className="text-[11px] text-muted-foreground leading-tight">{label}</p>
      <p className={cn('text-xl font-bold tabular-nums mt-1', tone === 'good' && 'text-green-600', tone === 'bad' && 'text-destructive')}>{value}</p>
    </div>
  );
}

function Line({ k, v, warn, bold }: { k: string; v: string; warn?: boolean; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 col-span-1">
      <span className="text-muted-foreground">{k}</span>
      <span className={cn('tabular-nums', bold && 'font-semibold', warn && 'text-destructive')}>{v}</span>
    </div>
  );
}
