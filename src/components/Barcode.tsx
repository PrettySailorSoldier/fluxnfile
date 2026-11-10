import { useMemo } from 'react';
import { code128Modules } from '@/lib/code128';
import { cn } from '@/lib/utils';

/** Code 128 bars as SVG rects, merging runs of black modules. */
export function Barcode({ text, className }: { text: string; className?: string }) {
  const modules = useMemo(() => code128Modules(text), [text]);
  const rects: { x: number; w: number }[] = [];
  for (let i = 0; i < modules.length; ) {
    if (modules[i]) {
      let j = i;
      while (j < modules.length && modules[j]) j++;
      rects.push({ x: i, w: j - i });
      i = j;
    } else i++;
  }
  return (
    <svg
      viewBox={`0 0 ${modules.length} 30`}
      preserveAspectRatio="none"
      className={cn('w-full h-8', className)}
      role="img"
      aria-label={`Barcode ${text}`}
    >
      {rects.map((r) => (
        <rect key={r.x} x={r.x} y={0} width={r.w} height={30} fill="#000" />
      ))}
    </svg>
  );
}

