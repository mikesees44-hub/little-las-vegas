import { useState, type ReactNode } from 'react';
import { glossaryEntry } from '../../engine/glossary';

/**
 * A hover (or tap) card with rich content, in the house style. Sits above
 * the map, the drawers and the sheet (z 1200).
 */
export function RichTip({ tip, children, className, align = 'center', side = 'bottom', testid }: { tip: ReactNode; children: ReactNode; className?: string; align?: 'center' | 'left' | 'right'; side?: 'bottom' | 'top'; testid?: string }) {
  const [open, setOpen] = useState(false);
  const pos = align === 'left' ? 'left-0' : align === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2';
  return (
    <span className={`group/rt relative inline-flex ${className ?? ''}`} onMouseLeave={() => setOpen(false)} onClick={() => setOpen((o) => !o)} data-testid={testid}>
      {children}
      <span role="tooltip" className={`pointer-events-none absolute ${pos} ${side === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'} z-[1200] w-64 max-w-[86vw] rounded border border-gold-600/50 bg-noir-950/95 px-2.5 py-2 text-left text-[11px] font-normal normal-case leading-snug tracking-normal text-stone-300 shadow-lg shadow-black/70 ${open ? 'block' : 'hidden group-hover/rt:block group-focus-within/rt:block'}`}>
        {tip}
      </span>
    </span>
  );
}

export interface Reason { label: string; value: number }

/** A number with its reasons on hover: sorted by size, with the total. */
export function Num({ v, reasons, term, children, format = (x) => (x > 0 ? `+${x}` : `${x}`), title, align }: {
  v: number;
  reasons: Reason[];
  term?: string;
  children?: ReactNode;
  format?: (x: number) => string;
  title?: string;
  align?: 'center' | 'left' | 'right';
}) {
  const g = term ? glossaryEntry(term) : undefined;
  const rs = [...reasons].filter((r) => r.value !== 0).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const tip = (
    <>
      {(title || g) && <span className="block font-semibold text-gold-300">{title ?? g?.term}</span>}
      {g && <span className="block text-stone-400 mb-1">{g.short}</span>}
      {rs.length > 0 && (
        <span className="block space-y-0.5">
          {rs.slice(0, 8).map((r, i) => (
            <span key={i} className="flex justify-between gap-3"><span className="truncate">{r.label}</span><span className={`tabular-nums ${r.value > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{format(r.value)}</span></span>
          ))}
          {rs.length > 8 && <span className="block text-stone-500">…and {rs.length - 8} more</span>}
          <span className="flex justify-between gap-3 border-t border-noir-700 pt-0.5 font-semibold"><span>Total</span><span className="tabular-nums text-stone-100">{format(v)}</span></span>
        </span>
      )}
    </>
  );
  return <RichTip tip={tip} align={align}>{children ?? <span className="tabular-nums">{format(v)}</span>}</RichTip>;
}
