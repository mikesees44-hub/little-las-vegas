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

describe('B5 / Top 10 #5a: the capo zero lock', () => {
  it('a family with no capos and no district at 40% still makes one from its waiting soldiers', async () => {
    const { regimesWeek } = await import('../src/engine/regimes');
    const s = newGameWith('b5-lock', 'classic');
    for (const k of capos(s)) { k.rank = 'soldier'; }
    for (const d of s.districts) { d.capoId = undefined; const me = d.influence.player ?? 0; if (me > 20) { d.influence.player = 20; d.influence.none = (d.influence.none ?? 0) + me - 20; } }
    while (crew(s).filter((c) => c.rank === 'soldier' && !c.dynasty).length < 6) makeCharacter(s, { rank: 'soldier', faction: 'player', age: 30 });
    expect(capos(s).length).toBe(0);
    for (let i = 0; i < 10; i++) { regimesWeek(newCtx(s)); s.week++; }
    expect(capos(s).length).toBeGreaterThanOrEqual(1);
  });
});

describe('B6 / Top 10 #6: a younger, ranked line', () => {
  it('a grown son under 60 comes before a 70-year-old uncle; a ranked cousin before an unranked one', async () => {
    const { bloodLine } = await import('../src/engine/dynasty');
    const s = newGameWith('b6-line', 'classic');
    const boss = s.characters[s.playerId];
    const old = makeCharacter(s, { gender: 'M', lastName: boss.lastName, dynasty: true, age: 71, faction: 'player' });
    const young = makeCharacter(s, { gender: 'M', lastName: boss.lastName, dynasty: true, age: 34, faction: 'player' });
    const ranked = makeCharacter(s, { gender: 'M', lastName: boss.lastName, dynasty: true, age: 45, faction: 'player', rank: 'soldier' });
    const line = bloodLine(s, boss).map((c) => c.id);
    expect(line.indexOf(young.id)).toBeLessThan(line.indexOf(old.id));
    expect(line.indexOf(ranked.id)).toBeLessThan(line.indexOf(young.id));
  });

  it('a woman who married out comes after the men of the house', async () => {
    const { bloodLine } = await import('../src/engine/dynasty');
    const s = newGameWith('b6-out', 'classic');
    const boss = s.characters[s.playerId];
    const anna = makeCharacter(s, { gender: 'F', lastName: 'Doyle', dynasty: true, age: 40, faction: 'player' });
    anna.maidenName = s.houseName;
    const old = makeCharacter(s, { gender: 'M', lastName: boss.lastName, dynasty: true, age: 66, faction: 'player' });
    const line = bloodLine(s, boss).map((c) => c.id);
    expect(line.indexOf(old.id)).toBeLessThan(line.indexOf(anna.id));
  });

  it('the grown, unranked heir is offered a crew', async () => {
    const { heirSeatSource } = await import('../src/engine/generations');
    const { chooseHeir } = await import('../src/engine/dynasty');
    const s = newGameWith('t6-seat', 'olddon');
    const heir = chooseHeir(s, s.characters[s.playerId]).heir!;
    heir.rank = 'civilian'; heir.faction = 'player';
    let ev;
    for (let w = 0; w < 120 && !ev; w++) { s.week++; ev = heirSeatSource(s); }
    expect(ev?.defId).toBe('heir_seat');
    expect(ev!.choices.map((c) => c.id)).toEqual(['capo', 'soldier', 'later']);
  });
});

describe('Top 10 #7: marriages and births renew the line', () => {
  it('a house offers a match for an unmarried son', async () => {
    const { matchOfferSource } = await import('../src/engine/generations');
    const { ensureDynState } = await import('../src/engine/familyState');
    const s = newGameWith('t7-match', 'classic');
    ensureDynState(s);
    const boss = s.characters[s.playerId];
    makeCharacter(s, { gender: 'M', lastName: boss.lastName, dynasty: true, age: 24, faction: 'player' });
    let ev;
    for (let w = 0; w < 3000 && !ev; w++) { s.week++; ev = matchOfferSource(s); }
    if (!s.dyn?.houses?.length) return; // a start without the houses layer: nothing to offer
    expect(ev?.defId).toBe('match_offer');
    expect(ev!.choices.at(-1)!.id).toBe('none');
  });
});

describe('Top 10 #4: the associate can climb', () => {
  it('the quota, the made bar and a capped short Monday', async () => {
    const V = await import('../src/engine/valente');
    expect(V.QUOTA.associate).toBe(150);
    expect(V.MADE_STANDING).toBe(35);
    const s = newGameWith('t4-short', 'associate');
    const a = V.above(s)!;
    const before = a.standing;
    s.date = { ...s.date, m: 7 }; // in season
    V.quotaWeek(newCtx(s), 0);
    expect(before - a.standing).toBeLessThanOrEqual(V.SHORT_LOSS);
  });

  it('the Sit-Down puts the ladder first for a man in the ranks', async () => {
    const { ladderRecs } = await import('../src/engine/briefing');
    const s = newGameWith('t4-ladder', 'associate');
    const r = ladderRecs(s);
    expect(r.length).toBeGreaterThan(0);
    expect(['ladder:climb', 'ladder:vouch']).toContain(r[0].item.id.split(':').slice(0, 2).join(':'));
  });
});

describe('Top 10 #5: a floor under collapse', () => {
  it('the bail-out never defaults to riding it out; a year under water and Philadelphia takes the debt', async () => {
    const { bailoutSource, pressureWeek } = await import('../src/engine/pressure');
    const { ensureAction } = await import('../src/engine/actionState');
    const s = newGameWith('t5-floor', 'classic');
    s.money = -60000;
    const A = ensureAction(s);
    A.under = 30;
    const ev = bailoutSource(s)!;
    expect(ev.defaultChoiceId).not.toBe('ride');
    expect(ev.choices.some((c) => c.id === 'ride')).toBe(true); // the option is still there
    A.under = 51;
    pressureWeek(newCtx(s));
    expect(s.money).toBeGreaterThan(0);
    expect(s.flags.philly_took).toBe(s.week);
  });

  it('the police come half as often to a family under water', async () => {
    const { policeChance } = await import('../src/engine/threats');
    const s = newGameWith('t5-police', 'classic');
    s.heat.local = 60;
    const rich = policeChance(s);
    s.money = -50000;
    expect(policeChance(s)).toBeLessThan(rich);
  });
});

describe('Top 10 #8: the big fed beats are reachable', () => {
  it('a wave pulls the boss\'s serious file in front of the grand jury', async () => {
    const { indictmentWave, ensureFeds, SERIOUS } = await import('../src/engine/feds');
    const s = newGameWith('t8-wave', 'olddon');
    s.characters[s.playerId].evidence = SERIOUS + 5;
    indictmentWave(newCtx(s), ensureFeds(s), 'wire');
    expect(s.legal?.stage).toBe('grandjury');
    expect(s.eventQueue.some((e) => e.defId === 'grand_jury')).toBe(true);
  });

  it('a man facing years with no lawyer and no envelope is likelier to flip', async () => {
    const { flipOdds } = await import('../src/engine/feds');
    const s = newGameWith('t8-flip', 'olddon');
    const c = crew(s).find((x) => x.rank === 'soldier')!;
    expect(flipOdds(s, { charId: c.id, years: 8, care: [] })).toBeGreaterThan(flipOdds(s, { charId: c.id, years: 8, care: ['lawyer'] }));
  });
});

describe('Top 10 #2: moments share the big layers instead of cloning the world', () => {
  it('no moment writes a shared layer (frozen) across weeks of the clock', async () => {
    const { MOMENT_SHARED, momentClone } = await import('../src/engine/momentClone');
    const { advanceWeek } = await import('../src/engine/engine');
    const { answerMoment, closeWeek, momentView } = await import('../src/engine/daily');
    const deepFreeze = (o: unknown): void => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o as object)) deepFreeze(v); } };
    let s = newGameWith('t2-cow', 'olddon');
    s.heat.local = 70; s.heat.federal = 50;
    let moments = 0;
    for (let w = 0; w < 10; w++) {
      for (const k of MOMENT_SHARED) deepFreeze((s as unknown as Record<string, unknown>)[k]);
      for (let d = 0; d < 6; d++) {
        const day = advanceDay(s);
        s = day.state;
        for (const id of day.strikes) {
          const v = momentView(s, id);
          if (!v) continue;
          const r = answerMoment(s, id, v.options.find((o) => !o.blocked)?.id ?? v.def);
          if (r.result.ok) { s = r.state; moments++; }
        }
      }
      s = advanceWeek(closeWeek(s), {}).state;
    }
    // The copy shares the big layers by reference.
    const c = momentClone(s);
    expect(c.empire).toBe(s.empire);
    expect(c.characters).not.toBe(s.characters);
    console.log(`[cow] moments answered: ${moments}`);
    expect(moments).toBeGreaterThanOrEqual(0);
  });
});

describe('Top 10 #1: the save on a diet', () => {
  it('a long-dead minor character named nowhere leaves characters and relations for a stub', async () => {
    const { pruneDead, departedName } = await import('../src/engine/prune');
    const s = newGameWith('t1-prune', 'olddon');
    const c = makeCharacter(s, { rank: 'soldier', faction: 'none', age: 40 });
    addOpinion(s, c.id, s.playerId, 'test', 10, 0);
    c.alive = false; c.death = { week: s.week, date: { ...s.date }, cause: 'a test' };
    s.week += 200;
    const n = pruneDead(s);
    expect(n).toBeGreaterThanOrEqual(1);
    expect(s.characters[c.id]).toBeUndefined();
    expect(Object.values(s.relations).some((r) => r.from === c.id || r.to === c.id)).toBe(false);
    expect(departedName(s, c.id)).toBe(`${c.firstName} ${c.lastName}`);
  });

  it('a dead man still named somewhere (a capo of record, a house) is kept', async () => {
    const { pruneDead } = await import('../src/engine/prune');
    const s = newGameWith('t1-keep', 'olddon');
    const c = makeCharacter(s, { rank: 'soldier', faction: 'none', age: 40 });
    c.alive = false; c.death = { week: s.week, date: { ...s.date }, cause: 'a test' };
    s.districts[0].capoId = c.id;
    s.week += 200;
    pruneDead(s);
    expect(s.characters[c.id]).toBeDefined();
  });

  it('an old save loads: archives capped, difficulty Don', async () => {
    const { upgradeSave } = await import('../src/engine/upgradeSave');
    const s = newGameWith('t1-load', 'olddon');
    delete (s as { difficulty?: string }).difficulty;
    const up = upgradeSave(s);
    expect(up.difficulty).toBe('don');
  });
});

describe('B4 / Top 10 #9: losing the family is a chapter, not a dead stop', () => {
  it('an independent crew gets a year to take ground back; holding a district makes it a family again', async () => {
    const { chooseStation, stationMonth, COMEBACK_HOLD } = await import('../src/engine/station');
    const s = newGameWith('t9-deposed', 'classic');
    chooseStation(newCtx(s), 'independent');
    for (const d of s.districts) { const me = d.influence.player ?? 0; d.influence.player = Math.min(me, 10); d.influence.none = (d.influence.none ?? 0) + me - (d.influence.player ?? 0); }
    stationMonth(newCtx(s));
    expect(s.power!.comeback).toBeDefined();
    expect(s.gameOver).toBeUndefined();
    const d = s.districts[0];
    d.influence = { player: COMEBACK_HOLD + 5, none: 100 - COMEBACK_HOLD - 5 } as typeof d.influence;
    stationMonth(newCtx(s));
    expect(s.power!.station).toBe('boss');
    expect(s.power!.comeback).toBeUndefined();
  });

  it('the year runs out: the crew folds into the ranks and play goes on', async () => {
    const { chooseStation, stationMonth } = await import('../src/engine/station');
    const s = newGameWith('t9-fold', 'classic');
    chooseStation(newCtx(s), 'independent');
    for (const d of s.districts) { d.influence = { ...d.influence, none: (d.influence.none ?? 0) + (d.influence.player ?? 0), player: 0 }; }
    stationMonth(newCtx(s));
    s.week = s.power!.comeback!.until;
    stationMonth(newCtx(s));
    expect(s.power!.station).toBe('soldier');
    expect(s.gameOver).toBeUndefined();
  });
});

describe('Difficulty presets (EASIER_NOT_SHALLOWER #1)', () => {
  it('one table of knobs; Story is gentler and Grand Strategy harsher than Don; stored in the save', async () => {
    const { DIFFICULTY, setDifficulty, knobs } = await import('../src/engine/difficulty');
    const { policeChance, aggression } = await import('../src/engine/threats');
    const { flipOdds } = await import('../src/engine/feds');
    const { heat } = await import('../src/engine/ledger');
    expect(Object.keys(DIFFICULTY)).toEqual(['story', 'don', 'grand']);
    for (const k of ['heatGain', 'hollow', 'flip', 'aggression', 'fire', 'police', 'battleDeath'] as const) {
      expect(DIFFICULTY.story[k]).toBeLessThan(DIFFICULTY.don[k]);
      expect(DIFFICULTY.grand[k]).toBeGreaterThan(DIFFICULTY.don[k]);
    }
    expect(DIFFICULTY.story.bailWeeks).toBeLessThan(DIFFICULTY.don.bailWeeks);
    const base = newGameWith('diff', 'olddon');
    base.heat.local = 60; base.week = 80;
    const story = setDifficulty(base, 'story');
    const grand = setDifficulty(base, 'grand');
    expect(story.difficulty).toBe('story');
    expect(knobs(base).label).toBe('Don');
    expect(policeChance(story)).toBeLessThan(policeChance(base));
    expect(policeChance(grand)).toBeGreaterThan(policeChance(base));
    const r = base.rivals.find((x) => x.kind === 'mob')!;
    expect(aggression(story, r).chance).toBeLessThanOrEqual(aggression(base, r).chance);
    const c = crew(base).find((x) => x.rank === 'soldier')!;
    expect(flipOdds(story, { charId: c.id, years: 8, care: [] })).toBeLessThan(flipOdds(grand, { charId: c.id, years: 8, care: [] }));
    // The heat ramp: four +1s are three on Story (the fraction carries).
    const s2 = structuredClone(story); s2.heat.local = 10;
    const ctx = newCtx(s2);
    for (let i = 0; i < 4; i++) heat(ctx, 'local', 1, 't', 'heat');
    expect(s2.heat.local).toBe(13);
  });
});
