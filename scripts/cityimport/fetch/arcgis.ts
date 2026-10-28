/**
 * ArcGIS REST FeatureServer layer, paged: count first, then `resultOffset` /
 * `resultRecordCount` pages ordered by OBJECTID until the count is reached or
 * a page comes back short with no `exceededTransferLimit`. Every page is cached
 * on its own, so an interrupted run resumes where it stopped.
 */
import { join } from 'node:path';
import type { BBox4 } from '../config/cities';
import { fetchCached, type FetchOpts } from '../lib/http';

export interface ArcgisQuery {
  sourceId: string;
  layerUrl: string;
  bbox: BBox4;
  outFields: string[];
  /** Extra SQL filter (e.g. PCL_MUN IN ('0514')). */
  where?: string;
  pageSize?: number;
  cacheDir: string;
  offline?: boolean;
  /** Fields that must never be requested. Throws before any request when one is listed. */
  forbidden?: string[];
  http?: Partial<FetchOpts>;
}

export interface GeoJsonFC { type: 'FeatureCollection'; features: { type: 'Feature'; id?: number | string; geometry: unknown; properties: Record<string, unknown> }[]; exceededTransferLimit?: boolean; properties?: { exceededTransferLimit?: boolean } }

export function arcgisParams(q: ArcgisQuery, extra: Record<string, string>): string {
  const [w, s, e, n] = q.bbox;
  const p = new URLSearchParams({
    where: q.where ?? '1=1',
    geometry: `${w},${s},${e},${n}`,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outSR: '4326',
    ...extra,
  });
  return p.toString();
}

export function checkFields(q: Pick<ArcgisQuery, 'outFields' | 'forbidden'>): void {
  const bad = q.outFields.filter((f) => (q.forbidden ?? []).includes(f.toUpperCase()));
  if (bad.length || q.outFields.includes('*')) throw new Error(`refusing to request forbidden fields: ${bad.join(', ') || '*'}`);
}

export async function arcgisFetchAll(q: ArcgisQuery): Promise<{ features: GeoJsonFC['features']; pages: string[]; count: number; urls: string[] }> {
  checkFields(q);
  const base = `${q.layerUrl.replace(/\/$/, '')}/query`;
  const countUrl = `${base}?${arcgisParams(q, { returnCountOnly: 'true', f: 'json' })}`;
  const c = await fetchCached({ sourceId: q.sourceId, url: countUrl, cacheFile: join(q.cacheDir, 'count.json'), offline: q.offline, minIntervalMs: 1000, ...q.http });
  const count = Number((JSON.parse(c.body.toString('utf8')) as { count?: number }).count ?? NaN);
  if (!Number.isFinite(count)) throw new Error(`${q.sourceId}: count query returned no count`);
  const size = q.pageSize ?? 1000;
  const features: GeoJsonFC['features'] = [];
  const pages: string[] = [];
  const urls = [countUrl];
  for (let offset = 0, page = 0; offset < count && page < 1000; offset += size, page++) {
    const url = `${base}?${arcgisParams(q, { outFields: q.outFields.join(','), returnGeometry: 'true', orderByFields: 'OBJECTID', resultOffset: String(offset), resultRecordCount: String(size), f: 'geojson' })}`;
    const file = join(q.cacheDir, `page-${String(page).padStart(4, '0')}.geojson`);
    const r = await fetchCached({ sourceId: q.sourceId, url, cacheFile: file, offline: q.offline, minIntervalMs: 1000, ...q.http });
    const fc = JSON.parse(r.body.toString('utf8')) as GeoJsonFC;
    // Defensive: drop anything not asked for, even if the service sends it.
    for (const f of fc.features) for (const k of Object.keys(f.properties ?? {})) if (!q.outFields.includes(k)) delete f.properties[k];
    features.push(...fc.features);
    pages.push(file);
    urls.push(url);
    const more = fc.exceededTransferLimit || fc.properties?.exceededTransferLimit;
    if (fc.features.length < size && !more) break;
  }
  return { features, pages, count, urls };
}
