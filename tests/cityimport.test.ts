import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { geodesicDistance, localCrs, type XY } from '../scripts/cityimport/lib/crs';
import { area, intersectionArea } from '../scripts/cityimport/lib/geom';
import { buildBlocks } from '../scripts/cityimport/build/blocks';
import { matchBuildingsToParcels } from '../scripts/cityimport/build/match';
import { dedupeParcels, storiesOf, materialOf, landDims } from '../scripts/cityimport/build/parcels';
import { dedupePois } from '../scripts/cityimport/build/businesses';
import { buildingYearRuling, yrConstrRule } from '../scripts/cityimport/build/historical';
import { buildNav } from '../scripts/cityimport/build/nav';
import { REQUIRED_FILES, validatePackDir } from '../scripts/cityimport/build/schema';
import { parseAddress, sameAddress, streetKey } from '../scripts/cityimport/lib/address';
import { planSheets, type IndexDoc } from '../scripts/cityimport/build/sanborn';
import { matchCandidates, parseListings } from '../scripts/cityimport/ocr/directory';
import { fetchCached, SourceUnreachable } from '../scripts/cityimport/lib/http';
import { arcgisFetchAll, checkFields } from '../scripts/cityimport/fetch/arcgis';
import { NJ_PARCEL_FORBIDDEN } from '../scripts/cityimport/config/cities';
import { parseTsv } from '../scripts/cityimport/ocr/ocr';
import {
  assignImportedOccupant, components, drawClass, editorOverride, layerForYear, navGraph, shortestPath, walkToEntrance,
  type HistOverride, type ImportedLayer, type LayerBuilding,
} from '../src/engine/importedCity';
import { newGame } from '../src/engine/newGame';
import { upgradeSave } from '../src/engine/upgradeSave';

const ROOT = join(__dirname, '..');
const PACK = join(ROOT, 'citydata', 'wildwood', 'packs', 'test-blocks');
const LAYER = join(ROOT, 'public', 'geo', 'imported-wildwood-test-blocks.json');

describe('CRS', () => {
  const crs = localCrs({ lon: -74.8145, lat: 38.9922 });
  it('round-trips lon/lat ↔ local metres to well under a millimetre, 10 km out', () => {
    for (const [lon, lat] of [[-74.8145, 38.9922], [-74.70, 39.05], [-74.93, 38.92], [-74.8105, 38.995]]) {
      const [x, y] = crs.forward(lon, lat);
      const [lo, la] = crs.inverse(x, y);
      expect(Math.abs(lo - lon) * 111000 * Math.cos((lat * Math.PI) / 180)).toBeLessThan(1e-3);
      expect(Math.abs(la - lat) * 111000).toBeLessThan(1e-3);
    }
  });
  it('local distances match ellipsoidal distances (scale) to a few ppm', () => {
    const a: [number, number] = [-74.8185, 38.9895], b: [number, number] = [-74.8105, 38.995];
    const g = geodesicDistance(a, b);
    const [ax, ay] = crs.forward(...a), [bx, by] = crs.forward(...b);
    expect(Math.abs(Math.hypot(bx - ax, by - ay) - g) / g).toBeLessThan(5e-6);
    // One degree of latitude at 39°N is about 111,035 m.
    expect(geodesicDistance([-74.8, 38.5], [-74.8, 39.5])).toBeGreaterThan(111000);
    expect(geodesicDistance([-74.8, 38.5], [-74.8, 39.5])).toBeLessThan(111070);
  });
  it('original lon/lat, local metres and game coordinates are stored separately in the pack', () => {
    const b = JSON.parse(readFileSync(join(PACK, 'buildings.geojson'), 'utf8'));
    const f = b.features[0];
    expect(Math.abs(f.geometry.coordinates[0][0][0])).toBeGreaterThan(70);
    expect(f.properties.local[0]).not.toEqual(f.geometry.coordinates[0][0]);
    expect(f.properties.game[0]).not.toEqual(f.properties.local[0]);
  });
});

describe('blocks from the street network', () => {
  it('a 3 × 3 street grid makes 4 blocks; a dead end is pruned', () => {
    // Streets every 100 m: three east-west, three north-south; node ids at the crossings are shared.
    const id = (i: number, j: number) => 1000 + i * 10 + j;
    const lines = [];
    for (let j = 0; j < 3; j++) lines.push({ id: `ew${j}`, nodeIds: [0, 1, 2].map((i) => id(i, j)), pts: [0, 1, 2].map((i) => [i * 100, j * 100] as XY) });
    for (let i = 0; i < 3; i++) lines.push({ id: `ns${i}`, nodeIds: [0, 1, 2].map((j) => id(i, j)), pts: [0, 1, 2].map((j) => [i * 100, j * 100] as XY) });
    lines.push({ id: 'deadend', nodeIds: [id(1, 1), 9999], pts: [[100, 100], [140, 140]] as XY[] });
    const r = buildBlocks(lines);
    expect(r.blocks).toHaveLength(4);
    for (const b of r.blocks) expect(b.area).toBeCloseTo(10000, 0);
    expect(r.pruned).toBe(1);
    expect(new Set(r.blocks.map((b) => b.id)).size).toBe(4);
  });
  it('the Wildwood test pack has blocks that agree with the tax blocks', () => {
    const c = JSON.parse(readFileSync(join(PACK, 'city.json'), 'utf8'));
    expect(c.counts.blocks).toBeGreaterThan(10);
    expect(c.blocks.taxBlockAgreement.median).toBeGreaterThanOrEqual(0.9);
  });
});

describe('buildings ↔ parcels', () => {
  const sq = (x0: number, y0: number, w: number, h: number): XY[] => [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h], [x0, y0]];
  const parcels = [{ id: 'P1', parts: [sq(0, 0, 10, 30)] }, { id: 'P2', parts: [sq(10, 0, 10, 30)] }, { id: 'P3', parts: [sq(20, 0, 10, 30)] }];
  it('one building across two parcels (one-to-many), two buildings on one parcel (many-to-one), one on none', () => {
    const r = matchBuildingsToParcels([
      { id: 'motel', ring: sq(2, 2, 16, 20) },
      { id: 'house', ring: sq(22, 2, 6, 10) },
      { id: 'garage', ring: sq(22, 20, 6, 6) },
      { id: 'pier', ring: sq(100, 100, 10, 10) },
    ], parcels);
    const by = Object.fromEntries(r.buildings.map((m) => [m.buildingId, m]));
    expect(by.motel.relation).toBe('spans-parcels');
    expect(by.motel.links.map((l) => l.parcelId).sort()).toEqual(['P1', 'P2']);
    expect(by.motel.ambiguous).toBe(true);
    expect(by.house.relation).toBe('one-parcel');
    expect(r.byParcel.get('P3')).toEqual(['house', 'garage']);
    expect(by.pier.relation).toBe('no-parcel');
    expect(r.stats.parcelsWithMany).toBe(1);
  });
  it('overlap areas are exact for convex shapes', () => {
    expect(intersectionArea(sq(0, 0, 10, 10), sq(5, 5, 10, 10))).toBeCloseTo(25, 6);
    expect(area(sq(0, 0, 10, 30))).toBe(300);
  });
});

describe('dedupe keeps every source id', () => {
  const f = (oid: number, pin: string | null, ring: number[][], props: Record<string, unknown> = {}) => ({ type: 'Feature' as const, id: oid, geometry: { type: 'Polygon', coordinates: [ring] }, properties: { OBJECTID: oid, PAMS_PIN: pin, ...props } });
  const r1 = [[0, 0], [1, 0], [1, 1], [0, 0]];
  const r2 = [[2, 2], [3, 2], [3, 3], [2, 2]];
  it('exact duplicates merge; different outlines under one PIN become parts; conflicts are reported', () => {
    const d = dedupeParcels([f(1, 'A', r1, { PROP_LOC: '1 X AVE', YR_CONSTR: 1920 }), f(2, 'A', r1, { PROP_LOC: '1 X AVE' }), f(3, 'B', r1), f(4, 'B', r2), f(5, 'C', r1, { YR_CONSTR: 1950 }), f(6, 'C', r1, { YR_CONSTR: 1951 }), f(7, null, r2)]);
    const by = Object.fromEntries(d.parcels.map((p) => [p.id, p]));
    expect(by['njgin:A'].sourceIds).toEqual(['njgin:OBJECTID/1', 'njgin:OBJECTID/2']);
    expect(by['njgin:A'].dedupe).toBe('exact-duplicates-merged');
    expect(by['njgin:A'].yrConstr).toBe(1920);
    expect(by['njgin:B'].parts).toHaveLength(2);
    expect(d.issues.some((i) => i.kind === 'attribute-conflict' && i.pin === 'C')).toBe(true);
    expect(d.parcels).toHaveLength(4);
  });
  it('a business mapped twice (area and node) is one record with both OSM ids', () => {
    const d = dedupePois([
      { sourceId: 'osm:node/1', tags: { name: 'Island Bowl', leisure: 'bowling_alley', 'addr:housenumber': '3401' }, at: [10, 10], lonLat: [0, 0] },
      { sourceId: 'osm:way/2', tags: { name: 'Island Bowl', leisure: 'bowling_alley' }, at: [12, 9], ring: [[0, 0], [20, 0], [20, 20], [0, 0]], lonLat: [0, 0] },
      { sourceId: 'osm:node/3', tags: { name: 'Sharp Cleaners', shop: 'dry_cleaning' }, at: [11, 11], lonLat: [0, 0] },
    ]);
    expect(d.kept).toHaveLength(2);
    expect(d.mergedIds.get('osm:way/2')).toEqual(['osm:way/2', 'osm:node/1']);
    expect(d.kept.find((k) => k.sourceId === 'osm:way/2')!.tags['addr:housenumber']).toBe('3401');
  });
  it('the pack keeps every input parcel id', () => {
    const p = JSON.parse(readFileSync(join(PACK, 'parcels.geojson'), 'utf8'));
    const c = JSON.parse(readFileSync(join(PACK, 'city.json'), 'utf8'));
    const ids = p.features.flatMap((x: { properties: { sourceIds: string[] } }) => x.properties.sourceIds);
    expect(ids.length).toBe(c.counts.parcelsInput);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('YR_CONSTR rules for 1960', () => {
  it('≤ 1960 likely existed (medium), > 1960 removed for 1960 (medium), missing/0 unknown', () => {
    expect(yrConstrRule(1920, 1960)).toMatchObject({ status: 'likely-existed', yr: 1920 });
    expect(yrConstrRule(1960, 1960).status).toBe('likely-existed');
    expect(yrConstrRule(1961, 1960)).toMatchObject({ status: 'absent', yr: 1961 });
    expect(yrConstrRule(1961, 1960).evidence[0].confidence).toBe('medium');
    expect(yrConstrRule(null, 1960).status).toBe('unknown');
    expect(yrConstrRule(0, 1960).status).toBe('unknown');
  });
  it('a building over parcels that disagree is flagged', () => {
    const r = buildingYearRuling([{ parcelId: 'a', ofBuilding: 0.5 }, { parcelId: 'b', ofBuilding: 0.45 }], (id) => (id === 'a' ? 1925 : 1978), 1960);
    expect(r.status).toBe('likely-existed');
    expect(r.conflict).toMatch(/b/);
  });
  it('the pack marks every OSM building with a status and no building as verified', () => {
    const b = JSON.parse(readFileSync(join(PACK, 'buildings.geojson'), 'utf8'));
    for (const f of b.features) {
      expect(['likely-existed', 'absent', 'unknown']).toContain(f.properties.historical.status);
      expect(f.properties.eligibleForHistoricalGame).toBe(false);
      if (f.properties.historical.status === 'absent') expect(f.properties.historical.yrConstr).toBeGreaterThan(1960);
    }
  });
  it('assessor descriptions', () => {
    expect(storiesOf('2S-F')).toBe(2);
    expect(storiesOf('3.5S-F')).toBe(3.5);
    expect(materialOf('2S-CB')).toBe('concrete-block');
    expect(materialOf('2 SF')).toBe('frame');
    expect(landDims('30X90')).toEqual([30, 90]);
  });
});

describe('pack schema', () => {
  it('the Wildwood test pack is valid and has every required file', () => {
    for (const f of REQUIRED_FILES) expect(existsSync(join(PACK, f))).toBe(true);
    expect(validatePackDir(PACK)).toEqual([]);
  });
  it('a broken pack is rejected: missing source ids, a forbidden owner field, a bad status', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pack-'));
    for (const f of REQUIRED_FILES) writeFileSync(join(dir, f), readFileSync(join(PACK, f)));
    const roads = JSON.parse(readFileSync(join(dir, 'roads.geojson'), 'utf8'));
    delete roads.features[0].properties.sourceIds;
    roads.features[1].properties.historical.status = 'probably';
    roads.features[2].properties.OWNER_NAME = 'someone';
    writeFileSync(join(dir, 'roads.geojson'), JSON.stringify(roads));
    const errs = validatePackDir(dir);
    expect(errs.some((e) => /no sourceIds/.test(e))).toBe(true);
    expect(errs.some((e) => /historical status/.test(e))).toBe(true);
    expect(errs.some((e) => /OWNER_NAME/.test(e))).toBe(true);
  });
  it('no owner, mailing or sale fields anywhere in the raw data or the pack', () => {
    for (const f of [join(ROOT, 'citydata/wildwood/raw/njgin-parcels/test-blocks.geojson'), join(PACK, 'parcels.geojson'), LAYER]) {
      const t = readFileSync(f, 'utf8');
      for (const k of NJ_PARCEL_FORBIDDEN) expect(t.includes(`"${k}"`)).toBe(false);
    }
  });
});

describe('navigation', () => {
  it('connects an entrance to the street, but never through a wall', () => {
    const street = { id: 's', nodeIds: [1, 2], pts: [[0, 0], [100, 0]] as XY[], cls: 'street' as const };
    const wall: XY[] = [[40, 5], [60, 5], [60, 15], [40, 15], [40, 5]];
    const r = buildNav([street], [{ id: 'front', at: [20, 8] }, { id: 'behind', at: [50, 20] }], { obstacles: [wall], maxConnector: 30 });
    expect(r.entranceNode.has('front')).toBe(true);
    // Straight down crosses the wall; the next nearest point clear of it is taken, else it stays unconnected.
    const g = navGraph({ nodes: r.nodes.flat(), edges: r.edges.flat() });
    if (r.entranceNode.has('behind')) {
      const [ex, ey] = r.nodes[r.entranceNode.get('behind')!];
      const other = g.adj[r.entranceNode.get('behind')!][0].to;
      const [ox, oy] = r.nodes[other];
      expect(ox < 40 || ox > 60 || (ex === ox && ey === oy)).toBe(true);
    } else expect(r.unconnected.get('behind')).toMatch(/building|water|within/);
    const p = shortestPath(g, r.entranceNode.get('front')!, 0);
    expect(p).toBeDefined();
  });
  it('every connected entrance in the game layer reaches the main street network', () => {
    const layer = JSON.parse(readFileSync(LAYER, 'utf8')) as ImportedLayer;
    const g = navGraph(layer.nav);
    const comp = components(g);
    const size = new Map<number, number>();
    for (const c of comp) size.set(c, (size.get(c) ?? 0) + 1);
    const main = [...size].sort((a, b) => b[1] - a[1])[0][0];
    const ents = layer.buildings.flatMap((b) => b.entrances);
    const connected = ents.filter((e) => e.node >= 0);
    expect(connected.length / ents.length).toBeGreaterThan(0.9);
    const offMain = connected.filter((e) => comp[e.node] !== main);
    expect(offMain.length / connected.length).toBeLessThan(0.05);
    // A walk to one entrance from the area's corner.
    const e = connected.find((x) => comp[x.node] === main)!;
    const w = walkToEntrance(layer, e.node, [layer.bounds.u0, layer.bounds.v0]);
    expect(w && w.length).toBeGreaterThan(0);
  });
  it('the game layer uses the pack\'s building ids', () => {
    const layer = JSON.parse(readFileSync(LAYER, 'utf8')) as ImportedLayer;
    const b = JSON.parse(readFileSync(join(PACK, 'buildings.geojson'), 'utf8'));
    expect(layer.buildings.map((x) => x.id).sort()).toEqual(b.features.map((f: { id: string }) => f.id).sort());
  });
});

describe('historical overrides and the 1960 view', () => {
  const bld = (id: string, over: Partial<LayerBuilding>): LayerBuilding => ({ id, src: 'osm', pts: [0, 0, 10, 0, 10, 10, 0, 10], h: 7, hGen: true, roof: 'gable', roofGen: true, tpl: 'generic', parcels: [], status: 'unknown', entrances: [], ...over });
  const layer = { targetYear: 1960, buildings: [bld('old', { status: 'likely-existed', yr: 1920 }), bld('new', { status: 'absent', yr: 1978 }), bld('mystery', {})], businesses: [{ id: 'wawa', name: 'Wawa', cat: 'shop: convenience', u: 5, v: 5, srcIds: ['osm:way/1'], status: 'unverified' as const }] };
  it('built later is hidden in 1960 and shown after; unknowns stay as tasks; modern businesses hidden', () => {
    const v = layerForYear(layer, [], 1960);
    const by = Object.fromEntries(v.buildings.map((b) => [b.id, b]));
    expect(by.new.shown).toBe(false);
    expect(drawClass(by.new, 'eligible')).toBe('hidden');
    expect(drawClass(by.new, 'all')).toBe('ghost');
    expect(drawClass(by.old, 'eligible')).toBe('provisional');
    expect(drawClass(by.mystery, 'eligible')).toBe('task');
    expect(layerForYear(layer, [], 1980).buildings.find((b) => b.id === 'new')!.shown).toBe(true);
    expect(v.businesses[0].shown).toBe(false);
    expect(layerForYear(layer, [], 1960, { showUnverified: true }).businesses[0].shown).toBe(true);
  });
  it('editor corrections: verify, remove, move, rename and add a period business with evidence', () => {
    const now = '2026-10-28T00:00:00.000Z';
    const ev = { year: 1950, source: 'Sanborn NJ Coast Vol. 4 (1950) sheet 63B', confidence: 'high' as const, note: 'on the sheet' };
    const ovs: HistOverride[] = [
      editorOverride({ layer: 'buildings', id: 'mystery' }, 'verify', { evidence: ev }, '', now),
      editorOverride({ layer: 'buildings', id: 'old' }, 'remove', { evidence: ev }, '', now),
      editorOverride({ layer: 'buildings', id: 'mystery' }, 'move', { at: { u: 100, v: 50 } }, 'moved', now),
      editorOverride({ layer: 'businesses', id: 'wawa' }, 'rename', { name: 'Kohl\'s Market' }, 'renamed', now),
      editorOverride({ layer: 'businesses', id: 'biz:dir:1' }, 'add', { name: 'The Rainbow Club', category: 'club', at: { u: 3, v: 3 }, years: { from: 1955, to: 1965 }, evidence: ev }, '', now),
    ];
    const v = layerForYear(layer, ovs, 1960);
    const by = Object.fromEntries(v.buildings.map((b) => [b.id, b]));
    expect(by.mystery.status).toBe('verified');
    expect(drawClass(by.mystery, 'eligible')).toBe('verified');
    expect(by.mystery.pts[0]).toBeCloseTo(95, 5);
    expect(by.old.shown).toBe(false);
    expect(by.mystery.evidence[0].source).toMatch(/Sanborn/);
    expect(v.businesses.find((b) => b.id === 'wawa')!.name).toBe('Kohl\'s Market');
    const add = v.businesses.find((b) => b.id === 'biz:dir:1')!;
    expect(add.shown).toBe(true);
    expect(layerForYear(layer, ovs, 1970).businesses.find((b) => b.id === 'biz:dir:1')!.shown).toBe(false);
  });
  it('the pipeline\'s YR_CONSTR proposals carry year, source and confidence', () => {
    const o = JSON.parse(readFileSync(join(PACK, 'historical-overrides.json'), 'utf8'));
    expect(o.overrides.length).toBeGreaterThan(100);
    for (const x of o.overrides) {
      expect(x.status).toBe('proposed');
      expect(x.evidence.confidence).toBe('medium');
      expect(typeof x.evidence.year).toBe('number');
      expect(x.evidence.source).toMatch(/YR_CONSTR/);
    }
  });
});

describe('save and load', () => {
  it('a fictional occupant round-trips; current saves load unchanged; a new game has none', () => {
    const s = newGame('cityimport-save');
    expect(s.importedOccupants).toBeUndefined();
    const json0 = JSON.stringify(s);
    expect(JSON.stringify(upgradeSave(JSON.parse(json0)))).toBe(json0);
    const t = assignImportedOccupant(s, 'osm:way/1359287902', 'The Blue Note', 'social club');
    expect(s.importedOccupants).toBeUndefined();
    expect(t.importedOccupants!['osm:way/1359287902']).toMatchObject({ name: 'The Blue Note', since: 1960, fictional: true });
    const json = JSON.stringify(t);
    const back = upgradeSave(JSON.parse(json));
    expect(JSON.stringify(back)).toBe(json);
    expect(assignImportedOccupant(back, 'osm:way/1359287902', '', 'x').importedOccupants).toBeUndefined();
  });
});

describe('addresses, the Sanborn index and directories', () => {
  it('normalises OSM, assessor and directory street names alike', () => {
    expect(streetKey('West Pine Avenue')).toBe(streetKey('W PINE AVE'));
    expect(streetKey('Park Boulevard')).toBe('park blvd');
    expect(sameAddress(parseAddress('116 W Poplar Ave')!, parseAddress('115-117 W POPLAR AVE')!)).toBe(true);
    expect(sameAddress(parseAddress('116 E Poplar Ave')!, parseAddress('116 W POPLAR AVE')!)).toBe(false);
    expect(sameAddress(parseAddress('3401 New Jersey Avenue')!, parseAddress('3401 NEW JERSEY AVE')!)).toBe(true);
  });
  it('plans sheets only from the transcribed index; uncovered addresses stay uncovered', () => {
    const doc = JSON.parse(readFileSync(join(ROOT, 'citydata/wildwood/evidence/sanborn-1950-additional-index.json'), 'utf8')) as IndexDoc;
    const p = planSheets(doc, ['550 W PINE AVE', '126 W PINE AVE', '210 W 21ST AVE']);
    expect(p.covered.find((c) => c.sheet === '63B')!.addresses).toEqual(['550 W PINE AVE']);
    expect(p.covered.find((c) => c.sheet === '27')!.addresses).toEqual(['210 W 21ST AVE']);
    expect(p.uncovered).toEqual([expect.objectContaining({ street: 'Pine Ave', from: 126 })]);
    expect(p.neighbours.map((n) => n.sheet)).toContain('63B');
  });
  it('directory OCR lines become candidates; uncertain ones go to review (synthetic lines)', () => {
    // Synthetic test lines, not from a real directory.
    const tsv = ['level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
      ...[['RESTAURANTS', 95, 1], ['Test Grill 3401 New Jersey av', 92, 2], ['Smudged Cafe 9999 Pacific av', 91, 3], ['Blurry Diner 126 W Pine av', 40, 4]]
        .flatMap(([t, c, line]) => String(t).split(' ').map((w, k) => `5\t1\t1\t1\t${line}\t${k + 1}\t${k * 50}\t${Number(line) * 20}\t40\t12\t${c}\t${w}`))].join('\n');
    const ocr = parseTsv(tsv, 'test');
    const listings = parseListings(ocr.lines);
    expect(listings.map((l) => l.name)).toEqual(['Test Grill', 'Smudged Cafe', 'Blurry Diner']);
    expect(listings[0].heading).toBe('RESTAURANTS');
    const c = matchCandidates({ id: 'synthetic', title: 't', year: 1960, source: 's', license: 'l', pages: [] }, 'p1', listings, [{ id: 'P1', address: '3401 NEW JERSEY AVE' }, { id: 'P2', address: '126 W PINE AVE' }]);
    expect(c[0]).toMatchObject({ decision: 'candidate', parcelId: 'P1' });
    expect(c[1].decision).toBe('review');
    expect(c[1].parcelId).toBeUndefined();
    expect(c[2].decision).toBe('review');
    expect(c[2].why).toMatch(/confidence/);
  });
  it('the build reports directory OCR as not run (no pages cached)', () => {
    const c = JSON.parse(readFileSync(join(PACK, 'city.json'), 'utf8'));
    expect(c.directories.status).toBe('not-run');
  });
});

describe('fetchers (no network: mocked)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'fetch-'));
  const noSleep = async () => {};
  it('offline mode never requests and reports the source unreachable', async () => {
    let calls = 0;
    await expect(fetchCached({ sourceId: 't', url: 'https://example.invalid/x', cacheFile: join(tmp, 'a.json'), offline: true, fetchImpl: (async () => { calls++; return new Response('x'); }) as typeof fetch })).rejects.toBeInstanceOf(SourceUnreachable);
    expect(calls).toBe(0);
  });
  it('retries 503 with backoff, then caches; a 403 is final', async () => {
    let n = 0;
    const flaky = (async () => (++n < 3 ? new Response('busy', { status: 503 }) : new Response('{"ok":1}'))) as typeof fetch;
    const r = await fetchCached({ sourceId: 't', url: 'https://example.invalid/y', cacheFile: join(tmp, 'b.json'), fetchImpl: flaky, sleep: noSleep, minIntervalMs: 0 });
    expect(r.attempts).toBe(3);
    const again = await fetchCached({ sourceId: 't', url: 'https://example.invalid/y', cacheFile: join(tmp, 'b.json'), fetchImpl: flaky, sleep: noSleep });
    expect(again.fromCache).toBe(true);
    let m = 0;
    const denied = (async () => { m++; return new Response('no', { status: 403 }); }) as typeof fetch;
    await expect(fetchCached({ sourceId: 't', url: 'https://example.invalid/z', cacheFile: join(tmp, 'c.json'), fetchImpl: denied, sleep: noSleep, minIntervalMs: 0 })).rejects.toMatchObject({ status: 403 });
    expect(m).toBe(1);
  });
  it('ArcGIS: pages until the count, never asks for owner fields', async () => {
    expect(() => checkFields({ outFields: ['OBJECTID', 'OWNER_NAME'], forbidden: NJ_PARCEL_FORBIDDEN })).toThrow();
    expect(() => checkFields({ outFields: ['*'], forbidden: NJ_PARCEL_FORBIDDEN })).toThrow();
    const urls: string[] = [];
    const svc = (async (u: string | URL | Request) => {
      const url = String(u);
      urls.push(url);
      if (url.includes('returnCountOnly')) return new Response('{"count":5}');
      const off = Number(new URL(url).searchParams.get('resultOffset'));
      const feats = Array.from({ length: Math.min(2, 5 - off) }, (_, i) => ({ type: 'Feature', id: off + i, geometry: null, properties: { OBJECTID: off + i, PAMS_PIN: `p${off + i}`, SNEAKY: 1 } }));
      return new Response(JSON.stringify({ type: 'FeatureCollection', features: feats, exceededTransferLimit: off + 2 < 5 }));
    }) as typeof fetch;
    const dir = join(tmp, 'arc');
    mkdirSync(dir, { recursive: true });
    const r = await arcgisFetchAll({ sourceId: 'njgin-parcels', layerUrl: 'https://example.invalid/FeatureServer/0', bbox: [0, 0, 1, 1], outFields: ['OBJECTID', 'PAMS_PIN'], forbidden: NJ_PARCEL_FORBIDDEN, pageSize: 2, cacheDir: dir, http: { fetchImpl: svc, sleep: noSleep, minIntervalMs: 0 } });
    expect(r.features).toHaveLength(5);
    expect(r.pages).toHaveLength(3);
    expect(r.features.every((f) => !('SNEAKY' in f.properties))).toBe(true);
    expect(urls.every((u) => !u.includes('OWNER'))).toBe(true);
  });
});
