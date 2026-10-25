import { supabase } from '@/integrations/supabase/client';
import type { Category } from '@/hooks/useInventory';
import type { CodeType } from '@/lib/barcode';

/** Response from the lookup-upc edge function (mirrors ProductLookup there). */
export interface ProductLookup {
  code: string;
  codeType: 'upc' | 'isbn' | 'asin' | 'fnsku';
  found: boolean;
  title: string | null;
  brand: string | null;
  model: string | null;
  description: string | null;
  category: string | null;
  imageUrl: string | null;
  images: string[];
  lowestPrice: number | null;
  highestPrice: number | null;
  retailPrice: number | null;
  source: string | null;
  /** ASIN when an Amazon source answered — how FNSKU stickers resolve */
  asin: string | null;
  /** Matched by an Amazon search rather than an exact barcode record */
  fuzzy: boolean;
  cached: boolean;
  error?: string;
}

const EMPTY: Omit<ProductLookup, 'code' | 'codeType'> = {
  found: false,
  title: null,
  brand: null,
  model: null,
  description: null,
  category: null,
  imageUrl: null,
  images: [],
  lowestPrice: null,
  highestPrice: null,
  retailPrice: null,
  source: null,
  asin: null,
  fuzzy: false,
  cached: false,
};

/** Look up one barcode. Never throws — a failed lookup returns found:false. */
export async function lookupProduct(
  code: string,
  codeType?: CodeType
): Promise<ProductLookup> {
  try {
    const { data, error } = await supabase.functions.invoke('lookup-upc', {
      body: { code, codeType },
    });
    if (error || !data) {
      return { ...EMPTY, code, codeType: codeType ?? 'upc', error: error?.message ?? 'Lookup failed' };
    }
    return { ...EMPTY, ...(data as Partial<ProductLookup>), code, codeType: (data as ProductLookup).codeType ?? codeType ?? 'upc' };
  } catch (e) {
    return {
      ...EMPTY,
      code,
      codeType: codeType ?? 'upc',
      error: e instanceof Error ? e.message : 'Lookup failed',
    };
  }
}

/**
 * Look up many barcodes (list import). Chunks into batches of 25.
 * Returns a map keyed by the code as passed in.
 */
export async function lookupProducts(
  codes: string[],
  onProgress?: (done: number, total: number) => void
): Promise<Map<string, ProductLookup>> {
  const unique = [...new Set(codes.filter(Boolean))];
  const out = new Map<string, ProductLookup>();
  for (let i = 0; i < unique.length; i += 25) {
    const chunk = unique.slice(i, i + 25);
    try {
      const { data } = await supabase.functions.invoke('lookup-upc', { body: { codes: chunk } });
      const results = ((data as { results?: ProductLookup[] })?.results ?? []) as ProductLookup[];
      chunk.forEach((code, idx) => {
        const r = results[idx];
        if (r) out.set(code, { ...EMPTY, ...r });
      });
    } catch {
      // leave these codes unresolved
    }
    onProgress?.(Math.min(i + chunk.length, unique.length), unique.length);
  }
  return out;
}

// ── Autofill helpers ─────────────────────────────────────────────────────────

function singular(word: string): string {
  return word.replace(/ies$/, 'y').replace(/(ss|us)$/, '$1').replace(/s$/, '');
}

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1)
    .map(singular);
}

/**
 * Match a lookup category path ("Electronics > Audio > Headphones") or a
 * free-text category from a spreadsheet to one of the team's categories.
 * Prefers the deepest segment that matches.
 */
export function matchCategory(
  categoryText: string | null | undefined,
  categories: Pick<Category, 'id' | 'name'>[]
): string | null {
  if (!categoryText || categories.length === 0) return null;
  const text = categoryText.trim().toLowerCase();

  // Exact name match first (spreadsheet columns usually use your own names)
  const exact = categories.find((c) => c.name.trim().toLowerCase() === text);
  if (exact) return exact.id;

  const segments = categoryText.split(/>|\/|\||,/).map((s) => s.trim()).filter(Boolean).reverse();
  for (const seg of segments) {
    const segTokens = new Set(tokens(seg));
    for (const cat of categories) {
      const catTokens = tokens(cat.name);
      if (catTokens.length > 0 && catTokens.every((t) => segTokens.has(t))) return cat.id;
    }
  }
  return null;
}

/**
 * Suggested resale price from a retail price.
 * @param percent  e.g. 60 = 60% of retail
 * @param roundTo99  12.40 → 12.99, 24.00 → 23.99 (otherwise whole dollars)
 */
export function suggestPrice(
  retail: number | null | undefined,
  percent: number,
  roundTo99: boolean
): number | null {
  if (!retail || retail <= 0 || !percent) return null;
  const raw = (retail * percent) / 100;
  if (raw < 1) return roundTo99 ? 0.99 : 1;
  // 12.40 → 12.99, 24.00 → 23.99 (epsilon guards float noise like 24.000000000000004)
  return roundTo99 ? Math.round((Math.ceil(raw - 1e-9) - 0.01) * 100) / 100 : Math.round(raw);
}

/** Placeholder title used when a barcode can't be identified. */
export function unknownItemTitle(code: string): string {
  return `Unknown item (${code})`;
}

export function isUnknownTitle(title: string | null | undefined): boolean {
  return !title || title.startsWith('Unknown item (');
}
