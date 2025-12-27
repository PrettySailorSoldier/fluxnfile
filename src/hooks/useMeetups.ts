import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type MeetupStatus = 'scheduled' | 'in_progress' | 'completed' | 'no_show' | 'cancelled' | 'declined';
export type CheckinType = 'meeting_now' | 'safe' | 'help_needed';

export interface Meetup {
  id: string;
  item_id: string;
  team_id: string;
  offer_id: string | null;
  meetup_location_id: string | null;
  custom_location: string | null;
  custom_latitude: number | null;
  custom_longitude: number | null;
  scheduled_at: string;
  buyer_name: string | null;
  buyer_contact: string | null;
  agreed_price: number | null;
  status: MeetupStatus;
  partner_notified: boolean;
  meeting_started_at: string | null;
  safe_checkin_at: string | null;
  completed_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  meetup_location?: {
    id: string;
    name: string;
    address: string | null;
    location_type: string | null;
    latitude: number | null;
    longitude: number | null;
  } | null;
  item?: {
    id: string;
    title: string | null;
    photos: string[] | null;
  } | null;
}

export interface SafetyCheckin {
  id: string;
  meetup_id: string;
  team_id: string;
  user_id: string;
  checkin_type: CheckinType;
  latitude: number | null;
  longitude: number | null;
  message: string | null;
  created_at: string;
}

export const meetupStatusLabels: Record<MeetupStatus, string> = {
  scheduled: 'Scheduled',
  in_progress: 'Meeting Now',
  completed: 'Sold',
  no_show: 'No Show',
  cancelled: 'Cancelled',
  declined: 'Declined',
};

export const meetupStatusColors: Record<MeetupStatus, string> = {
  scheduled: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
  in_progress: 'bg-orange-500/10 text-orange-600 border-orange-500/30',
  completed: 'bg-green-500/10 text-green-600 border-green-500/30',
  no_show: 'bg-red-500/10 text-red-600 border-red-500/30',
  cancelled: 'bg-gray-500/10 text-gray-600 border-gray-500/30',
  declined: 'bg-red-500/10 text-red-600 border-red-500/30',
};

export function useMeetups(itemId?: string) {
  const { team } = useAuth();

  return useQuery({
    queryKey: ['meetups', team?.id, itemId],
    queryFn: async () => {
      if (!team?.id) return [];

      let query = supabase
        .from('meetups')
        .select(`
          *,
          meetup_location:meetup_locations(id, name, address, location_type, latitude, longitude),
          item:items(id, title, photos)
        `)
        .eq('team_id', team.id)
        .order('scheduled_at', { ascending: true });

      if (itemId) {
        query = query.eq('item_id', itemId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as Meetup[];
    },
    enabled: !!team?.id,
  });
}

export function useUpcomingMeetups() {
  const { team } = useAuth();

  return useQuery({
    queryKey: ['meetups', 'upcoming', team?.id],
    queryFn: async () => {
      if (!team?.id) return [];

      const { data, error } = await supabase
        .from('meetups')
        .select(`
          *,
          meetup_location:meetup_locations(id, name, address, location_type, latitude, longitude),
          item:items(id, title, photos)
        `)
        .eq('team_id', team.id)
        .in('status', ['scheduled', 'in_progress'])
        .gte('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(10);

      if (error) throw error;
      return data as Meetup[];
    },
    enabled: !!team?.id,
  });
}

export function useCreateMeetup() {
  const queryClient = useQueryClient();
  const { team, user } = useAuth();

  return useMutation({
    mutationFn: async (meetup: {
      item_id: string;
      offer_id?: string;
      meetup_location_id?: string;
      custom_location?: string;
      custom_latitude?: number;
      custom_longitude?: number;
      scheduled_at: string;
      buyer_name?: string;
      buyer_contact?: string;
      agreed_price?: number;
      notes?: string;
    }) => {
      if (!team?.id) throw new Error('No team');

      const { data, error } = await supabase
        .from('meetups')
        .insert({
          team_id: team.id,
          created_by: user?.id,
          ...meetup,
        })
        .select(`
          *,
          meetup_location:meetup_locations(id, name, address, location_type, latitude, longitude)
        `)
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetups'] });
    },
  });
}

export function useUpdateMeetup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: {
      id: string;
      meetup_location_id?: string;
      custom_location?: string;
      custom_latitude?: number;
      custom_longitude?: number;
      scheduled_at?: string;
      buyer_name?: string;
      buyer_contact?: string;
      agreed_price?: number;
      status?: MeetupStatus;
      partner_notified?: boolean;
      meeting_started_at?: string;
      safe_checkin_at?: string;
      completed_at?: string;
      notes?: string;
    }) => {
      const { error } = await supabase
        .from('meetups')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetups'] });
    },
  });
}

export function useDeleteMeetup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('meetups').delete().eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetups'] });
    },
  });
}

// Safety check-in hooks
export function useSafetyCheckins(meetupId: string) {
  const { team } = useAuth();

  return useQuery({
    queryKey: ['safety_checkins', meetupId],
    queryFn: async () => {
      if (!team?.id) return [];

      const { data, error } = await supabase
        .from('safety_checkins')
        .select('*')
        .eq('meetup_id', meetupId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as SafetyCheckin[];
    },
    enabled: !!team?.id && !!meetupId,
  });
}

export function useCreateSafetyCheckin() {
  const queryClient = useQueryClient();
  const { team, user } = useAuth();

  return useMutation({
    mutationFn: async (checkin: {
      meetup_id: string;
      checkin_type: CheckinType;
      latitude?: number;
      longitude?: number;
      message?: string;
    }) => {
      if (!team?.id || !user?.id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('safety_checkins')
        .insert({
          team_id: team.id,
          user_id: user.id,
          ...checkin,
        })
        .select()
        .single();

      if (error) throw error;

      // Update the meetup with the check-in time
      if (checkin.checkin_type === 'meeting_now') {
        await supabase
          .from('meetups')
          .update({
            status: 'in_progress',
            meeting_started_at: new Date().toISOString(),
          })
          .eq('id', checkin.meetup_id);
      } else if (checkin.checkin_type === 'safe') {
        await supabase
          .from('meetups')
          .update({
            safe_checkin_at: new Date().toISOString(),
          })
          .eq('id', checkin.meetup_id);
      }

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['safety_checkins', variables.meetup_id] });
      queryClient.invalidateQueries({ queryKey: ['meetups'] });
    },
  });
}

// Helper to get current location
export async function getCurrentLocation(): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      () => {
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

// Generate Google Maps link for a location
export function getGoogleMapsLink(lat: number, lon: number, label?: string): string {
  const query = label ? encodeURIComponent(label) : `${lat},${lon}`;
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

// Generate share location link (for native share)
export function getShareLocationLink(lat: number, lon: number): string {
  return `https://www.google.com/maps?q=${lat},${lon}`;
}
