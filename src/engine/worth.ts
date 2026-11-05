import { expectedTake, isOpen } from './business';
import { CATALOG, seasonalMult } from './catalog';
import { isInSeason } from './calendar';
import { holderOf, yearMult } from './earners';
import type { Business, GameState } from './types';

/**
 * WHAT A PLACE IS WORTH. What you buy goes up in value while you hold it
 * (about a fifth a year, up to +80%), and a place that is open and earning is
 * worth more again: a buyer pays for the money it makes (half a year of its
 * net). Selling gets you 90% of that; leasing it out gets you a steady rent
 * with no upkeep and no worry. Pure.
 */

export const APPREC_WEEK = 0.004;
export const APPREC_MAX = 0.8;
/** Weeks of net earnings a buyer pays for a place that is open and earning. */
export const INCOME_WEEKS = 26;

/** Weeks held (a place you had before the story began counts as a year). */
export const heldWeeks = (s: GameState, boughtWeek: number | undefined) => (boughtWeek === undefined ? 52 : Math.max(0, s.week - boughtWeek));

export const growthOf = (weeksHeld: number) => Math.min(APPREC_MAX, Math.max(0, weeksHeld) * APPREC_WEEK);

/** What a place brings in a week across the whole year (the season and the dead months averaged). */
export function yearTake(s: GameState, b: Business): number {
  if (b.leasedTo) return b.leaseRent ?? 0;
  const now = seasonalMult(b.kind, isInSeason(s.date));
  const t = expectedTake(s, b);
  if (holderOf(s, b.id)) return t;
  return Math.round(now > 0 ? (t * yearMult(b.kind)) / now : b.weeklyBase * yearMult(b.kind));
}

export function bizWorth(s: GameState, b: Business): { worth: number; paid: number; growth: number; income: number } {
  const paid = b.cost ?? CATALOG[b.kind].cost;
  const held = heldWeeks(s, b.boughtWeek);
  const growth = growthOf(held);
  const open = isOpen(s, b);
  const net = b.leasedTo ? (b.leaseRent ?? 0) : Math.max(0, yearTake(s, b) - b.upkeep);
  // A buyer pays for a track record: the earnings count in full after half a year in your hands.
  const income = open ? Math.round(net * INCOME_WEEKS * Math.min(1, held / INCOME_WEEKS)) : 0;
  const worth = Math.round((paid * (1 + growth) * (open ? 1 : 0.6) + income) / 50) * 50;
  return { worth, paid, growth, income };
}

/** What a buyer pays today (90% of its worth). */
export const bizSalePrice = (s: GameState, b: Business) => Math.round((bizWorth(s, b).worth * 0.9) / 50) * 50;

/** Can it be leased to an operator? Fronts with no books of their own (the clubs, motels and restaurants run on theirs). */
export function leasable(b: Business): boolean {
  const def = CATALOG[b.kind];
  return def.category === 'front' && !['restaurant', 'bar', 'club', 'supperclub', 'motel', 'boarding', 'casino'].includes(b.kind);
}

/** The rent an operator pays a week: he keeps the place, pays the upkeep, and hands you about 55% of its net. */
export function bizLeaseRent(s: GameState, b: Business): number {
  return Math.max(10, Math.round((Math.max(0, yearTake(s, b) - b.upkeep) * 0.55) / 5) * 5);
}
