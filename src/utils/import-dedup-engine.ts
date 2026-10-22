import { isUnknownTitle } from '@/lib/productLookup';

/**
 * Universal deduplication and data-merge engine for Flux&File imports.
 *
 * DEDUPLICATION PRIORITY CHAIN (in order):
 * 1. UPC/EAN match (upc column, leading zeros ignored) — exact product match
 * 2. ASIN match (amazon_asin column) — exact match
 * 3. Order number match (amazon_order_id column) — exact match
 * 4. Fuzzy title match — normalized title Jaccard similarity ≥ 0.82 threshold
 *
 * MERGE BEHAVIOR:
 * - When a duplicate is found, MERGE new data into the existing record.
 * - Never overwrite a field that already has a value with null/empty.
 * - Do overwrite fields that are null/empty with new non-null values.
 * - A placeholder title ("Unknown item (…)"), a $0 cost and an empty photo list
 *   count as empty, so a later import can fill them in.
 * - The existing row must carry every field compared here (see
 *   EXISTING_ITEM_FIELDS) — a field that wasn't loaded looks empty.
 * - Append the new import source to data_sources array if not already present.
 * - Special always-update fields: vine_review_status, vine_review_quality,
 *   amazon_shipment_status, lattice_review_status — these represent current
 *   state and should reflect the latest import.
 *
 * RETURN VALUES:
 * - { action: 'create', data: {...} } — no duplicate found, insert new item
 * - { action: 'merge', existingId: string, mergeData: {...} } — duplicate found,
 *   update existing item with mergeData fields only
 * - { action: 'skip' } — exact duplicate with no new information to add
 */

export type DedupeAction =
  | { action: 'create'; data: Record<string, unknown> }
  | { action: 'merge'; existingId: string; mergeData: Record<string, unknown> }
  | { action: 'skip' };

/** Columns to load for existing items so computeMergeData can tell filled from empty. */
export const EXISTING_ITEM_FIELDS =
  'id, title, photos, original_cost, target_price, upc, brand, retail_price, amazon_asin, amazon_order_id, ' +
  'amazon_order_url, amazon_tracking_url, amazon_invoice_url, amazon_return_status, amazon_refund_amount, ' +
  'amazon_refund_date, amazon_tax_amount, vine_etv, vine_fmv, is_vine_order, acquisition_date, data_sources, ' +
  'vine_review_status, vine_review_quality, amazon_shipment_status, lattice_review_status, lattice_review_score, ' +
  'lattice_review_quality, lattice_reviewed_date, vine_review_date';

export interface ExistingItemIndex {
  id: string;
  title: string | null;
  amazon_asin: string | null;
  amazon_order_id: string | null;
  upc?: string | null;
  data_sources: string[] | null;
  vine_review_status: string | null;
  vine_review_quality: string | null;
  amazon_shipment_status: string | null;
  lattice_review_status: string | null;
}

/**
 * Normalize a title for fuzzy comparison:
 * lowercase, strip punctuation, split into tokens, sort, join.
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

/**
 * Jaccard similarity between two token sets (both already normalized strings).
 */
export function jaccardSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const setA = new Set(a.split(' ').filter(Boolean));
  const setB = new Set(b.split(' ').filter(Boolean));
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

const FUZZY_THRESHOLD = 0.82;

/**
 * Find a matching existing item for the given incoming data.
 * Returns the existing item if found, null otherwise.
 */
export function findDuplicate(
  incoming: {
    upc?: string | null;
    asin?: string | null;
    orderId?: string | null;
    title: string;
  },
  existingItems: ExistingItemIndex[]
): ExistingItemIndex | null {
  const incomingNorm = normalizeTitle(incoming.title);

  // 1. UPC match (highest priority) — compare with leading zeros stripped
  if (incoming.upc) {
    const key = incoming.upc.replace(/\D/g, '').replace(/^0+/, '');
    const upcMatch = key
      ? existingItems.find((e) => e.upc && e.upc.replace(/\D/g, '').replace(/^0+/, '') === key)
      : undefined;
    if (upcMatch) return upcMatch;
  }

  // 2. ASIN match
  if (incoming.asin) {
    const asinMatch = existingItems.find(
      e => e.amazon_asin && e.amazon_asin.toUpperCase() === incoming.asin!.toUpperCase()
    );
    if (asinMatch) return asinMatch;
  }

  // 3. Order number match
  if (incoming.orderId) {
    const orderMatch = existingItems.find(
      e => e.amazon_order_id && e.amazon_order_id === incoming.orderId
    );
    if (orderMatch) return orderMatch;
  }

  // 4. Fuzzy title match
  if (!incomingNorm) return null;
  let bestScore = 0;
  let bestMatch: ExistingItemIndex | null = null;
  for (const existing of existingItems) {
    if (!existing.title) continue;
    const existingNorm = normalizeTitle(existing.title);
    const score = jaccardSimilarity(incomingNorm, existingNorm);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = existing;
    }
  }
  if (bestScore >= FUZZY_THRESHOLD && bestMatch) return bestMatch;

  return null;
}

/**
 * Merge incoming field values into existing item data.
 * Returns only the fields that should be updated (partial update object).
 * Returns null if there is nothing new to add (pure skip).
 */
export function computeMergeData(
  existing: ExistingItemIndex & Record<string, unknown>,
  incoming: Record<string, unknown>,
  newSource: string
): Record<string, unknown> | null {
  const mergeData: Record<string, unknown> = {};

  // Fields that always update to the latest value (current-state fields)
  const alwaysUpdate = [
    'vine_review_status',
    'vine_review_quality',
    'amazon_shipment_status',
    'lattice_review_status',
    'lattice_review_score',
    'lattice_review_quality',
    'lattice_reviewed_date',
    'vine_review_date',
  ];

  // Fields that only fill in if currently null/empty
  const fillIfEmpty = [
    'upc',
    'brand',
    'retail_price',
    'amazon_asin',
    'amazon_order_id',
    'amazon_order_url',
    'amazon_tracking_url',
    'amazon_invoice_url',
    'amazon_return_status',
    'amazon_refund_amount',
    'amazon_refund_date',
    'amazon_tax_amount',
    'vine_etv',
    'vine_fmv',
    'is_vine_order',
    'acquisition_date',
  ];

  for (const field of alwaysUpdate) {
    if (incoming[field] != null && incoming[field] !== existing[field]) {
      mergeData[field] = incoming[field];
    }
  }

  for (const field of fillIfEmpty) {
    if (incoming[field] != null && (existing[field] == null || existing[field] === '')) {
      mergeData[field] = incoming[field];
    }
  }

  // Imported without a name (e.g. a Lattice row with a blank Description) → take this one
  if (typeof incoming.title === 'string' && !isUnknownTitle(incoming.title) && isUnknownTitle(existing.title as string | null)) {
    mergeData.title = incoming.title;
  }

  // $0 cost (a Vine order in Amazon's history) → take a real value, e.g. Lattice's ETV
  const existingCost = Number(existing.original_cost ?? 0);
  if (typeof incoming.original_cost === 'number' && incoming.original_cost > 0 && !(existingCost > 0)) {
    mergeData.original_cost = incoming.original_cost;
    if (existing.target_price == null && incoming.target_price != null) mergeData.target_price = incoming.target_price;
  }

  const hasPhotos = Array.isArray(existing.photos) && (existing.photos as unknown[]).length > 0;
  if (!hasPhotos && Array.isArray(incoming.photos) && incoming.photos.length > 0) {
    mergeData.photos = incoming.photos;
  }

  // Always append new source to data_sources array
  const currentSources: string[] = Array.isArray(existing.data_sources)
    ? (existing.data_sources as string[])
    : [];
  if (!currentSources.includes(newSource)) {
    mergeData['data_sources'] = [...currentSources, newSource];
  }

  if (Object.keys(mergeData).length === 0) return null;
  return mergeData;
}
