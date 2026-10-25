import { describe, expect, it } from 'vitest';
import { killCharacter } from '../src/engine/dynasty';
import { advanceWeek, cloneState } from '../src/engine/engine';
import { PLAYER_HOUSE, kinWord } from '../src/engine/houses';
import { KIN_HOOKS, kinEventSource } from '../src/engine/housesEvents';
import { showbizSeeds } from '../src/engine/housesShowbiz';
import { housesTitles } from '../src/engine/housesTitles';
import { extendedFamily, houseIndex, houseTimeline, validateHouses } from '../src/engine/housesView';
import { newCtx } from '../src/engine/ledger';
import { newGame } from '../src/engine/newGame';
import { isFamilyEvent } from '../src/engine/events';
import type { GameState } from '../src/engine/types';
import { randomChoices } from './helpers';

function play(s: GameState, weeks: number, salt = 0, seen?: (s: GameState) => void): GameState {
  for (let i = 0; i < weeks && !s.gameOver; i++) {
    s = advanceWeek(s, randomChoices(s, i + salt)).state;
    seen?.(s);
  }
  return s;
}

describe('show business houses', () => {
  const s = newGame('showbiz');
  const L = s.lineage!;

  it('the stars of the world pack and the entertainers with family have houses with trees', () => {
    const seeds = showbizSeeds();
    expect(seeds.length).toBeGreaterThanOrEqual(12);
    for (const sd of seeds) {
      const h = L.houses[sd.id];
      expect(h, sd.id).toBeTruthy();
      expect(h.type).toBe('showbiz');
      expect(h.founderId).toBeTruthy();
      // Their own people keep the world's ids, and the tree goes back generations.
      for (const p of sd.pack!.people) expect(houseIndex(s).nodes.has(p.id), p.id).toBe(true);
      expect((houseIndex(s).members.get(sd.id) ?? []).length).toBeGreaterThan(sd.pack!.people.length);
    }
    // A crooner under his stage name; a family of entertainers tied by blood and marriage.
    const vic = houseIndex(s).nodes.get('ent_vic_marlowe')!;
    expect(vic.nick).toBe('Vic Marlowe');
    expect(vic.titles.join(' ')).toMatch(/singer/i);
    expect(kinWord(s, 'ent_eddie_dominguez', 'ent_ray_dominguez')).toBe('brother');
    expect(kinWord(s, 'ent_eddie_dominguez', 'ent_carmen_rey')).toBe('wife');
    expect(kinWord(s, 'ent_rita_sorrell', 'law_pasquale_sorrentino')).toBe('father');
    expect(validateHouses(s)).toEqual([]);
  });

  it('a star who dies in the world dies in the tree (one death function)', () => {
    const t = cloneState(s);
    const ctx = newCtx(t);
    killCharacter(ctx, 'ent_vic_marlowe', 'a heart attack in a Las Vegas dressing room');
    const n = houseIndex(t).nodes.get('ent_vic_marlowe')!;
    expect(n.alive).toBe(false);
    expect(n.dy).toBe(t.date.y);
    expect(n.cause).toMatch(/heart attack/);
    expect(houseTimeline(t, 'h_sb_malavolta').some((e) => e.kind === 'death' && e.who === 'ent_vic_marlowe')).toBe(true);
    // The world's record agrees.
    expect(t.pol?.people['ent_vic_marlowe']?.alive ?? false).toBe(false);
  });
});

describe('the extended family', () => {
  it('your boss has grandparents, uncles and aunts, cousins and in-laws, the dead among them', () => {
    for (const seed of ['ext-1', 'ext-2']) {
      const s = newGame(seed);
      const x = extendedFamily(s, s.playerId);
      expect(x.grandparents.length, seed).toBeGreaterThanOrEqual(2);
      expect(x.grandparents.some((g) => !g.alive), seed).toBe(true);
      expect(x.unclesAunts.length, seed).toBeGreaterThanOrEqual(1);
      expect(x.cousins.length, seed).toBeGreaterThanOrEqual(2);
      expect(x.inLaws.length, seed).toBeGreaterThanOrEqual(1);
      for (const c of x.cousins) expect(kinWord(s, s.playerId, c.id), seed).toBe('cousin');
      // The women of the house have roles of their own (wives, sisters, widows, the matriarch).
      const women = Object.values(s.characters).filter((c) => c.alive && c.gender === 'F' && c.dynasty && c.kinRoles?.length);
      expect(women.length, seed).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('the trees during play', () => {
  const start = newGame('trees-play');
  let s = play(cloneState(start), 52 * 3);

  it('births, marriages and deaths in play are in the trees and in the house histories', () => {
    const born = [...houseIndex(s).nodes.values()].filter((n) => n.by > 1960 && n.house);
    expect(born.length).toBeGreaterThan(10);
    const anyBirth = born[0];
    expect(houseTimeline(s, anyBirth.house!).some((e) => e.kind === 'birth' && e.who === anyBirth.id)).toBe(true);
    const marriages = s.lineage!.events.filter((e) => e.k === 'marriage' && e.y > 1960);
    expect(marriages.length).toBeGreaterThan(5);
    // A death in your own house: the uncle stays in the tree, dated, with the cause, in your history.
    // (The trees are read through a per-state index, so the death happens on the next week's state, as in play.)
    const t = cloneState(s);
    const uncle = Object.values(t.characters).find((c) => c.alive && c.dynasty && c.kinRoles?.some((r) => r === 'uncle' || r === 'aunt'));
    expect(uncle).toBeTruthy();
    killCharacter(newCtx(t), uncle!.id, 'a stroke at the Elks lodge');
    const n = houseIndex(t).nodes.get(uncle!.id)!;
    expect(n.alive).toBe(false);
    expect(n.cause).toMatch(/stroke/);
    expect(houseTimeline(t, PLAYER_HOUSE).some((e) => e.kind === 'death' && e.who === uncle!.id)).toBe(true)
    expect(validateHouses(s)).toEqual([]);
  });

  it('titles are kept over time: a man made capo carries it, with the year, after he is gone', () => {
    const t = cloneState(s);
    const m = Object.values(t.characters).find((c) => c.alive && c.faction === 'player' && c.rank === 'soldier');
    expect(m).toBeTruthy();
    housesTitles(t);
    m!.rank = 'capo';
    housesTitles(t);
    const n = houseIndex(t).nodes.get(m!.id)!;
    expect(n.titles.some((x) => x.startsWith('Capo of the') && x.endsWith(String(t.date.y)))).toBe(true);
    const u = cloneState(t);
    killCharacter(newCtx(u), m!.id, 'a heart attack');
    expect(houseIndex(u).nodes.get(m!.id)!.alive).toBe(false);
    expect(houseIndex(u).nodes.get(m!.id)!.titles.some((x) => x.startsWith('Capo'))).toBe(true);
    expect(houseTimeline(u, houseIndex(u).nodes.get(m!.id)!.house ?? PLAYER_HOUSE).some((e) => e.kind === 'title' && e.who === m!.id) || !houseIndex(u).nodes.get(m!.id)!.house).toBe(true);
  });

  it('save and load: the trees survive a JSON round trip and play on identically', () => {
    const loaded = JSON.parse(JSON.stringify(s)) as GameState;
    expect(JSON.stringify(loaded.lineage)).toBe(JSON.stringify(s.lineage));
    let a = s;
    let b = loaded;
    for (let w = 0; w < 14; w++) {
      a = advanceWeek(a, randomChoices(a, 500 + w)).state;
      b = advanceWeek(b, randomChoices(b, 500 + w)).state;
    }
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(validateHouses(b)).toEqual([]);
    // A save stays small enough for the browser's storage.
    expect(JSON.stringify(b).length).toBeLessThan(4_000_000);
    s = a;
  });
});

describe('family story hooks', () => {
  it('the kin come to the boss with their own business, one family popup a week at most', () => {
    const hooks = new Set<string>();
    for (const seed of ['hooks-1', 'hooks-2', 'hooks-3']) {
      play(newGame(seed), 80, 0, (st) => {
        expect(st.pendingEvents.filter(isFamilyEvent).length).toBeLessThanOrEqual(1);
        expect(st.pendingEvents.length).toBeLessThanOrEqual(4);
        for (const e of st.pendingEvents) {
          if (!e.defId.startsWith('kin_')) continue;
          hooks.add(e.defId.slice(4));
          // Every effect is named; nobody is married off or handed over.
          for (const c of e.choices) for (const fx of c.effects) {
            expect(fx.label).toBeTruthy();
            expect(fx.type).not.toBe('dyn');
          }
        }
      });
    }
    expect(hooks.size).toBeGreaterThanOrEqual(4);
    for (const h of hooks) expect(KIN_HOOKS).toContain(h);
  });

  it('a daughter\'s match is her choice: the boss can bless it or not, never arrange it', () => {
    const s = newGame('hooks-match');
    const d = Object.values(s.characters).find((c) => c.kinRoles?.includes('match'));
    if (!d) return;
    for (let w = 0; w < 200; w++) {
      s.week = 10 + w * 5;
      const e = kinEventSource(s);
      if (e?.defId !== 'kin_match') continue;
      expect(e.text).toMatch(/she chose him/);
      for (const c of e.choices) expect(c.effects.every((fx) => fx.type === 'opinion')).toBe(true);
      return;
    }
  });
});
