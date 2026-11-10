/**
 * Sales analytics over every channel: markets, Facebook Marketplace, eBay, anywhere.
 * Pure — the Analytics page feeds it items (every sold item, whatever the channel)
 * and ledger sales (to pick up quick sales that were never inventory items).
 */
import { parseLocalDate } from '@/lib/dates';
import { cents } from '@/lib/market';

export interface SoldItem {
  id: string;
  actual_price: number | null;
  target_price: number | null;
  original_cost: number;
  refurbish_cost: number | null;
  shipping_cost: number | null;
  platform_fees: number | null;
  sale_date: string | null;
  created_at: string;
  channel_sold?: string | null;
  category?: { name: string } | null;
  acquisition_source: string | null;
}

export interface LedgerSale {
  sold_at: string;
  sale_date?: string | null;
  channel: string;
  lines: { item_id: string | null; sold_price: number }[];
}

export type Period = '7d' | '30d' | 'month' | '90d' | 'year' | 'all';

export const PERIOD_LABELS: Record<Period, string> = {
  '7d': '7 days',
  '30d': '30 days',
  month: 'This month',
  '90d': '90 days',
  year: 'This year',
  all: 'All time',
};

/** First moment of the period (null = no limit). */
export function periodStart(period: Period, now: Date = new Date()): Date | null {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (period) {
    case '7d':
      d.setDate(d.getDate() - 6);
      return d;
    case '30d':
      d.setDate(d.getDate() - 29);
      return d;
    case '90d':
      d.setDate(d.getDate() - 89);
      return d;
    case 'month':
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case 'year':
      return new Date(now.getFullYear(), 0, 1);
    case 'all':
      return null;
  }
}

/** The day a sold item sold, as a local Date (falls back to when the row was made). */
export const soldOn = (i: Pick<SoldItem, 'sale_date' | 'created_at'>): Date =>
  parseLocalDate(i.sale_date) ?? new Date(i.created_at);

export const channelLabel = (c: string | null | undefined): string =>
  !c ? 'Not recorded' : c === 'market' ? 'Flea markets' : c === 'online' ? 'Online (other)' : c;

export interface Bucket {
  key: string;
  label: string;
  count: number;
  revenue: number;
  profit: number;
}

export interface Summary {
  revenue: number;
  profit: number;
  count: number;
  /** Revenue from quick sales (not inventory) — included above, with no item cost */
  quickRevenue: number;
  quickCount: number;
  margin: number;
  avgProfit: number;
  /** Sold, but no sale price was ever recorded (profit falls back to the asking price) */
  unpriced: number;
  byChannel: Bucket[];
  byMonth: Bucket[];
  byCategory: Bucket[];
  bySource: Bucket[];
}

function netProfitOf(i: SoldItem, price: number): number {
  return price - i.original_cost - (i.refurbish_cost || 0) - (i.shipping_cost || 0) - (i.platform_fees || 0);
}

export function summarize(items: SoldItem[], sales: LedgerSale[], period: Period, now: Date = new Date()): Summary {
  const start = periodStart(period, now);
  const inRange = (d: Date) => !start || d >= start;

  const buckets = {
    channel: new Map<string, Bucket>(),
    month: new Map<string, Bucket>(),
    category: new Map<string, Bucket>(),
    source: new Map<string, Bucket>(),
  };
  const bump = (m: Map<string, Bucket>, key: string, label: string, revenue: number, profit: number) => {
    const b = m.get(key) ?? { key, label, count: 0, revenue: 0, profit: 0 };
    b.count += 1;
    b.revenue += revenue;
    b.profit += profit;
    m.set(key, b);
  };
  const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const monthLabel = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });

  let revenue = 0;
  let profit = 0;
  let count = 0;
  let unpriced = 0;

  for (const i of items) {
    const when = soldOn(i);
    if (!inRange(when)) continue;
    const price = i.actual_price ?? 0;
    if (i.actual_price == null) unpriced += 1;
    const p = netProfitOf(i, i.actual_price ?? i.target_price ?? 0);
    revenue += price;
    profit += p;
    count += 1;
    bump(buckets.channel, i.channel_sold ?? '', channelLabel(i.channel_sold), price, p);
    bump(buckets.month, monthKey(when), monthLabel(when), price, p);
    const cat = i.category?.name ?? 'Uncategorized';
    bump(buckets.category, cat, cat, price, p);
    const src = i.acquisition_source || 'Unknown';
    bump(buckets.source, src, src, price, p);
  }

  // Quick sales have no inventory row, so only the ledger knows about them
  let quickRevenue = 0;
  let quickCount = 0;
  for (const s of sales) {
    const when = parseLocalDate(s.sale_date) ?? new Date(s.sold_at);
    if (!inRange(when)) continue;
    for (const l of s.lines) {
      if (l.item_id) continue;
      quickRevenue += l.sold_price;
      quickCount += 1;
      revenue += l.sold_price;
      profit += l.sold_price;
      count += 1;
      bump(buckets.channel, s.channel, channelLabel(s.channel), l.sold_price, l.sold_price);
      bump(buckets.month, monthKey(when), monthLabel(when), l.sold_price, l.sold_price);
      bump(buckets.category, 'Quick sales', 'Quick sales', l.sold_price, l.sold_price);
    }
  }

  const rounded = (m: Map<string, Bucket>) =>
    [...m.values()].map((b) => ({ ...b, revenue: cents(b.revenue), profit: cents(b.profit) }));
  // Best first, top few
  const list = (m: Map<string, Bucket>, by: 'profit' | 'key', limit = 8) =>
    by === 'profit'
      ? rounded(m).sort((a, b) => b.profit - a.profit).slice(0, limit)
      : rounded(m).sort((a, b) => a.key.localeCompare(b.key)).slice(-12); // last 12 months, oldest first

  return {
    revenue: cents(revenue),
    profit: cents(profit),
    count,
    quickRevenue: cents(quickRevenue),
    quickCount,
    margin: revenue > 0 ? (profit / revenue) * 100 : 0,
    avgProfit: count > 0 ? profit / count : 0,
    unpriced,
    byChannel: list(buckets.channel, 'profit'),
    byMonth: list(buckets.month, 'key'),
    byCategory: list(buckets.category, 'profit', 6),
    bySource: list(buckets.source, 'profit', 6),
  };
}
