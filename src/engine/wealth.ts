import { owned as ownedLux, resaleValue } from './goodlife';
import { spendPossessions } from './spend';
import { pocketCash } from './tributeState';
import type { Character, GameState } from './types';

/**
 * ONE ANSWER TO "HOW MUCH MONEY DOES HE HAVE". Every screen that shows a
 * person's own money reads it here, so the top bar, the character sheet and
 * the money screens can never disagree.
 *
 *  - Own money (liquid, spendable): for the sitting boss it is his Pocket
 *    (`tribute.acct.personal`), the account the Good Life, gifts and
 *    evenings are paid from. For everyone else it is `Character.wealth`.
 *  - Savings (the boss only): `Character.wealth` of the boss is the private
 *    nest egg he had before the chair, and what passes to his heir at his
 *    death (dynasty.ts). It is not in the Pocket and nothing spends it.
 *  - Possessions (the boss only): what the Good Life would fetch if sold.
 *  - Net worth: own money + savings + possessions. Family money is the
 *    Family's, never part of a man's net worth.
 */

export interface Wealth {
  /** Liquid, spendable money (the boss's Pocket; everyone else's own money). */
  own: number;
  /** The boss's private savings outside the Pocket (0 for everyone else). */
  savings: number;
  /** Resale value of the boss's homes, cars, boats and toys (0 for everyone else). */
  possessions: number;
  /** own + savings + possessions. */
  net: number;
  /** True when `own` is the boss's Pocket. */
  isPocket: boolean;
}

const r = (n: number) => Math.round(n);

/** Is this the sitting boss (whose own money is the Pocket)? */
export function isPocketHolder(s: GameState, c: Pick<Character, 'id'> | string): boolean {
  const id = typeof c === 'string' ? c : c.id;
  return id === s.playerId;
}

/** A person's liquid own money: the Pocket for the boss, `wealth` for everyone else. */
export function ownMoney(s: GameState, c: Pick<Character, 'id' | 'wealth'>): number {
  return isPocketHolder(s, c) ? r(pocketCash(s)) : r(c.wealth);
}

/** What the boss's possessions would fetch (0 when nothing is owned or for anyone else). */
export function possessionsValue(s: GameState, c: Pick<Character, 'id'>): number {
  if (!isPocketHolder(s, c)) return 0;
  try {
    return r(ownedLux(s).reduce((a, o) => a + resaleValue(s, o), 0) + (s.spend ? spendPossessions(s) : 0));
  } catch {
    return 0;
  }
}

/** The full picture for one person. */
export function wealthOf(s: GameState, c: Pick<Character, 'id' | 'wealth'>): Wealth {
  const isPocket = isPocketHolder(s, c);
  const own = ownMoney(s, c);
  const savings = isPocket ? r(Math.max(0, c.wealth)) : 0;
  const possessions = possessionsValue(s, c);
  return { own, savings, possessions, net: own + savings + possessions, isPocket };
}

/** Net worth (own money + savings + possessions); never includes Family money. */
export function netWorth(s: GameState, c: Pick<Character, 'id' | 'wealth'>): number {
  return wealthOf(s, c).net;
}
