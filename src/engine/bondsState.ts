import type { GameState } from './types';

/**
 * YOUR PEOPLE (state). The deep relationship layer over the opinion system:
 * relations.ts keeps what one person thinks of another as named modifiers;
 * this keeps, for the people closest to the boss (his wife, his goomars and
 * lovers, his kids, his friends, his capos, his enemies), what an opinion
 * number cannot hold: several feelings at once (axes), what happened between
 * them (memories they bring up later), where the relationship stands (a
 * stage), and the flags of the long stories (her suspicion, an ultimatum, a
 * loan, a confidant who knows too much, the man who stood godfather).
 *
 * Rules (enforced in bonds.ts at every preview, commit and week): adults
 * only for anything romantic; nothing explicit (evenings fade to the
 * morning); she or he always decides (an acceptance the player sees before
 * he commits); no coercion, nobody is traded. Nobody here is real.
 *
 * Lives on `GameState.bonds` (optional: made by the first week that needs
 * it; upgradeSave only tops up a save that already has it). Every roll is a
 * hash of (seed, week, purpose, id): no stream of its own to drift.
 */

/** Who this person is to the boss. */
export type BondRole = 'wife' | 'goomar' | 'lover' | 'kid' | 'friend' | 'crew' | 'rival';

export const ROLE_LABEL: Record<BondRole, string> = {
  wife: 'Your wife', goomar: 'Your goomar', lover: 'Seeing you', kid: 'Your child', friend: 'A friend', crew: 'Your crew', rival: 'An enemy',
};

/** Feelings toward the boss, each 0-100. */
export interface Axes {
  /** Affection: warmth, love, liking. */
  aff: number;
  /** Trust: does he believe you, would he cover for you. */
  trust: number;
  /** Respect: does he think you are a man of your word, a boss worth following. */
  respect: number;
  /** Fear. */
  fear: number;
  /** Attraction (romantic ties only). */
  attr?: number;
  /** Resentment: what has piled up and not been forgiven. */
  resent: number;
}

export type AxisKey = keyof Axes;
export const AXIS_LABEL: Record<AxisKey, string> = { aff: 'Affection', trust: 'Trust', respect: 'Respect', fear: 'Fear', attr: 'Attraction', resent: 'Resentment' };

export type WifeStage = 'newlywed' | 'solid' | 'strained' | 'cold' | 'separated';
export type GoomarStage = 'fling' | 'kept' | 'serious' | 'ultimatum' | 'ended';
export type FriendStage = 'acquaintance' | 'friend' | 'best' | 'compare';
export type RivalStage = 'grudge' | 'enemy' | 'nemesis';
export type KidStage = 'close' | 'fine' | 'distant';
export type BondStage = WifeStage | GoomarStage | FriendStage | RivalStage | KidStage;

export const STAGE_TEXT: Record<BondStage, string> = {
  newlywed: 'Newlyweds', solid: 'Solid', strained: 'Strained', cold: 'Cold', separated: 'Separated',
  fling: 'A fling', kept: 'Kept', serious: 'Serious', ultimatum: 'Ultimatum', ended: 'Over',
  acquaintance: 'Acquaintance', friend: 'Friend', best: 'Best friend', compare: 'Compare (godfather)',
  grudge: 'A grudge', enemy: 'Enemy', nemesis: 'Nemesis',
  close: 'Close', fine: 'Fine', distant: 'Distant',
};

export const STAGE_TONE: Record<BondStage, 'good' | 'warn' | 'bad' | 'neutral'> = {
  newlywed: 'good', solid: 'good', strained: 'warn', cold: 'bad', separated: 'bad',
  fling: 'neutral', kept: 'neutral', serious: 'good', ultimatum: 'warn', ended: 'bad',
  acquaintance: 'neutral', friend: 'good', best: 'good', compare: 'good',
  grudge: 'warn', enemy: 'bad', nemesis: 'bad',
  close: 'good', fine: 'neutral', distant: 'warn',
};

/** What happened between them (brought up later). */
export type MemKind =
  | 'anniversary' | 'missedAnniv' | 'date' | 'fight' | 'apology' | 'gift' | 'favor' | 'betrayal' | 'lie' | 'confess'
  | 'vacation' | 'kids' | 'ambition' | 'neglect' | 'questions' | 'found' | 'ultimatum' | 'jealous' | 'metWife' | 'baby'
  | 'drink' | 'fishing' | 'cards' | 'godfather' | 'loan' | 'beef' | 'test' | 'secret' | 'stage' | 'peace' | 'family';

export interface Memory {
  /** Week it happened. */
  w: number;
  k: MemKind;
  /** In the person's own words, short: "the fight about the kids' schooling". */
  t: string;
  /** How much it weighs, signed (-30..+30). */
  v: number;
}

/** One relationship, from the other person's side. */
export interface Tie {
  id: string;
  role: BondRole;
  ax: Axes;
  stage: BondStage;
  since: number;
  /** Week the boss last gave this person his time. */
  last?: number;
  mem: Memory[];
  /** Married during play (the newlywed year). */
  wed?: number;
  /** Wife: suspicion of another woman, 0-100. */
  sus?: number;
  /** Wife: she knows (week she found out). */
  knows?: number;
  /** Wife: she is waiting to hear it from him (week she confronted him). */
  confront?: number;
  /** Wife: the boss lied to her face (doubles the cost if she finds out). */
  lied?: boolean;
  /** Wife: her own ambition and where it stands. */
  amb?: { kind: AmbitionKind; status: 'wants' | 'backed' | 'refused'; week: number };
  /** Wife: the year (week / 52) whose anniversary was celebrated or missed. */
  annivYear?: number;
  /** Goomar: the ultimatum's deadline week (leave your wife). */
  ult?: number;
  /** Goomar: he already asked for more time once. */
  stalled?: boolean;
  /** Goomar: she is expecting (week he learned of it) and where he stands. */
  preg?: { week: number; stance?: 'support' | 'distance' };
  /** Friend: he stood godfather to this child. */
  compare?: string;
  /** Friend: he knows things about the boss (a confidant who knows too much). */
  knows2?: number;
  /** Money lent: amount and the week it is due. */
  loan?: { amount: number; due: number };
  /** Once a loan went unpaid: no more. */
  welsh?: boolean;
}

export type AmbitionKind = 'shop' | 'church' | 'school';
export const AMBITION_TEXT: Record<AmbitionKind, { want: string; cost: number; label: string }> = {
  shop: { want: 'open a little dress shop on Pacific Avenue, in her own name', cost: 1500, label: 'Her dress shop' },
  church: { want: 'chair the Altar & Rosary Society at St. Ann\'s', cost: 0, label: 'The church committee' },
  school: { want: 'run the Home & School Association at the kids\' school', cost: 0, label: 'The school association' },
};

export interface BondsState {
  v: 1;
  ties: Record<string, Tie>;
  /** The layer's own short log for the screen (most recent last). */
  log: [number, string][];
  stats: { found: number; confessed: number; denied: number; left: number; stayedForKids: number; ultimatums: number; compares: number; betrayals: number };
}

export function ensureBonds(s: GameState): BondsState {
  if (!s.bonds) {
    s.bonds = { v: 1, ties: {}, log: [], stats: { found: 0, confessed: 0, denied: 0, left: 0, stayedForKids: 0, ultimatums: 0, compares: 0, betrayals: 0 } };
  }
  const B = s.bonds;
  B.ties ??= {};
  B.log ??= [];
  B.stats ??= { found: 0, confessed: 0, denied: 0, left: 0, stayedForKids: 0, ultimatums: 0, compares: 0, betrayals: 0 };
  return B;
}

/** Memories kept per person (the weightiest and the newest survive). */
export const MEM_CAP = 14;
/** People kept on the roster (beyond the wife, goomars and kids, which always are). */
export const ROSTER_CAP = 24;
