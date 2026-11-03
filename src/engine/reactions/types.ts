import type { RivalId } from '../types';

/**
 * REACTIONS (types). Crusader-Kings-style: whenever the boss decides
 * something that touches a person or a family (an answered popup, an order,
 * a declined proposal, a promotion, a war or a peace), the people who CARE
 * react: the man himself, his blood, his capo and crew, his friends and his
 * rivals, the other capos (precedent, jealousy), the other families,
 * Philadelphia, the wife. Each reaction is a named opinion modifier ("Declined
 * my request −15"), a mood, a memory, sometimes a follow-up (a capo sulks, a
 * family files a grievance at the Table, a friend wants a favor back).
 *
 * `GameState.reactions` is optional: made by the first decision that needs it
 * (upgradeSave only tops up a save that has it). Its dice are its own; the
 * reactions themselves are computed without dice, so what the card predicts
 * before the boss chooses is what lands.
 */

export type RxKind =
  | 'decline' | 'accept' | 'grant' | 'favor' | 'slight' | 'punish' | 'promote' | 'demote'
  | 'transfer' | 'ruling' | 'war' | 'peace' | 'marriage' | 'family';

export type RxTone = 'pleased' | 'displeased' | 'furious';

/** Why he cares: it was done to him, to his blood, to his man, his friend... */
export type RxRole = 'target' | 'kin' | 'capo' | 'friend' | 'enemy' | 'peer' | 'passed' | 'family' | 'philly' | 'wife';

export const ROLE_LABEL: Record<RxRole, string> = {
  target: 'It was about him', kin: 'Blood', capo: 'His capo', friend: 'A friend', enemy: 'No friend of his', peer: 'Another capo',
  passed: 'Passed over', family: 'Another family', philly: 'Philadelphia', wife: 'Your wife',
};

/** One person's reaction to one decision. */
export interface Reaction {
  who: string;
  role: RxRole;
  /** The opinion change (of him toward the boss). */
  v: number;
  /** The modifier's reason, in his words ("Declined my request"). */
  why: string;
  tone: RxTone;
  /** The trait that made it land harder (or softer): "Hot-headed". */
  trait?: string;
  /** Pops up (a capo furious, a family insulted, the wife humiliated); otherwise rolls into the week's summary. */
  major: boolean;
  /** Fear of the boss added (a punishment others watched). */
  fear?: number;
  /** Came with the choice's own effects (counted there; listed here so the window tells the whole story). */
  direct?: 1;
  /** What he does about it (a follow-up), filled when it lands. */
  next?: string;
  /** May still be smoothed over (angry, alive, not yet smoothed). */
  smooth?: 1;
  /** How it was smoothed over ("A gift: +9"). */
  smoothed?: string;
}

/** A family (or Philadelphia) taking it directly. */
export interface FamRx { id: RivalId; v: number; y: string }

/** A decision, described for the reaction engine. */
export interface Decision {
  k: RxKind;
  /** "You declined Sal's numbers bank": the window's title. */
  label: string;
  /** The person it is about. */
  t?: string;
  /** How it lands on him before his nature (negative: against him). */
  v?: number;
  /** His reason line. */
  y?: string;
  /** Scale his answer by his pride (a proposal turned down: a proud man takes it hard). */
  pride?: 1;
  /** The man passed over / sided against. */
  over?: string;
  overV?: number;
  overY?: string;
  /** Families (and Philadelphia) taking it directly. */
  fam?: FamRx[];
  /** Other people taking it directly: [id, value, reason] (a man's sponsor, the capo whose corners were traded). */
  more?: [string, number, string][];
  /** The boss's wife, directly. */
  wife?: { v: number; y: string };
  /** Opinion changes already in the choice's own effects: id -> [value, reason]. */
  direct?: Record<string, [number, string]>;
  /** A declined proposer may take it to this family instead. */
  go?: RivalId;
  /** Where the decision came from (an event template, an order kind). */
  src?: string;
}

/** The window: the reactions to one decision, the most important first. */
export interface ReactionBatch {
  id: string;
  w: number;
  title: string;
  /** The 2-5 that matter most. */
  items: Reaction[];
  /** How many more (minor) reactions rolled into the summary. */
  more: number;
  src?: string;
  /** The decision's kind and the people it was about (the argument window reads them: argue/offer.ts). */
  k?: RxKind;
  t?: string;
  over?: string;
}

/** A minor reaction (or a batch held back by the caps), for the week's summary. */
export interface RxLogLine { w: number; title: string; who: string; v: number; why: string; tone: RxTone }

export type ProposalKind = 'capoRacket' | 'capoMan' | 'rivalMarriage' | 'rivalTruce' | 'rivalVenture' | 'rivalSwap' | 'phillyPoint' | 'ubPurge' | 'wifeFamily';

export interface ReactionsState {
  v: 1;
  rng: number;
  /** Windows waiting to be shown (oldest first). */
  q: ReactionBatch[];
  /** Minor reactions, for the Desk's Handled list / the week's summary (capped). */
  log: RxLogLine[];
  /** Week the popup count is for, and the count. */
  pw: number;
  pops: number;
  /** A sulking man: id -> the week he stops. */
  sulk: Record<string, number>;
  /** Proposals: kind -> week last made; the week of the last one. */
  pr: Partial<Record<ProposalKind, number>>;
  pl: number;
  stats: { n: number; pops: number; minor: number; props: number; declined: number; smoothed: number };
}

/** At most this many reaction windows a week (the rest roll into the summary). */
export const POPS_PER_WEEK = 2;
/** At most this many windows waiting. */
export const Q_CAP = 4;
export const LOG_CAP = 40;
/** Items in one window. */
export const BATCH_ITEMS = 5;
/** Weeks between NPC proposals (at least). */
export const PROPOSAL_GAP = 3;
/** Weeks before the same kind of proposal comes again. */
export const PROPOSAL_KIND_GAP = 10;
