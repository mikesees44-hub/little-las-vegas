import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/newGame';
import { newGameWith } from '../src/engine/starts';
import { advanceWeek } from '../src/engine/engine';
import { newCtx, reconcile } from '../src/engine/ledger';
import { validatePlayer } from '../src/engine/dynasty';
import { validateHierarchy } from '../src/engine/hierarchy';
import { crew, makeCharacter, player } from '../src/engine/characters';
import { ALL_ATTRS, ensureAttrs, growthMonth } from '../src/engine/attrs';
import { challengePressure, successionCandidates } from '../src/engine/heir';
import { passedOver, wantersFor } from '../src/engine/grievances';
import { applyEffects } from '../src/engine/effects';
import { blitzStep, launchBlitz } from '../src/engine/blitz';
import { applyPowerOp } from '../src/engine/power';
import { installFront, frontMonth } from '../src/engine/front';
import { buildAudience, investigateOdds } from '../src/engine/audience';
import { depose } from '../src/engine/station';
import { pw } from '../src/engine/powerState';
import { randomChoices } from './helpers';
import type { GameState } from '../src/engine/types';

function play(s: GameState, weeks: number, random = true): GameState {
  for (let i = 0; i < weeks && !s.gameOver; i++) {
    const r = advanceWeek(s, random ? randomChoices(s, i) : {});
    expect(reconcile(r.report)).toEqual([]);
    s = r.state;
  }
  return s;
}

describe('power: expanded attributes', () => {
  it('are deterministic for a seed and coherent with the base skills', () => {
    const a = newGame('attrs1');
    const b = newGame('attrs1');
    const ca = player(a);
    const cb = player(b);
    const xa = ensureAttrs(a, ca);
    const xb = ensureAttrs(b, cb);
    expect(xa.v).toEqual(xb.v);
    expect(Object.keys(xa.v).length).toBe(ALL_ATTRS.length);
    expect(ALL_ATTRS.length).toBeGreaterThanOrEqual(35);
    for (const k of ALL_ATTRS) expect(xa.v[k]).toBeGreaterThanOrEqual(0), expect(xa.v[k]).toBeLessThanOrEqual(100);
    // Generating attrs consumes no RNG.
    expect(a.rng).toBe(b.rng);
    // A different seed gives a different man.
    expect(ensureAttrs(newGame('attrs2'), player(newGame('attrs2'))).v).not.toEqual(xa.v);
  });

  it('children inherit from their parents', () => {
    const s = newGame('attrs-inherit');
    const father = makeCharacter(s, { gender: 'M', age: 40 });
    const mother = makeCharacter(s, { gender: 'F', age: 38 });
    ensureAttrs(s, father).v.charisma = 100;
    ensureAttrs(s, mother).v.charisma = 100;
    ensureAttrs(s, father).v.patience = 100;
    ensureAttrs(s, mother).v.patience = 100;
    const kidA = makeCharacter(s, { gender: 'M', age: 10, traits: [] });
    const kidB = { ...kidA, id: `${kidA.id}x`, fatherId: father.id, motherId: mother.id, attrs: undefined };
    s.characters[kidB.id] = kidB;
    // Same base person, with and without parents: the child of two charmers is more charming.
    const orphan = ensureAttrs(s, kidA).v;
    const child = ensureAttrs(s, kidB).v;
    expect(child.charisma).toBeGreaterThan(orphan.charisma);
    expect(child.patience).toBeGreaterThan(orphan.patience);
  });

  it('grow over time from a placement, and protégés gather followers', () => {
    const s = newGame('attrs-grow');
    const man = crew(s).find((c) => c.rank === 'soldier')!;
    const x = ensureAttrs(s, man);
    x.v.charisma = 90; x.v.command = 90; x.v.earning = 90;
    const before = x.v.judgment + x.v.strategy + x.v.negotiation + x.v.discretion;
    pw(s).placements[man.id] = { post: 'consigliere', since: s.week };
    for (let i = 0; i < 24; i++) growthMonth(s);
    const after = x.v.judgment + x.v.strategy + x.v.negotiation + x.v.discretion;
    expect(after).toBeGreaterThan(before);
    expect(x.followers ?? 0).toBeGreaterThan(0);
  });
});

describe('power: the heir paradox', () => {
  it('challenge pressure is monotonic in ambition and grievance', () => {
    const s = newGame('pressure');
    for (const c of successionCandidates(s).slice(0, 4)) {
      const x = ensureAttrs(s, c).v;
      let prev = -1;
      for (const amb of [0, 20, 40, 60, 80, 100]) {
        x.ambition = amb;
        const p = challengePressure(s, c).score;
        expect(p).toBeGreaterThanOrEqual(prev);
        prev = p;
      }
      x.ambition = 50;
      prev = -1;
      for (const sev of [0, 20, 40, 80]) {
        pw(s).grievances = sev ? [{ id: 'g', charId: c.id, post: 'heir', postLabel: 'heir', byId: s.playerId, severity: sev, witnesses: 1, week: 1, stage: 0, status: 'open', reasons: [], public: true, next: 99 }] : [];
        const p = challengePressure(s, c).score;
        expect(p).toBeGreaterThanOrEqual(prev);
        prev = p;
      }
      // Both scores come with their reasons.
      expect(challengePressure(s, c).reasons.length).toBeGreaterThan(2);
    }
  });
});

describe('power: passed over', () => {
  it('creates a grievance for every man who wanted the post', () => {
    const s = newGame('passed');
    const ctx = newCtx(s);
    const soldiers = crew(s).filter((c) => c.rank === 'soldier');
    for (const c of soldiers) ensureAttrs(s, c).v.ambition = 90;
    const winner = soldiers[0];
    const wanted = wantersFor(s, `capo:${winner.id}`, winner.id);
    expect(wanted.length).toBeGreaterThan(0);
    const gs = passedOver(ctx, `capo:${winner.id}`, winner.id, { public: true });
    expect(gs.map((g) => g.charId).sort()).toEqual(wanted.map((c) => c.id).sort());
    for (const g of gs) expect(g.reasons.length).toBeGreaterThan(0);
    // Explaining privately produces lower resentment than a public announcement.
    const s2 = newGame('passed');
    for (const c of crew(s2).filter((c) => c.rank === 'soldier')) ensureAttrs(s2, c).v.ambition = 90;
    const priv = passedOver(newCtx(s2), `capo:${winner.id}`, winner.id, { public: false });
    expect(priv.reduce((a, g) => a + g.severity, 0)).toBeLessThanOrEqual(gs.reduce((a, g) => a + g.severity, 0));
  });
});

describe('power: sudden succession', () => {
  it('a crisis always resolves to a valid boss or to extinction', () => {
    for (const seed of ['crisis1', 'crisis2', 'crisis3', 'crisis4', 'crisis5']) {
      let s = newGame(seed);
      const ctx = newCtx(s);
      const rival = s.rivals.find((r) => r.kind === 'mob')!;
      pw(s);
      launchBlitz(ctx, rival.id, 'player', 70, true);
      // The boss is killed by the rival (through the single death function).
      applyEffects(ctx, [{ type: 'kill', charId: s.playerId, cause: 'shot outside the Hialeah Bar', killer: rival.id }], { label: 'test', because: 'test' });
      s.pendingEvents = [];
      s = play(s, 1);
      expect(pw(s).crisis ?? pw(s).crises.length).toBeTruthy();
      s = play(s, 20);
      expect(pw(s).crisis).toBeUndefined();
      if (!s.gameOver) expect(validatePlayer(s)).toEqual([]);
      expect(pw(s).stats.crises).toBeGreaterThan(0);
    }
  });
});

describe('power: blitz', () => {
  it('a blitz chain can be interrupted by a good move', () => {
    const s = newGame('blitz1');
    const ctx = newCtx(s);
    const rival = s.rivals.find((r) => r.kind === 'mob')!;
    const b = launchBlitz(ctx, rival.id, 'player', 40, false)!;
    expect(b.targets.length).toBeGreaterThan(2);
    // Two good moves in a row: the mattresses, then hide the next man and hold.
    applyPowerOp(ctx, { op: 'blitzMove', blitzId: b.id, move: 'mattresses' }, 'test');
    applyPowerOp(ctx, { op: 'blitzMove', blitzId: b.id, move: 'mattresses' }, 'test');
    applyPowerOp(ctx, { op: 'blitzMove', blitzId: b.id, move: 'mattresses' }, 'test');
    expect(b.stopped).toBeTruthy();
    expect(b.idx).toBeLessThan(b.targets.length);
  });

  it('a running blitz stops before the list is finished when it loses momentum', () => {
    const s = newGame('blitz2');
    const ctx = newCtx(s);
    const rival = s.rivals.find((r) => r.kind === 'mob')!;
    const b = launchBlitz(ctx, rival.id, 'player', 15, false)!;
    pw(s).mattresses = s.week;
    for (let i = 0; i < 10 && !b.stopped; i++) {
      s.week++;
      blitzStep(ctx, b);
    }
    expect(b.stopped).toBeTruthy();
    expect(reconcile({ start: { money: 0, respect: 0, heat: { local: 0, family: 0, federal: 0 } }, end: { money: 0, respect: 0, heat: { local: 0, family: 0, federal: 0 } }, lines: [] })).toEqual([]);
  });
});

describe('power: fall and rise', () => {
  it('a deposed boss keeps playing', () => {
    let s = newGame('fall1');
    const ctx = newCtx(s);
    const capo = crew(s).find((c) => c.rank === 'capo')!;
    const me = s.playerId;
    depose(ctx, capo.id, 'a test');
    expect(s.playerId).toBe(me);
    expect(pw(s).station).not.toBe('boss');
    expect(pw(s).overId).toBe(capo.id);
    s = play(s, 40);
    expect(s.gameOver).toBeUndefined();
    expect(validatePlayer(s)).toEqual([]);
    expect(validateHierarchy(s)).toEqual([]);
  });

  it('starts at any rung', () => {
    for (const st of ['associate', 'soldier', 'capo'] as const) {
      let s = newGameWith(`rung-${st}`, st);
      expect(pw(s).station).toBe(st);
      expect(s.characters[pw(s).overId!].alive).toBe(true);
      expect(validateHierarchy(s)).toEqual([]);
      s = play(s, 30);
      expect(validatePlayer(s)).toEqual([]);
      // The kick-up is a named ledger line.
      expect(s.lastReport!.lines.some((l) => /Kick-up to/.test(l.label)) || s.lastReport!.grossIncome === 0).toBe(true);
    }
  });
});

describe('power: the front boss', () => {
  it('an unaware puppet boss can discover the arrangement', () => {
    const s = newGame('front1');
    const ctx = newCtx(s);
    const capo = crew(s).find((c) => c.rank === 'capo')!;
    ensureAttrs(s, capo).v.awareness = 60;
    const f = installFront(ctx, capo, 'unaware');
    let ev;
    for (let i = 0; i < 40 && !ev; i++) ev = frontMonth(ctx);
    expect(f.discovered).toBeDefined();
    expect(ev?.defId).toBe('power_front');
    expect(f.reaction).toBeDefined();
  });
});

describe('power: the audience chamber', () => {
  it('a lying petitioner can be caught', () => {
    const s = newGame('liar');
    const ctx = newCtx(s);
    const [a, b] = crew(s).filter((c) => c.rank === 'soldier' || c.rank === 'capo');
    ensureAttrs(s, a).v.manipulation = 0;
    const cons = s.council.consigliere.holderId ? s.characters[s.council.consigliere.holderId] : player(s);
    ensureAttrs(s, cons).v.judgment = 100;
    ensureAttrs(s, cons).v.awareness = 100;
    ensureAttrs(s, player(s)).v.judgment = 100;
    ensureAttrs(s, player(s)).v.awareness = 100;
    const ev = buildAudience(s, { kind: 'dispute', petitioner: a, against: b, truthful: false, claim: 'a lie', title: 't', text: 't', forEffects: [], againstEffects: [], forLabel: 'f', againstLabel: 'a' });
    const rec = pw(s).petitions.at(-1)!;
    expect(investigateOdds(s, rec).chance).toBe(1);
    applyPowerOp(ctx, { op: 'petition', id: rec.id, ruling: 'investigate' }, 'test');
    expect(rec.status).toBe('caught');
    expect(pw(s).stats.liarsCaught).toBe(1);
    expect(s.eventQueue.some((e) => e.defId === 'aud_finding')).toBe(true);
    expect(ev.choices.map((c) => c.id)).toContain('investigate');
  });
});

describe('power: integration', () => {
  it('a long game with the power pillar stays consistent and round-trips JSON', () => {
    let s = newGame('power-long');
    s = play(s, 104);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    if (!s.gameOver) expect(validatePlayer(s)).toEqual([]);
    expect(Object.values(s.characters).filter((c) => c.attrs).length).toBeGreaterThan(5);
  });
});
