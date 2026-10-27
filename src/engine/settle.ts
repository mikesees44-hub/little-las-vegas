import type { GameState } from './types';

/**
 * EXACTLY-ONCE SETTLEMENT (B04).
 *
 * `advanceWeek` is pure: the same state and choices always give the same
 * result, and the account journal is keyed (tribute.ts `xfer`), so one call
 * can't pay anything twice. What could repeat is the *commit*: two triggers in
 * the same moment (the clock reaching Sunday night and a click on Advance
 * Week, or a double click) each settle the same week from the same state, and
 * both results get applied. This module is the gate the UI commits through:
 * a week is accepted once, and only onto the state it was computed from.
 */

/** Identifies one week of one game: the thing that may be settled once. */
export interface SettledMark { seed: string; week: number }

/** May a settlement computed from `input` be committed, given the last week committed? */
export function mayCommit(last: SettledMark | undefined, input: Pick<GameState, 'seed' | 'week'>): boolean {
  return !last || last.seed !== input.seed || input.week > last.week;
}

/**
 * The state to keep: the result if it was computed from the state we still
 * hold (same game, same week), else what we hold (a stale or duplicate
 * settlement is dropped, never applied on top).
 */
export function acceptSettlement(current: GameState, input: GameState, result: GameState): GameState {
  if (current === input) return result;
  if (current.seed !== input.seed || current.week !== input.week) return current;
  return result.week > current.week ? result : current;
}
