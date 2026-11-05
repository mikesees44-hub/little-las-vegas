import '../src/engine/engine';
/**
 * LET THEM EAT (engine/eat.ts, ui/borgata/LetThemEat.tsx): hunger read off
 * each man, the pitches the hungry bring (through the check-in, never a new
 * popup), the consigliere's matches for the open jobs, "Do it" through the
 * existing orders with the books reconciling, and the starving man's teeth.
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { newGame } from '../src/engine/newGame';
import { advanceWeek } from '../src/engine/engine';
import { newCtx, reconcile } from '../src/engine/ledger';
import { previewAction } from '../src/engine/actions';
import { owned, staffNeed } from '../src/engine/business';
import { computeCheckIns } from '../src/engine/checkins';
import { reconcileAccounts } from '../src/engine/tribute';
import { upgradeSave } from '../src/engine/upgradeSave';
import {
  eaters, eatWeek, ensureEat, fitOf, hungerOf, loadOf, monthEat, openJobs, openPitches, previewPitch, RACKET_NEED, consigliereWay,
} from '../src/engine/eat';
import { LetThemEat } from '../src/ui/borgata/LetThemEat';
import type { Character, GameState, PlayerAction } from '../src/engine/types';

const clone = (s: GameState): GameState => JSON.parse(JSON.stringify(s));

function idleMan(s: GameState): Character {
  let m = eaters(s).find((c) => c.rank !== 'capo' && !loadOf(s, c).length);
  if (!m) {
    // Everybody has something this week: take a man off his place.
    m = eaters(s).filter((c) => c.rank !== 'capo' && !c.dynasty && loadOf(s, c).every((x) => x.startsWith('runs '))).sort((a, b) => (a.id < b.id ? -1 : 1))[0];
    for (const b of s.businesses) if (b.staffIds) b.staffIds = b.staffIds.filter((x) => x !== m!.id);
    m.busyUntil = undefined;
    if (s.econ?.earners) delete s.econ.earners[m.id];
  }
  expect(m && loadOf(s, m).length, 'an idle man').toBe(0);
  return m!;
}

describe('hunger', () => {
  it('rises with idleness, and a fed man is less hungry', () => {
    const s = advanceWeek(newGame('eat-hunger'), {}).state;
    const m = idleMan(s);
    const e = ensureEat(s);
    e.since[m.id] = s.week;
    const h0 = hungerOf(s, m).v;
    e.since[m.id] = s.week - 3;
    const h3 = hungerOf(s, m);
    e.since[m.id] = s.week - 8;
    const h8 = hungerOf(s, m);
    expect(h3.v).toBeGreaterThan(h0);
    expect(h8.v).toBeGreaterThan(h3.v);
    expect(h8.idle).toBe(8);
    expect(h8.why.join(' ')).toMatch(/idle eight weeks/);
    e.fed[m.id] = s.week;
    expect(hungerOf(s, m).v).toBeLessThan(h8.v);
  });

  it('the week tracks when each man last worked; a fresh game has no layer, and loading changes nothing', () => {
    let s = newGame('eat-week');
    expect(s.eat).toBeUndefined();
    for (let i = 0; i < 4; i++) s = advanceWeek(s, {}).state;
    expect(s.eat).toBeDefined();
    expect(Object.keys(s.eat!.since).length).toBeGreaterThan(0);
    const before = JSON.stringify(s);
    expect(JSON.stringify(upgradeSave(clone(s)))).toBe(before);
    expect(before.length).toBeLessThan(4_000_000);
  });
});

describe('their own pitches', () => {
  it('a hungry man brings one without adding a popup; his capo brings it to a free morning, never urgent', () => {
    let s = advanceWeek(newGame('eat-pitch'), {}).state;
    const m = idleMan(s);
    const e = ensureEat(s);
    for (const c of eaters(s)) e.since[c.id] = s.week; // only our man is hungry
    e.since[m.id] = s.week - 10;
    m.traits = [...m.traits.filter((t) => t !== 'Patient'), 'Greedy'];
    let got = false;
    for (let i = 0; i < 30 && !got; i++) {
      const t = clone(s);
      t.week += i;
      const q = t.eventQueue.length;
      const pend = t.pendingEvents.length;
      eatWeek(newCtx(t));
      expect(t.eventQueue.length).toBe(q);
      expect(t.pendingEvents.length).toBe(pend);
      if (openPitches(t).length) { s = t; got = true; }
    }
    expect(got).toBe(true);
    const p = openPitches(s)[0];
    expect(p.by).toBe(m.id);
    // Each answer shows its odds and stakes.
    const back = previewPitch(s, p.id, p.kind === 'racket' ? 'back' : 'back');
    if (p.kind !== 'racket') {
      expect(back.odds?.chance).toBeGreaterThan(0);
      expect(back.cost).toBe(p.stake);
    }
    expect(previewPitch(s, p.id, 'no').disabledReason).toBeUndefined();
    // The capo's morning: a non-urgent pitch problem.
    if (m.capoId && s.characters[m.capoId]?.alive) {
      const ci = computeCheckIns(s).filter((x) => x.problem?.kind === 'pitch');
      expect(ci.length).toBeLessThanOrEqual(1);
      for (const x of ci) expect(x.problem!.urgent).toBe(false);
    }
  });

  it('an answer is carried out at the week, lands in Your File, and the books reconcile', () => {
    let s = advanceWeek(newGame('eat-answer'), {}).state;
    s.money = 50000;
    const m = idleMan(s);
    const e = ensureEat(s);
    e.pitches.push({ id: 'pi99', by: m.id, kind: 'score', what: 'a truckload of cigarettes', text: '"A truckload."', stake: 500, ret: 0.8, week: s.week, due: s.week + 4 });
    const a: PlayerAction = { kind: 'mymen', op: { op: 'pitch', pitch: 'pi99', how: 'back' } };
    expect(previewAction(s, a).disabledReason).toBeUndefined();
    const r = advanceWeek(s, { actions: [a] });
    s = r.state;
    expect(reconcile(r.report)).toEqual([]);
    expect(s.eat!.pitches.some((p) => p.id === 'pi99')).toBe(false);
    expect(s.journal!.e.some((x) => x.src === 'eat' && /cigarettes/.test(x.t) && /%/.test(x.t))).toBe(true);
    expect(s.eat!.fed[m.id]).toBeDefined();
  });
});

describe('the consigliere\'s matches', () => {
  function shortRacket(s: GameState) {
    const b = owned(s).find((x) => staffNeed(x) > 0 && (x.closedUntil ?? 0) <= s.week);
    expect(b, 'a racket that takes men').toBeDefined();
    b!.staffIds = [];
    return b!;
  }

  it('rank a skilled idle man first, with his reasons', () => {
    const s = advanceWeek(newGame('eat-match'), {}).state;
    const b = shortRacket(s);
    const need = RACKET_NEED(b.kind);
    const m = idleMan(s);
    m.craft = need.crafts[0];
    for (const k of need.attrs) m.attributes[k] = 95;
    m.evidence = 0;
    ensureEat(s).since[m.id] = s.week - 6;
    const job = openJobs(s).find((j) => j.key === `staff:${b.id}`);
    expect(job).toBeDefined();
    expect(job!.picks.length).toBeGreaterThan(0);
    expect(job!.picks[0].id).toBe(m.id);
    expect(job!.picks[0].fit.why).toMatch(/idle six weeks/);
    expect(fitOf(s, m, need).score).toBeGreaterThanOrEqual(job!.picks[job!.picks.length - 1].fit.score);
    // The screen renders it.
    const html = renderToString(createElement(LetThemEat, { s }));
    expect(html).toContain('data-testid="eat-job"');
    expect(html).toContain('data-testid="hunger-bar"');
    expect(html).toContain('data-testid="eat-feed-all"');
  });

  it('"Do it" assigns through the order, and the books reconcile over a few weeks', () => {
    let s = advanceWeek(newGame('eat-doit'), {}).state;
    const b = shortRacket(s);
    const job = openJobs(s).find((j) => j.key === `staff:${b.id}`)!;
    const pick = job.picks[0];
    expect(previewAction(s, pick.action).disabledReason).toBeUndefined();
    const way = consigliereWay(s);
    expect(way.length).toBeGreaterThan(0);
    expect(new Set(way.map((x) => x.pick.id)).size).toBe(way.length);
    let r = advanceWeek(s, { actions: [pick.action] });
    s = r.state;
    expect(reconcile(r.report)).toEqual([]);
    expect(s.businesses.find((x) => x.id === b.id)!.staffIds).toContain(pick.id);
    expect(s.eat!.put[b.id]?.[0]).toBe(pick.id);
    for (let i = 0; i < 4; i++) {
      r = advanceWeek(s, {});
      s = r.state;
      expect(reconcile(r.report)).toEqual([]);
      expect(reconcileAccounts(s)).toEqual([]);
    }
  });
});

describe('teeth', () => {
  it('a starving man grumbles and acts on it', () => {
    const s = advanceWeek(newGame('eat-starve'), {}).state;
    const m = idleMan(s);
    m.traits = [...m.traits.filter((t) => t !== 'Patient'), 'Greedy', 'Ambitious'];
    m.goal = 'get_rich';
    ensureEat(s).since[m.id] = s.week - 12;
    expect(hungerOf(s, m).word).toBe('starving');
    const ctx = newCtx(s);
    const out = monthEat(ctx);
    expect(out.some((t) => t.includes(m.firstName))).toBe(true);
    const mod = s.relations[`${m.id}>${s.playerId}`]?.modifiers.find((x) => x.reason === 'Nobody gives me work');
    expect(mod?.value).toBeLessThan(0);
    expect(s.eat!.hit[m.id]).toBe(s.week);
  });
});
