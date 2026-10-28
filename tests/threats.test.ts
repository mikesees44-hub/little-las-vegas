import { describe, expect, it } from 'vitest';
import { crew, player } from '../src/engine/characters';
import { readyReview } from '../src/engine/desk';
import { advanceWeek } from '../src/engine/engine';
import { newGame } from '../src/engine/newGame';
import { addOpinion, getRelation, opinion } from '../src/engine/relations';
import {
  aggression, ensureThreats, GRACE_WEEKS, ignoreTip, markTipsSeen, meetTip, respondTip, responsesFor, strangersStandOut, unseenUrgent, urgentCount, urgentMeetings,
  type Threat, type Tip,
} from '../src/engine/threats';
import { upgradeSave } from '../src/engine/upgradeSave';
import type { GameState } from '../src/engine/types';

function soldier(s: GameState) {
  return crew(s).find((c) => c.rank === 'soldier')!;
}
function capo(s: GameState) {
  return crew(s).find((c) => c.rank === 'capo')!;
}

/** A real hit planned on one of the boss's soldiers, and a capo who heard. */
function plant(s: GameState, opts: Partial<Tip> = {}, due = s.week + 1): { s: GameState; tip: Tip; threat: Threat } {
  const T = ensureThreats(s);
  const tgt = soldier(s);
  const k = capo(s);
  const threat: Threat = { id: 'thX', kind: 'hit', by: 'manno', targetId: tgt.id, start: s.week, due, blunt: 0 };
  const tip: Tip = {
    id: 'tipX', threatId: threat.id, kind: 'hit', by: 'manno', targetId: tgt.id, sourceId: k.id, sourceKind: 'capo', sourceName: 'Test Capo', sourceRole: 'Capo',
    week: s.week, deadline: due, truth: 'solid', hint: 'Somebody\'s name came up.', detail: 'Manno has given the job to two men.', status: 'waiting', ...opts,
  };
  T.threats.push(threat);
  T.tips.push(tip);
  return { s, tip, threat };
}

describe('aggressive rivals', () => {
  it('leave a new boss alone for the first weeks', () => {
    let s = newGame('threat-grace');
    for (let i = 0; i < GRACE_WEEKS - 2; i++) s = advanceWeek(s, {}).state;
    expect(s.threats?.stats.planned ?? 0).toBe(0);
    for (const r of s.rivals) expect(aggression(s, r).chance).toBe(0);
  });

  it('push harder when they hate you, and barely at all with an Incapable boss', () => {
    const s = newGame('threat-aggr');
    s.week = 30;
    const r = s.rivals.find((x) => x.kind === 'mob')!;
    const base = aggression(s, r).chance;
    expect(base).toBeGreaterThan(0);
    expect(aggression(s, r).reasons.length).toBeGreaterThan(1);
    addOpinion(s, r.leaderId, s.playerId, 'test', -80, 0);
    const hate = aggression(s, r).chance;
    expect(hate).toBeGreaterThanOrEqual(base);
    s.aging = { p: { [r.leaderId]: { t: { incapable: 1 }, at: {} } } } as never;
    expect(aggression(s, r).chance).toBeLessThan(hate * 0.5);
    // Never against the law or Philadelphia's own man.
    for (const x of s.rivals.filter((y) => y.kind !== 'mob')) expect(aggression(s, x).chance).toBe(0);
  });

  it('plan real moves, cops and feds over a long game, and people warn the boss', () => {
    let s = newGame('threat-long');
    for (let i = 0; i < 60 && !s.gameOver; i++) s = advanceWeek(s, {}).state;
    const T = s.threats!;
    expect(T.stats.planned).toBeGreaterThan(3);
    expect(T.stats.tips).toBeGreaterThan(2);
    // A threat lands at most a few weeks after it is planned.
    for (const t of T.threats) if (!t.schemeId) expect(t.due - t.start).toBeLessThanOrEqual(4);
    expect(T.threats.filter((t) => !t.schemeId).length).toBeLessThanOrEqual(4);
  });
});

describe('urgent meetings', () => {
  it('show who is asking and a hint; meeting reveals the detail and the answers', () => {
    const { s } = plant(newGame('urgent-meet'));
    const [u] = urgentMeetings(s);
    expect(u.who).toBe('Test Capo');
    expect(u.hint).toBeTruthy();
    expect(u.detail).toBeUndefined();
    expect(u.responses).toEqual([]);
    expect(urgentCount(s)).toBe(1);
    expect(unseenUrgent(s)).toEqual(['tipX']);
    const seen = markTipsSeen(s, ['tipX']);
    expect(unseenUrgent(seen)).toEqual([]);
    const met = meetTip(s, 'tipX', 'boss');
    expect(s.threats!.tips[0].status).toBe('waiting'); // pure
    const v = urgentMeetings(met)[0];
    expect(v.status).toBe('met');
    expect(v.detail).toContain('Manno');
    expect(v.read).toBeTruthy();
    expect(v.responses.map((r) => r.id)).toEqual(expect.arrayContaining(['security', 'warn', 'counter', 'nothing']));
    expect(urgentCount(met)).toBe(1);
    const answered = respondTip(met, 'tipX', 'warn');
    expect(urgentCount(answered)).toBe(0);
    // An answer that does not fit is refused.
    expect(respondTip(met, 'tipX', 'sweep')).toBe(met);
  });

  it('an answer is carried out when the week turns and takes the edge off the threat', () => {
    const { s } = plant(newGame('urgent-answer'), {}, newGame('urgent-answer').week + 2);
    const tgt = soldier(s);
    const before = opinion(s, tgt.id, s.playerId);
    const ready = respondTip(meetTip(s, 'tipX', 'boss'), 'tipX', 'warn');
    const next = advanceWeek(ready, {}).state;
    const t = next.threats!.threats.find((x) => x.id === 'thX')!;
    expect(t.blunt).toBeCloseTo(0.8, 5);
    expect(next.threats!.tips.find((x) => x.id === 'tipX')!.status).toBe('done');
    expect(opinion(next, tgt.id, next.playerId)).toBeGreaterThan(before - 5);
  });

  it('second-hand meetings work, and land a little softer', () => {
    const base = newGame('urgent-send');
    const ub = crew(base).find((c) => c.id === base.council.underboss.holderId);
    if (!ub) return; // a start without an underboss in the seat
    const { s } = plant(base, {}, base.week + 2);
    const sent = meetTip(s, 'tipX', 'underboss');
    expect(urgentMeetings(sent)[0].status).toBe('sent');
    const next = advanceWeek(respondTip(sent, 'tipX', 'security'), {}).state;
    expect(next.threats!.threats.find((x) => x.id === 'thX')!.blunt).toBeCloseTo(0.6 * 0.85, 5);
  });

  it('the boss cannot take the meeting himself from a cell', () => {
    const { s } = plant(newGame('urgent-away'));
    player(s).imprisonedUntil = s.week + 10;
    expect(urgentMeetings(s)[0].canMeet).toContain('In prison');
    expect(meetTip(s, 'tipX', 'boss')).toBe(s);
  });

  it('a brushed-off warning that was real lands in full, and the man remembers', () => {
    const { s } = plant(newGame('urgent-ignore'), {}, newGame('urgent-ignore').week);
    const k = capo(s);
    const next = advanceWeek(ignoreTip(s, 'tipX'), {}).state;
    expect(next.threats!.snubs[k.id]).toBe(1);
    expect(next.threats!.stats.landed).toBeGreaterThanOrEqual(1);
    expect(next.threats!.threats.some((x) => x.id === 'thX')).toBe(false);
    expect(getRelation(next, k.id, next.playerId)?.modifiers.some((m) => m.reason.includes('warned him'))).toBe(true);
  });

  it('a meeting nobody took by the deadline is missed', () => {
    const { s } = plant(newGame('urgent-miss'), {}, newGame('urgent-miss').week);
    const next = advanceWeek(s, {}).state;
    expect(next.threats!.tips.find((x) => x.id === 'tipX')!.status).toBe('missed');
    expect(urgentMeetings(next).some((u) => u.id === 'tipX')).toBe(false);
  });

  it('a planted tip costs what you spend on it and nothing else', () => {
    const s0 = newGame('urgent-planted');
    const { s } = plant(s0, { threatId: undefined, truth: 'false', plantedBy: 'feldstein' }, s0.week + 1);
    const ready = respondTip(meetTip(s, 'tipX', 'boss'), 'tipX', 'mattresses');
    const r = advanceWeek(ready, {});
    expect(r.report.lines.some((l) => l.label.includes('Go to the mattresses') && l.amount < 0)).toBe(true);
  });

  it('the feds only get played along in person, and only phones get swept', () => {
    const s = newGame('urgent-feds');
    const tip = { kind: 'fed_wire', via: 'boss' } as Tip;
    expect(responsesFor(s, tip)).toContain('feed');
    expect(responsesFor(s, { ...tip, via: 'underboss' })).not.toContain('feed');
    expect(responsesFor(s, { ...tip, kind: 'fed_post' } as Tip)).not.toContain('sweep');
    expect(responsesFor(s, { ...tip, kind: 'raid' } as Tip)).toContain('payoff');
  });

  it('strangers stand out off-season; the summer crowds hide them', () => {
    const s = newGame('urgent-season');
    const summer = { ...s, date: { y: 1960, m: 7, d: 15 } };
    const october = { ...s, date: { y: 1960, m: 10, d: 15 } };
    expect(strangersStandOut(october)).toBeGreaterThan(strangersStandOut(summer) * 2);
  });

  it('an untaken meeting is flagged before the week turns', () => {
    const { s } = plant(newGame('urgent-ready'));
    const r = readyReview(s);
    expect(r.clear).toBe(false);
    expect(r.warnings.some((w) => w.includes('urgent meeting'))).toBe(true);
  });
});

describe('saves', () => {
  it('upgradeSave leaves current saves alone (no threats layer is made at load)', () => {
    const s = newGame('threat-save');
    const before = JSON.stringify(s);
    const after = upgradeSave(JSON.parse(before));
    expect(after.threats).toBeUndefined();
    expect(JSON.stringify(after)).toBe(before);
    const played = advanceWeek(s, {}).state;
    const raw = JSON.stringify(played);
    expect(JSON.stringify(upgradeSave(JSON.parse(raw)))).toBe(raw);
  });
});

describe('urgent meeting card', () => {
  it('renders the ask, then the detail and the answers after the meeting', async () => {
    const { createElement } = await import('react');
    const { renderToString } = await import('react-dom/server');
    const { UrgentMeeting } = await import('../src/ui/components/UrgentMeeting');
    const { s } = plant(newGame('urgent-ui'));
    const props = { s, id: 'tipX', onMeet: () => {}, onIgnore: () => {}, onRespond: () => {}, onPick: () => {}, onClose: () => {} };
    const before = renderToString(createElement(UrgentMeeting, props));
    expect(before).toContain('Test Capo wants to see you');
    expect(before).toContain('data-testid="urgent-meet"');
    expect(before).toContain('data-testid="urgent-ignore"');
    expect(before).not.toContain('data-testid="urgent-detail"');
    const after = renderToString(createElement(UrgentMeeting, { ...props, s: meetTip(s, 'tipX', 'boss') }));
    expect(after).toContain('data-testid="urgent-detail"');
    expect(after).toContain('data-testid="urgent-resp-warn"');
  });
});
