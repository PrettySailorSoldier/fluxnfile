/**
 * Calendar dates the way the seller sees them.
 *
 * `new Date().toISOString()` is UTC, so an evening sale on the US west coast was
 * dated tomorrow; and `new Date('2026-11-01')` is UTC midnight, which is still
 * October 31st locally. Everything that stores or compares a plain DATE goes
 * through here instead.
 */

/** Today as 'YYYY-MM-DD' in the device's own timezone. */
export function todayLocal(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** A stored 'YYYY-MM-DD' (or full timestamp) as a local Date. Null when unparseable. */
export function parseLocalDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Whole days from a stored date until now. Null when there is no date. */
export function daysSince(value: string | null | undefined): number | null {
  const d = parseLocalDate(value);
  return d ? Math.floor((Date.now() - d.getTime()) / 86_400_000) : null;
}

/**
 * The sale date to store when an item's status changes.
 * A sold item keeps the day it sold — editing it, or marking it shipped a week
 * later, must not move the sale into another month.
 */
export function saleDateFor(
  newStatus: string,
  current: { status?: string | null; sale_date?: string | null } | null | undefined
): string | null {
  if (newStatus !== 'sold' && newStatus !== 'shipped') return null;
  return current?.sale_date ?? todayLocal();
}
