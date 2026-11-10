import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarDays, MapPin, Plus, Store, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useItems } from '@/hooks/useInventory';
import { useWorkflowSettings } from '@/hooks/useUserPreferences';
import { useEvents, useSales, type MarketEvent } from '@/hooks/useMarket';
import { EventFormDialog } from '@/components/market/EventFormDialog';
import { BundleRulesCard } from '@/components/market/BundleRulesCard';
import { MarketAnalytics } from '@/components/market/MarketAnalytics';
import { eventHours, itemBasis, reviewEvent, verdictLabels, type EventReview as Review } from '@/lib/market';

const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toFixed(0)}`;

const statusLabel: Record<MarketEvent['status'], string> = { planned: 'Planned', open: 'Open now', closed: 'Closed' };

export default function Market() {
  const navigate = useNavigate();
  const settings = useWorkflowSettings();
  const { data: events = [], isLoading } = useEvents();
  const { data: sales = [] } = useSales();
  const { data: items = [] } = useItems();
  const [creating, setCreating] = useState(false);

  const reviews = useMemo(() => {
    const out = new Map<string, Review>();
    for (const ev of events) {
      const evSales = sales.filter((s) => s.event_id === ev.id);
      const brought = new Set<string>([
        ...items.filter((i) => i.packed_for_event_id === ev.id).map((i) => i.id),
        ...evSales.flatMap((s) => s.lines.map((l) => l.item_id).filter(Boolean) as string[]),
      ]).size + evSales.reduce((n, s) => n + s.lines.filter((l) => !l.item_id).length, 0);
      out.set(
        ev.id,
        reviewEvent(
          ev,
          eventHours(ev.start_time, ev.end_time),
          brought,
          evSales.map((s) => ({
            sold_at: s.sold_at,
            payment_method: s.payment_method,
            total: s.total,
            tax_amount: s.tax_amount,
            fee_amount: s.fee_amount,
            discount_amount: s.discount_amount,
            lines: s.lines.map((l) => ({ sold_price: l.sold_price, tag_price: l.tag_price, cost: l.item ? itemBasis(l.item) : 0 })),
          }))
        )
      );
    }
    return out;
  }, [events, sales, items]);

  const closed = events.filter((e) => e.status === 'closed');
  const active = events.filter((e) => e.status !== 'closed');

  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Store className="w-6 h-6" /> Markets
        </h1>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link to="/sales">
              <DollarSign className="w-4 h-4" /> Sales Hub
            </Link>
          </Button>
          <Button onClick={() => setCreating(true)} size="sm" className="gap-1.5">
            <Plus className="w-4 h-4" /> New market
          </Button>
        </div>
      </div>

      {isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}

      {!isLoading && events.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center space-y-3">
            <Store className="w-10 h-10 mx-auto text-muted-foreground" />
            <p className="font-medium">Sell at a flea market, swap meet or craft fair</p>
            <p className="text-sm text-muted-foreground">
              Plan the booth math, pick what to bring, print tags, ring up sales and see what each market really earned.
            </p>
            <Button onClick={() => setCreating(true)}>Plan your first market</Button>
          </CardContent>
        </Card>
      )}

      {active.length > 0 && (
        <div className="space-y-2">
          {active.map((ev) => (
            <EventCard key={ev.id} event={ev} review={reviews.get(ev.id)} />
          ))}
        </div>
      )}

      {closed.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Compare markets</CardTitle>
            <CardDescription>Best profit per hour first. Thresholds are in Settings → Workflow.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1 pr-2 font-medium">Market</th>
                  <th className="py-1 px-2 font-medium text-right">Sales</th>
                  <th className="py-1 px-2 font-medium text-right">Profit</th>
                  <th className="py-1 px-2 font-medium text-right">$/hr</th>
                  <th className="py-1 px-2 font-medium text-right">Sold</th>
                  <th className="py-1 pl-2 font-medium text-right">Booth</th>
                </tr>
              </thead>
              <tbody>
                {[...closed]
                  .sort((a, b) => (reviews.get(b.id)?.profitPerHour ?? -Infinity) - (reviews.get(a.id)?.profitPerHour ?? -Infinity))
                  .map((ev) => {
                    const r = reviews.get(ev.id);
                    if (!r) return null;
                    return (
                      <tr key={ev.id} className="border-t">
                        <td className="py-1.5 pr-2">
                          <Link to={`/market/${ev.id}`} className="font-medium hover:underline">{ev.name}</Link>
                          <span className="block text-[11px] text-muted-foreground">
                            {ev.event_date}
                            {ev.verdict && ` · ${verdictLabels[ev.verdict]}`}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums">{money(r.gross)}</td>
                        <td className={cn('py-1.5 px-2 text-right tabular-nums', r.profit < 0 && 'text-destructive')}>{money(r.profit)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums">{r.profitPerHour != null ? money(r.profitPerHour) : '—'}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums">{r.sellThrough != null ? `${Math.round(r.sellThrough * 100)}%` : '—'}</td>
                        <td className="py-1.5 pl-2 text-right tabular-nums">
                          {r.boothShareOfGross != null ? `${Math.round(r.boothShareOfGross * 100)}%` : '—'}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <MarketAnalytics closedEventCount={closed.length} />

      {closed.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-2">Past markets</p>
          {closed.map((ev) => (
            <EventCard key={ev.id} event={ev} review={reviews.get(ev.id)} goodAt={settings.marketGoodProfitPerHour} />
          ))}
        </div>
      )}

      <BundleRulesCard />

      <EventFormDialog open={creating} onOpenChange={setCreating} onCreated={(ev) => navigate(`/market/${ev.id}`)} />
    </div>
  );
}

function EventCard({ event, review, goodAt }: { event: MarketEvent; review?: Review; goodAt?: number }) {
  return (
    <Link to={`/market/${event.id}`} className="block">
      <Card className="hover:bg-muted/40 transition-colors">
        <CardContent className="p-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium truncate">{event.name}</p>
              <Badge variant={event.status === 'open' ? 'default' : 'secondary'} className="text-[10px]">
                {statusLabel[event.status]}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
              <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" />{event.event_date}</span>
              {event.location && <span className="flex items-center gap-1 truncate"><MapPin className="w-3 h-3" />{event.location}</span>}
            </p>
          </div>
          {review && review.saleCount > 0 && (
            <div className="text-right">
              <p className="font-semibold tabular-nums">{money(review.gross)}</p>
              <p className={cn('text-xs tabular-nums', review.profit < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                {money(review.profit)} profit
              </p>
              {goodAt != null && review.profitPerHour != null && review.profitPerHour >= goodAt && (
                <p className="text-[10px] text-green-600">strong</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
