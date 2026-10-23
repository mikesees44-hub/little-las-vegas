import { describe, expect, it } from 'vitest';
import { newGame, STARTING_MONEY } from '../src/engine/newGame';
import { advanceWeek } from '../src/engine/engine';
import { crew, usedNicknames } from '../src/engine/characters';
import { buildSitDown, MAX_POPUPS } from '../src/engine/events';
import { randomChoices } from './helpers';

describe('new game', () => {
  it('is reproducible from a seed', () => {
    expect(JSON.stringify(newGame('abc'))).toBe(JSON.stringify(newGame('abc')));
    expect(JSON.stringify(newGame('abc'))).not.toBe(JSON.stringify(newGame('abd')));
  });
  it('starts with $25,000, ~11 crew, and the core districts', () => {
    for (let i = 0; i < 20; i++) {
      const s = newGame(`ng${i}`);
      expect(s.money).toBe(STARTING_MONEY);
      const n = crew(s).length;
      expect(n).toBeGreaterThanOrEqual(10);
      expect(n).toBeLessThanOrEqual(12);
      for (const id of ['boardwalk', 'pacific', 'piers', 'downtown']) {
        expect(s.districts.find((d) => d.id === id)!.influence.player).toBeGreaterThanOrEqual(70);
      }
      expect(s.startingProblem.length).toBeGreaterThan(10);
      expect(s.rivals).toHaveLength(5);
      expect(s.pendingEvents.some((e) => e.defId === 'sitdown')).toBe(true);
    }
  });
  it('no duplicate nicknames within a crew', () => {
    for (let i = 0; i < 30; i++) {
      let s = newGame(`nick${i}`);
      for (let w = 0; w < 100 && !s.gameOver; w++) s = advanceWeek(s, randomChoices(s, w)).state;
      const nicks = Object.values(s.characters).filter((c) => c.alive && c.faction === 'player' && c.nickname).map((c) => c.nickname);
      expect(new Set(nicks).size).toBe(nicks.length);
      expect(usedNicknames(s, 'player').size).toBe(nicks.length);
    }
  });
  it('every character has 2-3 traits, six attributes in range, and an ambition', () => {
    const s = newGame('traits');
    for (const c of Object.values(s.characters)) {
      if (c.rank === 'civilian' && c.faction === 'law') continue;
      expect(c.traits.length).toBeGreaterThanOrEqual(2);
      expect(c.traits.length).toBeLessThanOrEqual(3);
      for (const v of Object.values(c.attributes)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
      expect(c.ambition).toBeTruthy();
    }
  });
});

describe('events', () => {
  it('the sit-down offers exactly 3 orders with no repeats two weeks running', () => {
    let s = newGame('sit');
    let prev: string[] = [];
    for (let w = 0; w < 120 && !s.gameOver; w++) {
      const sd = s.pendingEvents.find((e) => e.defId === 'sitdown');
      if (sd) {
        const orders = String(sd.meta!.orders).split(',');
        expect(orders).toHaveLength(3);
        expect(new Set(orders).size).toBe(3);
        for (const o of orders) expect(prev).not.toContain(o);
        prev = orders;
      } else prev = [];
      s = advanceWeek(s, randomChoices(s, w)).state;
    }
  });
  it('the bagman comes monthly from week 3 and the envelope scales with earnings', () => {
    let s = newGame('bag');
    const weeks: number[] = [];
    const envelopes: number[] = [];
    for (let w = 0; w < 60; w++) {
      const bag = s.pendingEvents.find((e) => e.defId === 'bagman');
      if (bag) {
        weeks.push(s.week);
        envelopes.push(Number(bag.meta!.envelope));
      }
      s = advanceWeek(s, {}).state;
    }
    expect(weeks[0]).toBeGreaterThanOrEqual(3);
    expect(weeks.length).toBeGreaterThanOrEqual(12);
    // in-season envelopes are bigger than winter ones
    expect(Math.max(...envelopes.slice(0, 3))).toBeGreaterThan(Math.min(...envelopes.slice(5, 10)));
  });
  it('never shows more than MAX_POPUPS popups', () => {
    let s = newGame('pop');
    for (let w = 0; w < 200 && !s.gameOver; w++) {
      expect(s.pendingEvents.length).toBeLessThanOrEqual(MAX_POPUPS);
      s = advanceWeek(s, randomChoices(s, w)).state;
    }
  });
  it('choices list their effects up front', () => {
    const s = newGame('fx');
    const sd = buildSitDown(s);
    for (const c of sd.choices) expect(c.effects.length).toBeGreaterThan(0);
  });
  it('decisions schedule consequences recorded with "because"', () => {
    let found = false;
    for (let i = 0; i < 10 && !found; i++) {
      let s = newGame(`cons${i}`);
      for (let w = 0; w < 60 && !s.gameOver; w++) s = advanceWeek(s, randomChoices(s, w)).state;
      const c = s.chronicle.find((e) => e.kind === 'consequence' && e.because);
      if (c) {
        found = true;
        expect(c.becauseWeek).toBeLessThan(c.week);
        expect(c.week - c.becauseWeek!).toBeLessThanOrEqual(8);
      }
    }
    expect(found).toBe(true);
  });
  it('save/load round-trips through JSON', () => {
    let s = newGame('save');
    for (let w = 0; w < 30; w++) s = advanceWeek(s, randomChoices(s, w)).state;
    const loaded = JSON.parse(JSON.stringify(s));
    const a = advanceWeek(s, randomChoices(s, 99)).state;
    const b = advanceWeek(loaded, randomChoices(loaded, 99)).state;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
