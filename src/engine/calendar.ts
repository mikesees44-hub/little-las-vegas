import type { GameDate } from './types';

/**
 * Calendar. The game counts absolute weeks; week 1 starts Memorial Day 1960
 * (Monday, May 30 — Memorial Day was fixed on May 30 until the Uniform Monday
 * Holiday Act took effect in 1971). Each week is exactly 7 days.
 *
 * The Season runs from Memorial Day (inclusive) to Labor Day (exclusive; the
 * first Monday in September). A week is "in season" if its Monday falls in
 * that window.
 */

export const START_DATE: GameDate = { y: 1960, m: 5, d: 30 };
export const SEASON_MULTIPLIER = 2.5;
export const OFFSEASON_MULTIPLIER = 0.4;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Days since 1970-01-01 for a civil date (Howard Hinnant's algorithm). */
export function toDays(date: GameDate): number {
  let { y } = date;
  const { m, d } = date;
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function fromDays(z: number): GameDate {
  z += 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return { y: y + (m <= 2 ? 1 : 0), m, d };
}

/** 0 = Sunday ... 6 = Saturday */
export function weekday(date: GameDate): number {
  return (((toDays(date) + 4) % 7) + 7) % 7;
}

export function addDays(date: GameDate, n: number): GameDate {
  return fromDays(toDays(date) + n);
}

export function dateOfWeek(week: number): GameDate {
  return addDays(START_DATE, (week - 1) * 7);
}

export function compareDates(a: GameDate, b: GameDate): number {
  return toDays(a) - toDays(b);
}

export function memorialDay(year: number): GameDate {
  if (year < 1971) return { y: year, m: 5, d: 30 };
  // last Monday of May
  const may31 = { y: year, m: 5, d: 31 };
  const back = (weekday(may31) - 1 + 7) % 7;
  return addDays(may31, -back);
}

export function laborDay(year: number): GameDate {
  const sep1 = { y: year, m: 9, d: 1 };
  const fwd = (1 - weekday(sep1) + 7) % 7;
  return addDays(sep1, fwd);
}

export function isInSeason(date: GameDate): boolean {
  const t = toDays(date);
  return t >= toDays(memorialDay(date.y)) && t < toDays(laborDay(date.y));
}

export function seasonMultiplier(date: GameDate): number {
  return isInSeason(date) ? SEASON_MULTIPLIER : OFFSEASON_MULTIPLIER;
}

/** Weeks (rounded up) from `date` until the target date. 0 if the target is today or past. */
function weeksUntil(date: GameDate, target: GameDate): number {
  const diff = toDays(target) - toDays(date);
  return diff <= 0 ? 0 : Math.ceil(diff / 7);
}

export interface SeasonInfo {
  inSeason: boolean;
  label: string;
  multiplier: number;
  /** In season: weeks until Labor Day. Off-season: weeks until next Memorial Day. */
  weeksRemaining: number;
  countdownLabel: string;
}

export function seasonInfo(date: GameDate): SeasonInfo {
  const inSeason = isInSeason(date);
  if (inSeason) {
    const w = weeksUntil(date, laborDay(date.y));
    return {
      inSeason,
      label: 'The Season',
      multiplier: SEASON_MULTIPLIER,
      weeksRemaining: w,
      countdownLabel: `${w} week${w === 1 ? '' : 's'} to Labor Day`,
    };
  }
  const nextMd = toDays(date) < toDays(memorialDay(date.y)) ? memorialDay(date.y) : memorialDay(date.y + 1);
  const w = weeksUntil(date, nextMd);
  return {
    inSeason,
    label: 'Off-Season',
    multiplier: OFFSEASON_MULTIPLIER,
    weeksRemaining: w,
    countdownLabel: `${w} week${w === 1 ? '' : 's'} to Memorial Day`,
  };
}

export function formatDate(d: GameDate): string {
  return `${MONTH_NAMES[d.m - 1]} ${d.d}, ${d.y}`;
}

export function monthName(m: number): string {
  return MONTH_NAMES[m - 1];
}

export function monthKey(d: GameDate): string {
  return `${d.y}-${d.m}`;
}

/** Whole years between birth and date. */
export function ageOn(birth: GameDate, date: GameDate): number {
  let a = date.y - birth.y;
  if (date.m < birth.m || (date.m === birth.m && date.d < birth.d)) a--;
  return a;
}

/** Game year index: year 1 = weeks from Memorial Day 1960 to the week before Memorial Day 1961. */
export function gameYear(week: number): number {
  return Math.floor((week - 1) / 52) + 1;
}
