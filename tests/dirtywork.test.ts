import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { newGame } from '../src/engine/newGame';
import { advanceWeek } from '../src/engine/engine';
import { previewAction, resolveActions } from '../src/engine/actions';
import { newCtx } from '../src/engine/ledger';
import { upgradeSave } from '../src/engine/upgradeSave';
import { tidyState } from '../src/engine/tidy';
import { ageOn } from '../src/engine/calendar';
import {
  commitDirty, crewFor, defaultMan, ensureDirty, jobAction, jobLock, JOBS, JOBS_BY_ID, jobsForPerson, jobsForPlace, jobSummary, personOk, shopOk, targetsFor, TILES, weekTip,
  type DirtyJobId,
} from '../src/engine/dirtyWork';
import { DirtyHere, DirtyWork, DirtyOnPerson } from '../src/ui/econ/DirtyWork';
import { OrdersContext } from '../src/ui/components/Orders';
import { doNow } from '../src/ui/shell/doNow';
import { NAV } from '../src/ui/shell/nav';
import type { GameState, PlayerAction } from '../src/engine/types';

function game(seed = 'dw'): GameState {
  const s = newGame(seed);
  s.money = 60000;
  return s;
}
const man = (s: GameState, job: DirtyJobId) => defaultMan(s, job)!.c.id;
const order = (s: GameState, job: DirtyJobId, target?: string, who = man(s, job)): PlayerAction => jobAction(s, job, who, target ?? targetsFor(s, job)[0]?.id)!;

describe('Dirty work: the menu', () => {
  it('four tiles, every job in one, each with a line, who objects and a risk; nothing names a landmark as a target', () => {
    expect(TILES.map((t) => t.id)).toEqual(['scores', 'muscle', 'fixes', 'goods']);
    for (const t of TILES) expect(JOBS.filter((j) => j.tile === t.id).length, t.id).toBeGreaterThanOrEqual(5);
    for (const j of JOBS) {
      expect(j.line.length, j.id).toBeGreaterThan(20);
      expect(j.objects.length, j.id).toBeGreaterThan(5);
      expect(j.risk.length, j.id).toBeGreaterThan(3);
      expect(`${j.title} ${j.line}`).not.toMatch(/avalon|chapel/i);
    }
    const s = game();
    for (const j of JOBS) for (const t of targetsFor(s, j.id)) expect(`${t.name} ${t.note}`, j.id).not.toMatch(/avalon|boardwalk chapel/i);
  });

  it('every job has a summary, a man and an order; the old systems are wrapped, not copied', () => {
    const s = game();
    for (const j of JOBS) {
      const who = j.noWho ? s.playerId : man(s, j.id);
      const sum = jobSummary(s, j.id, who, targetsFor(s, j.id)[0]?.id);
      expect(sum.title, j.id).toContain(j.title);
      expect(sum.objects.length).toBeGreaterThan(3);
      if (!j.wrap && !sum.lock) {
        expect(sum.odds, j.id).toBeGreaterThan(0);
        expect(sum.odds, j.id).toBeLessThanOrEqual(94);
      }
    }
    expect(order(s, 'jewel')).toMatchObject({ kind: 'scheme', scheme: 'heist', opts: { heist: 'jewelry' } });
    expect(order(s, 'payroll')).toMatchObject({ kind: 'scheme', scheme: 'heist', opts: { heist: 'armored' } });
    expect(order(s, 'hit')).toMatchObject({ kind: 'scheme', scheme: 'murder' });
    expect(order(s, 'bustout')).toMatchObject({ kind: 'econ', op: { type: 'racket', cmd: { c: 'start', kind: 'bustout' } } });
    expect(order(s, 'bribe', undefined, s.playerId)).toMatchObject({ kind: 'interact', id: 'bribe' });
    expect(order(s, 'hijack')).toMatchObject({ kind: 'dirty', op: { job: 'hijack' } });
  });

  it('who does it: the boss, the capos and the men, with skill, nerve, loyalty, heat and his odds', () => {
    const s = game();
    const all = crewFor(s, 'hijack');
    expect(all[0].role).toBe('boss');
    expect(all.some((r) => r.role === 'capo')).toBe(true);
    expect(all.filter((r) => r.best).length).toBe(1);
    for (const r of all) {
      expect(r.odds).toBeGreaterThanOrEqual(10);
      expect(r.nerve).toBeGreaterThanOrEqual(0);
      if (r.role !== 'boss') expect(typeof r.loyalty).toBe('number');
    }
  });

  it('locks say why and how: no jury, no case, the no-junk edict, a cooldown', () => {
    const s = game();
    expect(jobLock(s, 'juror')?.why).toMatch(/jury/);
    expect(jobLock(s, 'evidence')?.how.length).toBeGreaterThan(5);
    s.edicts.nojunk = true;
    expect(jobLock(s, 'dope')?.why).toMatch(/no junk/);
    s.edicts.nojunk = false;
    ensureDirty(s).cool.hijack = s.week;
    expect(jobLock(s, 'hijack')?.why).toMatch(/Too soon/);
    expect(previewAction(s, order(s, 'hijack')).disabledReason).toMatch(/Too soon/);
  });

  it('people targets: adult men, never the law or a man in office, never the boss', () => {
    const s = game();
    for (const job of ['beating', 'hit'] as DirtyJobId[]) {
      for (const t of targetsFor(s, job)) {
        const c = s.characters[t.id];
        expect(c.gender).toBe('M');
        expect(c.office).toBeUndefined();
        expect(ageOn(c.birth, s.date)).toBeGreaterThanOrEqual(21);
        expect(c.faction).not.toBe('player');
      }
    }
    const official = Object.values(s.characters).find((c) => c.alive && c.office === 'Police sergeant')!;
    expect(personOk(s, official, 'beating')).toBe(false);
    expect(jobsForPerson(s, official.id)).toEqual(['bribe']);
    expect(jobsForPerson(s, s.playerId)).toEqual([]);
  });
});

describe('Dirty work: the week', () => {
  it('a score and a targeted shakedown resolve in the week, through the one ledger, with a result in the report', () => {
    const s = game('dw-week');
    const shop = (s.econ?.lots ?? []).find(shopOk)!;
    const score = order(s, 'smokes');
    const shaker = crewFor(s, 'shakedown').find((r) => !r.busy && r.role !== 'boss' && r.c.id !== man(s, 'smokes'))!.c.id;
    const shake = jobAction(s, 'shakedown', shaker, shop.id)!;
    expect(previewAction(s, shake).title).toContain(shop.name ?? '');
    const r = advanceWeek(s, { actions: [score, shake] });
    const d = r.state.dirty!;
    expect(d.log.length).toBe(2);
    expect(d.log.map((x) => x.job).sort()).toEqual(['shakedown', 'smokes']);
    expect(r.report.log.filter((l) => l.startsWith('Dirty work — ')).length).toBe(2);
    expect(r.report.lines.some((l) => /Dirty work: A load of untaxed cigarettes/.test(l.label))).toBe(true);
    expect(d.cool[`shakedown:${shop.id}`]).toBe(s.week);
    // Same seed, same orders: the same result.
    const r2 = advanceWeek(s, { actions: [score, shake] });
    expect(r2.state.dirty!.log).toEqual(d.log);
    expect(r2.state.money).toBe(r.state.money);
  });

  it('one man, one job a week: the second order is not carried out', () => {
    const s = game('dw-busy');
    const who = man(s, 'smokes');
    const r = advanceWeek(s, { actions: [jobAction(s, 'smokes', who)!, jobAction(s, 'booze', who)!] });
    expect(r.state.dirty!.log.length).toBe(1);
    expect(r.report.log.some((l) => /Order not carried out.*Already on a job/.test(l))).toBe(true);
  });

  it('outcomes feed money, heat, evidence, loyalty and jail; a man who talks puts it on the boss', () => {
    const counts: Record<string, number> = {};
    let rats = 0;
    let jailed = 0;
    let paid = 0;
    for (let i = 0; i < 80; i++) {
      const s = game(`dw-out-${i % 4}`);
      const d = ensureDirty(s);
      d.rng = (d.rng + i * 7919) >>> 0;
      const who = crewFor(s, 'guns').filter((r) => r.role === 'associate')[0]?.c.id ?? man(s, 'guns');
      const ctx = newCtx(s);
      const m0 = s.money;
      const ev0 = s.characters[s.playerId].evidence ?? 0;
      resolveActions(ctx, [jobAction(s, 'guns', who)!]);
      const res = s.dirty!.log[s.dirty!.log.length - 1];
      counts[res.outcome] = (counts[res.outcome] ?? 0) + 1;
      if (res.take > 0) { paid++; expect(s.money).toBeGreaterThan(m0 - 4000); }
      if (res.outcome === 'pinched') { jailed++; expect(s.characters[who].imprisonedUntil).toBeGreaterThan(s.week); }
      if (res.rat) { rats++; expect(s.characters[s.playerId].evidence ?? 0).toBeGreaterThan(ev0); }
      if (res.outcome === 'clean') expect(s.heat.federal).toBeGreaterThan(0);
    }
    expect(counts.clean).toBeGreaterThan(20);
    expect((counts.bust ?? 0) + (counts.pinched ?? 0)).toBeGreaterThan(3);
    expect(jailed).toBeGreaterThan(0);
    expect(paid).toBe((counts.clean ?? 0) + (counts.messy ?? 0));
    expect(rats).toBeGreaterThanOrEqual(0);
  });

  it('run off a rival\'s operation hurts that family and may bring retaliation; the dope load may reach Philadelphia', () => {
    const s = game('dw-rival');
    const t = targetsFor(s, 'runoff')[0];
    expect(t?.rival).toBeTruthy();
    let hit = false;
    for (let i = 0; i < 12 && !hit; i++) {
      const x = game('dw-rival');
      ensureDirty(x).rng = (ensureDirty(x).rng + i * 104729) >>> 0;
      const r0 = x.rivals.find((r) => r.id === t.rival)!.money;
      const ctx = newCtx(x);
      commitDirty(ctx, { job: 'runoff', who: man(x, 'runoff'), target: t.id });
      if (x.dirty!.log[0].outcome === 'clean' || x.dirty!.log[0].outcome === 'messy') {
        hit = true;
        expect(x.rivals.find((r) => r.id === t.rival)!.money).toBeLessThan(r0);
      }
    }
    expect(hit).toBe(true);
    let found = false;
    for (let i = 0; i < 20 && !found; i++) {
      const x = game('dw-dope');
      ensureDirty(x).rng = (ensureDirty(x).rng + i * 15485863) >>> 0;
      commitDirty(newCtx(x), { job: 'dope', who: man(x, 'dope') });
      if (x.flags.brunoKnows) { found = true; expect(x.scheduled.some((c) => c.key === 'narcotics_found_out')).toBe(true); }
    }
    expect(found).toBe(true);
  });

  it('fixes tie into the case: buying a juror helps the defense, losing the evidence cuts it', () => {
    const s = game('dw-case');
    s.characters[s.playerId].evidence = 40;
    s.legal = { stage: 'trial', personId: s.playerId, defense: 10, since: s.week, next: s.week + 8 };
    expect(jobLock(s, 'juror')).toBeUndefined();
    expect(jobLock(s, 'evidence')).toBeUndefined();
    let ok = false;
    for (let i = 0; i < 10 && !ok; i++) {
      const x = structuredClone(s);
      ensureDirty(x).rng = (hashBump(i)) >>> 0;
      commitDirty(newCtx(x), { job: 'evidence', who: man(x, 'evidence') });
      const o = x.dirty!.log[0].outcome;
      if (o === 'clean' || o === 'messy') { ok = true; expect(x.characters[x.playerId].evidence!).toBeLessThan(40); }
    }
    expect(ok).toBe(true);
  });

  it('a Walk/Street card offers the targeted job for that place', () => {
    const s = game();
    const shop = (s.econ?.lots ?? []).find(shopOk)!;
    expect(jobsForPlace(s, shop)[0]).toMatchObject({ job: 'shakedown', target: shop.id, label: 'Shake them down' });
    const rival = (s.econ?.lots ?? []).find((l) => s.rivals.some((r) => r.id === l.owner && r.kind === 'mob'));
    if (rival) expect(jobsForPlace(s, rival).map((x) => x.job)).toContain('runoff');
  });

  it('this week\'s tip is pure, sometimes there, and shows in Do this now', () => {
    let tips = 0;
    let s = game('dw-tip');
    for (let w = 0; w < 20; w++) {
      s = { ...s, week: s.week + 1 };
      const t = weekTip(s);
      expect(weekTip(s)).toEqual(t);
      if (t) {
        tips++;
        expect(JOBS_BY_ID[t.job]).toBeTruthy();
        const items = doNow(s, 'money', { alerts: [], opps: [], unanswered: 0, brief: 0 });
        if (!jobLock(s, t.job)) expect(items.some((x) => x.id === 'dirty-tip')).toBe(true);
      }
    }
    expect(tips).toBeGreaterThan(3);
    expect(tips).toBeLessThan(18);
  });
});

describe('Dirty work: saves', () => {
  it('old saves load without the layer; a week with jobs round-trips clean through JSON', () => {
    const s = game('dw-save');
    expect(s.dirty).toBeUndefined();
    upgradeSave(s);
    expect(s.dirty).toBeUndefined();
    const r = advanceWeek(s, { actions: [order(s, 'smokes'), order(s, 'shakedown', undefined, crewFor(s, 'shakedown').filter((x) => !x.busy && x.role === 'capo')[0].c.id)] }).state;
    expect(r.dirty).toBeDefined();
    const back = JSON.parse(JSON.stringify(r));
    expect(back).toEqual(r);
    const copy = structuredClone(r);
    tidyState(copy);
    expect(copy).toEqual(r);
    upgradeSave(back);
    expect(back.dirty.rng).toBe(r.dirty!.rng);
    // A week without any dirty work leaves no layer behind.
    const q = advanceWeek(game('dw-save2'), {}).state;
    expect(q.dirty).toBeUndefined();
  });
});

describe('Dirty work: the screens', () => {
  it('the panel, the place button and the person buttons render; the nav has it beside the rackets', () => {
    const s = game('dw-ui');
    const wrap = (el: ReturnType<typeof createElement>) => createElement(OrdersContext.Provider, { value: { orders: [], queue: () => {}, remove: () => {} } }, el);
    const a = renderToString(wrap(createElement(DirtyWork, { s })));
    expect(a).toContain('Dirty work');
    for (const t of ['Scores', 'Muscle', 'Fixes', 'Moving goods']) expect(a).toContain(t);
    const shop = (s.econ?.lots ?? []).find(shopOk)!;
    const b = renderToString(wrap(createElement(DirtyHere, { s, lot: shop, onGo: () => {} })));
    expect(b).toContain('Shake them down');
    const rivalMan = targetsFor(s, 'beating')[0];
    const c = renderToString(wrap(createElement(DirtyOnPerson, { s, charId: rivalMan.id, onGo: () => {} })));
    expect(c).toContain('Lean on him');
    expect(c).toContain('A hit');
    const biz = NAV.money.flatMap((g) => g.items).map((i) => i.keys[0]);
    expect(biz.indexOf('holdings.dirty')).toBe(biz.indexOf('holdings.hub') + 1);
  });
});

function hashBump(i: number): number {
  return (2166136261 ^ (i * 2654435761)) >>> 0;
}
