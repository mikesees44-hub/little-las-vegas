import { hasTrait } from '../characters';
import { applyEffects } from '../effects';
import { cloneState } from '../engine';
import { newCtx } from '../ledger';
import { addOpinion, changeMeter } from '../relations';
import type { Effect, GameState } from '../types';
import { rxName } from './compute';
import { ensureReactions } from './state';
import type { Reaction } from './types';

/**
 * THE WINDOW'S ANSWERS: smooth an angry man over (a gift, a word, a favor),
 * close the window. Pure: each returns a new state.
 */

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

