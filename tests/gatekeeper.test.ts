import '../src/engine/engine';
import { describe, expect, it } from 'vitest';
import { newGameWith } from '../src/engine/starts';
import { newCtx } from '../src/engine/ledger';
import { holder } from '../src/engine/council';
import { capos, crew } from '../src/engine/characters';
import { ensureThreats, foilOdds, seedThreat, stampWhen, tipOut, type Threat, type Tip } from '../src/engine/threats';
import { allRequests, audienceRequests, gatekeeper } from '../src/engine/planner/audience';
import { cancelEntry, dayEntries } from '../src/engine/planner/datebook';
import { tipConfidence } from '../src/engine/planner/intel';
import { armedTurn, gateHolder, slantOf, turnOf } from '../src/engine/planner/gateCore';
import { decideGate, gateCase, readFullList, setGateRole } from '../src/engine/planner/gate';
import { gateWeek } from '../src/engine/planner/gateWeek';
import { readOf } from '../src/engine/peopleRead';
import type { GameState, RivalId } from '../src/engine/types';

function game(seed = 'gate1'): GameState {
  const s = newGameWith(seed, 'olddon');
  s.pendingEvents = [];
  s.eventQueue = [];
  return s;
}

function mob(s: GameState): RivalId {
  return s.rivals.find((r) => r.kind === 'mob')!.id;
}

/** The consigliere, bought by a rival family (the game's own "turned": informantFor), sharp, and the boss not. */
function turned(s: GameState): { s: GameState; id: string; rival: RivalId } {
  const c = holder(s, 'consigliere')!;
  const rival = mob(s);
  c.informantFor = rival;
  c.attributes.intrigue = 95;
  s.characters[s.playerId].attributes.intrigue = 15;
  return { s, id: c.id, rival };
}

/** A warning from one of the boss's men about a hit on the boss by `rival`, asked for next week. */
function warning(s: GameState, rival: RivalId, src: string): Tip {
  const t = seedThreat(s, { kind: 'hit', by: rival, targetId: s.playerId, due: s.week + 2 }, { kind: 'hit', by: rival, targetId: s.playerId }, src, 'solid', s.week + 2)!;
  t.rel = { w: s.week + 1, d: 1 };
  return t;
}

function sources(s: GameState): string[] {
  const g = gatekeeper(s).id;
  return crew(s).filter((c) => c.alive && c.id !== g && c.id !== s.playerId && !c.dynasty).map((c) => c.id);
}

describe('the gatekeeper', () => {
  it('a loyal consigliere keeps the door as before: same list, no held men, no slant, and his week changes nothing', () => {
    const s = game();
    const g = gatekeeper(s);
    expect(g.role).toBe('consigliere');
    expect(g.chosen).toBe('consigliere');
    expect(turnOf(s, g.id)).toBeUndefined();
    expect(armedTurn(s)).toBeUndefined();
    const reqs = audienceRequests(s);
    expect(reqs.map((r) => r.key)).toEqual(allRequests(s).map((r) => r.key));
    expect(reqs.some((r) => r.held || r.bias.some((b) => b.kind === 'stall' || b.kind === 'push'))).toBe(false);
    const src = sources(s)[0];
    const t = warning(s, mob(s), src);
    expect(slantOf(s, t)).toBeUndefined();
    const before = JSON.stringify(s);
    gateWeek(newCtx(s));
    expect(JSON.stringify(s)).toBe(before);
  });

  it('a turned consigliere is read off the real state (informantFor), and buries a real warning about a hit on the boss', () => {
    const { s, id, rival } = turned(game('gate2'));
    expect(turnOf(s, id)?.why).toBe('rival');
    expect(armedTurn(s)?.c.id).toBe(id);
    const srcs = sources(s);
    const tips = srcs.slice(0, 8).map((x) => warning(s, rival, x));
    gateWeek(newCtx(s));
    const held = tips.filter((t) => t.held === id);
    expect(held.length).toBeGreaterThan(0);
    // Out on the clock next week, a held warning still never reaches the boss (no popup, no brief, no list).
    s.week += 1;
    for (const t of held) {
      expect(tipOut(s, t)).toBe(false);
      expect(audienceRequests(s).some((r) => r.key === `tip:${t.id}`)).toBe(false);
      expect(allRequests(s).find((r) => r.key === `tip:${t.id}`)?.held).toBe(id);
    }
  });

  it('a turned consigliere books the boss into a setup at a planned hit: the threat gets harder to stop; cancelling it takes that back', () => {
    const { s, id, rival } = turned(game('gate3'));
    const T = ensureThreats(s);
    let th: Threat | undefined;
    for (let i = 0; i < 12 && !th; i++) {
      const t: Threat = { id: `thx${i}`, kind: 'hit', by: rival, targetId: s.playerId, start: s.week, due: s.week + 1, blunt: 0.5 };
      stampWhen(s, t);
      T.threats.push(t);
      gateWeek(newCtx(s));
      if (t.gk) th = t;
    }
    expect(th, 'a setup was booked').toBeTruthy();
    expect(th!.gk).toBe(id);
    const item = s.action!.sched!.find((it) => it.payload.su === th!.id)!;
    expect(item.payload.by).toBe(id);
    expect(item.w).toBe(th!.due);
    expect(item.d).toBe(th!.dueDay);
    const withSetup = foilOdds(s, th!);
    const without = foilOdds(s, { ...th!, gk: undefined });
    expect(withSetup).toBeLessThan(without);
    // On the datebook, booked by him; the boss calls it off and the setup is off.
    s.week = th!.due;
    const e = dayEntries(s, th!.due, th!.dueDay!).find((x) => x.sid === item.id)!;
    expect(e.by).toBe(gatekeeper(s).name);
    const x = cancelEntry(s, e);
    expect(x.threats!.threats.find((t) => t.id === th!.id)!.gk).toBeUndefined();
  });

  it('slants the brief: a real warning against the boss comes in no better than a rumor', () => {
    const { s, rival } = turned(game('gate4'));
    const tips = sources(s).slice(0, 10).map((x) => { const t = warning(s, rival, x); delete t.rel; return t; });
    const down = tips.filter((t) => slantOf(s, t) === 'down');
    expect(down.length).toBeGreaterThan(0);
    for (const t of down) expect(tipConfidence(s, t).conf).toBe('rumor');
  });

  it('tells raise the boss\'s suspicion of him in the people ledger: the man who was never seen complains', () => {
    const { s, id, rival } = turned(game('gate5'));
    const tips = sources(s).slice(0, 10).map((x) => warning(s, rival, x));
    gateWeek(newCtx(s));
    const held = tips.filter((t) => t.held === id);
    expect(held.length).toBeGreaterThan(1);
    expect(readOf(s, id)?.f ?? 0).toBe(0);
    // The week the warnings were about has come and gone.
    for (const t of held) t.status = 'missed';
    gateWeek(newCtx(s));
    expect(readOf(s, id)!.f).toBeGreaterThan(0);
    expect(s.planner!.tl!.some((x) => /asked all week to see you/.test(x.t))).toBe(true);
  });

  it('reading the full list (an hour) brings out the held-back requests and can find him out', () => {
    const { s, id, rival } = turned(game('gate6'));
    const tips = sources(s).slice(0, 8).map((x) => { const t = warning(s, rival, x); delete t.rel; return t; });
    gateWeek(newCtx(s));
    const held = tips.filter((t) => t.held === id);
    expect(held.length).toBeGreaterThan(0);
    const hoursBefore = s.hours?.used ?? 0;
    const r = readFullList(s);
    expect(r.result.ok).toBe(true);
    const x = r.state;
    expect((x.hours?.used ?? 0)).toBeGreaterThan(hoursBefore);
    for (const t of held) {
      const now = x.threats!.tips.find((q) => q.id === t.id)!;
      expect(now.held).toBeUndefined();
      expect(tipOut(x, now)).toBe(true);
      expect(audienceRequests(x).some((q) => q.key === `tip:${t.id}`)).toBe(true);
    }
    // Found out, or at least suspected.
    expect(!!x.planner!.gx || (readOf(x, id)?.f ?? 0) > 0).toBe(true);
    // The input is untouched (pure).
    expect(s.threats!.tips.find((q) => q.id === held[0].id)!.held).toBe(id);
    expect(readFullList(x).result.ok).toBe(false);
  });

  it('the door can go to the underboss or the wife; the new keeper lets in what the old one held', () => {
    const { s, id, rival } = turned(game('gate7'));
    const tips = sources(s).slice(0, 8).map((x) => warning(s, rival, x));
    gateWeek(newCtx(s));
    expect(tips.some((t) => t.held === id)).toBe(true);
    const x = setGateRole(s, 'underboss');
    expect(gatekeeper(x).role).toBe('underboss');
    expect(gateHolder(x)!.c.id).toBe(holder(x, 'underboss')!.id);
    expect(x.threats!.tips.some((t) => t.held === id)).toBe(false);
    expect(readOf(x, id)!.f).toBeGreaterThan(0);
    const back = setGateRole(x, 'consigliere');
    expect(back.planner!.gk).toBeUndefined();
  });

  it('found out: a decision card with odds; clipping takes a second word', () => {
    const { s, id } = turned(game('gate8'));
    const P = (s.planner ??= { v: 1, done: [], notes: {}, refused: {}, lastRefused: {}, turned: {}, auto: true });
    P.gx = { id, w: s.week, why: turnOf(s, id)!.text };
    const cs = gateCase(s)!;
    expect(cs.choices.map((c) => c.id)).toEqual(['confront', 'feed', 'freeze', 'clip']);
    for (const c of cs.choices) { expect(c.odds).toBeGreaterThan(0); expect(c.effects.length).toBeGreaterThan(0); }
    expect(decideGate(s, 'clip').result.ok).toBe(false);
    const fr = decideGate(s, 'freeze');
    expect(fr.result.ok).toBe(true);
    expect(gateHolder(fr.state)!.c.id).not.toBe(id);
    expect(fr.state.journal!.e.some((e) => /Freeze him out/.test(e.t))).toBe(true);
    const fd = decideGate(s, 'feed');
    expect(armedTurn(fd.state)).toBeUndefined();
    void capos;
  });
});
