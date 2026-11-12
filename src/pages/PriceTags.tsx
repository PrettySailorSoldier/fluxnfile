import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useItems } from '@/hooks/useInventory';
import { useEvent } from '@/hooks/useMarket';
import { ItemLabel } from '@/components/ItemLabel';
import { labelPrintCss, useLabelSettings } from '@/lib/labelSettings';

type Layout = 'sheet' | 'label';

/**
 * Printable price tags for an event's packed items. Shows the tag price only —
 * the floor is never printed. The barcode is the item number, which Market Mode scans.
 * "Sheet" prints several tags per page; "Label printer" prints one label per page
 * at the size set in Settings (AirPrint label printers).
 */
export default function PriceTags() {
  const { id } = useParams<{ id: string }>();
  const { data: event } = useEvent(id);
  const { data: items = [], isLoading } = useItems();
  const [size, setSize] = useState<'standard' | 'large'>('standard');
  const [layout, setLayout] = useState<Layout>('sheet');
  const [labelSettings] = useLabelSettings();

  const packed = useMemo(
    () =>
      items
        .filter((i) => i.packed_for_event_id === id)
        .sort((a, b) => (a.tracking_number ?? 0) - (b.tracking_number ?? 0)),
    [items, id]
  );
  const untagged = packed.filter((i) => i.tag_price == null);
  const unnumbered = packed.filter((i) => !i.tracking_number);
  const titles = (list: typeof packed) =>
    list
      .slice(0, 5)
      .map((i) => i.title || 'Untitled item')
      .join(', ') + (list.length > 5 ? `, +${list.length - 5} more` : '');

  return (
    <div className="min-h-screen bg-background p-4 print:p-0 print:min-h-0">
      {layout === 'sheet' ? (
        <style>{`@media print { @page { margin: 8mm; } body { background: #fff !important; } .no-print { display: none !important; } }`}</style>
      ) : (
        <style>{`${labelPrintCss(labelSettings.widthMm, labelSettings.heightMm)} @media print { .no-print { display: none !important; } }`}</style>
      )}

      <div className="no-print max-w-3xl mx-auto mb-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Button asChild variant="ghost" size="icon" aria-label="Back">
            <Link to={`/market/${id}`}><ArrowLeft className="w-5 h-5" /></Link>
          </Button>
          <h1 className="text-xl font-bold flex-1 min-w-0 truncate">Price tags{event ? ` · ${event.name}` : ''}</h1>
          <Button onClick={() => window.print()} disabled={packed.length === 0} className="gap-2">
            <Printer className="w-4 h-4" /> Print
          </Button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={layout} onValueChange={(v) => setLayout(v as Layout)}>
            <SelectTrigger className="w-auto min-w-[10rem] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sheet">Sheet</SelectItem>
              <SelectItem value="label">Label printer (one per page)</SelectItem>
            </SelectContent>
          </Select>
          {layout === 'sheet' ? (
            <Select value={size} onValueChange={(v) => setSize(v as 'standard' | 'large')}>
              <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">3 per row</SelectItem>
                <SelectItem value="large">2 per row</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <p className="text-xs text-muted-foreground">
              {labelSettings.widthMm} × {labelSettings.heightMm} mm ·{' '}
              <Link to="/settings" className="text-primary hover:underline">change</Link>
            </p>
          )}
        </div>
        {untagged.length > 0 && (
          <p className="text-sm text-destructive">
            {untagged.length} item{untagged.length === 1 ? ' has' : 's have'} no tag price and will print blank — set tags on the Plan tab first.
            {layout === 'label' && <span className="block text-xs">{titles(untagged)}</span>}
          </p>
        )}
        {unnumbered.length > 0 && (
          <p className="text-sm text-destructive">
            {unnumbered.length} item{unnumbered.length === 1 ? ' has' : 's have'} no item number, so no barcode: {titles(unnumbered)}
          </p>
        )}
        <p className="text-xs text-muted-foreground">Tags show the sticker price only; your floor is never printed.</p>
      </div>

      {isLoading && <p className="text-center text-muted-foreground">Loading…</p>}
      {!isLoading && packed.length === 0 && (
        <p className="text-center text-muted-foreground">Nothing packed for this market yet.</p>
      )}

      {layout === 'sheet' ? (
        <div
          className={size === 'standard' ? 'grid grid-cols-3 gap-2 max-w-3xl mx-auto' : 'grid grid-cols-2 gap-3 max-w-3xl mx-auto'}
        >
          {packed.map((it) => (
            <ItemLabel key={it.id} item={it} mode={{ kind: 'sheet', large: size === 'large' }} />
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-3 justify-center max-w-3xl mx-auto print:block print:max-w-none">
          {packed.map((it, i) => (
            <div key={it.id} className={i < packed.length - 1 ? 'label-page-break' : undefined}>
              <ItemLabel
                item={it}
                mode={{ kind: 'label', widthMm: labelSettings.widthMm, heightMm: labelSettings.heightMm }}
                className="shadow-sm ring-1 ring-black/10"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
