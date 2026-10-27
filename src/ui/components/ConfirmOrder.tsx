import { useEffect } from 'react';
import { previewAction } from '../../engine/actions';
import type { GameState, PlayerAction } from '../../engine/types';
import { actionFacts } from '../actionFacts';
import { counsel, type Voice } from '../../engine/counsel';

const VERDICT_COLOR: Record<string, string> = { do: 'text-emerald-300', doBut: 'text-amber-200', wait: 'text-amber-300', dont: 'text-red-300' };

/** Underboss and consigliere first, then whoever else sits at the table on this (at most three). */
function pickVoices(vs: Voice[]): Voice[] {
  const order = (v: Voice) => (v.adviser.role === 'underboss' ? 0 : v.adviser.role === 'consigliere' ? 1 : 2);
  return [...vs].sort((a, b) => order(a) - order(b)).slice(0, 3);
}

/**
 * "Are you sure?" before an order is given: what it is, who does it, what it costs
 * and from which pot, when it happens, and what is known to follow. Yes gives the order.
 */
export function ConfirmOrder({ s, action, onYes, onNo, onNeverAsk }: { s: GameState; action: PlayerAction; onYes: () => void; onNo: () => void; onNeverAsk: () => void }) {
  const p = previewAction(s, action);
  const f = actionFacts(s, action, p);
  let voices: Voice[] = [];
  try { voices = pickVoices(counsel(s, { kind: 'action', action })?.voices ?? []); } catch { voices = []; }
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onNo(); }
      if (e.key === 'Enter') { e.preventDefault(); onYes(); }
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [onYes, onNo]);
  return (
    <div className="fixed inset-0 z-[5000] flex items-end sm:items-center justify-center bg-black/60 p-3" role="dialog" aria-modal="true" aria-label="Are you sure?" data-testid="confirm-order">
      <div className="w-[min(94vw,520px)] max-h-[90vh] overflow-y-auto rounded-lg border border-gold-500 bg-noir-900 shadow-2xl p-4">
        <div className="text-[11px] uppercase tracking-widest text-gold-400">Are you sure?</div>
        <div className="mt-1 text-base font-semibold text-stone-100">{f.button}</div>
        {p.detail && <div className="mt-1 text-xs text-stone-400">{p.detail}</div>}
        <dl className="mt-3 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-stone-500">Who</dt><dd className="text-stone-200">{f.actor}{f.target ? ` → ${f.target}` : ''}</dd>
          <dt className="text-stone-500">Cost</dt><dd className="text-stone-200">{f.cost}</dd>
          <dt className="text-stone-500">When</dt><dd className="text-stone-200">{f.timing}</dd>
        </dl>
        {f.consequences.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-stone-300 space-y-0.5">{f.consequences.slice(0, 5).map((c, i) => <li key={i}>{c}</li>)}</ul>}
        {f.unavailable && <div className="mt-2 text-xs text-red-300">{f.unavailable}</div>}
        {voices.length > 0 && (
          <div className="mt-3 space-y-2" data-testid="confirm-voices">
            <div className="text-[10px] uppercase tracking-widest text-stone-500">Your people weigh in</div>
            {voices.map((v) => (
              <div key={v.adviser.charId} className="rounded-md border border-noir-700 bg-noir-800/60 p-2">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="text-stone-200 font-semibold">{v.adviser.name} <span className="font-normal text-stone-500">· {v.adviser.title}</span></span>
                  <span className={`shrink-0 ${VERDICT_COLOR[v.verdict] ?? 'text-stone-300'}`}>{v.label}</span>
                </div>
                <div className="mt-1 text-xs italic text-stone-300">“{v.says}”</div>
                {(v.pros[0] || v.cons[0]) && (
                  <ul className="mt-1 text-[11px] space-y-0.5">
                    {v.pros.slice(0, 2).map((x, i) => <li key={`p${i}`} className="text-emerald-200/90">+ {x.text}</li>)}
                    {v.cons.slice(0, 2).map((x, i) => <li key={`c${i}`} className="text-red-200/90">− {x.text}</li>)}
                  </ul>
                )}
                {v.bias && <div className="mt-1 text-[10px] text-amber-300">{v.bias}</div>}
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2 justify-end">
          <button className="btn-ghost text-sm px-3 py-1.5" onClick={onNo} data-testid="confirm-no">No, hold off</button>
          <button className="btn-gold text-sm px-4 py-1.5" onClick={onYes} autoFocus data-testid="confirm-yes">OK, do it</button>
        </div>
        <button className="mt-2 text-[11px] text-stone-500 underline" onClick={onNeverAsk}>Don't ask me again (change in Settings)</button>
      </div>
    </div>
  );
}
