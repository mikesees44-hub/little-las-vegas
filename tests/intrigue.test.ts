import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { advanceWeek, cloneState } from '../src/engine/engine';
import { newGame } from '../src/engine/newGame';
import { newCtx } from '../src/engine/ledger';
import { opinion } from '../src/engine/relations';
import { endWar } from '../src/engine/war';
import { upgradeSave } from '../src/engine/upgradeSave';
import { previewAction, resolveActions } from '../src/engine/actions';
import {
  confirmedMole, eraHeadline, eraWith, INTRIGUE_DECIDERS, intrigueWeek, ledgerOf, moleEvent, tellLie, track,
} from '../src/engine/intrigue';
import { commitIntrigue } from '../src/engine/intrigueOps';
import { ensureIntrigue, type Spy } from '../src/engine/intrigueState';
import type { Character, GameState, PlayerAction, War } from '../src/engine/types';
import { IntrigueBoard } from '../src/ui/intrigue/IntrigueBoard';
import { WarRoom } from '../src/ui/intrigue/WarRoom';
import { playWeeks } from './helpers';

/** One week of the intrigue layer alone, then the calendar moves. */
function tick(s: GameState): void {
  intrigueWeek(newCtx(s));
  s.week += 1;
}

function base(seed: string): GameState {
  const s = newGame(seed);
  s.week = 3;
  ensureIntrigue(s);
  return s;
}

const men = (s: GameState): Character[] => Object.values(s.characters).filter((c) => c.alive && c.faction === 'player' && c.id !== s.playerId && (c.rank === 'soldier' || c.rank === 'associate' || c.rank === 'capo')).sort((a, b) => (a.id < b.id ? -1 : 1));
const kesslerCapo = (s: GameState) => Object.values(s.characters).find((c) => c.alive && c.faction === 'kessler' && c.rank === 'capo')!;

function startWar(s: GameState, score: number): War {
  const w: War = { id: `w${s.nextId++}`, rival: 'kessler', district: 'north', cb: 'feud', sanctioned: false, score, startWeek: s.week };
  s.wars.push(w);
  s.rivals.find((r) => r.id === 'kessler')!.war = true;
  return w;
}

describe('eras: driven by real events', () => {
  it('peace → tension → cold war → open war → truce → peace', () => {
    const s = base('era-cycle');
    expect(eraWith(s, 'kessler')).toBe('peace');
    const k = s.rivals.find((r) => r.id === 'kessler')!;
    // They strike one of your places; one of theirs turns up dead by your hand.
    k.lastMove = { week: s.week, move: 'strike', target: 'player', text: 'a fire' };
    const capo = kesslerCapo(s);
    capo.alive = false;
    capo.death = { week: s.week, date: { ...s.date }, cause: 'shot', killer: 'player' };
    tick(s);
    expect(eraWith(s, 'kessler')).toBe('tension');
    expect(track(s, 'player', 'kessler')!.hist.some(([, e]) => e === 'tension')).toBe(true);
    // More of the same: a cold war.
    k.lastMove = { week: s.week, move: 'strike', target: 'player', text: 'another fire' };
    track(s, 'player', 'kessler')!.tension += 15;
    tick(s);
    expect(eraWith(s, 'kessler')).toBe('cold');
    expect(eraHeadline(s).text).toBe('Cold war with the Kessler family');
    // The mattresses.
    const w = startWar(s, 0);
    tick(s);
    expect(eraWith(s, 'kessler')).toBe('war');
    expect(ledgerOf(s, w.id)).toBeDefined();
    // White peace: a truce with a border, then peace when it runs out.
    endWar(newCtx(s), w, 'white', 'white');
    expect(eraWith(s, 'kessler')).toBe('truce');
    const st = track(s, 'player', 'kessler')!.settlement!;
    expect(st.weekly).toBe(0);
    expect(st.border).toBe('north');
    s.week = st.until;
    tick(s);
    expect(['peace', 'tension']).toContain(eraWith(s, 'kessler'));
  });

  it('a cold war can boil over: the rival declares war on his own', () => {
    const s = base('era-declare');
    const t = track(s, 'player', 'kessler')!;
    t.era = 'cold';
    t.since = -10;
    const save = INTRIGUE_DECIDERS.declareWar;
    INTRIGUE_DECIDERS.declareWar = () => 1;
    try {
      t.tension = 95;
      tick(s);
      expect(s.wars.some((w) => w.rival === 'kessler')).toBe(true);
      expect(eraWith(s, 'kessler')).toBe('war');
    } finally { INTRIGUE_DECIDERS.declareWar = save; }
  });
});

describe('spies and the accuracy of what they bring', () => {
  function spyRun(doubled: boolean): { true: number; all: number } {
    const s = base(doubled ? 'spy-doubled' : 'spy-clean');
    const I = ensureIntrigue(s);
    const capo = kesslerCapo(s);
    capo.informantFor = 'player';
    const sp: Spy = { id: 'sp1', charId: capo.id, master: 'player', inside: 'kessler', how: 'bribe', since: s.week, cover: 100, doubled: doubled ? 'kessler' : undefined };
    I.spies.push(sp);
    const save = INTRIGUE_DECIDERS.findSpy;
    INTRIGUE_DECIDERS.findSpy = () => 0;
    try { for (let i = 0; i < 60; i++) { sp.ended = undefined; sp.cover = 100; tick(s); } } finally { INTRIGUE_DECIDERS.findSpy = save; }
    const xs = I.intel.filter((x) => x.spyId === 'sp1');
    return { true: xs.filter((x) => x.true).length, all: xs.length };
  }
  it('a clean spy is mostly right; a doubled one mostly wrong', () => {
    const clean = spyRun(false);
    const dbl = spyRun(true);
    expect(clean.all).toBeGreaterThan(8);
    expect(dbl.all).toBeGreaterThan(8);
    expect(clean.true / clean.all).toBeGreaterThan(0.7);
    expect(dbl.true / dbl.all).toBeLessThan(0.3);
  });

  it('turning one of theirs and planting one of yours are orders with odds', () => {
    const s = base('spy-orders');
    const t = kesslerCapo(s);
    const turn: PlayerAction = { kind: 'intrigue', op: { op: 'turn', targetId: t.id, how: 'bribe' } };
    const p = previewAction(s, turn);
    expect(p.disabledReason).toBeUndefined();
    expect(p.odds!.chance).toBeGreaterThan(0);
    // Blackmail needs something on him.
    expect(previewAction(s, { kind: 'intrigue', op: { op: 'turn', targetId: t.id, how: 'blackmail' } }).disabledReason).toBe('You hold nothing on him');
    const soldier = men(s).find((c) => c.rank === 'soldier' || c.rank === 'associate')!;
    soldier.informantFor = undefined;
    expect(previewAction(s, { kind: 'intrigue', op: { op: 'plant', charId: soldier.id, rival: 'manno' } }).disabledReason).toBeUndefined();
  });
});

describe('the molehunt', () => {
  it('a canary trap names the leak; nothing happens to him without the boss', () => {
    const s = base('canary');
    const [a, b, c] = men(s).filter((m) => !m.informantFor);
    b.informantFor = 'kessler';
    commitIntrigue(newCtx(s), { op: 'canary', suspects: [a.id, b.id, c.id] });
    for (let i = 0; i < 4; i++) tick(s);
    const k = s.intrigue!.canaries[0];
    expect(k.result).toBeDefined();
    expect(k.caught).toBe(b.id);
    expect(confirmedMole(s, b.id)).toBe(true);
    expect(confirmedMole(s, a.id)).toBe(false);
    // The decision: the default answer leaves him be.
    const ev = s.eventQueue.find((e) => e.defId === 'intrigue_mole')!;
    expect(ev).toBeDefined();
    const def = ev.choices.find((x) => x.id === ev.defaultChoiceId)!;
    expect(def.effects).toEqual([]);
    expect(b.alive && b.faction === 'player').toBe(true);
  });

  it('what happens to a mole is only ever the boss\'s order, and only once he knows', () => {
    const s = base('mole-fate');
    const m = men(s)[0];
    m.informantFor = 'law';
    const bury: PlayerAction = { kind: 'intrigue', op: { op: 'moleFate', charId: m.id, fate: 'bury' } };
    expect(previewAction(s, bury).disabledReason).toMatch(/do not know/);
    const ctx = newCtx(s);
    resolveActions(ctx, [bury]);
    expect(m.alive).toBe(true);
    // Questioning hard is an explicit order (and says so).
    const q = previewAction(s, { kind: 'intrigue', op: { op: 'question', charId: m.id, how: 'hard' } });
    expect(q.warning).toMatch(/your choice/i);
  });

  it('no intrigue decision\'s default ever harms, sends away or hands over one of your men', () => {
    for (const seed of ['surr-a', 'surr-b']) {
      let s = newGame(seed);
      const defaults: string[] = [];
      for (let i = 0; i < 70 && !s.gameOver; i++) {
        for (const e of s.pendingEvents.filter((x) => x.defId.startsWith('intrigue_'))) {
          const def = e.choices.find((x) => x.id === e.defaultChoiceId)!;
          defaults.push(e.defId);
          for (const fx of def.effects) expect(['kill', 'exile', 'flip', 'imprison', 'faction2', 'retire'], `${e.defId}`).not.toContain(fx.type);
        }
        s = advanceWeek(s, {}).state;
      }
      for (const c of Object.values(s.characters)) if (c.death) expect(c.death.cause).not.toMatch(/never seen again$/);
    }
    // The mole decision itself, built directly.
    const s = base('surr-c');
    const m = men(s)[0];
    m.informantFor = 'kessler';
    const ev = moleEvent(s, m, 'Test.');
    expect(ev.choices.find((x) => x.id === ev.defaultChoiceId)!.effects).toEqual([]);
  });
});

describe('lies', () => {
  it('a lie the boss told can come out: their boss remembers, the tension jumps', () => {
    const s = base('lie-out');
    const k = s.rivals.find((r) => r.id === 'kessler')!;
    const before = opinion(s, k.leaderId, s.playerId);
    const t0 = track(s, 'player', 'kessler')!.tension;
    const r0 = s.respect;
    tellLie(s, { teller: 'player', to: 'kessler', kind: 'falseflag', text: 'You told them Manno did it', truth: 'It was you', blame: 'manno', risk: 1 });
    s.week += 1;
    tick(s);
    const l = s.intrigue!.lies[0];
    expect(l.discovered).toBeDefined();
    expect(opinion(s, k.leaderId, s.playerId)).toBeLessThan(before);
    expect(track(s, 'player', 'kessler')!.tension).toBeGreaterThan(t0);
    expect(s.respect).toBeLessThan(r0);
  });

  it('their lie to you, found out, is a grievance', () => {
    const s = base('lie-npc');
    tellLie(s, { teller: 'manno', to: 'player', kind: 'deny', text: 'Manno said it was not them', truth: 'It was Manno', risk: 1 });
    s.week += 1;
    tick(s);
    expect(s.flags.grievance_manno).toBe(1);
    expect(s.intrigue!.log.some(([, t]) => /What you later learned/.test(t))).toBe(true);
  });

  it('a rumor in the paper runs in Spout Off and is remembered as a lie', () => {
    const s = base('rumor');
    const m0 = s.rivals.find((r) => r.id === 'manno')!.muscle;
    const ctx = newCtx(s);
    resolveActions(ctx, [{ kind: 'intrigue', op: { op: 'rumor', rival: 'manno', line: 'weak', via: 'paper' } }]);
    expect(s.paper?.wire.some((w) => w.s === 'spout' && /Manno/.test(w.b))).toBe(true);
    expect(s.rivals.find((r) => r.id === 'manno')!.muscle).toBeLessThan(m0);
    expect(s.intrigue!.lies.some((l) => l.kind === 'rumor' && l.to === 'manno' && l.via === 'paper')).toBe(true);
  });

  it('your own men tell you what suits them; the truth comes out later', () => {
    const s = playWeeks('reports', 50);
    const xs = s.intrigue!.intel.filter((x) => x.sourceId && x.learned);
    expect(xs.length).toBeGreaterThan(0);
    for (const x of xs) expect(x.told.length && x.truth.length).toBeTruthy();
  });
});

describe('war that pays, and the peace after it', () => {
  it('while winning, their rackets in the district pay you; a won war takes tribute for a season', () => {
    const s = base('war-pays');
    s.rivals.find((r) => r.id === 'kessler')!.money = 60000;
    const w = startWar(s, 60);
    const m0 = s.money;
    for (let i = 0; i < 4; i++) tick(s);
    const l = ledgerOf(s, w.id)!;
    expect(l.gained).toBeGreaterThan(0);
    expect(s.money).toBeGreaterThan(m0 - 100); // spoils outrun the noise
    endWar(newCtx(s), w, 'won', 'district');
    const st = track(s, 'player', 'kessler')!.settlement!;
    expect(eraWith(s, 'kessler')).toBe('truce');
    expect(st.weekly).toBeGreaterThan(0);
    const g = l.gained;
    const m1 = s.money;
    tick(s);
    expect(s.money).toBeGreaterThan(m1);
    expect(l.gained).toBeGreaterThan(g);
    expect(l.outcome).toBe('won');
  });

  it('a lost war costs a weekly payment; the war room shows the ledger', () => {
    const s = base('war-lost');
    const w = startWar(s, -50);
    tick(s);
    const html = renderToString(createElement(WarRoom, { s }));
    expect(html).toContain('data-testid="war-ledger"');
    expect(html).toContain('data-testid="fronts"');
    endWar(newCtx(s), w, 'lost', 'district');
    expect(track(s, 'player', 'kessler')!.settlement!.weekly).toBeLessThan(0);
    tick(s);
    expect(track(s, 'player', 'kessler')!.settlement!.paid).toBeLessThan(0);
  });
});

describe('the board', () => {
  it('renders the era, the web, the suspects, the lies and what you were told', () => {
    const s = playWeeks('board', 30);
    const html = renderToString(createElement(IntrigueBoard, { s }));
    for (const id of ['intrigue-board', 'era-headline', 'family-mood', 'spy-web', 'lies', 'told-learned', 'intrigue-log']) expect(html, id).toContain(`data-testid="${id}"`);
  });
});

describe('determinism and saves', () => {
  it('same seed, same intrigue', () => {
    const a = playWeeks('det-intr', 30);
    const b = playWeeks('det-intr', 30);
    expect(JSON.stringify(a.intrigue)).toBe(JSON.stringify(b.intrigue));
    expect(a.intrigue).toBeDefined();
  });

  it('a save round-trips, and the next week is the same either way', () => {
    const s = playWeeks('rt-intr', 20);
    const loaded = JSON.parse(JSON.stringify(s)) as GameState;
    expect(loaded.intrigue).toEqual(s.intrigue);
    const x = advanceWeek(s, {}).state;
    const y = advanceWeek(loaded, {}).state;
    expect(JSON.stringify(y.intrigue)).toBe(JSON.stringify(x.intrigue));
    expect(y.money).toBe(x.money);
  });

  it('upgradeSave leaves the layer alone (and an old save without it alone)', () => {
    const s = playWeeks('up-intr', 12);
    const before = JSON.stringify(s.intrigue);
    const up = upgradeSave(cloneState(s));
    expect(JSON.stringify(up.intrigue)).toBe(before);
    const old = cloneState(s);
    delete old.intrigue;
    expect(upgradeSave(old).intrigue).toBeUndefined();
  });

  it('a new game has no intrigue yet; it starts with the second week', () => {
    const s = newGame('fresh-intr');
    expect(s.intrigue).toBeUndefined();
    expect(eraHeadline(s).era).toBe('peace');
  });
});
