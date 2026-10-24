import { displayName, shortName } from '../../engine/characters';
import { districtTake } from '../../engine/economy';
import { opinion } from '../../engine/relations';
import { FACTION_NAMES } from '../../engine/world';
import type { FactionId, GameState } from '../../engine/types';
import { fmt$ } from '../format';
import { OpinionBadge } from './CrewList';

const FACTION_COLOR: Record<FactionId, string> = {
  player: 'bg-gold-500', manno: 'bg-blood-500', feldstein: 'bg-indigo-500', kessler: 'bg-emerald-600',
  philly: 'bg-purple-600', law: 'bg-sky-600', none: 'bg-noir-600',
};

export function Overview({ s }: { s: GameState }) {
  return (
    <div className="space-y-5">
      {s.startingProblem && (
        <div className="rounded-md border border-amber-700/50 bg-amber-900/10 px-3 py-2 text-sm text-amber-200">
          <span className="font-semibold">Your situation: </span>{s.startingProblem}
        </div>
      )}
      <section>
        <div className="panel-title">The island</div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {s.districts.map((d) => {
            const capo = d.capoId ? s.characters[d.capoId] : undefined;
            const entries = (Object.entries(d.influence) as [FactionId, number][]).filter(([, v]) => v > 0).sort((a, b) => (b[0] === 'player' ? 1 : 0) - (a[0] === 'player' ? 1 : 0) || b[1] - a[1]);
            return (
              <div key={d.id} className="rounded-md border border-noir-700 bg-noir-800/70 p-2.5">
                <div className="flex justify-between gap-2">
                  <div className="font-semibold text-stone-100">{d.name}</div>
                  <div className="text-xs text-gold-300 tabular-nums">{fmt$(districtTake(s, d.id))}/wk</div>
                </div>
                <div className="text-xs text-stone-500">{capo ? `Capo: ${shortName(capo)}` : 'No capo — the take leaks'}</div>
                <div className="mt-1.5 flex h-2 rounded overflow-hidden" title={entries.map(([f, v]) => `${FACTION_NAMES[f]} ${v}%`).join(', ')}>
                  {entries.map(([f, v]) => (
                    <div key={f} className={FACTION_COLOR[f]} style={{ width: `${v}%` }} />
                  ))}
                </div>
                <div className="mt-1 text-[11px] text-stone-400 flex flex-wrap gap-x-2">
                  {entries.map(([f, v]) => (
                    <span key={f}><span className={`inline-block w-2 h-2 rounded-sm mr-0.5 ${FACTION_COLOR[f]}`} />{FACTION_NAMES[f]} {v}%</span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="panel-title">Rivals</div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {s.rivals.map((r) => {
            const leader = s.characters[r.leaderId];
            return (
              <div key={r.id} className="rounded-md border border-noir-700 bg-noir-800/70 p-2.5">
                <div className="flex justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-stone-100">{r.name}</div>
                    <div className="text-xs text-stone-400 truncate">{displayName(leader)} · {leader.traits.join(', ')}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[10px] uppercase tracking-widest text-stone-500">Of you</div>
                    <OpinionBadge v={opinion(s, r.leaderId, s.playerId)} />
                  </div>
                </div>
                <div className="text-xs text-stone-500 mt-1">
                  Goal: <span className="text-stone-300 capitalize">{r.goal}</span> · muscle {r.muscle} · exposure {r.exposure}
                </div>
                {r.lastMove && <div className="text-xs text-stone-300 mt-1 italic">Wk {r.lastMove.week}: {r.lastMove.text}</div>}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="panel-title">Rackets & fronts</div>
        <ul className="mt-2 divide-y divide-noir-800 text-sm">
          {s.businesses.filter((b) => b.owner === 'player').map((b) => (
            <li key={b.id} className="flex justify-between py-1 gap-2">
              <span className="text-stone-300">{b.name} <span className="text-stone-500 text-xs">· {b.kind} · {s.districts.find((d) => d.id === b.districtId)?.name}</span></span>
              <span className={`text-xs ${b.closedUntil && b.closedUntil > s.week ? 'text-red-400' : 'text-stone-500'}`}>
                {b.closedUntil && b.closedUntil > s.week ? `padlocked to wk ${b.closedUntil}` : `${fmt$(b.weeklyBase)} base`}
              </span>
            </li>
          ))}
        </ul>
        {s.debts.length > 0 && (
          <div className="mt-2 text-xs text-amber-300">
            Debts: {s.debts.map((d) => `${d.lender} ${fmt$(d.weeklyPayment)}/wk × ${d.weeksLeft}`).join('; ')}
          </div>
        )}
      </section>
    </div>
  );
}
