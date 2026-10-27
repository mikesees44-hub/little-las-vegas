/**
 * One-time conversion (kept for the record): writes Wildwood's hand-authored
 * data — the street frame, neighborhoods, the 1960 seed records, the
 * location layer and the walk stretches — out as a town package,
 * src/worldpack/cities/wildwood.json. After the conversion the game reads
 * Wildwood through the package (hoodData.ts, placesGeo.ts and
 * walkStretches.ts are adapters); this script ran against the old modules.
 *
 *   npx tsx scripts/buildWildwoodPackage.ts <path to old-data dump json> <out>
 *
 * The dump is `{ CROSS, AVENUES, ... }` exported from the pre-package modules.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import type { BusinessRec, CityPackage, Confidence, District, Institution, Landmark, Parcel, Placement, Street } from '../src/engine/cityPackage';
import { exportCityPackage, validateCityPackage } from '../src/engine/cityPackage';

/* eslint-disable @typescript-eslint/no-explicit-any */
const [dumpPath, outPath] = process.argv.slice(2);
const D = JSON.parse(readFileSync(dumpPath, 'utf8')) as any;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const crossU = (n: string): number => D.CROSS.find((c: any) => c.n === n)?.u ?? 0;

const streets: Street[] = [
  ...D.CROSS.map((c: any): Street => ({ id: `st:${slug(c.n)}`, name: c.n, kind: 'cross', u: c.u, sub: c.town, evidence: { confidence: 'approximate', source: 'Street order from memory; spacing approximate (hoodData, 1960).' } })),
  ...D.AVENUES.map((a: any): Street => ({ id: `ave:${a.id}`, name: a.names.wildwood ?? a.names.crest, kind: 'avenue', v: a.v, names: a.names, from: a.from, to: a.to, evidence: { confidence: 'approximate', source: 'Avenue order right (Ocean, Atlantic, Pacific, New Jersey, Park); distances approximate.' } })),
  { id: 'bw:boardwalk', name: 'The Boardwalk', kind: 'boardwalk', from: 'Cresse Ave', to: '16th Ave', width: D.BW.w, evidence: { confidence: 'approximate', source: 'The Boardwalk, Cresse Avenue to 16th Avenue, 1960 (game frame).' } },
];

// Where each frontage run lies inland (for the district outlines).
const AVE_V: Record<string, number> = Object.fromEntries(D.AVENUES.map((a: any) => [a.id, a.v]));
function runBand(run: string): [number, number] {
  if (run === 'bw') return [-10, 80];
  if (run === 'pier') return [-240, 0];
  if (run === 'cw') return [D.CW.mainlandV + 30, D.CW.mainlandV + 110];
  if (run === 'ww') return [D.WW.v0, D.WW.v1];
  const v = AVE_V[run.slice(0, 2)];
  return run === 'oc-' ? [0, v] : run.endsWith('+') ? [v, v + 70] : [v - 70, v];
}

const districts: District[] = D.HOODS.map((h: any): District => {
  const frontage = h.zones.flatMap((z: string) => (D.ZONE_RUNS[z] ?? []).map((r: any) => ({ zone: z, run: r.run, from: r.from, to: r.to })));
  let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
  for (const f of frontage) {
    const a = crossU(f.from); const b = crossU(f.to);
    const [p, q] = runBand(f.run);
    u0 = Math.min(u0, a, b); u1 = Math.max(u1, a, b); v0 = Math.min(v0, p); v1 = Math.max(v1, q);
  }
  if (h.zones.includes('piers')) { v0 = Math.min(v0, -240); }
  const polygon: [number, number][] = u0 < u1 ? [[u0, v0], [u1, v0], [u1, v1], [u0, v1]] : [];
  return { id: `d:${h.id}`, name: h.name, zones: h.zones, gameDistrict: h.district, pop: h.pop, blurb: h.blurb, polygon, frontage, evidence: { confidence: 'approximate', source: 'Outline derived from the frontage runs; 1960 population is a Census-scale guess.' } };
});
const hoodOfZone = (z: string) => D.HOODS.find((h: any) => h.zones.includes(z))?.id;

const AVE_NAME = (run: string) => run.startsWith('oc') ? 'Ocean Ave' : run.startsWith('pa') ? 'Pacific Ave' : run.startsWith('nj') ? 'New Jersey Ave' : run.startsWith('at') ? 'Atlantic Ave' : 'Park Blvd';
const parcels: Parcel[] = [];
const businesses: BusinessRec[] = [];
for (const r of D.SEED) {
  const [id, zone, run, cross, half, use, name, status, owner, who, style, sign, built, cond] = r;
  const address = run === 'bw' ? `Boardwalk at ${cross}` : run === 'pier' ? `${cross.replace(/ Ave$/, '')} Ave pier` : `${cross}, ${AVE_NAME(run)}`;
  parcels.push({
    id, districtId: `d:${hoodOfZone(zone)}`, zone, address, slot: { run, cross, half },
    structure: { built, condition: cond, style, sign }, market: { status, owner },
    evidence: { confidence: 'approximate', source: 'Placed on the game\'s street grid by block and half-block; not a surveyed lot.' },
  });
  businesses.push({
    id: `b:${id}`, parcelId: id, name, use, years: { from: built }, operator: who || undefined, namePolicy: 'fictional',
    evidence: { confidence: 'invented', source: status === 'lease' ? 'Fictional; in 1960 the space is to let (the name is its last tenant).' : 'A fictional 1960 business on a real street.' },
  });
}

const landmarks: Landmark[] = [
  ...D.PIERS.map((p: any): Landmark => ({ id: `pier:${p.id}`, name: p.name, kind: 'pier', pos: { u: p.u, v: -20 }, size: { w: p.w, d: p.len }, sign: p.sign, ownable: false, evidence: { confidence: 'approximate', source: 'The amusement piers of 1960; positions approximate (the game puts Hunt\'s Pier at Oak Ave).' } })),
  ...D.LANDMARKS.map((l: any): Landmark => ({ id: `lm:${slug(l.n)}`, name: l.n, kind: l.kind, pos: { u: l.u, v: l.v }, ownable: false, evidence: { confidence: 'approximate', source: 'Placed in the game frame by hand.' } })),
];

const placements: Placement[] = D.PLACES.map((f: any): Placement => {
  const p = f.properties;
  const conf: Confidence = p.located === 'verified' ? 'verified' : (/fictional/i.test(p.source) ? 'invented' : 'approximate');
  return {
    id: f.id, building: p.building, parcelId: p.lotId, name: p.name, kind: p.kind, address: p.address, geo: f.geometry.coordinates,
    years: { from: p.opened, to: p.closed, approx: p.datesApprox }, rotation: p.rotation, footprint: p.footprint, art: p.images,
    establishment: p.establishment, public: p.public,
    evidence: { confidence: conf, source: p.source, scope: conf === 'verified' ? ['coordinates', 'identity', 'dates'] : undefined },
  };
});

const INST_KIND: Record<string, Institution['kind']> = { civic: 'city-hall', school: 'school', church: 'church' };
const institutions: Institution[] = placements.filter((p) => p.public && INST_KIND[p.kind]).map((p): Institution => ({
  id: `inst:${p.id}`, kind: INST_KIND[p.kind], name: p.name, placementId: p.id, ownable: false,
  evidence: { confidence: p.evidence.confidence, source: p.kind === 'church' ? `Parish name as the game has it (treat as fictional pending research). ${p.evidence.source}` : p.evidence.source },
}));

const pkg: CityPackage = {
  schemaVersion: 1,
  contentVersion: '2026-10-27.wildwood-1',
  id: 'city:wildwood',
  townId: 'wildwood',
  displayName: 'The Wildwoods',
  regionId: 'region:south-jersey',
  era: { from: 1955, to: 1990 },
  status: 'production',
  detail: 'full',
  geography: {
    crs: 'local-meters',
    frame: { anchor: D.FRAME.anchor, anchorUV: D.FRAME.anchorUV, bearing: D.FRAME.bearing, pin: { lngLat: [-74.79222, 39.00667], uv: [7246, 365], from: 4200 } },
    bounds: { u0: 0, u1: 7600, v0: -260, v1: 2400 },
    verified: false,
    subTowns: [{ id: 'crest', name: 'Wildwood Crest', uMax: 2790 }, { id: 'wildwood', name: 'Wildwood', uMax: 5050 }, { id: 'north', name: 'North Wildwood', uMax: 1e9 }],
    profiles: {
      beach: { pts: [[0, 165], [2800, 150], [4400, 140], [5300, 105], [6400, 70], [7100, 45], [7600, 25]], beyond: 30 },
      bay: { pts: [[0, 520], [1500, 540], [2700, 600], [3300, 690], [4200, 700], [4700, 680], [5200, 640], [6400, 620], [7000, 520], [7500, 300]], beyond: 300 },
    },
    uSouth: D.US, uNorth: D.UN,
    areas: [{ id: 'westww', name: 'West Wildwood', ...D.WW }],
  },
  streets, districts, parcels, businesses, landmarks, institutions,
  routes: [
    { id: 'route:rio-grande-causeway', name: 'The Rio Grande Avenue causeway', kind: 'causeway', to: 'mainland', miles: 2, atStreet: 'Rio Grande Ave', mainlandV: D.CW.mainlandV, evidence: { confidence: 'approximate', source: 'The road onto the island at Rio Grande Avenue (game frame).' } },
    { id: 'route:ocean-drive', name: 'Ocean Drive', kind: 'road', to: 'capemay', miles: 9, years: { from: 1940 }, evidence: { confidence: 'approximate', source: 'The toll road down the islands from the Crest to Cape May; opening year from memory.' } },
    { id: 'route:parkway-ac', name: 'The Garden State Parkway', kind: 'road', to: 'ac', miles: 42, years: { from: 1955 }, evidence: { confidence: 'approximate', source: 'The Parkway reached Cape May County in the mid-fifties; miles approximate.' } },
  ],
  eraRules: [
    { id: 'era:casino', uses: ['casino'], from: 1978, note: 'New Jersey casinos are legal only from 1978 (and only in Atlantic City).' },
    { id: 'era:surf', uses: ['surf'], from: 1962, note: 'Surf shops arrive with the early-sixties surf craze.' },
    { id: 'era:condo', uses: ['condo'], from: 1970, note: 'Condominium buildings come to the shore around 1970.' },
    { id: 'era:mall', uses: ['mall'], from: 1962, note: 'Shopping centers from the early sixties.' },
  ],
  placements,
  walkStretches: D.STRETCHES,
  generation: {
    fill: D.FILL,
    names: { surnames: D.SUR, firstnames: D.FIRST, adj: D.ADJ, noun: D.NOUN, motels: D.MOTEL },
    nextOnLot: D.NEXT,
    flagship: D.FLAG,
  },
  economyProfile: { template: 'shore-resort', seasonalDemand: { summer: 2.5, winter: 0.5 }, note: 'The home town runs the full economy (econ.ts, hood.ts); these are tuning proposals, not history.' },
  provenance: [
    { confidence: 'approximate', source: 'Street frame authored from memory; Hunt\'s Pier and the Hereford Inlet Light pin it to the globe (see placements).' },
    { confidence: 'invented', source: 'Businesses and owners of 1960 are fictional, on real streets.' },
  ],
};

const v = validateCityPackage(pkg);
if (!v.ok) { console.error(v.errors.slice(0, 20)); process.exit(1); }
console.log(`ok; ${v.warnings.length} warnings; ${parcels.length} parcels, ${placements.length} placements`);
writeFileSync(outPath, exportCityPackage(pkg) + '\n');
