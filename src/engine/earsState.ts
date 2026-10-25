import type { GameState, RivalId } from './types';

/**
 * THE EARS: the nightlife intelligence layer's state (ears.ts, earsWeb.ts).
 *
 * - The Madam: a powerful independent woman with her own house, money,
 *   lieutenants, loyalties and successor. The boss is her FRIEND, not her
 *   employer: the relationship is diplomacy (her opinion, favors, the cut she
 *   pays for protection, intel sharing, joint ventures). She never obeys.
 * - The Ears: adult women who work the clubs, lounges and hotel bars (dancers,
 *   hostesses, call girls, waitresses), in her network or on their own. Each
 *   one decides for herself what she trades, to whom, and for how much. She
 *   has her own goals and her own lines she will not cross.
 * - Operators: men who exploit women (debt, fear). Antagonists only: the
 *   player can never run what they run, only fight them.
 * - The connection web: who is attached to whom (likes, a regular, a
 *   girlfriend, a mistress, in love, an ex, owes), some of it hidden.
 *
 * Everything is non-explicit and off-screen: set-ups and reports only.
 * Lives on `GameState.ears` (optional, so older saves load) and rolls on its
 * own seeded stream (`ears.rng`), so it never reshuffles the main dice.
 */

export type EarWork = 'dancer' | 'hostess' | 'callgirl' | 'waitress' | 'cigarette';

/** Her own lines. The engine enforces every one on every request. */
export type Boundary = 'no_dances' | 'no_cops' | 'no_married' | 'no_rivals' | 'no_rough' | 'no_stars';

export type EarGoal = 'own_place' | 'leave_life' | 'marry' | 'records' | 'send_home' | 'vegas' | 'school';

export interface Ear {
  /** The character id. */
  id: string;
  work: EarWork;
  /** Where she works (a fictional room on the island). */
  venue: string;
  network: 'madam' | 'independent';
  /** The boss knows she listens (she came with a hint, or was introduced). */
  known: boolean;
  /** Her trust in the boss, 0-100. */
  loyalty: number;
  nerve: number;
  discretion: number;
  charm: number;
  /** Price multiplier (0.8 .. 1.5). */
  greed: number;
  goal: EarGoal;
  boundaries: Boundary[];
  status: 'listening' | 'working' | 'gone';
  /** She also trades what she hears with a rival. */
  sellsTo?: RivalId;
  /** Brush-offs in a row. */
  brushed: number;
  /** Everything the boss has paid her. */
  paid: number;
  /** The operator the boss protects her from. */
  protectedFrom?: string;
  hints: number;
  lastHint?: number;
  /** Her own money, saved toward her goal (abstract). */
  savings: number;
  since: number;
  left?: { week: number; why: string };
  /** Week the boss last took care of her (an envelope, no strings). */
  lastGift?: number;
  /** An operator leaning on her (she may come for protection). */
  underOp?: string;
}

export interface Operator {
  id: string;
  /** What he does, in one abstract line. */
  racket: string;
  /** Where. */
  base: string;
  strength: number;
  /** What can be proved, 0-100. */
  exposure: number;
  stage: 'waiting' | 'active' | 'gone';
  arrives: number;
  outcome?: string;
}

export type CutTier = 0 | 1 | 2 | 3;

export interface Squeeze {
  by: 'operator' | 'rival' | 'law';
  rival?: RivalId;
  who?: string;
  since: number;
  /** Weeks left before it costs her. */
  left: number;
}

export interface Venture {
  kind: 'stake' | 'motel';
  since: number;
  /** Your money in it. */
  stake: number;
}

export interface Madam {
  id: string;
  /** Her house's name ("the Marchetti house"). */
  house: string;
  /** Her legitimate public face. */
  hotel: string;
  club: string;
  agency: string;
  charity: string;
  lieutenants: string[];
  successorId?: string;
  money: number;
  /** The size of her network, 0-100. */
  network: number;
  /** The protection cut she pays the boss (0 none · 1 light · 2 standard · 3 heavy). */
  cut: CutTier;
  intel: boolean;
  venture?: Venture;
  /** A rival she has thrown in with. */
  ally?: RivalId;
  squeeze?: Squeeze;
  /** Favors she owes the boss. */
  favors: number;
  lastCall?: number;
  /** Her cut stops coming until this week (she was let down, or she was raided). */
  cutPausedUntil?: number;
  /** Week the boss was last asked about the squeeze. */
  squeezeAsked?: number;
  /** She introduced the boss to her first Ear. */
  introduced?: boolean;
  since: number;
  /** Earlier Madams of the house (succession). */
  past: { id: string; until: number; why: string }[];
}

export type LinkType = 'likes' | 'regular' | 'girlfriend' | 'mistress' | 'in_love' | 'ex' | 'owes';

export interface Link {
  id: string;
  /** The man (for 'owes': the one who owes). */
  a: string;
  /** The woman (for 'owes': the one he owes). */
  b: string;
  type: LinkType;
  strength: number;
  /** Nobody knows yet (the Ears can reveal it). */
  hidden: boolean;
  since: number;
  /** How it started: 'visit', 'date', 'report', 'romance', 'npc'. */
  via: string;
  ended?: number;
}

export type JobMode = 'close' | 'dance';

export interface EarJob {
  id: string;
  earId: string;
  targetId: string;
  mode: JobMode;
  start: number;
  due: number;
  /** Her full price; half up front, the rest when she reports. */
  price: number;
  /** A man of yours is sweet on her and does not like it. */
  protector?: string;
}

/** A hint she is sitting on ("keep listening"). */
export interface Held {
  earId: string;
  subject: string;
  targetId: string;
  ripe: number;
}

/** A story hook waiting for a seat (earsWeb.ts). */
export interface PendingHook {
  kind: 'jealousy' | 'breakup' | 'pregnant' | 'wife' | 'protector' | 'leaving' | 'protect' | 'intro';
  /** For 'protect': the operator. */
  opId?: string;
  a: string;
  b?: string;
  her: string;
  rival?: RivalId;
  jobId?: string;
  week: number;
}

export interface EarsStats {
  hints: number;
  paid: number;
  brushed: number;
  held: number;
  jobs: number;
  refused: number;
  countered: number;
  reports: number;
  protected: number;
  left: number;
  opsDown: number;
  links: number;
  leaks: number;
  hooks: number;
  intel: Record<string, number>;
}

export interface EarsState {
  rng: number;
  madam: Madam;
  ears: Record<string, Ear>;
  ops: Record<string, Operator>;
  links: Link[];
  jobs: EarJob[];
  held: Held[];
  hooks: PendingHook[];
  /** Text variety: indexes already used, per pool. */
  used: Record<string, number[]>;
  lastHint: number;
  lastHook: number;
  lastMadam: number;
  lastProtect: number;
  /** Recent notes for the panel: [week, text]. */
  notes: [number, string][];
  stats: EarsStats;
}

/* ---------------- orders and effect ops ---------------- */

export type EarsAction =
  | { op: 'ask'; earId: string; targetId: string; mode: JobMode; generous?: boolean }
  | { op: 'retain'; earId: string }
  | { op: 'protect'; earId: string }
  | { op: 'madamCall' }
  | { op: 'madamCut'; tier: CutTier }
  | { op: 'madamIntel'; on: boolean }
  | { op: 'madamVenture'; kind: 'stake' | 'motel' }
  | { op: 'madamFavor'; targetId: string }
  | { op: 'opDig'; opId: string }
  | { op: 'opRunoff'; opId: string }
  | { op: 'opExpose'; opId: string }
  | { op: 'opMadam'; opId: string };

export type IntelKind = 'graft' | 'affair' | 'rat' | 'skim' | 'plans' | 'case' | 'debt' | 'operator' | 'leak' | 'link' | 'nothing';

export type EarsOp =
  | { op: 'loyalty'; earId: string; amount: number }
  | { op: 'paid'; earId: string; amount: number }
  | { op: 'brush'; earId: string }
  | { op: 'hold'; earId: string; subject: string; targetId: string }
  | { op: 'intel'; earId: string; kind: IntelKind; targetId: string; strong?: boolean }
  | { op: 'job'; earId: string; targetId: string; mode: JobMode; price: number }
  | { op: 'refused'; earId: string; targetId: string; mode: JobMode; price: number; chance: number }
  | { op: 'stiff'; earId: string; targetId: string }
  | { op: 'link'; a: string; b: string; type: LinkType; strength: number; via: string; hidden?: boolean }
  | { op: 'endLink'; a: string; b: string; why: string }
  | { op: 'reveal'; a: string; b?: string }
  | { op: 'protect'; earId: string; opId: string }
  | { op: 'newEar'; earId: string; network: 'madam' | 'independent'; loyalty: number }
  | { op: 'leave'; earId: string; why: string }
  | { op: 'retain'; earId: string }
  | { op: 'network'; amount: number }
  | { op: 'madam'; field: 'cut' | 'intel' | 'venture' | 'favors' | 'squeeze' | 'ally' | 'call' | 'network'; value?: number; kind?: string; rival?: RivalId }
  | { op: 'operator'; opId: string; field: 'strength' | 'exposure'; amount: number }
  | { op: 'opDown'; opId: string; how: string }
  | { op: 'note'; text: string };

/* ---------------- read-only helpers ---------------- */

export const WORK_LABEL: Record<EarWork, string> = {
  dancer: 'Dancer', hostess: 'Hostess', callgirl: 'Call girl', waitress: 'Cocktail waitress', cigarette: 'Cigarette girl',
};

export const BOUNDARY_TEXT: Record<Boundary, string> = {
  no_dances: 'No private dances, no VIP rooms',
  no_cops: 'Will not work a cop or a man from the courthouse',
  no_married: 'Will not get close to a married man',
  no_rivals: 'Stays away from the rival crews',
  no_rough: 'Will not sit with a man known to get rough',
  no_stars: 'Stays away from show people and the press',
};

export const GOAL_TEXT: Record<EarGoal, string> = {
  own_place: 'wants a place of her own',
  leave_life: 'wants out of the life',
  marry: 'wants to marry well and quit',
  records: 'wants to sing on a record',
  send_home: 'sends money home to her mother',
  vegas: 'wants to dance in Las Vegas',
  school: 'is saving for nursing school',
};

export const LINK_LABEL: Record<LinkType, string> = {
  likes: 'likes', regular: 'a regular of', girlfriend: 'girlfriend', mistress: 'mistress', in_love: 'in love with', ex: 'used to see', owes: 'owes',
};

export const CUT_INFO: Record<CutTier, { name: string; weekly: number }> = {
  0: { name: 'No cut', weekly: 0 },
  1: { name: 'A light cut', weekly: 120 },
  2: { name: 'The standard cut', weekly: 240 },
  3: { name: 'A heavy cut', weekly: 420 },
};

/** Peek without creating (safe in render). */
export function earsOf(s: GameState): EarsState | undefined {
  return s.ears;
}

export function emptyStats(): EarsStats {
  return { hints: 0, paid: 0, brushed: 0, held: 0, jobs: 0, refused: 0, countered: 0, reports: 0, protected: 0, left: 0, opsDown: 0, links: 0, leaks: 0, hooks: 0, intel: {} };
}
