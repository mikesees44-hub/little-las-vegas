/**
 * NJGIN / NJOGIS parcels with MOD-IV attributes, for one import area.
 *
 *   Layer:  Parcels_Composite_NJ_WM/FeatureServer/0 (ArcGIS Online, NJOGIS)
 *   Query:  bbox envelope in EPSG:4326, outSR 4326, f=geojson, paged by OBJECTID
 *   Fields: the allowlist in config/cities.ts (NJ_PARCEL_FIELDS) — never owner
 *           names, mailing addresses or sale data (NJ_PARCEL_FORBIDDEN).
 *
 * Output: raw/njgin-parcels/<area>/page-NNNN.geojson (+ count.json), merged to
 * raw/njgin-parcels/<area>.geojson and recorded in the raw manifest.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NJ_PARCEL_FIELDS, NJ_PARCEL_FORBIDDEN, type CityConfig, type ImportArea } from '../config/cities';
import { SourceUnreachable, sha256, type SourceStatus } from '../lib/http';
import { rawDir, readManifest, relRaw, upsertRaw, writeManifest } from '../lib/manifest';
import { arcgisFetchAll } from './arcgis';

export async function fetchNjginParcels(city: CityConfig, area: ImportArea, opts: { offline?: boolean; root?: string }): Promise<SourceStatus> {
  const src = city.sources.find((s) => s.id === 'njgin-parcels');
  if (!src) return { sourceId: 'njgin-parcels', status: 'skipped', detail: 'not configured for this city' };
  const layerUrl = src.endpoint;
  const dir = join(rawDir(city.id, opts.root), 'njgin-parcels', area.id);
  const where = area.municipalities?.length ? `PCL_MUN IN (${area.municipalities.map((m) => `'${m}'`).join(',')})` : '1=1';
  try {
    const r = await arcgisFetchAll({ sourceId: src.id, layerUrl, bbox: area.bbox, outFields: NJ_PARCEL_FIELDS, forbidden: NJ_PARCEL_FORBIDDEN, where, cacheDir: dir, offline: opts.offline });
    const merged = { type: 'FeatureCollection', source: `${src.name}: ${layerUrl}`, query: { bbox: area.bbox, where, outFields: NJ_PARCEL_FIELDS.join(',') }, downloaded: new Date().toISOString(), features: r.features };
    const out = join(rawDir(city.id, opts.root), 'njgin-parcels', `${area.id}.geojson`);
    mkdirSync(join(out, '..'), { recursive: true });
    const text = JSON.stringify(merged);
    writeFileSync(out, text);
    const m = readManifest(city.id, opts.root);
    writeManifest(upsertRaw(m, {
      file: relRaw(city.id, out, opts.root), sourceId: src.id, areaId: area.id, title: `${src.name}, ${area.name}`, url: layerUrl,
      request: { bbox: area.bbox, where, outFields: NJ_PARCEL_FIELDS, pages: r.pages.length, count: r.count }, license: src.license, attribution: src.attribution,
      downloadedAt: new Date().toISOString(), retrievedBy: 'pipeline', bytes: Buffer.byteLength(text), sha256: sha256(text), coverage: { bbox: area.bbox },
      notes: ['Owner/mailing/sale fields excluded by the outFields allowlist.'],
    }), opts.root);
    return { sourceId: src.id, status: 'downloaded', detail: `${r.features.length} parcels in ${r.pages.length} page(s)`, url: layerUrl, files: [out] };
  } catch (e) {
    if (e instanceof SourceUnreachable) return { sourceId: src.id, status: 'unreachable', detail: e.detail, url: e.url };
    throw e;
  }
}
