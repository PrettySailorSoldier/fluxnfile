/**
 * Parser for Amazon's "Request My Data" export (the "Your Amazon Orders" folder).
 *
 * Main file: "Order History.csv" — one row per shipped line item, with columns
 *   ASIN, Order ID, Order Date, Ship Date, Product Name, Unit Price, Unit Price Tax,
 *   Total Amount, Total Discounts, Original Quantity, Order Status, Shipment Status,
 *   Department, Product Condition, Carrier Name & Tracking Number, ...
 *
 * Optional companion: "Refund Details.csv" (from "Your Returns & Refunds") — refunds
 * keyed by Order ID, attached to an item when that order has a single line item.
 *
 * Billing / shipping addresses and payment method columns are deliberately ignored.
 */
import Papa from 'papaparse';

export interface AmazonExportItem {
  asin: string | null;
  orderId: string;
  title: string;
  /** ISO date-time, from "Order Date" */
  orderDate: string | null;
  /** ISO date-time, from "Ship Date" */
  shipDate: string | null;
  unitPrice: number;
  unitTax: number;
  quantity: number;
  /** Closed / Cancelled / Authorized */
  orderStatus: string;
  /** "Shipped", "Paid", ... — null when Amazon says "Not Available" */
  shipmentStatus: string | null;
  department: string | null;
  condition: string | null;
  /** Carrier + tracking number, e.g. AMZN_US(TBA...) */
  tracking: string | null;
  serialNumber: string | null;
  /** Looks like a Vine order: nothing charged, discount ≈ the full unit price. */
  isVine: boolean;
  refundAmount: number | null;
  refundDate: string | null;
}

export interface AmazonExportParseResult {
  items: AmazonExportItem[];
  totalRows: number;
  cancelledSkipped: number;
  vineCount: number;
  refundsApplied: number;
  parseWarnings: string[];
}

const REQUIRED_HEADERS = ['asin', 'order id', 'order date', 'product name', 'unit price', 'order status'];

const norm = (s: string) => s.replace(/^\uFEFF/, '').trim().toLowerCase();

/** True when the first line looks like Amazon's data-export Order History.csv. */
export function isAmazonDataExportCSV(text: string): boolean {
  const firstLine = (text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] ?? '').replace(/"/g, '');
  const headers = firstLine.split(',').map(norm);
  return REQUIRED_HEADERS.every((h) => headers.includes(h));
}

/** True when the first line looks like the data-export Refund Details.csv. */
export function isAmazonRefundDetailsCSV(text: string): boolean {
  const firstLine = (text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] ?? '').replace(/"/g, '');
  const headers = firstLine.split(',').map(norm);
  return ['order id', 'refund amount', 'refund date', 'payment status'].every((h) => headers.includes(h));
}

/** "'-99.99'", "7.92", "Not Available" → number (0 when unreadable). */
function num(raw: string | undefined): number {
  if (!raw) return 0;
  const n = parseFloat(raw.replace(/['"$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

const NOT_AVAILABLE = /^(not available|not applicable|n\/a|)$/i;

function text(raw: string | undefined): string | null {
  const t = (raw ?? '').trim();
  return NOT_AVAILABLE.test(t) ? null : t;
}

function isoDate(raw: string | undefined): string | null {
  const t = text(raw);
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function readRows(csv: string): Record<string, string>[] {
  const parsed = Papa.parse<Record<string, string>>(csv.replace(/^\uFEFF/, ''), {
    header: true,
    skipEmptyLines: true,
    transformHeader: norm,
  });
  return parsed.data;
}

/** Order ID → total completed refund, from Refund Details.csv. */
function readRefunds(refundCsv: string): Map<string, { amount: number; date: string | null }> {
  const refunds = new Map<string, { amount: number; date: string | null }>();
  for (const row of readRows(refundCsv)) {
    const orderId = (row['order id'] ?? '').trim();
    if (!orderId || !/^completed$/i.test((row['payment status'] ?? '').trim())) continue;
    const amount = num(row['refund amount']);
    if (amount <= 0) continue;
    const date = isoDate(row['refund date']);
    const prev = refunds.get(orderId);
    refunds.set(orderId, {
      amount: Math.round(((prev?.amount ?? 0) + amount) * 100) / 100,
      date: prev?.date && date && prev.date > date ? prev.date : date ?? prev?.date ?? null,
    });
  }
  return refunds;
}

export function parseAmazonDataExport(orderHistoryCsv: string, refundDetailsCsv?: string): AmazonExportParseResult {
  const warnings: string[] = [];
  const rows = readRows(orderHistoryCsv);
  const items: AmazonExportItem[] = [];
  let cancelledSkipped = 0;

  for (const row of rows) {
    const title = (row['product name'] ?? '').trim();
    const orderStatus = (row['order status'] ?? '').trim();
    const quantity = Math.max(0, parseInt(row['original quantity'] ?? '', 10) || 0);
    if (!title) continue;

    if (/cancel/i.test(orderStatus) || quantity === 0) {
      cancelledSkipped++;
      continue;
    }

    const asinRaw = (row['asin'] ?? '').trim();
    const unitPrice = num(row['unit price']);
    const totalAmount = num(row['total amount']);
    const discount = Math.abs(num(row['total discounts']));
    // Vine orders are charged $0 with a discount covering the whole item.
    const isVine = totalAmount === 0 && unitPrice > 0 && discount >= unitPrice * quantity * 0.99;

    items.push({
      asin: /^[A-Z0-9]{10}$/i.test(asinRaw) ? asinRaw.toUpperCase() : null,
      orderId: (row['order id'] ?? '').trim(),
      title,
      orderDate: isoDate(row['order date']),
      shipDate: isoDate(row['ship date']),
      unitPrice,
      unitTax: num(row['unit price tax']),
      quantity,
      orderStatus,
      shipmentStatus: text(row['shipment status']),
      department: text(row['department']),
      condition: text(row['product condition']),
      tracking: text(row['carrier name & tracking number']),
      serialNumber: text(row['item serial number']),
      isVine,
      refundAmount: null,
      refundDate: null,
    });
  }

  // Refunds are per order, not per item: only attach when the order has one line.
  let refundsApplied = 0;
  if (refundDetailsCsv) {
    const refunds = readRefunds(refundDetailsCsv);
    const perOrder = new Map<string, AmazonExportItem[]>();
    for (const item of items) perOrder.set(item.orderId, [...(perOrder.get(item.orderId) ?? []), item]);
    let ambiguous = 0;
    for (const [orderId, refund] of refunds) {
      const lines = perOrder.get(orderId);
      if (!lines) continue;
      if (lines.length === 1) {
        lines[0].refundAmount = refund.amount;
        lines[0].refundDate = refund.date;
        refundsApplied++;
      } else {
        ambiguous++;
      }
    }
    if (ambiguous > 0) {
      warnings.push(`${ambiguous} refunded orders have several items, so the refund wasn't attached to a specific item.`);
    }
  }

  if (cancelledSkipped > 0) warnings.push(`Skipped ${cancelledSkipped} cancelled line items.`);
  if (items.length === 0) warnings.push('No importable items found in Order History.csv.');

  return {
    items,
    totalRows: rows.length,
    cancelledSkipped,
    vineCount: items.filter((i) => i.isVine).length,
    refundsApplied,
    parseWarnings: warnings,
  };
}
