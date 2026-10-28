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
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

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

function validate() {
  const dir = join(cityDir(city.id), 'packs', area!.id);
  const errs = validatePackDir(dir);
  if (errs.length) { console.log(`INVALID (${errs.length}):\n  ${errs.slice(0, 40).join('\n  ')}`); process.exitCode = 1; } else console.log(`valid: ${dir}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
