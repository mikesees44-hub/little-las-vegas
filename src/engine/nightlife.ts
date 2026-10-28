import { ageOn, isInSeason } from './calendar';
import { displayName, hasTrait, isFree, makeCharacter, player } from './characters';
import { ensureDating, adultOn, type Provider, type ProviderKind } from './datingState';
import { applyEffects } from './effects';
import { heat, money, type Ctx } from './ledger';
import { looksEarnings, looksOf } from './looks';
import { addOpinion, opinion } from './relations';
import { drawnTo, endRomance, kin, romanceBetween, activeRomances, startRomance } from './romance';
import { addSecret } from './secrets';
import { ensureRomance } from './storyState';
import { hashSeed, rand, type RngHolder } from './rng';
import { APARTMENTS, ARRIVALS, BUSINESSES, CAST, CONTACTS, MEN_JOBS, VENUES, type CastSpec } from './nightlifeData';
import {
  ADULT_ROLES, blankNightlife, DEAL_LABEL, NGOAL_TEXT, PROMISE_LABEL, ROLE_LABEL, WORKING_ROLES,
  type HouseDeal, type MaritalSt, type NightBound, type NightFamily, type NightGoal, type NightHouse, type NightKid,
  type NightlifeState, type NightPerson, type NightRole, type PartnerKnows, type PromiseKind,
} from './nightlifeState';
import { goomarBlock, goomarWeek, previewEndGoomar, previewGoomar, applyGoomarOp, isGoomar } from './goomar';
import { applyInvite, askingPrice, defaultPlan, eveningKindOf, previewInvite, KIND_INFO, type EveningPlan } from './evening';
import { applyBold, applyCar, previewBold, previewCar, type BoldAfter } from './quickies';
import { applyAskMan, applyPartner, partnersWeek, previewAskMan, previewPartner, type PartnerHow } from './nightPartners';
import type { ActionPreview } from './actions';
import type { Acceptance, Reason } from './interactions';
import type { Character, Effect, FactionId, GameState, PlayerAction, RivalId } from './types';

/**
 * NIGHTLIFE: the island's night as people and as an organized-crime economy.
 *
 *  - The cast (nightlifeData.ts, then newcomers every month): high-end
 *    escorts (a young list, 18-25, and a mature list, 26 and up), call
 *    girls, street workers, dancers, singers, bar regulars, women out at
 *    the clubs, and the madams who each run a house. Every one is a person
 *    of the world with her own household (a husband who knows or doesn't,
 *    kids, an ailing mother), money, goal, boundaries and loyalties, and she
 *    ages: prices and roles change; she retires, opens a business, marries,
 *    becomes a madam. The rival families have their own houses.
 *  - The economy: a woman on the family's payroll kicks back a share that
 *    grows with what she makes; a madam pays for protection or partners
 *    with the family; the houses earn, draw the vice squad, get raided; the
 *    girls hear things (secrets on rival men, the Ears); rival families
 *    squeeze a protected house's territory and take it if nobody backs her.
 *  - Promises: an introduction to a record man or a producer (real pictures,
 *    or adult pictures only for a woman who said so herself) is a tracked
 *    obligation, kept or broken, with consequences.
 *  - The goomar (goomar.ts).
 *
 * HARD RULES: adults only, checked on the day at every list, preview,
 * commit and week; she decides everything (every order here carries her
 * odds and her reasons, and nothing is paid if she says no); no coercion,
 * no debts held over anyone, nobody is traded or given; non-explicit,
 * report-only; Mature content Off hides the adult-service roles and the
 * adult-picture promise everywhere; nobody here is real.
 */

export const ADULT = 18;

/* ------------------------------------------------------------------ */
/* Orders and effect ops                                               */
/* ------------------------------------------------------------------ */

export type NightAction =
  | { op: 'payroll'; id: string }
  | { op: 'release'; id: string }
  | { op: 'promise'; id: string; kind: PromiseKind }
  | { op: 'keep'; pid: string }
  | { op: 'goomar'; id: string }
  | { op: 'endGoomar'; id: string }
  | { op: 'deal'; house: string; deal: HouseDeal }
  | { op: 'back'; house: string }
  /** An evening with her: the whole plan from the evening flow (evening.ts). */
  | { op: 'invite'; plan: EveningPlan }
  /** "Step outside to my car" (quickies.ts). */
  | { op: 'car'; id: string; price?: number }
  /** A bold offer at the club, and how many times you raised it (quickies.ts). */
  | { op: 'bold'; id: string; amount: number; raises: number; after?: BoldAfter }
  /** Deal with her husband or fella (nightPartners.ts). */
  | { op: 'partner'; id: string; how: PartnerHow }
  /** Ask around about her man (nightPartners.ts). */
  | { op: 'askMan'; id: string };

/** Hours each order takes on the day clock (merged into the time-cost table as 'nightlife:<op>'). */
export const NIGHT_HOURS: Record<NightAction['op'], number> = {
  payroll: 1, release: 0.5, promise: 1, keep: 3, goomar: 4, endGoomar: 2, deal: 2, back: 0.5, invite: 4, car: 0.75, bold: 0.5, partner: 2, askMan: 0.5,
};

export type NightOp =
  | { op: 'payroll'; id: string }
  | { op: 'release'; id: string }
  | { op: 'promise'; id: string; kind: PromiseKind }
  | { op: 'keep'; pid: string }
  | { op: 'goomar'; id: string; rent: number; allowance: number; where: string }
  | { op: 'endGoomar'; id: string; gift: number }
  | { op: 'deal'; house: string; deal: HouseDeal }
  | { op: 'back'; house: string }
  | { op: 'invite'; plan: EveningPlan }
  | { op: 'car'; id: string; price?: number }
  | { op: 'bold'; id: string; amount: number; raises: number; after?: BoldAfter }
  | { op: 'partner'; id: string; how: PartnerHow }
  | { op: 'askMan'; id: string }
  | { op: 'refused'; id: string; what: string };

export const NX = (op: NightOp, label: string): Effect => ({ type: 'nightlife', op, label }) as Effect;
export const $ = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(v)));

/* ------------------------------------------------------------------ */
/* Who: adults only; what the setting allows                           */
/* ------------------------------------------------------------------ */

export function ageOfC(s: GameState, c: Character): number {
  return ageOn(c.birth, s.date);
}

export function adultC(s: GameState, c: Character | undefined): c is Character {
  return !!c && ageOfC(s, c) >= ADULT;
}

/** Is this person's work shown at the current mature-content setting? */
export function roleShown(s: GameState, role: NightRole): boolean {
  return adultOn(s) || (!ADULT_ROLES.includes(role) && role !== 'adultfilm');
}

/** The role as the player may see it (a private line when the setting hides it). */
export function roleText(s: GameState, p: NightPerson): string {
  return roleShown(s, p.role) ? ROLE_LABEL[p.role] : 'Keeps her work private';
}

export function nlog(N: NightlifeState, s: GameState, text: string): void {
  N.log.push([s.week, text]);
  if (N.log.length > 60) N.log.splice(0, N.log.length - 60);
}

function hist(p: NightPerson, s: GameState, text: string): void {
  p.hist.push([s.week, text]);
  if (p.hist.length > 10) p.hist.splice(0, p.hist.length - 10);
}

function withRng<T>(s: GameState, N: NightlifeState, fn: () => T): T {
  const main = s.rng;
  s.rng = N.rng;
  try { return fn(); } finally { N.rng = s.rng; s.rng = main; }
}

const roll = (k: string) => (hashSeed(k) % 100003) / 100003;

function pickH<T>(h: RngHolder, arr: readonly T[]): T {
  return arr[Math.floor(rand(h) * arr.length)];
}

/** Old enough on the day, never younger (a birth date moved back a year at a time). */
function fixAdult(s: GameState, c: Character, min = ADULT): void {
  while (ageOn(c.birth, s.date) < min) c.birth = { ...c.birth, y: c.birth.y - 1 };
}

const KID_M = ['Tommy', 'Joey', 'Michael', 'Anthony', 'Danny', 'Bobby', 'Frankie', 'Johnny', 'Billy', 'Richie'];
const KID_F = ['Mary', 'Theresa', 'Linda', 'Patty', 'Cathy', 'Donna', 'Annie', 'Rosemary', 'Susan', 'Joanie'];

/* ------------------------------------------------------------------ */
/* Prices and money                                                    */
/* ------------------------------------------------------------------ */

const r10 = (n: number) => Math.max(10, Math.round(n / 10) * 10);
const r50 = (n: number) => Math.max(50, Math.round(n / 50) * 50);

/** Her rate for an evening at her age and looks (escorts, call girls, street; dancers who offer company). */
export function priceFor(s: GameState, c: Character, role: NightRole, offers = true): number {
  const lk = looksOf(s, c).score ?? 50;
  const a = ageOfC(s, c);
  if (role === 'escort') {
    const f = a <= 25 ? 1 : a <= 32 ? 0.9 : a <= 40 ? 0.75 : 0.6;
    return r50((400 + lk * 9) * f);
  }
  if (role === 'callgirl') return r10((90 + lk * 1.6) * (a <= 35 ? 1 : 0.8));
  if (role === 'street') return r10((15 + lk * 0.5) * (a <= 30 ? 1 : 0.8));
  if (role === 'dancer' && offers) return r50(150 + lk * 2.5);
  return 0;
}

/** Her week's earnings, before any house's or family's cut (abstract). */
export function weeklyEarn(s: GameState, p: NightPerson, c: Character): number {
  const season = isInSeason(s.date) ? 1.25 : 0.7;
  const lk = looksEarnings(s, c);
  const a = ageOfC(s, c);
  const jit = 0.85 + roll(`${s.seed}|${s.week}|earn|${p.id}`) * 0.3;
  let v = 0;
  switch (p.role) {
    // The young list books more in season; the mature list books steadily all year.
    case 'escort': v = p.price * (a <= 25 ? (isInSeason(s.date) ? 2.6 : 1.2) : 2) * (isInSeason(s.date) ? 1 : a <= 25 ? 1 : 1.2) / (isInSeason(s.date) ? 1 : 0.7); break;
    case 'callgirl': v = p.price * 4; break;
    case 'street': v = p.price * 8; break;
    case 'dancer': v = (110 + p.talent * 2) * lk + (p.price ? p.price * 0.6 : 0); break;
    case 'singer': v = (100 + p.talent * 3) * lk; break;
    case 'madam': v = 0; break;
    default: v = 0;
  }
  return Math.round(v * season * jit);
}

/** The family's share of what she makes, by how much she makes (the more she makes, the bigger the cut). */
export function kickbackRate(earn: number): number {
  return earn < 300 ? 0.1 : earn < 700 ? 0.15 : earn < 1200 ? 0.2 : 0.25;
}

/** Protection a house pays the family weekly. */
export function protectionOf(h: NightHouse): number {
  if (h.deal === 'protect') return Math.max(100, Math.round(h.take * 0.15));
  if (h.deal === 'partner') return Math.round(h.take * 0.3);
  return 0;
}

/* ------------------------------------------------------------------ */
/* Making the cast                                                     */
/* ------------------------------------------------------------------ */

function kidsFor(s: GameState, N: NightlifeState, age: number, n: number): NightKid[] {
  const out: NightKid[] = [];
  for (let i = 0; i < n; i++) {
    const m = rand(N) < 0.5;
    const kidAge = Math.max(0, Math.min(age - 19, Math.floor(rand(N) * Math.max(1, Math.min(22, age - 18)))));
    out.push({ n: pickH(N, m ? KID_M : KID_F), m, y: s.date.y - kidAge });
  }
  return out.sort((a, b) => a.y - b.y);
}

/** Her husband or fella, as a person of the world (an adult man; a civilian with a job). */
function makePartner(s: GameState, N: NightlifeState, her: Character, st: MaritalSt, newMarriage = false): Character {
  const age = Math.max(20, ageOfC(s, her) + Math.floor(rand(N) * 9) - 1);
  const m = withRng(s, N, () => makeCharacter(s, { gender: 'M', age, rank: 'civilian', faction: 'none', nickname: false, ethnicity: her.ethnicity, lastName: !newMarriage && (st === 'married' || st === 'separated') ? her.lastName : undefined }));
  fixAdult(s, m);
  m.ambition = `Works as ${pickH(N, MEN_JOBS)}`;
  if (st === 'married' || st === 'separated') {
    m.spouseId = her.id;
    her.spouseId = m.id;
    if (st === 'separated') ensureRomance(s).separations.push({ a: her.id, b: m.id, week: s.week });
  } else if (drawnTo(s, her, m) && drawnTo(s, m, her)) {
    startRomance(s, m.id, her.id);
  }
  return m;
}

interface MakeOpts {
  role: NightRole; age: number; side: FactionId; venue: string; house?: string;
  f?: string; l?: string; nick?: string; eth?: Character['ethnicity']; goal?: NightGoal; dream?: NightPerson['dream']; adultOk?: boolean;
  st?: MaritalSt; kids?: number; away?: string; knows?: PartnerKnows; mother?: 'ailing' | 'well'; bounds?: NightBound[];
  lk?: number; ph?: CastSpec['ph']; style?: string; traits?: Character['traits']; talent?: number; arrived?: string;
}

const GOALS_BY_ROLE: Record<string, NightGoal[]> = {
  escort: ['home', 'shop', 'madam', 'marry', 'act'], callgirl: ['home', 'shop', 'family', 'school', 'marry'], street: ['out', 'home', 'family', 'out'],
  dancer: ['act', 'sing', 'club', 'marry', 'shop'], singer: ['sing'], barfly: ['marry', 'club', 'family'], date: ['marry', 'home', 'shop', 'act'], madam: ['shop', 'home'],
};

function makePerson(s: GameState, N: NightlifeState, o: MakeOpts): NightPerson {
  const c = withRng(s, N, () => makeCharacter(s, {
    gender: 'F', age: o.age, firstName: o.f, lastName: o.l, ethnicity: o.eth, rank: 'civilian', faction: 'none', nickname: false,
    traits: o.traits, wealth: o.role === 'madam' ? 40000 + Math.floor(rand(N) * 60000) : o.role === 'escort' ? 3000 : 400,
  }));
  fixAdult(s, c);
  if (o.nick) c.nickname = o.nick;
  if (o.role === 'madam') { c.attributes.business = Math.max(c.attributes.business, 14); c.attributes.diplomacy = Math.max(c.attributes.diplomacy, 13); }
  // Looks: the cast is cast (a base at her best, a build, a style); everyone else's are rolled (looks.ts).
  N.looks[c.id] = {
    b: o.lk ?? (o.role === 'escort' ? 72 + Math.floor(rand(N) * 22) : o.role === 'callgirl' ? 55 + Math.floor(rand(N) * 25) : o.role === 'street' ? 35 + Math.floor(rand(N) * 30) : o.role === 'dancer' ? 62 + Math.floor(rand(N) * 28) : 30 + Math.floor(rand(N) * 55)),
    ...(o.ph ? { ph: o.ph } : {}), ...(o.style ? { st: o.style } : {}),
  };
  const goal = o.goal ?? pickH(N, GOALS_BY_ROLE[o.role] ?? ['home']);
  c.ambition = NGOAL_TEXT[goal];
  const st: MaritalSt = o.st ?? (() => {
    const r = rand(N);
    const a = o.age;
    return r < 0.45 ? 'single' : r < 0.6 ? 'steady' : r < 0.75 ? (a >= 22 ? 'married' : 'single') : r < 0.88 ? (a >= 24 ? 'divorced' : 'single') : r < 0.95 ? (a >= 24 ? 'separated' : 'steady') : (a >= 30 ? 'widowed' : 'single');
  })();
  const kidsN = o.kids ?? (st === 'single' && rand(N) < 0.75 ? 0 : o.age >= 21 ? Math.floor(rand(N) * (o.age >= 28 ? 4 : 2)) : 0);
  const fam: NightFamily = { st, kids: kidsFor(s, N, o.age, kidsN) };
  if (st === 'married' || st === 'steady' || st === 'separated') {
    const m = makePartner(s, N, c, st);
    fam.partnerId = m.id;
    fam.knows = o.knows ?? pickH(N, ['knows', 'accepts', 'suspects', 'unaware', 'unaware'] as PartnerKnows[]);
    if (o.away) fam.away = o.away;
  }
  if (o.mother) fam.mother = o.mother;
  else if (rand(N) < 0.25) fam.mother = rand(N) < 0.5 ? 'ailing' : 'well';
  const p: NightPerson = {
    id: c.id, role: o.role, venue: o.venue, house: o.house, side: o.side, price: 0, earn: 0,
    savings: Math.round((o.role === 'madam' ? 20000 : o.role === 'escort' ? 2500 : 300) * (0.5 + rand(N))),
    goal, dream: o.dream, adultOk: o.adultOk && o.age >= 21 ? true : undefined,
    bounds: o.bounds ?? (rand(N) < 0.35 ? [pickH(N, ['no_married', 'no_rough', 'careful', 'no_payroll', 'no_rivals'] as NightBound[])] : []),
    loyalty: o.side === 'player' ? 35 + Math.floor(rand(N) * 20) : 15 + Math.floor(rand(N) * 15), attach: 0,
    talent: o.talent ?? (o.role === 'dancer' || o.role === 'singer' ? 45 + Math.floor(rand(N) * 40) : 20 + Math.floor(rand(N) * 50)),
    discretion: o.role === 'escort' ? 70 + Math.floor(rand(N) * 25) : o.role === 'street' ? 25 + Math.floor(rand(N) * 30) : 40 + Math.floor(rand(N) * 40),
    fam, since: s.week, status: 'active', hist: [],
  };
  const offers = o.role === 'dancer' ? (o.adultOk || roll(`${s.seed}:offers:${c.id}`) < 0.35) : true;
  p.price = priceFor(s, c, o.role, offers);
  if (o.arrived) hist(p, s, `${c.firstName} ${o.arrived}.`);
  N.people[c.id] = p;
  syncProvider(s, p);
  return p;
}

const PROVIDER_KIND: Partial<Record<NightRole, ProviderKind>> = { escort: 'escort', callgirl: 'callgirl', street: 'street', dancer: 'dancer' };

/** Keep the dating layer's booking record (paid company) in step with her life here. */
function syncProvider(s: GameState, p: NightPerson): void {
  const D = ensureDating(s);
  const kind = PROVIDER_KIND[p.role];
  const c = s.characters[p.id];
  const ex = D.providers[p.id];
  const working = p.status === 'active' && !!kind && p.price > 0 && !!c?.alive && adultC(s, c) && p.side !== 'none' ? true : p.status === 'active' && !!kind && p.price > 0 && !!c?.alive && adultC(s, c);
  if (!working) {
    if (ex && ex.status === 'working') { ex.status = 'left'; ex.left = { week: s.week, why: p.status === 'gone' ? 'she left the island' : `${ROLE_LABEL[p.role].toLowerCase()} now` }; }
    return;
  }
  const h = p.house ? s.nightlife?.houses[p.house] : undefined;
  const venue = p.role === 'street' || p.role === 'dancer' ? p.venue : h ? h.front : p.venue;
  const via: Provider['via'] = p.role === 'street' ? 'street' : p.role === 'dancer' ? 'club' : 'phone';
  if (ex) {
    Object.assign(ex, { kind: kind!, price: p.price, venue, via, status: 'working', offers: true, discretion: p.discretion, nl: true });
    ex.left = undefined;
  } else {
    D.providers[p.id] = { id: p.id, kind: kind!, venue, price: p.price, offers: true, discretion: p.discretion, via, since: s.week, status: 'working', visits: [], nl: true };
  }
}

function districtFor(s: GameState, key: string, rival?: RivalId): string {
  const ds = rival ? s.districts.filter((d) => (d.influence[rival] ?? 0) > 0) : s.districts;
  const list = ds.length ? ds : s.districts;
  return list[hashSeed(`${s.seed}:nd:${key}`) % list.length]?.id ?? 'boardwalk';
}

function newHouse(s: GameState, N: NightlifeState, madam: Character, o: { name?: string; front?: string; with: FactionId; deal: HouseDeal; rival?: RivalId; ears?: boolean }): NightHouse {
  const h: NightHouse = {
    id: madam.id, name: o.name ?? `the ${madam.lastName} house`, district: districtFor(s, madam.id, o.rival), front: o.front ?? pickH(N, ['an agency over a shoe store', 'a floor of a motel on the Boulevard', 'rooms over a supper club', 'a hostess service in a hotel']),
    money: madam.wealth, with: o.with, deal: o.deal, take: 0, heat: 10 + Math.floor(rand(N) * 15), since: s.week, past: [],
  };
  if (o.ears) h.ears = true;
  N.houses[h.id] = h;
  return h;
}

/** Builds the night (once): the island's cast and houses, the rival families' houses, a few kept women of NPC bosses. */
function seedNight(s: GameState, N: NightlifeState): void {
  const byLast: Record<string, string> = {};
  const deals: Record<string, [FactionId, HouseDeal]> = { Caruso: ['player', 'protect'], Doyle: ['none', 'none'], Hart: ['philly', 'protect'], Bellini: ['player', 'partner'] };
  const mobs = s.rivals.filter((r) => r.kind === 'mob');
  for (const x of CAST.filter((c) => c.role === 'madam')) {
    const p = makePerson(s, N, { ...x, side: 'player', venue: x.venue ?? VENUES.lounge, style: x.st2 });
    const c = s.characters[p.id];
    let [w, d] = deals[x.l] ?? ['none', 'none'];
    if (w === 'philly' && mobs[0]) w = mobs[0].id;
    newHouse(s, N, c, { name: x.house, front: x.front, with: w, deal: d, rival: w !== 'player' && w !== 'none' ? (w as RivalId) : undefined });
    p.side = w === 'player' || w === 'none' ? (w === 'player' ? 'player' : 'none') : w;
    byLast[x.l] = c.id;
    if (w === 'player') addOpinion(s, c.id, s.playerId, 'Pays you, and you keep your word', 8, 0);
  }
  // The Ears' Madam has a house too (ears.ts keeps her cut).
  const em = s.ears?.madam;
  if (em && s.characters[em.id]?.alive) newHouse(s, N, s.characters[em.id], { name: em.house, front: em.agency, with: em.cut > 0 ? 'player' : 'none', deal: em.cut > 0 ? 'protect' : 'none', ears: true });
  for (const x of CAST.filter((c) => c.role !== 'madam')) {
    const house = x.via ? byLast[x.via] : undefined;
    const h = house ? N.houses[house] : undefined;
    const side: FactionId = h ? (h.with === 'player' ? 'player' : h.with) : x.role === 'date' || x.role === 'barfly' ? 'none' : 'player';
    makePerson(s, N, { ...x, side, house, venue: x.venue ?? (h ? h.front : VENUES.hotel), style: x.st2, arrived: undefined });
  }
  // The street and high-end women the dating layer already knew are part of the cast now.
  const D = ensureDating(s);
  for (const pr of Object.values(D.providers)) {
    if (pr.ear || pr.nl || N.people[pr.id]) continue;
    const c = s.characters[pr.id];
    if (!c?.alive || !adultC(s, c)) continue;
    const role: NightRole = pr.kind === 'street' ? 'street' : pr.kind === 'escort' ? 'escort' : pr.kind === 'callgirl' ? 'callgirl' : 'dancer';
    N.looks[c.id] = { b: role === 'escort' ? 76 + (hashSeed(c.id) % 16) : 40 + (hashSeed(c.id) % 30) };
    N.people[c.id] = {
      id: c.id, role, venue: pr.venue, side: 'player', price: pr.price, earn: 0, savings: role === 'escort' ? 3000 : 300, goal: role === 'street' ? 'out' : 'home',
      bounds: [], loyalty: 30, attach: 0, talent: 30, discretion: pr.discretion, fam: { st: 'single', kids: [] }, since: s.week, status: 'active', hist: [],
    };
    pr.nl = true;
  }
  // The rival families' nights: a house each, and her people.
  for (const r of mobs) {
    const m = makePerson(s, N, { role: 'madam', age: 40 + Math.floor(rand(N) * 15), side: r.id, venue: VENUES.hotel, lk: 50 + Math.floor(rand(N) * 25), traits: ['Greedy', 'Patient'] });
    const mc = s.characters[m.id];
    newHouse(s, N, mc, { name: `${mc.firstName} ${mc.lastName}'s house`, with: r.id, deal: 'protect', rival: r.id, front: `a hostess service the ${r.shortName} people use` });
    const roles: NightRole[] = ['escort', 'callgirl', 'dancer'];
    for (const role of roles) makePerson(s, N, { role, age: role === 'escort' ? 19 + Math.floor(rand(N) * 6) : 21 + Math.floor(rand(N) * 12), side: r.id, house: mc.id, venue: role === 'dancer' ? VENUES.paree : `${mc.firstName}'s hostess service` });
  }
  // Some men already keep a goomar.
  for (let i = 0; i < 3; i++) npcGoomars(s, N, true);
  for (const p of Object.values(N.people)) p.met = p.role === 'madam' && N.houses[p.id]?.with === 'player' ? true : p.met;
}

/** The state (and the cast, the first time). Older saves get it here. */
export function ensureNightlife(s: GameState): NightlifeState {
  if (!s.nightlife) {
    s.nightlife = blankNightlife(s);
    seedNight(s, s.nightlife);
  }
  const N = s.nightlife;
  N.looks ??= {};
  N.npc ??= [];
  N.promises ??= [];
  N.goomars ??= {};
  return N;
}

/* ------------------------------------------------------------------ */
/* Read helpers                                                        */
/* ------------------------------------------------------------------ */

export function personOf(s: GameState, id: string): NightPerson | undefined {
  return s.nightlife?.people[id];
}

export function houseOf(s: GameState, p: NightPerson | undefined): NightHouse | undefined {
  return p?.house ? s.nightlife?.houses[p.house] : p?.role === 'madam' ? s.nightlife?.houses[p.id] : undefined;
}

export function sideName(s: GameState, f: FactionId): string {
  if (f === 'player') return 'Yours';
  if (f === 'none') return 'Independent';
  const r = s.rivals.find((x) => x.id === f);
  return r ? `The ${r.shortName} family's` : 'Someone else\'s';
}

function bossBlock(s: GameState): string | undefined {
  const b = player(s);
  if (!b?.alive) return 'You are not here';
  if (!isFree(s, b)) return 'You are inside';
  if (!adultC(s, b)) return 'Not until you are 18';
  return undefined;
}

/** Why this woman can't be part of anything here (undefined: she can). */
export function nightBlock(s: GameState, id: string): string | undefined {
  const p = personOf(s, id);
  const c = s.characters[id];
  if (!p || !c) return 'Not part of the night';
  if (!c.alive) return 'She has died';
  if (!adultC(s, c)) return 'Adults only';
  if (p.status !== 'active') return 'She has left the island';
  if (!roleShown(s, p.role)) return 'Mature content is Off in Settings';
  return bossBlock(s);
}

/* ------------------------------------------------------------------ */
/* Previews                                                            */
/* ------------------------------------------------------------------ */

function base(title: string, because: string): ActionPreview {
  return { title, effects: [], cost: 0, because, category: 'event' };
}

function capAcc(baseV: number, reasons: Reason[], cap = 0.9): Acceptance {
  const sum = reasons.reduce((a, r) => a + r.value, baseV);
  return { chance: Math.max(0.05, Math.min(cap, sum / 100)), reasons: [{ label: 'Base', value: baseV }, ...reasons.filter((r) => r.value !== 0)] };
}

export function payrollAcceptance(s: GameState, p: NightPerson, c: Character): Acceptance {
  if (p.bounds.includes('no_payroll')) return { chance: 0, reasons: [{ label: 'Works for herself, on nobody\'s payroll', value: -100 }] };
  const boss = player(s);
  const reasons: Reason[] = [];
  reasons.push({ label: `Trusts you: ${p.loyalty}`, value: Math.round((p.loyalty - 30) * 0.5) });
  const op = opinion(s, c.id, boss.id);
  if (op) reasons.push({ label: op > 0 ? 'Thinks well of you' : 'Thinks little of you', value: Math.round(op * 0.3) });
  const h = houseOf(s, p);
  if (h && h.with === 'player') reasons.push({ label: 'Her madam is under your protection', value: 12 });
  if (p.side !== 'player' && p.side !== 'none') reasons.push({ label: `Works in the ${sideName(s, p.side).replace('The ', '').replace('\'s', '')} house`, value: -30 });
  if (p.seeking && p.seeking >= s.week) reasons.push({ label: 'She came looking for work', value: 25 });
  if (p.bounds.includes('no_rivals')) reasons.push({ label: 'Stays out of the families\' business', value: -25 });
  if (hasTrait(boss, 'Cruel')) reasons.push({ label: 'People say you can be cruel', value: -20 });
  if (p.role === 'street') reasons.push({ label: 'Protection on the avenue', value: 15 });
  return capAcc(40, reasons);
}

function previewPayroll(s: GameState, id: string): ActionPreview {
  const c = s.characters[id];
  const p = personOf(s, id);
  if (!c || !p) return { ...base('Nobody', 'did nothing'), disabledReason: 'Not part of the night' };
  const earn = p.earn || weeklyEarn(s, p, c);
  const rate = kickbackRate(earn);
  const rival = p.side !== 'player' && p.side !== 'none' ? p.side as RivalId : undefined;
  return {
    ...base(`Put ${c.firstName} on the payroll`, `put ${c.firstName} on the family's payroll`), cost: 200,
    detail: `${displayName(c)}, ${ageOfC(s, c)}, ${roleText(s, p).toLowerCase()} at ${p.venue}. A $200 envelope from the Family to start. She kicks back a share of what she makes: 10% under $300 a week, 15% under $700, 20% under $1,200, 25% above (now about ${$(earn)} a week, so ${Math.round(rate * 100)}%: ~${$(earn * rate)} a week to the Family). In return your people look out for her and her trust in you grows. She decides; she can quit the arrangement any time.`,
    effects: [{ type: 'money', amount: -200, label: `${c.firstName}: a start on the payroll` }, NX({ op: 'payroll', id }, `${c.firstName} on the payroll`)],
    acceptance: payrollAcceptance(s, p, c), refuseEffects: [NX({ op: 'refused', id, what: 'the payroll' }, `${c.firstName} said no`)],
    warning: rival ? `She works in a house the ${s.rivals.find((r) => r.id === rival)?.shortName} family protects: they will take it as poaching.` : p.role === 'street' ? 'Street work draws the vice squad: a little local heat every month.' : undefined,
    disabledReason: nightBlock(s, id) ?? (p.payroll ? 'Already on your payroll' : p.role === 'madam' ? 'A madam deals with you house to house' : !['escort', 'callgirl', 'street', 'dancer', 'singer'].includes(p.role) ? 'She isn\'t working the night' : !isFree(s, c) ? 'She is in jail' : s.money < 200 ? 'Needs $200' : undefined),
  };
}

function previewRelease(s: GameState, id: string): ActionPreview {
  const c = s.characters[id];
  const p = personOf(s, id);
  if (!c || !p) return { ...base('Nobody', 'did nothing'), disabledReason: 'Not part of the night' };
  return {
    ...base(`Let ${c.firstName} off the payroll`, `let ${c.firstName} off the payroll`),
    detail: `No more kickback; she keeps working on her own terms. She keeps whatever she thinks of you.`,
    effects: [NX({ op: 'release', id }, `${c.firstName} off the payroll`)],
    disabledReason: !adultC(s, c) ? 'Adults only' : !p.payroll ? 'She is not on your payroll' : undefined,
  };
}

/** Does the family own a business that helps with an introduction? */
export function introHelp(s: GameState, kind: PromiseKind): string | undefined {
  const own = (k: string) => s.businesses.find((b) => b.owner === 'player' && b.kind === k);
  const b = kind === 'record' ? own('label') ?? own('talent') : kind === 'film' ? own('filmdist') ?? own('talent') : own('adulttheater') ?? own('filmdist');
  return b?.name;
}

export const KEEP_COST: Record<PromiseKind, number> = { record: 800, film: 1200, adult: 600 };

export function auditionOdds(s: GameState, p: NightPerson, c: Character, kind: PromiseKind): number {
  const lk = looksOf(s, c).score ?? 50;
  const help = introHelp(s, kind) ? 0.12 : 0;
  const v = kind === 'record' ? 0.1 + p.talent / 160 : kind === 'film' ? 0.05 + p.talent / 250 + lk / 300 : 0.35 + lk / 400;
  return Math.max(0.05, Math.min(0.85, v + help));
}

function previewPromise(s: GameState, id: string, kind: PromiseKind): ActionPreview {
  const c = s.characters[id];
  const p = personOf(s, id);
  if (!c || !p) return { ...base('Nobody', 'did nothing'), disabledReason: 'Not part of the night' };
  const N = s.nightlife;
  const open = N?.promises.find((x) => x.who === id && x.status === 'open');
  const words = { record: 'a record man', film: 'a film producer', adult: 'a producer of adult pictures' }[kind];
  const reasons: Reason[] = [];
  let baseV = 30;
  if (p.dream === kind) { baseV = 80; reasons.push({ label: 'It is her dream', value: 0 }); }
  else if (kind === 'record' && p.talent >= 60) reasons.push({ label: 'She can sing', value: 15 });
  else if (kind === 'film' && (p.talent >= 55 || (looksOf(s, c).score ?? 0) >= 75)) reasons.push({ label: 'She would like a chance', value: 15 });
  if (kind === 'adult') { baseV = p.adultOk ? 70 : 0; reasons.push({ label: p.adultOk ? 'She said herself she would consider it, on her terms' : 'She has never said she wants this', value: 0 }); }
  reasons.push({ label: `Trusts you: ${p.loyalty}`, value: Math.round((p.loyalty - 40) * 0.3) });
  const broken = (N?.promises ?? []).filter((x) => x.status === 'broken').length;
  if (broken) reasons.push({ label: `Your word: ${broken} promise${broken === 1 ? '' : 's'} broken`, value: -8 * broken });
  const acc = kind === 'adult' && !p.adultOk ? { chance: 0, reasons: [{ label: 'She has never said she wants this; nobody asks her', value: -100 }] } : capAcc(baseV, reasons);
  const help = introHelp(s, kind);
  return {
    ...base(`Promise ${c.firstName} an introduction to ${words}`, `promised ${c.firstName} an introduction`),
    detail: `${PROMISE_LABEL[kind]}. A promise is an obligation: you have 26 weeks (until week ${s.week + 26}) to make the call (about ${$(KEEP_COST[kind] / (help ? 2 : 1))} from the Family${help ? `, less through ${help}` : ''}). Kept, even if the audition goes nowhere: her trust +15. Broken: her trust −25, the other girls hear, and your word is worth less (−1 Respect). She decides whether she wants it, and what she does with it.${kind === 'adult' ? ' Adult pictures only for a grown woman who chose it herself; her terms, her lawyer, nothing shown here.' : ''}`,
    effects: [NX({ op: 'promise', id, kind }, `A promise to ${c.firstName}`)],
    acceptance: acc, refuseEffects: [NX({ op: 'refused', id, what: 'the introduction' }, `${c.firstName} said no thanks`)],
    disabledReason: nightBlock(s, id) ?? (kind === 'adult' && !adultOn(s) ? 'Mature content is Off in Settings' : undefined) ?? (p.bounds.includes('no_film') && kind !== 'record' ? 'She wants nothing to do with pictures' : undefined) ?? (open ? `You already promised her (${open.kind}, due week ${open.due})` : undefined) ?? (['recording', 'actress', 'adultfilm', 'retired'].includes(p.role) ? 'She has moved on' : undefined),
  };
}

function previewKeep(s: GameState, pid: string): ActionPreview {
  const N = s.nightlife;
  const pr = N?.promises.find((x) => x.id === pid);
  const c = pr ? s.characters[pr.who] : undefined;
  const p = pr ? personOf(s, pr.who) : undefined;
  if (!pr || !c || !p) return { ...base('Nothing', 'did nothing'), disabledReason: 'No such promise' };
  const help = introHelp(s, pr.kind);
  const cost = Math.round(KEEP_COST[pr.kind] / (help ? 2 : 1));
  const odds = auditionOdds(s, p, c, pr.kind);
  const who = CONTACTS[pr.kind][hashSeed(`${s.seed}:contact:${pr.id}`) % CONTACTS[pr.kind].length];
  return {
    ...base(`Keep your word to ${c.firstName}: call ${who}`, `kept your word to ${c.firstName}`), cost,
    detail: `${help ? `Through ${help}: ` : ''}a call, a train ticket, a good word, ${$(cost)} from the Family. The introduction happens; the rest is up to her and them: about ${Math.round(odds * 100)}% she comes back with ${pr.kind === 'record' ? 'a record deal' : pr.kind === 'film' ? 'a part' : 'a contract on her terms'}. Either way you kept your word (her trust +15). Due by week ${pr.due}.`,
    effects: [{ type: 'money', amount: -cost, label: `An introduction for ${c.firstName}` }, NX({ op: 'keep', pid }, `Kept your word to ${c.firstName}`)],
    disabledReason: !adultC(s, c) || !c.alive ? 'She is not here' : pr.status !== 'open' ? `That promise was ${pr.status}` : (pr.kind === 'adult' && !adultOn(s)) ? 'Mature content is Off in Settings' : bossBlock(s) ?? (s.money < cost ? `Needs ${$(cost)}` : undefined),
  };
}

export function dealAcceptance(s: GameState, h: NightHouse, deal: HouseDeal): Acceptance {
  const m = s.characters[h.id];
  if (!m) return { chance: 0, reasons: [] };
  if (deal === 'none') return { chance: 1, reasons: [{ label: 'Her house is hers', value: 100 }] };
  const reasons: Reason[] = [];
  const op = opinion(s, m.id, s.playerId);
  reasons.push({ label: op >= 0 ? 'Thinks well of you' : 'Thinks little of you', value: Math.round(op * 0.4) });
  if (h.squeeze) reasons.push({ label: `The ${s.rivals.find((r) => r.id === h.squeeze!.by)?.shortName} family is leaning on her`, value: 25 });
  if (h.with !== 'player' && h.with !== 'none') reasons.push({ label: `Pays the ${s.rivals.find((r) => r.id === h.with)?.shortName ?? 'other'} family now`, value: -25 });
  if (deal === 'partner') reasons.push({ label: 'A partner takes more of her house', value: -15 });
  if (h.heat >= 50) reasons.push({ label: 'The vice squad is on her', value: 10 });
  if (hasTrait(m, 'Greedy') && deal === 'partner') reasons.push({ label: 'Greedy', value: -10 });
  if (hasTrait(m, 'Loyal-to-a-fault') && h.with === 'player') reasons.push({ label: 'Loyal', value: 15 });
  return capAcc(deal === 'protect' ? 40 : 25, reasons);
}

function previewDeal(s: GameState, house: string, deal: HouseDeal): ActionPreview {
  const h = s.nightlife?.houses[house];
  const m = h ? s.characters[h.id] : undefined;
  if (!h || !m) return { ...base('Nobody', 'did nothing'), disabledReason: 'No such house' };
  const take = h.take || 1500;
  const est = deal === 'protect' ? Math.max(100, Math.round(take * 0.15)) : deal === 'partner' ? Math.round(take * 0.3) : 0;
  const title = deal === 'protect' ? `Offer ${m.firstName} protection` : deal === 'partner' ? `Offer ${m.firstName} a partnership` : `Release ${m.firstName}'s house from your protection`;
  return {
    ...base(title, deal === 'none' ? `let ${h.name} go its own way` : `offered ${h.name} a deal`),
    detail: deal === 'protect' ? `Her house pays the Family about ${$(est)} a week (15% of her take, at least $100). In return your people keep other crews and the worst cops off her, and you back her when someone squeezes her territory. She decides.` :
      deal === 'partner' ? `The Family takes about ${$(est)} a week (30% of her take) and shares the risk: her raids are your heat too, and backing her costs you less. She decides.` :
      'She stops paying; she owes you nothing, and you owe her nothing.',
    effects: [NX({ op: 'deal', house, deal }, `${h.name}: ${DEAL_LABEL[deal].toLowerCase()}`)],
    acceptance: deal === 'none' ? undefined : dealAcceptance(s, h, deal),
    refuseEffects: deal === 'none' ? undefined : [NX({ op: 'refused', id: m.id, what: 'the deal' }, `${m.firstName} said no`)],
    disabledReason: !m.alive || !adultC(s, m) ? 'She is not here' : h.with === 'player' && h.deal === deal ? 'That is the deal already' : deal === 'none' && h.with !== 'player' ? 'She is not under your protection' : h.ears && deal !== 'none' ? 'The Ears\' Madam: her cut is set in The Night & the Ears' : bossBlock(s),
  };
}

function previewBack(s: GameState, house: string): ActionPreview {
  const h = s.nightlife?.houses[house];
  const m = h ? s.characters[h.id] : undefined;
  if (!h || !m) return { ...base('Nobody', 'did nothing'), disabledReason: 'No such house' };
  const rv = h.squeeze ? s.rivals.find((r) => r.id === h.squeeze!.by) : undefined;
  const cost = h.deal === 'partner' ? 800 : 1500;
  return {
    ...base(`Back ${m.firstName} against the ${rv?.shortName ?? 'other'} family`, `backed ${h.name}`), cost,
    detail: `Two cars outside her place for a week and a word with their people. ${$(cost)} from the Family${h.deal === 'partner' ? ' (her partner pays less)' : ''}. They back off; the cops notice; ${m.firstName} remembers.`,
    effects: [{ type: 'money', amount: -cost, label: `Backing ${h.name}` }, NX({ op: 'back', house }, `Backed ${h.name}`), { type: 'heat', bar: 'local', amount: 2, label: 'Two cars outside a house' }, { type: 'respect', amount: 2, label: 'You stood by her' },
      ...(rv ? [{ type: 'rivalOpinion', rival: rv.id, amount: -8, reason: 'Pushed us off a house', label: `The ${rv.shortName} family` } as Effect] : [])],
    disabledReason: !h.squeeze ? 'Nobody is squeezing her' : h.with !== 'player' ? 'She is not under your protection' : s.money < cost ? `Needs ${$(cost)}` : bossBlock(s),
  };
}

export function previewNight(s: GameState, a: NightAction): ActionPreview {
  switch (a.op) {
    case 'payroll': return previewPayroll(s, a.id);
    case 'release': return previewRelease(s, a.id);
    case 'promise': return previewPromise(s, a.id, a.kind);
    case 'keep': return previewKeep(s, a.pid);
    case 'goomar': return previewGoomar(s, a.id);
    case 'endGoomar': return previewEndGoomar(s, a.id);
    case 'deal': return previewDeal(s, a.house, a.deal);
    case 'back': return previewBack(s, a.house);
    case 'invite': return previewInvite(s, a.plan);
    case 'car': return previewCar(s, a.id, a.price);
    case 'bold': return previewBold(s, a.id, a.amount, a.raises, a.after);
    case 'partner': return previewPartner(s, a.id, a.how);
    case 'askMan': return previewAskMan(s, a.id);
  }
}

/* ------------------------------------------------------------------ */
/* Effect ops                                                          */
/* ------------------------------------------------------------------ */

export function applyNightOp(ctx: Ctx, o: NightOp): void {
  const s = ctx.s;
  const N = ensureNightlife(s);
  const boss = player(s);
  if (o.op === 'deal' || o.op === 'back') {
    const h = N.houses[o.house];
    const m = h ? s.characters[h.id] : undefined;
    if (!h || !m?.alive || !adultC(s, m)) return;
    if (o.op === 'deal') {
      h.deal = o.deal;
      h.with = o.deal === 'none' ? 'none' : 'player';
      if (o.deal !== 'none') { h.squeeze = undefined; addOpinion(s, m.id, boss.id, 'We have an understanding', 6, 1); }
      for (const p of Object.values(N.people)) if (p.house === h.id || p.id === h.id) p.side = h.with === 'player' ? 'player' : h.with;
      nlog(N, s, `${h.name}: ${DEAL_LABEL[o.deal].toLowerCase()}.`);
      ctx.log.push(`${m.firstName} ${m.lastName}: ${DEAL_LABEL[o.deal].toLowerCase()}.`);
    } else {
      if (h.squeeze) N.stats.squeezes++;
      h.squeeze = undefined;
      addOpinion(s, m.id, boss.id, 'Stood by my house', 12, 1);
      nlog(N, s, `You backed ${h.name}; the other family's people stayed away.`);
    }
    return;
  }
  if (o.op === 'keep') { keepPromise(ctx, N, o.pid); return; }
  if (o.op === 'invite') { applyInvite(ctx, N, o.plan); return; }
  if (o.op === 'car') { applyCar(ctx, N, o.id, o.price); return; }
  if (o.op === 'bold') { applyBold(ctx, N, o.id, o.amount, o.raises, o.after); return; }
  if (o.op === 'partner') { applyPartner(ctx, N, o.id, o.how); return; }
  if (o.op === 'askMan') { applyAskMan(ctx, N, o.id); return; }
  const c = s.characters[o.id];
  const p = N.people[o.id];
  // Adults only, re-checked when the week runs.
  if (!c?.alive || !adultC(s, c) || !adultC(s, boss) || kin(boss, c)) return;
  switch (o.op) {
    case 'payroll': {
      if (!p || p.payroll) break;
      p.payroll = { since: s.week, paid: 0 };
      p.loyalty = clamp(p.loyalty + 8);
      p.met = true;
      p.seeking = undefined;
      if (p.side !== 'player' && p.side !== 'none') {
        const rv = p.side as RivalId;
        applyEffects(ctx, [{ type: 'rivalOpinion', rival: rv, amount: -4, reason: 'Took one of our house\'s girls', label: 'Poaching' }], { label: 'Poaching', because: 'took one of their girls on', category: 'event' });
      }
      p.side = 'player';
      hist(p, s, `Went on your payroll.`);
      nlog(N, s, `${c.firstName} ${c.lastName} is on your payroll.`);
      break;
    }
    case 'release': {
      if (!p?.payroll) break;
      p.payroll = undefined;
      hist(p, s, 'Came off your payroll.');
      nlog(N, s, `${c.firstName} is off your payroll; she works for herself.`);
      break;
    }
    case 'promise': {
      if (!p || N.promises.some((x) => x.who === c.id && x.status === 'open')) break;
      if (o.kind === 'adult' && (!p.adultOk || !adultOn(s))) break;
      N.promises.push({ id: `np${s.nextId++}`, who: c.id, kind: o.kind, made: s.week, due: s.week + 26, status: 'open' });
      p.loyalty = clamp(p.loyalty + 6);
      p.met = true;
      addOpinion(s, c.id, boss.id, 'He promised me an introduction', 6, 1);
      hist(p, s, `You promised her an introduction (${o.kind === 'record' ? 'a record man' : o.kind === 'film' ? 'a producer' : 'an adult-picture producer'}).`);
      nlog(N, s, `You promised ${c.firstName} an introduction. Due by week ${s.week + 26}.`);
      break;
    }
    case 'goomar':
    case 'endGoomar':
      applyGoomarOp(ctx, N, o);
      break;
    case 'refused': {
      if (p) { p.met = true; hist(p, s, `Said no to ${o.what}.`); }
      nlog(N, s, `${c.firstName} said no (${o.what}). That is her right.`);
      break;
    }
  }
}

function keepPromise(ctx: Ctx, N: NightlifeState, pid: string): void {
  const s = ctx.s;
  const pr = N.promises.find((x) => x.id === pid);
  if (!pr || pr.status !== 'open') return;
  const c = s.characters[pr.who];
  const p = N.people[pr.who];
  if (!c?.alive || !p || !adultC(s, c)) return;
  if (pr.kind === 'adult' && (!p.adultOk || !adultOn(s))) return;
  pr.status = 'kept';
  pr.week = s.week;
  N.stats.kept++;
  p.loyalty = clamp(p.loyalty + 15);
  addOpinion(s, c.id, s.playerId, 'He kept his word', 15, 0);
  const odds = auditionOdds(s, p, c, pr.kind);
  const who = CONTACTS[pr.kind][hashSeed(`${s.seed}:contact:${pr.id}`) % CONTACTS[pr.kind].length];
  if (roll(`${s.seed}|audition|${pr.id}`) < odds) {
    const role: NightRole = pr.kind === 'record' ? 'recording' : pr.kind === 'film' ? 'actress' : 'adultfilm';
    p.role = role;
    p.price = 0;
    p.payroll = undefined;
    p.loyalty = clamp(p.loyalty + 10);
    N.stats.careers++;
    pr.result = pr.kind === 'record' ? `${who} signed her. A single by Labor Day.` : pr.kind === 'film' ? `${who} gave her a part. She goes to New York in the fall.` : `${who} offered terms; she read them with her lawyer and signed, on her terms.`;
    hist(p, s, pr.result);
    syncProvider(s, p);
    applyEffects(ctx, [{ type: 'respect', amount: 1, label: 'The boss made a star' }], { label: 'Kept your word', because: 'kept your word', category: 'event' });
    const help = introHelp(s, pr.kind);
    if (help && pr.kind === 'record') money(ctx, 2000, `${help}: ${c.firstName}'s first record`, 'business');
  } else {
    pr.result = `${who} heard her out. Not this time. She thanks you for the chance.`;
    hist(p, s, `The introduction to ${who}: not this time. You kept your word.`);
  }
  nlog(N, s, `${c.firstName}: ${pr.result}`);
  ctx.log.push(`You kept your word to ${c.firstName}. ${pr.result}`);
}

export function describeNightOp(s: GameState, o: NightOp): string | undefined {
  const c = 'id' in o ? s.characters[o.id] : o.op === 'invite' ? s.characters[o.plan.id] : undefined;
  const first = c?.firstName ?? 'her';
  switch (o.op) {
    case 'payroll': return `${first} kicks back a share every week (10-25%, by what she makes)`;
    case 'release': return `${first} keeps all she makes`;
    case 'promise': return `An open promise to ${first}: 26 weeks to keep it`;
    case 'keep': return 'The introduction happens; her trust +15';
    case 'goomar': return `${first}'s apartment ${$(o.rent)}/wk and allowance ${$(o.allowance)}/wk from your pocket`;
    case 'endGoomar': return `It ends${o.gift ? `, with ${$(o.gift)} to see her right` : ''}`;
    case 'deal': return o.deal === 'none' ? 'Her house goes its own way' : `Her house ${o.deal === 'protect' ? 'pays for protection' : 'partners with the family'}`;
    case 'back': return 'The squeeze on her house ends';
    case 'invite': return `${KIND_INFO[o.plan.kind].label} with ${first}`;
    case 'car': return `A few minutes in your car with ${first}`;
    case 'bold': return `${$(o.amount)} offered to ${first}; your pocket pays only if she takes it`;
    case 'partner': return `Her man: ${o.how === 'pay' ? 'paid to stay calm' : o.how === 'warn' ? 'warned off' : 'handled by your crew'}`;
    case 'askMan': return `What you know about ${first}'s man`;
    case 'refused': return undefined;
  }
}

/* ------------------------------------------------------------------ */
/* The week                                                            */
/* ------------------------------------------------------------------ */

const isWorking = (p: NightPerson) => p.status === 'active' && ['escort', 'callgirl', 'street', 'dancer', 'singer'].includes(p.role);

/** Weekly: earnings, kickbacks, houses and protection, attachment and scenes, promises, the goomar, squeezes; monthly and yearly lives. */
export function nightlifeWeek(ctx: Ctx): void {
  const s = ctx.s;
  if (s.gameOver) return;
  const N = ensureNightlife(s);
  const boss = player(s);
  const D = s.dating;
  // Adults only, the living only: re-checked every week.
  for (const p of Object.values(N.people)) {
    const c = s.characters[p.id];
    if (!c || !adultC(s, c)) { delete N.people[p.id]; if (D?.providers[p.id]) delete D.providers[p.id]; continue; }
    if (!c.alive && p.status === 'active') { p.status = 'gone'; hist(p, s, 'Died.'); syncProvider(s, p); }
  }
  // Earnings, savings, the payroll's kickback.
  for (const h of Object.values(N.houses)) h.take = 0;
  let kick = 0;
  const kickNames: string[] = [];
  for (const p of Object.values(N.people)) {
    const c = s.characters[p.id];
    if (!c?.alive || !isWorking(p) || !isFree(s, c)) { p.earn = 0; continue; }
    p.earn = weeklyEarn(s, p, c);
    const h = p.house ? N.houses[p.house] : undefined;
    const houseCut = h ? Math.round(p.earn * 0.4) : 0;
    if (h) h.take += houseCut;
    let k = 0;
    if (p.payroll) {
      k = Math.round(p.earn * kickbackRate(p.earn));
      p.payroll.paid += k;
      kick += k;
      kickNames.push(c.firstName);
    }
    p.savings += Math.round((p.earn - houseCut - k) * 0.3);
    c.wealth = Math.max(c.wealth, p.savings);
    // Time with the boss builds attachment: a booking this week, the same woman again and again.
    const visits = D?.providers[p.id]?.visits ?? [];
    if (visits.includes(s.week)) { p.attach = clamp(p.attach + 6 + Math.min(6, visits.length)); p.loyalty = clamp(p.loyalty + 1); p.met = true; }
    else if (p.attach > 0 && s.week % 4 === 0) p.attach = clamp(p.attach - 1);
  }
  if (kick > 0) {
    money(ctx, kick, `The girls' kickback (${kickNames.slice(0, 3).join(', ')}${kickNames.length > 3 ? ` and ${kickNames.length - 3} more` : ''})`, 'business');
    N.stats.kickback += kick;
  }
  // The houses: their take, their protection.
  for (const h of Object.values(N.houses)) {
    const m = s.characters[h.id];
    if (!m?.alive) continue;
    h.money += Math.round(h.take * 0.5);
    if (h.ears) continue;
    const pay = protectionOf(h);
    if (pay > 0 && h.with === 'player') {
      money(ctx, pay, `${h.name}: protection (${DEAL_LABEL[h.deal].toLowerCase()})`, 'business');
      N.stats.protection += pay;
      h.money -= pay;
    }
    if (h.squeeze) {
      h.squeeze.left--;
      if (h.squeeze.left <= 0) {
        const rv = s.rivals.find((r) => r.id === h.squeeze!.by);
        const was = h.with;
        h.with = h.squeeze.by;
        h.deal = 'protect';
        h.squeeze = undefined;
        for (const p of Object.values(N.people)) if (p.house === h.id || p.id === h.id) p.side = h.with;
        if (was === 'player') {
          addOpinion(s, m.id, boss.id, 'Nobody came when they leaned on me', -15, 1);
          applyEffects(ctx, [{ type: 'respect', amount: -2, label: `${h.name} went over to the ${rv?.shortName ?? 'other'} family` }], { label: 'A house lost', because: 'let a house go', category: 'event' });
        }
        nlog(N, s, `${m.firstName} ${m.lastName} pays the ${rv?.shortName ?? 'other'} family now.`);
        ctx.log.push(`${h.name} went over to the ${rv?.shortName ?? 'other'} family. Nobody backed her.`);
      }
    }
  }
  // Attachment can turn into wanting more, or a scene (her decision, her temper; never violence).
  if (boss.spouseId) {
    const wife = s.characters[boss.spouseId];
    for (const p of Object.values(N.people)) {
      if (p.attach < 70 || p.status !== 'active' || isGoomar(s, p.id) || (p.scene !== undefined && s.week - p.scene < 12)) continue;
      const c = s.characters[p.id];
      if (!c?.alive || !wife?.alive) continue;
      const r = roll(`${s.seed}|${s.week}|scene|${p.id}`);
      if (r > 0.05) continue;
      p.scene = s.week;
      const last = Math.max(...(D?.providers[p.id]?.visits ?? [-99]), D?.bonds[p.id]?.last ?? -99);
      if (s.week - last <= 4 || hasTrait(c, 'Patient')) {
        hist(p, s, 'Told you she wants to see you more. As herself, not as business.');
        nlog(N, s, `${c.firstName} wants to see you more, as herself. Ask her out, or keep it business: her call and yours.`);
        ctx.log.push(`${c.firstName} told you she wants to see you more.`);
      } else {
        N.stats.scenes++;
        p.attach = clamp(p.attach - 25);
        hist(p, s, 'Called your house and asked for you. Your wife answered.');
        applyEffects(ctx, [{ type: 'opinion', from: wife.id, to: boss.id, amount: -15, reason: 'A woman called the house for him', decay: 1, label: `${c.firstName} called your house` }, { type: 'familyOpinion', amount: -1, reason: 'The boss\'s private life at the dinner table', label: 'A scene' }], { label: `${c.firstName} made a scene`, because: 'stopped calling her', category: 'event' });
        const Dd = ensureDating(s);
        Dd.rumors.push({ week: s.week, text: `A woman called the boss's house and asked for him by name.`, about: boss.id, heard: [wife.id], true: true });
        nlog(N, s, `${c.firstName} called your house and asked for you. ${wife.firstName} answered.`);
        ctx.log.push(`${c.firstName} called your house. ${wife.firstName} answered the phone.`);
      }
    }
  }
  // Promises: past due is broken.
  for (const pr of N.promises) {
    if (pr.status !== 'open' || s.week <= pr.due) continue;
    pr.status = 'broken';
    pr.week = s.week;
    N.stats.broken++;
    const c = s.characters[pr.who];
    const p = N.people[pr.who];
    if (!c?.alive || !p) continue;
    p.loyalty = clamp(p.loyalty - 25);
    addOpinion(s, c.id, boss.id, 'He promised, and never called', -15, 1);
    for (const o of Object.values(N.people)) if (o.id !== p.id && o.house && o.house === p.house) o.loyalty = clamp(o.loyalty - 5);
    applyEffects(ctx, [{ type: 'respect', amount: -1, label: `A broken promise to ${c.firstName}` }], { label: 'Your word', because: 'broke a promise', category: 'event' });
    hist(p, s, 'You never made the call you promised.');
    if (p.payroll && roll(`${s.seed}|quit|${pr.id}`) < 0.35) { p.payroll = undefined; hist(p, s, 'Quit your payroll over it.'); }
    nlog(N, s, `You promised ${c.firstName} an introduction and never made the call. She told the other girls.`);
    ctx.log.push(`You broke your promise to ${c.firstName}.`);
  }
  for (const p of Object.values(N.people)) if (p.seeking !== undefined && p.seeking < s.week) p.seeking = undefined;
  goomarWeek(ctx, N);
  partnersWeek(ctx, N);
  // Yearly lives (spread over the year), monthly world.
  for (const p of Object.values(N.people)) if (p.status === 'active' && (s.week + (hashSeed(p.id) % 52)) % 52 === 0) yearOf(ctx, N, p);
  if (s.week % 4 === 0) monthOf(ctx, N);
  for (const p of Object.values(N.people)) syncProvider(s, p);
}

/* ------------------------------------------------------------------ */
/* A year of her life                                                  */
/* ------------------------------------------------------------------ */

function retire(s: GameState, N: NightlifeState, p: NightPerson, c: Character, why: string, role: NightRole = 'retired'): void {
  p.role = role;
  p.price = 0;
  p.payroll = undefined;
  hist(p, s, why);
  nlog(N, s, `${c.firstName} ${c.lastName}: ${why}`);
  if (role === 'retired') N.stats.retired++;
  if (role === 'owner') N.stats.business++;
  syncProvider(s, p);
}

function yearOf(ctx: Ctx, N: NightlifeState, p: NightPerson): void {
  const s = ctx.s;
  const c = s.characters[p.id];
  if (!c?.alive || !adultC(s, c)) return;
  const a = ageOfC(s, c);
  const r = (k: string) => roll(`${s.seed}|${s.date.y}|${k}|${p.id}`);
  // Her family's year.
  if (p.fam.mother === 'ailing' && r('mother') < 0.15) { p.fam.mother = undefined; hist(p, s, 'Buried her mother; paid for the funeral herself.'); p.savings = Math.max(0, p.savings - 600); }
  if ((p.fam.st === 'married' || p.fam.st === 'steady') && a <= 40 && r('baby') < 0.08) {
    const m = r('babysex') < 0.5;
    p.fam.kids.push({ n: (m ? KID_M : KID_F)[hashSeed(`${p.id}:${s.date.y}`) % 10], m, y: s.date.y });
    hist(p, s, 'Had a baby.');
  }
  if (['single', 'divorced', 'widowed'].includes(p.fam.st) && a < 45 && r('marry') < 0.07) {
    const st: MaritalSt = 'married';
    const maiden = c.lastName;
    const m = makePartner(s, N, c, st, true);
    c.maidenName ??= maiden;
    c.lastName = m.lastName;
    p.fam = { ...p.fam, st, partnerId: m.id, knows: ADULT_ROLES.includes(p.role) ? (r('knows') < 0.5 ? 'unaware' : 'accepts') : 'accepts' };
    N.stats.married++;
    hist(p, s, `Married ${m.firstName} ${m.lastName}.`);
    if (ADULT_ROLES.includes(p.role) && r('quit') < 0.4) { retire(s, N, p, c, `Married ${m.firstName} and got out of the life.`); return; }
    nlog(N, s, `${c.firstName} ${c.maidenName ?? c.lastName} married ${m.firstName} ${m.lastName}.`);
  }
  // Her money: a goal reached.
  const shopAt = 9000;
  if ((p.goal === 'shop' || p.goal === 'club') && p.savings >= shopAt && p.role !== 'madam' && p.role !== 'owner' && r('shop') < 0.6) {
    p.savings -= shopAt;
    const biz = p.goal === 'club' ? `Manages ${p.venue} now` : `Opened ${BUSINESSES[hashSeed(`${s.seed}:biz:${p.id}`) % BUSINESSES.length]}`;
    p.venue = p.goal === 'club' ? p.venue : BUSINESSES[hashSeed(`${s.seed}:biz:${p.id}`) % BUSINESSES.length];
    retire(s, N, p, c, `${biz}.`, 'owner');
    return;
  }
  if (p.goal === 'home' && p.savings >= 7000 && r('home') < 0.6) { p.savings -= 7000; p.goal = 'family'; c.ambition = NGOAL_TEXT.family; hist(p, s, 'Bought a little house of her own.'); }
  // Her career with the years.
  switch (p.role) {
    case 'escort':
      if (a >= 34 && r('esc') < 0.35) {
        if (p.savings >= 12000) { p.savings -= 8000; retire(s, N, p, c, `Retired and opened ${BUSINESSES[hashSeed(`${s.seed}:biz:${p.id}`) % BUSINESSES.length]}.`, 'owner'); return; }
        if (r('esc2') < 0.5) { p.role = 'callgirl'; hist(p, s, 'Took fewer, steadier clients by telephone.'); }
        else { retire(s, N, p, c, 'Left the life.'); return; }
      }
      break;
    case 'callgirl':
      if (a >= 32 && p.goal === 'madam' && p.savings >= 8000 && r('madam') < 0.4) { becomeMadam(s, N, p, c); return; }
      if (a >= 40 && r('cg') < 0.3) { retire(s, N, p, c, 'Left the life.'); return; }
      break;
    case 'street':
      if (a >= 33 && r('st') < 0.35) {
        if ((looksOf(s, c).score ?? 0) >= 55 && r('st2') < 0.4) { p.role = 'callgirl'; p.venue = VENUES.phone; hist(p, s, 'Got off the avenue: takes calls now.'); }
        else { retire(s, N, p, c, p.goal === 'out' ? 'Got off the street: a job at the cannery in Cape May.' : 'Left the life.'); return; }
      }
      break;
    case 'dancer':
      if (a >= 30 && r('dn') < 0.35) {
        if (p.goal === 'club') { retire(s, N, p, c, `Manages ${p.venue} now.`, 'owner'); return; }
        if (r('dn2') < 0.5) { p.role = 'barfly'; p.price = 0; hist(p, s, 'Hung up the costume; tends bar where she used to dance.'); }
        else { retire(s, N, p, c, 'Hung up the costume.'); return; }
      }
      break;
    case 'madam':
      if (a >= 62 && r('mad') < 0.4) { madamRetires(ctx, N, p, c); return; }
      break;
    case 'date':
      if (a >= 40) { p.role = 'barfly'; }
      break;
  }
  // Prices move with the years and the looks.
  const offers = p.role !== 'dancer' || p.price > 0;
  p.price = priceFor(s, c, p.role, offers);
  if (p.role === 'callgirl' && !p.house && p.venue === VENUES.street) p.venue = VENUES.phone;
}

function becomeMadam(s: GameState, N: NightlifeState, p: NightPerson, c: Character): void {
  p.role = 'madam';
  p.price = 0;
  p.payroll = undefined;
  p.house = undefined;
  newHouse(s, N, c, { name: `${c.firstName} ${c.lastName}'s house`, with: 'none', deal: 'none' });
  N.stats.madams++;
  hist(p, s, 'Opened a house of her own.');
  nlog(N, s, `${c.firstName} ${c.lastName} opened a house of her own. She is a madam now, on her own; she may want protection.`);
  syncProvider(s, p);
}

function madamRetires(ctx: Ctx, N: NightlifeState, p: NightPerson, c: Character): void {
  const s = ctx.s;
  const h = N.houses[p.id];
  retire(s, N, p, c, 'Retired to Florida and left her house to someone she trusts.');
  if (!h) return;
  const heirs = Object.values(N.people).filter((x) => x.house === h.id && x.status === 'active' && s.characters[x.id]?.alive && ageOfC(s, s.characters[x.id]) >= 28);
  heirs.sort((a, b) => (s.characters[b.id].attributes.business - s.characters[a.id].attributes.business) || (b.savings - a.savings));
  const heir = heirs[0];
  delete N.houses[h.id];
  if (!heir) { nlog(N, s, `${h.name} closed.`); for (const x of Object.values(N.people)) if (x.house === h.id) x.house = undefined; return; }
  const nh: NightHouse = { ...h, id: heir.id, past: [...h.past, { id: c.id, until: s.week, why: 'retired' }] };
  N.houses[heir.id] = nh;
  heir.role = 'madam';
  heir.price = 0;
  heir.house = undefined;
  heir.payroll = undefined;
  for (const x of Object.values(N.people)) if (x.house === h.id) x.house = heir.id;
  const hc = s.characters[heir.id];
  hist(heir, s, `Took over ${h.name}.`);
  nlog(N, s, `${hc.firstName} ${hc.lastName} runs ${h.name} now.`);
}

/* ------------------------------------------------------------------ */
/* The month: newcomers, madams bring girls, raids, squeezes, intel     */
/* ------------------------------------------------------------------ */

const TARGETS: Partial<Record<NightRole, number>> = { escort: 9, callgirl: 5, street: 4, dancer: 6, singer: 2, barfly: 4, date: 5 };

function newcomerAge(N: NightlifeState, role: NightRole): number {
  const span: Record<string, [number, number]> = { escort: [19, 25], callgirl: [20, 32], street: [20, 34], dancer: [19, 27], singer: [20, 34], barfly: [25, 50], date: [21, 35] };
  const [lo, hi] = span[role] ?? [21, 30];
  return lo + Math.floor(rand(N) * (hi - lo + 1));
}

function monthOf(ctx: Ctx, N: NightlifeState): void {
  const s = ctx.s;
  const boss = player(s);
  const active = Object.values(N.people).filter((p) => p.status === 'active' && s.characters[p.id]?.alive);
  // Newcomers keep the island's night going (adults, 19 and up when they arrive).
  const islands = active.filter((p) => p.side === 'player' || p.side === 'none');
  const young = islands.filter((p) => p.role === 'escort' && ageOfC(s, s.characters[p.id]) <= 25).length;
  for (const role of Object.keys(TARGETS) as NightRole[]) {
    const n = islands.filter((p) => p.role === role).length;
    const need = (TARGETS[role] ?? 0) > n || (role === 'escort' && young < 4);
    if (!need) continue;
    const p = makePerson(s, N, { role, age: newcomerAge(N, role), side: role === 'date' || role === 'barfly' ? 'none' : 'player', venue: pickH(N, role === 'street' ? [VENUES.street, VENUES.corner, VENUES.motor] : role === 'dancer' ? [VENUES.burlesque, VENUES.paree, VENUES.lounge] : role === 'escort' || role === 'callgirl' ? [VENUES.hotel, VENUES.phone] : [VENUES.bar, VENUES.surf, VENUES.supper, VENUES.hialeah]), arrived: pickH(N, ARRIVALS) });
    N.stats.arrived++;
    const c = s.characters[p.id];
    nlog(N, s, `New in town: ${c.firstName} ${c.lastName}, ${ageOfC(s, c)}, ${roleText(s, p).toLowerCase()}.`);
    break;
  }
  // A madam you protect brings you a woman looking for work (she came to the madam; she decides).
  for (const h of Object.values(N.houses)) {
    const m = s.characters[h.id];
    if (!m?.alive || h.with !== 'player' || h.ears || (h.lastIntro !== undefined && s.week - h.lastIntro < 12)) continue;
    if (roll(`${s.seed}|${s.week}|intro|${h.id}`) > 0.3) continue;
    h.lastIntro = s.week;
    const role: NightRole = pickH(N, ['escort', 'callgirl', 'dancer'] as NightRole[]);
    if (!roleShown(s, role)) continue;
    const p = makePerson(s, N, { role, age: newcomerAge(N, role), side: 'player', house: h.id, venue: h.front, arrived: `was brought to you by ${m.firstName} ${m.lastName}, looking for work` });
    p.seeking = s.week + 6;
    N.stats.arrived++;
    const c = s.characters[p.id];
    nlog(N, s, `${m.firstName} ${m.lastName} is waiting to see you: ${c.firstName} ${c.lastName}, ${ageOfC(s, c)}, is looking for work.`);
    ctx.log.push(`${m.firstName} ${m.lastName} brought a woman looking for work (Nightlife).`);
    break;
  }
  // The houses: heat, raids, rival squeezes.
  for (const h of Object.values(N.houses)) {
    const m = s.characters[h.id];
    if (!m?.alive) continue;
    const street = Object.values(N.people).filter((p) => p.house === h.id && p.role === 'street' && p.status === 'active').length;
    h.heat = clamp(h.heat + 2 + street * 3 - (h.cop ? 4 : 1) - (h.with === 'player' ? 1 : 0));
    if (roll(`${s.seed}|${s.week}|raid|${h.id}`) < h.heat / 400) {
      N.stats.raids++;
      const lost = Math.round(h.money * 0.15);
      h.money -= lost;
      h.heat = clamp(h.heat - 30);
      for (const p of Object.values(N.people).filter((x) => x.house === h.id && x.status === 'active').slice(0, 2)) {
        const c = s.characters[p.id];
        if (c) { c.imprisonedUntil = s.week + 1; hist(p, s, 'Picked up in a vice raid; out in a week.'); }
      }
      nlog(N, s, `The vice squad raided ${h.name}. ${m.firstName} lost ${$(lost)}; two of her girls spent a week inside.`);
      if (h.with === 'player') {
        heat(ctx, 'local', h.deal === 'partner' ? 3 : 1, `Vice raid on ${h.name}`, 'business');
        ctx.log.push(`The vice squad raided ${h.name}.`);
      }
    }
    if (!h.squeeze && (h.with === 'player') && !h.ears) {
      const mobs = s.rivals.filter((r) => r.kind === 'mob' && s.characters[r.leaderId]?.alive);
      const rv = mobs[hashSeed(`${s.seed}:${s.week}:sq:${h.id}`) % Math.max(1, mobs.length)];
      if (rv && roll(`${s.seed}|${s.week}|squeeze|${h.id}`) < 0.05) {
        h.squeeze = { by: rv.id, since: s.week, left: 6 };
        nlog(N, s, `The ${rv.shortName} family is leaning on ${h.name}'s territory. Back ${m.firstName} within 6 weeks, or she pays them.`);
        ctx.log.push(`The ${rv.shortName} family is squeezing ${h.name} (Nightlife).`);
      }
    }
  }
  // Street work on your payroll draws the vice squad.
  const streetMine = active.filter((p) => p.payroll && p.role === 'street').length;
  if (streetMine >= 2) heat(ctx, 'local', Math.floor(streetMine / 2), 'The vice squad watches the avenue', 'business');
  // The girls hear things: a secret about a rival man, from a woman who trusts you.
  const ears = active.filter((p) => p.payroll && p.loyalty >= 55 && isWorking(p));
  const src = ears[hashSeed(`${s.seed}:${s.week}:heard`) % Math.max(1, ears.length)];
  if (src && roll(`${s.seed}|${s.week}|heard`) < 0.25) {
    const men = Object.values(s.characters).filter((x) => x.alive && x.gender === 'M' && s.rivals.some((r) => r.id === x.faction && r.kind === 'mob') && adultC(s, x));
    const man = men[hashSeed(`${s.seed}:${s.week}:man`) % Math.max(1, men.length)];
    if (man) {
      const kind = roll(`${s.seed}|${s.week}|kind`) < 0.5 ? 'debt' as const : 'affair' as const;
      const sec = addSecret(s, man, kind, ['player']);
      if (!sec.knownBy.includes('player')) sec.knownBy.push('player');
      const sc = s.characters[src.id];
      hist(src, s, `Told you something about ${man.firstName} ${man.lastName}.`);
      nlog(N, s, `${sc.firstName} heard something: ${sec.text}. (A secret you can use.)`);
      ctx.log.push(`${sc.firstName} heard something about ${man.firstName} ${man.lastName}.`);
    }
  }
  npcGoomars(s, N, false);
  void boss;
}

/* ------------------------------------------------------------------ */
/* NPC bosses keep goomars too                                         */
/* ------------------------------------------------------------------ */

function npcGoomars(s: GameState, N: NightlifeState, seeding: boolean): void {
  const boss = player(s);
  // Ended ones.
  for (const g of N.npc) {
    if (g.ended !== undefined) continue;
    const m = s.characters[g.man];
    const w = s.characters[g.her];
    if (!m?.alive || !w?.alive || !romanceBetween(s, g.man, g.her) || roll(`${s.seed}|${s.week}|npcend|${g.her}`) < 0.02) {
      g.ended = s.week;
      const r = romanceBetween(s, g.man, g.her);
      if (r) endRomance(s, r, 'It ran its course');
    }
  }
  const men = [...s.rivals.filter((r) => r.kind === 'mob').map((r) => s.characters[r.leaderId]), ...Object.values(s.characters).filter((c) => c.faction === 'player' && (c.rank === 'capo' || c.rank === 'underboss'))]
    .filter((m): m is Character => !!m && m.alive && m.gender === 'M' && m.id !== boss.id && adultC(s, m));
  for (const m of men) {
    // A man can keep several; each one more is less likely.
    const has = N.npc.filter((g) => g.man === m.id && g.ended === undefined).length;
    if (has >= 3) continue;
    if (roll(`${s.seed}|${seeding ? 'seed' : s.week}|npcg|${m.id}`) > (seeding ? 0.35 : 0.03) / (1 + has * 1.5)) continue;
    const pool = Object.values(N.people).filter((p) => {
      const w = s.characters[p.id];
      return p.status === 'active' && !!w?.alive && adultC(s, w) && (p.side === m.faction || p.side === 'none' || p.side === 'player') && ['dancer', 'singer', 'barfly', 'escort', 'callgirl', 'date'].includes(p.role)
        && !w.spouseId && !activeRomances(s, w.id).length && !kin(m, w) && !isGoomar(s, w.id) && drawnTo(s, m, w) && drawnTo(s, w, m) && !N.npc.some((g) => g.her === w.id && g.ended === undefined);
    });
    const p = pool[hashSeed(`${s.seed}:${s.week}:npcpick:${m.id}`) % Math.max(1, pool.length)];
    if (!p) continue;
    // Her decision: she goes along only if she likes him well enough.
    if (opinion(s, p.id, m.id) < -10) continue;
    const r = startRomance(s, m.id, p.id);
    if (!r) continue;
    const known = roll(`${s.seed}|npcknown|${m.id}|${p.id}`) < 0.4;
    N.npc.push({ man: m.id, her: p.id, since: s.week, known });
    if (s.ears) s.ears.links.push({ id: `lk${s.nextId++}`, a: m.id, b: p.id, type: 'mistress', strength: 50, hidden: !known, since: s.week, via: 'npc' });
    const w = s.characters[p.id];
    hist(p, s, `${m.firstName} ${m.lastName} keeps her in an apartment.`);
    if (!seeding && known) nlog(N, s, `Word is ${m.firstName} ${m.lastName} keeps ${w.firstName} ${w.lastName} in an apartment.`);
  }
}

/* ------------------------------------------------------------------ */
/* The views                                                           */
/* ------------------------------------------------------------------ */

export type RosterFilter = 'all' | 'young' | 'mature' | 'callgirl' | 'street' | 'dancer' | 'singer' | 'barfly' | 'date' | 'madam' | 'careers' | 'rivals' | 'payroll';

export const FILTER_LABEL: Record<RosterFilter, string> = {
  all: 'Everyone', young: 'High-end, 18–25', mature: 'High-end, 26 and up', callgirl: 'Call girls', street: 'On the street', dancer: 'Dancers & burlesque', singer: 'Singers',
  barfly: 'Bar regulars', date: 'Out at the clubs', madam: 'Madams', careers: 'Moved on', rivals: 'The other families\'', payroll: 'On your payroll',
};

export interface RosterRow {
  id: string;
  name: string;
  age: number;
  role: NightRole;
  roleLabel: string;
  /** The young or mature high-end list. */
  list?: 'young' | 'mature';
  venue: string;
  house?: string;
  side: string;
  looks: string[];
  family: string;
  price: number;
  earn: number;
  payroll: boolean;
  seeking: boolean;
  goomar: boolean;
  loyalty: number;
  attach: number;
  /** One-line goal. */
  wants: string;
  /** Open promise to her (due week). */
  promise?: number;
}

export function familyLine(s: GameState, p: NightPerson): string {
  const f = p.fam;
  const kids = f.kids.length ? `${f.kids.length} kid${f.kids.length === 1 ? '' : 's'}` : '';
  const partner = f.partnerId ? s.characters[f.partnerId] : undefined;
  const st = f.st === 'married' ? `Married${partner ? ` to ${partner.firstName}` : ''}${f.away ? ` (he is in ${f.away})` : ''}` : f.st === 'steady' ? `Has a fella${partner ? `, ${partner.firstName}` : ''}` : f.st[0].toUpperCase() + f.st.slice(1);
  const knows = partner && f.knows && (ADULT_ROLES.includes(p.role) || p.role === 'dancer') && roleShown(s, p.role) ? `; he ${f.knows === 'knows' ? 'knows what she does and hates it' : f.knows === 'accepts' ? 'knows and accepts it' : f.knows === 'suspects' ? 'suspects' : 'doesn\'t know'}` : '';
  return [`${st}${knows}`, kids, f.mother === 'ailing' ? 'supports an ailing mother' : ''].filter(Boolean).join(' · ');
}

export function rosterRow(s: GameState, p: NightPerson): RosterRow | undefined {
  const c = s.characters[p.id];
  if (!c || !adultC(s, c)) return undefined;
  const a = ageOfC(s, c);
  const l = looksOf(s, c);
  const h = houseOf(s, p);
  return {
    id: p.id, name: displayName(c), age: a, role: p.role, roleLabel: roleText(s, p), list: p.role === 'escort' ? (a <= 25 ? 'young' : 'mature') : undefined,
    venue: p.venue, house: h && h.id !== p.id ? h.name : undefined, side: sideName(s, p.side), looks: [l.tierLabel ?? '', l.physiqueLabel].filter(Boolean),
    family: familyLine(s, p), price: adultOn(s) ? p.price : 0, earn: p.earn, payroll: !!p.payroll, seeking: p.seeking !== undefined && p.seeking >= s.week, goomar: isGoomar(s, p.id),
    loyalty: p.loyalty, attach: p.attach, wants: NGOAL_TEXT[p.goal], promise: s.nightlife?.promises.find((x) => x.who === p.id && x.status === 'open')?.due,
  };
}

function matches(s: GameState, p: NightPerson, f: RosterFilter): boolean {
  const c = s.characters[p.id];
  const a = c ? ageOfC(s, c) : 0;
  const rival = p.side !== 'player' && p.side !== 'none';
  if (f === 'rivals') return rival && p.status === 'active' && WORKING_ROLES.includes(p.role);
  if (f === 'careers') return p.status === 'active' && !WORKING_ROLES.includes(p.role);
  if (f === 'payroll') return !!p.payroll;
  if (p.status !== 'active' || !WORKING_ROLES.includes(p.role)) return false;
  if (rival && f !== 'all' && f !== 'madam') return false;
  switch (f) {
    case 'all': return true;
    case 'young': return p.role === 'escort' && a >= 18 && a <= 25;
    case 'mature': return p.role === 'escort' && a >= 26;
    default: return p.role === f;
  }
}

/** The roster: adults only, adult-service roles only when mature content is on. Waiting-to-see-you first. */
export function nightRoster(s: GameState, f: RosterFilter = 'all'): RosterRow[] {
  const N = s.nightlife;
  if (!N) return [];
  const out: RosterRow[] = [];
  for (const p of Object.values(N.people)) {
    const c = s.characters[p.id];
    if (!c?.alive || !adultC(s, c) || !roleShown(s, p.role) || !matches(s, p, f)) continue;
    const r = rosterRow(s, p);
    if (r) out.push(r);
  }
  const order: NightRole[] = ['madam', 'escort', 'callgirl', 'dancer', 'singer', 'street', 'barfly', 'date', 'owner', 'recording', 'actress', 'adultfilm', 'retired'];
  return out.sort((a, b) => Number(b.seeking) - Number(a.seeking) || Number(b.goomar) - Number(a.goomar) || order.indexOf(a.role) - order.indexOf(b.role) || a.age - b.age);
}

export function filterCounts(s: GameState): Record<RosterFilter, number> {
  const out = {} as Record<RosterFilter, number>;
  for (const f of Object.keys(FILTER_LABEL) as RosterFilter[]) out[f] = nightRoster(s, f).length;
  return out;
}

export interface HouseRow {
  id: string;
  name: string;
  madam: string;
  age: number;
  district: string;
  front: string;
  with: string;
  deal: HouseDeal;
  dealLabel: string;
  take: number;
  protection: number;
  money: number;
  heat: number;
  girls: number;
  squeeze?: string;
  ears?: boolean;
  mine: boolean;
}

export function houseRows(s: GameState): HouseRow[] {
  const N = s.nightlife;
  if (!N) return [];
  const out: HouseRow[] = [];
  for (const h of Object.values(N.houses)) {
    const m = s.characters[h.id];
    if (!m?.alive || !adultC(s, m)) continue;
    const girls = Object.values(N.people).filter((p) => p.house === h.id && p.status === 'active' && WORKING_ROLES.includes(p.role) && roleShown(s, p.role)).length;
    const rv = h.squeeze ? s.rivals.find((r) => r.id === h.squeeze!.by) : undefined;
    out.push({
      id: h.id, name: h.name, madam: displayName(m), age: ageOfC(s, m), district: s.districts.find((d) => d.id === h.district)?.name ?? h.district, front: h.front,
      with: h.with === 'player' ? 'You' : h.with === 'none' ? 'Nobody' : `The ${s.rivals.find((r) => r.id === h.with)?.shortName ?? h.with} family`,
      deal: h.deal, dealLabel: h.with === 'player' ? DEAL_LABEL[h.deal] : h.with === 'none' ? 'On her own' : 'Pays another family', take: h.take, protection: h.with === 'player' && !h.ears ? protectionOf(h) : 0, money: h.money, heat: h.heat, girls,
      squeeze: rv && h.squeeze ? `The ${rv.shortName} family is leaning on her (${h.squeeze.left} week${h.squeeze.left === 1 ? '' : 's'} left)` : undefined, ears: h.ears, mine: h.with === 'player',
    });
  }
  return out.sort((a, b) => Number(b.mine) - Number(a.mine) || Number(!!b.squeeze) - Number(!!a.squeeze) || b.take - a.take);
}

export interface NightSummary {
  people: number;
  payroll: number;
  kickback: number;
  protection: number;
  houses: number;
  yours: number;
  squeezed: number;
  promises: number;
  seeking: number;
  goomars: number;
}

export function nightSummary(s: GameState): NightSummary {
  const N = s.nightlife;
  const roster = nightRoster(s, 'all');
  const houses = houseRows(s);
  let kickback = 0;
  for (const p of Object.values(N?.people ?? {})) if (p.payroll) kickback += Math.round(p.earn * kickbackRate(p.earn));
  return {
    people: roster.length, payroll: roster.filter((r) => r.payroll).length, kickback, protection: houses.reduce((a, h) => a + h.protection, 0), houses: houses.length, yours: houses.filter((h) => h.mine).length,
    squeezed: houses.filter((h) => h.mine && h.squeeze).length, promises: (N?.promises ?? []).filter((x) => x.status === 'open' && (x.kind !== 'adult' || adultOn(s))).length,
    seeking: roster.filter((r) => r.seeking).length, goomars: Object.values(N?.goomars ?? {}).filter((g) => !g.ended).length,
  };
}

/** The open promises and how they ended (adult pictures only when the setting allows). */
export function promiseRows(s: GameState): { id: string; who: string; name: string; kind: PromiseKind; text: string; due: number; status: string; result?: string }[] {
  const N = s.nightlife;
  return (N?.promises ?? []).filter((x) => x.kind !== 'adult' || adultOn(s)).slice().reverse().slice(0, 12).map((x) => {
    const c = s.characters[x.who];
    return { id: x.id, who: x.who, name: c ? displayName(c) : '?', kind: x.kind, text: PROMISE_LABEL[x.kind], due: x.due, status: x.status, result: x.result };
  });
}

/** The orders on her, the next sensible one first (for the roster's "More…", the card, the Deal-with menu). */
export function nightActionsFor(s: GameState, id: string): PlayerAction[] {
  const p = personOf(s, id);
  const c = s.characters[id];
  if (!p || !c || !adultC(s, c) || p.status !== 'active' || !roleShown(s, p.role)) return [];
  const a = (op: NightAction): PlayerAction => ({ kind: 'nightlife', op });
  const out: PlayerAction[] = [];
  if (p.role === 'madam') {
    const h = s.nightlife?.houses[id];
    if (h && !h.ears) {
      if (h.squeeze && h.with === 'player') out.push(a({ op: 'back', house: id }));
      if (h.with !== 'player') out.push(a({ op: 'deal', house: id, deal: 'protect' }));
      if (h.deal !== 'partner' || h.with !== 'player') out.push(a({ op: 'deal', house: id, deal: 'partner' }));
      if (h.with === 'player') out.push(a({ op: 'deal', house: id, deal: 'none' }));
    }
  } else if (['escort', 'callgirl', 'street', 'dancer', 'singer'].includes(p.role)) {
    out.push(a(p.payroll ? { op: 'release', id } : { op: 'payroll', id }));
  }
  const open = s.nightlife?.promises.find((x) => x.who === id && x.status === 'open');
  if (open) out.unshift(a({ op: 'keep', pid: open.id }));
  else if (!['recording', 'actress', 'adultfilm', 'retired', 'madam'].includes(p.role)) {
    const kinds: PromiseKind[] = p.dream ? [p.dream] : [];
    for (const k of ['record', 'film'] as PromiseKind[]) if (!kinds.includes(k)) kinds.push(k);
    if (p.adultOk && adultOn(s) && !kinds.includes('adult')) kinds.push('adult');
    for (const k of kinds) if (k !== 'adult' || adultOn(s)) out.push(a({ op: 'promise', id, kind: k }));
  }
  // An evening (the flow offers every choice; this is the one-tap default), the car, a bold offer, her man.
  if (eveningKindOf(s, id)) out.unshift(a({ op: 'invite', plan: defaultPlan(s, id) }));
  if (adultOn(s)) {
    if (eveningKindOf(s, id) === 'paid') out.push(a({ op: 'car', id, price: askingPrice(s, id, 'car').price }));
    else if (eveningKindOf(s, id)) out.push(a({ op: 'car', id }));
    out.push(a({ op: 'bold', id, amount: 250, raises: 0 }));
  }
  if (p.fam.partnerId) out.push(a(p.fam.temperKnown ? { op: 'partner', id, how: 'warn' } : { op: 'askMan', id }));
  if (isGoomar(s, id)) out.unshift(a({ op: 'endGoomar', id }));
  else if (!goomarBlock(s, id, true)) out.unshift(a({ op: 'goomar', id }));
  else out.push(a({ op: 'goomar', id }));
  return out;
}

/** What the sim's random player may try. */
export function nightActions(s: GameState): PlayerAction[] {
  const r = nightRoster(s, 'all').filter((x) => !x.payroll && (x.role === 'dancer' || x.role === 'callgirl')).slice(0, 1);
  return r.map((x) => ({ kind: 'nightlife', op: { op: 'payroll', id: x.id } }));
}

export function nightLog(s: GameState, n = 8): { week: number; text: string }[] {
  // Mature content Off: no line about the adult-service roles or adult pictures.
  const hide = !adultOn(s) ? /escort|call girl|street worker|adult|on the avenue|takes calls/i : undefined;
  return (s.nightlife?.log ?? []).filter(([, t]) => !hide || !hide.test(t)).slice(-n).reverse().map(([week, text]) => ({ week, text }));
}

export { APARTMENTS };
