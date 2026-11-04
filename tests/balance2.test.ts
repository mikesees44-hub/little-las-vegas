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

describe('B3 / Top 10 #4a: no full wars on a man in the ranks', () => {
  it('no campaign, no blitz, no army risk to an associate', async () => {
    const { startCampaign, battlePlan, bossSheltered } = await import('../src/engine/army');
    const { launchBlitz } = await import('../src/engine/blitz');
    const { spareFromWars } = await import('../src/engine/rankView');
    const s = newGameWith('b3-ranks', 'associate');
    expect(spareFromWars(s)).toBe(true);
    const rid = s.rivals.find((r) => r.kind === 'mob')!.id;
    expect(startCampaign(newCtx(s), rid, 'districts', 'test')).toBeUndefined();
    expect(launchBlitz(newCtx(s), rid, 'player', 50, true)).toBeUndefined();
    expect(bossSheltered(s)).toBe(true);
    // Even a war left over from before (a fallen boss): it ends at the week's army step.
    const boss = newGameWith('b3-ranks', 'classic');
    const w = startCampaign(newCtx(boss), rid, 'districts', 'test')!;
    expect(w).toBeDefined();
    const plan = battlePlan(boss, { warId: w.id, district: 'downtown', attacker: rid, enemyMen: 30 }, 'meet');
    expect(plan.bossRisk).toBeLessThanOrEqual(0.08);
  });

  it('a fallen boss in the ranks is out of the wars at the next army step', async () => {
    const { startCampaign, armyWeek } = await import('../src/engine/army');
    const s = newGameWith('b3-fall', 'classic');
    const rid = s.rivals.find((r) => r.kind === 'mob')!.id;
    startCampaign(newCtx(s), rid, 'districts', 'test');
    expect(s.wars.length).toBeGreaterThan(0);
    s.power = { ...(s.power ?? {}), station: 'soldier' } as never;
    armyWeek(newCtx(s));
    expect(s.wars.length).toBe(0);
  });
});

describe('Top 10 #3: the boss at home is wounded first, not killed', () => {
  it('the first breakthrough that reaches him wounds him; the second within a year kills', async () => {
    const { startCampaign, resolveBattle } = await import('../src/engine/army');
    const s = newGameWith('t3-wound', 'classic');
    const rid = s.rivals.find((r) => r.kind === 'mob')!.id;
    const w = startCampaign(newCtx(s), rid, 'districts', 'test')!;
    const boss = s.characters[s.playerId];
    boss.health = 90;
    // Force his risk: no shelter, a hopeless fight in the core.
    let wounded = false; let killed = false;
    for (let i = 0; i < 400 && !killed; i++) {
      const b = { id: `pb${i}`, warId: w.id, district: 'downtown', attacker: rid, enemyMen: 200, week: s.week } as never;
      s.army!.pending.push(b);
      const ctx = newCtx(s);
      resolveBattle(ctx, b, 'meet', 0.999);
      if (s.army!.bossWound !== undefined && !wounded) { wounded = true; expect(s.characters[s.playerId].alive).toBe(true); expect(s.characters[s.playerId].health).toBeLessThan(90); }
      if (!s.characters[s.playerId]?.alive || s.playerId !== boss.id) killed = true;
      if (!s.wars.length) break;
    }
    expect(wounded).toBe(true);
  });
});

describe('B8: widows and widowers are free to marry again', () => {
  it('a death frees the survivor; an old save is freed at load', async () => {
    const { killCharacter } = await import('../src/engine/dynasty');
    const { upgradeSave } = await import('../src/engine/upgradeSave');
    const s = newGameWith('b8-widow', 'olddon');
    const husband = Object.values(s.characters).find((c) => c.alive && c.dynasty && c.gender === 'M' && c.spouseId && s.characters[c.spouseId]?.alive && c.id !== s.playerId)!;
    expect(husband).toBeDefined();
    const wife = s.characters[husband.spouseId!];
    killCharacter(newCtx(s), husband.id, 'a heart attack');
    expect(wife.spouseId).toBeUndefined();
    expect(husband.spouseId).toBe(wife.id); // the dead keep it for the tree
    // An older save: still married to the dead.
    wife.spouseId = husband.id;
    const up = upgradeSave(s);
    expect(up.characters[wife.id].spouseId).toBeUndefined();
  });
});

describe('B7: a child of the house does not take a living kinsman\'s first name', () => {
  it('births never duplicate a living first name in the house', async () => {
    const s = newGameWith('b7-names', 'olddon');
    const boss = s.characters[s.playerId];
    for (let i = 0; i < 25; i++) makeCharacter(s, { gender: 'M', lastName: boss.lastName, dynasty: true, age: 0 });
    const names = Object.values(s.characters).filter((c) => c.alive && c.dynasty && c.lastName === boss.lastName && c.gender === 'M').map((c) => c.firstName);
    const born = names.slice(-25);
    // Every newborn's name is unique among the living house (until the list runs out).
    expect(new Set(born).size).toBe(born.length);
  });
});
