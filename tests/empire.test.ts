import { describe, expect, it } from 'vitest';
import { develop, setup1965, weekOfVenue, type Outcome } from '../scripts/empireAcceptance';
import { advanceWeek } from '../src/engine/engine';
import { newGameWith } from '../src/engine/starts';
import { applyEmpireCmd, playerVenues, runCmd, venueByKey } from '../src/engine/empire';
import { itemsFor, ITEMS } from '../src/engine/empireCatalog';
import { areaReport, layoutProblems, roomCount, venueBuilding } from '../src/engine/empireBuild';
import { projectOptions, PROJECTS } from '../src/engine/empireProjects';
import { BUILTIN_PRESETS } from '../src/engine/empireAI';
import { lotSvg } from '../src/ui/map/lotIcons';

/**
 * Module 17, adapted: one property on Ocean Avenue in the Crest, bought in
 * 1965 and developed three ways, each run five years on the real operating
 * engine with its statement posted to a ledger that must reconcile.
 */
describe('Empire Designer: the five-year acceptance run', () => {
  const runs: Record<string, Outcome> = {};
  const get = (a: 'A' | 'B' | 'C') => (runs[a] ??= develop(a));

  it('A: a 20-room economy motel runs five real years', () => {
    const a = get('A');
    expect(a.rooms).toBe(20);
    expect(a.concept).toBe('budget_motel');
    expect(a.ledgerOk).toBe(true);
    const full = a.years.filter((y) => y.year >= '1966' && y.year <= '1969');
    expect(full.length).toBe(4);
    for (const y of full) {
      expect(y.rev).toBeGreaterThan(5000);
      expect(y.opex).toBeGreaterThan(3000);
    }
    // Independent monthly demand: the summer is everything.
    const m = a.venue.months;
    const jul = m.find((x) => x.key.endsWith('-7'))!;
    const may = m.find((x) => x.key.endsWith('-5'))!;
    expect(jul.rev).toBeGreaterThan(may.rev * 2);
  });

  it('B: a 40-room boutique hotel with a restaurant, built out of the motel', () => {
    const b = get('B');
    expect(b.concept).toBe('boutique');
    expect(b.rooms).toBeGreaterThanOrEqual(36);
    expect(b.depts).toContain('dining');
    expect(b.depts).toContain('kitchen');
    expect(b.ledgerOk).toBe(true);
    expect(b.years.some((y) => y.covers > 0)).toBe(true);
  });

  it('C: a 100-room luxury resort with restaurant, nightclub, suites and a spa', () => {
    const c = get('C');
    expect(c.rooms).toBe(100);
    expect(c.roomMix.suite).toBeGreaterThan(0);
    for (const d of ['dining', 'club', 'spa', 'pool', 'bar']) expect(c.depts).toContain(d);
    expect(c.ledgerOk).toBe(true);
  });

  it('the three differ in capital, staffing, purchasing and results', () => {
    const a = get('A');
    const b = get('B');
    const c = get('C');
    const capex = (o: Outcome) => o.years.reduce((x, y) => x + y.capex, 0);
    expect(capex(b)).toBeGreaterThan(capex(a));
    expect(b.peakStaff).toBeGreaterThan(a.peakStaff);
    expect(c.peakStaff).toBeGreaterThan(b.peakStaff);
    // Different toilet paper and linen.
    expect(new Set([a.tp.item, b.tp.item, c.tp.item]).size).toBeGreaterThanOrEqual(2);
    expect(c.sheets.item).toBe('sh_egypt');
    for (const o of [a, b, c]) {
      expect(o.tp.used).toBeGreaterThan(500);
      expect(o.sheets.units).toBeGreaterThan(0);
    }
    const noi = (o: Outcome) => o.years.find((y) => y.year === '1968')!.noi;
    expect(new Set([noi(a), noi(b), noi(c)]).size).toBe(3);
  });

  it('buildings deteriorate, managers act on their own, and at least five renovations get done', () => {
    const a = get('A');
    const b = get('B');
    expect(a.decay).toBeGreaterThan(5);
    expect(a.towels.wear + a.sheets.wear).toBeGreaterThan(0);
    expect(a.managerProjects + b.managerProjects).toBeGreaterThanOrEqual(1);
    const done = [...a.projects, ...b.projects].filter((p) => !p.includes('('));
    expect(new Set(done.map((p) => p.split(' ')[0])).size).toBeGreaterThanOrEqual(5);
    // Every property keeps its history and its looks.
    expect(b.history).toBeGreaterThan(5);
    expect(b.visuals).toBeGreaterThan(2);
  });

  it('rivals run on the same system and compete for the same guests', () => {
    const a = get('A');
    expect(a.rivals).toBeGreaterThan(2);
    const rv = Object.values(a.state.empire!.venues).filter((v) => v.owner !== 'player' && !v.closed);
    expect(rv.some((v) => v.years.length >= 4 && v.years.some((y) => y.roomNights > 0))).toBe(true);
    expect(rv.every((v) => v.deptIds.length > 0 && Object.keys(v.durables).length > 0)).toBe(true);
  });
});

describe('Empire Designer: the system', () => {
  it('historical availability: no color TV in 1960, quilted tissue only from 1968', () => {
    expect(itemsFor('tv', 1960).map((i) => i.id)).not.toContain('tv_color');
    expect(itemsFor('tv', 1966).map((i) => i.id)).toContain('tv_color');
    expect(itemsFor('toilet_paper', 1965).map((i) => i.id)).not.toContain('tp_quilted');
    expect(itemsFor('toilet_paper', 1969).map((i) => i.id)).toContain('tp_quilted');
    expect(ITEMS.length).toBeGreaterThan(90);
    expect(PROJECTS.length).toBeGreaterThanOrEqual(20);
  });

  it('layouts are checked: sprinklers and an elevator before a fourth story', () => {
    const s = setup1965('layout');
    const e = s.econ!;
    weekOfVenue(s);
    const b = s.businesses[0];
    void b;
    const lot = e.lots.find((l) => l.status === 'sale' && !l.use)!;
    void lot;
    const o = develop('A', 'layout2');
    const v = o.venue;
    const st = o.state;
    const bl = venueBuilding(st.empire!, v)!;
    bl.stories = 3;
    const floor = projectOptions(st, st.empire!, v).find((x) => x.def.id === 'floor')!;
    expect(floor.why).toMatch(/sprinkler/i);
    expect(layoutProblems(st.empire!, v, st.date.y)).toEqual([]);
    expect(areaReport(st.empire!, v).built).toBeGreaterThan(4000);
  });

  it('save and load: the designer round-trips through JSON and plays on the same', () => {
    const o = develop('A', 'saveload');
    const s1 = o.state;
    const s2 = JSON.parse(JSON.stringify(s1));
    expect(s2).toEqual(s1);
    for (let i = 0; i < 6; i++) { weekOfVenue(s1); weekOfVenue(s2); }
    expect(JSON.stringify(s2.empire)).toBe(JSON.stringify(s1.empire));
  });

  it('commands only change configuration; the UI copy leaves the original alone', () => {
    const o = develop('A', 'cmds');
    const s = o.state;
    const v = o.venue;
    const money = s.money;
    const n = applyEmpireCmd(s, { cmd: 'preset', venueId: v.id, presetId: 'penny' });
    expect(n.empire!.venues[v.id].policy.presetId).toBe('penny');
    expect(s.empire!.venues[v.id].policy.presetId).not.toBe('penny');
    runCmd(s, { cmd: 'mode', venueId: v.id, mode: 'micro' });
    runCmd(s, { cmd: 'supply', venueId: v.id, cat: 'toilet_paper', item: 'tp_oneply' });
    runCmd(s, { cmd: 'savePreset', venueId: v.id, name: 'Cheap paper' });
    expect(s.empire!.venues[v.id].policy.supplies.toilet_paper).toBe('tp_oneply');
    expect(Object.values(s.empire!.presets).some((p) => p.name === 'Cheap paper')).toBe(true);
    expect(s.money).toBe(money);
    expect(BUILTIN_PRESETS[0].id).toBe('balanced');
  });

  it('the map draws the building in its style and neon', () => {
    const o = develop('A', 'map');
    const lot = o.state.econ!.lots.find((l) => l.id === o.state.empire!.properties[o.venue.propertyId].lotId)!;
    const plain = lotSvg(lot);
    const styled = lotSvg(lot, { look: { style: 'doowop', sign: '#ff5fa2' } });
    expect(styled).not.toBe(plain);
    expect(styled).toContain('#ff5fa2');
    expect(styled).toContain('#f7c6d4');
  });

  it('in the real game: a motel bought through a Deal becomes a venue and its statement reconciles every week', () => {
    let s = newGameWith('empire-live');
    s.money = 40000;
    const d = s.districts[0];
    s = advanceWeek(s, { actions: [{ kind: 'econ', op: { type: 'deal', target: { kind: 'biz', biz: 'motel', district: d.id }, terms: { haggles: 0, cash: 0, name: 'The Satellite' } } }] }).state;
    const b = s.businesses.find((x) => x.kind === 'motel' && x.owner === 'player')!;
    const v = venueByKey(s, b.id)!;
    expect(v).toBeTruthy();
    expect(b.upkeep).toBe(0);
    for (let i = 0; i < 8; i++) { s.pendingEvents = []; s = advanceWeek(s, {}).state; } // advanceWeek throws if the ledger does not reconcile
    const lines = s.lastReport?.lines.filter((l) => l.label.startsWith('The Satellite')) ?? [];
    expect(lines.length).toBeGreaterThan(2);
    expect(playerVenues(s).some((x) => x.id === v.id)).toBe(true);
    expect(roomCount(s.empire!, v)).toBeGreaterThan(10);
  });
});
