import '../src/engine/engine';
import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/newGame';
import { advanceWeek } from '../src/engine/engine';
import { reconcile } from '../src/engine/ledger';
import { previewAction } from '../src/engine/actions';
import { askForPlace, ensureEat, hows } from '../src/engine/eat';
import { lapsesThisWeek, readyReview } from '../src/engine/desk';
import type { GameState, PlayerAction } from '../src/engine/types';

const made = (s: GameState) => Object.values(s.characters).find((c) => c.alive && c.faction === 'player' && c.rank === 'soldier')!;
const roomy = (s: GameState) => { for (const d of s.districts) d.influence.player = 80; };

describe('a made man asks for a place', () => {
  it('Discuss business with your own made man: he asks for a place, and backing it opens it with him on it', () => {
    let s = advanceWeek(newGame('place-1'), {}).state;
    s.money = 60000; roomy(s);
    const m = made(s);
    ensureEat(s).pitches = [];
    const p = askForPlace(s, m)!;
    expect(p?.kind).toBe('place');
    expect(hows(p)).toEqual(['back', 'piece', 'no']);
    const a: PlayerAction = { kind: 'mymen', op: { op: 'pitch', pitch: p.id, how: 'back' } };
    const pv = previewAction(s, a);
    expect(pv.disabledReason).toBeUndefined();
    expect(pv.cost).toBe(p.stake);
    const before = s.businesses.filter((b) => b.owner === 'player').length;
    const r = advanceWeek(s, { actions: [a] });
    s = r.state;
    expect(reconcile(r.report)).toEqual([]);
    const mine = s.businesses.filter((b) => b.owner === 'player');
    expect(mine.length).toBe(before + 1);
    expect(mine.some((b) => (b.staffIds ?? []).includes(m.id) && b.boughtWeek === s.week - 1 || (b.staffIds ?? []).includes(m.id))).toBe(true);
    expect(s.journal!.e.some((x) => x.src === 'eat' && /opened|halves/i.test(x.t))).toBe(true);
  });
  it('no room in town: he has nothing to ask for', () => {
    const s = newGame('place-2');
    for (const d of s.districts) d.influence.player = 0;
    expect(askForPlace(s, made(s))).toBeUndefined();
  });
});

describe('what lapses if you skip the week', () => {
  it('a pitch due now is flagged before advancing, and readyReview is not clear', () => {
    const s = advanceWeek(newGame('lapse-1'), {}).state;
    const m = made(s);
    const e = ensureEat(s);
    e.pitches = [{ id: 'pi77', by: m.id, kind: 'score', what: 'a truckload of cigarettes', text: '"x"', stake: 500, ret: 0.5, week: s.week - 3, due: s.week + 1 }];
    const l = lapsesThisWeek(s);
    expect(l.some((x) => x.key === 'pitch:pi77')).toBe(true);
    expect(readyReview(s, { answers: {}, orders: [], briefSkip: [], taken: [] } as never).clear).toBe(false);
    e.pitches[0].due = s.week + 3;
    expect(lapsesThisWeek(s).some((x) => x.key === 'pitch:pi77')).toBe(false);
  });
});
