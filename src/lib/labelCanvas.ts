import { code128Modules } from '@/lib/code128';

/**
 * One label design, two outputs: the on-screen/print label (ItemLabel, sized in
 * mm with CSS) and a 300 dpi PNG for the share sheet. Both use labelLayout so
 * they look the same. The floor price is never part of a label.
 */

export const LABEL_DPI = 300;
export const mmToDots = (mm: number, dpi = LABEL_DPI) => Math.round((mm / 25.4) * dpi);

export const priceLabel = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`);
/** What the barcode encodes — Market Mode scans this (6 digits, Code 128 set C) */
export const itemBarcodeText = (n: number) => String(n).padStart(6, '0');
/** The human-readable number under the barcode */
export const itemNumberText = (n: number) => `#${String(n).padStart(5, '0')}`;

export interface LabelLayout {
  pad: number;
  priceFont: number;
  titleFont: number;
  barcodeHeight: number;
  numberFont: number;
  /** How many title lines fit (2, or fewer on very small labels) */
  titleLines: 0 | 1 | 2;
}

/** Sizes in mm for a label of the given size; the barcode is never under 8 mm tall. */
export function labelLayout(widthMm: number, heightMm: number): LabelLayout {
  const pad = Math.min(2, Math.max(0.8, heightMm * 0.05));
  const inner = heightMm - 2 * pad;
  const numberFont = Math.min(3, Math.max(1.6, heightMm * 0.07));
  const barcodeHeight = Math.max(8, Math.min(heightMm * 0.35, inner - numberFont - 4));
  const rest = Math.max(3, inner - barcodeHeight - numberFont);
  // Price takes ~55% of what's left; the title gets two lines (1.15 line height
  // plus a little gap) — or one, or none, rather than a half-clipped line
  const priceFont = Math.max(3, Math.min(rest * 0.55, widthMm * 0.22));
  const avail = rest - priceFont;
  let titleLines: 0 | 1 | 2 = 2;
  let titleFont = Math.min(avail / 2.6, 4);
  if (titleFont < 1.5) {
    titleLines = 1;
    titleFont = Math.min(avail / 1.35, 4);
  }
  if (titleFont < 1.5) {
    titleLines = 0;
    titleFont = 1.5;
  }
  return { pad, priceFont, titleFont, barcodeHeight, numberFont, titleLines };
}

/** Bars as rectangles (in dots) from Code 128 modules, merging runs of black. */
export function barRects(modules: number[], moduleWidth: number, x0: number): { x: number; w: number }[] {
  const rects: { x: number; w: number }[] = [];
  for (let i = 0; i < modules.length; ) {
    if (modules[i]) {
      let j = i;
      while (j < modules.length && modules[j]) j++;
      rects.push({ x: x0 + i * moduleWidth, w: (j - i) * moduleWidth });
      i = j;
    } else i++;
  }
  return rects;
}

export interface LabelItem {
  title: string | null;
  tag_price?: number | null;
  tracking_number: number | null;
}

const FONT = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif';

/** Up to `maxLines` lines that fit `width`, the last one ending in "…" when cut. */
function wrapLines(ctx: CanvasRenderingContext2D, text: string, width: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  let i = 0;
  while (i < words.length) {
    const next = line ? `${line} ${words[i]}` : words[i];
    if (!line || ctx.measureText(next).width <= width) {
      line = next;
      i++;
    } else {
      lines.push(line);
      line = '';
      if (lines.length === maxLines) break;
    }
  }
  if (line) lines.push(line);
  const cut = i < words.length;
  // Fit each line (one long word can overflow) and mark a cut on the last one
  return lines.map((l, k) => {
    const dots = cut && k === lines.length - 1;
    if (!dots && ctx.measureText(l).width <= width) return l;
    let s = l;
    while (s.length > 1 && ctx.measureText(`${s}…`).width > width) s = s.slice(0, -1);
    return `${s.trimEnd()}…`;
  });
}

/** Draws the label at 300 dpi. Returns the canvas (for tests/inspection) and a PNG blob. */
export function drawLabel(item: LabelItem, widthMm: number, heightMm: number, canvas = document.createElement('canvas')) {
  const W = mmToDots(widthMm);
  const H = mmToDots(heightMm);
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');
  const L = labelLayout(widthMm, heightMm);
  const d = (mm: number) => mmToDots(mm);
  const pad = d(L.pad);
  const innerW = W - 2 * pad;

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  // Price, shrunk to fit the width
  let y = pad;
  const price = item.tag_price != null ? priceLabel(item.tag_price) : '—';
  let priceSize = d(L.priceFont);
  ctx.font = `800 ${priceSize}px ${FONT}`;
  while (priceSize > 8 && ctx.measureText(price).width > innerW) {
    priceSize -= 2;
    ctx.font = `800 ${priceSize}px ${FONT}`;
  }
  ctx.fillText(price, W / 2, y);
  y += priceSize * 1.05;

  // Title, two lines at most
  const titleSize = d(L.titleFont);
  ctx.font = `400 ${titleSize}px ${FONT}`;
  for (const line of L.titleLines ? wrapLines(ctx, item.title || 'Untitled item', innerW, L.titleLines) : []) {
    ctx.fillText(line, W / 2, y);
    y += titleSize * 1.15;
  }

  // Barcode + number at the bottom
  const numberSize = d(L.numberFont);
  if (item.tracking_number) {
    const modules = code128Modules(itemBarcodeText(item.tracking_number));
    const moduleW = Math.max(1, Math.floor(innerW / modules.length));
    const x0 = Math.round((W - modules.length * moduleW) / 2);
    const barH = d(L.barcodeHeight);
    const barTop = H - pad - numberSize * 1.1 - barH;
    for (const r of barRects(modules, moduleW, x0)) ctx.fillRect(r.x, barTop, r.w, barH);
    ctx.font = `400 ${numberSize}px ${FONT}`;
    ctx.fillText(itemNumberText(item.tracking_number), W / 2, H - pad - numberSize * 1.05);
  } else {
    ctx.font = `400 ${numberSize}px ${FONT}`;
    ctx.fillText('no item number', W / 2, H - pad - numberSize * 1.05);
  }
  return canvas;
}

export function renderLabelPng(item: LabelItem, widthMm: number, heightMm: number): Promise<Blob> {
  const canvas = drawLabel(item, widthMm, heightMm);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create the image'))), 'image/png')
  );
}
