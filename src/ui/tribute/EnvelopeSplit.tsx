import { useState } from 'react';
import { normSplit, type Split } from '../../engine/tributeState';
import { fmt$ } from '../format';

/** The dollars each destination gets for a split, exactly as the engine will move them. */
export function splitDollars(env: number, sp: Split): { personal: number; treasury: number; reserve: number } {
  const personal = Math.floor((env * sp.personal) / 10000);
  const reserve = Math.floor((env * sp.reserve) / 10000);
  return { personal, reserve, treasury: env - personal - reserve };
}

/**
 * Two pots (money.ts): the envelope's split is ONE control, your cut. The
 * Family takes the rest, so it always totals 100% and every dollar. An
 * optional set-aside (lawyers & emergencies) stays inside the Family.
 */
export function EnvelopeSplit({ env, value, onChange, disabled }: { env: number; value: Split; onChange: (s: Split) => void; disabled?: boolean }) {
  const [aside, setAside] = useState(value.reserve > 0);
  const d = splitDollars(env, value);
  const set = (personalPct: number, reservePct: number) => onChange(normSplit({ personal: personalPct * 100, reserve: Math.min(reservePct * 100, 10000 - personalPct * 100) }));
  const total = d.personal + d.treasury + d.reserve;
  return (
    <div className="space-y-2" data-testid="envelope-split">
      <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">The envelope · {fmt$(env)}</div>
      <div className="rounded border border-amber-600/40 bg-noir-900/60 px-2 py-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm text-stone-200">Your cut → your Pocket</span>
          <span className="tabular-nums text-sm"><span className="text-amber-200 font-semibold">{fmt$(d.personal)}</span> <span className="text-stone-500">· {Math.round(value.personal / 100)}%</span></span>
        </div>
        <input type="range" min={0} max={60} step={5} value={Math.round(value.personal / 100)} disabled={disabled} aria-label="Your cut percent" data-testid="split-personal"
          onChange={(e) => set(Number(e.target.value), Math.round(value.reserve / 100))} className="w-full accent-amber-400" />
        <div className="text-[10px] text-stone-500">The Good Life, gifts, your household, your own lawyers.</div>
      </div>
      <div className="rounded border border-noir-700 bg-noir-900/60 px-2 py-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm text-stone-200">The Family</span>
          <span className="tabular-nums text-sm text-gold-300 font-semibold">{fmt$(d.treasury + d.reserve)}</span>
        </div>
        <div className="text-[10px] text-stone-500">Everything operational: wages, Philadelphia, the places, help for the men.</div>
        {aside ? (
          <div className="mt-1">
            <div className="flex justify-between text-[11px] text-stone-400"><span>of which set aside for lawyers & emergencies</span><span className="tabular-nums">{fmt$(d.reserve)} · {Math.round(value.reserve / 100)}%</span></div>
            <input type="range" min={0} max={20} step={5} value={Math.round(value.reserve / 100)} disabled={disabled} aria-label="Set aside percent" data-testid="split-reserve"
              onChange={(e) => set(Math.round(value.personal / 100), Number(e.target.value))} className="w-full accent-emerald-500" />
          </div>
        ) : <button type="button" className="mt-0.5 text-[11px] text-stone-400 hover:text-gold-300" onClick={() => setAside(true)} disabled={disabled}>+ set some aside</button>}
      </div>
      <div className={`text-[11px] tabular-nums ${total === env ? 'text-emerald-400' : 'text-red-400'}`} data-testid="split-total">
        {fmt$(d.personal)} + {fmt$(d.treasury + d.reserve)} = {fmt$(total)} of {fmt$(env)} {total === env ? '✓ every dollar accounted for' : '✗ does not reconcile'}
      </div>
    </div>
  );
}
