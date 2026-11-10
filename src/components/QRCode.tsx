import { useMemo } from 'react';
import { BarcodeFormat, QRCodeWriter } from '@zxing/library';
import { cn } from '@/lib/utils';

interface QRCodeProps {
  text: string;
  size?: number;
  className?: string;
}

/**
 * Clean SVG QR code generator powered by `@zxing/library`.
 * Renders directly as vector rects with zero external image requests.
 */
export function QRCode({ text, size = 180, className }: QRCodeProps) {
  const { width, height, rects } = useMemo(() => {
    if (!text) return { width: 0, height: 0, rects: [] };
    try {
      const writer = new QRCodeWriter();
      const hints = new Map();
      const matrix = writer.encode(text, BarcodeFormat.QR_CODE, size, size, hints);
      const w = matrix.getWidth();
      const h = matrix.getHeight();
      const points: { x: number; y: number }[] = [];

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (matrix.get(x, y)) {
            points.push({ x, y });
          }
        }
      }
      return { width: w, height: h, rects: points };
    } catch (e) {
      console.error('Failed to generate QR code', e);
      return { width: 0, height: 0, rects: [] };
    }
  }, [text, size]);

  if (rects.length === 0) {
    return (
      <div
        className={cn('flex items-center justify-center bg-muted text-xs text-muted-foreground rounded', className)}
        style={{ width: size, height: size }}
      >
        QR unavailable
      </div>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn('bg-white p-2 rounded shadow-sm border', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`QR code for ${text}`}
    >
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={1} height={1} fill="#000" />
      ))}
    </svg>
  );
}

