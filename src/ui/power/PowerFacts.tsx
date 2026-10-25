import { useMemo, useState } from 'react';
import { ATTR_GROUPS, ATTR_LABEL, GROUP_IDS, viewAttrs } from '../../engine/attrs';
import { cloneState } from '../../engine/engine';
import { STAGE_NAMES, grievancesOf } from '../../engine/grievances';
import { ambitionOf, capability, challengePressure, successionCandidates, WANT_TEXT } from '../../engine/heir';
import type { Character, GameState } from '../../engine/types';
import { ScoreBox } from './PowerTab';

/** Character sheet: the six attribute groups (collapsible), his record, and — for candidates — the heir paradox. */
export function PowerFacts({ s, c }: { s: GameState; c: Character }) {
  const v = useMemo(() => cloneState(s), [s]);
  const cc = v.characters[c.id] ?? c;
  const x = viewAttrs(v, cc);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const cand = c.alive && successionCandidates(v).some((k) => k.id === c.id);
  const gs = grievancesOf(s, c.id).filter((g) => g.status === 'open');
  const amb = cand ? ambitionOf(v, cc) : undefined;
  return (
    <section className="mt-3" data-testid="attrs">
      <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Attributes</div>
      <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
        {GROUP_IDS.map((g) => {
          const keys = ATTR_GROUPS[g].keys;
          const avg = Math.round(keys.reduce((a, k) => a + x.v[k], 0) / keys.length);
          const isOpen = !!open[g];
          return (
            <div key={g} className="rounded border border-noir-700 bg-noir-800/60">
              <button type="button" className="w-full flex justify-between items-center px-2 py-1 text-xs" aria-expanded={isOpen} data-testid={`attr-group-${g}`} onClick={() => setOpen((o) => ({ ...o, [g]: !o[g] }))}>
                <span className="text-stone-300">{isOpen ? '▾' : '▸'} {ATTR_GROUPS[g].name}</span>
                <span className="tabular-nums text-stone-100 font-semibold">{avg}</span>
              </button>
              {isOpen && (
                <ul className="px-2 pb-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
                  {keys.map((k) => (
                    <li key={k} className="flex justify-between gap-1"><span className="text-stone-400 truncate">{ATTR_LABEL[k]}</span><span className={`tabular-nums ${x.v[k] >= 70 ? 'text-emerald-300' : x.v[k] <= 30 ? 'text-red-300' : 'text-stone-200'}`}>{x.v[k]}</span></li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      {(x.followers ?? 0) > 0 && <div className="mt-1 text-[11px] text-amber-300">{x.followers} men would follow him.</div>}
      {cand && (
        <div className="mt-2 grid gap-3 sm:grid-cols-2 rounded border border-noir-700 bg-noir-800/50 p-2">
          <ScoreBox title="Leadership capability" sc={capability(v, cc)} tone="bg-emerald-600" />
          <ScoreBox title="Challenge pressure" sc={challengePressure(v, cc)} tone="bg-blood-400" />
          <div className="sm:col-span-2 text-[11px] text-stone-400">{amb?.revealed ? <>Hidden ambition: {c.gender === 'F' ? 'she' : 'he'} {WANT_TEXT[amb.want]} (drive {amb.intensity}). {amb.log.slice(-2).map((l) => l.text).join(' ')}</> : 'Hidden ambition: unknown. The consigliere, or a little money, could find out.'}</div>
        </div>
      )}
      {gs.length > 0 && (
        <ul className="mt-2 text-[11px] text-stone-300 space-y-0.5">
          {gs.map((g) => <li key={g.id}><span className="text-red-300">Passed over</span> for {g.postLabel} (week {g.week}): {STAGE_NAMES[g.stage].toLowerCase()}, severity {g.severity}</li>)}
        </ul>
      )}
      {(c.success?.length ?? 0) > 0 && (
        <div className="mt-2">
          <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Record</div>
          <ul className="text-[11px] text-stone-300">{c.success!.slice(-6).reverse().map((e, i) => <li key={i}>· {e.text}</li>)}</ul>
        </div>
      )}
    </section>
  );
}
