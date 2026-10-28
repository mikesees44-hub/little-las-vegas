/**
 * OpenStreetMap for one import area.
 *
 *   1. Overpass API (https://overpass-api.de/api/interpreter), POST, one query per
 *      tile: a box bigger than `tileDeg` is split into tiles so no request is huge
 *      (Overpass's own guidance), each tile cached on its own, elements merged by
 *      type/id. Backoff and retries come from lib/http (429 / 504 are common).
 *   2. Fallback for a small box only (≤ 0.25 sq deg, the API's own limit, and
 *      ≤ 0.0025 sq deg here to stay well inside the usage policy): the editing API's
 *      map call, https://api.openstreetmap.org/api/0.6/map.json?bbox=w,s,e,n.
 *
 * Output: raw/osm/<area>.osm.json (an OSM JSON document: version, generator,
 * copyright, bounds, elements), recorded in the raw manifest.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BBox4, CityConfig, ImportArea } from '../config/cities';
import { fetchCached, SourceUnreachable, sha256, type SourceStatus } from '../lib/http';
import { rawDir, readManifest, relRaw, upsertRaw, writeManifest } from '../lib/manifest';

export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
export const OSM_API_MAP = 'https://api.openstreetmap.org/api/0.6/map.json';

/** What the importer asks Overpass for: streets, rail, water, buildings and the places in them. */
export function overpassQuery(b: BBox4): string {
  const [w, s, e, n] = b;
  const bb = `(${s},${w},${n},${e})`;
  return `[out:json][timeout:180];
(
  way["highway"]${bb};
  way["railway"]${bb};
  way["building"]${bb};
  relation["building"]${bb};
  way["natural"~"^(water|coastline|wetland|beach)$"]${bb};
  relation["natural"="water"]${bb};
  way["waterway"]${bb};
  way["man_made"~"^(pier|breakwater|groyne)$"]${bb};
  way["landuse"]${bb};
  way["leisure"]${bb};
  node["amenity"]${bb}; way["amenity"]${bb};
  node["shop"]${bb}; way["shop"]${bb};
  node["tourism"]${bb}; way["tourism"]${bb};
  node["leisure"]${bb};
  node["craft"]${bb}; node["office"]${bb};
  node["man_made"]${bb};
  node["historic"]${bb}; way["historic"]${bb};
);
(._;>;);
out body;`;
}

/** Splits a box into tiles no bigger than `tileDeg` on a side. */
export function tiles(b: BBox4, tileDeg: number): BBox4[] {
  const [w, s, e, n] = b;
  const nx = Math.max(1, Math.ceil((e - w) / tileDeg));
  const ny = Math.max(1, Math.ceil((n - s) / tileDeg));
  const out: BBox4[] = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    out.push([w + ((e - w) * i) / nx, s + ((n - s) * j) / ny, w + ((e - w) * (i + 1)) / nx, s + ((n - s) * (j + 1)) / ny]);
  }
  return out;
}

export interface OsmElement { type: 'node' | 'way' | 'relation'; id: number; lat?: number; lon?: number; nodes?: number[]; members?: { type: string; ref: number; role: string }[]; tags?: Record<string, string>; version?: number; timestamp?: string }
export interface OsmDoc { version?: string; generator?: string; copyright?: string; attribution?: string; license?: string; bounds?: { minlat: number; minlon: number; maxlat: number; maxlon: number }; elements: OsmElement[] }

/** Merges documents, one element per type/id (the newest version wins). */
export function mergeOsm(docs: OsmDoc[]): OsmElement[] {
  const by = new Map<string, OsmElement>();
  for (const d of docs) for (const el of d.elements) {
    const k = `${el.type}/${el.id}`;
    const cur = by.get(k);
    if (!cur || (el.version ?? 0) >= (cur.version ?? 0)) by.set(k, el);
  }
  return [...by.values()];
}

export async function fetchOsm(city: CityConfig, area: ImportArea, opts: { offline?: boolean; root?: string; tileDeg?: number }): Promise<SourceStatus> {
  const src = city.sources.find((s) => s.id === 'osm')!;
  const dir = join(rawDir(city.id, opts.root), 'osm', area.id);
  const parts = tiles(area.bbox, opts.tileDeg ?? 0.02);
  const docs: OsmDoc[] = [];
  const urls: string[] = [];
  let via = 'overpass';
  let overpassErr = '';
  try {
    for (let i = 0; i < parts.length; i++) {
      const q = overpassQuery(parts[i]);
      const r = await fetchCached({ sourceId: 'osm', url: OVERPASS_URL, method: 'POST', body: `data=${encodeURIComponent(q)}`, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, cacheFile: join(dir, `overpass-${String(i).padStart(3, '0')}.json`), offline: opts.offline, minIntervalMs: 5000, maxRetries: 4 });
      docs.push(JSON.parse(r.body.toString('utf8')) as OsmDoc);
      urls.push(OVERPASS_URL);
    }
  } catch (e) {
    if (!(e instanceof SourceUnreachable)) throw e;
    overpassErr = e.detail;
    docs.length = 0;
    const [w, s, ee, n] = area.bbox;
    if ((ee - w) * (n - s) > 0.0025) return { sourceId: 'osm', status: 'unreachable', detail: `Overpass: ${overpassErr}; the box is too big for the OSM API fallback`, url: OVERPASS_URL };
    try {
      const url = `${OSM_API_MAP}?bbox=${area.bbox.join(',')}`;
      const r = await fetchCached({ sourceId: 'osm', url, cacheFile: join(dir, 'api-map.json'), offline: opts.offline, minIntervalMs: 2000, maxRetries: 2 });
      docs.push(JSON.parse(r.body.toString('utf8')) as OsmDoc);
      urls.push(url);
      via = 'osm-api-map';
    } catch (e2) {
      if (e2 instanceof SourceUnreachable) return { sourceId: 'osm', status: 'unreachable', detail: `Overpass: ${overpassErr}; OSM API: ${e2.detail}`, url: `${OVERPASS_URL} | ${OSM_API_MAP}` };
      throw e2;
    }
  }
  const merged: OsmDoc = { version: '0.6', generator: `cityimport (${via})`, copyright: 'OpenStreetMap and contributors', license: 'http://opendatacommons.org/licenses/odbl/1-0/', bounds: { minlon: area.bbox[0], minlat: area.bbox[1], maxlon: area.bbox[2], maxlat: area.bbox[3] }, elements: mergeOsm(docs) };
  const out = join(rawDir(city.id, opts.root), 'osm', `${area.id}.osm.json`);
  mkdirSync(join(out, '..'), { recursive: true });
  const text = JSON.stringify(merged);
  writeFileSync(out, text);
  writeManifest(upsertRaw(readManifest(city.id, opts.root), {
    file: relRaw(city.id, out, opts.root), sourceId: 'osm', areaId: area.id, title: `OpenStreetMap, ${area.name}`, url: urls.join(' | '),
    request: { via, tiles: parts.length, bbox: area.bbox }, license: src.license, attribution: src.attribution, downloadedAt: new Date().toISOString(), retrievedBy: 'pipeline',
    bytes: Buffer.byteLength(text), sha256: sha256(text), coverage: { bbox: area.bbox },
  }), opts.root);
  return { sourceId: 'osm', status: 'downloaded', detail: `${merged.elements.length} elements via ${via}`, url: urls[0], files: [out] };
}
