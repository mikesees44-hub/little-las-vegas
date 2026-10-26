import { useEffect, useRef } from 'react';
import { alerts } from '../engine/alerts';
import { urgentOn } from '../engine/checkins';
import { daysOf } from '../engine/days';
import type { GameState, WeeklyReport } from '../engine/types';
import { fmt$ } from './format';

/**
 * CK-style time: pause and three speeds. The clock moves one DAY per tick
 * (Monday … Sunday); after Sunday the week turns through the same
 * `run('week')` path the Advance Week button uses. It pauses itself whenever
 * something needs the boss: a decision on the table, an open window, an
 * urgent problem at the morning meeting, and (by the settings' autopause
 * list) hits, arrests, births and deaths when the week turns. The tab going
 * hidden pauses it too (battery).
 */
export type Speed = 0 | 1 | 2 | 3;
/** Milliseconds per day. */
export const SPEED_MS: Record<Exclude<Speed, 0>, number> = { 1: 2600, 2: 1300, 3: 500 };
export const SPEED_NAME: Record<Speed, string> = { 0: 'Paused', 1: 'Slow', 2: 'Normal', 3: 'Fast' };

/** New warnings since the last state (by title), worth stopping the clock for. */
export function newWarnings(prev: GameState, next: GameState): string[] {
  const before = new Set(alerts(prev).filter((a) => a.severity !== 'info').map((a) => a.title));
  return alerts(next).filter((a) => a.severity !== 'info' && !before.has(a.title)).map((a) => a.title);
}

export type HeadlineKind = 'hit' | 'arrest' | 'birth' | 'death';
export interface Headline { kind: HeadlineKind; text: string }

/**
 * What happened when the week turned that a boss would want to stop for:
 * a killing, one of his arrested, a child born into the house, a death.
 * Pure (prev and next states).
 */
export function weekHeadlines(prev: GameState, next: GameState): Headline[] {
  const out: Headline[] = [];
  const P = prev.characters;
  for (const c of Object.values(next.characters)) {
    const was = P[c.id];
    if (was?.alive && !c.alive && (c.faction === 'player' || c.dynasty)) {
      const killed = !!c.death && (c.death.killer !== undefined || /shot|killed|murder|hit|whack|stab|bomb/i.test(c.death.cause ?? ''));
      out.push({ kind: killed ? 'hit' : 'death', text: killed ? `${c.firstName} ${c.lastName} was killed` : `${c.firstName} ${c.lastName} has died` });
    }
    if (was && c.alive && c.faction === 'player' && c.imprisonedUntil !== undefined && c.imprisonedUntil > next.week && !(was.imprisonedUntil !== undefined && was.imprisonedUntil > prev.week)) {
      out.push({ kind: 'arrest', text: `${c.firstName} ${c.lastName} was arrested` });
    }
    if (!was && c.alive && c.dynasty) out.push({ kind: 'birth', text: `${c.firstName} ${c.lastName} was born` });
  }
  return out;
}

/** Why the clock should not run right now (undefined = free to run). */
export function pauseReason(s: GameState, busy: boolean, unanswered = s.pendingEvents.length): string | undefined {
  if (s.gameOver) return 'The game is over';
  if (busy) return 'A window is open';
  if (unanswered) return 'A decision is waiting';
  return undefined;
}

/** An urgent problem at this morning's meeting, unanswered: the clock stops for it. */
export function morningStop(s: GameState): string | undefined {
  const d = daysOf(s);
  if (d.skipped.includes(d.day)) return undefined;
  const u = urgentOn(s, d.day, d.answers);
  return u ? `${u.name} has an urgent problem` : undefined;
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
  // Battery: a hidden tab never runs the clock.
  useEffect(() => {
    const onVis = () => { if (document.hidden && ref.current.speed > 0) ref.current.onPause('You stepped away'); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
}

export function ClockControls({ speed, setSpeed, note }: { speed: Speed; setSpeed: (s: Speed) => void; note?: string }) {
  const btn = (v: Exclude<Speed, 0>, label: string) => (
    <button
      key={v}
      type="button"
      title={`Play: ${SPEED_NAME[v].toLowerCase()}`}
      aria-label={`Play ${SPEED_NAME[v].toLowerCase()}`}
      aria-pressed={speed === v}
      onClick={() => setSpeed(v)}
      data-testid={`clock-speed-${v}`}
      className={`h-9 sm:h-8 min-w-[2.25rem] sm:min-w-[2rem] rounded border px-1 text-[11px] font-bold tracking-tighter ${speed === v ? 'bg-gold-500 text-noir-950 border-gold-400' : 'bg-noir-800 text-stone-300 border-noir-600 hover:border-gold-500'}`}
    >
      {label}
    </button>
  );
  const paused = speed === 0;
  return (
    <div className="flex items-center gap-1" data-testid="clock">
      <button
        type="button"
        onClick={() => setSpeed(paused ? 2 : 0)}
        title={paused ? 'Play (space)' : 'Pause (space)'}
        aria-label={paused ? 'Play' : 'Pause'}
        data-testid="clock-pause"
        data-paused={paused}
        className={`h-9 sm:h-8 min-w-[3rem] sm:min-w-[2.5rem] rounded border px-2 text-sm font-bold ${paused ? 'bg-gold-500 text-noir-950 border-gold-400' : 'bg-noir-800 text-gold-300 border-gold-600'}`}
      >
        {paused ? '▶' : '❚❚'}
      </button>
      {btn(1, '▸')}
      {btn(2, '▸▸')}
      {btn(3, '▸▸▸')}
      {note && <span className="ml-1 text-[11px] text-amber-300">{note}</span>}
    </div>
  );
}

/** One-line summary of a week for the ticker while the clock runs. */
export function tickerLine(r: WeeklyReport): string {
  const d = r.end.money - r.start.money;
  return `Week ${r.week}: ${d >= 0 ? '+' : ''}${fmt$(d)} · respect ${r.end.respect}${r.log[0] ? ` · ${r.log[0]}` : ''}`;
}
