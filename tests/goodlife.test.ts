import { describe, expect, it } from 'vitest';
import { previewAction } from '../src/engine/actions';
import { advanceWeek } from '../src/engine/engine';
import { forfeitureLaw, owned, resaleValue } from '../src/engine/goodlife';
import { reconcile } from '../src/engine/ledger';
import { newGame } from '../src/engine/newGame';

describe('The Good Life', () => {
  it('buying a Cadillac costs money, buys respect and family goodwill, and draws the IRS without a business to explain it', () => {
    const s = newGame('lux1');
    s.money = 100000;
    s.businesses = s.businesses.filter((b) => b.owner !== 'player');
    const a = { kind: 'econ', op: { type: 'luxBuy', item: 'cadillac' }, fund: 'family' } as const; // the player approves Family money for what the pocket can't cover
    const p = previewAction(s, a);
    expect(p.disabledReason).toBeUndefined();
    expect(p.effects.some((e) => e.type === 'heat' && e.bar === 'federal')).toBe(true);
    expect(p.effects.some((e) => e.type === 'familyOpinion')).toBe(true);
    const r = advanceWeek(s, { actions: [a] });
    expect(reconcile(r.report)).toEqual([]);
    expect(owned(r.state).map((o) => o.id)).toContain('cadillac');
    // Upkeep every week after, by name.
    const r2 = advanceWeek(r.state, {});
    const upkeepPaid = r2.report.lines.some((l) => l.label.startsWith('The Good Life: upkeep')) || r2.state.tribute!.books.find((b) => b.week === r2.report.week)!.x.some((x) => x[0] === 'personal' && /^The Good Life: upkeep/.test(x[4] ?? ''));
    expect(upkeepPaid).toBe(true);
  });
  it('a car loses value, a house holds it; a color TV waits for color', () => {
    const s = newGame('lux2');
    s.money = 200000;
    const r = advanceWeek(s, { actions: [{ kind: 'econ', op: { type: 'luxBuy', item: 'cadillac' }, fund: 'family' }, { kind: 'econ', op: { type: 'luxBuy', item: 'cresthouse' }, fund: 'family' }] });
    const st = r.state;
    st.date = { ...st.date, y: st.date.y + 5 };
    const car = owned(st).find((o) => o.id === 'cadillac')!;
    const house = owned(st).find((o) => o.id === 'cresthouse')!;
    expect(resaleValue(st, car)).toBeLessThan(car.paid * 0.5);
    expect(resaleValue(st, house)).toBeGreaterThan(house.paid * 0.95);
    expect(previewAction(newGame('lux3'), { kind: 'econ', op: { type: 'luxBuy', item: 'colortv' } }).disabledReason).toMatch(/1965/);
  });
  it('RICO forfeiture arrives in October 1970', () => {
    const s = newGame('lux4');
    s.date = { y: 1970, m: 9, d: 1 };
    expect(forfeitureLaw(s)).toBe(false);
    s.date = { y: 1970, m: 10, d: 20 };
    expect(forfeitureLaw(s)).toBe(true);
  });
});
