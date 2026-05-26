import { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';
import {
  Package,
  Loader2,
  AlertCircle,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  ShieldAlert,
  Edit2,
  Grape,
  DollarSign,
  FileSpreadsheet,
  FileUp,
  GitMerge,
} from 'lucide-react';
import {
  parseAmazonHTML,
  ParsedAmazonItem,
  PLACEHOLDER_IMAGE,
  sanitizeTitle,
  detectAndParseCSV,
  type DetectedCSVFormat,
} from '@/utils/amazon-parser';
import {
  findDuplicate,
  computeMergeData,
  type ExistingItemIndex,
} from '@/utils/import-dedup-engine';
import { getAcquisitionDate } from '@/utils/lattice-csv-parser';
import type { OrderHistoryItem } from '@/utils/order-history-extension-parser';
import type { LatticeItem } from '@/utils/lattice-csv-parser';
import { ImportMethodTabs, type ImportMethod } from '@/components/amazon/ImportMethodTabs';

// ============================================================================
// TYPES
// ============================================================================

type WizardStep = 'paste' | 'preview' | 'confirm';

interface AmazonImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Extends ParsedAmazonItem with import-pipeline metadata
interface PipelineItem extends ParsedAmazonItem {
  _orderHistoryData?: OrderHistoryItem;
  _latticeData?: LatticeItem;
  _isDuplicate?: boolean;
  _duplicateItemId?: string;
  _isVine?: boolean;
}

// ============================================================================
// CONFIDENCE BADGE COMPONENT
// ============================================================================

function ConfidenceBadge({
  confidence,
  details,
}: {
  confidence: 'high' | 'medium' | 'low';
  details: ParsedAmazonItem['confidenceDetails'];
}) {
  const config = {
    high: {
      icon: CheckCircle,
      label: 'High Confidence',
      className: 'bg-success/20 text-success border-success/30',
      description: 'All fields found accurately',
    },
    medium: {
      icon: AlertTriangle,
      label: 'Medium',
      className: 'bg-warning/20 text-warning border-warning/30',
      description: 'Some fields were estimated',
    },
    low: {
      icon: AlertCircle,
      label: 'Low',
      className: 'bg-destructive/20 text-destructive border-destructive/30',
      description: 'Data may be incomplete',
    },
  };

  const { icon: Icon, label, className, description } = config[confidence];

  const detailItems = [
    { label: 'Title', found: details.titleFound },
    { label: 'Price', found: details.priceFound, guessed: details.priceGuessed },
    { label: 'Date', found: details.dateFound, guessed: details.dateGuessed },
    { label: 'ASIN', found: details.asinFound },
  ];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={`${className} cursor-help`}>
            <Icon className="w-3 h-3 mr-1" />
            {label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="font-medium mb-2">{description}</p>
          <ul className="text-xs space-y-1">
            {detailItems.map(({ label, found, guessed }) => (
              <li key={label} className="flex items-center gap-2">
                {found ? (
                  guessed ? (
                    <AlertTriangle className="w-3 h-3 text-warning" />
                  ) : (
                    <CheckCircle className="w-3 h-3 text-success" />
                  )
                ) : (
                  <AlertCircle className="w-3 h-3 text-destructive" />
                )}
                <span>
                  {label}: {found ? (guessed ? 'Estimated' : 'Found') : 'Not found'}
                </span>
              </li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ============================================================================
// DUPLICATE BADGE COMPONENT
// ============================================================================

function DuplicateBadge({ type }: { type: 'asin' | 'title' }) {
  return (
    <Badge variant="outline" className="bg-warning/20 text-warning border-warning/30">
      <ShieldAlert className="w-3 h-3 mr-1" />
      {type === 'asin' ? 'Duplicate ASIN' : 'Similar Title'}
    </Badge>
  );
}

// ============================================================================
// ITEM PREVIEW CARD
// ============================================================================

interface ItemPreviewProps {
  item: PipelineItem;
  index: number;
  isDuplicateAsin: boolean;
  isDuplicateTitle: boolean;
  defaultMarkup: number;
  onToggleSelect: (index: number) => void;
  onUpdatePrice: (index: number, price: number) => void;
}

function ItemPreviewCard({
  item,
  index,
  isDuplicateAsin,
  isDuplicateTitle,
  defaultMarkup,
  onToggleSelect,
  onUpdatePrice,
}: ItemPreviewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editPrice, setEditPrice] = useState(item.price.toString());
  const [imageError, setImageError] = useState(false);

  const targetPrice = item.price * (1 + defaultMarkup / 100);
  const isDuplicateLegacy = isDuplicateAsin || isDuplicateTitle;
  const willMerge = item._isDuplicate;

  const handlePriceSubmit = () => {
    const newPrice = parseFloat(editPrice);
    if (!isNaN(newPrice) && newPrice >= 0) {
      onUpdatePrice(index, newPrice);
    }
    setIsEditing(false);
  };

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-lg transition-all ${
        willMerge
          ? 'bg-amber-500/10 border border-amber-500/30'
          : isDuplicateLegacy
          ? 'bg-warning/10 border border-warning/30'
          : 'bg-muted/50'
      } ${!item.selected ? 'opacity-60' : ''}`}
    >
      <Checkbox
        checked={item.selected}
        onCheckedChange={() => onToggleSelect(index)}
        className="mt-1"
      />

      {/* Image */}
      <div className="w-16 h-16 rounded overflow-hidden bg-muted flex-shrink-0">
        {item.imageUrl && !imageError ? (
          <img
            src={item.imageUrl}
            alt={item.cleanTitle}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="w-6 h-6 text-muted-foreground" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 space-y-1">
        {/* Title */}
        <h4 className="font-medium text-sm line-clamp-2">{item.cleanTitle}</h4>

        {/* Badges row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Source type badge */}
          {item._isVine ? (
            <Badge variant="outline" className="text-xs bg-purple-500/20 text-purple-600 border-purple-500/30">
              <Grape className="w-3 h-3 mr-1" />
              Vine
            </Badge>
          ) : item._orderHistoryData || item._latticeData || item.price === 0 ? null : (
            <Badge variant="outline" className="text-xs bg-muted text-muted-foreground">
              Amazon
            </Badge>
          )}

          {/* Dedup badge */}
          {willMerge ? (
            <Badge variant="outline" className="text-xs bg-amber-500/20 text-amber-600 border-amber-500/30">
              <GitMerge className="w-3 h-3 mr-1" />
              Will merge
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs bg-blue-500/20 text-blue-600 border-blue-500/30">
              New
            </Badge>
          )}

          <ConfidenceBadge confidence={item.confidence} details={item.confidenceDetails} />
          {isDuplicateAsin && <DuplicateBadge type="asin" />}
          {isDuplicateTitle && !isDuplicateAsin && <DuplicateBadge type="title" />}

          {/* Vine Review Status Badge */}
          {item.vineReviewStatus === 'reviewed' && (
            <Badge variant="outline" className="text-xs bg-success/20 text-success border-success/30">
              ✓ Reviewed{item.vineQualityScore ? ` (${item.vineQualityScore})` : ''}
            </Badge>
          )}
          {item.vineReviewStatus === 'not_reviewed' && (
            <Badge variant="outline" className="text-xs bg-warning/20 text-warning border-warning/30">
              Needs Review
            </Badge>
          )}
          {item.asin && (
            <Badge variant="secondary" className="text-xs font-mono">
              {item.asin}
            </Badge>
          )}
        </div>

        {/* Price row */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1">
            Cost:
            {isEditing ? (
              <div className="flex items-center gap-1">
                <span>$</span>
                <Input
                  type="number"
                  step="0.01"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  onBlur={handlePriceSubmit}
                  onKeyDown={(e) => e.key === 'Enter' && handlePriceSubmit()}
                  className="w-20 h-6 text-xs"
                  autoFocus
                />
              </div>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1 hover:text-foreground transition-colors"
              >
                ${item.price.toFixed(2)}
                <Edit2 className="w-3 h-3" />
              </button>
            )}
          </span>
          {item.price > 0 && (
            <>
              <span>→</span>
              <span>Target: ${targetPrice.toFixed(2)}</span>
              <span className="text-success">(+{defaultMarkup}%)</span>
            </>
          )}
        </div>

        {/* Date */}
        <p className="text-xs text-muted-foreground">
          Ordered: {new Date(item.orderDate).toLocaleDateString()}
          {item.confidenceDetails.dateGuessed && (
            <span className="text-warning ml-1">(estimated)</span>
          )}
          {item._orderHistoryData?.shipmentStatus && (
            <span className="ml-1 text-muted-foreground/70">
              · {item._orderHistoryData.shipmentStatus.slice(0, 40)}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// FILE PARSER (XLSX)
// ============================================================================

const parseFile = (file: File): Promise<Record<string, string>[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<Record<string, string>>(
          worksheet,
          { defval: '' }
        );
        resolve(rows);
      } catch {
        reject(new Error('Could not read file. Please upload a valid Excel or CSV file.'));
      }
    };
    reader.onerror = () => reject(new Error('File read failed.'));
    reader.readAsArrayBuffer(file);
  });
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function AmazonImportDialog({ open, onOpenChange }: AmazonImportDialogProps) {
  const { team, user } = useAuth();
  const queryClient = useQueryClient();

  const csvInputRef  = useRef<HTMLInputElement>(null);
  const htmlInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<WizardStep>('paste');
  const [importMethod, setImportMethod] = useState<ImportMethod>('csv');
  const [csvFileError, setCsvFileError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showCsvHelp, setShowCsvHelp] = useState(false);
  const [htmlInput, setHtmlInput] = useState('');
  const [parsedItems, setParsedItems] = useState<PipelineItem[]>([]);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [defaultMarkup, setDefaultMarkup] = useState(50);
  const [isVineMode, setIsVineMode] = useState(false);
  const [vineETV, setVineETV] = useState<string>('');
  const [isFetchingPrices, setIsFetchingPrices] = useState(false);
  const [detectedFormat, setDetectedFormat] = useState<DetectedCSVFormat>('unknown');

  // Fetch existing items for duplicate detection (includes new dedup fields)
  const { data: existingItems = [] } = useQuery({
    queryKey: ['existing-amazon-items', team?.id],
    queryFn: async () => {
      if (!team?.id) return [];
      const { data, error } = await supabase
        .from('items')
        .select('id, title, amazon_asin, amazon_order_id, data_sources, vine_review_status, vine_review_quality, amazon_shipment_status, lattice_review_status')
        .eq('team_id', team.id);
      if (error) throw error;
      return (data || []) as ExistingItemIndex[];
    },
    enabled: !!team?.id && open,
  });

  // Legacy duplicate detection (ASIN / title sets for the existing preview UI)
  const { duplicateAsins, duplicateTitles } = useMemo(() => {
    const asins = new Set(
      existingItems
        .filter((e): e is typeof e & { amazon_asin: string } => !!e.amazon_asin)
        .map(e => e.amazon_asin.toUpperCase())
    );
    const titles = new Set(
      existingItems
        .filter((e): e is typeof e & { title: string } => !!e.title)
        .map(e => e.title.toLowerCase())
    );
    return { duplicateAsins: asins, duplicateTitles: titles };
  }, [existingItems]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setStep('paste');
      setImportMethod('csv');
      setCsvFileError(null);
      setIsDragOver(false);
      setShowCsvHelp(false);
      setHtmlInput('');
      setParsedItems([]);
      setParseWarnings([]);
      setIsVineMode(false);
      setVineETV('');
      setIsFetchingPrices(false);
      setDetectedFormat('unknown');
    }
  }, [open]);

  // ── Dedup helper ─────────────────────────────────────────────────────────

  function applyDedupFlags(items: PipelineItem[]): PipelineItem[] {
    return items.map(item => {
      const match = findDuplicate(
        {
          asin: item.asin,
          orderId: item._orderHistoryData?.orderId ?? null,
          title: item.cleanTitle,
        },
        existingItems
      );
      return {
        ...item,
        _isDuplicate: !!match,
        _duplicateItemId: match?.id,
      };
    });
  }

  // ── Text-based CSV router ─────────────────────────────────────────────────

  function processCsvText(text: string) {
    setCsvFileError(null);
    const detected = detectAndParseCSV(text);

    if (detected.format === 'lattice' && detected.latticeResult) {
      const r = detected.latticeResult;
      if (r.items.length === 0) {
        setCsvFileError('No items found in Lattice CSV.');
        return;
      }
      const converted: PipelineItem[] = r.items.map(lat => ({
        id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        title: lat.description,
        cleanTitle: sanitizeTitle(lat.description),
        orderDate: getAcquisitionDate(lat) || new Date().toISOString(),
        price: lat.valueToUse,
        asin: lat.asin || null,
        imageUrl: null,
        selected: true,
        confidence: lat.asin ? 'high' : 'medium',
        confidenceDetails: {
          titleFound: true,
          priceFound: lat.valueToUse > 0,
          priceGuessed: false,
          dateFound: !!lat.deliveredDate || !!lat.shippedDate || !!lat.orderedDate,
          dateGuessed: !lat.deliveredDate && !lat.shippedDate && !lat.orderedDate,
          asinFound: !!lat.asin,
        },
        vineReviewStatus:
          lat.reviewStatus === 'Approved'
            ? 'reviewed'
            : lat.reviewStatus === 'Not yet reviewed'
            ? 'not_reviewed'
            : null,
        vineQualityScore: mapLatticeQuality(lat.reviewQuality),
        _latticeData: lat,
        _isVine: true,
      }));
      const withDedup = applyDedupFlags(converted);
      setParsedItems(withDedup);
      setParseWarnings(r.parseWarnings);
      setIsVineMode(true);
      setDetectedFormat('lattice');
      setStep('preview');
      toast.success(
        `Lattice CSV: ${r.items.length} items — ${r.alreadyReviewed} reviewed, ${r.pendingReview} pending`
      );

    } else if (detected.format === 'order_history_extension' && detected.orderHistoryResult) {
      const r = detected.orderHistoryResult;
      if (r.items.length === 0) {
        setCsvFileError('No items found in Order History CSV.');
        return;
      }
      const converted: PipelineItem[] = r.items.map(ohItem => ({
        id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        title: ohItem.title,
        cleanTitle: sanitizeTitle(ohItem.title),
        orderDate: ohItem.orderPlaced,
        price: ohItem.isVineOrder ? 0 : ohItem.total,
        asin: null,
        imageUrl: null,
        selected: true,
        confidence: 'high' as const,
        confidenceDetails: {
          titleFound: true,
          priceFound: true,
          priceGuessed: false,
          dateFound: true,
          dateGuessed: false,
          asinFound: false,
        },
        vineReviewStatus: null,
        vineQualityScore: null,
        _orderHistoryData: ohItem,
        _isVine: ohItem.isVineOrder,
      }));
      const withDedup = applyDedupFlags(converted);
      setParsedItems(withDedup);
      setParseWarnings(r.parseWarnings);
      setIsVineMode(false);
      setDetectedFormat('order_history_extension');
      setStep('preview');
      toast.success(
        `Found ${r.items.length} orders — ${r.vineCount} Vine, ${r.regularCount} regular`
      );

    } else if (detected.amazonResult && detected.amazonResult.items.length > 0) {
      const items: PipelineItem[] = detected.amazonResult.items;
      const withDedup = applyDedupFlags(items);
      setParsedItems(withDedup);
      setParseWarnings(detected.amazonResult.parseWarnings);
      setIsVineMode(detected.amazonResult.isVineMode);
      setDetectedFormat('amazon_standard');
      setStep('preview');
      toast.success(`Found ${items.length} item${items.length !== 1 ? 's' : ''}!`);
    } else {
      setCsvFileError(
        detected.warnings[0] ||
          "This doesn't look like a supported CSV format. Expected Amazon Order History, Lattice, or Order History Extension CSV."
      );
      setParseWarnings(detected.warnings);
    }
  }

  // ── XLSX row-based parser (for .xlsx files) ───────────────────────────────

  function processRowsAsCsv(rows: Record<string, string>[]) {
    setCsvFileError(null);
    if (rows.length === 0) {
      setCsvFileError('No items found in the file.');
      return;
    }

    const keys = Object.keys(rows[0]);
    const findCol = (name: string) =>
      keys.find(k => k.toLowerCase().trim() === name.toLowerCase().trim()) ?? null;

    const COL_TITLE      = findCol('title');
    const COL_ORDER_ID   = findCol('order id');
    const COL_ORDER_DATE = findCol('order date');
    const COL_ASIN       = findCol('asin/isbn');
    const COL_QUANTITY   = findCol('quantity');
    const COL_ITEM_TOTAL = findCol('item total');
    const COL_UNIT_PRICE = findCol('purchase price per unit');

    if (!COL_TITLE) {
      setCsvFileError(
        "This doesn't look like an Amazon order history file. " +
          "Make sure you're using the export from Account → Order History Reports."
      );
      return;
    }

    function parsePriceRow(s: string): number {
      if (!s.trim()) return 0;
      const cleaned = s.replace(/[$,\s]/g, '');
      const n = parseFloat(cleaned);
      return isNaN(n) ? 0 : Math.round(n * 100) / 100;
    }

    function parseDateRow(dateStr: string): { date: string; guessed: boolean } {
      if (!dateStr.trim()) return { date: new Date().toISOString(), guessed: true };
      if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) return { date: d.toISOString(), guessed: false };
      }
      if (/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(dateStr)) {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) return { date: d.toISOString(), guessed: false };
      }
      const fallback = new Date(dateStr);
      if (!isNaN(fallback.getTime())) return { date: fallback.toISOString(), guessed: true };
      return { date: new Date().toISOString(), guessed: true };
    }

    const warnings: string[] = [];
    const items: PipelineItem[] = [];
    const seenKeys = new Set<string>();

    for (const row of rows) {
      const g = (col: string | null) => (col ? (row[col] ?? '').trim() : '');
      const title = g(COL_TITLE);
      if (!title || title.length < 3) continue;

      const orderId = g(COL_ORDER_ID);
      const asinRaw = g(COL_ASIN);
      const asin = asinRaw && /^[A-Z0-9]{10}$/i.test(asinRaw) ? asinRaw.toUpperCase() : null;
      const quantity = Math.max(0, parseInt(g(COL_QUANTITY)) || 1);

      let price = parsePriceRow(g(COL_UNIT_PRICE));
      if (price === 0 && COL_ITEM_TOTAL) {
        const itemTotal = parsePriceRow(g(COL_ITEM_TOTAL));
        if (itemTotal > 0) {
          price = quantity > 0 ? Math.round((itemTotal / quantity) * 100) / 100 : itemTotal;
        }
      }

      if (price === 0 && quantity === 0) continue;

      const { date: orderDate, guessed: dateGuessed } = parseDateRow(g(COL_ORDER_DATE));
      const dedupKey = `${orderId}::${asin ?? title.toLowerCase()}`;
      if (seenKeys.has(dedupKey)) continue;
      seenKeys.add(dedupKey);

      const priceFound = price > 0;
      const confidenceDetails = {
        titleFound: true,
        priceFound,
        priceGuessed: false,
        dateFound: !dateGuessed,
        dateGuessed,
        asinFound: !!asin,
      };

      const confidence: 'high' | 'medium' | 'low' =
        priceFound && !dateGuessed ? 'high' : dateGuessed ? 'medium' : 'low';

      const cleanTitle = sanitizeTitle(title);
      const unitCount = Math.min(Math.max(1, quantity), 20);
      for (let u = 0; u < unitCount; u++) {
        items.push({
          id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          title,
          cleanTitle,
          orderDate,
          price,
          asin,
          imageUrl: null,
          selected: true,
          confidence,
          confidenceDetails,
          vineReviewStatus: null,
        });
      }
    }

    if (items.length === 0) {
      setCsvFileError(warnings[0] || 'No items found in the file.');
      setParseWarnings(warnings);
      return;
    }

    const withDedup = applyDedupFlags(items);
    setParsedItems(withDedup);
    setParseWarnings(warnings);
    setIsVineMode(false);
    setDetectedFormat('amazon_standard');
    setStep('preview');
    toast.success(`Found ${items.length} item${items.length !== 1 ? 's' : ''}!`);
  }

  // ── HTML processing ───────────────────────────────────────────────────────

  function processHtmlText(text: string) {
    setIsParsing(true);
    setTimeout(() => {
      try {
        const result = parseAmazonHTML(text);
        if (result.items.length === 0) {
          toast.error('No items found. Make sure this is an Amazon orders page.');
          setParseWarnings(result.parseWarnings);
        } else {
          const items: PipelineItem[] = result.items.map(i => ({
            ...i,
            _isVine: result.isVineMode,
          }));
          const withDedup = applyDedupFlags(items);
          setParsedItems(withDedup);
          setParseWarnings(result.parseWarnings);
          setIsVineMode(result.isVineMode);
          setDetectedFormat(result.isVineMode ? 'amazon_standard' : 'amazon_standard');
          setStep('preview');
          toast.success(
            result.isVineMode
              ? `Found ${result.items.length} Vine items!`
              : `Found ${result.items.length} items!`
          );
        }
      } catch {
        toast.error('Failed to parse HTML. Please try again.');
      } finally {
        setIsParsing(false);
      }
    }, 100);
  }

  // ── File handling ─────────────────────────────────────────────────────────

  async function handleFileSelect(file: File, type: 'csv' | 'html') {
    if (type === 'csv') {
      const isCsvExt = /\.csv$/i.test(file.name) || file.type === 'text/csv';
      if (isCsvExt) {
        // Text-based path — auto-detects format (Lattice, Order History Extension, Amazon)
        const reader = new FileReader();
        reader.onload = (e) => {
          const text = e.target?.result as string;
          processCsvText(text);
        };
        reader.onerror = () => toast.error('Failed to read file');
        reader.readAsText(file);
      } else {
        // XLSX path
        try {
          const rows = await parseFile(file);
          processRowsAsCsv(rows);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Could not read file.';
          setCsvFileError(msg);
          toast.error(msg);
        }
      }
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        processHtmlText(text);
      };
      reader.onerror = () => toast.error('Failed to read file');
      reader.readAsText(file);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>, type: 'csv' | 'html') {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file, type);
    e.target.value = '';
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const isSpreadsheet = /\.(xlsx|xls|csv)$/i.test(file.name) || file.type === 'text/csv';
    const isHtml = file.name.endsWith('.html') || file.name.endsWith('.htm') || file.type === 'text/html';
    if (importMethod === 'csv' && isSpreadsheet) {
      handleFileSelect(file, 'csv');
    } else if (importMethod === 'file' && isHtml) {
      handleFileSelect(file, 'html');
    } else {
      toast.error(importMethod === 'csv' ? 'Please drop a .xlsx or .csv file' : 'Please drop an .html file');
    }
  }

  // ── HTML paste parse ──────────────────────────────────────────────────────

  const handleParse = () => {
    setIsParsing(true);
    setTimeout(() => {
      try {
        const result = parseAmazonHTML(htmlInput);
        if (result.items.length === 0) {
          toast.error('No items found. Make sure you copied the full Amazon orders page HTML.');
          setParseWarnings(result.parseWarnings);
        } else {
          const items: PipelineItem[] = result.items.map(i => ({ ...i, _isVine: result.isVineMode }));
          const withDedup = applyDedupFlags(items);
          setParsedItems(withDedup);
          setParseWarnings(result.parseWarnings);
          setIsVineMode(result.isVineMode);
          setStep('preview');
          if (result.isVineMode) {
            toast.success(`Found ${result.items.length} Vine items!`);
          } else {
            toast.success(`Found ${result.items.length} items!`);
          }
        }
      } catch (error) {
        console.error('Parse error:', error);
        toast.error('Failed to parse HTML. Please try again.');
      } finally {
        setIsParsing(false);
      }
    }, 100);
  };

  // ── Item selection helpers ────────────────────────────────────────────────

  const toggleItemSelection = (index: number) => {
    setParsedItems(items =>
      items.map((item, i) => (i === index ? { ...item, selected: !item.selected } : item))
    );
  };

  const updateItemPrice = (index: number, price: number) => {
    setParsedItems(items =>
      items.map((item, i) => (i === index ? { ...item, price } : item))
    );
  };

  const toggleAll = () => {
    const allSelected = parsedItems.every(item => item.selected);
    setParsedItems(items => items.map(item => ({ ...item, selected: !allSelected })));
  };

  const applyBulkETV = () => {
    const etv = parseFloat(vineETV);
    if (!isNaN(etv) && etv >= 0) {
      setParsedItems(items => items.map(item => ({ ...item, price: etv })));
      toast.success(`Applied $${etv.toFixed(2)} ETV to all items`);
    }
  };

  const fetchRetailPrices = async () => {
    const asins = parsedItems.filter(item => item.asin).map(item => item.asin as string);
    if (asins.length === 0) {
      toast.error('No ASINs found to look up prices');
      return;
    }
    setIsFetchingPrices(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-amazon-prices', {
        body: { asins },
      });
      if (error) {
        toast.error(`Failed to fetch prices: ${error.message}`);
        return;
      }
      if (data?.results) {
        const priceMap = new Map<string, number>();
        for (const result of data.results) {
          if (result.success && result.price !== null) {
            priceMap.set(result.asin, result.price);
          }
        }
        setParsedItems(items =>
          items.map(item =>
            item.asin && priceMap.has(item.asin) ? { ...item, price: priceMap.get(item.asin)! } : item
          )
        );
        const successCount = data.summary?.success || priceMap.size;
        const failedCount = data.summary?.failed || (asins.length - priceMap.size);
        if (successCount > 0) {
          toast.success(
            `Fetched ${successCount} price${successCount !== 1 ? 's' : ''}${failedCount > 0 ? ` (${failedCount} failed)` : ''}`
          );
        } else {
          toast.error('Could not fetch any prices. Amazon may be blocking requests.');
        }
      }
    } catch (err) {
      console.error('[fetchRetailPrices]', err);
      toast.error('Failed to fetch prices.');
    } finally {
      setIsFetchingPrices(false);
    }
  };

  // ── Import mutation with dedup engine ─────────────────────────────────────

  const importItems = useMutation({
    mutationFn: async () => {
      if (!team?.id || !user?.id) throw new Error('Not authenticated');

      const selectedItems = parsedItems.filter(item => item.selected);
      if (selectedItems.length === 0) throw new Error('No items selected');

      // Fetch fresh existing items for authoritative dedup
      const { data: freshExisting, error: fetchErr } = await supabase
        .from('items')
        .select(
          'id, title, amazon_asin, amazon_order_id, data_sources, vine_review_status, vine_review_quality, amazon_shipment_status, lattice_review_status'
        )
        .eq('team_id', team.id);
      if (fetchErr) throw fetchErr;

      const existingIndex = (freshExisting || []) as ExistingItemIndex[];

      const importSource =
        detectedFormat === 'order_history_extension'
          ? 'order_history_extension'
          : detectedFormat === 'lattice'
          ? 'lattice_csv'
          : isVineMode
          ? 'vine_html'
          : 'amazon_csv';

      const toInsert: Record<string, unknown>[] = [];
      const toUpdate: { id: string; mergeData: Record<string, unknown> }[] = [];
      let skipCount = 0;

      for (const item of selectedItems) {
        // Build the core item data based on source type
        let itemData: Record<string, unknown>;

        if (item._orderHistoryData) {
          const oh = item._orderHistoryData;
          itemData = {
            title: item.cleanTitle.slice(0, 255),
            acquisition_date: new Date(oh.orderPlaced).toISOString().split('T')[0],
            original_cost: oh.isVineOrder ? 0 : oh.total,
            acquisition_source: oh.isVineOrder ? 'Amazon Vine' : 'Amazon',
            is_vine_order: oh.isVineOrder,
            amazon_order_id: oh.orderId,
            amazon_order_url: oh.orderDetailsUrl,
            amazon_tracking_url: oh.trackingUrl,
            amazon_invoice_url: oh.invoiceUrl,
            amazon_shipment_status: oh.shipmentStatus || null,
            amazon_return_status: oh.returnStatus,
            amazon_refund_amount: oh.refundAmount,
            amazon_refund_date: oh.refundDate,
            amazon_tax_amount: oh.taxAmount > 0 ? oh.taxAmount : null,
            status: 'acquired' as const,
            condition: 'new' as const,
            physical_status: 'unconfirmed',
            data_sources: [importSource],
          };
        } else if (item._latticeData) {
          const lat = item._latticeData;
          itemData = {
            title: item.cleanTitle.slice(0, 255),
            amazon_asin: lat.asin || null,
            original_cost: lat.valueToUse,
            target_price: Math.round(lat.valueToUse * (1 + defaultMarkup / 100) * 100) / 100,
            acquisition_date: getAcquisitionDate(lat),
            acquisition_source: 'Amazon Vine',
            is_vine_order: true,
            vine_etv: lat.etv > 0 ? lat.etv : null,
            vine_fmv: lat.fmv > 0 ? lat.fmv : null,
            lattice_review_status: lat.reviewStatus || null,
            lattice_review_score: lat.reviewRating,
            lattice_review_quality: lat.reviewQuality || null,
            lattice_reviewed_date: lat.reviewedDate || null,
            status: 'acquired' as const,
            condition: 'new' as const,
            physical_status: 'unconfirmed',
            data_sources: [importSource],
          };
        } else {
          // Standard Amazon HTML / CSV
          let amazonReviewStatus = 'pending';
          if (item.vineReviewStatus === 'reviewed') amazonReviewStatus = 'reviewed_grant';
          itemData = {
            title: item.cleanTitle.slice(0, 255),
            original_cost: item.price,
            target_price: Math.round(item.price * (1 + defaultMarkup / 100) * 100) / 100,
            acquisition_date: new Date(item.orderDate).toISOString().split('T')[0],
            acquisition_source: isVineMode ? 'Vine' : 'Amazon',
            amazon_asin: item.asin || null,
            is_vine_order: isVineMode,
            condition: 'new' as const,
            status: 'acquired' as const,
            physical_status: 'unconfirmed',
            photos: item.imageUrl ? [item.imageUrl] : [],
            amazon_review_status: amazonReviewStatus,
            data_sources: [importSource],
          };
        }

        // Run dedup
        const duplicate = findDuplicate(
          {
            asin: item.asin,
            orderId: item._orderHistoryData?.orderId ?? null,
            title: item.cleanTitle,
          },
          existingIndex
        );

        if (!duplicate) {
          toInsert.push({
            ...itemData,
            team_id: team.id,
            created_by: user.id,
            reviewed_by: [],
          });
        } else {
          const existingExtended = duplicate as ExistingItemIndex & Record<string, unknown>;
          const mergeData = computeMergeData(existingExtended, itemData, importSource);
          if (mergeData) {
            toUpdate.push({ id: duplicate.id, mergeData });
          } else {
            skipCount++;
          }
        }
      }

      // Batch insert new items
      if (toInsert.length > 0) {
        const { error: insertErr } = await supabase.from('items').insert(toInsert);
        if (insertErr) throw insertErr;
      }

      // Update merged items
      for (const { id, mergeData } of toUpdate) {
        const { error: updateErr } = await supabase.from('items').update(mergeData).eq('id', id);
        if (updateErr) throw updateErr;
      }

      return { inserted: toInsert.length, merged: toUpdate.length, skipped: skipCount };
    },
    onSuccess: ({ inserted, merged, skipped }) => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['existing-amazon-items'] });
      const parts = [
        inserted > 0 && `${inserted} new`,
        merged > 0 && `merged data into ${merged}`,
        skipped > 0 && `skipped ${skipped} exact duplicates`,
      ].filter(Boolean);
      toast.success(`Imported: ${parts.join(', ')}`);
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // ── Stats ─────────────────────────────────────────────────────────────────

  const selectedCount = parsedItems.filter(item => item.selected).length;
  const duplicateCount = parsedItems.filter(item =>
    (item.asin && duplicateAsins.has(item.asin)) ||
    duplicateTitles.has(item.cleanTitle.toLowerCase())
  ).length;
  const highConfidenceCount = parsedItems.filter(item => item.confidence === 'high').length;
  const mergeCount = parsedItems.filter(item => item._isDuplicate).length;
  const vineCount = parsedItems.filter(item => item._isVine).length;
  const regularCount = parsedItems.filter(item => !item._isVine && !!item._orderHistoryData).length;

  const stepProgress = step === 'paste' ? 33 : step === 'preview' ? 66 : 100;

  // ── Lattice quality helper ────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            Import from Amazon Orders
          </DialogTitle>
          <DialogDescription>
            {step === 'paste' && importMethod === 'csv' && 'Upload your Amazon order file (.xlsx, .csv) or Lattice/Order History Extension CSV'}
            {step === 'paste' && importMethod === 'file' && 'Upload a saved Amazon orders HTML file'}
            {step === 'paste' && importMethod === 'paste' && 'Paste your Amazon orders page HTML to get started'}
            {step === 'preview' && 'Review and adjust items before importing'}
            {step === 'confirm' && 'Confirm your import'}
          </DialogDescription>
        </DialogHeader>

        {/* Progress bar */}
        <div className="space-y-2">
          <Progress value={stepProgress} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span className={step === 'paste' ? 'text-primary font-medium' : ''}>1. Add Source</span>
            <span className={step === 'preview' ? 'text-primary font-medium' : ''}>2. Preview & Edit</span>
            <span className={step === 'confirm' ? 'text-primary font-medium' : ''}>3. Import</span>
          </div>
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto">
          {step === 'paste' && (
            <div className="space-y-4">
              <input
                ref={csvInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => handleInputChange(e, 'csv')}
              />
              <input
                ref={htmlInputRef}
                type="file"
                accept=".html,.htm,text/html"
                className="hidden"
                onChange={(e) => handleInputChange(e, 'html')}
              />

              {/* CSV Help Dialog */}
              <Dialog open={showCsvHelp} onOpenChange={setShowCsvHelp}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4 text-primary" />
                      How to get your Amazon order history file
                    </DialogTitle>
                  </DialogHeader>
                  <ol className="text-sm text-muted-foreground space-y-3 list-decimal ml-4">
                    <li>Go to <strong className="text-foreground">amazon.com</strong> → Account &amp; Lists → Account</li>
                    <li>Under <em>"Ordering and shopping preferences"</em>, click <strong className="text-foreground">Order History Reports</strong></li>
                    <li>Select report type <strong className="text-foreground">"Items"</strong>, choose your date range, click <strong className="text-foreground">Request Report</strong></li>
                    <li>Wait 1–2 minutes for Amazon to generate the file</li>
                    <li>Click <strong className="text-foreground">Download</strong> next to your report</li>
                    <li>Upload the downloaded <code className="bg-muted px-1 rounded text-xs">.xlsx</code> file here</li>
                  </ol>
                  <Button className="w-full mt-2" onClick={() => setShowCsvHelp(false)}>Got it</Button>
                </DialogContent>
              </Dialog>

              <ImportMethodTabs method={importMethod} onChange={(m) => { setImportMethod(m); setCsvFileError(null); }} />

              {/* ── CSV Upload ── */}
              {importMethod === 'csv' && (
                <div className="space-y-3">
                  <div
                    role="button"
                    tabIndex={0}
                    className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                      isDragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30'
                    }`}
                    onClick={() => csvInputRef.current?.click()}
                    onKeyDown={(e) => e.key === 'Enter' && csvInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={handleDrop}
                  >
                    <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                    <p className="font-medium text-sm">Drop your order file here</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Accepts .xlsx, .csv — auto-detects Amazon, Lattice, or Order History Extension format
                    </p>
                    <button
                      type="button"
                      className="text-xs text-primary underline-offset-2 hover:underline mt-2 block mx-auto"
                      onClick={(e) => { e.stopPropagation(); setShowCsvHelp(true); }}
                    >
                      How to get your order history file →
                    </button>
                  </div>

                  {csvFileError && (
                    <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                      <AlertCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-destructive">{csvFileError}</p>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground text-center">
                    Supports: Amazon Order History (.xlsx), Lattice CSV, Order History Extension CSV
                  </p>
                </div>
              )}

              {/* ── HTML File Upload ── */}
              {importMethod === 'file' && (
                <div className="space-y-3">
                  <Card className="bg-muted/50 border-dashed">
                    <CardContent className="p-4 text-sm text-muted-foreground space-y-1">
                      <p className="font-medium text-foreground">Save your Amazon orders page as an HTML file and upload it here.</p>
                      <p>On your orders page: <strong>File → Save Page As → Webpage, HTML Only → Save</strong></p>
                    </CardContent>
                  </Card>
                  <div
                    role="button"
                    tabIndex={0}
                    className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                      isDragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30'
                    }`}
                    onClick={() => htmlInputRef.current?.click()}
                    onKeyDown={(e) => e.key === 'Enter' && htmlInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={handleDrop}
                  >
                    {isParsing ? (
                      <Loader2 className="w-10 h-10 mx-auto mb-3 text-primary animate-spin" />
                    ) : (
                      <FileUp className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                    )}
                    <p className="font-medium text-sm">
                      {isParsing ? 'Parsing…' : 'Drop your HTML file here'}
                    </p>
                    {!isParsing && <p className="text-xs text-muted-foreground mt-1">or click to browse</p>}
                  </div>
                </div>
              )}

              {/* ── Paste HTML ── */}
              {importMethod === 'paste' && (
                <div className="space-y-4">
                  <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3">
                    <AlertTriangle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      This method may break if Amazon updates their page layout. CSV upload is more reliable.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="html-input">Amazon Orders HTML</Label>
                    <Textarea
                      id="html-input"
                      placeholder="Paste the full HTML source code here..."
                      value={htmlInput}
                      onChange={(e) => setHtmlInput(e.target.value)}
                      rows={10}
                      className="font-mono text-xs"
                    />
                  </div>
                  {parseWarnings.length > 0 && (
                    <div className="bg-warning/10 border border-warning/30 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-warning mb-2">
                        <AlertTriangle className="w-4 h-4" />
                        <span className="font-medium text-sm">Parse Warnings</span>
                      </div>
                      <ul className="text-xs text-muted-foreground space-y-1">
                        {parseWarnings.map((w, i) => <li key={i}>• {w}</li>)}
                      </ul>
                    </div>
                  )}
                  <Button onClick={handleParse} disabled={!htmlInput.trim() || isParsing} className="w-full" size="lg">
                    {isParsing ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Parsing...</>
                    ) : (
                      <><Sparkles className="w-4 h-4 mr-2" />Parse Items</>
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              {/* Summary banner for order history */}
              {detectedFormat === 'order_history_extension' && (vineCount > 0 || regularCount > 0) && (
                <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg text-xs flex-wrap">
                  {vineCount > 0 && (
                    <span className="flex items-center gap-1 text-purple-600">
                      <Grape className="w-3 h-3" />
                      {vineCount} Vine
                    </span>
                  )}
                  {regularCount > 0 && (
                    <span className="text-muted-foreground">{regularCount} regular orders</span>
                  )}
                  {mergeCount > 0 && (
                    <span className="flex items-center gap-1 text-amber-600">
                      <GitMerge className="w-3 h-3" />
                      {mergeCount} will merge with existing items
                    </span>
                  )}
                </div>
              )}

              {/* Lattice summary banner */}
              {detectedFormat === 'lattice' && (
                <div className="flex items-center gap-3 p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg text-xs flex-wrap">
                  <span className="flex items-center gap-1 text-purple-600 font-medium">
                    <Grape className="w-3 h-3" />
                    Lattice CSV
                  </span>
                  <span className="text-muted-foreground">{parsedItems.length} Vine items</span>
                  {mergeCount > 0 && (
                    <span className="flex items-center gap-1 text-amber-600">
                      <GitMerge className="w-3 h-3" />
                      {mergeCount} will merge
                    </span>
                  )}
                </div>
              )}

              {/* Stats bar */}
              <div className="flex items-center justify-between flex-wrap gap-2 p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-4">
                  <Button variant="outline" size="sm" onClick={toggleAll}>
                    {parsedItems.every(item => item.selected) ? 'Deselect All' : 'Select All'}
                  </Button>
                  <Badge variant="secondary">{selectedCount} of {parsedItems.length} selected</Badge>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1">
                    <CheckCircle className="w-3 h-3 text-success" />
                    {highConfidenceCount} high confidence
                  </span>
                  {mergeCount > 0 && (
                    <span className="flex items-center gap-1 text-amber-600">
                      <GitMerge className="w-3 h-3" />
                      {mergeCount} will merge
                    </span>
                  )}
                  {duplicateCount > 0 && (
                    <span className="flex items-center gap-1 text-warning">
                      <ShieldAlert className="w-3 h-3" />
                      {duplicateCount} similar
                    </span>
                  )}
                </div>
              </div>

              {/* Vine Mode Banner */}
              {isVineMode && detectedFormat !== 'lattice' && (
                <div className="space-y-3 p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <Grape className="w-5 h-5 text-purple-500" />
                      <div>
                        <span className="font-medium text-purple-600 dark:text-purple-400">Vine Page Detected</span>
                        <p className="text-xs text-muted-foreground">All items default to $0.00. Fetch retail prices or set ETV manually.</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={fetchRetailPrices}
                      disabled={isFetchingPrices || parsedItems.filter(i => i.asin).length === 0}
                      className="bg-purple-600 hover:bg-purple-700"
                    >
                      {isFetchingPrices ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Fetching...</>
                      ) : (
                        <><DollarSign className="w-4 h-4 mr-2" />Fetch Retail Prices</>
                      )}
                    </Button>
                    <span className="text-xs text-muted-foreground">or</span>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="vine-etv" className="text-xs whitespace-nowrap">Bulk ETV:</Label>
                      <div className="flex items-center gap-1">
                        <span className="text-sm">$</span>
                        <Input
                          id="vine-etv"
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={vineETV}
                          onChange={(e) => setVineETV(e.target.value)}
                          className="w-20 text-sm h-8"
                        />
                      </div>
                      <Button size="sm" variant="outline" onClick={applyBulkETV} disabled={!vineETV}>Apply All</Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Markup setting */}
              <div className="flex items-center gap-4">
                <Label htmlFor="markup" className="text-sm whitespace-nowrap">Default Markup:</Label>
                <div className="flex items-center gap-1">
                  <Input
                    id="markup"
                    type="number"
                    value={defaultMarkup}
                    onChange={(e) => setDefaultMarkup(parseFloat(e.target.value) || 0)}
                    className="w-20 text-sm"
                  />
                  <span className="text-sm">%</span>
                </div>
              </div>

              {/* Items list */}
              <div className="space-y-2 max-h-96 overflow-y-auto border rounded-lg p-4">
                {parsedItems.map((item, index) => (
                  <ItemPreviewCard
                    key={item.id}
                    item={item}
                    index={index}
                    isDuplicateAsin={item.asin ? duplicateAsins.has(item.asin) : false}
                    isDuplicateTitle={duplicateTitles.has(item.cleanTitle.toLowerCase())}
                    defaultMarkup={defaultMarkup}
                    onToggleSelect={toggleItemSelection}
                    onUpdatePrice={updateItemPrice}
                  />
                ))}
              </div>

              {/* Navigation */}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep('paste')} className="flex-1">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <Button
                  onClick={() => importItems.mutate()}
                  disabled={selectedCount === 0 || importItems.isPending}
                  className="flex-1"
                >
                  {importItems.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importing...</>
                  ) : (
                    <>Import {selectedCount} Item{selectedCount !== 1 ? 's' : ''}<ArrowRight className="w-4 h-4 ml-2" /></>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// HELPERS (module-level)
// ============================================================================

function mapLatticeQuality(q: string): 'pending' | 'poor' | 'fair' | 'excellent' | null {
  if (!q) return null;
  const lower = q.toLowerCase();
  if (lower.includes('excellent')) return 'excellent';
  if (lower.includes('fair')) return 'fair';
  if (lower.includes('poor')) return 'poor';
  if (lower.includes('pending')) return 'pending';
  return null;
}

// Suppress unused import warning for PLACEHOLDER_IMAGE
void PLACEHOLDER_IMAGE;
