import '../src/engine/engine';
import { describe, expect, it, beforeEach } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { newGameWith } from '../src/engine/starts';
import { advanceWeek } from '../src/engine/engine';
import { previewAction } from '../src/engine/actions';
import { crewBoard } from '../src/engine/crewBoard';
import { moneyView } from '../src/engine/money';
import { addOpinion } from '../src/engine/relations';
import { expectedNet, faceMark, fixGroups, GRUDGE, harmful, moneyStrip, repeatLastWeek, safeFix } from '../src/engine/fastFix';
import type { GameState, PlayerAction } from '../src/engine/types';
import { movePin, pinnedOrders, resetPins, togglePinOrder } from '../src/ui/plans/pins';
import { lastWeekOrders, rememberWeekOrders, resetLastWeek } from '../src/ui/plans/lastWeek';
import { PinTray, pinView } from '../src/ui/shell/PinTray';
import { SameAsLastWeek } from '../src/ui/desk/SameAsLastWeek';
import { MoneyStrip } from '../src/ui/desk/MoneyStrip';
import { BossDesk } from '../src/ui/desk/BossDesk';
import { dialogKey, digitsOwned } from '../src/ui/keys';
import { speedKey } from '../src/ui/clockPolicy';
import { FixChip, FixChips, fixAllRows } from '../src/ui/shell/FixChips';
import { EarnChip } from '../src/ui/shell/EarnChip';
import { Face } from '../src/ui/components/People';

const store = new Map<string, string>();
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); },
};

const weeks = (s: GameState, n: number) => { for (let i = 0; i < n; i++) s = advanceWeek(s, {}).state; return s; };
const myMan = (s: GameState, rank = 'soldier') => Object.values(s.characters).find((c) => c.alive && c.faction === 'player' && c.id !== s.playerId && c.rank === rank && !c.imprisonedUntil)!;
const api = { onEvent: () => {}, onDay: () => {}, onSitDown: () => {}, onCancelOrder: () => {}, onMoney: () => {}, onChar: () => {} };

describe('fast7: pins you can drag', () => {
  beforeEach(() => { store.clear(); resetPins(); });
  it('pins persist per game and reorder (drag or arrows), and the tray shows them', () => {
    const s = newGameWith('f7-pins', 'olddon');
    const a: PlayerAction = { kind: 'order', key: 'shakedown', via: 'direct' };
    const b: PlayerAction = { kind: 'mymen', op: { op: 'score', id: myMan(s).id } } as PlayerAction;
    const c: PlayerAction = { kind: 'order', key: 'cops', via: 'direct' };
    for (const x of [a, b, c]) togglePinOrder(s.seed, x);
    expect(pinnedOrders(s.seed)).toEqual([a, b, c]);
    movePin(s.seed, 2, 0);
    movePin(s.seed, 1, 99);
    resetPins();
    expect(pinnedOrders(s.seed)).toEqual([c, b, a]);
    expect(pinnedOrders('another-game')).toEqual([]);
    const html = renderToString(createElement(PinTray, { s }));
    expect(html.match(/data-testid="pin-chip"/g)?.length).toBe(3);
    expect(html).toContain('draggable');
    const v = pinView(s, a);
    expect(v.title).toBe(previewAction(s, a).title);
  });
  it('no pins, no tray', () => {
    const s = newGameWith('f7-pins2', 'olddon');
    expect(renderToString(createElement(PinTray, { s }))).toBe('');
  });
});

describe('fast7: same as last week', () => {
  beforeEach(() => { store.clear(); resetLastWeek(); });
  it('re-queues only valid, repeatable, harmless orders; the rest say why', () => {
    const s = weeks(newGameWith('f7-same', 'olddon'), 1);
    const man = myMan(s);
    const score: PlayerAction = { kind: 'mymen', op: { op: 'score', id: man.id } } as PlayerAction;
    const kill: PlayerAction = { kind: 'mymen', op: { op: 'kill', id: man.id, confirm: false } } as PlayerAction;
    const whack: PlayerAction = { kind: 'interact', id: 'whack', targetId: man.id } as unknown as PlayerAction;
    const buy: PlayerAction = { kind: 'buyBusiness', biz: 'pizza', district: s.districts[0].id } as PlayerAction;
    const gone: PlayerAction = { kind: 'mymen', op: { op: 'score', id: 'nobody' } } as PlayerAction;
    const rows = repeatLastWeek(s, [score, kill, whack, buy, gone, score]);
    expect(rows.length).toBe(5);
    const ok = rows.filter((r) => r.ok);
    for (const r of ok) {
      expect(previewAction(s, r.action).disabledReason).toBeUndefined();
      expect(harmful(s, r.action)).toBe(false);
    }
    expect(rows.find((r) => r.action === kill || JSON.stringify(r.action) === JSON.stringify(kill))!.ok).toBe(false);
    expect(rows[2].ok).toBe(false);
    expect(rows[3].ok).toBe(false);
    expect(rows[3].why).toMatch(/one-time/i);
    expect(rows[4].ok).toBe(false);
    if (!previewAction(s, score).disabledReason) expect(rows[0].ok).toBe(true);
    // Already queued: not twice.
    expect(repeatLastWeek(s, [score], [score])[0].ok).toBe(false);
  });
  it('remembers the week and shows the list first', () => {
    const s = weeks(newGameWith('f7-same2', 'olddon'), 1);
    const score: PlayerAction = { kind: 'mymen', op: { op: 'score', id: myMan(s).id } } as PlayerAction;
    expect(renderToString(createElement(SameAsLastWeek, { s }))).toBe('');
    rememberWeekOrders(s.seed, s.week - 1, [{ ...score, fund: 'family' } as PlayerAction]);
    expect(lastWeekOrders(s.seed)!.orders[0]).toEqual(score);
    const html = renderToString(createElement(SameAsLastWeek, { s, initialOpen: true }));
    expect(html).toContain('same-last-week');
    expect(html).toContain('same-list');
    expect(html).toContain('same-row');
    // The same week is not "last week".
    rememberWeekOrders(s.seed, s.week, [score]);
    expect(renderToString(createElement(SameAsLastWeek, { s }))).toBe('');
  });
});

describe('fast7: money first on the Desk', () => {
  it('the strip matches the books and every fix is a real order', () => {
    const s = weeks(newGameWith('f7-money', 'olddon'), 3);
    const m = moneyStrip(s);
    expect(m.lastNet).toBe(moneyView(s, true).net);
    expect(m.expected).toBe(expectedNet(s));
    expect(m.drains.length).toBeLessThanOrEqual(3);
    for (const d of m.drains) {
      expect(d.action || d.route).toBeTruthy();
      if (d.action) expect(previewAction(s, d.action).disabledReason).toBeUndefined();
    }
    if (m.top) expect(m.top.name).toBe(moneyView(s, true).top[0].name);
    const html = renderToString(createElement(MoneyStrip, { s }));
    expect(html).toContain('desk-money-strip');
    expect(renderToString(createElement(BossDesk, { s, ui: {}, api }))).toContain('desk-money-strip');
  });
});

describe('fast7: quick filters', () => {
  it('Money / Men / Women / Rivals / Law chips are always there, the old test ids kept, and filter', () => {
    const s = weeks(newGameWith('f7-filter', 'olddon'), 1);
    const html = renderToString(createElement(BossDesk, { s, ui: {}, api }));
    for (const h of ['money', 'org', 'house', 'rivals', 'law']) expect(html).toContain(`data-testid="desk-dom-${h}"`);
    for (const w of ['Money', 'Men', 'Women', 'Rivals', 'Law']) expect(html).toContain(w);
    expect(html).toContain('desk-filter-all');
  });
});

describe('fast7: dialog keys', () => {
  const ev = (key: string, target: unknown = { tagName: 'BODY' }) => ({ key, target: target as EventTarget, metaKey: false, ctrlKey: false, altKey: false, repeat: false, defaultPrevented: false });
  it('1-9 pick, Enter confirms, typing and focused buttons keep their keys', () => {
    expect(dialogKey(ev('1'), 3)).toEqual({ pick: 0 });
    expect(dialogKey(ev('3'), 3)).toEqual({ pick: 2 });
    expect(dialogKey(ev('4'), 3)).toBeUndefined();
    expect(dialogKey(ev('Enter'), 0)).toBe('confirm');
    expect(dialogKey(ev('Enter', { tagName: 'BUTTON' }), 2)).toBeUndefined();
    expect(dialogKey(ev('1', { tagName: 'INPUT', type: 'text' }), 3)).toBeUndefined();
    expect(dialogKey({ ...ev('2'), repeat: true }, 3)).toBeUndefined();
  });
  it('the clock keeps 1-5 when no dialog is open', () => {
    expect(digitsOwned()).toBe(false);
    expect(speedKey('3', digitsOwned())).toBe(3);
    expect(speedKey('3', true)).toBeUndefined();
  });
});

describe('fast7: fix chips', () => {
  it("every fix is a valid order, Fix all only takes safe ones, and nothing ever harms one of the boss's men", () => {
    let s = newGameWith('f7-fix', 'olddon');
    const capo = myMan(s, 'capo') ?? myMan(s);
    addOpinion(s, capo.id, s.playerId, 'Passed over', -60, 0);
    s = weeks(s, 4);
    const groups = fixGroups(s);
    const grudges = groups.find((g) => g.kind === 'grudges');
    if (crewBoard(s).rows.some((r) => r.c.id === capo.id)) expect(grudges?.rows.some((r) => r.key === `grudge:${capo.id}`)).toBe(true);
    for (const g of groups) {
      expect(g.rows.length).toBeGreaterThan(0);
      for (const r of g.rows) {
        expect(r.why).toBeTruthy();
        if (r.action) {
          expect(previewAction(s, r.action).disabledReason).toBeUndefined();
          expect(harmful(s, r.action), `${g.kind} ${r.fix} ${JSON.stringify(r.action)} ${JSON.stringify(previewAction(s, r.action).effects.map((e) => e.type))}`).toBe(false);
        }
      }
      for (const r of fixAllRows(g, [])) expect(r.evening !== undefined || safeFix(s, r.action!)).toBe(true);
      const html = renderToString(createElement(FixChip, { g, initialOpen: true }));
      expect(html).toContain(g.kind === 'earn' ? 'earn-pop' : `fix-pop-${g.kind}`);
    }
    const all = renderToString(createElement(FixChips, { s }));
    if (groups.length) { expect(all).toContain('fix-chips'); expect(all).toContain('fix-menu'); } else expect(all).toBe('');
  });
  it('harmful orders are never safe', () => {
    const s = newGameWith('f7-harm', 'olddon');
    const man = myMan(s);
    for (const a of [{ kind: 'mymen', op: { op: 'kill', id: man.id, confirm: false } }, { kind: 'mymen', op: { op: 'demote', id: man.id } }, { kind: 'scheme', scheme: 'murder', targetId: man.id }] as unknown as PlayerAction[]) {
      expect(harmful(s, a)).toBe(true);
      expect(safeFix(s, a)).toBe(false);
    }
  });
  it('the earn chip still renders with its count', () => {
    const s = newGameWith('chip-1', 'olddon');
    const n = crewBoard(s).rows.filter((r) => (r.status === 'needs' || r.status === 'starving') && r.assign).length;
    const html = renderToString(createElement(EarnChip, { s }));
    if (n) expect(html).toContain('not earning'); else expect(html).toBe('');
  });
});

describe('fast7: hot or cold on faces', () => {
  it('green earning, amber idle, red broke or a grudge, nothing for others', () => {
    let s = newGameWith('f7-face', 'olddon');
    const man = myMan(s);
    addOpinion(s, man.id, s.playerId, 'An insult', GRUDGE - 20, 0);
    s = weeks(s, 1);
    for (const r of crewBoard(s).rows) {
      const m = faceMark(s, r.c.id);
      if (!m) { expect(r.status).toBe('away'); continue; }
      expect(m.why).toBeTruthy();
      if (m.tone === 'amber') expect(['needs', 'starving']).toContain(r.status);
      if (m.tone === 'green') expect(['earning', 'own', 'over']).toContain(r.status);
    }
    if (crewBoard(s).rows.some((r) => r.c.id === man.id && r.status !== 'away')) expect(faceMark(s, man.id)?.tone).toBe('red');
    expect(faceMark(s, s.playerId)).toBeUndefined();
    const someone = crewBoard(s).rows.find((r) => faceMark(s, r.c.id))!;
    const html = renderToString(createElement(Face, { s, c: someone.c, size: 48 }));
    expect(html).toContain('data-testid="face-mark"');
    const rival = Object.values(s.characters).find((c) => c.alive && c.faction !== 'player')!;
    expect(renderToString(createElement(Face, { s, c: rival, size: 48 }))).not.toContain('face-mark');
  });
});
