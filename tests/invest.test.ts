import '../src/engine/engine';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { newGameWith } from '../src/engine/starts';
import { advanceWeek } from '../src/engine/engine';
import { previewAction } from '../src/engine/actions';
import { buyIdeas, earnIdeas, heldReturns } from '../src/engine/invest';
import { canHold, earnerOf } from '../src/engine/earners';
import { PutMoneyToWork } from '../src/ui/econ/PutMoneyToWork';

describe('put your money to work', () => {
  it('a made man can hold a steady earner, and the idea is a real order that lands', () => {
    let s = newGameWith('inv-1', 'olddon');
    const made = Object.values(s.characters).find((c) => c.alive && c.faction === 'player' && c.rank === 'soldier')!;
    expect(canHold(s, made)).toBe(true);
    const ideas = earnIdeas(s);
    expect(ideas.length).toBeGreaterThan(0);
    const x = ideas.find((i) => i.c.rank === 'soldier') ?? ideas[0];
    expect(previewAction(s, x.action).disabledReason).toBeUndefined();
    s = advanceWeek(s, { actions: [x.action] }).state;
    expect(earnerOf(s, x.c.id)?.id).toBe(x.b.id);
  });
  it('buy ideas are ranked by payback and say it in the order', () => {
    const s = newGameWith('inv-2', 'olddon');
    const b = buyIdeas(s);
    expect(b.length).toBeGreaterThan(0);
    for (let i = 1; i < b.length; i++) expect(b[i].payback).toBeGreaterThanOrEqual(b[i - 1].payback);
    expect(previewAction(s, b[0].action).detail).toMatch(/pays for itself in about \d+ weeks/);
    expect(heldReturns(s).length).toBeGreaterThan(0);
  });
  it('renders', () => {
    const s = newGameWith('inv-3', 'olddon');
    const html = renderToString(createElement(PutMoneyToWork, { s }));
    expect(html).toContain('Put your money to work');
  });
});
