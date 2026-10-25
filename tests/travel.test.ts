import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/newGame';
import { advanceWeek, cloneState } from '../src/engine/engine';
import { previewAction } from '../src/engine/actions';
import { player } from '../src/engine/characters';
import { newCtx } from '../src/engine/ledger';
import {
  actingBoss, awayActMult, awayCapoBias, quoteTrip, startTrip, suggestPlan, travellers,
} from '../src/engine/travel';
import { DESTS, legDays } from '../src/engine/travelDests';
import { discoveryChance } from '../src/engine/trips';
import { captureChance, manhuntGrowth, sightingChance, wantedFor, fleeQuote } from '../src/engine/fugitive';
import { bossAway, ensureTravel, fugitiveOf, isAway } from '../src/engine/travelState';
import type { GameState, PlayerAction } from '../src/engine/types';
import type { TripPlan } from '../src/engine/travelState';

function rich(seed = 'travel'): GameState {
  const s = newGame(seed);
  s.money = 200000;
  return s;
}

function trip(plan: TripPlan): PlayerAction {
  return { kind: 'travel', op: { type: 'trip', plan } };
}

function lover(s: GameState): string {
  const b = player(s);
  const id = 'cLover';
  s.characters[id] = { ...s.characters[b.spouseId!], id, firstName: 'Dolores', lastName: 'Vane', maidenName: undefined, spouseId: undefined, dynasty: false, faction: 'none', childrenIds: [] };
  ensureTravel(s).friends[b.id] = [id];
  return id;
}

describe('travel: modes, time and cost', () => {
  it('each mode has its own speed and fare (plane fast and dear, bus slow and cheap, ship slowest)', () => {
    const s = rich();
    const base = suggestPlan(s, s.playerId, 'miamibeach');
    base.guests = [];
    const q = (mode: TripPlan['mode'], extra: Partial<TripPlan> = {}) => quoteTrip(s, { ...base, mode, ...extra });
    const plane = q('plane');
    const train = q('train');
    const bus = q('bus');
    const drivers = (s.characters ? Object.values(s.characters) : []).filter((c) => c.faction === 'player' && (c.rank === 'soldier' || c.rank === 'associate')).slice(0, 1).map((c) => c.id);
    const cars = q('cars', { cars: 1, driverIds: drivers });
    expect(plane.out).toBe(1);
    expect(train.out).toBeGreaterThan(plane.out);
    expect(bus.out).toBeGreaterThan(train.out);
    expect(cars.out).toBeGreaterThanOrEqual(train.out);
    const fareOf = (x: typeof plane) => x.lines[0].amount;
    expect(fareOf(plane)).toBeGreaterThan(fareOf(train));
    expect(fareOf(train)).toBeGreaterThan(fareOf(bus));
    expect(plane.risks.sighting).toBeGreaterThan(bus.risks.sighting);
    expect(cars.risks.tail).toBeGreaterThan(plane.risks.tail);
    // Europe: a liner takes over a week, a plane two days.
    expect(legDays('ship', DESTS.oldcountry.miles)).toBeGreaterThan(7);
    expect(legDays('plane', DESTS.oldcountry.miles)).toBe(2);
    expect(quoteTrip(s, { ...base, destId: 'oldcountry', mode: 'bus', days: ['relatives', 'village', 'vatican'] }).block).toMatch(/road|rail/i);
  });

  it('Havana is open in 1960 only', () => {
    const s = rich();
    const plan: TripPlan = { purpose: 'vacation', leaderId: s.playerId, destId: 'havana', mode: 'plane', tier: 'first', guests: [], days: ['tropicana', 'varadero', 'cigars'] };
    expect(quoteTrip(s, plan).block).toBeUndefined();
    s.date = { y: 1961, m: 3, d: 1 };
    s.week += 45;
    expect(quoteTrip(s, plan).block).toMatch(/Havana/);
  });

  it('a trip takes real days, costs real money, and comes home', () => {
    let s = rich();
    const plan = suggestPlan(s, s.playerId, 'oldcountry');
    const q = quoteTrip(s, plan);
    expect(q.block).toBeUndefined();
    const r = advanceWeek(s, { actions: [trip(plan)] });
    s = r.state;
    expect(r.report.lines.some((l) => l.stat === 'money' && l.amount === -q.cost && /Vacation: Rome/.test(l.label))).toBe(true);
    expect(travellers(s).length).toBe(1);
    let weeks = 1;
    while (travellers(s).length && weeks < 6) { s = advanceWeek(s).state; weeks++; }
    expect(weeks).toBeGreaterThanOrEqual(q.weeks);
    expect(ensureTravel(s).history.length).toBe(1);
    expect(s.travel!.trips[0].journal.some((j) => /Day 1/.test(j.text))).toBe(true);
  });
});

describe('travel: the boss is away', () => {
  it('direct orders need the boss at home; capos act more and lean toward skimming', () => {
    let s = rich();
    const plan = suggestPlan(s, s.playerId, 'oldcountry');
    plan.mode = 'ship';
    s = advanceWeek(s, { actions: [trip(plan)] }).state;
    expect(bossAway(s)).toBe(true);
    const p = previewAction(s, { kind: 'order', key: 'shakedown', via: 'direct' });
    expect(p.disabledReason).toMatch(/away/);
    expect(awayActMult(s)).toBeGreaterThan(1);
    const w: Record<string, number> = { skim: 0, beef: 0.2, expand: 1 };
    const capo = Object.values(s.characters).find((c) => c.rank === 'capo' && !c.traits.includes('Loyal-to-a-fault'))!;
    awayCapoBias(s, capo, w);
    expect(w.beef).toBeGreaterThan(0.2);
    expect(w.expand).toBeGreaterThan(1);
  });

  it('the underboss or heir acts while the boss is away, and reports when he is back', () => {
    let s = rich('acting');
    s.legal = { stage: 'indicted', personId: s.playerId, defense: 0, since: s.week };
    player(s).evidence = 70;
    s = advanceWeek(s, { actions: [{ kind: 'travel', op: { type: 'flee', plan: { personId: s.playerId, dest: 'oldcountry', mode: 'plane', papers: true } } }] }).state;
    expect(fugitiveOf(s, s.playerId)).toBeDefined();
    const k = actingBoss(s)!;
    expect(k).toBeDefined();
    for (let i = 0; i < 12; i++) s = advanceWeek(s).state;
    const a = s.travel!.acting!;
    expect(a.id).toBe(k.id);
    expect(a.weeks).toBeGreaterThanOrEqual(10);
    expect(a.deeds.length).toBeGreaterThan(0);
    // The crew got used to him.
    const crewMan = Object.values(s.characters).find((c) => c.faction === 'player' && c.id !== k.id && c.id !== s.playerId && c.rank !== 'civilian')!;
    expect(s.relations[`${crewMan.id}>${k.id}`]?.modifiers.some((m) => m.reason === 'Ran things while the boss was away') ?? s.relations[`${crewMan.id}->${k.id}`]?.modifiers.some((m) => m.reason === 'Ran things while the boss was away')).toBe(true);
  });
});

describe('vacations', () => {
  it('itinerary events are deterministic per seed', () => {
    const run = () => {
      let s = rich('same-seed');
      const plan = suggestPlan(s, s.playerId, 'miamibeach');
      s = advanceWeek(s, { actions: [trip(plan)] }).state;
      for (let i = 0; i < 3; i++) s = advanceWeek(s).state;
      return JSON.stringify(s.travel!.trips.map((t) => t.journal));
    };
    const a = run();
    expect(a).toBe(run());
    expect(a).toMatch(/Day 3/);
  });

  it('the wife finds out far more often when she and the other woman are on the same trip', () => {
    const s = rich();
    const b = player(s);
    const l = lover(s);
    const act = DESTS.miamibeach.activities.find((x) => x.id === 'show');
    const base = { leaderId: b.id, tier: 'first' as const, discreet: false, discovered: false };
    const both = discoveryChance(s, { ...base, party: [b.spouseId!, l], companionId: l }, act);
    const loverOnly = discoveryChance(s, { ...base, party: [l], companionId: l }, act);
    const wifeOnly = discoveryChance(s, { ...base, party: [b.spouseId!], companionId: undefined }, act);
    expect(both).toBeGreaterThan(loverOnly * 3);
    expect(loverOnly).toBeGreaterThan(0);
    expect(wifeOnly).toBe(0);
    expect(discoveryChance(s, { ...base, party: [b.spouseId!, l], companionId: l, discreet: true }, act)).toBeLessThan(both);
  });

  it('a trip with the wife and a lover can end in the lobby scene', () => {
    let found = false;
    for (let k = 0; k < 8 && !found; k++) {
      let s = rich(`lobby${k}`);
      const b = player(s);
      const l = lover(s);
      const plan = suggestPlan(s, b.id, 'miamibeach');
      plan.guests = [b.spouseId!];
      plan.companionId = l;
      plan.tier = 'lavish';
      plan.days = ['show', 'fontainebleau', 'show', 'fontainebleau', 'show'];
      const ctx = newCtx(cloneState(s));
      startTrip(ctx, plan);
      s = advanceWeek(ctx.s).state;
      for (let i = 0; i < 2; i++) s = advanceWeek(s).state;
      found = s.travel!.stats.discoveries > 0;
    }
    expect(found).toBe(true);
  });
});

describe('on the lam', () => {
  it('extradition: capture is far likelier on home soil than in the old country; cover hides you', () => {
    const f = { manhunt: 60, cover: 0.5 };
    expect(captureChance({ ...f, dest: 'florida' })).toBeGreaterThan(captureChance({ ...f, dest: 'oldcountry' }) * 4);
    expect(captureChance({ ...f, dest: 'montreal' })).toBeLessThan(captureChance({ ...f, dest: 'vineland' }));
    expect(sightingChance({ manhunt: 60, cover: 0.8 })).toBeLessThan(sightingChance({ manhunt: 60, cover: 0.3 }));
    expect(sightingChance({ manhunt: 90, cover: 0.5 })).toBeGreaterThan(sightingChance({ manhunt: 20, cover: 0.5 }));
  });

  it('only the wanted can run; a plane starts a bigger manhunt than a quiet car', () => {
    const s = rich();
    expect(wantedFor(s, s.playerId)).toBeUndefined();
    s.legal = { stage: 'indicted', personId: s.playerId, defense: 0, since: s.week };
    expect(wantedFor(s, s.playerId)).toBeDefined();
    const plane = fleeQuote(s, { personId: s.playerId, dest: 'florida', mode: 'plane' });
    const car = fleeQuote(s, { personId: s.playerId, dest: 'florida', mode: 'cars' });
    expect(plane.manhunt).toBeGreaterThan(car.manhunt);
  });

  it('the manhunt grows, the case waits, and surrender sends him to a harder trial in a cell', () => {
    let s = rich('lam');
    s.legal = { stage: 'indicted', personId: s.playerId, defense: 10, since: s.week };
    player(s).evidence = 80;
    s = advanceWeek(s, { actions: [{ kind: 'travel', op: { type: 'flee', plan: { personId: s.playerId, dest: 'oldcountry', mode: 'plane', papers: true } } }] }).state;
    const f0 = fugitiveOf(s, s.playerId)!;
    expect(f0.manhunt).toBeGreaterThan(30);
    expect(isAway(s, s.playerId)).toBe(true);
    expect(manhuntGrowth(s, f0)).toBeGreaterThan(0);
    const m0 = f0.manhunt;
    for (let i = 0; i < 4; i++) s = advanceWeek(s).state;
    expect(s.legal!.stage).toBe('indicted');
    expect(s.pendingEvents.some((e) => e.defId === 'indictment')).toBe(false);
    const f = fugitiveOf(s, s.playerId);
    if (!f) throw new Error("caught early");
    expect(f.manhunt).toBeGreaterThan(m0);
    const ev = player(s).evidence ?? 0;
    s = advanceWeek(s, { actions: [{ kind: 'travel', op: { type: 'surrender', personId: s.playerId } }] }).state;
    expect(fugitiveOf(s, s.playerId)).toBeUndefined();
    expect(s.legal!.stage).toBe('trial');
    expect(s.legal!.bail).toBe(false);
    expect(player(s).imprisonedUntil).toBeGreaterThan(s.week);
    expect(player(s).evidence ?? 0).toBeGreaterThan(ev - 2);
  });

  it('abroad for good: the heir takes the chair and play goes on', () => {
    let s = rich('exile');
    s.legal = { stage: 'indicted', personId: s.playerId, defense: 0, since: s.week };
    player(s).evidence = 85;
    const old = s.playerId;
    s = advanceWeek(s, { actions: [{ kind: 'travel', op: { type: 'flee', plan: { personId: old, dest: 'oldcountry', mode: 'ship', papers: true } } }] }).state;
    ensureTravel(s).fugitives[0].since -= 10;
    expect(previewAction(s, { kind: 'travel', op: { type: 'exile', personId: old } }).disabledReason).toBeUndefined();
    s = advanceWeek(s, { actions: [{ kind: 'travel', op: { type: 'exile', personId: old } }] }).state;
    expect(s.playerId).not.toBe(old);
    expect(s.characters[old].alive).toBe(true);
    expect(s.travel!.fugitives[0].end).toBe('exiled');
    expect(s.gameOver).toBeUndefined();
  });

  it('when the case collapses he can come home quietly', () => {
    let s = rich('collapse');
    s.legal = { stage: 'grandjury', personId: s.playerId, defense: 0, since: s.week, next: s.week + 6 };
    player(s).evidence = 21;
    s = advanceWeek(s, { actions: [{ kind: 'travel', op: { type: 'flee', plan: { personId: s.playerId, dest: 'vineland', mode: 'cars' } } }] }).state;
    for (let i = 0; i < 4 && !fugitiveOf(s, s.playerId)?.collapsed; i++) s = advanceWeek(s).state;
    const f = fugitiveOf(s, s.playerId);
    if (!f) throw new Error("caught vineland");
    expect(f.collapsed).toBe(true);
    expect(s.legal!.stage).toBe('quiet');
    s = advanceWeek(s, { actions: [{ kind: 'travel', op: { type: 'comeHome', personId: s.playerId } }] }).state;
    expect(fugitiveOf(s, s.playerId)).toBeUndefined();
    for (let i = 0; i < 2; i++) s = advanceWeek(s).state;
    expect(bossAway(s)).toBe(false);
  });

  it('the indictment card offers a way to run', () => {
    let s = rich('indict');
    s.legal = { stage: 'grandjury', personId: s.playerId, defense: 0, since: s.week, next: s.week };
    player(s).evidence = 95;
    for (let i = 0; i < 6 && !s.pendingEvents.some((e) => e.defId === 'indictment'); i++) s = advanceWeek(s).state;
    const ev = s.pendingEvents.find((e) => e.defId === 'indictment') ?? s.eventQueue.find((e) => e.defId === 'indictment');
    if (!ev) throw new Error("no indictment");
    expect(ev.choices.some((c) => c.id.startsWith('flee_'))).toBe(true);
  });
});
