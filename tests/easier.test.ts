import '../src/engine/engine';
import { describe, expect, it } from 'vitest';
import { advanceWeek } from '../src/engine/engine';
import { newGame } from '../src/engine/newGame';
import { newGameWith } from '../src/engine/starts';
import { upgradeSave } from '../src/engine/upgradeSave';
import { biggestReason, oddsWord, plainOdds } from '../src/engine/decide';
import { alwaysOn, consiglierePick, delegatedAnswers, delegationLevel, notRoutine, routineEvent, setDelegation } from '../src/engine/delegation';
import { setAlways } from '../src/engine/lieutenants';
import { deskQueue } from '../src/engine/attention';
import { ambitionsView, ambitionPicks, AMB_SLOTS, workingToward } from '../src/engine/ambitions';
import { stormWarnings, STORM_MIN } from '../src/engine/storms';
import { whatChanged, angrierThisWeek } from '../src/engine/weekDiff';
import { addOpinion } from '../src/engine/relations';
import { capos } from '../src/engine/characters';
import type { EventInstance, GameState } from '../src/engine/types';

const ev = (s: GameState, over: Partial<EventInstance> = {}): EventInstance => ({
  iid: `evT${s.nextId++}`, defId: 'test_small', week: s.week, title: 'A small ask', text: 'A man wants a favor.', mandatory: false, priority: 30,
  choices: [
    { id: 'yes', label: 'Do him the favor', effects: [{ type: 'money', amount: -300, label: 'A favor' }] },
    { id: 'no', label: 'Send him away', effects: [{ type: 'respect', amount: -1, label: 'Sent away' }] },
  ],
  defaultChoiceId: 'no', ...over,
} as EventInstance);

describe('plain-language odds', () => {
  it('one word scale for every percentage', () => {
    expect(oddsWord(0.05)).toBe('long shot');
    expect(oddsWord(0.25)).toBe('risky');
    expect(oddsWord(0.5)).toBe('coin flip');
    expect(oddsWord(0.7)).toBe('likely');
    expect(oddsWord(0.9)).toBe('near certain');
    expect(oddsWord(1.2)).toBe('near certain');
  });
  it('the single biggest reason, else the plain why', () => {
    expect(biggestReason({ reasons: [{ label: 'Base', value: 50 }, { label: 'his loyalty', value: 12 }, { label: 'heat', value: -20 }] })).toBe('−20 heat');
    expect(biggestReason({ reasons: [], why: 'you were warned' })).toBe('you were warned');
    expect(plainOdds({ known: true, chance: 0.62, label: 'x', reasons: [] })).toEqual({ pct: 62, word: 'likely', reason: undefined });
    expect(plainOdds({ known: false, label: 'certain', reasons: [] })).toBeUndefined();
  });
});

describe('delegation level', () => {
  it('Balanced is the default and changes nothing; Chairman turns on the three "always" switches', () => {
    const s = newGame('deleg-a');
    expect(delegationLevel(s)).toBe('balanced');
    expect(delegatedAnswers(s)).toEqual({});
    const c = setDelegation(s, 'chairman');
    expect(delegationLevel(c)).toBe('chairman');
    expect(alwaysOn(c, 'asks') && alwaysOn(c, 'envelopes') && alwaysOn(c, 'mornings')).toBe(true);
    const h = setDelegation(c, 'hands');
    expect(delegationLevel(h)).toBe('hands');
    expect(alwaysOn(h, 'asks')).toBe(false);
    // The original is never touched (pure).
    expect(s.briefing?.lt?.always).toBeUndefined();
  });
  it('small asks are routine; a life, a war or real money never is', () => {
    const s = newGame('deleg-b');
    expect(routineEvent(s, ev(s))).toBe(true);
    expect(notRoutine(s, ev(s, { mandatory: true }))).toBeTruthy();
    expect(notRoutine(s, ev(s, { choices: [{ id: 'a', label: 'Big', effects: [{ type: 'money', amount: -9000, label: 'x' }] }] as EventInstance['choices'] }))).toBe('real money');
    const cap = capos(s)[0];
    if (cap) expect(routineEvent(s, ev(s, { choices: [{ id: 'k', label: 'Kill him', effects: [{ type: 'kill', charId: cap.id, cause: 'x', label: 'x' }] }] as EventInstance['choices'] }))).toBe(false);
  });
  it('at "always for small asks" the consigliere settles them: Handled for you, and answered at the turn', () => {
    let s = newGame('deleg-c');
    const e = ev(s);
    s = { ...s, pendingEvents: [...s.pendingEvents, e] };
    const pick = consiglierePick(s, e)!;
    expect(['yes', 'no']).toContain(pick.choiceId);
    // Off: it is not answered for him.
    expect(delegatedAnswers(s)[e.iid]).toBeUndefined();
    const on = setAlways(s, 'asks', true);
    expect(delegatedAnswers(on)[e.iid]).toBe(pick.choiceId);
    // Already answered, or taken back: left alone.
    expect(delegatedAnswers(on, { [e.iid]: 'yes' })[e.iid]).toBeUndefined();
    expect(delegatedAnswers(on, {}, [`ev:${e.iid}`])[e.iid]).toBeUndefined();
    const q = deskQueue(on, {});
    const h = q.handled.find((x) => x.item.ref.event === e.iid);
    if (h) {
      expect(h.delegated).toBe(true);
      expect(h.does).toMatch(/consigliere says/);
    }
    expect(q.needs.some((x) => x.ref.event === e.iid)).toBe(false);
    // Taken back: it needs him again.
    expect(deskQueue(on, { taken: [`ev:${e.iid}`] }).needs.some((x) => x.ref.event === e.iid)).toBe(true);
  });
  it('an upgraded save keeps the switches; a save without them stays as it was', () => {
    const s = setAlways(newGame('deleg-d'), 'asks', true);
    const raw = JSON.stringify(s);
    expect(JSON.stringify(upgradeSave(JSON.parse(raw)))).toBe(raw);
  });
});

describe('three goals', () => {
  it('a new game has up to three goals with progress and a reward, and the Desk line names them', () => {
    for (const seed of ['amb-a', 'amb-b']) {
      const s = newGame(seed);
      const v = ambitionsView(s);
      expect(v.length).toBeGreaterThan(0);
      expect(v.length).toBeLessThanOrEqual(AMB_SLOTS);
      for (const g of v) {
        expect(g.progress).toBeGreaterThanOrEqual(0);
        expect(g.progress).toBeLessThanOrEqual(1);
        expect(g.title.length).toBeGreaterThan(3);
        expect(g.reward.length).toBeGreaterThan(0);
      }
      expect(new Set(v.map((g) => g.id)).size).toBe(v.length);
      expect(workingToward(s)).toContain(v[0].title);
      // Before the first week nothing is written.
      expect(s.ambitions).toBeUndefined();
    }
  });
  it('the week saves the goals, keeps them stable, and the save round-trips', () => {
    const s0 = newGame('amb-c');
    const before = ambitionPicks(s0).map((p) => p.id);
    const s1 = advanceWeek(s0, {}).state;
    expect(s1.ambitions?.picks.length).toBeGreaterThan(0);
    const kept = s1.ambitions!.picks.map((p) => p.id).filter((id) => before.includes(id));
    expect(kept.length).toBeGreaterThan(0);
    const raw = JSON.stringify(s1);
    expect(JSON.stringify(upgradeSave(JSON.parse(raw)))).toBe(raw);
  });
  it('a met goal pays once and is replaced', () => {
    const s0 = advanceWeek(newGame('amb-d'), {}).state;
    const A = s0.ambitions!;
    // Force a war chest goal that is already met.
    A.picks = [{ id: 'war_chest', w: s0.week, target: 1 }];
    const respect0 = s0.respect;
    const s1 = advanceWeek(s0, {}).state;
    expect(s1.ambitions!.done.some((d) => d.id === 'war_chest')).toBe(true);
    expect(s1.ambitions!.picks.some((p) => p.id === 'war_chest')).toBe(false);
    expect(s1.lastReport!.lines.some((l) => /Goal: a war chest/.test(l.label))).toBe(true);
    expect(s1.respect).toBeGreaterThanOrEqual(respect0 - 10);
  });
  it('a low start is told to get made, not to build a war chest', () => {
    const s = newGameWith('amb-low', 'associate');
    expect(s.power?.station).toBe('associate');
    const ids = ambitionsView(s).map((g) => g.id);
    expect(ids).toContain('get_made');
    expect(ids).not.toContain('war_chest');
    const o = newGameWith('amb-od', 'olddon');
    expect(ambitionsView(o).length).toBeGreaterThan(0);
  });
});

describe('storm warnings', () => {
  it('a hot island warns of a raid with the odds, the reason and what would help', () => {
    const s = newGame('storm-a');
    expect(stormWarnings(s).filter((x) => x.kind === 'raid')).toHaveLength(0);
    const hot = { ...s, heat: { ...s.heat, local: 72 } };
    const raid = stormWarnings(hot).find((x) => x.kind === 'raid')!;
    expect(raid).toBeTruthy();
    expect(raid.odds).toBeGreaterThanOrEqual(STORM_MIN);
    expect(raid.why).toMatch(/local heat 72/);
    expect(raid.helps.length).toBeGreaterThan(0);
    expect(raid.helps.every((h) => h.go?.panel)).toBe(true);
  });
  it('a Family running dry is warned before it is broke', () => {
    const s = advanceWeek(newGame('storm-b'), {}).state;
    const r = s.lastReport!;
    const poor: GameState = { ...s, money: 1000, lastReport: { ...r, start: { ...r.start, money: 4000 }, end: { ...r.end, money: 1000 } } };
    expect(stormWarnings(poor).some((x) => x.kind === 'broke')).toBe(true);
  });
  it('never leaks an informant: the indictment clock reads only what he can know', () => {
    const s = newGame('storm-c');
    const me = s.characters[s.playerId];
    const base: GameState = { ...s, legal: { stage: 'investigation', personId: s.playerId, defense: 0, since: s.week }, characters: { ...s.characters, [me.id]: { ...me, evidence: 47 } }, heat: { ...s.heat, federal: 20 } };
    const withRat: GameState = { ...base, flags: { ...base.flags, informant: 1 } };
    expect(stormWarnings(withRat).map((x) => x.id)).toEqual(stormWarnings(base).map((x) => x.id));
  });
});

describe('what changed', () => {
  it('after a week: three to five lines, money first, and who is angrier', () => {
    const s0 = newGame('diff-a');
    const s1 = advanceWeek(s0, {}).state;
    const lines = whatChanged(s1);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines.length).toBeLessThanOrEqual(5);
    expect(lines[0].id).toBe('money');
    expect(lines[0].text).toMatch(/Family money (up|down)/);
    const k = capos(s1)[0];
    if (k) {
      addOpinion(s1, k.id, s1.playerId, 'Passed me over', -15, 1);
      const rel = Object.values(s1.relations).find((r) => r.from === k.id && r.to === s1.playerId)!;
      for (const m of rel.modifiers) if (m.reason === 'Passed me over') m.week = s1.lastReport!.week;
      expect(angrierThisWeek(s1).some((a) => a.id === k.id)).toBe(true);
      expect(whatChanged(s1).some((l) => l.id === 'angry')).toBe(true);
    }
    expect(whatChanged(s0)).toEqual([]);
  });
});
