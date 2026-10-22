/**
 * Barcode helpers shared by the scanner, scan sessions and list import.
 *
 * Code types:
 *  - asin: Amazon ASIN (B0…) or ISBN-10 printed on Amazon labels / older books
 *  - upc:  UPC-A / UPC-E / EAN-13 / EAN-8 / ITF-14 product barcodes (incl. ISBN-13)
 *  - fnsku: Amazon fulfillment sticker (X00…). Saved on items (items.fnsku) once
 *           matched; the lookup can also resolve it to an ASIN.
 */

export type CodeType = 'asin' | 'upc' | 'fnsku';

export interface ScannedCode {
  codeType: CodeType;
  value: string;
}

/** Strip non-digits and leading zeros so UPC-A and its EAN-13/GTIN-14 forms compare equal. */
export function normalizeUpc(raw: string): string {
  return (raw ?? '').replace(/\D/g, '').replace(/^0+/, '');
}

/**
 * Expand an 8-digit UPC-E (number system 0 or 1) to its 12-digit UPC-A form,
 * so it matches the UPC-A printed on the same product elsewhere.
 * Returns null when the input isn't a valid UPC-E shape.
 */
export function upcEToUpcA(upcE: string): string | null {
  const d = upcE.replace(/\D/g, '');
  if (d.length !== 8 || (d[0] !== '0' && d[0] !== '1')) return null;
  const ns = d[0];
  const [d1, d2, d3, d4, d5, d6] = d.slice(1, 7).split('');
  const check = d[7];
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
  return `${ns}${body}${check}`;
}

/** GS1 check digit (UPC / EAN / GTIN-14). 11-digit UPC-As missing the leading zero are padded. */
export function hasValidCheckDigit(code: string): boolean {
  let d = code.replace(/\D/g, '');
  if (d.length === 11) d = `0${d}`;
  if (![8, 12, 13, 14].includes(d.length)) return false;
  const digits = d.split('').map(Number);
  const check = digits.pop()!;
  // Weights alternate 3,1,3… starting from the digit next to the check digit
  const sum = digits.reverse().reduce((acc, n, i) => acc + n * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** Amazon FNSKU sticker code (e.g. X0051UTBFP). */
export function isFnsku(code: string): boolean {
  return /^X0[A-Z0-9]{8}$/i.test(code.trim());
}

/**
 * Shipping-label barcodes that happen to be all digits: GS1-128 "420" + ZIP
 * (USPS/UPS/FedEx ship-to postal code), e.g. 42096080 or 420960808930.
 */
function isPostalRoutingCode(digits: string, format?: string): boolean {
  // Typed codes and retail symbologies are trusted — real UPC-As can start with 420
  if (!format || ['UPC_A', 'UPC_E', 'EAN_13', 'EAN_8'].includes(format)) return false;
  return /^420\d{5}(\d{4})?$/.test(digits);
}

/** True when a digits-only code is an ISBN-13 (books). */
export function isIsbn13(code: string): boolean {
  const d = code.replace(/\D/g, '');
  return d.length === 13 && (d.startsWith('978') || d.startsWith('979'));
}

/**
 * Classify a scanned/typed string.
 * @param format ZXing BarcodeFormat name when known (e.g. "UPC_E", "EAN_8")
 */
export function classifyCode(raw: string, format?: string): ScannedCode | null {
  if (!raw) return null;
  const trimmed = raw.trim();

  // Amazon URL pattern — most reliable
  const urlMatch = trimmed.match(/\/dp\/([A-Z0-9]{10})/i);
  if (urlMatch) return { codeType: 'asin', value: urlMatch[1].toUpperCase() };

  // Amazon FNSKU sticker (X00…) — resolved to an ASIN by the lookup
  if (isFnsku(trimmed)) return { codeType: 'fnsku', value: trimmed.toUpperCase() };

  // Direct ASIN — exactly 10 chars, starts with B
  const directMatch = trimmed.match(/\b(B[A-Z0-9]{9})\b/i);
  if (directMatch) return { codeType: 'asin', value: directMatch[1].toUpperCase() };

  // ISBN-10 / numeric ASIN (older books) — 9 digits + digit or X
  if (/^\d{9}[\dX]$/i.test(trimmed)) return { codeType: 'asin', value: trimmed.toUpperCase() };

  const digitsOnly = trimmed.replace(/[\s-]/g, '');
  if (!/^\d+$/.test(digitsOnly)) return null;
  if (isPostalRoutingCode(digitsOnly, format)) return null;

  // 8 digits: UPC-E (expand to UPC-A) or EAN-8
  if (digitsOnly.length === 8) {
    if (format !== 'EAN_8') {
      const expanded = upcEToUpcA(digitsOnly);
      if (expanded && (format === 'UPC_E' || !format) && hasValidCheckDigit(expanded)) {
        return { codeType: 'upc', value: expanded };
      }
    }
    return hasValidCheckDigit(digitsOnly) ? { codeType: 'upc', value: digitsOnly } : null;
  }

  // UPC-A (12), EAN-13 (13), ITF-14/GTIN-14 (14), UPC-A missing leading zero (11).
  // A bad check digit means a misread or a non-product code (e.g. a shipping label).
  if (/^\d{11,14}$/.test(digitsOnly) && hasValidCheckDigit(digitsOnly)) {
    return { codeType: 'upc', value: digitsOnly };
  }

  return null;
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
