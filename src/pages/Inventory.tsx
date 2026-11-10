import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { TablesUpdate } from '@/integrations/supabase/types';
import { useAuth } from '@/contexts/AuthContext';
import {
  useItems,
  useCategories,
  useStorageLocations,
  statusConfig,
  calculateProfit,
  needsDetails,
  ItemStatus,
  Item,
} from '@/hooks/useInventory';
import { useWorkflowSettings } from '@/hooks/useUserPreferences';
import { parseQuery, matchItem } from '@/lib/itemSearch';
import { daysSince, parseLocalDate, todayLocal } from '@/lib/dates';
import { findBin } from '@/lib/binLabel';
import { notifyUsers, useTeamMembers } from '@/hooks/useTeam';
import { useEvents } from '@/hooks/useMarket';
import { RecordSaleDialog } from '@/components/sales/RecordSaleDialog';
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
  ClipboardEdit,
  ListChecks,
  Sparkles,
  Table2,
  ChevronRight,
  DollarSign,
} from 'lucide-react';
import { toast } from 'sonner';
import { SwipeableItem } from '@/components/inventory/SwipeableItem';
import { QuickEditSheet } from '@/components/inventory/QuickEditSheet';
import { MarketplaceExport } from '@/components/fb/MarketplaceExport';
import { AmazonImportDialog } from '@/components/amazon/AmazonImportDialog';
import { ReviewStatusBadge } from '@/components/amazon/ReviewStatusBadge';
import { BulkEditDialog, type BulkEdit } from '@/components/inventory/BulkEditDialog';
import { ListImportDialog } from '@/components/inventory/ListImportDialog';
import { AssignTaskDialog } from '@/components/tasks/AssignTaskDialog';
import { VineReportImportDialog } from '@/components/amazon/VineReportImportDialog';
import { LatticeImportDialog } from '@/components/amazon/LatticeImportDialog';

type SortOption =
  | 'newest'
  | 'oldest'
  | 'value_high'
  | 'value_low'
  | 'review_urgent'
  | 'title_az'
  | 'profit_high'
  | 'margin_high'
  | 'price_high'
  | 'aging'
  | 'location';

type DeliveryFilter = 'all' | 'delivered' | 'arriving' | 'not_shipped';

/** One-tap views over the inventory — the questions the team asks most. */
type ViewKey = 'all' | 'in_stock' | 'needs_price' | 'ready' | 'listed' | 'packed' | 'flagged' | 'stale' | 'sold';
type GroupBy = 'none' | 'location' | 'category' | 'status';

const VIEW_LABELS: Record<ViewKey, string> = {
  all: 'Everything',
  in_stock: 'In stock',
  needs_price: 'Needs price',
  ready: 'Ready to list',
  listed: 'Listed',
  packed: 'Packed for market',
  flagged: 'Flagged for me',
  stale: 'Stale listings',
  sold: 'Sold',
};
const VIEW_ORDER: ViewKey[] = ['all', 'in_stock', 'needs_price', 'ready', 'listed', 'packed', 'flagged', 'stale', 'sold'];

const isSold = (i: Item) => i.status === 'sold' || i.status === 'shipped';
const listedDays = (i: Item) => daysSince(i.listed_at ?? i.fb_listed_date ?? i.created_at) ?? 0;
const PAGE = 60;

export default function Inventory() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, team, profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: items = [], isLoading } = useItems();
  const { data: categories = [] } = useCategories();
  const { data: storageLocations = [] } = useStorageLocations();
  const { data: events = [] } = useEvents();
  const workflowSettings = useWorkflowSettings();
  const defaultSort = workflowSettings.defaultSortOrder as SortOption;

  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get('status') || 'all');
  const [categoryFilter, setCategoryFilter] = useState<string>(searchParams.get('cat') || 'all');
  const [locationFilter, setLocationFilter] = useState<string>(searchParams.get('loc') || 'all');
  const [view, setView] = useState<ViewKey>(
    VIEW_ORDER.includes(searchParams.get('show') as ViewKey) ? (searchParams.get('show') as ViewKey) : 'all'
  );
  const [groupBy, setGroupBy] = useState<GroupBy>((searchParams.get('group') as GroupBy) || 'none');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = useState(PAGE);
  const [saleItems, setSaleItems] = useState<Item[] | null>(null);
  const [decisionFilter, setDecisionFilter] = useState<string>('all');
  const [needsDetailsOnly, setNeedsDetailsOnly] = useState(searchParams.get('view') === 'needs-details');
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [showListImport, setShowListImport] = useState(searchParams.get('import') === 'list');
  const [showAssignTask, setShowAssignTask] = useState(false);
  const [reviewFilter, setReviewFilter] = useState<string>('all');
  const [deliveryFilter, setDeliveryFilter] = useState<DeliveryFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>((searchParams.get('sort') as SortOption) || defaultSort);
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
  const [sourceFilter, setSourceFilter] = useState<string>(searchParams.get('src') || 'all');
  const [holderFilter, setHolderFilter] = useState<string>(searchParams.get('holder') || 'all');
  const [eventFilter, setEventFilter] = useState<string>(searchParams.get('event') || 'all');
  const [flagFilter, setFlagFilter] = useState<string>(searchParams.get('flag') || 'all');
  const { data: members = [] } = useTeamMembers();

  const sources = useMemo(
    () => [...new Set(items.map((i) => i.acquisition_source?.trim()).filter((s): s is string => !!s))].sort(),
    [items]
  );

  // A scanned or typed bin label ("BIN-1A2B3C4D") shows what's in that bin
  useEffect(() => {
    const bin = findBin(search, storageLocations);
    if (!bin) return;
    setLocationFilter(bin.id);
    setSearch('');
    toast.success(`Showing ${bin.name}`);
  }, [search, storageLocations]);

  const needsDetailsCount = useMemo(() => items.filter(needsDetails).length, [items]);

  const staleDays = workflowSettings.staleDaysThreshold;
  const inView = useMemo(() => {
    const tests: Record<ViewKey, (i: Item) => boolean> = {
      all: () => true,
      in_stock: (i) => !isSold(i),
      needs_price: (i) => !isSold(i) && i.target_price == null,
      ready: (i) => i.status === 'ready_to_list',
      listed: (i) => i.status === 'listed',
      packed: (i) => !isSold(i) && !!i.packed_for_event_id,
      flagged: (i) => !!i.flagged_for && i.flagged_for === user?.id,
      stale: (i) => i.status === 'listed' && listedDays(i) >= staleDays,
      sold: isSold,
    };
    return tests;
  }, [user?.id, staleDays]);

  const viewCounts = useMemo(() => {
    const counts = {} as Record<ViewKey, number>;
    for (const v of VIEW_ORDER) counts[v] = 0;
    for (const item of items) for (const v of VIEW_ORDER) if (inView[v](item)) counts[v]++;
    return counts;
  }, [items, inView]);

  // Keep the view in the address bar: Back from an item returns to the same list,
  // and a partner can be sent a link to exactly what you're looking at.
  useEffect(() => {
    const next = new URLSearchParams();
    if (search) next.set('q', search);
    if (statusFilter !== 'all') next.set('status', statusFilter);
    if (categoryFilter !== 'all') next.set('cat', categoryFilter);
    if (locationFilter !== 'all') next.set('loc', locationFilter);
    if (view !== 'all') next.set('show', view);
    if (groupBy !== 'none') next.set('group', groupBy);
    if (sortBy !== defaultSort) next.set('sort', sortBy);
    if (needsDetailsOnly) next.set('view', 'needs-details');
    if (sourceFilter !== 'all') next.set('src', sourceFilter);
    if (holderFilter !== 'all') next.set('holder', holderFilter);
    if (eventFilter !== 'all') next.set('event', eventFilter);
    if (flagFilter !== 'all') next.set('flag', flagFilter);
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
    // searchParams is read, not watched — this effect is what writes it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, categoryFilter, locationFilter, view, groupBy, sortBy, needsDetailsOnly, defaultSort, sourceFilter, holderFilter, eventFilter, flagFilter]);

  const filteredItems = useMemo(() => {
    const terms = parseQuery(search);
    const scores = new Map<string, number>();
    // A shelf holds what's on it: looking by location leaves out what has already sold
    const byPlace = groupBy === 'location' || locationFilter !== 'all';
    const wantsSold = view === 'sold' || statusFilter === 'sold' || statusFilter === 'shipped';
    let result = items.filter((item) => {
      const hit = terms.length === 0 ? null : matchItem(item, terms);
      const matchesSearch = terms.length === 0 || hit !== null;
      if (hit) scores.set(item.id, hit.score);

      if (!inView[view](item)) return false;
      if (byPlace && !wantsSold && isSold(item)) return false;

      if (needsDetailsOnly && !needsDetails(item)) return false;
      if (locationFilter !== 'all') {
        if (locationFilter === 'none' ? item.storage_location_id : item.storage_location_id !== locationFilter) return false;
      }
      if (decisionFilter !== 'all' && item.physical_status !== decisionFilter) return false;
      if (sourceFilter !== 'all' && (item.acquisition_source?.trim() || '') !== sourceFilter) return false;
      if (holderFilter !== 'all' && (holderFilter === 'none' ? !!item.held_by : item.held_by !== holderFilter)) return false;
      if (eventFilter !== 'all' && (eventFilter === 'none' ? !!item.packed_for_event_id : item.packed_for_event_id !== eventFilter)) return false;
      if (flagFilter !== 'all' && (flagFilter === 'any' ? !item.flagged_for : item.flagged_for !== flagFilter)) return false;

      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
      const matchesCategory = categoryFilter === 'all' || item.category_id === categoryFilter;

      let matchesReview = true;
      if (reviewFilter !== 'all') {
        const amazonStatus = item.amazon_review_status;
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
        // All three are plain calendar days: compare them as local days
        const itemDate = parseLocalDate(item.acquisition_date)?.getTime() ?? null;
        if (itemDate === null) {
          matchesDate = false;
        } else {
          if (dateFrom) {
            matchesDate = matchesDate && itemDate >= (parseLocalDate(dateFrom)?.getTime() ?? 0);
          }
          if (dateTo) {
            const toEnd = parseLocalDate(dateTo) ?? new Date(dateTo);
            toEnd.setHours(23, 59, 59, 999);
            matchesDate = matchesDate && itemDate <= toEnd.getTime();
          }
        }
      }

      let matchesDelivery = true;
      if (deliveryFilter !== 'all') {
        const ds = (item.delivery_status || '').toLowerCase();
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

    // While searching, the best match comes first — unless a sort was picked on purpose
    const byRelevance = terms.length > 0 && sortBy === defaultSort;
    result = [...result].sort((a, b) => {
      if (byRelevance) return (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0);
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
          const aStatus = a.amazon_review_status;
          const bStatus = b.amazon_review_status;
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
        case 'profit_high':
          return calculateProfit(b).netProfit - calculateProfit(a).netProfit;
        case 'margin_high':
          return calculateProfit(b).margin - calculateProfit(a).margin;
        case 'price_high':
          return (b.actual_price ?? b.target_price ?? 0) - (a.actual_price ?? a.target_price ?? 0);
        case 'aging': {
          // Oldest unsold stock first; sold/shipped sink to the bottom
          const aSold = a.status === 'sold' || a.status === 'shipped' ? 1 : 0;
          const bSold = b.status === 'sold' || b.status === 'shipped' ? 1 : 0;
          if (aSold !== bSold) return aSold - bSold;
          return (
            new Date(a.acquisition_date || a.created_at).getTime() -
            new Date(b.acquisition_date || b.created_at).getTime()
          );
        }
        case 'location': {
          const la = a.storage_location?.name ?? '\uffff';
          const lb = b.storage_location?.name ?? '\uffff';
          return la.localeCompare(lb) || (a.title || '').localeCompare(b.title || '');
        }
        case 'newest':
        default:
          return (
            new Date(b.acquisition_date || b.created_at).getTime() -
            new Date(a.acquisition_date || a.created_at).getTime()
          );
      }
    });

    return result;
  }, [items, search, statusFilter, categoryFilter, reviewFilter, dateFrom, dateTo, deliveryFilter, sortBy, needsDetailsOnly, locationFilter, decisionFilter, view, inView, groupBy, defaultSort, sourceFilter, holderFilter, eventFilter, flagFilter]);

  // Long lists render a screenful at a time
  useEffect(() => setVisibleCount(PAGE), [filteredItems]);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const hasMore = visibleCount < filteredItems.length;
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => entries.some((e) => e.isIntersecting) && setVisibleCount((n) => n + PAGE),
      { rootMargin: '600px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, visibleCount]);

  /** Sections for the grouped view, in display order, with what's in each. */
  const groups = useMemo(() => {
    if (groupBy === 'none') return null;
    const map = new Map<string, { key: string; label: string; items: Item[]; value: number }>();
    for (const item of filteredItems) {
      const [key, label] =
        groupBy === 'location'
          ? [item.storage_location_id ?? '', item.storage_location?.name ?? 'No location']
          : groupBy === 'category'
            ? [item.category_id ?? '', item.category?.name ?? 'Uncategorized']
            : [item.status, statusConfig[item.status].label];
      const g = map.get(key) ?? { key, label, items: [], value: 0 };
      g.items.push(item);
      if (!isSold(item)) g.value += item.target_price ?? 0;
      map.set(key, g);
    }
    const list = [...map.values()];
    if (groupBy === 'status') {
      const order = Object.keys(statusConfig);
      return list.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    }
    // Unassigned last — it's the pile that still needs a home
    return list.sort((a, b) => (a.key === '' ? 1 : b.key === '' ? -1 : a.label.localeCompare(b.label)));
  }, [filteredItems, groupBy]);

  // Status counts for filter badges
  const statusCounts = items.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const activeFilterCount = [
    statusFilter !== 'all',
    categoryFilter !== 'all',
    locationFilter !== 'all',
    decisionFilter !== 'all',
    reviewFilter !== 'all',
    deliveryFilter !== 'all',
    !!dateFrom,
    !!dateTo,
    sortBy !== defaultSort,
    groupBy !== 'none',
    sourceFilter !== 'all',
    holderFilter !== 'all',
    eventFilter !== 'all',
    flagFilter !== 'all',
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setSourceFilter('all');
    setHolderFilter('all');
    setEventFilter('all');
    setFlagFilter('all');
    setStatusFilter('all');
    setCategoryFilter('all');
    setLocationFilter('all');
    setDecisionFilter('all');
    setNeedsDetailsOnly(false);
    setReviewFilter('all');
    setDeliveryFilter('all');
    setDateFrom('');
    setDateTo('');
    setSortBy(defaultSort);
    setGroupBy('none');
    setView('all');
  };

  // Mutations
  const updateItemStatus = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: ItemStatus }) => {
      const sold = status === 'sold' || status === 'shipped';
      // A sold item keeps the day it sold; only one that has no date yet gets today's
      const { error } = await supabase
        .from('items')
        .update(sold ? { status } : { status, sale_date: null })
        .in('id', ids);
      if (error) throw error;
      if (sold) {
        const { error: dateErr } = await supabase
          .from('items')
          .update({ sale_date: todayLocal() })
          .in('id', ids)
          .is('sale_date', null);
        if (dateErr) throw dateErr;
      }
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

  const bulkEdit = useMutation({
    mutationFn: async ({ ids, edit }: { ids: string[]; edit: BulkEdit }) => {
      const update: TablesUpdate<'items'> = {};
      const toSold = edit.status === 'sold' || edit.status === 'shipped';
      if (edit.status) {
        update.status = edit.status;
        if (!toSold) update.sale_date = null;
      }
      if (edit.eventId !== undefined) update.packed_for_event_id = edit.eventId;
      if (edit.categoryId !== undefined) update.category_id = edit.categoryId;
      if (edit.storageLocationId !== undefined) update.storage_location_id = edit.storageLocationId;
      if (edit.decision) update.physical_status = edit.decision;
      if (edit.condition) update.condition = edit.condition;
      if (edit.targetPrice !== undefined) update.target_price = edit.targetPrice;
      if (edit.heldBy !== undefined) update.held_by = edit.heldBy;
      if (edit.tagPrice !== undefined) update.tag_price = edit.tagPrice;
      if (edit.flagFor !== undefined) {
        update.flagged_for = edit.flagFor;
        update.flag_note = edit.flagFor ? edit.flagNote ?? null : null;
      }
      if (Object.keys(update).length > 0) {
        const { error } = await supabase.from('items').update(update).in('id', ids);
        if (error) throw error;
      }
      if (toSold) {
        const { error } = await supabase
          .from('items')
          .update({ sale_date: todayLocal() })
          .in('id', ids)
          .is('sale_date', null);
        if (error) throw error;
      }
      // Percent-of-cost pricing needs each item's own cost
      if (edit.markupPercent !== undefined) {
        const targets = items.filter((i) => ids.includes(i.id));
        const results = await Promise.all(
          targets.map((i) =>
            supabase
              .from('items')
              .update({ target_price: Math.round(i.original_cost * (1 + edit.markupPercent! / 100) * 100) / 100 })
              .eq('id', i.id)
          )
        );
        const failed = results.find((r) => r.error);
        if (failed?.error) throw failed.error;
      }
      // Market stickers at each item's own asking price
      if (edit.tagFromAsking) {
        const targets = items.filter((i) => ids.includes(i.id) && i.target_price != null);
        const results = await Promise.all(
          targets.map((i) => supabase.from('items').update({ tag_price: i.target_price }).eq('id', i.id))
        );
        const failed = results.find((r) => r.error);
        if (failed?.error) throw failed.error;
      }
      // Tell the teammate their list just grew — they may be working somewhere else
      if (edit.flagFor && team?.id && edit.flagFor !== user?.id) {
        void notifyUsers(team.id, [edit.flagFor], {
          type: 'item_flagged',
          title: `${ids.length} item${ids.length === 1 ? '' : 's'} flagged for you`,
          message: `${profile?.full_name || 'A teammate'}${edit.flagNote ? `: ${edit.flagNote}` : ' flagged these for you'}`,
          link: '/inventory?show=flagged',
        });
      }
    },
    onSuccess: (_d, { ids }) => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      toast.success(`Updated ${ids.length} item${ids.length === 1 ? '' : 's'}`);
      setShowBulkEdit(false);
      setSelectedItems(new Set());
      setIsSelecting(false);
    },
    onError: () => {
      toast.error('Bulk update failed');
    },
  });

  const deleteItems = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from('items').delete().in('id', ids);
      if (error) throw error;
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

  /** Needs-details queue: after saving, jump to the next item still missing something */
  const openNextNeedingDetails = (currentId: string) => {
    const queue = filteredItems.filter((i) => i.id !== currentId && needsDetails(i));
    queryClient.invalidateQueries({ queryKey: ['items'] });
    if (queue.length === 0) {
      setQuickEditItem(null);
      toast.success('All caught up — nothing else needs details');
      return;
    }
    setQuickEditItem(queue[0]);
  };

  const renderRow = (item: Item) => (
    <SwipeableItem
      key={item.id}
      item={item}
      isSelecting={isSelecting}
      isSelected={selectedItems.has(item.id)}
      onSelect={toggleSelect}
      onClick={() => navigate(`/item/${item.id}`)}
      onTap={() => setQuickEditItem(item)}
      onMarkListed={() => updateItemStatus.mutate({ ids: [item.id], status: 'listed' })}
      // A sale needs a price and a place — never just a status flip
      onMarkSold={() => setSaleItems([item])}
      onDelete={() => {
        setItemToDelete(item.id);
        setShowDeleteConfirm(true);
      }}
    />
  );

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
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <h1 className="text-2xl font-bold text-foreground">Inventory</h1>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/scan')}
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
              <DropdownMenuItem onClick={() => setShowListImport(true)}>
                <Table2 className="w-4 h-4 mr-2" />
                Any list (CSV / Excel)
              </DropdownMenuItem>
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
        <div className="flex flex-wrap items-center gap-2 p-3 bg-primary/10 rounded-lg border border-primary/20">
          <Button size="sm" onClick={() => setShowBulkEdit(true)}>
            <ClipboardEdit className="w-4 h-4 mr-1" />
            Edit {selectedItems.size}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowAssignTask(true)}>
            <ListChecks className="w-4 h-4 mr-1" />
            Assign task
          </Button>
          <Button size="sm" variant="outline" onClick={handleBulkMarkListed}>
            <Tag className="w-4 h-4 mr-1" />
            Mark Listed
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const sellable = items.filter((i) => selectedItems.has(i.id) && !isSold(i));
              if (sellable.length === 0) toast.info('Those are already sold');
              else setSaleItems(sellable);
            }}
          >
            <DollarSign className="w-4 h-4 mr-1" />
            Sold
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
            placeholder="Search any words — name, brand, notes, UPC..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* One-tap views */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4">
          {VIEW_ORDER.filter((v) => v === 'all' || v === view || viewCounts[v] > 0).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`flex-shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                view === v
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:text-foreground'
              }`}
            >
              {VIEW_LABELS[v]} <span className="opacity-70 tabular-nums">{viewCounts[v]}</span>
            </button>
          ))}
        </div>

        {/* Needs-details queue */}
        {needsDetailsCount > 0 && (
          <button
            type="button"
            onClick={() => setNeedsDetailsOnly((v) => !v)}
            className={`w-full flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors ${
              needsDetailsOnly
                ? 'border-amber-500/60 bg-amber-500/15 text-amber-700 dark:text-amber-400'
                : 'border-amber-500/30 bg-amber-500/5 text-foreground'
            }`}
          >
            <span className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              {needsDetailsOnly ? 'Showing items that need details' : 'Needs details'}
            </span>
            <span className="flex items-center gap-2">
              <span className="rounded-full bg-amber-500 text-white text-xs font-semibold px-2 py-0.5">
                {needsDetailsCount}
              </span>
              {needsDetailsOnly && filteredItems.length > 0 && (
                <span
                  role="button"
                  tabIndex={0}
                  className="text-xs underline underline-offset-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    setQuickEditItem(filteredItems[0]);
                  }}
                >
                  Start
                </span>
              )}
            </span>
          </button>
        )}

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
                  <SelectItem value="profit_high">Most profit first</SelectItem>
                  <SelectItem value="margin_high">Best margin first</SelectItem>
                  <SelectItem value="price_high">Highest price first</SelectItem>
                  <SelectItem value="aging">Oldest unsold first</SelectItem>
                  <SelectItem value="location">By storage location</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Group */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Group by
              </p>
              <Select value={groupBy} onValueChange={(v) => { setGroupBy(v as GroupBy); setCollapsed(new Set()); }}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No grouping</SelectItem>
                  <SelectItem value="location">Storage location</SelectItem>
                  <SelectItem value="category">Category</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
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

            {/* Location + Keep/Sell */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Location
                </p>
                <Select value={locationFilter} onValueChange={setLocationFilter}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="none">No location</SelectItem>
                    {storageLocations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>
                        {loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Keep / Sell
                </p>
                <Select value={decisionFilter} onValueChange={setDecisionFilter}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="sell">Selling</SelectItem>
                    <SelectItem value="keep">Keeping</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Source, holder, market, flag */}
            <div className="grid grid-cols-2 gap-2">
              <FilterSelect label="Source" value={sourceFilter} onChange={setSourceFilter}>
                {sources.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </FilterSelect>
              <FilterSelect label="Who has it" value={holderFilter} onChange={setHolderFilter}>
                <SelectItem value="none">Nobody set</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.full_name || 'Unnamed'}{m.id === user?.id ? ' (you)' : ''}
                  </SelectItem>
                ))}
              </FilterSelect>
              <FilterSelect label="Packed for" value={eventFilter} onChange={setEventFilter}>
                <SelectItem value="none">Not packed</SelectItem>
                {events.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </FilterSelect>
              <FilterSelect label="Flagged" value={flagFilter} onChange={setFlagFilter}>
                <SelectItem value="any">Flagged for anyone</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    For {m.full_name || 'Unnamed'}{m.id === user?.id ? ' (you)' : ''}
                  </SelectItem>
                ))}
              </FilterSelect>
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
          {groups
            ? (() => {
                // One row budget across every section, so a huge inventory still renders a screenful
                let budget = visibleCount;
                return groups.map((g) => {
                  const open = !collapsed.has(g.key);
                  const rows = open ? g.items.slice(0, Math.max(0, budget)) : [];
                  budget -= rows.length;
                  return (
                    <div key={g.key || '__none__'} className="space-y-3">
                      <button
                        type="button"
                        onClick={() =>
                          setCollapsed((prev) => {
                            const next = new Set(prev);
                            if (next.has(g.key)) next.delete(g.key);
                            else next.add(g.key);
                            return next;
                          })
                        }
                        className="w-full flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-left"
                      >
                        <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`} />
                        <span className="flex-1 min-w-0 truncate text-sm font-semibold">{g.label}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {g.items.length} item{g.items.length === 1 ? '' : 's'}
                          {g.value > 0 && ` · $${g.value.toFixed(0)} asking`}
                        </span>
                      </button>
                      {rows.map(renderRow)}
                    </div>
                  );
                });
              })()
            : filteredItems.slice(0, visibleCount).map(renderRow)}
          {hasMore && (
            <div ref={sentinelRef} className="py-4 text-center text-xs text-muted-foreground">
              Showing {Math.min(visibleCount, filteredItems.length)} of {filteredItems.length}…
            </div>
          )}
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
        onSaveNext={
          needsDetailsOnly && quickEditItem
            ? () => openNextNeedingDetails(quickEditItem.id)
            : undefined
        }
        queueLabel={
          needsDetailsOnly && quickEditItem
            ? `Needs details · ${Math.max(0, filteredItems.filter((i) => i.id !== quickEditItem.id).length)} more after this`
            : undefined
        }
      />

      <VineReportImportDialog open={showVineReport} onOpenChange={setShowVineReport} />

      <LatticeImportDialog open={showLattice} onOpenChange={setShowLattice} />

      <ListImportDialog open={showListImport} onOpenChange={setShowListImport} />

      <AssignTaskDialog
        open={showAssignTask}
        onOpenChange={setShowAssignTask}
        itemIds={Array.from(selectedItems)}
        defaultType={needsDetailsOnly ? 'needs_photos' : undefined}
        onDone={() => {
          setSelectedItems(new Set());
          setIsSelecting(false);
        }}
      />

      <BulkEditDialog
        open={showBulkEdit}
        onOpenChange={setShowBulkEdit}
        count={selectedItems.size}
        categories={categories}
        storageLocations={storageLocations}
        events={events.filter((e) => e.status !== 'closed')}
        members={members}
        currentUserId={user?.id}
        isSaving={bulkEdit.isPending}
        onApply={(edit) => {
          const ids = Array.from(selectedItems);
          if (edit.status !== 'sold') {
            bulkEdit.mutate({ ids, edit });
            return;
          }
          // "Sold" needs prices and a place: apply the other changes, then record the sale
          const { status: _sold, ...rest } = edit;
          const sellable = items.filter((i) => selectedItems.has(i.id) && !isSold(i));
          if (Object.keys(rest).length > 0) bulkEdit.mutate({ ids, edit: rest });
          else setShowBulkEdit(false);
          if (sellable.length > 0) setSaleItems(sellable);
          else toast.info('Those are already sold');
        }}
      />

      <RecordSaleDialog
        open={!!saleItems}
        onOpenChange={(o) => !o && setSaleItems(null)}
        items={saleItems ?? []}
        onRecorded={() => {
          setSelectedItems(new Set());
          setIsSelecting(false);
        }}
      />
    </div>
  );
}

/** A labelled filter dropdown with an "All" option; children are the other choices. */
function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 text-sm">
          <SelectValue placeholder="All" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          {children}
        </SelectContent>
      </Select>
    </div>
  );
}
