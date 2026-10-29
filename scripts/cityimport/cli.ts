/**
 * The city importer (dev time only; players never trigger it).
 *
 *   npx tsx scripts/cityimport/cli.ts <command> [--city wildwood] [--area test-blocks] [--offline]
 *
 * Commands
 *   fetch      download every source for the area into citydata/<city>/raw/ (cached; polite)
 *   handoff    copy files a person downloaded in a browser: --from <dir> [--images a.jpg,b.jpg]
 *   sheets     download Sanborn sheets: --item sanborn05568_015 --sheets ind3,63B,27 [--pct 50]
 *   build      build the city pack (citydata/<city>/packs/<area>/) and the game layer (public/geo/)
 *   validate   check a built pack against the schema
 *   sanborn-geo  fit the 1950 Sanborn sheets' control points (evidence/sanborn-1950-control-points.json) to OSM:
 *              evidence/sanborn-1950-georef.json, public/geo/sanborn-1950-wildwood.json (+ --images <dir> --bundle 43,49:
 *              downscaled copies of a few sheets in public/sanborn/)
 *   grid       re-derive the game's island grid (frame, street order, avenues, outlines, districts) from the
 *              island download and re-place the town package's records on it (src/worldpack/cities/wildwood.json)
 *   all        fetch (or use the cache) then build and validate
 *
 * --offline: use the cache only and report every source that would need the network.
 */
import { CITIES } from './config/cities';
import { fetchOsm } from './fetch/osm';
import { fetchNjginParcels } from './fetch/njgin-parcels';
import { fetchSanbornIndex, fetchSanbornSheets } from './fetch/loc-sanborn';
import { fetchPhilly } from './fetch/philly';
import { ingestHandoff } from './fetch/handoff';
import { printReport, type SourceStatus } from './lib/http';
import { cityDir, readManifest } from './lib/manifest';
import { buildPack } from './build/pack';
import { validatePackDir } from './build/schema';
import { join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const cmd = argv[0];
const arg = (n: string, d?: string): string | undefined => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const flag = (n: string) => argv.includes(`--${n}`);

const city = CITIES[arg('city', 'wildwood')!];
if (!city) { console.error(`unknown city; known: ${Object.keys(CITIES).join(', ')}`); process.exit(2); }
const area = city.areas.find((a) => a.id === arg('area', 'test-blocks'));
if (!area) { console.error(`unknown area; known: ${city.areas.map((a) => a.id).join(', ')}`); process.exit(2); }
const offline = flag('offline');

async function fetchAll(): Promise<SourceStatus[]> {
  const out: SourceStatus[] = [];
  const m = readManifest(city.id);
  const withCache = (s: SourceStatus): SourceStatus => {
    if (s.status !== 'unreachable') return s;
    const cached = m.files.filter((f) => f.sourceId === s.sourceId && (f.areaId === area!.id || f.areaId === '*'));
    return cached.length ? { ...s, status: offline ? 'cached' : 'unreachable', detail: `${s.detail}. Using the cached copy: ${cached.map((f) => `${f.file} (${f.retrievedBy}, ${f.downloadedAt.slice(0, 10)})`).join('; ')}` } : s;
  };
  for (const s of city.sources) {
    if (s.kind === 'osm') out.push(withCache(await fetchOsm(city, area!, { offline })));
    else if (s.id === 'njgin-parcels') out.push(withCache(await fetchNjginParcels(city, area!, { offline })));
    else if (s.kind === 'loc-iiif') for (const v of city.sanborn ?? []) {
      if (!v.scanned) { out.push({ sourceId: 'loc-sanborn', status: 'skipped', detail: `${v.item} (${v.date}) is not scanned online` }); continue; }
      out.push(withCache(await fetchSanbornIndex(city, v.item, { offline })));
    }
    else if (s.kind === 'philly-opendata') out.push(await fetchPhilly(city, area!, { offline, enable: flag('enable-philly') }));
    else out.push({ sourceId: s.id, status: 'skipped', detail: 'manual source (see config/cities.ts)' });
  }
  return out;
}

async function main() {
  if (cmd === 'fetch' || cmd === 'all') {
    const rep = await fetchAll();
    console.log(`\nSources for ${city.id}/${area!.id}${offline ? ' (offline: cache only)' : ''}:`);
    printReport(rep);
    writeFileSync(join(cityDir(city.id), 'raw', `fetch-report-${area!.id}.json`), `${JSON.stringify({ at: new Date().toISOString(), offline, sources: rep }, null, 1)}\n`);
    if (cmd === 'fetch') return;
    runBuild(rep);
    return;
  }
  if (cmd === 'handoff') {
    const from = arg('from');
    if (!from) throw new Error('--from <dir> required');
    const r = ingestHandoff(city, area!, from, { images: (arg('images') ?? '').split(',').filter(Boolean) });
    for (const c of r.copied) console.log(`copied  raw/${c.file}  (${c.bytes} bytes, ${c.sourceId}, downloaded ${c.downloadedAt})`);
    for (const s of r.skipped) console.log(`skipped ${s.file}: ${s.why}`);
    return;
  }
  if (cmd === 'sheets') {
    const r = await fetchSanbornSheets(city, arg('item', city.sanborn?.[0]?.item)!, (arg('sheets') ?? '').split(',').filter(Boolean), { offline, pct: Number(arg('pct', '50')) });
    printReport([r]);
    return;
  }
  if (cmd === 'build') { runBuild(); return; }
  if (cmd === 'grid') { await runGrid(); return; }
  if (cmd === 'sanborn-geo') { await runSanbornGeo(); return; }
  if (cmd === 'grid-geo') { await runGridGeo(); return; }
  if (cmd === 'validate') { validate(); return; }
  console.log('commands: fetch | handoff | sheets | build | validate | all   (see the header of scripts/cityimport/cli.ts)');
}

function runBuild(rep?: SourceStatus[]) {
  const last = join(cityDir(city.id), 'raw', `fetch-report-${area!.id}.json`);
  const report = rep ?? (existsSync(last) ? (JSON.parse(readFileSync(last, 'utf8')) as { sources: SourceStatus[] }).sources : undefined);
  const r = buildPack(city, area!, { fetchReport: report });
  console.log(`\nBuilt ${r.packDir}`);
  console.log(JSON.stringify(r.counts, null, 1));
  console.log(`alignment: rms ${r.alignment.fit.rmsBefore} m -> ${r.alignment.fit.rmsAfter} m after fit over ${r.alignment.fit.n} streets`);
  console.log(`game layer: ${r.gameLayerFile}`);
  validate();
}

/** The world map's Wildwood districts (public/geo/wildwood.json) from the package's outlines. */
async function runGridGeo() {
  const { worldMapDistricts } = await import('./build/islandpkg');
  const pkg = JSON.parse(readFileSync(join(cityDir(city.id), '..', '..', 'src', 'worldpack', 'cities', 'wildwood.json'), 'utf8'));
  const fc = worldMapDistricts(pkg);
  writeFileSync(join(cityDir(city.id), '..', '..', 'public', 'geo', 'wildwood.json'), JSON.stringify(fc));
  console.log(`public/geo/wildwood.json: ${fc.features.length} districts`);
}

async function runSanbornGeo() {
  const { parseOsm } = await import('./build/osm');
  const { fitSheets } = await import('./build/sanborngeo');
  const { frameFns } = await import('../../src/engine/cityPackage');
  const { fitAffine } = await import('./build/sanborngeo');
  const m0 = readManifest(city.id);
  const osmF = m0.files.find((f) => f.sourceId === 'osm' && f.areaId === 'island');
  if (!osmF) throw new Error('the island OSM download is not in the raw manifest');
  const ev = join(cityDir(city.id), 'evidence');
  const doc = JSON.parse(readFileSync(join(ev, 'sanborn-1950-control-points.json'), 'utf8'));
  const osm = parseOsm(JSON.parse(readFileSync(join(cityDir(city.id), 'raw', osmF.file), 'utf8')));
  const pkg = JSON.parse(readFileSync(join(cityDir(city.id), '..', '..', 'src', 'worldpack', 'cities', 'wildwood.json'), 'utf8'));
  const fns = frameFns(pkg.geography.frame);
  const towns = pkg.geography.subTowns as { id: string; uMax: number }[];
  const townOf = (ll: [number, number]) => { const [u] = fns.toUv(ll); return towns.find((t) => u < t.uMax)?.id; };
  const fits = fitSheets(osm, doc, city.origin, townOf);
  const now = new Date().toISOString();
  // Scans in the image folder that no frame uses: listed, with why.
  const notExamined: { file: string; why: string }[] = [];
  const imgDir0 = arg('images');
  if (imgDir0) {
    const { readdirSync } = await import('node:fs');
    const used = new Set(fits.map((f) => f.file));
    for (const f of readdirSync(imgDir0).filter((x) => x.endsWith('.jpg')).sort()) {
      if (used.has(f)) continue;
      const m = /_(\d{4})([AB]?)\.jpg$/.exec(f);
      const n = m ? Number(m[1]) : NaN;
      notExamined.push({ file: f, why: !m ? 'cover, title or index page (ind2: the 1949 Additional Index, transcribed separately; ind3: the main index)' : n < 27 ? 'outside Five Mile Beach (the key map on sheet 30 gives the island as sheets 27-63B and 104-109); not examined' : 'on the island; not examined in this pass (control points not read yet)' });
    }
  }
  writeFileSync(join(ev, 'sanborn-1950-georef.json'), `${JSON.stringify({ schemaVersion: 1, generatedAt: now, source: doc.source, notExamined, method: `${doc.method} Fit: least-squares affine, pixel -> local metres (scripts/cityimport/build/sanborngeo.ts); registered when RMS <= 15 m (key map 60 m). looMaxM: each point predicted from the others.`, sheets: fits }, null, 1)}\n`);
  // The game's copy: an SVG matrix per frame, pixel -> (u, -v) in the island frame (fitted on a 5x5 grid of the scan).
  const crs = (await import('./lib/crs')).localCrs(city.origin);
  const bundleIds = (arg('bundle') ?? '').split(',').filter(Boolean);
  const imgDir = arg('images');
  const bundled: Record<string, string> = {};
  if (imgDir && bundleIds.length) {
    const { execFileSync } = await import('node:child_process');
    mkdirSync(join(cityDir(city.id), '..', '..', 'public', 'sanborn'), { recursive: true });
    for (const id of bundleIds) {
      const f = fits.find((x) => x.sheet === id && x.status === 'registered');
      if (!f) continue;
      const out = `sanborn1950-${id}-small.jpg`;
      execFileSync('python3', ['-I', '-c', 'import sys; from PIL import Image; im=Image.open(sys.argv[1]).convert("RGB"); w=int(sys.argv[3]); im=im.resize((w, round(im.height*w/im.width)), Image.LANCZOS); im.save(sys.argv[2], quality=62, optimize=True)', join(imgDir, f.file), join(cityDir(city.id), '..', '..', 'public', 'sanborn', out), '640']);
      bundled[id] = out;
    }
  }
  const game = fits.filter((f) => f.status === 'registered').map((f) => {
    const A = f.affine!;
    const [x0, y0, x1, y1] = f.crop ?? [0, 0, f.size[0], f.size[1]];
    const px: [number, number][] = []; const uv: [number, number][] = [];
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
      const p: [number, number] = [x0 + ((x1 - x0) * i) / 4, y0 + ((y1 - y0) * j) / 4];
      const ll = crs.inverse(A[0] * p[0] + A[1] * p[1] + A[2], A[3] * p[0] + A[4] * p[1] + A[5]);
      const [u, v] = fns.toUv(ll);
      px.push(p); uv.push([u, -v]);
    }
    const M = fitAffine(px, uv)!;
    const r = (x: number) => Math.round(x * 1e5) / 1e5;
    return { id: f.sheet, file: f.file, size: f.size, crop: f.crop, kind: f.kind, rmsM: f.rmsM, small: bundled[f.sheet], matrix: [r(M[0]), r(M[3]), r(M[1]), r(M[4]), Math.round(M[2] * 10) / 10, Math.round(M[5] * 10) / 10] };
  });
  writeFileSync(join(cityDir(city.id), '..', '..', 'public', 'geo', 'sanborn-1950-wildwood.json'), JSON.stringify({ v: 1, title: 'Sanborn Fire Insurance Map, New Jersey Coast Vol. 4 (1909, corrected to Nov 1950)', attribution: 'Sanborn Map Company; Library of Congress, Geography and Map Division (public domain)', note: 'matrix: SVG matrix(a b c d e f) taking a scan pixel to the island frame (u, -v). Images: by file name (the asset store, later); `small` ones ship in public/sanborn/.', sheets: game }));
  for (const f of fits) console.log(`${f.sheet.padEnd(16)} ${f.status.padEnd(11)} ${f.status === 'registered' ? `rms ${f.rmsM} m, max ${f.maxM} m, leave-one-out max ${f.looMaxM ?? '-'} m, ${f.points.filter((p) => p.found).length} points, ${f.scaleMPerPx} m/px` : f.why}`);
  console.log(`${fits.filter((f) => f.status === 'registered').length} of ${fits.length} frames registered (${new Set(fits.filter((f) => f.status === 'registered').map((f) => f.file)).size} scans); ${notExamined.length} scans not examined; bundled ${Object.keys(bundled).length}`);
}

async function runGrid() {
  const { measureIsland } = await import('./build/islandgrid');
  const { buildIslandGrid, replacePlaces, refitFrontage } = await import('./build/islandpkg');
  const { exportCityPackage, validateCityPackage } = await import('../../src/engine/cityPackage');
  const m0 = readManifest(city.id);
  const osmF = m0.files.find((f) => f.sourceId === 'osm' && f.areaId === 'island');
  const pcF = m0.files.find((f) => f.sourceId === 'njgin-parcels' && f.areaId === 'island');
  if (!osmF || !pcF) throw new Error('the island download is not in the raw manifest: run handoff --area island first');
  const raw = join(cityDir(city.id), 'raw');
  const pkgFile = join(cityDir(city.id), '..', '..', 'src', 'worldpack', 'cities', 'wildwood.json');
  // The records are re-placed from the old (memory) grid: the package before the first run (or --legacy <file>, a copy of it).
  const legacyFile = arg('legacy');
  const old = JSON.parse(readFileSync(legacyFile ?? pkgFile, 'utf8'));
  if (old.geography?.frame?.spine) throw new Error('the package already has the real grid (frame.spine): re-placing would move its records twice. Pass --legacy <the package as it was on the memory grid> (git show 23dcadc:src/worldpack/cities/wildwood.json).');
  const doc = JSON.parse(readFileSync(join(raw, osmF.file), 'utf8'));
  const pcs = JSON.parse(readFileSync(join(raw, pcF.file), 'utf8'));
  const now = new Date().toISOString();
  const m = measureIsland(doc, pcs.features);
  const g = buildIslandGrid(m, old, { now });
  const placed = replacePlaces(old, g.pkg, m, g.review);
  const frontage = refitFrontage(old, g.pkg, g.review);
  writeFileSync(pkgFile, `${exportCityPackage(g.pkg)}\n`);
  // The districts' outlines need the game's slot layout on the new grid: load it fresh (it reads the package just written).
  const { allGridSlots } = await import('../../src/engine/hoodGeo');
  const { districtOutlines } = await import('./build/islandpkg');
  const shapes = districtOutlines(m, g.pkg, allGridSlots(), g.debug!.lab, g.debug!.raster);
  for (const d of g.pkg.districts) {
    const rings = shapes[d.id] ?? [];
    if (!rings.length) { g.review.push({ id: `rq-district-${d.id}`, kind: 'district-no-outline', priority: 'high', target: { layer: 'districts', id: d.id }, detail: `${d.name}: no ground on the real island`, suggestion: 'Check its frontage.', status: 'open' }); continue; }
    const area = (x: [number, number][]) => Math.abs(x.reduce((s, p, i) => { const q = x[(i + 1) % x.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
    d.polygon = [...rings].sort((a, b) => area(b) - area(a))[0];
    d.evidence = { confidence: 'approximate', source: `Outline: ${d.id === 'd:crest' || d.id === 'd:north' || d.id === 'd:westww' ? 'the town\'s ground (municipal line from the NJ tax parcels)' : d.id === 'd:boardwalk' ? 'the boards\' strip, beach to Ocean Avenue, Cresse to 16th Avenue' : d.id === 'd:causeway' ? 'the causeway\'s course (OSM) and its mainland end' : 'the part of Wildwood nearest its 1960 lots (on the real grid)'}; traced 2026-10-29 (scripts/cityimport grid). ${rings.length > 1 ? `${rings.length} pieces; all in geography.outlines['${d.id}'].` : ''} 1960 population is a Census-scale guess.` };
    g.pkg.geography.outlines![d.id] = rings;
  }
  const v = validateCityPackage(g.pkg);
  if (!v.ok) { console.error(v.errors.slice(0, 20)); process.exit(1); }
  writeFileSync(pkgFile, `${exportCityPackage(g.pkg)}\n`);
  const packDir = join(cityDir(city.id), 'packs', 'island');
  mkdirSync(packDir, { recursive: true });
  writeFileSync(join(packDir, 'grid-report.json'), `${JSON.stringify({ at: now, ...g.report, placed, frontage }, null, 1)}\n`);
  writeFileSync(join(packDir, 'grid-review.json'), `${JSON.stringify({ schemaVersion: 1, packId: 'wildwood/island-grid', generatedAt: now, items: g.review }, null, 1)}\n`);
  writeFileSync(join(cityDir(city.id), 'evidence', 'osm-street-order.json'), `${JSON.stringify({ note: 'The island\'s cross streets in their real order (south to north), measured from OpenStreetMap (2026-10-29) in the game frame: u where each crosses the middle of the island. Written by `cli.ts grid`; tests check the game\'s grid against it.', source: '© OpenStreetMap contributors (ODbL)', streets: g.order }, null, 1)}\n`);
  await runGridGeo();
  const e = g.report.error as { meanBefore: number; meanAfter: number; maxBefore: number; maxAfter: number; streets: number };
  console.log(`grid: ${g.order.length} cross streets; error over ${e.streets} shared streets ${e.meanBefore} m (max ${e.maxBefore}) -> ${e.meanAfter} m (max ${e.maxAfter})`);
  console.log(`placements ${JSON.stringify(placed.placements)}; parcels ${JSON.stringify(placed.parcels)}; queued ${placed.queued.length}; review items ${g.review.length}`);
  console.log(`wrote ${pkgFile} (${v.warnings.length} warnings), with the districts' outlines`);
}

function validate() {
  const dir = join(cityDir(city.id), 'packs', area!.id);
  const errs = validatePackDir(dir);
  if (errs.length) { console.log(`INVALID (${errs.length}):\n  ${errs.slice(0, 40).join('\n  ')}`); process.exitCode = 1; } else console.log(`valid: ${dir}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
