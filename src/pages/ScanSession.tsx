import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  X,
  ScanLine,
  Zap,
  ZapOff,
  SlidersHorizontal,
  Package,
  Undo2,
  Pencil,
  Plus,
  Link2,
  Camera,
  CameraOff,
  CheckCircle2,
  Sparkles,
  AlertTriangle,
  Search,
  Loader2,
  Keyboard,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  useCategories,
  useItems,
  useOrderSheetItems,
  useStorageLocations,
  conditionLabels,
  type Item,
  type ItemCondition,
} from '@/hooks/useInventory';
import { useWorkflowSettings } from '@/hooks/useUserPreferences';
import { notifyTeammates } from '@/hooks/useTeam';
import { useContinuousScanner } from '@/hooks/useContinuousScanner';
import { QuickEditSheet } from '@/components/inventory/QuickEditSheet';
import { LinkUpcSheet } from '@/components/inventory/LinkUpcSheet';
import { classifyCode, type CodeType } from '@/lib/barcode';
import { isUnknownTitle, lookupProduct, type ProductLookup } from '@/lib/productLookup';
import { jaccardSimilarity, normalizeTitle } from '@/utils/import-dedup-engine';
import { playSynthesizedTone } from '@/utils/audioGenerator';
import {
  attachCode,
  cloneUnit,
  createFromBarcode,
  deleteItem,
  findByCode,
  findOrderSheetNameMatch,
  receiveItem,
  undoReceive,
  type IntakeContext,
  type IntakeDefaults,
  type MatchRow,
  type ReceiveUndo,
} from '@/lib/scanIntake';

// ── Types & storage ──────────────────────────────────────────────────────────

type Mode = 'add' | 'find';

type RowKind =
  | 'received' // order sheet item confirmed
  | 'added' // new item(s) created this session
  | 'existing' // already in inventory
  | 'on_order' // find mode: on the order sheet, not received
  | 'not_found' // find mode: not in inventory
  | 'unrecognized' // barcode that isn't a product code
  | 'amazon_label' // FNSKU sticker that couldn't be resolved to a product
  | 'error';

interface SessionRow {
  key: string;
  at: number;
  code: string;
  codeType: CodeType | null;
  kind: RowKind;
  title: string;
  photo: string | null;
  /** Items this row created or received (newest last) */
  itemIds: string[];
  /** Matched items (existing / on_order) */
  matchIds?: string[];
  undo?: ReceiveUndo;
  location?: string | null;
  price?: number | null;
  inStock?: number;
  autofilled?: boolean;
  matchedByName?: boolean;
  /** Product came from an Amazon keyword search — worth a quick check */
  fuzzy?: boolean;
  /** Other barcodes of the same product seen this session (ASIN, FNSKU, UPC…) */
  altCodes?: string[];
  message?: string;
}

/** A second, different barcode of the same product within this window = the same box. */
const SAME_BOX_MS = 10_000;

const DEFAULTS_KEY = 'scan-session-defaults';
const ROWS_KEY = 'scan-session-rows';
const MODE_KEY = 'scan-session-mode';

function readStorage<T>(store: 'local' | 'session', key: string, fallback: T): T {
  try {
    const raw = (store === 'local' ? localStorage : sessionStorage).getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function readRows(): SessionRow[] {
  try {
    const raw = sessionStorage.getItem(ROWS_KEY);
    return raw ? (JSON.parse(raw) as SessionRow[]) : [];
  } catch {
    return [];
  }
}

function writeStorage(store: 'local' | 'session', key: string, value: unknown) {
  try {
    (store === 'local' ? localStorage : sessionStorage).setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable (private mode) — session still works in memory
  }
}

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const KIND_STYLE: Record<RowKind, { label: string; className: string }> = {
  received: { label: 'Received', className: 'bg-green-500/15 text-green-600 border-green-500/30' },
  added: { label: 'Added', className: 'bg-primary/15 text-primary border-primary/30' },
  existing: { label: 'In inventory', className: 'bg-amber-500/15 text-amber-600 border-amber-500/30' },
  on_order: { label: 'On order sheet', className: 'bg-blue-500/15 text-blue-600 border-blue-500/30' },
  not_found: { label: 'Not in inventory', className: 'bg-muted text-muted-foreground border-border' },
  unrecognized: { label: 'Not a product code', className: 'bg-red-500/10 text-red-500 border-red-500/30' },
  amazon_label: { label: 'Amazon sticker', className: 'bg-amber-500/15 text-amber-600 border-amber-500/30' },
  error: { label: 'Error', className: 'bg-red-500/10 text-red-500 border-red-500/30' },
};

const inStockOf = (rows: MatchRow[]) => rows.filter((r) => r.status !== 'sold' && r.status !== 'shipped');

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ScanSession() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { user, team, profile } = useAuth();
  const workflow = useWorkflowSettings();
  const { data: categories = [] } = useCategories();
  const { data: storageLocations = [] } = useStorageLocations();
  const { data: inventoryItems = [] } = useItems();
  const { data: orderItems = [] } = useOrderSheetItems();

  const [mode, setMode] = useState<Mode>(() => {
    const fromUrl = searchParams.get('mode');
    if (fromUrl === 'find' || fromUrl === 'add') return fromUrl;
    try {
      return (localStorage.getItem(MODE_KEY) as Mode) || 'add';
    } catch {
      return 'add';
    }
  });
  const [defaults, setDefaults] = useState<IntakeDefaults>(() =>
    readStorage<IntakeDefaults>('local', DEFAULTS_KEY, {
      decision: 'sell',
      storageLocationId: '',
      condition: 'new',
      cost: 0,
      source: '',
      resalePercent: 60,
      roundTo99: true,
    })
  );
  const [rows, setRows] = useState<SessionRow[]>(readRows);
  const [showSettings, setShowSettings] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [pending, setPending] = useState(0);
  const [feedback, setFeedback] = useState<{ kind: RowKind; text: string; at: number } | null>(null);
  const [editItem, setEditItem] = useState<Item | null>(null);
  const [linkTarget, setLinkTarget] = useState<{ upc: string; rowKey: string } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const manualRef = useRef<HTMLInputElement>(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  // Persist
  useEffect(() => writeStorage('local', DEFAULTS_KEY, defaults), [defaults]);
  useEffect(() => writeStorage('session', ROWS_KEY, rows), [rows]);
  useEffect(() => {
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      /* ignore */
    }
  }, [mode]);

  // Fill the acquisition source from workflow settings the first time
  useEffect(() => {
    if (!defaults.source && workflow.defaultAcquisitionSource) {
      setDefaults((d) => (d.source ? d : { ...d, source: workflow.defaultAcquisitionSource }));
    }
  }, [workflow.defaultAcquisitionSource, defaults.source]);

  const ctx: IntakeContext | null = useMemo(
    () =>
      team?.id && user?.id
        ? { teamId: team.id, userId: user.id, categories, defaults }
        : null,
    [team?.id, user?.id, categories, defaults]
  );
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  // ── Feedback ───────────────────────────────────────────────────────────────

  const signal = useCallback(
    (kind: RowKind, text: string) => {
      setFeedback({ kind, text, at: Date.now() });
      const tone =
        kind === 'received' ? 'chime' : kind === 'added' ? 'ding' : kind === 'existing' || kind === 'on_order' ? 'pop' : 'whoosh';
      playSynthesizedTone(tone, 0.4);
      if (workflow.scanHapticFeedback && 'vibrate' in navigator) {
        navigator.vibrate(kind === 'unrecognized' || kind === 'error' ? [60, 60, 60] : 80);
      }
    },
    [workflow.scanHapticFeedback]
  );

  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback((f) => (f?.at === feedback.at ? null : f)), 2600);
    return () => clearTimeout(t);
  }, [feedback]);

  const pushRow = (row: Omit<SessionRow, 'key' | 'at'>) => {
    const full: SessionRow = { ...row, key: uid(), at: Date.now() };
    setRows((prev) => [full, ...prev]);
    return full;
  };

  const patchRow = (key: string, patch: Partial<SessionRow> | ((r: SessionRow) => Partial<SessionRow>)) => {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.key === key);
      if (idx === -1) return prev;
      const current = prev[idx];
      const next = { ...current, ...(typeof patch === 'function' ? patch(current) : patch), at: Date.now() };
      // Move touched row to the top
      return [next, ...prev.slice(0, idx), ...prev.slice(idx + 1)];
    });
  };

  const removeRow = (key: string) => setRows((prev) => prev.filter((r) => r.key !== key));

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['items'] });
    queryClient.invalidateQueries({ queryKey: ['unconfirmed-count'] });
  };

  // ── Core: handle one scan ──────────────────────────────────────────────────

  /**
   * A row from this session for the same product: shares a barcode (incl. the
   * ASIN/FNSKU behind it) or, when `title` is given, came from the other kind
   * of barcode (UPC vs Amazon) moments ago under the same name. Newest first.
   */
  const findSessionProduct = (codes: string[], title: string | null, codeType?: CodeType) => {
    const now = Date.now();
    const wanted = codes.filter(Boolean);
    const target = title && !isUnknownTitle(title) ? normalizeTitle(title) : null;
    for (const r of rowsRef.current) {
      if ((r.kind !== 'added' && r.kind !== 'received') || r.itemIds.length === 0) continue;
      const recent = now - r.at < SAME_BOX_MS;
      const sameCode = wanted.some((code) => code === r.code || r.altCodes?.includes(code));
      const sameName =
        recent && !!target && r.codeType !== codeType && !isUnknownTitle(r.title) &&
        jaccardSimilarity(target, normalizeTitle(r.title)) >= 0.6;
      if (sameCode || sameName) return { row: r, recent };
    }
    return null;
  };

  /** Second barcode on a box we just handled: save it on that item instead of adding another. */
  const linkSameBox = async (row: SessionRow, code: string, codeType: CodeType) => {
    await attachCode(row.itemIds, code, codeType);
    patchRow(row.key, (r) => ({ altCodes: [...new Set([...(r.altCodes ?? []), code])] }));
    signal('existing', `Same box: ${row.title}`);
    invalidate();
  };

  const processCode = useCallback(
    async (scannedCode: string, scannedType: CodeType) => {
      const c = ctxRef.current;
      if (!c) return;
      const currentMode = modeRef.current;
      let code = scannedCode;
      let codeType = scannedType;
      let preLookup: ProductLookup | undefined;
      const altCodes: string[] = [];

      // Amazon FNSKU sticker (X00…) → look up the product's ASIN, then carry on as an ASIN scan
      if (codeType === 'fnsku') {
        if (rowsRef.current.some((r) => r.kind === 'amazon_label' && r.code === code)) return;
        const lookup = await lookupProduct(code, 'fnsku');
        if (!lookup.asin) {
          pushRow({
            code, codeType, kind: 'amazon_label', title: `Amazon sticker ${code}`, photo: null, itemIds: [],
            message: /OPENWEBNINJA/.test(lookup.error ?? '')
              ? 'Looking up Amazon X00 stickers needs the Amazon data key (OPENWEBNINJA_API_KEY). Scan the product barcode on the box instead.'
              : 'Couldn’t match this Amazon sticker to a product. Scan the product barcode on the box instead.',
          });
          signal('amazon_label', 'Amazon sticker — scan the product barcode');
          return;
        }
        altCodes.push(code);
        code = lookup.asin;
        codeType = 'asin';
        preLookup = lookup;
      }

      if (currentMode === 'add') {
        const same = findSessionProduct([code, ...altCodes], null);
        // A different barcode of something we handled a few seconds ago → same box
        if (same && same.row.code !== code && same.recent) {
          await linkSameBox(same.row, code, codeType);
          return;
        }
        // Another unit of something added earlier this session
        if (same && same.row.kind === 'added') {
          const sessionRow = same.row;
          const unit = await cloneUnit(sessionRow.itemIds[sessionRow.itemIds.length - 1], c);
          patchRow(sessionRow.key, (r) => ({
            itemIds: [...r.itemIds, unit.id],
            altCodes: [...new Set([...(r.altCodes ?? []), code, ...altCodes])].filter((x) => x !== r.code),
          }));
          signal('added', `+1 · ${sessionRow.title} (×${sessionRow.itemIds.length + 1})`);
          invalidate();
          return;
        }
      }

      const matches = await findByCode(c.teamId, code, codeType);
      const unconfirmed = matches.filter((m) => m.physical_status === 'unconfirmed');
      const inStock = inStockOf(matches.filter((m) => m.physical_status !== 'unconfirmed'));

      // ── Find mode ──
      if (currentMode === 'find') {
        if (inStock.length > 0) {
          const first = inStock[0];
          pushRow({
            code, codeType, kind: 'existing', title: first.title || 'Untitled item',
            photo: first.photos?.[0] ?? null, itemIds: [], matchIds: inStock.map((m) => m.id),
            location: first.storage_location?.name ?? null, price: first.target_price, inStock: inStock.length,
          });
          signal('existing', `${first.title || 'Item'}${first.storage_location?.name ? ` · ${first.storage_location.name}` : ''}`);
          if (workflow.scanAutoOpenEdit) void openEdit(first.id);
        } else if (unconfirmed.length > 0) {
          const first = unconfirmed[0];
          pushRow({
            code, codeType, kind: 'on_order', title: first.title || 'Untitled item',
            photo: first.photos?.[0] ?? null, itemIds: [], matchIds: unconfirmed.map((m) => m.id),
          });
          signal('on_order', `On order sheet: ${first.title || 'item'}`);
        } else {
          pushRow({ code, codeType, kind: 'not_found', title: `No item for ${code}`, photo: null, itemIds: [] });
          signal('not_found', 'Not in inventory');
        }
        return;
      }

      // ── Add & receive mode ──
      // 1. Receive the oldest unconfirmed unit (repeat scans walk through identical units)
      if (unconfirmed.length > 0) {
        const target = unconfirmed[0];
        const undo = await receiveItem(target, c);
        pushRow({
          code, codeType, kind: 'received', title: target.title || 'Untitled item',
          photo: target.photos?.[0] ?? null, itemIds: [target.id], undo, altCodes,
          location: storageLocations.find((l) => l.id === (c.defaults.storageLocationId || target.storage_location_id))?.name ?? null,
          price: target.target_price,
          message: unconfirmed.length > 1 ? `${unconfirmed.length - 1} more unit${unconfirmed.length > 2 ? 's' : ''} still on the order sheet` : undefined,
        });
        signal('received', `Received: ${target.title || 'item'}`);
        invalidate();
        return;
      }

      // 2. Already in inventory — don't double count; offer +1 unit
      if (matches.length > 0) {
        const first = inStock[0] ?? matches[matches.length - 1];
        pushRow({
          code, codeType, kind: 'existing', title: first.title || 'Untitled item',
          photo: first.photos?.[0] ?? null, itemIds: [], matchIds: (inStock.length ? inStock : matches).map((m) => m.id),
          location: first.storage_location?.name ?? null, price: first.target_price, inStock: inStock.length,
        });
        signal('existing', `Already have ${inStock.length || 'sold'}: ${first.title || 'item'}`);
        return;
      }

      // 3. Unknown — look it up
      const lookup = preLookup ?? (await lookupProduct(code, codeType));
      const asin = codeType === 'asin' ? code : lookup.asin;

      // 3a. Same box as something handled a moment ago (other barcode, same product)
      if (lookup.found) {
        const same = findSessionProduct(asin ? [asin] : [], lookup.title, codeType);
        if (same?.recent) {
          await linkSameBox(same.row, code, codeType);
          return;
        }
      }

      // 3b. The lookup found the Amazon ASIN → match items imported from Amazon orders
      if (codeType === 'upc' && asin) {
        const byAsin = await findByCode(c.teamId, asin, 'asin');
        const waiting = byAsin.filter((m) => m.physical_status === 'unconfirmed');
        if (waiting.length > 0) {
          const target = waiting[0];
          const undo = await receiveItem(target, c, target.upc ? {} : { upc: code });
          pushRow({
            code, codeType, kind: 'received', title: target.title || lookup.title || 'Item',
            photo: target.photos?.[0] ?? lookup.imageUrl, itemIds: [target.id], undo, altCodes: [asin],
            location: storageLocations.find((l) => l.id === (c.defaults.storageLocationId || target.storage_location_id))?.name ?? null,
            price: target.target_price,
            message: waiting.length > 1 ? `${waiting.length - 1} more unit${waiting.length > 2 ? 's' : ''} still on the order sheet` : undefined,
          });
          signal('received', `Received: ${target.title || 'item'}`);
          invalidate();
          return;
        }
        if (byAsin.length > 0) {
          await attachCode(byAsin.map((m) => m.id), code, codeType);
          const have = inStockOf(byAsin);
          const first = have[0] ?? byAsin[byAsin.length - 1];
          pushRow({
            code, codeType, kind: 'existing', title: first.title || 'Untitled item',
            photo: first.photos?.[0] ?? null, itemIds: [], matchIds: (have.length ? have : byAsin).map((m) => m.id),
            location: first.storage_location?.name ?? null, price: first.target_price, inStock: have.length,
            message: 'Matched by Amazon ASIN — barcode saved',
          });
          signal('existing', `Already have ${have.length || 'sold'}: ${first.title || 'item'}`);
          invalidate();
          return;
        }
      }

      // 3c. A UPC whose product name clearly matches an Order Sheet item → link + receive
      if (codeType === 'upc' && lookup.found) {
        const nameMatch = await findOrderSheetNameMatch(c.teamId, lookup.title);
        if (nameMatch) {
          const undo = await receiveItem(nameMatch, c, { upc: code });
          pushRow({
            code, codeType, kind: 'received', title: nameMatch.title || lookup.title || 'Item',
            photo: nameMatch.photos?.[0] ?? lookup.imageUrl, itemIds: [nameMatch.id], undo, matchedByName: true,
            price: nameMatch.target_price, altCodes: asin ? [asin] : [],
          });
          signal('received', `Matched order: ${nameMatch.title || 'item'}`);
          invalidate();
          return;
        }
      }

      // 3d. Create a new, autofilled item
      const created = await createFromBarcode(code, codeType, c, lookup);
      pushRow({
        code, codeType, kind: 'added', title: created.title || 'Untitled item',
        photo: created.photos?.[0] ?? null, itemIds: [created.id], price: created.target_price,
        location: storageLocations.find((l) => l.id === created.storage_location_id)?.name ?? null,
        autofilled: lookup.found,
        fuzzy: lookup.found && lookup.fuzzy,
        altCodes: [...altCodes, ...(asin && asin !== code ? [asin] : [])],
        message: lookup.found
          ? lookup.fuzzy
            ? 'Found by searching Amazon — check it’s the right product'
            : undefined
          : lookup.error ?? 'Product not found — fill in details later',
      });
      signal('added', lookup.found ? `Added: ${created.title}` : 'Added — needs details');
      invalidate();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signal, storageLocations, workflow.scanAutoOpenEdit]
  );

  /** Queue scans so two quick scans never race each other. */
  const enqueue = useCallback(
    (code: string, codeType: CodeType) => {
      setPending((n) => n + 1);
      queueRef.current = queueRef.current
        .then(() => processCode(code, codeType))
        .catch((e) => {
          console.error('Scan intake failed:', e);
          pushRow({
            code, codeType, kind: 'error', title: code, photo: null, itemIds: [],
            message: e instanceof Error ? e.message : 'Something went wrong — try again',
          });
          signal('error', 'Could not save that scan');
        })
        .finally(() => setPending((n) => n - 1));
    },
    [processCode, signal]
  );

  // ── Camera ─────────────────────────────────────────────────────────────────

  const scanner = useContinuousScanner((result) => {
    if (result.status === 'found') {
      enqueue(result.value, result.codeType);
    } else {
      // Sweeping past the same shipping label again shouldn't pile up rows
      if (rowsRef.current.some((r) => r.kind === 'unrecognized' && r.code === result.rawValue)) return;
      pushRow({
        code: result.rawValue, codeType: null, kind: 'unrecognized', title: result.rawValue.slice(0, 40),
        photo: null, itemIds: [], message: 'Shipping/tracking label? Scan the product barcode or Amazon label instead.',
      });
      signal('unrecognized', 'Not a product barcode');
    }
  });

  useEffect(() => {
    if (!cameraEnabled || !videoRef.current) return;
    void scanner.start(videoRef.current);
    return () => scanner.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraEnabled]);

  // Ignore the camera while a sheet is open
  useEffect(() => {
    if (editItem || linkTarget) scanner.pause();
    else scanner.resume();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editItem, linkTarget]);

  // Hardware scanner guns type the code + Enter — keep the box focused on desktop
  useEffect(() => {
    try {
      if (window.matchMedia('(pointer: fine)').matches) manualRef.current?.focus();
    } catch {
      /* ignore */
    }
  }, []);

  const submitManual = () => {
    const parsed = classifyCode(manualCode);
    if (!parsed) {
      toast.error('That doesn’t look like a valid UPC, EAN, ISBN, ASIN or Amazon X00 code');
      return;
    }
    enqueue(parsed.value, parsed.codeType);
    setManualCode('');
  };

  // ── Row actions ────────────────────────────────────────────────────────────

  const openEdit = async (itemId: string) => {
    const { data, error } = await supabase
      .from('items')
      .select('*, category:categories(*), storage_location:storage_locations(*)')
      .eq('id', itemId)
      .single();
    if (error || !data) {
      toast.error('Could not open item');
      return;
    }
    setEditItem(data as unknown as Item);
  };

  const refreshRowsForItem = async (itemId: string) => {
    const { data } = await supabase
      .from('items')
      .select('id, title, photos, target_price, storage_location:storage_locations(name)')
      .eq('id', itemId)
      .single();
    if (!data) return;
    const d = data as unknown as { title: string | null; photos: string[] | null; target_price: number | null; storage_location: { name: string } | null };
    setRows((prev) =>
      prev.map((r) =>
        r.itemIds.includes(itemId) || r.matchIds?.[0] === itemId
          ? { ...r, title: d.title || r.title, photo: d.photos?.[0] ?? r.photo, price: d.target_price, location: d.storage_location?.name ?? r.location }
          : r
      )
    );
  };

  const runAction = async (fn: () => Promise<void>) => {
    try {
      await fn();
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    }
  };

  const undoRow = (row: SessionRow) =>
    runAction(async () => {
      if (row.kind === 'received' && row.undo) {
        await undoReceive(row.itemIds[0], row.undo);
        removeRow(row.key);
        toast.success('Moved back to the order sheet');
      } else if (row.kind === 'added') {
        const last = row.itemIds[row.itemIds.length - 1];
        await deleteItem(last);
        if (row.itemIds.length <= 1) removeRow(row.key);
        else patchRow(row.key, { itemIds: row.itemIds.slice(0, -1) });
        toast.success(row.itemIds.length > 1 ? 'Removed one unit' : 'Item removed');
      }
    });

  const addUnit = (row: SessionRow) =>
    runAction(async () => {
      const c = ctxRef.current;
      const sourceId = row.itemIds[row.itemIds.length - 1] ?? row.matchIds?.[0];
      if (!c || !sourceId) return;
      const unit = await cloneUnit(sourceId, c);
      if (row.kind === 'added') {
        patchRow(row.key, (r) => ({ itemIds: [...r.itemIds, unit.id] }));
      } else {
        // An extra unit of something already in inventory becomes an "added" row
        pushRow({
          code: row.code, codeType: row.codeType, kind: 'added', title: unit.title || row.title,
          photo: unit.photos?.[0] ?? row.photo, itemIds: [unit.id], price: unit.target_price,
          location: storageLocations.find((l) => l.id === unit.storage_location_id)?.name ?? null, autofilled: true,
        });
      }
      toast.success('Added another unit');
    });

  const receiveOnOrder = (row: SessionRow) =>
    runAction(async () => {
      const c = ctxRef.current;
      if (!c || !row.matchIds?.[0] || !row.codeType) return;
      const matches = await findByCode(c.teamId, row.code, row.codeType);
      const target = matches.find((m) => m.physical_status === 'unconfirmed');
      if (!target) {
        toast.info('Already received');
        return;
      }
      const undo = await receiveItem(target, c);
      patchRow(row.key, { kind: 'received', itemIds: [target.id], undo });
      signal('received', `Received: ${target.title || 'item'}`);
    });

  const addFromNotFound = (row: SessionRow) =>
    runAction(async () => {
      const c = ctxRef.current;
      if (!c || !row.codeType) return;
      const created = await createFromBarcode(row.code, row.codeType, c);
      patchRow(row.key, {
        kind: 'added', title: created.title || 'Untitled item', photo: created.photos?.[0] ?? null,
        itemIds: [created.id], price: created.target_price, autofilled: !!created.lookup?.found,
      });
      signal('added', `Added: ${created.title}`);
    });

  /** "Wrong item?" — throw away the auto-created item and link the barcode to an existing one. */
  const onLinked = (item: Item) =>
    runAction(async () => {
      const c = ctxRef.current;
      const target = linkTarget;
      setLinkTarget(null);
      if (!c || !target) return;
      const row = rowsRef.current.find((r) => r.key === target.rowKey);
      if (row?.kind === 'added') {
        for (const id of row.itemIds) await deleteItem(id);
      }
      if (item.physical_status === 'unconfirmed') {
        const undo = await receiveItem(item as unknown as MatchRow, c);
        patchRow(target.rowKey, {
          kind: 'received', title: item.title || 'Item', photo: item.photos?.[0] ?? null,
          itemIds: [item.id], undo, autofilled: false, message: undefined,
        });
      } else {
        patchRow(target.rowKey, {
          kind: 'existing', title: item.title || 'Item', photo: item.photos?.[0] ?? null,
          itemIds: [], matchIds: [item.id], autofilled: false, message: 'Barcode linked',
        });
      }
    });

  // ── Derived ────────────────────────────────────────────────────────────────

  const summary = useMemo(() => {
    let received = 0;
    let added = 0;
    let needsDetails = 0;
    for (const r of rows) {
      if (r.kind === 'received') received += 1;
      if (r.kind === 'added') {
        added += r.itemIds.length;
        if (!r.autofilled || r.price == null) needsDetails += r.itemIds.length;
      }
    }
    return { received, added, needsDetails };
  }, [rows]);

  const linkCandidates = useMemo(
    () => [...orderItems, ...inventoryItems].filter((i) => !i.upc),
    [orderItems, inventoryItems]
  );

  const finish = () => {
    sessionStorage.removeItem(ROWS_KEY);
    scanner.stop();
    // Let teammates know what came in (fire-and-forget)
    if (team?.id && user?.id && (summary.added > 0 || summary.received > 0)) {
      const parts = [
        summary.received > 0 ? `received ${summary.received}` : null,
        summary.added > 0 ? `added ${summary.added}` : null,
      ].filter(Boolean);
      void notifyTeammates(team.id, user.id, {
        type: 'scan_session',
        title: '📦 Items scanned in',
        message: `${profile?.full_name || 'Your teammate'} ${parts.join(' and ')} item${summary.added + summary.received === 1 ? '' : 's'}${
          summary.needsDetails > 0 ? ` — ${summary.needsDetails} need details` : ''
        }`,
        link: summary.needsDetails > 0 ? '/inventory?view=needs-details' : '/inventory',
      });
    }
    navigate(summary.needsDetails > 0 ? '/inventory?view=needs-details' : '/inventory');
  };

  const clearList = () => {
    setRows([]);
    try {
      sessionStorage.removeItem(ROWS_KEY);
    } catch {
      /* ignore */
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      {/* Header */}
      <header
        className="flex items-center gap-2 px-3 py-2 border-b border-border bg-background"
        style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 8px)' }}
      >
        <Button variant="ghost" size="icon" onClick={finish} aria-label="Close scan session">
          <X className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold leading-tight">Scan session</h1>
          <p className="text-xs text-muted-foreground truncate">
            {mode === 'add' ? 'Receives orders, adds new items' : 'Finds items — nothing is changed'}
          </p>
        </div>
        <div className="flex rounded-lg border border-border p-0.5 text-xs" role="tablist">
          {(['add', 'find'] as Mode[]).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                'px-2.5 py-1 rounded-md font-medium transition-colors',
                mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
              )}
            >
              {m === 'add' ? 'Add' : 'Find'}
            </button>
          ))}
        </div>
      </header>

      {/* Camera */}
      <div className="relative bg-black h-[34vh] min-h-[200px] flex-shrink-0 overflow-hidden">
        {cameraEnabled ? (
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted autoPlay />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-white/60 gap-2 text-sm">
            <CameraOff className="w-8 h-8" />
            Camera off — type or use a scanner gun below
          </div>
        )}

        {cameraEnabled && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-[78%] max-w-[320px] h-[42%] border-2 border-primary/90 rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]">
              {scanner.isRunning && <div className="absolute inset-x-2 top-0 h-0.5 bg-primary/80 animate-scan-line" />}
            </div>
          </div>
        )}

        {/* Camera controls */}
        <div className="absolute top-2 right-2 flex gap-2">
          {scanner.torchSupported && (
            <button
              onClick={() => void scanner.toggleTorch()}
              className="w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center"
              aria-label="Toggle flashlight"
            >
              {scanner.torchOn ? <ZapOff className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
            </button>
          )}
          <button
            onClick={() => setCameraEnabled((v) => !v)}
            className="w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center"
            aria-label={cameraEnabled ? 'Turn camera off' : 'Turn camera on'}
          >
            {cameraEnabled ? <CameraOff className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
          </button>
        </div>

        {pending > 0 && (
          <div className="absolute top-2 left-2 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white">
            <Loader2 className="w-3 h-3 animate-spin" />
            Looking up…
          </div>
        )}

        {scanner.error && (
          <div className="absolute inset-x-3 bottom-3 rounded-lg bg-red-500/90 px-3 py-2 text-sm text-white">
            {scanner.error}
          </div>
        )}

        {feedback && !scanner.error && (
          <div
            key={feedback.at}
            className={cn(
              'absolute inset-x-3 bottom-3 rounded-lg px-3 py-2 text-sm font-medium text-white shadow-lg animate-in fade-in slide-in-from-bottom-2',
              feedback.kind === 'received' && 'bg-green-600/95',
              feedback.kind === 'added' && 'bg-primary/95',
              (feedback.kind === 'existing' || feedback.kind === 'on_order' || feedback.kind === 'amazon_label') && 'bg-amber-600/95',
              (feedback.kind === 'not_found' || feedback.kind === 'unrecognized' || feedback.kind === 'error') && 'bg-red-600/95'
            )}
          >
            <span className="line-clamp-2">{feedback.text}</span>
          </div>
        )}
      </div>

      {/* Session defaults (add mode) */}
      {mode === 'add' && (
        <div className="border-b border-border px-3 py-2 space-y-2 bg-muted/20">
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-border p-0.5 text-xs flex-shrink-0">
              {(['sell', 'keep'] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDefaults((s) => ({ ...s, decision: d }))}
                  className={cn(
                    'px-2.5 py-1 rounded font-medium capitalize',
                    defaults.decision === d ? 'bg-foreground text-background' : 'text-muted-foreground'
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
            <Select
              value={defaults.storageLocationId || 'none'}
              onValueChange={(v) => setDefaults((s) => ({ ...s, storageLocationId: v === 'none' ? '' : v }))}
            >
              <SelectTrigger className="h-8 text-xs flex-1 min-w-0">
                <SelectValue placeholder="Location" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No location</SelectItem>
                {storageLocations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant={showSettings ? 'default' : 'outline'}
              size="icon"
              className="h-8 w-8 flex-shrink-0"
              onClick={() => setShowSettings((v) => !v)}
              aria-label="More defaults"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </Button>
          </div>

          {showSettings && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="space-y-1">
                <Label className="text-xs">Condition</Label>
                <Select
                  value={defaults.condition}
                  onValueChange={(v) => setDefaults((s) => ({ ...s, condition: v as ItemCondition }))}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(conditionLabels) as ItemCondition[]).map((c) => (
                      <SelectItem key={c} value={c}>
                        {conditionLabels[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Cost each ($)</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  className="h-8 text-xs"
                  value={defaults.cost || ''}
                  placeholder="0.00"
                  onChange={(e) => setDefaults((s) => ({ ...s, cost: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Source</Label>
                <Input
                  className="h-8 text-xs"
                  value={defaults.source}
                  placeholder="Vine, thrift, Target…"
                  onChange={(e) => setDefaults((s) => ({ ...s, source: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Price at % of retail</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="200"
                  className="h-8 text-xs"
                  value={defaults.resalePercent || ''}
                  onChange={(e) => setDefaults((s) => ({ ...s, resalePercent: parseInt(e.target.value, 10) || 0 }))}
                />
              </div>
              <label className="col-span-2 flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={defaults.roundTo99}
                  onChange={(e) => setDefaults((s) => ({ ...s, roundTo99: e.target.checked }))}
                />
                Round suggested prices to .99
              </label>
            </div>
          )}
        </div>
      )}

      {/* Manual entry */}
      <form
        className="flex items-center gap-2 px-3 py-2 border-b border-border"
        onSubmit={(e) => {
          e.preventDefault();
          submitManual();
        }}
      >
        <div className="relative flex-1">
          <Keyboard className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            ref={manualRef}
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="Type a UPC / ISBN / ASIN"
            className="h-9 pl-8 text-sm"
            inputMode="text"
            autoComplete="off"
          />
        </div>
        <Button type="submit" size="sm" disabled={!manualCode.trim()}>
          <Search className="w-4 h-4" />
        </Button>
      </form>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {rows.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-10 px-6 space-y-2">
            <ScanLine className="w-8 h-8 mx-auto opacity-60" />
            {mode === 'add' ? (
              <>
                <p>Scan items one after another — the camera stays on.</p>
                <p className="text-xs">
                  Order sheet items get received, new barcodes are looked up and added with title, photo, brand and a
                  suggested price. Scan the same product again to add another unit.
                </p>
              </>
            ) : (
              <p>Scan an item to see where it is and edit it.</p>
            )}
          </div>
        ) : (
          rows.map((row) => (
            <SessionRowCard
              key={row.key}
              row={row}
              onUndo={() => void undoRow(row)}
              onEdit={() => {
                const id = row.itemIds[row.itemIds.length - 1] ?? row.matchIds?.[0];
                if (id) void openEdit(id);
              }}
              onAddUnit={() => void addUnit(row)}
              onReceive={() => void receiveOnOrder(row)}
              onAdd={() => void addFromNotFound(row)}
              onLink={
                row.kind === 'added' && row.codeType === 'upc'
                  ? () => setLinkTarget({ upc: row.code, rowKey: row.key })
                  : undefined
              }
              onDismiss={() => removeRow(row.key)}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <footer
        className="border-t border-border px-3 py-2 flex items-center gap-3 bg-background"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)' }}
      >
        <div className="flex-1 text-xs text-muted-foreground leading-tight">
          <span className="text-foreground font-medium">{summary.received}</span> received ·{' '}
          <span className="text-foreground font-medium">{summary.added}</span> added
          {summary.needsDetails > 0 && (
            <>
              {' '}· <span className="text-amber-600 font-medium">{summary.needsDetails} need details</span>
            </>
          )}
          {rows.length > 0 && (
            <button className="block underline-offset-2 hover:underline mt-0.5" onClick={clearList}>
              Clear list
            </button>
          )}
        </div>
        <Button onClick={finish}>Done</Button>
      </footer>

      <QuickEditSheet
        item={editItem}
        open={!!editItem}
        onClose={() => setEditItem(null)}
        onSaved={() => {
          const id = editItem?.id;
          setEditItem(null);
          invalidate();
          if (id) void refreshRowsForItem(id);
        }}
      />

      <LinkUpcSheet
        upc={linkTarget?.upc ?? null}
        open={!!linkTarget}
        items={linkCandidates}
        onClose={() => setLinkTarget(null)}
        onLinked={(item) => void onLinked(item)}
      />
    </div>
  );
}

// ── Row card ─────────────────────────────────────────────────────────────────

interface RowCardProps {
  row: SessionRow;
  onUndo: () => void;
  onEdit: () => void;
  onAddUnit: () => void;
  onReceive: () => void;
  onAdd: () => void;
  onLink?: () => void;
  onDismiss: () => void;
}

function SessionRowCard({ row, onUndo, onEdit, onAddUnit, onReceive, onAdd, onLink, onDismiss }: RowCardProps) {
  const style = KIND_STYLE[row.kind];
  const units = row.itemIds.length;
  const isProblem = row.kind === 'unrecognized' || row.kind === 'error';

  return (
    <div className="rounded-lg border border-border bg-card p-2.5">
      <div className="flex gap-2.5">
        <div className="w-12 h-12 flex-shrink-0 rounded-md bg-muted overflow-hidden flex items-center justify-center">
          {row.photo ? (
            <img src={row.photo} alt="" className="w-full h-full object-cover" />
          ) : isProblem ? (
            <AlertTriangle className="w-5 h-5 text-red-500" />
          ) : (
            <Package className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-1.5">
            <p className="text-sm font-medium leading-snug line-clamp-2 flex-1">{row.title}</p>
            {row.kind === 'added' && units > 1 && (
              <Badge variant="secondary" className="flex-shrink-0 h-5 text-xs">
                ×{units}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1 mt-1">
            <Badge variant="outline" className={cn('h-5 text-[11px]', style.className)}>
              {row.kind === 'received' && <CheckCircle2 className="w-3 h-3 mr-1" />}
              {row.kind === 'added' && row.autofilled && <Sparkles className="w-3 h-3 mr-1" />}
              {style.label}
            </Badge>
            {row.matchedByName && (
              <Badge variant="outline" className="h-5 text-[11px]">
                matched by name
              </Badge>
            )}
            {row.fuzzy && (
              <Badge variant="outline" className="h-5 text-[11px]">
                Amazon search
              </Badge>
            )}
            {row.kind === 'existing' && row.inStock != null && (
              <span className="text-[11px] text-muted-foreground">{row.inStock} in stock</span>
            )}
            {row.location && <span className="text-[11px] text-muted-foreground">· {row.location}</span>}
            {row.price != null && <span className="text-[11px] text-muted-foreground">· ${row.price.toFixed(2)}</span>}
            {row.kind === 'added' && row.price == null && (
              <span className="text-[11px] text-amber-600">· no price</span>
            )}
          </div>
          {row.message && <p className="text-[11px] text-muted-foreground mt-1">{row.message}</p>}
          {row.codeType && <p className="text-[10px] text-muted-foreground/70 font-mono mt-0.5">{row.code}</p>}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mt-2">
        {(row.kind === 'received' || row.kind === 'added') && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onUndo}>
            <Undo2 className="w-3.5 h-3.5 mr-1" />
            {row.kind === 'added' && units > 1 ? 'Remove one' : 'Undo'}
          </Button>
        )}
        {(row.kind === 'received' || row.kind === 'added' || row.kind === 'existing') && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onEdit}>
            <Pencil className="w-3.5 h-3.5 mr-1" />
            {row.kind === 'added' && (!row.autofilled || row.price == null) ? 'Fill in' : 'Edit'}
          </Button>
        )}
        {(row.kind === 'added' || row.kind === 'existing') && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onAddUnit}>
            <Plus className="w-3.5 h-3.5 mr-1" />1 unit
          </Button>
        )}
        {onLink && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onLink}>
            <Link2 className="w-3.5 h-3.5 mr-1" />
            Wrong item? Link
          </Button>
        )}
        {row.kind === 'on_order' && (
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={onReceive}>
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
            Receive now
          </Button>
        )}
        {row.kind === 'not_found' && (
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={onAdd}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add it
          </Button>
        )}
        {(isProblem || row.kind === 'amazon_label' || row.kind === 'not_found' || row.kind === 'existing' || row.kind === 'on_order') && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground ml-auto" onClick={onDismiss}>
            Dismiss
          </Button>
        )}
      </div>
    </div>
  );
}
