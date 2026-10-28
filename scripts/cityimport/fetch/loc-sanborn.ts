/**
 * Library of Congress Sanborn maps (public domain), through the loc.gov JSON API
 * and the IIIF image service.
 *
 *   Item:   https://www.loc.gov/item/<item>/?fo=json  → resources[].files[][] (one list per sheet)
 *   Sheet:  https://tile.loc.gov/image-services/iiif/<service>/full/pct:<n>/0/default.jpg
 *
 * `fetchSanbornIndex` writes the sheet list (every sheet's image URLs) to
 * raw/loc-sanborn/<item>.index.json. `fetchSanbornSheets` downloads the sheets
 * named in a list (by their sheet label, e.g. "63B", or the scan's sequence)
 * at a given IIIF size, one every 3 s (LOC asks for gentle use of tile.loc.gov).
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { CityConfig } from '../config/cities';
import { fetchCached, SourceUnreachable, sha256, type SourceStatus } from '../lib/http';
import { rawDir, readManifest, relRaw, upsertRaw, writeManifest } from '../lib/manifest';

export interface SanbornVariant { url: string; mimetype: string; w: number | null; h: number | null }
export interface SanbornSheet { seq: number; variants: SanbornVariant[] }
export interface SanbornIndex { source: string; item: string; title: string; date: string; notes: string[]; rights: string; retrieved: string; sheets: SanbornSheet[] }

/** The sheet label in a scan's file name: 05568_04_1950-0063B.jp2 → "63B"; -ind2 → "ind2"; -covr → "covr". */
export function sheetLabel(s: SanbornSheet): string {
  const u = s.variants.find((v) => /\.jp2$/.test(v.url))?.url ?? s.variants[0]?.url ?? '';
  const m = /-([0-9A-Za-z]+)\.jp2$/.exec(u) ?? /:[^:]*-([0-9A-Za-z]+)\/full/.exec(u);
  if (!m) return String(s.seq);
  const lab = m[1];
  return /^\d+[A-Z]?$/.test(lab) ? lab.replace(/^0+(?=\d)/, '') : lab;
}

/** The IIIF service base of a sheet (for any size). */
export function iiifBase(s: SanbornSheet): string | undefined {
  const v = s.variants.find((x) => x.url.includes('/image-services/iiif/'));
  return v ? v.url.replace(/\/full\/.*$/, '') : undefined;
}

interface LocItemJson { item?: { title?: string; date?: string; notes?: string[] }; resources?: { files?: { url: string; mimetype: string; width?: number; height?: number }[][] }[] }

export async function fetchSanbornIndex(city: CityConfig, item: string, opts: { offline?: boolean; root?: string }): Promise<SourceStatus> {
  const url = `https://www.loc.gov/item/${item}/?fo=json`;
  const dir = join(rawDir(city.id, opts.root), 'loc-sanborn');
  try {
    const r = await fetchCached({ sourceId: 'loc-sanborn', url, cacheFile: join(dir, `${item}.item.json`), offline: opts.offline, minIntervalMs: 3000 });
    const j = JSON.parse(r.body.toString('utf8')) as LocItemJson;
    const files = j.resources?.[0]?.files ?? [];
    const idx: SanbornIndex = {
      source: 'Library of Congress, Geography and Map Division, Sanborn Maps Collection', item: `http://www.loc.gov/item/${item}/`, title: j.item?.title ?? item, date: j.item?.date ?? '',
      notes: j.item?.notes ?? [], rights: 'Public domain (LOC Sanborn Maps Collection rights statement)', retrieved: new Date().toISOString(),
      sheets: files.map((fs, i) => ({ seq: i + 1, variants: fs.map((f) => ({ url: f.url, mimetype: f.mimetype, w: f.width ?? null, h: f.height ?? null })) })),
    };
    const out = join(dir, `${item}.index.json`);
    const text = JSON.stringify(idx, null, 1);
    writeFileSync(out, text);
    writeManifest(upsertRaw(readManifest(city.id, opts.root), { file: relRaw(city.id, out, opts.root), sourceId: 'loc-sanborn', areaId: '*', title: idx.title, url, license: idx.rights, attribution: 'Sanborn Map Company; Library of Congress, Geography and Map Division', downloadedAt: idx.retrieved, retrievedBy: 'pipeline', bytes: Buffer.byteLength(text), sha256: sha256(text), coverage: { note: `${idx.sheets.length} sheets` } }), opts.root);
    return { sourceId: 'loc-sanborn', status: 'downloaded', detail: `${idx.sheets.length} sheets listed`, url, files: [out] };
  } catch (e) {
    if (e instanceof SourceUnreachable) return { sourceId: 'loc-sanborn', status: 'unreachable', detail: e.detail, url };
    throw e;
  }
}

export async function fetchSanbornSheets(city: CityConfig, item: string, labels: string[], opts: { offline?: boolean; root?: string; pct?: number }): Promise<SourceStatus> {
  const dir = join(rawDir(city.id, opts.root), 'loc-sanborn');
  const idxFile = join(dir, `${item}.index.json`);
  if (!existsSync(idxFile)) return { sourceId: 'loc-sanborn', status: 'unreachable', detail: `no sheet index for ${item}; run the index fetch first` };
  const idx = JSON.parse(readFileSync(idxFile, 'utf8')) as SanbornIndex;
  const got: string[] = [];
  const missing: string[] = [];
  mkdirSync(join(dir, item), { recursive: true });
  for (const lab of labels) {
    const sh = idx.sheets.find((s) => sheetLabel(s) === lab || String(s.seq) === lab);
    const base = sh && iiifBase(sh);
    if (!sh || !base) { missing.push(`${lab} (not in the index)`); continue; }
    const url = `${base}/full/pct:${opts.pct ?? 50}/0/default.jpg`;
    const out = join(dir, item, `sheet-${lab}.jpg`);
    try {
      const r = await fetchCached({ sourceId: 'loc-sanborn', url, cacheFile: out, offline: opts.offline, minIntervalMs: 3000 });
      got.push(out);
      writeManifest(upsertRaw(readManifest(city.id, opts.root), { file: relRaw(city.id, out, opts.root), sourceId: 'loc-sanborn', areaId: '*', title: `${idx.title}, sheet ${lab}`, url, license: idx.rights, attribution: 'Sanborn Map Company; Library of Congress, Geography and Map Division', downloadedAt: new Date().toISOString(), retrievedBy: 'pipeline', bytes: r.body.length, sha256: r.sha256, coverage: { note: `sheet ${lab}` } }), opts.root);
    } catch (e) {
      if (e instanceof SourceUnreachable) missing.push(`${lab}: ${e.detail}`); else throw e;
    }
  }
  return { sourceId: 'loc-sanborn', status: missing.length && !got.length ? 'unreachable' : 'downloaded', detail: `${got.length} sheet(s) cached${missing.length ? `; not fetched: ${missing.join('; ')}` : ''}`, files: got };
}
