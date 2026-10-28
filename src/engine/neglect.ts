import { crew, isFree } from './characters';
import { shiftInfluence } from './effects';
import { heat, money, type Ctx } from './ledger';
import { addOpinion } from './relations';
import { chance } from './rng';
import type { EventInstance, GameState, PlayerChoices } from './types';
import { FACTION_NAMES } from './world';
import { ltCover } from './lieutenants';

/**
 * AN ABSENT BOSS (playtest MAKE_IT_GREAT #1: "doing nothing wins").
 *
 * A week the boss gives no order, takes no envelope, delegates nothing and answers nothing his own
 * way is a week nobody is watching. One such week is a quiet week. After that the island notices,
 * and it gets worse the longer it lasts:
 *
 *   - the count goes soft: the crews help themselves to a growing share of the week's take;
 *   - the men drift: every other idle week each man thinks a little less of a boss who is never around;
 *   - the rivals move in: somebody sets up on the corners of the district you hold most thinly;
 *   - the cops smell it: with nobody minding the pad, local heat creeps up.
 *
 * Any order, an envelope split, a trusted advisor acting, or one answer that is not the default resets
 * the count. The underboss and the consigliere working their domains (lieutenants.ts) do NOT reset it:
 * delegating is not running the family. A good one softens the bite in what he minds (the count, the
 * men, the corners, the pad); a bad or disloyal one softens nothing. Every dollar and point is a ledger line.
 */

/** Idle weeks before anything bites. */
export const IDLE_GRACE = 2;
/** Weeks over which the bite grows to full. */
export const IDLE_RAMP = 8;
/** At full neglect the crews keep this share of the week's take. */
export const IDLE_SKIM_MAX = 0.35;

export function idleWeeks(s: GameState): number {
  return s.flags.idleWeeks ?? 0;
}

/** Did the boss run his family this week? */
export function attended(resolving: readonly EventInstance[], choices: PlayerChoices, delegated = 0): boolean {
  if ((choices.actions?.length ?? 0) > 0 || delegated > 0 || choices.envelope) return true;
  const ans = choices.choices ?? {};
  return resolving.some((e) => ans[e.iid] !== undefined && ans[e.iid] !== e.defaultChoiceId && e.choices.filter((c) => !c.disabledReason).length > 1);
}

/** How hard the neglect bites this week (0 none … 1 full). */
export function neglectLevel(idle: number): number {
  if (idle < IDLE_GRACE) return 0;
  return Math.min(1, (idle - IDLE_GRACE + 1) / IDLE_RAMP);
}

/** Weekly, after the economy (it skims what the week earned). */
export function neglectWeek(ctx: Ctx, wasAttended: boolean): void {
  const s = ctx.s;
  if (wasAttended) {
    if (idleWeeks(s) >= IDLE_GRACE + 2) ctx.log.push('The boss is back at his desk. The men straighten up.');
    s.flags.idleWeeks = 0;
    return;
  }
  const idle = idleWeeks(s) + 1;
  s.flags.idleWeeks = idle;
  const k = neglectLevel(idle);
  if (k <= 0) return;
  // A lieutenant minding a domain takes some of the bite out of it (never all: he is not the boss).
  const cover = ltCover(s);
  // 1. The count goes soft.
  const take = Math.max(0, ctx.gross);
  const skim = Math.round(take * (0.06 + (IDLE_SKIM_MAX - 0.06) * k) * (1 - 0.6 * cover.count));
  if (skim > 0) money(ctx, -skim, `Nobody is watching the count: the crews help themselves (${idle} weeks without the boss)${cover.count >= 0.4 ? ' (the underboss keeps some of it honest)' : ''}`, 'cost');
  // 2. The men drift.
  const drift = Math.round(2 * (1 - 0.6 * cover.men));
  if (idle % 2 === 0 && drift > 0) for (const c of crew(s)) if (isFree(s, c)) addOpinion(s, c.id, s.playerId, 'The boss is never around', -drift, 0.5);
  // 3. The rivals move in on the thinnest district you hold.
  const mine = s.districts.filter((d) => (d.influence.player ?? 0) > 0).sort((a, b) => (a.influence.player ?? 0) - (b.influence.player ?? 0));
  const d = mine[0];
  if (d && chance(s, (0.2 + 0.3 * k) * (1 - 0.6 * cover.corners))) {
    const rival = Object.entries(d.influence).filter(([f, v]) => f !== 'player' && s.rivals.some((r) => r.id === f && r.kind === 'mob') && (v ?? 0) >= 0).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0]
      ?? s.rivals.find((r) => r.kind === 'mob')?.id;
    if (rival) {
      const lost = -shiftInfluence(s, d.id, 'player', -Math.round(3 + 4 * k));
      if (lost > 0) {
        shiftInfluence(s, d.id, rival as never, lost);
        ctx.log.push(`With the boss nowhere to be seen, ${FACTION_NAMES[rival as never] ?? 'a rival'} set up on your corners in ${d.name} (−${lost}%).`);
      }
    }
  }
  // 4. The cops smell it.
  if (idle >= IDLE_GRACE + 2 && cover.cops < 0.5) heat(ctx, 'local', 1, 'Nobody minding the pad: the cops smell a boss who is not there', 'drift');
}
