import { ageOn } from '../calendar';
import { hashSeed, rand } from '../rng';
import { opinion } from '../relations';
import type { Character, GameState, Rival } from '../types';
import { MAX_FULL, type Mind, type MindsState } from './types';

/** The minds layer, made on first use. */
export function ensureMinds(s: GameState): MindsState {
  if (!s.minds) {
    s.minds = {
      v: 1, rng: hashSeed(`${s.seed}:minds`), n: 1, minds: {}, rumors: [], roster: -99, heard: [],
      stats: { thinks: 0, plans: 0, done: 0, failed: 0, adapted: 0, rumors: 0, lies: 0, talks: 0 },
    };
  }
  const M = s.minds;
  M.minds ??= {};
  M.rumors ??= [];
  M.heard ??= [];
  M.n ??= 1;
  M.stats ??= { thinks: 0, plans: 0, done: 0, failed: 0, adapted: 0, rumors: 0, lies: 0, talks: 0 };
  M.stats.talks ??= 0;
  return M;
}

export function mindOf(s: GameState, id: string): Mind | undefined {
  return s.minds?.minds[id];
}

/** The minds' own dice. */
export function r01(M: MindsState): number {
  return rand(M);
}
export function roll(M: MindsState, p: number): boolean {
  return rand(M) < p;
}

/** A deterministic 0..1 that does not touch any stream (for pure reads). */
export function h01(key: string): number {
  return hashSeed(key) / 4294967296;
}

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export function ageOf(s: GameState, c: Character): number {
  return ageOn(c.birth, s.date);
}

export function rivalLedBy(s: GameState, id: string): Rival | undefined {
  return s.rivals.find((r) => r.leaderId === id);
}

/**
 * How much a person matters to the story (0 = not at all). The top
 * `MAX_FULL` get full minds; everyone else is read lightly on demand.
 */
export function importance(s: GameState, c: Character): number {
  if (!c.alive || c.id === s.playerId) return 0;
  const r = rivalLedBy(s, c.id);
  if (r) return r.kind === 'law' ? 88 : 100;
  let v = 0;
  const boss = s.characters[s.playerId];
  if (c.faction === 'player') {
    for (const seat of Object.values(s.council ?? {})) if (seat?.holderId === c.id) v = Math.max(v, 90);
    if (c.rank === 'capo') v = Math.max(v, 80);
    if (c.rank === 'underboss' || c.rank === 'consigliere') v = Math.max(v, 90);
    if (c.courtedBy || c.informantFor) v = Math.max(v, 45);
    const op = Math.abs(opinion(s, c.id, s.playerId));
    if ((c.rank === 'soldier' || c.rank === 'associate') && op >= 40) v = Math.max(v, 40);
  }
  if (boss?.spouseId === c.id) v = Math.max(v, 85);
  if (c.dynasty && ageOf(s, c) >= 16) {
    const close = boss && (boss.childrenIds.includes(c.id) || c.childrenIds.includes(boss.id) || (!!boss.fatherId && boss.fatherId === c.fatherId));
    v = Math.max(v, close ? 62 : 35);
  }
  const tie = s.bonds?.ties?.[c.id];
  if (tie) {
    const w = tie.role === 'goomar' || tie.role === 'lover' ? 70 : tie.role === 'friend' ? 58 : tie.role === 'rival' ? 66 : tie.role === 'wife' ? 85 : 0;
    v = Math.max(v, w);
  }
  if (c.office && v === 0) v = 20;
  return v;
}

/** The people who get full minds this month, most important first. */
export function drawRoster(s: GameState): string[] {
  const scored: [string, number][] = [];
  for (const id in s.characters) {
    const c = s.characters[id];
    if (!c.alive) continue;
    const v = importance(s, c);
    if (v >= 35) scored.push([id, v]);
  }
  scored.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return scored.slice(0, MAX_FULL).map(([id]) => id);
}
