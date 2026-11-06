import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, CalendarDays, MapPin, Pencil, Play, Trash2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useItems } from '@/hooks/useInventory';
import {
  useBundleRules,
  useDeleteEvent,
  useEvents,
  usePhases,
  useSales,
  useUndoSale,
  useUpdateEvent,
  type SaleRow,
} from '@/hooks/useMarket';
import { MarketSell } from '@/components/market/MarketSell';
import { EventPlan } from '@/components/market/EventPlan';
import { EventReview } from '@/components/market/EventReview';
import { EventFormDialog } from '@/components/market/EventFormDialog';
import { sanitizeError } from '@/lib/errorHandler';

const money = (n: number) => `$${n.toFixed(2)}`;

export default function MarketEvent() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: events = [], isLoading } = useEvents();
  const event = events.find((e) => e.id === id);
  const { data: items = [] } = useItems();
  const { data: sales = [] } = useSales(id);
  const { data: phases = [] } = usePhases(id);
  const { data: rules = [] } = useBundleRules();
  const updateEvent = useUpdateEvent();
  const deleteEvent = useDeleteEvent();
  const undoSale = useUndoSale();

  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<string | null>(null);

  if (isLoading) return <p className="p-4 text-muted-foreground">Loading…</p>;
  if (!event) {
    return (
      <div className="p-4 space-y-3">
        <p>That market wasn’t found.</p>
        <Button asChild variant="outline"><Link to="/market">Back to markets</Link></Button>
      </div>
    );
  }

  const activeTab = tab ?? (event.status === 'open' ? 'sell' : event.status === 'closed' ? 'review' : 'plan');

  const startMarket = async () => {
    try {
      await updateEvent.mutateAsync({ id: event.id, status: 'open' });
      setTab('sell');
    } catch (e) {
      toast.error(sanitizeError(e));
    }
  };

  const remove = async () => {
    const n = sales.length;
    const warning = n
      ? `Delete ${event.name} and its ${n} sale${n === 1 ? '' : 's'}? The items stay marked sold — undo sales first if they should go back on the shelf.`
      : `Delete ${event.name}?`;
    if (!window.confirm(warning)) return;
    try {
      await deleteEvent.mutateAsync(event.id);
      navigate('/market');
    } catch (e) {
      toast.error(sanitizeError(e));
    }
  };

  const undo = async (sale: SaleRow) => {
    if (!window.confirm(`Undo this ${money(sale.total)} sale? Its items go back to unsold.`)) return;
    try {
      await undoSale.mutateAsync(sale);
      toast.success('Sale undone');
    } catch (e) {
      toast.error(sanitizeError(e));
    }
  };

  return (
    <div className="p-4 space-y-3 pb-24">
      <div className="flex items-start gap-2 pt-1">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <Link to="/market"><ArrowLeft className="w-5 h-5" /></Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">{event.name}</h1>
          <p className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" />{event.event_date}</span>
            {event.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{event.location}</span>}
            {event.start_time && event.end_time && <span>{event.start_time}–{event.end_time}</span>}
            <Badge variant={event.status === 'open' ? 'default' : 'secondary'} className="text-[10px]">{event.status}</Badge>
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setEditing(true)} aria-label="Edit market"><Pencil className="w-4 h-4" /></Button>
        <Button variant="ghost" size="icon" onClick={remove} aria-label="Delete market"><Trash2 className="w-4 h-4" /></Button>
      </div>

      {event.status === 'planned' && (
        <Button className="w-full gap-2" onClick={startMarket} disabled={updateEvent.isPending}>
          <Play className="w-4 h-4" /> Open the market — start selling
        </Button>
      )}

      <Tabs value={activeTab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="sell">Sell</TabsTrigger>
          <TabsTrigger value="sales">Sales{sales.length ? ` (${sales.length})` : ''}</TabsTrigger>
          <TabsTrigger value="plan">Plan</TabsTrigger>
          <TabsTrigger value="review">Review</TabsTrigger>
        </TabsList>

        <TabsContent value="sell" className="mt-3">
          <MarketSell event={event} items={items} sales={sales} phases={phases} rules={rules} />
        </TabsContent>

        <TabsContent value="sales" className="mt-3 space-y-2">
          {sales.length === 0 && <p className="text-sm text-muted-foreground">No sales yet.</p>}
          {[...sales].reverse().map((s) => (
            <Card key={s.id}>
              <CardContent className="p-3 space-y-1.5">
                <div className="flex items-center gap-2">
                  <p className="text-sm text-muted-foreground flex-1">
                    {new Date(s.sold_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · <span className="capitalize">{s.payment_method}</span>
                    {s.bundle_label && ` · ${s.bundle_label}`}
                  </p>
                  <p className="font-semibold tabular-nums">{money(s.total)}</p>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => undo(s)} aria-label="Undo sale">
                    <Undo2 className="w-4 h-4" />
                  </Button>
                </div>
                {s.lines.map((l) => (
                  <div key={l.id} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 truncate">{l.item?.title ?? 'Deleted item'}</span>
                    {l.tag_price != null && l.tag_price !== l.sold_price && (
                      <span className="text-xs text-muted-foreground line-through tabular-nums">{money(l.tag_price)}</span>
                    )}
                    <span className="tabular-nums">{money(l.sold_price)}</span>
                  </div>
                ))}
                {(s.tax_amount > 0 || s.fee_amount > 0) && (
                  <p className="text-xs text-muted-foreground">
                    {s.tax_amount > 0 && `tax ${money(s.tax_amount)} `}
                    {s.fee_amount > 0 && `fee ${money(s.fee_amount)}`}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="plan" className="mt-3">
          <EventPlan event={event} items={items} phases={phases} />
        </TabsContent>

        <TabsContent value="review" className="mt-3">
          <EventReview event={event} items={items} sales={sales} />
        </TabsContent>
      </Tabs>

      <EventFormDialog open={editing} onOpenChange={setEditing} event={event} />
    </div>
  );
}
