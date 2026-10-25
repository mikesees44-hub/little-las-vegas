import { useMemo, useState } from 'react';
import { askOdds, boundaryHit, earLine, knownEars, trustWord } from '../../engine/ears';
import type { JobMode } from '../../engine/earsState';
import type { Character, GameState } from '../../engine/types';
import { ActionCard } from '../components/Orders';
import { Face } from '../components/People';
import { Tip } from '../clarity';

/**
 * "Can you get close to him?" / "Give him a dance": pick one of your Ears.
 * Each card is her answer in waiting: her odds and her reasons, her price.
 * She decides; the boss only asks.
 */
export function EarsPicker({ s, target, mode }: { s: GameState; target: Character; mode: JobMode }) {
  const [generous, setGenerous] = useState(false);
  const list = useMemo(() => {
    return knownEars(s)
      .map((e) => ({ e, c: s.characters[e.id], odds: askOdds(s, e, target, mode, generous).chance, hit: boundaryHit(s, e, target, mode) }))
      .sort((a, b) => Number(!!a.hit) - Number(!!b.hit) || Number(a.e.status !== 'listening') - Number(b.e.status !== 'listening') || b.odds - a.odds);
  }, [s, target, mode, generous]);
  if (!list.length) {
    return <p className="text-[11px] text-stone-400" data-testid="ears-picker">You don't know any of the Ears yet. The Madam can introduce you, or one of them will come to you.</p>;
  }
  return (
    <div className="space-y-1.5" data-testid="ears-picker">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] text-stone-400">{mode === 'close' ? `Who could get close to ${target.firstName}?` : `Who might give ${target.firstName} a dance, or some VIP time?`} She decides.</div>
        <label className="text-[11px] text-stone-300 flex items-center gap-1 shrink-0"><input type="checkbox" checked={generous} onChange={(e) => setGenerous(e.target.checked)} /> generous price</label>
      </div>
      {list.slice(0, 6).map(({ e, c }) => (
        <div key={e.id} className="flex gap-2 items-start">
          <Face s={s} c={c} size={36} />
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-stone-400 truncate">
              {earLine(s, e)} · <Tip text={`Trust ${e.loyalty}, nerve ${e.nerve}, discretion ${e.discretion}, charm ${e.charm}; her prices run ×${e.greed.toFixed(2)}`}><span className="underline decoration-dotted">{trustWord(e.loyalty)}</span></Tip>
            </div>
            <ActionCard s={s} compact action={{ kind: 'ears', op: { op: 'ask', earId: e.id, targetId: target.id, mode, generous } }} />
          </div>
        </div>
      ))}
    </div>
  );
}
