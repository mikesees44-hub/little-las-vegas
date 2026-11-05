import { isInSeason } from './calendar';
import { difficultyOf } from './difficulty';
import { advanceWeek } from './engine';
import { crisisAt, type TurnStop } from './turnCrisis';
import type { GameState, PlayerChoices, WeeklyReport } from './types';

/**
 * A TURN (STREAMLINE_2 §5): one, two or four weeks played as one, that stops early for a crisis.
 *
 * It chains advanceWeek exactly like advanceSpan: only the first week uses the boss's own choices;
 * each later week takes `later(state)` (the UI passes his standing orders and delegation, so what he
 * left is settled the way his people would settle it; the default is every event's default). After
 * each week, before the next, `stop(prev, next)` (crisisAt with his Settings) may end the span: the
 * result says why, and how many weeks ran. The chair changing hands or the game ending always stops it.
 *
 * Pure. `turnSteps` yields after every week so the UI can paint between weeks; `advanceTurn` runs it
 * to the end. Both give the same states (the same seed, the same choices).
 */

export type TurnSpan = 1 | 2 | 4;
export const TURN_SPANS: TurnSpan[] = [1, 2, 4];

export interface TurnOpts {
  /** Between weeks: a reason to stop the span (undefined: go on). Default: crisisAt with every switch on. */
  stop?: (prev: GameState, next: GameState) => TurnStop | undefined;
  /** Choices for weeks 2+ (default: none, every event's default). */
  later?: (s: GameState) => PlayerChoices;
}

export interface TurnStep {
  state: GameState;
  report: WeeklyReport;
  log: string[];
  /** Weeks done so far (1-based) and the span asked for. */
  done: number;
  of: number;
  /** Set on the last step when the span ended early. */
  stop?: TurnStop;
}

export interface TurnResult {
  start: GameState;
  state: GameState;
  reports: WeeklyReport[];
  log: string[];
  weeks: number;
  of: number;
  stop?: TurnStop;
}

/** The weeks of a turn, one at a time (the UI awaits a frame between them). */
export function* turnSteps(input: GameState, weeks: number, choices: PlayerChoices = {}, opts: TurnOpts = {}): Generator<TurnStep, void, void> {
  const of = Math.max(1, Math.floor(weeks));
  const stop = opts.stop ?? ((a: GameState, b: GameState) => crisisAt(a, b));
  let s = input;
  for (let i = 0; i < of; i++) {
    const r = advanceWeek(s, i === 0 ? choices : opts.later ? opts.later(s) : {});
    const prev = s;
    s = r.state;
    const last = i === of - 1;
    // The chair and the end of the game stop it whatever the switches say.
    let why: TurnStop | undefined = s.gameOver ? { cat: 'chair', text: 'The game is over' } : s.playerId !== prev.playerId ? { cat: 'chair', text: 'The chair has changed hands' } : undefined;
    if (!why && !last) why = stop(prev, s);
    yield { state: s, report: r.report, log: r.log, done: i + 1, of, ...(why ? { stop: why } : {}) };
    if (why) return;
  }
}

/** A whole turn at once (tests, and anything without a screen to paint). */
export function advanceTurn(input: GameState, weeks: number, choices: PlayerChoices = {}, opts: TurnOpts = {}): TurnResult {
  const reports: WeeklyReport[] = [];
  const log: string[] = [];
  let state = input;
  let stop: TurnStop | undefined;
  let done = 0;
  let of = Math.max(1, Math.floor(weeks));
  for (const x of turnSteps(input, weeks, choices, opts)) {
    state = x.state;
    reports.push(x.report);
    log.push(...x.log);
    done = x.done;
    of = x.of;
    if (x.stop) stop = x.stop;
  }
  return { start: input, state, reports, log, weeks: done, of, ...(stop ? { stop } : {}) };
}

/**
 * The span a turn defaults to (§5.2): Story and Don two weeks, Grand Strategy one; in the summer
 * season, when money and trouble move fast, Don drops to one; after Labor Day Story and Don rise to
 * a month. (The picker remembers the boss's own choice per save; this is only the default.)
 */
export function defaultSpan(s: GameState): TurnSpan {
  const d = difficultyOf(s);
  if (d === 'grand') return 1;
  const summer = isInSeason(s.date);
  if (!summer && s.date.m >= 9) return 4;
  if (summer && d === 'don') return 1;
  return 2;
}

/** "Stopped after 1 of 4 weeks: …" (the span report's first line). */
export function turnLine(r: Pick<TurnResult, 'weeks' | 'of' | 'stop'>): string {
  if (r.stop && r.weeks < r.of) return `Stopped after ${r.weeks} of ${r.of} weeks: ${r.stop.text}.`;
  if (r.stop) return `${r.stop.text}.`;
  return r.of === 1 ? 'The week turned.' : `${r.of} weeks went by.`;
}
