import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBarcodeScanner, normalizeUpc, type ScanResult } from '@/hooks/useBarcodeScanner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, ScanLine, Loader2, Zap, ZapOff, Camera, CameraOff } from 'lucide-react';
import { Item } from '@/hooks/useInventory';
import { toast } from 'sonner';
import { readStickerText } from '@/lib/stickerOcr';
import { classifyCode, type CodeType } from '@/lib/barcode';

const VIEWFINDER_ID = 'zxing-viewfinder';

interface BarcodeScannerModalProps {
  open: boolean;
  items: Item[];
  /** An exact code match (ASIN, linked UPC, or a sticker saved on the item) */
  onMatchFound: (item: Item, code: string, codeType: CodeType) => void;
  /** `hint`: words read off an X00 sticker, to rank the picker */
  onNoMatch: (code: string, codeType: CodeType, hint?: string | null) => void;
  onClose: () => void;
}

export function BarcodeScannerModal({
  open,
  items,
  onMatchFound,
  onNoMatch,
  onClose,
}: BarcodeScannerModalProps) {
  const { scan, cancelScan, isScanning, error, torchSupported, torchOn, toggleTorch } = useBarcodeScanner();
  const [cameraOn, setCameraOn] = useState(true);
  const [typed, setTyped] = useState('');
  // The latest handler, for the scan started by the effect below
  const handleRef = useRef<(result: ScanResult) => Promise<void>>(async () => undefined);

  handleRef.current = async (result: ScanResult) => {
    switch (result.status) {
      case 'found': {
        // Amazon X00 sticker → a sticker matched before is saved on its item
        const bySticker =
          result.codeType === 'fnsku'
            ? items.find((item) => item.fnsku?.toUpperCase() === result.value)
            : undefined;
        if (bySticker) {
          toast.success(`Found: ${bySticker.title || 'Untitled item'}`);
          onMatchFound(bySticker, result.value, 'fnsku');
          onClose();
          break;
        }
        if (result.codeType === 'fnsku') {
          // A new X00 sticker can't be looked up — read the product name printed on it
          const reading = result.frame ? toast.loading('Reading the sticker…') : undefined;
          const printed = result.frame ? await readStickerText(result.frame, result.value) : null;
          if (reading !== undefined) toast.dismiss(reading);
          // Never matched on a reading alone — brands sell look-alikes. The picker
          // opens the closest order's details for the user to confirm.
          onNoMatch(result.value, 'fnsku', printed);
          onClose();
          break;
        }
        const match =
          result.codeType === 'asin'
            ? items.find((item) => item.amazon_asin?.toUpperCase() === result.value)
            : items.find((item) => item.upc && normalizeUpc(item.upc) === normalizeUpc(result.value));
        if (match) {
          toast.success(`Found: ${match.title || 'Untitled item'}`);
          onMatchFound(match, result.value, result.codeType);
        } else {
          onNoMatch(result.value, result.codeType);
        }
        onClose();
        break;
      }
      case 'not_recognized':
        toast.warning(
          'That looks like a tracking/shipment code. Scan the Amazon label barcode or the product’s own UPC barcode.'
        );
        onClose();
        break;
      case 'cancelled':
        break;
      case 'error':
        toast.error(result.message || 'Scanner error');
        onClose();
        break;
    }
  };

  // Camera runs while the scanner is open and switched on
  useEffect(() => {
    if (!open || !cameraOn) return;
    let active = true;
    const timer = setTimeout(async () => {
      const result = await scan(VIEWFINDER_ID);
      if (active) await handleRef.current(result);
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
      // Release the camera when it's switched off or the scanner closes mid-scan
      cancelScan();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cameraOn]);

  // Every opening starts with the camera on and an empty code box
  useEffect(() => {
    if (open) {
      setCameraOn(true);
      setTyped('');
    }
  }, [open]);

  const submitTyped = () => {
    const code = classifyCode(typed);
    if (!code) {
      toast.error('That isn’t a UPC, ASIN or X00 sticker code');
      return;
    }
    void handleRef.current({ status: 'found', ...code, rawValue: typed.trim() });
  };

  const close = () => {
    cancelScan();
    onClose();
  };

  if (!open) return null;

  // Rendered on <body> so the app's header and bottom bar can't cover it
  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      {/* Header */}
      <div
        className="flex items-center justify-between gap-2 px-4 pb-3 bg-black/80"
        style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)' }}
      >
        <div className="flex items-center gap-2 text-white">
          <ScanLine className="w-5 h-5 text-primary" />
          <span className="font-medium text-sm">Scan barcode</span>
        </div>
        <div className="flex items-center gap-2">
          {cameraOn && torchSupported && (
            <button
              onClick={() => void toggleTorch()}
              className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center"
              aria-label={torchOn ? 'Turn flashlight off' : 'Turn flashlight on'}
            >
              {torchOn ? <ZapOff className="w-5 h-5" /> : <Zap className="w-5 h-5" />}
            </button>
          )}
          <button
            onClick={() => setCameraOn((on) => !on)}
            className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center"
            aria-label={cameraOn ? 'Turn camera off' : 'Turn camera on'}
          >
            {cameraOn ? <CameraOff className="w-5 h-5" /> : <Camera className="w-5 h-5" />}
          </button>
          <button onClick={close} className="w-10 h-10 flex items-center justify-center text-white/70 hover:text-white" aria-label="Close">
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Camera viewfinder — zxing renders directly into the video element */}
      <div className="relative flex-1 overflow-hidden bg-black">
        {cameraOn ? (
          <>
            <video id={VIEWFINDER_ID} className="w-full h-full object-cover" playsInline muted autoPlay />

            {/* Targeting overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div
                className="relative border-2 border-primary rounded-xl"
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
                {isScanning && <div className="absolute inset-x-2 top-0 h-0.5 bg-primary/80 animate-scan-line" />}
              </div>
            </div>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-4 px-6 text-white/70 text-sm">
            <CameraOff className="w-10 h-10" />
            <p className="text-center">Camera off — type the code from the box instead</p>
            <form
              className="w-full max-w-xs flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                submitTyped();
              }}
            >
              <Input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="UPC, ASIN or X00…"
                autoCapitalize="characters"
                autoCorrect="off"
                className="bg-white/10 border-white/20 text-white placeholder:text-white/40"
              />
              <Button type="submit" disabled={!typed.trim()}>
                Find
              </Button>
            </form>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className="bg-black/80 px-4 pt-4 flex flex-col items-center gap-3"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)' }}
      >
        {cameraOn && !isScanning && !error && (
          <div className="flex items-center gap-2 text-white/60 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Starting camera...</span>
          </div>
        )}
        {cameraOn && isScanning && <p className="text-white/60 text-sm text-center">Point at the barcode on the box</p>}
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        <Button
          variant="outline"
          className="w-full max-w-xs border-white/20 bg-transparent text-white hover:bg-white/10"
          onClick={close}
        >
          Cancel
        </Button>
      </div>
    </div>,
    document.body
  );
}
