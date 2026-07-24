import { useState, useCallback, useRef } from 'react';
import {
  BrowserMultiFormatReader,
  NotFoundException,
  Result,
} from '@zxing/library';

export type ScannedCode =
  | { codeType: 'asin'; value: string }
  | { codeType: 'upc'; value: string };

export type ScanResult =
  | ({ status: 'found'; rawValue: string } & ScannedCode)
  | { status: 'not_recognized'; rawValue: string }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

/** Strip non-digits and leading zeros so UPC-A and its EAN-13 form compare equal. */
export function normalizeUpc(raw: string): string {
  return raw.replace(/\D/g, '').replace(/^0+/, '');
}

function classifyCode(raw: string): ScannedCode | null {
  if (!raw) return null;
  const trimmed = raw.trim();

  // Amazon URL pattern — most reliable
  const urlMatch = trimmed.match(/\/dp\/([A-Z0-9]{10})/i);
  if (urlMatch) return { codeType: 'asin', value: urlMatch[1].toUpperCase() };

  // Direct ASIN — exactly 10 chars, starts with B
  const directMatch = trimmed.match(/\b(B[A-Z0-9]{9})\b/);
  if (directMatch) return { codeType: 'asin', value: directMatch[1].toUpperCase() };

  const digitsOnly = trimmed.replace(/\D/g, '');

  // Numeric ASIN / ISBN-10 (older products) — exactly 10 digits
  if (/^\d{10}$/.test(trimmed)) return { codeType: 'asin', value: trimmed };

  // Product barcode: UPC-A (12), EAN-13 (13), ITF-14 (14), UPC-E padded (11)
  if (digitsOnly === trimmed && /^\d{11,14}$/.test(digitsOnly)) {
    return { codeType: 'upc', value: digitsOnly };
  }

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
      return new Promise((resolve) => {
        void (async () => {
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
                const code = classifyCode(rawValue);

                stopScanner();

                if ('vibrate' in navigator) {
                  navigator.vibrate(100);
                }

                if (code) {
                  resolve({ status: 'found', ...code, rawValue });
                } else {
                  resolve({ status: 'not_recognized', rawValue });
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
