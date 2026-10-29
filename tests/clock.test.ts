import { describe, expect, it } from 'vitest';
import { weekCheckIns } from '../src/engine/checkins';
import { crew, player } from '../src/engine/characters';
import { answerCheckIn, daysOf, formatDay, setEvening, skipMorning, tickDay, weekChoices } from '../src/engine/days';
import { advanceWeek } from '../src/engine/engine';
import { newGame } from '../src/engine/newGame';
import { addOpinion } from '../src/engine/relations';
import { recommendedActions } from '../src/engine/briefing';
import type { GameState, PlayerChoices } from '../src/engine/types';
import { morningStop, newWarnings, pauseReason, SPEED_MS, weekHeadlines } from '../src/ui/clock';
import { AUTO_PAUSE, DEFAULT_SETTINGS, pausesOn, timeMode } from '../src/ui/settings';
import { randomChoices } from './helpers';

describe('the clock', () => {
  it('pauses for decisions (when asked to), an open decision card and the end of the game', () => {
    const s = newGame('clock');
    expect(s.pendingEvents.length).toBeGreaterThan(0);
    expect(pauseReason(s, false)).toMatch(/decision/);
    expect(pauseReason(s, false, 0)).toBeUndefined();
    expect(pauseReason(s, true, 0)).toMatch(/decision card/);
  });

  it('notices new warnings', () => {
    const a = newGame('warn');
    const b = JSON.parse(JSON.stringify(a));
    const capo = crew(b).find((c) => c.rank === 'capo')!;
    addOpinion(b, capo.id, b.playerId, 'Test', -100, 0);
    addOpinion(b, capo.id, b.playerId, 'Test 2', -100, 0);
    addOpinion(b, capo.id, b.playerId, 'Test 3', -100, 0);
    expect(newWarnings(a, b).some((t) => t.includes(capo.firstName))).toBe(true);
    expect(newWarnings(b, b)).toEqual([]);
  });

  it('ticks a day at a time, Monday to Sunday, with the date', () => {
    let s = newGame('days');
    expect(daysOf(s).day).toBe(0);
    expect(formatDay(s)).toMatch(/^Mon May 30, 1960$/);
    for (let i = 0; i < 10; i++) s = tickDay(s);
    expect(daysOf(s).day).toBe(6);
    expect(formatDay(s)).toMatch(/^Sun Jun 5, 1960$/);
    expect(SPEED_MS[3]).toBeLessThan(SPEED_MS[1]);
  });

  it('defaults: a new player gets the running clock; every autopause rule but the evening scene is on', () => {
    expect(timeMode()).toBe('clock');
    // Only red decisions stop the clock by default (any decision, if the player turns it on).
    expect(DEFAULT_SETTINGS.pauseOnDecision).toBe(false);
    for (const a of AUTO_PAUSE) expect(pausesOn(a.key), a.key).toBe(a.key !== 'pauseOnEvening' && a.key !== 'pauseOnDecision');
  });

  it('stops for what matters when the week turns: a killing, an arrest, a birth, a death', () => {
    const a = newGame('heads');
    const b = structuredClone(a) as GameState;
    const men = crew(b).filter((c) => c.rank !== 'capo');
    men[0].alive = false;
    men[0].death = { week: b.week, date: b.date, cause: 'shot outside the Hialeah club', killer: 'manno' as never };
    men[1].imprisonedUntil = b.week + 20;
    b.characters.newborn = { ...structuredClone(player(b)), id: 'newborn', firstName: 'Baby', dynasty: true, childrenIds: [] };
    const kinds = weekHeadlines(a, b).map((h) => h.kind).sort();
    expect(kinds).toEqual(['arrest', 'birth', 'hit']);
    expect(weekHeadlines(a, a)).toEqual([]);
  });

  it('stops for an urgent problem at the morning meeting, until it is answered or the morning skipped', () => {
    let s = newGame('urgent');
    s.heat.local = 75;
    const u = weekCheckIns(s).find((c) => c.problem?.urgent);
    expect(u).toBeDefined();
    expect(u!.day).toBe(0);
    expect(morningStop(s)).toMatch(/urgent/);
    let answered = s;
    for (const c of weekCheckIns(s).filter((x) => x.day === 0 && x.problem?.urgent)) {
      expect(morningStop(answered)).toMatch(/urgent/);
      answered = answerCheckIn(answered, c.key, c.problem!.answers[0].id);
    }
    expect(morningStop(answered)).toBeUndefined();
    expect(morningStop(skipMorning(s, 0, true))).toBeUndefined();
  });
});

describe('a week on the clock is the same week as Advance Week', () => {
  function plannedWeek(seed: string, weeks: number): { s: GameState; base: PlayerChoices } {
    let s = newGame(seed);
    for (let i = 0; i < weeks; i++) s = advanceWeek(s, weekChoices(s, randomChoices(s, i))).state;
    // Plan the week: two evenings, an answer at a check-in, a skipped morning, and the advisors' orders.
    s = setEvening(s, 1, 'self:lawyer');
    s = setEvening(s, 3, 'self:doctor');
    const p = weekCheckIns(s).find((c) => c.problem);
    if (p) s = answerCheckIn(s, p.key, p.problem!.answers[0].id);
    s = skipMorning(s, 5, true);
    const base: PlayerChoices = { ...randomChoices(s, 99), actions: recommendedActions(s).map((r) => r.action) };
    return { s, base };
  }

  for (const seed of ['same-a', 'same-b']) {
    it(`same orders, same seed, same result (${seed})`, () => {
      const { s, base } = plannedWeek(seed, 3);
      // Turn-based: one click.
      const direct = advanceWeek(s, weekChoices(s, base));
      // Running clock: Monday … Sunday, then the same call.
      let c = s;
      for (let d = 0; d < 6; d++) c = tickDay(c);
      expect(daysOf(c).day).toBe(6);
      const clock = advanceWeek(c, weekChoices(c, base));
      expect(JSON.stringify(clock.state)).toEqual(JSON.stringify(direct.state));
      expect(clock.report).toEqual(direct.report);
      expect(direct.report.rounds!.some((l) => /Lindner|lawyer/i.test(l))).toBe(true);
      // And the next week replays the same, too.
      const n1 = advanceWeek(clock.state, weekChoices(clock.state, randomChoices(clock.state, 7)));
      const n2 = advanceWeek(direct.state, weekChoices(direct.state, randomChoices(direct.state, 7)));
      expect(JSON.stringify(n1.state)).toEqual(JSON.stringify(n2.state));
    });
  }

  it('a save taken mid-week (Thursday) loads and finishes the same week', () => {
    const { s, base } = plannedWeek('same-c', 2);
    let c = s;
    for (let d = 0; d < 3; d++) c = tickDay(c);
    const loaded = JSON.parse(JSON.stringify(c)) as GameState;
    expect(daysOf(loaded).day).toBe(3);
    const a = advanceWeek(loaded, weekChoices(loaded, base));
    const b = advanceWeek(s, weekChoices(s, base));
    expect(JSON.stringify(a.state)).toEqual(JSON.stringify(b.state));
  });
});


describe('the clock runs (CK style)', () => {
  it('running is the default, at a moving speed; an old turn-based player is moved over once', async () => {
    const { DEFAULT_SPEED, CLOCK_MS } = await import('../src/ui/clockPolicy');
    const { migrateClock } = await import('../src/ui/settings');
    expect(DEFAULT_SPEED).toBeGreaterThan(0);
    expect(Object.keys(CLOCK_MS)).toEqual(['1', '2', '3', '4', '5']);
    expect(CLOCK_MS[5]).toBeLessThan(CLOCK_MS[1]);
    const old = migrateClock({ ...DEFAULT_SETTINGS, clockV: undefined, timeMode: 'turns', pauseOnDecision: true });
    expect(old.timeMode).toBe('clock');
    expect(old.pauseOnDecision).toBe(false);
    // After the move, a player who picks turn-based again keeps it.
    expect(migrateClock({ ...old, timeMode: 'turns' }).timeMode).toBe('turns');
  });
  it('auto-pauses for red on the Desk, an urgent meeting, war, a death in the house and a plot; not for routine', async () => {
    const { autoPauses, firstPause } = await import('../src/ui/clockPolicy');
    const a = newGame('clock-auto');
    const clone = (x: GameState): GameState => JSON.parse(JSON.stringify(x));
    const acked = new Set<string>(autoPauses(a, a, new Set()).length ? [] : []);
    // Routine: a quiet day passes with nothing new.
    const quiet = tickDay(a);
    const reds0 = new Set((await import('../src/ui/clockPolicy')).redKeys(a));
    expect(autoPauses(a, quiet, reds0).filter((w) => w.cat !== 'red')).toEqual([]);
    // A war declared.
    const war = clone(a);
    war.wars.push({ id: 'w-test', rival: a.rivals[0].id, startWeek: a.week } as unknown as GameState['wars'][number]);
    expect(autoPauses(a, war, reds0).map((w) => w.cat)).toContain('war');
    // A death in the house.
    const death = clone(a);
    const kin = Object.values(death.characters).find((c) => c.alive && c.dynasty && c.id !== death.playerId)!;
    kin.alive = false;
    expect(autoPauses(a, death, reds0).map((w) => w.cat)).toContain('death');
    // A plot uncovered.
    const plot = clone(a);
    plot.schemes.push({ id: 'sc-plot', kind: 'murder', owner: a.rivals[0].id, ownerId: a.rivals[0].leaderId, targetId: a.playerId, agents: [], opts: { depth: 'planned' }, progress: 40, startWeek: a.week, discovered: true, because: '' } as unknown as GameState['schemes'][number]);
    expect(autoPauses(a, plot, reds0).map((w) => w.cat)).toContain('plot');
    // A red item on the Desk: once (acked after).
    const red = clone(a);
    red.pendingEvents.push({ iid: 'red-x', defId: 'test_red', title: 'Red', text: 'x', week: a.week, choices: [{ id: 'a', label: 'A', effects: [] }], defaultChoiceId: 'a', mandatory: true, priority: 1 } as unknown as GameState['pendingEvents'][number]);
    expect(autoPauses(a, red, reds0).map((w) => w.cat)).toContain('red');
    expect(autoPauses(a, red, new Set(['ev:red-x', ...reds0])).map((w) => w.cat)).not.toContain('red');
    // Settings switch a category off.
    expect(firstPause(autoPauses(a, war, reds0), (k) => k !== 'pauseOnWar')?.cat).not.toBe('war');
    void acked;
  });
  it('speed keys 1-5 never take a choice key inside a decision card', async () => {
    const { speedKey } = await import('../src/ui/clockPolicy');
    expect(speedKey('3', false)).toBe(3);
    expect(speedKey('5', false)).toBe(5);
    expect(speedKey('3', true)).toBeUndefined();
    expect(speedKey('6', false)).toBeUndefined();
    expect(speedKey('a', false)).toBeUndefined();
  });
});
