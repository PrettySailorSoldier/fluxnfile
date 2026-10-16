import { useState, useCallback, useRef } from 'react';
import {
  BarcodeFormat,
  BrowserMultiFormatReader,
  DecodeHintType,
  NotFoundException,
  Result,
} from '@zxing/library';
import { classifyCode, normalizeUpc, type ScannedCode } from '@/lib/barcode';

// Re-exported so existing imports keep working
export { normalizeUpc };
export type { ScannedCode };

export type ScanResult =
  | ({ status: 'found'; rawValue: string } & ScannedCode)
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
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const resolveRef = useRef<((result: ScanResult) => void) | null>(null);

  const stopScanner = useCallback(() => {
    if (readerRef.current) {
      readerRef.current.reset();
      readerRef.current = null;
    }
    setIsScanning(false);
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

            // decodeFromConstraints requests permission itself (works in Safari PWAs)
            // and asks for the rear camera explicitly
            await reader.decodeFromConstraints(
              REAR_CAMERA_CONSTRAINTS,
              videoEl,
              (result: Result | null, err?: Error) => {
                if (result && resolveRef.current) {
                  const scanResult = toScanResult(result);
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

  return { scan, cancelScan, isScanning, error };
}
