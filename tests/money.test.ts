import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/newGame';
import { advanceWeek } from '../src/engine/engine';
import { newBusiness } from '../src/engine/business';
import { previewAction } from '../src/engine/actions';
import { ensureEcon } from '../src/engine/econState';
import { FLOW_WEEKS, markerPayRate, moneyHist, moneyView, SQUEEZE } from '../src/engine/money';
import { familyCash, pocketCash } from '../src/engine/tributeState';
import { upgradeSave } from '../src/engine/upgradeSave';
import { tidyState } from '../src/engine/tidy';
import type { GameState } from '../src/engine/types';
import { randomChoices } from './helpers';

const play = (s: GameState, weeks: number, random = false): GameState => {
  for (let i = 0; i < weeks && !s.gameOver; i++) s = advanceWeek(s, random ? randomChoices(s, i) : {}).state;
  return s;
};

/** Every -0 and every undefined left in a state (JSON would not round-trip them). */
function dirt(root: unknown): string[] {
  const out: string[] = [];
  const walk = (o: unknown, path: string) => {
    if (out.length > 5) return;
    if (Array.isArray(o)) o.forEach((v, i) => (v === 0 && 1 / v < 0 ? out.push(`${path}[${i}] = -0`) : v === undefined ? out.push(`${path}[${i}] undefined`) : walk(v, `${path}[${i}]`)));
    else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) {
      if (v === undefined) out.push(`${path}.${k} undefined`);
      else if (v === 0 && 1 / v < 0) out.push(`${path}.${k} = -0`);
      else walk(v, `${path}.${k}`);
    }
  };
  walk(root, '$');
  return out;
}

describe('the Money screen (money.ts moneyView)', () => {
  const s = play(newGame('money-view'), 10, true);
  const v = moneyView(s);

  it('reconciles: in − out = the change in the Family plus the change in your Pocket', () => {
    expect(v.week).toBe(s.lastReport!.week);
    expect(v.net).toBe(v.inTotal - v.outTotal);
    expect(Math.abs(v.net - (v.familyDelta + v.pocketDelta))).toBeLessThanOrEqual(1);
  });

  it('the simple flow adds up: sources = in, the cut splits it into the two pots, uses = out', () => {
    expect(v.sources.reduce((a, x) => a + x.amount, 0)).toBeCloseTo(v.inTotal, 6);
    expect(v.uses.reduce((a, x) => a + x.amount, 0)).toBeCloseTo(v.outTotal, 6);
    expect(v.famIn + v.pocketIn).toBeCloseTo(v.inTotal, 6);
    expect(v.famOut + v.pocketOut).toBeCloseTo(v.outTotal, 6);
    expect(v.pocketIn).toBeGreaterThan(0); // the boss's cut landed on its own
    expect(v.sources.map((x) => x.key)).toContain('crews');
    for (const x of [...v.sources, ...v.uses]) expect(x.amount).toBeGreaterThan(0);
  });

  it('keeps a weekly trend (12 weeks in the state, the last 8 on screen)', () => {
    const t = s.tribute!;
    expect(t.flow!.length).toBe(Math.min(FLOW_WEEKS, 10));
    expect(t.flow![t.flow!.length - 1]).toMatchObject({ week: v.week, in: Math.round(v.inTotal), out: Math.round(v.outTotal), family: familyCash(s), pocket: pocketCash(s) });
    const h = moneyHist(s);
    expect(h.length).toBe(8);
    expect(h.every((x) => x.in !== undefined && x.out !== undefined)).toBe(true);
    const later = play(s, 6);
    expect(later.tribute!.flow!.length).toBe(FLOW_WEEKS);
  });
});

describe('auto-collect: the money comes in with no clicks', () => {
  it('a boss who does nothing still earns from week 1, and meaningfully by week 3', () => {
    let s = newGame('money-auto');
    const ins: number[] = [];
    for (let w = 0; w < 4; w++) {
      s = advanceWeek(s, {}).state;
      ins.push(moneyView(s).inTotal);
    }
    expect(ins[0]).toBeGreaterThan(0);
    expect(Math.max(ins[1], ins[2])).toBeGreaterThan(5000);
    // Every envelope was split at the standing cut, with no audience needed.
    const reps = s.tribute!.reports.filter((r) => r.collected > 0);
    expect(reps.length).toBeGreaterThan(0);
    expect(reps.filter((r) => r.week < s.week - 1).every((r) => r.alloc)).toBe(true);
  });

  it('the book\'s markers pay in on their own (more when squeezing); the old collect order still works', () => {
    let s = newGame('money-markers');
    expect(markerPayRate(s)).toBeGreaterThan(0);
    expect(SQUEEZE.markers).toBeGreaterThan(markerPayRate(s));
    const d = s.districts.find((x) => (x.influence.player ?? 0) > 0) ?? s.districts[0];
    const b = newBusiness(s, 'bookmaking', d.id);
    b.owner = 'player';
    s.businesses.push(b);
    const e = ensureEcon(s);
    e.rackets[b.id] = { ...(e.rackets[b.id] ?? {}), markers: 4000 };
    const a = { kind: 'econ' as const, op: { type: 'collect' as const, bizId: b.id } };
    const p = previewAction(s, a);
    expect(p.disabledReason).toBeUndefined();
    const r = advanceWeek(s, { actions: [a] });
    expect(r.report.lines.some((l) => /markers collected/.test(l.label))).toBe(true);
  });
});

describe('old saves and tidy state', () => {
  it('an old four-pot save loads, folds the reserve into the Family, and keeps every dollar', () => {
    const s0 = play(newGame('money-old'), 3);
    // Make it look like a save from before the money pass: three-way split, a reserve, no trend.
    const old = JSON.parse(JSON.stringify(s0)) as GameState;
    const t = old.tribute!;
    delete (t as { pots?: 2 }).pots;
    delete t.flow;
    t.policy = { personal: 1500, treasury: 7500, reserve: 1000, auto: true };
    t.acct.reserve += 3000;
    old.money -= 3000;
    const before = familyCash(old) + pocketCash(old);
    const loaded = upgradeSave(JSON.parse(JSON.stringify(old)) as GameState);
    expect(familyCash(loaded) + pocketCash(loaded)).toBe(before);
    expect(moneyView(loaded).family).toBe(familyCash(loaded));
    const r = advanceWeek(loaded, {});
    const n = r.state.tribute!;
    expect(n.pots).toBe(2);
    expect(n.acct.reserve).toBe(0);
    expect(n.policy.reserve).toBe(0);
    expect(n.policy.personal).toBe(2500);
    expect(r.report.lines.some((l) => /old reserve folded into the Family/.test(l.label))).toBe(true);
    expect(n.flow!.length).toBe(1);
    expect(moneyHist(r.state).length).toBeGreaterThan(1); // the old weeks come from the archived books
  });

  it('a save without a tribute layer at all still loads and plays', () => {
    const s0 = newGame('money-bare');
    const bare = JSON.parse(JSON.stringify(s0)) as GameState;
    delete bare.tribute;
    const loaded = upgradeSave(bare);
    expect(moneyView(loaded).hist).toEqual([]);
    const r = advanceWeek(loaded, {});
    expect(r.state.tribute!.pots).toBe(2);
  });

  it('tidyState round-trips: no undefined, no -0, JSON in = JSON out', () => {
    const s = play(newGame('money-tidy'), 12, true);
    expect(dirt(s)).toEqual([]);
    const copy = JSON.parse(JSON.stringify(s));
    tidyState(copy);
    expect(copy).toEqual(s);
    expect(JSON.parse(JSON.stringify(s))).toStrictEqual(JSON.parse(JSON.stringify(copy)));
  });
});
