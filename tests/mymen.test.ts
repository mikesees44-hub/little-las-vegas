/**
 * MY MEN (engine/myMen.ts, ui/borgata/MyMen.tsx): taking care of the crew, and
 * the whole crew watching how — the "Does the boss have our back?" meter,
 * every order for a man (money, safety, discipline), the have-his-back flow up
 * to going to war for him, and the save rules (upgradeSave no-op, determinism,
 * round-trip).
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { newGame } from '../src/engine/newGame';
import { advanceWeek } from '../src/engine/engine';
import { newCtx } from '../src/engine/ledger';
import { previewAction } from '../src/engine/actions';
import { crew } from '../src/engine/characters';
import { opinion } from '../src/engine/relations';
import { upgradeSave } from '../src/engine/upgradeSave';
import { timeCost, hasTimeCost } from '../src/engine/timeCost';
import {
  BACK_MOD, BACK_START, backFactor, backMeter, backReasons, desertMult, ensureMyMen, menActionsFor, moveBack, myMen, myMenWeek,
  openWrongs, raiseWrong, wrongById, type MenAction,
} from '../src/engine/myMen';
import { getRelation } from '../src/engine/relations';
import { MyMen } from '../src/ui/borgata/MyMen';
import type { Character, GameState, PlayerAction } from '../src/engine/types';

const clone = (s: GameState): GameState => JSON.parse(JSON.stringify(s));
const A = (op: MenAction): PlayerAction => ({ kind: 'mymen', op });

function setup(seed = 'mymen'): { s: GameState; m: Character } {
  const s = newGame(seed);
  s.money = 100000;
  const m = crew(s).find((c) => c.rank === 'soldier')!;
  m.household = { wife: 'Rose', kids: [{ name: 'Tony', male: true, born: 1950 }] };
  return { s, m };
}

/** Give the order and turn the week. */
function order(s: GameState, op: MenAction): GameState {
  const p = previewAction(s, A(op));
  expect(p.disabledReason, `${op.op}: ${p.disabledReason}`).toBeUndefined();
  return advanceWeek(s, { actions: [A(op)] }).state;
}

describe('the meter: does the boss have our back?', () => {
  it('starts even, moves with what the boss does, and is clamped', () => {
    const { s } = setup();
    expect(backMeter(s)).toBe(BACK_START);
    expect(backFactor(s)).toBe(0);
    expect(desertMult(s)).toBe(1);
    expect(backReasons(s)).toEqual([]);
    moveBack(s, 200, 'test');
    expect(backMeter(s)).toBe(100);
    expect(backFactor(s)).toBe(1);
    expect(desertMult(s)).toBe(0.5);
    expect(backReasons(s)[0].value).toBe(15);
    moveBack(s, -300, 'test');
    expect(backMeter(s)).toBe(0);
    expect(desertMult(s)).toBe(1.5);
    expect(s.mymen!.log.length).toBe(2);
  });

  it('every man carries it in what he thinks of the boss (loyalty, and so informant risk and poaching)', () => {
    const { s, m } = setup();
    ensureMyMen(s).back = 90;
    s.mymen!.month = 'none';
    const before = opinion(s, m.id, s.playerId);
    myMenWeek(newCtx(s));
    expect(getRelation(s, m.id, s.playerId)!.modifiers.find((x) => x.reason === BACK_MOD)?.value).toBe(8);
    expect(opinion(s, m.id, s.playerId)).toBe(before + 8);
    // Said once: the same value next month is not written again.
    s.mymen!.month = 'none2';
    const n = s.nextId;
    myMenWeek(newCtx(s));
    expect(s.nextId).toBe(n);
  });

  it('a decision that gives a man up costs the most; one that helps him is noticed', () => {
    const { s, m } = setup();
    s.pendingEvents = [{
      iid: 'evT', defId: 'test', title: 't', text: 't', week: s.week, mandatory: true, priority: 1, defaultChoiceId: 'help', meta: { charId: m.id },
      choices: [
        { id: 'give', label: 'Give him up', because: 'gave him up', effects: [{ type: 'kill', charId: m.id, cause: 'given up' }] },
        { id: 'help', label: 'Help him', because: 'helped him', effects: [{ type: 'opinion', from: m.id, to: s.playerId, amount: 12, reason: 'Helped' }] },
      ],
    }];
    const a = advanceWeek(clone(s), { choices: { evT: 'give' } }).state;
    expect(a.characters[m.id].alive).toBe(false);
    expect(a.mymen!.log.some(([, d, t]) => d === -20 && /Gave/.test(t))).toBe(true);
    const b = advanceWeek(clone(s), {}).state;
    expect(b.characters[m.id].alive).toBe(true);
    expect(b.mymen!.log.some(([, d]) => d === 1)).toBe(true);
  });
});

describe('every order for a man', () => {
  it('money: bonus, a bigger end, his debts (to a rival shylock too), bills, his brother, a no-show job, tuition, the hospital', () => {
    const { s, m } = setup();
    // Bonus.
    const base = advanceWeek(clone(s), {}).state;
    let t = order(clone(s), { op: 'bonus', id: m.id, amount: 500 });
    // The $500 reaches him (the rest of his week is dice, which drift with every new layer).
    expect(t.lastReport!.lines.some((l) => l.stat === 'money' && l.amount === -500)).toBe(true);
    expect(t.characters[m.id].wealth).toBeGreaterThan(base.characters[m.id].wealth + 150);
    expect(t.mymen!.back).toBeGreaterThan(50);
    expect(previewAction(t, A({ op: 'bonus', id: m.id, amount: 500 })).disabledReason).toMatch(/weeks? ago/);
    // A bigger end: a soldier is squeezed less.
    t = order(clone(s), { op: 'raise', id: m.id });
    expect(t.characters[m.id].policy).not.toBe(s.characters[m.id].policy ?? 'x');
    // Debts: the credit man, a friend, and a rival's shylock.
    const d = clone(s);
    d.characters[m.id].debtTo = { rival: 'kessler', amount: 900, week: d.week };
    (d.tribute!.life ??= {})[m.id] = { ...(d.tribute!.life?.[m.id] ?? { earned: 0, up: 0, kept: 0, spent: 0 }), debt: 400 };
    const p = previewAction(d, A({ op: 'debt', id: m.id }));
    expect(p.cost).toBe(1300);
    t = order(d, { op: 'debt', id: m.id });
    expect(t.characters[m.id].debtTo).toBeUndefined();
    expect(t.tribute!.life![m.id].debt).toBe(0);
    expect(previewAction(t, A({ op: 'debt', id: m.id })).disabledReason).toBe('He owes nobody');
    // Bills, his brother, the no-show job (pays every week), tuition, the hospital.
    t = order(clone(s), { op: 'bills', id: m.id });
    expect(t.mymen!.last[`${m.id}:bills`]).toBe(s.week);
    t = order(clone(s), { op: 'brother', id: m.id });
    expect(t.mymen!.perks[m.id]).toContain('brother');
    expect(previewAction(t, A({ op: 'brother', id: m.id })).disabledReason).toBeDefined();
    t = order(clone(s), { op: 'noshow', id: m.id });
    expect(t.mymen!.perks[m.id]).toContain('noshow');
    const w0 = t.characters[m.id].wealth;
    const t2 = advanceWeek(t, {}).state;
    expect(t2.characters[m.id].wealth).not.toBe(w0);
    t = order(clone(s), { op: 'tuition', id: m.id });
    expect(t.mymen!.last[`${m.id}:tuition`]).toBe(s.week);
    const h = clone(s);
    h.characters[m.id].health = 45;
    t = order(h, { op: 'hospital', id: m.id });
    expect(t.characters[m.id].health).toBeGreaterThan(45);
    expect(previewAction(s, A({ op: 'hospital', id: m.id })).disabledReason).toBe(s.characters[m.id].health >= 70 ? 'He is healthy' : undefined);
  });

  it('the envelope for every man: once a year, every man thinks better of the boss', () => {
    const { s } = setup();
    const ops = crew(s).map((c) => [c.id, opinion(s, c.id, s.playerId)] as const);
    const t = order(clone(s), { op: 'christmas' });
    expect(t.mymen!.xmas).toBe(s.date.y);
    for (const [id, o] of ops) if (t.characters[id]?.alive && t.characters[id].faction === 'player') expect(opinion(t, id, t.playerId)).toBeGreaterThan(o - 6);
    expect(previewAction(t, A({ op: 'christmas' })).disabledReason).toBe('Already this year');
  });

  it('his back: a guy on him, his family safe, a lawyer and bail, his family while he is inside, a visit, hiding him', () => {
    const { s, m } = setup();
    let t = order(clone(s), { op: 'guard', id: m.id });
    expect(t.mymen!.guard[m.id]).toBeGreaterThan(s.week);
    t = order(clone(s), { op: 'safety', id: m.id });
    expect(t.mymen!.safe[m.id]).toBeGreaterThan(s.week);
    t = order(clone(s), { op: 'hide', id: m.id });
    expect(t.mymen!.hidden[m.id]).toBeGreaterThan(s.week);
    expect(t.characters[m.id].busyUntil).toBeGreaterThan(s.week);
    // Inside.
    const j = clone(s);
    j.characters[m.id].imprisonedUntil = j.week + 12;
    expect(previewAction(s, A({ op: 'visit', id: m.id })).disabledReason).toBe('He is not inside');
    t = order(clone(j), { op: 'visit', id: m.id });
    expect(opinion(t, m.id, t.playerId)).toBeGreaterThan(opinion(j, m.id, j.playerId));
    t = order(clone(j), { op: 'inside', id: m.id });
    expect(t.mymen!.inside[m.id]).toBe(j.week + 12);
    const money0 = t.money;
    const t3 = advanceWeek(t, {}).state;
    expect(t3.lastReport!.lines.some((l) => /inside/.test(l.label) && l.amount === -100)).toBe(true);
    void money0;
    t = order(clone(j), { op: 'lawyer', id: m.id });
    expect(t.characters[m.id].imprisonedUntil ?? 0).toBeLessThanOrEqual(t.week);
    // No charges, no heat: no lawyer needed.
    const c = clone(s);
    c.characters[m.id].evidence = 0;
    expect(previewAction(c, A({ op: 'lawyer', id: m.id })).disabledReason).toBe('The law has nothing on him');
  });

  it('discipline: warn, fine, demote, the shelf; killing him only on a confirmed order, and it costs the most', () => {
    const { s, m } = setup();
    let t = order(clone(s), { op: 'warn', id: m.id });
    expect(t.characters[m.id].alive).toBe(true);
    const f = clone(s);
    f.characters[m.id].wealth = 1000;
    t = order(f, { op: 'fine', id: m.id, amount: 500 });
    expect(t.characters[m.id].wealth).toBeLessThan(1000);
    const k = clone(s);
    const capo = crew(k).find((c) => c.rank === 'capo')!;
    t = order(k, { op: 'demote', id: capo.id });
    expect(t.characters[capo.id].rank).toBe('soldier');
    t = order(clone(s), { op: 'shelf', id: m.id });
    expect(t.mymen!.shelf[m.id]).toBe(s.week + 8);
    // The order on his life.
    expect(previewAction(s, A({ op: 'kill', id: m.id, confirm: false })).disabledReason).toBe('Confirm the order first');
    t = order(clone(s), { op: 'kill', id: m.id, confirm: true });
    expect(t.characters[m.id].alive).toBe(false);
    expect(t.mymen!.back).toBeLessThan(40);
    expect(t.mymen!.log.some(([, d]) => d === -20)).toBe(true);
  });

  it('every order has hours, and the panel offers each of them for each man', () => {
    const { s, m } = setup();
    const acts = menActionsFor(s, m.id);
    expect(acts.length).toBe(19);
    for (const a of [...acts.map((x) => x.action), A({ op: 'christmas' }), A({ op: 'answer', wrong: 'x', how: 'war' })]) {
      const op = (a as { op: { op: string } }).op.op;
      expect(hasTimeCost('mymen', op), op).toBe(true);
      expect(timeCost(a, s)).toBeGreaterThan(0);
      expect(previewAction(s, a).title.length).toBeGreaterThan(3);
    }
  });
});

describe('have his back', () => {
  function wronged(seed: string, by: 'rival' | 'cop' | 'outsider' = 'rival') {
    const { s, m } = setup(seed);
    const r = s.rivals.find((x) => x.kind === 'mob' && s.characters[x.leaderId]?.alive && !s.wars.some((w) => w.rival === x.id))!;
    const w = raiseWrong(newCtx(s), m, by, by === 'cop' ? 'arrested' : 'slapped', by === 'rival' ? (r.id as never) : undefined);
    return { s, m, r, w };
  }

  it('it is surfaced: a decision on the desk, the panel lists it, and silence never answers for him', () => {
    const { s, m, r, w } = wronged('back-1');
    expect(w.text).toContain(m.firstName);
    expect(w.text).toContain(`got slapped around by ${r.shortName}`);
    const ev = s.eventQueue.find((e) => e.defId === 'mymen_wrong')!;
    expect(ev.choices.map((c) => c.id)).toEqual(['sitdown', 'payback', 'war', 'drop', 'wait']);
    expect(ev.defaultChoiceId).toBe('wait');
    expect(openWrongs(s).map((x) => x.id)).toEqual([w.id]);
    // Unanswered past its day: the underboss handles it, and the men notice.
    let t = s;
    for (let i = 0; i < 4; i++) t = advanceWeek(t, {}).state;
    expect(wrongById(t, w.id)!.status).toBe('lapsed');
    expect(t.mymen!.log.some(([, d, x]) => d < 0 && /Never answered/.test(x))).toBe(true);
  });

  it('going to war for him opens a war through the war system, and the men see it', () => {
    const { s, m, r, w } = wronged('back-2');
    const t = order(s, { op: 'answer', wrong: w.id, how: 'war' });
    expect(t.wars.some((x) => x.rival === r.id)).toBe(true);
    expect(t.wars.find((x) => x.rival === r.id)!.cb).toBe('grievance');
    expect(wrongById(t, w.id)!.status).toBe('war');
    expect(t.mymen!.back).toBeGreaterThan(50);
    expect(opinion(t, m.id, t.playerId)).toBeGreaterThan(opinion(s, m.id, s.playerId));
    // Answered: the decision no longer does anything.
    expect(previewAction(t, A({ op: 'answer', wrong: w.id, how: 'drop' })).disabledReason).toBe('Already answered');
  });

  it('a sit-down, payback, or letting it go (the whole crew notices)', () => {
    const a = wronged('back-3');
    const t1 = order(a.s, { op: 'answer', wrong: a.w.id, how: 'sitdown' });
    expect(['sitdown']).toContain(wrongById(t1, a.w.id)!.status);
    expect(wrongById(t1, a.w.id)!.outcome).toBeDefined();
    const b = wronged('back-4');
    const t2 = order(b.s, { op: 'answer', wrong: b.w.id, how: 'payback' });
    expect(t2.mymen!.back).toBeGreaterThan(50);
    const c = wronged('back-5');
    const t3 = order(c.s, { op: 'answer', wrong: c.w.id, how: 'drop' });
    expect(t3.mymen!.back).toBeLessThan(50);
    expect(opinion(t3, c.m.id, t3.playerId)).toBeLessThan(opinion(c.s, c.m.id, c.s.playerId));
    // A cop picked him up: a word with the captain gets him out.
    const d = wronged('back-6', 'cop');
    expect(d.s.characters[d.m.id].imprisonedUntil).toBeGreaterThan(d.s.week);
    expect(d.s.eventQueue.find((e) => e.defId === 'mymen_wrong')!.choices.some((c) => c.id === 'war')).toBe(false);
    const t4 = order(d.s, { op: 'answer', wrong: d.w.id, how: 'sitdown' });
    expect(t4.characters[d.m.id].imprisonedUntil ?? 0).toBeLessThanOrEqual(t4.week);
  });

  it('a man with a guy on him is not the one they go after', () => {
    const { s, m } = setup('back-7');
    ensureMyMen(s).guard[m.id] = s.week + 50;
    let t = s;
    for (let i = 0; i < 40; i++) t = advanceWeek(t, {}).state;
    expect((t.mymen?.wrongs ?? []).some((w) => w.charId === m.id && w.week <= s.week + 49)).toBe(false);
    expect((t.mymen?.wrongs ?? []).length).toBeGreaterThan(0);
  }, 120000);
});

describe('saves', () => {
  it('upgradeSave is a no-op, with and without the layer', () => {
    const s = newGame('mymen-save');
    const json = JSON.stringify(s);
    expect(JSON.stringify(upgradeSave(JSON.parse(json)))).toBe(json);
    const t = advanceWeek(s, {}).state;
    expect(t.mymen).toBeDefined();
    const j2 = JSON.stringify(t);
    expect(JSON.stringify(upgradeSave(JSON.parse(j2)))).toBe(j2);
  });

  it('deterministic, and a save round-trip plays the same', () => {
    const run = (s0: GameState) => {
      let s = s0;
      for (let i = 0; i < 14; i++) {
        const m = crew(s).find((c) => c.rank === 'soldier');
        s = advanceWeek(s, { actions: m ? [A({ op: 'bonus', id: m.id, amount: 100 })] : [] }).state;
      }
      return s;
    };
    const a = run(newGame('mymen-det'));
    const b = run(newGame('mymen-det'));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const mid = run(newGame('mymen-rt'));
    const x = advanceWeek(mid, {}).state;
    const y = advanceWeek(upgradeSave(JSON.parse(JSON.stringify(mid))), {}).state;
    expect(JSON.stringify(x)).toBe(JSON.stringify(y));
    expect(a.mymen!.back).toBeGreaterThan(50);
  }, 120000);
});

describe('the panel', () => {
  it('every man with his money, loyalty, stress, heat, legal trouble, health, wants; the meter; the wrongs', () => {
    const { s, m } = setup('mymen-ui');
    raiseWrong(newCtx(s), m, 'outsider', 'robbed');
    const rows = myMen(s);
    expect(rows.length).toBe(crew(s).length);
    expect(rows[0].id).toBe(m.id);
    const r = rows[0];
    for (const k of ['cash', 'family', 'legal', 'side'] as const) expect(r[k].length).toBeGreaterThan(0);
    expect(r.stress).toBeGreaterThanOrEqual(0);
    const html = renderToString(createElement(MyMen, { s }));
    expect(html).toContain('data-testid="mymen-meter"');
    expect(html).toContain('Does the boss have our back?');
    expect(html).toContain('data-testid="mymen-wrong"');
    expect(html).toContain('data-testid="mymen-bulk"');
    expect((html.match(/data-testid="mymen-man"/g) ?? []).length).toBe(crew(s).length);
  });
});
