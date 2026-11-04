import { useState } from 'react';
import type { MotionChip } from './inMotion';
import { domainOf, domClass } from '../domain';

/** A chip's domain: the place it opens (its route), else the key's own prefix. */
function chipDomain(c: MotionChip) {
  const r = c.route;
  return (r?.panel && r.section ? domainOf(`${r.panel}.${r.section}`) : undefined) ?? domainOf(r?.key) ?? domainOf(r?.home) ?? domainOf(c.key.split(':')[0]);
}

const TONE = {
  good: 'border-emerald-700/70 text-emerald-200',
  warn: 'border-amber-600/70 text-amber-200',
  bad: 'border-blood-400/80 text-red-200 bg-blood-500/10',
  neutral: 'border-noir-600 text-stone-300',
};

/** The bottom strip: everything under way, one chip each, soonest first. */
export function InMotionStrip({ chips, onChip, inDesk }: { chips: MotionChip[]; onChip: (c: MotionChip) => void; /** On the Desk: chips wrap, no scroll bar (the bottom strip folded into the Desk). */ inDesk?: boolean }) {
  const [all, setAll] = useState(false);
  const shown = all ? chips : chips.slice(0, 8);
  return (
    <div className={inDesk ? 'flex flex-wrap items-center gap-1.5' : 'flex items-center gap-1.5 overflow-x-auto whitespace-nowrap px-2 py-1 tabbar'} data-testid="in-motion">
      <span className="shrink-0 text-[10px] uppercase tracking-[0.25em] text-stone-500">In motion</span>
      {chips.length === 0 && <span className="text-[11px] text-stone-500">Nothing under way. Plan something: the Desk › Jobs › Plan a job, or any man's sheet.</span>}
      {shown.map((c) => (
        <button key={c.key} type="button" onClick={() => onChip(c)} data-testid="motion-chip"
          className={`relative shrink-0 rounded border px-2 py-0.5 text-[11px] hover:border-gold-500 ${TONE[c.tone]} ${chipDomain(c) ? `${domClass(chipDomain(c))} llv-dom-edge` : ''}`} data-domain={chipDomain(c)}>
          <span className={`mr-1 ${chipDomain(c) ? 'llv-dom-ink' : ''}`} style={{ fontVariantEmoji: 'text' } as never}>{c.glyph}&#xFE0E;</span>{c.text}{c.eta !== undefined && c.eta > 0 && !c.noEta && !/ wk|in \d/.test(c.text) ? <span className="text-stone-500"> · ~{c.eta} wk</span> : null} ▸
          {c.progress !== undefined && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-gold-500/70" style={{ width: `${c.progress}%` }} />}
        </button>
      ))}
      {chips.length > 8 && <button type="button" className="shrink-0 text-[11px] text-gold-300" onClick={() => setAll((a) => !a)}>{all ? 'less' : `+${chips.length - 8}`}</button>}
    </div>
  );
}
