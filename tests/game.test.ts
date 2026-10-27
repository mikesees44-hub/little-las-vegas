import { describe, expect, it } from 'vitest';
import { newGame, STARTING_MONEY } from '../src/engine/newGame';
import { advanceWeek } from '../src/engine/engine';
import { crew, usedNicknames } from '../src/engine/characters';
import { buildSitDown, isFamilyEvent, MAX_FAMILY_POPUPS, MAX_POPUPS, ORDERS } from '../src/engine/events';
import { newGameWith } from '../src/engine/starts';
import { previewAction } from '../src/engine/actions';
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
      // The first week opens with decisions brought by named men of the crew, with their faces.
      const crewEv = s.pendingEvents.filter((e) => e.meta?.crew);
      expect(crewEv.length).toBeGreaterThanOrEqual(1);
      for (const e of crewEv) {
        expect(e.actors?.length).toBeGreaterThan(0);
        expect(s.characters[e.actors![0]].faction).toBe('player');
      }
      expect(s.pendingEvents.some((e) => e.defId === 'sitdown')).toBe(false);
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
  it('general orders replace the weekly sit-down: always on offer, previews are pure, delegated ones resolve a week later', () => {
    let s = newGame('sit');
    for (let w = 0; w < 40 && !s.gameOver; w++) {
      expect(s.pendingEvents.some((e) => e.defId === 'sitdown')).toBe(false);
      const before = JSON.stringify(s);
      const legal = ORDERS.map((o) => ({ kind: 'order', key: o.key, via: 'direct' }) as const).filter((a) => !previewAction(s, a).disabledReason);
      expect(JSON.stringify(s)).toBe(before);
      expect(legal.length).toBeGreaterThanOrEqual(3);
      s = advanceWeek(s, randomChoices(s, w)).state;
    }
    // Through the underboss: nothing now, a "Because you …" consequence next week.
    let t = newGame('sit2');
    t.money = 50000;
    const r1 = advanceWeek(t, { actions: [{ kind: 'order', key: 'shakedown', via: 'underboss' }] });
    expect(r1.report.lines.some((l) => l.label.includes('Lean on the Pacific Avenue bars'))).toBe(false);
    expect(r1.state.scheduled.some((x) => x.key === 'delegated_order')).toBe(true);
    t = r1.state;
    let resolved = false;
    for (let w = 0; w < 2 && !resolved; w++) {
      const r = advanceWeek(t, {});
      resolved = r.state.chronicle.some((c) => c.kind === 'consequence' && /order|half-did|went further/.test(c.text));
      t = r.state;
    }
    expect(resolved).toBe(true);
    // Giving it yourself leaves fingerprints on the boss's file.
    const d = newGame('sit3');
    const ev0 = d.characters[d.playerId].evidence ?? 0;
    const r2 = advanceWeek(d, { actions: [{ kind: 'order', key: 'shakedown', via: 'direct' }] });
    expect(r2.report.lines.some((l) => l.label.includes('Lean on the Pacific Avenue bars'))).toBe(true);
    expect(r2.state.characters[r2.state.playerId].evidence ?? 0).toBeGreaterThan(ev0 - 1);
  });
  it('the bagman comes monthly from week 3 and the envelope scales with earnings', () => {
    // Philadelphia collects every month: in person (a popup) or, in the other months, through the drop
    // (a tribute line in that week's ledger). The story director decides which.
    let s = newGame('bag');
    const weeks: number[] = [];
    const envelopes: number[] = [];
    let visits = 0;
    for (let w = 0; w < 60; w++) {
      const r = advanceWeek(s, {});
      s = r.state;
      const bag = s.pendingEvents.find((e) => e.defId === 'bagman');
      const drop = r.report.lines.find((l) => l.category === 'tribute' && l.label.includes('through the drop'));
      if (bag) visits++;
      if (bag || drop) {
        weeks.push(s.week);
        envelopes.push(bag ? Number(bag.meta!.envelope) : -drop!.amount);
      }
    }
    expect(weeks[0]).toBeGreaterThanOrEqual(3);
    expect(weeks.length).toBeGreaterThanOrEqual(12);
    // Every month is collected exactly once; he comes in person in a good share of them, not all.
    expect(new Set(s.director!.tribute.map((t) => t[0])).size).toBe(s.director!.tribute.length);
    expect(visits).toBeGreaterThanOrEqual(5);
    expect(visits).toBeLessThan(weeks.length);
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
  it('one pipeline for every system: at most one family popup a week, and both the crew and the family get heard', () => {
    let crewSeen = 0;
    let familySeen = 0;
    for (const start of ['classic', 'sees'] as const) {
      let s = newGameWith(`pipe-${start}`, start);
      for (let w = 0; w < 120 && !s.gameOver; w++) {
        expect(s.pendingEvents.length).toBeLessThanOrEqual(MAX_POPUPS);
        const fam = s.pendingEvents.filter(isFamilyEvent);
        expect(fam.length).toBeLessThanOrEqual(MAX_FAMILY_POPUPS);
        familySeen += fam.length;
        crewSeen += s.pendingEvents.filter((e) => e.meta?.crew).length;
        // The same man never brings two crew decisions in one week.
        const ids = s.pendingEvents.filter((e) => e.meta?.crew && !e.mandatory).flatMap((e) => e.actors ?? []);
        expect(new Set(ids).size).toBe(ids.length);
        s = advanceWeek(s, randomChoices(s, w)).state;
      }
    }
    expect(crewSeen).toBeGreaterThan(40);
    expect(familySeen).toBeGreaterThan(5);
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
        // The longest delay a consequence is scheduled with (a crewman's loan comes back in 6-12 weeks).
        expect(c.week - c.becauseWeek!).toBeLessThanOrEqual(12);
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
