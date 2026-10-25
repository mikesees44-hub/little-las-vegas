import { hashSeed } from './rng';
import type { BonesJobKind } from './bonesState';
import type { GameState, LedgerCategory } from './types';

/**
 * THE BOOKS: the boss's private ledger. Every money line of the one ledger is
 * archived here week by week (with who paid it and from which racket or
 * business), next to the kick-up notes (what each capo owed, paid, held back
 * and — hidden — skimmed), the job reports ("receipts") his men hand in, the
 * discrepancies the books turned up, big scores and their split, and what
 * the law seized. Rolls on its own seeded stream (`ledgerBook.rng`).
 */

export type BooksMode = 'head' | 'coded' | 'full';

/** One archived money line (exactly as the ledger posted it). */
export interface BookLine {
  /** Amount applied. */
  a: number;
  /** Label. */
  l: string;
  c: LedgerCategory;
  /** Who it came from / went to (character id). */
  w?: string;
  /** Which racket, business or district (id). */
  s?: string;
}

/** What a capo owed, paid, held back, and skimmed (the skim is the hidden truth). */
export interface KickNote {
  k: string;
  d: string;
  owed: number;
  paid: number;
  held: number;
  skim: number;
}

export interface BookWeek {
  week: number;
  start: number;
  end: number;
  lines: BookLine[];
  kicks: KickNote[];
}

/** A man's report on a job he did, true or not. */
export interface Receipt {
  id: string;
  week: number;
  byId: string;
  job: string;
  kind: BonesJobKind | 'score';
  /** What he handed in / what it really came to. */
  reported: number;
  actual: number;
  /** What he says happened / what happened. */
  said: string;
  truth: string;
  lie: boolean;
  /** The bones this report vouches for (struck off if it is a lie and it comes out). */
  bonesOf?: string;
  jobId: string;
  checked?: { via: 'consigliere' | 'enforcer'; week: number; caught: boolean };
}

export interface Discrepancy {
  id: string;
  week: number;
  whoId: string;
  kind: 'skim' | 'receipt';
  /** What the books say is missing (an estimate unless the books are full). */
  amount: number;
  text: string;
  /** District or business id. */
  src?: string;
  receiptId?: string;
  /** Hidden: was there really something missing. */
  truth: boolean;
  settled?: 'confronted' | 'forgiven';
  settledWeek?: number;
}

export interface ScoreNote {
  week: number;
  byId: string;
  what: string;
  value: number;
  yours: number;
}

export interface Seizure {
  week: number;
  by: 'police' | 'fbi' | 'flip';
  mode: BooksMode;
  /** Evidence it added to the boss's file. */
  evidence: number;
}

export interface LedgerBookState {
  rng: number;
  mode: BooksMode;
  /** The week the current level of detail started (nothing older is in the books). */
  since: number;
  /** A dedicated bookkeeper; otherwise the bagman keeps the books. */
  keeperId?: string;
  weeks: BookWeek[];
  /** This week's kick-up notes, archived with the week's lines. */
  cur: KickNote[];
  receipts: Receipt[];
  discrepancies: Discrepancy[];
  scores: ScoreNote[];
  seizures: Seizure[];
  carry: Record<string, number>;
  stats: { receipts: number; lies: number; checks: number; caught: number; skimsFound: number; falseAlarms: number; confronted: number; recovered: number; seizures: number; keeperFlips: number };
}

export function ensureLedgerBook(s: GameState): LedgerBookState {
  if (!s.ledgerBook) {
    s.ledgerBook = {
      rng: hashSeed(`${s.seed}:ledger`), mode: 'coded', since: s.week,
      weeks: [], cur: [], receipts: [], discrepancies: [], scores: [], seizures: [], carry: {},
      stats: { receipts: 0, lies: 0, checks: 0, caught: 0, skimsFound: 0, falseAlarms: 0, confronted: 0, recovered: 0, seizures: 0, keeperFlips: 0 },
    };
  }
  return s.ledgerBook;
}

/** Copy for the pure week step: archived weeks are immutable once written, so the list is copied shallowly. */
export function cloneLedgerBook(b: LedgerBookState): LedgerBookState {
  return {
    ...b,
    weeks: b.weeks.slice(),
    cur: b.cur.map((k) => ({ ...k })),
    receipts: b.receipts.map((r) => (r.checked ? { ...r, checked: { ...r.checked } } : { ...r })),
    discrepancies: b.discrepancies.map((d) => ({ ...d })),
    scores: b.scores.slice(),
    seizures: b.seizures.slice(),
    carry: { ...b.carry },
    stats: { ...b.stats },
  };
}

export type LedgerOp =
  | { op: 'mode'; mode: BooksMode }
  | { op: 'keeper'; charId?: string }
  | { op: 'check'; receiptId: string; via: 'consigliere' | 'enforcer' }
  | { op: 'confront'; discId: string }
  | { op: 'forgive'; discId: string }
  | { op: 'note'; text: string };

export type LedgerAction = Exclude<LedgerOp, { op: 'note' }>;
