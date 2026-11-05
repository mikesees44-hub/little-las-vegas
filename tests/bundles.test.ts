import '../src/engine/engine';
import { describe, expect, it } from 'vitest';
import { advanceWeek } from '../src/engine/engine';
import { newGame } from '../src/engine/newGame';
import { weekChoices } from '../src/engine/days';
import { bundleAnswers, chosen, deskBundles, handleWeekPlan, settleItems, stillQueued, touchesAMan } from '../src/engine/bundles';
import { capos } from '../src/engine/characters';
import { consiglierePick } from '../src/engine/delegation';
import type { EventInstance, GameState } from '../src/engine/types';

const ev = (s: GameState, n: number, over: Partial<EventInstance> = {}): EventInstance => ({
  iid: `evB${n}`, defId: 'test_small', week: s.week, title: `A small ask ${n}`, text: 'A man wants a favor.', mandatory: false, priority: 30,
  choices: [
    { id: 'yes', label: 'Do him the favor', because: 'did him a favor', effects: [{ type: 'money', amount: -300, label: 'A favor' }] },
    { id: 'no', label: 'Send him away', because: 'sent him away', effects: [{ type: 'respect', amount: -1, label: 'Sent away' }] },
  ],
  defaultChoiceId: 'no', ...over,
} as EventInstance);

function withAsks(seed: string): GameState {
  const s = newGame(seed);
  const cap = capos(s)[0];
  const extra = [ev(s, 1), ev(s, 2), ev(s, 3),
    ev(s, 4, { title: 'Big money', choices: [{ id: 'buy', label: 'Buy it', because: 'bought it', effects: [{ type: 'money', amount: -9000, label: 'x' }] }, { id: 'no', label: 'No', because: 'no', effects: [] }] as EventInstance['choices'] }),
    ...(cap ? [ev(s, 5, { title: 'A capo', choices: [{ id: 'k', label: 'Put him down', because: 'x', effects: [{ type: 'kill', charId: cap.id, cause: 'x', label: 'x' }] }, { id: 'n', label: 'Let it go', because: 'x', effects: [] }] as EventInstance['choices'], defaultChoiceId: 'k' })] : []),
  ];
  return { ...s, pendingEvents: [...s.pendingEvents.filter((e) => e.defId !== 'test_small'), ...extra] };
}

describe('bundled small decisions', () => {
  it('three small asks become one bundle with the consigliere\'s picks, cost and odds; the big ones never bundle', () => {
    const s = withAsks('bundle-a');
    const b = deskBundles(s).find((x) => x.kind === 'asks')!;
    expect(b).toBeTruthy();
    const keys = b.items.map((x) => x.key);
    for (const n of [1, 2, 3]) expect(keys).toContain(`ev:evB${n}`);
    expect(keys).not.toContain('ev:evB4');
    expect(keys).not.toContain('ev:evB5');
    for (const it of b.items) {
      const e = s.pendingEvents.find((x) => `ev:${x.iid}` === it.key)!;
      expect(it.pick).toBe(consiglierePick(s, e)!.choiceId);
      // Every option stays: nothing is removed.
      expect(it.options.map((o) => o.id)).toEqual(e.choices.map((c) => c.id));
    }
    expect(b.cost).toBe(b.items.reduce((a, it) => a + chosen(it)!.cost, 0));
    expect(b.odds).toMatch(/sure thing/);
  });

  it('a per-item override changes that one answer; "skip" leaves it for the boss', () => {
    const s = withAsks('bundle-b');
    const b = deskBundles(s).find((x) => x.kind === 'asks')!;
    const [a, c] = b.items;
    const other = a.options.find((o) => o.id !== a.pick)!.id;
    const out = bundleAnswers(b, { [a.key]: other, [c.key]: 'skip' });
    expect(out.find((x) => x.key === a.key)!.answer).toMatchObject({ kind: 'event', choiceId: other });
    expect(out.some((x) => x.key === c.key)).toBe(false);
    expect(out.length).toBe(b.items.length - 1);
  });

  it('a taken-back item is the boss\'s, never bundled', () => {
    const s = withAsks('bundle-c');
    const b = deskBundles(s, { taken: ['ev:evB1'] }).find((x) => x.kind === 'asks');
    expect(b?.items.some((x) => x.key === 'ev:evB1') ?? false).toBe(false);
  });

  it('answered asks leave the bundle; under two, no bundle', () => {
    const s = withAsks('bundle-d');
    expect(deskBundles(s, { answers: { evB1: 'yes', evB2: 'no' } }).find((x) => x.kind === 'asks')).toBeUndefined();
  });

  it('the bundle\'s answers resolve like any other answer when the week turns (and land in Your File)', () => {
    const s = withAsks('bundle-e');
    const b = deskBundles(s).find((x) => x.kind === 'asks')!;
    const answers: Record<string, string> = {};
    for (const r of bundleAnswers(b)) if (r.answer.kind === 'event') answers[r.answer.iid] = r.answer.choiceId;
    const s1 = advanceWeek(s, weekChoices(s, { choices: answers })).state;
    for (const n of [1, 2, 3]) expect(s1.pendingEvents.some((e) => e.iid === `evB${n}`)).toBe(false);
  });
});

describe('handle the week for me', () => {
  it('settles the routine, leaves a life, a man and real money as "yours to decide"', () => {
    const s = withAsks('hw-a');
    const p = handleWeekPlan(s);
    const set = p.settle.map((r) => r.key);
    for (const n of [1, 2, 3]) expect(set).toContain(`ev:evB${n}`);
    expect(set).not.toContain('ev:evB4');
    expect(p.yours.find((y) => y.key === 'ev:evB4')?.why).toBe('real money');
    if (capos(s)[0]) {
      expect(set).not.toContain('ev:evB5');
      expect(p.yours.some((y) => y.key === 'ev:evB5')).toBe(true);
    }
    // Nothing in the plan kills or hands over one of his men.
    for (const r of p.settle) {
      if (r.answer.kind !== 'event') continue;
      const a = r.answer;
      const e = s.pendingEvents.find((x) => x.iid === a.iid)!;
      expect(touchesAMan(e.choices.find((c) => c.id === a.choiceId)!.effects)).toBe(false);
    }
    expect(p.cost).toBe(p.settle.reduce((a, r) => a + r.cost, 0));
  });

  it('every settled answer is one the item\'s own screen offers, and stays reversible until the week turns', () => {
    const s = withAsks('hw-b');
    const p = handleWeekPlan(s);
    const items = settleItems(s);
    const answers: Record<string, string> = {};
    for (const r of p.settle) {
      const it = items.find((x) => x.key === r.key)!;
      expect(it.options.some((o) => JSON.stringify(o.answer) === JSON.stringify(r.answer))).toBe(true);
      if (r.answer.kind === 'event') answers[r.answer.iid] = r.answer.choiceId;
    }
    const ev1 = p.settle.find((r) => r.key === 'ev:evB1')!;
    expect(stillQueued(s, ev1.answer, { answers })).toBe(true);
    expect(stillQueued(s, ev1.answer, {})).toBe(false);
  });

  it('a Hands-on boss lets less money go without him', () => {
    const s = withAsks('hw-c');
    const lim = handleWeekPlan(s).settle.reduce((a, r) => Math.max(a, r.cost), 0);
    expect(lim).toBeLessThanOrEqual(2500);
  });

  it('pure: the plan never writes to the state', () => {
    const s = withAsks('hw-d');
    const before = JSON.stringify(s);
    handleWeekPlan(s);
    deskBundles(s);
    expect(JSON.stringify(s)).toBe(before);
  });
});
