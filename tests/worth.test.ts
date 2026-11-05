import '../src/engine/engine';
import { describe, expect, it } from 'vitest';
import { newGameWith } from '../src/engine/starts';
import { advanceWeek } from '../src/engine/engine';
import { reconcile } from '../src/engine/ledger';
import { previewAction } from '../src/engine/actions';
import { bizSalePrice, bizWorth, leasable } from '../src/engine/worth';
import { marketValue } from '../src/engine/econ';
import { owned } from '../src/engine/business';
import type { PlayerAction } from '../src/engine/types';

describe('what you own is worth more the longer you hold it, and more when it earns', () => {
  it('a business gains value with time and sells for more than half', () => {
    const s = newGameWith('worth-1', 'olddon');
    const b = owned(s).find((x) => x.kind !== 'casino')!;
    b.boughtWeek = s.week;
    const now = bizWorth(s, b).worth;
    s.week += 52;
    const later = bizWorth(s, b).worth;
    expect(later).toBeGreaterThan(now);
    expect(bizSalePrice(s, b)).toBeGreaterThan((b.cost ?? 0) * 0.5);
    expect(previewAction(s, { kind: 'sellBusiness', businessId: b.id }).detail).toMatch(/gained \d+%/);
  });
  it('an owned building gains value while held', () => {
    const s = newGameWith('worth-2', 'olddon');
    const l = (s.econ?.lots ?? []).find((x) => x.status === 'owned' && x.stage === 'open');
    if (!l) return;
    l.boughtWeek = s.week;
    const v0 = marketValue(s, l);
    s.week += 52;
    expect(marketValue(s, l)).toBeGreaterThan(v0);
  });
  it('lease a front to an operator: steady rent, no upkeep, books reconcile; take it back', () => {
    let s = newGameWith('worth-3', 'olddon');
    const b = owned(s).find((x) => leasable(x));
    if (!b) return;
    const a: PlayerAction = { kind: 'econ', op: { type: 'leaseOut', bizId: b.id } } as PlayerAction;
    expect(previewAction(s, a).disabledReason).toBeUndefined();
    let r = advanceWeek(s, { actions: [a] });
    expect(reconcile(r.report)).toEqual([]);
    s = r.state;
    const nb = s.businesses.find((x) => x.id === b.id)!;
    expect(nb.leasedTo).toBeTruthy();
    r = advanceWeek(s, {});
    expect(reconcile(r.report)).toEqual([]);
    expect(r.report.lines.some((l) => /^Rent: /.test(l.label) && l.label.includes(nb.name))).toBe(true);
    s = r.state;
    s = advanceWeek(s, { actions: [{ kind: 'econ', op: { type: 'endLease', bizId: b.id } } as PlayerAction] }).state;
    expect(s.businesses.find((x) => x.id === b.id)!.leasedTo).toBeUndefined();
  });
});
