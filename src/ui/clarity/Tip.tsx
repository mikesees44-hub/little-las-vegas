import { useState, type ReactNode } from 'react';
import { glossaryEntry } from '../../engine/glossary';

/**
 * A hover (and tap) tooltip in the house style. Give it `text`, or a
 * glossary `term` id ("heat.local", "respect", "table" ...). The native
 * `title` is kept as a fallback for screen readers and old browsers.
 */
export function Tip({ text, term, children, side = 'bottom', className }: { text?: string; term?: string; children: ReactNode; side?: 'bottom' | 'top'; className?: string }) {
  const [open, setOpen] = useState(false);
  const g = term ? glossaryEntry(term) : undefined;
  const body = text ?? g?.short;
  if (!body) return <>{children}</>;
  return (
    <span
      className={`group/tip relative inline-flex ${className ?? ''}`}
      onMouseLeave={() => setOpen(false)}
      onClick={() => setOpen((o) => !o)}
      title={body}
      data-testid="tip"
    >
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 z-[60] w-56 max-w-[78vw] -translate-x-1/2 rounded border border-gold-600/50 bg-noir-950/95 px-2 py-1.5 text-left text-[11px] font-normal normal-case leading-snug tracking-normal text-stone-300 shadow-lg shadow-black/60 ${side === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'} ${open ? 'visible' : 'invisible group-hover/tip:visible group-focus-within/tip:visible'}`}
      >
        {g && <span className="block font-semibold text-gold-300">{g.term}</span>}
        {body}
      </span>
    </span>
  );
}
