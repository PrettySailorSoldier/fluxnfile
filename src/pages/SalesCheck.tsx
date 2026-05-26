import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useItems, calculateProfit, Item, statusConfig } from '@/hooks/useInventory';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import {
  Tag,
  Clock,
  TrendingUp,
  AlertCircle,
  ChevronDown,
  Loader2,
  Flag,
  Camera,
  Search,
  Upload,
  ScanLine,
  X,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { AmazonImportDialog } from '@/components/amazon/AmazonImportDialog';
import { QuickEditSheet } from '@/components/inventory/QuickEditSheet';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import { normalizeTitle, jaccardSimilarity } from '@/utils/import-dedup-engine';

type FlaggedItem = Item & { flagged_for?: string | null; flag_note?: string | null };

const MS_PER_DAY = 86_400_000;
const SCANNER_VIDEO_ID = 'sales-check-scanner-video';

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / MS_PER_DAY);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getTitle(item: Item): string {
  return item.title || item.category?.name || `Item #${item.id.slice(0, 6)}`;
}

function daysColor(days: number): string {
  if (days > 90) return 'text-destructive font-bold';
  if (days > 45) return 'text-amber-500 font-bold';
  return 'text-muted-foreground';
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHead({
  icon,
  label,
  count,
  open,
}: {
  icon: ReactNode;
  label: string;
  count: number;
  open: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-4 py-3 bg-muted/30 w-full',
        count === 0 && 'opacity-60'
      )}
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="font-semibold text-sm flex-1 text-left">{label}</span>
      <Badge variant="secondary" className="text-xs tabular-nums">
        {count}
      </Badge>
      <ChevronDown
        className={cn(
          'w-4 h-4 text-muted-foreground transition-transform duration-200',
          !open && '-rotate-90'
        )}
      />
    </div>
  );
}

interface RepriceControlProps {
  item: Item;
  repricing: Record<string, string>;
  setRepricing: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onSave: (id: string) => void;
  isPending: boolean;
}

function RepriceControl({ item, repricing, setRepricing, onSave, isPending }: RepriceControlProps) {
  const isOpen = item.id in repricing;

  function openEdit() {
    setRepricing(prev => ({
      ...prev,
      [item.id]: item.target_price != null ? String(item.target_price) : '',
    }));
  }

  function cancel() {
    setRepricing(prev => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
  }

  if (!isOpen) {
    return (
      <Button size="sm" variant="outline" className="flex-shrink-0" onClick={openEdit}>
        Reprice
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      <div className="relative">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs pointer-events-none">
          $
        </span>
        <Input
          type="number"
          min="0"
          step="0.01"
          className="w-24 h-8 pl-5 text-sm"
          value={repricing[item.id]}
          onChange={e => setRepricing(prev => ({ ...prev, [item.id]: e.target.value }))}
          onKeyDown={e => e.key === 'Enter' && onSave(item.id)}
          autoFocus
        />
      </div>
      <Button size="sm" className="h-8 px-2" onClick={() => onSave(item.id)} disabled={isPending}>
        Save
      </Button>
      <Button size="sm" variant="ghost" className="h-8 px-2" onClick={cancel}>
        ✕
      </Button>
    </div>
  );
}

// ── Scan Bar ──────────────────────────────────────────────────────────────────

interface ScanBarProps {
  onScanValue: (value: string) => void;
  onOpenScanner: () => void;
  lastScanStatus: string | null;
  isScannerSupported: boolean;
}

function ScanBar({ onScanValue, onOpenScanner, lastScanStatus, isScannerSupported }: ScanBarProps) {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function submit() {
    const v = inputValue.trim();
    if (!v) return;
    onScanValue(v);
    setInputValue('');
  }

  return (
    <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
      <div className="flex items-center gap-2">
        {isScannerSupported ? (
          <Button size="sm" variant="outline" className="flex-shrink-0" onClick={onOpenScanner}>
            <Camera className="w-3.5 h-3.5 mr-1.5" />
            Scan
          </Button>
        ) : (
          <div className="text-xs text-muted-foreground px-1 flex-shrink-0">Manual only</div>
        )}
        <Input
          ref={inputRef}
          className="flex-1 text-sm h-9"
          placeholder="ASIN or order # (e.g. 113-1234567-1234567)"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
        />
        <Button size="sm" className="flex-shrink-0 h-9 px-3" onClick={submit} disabled={!inputValue.trim()}>
          <Search className="w-3.5 h-3.5" />
        </Button>
      </div>
      {lastScanStatus && (
        <p className="text-xs text-muted-foreground pl-1 flex items-center gap-1">
          {lastScanStatus.startsWith('Matched') ? (
            <CheckCircle2 className="w-3 h-3 text-success flex-shrink-0" />
          ) : (
            <AlertCircle className="w-3 h-3 text-warning flex-shrink-0" />
          )}
          {lastScanStatus}
        </p>
      )}
      {!isScannerSupported && (
        <p className="text-xs text-muted-foreground/60 pl-1">
          Camera scanning not supported in this browser — use manual entry above.
        </p>
      )}
    </div>
  );
}

// ── Scanner Overlay ───────────────────────────────────────────────────────────

interface ScannerOverlayProps {
  onResult: (raw: string) => void;
  onClose: () => void;
}

function ScannerOverlay({ onResult, onClose }: ScannerOverlayProps) {
  const { scan, cancelScan, isScanning, error } = useBarcodeScanner();
  const hasStarted = useRef(false);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    const timer = setTimeout(async () => {
      const result = await scan(SCANNER_VIDEO_ID);
      if (result.status === 'found' || result.status === 'not_asin') {
        onResult(result.rawValue);
        onClose();
      } else if (result.status === 'cancelled') {
        onClose();
      } else {
        toast.error(result.message || 'Scanner error');
        onClose();
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      hasStarted.current = false;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80">
        <div className="flex items-center gap-2 text-white">
          <ScanLine className="w-5 h-5 text-primary" />
          <span className="font-medium text-sm">Scan ASIN or Order #</span>
        </div>
        <button
          onClick={() => { cancelScan(); onClose(); }}
          className="text-white/70 hover:text-white p-1"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Viewfinder */}
      <div className="relative flex-1 overflow-hidden bg-black">
        <video
          id={SCANNER_VIDEO_ID}
          className="w-full h-full object-cover"
          playsInline
          muted
          autoPlay
        />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative z-10 border-2 border-primary rounded-xl"
            style={{ width: '80%', maxWidth: '320px', height: '160px', boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)' }}
          >
            <div className="absolute -top-0.5 -left-0.5 w-6 h-6 border-t-4 border-l-4 border-primary rounded-tl-xl" />
            <div className="absolute -top-0.5 -right-0.5 w-6 h-6 border-t-4 border-r-4 border-primary rounded-tr-xl" />
            <div className="absolute -bottom-0.5 -left-0.5 w-6 h-6 border-b-4 border-l-4 border-primary rounded-bl-xl" />
            <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 border-b-4 border-r-4 border-primary rounded-br-xl" />
            {isScanning && (
              <div className="absolute inset-x-2 top-0 h-0.5 bg-primary/80 animate-scan-line" />
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        className="bg-black/80 px-4 py-4 flex flex-col items-center gap-3"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}
      >
        {!isScanning && !error && (
          <div className="flex items-center gap-2 text-white/60 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Starting camera...</span>
          </div>
        )}
        {isScanning && (
          <p className="text-white/60 text-sm text-center">
            Point at ASIN barcode or Amazon order number
          </p>
        )}
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        <Button
          variant="outline"
          className="w-full max-w-xs border-white/20 text-white hover:bg-white/10"
          onClick={() => { cancelScan(); onClose(); }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SalesCheck() {
  const queryClient = useQueryClient();
  const { user, team } = useAuth();
  const { data: items = [], isLoading } = useItems();

  const [optimisticRemoved, setOptimisticRemoved] = useState<Set<string>>(new Set());
  const [optimisticResolved, setOptimisticResolved] = useState<Set<string>>(new Set());
  const [repricing, setRepricing] = useState<Record<string, string>>({});

  // Import dialog
  const [importOpen, setImportOpen] = useState(false);

  // Scanner state
  const [scannerOpen, setScannerOpen] = useState(false);
  const [lastScanStatus, setLastScanStatus] = useState<string | null>(null);
  const [fuzzyResults, setFuzzyResults] = useState<Item[]>([]);

  // QuickEditSheet state
  const [quickEditItem, setQuickEditItem] = useState<Item | null>(null);
  const [quickEditOpen, setQuickEditOpen] = useState(false);

  // Check BarcodeDetector / camera support
  const isScannerSupported =
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function';

  // Partner profile (the other team member)
  const { data: partner } = useQuery({
    queryKey: ['partner-profile', team?.id, user?.id],
    queryFn: async () => {
      if (!team?.id || !user?.id) return null;
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('team_id', team.id)
        .neq('id', user.id)
        .limit(1)
        .maybeSingle();
      return data as { id: string; full_name: string | null } | null;
    },
    enabled: !!team?.id && !!user?.id,
  });

  const [s1Open, setS1Open] = useState(true);
  const [s2Open, setS2Open] = useState(true);
  const [s3Open, setS3Open] = useState(true);
  const [s4Open, setS4Open] = useState(true);
  const [initialized, setInitialized] = useState(false);

  // ── Scanner logic ──────────────────────────────────────────────────────────

  async function handleScannedValue(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed || !team?.id) return;

    setFuzzyResults([]);
    const isOrderNumber = /^\d{3}-\d{7}-\d{7}$/.test(trimmed);
    const isAsin = /^[A-Z0-9]{10}$/i.test(trimmed) && !/^\d{3}-/.test(trimmed);

    if (isOrderNumber) {
      const { data } = await supabase
        .from('items')
        .select('*, category:categories(*), storage_location:storage_locations(*)')
        .eq('amazon_order_id', trimmed)
        .eq('team_id', team.id)
        .limit(1)
        .maybeSingle();

      if (data) {
        const matched = data as Item;
        setLastScanStatus(`Matched: "${getTitle(matched).slice(0, 50)}"`);
        toast.success(`Matched: ${getTitle(matched).slice(0, 40)}`);
        setQuickEditItem(matched);
        setQuickEditOpen(true);
      } else {
        setLastScanStatus(`No match for order ${trimmed}`);
        toast.warning(`No item found for order ${trimmed}`);
      }

    } else if (isAsin) {
      const { data } = await supabase
        .from('items')
        .select('*, category:categories(*), storage_location:storage_locations(*)')
        .eq('amazon_asin', trimmed.toUpperCase())
        .eq('team_id', team.id)
        .limit(1)
        .maybeSingle();

      if (data) {
        const matched = data as Item;
        setLastScanStatus(`Matched: "${getTitle(matched).slice(0, 50)}"`);
        toast.success(`Matched: ${getTitle(matched).slice(0, 40)}`);
        setQuickEditItem(matched);
        setQuickEditOpen(true);
      } else {
        setLastScanStatus(`No match for ASIN ${trimmed}`);
        toast.warning(`No item found for ASIN ${trimmed}`);
      }

    } else {
      // Fuzzy title search against loaded items
      const normalized = normalizeTitle(trimmed);
      const candidates = items
        .map(item => ({
          item,
          score: item.title ? jaccardSimilarity(normalized, normalizeTitle(item.title)) : 0,
        }))
        .filter(c => c.score >= 0.35)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

      if (candidates.length > 0) {
        setFuzzyResults(candidates.map(c => c.item));
        setLastScanStatus(
          `${candidates.length} fuzzy match${candidates.length !== 1 ? 'es' : ''} for "${trimmed.slice(0, 30)}"`
        );
      } else {
        setLastScanStatus(`No match found for "${trimmed.slice(0, 30)}"`);
        toast.warning('No matching item found — try scanning the product ASIN barcode');
      }
    }
  }

  // ── Derived lists ──────────────────────────────────────────────────────────

  const flaggedItems = useMemo(
    () =>
      (items as FlaggedItem[])
        .filter(i => i.flagged_for != null && i.flagged_for === user?.id && !optimisticResolved.has(i.id))
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    [items, user?.id, optimisticResolved]
  );

  const needsListing = useMemo(
    () =>
      items
        .filter(i => i.status === 'ready_to_list' && !optimisticRemoved.has(i.id))
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [items, optimisticRemoved]
  );

  const staleListings = useMemo(() => {
    const cutoff = Date.now() - 21 * MS_PER_DAY;
    return items
      .filter(i => i.status === 'listed' && new Date(i.created_at).getTime() < cutoff)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [items]);

  const recentSales = useMemo(() => {
    const cutoff = Date.now() - 30 * MS_PER_DAY;
    return items
      .filter(i => {
        if (!['sold', 'shipped'].includes(i.status)) return false;
        const ts = i.sale_date
          ? new Date(i.sale_date).getTime()
          : new Date(i.created_at).getTime();
        return ts >= cutoff;
      })
      .sort((a, b) => {
        const da = new Date(a.sale_date || a.created_at).getTime();
        const db = new Date(b.sale_date || b.created_at).getTime();
        return db - da;
      });
  }, [items]);

  const repriceCandidates = useMemo(() => {
    const cutoff = Date.now() - 14 * MS_PER_DAY;
    return items
      .filter(
        i =>
          i.status === 'listed' &&
          i.target_price !== null &&
          new Date(i.created_at).getTime() < cutoff
      )
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [items]);

  // ── Sales summary ──────────────────────────────────────────────────────────

  const salesRevenue = recentSales.reduce(
    (sum, i) => sum + (i.actual_price ?? i.target_price ?? 0),
    0
  );
  const salesProfit = recentSales.reduce((sum, i) => sum + calculateProfit(i).netProfit, 0);
  const salesMargin = salesRevenue > 0 ? (salesProfit / salesRevenue) * 100 : 0;

  // ── Collapse empty sections once data arrives ──────────────────────────────

  useEffect(() => {
    if (isLoading || initialized) return;
    setS1Open(needsListing.length > 0);
    setS2Open(staleListings.length > 0);
    setS3Open(recentSales.length > 0);
    setS4Open(repriceCandidates.length > 0);
    setInitialized(true);
  }, [isLoading, initialized, needsListing.length, staleListings.length, recentSales.length, repriceCandidates.length]);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const markListedMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('items').update({ status: 'listed' }).eq('id', id);
      if (error) throw error;
    },
    onMutate: (id) => {
      setOptimisticRemoved(prev => new Set([...prev, id]));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      toast.success('Marked as Listed');
    },
    onError: (_, id) => {
      setOptimisticRemoved(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.error('Failed to update');
    },
  });

  const repriceMutation = useMutation({
    mutationFn: async ({ id, price }: { id: string; price: number }) => {
      const { error } = await supabase.from('items').update({ target_price: price }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      setRepricing(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      toast.success('Price updated');
    },
    onError: () => {
      toast.error('Failed to update price');
    },
  });

  const resolveFlagMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('items').update({ flagged_for: null, flag_note: null }).eq('id', id);
      if (error) throw error;
    },
    onMutate: (id) => {
      setOptimisticResolved(prev => new Set([...prev, id]));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      toast.success('Flag resolved');
    },
    onError: (_, id) => {
      setOptimisticResolved(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.error('Failed to resolve flag');
    },
  });

  function saveReprice(id: string) {
    const price = parseFloat(repricing[id]);
    if (isNaN(price) || price < 0) {
      toast.error('Enter a valid price');
      return;
    }
    repriceMutation.mutate({ id, price });
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="p-4 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const todayLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  // ── JSX ────────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sales Check</h1>
          <p className="text-sm text-muted-foreground">{todayLabel}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
          <Upload className="w-3.5 h-3.5 mr-1.5" />
          Import orders
        </Button>
      </div>

      {/* Scan Bar */}
      <ScanBar
        onScanValue={handleScannedValue}
        onOpenScanner={() => setScannerOpen(true)}
        lastScanStatus={lastScanStatus}
        isScannerSupported={isScannerSupported}
      />

      {/* Fuzzy match results */}
      {fuzzyResults.length > 0 && (
        <div className="rounded-lg border bg-muted/20 overflow-hidden">
          <div className="px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/40 flex items-center justify-between">
            <span>Fuzzy matches — tap to open</span>
            <button
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setFuzzyResults([])}
            >
              ✕
            </button>
          </div>
          <div className="divide-y">
            {fuzzyResults.map(item => (
              <button
                key={item.id}
                className="w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors"
                onClick={() => {
                  setQuickEditItem(item);
                  setQuickEditOpen(true);
                  setFuzzyResults([]);
                  setLastScanStatus(`Matched: "${getTitle(item).slice(0, 50)}"`);
                }}
              >
                <p className="text-sm font-medium truncate">{getTitle(item)}</p>
                <p className="text-xs text-muted-foreground">
                  {statusConfig[item.status].label}
                  {item.amazon_asin && ` · ${item.amazon_asin}`}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Section 0: Flagged for You (omit when empty) ────────────────── */}
      {flaggedItems.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-amber-500/10">
            <Flag className="w-4 h-4 text-amber-500" />
            <span className="font-semibold text-sm flex-1">Flagged for You</span>
            <Badge
              variant="outline"
              className="text-xs tabular-nums bg-amber-500/20 text-amber-600 border-amber-500/40"
            >
              {flaggedItems.length}
            </Badge>
          </div>
          <div className="divide-y">
            {flaggedItems.map(item => (
              <div key={item.id} className="px-4 py-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{getTitle(item)}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <Badge
                        variant="secondary"
                        className={cn('text-xs', statusConfig[item.status].className)}
                      >
                        {statusConfig[item.status].label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        from {partner?.full_name || 'your partner'}
                      </span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-shrink-0"
                    onClick={() => resolveFlagMutation.mutate(item.id)}
                    disabled={resolveFlagMutation.isPending}
                  >
                    Resolve
                  </Button>
                </div>
                {item.flag_note && (
                  <div className="rounded border border-amber-500/30 bg-amber-500/5 px-3 py-2">
                    <p className="text-xs text-foreground">{item.flag_note}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Section 1: Needs Listing ─────────────────────────────────────── */}
      <div className="rounded-lg border overflow-hidden">
        <Collapsible open={s1Open} onOpenChange={setS1Open}>
          <CollapsibleTrigger className="w-full">
            <SectionHead
              icon={<Tag className="w-4 h-4" />}
              label="Needs Listing"
              count={needsListing.length}
              open={s1Open}
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            {needsListing.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                Nothing waiting to be listed 🎉
              </p>
            ) : (
              <div className="divide-y">
                {needsListing.map(item => (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{getTitle(item)}</p>
                      {item.storage_location && (
                        <p className="text-xs text-muted-foreground">{item.storage_location.name}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Cost ${item.original_cost.toFixed(2)}
                        {item.target_price != null && ` → $${item.target_price.toFixed(2)}`}
                        {' · '}
                        {daysSince(item.created_at)}d ago
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-shrink-0"
                      onClick={() => markListedMutation.mutate(item.id)}
                      disabled={markListedMutation.isPending}
                    >
                      <Tag className="w-3 h-3 mr-1" />
                      List
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* ── Section 2: Stale Listings ────────────────────────────────────── */}
      <div className="rounded-lg border overflow-hidden">
        <Collapsible open={s2Open} onOpenChange={setS2Open}>
          <CollapsibleTrigger className="w-full">
            <SectionHead
              icon={<Clock className="w-4 h-4" />}
              label="Stale Listings"
              count={staleListings.length}
              open={s2Open}
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            {staleListings.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                All listings are fresh ✓
              </p>
            ) : (
              <div className="divide-y">
                {staleListings.map(item => {
                  const days = daysSince(item.created_at);
                  return (
                    <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{getTitle(item)}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className={cn('text-xs', daysColor(days))}>{days}d listed</span>
                          {item.target_price != null && (
                            <span className="text-xs text-muted-foreground">${item.target_price.toFixed(2)}</span>
                          )}
                        </div>
                      </div>
                      <RepriceControl
                        item={item}
                        repricing={repricing}
                        setRepricing={setRepricing}
                        onSave={saveReprice}
                        isPending={repriceMutation.isPending}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* ── Section 3: Recent Sales ──────────────────────────────────────── */}
      <div className="rounded-lg border overflow-hidden">
        <Collapsible open={s3Open} onOpenChange={setS3Open}>
          <CollapsibleTrigger className="w-full">
            <SectionHead
              icon={<TrendingUp className="w-4 h-4" />}
              label="Recent Sales"
              count={recentSales.length}
              open={s3Open}
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            {recentSales.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                No sales in the last 30 days
              </p>
            ) : (
              <>
                <div className="px-4 py-2 bg-muted/20 border-b text-xs text-muted-foreground flex flex-wrap gap-x-2 gap-y-0.5">
                  <span>{recentSales.length} item{recentSales.length !== 1 ? 's' : ''}</span>
                  <span>·</span>
                  <span>${salesRevenue.toFixed(2)} revenue</span>
                  <span>·</span>
                  <span className={cn('font-medium', salesProfit >= 0 ? 'text-green-600' : 'text-red-500')}>
                    {salesProfit >= 0 ? '+' : ''}${salesProfit.toFixed(2)} profit
                  </span>
                  <span>·</span>
                  <span>{salesMargin.toFixed(0)}% margin</span>
                </div>
                <div className="divide-y">
                  {recentSales.map(item => {
                    const { netProfit } = calculateProfit(item);
                    const saleDate = item.sale_date || item.created_at;
                    const soldFor = item.actual_price ?? item.target_price;
                    return (
                      <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{getTitle(item)}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(saleDate)}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          {soldFor != null && <p className="text-sm font-medium">${soldFor.toFixed(2)}</p>}
                          <p
                            className={cn(
                              'text-xs font-medium',
                              netProfit > 0 && 'text-green-600',
                              netProfit < 0 && 'text-red-500',
                              netProfit === 0 && 'text-muted-foreground'
                            )}
                          >
                            {netProfit >= 0 ? '+' : ''}${netProfit.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* ── Section 4: Reprice Candidates (omit when empty) ─────────────── */}
      {repriceCandidates.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <Collapsible open={s4Open} onOpenChange={setS4Open}>
            <CollapsibleTrigger className="w-full">
              <SectionHead
                icon={<AlertCircle className="w-4 h-4" />}
                label="Reprice Candidates"
                count={repriceCandidates.length}
                open={s4Open}
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="divide-y">
                {repriceCandidates.map(item => {
                  const days = daysSince(item.created_at);
                  return (
                    <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{getTitle(item)}</p>
                        <p className="text-xs text-muted-foreground">
                          Cost ${item.original_cost.toFixed(2)}
                          {' · '}
                          Ask ${item.target_price!.toFixed(2)}
                          {' · '}
                          {days}d
                        </p>
                      </div>
                      <RepriceControl
                        item={item}
                        repricing={repricing}
                        setRepricing={setRepricing}
                        onSave={saveReprice}
                        isPending={repriceMutation.isPending}
                      />
                    </div>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}

      {/* ── Dialogs / Overlays ────────────────────────────────────────────── */}

      {/* Scanner camera overlay */}
      {scannerOpen && (
        <ScannerOverlay
          onResult={(raw) => {
            setScannerOpen(false);
            handleScannedValue(raw);
          }}
          onClose={() => setScannerOpen(false)}
        />
      )}

      {/* Import dialog */}
      <AmazonImportDialog open={importOpen} onOpenChange={setImportOpen} />

      {/* Quick edit sheet */}
      <QuickEditSheet
        item={quickEditItem}
        open={quickEditOpen}
        onClose={() => setQuickEditOpen(false)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['items'] });
          setQuickEditOpen(false);
        }}
      />
    </div>
  );
}
