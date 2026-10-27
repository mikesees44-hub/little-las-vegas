import { describe, expect, it } from 'vitest';
import { adviceBrief, advisersFor, biasLabel, registerMandateSource, type AdviceBrief, type AdviceSubject } from '../src/engine/adviceBrief';
import { compareChoices, explainChoice } from '../src/engine/advice';
import { capos, crew } from '../src/engine/characters';
import { holder } from '../src/engine/council';
import { advanceWeek } from '../src/engine/engine';
import { newGame } from '../src/engine/newGame';
import { recurringOf } from '../src/engine/recurring';
import { runnersFor } from '../src/engine/racketMenu';
import { setModifier } from '../src/engine/relations';
import type { Choice, GameState, PlayerAction } from '../src/engine/types';

const text = (b: AdviceBrief) => JSON.stringify(b);
const racket = (_s: GameState, runner?: string): AdviceSubject => ({ kind: 'action', action: { kind: 'econ', op: { type: 'racket', cmd: { c: 'start', kind: 'numbers', ...(runner ? { runner } : {}) } } } });
const dirty = (s: GameState): AdviceSubject => ({ kind: 'action', action: { kind: 'dirty', op: { job: 'hijack', who: crew(s).find((c) => c.rank === 'soldier')!.id } } });

function withEvent(s: GameState): GameState {
  for (let i = 0; i < 12 && !s.pendingEvents.length; i++) s = advanceWeek(s, {}).state;
  return s;
}

describe('adviser briefings: the six subjects', () => {
  const s0 = newGame('advice-1');
  const s = withEvent(s0);
  const rival = s.rivals.find((r) => r.kind === 'mob' && s.characters[r.leaderId]?.alive)!;
  const subjects: [string, AdviceSubject][] = [
    ['racket', racket(s)],
    ['dirty job', dirty(s)],
    ['buy a business', { kind: 'action', action: { kind: 'buyBusiness', biz: 'bar', district: s.districts[0].id } as PlayerAction }],
    ['appoint', { kind: 'seat', seat: 'bagman' }],
    ['talk with a rival', { kind: 'action', action: { kind: 'talk', op: { t: 'ask', talk: 'meeting', target: rival.leaderId } } }],
    ['major event', { kind: 'event', iid: s.pendingEvents[0]?.iid ?? 'none' }],
  ];
  for (const [name, sub] of subjects) {
    it(`${name}: the underboss briefs it, with what it gets, what it takes, who might answer, and what nobody knows`, () => {
      if (sub.kind === 'event' && !s.pendingEvents.length) return;
      const b = adviceBrief(s, sub)!;
      expect(b, name).toBeTruthy();
      expect(b.adviser.role).toBe('underboss');
      expect(b.opener.length).toBeGreaterThan(5);
      expect(b.verdict.text.length).toBeGreaterThan(3);
      expect(b.accomplishes.length + b.requirements.length).toBeGreaterThan(0);
      expect(b.unknowns.length).toBeGreaterThan(0);
      for (const l of [...b.accomplishes, ...b.requirements, ...b.obstacles, ...b.unknowns]) expect(['known', 'estimate', 'unknown']).toContain(l.k);
      // Retaliation is never certain.
      for (const r of b.reactions) { expect(['unlikely', 'possible', 'likely']).toContain(r.likelihood); expect(r.reasons.length).toBeGreaterThan(0); }
      expect(text(b)).not.toMatch(/\bwill certainly\b|\b100%/);
      // Other advisers can be asked.
      expect(b.others.every((o) => o.charId !== b.adviser.charId)).toBe(true);
    });
  }

  it('a racket brief marks known facts, his estimates and the unknown apart, names a man and says why', () => {
    const b = adviceBrief(s0, racket(s0))!;
    const ks = new Set([...b.accomplishes, ...b.requirements, ...b.unknowns].map((l) => l.k));
    expect(ks).toEqual(new Set(['known', 'estimate', 'unknown']));
    const pick = b.candidates.find((c) => c.pick)!;
    expect(pick).toBeTruthy();
    expect(pick.why.length).toBeGreaterThan(0);
    expect(b.recommendation?.action).toBeTruthy();
    expect(b.reactions.some((r) => r.kind === 'philly')).toBe(true);
  });

  it('is deterministic and never changes the state (advice does not execute)', () => {
    const before = JSON.stringify(s0);
    const a = adviceBrief(s0, dirty(s0));
    const b = adviceBrief(s0, dirty(s0));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(s0)).toBe(before);
  });

  it('updates when the man or the place changes', () => {
    const men = crew(s0).filter((c) => c.rank === 'soldier');
    const a = adviceBrief(s0, racket(s0, men[0].id))!;
    const b = adviceBrief(s0, racket(s0, men[1].id))!;
    expect(a.key).not.toBe(b.key);
    expect(a.plan).not.toEqual(b.plan);
  });
});

describe('advisers are people', () => {
  it('the underboss is the default; the consigliere, the capo concerned and the bagman can be asked; each has his own stance', () => {
    const s = newGame('advice-2');
    const ads = advisersFor(s, racket(s));
    expect(ads[0].role).toBe('underboss');
    expect(ads.some((a) => a.role === 'consigliere')).toBe(true);
    expect(ads.some((a) => a.role === 'capo')).toBe(true);
    const cons = ads.find((a) => a.role === 'consigliere')!;
    const b = adviceBrief(s, racket(s), cons.charId)!;
    expect(b.adviser.charId).toBe(cons.charId);
    expect(b.others.some((o) => o.role === 'underboss')).toBe(true);
  });

  it('two advisers can recommend different men, each for his own reasons', () => {
    let found = false;
    for (let i = 0; i < 12 && !found; i++) {
      const s = newGame(`advice-diff-${i}`);
      for (const seat of ['bagman', 'enforcer', 'fixer'] as const) {
        const ads = advisersFor(s, { kind: 'seat', seat });
        const picks = new Set(ads.map((a) => adviceBrief(s, { kind: 'seat', seat }, a.charId)!.recommendation?.charId));
        if (picks.size > 1) { found = true; break; }
      }
    }
    expect(found).toBe(true);
  });

  it('a tilt toward his own man is labelled; a private friendship tilts him without a label', () => {
    const s = newGame('advice-bias');
    const k = capos(s).find((c) => s.districts.some((d) => d.capoId === c.id))!;
    const d = s.districts.find((x) => x.capoId === k.id)!;
    k.traits = [...k.traits.filter((t) => t !== 'Honest' && t !== 'Loyal-to-a-fault'), 'Greedy', 'Ambitious'];
    const own = crew(s).find((c) => c.capoId === k.id && c.id !== k.id)!;
    expect(biasLabel(s, k.id, own.id)).toMatch(/his own men/);
    const friend = runnersFor(s, 'numbers').map((r) => r.c).find((c) => c.capoId !== k.id && c.id !== k.id && (c.rank === 'soldier' || c.rank === 'associate'))!;
    setModifier(s, k.id, friend.id, 'Old friends', 100);
    expect(biasLabel(s, k.id, friend.id)).toBeUndefined();
    // The friendship moves his pick: the friend, no stronger than the best man on paper, is the one he names.
    const sub: AdviceSubject = { kind: 'action', action: { kind: 'econ', op: { type: 'racket', cmd: { c: 'start', kind: 'numbers', district: d.id } } } };
    const before = adviceBrief(s, sub, k.id)!;
    const top = s.characters[before.candidates[0].charId];
    friend.attributes = { ...top.attributes };
    const b = adviceBrief(s, sub, k.id)!;
    const p = b.candidates.find((c) => c.pick)!;
    expect(p.charId).toBe(friend.id);
    expect(p.bias).toBeUndefined();
  });

  it('never reveals what nobody in the family knows: a secret the family has not found, a rival plot not discovered', () => {
    const s = newGame('advice-hidden');
    const man = crew(s).find((c) => c.rank === 'soldier')!;
    s.secrets.push({ id: 'sx1', ownerId: man.id, kind: 'affair' as never, text: 'meets the Feldstein bookkeeper at the Starlite every Tuesday', knownBy: [], week: 1 });
    const t = JSON.stringify([adviceBrief(s, racket(s)), adviceBrief(s, dirty(s)), adviceBrief(s, { kind: 'seat', seat: 'enforcer' })]);
    expect(t).not.toContain('Feldstein bookkeeper');
    expect(t).not.toContain('sx1');
  });

  it('leaves room for mandates: with a mandate source the brief says whether it is within his authority', () => {
    const s = newGame('advice-mandate');
    expect(adviceBrief(s, racket(s))!.authority).toBeUndefined();
    registerMandateSource(() => ({ level: 3, spendLimit: 100000 }));
    try {
      const b = adviceBrief(s, { kind: 'action', action: { kind: 'interact', id: 'dinner', target: crew(s)[0].id } })!;
      expect(b.authority).toBeTruthy();
      expect(b.authority!.note.length).toBeGreaterThan(5);
    } finally { registerMandateSource(undefined); }
  });

  it('with nobody free at the table there is no briefing (and nothing invented)', () => {
    const s = newGame('advice-empty');
    for (const c of crew(s)) c.alive = false;
    expect(adviceBrief(s, racket(s))).toBeUndefined();
  });
});

describe('decision advice', () => {
  it('a recurring contract change explains its weekly effect, never "nothing much changes"', () => {
    const s = newGame('advice-contract');
    const k = capos(s).find((c) => s.districts.some((d) => d.capoId === c.id))!;
    const ch: Choice = { id: 'give', label: 'Give him 35%', because: 'gave him more', effects: [{ type: 'contract', charId: k.id, keep: 0.35 }] };
    const r = recurringOf(s, ch.effects[0])!;
    expect(r.text).toMatch(/Every week from now/);
    expect(r.text).toMatch(/\/wk/);
    expect(r.weekly).toBeLessThan(0);
    const ex = explainChoice(s, ch);
    expect(ex.purpose).toMatch(/Every week/);
    expect(ex.purpose).not.toMatch(/Nothing much changes/);
    expect(ex.costs.some((c) => c.when === 'per week')).toBe(true);
  });

  it('the player picks a priority and the options are tagged by it (not "objectively correct")', () => {
    const s = newGame('advice-prio');
    const k = crew(s)[0];
    const choices: Choice[] = [
      { id: 'cash', label: 'Take the money', because: 'took it', effects: [{ type: 'money', amount: 3000 }, { type: 'heat', bar: 'local', amount: 8 }] },
      { id: 'quiet', label: 'Keep it quiet', because: 'kept quiet', effects: [{ type: 'heat', bar: 'local', amount: -6 }, { type: 'opinion', from: k.id, to: s.playerId, amount: -5, reason: 'x' }] },
    ];
    expect(compareChoices(s, choices, 'money').find((x) => x.id === 'cash')!.tags.join()).toMatch(/Best for: money/);
    expect(compareChoices(s, choices, 'heat').find((x) => x.id === 'quiet')!.tags.join()).toMatch(/Best for: keep the heat down/);
  });

  it('the underboss recommends an option of a waiting decision', () => {
    const s = withEvent(newGame('advice-ev'));
    if (!s.pendingEvents.length) return;
    const ub = holder(s, 'underboss');
    const b = adviceBrief(s, { kind: 'event', iid: s.pendingEvents[0].iid })!;
    expect(b.adviser.charId).toBe(ub?.id ?? b.adviser.charId);
    expect(b.recommendation?.choiceId).toBeTruthy();
    expect(s.pendingEvents[0].choices.some((c) => c.id === b.recommendation!.choiceId)).toBe(true);
    expect(b.requirements.some((l) => /If you don't decide/.test(l.text))).toBe(true);
  });
});
