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

/** Money the effects spend (`pot`: only what that pot pays; 'family' is everything not from the pocket). */
export function moneyCost(effects: readonly Effect[], pot?: 'family' | 'pocket'): number {
  return effects.reduce((a, e) => a + (e.type === 'money' && e.amount < 0 && (!pot || (pot === 'pocket') === (e.pot === 'pocket')) ? -e.amount : 0), 0);
}

/** The note for a cost, or undefined when it isn't a big bite. `pot: 'pocket'`: the boss's own money pays first. */
export function costHint(s: GameState, cost: number, pot?: 'pocket'): string | undefined {
  if (pot === 'pocket') {
    const pk = Math.max(0, s.tribute?.acct.personal ?? 0);
    if (cost <= pk) return cost >= COSTLY_MIN && cost >= pk * COSTLY_SHARE ? `${MARK} ${usd(cost)}, ${Math.round((100 * cost) / Math.max(1, pk))}% of your pocket.` : undefined;
    const short = cost - pk;
    if (short > s.money) return `${MARK} ${usd(cost)} is more than your pocket (${usd(pk)}) and Family money (${usd(Math.max(0, s.money))}) together.`;
    return `${MARK} your pocket covers ${usd(pk)}; the other ${usd(short)} comes out of Family money (${Math.round((100 * short) / Math.max(1, s.money))}% of it).`;
  }
  if (cost < COSTLY_MIN || (cost < s.money * COSTLY_SHARE && cost <= s.money)) return undefined;
  if (cost > s.money) return `${MARK} ${usd(cost)} is more than Family money holds (${usd(Math.max(0, s.money))}); this puts the Family in the red.`;
  const take = weeklyTake(s);
  const weeks = take > 0 ? Math.round(cost / take) : 0;
  return `${MARK} ${usd(cost)}, ${Math.round((100 * cost) / Math.max(1, s.money))}% of Family money${weeks >= 2 ? `, about ${weeks} weeks of the take` : ''}.`;
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
      const fam = moneyCost(c.effects, 'family');
      const hint = fam > 0 ? costHint(s, fam) : costHint(s, moneyCost(c.effects, 'pocket'), 'pocket');
      return hint && !c.detail?.includes(MARK) ? { ...c, detail: withCostHint(c.detail, hint) } : c;
    });
  }
}
