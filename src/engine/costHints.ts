import type { Choice, Effect, GameState } from './types';

/**
 * Says so when something is expensive. A popup answer or an order whose
 * up-front cost is a big bite out of the treasury (a quarter of it or more,
 * at least $1,000) gets a plain note: how many weeks of the take it is, and
 * whether it puts the treasury in the red. One rule for every system, so the
 * player always has the lever: read the price before saying yes.
 */

export const COSTLY_SHARE = 0.25;
export const COSTLY_MIN = 1000;
const MARK = 'Costly:';

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/** The week's take, from the last twelve weeks of gross income. */
function weeklyTake(s: GameState): number {
  const h = s.incomeHistory ?? [];
  return h.length ? h.reduce((a, b) => a + b, 0) / h.length : 0;
}

export function moneyCost(effects: readonly Effect[]): number {
  return effects.reduce((a, e) => a + (e.type === 'money' && e.amount < 0 ? -e.amount : 0), 0);
}

/** The note for a cost, or undefined when it isn't a big bite. */
export function costHint(s: GameState, cost: number): string | undefined {
  if (cost < COSTLY_MIN || (cost < s.money * COSTLY_SHARE && cost <= s.money)) return undefined;
  if (cost > s.money) return `${MARK} ${usd(cost)} is more than the treasury holds (${usd(Math.max(0, s.money))}); this puts you in the red.`;
  const take = weeklyTake(s);
  const weeks = take > 0 ? Math.round(cost / take) : 0;
  return `${MARK} ${usd(cost)}, ${Math.round((100 * cost) / Math.max(1, s.money))}% of the treasury${weeks >= 2 ? `, about ${weeks} weeks of the take` : ''}.`;
}

export function withCostHint(detail: string | undefined, hint: string | undefined): string | undefined {
  if (!hint || detail?.includes(MARK)) return detail;
  return detail ? `${detail} ${hint}` : hint;
}

/** Marks this week's expensive popup answers. */
export function markCostlyChoices(s: GameState): void {
  for (const ev of s.pendingEvents) {
    ev.choices = ev.choices.map((c: Choice) => {
      if (c.disabledReason) return c;
      const hint = costHint(s, moneyCost(c.effects));
      return hint && !c.detail?.includes(MARK) ? { ...c, detail: withCostHint(c.detail, hint) } : c;
    });
  }
}
