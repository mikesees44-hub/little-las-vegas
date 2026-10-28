import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/newGame';
import { advanceWeek, cloneState } from '../src/engine/engine';
import { previewAction } from '../src/engine/actions';
import { crew, player } from '../src/engine/characters';
import { awayReason, tickDay } from '../src/engine/days';
import { applyEffects } from '../src/engine/effects';
import { newCtx } from '../src/engine/ledger';
import { leaderBlock } from '../src/engine/travel';
import { bossAway, currentVisit, isAway, nowDay } from '../src/engine/travelState';
import { upgradeSave } from '../src/engine/upgradeSave';
import {
  bookBlock, bookVisit, comeHome, comeHomePlan, departBlock, departFor, guardPool, nextSlot, stayOn, unbookVisit, verbPreview, visitPhase, visitRisks,
} from '../src/engine/visit';
import { homeOnlyBlock } from '../src/engine/visitAway';
import { FEATURED_CITIES, sceneOf, shortName } from '../src/engine/visitData';
import type { GameState, PlayerAction } from '../src/engine/types';

function rich(seed = 'visit'): GameState {
  const s = newGame(seed);
  s.money = 100000;
  return s;
}

function go(s: GameState, cityId = 'philadelphia', guards: string[] = []): GameState {
  const n = departFor(s, { cityId, mode: 'cars', guards });
  expect(n).not.toBe(s);
  return n;
}

/** Book the first free slot for a verb at a place. */
function book(s: GameState, placeId: string, verb: Parameters<typeof bookVisit>[1]['verb']): GameState {
  const v = currentVisit(s)!;
  const at = nextSlot(s, v, verb);
  expect(at, `${verb} at ${placeId}`).toBeDefined();
  const n = bookVisit(s, { placeId, verb, ...at! });
  expect(n, bookBlock(s, { placeId, verb, ...at! })).not.toBe(s);
  return n;
}

function week(s: GameState, actions: PlayerAction[] = []): GameState {
  return advanceWeek(s, { actions }).state;
}

describe('visit: going there yourself', () => {
  it('every featured city has a scene with real places and fictional contacts; no place is offered twice', () => {
    for (const id of FEATURED_CITIES) {
      const sc = sceneOf(id)!;
      expect(sc, id).toBeDefined();
      expect(sc.places.length).toBeGreaterThanOrEqual(5);
      expect(new Set(sc.places.map((p) => p.id)).size).toBe(sc.places.length);
      const verbs = new Set(sc.places.flatMap((p) => p.verbs));
      for (const v of ['sitdown', 'deal', 'launder', 'shop', 'hideout', 'night'] as const) expect(verbs.has(v), `${id}: ${v}`).toBe(true);
    }
    expect(shortName('philadelphia')).toBe('Philly');
    expect(sceneOf('capemay')!.places.some((p) => p.name.includes('Admiral'))).toBe(true); // from the town package
    expect(sceneOf('chicago')!.places.length).toBeGreaterThan(3); // any map city gets a scene
    expect(sceneOf('wildwood')).toBeUndefined();
  });

  it('leaving takes a day on the road; the boss is away and home-only orders say where he is', () => {
    const s = rich();
    const n = go(s);
    const v = currentVisit(n)!;
    expect(v.departDay).toBe(nowDay(s));
    expect(v.arriveDay).toBe(nowDay(s) + 1);
    expect(isAway(n, n.playerId)).toBe(true);
    expect(bossAway(n)).toBe(true);
    expect(awayReason(n, 0)).toBe('On the road');
    expect(awayReason(n, 1)).toBe('In Philly');
    // On the road first; the next day, in the city.
    const buy: PlayerAction = { kind: 'buyBusiness', biz: 'bar', district: 'pacific' } as PlayerAction;
    expect(previewAction(n, buy).disabledReason).toBe("You're on the road to Philly");
    const tue = tickDay(n);
    expect(visitPhase(tue, currentVisit(tue)!)).toBe('there');
    expect(previewAction(tue, buy).disabledReason).toBe("You're in Philly");
    expect(previewAction(tue, { kind: 'order', key: 'parish', via: 'direct' }).disabledReason).toMatch(/^You're in Philly: orders go through the underboss/);
    // Orders through the chain go by telephone.
    expect(homeOnlyBlock(tue, { kind: 'order', key: 'parish', via: 'underboss' })).toBeUndefined();
    // Home, nothing is blocked by the visit.
    expect(homeOnlyBlock(s, buy)).toBeUndefined();
    // One place at a time.
    expect(departBlock(tue, { cityId: 'ac', mode: 'cars' })).toMatch(/come home first/);
    expect(leaderBlock(tue, tue.playerId)).toMatch(/Away in Philly/);
  });

  it('bodyguards come along and are away too; a far city takes longer; Havana is not a drive', () => {
    const s = rich();
    const g = guardPool(s).slice(0, 2).map((c) => c.id);
    expect(g.length).toBe(2);
    const n = go(s, 'newyork', g);
    expect(isAway(n, g[0])).toBe(true);
    expect(guardPool(n).some((c) => g.includes(c.id))).toBe(false);
    const chi = departFor(rich(), { cityId: 'chicago', mode: 'cars', guards: [] });
    expect(currentVisit(chi)!.arriveDay - currentVisit(chi)!.departDay).toBeGreaterThan(1);
    expect(departBlock(s, { cityId: 'havana', mode: 'cars' })).toBeDefined();
    expect(departBlock(s, { cityId: 'philadelphia', mode: 'cars', guards: ['nobody'] })).toMatch(/bodyguard/);
  });

  it('the agenda: one thing a day and one a night, from arrival, only what the place offers', () => {
    let s = go(rich());
    const v0 = currentVisit(s)!;
    const ph = sceneOf('philadelphia')!;
    // Not there yet on the day he leaves.
    expect(bookBlock(s, { placeId: 'ph-ninth', verb: 'sitdown', day: v0.departDay, slot: 'day' })).toMatch(/not there yet/);
    expect(bookBlock(s, { placeId: 'ph-bank', verb: 'sitdown', day: v0.arriveDay, slot: 'day' })).toBe('Not here');
    // Nothing dirty to wash.
    s.unwashed = 0;
    expect(verbPreview(s, v0, ph.places.find((p) => p.id === 'ph-bank')!, 'launder').disabledReason).toMatch(/Nothing dirty/);
    s = book(s, 'ph-ninth', 'sitdown');
    s = book(s, 'ph-latin', 'night');
    const v = currentVisit(s)!;
    expect(v.agenda.map((i) => [i.day, i.slot])).toEqual([[v.arriveDay, 'day'], [v.arriveDay, 'night']]);
    // The same thing twice in a week: no.
    expect(verbPreview(s, v, ph.places[0], 'sitdown').disabledReason).toMatch(/Already/);
    // Lying low takes the whole day.
    s = book(s, 'ph-hide', 'hideout');
    const hide = currentVisit(s)!.agenda.find((i) => i.verb === 'hideout')!;
    expect(bookBlock(s, { placeId: 'ph-gym', verb: 'recruit', day: hide.day, slot: 'night' })).toMatch(/already have something/);
    // Taking it off again.
    const idx = currentVisit(s)!.agenda.indexOf(currentVisit(s)!.agenda.find((i) => i.verb === 'hideout')!);
    expect(currentVisit(unbookVisit(s, idx))!.agenda.length).toBe(2);
    // The Commission's man does not see strangers.
    expect(verbPreview(s, v, ph.places.find((p) => p.kind === 'commission')!, 'sitdown').disabledReason).toMatch(/standing/);
  });

  it('the week resolves the agenda through the ledger, the underboss runs things, and coming home takes its day', () => {
    let s = go(rich('visit-week'));
    s.unwashed = 6000;
    s = book(s, 'ph-ninth', 'sitdown');
    s = book(s, 'ph-latin', 'night');
    s = book(s, 'ph-bank', 'launder');
    s = book(s, 'ph-shop', 'shop');
    s = book(s, 'ph-gym', 'recruit');
    const crewBefore = crew(s).length;
    const r = advanceWeek(s, {});
    const n = r.state;
    const v = n.travel!.visits![0];
    expect(v.agenda.every((i) => i.done && i.outcome)).toBe(true);
    expect(v.journal.length).toBeGreaterThan(4);
    expect(v.legs).toContain('out');
    expect(n.unwashed).toBeLessThan(6000);
    expect(r.report.lines.some((l) => /Philly: the road/.test(l.label))).toBe(true);
    expect(r.report.lines.some((l) => /Bellevue-Stratford/.test(l.label))).toBe(true);
    const recruited = v.agenda.find((i) => i.verb === 'recruit')!;
    if (recruited.tone === 'good') expect(crew(n).length).toBe(crewBefore + 1);
    // The underboss (or the heir) ran things.
    expect(n.travel!.acting).toBeDefined();
    // Still there next week; then home.
    expect(currentVisit(n)).toBeDefined();
    expect(isAway(n, n.playerId)).toBe(true);
    const plan = comeHomePlan(n)!;
    expect(plan.homeDay - plan.leaveDay).toBe(1);
    const h = comeHome(n);
    expect(currentVisit(h)!.leaveDay).toBe(plan.leaveDay);
    // Changed his mind.
    expect(currentVisit(stayOn(h))!.leaveDay).toBeUndefined();
    const n2 = week(h);
    expect(n2.travel!.visits![0].over).toBe(true);
    expect(currentVisit(n2)).toBeUndefined();
    expect(isAway(n2, n2.playerId)).toBe(false);
    expect(n2.travel!.history.some((x) => x.destId === 'philadelphia' && x.leaderId === n2.playerId)).toBe(true);
    expect(previewAction(n2, { kind: 'order', key: 'parish', via: 'direct' }).disabledReason ?? '').not.toMatch(/Philly/);
  });

  it('coming home leaves after the last thing on the agenda; turning back on the road is quicker', () => {
    let s = go(rich());
    const out = comeHomePlan(s)!;
    expect(out.leaveDay).toBe(nowDay(s));
    s = tickDay(s);
    s = book(s, 'ph-ninth', 'sitdown');
    s = book(s, 'ph-latin', 'night');
    s = book(s, 'ph-shop', 'shop'); // the next day
    const last = Math.max(...currentVisit(s)!.agenda.map((i) => i.day));
    const p = comeHomePlan(s)!;
    expect(p.leaveDay).toBe(last + 1);
  });

  it('an order given at home before he left is still carried out', () => {
    const s = rich('visit-orders');
    const a: PlayerAction = { kind: 'order', key: 'parish', via: 'direct' };
    expect(previewAction(s, a).disabledReason).toBeUndefined();
    const n = go(s);
    expect(previewAction(n, a).disabledReason).toMatch(/Philly/);
    const r = advanceWeek(n, { actions: [a] });
    expect(r.state.chronicle.some((c) => c.week === s.week && c.kind === 'decision')).toBe(true);
    expect(r.log.join(' ')).not.toMatch(/Order not carried out — [^:]*: You're/);
  });

  it('risks: a car is tailed more than a bus; a war and bad blood make an ambush likelier; bodyguards and lying low help', () => {
    const s = rich();
    const car = visitRisks(s, 'ac', 'cars', 0);
    const bus = visitRisks(s, 'ac', 'bus', 0);
    expect(car.tail).toBeGreaterThan(bus.tail);
    expect(car.stop).toBeGreaterThan(0);
    expect(bus.stop).toBe(0);
    const calm = visitRisks(s, 'ac', 'cars', 0).ambush;
    const manno = s.rivals.find((r) => r.id === 'manno')!;
    manno.war = true;
    const hot = visitRisks(s, 'ac', 'cars', 0).ambush;
    expect(hot).toBeGreaterThan(calm);
    expect(visitRisks(s, 'ac', 'cars', 2).ambush).toBeLessThan(hot);
    expect(visitRisks(s, 'ac', 'cars', 0, true).ambush).toBeLessThan(hot);
  });

  it('the road and the town bite: tails, troopers and ambushes come up as decisions, and home is exposed while he is gone', () => {
    const kinds = new Set<string>();
    let exposed = false;
    for (let i = 0; i < 24 && (kinds.size < 3 || !exposed); i++) {
      let s = rich(`risk${i}`);
      s.heat.federal = 60;
      s.heat.local = 50;
      const manno = s.rivals.find((r) => r.id === 'manno')!;
      manno.war = true;
      manno.feud = true;
      s = go(s, 'ac');
      for (let w = 0; w < 3; w++) {
        const r = advanceWeek(s, {});
        s = r.state;
        for (const e of s.pendingEvents) if (e.defId.startsWith('visit_')) kinds.add(e.defId);
        if (r.log.some((l) => /While you were in AC/.test(l))) exposed = true;
      }
      s = comeHome(s);
      s = week(s);
      for (const e of s.pendingEvents) if (e.defId.startsWith('visit_')) kinds.add(e.defId);
    }
    expect(kinds.has('visit_ambush')).toBe(true);
    expect(kinds.has('visit_tail') || kinds.has('visit_stop')).toBe(true);
    expect(exposed).toBe(true);
  });

  it('"Go home. Now." after an ambush cuts the visit short', () => {
    let s = go(rich());
    s = tickDay(s);
    s = book(s, 'ph-ninth', 'sitdown');
    const c = cloneState(s);
    const ctx = newCtx(c);
    applyEffects(ctx, [{ type: 'travel', op: { op: 'visitHome' }, label: 'test' }], { label: 'test', because: 'test', category: 'event' });
    const v = c.travel!.visits![0];
    expect(v.leaveDay).toBeDefined();
    expect(v.homeDay).toBe(v.leaveDay! + 1);
  });

  it('the same seed and the same agenda give the same visit', () => {
    const run = () => {
      let s = go(rich('same'));
      s = book(s, 'ph-ninth', 'sitdown');
      s = book(s, 'ph-latin', 'night');
      s = book(s, 'ph-fence', 'deal');
      return week(s).travel!.visits![0].journal.map((j) => j.text);
    };
    expect(run()).toEqual(run());
  });

  it('a save with a visit loads unchanged; a save without one gets nothing new', () => {
    const s = rich('save');
    const plain = cloneState(s);
    expect(JSON.stringify(upgradeSave(cloneState(s)))).toBe(JSON.stringify(plain));
    let n = go(s);
    n = book(tickDay(n), 'ph-ninth', 'sitdown');
    const before = JSON.stringify(n);
    expect(JSON.stringify(upgradeSave(JSON.parse(before)))).toBe(before);
    expect(player(n).alive).toBe(true);
  });
});
