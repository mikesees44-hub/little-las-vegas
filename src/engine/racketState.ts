import type { BusinessKind } from './types';

/**
 * Types of the living rackets (racketLife.ts): the standing decisions a boss
 * makes about how each racket runs ("dials"), the situations it throws up,
 * and the orders and effect ops that change them. Kept in their own file so
 * econState.ts only gains two union members.
 */

/** One answer to a standing question ("How much sits in the bank?"). */
export interface DialOpt {
  id: string;
  label: string;
  blurb: string;
  /** Added to the racket's income multiplier (+0.1 = +10%). */
  income?: number;
  /** Added to its local heat multiplier. */
  heat?: number;
  /** Multiplies its raid odds. */
  raid?: number;
  /** Paid every week while it is set (a pad, a lawyer, the union hall). */
  weekly?: number;
  /** Federal heat per week (fractional, accumulates). */
  fed?: number;
  /** Philadelphia's opinion each month while it is set. */
  philly?: number;
  /** Plain-words risk shown as a chip ("a big hit can break the bank"). */
  risk?: string;
  /** Racket-specific knobs read by the racket's own code (reserve size, score pace, vig ...). */
  k?: Record<string, number>;
}

export interface Dial {
  id: string;
  name: string;
  /** The question, in one line. */
  ask: string;
  opts: DialOpt[];
  /** The option a new racket starts with. */
  def: string;
}

/** What one side of a gamble does when it lands. */
export interface RacketOutcome {
  money?: number;
  heat?: number;
  fed?: number;
  /** Evidence on the boss's file. */
  evidence?: number;
  respect?: number;
  philly?: number;
  /** Padlocked for this many weeks. */
  close?: number;
  /** One of the men running it goes away for a while. */
  jail?: boolean;
  /** A temporary change to the take: percent, weeks. */
  boost?: [number, number];
  /** Racket variable change: key, amount. */
  v?: [string, number];
  favor?: number;
  /** What happened, for the log and the chronicle. */
  text: string;
}

/** Effect ops of the rackets (inside `{ type: 'econ', op }`). */
export type RacketOp =
  | { op: 'racket'; cmd: 'roll'; bizId: string; p: number; what: string; win: RacketOutcome; lose: RacketOutcome }
  | { op: 'racket'; cmd: 'boost'; bizId: string; pct: number; weeks: number }
  | { op: 'racket'; cmd: 'var'; bizId: string; key: string; amount: number }
  | { op: 'racket'; cmd: 'dial'; bizId: string; dial: string; opt: string }
  /** Steady earners (earners.ts): give `who` the business as his earner ('' takes it back). */
  | { op: 'racket'; cmd: 'earner'; bizId: string; who: string };

/** Player orders of the rackets (inside `{ kind: 'econ', op: { type: 'racket', cmd } }`). */
export type RacketCmd =
  /** Open a racket: the best district and the best-fit man are picked for you. */
  | { c: 'start'; kind: BusinessKind; district?: string; runner?: string; earner?: boolean }
  /** Give a man (the boss or a capo) his steady earner; bizId '' takes it back. */
  | { c: 'earner'; who: string; bizId: string }
  /** Change a standing decision. */
  | { c: 'dial'; bizId: string; dial: string; opt: string }
  /** Take the advice: set every dial of one racket to what the advisor recommends. */
  | { c: 'advice'; bizId: string };

/** Per-business living-racket record (stored on RacketState). */
export interface RacketLife {
  /** Standing decisions, dial id → option id. */
  dials?: Record<string, string>;
  /** A temporary change to the take. */
  boost?: { pct: number; until: number };
  /** Week the last situation was offered. */
  sitWeek?: number;
  /** Racket variables beyond the old ones (players, files, scores ...). */
  vars?: Record<string, number>;
}
