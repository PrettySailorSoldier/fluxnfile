import type { CSSProperties } from 'react';
import { Barcode } from '@/components/Barcode';
import { itemBarcodeText, itemNumberText, labelLayout, priceLabel, type LabelItem } from '@/lib/labelCanvas';
import { cn } from '@/lib/utils';

type Mode = { kind: 'sheet'; large: boolean } | { kind: 'label'; widthMm: number; heightMm: number };

/**
 * A price tag / item label: tag price, title, and the item-number barcode Market
 * Mode scans. `sheet` is the tag for the multi-up sheet (PriceTags); `label` is
 * sized in mm for one-label-per-page printing. Never shows the floor price.
 */
export function ItemLabel({ item, mode, className }: { item: LabelItem; mode: Mode; className?: string }) {
  const number = item.tracking_number;
  const price = item.tag_price;

  if (mode.kind === 'sheet') {
    const { large } = mode;
    return (
      <div className="border border-black/70 rounded-md p-2 bg-white text-black break-inside-avoid flex flex-col justify-between" style={{ pageBreakInside: 'avoid' }}>
        <p className={large ? 'text-5xl font-extrabold leading-none text-center py-2' : 'text-4xl font-extrabold leading-none text-center py-1.5'}>
          {price != null ? priceLabel(price) : '—'}
        </p>
        <p className={large ? 'text-sm text-center leading-tight line-clamp-2 min-h-[2.4em]' : 'text-xs text-center leading-tight line-clamp-2 min-h-[2.4em]'}>
          {item.title || 'Untitled item'}
        </p>
        {number ? (
          <div className="mt-1">
            <Barcode text={String(number).padStart(6, '0')} />
            <p className="text-[10px] text-center tracking-widest">#{String(number).padStart(5, '0')}</p>
          </div>
        ) : (
          <p className="text-[10px] text-center mt-1">no item number</p>
        )}
      </div>
    );
  }

  const { widthMm, heightMm } = mode;
  const L = labelLayout(widthMm, heightMm);
  const box: CSSProperties = {
    width: `${widthMm}mm`,
    height: `${heightMm}mm`,
    padding: `${L.pad}mm`,
    boxSizing: 'border-box',
  };
  return (
    <div
      className={cn('label-print bg-white text-black flex flex-col items-stretch overflow-hidden text-center', className)}
      style={box}
      data-label-size={`${widthMm}x${heightMm}`}
    >
      <p className="font-extrabold leading-none whitespace-nowrap overflow-hidden" style={{ fontSize: `${L.priceFont}mm` }}>
        {price != null ? priceLabel(price) : '—'}
      </p>
      <p
        className={cn('flex-1 min-h-0 overflow-hidden break-words', L.titleLines === 1 ? 'line-clamp-1' : 'line-clamp-2')}
        style={{ fontSize: `${L.titleFont}mm`, lineHeight: 1.15, marginTop: `${L.titleFont * 0.15}mm` }}
      >
        {L.titleLines > 0 ? item.title || 'Untitled item' : null}
      </p>
      {number ? (
        <div className="flex-none">
          <div style={{ height: `${L.barcodeHeight}mm` }}>
            <Barcode text={itemBarcodeText(number)} className="h-full" />
          </div>
          <p className="leading-none tracking-widest" style={{ fontSize: `${L.numberFont}mm`, marginTop: `${L.numberFont * 0.1}mm` }}>
            {itemNumberText(number)}
          </p>
        </div>
      ) : (
        <p className="flex-none leading-none" style={{ fontSize: `${L.numberFont}mm` }}>
          no item number
        </p>
      )}
    </div>
  );
}
