import { useEffect, useState } from 'react';
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
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/60 p-3" onClick={() => setR(undefined)} data-testid="now-host">
      <ResultCard r={r} onClose={() => setR(undefined)} onFile={() => { setR(undefined); window.dispatchEvent(new Event('llv-open-file')); }} />
    </div>
  );
}
