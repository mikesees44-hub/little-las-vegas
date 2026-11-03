import { hashSeed, rand } from '../rng';
import type { GameState } from '../types';
import type { ArgueState } from './types';

/** The arguments layer, made on first use. */
export function ensureArgue(s: GameState): ArgueState {
  if (!s.argue) {
    s.argue = {
      v: 1, rng: hashSeed(`${s.seed}:argue`), n: 1, seeds: [], hear: [], hist: [], cd: {},
      stats: { n: 0, rounds: 0, voices: 0, seeds: 0, grown: 0, heard: 0, ends: {} },
    };
  }
  const G = s.argue;
  G.n ??= 1;
  G.seeds ??= [];
  G.hear ??= [];
  G.hist ??= [];
  G.cd ??= {};
  G.stats ??= { n: 0, rounds: 0, voices: 0, seeds: 0, grown: 0, heard: 0, ends: {} };
  G.stats.ends ??= {};
  return G;
}

/** The arguments' own dice (the game's seeded generator, on its own stream). */
export function g01(G: ArgueState): number {
  return rand(G);
}

export function gpick<T>(G: ArgueState, xs: readonly T[]): T {
  return xs[Math.floor(rand(G) * xs.length)];
}

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
