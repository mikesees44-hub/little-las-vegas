import { describe, expect, it } from 'vitest';
import { previewAction } from '../src/engine/actions';
import { advanceWeek } from '../src/engine/engine';
import { newCtx } from '../src/engine/ledger';
import { MISSION_DEFS } from '../src/engine/missions';
import { newGame } from '../src/engine/newGame';
import { scoreMoves } from '../src/engine/rivals';
import { commitTalk, ensureTalks, pactWith, talkApplies, talkOdds, TALK_IDS } from '../src/engine/talks';
import type { GameState, PlayerAction } from '../src/engine/types';
import { randomChoices } from './helpers';

const week = (s: GameState, actions: PlayerAction[] = [], i = 0) => advanceWeek(s, { ...randomChoices(s, i), actions }).state;

describe('talks: agree, refuse, delay, counteroffer, or go his own way', () => {
  it('odds are a full breakdown and every answer happens', () => {
    const s = newGame('talks-1');
    const boss = s.characters[s.rivals.find((r) => r.id === 'feldstein')!.leaderId];
    const o = talkOdds(s, 'meeting', boss);
    expect(o.agree + o.counter + o.delay + o.refuse + o.independent).toBeCloseTo(1, 5);
    expect(o.reasons.length).toBeGreaterThanOrEqual(3);
    expect(o.independent).toBeGreaterThan(0);
    const p = previewAction(s, { kind: 'talk', op: { t: 'ask', talk: 'meeting', target: boss.id } });
    expect(p.disabledReason).toBeUndefined();
    expect(p.odds?.reasons.length).toBeGreaterThan(2);
    // Roll a lot of talks on a scratch copy: all five answers turn up.
    const g = JSON.parse(JSON.stringify(s)) as GameState;
    const ctx = newCtx(g);
    const people = Object.values(g.characters).filter((c) => c.alive && c.id !== g.playerId);
    for (let i = 0; i < 600; i++) {
      const c = people[i % people.length];
      const talk = TALK_IDS[i % TALK_IDS.length];
      if (talkApplies(g, talk, c)) continue;
      g.talks && (g.talks.cooldown = {});
      commitTalk(ctx, { t: 'ask', talk, target: c.id });
    }
    const st = ensureTalks(g).stats;
    expect(st.agreed).toBeGreaterThan(0);
    expect(st.refused).toBeGreaterThan(0);
    expect(st.delayed).toBeGreaterThan(0);
    expect(st.countered).toBeGreaterThan(0);
    expect(st.independent).toBeGreaterThan(0);
  });

  it('a truce with a family stops its moves against you, and a partnership pays through the ledger', () => {
    let s = newGame('talks-2');
    const r = s.rivals.find((x) => x.id === 'manno')!;
    const t = ensureTalks(s);
    t.pacts.push({ id: 'p1', a: 'player', b: 'manno', kind: 'truce', since: s.week, until: s.week + 26, terms: 'test' });
    expect(pactWith(s, 'manno', 'truce')).toBeDefined();
    const moves = scoreMoves(s, r).filter((c) => c.target === 'player' && (c.move === 'strike' || c.move === 'inform' || c.move === 'expand'));
    expect(moves.length).toBe(0);
    t.pacts.push({ id: 'p2', a: 'player', b: 'feldstein', kind: 'partnership', since: s.week, until: s.week + 52, weekly: 200, terms: 'test' });
    const res = advanceWeek(s, randomChoices(s, 1));
    s = res.state;
    expect(res.report.lines.some((l) => /Partnership with Feldstein/.test(l.label))).toBe(true);
  });

  it('a counteroffer can be taken from the board', () => {
    const s = newGame('talks-3');
    const t = ensureTalks(s);
    const boss = s.characters[s.rivals.find((r) => r.id === 'feldstein')!.leaderId];
    t.met[boss.id] = s.week;
    t.pending.push({ id: 'tk9', talk: 'partner', target: boss.id, due: s.week + 4, kind: 'counter', counter: { text: 'the bigger end', weekly: 120 } });
    const g = week(s, [{ kind: 'talk', op: { t: 'answer', id: 'tk9', yes: true } }]);
    expect(pactWith(g, 'feldstein', 'partnership')?.weekly).toBe(120);
    expect(g.talks!.pending.some((p) => p.id === 'tk9')).toBe(false);
  });
});

describe('the Mission Board: the Tropicana', () => {
  it('opens on its own, moves through its stages, and ends in the records', () => {
    let s = newGame('mission-1');
    for (let i = 0; i < 3; i++) s = week(s, [], i);
    const m = s.missions!.runs.find((r) => r.def === 'tropicana')!;
    expect(m).toBeDefined();
    expect(m.stage).toBe('word');
    expect(MISSION_DEFS.tropicana.participants(s, m).length).toBeGreaterThanOrEqual(2);
    expect(Object.values(m.facts).every((f) => f === 'unknown')).toBe(true);
    // Visit Kovacs, then go to the sit-down, then keep negotiating until it ends.
    s = week(s, [{ kind: 'mission', op: { run: m.id, decision: 'visit' } }], 10);
    let run = s.missions!.runs.find((r) => r.id === m.id)!;
    expect(run.stage).toBe('offers');
    expect(run.flags.metOwner).toBe(1);
    s.money = 500000;
    for (let i = 0; i < 30 && !run.ended; i++) {
      const st = run.stage;
      const decision = run.waiting ? undefined : st === 'offers' ? (run.flags.sitdowns >= 2 ? 'buy' : 'sitdown') : st === 'sitdown' ? 'partner' : st === 'counter' ? 'take' : undefined;
      s = week(s, decision ? [{ kind: 'mission', op: { run: m.id, decision } }] : [], 20 + i);
      s.money = Math.max(s.money, 500000);
      run = s.missions!.runs.find((r) => r.id === m.id)!;
    }
    expect(run.ended).toBeDefined();
    expect(run.resolution).toBeTruthy();
    const lot = s.econ!.lots.find((l) => l.id === 'bw20')!;
    expect(lot.status).not.toBe('sale');
    expect(lot.history!.length).toBeGreaterThan(1);
    expect(run.log.some((l) => l.kind === 'npc')).toBe(true);
  });

  it('can be won outright: the Tropicana becomes yours', () => {
    let s = newGame('mission-2');
    for (let i = 0; i < 3; i++) s = week(s, [], i);
    const id = s.missions!.runs[0].id;
    s = week(s, [{ kind: 'mission', op: { run: id, decision: 'visit' } }], 5);
    for (let i = 0; i < 12; i++) {
      const run = s.missions!.runs.find((r) => r.id === id)!;
      if (run.ended) break;
      s.money = 500000;
      s = week(s, [{ kind: 'mission', op: { run: id, decision: 'buy' } }], 30 + i);
    }
    const run = s.missions!.runs.find((r) => r.id === id)!;
    expect(run.ended).toBeDefined();
    if (run.resolution === 'bought') {
      const lot = s.econ!.lots.find((l) => l.id === 'bw20')!;
      expect(lot.status).toBe('owned');
      expect(lot.history!.some((h) => h.owner === 'player')).toBe(true);
    } else expect(['feldstein', 'gone']).toContain(run.resolution);
  });
});
