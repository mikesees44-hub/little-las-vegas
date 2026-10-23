import { describe, expect, it } from 'vitest';
import {
  addDays, dateOfWeek, isInSeason, laborDay, memorialDay, seasonInfo, seasonMultiplier, weekday, ageOn, toDays, fromDays,
} from '../src/engine/calendar';
import { newGame } from '../src/engine/newGame';
import { advanceMonth, advanceWeek } from '../src/engine/engine';

describe('calendar', () => {
  it('starts on Memorial Day 1960, a Monday', () => {
    expect(dateOfWeek(1)).toEqual({ y: 1960, m: 5, d: 30 });
    expect(weekday({ y: 1960, m: 5, d: 30 })).toBe(1);
  });
  it('round-trips day numbers', () => {
    for (let d = -5000; d < 5000; d += 37) expect(toDays(fromDays(d))).toBe(d);
  });
  it('computes Labor Day as the first Monday of September', () => {
    expect(laborDay(1960)).toEqual({ y: 1960, m: 9, d: 5 });
    expect(laborDay(1961)).toEqual({ y: 1961, m: 9, d: 4 });
    expect(laborDay(1969)).toEqual({ y: 1969, m: 9, d: 1 });
    for (let y = 1960; y < 1975; y++) expect(weekday(laborDay(y))).toBe(1);
  });
  it('uses fixed May 30 Memorial Day before 1971 and last Monday after', () => {
    expect(memorialDay(1965)).toEqual({ y: 1965, m: 5, d: 30 });
    expect(memorialDay(1971)).toEqual({ y: 1971, m: 5, d: 31 });
    expect(memorialDay(1972)).toEqual({ y: 1972, m: 5, d: 29 });
  });
  it('season boundaries and multipliers', () => {
    expect(isInSeason({ y: 1960, m: 5, d: 30 })).toBe(true);
    expect(isInSeason({ y: 1960, m: 9, d: 4 })).toBe(true);
    expect(isInSeason({ y: 1960, m: 9, d: 5 })).toBe(false); // Labor Day itself: season over
    expect(isInSeason({ y: 1960, m: 5, d: 29 })).toBe(false);
    expect(seasonMultiplier({ y: 1960, m: 7, d: 4 })).toBe(2.5);
    expect(seasonMultiplier({ y: 1960, m: 12, d: 25 })).toBe(0.4);
  });
  it('counts down correctly', () => {
    const start = seasonInfo({ y: 1960, m: 5, d: 30 });
    expect(start.inSeason).toBe(true);
    expect(start.weeksRemaining).toBe(14); // May 30 -> Sep 5 is 98 days
    const lastWeek = seasonInfo({ y: 1960, m: 8, d: 29 });
    expect(lastWeek.weeksRemaining).toBe(1);
    const off = seasonInfo({ y: 1960, m: 9, d: 5 });
    expect(off.inSeason).toBe(false);
    expect(off.countdownLabel).toContain('Memorial Day');
    // Sep 5 1960 -> May 30 1961 = 267 days -> 39 weeks (rounded up)
    expect(off.weeksRemaining).toBe(39);
    const jan = seasonInfo({ y: 1961, m: 1, d: 2 });
    expect(jan.weeksRemaining).toBe(Math.ceil((toDays({ y: 1961, m: 5, d: 30 }) - toDays({ y: 1961, m: 1, d: 2 })) / 7));
  });
  it('the season lasts 14 weeks in 1960', () => {
    let n = 0;
    for (let w = 1; w <= 52; w++) if (isInSeason(dateOfWeek(w))) n++;
    expect(n).toBe(14);
  });
  it('ages correctly around birthdays', () => {
    expect(ageOn({ y: 1920, m: 6, d: 10 }, { y: 1960, m: 6, d: 9 })).toBe(39);
    expect(ageOn({ y: 1920, m: 6, d: 10 }, { y: 1960, m: 6, d: 10 })).toBe(40);
    expect(addDays({ y: 1960, m: 12, d: 31 }, 1)).toEqual({ y: 1961, m: 1, d: 1 });
  });
  it('advanceWeek moves exactly 7 days and does not mutate input', () => {
    const s = newGame('cal');
    const frozen = JSON.stringify(s);
    const r = advanceWeek(s, {});
    expect(JSON.stringify(s)).toBe(frozen);
    expect(r.state.week).toBe(2);
    expect(r.state.date).toEqual({ y: 1960, m: 6, d: 6 });
  });
  it('advanceMonth stops when the month changes', () => {
    const s = newGame('cal2');
    const r = advanceMonth(s, {});
    expect(r.state.date.m).toBe(6);
    expect(r.reports.length).toBe(1); // May 30 -> June 6
    const r2 = advanceMonth(r.state, {});
    expect(r2.state.date.m).toBe(7);
    expect(r2.reports.length).toBe(4);
  });
});
