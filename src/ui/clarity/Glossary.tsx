import { useState } from 'react';
import { GLOSSARY, type GlossarySection } from '../../engine/glossary';
import { Modal } from '../components/Modal';

const SECTIONS: GlossarySection[] = ['Pressure', 'Standing', 'Money', 'People', 'The Table', 'Plans', 'The House'];

/** The help overlay: every term in plain words, searchable. */
export function GlossaryOverlay({ focus, onClose }: { focus?: string; onClose: () => void }) {
  const [q, setQ] = useState('');
  const hit = (t: string) => t.toLowerCase().includes(q.trim().toLowerCase());
  return (
    <Modal onClose={onClose} wide>
      <div className="p-4 sm:p-5" data-testid="glossary">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">How it works</div>
            <h2 className="font-display text-2xl text-gold-400">The rules of the island</h2>
          </div>
          <button className="btn-ghost text-xs" onClick={onClose}>Close</button>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: heat, kick-up, the Table…" className="mt-2 w-full rounded border border-noir-600 bg-noir-800 px-2 py-1.5 text-sm text-stone-200" aria-label="Search the glossary" />
        <div className="mt-3 space-y-4">
          {SECTIONS.map((sec) => {
            const items = GLOSSARY.filter((g) => g.section === sec && (!q || hit(g.term) || hit(g.short) || hit(g.long ?? '')));
            if (!items.length) return null;
            return (
              <section key={sec}>
                <div className="panel-title text-base">{sec}</div>
                <dl className="mt-1 grid gap-2 sm:grid-cols-2">
                  {items.map((g) => (
                    <div key={g.id} className={`rounded border p-2 ${g.id === focus ? 'border-gold-400 bg-gold-500/10' : 'border-noir-700 bg-noir-800/50'}`}>
                      <dt className="text-sm font-semibold text-gold-300">{g.term}</dt>
                      <dd className="text-[12px] leading-snug text-stone-300">{g.short}</dd>
                      {g.long && <dd className="mt-1 text-[11px] leading-snug text-stone-500">{g.long}</dd>}
                    </div>
                  ))}
                </dl>
              </section>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

/** The "?" button. */
export function HelpButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-gold-500 font-display text-sm font-bold text-gold-300 hover:bg-gold-500/15" aria-label="How it works" title="How it works: heat, respect, the Table, schemes…" data-testid="help-button">?</button>
  );
}
