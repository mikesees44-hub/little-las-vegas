import { adultOn } from './datingState';
import type { GameState, PlayerAction } from './types';

/**
 * STANDING APPOINTMENTS (state). A date every Tuesday evening with the girl he is courting, dinner with his
 * wife on Saturdays, a coffee every morning with an Ear on the street, a sit-down with a capo on Mondays:
 * the boss sets it once and it fills his days. Each one is an order he could give himself (an existing
 * PlayerAction aimed at that person), how often, on what day and at what time of day, for how long, and a
 * weekly budget. The week's due ones become real orders at the week's turn (appointments.ts), on the normal
 * path: they cost, roll and land in Your File exactly as if he had given them; she can still say no.
 *
 * Lives on `GameState.appts` (optional: a save without any has none, and a fresh game has none).
 * This file is light (types and the evening count the rounds read); the rest is in appointments.ts.
 */

export type ApptCadence = 'daily' | 'weekly';
export type ApptSlot = 'morning' | 'afternoon' | 'evening';

/** The clock hour each time of day starts (8 = 8 AM … 26 = 2 AM). */
export const SLOT_HOUR: Record<ApptSlot, number> = { morning: 9, afternoon: 14, evening: 20 };
export const SLOT_LABEL: Record<ApptSlot, string> = { morning: 'morning', afternoon: 'afternoon', evening: 'evening' };

/** Refusals in a row that pause a standing date (she keeps saying no: he is told, it stops). */
export const REFUSALS_TO_PAUSE = 2;

export interface ApptResult {
  w: number;
  d: number;
  outcome: 'done' | 'refused' | 'skipped';
  text: string;
}

export interface Appt {
  id: string;
  /** The person (character id). */
  who: string;
  /** The order given each time (one of the orders that person's menu offers). */
  action: PlayerAction;
  /** What it is, in words ("Dinner with Rosa"). */
  what: string;
  cadence: ApptCadence;
  /** Day of the week (0 Monday … 6 Sunday): the weekly one's day. */
  day: number;
  slot: ApptSlot;
  /** The first absolute day it may happen (week * 7 + day): set when it is made. */
  start: number;
  /** How many weeks it runs (undefined: until he stops it). */
  weeks?: number;
  /** The most it may spend in a week (undefined: no cap). */
  budget?: number;
  /** Paused, and why ("You paused it", "She said no twice in a row"). */
  paused?: string;
  /** Refusals in a row. */
  no: number;
  last?: ApptResult;
  /** Money it spent this week. */
  spent?: { w: number; n: number };
  /** Its weeks are over. */
  ended?: true;
}

export interface ApptState {
  list: Appt[];
  seq: number;
  /** Occurrences already settled this week (so their evenings no longer count as held). */
  done?: { w: number; k: string[] };
  /** The hours held on the book for them, by absolute day (so a change gives them back exactly). */
  res?: Record<string, number>;
}

export interface Occurrence { a: Appt; d: number; key: string }

/** The week an appointment was made in. */
export function startWeek(a: Appt): number {
  return Math.floor(a.start / 7);
}

/** The last week it runs (Infinity: open-ended). */
export function lastWeek(a: Appt): number {
  return a.weeks === undefined ? Infinity : startWeek(a) + a.weeks - 1;
}

/** Orders for adults only (paid company): they exist only with mature content on. */
export function adultAct(a: PlayerAction): boolean {
  if (a.kind === 'dating') return a.op.op === 'paid' || a.op.op === 'pro';
  if (a.kind === 'nightlife') return a.op.op === 'car' || a.op.op === 'bold';
  return false;
}

/** Orders that take one of the week's evenings (the dating layer's evenings). */
export function usesEvening(a: PlayerAction): boolean {
  if (a.kind === 'dating') return a.op.op === 'invite' || a.op.op === 'paid' || a.op.op === 'askOut' || (a.op.op === 'pro' && a.op.what !== 'help');
  if (a.kind === 'nightlife') return a.op.op === 'invite';
  return false;
}

/** Shown and carried out at the current mature-content setting (adult ones are hidden with it Off). */
export function apptVisible(s: GameState, a: Appt): boolean {
  return !adultAct(a.action) || adultOn(s);
}

/** Is it live in week `w` (not paused, not over, made by then)? */
export function liveIn(s: GameState, a: Appt, w: number): boolean {
  return !a.paused && !a.ended && apptVisible(s, a) && w >= startWeek(a) && w <= lastWeek(a);
}

/** Its days in week `w`, each once (only from the day it was made). */
export function occurrences(s: GameState, a: Appt, w: number): Occurrence[] {
  if (!liveIn(s, a, w)) return [];
  const days = a.cadence === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : [a.day];
  return days.filter((d) => w * 7 + d >= a.start).map((d) => ({ a, d, key: `${a.id}:${d}` }));
}

/** Every appointment's days in week `w`, in the order they happen (by day, then by the time of day). */
export function weekOccurrences(s: GameState, w: number = s.week): Occurrence[] {
  const out: Occurrence[] = [];
  for (const a of s.appts?.list ?? []) out.push(...occurrences(s, a, w));
  return out.sort((x, y) => x.d - y.d || SLOT_HOUR[x.a.slot] - SLOT_HOUR[y.a.slot] || x.a.id.localeCompare(y.a.id));
}

/** Evenings this week held by standing appointments still to come (the rounds and the dating evenings count them). */
export function reservedEvenings(s: GameState): number {
  const A = s.appts;
  if (!A?.list.length) return 0;
  const done = A.done && A.done.w === s.week ? A.done.k : [];
  return weekOccurrences(s).filter((o) => usesEvening(o.a.action) && !done.includes(o.key)).length;
}
