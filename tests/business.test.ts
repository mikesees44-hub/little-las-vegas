import { describe, expect, it } from 'vitest';
import { legalActions, previewAction } from '../src/engine/actions';
import { expectedTake, owned, playerSlots, washCapacity } from '../src/engine/business';
import { dateOfWeek } from '../src/engine/calendar';
import { CATALOG, SHOP_KINDS } from '../src/engine/catalog';
import { UNWASHED_SAFE } from '../src/engine/economy';
import { advanceWeek } from '../src/engine/engine';
import { buildNarcoticsReckoning, EVENT_DEFS } from '../src/engine/events';
import { HISTORY_DATES } from '../src/engine/history';
import { reconcile } from '../src/engine/ledger';
import { newGame } from '../src/engine/newGame';
import { rand } from '../src/engine/rng';
import type { BusinessKind, GameState, PlayerAction } from '../src/engine/types';
import { randomChoices } from './helpers';

function step(s: GameState, actions: PlayerAction[] = []): GameState {
  return advanceWeek(s, { ...randomChoices(s, s.week), actions }).state;
}

function weekOfDate(y: number, m: number, d: number): number {
  let w = 1;
  while (true) {
    const dt = dateOfWeek(w + 1);
    if (dt.y > y || (dt.y === y && (dt.m > m || (dt.m === m && dt.d > d)))) return w;
    w++;
  }
}

describe('business catalog', () => {
  it('every kind is complete and fronts (plus the laundering racket) are the only things that wash money', () => {
    for (const k of Object.keys(CATALOG) as BusinessKind[]) {
      const d = CATALOG[k];
      expect(d.name.length).toBeGreaterThan(2);
      expect(d.season).toHaveLength(2);
      expect(d.cost).toBeGreaterThanOrEqual(0);
      // The one racket whose whole business is washing ("Laundering for other outfits") washes some of ours too.
      if (d.category === 'racket' && k !== 'washing') expect(d.launder).toBe(0);
      if (k === 'washing') expect(d.launder).toBeGreaterThan(0);
      if (d.category === 'front') expect(d.launder).toBeGreaterThan(0);
    }
    expect(SHOP_KINDS.length).toBeGreaterThanOrEqual(22);
  });
  it('vice is abstract: no explicit words anywhere in the catalog', () => {
    const text = JSON.stringify(CATALOG).toLowerCase();
    for (const w of ['sex', 'prostitut', 'porn', 'whore', 'hooker', 'traffick', 'nude']) expect(text).not.toContain(w);
  });
  it('seasonal fronts earn nothing in winter; year-round ones keep earning', () => {
    let s = newGame('season');
    s = step(s, [{ kind: 'buyBusiness', biz: 'stand', district: 'boardwalk' }, { kind: 'buyBusiness', biz: 'laundromat', district: 'pacific' }]);
    const stand = owned(s).find((b) => b.kind === 'stand')!;
    const laund = owned(s).find((b) => b.kind === 'laundromat')!;
    expect(expectedTake(s, stand)).toBeGreaterThan(200);
    while (s.date.m !== 11) s = step(s);
    expect(expectedTake(s, stand)).toBe(0);
    expect(expectedTake(s, laund)).toBeGreaterThan(40);
  });
});

describe('orders', () => {
  it('buying a business costs its price, adds it, and every line and chip is named', () => {
    const s = newGame('buy');
    const a: PlayerAction = { kind: 'buyBusiness', biz: 'pizza', district: 'boardwalk' };
    const p = previewAction(s, a);
    expect(p.disabledReason).toBeUndefined();
    for (const e of p.effects) expect(e.label).toContain('Buy:');
    const r = advanceWeek(s, { actions: [a] });
    const line = r.report.lines.find((l) => l.label.startsWith('Buy:') && l.stat === 'money')!;
    expect(line.amount).toBe(-CATALOG.pizza.cost);
    expect(owned(r.state).some((b) => b.kind === 'pizza' && b.id)).toBe(true);
    expect(reconcile(r.report)).toEqual([]);
  });
  it('previews are pure', () => {
    const s = newGame('pure');
    const before = JSON.stringify(s);
    for (const a of legalActions(s)) previewAction(s, a);
    expect(JSON.stringify(s)).toBe(before);
  });
  it('district storefronts cap how many places you can run there', () => {
    let s = newGame('slots');
    const d = 'north'; // Kessler's side
    s.districts.find((x) => x.id === d)!.influence.player = 40;
    const sl = playerSlots(s, d);
    expect(sl.max).toBe(2);
    const acts: PlayerAction[] = Array.from({ length: sl.max + 1 }, () => ({ kind: 'buyBusiness', biz: 'pizza', district: d }) as PlayerAction);
    s.money = 100000;
    s = advanceWeek(s, { actions: acts }).state;
    expect(owned(s).filter((b) => b.districtId === d).length).toBe(sl.max);
  });
  it('an order that is no longer possible is skipped with a note, not applied', () => {
    const s = newGame('skip');
    s.money = 1000;
    const r = advanceWeek(s, { actions: [{ kind: 'buyBusiness', biz: 'motel', district: 'crest' }] });
    expect(owned(r.state).some((b) => b.kind === 'motel')).toBe(false);
    expect(r.log.some((l) => l.startsWith('Order not carried out'))).toBe(true);
  });
});

describe('laundering', () => {
  it('dirty money beyond the fronts piles up as unwashed cash and draws federal heat', () => {
    let s = newGame('wash');
    s.money = 200000;
    s.unwashed = 60000;
    const r = advanceWeek(s, {});
    expect(r.state.unwashed).toBeGreaterThan(UNWASHED_SAFE);
    expect(r.report.lines.some((l) => l.stat === 'heat.federal' && l.label.startsWith('Unwashed cash'))).toBe(true);
    expect(r.report.lines.some((l) => l.label.startsWith('Laundering:'))).toBe(true);
  });
  it('a laundromat adds wash capacity', () => {
    const s = newGame('wash2');
    const before = washCapacity(s);
    const s2 = step(s, [{ kind: 'buyBusiness', biz: 'laundromat', district: 'pacific' }]);
    expect(washCapacity(s2)).toBeGreaterThan(before + 1000);
  });
  it('unwashed cash never exceeds the treasury', () => {
    let s = newGame('wash3');
    for (let w = 0; w < 80; w++) {
      s = step(s);
      expect(s.unwashed).toBeLessThanOrEqual(Math.max(0, s.money));
      expect(s.unwashed).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('the shylock book', () => {
  it('needs a book, pays named vig, and defaults raise an event', () => {
    let s = newGame('loans');
    expect(previewAction(s, { kind: 'lend', amount: 2500 }).disabledReason).toMatch(/shylock book/);
    s = step(s, [{ kind: 'buyBusiness', biz: 'loansharking', district: 'downtown' }]);
    s.money = 50000;
    s = step(s, [{ kind: 'lend', amount: 5000 }, { kind: 'lend', amount: 5000 }, { kind: 'lend', amount: 2500 }, { kind: 'lend', amount: 1000 }]);
    expect(s.loans).toHaveLength(4);
    let vig = 0;
    let defaulted = false;
    for (let w = 0; w < 30; w++) {
      for (const l of s.loans) l.risk = 0.2;
      const r = advanceWeek(s, randomChoices(s, w));
      vig += r.report.lines.filter((l) => l.label.startsWith('Vig:')).length;
      if (r.state.pendingEvents.some((e) => e.defId === 'borrower_default')) defaulted = true;
      s = r.state;
    }
    expect(vig).toBeGreaterThan(0);
    expect(EVENT_DEFS.some((d) => d.id === 'borrower_default')).toBe(true);
    expect(defaulted || s.loans.length < 4).toBe(true);
  });
});

describe('long-term goals', () => {
  it('the bank needs a front man and a political favor', () => {
    let s = newGame('bank');
    s.money = 120000;
    expect(previewAction(s, { kind: 'charterBank' }).disabledReason).toMatch(/front man/);
    s = step(s, [{ kind: 'findFrontMan' }]);
    expect(s.frontManId).toBeTruthy();
    s.favors = 1;
    s.heat.federal = 10;
    s.money = 120000;
    expect(previewAction(s, { kind: 'charterBank' }).disabledReason).toBeUndefined();
    s = step(s, [{ kind: 'charterBank' }]);
    expect(owned(s).some((b) => b.kind === 'bank')).toBe(true);
    expect(s.favors).toBe(0);
  });
  it('the casino dream cannot happen before the 1976 referendum, and opens after 1978', () => {
    let s = newGame('casino');
    s.money = 200000;
    s = step(s, [{ kind: 'casino' }, { kind: 'findFrontMan' }]);
    expect(s.goals.casinoStage).toBe(1);
    expect(previewAction(s, { kind: 'casino' }).disabledReason).toMatch(/illegal/);
    // Jump to after the referendum.
    const ref = HISTORY_DATES.referendum1976;
    s.week = weekOfDate(ref.y, ref.m, ref.d) + 1;
    s.date = dateOfWeek(s.week);
    s.heat.federal = 5;
    s.money = 200000;
    expect(previewAction(s, { kind: 'casino' }).disabledReason).toBeUndefined();
    expect(previewAction(s, { kind: 'casino', sell: true }).disabledReason).toBeUndefined();
    s = step(s, [{ kind: 'casino' }]);
    expect(s.goals.casinoStage).toBe(2);
    for (let i = 0; i < 100 && s.goals.casinoStage < 4; i++) {
      s.heat.federal = 5;
      s = step(s);
    }
    expect(s.goals.casinoStage).toBe(4);
    expect(owned(s).some((b) => b.kind === 'casino')).toBe(true);
    const open = HISTORY_DATES.firstCasino;
    expect(s.date.y * 10000 + s.date.m * 100 + s.date.d).toBeGreaterThanOrEqual(open.y * 10000 + open.m * 100 + open.d);
  });
});

describe('narcotics under Bruno\'s ban', () => {
  it('Philadelphia finding out forces a reckoning; defying it gets a man killed', () => {
    let s = newGame('junk');
    s.money = 50000;
    s = step(s, [{ kind: 'buyBusiness', biz: 'narcotics', district: 'docks' }]);
    const pipe = owned(s).find((b) => b.kind === 'narcotics')!;
    expect(pipe).toBeTruthy();
    s.pendingEvents = [buildNarcoticsReckoning(s, pipe.id)];
    const ev = s.pendingEvents[0];
    s = advanceWeek(s, { choices: { [ev.iid]: 'defy' } }).state;
    let killed = false;
    for (let i = 0; i < 12 && !killed; i++) {
      const before = Object.values(s.characters).filter((c) => !c.alive).length;
      s = advanceWeek(s, {}).state;
      killed = Object.values(s.characters).some((c) => !c.alive && c.death?.cause.includes('Philadelphia\'s message'));
      if (Object.values(s.characters).filter((c) => !c.alive).length < before) break;
    }
    expect(killed || !owned(s).some((b) => b.kind === 'narcotics')).toBe(true);
  });
});

describe('random orders keep the books straight', () => {
  it('reconciles every week across seeds with random orders', () => {
    for (let g = 0; g < 6; g++) {
      let s = newGame(`ro${g}`);
      const h = { rng: 1234 + g };
      for (let w = 0; w < 120 && !s.gameOver; w++) {
        const legal = legalActions(s);
        const actions = legal.length && rand(h) < 0.4 ? [legal[Math.floor(rand(h) * legal.length)]] : [];
        const r = advanceWeek(s, { ...randomChoices(s, w), actions });
        expect(reconcile(r.report)).toEqual([]);
        s = r.state;
      }
    }
  });
});
