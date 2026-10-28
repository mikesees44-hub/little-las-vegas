import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { newGame } from '../src/engine/newGame';
import { advanceWeek } from '../src/engine/engine';
import { player } from '../src/engine/characters';
import { compareDates, dateOfWeek } from '../src/engine/calendar';
import { newCtx } from '../src/engine/ledger';
import { opinion } from '../src/engine/relations';
import { ferryNews, quoteTrip, suggestPlan } from '../src/engine/travel';
import { DESTS } from '../src/engine/travelDests';
import {
  aircraft, departureHours, FERRY_OPENS, ferryOpen, legHours, optFare, TRANSPORT, transportBlock, transportRisks,
} from '../src/engine/transport';
import { timeCost, TRAVEL_DAY } from '../src/engine/timeCost';
import { departQuote } from '../src/engine/visit';
import {
  bossVacation, HEADLINE_HOURS, planVac, unplanVac, VAC, VAC_DAY_HOURS, vacBlock, vacHours, vacOptions,
} from '../src/engine/vacation';
import { fam } from '../src/engine/familyState';
import type { GameState, PlayerAction } from '../src/engine/types';
import type { TripPlan } from '../src/engine/travelState';
import { loadSlot, saveSlot, type KV } from '../src/ui/save';
import { VacationScreen } from '../src/ui/travel/VacationScreen';
import { TripPlanner } from '../src/ui/travel/TripPlanner';
import { GoThere } from '../src/ui/travel/GoThere';

function rich(seed = 'voyage'): GameState {
  const s = newGame(seed);
  s.money = 200000;
  return s;
}
const order = (plan: TripPlan): PlayerAction => ({ kind: 'travel', op: { type: 'trip', plan }, fund: 'family' });
const mem = (): KV => { const m = new Map<string, string>(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) }; };

/** The game week whose date is on or after the given day. */
function weekOf(y: number, m: number, d: number): number {
  let w = 1;
  while (compareDates(dateOfWeek(w), { y, m, d }) < 0) w++;
  return w;
}

describe('voyage: planes, trains, automobiles and boats', () => {
  it('each way has its own hours, fare and risks, 1960-accurate', () => {
    const miami = DESTS.miamibeach;
    const philly = DESTS.philadelphia;
    // The car: your own Caddy is the cheapest (no drivers' pay), the livery the dearest; the hired car is not your plates.
    expect(optFare(TRANSPORT.caddy, philly, 'first')).toBeLessThan(optFare(TRANSPORT.crewcar, philly, 'first'));
    expect(optFare(TRANSPORT.chauffeur, philly, 'first')).toBeGreaterThan(optFare(TRANSPORT.crewcar, philly, 'first'));
    const r = (id: keyof typeof TRANSPORT) => transportRisks(TRANSPORT[id], philly, 6, 40, 20, 0);
    expect(r('caddy').tail).toBeGreaterThan(r('chauffeur').tail);
    expect(r('caddy').stop).toBeGreaterThan(0);
    expect(r('prr_club').stop).toBe(0);
    // The train: the club car costs more than coach and puts your name on a reservation.
    expect(optFare(TRANSPORT.prr_club, miami, 'modest')).toBeGreaterThan(optFare(TRANSPORT.prr_coach, miami, 'modest'));
    expect(TRANSPORT.prr_club.manifest).toBe(true);
    expect(TRANSPORT.prr_coach.manifest).toBe(false);
    // Planes: jets on the big routes from the big airports, a Convair hop from Bader Field, propliners close in.
    expect(aircraft(TRANSPORT.fly_phl, miami)).toMatch(/DC-8|707/);
    expect(aircraft(TRANSPORT.fly_idlewild, DESTS.vegas)).toMatch(/707/);
    expect(aircraft(TRANSPORT.fly_bader, miami)).toMatch(/Convair/);
    expect(aircraft(TRANSPORT.fly_phl, DESTS.pittsburgh)).not.toMatch(/707|DC-8/);
    // Idlewild is a longer drive and more watched; Bader is barely watched.
    expect(legHours(TRANSPORT.fly_idlewild, miami)).toBeGreaterThan(legHours(TRANSPORT.fly_phl, miami));
    expect(transportRisks(TRANSPORT.fly_idlewild, miami, 2, 50, 0, 0).seen).toBeGreaterThan(transportRisks(TRANSPORT.fly_phl, miami, 2, 50, 0, 0).seen);
    expect(transportRisks(TRANSPORT.fly_bader, miami, 2, 50, 0, 0).seen).toBeLessThan(transportRisks(TRANSPORT.fly_phl, miami, 2, 50, 0, 0).seen);
    // Weather doubles in the winter for planes and boats.
    expect(transportRisks(TRANSPORT.fly_phl, miami, 1, 0, 0, 0).weather).toBeGreaterThan(transportRisks(TRANSPORT.fly_phl, miami, 6, 0, 0, 0).weather);
    // Door to door: a plane to Miami is hours; the train and the bus are a day or more.
    expect(legHours(TRANSPORT.fly_phl, miami)).toBeLessThan(10);
    expect(legHours(TRANSPORT.prr_club, miami)).toBeGreaterThan(20);
    expect(legHours(TRANSPORT.greyhound, miami)).toBeGreaterThan(legHours(TRANSPORT.prr_club, miami));
    // The Short Line and the Jersey Central only go where they went.
    expect(transportBlock('shortline', DESTS.catskills, { y: 1960, m: 7, d: 1 })).toBeUndefined();
    expect(transportBlock('shortline', miami, { y: 1960, m: 7, d: 1 })).toMatch(/Short Line/);
    expect(transportBlock('cnj', DESTS.newyork, { y: 1960, m: 7, d: 1 })).toBeUndefined();
    expect(transportBlock('cnj', philly, { y: 1960, m: 7, d: 1 })).toMatch(/Jersey Central/);
  });

  it('the quote follows the way chosen: fares, hours, risks, seats and bodyguards', () => {
    const s = rich();
    s.heat.federal = 50;
    s.heat.local = 30;
    const base = { ...suggestPlan(s, s.playerId, 'miamibeach'), guests: [] as string[] };
    const phl = quoteTrip(s, { ...base, mode: 'plane', transport: 'fly_phl' });
    const idle = quoteTrip(s, { ...base, mode: 'plane', transport: 'fly_idlewild' });
    expect(phl.block).toBeUndefined();
    expect(idle.hours).toBeGreaterThan(phl.hours);
    expect(idle.risks.sighting).toBeGreaterThan(phl.risks.sighting);
    expect(phl.risks.manifest).toBeGreaterThan(0);
    const caddy = quoteTrip(s, { ...base, mode: 'cars', transport: 'caddy' });
    expect(caddy.block).toBeUndefined(); // no crew driver needed
    expect(caddy.risks.stop).toBeGreaterThan(0);
    expect(caddy.lines[0].label).toMatch(/Cadillac/);
    // Too many bodyguards on a plane.
    const crew = Object.values(s.characters).filter((c) => c.alive && c.faction === 'player' && (c.rank === 'soldier' || c.rank === 'associate') && !c.dynasty).slice(0, 4).map((c) => c.id);
    if (crew.length === 4) expect(quoteTrip(s, { ...base, mode: 'plane', transport: 'fly_phl', guests: crew }).block).toMatch(/bodyguard/);
    // The way that doesn't go there is refused with the reason.
    expect(quoteTrip(s, { ...base, mode: 'train', transport: 'cnj' }).block).toMatch(/Jersey Central/);
  });

  it('the hours feed the clock: the ferry is an afternoon, Miami by plane most of a day, old plans a day', () => {
    const s = rich();
    const lewes = { ...suggestPlan(s, s.playerId, 'lewes'), mode: 'ship' as const, transport: 'charter', guests: [] };
    const h = timeCost({ kind: 'travel', op: { type: 'trip', plan: lewes } }, s);
    expect(h).toBe(departureHours(TRANSPORT.charter, DESTS.lewes, TRAVEL_DAY));
    expect(h).toBeLessThan(4);
    const miami = { ...suggestPlan(s, s.playerId, 'miamibeach'), mode: 'plane' as const, transport: 'fly_phl', guests: [] };
    const hm = timeCost({ kind: 'travel', op: { type: 'trip', plan: miami } }, s);
    expect(hm).toBeGreaterThan(h);
    expect(hm).toBeLessThanOrEqual(TRAVEL_DAY);
    expect(timeCost({ kind: 'travel', op: { type: 'trip', plan: { ...miami, transport: undefined } } }, s)).toBe(TRAVEL_DAY);
  });

  it('visits take the way too: a hired car is dearer than the Caddy and harder to tail', () => {
    const s = rich();
    s.heat.federal = 40;
    const caddy = departQuote(s, { cityId: 'philadelphia', mode: 'cars', guards: [], transport: 'caddy' });
    const hired = departQuote(s, { cityId: 'philadelphia', mode: 'cars', guards: [], transport: 'chauffeur' });
    expect(hired.fare).toBeGreaterThan(caddy.fare);
    expect(hired.risks.tail).toBeLessThan(caddy.risks.tail);
    expect(caddy.block).toBeUndefined();
  });
});

describe('voyage: Delaware and the ferry', () => {
  it('Lewes, Rehoboth and Wilmington are there; before 1964 it is the bridge or a fishing captain', () => {
    for (const id of ['lewes', 'rehoboth', 'wilmington']) expect(DESTS[id]?.resort).toBe(true);
    const s = rich();
    const base = { ...suggestPlan(s, s.playerId, 'lewes'), guests: [] as string[] };
    // Around by the Memorial Bridge: a long drive for seventeen miles of water.
    const car = quoteTrip(s, { ...base, mode: 'cars', transport: 'caddy' });
    const boat = quoteTrip(s, { ...base, mode: 'ship', transport: 'charter' });
    expect(car.block).toBeUndefined();
    expect(boat.block).toBeUndefined();
    expect(boat.hours).toBeLessThan(car.hours);
    expect(car.hours).toBeGreaterThan(2.5);
    expect(boat.risks.weather).toBeGreaterThan(0);
    expect(boat.risks.sighting).toBeLessThan(car.risks.sighting + 1e-9);
    expect(quoteTrip(s, { ...base, mode: 'ship', transport: 'ferry' }).block).toMatch(/July 1964/);
    expect(quoteTrip(s, { ...base, mode: 'ship', transport: 'liner' }).block).toMatch(/liner/);
    // A charter boat holds six.
    const kids = [...player(s).childrenIds, player(s).spouseId!].filter(Boolean);
    const crowd = Object.values(s.characters).filter((c) => c.alive && c.dynasty && c.id !== s.playerId).map((c) => c.id).concat(kids).slice(0, 7);
    if (new Set(crowd).size >= 6) expect(quoteTrip(s, { ...base, mode: 'ship', transport: 'charter', guests: [...new Set(crowd)] }).block ?? '').toMatch(/seats|guest|come/);
    // No river ferry to Wilmington: they stopped in 1951.
    expect(DESTS.wilmington.modes).not.toContain('ship');
    expect(DESTS.wilmington.blurb).toMatch(/1951/);
  });

  it('the Cape May–Lewes Ferry opens in July 1964: news once, then a new way across', () => {
    expect(ferryOpen({ y: 1964, m: 6, d: 30 })).toBe(false);
    expect(ferryOpen(FERRY_OPENS)).toBe(true);
    const s = rich('ferry');
    s.week = weekOf(1964, 7, 1);
    s.date = dateOfWeek(s.week);
    const ctx = newCtx(s);
    ferryNews(ctx);
    expect(s.flags.capeMayLewesFerry).toBe(1);
    expect(s.chronicle.filter((c) => /Cape May–Lewes Ferry/.test(c.text))).toHaveLength(1);
    ferryNews(ctx);
    expect(s.chronicle.filter((c) => /Cape May–Lewes Ferry/.test(c.text))).toHaveLength(1);
    const base = { ...suggestPlan(s, s.playerId, 'rehoboth'), guests: [] as string[] };
    const ferry = quoteTrip(s, { ...base, mode: 'ship', transport: 'ferry' });
    expect(ferry.block).toBeUndefined();
    expect(ferry.hours).toBeLessThan(quoteTrip(s, { ...base, mode: 'cars', transport: 'caddy' }).hours);
    // An earlier game never got the news.
    const early = rich('ferry-early');
    ferryNews(newCtx(early));
    expect(early.flags.capeMayLewesFerry).toBeUndefined();
  });

  it('the trip planner shows the ways and the ferry waiting for 1964', () => {
    const s = rich('ui-ferry');
    const html = renderToString(createElement(TripPlanner, { s, leaderId: s.playerId, destId: 'lewes', onClose: () => {} }));
    expect(html).toContain('Lewes');
    const plane = renderToString(createElement(TripPlanner, { s, leaderId: s.playerId, destId: 'miamibeach', onClose: () => {} }));
    expect(plane).toContain('data-testid="transport-picker"');
    expect(plane).toContain('Idlewild');
    expect(plane).toMatch(/door to door/);
    const go = renderToString(createElement(GoThere, { s, cityId: 'philadelphia', update: () => {}, onClose: () => {}, onArrive: () => {} }));
    expect(go).toContain('A hired driver');
  });
});

/** The boss and his family off to the Catskills next week, by his own car. */
function booked(seed: string): GameState {
  const s = rich(seed);
  const plan: TripPlan = { ...suggestPlan(s, s.playerId, 'catskills'), mode: 'cars', transport: 'caddy', cars: 1, driverIds: [], departIn: 1, tier: 'first' };
  const r = advanceWeek(s, { actions: [order(plan)] });
  return r.state;
}

describe('voyage: the boss on vacation', () => {
  it('a booked vacation can be planned day by day: hours, costs, who it needs', () => {
    const s = booked('vac-plan');
    const t = bossVacation(s)!;
    expect(t).toBeDefined();
    expect(t.transport).toBe('caddy');
    expect(vacHours(t, 0)).toBe(HEADLINE_HOURS);
    const opts = vacOptions(s, t, 0);
    expect(opts.map((o) => o.id)).toEqual(expect.arrayContaining(['show', 'fishing', 'golf', 'beach', 'nightclub', 'supper', 'shopping', 'sitdown', 'hide', 'politician', 'romance', 'kids', 'track']));
    // The Catskills have no track; the show has a (fictional) headliner.
    expect(opts.find((o) => o.id === 'track')!.block).toBeTruthy();
    expect(opts.find((o) => o.id === 'show')!.where).toMatch(/:/);
    let n = planVac(s, t.id, 0, 'golf');
    n = planVac(n, t.id, 0, 'show');
    const t2 = bossVacation(n)!;
    expect(vacHours(t2, 0)).toBe(HEADLINE_HOURS + VAC.golf.hours + VAC.show.hours);
    // Over the day's hours: refused with the reason, state unchanged.
    expect(vacBlock(n, t2, 0, 'fishing')).toMatch(/hours/);
    expect(planVac(n, t.id, 0, 'fishing')).toBe(n);
    expect(VAC_DAY_HOURS).toBe(14);
    // Pure: the old state is untouched; taking it off works.
    expect(bossVacation(s)!.vac).toBeUndefined();
    expect(bossVacation(unplanVac(n, t.id, 0, 'golf'))!.vac!.plan[0]).toEqual(['show']);
    // A romantic dinner needs someone to take; the kids' day needs kids.
    const alone = { ...t2, party: [], guests: [] };
    expect(vacBlock(n, alone, 1, 'romance')).toMatch(/Nobody/);
    expect(vacBlock(n, alone, 1, 'kids')).toMatch(/kids/);
  });

  it('the week resolves it: stress down, the wife pleased, money spent, the Bureau notices the sit-down', () => {
    let s = booked('vac-run');
    const t = bossVacation(s)!;
    const b = player(s);
    const wife = b.spouseId && t.party.includes(b.spouseId) ? b.spouseId : undefined;
    s = planVac(s, t.id, 0, 'shopping');
    s = planVac(s, t.id, 0, 'supper');
    s = planVac(s, t.id, 1, 'sitdown');
    s = planVac(s, t.id, 1, 'beach');
    const stress0 = fam(s, b.id).stress;
    const op0 = wife ? opinion(s, wife, b.id) : 0;
    const fed0 = s.heat.federal;
    const r = advanceWeek(s);
    s = r.state;
    const after = s.travel!.trips.find((x) => x.id === t.id)!;
    const done = after.vac!.done!;
    expect(done.map((x) => x.act)).toEqual(expect.arrayContaining(['shopping', 'supper', 'sitdown', 'beach']));
    expect(fam(s, b.id).stress).toBeLessThanOrEqual(stress0);
    if (wife) expect(opinion(s, wife, b.id)).toBeGreaterThan(op0);
    expect(r.report.lines.some((l) => l.stat === 'money' && /supper club|shopping/i.test(l.label))).toBe(true);
    expect(r.report.lines.some((l) => l.stat === 'heat.federal' && /Bureau noticed/.test(l.label)) || s.heat.federal >= fed0).toBe(true);
    expect(after.journal.some((j) => /espresso/.test(j.text))).toBe(true);
  });

  it('same seed, same plans: the same vacation', () => {
    const run = () => {
      let s = booked('vac-same');
      const t = bossVacation(s)!;
      s = planVac(s, t.id, 0, 'golf');
      s = planVac(s, t.id, 2, 'nightclub');
      for (let i = 0; i < 2; i++) s = advanceWeek(s).state;
      return JSON.stringify({ trips: s.travel!.trips.map((x) => [x.journal, x.vac]), money: s.money });
    };
    const a = run();
    expect(a).toBe(run());
    expect(a).toMatch(/hundred and four strokes/);
  });

  it('a save keeps the way and the plans', () => {
    let s = booked('vac-save');
    const t = bossVacation(s)!;
    s = planVac(s, t.id, 1, 'beach');
    const kv = mem();
    expect(saveSlot(1, s, kv)).toBe(true);
    const back = loadSlot(1, kv)!;
    const t2 = bossVacation(back)!;
    expect(t2.transport).toBe('caddy');
    expect(t2.vac!.plan[1]).toEqual(['beach']);
    expect(vacHours(t2, 1)).toBe(vacHours(bossVacation(s)!, 1));
  });

  it('the vacation screen: a postcard, who came, the days and the things to do', () => {
    let s = booked('vac-ui');
    const t = bossVacation(s)!;
    s = planVac(s, t.id, 0, 'golf');
    const html = renderToString(createElement(VacationScreen, { s, update: () => {}, onClose: () => {} }));
    expect(html).toContain('data-testid="vacation-postcard"');
    expect(html).toContain('Greetings from');
    expect(html).toContain('The Catskills');
    expect(html).toContain('data-testid="vacation-party"');
    expect(html).toContain('data-testid="vacation-day"');
    expect(html).toContain('data-testid="vacation-planned"');
    expect(html).toContain('Back home');
    expect(html).toContain('Your Cadillac');
  });

  it('Havana is shown as lost once it is gone', () => {
    const s = rich('havana-lost');
    s.week = weekOf(1961, 3, 1);
    s.date = dateOfWeek(s.week);
    const html = renderToString(createElement(TripPlanner, { s, leaderId: s.playerId, destId: 'catskills', onClose: () => {} }));
    expect(html.replace(/<!-- -->/g, '')).toMatch(/Havana — Lost/);
  });
});
