import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Upload, FileSpreadsheet, ClipboardPaste, Sparkles, CheckCircle2, ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import type { TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkflowSettings } from '@/hooks/useUserPreferences';
import {
  useCategories,
  useStorageLocations,
  conditionLabels,
  type Category,
  type ItemCondition,
  type StorageLocation,
} from '@/hooks/useInventory';
import {
  FIELD_DEFS,
  autoMapColumns,
  isEmptyRecord,
  parseDelimitedText,
  parseListFile,
  toRecords,
  type ColumnMapping,
  type ListField,
  type ListRecord,
  type ParsedSheet,
} from '@/utils/generic-list-parser';
import { findDuplicate, type ExistingItemIndex } from '@/utils/import-dedup-engine';
import {
  lookupProducts,
  matchCategory,
  suggestPrice,
  unknownItemTitle,
  type ProductLookup,
} from '@/lib/productLookup';

type Destination = 'order_sheet' | 'sell' | 'keep';
type Step = 'upload' | 'map' | 'importing' | 'done';

interface ListImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Order Sheet opens this with 'order_sheet' so items wait to be scanned in */
  defaultDestination?: Destination;
}

type ExistingRow = ExistingItemIndex & {
  category_id: string | null;
  storage_location_id: string | null;
  brand: string | null;
  retail_price: number | null;
  target_price: number | null;
  description: string | null;
  photos: string[] | null;
  original_cost: number;
};

const EXISTING_FIELDS =
  'id, title, upc, amazon_asin, amazon_order_id, data_sources, vine_review_status, vine_review_quality, amazon_shipment_status, lattice_review_status, category_id, storage_location_id, brand, retail_price, target_price, description, photos, original_cost';

const NONE = '__none__';
const MAPPING_KEY_PREFIX = 'list-import-mapping:';
const MAX_LOOKUPS = 300;

interface PlanRow {
  record: ListRecord;
  action: 'create' | 'update';
  existing?: ExistingRow;
  title: string;
}

function readSavedMapping(headers: string[]): ColumnMapping | null {
  try {
    const raw = localStorage.getItem(MAPPING_KEY_PREFIX + headers.join('|'));
    return raw ? (JSON.parse(raw) as ColumnMapping) : null;
  } catch {
    return null;
  }
}

function saveMapping(headers: string[], mapping: ColumnMapping) {
  try {
    localStorage.setItem(MAPPING_KEY_PREFIX + headers.join('|'), JSON.stringify(mapping));
  } catch {
    /* ignore */
  }
}

async function fetchExisting(teamId: string): Promise<ExistingRow[]> {
  const all: ExistingRow[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supabase
      .from('items')
      .select(EXISTING_FIELDS)
      .eq('team_id', teamId)
      .range(from, from + 999);
    if (error) throw error;
    all.push(...((data ?? []) as unknown as ExistingRow[]));
    if (!data || data.length < 1000) break;
  }
  return all;
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function ListImportDialog({ open, onOpenChange, defaultDestination = 'sell' }: ListImportDialogProps) {
  const queryClient = useQueryClient();
  const { user, team } = useAuth();
  const workflow = useWorkflowSettings();
  const { data: categories = [] } = useCategories();
  const { data: storageLocations = [] } = useStorageLocations();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [fileName, setFileName] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [showAllFields, setShowAllFields] = useState(false);
  const [existing, setExisting] = useState<ExistingRow[]>([]);
  const [loadingExisting, setLoadingExisting] = useState(false);

  // Options
  const [destination, setDestination] = useState<Destination>(defaultDestination);
  const [dedupe, setDedupe] = useState(true);
  const [lookupBarcodes, setLookupBarcodes] = useState(true);
  const [createMissing, setCreateMissing] = useState(true);
  const [suggestPrices, setSuggestPrices] = useState(true);
  const [resalePercent, setResalePercent] = useState(60);
  const [defaultCondition, setDefaultCondition] = useState<ItemCondition>('new');
  const [defaultSource, setDefaultSource] = useState('');
  const [defaultLocation, setDefaultLocation] = useState('');

  // Progress
  const [progress, setProgress] = useState({ label: '', value: 0 });
  const [result, setResult] = useState<{ created: number; updated: number; looked: number; skipped: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep('upload');
    setSheet(null);
    setFileName('');
    setPasteText('');
    setMapping({});
    setShowAllFields(false);
    setResult(null);
    setDestination(defaultDestination);
    setDefaultSource(workflow.defaultAcquisitionSource || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const loadSheet = async (parsed: ParsedSheet, name: string) => {
    if (parsed.rows.length === 0 || parsed.headers.length === 0) {
      toast.error('No rows found in that file');
      return;
    }
    setSheet(parsed);
    setFileName(name);
    setMapping(readSavedMapping(parsed.headers) ?? autoMapColumns(parsed.headers));
    setStep('map');
    if (team?.id) {
      setLoadingExisting(true);
      try {
        setExisting(await fetchExisting(team.id));
      } catch {
        toast.error('Could not load existing items — duplicates won’t be detected');
        setExisting([]);
      } finally {
        setLoadingExisting(false);
      }
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      await loadSheet(await parseListFile(file), file.name);
    } catch (e) {
      toast.error(e instanceof Error ? `Could not read file: ${e.message}` : 'Could not read file');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onPaste = () => {
    if (!pasteText.trim()) return;
    void loadSheet(parseDelimitedText(pasteText), 'Pasted rows');
  };

  // ── Plan (recomputed live as mapping/options change) ──────────────────────

  const records = useMemo(
    () => (sheet ? toRecords(sheet, mapping).filter((r) => !isEmptyRecord(r)) : []),
    [sheet, mapping]
  );
  const skippedRows = sheet ? sheet.rows.length - records.length : 0;

  const plan: PlanRow[] = useMemo(
    () =>
      records.map((record) => {
        const title =
          record.title ??
          (record.upc ? unknownItemTitle(record.upc) : record.asin ? `Amazon item (${record.asin})` : 'Untitled');
        const dup = dedupe
          ? (findDuplicate(
              // Barcode/ASIN only — generic titles ("T-shirt") would merge separate units
              { upc: record.upc, asin: record.asin ?? (record.upc?.length === 10 ? record.upc : null), title: '' },
              existing
            ) as ExistingRow | null)
          : null;
        return dup ? { record, action: 'update', existing: dup, title } : { record, action: 'create', title };
      }),
    [records, existing, dedupe]
  );

  const stats = useMemo(() => {
    const creates = plan.filter((p) => p.action === 'create');
    const units = creates.reduce((n, p) => n + p.record.quantity, 0);
    const updates = plan.length - creates.length;
    const lookupCodes = new Set(
      plan
        .filter((p) => p.record.upc && (!p.record.title || !p.record.photo || p.record.retailPrice == null))
        .map((p) => p.record.upc as string)
    );
    const newCategories = new Set(
      records
        .map((r) => r.category)
        .filter((c): c is string => !!c && !matchCategory(c, categories))
        .map((c) => c.trim())
    );
    const newLocations = new Set(
      records
        .map((r) => r.location)
        .filter((l): l is string => !!l && !storageLocations.some((s) => sameName(s.name, l)))
        .map((l) => l.trim())
    );
    return { units, updates, lookupCount: lookupCodes.size, newCategories, newLocations };
  }, [plan, records, categories, storageLocations]);

  const canImport = records.length > 0 && (mapping.title !== undefined || mapping.upc !== undefined || mapping.asin !== undefined);

  // ── Import ────────────────────────────────────────────────────────────────

  const runImport = async () => {
    if (!team?.id || !user?.id || !sheet) return;
    saveMapping(sheet.headers, mapping);
    setStep('importing');

    try {
      // 1. Barcode lookups
      let lookups = new Map<string, ProductLookup>();
      if (lookupBarcodes) {
        const codes = [
          ...new Set(
            plan
              .filter((p) => p.record.upc && (!p.record.title || !p.record.photo || p.record.retailPrice == null))
              .map((p) => p.record.upc as string)
          ),
        ].slice(0, MAX_LOOKUPS);
        if (codes.length > 0) {
          setProgress({ label: `Looking up ${codes.length} barcodes…`, value: 0 });
          lookups = await lookupProducts(codes, (done, total) =>
            setProgress({ label: `Looking up barcodes… ${done}/${total}`, value: (done / total) * 50 })
          );
        }
      }

      // 2. Categories & locations
      let cats: Pick<Category, 'id' | 'name'>[] = categories;
      let locs: Pick<StorageLocation, 'id' | 'name'>[] = storageLocations;
      if (createMissing) {
        setProgress({ label: 'Creating categories & locations…', value: 52 });
        if (stats.newCategories.size > 0) {
          const { data } = await supabase
            .from('categories')
            .insert([...stats.newCategories].map((name) => ({ name, team_id: team.id })))
            .select('id, name');
          if (data) cats = [...cats, ...data];
        }
        if (stats.newLocations.size > 0) {
          const { data } = await supabase
            .from('storage_locations')
            .insert([...stats.newLocations].map((name) => ({ name, team_id: team.id })))
            .select('id, name');
          if (data) locs = [...locs, ...data];
        }
      }
      const locationId = (name: string | null) =>
        name ? locs.find((l) => sameName(l.name, name))?.id ?? null : null;

      // 3. Build rows
      const today = new Date().toISOString().split('T')[0];
      const nowIso = new Date().toISOString();
      const inserts: TablesInsert<'items'>[] = [];
      const updates: { id: string; update: TablesUpdate<'items'> }[] = [];

      for (const p of plan) {
        const r = p.record;
        const lookup = r.upc ? lookups.get(r.upc) : undefined;
        const found = lookup?.found ? lookup : undefined;
        // A 10-character code in the barcode column is really an ISBN-10 / ASIN
        const isTenChar = !!r.upc && r.upc.length === 10;
        const upc = isTenChar ? null : r.upc;
        const asin = r.asin ?? (isTenChar ? r.upc : null);
        const retail = r.retailPrice ?? found?.retailPrice ?? null;
        const photos = r.photo ? [r.photo] : found ? (found.images.length ? found.images.slice(0, 3) : found.imageUrl ? [found.imageUrl] : []) : [];
        const categoryId = matchCategory(r.category ?? found?.category, cats);
        const description = [r.description ?? found?.description, found?.model ? `Model: ${found.model}` : null]
          .filter(Boolean)
          .join('\n\n') || null;
        const notes = [r.notes, r.sku ? `SKU: ${r.sku}` : null].filter(Boolean).join(' · ') || null;
        const target =
          r.targetPrice ?? (suggestPrices ? suggestPrice(retail, resalePercent, workflow.roundPricesToNinetyNine) : null);

        if (p.action === 'update' && p.existing) {
          const e = p.existing;
          const update: TablesUpdate<'items'> = {};
          if (!e.upc && upc) update.upc = upc;
          if (!e.amazon_asin && asin) update.amazon_asin = asin;
          if (!e.category_id && categoryId) update.category_id = categoryId;
          if (!e.storage_location_id && (locationId(r.location) || defaultLocation)) {
            update.storage_location_id = locationId(r.location) || defaultLocation;
          }
          if (!e.brand && (r.brand || found?.brand)) update.brand = r.brand ?? found?.brand ?? null;
          if (e.retail_price == null && retail != null) update.retail_price = retail;
          if (e.target_price == null && target != null) update.target_price = target;
          if (!e.description && description) update.description = description;
          if ((!e.photos || e.photos.length === 0) && photos.length) update.photos = photos;
          if (!e.original_cost && r.cost) update.original_cost = r.cost;
          if (e.title?.startsWith('Unknown item (') && (r.title || found?.title)) update.title = r.title ?? found?.title ?? null;
          const sources = e.data_sources ?? [];
          if (!sources.includes('list_import')) update.data_sources = [...sources, 'list_import'];
          if (Object.keys(update).length > 0) updates.push({ id: e.id, update });
          continue;
        }

        const decision = destination === 'order_sheet' ? 'unconfirmed' : r.decision ?? destination;
        const source = r.source ?? (defaultSource || null);
        const row: TablesInsert<'items'> = {
          team_id: team.id,
          created_by: user.id,
          title: r.title ?? found?.title ?? p.title,
          brand: r.brand ?? found?.brand ?? null,
          description,
          refurbish_notes: notes,
          photos,
          upc,
          amazon_asin: asin,
          category_id: categoryId,
          storage_location_id: locationId(r.location) || defaultLocation || null,
          original_cost: r.cost ?? 0,
          retail_price: retail,
          target_price: target,
          condition: r.condition ?? defaultCondition,
          acquisition_date: r.date ?? today,
          acquisition_source: source,
          status: r.status ?? 'acquired',
          physical_status: decision,
          confirmed_at: decision === 'unconfirmed' ? null : nowIso,
          confirmed_by: decision === 'unconfirmed' ? null : user.id,
          // Only Vine items belong in the Amazon review queue
          amazon_review_status: source && /vine/i.test(source) ? 'pending' : null,
          data_sources: ['list_import'],
        };
        for (let u = 0; u < r.quantity; u++) inserts.push({ ...row });
      }

      // 4. Write
      const totalWrites = inserts.length + updates.length;
      let written = 0;
      const bump = (n: number) => {
        written += n;
        setProgress({ label: `Saving… ${written}/${totalWrites}`, value: 55 + (written / Math.max(totalWrites, 1)) * 45 });
      };
      for (let i = 0; i < inserts.length; i += 200) {
        const chunk = inserts.slice(i, i + 200);
        const { error } = await supabase.from('items').insert(chunk);
        if (error) throw error;
        bump(chunk.length);
      }
      for (let i = 0; i < updates.length; i += 20) {
        const chunk = updates.slice(i, i + 20);
        const results = await Promise.all(chunk.map((u) => supabase.from('items').update(u.update).eq('id', u.id)));
        const failed = results.find((r) => r.error);
        if (failed?.error) throw failed.error;
        bump(chunk.length);
      }

      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['unconfirmed-count'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['storage_locations'] });
      setResult({
        created: inserts.length,
        updated: updates.length,
        looked: [...lookups.values()].filter((l) => l.found).length,
        skipped: skippedRows,
      });
      setStep('done');
    } catch (e) {
      console.error('List import failed:', e);
      toast.error(e instanceof Error ? `Import failed: ${e.message}` : 'Import failed');
      setStep('map');
    }
  };

  // ── Render helpers ────────────────────────────────────────────────────────

  const sampleFor = (col: number | undefined) => {
    if (col === undefined || !sheet) return '';
    const v = sheet.rows.find((r) => (r[col] ?? '').trim() !== '')?.[col] ?? '';
    return v.length > 32 ? `${v.slice(0, 32)}…` : v;
  };

  const setField = (field: ListField, value: string) => {
    setMapping((m) => {
      const next = { ...m };
      if (value === NONE) {
        delete next[field];
      } else {
        const col = parseInt(value, 10);
        // A column can only feed one field
        (Object.keys(next) as ListField[]).forEach((f) => {
          if (next[f] === col) delete next[f];
        });
        next[field] = col;
      }
      return next;
    });
  };

  const mappedFields = FIELD_DEFS.filter((d) => mapping[d.field] !== undefined);
  const unmappedFields = FIELD_DEFS.filter((d) => mapping[d.field] === undefined);

  return (
    <Dialog open={open} onOpenChange={(o) => step !== 'importing' && onOpenChange(o)}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-2xl max-h-[92vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            Import a list
          </DialogTitle>
          <DialogDescription>
            Any spreadsheet works — CSV, Excel, or rows copied from Google Sheets. Columns are matched automatically and
            barcodes are looked up to fill in titles, photos and prices.
          </DialogDescription>
        </DialogHeader>

        {/* ── Upload ── */}
        {step === 'upload' && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void onFile(e.dataTransfer.files?.[0]);
              }}
              className="w-full rounded-xl border-2 border-dashed border-border hover:border-primary/60 transition-colors py-10 flex flex-col items-center gap-2 text-sm text-muted-foreground"
            >
              <Upload className="w-8 h-8" />
              <span className="font-medium text-foreground">Choose a file or drop it here</span>
              <span className="text-xs">.csv, .tsv, .xlsx, .xls</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.tsv,.txt,.xlsx,.xls,.xlsm,.ods,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="hidden"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <ClipboardPaste className="w-4 h-4" />
                Or paste rows (include the header row)
              </Label>
              <Textarea
                rows={5}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={'Title\tUPC\tQty\tCost\nBluetooth speaker\t012345678905\t2\t8.00'}
                className="font-mono text-xs"
              />
              <Button variant="outline" size="sm" onClick={onPaste} disabled={!pasteText.trim()}>
                Use pasted rows
              </Button>
            </div>
          </div>
        )}

        {/* ── Map & options ── */}
        {step === 'map' && sheet && (
          <div className="space-y-5 min-w-0">
            <div className="flex items-center justify-between gap-2 text-sm min-w-0">
              <span className="text-muted-foreground truncate min-w-0">
                {fileName}
                {sheet.sheetName ? ` · ${sheet.sheetName}` : ''} · {sheet.rows.length} rows
                {sheet.headerRowIndex > 0 ? ` · headers on row ${sheet.headerRowIndex + 1}` : ''}
              </span>
              <Button variant="ghost" size="sm" className="flex-shrink-0" onClick={() => setStep('upload')}>
                <ArrowLeft className="w-4 h-4 mr-1" />
                Change
              </Button>
            </div>

            {/* Column mapping */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">
                Columns{' '}
                <span className="font-normal text-xs text-muted-foreground">
                  {mappedFields.length} matched automatically
                </span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[...mappedFields, ...(showAllFields ? unmappedFields : [])].map((def) => (
                  <div key={def.field} className="rounded-lg border border-border p-2 space-y-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <Label className="text-xs flex-shrink-0">{def.label}</Label>
                      {mapping[def.field] !== undefined && (
                        <span className="text-[11px] text-muted-foreground truncate min-w-0">
                          {sampleFor(mapping[def.field])}
                        </span>
                      )}
                    </div>
                    <Select
                      value={mapping[def.field] !== undefined ? String(mapping[def.field]) : NONE}
                      onValueChange={(v) => setField(def.field, v)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>— Not in this file —</SelectItem>
                        {sheet.headers.map((h, i) => (
                          <SelectItem key={i} value={String(i)}>
                            {h}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {def.hint && mapping[def.field] === undefined && (
                      <p className="text-[11px] text-muted-foreground">{def.hint}</p>
                    )}
                  </div>
                ))}
              </div>
              {unmappedFields.length > 0 && (
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setShowAllFields((v) => !v)}>
                  {showAllFields ? 'Hide unmatched fields' : `Map more columns (${unmappedFields.length} available)`}
                </Button>
              )}
            </section>

            {/* Options */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Where should these go?</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {(
                  [
                    ['order_sheet', 'Order sheet', 'Scan to receive later'],
                    ['sell', 'Inventory · Sell', 'Already on hand'],
                    ['keep', 'Inventory · Keep', 'Personal items'],
                  ] as const
                ).map(([value, label, sub]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDestination(value)}
                    className={`rounded-lg border p-2 text-left transition-colors ${
                      destination === value ? 'border-primary bg-primary/10' : 'border-border'
                    }`}
                  >
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-[11px] text-muted-foreground">{sub}</p>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Condition (when not in file)</Label>
                  <Select value={defaultCondition} onValueChange={(v) => setDefaultCondition(v as ItemCondition)}>
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
                  <Label className="text-xs">Location (when not in file)</Label>
                  <Select value={defaultLocation || NONE} onValueChange={(v) => setDefaultLocation(v === NONE ? '' : v)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>None</SelectItem>
                      {storageLocations.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Source (when not in file)</Label>
                  <Input
                    className="h-8 text-xs"
                    value={defaultSource}
                    onChange={(e) => setDefaultSource(e.target.value)}
                    placeholder="Vine, Goodwill, liquidation pallet…"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Suggested price (% of retail)</Label>
                  <div className="flex items-center gap-2">
                    <Switch checked={suggestPrices} onCheckedChange={setSuggestPrices} />
                    <Input
                      type="number"
                      className="h-8 text-xs"
                      value={resalePercent}
                      disabled={!suggestPrices}
                      onChange={(e) => setResalePercent(parseInt(e.target.value, 10) || 0)}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <label className="flex items-center justify-between gap-3">
                  <span>
                    Update matching items instead of duplicating
                    <span className="block text-xs text-muted-foreground">Matches by barcode or ASIN — fills in blanks, never overwrites</span>
                  </span>
                  <Switch checked={dedupe} onCheckedChange={setDedupe} />
                </label>
                <label className="flex items-center justify-between gap-3">
                  <span>
                    Look up barcodes to fill in title, photo, brand &amp; retail
                    <span className="block text-xs text-muted-foreground">
                      {stats.lookupCount > 0
                        ? `${Math.min(stats.lookupCount, MAX_LOOKUPS)} barcode${stats.lookupCount === 1 ? '' : 's'} to look up — already-seen barcodes are free`
                        : 'No barcodes need a lookup'}
                    </span>
                  </span>
                  <Switch checked={lookupBarcodes} onCheckedChange={setLookupBarcodes} />
                </label>
                {(stats.newCategories.size > 0 || stats.newLocations.size > 0) && (
                  <label className="flex items-center justify-between gap-3">
                    <span>
                      Create missing categories &amp; locations
                      <span className="block text-xs text-muted-foreground">
                        {[...stats.newCategories, ...stats.newLocations].slice(0, 6).join(', ')}
                        {stats.newCategories.size + stats.newLocations.size > 6 ? '…' : ''}
                      </span>
                    </span>
                    <Switch checked={createMissing} onCheckedChange={setCreateMissing} />
                  </label>
                )}
              </div>
            </section>

            {/* Preview */}
            <section className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <h3 className="font-semibold mr-1">Preview</h3>
                {loadingExisting ? (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    checking for duplicates…
                  </span>
                ) : (
                  <>
                    <Badge variant="secondary">{stats.units} new</Badge>
                    {stats.updates > 0 && <Badge variant="outline">{stats.updates} update existing</Badge>}
                    {skippedRows > 0 && (
                      <Badge variant="outline" className="text-muted-foreground">
                        {skippedRows} empty/total rows skipped
                      </Badge>
                    )}
                  </>
                )}
              </div>
              <div className="rounded-lg border border-border overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="text-left font-medium px-2 py-1.5">Item</th>
                      <th className="text-right font-medium px-2 py-1.5">Qty</th>
                      <th className="text-right font-medium px-2 py-1.5">Cost</th>
                      <th className="text-right font-medium px-2 py-1.5">Price</th>
                      <th className="text-left font-medium px-2 py-1.5">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.slice(0, 8).map((p) => (
                      <tr key={p.record.rowNumber} className="border-t border-border">
                        <td className="px-2 py-1.5 max-w-[220px]">
                          <p className="truncate">{p.title}</p>
                          {p.record.upc && <p className="text-[10px] text-muted-foreground font-mono">{p.record.upc}</p>}
                        </td>
                        <td className="px-2 py-1.5 text-right">{p.record.quantity}</td>
                        <td className="px-2 py-1.5 text-right">{p.record.cost != null ? `$${p.record.cost.toFixed(2)}` : '—'}</td>
                        <td className="px-2 py-1.5 text-right">
                          {p.record.targetPrice != null ? `$${p.record.targetPrice.toFixed(2)}` : '—'}
                        </td>
                        <td className="px-2 py-1.5">
                          {p.action === 'update' ? (
                            <span className="text-amber-600">Update “{p.existing?.title?.slice(0, 18)}…”</span>
                          ) : (
                            <span className="text-green-600">New{p.record.quantity > 1 ? ` ×${p.record.quantity}` : ''}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {plan.length > 8 && (
                  <p className="text-[11px] text-muted-foreground px-2 py-1.5 border-t border-border">
                    …and {plan.length - 8} more rows
                  </p>
                )}
              </div>
              {!canImport && (
                <p className="text-xs text-red-500">Map a Title, Barcode or ASIN column to continue.</p>
              )}
            </section>
          </div>
        )}

        {/* ── Importing ── */}
        {step === 'importing' && (
          <div className="py-10 space-y-3 text-center">
            <Sparkles className="w-8 h-8 mx-auto text-primary animate-pulse" />
            <p className="text-sm">{progress.label || 'Working…'}</p>
            <Progress value={progress.value} />
          </div>
        )}

        {/* ── Done ── */}
        {step === 'done' && result && (
          <div className="py-8 space-y-2 text-center">
            <CheckCircle2 className="w-10 h-10 mx-auto text-green-500" />
            <p className="font-medium">Import complete</p>
            <p className="text-sm text-muted-foreground">
              {result.created} item{result.created === 1 ? '' : 's'} added
              {result.updated > 0 ? ` · ${result.updated} updated` : ''}
              {result.looked > 0 ? ` · ${result.looked} autofilled from barcodes` : ''}
              {result.skipped > 0 ? ` · ${result.skipped} rows skipped` : ''}
            </p>
            {destination === 'order_sheet' && result.created > 0 && (
              <p className="text-xs text-muted-foreground">They’re on the Order Sheet — scan them as they arrive.</p>
            )}
          </div>
        )}

        <DialogFooter>
          {step === 'map' && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={() => void runImport()} disabled={!canImport || loadingExisting}>
                Import {stats.units + stats.updates > 0 ? stats.units + stats.updates : ''}
              </Button>
            </>
          )}
          {step === 'done' && <Button onClick={() => onOpenChange(false)}>Done</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
