import { describe, expect, it } from 'vitest';
import { advanceWeek } from '../src/engine/engine';
import { previewAction } from '../src/engine/actions';
import { hoodView, islandChange, lookOf, eraEcon } from '../src/engine/hood';
import { HOODS, HOODS_BY_ID, SEED } from '../src/engine/hoodData';
import { footprint, hoodBounds, iconOf, placeAll } from '../src/engine/hoodGeo';
import { ensureHood } from '../src/engine/hoodState';
import { newGame } from '../src/engine/newGame';
import type { GameState } from '../src/engine/types';
import { playWeeks, randomChoices } from './helpers';

const boardwalkLots = (s: GameState) => (s.econ?.lots ?? []).filter((l) => HOODS_BY_ID.boardwalk.zones.includes(l.zone));

describe('neighborhoods: the Boardwalk, 1960', () => {
  const s = newGame('hood-1960');
  const placed = placeAll(s);

  it('has at least 20 selectable buildings, every one a record with a place on the island', () => {
    const bldgs = boardwalkLots(s).filter((l) => l.use && l.stage === 'open' && placed.has(l.id));
    expect(bldgs.length).toBeGreaterThanOrEqual(20);
    // Every lot on an island zone is drawn somewhere; nothing off-island is.
    for (const l of s.econ!.lots) {
      if (l.zone === 'ac' || l.zone === 'sphilly') expect(placed.has(l.id)).toBe(false);
      else expect(placed.has(l.id), l.id).toBe(true);
    }
  });

  it('no two buildings stand on the same ground', () => {
    const rects = [...placed.values()].map((p) => footprint(p, iconOf(s.econ!.lots.find((l) => l.id === p.key) ?? {})));
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      const overlap = a.u0 < b.u1 - 0.5 && b.u0 < a.u1 - 0.5 && a.v0 < b.v1 - 0.5 && b.v0 < a.v1 - 0.5;
      expect(overlap, `${[...placed.keys()][i]} / ${[...placed.keys()][j]}`).toBe(false);
    }
  });

  it('has independent businesses, competing organizations, real ownership and a place for sale', () => {
    const ls = boardwalkLots(s);
    expect(ls.filter((l) => l.status === 'private' && l.tenant && l.stage === 'open').length).toBeGreaterThanOrEqual(5);
    const orgs = new Set(ls.filter((l) => l.status === 'rival').map((l) => l.owner));
    expect(orgs.size).toBeGreaterThanOrEqual(2);
    for (const r of SEED.filter((x) => x[1] === 'boardwalk')) {
      const l = s.econ!.lots.find((x) => x.id === r[0])!;
      expect(l.history?.length, r[0]).toBeGreaterThan(0);
    }
    expect(ls.some((l) => l.status === 'sale' && l.use && l.stage === 'open')).toBe(true);
    const v = hoodView(s, 'boardwalk');
    expect(v.organizations.filter((o) => o.id !== 'player').length).toBeGreaterThanOrEqual(2);
    expect(v.businessCount).toBeGreaterThan(10);
    expect(v.residents).toBeGreaterThan(0);
  });

  it('neighborhood boundaries come from the records', () => {
    for (const h of HOODS) {
      const b = hoodBounds(s, h.id);
      expect(b, h.id).toBeDefined();
      for (const p of placed.values()) if (h.zones.includes(p.zone)) expect(p.u0 >= b!.u0 && p.u1 <= b!.u1 && p.v0 >= b!.v0 && p.v1 <= b!.v1).toBe(true);
    }
  });

  it('buys a property through the Deal flow, renovates it and gives it a new look', () => {
    let g = newGame('hood-buy');
    g.money = 200000;
    const target = g.econ!.lots.find((l) => l.id === 'bw20')!;
    expect(target.status).toBe('sale');
    g = advanceWeek(g, { ...randomChoices(g, 1), actions: [{ kind: 'econ', op: { type: 'buyLot', lotId: 'bw20', going: true } }] }).state;
    const mine = g.econ!.lots.find((l) => l.id === 'bw20')!;
    expect(mine.status).toBe('owned');
    expect(mine.history!.some((h) => h.owner === 'player')).toBe(true);
    mine.condition = 40;
    g.money = 200000;
    g = advanceWeek(g, { ...randomChoices(g, 2), actions: [{ kind: 'econ', op: { type: 'renovate', lotId: 'bw20' } }] }).state;
    expect(g.econ!.lots.find((l) => l.id === 'bw20')!.condition).toBeGreaterThanOrEqual(99);
    const before = lookOf(g, g.econ!.lots.find((l) => l.id === 'bw20')!);
    const style = before.style === 'tiki' ? 'deco' : 'tiki';
    const act = { kind: 'hood', op: { type: 'restyle', lotId: 'bw20', style, sign: 'green' } } as const;
    g.money = 200000;
    expect(previewAction(g, act).disabledReason).toBeUndefined();
    g = advanceWeek(g, { ...randomChoices(g, 3), actions: [act] }).state;
    const after = lookOf(g, g.econ!.lots.find((l) => l.id === 'bw20')!);
    expect(after).toEqual({ style, sign: 'green' });
    expect(g.hood!.log.some((e) => e.kind === 'style')).toBe(true);
  });

  it('saves and loads: the same state rolls on the same way, and old saves get the records once', () => {
    let a = newGame('hood-save');
    for (let i = 0; i < 6; i++) a = advanceWeek(a, randomChoices(a, i)).state;
    const b = JSON.parse(JSON.stringify(a)) as GameState;
    const a2 = advanceWeek(a, randomChoices(a, 99)).state;
    const b2 = advanceWeek(b, randomChoices(b, 99)).state;
    expect(JSON.stringify(b2.hood)).toBe(JSON.stringify(a2.hood));
    expect(b2.econ!.lots.length).toBe(a2.econ!.lots.length);
    // An older save: no neighborhood layer, none of its records.
    const old = JSON.parse(JSON.stringify(a)) as GameState;
    delete old.hood;
    old.econ!.lots = old.econ!.lots.filter((l) => !/^(bw|pr|cr|pa|nw)\d\d$/.test(l.id) && !l.id.startsWith('hf.'));
    const n0 = old.econ!.lots.length;
    ensureHood(old);
    const n1 = old.econ!.lots.length;
    expect(n1).toBeGreaterThan(n0 + SEED.length - 1);
    ensureHood(old);
    expect(old.econ!.lots.length).toBe(n1);
    expect(new Set(old.econ!.lots.map((l) => l.id)).size).toBe(n1);
  });
});

describe('neighborhoods: ten years on', () => {
  it('the town changes, visibly and economically, and the records say how', () => {
    const s = playWeeks('hood-decade', 520);
    expect(s.date.y).toBeGreaterThanOrEqual(1969);
    const h = s.hood!;
    // Independent NPC ownership changes, openings and closings.
    expect(h.counts.sales + h.counts.rivalBuys).toBeGreaterThan(10);
    expect(h.counts.openings + h.counts.closures).toBeGreaterThan(4);
    expect(h.counts.renos).toBeGreaterThan(3);
    const ch = islandChange(s)!;
    expect(ch.from).toBe(1960);
    const changed = ch.rows.filter((r) => r.now.businesses !== r.then.businesses || Math.abs(r.now.value - r.then.value) > r.then.value * 0.1);
    expect(changed.length).toBeGreaterThanOrEqual(4);
    const bw = hoodView(s, 'boardwalk');
    expect(bw.history.length).toBeGreaterThan(5);
    // Some places changed hands and their deeds show it.
    const deeds = s.econ!.lots.filter((l) => (l.history?.length ?? 0) >= 2);
    expect(deeds.length).toBeGreaterThan(10);
    // The era moved the economy.
    expect(eraEcon(1966)).toBeGreaterThan(eraEcon(1975));
    expect(h.snaps.length).toBeGreaterThanOrEqual(10);
    // The families dealt with each other on their own, and the Tropicana case ran its course without you.
    const ts = s.talks!.stats;
    expect(ts.disputes + ts.alliances + ts.settlements + ts.splits).toBeGreaterThan(0);
    const trop = s.missions!.runs.find((r) => r.def === 'tropicana');
    expect(trop?.ended).toBeDefined();
  }, 180000);
});
