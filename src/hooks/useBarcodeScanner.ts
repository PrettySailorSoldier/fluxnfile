import { useState, useCallback, useRef } from 'react';
import {
  BarcodeFormat,
  BrowserMultiFormatReader,
  DecodeHintType,
  NotFoundException,
  Result,
} from '@zxing/library';
import { classifyCode, normalizeUpc, type ScannedCode } from '@/lib/barcode';
import { captureFrame, type StickerFrame } from '@/lib/stickerOcr';

// Re-exported so existing imports keep working
export { normalizeUpc };
export type { ScannedCode };

export type ScanResult =
  /** `frame`: the camera frame of an Amazon X00 sticker, so its printed name can be read */
  | ({ status: 'found'; rawValue: string; frame?: StickerFrame | null } & ScannedCode)
  | { status: 'not_recognized'; rawValue: string }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

/** Formats found on retail products, Amazon labels and books. */
const PRODUCT_FORMATS = [
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
  BarcodeFormat.QR_CODE,
];

export function createProductReader(timeBetweenScansMillis = 150): BrowserMultiFormatReader {
  const hints = new Map<DecodeHintType, unknown>();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, PRODUCT_FORMATS);
  hints.set(DecodeHintType.TRY_HARDER, true);
  return new BrowserMultiFormatReader(hints, timeBetweenScansMillis);
}

export const REAR_CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
};

export interface ScanMeta {
  /** The barcode ran up/down the frame (label turned 90°) */
  vertical: boolean;
  /** Where ZXing found the barcode, in video pixels */
  points: { x: number; y: number }[];
}

/** Where the barcode lay in the frame, from the points ZXing found along it. */
export function scanMeta(result: Result): ScanMeta {
  const points = (result.getResultPoints() ?? []).map((p) => ({ x: p.getX(), y: p.getY() }));
  if (points.length < 2) return { vertical: false, points };
  const first = points[0];
  const last = points[points.length - 1];
  return { vertical: Math.abs(last.y - first.y) > Math.abs(last.x - first.x), points };
}

/** Turn a ZXing result into a typed scan result. */
export function toScanResult(result: Result): ScanResult {
  const rawValue = result.getText();
  const format = BarcodeFormat[result.getBarcodeFormat()];
  const code = classifyCode(rawValue, format);
  return code ? { status: 'found', ...code, rawValue } : { status: 'not_recognized', rawValue };
}

/**
 * One-shot scanner: resolves with the first barcode seen, then releases the camera.
 * For scanning many items in a row, use useContinuousScanner instead.
 */
export function useBarcodeScanner() {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const resolveRef = useRef<((result: ScanResult) => void) | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const getTrack = () => {
    const stream = videoRef.current?.srcObject as MediaStream | null | undefined;
    return stream?.getVideoTracks()[0] ?? null;
  };

  const stopScanner = useCallback(() => {
    if (readerRef.current) {
      readerRef.current.reset();
      readerRef.current = null;
    }
    setIsScanning(false);
    setTorchSupported(false);
    setTorchOn(false);
  }, []);

  const scan = useCallback(
    (videoElementId: string): Promise<ScanResult> => {
      return new Promise((resolve) => {
        void (async () => {
          resolveRef.current = resolve;
          setError(null);
          setIsScanning(true);

          try {
            const videoEl = document.getElementById(videoElementId) as HTMLVideoElement | null;
            if (!videoEl) {
              stopScanner();
              resolve({ status: 'error', message: 'Video element not found' });
              return;
            }

            const reader = createProductReader();
            readerRef.current = reader;
            videoRef.current = videoEl;

            // decodeFromConstraints requests permission itself (works in Safari PWAs)
            // and asks for the rear camera explicitly
            await reader.decodeFromConstraints(
              REAR_CAMERA_CONSTRAINTS,
              videoEl,
              (result: Result | null, err?: Error) => {
                if (result && resolveRef.current) {
                  const scanResult = toScanResult(result);
                  // Keep the frame of an X00 sticker before the camera is released
                  if (scanResult.status === 'found' && scanResult.codeType === 'fnsku') {
                    const meta = scanMeta(result);
                    scanResult.frame = captureFrame(videoEl, meta.vertical, meta.points);
                  }
                  const done = resolveRef.current;
                  resolveRef.current = null;
                  stopScanner();
                  if ('vibrate' in navigator) navigator.vibrate(100);
                  done(scanResult);
                }
                // NotFoundException fires continuously when no barcode is in frame — not an error
                if (err && !(err instanceof NotFoundException)) {
                  console.error('Scanner error:', err);
                }
              }
            );

            // Flashlight, where the browser allows it
            if (readerRef.current === reader) {
              const caps = getTrack()?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
              setTorchSupported(!!caps?.torch);
            }
          } catch (err) {
            stopScanner();
            const message = err instanceof Error ? err.message : 'Camera error';
            setError(message);
            resolve({ status: 'error', message });
          }
        })();
      });
    },
    [stopScanner]
  );

  const cancelScan = useCallback(() => {
    stopScanner();
    resolveRef.current?.({ status: 'cancelled' });
    resolveRef.current = null;
  }, [stopScanner]);

  const toggleTorch = useCallback(async () => {
    const track = getTrack();
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  }, [torchOn]);

  return { scan, cancelScan, isScanning, error, torchSupported, torchOn, toggleTorch };
}
