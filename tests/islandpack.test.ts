import { existsSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { REQUIRED_FILES, validatePackDir } from '../scripts/cityimport/build/schema';
import { IMPORTED_LAYER_VERSION, type ImportedLayer } from '../src/engine/importedCity';
import { WILDWOOD_PACKAGE as PKG } from '../src/worldpack/cities';
import { frameFns } from '../src/engine/cityPackage';

const LAYER = 'public/geo/imported-wildwood-island.json';
const PACK = 'citydata/wildwood/packs/island';
const fullPack = REQUIRED_FILES.every((f) => existsSync(`${PACK}/${f}`));

describe('the island import', () => {
  it('the game layer: schema, the whole island, and a sane size (lazy, <= 1.5 MB gzipped)', () => {
    const raw = readFileSync(LAYER);
    const gz = gzipSync(raw, { level: 9 }).length;
    expect(gz).toBeLessThanOrEqual(1.5 * 1024 * 1024);
    const l = JSON.parse(raw.toString()) as ImportedLayer;
    expect(l.v).toBe(IMPORTED_LAYER_VERSION);
    expect(l.packId).toBe('wildwood/island');
    expect(l.buildings.length).toBeGreaterThan(10000);
    expect(l.parcels.length).toBeGreaterThan(20000);
    expect(l.blocks.length).toBeGreaterThan(600);
    expect(l.nav.nodes.length / 2).toBeGreaterThan(20000);
    for (const b of l.buildings.slice(0, 500)) { expect(b.pts.length % 2).toBe(0); expect(b.pts.length).toBeGreaterThanOrEqual(6); }
    // It sits on the game's island: the frame's u runs the island's length.
    expect(l.bounds.u1 - l.bounds.u0).toBeGreaterThan(7000);
  });

  it('the game layer agrees with the game\'s streets (the grid is measured from the same data)', () => {
    const l = JSON.parse(readFileSync(LAYER, 'utf8')) as ImportedLayer;
    expect(l.fit.rmsBefore).toBeLessThan(10);
  });

  it.skipIf(!fullPack)('the full pack validates (when built locally: its bulky layers are not in git)', () => {
    expect(validatePackDir(PACK)).toEqual([]);
  });

  it('the pack summary records the counts, the YR_CONSTR rule and the Sanborn coverage', () => {
    const c = JSON.parse(readFileSync(`${PACK}/city.json`, 'utf8'));
    expect(c.counts.parcelsInput).toBe(21351);
    expect(c.counts.buildingsOsm).toBeGreaterThan(2900);
    expect(c.counts.historical['osm:absent']).toBeGreaterThan(0);
    expect(c.sanborn.georef.registered.length).toBeGreaterThanOrEqual(20);
    expect(c.sanborn.georef.correctionsDerived).toBe(0);
    const rq = JSON.parse(readFileSync(`${PACK}/review-queue.json`, 'utf8'));
    expect(rq.items.some((i: { kind: string }) => i.kind === 'sanborn-compare')).toBe(true);
  });
});

describe('the 1950 Sanborn sheets', () => {
  const G = JSON.parse(readFileSync('citydata/wildwood/evidence/sanborn-1950-georef.json', 'utf8'));
  const game = JSON.parse(readFileSync('public/geo/sanborn-1950-wildwood.json', 'utf8'));
  it('registered sheets have 3+ control points found in OSM and residuals within tolerance', () => {
    const reg = G.sheets.filter((s: { status: string }) => s.status === 'registered');
    expect(reg.length).toBeGreaterThanOrEqual(20);
    for (const s of reg) {
      expect(s.points.filter((p: { found: boolean }) => p.found).length, s.sheet).toBeGreaterThanOrEqual(3);
      expect(s.rmsM, s.sheet).toBeLessThanOrEqual(s.kind === 'keymap' ? 60 : 15);
      for (const p of s.points) if (p.found) expect(typeof p.residualM).toBe('number');
    }
    for (const s of G.sheets.filter((x: { status: string }) => x.status !== 'registered')) expect(s.why, s.sheet).toBeTruthy();
  });

  it('the game\'s matrices put a sheet\'s control points on their crossings (within 20 m)', () => {
    const f = frameFns(PKG.geography.frame!);
    for (const g of game.sheets) {
      const s = G.sheets.find((x: { sheet: string }) => x.sheet === g.id);
      const [a, b, c, d, e, ff] = g.matrix;
      for (const p of s.points.filter((x: { found: boolean }) => x.found)) {
        const u = a * p.px[0] + c * p.px[1] + e; const mv = b * p.px[0] + d * p.px[1] + ff;
        const [ru, rv] = f.toUv(p.lonLat);
        expect(Math.hypot(u - ru, -mv - rv), `${g.id} ${p.a}`).toBeLessThan(g.kind === 'keymap' ? 200 : 20); // the key map spans 7 km: one affine in the curved frame is loose there (it is not drawn)
      }
    }
  });

  it('bundles at most a few small images (<= 1 MB in all); the rest load by file name', () => {
    const small = game.sheets.filter((s: { small?: string }) => s.small);
    expect(small.length).toBeLessThanOrEqual(6);
    let bytes = 0;
    for (const s of small) bytes += readFileSync(`public/sanborn/${s.small}`).length;
    expect(bytes).toBeLessThanOrEqual(1024 * 1024);
  });
});
