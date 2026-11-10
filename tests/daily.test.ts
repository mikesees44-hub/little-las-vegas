import '../src/engine/engine';
import { describe, expect, it } from 'vitest';
import { advanceWeek } from '../src/engine/engine';
import { newGame } from '../src/engine/newGame';
import { newGameWith } from '../src/engine/starts';
import { answerCheckIn, freezeWeek, tickDay, weekChoices } from '../src/engine/days';
import { weekCheckIns } from '../src/engine/checkins';
import { addOpinion } from '../src/engine/relations';
import { LAST_RELEASE_DAY, advanceDay, answerMoment, eventOut, eventsOut, momentView, registerDelivery, releaseAll, scheduleAt } from '../src/engine/daily';
import { scheduled } from '../src/engine/schedule';
import { ensureThreats, liveStrikes, strikeView, tickingClocks, tipOut, type Threat } from '../src/engine/threats';
import { ensureAction, raidedLately, noteRaided } from '../src/engine/actionState';
import { bailoutSource, BAIL_WEEKS, summonsSource, wealthPressure } from '../src/engine/pressure';
import { setPieceSource, stormTonight, weekOfDate } from '../src/engine/setPieces';
import { extraToday } from '../src/engine/paper';
import { upgradeSave } from '../src/engine/upgradeSave';
import { budgetPause } from '../src/ui/clockPolicy';
import { DAY_PAUSES } from '../src/engine/attention';
import { capos } from '../src/engine/characters';
import { memorialDay, laborDay } from '../src/engine/calendar';
import type { GameState } from '../src/engine/types';
import { randomChoices } from './helpers';

function played(seed: string, weeks: number, start?: Parameters<typeof newGameWith>[1]): GameState {
  let s = start ? newGameWith(seed, start) : newGame(seed);
  for (let i = 0; i < weeks && !s.gameOver; i++) s = advanceWeek(s, weekChoices(s, randomChoices(s, i))).state;
  return s;
}

/** A threat set for a night this week (the test's own, not the dice's). */
function plant(s: GameState, t: Partial<Threat>): GameState {
  const x = structuredClone(s) as GameState;
  const T = ensureThreats(x);
  T.threats.push({ id: `thx${T.n++}`, kind: 'raid', by: 'police', start: x.week - 1, due: x.week, blunt: 0, dueDay: 1, hour: 2, ...t } as Threat);
  return x;
}

describe('B1: the week\'s check-ins are frozen once the week is touched', () => {
  it('an order that changes opinions mid-week does not reshuffle mornings already answered', () => {
    let s = played('daily-b1', 6, 'olddon');
    const list = weekCheckIns(s);
    const p = list.find((c) => c.problem);
    if (p) s = answerCheckIn(s, p.key, p.problem!.answers[0].id);
    // Anything that moves the state the problems are read from (a capo's opinion, the heat)...
    const k = capos(s)[0];
    const moved = structuredClone(s) as GameState;
    if (k) addOpinion(moved, k.id, moved.playerId, 'test', -60, 0);
    moved.heat.local = 80;
    expect(weekCheckIns(moved)).toEqual(weekCheckIns(s));
    // freezeWeek is idempotent and pure.
    const f = freezeWeek(s);
    expect(freezeWeek(f)).toBe(f);
  });
});

describe('the week spread across the days', () => {
  it('Monday keeps the mandatory decisions (the money, the chair, a funeral); the rest come out Tuesday to Saturday', () => {
    let seen = 0, later = 0;
    let s = newGame('daily-spread');
    for (let w = 0; w < 20 && !s.gameOver; w++) {
      s = advanceWeek(s, weekChoices(s, randomChoices(s, w))).state;
      for (const e of s.pendingEvents) {
        const d = e.meta?.day;
        if (d === undefined) continue;
        later++;
        expect(Number(d)).toBeGreaterThanOrEqual(1);
        expect(Number(d)).toBeLessThanOrEqual(LAST_RELEASE_DAY);
        expect(['bagman', 'tribute_audience', 'made_boss']).not.toContain(e.defId);
        expect(e.mandatory).toBe(false);
      }
      seen += s.pendingEvents.length;
      // Walk the week: every decision is out by Saturday, and only what is out is on the desk.
      let x = s;
      for (let d = 0; d < LAST_RELEASE_DAY; d++) {
        const out = eventsOut(x).length;
        const r = advanceDay(x);
        x = r.state;
        expect(eventsOut(x).length).toBe(out + r.released.length);
      }
      expect(eventsOut(x).length).toBe(x.pendingEvents.length);
    }
    expect(later).toBeGreaterThan(seen * 0.3);
  });

  it('skipping the week brings out everything it held (nothing is lost)', () => {
    const s = played('daily-skip', 8);
    const all = releaseAll(s);
    expect(eventsOut(all).length).toBe(s.pendingEvents.length);
    expect(all.pendingEvents.every((e) => eventOut(all, e))).toBe(true);
  });
});

describe('ticking clocks: a threat lands on its day and hour', () => {
  it('a raid set for Tuesday 2 a.m. strikes when the clock reaches Tuesday, with odds, rolled in the moment', () => {
    const s = played('daily-tick', 10);
    const biz = s.businesses.find((b) => b.owner === 'player')!;
    const x = plant(s, { bizId: biz.id, district: biz.districtId });
    const id = x.threats!.threats[x.threats!.threats.length - 1].id;
    const r = advanceDay(x);
    expect(r.strikes).toContain(id);
    expect(liveStrikes(r.state).map((t) => t.id)).toContain(id);
    const v = strikeView(r.state, id)!;
    expect(v.when).toMatch(/Tuesday night, 2 a\.m\./);
    expect(v.options.length).toBeGreaterThanOrEqual(2);
    for (const o of v.options) { expect(o.odds).toBeGreaterThanOrEqual(0); expect(o.odds).toBeLessThanOrEqual(1); }
    const ride = v.options.find((o) => o.id === 'ride')!;
    expect(v.options.some((o) => o.odds > ride.odds)).toBe(true);
    // The same save and the same answer give the same result.
    const a = answerMoment(r.state, id, 'clean');
    const b = answerMoment(r.state, id, 'clean');
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
    expect(a.result.ok).toBe(true);
    expect(a.result.chance).toBeDefined();
    expect(liveStrikes(a.state)).toHaveLength(0);
    // It landed in Your File, on its day and hour.
    const e = a.state.journal!.e.find((x2) => x2.src === 'strike');
    expect(e?.d).toBe(1);
    expect(e?.tm).toBe('2 a.m.');
    // A raid that landed is in tomorrow's paper as an EXTRA.
    if (a.result.tier === 'fail') expect(extraToday(tickDay(a.state))?.h).toMatch(/RAID/);
  });

  it('a strike nobody answered lands with the default the next day', () => {
    const s = played('daily-tick2', 10);
    const biz = s.businesses.find((b) => b.owner === 'player')!;
    const x = plant(s, { bizId: biz.id });
    const id = x.threats!.threats[x.threats!.threats.length - 1].id;
    const r1 = advanceDay(x);
    expect(r1.strikes).toContain(id);
    const r2 = advanceDay(r1.state);
    expect(r2.landed.length).toBeGreaterThan(0);
    expect(liveStrikes(r2.state).some((t) => t.id === id)).toBe(false);
    expect(r2.state.threats!.threats.some((t) => t.id === id)).toBe(false);
  });

  it('the urgent meeting about it comes out before it, and the countdown chip shows the night', () => {
    let s = newGame('daily-tips');
    let found = false;
    for (let w = 0; w < 40 && !s.gameOver && !found; w++) {
      s = advanceWeek(s, weekChoices(s, randomChoices(s, w))).state;
      for (const tip of s.threats?.tips ?? []) {
        if (!tip.rel || tip.rel.w !== s.week || !tip.threatId) continue;
        const th = s.threats!.threats.find((t) => t.id === tip.threatId);
        if (th && th.due === s.week) expect(tip.rel.d).toBeLessThan(th.dueDay!);
        // Not out before its day; out on it.
        let x = s;
        for (let d = 0; d < tip.rel.d; d++) { expect(tipOut(x, tip)).toBe(false); x = tickDay(x); }
        expect(tipOut(x, tip)).toBe(true);
        if (tip.dueDay !== undefined && tip.deadline === s.week) expect(tickingClocks(x).some((c) => c.tipId === tip.id)).toBe(true);
        found = true;
      }
    }
    expect(found).toBe(true);
  });

  it('a place raided is not raided again for six weeks (B3)', () => {
    const s = played('daily-cool', 4);
    const b = s.businesses.find((x) => x.owner === 'player')!;
    noteRaided(s, b.id);
    expect(raidedLately(s, b.id)).toBe(true);
    s.week += 6;
    expect(raidedLately(s, b.id)).toBe(false);
  });
});

describe('the day/hour scheduler (schedule.ts: for the phone\'s calls and meets)', () => {
  it('an item scheduled for Wednesday 11 p.m. is delivered as a moment that day, answered in the moment, and leaves the schedule', () => {
    registerDelivery({
      kind: 'test_call',
      view: (_s, it) => ({ id: it.id, title: 'The phone rings', text: String(it.payload.who), when: 'Wednesday, 11 p.m.', warned: false, options: [{ id: 'pick', label: 'Pick up', hint: '', odds: 1 }, { id: 'ring', label: 'Let it ring', hint: '', odds: 1 }], def: 'ring' }),
      answer: (st, it, opt) => ({ state: st, result: { ok: true, title: 'The call', tier: 'success', headline: opt, line: `${String(it.payload.who)}: ${opt}`, changes: [], leadsTo: [] } }),
    });
    const s0 = played('daily-sched', 3);
    const { state, id } = scheduleAt(s0, { kind: 'test_call', day: 2, hour: 23, payload: { who: 'Sal' } });
    let s = state;
    const r1 = advanceDay(s);
    expect(r1.strikes).not.toContain(`sched:${id}`);
    const r2 = advanceDay(r1.state);
    expect(r2.strikes).toContain(`sched:${id}`);
    expect(momentView(r2.state, `sched:${id}`)?.title).toBe('The phone rings');
    const a = answerMoment(r2.state, `sched:${id}`, 'pick');
    expect(a.result.line).toBe('Sal: pick');
    expect(scheduled(a.state)).toHaveLength(0);
    // Unanswered: the default the next day.
    s = scheduleAt(s0, { kind: 'test_call', day: 1, hour: 9, payload: { who: 'Nobody' } }).state;
    const q1 = advanceDay(s);
    const q2 = advanceDay(q1.state);
    expect(q2.landed.some((x) => x.line === 'Nobody: ring')).toBe(true);
  });
});

describe('the pause budget (B2)', () => {
  it('at most DAY_PAUSES stops a day for what can wait; red, urgent, war, death and a strike always stop it', () => {
    let l = undefined as ReturnType<typeof budgetPause>['ledger'] | undefined;
    let n = 0;
    for (let i = 0; i < 5; i++) { const b = budgetPause(l, '9:2', 'warning'); l = b.ledger; if (b.ok) n++; }
    expect(n).toBe(DAY_PAUSES);
    expect(budgetPause(l, '9:2', 'strike').ok).toBe(true);
    expect(budgetPause(l, '9:2', 'red').ok).toBe(true);
    expect(budgetPause(l, '9:3', 'warning').ok).toBe(true);
  });
});

describe('a way back from the bottom, and success draws fire', () => {
  it('after BAIL_WEEKS under water the shylock, Philadelphia (with odds) or a sale is offered', () => {
    const s = played('daily-bail', 4);
    s.money = -25000;
    ensureAction(s).under = BAIL_WEEKS;
    const ev = bailoutSource(s)!;
    expect(ev.mandatory).toBe(true);
    expect(ev.choices.map((c) => c.id)).toEqual(expect.arrayContaining(['shark', 'philly', 'ride']));
    expect(ev.choices.find((c) => c.id === 'philly')!.detail).toMatch(/\d+%/);
    // Once in half a year.
    expect(bailoutSource(s)).toBeUndefined();
  });

  it('Philadelphia\'s summons is a decision with odds; wealth raises the pressure', () => {
    const s = played('daily-summons', 25);
    s.money = 400000;
    expect(wealthPressure(s)).toBeGreaterThan(0.9);
    ensureAction(s);
    let ev;
    for (let i = 0; i < 300 && !ev; i++) { s.week++; ev = summonsSource(s); }
    expect(ev?.defId).toBe('philly_summons');
    expect(ev!.choices.find((c) => c.id === 'argue')!.detail).toMatch(/\d+%/);
  });
});

describe('the season\'s set-pieces', () => {
  it('the Fourth and Labor Day come on their weeks; the hurricane (1960: the week of September 12) is a moment on the clock', () => {
    const fourth = weekOfDate({ y: 1960, m: 7, d: 4 });
    const labor = weekOfDate(laborDay(1960));
    expect(weekOfDate(memorialDay(1961))).toBeGreaterThan(52);
    let s = newGame('daily-sp');
    const fired: string[] = [];
    while (s.week < 18 && !s.gameOver) {
      s = advanceWeek(s, weekChoices(s, randomChoices(s, s.week))).state;
      for (const e of s.pendingEvents) if (e.defId.startsWith('setpiece_')) fired.push(`${e.defId}@${s.week}`);
      if (s.flags.storm_week === s.week) break;
    }
    expect(fired).toContain(`setpiece_fourth@${fourth}`);
    expect(fired).toContain(`setpiece_labor@${labor}`);
    expect(s.flags.storm_week).toBe(weekOfDate({ y: 1960, m: 9, d: 12 }));
    // The storm's night: the clock stops, the boss decides with odds.
    const r = advanceDay(s);
    expect(stormTonight(r.state)).toBe(true);
    expect(r.strikes).toContain('storm');
    const v = momentView(r.state, 'storm')!;
    expect(v.options.map((o) => o.id)).toEqual(expect.arrayContaining(['board', 'open', 'ride']));
    const a = answerMoment(r.state, 'storm', 'board');
    expect(a.result.ok).toBe(true);
    expect(a.state.flags.storm_landed).toBe(1);
    expect(a.state.journal!.e.some((e) => e.src === 'storm')).toBe(true);
    // Only once a year.
    expect(setPieceSource(a.state)).toBeUndefined();
  });
});

describe('respect has to be kept', () => {
  it('above 90 it slips a point a week unless the boss showed strength', () => {
    const s = played('daily-resp', 6);
    s.respect = 97;
    const a = advanceWeek(s, weekChoices(s)).state;
    const shown = structuredClone(s) as GameState;
    ensureAction(shown).strength = shown.week;
    const b = advanceWeek(shown, weekChoices(shown)).state;
    expect(a.respect).toBeLessThan(97 + 3);
    expect(b.respect).toBeGreaterThanOrEqual(a.respect);
  });
});

describe('old saves', () => {
  it('upgradeSave gives the daily layer and stamps planned moves with a day and an hour', () => {
    const s = played('daily-up', 12);
    const old = JSON.parse(JSON.stringify(s)) as GameState;
    delete old.action;
    for (const t of old.threats?.threats ?? []) { delete t.dueDay; delete t.hour; }
    const up = upgradeSave(old);
    expect(up.action).toBeDefined();
    for (const t of up.threats?.threats ?? []) if (!t.schemeId) expect(t.dueDay).toBeDefined();
    // And the week still turns.
    expect(() => advanceWeek(up, weekChoices(up))).not.toThrow();
  });
});
