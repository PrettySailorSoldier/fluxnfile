import { useMemo, useState } from 'react';
import { useItems, statusConfig, ItemStatus } from '@/hooks/useInventory';
import { useSales } from '@/hooks/useMarket';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, TrendingUp, TrendingDown, Package, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PERIOD_LABELS, summarize, type Bucket, type Period } from '@/lib/analytics';

const PERIODS = Object.keys(PERIOD_LABELS) as Period[];
const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toFixed(0)}`;

export default function Analytics() {
  const { data: items = [] } = useItems();
  const { data: sales = [] } = useSales();
  const [period, setPeriod] = useState<Period>('30d');

  const sold = useMemo(() => items.filter((i) => i.status === 'sold' || i.status === 'shipped'), [items]);
  const s = useMemo(() => summarize(sold, sales, period), [sold, sales, period]);

  const statusCounts = items.reduce(
    (acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  if (items.length === 0 && sales.length === 0) {
    return (
      <div className="p-4 space-y-4 pb-24">
        <h1 className="text-2xl font-bold text-foreground pt-2">Analytics</h1>
        <Card className="bg-secondary/30 border-dashed">
          <CardContent className="py-12 text-center">
            <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-semibold text-foreground mb-1">No data yet</h3>
            <p className="text-sm text-muted-foreground">Add items and make sales to see analytics</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 pb-24">
      <h1 className="text-2xl font-bold text-foreground pt-2">Analytics</h1>

      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4">
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={cn(
              'flex-shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              period === p
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:text-foreground'
            )}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat icon={<DollarSign className="w-4 h-4" />} label="Revenue" value={money(s.revenue)} sub={`${s.count} sale${s.count === 1 ? '' : 's'} · ${PERIOD_LABELS[period].toLowerCase()}`} />
        <Stat
          icon={s.profit >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          label="Profit"
          value={`${s.profit >= 0 ? '+' : ''}${money(s.profit)}`}
          tone={s.profit >= 0 ? 'good' : 'bad'}
          sub={`${s.margin.toFixed(0)}% margin`}
        />
        <Stat
          icon={<Package className="w-4 h-4" />}
          label="Avg per sale"
          value={`${s.avgProfit >= 0 ? '+' : ''}$${s.avgProfit.toFixed(2)}`}
          tone={s.avgProfit >= 0 ? 'good' : 'bad'}
          sub="net profit"
        />
        <Stat icon={<BarChart3 className="w-4 h-4" />} label="Items" value={String(items.length)} sub="in the system" />
      </div>

      {s.unpriced > 0 && (
        <p className="text-xs text-amber-600 rounded-lg bg-amber-500/10 px-3 py-2">
          {s.unpriced} sold item{s.unpriced === 1 ? ' has' : 's have'} no sale price recorded, so revenue is understated and profit uses
          the asking price. Open them and enter what they sold for.
        </p>
      )}
      {s.quickCount > 0 && (
        <p className="text-xs text-muted-foreground px-1">
          Includes {s.quickCount} quick sale{s.quickCount === 1 ? '' : 's'} ({money(s.quickRevenue)}) that weren’t inventory items.
        </p>
      )}

      <BucketCard title="Where it sold" rows={s.byChannel} />
      <MonthChart rows={s.byMonth} />
      <BucketCard title="Top categories by profit" rows={s.byCategory} />
      <BucketCard title="Top sources by profit" rows={s.bySource} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Inventory by Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(Object.keys(statusConfig) as ItemStatus[]).map((status) => {
            const count = statusCounts[status] || 0;
            const percentage = items.length > 0 ? (count / items.length) * 100 : 0;
            return (
              <div key={status} className="flex items-center gap-3">
                <div className={cn('w-3 h-3 rounded-full', statusConfig[status].className)} />
                <span className="text-sm flex-1">{statusConfig[status].label}</span>
                <span className="text-sm font-medium">{count}</span>
                <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                  <div className={cn('h-full', statusConfig[status].className)} style={{ width: `${percentage}%` }} />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone?: 'good' | 'bad';
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          {icon}
          <span className="text-xs">{label}</span>
        </div>
        <p className={cn('text-xl font-bold', tone === 'good' && 'text-success', tone === 'bad' && 'text-destructive')}>{value}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

function BucketCard({ title, rows }: { title: string; rows: Bucket[] }) {
  if (rows.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((r, index) => (
          <div key={r.key} className="flex items-center gap-3">
            <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-medium">
              {index + 1}
            </span>
            <span className="text-sm flex-1 truncate">{r.label}</span>
            <span className="text-xs text-muted-foreground">
              {r.count} · {money(r.revenue)}
            </span>
            <span className={cn('text-sm font-medium w-14 text-right', r.profit >= 0 ? 'text-success' : 'text-destructive')}>
              {r.profit >= 0 ? '+' : ''}
              {money(r.profit)}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function MonthChart({ rows }: { rows: Bucket[] }) {
  if (rows.length < 2) return null;
  const max = Math.max(1, ...rows.map((r) => r.revenue));
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">By month</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-2 text-sm">
            <span className="w-14 text-muted-foreground">{r.label}</span>
            <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${Math.max(2, (r.revenue / max) * 100)}%` }} />
            </div>
            <span className="w-24 text-right text-xs tabular-nums text-muted-foreground">
              {money(r.revenue)} · <span className={r.profit < 0 ? 'text-destructive' : ''}>{money(r.profit)}</span>
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
