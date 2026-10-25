import { useState } from 'react';
import { normSplit, type Split } from '../../engine/tributeState';
import { fmt$ } from '../format';

/** The dollars each destination gets for a split, exactly as the engine will move them. */
export function splitDollars(env: number, sp: Split): { personal: number; treasury: number; reserve: number } {
  const personal = Math.floor((env * sp.personal) / 10000);
  const reserve = Math.floor((env * sp.reserve) / 10000);
  return { personal, reserve, treasury: env - personal - reserve };
}

const ROWS: { k: keyof Split; label: string; hint: string; tone: string }[] = [
  { k: 'personal', label: 'Your own', hint: 'Houses, cars, gifts, the household, the Good Life', tone: 'accent-amber-400' },
  { k: 'treasury', label: 'Family treasury', hint: 'Payroll, operations, investments, help for the men', tone: 'accent-gold-400' },
  { k: 'reserve', label: 'Reserve', hint: 'Bills, lawyers, promises, the bad week (covers the treasury when it runs dry)', tone: 'accent-emerald-500' },
];

/**
 * Split the envelope by percentage (sliders) or by dollars. The family
 * treasury takes whatever the other two leave, so the split always totals
 * 100% and every dollar of the envelope; dollar entries that would overdraw
 * it are refused.
 */
export function EnvelopeSplit({ env, value, onChange, disabled }: { env: number; value: Split; onChange: (s: Split) => void; disabled?: boolean }) {
  const [mode, setMode] = useState<'pct' | 'usd'>('pct');
  const d = splitDollars(env, value);
  const setBp = (k: keyof Split, bp: number) => {
    if (k === 'treasury') {
      // Moving the treasury slider takes from (or gives to) your own share first, then the reserve.
      const rest = 10000 - bp;
      const reserve = Math.min(value.reserve, rest);
      onChange(normSplit({ personal: rest - reserve, reserve }));
    } else {
      const other = k === 'personal' ? value.reserve : value.personal;
      const v = Math.min(bp, 10000 - other);
      onChange(normSplit(k === 'personal' ? { personal: v, reserve: other } : { personal: other, reserve: v }));
    }
  };
  const setUsd = (k: keyof Split, usd: number) => {
    if (!(env > 0)) return;
    const bp = Math.round((Math.max(0, Math.min(env, usd)) / env) * 10000);
    setBp(k, bp);
  };
  return (
    <div className="space-y-2" data-testid="envelope-split">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Split the envelope · {fmt$(env)}</div>
        <div className="flex rounded border border-noir-600 text-[11px]">
          <button type="button" className={`px-2 py-0.5 ${mode === 'pct' ? 'bg-gold-500/20 text-gold-300' : 'text-stone-400'}`} onClick={() => setMode('pct')}>%</button>
          <button type="button" className={`px-2 py-0.5 ${mode === 'usd' ? 'bg-gold-500/20 text-gold-300' : 'text-stone-400'}`} onClick={() => setMode('usd')} data-testid="split-usd">$</button>
        </div>
      </div>
      {ROWS.map((r) => (
        <div key={r.k} className="rounded border border-noir-700 bg-noir-900/60 px-2 py-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm text-stone-200">{r.label}</span>
            <span className="tabular-nums text-sm"><span className="text-gold-300 font-semibold">{fmt$(d[r.k])}</span> <span className="text-stone-500">· {Math.round(value[r.k] / 100)}%</span></span>
          </div>
          {mode === 'pct' ? (
            <input type="range" min={0} max={100} step={1} value={Math.round(value[r.k] / 100)} disabled={disabled}
              aria-label={`${r.label} percent`} data-testid={`split-${r.k}`}
              onChange={(e) => setBp(r.k, Number(e.target.value) * 100)} className={`w-full ${r.tone}`} />
          ) : (
            <input type="number" min={0} max={env} step={10} value={d[r.k]} disabled={disabled}
              aria-label={`${r.label} dollars`} data-testid={`split-usd-${r.k}`}
              onChange={(e) => setUsd(r.k, Number(e.target.value))} className="mt-1 w-full rounded border border-noir-600 bg-noir-950 px-2 py-0.5 text-sm tabular-nums text-stone-100" />
          )}
          <div className="text-[10px] text-stone-500">{r.hint}</div>
        </div>
      ))}
      <div className={`text-[11px] tabular-nums ${d.personal + d.treasury + d.reserve === env ? 'text-emerald-400' : 'text-red-400'}`} data-testid="split-total">
        {fmt$(d.personal)} + {fmt$(d.treasury)} + {fmt$(d.reserve)} = {fmt$(d.personal + d.treasury + d.reserve)} of {fmt$(env)} {d.personal + d.treasury + d.reserve === env ? '✓ every dollar accounted for' : '✗ does not reconcile'}
      </div>
    </div>
  );
}
