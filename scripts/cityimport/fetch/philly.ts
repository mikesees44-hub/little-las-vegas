/**
 * Philadelphia open data — a stub with documented endpoints, for when the
 * pipeline is pointed at Philadelphia. It is wired to the same paged ArcGIS
 * fetcher as the NJGIN parcels, but stays disabled until each dataset's URL
 * and fields are confirmed against the live catalog (nothing here has been
 * requested from this container: the network is closed to it).
 *
 * Candidate datasets (confirm on https://opendataphilly.org before enabling):
 *   - Building footprints (Dept. of Licenses & Inspections / City GIS):
 *       ArcGIS Online, org fLeGjb7u4uXqeF9q, service LI_BUILDING_FOOTPRINTS (FeatureServer/0)
 *       https://services.arcgis.com/fLeGjb7u4uXqeF9q/arcgis/rest/services/LI_BUILDING_FOOTPRINTS/FeatureServer/0
 *   - CARTO SQL API (many city tables): https://phl.carto.com/api/v2/sql?q=<SQL>&format=geojson
 *   - Historical maps and atlases (georeferenced tiles; a person compares, nothing is traced):
 *       Philadelphia Water Department historical maps / PhilaGeoHistory (Greater Philadelphia GeoHistory Network)
 *       https://www.philageohistory.org/  (tile services listed per atlas, e.g. 1962 land use atlases)
 *   - Parcels (Dept. of Records "DOR parcels"): ArcGIS Online, same org, service DOR_Parcel (confirm)
 */
import { join } from 'node:path';
import type { CityConfig, ImportArea } from '../config/cities';
import { SourceUnreachable, type SourceStatus } from '../lib/http';
import { rawDir } from '../lib/manifest';
import { arcgisFetchAll } from './arcgis';

export const PHILLY_ENDPOINTS = {
  buildingFootprints: { url: 'https://services.arcgis.com/fLeGjb7u4uXqeF9q/arcgis/rest/services/LI_BUILDING_FOOTPRINTS/FeatureServer/0', fields: ['OBJECTID', 'BIN', 'ADDRESS', 'BASE_ELEVATION', 'APPROX_HGT', 'MAX_HGT'], confirmed: false },
  cartoSql: { url: 'https://phl.carto.com/api/v2/sql', confirmed: false },
  geohistory: { url: 'https://www.philageohistory.org/', confirmed: false },
} as const;

export async function fetchPhilly(city: CityConfig, area: ImportArea, opts: { offline?: boolean; root?: string; enable?: boolean }): Promise<SourceStatus> {
  if (city.id !== 'philadelphia') return { sourceId: 'philly-opendata', status: 'skipped', detail: 'Philadelphia only' };
  const ep = PHILLY_ENDPOINTS.buildingFootprints;
  if (!opts.enable || !ep.confirmed) {
    return { sourceId: 'philly-opendata', status: 'not-implemented', detail: 'stub: dataset URLs and fields are documented in fetch/philly.ts but not confirmed against the catalog; set confirmed: true after checking, then run with --enable-philly', url: ep.url };
  }
  try {
    const r = await arcgisFetchAll({ sourceId: 'philly-opendata', layerUrl: ep.url, bbox: area.bbox, outFields: [...ep.fields], cacheDir: join(rawDir(city.id, opts.root), 'philly-opendata', area.id), offline: opts.offline });
    return { sourceId: 'philly-opendata', status: 'downloaded', detail: `${r.features.length} footprints`, url: ep.url, files: r.pages };
  } catch (e) {
    if (e instanceof SourceUnreachable) return { sourceId: 'philly-opendata', status: 'unreachable', detail: e.detail, url: e.url };
    throw e;
  }
}
