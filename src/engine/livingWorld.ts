import { isInSeason } from './calendar';
import { regime } from './hierarchy';
import { HOODS_BY_ID, type HoodId } from './hoodData';
import { jobsOf } from './hood';
import { heat, type Ctx } from './ledger';
import { marketValue } from './econ';
import type { Lot } from './econState';
import { inflation, USES, USES_BY_ID, ZONES_BY_ID } from './property';
import { CATALOG } from './catalog';
import { FACTION_NAMES } from './world';
import { channelsWeek, districtCapo, fact, factById, gossipMonth, knows, pruneFacts, remember } from './livingKnow';
import { closeLivingBooks, livingMoneyHeld, pay, reconcileLiving } from './livingMoney';
import { closeStory, link, openStory, openStoryOf, pruneStories, storyById } from './livingStory';
import {
  addHousehold, addPerson, ageOf, AMB, clamp, ensureLiving, HON, he, him, his, parseOwner, isLivingBizLot, makeFamily, marryRecords, NERVE, nid, parentRecords, pname, present,
  roll, rollTraits, stream, VICE, WAGE, WARM, type GoalK, type LivingState, type Plan, type Tb, type Td, type Th, type Tie, type Tp,
} from './livingState';
import { pick } from './rng';
import { SURNAMES } from './names';
import type { Character, FactionId, GameState, RivalId } from './types';

/**
 * THE LIVING NEIGHBORHOOD (the weekly and monthly pass). B12, B13.
 *
 * Every week, cheaply:
 *  1. lots another system changed (the boss bought one, a fire) settle with
 *     their owners: a sale is paid for, the help keeps or loses its job;
 *  2. each business takes its week's trade from the customers, pays its
 *     people and its suppliers, and the owner draws what is left over a cushion;
 *  3. each household pays to live; debts come due and are paid or missed;
 *  4. each grown person chooses one thing to do, by weighted priority:
 *     need urgency + goal relevance + personality + relationships +
 *     opportunity - cost - risk - obligations, with a small stable tiebreak;
 *     a plan already in motion moves a stage when its time comes;
 *  5. word reaches the boss through the channels (livingKnow.ts).
 * Monthly (heavier): birthdays, coming of age, pregnancies, deaths, weddings,
 * the owners' books (a skim found out), struggling shops (offers, closings),
 * families moving in and out, goals reweighed, gossip, the district's totals.
 *
 * Betrayal is never a roll: a revenge plan needs a grudge (motive), a target
 * he can reach (opportunity) and weeks of preparation, and it can cool.
 */

/* ------------------------------------------------------------------ */
/* Index of the week                                                   */
/* ------------------------------------------------------------------ */

interface Idx {
  y: number;
  m: number;
  week: number;
  infl: number;
  season: boolean;
  lots: Map<string, Lot>;
  adults: Tp[];
  byJob: Map<string, Tp[]>;
  singles: { M: Tp[]; F: Tp[] };
  crew: Character[];
}

function buildIdx(s: GameState, L: LivingState): Idx {
  const lots = new Map<string, Lot>();
  for (const l of s.econ?.lots ?? []) lots.set(l.id, l);
  const idx: Idx = { y: s.date.y, m: s.date.m, week: s.week, infl: inflation(s), season: isInSeason(s.date), lots, adults: [], byJob: new Map(), singles: { M: [], F: [] }, crew: [] };
  for (const id in L.people) {
    const p = L.people[id];
    if (!present(p, s.week)) continue;
    const a = ageOf(p, idx.y, idx.m);
    if (a < 18) continue;
    idx.adults.push(p);
    if (p.job) {
      const arr = idx.byJob.get(p.job);
      if (arr) arr.push(p); else idx.byJob.set(p.job, [p]);
    }
    if (!p.sp && !p.sepd && a <= 50 && !p.plan?.k.startsWith('court')) idx.singles[p.g].push(p);
    else if (p.sp && L.people[p.sp]?.dead && !p.sepd && a <= 55) idx.singles[p.g].push(p);
  }
  return idx;
}

const age = (p: Tp, x: Idx) => ageOf(p, x.y, x.m);

/** A man the boss's family has in this district's rackets (lenders, patrons). */
function districtCrew(s: GameState, hood: HoodId): Character[] {
  const capo = districtCapo(s, hood);
  if (!capo) return [];
  return [capo, ...regime(s, capo.id)].filter((c) => c.alive && c.imprisonedUntil === undefined);
}

/* ------------------------------------------------------------------ */
/* Money helpers                                                       */
/* ------------------------------------------------------------------ */

function hhOf(L: LivingState, p: Tp): Th | undefined {
  return L.hh[p.hh];
}

function presentMembers(L: LivingState, hh: Th, week: number): Tp[] {
  const out: Tp[] = [];
  for (const id of hh.members) {
    const p = L.people[id];
    if (present(p, week)) out.push(p);
  }
  return out;
}

export function upkeepOf(L: LivingState, hh: Th, x: Pick<Idx, 'y' | 'm' | 'week' | 'infl'>): number {
  let adults = 0;
  let kids = 0;
  for (const id of hh.members) {
    const p = L.people[id];
    if (!present(p, x.week)) continue;
    if (ageOf(p, x.y, x.m) >= 18) adults++; else kids++;
  }
  if (!adults && !kids) return 0;
  return Math.round((15 + 10 * adults + 5 * kids) * x.infl);
}

/** 0-100: how badly this household needs money. */
function moneyNeed(L: LivingState, p: Tp, x: Idx): number {
  const hh = hhOf(L, p);
  if (!hh) return 0;
  const up = Math.max(1, upkeepOf(L, hh, x));
  const runway = (hh.cash + p.stash) / up;
  let n = runway < 1 ? 95 : runway < 2 ? 80 : runway < 4 ? 55 : runway < 8 ? 30 : runway < 16 ? 12 : 3;
  if (L.debts.some((d) => d.hh === hh.id && d.st === 'open' && d.missed > 0)) n += 15;
  if (hh.behind) n += 10;
  const b = p.job ? L.biz[p.job] : undefined;
  if (b && b.owner === p.id && b.red >= 2) n += 15;
  return clamp(n);
}

function lenderAcct(L: LivingState, s: GameState, d: Td): string {
  if (d.lender.startsWith('tp')) {
    const lp = L.people[d.lender];
    const hh = lp ? L.hh[lp.hh] : undefined;
    return hh && hh.gone === undefined ? `h:${hh.id}` : 'x:estate';
  }
  if (d.lender === 'family') return 'family';
  if (d.lender.startsWith('rival:')) return d.lender;
  if (d.lender === 'bank') return 'x:bank';
  const c = s.characters[d.lender];
  return c?.alive ? `wealth:${c.id}` : 'x:estate';
}

export function lenderName(s: GameState, L: LivingState, d: Td): string {
  if (d.lender.startsWith('tp')) return pname(L.people[d.lender]);
  if (d.lender === 'family') return `the House of ${s.houseName}`;
  if (d.lender === 'bank') return 'the Marine National Bank';
  if (d.lender.startsWith('rival:')) return `${FACTION_NAMES[d.lender.slice(6) as FactionId] ?? 'a rival'}'s shylock`;
  const c = s.characters[d.lender];
  return c ? `${c.firstName} ${c.lastName}` : 'a lender';
}

/** A new debt: money moves now, the payments are scheduled. */
export function newDebt(ctx: Ctx, L: LivingState, o: { lender: string; from: string; by: Tp; amt: number; rate: number; weeks: number; why: string; fid: string }): Td | undefined {
  const s = ctx.s;
  const got = pay(ctx, L, o.from, `h:${o.by.hh}`, o.amt, `${o.why} (a loan to ${pname(o.by)})`);
  if (got <= 0) return undefined;
  const total = Math.round(got * (1 + o.rate));
  const d: Td = { id: nid(L, 'td'), lender: o.lender, by: o.by.id, hh: o.by.hh, amt: got, out: total, pay: Math.max(1, Math.ceil(total / o.weeks)), next: s.week + 2, missed: 0, fid: o.fid, st: 'open', why: o.why, w: s.week };
  L.debts.push(d);
  L.stats.loans++;
  return d;
}

/* ------------------------------------------------------------------ */
/* Ties                                                                */
/* ------------------------------------------------------------------ */

export function tie(p: Tp, id: string): Tie {
  return (p.ties[id] ??= { a: 0, tr: 30, gr: 0 });
}

function bump(p: Tp | undefined, id: string, da: number, dtr = 0, dgr = 0, why?: string): void {
  if (!p || p.id === id) return;
  const t = tie(p, id);
  t.a = clamp(t.a + da, -100, 100);
  t.tr = clamp(t.tr + dtr);
  t.gr = clamp(t.gr + dgr);
  if (why && dgr > 0) t.why = why;
}

function parentsOf(L: LivingState, id: string | undefined): string[] {
  const p = id ? L.people[id] : undefined;
  return p ? [p.fa, p.mo].filter((x): x is string => !!x) : [];
}

/** Close family (no courtship): the same person, a parent, a sibling, a grandparent, an aunt or uncle, a first cousin. */
export function isKin(L: LivingState, a: string, b: string): boolean {
  if (a === b) return true;
  const set = (id: string) => {
    const ps = parentsOf(L, id);
    return new Set([id, ...ps, ...ps.flatMap((x) => parentsOf(L, x))]);
  };
  const A = set(a);
  for (const x of set(b)) if (A.has(x)) return true;
  return false;
}

/* ------------------------------------------------------------------ */
/* Lots and businesses                                                 */
/* ------------------------------------------------------------------ */

function lotName(l: Lot): string {
  return l.name ?? USES_BY_ID[l.use ?? '']?.name ?? 'the place';
}

function outfitLot(l: Lot | undefined): boolean {
  return !!l && l.stage === 'open' && !!l.use && (l.status === 'owned' || l.status === 'leased' || l.status === 'rival');
}

/** How many named people a business wants on its payroll now. */
function wantStaff(L: LivingState, b: Tb, l: Lot, x: Idx): number {
  const pos = jobsOf(l);
  const cap = pos >= 8 ? 3 : pos >= 4 ? 2 : 1;
  const u = USES_BY_ID[l.use!];
  const kin = b.staff.filter((id) => L.people[id]?.hh === L.people[b.owner]?.hh).length;
  if (u?.seasonal && !x.season) return Math.min(b.staff.length, kin + 1);
  return Math.max(kin, Math.min(pos - 1, cap + kin));
}

function hire(s: GameState, L: LivingState, p: Tp, lotId: string, x: Idx, how: string): void {
  const l = x.lots.get(lotId);
  p.job = lotId;
  p.wage = Math.round(WAGE * x.infl);
  p.idle = 0;
  p.owed = 0;
  p.ui = undefined;
  const b = L.biz[lotId];
  if (b && !b.staff.includes(p.id)) b.staff.push(p.id);
  const boss = b ? L.people[b.owner] : undefined;
  if (boss) { bump(boss, p.id, 8, 10); bump(p, boss.id, 8, 8); }
  const arr = x.byJob.get(lotId);
  if (arr) arr.push(p); else x.byJob.set(lotId, [p]);
  fact(s, L, 'hired', boss ? [p.id, boss.id] : [p.id], `${pname(p)} went to work at ${l ? lotName(l) : 'a place on the Boardwalk'}${how}.`, 1, { at: lotId });
  L.stats.hires++;
}

function unemploy(L: LivingState, p: Tp, week?: number): void {
  // Laid off (not quitting, not fired for cause): unemployment for up to 26 weeks.
  if (week !== undefined && p.job && p.job !== 'home' && p.job !== 'retired' && p.job !== 'school') p.ui = week + 26;
  const b = p.job ? L.biz[p.job] : undefined;
  if (b) b.staff = b.staff.filter((id) => id !== p.id);
  p.job = undefined;
  p.wage = undefined;
  p.idle = 0;
}

/** Owner of a lot sells or loses it: the business record ends, the help keeps or loses its jobs. */
function endBusiness(ctx: Ctx, L: LivingState, b: Tb, keepStaff: boolean): void {
  // What is in the till goes home with the owner (or to his estate).
  const own = L.people[b.owner];
  const home = own && L.hh[own.hh] && L.hh[own.hh].gone === undefined ? `h:${own.hh}` : 'x:estate';
  if (b.cash > 0) pay(ctx, L, `b:${b.lot}`, home, b.cash, 'what was left in the till');
  for (const id of b.staff) {
    const p = L.people[id];
    if (!p) continue;
    if (!keepStaff) unemploy(L, p, ctx.s.week);
  }
  const owner = L.people[b.owner];
  if (owner && owner.job === b.lot) unemploy(L, owner);
  delete L.biz[b.lot];
}

/** Buy a lot that is for sale and open a business on it. Returns the new business. */
function openBusiness(ctx: Ctx, L: LivingState, owner: Tp, l: Lot, x: Idx, from: string[], cause?: string): Tb | undefined {
  const s = ctx.s;
  const price = l.price;
  let paid = 0;
  const seller = L.sellers?.[l.id];
  const to = seller && L.hh[seller] && L.hh[seller].gone === undefined ? `h:${seller}` : 'x:land';
  for (const acct of from) paid += pay(ctx, L, acct, to, price - paid, `${pname(owner)} buys ${l.address}`);
  if (paid < price) {
    // Not enough after all: the money goes back where it came from.
    if (paid > 0) pay(ctx, L, to, from[0], paid, 'the deal fell through');
    return undefined;
  }
  if (L.sellers) delete L.sellers[l.id];
  if (!l.use || l.stage !== 'open') {
    const pool = USES.filter((u) => !u.npcOnly && !u.biz && (u.minYear ?? 0) <= s.date.y && (u.zones ? u.zones.includes(l.zone) : ZONES_BY_ID[l.zone].cats.includes(u.cat)));
    const u = pool.length ? pick(stream(L, s.week, `use:${l.id}`), pool) : USES_BY_ID.souvenir;
    l.use = u.id;
    l.stage = 'open';
    l.condition = Math.max(l.condition, 60);
  }
  const name = l.name ?? `${owner.l}'s ${USES_BY_ID[l.use]?.name.split(' ').slice(-1)[0] ?? 'Shop'}`;
  l.name = name;
  l.status = 'private';
  l.owner = 'private';
  l.tenant = `${owner.f} ${owner.l}`;
  const b: Tb = { lot: l.id, owner: owner.id, cash: 0, staff: [], since: s.week, red: 0, net: 0, rev: 0, tn: l.tenant };
  L.biz[l.id] = b;
  if (owner.job && owner.job !== l.id) unemploy(L, owner);
  owner.job = l.id;
  owner.wage = undefined;
  // A little working capital from the household, if there is any.
  pay(ctx, L, `h:${owner.hh}`, `b:${l.id}`, Math.round(Math.min(L.hh[owner.hh]?.cash ?? 0, 300 * x.infl)), 'working capital');
  const fid = fact(s, L, 'opened', [owner.id], `${pname(owner)} opened ${name} at ${l.address}.`, 0, { at: l.id, c: [cause], amt: price });
  L.stats.opened++;
  const st = openStoryOf(L, 'newbiz', owner.id);
  if (st) { link(L, st, fid); closeStory(s, st, `${owner.f} opened ${name}.`); }
  return b;
}

/** A business closes for good: the lot goes up for sale, the help is let go. */
function closeBusiness(ctx: Ctx, L: LivingState, b: Tb, why: string, cause?: string): string {
  const s = ctx.s;
  const l = s.econ?.lots.find((x) => x.id === b.lot);
  const owner = L.people[b.owner];
  const name = l ? lotName(l) : 'the shop';
  const staff = [...b.staff];
  endBusiness(ctx, L, b, false);
  if (l) {
    (l.past ??= []).push({ use: l.use ?? 'shop', from: l.builtYear ?? 1950, to: s.date.y, why: 'closed' });
    l.past = l.past.slice(-6);
    l.tenant = undefined;
    l.name = undefined;
    l.status = 'sale';
    l.owner = 'private';
    l.price = marketValue(s, l);
    if (owner) (L.sellers ??= {})[l.id] = owner.hh;
  }
  const fid = fact(s, L, 'closed', owner ? [owner.id] : [], `${name} closed its doors${owner ? ` (${pname(owner)})` : ''}: ${why}.`, 0, { at: b.lot, c: [cause], kn: staff });
  L.stats.closed++;
  if (owner) {
    const st = openStoryOf(L, 'failing', owner.id);
    if (st) { link(L, st, fid); closeStory(s, st, `${name} closed.`); }
  }
  return fid;
}

/** The lots other systems changed this week: a sale is paid for, help keeps or loses its job. */
function syncLots(ctx: Ctx, L: LivingState, x: Idx): void {
  const s = ctx.s;
  for (const lotId of Object.keys(L.biz)) {
    const b = L.biz[lotId];
    const l = x.lots.get(lotId);
    const owner = L.people[b.owner];
    if (l && isLivingBizLot(l) && (b.tn === undefined || l.tenant === b.tn) && owner && !owner.dead) continue;
    if (l && (l.status === 'owned' || l.status === 'leased' || l.status === 'rival')) {
      // Bought out by the boss's family or another: the owner is paid, the help stays on.
      const h = [...(l.history ?? [])].reverse().find((e) => e.price);
      const price = h?.price ?? marketValue(s, l);
      if (owner) pay(ctx, L, 'x:land', `h:${owner.hh}`, price, `${pname(owner)} is paid for ${lotName(l)}`);
      const buyer = l.status === 'rival' ? `${FACTION_NAMES[l.owner as FactionId] ?? 'another family'}'s people` : `the House of ${s.houseName}`;
      fact(s, L, 'sold', owner ? [owner.id] : [], `${owner ? pname(owner) : 'The owner'} sold ${lotName(l)} to ${buyer}.`, 0, { at: lotId, amt: price });
      L.stats.sold++;
      endBusiness(ctx, L, b, true);
      continue;
    }
    if (l && l.stage === 'open' && l.status === 'private' && l.tenant && owner && !owner.dead && b.tn && l.tenant !== b.tn) {
      // Someone else put a new name on it (a deal across a desk): treat it as sold.
      if (owner) pay(ctx, L, 'x:land', `h:${owner.hh}`, marketValue(s, l), `${pname(owner)} sells ${lotName(l)}`);
      fact(s, L, 'sold', [owner.id], `${pname(owner)} sold ${lotName(l)} to ${l.tenant}.`, 0, { at: lotId });
      L.stats.sold++;
      endBusiness(ctx, L, b, true);
      continue;
    }
    // Burned, torn down or closed by someone else.
    if (!l || l.stage !== 'open') { closeBusiness(ctx, L, b, 'the building is gone'); continue; }
    if (b.tn === undefined) b.tn = l.tenant;
  }
  // A lot sold out from under its seller (the boss bought a closed shop): the seller is paid.
  for (const [lotId, hhId] of Object.entries(L.sellers ?? {})) {
    const l = x.lots.get(lotId);
    if (!l || l.status === 'sale') continue;
    if (l.status === 'owned' || l.status === 'leased' || l.status === 'rival') {
      const h = [...(l.history ?? [])].reverse().find((e) => e.price);
      if (L.hh[hhId] && L.hh[hhId].gone === undefined) pay(ctx, L, 'x:land', `h:${hhId}`, h?.price ?? marketValue(s, l), `the sale of ${l.address}`);
    }
    delete L.sellers![lotId];
  }
  // A going concern on a living lot with nobody behind it (another system opened it): a family moves in to run it.
  for (const l of x.lots.values()) {
    if (L.biz[l.id] || !isLivingBizLot(l)) continue;
    const hood = HOODS_BY_ID[L.hoods[0]];
    if (!hood.zones.includes(l.zone) && !L.hoods.some((h) => HOODS_BY_ID[h].zones.includes(l.zone))) continue;
    const h = stream(L, s.week, `adopt:${l.id}`);
    const o = parseOwner(l.tenant!);
    const sur = o.corp || !o.l ? pick(h, SURNAMES[pick(h, ['Italian', 'Irish', 'Jewish'] as const)]) : o.l;
    const hh = addHousehold(L, s, `the ${sur} family`, `rooms above ${lotName(l)}`, L.hoods[0], 0, 0);
    pay(ctx, L, 'x:arrive', `h:${hh.id}`, Math.round((400 + 600 * roll(L, s.week, `adopt$:${l.id}`)) * x.infl), 'savings they brought');
    const owner = makeFamily(L, s, h, hh, sur, pick(h, ['Italian', 'Irish', 'Jewish'] as const), 30 + Math.floor(roll(L, s.week, `adoptage:${l.id}`) * 25), { f: o.f, headG: o.g });
    for (const id of hh.members) { const p = L.people[id]; const a = ageOf(p, x.y, x.m); if (a >= 6 && a < 18) p.job = 'school'; }
    owner.job = l.id;
    L.biz[l.id] = { lot: l.id, owner: owner.id, cash: 0, staff: [], since: s.week, red: 0, net: 0, rev: 0, tn: l.tenant };
    fact(s, L, 'moved_in', [owner.id], `${pname(owner)} took over ${lotName(l)} and moved the family in upstairs.`, 0, { at: l.id });
    L.stats.movedIn++;
  }
}

/**
 * A place's average week: its trade, its costs, and how the season moves it.
 * Most uses carry their own figures; a use that is a catalog business (a pizza
 * parlor, a motel, an arcade) takes them from the catalog: its base week, its
 * upkeep and its own season.
 */
export function useEconomics(l: Lot): { rev: number; exp: number; season: [number, number]; seasonal: boolean } {
  const u = USES_BY_ID[l.use!];
  const z = ZONES_BY_ID[l.zone];
  if (u.biz) {
    const d = CATALOG[u.biz];
    const rev = Math.round(d.base * 3.2);
    return { rev, exp: Math.max(10, rev - (d.base - d.upkeep)), season: [d.season[0], Math.max(0.1, d.season[1])], seasonal: u.seasonal };
  }
  return { rev: u.rev, exp: u.exp, season: z.season, seasonal: u.seasonal };
}

function businessesWeek(ctx: Ctx, L: LivingState, x: Idx): void {
  const s = ctx.s;
  for (const lotId of Object.keys(L.biz)) {
    const b = L.biz[lotId];
    const l = x.lots.get(lotId);
    const owner = L.people[b.owner];
    if (!l || !owner) continue;
    const u = useEconomics(l);
    const hood = L.hh[owner.hh]?.hood ?? L.hoods[0];
    const st = s.hood?.stats[hood];
    const mult = u.seasonal ? (x.season ? u.season[0] : u.season[1]) : 1;
    const skill = 0.85 + ((owner.t[AMB] + owner.t[HON]) / 200) * 0.3;
    const noise = 0.85 + roll(L, x.week, `rev:${lotId}`) * 0.3;
    const rev = Math.round(u.rev * mult * (st?.econ ?? 1) * (0.6 + (0.4 * l.condition) / 100) * skill * noise * x.infl);
    const got = pay(ctx, L, 'x:cust', `b:${lotId}`, rev, `${lotName(l)}: the week's trade`);
    b.rev += got;
    // A man skimming takes his before it reaches the till's count.
    for (const id of b.staff) {
      const p = L.people[id];
      if (p?.plan?.k === 'skim' && p.plan.stage >= 1 && present(p, x.week)) {
        const take = Math.round(got * (p.plan.amt ?? 6) / 100);
        const t = pay(ctx, L, `b:${lotId}`, `p:${p.id}`, take, `${pname(p)} skims the register`);
        b.skim = (b.skim ?? 0) + t;
      }
    }
    // Wages, then the suppliers, the help from off the island, the light bill.
    // A seasonal shop shutters for the winter: the light bill and the insurance, not the help and the stock.
    const costs = Math.round(u.exp * (u.seasonal && !x.season ? 0.15 + 0.6 * mult : 0.4 + 0.6 * mult) * x.infl);
    let wages = 0;
    let short = false;
    for (const id of [...b.staff]) {
      const p = L.people[id];
      if (!p || p.dead || p.left !== undefined || p.job !== lotId) { b.staff = b.staff.filter((s2) => s2 !== id); continue; }
      if (!present(p, x.week)) continue;
      const w = p.wage ?? Math.round(WAGE * x.infl);
      const paid = pay(ctx, L, `b:${lotId}`, `h:${p.hh}`, w, `${pname(p)}'s wages`);
      wages += paid;
      if (paid < w) {
        p.owed = (p.owed ?? 0) + (w - paid);
        short = true;
        if (!isKin(L, p.id, owner.id) && (p.ties[owner.id]?.gr ?? 0) < 45) bump(p, owner.id, -2, -3, 2, `did not pay ${his(p)} wages`);
      }
    }
    const supplies = Math.max(Math.round(costs * 0.3), costs - wages);
    const sup = pay(ctx, L, `b:${lotId}`, 'x:supply', supplies, `${lotName(l)}: supplies and help`);
    if (sup < supplies) short = true;
    b.net = got - wages - sup;
    b.red = short ? b.red + 1 : 0;
    if (short) {
      // The owner props it up from the house before he lets anyone go unpaid.
      const hh = L.hh[owner.hh];
      const up = hh ? upkeepOf(L, hh, x) : 0;
      if (hh && hh.cash > up * 4 && pay(ctx, L, `h:${hh.id}`, `b:${lotId}`, Math.min(hh.cash - up * 4, supplies - sup + costs), `${pname(owner)} puts ${his(owner)} own money into the shop`) > 0) b.red = Math.max(0, b.red - 1);
    }
    // Back wages first, then the owner's draw over a cushion.
    for (const id of b.staff) {
      const p = L.people[id];
      if (p?.owed && b.cash > costs) {
        const back = pay(ctx, L, `b:${lotId}`, `h:${p.hh}`, Math.min(p.owed, b.cash - costs), `${pname(p)}'s back wages`);
        p.owed -= back;
        if (back) bump(p, owner.id, 2, 3, -3);
      }
    }
    const cushion = Math.round(u.exp * 6 * x.infl);
    if (b.cash > cushion) pay(ctx, L, `b:${lotId}`, `h:${owner.hh}`, Math.round((b.cash - cushion) * 0.6), `${pname(owner)}'s draw from ${lotName(l)}`);
  }
}

/** The help at a family-owned place (the boss's, a rival's) is paid out of that place's own books. */
function outsideWages(ctx: Ctx, L: LivingState, x: Idx): void {
  for (const p of x.adults) {
    if (!p.job && p.ui !== undefined) {
      if (p.ui >= x.week) pay(ctx, L, 'x:state', `h:${p.hh}`, Math.round(WAGE * 0.5 * x.infl), `${pname(p)}'s unemployment check`);
      else p.ui = undefined;
      continue;
    }
    if (!p.job || !p.wage || L.biz[p.job]) continue;
    if (p.job === 'out') {
      // Off-island work pays less in the winter (the canneries, the boatyards, the Navy base).
      pay(ctx, L, 'x:outwage', `h:${p.hh}`, Math.round(p.wage * (x.season ? 1 : 0.8)), `${pname(p)}'s pay from off the island`);
      continue;
    }
    const l = x.lots.get(p.job);
    if (outfitLot(l)) pay(ctx, L, 'x:outwage', `h:${p.hh}`, p.wage, `${pname(p)}'s wages at ${lotName(l!)}`);
    else if (p.job.startsWith('lot') || x.lots.has(p.job)) {
      // The place closed or burned: out of work.
      fact(ctx.s, L, 'laid_off', [p.id], `${pname(p)} lost ${his(p)} job when ${l ? lotName(l) : 'the place'} closed.`, 1, { at: p.job });
      unemploy(L, p, x.week);
    }
  }
}

function householdsWeek(ctx: Ctx, L: LivingState, x: Idx): void {
  for (const id of Object.keys(L.hh)) {
    const hh = L.hh[id];
    if (hh.gone !== undefined) continue;
    const up = upkeepOf(L, hh, x);
    if (!up) continue;
    const paid = pay(ctx, L, `h:${id}`, 'x:market', up, `${hh.name}: the week's living`);
    let behind = paid < up;
    if (hh.rent) {
      const r = Math.round(hh.rent * x.infl);
      if (pay(ctx, L, `h:${id}`, 'x:rent', r, `${hh.name}: the rent`) < r) behind = true;
    }
    hh.behind = behind ? (hh.behind ?? 0) + 1 : 0;
    // A comfortable family lives up to its money.
    const comfortable = 2000 * x.infl;
    if (hh.cash > comfortable) pay(ctx, L, `h:${id}`, 'x:market', Math.round((hh.cash - comfortable) * 0.012), `${hh.name}: a new car, the church, the good china`);
    // When the house runs dry, a man's own money goes in.
    if (behind) {
      for (const p of presentMembers(L, hh, x.week)) if (p.stash > 0 && p.t[WARM] + p.t[HON] > 80) pay(ctx, L, `p:${p.id}`, `h:${id}`, p.stash, `${pname(p)} puts in what ${he(p)} had put aside`);
    }
  }
}

function debtsWeek(ctx: Ctx, L: LivingState, x: Idx): void {
  const s = ctx.s;
  for (const d of L.debts) {
    if (d.st !== 'open' || d.next > x.week) continue;
    const by = L.people[d.by];
    const hh = L.hh[d.hh];
    if (!hh || hh.gone !== undefined) continue;
    const due = Math.min(d.pay, d.out);
    const to = lenderAcct(L, s, d);
    let got = pay(ctx, L, `h:${hh.id}`, to, due, `${hh.name} pays ${lenderName(s, L, d)}`);
    if (got < due && by && !by.dead) got += pay(ctx, L, `p:${by.id}`, to, due - got, `${pname(by)} pays from ${his(by)} own money`);
    d.out -= got;
    d.next = x.week + 1;
    const st = storyOfDebt(L, d);
    if (d.out <= 0) {
      d.out = 0;
      d.st = 'paid';
      const fid = fact(s, L, 'repaid', [d.by, d.lender].filter((id) => !id.startsWith('rival:') && id !== 'bank'), `${pname(by)} paid off what ${he(by)} owed ${lenderName(s, L, d)}.`, 2, { c: [d.fid], amt: d.amt });
      link(L, st, fid);
      closeStory(s, st, `${by?.f ?? 'He'} paid it all back.`);
      if (d.lender.startsWith('tp')) bump(L.people[d.lender], d.by, 5, 10);
      continue;
    }
    if (got >= due) { if (d.missed) d.missed = Math.max(0, d.missed - 1); continue; }
    d.missed++;
    // A shylock adds his late fee.
    if (d.lender.startsWith('rival:') || (!d.lender.startsWith('tp') && d.lender !== 'family' && d.lender !== 'bank')) d.out += Math.round(d.pay * 0.1);
    if (d.missed === 1 && !d.dw) {
      const fid = fact(s, L, 'missed', [d.by, ...(d.lender.startsWith('tp') || s.characters[d.lender] ? [d.lender] : [])], `${pname(by)} missed a payment to ${lenderName(s, L, d)} (still owes $${d.out.toLocaleString('en-US')}).`, 2, { c: [d.fid], amt: d.out });
      link(L, st, fid);
    }
    if (d.missed === 6 && !d.dw) {
      d.dw = x.week;
      L.stats.defaults++;
      const fid = fact(s, L, 'default', [d.by, ...(d.lender.startsWith('tp') || s.characters[d.lender] ? [d.lender] : [])], `${pname(by)} has stopped paying ${lenderName(s, L, d)}: $${d.out.toLocaleString('en-US')} still owed.`, 1, { c: [d.fid], amt: d.out });
      link(L, st, fid);
      if (d.lender.startsWith('tp')) bump(L.people[d.lender], d.by, -15, -25, 35, `stopped paying back the $${d.amt}`);
      if (by && !d.lender.startsWith('tp')) bump(by, d.lender, -5, 0, 15, `leaned on ${him(by)} for the money`);
    }
  }
}

export function storyOfDebt(L: LivingState, d: Td) {
  return storyById(L, factById(L, d.fid)?.st) ?? openStoryOf(L, 'debt', d.by);
}

/* ------------------------------------------------------------------ */
/* The people choose                                                   */
/* ------------------------------------------------------------------ */

interface Cand { k: string; score: number; run: () => void }

function familyNeed(p: Tp, x: Idx): number {
  return clamp((x.week - (p.famW ?? x.week - 4)) * 7);
}

/**
 * One grown person's week: a plan whose stage is due, else the best of a
 * small set of feasible actions, scored from his own situation. Logged in his
 * memory when it matters.
 */
function personWeek(ctx: Ctx, L: LivingState, p: Tp, x: Idx): void {
  const s = ctx.s;
  if (p.plan && p.plan.next <= x.week && advancePlan(ctx, L, p, x)) return;
  const a = age(p, x);
  const hh = hhOf(L, p);
  if (!hh) return;
  const need = moneyNeed(L, p, x);
  const n = (k: string) => roll(L, x.week, `${p.id}:${k}`) * 8;
  const cands: Cand[] = [{ k: 'routine', score: 18 + n('routine'), run: () => undefined }];
  const working = !!p.job && p.job !== 'school';
  const canWork = a >= 18 && a < 68 && p.job !== 'home' && p.job !== 'retired';
  if (!working && canWork) cands.push({ k: 'seek_work', score: 30 + need * 0.5 + p.t[AMB] * 0.1 + Math.min(20, (p.idle ?? 0) * 2) + n('seek'), run: () => seekWork(ctx, L, p, x) });
  const spouse = p.sp ? L.people[p.sp] : undefined;
  const kidsHome = p.kids.some((k) => present(L.people[k], x.week) && L.people[k].hh === p.hh);
  if ((spouse && !spouse.dead) || kidsHome) cands.push({ k: 'family', score: 8 + familyNeed(p, x) * 0.45 + p.t[WARM] * 0.25 + n('fam'), run: () => familyTime(L, p, x) });
  if (!p.plan && (!p.sp || L.people[p.sp]?.dead) && !p.sepd && a >= 18 && a <= 50 && (p.cd.court ?? -99) + 12 <= x.week) {
    const love = a <= 34 ? 32 : 12;
    cands.push({ k: 'court', score: love + p.t[WARM] * 0.2 - 4 + n('court'), run: () => startCourting(ctx, L, p, x) });
  }
  if (!p.plan && spouse && !spouse.dead && !p.sepd && p.t[VICE] >= 55 && (p.cd.affair ?? -99) + 26 <= x.week) {
    const cold = 35 - (p.ties[spouse.id]?.a ?? 50);
    if (cold > 0) cands.push({ k: 'affair', score: p.t[VICE] * 0.4 + cold * 0.8 - p.t[HON] * 0.15 + n('affair'), run: () => startAffair(ctx, L, p, x) });
  }
  if (need >= 80 && (p.cd.borrow ?? -99) + 12 <= x.week && !L.debts.some((d) => d.hh === p.hh && d.st === 'open') && !hhBorrowedLately(L, p, x)) {
    cands.push({ k: 'borrow', score: need * 0.75 - p.t[AMB] * 0.05 + n('borrow'), run: () => borrow(ctx, L, p, x, Math.round(upkeepOf(L, hh, x) * 6), 'to keep the house going') });
  }
  const mine = L.debts.filter((d) => d.by === p.id && d.st === 'open');
  if (mine.length && need <= 25) cands.push({ k: 'repay', score: 26 + p.t[HON] * 0.25 + n('repay'), run: () => repayEarly(ctx, L, p, mine[0], x) });
  if (working && p.job && L.biz[p.job] && L.biz[p.job].owner !== p.id && p.t[AMB] >= 60 && (p.cd.raise ?? -99) + 52 <= x.week) {
    cands.push({ k: 'raise', score: p.t[AMB] * 0.35 + n('raise'), run: () => askRaise(ctx, L, p, x) });
  }
  if (!p.plan && working && p.job && L.biz[p.job] && L.biz[p.job].owner !== p.id && p.t[HON] < 40 && need >= 45 && (p.cd.skim ?? -99) + 26 <= x.week) {
    const owner = L.people[L.biz[p.job].owner];
    const vigil = owner ? (owner.t[AMB] + owner.t[HON]) / 4 : 30;
    const kinTo = owner && isKin(L, p.id, owner.id) ? 20 : 0;
    cands.push({ k: 'skim', score: (100 - p.t[HON]) * 0.45 + need * 0.3 - vigil * 0.3 - kinTo + p.t[NERVE] * 0.1 + n('skim'), run: () => startSkim(ctx, L, p, x) });
  }
  if (p.t[HON] < 25 && need >= 85 && (p.cd.refused ?? -99) + 4 >= x.week && (p.cd.steal ?? -99) + 26 <= x.week) {
    cands.push({ k: 'steal', score: 35 + (100 - p.t[HON]) * 0.3 + p.t[NERVE] * 0.1 + n('steal'), run: () => steal(ctx, L, p, x) });
  }
  const trouble = troubleOf(L, p, x);
  if (trouble && (p.cd.ask ?? -99) + 16 <= x.week && !askedAbout(L, p, trouble)) cands.push({ k: 'ask_help', score: 30 + need * 0.45 + p.t[WARM] * 0.1 - p.t[AMB] * 0.08 + (trouble.k === 'theft' ? 25 : 0) + n('ask'), run: () => askHelp(ctx, L, p, x, trouble) });
  const grudge = worstGrudge(p, L, s);
  if (grudge && !p.plan && (p.cd.revenge ?? -99) + 39 <= x.week) {
    cands.push({ k: 'revenge', score: (grudge.t.gr - 55) * 1.3 + p.t[NERVE] * 0.25 - p.t[WARM] * 0.25 - p.t[HON] * 0.1 + n('rev'), run: () => startRevenge(ctx, L, p, grudge.id, x) });
    cands.push({ k: 'settle', score: p.t[WARM] * 0.3 + (100 - grudge.t.gr) * 0.15 + n('settle'), run: () => settleGrudge(ctx, L, p, grudge.id, x) });
  }
  if (!p.plan && p.goal === 'own_business' && (p.cd.invest ?? -99) + 8 <= x.week) {
    cands.push({ k: 'invest', score: 25 + p.t[AMB] * 0.35 - need * 0.3 + n('invest'), run: () => startOpenBusiness(ctx, L, p, x) });
  }
  if (!p.plan && p.t[AMB] >= 70 && p.t[HON] < 55 && a < 40 && !p.ties[`patron`] && (p.cd.patron ?? -99) + 52 <= x.week) {
    cands.push({ k: 'patron', score: p.t[AMB] * 0.3 + p.t[NERVE] * 0.2 - 10 + n('patron'), run: () => seekPatron(ctx, L, p, x) });
  }
  let best = cands[0];
  for (const c of cands) if (c.score > best.score) best = c;
  best.run();
}

/** One borrower per household at a time: the house does not go to every lender at once. */
function hhBorrowedLately(L: LivingState, p: Tp, x: Idx): boolean {
  const hh = L.hh[p.hh];
  return !!hh && hh.members.some((id) => (L.people[id]?.cd.borrow ?? -99) + 8 > x.week);
}

function familyTime(L: LivingState, p: Tp, x: Idx): void {
  p.famW = x.week;
  if (p.sp) { bump(p, p.sp, 3, 1); bump(L.people[p.sp], p.id, 3, 1); }
  for (const k of p.kids) if (L.people[k]?.hh === p.hh) { bump(p, k, 2); bump(L.people[k], p.id, 2); }
}

function seekWork(ctx: Ctx, L: LivingState, p: Tp, x: Idx): void {
  const s = ctx.s;
  p.idle = (p.idle ?? 0) + 1;
  // Family first, then friends, then anyone hiring.
  const offers: { lot: string; score: number }[] = [];
  for (const lotId of Object.keys(L.biz)) {
    const b = L.biz[lotId];
    const l = x.lots.get(lotId);
    if (!l || b.owner === p.id || b.staff.length >= wantStaff(L, b, l, x) || b.red >= 2) continue;
    const owner = L.people[b.owner];
    if (!owner) continue;
    const t = owner.ties[p.id];
    const kin = isKin(L, owner.id, p.id) ? 40 : 0;
    const score = kin + (t ? t.a * 0.3 + t.tr * 0.3 - t.gr : 0) + roll(L, x.week, `offer:${p.id}:${lotId}`) * 40;
    if (score >= 25) offers.push({ lot: lotId, score });
  }
  // The family's own places and the rivals' hire too (their wages are in their books).
  for (const l of x.lots.values()) {
    if (!outfitLot(l) || !L.hoods.includes(HOODS_BY_ID[L.hh[p.hh]?.hood ?? L.hoods[0]].id)) continue;
    if (!HOODS_BY_ID[L.hoods[0]].zones.includes(l.zone)) continue;
    const have = x.byJob.get(l.id)?.length ?? 0;
    if (have >= Math.ceil(jobsOf(l) / 3)) continue;
    if (roll(L, x.week, `offer:${p.id}:${l.id}`) < 0.25) offers.push({ lot: l.id, score: 20 });
  }
  offers.sort((a, b) => b.score - a.score || a.lot.localeCompare(b.lot));
  if (offers.length) {
    const l = x.lots.get(offers[0].lot);
    hire(s, L, p, offers[0].lot, x, l && outfitLot(l) ? (l.status === 'rival' ? `, a place ${FACTION_NAMES[l.owner as FactionId] ?? 'another family'}'s people own` : ', one of the Family\'s places') : '');
    if (l && outfitLot(l)) p.wage = Math.round(WAGE * x.infl);
    return;
  }
  if (roll(L, x.week, `out:${p.id}`) < (x.season ? 0.22 : 0.1)) {
    p.job = 'out';
    p.wage = Math.round((WAGE - 5) * x.infl);
    p.idle = 0;
    fact(s, L, 'work_out', [p.id], `${pname(p)} found work off the island${x.season ? ' for the summer' : ' at the Cape May boatyards'}.`, 1);
  }
}

/* --- courtship, marriage, affairs ----------------------------------- */

function startCourting(ctx: Ctx, L: LivingState, p: Tp, x: Idx): void {
  const s = ctx.s;
  p.cd.court = x.week;
  const other = p.g === 'M' ? 'F' : 'M';
  const pa = age(p, x);
  const hood = L.hh[p.hh]?.hood;
  const pool = x.singles[other].filter((q) => q.id !== p.id && !q.plan && Math.abs(age(q, x) - pa) <= 10 && !isKin(L, p.id, q.id) && L.hh[q.hh]?.hood === hood);
  let best: Tp | undefined;
  let bestScore = 25;
  for (const q of pool) {
    const t = p.ties[q.id];
    const opp = (q.job && q.job === p.job ? 20 : 0) + (t ? t.a * 0.6 : 0);
    if (!opp) continue;
    const sc = opp + roll(L, x.week, `like:${p.id}:${q.id}`) * 30 + (q.t[WARM] - 50) * 0.2;
    if (sc > bestScore) { best = q; bestScore = sc; }
  }
  if (!best) return;
  // She (or he) decides for herself.
  const qt = best.ties[p.id];
  const yes = (qt ? qt.a * 0.5 : 0) + best.t[WARM] * 0.3 + roll(L, x.week, `yes:${best.id}:${p.id}`) * 50 - (best.cd.court && best.cd.court + 8 > x.week ? 20 : 0);
  if (yes < 40) {
    bump(p, best.id, -5);
    return;
  }
  bump(p, best.id, 25, 8);
  bump(best, p.id, 22, 8);
  const fid = fact(s, L, 'courting', [p.id, best.id], `${pname(p)} has been stepping out with ${pname(best)}.`, 1, { kn: [...(L.hh[p.hh]?.members ?? []), ...(L.hh[best.hh]?.members ?? [])] });
  const st = openStory(s, L, 'match', `${p.f} ${p.l} and ${best.f} ${best.l}`, [p.id, best.id], [fid]);
  const plan: Plan = { k: 'court', stage: 0, since: x.week, next: x.week + 6, target: best.id, why: `sweet on ${best.f}`, fid };
  p.plan = plan;
  best.plan = { ...plan, target: p.id, why: `sweet on ${p.f}` };
  best.cd.court = x.week;
  void st;
}

function startAffair(ctx: Ctx, L: LivingState, p: Tp, x: Idx): void {
  const s = ctx.s;
  p.cd.affair = x.week;
  // Only someone he already knows and sees (the same workplace, a neighbor): opportunity, not chance.
  const cands = Object.entries(p.ties)
    .filter(([id, t]) => t.a >= 35 && !t.k && id.startsWith('tp'))
    .map(([id]) => L.people[id])
    .filter((q): q is Tp => present(q, x.week) && q.g !== p.g && age(q, x) >= 21 && !q.plan && !isKin(L, p.id, q.id) && (q.job === p.job || !!q.ties[p.id]))
    .sort((a, b) => a.id.localeCompare(b.id));
  const q = cands.find((c) => {
    const married = !!c.sp && !L.people[c.sp]?.dead;
    const cold = married ? 35 - (c.ties[c.sp!]?.a ?? 50) : 20;
    return c.t[VICE] * 0.4 + cold + (c.ties[p.id]?.a ?? 0) * 0.4 + roll(L, x.week, `affair:${c.id}:${p.id}`) * 30 > 60;
  });
  if (!q) return;
  const fid = fact(s, L, 'affair', [p.id, q.id], `${pname(p)} and ${pname(q)} have been seeing each other on the quiet.`, 3);
  L.stats.affairs++;
  openStory(s, L, 'affair', `${p.f} ${p.l} and ${q.f} ${q.l}`, [p.id, q.id], [fid]);
  p.plan = { k: 'affair', stage: 1, since: x.week, next: x.week + 4, target: q.id, amt: 0, why: 'his marriage has gone cold', fid };
  q.plan = { k: 'affair', stage: 1, since: x.week, next: x.week + 4, target: p.id, amt: 0, why: 'lonely', fid };
  q.cd.affair = x.week;
  bump(p, q.id, 10, 5);
  bump(q, p.id, 10, 5);
}

/** Move a person (and the children of his who live with him) into another household. */
function moveTo(L: LivingState, p: Tp, to: Th): void {
  const from = L.hh[p.hh];
  // His young children (under 18, living with him) come along.
  const movers = [p, ...p.kids.map((k) => L.people[k]).filter((k): k is Tp => !!k && !k.dead && k.hh === p.hh && !k.sp && k.kids.length === 0 && (k.job === 'school' || k.job === undefined) && !k.cd.adult)];
  for (const m of movers) {
    if (from) from.members = from.members.filter((id) => id !== m.id);
    if (!to.members.includes(m.id)) to.members.push(m.id);
    m.hh = to.id;
  }
}

function wedding(ctx: Ctx, L: LivingState, a: Tp, b: Tp, x: Idx): void {
  const s = ctx.s;
  const groom = a.g === 'M' ? a : b;
  const bride = a.g === 'M' ? b : a;
  const otherAdults = (p: Tp) => presentMembers(L, L.hh[p.hh], x.week).filter((m) => m.id !== p.id && age(m, x) >= 18 && !p.kids.includes(m.id)).length;
  let home: Th;
  if (!otherAdults(groom)) home = L.hh[groom.hh];
  else if (!otherAdults(bride)) home = L.hh[bride.hh];
  else {
    const h = stream(L, x.week, `home:${groom.id}`);
    home = addHousehold(L, s, `the ${groom.l} household`, `a rented flat on ${pick(h, ['Cedar Ave', 'Oak Ave', 'Spicer Ave', 'Magnolia Ave', 'Pine Ave', 'Taylor Ave'])}`, L.hh[groom.hh].hood, 0, 14);
  }
  // The parents help the young couple set up house.
  for (const p of [groom, bride]) {
    const ph = L.hh[p.hh];
    if (ph && ph.id !== home.id) pay(ctx, L, `h:${ph.id}`, `h:${home.id}`, Math.round(Math.min(ph.cash * 0.1, 300 * x.infl)), `a wedding gift from ${ph.name}`);
    pay(ctx, L, `p:${p.id}`, `h:${home.id}`, Math.round(p.stash * 0.5), `${pname(p)} brings what ${he(p)} saved`);
  }
  pay(ctx, L, `h:${home.id}`, 'x:market', Math.round(Math.min(L.hh[home.id].cash * 0.3, 250 * x.infl)), 'the wedding: the hall, the band, the cake');
  if (groom.hh !== home.id) moveTo(L, groom, home);
  if (bride.hh !== home.id) moveTo(L, bride, home);
  const bridePrev = bride.l;
  marryRecords(groom, bride, [clamp((groom.ties[bride.id]?.a ?? 60) + 10, -100, 100), clamp((bride.ties[groom.id]?.a ?? 60) + 10, -100, 100)]);
  bride.l = groom.l;
  home.name = `the ${groom.l} family`;
  if (bride.job === 'school' || (bride.job && !L.biz[bride.job] && bride.job !== 'out')) bride.job = 'home';
  groom.plan = undefined;
  bride.plan = undefined;
  const st = openStoryOf(L, 'match', groom.id);
  const fid = fact(s, L, 'married', [groom.id, bride.id], `${pname(groom)} married ${bride.f} ${bridePrev}.`, 0, { c: [st?.f[st.f.length - 1]] });
  L.stats.marriages++;
  if (st) { link(L, st, fid); closeStory(s, st, 'They married.'); }
}

/* --- plans in motion -------------------------------------------------- */

/** A plan's stage comes due. Returns true when it took the week. */
function advancePlan(ctx: Ctx, L: LivingState, p: Tp, x: Idx): boolean {
  const s = ctx.s;
  const plan = p.plan!;
  const target = plan.target ? L.people[plan.target] : undefined;
  switch (plan.k) {
    case 'court': {
      if (!present(target, x.week) || target.sp && !L.people[target.sp]?.dead) { p.plan = undefined; return false; }
      const mine = p.ties[target.id]?.a ?? 0;
      const theirs = target.ties[p.id]?.a ?? 0;
      bump(p, target.id, 4 + Math.round(roll(L, x.week, `c1:${p.id}`) * 6) - 2);
      bump(target, p.id, 4 + Math.round(roll(L, x.week, `c2:${target.id}`) * 6) - 2);
      if ((mine < 12 || theirs < 12) && x.week - plan.since >= 8) {
        const fid = fact(s, L, 'parted', [p.id, target.id], `${pname(p)} and ${pname(target)} stopped seeing each other.`, 1, { c: [plan.fid] });
        const st = openStoryOf(L, 'match', p.id);
        link(L, st, fid);
        closeStory(s, st, 'It did not last.');
        p.plan = undefined;
        target.plan = undefined;
        p.cd.court = x.week + 20;
        target.cd.court = x.week + 20;
        return true;
      }
      if (plan.stage === 0 && x.week - plan.since >= 10 && p.g === 'M' && mine >= 50 && theirs >= 45) {
        plan.stage = 1;
        if (target.plan) target.plan.stage = 1;
        const fid = fact(s, L, 'engaged', [p.id, target.id], `${pname(p)} and ${pname(target)} are engaged.`, 0, { c: [plan.fid] });
        link(L, openStoryOf(L, 'match', p.id), fid);
        plan.next = x.week + 8 + Math.floor(roll(L, x.week, `eng:${p.id}`) * 12);
        if (target.plan) target.plan.next = plan.next + 99;
        return true;
      }
      if (plan.stage === 1 && p.g === 'M') { wedding(ctx, L, p, target, x); return true; }
      plan.next = x.week + 3;
      if (target.plan && target.plan.stage === 0) target.plan.next = x.week + 99;
      return false;
    }
    case 'affair': {
      if (!present(target, x.week)) { p.plan = undefined; return false; }
      plan.amt = (plan.amt ?? 0) + 5 + Math.round(p.t[VICE] / 20);
      plan.next = x.week + 3;
      const spouse = p.sp ? L.people[p.sp] : undefined;
      // Exposure grows; a careless man is found out sooner.
      if (spouse && !spouse.dead && roll(L, x.week, `out:${plan.fid}`) < plan.amt / 400) {
        const f = factById(L, plan.fid);
        if (f) { f.sec = 1; f.kn.push(spouse.id); }
        const fid = fact(s, L, 'affair_out', [spouse.id, p.id, target.id], `${pname(spouse)} found out about ${p.f} and ${target.f}.`, 1, { c: [plan.fid], kn: L.hh[p.hh]?.members });
        const st = openStoryOf(L, 'affair', p.id);
        link(L, st, fid);
        bump(spouse, p.id, -40, -40, 60, `cheated with ${target.f}`);
        bump(spouse, target.id, -30, -30, 50, `carried on with ${p.f}`);
        p.plan = undefined;
        if (target.plan?.target === p.id) target.plan = undefined;
        // She decides: stay and make him pay for it, or go.
        const leave = spouse.t[NERVE] * 0.5 + (100 - spouse.t[WARM]) * 0.3 + roll(L, x.week, `leave:${spouse.id}`) * 40;
        if (leave > 60) {
          separate(ctx, L, spouse, p, x, fid);
          closeStory(s, st, `${spouse.f} left ${p.f}.`);
        } else closeStory(s, st, `${spouse.f} stayed, but she has not forgotten.`);
        return true;
      }
      // It runs its course.
      if (x.week - plan.since > 30 && roll(L, x.week, `end:${plan.fid}`) < 0.15) {
        p.plan = undefined;
        if (target.plan?.target === p.id) target.plan = undefined;
        closeStory(s, openStoryOf(L, 'affair', p.id), 'It ended quietly.');
      }
      return false;
    }
    case 'skim': {
      // Conceal: a man who no longer needs it, and has a conscience, puts some back and stops.
      const need = moneyNeed(L, p, x);
      plan.next = x.week + 4;
      if (plan.stage === 0) { plan.stage = 1; return false; }
      if (need < 30 && p.t[HON] >= 30 && roll(L, x.week, `stop:${p.id}`) < 0.3) {
        const back = pay(ctx, L, `p:${p.id}`, `b:${plan.target}`, Math.round(p.stash * 0.4), `${pname(p)} quietly puts money back in the till`);
        fact(s, L, 'skim', [p.id], `${pname(p)} stopped skimming${back ? ` and quietly put $${back} back` : ''}.`, 3, { c: [plan.fid], at: plan.target });
        p.plan = undefined;
        p.cd.skim = x.week;
      }
      return false;
    }
    case 'revenge':
      return revengeStage(ctx, L, p, x);
    case 'open_business':
      return openBusinessStage(ctx, L, p, x);
    default:
      p.plan = undefined;
      return false;
  }
}

function separate(ctx: Ctx, L: LivingState, leaver: Tp, other: Tp, x: Idx, cause: string): void {
  const s = ctx.s;
  const h = stream(L, x.week, `sep:${leaver.id}`);
  // She goes back to her people if they are here, else to rooms of her own; the young children go with her.
  const parentsHh = [leaver.fa, leaver.mo].map((id) => (id ? L.people[id] : undefined)).find((q) => present(q, x.week))?.hh;
  const to = parentsHh && L.hh[parentsHh] ? L.hh[parentsHh] : addHousehold(L, s, `${leaver.f} ${leaver.l}'s household`, `rooms on ${pick(h, ['Cedar Ave', 'Oak Ave', 'Spicer Ave'])}`, L.hh[leaver.hh].hood, 0, 10);
  const half = Math.round((L.hh[leaver.hh]?.cash ?? 0) * 0.35);
  pay(ctx, L, `h:${leaver.hh}`, `h:${to.id}`, half, `${pname(leaver)} takes her share`);
  moveTo(L, leaver, to);
  leaver.sepd = 1;
  other.sepd = 1;
  if (leaver.job === 'home') leaver.job = undefined;
  fact(s, L, 'separated', [leaver.id, other.id], `${pname(leaver)} has left ${pname(other)}.`, 1, { c: [cause] });
}

function startSkim(ctx: Ctx, L: LivingState, p: Tp, x: Idx): void {
  const s = ctx.s;
  p.cd.skim = x.week;
  const rate = 3 + Math.round((100 - p.t[HON]) / 15);
  const fid = fact(s, L, 'skim', [p.id], `${pname(p)} has started taking from the register at ${lotName(x.lots.get(p.job!)!)}.`, 3, { at: p.job });
  L.stats.skims++;
  openStory(s, L, 'skim', `The register at ${lotName(x.lots.get(p.job!)!)}`, [p.id, L.biz[p.job!].owner], [fid]);
  p.plan = { k: 'skim', stage: 1, since: x.week, next: x.week + 4, target: p.job, amt: rate, why: 'short of money and nobody counts the till twice', fid };
}

function steal(ctx: Ctx, L: LivingState, p: Tp, x: Idx): void {
  const s = ctx.s;
  p.cd.steal = x.week;
  // Opportunity: a house or a till he knows.
  const targets = Object.keys(p.ties).map((id) => L.people[id]).filter((q): q is Tp => present(q, x.week) && !isKin(L, p.id, q.id) && q.hh !== p.hh && (L.hh[q.hh]?.cash ?? 0) > 80).sort((a, b) => a.id.localeCompare(b.id));
  const q = targets[0];
  if (!q) return;
  const hh = L.hh[q.hh];
  const took = pay(ctx, L, `h:${hh.id}`, `p:${p.id}`, Math.round(Math.min(hh.cash * 0.3, 250 * x.infl)), `money taken from ${hh.name}`);
  if (!took) return;
  const theft = fact(s, L, 'theft', [q.id], `Somebody took $${took} from ${hh.name}'s place.`, 1, { amt: took, kn: hh.members });
  const thief = fact(s, L, 'thief', [p.id], `${pname(p)} took $${took} from ${hh.name}.`, 3, { c: [theft], amt: took });
  L.stats.thefts++;
  openStory(s, L, 'theft', `The money taken from ${hh.name}`, [q.id], [theft, thief]);
  const sh = s.hood?.stats[hh.hood];
  if (sh) sh.police = Math.min(95, sh.police + 1);
}

/* --- money between people ------------------------------------------- */

/**
 * He asks around for a loan: his family and friends first (they decide by
 * what they feel for him and what they can spare), then a man in the
 * family's crew who lends at the vig, then (if one is strong here) a rival
 * family's shylock. No lender who cannot spare it.
 */
export function borrow(ctx: Ctx, L: LivingState, p: Tp, x: Idx, amount: number, why: string, cause?: string): Td | undefined {
  const s = ctx.s;
  p.cd.borrow = x.week;
  const amt = Math.max(50, Math.round(amount));
  const friends = Object.entries(p.ties)
    .filter(([id, t]) => id.startsWith('tp') && (t.tr >= 35 || !!t.k) && t.gr < 40)
    .map(([id]) => L.people[id])
    .filter((q): q is Tp => present(q, x.week) && q.hh !== p.hh && age(q, x) >= 18)
    .sort((a, b) => (p.ties[b.id]?.tr ?? 0) - (p.ties[a.id]?.tr ?? 0) || a.id.localeCompare(b.id))
    .slice(0, 4);
  for (const q of friends) {
    const qh = L.hh[q.hh];
    if (!qh) continue;
    const spare = qh.cash - upkeepOf(L, qh, x) * 8;
    const t = q.ties[p.id];
    const yes = (t?.a ?? 0) * 0.5 + (t?.tr ?? 20) * 0.4 + q.t[WARM] * 0.3 - (amt / Math.max(1, spare)) * 40 + roll(L, x.week, `lend:${q.id}:${p.id}`) * 20 - (L.debts.some((d) => d.by === p.id && d.lender === q.id && d.st !== 'paid') ? 40 : 0);
    if (spare < amt || yes < 45) continue;
    const fid = fact(s, L, 'loan', [p.id, q.id], `${pname(p)} borrowed $${amt} from ${pname(q)} ${why}.`, 2, { amt, c: [cause] });
    const d = newDebt(ctx, L, { lender: q.id, from: `h:${qh.id}`, by: p, amt, rate: 0, weeks: 20, why, fid });
    if (d) { openStoryOf(L, ['newbiz', 'failing'], p.id) ? link(L, openStoryOf(L, ['newbiz', 'failing'], p.id), fid) : openStory(s, L, 'debt', `${p.f} ${p.l}'s debt to ${q.f} ${q.l}`, [p.id, q.id], [cause, fid]); bump(p, q.id, 6, 4); }
    return d;
  }
  // A man in the crew lends at the vig, if he has it to lend and the borrower is good for it.
  const hood = L.hh[p.hh]?.hood ?? L.hoods[0];
  const lenders = districtCrew(s, hood).filter((c) => c.rank !== 'capo' && c.wealth >= amt + 200).sort((a, b) => b.wealth - a.wealth || a.id.localeCompare(b.id));
  const shy = lenders.find((c) => roll(L, x.week, `shy:${c.id}:${p.id}`) < (c.traits.includes('Greedy') ? 0.8 : 0.5));
  if (shy) {
    const fid = fact(s, L, 'loan', [p.id, shy.id], `${pname(p)} borrowed $${amt} from ${shy.firstName} ${shy.lastName} at the vig, ${why}.`, 2, { amt, c: [cause] });
    const d = newDebt(ctx, L, { lender: shy.id, from: `wealth:${shy.id}`, by: p, amt, rate: 0.3, weeks: 12, why, fid });
    if (d) {
      const st = openStoryOf(L, ['newbiz', 'failing'], p.id);
      if (st) link(L, st, fid); else openStory(s, L, 'debt', `${p.f} ${p.l} and ${shy.firstName}'s vig`, [p.id, shy.id], [cause, fid]);
      bump(p, shy.id, 0, 0, 0);
      return d;
    }
  }
  const strong = s.rivals.filter((r) => r.kind === 'mob' && s.characters[r.leaderId]?.alive && r.money > amt * 3 && (s.districts.find((d) => d.id === HOODS_BY_ID[hood].district)?.influence[r.id] ?? 0) >= 8).sort((a, b) => a.id.localeCompare(b.id));
  const r = strong.find(() => roll(L, x.week, `rival:${p.id}`) < 0.5);
  if (r) {
    const fid = fact(s, L, 'loan', [p.id], `${pname(p)} borrowed $${amt} from a ${FACTION_NAMES[r.id]} shylock, ${why}.`, 3, { amt, c: [cause] });
    const d = newDebt(ctx, L, { lender: `rival:${r.id}`, from: `rival:${r.id}`, by: p, amt, rate: 0.4, weeks: 12, why, fid });
    if (d) {
      const st = openStoryOf(L, ['newbiz', 'failing'], p.id);
      if (st) link(L, st, fid); else openStory(s, L, 'debt', `${p.f} ${p.l} and the other family's shylock`, [p.id], [cause, fid]);
      return d;
    }
  }
  p.cd.refused = x.week;
  fact(s, L, 'loan_refused', [p.id], `${pname(p)} went looking for $${amt} ${why} and nobody would lend it.`, 2, { c: [cause] });
  return undefined;
}

function repayEarly(ctx: Ctx, L: LivingState, p: Tp, d: Td, x: Idx): void {
  const hh = L.hh[d.hh];
  if (!hh) return;
  const spare = hh.cash - upkeepOf(L, hh, x) * 10;
  if (spare <= 0) return;
  const got = pay(ctx, L, `h:${hh.id}`, lenderAcct(L, ctx.s, d), Math.min(spare, d.out), `${pname(p)} pays ahead on what he owes`);
  d.out -= got;
  if (d.out <= 0) {
    d.out = 0;
    d.st = 'paid';
    const fid = fact(ctx.s, L, 'repaid', [d.by, ...(d.lender.startsWith('tp') || ctx.s.characters[d.lender] ? [d.lender] : [])], `${pname(p)} paid off what ${he(p)} owed ${lenderName(ctx.s, L, d)}.`, 2, { c: [d.fid], amt: d.amt });
    const st = storyOfDebt(L, d);
    link(L, st, fid);
    closeStory(ctx.s, st, `${p.f} paid it all back.`);
  }
}

function askRaise(ctx: Ctx, L: LivingState, p: Tp, x: Idx): void {
  p.cd.raise = x.week;
  const b = L.biz[p.job!];
  const owner = L.people[b.owner];
  if (!owner) return;
  const t = owner.ties[p.id];
  const yes = (t?.tr ?? 30) * 0.5 + (b.net > 0 ? 25 : -20) + owner.t[WARM] * 0.2 + roll(L, x.week, `raise:${p.id}`) * 25;
  if (yes >= 50) {
    p.wage = Math.round((p.wage ?? WAGE) * 1.15);
    bump(p, owner.id, 8, 5);
    fact(ctx.s, L, 'raise', [p.id, owner.id], `${pname(owner)} gave ${pname(p)} a raise.`, 1, { at: b.lot });
  } else {
    bump(p, owner.id, -6, -3, 8, `turned ${him(p)} down for a raise`);
    // An ambitious man turned down starts thinking about his own place.
    if (p.t[AMB] >= 70) p.goal = 'own_business';
  }
}

function seekPatron(ctx: Ctx, L: LivingState, p: Tp, x: Idx): void {
  const s = ctx.s;
  p.cd.patron = x.week;
  const hood = L.hh[p.hh]?.hood ?? L.hoods[0];
  const men = districtCrew(s, hood).filter((c) => c.rank === 'soldier' || c.rank === 'associate');
  const c = men.find((m) => roll(L, x.week, `pat:${m.id}:${p.id}`) < 0.5);
  if (!c) return;
  p.ties[c.id] = { a: 20, tr: 30, gr: 0, why: 'runs errands for him' };
  p.ties.patron = { a: 0, tr: 0, gr: 0, k: c.id };
  fact(s, L, 'patron', [p.id, c.id], `${pname(p)} has started running errands for ${c.firstName} ${c.lastName}.`, 1);
}

/* --- trouble and help ----------------------------------------------- */

interface Trouble { k: 'debt' | 'theft' | 'failing' | 'grudge' | 'house'; debt?: Td; fid?: string; other?: string }

/** He has already asked about this trouble (one request per trouble, not one a week). */
function askedAbout(L: LivingState, p: Tp, tr: Trouble): boolean {
  const st = tr.debt ? storyOfDebt(L, tr.debt) : tr.fid ? storyById(L, factById(L, tr.fid)?.st) : openStoryOf(L, 'failing', p.id);
  return !!st && st.f.some((id) => { const f = factById(L, id); return !!f && (f.k === 'asked_help' || f.k === 'helped') && f.a.includes(p.id); });
}

function troubleOf(L: LivingState, p: Tp, x: Idx): Trouble | undefined {
  const d = L.debts.find((y) => y.by === p.id && y.st === 'open' && y.missed >= 2 && !y.grace);
  if (d) return { k: 'debt', debt: d, fid: d.fid };
  const theft = [...p.mem].reverse().find((m) => x.week - m[0] <= 4 && m[1].startsWith('tf') && factById(L, m[1])?.k === 'theft');
  if (theft) return { k: 'theft', fid: theft[1] };
  const b = p.job ? L.biz[p.job] : undefined;
  if (b && b.owner === p.id && b.red >= 3) return { k: 'failing' };
  if ((L.hh[p.hh]?.behind ?? 0) >= 3) return { k: 'house' };
  return undefined;
}

/**
 * In trouble, he asks for help: family and friends first; the district's capo
 * when it is a matter for the street (a shylock, a thief, a shop going under).
 * The capo decides for himself: a small thing he settles, a big one he brings
 * to the boss (livingAsk.ts makes the request).
 */
function askHelp(ctx: Ctx, L: LivingState, p: Tp, x: Idx, tr: Trouble): void {
  const s = ctx.s;
  p.cd.ask = x.week;
  const hh = L.hh[p.hh];
  const st = tr.debt ? storyOfDebt(L, tr.debt) : tr.k === 'theft' ? storyById(L, factById(L, tr.fid)?.st) : tr.k === 'failing' ? (openStoryOf(L, 'failing', p.id) ?? openStory(s, L, 'failing', `${lotName(x.lots.get(p.job!)!)} in trouble`, [p.id], [])) : undefined;
  const amount = tr.debt ? Math.min(tr.debt.out, tr.debt.pay * 4) : Math.round(upkeepOf(L, hh, x) * 4);
  // Family and friends.
  if (tr.k !== 'theft') {
    const close = Object.entries(p.ties).filter(([id, t]) => id.startsWith('tp') && (t.a >= 40 || !!t.k)).map(([id]) => L.people[id]).filter((q): q is Tp => present(q, x.week) && q.hh !== p.hh).sort((a, b) => a.id.localeCompare(b.id));
    for (const q of close) {
      const qh = L.hh[q.hh];
      const spare = qh.cash - upkeepOf(L, qh, x) * 6;
      const yes = (q.ties[p.id]?.a ?? 0) * 0.5 + q.t[WARM] * 0.4 + (q.ties[p.id]?.k ? 20 : 0) + roll(L, x.week, `help:${q.id}:${p.id}`) * 20;
      if (spare >= amount && yes >= 50) {
        const got = pay(ctx, L, `h:${qh.id}`, `h:${hh.id}`, amount, `${pname(q)} helps ${pname(p)} out`);
        const fid = fact(s, L, 'helped', [q.id, p.id], `${pname(q)} gave ${pname(p)} $${got} to get ${him(p)} through.`, 2, { amt: got, c: [st?.f[st.f.length - 1]] });
        link(L, st, fid);
        bump(p, q.id, 10, 8);
        return;
      }
    }
  }
  // The street: the district's capo.
  const capo = districtCapo(s, hh.hood);
  if (!capo || !st) {
    // Nobody to turn to: he remembers it (no fact for the record; nothing happened).
    remember(L, p.id, x.week, 'Asked around for help and got none.');
    return;
  }
  const fid = fact(s, L, 'asked_help', [p.id, capo.id], tr.k === 'theft'
    ? `${pname(p)} went to ${capo.firstName} ${capo.lastName}: somebody robbed ${him(p)}, and ${he(p)} wants to know who.`
    : tr.k === 'debt' ? `${pname(p)} went to ${capo.firstName} ${capo.lastName} about what ${he(p)} owes ${lenderName(s, L, tr.debt!)}.`
      : `${pname(p)} went to ${capo.firstName} ${capo.lastName}: ${tr.k === 'failing' ? 'the shop is going under' : 'the family is behind on everything'}.`, 2, { c: [st.f[st.f.length - 1]] });
  link(L, st, fid);
  L.stats.asks++;
  // The capo decides: a small matter with his own man, he settles himself; the rest goes to the boss (rarely more than once a month).
  const own = tr.debt && s.characters[tr.debt.lender]?.capoId === capo.id;
  const small = amount < 150 * x.infl;
  if ((own && small) || (L.lastAsk !== undefined && x.week - L.lastAsk < 4) || st.ask) {
    if (own && tr.debt) {
      tr.debt.missed = 0;
      tr.debt.next = x.week + 4;
      tr.debt.grace = x.week;
      const f2 = fact(s, L, 'capo_settled', [capo.id, p.id, tr.debt.lender], `${capo.firstName} ${capo.lastName} told ${s.characters[tr.debt.lender]?.firstName ?? 'his man'} to give ${p.f} a month.`, 2, { c: [fid] });
      link(L, st, f2);
      bump(p, capo.id, 10, 10);
    }
    return;
  }
  st.ask = { w: x.week, iid: '', via: capo.id };
  L.lastAsk = x.week;
}

/* --- grudges, revenge ----------------------------------------------- */

function worstGrudge(p: Tp, L: LivingState, s: GameState): { id: string; t: Tie } | undefined {
  let best: { id: string; t: Tie } | undefined;
  for (const [id, t] of Object.entries(p.ties)) {
    if (t.gr < 60 || id === 'patron' || t.k) continue;
    if (id.startsWith('tp') ? !present(L.people[id], s.week) : !s.characters[id]?.alive) continue;
    if (!best || t.gr > best.t.gr) best = { id, t };
  }
  return best;
}

function startRevenge(ctx: Ctx, L: LivingState, p: Tp, target: string, x: Idx): void {
  const s = ctx.s;
  p.cd.revenge = x.week;
  const t = p.ties[target];
  const name = target.startsWith('tp') ? pname(L.people[target]) : `${s.characters[target]?.firstName} ${s.characters[target]?.lastName}`;
  const fid = fact(s, L, 'grudge', [p.id], `${pname(p)} means to get even with ${name}${t?.why ? `, who ${t.why}` : ''}.`, 2, { kn: Object.keys(p.ties).filter((id) => p.ties[id].k && id.startsWith('tp')).slice(0, 3) });
  openStory(s, L, 'grudge', `${p.f} ${p.l} and ${name}`, [p.id, target], [fid]);
  // Preparation takes weeks; it can cool.
  p.plan = { k: 'revenge', stage: 1, since: x.week, next: x.week + 3 + Math.floor(roll(L, x.week, `prep:${p.id}`) * 5), target, why: t?.why ?? 'an old score', fid };
}

function revengeStage(ctx: Ctx, L: LivingState, p: Tp, x: Idx): boolean {
  const s = ctx.s;
  const plan = p.plan!;
  const target = plan.target!;
  const t = p.ties[target];
  const st = openStoryOf(L, 'grudge', p.id);
  // It cools: time, a warm heart, or the other man made it right.
  if (!t || t.gr < 35) {
    const fid = fact(s, L, 'settled', [p.id], `${pname(p)} let it go.`, 2, { c: [plan.fid] });
    link(L, st, fid);
    closeStory(s, st, 'He let it go.');
    p.plan = undefined;
    return false;
  }
  if (plan.stage === 1) {
    // Preparation: he asks around, waits for his chance (a rumor can reach the boss).
    plan.stage = 2;
    plan.next = x.week + 2 + Math.floor(roll(L, x.week, `prep2:${p.id}`) * 4);
    const what = target.startsWith('tp') ? `asking around about ${pname(L.people[target])}` : 'asking who to talk to downtown';
    const fid = fact(s, L, 'revenge_prep', [p.id], `${pname(p)} has been ${what}.`, 3, { c: [plan.fid] });
    link(L, st, fid);
    t.gr = clamp(t.gr - 3);
    return true;
  }
  // The act.
  p.plan = undefined;
  L.stats.revenge++;
  const tp = target.startsWith('tp') ? L.people[target] : undefined;
  if (tp) {
    // A secret he knows comes out; else his shop pays for it.
    const secret = L.facts.find((f) => f.sec === 3 && f.a.includes(tp.id) && knows(f, p.id));
    if (secret) {
      secret.sec = 0;
      const fid = fact(s, L, 'revenge', [p.id, tp.id], `${pname(p)} told the whole Boardwalk: ${secret.txt}`, 1, { c: [plan.fid, secret.id] });
      link(L, st, fid);
      bump(tp, p.id, -30, -30, 40, `spread ${his(tp)} business around`);
      closeStory(s, st, `${p.f} spread it around.`);
      return true;
    }
    const b = tp.job ? L.biz[tp.job] : undefined;
    if (b && b.owner === tp.id) {
      const cost = pay(ctx, L, `b:${b.lot}`, 'x:supply', Math.round(Math.min(b.cash, 200 * x.infl)), `repairs at ${lotName(x.lots.get(b.lot)!)}`);
      const fid = fact(s, L, 'revenge', [p.id, tp.id], `Somebody wrecked the front of ${lotName(x.lots.get(b.lot)!)} one night (it was ${pname(p)}).`, 2, { c: [plan.fid], amt: cost, at: b.lot });
      link(L, st, fid);
      bump(tp, p.id, -10, -20, 25, 'wrecked the front of the shop');
      const sh = s.hood?.stats[L.hh[tp.hh]?.hood ?? L.hoods[0]];
      if (sh) sh.police = Math.min(95, sh.police + 1);
      closeStory(s, st, 'He got his own back.');
      return true;
    }
    const fid = fact(s, L, 'revenge', [p.id, tp.id], `${pname(p)} and ${pname(tp)} came to blows outside a bar.`, 1, { c: [plan.fid] });
    link(L, st, fid);
    bump(tp, p.id, -15, -10, 20, `fought ${him(tp)} in the street`);
    closeStory(s, st, 'They fought it out.');
    return true;
  }
  // Against a man of the family: he goes to the police (motive, a target, preparation).
  const c = s.characters[target];
  if (c?.alive) {
    c.evidence = Math.min(100, (c.evidence ?? 0) + 8);
    heat(ctx, 'local', 2, `${pname(p)} talked to the police about ${c.firstName} ${c.lastName}`, 'heat');
    const fid = fact(s, L, 'talked_cops', [p.id], `${pname(p)} went to the police about ${c.firstName} ${c.lastName}.`, 3, { c: [plan.fid] });
    link(L, st, fid);
    closeStory(s, st, `${p.f} talked to the police.`);
  }
  return true;
}

function settleGrudge(ctx: Ctx, L: LivingState, p: Tp, target: string, x: Idx): void {
  const t = p.ties[target];
  if (!t) return;
  p.cd.revenge = x.week;
  t.gr = clamp(t.gr - 15);
  if (t.gr < 30) {
    const o = L.people[target];
    if (o) bump(o, p.id, 5, 5, -10);
    fact(ctx.s, L, 'settled', [p.id, ...(o ? [o.id] : [])], `${pname(p)} and ${o ? pname(o) : 'the other man'} patched it up.`, 1);
  }
}

/* --- a business of his own -------------------------------------------- */

function startOpenBusiness(ctx: Ctx, L: LivingState, p: Tp, x: Idx): void {
  const s = ctx.s;
  p.cd.invest = x.week;
  const hood = L.hh[p.hh]?.hood ?? L.hoods[0];
  const zones = HOODS_BY_ID[hood].zones;
  const lots = [...x.lots.values()].filter((l) => zones.includes(l.zone) && l.status === 'sale' && l.price > 0).sort((a, b) => a.price - b.price || a.id.localeCompare(b.id));
  const l = lots[0];
  if (!l) return;
  const fid = fact(s, L, 'plans_biz', [p.id], `${pname(p)} has ${his(p)} eye on ${l.address}: ${he(p)} wants a place of ${his(p)} own.`, 1, { at: l.id, amt: l.price });
  openStory(s, L, 'newbiz', `${p.f} ${p.l}'s own place`, [p.id], [fid]);
  p.plan = { k: 'open_business', stage: 0, since: x.week, next: x.week + 2, target: l.id, amt: l.price, why: 'a place of his own', fid };
}

function openBusinessStage(ctx: Ctx, L: LivingState, p: Tp, x: Idx): boolean {
  const s = ctx.s;
  const plan = p.plan!;
  let l = x.lots.get(plan.target!);
  const st = openStoryOf(L, 'newbiz', p.id);
  const giveUp = (why: string) => {
    p.plan = undefined;
    p.goal = undefined;
    closeStory(s, st, why);
  };
  if (!l || l.status !== 'sale') {
    const hood = L.hh[p.hh]?.hood ?? L.hoods[0];
    l = [...x.lots.values()].filter((y) => HOODS_BY_ID[hood].zones.includes(y.zone) && y.status === 'sale' && y.price > 0).sort((a, b) => a.price - b.price)[0];
    if (!l) { giveUp('Nothing he could buy came up.'); return false; }
    plan.target = l.id;
  }
  const hh = L.hh[p.hh];
  const own = hh.cash - upkeepOf(L, hh, x) * 6 + p.stash;
  plan.next = x.week + 4;
  if (x.week - plan.since > 78) { giveUp('He never got the money together.'); return false; }
  if (plan.stage === 0) {
    if (own >= l.price * 0.4) { plan.stage = 1; plan.next = x.week + 1; }
    return false;
  }
  if (plan.stage === 1) {
    const short = l.price - own;
    if (short > 0) {
      const d = borrow(ctx, L, p, x, short, `to buy ${l.address}`, plan.fid);
      if (!d) { plan.next = x.week + 8; return true; }
    }
    plan.stage = 2;
    plan.next = x.week + 1;
    return true;
  }
  const b = openBusiness(ctx, L, p, l, x, [`p:${p.id}`, `h:${p.hh}`], plan.fid);
  p.plan = undefined;
  if (!b) { plan.next = x.week + 4; p.plan = plan; return true; }
  p.goal = 'support_family';
  return true;
}

/* ------------------------------------------------------------------ */
/* Lifecycle                                                           */
/* ------------------------------------------------------------------ */

function birthsWeek(ctx: Ctx, L: LivingState, x: Idx): void {
  const s = ctx.s;
  for (const id of Object.keys(L.people)) {
    const m = L.people[id];
    if (m.preg === undefined || m.preg > x.week) continue;
    m.preg = undefined;
    if (m.dead) continue;
    const f = m.sp ? L.people[m.sp] : undefined;
    const h = stream(L, x.week, `born:${m.id}`);
    const g: 'M' | 'F' = roll(L, x.week, `sex:${m.id}`) < 0.51 ? 'M' : 'F';
    const k = addPerson(L, s, h, { l: f?.l ?? m.l, g, eth: f?.eth ?? m.eth, age: 0, hh: m.hh });
    k.by = s.date.y;
    k.bm = s.date.m;
    k.t = rollTraits(h);
    // A child takes after the parents a little.
    for (let i = 0; i < 5; i++) k.t[i] = clamp((k.t[i] * 2 + m.t[i] + (f?.t[i] ?? 50)) / 4);
    parentRecords(m, k, [70, 60]);
    if (f && !f.dead) parentRecords(f, k, [65, 60]);
    for (const sib of m.kids) if (sib !== k.id && L.people[sib] && !L.people[sib].dead) { L.people[sib].ties[k.id] = { a: 40, tr: 40, gr: 0, k: g === 'M' ? 'brother' : 'sister' }; k.ties[sib] = { a: 40, tr: 40, gr: 0, k: L.people[sib].g === 'M' ? 'brother' : 'sister' }; }
    const fid = fact(s, L, 'born', [k.id, m.id, ...(f ? [f.id] : [])], `A ${g === 'M' ? 'son' : 'daughter'}, ${k.f}, was born to ${m.f}${f ? ` and ${f.f}` : ''} ${k.l}.`, 0);
    L.stats.births++;
    void fid;
  }
}

function returnsWeek(s: GameState, L: LivingState, x: Idx): void {
  for (const id of Object.keys(L.people)) {
    const p = L.people[id];
    if (!p.away || p.away.until > x.week || p.dead) continue;
    const why = p.away.why;
    p.away = undefined;
    p.job = undefined;
    fact(s, L, 'came_back', [p.id], `${pname(p)} is back from ${why}.`, 1);
  }
}

function deathHazard(a: number): number {
  return a < 1 ? 0.002 : a < 18 ? 0.0002 : a < 40 ? 0.0006 : a < 60 ? 0.0025 : a < 70 ? 0.007 : a < 80 ? 0.016 : 0.04;
}

function die(ctx: Ctx, L: LivingState, p: Tp, x: Idx, cause: string): void {
  const s = ctx.s;
  const a = age(p, x);
  p.dead = [x.y, x.m, cause];
  p.plan = undefined;
  p.preg = undefined;
  const hh = L.hh[p.hh];
  const b = p.job ? L.biz[p.job] : undefined;
  const fid = fact(s, L, 'died', [p.id], `${pname(p)} died${a >= 18 ? `, ${a} years old` : ''} (${cause}).`, 0);
  L.stats.deaths++;
  if (b && b.owner === p.id) {
    // The business passes to the widow, else the eldest grown child here; else it is sold off.
    const heirs = [p.sp ? L.people[p.sp] : undefined, ...p.kids.map((k) => L.people[k]).sort((m, n) => m.by - n.by || m.bm - n.bm)]
      .filter((q): q is Tp => present(q, x.week) && age(q, x) >= 18 && !q.sepd);
    const heir = heirs[0];
    const l = x.lots.get(b.lot);
    if (heir && l) {
      b.owner = heir.id;
      if (heir.job && heir.job !== b.lot) unemploy(L, heir);
      b.staff = b.staff.filter((id) => id !== heir.id);
      heir.job = b.lot;
      heir.wage = undefined;
      l.tenant = `${heir.f} ${heir.l}`;
      b.tn = l.tenant;
      fact(s, L, 'inherited', [heir.id], `${pname(heir)} runs ${lotName(l)} now.`, 0, { c: [fid], at: l.id });
    } else closeBusiness(ctx, L, b, `${pname(p)} died and nobody was left to run it`, fid);
  } else if (b) {
    b.staff = b.staff.filter((id) => id !== p.id);
  }
  if (hh) hh.members = hh.members.filter((id) => id !== p.id);
  // His own money goes to the house.
  if (p.stash && hh && hh.gone === undefined) pay(ctx, L, `p:${p.id}`, `h:${hh.id}`, p.stash, `${pname(p)}'s savings`);
  else if (p.stash) pay(ctx, L, `p:${p.id}`, 'x:estate', p.stash, `${pname(p)}'s savings`);
  p.job = undefined;
  // Grief and memory.
  for (const [id, t] of Object.entries(p.ties)) if (t.k && L.people[id]) remember(L, id, x.week, `Lost ${p.f}.`, fid);
}

function lifeMonth(ctx: Ctx, L: LivingState, x: Idx): void {
  const s = ctx.s;
  for (const id of Object.keys(L.people)) {
    const p = L.people[id];
    if (p.dead || p.left !== undefined) continue;
    const a = age(p, x);
    if (roll(L, x.week, `death:${p.id}`) < deathHazard(a)) {
      const r = roll(L, x.week, `cause:${p.id}`);
      die(ctx, L, p, x, a >= 70 ? (r < 0.5 ? `${his(p)} heart` : 'old age') : a < 18 ? 'a fever' : r < 0.35 ? 'an accident' : r < 0.7 ? `${his(p)} heart` : 'an illness');
      continue;
    }
    if (p.away) continue;
    // Coming of age: a path of his own.
    if (a === 18 && p.cd.adult === undefined) {
      p.cd.adult = x.week;
      const hh = L.hh[p.hh];
      const r = roll(L, x.week, `path:${p.id}`);
      if (hh && hh.cash > 1500 * x.infl && p.t[AMB] > 55 && r < 0.5) {
        p.away = { until: x.week + 4 * 52, why: 'college' };
        p.job = undefined;
        fact(s, L, 'went_away', [p.id], `${pname(p)} went off to college.`, 1);
      } else if (p.g === 'M' && r < 0.18) {
        p.away = { until: x.week + 2 * 52, why: 'the Army' };
        p.job = undefined;
        fact(s, L, 'went_away', [p.id], `${pname(p)} went into the Army.`, 1);
      } else if (r > 0.9) {
        leaveDistrict(ctx, L, [p], x, `${pname(p)} left for Philadelphia to make ${his(p)} own way.`);
      } else {
        p.job = undefined;
        p.goal = p.t[AMB] > 65 ? 'independence' : 'secure_income';
        fact(s, L, 'came_of_age', [p.id], `${pname(p)} finished school and is looking for work.`, 1);
      }
      continue;
    }
    if (a >= 6 && a < 18 && !p.job) p.job = 'school';
    // Pregnancy: a married couple living together.
    if (p.g === 'F' && p.sp && !p.sepd && p.preg === undefined && a >= 18 && a <= 42) {
      const h = L.people[p.sp];
      if (present(h, x.week) && h.hh === p.hh) {
        const kids = p.kids.map((k) => L.people[k]).filter((k) => k && !k.dead);
        const youngest = kids.reduce((m, k) => Math.min(m, age(k, x)), 99);
        if (youngest >= 1 && kids.length < 6) {
          const pr = 0.035 * (a < 30 ? 1 : a < 36 ? 0.6 : 0.25) * (kids.length >= 3 ? 0.5 : 1);
          if (roll(L, x.week, `preg:${p.id}`) < pr) {
            p.preg = x.week + 36 + Math.floor(roll(L, x.week, `due:${p.id}`) * 5);
            fact(s, L, 'expecting', [p.id, h.id], `${p.f} and ${h.f} ${h.l} are expecting.`, 1, { kn: L.hh[p.hh]?.members });
          }
        }
      }
    }
    // Retirement: an old owner hands over to a grown child who works with him.
    if (a >= 68 && p.job && L.biz[p.job]?.owner === p.id) {
      const b = L.biz[p.job];
      const heir = b.staff.map((sid) => L.people[sid]).find((q) => present(q, x.week) && (q.fa === p.id || q.mo === p.id));
      const l = x.lots.get(b.lot);
      if (heir && l) {
        b.owner = heir.id;
        b.staff = b.staff.filter((sid) => sid !== heir.id);
        heir.wage = undefined;
        l.tenant = `${heir.f} ${heir.l}`;
        b.tn = l.tenant;
        p.job = 'retired';
        fact(s, L, 'inherited', [heir.id, p.id], `${pname(p)} handed ${lotName(l)} over to ${heir.f}.`, 0, { at: l.id });
      }
    } else if (a >= 66 && p.job && !L.biz[p.job]?.owner && p.job !== 'home' && roll(L, x.week, `retire:${p.id}`) < 0.1) {
      unemploy(L, p);
      p.job = 'retired';
    }
  }
}

function leaveDistrict(ctx: Ctx, L: LivingState, ps: Tp[], x: Idx, txt: string): void {
  const s = ctx.s;
  for (const p of ps) {
    p.left = x.week;
    unemploy(L, p);
    p.plan = undefined;
    const hh = L.hh[p.hh];
    if (hh && ps.length === 1 && hh.members.length > 1) {
      // A young man leaving home goes with a little from his parents.
      hh.members = hh.members.filter((id) => id !== p.id);
      pay(ctx, L, `p:${p.id}`, 'x:depart', p.stash, `${pname(p)} takes ${his(p)} savings`);
    }
  }
  fact(s, L, 'moved_out', ps.map((p) => p.id).slice(0, 3), txt, 0);
  L.stats.movedOut++;
}

/** A family with no work, no money and the bills piling up leaves; their debts go with them, unpaid (never forgotten). */
function migrationMonth(ctx: Ctx, L: LivingState, x: Idx): void {
  const s = ctx.s;
  let pop = 0;
  for (const id in L.people) if (present(L.people[id], x.week)) pop++;
  for (const hh of Object.values(L.hh)) {
    if (hh.gone !== undefined) continue;
    const ms = presentMembers(L, hh, x.week);
    if (!ms.length) {
      if (!hh.members.some((id) => { const p = L.people[id]; return p && !p.dead && p.left === undefined; })) dissolve(ctx, L, hh, x);
      continue;
    }
    const adults = ms.filter((p) => age(p, x) >= 18);
    const working = adults.some((p) => p.job && p.job !== 'home' && p.job !== 'retired' && p.job !== 'school');
    const up = upkeepOf(L, hh, x);
    const owns = adults.some((p) => p.job && L.biz[p.job]?.owner === p.id);
    if (!working && !owns && hh.cash < up * 2 && (hh.behind ?? 0) >= 2 && roll(L, x.week, `leave:${hh.id}`) < 0.3) {
      hh.gone = x.week;
      pay(ctx, L, `h:${hh.id}`, 'x:depart', hh.cash, `${hh.name} take what they have`);
      for (const p of ms) pay(ctx, L, `p:${p.id}`, 'x:depart', p.stash, `${pname(p)} takes ${his(p)} savings`);
      const owing = L.debts.filter((d) => d.hh === hh.id && d.st === 'open');
      for (const d of owing) {
        d.st = 'skipped';
        const fid = fact(s, L, 'skipped', [d.by, ...(d.lender.startsWith('tp') ? [d.lender] : [])], `${hh.name} left town still owing ${lenderName(s, L, d)} $${d.out.toLocaleString('en-US')}.`, 1, { c: [d.fid], amt: d.out });
        const st = storyOfDebt(L, d);
        link(L, st, fid);
        closeStory(s, st, 'They skipped town owing it.');
        if (d.lender.startsWith('tp')) bump(L.people[d.lender], d.by, -20, -30, 30, 'skipped town owing him');
      }
      leaveDistrict(ctx, L, ms, x, `${hh.name} packed up and left the island: no work and the bills piling up.`);
      pop -= ms.length;
    }
  }
  // Newcomers come for the jobs nobody here is taking (in the season), or to keep the town from emptying.
  let vacancies = 0;
  for (const b of Object.values(L.biz)) {
    const l = x.lots.get(b.lot);
    if (l) vacancies += Math.max(0, wantStaff(L, b, l, x) - b.staff.length);
  }
  // An empty shop finds a buyer from off the island now and then (the hood layer used to roll this).
  const econ = s.hood?.stats[L.hoods[0]]?.econ ?? 1;
  const zones = new Set(L.hoods.flatMap((h) => HOODS_BY_ID[h].zones));
  const empty = [...x.lots.values()].filter((l) => zones.has(l.zone) && l.status === 'sale' && l.use && l.stage === 'open' && l.price > 0).sort((a, b) => a.id.localeCompare(b.id));
  for (const l of empty) {
    if (roll(L, x.week, `outsider:${l.id}`) >= 0.015 * econ * (x.season ? 1.5 : 1)) continue;
    const h = stream(L, x.week, `outsider:who:${l.id}`);
    const eth = pick(h, ['Italian', 'Irish', 'Jewish'] as const);
    const sur = pick(h, SURNAMES[eth]);
    const hh = addHousehold(L, s, `the ${sur} family`, `rooms above ${lotName(l)}`, L.hoods[0], 0, 0);
    pay(ctx, L, 'x:arrive', `h:${hh.id}`, Math.round(l.price + (400 + roll(L, x.week, `outsider$:${l.id}`) * 800) * x.infl), 'what they sold up to come here');
    const owner = makeFamily(L, s, h, hh, sur, eth, 30 + Math.floor(roll(L, x.week, `outsider:age:${l.id}`) * 25));
    for (const id of hh.members) { const q = L.people[id]; const a = ageOf(q, x.y, x.m); if (a >= 6 && a < 18) q.job = 'school'; else if (a >= 18 && q.id === owner.sp) q.job = 'home'; }
    const name = l.name;
    if (openBusiness(ctx, L, owner, l, x, [`h:${hh.id}`])) {
      if (name) l.name = name;
      fact(s, L, 'moved_in', [owner.id], `${hh.name} came over from ${pick(h, ['Philadelphia', 'Camden', 'Vineland', 'Trenton', 'Baltimore'])} to take over ${lotName(l)}.`, 0, { at: l.id });
      L.stats.movedIn++;
    }
    break;
  }
  const idleAdults = x.adults.filter((p) => !p.job && age(p, x) < 66).length;
  const cap = L.base.pop * 1.35;
  const want = (x.season && vacancies > idleAdults + 1) || pop < L.base.pop * 0.8;
  if (want && pop < cap && roll(L, x.week, 'arrive') < 0.6) {
    const h = stream(L, x.week, 'arrive:who');
    const eth = pick(h, ['Italian', 'Irish', 'Jewish'] as const);
    const sur = pick(h, SURNAMES[eth]);
    const single = roll(L, x.week, 'arrive:single') < 0.5;
    const hh = addHousehold(L, s, `the ${sur} household`, `a rented ${single ? 'room' : 'bungalow'} on ${pick(h, ['Burk Ave', 'Taylor Ave', 'Montgomery Ave', 'Garfield Ave'])}`, L.hoods[0], 0, single ? 8 : 14);
    pay(ctx, L, 'x:arrive', `h:${hh.id}`, Math.round((100 + roll(L, x.week, 'arrive$') * 400) * x.infl), 'the savings they came with');
    const head = makeFamily(L, s, h, hh, sur, eth, single ? 19 + Math.floor(roll(L, x.week, 'arrive:age') * 10) : 24 + Math.floor(roll(L, x.week, 'arrive:age') * 20), { married: single ? false : undefined });
    for (const id of hh.members) { const p = L.people[id]; const a = ageOf(p, x.y, x.m); if (a >= 6 && a < 18) p.job = 'school'; else if (a >= 18 && p.id === head.sp) p.job = 'home'; }
    fact(s, L, 'moved_in', [head.id], `${hh.name} moved to the island${single ? '' : ` with ${hh.members.length - 1} more`}, looking for work.`, 0);
    L.stats.movedIn++;
  }
}

function dissolve(ctx: Ctx, L: LivingState, hh: Th, x: Idx): void {
  const s = ctx.s;
  hh.gone = x.week;
  // The money goes to a living child's household here, else the estate.
  const heirHh = hh.members.flatMap((id) => L.people[id]?.kids ?? []).map((k) => L.people[k]).find((k) => present(k, x.week) && k.hh !== hh.id)?.hh;
  pay(ctx, L, `h:${hh.id}`, heirHh ? `h:${heirHh}` : 'x:estate', hh.cash, `what ${hh.name} left`);
  for (const d of L.debts.filter((y) => y.hh === hh.id && y.st === 'open')) {
    if (heirHh) { d.hh = heirHh; continue; }
    d.st = 'forgiven';
    const fid = fact(s, L, 'forgiven', [d.by], `${lenderName(s, L, d)} wrote off what ${pname(L.people[d.by])} owed: nobody is left to pay it.`, 2, { c: [d.fid], amt: d.out });
    const st = storyOfDebt(L, d);
    link(L, st, fid);
    closeStory(s, st, 'Nobody was left to pay it.');
  }
}

/* --- the owners' books, struggling shops ----------------------------- */

function booksMonth(ctx: Ctx, L: LivingState, x: Idx): void {
  const s = ctx.s;
  for (const b of Object.values(L.biz)) {
    const owner = L.people[b.owner];
    const l = x.lots.get(b.lot);
    if (!owner || !l) continue;
    // The owner counts the till against the trade: a skim shows sooner when it is big.
    if (b.skim) {
      const share = b.skim / Math.max(1, b.rev);
      const p = 0.08 + share * 3 + (owner.t[AMB] - 50) / 300;
      const skimmer = b.staff.map((id) => L.people[id]).find((q) => q?.plan?.k === 'skim' && q.plan.target === b.lot) ?? b.staff.map((id) => L.people[id]).find((q) => q && factFor(L, 'skim', q.id, b.lot));
      if (skimmer && roll(L, x.week, `audit:${b.lot}`) < p) {
        const back = pay(ctx, L, `p:${skimmer.id}`, `b:${b.lot}`, Math.min(skimmer.stash, b.skim), `${pname(skimmer)} pays back what ${he(skimmer)} took`);
        const kin = isKin(L, owner.id, skimmer.id);
        const skimFid = skimmer.plan?.fid ?? factFor(L, 'skim', skimmer.id, b.lot)?.id;
        const fid = fact(s, L, 'skim_caught', [owner.id, skimmer.id], `${pname(owner)} caught ${pname(skimmer)} with ${his(skimmer)} hand in the register ($${b.skim} gone${back ? `, $${back} paid back` : ''})${kin ? '; it stays in the family' : ` and threw ${him(skimmer)} out`}.`, 1, { c: [skimFid], amt: b.skim, at: b.lot });
        const st = storyById(L, factById(L, skimFid)?.st);
        link(L, st, fid);
        closeStory(s, st, kin ? 'Kept in the family.' : `${skimmer.f} was thrown out.`);
        bump(owner, skimmer.id, -35, -50, kin ? 20 : 55, 'stole from the register');
        bump(skimmer, owner.id, -15, -10, kin ? 5 : 30, `humiliated ${him(skimmer)} in front of everybody`);
        skimmer.plan = undefined;
        if (!kin) unemploy(L, skimmer);
        b.skim = 0;
      }
    }
    b.rev = Math.round(b.rev * 0.75);
    // Struggling: the owner says so, and others notice.
    const u = useEconomics(l);
    if (b.red >= 3 && !openStoryOf(L, 'failing', owner.id)) {
      const fid = fact(s, L, 'struggling', [owner.id], `${lotName(l)} is in trouble: ${pname(owner)} cannot pay what ${he(owner)} owes.`, 1, { at: b.lot, kn: b.staff });
      openStory(s, L, 'failing', `${lotName(l)} in trouble`, [owner.id], [fid]);
    }
    // A rival family makes an offer to a struggling owner; he decides.
    const hood = L.hh[owner.hh]?.hood ?? L.hoods[0];
    const did = HOODS_BY_ID[hood].district;
    if (b.red >= 6 && (b.offered ?? -99) + 39 <= x.week) {
      const r = s.rivals.filter((y) => y.kind === 'mob' && s.characters[y.leaderId]?.alive && (s.districts.find((d) => d.id === did)?.influence[y.id] ?? 0) >= 10 && y.money > marketValue(s, l) * 1.1).sort((a, c) => a.id.localeCompare(c.id))[0];
      if (r) {
        b.offered = x.week;
        const price = Math.round(marketValue(s, l) * 0.8);
        const hh = L.hh[owner.hh];
        const desperate = (hh?.cash ?? 0) < upkeepOf(L, hh, x) * 4 || L.debts.some((d) => d.hh === owner.hh && d.st === 'open' && d.missed >= 3);
        const fidOffer = fact(s, L, 'offer', [owner.id], `${FACTION_NAMES[r.id]}'s people offered ${pname(owner)} $${price} for ${lotName(l)}.`, 2, { amt: price, at: b.lot });
        const st = openStoryOf(L, 'failing', owner.id);
        link(L, st, fidOffer);
        if (desperate && roll(L, x.week, `sell:${b.lot}`) < 0.6 + owner.t[NERVE] / -400) {
          sellToRival(ctx, L, b, l, r.id, price, fidOffer);
          closeStory(s, st, `${owner.f} sold to ${FACTION_NAMES[r.id]}'s people.`);
          continue;
        }
      }
    }
    // Closing for good: no money, no credit, no way through.
    const hh = L.hh[owner.hh];
    if (b.red >= 8 && b.cash < u.exp * x.infl && (hh?.cash ?? 0) < upkeepOf(L, hh, x) * 3) {
      closeBusiness(ctx, L, b, 'the money ran out', openStoryOf(L, 'failing', owner.id)?.f.slice(-1)[0]);
    }
  }
}

function factFor(L: LivingState, k: string, who: string, at: string) {
  for (let i = L.facts.length - 1; i >= 0; i--) { const f = L.facts[i]; if (f.k === k && f.a.includes(who) && f.at === at) return f; }
  return undefined;
}

function sellToRival(ctx: Ctx, L: LivingState, b: Tb, l: Lot, rival: RivalId, price: number, cause: string): void {
  const s = ctx.s;
  const owner = L.people[b.owner];
  const got = pay(ctx, L, `rival:${rival}`, `h:${owner.hh}`, price, `${pname(owner)} sells ${lotName(l)}`);
  if (got < price) { if (got) pay(ctx, L, `h:${owner.hh}`, `rival:${rival}`, got, 'the deal fell through'); return; }
  l.status = 'rival';
  l.owner = rival;
  l.tenant = `${FACTION_NAMES[rival]}'s people`;
  (l.history ??= []).push({ year: s.date.y, week: s.week, owner: rival, by: FACTION_NAMES[rival], price, how: 'bought' });
  const fid = fact(s, L, 'sold', [owner.id], `${pname(owner)} sold ${lotName(l)}; the buyers are ${FACTION_NAMES[rival]}'s people.`, 0, { c: [cause], at: l.id });
  L.stats.sold++;
  void fid;
  // The help stays on under the new owners (their wages are in that family's books).
  endBusiness(ctx, L, b, true);
  for (const p of Object.values(L.people)) if (p.job === l.id && p.id !== owner.id) p.wage = p.wage ?? Math.round(WAGE * inflation(s));
}

/* --- goals (monthly) ------------------------------------------------- */

function goalsMonth(L: LivingState, x: Idx, s: GameState): void {
  for (const p of x.adults) {
    const a = age(p, x);
    let g: GoalK;
    const owner = p.job && L.biz[p.job]?.owner === p.id;
    if (a >= 66) g = 'retire';
    else if (L.debts.some((d) => d.by === p.id && d.st === 'open')) g = 'repay_debt';
    else if (!p.job && p.job !== 'home') g = 'secure_income';
    else if (worstGrudge(p, L, s)) g = 'revenge';
    else if (!p.sp && !p.sepd && a <= 40 && p.t[WARM] >= 40) g = 'marry';
    else if (!owner && p.t[AMB] >= 72 && a <= 50) g = p.goal === 'own_business' || p.t[AMB] >= 80 ? 'own_business' : 'promotion';
    else if (!owner && p.t[AMB] >= 60) g = 'promotion';
    else g = p.kids.length ? 'support_family' : 'settle_down';
    if (p.goal === 'own_business' && p.plan?.k === 'open_business') g = 'own_business';
    if (g !== p.goal) {
      p.goal = g;
      p.mem.push([x.week, `Wants ${GOAL_WORDS[g]}.`]);
      if (p.mem.length > 6) p.mem.shift();
    }
  }
}

export const GOAL_WORDS: Record<GoalK, string> = {
  secure_income: 'steady work', own_business: 'a place of his own', promotion: 'to get ahead where he works', marry: 'to marry', repay_debt: 'to get out of debt',
  support_family: 'to provide for his family', revenge: 'to settle a score', independence: 'a life of his own', retire: 'to take it easy', settle_down: 'to settle down',
};

/** Coworkers and neighbors grow closer (or not) a little each month. */
function tiesMonth(L: LivingState, x: Idx): void {
  for (const [lot, ps] of x.byJob) {
    if (!L.biz[lot] && !x.lots.has(lot)) continue;
    for (const p of ps) for (const q of ps) {
      if (p.id === q.id) continue;
      const t = p.ties[q.id];
      if (!t && Object.keys(p.ties).length > 24) continue;
      bump(p, q.id, Math.round((roll(L, x.week, `cw:${p.id}:${q.id}`) - 0.35) * 6));
    }
  }
  // Money trouble wears on a marriage; good times mend it a little.
  for (const p of x.adults) {
    if (!p.sp || p.sepd) continue;
    const t = p.ties[p.sp];
    if (!t) continue;
    const hh = L.hh[p.hh];
    const strain = (hh?.behind ?? 0) > 0 || L.debts.some((d) => d.hh === p.hh && d.st === 'open' && d.missed > 0);
    t.a = clamp(t.a + (strain ? -3 : 0) + Math.round((roll(L, x.week, `marr:${p.id}`) - 0.55) * 4), -100, 100);
  }
  // Grudges cool with time; old ties to the dead and the departed are let go (kin stays);
  // a man keeps a couple of dozen people in his life, not the whole town.
  for (const p of x.adults) {
    for (const [id, t] of Object.entries(p.ties)) {
      if (t.gr > 0) t.gr = clamp(t.gr - 2);
      const o = L.people[id];
      if (o && (o.dead || o.left !== undefined) && !t.k) delete p.ties[id];
    }
    const ids = Object.keys(p.ties);
    if (ids.length > 20) {
      const weak = ids.filter((id) => !p.ties[id].k && id !== 'patron').sort((a, b) => (Math.abs(p.ties[a].a) + p.ties[a].gr) - (Math.abs(p.ties[b].a) + p.ties[b].gr) || a.localeCompare(b));
      for (const id of weak.slice(0, ids.length - 20)) delete p.ties[id];
    }
  }
}

/* ------------------------------------------------------------------ */
/* The week                                                            */
/* ------------------------------------------------------------------ */

let ENABLED = true;
/** Benchmarks only: run the week without the living district (to measure what it costs). */
export function setLivingEnabled(on: boolean): void {
  ENABLED = on;
}

export function livingWeek(ctx: Ctx): void {
  if (!ENABLED) return;
  const s = ctx.s;
  const L = ensureLiving(s);
  if (!L) return;
  if (!L.hist.length && !L.j.length && !Object.keys(L.bal0).length) closeLivingBooks(L);
  const x = buildIdx(s, L);
  syncLots(ctx, L, x);
  seasonTurn(ctx, L, x);
  businessesWeek(ctx, L, x);
  outsideWages(ctx, L, x);
  householdsWeek(ctx, L, x);
  debtsWeek(ctx, L, x);
  birthsWeek(ctx, L, x);
  returnsWeek(s, L, x);
  for (const p of x.adults) {
    if (!present(p, x.week)) continue;
    personWeek(ctx, L, p, x);
  }
  const mk = `${s.date.y}-${s.date.m}`;
  if (L.lastMonth !== mk) {
    L.lastMonth = mk;
    const xm = buildIdx(s, L);
    lifeMonth(ctx, L, xm);
    booksMonth(ctx, L, xm);
    goalsMonth(L, xm, s);
    tiesMonth(L, xm);
    migrationMonth(ctx, L, xm);
    gossipMonth(s, L);
    syncHoods(s, L);
    pruneFacts(s, L);
    pruneStories(s, L);
    pruneDebts(L, s);
    stripDeparted(L, s);
  }
  channelsWeek(ctx, L);
  const errs = reconcileLiving(L);
  if (errs.length) throw new Error(`The district's books do not reconcile in week ${s.week}: ${errs.slice(0, 3).join('; ')}`);
  closeLivingBooks(L);
  const t = districtTotals(s, L);
  L.hist.push([s.week, t.people, t.households, t.businesses, t.jobs, t.employed, livingMoneyHeld(L), L.stats.facts]);
  if (L.hist.length > 156) L.hist.splice(0, L.hist.length - 156);
}

/** End of the season: the summer help is let go; the start: the help is wanted back. */
function seasonTurn(ctx: Ctx, L: LivingState, x: Idx): void {
  const s = ctx.s;
  const was = L.season;
  L.season = x.season;
  if (was === undefined || was === x.season || x.season) return;
  for (const b of Object.values(L.biz)) {
    const l = x.lots.get(b.lot);
    if (!l || !USES_BY_ID[l.use!]?.seasonal) continue;
    const keep = wantStaff(L, b, l, x);
    const owner = L.people[b.owner];
    const hired = b.staff.filter((id) => L.people[id]?.hh !== owner?.hh);
    const letGo = hired.slice(keep - (b.staff.length - hired.length) > 0 ? keep - (b.staff.length - hired.length) : 0);
    if (!letGo.length) continue;
    for (const id of letGo) unemploy(L, L.people[id], x.week);
    fact(s, L, 'laid_off', letGo.slice(0, 4), `${lotName(l)} let ${letGo.map((id) => L.people[id].f).join(', ')} go for the winter.`, 1, { at: b.lot, kn: owner ? [owner.id] : [] });
  }
}

/** The dead and the departed keep their place in the family tree, nothing else. */
function stripDeparted(L: LivingState, s: GameState): void {
  for (const id in L.people) {
    const p = L.people[id];
    if (!p.dead && p.left === undefined) continue;
    if (s.week - (p.left ?? s.week) < 4 && !p.dead) continue;
    for (const k of Object.keys(p.ties)) if (!p.ties[k].k) delete p.ties[k];
    p.mem = [];
    p.cd = {};
    p.plan = undefined;
    p.goal = undefined;
  }
}

function pruneDebts(L: LivingState, s: GameState): void {
  L.debts = L.debts.filter((d) => d.st === 'open' || d.st === 'skipped' || s.week - d.w < 104);
}

/* ------------------------------------------------------------------ */
/* The district's totals, from the records (B13)                       */
/* ------------------------------------------------------------------ */

export interface DistrictTotals {
  people: number;
  adults: number;
  children: number;
  households: number;
  businesses: number;
  /** Positions at every open place in the district (the same count the neighborhood dashboard shows). */
  jobs: number;
  /** Named people working in the district (owners included). */
  employed: number;
  /** Positions held by summer help from off the island (jobs - employed - open). */
  seasonalHands: number;
  /** Grown people looking for work. */
  unemployed: number;
  /** People working off the island. */
  workingOut: number;
  lots: number;
  vacantLots: number;
  forSale: number;
}

export function districtTotals(s: GameState, L: LivingState, hood?: HoodId): DistrictTotals {
  const hoods = hood ? [hood] : L.hoods;
  const zones = new Set(hoods.flatMap((h) => HOODS_BY_ID[h].zones));
  const lots = (s.econ?.lots ?? []).filter((l) => zones.has(l.zone));
  const lotIds = new Set(lots.map((l) => l.id));
  const y = s.date.y, m = s.date.m;
  let people = 0, adults = 0, children = 0, employed = 0, unemployed = 0, workingOut = 0;
  for (const id in L.people) {
    const p = L.people[id];
    if (!present(p, s.week) || !hoods.includes(L.hh[p.hh]?.hood)) continue;
    people++;
    const a = ageOf(p, y, m);
    if (a < 18) { children++; continue; }
    adults++;
    if (p.job && lotIds.has(p.job)) employed++;
    else if (p.job === 'out') workingOut++;
    else if (!p.job && a < 66) unemployed++;
  }
  const households = Object.values(L.hh).filter((h) => h.gone === undefined && hoods.includes(h.hood) && h.members.some((id) => present(L.people[id], s.week))).length;
  const businesses = lots.filter((l) => l.stage === 'open' && l.use && (l.tenant || l.bizId || l.operating)).length;
  const jobs = lots.reduce((a, l) => a + jobsOf(l), 0);
  return {
    people, adults, children, households, businesses, jobs, employed, seasonalHands: Math.max(0, jobs - employed), unemployed, workingOut,
    lots: lots.length, vacantLots: lots.filter((l) => !l.use).length, forSale: lots.filter((l) => l.status === 'sale').length,
  };
}

/** The neighborhood layer's population for a living district is the count of its people. */
function syncHoods(s: GameState, L: LivingState): void {
  for (const h of L.hoods) {
    const st = s.hood?.stats[h];
    if (st) st.pop = districtTotals(s, L, h).people;
  }
}

export { buildIdx as livingIndex };
export type { Idx as LivingIdx };
