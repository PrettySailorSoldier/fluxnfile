import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useItems, type Item } from '@/hooks/useInventory';
import { useEvent } from '@/hooks/useMarket';
import { code128Modules } from '@/lib/code128';

/** Bars as SVG rects, merging runs of black modules. */
function Barcode({ text }: { text: string }) {
  const modules = useMemo(() => code128Modules(text), [text]);
  const rects: { x: number; w: number }[] = [];
  for (let i = 0; i < modules.length; ) {
    if (modules[i]) {
      let j = i;
      while (j < modules.length && modules[j]) j++;
      rects.push({ x: i, w: j - i });
      i = j;
    } else i++;
  }
  return (
    <svg viewBox={`0 0 ${modules.length} 30`} preserveAspectRatio="none" className="w-full h-8" role="img" aria-label={`Barcode ${text}`}>
      {rects.map((r) => (
        <rect key={r.x} x={r.x} y={0} width={r.w} height={30} fill="#000" />
      ))}
    </svg>
  );
}

const priceLabel = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`);

/**
 * Printable price tags for an event's packed items. Shows the tag price only —
 * the floor is never printed. The barcode is the item number, which Market Mode scans.
 */
export default function PriceTags() {
  const { id } = useParams<{ id: string }>();
  const { data: event } = useEvent(id);
  const { data: items = [], isLoading } = useItems();
  const [size, setSize] = useState<'standard' | 'large'>('standard');

  const packed = useMemo(
    () =>
      items
        .filter((i) => i.packed_for_event_id === id)
        .sort((a, b) => (a.tracking_number ?? 0) - (b.tracking_number ?? 0)),
    [items, id]
  );
  const untagged = packed.filter((i) => i.tag_price == null);

  return (
    <div className="min-h-screen bg-background p-4 print:p-0">
      <style>{`@media print { @page { margin: 8mm; } body { background: #fff !important; } .no-print { display: none !important; } }`}</style>

      <div className="no-print max-w-3xl mx-auto mb-4 space-y-3">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" aria-label="Back">
            <Link to={`/market/${id}`}><ArrowLeft className="w-5 h-5" /></Link>
          </Button>
          <h1 className="text-xl font-bold flex-1">Price tags{event ? ` · ${event.name}` : ''}</h1>
          <Select value={size} onValueChange={(v) => setSize(v as 'standard' | 'large')}>
            <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="standard">3 per row</SelectItem>
              <SelectItem value="large">2 per row</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => window.print()} disabled={packed.length === 0} className="gap-2">
            <Printer className="w-4 h-4" /> Print
          </Button>
        </div>
        {untagged.length > 0 && (
          <p className="text-sm text-destructive">
            {untagged.length} item{untagged.length === 1 ? ' has' : 's have'} no tag price and will print blank — set tags on the Plan tab first.
          </p>
        )}
        <p className="text-xs text-muted-foreground">Tags show the sticker price only; your floor is never printed.</p>
      </div>

      {isLoading && <p className="text-center text-muted-foreground">Loading…</p>}
      {!isLoading && packed.length === 0 && (
        <p className="text-center text-muted-foreground">Nothing packed for this market yet.</p>
      )}

      <div
        className={size === 'standard' ? 'grid grid-cols-3 gap-2 max-w-3xl mx-auto' : 'grid grid-cols-2 gap-3 max-w-3xl mx-auto'}
      >
        {packed.map((it) => (
          <Tag key={it.id} item={it} large={size === 'large'} />
        ))}
      </div>
    </div>
  );
}

function Tag({ item, large }: { item: Item; large: boolean }) {
  const number = item.tracking_number;
  const price = item.tag_price;
  return (
    <div className="border border-black/70 rounded-md p-2 bg-white text-black break-inside-avoid flex flex-col justify-between" style={{ pageBreakInside: 'avoid' }}>
      <p className={large ? 'text-5xl font-extrabold leading-none text-center py-2' : 'text-4xl font-extrabold leading-none text-center py-1.5'}>
        {price != null ? priceLabel(price) : '—'}
      </p>
      <p className={large ? 'text-sm text-center leading-tight line-clamp-2 min-h-[2.4em]' : 'text-xs text-center leading-tight line-clamp-2 min-h-[2.4em]'}>
        {item.title || 'Untitled item'}
      </p>
      {number ? (
        <div className="mt-1">
          <Barcode text={String(number).padStart(6, '0')} />
          <p className="text-[10px] text-center tracking-widest">#{String(number).padStart(5, '0')}</p>
        </div>
      ) : (
        <p className="text-[10px] text-center mt-1">no item number</p>
      )}
    </div>
  );
}
