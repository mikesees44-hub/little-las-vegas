import { FLAG_LABEL, lifeOf, purseFlags, purseOf } from '../../engine/crewPurse';
import { UB_GOAL_LABEL, ubProfile } from '../../engine/underboss';
import type { Character, GameState } from '../../engine/types';
import { fmt$ } from '../format';
import { CharLink } from '../components/People';
import { Sparkline } from './EarningsBoard';

/** A man's money on his sheet: his weeks in the take, his own money, what he spends it on (from the purse records). */
export function PurseSection({ s, c }: { s: GameState; c: Character }) {
  const rows = purseOf(s, c.id);
  const life = lifeOf(s, c.id);
  if (c.id === s.playerId || (!rows.length && !life)) return null;
  const last = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  const flags = purseFlags(s, c);
  const isUb = s.tribute?.ub.id === c.id;
  const p = isUb ? ubProfile(s, c) : undefined;
  return (
    <section className="mt-3 rounded-md border border-noir-700 bg-noir-800/50 p-2.5" data-testid="his-money">
      <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">His money</div>
      <div className="mt-1 grid gap-2 sm:grid-cols-2 text-xs text-stone-300">
        <div className="space-y-0.5">
          {last && <div className="tabular-nums">Week {last.w}: earned {fmt$(last.earned)} · kicked up <span className="text-gold-300">{fmt$(last.up)}</span>{last.short ? <span className="text-red-300"> (short {fmt$(last.short)})</span> : ''} · kept {fmt$(last.kept)}{prev ? <span className={last.up >= prev.up ? 'text-emerald-400' : 'text-red-300'}> ({last.up >= prev.up ? '+' : '−'}{fmt$(Math.abs(last.up - prev.up))} vs last week)</span> : ''}</div>}
          <div className="flex items-center gap-2">Kicked up, 8 weeks: <Sparkline values={rows.map((r) => r.up)} w={90} h={20} /></div>
          <div>Own money: <span className="text-stone-100 tabular-nums">{fmt$(c.wealth)}</span>{life?.debt ? <span className="text-amber-300"> · owes {fmt$(life.debt)} outside the family</span> : ''}</div>
          {flags.length > 0 && <div>{flags.map((f) => <span key={f} className="mr-1 rounded border border-noir-600 px-1 text-[10px] text-stone-300">{FLAG_LABEL[f]}</span>)}</div>}
        </div>
        <div className="space-y-0.5">
          {life && <div className="tabular-nums">Since the take began: earned {fmt$(life.earned)}, kicked up {fmt$(life.up)}, kept {fmt$(life.kept)}, spent {fmt$(life.spent)}</div>}
          {life && (life.car || life.house || life.last) && <div className="text-stone-400">{[life.house ? `a house (wk ${life.house})` : '', life.car ? `a new car (wk ${life.car})` : '', life.last ? `lately: ${life.last}` : ''].filter(Boolean).join(' · ')}</div>}
          {last && <div className="text-stone-500">This week he spent {fmt$(last.spent)} (the house{life?.debt ? ', his debts' : ''}{c.traits.includes('Gambler') ? ', the track' : ''}).</div>}
        </div>
      </div>
      {p && (
        <div className="mt-2 border-t border-noir-700 pt-1.5 text-xs text-stone-300" data-testid="ub-profile">
          <div className="text-[10px] uppercase tracking-widest text-stone-500">The underboss</div>
          <div className="tabular-nums">Financial skill {p.financialSkill} · judgment {p.judgment} · honesty {p.honesty} · ambition {p.ambition} · his regard for you {p.loyalty} · standing with the earners {p.reputation}/100 · {Math.round(p.tenure / 52 * 10) / 10} years with the envelope</div>
          <div>What he wants: <span className="text-stone-100">{UB_GOAL_LABEL[p.goal]}</span></div>
          {p.helped.some(([, h]) => h.n > h.unknownToDon) && <div className="text-stone-400">Favors he did that you know of: {p.helped.filter(([, h]) => h.n > h.unknownToDon).slice(0, 6).map(([id, h], i) => <span key={id}>{i ? ', ' : ''}<CharLink s={s} id={id} /> ({h.n - h.unknownToDon}×)</span>)}</div>}
          {p.callsFirst.length > 0 && <div className="text-amber-200">Capos who call him first: {p.callsFirst.map((id, i) => <span key={id}>{i ? ', ' : ''}<CharLink s={s} id={id} /></span>)}</div>}
        </div>
      )}
    </section>
  );
}
