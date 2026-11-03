import { describe, expect, it } from 'vitest';
import { player } from '../src/engine/characters';
import { daysOf, tickDay } from '../src/engine/days';
import { advanceWeek } from '../src/engine/engine';
import { fam } from '../src/engine/familyState';
import { newGame } from '../src/engine/newGame';
import { opinion } from '../src/engine/relations';
import {
  bookLater, clockHour, DAY_HOURS, DAY_START, dayDone, formatClock, hasTimeCost, hoursLabel, hoursLeft, hoursUsed,
  hoursWeek, refundTime, spendTime, TIME_TABLE, timeBlock, timeCost, TRAVEL_DAY, unbook,
} from '../src/engine/timeCost';
import type { GameState, PlayerAction } from '../src/engine/types';
import { ACTION_ENTRIES } from '../src/ui/shell/actionEntries';

const order: PlayerAction = { kind: 'order', key: 'x', via: 'boss' as never };
const sitDown: PlayerAction = { kind: 'talk', op: { t: 'ask', talk: 'meeting', target: 'x' } };
const date: PlayerAction = { kind: 'dating', op: { op: 'invite', id: 'x', date: 'dinner' as never } };
const host: PlayerAction = { kind: 'dynasty', op: { type: 'host', activity: 'feast' as never, guests: [] } };

function withHours(s: GameState, used: number): GameState {
  return { ...s, hours: { abs: s.week * 7 + daysOf(s).day, used } };
}

describe('time costs', () => {
  it('every order in the action registry has a written cost', () => {
    const missing: string[] = [];
    for (const e of ACTION_ENTRIES) {
      for (const op of e.ops ?? [undefined]) if (!hasTimeCost(e.kind, op)) missing.push(op ? `${e.kind}:${op}` : e.kind);
    }
    expect(missing).toEqual([]);
    for (const v of Object.values(TIME_TABLE)) expect(v).toBeGreaterThan(0);
  });

  it('crew orders are cheap, meetings take hours, a date is an evening, travel a day', () => {
    expect(timeCost(order)).toBe(0.25);
    expect(timeCost(sitDown)).toBeGreaterThanOrEqual(2);
    expect(timeCost(sitDown)).toBeLessThanOrEqual(3);
    expect(timeCost(date)).toBeGreaterThanOrEqual(3);
    expect(timeCost(date)).toBeLessThanOrEqual(5);
    expect(timeCost({ kind: 'askPermission', city: 'philly' })).toBe(TRAVEL_DAY);
    expect(timeCost({ kind: 'interact', id: 'dinner', target: 'x' })).toBe(3);
    // Unknown things default to an hour.
    expect(timeCost({ kind: 'nope' } as unknown as PlayerAction)).toBe(1);
  });

  it('a trip the boss does not go on is only an order', () => {
    const s = newGame('tc-trip');
    const trip = (leaderId: string): PlayerAction => ({ kind: 'travel', op: { type: 'trip', plan: { purpose: 'business', leaderId, destId: 'philly', mode: 'car', tier: 'modest', guests: [] } as never } });
    expect(timeCost(trip(s.playerId), s)).toBe(TRAVEL_DAY);
    expect(timeCost(trip('someone-else'), s)).toBe(0.5);
  });

  it('labels and the clock read like a person would say them', () => {
    expect(hoursLabel(0.25)).toBe('15 minutes');
    expect(hoursLabel(1)).toBe('1 hour');
    expect(hoursLabel(3)).toBe('3 hours');
    expect(hoursLabel(2.5)).toBe('2½ hours');
    expect(hoursLabel(TRAVEL_DAY)).toMatch(/^a day/);
    expect(formatClock(8)).toBe('8 AM');
    expect(formatClock(21)).toBe('9 PM');
    expect(formatClock(21.25)).toBe('9:15 PM');
    expect(formatClock(24)).toBe('12 AM');
    expect(formatClock(25.5)).toBe('1:30 AM');
    expect(formatClock(12)).toBe('12 PM');
  });

  it('old saves (no hours) start the day fresh at 8 AM; nothing is written until used', () => {
    const s = newGame('tc-fresh');
    expect(s.hours).toBeUndefined();
    expect(hoursUsed(s)).toBe(0);
    expect(hoursLeft(s)).toBe(DAY_HOURS);
    expect(clockHour(s)).toBe(DAY_START);
  });

  it('spending moves the clock; the day is done when the hours run out', () => {
    let s = newGame('tc-spend');
    const r = spendTime(s, sitDown);
    expect(r.hours).toBe(2);
    expect(r.from).toBe(8);
    expect(r.to).toBe(10);
    expect(clockHour(r.state)).toBe(10);
    expect(r.dayOver).toBe(false);
    s = withHours(s, DAY_HOURS - 0.25);
    const last = spendTime(s, order);
    expect(last.dayOver).toBe(true);
    expect(dayDone(last.state)).toBe(true);
    // The input is never changed.
    expect(s.hours!.used).toBe(DAY_HOURS - 0.25);
  });

  it('not enough hours: a reason, never a silent no', () => {
    const s = withHours(newGame('tc-block'), DAY_HOURS - 1);
    expect(timeBlock(s, order)).toBeUndefined();
    expect(timeBlock(s, date)).toMatch(/Not enough time today: it takes 4 hours, 1 hour left/);
    expect(timeBlock(withHours(s, DAY_HOURS), order)).toMatch(/No time left today/);
  });

  it('a new day starts fresh, with what was booked for it', () => {
    let s = newGame('tc-day');
    s = spendTime(s, sitDown).state;
    const b = bookLater(s, date);
    expect(b.day).toBe(1);
    s = tickDay(b.state);
    expect(hoursUsed(s)).toBe(4);
    expect(clockHour(s)).toBe(12);
    // Undo of the booking (on the day it was made) releases it.
    const u = unbook(b.state, 1, 4);
    expect(hoursUsed(tickDay(u))).toBe(0);
  });

  it('booking spills to the first day with room', () => {
    let s = newGame('tc-spill');
    for (let i = 0; i < 4; i++) s = bookLater(s, date).state;
    const r = bookLater(s, date);
    expect(r.day).toBe(2);
  });

  it('undo gives the hours back', () => {
    const s = newGame('tc-undo');
    const r = spendTime(s, sitDown);
    expect(hoursUsed(refundTime(r.state, r.hours))).toBe(0);
  });

  it('late nights add stress and a missed dinner is noticed when the week turns', () => {
    let s = newGame('tc-late');
    const boss = player(s);
    let wifeId = boss.spouseId;
    if (!wifeId || !s.characters[wifeId]?.alive) {
      const w = Object.values(s.characters).find((c) => c.alive && c.id !== boss.id)!;
      wifeId = w.id;
      s = { ...s, characters: { ...s.characters, [boss.id]: { ...boss, spouseId: w.id } } };
    }
    // 8 AM + 9h = 5 PM; a 4-hour date runs through dinner to 9 PM.
    s = withHours(s, 9);
    const d = spendTime(s, date);
    expect(d.missedDinner).toBe(true);
    expect(d.late).toBe(0);
    // A second evening the same day: dinner is counted once; this one runs to 1 AM: 3 late hours.
    const d2 = spendTime(d.state, date);
    expect(d2.missedDinner).toBe(false);
    expect(d2.late).toBe(3);
    // Family time is not a missed dinner.
    expect(spendTime(withHours(s, 9), host).missedDinner).toBe(false);
    s = { ...d2.state, hours: { ...d2.state.hours!, late: 8 } };
    const before = fam(s, s.playerId).stress;
    const opBefore = opinion(s, wifeId!, s.playerId);
    const x = JSON.parse(JSON.stringify(s)) as GameState;
    const lines = hoursWeek(x);
    expect(lines.length).toBeGreaterThan(0);
    expect(fam(x, x.playerId).stress).toBeGreaterThan(before);
    expect(opinion(x, wifeId!, x.playerId)).toBeLessThan(opBefore);
    expect(x.hours!.late).toBeUndefined();
    expect(x.hours!.missed).toBeUndefined();
  });

  it('advanceWeek feels the hours and stays pure', () => {
    const s0 = newGame('tc-week');
    const s = { ...s0, hours: { abs: s0.week * 7, used: 18, late: 6 } };
    const copy = JSON.stringify(s);
    const r = advanceWeek(s, {});
    expect(JSON.stringify(s)).toBe(copy);
    expect(r.state.hours?.late).toBeUndefined();
    expect(r.report.rounds?.some((l) => /Late nights/.test(l))).toBe(true);
    // A new week: a fresh day.
    expect(hoursUsed(r.state)).toBe(0);
  });
});

describe('time costs in the UI', () => {
  it('the confirm window says what it takes; with no time left it offers "Do it tomorrow"', async () => {
    const { createElement } = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { ConfirmOrder } = await import('../src/ui/components/ConfirmOrder');
    const { timeLine } = await import('../src/ui/components/OrderToast');
    const s = newGame('tc-ui');
    const props = { s, action: date, onYes: () => {}, onNo: () => {}, onNeverAsk: () => {}, onTomorrow: () => {} };
    const html = renderToStaticMarkup(createElement(ConfirmOrder, props));
    expect(html).toContain('Takes: 4 hours');
    expect(html).toContain('OK, do it');
    expect(html).not.toContain('Do it tomorrow');
    const late = renderToStaticMarkup(createElement(ConfirmOrder, { ...props, s: withHours(s, DAY_HOURS - 1) }));
    expect(late).toContain('Not enough time today');
    expect(late).toContain('Do it tomorrow');
    // The OK button is still there, disabled, with the reason.
    expect(late).toMatch(/disabled=""[^>]*data-testid="confirm-yes"|data-testid="confirm-yes"[^>]*disabled=""/);
    expect(timeLine({ hours: 2, to: 21, late: 0, missedDinner: false })).toBe('Your day: 2 hours spent giving it — now 9 PM.');
    expect(timeLine({ hours: 1, to: 9, late: 0, missedDinner: false })).toBe('Your day: 1 hour spent giving it — now 9 AM.');
    expect(timeLine({ hours: 3, to: 0, late: 0, missedDinner: false, bookedDay: 1 })).toMatch(/^Booked for Tuesday/);
  });
});
