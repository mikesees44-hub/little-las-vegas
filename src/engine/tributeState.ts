import { hashSeed } from './rng';
import type { GameState } from './types';

/**
 * THE WEEKLY TAKE: state of the tribute engine (tribute.ts).
 *
 * The family's money lives in ACCOUNTS. The family treasury is `s.money`
 * (the operational balance every older system reads and posts to through the
 * one ledger). Next to it the tribute engine keeps:
 *  - personal: the Don's own money (houses, cars, gifts, the Good Life, the household);
 *  - reserve: bills, legal costs, promises, emergencies (covers the treasury when it runs dry);
 *  - envelope: the pending envelope the underboss brings on Monday;
 *  - clearing: the underboss's clearing account (what came up from the crews this week);
 *  - crew:<capoId>: each capo's crew account (what his men paid in, before he keeps his end).
 * External accounts are `ext:<source>` (the street, a business: money entering
 * the system) and `wealth:<charId>` (a man's own pocket: money leaving it).
 *
 * Every movement is a Transfer in the week's journal. Moves touching the
 * treasury are also posted through the one ledger, so `reconcile()` keeps
 * holding; the internal accounts are reconciled by the journal every week
 * (start + in - out == end) and the engine throws if they ever disagree.
 * Rolls on its own seeded stream (`tribute.rng`), so it never shifts the
 * main simulation's dice.
 */

export type AcctId = string;

export type TransferCat =
  | 'business_income'
  | 'crew_contribution'
  | 'capo_distribution'
  | 'underboss_distribution'
  | 'don_personal_share'
  | 'treasury_allocation'
  | 'reserve_allocation'
  | 'transfer'
  | 'cover'
  | 'expense'
  | 'arrears'
  | 'assistance';

export interface Transfer {
  /** From / to account ids. */
  f: AcctId;
  t: AcctId;
  /** Whole dollars, always > 0. */
  a: number;
  c: TransferCat;
  /** Idempotency key: the same key never moves money twice in a week. */
  k: string;
  /** What it was. */
  n?: string;
  /** Hidden from the boss's view (a skim): the truth, kept for the reconciliation. */
  h?: 1;
}

/** The internal accounts with balances (the treasury is s.money). */
export interface Accounts {
  personal: number;
  reserve: number;
  envelope: number;
  clearing: number;
  /** Crew accounts by capo id. */
  crew: Record<string, number>;
}

export type ShortReason = 'bad_week' | 'default' | 'mistake' | 'overspent' | 'grievance' | 'promised' | 'investigation' | 'lying' | 'carried' | 'late';

export const REASON_LABEL: Record<ShortReason, string> = {
  bad_week: 'a real bad week',
  default: 'a customer stiffed him',
  mistake: 'a mistake in the count',
  overspent: 'he spent it',
  grievance: 'a grievance about his end',
  promised: 'promised it somewhere else',
  investigation: 'lying low (under investigation)',
  lying: 'he is lying',
  carried: 'his capo is carrying him',
  late: 'the underboss has not counted it yet',
};

/** One man's week under his agreement. */
export interface MemberLine {
  id: string;
  /** What he really earned for the family's account (hidden). */
  earned: number;
  due: number;
  paid: number;
  /** Arrears paid back this week (on top of `paid`). */
  back?: number;
  /** Shortfall: the truth, what he said, what the underboss believes. */
  truth?: ShortReason;
  said?: ShortReason;
  believed?: ShortReason;
  /** The truth has come out (an audit, the books, a confession). */
  revealed?: boolean;
  /** Agreement shorthand for the table ('40%', '$120 flat', 'exempt'). */
  terms: string;
  /** Where his money comes from: the crew's corners, his own hustle, crew work. */
  kind: 'corners' | 'hustle' | 'work' | 'capo';
}

/** One capo's crew this week. */
export interface CrewLine {
  capoId: string;
  districtId?: string;
  members: MemberLine[];
  due: number;
  paid: number;
  short: number;
  /** His end under his contract. */
  kept: number;
  /** Held back (a slow payer in the winter) — owed, on the books. */
  held: number;
  /** Hidden: what he skimmed off the top. */
  skim: number;
  /** What reached the underboss. */
  remitted: number;
  /** He made good on old arrears this week. */
  late?: number;
  /** Arrears still owed by the crew at the end of the week. */
  arrears: number;
  /** He disputes the assessment this week. */
  disputed?: boolean;
  /** Short last week too. */
  again?: boolean;
  /** The week's real variance on his district (hidden: a genuinely bad week is < 1). */
  v?: number;
}

export interface Split {
  /** Basis points, summing to 10000. */
  personal: number;
  treasury: number;
  reserve: number;
}

export type PetitionKind = 'families' | 'extension' | 'advance' | 'investment' | 'help' | 'legal';

export interface Petition {
  id: string;
  kind: PetitionKind;
  /** Who asks (capo or member). */
  byId: string;
  /** For whom (a member), if different. */
  forId?: string;
  amount: number;
  /** Paid from: the reserve or the treasury. */
  from: 'reserve' | 'treasury';
  text: string;
  /** Hidden: is it what it says it is. */
  honest: boolean;
}

export interface Issue {
  kind: 'short' | 'dispute' | 'legal' | 'tribute' | 'debt' | 'reserve' | 'treasury' | 'late' | 'skim' | 'base' | 'acting' | 'greed';
  text: string;
  amount?: number;
  who?: string;
  severity: 1 | 2 | 3;
}

export interface SourceLine {
  label: string;
  amount: number;
  who?: string;
  src?: string;
}

export type ReportStatus = 'collecting' | 'ready' | 'presented' | 'allocated';

export interface TributeReport {
  id: string;
  week: number;
  status: ReportStatus;
  ubId?: string;
  /** No underboss in the seat: somebody is acting. */
  acting?: boolean;
  ubType: UbType;
  crews: CrewLine[];
  /** Men with no capo pay the underboss directly. */
  direct: MemberLine[];
  /** The ledger lines the envelope becomes (per crew and stream). */
  sources: SourceLine[];
  /** Reached the underboss (sum of remittances). */
  collected: number;
  /** His authorized share. */
  ubShare: number;
  /** Hidden: what he took on top. */
  ubSkim: number;
  /** What he says came in (collected minus what he hid). */
  reported: number;
  /** In the envelope: what is actually there. */
  presented: number;
  lastPresented?: number;
  issues: Issue[];
  petitions: Petition[];
  rec: Split;
  recWhy: string[];
  /** The scene's dialogue (line id + text), from the records. */
  talk: { id: string; text: string }[];
  /** Iid of the audience popup, when it pops. */
  iid?: string;
  alloc?: { split: Split; personal: number; treasury: number; reserve: number; by: 'policy' | 'his' | 'custom' | 'quiet'; week: number; granted: string[]; held?: boolean };
}

export type UbType = 'loyal' | 'ambitious' | 'overwhelmed' | 'acting' | 'none';

export interface UbState {
  id?: string;
  /** His standing among the earners (0-100): grows as he delivers the take. */
  base: number;
  /** Capos who call him first. */
  callsFirst: string[];
  since: number;
  /** Weeks since the Don last held the audience himself. */
  absent: number;
  /** Stage of the succession storyline: 0 none, 1 noticed, 2 half the capos, 3 crisis raised, 4 settled. */
  stage: number;
  /** Disagreements with the Don's split. */
  disagreements: number;
  /** His authorized share (bp). */
  rateBp: number;
  /** Week the Don ignored the crisis (his people organise a few weeks later). */
  refused?: number;
}

export interface TributeDispute {
  id: string;
  week: number;
  capoId: string;
  memberId?: string;
  amount: number;
  /** What he claims. */
  claim: string;
  /** Hidden: the assessment really was wrong. */
  valid: boolean;
  status: 'open' | 'upheld' | 'denied' | 'split' | 'council';
}

/** Standing terms that override a man's usual agreement. */
export interface Terms {
  kind: 'fixed' | 'exempt' | 'extension';
  amount?: number;
  until: number;
  why: string;
}

export interface Investment {
  id: string;
  week: number;
  byId: string;
  what: string;
  amount: number;
  /** Weekly return while it lasts, or 0 if it failed. */
  weekly: number;
  until: number;
  /** Hidden: will it pay. */
  good: boolean;
  status: 'pitched' | 'funded' | 'refused' | 'failed' | 'paid';
}

export interface Beat {
  kind: string;
  week: number;
  who?: string;
  forId?: string;
  amount?: number;
  ref?: string;
  pri: number;
}

export interface WeekBook {
  week: number;
  start: Record<string, number>;
  end: Record<string, number>;
  /** Compact transfers: [from, to, amount, category, note]. */
  x: [string, string, number, TransferCat, string?][];
}

export interface RivalCapo {
  name: string;
  earn: number;
  keepBp: number;
  short: number;
  arrears: number;
  grievance: number;
}

export interface RivalBooks {
  reserve: number;
  personal: number;
  capos: RivalCapo[];
  /** Weeks the treasury and reserve were both empty. */
  dry: number;
  /** Greed of the boss (share he takes personally, bp). */
  greedBp: number;
  last?: { week: number; gross: number; kept: number; short: number; toBoss: number; personal: number; treasury: number; reserve: number };
  insolvent?: number;
  fragments: number;
  /** The boss these books were set up under (a new boss resets his appetite). */
  leaderId?: string;
}

export interface TributeState {
  v: 1;
  rng: number;
  acct: Accounts;
  /** This week's journal (moved into `books` at the end of the week). */
  journal: Transfer[];
  /** The week's starting balances. */
  start?: Record<string, number>;
  startWeek?: number;
  books: WeekBook[];
  reports: TributeReport[];
  policy: Split & { auto: boolean };
  ub: UbState;
  arrears: Record<string, number>;
  /** Why each man's arrears arose (the truth; drives how fast he pays it back). */
  why: Record<string, ShortReason>;
  /** What a capo has covered for one of his men ("capo>man" -> dollars). */
  carry: Record<string, number>;
  /** Average weekly outgoings (costs, tribute, debt), for the recommendation. */
  costAvg: number;
  /** Weekly allowances out of the Don's own money (heir, a widow): id -> weekly dollars. */
  allowances: Record<string, number>;
  /** Event cooldowns for the take's story beats (kind -> week). */
  cool: Record<string, number>;
  /** Weeks the Don put his own money into the family. */
  putIn: number[];
  /** Agreement history: every change of terms or contract, by stable agreement id. */
  agHist: { week: number; id: string; text: string }[];
  /** Arrears forgiven, in total. */
  forgiven: number;
  /** Each capo's contract as last seen (to record changes in the agreement history). */
  lastKeep: Record<string, number>;
  terms: Record<string, Terms>;
  disputes: TributeDispute[];
  investments: Investment[];
  beats: Beat[];
  /** Dialogue lines used lately (no repeats). */
  said: string[];
  /** The Don's personal share, last 12 allocations (bp). */
  greed: number[];
  /** Weeks the Don held the audience himself. */
  held: number[];
  lastCollect: number;
  lastAlloc: number;
  /** Rival families' books. */
  rivals: Record<string, RivalBooks>;
  /** Short history of who was short, by man (week list). */
  shortHist: Record<string, number[]>;
  stats: { audiences: number; quiet: number; shortfalls: number; disputes: number; grievances: number; petitions: number; granted: number; audits: number; caught: number; covers: number; crises: number; insolvencies: number; disagreements: number };
}

export const DEFAULT_POLICY: Split & { auto: boolean } = { personal: 1500, treasury: 7500, reserve: 1000, auto: true };

export function ensureTribute(s: GameState): TributeState {
  if (!s.tribute) {
    s.tribute = {
      v: 1, rng: hashSeed(`${s.seed}:tribute`),
      acct: { personal: 0, reserve: 0, envelope: 0, clearing: 0, crew: {} },
      journal: [], books: [], reports: [], policy: { ...DEFAULT_POLICY },
      ub: { base: 0, callsFirst: [], since: s.week, absent: 0, stage: 0, disagreements: 0, rateBp: 1000 },
      arrears: {}, why: {}, carry: {}, costAvg: 2000, allowances: {}, cool: {}, putIn: [], agHist: [], forgiven: 0, lastKeep: {}, terms: {}, disputes: [], investments: [], beats: [], said: [], greed: [], held: [],
      lastCollect: 0, lastAlloc: 0, rivals: {}, shortHist: {},
      stats: { audiences: 0, quiet: 0, shortfalls: 0, disputes: 0, grievances: 0, petitions: 0, granted: 0, audits: 0, caught: 0, covers: 0, crises: 0, insolvencies: 0, disagreements: 0 },
    };
  }
  return s.tribute;
}

/** All balances, the treasury included (for the books and the reconciliation). */
export function balances(s: GameState): Record<string, number> {
  const t = s.tribute;
  const out: Record<string, number> = { treasury: s.money };
  if (!t) return { ...out, personal: 0, reserve: 0, envelope: 0, clearing: 0 };
  out.personal = t.acct.personal;
  out.reserve = t.acct.reserve;
  out.envelope = t.acct.envelope;
  out.clearing = t.acct.clearing;
  for (const [k, v] of Object.entries(t.acct.crew)) out[`crew:${k}`] = v;
  return out;
}

/** The house's money: treasury + the Don's own + the reserve (+ an envelope not yet split). */
export function houseCash(s: GameState): number {
  const t = s.tribute;
  return s.money + (t ? t.acct.personal + t.acct.reserve + t.acct.envelope : 0);
}

export const sumSplit = (x: Split) => x.personal + x.treasury + x.reserve;

/** Normalise a split to whole basis points summing to 10000 (treasury takes the rounding). */
export function normSplit(x: Partial<Split>): Split {
  const p = Math.max(0, Math.min(10000, Math.round(x.personal ?? 0)));
  const r = Math.max(0, Math.min(10000 - p, Math.round(x.reserve ?? 0)));
  return { personal: p, reserve: r, treasury: 10000 - p - r };
}

export const pctOf = (bp: number) => Math.round(bp / 100);
export const splitText = (x: Split) => `${pctOf(x.personal)}% you · ${pctOf(x.treasury)}% family · ${pctOf(x.reserve)}% reserve`;
