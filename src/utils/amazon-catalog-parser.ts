/**
 * Parser for the scraped Amazon product-catalog workbook
 * ("<name>_<n>_ASINs_<timestamp>.xlsx"), which has three sheets:
 *
 *   Data        one row per requested ASIN — title, highlight, bullets, description,
 *               brand, price, rating, category, … plus Status (Success/Redirect/Failed)
 *   Images      one row per image — ASIN, Variant (MAIN, PT01, …), HiRes/Large URL
 *   Tech Specs  one row per ASIN — UPC, manufacturer, model, dimensions, weight, …
 *
 * A second, smaller workbook ("Amazon_Visual_Export_<n>_ASINs.xlsx": Filtered Results,
 * Buy_Box, A+ Content, Brand Story) is also accepted. Its A+ marketing text fills in
 * descriptions the listing scrape lacks; its A+/Brand Story banner images are
 * deliberately NOT used as item photos.
 *
 * Everything is keyed by ASIN. A "Redirect" row's data lives under its Actual ASIN,
 * so each entry is indexed under both the requested and the actual ASIN.
 */
import * as XLSX from 'xlsx';

export interface CatalogEntry {
  /** The ASIN the data was actually scraped from */
  asin: string;
  title: string | null;
  brand: string | null;
  /** Highlight + bullets + description + key specs, as plain text */
  description: string | null;
  /** HiRes image URLs, main image first */
  photos: string[];
  /** Only set when the listing has exactly one UPC (variant listings have several) */
  upc: string | null;
  /** Current Amazon price; null when unavailable */
  retailPrice: number | null;
  /** A+ marketing copy — used as the description only when there's no listing text */
  aplusText: string | null;
}

export type CatalogMap = Map<string, CatalogEntry>;

const MAX_PHOTOS = 10;
const MAX_SPECS = 30;
const SKIP_SPEC_KEYS = new Set(['asin', 'asin_1', 'upc', 'brand name', 'brand']);

type Row = Record<string, string>;

const str = (v: unknown): string => (v == null ? '' : String(v).trim());

/** Collapse the blank-line / whitespace padding Amazon's HTML leaves behind. */
function tidy(text: string): string {
  return text
    .replace(/[\u200E\u200F\u200B\u00A0]/g, ' ')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function cleanHeader(h: string): string {
  return h.replace(/[\u200E\u200F\u200B]/g, '').replace(/\s+/g, ' ').trim();
}

function parseMoney(raw: string): number | null {
  const m = raw.replace(/,/g, '').match(/\$\s*(\d+(?:\.\d{1,2})?)/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return n > 0 ? n : null;
}

function imageRank(variant: string): number {
  if (variant === 'MAIN') return 0;
  const pt = variant.match(/^PT(\d+)$/);
  return pt ? 1 + parseInt(pt[1], 10) : 1000;
}

/** Whether a workbook is the scraped catalog (has Data + Images sheets). */
export function isCatalogWorkbook(wb: XLSX.WorkBook): boolean {
  if (!wb.SheetNames.includes('Data') || !wb.SheetNames.includes('Images')) return false;
  const header = (XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets.Data, { header: 1, range: 0 })[0] ?? []) as string[];
  return header.includes('Requested ASIN') && header.includes('Actual ASIN');
}

function rows(wb: XLSX.WorkBook, sheet: string): Row[] {
  if (!wb.Sheets[sheet]) return [];
  return XLSX.utils.sheet_to_json<Row>(wb.Sheets[sheet], { defval: '', raw: false });
}

function buildDescription(data: Row, specs: Row | undefined): string | null {
  const parts: string[] = [];

  const highlight = str(data['Item Highlight']);
  if (highlight) parts.push(highlight);

  const bullets: string[] = [];
  for (let i = 1; i <= 11; i++) {
    const b = str(data[`Bullet ${i}`]);
    if (b) bullets.push(`• ${b}`);
  }
  if (bullets.length) parts.push(bullets.join('\n'));

  const description = tidy(str(data['Product Description']));
  if (description) parts.push(description);

  if (specs) {
    const seen = new Set<string>();
    const lines: string[] = [];
    for (const [rawKey, rawVal] of Object.entries(specs)) {
      const key = cleanHeader(rawKey);
      const val = str(rawVal);
      const id = key.toLowerCase();
      if (!val || SKIP_SPEC_KEYS.has(id) || seen.has(id)) continue;
      seen.add(id);
      lines.push(`• ${key}: ${val.length > 200 ? `${val.slice(0, 200)}…` : val}`);
      if (lines.length >= MAX_SPECS) break;
    }
    if (lines.length) parts.push(`Specs\n${lines.join('\n')}`);
  }

  const category = str(data['Category']);
  if (category) parts.push(`Category: ${category}`);

  return parts.length ? parts.join('\n\n') : null;
}

/** Reads the three sheets into one lookup table keyed by (requested and actual) ASIN. */
export function parseCatalogWorkbook(wb: XLSX.WorkBook): CatalogMap {
  const data = rows(wb, 'Data');

  const imagesByAsin = new Map<string, { rank: number; url: string }[]>();
  for (const r of rows(wb, 'Images')) {
    const asin = str(r['ASIN']).toUpperCase();
    const url = str(r['HiRes Image URL']) || str(r['Large Image URL']);
    if (!asin || !/^https?:\/\//.test(url)) continue;
    const list = imagesByAsin.get(asin) ?? [];
    list.push({ rank: imageRank(str(r['Variant'])), url });
    imagesByAsin.set(asin, list);
  }

  const specsByAsin = new Map<string, Row>();
  for (const r of rows(wb, 'Tech Specs')) {
    const asin = str(r['ASIN']).toUpperCase();
    if (asin && !specsByAsin.has(asin)) specsByAsin.set(asin, r);
  }

  const catalog: CatalogMap = new Map();
  for (const r of data) {
    if (!/^(success|redirect)$/i.test(str(r['Status']))) continue;
    const actual = str(r['Actual ASIN']).toUpperCase();
    const requested = str(r['Requested ASIN']).toUpperCase();
    if (!actual) continue;

    const specs = specsByAsin.get(actual);
    const upcValues = str(specs?.['UPC']).split(/\s+/).filter((u) => /^\d{12,13}$/.test(u));
    const photos = (imagesByAsin.get(actual) ?? [])
      .sort((a, b) => a.rank - b.rank)
      .map((i) => i.url)
      .slice(0, MAX_PHOTOS);

    const entry: CatalogEntry = {
      asin: actual,
      title: str(r['Title']) || null,
      brand: str(r['Brand']) || str(specs?.['Brand Name']) || null,
      description: buildDescription(r, specs),
      photos,
      upc: upcValues.length === 1 ? upcValues[0] : null,
      retailPrice: parseMoney(str(r['Current Price'])),
      aplusText: null,
    };

    catalog.set(actual, entry);
    if (requested) catalog.set(requested, entry);
  }
  return catalog;
}

/** Whether a workbook is the "Visual Export" (Filtered Results + A+ Content sheets). */
export function isVisualExportWorkbook(wb: XLSX.WorkBook): boolean {
  return wb.SheetNames.includes('Filtered Results') && wb.SheetNames.includes('A+ Content');
}

const MAX_APLUS_CHARS = 4000;

export function parseVisualExportWorkbook(wb: XLSX.WorkBook): CatalogMap {
  const catalog: CatalogMap = new Map();
  const entryFor = (asin: string): CatalogEntry => {
    let e = catalog.get(asin);
    if (!e) {
      e = { asin, title: null, brand: null, description: null, photos: [], upc: null, retailPrice: null, aplusText: null };
      catalog.set(asin, e);
    }
    return e;
  };

  for (const r of rows(wb, 'Filtered Results')) {
    const asin = str(r['ASIN']).toUpperCase();
    if (!asin) continue;
    const e = entryFor(asin);
    e.title = str(r['Title']) || null;
    e.brand = str(r['Brand']) || null;
    e.retailPrice = parseMoney(str(r['Price']));
  }
  for (const r of rows(wb, 'A+ Content')) {
    const asin = str(r['ASIN']).toUpperCase();
    const text = tidy(str(r['A+ Content Text']));
    if (!asin || !text) continue;
    entryFor(asin).aplusText = text.length > MAX_APLUS_CHARS ? `${text.slice(0, MAX_APLUS_CHARS)}…` : text;
  }
  return catalog;
}

/** Folds `incoming` into `target`; existing values win, gaps are filled (order-independent for disjoint data). */
export function mergeCatalogInto(target: CatalogMap, incoming: CatalogMap): void {
  for (const [asin, inc] of incoming) {
    const cur = target.get(asin);
    if (!cur) {
      target.set(asin, inc);
      continue;
    }
    const merged: CatalogEntry = {
      asin: cur.asin,
      title: cur.title ?? inc.title,
      brand: cur.brand ?? inc.brand,
      description: cur.description ?? inc.description,
      photos: cur.photos.length ? cur.photos : inc.photos,
      upc: cur.upc ?? inc.upc,
      retailPrice: cur.retailPrice ?? inc.retailPrice,
      aplusText: cur.aplusText ?? inc.aplusText,
    };
    target.set(asin, merged);
    // keep requested/actual aliases pointing at the same merged entry
    if (inc.asin !== asin && target.get(inc.asin) === cur) target.set(inc.asin, merged);
  }
}

/** Reads whichever catalog workbook this is; null when it's neither. */
export function parseAnyCatalogWorkbook(wb: XLSX.WorkBook): CatalogMap | null {
  if (isCatalogWorkbook(wb)) return parseCatalogWorkbook(wb);
  if (isVisualExportWorkbook(wb)) return parseVisualExportWorkbook(wb);
  return null;
}

/** Fields to merge into an item row (insert or fill-if-empty update). */
export function catalogToItemFields(entry: CatalogEntry): Record<string, unknown> {
  return {
    description: entry.description ?? entry.aplusText,
    brand: entry.brand,
    upc: entry.upc,
    retail_price: entry.retailPrice,
    photos: entry.photos.length ? entry.photos : null,
  };
}
