import { describe, expect, it } from 'vitest';
import { advanceWeek } from '../src/engine/engine';
import { MAX_POPUPS } from '../src/engine/events';
import { newGame } from '../src/engine/newGame';
import { newGameWith } from '../src/engine/starts';
import { allFamilies, chooseScene, dressScene, sceneCtx } from '../src/engine/sceneVariants';
import { buildStorylet, letRng, storyletSource, COMPLICATIONS, LET_SETTINGS } from '../src/engine/storylets';
import { SITUATIONS } from '../src/engine/storyletData';
import { OPENING_IDS } from '../src/engine/openings';
import { buildBagman } from '../src/engine/events';
import type { EventInstance, GameState } from '../src/engine/types';
import { playWeeks, randomChoices } from './helpers';

const FORBIDDEN = /Corleone|Barzini|Tattaglia|Tessio|Stracci|Clemenza|Cuneo|Sollozzo|Brasi|undefined|NaN|\[object/;

function anyEvent(s: GameState, defId: string): EventInstance | undefined {
  return s.pendingEvents.find((e) => e.defId === defId) ?? s.eventQueue.find((e) => e.defId === defId);
}

describe('variety: scene families', () => {
  it('every family scene that fits renders clean text and keeps its choices honest', () => {
    // A popup per family, collected over two years of play; the bagman synthesized.
    let s = newGame('fam');
    const samples: EventInstance[] = [];
    for (let w = 0; w < 110 && !s.gameOver; w++) {
      for (const e of s.pendingEvents) if (!samples.some((x) => x.defId === e.defId)) samples.push(e);
      s = advanceWeek(s, randomChoices(s, w)).state;
    }
    samples.unshift(buildBagman(s));
    let told = 0;
    for (const fam of allFamilies()) {
      const ev = samples.find((e) => fam.match(e));
      if (!ev) continue;
      for (const sc of fam.scenes) {
        const c = sceneCtx(s, ev, fam.id);
        if (sc.when && !sc.when(c)) continue;
        const text = `${sc.title(c)} ${sc.text(c)}`;
        expect(text, `${fam.id}`).not.toMatch(FORBIDDEN);
        expect(text.trim().length).toBeGreaterThan(20);
        const choices = sc.choices ? sc.choices(c, ev.choices) : ev.choices;
        for (const ch of ev.choices) {
          const same = choices.find((x) => x.id === ch.id);
          // A relabeled answer keeps its chips (money may be scaled a little on a deal).
          if (same && fam.id !== 'favor') expect(same.effects.map((e) => e.type)).toEqual(ch.effects.map((e) => e.type));
        }
        told++;
      }
    }
    expect(told).toBeGreaterThan(40);
  });

  it('never tells the same scene twice until the family has used every scene that fits', () => {
    const s = newGame('cycle');
    const fam = allFamilies().find((f) => f.id === 'bagman')!;
    const seen: number[] = [];
    for (let i = 0; i < 40; i++) {
      const ev = buildBagman(s);
      const idx = chooseScene(s, fam, sceneCtx(s, ev, fam.id))!;
      seen.push(idx);
    }
    const fits = fam.scenes.filter((sc) => !sc.when || sc.when(sceneCtx(s, buildBagman(s), 'bagman'))).length;
    expect(new Set(seen.slice(0, fits)).size).toBe(fits);
    expect(fits).toBeGreaterThanOrEqual(8);
  });

  it('each recurring family has at least eight scenes', () => {
    for (const id of ['bagman', 'bones', 'deal_manno', 'deal_feldstein', 'deal_kessler', 'deal_philly', 'courted', 'drifting', 'favor', 'kickup', 'sunday', 'score', 'funeral']) {
      const f = allFamilies().find((x) => x.id === id);
      expect(f, id).toBeTruthy();
      expect(f!.scenes.length, id).toBeGreaterThanOrEqual(8);
    }
  });

  it('a dressed popup is marked and not dressed twice', () => {
    const s = newGame('mark');
    const ev = buildBagman(s);
    expect(dressScene(s, ev)).toBe(true);
    const text = ev.text;
    expect(String(ev.meta?.sv)).toMatch(/^bagman:/);
    expect(dressScene(s, ev)).toBe(false);
    expect(ev.text).toBe(text);
    expect(ev.text).toContain(`$${Number(ev.meta!.envelope).toLocaleString('en-US')}`);
  });
});

describe('variety: pacing', () => {
  it('about two popups a week, never more than MAX_POPUPS, and routine business shows up as "In motion" on the books', () => {
    let s = newGame('pace');
    let pop = 0, weeks = 0, motion = 0, motionMoney = 0;
    for (let w = 0; w < 104 && !s.gameOver; w++) {
      expect(s.pendingEvents.length).toBeLessThanOrEqual(MAX_POPUPS);
      pop += s.pendingEvents.length;
      weeks++;
      const r = advanceWeek(s, randomChoices(s, w));
      motion += r.report.motion?.length ?? 0;
      motionMoney += r.report.lines.filter((l) => l.stat === 'money' && l.label.startsWith('In motion')).length;
      s = r.state;
    }
    expect(pop / weeks).toBeGreaterThan(1.5);
    expect(pop / weeks).toBeLessThan(2.6);
    expect(motion).toBeGreaterThan(3);
    expect(motionMoney).toBeGreaterThan(0);
  });
});

describe('variety: storylets', () => {
  it('builds every situation it can cast, with clean text and 2-4 choices of real chips', () => {
    const s = playWeeks('lets', 60);
    let built = 0;
    for (const sit of SITUATIONS) {
      for (let i = 0; i < 3; i++) {
        const ev = buildStorylet(s, sit, letRng(s, `t${i}:${sit.id}`));
        if (!ev) continue;
        built++;
        expect(`${ev.title} ${ev.text}`, sit.id).not.toMatch(FORBIDDEN);
        expect(ev.choices.length).toBeGreaterThanOrEqual(2);
        expect(ev.choices.length).toBeLessThanOrEqual(4);
        for (const ch of ev.choices) for (const e of ch.effects) expect(typeof e.type).toBe('string');
        expect(ev.defId).toBe(`let_${sit.id}`);
      }
    }
    expect(built).toBeGreaterThan(20);
    expect(SITUATIONS.length * LET_SETTINGS.length * COMPLICATIONS.length).toBeGreaterThan(20000);
  });

  it('storylets reach the boss in an ordinary game, and their texts do not repeat', () => {
    let s = newGame('lets2');
    const texts: string[] = [];
    for (let w = 0; w < 120 && !s.gameOver; w++) {
      for (const e of s.pendingEvents) if (e.defId.startsWith('let_')) texts.push(e.text);
      s = advanceWeek(s, randomChoices(s, w)).state;
    }
    expect(texts.length).toBeGreaterThan(8);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('the weekly source is pure apart from its own bookkeeping (no engine dice)', () => {
    const s = playWeeks('lets3', 20);
    const rng = s.rng;
    storyletSource(s);
    expect(s.rng).toBe(rng);
  });
});

describe('variety: fresh openings', () => {
  it('new games open differently: several openings, beats in the first twelve weeks', () => {
    const ids = new Set<string>();
    let beats = 0;
    for (let g = 0; g < 10; g++) {
      let s = newGameWith(`open-${g}`, 'classic');
      ids.add(s.director!.opening!.id);
      for (let w = 0; w < 13 && !s.gameOver; w++) {
        beats += s.pendingEvents.filter((e) => e.meta?.opening).length;
        s = advanceWeek(s, randomChoices(s, w)).state;
      }
    }
    expect(ids.size).toBeGreaterThanOrEqual(5);
    expect(OPENING_IDS.length).toBeGreaterThanOrEqual(8);
    expect(beats).toBeGreaterThanOrEqual(15);
  });

  it('the opening scene is dressed', () => {
    const s = newGameWith('open-scene', 'classic');
    const ev = anyEvent(s, 'made_boss')!;
    expect(String(ev.meta?.sv)).toMatch(/^made_boss:/);
  });
});
