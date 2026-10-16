import { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, NotFoundException, Result } from '@zxing/library';
import {
  createProductReader,
  REAR_CAMERA_CONSTRAINTS,
  toScanResult,
  type ScanResult,
} from '@/hooks/useBarcodeScanner';

type FoundOrUnrecognized = Extract<ScanResult, { status: 'found' | 'not_recognized' }>;

interface Options {
  /**
   * The same code is accepted again only after it has been out of view this
   * long — holding a box in front of the camera won't add it twice, but
   * scanning a second identical box works.
   */
  repeatGapMs?: number;
}

/**
 * Keeps the camera open and reports every new barcode via `onCode`.
 * Call `pause()` while a sheet/dialog is open so stray reads are ignored.
 */
export function useContinuousScanner(
  onCode: (result: FoundOrUnrecognized) => void,
  { repeatGapMs = 900 }: Options = {}
) {
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pausedRef = useRef(false);
  const lastRef = useRef<{ text: string; seenAt: number } | null>(null);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  const getTrack = (): MediaStreamTrack | null => {
    const stream = videoRef.current?.srcObject;
    return stream instanceof MediaStream ? stream.getVideoTracks()[0] ?? null : null;
  };

  const stop = useCallback(() => {
    readerRef.current?.reset();
    readerRef.current = null;
    setIsRunning(false);
    setTorchOn(false);
  }, []);

  const start = useCallback(
    async (video: HTMLVideoElement) => {
      stop();
      setError(null);
      videoRef.current = video;
      const reader = createProductReader(120);
      readerRef.current = reader;

      try {
        await reader.decodeFromConstraints(
          REAR_CAMERA_CONSTRAINTS,
          video,
          (result: Result | null, err?: Error) => {
            if (result) {
              const text = result.getText();
              const now = Date.now();
              const last = lastRef.current;
              const isRepeat = last && last.text === text && now - last.seenAt < repeatGapMs;
              lastRef.current = { text, seenAt: now };
              if (isRepeat || pausedRef.current) return;
              const scan = toScanResult(result);
              if (scan.status === 'found' || scan.status === 'not_recognized') {
                onCodeRef.current(scan);
              }
            } else if (err && !(err instanceof NotFoundException)) {
              console.error('Scanner error:', err);
            }
          }
        );
        setIsRunning(true);

        // Torch (flashlight) — Chrome/Android only
        const track = getTrack();
        const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
        setTorchSupported(!!caps?.torch);
      } catch (e) {
        stop();
        const message =
          e instanceof Error
            ? e.name === 'NotAllowedError'
              ? 'Camera permission was denied. Allow camera access and try again.'
              : e.message
            : 'Camera error';
        setError(message);
      }
    },
    [stop, repeatGapMs]
  );

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

  const pause = useCallback(() => {
    pausedRef.current = true;
  }, []);

  const resume = useCallback(() => {
    pausedRef.current = false;
    // Don't immediately re-read whatever is still in front of the camera
    if (lastRef.current) lastRef.current.seenAt = Date.now();
  }, []);

  // Always release the camera on unmount
  useEffect(() => stop, [stop]);

  return { start, stop, pause, resume, isRunning, error, torchSupported, torchOn, toggleTorch };
}
