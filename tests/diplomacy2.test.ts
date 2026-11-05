import { advanceWeek, cloneState } from '../src/engine/engine';
import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/newGame';
import { ensureTalks } from '../src/engine/talks';
import {
  buildDiploPrompt, closeSitDown, openSitDown, shakeOn, sitHeader, sitStep, stanceOf, termValue, type SitDown,
} from '../src/engine/minds/diplomacy';
import { noteBroken, noteKept, recordOf, wordWith } from '../src/engine/minds/familyWord';
import type { GameState, War } from '../src/engine/types';
import { newCtx } from '../src/engine/ledger';
import { opinion } from '../src/engine/relations';
import { askFor, familyAsksWeek, openAsks, type AskKind } from '../src/engine/minds/familyAsks';
import { beginSitDown } from '../src/engine/minds/diplomacy';
import { inbox } from '../src/engine/inbox';
import { lapsesThisWeek, readyReview } from '../src/engine/desk';
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

function atWar(s: GameState, rival: 'manno' | 'feldstein' | 'kessler', score: number, ago = 0): War {
  const r = s.rivals.find((x) => x.id === rival)!;
  const d = s.districts.find((x) => (x.influence[rival] ?? 0) > 0) ?? s.districts[0];
  const w: War = { id: `w${s.nextId++}`, rival, district: d.id, cb: 'claim', sanctioned: true, score, startWeek: s.week - ago, by: 'player' };
  s.wars.push(w);
  r.war = true;
  return w;
}

/** Turn weeks over the ask layer only, until a family asks (or give up). */
function untilAsk(s: GameState, kind?: AskKind, n = 60): GameState {
  for (let i = 0; i < n; i++) {
    const ctx = newCtx(s);
    familyAsksWeek(ctx);
    s.week++;
    const a = openAsks(s)[0];
    if (a && (!kind || a.kind === kind)) return s;
    if (a) { s.talks!.asks = []; }
  }
  return s;
}

describe('they come to you', () => {
  it('a family losing a war sends a peace feeler: on the Desk, in Ready to advance, the sit-down opens with it', () => {
    const s = game('diplo2-ask');
    atWar(s, 'kessler', 40);
    untilAsk(s, 'peace');
    const a = askFor(s, 'kessler')!;
    expect(a).toBeDefined();
    expect(a.offer.some((t) => t.kind === 'truce')).toBe(true);
    const it = inbox(s).find((x) => x.key === `fam:${a.id}`)!;
    expect(it.ref.family).toBe('kessler');
    expect(it.title).toMatch(/asks for a sit-down/);
    expect(lapsesThisWeek(s).some((l) => l.key === `famask:${a.id}`)).toBe(true);
    expect(readyReview(s).lapses.some((l) => l.key === `famask:${a.id}`)).toBe(true);
    const sd = openSitDown(s, 'kessler')!;
    expect(sd.agenda?.kind).toBe('peace');
    expect(sd.table?.terms.some((t) => t.kind === 'truce')).toBe(true);
    expect(sd.log.some((l) => l.who === 'them' && l.text.includes(a.text))).toBe(true);
    expect(buildDiploPrompt(s, sd, { say: 'Go on.' }).messages[0].content).toMatch(/asked for this sit-down/);
    // Sitting down answers it.
    const g = beginSitDown(s, 'kessler');
    expect(askFor(g, 'kessler')).toBeUndefined();
    expect(askFor(s, 'kessler')).toBeDefined();
  });

  it('ignored, it lapses with a consequence: a grievance makes them move; Philadelphia marks down an ignored Table', () => {
    const s = game('diplo2-lapse');
    const r = s.rivals.find((x) => x.id === 'manno')!;
    const d = s.districts[0];
    ensureTalks(s).asks = [{ id: 'fa1', rival: 'manno', kind: 'grievance', w: s.week, until: s.week, text: 'Stop it.', district: d.id, offer: [] }];
    const op0 = opinion(s, r.leaderId, s.playerId);
    const inf0 = d.influence.manno ?? 0;
    const g = advanceWeek(s, randomChoices(s, 1)).state;
    expect(askFor(g, 'manno')).toBeUndefined();
    expect(opinion(g, r.leaderId, g.playerId)).toBeLessThan(op0);
    expect((g.districts.find((x) => x.id === d.id)!.influence.manno ?? 0)).toBeGreaterThan(inf0);
    expect(g.journal!.e.some((e) => /ignored Manno/i.test(e.t))).toBe(true);
    // The Table.
    const t = game('diplo2-table');
    const ph = t.rivals.find((x) => x.id === 'philly')!;
    atWar(t, 'feldstein', 0, 10);
    untilAsk(t, 'table');
    const a = askFor(t, 'feldstein');
    if (a) {
      expect(a.kind).toBe('table');
      const pop = opinion(t, ph.leaderId, t.playerId);
      const h0 = t.heat.family;
      const ctx = newCtx(t);
      familyAsksWeek(ctx);
      expect(opinion(t, ph.leaderId, t.playerId)).toBeLessThan(pop);
      expect(t.heat.family).toBeGreaterThan(h0);
    }
  });

  it('a stronger family demands tribute; a fresh game has no asks', () => {
    expect(game().talks?.asks).toBeUndefined();
    const s = game('diplo2-trib');
    const r = s.rivals.find((x) => x.id === 'manno')!;
    r.muscle = 100;
    for (const c of Object.values(s.characters)) if (c.faction === 'player' && c.id !== s.playerId) c.alive = false;
    untilAsk(s, 'tribute', 120);
    const a = openAsks(s)[0];
    expect(a?.kind).toBe('tribute');
    expect(a!.offer.some((t) => t.kind === 'tribute')).toBe(true);
  });
});
