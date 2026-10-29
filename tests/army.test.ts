import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/newGame';
import { advanceWeek } from '../src/engine/engine';
import { newCtx, reconcile } from '../src/engine/ledger';
import { addOpinion } from '../src/engine/relations';
import { previewAction } from '../src/engine/actions';
import { envelopeSize } from '../src/engine/events';
import { upgradeSave } from '../src/engine/upgradeSave';
import {
  allyOdds, armyMeter, armyWeek, battleOdds, battlePlan, campaignPressure, ensureCampaign, levyView, pathFor, resolveBattle, startCampaign, weeklyBill, willingness,
} from '../src/engine/army';
import { ensureArmy } from '../src/engine/armyState';
import type { GameState } from '../src/engine/types';

function weeks(s: GameState, n: number): GameState {
  for (let i = 0; i < n && !s.gameOver; i++) s = advanceWeek(s, {}).state;
  return s;
}
function phillyWar(seed: string): { s: GameState; warId: string } {
  const s = weeks(newGame(seed), 6);
  const w = startCampaign(newCtx(s), 'philly', 'districts', 'a test')!;
  return { s, warId: w.id };
}

describe('raising the troops', () => {
  it('calls up the crews; the men under arms cost upkeep and their take, and draw heat', () => {
    let s = weeks(newGame('army-raise'), 4);
    s.money = 50000;
    const avail = levyView(s).reduce((a, c) => a + c.available, 0);
    expect(avail).toBeGreaterThan(3);
    s = advanceWeek(s, { actions: [{ kind: 'army', op: { op: 'raise', holder: 'all' } }] }).state;
    const raised = levyView(s).reduce((a, c) => a + c.raised, 0);
    expect(raised).toBeGreaterThan(0);
    expect(raised).toBeLessThanOrEqual(avail);
    const bill = weeklyBill(s);
    expect(bill.upkeep).toBeGreaterThan(0);
    expect(bill.incomeLoss).toBeGreaterThan(0);
    const r = advanceWeek(s, {});
    const lines = r.report.lines;
    expect(lines.some((l) => l.stat === 'money' && l.amount < 0 && /under arms: upkeep/.test(l.label))).toBe(true);
    expect(lines.some((l) => l.stat === 'money' && l.amount < 0 && /off their rackets/.test(l.label))).toBe(true);
    expect(reconcile(r.report)).toEqual([]);
    expect(r.state.army!.weariness).toBeGreaterThan(0);
    // Sent home: the bill stops.
    const home = advanceWeek(r.state, { actions: [{ kind: 'army', op: { op: 'disband', holder: 'all' } }] }).state;
    expect(weeklyBill(home).upkeep).toBe(0);
  });

  it('a capo who does not love you sends fewer men, and stalls', () => {
    const s = weeks(newGame('army-loyal'), 3);
    const crew = levyView(s).find((c) => c.capoId && c.available >= 2)!;
    const before = willingness(s, crew.holder).f;
    addOpinion(s, crew.capoId!, s.playerId, 'Test: hates the boss', -100, 0);
    const after = willingness(s, crew.holder);
    expect(after.f).toBeLessThan(before);
    expect(after.stall).toBe('never');
    s.money = 50000;
    const n = advanceWeek(s, { actions: [{ kind: 'army', op: { op: 'raise', holder: crew.holder } }] }).state;
    const l = n.army!.levies[crew.holder];
    expect(l.stalled).toBe(true);
    expect(l.n).toBeLessThan(levyView(n).find((c) => c.holder === crew.holder)!.available);
  });

  it('hired muscle and safehouses are weekly bills; the meter shows during a war', () => {
    const { s, warId } = phillyWar('army-hire');
    s.money = 50000;
    expect(armyMeter(s).show).toBe(true);
    expect(armyMeter(s).enemy?.rival).toBe('philly');
    const n = advanceWeek(s, { actions: [{ kind: 'army', op: { op: 'hire', band: 'shooters' } }, { kind: 'army', op: { op: 'safehouses', on: true } }] }).state;
    expect(n.army!.hired.length).toBe(1);
    expect(n.army!.safehouses).toBe(true);
    expect(weeklyBill(n).hired).toBeGreaterThan(0);
    expect(weeklyBill(n).safehouses).toBeGreaterThan(0);
    expect(n.wars.some((w) => w.id === warId)).toBe(true);
  });
});

describe('allies: the call to arms', () => {
  it('weighs the offer, pacts, their own wars and the odds; accepted men join, refused ones do not', () => {
    const { s, warId } = phillyWar('army-allies');
    const money = allyOdds(s, 'kessler', warId, 'money').chance;
    const favor = allyOdds(s, 'kessler', warId, 'favor').chance;
    expect(money).toBeGreaterThan(favor);
    // A pact makes them far likelier.
    ensureArmy(s).pacts.push({ ally: 'kessler', since: s.week, until: s.week + 52 });
    expect(allyOdds(s, 'kessler', warId, 'favor').chance).toBeGreaterThan(favor);
    // Manno sits at Philadelphia's table: a harder ask than Kessler, all else equal.
    const manno = allyOdds(s, 'manno', warId, 'money');
    expect(manno.reasons.some((r) => /Table/.test(r.label) && r.value < 0)).toBe(true);
    // The preview carries the same odds, and a refusal blocks a re-ask for a while.
    const p = previewAction(s, { kind: 'army', op: { op: 'ask', ally: 'kessler', warId, offer: 'favor' } });
    expect(p.acceptance!.chance).toBeCloseTo(allyOdds(s, 'kessler', warId, 'favor').chance);
    s.flags[`armyAsk_manno_${warId}`] = s.week;
    expect(previewAction(s, { kind: 'army', op: { op: 'ask', ally: 'manno', warId, offer: 'money' } }).disabledReason).toMatch(/said no/);
    // A New York family at war with you will not come.
    s.nyc = { rng: 1, crews: [], blessed: {}, opinion: {}, grievance: {}, war: ['marchetti'], taken: [], stats: { earned: 0, tribute: 0, hearings: 0, sitdowns: 0 }, log: [] };
    expect(previewAction(s, { kind: 'army', op: { op: 'ask', ally: 'nyc:marchetti', warId, offer: 'money' } }).disabledReason).toMatch(/war with them/);
  });

  it('an ally that says yes sends men who count in the battle, shown apart from yours', () => {
    let { s, warId } = phillyWar('army-allyjoin');
    s.money = 80000;
    ensureArmy(s).pacts.push({ ally: 'kessler', since: s.week, until: s.week + 52 });
    let joined = false;
    for (let i = 0; i < 8 && !joined; i++) {
      s.flags[`armyAsk_kessler_${warId}`] = -99;
      s = advanceWeek(s, { actions: [{ kind: 'army', op: { op: 'ask', ally: 'kessler', warId, offer: 'cut' } }] }).state;
      joined = !!s.army!.commits.some((c) => c.ally === 'kessler' && c.warId === warId);
      if (!s.wars.some((w) => w.id === warId)) break;
    }
    expect(joined).toBe(true);
    expect(armyMeter(s).allies).toBeGreaterThan(0);
    const b = { warId, district: 'downtown', attacker: 'philly' as const, enemyMen: 15 };
    const withAllies = battlePlan(s, b, 'meet');
    const alone = (() => { const t = structuredClone(s); t.army!.commits = []; return battlePlan(t, b, 'meet'); })();
    expect(withAllies.odds).toBeGreaterThan(alone.odds);
    expect(withAllies.commanderRisk).toBeLessThan(alone.commanderRisk);
  });
});

describe('Philadelphia comes down the causeway', () => {
  it('a boss in good standing is left alone; short envelopes, insults, heat and weakness bring them', () => {
    const s = weeks(newGame('army-philly'), 8);
    expect(campaignPressure(s).value).toBeLessThan(55);
    const mor = s.rivals.find((r) => r.id === 'philly')!.leaderId;
    addOpinion(s, mor, s.playerId, 'Test: insulted', -120, 0);
    s.flags.bag_short = 1;
    s.heat.family = 95;
    const p = campaignPressure(s);
    expect(p.value).toBeGreaterThanOrEqual(55);
    expect(p.goal).toBe('tribute');
    let started = false;
    for (let w = 0; w < 120 && !started; w++) {
      s.week = 22 + w;
      armyWeek(newCtx(s));
      started = s.wars.some((x) => x.rival === 'philly' && x.by === 'philly');
    }
    expect(started).toBe(true);
    const war = s.wars.find((x) => x.rival === 'philly')!;
    const c = s.army!.camps[war.id];
    expect(c.goal).toBe('tribute');
    expect(c.path[0]).toBe('causeway');
    expect(c.enemyMen).toBeGreaterThan(levyView(s).reduce((a, x) => a + x.available, 0));
  });

  it('their road runs from the causeway to the heart of the island', () => {
    const s = newGame('army-road');
    expect(pathFor(s, 'philly')).toEqual(['causeway', 'downtown', 'pacific']);
    expect(pathFor(s, 'kessler')[0]).toBe('north');
  });

  it('they mass men and the boss gets a decision: meet them, lead, hit first, fall back', () => {
    let { s, warId } = phillyWar('army-mass');
    let ev;
    for (let i = 0; i < 6 && !ev; i++) {
      s = advanceWeek(s, {}).state;
      ev = s.pendingEvents.find((e) => e.defId === 'war_battle');
    }
    expect(ev).toBeDefined();
    expect(ev!.choices.map((c) => c.id)).toEqual(['meet', 'lead', 'strike', 'fallback']);
    expect(ev!.text).toMatch(/massing/);
    expect(ev!.choices[0].detail).toMatch(/to win/);
    const district = s.army!.pending[0].district;
    const before = s.districts.find((d) => d.id === district)!.influence.player ?? 0;
    const r = advanceWeek(s, { choices: { [ev!.iid]: 'fallback' } });
    expect(r.state.army!.camps[warId].occupied[district]).toBe('philly');
    expect(r.state.districts.find((d) => d.id === district)!.influence.player ?? 0).toBeLessThan(before + 1);
    expect(reconcile(r.report)).toEqual([]);
  });
});

describe('battles', () => {
  it('the odds rise with your strength and fall with theirs', () => {
    let prev = 0;
    for (const ours of [5, 20, 40, 60, 90, 140]) { const o = battleOdds(ours, 60); expect(o).toBeGreaterThanOrEqual(prev); prev = o; }
    expect(battleOdds(60, 30)).toBeGreaterThan(battleOdds(60, 90));
    const { s, warId } = phillyWar('army-mono');
    const b = { warId, district: 'downtown', attacker: 'philly' as const, enemyMen: 20 };
    const low = battlePlan(s, b, 'meet');
    const t = structuredClone(s);
    for (const c of levyView(t)) ensureArmy(t).levies[c.holder] = { n: c.available, asked: c.available, since: t.week };
    ensureArmy(t).hired.push({ band: 'shooters', men: 4, since: t.week });
    const high = battlePlan(t, b, 'meet');
    expect(high.ours).toBeGreaterThan(low.ours);
    expect(high.odds).toBeGreaterThan(low.odds);
    expect(battlePlan(s, { ...b, enemyMen: 40 }, 'meet').odds).toBeLessThan(low.odds);
  });

  it('a battle is deterministic: the same state and roll give the same result', () => {
    const { s, warId } = phillyWar('army-det');
    for (const c of levyView(s)) ensureArmy(s).levies[c.holder] = { n: c.available, asked: c.available, since: s.week };
    const b = { id: 'btX', warId, district: 'downtown', attacker: 'philly' as const, enemyMen: 18, week: s.week, due: s.week };
    const a1 = structuredClone(s); const a2 = structuredClone(s);
    const r1 = resolveBattle(newCtx(a1), b, 'meet', 0.5)!;
    const r2 = resolveBattle(newCtx(a2), b, 'meet', 0.5)!;
    expect(r1).toEqual(r2);
    expect(JSON.stringify(a1)).toBe(JSON.stringify(a2));
    // A roll under the odds wins; over loses.
    const w = resolveBattle(newCtx(structuredClone(s)), b, 'meet', 0)!;
    const l = resolveBattle(newCtx(structuredClone(s)), b, 'meet', 0.999)!;
    expect(w.won).toBe(true);
    expect(l.won).toBe(false);
    expect(l.ourLost).toBeGreaterThanOrEqual(w.ourLost);
  });

  it('big battles without allies are deadlier for the men leading, and it is shown before you commit', () => {
    const { s, warId } = phillyWar('army-risk');
    const big = battlePlan(s, { warId, district: 'pacific', attacker: 'philly', enemyMen: 30 }, 'lead');
    const small = battlePlan(s, { warId, district: 'pacific', attacker: 'philly', enemyMen: 4 }, 'lead');
    expect(big.big).toBe(true);
    expect(big.bossRisk).toBeGreaterThan(small.bossRisk);
    const t = structuredClone(s);
    ensureArmy(t).commits.push({ id: 'c1', ally: 'kessler', warId, men: 8, sent: 8, offer: 'favor', price: 0, since: t.week, until: t.week + 10 });
    expect(battlePlan(t, { warId, district: 'pacific', attacker: 'philly', enemyMen: 30 }, 'lead').bossRisk).toBeLessThan(big.bossRisk);
    // Not leading, the boss is far safer.
    expect(battlePlan(s, { warId, district: 'pacific', attacker: 'philly', enemyMen: 30 }, 'meet').bossRisk).toBeLessThan(big.bossRisk);
  });

  it('losses are combat outcomes: nobody changes sides (the no-handover rule)', () => {
    const { s, warId } = phillyWar('army-nohand');
    for (const c of levyView(s)) ensureArmy(s).levies[c.holder] = { n: c.available, asked: c.available, since: s.week };
    const factions = Object.fromEntries(Object.values(s.characters).map((c) => [c.id, c.faction]));
    const ctx = newCtx(s);
    for (let i = 0; i < 6 && s.wars.length && !s.gameOver; i++) resolveBattle(ctx, { id: `bt${i}`, warId, district: 'downtown', attacker: 'philly', enemyMen: 25, week: s.week, due: s.week }, 'meet', 0.99);
    for (const c of Object.values(s.characters)) if (factions[c.id] !== undefined) expect(c.faction, `${c.firstName} ${c.lastName}`).toBe(factions[c.id]);
  });
});

describe('war score and peace', () => {
  it('battles move the score and the ground; total defeat imposes their terms', () => {
    const s = weeks(newGame('army-terms'), 6);
    const w = startCampaign(newCtx(s), 'philly', 'install', 'a test')!;
    for (const c of levyView(s)) ensureArmy(s).levies[c.holder] = { n: c.available, asked: c.available, since: s.week };
    const ctx = newCtx(s);
    const env = envelopeSize(s);
    resolveBattle(ctx, { id: 'b1', warId: w.id, district: 'causeway', attacker: 'philly', enemyMen: 10, week: s.week, due: s.week }, 'meet', 0);
    expect(w.score).toBeGreaterThan(0);
    resolveBattle(ctx, { id: 'b2', warId: w.id, district: 'causeway', attacker: 'philly', enemyMen: 10, week: s.week, due: s.week }, 'meet', 0.999);
    expect(s.army!.camps[w.id].occupied.causeway).toBe('philly');
    w.score = -100;
    armyWeek(ctx);
    expect(s.wars.some((x) => x.id === w.id)).toBe(false);
    expect(s.army!.overseerUntil).toBeGreaterThan(s.week);
    expect(envelopeSize(s)).toBeGreaterThan(env);
  });

  it('at +60 they want out; accepting ends the war in your favour', () => {
    let { s, warId } = phillyWar('army-offer');
    const w = s.wars.find((x) => x.id === warId)!;
    w.score = 65;
    ensureCampaign(s, w);
    s = advanceWeek(s, {}).state;
    const ev = s.pendingEvents.find((e) => e.defId === 'war_offer');
    expect(ev).toBeDefined();
    const n = advanceWeek(s, { choices: { [ev!.iid]: 'accept' } }).state;
    expect(n.wars.some((x) => x.id === warId)).toBe(false);
    expect(n.army!.camps[warId]).toBeUndefined();
  });

  it('no bagman comes while you are at war with Philadelphia', async () => {
    const { bagmanDue } = await import('../src/engine/events');
    const { s } = phillyWar('army-bag');
    s.lastBagmanMonth = undefined;
    expect(bagmanDue(s)).toBe(false);
  });
});

describe('saves', () => {
  it('round-trips through JSON, and upgradeSave leaves a save with an army as it is', () => {
    let { s } = phillyWar('army-save');
    s.money = 60000;
    s = advanceWeek(s, { actions: [{ kind: 'army', op: { op: 'raise', holder: 'all' } }, { kind: 'army', op: { op: 'hire', band: 'toughs' } }] }).state;
    s = weeks(s, 3);
    expect(s.army).toBeDefined();
    const json = JSON.stringify(s);
    expect(JSON.stringify(JSON.parse(json))).toBe(json);
    expect(JSON.stringify(upgradeSave(JSON.parse(json)))).toBe(json);
  });

  it('a save from before the army loads unchanged, and a quiet game makes no army', () => {
    const s = weeks(newGame('army-old'), 5);
    const json = JSON.stringify(s);
    expect(JSON.stringify(upgradeSave(JSON.parse(json)))).toBe(json);
    if (!s.wars.length) expect(s.army).toBeUndefined();
  });
});

describe('the screens', () => {
  it('the Army panel and the War Room render the levies, the meter, the front map and the battle massing', async () => {
    const { createElement } = await import('react');
    const { renderToString } = await import('react-dom/server');
    const { ArmyPanel } = await import('../src/ui/army/ArmyPanel');
    const { WarRoom } = await import('../src/ui/intrigue/WarRoom');
    let { s } = phillyWar('army-ui');
    for (let i = 0; i < 6 && !s.army?.pending.length; i++) s = advanceWeek(s, {}).state;
    const army = renderToString(createElement(ArmyPanel, { s }));
    expect(army).toContain('data-testid="levy-table"');
    expect(army).toContain('data-testid="army-meter-line"');
    const room = renderToString(createElement(WarRoom, { s }));
    expect(room).toContain('data-testid="front-map"');
    expect(room).toContain('data-testid="war-score-bar"');
    if (s.army?.pending.length) expect(room).toContain('data-testid="pending-battle"');
  });

  it('one count of men on every screen: under arms from the levies, the enemy from the one estimate (never the hidden truth)', async () => {
    const { createElement } = await import('react');
    const { renderToString } = await import('react-dom/server');
    const { WarRoom } = await import('../src/ui/intrigue/WarRoom');
    const { armyMeter, enemyInField } = await import('../src/engine/army');
    const { s } = phillyWar('army-count');
    const w = s.wars[0];
    const m = armyMeter(s);
    const e = enemyInField(s, w.rival, w.id);
    expect(m.enemy && `${m.enemy.lo === m.enemy.hi ? m.enemy.lo : `${m.enemy.lo}–${m.enemy.hi}`}${m.enemy.fogged ? '?' : ''}`).toBe(e.text);
    const room = renderToString(createElement(WarRoom, { s })).replace(/<!-- -->/g, '');
    expect(room).toContain(`Your men under arms: ${m.raised} of ${m.available}`);
    expect(room).not.toContain('men left as far as you know');
    if (s.army?.camps[w.id]) expect(room).toContain(`about ${e.text} men in the field`);
  });
});
