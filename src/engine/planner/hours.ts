import { absDay, DAY_HOURS, DAY_START, hoursLabel, hoursUsed, TIME_TABLE, type HoursState } from '../timeCost';
import type { GameState } from '../types';

/** "18 hours", "2½ hours", "45 minutes" (hoursLabel calls ten hours or more "a day": a budget is counted in hours). */
export function hoursWord(h: number): string {
  return h >= 10 ? `${Math.round(h * 4) / 4} hours`.replace('.25', '¼').replace('.75', '¾').replace('.5', '½') : hoursLabel(h);
}

/**
 * The datebook's hours: the same budget as every order (timeCost.ts: the day runs 8 AM to 2 AM, 18 hours).
 * Something put on the book for today takes its hours now; for a later day they are booked ahead
 * (`HoursState.booked`, the same record "Do it tomorrow" uses), so that day starts with them spent.
 */

/** Hours each kind of entry takes, from the time table: a word with one of your people, a dinner, a meet. */
export const PLAN_HOURS = {
  audience: TIME_TABLE['mind:talk'] ?? 1,
  dinner: TIME_TABLE['interact:dinner'] ?? 3,
  visit: TIME_TABLE['talk:ask'] ?? 1,
  meet: TIME_TABLE['phone:meet'] ?? 2,
} as const;
export type PlanKind = keyof typeof PLAN_HOURS;

/** Hours already spent or booked on an absolute day. */
export function bookedOn(s: GameState, abs: number): number {
  const now = absDay(s);
  if (abs < now) return DAY_HOURS;
  if (abs === now) return hoursUsed(s);
  return Math.min(DAY_HOURS, s.hours?.booked?.[abs] ?? 0);
}

/** Hours still free on a day (0 for a day gone). */
export function freeOn(s: GameState, abs: number): number {
  return Math.max(0, DAY_HOURS - bookedOn(s, abs));
}

/** The hours left this week, today included (Sunday night is the end). */
export function weekLeft(s: GameState): number {
  const now = absDay(s);
  const end = s.week * 7 + 6;
  let n = 0;
  for (let a = now; a <= end; a++) n += freeOn(s, a);
  return n;
}

/** The first clock hour still open today (8 = 8 AM … 26 = 2 AM). */
export function nowHour(s: GameState): number {
  return DAY_START + hoursUsed(s);
}

/** Book (or with a negative number, give back) hours on an absolute day. Pure; a day gone is left alone. */
export function bookHours(s: GameState, abs: number, hours: number): GameState {
  const now = absDay(s);
  if (abs < now || !hours) return s;
  const prev = s.hours;
  const h: HoursState = prev ? { ...prev, ...(prev.booked ? { booked: { ...prev.booked } } : {}) } : { abs: now, used: 0 };
  if (h.abs !== now) { h.abs = now; h.used = hoursUsed(s); }
  if (abs === now) h.used = Math.max(0, Math.min(DAY_HOURS, h.used + hours));
  else {
    const b = { ...(h.booked ?? {}) };
    b[abs] = Math.max(0, Math.min(DAY_HOURS, (b[abs] ?? 0) + hours));
    if (!b[abs]) delete b[abs];
    if (Object.keys(b).length) h.booked = b; else delete h.booked;
  }
  return { ...s, hours: h };
}

/** Why an entry of `hours` can't go on that day and hour (undefined: it can). */
export function slotBlock(s: GameState, w: number, d: number, h: number, hours: number): string | undefined {
  const abs = w * 7 + d;
  const now = absDay(s);
  if (abs < now) return 'That day is gone';
  if (abs === now && h < Math.floor(nowHour(s))) return 'That hour is gone';
  if (h < DAY_START || h + hours > DAY_START + DAY_HOURS + 0.01) return 'Outside his day (8 AM to 2 AM)';
  if (freeOn(s, abs) + 1e-9 < hours) return abs === now ? 'Not enough hours left today' : 'That day is full';
  return undefined;
}
