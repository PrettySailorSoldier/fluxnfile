import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useCategories } from '@/hooks/useInventory';
import { useSales } from '@/hooks/useMarket';
import { cents, grossMarginPercent, itemBasis } from '@/lib/market';

const money = (n: number) => `$${n.toFixed(0)}`;

interface Bucket {
  label: string;
  count: number;
  revenue: number;
  cost: number;
}

function bump(map: Map<string, Bucket>, key: string, label: string, revenue: number, cost: number) {
  const b = map.get(key) ?? { label, count: 0, revenue: 0, cost: 0 };
  b.count += 1;
  b.revenue += revenue;
  b.cost += cost;
  map.set(key, b);
}

const tierOf = (p: number) => (p < 5 ? 'Under $5' : p < 10 ? '$5–9' : p < 25 ? '$10–24' : '$25+');
const TIER_ORDER = ['Under $5', '$5–9', '$10–24', '$25+'];

/** What sells at markets: by hour, price tier, category and payment, plus the “10 market days” margin check. */
export function MarketAnalytics({ closedEventCount }: { closedEventCount: number }) {
  const { data: sales = [] } = useSales();
  const { data: categories = [] } = useCategories();

  const stats = useMemo(() => {
    const catName = new Map(categories.map((c) => [c.id, c.name]));
    const byHour = new Map<string, Bucket>();
    const byTier = new Map<string, Bucket>();
    const byCat = new Map<string, Bucket>();
    const byPay = new Map<string, Bucket>();
    let gross = 0;
    let cogs = 0;
    let daysTotal = 0;
    let daysN = 0;

    for (const s of sales) {
      const hour = new Date(s.sold_at).getHours();
      bump(byPay, s.payment_method, s.payment_method, s.total, 0);
      for (const l of s.lines) {
        const cost = l.item ? itemBasis(l.item) : 0;
        gross += l.sold_price;
        cogs += cost;
        bump(byHour, String(hour).padStart(2, '0'), `${hour % 12 || 12}${hour < 12 ? 'am' : 'pm'}`, l.sold_price, cost);
        bump(byTier, tierOf(l.tag_price ?? l.sold_price), tierOf(l.tag_price ?? l.sold_price), l.sold_price, cost);
        const cn = (l.item?.category_id && catName.get(l.item.category_id)) || 'Uncategorized';
        bump(byCat, cn, cn, l.sold_price, cost);
        if (l.item?.acquisition_date) {
          const d = (new Date(s.sold_at).getTime() - new Date(l.item.acquisition_date).getTime()) / 86_400_000;
          if (d >= 0 && d < 3650) {
            daysTotal += d;
            daysN += 1;
          }
        }
      }
    }
    return {
      hours: [...byHour.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v),
      tiers: TIER_ORDER.map((t) => byTier.get(t)).filter(Boolean) as Bucket[],
      cats: [...byCat.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 8),
      pay: [...byPay.values()].sort((a, b) => b.revenue - a.revenue),
      margin: grossMarginPercent(gross, cogs),
      avgDays: daysN ? Math.round(daysTotal / daysN) : null,
      lineCount: sales.reduce((n, s) => n + s.lines.length, 0),
      gross: cents(gross),
    };
  }, [sales, categories]);

  if (sales.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">What sells at markets</CardTitle>
        <CardDescription>
          {sales.length} sales · {stats.lineCount} items · {money(stats.gross)}
          {stats.avgDays != null && ` · ${stats.avgDays} days from purchase to market sale on average`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg bg-muted/60 p-3 text-sm">
          <p className="font-medium">
            Gross margin: {stats.margin != null ? `${Math.round(stats.margin)}%` : '—'}{' '}
            <span className="text-muted-foreground font-normal">· {closedEventCount} of ~10 market days logged</span>
          </p>
          {closedEventCount >= 10 && stats.margin != null && stats.margin < 40 && (
            <p className="text-xs text-destructive mt-1">
              Below 40% after 10 market days — the playbook says change your prices, item mix, or which markets you attend.
            </p>
          )}
          {closedEventCount < 10 && (
            <p className="text-xs text-muted-foreground mt-1">
              The 40% check is meant for after about 10 market days; treat this as early signal.
            </p>
          )}
        </div>
        <BarList title="By hour of day" rows={stats.hours} />
        <BarList title="By price tier (tag)" rows={stats.tiers} />
        <BarList title="By category" rows={stats.cats} />
        <BarList title="By payment" rows={stats.pay} />
      </CardContent>
    </Card>
  );
}

function BarList({ title, rows }: { title: string; rows: Bucket[] }) {
  const max = Math.max(1, ...rows.map((r) => r.revenue));
  if (rows.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</p>
      {rows.map((r) => {
        const margin = grossMarginPercent(r.revenue, r.cost);
        return (
          <div key={r.label} className="flex items-center gap-2 text-sm">
            <span className="w-24 truncate capitalize">{r.label}</span>
            <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${(r.revenue / max) * 100}%` }} />
            </div>
            <span className="w-28 text-right text-xs tabular-nums text-muted-foreground">
              {money(r.revenue)} · {r.count}
              {r.cost > 0 && margin != null ? ` · ${Math.round(margin)}%` : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}
