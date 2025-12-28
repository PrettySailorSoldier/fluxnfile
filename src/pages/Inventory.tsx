import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useItems, useCategories, statusConfig, ItemStatus } from '@/hooks/useInventory';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Package, Search, Filter, Loader2, CheckSquare, X, Tag, Trash2, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { SwipeableItem } from '@/components/inventory/SwipeableItem';
import { MarketplaceExport } from '@/components/fb/MarketplaceExport';

export default function Inventory() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const { data: items = [], isLoading } = useItems();
  const { data: categories = [] } = useCategories();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get('status') || 'all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  const filteredItems = items.filter((item) => {
    const matchesSearch = !search ||
      item.title?.toLowerCase().includes(search.toLowerCase()) ||
      item.category?.name?.toLowerCase().includes(search.toLowerCase()) ||
      item.acquisition_source?.toLowerCase().includes(search.toLowerCase());

    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchesCategory = categoryFilter === 'all' || item.category_id === categoryFilter;

    return matchesSearch && matchesStatus && matchesCategory;
  });

  // Status counts for filter badges
  const statusCounts = items.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Mutations
  const updateItemStatus = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: ItemStatus }) => {
      const updates = ids.map(id =>
        supabase.from('items').update({
          status,
          sale_date: status === 'sold' || status === 'shipped' ? new Date().toISOString().split('T')[0] : null
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

  if (isLoading) {
    return (
      <div className="p-4 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 pb-24">
      {/* Header with bulk select toggle */}
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-2xl font-bold text-foreground">Inventory</h1>
        <div className="flex gap-2">
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

      {/* Bulk Actions Bar */}
      {isSelecting && selectedItems.size > 0 && (
        <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
          <span className="text-sm font-medium flex-1">
            {selectedItems.size} selected
          </span>
          <Button size="sm" variant="outline" onClick={selectAll}>
            {selectedItems.size === filteredItems.length ? 'Deselect All' : 'Select All'}
          </Button>
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
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="flex-1">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status ({items.length})</SelectItem>
              {(Object.keys(statusConfig) as ItemStatus[]).map((status) => (
                <SelectItem key={status} value={status}>
                  {statusConfig[status].label} ({statusCounts[status] || 0})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Swipe hint */}
      {!isSelecting && filteredItems.length > 0 && (
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
              onSelect={toggleSelect}
              onClick={() => navigate(`/item/${item.id}`)}
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

      {/* Delete Confirmation Dialog */}
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
            <Button variant="outline" onClick={() => {
              setShowDeleteConfirm(false);
              setItemToDelete(null);
            }}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleteItems.isPending}>
              {deleteItems.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
