/**
 * City pack validation: the ten required files, their shapes, unique ids,
 * source ids on every record, separate geographic / local / game coordinates,
 * references between layers, historical statuses and evidence, and no
 * forbidden (owner / sale) fields anywhere. Returns problems; never throws.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NJ_PARCEL_FORBIDDEN } from '../config/cities';

export const REQUIRED_FILES = ['city.json', 'roads.geojson', 'water.geojson', 'parcels.geojson', 'buildings.geojson', 'businesses.json', 'historical-overrides.json', 'asset-manifest.json', 'sources-and-attribution.json', 'review-queue.json'];
const STATUSES = ['unverified', 'likely-existed', 'absent', 'unknown', 'verified'];
const CONF = ['high', 'medium', 'low'];
const ACTIONS = ['add', 'remove', 'keep', 'rename', 'move', 'set-years', 'verify', 'set-asset'];

type J = Record<string, unknown>;
const isObj = (x: unknown): x is J => !!x && typeof x === 'object' && !Array.isArray(x);

export function validatePackDir(dir: string): string[] {
  const errs: string[] = [];
  const files: Record<string, J> = {};
  for (const f of REQUIRED_FILES) {
    const p = join(dir, f);
    if (!existsSync(p)) { errs.push(`${f}: missing`); continue; }
    const text = readFileSync(p, 'utf8');
    for (const k of NJ_PARCEL_FORBIDDEN) if (new RegExp(`"${k}"`).test(text)) errs.push(`${f}: contains forbidden field ${k}`);
    try { files[f] = JSON.parse(text) as J; } catch { errs.push(`${f}: not JSON`); }
  }
  return errs.concat(validatePack(files));
}

export function validatePack(files: Record<string, J>): string[] {
  const errs: string[] = [];
  const city = files['city.json'];
  if (city) {
    for (const k of ['schemaVersion', 'packId', 'city', 'area', 'targetYear', 'crs', 'counts']) if (city[k] === undefined) errs.push(`city.json: no ${k}`);
    if (!isObj(city.crs) || !isObj((city.crs as J).local) || !isObj((city.crs as J).game)) errs.push('city.json: crs must describe local and game');
  }
  const ids = (f: string): Set<string> => {
    const fc = files[f];
    const out = new Set<string>();
    if (!fc) return out;
    if (fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) { errs.push(`${f}: not a FeatureCollection`); return out; }
    for (const [i, ft] of (fc.features as J[]).entries()) {
      const p = (ft.properties ?? {}) as J;
      const id = String(ft.id ?? '');
      if (!id) errs.push(`${f}[${i}]: no id`);
      if (out.has(id)) errs.push(`${f}: duplicate id ${id}`);
      out.add(id);
      if (!Array.isArray(p.sourceIds)) errs.push(`${f} ${id}: no sourceIds`);
      if (f !== 'buildings.geojson' && Array.isArray(p.sourceIds) && !p.sourceIds.length) errs.push(`${f} ${id}: empty sourceIds`);
      const g = ft.geometry as J | undefined;
      if (!g || !['Point', 'LineString', 'Polygon', 'MultiPolygon'].includes(String(g.type))) errs.push(`${f} ${id}: bad geometry`);
      else {
        const first = firstCoord(g.coordinates);
        if (!first || Math.abs(first[0]) > 180 || Math.abs(first[1]) > 90) errs.push(`${f} ${id}: geometry is not lon/lat`);
      }
      if (!Array.isArray(p.local) || !Array.isArray(p.game)) errs.push(`${f} ${id}: local and game coordinates must be stored separately`);
      const h = p.historical as J | undefined;
      if (!h || !STATUSES.includes(String(h.status))) errs.push(`${f} ${id}: bad historical status`);
    }
    return out;
  };
  ids('roads.geojson');
  ids('water.geojson');
  const parcels = ids('parcels.geojson');
  const buildings = ids('buildings.geojson');
  for (const ft of ((files['buildings.geojson']?.features ?? []) as J[])) {
    const p = ft.properties as J;
    if (p.source === 'osm' && !(p.sourceIds as unknown[]).length) errs.push(`buildings ${String(ft.id)}: an OSM building needs its source id`);
    if (p.source === 'generated' && !p.generatedFootprint) errs.push(`buildings ${String(ft.id)}: a generated outline must say how`);
    for (const l of (p.parcels as J[]) ?? []) if (!parcels.has(String(l.parcelId))) errs.push(`buildings ${String(ft.id)}: unknown parcel ${String(l.parcelId)}`);
    for (const k of ['height', 'roof', 'levels']) { const g = p[k] as J | undefined; if (!g || typeof g.generated !== 'boolean' || !g.method) errs.push(`buildings ${String(ft.id)}: ${k} must say whether it is generated`); }
    for (const e of (p.entrances as J[]) ?? []) if (typeof e.generated !== 'boolean') errs.push(`buildings ${String(ft.id)}: entrance without generated flag`);
    for (const ev of ((p.historical as J).evidence as J[]) ?? []) errs.push(...evidenceErrs(ev, `buildings ${String(ft.id)}`));
  }
  const biz = files['businesses.json'];
  if (biz) {
    if (!Array.isArray(biz.businesses)) errs.push('businesses.json: no businesses list');
    const seen = new Set<string>();
    for (const b of (biz.businesses as J[]) ?? []) {
      const id = String(b.id);
      if (seen.has(id)) errs.push(`businesses: duplicate id ${id}`);
      seen.add(id);
      if (!Array.isArray(b.sourceIds) || !(b.sourceIds as unknown[]).length) errs.push(`businesses ${id}: no sourceIds`);
      if (b.buildingId !== undefined && !buildings.has(String(b.buildingId))) errs.push(`businesses ${id}: unknown building ${String(b.buildingId)}`);
      if (!Array.isArray(b.lonLat) || !Array.isArray(b.local) || !Array.isArray(b.game)) errs.push(`businesses ${id}: lonLat, local and game must be stored separately`);
    }
  }
  const ov = files['historical-overrides.json'];
  if (ov) {
    if (ov.schemaVersion !== 1 || !Array.isArray(ov.overrides)) errs.push('historical-overrides.json: bad shape');
    for (const o of (ov.overrides as J[]) ?? []) {
      if (!ACTIONS.includes(String(o.action))) errs.push(`override ${String(o.id)}: bad action`);
      errs.push(...evidenceErrs(o.evidence as J, `override ${String(o.id)}`));
      const t = o.target as J;
      if (!t || (t.layer === 'buildings' && o.action !== 'add' && !buildings.has(String(t.id)))) errs.push(`override ${String(o.id)}: unknown target`);
    }
  }
  const am = files['asset-manifest.json'];
  if (am) for (const a of (am.buildings as J[]) ?? []) if (!buildings.has(String(a.buildingId))) errs.push(`asset-manifest: unknown building ${String(a.buildingId)}`);
  const src = files['sources-and-attribution.json'];
  if (src) for (const s of (src.sources as J[]) ?? []) { if (!s.license || !s.attribution) errs.push(`sources ${String(s.id)}: licence and attribution required`); for (const f of (s.files as J[]) ?? []) if (!f.downloadedAt || !f.url) errs.push(`sources ${String(s.id)}: a file needs url and download date`); }
  const rq = files['review-queue.json'];
  if (rq && !Array.isArray(rq.items)) errs.push('review-queue.json: no items');
  return errs;
}

function evidenceErrs(ev: J | undefined, where: string): string[] {
  if (!ev) return [`${where}: no evidence`];
  const e: string[] = [];
  if (!(ev.year === null || typeof ev.year === 'number')) e.push(`${where}: evidence year`);
  if (!ev.source) e.push(`${where}: evidence source`);
  if (!CONF.includes(String(ev.confidence))) e.push(`${where}: evidence confidence`);
  return e;
}

function firstCoord(c: unknown): [number, number] | undefined {
  let x = c;
  while (Array.isArray(x) && Array.isArray(x[0])) x = x[0];
  return Array.isArray(x) && typeof x[0] === 'number' ? (x as [number, number]) : undefined;
}
