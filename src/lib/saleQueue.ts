/**
 * Sales made without a connection wait here, on the phone, and are sent when it's back.
 *
 * Each queued sale carries a client_id; record_sale() returns the existing sale when it
 * sees the same id twice, so a retry after a timed-out request can't record it twice.
 * Storage is best-effort: if the browser refuses localStorage the sale simply fails loudly
 * instead of queueing.
 */

const KEY = 'fluxnfile:sale-queue:v1';
const EVENT = 'fluxnfile:sale-queue-changed';

export interface QueuedSale {
  clientId: string;
  teamId: string;
  queuedAt: string;
  /** One line of text for toasts and the pending list */
  label: string;
  /** The exact argument for the record_sale RPC */
  payload: Record<string, unknown>;
}

function read(): QueuedSale[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(list: QueuedSale[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new Event(EVENT));
    return true;
  } catch {
    return false;
  }
}

export const pendingSales = (teamId?: string): QueuedSale[] =>
  read().filter((s) => !teamId || s.teamId === teamId);

/** False when the phone couldn't keep it — the caller should report the sale as failed. */
export function enqueueSale(sale: QueuedSale): boolean {
  const list = read();
  if (list.some((s) => s.clientId === sale.clientId)) return true;
  return write([...list, sale]);
}

export function dequeueSale(clientId: string): void {
  write(read().filter((s) => s.clientId !== clientId));
}

export function onQueueChange(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  window.addEventListener('storage', fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener('storage', fn);
  };
}

/** A failed request that never reached the server (no signal, DNS, offline), as opposed to a refusal. */
export function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = String((error as { message?: unknown } | null)?.message ?? error ?? '');
  return /failed to fetch|networkerror|network request failed|load failed|network error|timeout|timed out/i.test(msg);
}

export function newClientId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // Old WebViews: good enough, it only has to be unique per phone
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
