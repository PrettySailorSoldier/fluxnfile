import { useState, useEffect, useMemo, useRef } from 'react';
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
} from 'lucide-react';
import {
  parseAmazonHTML,
  parseAmazonCSV,
  ParsedAmazonItem,
  PLACEHOLDER_IMAGE
} from '@/utils/amazon-parser';
import { ImportMethodTabs, type ImportMethod } from '@/components/amazon/ImportMethodTabs';

// ============================================================================
// TYPES
// ============================================================================

type WizardStep = 'paste' | 'preview' | 'confirm';

interface AmazonImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ============================================================================
// CONFIDENCE BADGE COMPONENT
// ============================================================================

function ConfidenceBadge({ 
  confidence, 
  details 
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
  item: ParsedAmazonItem;
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
  const isDuplicate = isDuplicateAsin || isDuplicateTitle;

  const handlePriceSubmit = () => {
    const newPrice = parseFloat(editPrice);
    if (!isNaN(newPrice) && newPrice > 0) {
      onUpdatePrice(index, newPrice);
    }
    setIsEditing(false);
  };

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-lg transition-all ${
        isDuplicate 
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
        <div className="flex items-center gap-2 flex-wrap">
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
          <span>→</span>
          <span>Target: ${targetPrice.toFixed(2)}</span>
          <span className="text-success">
            (+{defaultMarkup}%)
          </span>
        </div>
        
        {/* Date */}
        <p className="text-xs text-muted-foreground">
          Ordered: {new Date(item.orderDate).toLocaleDateString()}
          {item.confidenceDetails.dateGuessed && (
            <span className="text-warning ml-1">(estimated)</span>
          )}
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function AmazonImportDialog({ open, onOpenChange }: AmazonImportDialogProps) {
  const { team, user } = useAuth();
  const queryClient = useQueryClient();

  // File input refs
  const csvInputRef  = useRef<HTMLInputElement>(null);
  const htmlInputRef = useRef<HTMLInputElement>(null);

  // Wizard state
  const [step, setStep] = useState<WizardStep>('paste');
  const [importMethod, setImportMethod] = useState<ImportMethod>('csv');
  const [csvFileError, setCsvFileError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showCsvHelp, setShowCsvHelp] = useState(false);
  const [htmlInput, setHtmlInput] = useState('');
  const [parsedItems, setParsedItems] = useState<ParsedAmazonItem[]>([]);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [defaultMarkup, setDefaultMarkup] = useState(50);
  const [isVineMode, setIsVineMode] = useState(false);
  const [vineETV, setVineETV] = useState<string>('');
  const [isFetchingPrices, setIsFetchingPrices] = useState(false);

  // Fetch existing items for duplicate detection
  // Note: amazon_asin column may not exist until migration runs
  const { data: existingItems = [] } = useQuery({
    queryKey: ['existing-amazon-items', team?.id],
    queryFn: async () => {
      if (!team?.id) return [];
      const { data, error } = await supabase
        .from('items')
        .select('id, title, acquisition_date')
        .eq('team_id', team.id)
        .eq('acquisition_source', 'Amazon');
      
      if (error) throw error;
      
      // Cast to include optional amazon_asin
      return (data || []) as Array<{
        id: string;
        title: string | null;
        amazon_asin?: string | null;
        acquisition_date: string;
      }>;
    },
    enabled: !!team?.id && open,
  });

  // Calculate duplicates
  const { duplicateAsins, duplicateTitles } = useMemo(() => {
    const asins = new Set(
      existingItems
        .filter((e): e is typeof e & { amazon_asin: string } => 
          !!e.amazon_asin
        )
        .map(e => e.amazon_asin.toUpperCase())
    );
    const titles = new Set(
      existingItems
        .filter((e): e is typeof e & { title: string } => !!e.title)
        .map(e => e.title.toLowerCase())
    );
    return {
      duplicateAsins: asins,
      duplicateTitles: titles,
    };
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
    }
  }, [open]);

  // ── File handling helpers ──────────────────────────────────────────────────

  function processCsvText(text: string) {
    setCsvFileError(null);
    const result = parseAmazonCSV(text);
    if (result.items.length === 0) {
      setCsvFileError(result.parseWarnings[0] || 'No items found in the CSV file.');
      setParseWarnings(result.parseWarnings);
      return;
    }
    setParsedItems(result.items);
    setParseWarnings(result.parseWarnings);
    setIsVineMode(false);
    setStep('preview');
    toast.success(`Found ${result.items.length} item${result.items.length !== 1 ? 's' : ''}!`);
  }

  function processHtmlText(text: string) {
    setIsParsing(true);
    setTimeout(() => {
      try {
        const result = parseAmazonHTML(text);
        if (result.items.length === 0) {
          toast.error('No items found. Make sure this is an Amazon orders page.');
          setParseWarnings(result.parseWarnings);
        } else {
          setParsedItems(result.items);
          setParseWarnings(result.parseWarnings);
          setIsVineMode(result.isVineMode);
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

  function handleFileSelect(file: File, type: 'csv' | 'html') {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (type === 'csv') {
        processCsvText(text);
      } else {
        processHtmlText(text);
      }
    };
    reader.onerror = () => toast.error('Failed to read file');
    reader.readAsText(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>, type: 'csv' | 'html') {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file, type);
    e.target.value = ''; // reset so same file can be re-selected
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const isCsv = file.name.endsWith('.csv') || file.type === 'text/csv';
    const isHtml = file.name.endsWith('.html') || file.name.endsWith('.htm') || file.type === 'text/html';
    if (importMethod === 'csv' && isCsv) {
      handleFileSelect(file, 'csv');
    } else if (importMethod === 'file' && isHtml) {
      handleFileSelect(file, 'html');
    } else {
      toast.error(importMethod === 'csv' ? 'Please drop a .csv file' : 'Please drop an .html file');
    }
  }

  // Parse HTML (paste method)
  const handleParse = () => {
    setIsParsing(true);
    
    // Use setTimeout to allow UI to update
    setTimeout(() => {
      try {
        const result = parseAmazonHTML(htmlInput);
        
        if (result.items.length === 0) {
          toast.error('No items found. Make sure you copied the full Amazon orders page HTML.');
          setParseWarnings(result.parseWarnings);
        } else {
          setParsedItems(result.items);
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

  // Toggle item selection
  const toggleItemSelection = (index: number) => {
    setParsedItems(items =>
      items.map((item, i) =>
        i === index ? { ...item, selected: !item.selected } : item
      )
    );
  };

  // Update item price
  const updateItemPrice = (index: number, price: number) => {
    setParsedItems(items =>
      items.map((item, i) =>
        i === index ? { ...item, price } : item
      )
    );
  };

  // Toggle all
  const toggleAll = () => {
    const allSelected = parsedItems.every(item => item.selected);
    setParsedItems(items =>
      items.map(item => ({ ...item, selected: !allSelected }))
    );
  };

  // Apply bulk ETV to all Vine items
  const applyBulkETV = () => {
    const etv = parseFloat(vineETV);
    if (!isNaN(etv) && etv >= 0) {
      setParsedItems(items =>
        items.map(item => ({ ...item, price: etv }))
      );
      toast.success(`Applied $${etv.toFixed(2)} ETV to all items`);
    }
  };

  // Fetch retail prices from Amazon via Edge Function
  const fetchRetailPrices = async () => {
    const asins = parsedItems
      .filter(item => item.asin)
      .map(item => item.asin as string);
    
    if (asins.length === 0) {
      toast.error('No ASINs found to look up prices');
      return;
    }
    
    setIsFetchingPrices(true);
    console.log('[fetchRetailPrices] Fetching prices for', asins.length, 'ASINs');
    
    try {
      const { data, error } = await supabase.functions.invoke('fetch-amazon-prices', {
        body: { asins },
      });
      
      if (error) {
        console.error('[fetchRetailPrices] Error:', error);
        toast.error(`Failed to fetch prices: ${error.message}`);
        return;
      }
      
      console.log('[fetchRetailPrices] Response:', data);
      
      if (data?.results) {
        // Create a map of ASIN to price
        const priceMap = new Map<string, number>();
        for (const result of data.results) {
          if (result.success && result.price !== null) {
            priceMap.set(result.asin, result.price);
          }
        }
        
        // Update parsed items with fetched prices
        setParsedItems(items =>
          items.map(item => {
            if (item.asin && priceMap.has(item.asin)) {
              return { ...item, price: priceMap.get(item.asin)! };
            }
            return item;
          })
        );
        
        const successCount = data.summary?.success || priceMap.size;
        const failedCount = data.summary?.failed || (asins.length - priceMap.size);
        
        if (successCount > 0) {
          toast.success(`Fetched ${successCount} price${successCount !== 1 ? 's' : ''}${failedCount > 0 ? ` (${failedCount} failed)` : ''}`);
        } else {
          toast.error('Could not fetch any prices. Amazon may be blocking requests.');
        }
      }
    } catch (err) {
      console.error('[fetchRetailPrices] Exception:', err);
      toast.error('Failed to fetch prices. Check console for details.');
    } finally {
      setIsFetchingPrices(false);
    }
  };

  // Import items mutation
  const importItems = useMutation({
    mutationFn: async () => {
      if (!team?.id || !user?.id) throw new Error('Not authenticated');
      
      const selectedItems = parsedItems.filter(item => item.selected);
      if (selectedItems.length === 0) {
        throw new Error('No items selected');
      }

      const itemsToInsert = selectedItems.map(item => {
        // Map vineReviewStatus to amazon_review_status
        let amazonReviewStatus = 'pending';
        if (item.vineReviewStatus === 'reviewed') {
          // If reviewed with quality score, mark as reviewed_grant
          // (in-app review tracking still applies)
          amazonReviewStatus = 'reviewed_grant';
        } else if (item.vineReviewStatus === 'not_reviewed') {
          amazonReviewStatus = 'pending';
        }
        
        return {
          team_id: team.id,
          created_by: user.id,
          title: item.cleanTitle.slice(0, 255),
          original_cost: item.price,
          target_price: Math.round(item.price * (1 + defaultMarkup / 100) * 100) / 100,
          acquisition_date: new Date(item.orderDate).toISOString().split('T')[0],
          acquisition_source: isVineMode ? 'Vine' : 'Amazon',
          condition: 'new' as const,
          status: 'acquired' as const,
          physical_status: 'unconfirmed',
          confirmed_at: null,
          confirmed_by: null,
          held_by: null,
          photos: item.imageUrl ? [item.imageUrl] : [],
          amazon_review_status: amazonReviewStatus,
          reviewed_by: [] as string[],
        };
      });

      const { error } = await supabase.from('items').insert(itemsToInsert);
      if (error) throw error;

      return selectedItems.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['existing-amazon-items'] });
      toast.success(`Added ${count} items to your Order Sheet`);
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Calculate stats
  const selectedCount = parsedItems.filter(item => item.selected).length;
  const duplicateCount = parsedItems.filter(item => 
    (item.asin && duplicateAsins.has(item.asin)) ||
    duplicateTitles.has(item.cleanTitle.toLowerCase())
  ).length;
  const highConfidenceCount = parsedItems.filter(item => item.confidence === 'high').length;

  // Step progress
  const stepProgress = step === 'paste' ? 33 : step === 'preview' ? 66 : 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            Import from Amazon Orders
          </DialogTitle>
          <DialogDescription>
            {step === 'paste' && importMethod === 'csv'  && 'Upload your Amazon order history CSV to get started'}
            {step === 'paste' && importMethod === 'file' && 'Upload a saved Amazon orders HTML file'}
            {step === 'paste' && importMethod === 'paste' && 'Paste your Amazon orders page HTML to get started'}
            {step === 'preview' && 'Review and adjust items before importing'}
            {step === 'confirm'  && 'Confirm your import'}
          </DialogDescription>
        </DialogHeader>

        {/* Progress bar */}
        <div className="space-y-2">
          <Progress value={stepProgress} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span className={step === 'paste' ? 'text-primary font-medium' : ''}>
              1. Add Source
            </span>
            <span className={step === 'preview' ? 'text-primary font-medium' : ''}>
              2. Preview & Edit
            </span>
            <span className={step === 'confirm' ? 'text-primary font-medium' : ''}>
              3. Import
            </span>
          </div>
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto">
          {step === 'paste' && (
            <div className="space-y-4">
              {/* Hidden file inputs */}
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv,text/csv"
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
                      How to get your Amazon order history CSV
                    </DialogTitle>
                  </DialogHeader>
                  <ol className="text-sm text-muted-foreground space-y-3 list-decimal ml-4">
                    <li>Go to <strong className="text-foreground">amazon.com</strong> → Account &amp; Lists → Account</li>
                    <li>Under <em>"Ordering and shopping preferences"</em>, click <strong className="text-foreground">Order History Reports</strong></li>
                    <li>Select report type <strong className="text-foreground">"Items"</strong>, choose your date range, click <strong className="text-foreground">Request Report</strong></li>
                    <li>Wait 1–2 minutes for Amazon to generate the file</li>
                    <li>Click <strong className="text-foreground">Download</strong> next to your report</li>
                    <li>Upload the downloaded <code className="bg-muted px-1 rounded text-xs">.csv</code> file here</li>
                  </ol>
                  <Button className="w-full mt-2" onClick={() => setShowCsvHelp(false)}>
                    Got it
                  </Button>
                </DialogContent>
              </Dialog>

              {/* Method tabs */}
              <ImportMethodTabs method={importMethod} onChange={(m) => { setImportMethod(m); setCsvFileError(null); }} />

              {/* ── CSV Upload ── */}
              {importMethod === 'csv' && (
                <div className="space-y-3">
                  {/* Drop zone */}
                  <div
                    role="button"
                    tabIndex={0}
                    className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                      isDragOver
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50 hover:bg-muted/30'
                    }`}
                    onClick={() => csvInputRef.current?.click()}
                    onKeyDown={(e) => e.key === 'Enter' && csvInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={handleDrop}
                  >
                    <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                    <p className="font-medium text-sm">Drop your Amazon order CSV here</p>
                    <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
                    <p className="text-xs text-muted-foreground mt-3 max-w-xs mx-auto leading-relaxed">
                      Get your CSV from Amazon: Account → Order History Reports → Select date range → Request Report → Download when ready
                    </p>
                    <button
                      type="button"
                      className="text-xs text-primary underline-offset-2 hover:underline mt-2 block mx-auto"
                      onClick={(e) => { e.stopPropagation(); setShowCsvHelp(true); }}
                    >
                      How to get your order history CSV →
                    </button>
                  </div>

                  {/* CSV file error */}
                  {csvFileError && (
                    <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                      <AlertCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-destructive">{csvFileError}</p>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground text-center">
                    Using the Amazon Order History Reporter browser extension?{' '}
                    Export as CSV and upload here.
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
                      isDragOver
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50 hover:bg-muted/30'
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
                        {parseWarnings.map((w, i) => (
                          <li key={i}>• {w}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <Button
                    onClick={handleParse}
                    disabled={!htmlInput.trim() || isParsing}
                    className="w-full"
                    size="lg"
                  >
                    {isParsing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Parsing...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Parse Items
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              {/* Stats bar */}
              <div className="flex items-center justify-between flex-wrap gap-2 p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-4">
                  <Button variant="outline" size="sm" onClick={toggleAll}>
                    {parsedItems.every(item => item.selected) ? 'Deselect All' : 'Select All'}
                  </Button>
                  <Badge variant="secondary">
                    {selectedCount} of {parsedItems.length} selected
                  </Badge>
                </div>
                
                <div className="flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1">
                    <CheckCircle className="w-3 h-3 text-success" />
                    {highConfidenceCount} high confidence
                  </span>
                    {duplicateCount > 0 && (
                    <span className="flex items-center gap-1 text-warning">
                      <ShieldAlert className="w-3 h-3" />
                      {duplicateCount} potential duplicates
                    </span>
                  )}
                </div>
              </div>

              {/* Vine Mode Banner */}
              {isVineMode && (
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
                  
                  {/* Price Actions Row */}
                  <div className="flex items-center gap-3 flex-wrap">
                    {/* Fetch Retail Prices Button */}
                    <Button
                      size="sm"
                      variant="default"
                      onClick={fetchRetailPrices}
                      disabled={isFetchingPrices || parsedItems.filter(i => i.asin).length === 0}
                      className="bg-purple-600 hover:bg-purple-700"
                    >
                      {isFetchingPrices ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Fetching...
                        </>
                      ) : (
                        <>
                          <DollarSign className="w-4 h-4 mr-2" />
                          Fetch Retail Prices
                        </>
                      )}
                    </Button>
                    
                    <span className="text-xs text-muted-foreground">or</span>
                    
                    {/* Bulk ETV */}
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
                      <Button size="sm" variant="outline" onClick={applyBulkETV} disabled={!vineETV}>
                        Apply All
                      </Button>
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
                <Button
                  variant="outline"
                  onClick={() => setStep('paste')}
                  className="flex-1"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <Button
                  onClick={() => importItems.mutate()}
                  disabled={selectedCount === 0 || importItems.isPending}
                  className="flex-1"
                >
                  {importItems.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      Import {selectedCount} Item{selectedCount !== 1 ? 's' : ''}
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
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
