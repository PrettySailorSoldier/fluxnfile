import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { allocateFee, cents, type BundleRule, type MarkdownPhase, type PaymentMethod } from '@/lib/market';
import type { Item } from '@/hooks/useInventory';

/**
 * The market tables (20261106000000_market_selling.sql) aren't in the generated
 * Supabase types yet, so this file talks to them through an untyped client.
 * Row shapes are declared below instead.
 */
const db = supabase as unknown as SupabaseClient;

export type EventStatus = 'planned' | 'open' | 'closed';
export type { PaymentMethod };

export interface MarketEvent {
  id: string;
  team_id: string;
  name: string;
  event_date: string;
  location: string | null;
  booth_fee: number;
  other_costs: number;
  mileage_miles: number | null;
  start_time: string | null;
  end_time: string | null;
  weather: string | null;
  start_cash: number;
  counted_cash: number | null;
  status: EventStatus;
  verdict: 'book_again' | 'maybe' | 'skip' | null;
  notes: string | null;
  created_at: string;
}

export interface SaleLineRow {
  id: string;
  sale_id: string;
  item_id: string | null;
  tag_price: number | null;
  sold_price: number;
  prev_status: string | null;
  prev_actual_price: number | null;
  prev_sale_date: string | null;
  item?: Pick<
    Item,
    'id' | 'title' | 'original_cost' | 'refurbish_cost' | 'category_id' | 'tracking_number' | 'acquisition_date'
  > | null;
}

export interface SaleRow {
  id: string;
  team_id: string;
  event_id: string | null;
  sold_at: string;
  payment_method: PaymentMethod;
  discount_amount: number;
  tax_amount: number;
  fee_amount: number;
  total: number;
  bundle_label: string | null;
  notes: string | null;
  lines: SaleLineRow[];
}

export interface PhaseRow extends MarkdownPhase {
  id: string;
  event_id: string;
}

export interface BundleRuleRow extends BundleRule {
  team_id: string;
}

const num = (v: unknown): number => (v == null ? 0 : Number(v));

function normalizeEvent(r: Record<string, unknown>): MarketEvent {
  return {
    ...(r as unknown as MarketEvent),
    booth_fee: num(r.booth_fee),
    other_costs: num(r.other_costs),
    start_cash: num(r.start_cash),
    mileage_miles: r.mileage_miles == null ? null : Number(r.mileage_miles),
    counted_cash: r.counted_cash == null ? null : Number(r.counted_cash),
  };
}

function normalizeSale(r: Record<string, unknown>): SaleRow {
  const lines = ((r.lines as Record<string, unknown>[] | null) ?? []).map((l) => ({
    ...(l as unknown as SaleLineRow),
    sold_price: num(l.sold_price),
    tag_price: l.tag_price == null ? null : Number(l.tag_price),
    prev_actual_price: l.prev_actual_price == null ? null : Number(l.prev_actual_price),
    item: l.item
      ? {
          ...(l.item as SaleLineRow['item'] & object),
          original_cost: num((l.item as Record<string, unknown>).original_cost),
          refurbish_cost:
            (l.item as Record<string, unknown>).refurbish_cost == null
              ? null
              : Number((l.item as Record<string, unknown>).refurbish_cost),
        }
      : null,
  }));
  return {
    ...(r as unknown as SaleRow),
    discount_amount: num(r.discount_amount),
    tax_amount: num(r.tax_amount),
    fee_amount: num(r.fee_amount),
    total: num(r.total),
    lines,
  };
}

const SALE_SELECT =
  '*, lines:sale_lines(*, item:items(id, title, original_cost, refurbish_cost, category_id, tracking_number, acquisition_date))';

// ── Events ───────────────────────────────────────────────────────────────────

export function useEvents() {
  const { team } = useAuth();
  return useQuery({
    queryKey: ['events', team?.id],
    queryFn: async () => {
      if (!team?.id) return [];
      const { data, error } = await db
        .from('events')
        .select('*')
        .eq('team_id', team.id)
        .order('event_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(normalizeEvent);
    },
    enabled: !!team?.id,
  });
}

export function useEvent(id: string | undefined) {
  const { data: events, ...rest } = useEvents();
  return { ...rest, data: events?.find((e) => e.id === id) };
}

export type EventInput = Partial<Omit<MarketEvent, 'id' | 'team_id' | 'created_at'>> & { name: string };

export function useCreateEvent() {
  const { team, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: EventInput) => {
      if (!team?.id) throw new Error('No team');
      const { data, error } = await db
        .from('events')
        .insert({ ...input, team_id: team.id, created_by: user?.id ?? null })
        .select()
        .single();
      if (error) throw error;
      return normalizeEvent(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events'] }),
  });
}

export function useUpdateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<MarketEvent> & { id: string }) => {
      const { error } = await db.from('events').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events'] }),
  });
}

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('events').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events'] });
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: ['sales'] });
    },
  });
}

// ── Sales ────────────────────────────────────────────────────────────────────

/** Sales (with lines) for one event, or for every event when no id is given. Live-updates across devices. */
export function useSales(eventId?: string) {
  const { team } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!team?.id) return;
    const channel = supabase
      .channel(`sales-${team.id}-${eventId ?? 'all'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales', filter: `team_id=eq.${team.id}` }, () => {
        qc.invalidateQueries({ queryKey: ['sales'] });
        qc.invalidateQueries({ queryKey: ['items'] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [team?.id, eventId, qc]);

  return useQuery({
    queryKey: ['sales', team?.id, eventId ?? 'all'],
    queryFn: async () => {
      if (!team?.id) return [];
      let q = db.from('sales').select(SALE_SELECT).eq('team_id', team.id).order('sold_at', { ascending: true });
      if (eventId) q = q.eq('event_id', eventId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map(normalizeSale);
    },
    enabled: !!team?.id,
  });
}

export interface CompleteSaleInput {
  eventId: string | null;
  paymentMethod: PaymentMethod;
  lines: { item: Item; tag_price: number; sold_price: number }[];
  discount: number;
  tax: number;
  fee: number;
  total: number;
  bundleLabel: string | null;
  notes?: string;
}

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function useCompleteSale() {
  const { team, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CompleteSaleInput) => {
      if (!team?.id) throw new Error('No team');
      if (input.lines.length === 0) throw new Error('Nothing in the cart');

      const { data: sale, error: saleErr } = await db
        .from('sales')
        .insert({
          team_id: team.id,
          event_id: input.eventId,
          created_by: user?.id ?? null,
          payment_method: input.paymentMethod,
          discount_amount: input.discount,
          tax_amount: input.tax,
          fee_amount: input.fee,
          total: input.total,
          bundle_label: input.bundleLabel,
          notes: input.notes ?? null,
        })
        .select()
        .single();
      if (saleErr) throw saleErr;

      try {
        const { error: linesErr } = await db.from('sale_lines').insert(
          input.lines.map((l) => ({
            team_id: team.id,
            sale_id: sale.id,
            item_id: l.item.id,
            tag_price: l.tag_price,
            sold_price: l.sold_price,
            prev_status: l.item.status,
            prev_actual_price: l.item.actual_price,
            prev_sale_date: l.item.sale_date,
          }))
        );
        if (linesErr) throw linesErr;

        const fees = allocateFee(input.lines.map((l) => l.sold_price), input.fee);
        const saleDate = todayLocal();
        for (let i = 0; i < input.lines.length; i++) {
          const l = input.lines[i];
          const { error } = await db
            .from('items')
            .update({
              status: 'sold',
              actual_price: l.sold_price,
              sale_date: saleDate,
              channel_sold: 'market',
              platform_fees: cents((l.item.platform_fees ?? 0) + fees[i]),
            })
            .eq('id', l.item.id);
          if (error) throw error;
        }
      } catch (e) {
        // Nothing half-sold: remove the sale (lines cascade) and put any touched items back.
        await restoreItems(input.lines.map((l) => ({
          item_id: l.item.id,
          prev_status: l.item.status,
          prev_actual_price: l.item.actual_price,
          prev_sale_date: l.item.sale_date,
          prev_platform_fees: l.item.platform_fees,
        })));
        await db.from('sales').delete().eq('id', sale.id);
        throw e;
      }
      return sale.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

async function restoreItems(
  rows: { item_id: string | null; prev_status: string | null; prev_actual_price: number | null; prev_sale_date: string | null; prev_platform_fees?: number | null }[]
) {
  for (const r of rows) {
    if (!r.item_id || !r.prev_status) continue;
    await db
      .from('items')
      .update({
        status: r.prev_status,
        actual_price: r.prev_actual_price,
        sale_date: r.prev_sale_date,
        channel_sold: null,
        ...(r.prev_platform_fees !== undefined ? { platform_fees: r.prev_platform_fees } : {}),
      })
      .eq('id', r.item_id);
  }
}

/** Undo a sale: items go back to what they were, then the sale is removed. */
export function useUndoSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sale: SaleRow) => {
      // Fee was added to platform_fees at sale time; take the same share back off.
      const fees = allocateFee(sale.lines.map((l) => l.sold_price), sale.fee_amount);
      for (let i = 0; i < sale.lines.length; i++) {
        const l = sale.lines[i];
        if (!l.item_id || !l.prev_status) continue;
        const { data: cur } = await db.from('items').select('platform_fees').eq('id', l.item_id).maybeSingle();
        const restoredFees = cents(Math.max(0, num(cur?.platform_fees) - fees[i]));
        await restoreItems([{ ...l, item_id: l.item_id, prev_platform_fees: restoredFees || null }]);
      }
      const { error } = await db.from('sales').delete().eq('id', sale.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

// ── Markdown phases ──────────────────────────────────────────────────────────

export function usePhases(eventId: string | undefined) {
  return useQuery({
    queryKey: ['markdown_phases', eventId],
    queryFn: async () => {
      const { data, error } = await db.from('markdown_phases').select('*').eq('event_id', eventId).order('starts_at');
      if (error) throw error;
      return (data ?? []).map((p) => ({ ...p, percent_off: num(p.percent_off) })) as PhaseRow[];
    },
    enabled: !!eventId,
  });
}

/** Replace an event's phases wholesale. */
export function useSavePhases(eventId: string | undefined) {
  const { team } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (phases: MarkdownPhase[]) => {
      if (!team?.id || !eventId) throw new Error('No event');
      const { error: delErr } = await db.from('markdown_phases').delete().eq('event_id', eventId);
      if (delErr) throw delErr;
      if (phases.length === 0) return;
      const { error } = await db.from('markdown_phases').insert(
        phases.map((p) => ({
          team_id: team.id,
          event_id: eventId,
          label: p.label,
          starts_at: p.starts_at,
          percent_off: p.percent_off,
        }))
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['markdown_phases', eventId] }),
  });
}

// ── Bundle rules ─────────────────────────────────────────────────────────────

export function useBundleRules() {
  const { team } = useAuth();
  return useQuery({
    queryKey: ['bundle_rules', team?.id],
    queryFn: async () => {
      if (!team?.id) return [];
      const { data, error } = await db.from('bundle_rules').select('*').eq('team_id', team.id).order('created_at');
      if (error) throw error;
      return (data ?? []).map((r) => ({
        ...r,
        max_item_price: r.max_item_price == null ? null : Number(r.max_item_price),
        bundle_price: num(r.bundle_price),
      })) as BundleRuleRow[];
    },
    enabled: !!team?.id,
  });
}

export function useSaveBundleRule() {
  const { team } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rule: Partial<BundleRuleRow> & Pick<BundleRuleRow, 'name' | 'quantity' | 'bundle_price'>) => {
      if (!team?.id) throw new Error('No team');
      const { id, ...rest } = rule;
      const { error } = id
        ? await db.from('bundle_rules').update(rest).eq('id', id)
        : await db.from('bundle_rules').insert({ ...rest, team_id: team.id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bundle_rules'] }),
  });
}

export function useDeleteBundleRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('bundle_rules').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bundle_rules'] }),
  });
}

// ── Bring list / packing / leftovers ─────────────────────────────────────────

/** Pack (eventId) or unpack (null) items for an event. */
export function usePackItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemIds, eventId }: { itemIds: string[]; eventId: string | null }) => {
      for (let i = 0; i < itemIds.length; i += 100) {
        const { error } = await db
          .from('items')
          .update({ packed_for_event_id: eventId })
          .in('id', itemIds.slice(i, i + 100));
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['items'] }),
  });
}

/** Save tag / floor prices for many items at once. */
export function useSetMarketPrices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: { id: string; tag_price?: number | null; floor_price?: number | null }[]) => {
      for (const { id, ...patch } of rows) {
        const { error } = await db.from('items').update(patch).eq('id', id);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['items'] }),
  });
}

export type LeftoverAction = 'keep' | 'markdown' | 'list_online' | 'donate';

/**
 * Route unsold items after a market. 'keep' leaves them packed for the next event;
 * 'markdown' cuts the tag by `markdownPercent` (never below the floor);
 * 'list_online' unpacks and queues for listing; 'donate' unpacks and flags.
 */
export function useRouteLeftovers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      items,
      action,
      markdownPercent = 20,
      roundStep = 1,
      discount,
    }: {
      items: Item[];
      action: LeftoverAction;
      markdownPercent?: number;
      roundStep?: 1 | 5;
      discount: (tag: number, pct: number, floor: number | null, step: 1 | 5) => number;
    }) => {
      for (const it of items) {
        let patch: Record<string, unknown> = {};
        if (action === 'keep') patch = {};
        else if (action === 'markdown') {
          const tag = it.tag_price ?? it.target_price;
          if (!tag) continue;
          patch = { tag_price: discount(tag, markdownPercent, it.floor_price ?? null, roundStep) };
        } else if (action === 'list_online') {
          patch = { packed_for_event_id: null, status: it.status === 'listed' ? 'listed' : 'ready_to_list' };
        } else if (action === 'donate') {
          patch = { packed_for_event_id: null, flagged_for: 'donate', flag_note: 'Leftover from a market — donate' };
        }
        if (Object.keys(patch).length === 0) continue;
        const { error } = await db.from('items').update(patch).eq('id', it.id);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['items'] }),
  });
}

/** Close an event: lock it, count one more market attempt for every unsold packed item. */
export function useCloseEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ eventId, unsold, countedCash, verdict }: {
      eventId: string;
      unsold: Item[];
      countedCash: number | null;
      verdict: MarketEvent['verdict'];
    }) => {
      const { error } = await db
        .from('events')
        .update({ status: 'closed', counted_cash: countedCash, verdict })
        .eq('id', eventId);
      if (error) throw error;
      for (const it of unsold) {
        const { error: e } = await db
          .from('items')
          .update({ market_attempts: (it.market_attempts ?? 0) + 1 })
          .eq('id', it.id);
        if (e) throw e;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events'] });
      qc.invalidateQueries({ queryKey: ['items'] });
    },
  });
}
