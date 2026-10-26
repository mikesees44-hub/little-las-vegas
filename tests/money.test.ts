import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MoneyView } from '../src/ui/money/MoneyView';
import { PANELS } from '../src/ui/shell/panels';
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
    expect(n.policy.personal).toBe(4000);
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

describe('the Money screen renders', () => {
  it('is a Holdings panel section with the flow, the cut split, the trend and the levers', () => {
    const sec = PANELS.find((p) => p.id === 'holdings')!.sections.find((x) => x.id === 'money');
    expect(sec).toBeDefined();
    const s = play(newGame('money-ui'), 9, true);
    const html = renderToString(createElement(MoneyView, { s }));
    for (const id of ['money-weekflow', 'money-sources', 'money-split', 'money-uses', 'money-flow-net', 'money-chart-legend', 'money-levers', 'money-pots']) expect(html).toContain(`data-testid="${id}"`);
    expect(html).toContain('Came in');
    expect(html).toContain('Went out');
    expect(html).toMatch(/The last (<!-- -->)?8(<!-- -->)? weeks/);
  });
  it('before the first week it says the money starts on its own', () => {
    const html = renderToString(createElement(MoneyView, { s: newGame('money-ui0') }));
    expect(html).toContain('Everything is collected on its own');
  });
});

describe("the boss's pocket", () => {
  const capoOps = (s: GameState) => Object.values(s.characters).filter((c) => c.alive && c.rank === 'capo' && c.faction === 'player').map((c) => c.id);

  it('a new boss starts with money of his own and takes 40% of every envelope', () => {
    const s = newGame('pocket-start');
    expect(pocketCash(s)).toBe(3000);
    expect(s.tribute!.policy.personal).toBe(4000);
    const r = play(s, 4);
    expect(pocketCash(r)).toBeGreaterThan(5000);
  });

  it('an older two-pot save on the old 25% default moves to 40% once; a cut the boss chose stays', () => {
    const s0 = play(newGame('pocket-old'), 2);
    const a = JSON.parse(JSON.stringify(s0)) as GameState;
    delete a.tribute!.cut40;
    a.tribute!.policy = { personal: 2500, treasury: 7500, reserve: 0, auto: true };
    const b = JSON.parse(JSON.stringify(a)) as GameState;
    b.tribute!.policy = { personal: 3000, treasury: 7000, reserve: 0, auto: true };
    expect(advanceWeek(upgradeSave(a), {}).state.tribute!.policy.personal).toBe(4000);
    expect(advanceWeek(upgradeSave(b), {}).state.tribute!.policy.personal).toBe(3000);
  });

  it('the Good Life is paid from the pocket; short, the rest comes from the Family and the capos notice repeat dips', () => {
    let s = play(newGame('pocket-buy'), 2);
    s.tribute!.acct.personal = 0;
    const buy = { kind: 'econ', op: { type: 'luxBuy', item: 'cadillac' } } as const;
    const p = previewAction(s, buy);
    expect(p.pot).toBe('pocket');
    expect(p.disabledReason).toBeUndefined();
    const price = p.cost;
    const r = advanceWeek(s, { actions: [buy] });
    // His cut of the week's envelope lands first; the Family pays only what the pocket could not.
    const line = r.report.lines.find((l) => /Cadillac Eldorado \((the rest|from the Family)/.test(l.label));
    expect(line!.amount).toBeLessThan(0);
    expect(line!.amount).toBeGreaterThanOrEqual(-price);
    const book = r.state.tribute!.books.find((b) => b.week === s.week)!;
    const own = book.x.filter((x) => x[0] === 'personal' && /Cadillac/.test(x[4] ?? '')).reduce((a, x) => a + x[2], 0);
    expect(own - line!.amount).toBe(price);
    expect(r.state.tribute!.dips).toContain(s.week);
    // A second dip within 8 weeks costs opinion with every capo.
    s = r.state;
    s.tribute!.acct.personal = 0;
    const id = capoOps(s)[0];
    const dipMods = (x: GameState) => Object.values(x.relations).filter((r) => r.from === id && r.to === x.playerId).flatMap((r) => r.modifiers).filter((m) => /keeps dipping/.test(m.reason));
    expect(dipMods(s)).toEqual([]);
    const r2 = advanceWeek(s, { actions: [{ kind: 'econ', op: { type: 'luxBuy', item: 'jukebox' } }, { kind: 'econ', op: { type: 'luxBuy', item: 'cruiser' } }] });
    expect(dipMods(r2.state).length).toBe(1);
    expect(dipMods(r2.state)[0].value).toBeLessThan(0);
  });

  it('a draw moves Family money into the pocket (both pots reconcile) and putting it back pleases the capos', () => {
    const s = play(newGame('pocket-draw'), 2);
    const pk = pocketCash(s);
    const draw = { kind: 'tribute', op: { op: 'move', from: 'treasury', to: 'personal', amount: 2000 } } as const;
    const pv = previewAction(s, draw);
    expect(pv.title).toMatch(/Take a draw: \$2,000 from the Family into your pocket/);
    expect(pv.toPocket).toBe(2000);
    const r = advanceWeek(s, { actions: [draw] });
    const j = r.state.tribute!.books.find((b) => b.week === s.week)!;
    expect(j.x.some((x) => x[0] === 'treasury' && x[1] === 'personal' && x[2] === 2000)).toBe(true);
    expect(pocketCash(r.state)).toBeGreaterThanOrEqual(pk + 2000 - 1000);
    const v = moneyView(r.state);
    expect(v.net).toBe(v.familyDelta + v.pocketDelta);
  });
});
