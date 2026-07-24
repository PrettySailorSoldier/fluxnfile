import { useState, useEffect, useMemo } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Package, Search, Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Item } from '@/hooks/useInventory';
import { normalizeTitle, jaccardSimilarity } from '@/utils/import-dedup-engine';

interface UpcLookupResult {
  found: boolean;
  title: string | null;
  brand: string | null;
}

const SUGGEST_THRESHOLD = 0.25;

interface LinkUpcSheetProps {
  upc: string | null;
  open: boolean;
  items: Item[];
  onClose: () => void;
  /** Called after the UPC is saved onto the chosen item. */
  onLinked: (item: Item) => void;
}

/**
 * Shown when a scanned product barcode (UPC/EAN) isn't linked to any item yet.
 * Looks up the product title (best-effort) to rank likely matches, and lets the
 * user tap the right item — the UPC is saved so future scans match instantly.
 */
export function LinkUpcSheet({ upc, open, items, onClose, onLinked }: LinkUpcSheetProps) {
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  // Best-effort product lookup — linking works fine without it
  const { data: lookup, isLoading: isLookingUp } = useQuery({
    queryKey: ['upc-lookup', upc],
    queryFn: async (): Promise<UpcLookupResult> => {
      const { data, error } = await supabase.functions.invoke('lookup-upc', {
        body: { upc },
      });
      if (error) return { found: false, title: null, brand: null };
      return data as UpcLookupResult;
    },
    enabled: open && !!upc,
    staleTime: Infinity,
    retry: false,
  });

  const ranked = useMemo(() => {
    const lookupNorm = lookup?.title ? normalizeTitle(lookup.title) : null;
    const scored = items.map((item) => ({
      item,
      score:
        lookupNorm && item.title
          ? jaccardSimilarity(lookupNorm, normalizeTitle(item.title))
          : 0,
    }));
    scored.sort((a, b) => b.score - a.score);

    const q = search.toLowerCase();
    return scored.filter(
      ({ item }) => !q || item.title?.toLowerCase().includes(q)
    );
  }, [items, lookup, search]);

  const bestScore = ranked[0]?.score ?? 0;

  const linkMutation = useMutation({
    mutationFn: async (item: Item) => {
      const { error } = await supabase
        .from('items')
        .update({ upc })
        .eq('id', item.id);
      if (error) throw error;
      return item;
    },
    onSuccess: (item) => {
      toast.success(`Barcode linked to "${item.title || 'Untitled item'}"`);
      onClose();
      onLinked(item);
    },
    onError: () => {
      toast.error('Failed to link barcode');
    },
  });

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="pb-3 text-left">
          <SheetTitle>Link this barcode</SheetTitle>
          <p className="text-sm text-muted-foreground">
            UPC <span className="font-mono">{upc}</span> isn't linked to an item yet.
            Pick the item in your hand — future scans will match it automatically.
          </p>
        </SheetHeader>

        <div className="space-y-3 pb-6">
          {isLookingUp && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground rounded-lg bg-muted/40 px-3 py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Looking up product...
            </div>
          )}
          {lookup?.found && lookup.title && (
            <div className="rounded-lg bg-primary/10 border border-primary/30 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Looks like: </span>
              <span className="font-medium">
                {lookup.brand ? `${lookup.brand} — ` : ''}
                {lookup.title}
              </span>
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {ranked.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No items to link. Import your orders first.
            </p>
          ) : (
            <div className="space-y-2">
              {ranked.map(({ item, score }) => (
                <button
                  key={item.id}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors text-left disabled:opacity-50"
                  disabled={linkMutation.isPending}
                  onClick={() => linkMutation.mutate(item)}
                >
                  <div className="flex-shrink-0 w-12 h-12 rounded-md overflow-hidden bg-muted flex items-center justify-center">
                    {item.photos?.[0] ? (
                      <img
                        src={item.photos[0]}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Package className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium line-clamp-2">
                      {item.title || 'Untitled Item'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      ${item.original_cost.toFixed(2)}
                      {item.amazon_asin ? ` · ${item.amazon_asin}` : ''}
                    </p>
                  </div>
                  {score >= SUGGEST_THRESHOLD && score === bestScore && (
                    <Badge className="flex-shrink-0 bg-primary/15 text-primary border-primary/30">
                      <Sparkles className="w-3 h-3 mr-1" />
                      Best match
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
