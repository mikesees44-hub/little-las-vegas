import { describe, expect, it } from 'vitest';
import { previewAction } from '../src/engine/actions';
import { advanceWeek } from '../src/engine/engine';
import { reconcile } from '../src/engine/ledger';
import { newGame } from '../src/engine/newGame';
import { addOpinion } from '../src/engine/relations';
import { sanctioned } from '../src/engine/schemes';
import { buildRulingAgainst, forecast, newDispute, openDispute, tableMembers } from '../src/engine/table';
import type { GameState } from '../src/engine/types';

function withClaim(seed: string): GameState {
  const s = newGame(seed);
  s.claims.push({ district: 'causeway', against: 'manno', week: 1, reason: 'test' });
  return s;
}

describe('war', () => {
  it('needs a casus belli', () => {
    const s = newGame('nocb');
    expect(previewAction(s, { kind: 'declareWar', rival: 'manno', district: 'causeway' }).disabledReason).toMatch(/casus belli/);
  });
  it('a claim lets you declare war; unsanctioned, it angers Philadelphia; the claim is spent', () => {
    const s = withClaim('war');
    const r = advanceWeek(s, { actions: [{ kind: 'declareWar', rival: 'manno', district: 'causeway' }] });
    expect(r.state.wars).toHaveLength(1);
    expect(r.state.rivals.find((x) => x.id === 'manno')!.war).toBe(true);
    expect(r.state.claims).toHaveLength(0);
    expect(r.report.lines.some((l) => l.stat === 'heat.family' && l.amount > 0 && l.label.includes('blessing'))).toBe(true);
    expect(reconcile(r.report)).toEqual([]);
  });
  it('raids move the war score, and winning terms hand over the district', () => {
    let s = withClaim('raid');
    s.money = 100000;
    s = advanceWeek(s, { actions: [{ kind: 'declareWar', rival: 'manno', district: 'causeway' }] }).state;
    const w = s.wars[0];
    const before = w.score;
    s = advanceWeek(s, { actions: [{ kind: 'raid', warId: w.id }] }).state;
    expect(s.wars[0]?.score ?? 0).not.toBe(before);
    // Force a winning position and offer terms until accepted.
    const myBefore = s.districts.find((d) => d.id === 'causeway')!.influence.player ?? 0;
    let won = false;
    for (let i = 0; i < 10 && !won; i++) {
      if (!s.wars.length) break;
      s.wars[0].score = 90;
      s = advanceWeek(s, { actions: [{ kind: 'terms', warId: s.wars[0].id, terms: 'district' }] }).state;
      won = s.wars.length === 0;
    }
    expect(won).toBe(true);
    expect(s.districts.find((d) => d.id === 'causeway')!.influence.player ?? 0).toBeGreaterThan(myBefore);
  });
  it('terms are likelier the better the war is going', () => {
    let s = withClaim('terms');
    s = advanceWeek(s, { actions: [{ kind: 'declareWar', rival: 'manno', district: 'causeway' }] }).state;
    const w = s.wars[0];
    w.score = -20;
    const low = previewAction(s, { kind: 'terms', warId: w.id, terms: 'district' }).acceptance!.chance;
    w.score = 60;
    const high = previewAction(s, { kind: 'terms', warId: w.id, terms: 'district' }).acceptance!.chance;
    expect(high).toBeGreaterThan(low);
  });
});

describe('the Table', () => {
  it('a dispute you raise is heard, you plead, the members vote, and the ruling is recorded', () => {
    let s = newGame('table');
    s = advanceWeek(s, { actions: [{ kind: 'raiseDispute', dispute: 'district', rival: 'manno', district: 'causeway' }] }).state;
    expect(s.disputes).toHaveLength(1);
    let heard = false;
    for (let w = 0; w < 5 && !heard; w++) {
      const ev = s.pendingEvents.find((e) => e.defId === 'hearing');
      if (ev) {
        expect(ev.choices.length).toBeGreaterThanOrEqual(3);
        s = advanceWeek(s, { choices: { [ev.iid]: 'concede' } }).state;
        heard = true;
      } else s = advanceWeek(s, {}).state;
    }
    expect(heard).toBe(true);
    expect(s.disputes[0].ruling).toBeDefined();
    expect(Object.keys(s.disputes[0].ruling!.votes).length).toBeGreaterThan(0);
    expect(s.chronicle.some((c) => c.text.startsWith('The Table ruled'))).toBe(true);
  });
  it('Manno does not vote on his own dispute, and lobbying moves a vote', () => {
    const s = newGame('lobby');
    const d = openDispute(s, newDispute(s, 'district', 'player', 'manno', { district: 'causeway' }));
    const leans = forecast(s, d);
    const manno = s.rivals.find((r) => r.id === 'manno')!.leaderId;
    expect(leans.some((l) => l.member.id === manno)).toBe(false);
    expect(tableMembers(s).some((m) => m.id === manno)).toBe(true);
    const m = leans[0].member;
    expect(leans[0].reasons.some((x) => x.label === 'Your lobbying')).toBe(false);
    const r = advanceWeek(s, { actions: [{ kind: 'lobby', disputeId: d.id, memberId: m.id, mode: 'money' }] });
    const after = forecast(r.state, r.state.disputes.find((x) => x.id === d.id)!).find((l) => l.member.id === m.id)!;
    expect(after.reasons.find((x) => x.label === 'Your lobbying')!.value).toBe(20);
    expect(r.report.lines.some((l) => l.label.startsWith('Lobby:') && l.amount === -1500)).toBe(true);
  });
  it('a sanction from the Table makes the hit legitimate', () => {
    const s = newGame('sanction');
    const lt = Object.values(s.characters).find((c) => c.faction === 'manno' && c.rank === 'capo')!;
    expect(sanctioned(s, lt.id)).toBe(false);
    s.sanctions[lt.id] = s.week + 10;
    expect(sanctioned(s, lt.id)).toBe(true);
  });
  it('losing a dispute brought against you: comply pays, defy means a feud and Philadelphia\'s anger', () => {
    const base = newGame('ruling');
    const d = openDispute(base, newDispute(base, 'reparations', 'manno', 'player', { amount: 4000 }));
    const ev = buildRulingAgainst(base, d);
    const comply: GameState = JSON.parse(JSON.stringify(base));
    comply.pendingEvents = [ev];
    const c = advanceWeek(comply, { choices: { [ev.iid]: 'comply' } });
    expect(c.report.lines.some((l) => l.label.includes('reparations to Manno') && l.amount === -4000)).toBe(true);
    const defy: GameState = JSON.parse(JSON.stringify(base));
    defy.pendingEvents = [ev];
    const f = advanceWeek(defy, { choices: { [ev.iid]: 'defy' } });
    expect(f.state.rivals.find((r) => r.id === 'manno')!.feud).toBe(true);
    expect(f.report.lines.some((l) => l.stat === 'heat.family' && l.amount > 0)).toBe(true);
  });
  it('rivals with a grudge bring you before the Table', () => {
    let found = false;
    for (let g = 0; g < 4 && !found; g++) {
      let s = newGame(`grudgeT${g}`);
      for (const r of s.rivals) addOpinion(s, r.leaderId, s.playerId, 'Test grudge', -80, 0);
      for (let w = 0; w < 52 && !found && !s.gameOver; w++) {
        s = advanceWeek(s, {}).state;
        found = s.disputes.some((d) => d.defendant === 'player');
      }
    }
    expect(found).toBe(true);
  });
});
