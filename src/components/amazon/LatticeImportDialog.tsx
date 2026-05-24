import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  parseLatticeCSV,
  isLatticeCSV,
  getAcquisitionDate,
  LatticeItem,
} from '@/utils/lattice-csv-parser';
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
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Upload, CheckCircle2, Clock } from 'lucide-react';

interface LatticeImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type FilterMode = 'all' | 'pending' | 'reviewed';

export function LatticeImportDialog({
  open,
  onOpenChange,
}: LatticeImportDialogProps) {
  const { team, user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload');
  const [allItems, setAllItems] = useState<LatticeItem[]>([]);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [search, setSearch] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [importStats, setImportStats] = useState({ alreadyReviewed: 0, pendingReview: 0 });

  const filteredItems = allItems.filter(item => {
    const matchesFilter =
      filterMode === 'all' ||
      (filterMode === 'pending' && item.reviewStatus !== 'Approved') ||
      (filterMode === 'reviewed' && item.reviewStatus === 'Approved');
    const matchesSearch =
      !search ||
      item.description.toLowerCase().includes(search.toLowerCase()) ||
      item.asin.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);

    try {
      const text = await file.text();

      if (!isLatticeCSV(text)) {
        toast.error(
          "This doesn't look like a Lattice export. Export from Lattice using the CSV option."
        );
        return;
      }

      const result = parseLatticeCSV(text);

      if (result.items.length === 0) {
        toast.error('No items found in this CSV.');
        return;
      }

      setAllItems(result.items);
      setImportStats({
        alreadyReviewed: result.alreadyReviewed,
        pendingReview: result.pendingReview,
      });
      setStep('preview');
      toast.success(
        `Found ${result.totalFound} Vine items (${result.alreadyReviewed} reviewed, ${result.pendingReview} pending)`
      );
    } catch (err) {
      toast.error('Failed to read CSV. Please try again.');
      console.error(err);
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const toggleItem = (asin: string) => {
    setAllItems(items =>
      items.map(item => (item.asin === asin ? { ...item, selected: !item.selected } : item))
    );
  };

  const toggleAll = () => {
    const visibleAsins = new Set(filteredItems.map(i => i.asin));
    const allVisibleSelected = filteredItems.every(i => i.selected);
    setAllItems(items =>
      items.map(item =>
        visibleAsins.has(item.asin) ? { ...item, selected: !allVisibleSelected } : item
      )
    );
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!team?.id || !user?.id) throw new Error('Not authenticated');

      const selected = allItems.filter(i => i.selected);
      if (selected.length === 0) throw new Error('No items selected');

      // Fetch existing items by amazon_asin to detect duplicates
      const { data: existing } = await supabase
        .from('items')
        .select('amazon_asin')
        .eq('team_id', team.id)
        .not('amazon_asin', 'is', null);

      const existingAsins = new Set(
        existing?.map(e => e.amazon_asin).filter(Boolean) || []
      );

      const toInsert = selected.filter(item => !existingAsins.has(item.asin));
      const toUpdate = selected.filter(item => existingAsins.has(item.asin));

      if (toInsert.length > 0) {
        const itemsToInsert = toInsert.map(item => ({
          team_id: team.id,
          created_by: user.id,
          title: item.description.slice(0, 255),
          original_cost: item.valueToUse,
          target_price:
            item.valueToUse > 0
              ? Math.round(item.valueToUse * 1.3 * 100) / 100
              : null,
          amazon_asin: item.asin,
          acquisition_date: getAcquisitionDate(item),
          acquisition_source: 'Vine',
          condition: 'new' as const,
          status: 'acquired' as const,
          amazon_review_status:
            item.reviewStatus === 'Approved' ? 'reviewed_grant' : 'pending',
          reviewed_by: [] as string[],
          photos: [] as string[],
        }));

        const { error } = await supabase.from('items').insert(itemsToInsert);
        if (error) throw error;
      }

      if (toUpdate.length > 0) {
        const reviewedItems = toUpdate.filter(
          item => item.reviewStatus === 'Approved'
        );
        await Promise.all(
          reviewedItems.map(item =>
            supabase
              .from('items')
              .update({ amazon_review_status: 'reviewed_grant' })
              .eq('team_id', team.id)
              .eq('amazon_asin', item.asin)
          )
        );
      }

      return { inserted: toInsert.length, updated: toUpdate.length };
    },
    onSuccess: ({ inserted, updated }) => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      const parts: string[] = [];
      if (inserted > 0) parts.push(`${inserted} items imported`);
      if (updated > 0) parts.push(`${updated} review statuses updated`);
      toast.success(parts.join(', ') + '.' || 'Import complete!');
      setStep('done');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const selectedCount = allItems.filter(i => i.selected).length;
  const totalValue = allItems
    .filter(i => i.selected)
    .reduce((sum, i) => sum + i.valueToUse, 0);

  const handleClose = () => {
    setStep('upload');
    setAllItems([]);
    setFilterMode('all');
    setSearch('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-primary" />
            Import from Vine Helper Lattice
          </DialogTitle>
          <DialogDescription>
            {step === 'upload' && 'Upload your Lattice CSV export for complete Vine data'}
            {step === 'preview' && 'Review and select items to import'}
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
                  Click to upload Lattice CSV
                </p>
                <p className="text-sm text-muted-foreground">
                  Export from Lattice → top right menu → Export CSV
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </div>

              {isProcessing && (
                <p className="text-center text-sm text-muted-foreground animate-pulse">
                  Reading CSV...
                </p>
              )}

              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <p className="text-sm font-medium">What gets imported:</p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>✓ Full product title and ASIN</li>
                  <li>✓ ETV/FMV as item value</li>
                  <li>✓ Delivery status and dates</li>
                  <li>✓ Review status (syncs to SalesCheck)</li>
                  <li>✓ Already-reviewed items marked automatically</li>
                </ul>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-primary">{allItems.length}</p>
                  <p className="text-xs text-muted-foreground">Total items</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {importStats.alreadyReviewed}
                  </p>
                  <p className="text-xs text-muted-foreground">Reviewed</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-amber-500">
                    {importStats.pendingReview}
                  </p>
                  <p className="text-xs text-muted-foreground">Need review</p>
                </div>
              </div>

              <div className="flex gap-2">
                {(['all', 'pending', 'reviewed'] as FilterMode[]).map(mode => (
                  <Button
                    key={mode}
                    variant={filterMode === mode ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilterMode(mode)}
                    className="capitalize"
                  >
                    {mode === 'pending' && <Clock className="w-3 h-3 mr-1" />}
                    {mode === 'reviewed' && <CheckCircle2 className="w-3 h-3 mr-1" />}
                    {mode}
                  </Button>
                ))}
              </div>

              <Input
                placeholder="Search by title or ASIN..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-8 text-sm"
              />

              <div className="flex items-center justify-between text-sm">
                <button onClick={toggleAll} className="text-primary hover:underline">
                  {filteredItems.every(i => i.selected) ? 'Deselect visible' : 'Select visible'}
                </button>
                <span className="text-muted-foreground">
                  {selectedCount} of {allItems.length} selected · ${totalValue.toFixed(0)} ETV
                </span>
              </div>

              <div className="space-y-2">
                {filteredItems.map(item => (
                  <div
                    key={item.asin}
                    className={`flex items-start gap-3 p-3 rounded-lg transition-all ${
                      item.selected ? 'bg-muted/50' : 'bg-muted/20 opacity-60'
                    }`}
                  >
                    <Checkbox
                      checked={item.selected}
                      onCheckedChange={() => toggleItem(item.asin)}
                      className="mt-0.5 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-sm font-medium line-clamp-2">
                        {item.description}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs font-mono">
                          {item.asin}
                        </Badge>
                        {item.reviewStatus === 'Approved' ? (
                          <Badge className="text-xs bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30">
                            ✓ Reviewed{item.reviewQuality ? ` · ${item.reviewQuality}` : ''}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-xs text-amber-600 border-amber-500/30"
                          >
                            Needs review
                          </Badge>
                        )}
                        {item.deliveryStatus && (
                          <span className="text-xs text-muted-foreground">
                            {item.deliveryStatus}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-semibold">
                        ${item.valueToUse.toFixed(2)}
                      </p>
                      {item.fmv > 0 && item.fmv !== item.etv && (
                        <p className="text-xs text-muted-foreground">
                          FMV ${item.fmv.toFixed(2)}
                        </p>
                      )}
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
            <p className="text-xs text-muted-foreground text-center">
              Existing items won't be duplicated — review status will be updated for matches
            </p>
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
