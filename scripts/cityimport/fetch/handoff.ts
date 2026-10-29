/**
 * Browser hand-off: when this machine cannot reach a source, a person downloads
 * the same request in a browser and drops the files in a folder. `ingestHandoff`
 * recognises each file by its content, checks it (parcels: no forbidden owner
 * fields), copies it under citydata/<city>/raw/ and records it in the manifest
 * with `retrievedBy: 'browser-handoff'`. The hand-off folder is never modified.
 */
import { copyFileSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { NJ_PARCEL_FIELDS, NJ_PARCEL_FORBIDDEN, type CityConfig, type ImportArea } from '../config/cities';
import { sha256 } from '../lib/http';
import { rawDir, readManifest, relRaw, upsertRaw, writeManifest, type RawFile } from '../lib/manifest';

export interface HandoffResult { copied: RawFile[]; skipped: { file: string; why: string }[] }

export function ingestHandoff(city: CityConfig, area: ImportArea, from: string, opts: { root?: string; images?: string[] } = {}): HandoffResult {
  const out: HandoffResult = { copied: [], skipped: [] };
  let m = readManifest(city.id, opts.root);
  const raw = rawDir(city.id, opts.root);
  const put = (src: string, rel: string, rec: Omit<RawFile, 'file' | 'bytes' | 'sha256' | 'retrievedBy'>) => {
    const dst = join(raw, rel);
    mkdirSync(join(dst, '..'), { recursive: true });
    copyFileSync(src, dst);
    const buf = readFileSync(dst);
    const r: RawFile = { ...rec, file: relRaw(city.id, dst, opts.root), bytes: buf.length, sha256: sha256(buf), retrievedBy: 'browser-handoff' };
    m = upsertRaw(m, r);
    out.copied.push(r);
  };
  for (const name of readdirSync(from).sort()) {
    const src = join(from, name);
    if (!statSync(src).isFile()) continue;
    const mtime = statSync(src).mtime.toISOString();
    if (/\.json$|\.geojson$/.test(name)) {
      let j: Record<string, unknown>;
      try { j = JSON.parse(readFileSync(src, 'utf8')) as Record<string, unknown>; } catch { out.skipped.push({ file: name, why: 'not JSON' }); continue; }
      if (Array.isArray(j.elements) && j.bounds) {
        const osm = city.sources.find((s) => s.id === 'osm')!;
        const b = j.bounds as { minlat: number; minlon: number; maxlat: number; maxlon: number };
        put(src, join('osm', `${area.id}.osm.json`), {
          sourceId: 'osm', areaId: area.id, title: `OpenStreetMap API 0.6 map call, ${area.name}`,
          url: `https://api.openstreetmap.org/api/0.6/map.json?bbox=${b.minlon},${b.minlat},${b.maxlon},${b.maxlat}`,
          request: { generator: j.generator, version: j.version }, license: osm.license, attribution: osm.attribution,
          downloadedAt: String(j.downloaded ?? mtime), coverage: { bbox: [b.minlon, b.minlat, b.maxlon, b.maxlat] },
          notes: [`Hand-off file ${name}. Download date from the document's 'downloaded' field, else the hand-off file's timestamp.`, 'The map call returns every node of every way touching the box, so ways run past its edges.'],
        });
      } else if (Array.isArray(j.features) && JSON.stringify((j.features as { properties?: object }[])[0]?.properties ?? {}).includes('PAMS_PIN')) {
        const feats = j.features as { properties: Record<string, unknown> }[];
        const bad = new Set<string>();
        for (const f of feats) for (const k of Object.keys(f.properties)) { if (NJ_PARCEL_FORBIDDEN.includes(k.toUpperCase())) bad.add(k); }
        if (bad.size) { out.skipped.push({ file: name, why: `contains forbidden fields (${[...bad].join(', ')}); refusing to copy` }); continue; }
        const extra = new Set<string>();
        for (const f of feats) for (const k of Object.keys(f.properties)) if (!NJ_PARCEL_FIELDS.includes(k)) extra.add(k);
        const src2 = city.sources.find((s) => s.id === 'njgin-parcels')!;
        const q = (j.query ?? {}) as { bbox?: [number, number, number, number]; outFields?: string };
        put(src, join('njgin-parcels', `${area.id}.geojson`), {
          sourceId: 'njgin-parcels', areaId: area.id, title: `${src2.name}, ${area.name}`, url: src2.endpoint, request: { ...q, source: j.source },
          license: src2.license, attribution: src2.attribution, downloadedAt: String(j.downloaded ?? mtime), coverage: { bbox: q.bbox ?? area.bbox },
          notes: [`Hand-off file ${name}; ${feats.length} features.`, extra.size ? `Fields outside the allowlist (kept out of the pack): ${[...extra].join(', ')}` : 'Fields: allowlist only (no owner, mailing or sale data).'],
        });
      } else if (Array.isArray(j.sheets) && String(j.item ?? '').includes('sanborn')) {
        const item = /sanborn\d+_\d+/.exec(String(j.item))![0];
        put(src, join('loc-sanborn', `${item}.index.json`), {
          sourceId: 'loc-sanborn', areaId: '*', title: String(j.title ?? item), url: String(j.item), license: String(j.rights ?? 'Public domain'),
          attribution: 'Sanborn Map Company; Library of Congress, Geography and Map Division', downloadedAt: String(j.retrieved ?? mtime),
          coverage: { note: `${(j.sheets as unknown[]).length} scans (cover, title, 2 index pages, sheets); ${(j.notes as string[] | undefined)?.join(' ') ?? ''}` },
        });
      } else out.skipped.push({ file: name, why: 'not a recognised source document' });
    } else if (/\.jpe?g$/i.test(name)) {
      if (!(opts.images ?? []).includes(name)) { out.skipped.push({ file: name, why: 'image not requested for the repository (pass it in images to copy)' }); continue; }
      put(src, join('loc-sanborn', 'images', basename(name)), {
        sourceId: 'loc-sanborn', areaId: '*', title: `Sanborn NJ Coast Vol. 4 (1950): ${name}`, url: 'https://www.loc.gov/item/sanborn05568_015/',
        license: 'Public domain', attribution: 'Sanborn Map Company; Library of Congress, Geography and Map Division', downloadedAt: mtime,
        coverage: { note: 'image of one scan, IIIF pct:25' },
      });
    } else out.skipped.push({ file: name, why: 'unknown type' });
  }
  writeManifest(m, opts.root);
  return out;
}
