import { DAY_PAUSES } from '../engine/attention';
import type { GameState } from '../engine/types';

/**
 * THE CLOCK RUNS (Crusader Kings style; the owner's rule: "the clock needs to move"). Pure policy,
 * tested on its own (tests/clock.test.ts):
 *
 *  - Running is the default. The boss pauses (Space) to set up, picks a speed (1-5), or skips ahead
 *    (to the next morning, the next week, the next month).
 *  - Menus never stop it. Only a DECISION CARD (a decision, an urgent meeting, the ready-to-advance
 *    review, the sit-down, a cutscene, a minigame) holds the clock while it is open.
 *  - It pauses itself for what a boss must see, each a setting: a new red item on the Desk, an urgent
 *    meeting, a battle or a war declared, a death in the family, a plot against him uncovered. Every
 *    pause is said once (a red item paused for is not paused for again). Everything routine flows.
 *  - Number keys: 1-5 set the speed only while no decision card is open; inside a card they pick a
 *    choice, as always.
 */
export type ClockSpeed = 0 | 1 | 2 | 3 | 4 | 5;
/** Milliseconds per day at each speed. */
// A CK pace (the playthrough: speed 1 ran two days in five seconds): about five seconds a day at the slowest.
export const CLOCK_MS: Record<Exclude<ClockSpeed, 0>, number> = { 1: 5000, 2: 3000, 3: 1800, 4: 900, 5: 350 };
export const CLOCK_NAME: Record<ClockSpeed, string> = { 0: 'Paused', 1: 'Slow', 2: 'Normal', 3: 'Brisk', 4: 'Fast', 5: 'Fastest' };
/** The speed a new game (and a loaded one) starts at. */
export const DEFAULT_SPEED: ClockSpeed = 2;

/** The 1-5 keys: the speed they set, only when no decision card is open (inside a card they pick a choice). */
export function speedKey(key: string, cardOpen: boolean): ClockSpeed | undefined {
  if (cardOpen || !/^[1-5]$/.test(key)) return undefined;
  return Number(key) as ClockSpeed;
}

// The pure core moved to the engine (engine/turnCrisis.ts) so a turn can stop for the same things; re-exported here.
export { autoPauses, firstPause, PAUSE_CATS, redKeys, type PauseCat, type PauseCatKey, type PauseWhy } from '../engine/turnCrisis';

/**
 * THE PAUSE BUDGET (DAILY_LOGIC B2): at most DAY_PAUSES stops a game day for what can wait (a
 * warning, a headline, a capo's morning, a plot, an EXTRA); a red item, an urgent meeting, a war,
 * a death and a strike stop the clock whenever they come (and count toward the day).
 */
export const IMMEDIATE: ReadonlySet<string> = new Set<string>(['red', 'urgent', 'war', 'death', 'strike']);
export interface PauseLedger { key: string; n: number }
export function budgetPause(l: PauseLedger | undefined, dayKey: string, cat: string, max = DAY_PAUSES): { ok: boolean; ledger: PauseLedger } {
  const cur = l && l.key === dayKey ? l : { key: dayKey, n: 0 };
  if (IMMEDIATE.has(cat)) return { ok: true, ledger: { key: dayKey, n: cur.n + 1 } };
  if (cur.n >= max) return { ok: false, ledger: cur };
  return { ok: true, ledger: { key: dayKey, n: cur.n + 1 } };
}

/** The day's key for the budget ("week:day"). */
export function dayKey(s: GameState): string {
  return `${s.week}:${s.days && s.days.week === s.week ? s.days.day : 0}`;
}
