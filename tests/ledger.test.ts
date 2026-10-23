import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/newGame';
import { advanceWeek } from '../src/engine/engine';
import { heat, money, newCtx, reconcile, respect, sumLines } from '../src/engine/ledger';
import { randomChoices } from './helpers';

describe('ledger reconciliation', () => {
  it('records the applied (clamped) amount, not the requested one', () => {
    const s = newGame('led');
    s.respect = 98;
    s.heat.local = 3;
    const ctx = newCtx(s);
    const start = { money: s.money, respect: s.respect, heat: { ...s.heat } };
    respect(ctx, 10, 'big win', 'event');
    heat(ctx, 'local', -10, 'cooling', 'heat');
    money(ctx, -500, 'cost', 'cost');
    expect(ctx.lines[0]).toMatchObject({ amount: 2, requested: 10 });
    expect(ctx.lines[1]).toMatchObject({ amount: -3, requested: -10 });
    const errs = reconcile({ start, end: { money: s.money, respect: s.respect, heat: { ...s.heat } }, lines: ctx.lines });
    expect(errs).toEqual([]);
  });

  it('every report line has a label, and lines sum to the real delta, across many seeds and years', () => {
    for (let seed = 0; seed < 12; seed++) {
      let s = newGame(`recon${seed}`);
      for (let w = 0; w < 156 && !s.gameOver; w++) {
        const before = { money: s.money, respect: s.respect, heat: { ...s.heat } };
        const r = advanceWeek(s, randomChoices(s, w));
        const sums = sumLines(r.report.lines);
        expect(sums.money).toBe(r.state.money - before.money);
        expect(sums.respect).toBe(r.state.respect - before.respect);
        expect(sums['heat.local']).toBe(r.state.heat.local - before.heat.local);
        expect(sums['heat.family']).toBe(r.state.heat.family - before.heat.family);
        expect(sums['heat.federal']).toBe(r.state.heat.federal - before.heat.federal);
        for (const l of r.report.lines) {
          expect(l.label.length).toBeGreaterThan(3);
          // a zero line is only allowed when clamping swallowed the request
          if (l.amount === 0) expect(l.requested).toBeDefined();
        }
        s = r.state;
      }
    }
  });

  it('rival money hits are capped at 25% of the week\'s gross in year 1', () => {
    for (let seed = 0; seed < 15; seed++) {
      let s = newGame(`cap${seed}`);
      for (let w = 0; w < 52 && !s.gameOver; w++) {
        const r = advanceWeek(s, randomChoices(s, w));
        const rivalLoss = -r.report.lines.filter((l) => l.stat === 'money' && l.category === 'rival').reduce((a, l) => a + l.amount, 0);
        expect(rivalLoss).toBeLessThanOrEqual(Math.floor(r.report.grossIncome * 0.25));
        s = r.state;
      }
    }
  });

  it('is deterministic for a given seed and choices', () => {
    const run = () => {
      let s = newGame('det');
      for (let w = 0; w < 80; w++) s = advanceWeek(s, randomChoices(s, w)).state;
      return JSON.stringify(s);
    };
    expect(run()).toBe(run());
  });
});
