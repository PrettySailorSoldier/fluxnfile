import { useState, useMemo } from 'react';
import { useOrderSheetItems, Item } from '@/hooks/useInventory';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Package, Search, CheckCircle2, Loader2 } from 'lucide-react';
import { ConfirmItemSheet } from '@/components/inventory/ConfirmItemSheet';
import { ReviewStatusBadge } from '@/components/amazon/ReviewStatusBadge';

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function OrderSheet() {
  const { data: items = [], isLoading } = useOrderSheetItems();
  const [search, setSearch] = useState('');
  const [confirmItem, setConfirmItem] = useState<Item | null>(null);

  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter((item) => item.title?.toLowerCase().includes(q));
  }, [items, search]);

  if (isLoading) {
    return (
      <div className="p-4 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="pb-24">
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 space-y-3">
        <div className="flex items-center gap-3 pt-1">
          <h1 className="text-2xl font-bold text-foreground">Order Sheet</h1>
          {items.length > 0 && (
            <Badge variant="secondary">{items.length} items</Badge>
          )}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="p-4 space-y-3">
        {filtered.length === 0 ? (
          <Card className="bg-secondary/30 border-dashed mt-8">
            <CardContent className="py-16 text-center">
              <CheckCircle2 className="w-12 h-12 mx-auto text-green-500 mb-3" />
              <h3 className="font-semibold text-foreground mb-1">
                {items.length === 0 ? 'All items accounted for ✓' : 'No matching items'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {items.length === 0
                  ? 'Every item has been physically confirmed'
                  : 'Try a different search term'}
              </p>
            </CardContent>
          </Card>
        ) : (
          filtered.map((item) => (
            <OrderItemCard
              key={item.id}
              item={item}
              onConfirm={() => setConfirmItem(item)}
            />
          ))
        )}
      </div>

      <ConfirmItemSheet
        item={confirmItem}
        open={!!confirmItem}
        onClose={() => setConfirmItem(null)}
      />
    </div>
  );
}

function OrderItemCard({ item, onConfirm }: { item: Item; onConfirm: () => void }) {
  const photo = item.photos?.[0];
  const isVine =
    item.acquisition_source === 'Vine' || item.acquisition_source === 'Amazon';
  const reviewStatus = (item as any).amazon_review_status ?? null;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-3">
        <div className="flex gap-3">
          <div className="flex-shrink-0 w-16 h-16 rounded-md overflow-hidden bg-muted flex items-center justify-center">
            {photo ? (
              <img src={photo} alt="" className="w-full h-full object-cover" />
            ) : (
              <Package className="w-7 h-7 text-muted-foreground" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm leading-snug line-clamp-2 text-foreground">
              {item.title || 'Untitled Item'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatDate(item.acquisition_date)} · ${item.original_cost.toFixed(2)} ETV
            </p>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {item.category && (
                <Badge variant="outline" className="text-xs h-5">
                  {item.category.name}
                </Badge>
              )}
              {isVine && reviewStatus && (
                <ReviewStatusBadge status={reviewStatus} size="sm" />
              )}
            </div>
          </div>

          <div className="flex-shrink-0 flex items-center">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={onConfirm}
            >
              Confirm
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
