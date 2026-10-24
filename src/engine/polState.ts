import type { Ethnicity, FactionId, GameState, RivalId, Trait } from './types';

/**
 * Politics, law-makers and the living world: the state slice.
 *
 * Everything lives on `GameState.pol` (optional, so older saves load) and
 * rolls on its own seeded stream (`pol.rng`), so the layer does not reshuffle
 * the rest of the simulation's dice.
 *
 * Two tiers of people:
 *  - `people`: about 300 fully simulated people (officials, cops, judges,
 *    toughs who can rise, entertainers ...). Records are copy-on-write:
 *    never edit one in place, replace it (see `mutP`), so the weekly clone can
 *    share them (cloneState copies the map, not the records).
 *  - `reserve`: everybody else, one packed string each (see `packRow`). They
 *    age, retire and die once a year and are promoted into the full tier when
 *    a slot opens.
 * The long texts (reputation, hidden personality, hooks) stay in the static
 * world pack (src/worldpack); the state keeps only what changes.
 */

export type Party = 'D' | 'R' | 'I';

export interface PolPerson {
  id: string;
  first: string;
  last: string;
  nick?: string;
  sex: 'M' | 'F';
  born: number;
  eth: Ethnicity;
  /** World-pack institution. */
  inst: string;
  /** World-pack ladder and rung. */
  ladder: string;
  rung: number;
  /** Year he reached this rung. */
  since: number;
  /** Current title, e.g. "Sergeant, Wildwood Police Department". */
  title: string;
  /** Office held: `${officeId}#${seat}`. */
  seat?: string;
  party?: Party;
  /** 0-100: how hard he is to buy. Every cop, fed, prosecutor, judge, inspector and politician has one. */
  integrity: number;
  ambition: number;
  competence: number;
  charisma: number;
  /** 0-100 personal vote-getting strength. */
  strength: number;
  traits: Trait[];
  alive: boolean;
  died?: { year: number; cause: string };
  retired?: boolean;
  /** 0-100: a public scandal hanging over him. */
  scandal: number;
  /** Political dynasty (world-pack DYNASTIES id). */
  dyn?: string;
  /** Entertainers: fame 0-100 and the year they peak. */
  fame?: number;
  peak?: number;
  /** Street toughs: leadership potential, crew, craft. */
  street?: { pot: number; with: FactionId; craft: string };
  /** The engine Character behind this person (engine officials, the boss's children). */
  charId?: string;
  /** Has texts in the world pack. */
  pack?: boolean;
  /** Year he arrived in the world (0 = 1960 roster). */
  arrived: number;
  /** Terms served in the current office (term limits). */
  terms?: number;
  /** Short career notes, most recent last (capped). */
  log?: string[];
}

/** The player's hold on one official (the puppet sheet). All 0-100. */
export interface Ctl {
  /** Personal relationship: dinners, gifts, favors done for him. */
  personal: number;
  /** Financial relationship: envelopes, campaign money, the payroll. */
  financial: number;
  /** How free he is of anybody: grows with time in office and legitimacy. */
  independence: number;
  /** His public standing. */
  legitimacy: number;
  /** Scrutiny: how close the papers and the investigators are. */
  exposure: number;
  /** What coercion and broken promises left behind. */
  resentment: number;
  /** A rival who also owns a piece of him (multi-loyalty). */
  owner?: RivalId;
  /** Elected as your puppet candidate (a secret arrangement that can collapse). */
  puppet?: boolean;
  /** Weekly payroll envelope, if on it. */
  payroll?: number;
  /** He turned: talks to the investigators. */
  flipped?: boolean;
  /** Week of the last favor asked. */
  asked?: number;
  /** Something you dug up on him (abstract: what it is, never how). */
  dirt?: string;
  since: number;
}

export interface OfficeState {
  /** Person id per seat ('' = vacant). */
  holders: string[];
  /** Next election / reappointment per seat (year*12 + month-1; 0 = none). */
  next: number[];
  /** Year each holder took the seat. */
  took: number[];
}

export interface Candidate {
  id: string;
  party?: Party;
  incumbent: boolean;
  /** Campaign money from you (dollars). */
  fund: number;
  endorsed?: boolean;
  /** Favors spent on patronage jobs for him. */
  patronage: number;
  /** Abstract illegal help (resolved as events with consequences). */
  dirty: DirtyOp[];
  /** Your puppet candidate (secret arrangement). */
  puppet?: boolean;
}

export type DirtyOp = 'bribe' | 'fraud' | 'intimidate' | 'coerce';

export interface Election {
  id: string;
  office: string;
  /** Seats up in this election. */
  seats: number[];
  /** Year*12 + month-1. */
  when: number;
  special?: boolean;
  candidates: Candidate[];
}

export interface ElectionResult {
  id: string;
  office: string;
  seats: number[];
  when: number;
  week: number;
  /** Person ids of the winners. */
  winners: string[];
  /** Vote shares in percent, by person id. */
  shares: Record<string, number>;
  /** Names frozen at the time (people die and are pruned). */
  names: Record<string, string>;
  turnout: number;
  headline: string;
  paper: string;
  /** Whom you backed, if anybody. */
  backed?: string;
  /** What came of the dirty work. */
  fallout: string[];
  special?: boolean;
}

export type BillStage = 'problem' | 'debate' | 'vote' | 'signature' | 'implementation' | 'challenge' | 'law' | 'failed' | 'vetoed' | 'struck';

export interface Bill {
  id: string;
  law: string;
  stage: BillStage;
  /** Week it entered this stage. */
  since: number;
  /** Week of the next step. */
  next: number;
  /** 0-100 support among the people who vote on it. */
  support: number;
  /** Your net push (+ for, - against), already folded into support; kept for the UI. */
  push: number;
  sponsor?: string;
  /** How each named member voted. */
  votes?: Record<string, boolean>;
  note?: string;
}

export interface PolStats {
  elections: number;
  incumbentWins: number;
  contested: number;
  fraud: number;
  specials: number;
  arrivals: number;
  deaths: number;
  promotions: number;
  retirements: number;
  scandals: number;
  favors: number;
  refusals: number;
  reports: number;
  flips: number;
  resignations: number;
  billsPassed: number;
  billsFailed: number;
  struck: number;
  crackdowns: number;
  recruitedToughs: number;
  kidWins: number;
}

export interface PolState {
  rng: number;
  people: Record<string, PolPerson>;
  reserve: string[];
  /** World-pack ids who come of age later (heirs), by year. */
  future: string[];
  offices: Record<string, OfficeState>;
  ctl: Record<string, Ctl>;
  elections: Election[];
  results: ElectionResult[];
  /** Results resolved this week (the election-night screen). */
  night: ElectionResult[];
  bills: Bill[];
  /** Law id -> week it took force. */
  laws: Record<string, number>;
  /** War on organized crime. */
  crackdown?: { until: number; reason: string };
  /** Temporary favors in force (key -> until week). */
  boons: Record<string, { until: number; label: string; amount: number }>;
  /** The boss's children in politics: char id -> grooming. */
  kids: Record<string, { since: number; groomed: number; office?: string; held: string[]; lastGroom?: number }>;
  /** Pending political popups (the event source offers one a week). */
  queue: string[];
  /** Month key of the last monthly tick and year of the last yearly tick. */
  lastMonth: number;
  lastYear: number;
  nextGen: number;
  stats: PolStats;
}

export const FULL_TIER = 300;

export function emptyStats(): PolStats {
  return {
    elections: 0, incumbentWins: 0, contested: 0, fraud: 0, specials: 0, arrivals: 0, deaths: 0, promotions: 0, retirements: 0, scandals: 0,
    favors: 0, refusals: 0, reports: 0, flips: 0, resignations: 0, billsPassed: 0, billsFailed: 0, struck: 0, crackdowns: 0, recruitedToughs: 0, kidWins: 0,
  };
}

/** Month index: year*12 + (month-1). */
export function mIdx(y: number, m: number): number {
  return y * 12 + (m - 1);
}
export function mName(i: number): string {
  const M = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${M[i % 12]} ${Math.floor(i / 12)}`;
}

export const clamp100 = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

/** Copy-on-write: returns a fresh copy of the record, already stored back. */
export function mutP(s: GameState, id: string): PolPerson | undefined {
  const pol = s.pol;
  const p = pol?.people[id];
  if (!pol || !p) return undefined;
  const c: PolPerson = { ...p };
  if (p.log) c.log = p.log.slice();
  if (p.street) c.street = { ...p.street };
  pol.people[id] = c;
  return c;
}

export function addLog(p: PolPerson, year: number, text: string): void {
  p.log = [...(p.log ?? []), `${year}: ${text}`].slice(-6);
}

/** The weekly copy: the people map is copied, the (immutable) records and reserve rows are shared. */
export function clonePol(p: PolState): PolState {
  const offices: Record<string, OfficeState> = {};
  for (const k in p.offices) {
    const o = p.offices[k];
    offices[k] = { holders: o.holders.slice(), next: o.next.slice(), took: o.took.slice() };
  }
  const ctl: Record<string, Ctl> = {};
  for (const k in p.ctl) ctl[k] = { ...p.ctl[k] };
  const boons: PolState['boons'] = {};
  for (const k in p.boons) boons[k] = { ...p.boons[k] };
  const kids: PolState['kids'] = {};
  for (const k in p.kids) kids[k] = { ...p.kids[k], held: p.kids[k].held.slice() };
  return {
    ...p,
    people: { ...p.people },
    offices,
    ctl,
    elections: p.elections.map((e) => ({ ...e, seats: e.seats.slice(), candidates: e.candidates.map((c) => ({ ...c, dirty: c.dirty.slice() })) })),
    results: p.results.slice(),
    night: p.night.slice(),
    bills: p.bills.map((b) => ({ ...b, ...(b.votes ? { votes: { ...b.votes } } : {}) })),
    laws: { ...p.laws },
    ...(p.crackdown ? { crackdown: { ...p.crackdown } } : {}),
    boons,
    kids,
    queue: p.queue.slice(),
    stats: { ...p.stats },
  };
}

export function fullName(p: Pick<PolPerson, 'first' | 'last' | 'nick'>): string {
  return p.nick ? `${p.first} "${p.nick}" ${p.last}` : `${p.first} ${p.last}`;
}

/** Seat key helpers. */
export function seatKey(office: string, seat: number): string {
  return `${office}#${seat}`;
}
export function parseSeat(k: string | undefined): { office: string; seat: number } | undefined {
  if (!k) return undefined;
  const i = k.lastIndexOf('#');
  return { office: k.slice(0, i), seat: Number(k.slice(i + 1)) };
}

/* ---- Compact tier: one string per person ---- */

/** id|first|last|sex|born|eth|inst|ladder|rung|since|integrity|party|strength|title */
export function packRow(p: PolPerson): string {
  return [p.id, p.first, p.last, p.sex, p.born, ETH_CODE[p.eth], p.inst, p.ladder, p.rung, p.since, p.integrity, p.party ?? '', p.strength, p.title.replace(/\|/g, '/'), p.dyn ?? '', p.arrived].join('|');
}
const ETH_CODE: Record<Ethnicity, string> = { Italian: 'T', Irish: 'R', Jewish: 'J' };
const ETH_OF: Record<string, Ethnicity> = { T: 'Italian', R: 'Irish', J: 'Jewish' };
export function unpackRow(row: string): PolPerson {
  const f = row.split('|');
  const p: PolPerson = {
    id: f[0], first: f[1], last: f[2], sex: f[3] === 'F' ? 'F' : 'M', born: Number(f[4]), eth: ETH_OF[f[5]] ?? 'Irish',
    inst: f[6], ladder: f[7], rung: Number(f[8]), since: Number(f[9]), integrity: Number(f[10]), strength: Number(f[12]), title: f[13],
    ambition: 50, competence: 50, charisma: 50, traits: [], alive: true, scandal: 0, arrived: Number(f[15] || 0),
  };
  if (f[11]) p.party = f[11] as Party;
  if (f[14]) p.dyn = f[14];
  return p;
}
/** Cheap field reads without unpacking. */
export function rowField(row: string, i: number): string {
  let start = 0;
  for (let k = 0; k < i; k++) start = row.indexOf('|', start) + 1;
  const end = row.indexOf('|', start);
  return end < 0 ? row.slice(start) : row.slice(start, end);
}

/* ---- Effect ops and player orders (types only; see politics.ts) ---- */

export type CtlField = 'personal' | 'financial' | 'independence' | 'legitimacy' | 'exposure' | 'resentment';

export type PolOp =
  | { op: 'ctl'; id: string; field: CtlField; amount: number }
  | { op: 'legit'; id: string; amount: number }
  | { op: 'resent'; id: string; amount: number }
  | { op: 'strength'; id: string; amount: number }
  | { op: 'asked'; id: string }
  | { op: 'payroll'; id: string; amount: number }
  | { op: 'dig'; id: string; odds: number }
  | { op: 'coerce'; id: string }
  | { op: 'cut'; id: string }
  | { op: 'unflip'; id: string }
  | { op: 'void'; id: string; office: string }
  | { op: 'resign'; id: string }
  | { op: 'crackdown'; reason: string; weeks: number }
  | { op: 'boon'; key: string; label: string; amount: number; weeks: number; heat?: number }
  | { op: 'release'; charId: string; full: boolean }
  | { op: 'reopen'; businessId: string }
  | { op: 'casinoLicense' }
  | { op: 'appointWish'; office: string; person: string; weeks: number }
  | { op: 'refusal'; id: string; report: number; resign: number; flip: number }
  | { op: 'campaign'; election: string; cand: string; fund?: number; endorse?: boolean; patronage?: number; dirty?: DirtyOp }
  | { op: 'puppet'; election: string }
  | { op: 'lobby'; bill: string; push: number; risk?: number }
  | { op: 'propose'; law: string; push: number }
  | { op: 'enter'; charId: string }
  | { op: 'groom'; charId: string; amount: number }
  | { op: 'declare'; charId: string; office: string }
  | { op: 'recruit'; id: string };

export type PolAction =
  | { op: 'cultivate'; id: string; how: 'dinner' | 'gift' }
  | { op: 'payroll'; id: string; on: boolean }
  | { op: 'dig'; id: string }
  | { op: 'coerce'; id: string }
  | { op: 'favor'; id: string; kind: FavorKindT }
  | { op: 'fund'; election: string; cand: string; amount: number }
  | { op: 'endorse'; election: string; cand: string }
  | { op: 'patronage'; election: string; cand: string }
  | { op: 'dirty'; election: string; cand: string; dirty: DirtyOp }
  | { op: 'puppet'; election: string }
  | { op: 'lobby'; bill: string; dir: 1 | -1; mode: 'money' | 'favor' | 'bribe' }
  | { op: 'propose'; law: string }
  | { op: 'enter'; charId: string }
  | { op: 'groom'; charId: string }
  | { op: 'declare'; charId: string; office: string }
  | { op: 'recruit'; id: string };

export type FavorKindT = 'zoning' | 'license' | 'sentence' | 'case' | 'transfer' | 'casino' | 'contract' | 'pardon' | 'appoint';
