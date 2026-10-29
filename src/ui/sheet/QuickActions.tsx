import { settlesNow } from '../../engine/deeds/now';
import { useShell } from '../shell/context';
import { ActionCard } from '../components/Orders';
import { useMemo, useState } from 'react';
import { previewAction } from '../../engine/actions';
import type { Character, GameState, PlayerAction } from '../../engine/types';
import { specificButton } from '../actionFacts';
import { useOrders } from '../components/Orders';
import { sameOrder, verbOf } from '../verbs';
import { menuFor } from './menuCatalog';

/** The three or four things you most often do with this kind of person, by menu key, best first. */
const PREFER: Record<'crew' | 'rival' | 'kin' | 'other' | 'boss', string[]> = {
  crew: ['i:dinner', 't:business', 't:advice', 't:grievance', 'i:gift_small', 'i:promote', 't:succession'],
  kin: ['i:dinner', 't:succession', 't:advice', 'i:gift_small', 'i:bringIn'],
  rival: ['t:meeting', 't:business', 't:negotiate', 't:partner', 'i:gift_small'],
  other: ['t:social', 't:business', 'i:gift_small', 'i:bribe', 't:job'],
  boss: ['office'],
};

function kindOf(s: GameState, c: Character): keyof typeof PREFER {
  if (c.id === s.playerId) return 'boss';
  if (c.dynasty && c.faction === 'player' && c.rank === 'civilian') return 'kin';
  if (c.faction === 'player' && c.rank !== 'civilian') return 'crew';
  if (s.rivals.some((r) => r.leaderId === c.id) || (c.faction !== 'player' && c.faction !== 'none' && c.faction !== 'law')) return 'rival';
  return 'other';
}

/** Up to four quick orders for one person (the specific button words, with the price). */
export function quickActionsFor(s: GameState, c: Character): PlayerAction[] {
  const items = menuFor(s, c).flatMap((cat) => cat.items).filter((it) => it.action);
  const byKey = new Map(items.map((it) => [it.key, it.action!]));
  const out: PlayerAction[] = [];
  for (const k of PREFER[kindOf(s, c)]) {
    const a = byKey.get(k);
    if (a && !previewAction(s, a).disabledReason) out.push(a);
    if (out.length >= 3) break;
  }
  return out;
}

/** The sheet's top row: the quick orders and "All actions". */
export function QuickActions({ s, c, onAll }: { s: GameState; c: Character; onAll: () => void }) {
  const acts = useMemo(() => quickActionsFor(s, c), [s, c]);
  const { orders, queue } = useOrders();
  const shell = useShell();
  // A person interaction opens its card (the odds and every reason) and is settled there, on the spot.
  const [pick, setPick] = useState<PlayerAction | undefined>();
  return (
    <>
    <div className="mt-3 flex flex-wrap gap-1.5" data-testid="quick-actions">
      {acts.map((a, i) => {
        const p = previewAction(s, a);
        const on = orders.some((o) => sameOrder(o, a));
        return (
          <button key={i} type="button" disabled={on} onClick={() => (shell.update && settlesNow(s, a) ? setPick(pick && sameOrder(pick, a) ? undefined : a) : queue(a))} title={p.detail ?? p.title} data-testid="quick-action"
            className={on ? 'btn-ghost text-xs py-1' : 'btn-gold text-xs py-1'}>
            {on ? verbOf(a, p).done : specificButton(s, a, p)}
          </button>
        );
      })}
      <button type="button" className="btn-ghost text-xs py-1" onClick={onAll} data-testid="quick-all-actions">☰ All actions</button>
    </div>
    {pick && <div className="mt-1.5"><ActionCard s={s} action={pick} /></div>}
    </>
  );
}
