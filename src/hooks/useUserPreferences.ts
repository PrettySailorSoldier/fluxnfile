import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface CustomNotificationTone {
  id: string;
  name: string;
  url: string;
}

export interface WorkflowSettings {
  // ── IMPORT DEFAULTS ─────────────────────────────────
  defaultMarkupPercent: number;
  skipZeroEtvItems: boolean;
  skipCancellations: boolean;
  autoSelectAll: boolean;
  defaultAcquisitionSource: string;

  // ── PRICING ─────────────────────────────────────────
  minimumMarginPercent: number;
  defaultPlatformFeePercent: number;
  roundPricesToNinetyNine: boolean;

  // ── INVENTORY BEHAVIOR ───────────────────────────────
  defaultSortOrder:
    | 'newest'
    | 'oldest'
    | 'value_high'
    | 'value_low'
    | 'review_urgent'
    | 'title_az';
  showSwipeHint: boolean;
  staleDaysThreshold: number;
  repriceDaysThreshold: number;

  // ── REVIEW WORKFLOW ──────────────────────────────────
  reviewReminderDays: number;
  primaryReviewer: string;
  showReviewUrgency: boolean;

  // ── SCANNING ─────────────────────────────────────────
  scanAutoOpenEdit: boolean;
  scanHapticFeedback: boolean;

  // ── NOTIFICATIONS ────────────────────────────────────
  notifyStaleListings: boolean;
  notifyPendingReviews: boolean;
}

export const DEFAULT_WORKFLOW_SETTINGS: WorkflowSettings = {
  defaultMarkupPercent: 130,
  skipZeroEtvItems: true,
  skipCancellations: true,
  autoSelectAll: true,
  defaultAcquisitionSource: 'Vine',
  minimumMarginPercent: 20,
  defaultPlatformFeePercent: 13,
  roundPricesToNinetyNine: true,
  defaultSortOrder: 'newest',
  showSwipeHint: true,
  staleDaysThreshold: 30,
  repriceDaysThreshold: 14,
  reviewReminderDays: 3,
  primaryReviewer: 'grant',
  showReviewUrgency: true,
  scanAutoOpenEdit: true,
  scanHapticFeedback: true,
  notifyStaleListings: true,
  notifyPendingReviews: true,
};

export interface UserPreferences {
  id: string;
  user_id: string;
  background_image_url: string | null;
  primary_color: string | null;
  accent_color: string | null;
  text_color: string | null;
  notification_tone: string | null;
  notification_volume: number | null;
  custom_notification_tones: CustomNotificationTone[] | null;
  workflow_settings: WorkflowSettings | null;
  created_at: string;
  updated_at: string;
}

export function useUserPreferences() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['user-preferences', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const { data, error } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      return data as UserPreferences | null;
    },
    enabled: !!user?.id,
  });
}

export function useUpdateUserPreferences() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (preferences: Partial<Omit<UserPreferences, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { data: existing } = await supabase
        .from('user_preferences')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        const { data, error } = await supabase
          .from('user_preferences')
          .update(preferences as any)
          .eq('user_id', user.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from('user_preferences')
          .insert({ user_id: user.id, ...(preferences as any) })
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-preferences'] });
    },
  });
}

export function useWorkflowSettings(): WorkflowSettings {
  const { data: prefs } = useUserPreferences();

  if (!prefs?.workflow_settings) {
    return DEFAULT_WORKFLOW_SETTINGS;
  }

  return {
    ...DEFAULT_WORKFLOW_SETTINGS,
    ...prefs.workflow_settings,
  };
}

export function useUpdateWorkflowSettings() {
  const updatePrefs = useUpdateUserPreferences();
  const current = useWorkflowSettings();

  return useMutation({
    mutationFn: async (updates: Partial<WorkflowSettings>) => {
      const merged = { ...current, ...updates };
      return updatePrefs.mutateAsync({
        workflow_settings: merged as any,
      });
    },
  });
}
