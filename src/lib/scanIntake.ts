/**
 * Scan intake — the database side of a scan session.
 *
 * One scan resolves to exactly one of:
 *   received  — matched an unconfirmed Order Sheet item → confirmed with session defaults
 *   existing  — matched something already in inventory (nothing written)
 *   added     — unknown barcode → new item created, autofilled from the product lookup
 *   unit      — another unit of an item created earlier in this session
 */
import { supabase } from '@/integrations/supabase/client';
import type { TablesInsert } from '@/integrations/supabase/types';
import type { Category, ItemCondition } from '@/hooks/useInventory';
import { upcVariants, type CodeType } from '@/lib/barcode';
import {
  isUnknownTitle,
  lookupProduct,
  matchCategory,
  suggestPrice,
  unknownItemTitle,
  type ProductLookup,
} from '@/lib/productLookup';
import { jaccardSimilarity, normalizeTitle } from '@/utils/import-dedup-engine';

export interface IntakeDefaults {
  decision: 'sell' | 'keep';
  storageLocationId: string;
  condition: ItemCondition;
  cost: number;
  source: string;
  /** Suggested asking price as % of retail */
  resalePercent: number;
  roundTo99: boolean;
}

export interface IntakeContext {
  teamId: string;
  userId: string;
  categories: Pick<Category, 'id' | 'name'>[];
  defaults: IntakeDefaults;
}

export interface MatchRow {
  id: string;
  title: string | null;
  photos: string[] | null;
  physical_status: string;
  status: string;
  storage_location_id: string | null;
  target_price: number | null;
  original_cost: number;
  upc: string | null;
  amazon_asin: string | null;
  created_at: string;
  storage_location: { name: string } | null;
}

const MATCH_FIELDS =
  'id, title, photos, physical_status, status, storage_location_id, target_price, original_cost, upc, amazon_asin, created_at, storage_location:storage_locations(name)';

/** Every item (any status) with this barcode, oldest first. */
export async function findByCode(teamId: string, code: string, codeType: CodeType): Promise<MatchRow[]> {
  // FNSKUs aren't stored on items — resolve them to an ASIN first
  if (codeType === 'fnsku') return [];
  let query = supabase.from('items').select(MATCH_FIELDS).eq('team_id', teamId);
  query = codeType === 'asin' ? query.ilike('amazon_asin', code) : query.in('upc', upcVariants(code));
  const { data, error } = await query.order('created_at', { ascending: true }).limit(100);
  if (error) throw error;
  return (data ?? []) as unknown as MatchRow[];
}

export interface ReceiveUndo {
  physical_status: string;
  confirmed_at: string | null;
  confirmed_by: string | null;
  storage_location_id: string | null;
  upc?: string | null;
}

/** Confirm an Order Sheet item as physically received. */
export async function receiveItem(
  row: MatchRow,
  ctx: IntakeContext,
  extra: { upc?: string } = {}
): Promise<ReceiveUndo> {
  const undo: ReceiveUndo = {
    physical_status: row.physical_status,
    confirmed_at: null,
    confirmed_by: null,
    storage_location_id: row.storage_location_id,
    ...(extra.upc ? { upc: row.upc } : {}),
  };
  const { error } = await supabase
    .from('items')
    .update({
      physical_status: ctx.defaults.decision,
      confirmed_at: new Date().toISOString(),
      confirmed_by: ctx.userId,
      storage_location_id: ctx.defaults.storageLocationId || row.storage_location_id,
      status: 'acquired',
      ...(extra.upc ? { upc: extra.upc } : {}),
    })
    .eq('id', row.id);
  if (error) throw error;
  return undo;
}

/**
 * Orders imported without a name (Lattice exports often leave Description
 * blank) get their title, photos and brand from the scan's product lookup.
 * Returns the row with what changed, so the session list can show it.
 */
export async function fillFromLookup(row: MatchRow, lookup: ProductLookup | null): Promise<MatchRow> {
  if (!lookup?.found || !lookup.title || !isUnknownTitle(row.title)) return row;
  const photos = row.photos?.length
    ? row.photos
    : lookup.images.length
      ? lookup.images.slice(0, 3)
      : lookup.imageUrl
        ? [lookup.imageUrl]
        : [];
  const { error } = await supabase
    .from('items')
    .update({
      title: lookup.title,
      photos,
      ...(lookup.brand ? { brand: lookup.brand } : {}),
      ...(lookup.retailPrice ? { retail_price: lookup.retailPrice } : {}),
    })
    .eq('id', row.id);
  if (error) throw error;
  return { ...row, title: lookup.title, photos };
}

export async function undoReceive(id: string, undo: ReceiveUndo): Promise<void> {
  const { error } = await supabase.from('items').update(undo).eq('id', id);
  if (error) throw error;
}

/** Build a new item row from a product lookup + session defaults. */
export function buildItemFromLookup(
  code: string,
  codeType: CodeType,
  lookup: ProductLookup | null,
  ctx: IntakeContext,
  source = 'barcode_scan'
): TablesInsert<'items'> {
  const found = lookup?.found ? lookup : null;
  const photos = found ? (found.images.length ? found.images.slice(0, 3) : found.imageUrl ? [found.imageUrl] : []) : [];
  const descriptionParts = [
    found?.description,
    found?.model ? `Model: ${found.model}` : null,
  ].filter(Boolean);
  const retail = found?.retailPrice ?? null;
  const today = new Date().toISOString().split('T')[0];

  return {
    team_id: ctx.teamId,
    created_by: ctx.userId,
    title: found?.title ?? unknownItemTitle(code),
    brand: found?.brand ?? null,
    description: descriptionParts.length ? descriptionParts.join('\n\n') : null,
    photos,
    category_id: matchCategory(found?.category, ctx.categories),
    upc: codeType === 'upc' ? code : null,
    amazon_asin: codeType === 'asin' ? code : found?.asin ?? null,
    original_cost: ctx.defaults.cost || 0,
    acquisition_date: today,
    acquisition_source: ctx.defaults.source || null,
    condition: ctx.defaults.condition,
    storage_location_id: ctx.defaults.storageLocationId || null,
    status: 'acquired',
    physical_status: ctx.defaults.decision,
    confirmed_at: new Date().toISOString(),
    confirmed_by: ctx.userId,
    retail_price: retail,
    target_price: suggestPrice(retail, ctx.defaults.resalePercent, ctx.defaults.roundTo99),
    // Not an Amazon review item — keep it out of the review queue
    amazon_review_status: null,
    data_sources: [source],
  };
}

export interface CreatedItem extends MatchRow {
  lookup: ProductLookup | null;
}

/** Look the barcode up and create a new, autofilled item. */
export async function createFromBarcode(
  code: string,
  codeType: CodeType,
  ctx: IntakeContext,
  preLookup?: ProductLookup | null
): Promise<CreatedItem> {
  const lookup = preLookup !== undefined ? preLookup : await lookupProduct(code, codeType);
  const insert = buildItemFromLookup(code, codeType, lookup, ctx);
  const { data, error } = await supabase.from('items').insert(insert).select(MATCH_FIELDS).single();
  if (error) throw error;
  return { ...(data as unknown as MatchRow), lookup };
}

/** Create another unit of an existing item (same product, separate inventory row). */
export async function cloneUnit(sourceId: string, ctx: IntakeContext): Promise<MatchRow> {
  const { data: src, error: readErr } = await supabase.from('items').select('*').eq('id', sourceId).single();
  if (readErr) throw readErr;
  const insert: TablesInsert<'items'> = {
    team_id: ctx.teamId,
    created_by: ctx.userId,
    title: src.title,
    brand: src.brand,
    description: src.description,
    photos: src.photos,
    category_id: src.category_id,
    upc: src.upc,
    amazon_asin: src.amazon_asin,
    original_cost: src.original_cost,
    acquisition_date: new Date().toISOString().split('T')[0],
    acquisition_source: src.acquisition_source,
    condition: src.condition,
    storage_location_id: ctx.defaults.storageLocationId || src.storage_location_id,
    status: 'acquired',
    physical_status: ctx.defaults.decision,
    confirmed_at: new Date().toISOString(),
    confirmed_by: ctx.userId,
    retail_price: src.retail_price,
    target_price: src.target_price,
    amazon_review_status: null,
    data_sources: ['barcode_scan'],
  };
  const { data, error } = await supabase.from('items').insert(insert).select(MATCH_FIELDS).single();
  if (error) throw error;
  return data as unknown as MatchRow;
}

/**
 * Record another barcode for items (e.g. the ASIN behind an FNSKU sticker, or
 * the UPC printed next to it). Only fills blanks — never overwrites a code.
 */
export async function attachCode(itemIds: string[], code: string, codeType: CodeType): Promise<void> {
  if (itemIds.length === 0 || codeType === 'fnsku') return;
  const { error } =
    codeType === 'asin'
      ? await supabase.from('items').update({ amazon_asin: code }).in('id', itemIds).is('amazon_asin', null)
      : await supabase.from('items').update({ upc: code }).in('id', itemIds).is('upc', null);
  if (error) throw error;
}

export async function deleteItem(id: string): Promise<void> {
  const { error } = await supabase.from('items').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Product barcodes aren't on Amazon order exports, so an unknown UPC might
 * still be an Order Sheet item. If the looked-up title clearly matches one
 * unconfirmed item that has no barcode yet, return it.
 */
export async function findOrderSheetNameMatch(
  teamId: string,
  lookupTitle: string | null
): Promise<MatchRow | null> {
  if (!lookupTitle) return null;
  const { data } = await supabase
    .from('items')
    .select(MATCH_FIELDS)
    .eq('team_id', teamId)
    .eq('physical_status', 'unconfirmed')
    .is('upc', null)
    .limit(500);
  const rows = (data ?? []) as unknown as MatchRow[];
  const target = normalizeTitle(lookupTitle);
  let best: MatchRow | null = null;
  let bestScore = 0;
  let secondScore = 0;
  for (const row of rows) {
    if (!row.title) continue;
    const score = jaccardSimilarity(target, normalizeTitle(row.title));
    if (score > bestScore) {
      secondScore = bestScore;
      bestScore = score;
      best = row;
    } else if (score > secondScore) {
      secondScore = score;
    }
  }
  // Confident and unambiguous only
  return best && bestScore >= 0.5 && bestScore - secondScore >= 0.15 ? best : null;
}
