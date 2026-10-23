import { describe, expect, it } from 'vitest';
import { addOpinion, changeMeter, decayAllRelations, decayModifiers, getRelation, opinion, sumOpinion } from '../src/engine/relations';
import { newGame } from '../src/engine/newGame';
import { makeCharacter } from '../src/engine/characters';
import type { GameState } from '../src/engine/types';

function twoPeople(): { s: GameState; a: string; b: string } {
  const s = newGame('rel');
  const a = makeCharacter(s, { traits: ['Charming', 'Gambler'] }).id;
  const b = makeCharacter(s, { traits: ['Charming', 'Gambler'] }).id;
  return { s, a, b };
}

describe('opinion math', () => {
  it('opinion is the sum of modifiers', () => {
    const { s, a, b } = twoPeople();
    addOpinion(s, a, b, 'Paid me back', 15);
    addOpinion(s, a, b, 'You had my brother killed', -40, 0);
    expect(opinion(s, a, b)).toBe(-25);
    expect(getRelation(s, a, b)!.modifiers.map((m) => m.reason)).toEqual(['Paid me back', 'You had my brother killed']);
  });
  it('is clamped to -100..100', () => {
    expect(sumOpinion([{ id: '1', reason: 'x', value: 90, decay: 0, week: 0 }, { id: '2', reason: 'y', value: 90, decay: 0, week: 0 }])).toBe(100);
    const { s, a, b } = twoPeople();
    addOpinion(s, a, b, 'A', -80, 0);
    addOpinion(s, a, b, 'B', -80, 0);
    expect(opinion(s, a, b)).toBe(-100);
  });
  it('stacks identical reasons into one line', () => {
    const { s, a, b } = twoPeople();
    addOpinion(s, a, b, 'Generous envelope', 10);
    addOpinion(s, a, b, 'Generous envelope', 10);
    const r = getRelation(s, a, b)!;
    expect(r.modifiers).toHaveLength(1);
    expect(r.modifiers[0].value).toBe(20);
  });
  it('is directional', () => {
    const { s, a, b } = twoPeople();
    addOpinion(s, a, b, 'Insulted me', -30);
    expect(opinion(s, b, a)).toBe(0);
  });
  it('decays toward zero and drops expired modifiers; permanent ones stay', () => {
    const mods = decayModifiers([
      { id: '1', reason: 'fading', value: 3, decay: 2, week: 0 },
      { id: '2', reason: 'grudge', value: -10, decay: 4, week: 0 },
      { id: '3', reason: 'forever', value: -40, decay: 0, week: 0 },
    ]);
    expect(mods.map((m) => [m.reason, m.value])).toEqual([['fading', 1], ['grudge', -6], ['forever', -40]]);
    const again = decayModifiers(mods);
    expect(again.map((m) => m.reason)).toEqual(['grudge', 'forever']);
  });
  it('decayAllRelations does not mutate shared modifier objects out of the list', () => {
    const { s, a, b } = twoPeople();
    addOpinion(s, a, b, 'fading', 4, 2);
    decayAllRelations(s);
    expect(opinion(s, a, b)).toBe(2);
    decayAllRelations(s);
    expect(opinion(s, a, b)).toBe(0);
    expect(getRelation(s, a, b)!.modifiers).toHaveLength(0);
  });
  it('vengeful characters never let grudges decay', () => {
    const s = newGame('rel2');
    const a = makeCharacter(s, { traits: ['Vengeful', 'Greedy'] }).id;
    const b = makeCharacter(s, { traits: ['Charming'] }).id;
    addOpinion(s, a, b, 'Shamed me', -20, 3);
    for (let i = 0; i < 10; i++) decayAllRelations(s);
    expect(opinion(s, a, b)).toBe(-20);
  });
  it('meters are clamped 0..100 and shaped by traits', () => {
    const { s, a, b } = twoPeople();
    changeMeter(s, a, b, 'fear', 500);
    expect(getRelation(s, a, b)!.fear).toBe(100);
    changeMeter(s, a, b, 'trust', -500);
    expect(getRelation(s, a, b)!.trust).toBe(0);
    const p = makeCharacter(s, { traits: ['Paranoid'] }).id;
    changeMeter(s, p, b, 'trust', 20);
    expect(getRelation(s, p, b)!.trust).toBe(40); // 30 base + 20/2
  });
});
