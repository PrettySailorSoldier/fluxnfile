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

  // ── MARKET DAY ───────────────────────────────────────
  /** Sticker = floor × (1 + buffer). Research range 15–25. */
  marketTagBufferPercent: number;
  /** Market tags use clean round numbers instead of .99 */
  marketRoundStep: 1 | 5;
  /** Your card reader's rate (e.g. Square ≈ 2.6% + 10¢ in person — check yours) */
  marketCardFeePercent: number;
  marketCardFeeFlat: number;
  /** Venmo / Cash App fee; 0 for personal transfers */
  marketAppFeePercent: number;
  /** 0 = don't add tax at the register */
  marketSalesTaxPercent: number;
  /** Sticker prices already include tax */
  marketTaxIncluded: boolean;
  /** Profit/hour at or above this (and ≥3× booth fee) suggests "Book again" */
  marketGoodProfitPerHour: number;
  /** Below this suggests "Skip" */
  marketMinProfitPerHour: number;
  /** Set-aside for taxes, as a percent of net profit (rough starting point) */
  marketTaxSetAsidePercent: number;
  /** IRS standard mileage rate per mile, for the mileage deduction estimate */
  marketMileageRate: number;

  // ── NAVIGATION ───────────────────────────────────────
  /** Ids of the bottom-bar tabs, in order (see lib/navConfig). Unset = defaults. */
  navTabs?: string[];

  // ── ONLINE & DIGITAL PAYMENTS ────────────────────────
  /** Team Venmo handle (without @) */
  venmoHandle?: string;
  /** Team Cash App cashtag (without $) */
  cashAppTag?: string;
  /** Team PayPal username or paypal.me name */
  paypalUsername?: string;
  /** Team Zelle email or phone */
  zelleContact?: string;
  /** Optional Stripe / custom payment link */
  stripePaymentLink?: string;
  /** Default shipping fee for online orders */
  defaultShippingCost?: number;
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
  marketTagBufferPercent: 20,
  marketRoundStep: 1,
  marketCardFeePercent: 2.6,
  marketCardFeeFlat: 0.1,
  marketAppFeePercent: 0,
  marketSalesTaxPercent: 0,
  marketTaxIncluded: false,
  marketGoodProfitPerHour: 20,
  marketMinProfitPerHour: 8,
  marketTaxSetAsidePercent: 25,
  // Update each year — this is the 2025 IRS business rate; confirm for the current year
  marketMileageRate: 0.7,
};

export interface BackgroundSettings {
  zoom: number;
  positionX: number;
  positionY: number;
}

export type ThemeMode = 'light' | 'dark' | 'system';

export interface UserPreferences {
  id: string;
  user_id: string;
  background_image_url: string | null;
  primary_color: string | null;
  accent_color: string | null;
  text_color: string | null;
  background_settings?: BackgroundSettings | null;
  theme_mode?: ThemeMode | null;
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
      const row = data as any;
      const wf = row.workflow_settings as WorkflowSettings | null;
      // Cast Json columns to their typed interfaces, checking both column and fallback workflow_settings
      return {
        ...row,
        background_settings: (row.background_settings ?? (wf as any)?.background_settings ?? null) as BackgroundSettings | null,
        theme_mode: (row.theme_mode ?? (wf as any)?.theme_mode ?? null) as ThemeMode | null,
        custom_notification_tones: row.custom_notification_tones as unknown as CustomNotificationTone[] | null,
        workflow_settings: wf,
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
        .select('id, workflow_settings')
        .eq('user_id', user.id)
        .maybeSingle();

      // Strip out the strongly typed fields so we can replace them with Json versions
      const { custom_notification_tones, workflow_settings, background_settings, theme_mode, ...restPreferences } = preferences;
      
      const existingWf = ((existing as any)?.workflow_settings as Record<string, unknown>) || {};
      const updatedWf = {
        ...existingWf,
        ...(workflow_settings || {}),
        ...(background_settings !== undefined ? { background_settings } : {}),
        ...(theme_mode !== undefined ? { theme_mode } : {}),
      };

      // Cast typed interfaces back to Json for Supabase
      const dbPreferences: Record<string, unknown> = {
        ...restPreferences,
        ...(background_settings !== undefined ? { background_settings } : {}),
        ...(theme_mode !== undefined ? { theme_mode } : {}),
        ...(custom_notification_tones !== undefined
          ? { custom_notification_tones: custom_notification_tones as unknown as Json }
          : {}),
        workflow_settings: updatedWf,
      };

      if (existing) {
        const { data, error } = await (supabase as any)
          .from('user_preferences')
          .update(dbPreferences)
          .eq('user_id', user.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        const { data, error } = await (supabase as any)
          .from('user_preferences')
          .insert({ user_id: user.id, ...dbPreferences })
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-preferences', user?.id] });
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
