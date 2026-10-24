import { describe, expect, it } from 'vitest';
import { previewAction } from '../src/engine/actions';
import { advanceWeek } from '../src/engine/engine';
import { reconcile } from '../src/engine/ledger';
import { GRAND_JURY, OPEN_FILE, convictionOdds, evidenceGain } from '../src/engine/longgame';
import { newGame } from '../src/engine/newGame';
import type { GameState } from '../src/engine/types';

function answer(s: GameState, defId: string, choice: string) {
  const ev = s.pendingEvents.find((e) => e.defId === defId);
  expect(ev, `expected a ${defId} card`).toBeTruthy();
  return { [ev!.iid]: choice };
}

function until(s: GameState, pred: (s: GameState) => boolean, max = 30) {
  for (let i = 0; i < max && !pred(s); i++) {
    const r = advanceWeek(s, {});
    expect(reconcile(r.report)).toEqual([]);
    s = r.state;
  }
  return s;
}

describe('the long game', () => {
  it('a new boss has no case; federal heat builds evidence and opens a file', () => {
    let s = newGame('law1');
    s = advanceWeek(s, {}).state;
    expect(s.legal?.stage).toBe('quiet');
    s.heat.federal = 75;
    expect(evidenceGain(s).total).toBeGreaterThan(0);
    s.legal!.evidence = OPEN_FILE - 0.5;
    s = advanceWeek(s, {}).state;
    expect(s.legal!.stage).toBe('investigation');
    expect(previewAction(s, { kind: 'legal', op: 'retainer' }).disabledReason).toBeUndefined();
  });

  it('RICO (from October 1970) makes evidence build half again as fast', () => {
    const s = newGame('law2');
    s.heat.federal = 70;
    const before = evidenceGain(s).total;
    s.date = { y: 1971, m: 1, d: 4 };
    const after = evidenceGain(s);
    expect(after.total).toBeCloseTo(before * 1.5, 5);
    expect(after.reasons.some((r) => r.label.includes('RICO'))).toBe(true);
  });

  it('grand jury, indictment, trial: the whole road, with named lines and a verdict', () => {
    let s = newGame('law3');
    s = advanceWeek(s, {}).state;
    s.legal!.stage = 'investigation';
    s.legal!.evidence = GRAND_JURY + 40;
    s.money = 50000;
    s = until(s, (x) => x.pendingEvents.some((e) => e.defId === 'grand_jury'));
    s = advanceWeek(s, { choices: answer(s, 'grand_jury', 'nothing') }).state;
    s = until(s, (x) => x.pendingEvents.some((e) => e.defId === 'indictment') || x.legal!.stage === 'investigation');
    if (s.legal!.stage === 'investigation') return; // no true bill — a legal outcome too
    s.money = 50000;
    const r = advanceWeek(s, { choices: answer(s, 'indictment', 'bail') });
    expect(r.report.lines.some((l) => l.label === 'Indictment' && l.amount === -10000)).toBe(true);
    s = r.state;
    expect(s.legal!.stage).toBe('trial');
    expect(s.legal!.bail).toBe(true);
    s = until(s, (x) => x.pendingEvents.some((e) => e.defId === 'trial'));
    const odds = convictionOdds(s.legal!);
    expect(odds).toBeGreaterThan(0.1);
    s = advanceWeek(s, { choices: answer(s, 'trial', 'quiet') }).state;
    expect(['prison', 'quiet']).toContain(s.legal!.stage);
    if (s.legal!.stage === 'prison') {
      expect(s.characters[s.playerId].imprisonedUntil).toBeGreaterThan(s.week);
      const r2 = advanceWeek(s, {});
      expect(r2.report.lines.some((l) => l.label.startsWith('Running things from inside'))).toBe(true);
    }
  });

  it('a guilty plea means a shorter stretch and parole can bring him home', () => {
    let s = newGame('law4');
    s = advanceWeek(s, {}).state;
    s.legal!.stage = 'grandjury';
    s.legal!.evidence = 100;
    s.legal!.next = s.week;
    s = until(s, (x) => x.pendingEvents.some((e) => e.defId === 'indictment'), 10);
    if (!s.pendingEvents.some((e) => e.defId === 'indictment')) return;
    s = advanceWeek(s, { choices: answer(s, 'indictment', 'plea') }).state;
    expect(s.legal!.stage).toBe('prison');
    expect(s.legal!.sentence!).toBeLessThanOrEqual(104);
    s.legal!.next = s.week;
    s.heat.federal = 0;
    s = until(s, (x) => x.pendingEvents.some((e) => e.defId === 'parole'), 5);
    s.money = 50000;
    s.favors = 3;
    s = advanceWeek(s, { choices: answer(s, 'parole', 'favor') }).state;
    expect(['parole', 'prison']).toContain(s.legal!.stage);
  });

  it('there is no option to touch a witness', () => {
    let s = newGame('law5');
    s = advanceWeek(s, {}).state;
    s.legal!.stage = 'investigation';
    s.legal!.evidence = GRAND_JURY + 1;
    s = until(s, (x) => x.pendingEvents.some((e) => e.defId === 'grand_jury'), 5);
    const text = JSON.stringify(s.pendingEvents);
    expect(text).not.toMatch(/witness(es)? (are|is) (killed|threatened|intimidated)|intimidat|threaten/i);
  });
});
