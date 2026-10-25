import { displayName } from '../../../engine/characters';
import { opinion } from '../../../engine/relations';
import type { GameState } from '../../../engine/types';
import { fmt$ } from '../../format';
import { OpinionBadge } from '../../components/CrewList';
import { CharLink, Face } from '../../components/People';

/** Diplomacy › The Board: every other power on the shore, what they want and what they did last. */
export function RivalBoard({ s }: { s: GameState }) {
  const philly = s.rivals.find((r) => r.id === 'philly');
  return (
    <div className="space-y-3" data-testid="rival-board">
      <p className="text-xs text-stone-500">Every family and power you deal with. Click a face for the man himself and everything you can do to him: gifts, sit-downs, schemes, a dispute at the Table.</p>
      {philly && (
        <div className="rounded-md border border-gold-600/40 bg-noir-800/60 px-3 py-2 text-sm">
          <span className="text-[10px] uppercase tracking-[0.25em] text-stone-500">Philadelphia's view of you</span>{' '}
          <OpinionBadge v={opinion(s, philly.leaderId, s.playerId)} />
          <span className="text-xs text-stone-400"> · family heat {s.heat.family}{s.heat.family >= 60 ? ' — they are watching' : ''}</span>
        </div>
      )}
      <ul className="grid gap-2 sm:grid-cols-2">
        {s.rivals.map((r) => {
          const leader = s.characters[r.leaderId];
          if (!leader) return null;
          const war = s.wars.find((w) => w.rival === r.id);
          return (
            <li key={r.id} className={`flex gap-2 items-start rounded-md border p-2 ${war || r.feud ? 'border-blood-500/60 bg-blood-500/10' : 'border-noir-700 bg-noir-800/50'}`}>
              <Face s={s} c={leader} size={48} />
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-2">
                  <div className="text-sm font-semibold text-stone-100 truncate">{r.name}</div>
                  <OpinionBadge v={opinion(s, r.leaderId, s.playerId)} />
                </div>
                <div className="text-xs text-stone-400 truncate"><CharLink s={s} id={leader.id}>{displayName(leader)}</CharLink></div>
                <div className="text-[11px] text-stone-500">Wants to <span className="text-stone-300">{r.goal}</span> · muscle {r.muscle}{r.kind === 'mob' ? ` · ${fmt$(r.money)}` : ''}</div>
                {war && <div className="text-[11px] text-red-300">At war · score {war.score}</div>}
                {r.feud && <div className="text-[11px] text-red-300">Blood feud</div>}
                {r.lastMove && <div className="text-[11px] text-stone-400 italic">Wk {r.lastMove.week}: {r.lastMove.text}</div>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
