import { useState, useCallback, useRef } from 'react';
import { classifyCode, explainUnrecognized, normalizeUpc, type ScannedCode } from '@/lib/barcode';
import {
  cameraErrorMessage,
  createReadConfirmer,
  startCameraDecoder,
  type CameraDecoder,
  type RawRead,
} from '@/lib/cameraDecoder';

// Re-exported so existing imports keep working
export { normalizeUpc };
export type { ScannedCode };

export type ScanResult =
  | ({ status: 'found'; rawValue: string } & ScannedCode)
  | { status: 'not_recognized'; rawValue: string; /** What the code probably is, for the user */ hint: string }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

/** Turn a camera read into a typed scan result. */
export function toScanResult({ text, format }: RawRead): ScanResult {
  const code = classifyCode(text, format);
  return code
    ? { status: 'found', ...code, rawValue: text }
    : { status: 'not_recognized', rawValue: text, hint: explainUnrecognized(text, format) };
}

/**
 * One-shot scanner: resolves with the first confirmed barcode, then releases the camera.
 * For scanning many items in a row, use useContinuousScanner instead.
 */
export function useBarcodeScanner() {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const decoderRef = useRef<CameraDecoder | null>(null);
  const resolveRef = useRef<((result: ScanResult) => void) | null>(null);
  /** Bumped on every start/stop so a camera that finishes opening after cancel is closed */
  const sessionRef = useRef(0);

  const stopScanner = useCallback(() => {
    sessionRef.current += 1;
    decoderRef.current?.stop();
    decoderRef.current = null;
    setIsScanning(false);
  }, []);

  const scan = useCallback(
    (videoElementId: string): Promise<ScanResult> => {
      return new Promise((resolve) => {
        void (async () => {
          resolveRef.current = resolve;
          setError(null);
          setIsScanning(true);
          const session = ++sessionRef.current;

          const videoEl = document.getElementById(videoElementId) as HTMLVideoElement | null;
          if (!videoEl) {
            stopScanner();
            resolve({ status: 'error', message: 'Video element not found' });
            return;
          }

          const confirm = createReadConfirmer();
          try {
            const decoder = await startCameraDecoder(videoEl, (read) => {
              if (!resolveRef.current || !confirm(read.text)) return;
              const done = resolveRef.current;
              resolveRef.current = null;
              stopScanner();
              if ('vibrate' in navigator) navigator.vibrate(100);
              done(toScanResult(read));
            });
            if (session !== sessionRef.current) {
              // Cancelled (or resolved) while the camera was opening
              decoder.stop();
              return;
            }
            decoderRef.current = decoder;
          } catch (err) {
            if (session !== sessionRef.current) return;
            stopScanner();
            const message = cameraErrorMessage(err);
            setError(message);
            resolveRef.current = null;
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
