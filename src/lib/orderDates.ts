/**
 * The ordered / shipped / delivered dates from the official order files.
 *
 * The columns come from 20261023000000_order_dates.sql. Until that's been run,
 * imports still have to work — writes that carry the dates retry without them.
 */
import type { PostgrestError } from '@supabase/supabase-js';

export const ORDER_DATE_COLUMNS = ['ordered_date', 'shipped_date', 'delivered_date'] as const;

/** "10/19/2026" → "2026-10-19"; anything else → null */
export function isoFromMDY(value: string | null | undefined): string | null {
  const m = (value ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null;
}

let columnsMissing = false;

function isMissingDateColumn(error: PostgrestError | null): boolean {
  if (!error) return false;
  const text = `${error.message ?? ''} ${error.details ?? ''}`;
  return ORDER_DATE_COLUMNS.some((c) => text.includes(c));
}

function withoutDates<P>(payload: P): P {
  const strip = (row: Record<string, unknown>) => {
    const copy = { ...row };
    for (const c of ORDER_DATE_COLUMNS) delete copy[c];
    return copy;
  };
  return (Array.isArray(payload)
    ? payload.map((r) => strip(r as Record<string, unknown>))
    : strip(payload as Record<string, unknown>)) as P;
}

/**
 * Run an insert or update whose rows may include the order-date columns. If the
 * database doesn't have them yet, drop them and write the rest.
 */
export async function writeWithOrderDates<P>(
  payload: P,
  write: (payload: P) => PromiseLike<{ error: PostgrestError | null }>
): Promise<{ error: PostgrestError | null }> {
  if (columnsMissing) return write(withoutDates(payload));
  const result = await write(payload);
  if (!isMissingDateColumn(result.error)) return result;
  columnsMissing = true;
  console.warn('[orderDates] date columns missing — run 20261023000000_order_dates.sql to keep order dates');
  return write(withoutDates(payload));
}
