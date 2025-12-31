import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface RoughItem {
  id: string;
  team_id: string;
  created_by: string | null;
  box_label: string;
  box_description: string | null;
  item_name: string;
  item_notes: string | null;
  estimated_quantity: number;
  estimated_value: number | null;
  is_processed: boolean;
  linked_item_id: string | null;
  created_at: string;
  updated_at: string;
  processed_at: string | null;
}

export interface CreateRoughItemInput {
  box_label: string;
  box_description?: string;
  item_name: string;
  item_notes?: string;
  estimated_quantity?: number;
  estimated_value?: number;
}

export interface UpdateRoughItemInput {
  id: string;
  box_label?: string;
  box_description?: string;
  item_name?: string;
  item_notes?: string;
  estimated_quantity?: number;
  estimated_value?: number;
  is_processed?: boolean;
  linked_item_id?: string;
}

export function useRoughItems() {
  const { team } = useAuth();

  return useQuery({
    queryKey: ['rough_items', team?.id],
    queryFn: async () => {
      if (!team?.id) return [];

      const { data, error } = await supabase
        .from('rough_items')
        .select('*')
        .eq('team_id', team.id)
        .order('box_label', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as RoughItem[];
    },
    enabled: !!team?.id,
  });
}

export function useCreateRoughItem() {
  const { team, user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateRoughItemInput) => {
      if (!team?.id) throw new Error('No team selected');

      const { data, error } = await supabase
        .from('rough_items')
        .insert({
          team_id: team.id,
          created_by: user?.id,
          ...input,
        })
        .select()
        .single();

      if (error) throw error;
      return data as RoughItem;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rough_items', team?.id] });
    },
  });
}

export function useUpdateRoughItem() {
  const { team } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: UpdateRoughItemInput) => {
      const updateData: Record<string, unknown> = { ...updates };

      // If marking as processed, set the processed_at timestamp
      if (updates.is_processed) {
        updateData.processed_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('rough_items')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as RoughItem;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rough_items', team?.id] });
    },
  });
}

export function useDeleteRoughItem() {
  const { team } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('rough_items')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rough_items', team?.id] });
    },
  });
}

// Get unique box labels for grouping/filtering
export function useBoxLabels() {
  const { data: roughItems } = useRoughItems();

  const boxLabels = roughItems
    ? [...new Set(roughItems.map((item) => item.box_label))].sort()
    : [];

  return boxLabels;
}

// Get rough items grouped by box
export function useRoughItemsByBox() {
  const { data: roughItems, ...rest } = useRoughItems();

  const itemsByBox = roughItems?.reduce((acc, item) => {
    if (!acc[item.box_label]) {
      acc[item.box_label] = [];
    }
    acc[item.box_label].push(item);
    return acc;
  }, {} as Record<string, RoughItem[]>) ?? {};

  return { data: itemsByBox, items: roughItems, ...rest };
}

// Get counts for dashboard
export function useRoughItemsCounts() {
  const { data: roughItems } = useRoughItems();

  const counts = {
    total: roughItems?.length ?? 0,
    processed: roughItems?.filter((item) => item.is_processed).length ?? 0,
    pending: roughItems?.filter((item) => !item.is_processed).length ?? 0,
    boxes: roughItems ? new Set(roughItems.map((item) => item.box_label)).size : 0,
  };

  return counts;
}
