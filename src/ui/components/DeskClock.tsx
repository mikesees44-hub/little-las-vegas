import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { DAY_NAMES, dayDate, today, weekPlan } from '../../engine/days';
import { roundOptions } from '../../engine/rounds';
import { absDay, DAY_HOURS, DAY_START, hoursLabel, hoursLeft, hoursUsed } from '../../engine/timeCost';
import type { GameDate, GameState } from '../../engine/types';
import { faceAt, FlipClock, MONTH_LONG, MONTH_SHORT } from './FlipClock';

/**
 * The clock and the calendar on the boss's desk: a walnut stand with brass
 * trim holding a flip clock and a tear-off day calendar (the kind a bank gave
 * away at Christmas). When a day passes the old page tears off and falls.
 * Drawn in CSS only (no images); every size is in em, so the caller sets the
 * scale with one font-size. A tap opens the week's schedule.
 */

export interface DaySlot {
  day: number;
  /** "Tue Jun 14". */
  label: string;
  when: 'past' | 'today' | 'ahead';
  /** Hours spent (today) or already promised (a day ahead). */
  hours: number;
  /** The evening on the plan (a round's label), if any. */
  evening?: string;
}

/** The week on the calendar: each day, its hours used or booked, and its evening. Pure. */
export function weekSchedule(s: GameState): DaySlot[] {
  const now = today(s);
  const base = s.week * 7;
  const booked = s.hours?.booked ?? {};
  const plan = weekPlan(s);
  const labels = new Map<string, string>();
  if (plan.some(Boolean)) for (const r of roundOptions(s)) labels.set(r.id, r.label);
  return DAY_NAMES.map((_, day) => {
    const d = dayDate(s, day);
    const when = day < now ? 'past' : day === now ? 'today' : 'ahead';
    const hours = when === 'today' ? hoursUsed(s) : when === 'ahead' ? Math.min(DAY_HOURS, booked[base + day] ?? 0) : 0;
    const id = plan[day];
    const evening = id ? labels.get(id) ?? (id === 'fam:sunday' ? 'Sunday dinner' : undefined) : undefined;
    return { day, label: `${DAY_NAMES[day].slice(0, 3)} ${MONTH_SHORT[d.m - 1]} ${d.d}`, when, hours, ...(evening ? { evening } : {}) };
  });
}

/** Hours already promised to tomorrow ("Do it tomorrow" orders). */
export function bookedTomorrow(s: GameState): number {
  return Math.min(DAY_HOURS, s.hours?.booked?.[absDay(s) + 1] ?? 0);
}

/** The week's schedule (the calendar's back page). */
export function WeekSchedule({ s }: { s: GameState }) {
  const rows = weekSchedule(s);
  const first = dayDate(s, 0);
  const last = dayDate(s, 6);
  const tomorrow = bookedTomorrow(s);
  return (
    <div className="space-y-1.5" data-testid="week-schedule">
      <div>
        <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">The calendar · week {s.week}</div>
        <div className="font-semibold text-gold-300">{MONTH_SHORT[first.m - 1]} {first.d} – {MONTH_SHORT[last.m - 1]} {last.d}, {last.y}</div>
      </div>
      <ul className="space-y-0.5 text-[12px]">
        {rows.map((r) => (
          <li key={r.day} className={`flex items-baseline justify-between gap-2 rounded px-1.5 py-0.5 ${r.when === 'today' ? 'border border-gold-600/60 bg-gold-500/10' : r.when === 'past' ? 'opacity-50' : ''}`} data-testid={`week-day-${r.day}`}>
            <span className={`w-20 shrink-0 ${r.when === 'past' ? 'line-through text-stone-500' : 'text-stone-200'}`}>{r.label}</span>
            <span className="min-w-0 flex-1 truncate text-stone-400">{r.evening ?? ''}</span>
            <span className="shrink-0 tabular-nums text-[11px] text-sky-300">
              {r.when === 'past' ? 'done' : r.when === 'today' ? `${hoursLabel(r.hours)} used · ${hoursLabel(hoursLeft(s))} left` : r.hours ? `${hoursLabel(r.hours)} booked` : 'open'}
            </span>
          </li>
        ))}
      </ul>
      <div className="text-[11px] text-stone-400" data-testid="week-tomorrow">{tomorrow ? `Booked for tomorrow: ${hoursLabel(tomorrow)} of orders.` : 'Nothing booked for tomorrow yet.'}</div>
    </div>
  );
}

interface Page { key: string; date: GameDate; dow: number }

/** The tear-off pad: month band, the big day, the weekday and the year. */
function CalendarPage({ date, dow, className = '', onAnimationEnd }: { date: GameDate; dow: number; className?: string; onAnimationEnd?: () => void }) {
  return (
    <span className={`llv-cal-page ${className}`} onAnimationEnd={onAnimationEnd} aria-hidden>
      <span className="llv-cal-month">{MONTH_LONG[date.m - 1]}</span>
      <span className="llv-cal-day">{date.d}</span>
      <span className="llv-cal-dow">{DAY_NAMES[dow]}</span>
      <span className="llv-cal-year">{date.y}</span>
    </span>
  );
}

export function TearOffCalendar({ s }: { s: GameState }) {
  const dow = today(s);
  const date = dayDate(s, dow);
  const key = `${date.y}-${date.m}-${date.d}`;
  const prev = useRef<Page>({ key, date, dow });
  const [torn, setTorn] = useState<Page[]>([]);
  useEffect(() => {
    if (prev.current.key !== key) {
      const old = prev.current;
      setTorn((t) => [...t.slice(-2), old]);
    }
    prev.current = { key, date, dow };
  }, [key]);
  return (
    <span className="llv-cal" data-testid="desk-calendar" data-date={key}>
      <span className="llv-cal-rings" aria-hidden />
      <CalendarPage date={date} dow={dow} />
      {torn.map((p) => <CalendarPage key={p.key} date={p.date} dow={p.dow} className="llv-cal-torn" onAnimationEnd={() => setTorn((t) => t.filter((x) => x.key !== p.key))} />)}
    </span>
  );
}

/**
 * The desk object. `onOpen`: what a tap does (the week's schedule). Without it,
 * it toggles the schedule under itself.
 */
export function DeskClock({ s, onOpen, className = '', style }: { s: GameState; onOpen?: () => void; className?: string; style?: CSSProperties }) {
  const [open, setOpen] = useState(false);
  const dow = today(s);
  const f = faceAt(dayDate(s, dow), dow, DAY_START + hoursUsed(s));
  const label = `The desk clock and calendar: ${f.long}. Open the week's schedule`;
  return (
    <div className={`${onOpen ? '' : 'relative '}${className}`} style={style} data-testid="desk-clock">
      <button type="button" className="llv-deskclock" onClick={() => (onOpen ? onOpen() : setOpen((o) => !o))} aria-label={label} title={`${f.weekday} ${f.month} ${f.day}, ${f.year}: the week's schedule`} aria-expanded={onOpen ? undefined : open} data-testid="desk-clock-open">
        <TearOffCalendar s={s} />
        <span className="llv-deskclock-clock">
          <span className="llv-deskclock-window"><FlipClock s={s} variant="desk" testid="desk-flip-clock" /></span>
          <span className="llv-deskclock-plate">Wildwood · {f.year}</span>
        </span>
      </button>
      {!onOpen && open && <div className="absolute right-0 top-full z-20 mt-1.5 w-[min(20rem,90vw)] rounded-md border border-gold-600/60 bg-noir-900/[0.97] p-2 text-left text-[12px] shadow-xl shadow-black/70" data-testid="desk-clock-schedule"><WeekSchedule s={s} /></div>}
    </div>
  );
}
