import type { GameState } from './types';

/**
 * LOYALTY THAT MOVES (GODFATHER_LOYALTY_SKILLS.md §C). Every opinion change of
 * a man the boss watches (his own people, his blood, the other families'
 * bosses, his payroll) toward the boss is noted at the one place opinions
 * change (relations.addOpinion): the last LOYAL_KEEP reasons per person (for
 * the meter's trend arrow and "why it moved"), and a short feed with a running
 * number (the HUD's "+5 Sal (honored my wedding)" floaters and the result
 * card's ripple line read what came after their mark).
 *
 * Compact on purpose (saves are near the browser's limit): tuples, reasons
 * clipped, three per person, eight in the feed; the dead are pruned monthly.
 * `GameState.loyal` is optional: made by the first change that needs it.
 */

/** [week, change, reason]. */
export type LoyalLine = [number, number, string];
/** [running number, person, change, reason]. */
export type LoyalFeed = [number, string, number, string];

export interface LoyalState {
  v: 1;
  /** Person -> his last reasons, oldest first. */
  h: Record<string, LoyalLine[]>;
  /** The newest changes, oldest first (the floaters). */
  f: LoyalFeed[];
  /** Running number of the feed. */
  n: number;
}

export const LOYAL_KEEP = 3;
export const LOYAL_FEED = 8;
/** Smaller moves are drift, not news. */
export const LOYAL_MIN = 2;
/** Weeks the trend arrow looks back. */
export const TREND_WEEKS = 8;

export function ensureLoyal(s: GameState): LoyalState {
  if (!s.loyal) s.loyal = { v: 1, h: {}, f: [], n: 0 };
  const L = s.loyal;
  L.h ??= {};
  L.f ??= [];
  L.n ??= 0;
  return L;
}

/** People whose loyalty the boss watches. */
export function watchedLoyalty(s: GameState, id: string): boolean {
  const c = s.characters[id];
  if (!c || !c.alive || id === s.playerId) return false;
  return c.faction === 'player' || !!c.dynasty || !!s.payroll?.hires[id] || s.rivals.some((r) => r.leaderId === id);
}

/** Called by relations.addOpinion with the change that landed. */
export function noteLoyalty(s: GameState, from: string, to: string, reason: string, v: number): void {
  if (to !== s.playerId || Math.abs(v) < LOYAL_MIN || !watchedLoyalty(s, from)) return;
  // Copy on write: pure actions copy the state shallowly (peopleRead's cloneForRead), so the input's layer is never touched.
  const L0 = ensureLoyal(s);
  const L: LoyalState = { ...L0, h: { ...L0.h }, f: L0.f.slice() };
  s.loyal = L;
  const why = reason.length > 48 ? `${reason.slice(0, 47)}…` : reason;
  const h = (L.h[from] = (L.h[from] ?? []).map((x) => [...x] as LoyalLine));
  const last = h[h.length - 1];
  if (last && last[0] === s.week && last[2] === why) last[1] += v;
  else h.push([s.week, v, why]);
  if (h.length > LOYAL_KEEP) h.splice(0, h.length - LOYAL_KEEP);
  L.n += 1;
  L.f.push([L.n, from, v, why]);
  if (L.f.length > LOYAL_FEED) L.f.splice(0, L.f.length - LOYAL_FEED);
}

/** The feed's mark (take it before an order; read what came after with loyaltySince). */
export function loyaltyMark(s: GameState): number {
  return s.loyal?.n ?? 0;
}

export function loyaltySince(s: GameState, mark: number): LoyalFeed[] {
  return (s.loyal?.f ?? []).filter((x) => x[0] > mark);
}

export interface Trend {
  /** ▲ warming, ▼ cooling, → steady. */
  arrow: '▲' | '▼' | '→';
  dir: 1 | -1 | 0;
  /** The sum of the recent moves. */
  d: number;
  /** Why it moved, newest first. */
  why: { w: number; v: number; y: string }[];
}

export function loyaltyTrend(s: GameState, id: string): Trend {
  const h = s.loyal?.h[id] ?? [];
  const d = h.filter((x) => s.week - x[0] <= TREND_WEEKS).reduce((a, x) => a + x[1], 0);
  const dir = d >= 3 ? 1 : d <= -3 ? -1 : 0;
  return { arrow: dir > 0 ? '▲' : dir < 0 ? '▼' : '→', dir, d, why: h.slice().reverse().map(([w, v, y]) => ({ w, v, y })) };
}

/** "+5 Sal (honored my wedding)". */
export function floaterText(s: GameState, f: LoyalFeed): string {
  const c = s.characters[f[1]];
  const why = f[3] ? f[3][0].toLowerCase() + f[3].slice(1) : '';
  return `${f[2] > 0 ? '+' : '−'}${Math.abs(f[2])} ${c?.firstName ?? '?'}${why ? ` (${why})` : ''}`;
}

/** Monthly: the dead and the departed are forgotten. */
export function loyaltyMonth(s: GameState): void {
  const L = s.loyal;
  if (!L) return;
  for (const id of Object.keys(L.h)) if (!watchedLoyalty(s, id) || s.week - (L.h[id][L.h[id].length - 1]?.[0] ?? 0) > 104) delete L.h[id];
}
