/**
 * Builds a city pack for one import area from the raw files in the manifest:
 *
 *   citydata/<city>/packs/<area>/
 *     city.json  roads.geojson  water.geojson  parcels.geojson  buildings.geojson
 *     businesses.json  historical-overrides.json  asset-manifest.json
 *     sources-and-attribution.json  review-queue.json
 *     (+ rail.geojson, blocks.geojson, nav.json)
 *   public/geo/imported-<city>-<area>.json   the compact game layer (game frame only)
 *
 * GeoJSON geometry is always the original lon/lat (EPSG:4326). Each feature
 * also carries `properties.local` (local metres, see lib/crs.ts) and
 * `properties.game` (the game frame), stored separately and never derived
 * from each other except through lon/lat.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CityConfig, ImportArea } from '../config/cities';
import { localCrs, geodesicDistance, roundLL, roundM, type XY } from '../lib/crs';
import { area, centroid, closestOnPolyline, dist, edges, orientedRect, pointInRing, scaleRing, signedArea } from '../lib/geom';
import { cityDir, rawDir, readManifest, repoRoot, type RawFile } from '../lib/manifest';
import { streetDisplay, streetKey } from '../lib/address';
import type { OsmDoc } from '../fetch/osm';
import { parseOsm, roadClass, type LL } from './osm';
import { dedupeParcels, landDims, materialOf, PROP_CLASS, storiesOf, type RawParcelFeature } from './parcels';
import { buildBlocks } from './blocks';
import { matchBuildingsToParcels } from './match';
import { buildingYearRuling, rulingOverride } from './historical';
import { heightOf, pickTemplate, roofOf, type TemplateSet } from './templates';
import { buildNav } from './nav';
import { dedupePois, linkBusinesses, type PoiIn } from './businesses';
import { loadGameFrame, measureAlignment } from './align';
import { planSheets, type IndexDoc } from './sanborn';
import { runDirectories } from '../ocr/directory';
import { pickEngine } from '../ocr/ocr';
import { IMPORTED_LAYER_VERSION, type HistEvidence, type HistOverride, type HistOverridesFile, type ImportedLayer } from '../../../src/engine/importedCity';
import type { SourceStatus } from '../lib/http';

export interface BuildOpts { root?: string; now?: string; fetchReport?: SourceStatus[]; writeGameLayer?: boolean }

export interface ReviewItem { id: string; kind: string; priority: 'high' | 'medium' | 'low'; target?: { layer: string; id: string }; detail: string; suggestion: string; status: 'open' }

const FC = (features: unknown[], extra: Record<string, unknown> = {}) => ({ type: 'FeatureCollection', ...extra, features });
const r1 = (x: number) => Math.round(x * 10) / 10;

export function buildPack(city: CityConfig, area0: ImportArea, opts: BuildOpts = {}) {
  const root = opts.root ?? repoRoot();
  const now = opts.now ?? new Date().toISOString();
  const manifest = readManifest(city.id, root);
  const rawOf = (sourceId: string): RawFile | undefined => manifest.files.find((f) => f.sourceId === sourceId && f.areaId === area0.id);
  const osmRaw = rawOf('osm');
  const parcelRaw = rawOf('njgin-parcels');
  if (!osmRaw) throw new Error(`no OSM data for ${city.id}/${area0.id} in the raw manifest: fetch it (or ingest a hand-off) first`);
  const crs = localCrs(city.origin);
  const gf = loadGameFrame(root);
  const toLocal = (p: LL): XY => crs.forward(p[0], p[1]);
  const toGame = (p: LL): XY => gf.fns.toUv([p[0], p[1]]);
  const localToLL = (p: XY): LL => crs.inverse(p[0], p[1]);
  const LLr = (c: LL[]) => c.map((p) => roundLL(p));
  const Lr = (c: LL[]) => c.map((p) => roundM(toLocal(p)));
  const Gr = (c: LL[]) => c.map((p) => roundM(toGame(p), 10));
  const [W, S, E, N] = area0.bbox;
  const inBoxLL = (p: LL, padDeg = 0) => p[0] >= W - padDeg && p[0] <= E + padDeg && p[1] >= S - padDeg && p[1] <= N + padDeg;
  const boxLocal = [toLocal([W, S]), toLocal([E, S]), toLocal([E, N]), toLocal([W, N])] as XY[];
  const inBoxLocal = (p: XY, pad = 0) => { const ll = localToLL(p); const padDeg = pad / 111000; return inBoxLL(ll, padDeg); };
  const review: ReviewItem[] = [];
  const overrides: HistOverride[] = [];

  /* ---------- OSM ---------- */
  const osmDoc = JSON.parse(readFileSync(join(rawDir(city.id, root), osmRaw.file), 'utf8')) as OsmDoc;
  const osm = parseOsm(osmDoc);

  for (const e of osmDoc.elements) {
    if (e.type !== 'relation') continue;
    const t = e.tags ?? {};
    const handled = t.type === 'multipolygon' && t.building;
    review.push({ id: `rq-osm-relation-${e.id}`, kind: handled ? 'osm-relation-building' : 'osm-relation-not-imported', priority: t.type === 'multipolygon' ? 'medium' : 'low', target: { layer: 'osm', id: `osm:relation/${e.id}` }, detail: `${t.type ?? '?'}${t.route ? `=${t.route}` : ''}${t.name ? ` "${t.name}"` : ''}${t.note ? ` (OSM note: ${t.note})` : ''}: ${handled ? 'imported from its outer ring only (inner rings ignored)' : 'not imported (its member ways are imported on their own where they are roads or rail)'}`, suggestion: handled ? 'Check the outline against the relation.' : t.route === 'railway' ? 'Historical rail line: date it (when it ran, when it closed) before drawing it for 1960.' : 'No action unless the relation carries geometry the game needs.', status: 'open' });
  }

  /* ---------- Sanborn index (transcribed) ---------- */
  const idxFile = join(cityDir(city.id, root), 'evidence', 'sanborn-1950-additional-index.json');
  const sanIdx = existsSync(idxFile) ? (JSON.parse(readFileSync(idxFile, 'utf8')) as IndexDoc) : undefined;
  const namedIn1949 = new Set((sanIdx?.entries ?? []).map((e) => streetKey(e.street)));

  /* ---------- roads, rail, water ---------- */
  const keepLine = (c: LL[]) => c.some((p) => inBoxLL(p, 0.0005));
  const roadFeatures = osm.roads.filter((r) => keepLine(r.coords)).map((r) => {
    const cls = roadClass(r.tags.highway);
    const ev: HistEvidence[] = [];
    if (r.tags.name && namedIn1949.has(streetKey(r.tags.name))) ev.push({ year: 1949, source: 'Sanborn NJ Coast Vol. 4 (1950), Additional Index Oct 1949 (transcribed, citydata/wildwood/evidence)', confidence: 'low', note: 'street name listed in the index (at other house numbers): the street existed by 1949; this segment is not confirmed' });
    return {
      type: 'Feature', id: r.sourceId,
      geometry: { type: 'LineString', coordinates: LLr(r.coords) },
      properties: {
        id: r.sourceId, sourceIds: [r.sourceId], name: r.tags.name ?? null, displayName: r.tags.name ? streetDisplay(r.tags.name) : null, highway: r.tags.highway, cls,
        oneway: r.tags.oneway ?? null, ref: r.tags.ref ?? null, surface: r.tags.surface ?? null, osmNodes: r.nodeIds,
        local: Lr(r.coords), game: Gr(r.coords),
        historical: { status: 'unverified', evidence: ev, note: cls === 'street' ? 'modern street centreline; the grid is old, but each segment is unverified for the target year' : 'modern lane or path: unverified for the target year' },
      },
    };
  });
  const railFeatures = osm.rail.filter((r) => keepLine(r.coords)).map((r) => ({
    type: 'Feature', id: r.sourceId, geometry: { type: 'LineString', coordinates: LLr(r.coords) },
    properties: { id: r.sourceId, sourceIds: [r.sourceId], railway: r.tags.railway, name: r.tags.name ?? null, local: Lr(r.coords), game: Gr(r.coords), historical: { status: 'unverified', evidence: [], note: `OSM railway=${r.tags.railway}: a former line; when it closed is not in the data` } },
  }));
  const waterFeatures = [
    ...osm.waterAreas.filter((w) => keepLine(w.ring)).map((w) => ({ type: 'Feature', id: w.sourceId, geometry: { type: 'Polygon', coordinates: [LLr(w.ring)] }, properties: { id: w.sourceId, sourceIds: [w.sourceId], natural: w.tags.natural, local: Lr(w.ring), game: Gr(w.ring), historical: { status: 'unverified', evidence: [], note: 'modern shoreline' } } })),
    ...osm.waterLines.filter((w) => keepLine(w.coords)).map((w) => ({ type: 'Feature', id: w.sourceId, geometry: { type: 'LineString', coordinates: LLr(w.coords) }, properties: { id: w.sourceId, sourceIds: [w.sourceId], waterway: w.tags.waterway ?? w.tags.natural, local: Lr(w.coords), game: Gr(w.coords), historical: { status: 'unverified', evidence: [], note: 'modern' } } })),
  ];

  /* ---------- parcels ---------- */
  const parcelFc = parcelRaw ? (JSON.parse(readFileSync(join(rawDir(city.id, root), parcelRaw.file), 'utf8')) as { features: RawParcelFeature[] }) : { features: [] };
  const dd = dedupeParcels(parcelFc.features);
  for (const iss of dd.issues) review.push({ id: `rq-parcel-${iss.kind}-${iss.pin}`, kind: `parcel-${iss.kind}`, priority: 'low', target: { layer: 'parcels', id: `njgin:${iss.pin}` }, detail: iss.detail, suggestion: iss.kind === 'multipart' ? 'Check the outlines against the tax map: separate lots that share a PIN (often unattributed slivers or condominium pieces) or one lot drawn in pieces.' : 'Check which value is current in the tax list.', status: 'open' });
  const parcels = dd.parcels.map((p) => ({ ...p, local: p.parts.map((r) => r.map((q) => toLocal(q))) }));
  const parcelById = new Map(parcels.map((p) => [p.id, p]));

  /* ---------- blocks from the street network ---------- */
  const streetLines = osm.roads.filter((r) => roadClass(r.tags.highway) === 'street').map((r) => ({ id: r.sourceId, nodeIds: r.nodeIds, pts: r.coords.map(toLocal) }));
  const bk = buildBlocks(streetLines, { inBox: (p) => inBoxLocal(p, 5) });
  const parcelBlock = new Map<string, string>();
  for (const p of parcels) {
    const c = centroid(p.local[0]);
    const b = bk.blocks.find((x) => pointInRing(c, x.ring));
    if (b) parcelBlock.set(p.id, b.id);
  }
  const blockFeatures = bk.blocks.map((b) => {
    const ps = parcels.filter((p) => parcelBlock.get(p.id) === b.id);
    const tax: Record<string, number> = {};
    for (const p of ps) if (p.block) tax[p.block] = (tax[p.block] ?? 0) + 1;
    const ll = [...b.ring, b.ring[0]].map(localToLL);
    return { type: 'Feature', id: b.id, geometry: { type: 'Polygon', coordinates: [LLr(ll)] }, properties: { id: b.id, sourceIds: b.edgeWays, generated: true, method: 'faces of the noded street-centreline graph (OSM highway streets; dead ends pruned)', area: Math.round(b.area), complete: b.complete, parcels: ps.map((p) => p.id), taxBlocks: tax, local: [...b.ring, b.ring[0]].map((q) => roundM(q)), game: Gr(ll) } };
  });
  // Tax-block agreement: share of a block's parcels in its most common tax block.
  const agree = blockFeatures.filter((b) => b.properties.parcels.length).map((b) => { const v = Object.values(b.properties.taxBlocks); const tot = v.reduce((s, x) => s + x, 0); return tot ? Math.max(...v) / tot : 0; });

  /* ---------- buildings ---------- */
  const templates = JSON.parse(readFileSync(join(root, 'citydata', 'templates', 'period-1960.json'), 'utf8')) as TemplateSet;
  type B = { id: string; sourceIds: string[]; src: 'osm' | 'generated'; ring: LL[]; local: XY[]; tags: Record<string, string>; method?: string; entranceNodes: { sourceId: string; at: LL }[] };
  const osmBuildings: B[] = osm.buildings.filter((b) => b.ring.some((p) => inBoxLL(p))).map((b) => ({
    id: b.sourceId, sourceIds: [b.sourceId], src: 'osm', ring: b.ring, local: b.ring.map(toLocal), tags: b.tags,
    entranceNodes: osm.entrances.filter((e) => b.nodeIds.includes(Number(e.sourceId.split('/')[1]))).map((e) => ({ sourceId: e.sourceId, at: e.at })),
  }));
  const m1 = matchBuildingsToParcels(osmBuildings.map((b) => ({ id: b.id, ring: b.local })), parcels.map((p) => ({ id: p.id, parts: p.local })));
  // Generated outlines: parcels with an assessor building record and no surveyed outline over them.
  const generated: B[] = [];
  for (const p of parcels) {
    const hasBldg = !!p.bldgDesc || (p.yrConstr ?? 0) > 0;
    if (!hasBldg) continue;
    const pa = p.local.reduce((s, r) => s + area(r), 0);
    const covered = (m1.byParcel.get(p.id) ?? []).length > 0 && m1.buildings.some((m) => m.links.some((l) => l.parcelId === p.id && l.ofParcel >= 0.15));
    if (covered || pa < 40) continue;
    const main = p.local.reduce((a, r) => (area(r) > area(a) ? r : a), p.local[0]);
    const rect = orientedRect(main);
    if (!p.address && !p.bldgDesc) continue;
    const k = Math.min(0.8, Math.max(0.55, 1 - 3 / Math.max(rect.d, 4)));
    const ring = scaleRing(rect.corners, k);
    if (signedArea(ring) < 0) ring.reverse();
    const ll = ring.map(localToLL);
    generated.push({ id: `gen:${p.id}`, sourceIds: [], src: 'generated', ring: [...ll, ll[0]], local: [...ring, ring[0]], tags: {}, method: `generated: the parcel's oriented rectangle scaled by ${k.toFixed(2)} about its middle (no surveyed outline; the assessor records a building: ${p.bldgDesc ?? `built ${p.yrConstr}`})`, entranceNodes: [] });
  }
  const allB = [...osmBuildings, ...generated];
  const match = matchBuildingsToParcels(allB.map((b) => ({ id: b.id, ring: b.local })), parcels.map((p) => ({ id: p.id, parts: p.local })));
  const matchOf = new Map(match.buildings.map((m) => [m.buildingId, m]));

  // Streets for "which side faces the street" (named street centrelines, local).
  const named = osm.roads.filter((r) => r.tags.name && roadClass(r.tags.highway) === 'street').map((r) => ({ name: r.tags.name, pts: r.coords.map(toLocal) }));
  const nearestStreet = (p: XY) => { let best = { d: Infinity, name: '', pt: p as XY }; for (const s of named) { const c = closestOnPolyline(p, s.pts); if (c.d < best.d) best = { d: c.d, name: s.name, pt: c.pt }; } return best; };

  const buildingFeatures = allB.map((b) => {
    const m = matchOf.get(b.id)!;
    const prim = m.primary ? parcelById.get(m.primary) : undefined;
    const rul = buildingYearRuling(m.links, (id) => parcelById.get(id)?.yrConstr ?? null, city.targetYear);
    if (rul.conflict) review.push({ id: `rq-year-${b.id}`, kind: 'historical-year-conflict', priority: 'medium', target: { layer: 'buildings', id: b.id }, detail: rul.conflict, suggestion: 'Check the Sanborn sheet for this block.', status: 'open' });
    const ov = rulingOverride(b.id, rul, now);
    if (ov) overrides.push(ov);
    const bArea = area(b.local);
    const stories = storiesOf(prim?.bldgDesc ?? null);
    const tpl = pickTemplate(templates, { osm: b.tags, propClass: prim?.propClass ?? null, material: materialOf(prim?.bldgDesc ?? null), yr: rul.yr ?? null, area: bArea, levels: stories });
    const hv = heightOf(templates, b.tags, b.src === 'osm' && m.relation !== 'one-parcel' && m.links.length > 1 ? null : stories, tpl);
    const roof = roofOf(b.tags, tpl);
    const rect = orientedRect(b.local);
    // Entrances: OSM entrance nodes on the outline are real; otherwise one on the side nearest a named street (generated).
    const ents = b.entranceNodes.length
      ? b.entranceNodes.map((e, i) => ({ id: `${b.id}#e${i + 1}`, sourceId: e.sourceId, generated: false, method: 'OSM entrance node', at: toLocal(e.at), street: nearestStreet(toLocal(e.at)).name }))
      : (() => {
        const es = edges(b.local).filter((e) => e.len >= 1.5);
        let best = { e: es[0], d: Infinity, street: '' };
        for (const e of es) { const mid: XY = [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2]; const ns = nearestStreet(mid); if (ns.d < best.d) best = { e, d: ns.d, street: ns.name }; }
        const mid: XY = [(best.e.a[0] + best.e.b[0]) / 2, (best.e.a[1] + best.e.b[1]) / 2];
        const c = centroid(b.local);
        const L = Math.max(1e-6, dist(mid, c));
        const at: XY = [mid[0] + ((mid[0] - c[0]) / L) * 0.5, mid[1] + ((mid[1] - c[1]) / L) * 0.5];
        return [{ id: `${b.id}#e1`, sourceId: undefined as string | undefined, generated: true, method: `generated: middle of the side nearest ${best.street || 'a street'} (${r1(best.d)} m to its centreline)`, at, street: best.street }];
      })();
    if (m.ambiguous) review.push({ id: `rq-match-${b.id}`, kind: 'building-parcel-ambiguous', priority: 'medium', target: { layer: 'buildings', id: b.id }, detail: `straddles parcels: ${m.links.slice(0, 3).map((l) => `${l.parcelId} ${Math.round(l.ofBuilding * 100)}%`).join(', ')}`, suggestion: 'Decide which parcel\'s assessor record describes this building (or split the outline).', status: 'open' });
    if (m.relation === 'no-parcel') review.push({ id: `rq-noparcel-${b.id}`, kind: 'building-no-parcel', priority: 'low', target: { layer: 'buildings', id: b.id }, detail: 'the outline lies on no parcel (a street, the beach, or a parcel outside the download)', suggestion: 'Check the outline and the parcel coverage.', status: 'open' });
    const ll = b.ring;
    return {
      type: 'Feature', id: b.id, geometry: { type: 'Polygon', coordinates: [LLr(ll)] },
      properties: {
        id: b.id, sourceIds: b.sourceIds, source: b.src, generatedFootprint: b.src === 'generated' ? b.method : null,
        name: b.tags.name ?? null, osmTags: Object.fromEntries(Object.entries(b.tags).filter(([k]) => !/^(source|note|fixme|check_date|website|phone|contact:|opening_hours|brand:wikidata|not:)/.test(k))),
        area: r1(bArea), footprint: { w: r1(rect.w), d: r1(rect.d), angle: r1(rect.angle) },
        parcels: m.links, primaryParcel: m.primary ?? null, parcelRelation: m.relation, ambiguousParcel: m.ambiguous,
        address: b.tags['addr:street'] ? `${b.tags['addr:housenumber'] ?? ''} ${b.tags['addr:street']}`.trim() : prim?.address ?? null,
        height: hv.height, levels: hv.levels, roof, template: tpl.id,
        entrances: ents.map((e) => ({ id: e.id, sourceId: e.sourceId ?? null, generated: e.generated, method: e.method, street: e.street || null, lonLat: roundLL(localToLL(e.at)), local: roundM(e.at), game: roundM(toGame(localToLL(e.at)), 10), navNode: -1, connector: -1 })),
        historical: { status: rul.status === 'unknown' ? 'unknown' : rul.status, yrConstr: rul.yr ?? null, evidence: rul.evidence, note: `${b.src === 'generated' ? 'generated outline; ' : 'modern outline (OSM); '}${rul.note}`, conflict: rul.conflict ?? null, verified: false },
        assetId: null,
        local: b.local.map((q) => roundM(q)), game: Gr(ll),
      },
    };
  });

  /* ---------- businesses ---------- */
  const poisIn: PoiIn[] = osm.pois.filter((p) => inBoxLL(p.at)).map((p) => ({ sourceId: p.sourceId, tags: p.tags, at: toLocal(p.at), ring: p.areaRing?.map(toLocal), lonLat: p.at }));
  const dp = dedupePois(poisIn);
  const bizRecs = linkBusinesses(dp.kept, allB.map((b) => ({ id: b.id, ring: b.local, sourceId: b.src === 'osm' ? b.id : undefined })), parcels.map((p) => ({ id: p.id, parts: p.local, address: p.address })), dp.mergedIds);
  const sharing = new Map<string, number>();
  for (const b of bizRecs) if (b.buildingId) sharing.set(b.buildingId, (sharing.get(b.buildingId) ?? 0) + 1);
  for (const b of bizRecs) {
    if (!b.buildingId) review.push({ id: `rq-biz-nobldg-${b.id}`, kind: 'business-no-building', priority: 'low', target: { layer: 'businesses', id: b.id }, detail: `${b.name}: its point stands in no building outline (surveyed or generated)`, suggestion: 'Move the point onto its building in the map editor, or draw the outline.', status: 'open' });
    if (b.addressCheck === 'mismatch') review.push({ id: `rq-biz-addr-${b.id}`, kind: 'business-address-mismatch', priority: 'low', target: { layer: 'businesses', id: b.id }, detail: `${b.name}: OSM says ${b.address}; the parcel under it is ${parcelById.get(b.parcelId!)?.address}`, suggestion: 'Check which address is right (corner lots often carry the other street\'s number).', status: 'open' });
  }
  review.push({ id: 'rq-modern-businesses', kind: 'historical-verification', priority: 'medium', detail: `${bizRecs.length} businesses/institutions are today's (OSM ${osmRaw.downloadedAt.slice(0, 10)}): none is shown for ${city.targetYear} until period evidence (a directory, a Sanborn label, a photo) is attached.`, suggestion: 'OCR the 1959-61 city directory pages for these blocks; accept matches in the map editor.', status: 'open' });
  const businessesOut = bizRecs.map((b) => ({ ...b, lonLat: roundLL(b.lonLat), local: roundM(b.at), game: roundM(toGame(localToLL(b.at)), 10), at: undefined, sharesBuildingWith: b.buildingId ? (sharing.get(b.buildingId) ?? 1) - 1 : 0, historical: { status: 'unverified', evidence: [], note: `modern ${b.kind} (OSM); not shown for ${city.targetYear} until verified` } }));

  /* ---------- directories (OCR) ---------- */
  const dirRun = runDirectories(rawDir(city.id, root), pickEngine(), parcels.map((p) => ({ id: p.id, address: p.address })));
  for (const c of dirRun.candidates) if (c.decision === 'review') review.push({ id: `rq-ocr-${c.id}`, kind: 'ocr-candidate', priority: 'medium', detail: `${c.name} — ${c.raw} (${c.why})`, suggestion: 'Read the line on the scan; place it in the map editor if it is a business here.', status: 'open' });

  /* ---------- nav ---------- */
  const navLines = osm.roads.map((r) => ({ id: r.sourceId, nodeIds: r.nodeIds, pts: r.coords.map(toLocal), cls: roadClass(r.tags.highway) }));
  const entrancesAll = buildingFeatures.flatMap((f) => f.properties.entrances.map((e) => ({ id: e.id, at: e.local as XY })));
  const obstacles = [...allB.map((b) => b.local), ...osm.waterAreas.map((w) => w.ring.map(toLocal))];
  const nav = buildNav(navLines, entrancesAll, { keep: (p) => inBoxLocal(p, 80), obstacles });
  for (const f of buildingFeatures) for (const e of f.properties.entrances) {
    e.navNode = nav.entranceNode.get(e.id) ?? -1;
    e.connector = nav.connector.get(e.id) ?? -1;
    const why = nav.unconnected.get(e.id);
    if (why) review.push({ id: `rq-entrance-${e.id}`, kind: 'entrance-unreachable', priority: 'high', target: { layer: 'buildings', id: f.properties.id }, detail: `${e.id}: ${why}`, suggestion: 'Add the path or move the entrance.', status: 'open' });
  }

  /* ---------- alignment and scale ---------- */
  const alignLines = osm.roads.filter((r) => r.tags.name && roadClass(r.tags.highway) === 'street').map((r) => ({ name: r.tags.name, uv: r.coords.filter((p) => inBoxLL(p)).map(toGame) })).filter((l) => l.uv.length);
  const alignment = measureAlignment(gf.pkg, alignLines);
  const scale = scaleCheck(parcels, crs, gf.fns.toUv, area0.bbox, alignment);

  /* ---------- Sanborn ---------- */
  const plan = sanIdx ? planSheets(sanIdx, parcels.map((p) => p.address).filter((a): a is string => !!a)) : undefined;
  const sheetsToFetch = [
    { sheet: 'ind3 (scan seq 4, 05568_04_1950-ind3)', why: 'The volume\'s main index / key map. The cached scan (ind2) shows only the pasted-on 1949 Additional Index and 1950 Addenda, which list none of this area\'s addresses: the test blocks are on base sheets of the 1909 volume that only the main index names.', priority: 'high' },
    ...(plan?.neighbours ?? []).map((n) => ({ sheet: n.sheet, why: `Neighbouring sheet (same streets at other numbers): ${n.why.slice(0, 4).join('; ')}${n.why.length > 4 ? ` … +${n.why.length - 4}` : ''}`, priority: 'medium' })),
  ];
  review.unshift({ id: 'rq-sanborn-sheets', kind: 'sanborn-sheets-needed', priority: 'high', detail: `No Sanborn sheet for these blocks is cached. The transcribed index covers ${plan?.covered.reduce((s, c) => s + c.addresses.length, 0) ?? 0} of ${parcels.filter((p) => p.address).length} parcel addresses here. Fetch: ${sheetsToFetch.map((s) => s.sheet).join(', ')}.`, suggestion: 'Download the sheets (IIIF, pct:50 or full) via the browser hand-off, then compare buildings block by block and mark them verified or removed in the map editor. Note: the 1958 volume (sanborn05568_027) is in the catalog but not scanned.', status: 'open' });
  const unknownYr = buildingFeatures.filter((f) => f.properties.historical.status === 'unknown');
  if (unknownYr.length) review.push({ id: 'rq-unknown-year', kind: 'historical-unknown', priority: 'medium', detail: `${unknownYr.length} buildings have no assessor year built: ${unknownYr.slice(0, 12).map((f) => f.properties.id).join(', ')}${unknownYr.length > 12 ? ' …' : ''}`, suggestion: 'Check them on the Sanborn sheets.', status: 'open' });

  /* ---------- parcels out ---------- */
  const buildingsOnParcel = match.byParcel;
  const parcelFeatures = parcels.map((p) => ({
    type: 'Feature', id: p.id,
    geometry: p.parts.length === 1 ? { type: 'Polygon', coordinates: [LLr(p.parts[0])] } : { type: 'MultiPolygon', coordinates: p.parts.map((r) => [LLr(r)]) },
    properties: {
      id: p.id, sourceIds: p.sourceIds, pin: p.pin, mun: p.mun, taxBlock: p.block, lot: p.lot, qcode: p.qcode, address: p.address, propClass: p.propClass, propClassLabel: p.propClass ? PROP_CLASS[p.propClass] ?? null : null,
      bldgDesc: p.bldgDesc, landDesc: p.landDesc, acres: p.acres, facName: p.facName, propUse: p.propUse, bldgClass: p.bldgClass, yrConstr: p.yrConstr, dwell: p.dwell, dedupe: p.dedupe,
      streetBlock: parcelBlock.get(p.id) ?? null, buildings: buildingsOnParcel.get(p.id) ?? [],
      local: p.parts.map((r) => r.map((q) => roundM(toLocal(q)))), game: p.parts.map((r) => Gr(r)),
      historical: { status: 'unverified', evidence: [], note: 'modern lot lines (tax map); 1960 lot lines unverified' },
    },
  }));

  /* ---------- sources ---------- */
  const fr = new Map((opts.fetchReport ?? []).map((s) => [s.sourceId, s]));
  const sources = city.sources.map((s) => {
    const files = manifest.files.filter((f) => f.sourceId === s.id && (f.areaId === area0.id || f.areaId === '*'));
    return { id: s.id, priority: s.priority, name: s.name, endpoint: s.endpoint, license: s.license, attribution: s.attribution, usedFor: s.layers, notes: s.notes ?? [], lastFetch: fr.get(s.id) ?? null, files: files.map((f) => ({ file: `raw/${f.file}`, title: f.title, url: f.url, downloadedAt: f.downloadedAt, retrievedBy: f.retrievedBy, bytes: f.bytes, sha256: f.sha256, coverage: f.coverage })), status: files.length ? 'cached' : 'not-downloaded' };
  });

  /* ---------- the reference importer's per-feature fields (compatibility) ---------- */
  // Same names as the Python starter's packs: layer, sourceId, historicalStatus, validFrom,
  // validTo (exclusive), activeInTargetYear, eligibleForHistoricalGame (verified or fictional only).
  const compat = (layer: string, fs: { properties: Record<string, unknown> }[]) => {
    for (const f of fs) {
      const p = f.properties;
      const h = p.historical as { status: string; yrConstr?: number | null };
      p.layer = layer;
      p.sourceId = (p.sourceIds as string[])[0]?.split(':')[0] ?? 'generated';
      p.historicalStatus = h.status;
      p.validFrom = h.yrConstr ?? null;
      p.validTo = null;
      p.activeInTargetYear = h.status === 'absent' ? false : h.status === 'likely-existed' || h.status === 'verified' ? true : null;
      p.eligibleForHistoricalGame = h.status === 'verified';
    }
  };
  compat('roads', roadFeatures); compat('rail', railFeatures); compat('water', waterFeatures); compat('parcels', parcelFeatures); compat('buildings', buildingFeatures);

  /* ---------- write ---------- */
  const packDir = join(cityDir(city.id, root), 'packs', area0.id);
  mkdirSync(packDir, { recursive: true });
  const packId = `${city.id}/${area0.id}`;
  const counts = {
    roads: roadFeatures.length, roadsByClass: count(roadFeatures.map((f) => f.properties.cls)), rail: railFeatures.length, water: waterFeatures.length,
    parcelsInput: dd.inputCount, parcels: parcelFeatures.length, parcelsMergedExact: parcels.filter((p) => p.dedupe === 'exact-duplicates-merged').length, parcelsMultipart: parcels.filter((p) => p.dedupe === 'multipart').length,
    buildingsOsm: osmBuildings.length, buildingsGenerated: generated.length, blocks: blockFeatures.length, blocksComplete: blockFeatures.filter((b) => b.properties.complete).length,
    businesses: businessesOut.length, businessesMerged: dp.merged.length, institutions: businessesOut.filter((b) => b.kind === 'institution').length,
    entrances: entrancesAll.length, entrancesGenerated: buildingFeatures.reduce((s, f) => s + f.properties.entrances.filter((e) => e.generated).length, 0), entrancesUnconnected: nav.unconnected.size,
    navNodes: nav.nodes.length, navEdges: nav.edges.length, overridesProposed: overrides.length, reviewItems: review.length,
    historical: count(buildingFeatures.map((f) => `${f.properties.source}:${f.properties.historical.status}`)),
    osmIgnored: osm.ignored,
  };
  const match1 = { ...match.stats, osmOnly: m1.stats };
  const cityJson = {
    schemaVersion: 1, packId, id: `${city.id}-${area0.id}`, name: area0.name, bbox: area0.bbox, originLonLat: [city.origin.lon, city.origin.lat],
    coordinateSystem: { geography: 'EPSG:4326', game: `${gf.describe.frame} (the town package frame, metres)`, local: 'transverse Mercator about originLonLat, metres, x east, y north', originLonLat: [city.origin.lon, city.origin.lat], localXZ: 'the Python starter\'s local_xy (x east, z south, spherical tangent) is x ≈ local.x, z ≈ -local.y; within this box they differ by under 0.4%' },
    status: 'beta: test area', generatedAt: now, generator: 'scripts/cityimport (npx tsx scripts/cityimport/cli.ts build)',
    city: { id: city.id, name: city.name, state: city.state }, area: { id: area0.id, name: area0.name, bbox: area0.bbox, municipalities: area0.municipalities ?? [] }, targetYear: city.targetYear,
    crs: { geographic: 'EPSG:4326 (lon, lat): GeoJSON geometry, as downloaded', local: crs.describe(), game: gf.describe },
    coordinateFields: { geometry: 'original lon/lat (EPSG:4326)', 'properties.local': 'local metres [x east, y north] (transverse Mercator about the origin)', 'properties.game': 'game frame [u, v] metres (the town package frame)' },
    layers: { roads: 'roads.geojson', water: 'water.geojson', parcels: 'parcels.geojson', buildings: 'buildings.geojson', businesses: 'businesses.json', historicalOverrides: 'historical-overrides.json', assets: 'asset-manifest.json', sources: 'sources-and-attribution.json', reviewQueue: 'review-queue.json', extra: { rail: 'rail.geojson', blocks: 'blocks.geojson', nav: 'nav.json' }, gameLayer: `public/geo/imported-${city.id}-${area0.id}.json` },
    counts, matching: match1,
    blocks: { method: 'planar faces of the street-centreline graph', vertices: bk.vertices, edges: bk.edges, deadEndsPruned: bk.pruned, taxBlockAgreement: { median: median(agree), min: agree.length ? Math.min(...agree) : null, n: agree.length } },
    scale, alignment,
    sanborn: { index: sanIdx ? 'citydata/wildwood/evidence/sanborn-1950-additional-index.json (transcribed)' : null, plan, sheetsToFetch, volumes: city.sanborn ?? [] },
    directories: { status: dirRun.status, detail: dirRun.detail, candidates: dirRun.candidates.length },
  };
  // Occupancy: who was in which building when (validTo exclusive). A business that moves or closes keeps
  // its record; a new occupancy row says where it went. Modern rows have no known start.
  const occupancies = businessesOut.filter((b) => b.buildingId).map((b) => ({ occupancyId: `occ:${b.id}:${b.buildingId}`, businessId: b.id, buildingId: b.buildingId!, name: b.name, validFrom: null, validTo: null, observed: osmRaw.downloadedAt.slice(0, 10), fictional: false, evidence: [{ sourceId: 'osm', year: Number(osmRaw.downloadedAt.slice(0, 4)), confidence: 'medium', note: 'mapped in OSM at download (today\'s tenant)' }] }));
  const businessesJson = { schemaVersion: 1, packId, targetYear: city.targetYear, note: 'Occupants, kept separate from the buildings they stand in (buildingId). Modern (OSM) records are unverified for the target year; directory candidates (OCR) are added here only when their address matches one parcel. occupancies: buildingId, businessId, name, validFrom, validTo (exclusive), evidence.', businesses: businessesOut, occupancies, directoryCandidates: dirRun.candidates.filter((c) => c.decision === 'candidate'), merged: dp.merged };
  const overridesJson: HistOverridesFile = { schemaVersion: 1, packId, targetYear: city.targetYear, overrides };
  const assetJson = {
    schemaVersion: 1, packId, templatesFile: 'citydata/templates/period-1960.json', era: templates.era,
    templates: templates.templates.map((t) => ({ id: t.id, label: t.label, roof: t.roof, defaultLevels: t.defaultLevels, palette: t.palette })),
    buildings: buildingFeatures.map((f) => ({ buildingId: f.properties.id, templateId: f.properties.template, generated: true, assetId: null, replacesGenerated: false })),
    landmarks: [] as { buildingId: string; assetId: string; note: string }[],
    note: 'Every building is drawn from its template (generated). A custom asset replaces the generated building when assigned: set assetId here or with the map editor (set-asset override), and list landmark art under landmarks.',
  };
  const sourcesJson = {
    schemaVersion: 1, packId, sources,
    attribution: sources.filter((s) => s.files.length).map((s) => s.attribution),
    excludedOnPurpose: ['Parcel owner names, mailing addresses and sale data (never requested; refused if present in a hand-off).'],
    notAccessibleFromBuildMachine: (opts.fetchReport ?? []).filter((s) => s.status === 'unreachable').map((s) => ({ sourceId: s.sourceId, detail: s.detail, url: s.url ?? null })),
  };
  const reviewJson = { schemaVersion: 1, packId, generatedAt: now, items: review };
  const navJson = { schemaVersion: 1, packId, note: 'Walk graph: OSM street, lane and footway centrelines (nodes at every OSM vertex) plus a connector from every entrance.', nodes: nav.nodes.map((q) => roundM(q)), nodesGame: nav.nodes.map((q) => roundM(toGame(localToLL(q)), 10)), edges: nav.edges, entrances: Object.fromEntries(nav.entranceNode) };

  const write = (name: string, obj: unknown) => writeFileSync(join(packDir, name), `${JSON.stringify(obj)}\n`);
  write('city.json', cityJson);
  writeFileSync(join(packDir, 'city.json'), `${JSON.stringify(cityJson, null, 1)}\n`);
  write('roads.geojson', FC(roadFeatures, { name: 'roads' }));
  write('rail.geojson', FC(railFeatures, { name: 'rail' }));
  write('water.geojson', FC(waterFeatures, { name: 'water', note: waterFeatures.length ? undefined : 'No water features in OSM within this box (the bay lies west of it).' }));
  write('parcels.geojson', FC(parcelFeatures, { name: 'parcels' }));
  write('buildings.geojson', FC(buildingFeatures, { name: 'buildings' }));
  write('blocks.geojson', FC(blockFeatures, { name: 'blocks' }));
  writeFileSync(join(packDir, 'businesses.json'), `${JSON.stringify(businessesJson, null, 1)}\n`);
  writeFileSync(join(packDir, 'historical-overrides.json'), `${JSON.stringify(overridesJson, null, 1)}\n`);
  writeFileSync(join(packDir, 'asset-manifest.json'), `${JSON.stringify(assetJson, null, 1)}\n`);
  writeFileSync(join(packDir, 'sources-and-attribution.json'), `${JSON.stringify(sourcesJson, null, 1)}\n`);
  writeFileSync(join(packDir, 'review-queue.json'), `${JSON.stringify(reviewJson, null, 1)}\n`);
  write('nav.json', navJson);

  /* ---------- game layer ---------- */
  const flat = (c: XY[]) => c.flatMap(([u, v]) => [r1(u), r1(v)]);
  const gB = boxLocal.map((q) => toGame(localToLL(q)));
  const layer: ImportedLayer = {
    v: IMPORTED_LAYER_VERSION, packId, name: area0.name, targetYear: city.targetYear, frame: gf.describe.frame,
    attribution: sourcesJson.attribution,
    bounds: { u0: r1(Math.min(...gB.map((q) => q[0]))), u1: r1(Math.max(...gB.map((q) => q[0]))), v0: r1(Math.min(...gB.map((q) => q[1]))), v1: r1(Math.max(...gB.map((q) => q[1]))) },
    fit: alignment.fit,
    roads: roadFeatures.map((f) => ({ id: f.id, name: f.properties.displayName ?? undefined, cls: f.properties.cls, pts: flat(f.properties.game as XY[]) })),
    rail: railFeatures.map((f) => ({ id: f.id, cls: 'foot' as const, pts: flat(f.properties.game as XY[]) })),
    water: waterFeatures.filter((f) => f.geometry.type === 'Polygon').map((f) => ({ id: f.id, pts: flat(f.properties.game as XY[]) })),
    parcels: parcelFeatures.map((f) => ({ id: f.id, addr: f.properties.address ?? undefined, yr: f.properties.yrConstr ?? undefined, cls: f.properties.propClass ?? undefined, block: f.properties.streetBlock ?? undefined, pts: flat((f.properties.game as XY[][])[0]) })),
    blocks: blockFeatures.map((f) => ({ id: f.id, pts: flat(f.properties.game as XY[]), taxBlocks: Object.keys(f.properties.taxBlocks) })),
    buildings: buildingFeatures.map((f) => ({
      id: f.id, src: f.properties.source as 'osm' | 'generated', pts: flat(f.properties.game as XY[]), name: f.properties.name ?? undefined,
      h: f.properties.height.value, hGen: f.properties.height.generated, roof: f.properties.roof.value, roofGen: f.properties.roof.generated, levels: f.properties.levels.value,
      tpl: f.properties.template, parcels: f.properties.parcels.map((l) => l.parcelId), status: f.properties.historical.status as ImportedLayer['buildings'][number]['status'],
      yr: f.properties.historical.yrConstr ?? undefined,
      entrances: f.properties.entrances.map((e) => ({ id: e.id, u: r1(e.game[0]), v: r1(e.game[1]), gen: e.generated, node: e.navNode })),
    })),
    businesses: businessesOut.map((b) => ({ id: b.id, name: b.name, cat: b.category, u: r1(b.game[0]), v: r1(b.game[1]), building: b.buildingId, parcel: b.parcelId, addr: b.address, srcIds: b.sourceIds, status: 'unverified' })),
    nav: { nodes: navJson.nodesGame.flatMap(([u, v]) => [r1(u), r1(v)]), edges: nav.edges.flat() },
  };
  let gameLayerFile: string | undefined;
  if (opts.writeGameLayer !== false) {
    gameLayerFile = join(root, 'public', 'geo', `imported-${city.id}-${area0.id}.json`);
    writeFileSync(gameLayerFile, JSON.stringify(layer));
  }
  return { packDir, gameLayerFile, cityJson, counts, review, layer, alignment, scale, plan, sheetsToFetch };
}

function count(xs: string[]): Record<string, number> {
  const o: Record<string, number> = {};
  for (const x of xs) o[x] = (o[x] ?? 0) + 1;
  return o;
}
function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return Math.round(s[Math.floor(s.length / 2)] * 1000) / 1000;
}

/**
 * Scale checks: (1) the local projection against ellipsoidal distances; (2)
 * the assessor's lot sizes (LAND_DESC "30X90", feet) against the parcel
 * outlines' measured sides; (3) the game frame's scale against the same
 * distances; (4) real cross-street spacing against the game's.
 */
function scaleCheck(parcels: { landDesc: string | null; local: XY[][]; parts: LL[][] }[], crs: ReturnType<typeof localCrs>, toUv: (p: [number, number]) => [number, number], bbox: [number, number, number, number], al: ReturnType<typeof measureAlignment>) {
  const [W, S, E, N] = bbox;
  const pairs: [LL, LL, string][] = [[[W, S], [E, S], 'south edge (E-W)'], [[W, S], [W, N], 'west edge (N-S)'], [[W, S], [E, N], 'diagonal'], [[W - 0.03, S - 0.03], [E + 0.03, N + 0.03], '7.6 km diagonal']];
  const proj = pairs.map(([a, b, what]) => {
    const g = geodesicDistance(a, b);
    const l = dist(crs.forward(a[0], a[1]), crs.forward(b[0], b[1]));
    const u = dist(toUv(a), toUv(b));
    return { what, geodesic: r1(g), local: r1(l), localErrPpm: Math.round(((l - g) / g) * 1e6 * 10) / 10, game: r1(u), gameErrPct: Math.round(((u - g) / g) * 10000) / 100 };
  });
  // Lots whose outline is a clean rectangle and whose LAND_DESC gives both sides.
  const lots: { ratioW: number; ratioD: number }[] = [];
  for (const p of parcels) {
    const dims = landDims(p.landDesc);
    if (!dims || p.local.length !== 1) continue;
    const r = orientedRect(p.local[0]);
    if (area(p.local[0]) / (r.w * r.d) < 0.97) continue;
    const [a, b] = [dims[0] * 0.3048, dims[1] * 0.3048].sort((x, y) => y - x);
    lots.push({ ratioW: r.w / a, ratioD: r.d / b });
  }
  const rw = lots.map((l) => l.ratioW).sort((a, b) => a - b), rd = lots.map((l) => l.ratioD).sort((a, b) => a - b);
  const q = (s: number[], f: number) => (s.length ? Math.round(s[Math.floor((s.length - 1) * f)] * 1000) / 1000 : null);
  const cross = al.streets.filter((s) => s.kind === 'cross').sort((a, b) => a.observed - b.observed);
  const gaps = cross.slice(1).map((s, i) => ({ from: cross[i].display, to: s.display, real: r1(s.observed - cross[i].observed), game: r1(s.gameValue - cross[i].gameValue) }));
  return {
    projection: proj,
    assessorLots: { n: lots.length, method: 'parcel outline (oriented rectangle, local metres) vs LAND_DESC feet × 0.3048, rectangular lots only', longSide: { p25: q(rw, 0.25), median: q(rw, 0.5), p75: q(rw, 0.75) }, shortSide: { p25: q(rd, 0.25), median: q(rd, 0.5), p75: q(rd, 0.75) } },
    crossStreetSpacing: gaps,
  };
}
