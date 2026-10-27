import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { advanceWeek } from '../src/engine/engine';
import { newGameWith } from '../src/engine/starts';
import { player } from '../src/engine/characters';
import { pocketCash } from '../src/engine/tributeState';
import { netWorth, ownMoney, wealthOf } from '../src/engine/wealth';
import { CharacterSheet } from '../src/ui/components/CharacterSheet';

/** The text of the first element carrying this test id. */
function byTestId(html: string, id: string): string | undefined {
  const m = html.match(new RegExp(`data-testid="${id}"[^>]*>([^<]*)<`));
  return m?.[1];
}

describe('A01: one answer for the boss\'s own money', () => {
  it('the boss\'s own money is his Pocket; savings and possessions are apart; net worth adds them up', () => {
    const s = newGameWith('trust-a01', 'sees');
    const boss = player(s);
    expect(boss.wealth).toBeGreaterThan(0); // the private savings the old sheet called "own money"
    expect(ownMoney(s, boss)).toBe(pocketCash(s));
    const w = wealthOf(s, boss);
    expect(w.isPocket).toBe(true);
    expect(w.savings).toBe(Math.round(boss.wealth));
    expect(w.net).toBe(w.own + w.savings + w.possessions);
    expect(netWorth(s, boss)).not.toBe(s.money + w.own); // Family money is never in it
  });
  it('anyone else\'s own money is his wealth, with no savings line', () => {
    const s = newGameWith('trust-a01b', 'classic');
    const c = Object.values(s.characters).find((x) => x.alive && x.rank === 'capo')!;
    expect(ownMoney(s, c)).toBe(Math.round(c.wealth));
    expect(wealthOf(s, c).savings).toBe(0);
  });
  it('the character sheet shows the same pocket as the top bar (before and after a week)', () => {
    let s = newGameWith('trust-a01c', 'sees');
    for (let i = 0; i < 2; i++) {
      const html = renderToString(createElement(CharacterSheet, { s, id: s.playerId, onClose: () => {} }));
      expect(byTestId(html, 'sheet-own-money')).toBe(`$${pocketCash(s).toLocaleString('en-US')}`);
      expect(html).not.toMatch(/Own money: <span[^>]*>\$/); // the old mislabeled line is gone for the boss
      s = advanceWeek(s, {}).state;
    }
  });
});
