import { hashSeed } from './rng';
import type { LookOverride } from './looks';
import type { FactionId, GameState, RivalId } from './types';

/**
 * NIGHTLIFE (state): the island's night as a cast of people and an
 * organized-crime economy (nightlife.ts, goomar.ts).
 *
 * - The cast: adult women of the night (high-end escorts, call girls,
 *   street workers, dancers, singers, bar regulars, women to date at the
 *   clubs) and the madams who run houses. Each has her own household,
 *   money, goals, boundaries and loyalties, and ages with the calendar:
 *   prices, roles and careers change; some retire, open a business, marry,
 *   or become madams themselves. The rival families have theirs.
 * - The houses: every madam runs her own house with its own territory,
 *   money and protection deal (with you, a rival, or nobody), and its own
 *   rivals.
 * - Promises: an introduction to a record man or a film producer is a real
 *   obligation with a deadline, kept or broken.
 * - The goomar: a kept mistress (an apartment, an allowance) for the boss,
 *   only with a woman already in a relationship with him who agrees. NPC
 *   bosses keep theirs.
 *
 * HARD RULES (nightlife.ts checks them at every list, preview, commit and
 * week): adults only (18+ on the day); she decides everything (work, deals,
 * promises, the goomar); no coercion, no debts held over anyone, nobody is
 * traded or given; everything is non-explicit and report-only; the
 * mature-content setting (datingState.ts) is respected everywhere; nobody
 * here is real.
 *
 * Lives on `GameState.nightlife` (optional: older saves get it the first
 * week) and rolls only on its own stream or hashes of (seed, week, purpose).
 */

export type NightRole =
  | 'escort' | 'callgirl' | 'street' | 'dancer' | 'singer' | 'barfly' | 'date' | 'madam'
  /** Where careers go. */
  | 'owner' | 'recording' | 'actress' | 'adultfilm' | 'retired';

export const ROLE_LABEL: Record<NightRole, string> = {
  escort: 'High-end escort', callgirl: 'Call girl', street: 'Street worker', dancer: 'Dancer (burlesque)', singer: 'Singer',
  barfly: 'Bar regular', date: 'Out at the clubs', madam: 'Madam', owner: 'Owns a business', recording: 'Recording artist',
  actress: 'Actress', adultfilm: 'Adult-film performer', retired: 'Out of the life',
};

/** Roles that are adult services: hidden everywhere when mature content is Off. */
export const ADULT_ROLES: NightRole[] = ['escort', 'callgirl', 'street'];
/** Roles that are working the night now (the roster's main lists). */
export const WORKING_ROLES: NightRole[] = ['escort', 'callgirl', 'street', 'dancer', 'singer', 'barfly', 'date', 'madam'];

export type NightGoal = 'shop' | 'home' | 'sing' | 'act' | 'out' | 'marry' | 'school' | 'family' | 'madam' | 'club';
export const NGOAL_TEXT: Record<NightGoal, string> = {
  shop: 'Open a business of her own (a beauty parlor, a dress shop)', home: 'Buy a house and never rent again', sing: 'Make a record',
  act: 'Get into pictures', out: 'Get out of the life', marry: 'Marry well and settle down', school: 'Nursing school in Philadelphia',
  family: 'Take care of her family', madam: 'Run a house of her own one day', club: 'Manage a club',
};

/** What she will not do (the engine enforces each on every request). */
export type NightBound = 'no_married' | 'no_rough' | 'no_rivals' | 'no_film' | 'careful' | 'no_payroll';
export const NBOUND_TEXT: Record<NightBound, string> = {
  no_married: 'Will not get involved with a married man', no_rough: 'Will not see a man known to get rough', no_rivals: 'Stays out of the families\' business',
  no_film: 'Wants nothing to do with pictures', careful: 'Always careful (lowers the chance of a pregnancy)', no_payroll: 'Works for herself, on nobody\'s payroll',
};

export type MaritalSt = 'single' | 'steady' | 'married' | 'separated' | 'divorced' | 'widowed';
export const MARITAL_LABEL: Record<MaritalSt, string> = { single: 'Single', steady: 'Has a steady fella', married: 'Married', separated: 'Separated', divorced: 'Divorced', widowed: 'Widowed' };

/** What her husband or fella knows about her work. */
export type PartnerKnows = 'knows' | 'accepts' | 'suspects' | 'unaware';
export const KNOWS_LABEL: Record<PartnerKnows, string> = {
  knows: 'knows what she does and doesn\'t like it', accepts: 'knows and accepts it', suspects: 'suspects something', unaware: 'doesn\'t know',
};

export interface NightKid { n: string; m: boolean; y: number }

export interface NightFamily {
  st: MaritalSt;
  /** Her husband or fella as a person of the world (when there is one). */
  partnerId?: string;
  knows?: PartnerKnows;
  /** He is away (in Rahway, in the service, at sea). */
  away?: string;
  kids: NightKid[];
  /** Her mother, if she supports her. */
  mother?: 'ailing' | 'well';
  /** Whether the boss has learned this much (the card says "as far as you know"). */
  known?: boolean;
  /** What kind of man he is about it (hidden until the boss learns it). */
  temper?: 'jealous' | 'volatile' | 'fine' | 'manager';
  /** The boss has learned what kind of man he is (asking around, gossip, or the hard way). */
  temperKnown?: boolean;
  /** Week he last came at the boss (cooldown). */
  lastClash?: number;
}

export interface NightPerson {
  id: string;
  role: NightRole;
  /** Where she works or can be found (fictional). */
  venue: string;
  /** The madam whose house she works through (character id). */
  house?: string;
  /** Whose nightlife she is part of: yours, nobody's, or a rival family's. */
  side: FactionId;
  /** Her rate for an evening (escort/call girl/street; dancers only if she offers company). 0: no such thing. */
  price: number;
  /** What she made last week, before any cut (abstract). */
  earn: number;
  /** Her own savings toward her goal. */
  savings: number;
  goal: NightGoal;
  /** The career she dreams of (an introduction can help). */
  dream?: 'record' | 'film' | 'adult';
  /** She has said, herself, she would consider adult pictures (her choice; never assumed). */
  adultOk?: boolean;
  bounds: NightBound[];
  /** On the family's payroll: she kicks back a share (the more she makes, the bigger the share). */
  payroll?: { since: number; paid: number };
  /** Her trust in the boss, 0-100. */
  loyalty: number;
  /** How attached she is to the boss (grows with time together; can turn into wanting more, or a scene). */
  attach: number;
  /** Talent for the stage or the screen, 0-100. */
  talent: number;
  /** Discretion 0-100. */
  discretion: number;
  fam: NightFamily;
  since: number;
  status: 'active' | 'gone';
  /** Brought to the boss by a madam, looking for work (until this week). */
  seeking?: number;
  /** Life events (most recent last, capped). */
  hist: [number, string][];
  /** The boss knows her (met, booked, payroll, introduced). */
  met?: boolean;
  /** Week of the last scene she made (cooldown). */
  scene?: number;
  /** You told her you want it to be something: her hopes are up until this week. */
  expects?: number;
  /** She is testing whether you meant "you" (until this week). */
  tests?: number;
  /** Week you were cold or insulting to her (she remembers). */
  scorned?: number;
  /** She holds a grudge against the boss (since week): she may talk to the other side. */
  grudge?: number;
  /** Thrown out of the club (week). */
  barred?: number;
  /** She said yes out of fear (week): she keeps away from him. */
  afraid?: number;
}

export type HouseDeal = 'none' | 'protect' | 'partner';
export const DEAL_LABEL: Record<HouseDeal, string> = { none: 'On her own', protect: 'Pays for protection', partner: 'Partners with the family' };

export interface NightHouse {
  /** The madam (character id). */
  id: string;
  name: string;
  /** Her territory (a district id). */
  district: string;
  /** Her front (an agency, a hotel floor, a club upstairs). */
  front: string;
  money: number;
  /** Who protects her. */
  with: FactionId;
  deal: HouseDeal;
  /** Her house's take last week (before protection). */
  take: number;
  /** How much the vice squad is looking, 0-100. */
  heat: number;
  /** A rival house or family leaning on her territory. */
  squeeze?: { by: RivalId; since: number; left: number };
  /** The Ears' Madam (ears.ts runs her protection cut). */
  ears?: boolean;
  /** She bought a cop: raids are rarer. */
  cop?: boolean;
  since: number;
  /** Earlier madams of the house. */
  past: { id: string; until: number; why: string }[];
  /** Week she last brought the boss a woman looking for work. */
  lastIntro?: number;
}

export type PromiseKind = 'record' | 'film' | 'adult';
export const PROMISE_LABEL: Record<PromiseKind, string> = {
  record: 'An introduction to a record man (an audition, not a contract)',
  film: 'An introduction to a film producer (a screen test, not a part)',
  adult: 'A meeting with an adult-picture producer, on her terms (she decides everything)',
};

export interface NightPromise {
  id: string;
  who: string;
  kind: PromiseKind;
  made: number;
  due: number;
  status: 'open' | 'kept' | 'broken';
  /** What came of it. */
  result?: string;
  week?: number;
}

export interface Goomar {
  id: string;
  since: number;
  /** Her apartment, weekly, from your pocket. */
  rent: number;
  /** Her allowance, weekly, from your pocket. */
  allowance: number;
  /** Weeks the money did not come. */
  missed: number;
  /** Your wife knows. */
  wifeKnows?: boolean;
  /** It has become talk (Philadelphia hears). */
  public?: boolean;
  ended?: { week: number; why: string };
  /** Where the apartment is. */
  where: string;
}

export interface NpcGoomar { man: string; her: string; since: number; known: boolean; ended?: number }

export interface NightlifeState {
  v: 1;
  rng: number;
  people: Record<string, NightPerson>;
  houses: Record<string, NightHouse>;
  promises: NightPromise[];
  goomars: Record<string, Goomar>;
  npc: NpcGoomar[];
  /** Tip-offs: women with a grudge who talked to a rival family or the law (the threats layer reads these). */
  leaks?: { week: number; from: string; to: string; what: string; warned?: boolean }[];
  /** Women who said they would come along on the boss's next trip (id -> until week). */
  companions?: Record<string, number>;
  /** Stored appearance changes (looks.ts). */
  looks: Record<string, LookOverride>;
  log: [number, string][];
  stats: { arrived: number; retired: number; married: number; madams: number; business: number; careers: number; kept: number; broken: number; goomars: number; left: number; raids: number; squeezes: number; scenes: number; kickback: number; protection: number };
}

export function emptyNightStats(): NightlifeState['stats'] {
  return { arrived: 0, retired: 0, married: 0, madams: 0, business: 0, careers: 0, kept: 0, broken: 0, goomars: 0, left: 0, raids: 0, squeezes: 0, scenes: 0, kickback: 0, protection: 0 };
}

export function blankNightlife(s: GameState): NightlifeState {
  return { v: 1, rng: hashSeed(`${s.seed}:nightlife`), people: {}, houses: {}, promises: [], goomars: {}, npc: [], looks: {}, log: [], stats: emptyNightStats() };
}

/** Peek without creating (safe in render). */
export function nightOf(s: GameState): NightlifeState | undefined {
  return s.nightlife;
}
