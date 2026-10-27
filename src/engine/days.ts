import { addDays, formatDate } from './calendar';
import { player } from './characters';
import { roundOptions, roundSlots, usualWeek } from './rounds';
import { tripOf } from './travelState';
import type { GameDate, GameState, PlayerChoices } from './types';

/**
 * The week as days. The engine still turns one week at a time
 * (`advanceWeek`); this layer only says what the boss does on which day of
 * the week he is living: Monday to Sunday, each with the morning check-in
 * with his capos (checkins.ts) and one evening of his own (a Round).
 *
 * `s.days` is a small, optional plan (old saves have none): the day the
 * running clock has reached, the evening picked for each day, the answers
 * given at the check-ins, the mornings he skipped. Nothing in it is a result:
 * every effect is resolved by `advanceWeek` from `weekChoices(s)`, the same
 * way whether the week was played day by day on the clock or in one click
 * of Advance Week. `advanceWeek` drops the plan when the week turns.
 */

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface DaysState {
  /** The week this plan is for (a stale plan is ignored). */
  week: number;
  /** The day the clock has reached: 0 Monday … 6 Sunday. */
  day: number;
  /** The evening for each day (round ids); absent until the player changes the usual week. */
  plan?: (string | null)[];
  /** Check-in key ("d:capoId") -> answer id. */
  answers: Record<string, string>;
  /** Mornings the boss skipped the check-in. */
  skipped: number[];
}

/** This week's plan (read-only: a fresh one when the save has none or an old one). */
export function daysOf(s: GameState): DaysState {
  const d = s.days;
  if (d && d.week === s.week) return d;
  return { week: s.week, day: 0, answers: {}, skipped: [] };
}

export function today(s: GameState): number {
  return daysOf(s).day;
}

function withDays(s: GameState, f: (d: DaysState) => DaysState): GameState {
  const d = daysOf(s);
  return { ...s, days: f({ ...d, answers: { ...d.answers }, skipped: [...d.skipped], ...(d.plan ? { plan: [...d.plan] } : {}) }) };
}

export function dayDate(s: GameState, day = today(s)): GameDate {
  return addDays(s.date, day);
}

/** "Mon Jun 6, 1960". */
export function formatDay(s: GameState, day = today(s)): string {
  const d = dayDate(s, day);
  return `${DAY_SHORT[day]} ${MONTH_SHORT[d.m - 1]} ${d.d}, ${d.y}`;
}

/** "Monday, June 6, 1960" (for the planner's header). */
export function longDay(s: GameState, day = today(s)): string {
  return `${DAY_NAMES[day]}, ${formatDate(dayDate(s, day))}`;
}

/**
 * Why the boss can't hold the morning meeting on this day (undefined: he
 * can). Prison, the lam, a trip that has him out of town that day, or a
 * hospital bed.
 */
export function awayReason(s: GameState, day: number): string | undefined {
  const b = player(s);
  if (b.imprisonedUntil !== undefined && b.imprisonedUntil > s.week) return 'In prison';
  if (s.travel?.fugitives.some((f) => !f.end && f.personId === b.id)) return 'In hiding';
  const t = tripOf(s, b.id);
  const abs = s.week * 7 + day;
  if (t && t.departDay <= abs && abs < t.homeDay) return 'Out of town';
  if (b.health < 25) return 'In the hospital';
  return undefined;
}

/** Can the boss spend this evening on a round? (In prison: Sunday visiting only.) */
export function eveningOpen(s: GameState, day: number): boolean {
  const why = awayReason(s, day);
  if (!why) return true;
  return why === 'In prison' ? day === 6 : false;
}

/** The order the usual week fills the evenings: the weeknights, then the weekend. */
const FILL = [1, 3, 4, 2, 5, 0, 6];

/** The day an evening is fixed to (Friday fights, Sunday dinner), from the one calendar record: the round itself. */
export function fixedDay(s: GameState, id: string, opts?: readonly { id: string; day?: number }[]): number | undefined {
  if (id === 'fam:sunday') return 6;
  return (opts ?? roundOptions(s)).find((x) => x.id === id)?.day;
}

/** Lay a list of rounds onto the week's free evenings. A round fixed to a day goes on that day or not at all. */
export function layoutWeek(s: GameState, ids: string[], from = 0): (string | null)[] {
  const out: (string | null)[] = Array(7).fill(null);
  const open = (d: number) => d >= from && eveningOpen(s, d) && out[d] === null;
  const rest: string[] = [];
  const opts = ids.length ? roundOptions(s) : [];
  for (const id of ids) {
    const fixed = fixedDay(s, id, opts);
    if (fixed !== undefined) { if (open(fixed)) out[fixed] = id; }
    else rest.push(id);
  }
  for (const id of rest) {
    const d = FILL.find(open);
    if (d === undefined) break;
    out[d] = id;
  }
  return out;
}

/** The evening picked for each day this week (the usual week until the player changes it). */
export function weekPlan(s: GameState): (string | null)[] {
  return daysOf(s).plan ?? layoutWeek(s, usualWeek(s));
}

/** The rounds the week will live, in day order (what `advanceWeek` is sent). */
export function plannedRounds(s: GameState): string[] {
  return weekPlan(s).filter((x): x is string => !!x);
}

/** Why an evening can't be set (undefined: it can). */
export function dayBlock(s: GameState, day: number, id: string | null): string | undefined {
  if (day < today(s)) return 'That day is gone';
  if (id === null) return undefined;
  if (!eveningOpen(s, day)) return awayReason(s, day) ?? 'Not this evening';
  const r = roundOptions(s).find((x) => x.id === id);
  if (!r) return 'Not this week';
  const fixed = r.day;
  if (fixed !== undefined && fixed !== day) return `Only on ${DAY_NAMES[fixed]}`;
  const plan = weekPlan(s);
  const others = plan.filter((x, i) => x && i !== day && x !== id).length;
  if (others + 1 > roundSlots(s).slots) return 'No evenings left this week';
  return undefined;
}

/** Put an evening on a day (null clears it). A round already on another day moves. Returns the state unchanged when blocked. */
export function setEvening(s: GameState, day: number, id: string | null): GameState {
  if (dayBlock(s, day, id)) return s;
  const plan = weekPlan(s).map((x) => (x === id ? null : x));
  plan[day] = id;
  return withDays(s, (d) => ({ ...d, plan }));
}

/** Replace the whole week's evenings (the Sit-Down's lane picker): laid out from today on, past days kept. */
export function setWeekRounds(s: GameState, ids: string[] | undefined): GameState {
  const now = today(s);
  const past = weekPlan(s).map((x, i) => (i < now ? x : null));
  const keep = ids === undefined ? usualWeek(s) : ids;
  const fresh = layoutWeek(s, keep.filter((id) => !past.includes(id)), now);
  const plan = past.map((x, i) => x ?? fresh[i]);
  return withDays(s, (d) => ({ ...d, plan }));
}

export function answerCheckIn(s: GameState, key: string, answer: string | undefined): GameState {
  return withDays(s, (d) => {
    const answers = { ...d.answers };
    if (answer === undefined) delete answers[key]; else answers[key] = answer;
    return { ...d, answers };
  });
}

export function skipMorning(s: GameState, day: number, skip: boolean): GameState {
  if (day < today(s)) return s;
  return withDays(s, (d) => ({ ...d, skipped: skip ? [...new Set([...d.skipped, day])].sort() : d.skipped.filter((x) => x !== day) }));
}

/** One day passes on the clock. On Sunday the caller turns the week (`advanceWeek(s, weekChoices(s, …))`). */
export function tickDay(s: GameState): GameState {
  const d = daysOf(s);
  if (d.day >= 6) return s;
  return withDays(s, (x) => ({ ...x, day: x.day + 1 }));
}

/** Mornings missed this week: the boss away, or he skipped them. */
export function missedMornings(s: GameState, skipped: readonly number[] = daysOf(s).skipped): Record<number, string> {
  const out: Record<number, string> = {};
  for (let d = 0; d < 7; d++) {
    const why = awayReason(s, d) ?? (skipped.includes(d) ? 'Skipped' : undefined);
    if (why) out[d] = why;
  }
  return out;
}

/**
 * The week's choices from the plan: the evenings in day order, the answers
 * given at the check-ins and the mornings skipped, on top of the orders and
 * answers the App collected. The ONE place both Advance Week and the clock
 * build what `advanceWeek` is sent.
 */
export function weekChoices(s: GameState, base: PlayerChoices = {}): PlayerChoices {
  const d = daysOf(s);
  return { ...base, rounds: base.rounds ?? plannedRounds(s), checkins: { ...d.answers }, skipDays: [...d.skipped] };
}
