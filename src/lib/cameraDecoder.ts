/**
 * Camera → barcode reads, shared by the one-shot and continuous scanners.
 *
 * Engines:
 *  - native: the browser's BarcodeDetector (Android Chrome = Google ML Kit,
 *    macOS Safari = Apple Vision). Faster and much better on blurry, angled or
 *    damaged barcodes. Sees every barcode in the frame, so we can prefer the
 *    product code nearest the centre over a shipping label next to it.
 *  - zxing:  pure-JS fallback (iOS, Windows, Firefox).
 *
 * Set localStorage "scan-engine" to "zxing" to force the fallback on a device
 * where the native detector misbehaves.
 */
import {
  BarcodeFormat,
  BrowserMultiFormatReader,
  ChecksumException,
  DecodeHintType,
  FormatException,
  NotFoundException,
  type Result,
} from '@zxing/library';
import { classifyCode } from '@/lib/barcode';

export interface RawRead {
  text: string;
  /** ZXing BarcodeFormat name, e.g. "UPC_A" (native names are mapped to these) */
  format?: string;
}

export interface CameraDecoder {
  engine: 'native' | 'zxing';
  track: MediaStreamTrack | null;
  stop(): void;
}

/** Formats found on retail products, Amazon labels and books. */
const ZXING_FORMATS = [
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
  BarcodeFormat.QR_CODE,
];
const NATIVE_FORMATS = ['upc_a', 'upc_e', 'ean_13', 'ean_8', 'code_128', 'code_39', 'itf', 'qr_code'];

// ── Read confirmation ────────────────────────────────────────────────────────

/**
 * Accept a read only after the same text has decoded `required` times within
 * `windowMs`. A single misdecoded frame is the main source of wrong items;
 * two agreeing frames cost ~150 ms and remove nearly all of them.
 * Returns a function: feed it every raw read, it returns true when confirmed.
 */
export function createReadConfirmer(required = 2, windowMs = 1500) {
  const seen = new Map<string, { count: number; firstAt: number }>();
  return (text: string, now = Date.now()): boolean => {
    for (const [key, entry] of seen) if (now - entry.firstAt > windowMs) seen.delete(key);
    const entry = seen.get(text) ?? { count: 0, firstAt: now };
    entry.count += 1;
    seen.set(text, entry);
    if (entry.count < required) return false;
    seen.delete(text);
    return true;
  };
}

// ── Native BarcodeDetector ───────────────────────────────────────────────────

interface DetectedBarcode {
  rawValue: string;
  format: string;
  boundingBox: DOMRectReadOnly;
}
interface NativeDetector {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}
interface NativeDetectorCtor {
  new (options: { formats: string[] }): NativeDetector;
  getSupportedFormats(): Promise<string[]>;
}

function forcedEngine(): string | null {
  try {
    return localStorage.getItem('scan-engine');
  } catch {
    return null;
  }
}

async function createNativeDetector(): Promise<NativeDetector | null> {
  if (forcedEngine() === 'zxing') return null;
  const Ctor = (window as unknown as { BarcodeDetector?: NativeDetectorCtor }).BarcodeDetector;
  if (!Ctor) return null;
  try {
    const supported = await Ctor.getSupportedFormats();
    // Desktop Chrome on Windows/Linux exposes the API but supports nothing
    if (!['ean_13', 'upc_a', 'code_128'].every((f) => supported.includes(f))) return null;
    return new Ctor({ formats: NATIVE_FORMATS.filter((f) => supported.includes(f)) });
  } catch {
    return null;
  }
}

/** Of several barcodes in one frame, the product code nearest the centre wins. */
function pickBarcode(codes: DetectedBarcode[], video: HTMLVideoElement): RawRead | null {
  const cx = video.videoWidth / 2;
  const cy = video.videoHeight / 2;
  let best: { read: RawRead; score: number } | null = null;
  for (const code of codes) {
    if (!code.rawValue) continue;
    const read = { text: code.rawValue, format: code.format.toUpperCase() };
    const box = code.boundingBox;
    const distance = Math.hypot(box.x + box.width / 2 - cx, box.y + box.height / 2 - cy);
    // Product codes always beat non-product codes, then nearest the centre
    const score = (classifyCode(read.text, read.format) ? 0 : 1e6) + distance;
    if (!best || score < best.score) best = { read, score };
  }
  return best?.read ?? null;
}

// ── Camera ───────────────────────────────────────────────────────────────────

function cameraConstraints(highRes: boolean): MediaStreamConstraints {
  // ZXing decodes every pixel in JS, so it stays at 720p; the native detector
  // is hardware-accelerated and reads small barcodes better at 1080p
  return {
    audio: false,
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: highRes ? 1920 : 1280 },
      height: { ideal: highRes ? 1080 : 720 },
    },
  };
}

/** Continuous autofocus where the camera supports it (Android); blurry bars are the #1 cause of misses. */
function enableAutofocus(track: MediaStreamTrack | null) {
  const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { focusMode?: string[] }) | undefined;
  if (caps?.focusMode?.includes('continuous')) {
    track!
      .applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] })
      .catch(() => {
        /* not supported after all — keep the default focus */
      });
  }
}

function createZxingReader(timeBetweenScansMillis: number): BrowserMultiFormatReader {
  const hints = new Map<DecodeHintType, unknown>();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, ZXING_FORMATS);
  hints.set(DecodeHintType.TRY_HARDER, true);
  // Report GS1-128 labels with their "]C1" prefix so the GTIN inside can be read
  hints.set(DecodeHintType.ASSUME_GS1, true);
  return new BrowserMultiFormatReader(hints, timeBetweenScansMillis);
}

/**
 * Open the rear camera into `video` and report every barcode read via `onRead`
 * (unconfirmed — pair with createReadConfirmer). Throws when the camera can't start.
 */
export async function startCameraDecoder(
  video: HTMLVideoElement,
  onRead: (read: RawRead) => void,
  { intervalMs = 120 }: { intervalMs?: number } = {}
): Promise<CameraDecoder> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera not available — the app must be opened over HTTPS.');
  }

  const detector = await createNativeDetector();
  const stream = await navigator.mediaDevices.getUserMedia(cameraConstraints(!!detector));
  const track = stream.getVideoTracks()[0] ?? null;
  enableAutofocus(track);

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let reader: BrowserMultiFormatReader | null = null;

  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    reader?.reset();
    stream.getTracks().forEach((t) => t.stop());
    if (video.srcObject === stream) video.srcObject = null;
  };

  try {
    if (detector) {
      video.setAttribute('playsinline', 'true');
      video.muted = true;
      video.srcObject = stream;
      await video.play().catch(() => {
        /* autoplay attribute will start it */
      });
      const tick = async () => {
        if (stopped) return;
        if (video.readyState >= 2 && video.videoWidth > 0) {
          try {
            const read = pickBarcode(await detector.detect(video), video);
            if (read && !stopped) onRead(read);
          } catch {
            // a dropped frame — try the next one
          }
        }
        if (!stopped) timer = setTimeout(tick, intervalMs);
      };
      void tick();
      return { engine: 'native', track, stop };
    }

    reader = createZxingReader(intervalMs);
    await reader.decodeFromStream(stream, video, (result: Result | null, err?: Error) => {
      if (stopped) return;
      if (result) {
        onRead({ text: result.getText(), format: BarcodeFormat[result.getBarcodeFormat()] });
      } else if (
        err &&
        !(err instanceof NotFoundException) &&
        !(err instanceof ChecksumException) &&
        !(err instanceof FormatException)
      ) {
        // NotFound/Checksum/Format fire constantly while nothing readable is in frame
        console.error('Scanner error:', err);
      }
    });
    return { engine: 'zxing', track, stop };
  } catch (e) {
    stop();
    throw e;
  }
}

/** Friendly message for camera start failures. */
export function cameraErrorMessage(e: unknown): string {
  if (e instanceof Error) {
    if (e.name === 'NotAllowedError') return 'Camera permission was denied. Allow camera access and try again.';
    if (e.name === 'NotFoundError' || e.name === 'OverconstrainedError') return 'No camera found on this device.';
    if (e.name === 'NotReadableError') return 'The camera is in use by another app. Close it and try again.';
    return e.message;
  }
  return 'Camera error';
}
