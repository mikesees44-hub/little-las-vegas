import { ageOn } from './calendar';
import { displayName, isFree, makeCharacter, player } from './characters';
import { adultOn } from './datingState';
import { kin } from './romance';
import { hashSeed } from './rng';
import { ensureWomen, type Affair, type WomenState } from './womenState';
import type { Character, Effect, GameState } from './types';

/**
 * Shared helpers for the women layer (women.ts, womenAffairs.ts,
 * womenCareers.ts): the adults-only and setting checks, the log, its own
 * dice, a wife made a person when she walks into the office.
 */

export const ADULT = 18;
export const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(v)));
export const $ = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
/** A deterministic 0..1 from the seed and a purpose (the layer's own dice). */
export const roll = (k: string) => (hashSeed(k) % 100003) / 100003;
export const WX = (op: import('./women').WomenOp, label: string): Effect => ({ type: 'women', op, label }) as Effect;

export function ageOf(s: GameState, c: Character): number {
  return ageOn(c.birth, s.date);
}

export function isAdultC(s: GameState, c: Character | undefined): c is Character {
  return !!c && ageOn(c.birth, s.date) >= ADULT;
}

export function wlog(W: WomenState, s: GameState, text: string): void {
  W.log.push([s.week, text]);
  if (W.log.length > 60) W.log.splice(0, W.log.length - 60);
}

/** Run `fn` with the main dice swapped for the layer's own stream. */
export function withW<T>(s: GameState, W: WomenState, fn: () => T): T {
  const main = s.rng;
  s.rng = W.rng;
  try { return fn(); } finally { W.rng = s.rng; s.rng = main; }
}

/** Why the boss can't do anything here with this woman (undefined: he can). Adults only, on the day. */
export function womanBlock(s: GameState, id: string): string | undefined {
  if (!adultOn(s)) return 'Mature content is Off in Settings';
  const c = s.characters[id];
  const b = player(s);
  if (!c) return 'Nobody';
  if (!c.alive) return 'She has died';
  if (c.gender !== 'F') return 'Not here';
  if (!isAdultC(s, c)) return 'Adults only';
  if (!b?.alive) return 'You are not here';
  if (!isFree(s, b)) return 'You are inside';
  if (!isAdultC(s, b)) return 'Not until you are 18';
  if (c.id === b.id) return 'Not here';
  if (b.spouseId === c.id) return 'Your wife: that is Your People';
  if (kin(b, c)) return 'Family';
  if (!isFree(s, c)) return 'She is inside';
  return undefined;
}

/** Her husband or fella, a living adult (a nightlife woman's partner, or her spouse). */
export function manOf(s: GameState, her: Character): Character | undefined {
  const p = s.nightlife?.people[her.id];
  const id = p?.fam.partnerId ?? her.spouseId;
  const m = id ? s.characters[id] : undefined;
  return m?.alive && isAdultC(s, m) ? m : undefined;
}

export function marriedOf(s: GameState, her: Character): boolean {
  const p = s.nightlife?.people[her.id];
  if (p) return p.fam.st === 'married' || p.fam.st === 'separated';
  return !!manOf(s, her) && !!her.spouseId;
}

/** The boss's current affair record with her (undefined if none, or it belongs to a boss who is gone). */
export function affairOf(s: GameState, id: string): Affair | undefined {
  const a = s.women?.affairs[id];
  return a && a.with === s.playerId ? a : undefined;
}

export function freshAffair(s: GameState, id: string): Affair {
  return { id, with: s.playerId, stage: 'interest', since: s.week, aff: 0, guilt: 0, fear: 0, n: 0, nights: [], dinners: 0, gifts: 0, refused: [], known: [] };
}

/** The record (created on first contact). */
export function affairFor(s: GameState, id: string): Affair {
  const W = ensureWomen(s);
  const a = W.affairs[id];
  if (a && a.with === s.playerId) return a;
  const f = freshAffair(s, id);
  W.affairs[id] = f;
  return f;
}

/**
 * A wife the office meets becomes a person: her husband's household name
 * (or a new one), his last name, an adult a little younger than him.
 */
export function wifeFor(s: GameState, man: Character): Character | undefined {
  if (!man.alive || man.gender !== 'M' || ageOf(s, man) < 20) return undefined;
  const sp = man.spouseId ? s.characters[man.spouseId] : undefined;
  if (sp) return sp.alive && sp.gender === 'F' && isAdultC(s, sp) ? sp : undefined;
  if (!man.household?.wife) return undefined;
  const W = ensureWomen(s);
  const age = Math.max(ADULT + 1, ageOf(s, man) - 1 - (hashSeed(`${s.seed}:wage:${man.id}`) % 6));
  const w = withW(s, W, () => makeCharacter(s, { gender: 'F', age, firstName: man.household!.wife, lastName: man.lastName, ethnicity: man.ethnicity, rank: 'civilian', faction: 'none', nickname: false, wealth: 300 }));
  while (ageOn(w.birth, s.date) < ADULT) w.birth = { ...w.birth, y: w.birth.y - 1 };
  w.ambition = 'Keep the household together';
  w.spouseId = man.id;
  man.spouseId = w.id;
  return w;
}

export function nameOf(s: GameState, id: string): string {
  const c = s.characters[id];
  return c ? displayName(c) : 'someone';
}
