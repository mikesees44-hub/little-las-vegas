import type { PlayerAction } from '../../engine/types';

/**
 * What the UI remembers about each order given this week (by the order
 * object itself, so removing one never shifts the others): when the hours
 * were taken (today, or booked for a later day by "Do it tomorrow"). The
 * Plans panel reads it to say when an order happens and to cancel it with its
 * hours given back. And the last orders given, for "Recent" (per browser).
 */
export interface OrderMark {
  /** The absolute day its hours came off (spent today). */
  abs?: number;
  /** Booked for this day of the week (0 Monday … 6 Sunday) by "Do it tomorrow". */
  booked?: number;
  hours: number;
  late?: number;
  missedDinner?: boolean;
}

const marks = new WeakMap<PlayerAction, OrderMark>();

export function markOrder(a: PlayerAction, m: OrderMark): void {
  marks.set(a, m);
  rememberRecent(a);
}

export function orderMark(a: PlayerAction): OrderMark | undefined {
  return marks.get(a);
}

/* ---- Recent orders (per browser, per game) ---- */

const RECENT_MAX = 8;
let recentMem: Record<string, PlayerAction[]> = {};
let recentSeed = '';

export function setRecentSeed(seed: string): void {
  recentSeed = seed;
}

function recentKey(): string {
  return `llv.recent.${recentSeed}`;
}

export function recentOrders(seed = recentSeed): PlayerAction[] {
  if (recentMem[seed]) return recentMem[seed];
  try {
    const raw = localStorage.getItem(`llv.recent.${seed}`);
    recentMem[seed] = raw ? (JSON.parse(raw) as PlayerAction[]) : [];
  } catch {
    recentMem[seed] = [];
  }
  return recentMem[seed];
}

function rememberRecent(a: PlayerAction): void {
  if (!recentSeed) return;
  const j = JSON.stringify(a);
  const next = [a, ...recentOrders().filter((x) => JSON.stringify(x) !== j)].slice(0, RECENT_MAX);
  recentMem = { ...recentMem, [recentSeed]: next };
  try { localStorage.setItem(recentKey(), JSON.stringify(next)); } catch { /* not remembered */ }
}

/** Tests: forget everything. */
export function resetRecent(): void {
  recentMem = {};
}
