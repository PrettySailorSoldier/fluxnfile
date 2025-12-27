import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface MeetupLocation {
  id: string;
  team_id: string;
  name: string;
  address: string | null;
  location_type: string | null;
  notes: string | null;
  latitude: number | null;
  longitude: number | null;
  is_default: boolean;
  is_suggested: boolean;
  safety_rating: number;
  created_at: string;
}

export const locationTypeLabels: Record<string, string> = {
  police_station: 'Police Station',
  bank: 'Bank',
  fire_station: 'Fire Station',
  coffee_shop: 'Coffee Shop',
  library: 'Library',
  mall: 'Shopping Mall',
  grocery_store: 'Grocery Store',
  gas_station: 'Gas Station',
  other: 'Other',
};

export const locationTypeIcons: Record<string, string> = {
  police_station: '🚔',
  bank: '🏦',
  fire_station: '🚒',
  coffee_shop: '☕',
  library: '📚',
  mall: '🏬',
  grocery_store: '🛒',
  gas_station: '⛽',
  other: '📍',
};

export function useMeetupLocations() {
  const { team } = useAuth();

  return useQuery({
    queryKey: ['meetup_locations', team?.id],
    queryFn: async () => {
      if (!team?.id) return [];

      const { data, error } = await supabase
        .from('meetup_locations')
        .select('*')
        .eq('team_id', team.id)
        .order('is_default', { ascending: false })
        .order('safety_rating', { ascending: false })
        .order('name');

      if (error) throw error;
      return data as MeetupLocation[];
    },
    enabled: !!team?.id,
  });
}

export function useCreateMeetupLocation() {
  const queryClient = useQueryClient();
  const { team } = useAuth();

  return useMutation({
    mutationFn: async (location: {
      name: string;
      address?: string;
      location_type?: string;
      notes?: string;
      latitude?: number;
      longitude?: number;
      is_default?: boolean;
      safety_rating?: number;
    }) => {
      if (!team?.id) throw new Error('No team');

      const { data, error } = await supabase
        .from('meetup_locations')
        .insert({
          team_id: team.id,
          ...location,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetup_locations'] });
    },
  });
}

export function useUpdateMeetupLocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: {
      id: string;
      name?: string;
      address?: string;
      location_type?: string;
      notes?: string;
      latitude?: number;
      longitude?: number;
      is_default?: boolean;
      safety_rating?: number;
    }) => {
      const { error } = await supabase
        .from('meetup_locations')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetup_locations'] });
    },
  });
}

export function useDeleteMeetupLocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('meetup_locations')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetup_locations'] });
    },
  });
}

// Find suggested meetup spots based on a general location
export function getSuggestedMeetupSpots(
  locations: MeetupLocation[],
  preferredTypes: string[] = ['police_station', 'bank', 'coffee_shop']
): MeetupLocation[] {
  // Prioritize locations by safety and preferred types
  return locations
    .filter((loc) => !loc.is_suggested || preferredTypes.includes(loc.location_type || ''))
    .sort((a, b) => {
      // Prioritize by safety rating
      if ((b.safety_rating || 0) !== (a.safety_rating || 0)) {
        return (b.safety_rating || 0) - (a.safety_rating || 0);
      }
      // Then by preferred type
      const aTypeIndex = preferredTypes.indexOf(a.location_type || '');
      const bTypeIndex = preferredTypes.indexOf(b.location_type || '');
      if (aTypeIndex !== -1 && bTypeIndex !== -1) {
        return aTypeIndex - bTypeIndex;
      }
      if (aTypeIndex !== -1) return -1;
      if (bTypeIndex !== -1) return 1;
      return 0;
    });
}

// Calculate distance between two coordinates (Haversine formula)
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3959; // Earth's radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Find nearest meetup locations to a given point
export function findNearestLocations(
  locations: MeetupLocation[],
  userLat: number,
  userLon: number,
  buyerLat?: number,
  buyerLon?: number,
  limit: number = 5
): (MeetupLocation & { distance: number; midpointDistance?: number })[] {
  const locationsWithDistance = locations
    .filter((loc) => loc.latitude && loc.longitude)
    .map((loc) => {
      const distanceFromUser = calculateDistance(
        userLat,
        userLon,
        loc.latitude!,
        loc.longitude!
      );

      let midpointDistance: number | undefined;
      if (buyerLat && buyerLon) {
        // Calculate distance from midpoint between user and buyer
        const midLat = (userLat + buyerLat) / 2;
        const midLon = (userLon + buyerLon) / 2;
        midpointDistance = calculateDistance(
          midLat,
          midLon,
          loc.latitude!,
          loc.longitude!
        );
      }

      return {
        ...loc,
        distance: distanceFromUser,
        midpointDistance,
      };
    });

  // Sort by midpoint distance if buyer location provided, otherwise by user distance
  return locationsWithDistance
    .sort((a, b) => {
      if (buyerLat && buyerLon) {
        return (a.midpointDistance || 0) - (b.midpointDistance || 0);
      }
      return a.distance - b.distance;
    })
    .slice(0, limit);
}
