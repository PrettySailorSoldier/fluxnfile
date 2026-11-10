import { Link } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useStorageLocations } from '@/hooks/useInventory';
import { Barcode } from '@/components/Barcode';
import { binCode } from '@/lib/binLabel';

/** One printable label per storage location. Scanning it sets the bin in a scan session. */
export default function BinLabels() {
  const { data: locations = [], isLoading } = useStorageLocations();

  return (
    <div className="min-h-screen bg-background p-4 print:p-0">
      <style>{`@media print { @page { margin: 8mm; } body { background: #fff !important; } .no-print { display: none !important; } }`}</style>

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

      {isLoading && <p className="text-center text-muted-foreground">Loading…</p>}
      {!isLoading && locations.length === 0 && (
        <p className="text-center text-muted-foreground">Add a storage location first.</p>
      )}

      <div className="grid grid-cols-2 gap-3 max-w-3xl mx-auto">
        {locations.map((loc) => (
          <div
            key={loc.id}
            className="border-2 border-black rounded-md p-3 bg-white text-black break-inside-avoid"
            style={{ pageBreakInside: 'avoid' }}
          >
            <p className="text-2xl font-extrabold leading-tight text-center line-clamp-2">{loc.name}</p>
            {loc.description && <p className="text-xs text-center line-clamp-1">{loc.description}</p>}
            <Barcode text={binCode(loc.id)} className="h-12 mt-2" />
            <p className="text-[11px] text-center tracking-widest font-mono">{binCode(loc.id)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

