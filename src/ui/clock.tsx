import { useEffect, useRef } from 'react';
import { alerts } from '../engine/alerts';
import type { GameState, WeeklyReport } from '../engine/types';
import { fmt$ } from './format';

/**
 * CK-style time: pause and three speeds. The clock advances one week per
 * tick and pauses itself whenever something needs the boss: a decision on
 * the table, a new warning in the alert rail, or any open window.
 */
export type Speed = 0 | 1 | 2 | 3;
export const SPEED_MS: Record<Exclude<Speed, 0>, number> = { 1: 2600, 2: 1300, 3: 550 };

/** New warnings since the last state (by title), worth stopping the clock for. */
export function newWarnings(prev: GameState, next: GameState): string[] {
  const before = new Set(alerts(prev).filter((a) => a.severity !== 'info').map((a) => a.title));
  return alerts(next).filter((a) => a.severity !== 'info' && !before.has(a.title)).map((a) => a.title);
}

/** Why the clock should not run right now (undefined = free to run). */
export function pauseReason(s: GameState, busy: boolean, unanswered = s.pendingEvents.length): string | undefined {
  if (s.gameOver) return 'The game is over';
  if (busy) return 'A window is open';
  if (unanswered) return 'A decision is waiting';
  return undefined;
}

export function useClock(opts: {
  speed: Speed;
  s: GameState;
  busy: boolean;
  unanswered: number;
  step: () => void;
  onPause: (why: string) => void;
}) {
  const ref = useRef(opts);
  ref.current = opts;
  useEffect(() => {
    if (opts.speed === 0) return;
    const why = pauseReason(opts.s, opts.busy, opts.unanswered);
    if (why) {
      ref.current.onPause(why);
      return;
    }
    const t = setTimeout(() => ref.current.step(), SPEED_MS[opts.speed]);
    return () => clearTimeout(t);
  }, [opts.speed, opts.s, opts.busy, opts.unanswered]);
}

export function ClockControls({ speed, setSpeed, note }: { speed: Speed; setSpeed: (s: Speed) => void; note?: string }) {
  const btn = (v: Speed, label: string, title: string) => (
    <button
      key={v}
      title={title}
      aria-pressed={speed === v}
      onClick={() => setSpeed(v)}
      className={`w-8 h-8 rounded border text-sm font-bold ${speed === v ? 'bg-gold-500 text-noir-950 border-gold-400' : 'bg-noir-800 text-stone-300 border-noir-600 hover:border-gold-500'}`}
    >
      {label}
    </button>
  );
  return (
    <div className="flex items-center gap-1" data-testid="clock">
      {btn(0, '❚❚', 'Pause (space)')}
      {btn(1, '▶', 'Play — slow')}
      {btn(2, '▶▶', 'Play — normal')}
      {btn(3, '▶▶▶', 'Play — fast')}
      {note && <span className="ml-1 text-[11px] text-amber-300">{note}</span>}
    </div>
  );
}

/** One-line summary of a week for the ticker while the clock runs. */
export function tickerLine(r: WeeklyReport): string {
  const d = r.end.money - r.start.money;
  return `Week ${r.week}: ${d >= 0 ? '+' : ''}${fmt$(d)} · respect ${r.end.respect}${r.log[0] ? ` · ${r.log[0]}` : ''}`;
}
