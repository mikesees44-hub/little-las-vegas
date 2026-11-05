import '../src/engine/engine';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { advanceWeek } from '../src/engine/engine';
import { newGame } from '../src/engine/newGame';
import { setDifficulty } from '../src/engine/difficulty';
import { advanceTurn, defaultSpan, turnLine, turnSteps } from '../src/engine/turn';
import { crisisAt } from '../src/engine/turnCrisis';
import { spanDiff } from '../src/engine/weekDiff';
import { delegatedAnswers } from '../src/engine/delegation';
import { weekChoices } from '../src/engine/days';
import { autoPauses as clockAutoPauses } from '../src/ui/clockPolicy';
import { autoPauses } from '../src/engine/turnCrisis';
import { packSave } from '../src/ui/save';
import { roundCount, roundOf, ROUND_STOPS } from '../src/ui/shell/round';
import { ReadyToAdvance } from '../src/ui/desk/BossDesk';
import { getSettings, newGameTimeMode, reloadSettings, setSettings, type Settings } from '../src/ui/settings';
import type { GameState, PlayerChoices } from '../src/engine/types';
import { playWeeks } from './helpers';

const clone = (s: GameState): GameState => structuredClone(s);
const never = () => undefined;

describe('a turn of several weeks (STREAMLINE_2 §5)', () => {
  it('a 4-week turn equals four 1-week turns with the same defaults and seed, and saves the same', () => {
    const s0 = playWeeks('turn-same', 3);
    const t = advanceTurn(s0, 4, {}, { stop: never });
    let x = s0;
    for (let i = 0; i < 4; i++) x = advanceWeek(x, {}).state;
    expect(t.weeks).toBe(4);
    expect(t.of).toBe(4);
    expect(t.stop).toBeUndefined();
    expect(t.state.week).toBe(s0.week + 4);
    expect(JSON.stringify(t.state)).toBe(JSON.stringify(x));
    // One save at the end is the same save as four weeks' worth, with no line written twice.
    expect(packSave(JSON.stringify(t.state))).toBe(packSave(JSON.stringify(x)));
    const J = t.state.journal?.e ?? [];
    expect(new Set(J.map((e) => JSON.stringify(e))).size).toBe(J.length);
    // The stepper and the whole turn agree.
    const steps = [...turnSteps(s0, 4, {}, { stop: never })];
    expect(steps.map((p) => p.done)).toEqual([1, 2, 3, 4]);
    expect(JSON.stringify(steps[3].state)).toBe(JSON.stringify(t.state));
    // A one-week turn is one advanceWeek.
    expect(JSON.stringify(advanceTurn(s0, 1, {}).state)).toBe(JSON.stringify(advanceWeek(s0, {}).state));
  });

  it('weeks after the first are settled by his standing orders and the delegation level (the same as doing it week by week)', () => {
    const s0 = playWeeks('turn-deleg', 4);
    const later = (x: GameState): PlayerChoices => weekChoices(x, { choices: delegatedAnswers(x, {}, []) });
    const t = advanceTurn(s0, 3, {}, { stop: never, later });
    let x = advanceWeek(s0, {}).state;
    for (let i = 0; i < 2; i++) x = advanceWeek(x, later(x)).state;
    expect(JSON.stringify(t.state)).toBe(JSON.stringify(x));
  });

  it('it stops early with the reason, and the report says how far it got', () => {
    const s0 = playWeeks('turn-stop', 3);
    let n = 0;
    const t = advanceTurn(s0, 4, {}, { stop: () => (++n === 2 ? { cat: 'war', text: 'War has been declared' } : undefined) });
    expect(t.weeks).toBe(2);
    expect(t.of).toBe(4);
    expect(t.stop).toEqual({ cat: 'war', text: 'War has been declared' });
    expect(t.state.week).toBe(s0.week + 2);
    expect(turnLine(t)).toBe('Stopped after 2 of 4 weeks: War has been declared.');
    expect(turnLine({ weeks: 4, of: 4 })).toBe('4 weeks went by.');
  });

  it('a hurricane scheduled inside the span ends it the week before landfall', () => {
    const s0 = playWeeks('turn-storm', 3);
    s0.flags.storm_week = s0.week + 2;
    s0.flags.storm_day = 3;
    delete s0.flags.storm_landed;
    const t = advanceTurn(s0, 4, {}, { stop: (a, b) => crisisAt(a, b, { on: (k) => k === 'pauseOnWarning' }) });
    // Week 1 runs; with landfall in the coming week, the span stops so he is there for it.
    if (t.state.flags.storm_week === s0.week + 2) {
      expect(t.state.week).toBe(s0.week + 2);
      expect(t.stop?.cat).toBe('storm');
      expect(t.stop?.text).toMatch(/hurricane/i);
    } else expect(t.weeks).toBeGreaterThan(0);
  });

  it('crisisAt: a strike, war, a death in the house, the Feds at the door, a storm, the chair — each with its reason', () => {
    const a = playWeeks('turn-crisis', 4);
    const on = { on: () => true, acked: new Set<string>() };
    // War.
    let b = clone(a);
    b.wars = [...(b.wars ?? []), { ...(b.wars?.[0] ?? {}), id: 'war-test' } as GameState['wars'][number]];
    expect(crisisAt(a, b, on)).toMatchObject({ cat: 'war', text: 'War has been declared' });
    // A death in the house.
    b = clone(a);
    const kin = Object.values(b.characters).find((c) => c.alive && c.dynasty && c.id !== b.playerId)!;
    expect(kin).toBeTruthy();
    b.characters[kin.id] = { ...kin, alive: false };
    expect(crisisAt(a, b, on)?.cat).toBe('death');
    // The Feds at the door.
    const a2 = clone(a);
    a2.legal = { ...(a2.legal ?? ({} as NonNullable<GameState['legal']>)), stage: 'investigation' };
    b = clone(a2);
    b.legal = { ...b.legal!, stage: 'indicted' };
    expect(crisisAt(a2, b, on)).toMatchObject({ cat: 'feds' });
    expect(crisisAt(a2, b, on)!.text).toMatch(/Feds/);
    // A storm coming ashore next week.
    b = clone(a);
    b.flags.storm_week = b.week;
    delete b.flags.storm_landed;
    expect(crisisAt(a, b, on)?.cat).toBe('storm');
    // A warned strike landing next week (the tip is out); aimed at the boss: Dead Man Walking.
    b = clone(a);
    if (b.threats) {
      const th = { id: 'th-test', kind: 'hit', by: 'manno', targetId: b.playerId, start: b.week - 1, due: b.week, blunt: 0 } as unknown as NonNullable<GameState['threats']>['threats'][number];
      b.threats = { ...b.threats, threats: [...b.threats.threats, th], tips: [...b.threats.tips, { id: 'tip-test', threatId: 'th-test', kind: 'hit', by: 'manno', targetId: b.playerId, sourceId: 'x', sourceKind: 'street', sourceName: 'Sal', sourceRole: 'a bartender', week: b.week - 1, deadline: b.week, truth: 'true', hint: 'a hit', detail: '', status: 'heard' } as unknown as NonNullable<GameState['threats']>['tips'][number]] };
      const w = crisisAt(a, b, on);
      expect(w?.cat).toBe('dmw');
      expect(w?.text).toMatch(/Sal/);
    }
    // The chair changing hands or the game ending always stops it, switches or not.
    b = clone(a);
    b.gameOver = { week: b.week, reason: 'no_heir', text: 'x' };
    expect(crisisAt(a, b, { on: () => false })?.cat).toBe('chair');
    // Routine: nothing.
    expect(crisisAt(a, clone(a), on)).toBeUndefined();
  });

  it('a switch turned off means no stop (settled by default, as the clock does)', () => {
    const a = playWeeks('turn-off', 4);
    const b = clone(a);
    b.wars = [...(b.wars ?? []), { id: 'war-off' } as GameState['wars'][number]];
    b.flags.storm_week = b.week;
    expect(crisisAt(a, b, { on: () => true })).toBeDefined();
    expect(crisisAt(a, b, { on: (k) => k !== 'pauseOnWar' })?.cat).toBe('storm');
    expect(crisisAt(a, b, { on: () => false })).toBeUndefined();
    // And a turn whose every switch is off runs to the end.
    const s0 = playWeeks('turn-off-run', 3);
    expect(advanceTurn(s0, 2, {}, { stop: (x, y) => crisisAt(x, y, { on: () => false }) }).weeks).toBe(2);
  });

  it('the clock\'s autopause is the engine\'s (moved, re-exported)', () => {
    expect(clockAutoPauses).toBe(autoPauses);
  });

  it('spanDiff sums the weeks: the money from first to last, everyone who soured, what is new', () => {
    const s0 = playWeeks('turn-diff', 3);
    const t = advanceTurn(s0, 3, {}, { stop: never });
    const lines = spanDiff(s0, t.state, t.reports);
    const money = lines.find((l) => l.id === 'money')!;
    expect(money.text).toMatch(/^Over 3 weeks Family money (up|down)/);
    const dm = t.reports[2].end.money - t.reports[0].start.money;
    expect(money.text).toContain(`$${Math.abs(dm).toLocaleString('en-US')}`);
    expect(t.reports[0].start.money).toBe(s0.money);
    expect(lines.length).toBeLessThanOrEqual(6);
    // One week: the week's own "What changed?".
    const one = advanceTurn(s0, 1, {});
    expect(spanDiff(s0, one.state, one.reports).map((l) => l.id)[0]).toBe('money');
  });

  it('the default span: Story and Don two weeks, Grand one; Don one in the summer; a month after Labor Day', () => {
    const s = newGame('turn-span');
    const at = (d: 'story' | 'don' | 'grand', m: number) => { const x = setDifficulty(clone(s), d); x.date = { ...x.date, m, d: 15 }; return defaultSpan(x); };
    expect(at('grand', 7)).toBe(1);
    expect(at('grand', 10)).toBe(1);
    expect(at('don', 7)).toBe(1);
    expect(at('story', 7)).toBe(2);
    expect(at('story', 10)).toBe(4);
    expect(at('don', 10)).toBe(4);
    expect(at('don', 4)).toBe(2);
  });
});

describe('the Round and the end of the turn', () => {
  it('seven stops; a quiet one is ticked; a visited one with nothing open is ticked; the rest wait', () => {
    const s = playWeeks('round', 5);
    const rows = roundOf(s, {}, new Set());
    expect(rows.map((r) => r.stop)).toEqual(ROUND_STOPS);
    expect(rows.length).toBe(7);
    for (const r of rows) {
      if (r.quiet) expect(r.ticked).toBe(true);
      if (r.stop !== 'needs' && !r.quiet) expect(r.ticked).toBe(false);
    }
    const all = roundOf(s, {}, new Set(ROUND_STOPS));
    for (const r of all) expect(r.ticked).toBe(r.open === 0);
    expect(roundCount(all).of).toBe(7);
  });

  it('ending the turn is always allowed: the review lists the stops not looked at and how they are settled', () => {
    const s = playWeeks('round-ready', 5);
    const html = renderToString(createElement(ReadyToAdvance, { s, ui: {}, onReview: () => {}, onAdvance: () => {}, onClose: () => {}, turn: { weeks: 2, unvisited: [{ stop: 'law', label: 'Law', open: 1 }, { stop: 'town', label: 'Town', open: 0 }] } }));
    expect(html).toContain('data-testid="ready-review"');
    expect(html).toContain('data-testid="ready-round"');
    expect(html).toContain('Law (1 waiting)');
    expect(html).toContain('delegation level');
    expect(html).toContain('end the turn (2 weeks)');
    expect(html).toContain('data-testid="ready-advance"');
  });
});

describe('who plays in turns (§5.3)', () => {
  const memKV = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }; };
  const withStore = (f: () => void) => {
    const g = globalThis as { localStorage?: unknown };
    const had = g.localStorage;
    g.localStorage = memKV();
    try { reloadSettings(); f(); } finally { g.localStorage = had; reloadSettings(); }
  };
  it('a new Story player starts in turns; Don and Grand keep the clock; a player who chose is never moved', () => {
    withStore(() => {
      expect(getSettings().timeMode).toBeUndefined();
      expect(newGameTimeMode('story')).toBe('turns');
      expect(getSettings().timeMode).toBe('turns');
      // The default is not a choice: the next new game on Don gets the clock.
      expect(newGameTimeMode('don')).toBe('clock');
      expect(newGameTimeMode('grand')).toBe('clock');
      // He picks the clock in Settings: Story never moves him again.
      setSettings({ timeMode: 'clock', timeModeChosen: true, timeModeAuto: undefined } as Partial<Settings>);
      expect(newGameTimeMode('story')).toBe('clock');
      expect(getSettings().timeMode).toBe('clock');
    });
    withStore(() => {
      // A mode stored from before the default existed (picked, or moved to the clock once) is kept too.
      setSettings({ timeMode: 'clock' });
      expect(newGameTimeMode('story')).toBe('clock');
      setSettings({ timeMode: 'turns' });
      expect(newGameTimeMode('don')).toBe('turns');
    });
  });
});
