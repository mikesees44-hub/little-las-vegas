import { useEffect, useState } from 'react';
import { Overlay } from '../components/Modal';
import type { NowResult } from '../../engine/deeds/now';
import { useEscape } from '../keys';
import { ResultCard } from '../decide/ResultCard';

/**
 * The result card: an interaction settled in the moment (deeds/now.ts) shows
 * at once, over whatever screen is open: the roll against the odds, what
 * happened, what changed, and what it may lead to. A tiny store: the button
 * posts, the host shows.
 */
type Listener = (r: NowResult | undefined) => void;
let last: NowResult | undefined;
const subs = new Set<Listener>();

export function postNow(r: NowResult): void {
  last = r;
  for (const f of subs) f(r);
}

/** The result card (ui/decide/ResultCard.tsx: one result pattern). */
export const NowResultCard = ResultCard;

export function NowResultHost() {
  const [r, setR] = useState(last);
  useEffect(() => { const f: Listener = (x) => setR(x); subs.add(f); return () => { subs.delete(f); }; }, []);
  useEscape(!!r, () => setR(undefined));
  if (!r) return null;
  return (
    <Overlay z={1200} className="flex items-center justify-center bg-black/60 p-3" onClick={() => setR(undefined)} data-testid="now-host">
      <ResultCard r={r} onClose={() => setR(undefined)} onFile={() => { setR(undefined); window.dispatchEvent(new Event('llv-open-file')); }} />
    </Overlay>
  );
}

/**
 * The week's result cards (deeds/weekResults.ts: a dirty job, a push), one after another, after the week's
 * scenes and before "How they took it". Escape or "Go on" shows the next one.
 */
export function ResultQueue({ items, onNext, onAll, blocked }: { items: readonly NowResult[]; onNext: () => void; onAll: () => void; blocked?: boolean }) {
  useEscape(items.length > 0 && !blocked, onNext);
  if (!items.length || blocked) return null;
  return (
    <Overlay z={1200} className="flex items-center justify-center bg-black/60 p-3" onClick={onNext} data-testid="week-results">
      <div className="flex flex-col items-center gap-1">
        <ResultCard r={items[0]} onClose={onNext} onFile={() => { onAll(); window.dispatchEvent(new Event('llv-open-file')); }} />
        {items.length > 1 && <div className="text-[11px] text-stone-400" data-testid="week-results-count">{items.length - 1} more from this week</div>}
      </div>
    </Overlay>
  );
}
