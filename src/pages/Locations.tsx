import { Link } from 'react-router-dom';
import { ArrowLeft, Box, ChevronRight, Printer, ScanLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useLocationStock, useStorageLocations } from '@/hooks/useInventory';
import { StorageLocationManager } from '@/components/settings/StorageLocationManager';
import { binCode } from '@/lib/binLabel';

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

/**
 * Every shelf, bin and tote with what's in it right now (sold items don't count —
 * they aren't on the shelf any more). Tap one to see its contents.
 */
export default function Locations() {
  const { data: locations = [], isLoading } = useStorageLocations();
  const { data: stock } = useLocationStock();
  const unplaced = stock?.get('') ?? { count: 0, value: 0 };
  const total = [...(stock?.values() ?? [])].reduce((t, s) => ({ count: t.count + s.count, value: t.value + s.value }), {
    count: 0,
    value: 0,
  });

  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="flex items-center gap-2 pt-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <Link to="/settings">
            <ArrowLeft className="w-5 h-5" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold flex-1">Locations</h1>
        <Button asChild variant="outline" size="sm" className="gap-1.5" disabled={locations.length === 0}>
          <Link to="/locations/labels">
            <Printer className="w-4 h-4" /> Bin labels
          </Link>
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        {total.count} items in stock{total.value > 0 && ` · ${money(total.value)} asking`}. Scan a bin label in{' '}
        <Link to="/scan" className="text-primary underline-offset-2 hover:underline">
          Scan
        </Link>{' '}
        to put what you scan next into that bin.
      </p>

      {isLoading && <p className="text-center text-muted-foreground py-8">Loading…</p>}

      <div className="space-y-2">
        {locations.map((loc) => {
          const s = stock?.get(loc.id) ?? { count: 0, value: 0 };
          return (
            <Link key={loc.id} to={`/inventory?loc=${loc.id}`}>
              <Card className="hover:bg-muted/40 transition-colors">
                <CardContent className="p-3 flex items-center gap-3">
                  <Box className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{loc.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {loc.description ? `${loc.description} · ` : ''}
                      <span className="font-mono">{binCode(loc.id)}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums">{s.count}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">{s.value > 0 ? money(s.value) : '—'}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          );
        })}

        {unplaced.count > 0 && (
          <Link to="/inventory?loc=none">
            <Card className="border-dashed hover:bg-muted/40 transition-colors">
              <CardContent className="p-3 flex items-center gap-3">
                <ScanLine className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                <p className="flex-1 text-sm">No location yet</p>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums">{unplaced.count}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {unplaced.value > 0 ? money(unplaced.value) : '—'}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        )}
      </div>

      <StorageLocationManager />
    </div>
  );
}

