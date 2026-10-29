import { hashSeed } from './rng';
import type { GameState, RivalId } from './types';

/**
 * THE CAPOS (state). The capos run the street: each one his territory's
 * day-to-day, his men, his ears on the corners, and his own reading of
 * which way the tide is going. The boss sets policy and makes the big calls.
 *
 * Lives on `GameState.capos` (optional: made by the first week that needs
 * it; upgradeSave only tops up a save that already has it). Its dice are its
 * own (`rng`): the main simulation's rolls never move because of it. Keys
 * are short: this goes into every save, and every list is capped.
 */

/** Where a capo stands, as HE sees it (the truth; the boss only sees signs). */
export type Stance = 'loyal' | 'steady' | 'hedging' | 'turning';
export const STANCE_LABEL: Record<Stance, string> = { loyal: 'Loyal', steady: 'Steady', hedging: 'Hedging his bets', turning: 'Turning' };

/** What a capo is working toward when he is turning. */
export type PlotKind = 'defect' | 'fbi' | 'coup';
export const PLOT_LABEL: Record<PlotKind, string> = { defect: 'Going over to another family with his crew', fbi: 'Selling the boss to the FBI', coup: 'Backing a move against the boss' };

export interface CapoPlot {
  k: PlotKind;
  rival?: RivalId;
  /** 0 feelers · 1 the deal · 2 ready. */
  st: number;
  /** Week started, week of the current stage. */
  w: number;
  sw: number;
  /** The boss knows (found out, was told). */
  known?: number;
}

/** A visible sign (true or not): what the boss could notice. */
export type SignKind = 'late' | 'car' | 'seen' | 'sullen' | 'quiet' | 'family' | 'proud' | 'generous';
export interface Sign { w: number; k: SignKind; t: string; /** Truth (hidden): it means what it looks like. */ tr: 0 | 1 }

/** One thing a capo knows about his territory. */
export type IntelKind = 'secret' | 'rat' | 'courted' | 'hedge' | 'rival' | 'cops' | 'skim';
export interface CapoIntel {
  id: string;
  k: IntelKind;
  /** About whom (a character id) or which family. */
  about?: string;
  rival?: RivalId;
  /** The secret's id, for 'secret'. */
  ref?: string;
  /** What is so. */
  truth: string;
  w: number;
  /** Already reported (honestly or not). */
  told?: 1;
}

/** "What Sal tells you" vs the truth. */
export type ReportKind = 'honest' | 'slant' | 'withheld';
export interface CapoReport {
  id: string;
  capo: string;
  w: number;
  k: IntelKind;
  /** What he told the boss (withheld: what he said instead, usually "quiet week"). */
  told: string;
  truth: string;
  kind: ReportKind;
  about?: string;
  /** Week the truth came out (for slanted or withheld reports). */
  rev?: number;
  /** How it came out. */
  how?: string;
}

/** The grooming track: errands → jobs → trust → vouched-for → proposed for the books. */
export type GroomStage = 0 | 1 | 2 | 3 | 4;
export const GROOM_STAGES = ['Errands', 'Jobs', 'Trusted', 'Vouched for', 'Proposed'] as const;
/** Weeks in each stage before the next (the capo's skill shortens it). */
export const GROOM_WEEKS = [5, 7, 9, 6];

export interface Groom {
  /** The man being groomed. */
  id: string;
  capo: string;
  st: GroomStage;
  w: number;
  sw: number;
  /** XP he got on the track. */
  xp: number;
}

/** A capo's request to the boss. */
export type ReqKind = 'men' | 'transfer' | 'make' | 'street';
export type ReqAnswer = 'yes' | 'no' | 'redirect' | 'later';
export interface CapoRequest {
  id: string;
  capo: string;
  k: ReqKind;
  /** The man he wants (a street kid, an associate, a soldier of another crew, a man for the books). */
  who?: string;
  /** The capo he would take him from (transfer). */
  from?: string;
  /** For a redirect: the man offered instead. */
  alt?: string;
  /** Street calls: the family pushing, the district. */
  rival?: RivalId;
  d?: string;
  /** His words. */
  y: string;
  w: number;
  /** Week it was last put to the boss (the popup). */
  shown?: number;
  /** He has taken the boss's silence as a slight (once). */
  sl?: 1;
  /** Settled: the answer and the week. */
  ans?: ReqAnswer;
  aw?: number;
}

export interface CapoBook {
  /** Since week (he took the district / the book was opened). */
  since: number;
  st: Stance;
  /** His reading of the tide, -100..100 (smoothed). */
  tide: number;
  /** Side deals and talks with rivals, 0-100. */
  hedge: number;
  /** Recent slights and rewards (decay a little every week). */
  sl: number;
  rw: number;
  /** His contract last week (a squeeze is a slight). */
  keep?: number;
  signs: Sign[];
  intel: CapoIntel[];
  /** Take per week (last 8). */
  take: number[];
  /** Heat he put on the family this week, and the last 8 weeks' total. */
  heat: number;
  heat8: number[];
  /** What he is doing this week (his words). */
  doing: string;
  /** The boss has a man on him until this week. */
  watch?: number;
  /** Bound to the boss's family (godfather, a match): the week, and how. */
  tied?: { w: number; how: string };
  plot?: CapoPlot;
  /** Week his last crisis move (save or sink). */
  crisis?: number;
  /** Week the boss last asked him directly. */
  asked?: number;
  /** Week he last filed a request. */
  req?: number;
  /** Rallied for the war (levy bonus) until this week. */
  rally?: number;
}

export interface CapoLog { w: number; t: string; who: string; k: 'save' | 'sink' | 'street' | 'request' | 'groom' | 'intel' | 'tide' | 'counter' }

export interface CaposState {
  v: 1;
  rng: number;
  n: number;
  books: Record<string, CapoBook>;
  groom: Groom[];
  req: CapoRequest[];
  reports: CapoReport[];
  log: CapoLog[];
  stats: { req: number; yes: number; no: number; redirect: number; groomed: number; proposed: number; saves: number; defected: number; fbi: number; coups: number; plots: number; foiled: number; slants: number; withheld: number; honest: number; revealed: number };
}

export const REPORT_CAP = 40;
export const LOG_CAP = 40;
export const REQ_CAP = 24;
export const SIGN_CAP = 6;
export const INTEL_CAP = 6;
export const GROOM_CAP = 2;

/** Hours of the boss's day each capo order takes (timeCost.ts reads this; no imports from the engine, so no cycles). */
export const CAPO_HOURS: Record<CapoAction['op'], number> = {
  answer: 0.25, reward: 0.5, recognize: 0.5, territory: 1, kin: 3, watch: 0.25, ask: 1, confront: 1,
};

/** The boss's orders about his capos. */
export type CapoAction =
  /** Answer a capo's request: yes, no, or someone else instead. */
  | { op: 'answer'; req: string; a: ReqAnswer; alt?: string }
  /** An envelope for a capo who has been doing right. */
  | { op: 'reward'; capo: string; amount: number }
  /** Recognize him in front of the other capos. */
  | { op: 'recognize'; capo: string }
  /** Give him more ground (a district with nobody running it, or another capo's). */
  | { op: 'territory'; capo: string; district: string }
  /** Bind him to your family: stand godfather to his child, or a match. */
  | { op: 'kin'; capo: string }
  /** Put a guy on him (quietly): what he does and who he sees. */
  | { op: 'watch'; capo: string }
  /** Ask him straight: what do you hear on the street? */
  | { op: 'ask'; capo: string }
  /** Have it out with him about what you know. */
  | { op: 'confront'; capo: string };

/** Effect ops of the capo layer (the `capo` Effect): answers to the capos' popups. */
export type CapoOp =
  | { op: 'answer'; req: string; a: ReqAnswer; alt?: string }
  | { op: 'watch'; capo: string }
  | { op: 'thank'; capo: string; report?: string }
  | { op: 'doubt'; capo: string; report?: string }
  | { op: 'confront'; capo: string }
  | { op: 'buyback'; capo: string; amount: number };

export function ensureCapos(s: GameState): CaposState {
  if (!s.capos) {
    s.capos = {
      v: 1, rng: hashSeed(`${s.seed}:capos`), n: 1, books: {}, groom: [], req: [], reports: [], log: [],
      stats: { req: 0, yes: 0, no: 0, redirect: 0, groomed: 0, proposed: 0, saves: 0, defected: 0, fbi: 0, coups: 0, plots: 0, foiled: 0, slants: 0, withheld: 0, honest: 0, revealed: 0 },
    };
  }
  const C = s.capos;
  C.books ??= {};
  C.groom ??= [];
  C.req ??= [];
  C.reports ??= [];
  C.log ??= [];
  C.n ??= 1;
  C.stats ??= { req: 0, yes: 0, no: 0, redirect: 0, groomed: 0, proposed: 0, saves: 0, defected: 0, fbi: 0, coups: 0, plots: 0, foiled: 0, slants: 0, withheld: 0, honest: 0, revealed: 0 };
  return C;
}

export function newBook(week: number): CapoBook {
  return { since: week, st: 'steady', tide: 10, hedge: 0, sl: 0, rw: 0, signs: [], intel: [], take: [], heat: 0, heat8: [], doing: 'Learning his corners' };
}
