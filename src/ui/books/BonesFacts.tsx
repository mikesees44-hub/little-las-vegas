import { bonesLine, hasBones, JOB_INFO, needsBones } from '../../engine/bones';
import type { Character, GameState } from '../../engine/types';
import { ActionCard } from '../components/Orders';

/** "Made his bones: 1961, the Garden Pier job" — and, for a prospect, the jobs that would get him there. */
export function BonesFacts({ s, c }: { s: GameState; c: Character }) {
  const job = s.bones?.jobs.find((j) => j.prospectId === c.id);
  const favor = s.bones?.waived[c.id] !== undefined;
  const prospect = c.faction === 'player' && c.rank === 'associate' && !c.specialty;
  if (!hasBones(c) && !prospect && !job) return null;
  return (
    <section className="mt-3 rounded-md border border-noir-700 bg-noir-800/50 p-2.5" data-testid="bones-facts">
      <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">His bones</div>
      <ul className="mt-1 space-y-0.5 text-xs">
        {(c.bones ?? []).map((e, i) => (
          <li key={i} className="text-gold-300">
            {bonesLine(e)} <span className="text-stone-500">({e.role}){e.verified === false ? ' — his word only, not checked' : ''}</span>
            <div className="text-stone-400">{e.text}</div>
          </li>
        ))}
        {!hasBones(c) && prospect && <li className="text-stone-400">{favor ? 'Never made his bones. Philadelphia is making him as a favor to you.' : 'Has not made his bones. Nobody puts his name up until he does something for this thing of ours.'}</li>}
        {job && <li className="text-amber-300">On the {job.name} now ({job.kind === 'hit' ? 'on the team' : JOB_INFO[job.kind].name.toLowerCase()}).</li>}
      </ul>
      {c.alive && !s.gameOver && needsBones(s, c) && !job && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <ActionCard s={s} action={{ kind: 'bones', op: { op: 'assign', charId: c.id, kind: 'heist' } }} />
          <ActionCard s={s} action={{ kind: 'bones', op: { op: 'assign', charId: c.id, kind: 'collection' } }} />
          {s.schemes.some((x) => x.owner === 'player' && x.kind === 'murder') && <ActionCard s={s} action={{ kind: 'bones', op: { op: 'assign', charId: c.id, kind: 'hit' } }} />}
          <ActionCard s={s} action={{ kind: 'bones', op: { op: 'favor', charId: c.id } }} />
        </div>
      )}
    </section>
  );
}
