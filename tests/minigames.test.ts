import { describe, expect, it } from 'vitest';
import { advanceWeek } from '../src/engine/engine';
import { reconcile } from '../src/engine/ledger';
import { attachMinigames, playSession, randomMoves, type MgSession, type MinigameId } from '../src/engine/minigames';
import { newGame } from '../src/engine/newGame';
import { bestHand, buildCardGame, cardPlayers, type CardsData } from '../src/engine/minigameCards';
import { buildElectionNight } from '../src/engine/minigameElection';
import { buildSweepEvent, type SweepData } from '../src/engine/minigameSweep';
import type { HeistData } from '../src/engine/minigameHeist';
import { crew } from '../src/engine/characters';
import type { GameState } from '../src/engine/types';

function game(seed: string): GameState {
  let s = newGame(seed);
  s = advanceWeek(s, {}).state;
  s.money = 30000;
  return s;
}

describe('mini-games', () => {
  it('seven-card stud ranks hands correctly', () => {
    const c = (r: string, su: number) => '23456789TJQKA'.indexOf(r) + 13 * su;
    const flush = bestHand([c('2', 1), c('7', 1), c('9', 1), c('J', 1), c('K', 1), c('A', 0), c('A', 2)]);
    const pair = bestHand([c('A', 0), c('A', 2), c('3', 1), c('8', 2), c('T', 3), c('J', 0), c('4', 1)]);
    const wheel = bestHand([c('A', 0), c('2', 1), c('3', 2), c('4', 3), c('5', 0), c('9', 1), c('K', 2)]);
    expect(flush.name).toBe('A flush');
    expect(pair.name).toBe('A pair');
    expect(wheel.name).toBe('A straight');
    expect(flush.score).toBeGreaterThan(wheel.score);
    expect(wheel.score).toBeGreaterThan(pair.score);
  });

  it('every mini-game is deterministic and finishes under random play and when let play out', () => {
    const s = game('mgdet');
    const players = cardPlayers(s);
    const loan = { id: 'l1', borrower: 'Sal Romano, a bar owner on New Jersey Ave', principal: 2500, vig: 125, risk: 0.02, weeksLate: 3, dueWeek: 1, week: 1 };
    s.loans.push(loan);
    const agents = crew(s).slice(0, 3).map((c) => c.id).join(',');
    const cases: [MinigameId, Record<string, string | number>][] = [
      ['cards', { players: players.map((p) => p.id).join(',') }],
      ['sitdown', { kind: 'deal', other: s.rivals[0].leaderId }],
      ['collection', { loan: 'l1' }],
      ['heist', { heist: 'armored', odds: 0.5, agents }],
      ['sweep', { boss: s.playerId }],
      ['election', { race: 'Wildwood City Commission', ours: 'Doyle', theirs: 'Hartman', share: 52 }],
      ['madeboss', { variant: 'classic' }],
    ];
    for (const [g, params] of cases) {
      for (let i = 0; i < 20; i++) {
        const moves = randomMoves(s, g, `r${i}`, params, { accept: [{ type: 'money', amount: 3000 }], refuse: [{ type: 'respect', amount: 1 }], win: [{ type: 'respect', amount: 2 }], lose: [] }, { rng: i + 1 });
        const a = playSession(s, g, `r${i}`, params, {}, moves);
        const b = playSession(s, g, `r${i}`, params, {}, moves);
        expect(a.done, g).toBe(true);
        expect(JSON.stringify(a.outcome)).toEqual(JSON.stringify(b.outcome));
        expect(playSession(s, g, `a${i}`, params).done).toBe(true);
      }
    }
  });

  it('letting a heist play out succeeds about as often as the planner promised', () => {
    const s = game('heist');
    const agents = crew(s).slice(0, 3).map((c) => c.id).join(',');
    for (const odds of [0.3, 0.6, 0.85]) {
      let ok = 0;
      const N = 800;
      for (let i = 0; i < N; i++) if (!(playSession(s, 'heist', `h${i}`, { heist: 'jewelry', odds, agents }) as MgSession<HeistData>).d.failed) ok++;
      expect(Math.abs(ok / N - odds), `odds ${odds}: ${ok / N}`).toBeLessThan(0.08);
    }
  });

  it('the card game moves money and opinion through the ledger', () => {
    let s = game('cards');
    const ev = buildCardGame(s);
    expect(ev).toBeTruthy();
    s.pendingEvents = [ev!];
    const p = (ev!.choices[0].effects[0] as unknown as { params: Record<string, string | number> }).params;
    const moves = randomMoves(s, 'cards', ev!.iid, p, undefined, { rng: 9 });
    const ses = playSession(s, 'cards', ev!.iid, p, {}, moves) as MgSession<CardsData>;
    const r = advanceWeek(s, { choices: { [ev!.iid]: 'sit' }, minigames: { [ev!.iid]: moves } });
    expect(reconcile(r.report)).toEqual([]);
    const net = r.report.lines.filter((l) => l.label.startsWith('The card game') && l.stat === 'money').reduce((a, l) => a + l.amount, 0);
    expect(net).toBe(ses.d.me.net);
    s = r.state;
  });

  it('a Table hearing and a rival proposition get a sit-down; a default gets a collection round', () => {
    const s = game('attach');
    const loan = { id: 'l9', borrower: 'Joe Pinto, a trucker with a gambling problem', principal: 1000, vig: 50, risk: 0.02, weeksLate: 3, dueWeek: 1, week: 1 };
    s.loans.push(loan);
    s.pendingEvents = [
      { iid: 'e1', defId: 'deal_manno', week: s.week, mandatory: false, priority: 40, title: '', text: '', defaultChoiceId: 'refuse', actors: [s.rivals[0].leaderId], choices: [{ id: 'accept', label: '', because: 'x', effects: [{ type: 'money', amount: 4000 }] }, { id: 'refuse', label: '', because: 'y', effects: [{ type: 'respect', amount: 1 }] }] },
      { iid: 'e2', defId: 'borrower_default', week: s.week, mandatory: false, priority: 45, title: '', text: '', defaultChoiceId: 'lean', meta: { loan: 'l9' }, choices: [{ id: 'lean', label: '', because: 'z', effects: [] }] },
    ];
    attachMinigames(s);
    expect(s.pendingEvents[0].choices[0].id).toBe('negotiate');
    expect(s.pendingEvents[1].choices[0].id).toBe('round');
    const r = advanceWeek(s, { choices: { e1: 'negotiate', e2: 'round' } });
    expect(reconcile(r.report)).toEqual([]);
    expect(r.state.loans.some((l) => l.id === 'l9')).toBe(false);
  });

  it('the sweep finds the economy branch\'s bug, and election night is a screen other branches can call', () => {
    const s = game('sweep');
    if (s.econ) s.econ.hq.bug = { week: 1, source: 'warrant', leaked: 0 };
    let found = 0;
    for (let i = 0; i < 200; i++) if ((playSession(s, 'sweep', `w${i}`, { boss: s.playerId }) as MgSession<SweepData>).d.found) found++;
    expect(found / 200).toBeGreaterThan(0.3);
    const ev = buildSweepEvent(s);
    s.pendingEvents = [ev];
    const r = advanceWeek(s, { choices: { [ev.iid]: 'quick' } });
    expect(reconcile(r.report)).toEqual([]);
    const el = buildElectionNight(s, { race: 'Mayor of Wildwood', ours: 'Doyle', theirs: 'Hartman', share: 55, win: [{ type: 'favor', amount: 1 }] });
    expect(el.choices[0].effects[0].type).toBe('minigame');
  });
});
