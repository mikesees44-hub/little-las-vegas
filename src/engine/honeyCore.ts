import { ageOn } from './calendar';
import { displayName, hasTrait, isFree, player } from './characters';
import { adultOn } from './datingState';
import { activeGoomars } from './goomar';
import { kin } from './romance';
import { hashSeed } from './rng';
import { ensureHoney, type Agent, type HoneyState, type Watch } from './honeyState';
import { affairOf, manOf, marriedOf } from './womenCore';
import type { Character, GameState } from './types';

/**
 * Shared helpers for the honey layer (honey.ts, honeyScript.ts): the adults
 * and setting checks, the dice (hashes of the seed, never the game's RNG),
 * who the boss is involved with, the hidden truth and what he has seen.
 */

export const ADULT = 18;
export const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
export const pct = (p: number) => `${Math.round(p * 100)}%`;
export const $ = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
/** The layer's own dice: a deterministic 0..1 from the seed and a purpose. */
export const hroll = (s: GameState, k: string) => (hashSeed(`${s.seed}|honey|${k}`) % 100003) / 100003;
/** Pick one of a list on the layer's dice. */
export const hpick = <T>(s: GameState, k: string, xs: readonly T[]): T => xs[Math.floor(hroll(s, k) * xs.length) % xs.length];

export function adultC(s: GameState, c: Character | undefined): c is Character {
  return !!c && c.alive && ageOn(c.birth, s.date) >= ADULT;
}

/** Why nothing of this layer may touch her now (undefined: it may). Adults only, mature content on. */
export function honeyBlock(s: GameState, id: string): string | undefined {
  if (!adultOn(s)) return 'Mature content is Off in Settings';
  const c = s.characters[id];
  const b = player(s);
  if (!c) return 'Nobody';
  if (!c.alive) return 'She has died';
  if (c.gender !== 'F') return 'Not here';
  if (!adultC(s, c)) return 'Adults only';
  if (!b?.alive || !adultC(s, b)) return 'Adults only';
  if (c.id === b.id || c.id === b.spouseId || kin(b, c)) return 'Not her';
  if (!isFree(s, c)) return 'She is inside';
  if (!isFree(s, b)) return 'You are not free';
  return undefined;
}

export function hlog(H: HoneyState, s: GameState, text: string): void {
  H.log.push([s.week, text]);
  if (H.log.length > 60) H.log.splice(0, H.log.length - 60);
}

export const nm = (s: GameState, id: string | undefined) => (id && s.characters[id] ? displayName(s.characters[id]) : 'someone');
export const fn = (s: GameState, id: string | undefined) => (id && s.characters[id] ? s.characters[id].firstName : 'her');

/** The hidden truth: is she working him (and still at it)? Never shown on a screen until he knows. */
export function agentOf(s: GameState, id: string): Agent | undefined {
  const a = s.honey?.agents[id];
  return a && (a.status === 'working' || a.status === 'turned' || a.status === 'fed') ? a : undefined;
}

/** What the boss has seen of her (created on first use). */
export function watchFor(s: GameState, id: string): Watch {
  const H = ensureHoney(s);
  return (H.watch[id] ??= { id, susp: 0, signs: [] });
}

export function addSign(s: GameState, id: string, text: string, susp: number): void {
  const w = watchFor(s, id);
  if (w.signs.some(([, t]) => t === text)) { w.susp = clamp(w.susp + Math.round(susp / 3)); return; }
  w.signs.push([s.week, text]);
  if (w.signs.length > 8) w.signs.splice(0, w.signs.length - 8);
  w.susp = clamp(w.susp + susp);
}

/** How likely the boss is to catch something off about her: his nature, his guards, his consigliere. */
export function perception(s: GameState, guardCut = 0): number {
  const b = player(s);
  const cons = Object.values(s.characters).find((c) => c.alive && c.faction === 'player' && c.rank === 'consigliere');
  return clamp(0.12 + (hasTrait(b, 'Paranoid') ? 0.25 : 0) + guardCut * 0.5 + (b.attributes.intrigue - 40) / 300 + (cons ? cons.attributes.intrigue / 600 : 0), 0.05, 0.85);
}

/** The women the boss is involved with right now (an affair, a goomar, a recent dare), adults only. */
export function involvedWith(s: GameState): string[] {
  const ids = new Set<string>();
  for (const a of Object.values(s.women?.affairs ?? {})) if (a.with === s.playerId && (a.stage === 'affair' || a.stage === 'dating')) ids.add(a.id);
  for (const g of activeGoomars(s)) ids.add(g.id);
  for (const d of s.honey?.dares ?? []) if (d.out === 'yes' && s.week - d.w <= 8) ids.add(d.id);
  return [...ids].filter((id) => adultC(s, s.characters[id])).sort();
}

/** Has he been alone with her lately (the agent's chance to hear things)? */
export function closeLately(s: GameState, id: string, weeks = 3): boolean {
  const a = affairOf(s, id);
  if (a && a.stage === 'affair' && a.last !== undefined && s.week - a.last <= weeks) return true;
  const g = s.nightlife?.goomars[id];
  if (g && !g.ended) return true;
  return (s.honey?.dares ?? []).some((d) => d.id === id && d.out === 'yes' && s.week - d.w <= weeks);
}

export { manOf, marriedOf };
