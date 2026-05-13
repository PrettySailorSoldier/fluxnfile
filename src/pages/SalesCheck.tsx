import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useItems, calculateProfit, Item } from '@/hooks/useInventory';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Tag, Clock, TrendingUp, AlertCircle, ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const MS_PER_DAY = 86_400_000;

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / MS_PER_DAY);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getTitle(item: Item): string {
  return item.title || item.category?.name || `Item #${item.id.slice(0, 6)}`;
}

function daysColor(days: number): string {
  if (days > 90) return 'text-destructive font-bold';
  if (days > 45) return 'text-amber-500 font-bold';
  return 'text-muted-foreground';
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHead({
  icon,
  label,
  count,
  open,
}: {
  icon: ReactNode;
  label: string;
  count: number;
  open: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-4 py-3 bg-muted/30 w-full',
        count === 0 && 'opacity-60'
      )}
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="font-semibold text-sm flex-1 text-left">{label}</span>
      <Badge variant="secondary" className="text-xs tabular-nums">
        {count}
      </Badge>
      <ChevronDown
        className={cn(
          'w-4 h-4 text-muted-foreground transition-transform duration-200',
          !open && '-rotate-90'
        )}
      />
    </div>
  );
}

interface RepriceControlProps {
  item: Item;
  repricing: Record<string, string>;
  setRepricing: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onSave: (id: string) => void;
  isPending: boolean;
}

function RepriceControl({ item, repricing, setRepricing, onSave, isPending }: RepriceControlProps) {
  const isOpen = item.id in repricing;

  function openEdit() {
    setRepricing(prev => ({
      ...prev,
      [item.id]: item.target_price != null ? String(item.target_price) : '',
    }));
  }

  function cancel() {
    setRepricing(prev => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
  }

  if (!isOpen) {
    return (
      <Button size="sm" variant="outline" className="flex-shrink-0" onClick={openEdit}>
        Reprice
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      <div className="relative">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs pointer-events-none">
          $
        </span>
        <Input
          type="number"
          min="0"
          step="0.01"
          className="w-24 h-8 pl-5 text-sm"
          value={repricing[item.id]}
          onChange={e => setRepricing(prev => ({ ...prev, [item.id]: e.target.value }))}
          onKeyDown={e => e.key === 'Enter' && onSave(item.id)}
          autoFocus
        />
      </div>
      <Button
        size="sm"
        className="h-8 px-2"
        onClick={() => onSave(item.id)}
        disabled={isPending}
      >
        Save
      </Button>
      <Button size="sm" variant="ghost" className="h-8 px-2" onClick={cancel}>
        ✕
      </Button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SalesCheck() {
  const queryClient = useQueryClient();
  const { data: items = [], isLoading } = useItems();

  const [optimisticRemoved, setOptimisticRemoved] = useState<Set<string>>(new Set());
  const [repricing, setRepricing] = useState<Record<string, string>>({});

  const [s1Open, setS1Open] = useState(true);
  const [s2Open, setS2Open] = useState(true);
  const [s3Open, setS3Open] = useState(true);
  const [s4Open, setS4Open] = useState(true);
  const [initialized, setInitialized] = useState(false);

  // ── Derived lists ──────────────────────────────────────────────────────────

  const needsListing = useMemo(
    () =>
      items
        .filter(i => i.status === 'ready_to_list' && !optimisticRemoved.has(i.id))
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [items, optimisticRemoved]
  );

  const staleListings = useMemo(() => {
    const cutoff = Date.now() - 21 * MS_PER_DAY;
    return items
      .filter(i => i.status === 'listed' && new Date(i.created_at).getTime() < cutoff)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [items]);

  const recentSales = useMemo(() => {
    const cutoff = Date.now() - 30 * MS_PER_DAY;
    return items
      .filter(i => {
        if (!['sold', 'shipped'].includes(i.status)) return false;
        const ts = i.sale_date
          ? new Date(i.sale_date).getTime()
          : new Date(i.created_at).getTime();
        return ts >= cutoff;
      })
      .sort((a, b) => {
        const da = new Date(a.sale_date || a.created_at).getTime();
        const db = new Date(b.sale_date || b.created_at).getTime();
        return db - da;
      });
  }, [items]);

  const repriceCandidates = useMemo(() => {
    const cutoff = Date.now() - 14 * MS_PER_DAY;
    return items
      .filter(
        i =>
          i.status === 'listed' &&
          i.target_price !== null &&
          new Date(i.created_at).getTime() < cutoff
      )
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [items]);

  // ── Sales summary ──────────────────────────────────────────────────────────

  const salesRevenue = recentSales.reduce(
    (sum, i) => sum + (i.actual_price ?? i.target_price ?? 0),
    0
  );
  const salesProfit = recentSales.reduce((sum, i) => sum + calculateProfit(i).netProfit, 0);
  const salesMargin = salesRevenue > 0 ? (salesProfit / salesRevenue) * 100 : 0;

  // ── Collapse empty sections once data arrives ──────────────────────────────

  useEffect(() => {
    if (isLoading || initialized) return;
    setS1Open(needsListing.length > 0);
    setS2Open(staleListings.length > 0);
    setS3Open(recentSales.length > 0);
    setS4Open(repriceCandidates.length > 0);
    setInitialized(true);
  }, [
    isLoading,
    initialized,
    needsListing.length,
    staleListings.length,
    recentSales.length,
    repriceCandidates.length,
  ]);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const markListedMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('items').update({ status: 'listed' }).eq('id', id);
      if (error) throw error;
    },
    onMutate: (id) => {
      setOptimisticRemoved(prev => new Set([...prev, id]));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      toast.success('Marked as Listed');
    },
    onError: (_, id) => {
      setOptimisticRemoved(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.error('Failed to update');
    },
  });

  const repriceMutation = useMutation({
    mutationFn: async ({ id, price }: { id: string; price: number }) => {
      const { error } = await supabase
        .from('items')
        .update({ target_price: price })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      setRepricing(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      toast.success('Price updated');
    },
    onError: () => {
      toast.error('Failed to update price');
    },
  });

  function saveReprice(id: string) {
    const price = parseFloat(repricing[id]);
    if (isNaN(price) || price < 0) {
      toast.error('Enter a valid price');
      return;
    }
    repriceMutation.mutate({ id, price });
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="p-4 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const todayLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  // ── JSX ────────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="pt-2">
        <h1 className="text-2xl font-bold text-foreground">Sales Check</h1>
        <p className="text-sm text-muted-foreground">{todayLabel}</p>
      </div>

      {/* ── Section 1: Needs Listing ─────────────────────────────────────── */}
      <div className="rounded-lg border overflow-hidden">
        <Collapsible open={s1Open} onOpenChange={setS1Open}>
          <CollapsibleTrigger className="w-full">
            <SectionHead
              icon={<Tag className="w-4 h-4" />}
              label="Needs Listing"
              count={needsListing.length}
              open={s1Open}
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            {needsListing.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                Nothing waiting to be listed 🎉
              </p>
            ) : (
              <div className="divide-y">
                {needsListing.map(item => (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{getTitle(item)}</p>
                      {item.storage_location && (
                        <p className="text-xs text-muted-foreground">
                          {item.storage_location.name}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Cost ${item.original_cost.toFixed(2)}
                        {item.target_price != null && ` → $${item.target_price.toFixed(2)}`}
                        {' · '}
                        {daysSince(item.created_at)}d ago
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-shrink-0"
                      onClick={() => markListedMutation.mutate(item.id)}
                      disabled={markListedMutation.isPending}
                    >
                      <Tag className="w-3 h-3 mr-1" />
                      List
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* ── Section 2: Stale Listings ────────────────────────────────────── */}
      <div className="rounded-lg border overflow-hidden">
        <Collapsible open={s2Open} onOpenChange={setS2Open}>
          <CollapsibleTrigger className="w-full">
            <SectionHead
              icon={<Clock className="w-4 h-4" />}
              label="Stale Listings"
              count={staleListings.length}
              open={s2Open}
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            {staleListings.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                All listings are fresh ✓
              </p>
            ) : (
              <div className="divide-y">
                {staleListings.map(item => {
                  const days = daysSince(item.created_at);
                  return (
                    <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{getTitle(item)}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className={cn('text-xs', daysColor(days))}>{days}d listed</span>
                          {item.target_price != null && (
                            <span className="text-xs text-muted-foreground">
                              ${item.target_price.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                      <RepriceControl
                        item={item}
                        repricing={repricing}
                        setRepricing={setRepricing}
                        onSave={saveReprice}
                        isPending={repriceMutation.isPending}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* ── Section 3: Recent Sales ──────────────────────────────────────── */}
      <div className="rounded-lg border overflow-hidden">
        <Collapsible open={s3Open} onOpenChange={setS3Open}>
          <CollapsibleTrigger className="w-full">
            <SectionHead
              icon={<TrendingUp className="w-4 h-4" />}
              label="Recent Sales"
              count={recentSales.length}
              open={s3Open}
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            {recentSales.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                No sales in the last 30 days
              </p>
            ) : (
              <>
                <div className="px-4 py-2 bg-muted/20 border-b text-xs text-muted-foreground flex flex-wrap gap-x-2 gap-y-0.5">
                  <span>
                    {recentSales.length} item{recentSales.length !== 1 ? 's' : ''}
                  </span>
                  <span>·</span>
                  <span>${salesRevenue.toFixed(2)} revenue</span>
                  <span>·</span>
                  <span
                    className={cn(
                      'font-medium',
                      salesProfit >= 0 ? 'text-green-600' : 'text-red-500'
                    )}
                  >
                    {salesProfit >= 0 ? '+' : ''}${salesProfit.toFixed(2)} profit
                  </span>
                  <span>·</span>
                  <span>{salesMargin.toFixed(0)}% margin</span>
                </div>
                <div className="divide-y">
                  {recentSales.map(item => {
                    const { netProfit } = calculateProfit(item);
                    const saleDate = item.sale_date || item.created_at;
                    const soldFor = item.actual_price ?? item.target_price;
                    return (
                      <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{getTitle(item)}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(saleDate)}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          {soldFor != null && (
                            <p className="text-sm font-medium">${soldFor.toFixed(2)}</p>
                          )}
                          <p
                            className={cn(
                              'text-xs font-medium',
                              netProfit > 0 && 'text-green-600',
                              netProfit < 0 && 'text-red-500',
                              netProfit === 0 && 'text-muted-foreground'
                            )}
                          >
                            {netProfit >= 0 ? '+' : ''}${netProfit.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* ── Section 4: Reprice Candidates (omit when empty) ─────────────── */}
      {repriceCandidates.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <Collapsible open={s4Open} onOpenChange={setS4Open}>
            <CollapsibleTrigger className="w-full">
              <SectionHead
                icon={<AlertCircle className="w-4 h-4" />}
                label="Reprice Candidates"
                count={repriceCandidates.length}
                open={s4Open}
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="divide-y">
                {repriceCandidates.map(item => {
                  const days = daysSince(item.created_at);
                  return (
                    <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{getTitle(item)}</p>
                        <p className="text-xs text-muted-foreground">
                          Cost ${item.original_cost.toFixed(2)}
                          {' · '}
                          Ask ${item.target_price!.toFixed(2)}
                          {' · '}
                          {days}d
                        </p>
                      </div>
                      <RepriceControl
                        item={item}
                        repricing={repricing}
                        setRepricing={setRepricing}
                        onSave={saveReprice}
                        isPending={repriceMutation.isPending}
                      />
                    </div>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}
    </div>
  );
}
