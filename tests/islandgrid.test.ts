import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { frameFns } from '../src/engine/cityPackage';
import { WILDWOOD_PACKAGE as PKG } from '../src/worldpack/cities';
import { AVENUES, CROSS, CROSS_BY_IDX, CROSS_BY_NAME, HOODS, OUTLINES, aveV, frontV } from '../src/engine/hoodData';
import { extraSlots, fillCandidates, placeAll } from '../src/engine/hoodGeo';
import { legacyGeoToNew, legacyToNew, migrateIslandGrid } from '../src/engine/legacyGrid';
import { newGame } from '../src/engine/newGame';
import { upgradeSave } from '../src/engine/upgradeSave';
import { addPlaceLive } from '../src/engine/addPlace';
import { regionAt, wildwoodShapes } from '../src/ui/hood/wildwoodRealm';
import { PLAN_AREAS } from '../src/ui/hood/PlanView';

const ORDER = JSON.parse(readFileSync('citydata/wildwood/evidence/osm-street-order.json', 'utf8')) as { streets: { name: string; u: number; town: string }[] };
const BEFORE = JSON.parse(readFileSync('tests/fixtures/wildwood-ids-before-grid.json', 'utf8')) as Record<string, string[]>;

describe('the island grid follows the real streets (OpenStreetMap)', () => {
  it('every named cross street is on the grid, in the real order, at its measured u', () => {
    const shown = CROSS.filter((c) => !c.hidden);
    expect(shown.length).toBe(ORDER.streets.length);
    expect(shown.map((c) => c.n)).toEqual([...ORDER.streets].sort((a, b) => a.u - b.u).map((s) => s.name));
    for (const s of ORDER.streets) expect(Math.abs(CROSS_BY_NAME[s.name].u - s.u), s.name).toBeLessThan(2);
  });

  it('known real orders hold (the old grid had these reversed)', () => {
    const u = (n: string) => CROSS_BY_NAME[n].u;
    const chain = (names: string[]) => { for (let i = 1; i < names.length; i++) expect(u(names[i]), `${names[i - 1]} < ${names[i]}`).toBeGreaterThan(u(names[i - 1])); };
    chain(['Jefferson Ave', 'Trenton Ave', 'Toledo Ave', 'Atlanta Ave', 'Rambler Rd', 'Cresse Ave']);
    chain(['Cresse Ave', 'Hildreth Ave', 'Rio Grande Ave', 'Taylor Ave', 'Montgomery Ave', 'Youngs Ave', 'Spicer Ave', 'Lincoln Ave', 'Schellenger Ave', 'Oak Ave', 'Wildwood Ave', 'Pine Ave', 'Maple Ave', 'Glenwood Ave', 'Magnolia Ave', 'Poplar Ave', 'Juniper Ave', '26th Ave', '25th Ave', '16th Ave', '1st Ave']);
    // Streets the old grid lacked.
    for (const n of ['Maple Ave', 'Poplar Ave', 'Juniper Ave', 'Glenwood Ave', 'Baker Ave', 'Chestnut Ave', 'Walnut Ave', 'Spruce Ave']) expect(CROSS_BY_NAME[n], n).toBeDefined();
    for (const id of ['ny', 'ar', 'hu', 'de']) expect(AVENUES.some((a) => a.id === id), id).toBe(true);
    // Avenues inland in their real order, mid-Wildwood.
    const m = u('Schellenger Ave');
    const vs = (['oc', 'at', 'pa', 'nj', 'ar', 'pk', 'hu'] as const).map((id) => aveV(id, m));
    expect([...vs].sort((a, b) => a - b)).toEqual(vs);
  });

  it('the frame converts both ways exactly, and the Boardwalk is its v = 0 in Wildwood', () => {
    const f = frameFns(PKG.geography.frame!);
    for (const [u, v] of [[100, 0], [3500, 400], [5600, -300], [7600, 900], [4000, 2500], [-500, 100], [9000, -200]]) {
      const [uu, vv] = f.toUv(f.toLngLat(u, v));
      expect(Math.abs(uu - u) + Math.abs(vv - v), `${u},${v}`).toBeLessThan(0.01);
    }
    expect(Math.abs(frontV(CROSS_BY_NAME['Schellenger Ave'].u))).toBeLessThan(20);
  });

  it('outlines: the island, the town, West Wildwood and the districts', () => {
    for (const k of ['land', 'town', 'westww']) expect(OUTLINES[k]?.length, k).toBeGreaterThan(0);
    for (const d of PKG.districts) expect(d.polygon.length, d.id).toBeGreaterThanOrEqual(4);
  });
});

describe('every record keeps its id', () => {
  it('no id of the old package is lost', () => {
    for (const k of ['streets', 'districts', 'parcels', 'businesses', 'landmarks', 'institutions', 'placements', 'routes'] as const) {
      const now = new Set((PKG[k] as { id: string }[]).map((x) => x.id));
      for (const id of BEFORE[k]) expect(now.has(id), `${k} ${id}`).toBe(true);
    }
  });

  it('generated lot ids keep naming the same street (stable street indexes)', () => {
    BEFORE.crossByIndex.forEach((name, i) => expect(CROSS_BY_IDX[i]?.n, `idx ${i}`).toBe(name));
    // And every generated candidate decodes to its street.
    for (const c of fillCandidates()) { const i = Number(c.id.split('.')[3]); expect(CROSS_BY_IDX[i], c.id).toBeDefined(); }
  });

  it('every 1960 record and house lot has ground on the real grid', () => {
    const s = newGame('grid-ground');
    const placed = placeAll(s);
    for (const l of s.econ!.lots) if (!l.id.startsWith('biz:')) expect(placed.has(l.id) || !['boardwalk', 'pacific', 'downtown', 'docks', 'crest', 'north', 'causeway', 'westww', 'piers'].includes(l.zone), l.id).toBe(true);
    const ex = extraSlots({});
    for (const p of PKG.parcels) if (p.pos && p.market) expect(ex.has(p.id), p.id).toBe(true);
  });
});

describe('old saves', () => {
  it('a save with a place added on the old grid loads with the same ids, its place moved by its streets, once', () => {
    const s = newGame('grid-save');
    // A place added before the grid fix, at the old grid's Pacific Ave by Spicer Ave (u 3600, v 345).
    const pc = { id: 'pc:test-old', districtId: 'd:pacific', zone: 'pacific', address: 'Pacific Ave at Spicer Ave', pos: { u: 3600, v: 345 }, market: { status: 'private' as const, owner: 'private' }, evidence: { confidence: 'invented' as const, source: 'test' } };
    const pl = { id: 'pc:test-old', building: 'pc:test-old', parcelId: 'pc:test-old', name: 'Test', kind: 'bar', address: 'Pacific Ave at Spicer Ave', geo: [-74.809, 38.9915] as [number, number], years: {}, rotation: 0, footprint: { w: 10, d: 10 }, art: {}, evidence: { confidence: 'invented' as const, source: 'test' } };
    addPlaceLive(s, 'wildwood', { buildingId: 'pc:test-old', parcel: pc, placement: pl });
    delete s.islandGrid; // as a save from before the fix
    const lots = s.econ!.lots.map((l) => l.id).sort();
    const up = upgradeSave(JSON.parse(JSON.stringify(s)));
    expect(up.econ!.lots.map((l) => l.id).sort()).toEqual(lots);
    const moved = up.addedPlaces!.wildwood.parcels[0];
    expect(moved.id).toBe('pc:test-old');
    const want = legacyToNew(3600, 345);
    expect(moved.pos).toEqual({ u: Math.round(want.u), v: Math.round(want.v) });
    // Spicer Ave block on the real grid, by Pacific Avenue.
    expect(moved.pos!.u).toBeGreaterThanOrEqual(CROSS_BY_NAME['Spicer Ave'].u);
    expect(Math.abs(moved.pos!.v - aveV('pa', moved.pos!.u))).toBeLessThan(60);
    expect(up.addedPlaces!.wildwood.placements[0].geo).toEqual(legacyGeoToNew(pl.geo));
    expect(up.islandGrid).toBe(2);
    // Loading again moves nothing.
    const again = upgradeSave(JSON.parse(JSON.stringify(up)));
    expect(JSON.stringify(again.addedPlaces)).toBe(JSON.stringify(up.addedPlaces));
    expect(migrateIslandGrid(again)).toBe(0);
  });
});

describe('the political map follows the districts', () => {
  it('each district\'s outline is its region on the realm map', () => {
    for (const h of HOODS) {
      const rings = OUTLINES[`d:${h.id}`] ?? [];
      expect(rings.length, h.id).toBeGreaterThan(0);
      const r = rings[0];
      const xs = r.map((p) => p[0]); const ys = r.map((p) => p[1]);
      let n = 0; let ok = 0;
      for (let u = Math.min(...xs); u <= Math.max(...xs); u += 37) for (let v = Math.min(...ys); v <= Math.max(...ys); v += 23) {
        let inside = false;
        for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i][1] > v) !== (r[j][1] > v) && u < ((r[j][0] - r[i][0]) * (v - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) inside = !inside;
        if (!inside) continue;
        n++;
        if (regionAt(u, v) === (h.district ?? h.id)) ok++;
      }
      expect(n, h.id).toBeGreaterThan(0);
      expect(ok / n, h.id).toBeGreaterThan(0.95);
    }
  });

  it('the realm map draws a region for every district', () => {
    const shapes = wildwoodShapes(newGame('grid-realm'), 'uv');
    for (const h of HOODS) expect(shapes.has(h.district ?? h.id), h.id).toBe(true);
  });

  it('the block map\'s areas lie on the island', () => {
    for (const a of PLAN_AREAS) expect(a.u1 - a.u0, a.id).toBeLessThan(900);
  });
});
