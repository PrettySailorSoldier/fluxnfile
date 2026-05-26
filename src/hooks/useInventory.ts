import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

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
  photos: string[];
  original_cost: number;
  acquisition_date: string;
  acquisition_source: string | null;
  condition: ItemCondition;
  refurbish_notes: string | null;
  refurbish_cost: number;
  time_invested_minutes: number;
  storage_location_id: string | null;
  status: ItemStatus;
  target_price: number | null;
  actual_price: number | null;
  sale_date: string | null;
  shipping_cost: number;
  platform_fees: number;
  created_at: string;
  updated_at: string;
  physical_status: 'unconfirmed' | 'keep' | 'sell';
  confirmed_at: string | null;
  confirmed_by: string | null;
  held_by: string | null;
  category?: Category | null;
  storage_location?: StorageLocation | null;
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
  description: string | null;
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

export function useItems() {
  const { team } = useAuth();

  return useQuery({
    queryKey: ['items', team?.id],
    queryFn: async () => {
      if (!team?.id) return [];
      
      const { data, error } = await supabase
        .from('items')
        .select(`
          *,
          category:categories(*),
          storage_location:storage_locations(*)
        `)
        .eq('team_id', team.id)
        .neq('physical_status', 'unconfirmed')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Item[];
    },
    enabled: !!team?.id,
  });
}

export function useOrderSheetItems() {
  const { team } = useAuth();
  return useQuery({
    queryKey: ['items', 'order-sheet', team?.id],
    queryFn: async () => {
      if (!team?.id) return [];
      const { data, error } = await supabase
        .from('items')
        .select(`
          *,
          category:categories(*),
          storage_location:storage_locations(*)
        `)
        .eq('team_id', team.id)
        .eq('physical_status', 'unconfirmed')
        .order('acquisition_date', { ascending: false });
      if (error) throw error;
      return data as Item[];
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

// Calculate profit metrics
export function calculateProfit(item: Item) {
  const sellingPrice = item.actual_price || item.target_price || 0;
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

export const conditionLabels: Record<ItemCondition, string> = {
  new: 'New',
  like_new: 'Like New',
  good: 'Good',
  fair: 'Fair',
  for_parts: 'For Parts',
};
