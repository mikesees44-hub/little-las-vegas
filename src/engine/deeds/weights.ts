import type { Character, Trait } from '../types';
import { AXES, type Axis } from './types';

/**
 * THE PERSONALITY WEIGHTS. One table, read both ways:
 *  - as the man who ACTS: how much each kind of move appeals to him
 *    (a Hot-headed man +35 toward violence, a Greedy one +30 toward money);
 *  - as the man it is DONE TO: how the move lands (a Paranoid man −30 on
 *    anything that asks him to trust you; a Cowardly one gives way to a threat).
 * The deed says which axes it is made of (catalog.ts `act` / `recv`); the
 * points are these, so a reason on the acceptance card ("−30 Paranoid") is
 * the same number the "How he leans" panel shows.
 */
export const TRAIT_WEIGHTS: Record<Trait, Partial<Record<Axis, number>>> = {
  Greedy: { money: 30, honor: -10, loyalty: -10 },
  'Hot-headed': { violence: 35, pride: 30, risk: 20, scheme: -10 },
  Patient: { risk: -10, scheme: 15, pride: -15, violence: -10 },
  Ambitious: { power: 25, risk: 10, loyalty: -10 },
  'Loyal-to-a-fault': { loyalty: 35, scheme: -15, trust: 10 },
  Paranoid: { trust: -30, scheme: 15, risk: -15 },
  Pious: { honor: 30, romance: -20, violence: -10 },
  Womanizer: { romance: 35, social: 10, honor: -5 },
  Gambler: { risk: 25, money: 10 },
  Honest: { honor: 35, scheme: -25, money: -10 },
  Cruel: { violence: 30, social: -15, honor: -10 },
  Cowardly: { risk: -30, violence: -25, pride: -10 },
  Charming: { social: 30, scheme: 5, trust: 5 },
  Vengeful: { pride: 25, violence: 15, trust: -10 },
  Drinker: { social: 15, risk: 5, honor: -5 },
};

/** What each axis means, as the panel says it ("toward violence"). */
export const AXIS_WORD: Record<Axis, string> = {
  violence: 'violence', money: 'money', risk: 'risk', power: 'your seat and his own', social: 'company and friendly moves',
  trust: 'trusting people', scheme: 'working angles', honor: 'doing it straight', loyalty: 'loyalty to his own', romance: 'the women', pride: 'his pride',
};

/** His weight on each axis (sum over traits). */
export function axesOf(c: Character): Record<Axis, number> {
  const out = Object.fromEntries(AXES.map((a) => [a, 0])) as Record<Axis, number>;
  for (const t of c.traits) {
    const w = TRAIT_WEIGHTS[t];
    if (w) for (const a of AXES) out[a] += w[a] ?? 0;
  }
  return out;
}

/** The per-trait reasons a deed's axis vector earns ("Paranoid −30"), for one man. */
export function traitTerms(c: Character, vec: Partial<Record<Axis, number>>): { trait: Trait; value: number }[] {
  const out: { trait: Trait; value: number }[] = [];
  for (const t of c.traits) {
    const w = TRAIT_WEIGHTS[t];
    if (!w) continue;
    let v = 0;
    for (const a of AXES) v += (w[a] ?? 0) * (vec[a] ?? 0);
    v = Math.round(v);
    if (v) out.push({ trait: t, value: v });
  }
  return out;
}

/** Sum of a vector against his traits (the appetite or the reaction, in points). */
export function vecScore(c: Character, vec: Partial<Record<Axis, number>>): number {
  return traitTerms(c, vec).reduce((a, x) => a + x.value, 0);
}

/** "Hot-headed +35 toward violence", strongest first. */
export function leanWords(c: Character): { trait: Trait; axis: Axis; value: number; text: string }[] {
  const out: { trait: Trait; axis: Axis; value: number; text: string }[] = [];
  for (const t of c.traits) {
    const w = TRAIT_WEIGHTS[t];
    if (!w) continue;
    for (const a of AXES) {
      const v = w[a];
      if (!v) continue;
      out.push({ trait: t, axis: a, value: v, text: `${t} ${v > 0 ? '+' : '−'}${Math.abs(v)} ${v > 0 ? 'toward' : 'against'} ${AXIS_WORD[a]}` });
    }
  }
  return out.sort((a, b) => Math.abs(b.value) - Math.abs(a.value) || a.text.localeCompare(b.text));
}
