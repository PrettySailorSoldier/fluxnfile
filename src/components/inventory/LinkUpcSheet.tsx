import { useState, useEffect, useMemo } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Package, Search, Sparkles, Loader2, Plus, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Item } from '@/hooks/useInventory';
import type { CodeType } from '@/lib/barcode';
import { isUnknownTitle, lookupProduct } from '@/lib/productLookup';
import { rankBySticker, rankByTitle } from '@/lib/scanIntake';

const SUGGEST_THRESHOLD = 0.25;
/** Rendering thousands of order rows on a phone is slow — search narrows it */
const MAX_SHOWN = 50;

interface LinkUpcSheetProps {
  /** The scanned code (UPC/EAN, ASIN or Amazon X00 sticker) */
  upc: string | null;
  codeType?: CodeType;
  /** Product name from a lookup already done — skips looking it up again */
  hint?: string | null;
  open: boolean;
  items: Item[];
  onClose: () => void;
  /** Called after the code is saved onto the chosen item. */
  onLinked: (item: Item) => void;
  /** Shows "Not in my list — add as new item" */
  onAddNew?: () => void;
}

/**
 * Shown when a scanned barcode isn't linked to any item yet. Ranks the list by
 * the looked-up product name, lets the user search by name or ASIN, and saves
 * the barcode on the chosen item so future scans match instantly.
 */
export function LinkUpcSheet({
  upc,
  codeType = 'upc',
  hint,
  open,
  items,
  onClose,
  onLinked,
  onAddNew,
}: LinkUpcSheetProps) {
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) setSearch('');
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

  const ranked = useMemo(() => {
    const q = search.trim().toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    const pool = words.length
      ? items.filter((item) => {
          const hay = `${item.title ?? ''} ${item.amazon_asin ?? ''} ${item.fnsku ?? ''} ${item.amazon_order_number ?? ''}`.toLowerCase();
          return words.every((w) => hay.includes(w));
        })
      : items;
    // X00 stickers print a cut-off name ("Golf Target Clot") — match its words instead
    return codeType === 'fnsku' ? rankBySticker(pool, productName ?? null) : rankByTitle(pool, productName ?? null);
  }, [items, productName, search, codeType]);

  const bestScore = ranked[0]?.score ?? 0;

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

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="pb-3 text-left">
          <SheetTitle>Which item is this?</SheetTitle>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono">{upc}</span> isn't linked to an item yet. Pick it from your list —
            the next box with this barcode matches automatically.
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

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Type words from the box, or an ASIN…"
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
              {shown.map(({ item, score }) => (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors text-left cursor-pointer"
                  onClick={() => !linkMutation.isPending && linkMutation.mutate(item)}
                  onKeyDown={(e) => e.key === 'Enter' && !linkMutation.isPending && linkMutation.mutate(item)}
                >
                  <div className="flex-shrink-0 w-12 h-12 rounded-md overflow-hidden bg-muted flex items-center justify-center">
                    {item.photos?.[0] ? (
                      <img src={item.photos[0]} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Package className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium line-clamp-2">{item.title || 'Untitled Item'}</p>
                    <p className="text-xs text-muted-foreground">
                      ${item.original_cost.toFixed(2)}
                      {item.acquisition_date ? ` · ${item.acquisition_date}` : ''}
                      {item.physical_status === 'unconfirmed' ? ' · on order sheet' : ''}
                    </p>
                    {item.amazon_asin && (
                      <a
                        href={`https://www.amazon.com/dp/${item.amazon_asin}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary font-mono"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {item.amazon_asin}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  {score >= SUGGEST_THRESHOLD && score === bestScore && (
                    <Badge className="flex-shrink-0 bg-primary/15 text-primary border-primary/30">
                      <Sparkles className="w-3 h-3 mr-1" />
                      Best match
                    </Badge>
                  )}
                </div>
              ))}
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
