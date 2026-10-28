import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { advanceWeek, cloneState } from '../src/engine/engine';
import { newGame } from '../src/engine/newGame';
import {
  DAILY, deedName, editionsOut, findItem, killCost, markPaperRead, paperWeek, proofs, spoutOff, trueRumors, unreadCount, whosPlaying, WEEKLY,
  type Edition, type PItem,
} from '../src/engine/paper';
import { AD_LIFT, adLift } from '../src/engine/paperAds';
import { newCtx, reconcile } from '../src/engine/ledger';
import { ensureNightlife } from '../src/engine/nightlife';
import { upgradeSave } from '../src/engine/upgradeSave';
import { hasTimeCost } from '../src/engine/timeCost';
import { tickDay } from '../src/engine/days';
import type { GameState, PlayerAction } from '../src/engine/types';
import { PaperReader } from '../src/ui/paper/PaperReader';

const items = (s: GameState, week = s.week): PItem[] => (s.paper?.eds ?? []).filter((e) => e.week === week).flatMap((e) => e.items);
const step = (s: GameState, actions: PlayerAction[] = []) => advanceWeek(s, { actions });

function base(seed: string, weeks = 1): GameState {
  let s = newGame(seed);
  for (let i = 0; i < weeks; i++) s = step(s).state;
  return s;
}

describe('the papers print only what happened', () => {
  it('a daily for every day and a Thursday weekly, from the first week on', () => {
    const s = base('paper-eds');
    const eds = s.paper!.eds.filter((e) => e.week === s.week);
    expect(eds.filter((e) => e.kind === 'daily').map((e) => e.day)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(eds.filter((e) => e.kind === 'weekly').map((e) => e.day)).toEqual([3]);
    // On the desk as the clock reaches each day.
    expect(editionsOut(s).map((e) => e.id)).toEqual([`d${s.week}-0`]);
    let t = s;
    for (let d = 0; d < 3; d++) t = tickDay(t);
    expect(editionsOut(t).some((e) => e.kind === 'weekly')).toBe(true);
    expect(unreadCount(t)).toBe(5);
    expect(unreadCount(markPaperRead(t))).toBe(0);
  });

  it('a purchase is recorded in the deeds — in the boss\'s name, or the front man\'s', () => {
    let s = base('paper-deed');
    const lot = s.econ!.lots.filter((l) => l.status === 'sale' && l.price < s.money / 2).sort((a, b) => a.price - b.price)[0];
    expect(lot).toBeTruthy();
    const r = step(s, [{ kind: 'econ', op: { type: 'buyLot', lotId: lot.id } }]);
    s = r.state;
    expect(s.econ!.lots.find((l) => l.id === lot.id)!.owner).toBe('player');
    const deed = items(s).find((x) => x.s === 'deeds' && x.b.startsWith(lot.address));
    expect(deed, 'the deed').toBeTruthy();
    expect(deed!.b).toContain(deedName(s).name);
    if (!deedName(s).front) {
      expect(deed!.a).toBe('boss');
      // The FBI reads the deeds: once a week, on the boss's own name.
      expect(items(s).filter((x) => x.s === 'deeds' && x.a === 'boss' && x.fx?.heat?.[0][0] === 'federal')).toHaveLength(1);
    }
    // Through a front: the deed carries the front's name, never the boss's.
    let t = base('paper-deed2');
    const front = Object.values(t.characters).find((c) => c.alive && c.faction === 'player' && c.id !== t.playerId)!;
    t.frontManId = front.id;
    const lot2 = t.econ!.lots.filter((l) => l.status === 'sale' && l.price < t.money / 2).sort((a, b) => a.price - b.price)[0];
    t = step(t, [{ kind: 'econ', op: { type: 'buyLot', lotId: lot2.id } }]).state;
    const deed2 = items(t).find((x) => x.s === 'deeds' && x.b.startsWith(lot2.address))!;
    const boss = t.characters[t.playerId];
    expect(deed2.b).toContain(`${front.firstName} ${front.lastName}`);
    expect(deed2.b).not.toContain(`${boss.firstName} ${boss.lastName}`);
    expect(deed2.fx).toBeUndefined();
  });

  it('an arrest goes on the blotter with the charge and the bail; the boss\'s man by name', () => {
    const s = base('paper-arrest');
    const man = Object.values(s.characters).find((c) => c.alive && c.faction === 'player' && c.rank === 'soldier' && c.imprisonedUntil === undefined)!;
    man.imprisonedUntil = s.week + 12;
    const t = step(s).state;
    const it = items(t).find((x) => (x.s === 'blotter' || x.s === 'front') && x.b.includes(`${man.firstName} ${man.lastName}`) && /arrested|custody/.test(x.b))!;
    expect(it).toBeTruthy();
    expect(it.b).toMatch(/charged with/);
    expect(it.b).toMatch(/bail/);
    expect(it.a).toBe('family');
    expect(it.fx?.resp).toBe(-1);
    // Nobody is arrested in the paper who wasn't arrested in the game.
    const custody = new Set(Object.values(t.characters).filter((c) => c.imprisonedUntil !== undefined && c.imprisonedUntil > s.week).map((c) => `${c.firstName} ${c.lastName}`));
    for (const x of items(t).filter((y) => /was arrested|taken into custody/.test(y.b))) expect([...custody].some((n) => x.b.includes(n)), x.b).toBe(true);
  });

  it('a listing becomes a classified ad with its price (and the lot to open)', () => {
    const s = base('paper-list');
    const lot = s.econ!.lots.find((l) => l.status !== 'sale' && l.owner === 'private' && !l.home)!;
    lot.status = 'sale';
    lot.price = 12345;
    s.market!.listed[lot.id] = { w: s.week, why: 'estate', ask: lot.price };
    const t = step(s).state;
    const ad = items(t).find((x) => x.s === 'classified' && x.lot === lot.id)!;
    expect(ad).toBeTruthy();
    const now = t.econ!.lots.find((l) => l.id === lot.id)!;
    expect(ad.ask).toBe(now.price);
    expect(ad.b).toContain(`$${now.price.toLocaleString('en-US')}`);
    // Every classified lot is a lot really for sale when the paper was set.
    for (const x of items(t).filter((y) => y.lot)) expect(t.econ!.lots.find((l) => l.id === x.lot)).toBeTruthy();
  });
});

describe('Spout Off', () => {
  it('never prints a "true" rumor when nothing is hidden', () => {
    const s = base('paper-spout0');
    s.nightlife = undefined;
    s.dating = undefined;
    if (s.living) s.living.facts = s.living.facts.filter((f) => f.sec === 0);
    for (const c of Object.values(s.pol?.ctl ?? {})) c.payroll = undefined;
    for (const c of Object.values(s.characters)) if (c.faction === 'player') c.wealth = 0;
    expect(trueRumors(s)).toEqual([]);
    const used = new Set<string>();
    const all = Array.from({ length: 60 }, (_, i) => spoutOff(s, `z${i}`, 3, used)).flat();
    expect(all.length).toBeGreaterThan(50);
    expect(all.filter((x) => x.t === 'true')).toEqual([]);
  });

  it('a mix: about a third true when there is something to tell, mostly grumbling, some false; the true ones come from the state', () => {
    const s = base('paper-spout1');
    const N = ensureNightlife(s);
    const women = Object.values(s.characters).filter((c) => c.alive && c.gender === 'F' && c.id !== s.playerId).slice(0, 6);
    women.forEach((w, i) => { N.goomars[w.id] = { id: w.id, since: s.week, rent: 20, allowance: 30, missed: 0, where: `an apartment on ${i + 2}0th Street` } as never; });
    const truths = new Set(trueRumors(s).map((r) => r.b));
    expect(truths.size).toBeGreaterThanOrEqual(women.length);
    const all = Array.from({ length: 200 }, (_, i) => spoutOff(s, `m${i}`, 3, new Set())).flat();
    const n = (t: string) => all.filter((x) => x.t === t).length / all.length;
    expect(n('true')).toBeGreaterThan(0.15);
    expect(n('true')).toBeLessThan(0.45);
    expect(n('grumble')).toBeGreaterThan(n('false'));
    expect(n('false')).toBeGreaterThan(0.05);
    for (const x of all.filter((y) => y.t === 'true')) expect(truths.has(x.b), x.b).toBe(true);
    // The goomar rumor is about the boss, and the wife reads it.
    const g = all.find((x) => x.t === 'true' && x.fx?.goomar)!;
    expect(g.a).toBe('boss');
  });
});

describe('the boss and the editor', () => {
  function arrested(seed: string): { s: GameState; id: string; label: string } {
    const s0 = base(seed);
    const man = Object.values(s0.characters).find((c) => c.alive && c.faction === 'player' && c.rank === 'soldier' && c.imprisonedUntil === undefined)!;
    man.imprisonedUntil = s0.week + 12;
    const s = step(s0).state;
    const p = proofs(s).find((x) => x.it.b.includes(man.lastName) && x.it.fx)!;
    expect(p, 'the arrest is in the proofs').toBeTruthy();
    expect(p.ed.day).toBeGreaterThan(0);
    return { s, id: p.it.id, label: (p.it.h ?? p.it.b).slice(0, 20) };
  }

  it('spiking a story before it runs: it never runs and what it would have done never happens', () => {
    const { s, id, label } = arrested('paper-kill');
    const ran = step(s);
    expect(ran.report.lines.some((l) => l.label.includes(label) && l.stat === 'respect')).toBe(true);
    const killed = step(s, [{ kind: 'paper', op: { op: 'kill', item: id } }]);
    expect(findItem(killed.state, id)!.it.sp).toBe(1);
    expect(killed.report.lines.some((l) => l.label.includes(label) && l.stat === 'respect')).toBe(false);
    expect(killed.report.lines.some((l) => l.label.includes('editor\'s envelope') && l.stat === 'money')).toBe(true);
    expect(killed.state.paper!.stats.killed).toBe(1);
    expect(reconcile(killed.report)).toEqual([]);
  });

  it('a planted story runs early next week and does what it says', () => {
    const s = base('paper-plant');
    const r1 = step(s, [{ kind: 'paper', op: { op: 'plant', story: 'puff' } }]);
    const pl = items(r1.state).find((x) => x.pl)!;
    expect(pl).toBeTruthy();
    const ed = r1.state.paper!.eds.find((e) => e.items.includes(pl))!;
    expect(ed.day).toBeLessThanOrEqual(1);
    const r2 = step(r1.state);
    expect(r2.report.lines.some((l) => l.stat === 'respect' && l.amount > 0 && l.label.includes('Local Success'))).toBe(true);
    // A smear needs a family to smear.
    const mob = s.rivals.find((r) => r.kind === 'mob')!;
    const r3 = step(s, [{ kind: 'paper', op: { op: 'plant', story: 'smear', target: mob.id } }]);
    const sm = items(r3.state).find((x) => x.pl && x.fx?.rivalExposure)!;
    expect(sm.fx!.rivalExposure![0]).toBe(mob.id);
  });

  it('ads: the place gets the lift and a box in the listings; buying the paper makes spiking free', () => {
    let s = base('paper-ad');
    const v = Object.values(s.empire?.venues ?? {}).find((x) => x.owner === 'player');
    const biz = s.businesses.find((b) => b.owner === 'player' && (!b.category || b.category === 'front'));
    const key = v ? `venue:${v.id}` : `biz:${biz!.id}`;
    s = step(s, [{ kind: 'paper', op: { op: 'ad', place: key } }]).state;
    expect(s.paper!.ads[key]).toBeGreaterThanOrEqual(s.week);
    expect(adLift(s, key)).toBe(AD_LIFT);
    expect(items(s).some((x) => x.ad)).toBe(true);
    s.respect = 60;
    s.money += 200000;
    s = step(s, [{ kind: 'paper', op: { op: 'buy' } }]).state;
    expect(s.paper!.owned).toBeDefined();
    expect(killCost(s, { id: 'x', s: 'front', b: '' })).toBe(0);
  });

  it('a libel suit over a false item about the boss: decided once, and the paper says so', () => {
    const s = base('paper-sue');
    const ed = s.paper!.eds.find((e) => e.id === `d${s.week}-0`) as Edition;
    ed.items.push({ id: `${ed.id}.999`, s: 'spout', b: `The ${s.houseName} family is selling out to Florida.`, t: 'false', a: 'boss' });
    const r = step(s, [{ kind: 'paper', op: { op: 'sue', item: `${ed.id}.999` } }]);
    expect(r.state.paper!.stats.suits).toBe(1);
    expect(r.state.paper!.sued).toContain(`${ed.id}.999`);
    expect(items(r.state).some((x) => /RETRACTION|SUIT THROWN OUT/.test(x.h ?? ''))).toBe(true);
    const again = step(s, [{ kind: 'paper', op: { op: 'sue', item: `${ed.id}.999` } }]);
    expect(JSON.stringify(again.state.paper!.stats)).toBe(JSON.stringify(r.state.paper!.stats));
  });

  it('every paper order has a time cost', () => {
    for (const op of ['plant', 'kill', 'ad', 'buy', 'sue']) expect(hasTimeCost('paper', op), op).toBe(true);
  });
});

describe('who\'s playing', () => {
  it('busy in August, thin in January; the boss\'s rooms bill what he books', () => {
    const s = base('paper-ent');
    const aug = whosPlaying(s, 11);
    const jan = whosPlaying(s, 33);
    const town = (l: ReturnType<typeof whosPlaying>) => l.filter((x) => !x.own && !x.film).length;
    expect(town(aug)).toBeGreaterThan(town(jan) + 3);
    expect(town(jan)).toBeGreaterThanOrEqual(1);
    expect(aug.some((x) => x.room === 'The Convention Hall')).toBe(true);
    expect(jan.some((x) => x.room === 'The Convention Hall')).toBe(false);
    const v = Object.values(s.empire?.venues ?? {}).find((x) => x.owner === 'player');
    if (v) {
      v.policy.act = { name: 'The Starlight Kings', fee: 900, draw: 0.8 };
      const l = whosPlaying(s, s.week);
      expect(l.find((x) => x.own && x.room === v.name)?.act).toBe('The Starlight Kings');
    }
    // No performer is billed twice in one week; every headliner is from the fictional world pack or the house lists.
    const acts = aug.filter((x) => !x.film).map((x) => x.act);
    expect(new Set(acts).size).toBe(acts.length);
  });
});

describe('determinism, size, saves, screen', () => {
  it('the same seed sets the same papers', () => {
    const a = base('paper-det', 4);
    const b = base('paper-det', 4);
    expect(JSON.stringify(a.paper)).toBe(JSON.stringify(b.paper));
  });

  it('the archive is capped and the save cost bounded', () => {
    const s = base('paper-size', 26);
    const P = s.paper!;
    expect(P.eds.filter((e) => e.kind === 'daily').length).toBeLessThanOrEqual(14);
    expect(P.eds.filter((e) => e.kind === 'weekly').length).toBeLessThanOrEqual(8);
    const n = JSON.stringify(P).length;
    console.log('paper chars', n, 'of', JSON.stringify(s).length);
    expect(n).toBeLessThan(200_000);
  });

  it('upgradeSave leaves the papers alone (and makes none for a save without them)', () => {
    const s = newGame('paper-up');
    expect(upgradeSave(cloneState(s)).paper).toBeUndefined();
    const t = base('paper-up', 2);
    expect(JSON.stringify(upgradeSave(cloneState(t)).paper)).toBe(JSON.stringify(t.paper));
  });

  it('paperWeek alone reconciles (its lines go through the ledger)', () => {
    const s = cloneState(base('paper-ledger', 2));
    s.paper!.ads['biz:' + (s.businesses.find((b) => b.owner === 'player')?.id ?? 'x')] = s.week + 2;
    const snap = () => ({ money: s.money, respect: s.respect, heat: { ...s.heat } });
    const start = snap();
    const ctx = newCtx(s);
    paperWeek(ctx);
    expect(reconcile({ start, end: snap(), lines: ctx.lines })).toEqual([]);
  });

  it('the reader renders a broadsheet: masthead, Spout Off, the listings', () => {
    let s = base('paper-ui', 2);
    for (let d = 0; d < 3; d++) s = tickDay(s);
    const html = renderToString(createElement(PaperReader, { s }));
    expect(html).toContain(DAILY);
    expect(html).toContain('SPOUT OFF');
    expect(html).toContain('data-testid="classifieds"');
    expect(html).toContain('editor-desk');
    expect(WEEKLY).toMatch(/Weekly Leader/);
  });
});
