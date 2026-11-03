import { ensureAction } from './actionState';
import { today } from './days';
import type { NowResult } from './deeds/now';
import type { GameState } from './types';

/**
 * THE DAY/HOUR SCHEDULER (general, reusable): anything that should happen at a day and hour on the
 * running clock. A system puts an item on the schedule with `scheduleAt` (a kind and a payload), and
 * registers a delivery hook for its kind with `registerDelivery`. When the clock reaches the item's
 * day (daily.ts advanceDay), the hook decides: a MOMENT (the clock stops, a card with odds: `view`,
 * then `answer` rolls it in the moment) or a quiet delivery (`answer` with the default at once).
 * An item nobody answered gets the default on the next day; an item whose day the week skipped
 * (Advance Week) is delivered with the default when the clock next moves.
 *
 * The threats' ticking clocks (threats.ts) and the hurricane's night (setPieces.ts) are moments of the
 * same shape; the planned uses are an incoming phone call at an hour and a meet set for a place and
 * time (PHONE.md): register a kind, schedule items, and the clock delivers them.
 *
 * Items live in ActionState.sched; ids come from a counter (deterministic).
 */

export interface ScheduledItem {
  id: string;
  kind: string;
  /** Absolute week, day of the week (0 Monday … 6 Sunday) and hour (0-23). */
  w: number;
  d: number;
  h: number;
  payload: Record<string, unknown>;
  /** Delivered and waiting on the boss (a moment on the clock). */
  live?: 1;
}

/** What a moment shows (the same shape as threats.ts StrikeView). */
export interface MomentView {
  id: string;
  title: string;
  text: string;
  /** "Friday night, 2 a.m." */
  when: string;
  warned: boolean;
  options: { id: string; label: string; hint: string; odds: number; blocked?: string }[];
  def: string;
}

export interface DeliveryHook {
  kind: string;
  /** Stop the clock for it (a moment)? Default: yes. False: it is answered with `def` at once (quiet). */
  moment?: (s: GameState, item: ScheduledItem) => boolean;
  /** The card (undefined: it is moot, drop it). */
  view: (s: GameState, item: ScheduledItem) => MomentView | undefined;
  /** Rolled now; pure. `extra`: a front page for tomorrow's paper. The item is removed by the scheduler. */
  answer: (s: GameState, item: ScheduledItem, opt: string) => { state: GameState; result: NowResult; extra?: { h: string; b: string } };
}

const HOOKS = new Map<string, DeliveryHook>();

/** Register (or replace) the delivery for a kind. */
export function registerDelivery(h: DeliveryHook): void {
  HOOKS.set(h.kind, h);
}

export function deliveryFor(kind: string): DeliveryHook | undefined {
  return HOOKS.get(kind);
}

/** Put an item on the clock (pure). `w` defaults to this week. Returns the new state and the item's id. */
export function scheduleAt(s: GameState, at: { kind: string; day: number; hour: number; w?: number; payload?: Record<string, unknown> }): { state: GameState; id: string } {
  const x: GameState = { ...s, action: structuredClone(s.action) ?? undefined };
  const id = scheduleInto(x, at);
  return { state: x, id };
}

/** The same, on a working copy (the week turn, a system's own step). */
export function scheduleInto(s: GameState, at: { kind: string; day: number; hour: number; w?: number; payload?: Record<string, unknown> }): string {
  const A = ensureAction(s);
  A.sched ??= [];
  A.schedN = (A.schedN ?? 0) + 1;
  const id = `sc${A.schedN}`;
  A.sched.push({ id, kind: at.kind, w: at.w ?? s.week, d: Math.max(0, Math.min(6, at.day)), h: Math.max(0, Math.min(23, at.hour)), payload: at.payload ?? {} });
  return id;
}

export function scheduled(s: GameState): ScheduledItem[] {
  return s.action?.sched ?? [];
}

/** Items whose time has come (this day, or a day the clock skipped), not yet delivered. */
export function dueItems(s: GameState): ScheduledItem[] {
  const d = today(s);
  return scheduled(s).filter((x) => !x.live && (x.w < s.week || (x.w === s.week && x.d <= d))).sort((a, b) => a.w - b.w || a.d - b.d || a.h - b.h || a.id.localeCompare(b.id));
}

export function liveItems(s: GameState): ScheduledItem[] {
  return scheduled(s).filter((x) => x.live);
}

function withSched(s: GameState, f: (xs: ScheduledItem[]) => ScheduledItem[]): GameState {
  const A = s.action;
  if (!A) return s;
  return { ...s, action: { ...A, sched: f(A.sched ?? []) } };
}

/** Mark an item live (the clock stops for it). */
export function markLive(s: GameState, id: string): GameState {
  return withSched(s, (xs) => xs.map((x) => (x.id === id ? { ...x, live: 1 as const } : x)));
}

export function dropItem(s: GameState, id: string): GameState {
  return withSched(s, (xs) => xs.filter((x) => x.id !== id));
}

/** The card for a scheduled item. */
export function itemView(s: GameState, id: string): MomentView | undefined {
  const it = scheduled(s).find((x) => x.id === id);
  const h = it ? HOOKS.get(it.kind) : undefined;
  return it && h ? h.view(s, it) : undefined;
}

/** Answer a scheduled item now; it leaves the schedule. */
export function answerItem(s: GameState, id: string, opt?: string): { state: GameState; result: NowResult; extra?: { h: string; b: string } } | undefined {
  const it = scheduled(s).find((x) => x.id === id);
  const h = it ? HOOKS.get(it.kind) : undefined;
  if (!it || !h) return undefined;
  const v = h.view(s, it);
  const r = h.answer(s, it, opt ?? v?.def ?? 'default');
  return { ...r, state: dropItem(r.state, id) };
}
