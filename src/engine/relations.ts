import { hasTrait } from './characters';
import type { GameState, OpinionModifier, Relation } from './types';

/**
 * Relationships are directional: relation(A, B) is what A thinks of B.
 * Opinion is never stored as a number — it is always the clamped sum of
 * named modifiers, so every point of opinion has a reason attached.
 */

export const OPINION_MIN = -100;
export const OPINION_MAX = 100;
export const DEFAULT_DECAY = 2;

export function relKey(from: string, to: string): string {
  return `${from}>${to}`;
}

export function getRelation(s: GameState, from: string, to: string): Relation | undefined {
  return s.relations[relKey(from, to)];
}

export function ensureRelation(s: GameState, from: string, to: string): Relation {
  const k = relKey(from, to);
  let r = s.relations[k];
  if (!r) {
    r = { from, to, modifiers: [], fear: 0, trust: 30, grievance: 0 };
    s.relations[k] = r;
  }
  return r;
}

export function clampOpinion(v: number): number {
  return Math.max(OPINION_MIN, Math.min(OPINION_MAX, v));
}

/** Pure computation from a modifier list. */
export function sumOpinion(mods: readonly OpinionModifier[]): number {
  return clampOpinion(mods.reduce((acc, m) => acc + m.value, 0));
}

export function opinion(s: GameState, from: string, to: string): number {
  const r = getRelation(s, from, to);
  return r ? sumOpinion(r.modifiers) : 0;
}

/**
 * Add (or stack onto) a named opinion modifier. Modifiers with an identical
 * reason are merged, so "Paid the envelope in full" twice becomes one line
 * worth the combined value (each single reason is capped at ±100).
 * `decay` is how many points the modifier moves toward zero each month; 0 = permanent.
 */
export function addOpinion(
  s: GameState,
  from: string,
  to: string,
  reason: string,
  value: number,
  decay: number = DEFAULT_DECAY,
): OpinionModifier | undefined {
  if (from === to || value === 0) return undefined;
  const fromChar = s.characters[from];
  // Trait shaping: Vengeful never lets negatives decay; Loyal-to-a-fault halves slights; Patient cools faster.
  if (fromChar) {
    if (value < 0 && hasTrait(fromChar, 'Loyal-to-a-fault') && to === s.playerId) value = Math.round(value / 2);
    if (value < 0 && hasTrait(fromChar, 'Vengeful')) decay = 0;
    else if (value < 0 && hasTrait(fromChar, 'Patient') && decay > 0) decay += 1;
  }
  const r = ensureRelation(s, from, to);
  const existing = r.modifiers.find((m) => m.reason === reason);
  if (existing) {
    existing.value = Math.max(-100, Math.min(100, existing.value + value));
    existing.decay = Math.max(existing.decay === 0 ? 0 : existing.decay, decay);
    if (decay === 0) existing.decay = 0;
    existing.week = s.week;
    if (existing.value === 0) r.modifiers = r.modifiers.filter((m) => m !== existing);
    return existing;
  }
  const m: OpinionModifier = { id: `m${s.nextId++}`, reason, value: Math.max(-100, Math.min(100, value)), decay, week: s.week };
  r.modifiers.push(m);
  return m;
}

export function changeMeter(s: GameState, from: string, to: string, meter: 'fear' | 'trust' | 'grievance', amount: number): void {
  if (from === to) return;
  const r = ensureRelation(s, from, to);
  const fromChar = s.characters[from];
  if (meter === 'trust' && amount > 0 && fromChar && hasTrait(fromChar, 'Paranoid')) amount = Math.round(amount / 2);
  if (meter === 'fear' && amount > 0 && fromChar && hasTrait(fromChar, 'Cowardly')) amount = Math.round(amount * 1.5);
  r[meter] = Math.max(0, Math.min(100, Math.round(r[meter] + amount)));
}

/** Pure decay step for one modifier list (monthly). */
export function decayModifiers(mods: readonly OpinionModifier[]): OpinionModifier[] {
  const out: OpinionModifier[] = [];
  for (const m of mods) {
    if (m.decay === 0) {
      out.push(m);
      continue;
    }
    const v = m.value > 0 ? Math.max(0, m.value - m.decay) : Math.min(0, m.value + m.decay);
    if (v !== 0) out.push({ ...m, value: v });
  }
  return out;
}

/** Monthly decay of every relation; drops relations that are empty and neutral. */
export function decayAllRelations(s: GameState): void {
  for (const [k, r] of Object.entries(s.relations)) {
    const from = s.characters[r.from];
    const to = s.characters[r.to];
    if (!from?.alive || !to?.alive) {
      delete s.relations[k];
      continue;
    }
    r.modifiers = decayModifiers(r.modifiers);
    const vengeful = from && hasTrait(from, 'Vengeful');
    if (r.grievance > 0) r.grievance = Math.max(0, r.grievance - (vengeful ? 0 : hasTrait(from, 'Patient') ? 4 : 2));
    if (r.fear > 0) r.fear = Math.max(0, r.fear - 1);
  }
}

/** Opinion breakdown for UI: modifiers sorted by magnitude. */
export function opinionBreakdown(s: GameState, from: string, to: string): { total: number; mods: OpinionModifier[] } {
  const r = getRelation(s, from, to);
  const mods = r ? [...r.modifiers].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)) : [];
  return { total: sumOpinion(mods), mods };
}
