import { hashSeed } from './rng';
import type { GameState } from './types';

/**
 * WOMEN (state): the adult women of the game as lives of their own, on top
 * of the nightlife cast (nightlife*.ts) and the rest of the world.
 *
 *  - Arcs: a working woman's life aim (fame, security, her own house, out of
 *    the life, pictures, money), set by her age and her own ambition and
 *    changed by what happens; her working conditions and take-home pay. She
 *    can quit anything at any time.
 *  - Requests: wives and girlfriends of your men (and other women you know)
 *    come to the office for rent, groceries, a doctor, a business. Help is
 *    never conditional on anything else.
 *  - Affairs: the boss and an adult woman (anyone's wife, or nobody's), CK3
 *    style, every step her decision: a dinner, an affair, nights in a place
 *    she agrees to, gifts, her feelings and her guilt, who finds out and how,
 *    her husband's reaction, her ending it; women who proposition the boss.
 *  - Pregnancy (cumulative over nights), talent careers through the boss's
 *    company, hooks (one use; they expire; they die with the boss), and a
 *    woman the boss mistreats growing close to another of his made men.
 *
 * HARD RULES (women.ts checks them at every list, preview, commit and week):
 * adults only on the day; nobody is owned, traded or given; help is never
 * conditional on intimacy; a no is final for that ask and repeating it never
 * overrides it; hooks never buy intimacy; non-explicit one-line reports that
 * fade; the mature-content setting Off hides all of it; nobody here is real.
 *
 * Lives on `GameState.women` (optional; created the first week) and rolls on
 * its own stream or hashes of (seed, week, purpose). Every list is capped.
 */

/** Hours on the boss's day clock for each order (merged into timeCost.ts as 'women:<op>'). */
export const WOMEN_HOURS: Record<'askOut' | 'pursue' | 'night' | 'gift' | 'arrange' | 'end' | 'sign' | 'hook' | 'amends', number> = {
  askOut: 3, pursue: 2, night: 3, gift: 0.5, arrange: 1, end: 1, sign: 2, hook: 1, amends: 1,
};

export type Ambition = 'fame' | 'security' | 'madam' | 'retire' | 'films' | 'money';

export const AMBITION_TEXT: Record<Ambition, string> = {
  fame: 'Be somebody: modeling, the pictures, a record',
  security: 'A man who takes care of her, a family, a home',
  madam: 'Run a house of her own',
  retire: 'Get out of the life with something put by',
  films: 'Pictures, on her own terms',
  money: 'The money, while it lasts',
};

export type Dream = 'model' | 'act' | 'sing';
export const DREAM_TEXT: Record<Dream, string> = { model: 'modeling', act: 'acting', sing: 'singing' };

/** Where she works, roughly (her tier on the island). */
export type Tier = 'high' | 'club' | 'call' | 'street' | 'other';
export const TIER_TEXT: Record<Tier, string> = { high: 'the high end', club: 'the big clubs', call: 'by telephone', street: 'the street', other: 'not in the trade' };

export interface Arc {
  amb: Ambition;
  dream?: Dream;
  /** Week the aim was set (or last changed). */
  set: number;
  /** Working conditions 0-100 (her house, the heat, how she is treated, the cut). */
  cond: number;
  /** What she keeps of a week's work, roughly. */
  pay: number;
  /** Career steps taken (an audition, a bigger club, her own house). */
  steps: number;
  /** She walked away from a payroll or a house (week). */
  quit?: number;
}

/** Where an intimate evening happens: the boss proposes, she agrees, suggests another, or declines. */
export type Setting = 'office' | 'car' | 'herplace' | 'hotel' | 'grand';
export const SETTING_INFO: Record<Setting, { label: string; cost: number; expose: number; text: string }> = {
  office: { label: 'Your office at the club', cost: 0, expose: 0.18, text: 'Free and close. The staff notice who goes up the back stairs.' },
  car: { label: 'Your car, somewhere quiet', cost: 0, expose: 0.12, text: 'Cramped, quick, and a patrolman can shine a light in.' },
  herplace: { label: 'Her place', cost: 0, expose: 0.2, text: 'Her home, her neighbors, her husband\'s things on the hall table.' },
  hotel: { label: 'A motel on the Boulevard', cost: 40, expose: 0.08, text: 'A night clerk who has seen everything and says nothing, mostly.' },
  grand: { label: 'A suite at a grand hotel', cost: 260, expose: 0.1, text: 'Room service, a view of the ocean, and a staff who know your face.' },
};
export const SETTINGS: Setting[] = ['office', 'car', 'herplace', 'hotel', 'grand'];

export type AffairStage = 'interest' | 'dating' | 'affair' | 'ended';
export const STAGE_TEXT: Record<AffairStage, string> = { interest: 'Some interest', dating: 'Seeing each other (dinners)', affair: 'An affair', ended: 'Over' };

/** Why she propositioned the boss (her motive, as far as he can read it). */
export type Motive = 'goodlife' | 'power' | 'protection' | 'love';
export const MOTIVE_TEXT: Record<Motive, string> = { goodlife: 'the good life', power: 'being near power', protection: 'protection', love: 'she likes you' };

/** Who knows about the affair, and how they learned it. */
export interface Know { w: string; how: 'witness' | 'gossip' | 'spout' | 'guard' | 'told' | 'husband'; week: number }

export interface Affair {
  /** Her character id. */
  id: string;
  /** The boss it is with (a new boss inherits nothing: it ends). */
  with: string;
  stage: AffairStage;
  since: number;
  /** Her affection for the boss 0-100 (gifts, time, money, intimacy; diminishing returns). */
  aff: number;
  /** Her guilt 0-100 (her husband, his place in your crew, her faith). */
  guilt: number;
  /** Her fear of being found out 0-100. */
  fear: number;
  /** Intimate nights together (total). */
  n: number;
  /** Weeks of the last few nights (capped). */
  nights: number[];
  dinners: number;
  gifts: number;
  lastGift?: number;
  /** Last time together (a dinner or a night). */
  last?: number;
  /** Weeks she said no (capped): each no is respected; two closes the door. */
  refused: number[];
  /** She closed the door (week): nothing more to ask unless she opens it again. */
  closed?: number;
  ended?: { week: number; by: 'her' | 'boss' | 'husband'; why: string };
  /** She said the next night is the last (week). */
  last1?: number;
  known: Know[];
  /** Her husband found out (week) and what he did. */
  husbandKnew?: number;
  reaction?: string;
  /** She came to the boss first, and why. */
  initiated?: Motive;
  /** A voluntary weekly arrangement she agreed to (her terms, ends whenever she says). */
  arrangement?: { weekly: number; since: number };
  /** A pregnancy began (the romance record's id), the week, and whether she has told the boss. */
  preg?: string;
  pregWeek?: number;
  told?: number;
  /** The boss acknowledged the child (public). */
  ack?: boolean;
  /** "I want something real": the boss said he would make time (until week). */
  promised?: number;
}

export type ReqWhy = 'rent' | 'groceries' | 'doctor' | 'business' | 'inside' | 'funeral';
export const REQ_TEXT: Record<ReqWhy, string> = {
  rent: 'two months behind on the rent', groceries: 'groceries until the end of the month', doctor: 'a doctor for one of the kids',
  business: 'a start on a little business of her own', inside: 'the household while her husband is inside', funeral: 'her mother\'s funeral',
};

export interface Req {
  id: string;
  who: string;
  /** Her husband or fella (one of your men, usually). */
  man?: string;
  why: ReqWhy;
  amount: number;
  week: number;
  status: 'open' | 'paid' | 'family' | 'job' | 'declined' | 'lapsed';
}

export type HookBasis = 'past' | 'affair' | 'child' | 'secret';
export const BASIS_TEXT: Record<HookBasis, string> = {
  past: 'what she did before she was somebody', affair: 'an affair she would not want known', child: 'a child\'s real father', secret: 'something she told you once',
};

/** CK3-style: weak influence over one person; used once; expires; dies with the holder. */
export interface Hook {
  id: string;
  holder: string;
  target: string;
  basis: HookBasis;
  made: number;
  expires: number;
  status: 'active' | 'used' | 'expired' | 'void';
  used?: { week: number; how: 'favor' | 'rumor' };
  why?: string;
}

/** She signed with the boss's company (a label, an agency, a picture outfit). */
export interface Talent { kind: 'actress' | 'singer' | 'celebrity'; since: number; fame: number; left?: number; why?: string }

/** A woman the boss mistreated grew close to another of his made men. */
export interface Close { man: string; since: number; level: number; known?: number; why: string; warned?: number }

/** A husband's slow answer: he goes to a rival, to the cops, or comes for the boss. */
export interface Plot { man: string; her: string; since: number; kind: 'revenge' | 'cops' | 'rival'; due: number; done?: number }

/** Dossier choices the player made (appearance descriptors, independent of each other). */
export interface DescOverride { tier?: string; body?: string; figure?: string; bust?: string; hair?: string; eyes?: string; style?: string; mark?: string; type?: string }

export interface WomenState {
  v: 1;
  rng: number;
  arcs: Record<string, Arc>;
  affairs: Record<string, Affair>;
  reqs: Req[];
  hooks: Hook[];
  talent: Record<string, Talent>;
  close: Record<string, Close>;
  plots: Plot[];
  /** Cooldowns (key -> week). */
  cool: Record<string, number>;
  looks: Record<string, DescOverride>;
  log: [number, string][];
  stats: { asked: number; refused: number; nights: number; ended: number; found: number; reqs: number; helped: number; props: number; preg: number; hooks: number; hooksUsed: number; quit: number; close: number };
}

export function emptyWomenStats(): WomenState['stats'] {
  return { asked: 0, refused: 0, nights: 0, ended: 0, found: 0, reqs: 0, helped: 0, props: 0, preg: 0, hooks: 0, hooksUsed: 0, quit: 0, close: 0 };
}

export function blankWomen(s: GameState): WomenState {
  return { v: 1, rng: hashSeed(`${s.seed}:women`), arcs: {}, affairs: {}, reqs: [], hooks: [], talent: {}, close: {}, plots: [], cool: {}, looks: {}, log: [], stats: emptyWomenStats() };
}

/** The state (created lazily; old saves get it the first week). */
export function ensureWomen(s: GameState): WomenState {
  if (!s.women) s.women = blankWomen(s);
  const W = s.women;
  W.arcs ??= {};
  W.affairs ??= {};
  W.reqs ??= [];
  W.hooks ??= [];
  W.talent ??= {};
  W.close ??= {};
  W.plots ??= [];
  W.cool ??= {};
  W.looks ??= {};
  W.log ??= [];
  W.stats = { ...emptyWomenStats(), ...(W.stats ?? {}) };
  return W;
}

/** Peek without creating (safe in render). */
export function womenOf(s: GameState): WomenState | undefined {
  return s.women;
}
