import { today } from './days';
import type { EventInstance, GameState } from './types';

/**
 * When a decision comes out on the clock (daily.ts scheduleWeek stamps `meta.day`, Tuesday …
 * Friday): the screens show a decision only once its day has come. Kept apart so the inbox, the
 * desk and the door can read it without the daily layer's weight.
 */
export function eventOut(s: GameState, ev: EventInstance): boolean {
  const d = ev.meta?.day;
  // `dw`: the week it was scheduled for (a decision from the queue keeps its old `week`); a stale stamp is out.
  return d === undefined || Number(ev.meta?.dw ?? s.week) !== s.week || today(s) >= Number(d);
}

/** The decisions on the desk now. */
export function eventsOut(s: GameState): EventInstance[] {
  return s.pendingEvents.some((e) => e.meta?.day !== undefined) ? s.pendingEvents.filter((e) => eventOut(s, e)) : s.pendingEvents;
}
