import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, Plus, Printer, Trash2, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useCategories, useLocationSearchOptions, type Item } from '@/hooks/useInventory';
import { useWorkflowSettings } from '@/hooks/useUserPreferences';
import {
  usePackItems,
  useSavePhases,
  useSetMarketPrices,
  type MarketEvent,
  type PhaseRow,
} from '@/hooks/useMarket';
import { parseQuery, searchItems } from '@/lib/itemSearch';
import {
  averageCostShare,
  boothFeeShare,
  breakEvenSales,
  bringScore,
  cents,
  defaultPhases,
  itemBasis,
  looksBulky,
  suggestTagPrice,
  type MarkdownPhase,
} from '@/lib/market';
import { sanitizeError } from '@/lib/errorHandler';

const SELLABLE = new Set(['acquired', 'refurbishing', 'ready_to_list', 'listed']);
const money = (n: number) => `$${n.toFixed(0)}`;

const daysSince = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : Math.floor((Date.now() - t) / 86_400_000);
};

const listedDaysOf = (it: Item): number | null =>
  it.status === 'listed' ? daysSince(it.fb_listed_date ?? it.updated_at) : null;

const shiftDate = (isoDate: string, days: number): string => {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d + days).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
};

interface Props {
  event: MarketEvent;
  items: Item[];
  phases: PhaseRow[];
}

export function EventPlan({ event, items, phases }: Props) {
  const settings = useWorkflowSettings();
  const { data: categories = [] } = useCategories();
  const searchOpts = useLocationSearchOptions();
  const pack = usePackItems();
  const setPrices = useSetMarketPrices();
  const savePhases = useSavePhases(event.id);

  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showAll, setShowAll] = useState(false);

  const categoryName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  const packed = useMemo(() => items.filter((i) => i.packed_for_event_id === event.id), [items, event.id]);
  const packedIds = useMemo(() => new Set(packed.map((i) => i.id)), [packed]);

  // ── Break-even ────────────────────────────────────────────────────────────
  const costShare = averageCostShare(packed);
  const breakEven = breakEvenSales(event.booth_fee, event.other_costs, costShare);
  const expectedGross = cents(packed.reduce((s, i) => s + (i.tag_price ?? i.target_price ?? 0), 0));
  const boothShare = boothFeeShare(event.booth_fee, expectedGross);

  // ── Bring-list candidates ─────────────────────────────────────────────────
  const candidates = useMemo(() => {
    let pool = items.filter((i) => SELLABLE.has(i.status) && i.packed_for_event_id !== event.id);
    if (categoryFilter !== 'all') pool = pool.filter((i) => i.category_id === categoryFilter);
    if (statusFilter !== 'all') pool = pool.filter((i) => i.status === statusFilter);
    const terms = parseQuery(query);
    if (terms.length) pool = searchItems(pool, terms, searchOpts).map((h) => h.item);
    const scored = pool.map((it) => {
      const price = it.tag_price ?? it.target_price;
      const margin = price && price > 0 ? ((price - itemBasis(it)) / price) * 100 : null;
      const listedDays = listedDaysOf(it);
      const score = bringScore({
        status: it.status,
        listedDays,
        margin,
        hasTag: it.tag_price != null,
        marketAttempts: it.market_attempts ?? 0,
        bulkyHint: looksBulky(it.category_id ? categoryName.get(it.category_id) : null, it.title),
      });
      return { it, margin, listedDays, score };
    });
    return terms.length ? scored : scored.sort((a, b) => b.score - a.score);
  }, [items, event.id, categoryFilter, statusFilter, query, categoryName, searchOpts]);

  const shown = showAll ? candidates : candidates.slice(0, 25);

  const doPack = async (ids: string[], eventId: string | null) => {
    try {
      await pack.mutateAsync({ itemIds: ids, eventId });
    } catch (e) {
      toast.error(sanitizeError(e));
    }
  };

  // ── Tag prices ────────────────────────────────────────────────────────────
  const needTag = packed.filter((i) => i.tag_price == null && (i.floor_price ?? i.target_price) != null);
  const noPriceAtAll = packed.filter((i) => i.tag_price == null && i.floor_price == null && i.target_price == null);

  const fillTags = async () => {
    try {
      await setPrices.mutateAsync(
        needTag.map((i) => {
          const floor = i.floor_price ?? i.target_price ?? 0;
          return {
            id: i.id,
            floor_price: i.floor_price ?? floor,
            tag_price: suggestTagPrice(floor, settings.marketTagBufferPercent, settings.marketRoundStep),
          };
        })
      );
      toast.success(`Tagged ${needTag.length} item${needTag.length === 1 ? '' : 's'}`);
    } catch (e) {
      toast.error(sanitizeError(e));
    }
  };

  // ── Reminders ─────────────────────────────────────────────────────────────
  const listedPacked = packed.filter((i) => i.status === 'listed');

  // ── Phases ────────────────────────────────────────────────────────────────
  const [draft, setDraft] = useState<MarkdownPhase[] | null>(null);
  const phaseList: MarkdownPhase[] = draft ?? phases.map(({ label, starts_at, percent_off }) => ({ label, starts_at, percent_off }));

  const updatePhase = (idx: number, patch: Partial<MarkdownPhase>) =>
    setDraft(phaseList.map((p, i) => (i === idx ? { ...p, ...patch } : p)));

  const persistPhases = async () => {
    const bad = phaseList.find((p) => !/^\d{1,2}:\d{2}$/.test(p.starts_at) || p.percent_off < 0 || p.percent_off > 90);
    if (bad) {
      toast.error(`Check the phase “${bad.label || 'unnamed'}” — use a time like 13:00 and 0–90%.`);
      return;
    }
    try {
      await savePhases.mutateAsync(phaseList.map((p) => ({ ...p, label: p.label.trim() || 'Phase' })));
      setDraft(null);
      toast.success('Markdown schedule saved');
    } catch (e) {
      toast.error(sanitizeError(e));
    }
  };

  return (
    <div className="space-y-4">
      {/* Break-even */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Break-even</CardTitle>
          <CardDescription>
            (booth fee + costs) ÷ (1 − average cost share of what you bring)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Costs" value={`$${(event.booth_fee + event.other_costs).toFixed(0)}`} />
            <Stat label="Break-even sales" value={breakEven != null ? `$${breakEven.toFixed(0)}` : '—'} />
            <Stat label="Packed at tag" value={`$${expectedGross.toFixed(0)}`} />
          </div>
          {packed.length === 0 && <p className="text-muted-foreground text-xs">Pack some items below to see a real number.</p>}
          {breakEven != null && expectedGross > 0 && breakEven > expectedGross && (
            <p className="flex items-start gap-2 text-destructive text-xs">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              Even if everything sold at full tag you’d fall short of break-even. Bring more, or skip this one.
            </p>
          )}
          {boothShare != null && event.booth_fee > 0 && (
            <p className={cn('text-xs', boothShare > 0.2 ? 'text-destructive' : 'text-muted-foreground')}>
              Booth fee is {(boothShare * 100).toFixed(0)}% of what you’re bringing (guides want ≤ 15–20% of sales, so aim for
              realistic sell-through, not 100%).
            </p>
          )}
        </CardContent>
      </Card>

      {/* Tags */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Tag prices</CardTitle>
          <CardDescription>Sticker = floor + {settings.marketTagBufferPercent}% buffer. Buyers only ever see the tag.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {needTag.length > 0 && (
            <Button size="sm" variant="outline" className="gap-2" onClick={fillTags} disabled={setPrices.isPending}>
              <Wand2 className="w-4 h-4" />
              Fill {needTag.length} missing tag{needTag.length === 1 ? '' : 's'} from target price
            </Button>
          )}
          {needTag.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Uses each item’s floor (or its target price, which then becomes the floor) and adds your buffer. Edit any item to change it.
            </p>
          )}
          {noPriceAtAll.length > 0 && (
            <p className="text-xs text-destructive">
              {noPriceAtAll.length} packed item{noPriceAtAll.length === 1 ? ' has' : 's have'} no price at all — set a floor on the item first.
            </p>
          )}
          {needTag.length === 0 && noPriceAtAll.length === 0 && packed.length > 0 && (
            <p className="text-xs text-muted-foreground">Everything packed has a tag.</p>
          )}
          <Button asChild size="sm" className="gap-2" disabled={packed.length === 0}>
            <Link to={`/market/${event.id}/tags`} aria-disabled={packed.length === 0}>
              <Printer className="w-4 h-4" />
              Print tags ({packed.length})
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Bring list */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Bring list · {packed.length} packed</CardTitle>
          <CardDescription>
            Bulky or fragile things and listings stuck 30+ days sell better in person, so they’re ranked first.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {packed.length > 0 && (
            <div className="space-y-1">
              {packed.map((it) => (
                <PackRow key={it.id} item={it} packed onToggle={() => doPack([it.id], null)} />
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => window.confirm('Unpack everything for this market?') && doPack([...packedIds], null)}
              >
                Unpack all
              </Button>
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search items…"
              className="h-9 flex-1 min-w-[10rem]"
            />
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-9 w-36"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-32"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any status</SelectItem>
                <SelectItem value="listed">Listed</SelectItem>
                <SelectItem value="ready_to_list">Ready to list</SelectItem>
                <SelectItem value="acquired">Acquired</SelectItem>
                <SelectItem value="refurbishing">Refurbishing</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {candidates.length > 0 && !query && (
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={() => doPack(candidates.slice(0, 20).map((c) => c.it.id), event.id)}
            >
              <Plus className="w-4 h-4" /> Pack top 20 suggestions
            </Button>
          )}

          <div className="space-y-1">
            {shown.map(({ it, margin, listedDays }) => (
              <PackRow
                key={it.id}
                item={it}
                margin={margin}
                listedDays={listedDays}
                onToggle={() => doPack([it.id], event.id)}
              />
            ))}
            {candidates.length === 0 && <p className="text-sm text-muted-foreground">No other sellable items match.</p>}
            {!showAll && candidates.length > shown.length && (
              <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
                Show all {candidates.length}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Reminders */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Before & after</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="font-medium">{shiftDate(event.event_date, -1)}:</span>{' '}
            {listedPacked.length > 0
              ? `pause ${listedPacked.length} online listing${listedPacked.length === 1 ? '' : 's'} so nothing sells twice.`
              : 'none of your packed items are listed online — nothing to pause.'}
          </p>
          {listedPacked.length > 0 && (
            <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-0.5">
              {listedPacked.slice(0, 12).map((i) => (
                <li key={i.id} className="truncate">{i.title || 'Untitled item'}</li>
              ))}
              {listedPacked.length > 12 && <li>…and {listedPacked.length - 12} more</li>}
            </ul>
          )}
          <p>
            <span className="font-medium">{shiftDate(event.event_date, 2)}:</span> relist whatever didn’t sell (the Review tab routes leftovers).
          </p>
          <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-0.5">
            <li>Arrive 1–2 hours before opening; bring a canopy, weights and waterproof covers.</li>
            <li>Test your card reader and this app on your phone’s data connection before you leave.</li>
            <li>Hide extra stock under the table, vary heights, put eye-catchers at the front edges.</li>
          </ul>
        </CardContent>
      </Card>

      {/* Markdown schedule */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Markdown schedule</CardTitle>
          <CardDescription>
            Market Mode follows the clock and suggests these discounts — never below an item’s floor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {phaseList.map((p, i) => (
            <div key={p.id ?? i} className="flex items-center gap-2">
              <Input value={p.label} onChange={(e) => updatePhase(i, { label: e.target.value })} className="h-9 flex-1 min-w-0" />
              <Input
                value={p.starts_at}
                onChange={(e) => updatePhase(i, { starts_at: e.target.value })}
                placeholder="13:00"
                className="h-9 w-20"
                inputMode="numeric"
              />
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={0}
                  max={90}
                  value={p.percent_off}
                  onChange={(e) => updatePhase(i, { percent_off: Math.max(0, Math.min(90, parseFloat(e.target.value) || 0)) })}
                  className="h-9 w-16"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDraft(phaseList.filter((_, j) => j !== i))} aria-label="Remove phase">
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDraft([...phaseList, { label: 'New phase', starts_at: event.start_time ?? '12:00', percent_off: 10 }])}
            >
              Add phase
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDraft(defaultPhases(event.start_time, event.end_time))}
            >
              Use suggested steps
            </Button>
            {draft && (
              <Button size="sm" onClick={persistPhases} disabled={savePhases.isPending}>
                Save schedule
              </Button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            On a two-day market: sell fresh high-margin stock on day one, mark leftovers down hard on day two.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/60 p-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}

function PackRow({
  item,
  packed,
  margin,
  listedDays,
  onToggle,
}: {
  item: Item;
  packed?: boolean;
  margin?: number | null;
  listedDays?: number | null;
  onToggle: () => void;
}) {
  const tag = item.tag_price ?? item.target_price;
  return (
    <div className="flex items-center gap-2 rounded-md border p-2">
      {item.photos?.[0] ? (
        <img src={item.photos[0]} alt="" className="w-9 h-9 rounded object-cover flex-shrink-0" />
      ) : (
        <div className="w-9 h-9 rounded bg-muted flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">{item.title || 'Untitled item'}</p>
        <div className="flex flex-wrap gap-1 mt-0.5">
          {tag != null && <Badge variant="outline" className="text-[10px]">{money(tag)}</Badge>}
          {item.tag_price == null && <Badge variant="secondary" className="text-[10px]">no tag</Badge>}
          {margin != null && <Badge variant="outline" className="text-[10px]">{Math.round(margin)}% margin</Badge>}
          {listedDays != null && listedDays >= 14 && (
            <Badge variant="secondary" className="text-[10px]">listed {listedDays}d</Badge>
          )}
          {(item.market_attempts ?? 0) > 0 && (
            <Badge variant={(item.market_attempts ?? 0) >= 2 ? 'destructive' : 'secondary'} className="text-[10px]">
              {item.market_attempts}× at market
            </Badge>
          )}
        </div>
      </div>
      <Button size="sm" variant={packed ? 'secondary' : 'outline'} className="h-8" onClick={onToggle}>
        {packed ? 'Unpack' : 'Pack'}
      </Button>
    </div>
  );
}
