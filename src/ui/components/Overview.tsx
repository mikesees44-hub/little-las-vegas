import { displayName } from '../../engine/characters';
import { opinion } from '../../engine/relations';
import type { GameState } from '../../engine/types';
import { fmt$ } from '../format';
import { OpinionBadge } from './CrewList';
import { CharLink, Face } from './People';

/** The map's side panel when no district is selected: your situation and the people across the board. */
export function Overview({ s }: { s: GameState }) {
  return (
    <div className="space-y-4">
      {s.startingProblem && (
        <div className="rounded-md border border-amber-700/50 bg-amber-900/10 px-3 py-2 text-sm text-amber-200">
          <span className="font-semibold">Your situation: </span>{s.startingProblem}
        </div>
      )}
      <p className="text-xs text-stone-500">Click a district on the map to see who holds it. Click any face or name to open their sheet and deal with them.</p>
      <section>
        <div className="panel-title text-base">Across the board</div>
        <ul className="mt-2 space-y-2">
          {s.rivals.map((r) => {
            const leader = s.characters[r.leaderId];
            if (!leader) return null;
            return (
              <li key={r.id} className="flex gap-2 items-start">
                <Face s={s} c={leader} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-2">
                    <div className="text-sm font-semibold text-stone-100 truncate">{r.name}</div>
                    <OpinionBadge v={opinion(s, r.leaderId, s.playerId)} />
                  </div>
                  <div className="text-xs text-stone-400 truncate"><CharLink s={s} id={leader.id}>{displayName(leader)}</CharLink></div>
                  <div className="text-[11px] text-stone-500">Wants to <span className="text-stone-300">{r.goal}</span> · muscle {r.muscle}{r.kind === 'mob' ? ` · ${fmt$(r.money)}` : ''}</div>
                  {r.lastMove && <div className="text-[11px] text-stone-400 italic">Wk {r.lastMove.week}: {r.lastMove.text}</div>}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
      <section>
        <div className="panel-title text-base">Money</div>
        <p className="text-sm text-stone-400 mt-1">
          {s.businesses.filter((b) => b.owner === 'player').length} businesses · unwashed cash {fmt$(s.unwashed)} · {s.favors} political favor{s.favors === 1 ? '' : 's'}
          {s.loans.length ? ` · ${s.loans.length} loans on the street` : ''}
        </p>
        {s.debts.length > 0 && <div className="mt-1 text-xs text-amber-300">Debts: {s.debts.map((d) => `${d.lender} ${fmt$(d.weeklyPayment)}/wk × ${d.weeksLeft}`).join('; ')}</div>}
      </section>
    </div>
  );
}
