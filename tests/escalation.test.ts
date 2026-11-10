import '../src/engine/engine';
import { describe, expect, it } from 'vitest';
import { advanceWeek } from '../src/engine/engine';
import { newGame } from '../src/engine/newGame';
import { newGameWith } from '../src/engine/starts';
import { ensureAction } from '../src/engine/actionState';
import { aggressionCap, dryLimit, DRY_LIMIT_EARLY, DRY_LIMIT_LATE, escalation, escalationView, noteHard, quietWeeks, tooQuiet } from '../src/engine/escalation';
import { aggression, ensureThreats, threatsWeek } from '../src/engine/threats';
import { newCtx } from '../src/engine/ledger';
import type { GameState } from '../src/engine/types';

function at(s: GameState, week: number, quiet = 0): GameState {
  const x = structuredClone(s) as GameState;
  x.week = week;
  ensureAction(x).lastHard = week - quiet;
  return x;
}

describe('the street heats up', () => {
  it('builds with the years, the rank and a quiet stretch, and stays within 0 … 1', () => {
    const s = newGame('esc-1');
    const y1 = escalation(at(s, 10));
    const y2 = escalation(at(s, 60));
    const y4 = escalation(at(s, 170));
    expect(y2).toBeGreaterThan(y1);
    expect(y4).toBeGreaterThan(y2);
    expect(escalation(at(s, 60, 12))).toBeGreaterThan(y2);
    for (const w of [0, 30, 500, 5000]) {
      const e = escalation(at(s, w, 40));
      expect(e).toBeGreaterThanOrEqual(0);
      expect(e).toBeLessThanOrEqual(1);
    }
    expect(escalationView(at(s, 170)).parts.length).toBeGreaterThan(0);
  });
  it('a boss draws more fire than a man in the ranks', () => {
    const boss = at(newGameWith('esc-2', 'classic'), 60);
    const low = at(newGameWith('esc-2', 'associate'), 60);
    expect(escalation(boss)).toBeGreaterThan(escalation(low));
  });
  it('lifts the rivals\' ceiling and shortens the quiet allowed', () => {
    const s = newGame('esc-3');
    expect(aggressionCap(at(s, 10))).toBeLessThan(aggressionCap(at(s, 200)));
    expect(dryLimit(at(s, 10))).toBeLessThanOrEqual(DRY_LIMIT_EARLY);
    expect(dryLimit(at(s, 300, 10))).toBe(DRY_LIMIT_LATE);
    const r = s.rivals.find((x) => x.kind === 'mob')!;
    const late = at(s, 200);
    expect(aggression(late, r).reasons.some((x) => /heating up/.test(x.label))).toBe(true);
  });
  it('noteHard ends the quiet; an old save without the counter is not "too quiet"', () => {
    const s = at(newGame('esc-4'), 40, 20);
    expect(tooQuiet(s)).toBe(true);
    noteHard(s);
    expect(quietWeeks(s)).toBe(0);
    const old = structuredClone(s) as GameState;
    delete old.action;
    expect(tooQuiet(old)).toBe(false);
  });
  it('a long quiet stretch brings a move: somebody who hates him plans one for next week', () => {
    let s = newGame('esc-5');
    for (let i = 0; i < 12; i++) s = advanceWeek(s, {}).state;
    // Clear the board and make it a long silence.
    const T = ensureThreats(s);
    T.threats = [];
    ensureAction(s).lastHard = s.week - 20;
    const before = T.stats.planned;
    // The threats' turn on its own (a rival's own strike earlier in the week would end the quiet first).
    threatsWeek(newCtx(s));
    const after = s.threats!;
    expect(after.stats.planned).toBeGreaterThan(before);
    const t = after.threats.find((x) => x.by !== 'police' && x.by !== 'fbi');
    expect(t).toBeTruthy();
    expect(t!.due).toBe(s.week + 1);
  });
});
