/**
 * Barcode helpers shared by the scanner, scan sessions and list import.
 *
 * Code types:
 *  - asin: Amazon ASIN (B0…) or ISBN-10 printed on Amazon labels / older books
 *  - upc:  UPC-A / UPC-E / EAN-13 / EAN-8 / ITF-14 product barcodes (incl. ISBN-13)
 *
 * Every numeric code is check-digit validated, so misreads, typos and
 * look-alike numbers (tracking numbers, order numbers) are rejected instead
 * of becoming "Unknown item" rows.
 */

export type CodeType = 'asin' | 'upc';

export interface ScannedCode {
  codeType: CodeType;
  value: string;
}

/** Strip non-digits and leading zeros so UPC-A and its EAN-13/GTIN-14 forms compare equal. */
export function normalizeUpc(raw: string): string {
  return (raw ?? '').replace(/\D/g, '').replace(/^0+/, '');
}

/** GS1 mod-10 check digit for the digits before it. */
function gtinCheckDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    // Weights alternate 3,1,3… starting from the digit next to the check digit
    sum += Number(body[body.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

/** True when an 8/12/13/14-digit code has a correct GS1 check digit. */
export function isValidGtin(digits: string): boolean {
  if (!/^(\d{8}|\d{12,14})$/.test(digits)) return false;
  return gtinCheckDigit(digits.slice(0, -1)) === Number(digits[digits.length - 1]);
}

/** True when a 10-character code (9 digits + digit or X) has a correct ISBN-10 check digit. */
export function isValidIsbn10(code: string): boolean {
  if (!/^\d{9}[\dX]$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += (code[i] === 'X' ? 10 : Number(code[i])) * (10 - i);
  return sum % 11 === 0;
}

/**
 * Drop GTIN-14/EAN-13 padding zeros: 00012345678905 → 012345678905.
 * Case codes (GTIN-14 with a packaging indicator 1–8) are left alone.
 */
function canonicalGtin(digits: string): string {
  let d = digits;
  while (d.length > 12 && d[0] === '0') d = d.slice(1);
  return d;
}

/**
 * Expand a UPC-E (number system 0 or 1) to its 12-digit UPC-A form,
 * so it matches the UPC-A printed on the same product elsewhere.
 * Accepts 8 digits (NS + 6 + check), 7 (NS + 6) or 6 (NS 0 assumed);
 * the check digit is computed when missing.
 * Returns null when the input isn't a valid UPC-E shape or the check digit is wrong.
 */
export function upcEToUpcA(upcE: string): string | null {
  let d = upcE.replace(/\D/g, '');
  if (d.length === 6) d = `0${d}`;
  if (d.length < 7 || d.length > 8 || (d[0] !== '0' && d[0] !== '1')) return null;
  const ns = d[0];
  const [d1, d2, d3, d4, d5, d6] = d.slice(1, 7).split('');
  let body: string;
  switch (d6) {
    case '0':
    case '1':
    case '2':
      body = `${d1}${d2}${d6}0000${d3}${d4}${d5}`;
      break;
    case '3':
      body = `${d1}${d2}${d3}00000${d4}${d5}`;
      break;
    case '4':
      body = `${d1}${d2}${d3}${d4}00000${d5}`;
      break;
    default:
      body = `${d1}${d2}${d3}${d4}${d5}0000${d6}`;
  }
  const check = String(gtinCheckDigit(`${ns}${body}`));
  if (d.length === 8 && d[7] !== check) return null;
  return `${ns}${body}${check}`;
}

/** True when a digits-only code is an ISBN-13 (books). */
export function isIsbn13(code: string): boolean {
  const d = code.replace(/\D/g, '');
  return d.length === 13 && (d.startsWith('978') || d.startsWith('979'));
}

/** Formats whose payload is a retail product number by definition. */
const PRODUCT_SYMBOLOGIES = new Set(['UPC_A', 'UPC_E', 'EAN_13', 'EAN_8', 'ITF']);

/**
 * GTIN inside a GS1 element string (GS1-128, GS1 DataMatrix/QR, scanner guns)
 * or a GS1 Digital Link URL (the QR codes replacing UPCs on packaging).
 */
function extractGs1Gtin(text: string): string | null {
  // Digital Link: https://example.com/01/00012345678905/10/ABC
  const link = text.match(/^https?:\/\/[^\s]+?\/01\/(\d{8,14})(?:[/?#]|$)/i);
  if (link) return link[1];
  // Human-readable element string: (01)00012345678905(17)…
  const paren = text.match(/\(01\)\s*(\d{14})/);
  if (paren) return paren[1];
  // Raw element string — only when it's clearly GS1 (symbology prefix or GS separators),
  // or it's exactly AI 01 + GTIN-14
  const isGs1 = /^\](C1|e0|Q3|d2)/.test(text) || text.includes('\u001d');
  const raw = text.replace(/^\][A-Za-z]\d/, '');
  const ai = raw.match(isGs1 ? /^01(\d{14})/ : /^01(\d{14})$/);
  return ai ? ai[1] : null;
}

/**
 * Classify a scanned/typed string.
 * @param format ZXing BarcodeFormat name when known (e.g. "UPC_E", "EAN_8").
 *               Omit for typed codes and hardware scanner guns.
 */
export function classifyCode(raw: string, format?: string): ScannedCode | null {
  if (!raw) return null;
  // Scanner guns may prefix an AIM symbology identifier (]E0, ]C1, ]A0…)
  const trimmed = raw.trim();
  const text = trimmed.replace(/^\][A-Za-z]\d(?=.)/, '');

  // GS1 (GS1-128, Digital Link QR, element strings)
  const gs1 = extractGs1Gtin(trimmed);
  if (gs1 && isValidGtin(gs1)) return { codeType: 'upc', value: canonicalGtin(gs1) };

  // Amazon product URL (QR codes) — most reliable
  const urlMatch = text.match(/\/(?:dp|gp\/product|gp\/aw\/d|product)\/([A-Z0-9]{10})(?:[/?#]|$)/i);
  if (urlMatch) {
    const id = urlMatch[1].toUpperCase();
    if (/^B[A-Z0-9]{9}$/.test(id) || isValidIsbn10(id)) return { codeType: 'asin', value: id };
  }

  // The whole code is an ASIN (Amazon labels encode it as Code 128; typed codes)
  // (typed "BO7…" with the letter O is a common slip for "B07…")
  const upper = text.toUpperCase().replace(/^BO(?=[A-Z0-9]{8}$)/, 'B0');
  if (/^B0[A-Z0-9]{8}$/.test(upper)) return { codeType: 'asin', value: upper };

  // ISBN-10 / numeric ASIN (older books) — 9 digits + digit or X, check digit verified
  const isbn10 = upper.replace(/[\s-]/g, '');
  if (isValidIsbn10(isbn10)) return { codeType: 'asin', value: isbn10 };

  // An ASIN embedded in other text (non-Amazon QR codes, labels with prefixes)
  const embedded = text.match(/(?:^|[^A-Za-z0-9])(B0[A-Z0-9]{8})(?![A-Za-z0-9])/);
  if (embedded) return { codeType: 'asin', value: embedded[1] };

  const digitsOnly = text.replace(/[\s-]/g, '');
  if (!/^\d+$/.test(digitsOnly)) return null;

  // Digits printed as Code 128 / Code 39 / plain QR are tracking, order or serial
  // numbers — real product numbers come as UPC/EAN/ITF or GS1 (handled above)
  if (format && !PRODUCT_SYMBOLOGIES.has(format)) return null;

  // UPC-E (6–8 digits) when the scanner says so
  if (format === 'UPC_E') {
    const expanded = upcEToUpcA(digitsOnly);
    return expanded ? { codeType: 'upc', value: expanded } : null;
  }

  // 8 digits: UPC-E or EAN-8 — the check digit tells which
  if (digitsOnly.length === 8) {
    if (format !== 'EAN_8') {
      const expanded = upcEToUpcA(digitsOnly);
      if (expanded) return { codeType: 'upc', value: expanded };
    }
    return isValidGtin(digitsOnly) ? { codeType: 'upc', value: digitsOnly } : null;
  }

  // UPC-A missing its leading zero (spreadsheets drop it)
  if (digitsOnly.length === 11 && !format) {
    const padded = `0${digitsOnly}`;
    return isValidGtin(padded) ? { codeType: 'upc', value: padded } : null;
  }

  // ITF is only a product code as ITF-14 (cartons); shorter ITF reads are misreads
  if (format === 'ITF' && digitsOnly.length !== 14) return null;

  // UPC-A (12), EAN-13 (13), GTIN-14 (14)
  if (isValidGtin(digitsOnly)) return { codeType: 'upc', value: canonicalGtin(digitsOnly) };

  return null;
}

/**
 * Why a code isn't a product code, worded for the person holding the scanner.
 * Pair with `classifyCode` returning null; pass the same `format`.
 */
export function explainUnrecognized(raw: string, format?: string): string {
  const text = (raw ?? '').trim().replace(/^\][A-Za-z]\d/, '');
  const upper = text.toUpperCase().replace(/[\s-]/g, '');
  const tracking = 'Shipping/tracking label — scan the product barcode or the Amazon label instead.';
  if (/^X0[0-9A-Z]{8}$/.test(upper)) {
    return 'Amazon FNSKU sticker (X0…) — it isn’t linked to a product. Scan the product’s own UPC (often under the sticker) or the ASIN.';
  }
  if (/^LPN[0-9A-Z]{6,}$/.test(upper)) {
    return 'Amazon returns (LPN) label — scan the product’s own UPC or the ASIN instead.';
  }
  if (/^\d{3}-?\d{7}-?\d{7}$/.test(text)) {
    return 'That’s an Amazon order number — scan the product barcode or the ASIN.';
  }
  if (/^1Z[0-9A-Z]{16}$/.test(upper) || /^TBA\d{9,}$/.test(upper) || /^(420\d{5,9})?9[1-5]\d{18,24}$/.test(upper)) {
    return tracking;
  }
  if (/^\d+$/.test(upper)) {
    // Numbers in Code 128 / Code 39 / QR are tracking, order or serial numbers
    if (format && !PRODUCT_SYMBOLOGIES.has(format)) return tracking;
    if ([8, 10, 11, 12, 13, 14].includes(upper.length)) {
      return 'The check digit doesn’t match — it’s a misread or a typo. Scan again or recheck the digits.';
    }
    if ([15, 20, 22, 34].includes(upper.length)) return tracking;
  }
  return 'Not a product barcode. Scan the UPC/EAN on the product, the ISBN on a book, or the ASIN on an Amazon label.';
}

/**
 * Every stored spelling a UPC might have been saved under — for `.in('upc', …)`
 * database queries (stored values aren't normalized).
 */
export function upcVariants(code: string): string[] {
  const stripped = normalizeUpc(code);
  if (!stripped) return [code];
  const set = new Set<string>([code, stripped]);
  for (const len of [11, 12, 13, 14]) {
    if (stripped.length <= len) set.add(stripped.padStart(len, '0'));
  }
  return [...set];
}

/** Compare two UPC spellings for equality. */
export function sameUpc(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return normalizeUpc(a) === normalizeUpc(b);
}
