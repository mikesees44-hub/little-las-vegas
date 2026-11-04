import { opinion } from './relations';
import type { GameState, RivalId } from './types';

/**
 * PEACE PRESSURE (DECADE_BALANCE Top 10 #10: 1.4–3.7 new wars a year was too many for a decade).
 *  - A rival who just ended a war with you stays quiet for WAR_QUIET weeks.
 *  - A third war on you within WAR_WINDOW weeks needs a casus belli: a feud, a legitimate grievance
 *    (you killed a made man without the Table), or a rival who hates you.
 * The player's own declarations are never limited here (no option is removed).
 */
export const WAR_QUIET = 26;
export const WAR_WINDOW = 104;

/** May this rival bring a new war to the player now? */
export function warPeace(s: GameState, rival: RivalId): boolean {
  const ended = s.flags[`warEnd_${rival}`];
  if (ended !== undefined && s.week - ended < WAR_QUIET) return false;
  const second = s.flags.rwar2;
  if (second !== undefined && second > 0 && s.week - second < WAR_WINDOW) {
    const r = s.rivals.find((x) => x.id === rival);
    if (!r) return false;
    const legit = (s.power?.legit?.[rival] ?? 0) >= s.week;
    if (!(r.feud || legit || opinion(s, r.leaderId, s.playerId) <= -60)) return false;
  }
  return true;
}

/** A rival brought a war: remember the week (the last two are kept). */
export function noteRivalWar(s: GameState): void {
  if (s.flags.rwar1 !== undefined) s.flags.rwar2 = s.flags.rwar1;
  s.flags.rwar1 = s.week;
}
