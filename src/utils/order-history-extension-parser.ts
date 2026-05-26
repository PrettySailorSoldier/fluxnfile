/**
 * Parser for the Amazon Order History Browser Extension CSV format.
 *
 * CSV columns (exact header names):
 *   orderId, orderPlaced, total, shipToName, shipmentStatus,
 *   trackingUrl, orderDetailsUrl, invoiceUrl, returnStatus,
 *   refundAmount, refundDate, taxAmount, vatAmount, vatNumber, itemTitles
 *
 * Key behaviors:
 * - total === "$0.00" → is_vine_order = true
 * - total > $0.00 → is_vine_order = false (regular Amazon purchase)
 * - itemTitles may be pipe-separated ("|") for multi-item orders
 *   → split into individual items, each gets the same orderId
 * - shipmentStatus contains human strings like "Delivered February 3",
 *   "Arriving tomorrow", "Return window closed on March 1, 2026",
 *   "Return complete", "Return started", "Cancelled"
 *   → normalized and stored as amazon_shipment_status
 * - Strip "$" and commas from all price fields before storing as numbers
 * - orderPlaced is "May 26, 2026" format → parse to ISO date string
 */

export interface OrderHistoryItem {
  orderId: string;
  title: string;
  orderPlaced: string; // ISO date string

  isVineOrder: boolean; // total === "$0.00"

  total: number;
  taxAmount: number;
  refundAmount: number | null;
  refundDate: string | null;

  shipmentStatus: string;
  trackingUrl: string | null;
  orderDetailsUrl: string | null;
  invoiceUrl: string | null;
  returnStatus: string | null;
  shipToName: string | null;
}

export interface OrderHistoryParseResult {
  items: OrderHistoryItem[];
  vineCount: number;
  regularCount: number;
  multiItemOrderCount: number;
  parseWarnings: string[];
}

/**
 * Detect if a string is the Order History Extension CSV format.
 * Check for the exact header columns.
 */
export function isOrderHistoryExtensionCSV(text: string): boolean {
  const firstLine = text.split('\n')[0].toLowerCase().replace(/\r/, '');
  return (
    firstLine.includes('orderid') &&
    firstLine.includes('orderplaced') &&
    firstLine.includes('shipmentstatus') &&
    firstLine.includes('itemtitles')
  );
}

function parsePriceOH(s: string | undefined | null): number {
  if (!s || !s.trim()) return 0;
  const cleaned = s.replace(/[$,\s]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

function parseOrderDate(s: string): string {
  if (!s || !s.trim()) return new Date().toISOString();
  const d = new Date(s.trim());
  if (!isNaN(d.getTime())) return d.toISOString();
  return new Date().toISOString();
}

export function parseOrderHistoryExtensionCSV(text: string): OrderHistoryParseResult {
  const warnings: string[] = [];
  const items: OrderHistoryItem[] = [];
  let vineCount = 0;
  let regularCount = 0;
  let multiItemOrderCount = 0;
  let skippedNoTitle = 0;

  // Strip BOM
  const cleanText = text.replace(/^﻿/, '');
  const lines = cleanText.split(/\r?\n/).filter(l => l.trim());

  if (lines.length < 2) {
    warnings.push('File appears empty or has no data rows.');
    return { items, vineCount, regularCount, multiItemOrderCount, parseWarnings: warnings };
  }

  const headers = splitCSVLineOH(lines[0]) || [];
  const col = (name: string) =>
    headers.findIndex(
      h => h.toLowerCase().replace(/[^a-z]/g, '') === name.toLowerCase().replace(/[^a-z]/g, '')
    );

  const iOrderId       = col('orderId');
  const iOrderPlaced   = col('orderPlaced');
  const iTotal         = col('total');
  const iShipName      = col('shipToName');
  const iShipStatus    = col('shipmentStatus');
  const iTrackingUrl   = col('trackingUrl');
  const iOrderUrl      = col('orderDetailsUrl');
  const iInvoiceUrl    = col('invoiceUrl');
  const iReturnStatus  = col('returnStatus');
  const iRefundAmount  = col('refundAmount');
  const iRefundDate    = col('refundDate');
  const iTaxAmount     = col('taxAmount');
  const iItemTitles    = col('itemTitles');

  if (iOrderId === -1 || iItemTitles === -1) {
    warnings.push('Missing required columns: orderId or itemTitles');
    return { items, vineCount, regularCount, multiItemOrderCount, parseWarnings: warnings };
  }

  for (let i = 1; i < lines.length; i++) {
    const fields = splitCSVLineOH(lines[i]);
    if (!fields || fields.length < 3) continue;

    const get = (idx: number) => (idx >= 0 && idx < fields.length ? fields[idx].trim() : '');

    const orderId        = get(iOrderId);
    const orderPlaced    = parseOrderDate(get(iOrderPlaced));
    const totalStr       = get(iTotal);
    const isVineOrder    = totalStr === '$0.00' || totalStr === '0' || totalStr === '0.00';
    const total          = parsePriceOH(totalStr);
    const shipToName     = get(iShipName) || null;
    const shipmentStatus = get(iShipStatus);
    const trackingUrl    = get(iTrackingUrl) || null;
    const orderDetailsUrl = get(iOrderUrl) || null;
    const invoiceUrl     = get(iInvoiceUrl) || null;
    const returnStatus   = get(iReturnStatus) || null;
    const refundAmountRaw = parsePriceOH(get(iRefundAmount));
    const refundAmount   = refundAmountRaw > 0 ? refundAmountRaw : null;
    const refundDate     = get(iRefundDate) || null;
    const taxAmount      = parsePriceOH(get(iTaxAmount));
    const rawTitles      = get(iItemTitles);

    if (!orderId || !rawTitles) {
      skippedNoTitle++;
      continue;
    }

    // Split multi-item orders on unquoted pipe separators
    const titleList = splitOnPipes(rawTitles);
    if (titleList.length > 1) multiItemOrderCount++;

    for (const title of titleList) {
      if (!title || title.length < 3) continue;
      items.push({
        orderId,
        title,
        orderPlaced,
        isVineOrder,
        total,
        taxAmount,
        refundAmount,
        refundDate,
        shipmentStatus,
        trackingUrl,
        orderDetailsUrl,
        invoiceUrl,
        returnStatus,
        shipToName,
      });
    }

    if (isVineOrder) vineCount++;
    else regularCount++;
  }

  if (skippedNoTitle > 0) {
    warnings.push(`${skippedNoTitle} row${skippedNoTitle !== 1 ? 's' : ''} skipped: missing item title or order ID`);
  }

  return { items, vineCount, regularCount, multiItemOrderCount, parseWarnings: warnings };
}

/**
 * Split pipe-separated titles. Only splits on pipes that are NOT inside quoted fields.
 * If the whole value was already a single quoted field, treat it as one title.
 */
function splitOnPipes(raw: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if (ch === '|' && !inQuotes) {
      const trimmed = current.trim().replace(/^"|"$/g, '');
      if (trimmed) parts.push(trimmed);
      current = '';
    } else {
      current += ch;
    }
  }

  const last = current.trim().replace(/^"|"$/g, '');
  if (last) parts.push(last);

  return parts.filter(p => p.length > 0);
}

function splitCSVLineOH(line: string): string[] | null {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') { current += '"'; i += 2; }
        else { inQuotes = false; i++; }
      } else { current += char; i++; }
    } else {
      if (char === '"') { inQuotes = true; i++; }
      else if (char === ',') { fields.push(current.trim()); current = ''; i++; }
      else { current += char; i++; }
    }
  }

  if (inQuotes) return null;
  fields.push(current.trim());
  return fields;
}
