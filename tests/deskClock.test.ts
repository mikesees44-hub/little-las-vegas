import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { daysOf, tickDay } from '../src/engine/days';
import { newGame } from '../src/engine/newGame';
import { bookLater, spendTime } from '../src/engine/timeCost';
import type { GameState, PlayerAction } from '../src/engine/types';
import { clockFace, faceAt, FlipClock } from '../src/ui/components/FlipClock';
import { bookedTomorrow, DeskClock, weekSchedule } from '../src/ui/components/DeskClock';
import { BossDesk } from '../src/ui/desk/BossDesk';
import { OfficeContext, type OfficeApi } from '../src/ui/desk/officeApi';
import { BossOffice, DESK_CLOCK_RECT, OFFICE_CARD_RECT } from '../src/ui/office/BossOffice';
import { HOTSPOTS } from '../src/ui/office/hotspots';

const order: PlayerAction = { kind: 'order', key: 'x', via: 'boss' as never };
const sitDown: PlayerAction = { kind: 'talk', op: { t: 'ask', talk: 'meeting', target: 'x' } };

function at(s: GameState, used: number): GameState {
  return { ...s, hours: { abs: s.week * 7 + daysOf(s).day, used } };
}

describe('the flip clock face', () => {
  it('reads the day clock and the boss\'s hour: weekday, month, day, year, 12-hour time', () => {
    const s = newGame('flip1');
    expect(clockFace(s).compact).toBe("Mon May 30 '60 · 8:00 AM");
    const tue = at(tickDay(s), 13.25);
    const f = clockFace(tue);
    expect(f.compact).toBe("Tue May 31 '60 · 9:15 PM");
    expect(f.long).toBe('Tuesday, May 31, 1960 · 9:15 PM');
    expect([f.weekday, f.month, f.day, f.year, f.hour, f.minute, f.ampm]).toEqual(['Tue', 'May', 31, 1960, '9', '15', 'PM']);
    // Noon, midnight and 2 AM (the end of his day).
    expect(faceAt({ y: 1960, m: 6, d: 14 }, 1, 12).time).toBe('12:00 PM');
    expect(faceAt({ y: 1960, m: 6, d: 14 }, 1, 24).time).toBe('12:00 AM');
    expect(faceAt({ y: 1960, m: 6, d: 14 }, 1, 26).compact).toBe("Tue Jun 14 '60 · 2:00 AM");
  });

  it('renders as flip cards with the whole date and time for screen readers', () => {
    const s = at(tickDay(newGame('flip2')), 13.25);
    const html = renderToString(createElement(FlipClock, { s }));
    expect(html).toContain('aria-label="Tuesday, May 31, 1960 · 9:15 PM"');
    expect(html).toContain('data-time="9:15 PM"');
    expect(html).toContain('llv-flipcard');
    // First show: nothing flips.
    expect(html).not.toContain('llv-flip ');
    const desk = renderToString(createElement(FlipClock, { s, variant: 'desk' }));
    expect(desk).toContain('aria-label="9:15 PM"');
  });

  it('moves forward as orders spend hours', () => {
    const s = newGame('flip3');
    const a = spendTime(s, sitDown).state;
    expect(clockFace(a).time).not.toBe(clockFace(s).time);
    expect(clockFace(spendTime(a, order).state).time).toBe(clockFace(a, 8 + (a.hours!.used + 0.25)).time);
  });
});

describe('the desk clock and calendar', () => {
  it('the week on the calendar: past days done, today\'s hours, hours booked ahead', () => {
    let s = tickDay(newGame('cal1'));
    s = at(s, 3);
    s = bookLater(s, sitDown).state;
    const w = weekSchedule(s);
    expect(w).toHaveLength(7);
    expect(w[0].when).toBe('past');
    expect(w[1]).toMatchObject({ when: 'today', hours: 3, label: 'Tue May 31' });
    expect(w[2].when).toBe('ahead');
    expect(w[2].hours).toBeGreaterThan(0);
    expect(bookedTomorrow(s)).toBe(w[2].hours);
  });

  it('sits on the boss\'s desk view and in the office without covering an object or Monday\'s card', () => {
    const s = newGame('cal2');
    const desk = renderToString(createElement(BossDesk, { s, ui: {}, api: { onEvent: () => {}, onDay: () => {}, onSitDown: () => {}, onCancelOrder: () => {}, onMoney: () => {}, onChar: () => {} } }));
    expect(desk).toContain('data-testid="desk-clock"');
    expect(desk).toContain('data-testid="desk-calendar"');
    expect(desk).toContain('May');
    const api = Object.fromEntries(['openDesk', 'openEnvelope', 'openVisitors', 'openLedger', 'openCalendar', 'openDecisions', 'openMap', 'openFamily', 'openNews', 'openAdvance'].map((n) => [n, () => {}])) as unknown as OfficeApi;
    const office = renderToString(createElement(OfficeContext.Provider, { value: api },
      createElement(BossOffice, { s, ui: {}, monday: false, onMondayDone: () => {}, onInvite: () => {}, onDelegate: () => {}, onLater: () => {}, onClub: () => {}, initialPanel: 'week' })));
    expect(office).toContain('data-testid="desk-clock-open"');
    expect(office).toContain('data-testid="week-schedule"');
    const r = DESK_CLOCK_RECT;
    const hit = (o: { x: number; y: number; w: number; h: number }) => r.x < o.x + o.w && o.x < r.x + r.w && r.y < o.y + o.h && o.y < r.y + r.h;
    for (const h of HOTSPOTS) expect(hit(h.rect), h.id).toBe(false);
    expect(hit(OFFICE_CARD_RECT)).toBe(false);
    expect(r.x + r.w).toBeLessThanOrEqual(100);
    expect(r.y + r.h).toBeLessThanOrEqual(100);
  });

  it('the calendar page shows today', () => {
    const s = tickDay(tickDay(newGame('cal3')));
    const html = renderToString(createElement(DeskClock, { s }));
    expect(html).toContain('data-date="1960-6-1"');
    expect(html).toContain('Wednesday');
    expect(html).toContain('June');
  });
});

describe('the top bar clock', () => {
  it('shows the flip clock and keeps the hours left and end day', async () => {
    const { App } = await import('../src/ui/App');
    const html = renderToString(createElement(App, { startOn: 'game' }));
    const bar = html.slice(html.indexOf('data-testid="topbar"'));
    expect(bar).toContain('data-testid="topbar-date"');
    expect(bar).toContain('data-testid="topbar-clock"');
    const hour = bar.slice(bar.indexOf('data-testid="topbar-hour"'), bar.indexOf('data-testid="topbar-hour"') + 900);
    expect(hour).toMatch(/\) ?(<!-- -->)? left|hours?(<!-- -->)? left/);
    expect(hour).toContain('data-testid="end-day"');
    expect(bar).toMatch(/aria-label="\w+day, \w+ \d+, 19\d\d · \d+:\d\d [AP]M"/);
  });
});
