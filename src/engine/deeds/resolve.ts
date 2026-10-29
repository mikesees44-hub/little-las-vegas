import { isFree } from '../characters';
import { applyEffects, fmtMoney } from '../effects';
import { playerHook } from '../interactions';
import type { Ctx } from '../ledger';
import type { Effect, GameState } from '../types';
import { acceptance, type Acceptance, type Reason } from './accept';
import { cash, copOnPad, DEEDS, type Cost, type DeedDef, type DX } from './catalog';
import { cooldownLeft, d01, ensureDeeds } from './state';
import { TIER_LABEL, type DeedId, type DeedsState, type Tier } from './types';

/**
 * THE RESOLVER. A deed's full preview for any pair (who may do it, the cost,
 * the cooldown, the odds and every reason behind them, the four outcomes
 * with their chances and effects), and the roll that decides it. The boss's
 * orders go through actions.ts (preview now, roll when the week turns); the
 * NPCs' deeds are rolled here, on the deeds' own dice.
 */

export interface TierView { r: Tier; label: string; p: number; fx: Effect[]; line: string }

export interface DeedPreview {
  def: DeedDef;
  x: DX;
  title: string;
  text: string;
  /** Why it can't be done now (shown, greyed). */
  blocked?: string;
  /** Weeks left before it may be tried again on him. */
  cooldown: number;
  cost: Cost;
  /** The up-front costs as effects (paid whatever happens). */
  costFx: Effect[];
  /** The odds and their reasons (absent for an order: it is done). */
  acceptance?: Acceptance;
  /** 0..1 */
  chance: number;
  tiers: TierView[];
}

export const CRIT = 0.15;
export const CRIT_FAIL = 0.2;

/** The four outcomes' chances for a success chance p. */
export function tierOdds(def: DeedDef, p: number): Record<Tier, number> {
  if (def.mode === 'order') return { crit: 0, success: 1, fail: 0, critFail: 0 };
  const c = def.crit ?? CRIT;
  const cf = def.critFail ?? CRIT_FAIL;
  return { crit: p * c, success: p * (1 - c), fail: (1 - p) * (1 - cf), critFail: (1 - p) * cf };
}

/** Which outcome a 0..1 roll lands on. */
export function tierOf(def: DeedDef, p: number, roll: number): Tier {
  const o = tierOdds(def, p);
  if (roll < o.crit) return 'crit';
  if (roll < o.crit + o.success) return 'success';
  if (roll < o.crit + o.success + o.fail) return 'fail';
  return 'critFail';
}

function costEffects(x: DX, c: Cost): Effect[] {
  const out: Effect[] = [];
  if (c.money) out.push(cash(x.s, x.a, -c.money, c.pot === 'pocket' ? 'pocket' : 'family'));
  if (c.favors && x.boss) out.push({ type: 'favor', amount: -c.favors });
  if (c.hook && x.boss) out.push({ type: 'hook', targetId: x.t.id, strong: false, reason: 'Called in', spend: true });
  if (c.owed) out.push({ type: 'deed', op: { op: 'spendOwed', by: x.t.id, to: x.a.id } });
  return out;
}

/** What blocks a deed for this pair right now (beyond `can`): jail, money, favors, the cooldown. */
function blockOf(x: DX, def: DeedDef, c: Cost, cd: number): string | undefined {
  if (!isFree(x.s, x.a)) return x.boss ? 'You are inside' : 'He is inside';
  if (!isFree(x.s, x.t) && def.id !== 'frame') return `${x.t.firstName} is inside`;
  if (cd > 0) return `Tried lately: again in ${cd} week${cd === 1 ? '' : 's'}`;
  if (c.money && x.boss && c.pot !== 'pocket' && x.s.money < c.money) return `Needs ${fmtMoney(c.money)}`;
  if (c.money && !x.boss && x.a.wealth < c.money) return `${x.a.firstName} can't afford it`;
  if (c.favors && x.boss && x.s.favors < c.favors) return `Needs ${c.favors} favor${c.favors === 1 ? '' : 's'}`;
  return undefined;
}

/**
 * The full preview of `a` doing deed `id` to `t`; undefined when the deed is
 * not offered for this pair at all. Pure.
 */
export function deedPreview(s: GameState, id: DeedId, aId: string, tId: string, opts: { via?: string; hook?: boolean } = {}): DeedPreview | undefined {
  const def = DEEDS[id];
  const a = s.characters[aId];
  const t = s.characters[tId];
  if (!def || !a?.alive || !t?.alive || a.id === t.id) return undefined;
  const boss = a.id === s.playerId;
  const via = opts.via ? s.characters[opts.via] : id === 'frame' && boss ? copOnPad(s) : undefined;
  const x: DX = { s, a, t, boss, tBoss: t.id === s.playerId, ...(via ? { via } : {}), ...(opts.hook ? { hook: true } : {}) };
  const can = def.can(x);
  if (can === undefined) return undefined;
  const cost = def.cost?.(x) ?? {};
  const extra: Reason[] = def.extra?.(x) ?? [];
  const hk = boss && opts.hook && def.mode === 'consent' ? playerHook(s, t.id) : undefined;
  if (hk) extra.push({ label: hk.strong ? `Strong hook: ${hk.reason}` : `Weak hook: ${hk.reason} (spent)`, value: hk.strong ? 80 : 40 });
  const acc = def.mode === 'order' ? undefined : acceptance(s, a, t, {
    mode: def.mode, base: def.base, recv: def.recv, gives: def.gives, opW: def.opW, fearW: def.fearW, trustW: def.trustW, skill: def.skill, friendly: def.friendly,
  }, extra);
  const chance = acc?.chance ?? 1;
  const odds = tierOdds(def, chance);
  const tiers: TierView[] = (['crit', 'success', 'fail', 'critFail'] as Tier[]).filter((r) => odds[r] > 0).map((r) => {
    const o = def.out(x, r);
    return { r, label: TIER_LABEL[r], p: odds[r], fx: o.fx, line: o.line };
  });
  const cd = cooldownLeft(s, id, a.id, t.id);
  const costFx = [...costEffects(x, cost), ...(hk && !hk.strong ? [{ type: 'hook', targetId: t.id, strong: false, reason: hk.reason, spend: true } as Effect] : [])];
  const blocked = typeof can === 'string' ? can : blockOf(x, def, cost, cd);
  return { def, x, title: def.name(x), text: def.text, ...(blocked ? { blocked } : {}), cooldown: cd, cost, costFx, ...(acc ? { acceptance: acc } : {}), chance, tiers };
}

/** Every deed `a` could do to `t` (blocked ones included), in catalog order. */
export function deedsFor(s: GameState, aId: string, tId: string): DeedPreview[] {
  const out: DeedPreview[] = [];
  for (const id of Object.keys(DEEDS) as DeedId[]) {
    const p = deedPreview(s, id, aId, tId);
    if (p) out.push(p);
  }
  return out;
}

/** Roll the outcome on the deeds' own dice. */
export function rollTier(D: DeedsState, p: DeedPreview): Tier {
  return tierOf(p.def, p.chance, d01(D));
}

/**
 * Carry out a rolled deed: its outcome's effects through the one ledger, and
 * the note (log, cooldown, memories). `paid`: the costs were already taken
 * (the boss's order took them as the week turned).
 */
export function applyDeed(ctx: Ctx, p: DeedPreview, r: Tier, paid = false): string {
  const tv = p.tiers.find((x) => x.r === r) ?? { fx: p.def.out(p.x, r).fx, line: p.def.out(p.x, r).line };
  const fx: Effect[] = [
    ...(paid ? [] : p.costFx),
    ...tv.fx,
    { type: 'deed', op: { op: 'note', id: p.def.id, a: p.x.a.id, t: p.x.t.id, r, x: tv.line, p: Math.round(p.chance * 100), cd: p.def.cooldown } },
  ];
  applyEffects(ctx, fx, { label: p.title, because: `${p.def.id === 'insult' ? 'traded words' : 'dealt'} with ${p.x.t.firstName}`, category: 'event' });
  return tv.line;
}

/** Roll and carry out a deed now (NPCs; scenes; answers). Returns the line, or undefined if it can't be done. */
export function doDeed(ctx: Ctx, id: DeedId, aId: string, tId: string, opts: { via?: string } = {}): { r: Tier; line: string } | undefined {
  const p = deedPreview(ctx.s, id, aId, tId, opts);
  if (!p || p.blocked) return undefined;
  const D = ensureDeeds(ctx.s);
  const r = rollTier(D, p);
  return { r, line: applyDeed(ctx, p, r) };
}

/** "62% — he will accept" / "45% to work" / "Certain". */
export function oddsWord(p: DeedPreview): string {
  if (!p.acceptance) return 'Certain';
  const pct = Math.round(p.chance * 100);
  return p.def.mode === 'consent' ? `${pct}% he says yes` : `${pct}% it works`;
}
