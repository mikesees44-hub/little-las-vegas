import { useEffect, useRef, useState } from 'react';
import { dayDate, DAY_SHORT, today } from '../../engine/days';
import { clockHour } from '../../engine/timeCost';
import type { GameDate, GameState } from '../../engine/types';

/**
 * A 1960 desk flip clock. No LED digits in 1960: the numbers are printed on
 * cards that flip over on a little drum, a Copal-style clock. Each card flips
 * (a ~250 ms CSS 3D turn, off under prefers-reduced-motion) when its value
 * changes, and when an order eats hours the hour cards roll forward one by one
 * (6:00 → 7:00 → 8:00 → 9:00) instead of jumping.
 *
 * Source of truth: the day clock (days.ts: the week's Monday `s.date` plus
 * the day reached) and the boss's hours (timeCost.ts: `clockHour`).
 */

export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export interface ClockFace {
  /** "Tue". */
  weekday: string;
  /** "Jun". */
  month: string;
  /** 14. */
  day: number;
  /** 1960. */
  year: number;
  /** "'60". */
  yy: string;
  /** "9". */
  hour: string;
  /** "15". */
  minute: string;
  ampm: 'AM' | 'PM';
  /** "9:15 PM". */
  time: string;
  /** "Tue Jun 14 '60". */
  date: string;
  /** "Tue Jun 14 '60 · 9:15 PM". */
  compact: string;
  /** "Tuesday, June 14, 1960 · 9:15 PM" (for screen readers). */
  long: string;
}

const DAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** The face for a date, its day of the week (0 Monday) and an hour of the boss's day (8 … 26). */
export function faceAt(date: GameDate, dow: number, hourOfDay: number): ClockFace {
  const total = Math.round(hourOfDay * 60);
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  const ampm = hh < 12 ? 'AM' : 'PM';
  const hour = String(hh % 12 === 0 ? 12 : hh % 12);
  const minute = String(mm).padStart(2, '0');
  const weekday = DAY_SHORT[dow];
  const month = MONTH_SHORT[date.m - 1];
  const yy = `'${String(date.y).slice(-2)}`;
  const time = `${hour}:${minute} ${ampm}`;
  const dateStr = `${weekday} ${month} ${date.d} ${yy}`;
  return {
    weekday, month, day: date.d, year: date.y, yy, hour, minute, ampm, time,
    date: dateStr,
    compact: `${dateStr} · ${time}`,
    long: `${DAY_LONG[dow]}, ${MONTH_LONG[date.m - 1]} ${date.d}, ${date.y} · ${time}`,
  };
}

/** The clock's face now: today on the day clock, at the boss's hour. */
export function clockFace(s: GameState, hourOfDay = clockHour(s)): ClockFace {
  const dow = today(s);
  return faceAt(dayDate(s, dow), dow, hourOfDay);
}

function reducedMotion(): boolean {
  try { return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

/** Milliseconds per hour card when the clock rolls forward. */
export const ROLL_MS = 140;

/**
 * The hour shown, rolling forward to the real one an hour at a time when time
 * passes within the same day. A new day, time given back (undo) or reduced
 * motion: it just sets.
 */
export function useRollingHour(target: number, dayKey: string): number {
  const [shown, setShown] = useState(target);
  const cur = useRef(target);
  const key = useRef(dayKey);
  useEffect(() => {
    const sameDay = key.current === dayKey;
    key.current = dayKey;
    if (!sameDay || target <= cur.current || target - cur.current > 24 || reducedMotion()) {
      cur.current = target;
      setShown(target);
      return;
    }
    const id = window.setInterval(() => {
      const next = Math.min(target, Math.floor(cur.current + 1e-9) + 1);
      cur.current = next;
      setShown(next);
      if (next >= target) window.clearInterval(id);
    }, ROLL_MS);
    return () => window.clearInterval(id);
  }, [target, dayKey]);
  return shown;
}

/** One card on the drum. It flips when its value changes (not on first show). */
export function FlipCard({ v, className = '', testid }: { v: string; className?: string; testid?: string }) {
  const last = useRef(v);
  const moved = useRef(false);
  if (last.current !== v) { moved.current = true; last.current = v; }
  return (
    <span className={`llv-flipcard ${className}`} data-testid={testid} aria-hidden>
      <span key={v} className={moved.current ? 'llv-flip' : 'llv-flip-still'}>{v}</span>
    </span>
  );
}

/** A number as one card per digit (so only the digit that changes flips). */
function Digits({ v, className, pad }: { v: string; className: string; pad?: number }) {
  const str = pad ? v.padStart(pad, ' ') : v;
  return <>{[...str].map((ch, i) => <FlipCard key={i} v={ch === ' ' ? ' ' : ch} className={className} />)}</>;
}

/**
 * The flip clock. `compact`: one line for the top bar ("Tue Jun 14 '60 · 9:15 PM").
 * `desk`: the time only, big cards, for the clock on the boss's desk.
 */
export function FlipClock({ s, variant = 'compact', testid = 'flip-clock' }: { s: GameState; variant?: 'compact' | 'desk'; testid?: string }) {
  const real = clockHour(s);
  const dow = today(s);
  const date = dayDate(s, dow);
  const shown = useRollingHour(real, `${date.y}-${date.m}-${date.d}`);
  const f = faceAt(date, dow, shown);
  const truth = faceAt(date, dow, real);
  if (variant === 'desk') {
    const c = 'llv-flipcard-desk';
    return (
      <span className="inline-flex items-center gap-[0.12em]" role="img" aria-label={truth.time} data-testid={testid} data-time={truth.time}>
        <Digits v={f.hour} className={c} pad={2} />
        <span className="llv-flip-colon" aria-hidden>:</span>
        <Digits v={f.minute} className={c} />
        <FlipCard v={f.ampm} className={`${c} llv-flipcard-ampm`} />
      </span>
    );
  }
  const c = 'llv-flipcard-sm';
  return (
    <span className="inline-flex items-center gap-[2px] align-middle" role="img" aria-label={truth.long} title={truth.long} data-testid={testid} data-date={truth.date} data-time={truth.time}>
      <FlipCard v={f.weekday} className={c} />
      <FlipCard v={f.month} className={c} />
      <Digits v={String(f.day)} className={c} />
      <FlipCard v={f.yy} className={c} />
      <span className="mx-[1px] text-stone-500" aria-hidden>·</span>
      <Digits v={f.hour} className={c} />
      <span className="llv-flip-colon" aria-hidden>:</span>
      <Digits v={f.minute} className={c} />
      <FlipCard v={f.ampm} className={c} />
    </span>
  );
}
