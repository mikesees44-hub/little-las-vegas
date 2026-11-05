import '../src/engine/engine';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { advanceWeek } from '../src/engine/engine';
import { newGame } from '../src/engine/newGame';
import { weekChoices } from '../src/engine/days';
import { deskBundles, handleWeekPlan, pitchPick, settleItems, stillQueued } from '../src/engine/bundles';
import { eaters, ensureEat } from '../src/engine/eat';
import { BossDesk, ReadyToAdvance } from '../src/ui/desk/BossDesk';
import type { EventInstance, GameState, PlayerAction } from '../src/engine/types';

const ev = (s: GameState, n: number): EventInstance => ({
  iid: `evH${n}`, defId: 'test_small', week: s.week, title: `A small ask ${n}`, text: 'A man wants a favor.', mandatory: false, priority: 30,
  choices: [
    { id: 'yes', label: 'Do him the favor', because: 'x', effects: [{ type: 'money', amount: -200, label: 'A favor' }] },
    { id: 'no', label: 'Send him away', because: 'x', effects: [] },
  ],
  defaultChoiceId: 'no',
} as EventInstance);

function withPitches(seed: string): GameState {
  const s = structuredClone(newGame(seed));
  const men = eaters(s).filter((c) => c.rank !== 'capo').slice(0, 2);
  const e = ensureEat(s);
  men.forEach((c, i) => e.pitches.push({ id: `pz${i}`, by: c.id, kind: 'game', text: 'A card game behind the bakery.', what: 'the card game', stake: 300, ret: 1, week: s.week, due: s.week + 3 }));
  return s;
}

const api = { onEvent: () => {}, onDay: () => {}, onSitDown: () => {}, onCancelOrder: () => {}, onMoney: () => {}, onChar: () => {} };

describe('pitches bundle (Let them eat)', () => {
  it('two pitches bundle; the pick is one of the pitch\'s own answers, given as its order', () => {
    const s = withPitches('pitch-b');
    if (eaters(s).filter((c) => c.rank !== 'capo').length < 2) return;
    const b = deskBundles(s, {}, ['pitches'])[0];
    expect(b?.items.length).toBe(2);
    for (const it of b.items) {
      const pid = it.key.slice('pitch:'.length);
      expect(it.pick).toBe(pitchPick(s, pid));
      const o = it.options.find((x) => x.id === it.pick)!;
      expect(o.answer.kind).toBe('order');
      // Every answer of the pitch is still there.
      expect(it.options.map((x) => x.id)).toContain('no');
    }
    // An order already given takes it out of the bundle.
    const a = b.items[0].options.find((x) => x.id === b.items[0].pick)!.answer as { kind: 'order'; action: PlayerAction };
    expect(deskBundles(s, { orders: [a.action] }, ['pitches']).length).toBe(0);
    expect(stillQueued(s, a, { orders: [a.action] })).toBe(true);
  });

  it('handled pitches are carried out when the week turns, like the single answer', () => {
    const s = withPitches('pitch-c');
    if (eaters(s).filter((c) => c.rank !== 'capo').length < 2) return;
    const p = handleWeekPlan(s);
    const orders = p.settle.filter((r) => r.kind === 'pitches').map((r) => (r.answer as { action: PlayerAction }).action);
    expect(orders.length).toBe(2);
    const s1 = advanceWeek(s, weekChoices(s, { actions: orders })).state;
    expect((s1.eat?.pitches ?? []).filter((x) => x.id.startsWith('pz')).length).toBe(0);
  });
});

describe('the Desk and the review show the bundles and the one button', () => {
  it('the Desk folds same-kind small asks into one card and offers "Handle the week for me"', () => {
    const s0 = newGame('hw-ui');
    const s = { ...s0, pendingEvents: [...s0.pendingEvents, ev(s0, 1), ev(s0, 2), ev(s0, 3)] };
    const out = renderToString(createElement(BossDesk, { s, ui: {}, api: { ...api, onSettle: () => {}, onHandleWeek: () => {} } }));
    expect(out).toContain('data-testid="desk-bundle-asks"');
    expect(out).toContain('data-testid="desk-bundle-settle"');
    expect(out).toContain('data-testid="desk-bundle-override"');
    expect(out).toContain('data-testid="desk-handle-week"');
    expect(out.replace(/<!-- -->/g, '')).toMatch(/Settle all \d+ the consigliere(&#x27;|')s way/);
    // Without the callbacks (an older caller) the Desk is as it was.
    const plain = renderToString(createElement(BossDesk, { s, ui: {}, api }));
    expect(plain).not.toContain('desk-bundle-asks');
    expect(plain).not.toContain('desk-handle-week');
  });

  it('after "Handle the week": one list, Take it back on what is still queued, and what stays yours', () => {
    const s0 = newGame('hw-ui2');
    const s = { ...s0, pendingEvents: [...s0.pendingEvents, ev(s0, 1), ev(s0, 2)] };
    const p = handleWeekPlan(s);
    const answers: Record<string, string> = {};
    for (const r of p.settle) if (r.answer.kind === 'event') answers[r.answer.iid] = r.answer.choiceId;
    const weekDone = { week: s.week, rows: p.settle, yours: [...p.yours, { key: 'ev:x', title: 'A big one', why: 'real money' }], cost: p.cost, odds: p.odds };
    const out = renderToString(createElement(BossDesk, { s, ui: { answers }, api: { ...api, onSettle: () => {}, onHandleWeek: () => {}, weekDone, onUndo: () => {} } }));
    expect(out).toContain('data-testid="week-done"');
    expect(out).toContain('data-testid="week-done-undo"');
    expect(out).toContain('data-testid="week-done-yours"');
    const rv = renderToString(createElement(ReadyToAdvance, { s, ui: {}, onReview: () => {}, onAdvance: () => {}, onClose: () => {}, onHandleWeek: () => {} }));
    expect(rv).toContain('data-testid="ready-handle-week"');
  });

  it('items it settles all come from the same list the Desk shows (settleItems)', () => {
    const s0 = newGame('hw-ui3');
    const s = { ...s0, pendingEvents: [...s0.pendingEvents, ev(s0, 1)] };
    const keys = new Set(settleItems(s).map((x) => x.key));
    for (const r of handleWeekPlan(s).settle) expect(keys.has(r.key)).toBe(true);
  });
});
