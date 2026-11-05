import { displayName } from '../../../engine/characters';
import { inTheRanks } from '../../../engine/rankView';
import { above } from '../../../engine/valente';
import { AboveChart } from '../../borgata/YourPlace';
import { opinion } from '../../../engine/relations';
import type { GameState } from '../../../engine/types';
import { fmt$ } from '../../format';
import { OpinionBadge } from '../../components/CrewList';
import { CharLink, Face } from '../../components/People';
import { RelationChip, SideChip } from '../../components/Side';
import { sideOf } from '../../../engine/sides';
import { usePlanner } from '../../components/Schemes';
import { useState } from 'react';
import { useShell } from '../../shell/context';
import { canSitDown, rivalOf } from '../../../engine/minds/diplomacy';
import { recordOf, wordWith } from '../../../engine/minds/familyWord';
import { FamilyTalk } from '../../minds/FamilyTalk';

/** Diplomacy › The Board: every other power on the shore, what they want and what they did last. */
export function RivalBoard({ s }: { s: GameState }) {
  const { plan } = usePlanner();
  const shell = useShell();
  const [sit, setSit] = useState<string | undefined>();
  const philly = s.rivals.find((r) => r.id === 'philly');
  return (
    <div className="space-y-3" data-testid="rival-board">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="llv-prose min-w-0 flex-1">Every family and power you deal with. Click a face for the man himself and everything you can do to him: gifts, sit-downs, schemes, a dispute at the Table.</p>
        <button type="button" className="btn-ghost shrink-0 text-xs" onClick={() => plan('murder')} data-testid="rival-board-hit" title="Opens the hit planner: every target by family, with the odds and heat of each">Plan a hit…</button>
      </div>
      {/* Below the chair: your own family comes first, the one you answer to (valente.ts). */}
      {inTheRanks(s) && (
        <div data-testid="rival-board-above">
          <AboveChart s={s} title={`Your family: the ${above(s)?.name ?? 'Valente'} family. You answer to them; the other families deal with the Don, not with you.`} />
        </div>
      )}
      {philly && (
        <div className={`llv-card-box ${s.heat.family >= 60 ? 'llv-card-danger' : 'llv-card-attention'} flex flex-wrap items-center gap-x-3 gap-y-1 py-2`} data-testid="rival-board-philly">
          <span className="font-display text-[15px] text-gold-300">{inTheRanks(s) ? 'Philadelphia (your Don\'s bosses) knows of you' : 'Philadelphia\'s view of you'}</span>
          <OpinionBadge v={opinion(s, philly.leaderId, s.playerId)} />
          <span className="text-[12px] text-stone-400">family heat <b className="tabular-nums text-stone-200">{s.heat.family}</b>{s.heat.family >= 60 ? ' — they are watching' : ''}</span>
        </div>
      )}
      <ul className="grid gap-2 sm:grid-cols-2">
        {s.rivals.map((r) => {
          const leader = s.characters[r.leaderId];
          if (!leader) return null;
          const war = s.wars.find((w) => w.rival === r.id);
          return (
            <li key={r.id} className={`llv-card-box llv-d-rivals llv-dom-edge flex min-w-0 items-start gap-2.5 p-2.5 ${war || r.feud ? 'llv-card-danger' : 'llv-card-plain llv-dom-tint'}`} data-testid="rival-card" data-domain="rivals">
              <Face s={s} c={leader} size={48} />
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-2">
                  <div className="font-display text-[15px] leading-tight text-stone-100 truncate">{r.name}</div>
                  <OpinionBadge v={opinion(s, r.leaderId, s.playerId)} />
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1"><SideChip s={s} id={leader.id} full /><RelationChip relation={sideOf(s, leader.id).relation} /></div>
                <div className="text-xs text-stone-400 truncate"><CharLink s={s} id={leader.id}>{displayName(leader)}</CharLink></div>
                <div className="text-[11px] text-stone-500">Wants to <span className="text-stone-300">{r.goal}</span> · muscle {r.muscle}{r.kind === 'mob' ? ` · ${fmt$(r.money)}` : ''}</div>
                {war && <div className="text-[11px] text-red-300">At war · score {war.score}</div>}
                {r.feud && <div className="text-[11px] text-red-300">Blood feud</div>}
                {rivalOf(s, r.id) && (() => {
                  const w = wordWith(s, r.id);
                  const rec = recordOf(s, r.id);
                  const sit = rec?.sits[rec.sits.length - 1];
                  return (
                    <div className="text-[11px] text-stone-400" data-testid={`word-${r.id}`} title={w.parts.map((p) => `${p.label}: ${p.value > 0 ? '+' : ''}${p.value}`).join('\n') || 'No record either way yet'}>
                      Your word with them: <b className={w.score >= 58 ? 'text-emerald-300' : w.score < 43 ? 'text-red-300' : 'text-stone-200'}>{w.score} ({w.text})</b>
                      {rec && (rec.kept || rec.broken || rec.refused) ? <span> · kept {rec.kept}, broken {rec.broken}{rec.refused ? `, refused ${rec.refused}` : ''}</span> : null}
                      {sit && <span> · last sit-down wk {sit.w}: {sit.how === 'deal' ? 'a deal' : sit.how === 'walkout' ? 'he walked out' : sit.how === 'left' ? 'you walked out' : 'no deal'}</span>}
                    </div>
                  );
                })()}
                {r.lastMove && <div className="text-[11px] text-stone-400 italic">Wk {r.lastMove.week}: {r.lastMove.text}</div>}
                {shell.update && rivalOf(s, r.id) && leader.alive && (() => {
                  const can = canSitDown(s, r.id);
                  return (
                    <button type="button" className="btn-ghost mt-1 px-2 py-0.5 text-[11px]" disabled={!can.ok} title={can.ok ? 'A real back-and-forth: what they want, your offer, shake on it. About two hours.' : can.why}
                      onClick={() => setSit(r.id)} data-testid={`sitdown-${r.id}`}>Sit down with {leader.firstName}</button>
                  );
                })()}
              </div>
            </li>
          );
        })}
      </ul>
      {sit && shell.update && <FamilyTalk s={s} rival={sit} update={shell.update} onClose={() => setSit(undefined)} />}
    </div>
  );
}
