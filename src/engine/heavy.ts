import { previewAction } from './actions';
import type { Effect, GameState, PlayerAction } from './types';

/**
 * ONE CONFIRM (STREAMLINE §4.4): the decision card IS the confirmation. Only
 * an order that cannot be taken back, or that spends a big share of the
 * Family's money, turns the card over to "Are you sure?":
 *   a death or a whack · declaring war · disinheriting · selling a place ·
 *   ≥25% of Family money or ≥$10,000.
 * Everything else is given on the card, at once. Pure.
 */
export const HEAVY_MONEY = 10_000;
export const HEAVY_SHARE = 0.25;

const killing = (fx: readonly Effect[]) => fx.some((e) => e.type === 'kill' || (e.type === 'startScheme' && e.scheme.kind === 'murder'));

/** Why this order is heavy (one line each), or undefined when it is not. */
export function heavyOf(s: GameState, a: PlayerAction): string[] | undefined {
  const out: string[] = [];
  const p = previewAction(s, a);
  const r = a as { kind: string; id?: string; op?: Record<string, unknown> };
  if ((r.kind === 'interact' && r.id === 'whack') || (r.kind === 'scheme' && (a as { scheme?: string }).scheme === 'murder')
    || (r.kind === 'dirty' && (r.op as { job?: string } | undefined)?.job === 'hit') || killing(p.effects)) out.push('A man dies. It cannot be taken back.');
  if (r.kind === 'declareWar' || p.effects.some((e) => e.type === 'warStart')) out.push('War with a family: men will die on both sides.');
  if (r.kind === 'dynasty' && (r.op as { tag?: string; remove?: boolean } | undefined)?.tag === 'disinherited' && !(r.op as { remove?: boolean }).remove) out.push('Disinheriting your own blood: the house will talk about it for years.');
  if (r.kind === 'sellBusiness' || (r.kind === 'econ' && /^sell/.test(String((r.op as { type?: string; op?: string } | undefined)?.type ?? (r.op as { op?: string } | undefined)?.op ?? '')))) out.push('Selling a place: once it is gone, it is gone.');
  const cost = p.cost || 0;
  if (cost >= HEAVY_MONEY) out.push(`$${cost.toLocaleString('en-US')}: a big order.`);
  else if (s.money > 0 && cost >= s.money * HEAVY_SHARE && p.pot !== 'pocket') out.push(`$${cost.toLocaleString('en-US')}: ${Math.round((cost / s.money) * 100)}% of the Family's money.`);
  return out.length ? out : undefined;
}

export function isHeavy(s: GameState, a: PlayerAction): boolean {
  return !!heavyOf(s, a);
}
