import { setCapoLevel } from '../src/engine/lieutenants';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { weekCheckIns } from '../src/engine/checkins';
import { capos, player } from '../src/engine/characters';
import { answerCheckIn, awayReason, dayBlock, daysOf, eveningOpen, layoutWeek, missedMornings, setEvening, setWeekRounds, skipMorning, tickDay, weekChoices, weekPlan } from '../src/engine/days';
import { advanceWeek } from '../src/engine/engine';
import { newGame } from '../src/engine/newGame';
import { ensureEars } from '../src/engine/ears';
import { roundOptions, roundOutcome, roundSlots } from '../src/engine/rounds';
import { doctorReading, lawyerReading, mightFlip } from '../src/engine/roundsPersonal';
import { tidyState } from '../src/engine/tidy';
import { upgradeSave } from '../src/engine/upgradeSave';
import type { GameState } from '../src/engine/types';
import { WeekPlanner } from '../src/ui/rounds/WeekPlanner';
import { EveningScene, PersonalActions, TodayStrip } from '../src/ui/rounds/RoundsBits';
import { randomChoices } from './helpers';

function played(seed: string, weeks: number): GameState {
  let s = newGame(seed);
  for (let i = 0; i < weeks && !s.gameOver; i++) s = advanceWeek(s, weekChoices(s, randomChoices(s, i))).state;
  return s;
}

const base = played('rounds-a', 4);
const opt = (s: GameState, id: string) => roundOptions(s).find((r) => r.id === id);

describe('Your Rounds: the boss\'s own affairs', () => {
  it('offers the lawyer, the doctor, the head doctor and (through the Madam) an evening, each an evening from the Pocket', () => {
    const s = structuredClone(base) as GameState;
    ensureEars(s);
    for (const id of ['self:lawyer', 'self:doctor', 'self:shrink']) {
      const r = opt(s, id)!;
      expect(r, id).toBeDefined();
      expect(r.lane).toBe('self');
      expect(r.slots).toBe(1);
      expect(r.cost).toBeGreaterThan(0);
      expect(r.effects.some((e) => e.type === 'money')).toBe(false);
    }
    const esc = opt(s, 'fun:escort');
    if (s.ears?.madam.id && s.characters[s.ears.madam.id]?.alive) {
      expect(esc).toBeDefined();
      // Content: adults, her choice, nothing on screen.
      expect(esc!.text).toMatch(/grown woman/);
      expect(esc!.text).toMatch(/decides/);
      expect(esc!.decline!.text).toMatch(/her right/);
      expect([esc!.text, ...esc!.result].join(' ')).not.toMatch(/\b(sex|bed|naked|undress)\b/i);
    }
  });

  it('the lawyer reads the exposure off the real systems and can cut the heat for a fee', () => {
    const s = structuredClone(base) as GameState;
    s.heat.federal = 62;
    s.heat.local = 48;
    const men = capos(s);
    men[0].evidence = 70;
    const r = lawyerReading(s);
    expect(r.lines.join(' ')).toMatch(/feds: hot \(62\)/);
    expect(r.lines.join(' ')).toMatch(/local cops/);
    expect(mightFlip(s).some((f) => f.id === men[0].id)).toBe(true);
    expect(r.flips.length).toBeGreaterThan(0);
    expect(r.moves.some((m) => /sergeant/.test(m.label))).toBe(true);
    const fix = opt(s, 'self:lawyer-fix')!;
    expect(fix.cost).toBe(r.fixFee);
    s.tribute!.acct.personal = 20000;
    const a = advanceWeek(s, { rounds: ['self:lawyer-fix'] });
    const b = advanceWeek(s, { rounds: [] });
    expect(a.state.heat.federal).toBeLessThan(b.state.heat.federal);
    expect(a.state.heat.local).toBeLessThan(b.state.heat.local);
    // Paid from the boss's Pocket, not the Family.
    expect(b.state.tribute!.acct.personal - a.state.tribute!.acct.personal).toBe(fix.cost);
    expect(a.report.rounds!.join(' ')).toMatch(/Lindner/);
  });

  it('the doctor reads health and conditions; a checkup helps', () => {
    const s = structuredClone(base) as GameState;
    const boss = player(s);
    boss.conditions = ['Bad heart'];
    boss.health = 50;
    const d = doctorReading(s);
    expect(d.lines.join(' ')).toMatch(/heart/);
    expect(d.boost).toBeGreaterThan(3);
    const a = advanceWeek(s, { rounds: ['self:doctor'] }).state;
    const b = advanceWeek(s, { rounds: [] }).state;
    expect(player(a).health).toBeGreaterThan(player(b).health);
  });

  it('outcomes are deterministic: the scene the clock shows is what the week resolves', () => {
    const s = structuredClone(base) as GameState;
    s.tribute!.acct.personal = 20000;
    for (const r of roundOptions(s).filter((x) => !x.action).slice(0, 8)) {
      const o = roundOutcome(s, r);
      expect(roundOutcome(s, r)).toEqual(o);
      const res = advanceWeek(s, { rounds: [r.id] });
      expect(res.report.rounds?.[0]).toBe(o.line);
    }
  });

  it('the head doctor carries a real risk of looking weak, and it grows with visits', () => {
    const s = structuredClone(base) as GameState;
    const r0 = opt(s, 'self:shrink')!;
    expect(r0.risk!.effects.some((e) => e.type === 'crewOpinion')).toBe(true);
    s.rounds = { last: {}, leeway: {}, history: [{ week: s.week - 1, ids: ['self:shrink'] }, { week: s.week - 2, ids: ['self:shrink'] }] };
    expect(opt(s, 'self:shrink')!.risk!.chance).toBeGreaterThan(r0.risk!.chance);
  });
});

describe('the week as days', () => {
  it('lays the usual week on evenings, Sunday dinner on Sunday, within the boss\'s evenings', () => {
    const s = base;
    const plan = weekPlan(s);
    expect(plan).toHaveLength(7);
    const ids = plan.filter(Boolean);
    expect(ids.length).toBeLessThanOrEqual(roundSlots(s).slots);
    if (ids.includes('fam:sunday')) expect(plan[6]).toBe('fam:sunday');
    expect(layoutWeek(s, ['fun:golf', 'fam:sunday'])[6]).toBe('fam:sunday');
  });

  it('an evening moves, clears, respects the slots and never goes back in time', () => {
    let s = setEvening(base, 2, 'self:doctor');
    expect(weekPlan(s)[2]).toBe('self:doctor');
    s = setEvening(s, 4, 'self:doctor');
    expect(weekPlan(s)[2]).toBeNull();
    expect(weekPlan(s)[4]).toBe('self:doctor');
    s = tickDay(tickDay(tickDay(s)));
    expect(daysOf(s).day).toBe(3);
    expect(dayBlock(s, 1, 'fun:golf')).toMatch(/gone/);
    expect(setEvening(s, 1, 'fun:golf')).toBe(s);
    // Filling every evening stops at the boss's limit.
    let t = setWeekRounds(base, []);
    const ids = roundOptions(t).filter((r) => !r.action).map((r) => r.id);
    for (let d = 0; d < 7; d++) t = setEvening(t, d, ids[d]);
    expect(weekPlan(t).filter(Boolean).length).toBe(Math.min(7, roundSlots(t).slots));
  });

  it('away days: prison leaves only Sunday visiting, a trip or the hospital none', () => {
    const s = structuredClone(base) as GameState;
    player(s).imprisonedUntil = s.week + 10;
    expect(awayReason(s, 2)).toBe('In prison');
    expect(eveningOpen(s, 2)).toBe(false);
    expect(eveningOpen(s, 6)).toBe(true);
    const h = structuredClone(base) as GameState;
    player(h).health = 10;
    expect(Object.keys(missedMornings(h)).length).toBe(7);
  });
});

describe('the morning check-in', () => {
  it('every capo, every day, one line from his real situation; problems with one-tap answers', () => {
    const s = base;
    const list = weekCheckIns(s);
    const n = capos(s).filter((c) => c.alive).length;
    expect(list.length).toBe(n * 7);
    expect(list.every((c) => c.line.length > 3)).toBe(true);
    const probs = list.filter((c) => c.problem);
    expect(probs.length).toBeGreaterThan(0);
    for (const c of probs) {
      expect(c.problem!.answers.length).toBeGreaterThanOrEqual(2);
      expect(c.problem!.answers.some((a) => a.id === c.problem!.own)).toBe(true);
    }
    expect(weekCheckIns(s)).toEqual(list);
  });

  it('answers land on the books; unanswered problems are handled his way and he notices', () => {
    // Capos left on "Ask me first", so an unanswered routine problem is a slight (on "Handle it" it is his call).
    let s = base;
    for (const k of capos(s)) s = setCapoLevel(s, k.id, 'ask');
    const c = weekCheckIns(s).find((x) => x.problem)!;
    const pick = c.problem!.answers.find((a) => a.id !== c.problem!.own) ?? c.problem!.answers[0];
    const answered = answerCheckIn(s, c.key, pick.id);
    const a = advanceWeek(answered, weekChoices(answered));
    const b = advanceWeek(s, weekChoices(s));
    expect(JSON.stringify(a.state)).not.toEqual(JSON.stringify(b.state));
    expect(b.report.rounds!.join(' ')).toMatch(/never answered/);
    // (A Loyal-to-a-fault capo halves the slight, and the week's decay can wash a small one out.)
    const plain = weekCheckIns(s).find((x) => x.problem && !s.characters[x.capoId].traits.includes('Loyal-to-a-fault'));
    if (plain) expect(b.state.relations[`${plain.capoId}>${s.playerId}`]?.modifiers.some((m) => /didn't answer/.test(m.reason))).toBe(true);
  });

  it('missed mornings: the capos skim and grumble', () => {
    let s = base;
    for (let d = 0; d < 7; d++) s = skipMorning(s, d, true);
    const r = advanceWeek(s, weekChoices(s));
    const text = r.report.rounds!.join(' ');
    expect(text).toMatch(/missed 7 mornings/);
    expect(text).toMatch(/never around/);
    expect(r.report.lines.some((l) => /skimmed/.test(l.label))).toBe(true);
  });

  it('stays off for games that never send it (old saves, the default)', () => {
    const a = advanceWeek(base, {});
    expect(a.report.rounds ?? []).not.toContain(expect.stringMatching(/mornings/));
    expect(a.state.days).toBeUndefined();
  });
});

describe('saves', () => {
  it('the days plan survives JSON and tidyState; an old or stale plan loads clean', () => {
    let s = setEvening(base, 3, 'self:lawyer');
    s = answerCheckIn(s, '0:x', 'own');
    s = tickDay(s);
    const j = JSON.parse(JSON.stringify(s)) as GameState;
    const t = structuredClone(j);
    tidyState(t);
    expect(t).toEqual(j);
    expect(daysOf(j)).toEqual(daysOf(s));
    const old = JSON.parse(JSON.stringify(base)) as GameState;
    delete old.days;
    expect(daysOf(upgradeSave(old)).day).toBe(0);
    const stale = JSON.parse(JSON.stringify(s)) as GameState;
    stale.days!.week = s.week - 1;
    expect(upgradeSave(stale).days).toBeUndefined();
    // The week turns: the plan is gone, the new week starts on Monday.
    const next = advanceWeek(s, weekChoices(s)).state;
    expect(next.days).toBeUndefined();
    expect(daysOf(next).day).toBe(0);
  });
});

describe('the screens', () => {
  it('render: the planner, the today strip, an evening scene, your own affairs', () => {
    const s = base;
    const html = renderToString(createElement(WeekPlanner, { s, update: () => {} }));
    expect(html).toContain('data-testid="days-strip"');
    expect(html).toContain('data-testid="morning"');
    expect(html).toContain('data-testid="evening"');
    expect(renderToString(createElement(TodayStrip, { s, onOpen: () => {} }))).toContain('data-testid="today-strip"');
    expect(renderToString(createElement(PersonalActions, { s, update: () => {} }))).toContain('evening-self:lawyer');
    const html2 = renderToString(createElement(EveningScene, { s, cue: { week: s.week, day: 1, roundId: 'self:lawyer' }, onClose: () => {} }));
    expect(html2).toContain('data-testid="evening-scene"');
    expect(html2).toMatch(/feds/);
  });
});
