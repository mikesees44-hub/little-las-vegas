import type { ActionPreview } from '../actions';
import { fmtMoney } from '../effects';
import type { Ctx } from '../ledger';
import type { GameState } from '../types';
import { applyDeed, deedPreview, rollTier } from './resolve';
import { ensureDeeds } from './state';
import { DEED_CAT_LABEL, type DeedAction } from './types';

/**
 * The boss's deed as an order (actions.ts): previewed now with every reason,
 * every cost, the cooldown and the four outcomes; the up-front costs land when
 * the week turns, then the roll decides which outcome follows (commit).
 */
export function previewDeedAction(s: GameState, a: DeedAction): ActionPreview {
  const p = deedPreview(s, a.id, s.playerId, a.target, { via: a.via, hook: a.hook });
  if (!p) return { title: 'Nothing to do', effects: [], cost: 0, because: '', disabledReason: 'Not possible with this person', category: 'event' };
  const money = p.cost.money ?? 0;
  const bits = [p.text];
  if (p.cost.respect) bits.push(`Puts ${p.cost.respect} respect on the line.`);
  if (p.cost.owed) bits.push('Spends the favor he owes you.');
  if (p.cost.hook) bits.push('Spends your hook on him.');
  if (p.def.cooldown < 999) bits.push(`Then not again with him for ${p.def.cooldown} weeks.`);
  return {
    title: p.title,
    detail: bits.join(' '),
    effects: p.costFx,
    cost: money,
    ...(p.cost.pot === 'pocket' ? { pot: 'pocket' as const } : {}),
    because: `${p.def.cat === 'intrigue' && p.def.hostile ? 'moved against' : 'dealt with'} ${s.characters[a.target]?.firstName ?? 'him'} (${DEED_CAT_LABEL[p.def.cat].toLowerCase()})`,
    disabledReason: p.blocked ?? (money && !p.cost.pot && money > s.money ? `Needs ${fmtMoney(money)}` : undefined),
    category: 'event',
    ...(p.acceptance ? { odds: p.acceptance, oddsLabel: p.def.mode === 'consent' ? 'He says yes' : 'It works' } : {}),
    outcomes: p.tiers.map((t) => ({ tier: t.r, label: t.label, chance: t.p, text: t.line, effects: t.fx })),
    cooldown: p.def.cooldown < 999 ? p.def.cooldown : undefined,
  };
}

/** The roll, once the costs are paid. */
export function commitDeedAction(ctx: Ctx, a: DeedAction): void {
  const p = deedPreview(ctx.s, a.id, ctx.s.playerId, a.target, { via: a.via, hook: a.hook });
  if (!p || p.blocked) return;
  const r = rollTier(ensureDeeds(ctx.s), p);
  applyDeed(ctx, p, r, true);
}
