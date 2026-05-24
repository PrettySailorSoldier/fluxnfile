import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useItems, useCategories, statusConfig, ItemStatus, Item } from '@/hooks/useInventory';
import { useWorkflowSettings } from '@/hooks/useUserPreferences';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Package,
  Search,
  Filter,
  Loader2,
  CheckSquare,
  X,
  Tag,
  Trash2,
  ShoppingCart,
  ScanLine,
  FileSpreadsheet,
  Upload,
  ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { SwipeableItem } from '@/components/inventory/SwipeableItem';
import { QuickEditSheet } from '@/components/inventory/QuickEditSheet';
import { MarketplaceExport } from '@/components/fb/MarketplaceExport';
import { AmazonImportDialog } from '@/components/amazon/AmazonImportDialog';
import { ReviewStatusBadge } from '@/components/amazon/ReviewStatusBadge';
import { BarcodeScannerModal } from '@/components/inventory/BarcodeScannerModal';
import { VineReportImportDialog } from '@/components/amazon/VineReportImportDialog';
import { LatticeImportDialog } from '@/components/amazon/LatticeImportDialog';

type SortOption =
  | 'newest'
  | 'oldest'
  | 'value_high'
  | 'value_low'
  | 'review_urgent'
  | 'title_az';

type DeliveryFilter = 'all' | 'delivered' | 'arriving' | 'not_shipped';

export default function Inventory() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const { data: items = [], isLoading } = useItems();
  const { data: categories = [] } = useCategories();
  const workflowSettings = useWorkflowSettings();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get('status') || 'all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [reviewFilter, setReviewFilter] = useState<string>('all');
  const [deliveryFilter, setDeliveryFilter] = useState<DeliveryFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>(workflowSettings.defaultSortOrder);
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [showAmazonImport, setShowAmazonImport] = useState(false);
  const [showVineReport, setShowVineReport] = useState(false);
  const [showLattice, setShowLattice] = useState(false);
  const [quickEditItem, setQuickEditItem] = useState<Item | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [scanHighlightId, setScanHighlightId] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    let result = items.filter((item) => {
      const matchesSearch =
        !search ||
        item.title?.toLowerCase().includes(search.toLowerCase()) ||
        item.category?.name?.toLowerCase().includes(search.toLowerCase()) ||
        item.acquisition_source?.toLowerCase().includes(search.toLowerCase());

      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
      const matchesCategory = categoryFilter === 'all' || item.category_id === categoryFilter;

      let matchesReview = true;
      if (reviewFilter !== 'all') {
        const amazonStatus = (item as any).amazon_review_status;
        if (reviewFilter === 'pending') {
          matchesReview = amazonStatus === 'pending';
        } else if (reviewFilter === 'reviewed') {
          matchesReview =
            amazonStatus === 'reviewed_grant' || amazonStatus === 'reviewed_crybaby';
        } else if (reviewFilter === 'reviewed_both') {
          matchesReview = amazonStatus === 'reviewed_both';
        }
      }

      let matchesDate = true;
      if (dateFrom || dateTo) {
        const itemDate = item.acquisition_date
          ? new Date(item.acquisition_date).getTime()
          : null;
        if (itemDate === null) {
          matchesDate = false;
        } else {
          if (dateFrom) {
            matchesDate = matchesDate && itemDate >= new Date(dateFrom).getTime();
          }
          if (dateTo) {
            const toEnd = new Date(dateTo);
            toEnd.setHours(23, 59, 59, 999);
            matchesDate = matchesDate && itemDate <= toEnd.getTime();
          }
        }
      }

      let matchesDelivery = true;
      if (deliveryFilter !== 'all') {
        const ds = ((item as any).delivery_status || '').toLowerCase();
        if (deliveryFilter === 'delivered') {
          matchesDelivery = ds.includes('delivered');
        } else if (deliveryFilter === 'arriving') {
          matchesDelivery = ds.includes('arriving');
        } else if (deliveryFilter === 'not_shipped') {
          matchesDelivery = !ds || ds.trim() === '';
        }
      }

      return matchesSearch && matchesStatus && matchesCategory && matchesReview && matchesDate && matchesDelivery;
    });

    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case 'oldest':
          return (
            new Date(a.acquisition_date || a.created_at).getTime() -
            new Date(b.acquisition_date || b.created_at).getTime()
          );
        case 'value_high':
          return (b.original_cost || 0) - (a.original_cost || 0);
        case 'value_low':
          return (a.original_cost || 0) - (b.original_cost || 0);
        case 'review_urgent': {
          const aStatus = (a as any).amazon_review_status;
          const bStatus = (b as any).amazon_review_status;
          const aPending = aStatus === 'pending' ? 0 : 1;
          const bPending = bStatus === 'pending' ? 0 : 1;
          if (aPending !== bPending) return aPending - bPending;
          return (
            new Date(a.acquisition_date || a.created_at).getTime() -
            new Date(b.acquisition_date || b.created_at).getTime()
          );
        }
        case 'title_az':
          return (a.title || '').localeCompare(b.title || '');
        case 'newest':
        default:
          return (
            new Date(b.acquisition_date || b.created_at).getTime() -
            new Date(a.acquisition_date || a.created_at).getTime()
          );
      }
    });

    return result;
  }, [items, search, statusFilter, categoryFilter, reviewFilter, dateFrom, dateTo, deliveryFilter, sortBy]);

  // Status counts for filter badges
  const statusCounts = items.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const activeFilterCount = [
    statusFilter !== 'all',
    categoryFilter !== 'all',
    reviewFilter !== 'all',
    deliveryFilter !== 'all',
    !!dateFrom,
    !!dateTo,
    sortBy !== 'newest',
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setStatusFilter('all');
    setCategoryFilter('all');
    setReviewFilter('all');
    setDeliveryFilter('all');
    setDateFrom('');
    setDateTo('');
    setSortBy('newest');
  };

  // Mutations
  const updateItemStatus = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: ItemStatus }) => {
      const updates = ids.map(id =>
        supabase.from('items').update({
          status,
          sale_date: status === 'sold' || status === 'shipped' ? new Date().toISOString().split('T')[0] : null,
        }).eq('id', id)
      );
      await Promise.all(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      toast.success('Items updated!');
      setSelectedItems(new Set());
      setIsSelecting(false);
    },
    onError: () => {
      toast.error('Failed to update items');
    },
  });

  const deleteItems = useMutation({
    mutationFn: async (ids: string[]) => {
      const deletes = ids.map(id => supabase.from('items').delete().eq('id', id));
      await Promise.all(deletes);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      toast.success('Items deleted');
      setSelectedItems(new Set());
      setIsSelecting(false);
      setShowDeleteConfirm(false);
      setItemToDelete(null);
    },
    onError: () => {
      toast.error('Failed to delete items');
    },
  });

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedItems(newSelected);
  };

  const selectAll = () => {
    if (selectedItems.size === filteredItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(filteredItems.map(i => i.id)));
    }
  };

  const handleBulkMarkListed = () => {
    updateItemStatus.mutate({ ids: Array.from(selectedItems), status: 'listed' });
  };

  const handleBulkDelete = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    if (itemToDelete) {
      deleteItems.mutate([itemToDelete]);
    } else if (selectedItems.size > 0) {
      deleteItems.mutate(Array.from(selectedItems));
    }
  };

  const handleScanMatch = (item: Item) => {
    setScanHighlightId(item.id);
    setQuickEditItem(item);
    setTimeout(() => setScanHighlightId(null), 4000);
  };

  const handleScanNoMatch = (asin: string) => {
    navigate(`/add?asin=${asin}&acquisition_source=Vine`);
  };

  if (isLoading) {
    return (
      <div className="p-4 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-2xl font-bold text-foreground">Inventory</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowScanner(true)}
          >
            <ScanLine className="w-4 h-4 mr-1" />
            Scan
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Upload className="w-4 h-4 mr-1" />
                Import
                <ChevronDown className="w-3 h-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Import Source
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowLattice(true)}>
                <Upload className="w-4 h-4 mr-2" />
                Lattice CSV
                <span className="ml-auto text-xs text-primary font-medium">
                  Best
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowVineReport(true)}>
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Vine Report XLSX
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowAmazonImport(true)}>
                <ShoppingCart className="w-4 h-4 mr-2" />
                Amazon HTML
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {items.length > 0 && <MarketplaceExport items={items} />}

          <Button
            variant={isSelecting ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setIsSelecting(!isSelecting);
              setSelectedItems(new Set());
            }}
          >
            {isSelecting ? (
              <>
                <X className="w-4 h-4 mr-1" />
                Cancel
              </>
            ) : (
              <>
                <CheckSquare className="w-4 h-4 mr-1" />
                Select
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Selection Controls */}
      {isSelecting && (
        <div className="flex flex-wrap items-center gap-2 p-3 bg-muted rounded-lg">
          <span className="text-sm font-medium">
            {selectedItems.size} of {filteredItems.length} selected
          </span>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSelectedItems(new Set(filteredItems.map(i => i.id)))}
            disabled={selectedItems.size === filteredItems.length}
          >
            Select All
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSelectedItems(new Set())}
            disabled={selectedItems.size === 0}
          >
            Deselect All
          </Button>
        </div>
      )}

      {/* Bulk Actions */}
      {isSelecting && selectedItems.size > 0 && (
        <div className="flex items-center gap-2 p-3 bg-primary/10 rounded-lg border border-primary/20">
          <Button size="sm" onClick={handleBulkMarkListed}>
            <Tag className="w-4 h-4 mr-1" />
            Mark Listed
          </Button>
          <Button size="sm" variant="destructive" onClick={handleBulkDelete}>
            <Trash2 className="w-4 h-4 mr-1" />
            Delete
          </Button>
        </div>
      )}

      {/* Search and Filters */}
      <div className="space-y-2">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Filter toggle row */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="flex-1 justify-between"
          >
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4" />
              <span>Filters & Sort</span>
              {activeFilterCount > 0 && (
                <span className="bg-primary text-primary-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center font-medium">
                  {activeFilterCount}
                </span>
              )}
            </div>
            <ChevronDown
              className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`}
            />
          </Button>

          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllFilters}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* Collapsible filter panel */}
        {showFilters && (
          <div className="space-y-3 p-3 bg-muted/30 rounded-xl border border-border">
            {/* Sort */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Sort
              </p>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest first</SelectItem>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                  <SelectItem value="value_high">Highest value first</SelectItem>
                  <SelectItem value="value_low">Lowest value first</SelectItem>
                  <SelectItem value="review_urgent">🔴 Review urgency</SelectItem>
                  <SelectItem value="title_az">A → Z</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Status + Category */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Status
                </p>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All ({items.length})</SelectItem>
                    {(Object.keys(statusConfig) as ItemStatus[]).map((status) => (
                      <SelectItem key={status} value={status}>
                        {statusConfig[status].label}
                        {statusCounts[status] ? ` (${statusCounts[status]})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Category
                </p>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Review + Delivery */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Review
                </p>
                <Select value={reviewFilter} onValueChange={setReviewFilter}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="pending">Needs review</SelectItem>
                    <SelectItem value="reviewed">Reviewed (partial)</SelectItem>
                    <SelectItem value="reviewed_both">Both reviewed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Delivery
                </p>
                <Select
                  value={deliveryFilter}
                  onValueChange={(v) => setDeliveryFilter(v as DeliveryFilter)}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="delivered">✅ Delivered</SelectItem>
                    <SelectItem value="arriving">🚚 Arriving soon</SelectItem>
                    <SelectItem value="not_shipped">📦 Not shipped yet</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Date range */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Date Range (Acquired)
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">From</label>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">To</label>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Swipe hint */}
      {workflowSettings.showSwipeHint && !isSelecting && filteredItems.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          Swipe items left or right for quick actions
        </p>
      )}

      {/* Items List */}
      {filteredItems.length === 0 ? (
        <Card className="bg-secondary/30 border-dashed">
          <CardContent className="py-12 text-center">
            <Package className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-semibold text-foreground mb-1">
              {items.length === 0 ? 'No items yet' : 'No matching items'}
            </h3>
            <p className="text-sm text-muted-foreground">
              {items.length === 0
                ? 'Add your first item to get started'
                : 'Try adjusting your search or filters'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => (
            <SwipeableItem
              key={item.id}
              item={item}
              isSelecting={isSelecting}
              isSelected={selectedItems.has(item.id)}
              isHighlighted={item.id === scanHighlightId}
              onSelect={toggleSelect}
              onClick={() => navigate(`/item/${item.id}`)}
              onTap={() => setQuickEditItem(item)}
              onMarkListed={() => updateItemStatus.mutate({ ids: [item.id], status: 'listed' })}
              onMarkSold={() => updateItemStatus.mutate({ ids: [item.id], status: 'sold' })}
              onDelete={() => {
                setItemToDelete(item.id);
                setShowDeleteConfirm(true);
              }}
            />
          ))}
        </div>
      )}

      {/* Delete Confirmation */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            {itemToDelete
              ? 'Are you sure you want to delete this item? This action cannot be undone.'
              : `Are you sure you want to delete ${selectedItems.size} items? This action cannot be undone.`}
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteConfirm(false);
                setItemToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteItems.isPending}
            >
              {deleteItems.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AmazonImportDialog open={showAmazonImport} onOpenChange={setShowAmazonImport} />

      <QuickEditSheet
        item={quickEditItem}
        open={!!quickEditItem}
        onClose={() => setQuickEditItem(null)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['items'] });
          setQuickEditItem(null);
        }}
      />

      <VineReportImportDialog open={showVineReport} onOpenChange={setShowVineReport} />

      <LatticeImportDialog open={showLattice} onOpenChange={setShowLattice} />

      <BarcodeScannerModal
        open={showScanner}
        items={items}
        onMatchFound={handleScanMatch}
        onNoMatch={handleScanNoMatch}
        onClose={() => setShowScanner(false)}
      />
    </div>
  );
}
