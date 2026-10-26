import { capos } from './characters';
import { money, type Ctx } from './ledger';
import { addOpinion } from './relations';
import { xfer } from './tribute';
import { ensureTribute } from './tributeState';
import type { Effect, GameState } from './types';

/**
 * YOUR POCKET, SPENT. The boss's own things (the Good Life, gifts, dinners, vacations, his family's
 * parties) are paid from his Pocket. If the Pocket is short, the rest comes out of the Family in the same
 * tap ("dipping"), and the capos notice a boss who dips too often: the first dip in DIP.window weeks is
 * free, every further one costs the boss DIP.step opinion with each capo (up to DIP.max).
 * A "draw" (Family → Pocket on the Money screen) counts as a dip too.
 */
export const DIP = { window: 8, step: 2, max: 6 } as const;

const $ = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/** Dips (draws and short purchases) in the last DIP.window weeks. */
export function recentDips(s: GameState): number {
  return (s.tribute?.dips ?? []).filter((w) => s.week - w < DIP.window).length;
}

/** What the capos think if the boss dips once more now (0 or negative); `queued`: dips already ordered this week. */
export function dipPenalty(s: GameState, queued = 0): number {
  const n = recentDips(s) + queued;
  return n < 1 ? 0 : -Math.min(DIP.max, DIP.step * n);
}

/** A display-only chip (no state change) saying what a dip costs. */
export function dipNote(s: GameState): Effect {
  const p = dipPenalty(s);
  const n = recentDips(s);
  return {
    type: 'econ', op: { op: 'note', text: p ? `The capos notice: ${p} opinion each (dip ${n + 1} in ${DIP.window} weeks)` : `First dip in ${DIP.window} weeks: the capos let it go` },
    label: 'Dipping into the Family',
  };
}

/** Record a dip and apply what the capos think of it. */
export function noteDip(ctx: Ctx): void {
  const s = ctx.s;
  const t = ensureTribute(s);
  const p = dipPenalty(s);
  if (p) for (const c of capos(s)) addOpinion(s, c.id, s.playerId, 'The boss keeps dipping into the family\'s money', p, 1);
  t.dips = [...(t.dips ?? []), s.week].slice(-12);
}

/**
 * Pay `amount` for one of the boss's own things: the Pocket first, the rest from the Family
 * (a dip, unless `quiet` — the household bills and the Good Life upkeep are not dips).
 */
export function spendPocket(ctx: Ctx, amount: number, label: string, key: string, quiet = false): void {
  const s = ctx.s;
  const t = ensureTribute(s);
  const a = Math.round(amount);
  if (!(a > 0)) return;
  const own = xfer(ctx, 'personal', 'ext:household', Math.min(a, Math.max(0, t.acct.personal)), 'expense', `w${s.week}:pk:${key}:${t.journal.length}`, { note: label });
  const rest = a - own;
  if (rest > 0) {
    money(ctx, -rest, own > 0 ? `${label} (the rest, ${$(rest)}, from the Family)` : `${label} (from the Family: your pocket was empty)`, 'cost');
    if (!quiet) noteDip(ctx);
  }
}

/** Money for the boss himself (selling one of his things): straight into the Pocket. */
export function earnPocket(ctx: Ctx, amount: number, label: string, key: string): void {
  const s = ctx.s;
  const t = ensureTribute(s);
  xfer(ctx, 'ext:sale', 'personal', Math.round(amount), 'transfer', `w${s.week}:pk+:${key}:${t.journal.length}`, { note: label });
}

export interface PocketPrice {
  /** The effect that pays it (from the Pocket, the rest from the Family). */
  effects: Effect[];
  /** What the Pocket cannot cover now (0 when it can). */
  short: number;
  /** Blocked: not even the Family can cover the rest. */
  why?: string;
}

/**
 * The price of one of the boss's own things, for a preview: the paying effect, what the Pocket is short,
 * and (when short) the capos' reaction as a chip. `pocketLeft` is the Pocket after this week's other orders.
 */
export function pocketPrice(s: GameState, price: number, label: string, pocketLeft = s.tribute?.acct.personal ?? 0): PocketPrice {
  const p = Math.round(price);
  const short = Math.max(0, p - Math.max(0, pocketLeft));
  const effects: Effect[] = [{ type: 'money', amount: -p, pot: 'pocket', label }];
  if (short > 0) effects.push(dipNote(s));
  const why = short > 0 && s.money < short ? `Needs ${$(p)}: your pocket has ${$(Math.max(0, pocketLeft))} and the Family ${$(Math.max(0, s.money))}` : undefined;
  return { effects, short, why };
}
