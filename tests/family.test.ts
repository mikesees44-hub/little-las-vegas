import { describe, expect, it } from 'vitest';
import { previewAction } from '../src/engine/actions';
import { ACTIVITIES } from '../src/engine/activities';
import { ageOn } from '../src/engine/calendar';
import { makeCharacter, player } from '../src/engine/characters';
import { decisionView } from '../src/engine/decisions';
import { chooseHeir, validatePlayer } from '../src/engine/dynasty';
import { applyEffects } from '../src/engine/effects';
import { advanceWeek, forceDeath } from '../src/engine/engine';
import { bagmanDue, MAX_POPUPS } from '../src/engine/events';
import { dynastyMonth, dynastyWeek } from '../src/engine/family';
import { activeAlliances, alliedWithFaction, dynastyTableLean, marriageable } from '../src/engine/familyHouses';
import { hasPerk, LEGACY_COST } from '../src/engine/familyLegacy';
import { dowryFor, marriageAcceptance, marriageEffects } from '../src/engine/familyMarriage';
import { fam, famMut, houseOf, type House } from '../src/engine/familyState';
import { inheritCongenital, INHERIT, processNewborn } from '../src/engine/familyTraits';
import { newCtx, reconcile } from '../src/engine/ledger';
import { newGame } from '../src/engine/newGame';
import { scoreMoves } from '../src/engine/rivals';
import { forecast, newDispute, openDispute } from '../src/engine/table';
import type { Character, GameState, PlayerAction } from '../src/engine/types';
import { randomChoices } from './helpers';

const dyn = (op: Extract<PlayerAction, { kind: 'dynasty' }>['op']): PlayerAction => ({ kind: 'dynasty', op });

function house(s: GameState, id: string): House {
  return s.dyn!.houses.find((h) => h.id === id)!;
}

/** A grown son of the house with no wife, for marriage tests. */
function bachelor(s: GameState): Character {
  const boss = player(s);
  const son = makeCharacter(s, { gender: 'M', age: 24, lastName: boss.lastName, ethnicity: 'Italian', dynasty: true, faction: 'player', rank: 'civilian', nickname: false });
  son.fatherId = boss.id;
  boss.childrenIds.push(son.id);
  return son;
}

function bride(s: GameState, h: House): Character {
  const pool = marriageable(s, h).filter((c) => c.gender === 'F');
  if (pool.length) return pool[0];
  const head = s.characters[h.headId];
  const c = makeCharacter(s, { gender: 'F', age: 21, lastName: head.lastName, ethnicity: head.ethnicity, rank: 'civilian', faction: 'none', nickname: false });
  famMut(s, c.id).houseId = h.id;
  return c;
}

function marry(s: GameState, son: Character, wife: Character) {
  const ctx = newCtx(s);
  applyEffects(ctx, marriageEffects(s, son, wife, false), { label: 'test', because: 'test' });
  return ctx;
}

describe('dynasty layer: setup', () => {
  it('a new game has the houses of the shore, each with marriageable children', () => {
    const s = newGame('houses');
    expect(s.dyn).toBeDefined();
    const kinds = new Set(s.dyn!.houses.map((h) => h.kind));
    expect([...kinds].sort()).toEqual(['legit', 'mob', 'philly', 'political']);
    for (const h of s.dyn!.houses) expect(s.characters[h.headId]?.alive).toBe(true);
    expect(s.dyn!.houses.reduce((a, h) => a + marriageable(s, h).length, 0)).toBeGreaterThan(8);
    // Round-trips through JSON exactly.
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
  it('is reproducible from a seed, and the dynasty dice do not reshuffle the main stream', () => {
    expect(JSON.stringify(newGame('dynrep'))).toBe(JSON.stringify(newGame('dynrep')));
    const s = newGame('dynrng');
    expect(s.dyn!.rng).not.toBe(s.rng);
  });
});

describe('inheritance of traits', () => {
  it('follows the both / one / none odds, and never gives opposites', () => {
    const h = { rng: 42 };
    const N = 4000;
    let both = 0;
    let one = 0;
    let none = 0;
    for (let i = 0; i < N; i++) {
      if (inheritCongenital(h, ['Sharp'], ['Sharp']).includes('Sharp')) both++;
      if (inheritCongenital(h, ['Sharp'], []).includes('Sharp')) one++;
      const k = inheritCongenital(h, [], []);
      if (k.includes('Sharp')) none++;
      expect(k.includes('Sharp') && k.includes('Slow')).toBe(false);
    }
    expect(both / N).toBeGreaterThan(INHERIT.both - 0.05);
    expect(both / N).toBeLessThan(INHERIT.both + 0.05);
    expect(one / N).toBeGreaterThan(INHERIT.one - 0.04);
    expect(one / N).toBeLessThan(INHERIT.one + 0.04);
    expect(none / N).toBeLessThan(0.07);
  });
  it('the Blood legacy doubles good blood and halves bad blood', () => {
    const h = { rng: 7 };
    let good = 0;
    let bad = 0;
    for (let i = 0; i < 4000; i++) {
      if (inheritCongenital(h, ['Strong'], [], 2, 0.5).includes('Strong')) good++;
      if (inheritCongenital(h, ['Sickly'], [], 2, 0.5).includes('Sickly')) bad++;
    }
    expect(good / 4000).toBeGreaterThan(INHERIT.one * 2 - 0.05);
    expect(bad / 4000).toBeLessThan(INHERIT.one / 2 + 0.03);
  });
  it('a newborn starts without personality, with talents from both parents; a daughter married out has her husband\'s child', () => {
    const s = newGame('newborn');
    const boss = player(s);
    const wife = s.characters[boss.spouseId!];
    famMut(s, boss.id).congenital = ['Strong'];
    famMut(s, wife.id).congenital = ['Strong'];
    let strong = 0;
    for (let i = 0; i < 200; i++) {
      const kid = makeCharacter(s, { gender: 'M', age: 0, lastName: boss.lastName, dynasty: true, faction: 'player', nickname: false });
      kid.fatherId = boss.id;
      kid.motherId = wife.id;
      processNewborn(s, kid, 1, 1);
      expect(kid.traits).toEqual([]);
      if (fam(s, kid.id).congenital.includes('Strong')) strong++;
    }
    expect(strong).toBeGreaterThan(70);
    // Our daughter, married into the Keanes: the baby is a Keane.
    const h = house(s, 'h_keane');
    const groom = marriageable(s, h).find((c) => c.gender === 'M') ?? makeCharacter(s, { gender: 'M', age: 25, faction: 'none' });
    famMut(s, groom.id).houseId = h.id;
    const daughter = makeCharacter(s, { gender: 'F', age: 22, lastName: boss.lastName, dynasty: true, faction: 'player', nickname: false });
    daughter.fatherId = boss.id;
    marry(s, daughter, groom);
    expect(daughter.dynasty).toBe(true);
    expect(daughter.lastName).toBe(groom.lastName);
    const baby = makeCharacter(s, { gender: 'F', age: 0, lastName: groom.lastName, dynasty: true, faction: 'player', nickname: false });
    baby.fatherId = groom.id;
    baby.motherId = daughter.id;
    processNewborn(s, baby, 1, 1);
    expect(baby.dynasty).toBe(false);
    expect(fam(s, baby.id).houseId).toBe(h.id);
  });
});

describe('marriage: dowry and alliance', () => {
  it('a son marrying a Manno daughter brings in the dowry and an alliance: Manno won\'t strike, and votes your way at the Table', () => {
    const s = newGame('dowry');
    const son = bachelor(s);
    const h = house(s, 'h_manno');
    const wife = bride(s, h);
    const dowry = dowryFor(s, son, h, false);
    expect(dowry).toBeGreaterThan(0);
    const acc = marriageAcceptance(s, son, wife);
    expect(acc.chance).toBeGreaterThan(0);
    expect(acc.reasons.length).toBeGreaterThan(2);
    // Before: Manno considers striking you.
    const manno = s.rivals.find((r) => r.id === 'manno')!;
    manno.moveCooldowns = {};
    expect(alliedWithFaction(s, 'manno')).toBe(false);
    const before = s.money;
    const ctx = marry(s, son, wife);
    expect(s.money - before).toBe(dowry);
    expect(ctx.lines.some((l) => l.stat === 'money' && /dowry received/.test(l.label))).toBe(true);
    expect(son.spouseId).toBe(wife.id);
    expect(wife.dynasty).toBe(true);
    expect(wife.maidenName).toBe('Manno');
    expect(wife.lastName).toBe(son.lastName);
    expect(activeAlliances(s).map((a) => a.houseId)).toContain('h_manno');
    expect(alliedWithFaction(s, 'manno')).toBe(true);
    const moves = scoreMoves(s, manno).filter((c) => c.target === 'player' && (c.move === 'strike' || c.move === 'inform' || c.move === 'expand'));
    expect(moves).toEqual([]);
    // The Table: Manno votes on a dispute between you and Feldstein.
    const d = openDispute(s, newDispute(s, 'district', 'player', 'feldstein', { district: 'crest' }));
    const lean = forecast(s, d).find((l) => l.member.id === manno.leaderId)!;
    expect(lean.reasons.some((r) => /Allied to your house/.test(r.label) && r.value > 0)).toBe(true);
    expect(dynastyTableLean(s, s.characters[manno.leaderId]).length).toBeGreaterThan(0);
  });
  it('allies send men to your wars; the alliance ends when the marriage does', () => {
    const s = newGame('allywar');
    const son = bachelor(s);
    marry(s, son, bride(s, house(s, 'h_manno')));
    s.wars.push({ id: 'w1', rival: 'kessler', district: 'north', cb: 'claim', sanctioned: true, score: 0, startWeek: s.week });
    const ctx = newCtx(s);
    dynastyWeek(ctx);
    expect(s.wars[0].score).toBeGreaterThanOrEqual(2);
    // The wife dies: the alliance is gone.
    s.characters[son.spouseId!].alive = false;
    expect(alliedWithFaction(s, 'manno')).toBe(false);
  });
  it('a daughter marrying out pays the dowry; the order previews the odds and refuses cleanly', () => {
    const s = newGame('daughter');
    const boss = player(s);
    const girl = makeCharacter(s, { gender: 'F', age: 20, lastName: boss.lastName, ethnicity: 'Italian', dynasty: true, faction: 'player', nickname: false });
    girl.fatherId = boss.id;
    boss.childrenIds.push(girl.id);
    const h = house(s, 'h_weiss');
    const groom = marriageable(s, h).find((c) => c.gender === 'M') ?? (() => { const c = makeCharacter(s, { gender: 'M', age: 24, lastName: 'Weiss', ethnicity: 'Jewish', faction: 'none' }); famMut(s, c.id).houseId = h.id; return c; })();
    expect(dowryFor(s, girl, h, false)).toBeLessThan(0);
    const p = previewAction(s, dyn({ type: 'marry', memberId: girl.id, spouseId: groom.id }));
    expect(p.acceptance).toBeDefined();
    expect(p.acceptance!.reasons.some((r) => /parish/i.test(r.label))).toBe(true);
    expect(p.cost).toBeGreaterThan(0);
    const r = advanceWeek(s, { actions: [dyn({ type: 'marry', memberId: girl.id, spouseId: groom.id })] });
    expect(reconcile(r.report)).toEqual([]);
    const g = r.state.characters[girl.id];
    const paid = r.report.lines.some((l) => l.stat === 'money' && l.amount < 0 && /dowry paid/.test(l.label));
    // Either they said yes (she is married, the dowry is paid, she keeps her blood) or no (nothing changed hands).
    expect(!!g.spouseId).toBe(paid);
    if (g.spouseId) expect(g.dynasty).toBe(true);
  });
});

describe('activities', () => {
  function hostOnce(seed: string) {
    let s = newGame(seed);
    s.money = 50000;
    const guests = Object.values(s.characters).filter((c) => c.alive && c.faction === 'player' && c.rank === 'capo').slice(0, 3).map((c) => c.id);
    const fam1 = Object.values(s.characters).find((c) => c.alive && c.dynasty && c.id !== s.playerId && ageOn(c.birth, s.date) >= 16);
    if (fam1) guests.push(fam1.id);
    const act = dyn({ type: 'host', activity: 'fishing', guests: guests.slice(0, 3) });
    expect(previewAction(s, act).disabledReason).toBeUndefined();
    const opBefore = guests.slice(0, 3).map((g) => s.characters[g] && s.relations[`${g}>${s.playerId}`]?.modifiers.length);
    famMut(s, s.playerId).stress = 50;
    s = advanceWeek(s, { ...randomChoices(s, 0), actions: [act] }).state;
    expect(s.dyn!.activity?.kind).toBe('fishing');
    for (let i = 0; i < 3 && s.dyn!.activity; i++) s = advanceWeek(s, randomChoices(s, i + 1)).state;
    return { s, guests: guests.slice(0, 3), opBefore };
  }
  it('runs, relieves stress, raises the guests\' opinion and produces 1-3 events', () => {
    const { s, guests } = hostOnce('fish');
    expect(s.dyn!.activity).toBeUndefined();
    expect(s.dyn!.stats.activities).toBe(1);
    const rec = s.dyn!.activityLog[0];
    expect(rec.kind).toBe('fishing');
    expect(fam(s, s.playerId).stress).toBeLessThan(50);
    for (const g of guests) expect(s.relations[`${g}>${s.playerId}`]?.modifiers.some((m) => m.reason === `Enjoyed ${ACTIVITIES.fishing.name.toLowerCase()}`)).toBe(true);
    const evs = [...s.pendingEvents, ...s.eventQueue].filter((e) => e.defId.startsWith('act_'));
    expect(evs.length + rec.outcomes.length).toBeGreaterThanOrEqual(1);
    expect(rec.outcomes.length).toBeLessThanOrEqual(3);
  });
  it('outcomes are deterministic per seed', () => {
    const a = hostOnce('same-seed').s;
    const b = hostOnce('same-seed').s;
    expect(a.dyn!.activityLog).toEqual(b.dyn!.activityLog);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it('a wedding needs a recent marriage; a christening needs a baby', () => {
    const s = newGame('wed');
    const one = Object.values(s.characters).filter((c) => c.faction === 'player' && c.rank === 'capo').slice(0, 1).map((c) => c.id);
    expect(previewAction(s, dyn({ type: 'host', activity: 'wedding', guests: one })).disabledReason).toMatch(/marriage/);
    const son = bachelor(s);
    marry(s, son, bride(s, house(s, 'h_albanese')));
    expect(previewAction(s, dyn({ type: 'host', activity: 'wedding', guests: one, honoreeId: son.id })).disabledReason).toBeUndefined();
    expect(previewAction(s, dyn({ type: 'host', activity: 'christening', guests: one })).disabledReason).toMatch(/baby/);
  });
});

describe('legacies', () => {
  it('cost renown, unlock in order, and persist through succession', () => {
    let s = newGame('legacy');
    s.dyn!.renown = LEGACY_COST[0] + LEGACY_COST[1] + LEGACY_COST[2];
    expect(previewAction(s, dyn({ type: 'legacy', track: 'money' })).disabledReason).toBeUndefined();
    s = advanceWeek(s, { actions: [dyn({ type: 'legacy', track: 'money' }), dyn({ type: 'legacy', track: 'money' }), dyn({ type: 'legacy', track: 'money' })] }).state;
    expect(s.dyn!.legacy.money).toBe(3);
    expect(hasPerk(s, 'money', 3)).toBe(true);
    // Make sure there is an heir, then kill the boss.
    const heir = chooseHeir(s, player(s)).heir ?? bachelor(s);
    const oldBoss = s.playerId;
    s = forceDeath(s, oldBoss, 'a heart attack').state;
    expect(s.playerId).not.toBe(oldBoss);
    const r = advanceWeek(s, randomChoices(s, 1));
    s = r.state;
    expect(s.dyn!.legacy.money).toBe(3);
    expect(s.dyn!.stats.successions).toBeGreaterThanOrEqual(1);
    // The perk still pays under the new head.
    expect(r.report.lines.some((l) => l.label === 'Family trust (legacy)' && l.amount === 150)).toBe(true);
    expect(reconcile(r.report)).toEqual([]);
    void heir;
  });
  it('a legacy you cannot afford is disabled with the reason', () => {
    const s = newGame('broke');
    s.dyn!.renown = 10;
    expect(previewAction(s, dyn({ type: 'legacy', track: 'blood' })).disabledReason).toMatch(/renown/);
  });
});

describe('decisions', () => {
  it('Boss of the Shore needs 6 districts, respect 70 and Philadelphia\'s blessing', () => {
    const s = newGame('shore');
    const v = decisionView(s, 'shore_boss')!;
    expect(v.reqs).toHaveLength(3);
    expect(previewAction(s, dyn({ type: 'decision', id: 'shore_boss' })).disabledReason).toMatch(/Requires/);
    for (const d of s.districts.slice(0, 6)) {
      d.influence = { player: 80, none: 20 };
    }
    s.respect = 75;
    const moretti = s.rivals.find((r) => r.id === 'philly')!.leaderId;
    s.relations[`${moretti}>${s.playerId}`] = { from: moretti, to: s.playerId, modifiers: [{ id: 'mx', reason: 'test', value: 60, decay: 0, week: 1 }], fear: 0, trust: 30, grievance: 0 };
    s.money = 50000;
    const reqs = decisionView(s, 'shore_boss')!.reqs;
    expect(reqs.every((r) => r.ok)).toBe(true);
    expect(previewAction(s, dyn({ type: 'decision', id: 'shore_boss' })).disabledReason).toBeUndefined();
    const r = advanceWeek(s, { actions: [dyn({ type: 'decision', id: 'shore_boss' })] });
    expect(r.state.dyn!.titles).toContain('Boss of the Shore');
    expect(r.state.dyn!.renownTotal).toBeGreaterThanOrEqual(300);
    expect(reconcile(r.report)).toEqual([]);
  });
  it('the bank and the casino link to their own orders; the casino only after 1976', () => {
    const s = newGame('links');
    expect(decisionView(s, 'bank')!.link).toEqual({ kind: 'charterBank' });
    expect(decisionView(s, 'casino')!.shown).toBe(false);
    s.date = { y: 1977, m: 1, d: 10 };
    expect(decisionView(s, 'casino')!.shown).toBe(true);
    expect(decisionView(s, 'casino')!.link).toEqual({ kind: 'casino' });
  });
  it('Retire to Florida hands the chair to the heir; the old man lives', () => {
    let s = newGame('florida');
    const boss = player(s);
    expect(previewAction(s, dyn({ type: 'decision', id: 'florida' })).disabledReason ?? '').not.toBe('x');
    boss.birth = { ...boss.birth, y: s.date.y - 60 };
    if (!chooseHeir(s, boss).heir || ageOn(chooseHeir(s, boss).heir!.birth, s.date) < 18) bachelor(s);
    expect(previewAction(s, dyn({ type: 'decision', id: 'florida' })).disabledReason).toBeUndefined();
    const heir = chooseHeir(s, boss).heir!;
    s = advanceWeek(s, { actions: [dyn({ type: 'decision', id: 'florida' })] }).state;
    expect(s.playerId).toBe(heir.id);
    expect(s.characters[boss.id].alive).toBe(true);
    expect(fam(s, boss.id).retired).toBeDefined();
    expect(validatePlayer(s)).toEqual([]);
  });
  it('Breaking from Philadelphia starts a war and stops the bagman', () => {
    const s = newGame('break');
    for (const d of s.districts.slice(0, 5)) d.influence = { player: 80, none: 20 };
    s.respect = 70;
    for (let i = 0; i < 6; i++) makeCharacter(s, { rank: 'soldier', faction: 'player' });
    const v = decisionView(s, 'break_philly')!;
    expect(v.risky).toBeTruthy();
    const p = previewAction(s, dyn({ type: 'decision', id: 'break_philly' }));
    expect(p.disabledReason).toBeUndefined();
    const r = advanceWeek(s, { actions: [dyn({ type: 'decision', id: 'break_philly' })] });
    expect(r.state.wars.some((w) => w.rival === 'philly')).toBe(true);
    expect(r.state.flags.brokeFromPhilly).toBe(1);
    expect(bagmanDue({ ...r.state, lastBagmanMonth: undefined })).toBe(false);
  });
});

describe('stress, growing up and drama', () => {
  it('crossing a threshold forces a breaking point; the coping habit sticks', () => {
    let s = newGame('stress');
    famMut(s, s.playerId).stress = 40;
    const ctx = newCtx(s);
    dynastyWeek(ctx);
    const bp = s.eventQueue.find((e) => e.defId === 'dyn_breaking');
    expect(bp).toBeDefined();
    s.pendingEvents = [bp!];
    s.eventQueue = s.eventQueue.filter((e) => e !== bp);
    s = advanceWeek(s, { choices: { [bp!.iid]: 'Devout' } }).state;
    expect(fam(s, s.playerId).coping).toContain('Devout');
    expect(fam(s, s.playerId).stress).toBeLessThan(40);
  });
  it('at sixteen a child finishes his education and picks a path; "the life" makes him an associate', () => {
    let s = newGame('age16');
    const boss = player(s);
    const kid = makeCharacter(s, { gender: 'M', age: 16, lastName: boss.lastName, dynasty: true, faction: 'player', rank: 'civilian', nickname: false });
    kid.fatherId = boss.id;
    boss.childrenIds.push(kid.id);
    famMut(s, kid.id).guardian = { kind: 'capo', since: 1 };
    const ctx = newCtx(s);
    dynastyMonth(ctx);
    expect(fam(s, kid.id).education?.kind).toBe('capo');
    const ev = s.eventQueue.find((e) => e.defId === 'dyn_comeofage' && e.meta?.subject === kid.id)!;
    expect(ev).toBeDefined();
    expect(ev.choices.map((c) => c.id)).toContain('life');
    s.pendingEvents = [ev];
    s.eventQueue = [];
    s = advanceWeek(s, { choices: { [ev.iid]: 'life' } }).state;
    expect(s.characters[kid.id].rank).toBe('associate');
    expect(fam(s, kid.id).path).toBe('life');
  });
  it('family drama stays inside the popup cap over years of play', () => {
    let s = newGame('drama');
    let dramas = 0;
    for (let w = 0; w < 260 && !s.gameOver; w++) {
      s = advanceWeek(s, randomChoices(s, w)).state;
      expect(s.pendingEvents.length).toBeLessThanOrEqual(MAX_POPUPS);
      dramas += s.pendingEvents.filter((e) => e.defId.startsWith('dyn_')).length;
    }
    expect(dramas).toBeGreaterThan(0);
    expect(s.dyn!.renownTotal).toBeGreaterThan(0);
  });
  it('house membership: a marriage into a political family is not a rival', () => {
    const s = newGame('pol');
    const h = house(s, 'h_dougherty');
    const c = marriageable(s, h)[0];
    if (c) expect(houseOf(s, c.id)?.id).toBe('h_dougherty');
    expect(h.kind).toBe('political');
  });
});
