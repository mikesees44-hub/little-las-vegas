import type { Choice, Effect, EventInstance, GameState, PlayerAction } from './types';

/**
 * NEVER HAND OVER A MAN WITHOUT THE BOSS'S WORD (the hard rule).
 *
 * One of the boss's men is "given up" when a decision kills him, sends him
 * out of the family, leaves him to sit in a cell, or lets someone else have
 * him (the Table, Philadelphia, a faction, the law). Any of that may happen
 * only because the boss chose it, explicitly:
 *
 *  - a decision's default (what happens when nobody answers, what an advisor
 *    or the desk "lets him handle", what the quiet routine settles) is never a
 *    surrender when the decision has another way out: pay, bargain, defy, stall;
 *  - the underboss and the consigliere never give a man up on their own: at most
 *    they propose it and wait for the boss's yes (lieutenants.ts);
 *  - a trusted advisor's routine never touches a man's life (briefing.ts).
 *
 * The classifier reads a choice's effects; the guard rewrites a default.
 */

/** A man of the boss's family (not the boss himself), alive. */
export function isMyMan(s: GameState, id: string | undefined): boolean {
  if (!id || id === s.playerId) return false;
  const c = s.characters[id];
  return !!c && c.alive && c.faction === 'player';
}

/** The men an effect list gives up (killed, thrown out, left to rot, sanctioned), by id. */
export function surrenderedBy(s: GameState, effects: readonly Effect[]): string[] {
  const out = new Set<string>();
  // A man left in a cell, sent away or cut loose is given up only when it was not done for him (no good word from him in the same answer).
  const wronged = new Set(effects.filter((e) => e.type === 'opinion' && e.to === s.playerId && e.amount < 0).map((e) => (e as Extract<Effect, { type: 'opinion' }>).from));
  const backed = new Set(effects.filter((e) => e.type === 'opinion' && e.to === s.playerId && e.amount > 0).map((e) => (e as Extract<Effect, { type: 'opinion' }>).from));
  for (const e of effects) {
    switch (e.type) {
      case 'kill':
        if (isMyMan(s, e.charId)) out.add(e.charId);
        break;
      // Sent away: given up, unless it is done for him (a plane ticket out of the prosecutor's reach).
      case 'exile':
        if (isMyMan(s, e.charId) && !backed.has(e.charId) && !e.own) out.add(e.charId);
        break;
      // Retired: his wish granted, unless he is cut loose against it (he thinks less of the boss for it).
      case 'retire':
        if (isMyMan(s, e.charId) && wronged.has(e.charId)) out.add(e.charId);
        break;
      case 'imprison':
        if (isMyMan(s, e.charId) && e.weeks > 2 && !backed.has(e.charId)) out.add(e.charId);
        break;
      case 'sanction':
        if (isMyMan(s, e.targetId)) out.add(e.targetId);
        break;
      case 'power': {
        const op = e.op as { op: string; resolve?: string; reply?: string; id?: string; charId?: string };
        if (op.op === 'heirMove' && op.reply === 'exile' && isMyMan(s, op.charId)) out.add(op.charId!);
        if (op.op === 'grievance' && op.resolve === 'exile') {
          const g = s.power?.grievances.find((x) => x.id === op.id);
          if (g && isMyMan(s, g.charId)) out.add(g.charId);
        }
        break;
      }
      case 'mymen': {
        const op = e.op as { op: string; id?: string; confirm?: boolean };
        if (op.op === 'kill' && isMyMan(s, op.id)) out.add(op.id!);
        break;
      }
      default:
        break;
    }
  }
  return [...out];
}

export function isSurrender(s: GameState, ch: Choice | undefined): boolean {
  return !!ch && surrenderedBy(s, ch.effects).length > 0;
}

/** The answer a decision takes when nobody gives one: its own default, unless that gives a man up and something else does not. */
const SAFE_ORDER = ['pay', 'negotiate', 'bargain', 'defy', 'stall', 'protect', 'hide', 'lawyer', 'family', 'refuse', 'buy', 'feed', 'wait', 'no'];

export function safeDefault(s: GameState, ev: EventInstance): Choice | undefined {
  const legal = ev.choices.filter((c) => !c.disabledReason);
  const def = legal.find((c) => c.id === ev.defaultChoiceId) ?? ev.choices.find((c) => c.id === ev.defaultChoiceId) ?? legal[0] ?? ev.choices[0];
  if (!isSurrender(s, def)) return def;
  const safe = legal.filter((c) => !isSurrender(s, c));
  if (!safe.length) return def;
  for (const id of SAFE_ORDER) {
    const c = safe.find((x) => x.id === id);
    if (c) return c;
  }
  return safe[0];
}

/** Rewrite each decision's default so silence never gives a man up. Returns the decisions it changed. */
/** Test hook: sees every decision whose default the guard had to change (the audit). */
export const guardLog: { on: boolean; hits: { defId: string; from: string; to: string }[] } = { on: false, hits: [] };

export function guardDefaults(s: GameState, events: EventInstance[]): EventInstance[] {
  const changed: EventInstance[] = [];
  for (const ev of events) {
    const c = safeDefault(s, ev);
    if (c && c.id !== ev.defaultChoiceId) {
      if (guardLog.on) guardLog.hits.push({ defId: ev.defId, from: ev.defaultChoiceId, to: c.id });
      ev.defaultChoiceId = c.id;
      changed.push(ev);
    }
  }
  return changed;
}

/** An order that would give one of the boss's men up (kill him, run him off): only on the boss's own word. */
export function actionSurrenders(s: GameState, a: PlayerAction): boolean {
  if (a.kind === 'interact') return (a.id === 'whack' || a.id === 'exile') && isMyMan(s, a.target);
  if (a.kind === 'scheme') return a.scheme === 'murder' && isMyMan(s, a.targetId);
  if (a.kind === 'mymen') return a.op.op === 'kill';
  return false;
}
