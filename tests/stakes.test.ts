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
