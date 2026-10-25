import { describe, expect, it } from 'vitest';
import { previewAction } from '../src/engine/actions';
import { CATALOG } from '../src/engine/catalog';
import { advanceWeek, cloneState } from '../src/engine/engine';
import { ensureEcon } from '../src/engine/econState';
import { autoDeal, dealView, haggleOdds, sellerFor, suggestedManager, type DealTarget } from '../src/engine/deals';
import { reconcile } from '../src/engine/ledger';
import { familyCandidates } from '../src/engine/managers';
import { newGame } from '../src/engine/newGame';
import type { GameState, PlayerAction } from '../src/engine/types';

function rich(seed: string): GameState {
  const s = newGame(seed);
  s.money = 500_000;
  s.heat = { local: 0, family: 0, federal: 0 };
  return s;
}

function ourDistrict(s: GameState): string {
  return s.districts.filter((d) => (d.influence.player ?? 0) >= 20)[0].id;
}

const deal = (target: DealTarget, terms: { haggles: number; cash: 0 | 0.25 | 0.5; mgr?: never | { source: 'family' | 'crew' | 'pro'; charId?: string; pro?: number } | { keep: true } }): PlayerAction => ({ kind: 'econ', op: { type: 'deal', target, terms } });

describe('the Deal: buying is a contract across a desk', () => {
  it('a racket is sold by a named street seller, honest property by a realtor; same seller for the same place', () => {
    const s = rich('deal-seller');
    const d = ourDistrict(s);
    const racket = sellerFor(s, { kind: 'biz', biz: 'bookmaking', district: d });
    expect(racket.shady).toBe(true);
    expect(racket.name).toMatch(/\w+ \w+/);
    expect(racket.line.length).toBeGreaterThan(10);
    const lot = ensureEcon(s).lots.find((l) => l.status === 'sale')!;
    const realtor = sellerFor(s, { kind: 'lot', lotId: lot.id });
    expect(realtor.shady).toBe(false);
    expect(sellerFor(s, { kind: 'lot', lotId: lot.id }).name).toBe(realtor.name);
  });

  it('haggling is decided up front (the window shows the outcome) and never rerolls within the month', () => {
    const s = rich('deal-haggle');
    const t: DealTarget = { kind: 'biz', biz: 'bookmaking', district: ourDistrict(s) };
    const a = dealView(s, t, { haggles: 2, cash: 0 });
    const b = dealView(cloneState(s), t, { haggles: 2, cash: 0 });
    expect(a.rounds).toEqual(b.rounds);
    expect(a.rounds.length).toBeGreaterThanOrEqual(1);
    for (const r of a.rounds) expect(r.reasons[0].label).toBe('Base');
    let prev = a.asking;
    for (const r of a.rounds) {
      if (r.ok) expect(r.price).toBeLessThan(prev);
      else expect(r.price).toBeGreaterThan(prev);
      prev = r.price;
    }
    expect(a.agreed).toBe(prev);
    // Across many properties both outcomes happen.
    const outcomes = new Set<boolean>();
    for (const k of ['bookmaking', 'numbers', 'cardgame', 'vending', 'loansharking', 'bar', 'restaurant', 'laundromat'] as const) {
      if (!CATALOG[k]) continue;
      outcomes.add(dealView(s, { kind: 'biz', biz: k, district: t.district }, { haggles: 1, cash: 0 }).rounds[0].ok);
    }
    expect(outcomes.size).toBe(2);
  });

  it('haggle odds carry their reasons; pushing twice is harder', () => {
    const s = rich('deal-odds');
    const t: DealTarget = { kind: 'biz', biz: 'bookmaking', district: ourDistrict(s) };
    const o0 = haggleOdds(s, t, 0);
    const o1 = haggleOdds(s, t, 1);
    expect(o1.chance).toBeLessThan(o0.chance);
    expect(o1.reasons.some((r) => r.label === 'You already pushed once')).toBe(true);
  });

  it('cash under the table is cheaper, spends dirty money and draws federal heat — all as named ledger lines', () => {
    const s = rich('deal-cash');
    s.unwashed = 20000;
    const t: DealTarget = { kind: 'biz', biz: 'bookmaking', district: ourDistrict(s) };
    const clean = dealView(s, t, { haggles: 0, cash: 0 });
    const cash = dealView(s, t, { haggles: 0, cash: 0.5 });
    if (cash.cashBlock) return; // an honest seller: no cash
    expect(cash.price).toBeLessThan(clean.price);
    const p = previewAction(s, deal(t, { haggles: 0, cash: 0.5 }));
    expect(p.disabledReason).toBeUndefined();
    expect(p.effects.some((e) => e.type === 'heat' && e.bar === 'federal')).toBe(true);
    const fed = s.heat.federal;
    const r = advanceWeek(s, { actions: [deal(t, { haggles: 0, cash: 0.5 })] });
    expect(reconcile(r.report)).toEqual([]);
    expect(r.report.lines.some((l) => l.label.includes('cash under the table'))).toBe(true);
    expect(r.report.lines.some((l) => l.label.includes('(on the books)'))).toBe(true);
    expect(r.state.heat.federal).toBeGreaterThanOrEqual(Math.min(100, fed + 1));
  });

  it('signing a racket adds the business and puts the man you picked in charge', () => {
    const s = rich('deal-mgr');
    const t: DealTarget = { kind: 'biz', biz: 'bookmaking', district: ourDistrict(s) };
    const fam = familyCandidates(s)[0];
    const mgr = fam ? { source: 'family' as const, charId: fam.id } : { source: 'pro' as const, pro: 0 };
    const before = s.businesses.filter((b) => b.owner === 'player').length;
    const r = advanceWeek(s, { actions: [deal(t, { haggles: 1, cash: 0, mgr })] });
    expect(reconcile(r.report)).toEqual([]);
    const mine = r.state.businesses.filter((b) => b.owner === 'player');
    expect(mine.length).toBe(before + 1);
    const b = mine.find((x) => x.kind === 'bookmaking' && x.boughtWeek === s.week)!;
    const m = r.state.econ!.managers[b.id];
    expect(m).toBeDefined();
    if (fam) expect(m.charId).toBe(fam.id);
    expect(r.state.econ!.dealLog?.at(-1)?.place).toBeTruthy();
    expect(r.report.lines.some((l) => l.label.startsWith('Deal: '))).toBe(true);
  });

  it('a property deal buys the lot at the agreed price', () => {
    const s = rich('deal-lot');
    const l = ensureEcon(s).lots.find((x) => x.status === 'sale' && !x.bidder)!;
    const t: DealTarget = { kind: 'lot', lotId: l.id };
    const v = dealView(s, t, { haggles: 1, cash: 0 });
    expect(v.runs).toBe(false);
    const r = advanceWeek(s, { actions: [deal(t, { haggles: 1, cash: 0 })] });
    expect(reconcile(r.report)).toEqual([]);
    const after = r.state.econ!.lots.find((x) => x.id === l.id)!;
    expect(after.status).toBe('owned');
    expect(after.invested).toBe(v.price);
  });

  it('a buy that cannot be afforded at asking can be once the price comes down', () => {
    const s = rich('deal-afford');
    const t: DealTarget = { kind: 'biz', biz: 'bookmaking', district: ourDistrict(s) };
    const v = dealView(s, t, { haggles: 1, cash: 0 });
    if (v.soured) return;
    s.money = v.price;
    expect(previewAction(s, deal(t, { haggles: 1, cash: 0 })).disabledReason).toBeUndefined();
    expect(previewAction(s, deal(t, { haggles: 0, cash: 0 })).disabledReason).toMatch(/Needs/);
  });

  it('the sim player turns a plain buy into a deal and lets the crew pick the manager', () => {
    const s = rich('deal-sim');
    const t: DealTarget = { kind: 'biz', biz: 'bookmaking', district: ourDistrict(s) };
    const a = autoDeal(s, { kind: 'buyBusiness', biz: 'bookmaking', district: t.district }, { rng: 7 });
    expect(a.kind === 'econ' && a.op.type === 'deal').toBe(true);
    if (a.kind === 'econ' && a.op.type === 'deal') expect(a.op.terms.mgr).toEqual(suggestedManager(s, t));
  });
});

describe('who runs it: family, applicants, time and energy', () => {
  it('minors never run a place; the wife and grown kids can', async () => {
    const { kinCandidates, summerHelpers } = await import('../src/engine/applicants');
    const { age } = await import('../src/engine/characters');
    const s = rich('deal-kin');
    for (const c of kinCandidates(s)) expect(age(s, c)).toBeGreaterThanOrEqual(18);
    for (const c of summerHelpers(s)) expect(kinCandidates(s).some((k) => k.id === c.id)).toBe(false);
    const boss = s.characters[s.playerId];
    if (boss.spouseId && s.characters[boss.spouseId]?.alive) expect(kinCandidates(s).some((k) => k.id === boss.spouseId)).toBe(true);
  });

  it('a busy man brings less of his skill; applicants carry a pitch, time and energy', async () => {
    const { applicants, workload } = await import('../src/engine/applicants');
    const s = rich('deal-apply');
    const t: DealTarget = { kind: 'biz', biz: 'bookmaking', district: ourDistrict(s) };
    const v = dealView(s, t, { haggles: 0, cash: 0 });
    const aps = applicants(s, v.mgrKey);
    for (const a of aps) {
      expect(a.pitch.length).toBeGreaterThan(5);
      expect(a.work.time).toBeGreaterThanOrEqual(0);
      expect(a.work.energy).toBeGreaterThanOrEqual(0);
    }
    const capo = Object.values(s.characters).find((c) => c.alive && c.faction === 'player' && c.rank === 'capo' && s.districts.some((d) => d.capoId === c.id));
    if (capo) expect(workload(s, capo).effort).toBeLessThan(1);
  });

  it('naming the place sticks, and passed-over applicants take it a little personally', async () => {
    const { applicants } = await import('../src/engine/applicants');
    const s = rich('deal-name');
    const t: DealTarget = { kind: 'biz', biz: 'bookmaking', district: ourDistrict(s) };
    const v = dealView(s, t, { haggles: 0, cash: 0 });
    const aps = applicants(s, v.mgrKey);
    const p = previewAction(s, { kind: 'econ', op: { type: 'deal', target: t, terms: { haggles: 0, cash: 0, mgr: { source: 'pro', pro: 0 }, name: 'The Lucky Seven', style: 'doowop', sign: 'pink' } } });
    expect(p.effects.filter((e) => e.type === 'opinion').length).toBe(aps.length);
    const r = advanceWeek(s, { actions: [{ kind: 'econ', op: { type: 'deal', target: t, terms: { haggles: 0, cash: 0, mgr: { source: 'pro', pro: 0 }, name: 'The Lucky Seven', style: 'doowop', sign: 'pink' } } }] });
    expect(reconcile(r.report)).toEqual([]);
    const b = r.state.businesses.find((x) => x.name === 'The Lucky Seven')!;
    expect(b).toBeDefined();
    expect(r.state.econ!.designs?.[b.id]?.style).toBe('doowop');
  });
});
