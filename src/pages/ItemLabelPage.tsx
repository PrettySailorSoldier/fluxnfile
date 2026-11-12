import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer, Share } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ItemLabel } from '@/components/ItemLabel';
import { renderLabelPng, type LabelItem } from '@/lib/labelCanvas';
import { labelPrintCss, useLabelSettings } from '@/lib/labelSettings';

/** Only what goes on the label — the floor price is never loaded here. */
const LABEL_FIELDS = 'id, title, tag_price, tracking_number';

type LabelRow = LabelItem & { id: string };

/**
 * One item label at the size set in Settings. Print goes to the iOS print sheet
 * (AirPrint label printers on the same Wi-Fi); Share hands a PNG to another app.
 */
export default function ItemLabelPage() {
  const { id } = useParams<{ id: string }>();
  const { team } = useAuth();
  const [settings] = useLabelSettings();
  /** The PNG is made ahead of time: Safari only allows share() straight from the tap */
  const [png, setPng] = useState<File | null>(null);
  const styleRef = useRef<HTMLStyleElement | null>(null);

  const { data: item, isLoading } = useQuery({
    queryKey: ['item-label', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('items').select(LABEL_FIELDS).eq('id', id!).eq('team_id', team!.id).single();
      if (error) throw error;
      return data as LabelRow;
    },
    enabled: !!id && !!team?.id,
  });

  // Drop the injected print CSS when leaving the page
  useEffect(() => () => styleRef.current?.remove(), []);

  const { widthMm, heightMm } = settings;

  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    setPng(null);
    renderLabelPng(item, widthMm, heightMm)
      .then((blob) => {
        const name = `label-${item.tracking_number ? String(item.tracking_number).padStart(5, '0') : item.id.slice(0, 8)}.png`;
        if (!cancelled) setPng(new File([blob], name, { type: 'image/png' }));
      })
      .catch((e) => console.error('Label image failed:', e));
    return () => {
      cancelled = true;
    };
  }, [item, widthMm, heightMm]);

  // Called from the button tap only — iOS ignores window.print() that isn't user-initiated
  const print = () => {
    styleRef.current?.remove();
    const style = document.createElement('style');
    style.id = 'label-print-page';
    style.textContent = labelPrintCss(widthMm, heightMm);
    document.head.appendChild(style);
    styleRef.current = style;
    const done = () => {
      style.remove();
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.print();
  };

  const share = async () => {
    if (!item || !png) return;
    if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [png] })) {
      try {
        await navigator.share({ files: [png], title: item.title || 'Item label' });
      } catch (e) {
        // Closing the share sheet isn't an error
        if ((e as DOMException)?.name === 'AbortError') return;
        console.error('Label share failed:', e);
        toast.error('Could not share the label image');
      }
      return;
    }
    // No file sharing here (most desktop browsers): download the PNG instead
    const url = URL.createObjectURL(png);
    const a = document.createElement('a');
    a.href = url;
    a.download = png.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    toast.success('Label image downloaded');
  };

  return (
    <div className="min-h-screen bg-background p-4 print:p-0 print:min-h-0 print:bg-white">
      <div className="print:hidden max-w-lg mx-auto mb-4 flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back">
          <Link to={`/item/${id}`}>
            <ArrowLeft className="w-5 h-5" />
          </Link>
        </Button>
        <h1 className="text-xl font-bold flex-1 min-w-0 truncate">Print label</h1>
      </div>

      {isLoading && <p className="print:hidden text-center text-muted-foreground">Loading…</p>}
      {!isLoading && !item && <p className="print:hidden text-center text-muted-foreground">Item not found.</p>}

      {item && (
        <>
          <div className="flex justify-center rounded-lg bg-muted p-6 overflow-x-auto max-w-lg mx-auto print:block print:bg-transparent print:p-0 print:rounded-none print:max-w-none print:overflow-visible">
            <ItemLabel item={item} mode={{ kind: 'label', widthMm, heightMm }} className="shadow-md flex-shrink-0" />
          </div>

          <div className="print:hidden max-w-lg mx-auto mt-3 space-y-3">
            <p className="text-xs text-muted-foreground text-center">
              {widthMm} × {heightMm} mm ·{' '}
              <Link to="/settings" className="text-primary hover:underline">
                change size
              </Link>
            </p>
            {(item.tag_price == null || !item.tracking_number) && (
              <p className="text-sm text-destructive text-center">
                {item.tag_price == null && 'No tag price yet — the label shows “—”. '}
                {!item.tracking_number && 'No item number, so no barcode.'}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button className="h-11 gap-2" onClick={print}>
                <Printer className="w-4 h-4" /> Print label
              </Button>
              <Button variant="outline" className="h-11 gap-2" onClick={share} disabled={!png}>
                <Share className="w-4 h-4" /> {png ? 'Share as image' : 'Preparing…'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Your printer and phone need to be on the same Wi-Fi for AirPrint.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
