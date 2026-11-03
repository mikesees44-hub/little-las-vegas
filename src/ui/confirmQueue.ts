import type { PlayerAction } from '../engine/types';
import { sameOrder } from './verbs';

/**
 * "Are you sure?" waits in line. Two orders given at once (the Sit-Down's "Do what they recommend",
 * two Approves in a row) each get their own window: the second never replaces the first. Pure.
 * `a` undefined takes the front one off (answered or dismissed).
 */
export function nextConfirms(q: readonly PlayerAction[], a: PlayerAction | undefined): PlayerAction[] {
  if (!a) return q.slice(1);
  return q.some((x) => sameOrder(x, a)) ? [...q] : [...q, a];
}
