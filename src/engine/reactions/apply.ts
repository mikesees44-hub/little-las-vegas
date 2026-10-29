import { hasTrait } from '../characters';
import { pushAsk } from '../deeds/npc';
import { setTie } from '../deeds/state';
import { applyEffects } from '../effects';
import { cloneState } from '../engine';
import { newCtx, type Ctx } from '../ledger';
import { remember } from '../minds/memory';
import { mindOf } from '../minds/state';
import { addOpinion, changeMeter } from '../relations';
import { buildDisputeRaised, chair, newDispute, openDispute } from '../table';
import type { Choice, Effect, EventInstance, GameState, PlayerAction } from '../types';
import { decisionOfChoice, inferDecision, leaderOf, reactionsTo, rxName } from './compute';
import { ensureReactions, r01 } from './state';
import { BATCH_ITEMS, LOG_CAP, POPS_PER_WEEK, Q_CAP, type Decision, type Reaction, type ReactionBatch } from './types';

/**
 * THE REACTIONS LAND. One decision, one computed list (compute.ts), applied
 * the same way whatever asked for it (a popup's answer, an order at the
 * week's turn, a deed done now, a proposal answered): named opinion
 * modifiers, fear, memories, grievances, a mood, and the follow-ups (a capo
 * sulks, a family goes to the Table, a declined man goes elsewhere, a friend
 * wants a favor back). Then ONE window for the decision when something major
 * happened (and the week's window cap allows); everything else rolls into the
 * week's summary.
 */

/** The decision and its reactions, read BEFORE the effects land (so the numbers are the predicted ones). */
export interface RxPending { d: Decision; list: Reaction[] }

/** Before a popup's answer is applied. */
export function rxChoiceBegin(s: GameState, ev: EventInstance, ch: Choice): RxPending | undefined {
  try {
    if (ch.effects.some((e) => e.type === 'deed' && e.op.op === 'react')) return undefined; // the choice carries its own (applied by its effect)
    const d = decisionOfChoice(s, ev, ch);
    return d ? { d, list: reactionsTo(s, d) } : undefined;
  } catch { return undefined; }
}

/** The man an order is aimed at. */
function personOf(s: GameState, a: PlayerAction): string | undefined {
  const r = a as { target?: unknown; op?: Record<string, unknown> };
  const ids = [r.target, r.op?.to, r.op?.id, r.op?.who, r.op?.target, r.op?.charId];
  for (const x of ids) if (typeof x === 'string' && s.characters[x] && x !== s.playerId) return x;
  return undefined;
}

/** Before an order's effects are applied (deeds go through rxDeedBegin). */
export function rxActionBegin(s: GameState, a: PlayerAction, effects: readonly Effect[], title: string): RxPending | undefined {
  try {
    if (a.kind === 'deed') return undefined;
    const d = inferDecision(s, personOf(s, a), effects, title, a.kind);
    return d ? { d, list: reactionsTo(s, d) } : undefined;
  } catch { return undefined; }
}

/** Before a deed the boss does lands (deeds/resolve.ts). */
export function rxDeedBegin(s: GameState, target: string, effects: readonly Effect[], title: string, id: string): RxPending | undefined {
  try {
    const d = inferDecision(s, target, effects, title, `deed:${id}`);
    return d ? { d, list: reactionsTo(s, d) } : undefined;
  } catch { return undefined; }
}

/** After the effects landed: the reactions read before them land now. */
export function rxEnd(ctx: Ctx, p: RxPending | undefined): ReactionBatch | undefined {
  if (!p || ctx.s.gameOver) return undefined;
  try { return landReactions(ctx, p.d, p.list); } catch { return undefined; }
}

/** A choice that carries its own decision (the `react` op, first in its effects). */
export function applyDecision(ctx: Ctx, d: Decision): ReactionBatch | undefined {
  return landReactions(ctx, d, reactionsTo(ctx.s, d));
}

function decayOf(v: number): number {
  return v <= -15 ? 1 : 2;
}

/** Apply a computed list, run the follow-ups, and make the window (or roll it into the summary). */
export function landReactions(ctx: Ctx, d: Decision, list: Reaction[]): ReactionBatch | undefined {
  const s = ctx.s;
  const B = s.playerId;
  const R = ensureReactions(s);
  if (R.pw !== s.week) { R.pw = s.week; R.pops = 0; }
  const items = list.filter((r) => s.characters[r.who]?.alive).map((r) => ({ ...r }));
  if (!items.length) return undefined;
  R.stats.n++;
  if (d.k === 'decline') R.stats.declined++;
  const t = d.t ? s.characters[d.t] : undefined;
  for (const r of items) {
    const c = s.characters[r.who];
    if (!r.direct && r.v) addOpinion(s, r.who, B, r.why, r.v, decayOf(r.v));
    if (r.fear) changeMeter(s, r.who, B, 'fear', r.fear);
    const m = mindOf(s, r.who);
    if (m && Math.abs(r.v) >= 8) remember(m, { w: s.week, k: r.v > 0 ? 'favor' : 'slight', who: B, t: r.why.toLowerCase(), v: Math.round(r.v * 0.8) });
    if (r.tone === 'furious') {
      changeMeter(s, r.who, B, 'grievance', Math.round(-r.v / 2));
      if (m) m.mood = 'angry';
    }
    // Follow-ups.
    if (r.tone === 'furious' && c.faction === 'player' && c.rank !== 'civilian' && !c.dynasty) {
      R.sulk[r.who] = s.week + 6;
      r.next = c.rank === 'capo' || c.rank === 'underboss' ? 'Sulks: his envelope will come in light for a while' : 'Sulks: he will hold back on his end';
    } else if (r.v <= -10 && r.role === 'family') {
      const fam = s.rivals.find((x) => x.leaderId === r.who);
      if (fam && fam.kind === 'mob' && chair(s) && !s.disputes.some((x) => !x.ruling && (x.plaintiff === fam.id || x.defendant === fam.id)) && r01(R) < 0.5) {
        const dp = openDispute(s, newDispute(s, 'reparations', fam.id, 'player', { amount: Math.round((10 + Math.min(40, -r.v)) * 100) }));
        s.eventQueue.push(buildDisputeRaised(s, dp));
        s.flags[`grievance_${fam.id}`] = 1;
        r.next = 'Took a grievance to the Table';
      } else r.next = 'Will remember this';
    } else if (r.role === 'target' && d.go && r.v < 0 && t && (hasTrait(t, 'Ambitious') || hasTrait(t, 'Greedy') || r.tone === 'furious')) {
      const L = leaderOf(s, d.go);
      if (L && L.id !== t.id) {
        setTie(s, t.id, L.id, 'friend', 'Took his idea elsewhere');
        r.next = `Takes it to ${rxName(s, { who: L.id, role: 'family' })} instead`;
      }
    } else if ((r.role === 'friend' || r.role === 'kin') && r.v >= 5 && c.faction === 'player' && r01(R) < 0.2) {
      pushAsk(s, { d: 'askFavor', a: r.who, p: 50, n: 200 + Math.round(r01(R) * 4) * 100 });
      r.next = 'Will ask a favor in return';
    }
  }
  ctx.log.push(`${d.label}: ${items.slice(0, 3).map((r) => `${rxName(s, r)} ${r.v > 0 ? '+' : ''}${r.v}`).join(', ')}.`);
  return batch(s, d, items);
}

/** One window per decision; the caps decide whether it pops up or rolls into the summary. */
function batch(s: GameState, d: Decision, items: Reaction[]): ReactionBatch | undefined {
  const R = ensureReactions(s);
  const major = items.some((r) => r.major);
  const shown = items.slice(0, BATCH_ITEMS);
  const log = (xs: readonly Reaction[]) => {
    for (const r of xs) R.log.push({ w: s.week, title: d.label.slice(0, 80), who: r.who, v: r.v, why: r.why, tone: r.tone });
    if (R.log.length > LOG_CAP) R.log.splice(0, R.log.length - LOG_CAP);
  };
  if (!major || R.pops >= POPS_PER_WEEK) {
    log(items);
    R.stats.minor += items.length;
    return undefined;
  }
  log(items.slice(BATCH_ITEMS));
  const b: ReactionBatch = { id: `rx${s.nextId++}`, w: s.week, title: d.label.slice(0, 90), items: shown, more: items.length - shown.length, ...(d.src ? { src: d.src } : {}) };
  R.q.push(b);
  while (R.q.length > Q_CAP) {
    const old = R.q.shift()!;
    for (const r of old.items) R.log.push({ w: old.w, title: old.title, who: r.who, v: r.v, why: r.why, tone: r.tone });
  }
  R.pops++;
  R.stats.pops++;
  return b;
}

/* ------------------------------------------------------------------ */
/* The window's answers                                                */
/* ------------------------------------------------------------------ */

export type SmoothHow = 'gift' | 'word' | 'favor';

export interface SmoothOpt { how: SmoothHow; label: string; cost: number; back: number; blocked?: string }

function giftCost(s: GameState, r: Reaction): number {
  const c = s.characters[r.who];
  if (r.role === 'philly') return 1500;
  if (r.role === 'family') return 1000;
  if (r.role === 'wife') return 250;
  return c && (c.rank === 'capo' || c.rank === 'underboss' || c.rank === 'consigliere') ? 400 : 150;
}

/** The ways to smooth one reaction over, with what each costs and gives back. */
export function smoothOptions(s: GameState, r: Reaction): SmoothOpt[] {
  const c = s.characters[r.who];
  if (!c?.alive || r.v >= 0 || !r.smooth) return [];
  const proud = hasTrait(c, 'Hot-headed') || hasTrait(c, 'Vengeful');
  const greedy = hasTrait(c, 'Greedy');
  const cost = giftCost(s, r);
  const gift = Math.round(-r.v * (greedy ? 0.8 : 0.6));
  const word = Math.max(1, Math.round(-r.v * (proud ? 0.2 : hasTrait(c, 'Charming') || hasTrait(c, 'Patient') ? 0.5 : 0.4)));
  return [
    { how: 'gift', label: r.role === 'wife' ? 'Flowers and something from the jeweler' : r.role === 'family' || r.role === 'philly' ? 'Send a gift, with respect' : 'A gift', cost, back: gift },
    { how: 'word', label: 'A word, in person', cost: 0, back: word },
    { how: 'favor', label: 'Do him a favor', cost: 0, back: -r.v, ...(s.favors < 1 ? { blocked: 'No favors to spend' } : {}) },
  ];
}

/** Smooth one reaction over. Pure: the new state (unchanged if it can't be done). */
export function smoothOver(input: GameState, batchId: string, who: string, how: SmoothHow): GameState {
  const b0 = input.reactions?.q.find((x) => x.id === batchId);
  const r0 = b0?.items.find((x) => x.who === who);
  if (!b0 || !r0) return input;
  const opt = smoothOptions(input, r0).find((o) => o.how === how);
  if (!opt || opt.blocked) return input;
  const s = cloneState(input);
  const ctx = newCtx(s);
  const R = ensureReactions(s);
  const b = R.q.find((x) => x.id === batchId)!;
  const r = b.items.find((x) => x.who === who)!;
  const fx: Effect[] = [];
  if (opt.cost) fx.push({ type: 'money', amount: -opt.cost, pot: 'pocket', label: `Smoothing it over with ${rxName(s, r)}` });
  if (how === 'favor') fx.push({ type: 'favor', amount: -1 });
  if (fx.length) applyEffects(ctx, fx, { label: `Smoothed it over with ${rxName(s, r)}`, because: `smoothed it over with ${rxName(s, r)}`, category: 'event' });
  addOpinion(s, who, s.playerId, how === 'gift' ? 'Sent a gift to make it right' : how === 'word' ? 'Came to me in person about it' : 'Did me a favor to make it right', opt.back, 2);
  if (r.tone === 'furious') changeMeter(s, who, s.playerId, 'grievance', -Math.round(opt.back / 2));
  if (how !== 'word' && R.sulk[who]) delete R.sulk[who];
  delete r.smooth;
  r.smoothed = `${how === 'gift' ? 'A gift' : how === 'word' ? 'A word' : 'A favor'}: +${opt.back}`;
  R.stats.smoothed++;
  return s;
}

/** Close a window. Pure. */
export function dismissReactions(input: GameState, batchId: string): GameState {
  if (!input.reactions?.q.some((x) => x.id === batchId)) return input;
  const s = cloneState(input);
  const R = ensureReactions(s);
  R.q = R.q.filter((x) => x.id !== batchId);
  return s;
}

/** The next window to show. */
export function nextReactions(s: GameState): ReactionBatch | undefined {
  return s.reactions?.q[0];
}

/** The newest window made since `mark` windows were made (for a result card to embed). */
export function batchSince(s: GameState, prevStatsPops: number): ReactionBatch | undefined {
  const R = s.reactions;
  if (!R || R.stats.pops <= prevStatsPops) return undefined;
  return R.q[R.q.length - 1];
}

/** The minor reactions of the last `weeks` weeks, for the Desk's Handled list / the week's summary. */
export function reactionDigest(s: GameState, weeks = 1): { line: string; tone: Reaction['tone']; who: string }[] {
  const R = s.reactions;
  if (!R) return [];
  return R.log.filter((x) => s.week - x.w < weeks).slice(-12).reverse().map((x) => ({ who: x.who, tone: x.tone, line: `${s.characters[x.who]?.firstName ?? '?'} ${x.v > 0 ? '+' : '−'}${Math.abs(x.v)}: ${x.why}` }));
}
