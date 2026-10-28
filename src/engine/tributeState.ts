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
  | 'assistance'
  /** A man keeps his own end of his hustle (his pocket). */
  | 'member_keep';

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
  /** His capo covered this much of it out of his own pocket (included in `paid`). */
  carried?: number;
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
  /** Where his money comes from: the crew's corners, his own hustle, crew work, his own spot (kickup.ts). */
  kind: 'corners' | 'hustle' | 'work' | 'capo' | 'spot';
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
  /** Last week's count carried into this one, and investment returns: the parts of `collected` no man kicked up. */
  carry?: number;
  inv?: number;
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

/**
 * A fact told three ways: what really happened, what was said about it, and
 * what each person believes (by character id), plus who knows the truth.
 * The weekly take uses it for favors; shortfalls keep the same split on
 * MemberLine (truth / said / believed-by-the-underboss / revealed-to-the-Don).
 * Reusable for meetings and promises (a shadow court).
 */
export interface Telling<T> {
  truth: T;
  said?: T;
  believed?: Record<string, T>;
  /** Character ids who know the truth (the Don's id when he has learned it). */
  knownBy: string[];
}

/** How far the underboss may decide money matters on his own (a shadow court can raise it). */
export type UbAuthority = 'routine' | 'operational' | 'executive' | 'acting' | 'shadow';

export type FavorKind = 'extension' | 'forgive' | 'cover' | 'carry' | 'assistance' | 'advance' | 'protect' | 'refund' | 'allowance' | 'contract';

/**
 * A favor: who helped whom, with what, on whose authority, and who knows.
 * Persistent relationship records (patronage), not just numbers: the
 * underboss's base among the earners is built out of these.
 */
export interface Favor {
  id: string;
  week: number;
  /** Who did it (the Don, the underboss, a capo). */
  byId: string;
  toId: string;
  kind: FavorKind;
  amount: number;
  /** On whose authority: the Don's order, the underboss's delegated routine authority, or nobody's. */
  authority: 'don' | 'delegated' | 'unauthorized';
  /** What it really was, and who knows (the Don may not). */
  tell: Telling<string>;
}

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
  /** What he may decide on his own. */
  authority?: UbAuthority;
  /** His patronage book: whom he helped, how often, how much, and what the Don never heard (underboss.ts). */
  helped?: Record<string, import('./underboss').HelpedRecord>;
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
  /** Hidden transfers (skims, pocketed dues): the truth, kept for the reconciliation; never shown to the Don. */
  hx?: [string, string, number, TransferCat][];
  /** Older than 8 weeks: only transfers touching the family's own accounts are kept. */
  slim?: 1;
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
  /** Patronage: every favor done with the family's money or authority (last 120). */
  favors: Favor[];
  /** Petitions received, by who received them (the Don, the underboss, a capo). */
  petitionsTo: Record<string, number>;
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
  /** The men's own money: the last weeks of each man's purse, and his lifetime (crewPurse.ts). */
  purse?: Record<string, import('./crewPurse').PurseWeek[]>;
  life?: Record<string, import('./crewPurse').PurseLife>;
  /** Each underboss's career goal, chosen once (underboss.ts). */
  ubGoals?: Record<string, import('./underboss').UbGoal>;
  /** Every man who carried the envelope, and how it ended. */
  ubHist?: import('./underboss').UbRecord[];
  /** Money grievances opened by the take (ids in the power layer's grievance list). */
  moneyGrievances?: string[];
  /** 2 = the two-pot money model (the reserve folded into the Family). Older saves lack it until money.ts migrates them. */
  pots?: 2;
  /** Weeks the boss dipped into the Family for himself (draws, short purchases): pocket.ts. */
  dips?: number[];
  /** The bigger-pocket pass moved a boss still on the old 25% default to the new 40% (once). */
  cut40?: 1;
  /** The week the boss ordered "Squeeze harder this week" (one global lever, money.ts). */
  squeeze?: number;
  /** The money trend: each of the last 12 weeks' money in, money out, and the two pots (money.ts recordMoneyWeek). */
  flow?: import('./money').MoneyWeek[];
  /** Short history of who was short, by man (week list). */
  shortHist: Record<string, number[]>;
  stats: { audiences: number; quiet: number; shortfalls: number; disputes: number; grievances: number; petitions: number; granted: number; audits: number; caught: number; covers: number; crises: number; insolvencies: number; disagreements: number };
}

/**
 * Two pots (money.ts): the Family (the treasury, with an optional "set aside" line — the old reserve) and
 * Your Pocket (personal). The envelope split is one control, your cut; set-aside starts at 0%.
 */
export const DEFAULT_POLICY: Split & { auto: boolean } = { personal: 4000, treasury: 6000, reserve: 0, auto: true };

export function ensureTribute(s: GameState): TributeState {
  const fresh = (): TributeState => ({
      v: 1, rng: hashSeed(`${s.seed}:tribute`),
      acct: { personal: 0, reserve: 0, envelope: 0, clearing: 0, crew: {} },
      journal: [], books: [], reports: [], policy: { ...DEFAULT_POLICY },
      ub: { base: 0, callsFirst: [], since: s.week, absent: 0, stage: 0, disagreements: 0, rateBp: 1000 },
      arrears: {}, why: {}, carry: {}, costAvg: 2000, allowances: {}, cool: {}, putIn: [], agHist: [], forgiven: 0, favors: [], petitionsTo: {}, lastKeep: {}, terms: {}, disputes: [], investments: [], beats: [], said: [], greed: [], held: [],
      lastCollect: 0, lastAlloc: 0, rivals: {}, shortHist: {}, purse: {}, life: {}, moneyGrievances: [],
      stats: { audiences: 0, quiet: 0, shortfalls: 0, disputes: 0, grievances: 0, petitions: 0, granted: 0, audits: 0, caught: 0, covers: 0, crises: 0, insolvencies: 0, disagreements: 0 },
    });
  // A new game starts on the two pots; an older save is moved over by money.ts (twoPots) inside its next week.
  if (!s.tribute) { s.tribute = { ...fresh(), pots: 2, cut40: 1 }; return s.tribute; }
  // Save migration: a save from an older build gets whatever fields it lacks (never overwriting what it has).
  const t = s.tribute as unknown as Record<string, unknown>;
  const d = fresh() as unknown as Record<string, unknown>;
  for (const k of Object.keys(d)) {
    if (t[k] === undefined) t[k] = d[k];
    else if (k === 'stats' || k === 'ub' || k === 'acct') {
      const tv = t[k] as Record<string, unknown>, dv = d[k] as Record<string, unknown>;
      for (const kk of Object.keys(dv)) if (tv[kk] === undefined) tv[kk] = dv[kk];
    }
  }
  return s.tribute;
}

/** The new boss's own money on day one: $100,000 of his own (the user's call, 2026-10-27). */
export const BOSS_START_POCKET = 100_000;
export function startPocket(s: GameState): void {
  const notBoss = s.flags?.start_associate || s.flags?.start_soldier || s.flags?.start_capo;
  ensureTribute(s).acct.personal = notBoss ? Math.min(3000, Math.round((Math.max(0, s.money) * 0.12) / 100) * 100) : BOSS_START_POCKET;
  s.flags[POCKET_TOPUP_FLAG] = 1;
}

/** A save from before the $100,000 boss start gets it once (the user's call, 2026-10-27): the boss's pocket is raised to at least $100,000. */
export const POCKET_TOPUP_FLAG = 'pocket_topup_100k';
export function topUpOldPocket(s: GameState): void {
  if (s.flags?.[POCKET_TOPUP_FLAG] || !s.tribute) return;
  s.flags[POCKET_TOPUP_FLAG] = 1;
  const boss = s.characters[s.playerId];
  if (!boss || boss.rank !== 'boss') return;
  s.tribute.acct.personal = Math.max(s.tribute.acct.personal ?? 0, BOSS_START_POCKET);
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
export const splitText = (x: Split) => `your cut ${pctOf(x.personal)}% · the Family ${pctOf(x.treasury + x.reserve)}%${x.reserve ? ` (${pctOf(x.reserve)}% kept for lawyers & emergencies)` : ''}`;

/** The Family's money: the treasury plus what is set aside for lawyers & emergencies (the old reserve). */
export function familyCash(s: GameState): number {
  return Math.round(s.money + (s.tribute?.acct.reserve ?? 0));
}

/** Your Pocket: the boss's own money. */
export function pocketCash(s: GameState): number {
  return s.tribute?.acct.personal ?? 0;
}

/** Record a favor (patronage). Returns it. */
export function noteFavor(s: GameState, f: Omit<Favor, 'id' | 'week' | 'tell'> & { truth?: string; knownBy?: string[] }): Favor {
  const t = ensureTribute(s);
  const fav: Favor = {
    id: `fv${s.week}_${t.favors.length}_${f.toId}`, week: s.week, byId: f.byId, toId: f.toId, kind: f.kind, amount: Math.round(f.amount), authority: f.authority,
    tell: { truth: f.truth ?? f.kind, knownBy: Array.from(new Set([f.byId, f.toId, ...(f.knownBy ?? [])])) },
  };
  t.favors.push(fav);
  // The sitting underboss's patronage book (persistent, uncapped by the favor list).
  if (t.ub.id && fav.byId === t.ub.id) {
    t.ub.helped ??= {};
    const h = (t.ub.helped[fav.toId] ??= { n: 0, amount: 0, last: fav.week, unknownToDon: 0 });
    h.n++;
    h.amount += fav.amount;
    h.last = fav.week;
    if (!fav.tell.knownBy.includes(s.playerId)) h.unknownToDon++;
  }
  if (t.favors.length > 120) t.favors = t.favors.slice(-120);
  return fav;
}

/** Favors a man has received, by giver (who he owes). */
export function favorsTo(s: GameState, toId: string): Favor[] {
  return (s.tribute?.favors ?? []).filter((f) => f.toId === toId);
}
