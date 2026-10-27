import { CAPO_CUT, districtTake } from './economy';
import { fmtMoney } from './effects';
import type { Effect, GameState } from './types';

/**
 * RECURRING EFFECTS: a choice that changes something every week from now on
 * (a capo's contract, a loan's payments) is explained by what it does every
 * week, not by what it does today. "Sal keeps 35% instead of 30%" reads as
 * "nothing changes" unless it says what it costs the Family each week.
 *
 * Every figure is an estimate at this week's take and says so. Pure.
 */

export interface Recurring {
  /** One sentence: what changes every week, and for how long. */
  text: string;
  /** Money for the Family per week (negative: the Family gets less). */
  weekly: number;
  /** Weeks it runs (undefined: until you change it). */
  weeks?: number;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** What one effect does every week from now on, if anything. */
export function recurringOf(s: GameState, e: Effect): Recurring | undefined {
  switch (e.type) {
    case 'contract': {
      const c = s.characters[e.charId];
      if (!c) return undefined;
      const old = c.keep ?? CAPO_CUT;
      if (Math.abs(old - e.keep) < 0.001) return undefined;
      const d = s.districts.find((x) => x.capoId === c.id);
      if (!d) return { text: `${c.firstName} would keep ${pct(e.keep)} instead of ${pct(old)} of a district's take, every week, until you change his contract. He runs no district right now, so it costs nothing until he gets one.`, weekly: 0 };
      const take = districtTake(s, d.id);
      const weekly = Math.round((old - e.keep) * take);
      const dir = weekly < 0 ? 'less' : 'more';
      return {
        text: `Every week from now: ${c.firstName} keeps ${pct(e.keep)} of ${d.name}'s take instead of ${pct(old)}, so about ${fmtMoney(Math.abs(weekly))}/wk ${dir} comes up to the Family (estimate, at this week's take of ~${fmtMoney(Math.round(take))}). It stays until you change his contract${weekly < 0 ? '; over a year that is about ' + fmtMoney(Math.abs(weekly) * 52) : ''}.`,
        weekly,
      };
    }
    case 'debt':
      return { text: `Every week for ${e.weeks} weeks: ${fmtMoney(e.weeklyPayment)} to the lender (${fmtMoney(e.weeklyPayment * e.weeks)} in all).`, weekly: -e.weeklyPayment, weeks: e.weeks };
    default:
      return undefined;
  }
}

/** Every recurring change in a list of effects. */
export function recurringOfAll(s: GameState, effects: readonly Effect[]): Recurring[] {
  return effects.map((e) => recurringOf(s, e)).filter((x): x is Recurring => !!x);
}

/** Rough dollar-equivalent of a recurring change: half a year of it (for ranking; never shown as money). */
export function recurringValue(s: GameState, e: Effect): number {
  const r = recurringOf(s, e);
  if (!r) return 0;
  return r.weekly * Math.min(26, r.weeks ?? 26);
}
