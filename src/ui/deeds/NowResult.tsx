import { useEffect, useState } from 'react';
import type { NowResult } from '../../engine/deeds/now';
import { useEscape } from '../keys';

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

const TONE: Record<string, string> = { crit: 'text-emerald-300', success: 'text-emerald-400', fail: 'text-amber-300', critFail: 'text-red-400' };
const BORDER: Record<string, string> = { crit: 'border-emerald-500/70', success: 'border-emerald-600/60', fail: 'border-amber-600/60', critFail: 'border-red-600/70' };

export function NowResultCard({ r, onClose }: { r: NowResult; onClose: () => void }) {
  const pct = r.chance !== undefined ? Math.round(r.chance * 100) : undefined;
  return (
    <div className={`panel w-full max-w-md border-2 ${BORDER[r.tier] ?? 'border-gold-600/60'} p-4 shadow-2xl shadow-black/80`} role="dialog" aria-label={r.title} data-testid="now-result" onClick={(e) => e.stopPropagation()}>
      <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">{r.title}{r.who ? ` · ${r.who}` : ''}</div>
      <div className={`mt-1 font-display text-2xl ${TONE[r.tier] ?? 'text-gold-300'}`} data-testid="now-headline">{r.headline}</div>
      {pct !== undefined && r.roll !== undefined && (
        <div className="mt-2" title={`The roll: ${r.roll} against ${pct}`}>
          <div className="relative h-2.5 overflow-hidden rounded bg-red-900/50">
            <div className="h-full bg-emerald-600/70" style={{ width: `${pct}%` }} />
            <div className="absolute top-[-2px] h-[14px] w-[3px] bg-stone-100" style={{ left: `calc(${Math.min(99, r.roll)}% - 1px)` }} />
          </div>
          <div className="mt-0.5 flex justify-between text-[10px] text-stone-500"><span>rolled {r.roll}</span><span>needed under {pct}</span></div>
        </div>
      )}
      {r.line && <p className="mt-2 text-sm text-stone-200">{r.line}</p>}
      {r.changes.length > 0 && (
        <div className="mt-2">
          <div className="text-[10px] uppercase tracking-wider text-stone-500">What changed</div>
          <ul className="text-xs text-stone-300">{r.changes.map((c, i) => <li key={i}>· {c}</li>)}</ul>
        </div>
      )}
      {r.leadsTo.length > 0 && (
        <div className="mt-2">
          <div className="text-[10px] uppercase tracking-wider text-stone-500">What it may lead to</div>
          <ul className="text-xs text-amber-200/90">{r.leadsTo.map((c, i) => <li key={i}>· {c}</li>)}</ul>
        </div>
      )}
      <button type="button" className="btn-gold mt-3 w-full text-sm" onClick={onClose} data-testid="now-close">Go on</button>
    </div>
  );
}

export function NowResultHost() {
  const [r, setR] = useState(last);
  useEffect(() => { const f: Listener = (x) => setR(x); subs.add(f); return () => { subs.delete(f); }; }, []);
  useEscape(!!r, () => setR(undefined));
  if (!r) return null;
  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/60 p-3" onClick={() => setR(undefined)} data-testid="now-host">
      <NowResultCard r={r} onClose={() => setR(undefined)} />
    </div>
  );
}
