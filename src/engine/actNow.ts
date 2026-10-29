import type { GameState, PlayerAction } from './types';
import { actNow as settle, settlesNow, type NowResult } from './deeds/now';

/**
 * IMMEDIATE RESOLUTION (STREAMLINE §4.2): an order aimed at someone who is
 * there (a deed, an interaction, an ask, a woman, a date, a night out, a
 * bond, a gift) is settled the moment it is given: the roll on the deeds' own
 * dice stream (never `s.rng`), its hours and money charged once, its result
 * written once to Your File. Everything that takes days in the fiction
 * (schemes, builds, purchases, wars, trips, dirty work) stays queued and
 * lands at the week's turn, in the Desk's Results.
 */
export type ResultView = NowResult;

/** Settled now (true) or queued for the turn (false). */
export function instant(s: GameState, a: PlayerAction): boolean {
  return settlesNow(s, a);
}

/** Do it now. Pure; the same save and the same clicks give the same result. */
export function actNow(s: GameState, a: PlayerAction): { state: GameState; result: ResultView } {
  return settle(s, a);
}
