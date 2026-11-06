import { useSyncExternalStore } from 'react';
import type { PlayerAction } from '../../engine/types';

/**
 * Favorites: the orders and the "things to do" the boss pinned, so the ones he
 * uses every week are one click away (the Find box's front page, the Plans
 * panel). Per browser: orders per game (they name this game's people and
 * places), things to do for every game. Kept behind try/catch: without
 * storage they last the session.
 */
export interface Pins {
  /** Orders, as given (JSON), per game seed. */
  orders: Record<string, PlayerAction[]>;
  /** Things to do (actionEntries labels). */
  entries: string[];
}

const KEY = 'llv.pins';
let cache: Pins | undefined;
const subs = new Set<() => void>();

function load(): Pins {
  if (cache) return cache;
  let p: Pins = { orders: {}, entries: [] };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) p = { ...p, ...(JSON.parse(raw) as Partial<Pins>) };
  } catch { /* defaults */ }
  cache = p;
  return p;
}

function save(p: Pins): void {
  cache = p;
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* not remembered */ }
  for (const f of subs) f();
}

export function getPins(): Pins {
  return load();
}

const same = (a: PlayerAction, b: PlayerAction) => JSON.stringify(a) === JSON.stringify(b);

export function pinnedOrders(seed: string): PlayerAction[] {
  return load().orders[seed] ?? [];
}

export function isPinnedOrder(seed: string, a: PlayerAction): boolean {
  return pinnedOrders(seed).some((x) => same(x, a));
}

export function togglePinOrder(seed: string, a: PlayerAction): void {
  const p = load();
  const cur = p.orders[seed] ?? [];
  const { fund: _f, ...bare } = a as PlayerAction & { fund?: string };
  void _f;
  const next = cur.some((x) => same(x, bare as PlayerAction)) ? cur.filter((x) => !same(x, bare as PlayerAction)) : [...cur, bare as PlayerAction].slice(-12);
  save({ ...p, orders: { ...p.orders, [seed]: next } });
}

/** Move a pinned order from one place in the tray to another (drag, or the arrow keys). */
export function movePin(seed: string, from: number, to: number): void {
  const p = load();
  const cur = [...(p.orders[seed] ?? [])];
  if (from < 0 || from >= cur.length) return;
  const t = Math.max(0, Math.min(cur.length - 1, to));
  if (t === from) return;
  const [x] = cur.splice(from, 1);
  cur.splice(t, 0, x);
  save({ ...p, orders: { ...p.orders, [seed]: cur } });
}

export function isPinnedEntry(label: string): boolean {
  return load().entries.includes(label);
}

export function togglePinEntry(label: string): void {
  const p = load();
  save({ ...p, entries: p.entries.includes(label) ? p.entries.filter((x) => x !== label) : [...p.entries, label] });
}

/** Tests: forget the cache. */
export function resetPins(): void {
  cache = undefined;
}

/** Re-render when the pins change. */
export function usePins(): Pins {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, load, load);
}
