import { useState } from 'react';
import { leansView } from '../../engine/deeds/leans';
import type { Character, GameState } from '../../engine/types';
import { DeedFeed } from './DeedFeed';

/**
 * "How he leans" (character sheet): his personality's AI weights in plain
 * words with numbers, what he wants, and the top three moves he is weighing
 * about you with their scores — fogged by how well you know him.
 */
export function LeansSection({ s, c }: { s: GameState; c: Character }) {
  const [open, setOpen] = useState(false);
  if (!c.alive || c.id === s.playerId) return null;
  const v = leansView(s, c.id);
  if (!v) return null;
  return (
    <section className="mt-3 rounded-md border border-noir-700 bg-noir-800/50 p-2.5 text-xs" data-testid="sheet-leans">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">How {c.firstName} leans</div>
        <span className="text-[11px] text-stone-500" title={v.knowWhy.map((k) => `+${k.value} ${k.label}`).join('\n') || 'Nothing yet: find his secrets, talk with him, do him favors.'} data-testid="leans-know">
          {'●'.repeat(v.know)}{'○'.repeat(3 - v.know)} {v.knowText}
        </span>
      </div>
      {v.know === 0 && <div className="mt-1 text-stone-500">Traits: {c.traits.join(', ') || 'nothing notable'}. Get to know him (his secrets, a talk, a favor between you) to read how he weighs things.</div>}
      {v.weights.length > 0 && (
        <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5" data-testid="leans-weights">
          {v.weights.map((w, i) => <li key={i} className={w.value > 0 ? 'text-amber-200' : 'text-sky-300'}>{w.text}</li>)}
        </ul>
      )}
      {v.risk !== undefined && <div className="mt-0.5 text-stone-400">Takes risks {Math.round(v.risk * 100)}% of the way{v.ambition ? <> · wants to <span className="text-stone-200">{v.ambition.toLowerCase()}</span></> : null}</div>}
      {v.goals.length > 0 && <div className="text-stone-400">For now: {v.goals.join('; ')}</div>}
      {v.weighing.length > 0 && (
        <div className="mt-1.5" data-testid="leans-weighing">
          <div className="text-[10px] uppercase tracking-wider text-stone-500">What he is weighing about you</div>
          <ol className="mt-0.5 space-y-0.5">
            {v.weighing.map((w, i) => (
              <li key={i} className="text-stone-200">
                {i + 1}. {w.title}
                {w.score !== undefined && <span className={`ml-1 tabular-nums ${w.score >= 30 ? 'text-red-300' : w.score >= 10 ? 'text-amber-300' : 'text-stone-500'}`}>({w.score >= 0 ? '+' : ''}{w.score})</span>}
                {w.why && <span className="text-stone-500"> — {w.why.join(', ')}</span>}
              </li>
            ))}
          </ol>
          {v.know < 3 && <div className="text-stone-600">Know him better to see the numbers behind it.</div>}
        </div>
      )}
      {(v.ties.length > 0 || v.owesYou > 0 || v.youOwe > 0) && (
        <div className="mt-1 text-stone-400">
          {v.ties.map((t, i) => <span key={i} className="mr-2">{t.kind}: <span className="text-stone-200">{t.name}</span>{t.why ? <span className="text-stone-500"> ({t.why.toLowerCase()})</span> : null}</span>)}
          {v.owesYou > 0 && <span className="mr-2 text-emerald-300">Owes you {v.owesYou === 1 ? 'a favor' : `${v.owesYou} favors`}</span>}
          {v.youOwe > 0 && <span className="text-amber-300">You owe him {v.youOwe === 1 ? 'a favor' : `${v.youOwe} favors`}</span>}
        </div>
      )}
      {v.hidden > 0 && <div className="text-stone-600">{v.hidden} thing{v.hidden === 1 ? '' : 's'} about how he thinks you can't read yet.</div>}
      <button type="button" className="mt-1 text-[11px] text-stone-500 hover:text-gold-400" onClick={() => setOpen((x) => !x)} data-testid="leans-more">{open ? 'Less' : 'His dealings lately'}</button>
      {open && <DeedFeed s={s} who={c.id} max={8} />}
    </section>
  );
}
