import { advanceWeek } from '../src/engine/engine';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { ShellContext } from '../src/ui/shell/context';
import { StandingButton, StandingDialog, StandingList } from '../src/ui/appts/Standing';
import { menuFor } from '../src/ui/sheet/menuCatalog';
import { newGame } from '../src/engine/newGame';
import { makeCharacter } from '../src/engine/characters';
import { reconcile } from '../src/engine/ledger';
import { upgradeSave } from '../src/engine/upgradeSave';
import { ensureDating, setDatingSettings } from '../src/engine/datingState';
import { addOpinion } from '../src/engine/relations';
import { handleWeekPlan } from '../src/engine/bundles';
import { roundSlots } from '../src/engine/rounds';
import { reservedEvenings } from '../src/engine/apptsState';
import { dayEntries } from '../src/engine/planner/datebook';
import { absDay, timeCost } from '../src/engine/timeCost';
import {
  addAppt, apptOptions, apptViews, cancelAppt, editAppt, overbook, pauseAppt, weekApptActions, weekAppts, type ApptDraft,
} from '../src/engine/appointments';
import type { Character, GameState, PlayerAction } from '../src/engine/types';

/** A game a week in, the boss single, money in his pocket and the Family's. */
function fresh(seed = 'appts-a'): GameState {
  let s = newGame(seed);
  s = advanceWeek(s, {}).state;
  const boss = s.characters[s.playerId];
  boss.orientation = 'straight';
  if (boss.spouseId) { s.characters[boss.spouseId].alive = false; boss.spouseId = undefined; }
  s.tribute!.acct.personal = 20000;
  s.money = Math.max(s.money, 50000);
  return s;
}

function woman(s: GameState, age = 28): Character {
  const c = makeCharacter(s, { gender: 'F', age, rank: 'civilian', faction: 'none', nickname: false, traits: [] });
  c.orientation = 'straight';
  ensureDating(s).met[c.id] = s.week;
  return c;
}

/** A known Ear, listening. */
function anEar(s: GameState) {
  const ear = Object.values(s.ears!.ears).find((e) => e.status !== 'gone' && s.characters[e.id]?.alive)!;
  ear.known = true;
  ear.status = 'listening';
  delete ear.sellsTo;
  ear.loyalty = 50;
  return ear;
}

const meet = (id: string): PlayerAction => ({ kind: 'ears', op: { op: 'meet', earId: id } });
const add = (s: GameState, d: ApptDraft) => {
  const r = addAppt(s, d);
  expect(r.error).toBeUndefined();
  return r.state;
};

describe('standing appointments: the due ones are real orders', () => {
  it('a weekly meet with an Ear is given at the turn like a tap: money, Your File, the report, the books reconcile', () => {
    let s = fresh();
    const ear = anEar(s);
    s = add(s, { who: ear.id, action: meet(ear.id), cadence: 'weekly', day: 2, slot: 'morning' });
    const paid0 = s.ears!.ears[ear.id].paid;
    const r = advanceWeek(s, {});
    expect(reconcile(r.report)).toEqual([]);
    const e2 = r.state.ears!.ears[ear.id];
    expect(e2.meetN).toBe(1);
    expect(e2.paid).toBeGreaterThan(paid0);
    expect(r.report.rounds?.some((l) => /^Standing: meet .*kept/i.test(l))).toBe(true);
    const a = r.state.appts!.list[0];
    expect(a.last?.outcome).toBe('done');
    // Your File has the order, by the boss himself.
    expect(r.state.journal!.e.some((x) => x.w === s.week && /Meet .*what she hears/.test(x.t) && x.mine)).toBe(true);
  });

  it('daily and weekly: a daily meet comes seven times, a weekly one once; the news comes once a week', () => {
    let s = fresh('appts-daily');
    const ear = anEar(s);
    s = add(s, { who: ear.id, action: meet(ear.id), cadence: 'daily', slot: 'morning' });
    expect(weekAppts(s).length).toBe(7 - (absDay(s) % 7));
    const r = advanceWeek(s, {});
    expect(reconcile(r.report)).toEqual([]);
    expect(r.state.ears!.ears[ear.id].meetN).toBe(7 - (absDay(s) % 7));
    // Next week: all seven.
    expect(weekAppts(r.state).length).toBe(7);
  });

  it('a date with the girl he is courting: she decides, and it lands either way', () => {
    let s = fresh('appts-date');
    const c = woman(s);
    addOpinion(s, c.id, s.playerId, 'Likes him', 40, 0);
    const opts = apptOptions(s, c.id);
    const dinner = opts.find((o) => o.action.kind === 'dating' && (o.action.op as { op: string; date?: string }).date === 'dinner');
    expect(dinner).toBeDefined();
    expect(dinner!.pot).toBe('pocket');
    expect(dinner!.evening).toBe(true);
    s = add(s, { who: c.id, action: dinner!.action, cadence: 'weekly', day: 4, slot: 'evening' });
    for (let i = 0; i < 3; i++) {
      const r = advanceWeek(s, {});
      expect(reconcile(r.report)).toEqual([]);
      s = r.state;
      const a = s.appts!.list[0];
      if (!a) break;
      expect(['done', 'refused', 'skipped']).toContain(a.last?.outcome);
      expect(r.report.rounds?.some((l) => l.startsWith('Standing:'))).toBe(true);
    }
  });
});

describe('skips, refusals, budgets', () => {
  it('skipped with the reason when it cannot be done: she is gone; over its budget', () => {
    let s = fresh('appts-skip');
    const ear = anEar(s);
    s = add(s, { who: ear.id, action: meet(ear.id), cadence: 'weekly', day: 6, slot: 'evening', budget: 10 });
    let r = advanceWeek(s, {});
    expect(r.state.appts!.list[0].last?.outcome).toBe('skipped');
    expect(r.state.appts!.list[0].last?.text).toMatch(/budget/);
    expect(r.report.rounds?.some((l) => /skipped: over its budget/.test(l))).toBe(true);
    // Your File notes the skip.
    expect(r.state.journal!.e.some((x) => /^Standing: /.test(x.t) && x.r?.some((y) => /Not carried out/.test(y)))).toBe(true);
    s = r.state;
    s.ears!.ears[ear.id].status = 'gone';
    s = editAppt(s, s.appts!.list[0].id, { budget: undefined }).state;
    r = advanceWeek(s, {});
    expect(r.state.appts!.list[0].last?.text).toMatch(/gone/i);
  });

  it('a standing date she keeps refusing pauses after two no\'s in a row, and he is told', () => {
    let s = fresh('appts-no');
    const c = woman(s);
    addOpinion(s, c.id, s.playerId, 'Cool on him', -39, 0);
    const opt = apptOptions(s, c.id).find((o) => o.action.kind === 'dating' && (o.action.op as { op: string }).op === 'talk');
    expect(opt).toBeDefined();
    s = add(s, { who: c.id, action: opt!.action, cadence: 'daily', slot: 'afternoon' });
    let paused = false;
    for (let i = 0; i < 16 && !paused; i++) {
      const r = advanceWeek(s, {});
      s = r.state;
      const a = s.appts!.list[0];
      if (a.paused) {
        paused = true;
        expect(a.paused).toMatch(/said no 2 times/);
        expect(r.report.rounds?.some((l) => /paused/.test(l))).toBe(true);
        // A daily one is not asked again the same week after a no.
        expect(r.report.rounds?.some((l) => /said no this week/.test(l)) || a.no >= 2).toBe(true);
      }
    }
    expect(paused).toBe(true);
    // Paused: nothing due, no hours held.
    expect(weekAppts(s).length).toBe(0);
    s = pauseAppt(s, s.appts!.list[0].id, false);
    expect(s.appts!.list[0].paused).toBeUndefined();
    expect(s.appts!.list[0].no).toBe(0);
  });
});

describe('mature content, adults, nothing grave', () => {
  it('paid company exists only with mature content on; Off hides it and it does not happen', () => {
    let s = fresh('appts-adult');
    s = setDatingSettings(s, { mature: 'standard' });
    const prov = Object.values(s.dating!.providers).find((p) => p.status === 'working' && p.offers && s.characters[p.id]?.alive);
    expect(prov).toBeDefined();
    if (!prov) return;
    const opt = apptOptions(s, prov.id).find((o) => o.adult);
    expect(opt).toBeDefined();
    s = add(s, { who: prov.id, action: opt!.action, cadence: 'weekly', day: 5, slot: 'evening' });
    expect(apptViews(s).length).toBe(1);
    s = setDatingSettings(s, { mature: 'off' });
    expect(apptOptions(s, prov.id).some((o) => o.adult)).toBe(false);
    expect(apptViews(s).length).toBe(0);
    expect(weekAppts(s).length).toBe(0);
    expect(addAppt(s, { who: prov.id, action: opt!.action, cadence: 'weekly', day: 5, slot: 'evening' }).error).toMatch(/off/i);
    const r = advanceWeek(s, {});
    expect(r.state.appts!.list[0].last).toBeUndefined();
  });

  it('a minor is never a date; nothing that takes a man is routine', () => {
    const s = fresh('appts-minor');
    const girl = woman(s, 16);
    expect(apptOptions(s, girl.id).some((o) => o.action.kind === 'dating')).toBe(false);
    for (const c of Object.values(s.characters).filter((x) => x.alive && x.faction === 'player').slice(0, 6)) {
      for (const o of apptOptions(s, c.id)) expect(o.action.kind === 'interact' && ['whack', 'exile'].includes((o.action as { id: string }).id)).toBe(false);
    }
  });
});

describe('the days fill: hours, evenings, overbooking', () => {
  it('hours are held on the book and come back when it is called off; the datebook shows it', () => {
    let s = fresh('appts-hours');
    const ear = anEar(s);
    const day = 6;
    const abs = s.week * 7 + day;
    const before = s.hours?.booked?.[abs] ?? 0;
    s = add(s, { who: ear.id, action: meet(ear.id), cadence: 'weekly', day, slot: 'afternoon' });
    expect(s.hours!.booked![abs]).toBe(before + timeCost(meet(ear.id), s));
    expect(dayEntries(s, s.week, day).some((e) => e.kind === 'standing' && e.who === ear.id)).toBe(true);
    s = cancelAppt(s, s.appts!.list[0].id);
    expect(s.hours?.booked?.[abs] ?? 0).toBe(before);
  });

  it('evenings are held first, and too many is said before he commits', () => {
    let s = fresh('appts-over');
    const a = woman(s);
    const b = woman(s);
    addOpinion(s, a.id, s.playerId, 'Likes him', 30, 0);
    addOpinion(s, b.id, s.playerId, 'Likes him', 30, 0);
    const slots0 = roundSlots(s).slots;
    const dinA = apptOptions(s, a.id).find((o) => o.evening)!;
    const dinB = apptOptions(s, b.id).find((o) => o.evening)!;
    s = add(s, { who: a.id, action: dinA.action, cadence: 'weekly', day: 6, slot: 'evening' });
    expect(reservedEvenings(s)).toBe(1);
    expect(roundSlots(s).slots).toBe(Math.max(1, slots0 - 1));
    const warn = overbook(s, { who: b.id, action: dinB.action, cadence: 'daily', slot: 'evening' });
    expect(warn.some((w) => /same time/.test(w))).toBe(true);
    expect(warn.some((w) => /standing evenings/.test(w))).toBe(true);
  });
});

describe('the hand-off and the save', () => {
  it('"Handle the week" counts them as already decided', () => {
    let s = fresh('appts-hand');
    const ear = anEar(s);
    s = add(s, { who: ear.id, action: meet(ear.id), cadence: 'weekly', day: 6, slot: 'morning' });
    expect(weekApptActions(s).length).toBe(1);
    const plan = handleWeekPlan(s);
    expect(plan.standing?.[0]).toMatch(/^Standing: meet .* Sun morning$/);
  });

  it('a fresh game has none, and a save with them loads as it was', () => {
    const g = newGame('appts-save');
    expect(g.appts).toBeUndefined();
    let s = fresh('appts-save2');
    const ear = anEar(s);
    s = add(s, { who: ear.id, action: meet(ear.id), cadence: 'weekly', day: 3, slot: 'evening', weeks: 4, budget: 500 });
    const raw = JSON.stringify(s);
    const back = upgradeSave(JSON.parse(raw));
    expect(back.appts).toEqual(s.appts);
    expect(apptViews(back)[0].span).toMatch(/through week/);
  });
});

describe('what the boss sees', () => {
  it('the dialog, the list, the button and the menu item', () => {
    let s = fresh('appts-ui');
    const ear = anEar(s);
    const dlg = renderToString(createElement(StandingDialog, { s, ask: { who: ear.id, action: meet(ear.id) }, onClose: () => {}, onSave: () => {} }));
    for (const id of ['standing-dialog', 'standing-what', 'standing-weekly', 'standing-daily', 'standing-slot-evening', 'standing-span-open', 'standing-budget', 'standing-cost', 'standing-save']) expect(dlg).toContain(`data-testid="${id}"`);
    expect(renderToString(createElement(StandingList, { s }))).toContain('standing-empty');
    s = add(s, { who: ear.id, action: meet(ear.id), cadence: 'weekly', day: 6, slot: 'morning' });
    const list = renderToString(createElement(StandingList, { s }));
    expect(list).toContain('data-testid="standing-row"');
    expect(list).toContain('standing-pause');
    // The button needs the shell to open the dialog (absent in isolated renders).
    expect(renderToString(createElement(StandingButton, { who: ear.id }))).toBe('');
    const withShell = renderToString(createElement(ShellContext.Provider, { value: { go: () => {}, focus: () => {}, standing: () => {} } }, createElement(StandingButton, { who: ear.id })));
    expect(withShell).toContain('standing-open');
    const keys = menuFor(s, s.characters[ear.id]).flatMap((c) => c.items.map((i) => i.key));
    expect(keys).toContain('standing');
    expect(keys).toContain('ear:meet');
  });
});
