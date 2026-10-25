import { useCallback, useEffect, useRef, useState } from 'react';
import { scanMeta, toScanResult, type ScanMeta, type ScanResult } from '@/hooks/useBarcodeScanner';
import {
  cameraErrorMessage,
  createReadConfirmer,
  startCameraDecoder,
  type CameraDecoder,
} from '@/lib/cameraDecoder';

type FoundOrUnrecognized = Extract<ScanResult, { status: 'found' | 'not_recognized' }>;

interface Options {
  /**
   * The same code is accepted again only after it has been out of view this
   * long — holding a box in front of the camera won't add it twice, but
   * scanning a second identical box works. Tracked per code, so moving the
   * camera between two barcodes on one box doesn't re-add either of them.
   */
  repeatGapMs?: number;
}

/**
 * Keeps the camera open and reports every new, confirmed barcode via `onCode`.
 * Every format must decode the same twice before it counts (see createReadConfirmer) —
 * that also covers short symbologies ZXing "finds" in blurry frames of other barcodes
 * (e.g. an EAN-8 read off half of an EAN-13).
 * Call `pause()` while a sheet/dialog is open so stray reads are ignored.
 */
export function useContinuousScanner(
  onCode: (result: FoundOrUnrecognized, meta: ScanMeta) => void,
  { repeatGapMs = 2000 }: Options = {}
) {
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const decoderRef = useRef<CameraDecoder | null>(null);
  /** Bumped on every start/stop so a camera that finishes opening after stop is closed */
  const sessionRef = useRef(0);
  const pausedRef = useRef(false);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  const stop = useCallback(() => {
    sessionRef.current += 1;
    decoderRef.current?.stop();
    decoderRef.current = null;
    setIsRunning(false);
    setTorchOn(false);
  }, []);

  const start = useCallback(
    async (video: HTMLVideoElement) => {
      stop();
      setError(null);
      const session = sessionRef.current;
      const confirm = createReadConfirmer();
      /** Last time each code was seen (any raw read) — drives the repeat gap */
      const lastSeen = new Map<string, number>();
      /** Codes already reported that haven't left the frame since */
      const reported = new Set<string>();

      try {
        const decoder = await startCameraDecoder(video, (read) => {
          const { text } = read;
          const now = Date.now();
          const prev = lastSeen.get(text);
          lastSeen.set(text, now);
          if (lastSeen.size > 50) {
            for (const [code, at] of lastSeen) if (now - at > repeatGapMs) lastSeen.delete(code);
          }
          // Out of view long enough → the next sighting is a new scan
          if (prev === undefined || now - prev >= repeatGapMs) reported.delete(text);
          // Whatever is in view while a sheet is open counts as handled
          if (pausedRef.current) reported.add(text);
          if (reported.has(text) || !confirm(text, now)) return;
          reported.add(text);
          const scan = toScanResult(read);
          if (scan.status === 'found' || scan.status === 'not_recognized') {
            onCodeRef.current(scan, scanMeta(read));
          }
        });
        if (session !== sessionRef.current) {
          decoder.stop();
          return;
        }
        decoderRef.current = decoder;
        setIsRunning(true);

        // Torch (flashlight) — Chrome/Android only
        const caps = decoder.track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
        setTorchSupported(!!caps?.torch);
      } catch (e) {
        if (session !== sessionRef.current) return;
        stop();
        setError(cameraErrorMessage(e));
      }
    },
    [stop, repeatGapMs]
  );

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

  const pause = useCallback(() => {
    pausedRef.current = true;
  }, []);

  const resume = useCallback(() => {
    pausedRef.current = false;
  }, []);

  // Always release the camera on unmount
  useEffect(() => stop, [stop]);

  return { start, stop, pause, resume, isRunning, error, torchSupported, torchOn, toggleTorch };
}
