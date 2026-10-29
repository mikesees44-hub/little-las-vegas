import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { newGame } from '../src/engine/newGame';
import { ConfirmOrder } from '../src/ui/components/ConfirmOrder';
import { yesBossSpeaker } from '../src/ui/components/yesBoss';
import type { PlayerAction } from '../src/engine/types';

describe('Are you sure? / Yes, boss', () => {
  it('shows the order, its cost, and the underboss and consigliere weighing in', () => {
    const s = newGame('confirm-1');
    const a = { kind: 'order', key: 'cops', via: 'direct' } as PlayerAction;
    const html = renderToStaticMarkup(createElement(ConfirmOrder, { s, action: a, onYes: () => {}, onNo: () => {}, onNeverAsk: () => {} }));
    expect(html).toContain('Are you sure?');
    expect(html).toContain('OK, do it');
    expect(html).toContain('data-testid="confirm-voices"'); // one line per voice (the playthrough: three near-identical essays)
    expect(html).not.toContain('Your people weigh in');
  });
  it('the boss\'s own orders are answered by his underboss', () => {
    const s = newGame('confirm-2');
    expect(yesBossSpeaker(s, 'You')).not.toMatch(/^You/);
    expect(yesBossSpeaker(s, 'Sal')).toBe('Sal');
  });
});
