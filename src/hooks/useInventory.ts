import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { buildIndex, rollUp, type LocationIndex, type Stock } from '@/lib/locationTree';

export type ItemStatus = 'acquired' | 'refurbishing' | 'ready_to_list' | 'listed' | 'sold' | 'shipped';
export type ItemCondition = 'new' | 'like_new' | 'good' | 'fair' | 'for_parts';

export interface Item {
  id: string;
  team_id: string;
  created_by: string | null;
  tracking_number: number | null;
  title: string | null;
  description: string | null;
  category_id: string | null;
  photos: string[] | null;
  original_cost: number;
  acquisition_date: string;
  acquisition_source: string | null;
  condition: ItemCondition;
  refurbish_notes: string | null;
  refurbish_cost: number | null;
  time_invested_minutes: number | null;
  storage_location_id: string | null;
  status: ItemStatus;
  target_price: number | null;
  actual_price: number | null;
  sale_date: string | null;
  shipping_cost: number | null;
  platform_fees: number | null;
  created_at: string;
  updated_at: string;
  // Physical inventory
  physical_status: string;
  confirmed_at: string | null;
  confirmed_by: string | null;
  held_by: string | null;
  // Facebook integration
  fb_listing_url: string | null;
  fb_listed_date: string | null;
  fb_views: number | null;
  fb_conversation_notes: string | null;
  default_pickup_location: string | null;
  // Flagging
  flagged_for: string | null;
  flag_note: string | null;
  // Amazon review
  amazon_review_status: string | null;
  reviewed_by: string[] | null;
  review_notes: string | null;
  // Amazon / import fields
  amazon_asin: string | null;
  /** Amazon X00… sticker scanned on the box (saved once matched) */
  fnsku?: string | null;
  upc: string | null;
  // Autofilled product details (barcode lookup / list import)
  brand?: string | null;
  retail_price?: number | null;
  amazon_order_id: string | null;
  amazon_order_number: string | null;
  amazon_order_url: string | null;
  amazon_tracking_url: string | null;
  amazon_invoice_url: string | null;
  amazon_shipment_status: string | null;
  amazon_return_status: string | null;
  amazon_refund_amount: number | null;
  amazon_refund_date: string | null;
  amazon_tax_amount: number | null;
  delivery_status: string | null;
  /** Dates from the official order files (20261023000000_order_dates.sql) */
  ordered_date?: string | null;
  shipped_date?: string | null;
  delivered_date?: string | null;
  // Vine fields
  is_vine_order: boolean | null;
  vine_review_status: string | null;
  vine_review_quality: string | null;
  vine_review_date: string | null;
  vine_etv: number | null;
  vine_fmv: number | null;
  // Lattice fields
  lattice_review_status: string | null;
  lattice_review_score: number | null;
  lattice_review_quality: string | null;
  lattice_reviewed_date: string | null;
  // Multi-source tracking
  data_sources: string[] | null;
  // Market-day selling (20261106000000_market_selling.sql)
  /** Price on the sticker at a market */
  tag_price?: number | null;
  /** Private walk-away price — never printed */
  floor_price?: number | null;
  packed_for_event_id?: string | null;
  /** Where it sold: 'market', or the platform's name ("Facebook Marketplace", "eBay", …) */
  channel_sold?: string | null;
  /** When the status last became 'listed' (20261110000000_unified_sales.sql) */
  listed_at?: string | null;
  market_attempts?: number | null;
  // Joined relations
  category?: Category | null;
  storage_location?: StorageLocation | null;
  /** Who made offers on / met up for this item — loaded with confirmed inventory, for search */
  offers?: BuyerRef[] | null;
  meetups?: BuyerRef[] | null;
}

export interface BuyerRef {
  buyer_name: string | null;
  buyer_contact: string | null;
}

export interface Category {
  id: string;
  team_id: string;
  name: string;
  icon: string | null;
  is_default: boolean;
}

export interface StorageLocation {
  id: string;
  team_id: string;
  name: string;
  /** Free-text notes ("Notes" in the UI) */
  description: string | null;
  /** The location this one sits inside; null = top level (20261111000000_storage_location_hierarchy.sql) */
  parent_id: string | null;
  /**
   * Things are kept here for now but shouldn't stay (boxes in the house that belong
   * in the garage). Undefined until 20261112000000_storage_location_needs_move.sql is applied.
   */
  needs_move?: boolean;
  created_at?: string;
}

export interface Platform {
  id: string;
  team_id: string | null;
  name: string;
  fee_percentage: number;
  flat_fee: number;
  processing_percentage: number;
  processing_flat_fee: number;
  is_default: boolean;
}

const PAGE_SIZE = 1000;

/**
 * Supabase returns at most 1,000 rows per request — page through the rest.
 * Vine order histories easily run to several thousand items.
 */
async function fetchAllPages(
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>
): Promise<Item[]> {
  const all: Item[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    all.push(...((data ?? []) as Item[]));
    if (!data || data.length < PAGE_SIZE) return all;
  }
}

/** Confirmed inventory. `enabled: false` skips the fetch (e.g. until a search needs it). */
export function useItems(options?: { enabled?: boolean }) {
  const { team } = useAuth();

  return useQuery({
    queryKey: ['items', team?.id],
    queryFn: async () => {
      if (!team?.id) return [];
      
      return fetchAllPages((from, to) =>
        supabase
          .from('items')
          .select(`
            *,
            category:categories(*),
            storage_location:storage_locations(*),
            offers(buyer_name, buyer_contact),
            meetups(buyer_name, buyer_contact)
          `)
          .eq('team_id', team.id)
          .neq('physical_status', 'unconfirmed')
          .order('created_at', { ascending: false })
          .order('id')
          .range(from, to)
      );
    },
    enabled: !!team?.id && (options?.enabled ?? true),
    // Teammates' changes arrive over realtime (useTeamRealtime) and invalidate this,
    // so there's no need to re-download the whole inventory on every screen change.
    staleTime: 5 * 60 * 1000,
  });
}

export function useOrderSheetItems() {
  const { team } = useAuth();
  return useQuery({
    queryKey: ['items', 'order-sheet', team?.id],
    queryFn: async () => {
      if (!team?.id) return [];
      return fetchAllPages((from, to) =>
        supabase
          .from('items')
          .select(`
            *,
            category:categories(*),
            storage_location:storage_locations(*)
          `)
          .eq('team_id', team.id)
          .eq('physical_status', 'unconfirmed')
          .order('acquisition_date', { ascending: false })
          .order('id')
          .range(from, to)
      );
    },
    enabled: !!team?.id,
  });
}

export function useCategories() {
  const { team } = useAuth();

  return useQuery({
    queryKey: ['categories', team?.id],
    queryFn: async () => {
      if (!team?.id) return [];
      
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('team_id', team.id)
        .order('name');

      if (error) throw error;
      return data as Category[];
    },
    enabled: !!team?.id,
  });
}

export function useStorageLocations() {
  const { team } = useAuth();

  return useQuery({
    queryKey: ['storage_locations', team?.id],
    queryFn: async () => {
      if (!team?.id) return [];
      
      const { data, error } = await supabase
        .from('storage_locations')
        .select('*')
        .eq('team_id', team.id)
        .order('name');

      if (error) throw error;
      return data as StorageLocation[];
    },
    enabled: !!team?.id,
  });
}

const EMPTY_LOCATIONS: StorageLocation[] = [];
const indexCache = new WeakMap<readonly StorageLocation[], LocationIndex<StorageLocation>>();

/** One tree index per fetched list, shared by every component that asks for it. */
export function locationIndexFor(list: readonly StorageLocation[]): LocationIndex<StorageLocation> {
  let ix = indexCache.get(list);
  if (!ix) {
    ix = buildIndex(list);
    indexCache.set(list, ix);
  }
  return ix;
}

/**
 * The storage-location tree: paths ("Workshop › Bottom shelf"), children,
 * descendants. Built from {@link useStorageLocations}; `isLoading` is true
 * until the list has arrived (so callers don't treat ids as missing too early).
 */
export function useLocationIndex() {
  const { data, isSuccess } = useStorageLocations();
  const index = locationIndexFor(data ?? EMPTY_LOCATIONS);
  return { index, locations: data ?? EMPTY_LOCATIONS, loaded: isSuccess };
}

/** "Workshop › Bottom shelf" (`'path'`) or "Bottom shelf" (`'leaf'`); null when unplaced/unknown. */
export function locationLabel(
  id: string | null | undefined,
  index: LocationIndex<StorageLocation>,
  mode: 'leaf' | 'path' = 'path'
): string | null {
  if (!id) return null;
  const node = index.byId.get(id);
  if (!node) return null;
  return mode === 'leaf' ? node.name : index.pathText(id);
}

/** Options for itemSearch's matchItem/searchItems so the location field matches full paths. */
export function useLocationSearchOptions() {
  const { index } = useLocationIndex();
  return useMemo(() => ({ locationPath: (id: string) => index.pathText(id) }), [index]);
}

/** {@link useLocationStock} rolled up so each location includes everything inside it. */
export function useRolledUpStock() {
  const { data: stock } = useLocationStock();
  const { index } = useLocationIndex();
  return useMemo(() => rollUp(stock, index), [stock, index]);
}

export type { Stock as LocationStock };

export function usePlatforms() {
  return useQuery({
    queryKey: ['platforms'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platforms')
        .select('*')
        .order('name');

      if (error) throw error;
      return data as Platform[];
    },
  });
}

/** What an item sold for (or is expected to): the recorded price, else the asking price. */
export function sellingPriceOf(item: Pick<Item, 'actual_price' | 'target_price'>): number {
  return item.actual_price || item.target_price || 0;
}

/** Storage locations with how many unsold items are in each, and what they're asking. */
export function useLocationStock() {
  const { team } = useAuth();
  return useQuery({
    queryKey: ['items', 'location-stock', team?.id],
    queryFn: async () => {
      if (!team?.id) return new Map<string, { count: number; value: number }>();
      const rows = await fetchAllPages((from, to) =>
        supabase
          .from('items')
          .select('id, storage_location_id, target_price, status')
          .eq('team_id', team.id)
          .neq('physical_status', 'unconfirmed')
          .not('status', 'in', '(sold,shipped)')
          .order('id')
          .range(from, to)
      );
      const stock = new Map<string, { count: number; value: number }>();
      for (const r of rows) {
        const key = r.storage_location_id ?? '';
        const s = stock.get(key) ?? { count: 0, value: 0 };
        s.count += 1;
        s.value += Number(r.target_price) || 0;
        stock.set(key, s);
      }
      return stock;
    },
    enabled: !!team?.id,
  });
}

// Calculate profit metrics
export function calculateProfit(item: Item) {
  const sellingPrice = sellingPriceOf(item);
  const totalCost = item.original_cost + (item.refurbish_cost || 0);
  const grossProfit = sellingPrice - item.original_cost;
  const netProfit = sellingPrice - totalCost - (item.shipping_cost || 0) - (item.platform_fees || 0);
  const margin = sellingPrice > 0 ? (netProfit / sellingPrice) * 100 : 0;

  return { grossProfit, netProfit, margin, totalCost };
}

// Get profit level for styling
export function getProfitLevel(margin: number): 'loss' | 'low' | 'good' | 'high' {
  if (margin < 0) return 'loss';
  if (margin < 20) return 'low';
  if (margin < 50) return 'good';
  return 'high';
}

// Status display info
export const statusConfig: Record<ItemStatus, { label: string; className: string }> = {
  acquired: { label: 'Acquired', className: 'status-acquired' },
  refurbishing: { label: 'Refurbishing', className: 'status-refurbishing' },
  ready_to_list: { label: 'Ready to List', className: 'status-ready' },
  listed: { label: 'Listed', className: 'status-listed' },
  sold: { label: 'Sold', className: 'status-sold' },
  shipped: { label: 'Shipped', className: 'status-shipped' },
};

/**
 * An unsold item is missing something needed to list it: a real title,
 * an asking price, a photo, or a category.
 */
export function getMissingDetails(item: Pick<Item, 'title' | 'target_price' | 'photos' | 'category_id' | 'status'>): string[] {
  if (item.status === 'sold' || item.status === 'shipped') return [];
  const missing: string[] = [];
  if (!item.title || item.title.startsWith('Unknown item (')) missing.push('title');
  if (item.target_price == null) missing.push('price');
  if (!item.photos || item.photos.length === 0) missing.push('photo');
  if (!item.category_id) missing.push('category');
  return missing;
}

export function needsDetails(item: Pick<Item, 'title' | 'target_price' | 'photos' | 'category_id' | 'status'>): boolean {
  return getMissingDetails(item).length > 0;
}

export const conditionLabels: Record<ItemCondition, string> = {
  new: 'New',
  like_new: 'Like New',
  good: 'Good',
  fair: 'Fair',
  for_parts: 'For Parts',
};
