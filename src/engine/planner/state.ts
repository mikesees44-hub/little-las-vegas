import type { GameState } from '../types';

/**
 * THE DON'S PLANNER (DONS_PLANNER.md): the daily brief, the requests for an audience, the datebook, the
 * black book, the standing orders and "what would the old man do?". Almost everything is read off the
 * systems that already exist (the scheduler, the phone, the evenings, the threats, the briefing, the
 * lieutenants, Your File). What is new and kept here is small:
 *
 *  - `done`: the datebook's ticks (what was on the book, and the one line that came of it, linked to Your File);
 *  - `notes`: margin notes the boss writes on a day's page (by absolute day);
 *  - `refused` / `lastRefused`: how often a man was turned away at the door (repeated refusals escalate);
 *  - `turned`: requests turned away this week (they leave the list; the matter itself stays on the Desk);
 *  - `auto`: the brief opens at the morning's first stop (default on);
 *  - `briefDay`: the last absolute day the brief was handed over (it opens once a day).
 *
 * Optional on GameState (old saves have none; upgradeSave tops it up when present, the first use makes it).
 */

export interface DoneTick {
  /** Absolute week, day of the week and hour it was on the book. */
  w: number;
  d: number;
  h: number;
  /** What was on the book. */
  t: string;
  /** The one line that came of it. */
  r: string;
  /** The Your File entry it wrote. */
  jid?: string;
  /** Who it was with. */
  who?: string;
  k: string;
}

export interface PlannerState {
  v: 1;
  done: DoneTick[];
  notes: Record<string, string>;
  refused: Record<string, number>;
  lastRefused: Record<string, number>;
  /** Audience key -> the week it was turned away. */
  turned: Record<string, number>;
  /** The brief opens itself at the morning's first stop. */
  auto: boolean;
  briefDay?: number;
}

export const DONE_CAP = 160;
export const NOTE_MAX = 280;

export function ensurePlanner(s: GameState): PlannerState {
  const p = (s.planner ??= { v: 1, done: [], notes: {}, refused: {}, lastRefused: {}, turned: {}, auto: true });
  p.done ??= [];
  p.notes ??= {};
  p.refused ??= {};
  p.lastRefused ??= {};
  p.turned ??= {};
  if (p.auto === undefined) p.auto = true;
  // Requests turned away in an earlier week come back if they are still standing.
  for (const [k, w] of Object.entries(p.turned)) if (w < s.week) delete p.turned[k];
  return p;
}

/** Read-only view (a fresh empty one when the save has none). */
export function plannerOf(s: GameState): PlannerState {
  return s.planner ?? { v: 1, done: [], notes: {}, refused: {}, lastRefused: {}, turned: {}, auto: true };
}

/** A copy of the state with its own planner record, for a pure edit. */
export function withPlanner(s: GameState, f: (p: PlannerState, x: GameState) => void): GameState {
  const P = plannerOf(s);
  const x: GameState = { ...s, planner: { ...P, done: P.done.slice(), notes: { ...P.notes }, refused: { ...P.refused }, lastRefused: { ...P.lastRefused }, turned: { ...P.turned } } };
  ensurePlanner(x);
  f(x.planner!, x);
  return x;
}

export function pushDone(p: PlannerState, t: DoneTick): void {
  p.done.push(t);
  if (p.done.length > DONE_CAP) p.done.splice(0, p.done.length - DONE_CAP);
}

/** A margin note on a day's page (empty clears it). */
export function setNote(s: GameState, abs: number, text: string): GameState {
  return withPlanner(s, (p) => {
    const t = text.slice(0, NOTE_MAX);
    if (t.trim()) p.notes[String(abs)] = t; else delete p.notes[String(abs)];
  });
}

export function setAutoBrief(s: GameState, on: boolean): GameState {
  return withPlanner(s, (p) => { p.auto = on; });
}

/** The brief was handed over today (it opens by itself once a day). */
export function markBrief(s: GameState, abs: number): GameState {
  if (plannerOf(s).briefDay === abs) return s;
  return withPlanner(s, (p) => { p.briefDay = abs; });
}
