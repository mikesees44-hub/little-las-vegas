import '../src/engine/engine';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { newGameWith } from '../src/engine/starts';
import { advanceWeek } from '../src/engine/engine';
import { reconcile } from '../src/engine/ledger';
import { previewAction } from '../src/engine/actions';
import { crewBoard } from '../src/engine/crewBoard';
import { ownScoresOn } from '../src/engine/eat';
import type { GameState, PlayerAction } from '../src/engine/types';
import { CrewBoard } from '../src/ui/borgata/CrewBoard';

const ownLines = (s: GameState) => (s.journal?.e ?? []).filter((x) => x.src === 'eat' && /own score/.test(x.t)).length;

describe('who is earning', () => {
  it('every man is on the board, the ones who need a job first, each with a real order to give him', () => {
    const s = newGameWith('board-1', 'olddon');
    const b = crewBoard(s);
    expect(b.rows.length).toBeGreaterThan(3);
    const order = ['starving', 'needs', 'own', 'over', 'earning', 'away'];
    for (let i = 1; i < b.rows.length; i++) expect(order.indexOf(b.rows[i].status)).toBeGreaterThanOrEqual(order.indexOf(b.rows[i - 1].status));
    const withJob = b.rows.filter((r) => r.assign && r.status !== 'earning');
    expect(withJob.length).toBeGreaterThan(0);
    for (const r of withJob) expect(previewAction(s, r.assign!.action).disabledReason).toBeUndefined();
    expect(renderToString(createElement(CrewBoard, { s }))).toContain('Who is earning');
  });
  it('idle men find their own scores and kick up half; the books reconcile; turned off, they wait', () => {
    let s = newGameWith('board-2', 'associate');
    expect(ownScoresOn(s)).toBe(true);
    for (let w = 0; w < 8; w++) { const r = advanceWeek(s, {}); expect(reconcile(r.report)).toEqual([]); s = r.state; }
    const n = ownLines(s);
    expect(n).toBeGreaterThan(0);
    const off: PlayerAction = { kind: 'mymen', op: { op: 'selfscore', on: false } } as PlayerAction;
    expect(previewAction(s, off).disabledReason).toBeUndefined();
    s = advanceWeek(s, { actions: [off] }).state;
    expect(ownScoresOn(s)).toBe(false);
    const m = ownLines(s);
    for (let w = 0; w < 6; w++) s = advanceWeek(s, {}).state;
    expect(ownLines(s)).toBe(m);
  });
  it('"Send him out for a score" works this week', () => {
    let s = newGameWith('board-3', 'olddon');
    const r = crewBoard(s).rows.find((x) => x.assign && (x.assign.action as { op?: { op?: string } }).op?.op === 'score')
      ?? { c: Object.values(s.characters).find((c) => c.alive && c.faction === 'player' && c.rank === 'soldier' && !c.imprisonedUntil)! };
    const a: PlayerAction = { kind: 'mymen', op: { op: 'score', id: r.c.id } } as PlayerAction;
    expect(previewAction(s, a).odds?.chance).toBeGreaterThan(0);
    s = advanceWeek(s, { actions: [a] }).state;
    expect(s.eat?.own?.[r.c.id]?.w).toBe(s.week - 1);
  });
});

import { mensMoney } from '../src/engine/mensMoney';
import { NeedsMoney } from '../src/ui/borgata/LetThemEat';
describe("your men's money and talking business", () => {
  it('the money report lists every man, the ones who need help first, and renders', () => {
    let s = newGameWith('mm-1', 'olddon');
    for (let w = 0; w < 3; w++) s = advanceWeek(s, {}).state;
    const r = mensMoney(s);
    expect(r.rows.length).toBeGreaterThan(3);
    const ord = ['broke', 'tight', 'ok', 'flush'];
    for (let i = 1; i < r.rows.length; i++) expect(ord.indexOf(r.rows[i].level)).toBeGreaterThanOrEqual(ord.indexOf(r.rows[i - 1].level));
    expect(r.rows.some((x) => x.earned > 0 || x.up > 0)).toBe(true);
    const html = renderToString(createElement(NeedsMoney, { s }));
    expect(html).toContain("Your men&#x27;s money");
  });
  it('Discuss business with one of your own always comes to something: a score, a place, a tip or a better price', () => {
    let hits = 0;
    for (let i = 0; i < 6; i++) {
      let s = newGameWith(`biz-${i}`, 'olddon');
      const c = Object.values(s.characters).filter((x) => x.alive && x.faction === 'player' && (x.rank === 'soldier' || x.rank === 'associate'))[i % 3];
      const before = s.journal?.e.length ?? 0;
      s = advanceWeek(s, { actions: [{ kind: 'talk', op: { t: 'ask', talk: 'business', target: c.id } } as PlayerAction] }).state;
      if ((s.journal?.e ?? []).slice(before).some((x) => /Talked business/.test(x.t))) hits++;
    }
    expect(hits).toBeGreaterThan(2);
  });
});

import { actNow, settlesNow } from '../src/engine/deeds/now';
describe('talking business settles in the moment', () => {
  it('a talk is decided now, with his own words as the result', () => {
    const s = newGameWith('now-talk', 'olddon');
    const c = Object.values(s.characters).find((x) => x.alive && x.faction === 'player' && x.rank === 'soldier')!;
    const a = { kind: 'talk', op: { t: 'ask', talk: 'business', target: c.id } } as PlayerAction;
    expect(settlesNow(s, a)).toBe(true);
    const r = actNow(s, a);
    expect(r.result.ok).not.toBe(false);
    expect(r.result.line.length).toBeGreaterThan(5);
    expect(r.result.line).not.toMatch(/^Done/);
  });
});
