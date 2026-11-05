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

import { canHonor, honorFavor, lendableMen, refuseFavor } from '../src/engine/minds/familyAsks';
import { owedBy } from '../src/engine/deeds/state';
import { ensureDeeds } from '../src/engine/deeds/state';
import { allowedKinds, dealValue, needNow, validateDeal } from '../src/engine/minds/diplomacy';
import { pactWith } from '../src/engine/talks';
import { reconcile } from '../src/engine/ledger';
import type { FamAsk } from '../src/engine/minds/askView';

function owe(s: GameState, by: string, to: string) {
  ensureDeeds(s).owed.push({ by, to, w: s.week, y: 'test' });
}

describe('favors, both ways', () => {
  it('a family you owe comes to collect; doing it spends the favor and keeps your word; men lent come back', () => {
    const s = game('diplo2-fav');
    const r = s.rivals.find((x) => x.id === 'manno')!;
    owe(s, s.playerId, r.leaderId);
    untilAsk(s, 'collect', 80);
    const a = openAsks(s).find((x) => x.kind === 'collect');
    expect(a?.favor).toBeDefined();
    // Muscle: explicit, named, never harmed or handed over.
    const men = lendableMen(s).slice(0, 2);
    const ask: FamAsk = { id: 'fm', rival: 'manno', kind: 'collect', w: s.week, until: s.week, text: 'Lend me two.', offer: [], favor: { kind: 'muscle', menIds: men.map((c) => c.id) } };
    const t = ensureTalks(s);
    t.asks = [ask];
    expect(canHonor(s, ask).ok).toBe(true);
    const res = honorFavor(s, 'fm');
    expect(res.ok).toBe(true);
    const g = res.state;
    expect(owedBy(g, g.playerId, r.leaderId)).toBe(owedBy(s, s.playerId, r.leaderId) - 1);
    for (const c of men) { expect(g.characters[c.id].alive).toBe(true); expect(g.characters[c.id].faction).toBe('player'); expect(g.characters[c.id].busyUntil).toBe(g.week + 1); }
    expect(recordOf(g, 'manno')!.kept).toBe(1);
    expect(g.talks!.asks).toBeUndefined();
    // A game in your territory pays you through the books.
    const d = s.districts.find((x) => (x.influence.player ?? 0) >= 10) ?? s.districts[0];
    t.asks = [{ ...ask, id: 'fg', favor: { kind: 'game', district: d.id, weeks: 8, cut: 100 } }];
    const g2 = honorFavor(s, 'fg').state;
    expect(pactWith(g2, 'manno', 'split')).toBeDefined();
    const wk = advanceWeek(g2, randomChoices(g2, 4));
    expect(reconcile(wk.report)).toEqual([]);
    expect(wk.report.lines.some((l) => /Split from Manno/.test(l.label) && l.amount === 100)).toBe(true);
  });

  it('saying no costs your word, and the favor is still owed; silence is a no', () => {
    const s = game('diplo2-no');
    const r = s.rivals.find((x) => x.id === 'kessler')!;
    owe(s, s.playerId, r.leaderId);
    ensureTalks(s).asks = [{ id: 'fn', rival: 'kessler', kind: 'collect', w: s.week, until: s.week, text: 'Pay up.', offer: [], favor: { kind: 'vote', against: 'manno' } }];
    const g = refuseFavor(s, 'fn');
    expect(wordWith(g, 'kessler').score).toBeLessThan(50);
    expect(owedBy(g, g.playerId, r.leaderId)).toBe(1);
    const op0 = opinion(s, r.leaderId, s.playerId);
    const g2 = advanceWeek(s, randomChoices(s, 3)).state;
    expect(recordOf(g2, 'kessler')!.refused).toBe(1);
    expect(opinion(g2, r.leaderId, g2.playerId)).toBeLessThan(op0);
  });

  it('call in the favor he owes: a term that makes him take a modest deal, and spends it', () => {
    const s = game('diplo2-call');
    const r = s.rivals.find((x) => x.id === 'feldstein')!;
    expect(allowedKinds(s, 'feldstein')).not.toContain('callfavor');
    owe(s, r.leaderId, s.playerId);
    expect(allowedKinds(s, 'feldstein')).toContain('callfavor');
    const sd: SitDown = { ...openSitDown(s, 'feldstein')!, table: undefined };
    const st = stanceOf(s, 'feldstein')!;
    const d = s.districts.find((x) => (x.influence.feldstein ?? 0) >= 2)!;
    const modest = validateDeal(s, 'feldstein', [{ kind: 'concession', dir: 'them', district: d.id, amount: 1 }]);
    const withCall = validateDeal(s, 'feldstein', [...modest, { kind: 'callfavor' }]);
    expect(dealValue(s, 'feldstein', withCall)).toBeGreaterThan(dealValue(s, 'feldstein', modest));
    // The favor carries a deal he would not take without it.
    const need = needNow(st, sd);
    const cash = validateDeal(s, 'feldstein', [{ kind: 'cash', dir: 'you', amount: Math.max(250, Math.round((need - 1800 + 100) / 50) * 50) }]);
    const both = validateDeal(s, 'feldstein', [...cash, { kind: 'callfavor' }]);
    if (need > 400) expect(need - dealValue(s, 'feldstein', cash)).toBeGreaterThan(150);
    expect(need - dealValue(s, 'feldstein', both)).toBeLessThanOrEqual(150);
    const p = sitStep(s, sd, { propose: both }).sd;
    expect(p.table?.ok).toBe(true);
    const g = shakeOn(s, p).state;
    expect(owedBy(g, r.leaderId, g.playerId)).toBe(0);
  });
});

import { playerMuscle, rivalMuscle } from '../src/engine/war';
import { addOpinion } from '../src/engine/relations';
import { dealMenu, termBounds, validateTerm, ventureCost } from '../src/engine/minds/diplomacy';

/** Put a deal on the table as a yes (their need forced low), and shake. */
function shakeDeal(s: GameState, rival: string, terms: unknown[]) {
  addOpinion(s, s.rivals.find((r) => r.id === rival)!.leaderId, s.playerId, 'test', 100, 0);
  let deal = validateDeal(s, rival, terms);
  const sd0: SitDown = { ...openSitDown(s, rival)!, warmth: 100, anger: 0 };
  const gap = needNow(stanceOf(s, rival)!, sd0) - dealValue(s, rival, deal);
  const cash = gap > 100 ? Math.round((gap + 100) / 50) * 50 : 0;
  if (cash) deal = validateDeal(s, rival, [...deal, { kind: 'cash', dir: 'you', amount: cash }]);
  const res = shakeOn(s, { ...sd0, table: { terms: deal, by: 'boss', ok: true } });
  return { deal, res, cash };
}

describe('new terms', () => {
  it('a racket split pays weekly through the books, both ways; bounds hold', () => {
    const s = game('diplo2-split');
    const mine = s.businesses.find((b) => b.owner === 'player' && b.weeklyBase > 0)!;
    const t = validateTerm(s, 'manno', { kind: 'split', dir: 'you', biz: mine.id, amount: 99, weeks: 999 })!;
    expect(t.amount).toBe(30);
    expect(t.weeks).toBe(26);
    expect(validateTerm(s, 'manno', { kind: 'split', dir: 'you', biz: 'nope' })).toBeUndefined();
    const { res } = shakeDeal(s, 'manno', [{ kind: 'split', dir: 'you', biz: mine.id, amount: 20, weeks: 8 }]);
    expect(res.ok).toBe(true);
    const g = res.state;
    const wk = advanceWeek(g, randomChoices(g, 1));
    expect(reconcile(wk.report)).toEqual([]);
    expect(wk.report.lines.some((l) => /Manno's split/.test(l.label) && l.amount < 0)).toBe(true);
    expect(dealMenu(s, 'manno').some((l) => /biz one of/.test(l))).toBe(true);
  });

  it('lent muscle counts for the side it is lent to, bounded, and nobody is handed over', () => {
    const s = game('diplo2-muscle');
    s.wars.push({ id: 'wx', rival: 'kessler', district: s.districts[0].id, cb: 'claim', sanctioned: true, score: 0, startWeek: s.week, by: 'player' });
    expect(validateTerm(s, 'kessler', { kind: 'muscle', dir: 'them' })).toBeUndefined();
    const m0 = playerMuscle(s);
    const men0 = Object.values(s.characters).filter((c) => c.faction === 'player' && c.alive).length;
    const { res } = shakeDeal(s, 'manno', [{ kind: 'muscle', dir: 'them', amount: 500, weeks: 4 }]);
    expect(res.ok).toBe(true);
    expect(playerMuscle(res.state)).toBe(m0 + 20);
    expect(Object.values(res.state.characters).filter((c) => c.faction === 'player' && c.alive).length).toBe(men0);
    // Expires.
    const later = cloneState(res.state);
    later.week += 5;
    expect(playerMuscle(later)).toBeCloseTo(m0, 5);
    // Lend yours to a family with an enemy: you lose what they gain.
    const s2 = game('diplo2-muscle2');
    ensureTalks(s2).rivalRel['feldstein|manno'] = -60;
    const r0 = rivalMuscle(s2, 'manno');
    const p0 = playerMuscle(s2);
    const r2 = shakeDeal(s2, 'manno', [{ kind: 'muscle', dir: 'you', amount: 8, weeks: 4 }]).res;
    expect(r2.ok).toBe(true);
    expect(rivalMuscle(r2.state, 'manno')).toBeCloseTo(r0 + 8, 5);
    expect(playerMuscle(r2.state)).toBeCloseTo(Math.max(0, p0 - 8), 5);
  });

  it('information is something real when there is something (a mole of a third family), else a tip', () => {
    const s = game('diplo2-info');
    const man = Object.values(s.characters).find((c) => c.alive && c.faction === 'player' && c.id !== s.playerId && c.rank === 'soldier')!;
    man.informantFor = 'feldstein';
    const { res } = shakeDeal(s, 'manno', [{ kind: 'info' }]);
    expect(res.ok).toBe(true);
    expect(res.state.secrets.some((x) => x.ownerId === man.id && x.kind === 'informant' && x.knownBy.includes('player'))).toBe(true);
    const s2 = game('diplo2-info2');
    for (const c of Object.values(s2.characters)) if (c.informantFor) delete c.informantFor;
    s2.secrets = [];
    const m0 = s2.money;
    const x2 = shakeDeal(s2, 'manno', [{ kind: 'info' }]);
    expect(x2.res.state.money).toBeGreaterThan(m0 - x2.cash);
  });

  it('a joint venture: both put in half, you own the new place, they take a weekly share', () => {
    const s = game('diplo2-venture');
    const d = s.districts.find((x) => (x.influence.player ?? 0) >= 5)!;
    const r = s.rivals.find((x) => x.id === 'manno')!;
    r.money = 50000;
    const cost = ventureCost(s, d.id);
    const n0 = s.businesses.filter((b) => b.owner === 'player').length;
    const m0 = s.money;
    const rm0 = r.money;
    const { res, cash } = shakeDeal(s, 'manno', [{ kind: 'venture', district: d.id, amount: 25, weeks: 12 }]);
    expect(res.ok).toBe(true);
    const g = res.state;
    expect(g.businesses.filter((b) => b.owner === 'player').length).toBe(n0 + 1);
    expect(g.money).toBe(m0 - Math.round(cost / 2) - cash);
    expect(g.rivals.find((x) => x.id === 'manno')!.money).toBe(rm0 - Math.round(cost / 2) + cash);
    expect(pactWith(g, 'manno', 'split')?.payer).toBe('player');
    const wk = advanceWeek(g, randomChoices(g, 2));
    expect(reconcile(wk.report)).toEqual([]);
    expect(termBounds(s, 'manno', 'venture').amount!.hi).toBe(40);
  });
});

import { leverCards, playLever } from '../src/engine/minds/diplomacy';

describe('leverage cards', () => {
  it('only real cards show; each once; odds shown; the roll moves need and anger; the engine re-reads the table', () => {
    const s = game('diplo2-lever');
    const r = s.rivals.find((x) => x.id === 'manno')!;
    s.hooks = s.hooks.filter((h) => !(h.holder === 'player' && h.targetId === r.leaderId));
    s.secrets = s.secrets.filter((x) => !(x.knownBy.includes('player') && (x.ownerId === r.leaderId || s.characters[x.ownerId]?.faction === 'manno')));
    const ph = s.rivals.find((x) => x.id === 'philly')!;
    addOpinion(s, ph.leaderId, s.playerId, 'test', -100, 0);
    r.muscle = 100;
    let sd = openSitDown(s, 'manno')!;
    expect(leverCards(s, sd).map((x) => x.card)).toEqual([]);
    // Now give him real cards.
    s.secrets.push({ id: 'sx', ownerId: r.leaderId, kind: 'debt', text: 'He owes a loan shark in Camden more than he can pay.', knownBy: ['player'], week: s.week });
    addOpinion(s, ph.leaderId, s.playerId, 'test', 200, 0);
    r.muscle = 5;
    sd = openSitDown(s, 'manno')!;
    const cards = leverCards(s, sd);
    expect(cards.map((x) => x.card).sort()).toEqual(['dirt', 'philly', 'strength']);
    for (const c of cards) { expect(c.odds).toBeGreaterThan(0); expect(c.odds).toBeLessThan(1); }
    const st = stanceOf(s, 'manno')!;
    const n0 = needNow(st, sd);
    const a0 = sd.anger;
    const p = playLever(s, sd, 'dirt');
    expect(p.sd.played).toHaveLength(1);
    expect(leverCards(s, p.sd).some((x) => x.card === 'dirt')).toBe(false);
    if (p.won) expect(needNow(st, p.sd) - n0).toBeLessThan(0 + (p.sd.anger - a0) * 25 + 1);
    else expect(p.sd.anger).toBeGreaterThan(a0);
    expect(p.sd.log.some((l) => l.who === 'narrator' && /% it would land/.test(l.text))).toBe(true);
    // Playing a card already played does nothing.
    expect(playLever(s, p.sd, 'dirt').sd).toBe(p.sd);
    // Whatever is on the table as theirs still meets their need.
    if (p.sd.table?.by === 'them') expect(needNow(st, p.sd) - dealValue(s, 'manno', p.sd.table.terms)).toBeLessThanOrEqual(150);
    expect(buildDiploPrompt(s, p.sd, { say: 'So?' }).messages[0].content).toMatch(/Leverage he laid on the table/);
  });
});

import { breakablePacts, breakCost, breakPact } from '../src/engine/minds/breakWord';
import { track } from '../src/engine/intrigue';

describe('breaking your word on purpose', () => {
  it('the confirm spells out the cost; breaking it drops your word everywhere, Philadelphia, and gives them cause for war', () => {
    const s = game('diplo2-break');
    const { res } = shakeDeal(s, 'kessler', [{ kind: 'truce', weeks: 26 }]);
    const g = res.state;
    const p = breakablePacts(g, 'kessler').find((x) => x.kind === 'truce')!;
    expect(p).toBeDefined();
    const cost = breakCost(g, p.id);
    expect(cost.join(' ')).toMatch(/every other family/);
    expect(cost.join(' ')).toMatch(/Philadelphia/);
    expect(cost.join(' ')).toMatch(/cause for war/);
    const r = g.rivals.find((x) => x.id === 'kessler')!;
    const ph = g.rivals.find((x) => x.id === 'philly')!;
    const w0 = wordWith(g, 'kessler').score;
    const wm0 = wordWith(g, 'manno').score;
    const op0 = opinion(g, r.leaderId, g.playerId);
    const ph0 = opinion(g, ph.leaderId, g.playerId);
    const t0 = track(g, 'player', 'kessler')?.tension ?? 0;
    const b = breakPact(g, p.id);
    expect(b.ok).toBe(true);
    const h = b.state;
    expect(pactWith(h, 'kessler', 'truce')).toBeUndefined();
    expect(wordWith(h, 'kessler').score).toBeLessThan(w0);
    expect(wordWith(h, 'manno').score).toBeLessThan(wm0);
    expect(opinion(h, r.leaderId, h.playerId)).toBeLessThan(op0);
    expect(opinion(h, ph.leaderId, h.playerId)).toBeLessThan(ph0);
    if (track(g, 'player', 'kessler')) expect(track(h, 'player', 'kessler')!.tension).toBeGreaterThan(t0);
    expect(h.journal!.e.some((e) => /broke your word to Kessler/i.test(e.t) && e.mine)).toBe(true);
    // The input is untouched; a broken pact never counts as kept.
    expect(pactWith(g, 'kessler', 'truce')).toBeDefined();
    const later = advanceWeek(h, randomChoices(h, 5)).state;
    expect(recordOf(later, 'kessler')!.kept).toBe(0);
  });
});

describe('on screen', () => {
  it('the window shows the agenda, the leverage with odds and your word; the board shows the ask and your word', async () => {
    const { createElement } = await import('react');
    const { renderToString } = await import('react-dom/server');
    const { FamilyTalk } = await import('../src/ui/minds/FamilyTalk');
    const s = game('diplo2-ui');
    const r = s.rivals.find((x) => x.id === 'manno')!;
    r.muscle = 5;
    ensureTalks(s).asks = [{ id: 'fu', rival: 'manno', kind: 'grievance', w: s.week, until: s.week, text: 'Your people are crowding my corners.', offer: [], offerText: 'you stay out of the Boardwalk for 26 weeks' }];
    const html = renderToString(createElement(FamilyTalk, { s, rival: 'manno', update: () => undefined, onClose: () => undefined }));
    expect(html).toContain('sit-agenda');
    expect(html).toContain('sit-levers');
    expect(html).toContain('lever-strength');
    expect(html).toMatch(/your word \d+/);
    const { RivalBoard } = await import('../src/ui/shell/sections/RivalBoard');
    const b = renderToString(createElement(RivalBoard, { s }));
    expect(b).toContain('famask-manno');
    expect(b).toContain('word-manno');
  });
});
