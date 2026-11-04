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

/**
 * A number with its reasons on hover: sorted by size, with the total. With `now` and `from` it answers
 * "why is it this?": where it stood when the week began, each part that moved it, and where it is now
 * (a remainder line, "since the turn, and the limits", makes the parts add up: this week's own moves, or a bar the ledger clamped).
 */
export function Num({ v, reasons, term, children, format = (x) => (x > 0 ? `+${x}` : `${x}`), title, align, now, from }: {
  v: number;
  reasons: Reason[];
  term?: string;
  children?: ReactNode;
  format?: (x: number) => string;
  title?: string;
  align?: 'center' | 'left' | 'right';
  /** The value now: the breakdown ends on it. */
  now?: number;
  /** Where it began (the week's start). */
  from?: { label: string; value: number };
}) {
  const g = term ? glossaryEntry(term) : undefined;
  const sum = reasons.reduce((a, r) => a + r.value, 0);
  const rest = now !== undefined && from ? Math.round(now - from.value - sum) : 0;
  const rs = [...reasons, ...(rest ? [{ label: 'Since the turn, and the limits', value: rest }] : [])].filter((r) => r.value !== 0).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const tip = (
    <>
      {(title || g) && <span className="block font-semibold text-gold-300">{title ?? g?.term}</span>}
      {g && <span className="block text-stone-400 mb-1">{g.short}</span>}
      {now !== undefined && (
        <span className="block" data-testid="num-why">
          <span className="block text-[10px] uppercase tracking-wider text-stone-500">Why is it {now}?</span>
          {from && <span className="flex justify-between gap-3"><span className="truncate text-stone-400">{from.label}</span><span className="tabular-nums text-stone-200">{from.value}</span></span>}
          {!rs.length && <span className="block text-stone-500">Nothing moved it last week.</span>}
        </span>
      )}
      {rs.length > 0 && (
        <span className="block space-y-0.5">
          {rs.slice(0, 8).map((r, i) => (
            <span key={i} className="flex justify-between gap-3"><span className="truncate">{r.label}</span><span className={`tabular-nums ${r.value > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{format(r.value)}</span></span>
          ))}
          {rs.length > 8 && <span className="block text-stone-500">…and {rs.length - 8} more</span>}
          <span className="flex justify-between gap-3 border-t border-noir-700 pt-0.5 font-semibold"><span>{now !== undefined ? 'Now' : 'Total'}</span><span className="tabular-nums text-stone-100">{now !== undefined ? now : format(v)}</span></span>
        </span>
      )}
    </>
  );
  return <RichTip tip={tip} align={align}>{children ?? <span className="tabular-nums">{format(v)}</span>}</RichTip>;
}
