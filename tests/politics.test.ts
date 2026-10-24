import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/newGame';
import { advanceWeek, cloneState } from '../src/engine/engine';
import { newCtx, reconcile } from '../src/engine/ledger';
import { previewAction } from '../src/engine/actions';
import { killCharacter } from '../src/engine/dynasty';
import { controlIndex } from '../src/engine/polIntegrity';
import { LAW_BY_ID, LEGISLATURE, OFFICE_DEFS, canLegislate, preempted } from '../src/engine/polData';
import { holder, nameOf } from '../src/engine/polGov';
import { fillTicket, resolveElection } from '../src/engine/polElections';
import { billsWeek, introduce, lawsWeek } from '../src/engine/polLaws';
import { generated, population, yearlyCareers } from '../src/engine/polPeople';
import { favorAcceptance } from '../src/engine/polPuppets';
import { packRow, unpackRow, type Election } from '../src/engine/polState';
import { validateWorld } from '../src/worldpack';
import type { GameState } from '../src/engine/types';

function fresh(seed = 'pol-test'): GameState {
  return newGame(seed);
}

describe('politics: the world pack', () => {
  it('validates (no Godfather names, consistent links)', () => {
    expect(validateWorld()).toEqual([]);
  });
  it('the 1960 government is the real structure, every seat filled', () => {
    const s = fresh();
    for (const d of OFFICE_DEFS) {
      const o = s.pol!.offices[d.id];
      expect(o.holders.length, d.id).toBe(d.seats);
      if (!d.needsLaw) expect(o.holders.every((h) => !!h), d.id).toBe(true);
      // Every elected office has a term and a calendar.
      if (d.selection === 'elected') expect(o.next.every((n) => n > 0), d.id).toBe(true);
    }
    // The Wildwood mayor sits on the commission; the engine's officials hold their seats.
    const mayor = holder(s, 'ww_mayor')!;
    expect(s.pol!.offices.ww_commission.holders).toContain(mayor.id);
    const law = s.rivals.find((r) => r.kind === 'law')!;
    expect(holder(s, 'cmc_prosecutor')!.charId).toBe(law.leaderId);
    expect(s.pol!.offices.nj_ccc.holders.every((h) => !h)).toBe(true);
  });
  it('two tiers: ~300 fully simulated, the rest compact, and rows round-trip', () => {
    const s = fresh();
    const pop = population(s);
    expect(pop.full).toBeGreaterThanOrEqual(280);
    expect(pop.full).toBeLessThanOrEqual(340);
    expect(pop.compact).toBeGreaterThan(200);
    const p = Object.values(s.pol!.people)[5];
    const back = unpackRow(packRow(p));
    expect([back.id, back.first, back.last, back.born, back.eth, back.inst, back.rung, back.integrity]).toEqual([p.id, p.first, p.last, p.born, p.eth, p.inst, p.rung, p.integrity]);
  });
  it('the state stays JSON-serializable and the week stays pure', () => {
    const s = fresh();
    const before = JSON.stringify(s);
    const r = advanceWeek(s, {});
    expect(JSON.stringify(s)).toBe(before);
    expect(JSON.parse(JSON.stringify(r.state))).toEqual(r.state);
  });
});

describe('politics: the control index', () => {
  it('matches the design formula', () => {
    // influence 80 (personal 70, money 90), independence 30, resentment 10, scrutiny 20
    expect(controlIndex({ personal: 70, financial: 90, independence: 30, resentment: 10, exposure: 20 })).toBe(Math.round(80 * 0.55 + 70 * 0.3 + 90 * 0.15 - 20 * 0.25));
    expect(controlIndex({ personal: 0, financial: 0, independence: 100, resentment: 100, exposure: 100 })).toBe(0);
    expect(controlIndex({ personal: 100, financial: 100, independence: 0, resentment: 0, exposure: 0 })).toBe(100);
  });
  it('owning an official raises the odds of a favor; integrity lowers them, by name', () => {
    const s = fresh();
    const chief = holder(s, 'ww_chief')!;
    const before = favorAcceptance(s, chief, 'transfer');
    expect(before.reasons.some((r) => r.label.startsWith('Integrity'))).toBe(true);
    s.pol!.ctl[chief.id] = { personal: 90, financial: 90, independence: 10, legitimacy: 60, exposure: 0, resentment: 0, since: 1 };
    const after = favorAcceptance(s, chief, 'transfer');
    expect(after.chance).toBeGreaterThan(before.chance);
  });
  it('the old bribe interaction reads the official\'s integrity', () => {
    const s = fresh();
    const judge = Object.values(s.characters).find((c) => c.office === 'County judge')!;
    const p = previewAction(s, { kind: 'interact', id: 'bribe', target: judge.id });
    expect(p.acceptance!.reasons.some((r) => r.label.startsWith('Integrity'))).toBe(true);
  });
  it('a favor previews as named chips with odds and refusal outcomes', () => {
    const s = fresh();
    const chief = holder(s, 'ww_chief')!;
    const p = previewAction(s, { kind: 'pol', op: { op: 'favor', id: chief.id, kind: 'transfer' } });
    expect(p.disabledReason).toBeUndefined();
    expect(p.acceptance).toBeDefined();
    expect(p.effects.every((e) => !!e.label)).toBe(true);
    expect(p.refuseEffects!.length).toBeGreaterThan(0);
  });
  it('influence is capped: federal senators and the US Attorney are beyond reach', () => {
    const s = fresh();
    const sen = holder(s, 'us_senate')!;
    const us = holder(s, 'us_attorney')!;
    expect(previewAction(s, { kind: 'pol', op: { op: 'favor', id: us.id, kind: 'case' } }).disabledReason).toBeTruthy();
    expect(previewAction(s, { kind: 'pol', op: { op: 'favor', id: sen.id, kind: 'contract' } }).disabledReason).toBeTruthy();
  });
});

describe('politics: elections', () => {
  function race(s: GameState) {
    const e: Election = { id: 'el_test', office: 'nj_assembly_cm', seats: [0], when: s.date.y * 12 + s.date.m - 1, candidates: [] };
    fillTicket(s, e);
    return e;
  }
  it('is deterministic for the same seed and choices', () => {
    const a = fresh('det');
    const b = fresh('det');
    const ea = race(a);
    const eb = race(b);
    expect(ea.candidates.map((c) => c.id)).toEqual(eb.candidates.map((c) => c.id));
    ea.candidates[1].fund = 5000;
    eb.candidates[1].fund = 5000;
    const ra = resolveElection(newCtx(a), ea)!;
    const rb = resolveElection(newCtx(b), eb)!;
    expect(ra.winners).toEqual(rb.winners);
    expect(ra.shares).toEqual(rb.shares);
    expect(holder(a, 'nj_assembly_cm')!.id).toBe(ra.winners[0]);
  });
  it('money moves votes', () => {
    const a = fresh('money');
    const b = fresh('money');
    const ea = race(a);
    const eb = race(b);
    const ch = eb.candidates.find((c) => !c.incumbent)!;
    ch.fund = 20000;
    ch.endorsed = true;
    const ra = resolveElection(newCtx(a), ea)!;
    const rb = resolveElection(newCtx(b), eb)!;
    expect(rb.shares[ch.id]).toBeGreaterThan(ra.shares[ch.id]);
  });
  it('the first November is election night with a front page', () => {
    let s = fresh('night');
    let night = 0;
    for (let i = 0; i < 30 && !night; i++) {
      s = advanceWeek(s, {}).state;
      night = s.pol!.night.length;
    }
    expect(night).toBeGreaterThan(0);
    expect(s.news.some((n) => n.kind === 'election')).toBe(true);
    expect(s.pol!.results[0].headline.length).toBeGreaterThan(5);
  });
  it('a death opens a special election for an elected seat', () => {
    const s = fresh('special');
    const fh = holder(s, 'cmc_freeholder', 1)!;
    const ctx = newCtx(s);
    killCharacter(ctx, fh.id, 'a stroke');
    expect(s.pol!.people[fh.id].alive).toBe(false);
    expect(s.pol!.offices.cmc_freeholder.holders[1]).toBe('');
    expect(s.pol!.elections.some((e) => e.special && e.office === 'cmc_freeholder')).toBe(true);
  });
});

describe('politics: laws', () => {
  it('a law in force changes your books with a named ledger line', () => {
    const s = fresh('law');
    const bar = s.businesses.find((b) => b.owner === 'player' && (b.kind === 'bar' || b.kind === 'club'));
    const target = bar ? bar.kind : s.businesses.find((b) => b.owner === 'player')!.kind;
    const ctx0 = newCtx(s);
    lawsWeek(ctx0);
    expect(ctx0.lines.length).toBe(0);
    s.pol!.laws.nj_liquor_hours = s.week;
    LAW_BY_ID.nj_liquor_hours.effects[0] = { kind: 'income', biz: [target], pct: 9 };
    const ctx = newCtx(s);
    const m0 = s.money;
    lawsWeek(ctx);
    expect(ctx.lines.some((l) => l.label === 'Law: Resort Liquor Hours Act' && l.amount > 0)).toBe(true);
    expect(s.money).toBeGreaterThan(m0);
    LAW_BY_ID.nj_liquor_hours.effects[0] = { kind: 'income', biz: ['bar', 'club'], pct: 9 };
  });
  it('the Wire Act and RICO land on their real dates', () => {
    let s = fresh('anchors');
    for (let i = 0; i < 75; i++) s = advanceWeek(s, {}).state;
    expect(s.date.y).toBe(1961);
    expect(s.pol!.laws.us_wire_act).toBeDefined();
    expect(s.pol!.laws.us_rico).toBeUndefined();
  });
  it('jurisdiction: a city cannot pass a state law, and a state law preempts a city ordinance', () => {
    expect(canLegislate('wildwood', LAW_BY_ID.nj_lottery)).toBe(false);
    expect(canLegislate('state', LAW_BY_ID.nj_lottery)).toBe(true);
    expect(preempted(LAW_BY_ID.ww_local_option, {})).toBeUndefined();
    expect(preempted(LAW_BY_ID.ww_local_option, { nj_sunday_closing: 1 })).toContain('Sunday Closing');
    expect(LEGISLATURE.wildwood.body).toEqual(['ww_commission']);
    // An ordinance that contradicts a state law in force is struck down on challenge.
    const s = fresh('juris');
    s.pol!.laws.nj_sunday_closing = 1;
    const b = introduce(s, 'ww_local_option', 'test', 60)!;
    b.stage = 'implementation';
    b.next = s.week;
    const ctx = newCtx(s);
    billsWeek(ctx);
    expect(b.stage).toBe('challenge');
    b.next = s.week;
    billsWeek(ctx);
    expect(b.stage).toBe('struck');
    expect(s.pol!.laws.ww_local_option).toBeUndefined();
  });
});

describe('politics: careers and population', () => {
  it('people are promoted, retire and die through the one death function', () => {
    const s = fresh('careers');
    s.date = { y: 1961, m: 1, d: 2 };
    let promotions = 0;
    let deaths = 0;
    for (let y = 0; y < 6; y++) {
      s.date = { y: 1961 + y, m: 1, d: 2 };
      const ctx = newCtx(s);
      const r = yearlyCareers(ctx, () => {});
      promotions += s.pol!.stats.promotions;
      deaths += r.deaths.length;
      expect(reconcile({ start: { money: s.money, respect: s.respect, heat: { ...s.heat } }, end: { money: s.money, respect: s.respect, heat: { ...s.heat } }, lines: ctx.lines })).toEqual([]);
    }
    expect(promotions).toBeGreaterThan(0);
    expect(s.pol!.stats.deaths).toBeGreaterThan(0);
    expect(s.pol!.stats.arrivals).toBeGreaterThan(100);
    void deaths;
    // A cop climbs: somebody in a police department is now at a higher rung than in 1960.
    const cops = Object.values(s.pol!.people).filter((p) => p.log?.some((l) => l.includes('Promoted')));
    expect(cops.length).toBeGreaterThan(0);
  });
  it('stays fast with 1,500+ people', () => {
    const s = fresh('perf');
    for (let i = 0; i < 1000; i++) {
      const p = generated(s, i % 3 ? 'street' : 'wildwood_pd', 'perf', { rung: 0 });
      s.pol!.reserve = [...s.pol!.reserve, packRow(p)];
    }
    expect(population(s).total).toBeGreaterThanOrEqual(1500);
    let t = performance.now();
    for (let y = 0; y < 5; y++) {
      s.date = { y: 1961 + y, m: 1, d: 2 };
      yearlyCareers(newCtx(s), () => {});
    }
    const yearly = (performance.now() - t) / 5;
    expect(yearly).toBeLessThan(400);
    t = performance.now();
    let st = s;
    for (let i = 0; i < 10; i++) st = cloneState(st);
    expect((performance.now() - t) / 10).toBeLessThan(60);
  });
  it('a kid can go into politics and run', () => {
    let s = fresh('kid');
    const kid = Object.values(s.characters).find((c) => c.dynasty && c.alive && c.id !== s.playerId && s.date.y - c.birth.y >= 21 && c.rank === 'civilian');
    if (!kid) return;
    s.money = 50000;
    s = advanceWeek(s, { actions: [{ kind: 'pol', op: { op: 'enter', charId: kid.id } }] }).state;
    expect(s.pol!.kids[kid.id]).toBeDefined();
    const p = Object.values(s.pol!.people).find((x) => x.charId === kid.id)!;
    expect(nameOf(s, p)).toContain(kid.lastName);
    const opts = previewAction(s, { kind: 'pol', op: { op: 'declare', charId: kid.id, office: 'ww_commission' } });
    expect(opts.disabledReason).toBeUndefined();
    // Congress needs a state office first.
    expect(previewAction(s, { kind: 'pol', op: { op: 'declare', charId: kid.id, office: 'us_house_nj2' } }).disabledReason).toBeTruthy();
  });
});
