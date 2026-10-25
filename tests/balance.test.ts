import { describe, expect, it } from 'vitest';
import { advanceWeek } from '../src/engine/engine';
import { newGame } from '../src/engine/newGame';
import { newCtx } from '../src/engine/ledger';
import { playSession, randomMoves, type MgSession } from '../src/engine/minigames';
import { BUILD_CUSHION, econWeek } from '../src/engine/econ';
import { ensureEcon } from '../src/engine/econState';
import { costHint, markCostlyChoices } from '../src/engine/costHints';
import { legalActions, previewAction } from '../src/engine/actions';
import { FIRST_WINTER_PER_NEW } from '../src/engine/economy';
import { newBusiness } from '../src/engine/business';
import type { Effect, GameState } from '../src/engine/types';

function game(seed: string): GameState {
  const s = advanceWeek(newGame(seed), {}).state;
  s.money = 30000;
  return s;
}

describe('balance', () => {
  it('a sit-down deal in your favor gets you more of their money and costs you less of yours', () => {
    const s = game('bal-sit');
    const other = s.rivals[0].leaderId;
    const deals = (parts: Effect[]) => {
      const out: { v: number; amt: number }[] = [];
      for (let i = 0; i < 60; i++) {
        const moves = randomMoves(s, 'sitdown', `d${i}`, { kind: 'deal', other }, { accept: parts, refuse: [] }, { rng: i + 7 });
        const ses = playSession(s, 'sitdown', `d${i}`, { kind: 'deal', other }, { accept: parts, refuse: [] }, moves) as MgSession<{ deal?: number }>;
        const m = ses.outcome?.effects.find((e) => e.type === 'money' && !e.label?.includes('envelope on the side')) as { amount: number } | undefined;
        if (ses.d.deal !== undefined && m) out.push({ v: ses.d.deal, amt: m.amount });
      }
      return out.sort((a, b) => a.v - b.v);
    };
    const pay = deals([{ type: 'money', amount: -1500 }]);
    const get = deals([{ type: 'money', amount: 1500 }]);
    expect(pay.length).toBeGreaterThan(5);
    for (let i = 1; i < pay.length; i++) expect(-pay[i].amt).toBeLessThanOrEqual(-pay[i - 1].amt); // better deal, smaller bill
    for (let i = 1; i < get.length; i++) expect(get[i].amt).toBeGreaterThanOrEqual(get[i - 1].amt); // better deal, bigger payout
    for (const d of pay) if (d.v >= 60) expect(-d.amt).toBeLessThan(1500);
  });

  it('building stages and community projects never take the last of the treasury', () => {
    const s = game('bal-build');
    const e = ensureEcon(s);
    const l = e.lots.find((x) => x.status === 'sale' && !x.use)!;
    Object.assign(l, { status: 'owned', owner: 'player', use: 'icecream', stage: 'permits', stageWeek: 0 });
    const ctx = newCtx(s);
    s.money = 0;
    econWeek(ctx);
    expect(ctx.lines.some((x) => x.label.startsWith('Construction:'))).toBe(false);
    expect(l.stalled).toMatch(/No money/);
    s.money = 100000;
    econWeek(ctx);
    const paid = -(ctx.lines.find((x) => x.label.startsWith('Construction:'))?.amount ?? 0);
    expect(paid).toBeGreaterThan(0);
    // With just the price in hand, the stage waits: it would leave nothing for the payroll.
    const l2 = e.lots.find((x) => x.status === 'sale' && !x.use && x.id !== l.id)!;
    Object.assign(l2, { status: 'owned', owner: 'player', use: 'icecream', stage: 'permits', stageWeek: 0 });
    s.money = paid + BUILD_CUSHION - 1;
    const ctx2 = newCtx(s);
    econWeek(ctx2);
    expect(l2.stalled).toMatch(/payroll/);
    expect(s.money).toBeGreaterThanOrEqual(0);
  });

  it('expensive answers and orders say so', () => {
    const s = game('bal-hint');
    expect(costHint(s, 500)).toBeUndefined();
    expect(costHint(s, 2000)).toBeUndefined(); // under a quarter of $30,000
    expect(costHint(s, 9000)).toMatch(/Costly: \$9,000, 30% of the treasury/);
    expect(costHint(s, 40000)).toMatch(/more than the treasury holds.*in the red/);
    s.pendingEvents = [{ iid: 'x', defId: 'test', week: s.week, title: '', text: '', mandatory: false, priority: 1, defaultChoiceId: 'a', choices: [
      { id: 'a', label: 'Pay', because: 'paid', effects: [{ type: 'money', amount: -12000 }] },
      { id: 'b', label: 'Do not', because: 'did not', effects: [] },
    ] }];
    markCostlyChoices(s);
    markCostlyChoices(s);
    expect(s.pendingEvents[0].choices[0].detail).toMatch(/^Costly: \$12,000/);
    expect(s.pendingEvents[0].choices[0].detail!.match(/Costly/g)!.length).toBe(1);
    expect(s.pendingEvents[0].choices[1].detail).toBeUndefined();
    s.money = 3000;
    const big = legalActions(s).map((a) => previewAction(s, a)).find((p) => !p.disabledReason && p.cost >= 1000);
    if (big) expect(big.detail).toMatch(/Costly/);
  });

  it('the first winter charges for winterizing what you bought that summer, and only then', () => {
    let s = newGame('bal-winter');
    const b = newBusiness(s, 'bar', 'pacific');
    b.id = `b${s.nextId++}`;
    b.boughtWeek = 5;
    s.businesses.push(b);
    let fresh = 0;
    let weeks = 0;
    for (let i = 0; i < 100 && !s.gameOver; i++) {
      const choices: Record<string, string> = {};
      for (const e of s.pendingEvents) choices[e.iid] = e.defaultChoiceId;
      const r = advanceWeek(s, { choices });
      const l = r.report.lines.filter((x) => x.label.startsWith('The first winter: winterizing'));
      if (l.length) {
        weeks++;
        fresh += l[0].amount;
        expect(r.report.date.y === 1960 || r.report.date.y === 1961).toBe(true);
      }
      s = r.state;
    }
    expect(weeks).toBeGreaterThan(20);
    expect(fresh).toBeLessThanOrEqual(-FIRST_WINTER_PER_NEW * weeks);
  });
});

describe('the rank starts', () => {
  it('a soldier kicks up to his don and does not also pay Philadelphia, and has no club boiler to fix', async () => {
    const { newGameWith } = await import('../src/engine/starts');
    const { bagmanDue, underADon } = await import('../src/engine/events');
    const { firstWinter } = await import('../src/engine/economy');
    let s = newGameWith('bal-soldier', 'soldier');
    expect(underADon(s)).toBe(true);
    let philly = 0;
    let kick = 0;
    let boiler = 0;
    for (let i = 0; i < 40 && !s.gameOver; i++) {
      expect(bagmanDue(s)).toBe(false);
      expect(firstWinter(s)).toBe(false);
      const choices: Record<string, string> = {};
      for (const e of s.pendingEvents) choices[e.iid] = e.defaultChoiceId;
      const r = advanceWeek(s, { choices });
      for (const l of r.report.lines) {
        if (l.label.startsWith('Tribute to Philadelphia')) philly++;
        if (l.label.startsWith('Kick-up to')) kick++;
        if (l.label.startsWith('The first winter')) boiler++;
      }
      s = r.state;
    }
    if (underADon(s)) expect(philly).toBe(0);
    expect(kick).toBeGreaterThan(10);
    expect(boiler).toBe(0);
  });
});

describe('a coup planned against the old boss', () => {
  it('never carries the new boss out of the family with it', async () => {
    const { fireConsequences } = await import('../src/engine/consequences');
    const { validatePlayer } = await import('../src/engine/dynasty');
    const { capos } = await import('../src/engine/characters');
    for (let i = 0; i < 30; i++) {
      const s = game(`bal-coup-${i}`);
      const [lead, other] = capos(s);
      // The plot was hatched with a man who is now the boss (a successor who was in on it).
      s.factions.push({ id: 'f1', leaderId: (i % 2 ? lead : other).id, memberIds: [lead.id, other.id, s.playerId], demand: 'head', since: 1 });
      s.scheduled.push({ id: 'c1', key: 'coup', dueWeek: s.week, because: 'test', sourceWeek: 1, params: { faction: 'f1' } });
      const ctx = newCtx(s);
      fireConsequences(ctx);
      if (!s.gameOver) expect(validatePlayer(s).filter((e) => /faction/.test(e))).toEqual([]);
    }
  });
});
