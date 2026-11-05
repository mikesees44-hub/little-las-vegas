import { advanceWeek, cloneState } from '../src/engine/engine';
import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/newGame';
import { ensureTalks } from '../src/engine/talks';
import {
  buildDiploPrompt, closeSitDown, openSitDown, shakeOn, sitHeader, sitStep, stanceOf, termValue, type SitDown,
} from '../src/engine/minds/diplomacy';
import { noteBroken, noteKept, recordOf, wordWith } from '../src/engine/minds/familyWord';
import type { GameState } from '../src/engine/types';
import { randomChoices } from './helpers';

function game(seed = 'diplo2-a'): GameState {
  const s = newGame(seed);
  s.money = Math.max(s.money, 40000);
  return s;
}

describe('memory and your word', () => {
  it('a fresh game has no record and an untested word', () => {
    const s = game();
    expect(s.talks?.rec).toBeUndefined();
    expect(wordWith(s, 'manno').score).toBe(50);
    expect(wordWith(s, 'manno').text).toBe('untested');
  });

  it('a shake and a walk-out are remembered; he brings up the last time; the prompt carries the record', () => {
    const s = game();
    const sd: SitDown = { ...openSitDown(s, 'kessler')!, table: undefined };
    const p = sitStep(s, sd, { propose: [{ kind: 'tribute', amount: 300, weeks: 12 }] }).sd;
    expect(p.table?.ok).toBe(true);
    const g = shakeOn(s, p).state;
    const rec = recordOf(g, 'kessler')!;
    expect(rec.sits.length).toBe(1);
    expect(rec.sits[0].how).toBe('deal');
    expect(rec.sits[0].terms).toMatch(/tribute/);
    const again = openSitDown(g, 'kessler')!;
    expect(again.log.find((l) => l.who === 'them')!.text).toMatch(/Last time we shook on/);
    const prompt = buildDiploPrompt(g, again, { say: 'Hello.' }).messages[0].content;
    expect(prompt).toMatch(/Your record with him/);
    expect(prompt).toMatch(/last sit-down week/);
    // A walk-out.
    let w = openSitDown(g, 'manno')!;
    for (let i = 0; i < 6 && !w.end; i++) w = sitStep(g, w, { say: 'You are a bum and a clown, old man.' }).sd;
    const g2 = closeSitDown(g, w);
    expect(recordOf(g2, 'manno')!.sits[0]).toMatchObject({ how: 'walkout' });
    expect(wordWith(g2, 'manno').score).toBeLessThan(50);
    expect(openSitDown(g2, 'manno')!.log.find((l) => l.who === 'them')!.text).toMatch(/Last time I walked out/);
    expect(sitHeader(g2, openSitDown(g2, 'manno')!)).toMatch(/your word \d+/);
  });

  it('your word feeds the stance and what your promises are worth', () => {
    const s = game('diplo2-b');
    const good = cloneState(s);
    ensureTalks(good);
    for (let i = 0; i < 4; i++) noteKept(good, 'manno', 'kept');
    const bad = cloneState(s);
    ensureTalks(bad);
    for (let i = 0; i < 2; i++) noteBroken(bad, 'manno', 'broke');
    expect(wordWith(good, 'manno').score).toBeGreaterThan(65);
    expect(wordWith(bad, 'manno').score).toBeLessThan(20);
    expect(stanceOf(good, 'manno')!.need).toBeLessThan(stanceOf(s, 'manno')!.need);
    expect(stanceOf(bad, 'manno')!.need).toBeGreaterThan(stanceOf(s, 'manno')!.need);
    expect(stanceOf(bad, 'manno')!.reasons.some((r) => /word/.test(r.label))).toBe(true);
    const tribute = { kind: 'tribute' as const, amount: 300, weeks: 12 };
    expect(termValue(good, 'manno', tribute)).toBeGreaterThan(termValue(bad, 'manno', tribute));
  });

  it('a pact that runs its term counts as kept; missed tribute counts as broken', () => {
    const s = game('diplo2-c');
    const t = ensureTalks(s);
    t.pacts.push({ id: 'p1', a: 'player', b: 'feldstein', kind: 'truce', since: s.week - 26, until: s.week, terms: 'test' });
    t.pacts.push({ id: 'p2', a: 'player', b: 'manno', kind: 'tribute', since: s.week, until: s.week + 10, weekly: 500, terms: 'test' });
    s.money = -200000;
    const g = advanceWeek(s, randomChoices(s, 2)).state;
    expect(recordOf(g, 'feldstein')?.kept).toBe(1);
    expect(recordOf(g, 'manno')?.broken).toBe(1);
  });
});
