import type { HoodId } from './hoodData';
import { HOODS_BY_ID, hoodOfZone } from './hoodData';
import { jobsOf } from './hood';
import type { Lot } from './econState';
import { FEMALE_FIRST, MALE_FIRST, SURNAMES } from './names';
import { hashSeed, pick, rand, type RngHolder } from './rng';
import { inflation } from './property';
import type { Ethnicity, GameState } from './types';

/**
 * THE LIVING NEIGHBORHOOD (state). Phase 3 of the master plan, B11-B14.
 *
 * The people of a district who were, before this layer, only a name on a lot
 * ("Gus Papadakis's souvenir shop"): the owners, the people who work for them,
 * their wives, husbands and children. Each one is a record with a household,
 * money, traits, needs, a goal, a plan, sparse directed ties to other people
 * (townsfolk and the game's characters) and a short memory.
 *
 * It lives on `GameState.living` (optional: an older save gets it the first
 * week it is played) and never touches the main dice: every roll is a hash of
 * (seed, week, entity, purpose), so a change to one family's week does not
 * reshuffle anyone else's.
 *
 * Four records keep the truth:
 *  - people / households / businesses (one per lot, keyed by the lot id),
 *  - debts (who lent whom what, and what is still owed),
 *  - facts: the world-event ledger of what really happened, with who knows it
 *    (layer 2). What the boss knows is layer 3, kept with the succession
 *    court's knowledge (`shadow.know`, livingKnow.ts),
 *  - stories: causal chains of facts (livingStory.ts).
 * Money moves only through `livingMoney.ts` (a journal that reconciles).
 */

/* ------------------------------------------------------------------ */
/* Records                                                             */
/* ------------------------------------------------------------------ */

/** Personality, 0-100 each: ambition, honesty, warmth, vice (drink, cards, chasing), nerve (risk). */
export type Traits = [amb: number, hon: number, warm: number, vice: number, nerve: number];
export const AMB = 0, HON = 1, WARM = 2, VICE = 3, NERVE = 4;

/** One directed tie: what this person feels toward another (sparse; only meaningful ones are kept). */
export interface Tie {
  /** Affection -100..100. */
  a: number;
  /** Trust 0-100. */
  tr: number;
  /** Grudge 0-100. */
  gr: number;
  /** Kin word ("wife", "son", "brother") when they are family. */
  k?: string;
  /** Why the grudge or the debt of gratitude (plain words). */
  why?: string;
}

export type GoalK = 'secure_income' | 'own_business' | 'promotion' | 'marry' | 'repay_debt' | 'support_family' | 'revenge' | 'independence' | 'retire' | 'settle_down';

export type PlanK = 'open_business' | 'revenge' | 'skim' | 'court' | 'affair' | 'save' | 'patron';

/** A plan in motion: stages, a target, a deadline; reevaluated when circumstances change. */
export interface Plan {
  k: PlanK;
  /** 0 = motive recorded, 1.. = preparation, the last = act. */
  stage: number;
  since: number;
  /** Week the next stage may come. */
  next: number;
  /** A person, a lot, a household. */
  target?: string;
  amt?: number;
  /** In his own words. */
  why: string;
  /** The fact that started it. */
  fid?: string;
}

export type JobK = string; // a lot id (works there), 'out' (off the island), 'home' (keeps the house), 'retired', 'school'

export interface Tp {
  id: string;
  f: string;
  l: string;
  g: 'M' | 'F';
  eth: Ethnicity;
  /** Birth year and month. */
  by: number;
  bm: number;
  /** Household. */
  hh: string;
  sp?: string;
  fa?: string;
  mo?: string;
  kids: string[];
  /** Year, month, cause. */
  dead?: [number, number, string];
  /** Away (college, the army) until a week. */
  away?: { until: number; why: string };
  /** Week he left the district for good. */
  left?: number;
  /** Separated from a spouse (1960: no remarriage while the other lives). */
  sepd?: 1;
  job?: JobK;
  wage?: number;
  /** His own money, apart from the household's (what he keeps to himself, a skim). */
  stash: number;
  t: Traits;
  goal?: GoalK;
  plan?: Plan;
  ties: Record<string, Tie>;
  /** His memories: [week, a fact id or a few words]. */
  mem: [number, string][];
  /** Cooldowns by action. */
  cd: Record<string, number>;
  /** Pregnancy: week due. */
  preg?: number;
  /** Week of the last real time with his family. */
  famW?: number;
  /** Weeks out of work. */
  idle?: number;
  /** Missed wages owed to him (by lot). */
  owed?: number;
  /** Collecting unemployment until this week (laid off). */
  ui?: number;
}

export interface Th {
  id: string;
  /** "the Papadakis family". */
  name: string;
  cash: number;
  home: string;
  hood: HoodId;
  members: string[];
  /** Weekly rent (to a landlord off the books of this district). */
  rent: number;
  since: number;
  /** Week the household left the district, or dissolved. */
  gone?: number;
  /** Weeks behind on the house. */
  behind?: number;
  /** The house lot they live in (housing.ts), owned or rented. */
  lot?: string;
  /** Saving up to build or buy a house of their own (they do not spend down to the comfortable line). */
  save?: 1;
}

export interface Tb {
  lot: string;
  owner: string;
  cash: number;
  /** Named staff (people records). */
  staff: string[];
  since: number;
  /** Consecutive weeks it could not pay everything it owed. */
  red: number;
  /** Last week's result, before the owner's draw. */
  net: number;
  /** This year's revenue so far and last year's (for the owner's audit). */
  rev: number;
  /** Hidden: taken from the register since the owner last checked. */
  skim?: number;
  /** A family made an offer on it (week). */
  offered?: number;
  /** The name on the lot when the layer last saw it (another system renaming it is a sale). */
  tn?: string;
  /** Silent partners from the family's crews: a share of the owner's draw (crewFinance.ts). */
  stk?: { c: string; pct: number; w: number; paid: number }[];
}

export type DebtSt = 'open' | 'paid' | 'default' | 'forgiven' | 'skipped' | 'seized';

export interface Td {
  id: string;
  /** A person id (tp*), a character id, 'family' (the player's Family), 'rival:<id>', 'bank'. */
  lender: string;
  /** Borrower (person) and the household that answers for it. */
  by: string;
  hh: string;
  amt: number;
  out: number;
  /** Weekly payment due. */
  pay: number;
  /** Week the next payment is due. */
  next: number;
  missed: number;
  /** The fact it began with. */
  fid: string;
  st: DebtSt;
  why: string;
  w: number;
  /** Week he stopped paying (defaulted); the debt is still owed. */
  dw?: number;
  /** The capo got him more time (week). */
  grace?: number;
  /** A house loan: the lot it was for (Chemical Bank's mortgage, or the Family's). */
  lot?: string;
  /** A loan from the Family's bank or book, with its terms (familyBank.ts). */
  fb?: import('./familyBank').FbTerms;
}

export type FactKind =
  | 'hired' | 'fired' | 'quit' | 'laid_off' | 'work_out' | 'unpaid' | 'raise'
  | 'loan' | 'loan_refused' | 'repaid' | 'missed' | 'default' | 'skipped' | 'forgiven'
  | 'opened' | 'closed' | 'sold' | 'struggling' | 'offer' | 'inherited' | 'plans_biz'
  | 'courting' | 'engaged' | 'married' | 'parted' | 'affair' | 'affair_out' | 'separated' | 'expecting' | 'born'
  | 'came_of_age' | 'went_away' | 'came_back' | 'moved_in' | 'moved_out' | 'died'
  | 'skim' | 'skim_caught' | 'theft' | 'thief' | 'grudge' | 'revenge_prep' | 'revenge' | 'settled' | 'talked_cops'
  | 'stake' | 'asked_help' | 'helped' | 'refused_help' | 'patron' | 'boss_helped' | 'boss_refused' | 'capo_settled' | 'mediated'
  | 'bought_lot' | 'broke_ground' | 'house_built' | 'bought_house' | 'sold_house' | 'foreclosed' | 'rented_house' | 'bank_no' | 'bank_yes' | 'collector' | 'seized';

export interface Tf {
  id: string;
  w: number;
  k: FactKind;
  /** The people in it (person ids or character ids). */
  a: string[];
  /** Where (a lot id). */
  at?: string;
  /** What really happened, in plain words. */
  txt: string;
  /** 0 public (anyone could know), 1 the household and the workplace, 2 the people in it, 3 a secret. */
  sec: 0 | 1 | 2 | 3;
  /** Facts that caused it. */
  c?: string[];
  /** The story it belongs to. */
  st?: string;
  amt?: number;
  /** Who else knows (layer 2): witnesses, people told; actors know their own facts. */
  kn: string[];
}

export type StoryK = 'debt' | 'newbiz' | 'failing' | 'skim' | 'theft' | 'match' | 'affair' | 'grudge' | 'family';

export interface Ts {
  id: string;
  k: StoryK;
  title: string;
  cast: string[];
  /** Facts in causal order. */
  f: string[];
  open: boolean;
  w0: number;
  w1?: number;
  /** A request to the boss that came out of it. */
  ask?: { w: number; iid: string; via: string; ans?: string; aw?: number };
  /** How it came out (truth). */
  end?: string;
}

export interface LivingStats {
  facts: number;
  births: number;
  deaths: number;
  marriages: number;
  affairs: number;
  loans: number;
  defaults: number;
  opened: number;
  closed: number;
  sold: number;
  hires: number;
  thefts: number;
  skims: number;
  revenge: number;
  asks: number;
  movedIn: number;
  movedOut: number;
}

/** A week's line in the district's history: [week, people, households, businesses, jobs, employed, money held, facts]. */
export type HistRow = [number, number, number, number, number, number, number, number];

export interface LivingState {
  v: 1;
  /** Seed of the layer's rolls (hashes of seed, week, entity, purpose). */
  seed: number;
  next: number;
  hoods: HoodId[];
  people: Record<string, Tp>;
  hh: Record<string, Th>;
  /** Businesses by lot id. */
  biz: Record<string, Tb>;
  debts: Td[];
  facts: Tf[];
  stories: Ts[];
  /** The journal since the last reconciliation: [from, to, amount, why]. */
  j: [string, string, number, string][];
  /** Every internal balance at the last reconciliation. */
  bal0: Record<string, number>;
  /** Money in and out of the district's people, by outside account (lifetime). */
  flow: Record<string, number>;
  hist: HistRow[];
  /** At the start: people and households (for the bounds). */
  base: { pop: number; hh: number; biz: number };
  lastMonth?: string;
  lastAsk?: number;
  /** Week the boss last had someone ask around. */
  askW?: number;
  /** Last week was in the summer season (the help is let go when it ends). */
  season?: boolean;
  /** Closed shops waiting for a buyer: lot id -> the household that gets the price. */
  sellers?: Record<string, string>;
  stats: LivingStats;
}

/* ------------------------------------------------------------------ */
/* Rolls                                                               */
/* ------------------------------------------------------------------ */

/** A roll in [0,1) for one entity, one purpose, this week: stable under anything else changing. */
export function roll(L: LivingState, week: number, key: string): number {
  const h: RngHolder = { rng: hashSeed(`${L.seed}|${week}|${key}`) };
  return rand(h);
}

export function stream(L: LivingState, week: number, key: string): RngHolder {
  return { rng: hashSeed(`${L.seed}|${week}|${key}`) };
}

export const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(v)));

export function nid(L: LivingState, p: string): string {
  return `${p}${L.next++}`;
}

/* ------------------------------------------------------------------ */
/* Who                                                                 */
/* ------------------------------------------------------------------ */

export function ageOf(p: Pick<Tp, 'by' | 'bm'>, y: number, m: number): number {
  return y - p.by - (m < p.bm ? 1 : 0);
}

export function alive(p: Tp | undefined): p is Tp {
  return !!p && !p.dead;
}

/** Alive and living in the district (not away, not gone). */
export function present(p: Tp | undefined, week: number): p is Tp {
  return !!p && !p.dead && p.left === undefined && !(p.away && p.away.until > week);
}

export const he = (p: Pick<Tp, 'g'> | undefined) => (p?.g === 'F' ? 'she' : 'he');
export const his = (p: Pick<Tp, 'g'> | undefined) => (p?.g === 'F' ? 'her' : 'his');
export const him = (p: Pick<Tp, 'g'> | undefined) => (p?.g === 'F' ? 'her' : 'him');

export function pname(p: Tp | undefined): string {
  return p ? `${p.f} ${p.l}` : 'someone';
}

/** The districts simulated in detail. Start with the Boardwalk (its records are the richest). */
export const LIVING_HOODS: HoodId[] = ['boardwalk'];

export function livingHoodOfLot(L: LivingState | undefined, l: Lot): HoodId | undefined {
  if (!L) return undefined;
  const h = hoodOfZone(l.zone);
  return h && L.hoods.includes(h) ? h : undefined;
}

/** A private going concern on a living lot: the layer runs it, not the neighborhood dice. */
export function livingRunsLot(s: GameState, l: Lot): boolean {
  return !!s.living?.biz[l.id] || (!!s.living && !!livingHoodOfLot(s.living, l) && l.status === 'private');
}

/* ------------------------------------------------------------------ */
/* Making the district                                                 */
/* ------------------------------------------------------------------ */

function blankStats(): LivingStats {
  return { facts: 0, births: 0, deaths: 0, marriages: 0, affairs: 0, loans: 0, defaults: 0, opened: 0, closed: 0, sold: 0, hires: 0, thefts: 0, skims: 0, revenge: 0, asks: 0, movedIn: 0, movedOut: 0 };
}

const ETHS: Ethnicity[] = ['Italian', 'Irish', 'Jewish'];

function ethOf(h: RngHolder, sur: string): Ethnicity {
  for (const e of ETHS) if (SURNAMES[e].includes(sur)) return e;
  if (/^(O'|Mc|Mac)/.test(sur) || /(an|y|ey)$/.test(sur)) return 'Irish';
  if (/(i|o|a)$/.test(sur)) return 'Italian';
  if (/(man|stein|berg|baum|witz|ski)$/.test(sur)) return 'Jewish';
  return pick(h, ETHS);
}

function gaussTrait(h: RngHolder, mean = 50, sd = 18): number {
  let x = 0;
  for (let i = 0; i < 4; i++) x += rand(h);
  return clamp(mean + ((x - 2) / 0.577) * sd);
}

export function rollTraits(h: RngHolder): Traits {
  return [gaussTrait(h), gaussTrait(h, 58), gaussTrait(h, 55), gaussTrait(h, 38, 20), gaussTrait(h, 45)];
}

export function firstName(h: RngHolder, eth: Ethnicity, g: 'M' | 'F'): string {
  return pick(h, (g === 'M' ? MALE_FIRST : FEMALE_FIRST)[eth]);
}

export interface NewPerson { f?: string; l: string; g: 'M' | 'F'; eth: Ethnicity; age: number; hh: string; job?: JobK; wage?: number }

export function addPerson(L: LivingState, s: GameState, h: RngHolder, o: NewPerson): Tp {
  const id = nid(L, 'tp');
  const bm = 1 + Math.floor(rand(h) * 12);
  const p: Tp = {
    id, f: o.f ?? firstName(h, o.eth, o.g), l: o.l, g: o.g, eth: o.eth,
    by: s.date.y - o.age - (s.date.m < bm ? 1 : 0), bm, hh: o.hh, kids: [], stash: 0,
    t: rollTraits(h), ties: {}, mem: [], cd: {},
  };
  if (o.job) p.job = o.job;
  if (o.wage) p.wage = o.wage;
  L.people[id] = p;
  const hh = L.hh[o.hh];
  if (hh) hh.members.push(id);
  return p;
}

export function addHousehold(L: LivingState, s: GameState, name: string, home: string, hood: HoodId, cash: number, rent: number): Th {
  const id = nid(L, 'th');
  const hh: Th = { id, name, cash: Math.max(0, Math.round(cash)), home, hood, members: [], rent, since: s.week };
  L.hh[id] = hh;
  return hh;
}

/** Two people are family: the tie both ways (directed, each with his own feeling). */
export function kinTie(a: Tp, b: Tp, ka: string, kb: string, aff: [number, number]): void {
  a.ties[b.id] = { a: aff[0], tr: Math.max(30, aff[0]), gr: 0, k: kb };
  b.ties[a.id] = { a: aff[1], tr: Math.max(30, aff[1]), gr: 0, k: ka };
}

export function marryRecords(a: Tp, b: Tp, aff: [number, number]): void {
  a.sp = b.id;
  b.sp = a.id;
  kinTie(a, b, a.g === 'M' ? 'husband' : 'wife', b.g === 'M' ? 'husband' : 'wife', aff);
}

export function parentRecords(parent: Tp, child: Tp, aff: [number, number] = [60, 55]): void {
  if (parent.g === 'M') child.fa = parent.id;
  else child.mo = parent.id;
  if (!parent.kids.includes(child.id)) parent.kids.push(child.id);
  kinTie(parent, child, parent.g === 'M' ? 'father' : 'mother', child.g === 'M' ? 'son' : 'daughter', aff);
}

/** A family for a working household: a man or a woman, maybe a spouse, children of believable ages. */
export function makeFamily(L: LivingState, s: GameState, h: RngHolder, hh: Th, sur: string, eth: Ethnicity, headAge: number, o: { headG?: 'M' | 'F'; married?: boolean; kids?: number; f?: string } = {}): Tp {
  const g = o.headG ?? 'M';
  const head = addPerson(L, s, h, { f: o.f, l: sur, g, eth, age: headAge, hh: hh.id });
  const married = o.married ?? rand(h) < 0.72;
  let mother: Tp | undefined = g === 'F' ? head : undefined;
  let father: Tp | undefined = g === 'M' ? head : undefined;
  if (married && headAge >= 19) {
    const sAge = Math.max(18, headAge + (g === 'M' ? -Math.floor(rand(h) * 6) : Math.floor(rand(h) * 6)));
    const sp = addPerson(L, s, h, { l: sur, g: g === 'M' ? 'F' : 'M', eth, age: sAge, hh: hh.id });
    marryRecords(head, sp, [Math.round(30 + rand(h) * 55), Math.round(30 + rand(h) * 55)]);
    if (g === 'M') mother = sp; else father = sp;
  } else if (g === 'F' && headAge > 40) {
    // A widow: the children are her husband's too, but he is gone.
    father = undefined;
  }
  const want = o.kids ?? (married ? Math.floor(rand(h) * 4) : 0);
  if (mother) {
    const mAge = ageOf(mother, s.date.y, s.date.m);
    const born: number[] = [];
    for (let i = 0; i < want; i++) {
      // A child born when the mother was 19-40, at least a year apart, not in the future.
      const ageAtBirth = 19 + Math.floor(rand(h) * 21);
      const kAge = mAge - ageAtBirth;
      if (kAge < 0 || born.some((b) => Math.abs(b - kAge) < 1)) continue;
      if (father && ageOf(father, s.date.y, s.date.m) - kAge < 18) continue;
      born.push(kAge);
      const kg: 'M' | 'F' = rand(h) < 0.5 ? 'M' : 'F';
      const k = addPerson(L, s, h, { l: sur, g: kg, eth, age: kAge, hh: hh.id });
      if (father) parentRecords(father, k);
      parentRecords(mother, k);
      if (kAge < 6) k.job = undefined; else if (kAge < 18) k.job = 'school';
    }
    // Siblings know each other.
    const kids = hh.members.map((id) => L.people[id]).filter((x) => x && x.mo === mother!.id);
    for (const a of kids) for (const b of kids) if (a.id !== b.id) a.ties[b.id] = { a: 45, tr: 50, gr: 0, k: b.g === 'M' ? 'brother' : 'sister' };
  }
  return head;
}

/** "Gus Papadakis" / "the Mahaffey brothers" / "Mrs. Hallahan" / "Vince DiNardo's miniature golf" / "the pier company" -> who the owner is. */
export function parseOwner(who: string): { f?: string; l: string; g: 'M' | 'F'; kin?: 'brothers' | 'sisters' | 'family'; corp?: boolean; key: string } {
  // "Vince DiNardo's miniature golf" names the owner, then the place.
  const poss = /^(.+?)'s\s+[a-z].*$/.exec(who.trim());
  const w = (poss ? poss[1] : who).replace(/'s people$/, '').replace(/'s$/, '').trim();
  const key = w.toLowerCase();
  if (/\b(company|syndicate|corporation|associates|city)\b/i.test(w)) return { l: '', g: 'M', corp: true, key };
  let m = /^Mrs\.?\s+(.+)$/.exec(w);
  if (m) return { l: m[1].split(' ').pop()!, g: 'F', key };
  m = /^the\s+(.+?)\s+(brothers|sisters|family|estate)$/i.exec(w);
  if (m) return { l: m[1].split(' ').pop()!, g: m[2] === 'sisters' ? 'F' : 'M', kin: m[2] === 'estate' ? 'family' : (m[2] as 'brothers' | 'sisters' | 'family'), key };
  const parts = w.split(/\s+/);
  if (parts.length >= 2) return { f: parts[0], l: parts[parts.length - 1], g: /^(Dot|Bea|Rose|Marge|Irene|Connie|Irma|Elsie|Ida|Mae|Edna|Ruth|Helen|Dora)$/.test(parts[0]) ? 'F' : 'M', key };
  return { l: parts[0] || 'Smith', g: 'M', key };
}

/** A going concern the layer runs: a private, open business on a living lot. */
export function isLivingBizLot(l: Lot): boolean {
  return l.status === 'private' && l.stage === 'open' && !!l.use && !!l.tenant;
}

export const WAGE = 50;

function seedDistrict(L: LivingState, s: GameState, hood: HoodId): void {
  const h: RngHolder = { rng: hashSeed(`${s.seed}:living:${hood}`) };
  const zones = HOODS_BY_ID[hood].zones;
  const lots = (s.econ?.lots ?? []).filter((l) => zones.includes(l.zone)).sort((a, b) => a.idx - b.idx);
  const infl = inflation(s);
  const workers: string[] = [];
  // One person per owner name: Vince DiNardo with three places is one man with three businesses.
  const owners = new Map<string, Tp>();
  for (const l of lots) {
    if (!isLivingBizLot(l)) continue;
    const o = parseOwner(l.tenant!);
    let owner = owners.get(o.key);
    let hh: Th;
    let fresh = false;
    if (owner) hh = L.hh[owner.hh];
    else {
      fresh = true;
      // A company's place is run by a manager with a family of his own.
      const sur = o.corp ? pick(h, SURNAMES[pick(h, ETHS)]) : o.l;
      const eth = ethOf(h, sur);
      hh = addHousehold(L, s, `the ${sur} family`, o.corp ? `a house on ${pick(h, ['Pine Ave', 'Wildwood Ave', 'Spencer Ave'])}` : `rooms above ${l.name ?? 'the shop'}`, hood, (900 + rand(h) * 3200) * infl, 0);
      const age = o.g === 'F' && !o.kin ? 48 + Math.floor(rand(h) * 18) : 32 + Math.floor(rand(h) * 32);
      owner = makeFamily(L, s, h, hh, sur, eth, age, { headG: o.g, f: o.f, married: o.g === 'F' && !o.kin ? false : undefined });
      owner.t[1] = clamp(owner.t[1] + 8);
      owners.set(o.key, owner);
    }
    const b: Tb = { lot: l.id, owner: owner.id, cash: Math.round((300 + rand(h) * 900) * infl), staff: [], since: s.week, red: 0, net: 0, rev: 0, tn: l.tenant };
    L.biz[l.id] = b;
    owner.job ??= l.id;
    if (!fresh) {
      // His second place: a manager from the street runs it for him.
      addHands(L, s, h, l, b, hood, infl, owner);
      continue;
    }
    if (o.kin === 'brothers' || o.kin === 'sisters') {
      const sib = addPerson(L, s, h, { l: o.l, g: o.g, eth: owner.eth, age: Math.max(22, ageOf(owner, s.date.y, s.date.m) - 2 - Math.floor(rand(h) * 8)), hh: hh.id, job: l.id, wage: WAGE });
      kinTie(owner, sib, o.g === 'M' ? 'brother' : 'sister', o.g === 'M' ? 'brother' : 'sister', [55, 50]);
      b.staff.push(sib.id);
    }
    // The wife or husband keeps the house or helps out; grown children work in the business or look for work.
    for (const id of hh.members) {
      const p = L.people[id];
      if (p.id === owner.id || p.job === l.id) continue;
      const a = ageOf(p, s.date.y, s.date.m);
      if (a < 6) continue;
      if (a < 18) { p.job = 'school'; continue; }
      if (p.id === owner.sp) { p.job = rand(h) < 0.35 ? l.id : 'home'; if (p.job === l.id) b.staff.push(p.id); continue; }
      if (rand(h) < 0.5) { p.job = l.id; p.wage = WAGE; b.staff.push(p.id); } else workers.push(p.id);
    }
    addHands(L, s, h, l, b, hood, infl, owner);
  }
  linkNeighbors(L, h, hood);
  // Grown children who did not go into the business work off the island.
  for (const id of workers) {
    const p = L.people[id];
    p.job = 'out';
    p.wage = WAGE - 5;
  }
  // Everyone starts with a little of his own money.
  for (const p of Object.values(L.people)) if (ageOf(p, s.date.y, s.date.m) >= 18) p.stash = Math.round(rand(h) * 60 * infl);
}

/** Hired hands with names (the rest of the positions are seasonal help from off the island). */
function addHands(L: LivingState, s: GameState, h: RngHolder, l: Lot, b: Tb, hood: HoodId, infl: number, owner: Tp): void {
  {
    const positions = jobsOf(l);
    const named = Math.max(0, Math.min(positions - b.staff.length - 1, positions >= 8 ? 3 : positions >= 4 ? 2 : 1));
    for (let i = 0; i < named; i++) {
      const sur = pick(h, SURNAMES[pick(h, ETHS)]);
      const weth = ethOf(h, sur);
      const single = rand(h) < 0.55;
      const whh = addHousehold(L, s, `the ${sur} household`, single ? `a rented room on ${pick(h, ['Cedar Ave', 'Oak Ave', 'Spicer Ave', 'Magnolia Ave', 'Taylor Ave', 'Burk Ave'])}` : `a bungalow on ${pick(h, ['Pine Ave', 'Wildwood Ave', 'Spencer Ave', 'Garfield Ave', 'Lincoln Ave', 'Montgomery Ave'])}`, hood, (60 + rand(h) * 380) * infl, single ? 8 : 14);
      const wg: 'M' | 'F' = rand(h) < 0.62 ? 'M' : 'F';
      const w = makeFamily(L, s, h, whh, sur, weth, single ? 18 + Math.floor(rand(h) * 10) : 24 + Math.floor(rand(h) * 26), { headG: wg, married: single ? false : undefined });
      w.job = l.id;
      w.wage = WAGE;
      b.staff.push(w.id);
      for (const id of whh.members) {
        const p = L.people[id];
        if (p.id === w.id) continue;
        const a = ageOf(p, s.date.y, s.date.m);
        if (a >= 6 && a < 18) p.job = 'school';
        else if (a >= 18) p.job = p.id === w.sp ? (rand(h) < 0.5 ? 'out' : 'home') : 'out';
        if (p.job === 'out') p.wage = WAGE - 5;
      }
    }
    // The boss and his people know each other; neighbors know each other.
    for (const sid of b.staff) {
      const p = L.people[sid];
      if (!owner.ties[sid]) owner.ties[sid] = { a: 15 + Math.round(rand(h) * 25), tr: 40 + Math.round(rand(h) * 30), gr: 0 };
      if (!p.ties[owner.id]) p.ties[owner.id] = { a: 5 + Math.round(rand(h) * 30), tr: 35 + Math.round(rand(h) * 35), gr: 0 };
      for (const oid of b.staff) if (oid !== sid && !p.ties[oid]) p.ties[oid] = { a: 10 + Math.round(rand(h) * 25), tr: 30, gr: 0 };
    }
  }
}

function linkNeighbors(L: LivingState, h: RngHolder, hood: HoodId): void {
  // Neighbors along the planks.
  const owners = [...new Set(Object.values(L.biz).map((b) => b.owner))].map((id) => L.people[id]).filter((p): p is Tp => !!p && L.hh[p.hh]?.hood === hood);
  for (let i = 0; i < owners.length; i++) {
    for (const j of [i - 1, i + 1]) {
      const n = owners[j];
      if (!n || n.id === owners[i].id || owners[i].ties[n.id]) continue;
      owners[i].ties[n.id] = { a: Math.round(-10 + rand(h) * 40), tr: 30 + Math.round(rand(h) * 25), gr: 0 };
    }
  }
}

/** The layer, made the first time the week runs with a property market (an older save gets it then). */
export function ensureLiving(s: GameState): LivingState | undefined {
  if (s.living) {
    const L = s.living;
    L.stats ??= blankStats();
    L.flow ??= {};
    L.hist ??= [];
    L.j ??= [];
    return L;
  }
  if (!s.econ?.lots.length || !s.hood) return undefined;
  const L: LivingState = {
    v: 1, seed: hashSeed(`${s.seed}:living`), next: 1, hoods: [...LIVING_HOODS], people: {}, hh: {}, biz: {}, debts: [], facts: [], stories: [],
    j: [], bal0: {}, flow: {}, hist: [], base: { pop: 0, hh: 0, biz: 0 }, stats: blankStats(),
  };
  for (const hood of L.hoods) seedDistrict(L, s, hood);
  L.base = { pop: Object.keys(L.people).length, hh: Object.keys(L.hh).length, biz: Object.keys(L.biz).length };
  L.lastMonth = `${s.date.y}-${s.date.m}`;
  s.living = L;
  return L;
}
