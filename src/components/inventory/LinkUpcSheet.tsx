import { useState, useEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Package, Search, Sparkles, Loader2, Plus, Check, ChevronDown, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Item } from '@/hooks/useInventory';
import type { CodeType } from '@/lib/barcode';
import { isUnknownTitle, lookupProduct } from '@/lib/productLookup';
import { guessStickerMatch, guessTitleMatch, rankBySticker, rankByTitle } from '@/lib/scanIntake';
import { OrderDetails } from '@/components/inventory/OrderDetails';

/** Rendering thousands of order rows on a phone is slow — search narrows it */
const MAX_SHOWN = 50;

interface LinkUpcSheetProps {
  /** The scanned code (UPC/EAN, ASIN or Amazon X00 sticker) */
  upc: string | null;
  codeType?: CodeType;
  /** Product name from a lookup already done — skips looking it up again */
  hint?: string | null;
  /**
   * Items whose ASIN Amazon lists for this barcode (from a lookup already done).
   * They go to the top and the first one opens — still confirmed by the user.
   */
  suggestedIds?: string[];
  open: boolean;
  items: Item[];
  onClose: () => void;
  /** Called after the user confirms an item and the code is saved onto it. */
  onLinked: (item: Item) => void;
  /** Shows "Not in my list — add as new item" */
  onAddNew?: () => void;
}

function shortDate(value: string | null | undefined): string | null {
  const m = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;
}

/**
 * "Which item is this?" — shown when a scanned code isn't linked to an item
 * yet. Ranks the list by the looked-up product name (or the words read off an
 * X00 sticker), opens the best guess's full order details, and only saves the
 * code once the user confirms "This is it". Nothing is matched on a guess.
 */
export function LinkUpcSheet({
  upc,
  codeType = 'upc',
  hint,
  suggestedIds,
  open,
  items,
  onClose,
  onLinked,
  onAddNew,
}: LinkUpcSheetProps) {
  const [search, setSearch] = useState('');
  /** The order whose details are open */
  const [openId, setOpenId] = useState<string | null>(null);
  const autoOpened = useRef(false);

  useEffect(() => {
    if (!open) {
      setSearch('');
      setOpenId(null);
      autoOpened.current = false;
    }
  }, [open]);

  // Best-effort product lookup — linking works fine without it
  const { data: lookup, isLoading: isLookingUp } = useQuery({
    queryKey: ['upc-lookup', upc, codeType],
    queryFn: () => lookupProduct(upc!, codeType),
    enabled: open && !!upc && hint === undefined,
    staleTime: Infinity,
    retry: false,
  });
  const productName = hint !== undefined ? hint : lookup?.found ? lookup.title : null;

  // Stickers print the order title ("Taramico Tennis Bracelets…"), but once the catalog
  // is imported an item's title drops the brand — match against brand + title.
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const searchable = useMemo(
    () =>
      items.map((i) => {
        const brand = i.brand?.trim();
        const title = i.title ?? '';
        const named = brand && !title.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${title}` : title;
        return { ...i, title: i.title ? named : i.title };
      }),
    [items]
  );

  /**
   * Items whose ASIN Amazon returns for this barcode → their rank in Amazon's
   * results (0 = top). From the caller's lookup, or this sheet's own.
   */
  const onAmazon = useMemo(() => {
    const out = new Map<string, number>();
    (suggestedIds ?? []).forEach((id, i) => out.set(id, i));
    const asins = codeType === 'upc' && lookup?.found ? lookup.candidateAsins ?? [] : [];
    if (asins.length) {
      const rank = new Map(asins.map((a, i) => [a.toUpperCase(), i]));
      for (const item of items) {
        const r = item.amazon_asin ? rank.get(item.amazon_asin.trim().toUpperCase()) : undefined;
        if (r !== undefined && !out.has(item.id)) out.set(item.id, r);
      }
    }
    return out;
  }, [suggestedIds, lookup, items, codeType]);

  const ranked = useMemo(() => {
    const q = search.trim().toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    const pool = words.length
      ? searchable.filter((item) => {
          const hay = `${item.title ?? ''} ${item.amazon_asin ?? ''} ${item.fnsku ?? ''} ${item.amazon_order_number ?? ''} ${item.amazon_order_id ?? ''}`.toLowerCase();
          return words.every((w) => hay.includes(w));
        })
      : searchable;
    // X00 stickers print a cut-off name ("Golf Target Clot") — match its words instead
    const result = codeType === 'fnsku' ? rankBySticker(pool, productName ?? null) : rankByTitle(pool, productName ?? null);
    // Orders Amazon lists for this exact barcode go first, in Amazon's order
    const top = result
      .filter((r) => onAmazon.has(r.item.id))
      .sort((a, b) => (onAmazon.get(a.item.id) ?? 0) - (onAmazon.get(b.item.id) ?? 0));
    const rest = result.filter((r) => !onAmazon.has(r.item.id));
    return [...top, ...rest].map((r) => ({ ...r, item: byId.get(r.item.id) ?? r.item }));
  }, [searchable, byId, productName, search, codeType, onAmazon]);

  // The best guess over the whole list (not the search), and how sure it is
  const guess = useMemo(() => {
    if (!productName) return null;
    const g = codeType === 'fnsku' ? guessStickerMatch(searchable, productName) : guessTitleMatch(searchable, productName);
    return g ? { ...g, item: byId.get(g.item.id) ?? g.item } : null;
  }, [searchable, byId, productName, codeType]);

  /** First order Amazon lists for the barcode — beats a name guess */
  const amazonPick = useMemo(() => {
    let best: { id: string; rank: number } | null = null;
    for (const [id, rank] of onAmazon) if (!best || rank < best.rank) best = { id, rank };
    return best ? byId.get(best.id) ?? null : null;
  }, [onAmazon, byId]);

  // Open the best guess's details straight away — checking it is one look
  useEffect(() => {
    const first = amazonPick ?? guess?.item;
    if (!open || !first || autoOpened.current) return;
    autoOpened.current = true;
    setOpenId(first.id);
  }, [open, guess, amazonPick]);

  const linkMutation = useMutation({
    mutationFn: async (item: Item) => {
      // Save the barcode so the next identical box matches by itself
      if (codeType === 'upc' && upc) {
        const { error } = await supabase.from('items').update({ upc }).eq('id', item.id);
        if (error) throw error;
      } else if (codeType === 'asin' && upc && !item.amazon_asin) {
        const { error } = await supabase.from('items').update({ amazon_asin: upc }).eq('id', item.id);
        if (error) throw error;
      } else if (codeType === 'fnsku' && upc) {
        // The X00 sticker — Amazon lookups aren't needed for this box again
        const { error } = await supabase.from('items').update({ fnsku: upc }).eq('id', item.id);
        if (error) console.warn('[LinkUpcSheet] sticker not saved:', error.message);
      }
      return item;
    },
    onSuccess: (item) => {
      toast.success(`Matched "${item.title || 'Untitled item'}"`);
      onClose();
      onLinked(item);
    },
    onError: () => {
      toast.error('Failed to link barcode');
    },
  });

  const shown = ranked.slice(0, MAX_SHOWN);
  const guessId = guess?.item.id ?? null;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="pb-3 text-left">
          <SheetTitle>Which item is this?</SheetTitle>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono">{upc}</span> isn't linked to an item yet. Open an order to check its details,
            then tap <span className="font-medium">This is it</span> — the next box with this barcode matches
            automatically.
          </p>
        </SheetHeader>

        <div className="space-y-3 pb-6">
          {isLookingUp && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground rounded-lg bg-muted/40 px-3 py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Looking up product...
            </div>
          )}
          {productName && !isUnknownTitle(productName) && (
            <div className="rounded-lg bg-primary/10 border border-primary/30 px-3 py-2 text-sm">
              <span className="text-muted-foreground">{codeType === 'fnsku' ? 'Sticker reads: ' : 'Looks like: '}</span>
              <span className="font-medium">
                {lookup?.brand ? `${lookup.brand} — ` : ''}
                {productName}
              </span>
            </div>
          )}
          {guess && guess.lookalikes > 0 && (
            <div className="flex gap-2 rounded-lg bg-warning/10 border border-warning/30 px-3 py-2 text-sm">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-warning" />
              <span>
                {guess.lookalikes} other order{guess.lookalikes === 1 ? '' : 's'} look{guess.lookalikes === 1 ? 's' : ''}{' '}
                similar (same brand or kind of product). Compare the title, price and dates with the box before
                confirming.
              </span>
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Words from the box, ASIN or order #"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {onAddNew && (
            <Button variant="outline" className="w-full" onClick={onAddNew} disabled={linkMutation.isPending}>
              <Plus className="w-4 h-4 mr-1" />
              Not in my list — add as a new item
            </Button>
          )}

          {ranked.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {items.length === 0 ? 'No items to link. Import your orders first.' : 'Nothing matches that search.'}
            </p>
          ) : (
            <div className="space-y-2">
              {shown.map(({ item }) => {
                const isOpen = openId === item.id;
                const etv = item.vine_etv ?? item.original_cost;
                const date = shortDate(item.ordered_date) ?? shortDate(item.acquisition_date);
                return (
                  <div
                    key={item.id}
                    className={`rounded-lg border bg-card transition-colors ${isOpen ? 'border-primary/60' : 'border-border'}`}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      aria-expanded={isOpen}
                      className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 text-left cursor-pointer rounded-lg"
                      onClick={() => setOpenId(isOpen ? null : item.id)}
                      onKeyDown={(e) => e.key === 'Enter' && setOpenId(isOpen ? null : item.id)}
                    >
                      <div className="flex-shrink-0 w-12 h-12 rounded-md overflow-hidden bg-muted flex items-center justify-center">
                        {item.photos?.[0] ? (
                          <img src={item.photos[0]} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Package className="w-5 h-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${isOpen ? '' : 'line-clamp-2'}`}>{item.title || 'Untitled Item'}</p>
                        <p className="text-xs text-muted-foreground">
                          {etv > 0 ? `$${etv.toFixed(2)} ETV` : 'No value'}
                          {date ? ` · ${date}` : ''}
                          {item.physical_status === 'unconfirmed' ? ' · on order sheet' : ''}
                        </p>
                        {onAmazon.has(item.id) && (
                          <Badge className="mt-1 mr-1 bg-primary/15 text-primary border-primary/30">
                            <Sparkles className="w-3 h-3 mr-1" />
                            Amazon lists this for the barcode
                          </Badge>
                        )}
                        {item.id === guessId && !onAmazon.has(item.id) && (
                          <Badge
                            className={`mt-1 ${
                              guess?.sure
                                ? 'bg-primary/15 text-primary border-primary/30'
                                : 'bg-warning/20 text-foreground border-warning/50'
                            }`}
                          >
                            <Sparkles className="w-3 h-3 mr-1" />
                            {guess?.sure ? 'Best match' : 'Closest guess — check it'}
                          </Badge>
                        )}
                      </div>
                      <ChevronDown
                        className={`w-4 h-4 flex-shrink-0 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      />
                    </div>

                    {isOpen && (
                      <div className="px-3 pb-3 space-y-3">
                        <OrderDetails item={item} showPhoto={false} />
                        <div className="flex gap-2">
                          <Button
                            className="flex-1"
                            onClick={() => linkMutation.mutate(item)}
                            disabled={linkMutation.isPending}
                          >
                            {linkMutation.isPending ? (
                              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                            ) : (
                              <Check className="w-4 h-4 mr-1" />
                            )}
                            This is it
                          </Button>
                          <Button variant="outline" className="flex-1" onClick={() => setOpenId(null)}>
                            Not this one
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {ranked.length > MAX_SHOWN && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  Showing {MAX_SHOWN} of {ranked.length} — type words from the box to narrow it down
                </p>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
