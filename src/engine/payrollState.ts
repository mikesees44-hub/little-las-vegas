import type { GameState } from './types';

/**
 * THE CIVILIAN PAYROLL (state): the people outside the Family who draw an
 * envelope from the boss. Not made, not sworn: a barber, a cook, a card-game
 * attendant, a cop, a clerk, a made man's wife, a wife on the quiet payroll.
 *
 * Only the hires this layer makes itself live here. People already on another
 * system's payroll stay where they are and are READ from there (payroll.ts
 * payrollRoster): the nightlife's women and madams (nightlife.ts), the pad at
 * City Hall (polState Ctl.payroll), the no-show jobs (econ.jobs), the outside
 * guys hung off a capo (hierarchy.ts). One view, no second ledger.
 *
 * Lives on `GameState.payroll`, optional: a fresh game has none, the first
 * hire makes it. Rolls are hashes of (seed, week, purpose): never `s.rng`.
 */

export type PayJob =
  | 'barber' | 'cook' | 'attendant' | 'parking' | 'bartender' | 'driver' | 'clerk' | 'bookkeeper'
  | 'cop' | 'politician' | 'wife' | 'girl' | 'madam' | 'bookie' | 'runner' | 'fence' | 'hush' | 'celebrity' | 'dancer';

export interface JobInfo {
  label: string;
  /** Plural, for the crew screen's groups. */
  group: string;
  /** What the job is, in a line. */
  blurb: string;
  /** Weekly wage (0: she keeps her share and kicks back instead). */
  wage: number;
  /** Weekly money it brings in (in season; less off it). */
  money: number;
  /** How well they hear things (0-3): a source of warnings (threats.ts). */
  ears: number;
  /** Heat it takes off a month (an alibi, a car moved, the right drawer). */
  cover: number;
  /** The bar the cover cools. */
  coverBar?: 'local' | 'federal';
  /** Favors at City Hall (a vote at the ward meeting), one every so many weeks. */
  votes: number;
  /** Tip-offs about raids (cops). */
  tips: number;
  /** Base risk 0-100: how exposed the job is (the law, the other side). */
  risk: number;
  /** Adult work: hidden when Mature content is Off. */
  mature?: boolean;
  /** Respect a month, of being seen with them (celebrities). */
  respect?: number;
  /** Bad press: the chance a month the papers make something of it (federal heat, Kefauver-style). */
  press?: number;
  /** Who it suits. */
  who: 'any' | 'man' | 'woman' | 'cop' | 'pol' | 'wife' | 'night' | 'madam' | 'kin';
}

export const JOBS: Record<PayJob, JobInfo> = {
  barber: { label: 'Barber', group: 'Barbers', blurb: 'Takes a little action from the back chair and hears the whole street', wage: 40, money: 60, ears: 1, cover: 0, votes: 0, tips: 0, risk: 10, who: 'man' },
  cook: { label: 'Cook', group: 'Cooks', blurb: 'Feeds the card games and hears the dining room', wage: 45, money: 30, ears: 2, cover: 0, votes: 0, tips: 0, risk: 8, who: 'any' },
  attendant: { label: 'Card-game attendant', group: 'Card-game attendants', blurb: 'Runs the room at the Thursday game: the chips, the coffee, the house cut', wage: 50, money: 110, ears: 1, cover: 0, votes: 0, tips: 0, risk: 20, who: 'any' },
  parking: { label: 'Parking attendant', group: 'Parking attendants', blurb: 'Watches the lot, who comes and who goes, and moves a car when asked', wage: 35, money: 40, ears: 1, cover: 1, votes: 0, tips: 0, risk: 10, who: 'man' },
  bartender: { label: 'Bartender', group: 'Bartenders', blurb: 'Pours short for the right people and listens to everybody', wage: 45, money: 50, ears: 2, cover: 0, votes: 0, tips: 0, risk: 12, who: 'any' },
  driver: { label: 'Driver', group: 'Drivers', blurb: 'Drives the back way and never saw a thing', wage: 55, money: 0, ears: 1, cover: 2, votes: 0, tips: 0, risk: 15, who: 'man' },
  clerk: { label: 'Clerk', group: 'Clerks', blurb: 'Files things in the right drawer at the county; a vote at the ward meeting', wage: 40, money: 0, ears: 1, cover: 1, votes: 1, tips: 0, risk: 10, who: 'any' },
  bookkeeper: { label: 'Bookkeeper', group: 'Bookkeepers', blurb: 'Keeps two sets of books; the IRS sees the clean one', wage: 60, money: 0, ears: 0, cover: 2, coverBar: 'federal', votes: 0, tips: 0, risk: 22, who: 'any' },
  cop: { label: 'Cop on the pad', group: 'Cops on the pad', blurb: 'A word before the county moves, and a report that gets lost', wage: 75, money: 0, ears: 1, cover: 2, votes: 0, tips: 3, risk: 30, who: 'cop' },
  politician: { label: 'Politician on the pad', group: 'Politicians on the pad', blurb: 'His vote, his phone calls, his signature', wage: 100, money: 0, ears: 1, cover: 1, votes: 2, tips: 0, risk: 25, who: 'pol' },
  wife: { label: 'A made man\'s wife', group: 'The wives\' table', blurb: 'Runs the wives\' table at the social club and hears everything at the christenings', wage: 30, money: 0, ears: 2, cover: 1, votes: 0, tips: 0, risk: 8, who: 'wife' },
  girl: { label: 'Working girl', group: 'Working girls', blurb: 'Works for herself, keeps her share, kicks back a cut for the protection; quits any time', wage: 0, money: 0, ears: 1, cover: 0, votes: 0, tips: 0, risk: 25, mature: true, who: 'night' },
  dancer: { label: 'Dancer', group: 'Dancers', blurb: 'Dances at the clubs, keeps her share, kicks back a cut for the protection; quits any time', wage: 0, money: 0, ears: 1, cover: 0, votes: 0, tips: 0, risk: 15, mature: true, who: 'night' },
  madam: { label: 'Madam / house manager', group: 'Madams & house managers', blurb: 'Runs her own house; pays for the Family\'s protection', wage: 0, money: 0, ears: 2, cover: 0, votes: 0, tips: 0, risk: 30, mature: true, who: 'madam' },
  bookie: { label: 'Bookie', group: 'Bookies', blurb: 'Takes action on the horses and the fights; the Family takes its end', wage: 50, money: 140, ears: 1, cover: 0, votes: 0, tips: 0, risk: 25, who: 'any' },
  runner: { label: 'Numbers runner', group: 'Numbers runners', blurb: 'Carries the slips up the avenue every afternoon', wage: 30, money: 80, ears: 1, cover: 0, votes: 0, tips: 0, risk: 20, who: 'any' },
  fence: { label: 'Fence', group: 'Fences', blurb: 'Moves whatever fell off a truck', wage: 40, money: 100, ears: 0, cover: 0, votes: 0, tips: 0, risk: 25, who: 'man' },
  celebrity: { label: 'Friend of the family', group: 'Celebrities', blurb: 'A retainer: appearances at your club, a favor owed, an introduction to people in power', wage: 150, money: 0, ears: 0, cover: 0, votes: 1, tips: 0, risk: 15, respect: 1, press: 0.2, who: 'any' },
  hush: { label: 'Quiet envelope', group: 'Quiet envelopes', blurb: 'A wife (or a close relative) who tells you what her husband\'s side knows and plans. Nobody else knows', wage: 60, money: 0, ears: 0, cover: 0, votes: 0, tips: 0, risk: 20, who: 'kin' },
};

export const JOB_ORDER: PayJob[] = ['hush', 'celebrity', 'girl', 'dancer', 'madam', 'cop', 'politician', 'bookie', 'attendant', 'runner', 'fence', 'bartender', 'barber', 'cook', 'parking', 'driver', 'clerk', 'bookkeeper', 'wife'];

/** The quiet envelope's own record: who she reports on, and how good she is at it. */
export interface Hush {
  /** The man she reports on (her husband, father, brother). */
  on: string;
  /** What he is to her ("husband", "father", "brother"). */
  rel: string;
  /** How much of his business reaches her, 0-100. */
  access: number;
  /** How close they are, 0-100 (an unhappy marriage tells less, and notices less). */
  close: number;
  /** Her nerve, 0-100. */
  nerve: number;
  /** The suspicion building up at home, 0-100 (the chance he finds out grows with it). */
  heat: number;
  /** He found out (week): the boss's decision is waiting. */
  found?: number;
}

export interface Hire {
  id: string;
  job: PayJob;
  wage: number;
  since: number;
  /** Loyalty to the boss, 0-100. */
  loyalty: number;
  /** How much they know about the Family's business, 0-100 (grows every week). */
  knows: number;
  /** Weeks in a row the envelope did not come. */
  unpaid: number;
  /** The wage was cut (week): they remember. */
  squeezed?: number;
  /** Came on as the price of a favor (they owed the boss). */
  fav?: 1;
  paid: number;
  /** What they brought in, all told. */
  made: number;
  hush?: Hush;
  /** A celebrity's world record ('pol:<id>' or 'lin:<id>'). */
  ref?: string;
}

export type Conf = 'confirmed' | 'likely' | 'rumor';

/** One thing a quiet envelope brought in. `truth` is hidden from the boss (the brief only shows `conf`). */
export interface HushItem {
  id: string;
  week: number;
  /** Who told it (the wife's id) and about whom (her husband). */
  from: string;
  on: string;
  kind: 'plan' | 'raid' | 'grievance' | 'plot' | 'informant' | 'books' | 'secret' | 'war' | 'vote';
  text: string;
  conf: Conf;
  truth: 'solid' | 'garbled' | 'false';
  /** A tip it became (threats.ts), a secret it revealed. */
  tip?: string;
  secret?: string;
}

export interface PayrollState {
  v: 1;
  hires: Record<string, Hire>;
  /** The main earner (any payroll: this one, the nightlife's, City Hall's). */
  main?: string;
  intel: HushItem[];
  /** Hires who left, and why (most recent last, capped). */
  gone: { id: string; job: PayJob; week: number; why: string }[];
  log: [number, string][];
  stats: { hired: number; refused: number; quit: number; fired: number; caught: number; flipped: number; items: number; found: number; wages: number; yield: number };
  n: number;
}

export function blankPayroll(): PayrollState {
  return { v: 1, hires: {}, intel: [], gone: [], log: [], stats: { hired: 0, refused: 0, quit: 0, fired: 0, caught: 0, flipped: 0, items: 0, found: 0, wages: 0, yield: 0 }, n: 0 };
}

/** The state (made with the first hire). */
export function ensurePayroll(s: GameState): PayrollState {
  if (!s.payroll) s.payroll = blankPayroll();
  const P = s.payroll;
  P.hires ??= {};
  P.intel ??= [];
  P.gone ??= [];
  P.log ??= [];
  P.n ??= 0;
  return P;
}

/** How much the offer is: below what they expect, fair, generous, or whatever they ask. */
export type PayLevel = 'low' | 'fair' | 'generous' | 'top';
export const PAY_LEVELS: PayLevel[] = ['low', 'fair', 'generous', 'top'];
export const PAY_INFO: Record<PayLevel, { label: string; mult: number; odds: number }> = {
  low: { label: 'Low', mult: 0.75, odds: -10 },
  fair: { label: 'Fair', mult: 1, odds: 0 },
  generous: { label: 'Generous', mult: 1.5, odds: 12 },
  top: { label: 'Name your price', mult: 2.25, odds: 20 },
};

/** Orders (the PlayerAction). `via`: the man who makes the offer (absent: the boss in person). */
export type PayrollAction =
  | { op: 'hire'; id: string; job: PayJob; pay?: PayLevel; via?: string }
  | { op: 'fire'; id: string }
  | { op: 'raise'; id: string; amount: number }
  | { op: 'main'; id: string }
  /** A star who has no engine body yet (a world-pack entertainer, a showbiz house's head): 'pol:<id>' or 'lin:<id>'. */
  | { op: 'star'; ref: string; pay?: PayLevel; via?: string };

/** Effect ops. */
export type PayOp =
  | { op: 'hire'; id: string; job: PayJob; wage: number; fav?: 1; sign?: number }
  | { op: 'refused'; id: string; job: PayJob }
  | { op: 'fire'; id: string }
  | { op: 'raise'; id: string; amount: number }
  | { op: 'main'; id: string }
  | { op: 'star'; ref: string; wage: number }
  /** "I'll do it, and in return you work for me": rolled when the favor is granted. `name` makes a person of a petitioner who was only a name. */
  | { op: 'favor'; id?: string; name?: string; f?: 1; job: PayJob; chance: number; key: string }
  /** He found out about the quiet envelope: the boss's answer. */
  | { op: 'protect'; id: string; how: 'move' | 'relocate' | 'deny'; chance?: number };

/** The people on this payroll who hear things (threats.ts reads them as sources of warnings). */
export function payrollEars(s: GameState): { id: string; job: PayJob; ears: number; loyalty: number }[] {
  const P = s.payroll;
  if (!P) return [];
  const out: { id: string; job: PayJob; ears: number; loyalty: number }[] = [];
  for (const h of Object.values(P.hires)) {
    const c = s.characters[h.id];
    const e = JOBS[h.job].ears + JOBS[h.job].tips;
    if (!c?.alive || !e || h.hush || (c.imprisonedUntil ?? 0) > s.week) continue;
    out.push({ id: h.id, job: h.job, ears: e, loyalty: h.loyalty });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
}
