import { useSyncExternalStore } from 'react';

/**
 * Label printer settings, kept on this device (localStorage): the label stock
 * size in mm and whether to offer printing a label after saving an item.
 * Printing goes through the iOS/AirPrint print sheet or a shared PNG — see README.
 */

export type LabelPreset = '50x30' | '40x30' | '62x29' | 'custom';

export const LABEL_PRESETS: { id: Exclude<LabelPreset, 'custom'>; label: string; widthMm: number; heightMm: number }[] = [
  { id: '50x30', label: '50 × 30 mm', widthMm: 50, heightMm: 30 },
  { id: '40x30', label: '40 × 30 mm', widthMm: 40, heightMm: 30 },
  { id: '62x29', label: '62 × 29 mm', widthMm: 62, heightMm: 29 },
];

export interface LabelSettings {
  preset: LabelPreset;
  widthMm: number;
  heightMm: number;
  /** Show a "Print label" shortcut after confirming or scanning in an item */
  offerAfterSave: boolean;
}

export const DEFAULT_LABEL_SETTINGS: LabelSettings = { preset: '50x30', widthMm: 50, heightMm: 30, offerAfterSave: false };

/** Below this the price, title and an 8 mm barcode don't fit comfortably */
export const MIN_COMFORTABLE_MM = { width: 25, height: 15 };
const LIMITS = { min: 10, max: 300 };

const KEY = 'label-settings-v1';

const clampMm = (n: unknown, fallback: number) => {
  const v = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(v) ? Math.min(LIMITS.max, Math.max(LIMITS.min, Math.round(v * 10) / 10)) : fallback;
};

function parse(raw: string | null): LabelSettings {
  if (!raw) return DEFAULT_LABEL_SETTINGS;
  try {
    const v = JSON.parse(raw) as Partial<LabelSettings>;
    const preset: LabelPreset =
      v.preset === 'custom' || LABEL_PRESETS.some((p) => p.id === v.preset) ? (v.preset as LabelPreset) : DEFAULT_LABEL_SETTINGS.preset;
    return {
      preset,
      widthMm: clampMm(v.widthMm, DEFAULT_LABEL_SETTINGS.widthMm),
      heightMm: clampMm(v.heightMm, DEFAULT_LABEL_SETTINGS.heightMm),
      offerAfterSave: v.offerAfterSave === true,
    };
  } catch {
    return DEFAULT_LABEL_SETTINGS;
  }
}

function readRaw(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

const listeners = new Set<() => void>();
let cache: { raw: string | null; value: LabelSettings } | null = null;

function snapshot(): LabelSettings {
  const raw = readRaw();
  if (!cache || cache.raw !== raw) cache = { raw, value: parse(raw) };
  return cache.value;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => e.key === KEY && cb();
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', onStorage);
  };
}

export function getLabelSettings(): LabelSettings {
  return snapshot();
}

export function updateLabelSettings(patch: Partial<LabelSettings>) {
  const next = { ...snapshot(), ...patch };
  next.widthMm = clampMm(next.widthMm, DEFAULT_LABEL_SETTINGS.widthMm);
  next.heightMm = clampMm(next.heightMm, DEFAULT_LABEL_SETTINGS.heightMm);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode / storage full: keep it for this session only
    cache = { raw: JSON.stringify(next), value: next };
  }
  listeners.forEach((l) => l());
}

export function useLabelSettings(): [LabelSettings, (patch: Partial<LabelSettings>) => void] {
  const settings = useSyncExternalStore(subscribe, snapshot, () => DEFAULT_LABEL_SETTINGS);
  return [settings, updateLabelSettings];
}

export const isLabelTooSmall = (s: Pick<LabelSettings, 'widthMm' | 'heightMm'>) =>
  s.widthMm < MIN_COMFORTABLE_MM.width || s.heightMm < MIN_COMFORTABLE_MM.height;

/**
 * Print CSS for label-printer output: the page is exactly one label with no
 * margins. Elements marked `label-page-break` start a new label after them.
 */
export function labelPrintCss(widthMm: number, heightMm: number): string {
  return `@page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
@media print {
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
  body { background-image: none !important; }
  [data-sonner-toaster] { display: none !important; }
  .label-print { box-shadow: none !important; outline: none !important; border: none !important; margin: 0 !important; break-inside: avoid; page-break-inside: avoid; }
  .label-page-break { break-after: page; page-break-after: always; }
}`;
}
