/**
 * Building outlines ↔ parcels, by overlap area (local metres). Never assumes
 * one building per parcel: a building may stand on several parcels (a motel
 * across three lots) and a parcel may hold several buildings (a house and its
 * garage). Each link records the overlap and both fractions; the primary
 * parcel is the one holding most of the building.
 */
import type { XY } from '../lib/crs';
import { area, bboxOf, bboxOverlap, intersectionArea, type BBox } from '../lib/geom';

export interface MatchBuilding { id: string; ring: XY[] }
export interface MatchParcel { id: string; parts: XY[][] }

export interface Link { parcelId: string; overlap: number; ofBuilding: number; ofParcel: number }
export interface BuildingMatch {
  buildingId: string;
  area: number;
  links: Link[];
  primary?: string;
  /** one-parcel | spans-parcels (one-to-many) | no-parcel */
  relation: 'one-parcel' | 'spans-parcels' | 'no-parcel';
  /** The primary parcel holds under 60% while another holds 25% or more: which parcel's records apply is unclear. */
  ambiguous: boolean;
}

export interface MatchResult {
  buildings: BuildingMatch[];
  /** Parcel id → the buildings standing on it (many-to-one when more than one). */
  byParcel: Map<string, string[]>;
  stats: { oneParcel: number; spans: number; noParcel: number; ambiguous: number; parcelsWithMany: number; parcelsWithOne: number };
}

export const MIN_OF_BUILDING = 0.1;
export const MIN_AREA = 15;
export const MIN_OF_PARCEL = 0.05;

export function matchBuildingsToParcels(buildings: MatchBuilding[], parcels: MatchParcel[]): MatchResult {
  const pIdx = parcels.map((p) => ({ p, bb: bboxOf(p.parts.flat()), area: p.parts.reduce((s, r) => s + area(r), 0) }));
  const out: BuildingMatch[] = [];
  const byParcel = new Map<string, string[]>();
  for (const b of buildings) {
    const bb: BBox = bboxOf(b.ring);
    const ba = area(b.ring);
    const links: Link[] = [];
    for (const { p, bb: pb, area: pa } of pIdx) {
      if (!bboxOverlap(bb, pb)) continue;
      const ov = p.parts.reduce((s, r) => s + intersectionArea(b.ring, r), 0);
      if (ov <= 0) continue;
      const ofB = ov / ba;
      const ofP = pa > 0 ? ov / pa : 0;
      if (ofB >= MIN_OF_BUILDING || (ov >= MIN_AREA && ofP >= MIN_OF_PARCEL)) links.push({ parcelId: p.id, overlap: round(ov), ofBuilding: round3(ofB), ofParcel: round3(ofP) });
    }
    links.sort((x, y) => y.overlap - x.overlap);
    const relation = links.length === 0 ? 'no-parcel' : links.length === 1 ? 'one-parcel' : 'spans-parcels';
    const ambiguous = links.length > 1 && links[0].ofBuilding < 0.6 && links[1].ofBuilding >= 0.25;
    out.push({ buildingId: b.id, area: round(ba), links, primary: links[0]?.parcelId, relation, ambiguous });
    for (const l of links) { const a = byParcel.get(l.parcelId); if (a) a.push(b.id); else byParcel.set(l.parcelId, [b.id]); }
  }
  const stats = {
    oneParcel: out.filter((m) => m.relation === 'one-parcel').length,
    spans: out.filter((m) => m.relation === 'spans-parcels').length,
    noParcel: out.filter((m) => m.relation === 'no-parcel').length,
    ambiguous: out.filter((m) => m.ambiguous).length,
    parcelsWithMany: [...byParcel.values()].filter((l) => l.length > 1).length,
    parcelsWithOne: [...byParcel.values()].filter((l) => l.length === 1).length,
  };
  return { buildings: out, byParcel, stats };
}

const round = (x: number) => Math.round(x * 10) / 10;
const round3 = (x: number) => Math.round(x * 1000) / 1000;
