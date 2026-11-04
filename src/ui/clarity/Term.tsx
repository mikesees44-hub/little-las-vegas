import { useState, type ReactNode } from 'react';
import { glossaryEntry, termRuns } from '../../engine/glossary';
import { useClarity } from './context';

/**
 * A GAME TERM with its definition (EASIER_NOT_SHALLOWER #9, the Crusader Kings nested tooltip): hover or
 * tap the word and its glossary line opens; the terms inside that line are themselves terms (one level
 * deeper), and "Glossary ▸" opens the help at that entry. One component for every term on every screen;
 * the words live in engine/glossary.ts (GLOSSARY, TERM_WORDS).
 *
 *   <Term id="respect" />                 the term's own name, underlined
 *   <Term id="heat.local">local heat</Term>
 *   <Glossed text="..." />                running text with every known term linked once
 */

/** Two levels, two group names: a nested term never opens with its parent's hover. */
const LEVEL = [
  { group: 'group/t0', open: 'group-hover/t0:block group-focus-within/t0:block' },
  { group: 'group/t1', open: 'group-hover/t1:block group-focus-within/t1:block' },
] as const;

export function Term({ id, children, depth = 0, plain }: { id: string; children?: ReactNode; depth?: number; /** No underline (a whole line that opens the term). */ plain?: boolean }) {
  const g = glossaryEntry(id);
  const [open, setOpen] = useState(false);
  // Near an edge of the window the card opens toward the middle (it was cut off under the left rail).
  const [side, setSide] = useState<'center' | 'left' | 'right'>('center');
  const place = (el: HTMLElement) => {
    try {
      const r = el.getBoundingClientRect();
      const w = window.innerWidth;
      setSide(r.left < 150 ? 'left' : w - r.right < 150 ? 'right' : 'center');
    } catch { /* centered */ }
  };
  const { openHelp } = useClarity();
  if (!g) return <>{children}</>;
  const L = LEVEL[Math.min(1, depth)];
  const pos = side === 'left' ? 'left-0' : side === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2';
  return (
    <span className={`${L.group} relative inline`} onMouseEnter={(e) => place(e.currentTarget)} onFocus={(e) => place(e.currentTarget)} onMouseLeave={() => setOpen(false)} data-testid="term" data-term={id}>
      <span role="button" tabIndex={0} aria-expanded={open}
        className={`cursor-help ${plain ? '' : 'underline decoration-dotted decoration-gold-500/70 underline-offset-2'}`}
        onClick={(e) => { e.stopPropagation(); place(e.currentTarget.parentElement ?? e.currentTarget); setOpen((o) => !o); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); } }}>
        {children ?? g.term}
      </span>
      {/* The padding is the bridge from the word to the card, so the pointer can move onto a nested term. */}
      <span role="tooltip" className={`absolute ${pos} top-full z-[1300] pt-1 ${open ? 'block' : `hidden ${L.open}`}`} onClick={(e) => e.stopPropagation()}>
        <span className="block w-64 max-w-[80vw] rounded border border-gold-600/50 bg-noir-950 px-2.5 py-2 text-left text-[11px] font-normal normal-case not-italic leading-snug tracking-normal text-stone-300 shadow-lg shadow-black/70">
          <span className="block font-semibold text-gold-300">{g.term}</span>
          {depth < 1 ? <Glossed text={g.short} depth={depth + 1} skip={[id]} /> : g.short}
          <button type="button" className="mt-1 block text-[10px] text-gold-400 hover:text-gold-300" onClick={(e) => { e.stopPropagation(); openHelp(id); }} data-testid="term-glossary">Glossary ▸</button>
        </span>
      </span>
    </span>
  );
}

/** Running text with each known game term linked once (a Term). */
export function Glossed({ text, depth = 0, skip = [] }: { text: string; depth?: number; skip?: readonly string[] }) {
  const runs = termRuns(text, skip);
  return <>{runs.map((r, i) => (r.id ? <Term key={i} id={r.id} depth={depth}>{r.t}</Term> : <span key={i}>{r.t}</span>))}</>;
}
