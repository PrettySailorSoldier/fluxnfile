/**
 * Reads the product name printed on an Amazon X00 (FNSKU) sticker.
 *
 * The X00 code itself can't be looked up — it's specific to the seller's
 * warehouse stock — but every sticker prints a short product name under the
 * barcode ("Golf Target Clot", "Tankless Water Heater ...Protection (Gray)").
 * Those words are enough to find the order in the list.
 *
 * Tesseract (a few MB of WebAssembly + English data) is only downloaded the
 * first time it's needed.
 */
import type { PSM, Worker } from 'tesseract.js';

let workerPromise: Promise<Worker> | null = null;

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = import('tesseract.js').then(({ createWorker }) => createWorker('eng'));
    // A failed download (offline) shouldn't stick — try again next time
    workerPromise.catch(() => {
      workerPromise = null;
    });
  }
  return workerPromise;
}

/** Start downloading the reader ahead of the first sticker. Safe to call repeatedly. */
export function warmUpStickerReader(): void {
  getWorker().catch(() => undefined);
}

export interface Point {
  x: number;
  y: number;
}

export interface StickerFrame {
  canvas: HTMLCanvasElement;
  /** The barcode ran up/down the frame, so the printed text is turned 90° */
  vertical: boolean;
  /** Where the barcode was found (ZXing result points, frame pixels) */
  points: Point[];
}

/** Copy the current camera frame — call it the moment the sticker's barcode is read. */
export function captureFrame(video: HTMLVideoElement, vertical: boolean, points: Point[] = []): StickerFrame | null {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, w, h);
  return { canvas, vertical, points };
}

type Degrees = 0 | 90 | 180 | 270;

/** Turn (and if needed shrink) a canvas region so text reads left-to-right. */
function upright(
  src: HTMLCanvasElement,
  degrees: Degrees,
  region = { x: 0, y: 0, w: src.width, h: src.height },
  scale = 1
): HTMLCanvasElement {
  const turned = degrees === 90 || degrees === 270;
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round((turned ? region.h : region.w) * scale));
  out.height = Math.max(1, Math.round((turned ? region.w : region.h) * scale));
  const ctx = out.getContext('2d');
  if (!ctx) return src;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.scale(scale, scale);
  ctx.drawImage(src, region.x, region.y, region.w, region.h, -region.w / 2, -region.h / 2, region.w, region.h);
  return out;
}

/** The whole frame turned upright, no bigger than 1600px. */
function wholeFrame(frame: StickerFrame, degrees: Degrees): HTMLCanvasElement {
  const { canvas } = frame;
  return upright(canvas, degrees, undefined, Math.min(1, 1600 / Math.max(canvas.width, canvas.height)));
}

/**
 * The strip just past the barcode, where the code and product name are printed,
 * turned upright and enlarged. Null when the barcode position isn't known.
 */
function textStrip(frame: StickerFrame, degrees: Degrees): HTMLCanvasElement | null {
  const { canvas, points } = frame;
  if (points.length < 2) return null;
  const first = points[0];
  const last = points[points.length - 1];
  const cx = (first.x + last.x) / 2;
  const cy = (first.y + last.y) / 2;
  const length = Math.hypot(last.x - first.x, last.y - first.y);
  if (length < 40) return null;
  // Rectangle in upright terms: as wide as the barcode (+15% each side), from just
  // past the scan line to ~0.7 barcode-lengths down
  const across = length * 1.3;
  const down0 = length * 0.12;
  const down1 = length * 0.75;
  // Map "down" in the upright picture back to the frame's direction
  const dir: Record<Degrees, [number, number]> = { 0: [0, 1], 180: [0, -1], 90: [1, 0], 270: [-1, 0] };
  const [dx, dy] = dir[degrees];
  const x0 = dx === 0 ? cx - across / 2 : dx > 0 ? cx + down0 : cx - down1;
  const y0 = dy === 0 ? cy - across / 2 : dy > 0 ? cy + down0 : cy - down1;
  const w = dx === 0 ? across : down1 - down0;
  const h = dy === 0 ? across : down1 - down0;
  const x = Math.max(0, x0);
  const y = Math.max(0, y0);
  const region = { x, y, w: Math.min(w, canvas.width - x), h: Math.min(h, canvas.height - y) };
  if (region.w < 10 || region.h < 10) return null;
  const longSide = Math.max(region.w, region.h);
  return upright(canvas, degrees, region, Math.min(2, Math.max(1, 1400 / longSide)));
}

/** Words that appear on every sticker and say nothing about the product. */
const NOISE_WORDS = new Set(['made', 'china', 'new', 'the', 'and', 'for', 'with']);

/**
 * Product words from the sticker's text, lowercased, in reading order.
 * Drops the X00 code, "新品 / MADE IN CHINA", and the garbage OCR makes of the bars.
 */
export function stickerWords(text: string, sticker: string): string[] {
  const words = text
    .toLowerCase()
    .replace(sticker.toLowerCase(), ' ')
    .split(/[^a-z0-9]+/)
    .filter(
      (w) =>
        w.length >= 3 &&
        /[aeiouy]/.test(w) && // bars and code fragments read as "lll", "tgg", "tsh"…
        !/^[il1]+$/.test(w) && // …and "iii", which would match "Powerline III"
        !/^x0\d/.test(w) &&
        !NOISE_WORDS.has(w)
    );
  return [...new Set(words)];
}

/** The sticker's own X00 code came out of the text → this way up is right. */
function showsCode(text: string, sticker: string): boolean {
  const flat = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return flat.includes(sticker.slice(0, 5)) || flat.includes(sticker.slice(-5));
}

/**
 * Read the product words off a captured sticker frame. Each way up is read
 * twice — the strip beside the barcode and the whole frame — and the
 * orientation that wins is the one where the sticker's own X00 code reads back,
 * or failing that, the one Tesseract is more confident about (upside-down text
 * turns into word-like junk at low confidence). Its words are pooled. OCR of a
 * photographed sticker is noisy, so the matching that uses these words
 * tolerates misreads and stray words.
 * Returns e.g. "golf target clot", or null when nothing readable was found.
 */
export async function readStickerText(frame: StickerFrame, sticker: string, budgetMs = 15_000): Promise<string | null> {
  const started = Date.now();
  let worker: Worker;
  try {
    worker = await getWorker();
  } catch {
    return null;
  }
  const read = async (canvas: HTMLCanvasElement | null, mode: 'auto' | 'block'): Promise<{ text: string; confidence: number }> => {
    if (!canvas || Date.now() - started > budgetMs) return { text: '', confidence: 0 };
    try {
      // PSM 3 = find text anywhere; PSM 6 = one block of text (the strip)
      await worker.setParameters({ tessedit_pageseg_mode: (mode === 'auto' ? '3' : '6') as PSM });
      const { data } = await worker.recognize(canvas);
      return { text: data.text ?? '', confidence: data.confidence ?? 0 };
    } catch {
      return { text: '', confidence: 0 };
    }
  };

  const orientations: Degrees[] = frame.vertical ? [90, 270] : [0, 180];
  const tries: { text: string; score: number; confirmed: boolean }[] = [];
  for (const degrees of orientations) {
    const strip = await read(textStrip(frame, degrees), 'block');
    const whole = await read(wholeFrame(frame, degrees), 'auto');
    const text = `${strip.text}\n${whole.text}`;
    const confirmed = showsCode(text, sticker);
    tries.push({ text, confirmed, score: (confirmed ? 1000 : 0) + strip.confidence + whole.confidence });
    if (confirmed) break; // right way up — no need to read the other way
  }
  const best = [...tries].sort((a, b) => b.score - a.score)[0];
  const words = best ? stickerWords(best.text, sticker) : [];
  return words.length >= 2 ? words.join(' ') : null;
}
