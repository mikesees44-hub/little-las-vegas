import { describe, expect, it } from 'vitest';
import { availableActions, previewAction } from '../src/engine/actions';
import { advanceWeek } from '../src/engine/engine';
import { reconcile } from '../src/engine/ledger';
import { newGame } from '../src/engine/newGame';
import { EXPOSE_AT } from '../src/engine/underbelly';
import type { GameState } from '../src/engine/types';

function arrive(seed: string): GameState {
  let s = newGame(seed);
  s = advanceWeek(s, {}).state;
  s.underbelly!.arrives = s.week;
  s = advanceWeek(s, {}).state;
  return s;
}

describe('the Underbelly', () => {
  it('waits, then arrives with a card; the player is never offered its rackets', () => {
    let s = newGame('ub1');
    s = advanceWeek(s, {}).state;
    expect(s.underbelly?.stage).toBe('waiting');
    s = arrive('ub1');
    expect(s.underbelly!.stage).toBe('active');
    expect(s.pendingEvents.some((e) => e.defId === 'underbelly_arrives')).toBe(true);
    // No order or business lets the player run it.
    const kinds = JSON.stringify(availableActions(s));
    expect(kinds).not.toMatch(/traffick|harbor_run|smuggle_people/i);
  });

  it('costs the boss named lines every week while it is here, and the books balance', () => {
    const s = arrive('ub2');
    const r = advanceWeek(s, {});
    expect(r.report.lines.some((l) => l.label.startsWith('The Underbelly: trade scared off'))).toBe(true);
    expect(reconcile(r.report)).toEqual([]);
  });

  it('investigate builds proof; exposing it at the threshold breaks it, with a front page', () => {
    let s = arrive('ub3');
    s.money = 50000;
    expect(previewAction(s, { kind: 'underbelly', op: 'expose' }).disabledReason).toMatch(/prove/);
    const inv = previewAction(s, { kind: 'underbelly', op: 'investigate' });
    expect(inv.effects.some((e) => e.label?.startsWith('The Underbelly'))).toBe(true);
    s = advanceWeek(s, { actions: [{ kind: 'underbelly', op: 'investigate' }] }).state;
    expect(s.underbelly!.exposure).toBeGreaterThan(0);
    s.underbelly!.exposure = EXPOSE_AT;
    s = advanceWeek(s, { actions: [{ kind: 'underbelly', op: 'expose' }] }).state;
    expect(s.underbelly!.stage).toBe('gone');
    expect(s.news.some((n) => n.kind === 'expose')).toBe(true);
  });

  it('running them off is a roll with reasons; allies make it likelier', () => {
    const s = arrive('ub4');
    s.money = 50000;
    const p = previewAction(s, { kind: 'underbelly', op: 'runout' });
    expect(p.acceptance!.reasons.some((r) => r.label === 'How dug-in they are')).toBe(true);
    const before = p.acceptance!.chance;
    s.underbelly!.ally = 'kessler';
    expect(previewAction(s, { kind: 'underbelly', op: 'runout' }).acceptance!.chance).toBeGreaterThan(before);
  });

  it('left alone it digs in and Philadelphia notices', () => {
    let s = arrive('ub5');
    s.underbelly!.strength = 99.5;
    const r = advanceWeek(s, {});
    s = r.state;
    expect(s.underbelly!.stage).toBe('entrenched');
    expect(r.report.lines.some((l) => l.stat === 'heat.family' && l.label.includes('entrenched'))).toBe(true);
  });
});
