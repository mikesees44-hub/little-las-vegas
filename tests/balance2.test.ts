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

describe('B2: district influence never sums over 100', () => {
  it("a rival's man among the tenants takes his foothold from someone, not from nowhere", async () => {
    const { myPlaces, placeAsksWeek, TRADES } = await import('../src/engine/placeAsks');
    const { ensureEcon } = await import('../src/engine/econState');
    const s = newGameWith('b2-infl', 'olddon');
    const p = myPlaces(s)[0];
    expect(p).toBeDefined();
    const d = s.districts.find((x) => x.id === p.district)!;
    const R = s.rivals[0];
    const man = Object.values(s.characters).find((c) => c.alive && c.faction === R.id)!;
    d.influence = { player: 70, [R.id]: 30, none: 0 } as typeof d.influence;
    const E = ensureEcon(s);
    E.tenants = { t1: { name: man.firstName, who: man.id, rival: R.id, trade: Object.keys(TRADES)[0] as never, place: p.id, placeName: p.name, cut: 20, gross: 300, w: s.week, claim: R.id, trouble: { k: 'claim', w: s.week - 10 } } } as never;
    s.date = { ...s.date, d: 3 };
    for (let i = 0; i < 3; i++) { placeAsksWeek(newCtx(s)); s.week++; }
    const sum = Object.values(d.influence).reduce((a, b) => a + (b ?? 0), 0);
    expect(sum).toBeLessThanOrEqual(100.0001);
  });
});
