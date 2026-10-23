/**
 * Seeded PRNG (mulberry32). The generator state is a single uint32 stored on
 * the game state (`state.rng`), so a saved game resumes the exact same stream.
 * All helpers take an object holding `rng` and advance it in place; the engine
 * only ever calls them on its own working copy of the state.
 */
export interface RngHolder {
  rng: number;
}

export function hashSeed(seed: string | number): number {
  const s = String(seed);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Returns a float in [0, 1). */
export function rand(h: RngHolder): number {
  h.rng = (h.rng + 0x6d2b79f5) >>> 0;
  let t = h.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Integer in [min, max] inclusive. */
export function randInt(h: RngHolder, min: number, max: number): number {
  return min + Math.floor(rand(h) * (max - min + 1));
}

export function chance(h: RngHolder, p: number): boolean {
  return rand(h) < p;
}

export function pick<T>(h: RngHolder, arr: readonly T[]): T {
  if (arr.length === 0) throw new Error('pick() on empty array');
  return arr[Math.floor(rand(h) * arr.length)];
}

/** Approximately normal(0,1) via sum of uniforms. */
export function gauss(h: RngHolder): number {
  let s = 0;
  for (let i = 0; i < 6; i++) s += rand(h);
  return (s - 3) / Math.sqrt(0.5);
}

export function shuffle<T>(h: RngHolder, arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand(h) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Weighted pick; weights <= 0 are ignored. Returns undefined if nothing has weight. */
export function weightedPick<T>(h: RngHolder, items: readonly T[], weight: (t: T) => number): T | undefined {
  let total = 0;
  for (const it of items) total += Math.max(0, weight(it));
  if (total <= 0) return undefined;
  let r = rand(h) * total;
  for (const it of items) {
    const w = Math.max(0, weight(it));
    if (r < w) return it;
    r -= w;
  }
  return items[items.length - 1];
}
