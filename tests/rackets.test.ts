import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/newGame';
import { advanceWeek } from '../src/engine/engine';
import { previewAction } from '../src/engine/actions';
import { CATALOG, SHOP_KINDS } from '../src/engine/catalog';
import { expectedTake, newBusiness, owned } from '../src/engine/business';
import { RACKETS } from '../src/engine/racketData';
import { buildSitEvent, dialOf, dialsOf, migrateVice, openSits, racketActions, startLocks, sitCtx } from '../src/engine/racketLife';
import { hubCards, whichRacket } from '../src/engine/racketHub';
import { racketMut } from '../src/engine/rackets';
import { describeEffect } from '../src/engine/effects';
import { upgradeSave } from '../src/engine/upgradeSave';
import { allFamilies } from '../src/engine/sceneVariants';
import { reconcile } from '../src/engine/ledger';
import type { BusinessKind, GameState, PlayerAction } from '../src/engine/types';

function rich(seed = 'rk'): GameState {
  const s = newGame(seed);
  s.money = 80000;
  s.respect = 70;
  return s;
}
const START = (kind: BusinessKind): PlayerAction => ({ kind: 'econ', op: { type: 'racket', cmd: { c: 'start', kind } } });

describe('the living rackets', () => {
  it('every racket has a line, dials or situations, and each situation is told at least two ways', () => {
    for (const [kind, info] of Object.entries(RACKETS)) {
      expect(info!.line.length, kind).toBeGreaterThan(20);
      expect(info!.dials.length + info!.sits.length, kind).toBeGreaterThan(0);
      for (const st of info!.sits) expect(st.scenes.length, `${kind}/${st.id}`).toBeGreaterThanOrEqual(2);
      for (const d of info!.dials) expect(d.opts.some((o) => o.id === d.def), `${kind}/${d.id}`).toBe(true);
    }
  });

  it('the call service is gone from the shop and old saves become the Madam\'s arrangement', () => {
    expect(SHOP_KINDS).not.toContain('vice');
    const s = rich();
    upgradeSave(s);
    const cut0 = s.ears!.madam.cut;
    const b = newBusiness(s, 'vice', 'pacific');
    b.id = 'bvice';
    s.businesses.push(b);
    const m0 = s.money;
    migrateVice(s);
    expect(s.businesses.some((x) => x.kind === 'vice' && x.owner === 'player')).toBe(false);
    expect(s.ears!.madam.cut).toBeGreaterThan(cut0);
    expect(s.money).toBe(m0 + CATALOG.vice.cost / 2);
    // Inside a week the migration posts through the ledger (the week reconciles).
    const s2 = rich('rk2');
    upgradeSave(s2);
    const b2 = newBusiness(s2, 'vice', 'pacific');
    b2.id = 'bvice2';
    s2.businesses.push(b2);
    const r = advanceWeek(s2, { choices: {}, actions: [] });
    expect(r.state.businesses.some((x) => x.kind === 'vice' && x.owner === 'player')).toBe(false);
    expect(r.report.lines.some((l) => /Madam's thanks/.test(l.label))).toBe(true);
  });

  it('Start it picks a district and the best-fit man, and locked rackets say how to unlock', () => {
    const s = rich();
    const p = previewAction(s, START('numbers'));
    expect(p.disabledReason).toBeUndefined();
    const r = advanceWeek(s, { choices: {}, actions: [START('numbers')] }).state;
    const nb = owned(r).filter((b) => b.kind === 'numbers');
    expect(nb.length).toBe(owned(s).filter((b) => b.kind === 'numbers').length + 1);
    expect(nb[nb.length - 1].staffIds?.length).toBeGreaterThan(0);
    const poor = newGame('rk3');
    poor.money = 100;
    const locks = startLocks(poor, 'labor');
    expect(locks.length).toBeGreaterThan(0);
    for (const l of locks) expect(l.how.length).toBeGreaterThan(5);
  });

  it('a dial changes the take and the heat, and shows its effect as a chip', () => {
    const s = rich();
    upgradeSave(s);
    const b = owned(s).find((x) => x.kind === 'numbers')!;
    racketMut(s, b);
    const before = expectedTake(s, b);
    const act: PlayerAction = { kind: 'econ', op: { type: 'racket', cmd: { c: 'dial', bizId: b.id, dial: 'reserve', opt: 'thin' } } };
    const p = previewAction(s, act);
    expect(p.effects.map((e) => describeEffect(s, e)).join(' ')).toMatch(/take \+8%/);
    const r = advanceWeek(s, { choices: {}, actions: [act] }).state;
    const b2 = r.businesses.find((x) => x.id === b.id)!;
    expect(dialOf(r, b2, 'reserve')).toBe('thin');
    // Same week-of-year comparison is not possible, so check the multiplier directly.
    r.date = s.date;
    expect(expectedTake(r, b2)).toBeGreaterThanOrEqual(Math.round(before * 1.05) - 1);
    const pad: PlayerAction = { kind: 'econ', op: { type: 'racket', cmd: { c: 'dial', bizId: b.id, dial: 'pad', opt: 'captain' } } };
    const r2 = advanceWeek(r, { choices: {}, actions: [pad] });
    expect(r2.state.businesses.find((x) => x.id === b.id)!.heat).toBeLessThan(b.heat);
    const r3 = advanceWeek(r2.state, { choices: {}, actions: [] });
    expect(r3.report.lines.some((l) => /The pad: the captain himself/.test(l.label))).toBe(true);
  });

  it('situations show odds as chips, resolve through the ledger and reconcile', () => {
    const s = rich();
    upgradeSave(s);
    const b = owned(s).find((x) => x.kind === 'numbers')!;
    const sit = RACKETS.numbers!.sits.find((x) => x.id === 'heavy')!;
    const ev = buildSitEvent(s, b, sit)!;
    expect(ev.text.length).toBeGreaterThan(40);
    const carry = ev.choices.find((c) => c.id === 'carry')!;
    expect(carry.effects.map((e) => describeEffect(s, e)).join(' ')).toMatch(/85%: \+\$[\d,]+ · else \(15%\): −\$/);
    s.pendingEvents = [ev];
    const before = { money: s.money, respect: s.respect, heat: { ...s.heat } };
    const r = advanceWeek(s, { choices: { [ev.iid]: 'carry' }, actions: [] });
    expect(r.state.econ!.stats.rkRolls).toBe(1);
    expect(() => reconcile({ start: before, end: { money: r.state.money, respect: r.state.respect, heat: r.state.heat }, lines: r.report.lines })).not.toThrow();
  });

  it('the families register, and a blackmail file is never about who anyone loves', () => {
    const s = rich();
    upgradeSave(s);
    const b = newBusiness(s, 'blackmail', 'downtown');
    b.id = 'bbm';
    s.businesses.push(b);
    const sits = openSits(s, b);
    const ev = buildSitEvent(s, b, sits[0])!;
    expect(allFamilies().some((f) => f.id === 'rk_blackmail_file')).toBe(true);
    expect(ev.text).not.toMatch(/homosexual|gay|queer|orientation|lover of men/i);
    expect(sitCtx(s, b).t).toBeGreaterThan(0);
  });

  it('the hub lists every racket, ranks the startable ones with reasons, and the sim has orders', () => {
    const s = rich();
    upgradeSave(s);
    const cards = hubCards(s);
    expect(cards.length).toBeGreaterThanOrEqual(14);
    expect(cards.find((c) => c.kind === 'vice')?.madam).toBe(true);
    expect(cards.find((c) => c.kind === 'narcotics')?.start).toBeUndefined();
    const picks = whichRacket(s);
    expect(picks.length).toBeGreaterThan(0);
    expect(picks.every((p) => p.reasons.length > 0 && p.kind !== 'narcotics' && p.kind !== 'vice')).toBe(true);
    expect(racketActions(s).length).toBeGreaterThan(0);
    for (const k of Object.keys(RACKETS) as BusinessKind[]) expect(dialsOf(k)).toBeDefined();
  });
});
