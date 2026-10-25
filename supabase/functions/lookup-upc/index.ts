// @ts-nocheck - Deno Edge Function (not Node.js)
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/**
 * Barcode → product lookup with a shared cache.
 *
 * Body (single):  { code: "012345678905" }   (codeType is accepted but ignored —
 *                 the code itself decides; legacy { upc: "..." } still works)
 * Body (batch):   { codes: ["...", "..."] }   — up to 25, used by list import
 *
 * Codes are check-digit validated first (invalid → "Invalid barcode", no API call)
 * and canonicalised (11-digit → UPC-A, GTIN-14/EAN-13 padding zeros dropped).
 *
 * Lookup order (first hit wins):
 *   0. product_catalog cache (found rows forever, misses retried after 14 days)
 *   ISBN  → Open Library → UPCitemdb → Amazon product details (ISBN-10 = book ASIN)
 *   UPC   → UPCitemdb → Open Food Facts → Open Products Facts → Amazon search
 *   ASIN  → Amazon product details
 *   FNSKU → nothing: X00 stickers are seller-specific and Amazon search doesn't
 *           index them (tested), so no lookup is spent. The app reads the
 *           product name printed on the sticker instead.
 *   (Amazon sources need OPENWEBNINJA_API_KEY)
 *
 * Secrets (all optional):
 *   UPCITEMDB_API_KEY     paid UPCitemdb tier (free trial ≈ 100 lookups/day)
 *   OPENWEBNINJA_API_KEY  Real-Time Amazon Data key (same one fetch-amazon-prices uses).
 *                         Enables ASIN/FNSKU lookups and an Amazon search for
 *                         barcodes the free databases don't know (common for
 *                         non-US EAN-13s).
 * SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected by Supabase automatically.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const UPCITEMDB_TRIAL_URL = 'https://api.upcitemdb.com/prod/trial/lookup';
const UPCITEMDB_PAID_URL = 'https://api.upcitemdb.com/prod/v1/lookup';
const AMAZON_DETAILS_URL = 'https://api.openwebninja.com/realtime-amazon-data/product-details';
const AMAZON_SEARCH_URL = 'https://api.openwebninja.com/realtime-amazon-data/search';
const USER_AGENT = 'FluxAndFile/1.0 (inventory app)';
const NEGATIVE_CACHE_DAYS = 14;
const MAX_BATCH = 25;

type CodeType = 'upc' | 'isbn' | 'asin' | 'fnsku';

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
  /** Amazon ASIN when an Amazon source answered (lets the app match orders / resolve FNSKUs) */
  asin: string | null;
  /** True when the product came from an Amazon keyword search — worth a glance */
  fuzzy: boolean;
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

// Mirrors src/lib/barcode.ts — keep the two in step.

/** GS1 mod-10 check digit for the digits before it. */
function gtinCheckDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    sum += Number(body[body.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

function isValidGtin(digits: string): boolean {
  if (!/^(\d{8}|\d{12,14})$/.test(digits)) return false;
  return gtinCheckDigit(digits.slice(0, -1)) === Number(digits[digits.length - 1]);
}

function isValidIsbn10(code: string): boolean {
  if (!/^\d{9}[\dX]$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += (code[i] === 'X' ? 10 : Number(code[i])) * (10 - i);
  return sum % 11 === 0;
}

function isbn10To13(isbn10: string): string {
  const body = `978${isbn10.slice(0, 9)}`;
  return `${body}${gtinCheckDigit(body)}`;
}

/** 8-digit UPC-E → 12-digit UPC-A, or null when it isn't a valid UPC-E. */
function upcEToUpcA(d: string): string | null {
  if (!/^[01]\d{7}$/.test(d)) return null;
  const [d1, d2, d3, d4, d5, d6] = d.slice(1, 7).split('');
  const body =
    d6 <= '2' ? `${d1}${d2}${d6}0000${d3}${d4}${d5}`
    : d6 === '3' ? `${d1}${d2}${d3}00000${d4}${d5}`
    : d6 === '4' ? `${d1}${d2}${d3}${d4}00000${d5}`
    : `${d1}${d2}${d3}${d4}${d5}0000${d6}`;
  const upcA = `${d[0]}${body}`;
  return String(gtinCheckDigit(upcA)) === d[7] ? `${upcA}${d[7]}` : null;
}

/**
 * Validate (check digit) and canonicalise a code, so typos never cost an API
 * call and every spelling of one product shares a cache row.
 */
function classify(raw: string): { codeType: CodeType; digits: string; key: string } | null {
  const trimmed = (raw ?? '').trim().toUpperCase();
  if (!trimmed) return null;

  // Amazon FNSKU sticker (X00…)
  if (/^X0[A-Z0-9]{8}$/.test(trimmed)) {
    return { codeType: 'fnsku', digits: trimmed, key: trimmed };
  }

  // ASIN (B0…)
  if (/^B[A-Z0-9]{9}$/.test(trimmed)) {
    return { codeType: 'asin', digits: trimmed, key: trimmed };
  }
  // ISBN-10 — also how Amazon numbers books, so a numeric "ASIN" goes to book sources
  const compact = trimmed.replace(/[\s-]/g, '');
  if (/^\d{9}[\dX]$/.test(compact)) {
    return isValidIsbn10(compact) ? { codeType: 'isbn', digits: compact, key: compact } : null;
  }

  // Spreadsheets: "012345678905.0", "UPC 0123-4567-8905"
  let digits = trimmed.replace(/\.0+$/, '').replace(/\D/g, '');
  if (digits.length === 11) digits = `0${digits}`; // UPC-A that lost its leading zero
  if (digits.length === 8) {
    // UPC-E typed into a list; wins over EAN-8 (EAN-8s starting 0/1 are in-store codes)
    digits = upcEToUpcA(digits) ?? digits;
  }
  if (!isValidGtin(digits)) return null;
  // GTIN-14 / EAN-13 padding zeros → UPC-A (case codes with indicator 1–8 stay 14 digits)
  while (digits.length > 12 && digits[0] === '0') digits = digits.slice(1);

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

/**
 * Open Food Facts and its sister databases share one barcode namespace and API:
 * food (openfoodfacts), cosmetics (openbeautyfacts), everything else (openproductsfacts).
 */
async function fromOpenFacts(digits: string, host: string, source: string): Promise<SourceResult> {
  if (![8, 12, 13].includes(digits.length)) return { hit: false };
  try {
    const res = await fetch(
      `https://${host}/api/v2/product/${digits}.json?fields=product_name,brands,image_front_url,image_url,categories,quantity`,
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
        source,
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

function amazonHeaders(apiKey: string) {
  return { 'x-api-key': apiKey, Accept: 'application/json' };
}

/** Amazon product details by ASIN. */
async function fromAmazonDetails(asin: string): Promise<SourceResult> {
  const apiKey = Deno.env.get('OPENWEBNINJA_API_KEY');
  if (!apiKey) return { hit: false, transient: true, error: 'ASIN lookup needs OPENWEBNINJA_API_KEY' };
  try {
    const res = await fetch(`${AMAZON_DETAILS_URL}?asin=${encodeURIComponent(asin)}&country=US`, {
      headers: amazonHeaders(apiKey),
    });
    if (res.status === 404) return { hit: false };
    if (!res.ok) return { hit: false, transient: true, error: `Amazon lookup ${res.status}` };
    const json = await res.json();
    const p = json?.data;
    if (!p?.product_title) return { hit: false };
    const price = num(p.product_price) ?? num(p.product_original_price);
    const original = num(p.product_original_price);
    const photos: string[] = [p.product_photo, ...(Array.isArray(p.product_photos) ? p.product_photos : [])]
      .filter((u: unknown) => typeof u === 'string' && u.startsWith('http'));
    const images = [...new Set(photos)].slice(0, 5);
    return {
      hit: true,
      data: {
        title: clean(p.product_title, 255),
        brand: clean(p.product_byline?.replace?.(/^(Visit the|Brand:)\s*/i, '').replace(/\s*Store$/i, ''), 120),
        description: clean(Array.isArray(p.about_product) ? p.about_product.join('\n') : p.product_description),
        category: clean(p.category_path?.map?.((c: { name?: string }) => c.name).join(' > ') ?? p.category?.name ?? p.category, 255),
        imageUrl: images[0] ?? null,
        images,
        lowestPrice: price,
        highestPrice: original,
        retailPrice: original ?? price,
        asin: clean(p.asin, 10) ?? asin,
        source: 'amazon',
        raw: p,
      },
    };
  } catch (e) {
    return { hit: false, transient: true, error: e instanceof Error ? e.message : 'Amazon lookup error' };
  }
}

/**
 * Search Amazon for a barcode and take the top product. Amazon indexes many
 * UPC/EAN codes, so this finds products the free barcode
 * databases have never seen. One request: the search row has the title, photo
 * and price, and the ASIN is what matters for matching orders — skipping the
 * details call halves the cost of sorting a pile of boxes.
 */
async function fromAmazonSearch(query: string): Promise<SourceResult> {
  const apiKey = Deno.env.get('OPENWEBNINJA_API_KEY');
  if (!apiKey) {
    return { hit: false, transient: true, error: 'Not in the free barcode databases — set OPENWEBNINJA_API_KEY to also search Amazon' };
  }
  try {
    const res = await fetch(`${AMAZON_SEARCH_URL}?query=${encodeURIComponent(query)}&country=US&page=1`, {
      headers: amazonHeaders(apiKey),
    });
    if (!res.ok) return { hit: false, transient: res.status === 429 || res.status >= 500, error: `Amazon search ${res.status}` };
    const json = await res.json();
    const products = Array.isArray(json?.data?.products) ? json.data.products : [];
    const top = products.find((p: { asin?: string; product_title?: string }) => p?.asin && p?.product_title);
    if (!top) return { hit: false };

    const price = num(top.product_price);
    const original = num(top.product_original_price);
    const img = typeof top.product_photo === 'string' && top.product_photo.startsWith('http') ? top.product_photo : null;
    return {
      hit: true,
      data: {
        title: clean(top.product_title, 255),
        imageUrl: img,
        images: img ? [img] : [],
        lowestPrice: price,
        highestPrice: original,
        retailPrice: original ?? price,
        asin: top.asin,
        fuzzy: true,
        source: 'amazon-search',
        raw: top,
      },
    };
  } catch (e) {
    return { hit: false, transient: true, error: e instanceof Error ? e.message : 'Amazon search error' };
  }
}

// ── Core ─────────────────────────────────────────────────────────────────────

function emptyResult(code: string, codeType: CodeType, extra: Partial<ProductLookup> = {}): ProductLookup {
  return {
    code, codeType, found: false, title: null, brand: null, model: null, description: null,
    category: null, imageUrl: null, images: [], lowestPrice: null, highestPrice: null,
    retailPrice: null, source: null, asin: null, fuzzy: false, cached: false, upc: code, ...extra,
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
    asin: row.asin ?? null,
    fuzzy: row.source === 'amazon-search',
    cached: true,
    upc: digits,
  };
}

async function lookupOne(
  db: ReturnType<typeof createClient> | null,
  rawCode: string,
): Promise<{ result: ProductLookup; calledExternal: boolean }> {
  const parsed = classify(rawCode);
  if (!parsed) {
    return { result: emptyResult(String(rawCode ?? ''), 'upc', { error: 'Invalid barcode' }), calledExternal: false };
  }
  const { codeType, digits, key } = parsed;

  // X00 stickers: an Amazon search finds nothing for them, so don't spend a lookup
  if (codeType === 'fnsku') {
    return {
      result: emptyResult(digits, codeType, { error: 'Amazon X00 stickers can’t be looked up — pick the item from your list' }),
      calledExternal: false,
    };
  }

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
      ? [() => fromAmazonDetails(digits)]
      : codeType === 'isbn'
        ? [
            () => fromOpenLibrary(digits),
            () => fromUpcItemDb(digits.length === 10 ? isbn10To13(digits) : digits),
            // A numeric book ASIN is its ISBN-10 — Amazon knows books Open Library doesn't
            ...(digits.length === 10 && Deno.env.get('OPENWEBNINJA_API_KEY') ? [() => fromAmazonDetails(digits)] : []),
          ]
        : [
            () => fromUpcItemDb(digits),
            () => fromOpenFacts(digits, 'world.openfoodfacts.org', 'openfoodfacts'),
            () => fromOpenFacts(digits, 'world.openproductsfacts.org', 'openproductsfacts'),
            () => fromOpenFacts(digits, 'world.openbeautyfacts.org', 'openbeautyfacts'),
            () => fromAmazonSearch(digits),
          ];

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
      asin: result.asin,
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
    const { result } = await lookupOne(db, code);
    if (result.error === 'Invalid barcode') return json({ ...result }, 400);
    return json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[lookup-upc] Error:', message);
    return json({ error: message }, 500);
  }
});
