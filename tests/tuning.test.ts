import { describe, expect, it } from 'vitest';
import { advanceWeek } from '../src/engine/engine';
import { reconcile } from '../src/engine/ledger';
import { newGame } from '../src/engine/newGame';
import { newGameWith } from '../src/engine/starts';
import { slowPayers } from '../src/engine/economy';
import { bagmanDue } from '../src/engine/events';
import { currentRiseGoal, RISE_GOALS } from '../src/engine/riseGoals';
import { alerts } from '../src/engine/alerts';
import { addOpinion } from '../src/engine/relations';
import { capos } from '../src/engine/characters';
import type { GameState } from '../src/engine/types';

function play(s: GameState, weeks: number, check?: (r: ReturnType<typeof advanceWeek>) => void) {
  for (let i = 0; i < weeks && !s.gameOver; i++) {
    const choices: Record<string, string> = {};
    for (const e of s.pendingEvents) choices[e.iid] = e.defaultChoiceId;
    const r = advanceWeek(s, { choices });
    expect(reconcile(r.report)).toEqual([]);
    check?.(r);
    s = r.state;
  }
  return s;
}

describe('the first off-season', () => {
  it('a slow-paying capo holds part of the winter envelope back and makes good in the season', () => {
    let s = newGame('slow');
    const k = capos(s)[0];
    addOpinion(s, k.id, s.playerId, 'Test: does not think much of you', -60, 0);
    expect(slowPayers(s).map((c) => c.id)).toContain(k.id);
    expect(slowPayers(s).length).toBeLessThanOrEqual(2);
    s = play(s, 30); // into the winter
    expect(s.characters[k.id].arrears ?? 0).toBeGreaterThan(0);
    let repaid = 0;
    s = play(s, 40, (r) => { repaid += r.report.lines.filter((l) => l.label.startsWith('Late kick-up')).reduce((a, l) => a + l.amount, 0); });
    if (s.characters[k.id].alive && s.characters[k.id].faction === 'player') expect(repaid).toBeGreaterThan(0);
  });

  it('the first winter has its own named line; the second does not', () => {
    let s = newGame('winter1');
    let first = 0;
    s = play(s, 56, (r) => { first += r.report.lines.filter((l) => l.label.startsWith('The first winter')).length; });
    expect(first).toBeGreaterThan(20);
    let second = 0;
    play(s, 48, (r) => { second += r.report.lines.filter((l) => l.label.startsWith('The first winter')).length; });
    expect(second).toBe(0);
  });
});

describe('Rise to Power', () => {
  it('the men earn steadily through their capos, in and out of season', () => {
    let s = newGameWith('risework', 'rise');
    const weeks: number[] = [];
    // Crew work now comes up through the capos in the underboss's envelope (tribute.ts): read it from the week's report.
    s = play(s, 40, (r) => { const rep = r.state.tribute!.reports.find((x) => x.week === r.report.week); weeks.push((rep?.sources ?? []).filter((x) => x.label.startsWith('Crew work')).reduce((a, x) => a + x.amount, 0)); });
    expect(weeks.slice(0, 10).every((x) => x > 0)).toBe(true);
    expect(weeks.slice(20, 40).filter((x) => x > 0).length).toBeGreaterThan(15); // the winter too
    // The classic house has no crew-work line.
    const c = newGame('risework');
    const r = advanceWeek(c, {});
    expect(r.report.lines.some((l) => l.label.startsWith('Crew work'))).toBe(false);
  });

  it('Philadelphia sends no bagman until it notices the kid', () => {
    const s = newGameWith('risebag', 'rise');
    s.week = 10;
    expect(bagmanDue(s)).toBe(false);
    s.respect = 45;
    expect(bagmanDue(s)).toBe(true);
  });

  it('there is always a clear next goal, shown as an alert, and goals pay once', () => {
    let s = newGameWith('risegoal', 'rise');
    const g = currentRiseGoal(s)!;
    expect(g.id).toBe(RISE_GOALS[0].id);
    expect(alerts(s).some((a) => a.kind === 'goal' && a.title.includes(g.title))).toBe(true);
    s.money = 20000;
    let paid = 0;
    s = play(s, 3, (r) => { paid += r.report.lines.filter((l) => l.label === 'Goal: a good first summer').length; });
    expect(paid).toBe(1);
    expect(currentRiseGoal(s)?.id).not.toBe(g.id);
    expect(currentRiseGoal(newGame('x'))).toBeUndefined();
  });
});
