import { describe, expect, it } from 'vitest';
import { previewAction } from '../src/engine/actions';
import { advanceWeek } from '../src/engine/engine';
import { newGame } from '../src/engine/newGame';
import {
  BLESS_WEEKS, capoPool, controllerOf, crewIn, crewLedger, ensureNyc, grievanceOf, inNewYork, nycOf, ownerToAsk, soldierPool, SUMMONS_AT, TAKE_WEEKS, unasked,
  type NycAction,
} from '../src/engine/nyc';
import { NYC_DISTRICTS, NYC_FAMILIES, NYC_FAMILY_IDS } from '../src/engine/nycData';
import { hasTimeCost, timeCost } from '../src/engine/timeCost';
import { upgradeSave } from '../src/engine/upgradeSave';
import { departFor } from '../src/engine/visit';
import { sceneOf } from '../src/engine/visitData';
import type { GameState, PlayerAction } from '../src/engine/types';

function rich(seed = 'nyc'): GameState {
  const s = newGame(seed);
  s.money = 200000;
  return s;
}
const act = (op: NycAction): PlayerAction => ({ kind: 'nyc', op });
function week(s: GameState, actions: PlayerAction[] = []): GameState {
  return advanceWeek(s, { actions }).state;
}
/** A crew order with the first free capo and two of his men. */
function crewOrder(s: GameState, district: string): NycAction {
  const capo = capoPool(s)[0];
  expect(capo, 'a free capo').toBeDefined();
  const men = soldierPool(s, capo.id).slice(0, 2).map((c) => c.id);
  expect(men.length).toBe(2);
  return { op: 'crew', district, capoId: capo.id, soldiers: men };
}

describe('New York: the families and the neighborhoods', () => {
  it('five fictional families, every district owned by one of them or open, places that exist', () => {
    expect(NYC_FAMILY_IDS.length).toBe(5);
    const banned = /gambino|genovese|lucchese|luchese|bonanno|colombo|profaci|gotti|luciano|costello|anastasia|gigante|castellano|galante|lansky|siegel/i;
    for (const f of Object.values(NYC_FAMILIES)) expect(`${f.name} ${f.boss}`).not.toMatch(banned);
    const places = new Set(sceneOf('newyork')!.places.map((p) => p.id));
    for (const d of NYC_DISTRICTS) {
      expect(d.rackets.length, d.id).toBeGreaterThan(0);
      if (d.family) expect(NYC_FAMILY_IDS).toContain(d.family);
      for (const p of d.places ?? []) expect(places.has(p), `${d.id} → ${p}`).toBe(true);
    }
    for (const f of NYC_FAMILY_IDS) expect(NYC_DISTRICTS.some((d) => d.family === f), f).toBe(true);
    expect(NYC_DISTRICTS.some((d) => !d.family)).toBe(true);
  });

  it('every New York order has a written time cost', () => {
    for (const op of ['crew', 'racket', 'bless', 'tribute', 'sitdown', 'recall']) expect(hasTimeCost('nyc', op), op).toBe(true);
    expect(timeCost(act({ op: 'bless', family: 'marchetti' }))).toBe(3);
    expect(timeCost(act({ op: 'recall', district: 'coney' }))).toBe(0.25);
  });
});

describe('New York: expansion plays', () => {
  it('a new game has no New York layer; a week without New York orders adds none; upgradeSave leaves it be', () => {
    const s = rich();
    expect(s.nyc).toBeUndefined();
    expect(upgradeSave(structuredClone(s)).nyc).toBeUndefined();
    expect(week(s).nyc).toBeUndefined();
  });

  it('opens a crew on open ground, buys a racket, earns every week — deterministically', () => {
    const run = () => {
      let s = rich('nyc-open');
      const order = crewOrder(s, 'lowereast');
      expect(previewAction(s, act(order)).disabledReason).toBeUndefined();
      expect(previewAction(s, act({ op: 'racket', district: 'lowereast', racket: 'numbers' })).disabledReason).toMatch(/crew there first/);
      s = week(s, [act(order)]);
      expect(crewIn(s, 'lowereast')?.capoId).toBe(order.capoId);
      expect(unasked(s, 'lowereast')).toBe(false);
      expect(controllerOf(s, 'lowereast')).toBe('open');
      // The same capo can't lead two crews.
      expect(previewAction(s, act({ ...order, district: 'coney' })).disabledReason).toMatch(/free capo/);
      s = week(s, [act({ op: 'racket', district: 'lowereast', racket: 'numbers' })]);
      expect(crewIn(s, 'lowereast')!.rackets).toEqual(['numbers']);
      expect(controllerOf(s, 'lowereast')).toBe('player');
      const L = crewLedger(s, crewIn(s, 'lowereast')!);
      expect(L.rackets).toBeGreaterThan(200);
      expect(L.tribute).toBe(0);
      const before = nycOf(s).stats.earned;
      for (let i = 0; i < 4; i++) s = week(s);
      expect(nycOf(s).stats.earned - before).toBeGreaterThan(4 * (L.street + L.rackets) * 0.5);
      return s;
    };
    const a = run();
    const b = run();
    expect(JSON.stringify(a.nyc)).toBe(JSON.stringify(b.nyc));
    expect(a.money).toBe(b.money);
  });

  it('moving in without asking builds a grievance; the Commission calls a sit-down; ignoring it is war', () => {
    let s = rich('nyc-bold');
    const order = crewOrder(s, 'redhook');
    const p = previewAction(s, act(order));
    expect(ownerToAsk(s, 'redhook')).toBe('corvino');
    expect(p.warning).toMatch(/Corvino/);
    expect(p.verb).toMatch(/without asking/);
    s = week(s, [act(order), act({ op: 'racket', district: 'redhook', racket: 'docks' })]);
    expect(grievanceOf(s, 'corvino')).toBeGreaterThan(20);
    let weeks = 0;
    while (!nycOf(s).summons && weeks < 20) { s = week(s); weeks++; }
    expect(nycOf(s).summons?.family).toBe('corvino');
    expect(grievanceOf(s, 'corvino')).toBeGreaterThanOrEqual(SUMMONS_AT);
    // The sit-down needs the boss in New York.
    expect(previewAction(s, act({ op: 'sitdown', family: 'corvino', offer: 'pay' })).disabledReason).toMatch(/New York/);
    // The summons popup is pending; answer "I'll be there" and never go.
    const ev = s.pendingEvents.find((e) => e.defId === 'nyc_summons');
    expect(ev).toBeDefined();
    let n = 0;
    while (nycOf(s).summons && n < 6) {
      const choices = Object.fromEntries(s.pendingEvents.map((e) => [e.iid, e.defId === 'nyc_summons' ? 'go' : e.defaultChoiceId]));
      s = advanceWeek(s, { actions: [], choices }).state;
      n++;
    }
    expect(nycOf(s).war).toContain('corvino');
    expect(nycOf(s).summons).toBeUndefined();
  });

  it('asking a blessing is done in person; with it the owner takes his cut and no grievance grows', () => {
    let s = rich('nyc-bless');
    s.respect = 80;
    ensureNyc(s).opinion.saladino = 60;
    const ask = act({ op: 'bless', family: 'saladino' });
    expect(previewAction(s, ask).disabledReason).toMatch(/in person/);
    s = departFor(s, { cityId: 'newyork', mode: 'cars', guards: [] });
    expect(inNewYork(s)).toBe(true);
    const p = previewAction(s, ask);
    expect(p.disabledReason).toBeUndefined();
    expect(p.acceptance!.chance).toBeGreaterThan(0.6);
    s = week(s, [ask]);
    const until = nycOf(s).blessed.saladino;
    expect(until, 'this seed says yes').toBeDefined();
    expect(until).toBeGreaterThanOrEqual(s.week - 1 + BLESS_WEEKS);
    s = week(s, [act(crewOrder(s, 'bensonhurst'))]);
    expect(unasked(s, 'bensonhurst')).toBe(false);
    const L = crewLedger(s, crewIn(s, 'bensonhurst')!);
    expect(L.tribute).toBeGreaterThan(0);
    const g = grievanceOf(s, 'saladino');
    for (let i = 0; i < 3; i++) s = week(s);
    expect(grievanceOf(s, 'saladino')).toBeLessThanOrEqual(g);
  });

  it('a sit-down settles: reparations paid end the war and bring the blessing', () => {
    let s = rich('nyc-settle');
    s = week(s, [act(crewOrder(s, 'coney'))]);
    const n = ensureNyc(s);
    n.war.push('saladino');
    n.grievance.saladino = 80;
    s = departFor(s, { cityId: 'newyork', mode: 'cars', guards: [] });
    const pay = act({ op: 'sitdown', family: 'saladino', offer: 'pay' });
    const p = previewAction(s, pay);
    expect(p.disabledReason).toBeUndefined();
    const money0 = s.money;
    s = week(s, [pay]);
    expect(nycOf(s).war).not.toContain('saladino');
    expect(grievanceOf(s, 'saladino')).toBe(0);
    expect(nycOf(s).blessed.saladino).toBeGreaterThan(s.week);
    expect(money0 - s.money).toBeGreaterThan(p.cost * 0.5);
    expect(crewIn(s, 'coney')).toBeDefined();
  });

  it('in a war a crew that holds two rackets long enough takes the neighborhood; ceding gives it back', () => {
    let s = rich('nyc-war');
    s = week(s, [act(crewOrder(s, 'coney'))]);
    const n = ensureNyc(s);
    n.war.push('saladino');
    crewIn(s, 'coney')!.rackets = ['clubs', 'shylock', 'numbers'];
    let w = 0;
    while (controllerOf(s, 'coney') !== 'player' && crewIn(s, 'coney') && w < 30) {
      const c = crewIn(s, 'coney')!;
      // Keep the rackets topped up (the war burns them).
      if (c.rackets.length < 2) s.nyc!.crews.find((x) => x.district === 'coney')!.rackets = ['clubs', 'shylock', 'numbers'];
      for (const id of [c.capoId, ...c.soldiers]) if (s.characters[id]) s.characters[id].health = 100;
      s = week(s);
      w++;
    }
    expect(controllerOf(s, 'coney')).toBe('player');
    expect(w).toBeGreaterThanOrEqual(TAKE_WEEKS);
    s = departFor(s, { cityId: 'newyork', mode: 'cars', guards: [] });
    s = week(s, [act({ op: 'sitdown', family: 'saladino', offer: 'cede' })]);
    expect(crewIn(s, 'coney')).toBeUndefined();
    expect(controllerOf(s, 'coney')).toBe('saladino');
    expect(nycOf(s).war).not.toContain('saladino');
  });

  it('a save round-trips: the New York layer survives JSON and upgradeSave, and plays on identically', () => {
    let s = rich('nyc-save');
    s = week(s, [act(crewOrder(s, 'hellskitchen'))]);
    s = week(s, [act({ op: 'racket', district: 'hellskitchen', racket: 'docks' })]);
    const json = JSON.stringify(s);
    const back = upgradeSave(JSON.parse(json) as GameState);
    expect(JSON.stringify(back.nyc)).toBe(JSON.stringify(s.nyc));
    const a = week(week(s));
    const b = week(week(back));
    expect(JSON.stringify(b.nyc)).toBe(JSON.stringify(a.nyc));
    expect(b.money).toBe(a.money);
  });

  it('recall brings the men home and frees the capo', () => {
    let s = rich('nyc-recall');
    const order = crewOrder(s, 'fulton');
    s = week(s, [act(order)]);
    expect(capoPool(s).some((c) => c.id === order.capoId)).toBe(false);
    s = week(s, [act({ op: 'recall', district: 'fulton' })]);
    expect(crewIn(s, 'fulton')).toBeUndefined();
    expect(capoPool(s).some((c) => c.id === order.capoId)).toBe(true);
  });
});
