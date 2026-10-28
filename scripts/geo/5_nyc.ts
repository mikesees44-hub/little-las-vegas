/**
 * Builds the bundled New York City map (data/nyc/nyc-1960.json) from real
 * geodata. Run once, offline, after downloading the sources:
 *
 *   mkdir -p data/nyc/downloads && cd data/nyc/downloads
 *   curl -O https://raw.githubusercontent.com/dwillis/nyc-maps/master/boroughs.geojson
 *   curl -o NYC_geography_master_NTA.geo.json https://raw.githubusercontent.com/nycehs/NYC_geography/master/NTA.geo.json
 *   curl -O https://raw.githubusercontent.com/OpenDataDE/State-zip-code-GeoJSON/master/nj_new_jersey_zip_codes_geo.min.json
 *   curl -O https://raw.githubusercontent.com/OpenDataDE/State-zip-code-GeoJSON/master/ny_new_york_zip_codes_geo.min.json
 *   cd ../../.. && npx tsx scripts/geo/5_nyc.ts
 *
 * Sources and licences:
 *  - Borough boundaries, water-clipped (NYC Department of City Planning,
 *    "Bytes of the Big Apple", via github.com/dwillis/nyc-maps): public domain.
 *  - Neighborhood Tabulation Areas 2010 (NYC Department of City Planning,
 *    simplified by NYC DOHMH Environmental Health, github.com/nycehs/NYC_geography):
 *    public domain.
 *  - New Jersey, Westchester and Nassau shores: US Census Bureau TIGER/Line
 *    2010 ZIP Code Tabulation Areas (public domain), via
 *    github.com/OpenDataDE/State-zip-code-GeoJSON, dissolved into land.
 *  - Bridges, tunnels, ferries, the 1960 highways and the Bronx el are traced
 *    by hand from their real end points (approximate, a few hundred feet).
 *
 * The output is projected (a local equirectangular projection, 1 unit ≈ 50 m)
 * to SVG path strings, so the game needs no projection code at runtime and
 * the JSON stays small.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import mapshaper from 'mapshaper';
import { NYC_DISTRICTS } from '../../src/engine/nycData';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DL = join(ROOT, 'data', 'nyc', 'downloads');
const OUT = join(ROOT, 'data', 'nyc', 'nyc-1960.json');

/** The frame: lon -74.27 … -73.68, lat 40.48 … 40.93. */
export const META = { lon0: -74.27, lat0: 40.93, lon1: -73.68, lat1: 40.48, latc: 40.7, k: 2240 };
const COS = Math.cos((META.latc * Math.PI) / 180);
const proj = (lon: number, lat: number): [number, number] => [(lon - META.lon0) * COS * META.k, (META.lat0 - lat) * META.k];
const W = Math.round(proj(META.lon1, META.lat1)[0]);
const H = Math.round(proj(META.lon1, META.lat1)[1]);
const r1 = (v: number) => Math.round(v * 10) / 10;

type Ring = [number, number][];
type Poly = Ring[];

function polysOf(g: GeoJSON.Geometry | null): Poly[] {
  if (!g) return [];
  if (g.type === 'Polygon') return [g.coordinates as Poly];
  if (g.type === 'MultiPolygon') return g.coordinates as Poly[];
  return [];
}

/** Projected rings to an SVG path ("M…Z" per ring). */
function pathOf(polys: Poly[], projected = false): string {
  const parts: string[] = [];
  for (const p of polys) {
    for (const ring of p) {
      const pts = (projected ? ring : ring.map(([x, y]) => proj(x, y))).map(([x, y]) => [r1(x), r1(y)] as const);
      const out: string[] = [];
      let last = '';
      for (const [x, y] of pts) {
        const s = `${x} ${y}`;
        if (s !== last) out.push(s);
        last = s;
      }
      if (out.length >= 3) parts.push(`M${out.join('L')}Z`);
    }
  }
  return parts.join('');
}

function linePath(lines: number[][][], projected = false): string {
  return lines.map((l) => `M${l.map(([x, y]) => (projected ? [x, y] : proj(x, y))).map(([x, y]) => `${r1(x)} ${r1(y)}`).join('L')}`).join('');
}

async function run(cmd: string, inputs: Record<string, unknown>): Promise<GeoJSON.FeatureCollection> {
  const out = await mapshaper.applyCommands(`${cmd} -o out.json format=geojson precision=0.00001`, inputs);
  const txt = out['out.json'];
  const fc = JSON.parse(typeof txt === 'string' ? txt : Buffer.from(txt).toString('utf8'));
  return fc.type === 'FeatureCollection' ? fc : { type: 'FeatureCollection', features: fc.geometries ? fc.geometries.map((g: GeoJSON.Geometry) => ({ type: 'Feature', properties: {}, geometry: g })) : [] };
}

/** Clip projected rings to the half-plane on `keep`'s side of the line a→b (Sutherland–Hodgman). */
function clipHalf(polys: Poly[], a: [number, number], b: [number, number], keep: [number, number]): Poly[] {
  const side = (p: [number, number]) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  const sgn = Math.sign(side(keep));
  const inside = (p: [number, number]) => side(p) * sgn >= 0;
  const cut = (p: [number, number], q: [number, number]): [number, number] => {
    const sp = side(p);
    const sq = side(q);
    const t = sp / (sp - sq);
    return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  };
  const out: Poly[] = [];
  for (const poly of polys) {
    const np: Poly = [];
    for (const ring of poly) {
      const res: Ring = [];
      for (let i = 0; i < ring.length; i++) {
        const cur = ring[i];
        const prev = ring[(i + ring.length - 1) % ring.length];
        if (inside(cur)) {
          if (!inside(prev)) res.push(cut(prev, cur));
          res.push(cur);
        } else if (inside(prev)) res.push(cut(prev, cur));
      }
      if (res.length >= 3) np.push(res);
    }
    if (np.length) out.push(np);
  }
  return out;
}

const projPolys = (polys: Poly[]): Poly[] => polys.map((p) => p.map((r) => r.map(([x, y]) => proj(x, y))));

function centroid(polys: Poly[]): [number, number] {
  let ax = 0, ay = 0, aa = 0;
  for (const p of polys) {
    const r = p[0];
    for (let i = 0; i < r.length; i++) {
      const [x0, y0] = r[i];
      const [x1, y1] = r[(i + 1) % r.length];
      const c = x0 * y1 - x1 * y0;
      aa += c; ax += (x0 + x1) * c; ay += (y0 + y1) * c;
    }
  }
  return aa ? [r1(ax / (3 * aa)), r1(ay / (3 * aa))] : [0, 0];
}

/* ------------------------------------------------------------------ */
/* Hand-traced lines and labels (lon, lat), as of 1960                  */
/* ------------------------------------------------------------------ */

type LineKind = 'bridge' | 'tunnel' | 'ferry' | 'road' | 'el' | 'planned';
const LINES: { id: string; name: string; kind: LineKind; year?: number; pts: [number, number][] }[] = [
  { id: 'brooklynbr', name: 'Brooklyn Bridge', kind: 'bridge', year: 1883, pts: [[-74.0007, 40.7113], [-73.9905, 40.7006]] },
  { id: 'manhattanbr', name: 'Manhattan Bridge', kind: 'bridge', year: 1909, pts: [[-73.995, 40.7148], [-73.9875, 40.701]] },
  { id: 'williamsburgbr', name: 'Williamsburg Bridge', kind: 'bridge', year: 1903, pts: [[-73.9845, 40.7177], [-73.964, 40.711]] },
  { id: 'queensborobr', name: 'Queensboro Bridge', kind: 'bridge', year: 1909, pts: [[-73.964, 40.7605], [-73.942, 40.7505]] },
  { id: 'triborough', name: 'Triborough Bridge', kind: 'bridge', year: 1936, pts: [[-73.933, 40.802], [-73.9255, 40.798], [-73.915, 40.7775]] },
  { id: 'triboroughbx', name: 'Triborough Bridge (Bronx span)', kind: 'bridge', year: 1936, pts: [[-73.9255, 40.798], [-73.917, 40.807]] },
  { id: 'hellgate', name: 'Hell Gate Bridge (rail)', kind: 'bridge', year: 1917, pts: [[-73.9195, 40.7805], [-73.927, 40.7855]] },
  { id: 'gwb', name: 'George Washington Bridge', kind: 'bridge', year: 1931, pts: [[-73.944, 40.8505], [-73.964, 40.8545]] },
  { id: 'henryhudson', name: 'Henry Hudson Bridge', kind: 'bridge', year: 1936, pts: [[-73.9215, 40.8775], [-73.9195, 40.8805]] },
  { id: 'whitestone', name: 'Bronx–Whitestone Bridge', kind: 'bridge', year: 1939, pts: [[-73.833, 40.8075], [-73.8285, 40.7915]] },
  { id: 'throgsneck', name: 'Throgs Neck Bridge (building; opens 1961)', kind: 'planned', year: 1961, pts: [[-73.7945, 40.8135], [-73.7915, 40.797]] },
  { id: 'bayonnebr', name: 'Bayonne Bridge', kind: 'bridge', year: 1931, pts: [[-74.14, 40.637], [-74.1415, 40.646]] },
  { id: 'goethals', name: 'Goethals Bridge', kind: 'bridge', year: 1928, pts: [[-74.194, 40.633], [-74.205, 40.637]] },
  { id: 'outerbridge', name: 'Outerbridge Crossing', kind: 'bridge', year: 1928, pts: [[-74.242, 40.524], [-74.258, 40.529]] },
  { id: 'marinepkwy', name: 'Marine Parkway Bridge', kind: 'bridge', year: 1937, pts: [[-73.886, 40.581], [-73.8845, 40.5695]] },
  { id: 'crossbay', name: 'Cross Bay Bridge', kind: 'bridge', year: 1939, pts: [[-73.8195, 40.597], [-73.8165, 40.5855]] },
  { id: 'holland', name: 'Holland Tunnel', kind: 'tunnel', year: 1927, pts: [[-74.0105, 40.7255], [-74.034, 40.7275]] },
  { id: 'lincoln', name: 'Lincoln Tunnel', kind: 'tunnel', year: 1937, pts: [[-73.9985, 40.7595], [-74.0225, 40.7665]] },
  { id: 'battery', name: 'Brooklyn–Battery Tunnel', kind: 'tunnel', year: 1950, pts: [[-74.013, 40.702], [-74.0, 40.682]] },
  { id: 'midtown', name: 'Queens–Midtown Tunnel', kind: 'tunnel', year: 1940, pts: [[-73.9745, 40.7475], [-73.953, 40.7445]] },
  { id: 'siferry', name: 'Staten Island Ferry', kind: 'ferry', pts: [[-74.013, 40.7005], [-74.035, 40.68], [-74.059, 40.656], [-74.0725, 40.644]] },
  { id: 'bayridgeferry', name: '69th Street ferry (Bay Ridge–St. George)', kind: 'ferry', pts: [[-74.0365, 40.635], [-74.071, 40.643]] },
  { id: 'narrows', name: 'The Narrows: a bridge is planned (1964)', kind: 'planned', year: 1964, pts: [[-74.031, 40.6085], [-74.061, 40.6025]] },
  { id: 'westside', name: 'West Side Highway (elevated)', kind: 'road', pts: [[-74.014, 40.706], [-74.013, 40.718], [-74.011, 40.73], [-74.009, 40.74], [-74.007, 40.748], [-74.003, 40.756], [-73.998, 40.764], [-73.993, 40.771], [-73.988, 40.78], [-73.984, 40.79], [-73.97, 40.81], [-73.956, 40.83], [-73.947, 40.848], [-73.934, 40.865], [-73.922, 40.879]] },
  { id: 'eastriver', name: 'East River Drive', kind: 'road', pts: [[-74.011, 40.702], [-74.001, 40.708], [-73.989, 40.711], [-73.976, 40.718], [-73.974, 40.73], [-73.971, 40.742], [-73.966, 40.752], [-73.957, 40.764], [-73.946, 40.777], [-73.94, 40.788], [-73.933, 40.799], [-73.933, 40.81], [-73.929, 40.825], [-73.93, 40.838], [-73.933, 40.846]] },
  { id: 'broadway', name: 'Broadway', kind: 'road', pts: [[-74.0137, 40.705], [-74.009, 40.712], [-74.006, 40.718], [-73.999, 40.726], [-73.991, 40.735], [-73.989, 40.741], [-73.987, 40.7505], [-73.9855, 40.758], [-73.982, 40.768], [-73.982, 40.778], [-73.972, 40.794], [-73.962, 40.808], [-73.95, 40.825], [-73.94, 40.841], [-73.93, 40.858], [-73.914, 40.874]] },
  { id: 'concourse', name: 'Grand Concourse', kind: 'road', pts: [[-73.929, 40.818], [-73.923, 40.83], [-73.915, 40.845], [-73.905, 40.86], [-73.892, 40.872], [-73.882, 40.879]] },
  { id: 'belt', name: 'Belt Parkway', kind: 'road', pts: [[-74.033, 40.63], [-74.039, 40.615], [-74.03, 40.606], [-74.008, 40.598], [-73.994, 40.588], [-73.976, 40.583], [-73.956, 40.583], [-73.93, 40.586], [-73.9, 40.593], [-73.885, 40.62], [-73.86, 40.655], [-73.83, 40.662], [-73.8, 40.665], [-73.77, 40.665], [-73.74, 40.67]] },
  { id: 'oceanpkwy', name: 'Ocean Parkway', kind: 'road', pts: [[-73.975, 40.644], [-73.969, 40.578]] },
  { id: 'gowanus', name: 'Gowanus Parkway', kind: 'road', pts: [[-74.001, 40.68], [-74.01, 40.66], [-74.027, 40.638]] },
  { id: 'queensblvd', name: 'Queens Boulevard', kind: 'road', pts: [[-73.94, 40.746], [-73.9, 40.742], [-73.87, 40.733], [-73.835, 40.714], [-73.81, 40.706]] },
  { id: 'gcp', name: 'Grand Central Parkway', kind: 'road', pts: [[-73.92, 40.775], [-73.87, 40.765], [-73.835, 40.75], [-73.79, 40.72], [-73.735, 40.735]] },
  { id: 'vanwyck', name: 'Van Wyck Expressway', kind: 'road', pts: [[-73.83, 40.74], [-73.825, 40.7], [-73.8, 40.66], [-73.79, 40.65]] },
  { id: 'thirdel', name: 'Third Avenue El (Bronx; the Manhattan line came down in 1955)', kind: 'el', pts: [[-73.917, 40.816], [-73.901, 40.845], [-73.89, 40.86], [-73.878, 40.872], [-73.863, 40.889]] },
];

type LabelKind = 'water' | 'borough' | 'nj' | 'landmark';
const LABELS: { name: string; kind: LabelKind; at: [number, number]; rot?: number; note?: string }[] = [
  { name: 'Hudson River', kind: 'water', at: [-74.017, 40.783], rot: -62 },
  { name: 'East River', kind: 'water', at: [-73.966, 40.731], rot: -78 },
  { name: 'Harlem River', kind: 'water', at: [-73.931, 40.833], rot: -70 },
  { name: 'Upper New York Bay', kind: 'water', at: [-74.047, 40.665] },
  { name: 'Lower New York Bay', kind: 'water', at: [-74.04, 40.54] },
  { name: 'The Narrows', kind: 'water', at: [-74.046, 40.612], rot: -10 },
  { name: 'Jamaica Bay', kind: 'water', at: [-73.835, 40.618] },
  { name: 'Long Island Sound', kind: 'water', at: [-73.745, 40.83] },
  { name: 'Atlantic Ocean', kind: 'water', at: [-73.88, 40.535] },
  { name: 'Arthur Kill', kind: 'water', at: [-74.22, 40.575], rot: -60 },
  { name: 'Kill Van Kull', kind: 'water', at: [-74.11, 40.643], rot: 8 },
  { name: 'Newark Bay', kind: 'water', at: [-74.14, 40.675], rot: -60 },
  { name: 'Flushing Bay', kind: 'water', at: [-73.853, 40.764] },
  { name: 'Gravesend Bay', kind: 'water', at: [-74.005, 40.588] },
  { name: 'MANHATTAN', kind: 'borough', at: [-73.968, 40.784], rot: -61 },
  { name: 'BROOKLYN', kind: 'borough', at: [-73.945, 40.645] },
  { name: 'QUEENS', kind: 'borough', at: [-73.82, 40.725] },
  { name: 'THE BRONX', kind: 'borough', at: [-73.865, 40.845] },
  { name: 'STATEN ISLAND', kind: 'borough', at: [-74.15, 40.585] },
  { name: 'NEW JERSEY', kind: 'nj', at: [-74.2, 40.79] },
  { name: 'Jersey City', kind: 'nj', at: [-74.068, 40.725] },
  { name: 'Hoboken', kind: 'nj', at: [-74.03, 40.746] },
  { name: 'Newark', kind: 'nj', at: [-74.18, 40.735] },
  { name: 'Bayonne', kind: 'nj', at: [-74.115, 40.665] },
  { name: 'Elizabeth', kind: 'nj', at: [-74.215, 40.664] },
  { name: 'Fort Lee', kind: 'nj', at: [-73.975, 40.855] },
  { name: 'WESTCHESTER', kind: 'nj', at: [-73.84, 40.915] },
  { name: 'NASSAU', kind: 'nj', at: [-73.705, 40.71] },
  { name: 'Statue of Liberty', kind: 'landmark', at: [-74.0445, 40.6892] },
  { name: 'Ellis Island (closed 1954)', kind: 'landmark', at: [-74.0396, 40.6995] },
  { name: 'Governors Island (Army)', kind: 'landmark', at: [-74.0168, 40.6894] },
  { name: 'Penn Station', kind: 'landmark', at: [-73.9935, 40.7505] },
  { name: 'Grand Central', kind: 'landmark', at: [-73.9772, 40.7527] },
  { name: 'Empire State Building', kind: 'landmark', at: [-73.9857, 40.7484] },
  { name: 'Yankee Stadium', kind: 'landmark', at: [-73.9262, 40.8296] },
  { name: 'Polo Grounds (empty since the Giants left)', kind: 'landmark', at: [-73.9375, 40.831] },
  { name: 'Ebbets Field (coming down, 1960)', kind: 'landmark', at: [-73.958, 40.665] },
  { name: 'Brooklyn Navy Yard', kind: 'landmark', at: [-73.972, 40.702] },
  { name: 'Floyd Bennett Field (Navy)', kind: 'landmark', at: [-73.893, 40.591] },
  { name: 'Aqueduct', kind: 'landmark', at: [-73.83, 40.672] },
  { name: 'Rikers Island', kind: 'landmark', at: [-73.882, 40.792] },
  { name: 'Central Park', kind: 'landmark', at: [-73.9654, 40.7829] },
  { name: 'Prospect Park', kind: 'landmark', at: [-73.969, 40.6602] },
  { name: 'Flushing Meadows', kind: 'landmark', at: [-73.8448, 40.7397] },
];

async function main() {
  const boroughsRaw = readFileSync(join(DL, 'boroughs.geojson'), 'utf8');
  const ntaRaw = readFileSync(join(DL, 'NYC_geography_master_NTA.geo.json'), 'utf8');
  const njRaw = readFileSync(join(DL, 'nj_new_jersey_zip_codes_geo.min.json'), 'utf8');
  const nyRaw = readFileSync(join(DL, 'ny_new_york_zip_codes_geo.min.json'), 'utf8');
  const bbox = `${META.lon0},${META.lat1},${META.lon1},${META.lat0}`;

  // The five boroughs: the real shoreline, simplified to ~15 m.
  const boroughs = await run('-i b.json -simplify interval=15 keep-shapes -filter-slivers min-area=2000m2', { 'b.json': boroughsRaw });
  // New Jersey, Westchester, Nassau: the Census ZCTAs' land, clipped to the frame, the boroughs cut out.
  const outside = await run(`-i nj.json ny.json combine-files -merge-layers force -clip bbox=${bbox} -dissolve -erase b.json -simplify interval=20 -filter-slivers min-area=200000m2`, { 'nj.json': njRaw, 'ny.json': nyRaw, 'b.json': boroughsRaw });
  // Parks and cemeteries (the NTA "park-cemetery-etc" areas), on the land.
  const parks = await run('-i n.json -filter "/^park-cemetery/.test(NTAName)" -clip b.json -filter-slivers min-area=5000m2', { 'n.json': ntaRaw, 'b.json': boroughsRaw });
  // The neighborhood grid: shared NTA borders only, on the land.
  const mesh = await run('-i n.json -clip b.json -innerlines', { 'n.json': ntaRaw, 'b.json': boroughsRaw });
  // Each NTA on its own, clipped to the land, for the districts.
  const ntas = await run('-i n.json -clip b.json', { 'n.json': ntaRaw, 'b.json': boroughsRaw });

  const boroughOut = boroughs.features.map((f) => ({ name: String(f.properties?.BoroName), code: Number(f.properties?.BoroCode), d: pathOf(polysOf(f.geometry)) }));
  const byNta = new Map<string, Poly[]>();
  for (const f of ntas.features) {
    const code = String(f.properties?.NTACode);
    byNta.set(code, [...(byNta.get(code) ?? []), ...polysOf(f.geometry)]);
  }
  const districts: Record<string, { d: string; c: [number, number]; at: [number, number] }> = {};
  for (const d of NYC_DISTRICTS) {
    let polys = projPolys(d.ntas.flatMap((c) => {
      const p = byNta.get(c);
      if (!p) throw new Error(`NTA ${c} (district ${d.id}) not in the source`);
      return p;
    }));
    if (d.clip) polys = clipHalf(polys, proj(...d.clip.line[0]), proj(...d.clip.line[1]), proj(...d.clip.keep));
    const at = proj(...d.at);
    districts[d.id] = { d: pathOf(polys, true), c: centroid(polys), at: [r1(at[0]), r1(at[1])] };
  }
  const meshLines = mesh.features.flatMap((f) => {
    const g = f.geometry;
    if (!g) return [];
    if (g.type === 'LineString') return [g.coordinates as number[][]];
    if (g.type === 'MultiLineString') return g.coordinates as number[][][];
    return [];
  });

  const out = {
    meta: {
      ...META, width: W, height: H,
      sources: [
        'Borough boundaries: NYC Department of City Planning (public domain), via github.com/dwillis/nyc-maps',
        'Neighborhood Tabulation Areas 2010: NYC Department of City Planning (public domain), via github.com/nycehs/NYC_geography',
        'New Jersey, Westchester and Nassau shores: US Census Bureau TIGER/Line 2010 ZCTAs (public domain), via github.com/OpenDataDE/State-zip-code-GeoJSON',
        'Bridges, tunnels, ferries, highways and the el: traced by hand from their real end points (approximate)',
      ],
      attribution: 'NYC Dept. of City Planning · US Census Bureau (public domain)',
    },
    outside: pathOf(outside.features.flatMap((f) => polysOf(f.geometry))),
    boroughs: boroughOut,
    parks: pathOf(parks.features.flatMap((f) => polysOf(f.geometry))),
    mesh: linePath(meshLines),
    districts,
    lines: LINES.map((l) => ({ id: l.id, name: l.name, kind: l.kind, ...(l.year ? { year: l.year } : {}), d: linePath([l.pts]), mid: (() => { const m = l.pts[Math.floor((l.pts.length - 1) / 2)]; const n = l.pts[Math.ceil((l.pts.length - 1) / 2)]; const p = proj((m[0] + n[0]) / 2, (m[1] + n[1]) / 2); return [r1(p[0]), r1(p[1])]; })() })),
    labels: LABELS.map((l) => { const p = proj(...l.at); return { name: l.name, kind: l.kind, x: r1(p[0]), y: r1(p[1]), ...(l.rot ? { rot: l.rot } : {}) }; }),
  };
  const json = JSON.stringify(out);
  writeFileSync(OUT, json);
  console.log(`wrote ${OUT}: ${(json.length / 1024).toFixed(1)} KB (${W}×${H}); boroughs ${boroughOut.length}, districts ${Object.keys(districts).length}`);
  for (const [k, v] of Object.entries(out)) if (typeof v === 'string') console.log(`  ${k}: ${(v.length / 1024).toFixed(1)} KB`);
  console.log(`  boroughs: ${(boroughOut.reduce((a, b) => a + b.d.length, 0) / 1024).toFixed(1)} KB`);
}

main().catch((e) => { console.error(e); process.exit(1); });
