import { beforeAll, describe, expect, it } from 'vitest';
import { advanceWeek } from '../src/engine/engine';
import { dateOfWeek } from '../src/engine/calendar';
import { hashSeed } from '../src/engine/rng';
import { newCtx } from '../src/engine/ledger';
import { reconcileLiving } from '../src/engine/livingMoney';
import { ensureMarket, FLOOR, kindOf, listingCounts, marketWeek, newListings, seasonListings, seasonPrice, type MarketKind } from '../src/engine/market';
import { newGame } from '../src/engine/newGame';
import { upgradeSave } from '../src/engine/upgradeSave';
import type { GameState } from '../src/engine/types';

const clone = (s: GameState): GameState => JSON.parse(JSON.stringify(s)) as GameState;
const KINDS: MarketKind[] = ['homeLand', 'house', 'land', 'building'];
/** Listings brought to market (not price cuts or relists at the tax sale). */
const madeNew = (s: GameState) => Object.entries(s.market?.made ?? {}).filter(([k]) => k !== 'cut' && k !== 'auction').reduce((a, [, v]) => a + (v ?? 0), 0);

/** A town where the listings are bought up fast: the boss, the rivals and the families take three to five a week (real play takes well under one). */
function hungryWeek(s: GameState, w: number): void {
  const sale = s.econ!.lots.filter((l) => l.status === 'sale').sort((a, b) => a.id.localeCompare(b.id));
  const take = 3 + (hashSeed(`hungry:${w}`) % 3);
  for (let i = 0; i < take && sale.length; i++) {
    const l = sale.splice(hashSeed(`hungry:${w}:${i}`) % sale.length, 1)[0];
    l.status = i % 3 === 0 ? 'rival' : 'private';
    l.owner = i % 3 === 0 ? 'manno' : 'private';
  }
}

describe('the real-estate market keeps land and houses coming', () => {
  let s: GameState;
  const weekly: { w: number; m: number; c: Record<MarketKind, number>; fresh: number; made: number; prices: number[] }[] = [];
  let specSeen = 0;
  beforeAll(() => {
    // Five years of a market bought up faster than it would ever be in play (the market alone, week by week).
    // (One real week first: the families move into the town's houses.)
    s = advanceWeek(newGame('market-5y'), { actions: [] }).state;
    for (let w = 0; w < 260; w++) {
      hungryWeek(s, w);
      const before = madeNew(s);
      marketWeek(newCtx(s));
      specSeen = Math.max(specSeen, Object.keys(s.market!.spec).length);
      const c = listingCounts(s);
      s.week += 1;
      s.date = dateOfWeek(s.week);
      weekly.push({ w, m: s.date.m, c, fresh: newListings(s, 1).length, made: madeNew(s) - before, prices: s.econ!.lots.filter((l) => l.status === 'sale').map((l) => l.price) });
    }
  }, 120_000);

  it('over five years the listings never dry up: every kind stays near its floor or above', () => {
    for (const x of weekly.slice(6)) {
      const total = KINDS.reduce((a, k) => a + x.c[k], 0);
      expect(total, `week ${x.w}`).toBeGreaterThanOrEqual(30);
      for (const k of KINDS) expect(x.c[k], `${k} in week ${x.w}`).toBeGreaterThanOrEqual(Math.floor(FLOOR[k] * 0.6));
    }
    // And on average comfortably above the floors.
    for (const k of KINDS) expect(weekly.slice(6).reduce((a, x) => a + x.c[k], 0) / (weekly.length - 6), k).toBeGreaterThanOrEqual(FLOOR[k]);
  });

  it('something new comes on the market nearly every week', () => {
    const withNew = weekly.filter((x) => x.fresh > 0).length;
    expect(withNew / weekly.length).toBeGreaterThan(0.85);
  });

  it('the prices vary: cheap lots and dear buildings, never one price', () => {
    for (const x of weekly.filter((_, i) => i % 26 === 25)) {
      const p = [...x.prices].sort((a, b) => a - b);
      expect(new Set(p).size, `week ${x.w}`).toBeGreaterThan(15);
      expect(p[Math.floor(p.length * 0.9)] / p[Math.floor(p.length * 0.1)], `week ${x.w}`).toBeGreaterThan(2);
    }
  });

  it('listings come from every source: estates, moves, teardowns, split lots, tax sales, new houses, retiring owners', () => {
    const made = s.market!.made;
    for (const why of ['estate', 'moving', 'teardown', 'subdivided', 'auction', 'retiring', 'owner'] as const) expect(made[why] ?? 0, why).toBeGreaterThan(0);
    // Builders put houses up on spec (they go up through the ordinary construction stages).
    expect(specSeen + (made.newbuild ?? 0)).toBeGreaterThan(0);
    // A lot split off is a real lot on the map.
    const split = s.econ!.lots.filter((l) => l.id.includes('-split'));
    expect(split.length).toBeGreaterThan(0);
    expect(new Set(s.econ!.lots.map((l) => l.id)).size).toBe(s.econ!.lots.length);
  });

  it('spring brings more listings than winter, and winter is cheaper', () => {
    expect(seasonListings(4)).toBeGreaterThan(seasonListings(1) * 2);
    expect(seasonPrice(5)).toBeGreaterThan(seasonPrice(12));
    const spring = weekly.filter((x) => x.m >= 3 && x.m <= 6);
    const winter = weekly.filter((x) => x.m >= 11 || x.m <= 2);
    const per = (xs: typeof weekly) => xs.reduce((a, x) => a + x.made, 0) / xs.length;
    expect(per(spring)).toBeGreaterThan(per(winter));
  });

  it('a family that sells up is paid for its house (the money moves; the books reconcile)', () => {
    expect(s.market!.made.moving ?? 0).toBeGreaterThan(0);
    const L = s.living!;
    expect(reconcileLiving(L)).toEqual([]);
    for (const id of Object.keys(L.hh)) {
      const hh = L.hh[id];
      if (hh.lot) expect(s.econ!.lots.find((l) => l.id === hh.lot)?.hh, hh.name).toBe(id);
    }
  });
});

describe('a builder\'s spec house', () => {
  it('goes on the market when it is finished, as new construction, at a builder\'s price', () => {
    const s = advanceWeek(newGame('market-spec'), { actions: [] }).state;
    const M = ensureMarket(s)!;
    const l = s.econ!.lots.find((x) => x.home && !x.use && x.status === 'sale')!;
    l.status = 'private';
    l.use = 'bungalow';
    l.stage = 'open';
    M.spec[l.id] = { by: 'Shore Homes', w0: s.week };
    marketWeek(newCtx(s));
    expect(l.status).toBe('sale');
    expect(M.listed[l.id].why).toBe('newbuild');
    expect(l.price).toBeGreaterThan(1000);
    expect(M.spec[l.id]).toBeUndefined();
  }, 120_000);
});

describe('the market in a real game', () => {
  let s: GameState;
  beforeAll(() => {
    s = newGame('market-play');
    for (let w = 0; w < 30; w++) { s.heat = { local: 0, family: 0, federal: 0 }; s = advanceWeek(s, { actions: [] }).state; }
  }, 300_000);

  it('new listings are recorded as they come up, with a reason, and listed lots are for sale', () => {
    const M = s.market!;
    expect(M).toBeDefined();
    for (const [id] of Object.entries(M.listed)) expect(s.econ!.lots.find((l) => l.id === id)?.status, id).toBe('sale');
    const recent = newListings(s, 8);
    expect(recent.length).toBeGreaterThan(0);
    for (const x of recent) expect(kindOf(x.lot)).toBeDefined();
    for (const k of KINDS) expect(listingCounts(s)[k], k).toBeGreaterThan(0);
    // The lots already listed at the start are not all dumped at the tax sale when the month turns.
    expect(M.made.auction ?? 0).toBeLessThan(6);
    expect(Object.entries(M.made).filter(([k]) => k !== 'cut').reduce((a, [, n]) => a + (n ?? 0), 0)).toBeLessThan(30 * 4);
  });

  it('the living layer\'s books still reconcile with the market moving families', () => {
    expect(reconcileLiving(s.living!)).toEqual([]);
  });

  it('save and load: the market comes back the same and plays on the same', () => {
    const a = clone(s);
    const b = clone(s);
    const ra = advanceWeek(a, { actions: [] }).state;
    const rb = advanceWeek(b, { actions: [] }).state;
    expect(JSON.stringify(rb.market)).toBe(JSON.stringify(ra.market));
  }, 120_000);

  it('upgradeSave leaves a current save alone, and an older save without the market gets it on the next week', () => {
    const now = clone(s);
    expect(JSON.stringify(upgradeSave(clone(now)))).toBe(JSON.stringify(upgradeSave(clone(now))));
    const old = clone(s);
    delete old.market;
    const up = upgradeSave(old);
    expect(up.market).toBeUndefined();
    const M = ensureMarket(up)!;
    // The lots already on the market count as old listings, not as new this week.
    expect(Object.keys(M.listed).length).toBe(up.econ!.lots.filter((l) => l.status === 'sale').length);
    expect(newListings(up, 1).length).toBe(0);
  });
});
