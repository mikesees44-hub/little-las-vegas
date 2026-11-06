import '../src/engine/engine';
import { describe, expect, it } from 'vitest';
import { advanceWeek } from '../src/engine/engine';
import { capos, player } from '../src/engine/characters';
import { ensureDating } from '../src/engine/datingState';
import { newCtx, reconcile } from '../src/engine/ledger';
import { newGame } from '../src/engine/newGame';
import { addOpinion, opinion } from '../src/engine/relations';
import { upgradeSave } from '../src/engine/upgradeSave';
import { readyReview } from '../src/engine/desk';
import {
  applyWifeOp, callOdds, dinnerAsk, ensureWife, nightsPlan, peopleSheCalls, setAutoDinner, setDinner, wifeAct, wifeActs,
  wifeHere, wifeLapses, wifeView, wifeWeek, type WifeKey,
} from '../src/engine/wife';
import type { GameState } from '../src/engine/types';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { WifeCard, WifeDinnerAsk } from '../src/ui/family/WifeCard';

/** A married boss with an empty week (no evenings booked), a full pocket. */
function married(seed: string): GameState {
  const s = newGame(seed);
  const b = player(s);
  const w = s.characters[b.spouseId!];
  w.alive = true;
  s.days = { week: s.week, day: 0, plan: Array(7).fill(null), answers: {}, skipped: [] };
  s.appts = undefined;
  if (s.tribute) s.tribute.acct.personal = 20000;
  return s;
}

/** Book the boss out on `n` evenings (a night at the club). */
function outNights(s: GameState, n: number): void {
  const plan: (string | null)[] = Array(7).fill(null);
  for (let d = 0; d < n; d++) plan[d] = 'fun:club';
  s.days = { week: s.week, day: 0, plan, answers: {}, skipped: [] };
}

/** A woman he saw this week (a dating bond with this week's evening). */
function sawWoman(s: GameState, id: string): void {
  const D = ensureDating(s);
  D.bonds[id] = { id, aff: 50, rung: 'attracted', dates: 1, last: s.week, since: s.week, gifts: [], via: 'test' };
}

function weekOf(s: GameState, out: number, women: string[] = []): void {
  outNights(s, out);
  for (const id of women) sawWoman(s, id);
  wifeWeek(newCtx(s));
  s.week++;
  delete s.days;
}

const fakeWomen = (s: GameState, n: number, tag: string) => Array.from({ length: n }, (_, i) => {
  const id = `woman_${tag}_${i}`;
  s.characters[id] = { ...player(s), id, firstName: `Dot${i}`, gender: 'F', spouseId: undefined, childrenIds: [], dynasty: false, faction: 'none', rank: 'civilian' };
  return id;
});

describe('wife: nights home', () => {
  it('a fresh game carries no wife state, and loading it changes nothing', () => {
    const s = newGame('wife-fresh');
    expect(s.wife).toBeUndefined();
    const before = JSON.stringify(s);
    expect(JSON.stringify(upgradeSave(JSON.parse(before)))).toBe(before);
  });

  it('counts the nights home from the evenings out: rounds, the dating evenings, queued dates', () => {
    const s = married('wife-nights');
    expect(nightsPlan(s).home).toBe(7);
    expect(nightsPlan(s).need).toBe(4);
    outNights(s, 4);
    expect(nightsPlan(s).home).toBe(3);
    expect(nightsPlan(s).short).toBe(1);
    const D = ensureDating(s);
    D.evenings = { week: s.week, n: 2 };
    expect(nightsPlan(s).home).toBe(1);
    const w = wifeHere(s)!;
    expect(nightsPlan(s, [{ kind: 'dating', op: { op: 'paid', id: w.id } }]).home).toBe(0);
    expect(wifeLapses(s).some((l) => l.key === 'wife:nights')).toBe(true);
    expect(readyReview(s).lapses.some((l) => l.key === 'wife:nights')).toBe(true);
  });

  it('an evening with her counts, and so does a late night (half)', () => {
    let s = married('wife-with');
    s.days!.plan![2] = 'fam:wife';
    expect(nightsPlan(s).withHer).toBe(1);
    outNights(s, 5);
    s = setDinner(s, 0, 'late');
    expect(nightsPlan(s).home).toBe(2.5);
  });

  it('saying "I\'ll be home" on a booked night is standing her up, and costs more than an honest "not tonight"', () => {
    const honest = married('wife-stood');
    outNights(honest, 4);
    let liar = structuredClone(honest);
    liar = setDinner(liar, 0, 'home');
    const h = setDinner(honest, 0, 'out');
    expect(nightsPlan(liar).stoodUp).toBe(1);
    expect(nightsPlan(h).stoodUp).toBe(0);
    wifeWeek(newCtx(h));
    wifeWeek(newCtx(liar));
    expect(liar.wife!.susp).toBeGreaterThan(h.wife!.susp);
  });

  it('she asks every day; answered or answered-for-him, she does not ask again', () => {
    let s = married('wife-ask');
    const a = dinnerAsk(s)!;
    expect(a.day).toBe(0);
    expect(a.need).toBe(4);
    s = setDinner(s, 0, 'home');
    expect(dinnerAsk(s)).toBeUndefined();
    s.days!.day = 1;
    expect(dinnerAsk(s)?.day).toBe(1);
    s = setAutoDinner(s, true);
    expect(dinnerAsk(s)).toBeUndefined();
    expect(nightsPlan(s).home).toBe(7);
  });

  it('home four nights keeps the marriage steady; meeting it lowers suspicion', () => {
    const s = married('wife-steady');
    for (let i = 0; i < 10; i++) weekOf(s, 3);
    expect(s.wife!.susp).toBeLessThan(15);
    expect(s.eventQueue.filter((e) => e.defId.startsWith('wife_')).length).toBe(0);
  });
});

describe('wife: suspicion', () => {
  it('rises with nights away and many women, and gives its reasons', () => {
    const s = married('wife-susp');
    const ws = fakeWomen(s, 4, 'a');
    const w0 = 10;
    weekOf(s, 6, ws.slice(0, 2));
    weekOf(s, 6, ws.slice(2, 4));
    expect(s.wife!.susp).toBeGreaterThan(w0 + 25);
    expect(s.wife!.why.some((x) => /women/.test(x.t))).toBe(true);
    expect(s.wife!.why.some((x) => /nights/.test(x.t))).toBe(true);
  });

  it('falls with nights home, gifts and time', () => {
    const s = married('wife-fall');
    ensureWife(s, wifeHere(s)!).susp = 60;
    weekOf(s, 0);
    expect(s.wife!.susp).toBeLessThan(60);
    const before = s.wife!.susp;
    const r = wifeAct(s, 'gift');
    expect(r.ok).toBe(true);
    expect(r.state.wife!.susp).toBeLessThan(before);
    expect((r.state.journal?.e ?? []).some((e) => e.src === 'wife')).toBe(true);
  });

  it('rumors reaching her raise it', () => {
    const s = married('wife-rumor');
    const w = wifeHere(s)!;
    ensureDating(s).rumors.push({ week: s.week, text: 'The boss was seen.', about: s.playerId, heard: [w.id], true: true });
    wifeWeek(newCtx(s));
    expect(s.wife!.why.some((x) => /Talk reached her/.test(x.t))).toBe(true);
    expect(s.wife!.proof).toBe(true);
  });

  it('thresholds bring a scene with choices and odds', () => {
    const s = married('wife-scene');
    ensureWife(s, wifeHere(s)!).susp = 55;
    weekOf(s, 4);
    const e = s.eventQueue.find((x) => x.defId.startsWith('wife_'));
    expect(e).toBeDefined();
    expect(e!.choices.map((c) => c.id)).toEqual(expect.arrayContaining(['deny', 'gift', 'promise', 'confess']));
    expect(e!.choices.find((c) => c.id === 'deny')!.label).toMatch(/\d+%/);
  });
});

describe('wife: she calls his people', () => {
  it('calls his closest people; each answers by his own lights; repeated calls build closeness', () => {
    const s = married('wife-calls');
    const people = peopleSheCalls(s);
    expect(people.length).toBeGreaterThan(0);
    for (const p of people) {
      const o = callOdds(s, s.characters[p.id]);
      expect(o.cover + o.slip).toBeLessThanOrEqual(1);
    }
    const W = ensureWife(s, wifeHere(s)!);
    W.susp = 70;
    for (let i = 0; i < 12; i++) { W.susp = Math.max(W.susp, 70); weekOf(s, 6); }
    expect(s.wife!.calls.length).toBeGreaterThan(0);
    expect(s.wife!.calls.every((c) => /called/.test(c.t))).toBe(true);
    expect(Object.keys(s.wife!.close).length).toBeGreaterThan(0);
  });

  it('a loyal man covers more than one who thinks little of the boss', () => {
    const s = married('wife-loyal');
    const c = capos(s)[0];
    const hi = callOdds(s, c);
    addOpinion(s, c.id, s.playerId, 'test', -80, 0);
    const lo = callOdds(s, c);
    expect(hi.cover).toBeGreaterThan(lo.cover);
    expect(lo.slip).toBeGreaterThan(hi.slip);
  });
});

describe('wife: she steps out, the divorce, the arrangement', () => {
  it('a boss out every night with many women faces real consequences within about ten weeks', () => {
    const s = married('wife-bad');
    const ws = fakeWomen(s, 6, 'b');
    for (let i = 0; i < 10; i++) {
      weekOf(s, 7, [ws[i % 6], ws[(i + 1) % 6], ws[(i + 2) % 6]]);
      s.eventQueue = [];
    }
    expect(s.wife!.susp).toBeGreaterThanOrEqual(80);
    expect(opinion(s, wifeHere(s)!.id, s.playerId)).toBeLessThan(-20);
    expect(s.wife!.bad).toBeGreaterThan(0);
  });

  it('when he is that bad for weeks she may step out; the man she grew close to is the likeliest', () => {
    let found = 0;
    let his = 0;
    for (const seed of ['so-a', 'so-b', 'so-c', 'so-d']) {
      const s = married(`wife-${seed}`);
      const w = wifeHere(s)!;
      addOpinion(s, w.id, s.playerId, 'test', -60, 0);
      const W = ensureWife(s, w);
      const m = capos(s)[0];
      W.close[m.id] = 80;
      for (let i = 0; i < 20 && !s.wife!.her; i++) { s.wife!.susp = 95; s.wife!.close[m.id] = 80; weekOf(s, 7); s.eventQueue = []; }
      if (s.wife!.her) { found++; if (s.wife!.her.man === m.id) his++; }
    }
    expect(found).toBeGreaterThan(0);
    expect(his).toBeGreaterThan(0);
  });

  it('no option anywhere harms her, and no man of his is killed or handed over', () => {
    const s = married('wife-safe');
    const w = wifeHere(s)!;
    const W = ensureWife(s, w);
    W.close[capos(s)[0].id] = 60;
    W.her = { man: capos(s)[0].id, since: s.week, kind: 'his', known: s.week };
    const keys: WifeKey[] = ['deny', 'confess', 'gift', 'promise', 'talk', 'herTalk', 'herDistance', 'herAway', 'herWords', 'herForgive', 'distance', 'away', 'confront'];
    for (const k of keys) {
      const t = structuredClone(s);
      applyWifeOp(newCtx(t), { op: 'wife', k, chance: 0.5, man: capos(t)[0].id, cost: 100 });
      expect(t.characters[w.id].alive).toBe(true);
      expect(t.characters[w.id].health).toBe(s.characters[w.id].health);
      expect(t.characters[capos(s)[0].id].alive).toBe(true);
      expect(t.characters[capos(s)[0].id].faction).toBe('player');
    }
    for (const a of wifeActs(s)) expect(a.label).not.toMatch(/kill|whack|hit |beat|hurt/i);
  });

  it('divorce: the settlement, alimony every week through the ledger, the scandal', () => {
    const s = married('wife-div');
    const w = wifeHere(s)!;
    const respect = s.respect;
    const r = wifeAct(s, 'divorce');
    expect(r.ok).toBe(true);
    const d = r.state;
    expect(player(d).spouseId).toBeUndefined();
    expect(wifeHere(d)).toBeUndefined();
    expect(d.wife!.ali!.length).toBe(1);
    expect(d.respect).toBeLessThan(respect);
    const n = advanceWeek(d, {});
    expect(reconcile(n.report)).toEqual([]);
    expect(JSON.stringify(n.state.tribute)).toContain(`Alimony to ${w.firstName}`);
    expect(n.state.wife!.ali![0].id).toBe(w.id);
    expect(wifeView(n.state)).toBeUndefined();
  });

  it('the arrangement: her allowance through the pocket, no nights required, her asks, and breaking it', () => {
    const s = married('wife-arr');
    applyWifeOp(newCtx(s), { op: 'wife', k: 'termsYes', amount: 150 });
    expect(s.wife!.arr!.allowance).toBe(150);
    expect(nightsPlan(s).need).toBe(0);
    const p0 = s.tribute!.acct.personal;
    weekOf(s, 7);
    expect(s.tribute!.acct.personal).toBe(p0 - 150);
    // She asks for more when it is time.
    s.wife!.arr!.next = s.week;
    weekOf(s, 7);
    expect(s.eventQueue.some((e) => e.defId === 'wife_ask')).toBe(true);
    s.eventQueue = [];
    applyWifeOp(newCtx(s), { op: 'wife', k: 'raiseYes', amount: 50 });
    expect(s.wife!.arr!.allowance).toBe(200);
    // Missed payments break it.
    for (let i = 0; i < 4 && s.wife!.arr; i++) { s.tribute!.acct.personal = 0; weekOf(s, 7); }
    expect(s.wife!.arr).toBeUndefined();
    expect(s.wife!.broken).toBe(1);
    expect(s.wife!.susp).toBeGreaterThanOrEqual(60);
  });

  it('a shop of her own: her money, paid once from the pocket', () => {
    const s = married('wife-shop');
    applyWifeOp(newCtx(s), { op: 'wife', k: 'termsYes', amount: 150 });
    applyWifeOp(newCtx(s), { op: 'wife', k: 'shopYes', shop: 'beauty', cost: 2500 });
    expect(s.wife!.arr!.shop?.kind).toBe('beauty');
    weekOf(s, 7);
    expect(s.wife!.arr!.herMoney).toBeGreaterThan(0);
  });

  it('a full week with the layer on reconciles', () => {
    const s = married('wife-books');
    outNights(s, 6);
    ensureWife(s, wifeHere(s)!).susp = 70;
    const r = advanceWeek(s, {});
    expect(reconcile(r.report)).toEqual([]);
    expect(r.state.wife).toBeDefined();
  });
});

describe('wife: an unmarried boss', () => {
  it('sees nothing and nothing happens', () => {
    const s = married('wife-none');
    s.characters[player(s).spouseId!].alive = false;
    expect(wifeHere(s)).toBeUndefined();
    expect(dinnerAsk(s)).toBeUndefined();
    expect(wifeView(s)).toBeUndefined();
    expect(wifeLapses(s)).toEqual([]);
    wifeWeek(newCtx(s));
    expect(s.wife).toBeUndefined();
  });
});

describe('wife: on the screen', () => {
  it('her card shows the nights, the meter with reasons, her opinion and the acts with odds; the clock asks about dinner', () => {
    const s = married('wife-ui');
    outNights(s, 4);
    ensureWife(s, wifeHere(s)!).susp = 40;
    s.wife!.why.push({ w: s.week, t: 'Home 3 of 4 nights', v: 4 });
    const html = renderToString(createElement(WifeCard, { s }));
    for (const id of ['wife-card', 'wife-nights', 'wife-week', 'wife-susp', 'wife-susp-why', 'wife-opinion', 'wife-acts', 'wife-act-propose', 'wife-auto', 'wife-dinner-6-home']) expect(html).toContain(`data-testid="${id}"`);
    expect(html.replace(/<!-- -->/g, '')).toContain('Nights home this week: 3/4');
    expect(html.replace(/<!-- -->/g, '')).toMatch(/Propose an arrangement \(\d+%\)/);
    const ask = renderToString(createElement(WifeDinnerAsk, { s }));
    expect(ask).toContain('Should I expect you for dinner?');
    for (const id of ['wife-dinner-home', 'wife-dinner-out', 'wife-dinner-late']) expect(ask).toContain(`data-testid="${id}"`);
  });

  it('an unmarried boss sees no card and no question', () => {
    const s = married('wife-ui-none');
    s.characters[player(s).spouseId!].alive = false;
    expect(renderToString(createElement(WifeCard, { s }))).toBe('');
    expect(renderToString(createElement(WifeDinnerAsk, { s }))).toBe('');
  });
});
