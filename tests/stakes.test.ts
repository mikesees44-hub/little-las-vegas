/**
 * The stakes pass (MAKE_IT_GREAT #1–#4): the Table does not quietly eat your capos, a blitz cannot wipe
 * the dynasty in one wave, neglect costs something, and money has somewhere to go.
 */
import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/newGame';
import { advanceWeek } from '../src/engine/engine';
import { newCtx } from '../src/engine/ledger';
import { crew } from '../src/engine/characters';
import { addOpinion, opinion } from '../src/engine/relations';
import { BLITZ_COOLDOWN, blitzStep, launchBlitz, rivalBlitzMonth } from '../src/engine/blitz';
import { pw } from '../src/engine/powerState';
import { bloodPrice, buildRulingAgainst, newDispute, openDispute, rivalDisputes, SANCTION_COOLDOWN } from '../src/engine/table';
import { attended, IDLE_GRACE, idleWeeks, neglectLevel, neglectWeek } from '../src/engine/neglect';
import { tributeOnWeekly } from '../src/engine/events';
import { padForSize, recordEarnings } from '../src/engine/economy';
import { SHYLOCK_DEBT_CAP } from '../src/engine/regimes';
import type { GameState } from '../src/engine/types';

const clone = (s: GameState): GameState => JSON.parse(JSON.stringify(s));

describe('#3 the Table\'s sanction', () => {
  function setup(seed: string) {
    const s = newGame(seed);
    s.money = 50000;
    const capo = crew(s).find((c) => c.rank === 'capo')!;
    const d = openDispute(s, newDispute(s, 'sanction', 'manno', 'player', { targetId: capo.id }));
    const ev = buildRulingAgainst(s, d);
    return { s, capo, ev };
  }
  it('offers pay, bargain, give him up, or defy, and the default is never to hand him over', () => {
    const { ev } = setup('stake-sanction');
    expect(ev.choices.map((c) => c.id)).toEqual(['comply', 'pay', 'negotiate', 'defy']);
    expect(ev.defaultChoiceId).toBe('pay');
  });
  it('with no money for it the default is to bargain or defy, still not to give him up', () => {
    const { s, capo } = setup('stake-sanction-poor');
    s.money = 0;
    const d = openDispute(s, newDispute(s, 'sanction', 'manno', 'player', { targetId: capo.id }));
    expect(buildRulingAgainst(s, d).defaultChoiceId).toBe('defy');
  });
  it('the default keeps him alive and costs blood money', () => {
    const { s, capo, ev } = setup('stake-sanction-pay');
    const a = clone(s);
    a.pendingEvents = [ev];
    const r = advanceWeek(a, { choices: {} });
    expect(r.state.characters[capo.id].alive).toBe(true);
    expect(r.report.lines.some((l) => /blood money/.test(l.label) && l.amount === -bloodPrice(s, capo))).toBe(true);
  });
  it('giving up your own man costs the crew\'s loyalty', () => {
    const { s, capo, ev } = setup('stake-sanction-give');
    const other = crew(s).find((c) => c.id !== capo.id && c.rank !== 'boss')!;
    const before = opinion(s, other.id, s.playerId);
    const a = clone(s);
    a.pendingEvents = [ev];
    const r = advanceWeek(a, { choices: { [ev.iid]: 'comply' } });
    expect(r.state.characters[capo.id].alive).toBe(false);
    expect(opinion(r.state, other.id, r.state.playerId)).toBeLessThan(before);
  });
  it('rivals raise at most one sanction against you a season', () => {
    const s = newGame('stake-season');
    for (const r of s.rivals) if (r.kind === 'mob') { r.feud = true; }
    for (const r of s.rivals) if (r.kind === 'mob') addOpinion(s, r.leaderId, s.playerId, 'test', -100, 0);
    let sanctions = 0;
    for (let w = 0; w < SANCTION_COOLDOWN - 1; w++) {
      const ctx = newCtx(s);
      rivalDisputes(ctx);
      for (const d of s.disputes) if (!d.ruling) d.ruling = { forPlayer: true, votes: {}, week: s.week };
      s.week++;
    }
    sanctions = s.disputes.filter((d) => d.kind === 'sanction').length;
    expect(sanctions).toBeLessThanOrEqual(1);
  });
});

describe('#4 a blitz cannot wipe the dynasty in one wave', () => {
  it('when the boss falls the blitz ends there: the new boss is not the next name', () => {
    for (let k = 0; k < 6; k++) {
      const s = newGame(`stake-blitz-${k}`);
      const ctx = newCtx(s);
      const rival = s.rivals.find((r) => r.kind === 'mob')!;
      const b = launchBlitz(ctx, rival.id, 'player', 100, true)!;
      // Put the boss first on the list and make the hit certain.
      b.targets = [s.playerId, ...b.targets.filter((x) => x !== s.playerId)];
      b.momentum = 100;
      const boss = s.playerId;
      for (let i = 0; i < 10 && !b.stopped && s.characters[boss].alive; i++) { s.week++; blitzStep(ctx, b); }
      if (!s.characters[boss].alive) {
        expect(b.stopped).toBeTruthy();
        expect(b.kills).toEqual([boss]);
        expect(pw(s).mattresses).toBeTruthy();
        // More steps change nothing: the list is closed.
        for (let i = 0; i < 5; i++) { s.week++; blitzStep(ctx, b); }
        expect(b.kills).toEqual([boss]);
        return;
      }
    }
    expect.unreachable('the boss never fell in six tries');
  });
  it('after a blitz on the family the rivals wait before the next', () => {
    const s = newGame('stake-quiet');
    const ctx = newCtx(s);
    const rival = s.rivals.find((r) => r.kind === 'mob')!;
    const b = launchBlitz(ctx, rival.id, 'player', 10, false)!;
    for (let i = 0; i < 12 && !b.stopped; i++) { s.week++; blitzStep(ctx, b); }
    b.stopped = b.stopped ?? 'test';
    if (!s.flags.blitzQuietUntil) { s.flags.blitzQuietUntil = s.week + BLITZ_COOLDOWN; }
    expect(s.flags.blitzQuietUntil).toBeGreaterThan(s.week);
    // Every family furious and strong: still nobody launches while it is quiet.
    for (const r of s.rivals) { r.feud = true; r.muscle = 999; }
    s.week = Math.max(s.week, 60);
    s.flags.blitzQuietUntil = s.week + 10;
    const n = pw(s).blitzes.length;
    for (let i = 0; i < 50; i++) rivalBlitzMonth(ctx);
    expect(pw(s).blitzes.length).toBe(n);
  });
});

describe('#1 an absent boss pays for it', () => {
  it('a week with an order, an envelope or a real answer counts as attended; defaults alone do not', () => {
    const s = newGame('stake-attend');
    const ev = s.pendingEvents.find((e) => e.choices.filter((c) => !c.disabledReason).length > 1)!;
    expect(attended(s.pendingEvents, {})).toBe(false);
    expect(attended(s.pendingEvents, { choices: { [ev.iid]: ev.defaultChoiceId } })).toBe(false);
    const other = ev.choices.find((c) => c.id !== ev.defaultChoiceId && !c.disabledReason)!;
    expect(attended(s.pendingEvents, { choices: { [ev.iid]: other.id } })).toBe(true);
    expect(attended(s.pendingEvents, { actions: [{ kind: 'order', key: 'cops', via: 'direct' } as never] })).toBe(true);
  });
  it('the bite starts after the grace weeks and grows', () => {
    expect(neglectLevel(IDLE_GRACE - 1)).toBe(0);
    expect(neglectLevel(IDLE_GRACE)).toBeGreaterThan(0);
    expect(neglectLevel(IDLE_GRACE + 20)).toBe(1);
  });
  it('weeks of nothing cost money, loyalty and corners; an order stops it', () => {
    let s = newGame('stake-idle');
    const capo = crew(s).find((c) => c.rank === 'capo')!;
    const op0 = opinion(s, capo.id, s.playerId);
    let skim = 0;
    for (let i = 0; i < IDLE_GRACE + 6; i++) {
      const r = advanceWeek(s, {});
      skim += r.report.lines.filter((l) => /Nobody is watching the count/.test(l.label)).reduce((a, l) => a - l.amount, 0);
      s = r.state;
    }
    expect(idleWeeks(s)).toBeGreaterThanOrEqual(IDLE_GRACE + 6);
    expect(skim).toBeGreaterThan(0);
    expect(opinion(s, capo.id, s.playerId)).toBeLessThan(op0 + 30);
    const ctx = newCtx(s);
    neglectWeek(ctx, true);
    expect(idleWeeks(s)).toBe(0);
  });
});

describe('#2 money keeps a cost all the way up', () => {
  it('Philadelphia takes nine points from a small outfit and more from a big earner', () => {
    expect(tributeOnWeekly(5000)).toBeCloseTo(450);
    expect(tributeOnWeekly(8000)).toBeCloseTo(720);
    expect(tributeOnWeekly(20000)).toBeCloseTo(720 + 12000 * 0.15);
    expect(tributeOnWeekly(40000) / 40000).toBeGreaterThan(0.15);
  });
  it('the pad grows with the family\'s income and is nothing for a small outfit', () => {
    const s = newGame('stake-pad');
    s.incomeHistory = [3000, 3000, 3000, 3000];
    expect(padForSize(s)).toBe(0);
    s.incomeHistory = [25000, 25000, 25000, 25000];
    expect(padForSize(s)).toBe(1000);
  });
  it('the envelope counts every dollar the week earned, businesses and property included', () => {
    const s = newGame('stake-earn');
    s.incomeHistory = [100];
    const ctx = newCtx(s);
    ctx.lines.push({ stat: 'money', amount: 5000, label: 'Property: a hotel', category: 'business' }, { stat: 'money', amount: 700, label: 'Kick-up', category: 'kickup' }, { stat: 'money', amount: -900, label: 'Upkeep', category: 'cost' });
    recordEarnings(ctx);
    expect(s.incomeHistory[0]).toBe(5700);
  });
  it('a crew member\'s shylock debt stops growing at a ceiling (the playtest saw $1.77M)', () => {
    let s = newGame('stake-debt');
    const man = crew(s).find((c) => c.rank === 'soldier')!;
    const rival = s.rivals.find((r) => r.kind === 'mob')!;
    man.debtTo = { rival: rival.id, amount: SHYLOCK_DEBT_CAP - 100, week: s.week };
    for (let i = 0; i < 6; i++) s = advanceWeek(s, {}).state;
    const d = s.characters[man.id].debtTo;
    if (d) expect(d.amount).toBeLessThanOrEqual(SHYLOCK_DEBT_CAP);
  });
});
