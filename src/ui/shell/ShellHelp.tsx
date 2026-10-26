import { HOMES, OLD_KEYS, HOMES_BY_ID } from './nav';

const kbd = 'inline-flex min-w-[22px] justify-center rounded border border-noir-600 bg-noir-800 px-1 text-[11px] font-semibold text-stone-200';

/** The keyboard, in one short list (the "?" key, the Help button, You › Help & keys). */
export function KeysList() {
  const old = Object.entries(OLD_KEYS);
  return (
    <div className="space-y-1.5 text-xs text-stone-300" data-testid="keys-list">
      <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Keyboard</div>
      <ul className="grid gap-1 sm:grid-cols-2">
        {HOMES.map((h, i) => (
          <li key={h.id} className="flex items-center gap-2"><span className={kbd}>{h.key.toUpperCase()}</span><span className={kbd}>F{i + 1}</span><span>{h.label}</span></li>
        ))}
        <li className="flex items-center gap-2"><span className={kbd}>Space</span><span>Pause / play the clock</span></li>
        <li className="flex items-center gap-2"><span className={kbd}>Esc</span><span>Close what is open</span></li>
        <li className="flex items-center gap-2"><span className={kbd}>?</span><span>This list</span></li>
        <li className="flex items-center gap-2"><span className="text-stone-500">Right-click a face:</span><span>everything you can do to him</span></li>
      </ul>
      <p className="text-[11px] text-stone-500">The old letters still work: {old.map(([k, h], i) => <span key={k}>{i ? ', ' : ''}<span className={kbd}>{k.toUpperCase()}</span> {HOMES_BY_ID[h].short}</span>)}.</p>
    </div>
  );
}

/** Help: what to do, the glossary, the keys. */
export function HelpBody({ onAdvice, onGlossary }: { onAdvice: () => void; onGlossary: () => void }) {
  return (
    <div className="space-y-3" data-testid="help-body">
      <div className="grid gap-1.5 sm:grid-cols-2">
        <button className="btn-ghost w-full border-gold-600 text-gold-300" data-testid="wsid-button" onClick={onAdvice}>What should I do?</button>
        <button className="btn-ghost w-full" onClick={onGlossary}>The glossary: every term in the game</button>
      </div>
      <KeysList />
    </div>
  );
}
