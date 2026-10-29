import { describe, expect, it } from 'vitest';
import { playWeeks } from './helpers';
import { inbox, type InboxItem } from '../src/engine/inbox';
import { DESK_CAP, DESK_HARD_MAX, deskQueue, stakesOf } from '../src/engine/attention';
import type { GameState } from '../src/engine/types';

const clone = (s: GameState): GameState => JSON.parse(JSON.stringify(s));

/** A save with a crowded inbox: a played game plus a pile of urgent and ordinary decisions. */
function crowded(seed: string, reds = 0, ambers = 0): GameState {
  const s = clone(playWeeks(seed, 6));
  const tmpl = { title: 'A test', text: 'Something happened.', week: s.week, choices: [{ id: 'a', label: 'Pay', effects: [{ type: 'money', amount: -4000, category: 'event', label: 'x' }] }, { id: 'b', label: 'Refuse', effects: [] }], defaultChoiceId: 'b', priority: 1 } as unknown as GameState['pendingEvents'][number];
  for (let i = 0; i < reds; i++) s.pendingEvents.push({ ...tmpl, iid: `red${i}`, defId: `test_red_${i}`, mandatory: true });
  for (let i = 0; i < ambers; i++) s.pendingEvents.push({ ...tmpl, iid: `amb${i}`, defId: `test_amb_${i}`, mandatory: false });
  return s;
}

describe('attention: the stakes', () => {
  it('the parts sum to the score, and every part has its words', () => {
    const s = crowded('att-sum', 1, 3);
    for (const it of inbox(s)) {
      const st = stakesOf(s, it);
      expect(st.score).toBe(st.parts.reduce((a, p) => a + p.points, 0));
      for (const p of st.parts) expect(p.why.length).toBeGreaterThan(2);
    }
  });
  it('money on the line counts', () => {
    const s = crowded('att-money', 0, 1);
    const it = inbox(s).find((x) => x.ref.event === 'amb0')!;
    const st = stakesOf(s, it);
    expect(st.parts.some((p) => p.part === 'money')).toBe(true);
    expect(st.why.join(' ')).toContain('$4,000');
  });
});

describe('attention: the desk queue', () => {
  it('reds always surface, up to the hard max; the rest fit the cap', () => {
    for (const [r, a] of [[0, 9], [2, 9], [10, 4]] as const) {
      const s = crowded(`att-q-${r}-${a}`, r, a);
      const q = deskQueue(s);
      const all = inbox(s);
      const redN = all.filter((x) => x.tone === 'red').length;
      expect(q.needs.filter((x) => x.tone === 'red').length).toBe(Math.min(redN, DESK_HARD_MAX));
      expect(q.needs.length).toBeLessThanOrEqual(Math.max(DESK_CAP, Math.min(redN, DESK_HARD_MAX)));
      expect(q.overflow).toBe(Math.max(0, redN - DESK_HARD_MAX));
    }
  });
  it('nothing is lost: needs and handled are exactly the inbox', () => {
    const s = crowded('att-all', 2, 8);
    const q = deskQueue(s);
    const keys = (xs: InboxItem[]) => xs.map((x) => x.key).sort();
    expect(keys([...q.needs, ...q.handled.map((h) => h.item)])).toEqual(keys(inbox(s)));
    for (const h of q.handled) { expect(h.by.length).toBeGreaterThan(0); expect(h.does.length).toBeGreaterThan(0); }
  });
  it('taking an item back moves it to Needs you', () => {
    const s = crowded('att-take', 0, 9);
    const q = deskQueue(s);
    const h = q.handled[0];
    expect(h).toBeDefined();
    const q2 = deskQueue(s, { taken: [h.item.key] });
    expect(q2.needs.some((x) => x.key === h.item.key)).toBe(true);
  });
  it('deterministic and pure', () => {
    const s = crowded('att-pure', 1, 6);
    const before = JSON.stringify(s);
    const a = deskQueue(s);
    const b = deskQueue(clone(s));
    expect(JSON.stringify(s)).toBe(before);
    expect(a.needs.map((x) => x.key)).toEqual(b.needs.map((x) => x.key));
    expect(a.handled.map((x) => x.item.key)).toEqual(b.handled.map((x) => x.item.key));
  });
});

describe('the Desk is one list', () => {
  it('the rows of Needs you and Handled are the queue, and the header count is Needs you', async () => {
    const { bossDesk, deskHeaderCount } = await import('../src/engine/desk');
    const s = crowded('att-desk', 1, 7);
    const q = deskQueue(s);
    const g = bossDesk(s);
    const needs = g.find((x) => x.kind === 'needs')!.items.filter((x) => !x.done);
    const handled = g.find((x) => x.kind === 'handled')?.items ?? [];
    expect(needs.map((x) => x.key)).toEqual(q.needs.map((x) => x.key));
    expect(handled.map((x) => x.key)).toEqual(q.handled.map((x) => x.item.key));
    expect(deskHeaderCount(s)).toBe(q.needs.length);
    expect(g[0].kind).toBe('needs');
    for (const h of handled) expect(h.handled?.by).toBeTruthy();
  });
});
