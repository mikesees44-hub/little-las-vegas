import { describe, expect, it } from 'vitest';
import { previewAction } from '../src/engine/actions';
import {
  buildRequestEvent, capoCard, capoCourted, capoEventSource, capoWantsMen, caposWeek, ensureCapos, familyStrength, gripOf, isCapo, newBook, readOn,
  stanceFor, streetTruths, tideOf, applyCapoOp, commitCapo, capoStreetMult,
} from '../src/engine/capos';
import { capos, crew, makeCharacter, player } from '../src/engine/characters';
import { advanceWeek, cloneState } from '../src/engine/engine';
import { isSurrender } from '../src/engine/handover';
import { assignTo, regime } from '../src/engine/hierarchy';
import { newCtx } from '../src/engine/ledger';
import { newGame } from '../src/engine/newGame';
import { addOpinion, opinion } from '../src/engine/relations';
import { upgradeSave } from '../src/engine/upgradeSave';
import type { Character, GameState } from '../src/engine/types';
import { playWeeks } from './helpers';

/** A fresh game whose capos have books (one capo week run). */
function started(seed: string): GameState {
  const s = newGame(seed);
  caposWeek(newCtx(s));
  return s;
}

function firstCapo(s: GameState): Character {
  return capos(s).filter((k) => k.id !== s.playerId)[0];
}

/** Run the capo layer alone for n weeks (fast: no rest of the engine). */
function capoWeeks(s: GameState, n: number): void {
  for (let i = 0; i < n; i++) {
    s.week += 1;
    caposWeek(newCtx(s));
  }
}

function makeHonest(s: GameState, k: Character): void {
  k.traits = ['Honest', 'Loyal-to-a-fault'];
  k.attributes.intrigue = 30;
  addOpinion(s, k.id, s.playerId, 'Test: devoted', 60, 0);
}

function makeSchemer(s: GameState, k: Character): void {
  k.traits = ['Ambitious', 'Patient', 'Greedy'];
  k.attributes.intrigue = 75;
  addOpinion(s, k.id, s.playerId, 'Test: hates the boss', -80, 0);
}

describe('capos: the street', () => {
  it('every capo gets a book, a grip, a take history and a line for this week', () => {
    const s = playWeeks('capo-street', 6);
    const C = s.capos!;
    expect(C).toBeDefined();
    for (const k of capos(s).filter((x) => x.id !== s.playerId)) {
      const b = C.books[k.id];
      expect(b, k.firstName).toBeDefined();
      expect(b.doing.length).toBeGreaterThan(3);
      const card = capoCard(s, k);
      expect(card.grip).toBeGreaterThanOrEqual(0);
      expect(card.grip).toBeLessThanOrEqual(100);
      expect(card.read.word.length).toBeGreaterThan(3);
    }
  });

  it('a better capo runs his corners better (grip → the corners multiplier)', () => {
    const s = started('capo-grip');
    const k = firstCapo(s);
    k.attributes.leadership = 20; k.attributes.business = 20; k.traits = ['Drinker'];
    const poor = gripOf(s, k).v;
    const pm = capoStreetMult(s, k);
    k.attributes.leadership = 85; k.attributes.business = 85; k.traits = ['Patient'];
    const good = gripOf(s, k).v;
    expect(good).toBeGreaterThan(poor + 25);
    expect(capoStreetMult(s, k)).toBeGreaterThan(pm + 0.05);
  });
});

describe('capos: requests', () => {
  it('a capo short of men names one and asks; the boss says yes and the man joins his crew as an associate', () => {
    const s = started('capo-req');
    const k = firstCapo(s);
    // Make him short-handed.
    for (const m of regime(s, k.id)) assignTo(s, m, undefined);
    const ctx = newCtx(s);
    expect(capoWantsMen(ctx, k)).toBe(true);
    const q = s.capos!.req.find((x) => x.capo === k.id && !x.ans)!;
    expect(q).toBeDefined();
    expect(['men', 'transfer']).toContain(q.k);
    expect(q.y).toMatch(/I need (one|two|three) more guy/);
    const ev = buildRequestEvent(s, q)!;
    expect(ev.choices.map((c) => c.id)).toEqual(expect.arrayContaining(['yes', 'no', 'later']));
    const man = s.characters[q.who!];
    applyCapoOp(newCtx(s), { op: 'answer', req: q.id, a: 'yes' });
    expect(q.ans).toBe('yes');
    expect(man.faction).toBe('player');
    expect(['associate', 'soldier']).toContain(man.rank);
    expect(man.capoId).toBe(k.id);
  });

  it('no is a slight he remembers; a transfer costs the other capo', () => {
    const s = started('capo-req-no');
    const [a, b] = capos(s).filter((x) => x.id !== s.playerId);
    const before = opinion(s, a.id, s.playerId);
    const C = ensureCapos(s);
    const kid = makeCharacter(s, { rank: 'civilian', faction: 'none', age: 20 });
    C.req.push({ id: 'rqT1', capo: a.id, k: 'men', who: kid.id, y: 'I need one more guy', w: s.week });
    applyCapoOp(newCtx(s), { op: 'answer', req: 'rqT1', a: 'no' });
    expect(opinion(s, a.id, s.playerId)).toBeLessThan(before);
    expect(C.books[a.id].sl).toBeGreaterThan(0);
    if (b) {
      const m = regime(s, b.id)[0] ?? crew(s).find((x) => x.rank === 'associate')!;
      assignTo(s, m, b.id);
      const bBefore = opinion(s, b.id, s.playerId);
      C.req.push({ id: 'rqT2', capo: a.id, k: 'transfer', who: m.id, from: b.id, y: 'Give me him', w: s.week });
      applyCapoOp(newCtx(s), { op: 'answer', req: 'rqT2', a: 'yes' });
      expect(m.capoId).toBe(a.id);
      expect(opinion(s, b.id, s.playerId)).toBeLessThan(bBefore);
      expect(opinion(s, b.id, a.id)).toBeLessThan(0);
    }
  });

  it('requests reach the one popup pipeline, and the boss can answer from the capo card (an order)', () => {
    const s = started('capo-req-ev');
    const k = firstCapo(s);
    for (const m of regime(s, k.id)) assignTo(s, m, undefined);
    capoWantsMen(newCtx(s), k);
    const ev = capoEventSource(s)!;
    expect(ev).toBeDefined();
    expect(ev.defId).toMatch(/^capo_/);
    expect(ev.meta?.charId).toBe(k.id);
    const q = s.capos!.req.find((x) => !x.ans)!;
    const p = previewAction(s, { kind: 'capo', op: { op: 'answer', req: q.id, a: 'yes' } });
    expect(p.disabledReason).toBeUndefined();
    const r = advanceWeek(s, { actions: [{ kind: 'capo', op: { op: 'answer', req: q.id, a: 'yes' } }] });
    expect(r.state.capos!.req.find((x) => x.id === q.id)!.ans).toBe('yes');
  });

  it('a request nobody answers: a street kid comes in on the capo\'s own say, a transfer lapses', () => {
    const s = started('capo-lapse');
    const k = firstCapo(s);
    const C = ensureCapos(s);
    const kid = makeCharacter(s, { rank: 'civilian', faction: 'none', age: 19 });
    C.req.push({ id: 'rqL1', capo: k.id, k: 'men', who: kid.id, y: 'I need one more guy', w: s.week });
    capoWeeks(s, 6);
    expect(C.req.find((x) => x.id === 'rqL1')!.ans).toBe('yes');
    expect(kid.faction).toBe('player');
    expect(kid.capoId).toBe(k.id);
  });
});

describe('capos: grooming', () => {
  it('a capo brings an associate along stage by stage: XP, loyalty to HIM, then he asks to put the name up', () => {
    const s = started('capo-groom');
    const k = firstCapo(s);
    k.attributes.leadership = 80;
    const m = makeCharacter(s, { rank: 'associate', faction: 'player', age: 22 });
    assignTo(s, m, k.id);
    const toCapo0 = opinion(s, m.id, k.id);
    const toBoss0 = opinion(s, m.id, s.playerId);
    // Only him to groom.
    for (const x of regime(s, k.id)) if (x.id !== m.id && x.rank === 'associate') x.rank = 'soldier';
    capoWeeks(s, 40);
    const C = s.capos!;
    const g = C.groom.find((x) => x.id === m.id)!;
    expect(g).toBeDefined();
    expect(g.st).toBeGreaterThanOrEqual(3);
    expect(g.xp).toBeGreaterThan(20);
    expect(s.xp?.men[m.id]?.xp ?? 0).toBeGreaterThan(20);
    expect(opinion(s, m.id, k.id) - toCapo0).toBeGreaterThan(15);
    // His loyalty grew to the capo, not (by grooming) to the boss.
    expect(opinion(s, m.id, k.id) - toCapo0).toBeGreaterThan(opinion(s, m.id, s.playerId) - toBoss0 + 10);
    const q = C.req.find((x) => x.k === 'make' && x.who === m.id);
    expect(q).toBeDefined();
    // The boss decides: yes puts the name up with the capo vouching (Philadelphia's books decide when).
    s.money = 10000;
    applyCapoOp(newCtx(s), { op: 'answer', req: q!.id, a: 'yes' });
    if (m.proposedWeek !== undefined) expect(m.vouchedBy).toBe(k.id);
    expect(g.st).toBe(4);
  });
});

describe('capos: what they tell you', () => {
  function trial(seed: string, honest: boolean): { honest: number; slant: number; withheld: number } {
    const s = started(seed);
    const k = firstCapo(s);
    if (honest) makeHonest(s, k); else makeSchemer(s, k);
    const b = s.capos!.books[k.id];
    // A rat in his own crew: the thing a capo is most tempted to keep quiet.
    const rat = makeCharacter(s, { rank: 'associate', faction: 'player', age: 25 });
    assignTo(s, rat, k.id);
    rat.informantFor = 'law';
    const out = { honest: 0, slant: 0, withheld: 0 };
    for (let i = 0; i < 40; i++) {
      b.tide = honest ? 60 : -60;
      b.st = stanceFor(s, k, b.tide, b.st);
      s.capos!.reports = [];
      b.intel = [{ id: `t${i}`, k: 'rat', about: rat.id, truth: `${rat.firstName} talks to the FBI`, w: s.week }];
      s.week += 1;
      caposWeek(newCtx(s));
      for (const r of s.capos!.reports.filter((x) => x.capo === k.id)) out[r.kind]++;
    }
    return out;
  }

  it('an honest capo tells it straight; a schemer slants it or keeps it back', () => {
    const h = trial('capo-honest', true);
    const x = trial('capo-schemer', false);
    expect(h.honest).toBeGreaterThan((h.slant + h.withheld) * 3);
    expect(x.slant + x.withheld).toBeGreaterThan(x.honest * 2);
    expect(x.slant).toBeGreaterThan(0);
  });

  it('his territory holds things the boss does not know; told straight, the boss knows them', () => {
    const s = started('capo-truths');
    const k = firstCapo(s);
    makeHonest(s, k);
    const rat = makeCharacter(s, { rank: 'associate', faction: 'player', age: 25 });
    assignTo(s, rat, k.id);
    rat.informantFor = 'law';
    expect(streetTruths(s, k).some((i) => i.k === 'rat' && i.about === rat.id)).toBe(true);
    // Ask him straight: everything he knows, told straight.
    s.capos!.books[k.id].intel.push({ id: 'ti', k: 'rat', about: rat.id, truth: 'x talks', w: s.week });
    commitCapo(newCtx(s), { op: 'ask', capo: k.id });
    expect(s.secrets.some((x) => x.ownerId === rat.id && x.kind === 'informant' && x.knownBy.includes('player'))).toBe(true);
  });

  it('asking him straight brings out what he kept back before', () => {
    const s = started('capo-ask');
    const k = firstCapo(s);
    const C = s.capos!;
    C.reports.push({ id: 'crX', capo: k.id, w: s.week, k: 'rival', told: 'Quiet week', truth: 'Manno is moving men', kind: 'withheld' });
    const p = previewAction(s, { kind: 'capo', op: { op: 'ask', capo: k.id } });
    expect(p.acceptance).toBeDefined();
    expect(p.acceptance!.reasons.length).toBeGreaterThan(1);
    commitCapo(newCtx(s), { op: 'ask', capo: k.id });
    expect(C.reports.find((x) => x.id === 'crX')!.rev).toBe(s.week);
  });
});

describe('capos: the changing tide', () => {
  it('weakness and slights pull the tide down; rewards and family ties lift it', () => {
    const s = started('capo-tide');
    const k = firstCapo(s);
    k.traits = ['Ambitious'];
    const base = tideOf(s, k).v;
    const weak = cloneState(s);
    weak.money = -5000;
    weak.respect = 10;
    weak.heat.local = 80;
    weak.wars.push({ id: 'wT', rival: 'manno', district: weak.districts[0].id, cb: 'none' as never, sanctioned: false, score: -50, startWeek: weak.week });
    const kw = weak.characters[k.id];
    expect(familyStrength(weak).reduce((a, r) => a + r.value, 0)).toBeLessThan(familyStrength(s).reduce((a, r) => a + r.value, 0) - 30);
    expect(tideOf(weak, kw).v).toBeLessThan(base - 30);
    const sl = cloneState(s);
    sl.capos!.books[k.id].sl = 4;
    expect(tideOf(sl, sl.characters[k.id]).v).toBeLessThan(base - 10);
    const rw = cloneState(s);
    rw.capos!.books[k.id].rw = 4;
    rw.capos!.books[k.id].tied = { w: rw.week, how: 'compare' };
    expect(tideOf(rw, rw.characters[k.id]).v).toBeGreaterThan(base + 20);
  });

  it('hedging and turning come with a weak family and a slighted capo, not a strong one; loyal-to-a-fault never turns', () => {
    const count = (weak: boolean): { hedge: number; plots: number } => {
      let hedge = 0, plots = 0;
      for (let i = 0; i < 4; i++) {
        const s = started(`capo-hedge-${weak ? 'w' : 's'}-${i}`);
        for (const k of capos(s)) { k.traits = ['Ambitious', 'Greedy']; addOpinion(s, k.id, s.playerId, 'Test', weak ? -50 : 40, 0); }
        if (weak) { s.money = -5000; s.respect = 10; s.heat.local = 80; }
        else { s.money = 80000; s.respect = 75; }
        for (let w = 0; w < 30; w++) {
          for (const b of Object.values(s.capos!.books)) { if (weak) b.sl = 3; else b.rw = 3; }
          capoWeeks(s, 1);
          for (const b of Object.values(s.capos!.books)) if (b.st === 'hedging' || b.st === 'turning') hedge++;
        }
        plots += s.capos!.stats.plots;
      }
      return { hedge, plots };
    };
    const weak = count(true);
    const strong = count(false);
    expect(weak.hedge).toBeGreaterThan(strong.hedge + 20);
    expect(weak.plots).toBeGreaterThan(strong.plots);
    expect(strong.plots).toBe(0);
    // Loyal to a fault: never turning.
    const s = started('capo-ltaf');
    const k = firstCapo(s);
    k.traits = ['Loyal-to-a-fault'];
    expect(stanceFor(s, k, -90, 'hedging')).toBe('hedging');
  });

  it('a capo courted to the point of leaving makes his deal over weeks, with signs, and can be found out', () => {
    const s = started('capo-court');
    const k = firstCapo(s);
    k.traits = ['Ambitious', 'Greedy'];
    expect(capoCourted(newCtx(s), k, 'manno')).toBe(true);
    const b = s.capos!.books[k.id];
    expect(b.plot?.k).toBe('defect');
    expect(b.signs.some((x) => x.k === 'seen')).toBe(true);
    expect(readOn(s, k).bad).toBeGreaterThan(0);
    // He has not gone yet: the boss has time.
    expect(k.faction).toBe('player');
  });

  it('a confrontation that lands brings him back; the plot is dropped', () => {
    let landed = 0;
    for (let i = 0; i < 12; i++) {
      const s = started(`capo-confront-${i}`);
      const k = firstCapo(s);
      k.traits = ['Cowardly'];
      addOpinion(s, k.id, s.playerId, 'Test', 30, 0);
      s.capos!.books[k.id].plot = { k: 'defect', rival: 'manno', st: 0, w: s.week, sw: s.week, known: s.week };
      commitCapo(newCtx(s), { op: 'confront', capo: k.id });
      if (!s.capos!.books[k.id]?.plot && k.faction === 'player') landed++;
    }
    expect(landed).toBeGreaterThan(4);
  });
});

describe('capos: the crisis', () => {
  it('in a losing war, loyal capos rally, hold a front, or bring intel: the war score moves your way', () => {
    let saves = 0, moved = 0;
    for (let i = 0; i < 4; i++) {
      const s = started(`capo-crisis-${i}`);
      for (const k of capos(s)) makeHonest(s, k);
      s.wars.push({ id: 'wC', rival: 'manno', district: s.districts[0].id, cb: 'none' as never, sanctioned: false, score: -40, startWeek: s.week });
      for (let w = 0; w < 12; w++) {
        for (const b of Object.values(s.capos!.books)) b.tide = 60;
        capoWeeks(s, 1);
      }
      saves += s.capos!.stats.saves;
      if (s.wars[0].score > -40) moved++;
    }
    expect(saves).toBeGreaterThan(2);
    expect(moved).toBeGreaterThan(1);
  });
});

describe('capos: the hard rule and the plumbing', () => {
  it('no capo popup gives a man up, by choice or by default', () => {
    const s = playWeeks('capo-handover', 20);
    const C = ensureCapos(s);
    const k = firstCapo(s);
    C.books[k.id] ??= newBook(s.week);
    C.books[k.id].plot = { k: 'defect', rival: 'manno', st: 1, w: s.week, sw: s.week, known: s.week };
    const kid = makeCharacter(s, { rank: 'civilian', faction: 'none', age: 20 });
    C.req.push({ id: 'rqH', capo: k.id, k: 'men', who: kid.id, y: 'I need one more guy', w: s.week });
    for (let i = 0; i < 3; i++) {
      const ev = capoEventSource(s);
      if (!ev) break;
      for (const ch of ev.choices) expect(isSurrender(s, ch), `${ev.defId}:${ch.id}`).toBe(false);
      expect(ev.choices.find((c) => c.id === ev.defaultChoiceId)).toBeDefined();
      C.req.forEach((q) => { q.shown = s.week; });
    }
  });

  it('the capo layer never kills or jails one of the boss\'s men', () => {
    let s = newGame('capo-alive');
    for (let w = 0; w < 30; w++) {
      const before = new Set(crew(s).filter((c) => c.alive).map((c) => c.id));
      const t = cloneState(s);
      t.week += 1;
      caposWeek(newCtx(t));
      for (const id of before) {
        expect(t.characters[id].alive).toBe(true);
        expect(t.characters[id].imprisonedUntil ?? -1).toBe(s.characters[id].imprisonedUntil ?? -1);
      }
      s = advanceWeek(s, {}).state;
    }
  });

  it('is deterministic: the same seed and orders give the same capos', () => {
    const a = playWeeks('capo-det', 16);
    const b = playWeeks('capo-det', 16);
    expect(JSON.stringify(a.capos)).toBe(JSON.stringify(b.capos));
  });

  it('round-trips through JSON; upgradeSave leaves a save with capos (and one without) as it is', () => {
    const s = playWeeks('capo-save', 10);
    expect(s.capos).toBeDefined();
    const json = JSON.stringify(s);
    expect(JSON.stringify(JSON.parse(json))).toBe(json);
    expect(JSON.stringify(upgradeSave(JSON.parse(json)))).toBe(json);
    const old = JSON.parse(json) as GameState;
    delete old.capos;
    const oj = JSON.stringify(old);
    expect(JSON.stringify(upgradeSave(JSON.parse(oj)))).toBe(oj);
    // ... and the next week makes the layer.
    expect(advanceWeek(upgradeSave(JSON.parse(oj)), {}).state.capos).toBeDefined();
  });

  it('every capo order previews with a title, and is a capo of yours', () => {
    const s = started('capo-orders');
    const k = firstCapo(s);
    s.money = 50000;
    for (const op of ['reward', 'recognize', 'kin', 'watch', 'ask', 'confront'] as const) {
      const a = op === 'reward' ? { op, capo: k.id, amount: 500 } : { op, capo: k.id };
      const p = previewAction(s, { kind: 'capo', op: a as never });
      expect(p.title.length, op).toBeGreaterThan(5);
    }
    expect(previewAction(s, { kind: 'capo', op: { op: 'ask', capo: player(s).id } }).disabledReason).toBeDefined();
    expect(isCapo(s, k.id)).toBeDefined();
  });
});
