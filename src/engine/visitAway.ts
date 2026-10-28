import { nowDay, visitOn, type Visit } from './travelState';
import { shortName } from './visitData';
import type { GameState, PlayerAction } from './types';

/**
 * While the boss is in another city himself (visit.ts), what he can and
 * cannot do from there. Light on purpose: actions.ts and days.ts ask it
 * without importing the visit engine.
 *
 * Home-only orders are the ones he gives in person in Wildwood: buying and
 * selling places, the loan desk, seeing people face to face, City Hall,
 * the house, the street. They stay on screen, disabled, with the reason
 * ("You're in Philly"). Orders through the chain (the underboss, a capo),
 * schemes his men carry out, the council, edicts, the books and the
 * envelope go by telephone and stay open.
 */

const HOME_ONLY: ReadonlySet<PlayerAction['kind']> = new Set<PlayerAction['kind']>([
  'buyBusiness', 'sellBusiness', 'lend', 'findFrontMan', 'charterBank', 'casino', 'interact', 'pushDistrict', 'hire',
  'dynasty', 'officeHours', 'econ', 'hood', 'living', 'talk', 'pol', 'ears', 'dating', 'bond',
]);

/** Is this kind of order given in person at home? (Direct orders are; orders through the chain are not.) */
export function isHomeOnly(a: PlayerAction): boolean {
  if (a.kind === 'order') return a.via === 'direct';
  return HOME_ONLY.has(a.kind);
}

/** The visit that has the boss out of Wildwood right now. */
export function visitNow(s: GameState): Visit | undefined {
  return s.travel?.visits?.length ? visitOn(s, nowDay(s)) : undefined;
}

/** Where he is, in his words: "You're in Philly", "You're on the road to Philly". */
export function whereAway(s: GameState, v: Visit, day = nowDay(s)): string {
  const name = shortName(v.cityId);
  if (day < v.arriveDay) return `You're on the road to ${name}`;
  if (v.leaveDay !== undefined && day >= v.leaveDay) return `You're on the road home from ${name}`;
  return `You're in ${name}`;
}

/** Why an order can't be given while the boss is away (undefined: he can give it, or he is home). */
export function homeOnlyBlock(s: GameState, a: PlayerAction): string | undefined {
  const v = visitNow(s);
  if (!v || !isHomeOnly(a)) return undefined;
  const where = whereAway(s, v);
  return a.kind === 'order' ? `${where}: orders go through the underboss or a capo` : where;
}
