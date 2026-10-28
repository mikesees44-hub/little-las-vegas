import { startBuild } from './construction';
import { marketValue } from './econ';
import { eid, type Lot, type ZoneId } from './econState';
import { placeAll } from './hoodGeo';
import { HOME_USES, homeLots, houseWord, isHomeUse } from './housing';
import type { Ctx } from './ledger';
import { pay } from './livingMoney';
import { ageOf, present } from './livingState';
import { inflation, USES_BY_ID, ZONES_BY_ID } from './property';
import { hashSeed } from './rng';
import type { GameState } from './types';
import { FACTION_NAMES } from './world';

/**
 * THE MARKET KEEPS MOVING. Land and houses come up for sale all the time, so
 * there is always something to buy (a healthy floor in each kind: house lots,
 * houses, commercial ground, commercial buildings), at prices that vary:
 *
 *   estate     an old couple's house, sold when they go to live with the children
 *   moving     a family sells up and moves to a rented flat in town
 *   teardown   an old cottage (or a tired storefront nobody wants) pulled down: the ground is sold
 *   subdivided a big lot split, the new piece sold off on its own
 *   auction    the city's tax sale: ground a rival let go for back taxes, or a lot nobody would buy at the asking
 *   newbuild   a builder puts up a house on spec and sells it finished
 *   retiring   an owner sells his going concern, the business with it
 *   owner      an owner puts an empty building on the market
 *   rival      a rival Family lets a building go
 *   bank       Chemical Bank's foreclosure, sold as it stands
 *   closed / fire / owner  (listings the rest of the game makes: a closing, a fire, an owner selling)
 *   (a winter price cut lowers a listing quietly; it is not a new listing)
 *
 * Spring brings the listings and the prices up; winter is thin and cheap, and a
 * listing that sits through it gets its price cut. The rolls are hashes of
 * (seed, week, purpose), so they never disturb the economy's own dice.
 * Every listing is recorded with the week it came up: "New listings this week".
 */

export type ListWhy = 'estate' | 'moving' | 'teardown' | 'subdivided' | 'auction' | 'newbuild' | 'retiring' | 'owner' | 'rival' | 'bank' | 'closed' | 'fire' | 'cut';

export interface Listing {
  /** The week it came on the market. */
  w: number;
  why: ListWhy;
  /** The first asking price (to show a cut). */
  ask?: number;
  /** Already on the market when the record began (never "new"). */
  old?: 1;
}

export interface MarketState {
  v: 1;
  /** Every lot on the market now, by id. */
  listed: Record<string, Listing>;
  /** Houses going up on spec: the builder's name and when he started. */
  spec: Record<string, { by: string; w0: number }>;
  /** Listings made, by reason (for the tests and the reports). */
  made: Partial<Record<ListWhy, number>>;
  lastMonth?: string;
}

export type MarketKind = 'homeLand' | 'house' | 'land' | 'building';

/** Below this many of a kind on the market, the market works harder to bring more. */
export const FLOOR: Record<MarketKind, number> = { homeLand: 20, house: 15, land: 10, building: 15 };
/** At or above this many, only the ordinary trickle of sales (no extra). */
const COMFORT: Record<MarketKind, number> = { homeLand: 60, house: 40, land: 30, building: 45 };
/** Listings a week in an ordinary month (before the season). */
const BASE: Record<MarketKind, number> = { homeLand: 0.4, house: 0.8, land: 0.25, building: 0.5 };

export const WHY_LABEL: Record<ListWhy, string> = {
  estate: 'Estate sale', moving: 'Owner moving', teardown: 'Torn down: the ground', subdivided: 'Lot split off', auction: 'City tax sale',
  newbuild: 'New construction', retiring: 'Owner retiring', owner: 'Owner selling', rival: 'A rival letting go', bank: 'Bank-owned', closed: 'Closed down', fire: 'After the fire', cut: 'Price cut',
};

const BUILDERS = ['Brennan & Sons', 'Shore Homes', 'Kovacs Construction', 'Hansen Brothers', 'Cape Atlantic Builders', 'DiNardo & Sons'];

/** What kind of listing a lot is. */
export function kindOf(l: Lot): MarketKind {
  if (l.home) return l.use ? 'house' : 'homeLand';
  return l.use ? 'building' : 'land';
}

/** Listings a month of the year brings, against an ordinary month (spring high, winter low). */
export function seasonListings(m: number): number {
  return m >= 3 && m <= 6 ? 1.6 : m === 7 || m === 8 ? 1.05 : m === 9 || m === 10 ? 0.9 : 0.45;
}

/** What the month does to asking prices (spring dear, winter cheap). */
export function seasonPrice(m: number): number {
  return m >= 4 && m <= 6 ? 1.07 : m === 7 || m === 8 ? 1.03 : m === 3 || m === 9 ? 1 : m === 10 ? 0.96 : 0.9;
}

const PRICE_MUL: Partial<Record<ListWhy, number>> = { estate: 0.88, moving: 1, teardown: 1, subdivided: 0.92, auction: 0.72, newbuild: 1.12, retiring: 1.05, owner: 1, rival: 1.08, bank: 0.8 };

function rnd(s: GameState, purpose: string): number {
  return hashSeed(`${s.seed}:mkt:${s.week}:${purpose}`) / 4294967296;
}

function chron(s: GameState, text: string): void {
  s.chronicle.push({ week: s.week, date: { ...s.date }, text, kind: 'misc' });
}

/** The market's record, made the first time it is needed (the lots already for sale count as old listings). */
export function ensureMarket(s: GameState): MarketState | undefined {
  if (!s.econ?.lots.length) return undefined;
  if (!s.market) {
    const listed: Record<string, Listing> = {};
    for (const l of s.econ.lots) if (l.status === 'sale') listed[l.id] = { w: s.week, why: 'owner', ask: l.price, old: 1 };
    s.market = { v: 1, listed, spec: {}, made: {} };
  }
  return s.market;
}

/** How many of each kind are on the market. */
export function listingCounts(s: GameState): Record<MarketKind, number> {
  const c: Record<MarketKind, number> = { homeLand: 0, house: 0, land: 0, building: 0 };
  for (const l of s.econ?.lots ?? []) if (l.status === 'sale') c[kindOf(l)]++;
  return c;
}

/** The asking price for a new listing: what it is worth, the month, the reason, and the seller's own idea (±12%). */
export function askingPrice(s: GameState, l: Lot, why: ListWhy): number {
  const j = 0.88 + 0.27 * (hashSeed(`${s.seed}:ask:${l.id}:${s.week}`) / 4294967296);
  return Math.max(200, Math.round(marketValue(s, l) * seasonPrice(s.date.m) * (PRICE_MUL[why] ?? 1) * j / 50) * 50);
}

function list(s: GameState, M: MarketState, l: Lot, why: ListWhy, price?: number): void {
  l.status = 'sale';
  l.owner = 'private';
  l.price = price ?? askingPrice(s, l, why);
  M.listed[l.id] = { w: s.week, why, ask: l.price };
  M.made[why] = (M.made[why] ?? 0) + 1;
}

/* ------------------------------------------------------------------ */
/* Where new listings come from                                         */
/* ------------------------------------------------------------------ */

const isLived = (l: Lot) => !!l.hh;
const free = (l: Lot) => l.status === 'private' && l.owner === 'private' && !l.bizId && !l.hh && !l.operating;
const oldHouse = (s: GameState, l: Lot) => l.condition < 55 || (l.builtYear ?? 1950) < 1925 || s.date.y - (l.builtYear ?? 1950) > 45;

/** The household in a house moves to a rented flat; the house's worth is theirs (the agent's buyer pays). */
function sellUp(ctx: Ctx, l: Lot, why: 'estate' | 'moving'): string | undefined {
  const s = ctx.s;
  const L = s.living;
  const hh = l.hh ? L?.hh[l.hh] : undefined;
  if (!L || !hh || !l.hhOwns) return undefined;
  const worth = Math.round(marketValue(s, l) * (why === 'estate' ? 0.85 : 0.92) / 50) * 50;
  pay(ctx, L, 'x:land', `h:${hh.id}`, worth, `${hh.name} sell ${l.address}`);
  delete l.hh;
  delete l.hhOwns;
  delete hh.lot;
  hh.rent = hh.rent || Math.max(6, Math.round(10 * inflation(s)));
  hh.home = why === 'estate' ? 'a flat over their daughter\'s' : 'a rented flat in town';
  const fam = hh.name.replace(/^the /, 'The ');
  return why === 'estate' ? `${fam} are getting on: their ${houseWord(l.use)} at ${l.address} is for sale, and they are going to live with the children.` : `${fam} sold up: their ${houseWord(l.use)} at ${l.address} is on the market, and they have taken a flat in town.`;
}

function elderly(s: GameState, l: Lot): boolean {
  const L = s.living;
  const hh = l.hh ? L?.hh[l.hh] : undefined;
  if (!L || !hh) return false;
  const adults = hh.members.map((id) => L.people[id]).filter((p) => present(p, s.week) && ageOf(p, s.date.y, s.date.m) >= 18);
  return adults.length > 0 && adults.every((p) => ageOf(p, s.date.y, s.date.m) >= 68);
}

function tearDown(s: GameState, l: Lot, who: string): void {
  (l.past ??= []).push({ use: l.use ?? 'house', from: l.builtYear ?? 1925, to: s.date.y, why: 'torn down' });
  l.past = l.past.slice(-6);
  (l.history ??= []).push({ year: s.date.y, week: s.week, owner: 'private', how: 'sold', by: who });
  delete l.use;
  delete l.stage;
  delete l.tenant;
  delete l.name;
  delete l.builtYear;
  delete l.renovated;
  l.condition = 100;
  l.rent = 0;
}

/** A new lot split off a big one, where there is ground for it on the map. */
function subdivide(s: GameState, parent: Lot): Lot | undefined {
  const e = s.econ!;
  const m = /^(\d+)\s+(.+)$/.exec(parent.address);
  const street = m ? m[2] : parent.address;
  const taken = new Set(e.lots.map((l) => l.address));
  let num = m ? Number(m[1]) + 2 : 1;
  while (taken.has(`${num} ${street}`) && num < 9999) num += 2;
  const idx = Math.max(0, ...e.lots.filter((l) => l.zone === parent.zone).map((l) => l.idx)) + 1;
  const lot: Lot = { id: eid(e, `${parent.id}-split`), zone: parent.zone, idx, address: `${num} ${street}`, status: 'private', owner: 'private', price: 0, rent: 0, condition: 100, history: [{ year: s.date.y, week: s.week, owner: 'private', how: 'sold', by: `split off ${parent.address}` }] };
  if (parent.home) lot.home = 1;
  e.lots.push(lot);
  // Only where the map has a place for it.
  if (!placeAll(s).has(lot.id)) { e.lots.pop(); return undefined; }
  return lot;
}

function pickBy<T>(s: GameState, arr: T[], purpose: string): T | undefined {
  return arr.length ? arr[Math.floor(rnd(s, purpose) * arr.length)] : undefined;
}

/** One new listing of a kind; undefined when nothing could come up. */
function bringOne(ctx: Ctx, M: MarketState, kind: MarketKind, n: number): string | undefined {
  const s = ctx.s;
  const lots = s.econ!.lots;
  const r = rnd(s, `${kind}:${n}:how`);
  const tag = `${kind}:${n}`;
  if (kind === 'house') {
    const houses = homeLots(s).filter((l) => l.use && l.stage === 'open' && l.status === 'private' && l.owner === 'private' && isHomeUse(l.use));
    const old = houses.filter((l) => isLived(l) && l.hhOwns && elderly(s, l));
    const owned = houses.filter((l) => isLived(l) && l.hhOwns && !s.housing?.builds[l.id]);
    const empty = houses.filter((l) => !isLived(l));
    // A rival Family that bought up houses lets one go (last, only when nothing else comes up).
    const held = homeLots(s).filter((l) => l.use && l.stage === 'open' && l.status === 'rival' && !l.hh && isHomeUse(l.use));
    const order: [Lot[], 'estate' | 'moving' | 'owner' | 'rival'][] = r < 0.35 ? [[old, 'estate'], [owned, 'moving'], [empty, 'owner']] : r < 0.75 ? [[owned, 'moving'], [old, 'estate'], [empty, 'owner']] : [[empty, 'owner'], [owned, 'moving'], [old, 'estate']];
    order.push([held, 'rival']);
    for (const [pool, why] of order) {
      const l = pickBy(s, pool.sort((a, b) => a.id.localeCompare(b.id)), `${tag}:${why}`);
      if (!l) continue;
      const from = l.owner;
      const text = why === 'owner' || why === 'rival' ? undefined : sellUp(ctx, l, why);
      if ((why === 'estate' || why === 'moving') && !text) continue;
      list(s, M, l, why);
      if (text) chron(s, text);
      if (why === 'rival') chron(s, `${FACTION_NAMES[from as keyof typeof FACTION_NAMES] ?? 'A rival'} put the house at ${l.address} on the market.`);
      return l.id;
    }
    return undefined;
  }
  if (kind === 'homeLand') {
    const houses = homeLots(s).filter((l) => l.use && l.stage === 'open' && free(l) && oldHouse(s, l)).sort((a, b) => a.id.localeCompare(b.id));
    const oldLived = homeLots(s).filter((l) => l.use && l.stage === 'open' && l.status === 'private' && l.hhOwns && elderly(s, l) && l.condition < 60).sort((a, b) => a.id.localeCompare(b.id));
    if (r < 0.45) {
      const l = pickBy(s, houses, `${tag}:td`) ?? pickBy(s, oldLived, `${tag}:tde`);
      if (l) {
        const was = houseWord(l.use);
        if (l.hh) sellUp(ctx, l, 'estate');
        tearDown(s, l, 'the wreckers');
        list(s, M, l, 'teardown');
        chron(s, `The old ${was} at ${l.address} came down; the ground is for sale.`);
        return l.id;
      }
    }
    if (r < 0.75) {
      const parents = homeLots(s).filter((l) => l.use && l.stage === 'open' && l.status === 'private' && !l.id.includes('-split')).sort((a, b) => a.id.localeCompare(b.id));
      const p = pickBy(s, parents, `${tag}:sub`);
      const l = p ? subdivide(s, p) : undefined;
      if (l) { list(s, M, l, 'subdivided'); chron(s, `The lot behind ${p!.address} was split off and put up for sale (${l.address}).`); return l.id; }
    }
    // The city's tax sale: a lot a rival let go, or ground nobody would buy at the asking.
    const seized = lots.filter((l) => l.home && !l.use && l.status === 'rival').sort((a, b) => a.id.localeCompare(b.id));
    const l = pickBy(s, seized, `${tag}:tax`) ?? pickBy(s, houses, `${tag}:td2`);
    if (!l) return undefined;
    if (l.use) { tearDown(s, l, 'the wreckers'); list(s, M, l, 'teardown'); return l.id; }
    list(s, M, l, 'auction');
    chron(s, `The city put ${l.address} up at its tax sale.`);
    return l.id;
  }
  if (kind === 'land') {
    const tired = lots.filter((l) => !l.home && l.use && l.stage === 'open' && free(l) && !l.tenant && l.condition < 55 && l.zone !== 'piers').sort((a, b) => a.id.localeCompare(b.id));
    const seized = lots.filter((l) => !l.home && !l.use && !l.stage && l.status === 'rival').sort((a, b) => a.id.localeCompare(b.id));
    if (r < 0.35) {
      const l = pickBy(s, tired, `${tag}:td`);
      if (l) { const was = USES_BY_ID[l.use!]?.name.toLowerCase() ?? 'building'; tearDown(s, l, 'the wreckers'); list(s, M, l, 'teardown'); chron(s, `The old ${was} at ${l.address} was pulled down; the lot is for sale.`); return l.id; }
    }
    if (r < 0.6) {
      const l = pickBy(s, seized, `${tag}:tax`);
      if (l) { list(s, M, l, 'auction'); chron(s, `The city took ${l.address} for back taxes and put it up at auction.`); return l.id; }
    }
    const zones: ZoneId[] = ['downtown', 'docks', 'pacific', 'crest', 'north', 'westww', 'causeway'];
    const parents = lots.filter((l) => !l.home && zones.includes(l.zone) && l.use && l.status === 'private' && !l.id.includes('-split')).sort((a, b) => a.id.localeCompare(b.id));
    const p = pickBy(s, parents, `${tag}:sub`);
    const l = p ? subdivide(s, p) : undefined;
    if (l) { list(s, M, l, 'subdivided'); chron(s, `A piece of ground off ${ZONES_BY_ID[l.zone]?.streets[0] ?? 'the avenue'} was split off and put up for sale (${l.address}).`); return l.id; }
    const t = pickBy(s, tired, `${tag}:td2`);
    if (t) { tearDown(s, t, 'the wreckers'); list(s, M, t, 'teardown'); return t.id; }
    return undefined;
  }
  // A building: an owner retiring sells the going concern; an empty one; a rival lets one go.
  const going = lots.filter((l) => !l.home && l.use && l.stage === 'open' && l.status === 'private' && l.owner === 'private' && !l.bizId && !l.operating && l.tenant && !s.living?.biz[l.id] && !Object.values(s.living?.biz ?? {}).some((b) => b.lot === l.id)).sort((a, b) => a.id.localeCompare(b.id));
  const empty = lots.filter((l) => !l.home && l.use && l.stage === 'open' && free(l) && !l.tenant).sort((a, b) => a.id.localeCompare(b.id));
  const rivals = lots.filter((l) => !l.home && l.use && l.stage === 'open' && l.status === 'rival' && !l.bizId).sort((a, b) => a.id.localeCompare(b.id));
  const order: [Lot[], 'retiring' | 'owner' | 'rival'][] = r < 0.5 ? [[going, 'retiring'], [empty, 'owner'], [rivals, 'rival']] : r < 0.85 ? [[empty, 'owner'], [going, 'retiring'], [rivals, 'rival']] : [[rivals, 'rival'], [going, 'retiring'], [empty, 'owner']];
  for (const [pool, why] of order) {
    const l = pickBy(s, pool, `${tag}:${why}`);
    if (!l) continue;
    const from = l.owner;
    list(s, M, l, why);
    if (why === 'rival') chron(s, `${FACTION_NAMES[from as keyof typeof FACTION_NAMES] ?? 'A rival'} put ${l.name ?? l.address} on the market.`);
    return l.id;
  }
  return undefined;
}

/** A builder puts up a house on spec on a lot he buys (only while there is ground to spare). */
function specBuild(s: GameState, M: MarketState, counts: Record<MarketKind, number>): void {
  if (counts.homeLand <= FLOOR.homeLand || Object.keys(M.spec).length >= 6) return;
  if (rnd(s, 'spec') >= 0.12 * seasonListings(s.date.m) * (counts.house < FLOOR.house ? 2.5 : 1)) return;
  const land = homeLots(s).filter((l) => !l.use && !l.stage && l.status === 'sale' && !l.hh).sort((a, b) => a.price - b.price || a.id.localeCompare(b.id));
  const l = land[Math.floor(rnd(s, 'spec:lot') ** 2 * land.length)];
  if (!l) return;
  const by = BUILDERS[Math.floor(rnd(s, 'spec:by') * BUILDERS.length)];
  const use = HOME_USES[Math.floor(rnd(s, 'spec:use') * 4)];
  (l.history ??= []).push({ year: s.date.y, week: s.week, owner: 'private', how: 'bought', by, price: l.price });
  l.status = 'private';
  l.owner = 'private';
  delete M.listed[l.id];
  startBuild(s, l, use, by);
  M.spec[l.id] = { by, w0: s.week };
}

/** Spec houses that are finished go on the market. */
function specDone(s: GameState, M: MarketState): void {
  for (const [id, sp] of Object.entries(M.spec)) {
    const l = s.econ!.lots.find((y) => y.id === id);
    if (!l || !l.use || l.status !== 'private' || l.hh) { if (!l || l.status !== 'private' || l.hh || !l.use) delete M.spec[id]; continue; }
    if (l.stage !== 'open') { if (s.week - sp.w0 > 80) delete M.spec[id]; continue; }
    delete M.spec[id];
    l.name = `${sp.by}'s new ${houseWord(l.use)}`;
    (l.history ??= []).push({ year: s.date.y, week: s.week, owner: 'private', how: 'built', by: sp.by });
    list(s, M, l, 'newbuild');
    chron(s, `${sp.by} finished a new ${houseWord(l.use)} at ${l.address} and put it on the market.`);
  }
}

/** Listings the rest of the game made this week (a closing, a fire, a foreclosure) are recorded too. */
function record(s: GameState, M: MarketState): void {
  const L = s.living;
  for (const l of s.econ!.lots) {
    const on = M.listed[l.id];
    if (l.status !== 'sale') { if (on) delete M.listed[l.id]; continue; }
    if (on) continue;
    const last = l.past?.[l.past.length - 1];
    const bank = L?.debts.some((d) => d.lot === l.id && d.st === 'seized' && d.lender === 'bank');
    const why: ListWhy = bank ? 'bank' : last && last.to === s.date.y && last.why === 'closed' ? 'closed' : !l.use && last && last.to === s.date.y && /burn|fire/.test(last.why) ? 'fire' : 'owner';
    if (why === 'bank') l.price = Math.max(200, Math.round(l.price * (PRICE_MUL.bank ?? 1) / 50) * 50);
    M.listed[l.id] = { w: s.week, why, ask: l.price };
    M.made[why] = (M.made[why] ?? 0) + 1;
  }
}

/** Once a month: winter cuts on what has sat; ground nobody bought in a year goes to the tax sale. */
function monthly(s: GameState, M: MarketState): void {
  const m = s.date.m;
  for (const l of s.econ!.lots) {
    const on = M.listed[l.id];
    if (!on || l.status !== 'sale') continue;
    const age = s.week - on.w;
    if ((m >= 11 || m <= 2) && age >= 10 && rnd(s, `cut:${l.id}`) < 0.5) {
      // A quiet cut: the listing keeps its week (the first ask shows struck through).
      l.price = Math.max(200, Math.round(l.price * 0.95 / 50) * 50);
      M.made.cut = (M.made.cut ?? 0) + 1;
    } else if (!l.use && age >= 52 && rnd(s, `tax:${l.id}`) < 0.25) {
      l.price = Math.max(200, Math.round(l.price * 0.8 / 50) * 50);
      M.listed[l.id] = { w: s.week, why: 'auction', ask: on.ask };
      M.made.auction = (M.made.auction ?? 0) + 1;
    }
  }
}

let ENABLED = true;
/** Tests can switch the market off (to compare against the town without it). */
export function setMarketEnabled(on: boolean): void {
  ENABLED = on;
}

export function marketWeek(ctx: Ctx): void {
  if (!ENABLED) return;
  const s = ctx.s;
  const M = ensureMarket(s);
  if (!M) return;
  specDone(s, M);
  const counts = listingCounts(s);
  const season = seasonListings(s.date.m);
  for (const kind of ['house', 'homeLand', 'building', 'land'] as MarketKind[]) {
    const c = counts[kind];
    // The ordinary trickle (by the season), and more when the shelves are thin.
    const trickle = BASE[kind] * season * (c < COMFORT[kind] ? 1 : c < COMFORT[kind] * 1.5 ? 0.3 : 0);
    const short = Math.max(0, FLOOR[kind] + 3 - c);
    const rate = trickle + short * 0.4 * (0.6 + 0.4 * season);
    let n = Math.floor(rate) + (rnd(s, `${kind}:n`) < rate - Math.floor(rate) ? 1 : 0);
    n = Math.min(n, short > 0 ? 6 : 3);
    for (let i = 0; i < n; i++) if (bringOne(ctx, M, kind, i)) counts[kind]++;
  }
  specBuild(s, M, counts);
  const mk = `${s.date.y}-${s.date.m}`;
  if (M.lastMonth !== mk) {
    if (M.lastMonth) monthly(s, M);
    M.lastMonth = mk;
  }
  record(s, M);
}

/** The lots that came on the market in the last `weeks` weeks played (the newest first). */
export function newListings(s: GameState, weeks = 1): { lot: Lot; l: Listing }[] {
  const M = s.market;
  if (!M) return [];
  const byId = new Map((s.econ?.lots ?? []).map((l) => [l.id, l]));
  return Object.entries(M.listed)
    .filter(([, l]) => !l.old && l.w >= s.week - weeks)
    .map(([id, l]) => ({ lot: byId.get(id)!, l }))
    .filter((x) => x.lot && x.lot.status === 'sale')
    .sort((a, b) => b.l.w - a.l.w || a.lot.price - b.lot.price);
}
