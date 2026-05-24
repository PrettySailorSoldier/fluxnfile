import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  parseVineReport,
  isVineReport,
  VineReportItem,
} from '@/utils/vine-xlsx-parser';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import {
  FileSpreadsheet,
  Upload,
  CheckCircle2,
} from 'lucide-react';
import { useWorkflowSettings } from '@/hooks/useUserPreferences';

interface VineReportImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VineReportImportDialog({
  open,
  onOpenChange,
}: VineReportImportDialogProps) {
  const { team, user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workflowSettings = useWorkflowSettings();

  const calcTargetPrice = (cost: number): number | null => {
    if (cost <= 0) return null;
    let price = Math.round(cost * (workflowSettings.defaultMarkupPercent / 100) * 100) / 100;
    if (workflowSettings.roundPricesToNinetyNine && price > 1) {
      price = Math.floor(price) - 0.01;
    }
    return price;
  };

  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload');
  const [parsedItems, setParsedItems] = useState<VineReportItem[]>([]);
  const [skippedCancellations, setSkippedCancellations] = useState(0);
  const [skippedFreeItems, setSkippedFreeItems] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });

      if (!isVineReport(workbook)) {
        toast.error(
          "This doesn't look like a Vine Itemized Report. Please download it from your Amazon Vine account."
        );
        return;
      }

      const result = parseVineReport(workbook);

      if (result.items.length === 0) {
        toast.error('No importable items found in the report.');
        return;
      }

      setParsedItems(result.items);
      setSkippedCancellations(result.skippedCancellations);
      setSkippedFreeItems(result.skippedFreeItems);
      setStep('preview');
      toast.success(`Found ${result.items.length} items to import!`);
    } catch (err) {
      toast.error('Failed to read file. Please try again.');
      console.error(err);
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const toggleItem = (index: number) => {
    setParsedItems(items =>
      items.map((item, i) =>
        i === index ? { ...item, selected: !item.selected } : item
      )
    );
  };

  const toggleAll = () => {
    const allSelected = parsedItems.every(i => i.selected);
    setParsedItems(items => items.map(item => ({ ...item, selected: !allSelected })));
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!team?.id || !user?.id) throw new Error('Not authenticated');

      const selected = parsedItems.filter(i => i.selected);
      if (selected.length === 0) throw new Error('No items selected');

      const asins = selected.map(i => i.asin).filter(Boolean);

      // Fetch existing items by ASIN — cast since generated types lag migration
      const { data: existingRows } = await supabase
        .from('items')
        .select('id, amazon_asin, amazon_order_number, original_cost')
        .eq('team_id', team.id)
        .in('amazon_asin', asins) as {
          data: Array<{
            id: string;
            amazon_asin: string | null;
            amazon_order_number: string | null;
            original_cost: number | null;
          }> | null;
        };

      const existingMap = new Map(
        existingRows?.map(e => [e.amazon_asin, e]) ?? []
      );

      const toInsert = selected.filter(item => !existingMap.has(item.asin));
      const toMerge = selected.filter(item => existingMap.has(item.asin));

      // INSERT new items
      if (toInsert.length > 0) {
        const itemsToInsert = toInsert.map(item => ({
          team_id: team.id,
          created_by: user.id,
          title: item.productName.slice(0, 255),
          original_cost: item.estimatedTaxValue,
          target_price: calcTargetPrice(item.estimatedTaxValue),
          amazon_asin: item.asin,
          ...({ amazon_order_number: item.orderNumber } as unknown as object),
          acquisition_date: item.shippedDate,
          acquisition_source: 'Vine',
          condition: 'new' as const,
          status: 'acquired' as const,
          amazon_review_status: 'pending',
          reviewed_by: [] as string[],
          photos: [] as string[],
        }));

        const { error } = await supabase.from('items').insert(itemsToInsert);
        if (error) throw error;
      }

      // MERGE missing fields into existing items — never overwrites good data
      let mergedCount = 0;
      if (toMerge.length > 0) {
        const mergeOps = toMerge
          .map(item => {
            const existing = existingMap.get(item.asin);
            if (!existing) return null;

            const updates: Record<string, unknown> = {};

            if (!existing.amazon_order_number && item.orderNumber) {
              updates.amazon_order_number = item.orderNumber;
            }

            if (
              (!existing.original_cost || existing.original_cost === 0) &&
              item.estimatedTaxValue > 0
            ) {
              updates.original_cost = item.estimatedTaxValue;
              updates.target_price = calcTargetPrice(item.estimatedTaxValue);
            }

            if (Object.keys(updates).length === 0) return null;

            return supabase.from('items').update(updates).eq('id', existing.id);
          })
          .filter((op): op is NonNullable<typeof op> => op !== null);

        if (mergeOps.length > 0) {
          await Promise.all(mergeOps);
          mergedCount = mergeOps.length;
        }
      }

      return { inserted: toInsert.length, merged: mergedCount, skipped: toMerge.length };
    },
    onSuccess: ({ inserted, merged, skipped }) => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      const parts: string[] = [];
      if (inserted > 0) parts.push(`${inserted} new items imported`);
      if (merged > 0) parts.push(`${merged} items updated with order numbers/values`);
      if (skipped > 0 && merged === 0) parts.push(`${skipped} already up to date`);
      toast.success(parts.join(' · ') || 'Import complete!');
      setStep('done');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const selectedCount = parsedItems.filter(i => i.selected).length;
  const totalValue = parsedItems
    .filter(i => i.selected)
    .reduce((sum, i) => sum + i.estimatedTaxValue, 0);

  const handleClose = () => {
    setStep('upload');
    setParsedItems([]);
    setSkippedCancellations(0);
    setSkippedFreeItems(0);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            Import Vine Itemized Report
          </DialogTitle>
          <DialogDescription>
            {step === 'upload' && 'Upload your official Amazon Vine tax report (XLSX)'}
            {step === 'preview' && 'Review items before importing to inventory'}
            {step === 'done' && 'Import complete!'}
          </DialogDescription>
        </DialogHeader>

        <Progress
          value={step === 'upload' ? 33 : step === 'preview' ? 66 : 100}
          className="h-1.5"
        />

        <div className="flex-1 overflow-y-auto">
          {step === 'upload' && (
            <div className="p-4 space-y-4">
              <div
                className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <p className="font-medium text-foreground mb-1">
                  Click to upload Vine Report XLSX
                </p>
                <p className="text-sm text-muted-foreground">
                  Download from Amazon Vine → Tax Information → Download itemized report
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </div>

              {isProcessing && (
                <div className="text-center text-sm text-muted-foreground animate-pulse">
                  Reading file...
                </div>
              )}

              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <p className="text-sm font-medium">How to download your Vine report:</p>
                <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>Go to amazon.com/vine</li>
                  <li>Click "Tax information" in the menu</li>
                  <li>Select the year</li>
                  <li>Click "Download itemized report" → XLSX</li>
                </ol>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-primary">{parsedItems.length}</p>
                  <p className="text-xs text-muted-foreground">Items found</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-destructive/70">
                    {skippedCancellations + skippedFreeItems}
                  </p>
                  <p className="text-xs text-muted-foreground">Skipped</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                    ${totalValue.toFixed(0)}
                  </p>
                  <p className="text-xs text-muted-foreground">Total ETV</p>
                </div>
              </div>

              {(skippedCancellations > 0 || skippedFreeItems > 0) && (
                <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2 space-y-0.5">
                  {skippedCancellations > 0 && (
                    <p>• {skippedCancellations} cancellations skipped</p>
                  )}
                  {skippedFreeItems > 0 && (
                    <p>• {skippedFreeItems} free items ($0 ETV) skipped</p>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between">
                <button
                  onClick={toggleAll}
                  className="text-sm text-primary hover:underline"
                >
                  {parsedItems.every(i => i.selected) ? 'Deselect all' : 'Select all'}
                </button>
                <span className="text-sm text-muted-foreground">
                  {selectedCount} of {parsedItems.length} selected
                </span>
              </div>

              <div className="space-y-2">
                {parsedItems.map((item, index) => (
                  <div
                    key={`${item.orderNumber}-${index}`}
                    className={`flex items-start gap-3 p-3 rounded-lg transition-all ${
                      item.selected ? 'bg-muted/50' : 'bg-muted/20 opacity-60'
                    }`}
                  >
                    <Checkbox
                      checked={item.selected}
                      onCheckedChange={() => toggleItem(index)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-sm font-medium line-clamp-2">
                        {item.productName}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        {item.asin && (
                          <Badge variant="outline" className="text-xs">
                            {item.asin}
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {item.shippedDate}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          #{item.orderNumber}
                        </span>
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-right flex-shrink-0">
                      ${item.estimatedTaxValue.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="p-8 text-center space-y-4">
              <CheckCircle2 className="w-16 h-16 mx-auto text-green-500" />
              <div>
                <p className="text-xl font-bold">Import Complete!</p>
                <p className="text-muted-foreground mt-1">
                  Your Vine inventory is ready. Go scan some boxes!
                </p>
              </div>
              <Button onClick={handleClose} className="w-full">
                Go to Inventory
              </Button>
            </div>
          )}
        </div>

        {step === 'preview' && (
          <div className="border-t border-border p-4 space-y-3">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {selectedCount} items · ${totalValue.toFixed(2)} total ETV
              </span>
              <span>Target price set to 130% of ETV</span>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={handleClose} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={() => importMutation.mutate()}
                disabled={selectedCount === 0 || importMutation.isPending}
                className="flex-1"
              >
                {importMutation.isPending ? 'Importing...' : `Import ${selectedCount} Items`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
