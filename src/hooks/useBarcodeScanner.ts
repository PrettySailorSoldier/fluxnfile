import { useState, useCallback, useRef } from 'react';
import Quagga from '@ericblade/quagga2';

export type ScanResult =
  | { status: 'found'; asin: string; rawValue: string }
  | { status: 'not_asin'; rawValue: string }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

function extractASIN(raw: string): string | null {
  if (!raw) return null;

  const urlMatch = raw.match(/\/dp\/([A-Z0-9]{10})/i);
  if (urlMatch) return urlMatch[1].toUpperCase();

  const directMatch = raw.match(/\b([B][A-Z0-9]{9}|[0-9]{10})\b/);
  if (directMatch) return directMatch[1].toUpperCase();

  return null;
}

function getMedianCode(results: string[]): string | null {
  if (results.length === 0) return null;
  const freq: Record<string, number> = {};
  for (const r of results) {
    freq[r] = (freq[r] || 0) + 1;
  }
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  if (sorted[0][1] >= 3) return sorted[0][0];
  return null;
}

export function useBarcodeScanner() {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recentResults = useRef<string[]>([]);
  const resolveRef = useRef<((result: ScanResult) => void) | null>(null);
  const scannerMounted = useRef(false);

  const stopScanner = useCallback(() => {
    if (scannerMounted.current) {
      try {
        Quagga.offDetected();
        Quagga.stop();
      } catch {
        // Ignore stop errors
      }
      scannerMounted.current = false;
    }
    recentResults.current = [];
    setIsScanning(false);
  }, []);

  const scan = useCallback(
    (viewfinderElementId: string): Promise<ScanResult> => {
      return new Promise((resolve) => {
        resolveRef.current = resolve;
        recentResults.current = [];
        setError(null);
        setIsScanning(true);

        Quagga.init(
          {
            inputStream: {
              name: 'Live',
              type: 'LiveStream',
              target: document.getElementById(viewfinderElementId),
              constraints: {
                facingMode: 'environment',
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
            },
            decoder: {
              readers: [
                'code_128_reader',
                'ean_reader',
                'ean_8_reader',
                'upc_reader',
                'upc_e_reader',
                'code_39_reader',
                'qr_reader',
              ],
            },
            locate: true,
            numOfWorkers: 2,
            frequency: 10,
          },
          (err) => {
            if (err) {
              setIsScanning(false);
              const message =
                err instanceof Error ? err.message : 'Camera error';
              setError(message);
              resolve({ status: 'error', message });
              return;
            }
            scannerMounted.current = true;
            Quagga.start();

            Quagga.onDetected((data) => {
              const raw = data?.codeResult?.code;
              if (!raw) return;

              recentResults.current.push(raw);
              if (recentResults.current.length > 10) {
                recentResults.current.shift();
              }

              const stable = getMedianCode(recentResults.current);
              if (!stable) return;

              stopScanner();

              const asin = extractASIN(stable);
              if (asin) {
                resolve({ status: 'found', asin, rawValue: stable });
              } else {
                resolve({ status: 'not_asin', rawValue: stable });
              }
            });
          }
        );
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
