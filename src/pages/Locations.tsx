import { Link } from 'react-router-dom';
import { ArrowLeft, Box, ChevronRight, Printer, ScanLine, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useLocationIndex, useLocationStock, useRolledUpStock } from '@/hooks/useInventory';
import { StorageLocationManager } from '@/components/settings/StorageLocationManager';
import { binCode } from '@/lib/binLabel';

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

/**
 * Every shelf, bin and tote with what's in it right now (sold items don't count —
 * they aren't on the shelf any more). Tap one to see its contents.
 */
export default function Locations() {
  const { index, locations, loaded } = useLocationIndex();
  const isLoading = !loaded;
  const { data: stock } = useLocationStock();
  // Each place counts everything inside it (Workshop includes its shelves and bins)
  const rolled = useRolledUpStock();
  const unplaced = stock?.get('') ?? { count: 0, value: 0 };
  const total = [...(stock?.values() ?? [])].reduce((t, s) => ({ count: t.count + s.count, value: t.value + s.value }), {
    count: 0,
    value: 0,
  });
  // Temporary spots, in tree order. A flagged place's count includes the spots inside it.
  const needsMoving = index.flatten().filter((l) => l.needs_move);

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

      {needsMoving.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="p-3 space-y-1">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-400">
              <Truck className="w-4 h-4" /> Needs moving
            </p>
            {needsMoving.map((loc) => {
              const s = rolled.get(loc.id) ?? { count: 0, value: 0 };
              return (
                <Link
                  key={loc.id}
                  to={`/inventory?loc=${loc.id}`}
                  className="flex min-h-11 items-center gap-3 rounded-md px-1 hover:bg-amber-500/10"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{index.pathText(loc.id)}</p>
                    {loc.description && <p className="text-xs text-muted-foreground truncate">{loc.description}</p>}
                  </div>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {s.count} item{s.count === 1 ? '' : 's'}
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </Link>
              );
            })}
            <p className="text-xs text-muted-foreground pt-1">Once it's moved, tap "Mark moved" in Manage Locations below.</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {index.flatten().map((loc) => {
          const s = rolled.get(loc.id) ?? { count: 0, value: 0 };
          const depth = index.depthOf(loc.id);
          return (
            <Link key={loc.id} to={`/inventory?loc=${loc.id}`} className="block" style={{ marginLeft: `${(depth - 1) * 12}px` }}>
              <Card className={`hover:bg-muted/40 transition-colors ${loc.needs_move ? 'border-amber-500/50' : ''}`}>
                <CardContent className="p-3 flex items-center gap-3">
                  {loc.needs_move ? (
                    <Truck className={`${depth === 1 ? 'w-5 h-5' : 'w-4 h-4'} text-amber-600 dark:text-amber-400 flex-shrink-0`} />
                  ) : (
                    <Box className={`${depth === 1 ? 'w-5 h-5' : 'w-4 h-4'} text-muted-foreground flex-shrink-0`} />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`truncate ${depth === 1 ? 'font-medium' : 'text-sm'}`} title={index.pathText(loc.id)}>
                      {loc.name}
                      {loc.needs_move && (
                        <span className="ml-2 text-xs font-medium text-amber-700 dark:text-amber-400">Needs moving</span>
                      )}
                    </p>
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

