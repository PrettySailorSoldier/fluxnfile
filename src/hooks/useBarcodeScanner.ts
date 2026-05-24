import { useState, useCallback, useRef } from 'react';
import {
  BrowserMultiFormatReader,
  NotFoundException,
  Result,
} from '@zxing/library';

export type ScanResult =
  | { status: 'found'; asin: string; rawValue: string }
  | { status: 'not_asin'; rawValue: string }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

function extractASIN(raw: string): string | null {
  if (!raw) return null;

  // Amazon URL pattern — most reliable
  const urlMatch = raw.match(/\/dp\/([A-Z0-9]{10})/i);
  if (urlMatch) return urlMatch[1].toUpperCase();

  // Direct ASIN — exactly 10 chars, starts with B
  const directMatch = raw.match(/\b(B[A-Z0-9]{9})\b/);
  if (directMatch) return directMatch[1].toUpperCase();

  // Numeric ASIN (older products)
  const numericMatch = raw.match(/\b([0-9]{10})\b/);
  if (numericMatch) return numericMatch[1];

  return null;
}

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
      return new Promise(async (resolve) => {
        resolveRef.current = resolve;
        setError(null);
        setIsScanning(true);

        try {
          // Explicitly request camera permission first — required for Safari PWA
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: 'environment',
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          });
          // Stop the permission stream — zxing manages its own stream
          stream.getTracks().forEach((t) => t.stop());

          const reader = new BrowserMultiFormatReader();
          readerRef.current = reader;

          const videoEl = document.getElementById(
            videoElementId
          ) as HTMLVideoElement | null;

          if (!videoEl) {
            stopScanner();
            resolve({ status: 'error', message: 'Video element not found' });
            return;
          }

          // undefined = default rear camera
          reader.decodeFromVideoDevice(
            undefined,
            videoEl,
            (result: Result | null, err?: Error) => {
              if (result) {
                const rawValue = result.getText();
                const asin = extractASIN(rawValue);

                stopScanner();

                if ('vibrate' in navigator) {
                  navigator.vibrate(100);
                }

                if (asin) {
                  resolve({ status: 'found', asin, rawValue });
                } else {
                  resolve({ status: 'not_asin', rawValue });
                }
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
