import { eventsOut } from '../src/engine/eventDays';
import { describe, expect, it, beforeEach } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { playWeeks } from './helpers';
import { officeBriefing, officeVisitors } from '../src/engine/bossOffice';
import { inbox, inboxCount } from '../src/engine/inbox';
import { deskCount } from '../src/engine/attention';
import { compareChoices } from '../src/engine/advice';
import { ensureThreats } from '../src/engine/threats';
import type { GameState, PlayerAction, Scheme } from '../src/engine/types';
import { plansInMotion, plansCount } from '../src/ui/plans/plans';
import { markOrder } from '../src/ui/plans/orderMarks';
import { underbossSuggests, candidates } from '../src/ui/plans/suggest';
import { emptyFeed, happenings, ingest, nextToast, TOAST_GAP_MS, type Happening } from '../src/ui/plans/happenings';
import { entriesByGoal, goalOfAction, mainRisk, GOALS } from '../src/ui/plans/actionGoals';
import { ACTION_ENTRIES } from '../src/ui/shell/actionEntries';
import { numberKey } from '../src/ui/keys';
import { resetPins, togglePinOrder, pinnedOrders, isPinnedOrder } from '../src/ui/plans/pins';
import { sameOrder } from '../src/ui/verbs';

const clone = (s: GameState): GameState => JSON.parse(JSON.stringify(s));

function withScheme(s: GameState, over: Partial<Scheme> = {}): GameState {
  const x = clone(s);
  const agent = Object.values(x.characters).find((c) => c.alive && c.faction === 'player' && c.rank === 'soldier')!;
  const target = Object.values(x.characters).find((c) => c.alive && c.faction !== 'player' && c.rank === 'capo')!;
  x.schemes.push({ id: 'sc-test', kind: 'murder', owner: 'player', ownerId: x.playerId, targetId: target.id, agents: [agent.id], opts: { depth: 'planned' }, progress: 40, startWeek: x.week - 2, discovered: false, because: '', ...over });
  return x;
}

describe('plans in motion: the aggregator', () => {
  const s = playWeeks('plans-agg', 10);

  it('groups everything under way; every row says what, when, a status and has an action', () => {
    const groups = plansInMotion(s, { orders: [] });
    expect(groups.length).toBeGreaterThan(0);
    for (const g of groups) {
      expect(g.rows.length, g.id).toBeGreaterThan(0);
      for (const r of g.rows) {
        expect(r.what.length, r.key).toBeGreaterThan(2);
        expect(typeof r.when, r.key).toBe('string');
        if (r.progress !== undefined) { expect(r.progress).toBeGreaterThanOrEqual(0); expect(r.progress).toBeLessThanOrEqual(100); }
      }
    }
    // Keys are unique (React rows, and the "same thing never twice").
    const keys = groups.flatMap((g) => g.rows.map((r) => r.key));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('your orders: each with cancel; a "Do it tomorrow" order says its day and offers "Do it today"', () => {
    const lend: PlayerAction = { kind: 'lend', amount: 1000 };
    const later: PlayerAction = { kind: 'officeHours' };
    markOrder(later, { booked: 3, hours: 2 });
    const g = plansInMotion(s, { orders: [lend, later] }).find((x) => x.id === 'orders')!;
    expect(g.rows).toHaveLength(2);
    const r0 = g.rows.find((r) => r.key === 'or:0')!;
    const r1 = g.rows.find((r) => r.key === 'or:1')!;
    expect(r0.acts.find((a) => a.id === 'cancel')!.do).toEqual({ to: 'cancelOrder', index: 0 });
    expect(r1.when).toMatch(/Thursday/);
    expect(r1.acts.some((a) => a.id === 'speed' && a.do.to === 'today')).toBe(true);
    expect(r0.acts.some((a) => a.id === 'speed')).toBe(false);
  });

  it('a scheme: progress, odds, who is on it, and "Call it off" queues the real cancel order', () => {
    const x = withScheme(s);
    const row = plansInMotion(x, { orders: [] }).find((g) => g.id === 'schemes')!.rows.find((r) => r.key === 'sc:sc-test')!;
    expect(row.progress).toBe(40);
    expect(row.status).toMatch(/40% along/);
    expect(row.who).toBeTruthy();
    const cancel = row.acts.find((a) => a.id === 'cancel')!;
    expect(cancel.do).toEqual({ to: 'queue', action: { kind: 'cancelScheme', schemeId: 'sc-test' } });
    // Already ordered off: the button says so and is disabled.
    const again = plansInMotion(x, { orders: [{ kind: 'cancelScheme', schemeId: 'sc-test' }] }).find((g) => g.id === 'schemes')!.rows[0].acts.find((a) => a.id === 'cancel')!;
    expect(again.disabled).toBeTruthy();
  });

  it('threats: a plot against you uncovered, and rivals\' moves', () => {
    const x = withScheme(s, { id: 'rs-test', owner: s.rivals[0].id as Scheme['owner'], targetId: s.playerId, discovered: true, progress: 70 });
    x.rivals[1].lastMove = { week: x.week, move: 'strike', target: 'player', text: 'shot up the windows of your bar' };
    const groups = plansInMotion(x, { orders: [] });
    expect(groups.find((g) => g.id === 'threats')!.rows.some((r) => r.key === 'rs:rs-test' && r.tone === 'bad')).toBe(true);
    expect(groups.find((g) => g.id === 'rivals')!.rows.some((r) => r.what.includes('shot up the windows') && r.tone === 'bad')).toBe(true);
    expect(plansCount(groups).danger).toBe(true);
  });

  it('heat over 40 shows up under the law, with where to go', () => {
    const x = clone(s);
    x.heat.local = 75;
    const row = plansInMotion(x, { orders: [] }).find((g) => g.id === 'law')!.rows.find((r) => r.key === 'heat:local')!;
    expect(row.tone).toBe('bad');
    expect(row.acts.some((a) => a.do.to === 'route')).toBe(true);
  });

  it('the count: the inbox counts on its own (as Waiting on you), the rest is "in motion"', () => {
    const groups = plansInMotion(s, { orders: [{ kind: 'lend', amount: 1000 }] });
    const c = plansCount(groups);
    expect(c.inbox).toBe(inboxCount(s));
    expect(c.motion).toBe(groups.filter((g) => g.id !== 'inbox').reduce((a, g) => a + g.rows.length, 0));
  });
});

describe('one inbox, one count', () => {
  it('the top bar, the desk, the door and the underboss say the same number', () => {
    for (const seed of ['inbox-a', 'inbox-b']) {
      const s = playWeeks(seed, 6);
      const n = inboxCount(s);
      // The count the boss sees is the Desk's Needs you (attention.ts), built on the inbox.
      expect(officeBriefing(s).needs).toBe(deskCount(s));
      expect(deskCount(s)).toBeLessThanOrEqual(n);
      // Every visitor at the door is in the inbox.
      const keys = new Set(inbox(s).map((i) => i.key));
      for (const v of officeVisitors(s)) expect(keys.has(v.key), v.key).toBe(true);
      // Every unanswered decision that is out (daily.ts: a decision comes out on its day) is in it (the envelope as one item).
      for (const e of eventsOut(s).filter((x) => x.defId !== 'tribute_audience')) expect(keys.has(`ev:${e.iid}`), e.title).toBe(true);
      for (const e of s.pendingEvents.filter((x) => !eventsOut(s).includes(x))) expect(keys.has(`ev:${e.iid}`), e.title).toBe(false);
      // Answering one takes one off everywhere.
      const e = eventsOut(s).find((x) => x.defId !== 'tribute_audience');
      if (e) {
        const answers = { [e.iid]: e.choices[0].id };
        expect(inboxCount(s, { answers })).toBe(n - 1);
        expect(officeBriefing(s, { answers }).needs).toBe(deskCount(s, { answers }));
      }
    }
  });

  it('an urgent meeting is in the inbox, red, first', () => {
    const s = clone(playWeeks('inbox-urgent', 6));
    const T = ensureThreats(s);
    T.tips.push({ id: 'tip-x', kind: 'hit', by: s.rivals[0].id, sourceId: 'nobody', sourceKind: 'street', sourceName: 'A bartender', sourceRole: 'Bartender', week: s.week, deadline: s.week + 1, truth: 'solid', hint: 'Somebody is asking where you eat.', detail: '', status: 'waiting' });
    const items = inbox(s);
    expect(items[0].key).toBe('tip:tip-x');
    expect(items[0].tone).toBe('red');
  });
});

describe('what the underboss would do: his opinion, not the answer', () => {
  const s = playWeeks('a1', 12);

  it('at most three picks, each in his own words, each a real order he backs, none already given', () => {
    const sug = underbossSuggests(s);
    expect(sug.picks.length).toBeLessThanOrEqual(3);
    expect(sug.speaker).toBeDefined();
    expect(sug.picks.length).toBeGreaterThan(0);
    // An empty table says so, in his name.
    const quiet = underbossSuggests(playWeeks('plans-suggest', 12));
    if (!quiet.picks.length) expect(quiet.empty).toMatch(/sit tight|Nobody/);
    for (const p of sug.picks) {
      expect(p.says.length).toBeGreaterThan(5);
      expect(['Do it', 'Do it, but…']).toContain(p.verdict);
      expect(p.hours.length).toBeGreaterThan(0);
      expect(p.label).not.toMatch(/best value/i);
    }
    // Deterministic.
    expect(underbossSuggests(s).picks.map((p) => p.key)).toEqual(sug.picks.map((p) => p.key));
    // Give his first pick: it is not suggested again.
    if (sug.picks[0]) {
      const after = underbossSuggests(s, { orders: [sug.picks[0].action] });
      expect(after.picks.some((p) => sameOrder(p.action, sug.picks[0].action))).toBe(false);
    }
  });

  it('candidates come from the table (sit-down options, opportunities) and are all orders that can be given', () => {
    for (const c of candidates(s)) expect(c.action.kind).toBeTruthy();
  });

  it('no decision carries a printed "Best value" answer', () => {
    for (const ev of s.pendingEvents) for (const a of compareChoices(s, ev.choices)) expect(a.tags).not.toContain('Best value');
  });
});

describe('live alerts: what just happened, without spam', () => {
  const s = playWeeks('plans-hap', 8);

  it('a rival striking at you is a danger that stops the clock; elsewhere it is news', () => {
    const x = clone(s);
    x.rivals[0].lastMove = { week: x.week, move: 'strike', target: 'player', text: 'torched your cigar store' };
    x.rivals[1].lastMove = { week: x.week, move: 'expand', target: 'district', text: 'opened a book on Pacific' };
    const hs = happenings(s, x);
    const mine = hs.find((h) => h.text.includes('torched'))!;
    expect(mine.severity).toBe('danger');
    expect(mine.interrupt).toBe(true);
    expect(hs.find((h) => h.text.includes('opened a book'))!.severity).toBe('info');
    // A different game (a load) says nothing.
    expect(happenings(s, { ...x, seed: 'other' })).toEqual([]);
  });

  it('a scheme of yours blown, a plot uncovered, the cops, a birth', () => {
    const a = withScheme(s);
    const b = clone(a);
    b.schemes.find((x) => x.id === 'sc-test')!.discovered = true;
    b.heat.local = 85;
    expect(happenings(a, b).map((h) => h.kind)).toEqual(expect.arrayContaining(['scheme', 'cops']));
    const c = clone(a);
    c.schemes = c.schemes.filter((x) => x.id !== 'sc-test');
    expect(happenings(a, c).some((h) => h.kind === 'scheme' && /ended|done/.test(h.text))).toBe(true);
  });

  it('never the same thing twice; one toast at a time with a gap; quiet keeps small news out', () => {
    const h = (key: string, severity: Happening['severity']): Happening => ({ key, kind: 'rival', severity, text: key, week: 1 });
    let f = ingest(emptyFeed(), [h('a', 'danger'), h('b', 'info'), h('c', 'good')], false);
    f = ingest(f, [h('a', 'danger')], false);
    expect(f.feed.map((x) => x.key).sort()).toEqual(['a', 'b', 'c']);
    expect(f.queue.map((x) => x.key)).toEqual(['a', 'c']);
    const t1 = nextToast(f, 10_000);
    expect(t1.toast?.key).toBe('a');
    expect(nextToast(t1.f, 10_000 + TOAST_GAP_MS - 1).toast).toBeUndefined();
    expect(nextToast(t1.f, 10_000 + TOAST_GAP_MS).toast?.key).toBe('c');
    const q = ingest(emptyFeed(), [h('x', 'info'), h('y', 'good'), h('z', 'warn')], true);
    expect(q.feed.map((x) => x.key)).not.toContain('x');
    expect(q.queue.map((x) => x.key)).toEqual(['z']);
  });
});

describe('easier options', () => {
  beforeEach(() => resetPins());

  it('every thing to do sits under one of the five goals, and each goal has some', () => {
    const by = entriesByGoal();
    expect(Object.values(by).reduce((a, x) => a + x.length, 0)).toBe(ACTION_ENTRIES.length);
    for (const g of GOALS) expect(by[g.id].length, g.id).toBeGreaterThan(0);
    expect(goalOfAction({ kind: 'lend', amount: 1000 })).toBe('money');
    expect(goalOfAction({ kind: 'dynasty', op: { type: 'x' } as never })).toBe('family');
  });

  it('the main risk chip reads the preview: heat, the odds, a soured man', () => {
    expect(mainRisk({ title: '', effects: [{ type: 'heat', bar: 'local', amount: 6 }], cost: 0, because: '', category: 'street' })).toBe('+6 local heat');
    expect(mainRisk({ title: '', effects: [], cost: 0, because: '', category: 'street', odds: { chance: 0.3, reasons: [] } as never })).toBe('70% it fails');
    expect(mainRisk({ title: '', effects: [], cost: 0, because: '', category: 'street' })).toBeUndefined();
  });

  it('pins: an order pinned per game, unpinned again', () => {
    const a: PlayerAction = { kind: 'lend', amount: 2500 };
    togglePinOrder('g1', a);
    expect(isPinnedOrder('g1', a)).toBe(true);
    expect(pinnedOrders('g2')).toEqual([]);
    togglePinOrder('g1', a);
    expect(isPinnedOrder('g1', a)).toBe(false);
  });

  it('number keys 1-9 pick a choice', () => {
    expect(numberKey('1')).toBe(0);
    expect(numberKey('9')).toBe(8);
    expect(numberKey('0')).toBeUndefined();
    expect(numberKey('a')).toBeUndefined();
  });

  it('the panel and the Find front page render', async () => {
    const s = withScheme(playWeeks('plans-ui', 6));
    const { PlansPanel } = await import('../src/ui/plans/PlansPanel');
    const html = renderToString(createElement(PlansPanel, { s, onClose: () => {} }));
    expect(html).toContain('data-testid="plans-panel"');
    expect(html).toContain('data-testid="plan-group-schemes"');
    expect(html).toContain('data-testid="plan-bar"');
    expect(html).toContain('data-testid="underboss-suggests"');
    expect(html).not.toMatch(/best value|do what they recommend/i);
    const { FindPalette } = await import('../src/ui/shell/Find');
    const f = renderToString(createElement(FindPalette, { s, onPick: () => {}, onClose: () => {} }));
    expect(f).toContain('data-testid="goal-menu"');
    for (const g of GOALS) expect(f).toContain(`data-testid="goal-tab-${g.id}"`);
  }, 60_000);
});
