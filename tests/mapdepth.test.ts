import { describe, expect, it } from 'vitest';
import { previewAction } from '../src/engine/actions';
import { jobsForPlace, previewDirty } from '../src/engine/dirtyWork';
import { newGame } from '../src/engine/newGame';
import { isOperating, placeAction, placeActions, placeCondition, placeOwnerLabel, placeRunByLabel } from '../src/engine/placeEligibility';
import type { Lot } from '../src/engine/econState';
import type { GameState } from '../src/engine/types';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

function closePlace(s: GameState, pred: (l: Lot) => boolean): Lot {
  const l = s.econ!.lots.find((x) => pred(x) && isOperating(x) && x.owner === 'private' && x.status === 'private')!;
  delete l.tenant; // the owner closed up: the building stands, nobody runs it
  return l;
}

describe('map depth 1: a place offers only what fits its condition', () => {
  const base = newGame('mapdepth-elig');

  it('a closed pizza parlor (nobody running it) is not shaken down, robbed or bought as a going concern', () => {
    const s = clone(base);
    const l = closePlace(s, (x) => x.use === 'pizza');
    expect(placeCondition(l)).toBe('closed');
    expect(placeRunByLabel(s, l)).toMatch(/closed/);
    // The quick jobs: no shakedown aimed at a shop that is not open.
    expect(jobsForPlace(s, l).map((j) => j.job)).not.toContain('shakedown');
    // The verb stays on the card, greyed, with the reason.
    expect(placeAction(s, l, 'shakedown')?.why).toMatch(/closed/i);
    expect(placeAction(s, l, 'buyBusiness')?.why).toMatch(/closed|nobody/i);
    // And the engine refuses it from any entry point (a queued order aimed at it).
    const p = previewDirty(s, { job: 'shakedown', who: s.playerId, target: l.id });
    expect(p.disabledReason).toBeTruthy();
    l.status = 'sale';
    expect(previewAction(s, { kind: 'econ', op: { type: 'buyLot', lotId: l.id, going: true } }).disabledReason).toMatch(/No business inside/);
    expect(previewAction(s, { kind: 'econ', op: { type: 'buyLot', lotId: l.id } }).disabledReason).toBeUndefined();
  });

  it('the same pizza parlor, open, offers the shakedown', () => {
    const s = clone(base);
    const l = s.econ!.lots.find((x) => x.use === 'pizza' && isOperating(x) && x.owner === 'private' && x.status === 'private')!;
    expect(jobsForPlace(s, l).map((j) => j.job)).toContain('shakedown');
    expect(placeAction(s, l, 'shakedown')?.why).toBeUndefined();
  });

  it('a rival place that closed can be run off but has no back-room game to rob', () => {
    const s = clone(base);
    const l = s.econ!.lots.find((x) => x.status === 'rival' && isOperating(x) && !/avalon|chapel/i.test(`${x.name} ${x.address}`))!;
    expect(jobsForPlace(s, l).map((j) => j.job)).toEqual(['runoff', 'cardgame']);
    delete l.tenant;
    expect(placeCondition(l)).toBe('closed');
    expect(jobsForPlace(s, l).map((j) => j.job)).toEqual(['runoff']);
    expect(placeAction(s, l, 'cardgame')?.why).toMatch(/closed/i);
  });

  it('every card verb agrees with the record, for every property on the island', () => {
    const s = clone(base);
    // Close a few, empty a few, put one up for rent: every condition is represented.
    closePlace(s, (x) => x.zone === 'boardwalk');
    closePlace(s, (x) => x.zone === 'pacific');
    for (const l of s.econ!.lots) {
      const c = placeCondition(l);
      const acts = placeActions(s, l);
      const jobs = jobsForPlace(s, l).map((j) => j.job);
      const ok = (id: string) => acts.some((a) => a.id === id && !a.why);
      // A job button appears exactly when the central check says the verb fits.
      expect(jobs.includes('shakedown'), l.id).toBe(ok('shakedown') && !/avalon|chapel/i.test(`${l.name} ${l.address} ${l.tenant ?? ''}`));
      expect(jobs.includes('cardgame'), l.id).toBe(ok('cardgame'));
      if (c !== 'operating') {
        expect(ok('shakedown'), l.id).toBe(false);
        expect(ok('cardgame'), l.id).toBe(false);
        expect(ok('buyBusiness'), l.id).toBe(false);
        expect(ok('inside'), l.id).toBe(false);
      }
      expect(placeOwnerLabel(s, l).length).toBeGreaterThan(0);
    }
  });
});
