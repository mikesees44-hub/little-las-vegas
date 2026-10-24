import { describe, expect, it } from 'vitest';
import { previewAction } from '../src/engine/actions';
import { washCapacity } from '../src/engine/business';
import { capos, crew } from '../src/engine/characters';
import { holder, SEATS, TASKS } from '../src/engine/council';
import { buildUltimatum } from '../src/engine/crewlife';
import { advanceWeek } from '../src/engine/engine';
import { reconcile } from '../src/engine/ledger';
import { newGame } from '../src/engine/newGame';
import { addOpinion, opinion } from '../src/engine/relations';
import type { GameState } from '../src/engine/types';

describe('the administration', () => {
  it('a new game fills the council and every seat has a valid task', () => {
    for (let i = 0; i < 10; i++) {
      const s = newGame(`council${i}`);
      for (const st of SEATS) expect(TASKS[s.council[st].task].seat).toBe(st);
      expect(holder(s, 'underboss')).toBeTruthy();
      expect(holder(s, 'consigliere')).toBeTruthy();
    }
  });
  it('the fixer greasing the cops shows up by name and cools local heat', () => {
    const s = newGame('fixer');
    s.heat.local = 50;
    s.council.fixer.task = 'fix_cops';
    const r = advanceWeek(s, {});
    const lines = r.report.lines.filter((l) => l.label.startsWith('Fixer'));
    expect(lines.some((l) => l.stat === 'money' && l.amount === -100)).toBe(true);
    expect(lines.some((l) => l.stat === 'heat.local' && l.amount < 0)).toBe(true);
  });
  it('a bagman laundering raises wash capacity, more with more skill', () => {
    const s = newGame('bag');
    s.council.bagman.task = 'bag_tax';
    const base = washCapacity(s);
    s.council.bagman.task = 'bag_launder';
    const withTask = washCapacity(s);
    expect(withTask).toBeGreaterThan(base);
    holder(s, 'bagman')!.attributes.business = 95;
    expect(washCapacity(s)).toBeGreaterThan(withTask);
  });
  it('appointing someone moves him into the seat and out of any other', () => {
    let s = newGame('appoint');
    const c = crew(s).find((x) => x.rank === 'soldier' && x.id !== s.council.enforcer.holderId)!;
    s = advanceWeek(s, { actions: [{ kind: 'appoint', seat: 'enforcer', charId: c.id }] }).state;
    expect(s.council.enforcer.holderId).toBe(c.id);
    s = advanceWeek(s, { actions: [{ kind: 'appoint', seat: 'fixer', charId: c.id }] }).state;
    expect(s.council.fixer.holderId).toBe(c.id);
    expect(s.council.enforcer.holderId).toBeUndefined();
  });
});

describe('capo contracts', () => {
  it('a harsher contract needs his consent; a kinder one is certain and pleases him', () => {
    const s = newGame('contract');
    const c = capos(s)[0];
    const harsh = previewAction(s, { kind: 'contract', charId: c.id, keep: 0.25 });
    expect(harsh.acceptance).toBeDefined();
    expect(harsh.acceptance!.reasons.some((r) => r.label.startsWith('Gives up'))).toBe(true);
    const kind = previewAction(s, { kind: 'contract', charId: c.id, keep: 0.35 });
    expect(kind.acceptance).toBeUndefined();
    const before = opinion(s, c.id, s.playerId);
    const r = advanceWeek(s, { actions: [{ kind: 'contract', charId: c.id, keep: 0.35 }] });
    expect(r.state.characters[c.id].keep).toBe(0.35);
    expect(opinion(r.state, c.id, r.state.playerId)).toBeGreaterThan(before);
  });
});

describe('crew hustle and neglect', () => {
  it('squeezing takes more of a man\'s hustle than taxing, and "earn" makes him rich', () => {
    const base = newGame('hustle');
    const run = (policy: 'tax' | 'earn' | 'squeeze') => {
      const s: GameState = JSON.parse(JSON.stringify(base));
      for (const c of crew(s)) c.policy = policy;
      const r = advanceWeek(s, {});
      return { take: r.report.lines.filter((l) => l.label.startsWith('Street hustle')).reduce((a, l) => a + l.amount, 0), wealth: crew(r.state).reduce((a, c) => a + c.wealth, 0) };
    };
    const tax = run('tax');
    const squeeze = run('squeeze');
    const earn = run('earn');
    expect(squeeze.take).toBeGreaterThan(tax.take);
    expect(earn.take).toBe(0);
    expect(earn.wealth).toBeGreaterThan(tax.wealth);
  });
  it('an ignored man shows warning signs before he defects', () => {
    let s = newGame('neglect');
    const c = crew(s).find((x) => x.rank === 'associate' && !x.traits.includes('Loyal-to-a-fault'))!;
    addOpinion(s, c.id, s.playerId, 'Test: nobody calls', -30, 0);
    let warned = -1;
    let defected = -1;
    for (let w = 0; w < 60 && defected < 0; w++) {
      s = advanceWeek(s, {}).state;
      const m = s.characters[c.id];
      if (warned < 0 && (m.defectStage ?? 0) >= 1) warned = w;
      if (m.faction !== 'player') defected = w;
    }
    expect(warned).toBeGreaterThanOrEqual(0);
    if (defected >= 0) expect(defected).toBeGreaterThan(warned);
  });
  it('talking to him resets the drift', () => {
    let s = newGame('attention');
    const c = crew(s).find((x) => x.rank === 'associate')!;
    c.neglect = 15;
    c.defectStage = 1;
    s = advanceWeek(s, { actions: [{ kind: 'interact', id: 'gift_small', target: c.id }] }).state;
    expect(s.characters[c.id].defectStage).toBe(0);
    expect(s.characters[c.id].neglect ?? 0).toBeLessThanOrEqual(1);
  });
});

describe('factions and coups', () => {
  it('discontented capos form a faction, issue an ultimatum, and refusing schedules a coup', () => {
    let s = newGame('faction');
    for (const c of capos(s)) addOpinion(s, c.id, s.playerId, 'Test: hates the boss', -90, 0);
    let ult = undefined as undefined | string;
    for (let w = 0; w < 14 && !ult; w++) {
      s = advanceWeek(s, {}).state;
      ult = s.pendingEvents.find((e) => e.defId === 'faction_ultimatum')?.iid;
      if (!ult) for (const c of capos(s)) addOpinion(s, c.id, s.playerId, 'Test: hates the boss', -10, 0);
    }
    expect(s.factions.length).toBeGreaterThan(0);
    expect(ult).toBeTruthy();
    const ev = s.pendingEvents.find((e) => e.iid === ult)!;
    expect(ev.choices.map((c) => c.id)).toEqual(expect.arrayContaining(['buy', 'crush', 'refuse']));
    const r = advanceWeek(s, { choices: { [ult!]: 'refuse' } });
    expect(r.state.scheduled.some((x) => x.key === 'coup')).toBe(true);
    // The coup resolves through the one death function or a walk-out, and the books still balance.
    let t = r.state;
    for (let w = 0; w < 8 && t.scheduled.some((x) => x.key === 'coup'); w++) {
      const rr = advanceWeek(t, {});
      expect(reconcile(rr.report)).toEqual([]);
      t = rr.state;
    }
    expect(t.factions.find((f) => f.id === ev.meta!.faction)).toBeUndefined();
  });
  it('an ultimatum names its leader with a portrait', () => {
    const s = newGame('ult');
    const [a, b] = capos(s);
    const ev = buildUltimatum(s, { id: 'fx', leaderId: a.id, memberIds: [a.id, b.id], demand: 'contracts', since: 1 });
    expect(ev.actors?.[0]).toBe(a.id);
  });
});

describe('hiring and edicts', () => {
  it('hiring a specialist creates him and charges his weekly fee', () => {
    let s = newGame('hire');
    const spec = s.hirePool.find((h) => h.kind !== 'recruit')!;
    s.money = 50000;
    s = advanceWeek(s, { actions: [{ kind: 'hire', specId: spec.id }] }).state;
    const man = crew(s).find((c) => c.specialty === spec.kind && c.firstName === spec.firstName);
    expect(man).toBeTruthy();
    const r = advanceWeek(s, {});
    expect(r.report.lines.some((l) => l.label.startsWith('Specialist fees'))).toBe(true);
  });
  it('the No Junk edict bans the pipeline and is posted by name', () => {
    let s = newGame('edict');
    s = advanceWeek(s, { actions: [{ kind: 'edict', edict: 'nojunk', on: true }, { kind: 'edict', edict: 'omerta', on: true }] }).state;
    expect(s.edicts.nojunk).toBe(true);
    expect(previewAction(s, { kind: 'buyBusiness', biz: 'narcotics', district: 'docks' }).disabledReason).toMatch(/edict/);
    const r = advanceWeek(s, {});
    expect(r.report.lines.some((l) => l.label.startsWith('Edict: Strict Omertà'))).toBe(true);
  });
});
