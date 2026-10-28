/**
 * NJ parcels (MOD-IV attributes) → deduplicated parcel records.
 *
 * Dedupe: features sharing a PAMS_PIN are one parcel. Exactly repeated
 * geometry collapses; different geometries under one PIN become the parts of
 * one multi-part parcel. Every OBJECTID is kept in `sourceIds`. Attribute
 * conflicts (two different non-empty values) go to the review queue.
 */
import type { LL } from './osm';

export interface RawParcelFeature { type: 'Feature'; id?: number | string; geometry: { type: string; coordinates: unknown }; properties: Record<string, unknown> }

export interface ParcelRec {
  id: string;
  pin: string | null;
  sourceIds: string[];
  mun: string | null;
  block: string | null;
  lot: string | null;
  qcode: string | null;
  address: string | null;
  propClass: string | null;
  bldgDesc: string | null;
  landDesc: string | null;
  acres: number | null;
  facName: string | null;
  propUse: string | null;
  bldgClass: string | null;
  yrConstr: number | null;
  dwell: number | null;
  /** Outer rings of the parts, lon/lat. */
  parts: LL[][];
  /** How the record came to be: 'single', 'exact-duplicates-merged', 'multipart'. */
  dedupe: 'single' | 'exact-duplicates-merged' | 'multipart';
}

export interface ParcelIssue { pin: string; kind: 'attribute-conflict' | 'multipart'; detail: string; sourceIds: string[] }

const str = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x.trim() : typeof x === 'number' ? String(x) : null);
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);

function outerRings(g: RawParcelFeature['geometry']): LL[][] {
  if (g.type === 'Polygon') return [(g.coordinates as LL[][])[0]];
  if (g.type === 'MultiPolygon') return (g.coordinates as LL[][][]).map((p) => p[0]);
  return [];
}

const sameRing = (a: LL[], b: LL[]): boolean => a.length === b.length && a.every((p, i) => Math.abs(p[0] - b[i][0]) < 1e-7 && Math.abs(p[1] - b[i][1]) < 1e-7);

const FIELDS: [keyof ParcelRec, string, 's' | 'n'][] = [
  ['mun', 'PCL_MUN', 's'], ['block', 'PCLBLOCK', 's'], ['lot', 'PCLLOT', 's'], ['qcode', 'PCLQCODE', 's'], ['address', 'PROP_LOC', 's'], ['propClass', 'PROP_CLASS', 's'],
  ['bldgDesc', 'BLDG_DESC', 's'], ['landDesc', 'LAND_DESC', 's'], ['acres', 'CALC_ACRE', 'n'], ['facName', 'FAC_NAME', 's'], ['propUse', 'PROP_USE', 's'], ['bldgClass', 'BLDG_CLASS', 's'],
  ['yrConstr', 'YR_CONSTR', 'n'], ['dwell', 'DWELL', 'n'],
];

export function dedupeParcels(features: RawParcelFeature[]): { parcels: ParcelRec[]; issues: ParcelIssue[]; inputCount: number } {
  const groups = new Map<string, RawParcelFeature[]>();
  for (const f of features) {
    const pin = str(f.properties.PAMS_PIN);
    const key = pin ?? `oid:${f.properties.OBJECTID ?? f.id}`;
    const g = groups.get(key);
    if (g) g.push(f); else groups.set(key, [f]);
  }
  const parcels: ParcelRec[] = [];
  const issues: ParcelIssue[] = [];
  for (const [key, fs] of groups) {
    const pin = key.startsWith('oid:') ? null : key;
    const sourceIds = fs.map((f) => `njgin:OBJECTID/${f.properties.OBJECTID ?? f.id}`);
    const parts: LL[][] = [];
    for (const f of fs) for (const r of outerRings(f.geometry)) if (!parts.some((p) => sameRing(p, r))) parts.push(r);
    const rec: ParcelRec = { id: pin ? `njgin:${pin}` : `njgin:${key}`, pin, sourceIds, mun: null, block: null, lot: null, qcode: null, address: null, propClass: null, bldgDesc: null, landDesc: null, acres: null, facName: null, propUse: null, bldgClass: null, yrConstr: null, dwell: null, parts, dedupe: fs.length === 1 ? 'single' : parts.length === 1 ? 'exact-duplicates-merged' : 'multipart' };
    for (const [k, src, t] of FIELDS) {
      const vals = [...new Set(fs.map((f) => (t === 's' ? str(f.properties[src]) : num(f.properties[src]))).filter((v) => v !== null))];
      (rec as unknown as Record<string, unknown>)[k] = vals[0] ?? null;
      if (vals.length > 1) issues.push({ pin: key, kind: 'attribute-conflict', detail: `${src}: ${vals.join(' | ')} (kept ${vals[0]})`, sourceIds });
    }
    // The assessor records "0" for an unknown year.
    if (rec.yrConstr === 0) rec.yrConstr = null;
    if (rec.dedupe === 'multipart') issues.push({ pin: key, kind: 'multipart', detail: `${fs.length} features, ${parts.length} distinct outlines under one PIN (kept as one parcel with ${parts.length} parts)`, sourceIds });
    parcels.push(rec);
  }
  parcels.sort((a, b) => a.id.localeCompare(b.id));
  return { parcels, issues, inputCount: features.length };
}

/** Stories from an assessor building description ("2S-F" → 2, "3.5S-F" → 3.5, "1.5 SF" → 1.5). */
export function storiesOf(desc: string | null): number | null {
  if (!desc) return null;
  const m = /^\s*(\d+(?:\.\d+)?)\s*S/i.exec(desc);
  return m ? Number(m[1]) : null;
}

/** Construction material from an assessor description: F frame, B brick, CB concrete block, S stucco/steel, M masonry. */
export function materialOf(desc: string | null): string | null {
  if (!desc) return null;
  const m = /S[- ]?([A-Z/]+)\s*$/i.exec(desc.trim());
  if (!m) return null;
  const k = m[1].toUpperCase();
  return ({ F: 'frame', B: 'brick', CB: 'concrete-block', BF: 'brick-frame', FB: 'frame-brick', M: 'masonry', S: 'stucco', ST: 'stucco', A: 'aluminum', AL: 'aluminum', V: 'vinyl' } as Record<string, string>)[k] ?? k.toLowerCase();
}

/** Lot dimensions from LAND_DESC ("30X90" → [30, 90] feet), when it is a plain rectangle. */
export function landDims(desc: string | null): [number, number] | null {
  if (!desc) return null;
  const m = /^\s*(\d+(?:\.\d+)?)\s*X\s*(\d+(?:\.\d+)?)\s*$/i.exec(desc);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** NJ property classes (MOD-IV): what the class code means. */
export const PROP_CLASS: Record<string, string> = {
  '1': 'vacant land', '2': 'residential (4 families or less)', '3A': 'farm (regular)', '3B': 'farm (qualified)', '4A': 'commercial', '4B': 'industrial', '4C': 'apartment',
  '15A': 'public school', '15B': 'other school', '15C': 'public property', '15D': 'church and charitable', '15E': 'cemeteries and graveyards', '15F': 'other exempt',
};
