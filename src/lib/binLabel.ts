/**
 * Bin labels: a short barcode per storage location ("BIN-1A2B3C4D", the first
 * 8 hex digits of its id). Scanning one in a scan session puts everything scanned
 * after it in that bin; typing or scanning it into inventory search shows what's in it.
 */

const PATTERN = /^\s*BIN-([0-9A-F]{8})\s*$/i;

export function binCode(locationId: string): string {
  return `BIN-${locationId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

export function isBinCode(raw: string | null | undefined): boolean {
  return !!raw && PATTERN.test(raw);
}

/** The location a scanned bin label belongs to, or null when it's not a bin label / not this team's. */
export function findBin<T extends { id: string }>(raw: string | null | undefined, locations: T[]): T | null {
  const m = raw ? PATTERN.exec(raw) : null;
  if (!m) return null;
  const prefix = m[1].toLowerCase();
  return locations.find((l) => l.id.replace(/-/g, '').toLowerCase().startsWith(prefix)) ?? null;
}

