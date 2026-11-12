import { Link } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMemo, useState } from 'react';
import { useLocationIndex } from '@/hooks/useInventory';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Barcode } from '@/components/Barcode';
import { binCode } from '@/lib/binLabel';
import { labelLayout } from '@/lib/labelCanvas';
import { labelPrintCss, useLabelSettings } from '@/lib/labelSettings';

/** One printable label per storage location. Scanning it sets the bin in a scan session. */
export default function BinLabels() {
  const { index, loaded } = useLocationIndex();
  const isLoading = !loaded;
  // Shelves that hold bins don't usually need their own label
  const [leavesOnly, setLeavesOnly] = useState(true);
  // "Sheet" = two per row on paper; "Label printer" = one per page at the size in Settings
  const [layout, setLayout] = useState<'sheet' | 'label'>('sheet');
  const [labelSettings] = useLabelSettings();
  const { widthMm, heightMm } = labelSettings;
  const L = labelLayout(widthMm, heightMm);
  const locations = useMemo(
    () => index.flatten().filter((l) => !leavesOnly || index.children(l.id).length === 0),
    [index, leavesOnly]
  );

  return (
    <div className="min-h-screen bg-background p-4 print:p-0 print:min-h-0">
      {layout === 'sheet' ? (
        <style>{`@media print { @page { margin: 8mm; } body { background: #fff !important; } .no-print { display: none !important; } }`}</style>
      ) : (
        <style>{`${labelPrintCss(widthMm, heightMm)} @media print { .no-print { display: none !important; } }`}</style>
      )}

      <div className="no-print max-w-3xl mx-auto mb-4 flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <Link to="/locations">
            <ArrowLeft className="w-5 h-5" />
          </Link>
        </Button>
        <h1 className="text-xl font-bold flex-1">Bin labels</h1>
        <Button onClick={() => window.print()} disabled={locations.length === 0} className="gap-2">
          <Printer className="w-4 h-4" /> Print
        </Button>
      </div>
      <div className="no-print max-w-3xl mx-auto mb-4 flex items-center gap-x-4 gap-y-2 flex-wrap">
        <div className="flex items-center gap-3 min-h-11">
          <Switch id="leaves-only" checked={leavesOnly} onCheckedChange={setLeavesOnly} />
          <Label htmlFor="leaves-only" className="text-sm">
            Only bottom-level spots
          </Label>
        </div>
        <Select value={layout} onValueChange={(v) => setLayout(v as 'sheet' | 'label')}>
          <SelectTrigger className="w-auto min-w-[10rem] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sheet">Sheet</SelectItem>
            <SelectItem value="label">Label printer (one per page)</SelectItem>
          </SelectContent>
        </Select>
        {layout === 'label' && (
          <p className="text-xs text-muted-foreground">
            {widthMm} × {heightMm} mm ·{' '}
            <Link to="/settings" className="text-primary hover:underline">
              change
            </Link>
          </p>
        )}
      </div>

      {isLoading && <p className="text-center text-muted-foreground">Loading…</p>}
      {!isLoading && locations.length === 0 && (
        <p className="text-center text-muted-foreground">Add a storage location first.</p>
      )}

      {layout === 'label' && (
        <div className="flex flex-wrap gap-3 justify-center max-w-3xl mx-auto print:block print:max-w-none">
          {locations.map((loc, i) => (
            <div key={loc.id} className={i < locations.length - 1 ? 'label-page-break' : undefined}>
              <div
                className="label-print bg-white text-black flex flex-col overflow-hidden text-center shadow-sm ring-1 ring-black/10"
                style={{ width: `${widthMm}mm`, height: `${heightMm}mm`, padding: `${L.pad}mm`, boxSizing: 'border-box' }}
              >
                <p className="font-extrabold leading-tight line-clamp-2 break-words" style={{ fontSize: `${L.priceFont * 0.55}mm` }}>
                  {loc.name}
                </p>
                <p className="flex-1 min-h-0 overflow-hidden line-clamp-1" style={{ fontSize: `${L.titleFont * 0.85}mm` }}>
                  {loc.parent_id && index.byId.has(loc.parent_id) ? index.pathText(loc.parent_id) : ''}
                </p>
                <div className="flex-none" style={{ height: `${L.barcodeHeight}mm` }}>
                  <Barcode text={binCode(loc.id)} className="h-full" />
                </div>
                <p className="flex-none leading-none tracking-widest font-mono" style={{ fontSize: `${L.numberFont}mm` }}>
                  {binCode(loc.id)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={layout === 'sheet' ? 'grid grid-cols-2 gap-3 max-w-3xl mx-auto' : 'hidden'}>
        {locations.map((loc) => (
          <div
            key={loc.id}
            className="border-2 border-black rounded-md p-3 bg-white text-black break-inside-avoid"
            style={{ pageBreakInside: 'avoid' }}
          >
            <p className="text-2xl font-extrabold leading-tight text-center line-clamp-2 break-words">{loc.name}</p>
            {loc.parent_id && index.byId.has(loc.parent_id) && (
              <p className="text-xs text-center line-clamp-1">{index.pathText(loc.parent_id)}</p>
            )}
            <Barcode text={binCode(loc.id)} className="h-12 mt-2" />
            <p className="text-[11px] text-center tracking-widest font-mono">{binCode(loc.id)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

