import { memo, useMemo } from 'react';
import type { Character, GameDate } from '../../engine/types';
import type { PNode } from '../../engine/housesView';
import { Portrait } from '../portrait/Portrait';
import { FACTION_TINT } from '../components/People';

/**
 * The period portrait for anyone in a tree (Characters and off-screen
 * lineage people alike). Memoized on primitives so a big tree re-renders only
 * the faces that changed.
 */
function FaceImpl(p: {
  id: string; first: string; last: string; g: 'M' | 'F'; eth: string; by: number; bm: number; dy?: number; alive: boolean; rank?: string;
  faction?: string; seed: string; y: number; m: number; size: number;
}) {
  const c = useMemo(() => ({
    id: p.id, firstName: p.first, lastName: p.last, gender: p.g, ethnicity: p.eth, rank: p.rank ?? 'civilian', alive: p.alive,
    birth: { y: p.by, m: p.bm, d: 1 }, death: p.alive ? undefined : { week: 0, date: { y: p.dy ?? p.by, m: 6, d: 1 }, cause: '' },
  }) as unknown as Character, [p.id, p.first, p.last, p.g, p.eth, p.by, p.bm, p.dy, p.alive, p.rank]);
  const date: GameDate = useMemo(() => ({ y: p.y, m: p.m, d: 1 }), [p.y, p.m]);
  return <Portrait c={c} seed={p.seed} date={date} size={p.size} tint={FACTION_TINT[(p.faction ?? 'none') as keyof typeof FACTION_TINT] ?? FACTION_TINT.none} />;
}

const Face = memo(FaceImpl);

export function PersonFace({ n, seed, date, size = 40 }: { n: PNode; seed: string; date: GameDate; size?: number }) {
  return (
    <Face id={n.id} first={n.first} last={n.last} g={n.g} eth={n.stock === 'Migration' ? 'Black' : n.eth} by={n.by} bm={n.bm} dy={n.dy} alive={n.alive}
      rank={n.rank} faction={n.faction} seed={seed} y={date.y} m={date.m} size={size} />
  );
}
