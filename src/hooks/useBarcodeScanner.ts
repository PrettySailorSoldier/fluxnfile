import { useState, useCallback, useRef } from 'react';
import { classifyCode, explainUnrecognized, normalizeUpc, type ScannedCode } from '@/lib/barcode';
import {
  cameraErrorMessage,
  createReadConfirmer,
  startCameraDecoder,
  type CameraDecoder,
  type RawRead,
} from '@/lib/cameraDecoder';
import { captureFrame, type StickerFrame } from '@/lib/stickerOcr';

// Re-exported so existing imports keep working
export { normalizeUpc };
export type { ScannedCode };

export type ScanResult =
  /** `frame`: the camera frame of an Amazon X00 sticker, so its printed name can be read */
  | ({ status: 'found'; rawValue: string; frame?: StickerFrame | null } & ScannedCode)
  | { status: 'not_recognized'; rawValue: string; /** What the code probably is, for the user */ hint: string }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

export interface ScanMeta {
  /** The barcode ran up/down the frame (label turned 90°) */
  vertical: boolean;
  /** The scan line through the barcode, in video pixels */
  points: { x: number; y: number }[];
}

/** Where the barcode lay in the frame. */
export function scanMeta({ points }: RawRead): ScanMeta {
  if (points.length < 2) return { vertical: false, points };
  const first = points[0];
  const last = points[points.length - 1];
  return { vertical: Math.abs(last.y - first.y) > Math.abs(last.x - first.x), points };
}

/** Turn a camera read into a typed scan result. */
export function toScanResult({ text, format }: Pick<RawRead, 'text' | 'format'>): ScanResult {
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
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const decoderRef = useRef<CameraDecoder | null>(null);
  const resolveRef = useRef<((result: ScanResult) => void) | null>(null);
  /** Bumped on every start/stop so a camera that finishes opening after cancel is closed */
  const sessionRef = useRef(0);

  const stopScanner = useCallback(() => {
    sessionRef.current += 1;
    decoderRef.current?.stop();
    decoderRef.current = null;
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
              const scanResult = toScanResult(read);
              // Keep the frame of an X00 sticker before the camera is released
              if (scanResult.status === 'found' && scanResult.codeType === 'fnsku') {
                const meta = scanMeta(read);
                scanResult.frame = captureFrame(videoEl, meta.vertical, meta.points);
              }
              const done = resolveRef.current;
              resolveRef.current = null;
              stopScanner();
              if ('vibrate' in navigator) navigator.vibrate(100);
              done(scanResult);
            });
            if (session !== sessionRef.current) {
              // Cancelled (or resolved) while the camera was opening
              decoder.stop();
              return;
            }
            decoderRef.current = decoder;

            // Flashlight, where the browser allows it
            const caps = decoder.track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
            setTorchSupported(!!caps?.torch);
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

  const toggleTorch = useCallback(async () => {
    const track = decoderRef.current?.track;
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
