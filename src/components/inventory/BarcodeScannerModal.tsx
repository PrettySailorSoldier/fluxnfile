import { useEffect, useRef } from 'react';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import { Button } from '@/components/ui/button';
import { X, ScanLine, Loader2 } from 'lucide-react';
import { Item } from '@/hooks/useInventory';
import { toast } from 'sonner';

const VIEWFINDER_ID = 'zxing-viewfinder';

interface BarcodeScannerModalProps {
  open: boolean;
  items: Item[];
  onMatchFound: (item: Item) => void;
  onNoMatch: (asin: string) => void;
  onClose: () => void;
}

export function BarcodeScannerModal({
  open,
  items,
  onMatchFound,
  onNoMatch,
  onClose,
}: BarcodeScannerModalProps) {
  const { scan, cancelScan, isScanning, error } = useBarcodeScanner();
  const hasStarted = useRef(false);

  useEffect(() => {
    if (!open || hasStarted.current) return;
    hasStarted.current = true;

    const timer = setTimeout(async () => {
      const result = await scan(VIEWFINDER_ID);

      switch (result.status) {
        case 'found':
        case 'not_asin': {
          const rawValue = result.rawValue.trim().toUpperCase();
          const isAsinFormat =
            rawValue.length === 10 &&
            (rawValue.startsWith('B0') || /^\d{10}$/.test(rawValue));

          if (!isAsinFormat) {
            toast.warning(
              'That looks like a tracking/shipment code. Scan the barcode on the product itself — it starts with B0 and is 10 characters.'
            );
          } else {
            const match = items.find(
              (item) => item.asin?.toUpperCase() === rawValue
            );
            if (match) {
              toast.success(`Found: ${match.title || 'Untitled item'}`);
              onMatchFound(match);
            } else {
              toast.warning(`Scanned: "${rawValue}" — no ASIN found`);
              onNoMatch(rawValue);
            }
          }
          onClose();
          break;
        }
        case 'cancelled':
          onClose();
          break;
        case 'error':
          toast.error(result.message || 'Scanner error');
          onClose();
          break;
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      hasStarted.current = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      hasStarted.current = false;
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-black/80"
        style={{ paddingTop: 'env(safe-area-inset-top, 12px)' }}
      >
        <div className="flex items-center gap-2 text-white">
          <ScanLine className="w-5 h-5 text-primary" />
          <span className="font-medium text-sm">Scan Amazon Package</span>
        </div>
        <button
          onClick={() => {
            cancelScan();
            onClose();
          }}
          className="text-white/70 hover:text-white p-1"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Camera viewfinder — zxing renders directly into the video element */}
      <div className="relative flex-1 overflow-hidden bg-black">
        <video
          id={VIEWFINDER_ID}
          className="w-full h-full object-cover"
          playsInline
          muted
          autoPlay
        />

        {/* Targeting overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="absolute inset-0 bg-black/40" />

          <div
            className="relative z-10 border-2 border-primary rounded-xl"
            style={{
              width: '80%',
              maxWidth: '320px',
              height: '160px',
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
            }}
          >
            {/* Corner accents */}
            <div className="absolute -top-0.5 -left-0.5 w-6 h-6 border-t-4 border-l-4 border-primary rounded-tl-xl" />
            <div className="absolute -top-0.5 -right-0.5 w-6 h-6 border-t-4 border-r-4 border-primary rounded-tr-xl" />
            <div className="absolute -bottom-0.5 -left-0.5 w-6 h-6 border-b-4 border-l-4 border-primary rounded-bl-xl" />
            <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 border-b-4 border-r-4 border-primary rounded-br-xl" />

            {/* Scanning line animation */}
            {isScanning && (
              <div className="absolute inset-x-2 top-0 h-0.5 bg-primary/80 animate-scan-line" />
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        className="bg-black/80 px-4 py-4 flex flex-col items-center gap-3"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}
      >
        {!isScanning && !error && (
          <div className="flex items-center gap-2 text-white/60 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Starting camera...</span>
          </div>
        )}
        {isScanning && (
          <p className="text-white/60 text-sm text-center">
            Point at the barcode on the box
          </p>
        )}
        {error && (
          <p className="text-red-400 text-sm text-center">{error}</p>
        )}
        <Button
          variant="outline"
          className="w-full max-w-xs border-white/20 text-white hover:bg-white/10"
          onClick={() => {
            cancelScan();
            onClose();
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
