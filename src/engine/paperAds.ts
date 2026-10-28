import type { GameState } from './types';

/**
 * Ads in the town papers (paper.ts) for the boss's places. Kept apart (no
 * imports) so the venue model (empireOps.ts) can read the lift without
 * pulling in the papers.
 */

/** Weeks an ad order runs. */
export const AD_WEEKS = 4;
/** Walk-in trade with an ad running. */
export const AD_LIFT = 1.15;

/** The walk-in multiplier for a place this week: 'venue:<id>' or 'biz:<id>' (a venue also counts its business's ad). */
export function adLift(s: GameState, ...keys: (string | undefined)[]): number {
  const ads = s.paper?.ads;
  if (!ads) return 1;
  return keys.some((k) => k !== undefined && (ads[k] ?? -1) >= s.week) ? AD_LIFT : 1;
}
