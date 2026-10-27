import { blankCityPackage, frameFns, type BusinessRec, type CityPackage, type Confidence, type District, type Landmark, type NamePolicy, type Parcel, type UV, type Years } from './cityPackage';

/**
 * The town editor's operations, pure: each takes a package and returns a new
 * one (the input is never changed), so the editor can keep an undo stack and
 * the tests can drive exactly what the buttons do. Ids are made once and
 * never reused, so live saves keep finding their lots.
 */

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

export const slugOf = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';

function allIds(pkg: CityPackage): Set<string> {
  return new Set([...pkg.streets, ...pkg.districts, ...pkg.parcels, ...pkg.businesses, ...pkg.landmarks, ...pkg.institutions, ...pkg.routes, ...pkg.placements, ...pkg.eraRules].map((r) => r.id));
}

/** A fresh id from a base (`cm-p`, `d:harbor`): the base itself, else the base with the next free number. */
export function uniqueId(pkg: CityPackage, base: string): string {
  const ids = allIds(pkg);
  if (!ids.has(base) && !/-$/.test(base)) return base;
  const stem = base.replace(/-$/, '');
  for (let i = 1; ; i++) {
    const id = `${stem}-${String(i).padStart(2, '0')}`;
    if (!ids.has(id)) return id;
  }
}

/** The short prefix for a town's parcel ids (`capemay` → `cap`). */
export function parcelPrefix(pkg: CityPackage): string {
  return pkg.townId.slice(0, 3) || 'lot';
}

export function newTown(name: string, lat: number | null, lng: number | null): CityPackage {
  const slug = slugOf(name);
  const frame = lat !== null && lng !== null ? { anchor: { lat, lng }, anchorUV: [0, 0] as [number, number], bearing: 0 } : null;
  const p = blankCityPackage(slug, name, frame);
  p.geography.bounds = { u0: -600, u1: 600, v0: -300, v1: 600 };
  p.geography.subTowns = [{ id: p.townId, name, uMax: 1e9 }];
  return p;
}

export function addDistrict(pkg: CityPackage, name: string, polygon: [number, number][], pop = 0): { pkg: CityPackage; id: string } {
  const p = clone(pkg);
  const id = uniqueId(p, `d:${slugOf(name)}`);
  const d: District = { id, name, zones: [p.townId], pop, blurb: '', polygon: polygon.map(([u, v]) => [Math.round(u), Math.round(v)]), evidence: { confidence: 'approximate', source: 'Drawn in the town editor.' } };
  p.districts.push(d);
  return { pkg: p, id };
}

/** Which district a point falls in (the first whose outline holds it). */
export function districtAt(pkg: CityPackage, at: UV): string | undefined {
  const inside = (poly: [number, number][]) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if (yi > at.v !== yj > at.v && at.u < ((xj - xi) * (at.v - yi)) / (yj - yi || 1e-9) + xi) c = !c;
    }
    return c;
  };
  return pkg.districts.find((d) => d.polygon.length >= 3 && inside(d.polygon))?.id;
}

export function addParcel(pkg: CityPackage, at: UV, opts: { districtId?: string; address?: string; w?: number; d?: number } = {}): { pkg: CityPackage; id: string } {
  const p = clone(pkg);
  const id = uniqueId(p, `${parcelPrefix(p)}-p-`);
  const districtId = opts.districtId ?? districtAt(p, at) ?? p.districts[0]?.id ?? '';
  const pc: Parcel = {
    id, districtId, zone: p.townId, address: opts.address ?? '', pos: { u: Math.round(at.u), v: Math.round(at.v) },
    footprint: { w: opts.w ?? 16, d: opts.d ?? 22 }, rotation: 0, market: { status: 'private', owner: 'private' },
    evidence: { confidence: 'approximate', source: 'Placed in the town editor.' },
  };
  p.parcels.push(pc);
  return { pkg: p, id };
}

export function addLandmark(pkg: CityPackage, name: string, kind: string, at: UV): { pkg: CityPackage; id: string } {
  const p = clone(pkg);
  const id = uniqueId(p, `lm:${slugOf(name)}`);
  const l: Landmark = { id, name, kind, districtId: districtAt(p, at), pos: { u: Math.round(at.u), v: Math.round(at.v) }, ownable: false, evidence: { confidence: 'approximate', source: 'Placed in the town editor.' } };
  if (!l.districtId) delete l.districtId;
  p.landmarks.push(l);
  return { pkg: p, id };
}

export function addBusiness(pkg: CityPackage, parcelId: string, name: string, use: string, years: Years, namePolicy: NamePolicy = 'fictional'): { pkg: CityPackage; id: string } {
  const p = clone(pkg);
  const id = uniqueId(p, `b:${parcelId}`);
  const b: BusinessRec = { id, parcelId, name, use, years, namePolicy, evidence: { confidence: namePolicy === 'fictional' ? 'invented' : 'approximate', source: namePolicy === 'fictional' ? 'A fictional business (town editor).' : 'Entered in the town editor; add the source.' } };
  p.businesses.push(b);
  return { pkg: p, id };
}

type AnyRec = { id: string } & Record<string, unknown>;
const LISTS = ['streets', 'districts', 'parcels', 'businesses', 'landmarks', 'institutions', 'routes', 'placements', 'eraRules'] as const;

/** Finds a record of any kind by id. */
export function findRecord(pkg: CityPackage, id: string): { list: typeof LISTS[number]; rec: AnyRec } | undefined {
  for (const k of LISTS) {
    const rec = (pkg[k] as unknown as AnyRec[]).find((r) => r.id === id);
    if (rec) return { list: k, rec };
  }
  return undefined;
}

/** Changes fields on one record (ids never change: a save may hold it). */
export function updateRecord(pkg: CityPackage, id: string, patch: Record<string, unknown>): CityPackage {
  const p = clone(pkg);
  const f = findRecord(p, id);
  if (!f) return pkg;
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'id') continue;
    if (v === undefined) delete f.rec[k]; else f.rec[k] = v;
  }
  return p;
}

export function moveRecord(pkg: CityPackage, id: string, at: UV): CityPackage {
  return updateRecord(pkg, id, { pos: { u: Math.round(at.u), v: Math.round(at.v) } });
}

export function setYears(pkg: CityPackage, id: string, years: Years): CityPackage {
  const y: Years = {};
  if (years.from !== undefined && Number.isFinite(years.from)) y.from = years.from;
  if (years.to !== undefined && Number.isFinite(years.to)) y.to = years.to;
  if (years.approx) y.approx = true;
  return updateRecord(pkg, id, { years: y });
}

export function setArt(pkg: CityPackage, id: string, keys: string[]): CityPackage {
  return updateRecord(pkg, id, { art: keys.length ? keys : undefined });
}

export function setEvidence(pkg: CityPackage, id: string, confidence: Confidence, source: string): CityPackage {
  const f = findRecord(pkg, id);
  const old = (f?.rec.evidence as { scope?: string[] } | undefined) ?? {};
  return updateRecord(pkg, id, { evidence: { ...old, confidence, source } });
}

/** Removes a record; a parcel takes the businesses standing on it along. */
export function removeRecord(pkg: CityPackage, id: string): CityPackage {
  const p = clone(pkg);
  for (const k of LISTS) (p as unknown as Record<string, AnyRec[]>)[k] = (p[k] as unknown as AnyRec[]).filter((r) => r.id !== id);
  p.businesses = p.businesses.filter((b) => b.parcelId !== id);
  return p;
}

/** Where a record stands in the local frame, for drawing. */
export function recordUV(pkg: CityPackage, rec: { pos?: UV; geo?: [number, number]; parcelId?: string }): UV | undefined {
  if (rec.pos) return rec.pos;
  if (rec.geo && pkg.geography.frame) { const [u, v] = frameFns(pkg.geography.frame).toUv(rec.geo); return { u, v }; }
  if (rec.parcelId) { const pc = pkg.parcels.find((x) => x.id === rec.parcelId); if (pc) return recordUV(pkg, { pos: pc.pos, geo: pc.geo }); }
  return undefined;
}
