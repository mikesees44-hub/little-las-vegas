import '../src/engine/engine';
import { describe, expect, it } from 'vitest';
import { newGameWith } from '../src/engine/starts';
import { eaters } from '../src/engine/eat';
import { moneyNeedOf, whoNeedsMoney } from '../src/engine/moneyNeed';
import { previewAction } from '../src/engine/actions';

describe('who needs money', () => {
  it('a broke man is listed first with a ready fix that can be ordered', () => {
    const s = newGameWith('money-need', 'classic');
    const men = eaters(s);
    expect(men.length).toBeGreaterThan(0);
    const m = men[0];
    m.wealth = 20;
    m.debtTo = { rival: 'manno', amount: 800 } as never;
    const n = moneyNeedOf(s, m);
    expect(n.level).toBe('broke');
    expect(n.fix).toBeTruthy();
    expect(previewAction(s, n.fix!.action).disabledReason).toBeFalsy();
    expect(whoNeedsMoney(s)[0].c.id).toBe(m.id);
  });
  it('a man doing well is not listed', () => {
    const s = newGameWith('money-need-2', 'classic');
    const m = eaters(s)[0];
    m.wealth = 5000; delete m.debtTo;
    expect(['ok', 'flush', 'tight']).toContain(moneyNeedOf(s, m).level);
  });
});
