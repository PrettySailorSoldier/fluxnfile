/**
 * Keyword search over everything we know about an item, for the Order Sheet and Inventory.
 *
 * Every word typed has to turn up somewhere on the item — the title, brand, category,
 * description, notes, storage spot, source/status, buyer, or one of its codes — in any order:
 *  - "lights string warm" finds "Warm White LED String Lights";
 *  - plurals and sizes are spelled the same on both sides ("light" ↔ "Lights",
 *    "50 ft" ↔ "50ft", "4 pack" ↔ "4-Pack");
 *  - a word matches the start of a word ("lig" → "Lights"), and a long word or a number
 *    matches anywhere in run-together text ("usbc" → "USB-C", "4567" → order 112-…4567).
 *
 * Results are ranked: hits in the title or brand count more than hits in notes.
 */
import { normalizeText } from '@/lib/orderMatch';
import { conditionLabels, statusConfig, type Item } from '@/hooks/useInventory';

export type SearchField =
  | 'title'
  | 'brand'
  | 'category'
  | 'description'
  | 'notes'
  | 'location'
  | 'details'
  | 'buyer'
  | 'codes';

const FIELD_WEIGHT: Record<SearchField, number> = {
  title: 5,
  codes: 5,
  brand: 4,
  buyer: 4,
  category: 3,
  description: 2,
  location: 2,
  notes: 1,
  details: 1,
};

const FIELD_LABEL: Record<SearchField, string> = {
  title: 'title',
  brand: 'brand',
  category: 'category',
  description: 'description',
  notes: 'notes',
  location: 'location',
  details: 'source/status',
  buyer: 'buyer',
  codes: 'ASIN/UPC/order #',
};

/** Words that never narrow a search ("lights for patio") */
const STOP = new Set(['for', 'and', 'with', 'the', 'of', 'to', 'in', 'on', 'by', 'an', 'or', 'at', 'from', 'a']);

/** "lights" → "light", "batteries" → "battery", "boxes" → "box"; leaves "glass", "bus" alone. */
function stem(w: string): string {
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 4 && /(?:x|ch|sh|ss)es$/.test(w)) return w.slice(0, -2);
  return w.length > 3 && w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') ? w.slice(0, -1) : w;
}

function words(s: string): string[] {
  return normalizeText(s).split(/[^a-z0-9]+/).filter(Boolean).map(stem);
}

interface FieldIndex {
  field: SearchField;
  words: string[];
  /** Letters and digits only, run together — for codes and "usbc"-style typing */
  joined: string;
}

type SearchableItem = Pick<
  Item,
  | 'title'
  | 'brand'
  | 'description'
  | 'refurbish_notes'
  | 'review_notes'
  | 'flag_note'
  | 'fb_conversation_notes'
  | 'acquisition_source'
  | 'data_sources'
  | 'is_vine_order'
  | 'status'
  | 'condition'
  | 'amazon_asin'
  | 'fnsku'
  | 'upc'
  | 'amazon_order_number'
  | 'amazon_order_id'
  | 'tracking_number'
  | 'category'
  | 'storage_location'
  | 'offers'
  | 'meetups'
>;

function fieldTexts(item: SearchableItem): [SearchField, (string | null | undefined)[]][] {
  return [
    ['title', [item.title]],
    ['brand', [item.brand]],
    ['category', [item.category?.name]],
    ['description', [item.description]],
    ['notes', [item.refurbish_notes, item.review_notes, item.flag_note, item.fb_conversation_notes]],
    ['location', [item.storage_location?.name]],
    [
      'details',
      [
        item.acquisition_source,
        ...(item.data_sources ?? []),
        item.is_vine_order ? 'Vine' : null,
        statusConfig[item.status]?.label,
        conditionLabels[item.condition],
      ],
    ],
    [
      'buyer',
      [...(item.offers ?? []), ...(item.meetups ?? [])].flatMap((b) => [b.buyer_name, b.buyer_contact]),
    ],
    [
      'codes',
      [
        item.amazon_asin,
        item.fnsku,
        item.upc,
        item.amazon_order_number,
        item.amazon_order_id,
        item.tracking_number != null ? String(item.tracking_number) : null,
      ],
    ],
  ];
}

// Items are rebuilt on every refetch, so a WeakMap lets old indexes go with them
const indexCache = new WeakMap<object, FieldIndex[]>();

function indexOf(item: SearchableItem): FieldIndex[] {
  let index = indexCache.get(item);
  if (!index) {
    index = fieldTexts(item)
      .map(([field, parts]) => {
        const text = parts.filter(Boolean).join(' ');
        return { field, words: words(text), joined: normalizeText(text).replace(/[^a-z0-9]/g, '') };
      })
      .filter((f) => f.words.length > 0);
    indexCache.set(item, index);
  }
  return index;
}

/** The words of a search box entry, ready for {@link matchItem} / {@link searchItems}. Empty → no search. */
export function parseQuery(query: string): string[] {
  const all = words(query);
  const kept = all.filter((w) => !STOP.has(w));
  // A search made only of little words ("on") still means something
  return [...new Set(kept.length > 0 ? kept : all)];
}

/** How well one typed word matches a field: 1 whole word, 0.8 start of a word, 0.5 inside run-together text */
function wordCredit(term: string, f: FieldIndex): number {
  let best = 0;
  for (const w of f.words) {
    if (w === term) return 1;
    if (w.startsWith(term)) best = 0.8;
  }
  if (best === 0 && (term.length >= 4 || /\d/.test(term)) && f.joined.includes(term)) best = 0.5;
  return best;
}

export interface SearchHit<T> {
  item: T;
  /** Only comparable within one search */
  score: number;
  /** Where the words were found */
  fields: SearchField[];
}

/** Null when some typed word is nowhere on the item. */
export function matchItem<T extends SearchableItem>(item: T, terms: string[]): SearchHit<T> | null {
  const index = indexOf(item);
  const fields = new Set<SearchField>();
  let score = 0;
  for (const term of terms) {
    let best = 0;
    let bestField: SearchField | null = null;
    for (const f of index) {
      const credit = wordCredit(term, f) * FIELD_WEIGHT[f.field];
      if (credit > best) {
        best = credit;
        bestField = f.field;
      }
    }
    if (!bestField) return null;
    fields.add(bestField);
    score += best;
  }
  // The words in the title's own order, side by side ("string lights")
  if (terms.length > 1 && item.title && words(item.title).join(' ').includes(terms.join(' '))) score += 3;
  return { item, score, fields: [...fields] };
}

/** Items matching every word, best first (ties keep their list order). */
export function searchItems<T extends SearchableItem>(items: T[], terms: string[]): SearchHit<T>[] {
  const hits: SearchHit<T>[] = [];
  for (const item of items) {
    const hit = matchItem(item, terms);
    if (hit) hits.push(hit);
  }
  return hits.sort((a, b) => b.score - a.score);
}

/** "Found in description, notes" — when the title alone doesn't explain why an item showed up. */
export function matchNote(hit: SearchHit<unknown>): string | null {
  if (hit.fields.includes('title')) return null;
  return `Found in ${hit.fields.map((f) => FIELD_LABEL[f]).join(', ')}`;
}
