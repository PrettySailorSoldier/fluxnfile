/**
 * Pure market-day maths: pricing, break-even, markdown phases, bundles,
 * sale totals and event reviews. No React, no network — easy to test.
 *
 * All money is rounded to cents at the edges (see `cents`).
 */

export const cents = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

// ── Pricing ──────────────────────────────────────────────────────────────────

/** Round a market price to a clean number for cash and quick maths. */
export function roundMarketPrice(raw: number, step: 1 | 5 = 1): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  if (raw < 3) return cents(raw); // very cheap things keep their cents
  return Math.max(step, Math.round(raw / step) * step);
}

/** Tag = floor × (1 + buffer). Buffer is a percent (default 20, research range 15–25). */
export function suggestTagPrice(floor: number, bufferPercent = 20, step: 1 | 5 = 1): number {
  return roundMarketPrice(floor * (1 + bufferPercent / 100), step);
}

/** Floor = tag ÷ (1 + buffer): the walk-away implied by a sticker price. */
export function suggestFloorPrice(tag: number, bufferPercent = 20): number {
  return cents(tag / (1 + bufferPercent / 100));
}

/** What the item actually cost to get ready to sell. */
export function itemBasis(item: { original_cost: number; refurbish_cost: number | null }): number {
  return (item.original_cost || 0) + (item.refurbish_cost || 0);
}

/** Card / app processing fee on a charge. */
export function cardFee(total: number, percent: number, flat: number): number {
  return total > 0 ? cents((total * percent) / 100 + flat) : 0;
}

export type PaymentMethod = 'cash' | 'card' | 'venmo' | 'other';

export interface FeeSettings {
  cardFeePercent: number;
  cardFeeFlat: number;
  /** Venmo/Cash App business-style fee; personal transfers are 0 */
  appFeePercent: number;
}

export function processingFee(method: PaymentMethod, total: number, fees: FeeSettings): number {
  if (method === 'card') return cardFee(total, fees.cardFeePercent, fees.cardFeeFlat);
  if (method === 'venmo') return cardFee(total, fees.appFeePercent, 0);
  return 0;
}

// ── Event maths ──────────────────────────────────────────────────────────────

/**
 * Sales you need to cover the booth + costs.
 * costShare = average cost ÷ price of what you bring (0–1). Returns null when
 * the margin is zero or negative (nothing can break even).
 */
export function breakEvenSales(boothFee: number, otherCosts: number, costShare: number): number | null {
  const margin = 1 - costShare;
  if (margin <= 0) return null;
  return cents((boothFee + otherCosts) / margin);
}

/** Average cost ÷ tag price over the items brought. Items without a tag are ignored. */
export function averageCostShare(
  items: { original_cost: number; refurbish_cost: number | null; tag_price?: number | null; target_price: number | null }[]
): number {
  let cost = 0;
  let price = 0;
  for (const it of items) {
    const p = it.tag_price ?? it.target_price;
    if (!p || p <= 0) continue; // untagged and unpriced items can't say anything about margin
    cost += itemBasis(it);
    price += p;
  }
  return price > 0 ? cost / price : 0;
}

/** Booth fee as a share of expected gross; the guides want ≤ 15–20%. */
export function boothFeeShare(boothFee: number, expectedGross: number): number | null {
  return expectedGross > 0 ? boothFee / expectedGross : null;
}

/** "3x rule": gross at least 3 times the booth fee. */
export function meetsThreeXRule(gross: number, boothFee: number): boolean {
  return boothFee <= 0 ? true : gross >= boothFee * 3;
}

/** Hours between 'HH:MM' strings; handles missing values and end-after-midnight. */
export function eventHours(start: string | null, end: string | null): number | null {
  const toMin = (t: string | null) => {
    const m = t?.match(/^(\d{1,2}):(\d{2})$/);
    return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
  };
  const s = toMin(start);
  const e = toMin(end);
  if (s == null || e == null) return null;
  const diff = e >= s ? e - s : e + 24 * 60 - s;
  return diff > 0 ? diff / 60 : null;
}

// ── Markdown phases ──────────────────────────────────────────────────────────

export interface MarkdownPhase {
  id?: string;
  label: string;
  starts_at: string; // 'HH:MM'
  percent_off: number;
}

const minutesOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();
const parseHM = (t: string): number | null => {
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
};

/** The phase in force at `now`: the latest one that has started. Null before the first. */
export function currentPhase(phases: MarkdownPhase[], now: Date = new Date()): MarkdownPhase | null {
  const nowMin = minutesOfDay(now);
  let best: { phase: MarkdownPhase; at: number } | null = null;
  for (const p of phases) {
    const at = parseHM(p.starts_at);
    if (at == null || at > nowMin) continue;
    if (!best || at > best.at) best = { phase: p, at };
  }
  return best?.phase ?? null;
}

/** Sensible starting phases for an event (editable). */
export function defaultPhases(start: string | null, end: string | null): MarkdownPhase[] {
  const s = parseHM(start ?? '') ?? 8 * 60;
  const e = parseHM(end ?? '') ?? 15 * 60;
  const span = e > s ? e - s : 7 * 60;
  const hm = (min: number) =>
    `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(Math.round(min % 60)).padStart(2, '0')}`;
  return [
    { label: 'Opening', starts_at: hm(s), percent_off: 0 },
    { label: 'Midday', starts_at: hm(s + span * 0.4), percent_off: 10 },
    { label: 'Afternoon', starts_at: hm(s + span * 0.7), percent_off: 20 },
    { label: 'Last hour', starts_at: hm(Math.max(s, e - 60)), percent_off: 30 },
  ];
}

/**
 * Tag price with a percent off, rounded to a clean number and never below the floor.
 * With no floor the percent-off price is used as-is.
 */
export function discountedPrice(tag: number, percentOff: number, floor: number | null, step: 1 | 5 = 1): number {
  const raw = tag * (1 - percentOff / 100);
  const rounded = roundMarketPrice(raw, step);
  return floor != null && floor > 0 ? Math.max(rounded, floor) : rounded;
}

// ── Bundles ──────────────────────────────────────────────────────────────────

export interface BundleRule {
  id: string;
  name: string;
  max_item_price: number | null;
  category_id: string | null;
  quantity: number;
  bundle_price: number;
  is_active: boolean;
}

export interface CartLine {
  item_id: string;
  tag_price: number;
  category_id: string | null;
  /** Price the seller picked. `manual` lines are never re-priced by a bundle. */
  price: number;
  manual: boolean;
}

export interface PricedLine extends CartLine {
  sold_price: number;
  bundle?: string;
}

function eligible(line: CartLine, rule: BundleRule): boolean {
  if (!rule.is_active || line.manual) return false;
  if (rule.max_item_price != null && line.tag_price > rule.max_item_price) return false;
  if (rule.category_id && line.category_id !== rule.category_id) return false;
  return true;
}

/**
 * Greedy bundle pricing: for each rule (best deal first), take groups of `quantity`
 * eligible lines and charge `bundle_price` for the group, split in proportion to
 * their prices. Lines already bundled or priced by hand are left alone.
 * Bundles that would cost MORE than the individual prices are skipped.
 */
export function applyBundles(lines: CartLine[], rules: BundleRule[]): PricedLine[] {
  const out: PricedLine[] = lines.map((l) => ({ ...l, sold_price: cents(l.price) }));
  const used = new Set<number>();

  const byValue = [...rules]
    .filter((r) => r.is_active && r.quantity >= 2)
    .sort((a, b) => a.bundle_price / a.quantity - b.bundle_price / b.quantity);

  for (const rule of byValue) {
    const pool = out
      .map((l, i) => ({ l, i }))
      .filter(({ l, i }) => !used.has(i) && eligible(l, rule))
      .sort((a, b) => b.l.price - a.l.price);

    for (let g = 0; g + rule.quantity <= pool.length; g += rule.quantity) {
      const group = pool.slice(g, g + rule.quantity);
      const regular = group.reduce((s, { l }) => s + l.price, 0);
      if (rule.bundle_price >= regular) continue; // not a deal
      let assigned = 0;
      group.forEach(({ l, i }, idx) => {
        const share =
          idx === group.length - 1
            ? cents(rule.bundle_price - assigned)
            : cents((rule.bundle_price * l.price) / regular);
        assigned = cents(assigned + share);
        out[i] = { ...l, sold_price: share, bundle: rule.name };
        used.add(i);
      });
    }
  }
  return out;
}

// ── Totals ───────────────────────────────────────────────────────────────────

export interface SaleTotals {
  tagTotal: number;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
}

/**
 * Cart totals. taxPercent applies on top of the subtotal, unless `taxIncluded`
 * (shelf prices already contain tax), in which case the tax is backed out.
 */
export function saleTotals(
  lines: { tag_price: number; sold_price: number }[],
  taxPercent = 0,
  taxIncluded = false
): SaleTotals {
  const tagTotal = cents(lines.reduce((s, l) => s + l.tag_price, 0));
  const subtotal = cents(lines.reduce((s, l) => s + l.sold_price, 0));
  const discount = cents(Math.max(0, tagTotal - subtotal));
  let tax = 0;
  let total = subtotal;
  if (taxPercent > 0) {
    if (taxIncluded) tax = cents(subtotal - subtotal / (1 + taxPercent / 100));
    else {
      tax = cents((subtotal * taxPercent) / 100);
      total = cents(subtotal + tax);
    }
  }
  return { tagTotal, subtotal, discount, tax, total };
}

/** Change to hand back; 0 when the buyer hasn't paid enough yet. */
export function changeDue(total: number, tendered: number): number {
  return tendered > total ? cents(tendered - total) : 0;
}

/** Spread a sale-level fee across lines in proportion to price (sums exactly to `fee`). */
export function allocateFee(soldPrices: number[], fee: number): number[] {
  const sum = soldPrices.reduce((s, p) => s + p, 0);
  if (sum <= 0 || fee <= 0) return soldPrices.map(() => 0);
  let assigned = 0;
  return soldPrices.map((p, i) => {
    if (i === soldPrices.length - 1) return cents(fee - assigned);
    const share = cents((fee * p) / sum);
    assigned = cents(assigned + share);
    return share;
  });
}

// ── Event review ─────────────────────────────────────────────────────────────

export interface ReviewSale {
  sold_at: string;
  payment_method: PaymentMethod;
  total: number;
  tax_amount: number;
  fee_amount: number;
  discount_amount: number;
  lines: { sold_price: number; tag_price: number | null; cost: number }[];
}

export interface EventReview {
  saleCount: number;
  itemsSold: number;
  /** Sales before tax */
  gross: number;
  cogs: number;
  fees: number;
  boothAndCosts: number;
  /** gross − cogs − fees − booth − costs */
  profit: number;
  profitPerHour: number | null;
  avgSale: number;
  itemsPerSale: number;
  sellThrough: number | null;
  cashSales: number;
  paymentMix: Record<PaymentMethod, { count: number; total: number }>;
  discountTotal: number;
  taxCollected: number;
  boothShareOfGross: number | null;
  threeX: boolean;
}

export function reviewEvent(
  event: { booth_fee: number; other_costs: number },
  hours: number | null,
  broughtCount: number,
  sales: ReviewSale[]
): EventReview {
  const paymentMix: EventReview['paymentMix'] = {
    cash: { count: 0, total: 0 },
    card: { count: 0, total: 0 },
    venmo: { count: 0, total: 0 },
    other: { count: 0, total: 0 },
  };
  let gross = 0;
  let cogs = 0;
  let fees = 0;
  let discount = 0;
  let tax = 0;
  let itemsSold = 0;
  for (const s of sales) {
    const sub = s.lines.reduce((t, l) => t + l.sold_price, 0);
    // When sticker prices include tax the line prices carry it too (total == subtotal),
    // so take it back out: tax collected isn't income.
    const taxInLines = s.tax_amount > 0 && s.total <= sub + 0.005 ? s.tax_amount : 0;
    gross += sub - taxInLines;
    cogs += s.lines.reduce((t, l) => t + l.cost, 0);
    fees += s.fee_amount;
    discount += s.discount_amount;
    tax += s.tax_amount;
    itemsSold += s.lines.length;
    paymentMix[s.payment_method].count += 1;
    paymentMix[s.payment_method].total = cents(paymentMix[s.payment_method].total + s.total);
  }
  const booth = event.booth_fee + event.other_costs;
  const profit = cents(gross - cogs - fees - booth);
  return {
    saleCount: sales.length,
    itemsSold,
    gross: cents(gross),
    cogs: cents(cogs),
    fees: cents(fees),
    boothAndCosts: cents(booth),
    profit,
    profitPerHour: hours && hours > 0 ? cents(profit / hours) : null,
    avgSale: sales.length ? cents(gross / sales.length) : 0,
    itemsPerSale: sales.length ? Math.round((itemsSold / sales.length) * 10) / 10 : 0,
    sellThrough: broughtCount > 0 ? itemsSold / broughtCount : null,
    cashSales: paymentMix.cash.total,
    paymentMix,
    discountTotal: cents(discount),
    taxCollected: cents(tax),
    boothShareOfGross: boothFeeShare(event.booth_fee, gross),
    threeX: meetsThreeXRule(gross, event.booth_fee),
  };
}

export type Verdict = 'book_again' | 'maybe' | 'skip';

export const verdictLabels: Record<Verdict, string> = {
  book_again: 'Book again',
  maybe: 'Maybe',
  skip: 'Skip',
};

export interface VerdictThresholds {
  /** Profit per hour at or above this → Book again (if it also clears 3x) */
  goodProfitPerHour: number;
  /** Below this → Skip */
  minProfitPerHour: number;
}

export const DEFAULT_VERDICT_THRESHOLDS: VerdictThresholds = { goodProfitPerHour: 20, minProfitPerHour: 8 };

/** Suggested verdict; the seller always has the final say. */
export function suggestVerdict(r: EventReview, t: VerdictThresholds = DEFAULT_VERDICT_THRESHOLDS): Verdict {
  if (r.profit <= 0) return 'skip';
  if (r.profitPerHour == null) return r.threeX ? 'maybe' : 'skip';
  if (r.profitPerHour >= t.goodProfitPerHour && r.threeX) return 'book_again';
  if (r.profitPerHour < t.minProfitPerHour) return 'skip';
  return 'maybe';
}

/** Expected cash in the box: float + cash sales (tax included, as handed over). */
export function expectedCash(startCash: number, cashSalesTotal: number): number {
  return cents(startCash + cashSalesTotal);
}

/** Gross margin across a set of sales (the "after ~10 market days" check). */
export function grossMarginPercent(gross: number, cogs: number): number | null {
  return gross > 0 ? ((gross - cogs) / gross) * 100 : null;
}

// ── CSV ──────────────────────────────────────────────────────────────────────

/** RFC-4180 CSV; also neutralises spreadsheet formula injection. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s))) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

// ── Bring-list ranking ───────────────────────────────────────────────────────

export interface BringCandidate {
  status: string;
  listedDays: number | null;
  margin: number | null;
  hasTag: boolean;
  marketAttempts: number;
  /** Category name hints — heavy / bulky / fragile sells better in person */
  bulkyHint: boolean;
}

/** Higher = bring it first. */
export function bringScore(c: BringCandidate): number {
  let s = 0;
  if (c.bulkyHint) s += 3;
  if (c.listedDays != null && c.listedDays >= 30) s += 3;
  else if (c.listedDays != null && c.listedDays >= 14) s += 1;
  if (c.margin != null) s += Math.max(-2, Math.min(3, c.margin / 20));
  if (c.hasTag) s += 1;
  if (c.marketAttempts >= 2) s -= 3; // already failed at two markets
  return s;
}

const BULKY = /furniture|lamp|chair|table|appliance|tool|kitchen|home|garden|outdoor|exercise|fitness|toy|decor|glass|ceramic|vase|frame|mirror|bike|speaker|monitor|tv/i;
export const looksBulky = (categoryName: string | null | undefined, title: string | null | undefined): boolean =>
  BULKY.test(`${categoryName ?? ''} ${title ?? ''}`);
