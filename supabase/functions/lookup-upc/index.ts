// @ts-nocheck - Deno Edge Function (not Node.js)
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/**
 * Barcode → product lookup with a shared cache.
 *
 * Body (single):  { code: "012345678905", codeType?: "upc" | "isbn" | "asin" }
 *                 (legacy { upc: "..." } still works)
 * Body (batch):   { codes: ["...", "..."] }   — up to 25, used by list import
 *
 * Lookup order (first hit wins):
 *   0. product_catalog cache (found rows forever, misses retried after 14 days)
 *   ISBN  → Open Library → UPCitemdb
 *   UPC   → UPCitemdb → Open Food Facts
 *   ASIN  → OpenWeb Ninja (only if OPENWEBNINJA_API_KEY is set)
 *
 * Secrets (all optional):
 *   UPCITEMDB_API_KEY     paid UPCitemdb tier (free trial ≈ 100 lookups/day)
 *   OPENWEBNINJA_API_KEY  enables ASIN lookups (same key fetch-amazon-prices uses)
 * SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected by Supabase automatically.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const UPCITEMDB_TRIAL_URL = 'https://api.upcitemdb.com/prod/trial/lookup';
const UPCITEMDB_PAID_URL = 'https://api.upcitemdb.com/prod/v1/lookup';
const OPENWEBNINJA_URL = 'https://api.openwebninja.com/amazon/product';
const USER_AGENT = 'FluxAndFile/1.0 (inventory app)';
const NEGATIVE_CACHE_DAYS = 14;
const MAX_BATCH = 25;

type CodeType = 'upc' | 'isbn' | 'asin';

interface ProductLookup {
  code: string;
  codeType: CodeType;
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
  cached: boolean;
  error?: string;
  /** Legacy field kept for older clients */
  upc: string;
}

/** Source result before cache bookkeeping. `transient` = don't cache the miss. */
type SourceResult =
  | { hit: true; data: Partial<ProductLookup> & { raw?: unknown } }
  | { hit: false; transient?: boolean; error?: string };

// ── Code helpers ─────────────────────────────────────────────────────────────

function classify(raw: string, hint?: CodeType): { codeType: CodeType; digits: string; key: string } | null {
  const trimmed = (raw ?? '').trim().toUpperCase();
  if (!trimmed) return null;

  // ASIN (B0…) or ISBN-10 (9 digits + digit/X)
  if (/^B[A-Z0-9]{9}$/.test(trimmed)) {
    return { codeType: 'asin', digits: trimmed, key: trimmed };
  }
  if (/^\d{9}[\dX]$/.test(trimmed)) {
    // Book ASINs are ISBN-10s — try book sources
    return { codeType: hint === 'asin' ? 'asin' : 'isbn', digits: trimmed, key: trimmed };
  }

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 14) return null;
  const key = digits.replace(/^0+/, '') || digits;
  const isIsbn13 = digits.length === 13 && (digits.startsWith('978') || digits.startsWith('979'));
  return { codeType: isIsbn13 ? 'isbn' : 'upc', digits, key };
}

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/** Pick a sane "new" price from a recorded range — ignore wild high outliers. */
function pickRetail(low: number | null, high: number | null): number | null {
  if (low && high) return high > low * 3 ? low : Math.round(((low + high) / 2) * 100) / 100;
  return high ?? low ?? null;
}

function clean(s: unknown, max = 2000): string | null {
  if (typeof s !== 'string') return null;
  const t = s.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
}

// ── Sources ──────────────────────────────────────────────────────────────────

async function fromUpcItemDb(digits: string): Promise<SourceResult> {
  const apiKey = Deno.env.get('UPCITEMDB_API_KEY');
  const url = `${apiKey ? UPCITEMDB_PAID_URL : UPCITEMDB_TRIAL_URL}?upc=${digits}`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (apiKey) {
    headers['user_key'] = apiKey;
    headers['key_type'] = '3scale';
  }
  try {
    const res = await fetch(url, { headers });
    if (res.status === 429) {
      return { hit: false, transient: true, error: 'Daily lookup limit reached — try again tomorrow or add UPCITEMDB_API_KEY' };
    }
    if (!res.ok) return { hit: false, transient: res.status >= 500, error: `UPCitemdb ${res.status}` };
    const data = await res.json();
    const item = data?.items?.[0];
    if (!item?.title) return { hit: false };
    const images: string[] = Array.isArray(item.images)
      ? item.images.filter((u: unknown) => typeof u === 'string' && u.startsWith('http')).slice(0, 5)
      : [];
    const low = num(item.lowest_recorded_price);
    const high = num(item.highest_recorded_price);
    return {
      hit: true,
      data: {
        title: clean(item.title, 255),
        brand: clean(item.brand, 120),
        model: clean(item.model, 120),
        description: clean(item.description),
        category: clean(item.category, 255),
        imageUrl: images[0] ?? null,
        images,
        lowestPrice: low,
        highestPrice: high,
        retailPrice: pickRetail(low, high),
        source: 'upcitemdb',
        raw: item,
      },
    };
  } catch (e) {
    return { hit: false, transient: true, error: e instanceof Error ? e.message : 'UPCitemdb error' };
  }
}

async function fromOpenFoodFacts(digits: string): Promise<SourceResult> {
  // Covers groceries, health & beauty (shared barcode namespace)
  if (![8, 12, 13].includes(digits.length)) return { hit: false };
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${digits}.json?fields=product_name,brands,image_front_url,image_url,categories,quantity`,
      { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } },
    );
    if (!res.ok) return { hit: false, transient: res.status >= 500 };
    const data = await res.json();
    const p = data?.product;
    if (data?.status !== 1 || !p?.product_name) return { hit: false };
    const img = p.image_front_url || p.image_url || null;
    const title = [p.product_name, p.quantity].filter(Boolean).join(' — ');
    return {
      hit: true,
      data: {
        title: clean(title, 255),
        brand: clean(String(p.brands ?? '').split(',')[0], 120),
        category: clean(String(p.categories ?? '').split(',').slice(0, 3).join(' > '), 255),
        imageUrl: img,
        images: img ? [img] : [],
        source: 'openfoodfacts',
        raw: p,
      },
    };
  } catch {
    return { hit: false, transient: true };
  }
}

async function fromOpenLibrary(isbn: string): Promise<SourceResult> {
  try {
    const res = await fetch(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`,
      { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } },
    );
    if (!res.ok) return { hit: false, transient: res.status >= 500 };
    const data = await res.json();
    const book = data?.[`ISBN:${isbn}`];
    if (!book?.title) return { hit: false };
    const authors = Array.isArray(book.authors) ? book.authors.map((a: { name?: string }) => a.name).filter(Boolean) : [];
    const title = [book.title, book.subtitle].filter(Boolean).join(': ');
    const img = book.cover?.large || book.cover?.medium || null;
    const subjects = Array.isArray(book.subjects) ? book.subjects.slice(0, 3).map((s: { name?: string }) => s.name).filter(Boolean) : [];
    const publisher = Array.isArray(book.publishers) ? book.publishers[0]?.name : null;
    const details = [
      authors.length ? `By ${authors.join(', ')}` : null,
      publisher ? `Publisher: ${publisher}` : null,
      book.publish_date ? `Published: ${book.publish_date}` : null,
      book.number_of_pages ? `${book.number_of_pages} pages` : null,
      `ISBN: ${isbn}`,
    ].filter(Boolean).join('\n');
    return {
      hit: true,
      data: {
        title: clean(authors.length ? `${title} by ${authors[0]}` : title, 255),
        brand: clean(publisher, 120),
        description: details,
        category: ['Books', ...subjects].join(' > '),
        imageUrl: img,
        images: img ? [img] : [],
        source: 'openlibrary',
        raw: book,
      },
    };
  } catch {
    return { hit: false, transient: true };
  }
}

async function fromOpenWebNinja(asin: string): Promise<SourceResult> {
  const apiKey = Deno.env.get('OPENWEBNINJA_API_KEY');
  if (!apiKey) return { hit: false, transient: true, error: 'ASIN lookup needs OPENWEBNINJA_API_KEY' };
  try {
    const res = await fetch(`${OPENWEBNINJA_URL}?asin=${asin}&country=US`, {
      headers: { 'x-api-key': apiKey, Accept: 'application/json' },
    });
    if (res.status === 404) return { hit: false };
    if (!res.ok) return { hit: false, transient: true, error: `OpenWeb Ninja ${res.status}` };
    const json = await res.json();
    const p = json?.data;
    if (!p?.product_title) return { hit: false };
    const price = num(p.product_price) ?? num(p.product_original_price);
    const original = num(p.product_original_price);
    const img = p.product_photo || null;
    return {
      hit: true,
      data: {
        title: clean(p.product_title, 255),
        brand: clean(p.product_byline?.replace(/^(Visit the|Brand:)\s*/i, '').replace(/\s*Store$/i, ''), 120),
        description: clean(Array.isArray(p.about_product) ? p.about_product.join('\n') : p.product_description),
        category: clean(p.category_path?.map?.((c: { name?: string }) => c.name).join(' > ') ?? p.category, 255),
        imageUrl: img,
        images: img ? [img] : [],
        lowestPrice: price,
        highestPrice: original,
        retailPrice: original ?? price,
        source: 'openwebninja',
        raw: p,
      },
    };
  } catch (e) {
    return { hit: false, transient: true, error: e instanceof Error ? e.message : 'OpenWeb Ninja error' };
  }
}

// ── Core ─────────────────────────────────────────────────────────────────────

function emptyResult(code: string, codeType: CodeType, extra: Partial<ProductLookup> = {}): ProductLookup {
  return {
    code, codeType, found: false, title: null, brand: null, model: null, description: null,
    category: null, imageUrl: null, images: [], lowestPrice: null, highestPrice: null,
    retailPrice: null, source: null, cached: false, upc: code, ...extra,
  };
}

function rowToResult(row: Record<string, any>, digits: string): ProductLookup {
  return {
    code: digits,
    codeType: row.code_type,
    found: row.found,
    title: row.title,
    brand: row.brand,
    model: row.model,
    description: row.description,
    category: row.category,
    imageUrl: row.image_url,
    images: row.images ?? [],
    lowestPrice: row.lowest_price != null ? Number(row.lowest_price) : null,
    highestPrice: row.highest_price != null ? Number(row.highest_price) : null,
    retailPrice: row.retail_price != null ? Number(row.retail_price) : null,
    source: row.source,
    cached: true,
    upc: digits,
  };
}

async function lookupOne(
  db: ReturnType<typeof createClient> | null,
  rawCode: string,
  hint?: CodeType,
): Promise<{ result: ProductLookup; calledExternal: boolean }> {
  const parsed = classify(rawCode, hint);
  if (!parsed) {
    return { result: emptyResult(String(rawCode ?? ''), 'upc', { error: 'Invalid barcode' }), calledExternal: false };
  }
  const { codeType, digits, key } = parsed;

  // 0. Cache
  if (db) {
    const { data: row } = await db.from('product_catalog').select('*').eq('code', key).maybeSingle();
    if (row) {
      const ageDays = (Date.now() - new Date(row.fetched_at).getTime()) / 86_400_000;
      if (row.found || ageDays < NEGATIVE_CACHE_DAYS) {
        return { result: rowToResult(row, digits), calledExternal: false };
      }
    }
  }

  // 1. External sources
  const chain: Array<() => Promise<SourceResult>> =
    codeType === 'asin'
      ? [() => fromOpenWebNinja(digits)]
      : codeType === 'isbn'
        ? [() => fromOpenLibrary(digits), () => fromUpcItemDb(digits)]
        : [() => fromUpcItemDb(digits), () => fromOpenFoodFacts(digits)];

  let hit: (Partial<ProductLookup> & { raw?: unknown }) | null = null;
  let transient = false;
  let lastError: string | undefined;
  for (const source of chain) {
    const r = await source();
    if (r.hit) {
      hit = r.data;
      break;
    }
    if (r.transient) transient = true;
    if (r.error) lastError = r.error;
  }

  const result: ProductLookup = hit
    ? { ...emptyResult(digits, codeType), ...hit, found: true, cached: false }
    : emptyResult(digits, codeType, lastError ? { error: lastError } : {});
  delete (result as Record<string, unknown>).raw;

  // 2. Cache hits always; cache misses only when every source gave a definite "no"
  if (db && (hit || !transient)) {
    const { error } = await db.from('product_catalog').upsert({
      code: key,
      code_type: codeType,
      found: !!hit,
      title: result.title,
      brand: result.brand,
      model: result.model,
      description: result.description,
      category: result.category,
      image_url: result.imageUrl,
      images: result.images,
      lowest_price: result.lowestPrice,
      highest_price: result.highestPrice,
      retail_price: result.retailPrice,
      source: result.source,
      raw: hit?.raw ?? null,
      fetched_at: new Date().toISOString(),
    });
    if (error) console.warn('[lookup-upc] cache write failed:', error.message);
  }

  console.log(`[lookup-upc] ${digits} (${codeType}) → ${result.found ? `${result.title} via ${result.source}` : `not found${lastError ? `: ${lastError}` : ''}`}`);
  return { result, calledExternal: true };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const body = await req.json() as { code?: string; upc?: string; codeType?: CodeType; codes?: string[] };

    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const db = url && serviceKey
      ? createClient(url, serviceKey, { auth: { persistSession: false } })
      : null;
    if (!db) console.warn('[lookup-upc] No service role key — running without cache');

    // Batch mode (list import)
    if (Array.isArray(body.codes)) {
      const codes = [...new Set(body.codes.map((c) => String(c ?? '').trim()).filter(Boolean))].slice(0, MAX_BATCH);
      const results: ProductLookup[] = [];
      for (const code of codes) {
        const { result, calledExternal } = await lookupOne(db, code);
        results.push(result);
        // UPCitemdb returns TOO_FAST if hammered
        if (calledExternal) await new Promise((r) => setTimeout(r, 350));
      }
      return json({ results });
    }

    const code = body.code ?? body.upc;
    if (!code) return json({ error: 'Missing code' }, 400);
    const { result } = await lookupOne(db, code, body.codeType);
    if (result.error === 'Invalid barcode') return json({ ...result }, 400);
    return json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[lookup-upc] Error:', message);
    return json({ error: message }, 500);
  }
});
