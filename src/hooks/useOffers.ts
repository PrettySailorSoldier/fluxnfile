import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type OfferStatus = 'pending' | 'accepted' | 'declined' | 'countered' | 'expired';

export interface Offer {
  id: string;
  item_id: string;
  team_id: string;
  buyer_name: string | null;
  buyer_contact: string | null;
  offer_amount: number;
  counter_amount: number | null;
  status: OfferStatus;
  is_lowball: boolean;
  notes: string | null;
  conversation_thread: string | null;
  created_at: string;
  updated_at: string;
}

export const offerStatusLabels: Record<OfferStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  declined: 'Declined',
  countered: 'Countered',
  expired: 'Expired',
};

export const offerStatusColors: Record<OfferStatus, string> = {
  pending: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30',
  accepted: 'bg-green-500/10 text-green-600 border-green-500/30',
  declined: 'bg-red-500/10 text-red-600 border-red-500/30',
  countered: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
  expired: 'bg-gray-500/10 text-gray-600 border-gray-500/30',
};

export function useOffers(itemId?: string) {
  const { team } = useAuth();

  return useQuery({
    queryKey: ['offers', team?.id, itemId],
    queryFn: async () => {
      if (!team?.id) return [];

      let query = supabase
        .from('offers')
        .select('*')
        .eq('team_id', team.id)
        .order('created_at', { ascending: false });

      if (itemId) {
        query = query.eq('item_id', itemId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as Offer[];
    },
    enabled: !!team?.id,
  });
}

export function useCreateOffer() {
  const queryClient = useQueryClient();
  const { team } = useAuth();

  return useMutation({
    mutationFn: async (offer: {
      item_id: string;
      buyer_name?: string;
      buyer_contact?: string;
      offer_amount: number;
      notes?: string;
      conversation_thread?: string;
    }) => {
      if (!team?.id) throw new Error('No team');

      // Check if this is a lowball offer (less than 50% of asking price)
      const { data: item } = await supabase
        .from('items')
        .select('target_price, actual_price')
        .eq('id', offer.item_id)
        .single();

      const askingPrice = item?.actual_price || item?.target_price || 0;
      const isLowball = askingPrice > 0 && offer.offer_amount < askingPrice * 0.5;

      const { data, error } = await supabase
        .from('offers')
        .insert({
          team_id: team.id,
          is_lowball: isLowball,
          ...offer,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['offers'] });
      queryClient.invalidateQueries({ queryKey: ['offers', variables.item_id] });
    },
  });
}

export function useUpdateOffer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: {
      id: string;
      buyer_name?: string;
      buyer_contact?: string;
      offer_amount?: number;
      counter_amount?: number;
      status?: OfferStatus;
      is_lowball?: boolean;
      notes?: string;
      conversation_thread?: string;
    }) => {
      const { error } = await supabase
        .from('offers')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offers'] });
    },
  });
}

export function useDeleteOffer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('offers').delete().eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offers'] });
    },
  });
}

// Helper to detect lowball offers
export function isLowballOffer(offerAmount: number, askingPrice: number, threshold: number = 0.5): boolean {
  if (askingPrice <= 0) return false;
  return offerAmount < askingPrice * threshold;
}

// Helper to calculate offer percentage
export function getOfferPercentage(offerAmount: number, askingPrice: number): number {
  if (askingPrice <= 0) return 0;
  return Math.round((offerAmount / askingPrice) * 100);
}
