import { previewAction } from './actions';
import { datingView, type PersonRow } from './dating';
import type { GameState, PlayerAction } from './types';

/**
 * YOUR BEST CHANCES: of everyone he knows who could be more, the ones most
 * likely to say yes to the next step (a coffee, dinner, going steady), best
 * first, each with that step as the order and her odds. She still decides. Pure.
 */
export interface BestChance { row: PersonRow; action: PlayerAction; title: string; chance: number }

export function bestChances(s: GameState, n = 5): BestChance[] {
  const v = datingView(s);
  const out: BestChance[] = [];
  for (const row of [...v.people, ...v.relationships.filter((r) => r.stage === 'dating' || r.stage === 'committed')]) {
    for (const a of row.actions) {
      const op = (a as { op?: { op?: string } }).op?.op;
      if (a.kind !== 'dating' || op === 'talk' || op === 'gift') continue;
      const p = previewAction(s, a);
      const acc = p.acceptance ?? p.odds;
      if (p.disabledReason || !acc || acc.chance <= 0) continue;
      out.push({ row, action: a, title: p.title, chance: acc.chance });
      break;
    }
  }
  return out.sort((a, b) => b.chance - a.chance || (a.row.id < b.row.id ? -1 : 1)).slice(0, n);
}
