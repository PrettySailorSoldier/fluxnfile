/**
 * Generic itemized-list parser for Flux&File.
 *
 * Accepts any CSV / TSV / Excel sheet (or rows pasted from a spreadsheet),
 * finds the header row, and guesses which column holds which item field.
 * The user confirms the mapping in ListImportDialog before anything is saved.
 */
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { ItemCondition, ItemStatus } from '@/hooks/useInventory';

export type ListField =
  | 'title'
  | 'description'
  | 'upc'
  | 'asin'
  | 'sku'
  | 'quantity'
  | 'cost'
  | 'targetPrice'
  | 'retailPrice'
  | 'condition'
  | 'category'
  | 'location'
  | 'brand'
  | 'date'
  | 'source'
  | 'notes'
  | 'photo'
  | 'status'
  | 'decision';

export interface FieldDef {
  field: ListField;
  label: string;
  hint?: string;
  /** Exact header names (lowercased, punctuation-stripped) */
  synonyms: string[];
}

/** Order matters: earlier fields win ties when two fields want the same column. */
export const FIELD_DEFS: FieldDef[] = [
  { field: 'upc', label: 'Barcode (UPC/EAN/ISBN)', synonyms: ['upc', 'barcode', 'bar code', 'ean', 'gtin', 'upc ean', 'upc code', 'isbn', 'isbn13', 'ean13', 'product code'] },
  { field: 'asin', label: 'ASIN', synonyms: ['asin', 'amazon asin'] },
  { field: 'title', label: 'Title', hint: 'Required unless a barcode is mapped', synonyms: ['title', 'name', 'item', 'item name', 'product', 'product name', 'product title', 'item title', 'listing title', 'item description', 'product description'] },
  { field: 'quantity', label: 'Quantity', hint: 'Creates one inventory row per unit', synonyms: ['qty', 'quantity', 'count', 'units', 'qty ordered', 'quantity ordered', 'amount', 'pcs', 'pieces', 'on hand'] },
  { field: 'cost', label: 'Cost (what you paid, each)', synonyms: ['cost', 'unit cost', 'cost each', 'price paid', 'paid', 'purchase price', 'buy price', 'item cost', 'your cost', 'item price', 'unit price', 'price each', 'etv'] },
  { field: 'targetPrice', label: 'Asking price', synonyms: ['asking', 'asking price', 'ask', 'list price', 'listing price', 'sell price', 'selling price', 'sell for', 'target', 'target price', 'resale', 'resale price', 'sale price', 'my price'] },
  { field: 'retailPrice', label: 'Retail / MSRP', synonyms: ['retail', 'msrp', 'retail price', 'fmv', 'value', 'original price', 'list value', 'market value', 'rrp'] },
  { field: 'condition', label: 'Condition', synonyms: ['condition', 'cond', 'item condition'] },
  { field: 'category', label: 'Category', synonyms: ['category', 'type', 'department', 'dept', 'product type', 'item type', 'categories'] },
  { field: 'location', label: 'Storage location', synonyms: ['location', 'storage', 'storage location', 'bin', 'shelf', 'box', 'tote', 'where stored', 'stored'] },
  { field: 'brand', label: 'Brand', synonyms: ['brand', 'manufacturer', 'maker', 'make', 'mfr'] },
  { field: 'date', label: 'Date acquired', synonyms: ['date', 'acquired', 'date acquired', 'purchase date', 'purchased', 'order date', 'ordered', 'bought', 'date purchased', 'delivered'] },
  { field: 'source', label: 'Source / store', synonyms: ['source', 'store', 'vendor', 'seller', 'supplier', 'from', 'where', 'where bought', 'retailer', 'shop'] },
  { field: 'description', label: 'Description', synonyms: ['description', 'details', 'desc', 'long description', 'body'] },
  { field: 'notes', label: 'Notes', synonyms: ['notes', 'note', 'comments', 'comment', 'memo', 'remarks'] },
  { field: 'sku', label: 'SKU / your ID', synonyms: ['sku', 'item number', 'item no', 'item id', 'stock number', 'id', 'custom label'] },
  { field: 'photo', label: 'Photo URL', synonyms: ['image', 'photo', 'image url', 'photo url', 'picture', 'img', 'image link', 'main image'] },
  { field: 'status', label: 'Status', synonyms: ['status', 'stage', 'listing status'] },
  { field: 'decision', label: 'Keep / Sell', synonyms: ['keep sell', 'keep or sell', 'decision', 'keep'] },
];

/** Loose "contains" keywords used when no exact synonym matches. */
const CONTAINS: Partial<Record<ListField, string[]>> = {
  upc: ['upc', 'barcode', 'ean', 'gtin', 'isbn'],
  asin: ['asin'],
  title: ['title', 'name'],
  quantity: ['qty', 'quantity'],
  cost: ['cost', 'paid'],
  targetPrice: ['asking', 'sell', 'resale', 'target'],
  retailPrice: ['retail', 'msrp'],
  condition: ['condition'],
  category: ['category'],
  location: ['location', 'storage', 'bin', 'shelf'],
  brand: ['brand', 'manufacturer'],
  date: ['date'],
  photo: ['image', 'photo'],
  notes: ['note', 'comment'],
};

export type ColumnMapping = Partial<Record<ListField, number>>;

export interface ParsedSheet {
  headers: string[];
  rows: string[][];
  /** 1-based spreadsheet row number of each data row */
  rowNumbers: number[];
  /** 0-based index of the header row in the file */
  headerRowIndex: number;
  sheetName?: string;
}

function normHeader(h: string): string {
  return String(h ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function cellString(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().split('T')[0];
  return String(v).trim();
}

/** Score how well a header matches a field (0 = no match). */
function scoreHeader(header: string, def: FieldDef): number {
  const h = normHeader(header);
  if (!h) return 0;
  if (def.synonyms.includes(h)) return 10;
  const keys = CONTAINS[def.field];
  if (keys?.some((k) => h.split(' ').includes(k))) return 4;
  if (keys?.some((k) => h.includes(k))) return 2;
  return 0;
}

/** Find the row (within the first 15) that looks most like a header row. */
function detectHeaderRow(grid: string[][]): number {
  let bestIdx = 0;
  let bestScore = -1;
  const limit = Math.min(grid.length, 15);
  for (let i = 0; i < limit; i++) {
    const row = grid[i];
    const filled = row.filter((c) => c !== '');
    if (filled.length < 2) continue;
    let score = 0;
    for (const cell of row) {
      score += Math.max(0, ...FIELD_DEFS.map((d) => scoreHeader(cell, d)));
    }
    // Header rows are mostly text, not numbers
    const numeric = filled.filter((c) => /^[$\d.,\s-]+$/.test(c)).length;
    score -= numeric * 3;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function gridToSheet(grid: string[][], sheetName?: string): ParsedSheet {
  const cleaned = grid.map((r) => r.map(cellString));
  const hasContent = (r: string[]) => r.some((c) => c !== '');
  if (!cleaned.some(hasContent)) return { headers: [], rows: [], rowNumbers: [], headerRowIndex: 0, sheetName };
  const headerRowIndex = detectHeaderRow(cleaned);
  const width = Math.max(...cleaned.map((r) => r.length));
  const headers = Array.from({ length: width }, (_, i) => cleaned[headerRowIndex][i] || `Column ${i + 1}`);
  const rows: string[][] = [];
  const rowNumbers: number[] = [];
  cleaned.slice(headerRowIndex + 1).forEach((r, i) => {
    if (!hasContent(r)) return;
    rows.push(Array.from({ length: width }, (_, c) => r[c] ?? ''));
    rowNumbers.push(headerRowIndex + i + 2); // 1-based spreadsheet row
  });
  return { headers, rows, rowNumbers, headerRowIndex, sheetName };
}

/** Parse delimited text (CSV, TSV, or rows pasted from a spreadsheet). */
export function parseDelimitedText(text: string): ParsedSheet {
  const result = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), {
    skipEmptyLines: false,
    // Auto-detects comma / tab / semicolon
    delimiter: '',
  });
  return gridToSheet(result.data as string[][]);
}

/** Parse an uploaded file. Excel files use the first non-empty sheet. */
export async function parseListFile(file: File): Promise<ParsedSheet> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.xlsm') || name.endsWith('.ods')) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    for (const sheetName of wb.SheetNames) {
      const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
        header: 1,
        defval: '',
        raw: false,
        dateNF: 'yyyy-mm-dd',
      }) as unknown[][];
      const sheet = gridToSheet(grid.map((r) => r.map(cellString)), sheetName);
      if (sheet.rows.length > 0) return sheet;
    }
    return { headers: [], rows: [], rowNumbers: [], headerRowIndex: 0 };
  }
  return parseDelimitedText(await file.text());
}

/** Guess the column for each field. Each column is used at most once. */
export function autoMapColumns(headers: string[]): ColumnMapping {
  const candidates: { field: ListField; col: number; score: number; order: number }[] = [];
  FIELD_DEFS.forEach((def, order) => {
    headers.forEach((h, col) => {
      const score = scoreHeader(h, def);
      if (score > 0) candidates.push({ field: def.field, col, score, order });
    });
  });
  candidates.sort((a, b) => b.score - a.score || a.order - b.order);

  const mapping: ColumnMapping = {};
  const usedCols = new Set<number>();
  for (const c of candidates) {
    if (mapping[c.field] !== undefined || usedCols.has(c.col)) continue;
    mapping[c.field] = c.col;
    usedCols.add(c.col);
  }

  // A lone "Description" column with no title column is the title (e.g. Lattice exports)
  if (mapping.title === undefined && mapping.description !== undefined) {
    mapping.title = mapping.description;
    delete mapping.description;
  }
  // A lone "Price" column on a haul list is what was paid
  if (mapping.cost === undefined && mapping.targetPrice === undefined) {
    const priceCol = headers.findIndex((h, i) => normHeader(h) === 'price' && !usedCols.has(i));
    if (priceCol >= 0) mapping.cost = priceCol;
  }
  return mapping;
}

// ── Value parsing ────────────────────────────────────────────────────────────

export function parseMoney(v: string | undefined): number | null {
  if (!v) return null;
  const neg = /^\(.*\)$/.test(v.trim()) || v.trim().startsWith('-');
  const n = parseFloat(v.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n)) return null;
  return Math.round((neg ? -n : n) * 100) / 100;
}

export function parseQuantity(v: string | undefined): number {
  if (!v) return 1;
  const n = parseInt(v.replace(/[^0-9]/g, ''), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 500);
}

export function parseCondition(v: string | undefined): ItemCondition | null {
  const s = (v ?? '').toLowerCase().trim();
  if (!s) return null;
  if (/part|broken|as[ -]?is|not working|repair/.test(s)) return 'for_parts';
  if (/like ?new|open ?box|excellent|mint|nwob/.test(s)) return 'like_new';
  if (/^new|nib|nwt|sealed|brand new|new in/.test(s)) return 'new';
  if (/fair|acceptable|worn|poor/.test(s)) return 'fair';
  if (/good|used|very good|pre-?owned/.test(s)) return 'good';
  return null;
}

export function parseStatus(v: string | undefined): ItemStatus | null {
  const s = (v ?? '').toLowerCase().trim();
  if (!s) return null;
  if (/ship/.test(s)) return 'shipped';
  if (/sold/.test(s)) return 'sold';
  if (/list/.test(s) && !/ready|to list/.test(s)) return 'listed';
  if (/ready|to list/.test(s)) return 'ready_to_list';
  if (/refurb|clean|repair/.test(s)) return 'refurbishing';
  if (/acquired|new|in stock|have/.test(s)) return 'acquired';
  return null;
}

export function parseDecision(v: string | undefined): 'keep' | 'sell' | null {
  const s = (v ?? '').toLowerCase().trim();
  if (!s) return null;
  if (/keep|personal|mine/.test(s)) return 'keep';
  if (/sell/.test(s)) return 'sell';
  return null;
}

/** Accepts YYYY-MM-DD, M/D/YYYY, M/D/YY, "Jan 5 2026", Excel serials. Returns YYYY-MM-DD. */
export function parseDate(v: string | undefined): string | null {
  const s = (v ?? '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const mdy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (mdy) {
    const [, m, d, yRaw] = mdy;
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  if (/^\d{5}$/.test(s)) {
    // Excel serial date
    const date = new Date(Math.round((parseInt(s, 10) - 25569) * 86400 * 1000));
    return Number.isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
  }
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().split('T')[0];
}

/** Keep barcode digits only; returns null if it isn't barcode-shaped. */
export function parseBarcode(v: string | undefined): string | null {
  const s = (v ?? '').trim();
  if (!s) return null;
  // Excel turns long numbers into 1.23457E+11 — unrecoverable, skip
  if (/e\+/i.test(s)) return null;
  const digits = s.replace(/[\s-]/g, '');
  if (/^\d{8,14}$/.test(digits)) return digits;
  if (/^\d{9}[\dX]$/i.test(digits)) return digits.toUpperCase();
  return null;
}

export function parseAsin(v: string | undefined): string | null {
  const s = (v ?? '').trim().toUpperCase();
  return /^[A-Z0-9]{10}$/.test(s) ? s : null;
}

// ── Row → normalized record ──────────────────────────────────────────────────

export interface ListRecord {
  rowNumber: number;
  title: string | null;
  description: string | null;
  upc: string | null;
  asin: string | null;
  sku: string | null;
  quantity: number;
  cost: number | null;
  targetPrice: number | null;
  retailPrice: number | null;
  condition: ItemCondition | null;
  category: string | null;
  location: string | null;
  brand: string | null;
  date: string | null;
  source: string | null;
  notes: string | null;
  photo: string | null;
  status: ItemStatus | null;
  decision: 'keep' | 'sell' | null;
}

export function toRecords(sheet: ParsedSheet, mapping: ColumnMapping): ListRecord[] {
  const get = (row: string[], f: ListField) => {
    const col = mapping[f];
    return col === undefined ? undefined : (row[col] ?? '').trim() || undefined;
  };
  return sheet.rows.map((row, i) => {
    const photo = get(row, 'photo');
    return {
      rowNumber: sheet.rowNumbers[i] ?? i + 2,
      title: get(row, 'title')?.slice(0, 255) ?? null,
      description: get(row, 'description') ?? null,
      upc: parseBarcode(get(row, 'upc')),
      asin: parseAsin(get(row, 'asin')),
      sku: get(row, 'sku') ?? null,
      quantity: parseQuantity(get(row, 'quantity')),
      cost: parseMoney(get(row, 'cost')),
      targetPrice: parseMoney(get(row, 'targetPrice')),
      retailPrice: parseMoney(get(row, 'retailPrice')),
      condition: parseCondition(get(row, 'condition')),
      category: get(row, 'category') ?? null,
      location: get(row, 'location') ?? null,
      brand: get(row, 'brand') ?? null,
      date: parseDate(get(row, 'date')),
      source: get(row, 'source') ?? null,
      notes: get(row, 'notes') ?? null,
      photo: photo && /^https?:\/\//i.test(photo) ? photo : null,
      status: parseStatus(get(row, 'status')),
      decision: parseDecision(get(row, 'decision')),
    };
  });
}

/** Rows that would produce nothing (no title, no barcode, no ASIN) — e.g. totals rows. */
export function isEmptyRecord(r: ListRecord): boolean {
  return !r.title && !r.upc && !r.asin;
}
