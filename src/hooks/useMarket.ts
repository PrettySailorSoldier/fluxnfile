import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { allocateFee, cents, type BundleRule, type MarkdownPhase, type PaymentMethod } from '@/lib/market';
import type { Item } from '@/hooks/useInventory';
import { notifyTeammates } from '@/hooks/useTeam';
import { todayLocal } from '@/lib/dates';
import { toast } from 'sonner';
import {
  dequeueSale,
  enqueueSale,
  isNetworkError,
  newClientId,
  onQueueChange,
  pendingSales,
  type QueuedSale,
} from '@/lib/saleQueue';
import { sanitizeError } from '@/lib/errorHandler';

/**
 * The market tables (20261106000000_market_selling.sql) aren't in the generated
 * Supabase types yet, so this file talks to them through an untyped client.
 * Row shapes are declared below instead.
 */
const db = supabase as unknown as SupabaseClient;

/** `sales.channel` for anything rung up at a market table */
export const MARKET_CHANNEL = 'market';

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
  /** What it was, when the line isn't an inventory item (quick sale) */
  description?: string | null;
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
  /** Who rang it up */
  created_by?: string | null;
  /** 'market' or a platform name */
  channel: string;
  buyer_name?: string | null;
  shipping_cost: number;
  /** Local calendar day of the sale (older rows only have sold_at) */
  sale_date?: string | null;
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
    shipping_cost: num(r.shipping_cost),
    // Databases without the unified-sales migration only hold market sales
    channel: (r.channel as string | null | undefined) || MARKET_CHANNEL,
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
  // Live updates come from useTeamRealtime (mounted once in AppLayout). A channel per
  // hook would clash when two screens on the same route both read sales.
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

/** One thing in a sale. `item: null` is a quick sale of something that was never in inventory. */
export interface SaleLineInput {
  item: Item | null;
  /** What it was, for lines without an inventory item */
  description?: string;
  tag_price: number | null;
  sold_price: number;
}

export interface RecordSaleInput {
  /** The market this sale belongs to; null for everything sold elsewhere */
  eventId: string | null;
  /** 'market', or the platform's name ("Facebook Marketplace", "eBay", …) */
  channel: string;
  paymentMethod: PaymentMethod;
  lines: SaleLineInput[];
  discount: number;
  tax: number;
  /** Selling / processing fees for the whole sale */
  fee: number;
  /** What shipping cost you (not what the buyer paid) */
  shipping?: number;
  /** Charged to the buyer */
  total: number;
  bundleLabel: string | null;
  notes?: string;
  buyerName?: string;
  /** 'YYYY-MM-DD' — defaults to today, local time */
  saleDate?: string;
}

/** @deprecated use RecordSaleInput */
export type CompleteSaleInput = RecordSaleInput;

/** True when the database doesn't have the function yet (migration 20261110000000 not applied). */
function isMissingFunction(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  return e?.code === 'PGRST202' || e?.code === '42883' || /could not find the function/i.test(e?.message ?? '');
}

/**
 * Record a sale from anywhere — a market table, a Facebook meetup, an eBay order.
 * One database transaction: the sale, its lines and the items change together,
 * and an item a teammate already sold is refused.
 */
export async function recordSale(teamId: string, userId: string | null, input: RecordSaleInput): Promise<string> {
  if (input.lines.length === 0) throw new Error('Nothing to sell');
  const prices = input.lines.map((l) => l.sold_price);
  const fees = allocateFee(prices, input.fee);
  const shipping = allocateFee(prices, input.shipping ?? 0);
  const saleDate = input.saleDate || todayLocal();

  const clientId = newClientId();
  const payload = {
      client_id: clientId,
      team_id: teamId,
      event_id: input.eventId,
      channel: input.channel,
      payment_method: input.paymentMethod,
      discount: input.discount,
      tax: input.tax,
      fee: input.fee,
      shipping: input.shipping ?? 0,
      total: input.total,
      bundle_label: input.bundleLabel,
      notes: input.notes ?? null,
      buyer_name: input.buyerName ?? null,
      sale_date: saleDate,
      lines: input.lines.map((l, i) => ({
        item_id: l.item?.id ?? null,
        description: l.item ? null : l.description ?? null,
        tag_price: l.tag_price,
        sold_price: l.sold_price,
        fee: fees[i],
        shipping: shipping[i],
      })),
  };

  const { data, error } = await db.rpc('record_sale', { p: payload });
  if (!error) return data as string;
  if (isNetworkError(error)) {
    // No signal: keep the sale on this phone and send it when the connection is back
    const first = input.lines[0];
    const queued = enqueueSale({
      clientId,
      teamId,
      queuedAt: new Date().toISOString(),
      label: `${(first.item?.title || first.description || 'Sale').slice(0, 40)}${input.lines.length > 1 ? ` +${input.lines.length - 1}` : ''} · $${input.total.toFixed(2)}`,
      payload,
    });
    if (!queued) throw error;
    return `queued:${clientId}`;
  }
  if (!isMissingFunction(error)) throw error;
  return recordSaleLegacy(teamId, userId, input, fees, shipping, saleDate);
}

export const isQueuedSaleId = (id: string | undefined | null): boolean => !!id && id.startsWith('queued:');

/** Send every sale that was waiting for a connection. Safe to call often and from several places. */
let flushing = false;
export async function flushSaleQueue(teamId?: string): Promise<{ sent: number; dropped: number; left: number }> {
  const result = { sent: 0, dropped: 0, left: 0 };
  if (flushing) return result;
  flushing = true;
  try {
    for (const sale of pendingSales(teamId)) {
      const { error } = await db.rpc('record_sale', { p: sale.payload });
      if (!error) {
        dequeueSale(sale.clientId);
        result.sent += 1;
      } else if (isNetworkError(error) || isMissingFunction(error)) {
        // Still offline, or the database isn't updated yet — keep the rest, in order
        break;
      } else {
        // The server refused it (e.g. a teammate sold the item first). It will never succeed.
        dequeueSale(sale.clientId);
        result.dropped += 1;
        toast.error(`Couldn't sync “${sale.label}”: ${sanitizeError(error)}`, { duration: 15000 });
      }
    }
  } finally {
    flushing = false;
    result.left = pendingSales(teamId).length;
  }
  return result;
}

/** How many sales are waiting on this phone for a connection. */
export function usePendingSaleCount(): number {
  const { team } = useAuth();
  const [n, setN] = useState(() => pendingSales(team?.id).length);
  useEffect(() => {
    const update = () => setN(pendingSales(team?.id).length);
    update();
    return onQueueChange(update);
  }, [team?.id]);
  return n;
}

export type { QueuedSale };

/** Mount once: sends waiting sales whenever the phone is back online or comes to the foreground. */
export function useSaleQueueSync() {
  const { team } = useAuth();
  const qc = useQueryClient();
  useEffect(() => {
    if (!team?.id) return;
    const run = async () => {
      if (pendingSales(team.id).length === 0) return;
      const r = await flushSaleQueue(team.id);
      if (r.sent > 0) {
        toast.success(`${r.sent} offline sale${r.sent === 1 ? '' : 's'} synced`);
        qc.invalidateQueries({ queryKey: ['sales'] });
        qc.invalidateQueries({ queryKey: ['items'] });
      } else if (r.dropped > 0) {
        qc.invalidateQueries({ queryKey: ['items'] });
      }
    };
    void run();
    const timer = setInterval(run, 30_000);
    const onVisible = () => document.visibilityState === 'visible' && void run();
    window.addEventListener('online', run);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', run);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [team?.id, qc]);
}

/**
 * Before the unified-sales migration is applied: several separate writes from the
 * phone. Market sales still reach the ledger; sales made elsewhere only update the item.
 */
async function recordSaleLegacy(
  teamId: string,
  userId: string | null,
  input: RecordSaleInput,
  fees: number[],
  shipping: number[],
  saleDate: string
): Promise<string> {
  const isMarket = input.channel === MARKET_CHANNEL;
  const itemLines = input.lines.filter((l) => l.item);

  // Someone else may have sold these since this phone last synced
  if (itemLines.length > 0) {
    const { data: fresh, error } = await db
      .from('items')
      .select('id, title, status')
      .in('id', itemLines.map((l) => l.item!.id));
    if (error) throw error;
    const gone = (fresh ?? []).find((r) => r.status === 'sold' || r.status === 'shipped');
    if (gone) throw new Error(`ALREADY_SOLD: "${(gone.title ?? 'An item').slice(0, 60)}" was already sold`);
  }

  const snapshot = itemLines.map((l) => ({
    item_id: l.item!.id,
    prev_status: l.item!.status,
    prev_actual_price: l.item!.actual_price,
    prev_sale_date: l.item!.sale_date,
    prev_platform_fees: l.item!.platform_fees,
    prev_shipping_cost: l.item!.shipping_cost,
  }));

  let saleId = '';
  if (isMarket) {
    const { data: sale, error: saleErr } = await db
      .from('sales')
      .insert({
        team_id: teamId,
        event_id: input.eventId,
        created_by: userId,
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
    saleId = sale.id as string;
  }

  try {
    if (saleId) {
      const { error: linesErr } = await db.from('sale_lines').insert(
        input.lines.map((l) => ({
          team_id: teamId,
          sale_id: saleId,
          item_id: l.item?.id ?? null,
          tag_price: l.tag_price,
          sold_price: l.sold_price,
          prev_status: l.item?.status ?? null,
          prev_actual_price: l.item?.actual_price ?? null,
          prev_sale_date: l.item?.sale_date ?? null,
        }))
      );
      if (linesErr) throw linesErr;
    }

    for (let i = 0; i < input.lines.length; i++) {
      const l = input.lines[i];
      if (!l.item) continue;
      const { error } = await db
        .from('items')
        .update({
          status: 'sold',
          actual_price: l.sold_price,
          sale_date: saleDate,
          // The old column only accepts these two values
          channel_sold: isMarket ? 'market' : 'online',
          platform_fees: cents((l.item.platform_fees ?? 0) + fees[i]),
          shipping_cost: cents((l.item.shipping_cost ?? 0) + shipping[i]),
        })
        .eq('id', l.item.id);
      if (error) throw error;
    }
  } catch (e) {
    // Nothing half-sold: put any touched items back and remove the sale (lines cascade).
    await restoreItems(snapshot);
    if (saleId) await db.from('sales').delete().eq('id', saleId);
    throw e;
  }
  return saleId;
}

export function useRecordSale() {
  const { team, user, profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RecordSaleInput) => {
      if (!team?.id) throw new Error('No team');
      const id = await recordSale(team.id, user?.id ?? null, input);

      if (isQueuedSaleId(id)) {
        toast.info('No signal — sale saved on this phone. It will sync when you’re back online.', { duration: 8000 });
        const sold = new Map(input.lines.filter((l) => l.item).map((l) => [l.item!.id, l.sold_price]));
        const saleDate = input.saleDate || todayLocal();
        qc.setQueriesData<Item[]>({ queryKey: ['items', team.id] }, (old) =>
          Array.isArray(old)
            ? old.map((it) =>
                sold.has(it.id)
                  ? { ...it, status: 'sold', actual_price: sold.get(it.id)!, sale_date: saleDate, channel_sold: input.channel }
                  : it
              )
            : old
        );
        return id;
      }

      // At a market the partner watches sales ring up live; anywhere else, tell them.
      if (input.channel !== MARKET_CHANNEL && user?.id) {
        const first = input.lines[0];
        const what = (first.item?.title || first.description || 'an item').slice(0, 60);
        const more = input.lines.length > 1 ? ` + ${input.lines.length - 1} more` : '';
        void notifyTeammates(team.id, user.id, {
          type: 'item_sold',
          title: `Sold on ${input.channel} · $${input.total.toFixed(2)}`,
          message: `${profile?.full_name || 'Your teammate'} sold “${what}”${more}${input.buyerName ? ` to ${input.buyerName}` : ''}`,
          link: input.lines.length === 1 && first.item ? `/item/${first.item.id}` : '/analytics',
        });
      }
      return id;
    },
    onSettled: (id) => {
      // Offline: keep the optimistic list; there's nothing to fetch yet
      if (isQueuedSaleId(id)) return;
      // Also after a failure: "already sold" means this phone's list is out of date
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: ['item'] });
    },
  });
}

/** Market-day name for {@link useRecordSale}. */
export const useCompleteSale = useRecordSale;

async function restoreItems(
  rows: {
    item_id: string | null;
    prev_status: string | null;
    prev_actual_price: number | null;
    prev_sale_date: string | null;
    prev_platform_fees?: number | null;
    prev_shipping_cost?: number | null;
  }[]
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
        ...(r.prev_shipping_cost !== undefined ? { shipping_cost: r.prev_shipping_cost } : {}),
      })
      .eq('id', r.item_id);
  }
}

/** Undo a sale: items go back to what they were, then the sale is removed. */
export function useUndoSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sale: SaleRow) => {
      const { error: rpcErr } = await db.rpc('undo_sale', { p_sale_id: sale.id });
      if (!rpcErr) return;
      if (!isMissingFunction(rpcErr)) throw rpcErr;

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
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: ['item'] });
    },
  });
}

/**
 * Put a sold item back in stock (it didn't sell after all, or was marked by mistake).
 * Its entry in the sales ledger goes too, so the books don't keep a sale that never happened.
 */
export async function unsellItem(itemId: string, newStatus: string): Promise<void> {
  const { data: lines } = await db.from('sale_lines').select('id, sale_id, sold_price').eq('item_id', itemId);
  for (const line of lines ?? []) {
    const { count } = await db
      .from('sale_lines')
      .select('id', { count: 'exact', head: true })
      .eq('sale_id', line.sale_id);
    if ((count ?? 0) <= 1) {
      // The whole sale was this item
      const { error } = await db.rpc('undo_sale', { p_sale_id: line.sale_id });
      if (error) await db.from('sales').delete().eq('id', line.sale_id);
    } else {
      // One line of a bigger sale: take it out and shrink the total
      const { data: sale } = await db.from('sales').select('total').eq('id', line.sale_id).maybeSingle();
      await db.from('sale_lines').delete().eq('id', line.id);
      if (sale) {
        await db
          .from('sales')
          .update({ total: cents(Math.max(0, num(sale.total) - num(line.sold_price))) })
          .eq('id', line.sale_id);
      }
    }
  }
  const { error } = await db
    .from('items')
    .update({ status: newStatus, actual_price: null, sale_date: null, channel_sold: null })
    .eq('id', itemId);
  if (error) throw error;
}

export function useUnsellItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, status }: { itemId: string; status: string }) => unsellItem(itemId, status),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: ['item'] });
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

/**
 * Close an event: lock it, count one more market attempt for every unsold packed item.
 * Reopening takes that attempt back off (see {@link useReopenEvent}), so closing,
 * reopening and closing again counts each market once.
 */
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

/** Reopen a closed event and take back the attempt that closing it counted. */
export function useReopenEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ eventId, unsold }: { eventId: string; unsold: Item[] }) => {
      const { error } = await db.from('events').update({ status: 'open' }).eq('id', eventId);
      if (error) throw error;
      for (const it of unsold) {
        if ((it.market_attempts ?? 0) <= 0) continue;
        const { error: e } = await db
          .from('items')
          .update({ market_attempts: (it.market_attempts ?? 0) - 1 })
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
