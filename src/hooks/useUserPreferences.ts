import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
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
      if (!data) return null;
      // Cast Json columns to their typed interfaces
      return {
        ...data,
        custom_notification_tones: data.custom_notification_tones as unknown as CustomNotificationTone[] | null,
        workflow_settings: data.workflow_settings as unknown as WorkflowSettings | null,
      } as UserPreferences;
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

      // Strip out the strongly typed fields so we can replace them with Json versions
      const { custom_notification_tones, workflow_settings, ...restPreferences } = preferences;
      
      // Cast typed interfaces back to Json for Supabase
      const dbPreferences = {
        ...restPreferences,
        ...(custom_notification_tones !== undefined
          ? { custom_notification_tones: custom_notification_tones as unknown as Json }
          : {}),
        ...(workflow_settings !== undefined
          ? { workflow_settings: workflow_settings as unknown as Json }
          : {}),
      };

      if (existing) {
        const { data, error } = await supabase
          .from('user_preferences')
          .update(dbPreferences)
          .eq('user_id', user.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from('user_preferences')
          .insert({ user_id: user.id, ...dbPreferences })
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
