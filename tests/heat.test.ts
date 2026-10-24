import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/newGame';
import { heat, newCtx } from '../src/engine/ledger';
import { decayAmount, heatConsequences, heatDecay } from '../src/engine/heat';
import { advanceWeek } from '../src/engine/engine';
import { HEAT_BARS } from '../src/engine/types';

describe('heat', () => {
  it('is clamped to 0..100', () => {
    const s = newGame('h1');
    const ctx = newCtx(s);
    heat(ctx, 'local', 500, 'x', 'heat');
    heat(ctx, 'federal', -500, 'y', 'heat');
    expect(s.heat.local).toBe(100);
    expect(s.heat.federal).toBe(0);
  });
  it('decays on a quiet week by the quiet rate', () => {
    const s = newGame('h2');
    s.heat = { local: 40, family: 40, federal: 40 };
    const ctx = newCtx(s);
    heatDecay(ctx);
    for (const b of HEAT_BARS) expect(s.heat[b]).toBe(40 - decayAmount(b, 40, true));
    // quiet decay is faster than busy decay, and higher heat decays faster
    for (const b of HEAT_BARS) {
      expect(decayAmount(b, 40, true)).toBeGreaterThan(decayAmount(b, 40, false));
      expect(decayAmount(b, 80, true)).toBeGreaterThan(decayAmount(b, 20, true));
    }
  });
  it('decays slower on a busy week', () => {
    const s = newGame('h3');
    s.heat = { local: 40, family: 40, federal: 40 };
    const ctx = newCtx(s);
    heat(ctx, 'local', 5, 'shakedown', 'event');
    heatDecay(ctx);
    expect(s.heat.local).toBe(45 - decayAmount('local', 45, false));
    expect(s.heat.family).toBe(40 - decayAmount('family', 40, true));
  });
  it('never decays below zero', () => {
    const s = newGame('h4');
    s.heat = { local: 1, family: 0, federal: 0 };
    const ctx = newCtx(s);
    heatDecay(ctx);
    expect(s.heat).toEqual({ local: 0, family: 0, federal: 0 });
  });
  it('a quiet game cools off over time', () => {
    let s = newGame('h5');
    s.heat = { local: 60, family: 60, federal: 30 };
    s.businesses = [];
    s.rivals.forEach((r) => (r.moveCooldowns = { strike: 9999, inform: 9999, expand: 9999 }));
    for (let i = 0; i < 20; i++) {
      // always pick the quietest available option
      const choices: Record<string, string> = {};
      for (const ev of s.pendingEvents) {
        const quiet = ev.choices.find((c) => c.effects.every((e) => e.type !== 'heat' || e.amount < 0)) ?? ev.choices[0];
        choices[ev.iid] = quiet.id;
      }
      s = advanceWeek(s, { choices }).state;
    }
    expect(s.heat.local).toBeLessThan(40);
    expect(s.heat.family).toBeLessThan(40);
  });
  it('at 80+ produces named consequences that are reported', () => {
    let sawRaid = false;
    for (let i = 0; i < 30 && !sawRaid; i++) {
      const s = newGame(`h6-${i}`);
      s.heat = { local: 95, family: 95, federal: 95 };
      const ctx = newCtx(s);
      heatConsequences(ctx);
      const labels = ctx.lines.map((l) => l.label).join('|');
      if (/RAID/.test(labels) && /ARREST/.test(labels)) sawRaid = true;
    }
    expect(sawRaid).toBe(true);
  });
});
