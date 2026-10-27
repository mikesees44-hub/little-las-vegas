import { isInSeason } from './calendar';
import { startBuild } from './construction';
import { marketValue } from './econ';
import type { Lot, ZoneId } from './econState';
import { HOODS_BY_ID, hoodOfZone, RES_SEED, type HoodId } from './hoodData';
import { ensureHood } from './hoodState';
import type { Ctx } from './ledger';
import { districtCapo, capoBriefs, fact } from './livingKnow';
import { pay } from './livingMoney';
import { closeStory, link, openStory, openStoryOf } from './livingStory';
import { addHousehold, ageOf, makeFamily, pname, present, roll, stream, type LivingState, type Td, type Th, type Tp } from './livingState';
import { borrow, livingIndex, newDebt, upkeepOf, type LivingIdx } from './livingWorld';
import { queueRequest } from './livingAsk';
import { BUILD_STAGES, buildCost, inflation, STAGE_COST, USES_BY_ID, ZONES_BY_ID } from './property';
import { SURNAMES } from './names';
import { hashSeed, pick } from './rng';
import { deskApply, deskOpen } from './familyBank';
import type { Ethnicity, GameState } from './types';

/**
 * THE TOWN'S HOUSES. Wildwood, the Crest, North Wildwood and West Wildwood
 * get their house lots from the town package (hundreds of them, invented and
 * placed approximately): bungalows, cottages, duplexes, Victorian shore
 * houses and rooming houses with the families of the living layer in them,
 * and empty lots for sale.
 *
 * The families build with THEIR OWN money. A household saves; when it can,
 * it buys a lot (the price goes to the seller), finances the rest with a real
 * lender (Chemical Bank's mortgage; turned down there, the Family's loan desk
 * if the boss runs a bank or a book; else a relative or the street), hires a
 * builder (one of the boss's construction fronts, which then earns from the
 * job; a rival's; an independent's) and pays him stage by stage out of its
 * own cash. The house goes up through the ordinary construction stages and
 * the family moves in. Short of money, a family stalls, goes to the capo
 * (a real request to the boss), and in the end sells the half-built house.
 * A mortgage gone bad is foreclosed. Money only ever moves (livingMoney.pay):
 * nothing is created.
 *
 * Pace follows the season and the era; the lots never all fill (a floor of
 * empty ground stays). Rolls are hashes of (seed, week, purpose): adding a
 * family never reshuffles another's.
 */

export interface HBuild {
  lot: string;
  hh: string;
  use: string;
  /** Who pays the builder: 'family' (one of yours), 'rival:<id>', or 'x:build' (an independent). */
  acct: string;
  /** The builder's name. */
  bname: string;
  /** Your company, when it is one of yours. */
  bizId?: string;
  cost: number;
  paid: number;
  w0: number;
  /** Weeks the family has been short of the builder's money. */
  short?: number;
  asked?: number;
}

export interface HousingStats { lotsBought: number; started: number; built: number; movedIn: number; sold: number; foreclosed: number; gaveUp: number; bankYes: number; bankNo: number; deskApps: number; rented: number }

export interface HousingState {
  v: 1;
  /** The house lots are on the market (by id: an old save gets the ones it lacks). */
  lotsIn: number;
  /** The families are in their houses. */
  peopled?: 1;
  builds: Record<string, HBuild>;
  /** A family waiting on the Family's loan desk: what it means to do when the money comes. */
  wait: Record<string, { lot: string; use: string; app: string; w: number }>;
  /** At the start: empty house lots and houses (the caps are measured from these). */
  init: { vacant: number; houses: number; hh?: number; pop?: number };
  stats: HousingStats;
  lastMonth?: string;
}

/** The kinds of house the town's families put up, cheapest first. */
export const HOME_USES = ['bungalow', 'cottage', 'house', 'duplex', 'shorehouse'];
const RES_USES = new Set([...HOME_USES, 'rooming']);
/** Chemical Bank: a twenty-year mortgage at about 5½% (simple-interest total over the term). */
export const MORTGAGE = { weeks: 1040, total: 0.65, down: 0.2, share: 0.25 };
const BUILDERS = ['Brennan & Sons, builders', 'Shore Homes', 'Kovacs Construction', 'Hansen Brothers Carpentry', 'Cape Atlantic Builders', 'DiNardo & Sons'];
const ETHS: Ethnicity[] = ['Italian', 'Irish', 'Jewish'];

export function isHomeUse(use: string | undefined): boolean {
  return !!use && RES_USES.has(use);
}

function blankStats(): HousingStats {
  return { lotsBought: 0, started: 0, built: 0, movedIn: 0, sold: 0, foreclosed: 0, gaveUp: 0, bankYes: 0, bankNo: 0, deskApps: 0, rented: 0 };
}

/** "the Kowalski family" -> "the Kowalskis". */
export function famName(hh: Th): string {
  const m = /^the (.+?) (family|household)$/.exec(hh.name);
  if (!m) return hh.name;
  const sur = m[1];
  return `the ${/s$/.test(sur) ? `${sur}es` : `${sur}s`}`;
}

/** Where a lot is, for the chronicle ("on 24th Ave", "on Atlantic Ave"). */
export function streetOf(l: Lot): string {
  return l.address.replace(/^\d+\s+/, '');
}

function homeName(sur: string, use: string): string {
  const u = USES_BY_ID[use];
  const word = use === 'house' ? 'house' : u ? u.name.replace(/^Victorian /, '').toLowerCase() : 'house';
  return `The ${sur} ${word}`;
}

function surOf(hh: Th): string {
  return /^the (.+?) (family|household)$/.exec(hh.name)?.[1] ?? 'family';
}

/* ------------------------------------------------------------------ */
/* The lots                                                            */
/* ------------------------------------------------------------------ */

function resLot(s: GameState, i: number): Lot {
  const r = RES_SEED[i];
  const z = ZONES_BY_ID[r.zone];
  const land = Math.round(1500 * z.land * (0.75 + 0.1 * ((i * 7) % 5)) * inflation(s) / 50) * 50;
  const lot: Lot = { id: r.id, zone: r.zone, idx: 1000 + i, address: r.address, status: r.status, owner: 'private', price: land, rent: 0, condition: 100, home: 1 };
  if (r.use) {
    const u = USES_BY_ID[r.use];
    lot.use = r.use;
    lot.stage = 'open';
    lot.builtYear = r.built;
    lot.condition = r.cond ?? 70;
    lot.price = land + Math.round(u.cost * z.land * 0.85 * (0.6 + 0.4 * lot.condition / 100) * inflation(s) / 50) * 50;
    lot.history = [{ year: r.built ?? 1925, week: 0, owner: 'private', how: 'built' }];
  }
  return lot;
}

/** The layer, made the first time it is needed (and the house lots a save lacks are added by id). */
export function ensureHousing(s: GameState): HousingState | undefined {
  const e = s.econ;
  if (!e || !e.lots.length) return undefined;
  const hood = ensureHood(s);
  if (!s.housing) s.housing = { v: 1, lotsIn: 0, builds: {}, wait: {}, init: { vacant: 0, houses: 0 }, stats: blankStats() };
  const H = s.housing;
  H.wait ??= {};
  H.stats = { ...blankStats(), ...H.stats };
  if (H.lotsIn !== RES_SEED.length) {
    const have = new Set(e.lots.map((l) => l.id));
    RES_SEED.forEach((r, i) => {
      if (have.has(r.id)) return;
      e.lots.push(resLot(s, i));
      if (r.use && hood) hood.styles[r.id] ??= { style: r.style ?? 'colonial', sign: 'white', since: r.built ?? 1925 };
    });
    H.lotsIn = RES_SEED.length;
    if (!H.init.vacant) {
      const res = e.lots.filter((l) => l.home);
      H.init = { vacant: res.filter((l) => !l.use).length, houses: res.filter((l) => l.use).length };
    }
  }
  return H;
}

/** The town's house lots and houses (pure). */
export function homeLots(s: GameState): Lot[] {
  return (s.econ?.lots ?? []).filter((l) => l.home);
}

export function vacantHomeLots(s: GameState): Lot[] {
  return homeLots(s).filter((l) => !l.use && l.status === 'sale');
}

/* ------------------------------------------------------------------ */
/* The families in the houses (made once, when the living layer exists) */
/* ------------------------------------------------------------------ */

function hoodOf(l: Lot): HoodId {
  return hoodOfZone(l.zone) ?? 'downtown';
}

/** Jobs and wages for a household of the town: the head works off the island (or is retired), the spouse keeps house or works too. */
function employ(L: LivingState, s: GameState, hh: Th, h: { rng: number }, infl: number, wage: number): void {
  for (const id of hh.members) {
    const p = L.people[id];
    const a = ageOf(p, s.date.y, s.date.m);
    if (a < 6) continue;
    if (a < 18) { p.job = 'school'; continue; }
    if (a >= 66) { p.job = 'retired'; continue; }
    const head = hh.members[0] === id;
    if (head) { p.job = 'out'; p.wage = Math.round(wage * infl); continue; }
    if (id === L.people[hh.members[0]]?.sp) { if (roll(L, 0, `job:${id}`) < 0.35) { p.job = 'out'; p.wage = Math.round((40 + roll(L, 0, `w:${id}`) * 15) * infl); } else p.job = 'home'; continue; }
    p.job = 'out';
    p.wage = Math.round((42 + roll(L, 0, `w:${id}`) * 12) * infl);
  }
  void h;
}

/** A family for a house: owners or renters, with savings that fit. */
function familyFor(ctx: Ctx, L: LivingState, l: Lot, owns: boolean, cashMul = 1): Th {
  const s = ctx.s;
  const h = stream(L, 0, `home:${l.id}`);
  const eth = pick(h, ETHS);
  const sur = pick(h, SURNAMES[eth]);
  const infl = inflation(s);
  const r = roll(L, 0, `home$:${l.id}`);
  const cash = Math.round((owns ? 300 + r * 2600 : 150 + r * 2200) * infl * cashMul);
  const hh = addHousehold(L, s, `the ${sur} family`, `${owns ? 'their' : 'a rented'} ${USES_BY_ID[l.use!]?.name.toLowerCase() ?? 'house'} at ${l.address}`, hoodOf(l), 0, owns ? 0 : 11 + Math.round(r * 7));
  // What they have put by (journaled, so the district's books reconcile).
  if (cash > 0) pay(ctx, L, 'x:arrive', `h:${hh.id}`, cash, `${hh.name}: what they had put by`);
  const age = owns ? 30 + Math.floor(roll(L, 0, `age:${l.id}`) * 42) : 23 + Math.floor(roll(L, 0, `age:${l.id}`) * 30);
  makeFamily(L, s, h, hh, sur, eth, age);
  employ(L, s, hh, h, infl, 55 + Math.round(roll(L, 0, `wage:${l.id}`) * 45));
  if (!owns && roll(L, 0, `save:${l.id}`) < 0.6) hh.save = 1;
  hh.lot = l.id;
  l.hh = hh.id;
  if (owns) l.hhOwns = 1; else delete l.hhOwns;
  l.name = homeName(sur, l.use!);
  for (const id of hh.members) pay(ctx, L, 'x:arrive', `p:${id}`, Math.round(roll(L, 0, `stash:${id}`) * 40 * infl), `${pname(L.people[id])}'s own money`);
  return hh;
}

/** The households of the town's houses (most houses lived in; about two in three owned by the family in them). */
function peopleHouses(ctx: Ctx, L: LivingState, H: HousingState): void {
  const s = ctx.s;
  let n = 0;
  let pop = 0;
  for (const l of homeLots(s)) {
    if (!l.use || l.stage !== 'open' || l.hh || l.status === 'owned' || l.status === 'leased') continue;
    const r = roll(L, 0, `occ:${l.id}`);
    if (r < 0.1) { l.status = 'sale'; l.price = Math.max(l.price, 500); continue; } // an empty house, for sale
    const owns = r < 0.66;
    const hh = familyFor(ctx, L, l, owns);
    n++;
    pop += hh.members.length;
  }
  H.init.hh = n;
  H.init.pop = pop;
  H.peopled = 1;
}

/* ------------------------------------------------------------------ */
/* Money: income, the bank                                             */
/* ------------------------------------------------------------------ */

/** A household's weekly earnings (wages, and an owner's take). */
export function weeklyIncome(L: LivingState, hh: Th, week: number): number {
  let n = 0;
  for (const id of hh.members) {
    const p = L.people[id];
    if (!present(p, week)) continue;
    if (p.wage && p.job && p.job !== 'school') n += p.wage;
    const b = p.job ? L.biz[p.job] : undefined;
    if (b && b.owner === p.id) n += Math.max(0, Math.round(b.net * 0.6));
  }
  return n;
}

/** What the household owes every week on its open debts. */
export function weeklyDebt(L: LivingState, hh: Th): number {
  return L.debts.filter((d) => d.hh === hh.id && d.st === 'open').reduce((a, d) => a + d.pay, 0);
}

export interface BankVerdict { ok: boolean; why: string[]; pay: number }

/**
 * Chemical Bank looks at the family's real finances: the down payment, what
 * the payments would take out of the week, its record (a default or a
 * skipped debt anywhere), the borrower's age.
 */
export function chemicalBank(s: GameState, L: LivingState, hh: Th, amt: number, o: { total: number; own: number; weeks?: number; rate?: number }): BankVerdict {
  const weeks = o.weeks ?? MORTGAGE.weeks;
  const pay = Math.max(1, Math.ceil(amt * (1 + (o.rate ?? MORTGAGE.total)) / weeks));
  const inc = weeklyIncome(L, hh, s.week);
  const owed = weeklyDebt(L, hh);
  const why: string[] = [];
  if (o.own < o.total * MORTGAGE.down) why.push(`not enough down (has $${Math.max(0, Math.round(o.own)).toLocaleString('en-US')}, the bank wants ${Math.round(MORTGAGE.down * 100)}%)`);
  if (pay + owed > inc * MORTGAGE.share) why.push(`the payments ($${pay}/wk) would be too much of $${inc}/wk coming in`);
  const head = L.people[hh.members.find((id) => present(L.people[id], s.week) && ageOf(L.people[id], s.date.y, s.date.m) >= 18) ?? ''];
  if (L.debts.some((d) => d.hh === hh.id && (d.dw !== undefined || d.st === 'skipped' || d.st === 'seized'))) why.push('a debt gone bad on their record');
  if (head && ageOf(head, s.date.y, s.date.m) > 58 && weeks > 520) why.push('too old for a twenty-year note');
  if (!inc) why.push('nobody in the house is working');
  return { ok: !why.length, why, pay };
}

/** The account the lot's price goes to. */
function sellerAcct(_s: GameState, L: LivingState, l: Lot): string {
  if (l.hh && l.hhOwns && L.hh[l.hh] && L.hh[l.hh].gone === undefined) return `h:${l.hh}`;
  if (l.owner !== 'private' && l.owner !== 'city' && l.owner !== 'player') return `rival:${l.owner}`;
  if (l.status === 'owned') return 'family';
  return 'x:land';
}

function headOf(L: LivingState, hh: Th, week: number): Tp | undefined {
  const adults = hh.members.map((id) => L.people[id]).filter((p): p is Tp => present(p, week) && p.job !== 'school' && p.job !== undefined);
  return adults.find((p) => p.job === 'out' || (!!p.job && !!L.biz[p.job])) ?? adults[0] ?? hh.members.map((id) => L.people[id]).find((p) => present(p, week));
}

function chron(s: GameState, text: string): void {
  s.chronicle.push({ week: s.week, date: { ...s.date }, text, kind: 'misc' });
}

/* ------------------------------------------------------------------ */
/* Builders                                                            */
/* ------------------------------------------------------------------ */

export interface Builder { acct: string; name: string; bizId?: string; mine: boolean }

/** Who builds houses in town: your construction fronts, the rivals', the independents. */
export function builders(s: GameState): Builder[] {
  const out: Builder[] = [];
  for (const b of s.businesses) {
    if (b.kind !== 'construction' || (b.closedUntil !== undefined && b.closedUntil > s.week)) continue;
    if (b.owner === 'player') out.push({ acct: 'family', name: b.name, bizId: b.id, mine: true });
    else if (s.rivals.some((r) => r.id === b.owner)) out.push({ acct: `rival:${b.owner}`, name: b.name, bizId: b.id, mine: false });
  }
  return out;
}

function chooseBuilder(s: GameState, L: LivingState, key: string): Builder {
  const all = builders(s);
  const mine = all.filter((b) => b.mine);
  const rival = all.filter((b) => !b.mine);
  const r = roll(L, s.week, `builder:${key}`);
  if (mine.length && r < 0.55) return mine[Math.floor(roll(L, s.week, `bm:${key}`) * mine.length)];
  if (rival.length && r < 0.75) return rival[Math.floor(roll(L, s.week, `br:${key}`) * rival.length)];
  return { acct: 'x:build', name: BUILDERS[Math.floor(roll(L, s.week, `bi:${key}`) * BUILDERS.length)], mine: false };
}

/* ------------------------------------------------------------------ */
/* A family builds                                                      */
/* ------------------------------------------------------------------ */

export interface HomePlan { lot: Lot; use: string; price: number; cost: number; total: number; own: number; need: number }

/** What a household could build on a lot: the biggest house it can carry (the cheapest when it is short). */
export function planFor(_s: GameState, L: LivingState, hh: Th, l: Lot, x: Pick<LivingIdx, 'y' | 'm' | 'week' | 'infl'>): HomePlan {
  const own = Math.max(0, hh.cash - upkeepOf(L, hh, x) * 8);
  const opts = HOME_USES.filter((u) => u !== 'shorehouse' || hh.cash > 4000 * x.infl).map((use) => {
    const cost = buildCost(l, USES_BY_ID[use]);
    return { use, cost, total: l.price + cost };
  });
  const fit = [...opts].reverse().find((o) => own >= o.total * 0.35) ?? opts[0];
  return { lot: l, use: fit.use, price: l.price, cost: fit.cost, total: fit.total, own, need: Math.max(0, fit.total - own) };
}

/** Buy the lot, break ground with a builder. The money must already be in the house (own savings and loans). */
function breakGround(ctx: Ctx, L: LivingState, H: HousingState, hh: Th, plan: HomePlan, how: string): boolean {
  const s = ctx.s;
  const l = plan.lot;
  if (l.use || l.status !== 'sale' || hh.cash < plan.price) return false;
  const head = headOf(L, hh, s.week);
  const got = pay(ctx, L, `h:${hh.id}`, sellerAcct(s, L, l), plan.price, `${hh.name} buy the lot at ${l.address}`, 'business');
  if (got < plan.price) return false;
  (l.history ??= []).push({ year: s.date.y, week: s.week, owner: 'private', how: 'bought', by: hh.name, price: got });
  l.status = 'private';
  l.owner = 'private';
  l.hhOwns = 1;
  delete l.bidder;
  H.stats.lotsBought++;
  const b = chooseBuilder(s, L, l.id);
  startBuild(s, l, plan.use, `${hh.name.replace(/^the /, 'the ')}`);
  l.contractor = false;
  l.hh = hh.id;
  l.name = homeName(surOf(hh), plan.use);
  H.builds[l.id] = { lot: l.id, hh: hh.id, use: plan.use, acct: b.acct, bname: b.name, bizId: b.bizId, cost: plan.cost, paid: 0, w0: s.week };
  H.stats.started++;
  // The building money stays in the house (no new car while the builder is owed).
  hh.save = 1;
  const fn = famName(hh);
  const txt = `${fn.charAt(0).toUpperCase()}${fn.slice(1)} broke ground on ${streetOf(l)}: a ${USES_BY_ID[plan.use].name.toLowerCase()} going up at ${l.address}, built by ${b.name}${b.mine ? ' (yours)' : ''}, ${how}.`;
  const fid = fact(s, L, 'broke_ground', head ? [head.id] : [], txt, 0, { at: l.id, amt: plan.total });
  openStory(s, L, 'family', `${fn}' new house`, head ? [head.id] : [], [fid]);
  chron(s, txt);
  return true;
}

/**
 * A household tries to buy a lot and build: its own savings first, then a
 * real lender for the rest. Returns what happened in words (for tests and the
 * log), or undefined when it was not ready.
 */
export function tryToBuild(ctx: Ctx, hhId: string, lotId?: string): string | undefined {
  const s = ctx.s;
  const L = s.living;
  const H = ensureHousing(s);
  if (!L || !H) return undefined;
  const hh = L.hh[hhId];
  if (!hh || hh.gone !== undefined) return undefined;
  if (Object.values(H.builds).some((b) => b.hh === hhId) || H.wait[hhId]) return undefined;
  const x = livingIndex(s, L);
  const lots = vacantHomeLots(s).sort((a, b) => a.price - b.price || a.id.localeCompare(b.id));
  const near = lots.filter((l) => hoodOf(l) === hh.hood);
  const pool = near.length && roll(L, s.week, `near:${hhId}`) < 0.7 ? near : lots;
  // Anywhere on the island, the cheaper lots likelier.
  const l = lotId ? lots.find((y) => y.id === lotId) : pool[Math.floor(roll(L, s.week, `lot:${hhId}`) ** 2 * pool.length)];
  if (!l) return undefined;
  const plan = planFor(s, L, hh, l, x);
  const head = headOf(L, hh, s.week);
  if (!head) return undefined;
  if (plan.need <= 0) return breakGround(ctx, L, H, hh, plan, 'paid for out of their own savings') ? 'cash' : undefined;
  // Not even the lot and a third of the house saved: they keep saving.
  if (plan.own < plan.total * 0.2) { hh.save = 1; return undefined; }
  // They borrow a little over the price: a builder's bill always comes in higher.
  plan.need = Math.round((plan.need + plan.cost * 0.1) / 50) * 50;
  const v = chemicalBank(s, L, hh, plan.need, { total: plan.total, own: plan.own });
  if (v.ok) {
    const fid = fact(s, L, 'bank_yes', [head.id], `Chemical Bank gave ${pname(head)} a $${plan.need.toLocaleString('en-US')} mortgage to build at ${l.address} ($${v.pay}/wk for twenty years).`, 1, { at: l.id, amt: plan.need });
    const d = newDebt(ctx, L, { lender: 'bank', from: 'x:bank', by: head, amt: plan.need, rate: MORTGAGE.total, weeks: MORTGAGE.weeks, why: `the mortgage on ${l.address}`, fid });
    if (!d) return undefined;
    d.lot = l.id;
    // The payments start when they move in.
    d.next = s.week + 20;
    H.stats.bankYes++;
    return breakGround(ctx, L, H, hh, plan, `with $${plan.own.toLocaleString('en-US')} of their own and a Chemical Bank mortgage`) ? 'bank' : undefined;
  }
  H.stats.bankNo++;
  fact(s, L, 'bank_no', [head.id], `Chemical Bank turned ${pname(head)} down for $${plan.need.toLocaleString('en-US')} to build at ${l.address}: ${v.why.join('; ')}.`, 1, { at: l.id, amt: plan.need });
  // Turned down: the Family's loan desk, if the boss runs one and lends to families.
  if (deskOpen(s) && s.fbank?.policy.lendTo !== 'businesses') {
    const app = deskApply(s, L, { kind: 'home', hh: hh.id, by: head.id, lot: l.id, amt: plan.need, why: `to build a ${USES_BY_ID[plan.use].name.toLowerCase()} at ${l.address}`, denied: v.why });
    if (app) { H.wait[hh.id] = { lot: l.id, use: plan.use, app: app.id, w: s.week }; H.stats.deskApps++; hh.save = 1; return 'desk'; }
  }
  // A relative, a friend, the street.
  if (plan.need <= plan.total * 0.3 && roll(L, s.week, `kin:${hhId}`) < 0.5) {
    const d = borrow(ctx, L, head, x, plan.need, `to build a house at ${l.address}`);
    if (d) { d.lot = l.id; return breakGround(ctx, L, H, hh, plan, `with $${plan.own.toLocaleString('en-US')} of their own and a loan from ${d.lender.startsWith('tp') ? pname(L.people[d.lender]) : 'the street'}`) ? 'kin' : undefined; }
  }
  hh.save = 1;
  return 'refused';
}

/** The money came through at the Family's desk: the family goes ahead (housing week). */
function waitingWeek(ctx: Ctx, L: LivingState, H: HousingState): void {
  const s = ctx.s;
  for (const [hhId, w] of Object.entries(H.wait)) {
    const hh = L.hh[hhId];
    const app = s.fbank?.apps.find((a) => a.id === w.app);
    if (!hh || hh.gone !== undefined || !app || app.st === 'no' || app.st === 'gone') { delete H.wait[hhId]; continue; }
    if (app.st !== 'yes') continue;
    delete H.wait[hhId];
    const l = s.econ!.lots.find((y) => y.id === w.lot);
    const x = livingIndex(s, L);
    const lot = l && !l.use && l.status === 'sale' ? l : vacantHomeLots(s).filter((y) => hoodOf(y) === hh.hood)[0] ?? vacantHomeLots(s)[0];
    if (!lot) continue;
    const plan = planFor(s, L, hh, lot, x);
    breakGround(ctx, L, H, hh, { ...plan, use: w.use }, `with money from ${s.fbank && deskOpen(s) === 'bank' ? 'the Family\'s bank' : 'the Family\'s book'}`);
  }
}

/** Every build: the family pays its builder stage by stage; short of money, the work stops; the house opens, they move in. */
function buildsWeek(ctx: Ctx, L: LivingState, H: HousingState): void {
  const s = ctx.s;
  const lots = new Map(s.econ!.lots.map((l) => [l.id, l]));
  for (const b of Object.values(H.builds)) {
    const l = lots.get(b.lot);
    const hh = L.hh[b.hh];
    if (!l || l.use !== b.use || !hh || hh.gone !== undefined || l.hh !== b.hh || !l.hhOwns) {
      // The house burned, was seized, or the family is gone: the build is somebody else's now.
      delete H.builds[b.lot];
      if (l && l.hh === b.hh && (!hh || hh.gone !== undefined)) delete l.hh;
      continue;
    }
    if (l.stage === 'open') { moveIn(ctx, L, H, b, l, hh); continue; }
    const i = l.stage ? BUILD_STAGES.indexOf(l.stage) : -1;
    if (i < 0) continue;
    let due = 0;
    for (let k = 0; k <= i; k++) due += STAGE_COST[BUILD_STAGES[k]];
    const owe = Math.round(b.cost * due) - b.paid;
    if (owe <= 0) { b.short = 0; continue; }
    const label = `${famName(hh)}' ${USES_BY_ID[b.use].name.toLowerCase()} at ${l.address}`;
    const got = pay(ctx, L, `h:${hh.id}`, b.acct, owe, b.acct === 'family' ? `Contract: ${b.bname} building ${label}` : `${hh.name} pay ${b.bname}`, 'business');
    b.paid += got;
    if (got >= owe) { b.short = 0; continue; }
    // Short: the builder stops until he is paid.
    b.short = (b.short ?? 0) + 1;
    l.stopWork = { weeks: 1, reason: `${famName(hh)} owe ${b.bname} $${(owe - got).toLocaleString('en-US')}` };
    l.stalled = `Stopped: ${l.stopWork.reason}`;
    const head = headOf(L, hh, s.week);
    if (b.short === 3 && head) askForHelp(ctx, L, b, l, hh, head, owe - got);
    if (b.short >= 16) giveUp(ctx, L, H, b, l, hh);
  }
}

function askForHelp(ctx: Ctx, L: LivingState, b: HBuild, l: Lot, hh: Th, head: Tp, short: number): void {
  const s = ctx.s;
  b.asked = s.week;
  const capo = districtCapo(s, hh.hood) ?? districtCapo(s, 'boardwalk');
  const fid = fact(s, L, 'asked_help', [head.id, ...(capo ? [capo.id] : [])], `${pname(head)} went to ${capo ? `${capo.firstName} ${capo.lastName}` : 'the neighbors'}: the builder stopped work on their house at ${l.address}, $${short.toLocaleString('en-US')} short.`, 2, { at: l.id, amt: short });
  const st = openStoryOf(L, 'family', head.id) ?? openStory(s, L, 'family', `${famName(hh)}' new house`, [head.id], []);
  link(L, st, fid);
  if (!capo || st.ask || (L.lastAsk !== undefined && s.week - L.lastAsk < 6)) return;
  st.ask = { w: s.week, iid: '', via: capo.id };
  L.lastAsk = s.week;
  L.stats.asks++;
  capoBriefs(s, L, st.f, capo, head.id);
  queueRequest(s, st);
}

/** They cannot finish: the half-built house is sold (the buyer pays the family what it is worth as it stands). */
function giveUp(ctx: Ctx, L: LivingState, H: HousingState, b: HBuild, l: Lot, hh: Th): void {
  const s = ctx.s;
  delete H.builds[b.lot];
  const worth = Math.round((l.price + b.paid * 0.7) / 50) * 50;
  const got = pay(ctx, L, 'x:land', `h:${hh.id}`, worth, `${hh.name} sell the half-built house at ${l.address}`);
  // The mortgage on it is paid off from the sale, as far as it goes.
  for (const d of L.debts.filter((y) => y.lot === l.id && y.st === 'open' && y.hh === hh.id)) {
    const back = pay(ctx, L, `h:${hh.id}`, d.lender === 'bank' ? 'x:bank' : d.lender === 'family' ? 'family' : d.lender.startsWith('tp') ? `h:${L.people[d.lender]?.hh}` : 'x:estate', d.out, `${hh.name} pay off the loan on ${l.address} from the sale`);
    d.out -= back;
    if (d.out <= 0) { d.out = 0; d.st = 'paid'; }
  }
  delete l.hh;
  delete l.hhOwns;
  delete l.stopWork;
  delete l.stalled;
  l.developer = b.bname;
  (l.history ??= []).push({ year: s.date.y, week: s.week, owner: 'private', how: 'sold', by: b.bname, price: got });
  H.stats.gaveUp++;
  const head = headOf(L, hh, s.week);
  const txt = `${famName(hh).replace(/^t/, 'T')} could not finish their house at ${l.address} and sold it half-built for $${got.toLocaleString('en-US')}. ${b.bname} will finish it and sell it.`;
  const fid = fact(s, L, 'sold_house', head ? [head.id] : [], txt, 0, { at: l.id, amt: got });
  const st = head ? openStoryOf(L, 'family', head.id) : undefined;
  link(L, st, fid);
  closeStory(s, st, 'They sold it half-built.');
  chron(s, txt);
}

function moveIn(ctx: Ctx, L: LivingState, H: HousingState, b: HBuild, l: Lot, hh: Th): void {
  const s = ctx.s;
  delete H.builds[b.lot];
  vacate(s, L, hh);
  hh.lot = l.id;
  hh.rent = 0;
  hh.home = `their ${USES_BY_ID[l.use!].name.toLowerCase()} at ${l.address}`;
  delete hh.save;
  l.hh = hh.id;
  l.hhOwns = 1;
  delete l.tenant;
  l.price = marketValue(s, l);
  (l.history ??= []).push({ year: s.date.y, week: s.week, owner: 'private', how: 'built', by: hh.name });
  s.hood && (s.hood.styles[l.id] = { style: b.use === 'shorehouse' ? 'victorian' : b.use === 'bungalow' ? 'midcentury' : 'colonial', sign: 'white', since: s.date.y });
  H.stats.built++;
  H.stats.movedIn++;
  const head = headOf(L, hh, s.week);
  const txt = `${famName(hh).replace(/^t/, 'T')} moved into their new ${USES_BY_ID[b.use].name.toLowerCase()} at ${l.address}${b.acct === 'family' ? `, built by ${b.bname}` : ''}.`;
  const fid = fact(s, L, 'house_built', head ? hh.members.filter((id) => present(L.people[id], s.week)).slice(0, 3) : [], txt, 0, { at: l.id });
  const st = head ? openStoryOf(L, 'family', head.id) : undefined;
  link(L, st, fid);
  closeStory(s, st, 'They moved in.');
  chron(s, txt);
}

/** The household leaves the house it lived in (a rented house goes back on the rental market). */
function vacate(s: GameState, L: LivingState, hh: Th): void {
  const old = hh.lot ? s.econ!.lots.find((y) => y.id === hh.lot) : undefined;
  if (old && old.hh === hh.id) {
    delete old.hh;
    if (old.hhOwns) { delete old.hhOwns; old.status = 'sale'; old.owner = 'private'; old.price = marketValue(s, old); }
  }
  delete hh.lot;
  void L;
}

/* ------------------------------------------------------------------ */
/* Monthly: who builds, who buys, who loses the house                   */
/* ------------------------------------------------------------------ */

/** How many families may break ground this month: the season and the era set the pace; empty ground never runs out. */
export function startsAllowed(s: GameState, H: HousingState): number {
  const vacant = vacantHomeLots(s).length;
  const floor = Math.max(6, Math.round(H.init.vacant * 0.2));
  if (vacant <= floor) return 0;
  const m = s.date.m;
  const season = m >= 3 && m <= 9 ? 3 : m === 2 || m === 10 ? 2 : 1;
  const era = s.date.y <= 1966 ? 1 : s.date.y <= 1973 ? 0.7 : 0.5;
  const active = Object.keys(H.builds).length;
  return Math.max(0, Math.min(Math.round(season * era + 0.2), 10 - active, vacant - floor));
}

function monthly(ctx: Ctx, L: LivingState, H: HousingState): void {
  const s = ctx.s;
  const x = livingIndex(s, L);
  // Families who could build: renting, working, with money saved.
  const cands = Object.values(L.hh).filter((hh) => hh.gone === undefined && !(hh.lot && s.econ!.lots.find((l) => l.id === hh.lot)?.hhOwns) && weeklyIncome(L, hh, s.week) > 0 && hh.cash > 600 * x.infl && !H.wait[hh.id] && !Object.values(H.builds).some((b) => b.hh === hh.id))
    .sort((a, b) => b.cash - a.cash || a.id.localeCompare(b.id));
  let left = startsAllowed(s, H);
  for (const hh of cands) {
    if (left <= 0) break;
    if (roll(L, s.week, `want:${hh.id}`) > 0.55) continue;
    const r = tryToBuild(ctx, hh.id);
    if (r === 'cash' || r === 'bank' || r === 'kin') left--;
  }
  // Newcomers: an empty house finds a family from off the island now and then (in season more).
  const emptyHouses = homeLots(s).filter((l) => l.use && l.stage === 'open' && !l.hh && l.status === 'sale').sort((a, b) => a.id.localeCompare(b.id));
  const hhCount = Object.values(L.hh).filter((h) => h.gone === undefined && !L.hoods.includes(h.hood)).length;
  if (emptyHouses.length && hhCount < (H.init.hh ?? 150) * 1.4 && roll(L, s.week, 'newcomer') < (isInSeason(s.date) ? 0.6 : 0.3)) {
    const l = emptyHouses[Math.floor(roll(L, s.week, 'newcomer:which') * emptyHouses.length)];
    const hh = familyFor(ctx, L, l, true, 0);
    delete l.hh;
    delete l.hhOwns;
    // They come with the price and some savings (money from off the island), and pay the seller.
    pay(ctx, L, 'x:arrive', `h:${hh.id}`, Math.round(l.price + (300 + roll(L, s.week, 'newcomer$') * 1200) * x.infl), 'what they sold up to come here');
    buyHouse(ctx, L, H, hh, l, `came over from ${pick(stream(L, s.week, 'from'), ['Philadelphia', 'Camden', 'Vineland', 'Trenton', 'Baltimore', 'Wilmington'])} and bought`);
    L.stats.movedIn++;
  }
}

/** A family buys a standing house (its own money, paid to the seller). */
export function buyHouse(ctx: Ctx, L: LivingState, H: HousingState, hh: Th, l: Lot, verb = 'bought'): boolean {
  const s = ctx.s;
  const price = l.price;
  if (hh.cash < price) return false;
  const seller = sellerAcct(s, L, l);
  const got = pay(ctx, L, `h:${hh.id}`, seller, price, `${hh.name} buy ${l.address}`, 'business');
  if (got < price) return false;
  vacate(s, L, hh);
  const prev = l.hh ? L.hh[l.hh] : undefined;
  if (prev && prev.id !== hh.id) { delete prev.lot; prev.rent = prev.rent || 14; }
  if (seller === 'family') { l.status = 'private'; l.owner = 'private'; delete s.econ!.managers[`lot:${l.id}`]; }
  l.status = 'private';
  l.owner = 'private';
  l.hh = hh.id;
  l.hhOwns = 1;
  delete l.tenant;
  delete l.operating;
  hh.lot = l.id;
  hh.rent = 0;
  hh.home = `their ${USES_BY_ID[l.use!]?.name.toLowerCase() ?? 'house'} at ${l.address}`;
  delete hh.save;
  l.name = homeName(surOf(hh), l.use!);
  (l.history ??= []).push({ year: s.date.y, week: s.week, owner: 'private', how: 'bought', by: hh.name, price: got });
  H.stats.sold++;
  const head = headOf(L, hh, s.week);
  const txt = `${famName(hh).replace(/^t/, 'T')} ${verb} ${l.name?.replace(/^The /, 'the ') ?? 'a house'} at ${l.address} for $${got.toLocaleString('en-US')}.`;
  fact(s, L, 'bought_house', head ? [head.id] : [], txt, 0, { at: l.id, amt: got });
  chron(s, txt);
  return true;
}

/** Mortgages gone bad: Chemical Bank takes the house; the family rents a room somewhere. */
function foreclosures(ctx: Ctx, L: LivingState, H: HousingState): void {
  const s = ctx.s;
  for (const d of L.debts) {
    if (d.st !== 'open' || d.lender !== 'bank' || !d.lot || d.dw === undefined) continue;
    const l = s.econ!.lots.find((y) => y.id === d.lot);
    const hh = L.hh[d.hh];
    if (!l || !hh) continue;
    d.st = 'seized';
    if (l.hh === hh.id && l.hhOwns) {
      vacate(s, L, hh);
      delete H.builds[l.id];
      hh.rent = 14;
      hh.home = 'a rented room';
      delete l.stopWork;
    }
    H.stats.foreclosed++;
    const head = L.people[d.by];
    const txt = `Chemical Bank foreclosed on ${famName(hh)}' house at ${l.address}: they owed $${d.out.toLocaleString('en-US')} and stopped paying.`;
    const fid = fact(s, L, 'foreclosed', head ? [head.id] : [], txt, 0, { at: l.id, amt: d.out });
    const st = head ? openStoryOf(L, ['family', 'debt'], head.id) : undefined;
    link(L, st, fid);
    closeStory(s, st, 'The bank took the house.');
    chron(s, txt);
  }
}

/** Houses whose family is gone (left town, died out, the house burned) are freed. */
function tidy(s: GameState, L: LivingState): void {
  for (const l of homeLots(s)) {
    if (!l.hh) continue;
    const hh = L.hh[l.hh];
    const gone = !hh || hh.gone !== undefined || (hh.lot !== l.id && !s.housing?.builds[l.id]);
    if (!l.use && !s.housing?.builds[l.id] && hh?.lot === l.id) {
      // Burned or torn down: they need somewhere else to live.
      delete hh.lot;
      hh.rent = hh.rent || 14;
      hh.home = 'a rented room';
      delete l.hh;
      delete l.hhOwns;
      continue;
    }
    if (!gone) continue;
    delete l.hh;
    if (l.hhOwns) {
      delete l.hhOwns;
      if (l.status !== 'owned') { l.status = 'sale'; l.owner = 'private'; l.price = marketValue(s, l); }
    }
  }
}

/* ------------------------------------------------------------------ */
/* The week                                                             */
/* ------------------------------------------------------------------ */

let ENABLED = true;
/** Tests can switch the layer off (to compare against the town without it). */
export function setHousingEnabled(on: boolean): void {
  ENABLED = on;
}

export function housingWeek(ctx: Ctx): void {
  if (!ENABLED) return;
  const s = ctx.s;
  const H = ensureHousing(s);
  const L = s.living;
  if (!H || !L) return;
  if (!H.peopled) peopleHouses(ctx, L, H);
  tidy(s, L);
  waitingWeek(ctx, L, H);
  buildsWeek(ctx, L, H);
  foreclosures(ctx, L, H);
  const mk = `${s.date.y}-${s.date.m}`;
  if (H.lastMonth !== mk) {
    H.lastMonth = mk;
    monthly(ctx, L, H);
  }
}

/* ------------------------------------------------------------------ */
/* The boss's own houses: sell or rent to a family of the town          */
/* ------------------------------------------------------------------ */

export interface HomeBuyer { hh: Th; own: number; loan: number; lender: 'bank' | 'none'; pay: number }

/** The best family in town to buy a house of yours at a price: its savings and a Chemical Bank mortgage. */
export function homeBuyer(s: GameState, l: Lot, price: number): HomeBuyer | undefined {
  const L = s.living;
  if (!L) return undefined;
  const x = { y: s.date.y, m: s.date.m, week: s.week, infl: inflation(s) };
  const out: HomeBuyer[] = [];
  for (const hh of Object.values(L.hh)) {
    if (hh.gone !== undefined || !hh.members.some((id) => present(L.people[id], s.week))) continue;
    const homeLot = hh.lot ? s.econ?.lots.find((y) => y.id === hh.lot) : undefined;
    if (homeLot?.hhOwns || s.housing?.wait[hh.id] || Object.values(s.housing?.builds ?? {}).some((b) => b.hh === hh.id)) continue;
    const own = Math.max(0, Math.min(price, hh.cash - upkeepOf(L, hh, x) * 6));
    if (own >= price) { out.push({ hh, own: price, loan: 0, lender: 'none', pay: 0 }); continue; }
    const v = chemicalBank(s, L, hh, price - own, { total: price, own });
    if (v.ok) out.push({ hh, own, loan: price - own, lender: 'bank', pay: v.pay });
  }
  // The family already renting it first, then whoever puts the most down.
  return out.sort((a, b) => (b.hh.id === l.hh ? 1 : 0) - (a.hh.id === l.hh ? 1 : 0) || b.own - a.own || a.hh.id.localeCompare(b.hh.id))[0];
}

/** A family that would rent a house of yours: renting elsewhere (or rooming), with work. */
export function homeRenter(s: GameState, l: Lot): Th | undefined {
  const L = s.living;
  if (!L) return undefined;
  return Object.values(L.hh).filter((hh) => hh.gone === undefined && hh.rent > 0 && !hh.lot && weeklyIncome(L, hh, s.week) > 0 && hh.members.some((id) => present(L.people[id], s.week)))
    .sort((a, b) => (hoodOfZone(l.zone) === b.hood ? 1 : 0) - (hoodOfZone(l.zone) === a.hood ? 1 : 0) || weeklyIncome(L, b, s.week) - weeklyIncome(L, a, s.week) || a.id.localeCompare(b.id))[0];
}

/** What a family pays a week to rent a house (about what a 1960 house rented for, by its worth). */
export function homeRent(s: GameState, l: Lot): number {
  return Math.max(8, Math.round(marketValue(s, l) * 0.0014));
}

/** Sell a house of yours to a family: their savings and their own mortgage pay the Family. */
export function sellHomeTo(ctx: Ctx, lotId: string, price: number): boolean {
  const s = ctx.s;
  const L = s.living;
  const H = ensureHousing(s);
  const l = s.econ?.lots.find((y) => y.id === lotId);
  if (!L || !H || !l || l.status !== 'owned') return false;
  const b = homeBuyer(s, l, price);
  if (!b) return false;
  const head = headOf(L, b.hh, s.week);
  if (!head) return false;
  if (b.loan > 0) {
    const fid = fact(s, L, 'bank_yes', [head.id], `Chemical Bank gave ${pname(head)} a $${b.loan.toLocaleString('en-US')} mortgage to buy ${l.address} from the House of ${s.houseName}.`, 1, { at: l.id, amt: b.loan });
    const d = newDebt(ctx, L, { lender: 'bank', from: 'x:bank', by: head, amt: b.loan, rate: MORTGAGE.total, weeks: MORTGAGE.weeks, why: `the mortgage on ${l.address}`, fid });
    if (!d) return false;
    d.lot = l.id;
  }
  l.price = price;
  const prevTenant = l.hh && l.hh !== b.hh.id ? L.hh[l.hh] : undefined;
  if (prevTenant) { delete prevTenant.lot; prevTenant.home = 'a rented room'; }
  delete l.hh;
  const ok = buyHouse(ctx, L, H, b.hh, l, 'bought from the House of ' + s.houseName);
  if (ok) {
    delete s.econ!.managers[`lot:${l.id}`];
    s.econ!.designs && delete s.econ!.designs[`lot:${l.id}`];
  }
  return ok;
}

/** Rent a house of yours to a family: they move in and pay the Family every week out of their own money. */
export function rentHomeTo(ctx: Ctx, lotId: string): boolean {
  const s = ctx.s;
  const L = s.living;
  const H = ensureHousing(s);
  const l = s.econ?.lots.find((y) => y.id === lotId);
  if (!L || !H || !l || l.status !== 'owned' || !l.use || l.stage !== 'open' || l.hh) return false;
  let hh = homeRenter(s, l);
  if (!hh) {
    // Nobody in town: a family from off the island answers the ad.
    hh = familyFor(ctx, L, l, false, 0.5);
    pay(ctx, L, 'x:arrive', `h:${hh.id}`, Math.round(300 * inflation(s)), 'the savings they came with');
    delete l.hh;
  }
  vacate(s, L, hh);
  hh.lot = l.id;
  hh.rent = Math.max(1, Math.round(homeRent(s, l) / inflation(s)));
  hh.home = `a ${USES_BY_ID[l.use]?.name.toLowerCase() ?? 'house'} they rent from the House of ${s.houseName}, ${l.address}`;
  l.hh = hh.id;
  delete l.hhOwns;
  H.stats.rented++;
  const head = headOf(L, hh, s.week);
  const txt = `${famName(hh).replace(/^t/, 'T')} moved into ${l.address}, renting from the House of ${s.houseName} for $${homeRent(s, l)} a week.`;
  fact(s, L, 'rented_house', head ? [head.id] : [], txt, 0, { at: l.id });
  chron(s, txt);
  return true;
}

/** The household living in a lot's house, for the cards. */
export function homeHousehold(s: GameState, l: Lot): Th | undefined {
  return l.hh ? s.living?.hh[l.hh] : undefined;
}

/** Counts for the cards and the tests. */
export function housingCounts(s: GameState): { lots: number; vacant: number; forSale: number; houses: number; lived: number; building: number } {
  const all = homeLots(s);
  return {
    lots: all.length,
    vacant: all.filter((l) => !l.use).length,
    forSale: all.filter((l) => !l.use && l.status === 'sale').length,
    houses: all.filter((l) => l.use && l.stage === 'open').length,
    lived: all.filter((l) => l.use && l.stage === 'open' && l.hh).length,
    building: all.filter((l) => l.use && l.stage && l.stage !== 'open' && l.stage !== 'purchase').length,
  };
}

export const ZONE_TOWN: Partial<Record<ZoneId, string>> = { crest: 'Wildwood Crest', downtown: 'Wildwood', docks: 'Wildwood', north: 'North Wildwood', westww: 'West Wildwood' };
void HOODS_BY_ID;
void hashSeed;
export type { Td };

/* ------------------------------------------------------------------ */
/* Orders                                                               */
/* ------------------------------------------------------------------ */

export type HomeCmd = { k: 'sell'; lotId: string; price: 'market' | 'quick' | 'high' } | { k: 'rent'; lotId: string };

export const PRICE_MUL: Record<'market' | 'quick' | 'high', number> = { quick: 0.8, market: 1, high: 1.15 };

export function homeAsk(s: GameState, l: Lot, price: 'market' | 'quick' | 'high'): number {
  return Math.round(marketValue(s, l) * PRICE_MUL[price] / 50) * 50;
}

export function previewHome(s: GameState, c: HomeCmd): import('./actions').ActionPreview {
  const l = s.econ?.lots.find((y) => y.id === c.lotId);
  const nop = (title: string, why: string) => ({ title, effects: [], cost: 0, because: '', disabledReason: why, category: 'event' as const });
  if (!l) return nop('A house', 'No such lot');
  const note = (text: string) => ({ type: 'econ' as const, op: { op: 'note' as const, text }, label: text });
  const notMine = l.status !== 'owned' ? (l.status === 'leased' ? 'You only lease it' : 'Not yours') : undefined;
  const notHouse = !isHomeUse(l.use) || l.stage !== 'open' ? 'Only a finished house' : undefined;
  if (c.k === 'sell') {
    const price = homeAsk(s, l, c.price);
    const b = notMine || notHouse ? undefined : homeBuyer(s, l, price);
    const who = b ? b.hh.name.replace(/^the /, 'The ') : undefined;
    const how = b ? (b.loan ? `$${b.own.toLocaleString('en-US')} of their own savings and a $${b.loan.toLocaleString('en-US')} Chemical Bank mortgage ($${b.pay}/wk, theirs to pay)` : 'their own savings, cash') : '';
    return {
      title: `Sell ${l.address} to a family of the town (${c.price === 'quick' ? 'a quick sale' : c.price === 'high' ? 'top dollar' : 'market price'}: $${price.toLocaleString('en-US')})`,
      detail: b ? `${who} buy it with ${how}. They pay the Family $${price.toLocaleString('en-US')}; the house is theirs.${l.hh && l.hh !== b.hh.id ? ' The family renting it now has to find another place.' : ''}` : 'Nobody in town can pay that right now: their savings and what Chemical Bank would lend them fall short. Try a lower price, or wait for a family with more put away.',
      effects: [note(`+$${price.toLocaleString('en-US')} from ${who ?? 'a family'} (their money)`)], cost: 0, because: `sold the house at ${l.address} to ${b ? b.hh.name : 'a family'}`,
      disabledReason: notMine ?? notHouse ?? (!b ? 'No family in town can pay that now' : undefined), category: 'event', verb: 'Sell',
    };
  }
  const r = notMine || notHouse ? undefined : homeRenter(s, l);
  const rent = homeRent(s, l);
  return {
    title: `Rent ${l.address} to a family ($${rent}/wk)`,
    detail: r ? `${r.name.replace(/^the /, 'The ')} move in and pay the Family $${rent} a week out of their own wages (renting now: ${r.home}).` : 'Nobody in town is looking; a family from off the island answers the ad and pays the Family the rent out of its wages.',
    effects: [note(`+$${rent}/wk rent, paid by the family`)], cost: 0, because: `rented the house at ${l.address} to a family`,
    disabledReason: notMine ?? notHouse ?? (l.hh ? 'A family already lives there' : undefined), category: 'event', verb: 'Rent it out',
  };
}

export function commitHome(ctx: Ctx, c: HomeCmd): void {
  const l = ctx.s.econ?.lots.find((y) => y.id === c.lotId);
  if (!l) return;
  if (c.k === 'sell') { if (!sellHomeTo(ctx, c.lotId, homeAsk(ctx.s, l, c.price))) ctx.log.push(`Nobody could buy ${l.address} after all.`); return; }
  rentHomeTo(ctx, c.lotId);
}
