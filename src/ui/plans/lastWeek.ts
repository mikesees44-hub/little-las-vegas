import { useSyncExternalStore } from 'react';
import type { PlayerAction } from '../../engine/types';

/**
 * LAST WEEK'S ORDERS (per game, per browser): what the boss gave the week
 * before, for "Same as last week". UI state, not game state; behind
 * try/catch (without storage it lasts the session).
 */
export interface LastWeek { week: number; orders: PlayerAction[] }

const mem: Record<string, LastWeek> = {};
const subs = new Set<() => void>();
const key = (seed: string) => `llv.lastweek.${seed}`;

export function lastWeekOrders(seed: string): LastWeek | undefined {
  if (mem[seed]) return mem[seed];
  try {
    const raw = localStorage.getItem(key(seed));
    if (raw) mem[seed] = JSON.parse(raw) as LastWeek;
  } catch { /* nothing remembered */ }
  return mem[seed];
}

/** The week turned: remember the orders it ran with (an empty week keeps the one before). */
export function rememberWeekOrders(seed: string, week: number, orders: readonly PlayerAction[]): void {
  if (!orders.length) return;
  const v: LastWeek = { week, orders: orders.map((a) => { const { fund: _f, ...b } = a as PlayerAction & { fund?: string }; void _f; return b as PlayerAction; }) };
  mem[seed] = v;
  try { localStorage.setItem(key(seed), JSON.stringify(v)); } catch { /* not remembered */ }
  for (const f of subs) f();
}

/** Tests: forget. */
export function resetLastWeek(): void {
  for (const k of Object.keys(mem)) delete mem[k];
}

export function useLastWeek(seed: string): LastWeek | undefined {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => lastWeekOrders(seed), () => lastWeekOrders(seed));
}
