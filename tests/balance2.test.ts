/**
 * BALANCE 2 (imports/queue/DECADE_BALANCE.md): regression tests for the decade bugs B1–B8 and the
 * Top-10 tuning, plus the difficulty presets (EASIER_NOT_SHALLOWER.md).
 */
import '../src/engine/engine';
import { describe, expect, it } from 'vitest';
import { capos, crew, makeCharacter } from '../src/engine/characters';
import { newGameWith } from '../src/engine/starts';
import { newCtx } from '../src/engine/ledger';
import { addOpinion } from '../src/engine/relations';
import { answerItem, markLive, scheduled } from '../src/engine/schedule';
import { ensureFeds } from '../src/engine/feds';
import { startCrisis } from '../src/engine/fedsCrisis';
import { advanceDay } from '../src/engine/daily';
import type { GameState } from '../src/engine/types';

function bigFamily(s: GameState, n = 14): void {
  const k = capos(s)[0];
  while (crew(s).length < n) {
    const c = makeCharacter(s, { rank: 'soldier', faction: 'player', age: 30 });
    c.capoId = k?.id;
  }
}

describe('B1: a Dead Man Walking call outlives its crisis', () => {
  function dmwLive(): { s: GameState; id: string } {
    const s = newGameWith('b1-dmw', 'olddon');
    bigFamily(s);
    for (const k of capos(s)) addOpinion(s, k.id, s.playerId, 'test', -60, 0);
    const F = ensureFeds(s);
    F.hollow = { since: s.week, boss: s.playerId, meter: 40, won: [], next: s.week + 8, leadId: capos(s)[0].id };
    startCrisis(newCtx(s), F, F.hollow);
    s.week = F.hollow.crisis!.w;
    const it = scheduled(s).find((x) => x.kind === 'feds_dmw')!;
    return { s: markLive(s, it.id), id: it.id };
  }

  it('the next morning drops the live call instead of crashing once the crown has passed', () => {
    const { s, id } = dmwLive();
    s.feds!.hollow = undefined; // the boss died; the succession cleared the crown
    let r: ReturnType<typeof advanceDay> | undefined;
    expect(() => { r = advanceDay(s); }).not.toThrow();
    expect(scheduled(r!.state).some((x) => x.id === id)).toBe(false);
  });

  it('answering a moot call directly is "it is over", not a TypeError', () => {
    const { s, id } = dmwLive();
    s.feds!.hollow = undefined;
    expect(() => answerItem(s, id, 'summon')).not.toThrow();
    expect(answerItem(s, id, 'summon')).toBeUndefined();
  });
});
