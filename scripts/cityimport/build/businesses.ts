/**
 * Businesses and institutions, kept apart from the buildings they occupy.
 * A business is an occupant: it points at a building (and a parcel) when its
 * point stands in one, and several businesses may share one building. OSM
 * duplicates (the same name mapped as a node and as an area within 40 m) are
 * merged, every source id kept.
 */
import type { XY } from '../lib/crs';
import { centroid, dist, pointInRing } from '../lib/geom';
import { formatOsmAddress, parseAddress, sameAddress } from '../lib/address';

export interface PoiIn { sourceId: string; tags: Record<string, string>; at: XY; ring?: XY[]; lonLat: [number, number] }

export interface BusinessRec {
  id: string;
  name: string;
  category: string;
  kind: 'business' | 'institution';
  sourceIds: string[];
  at: XY;
  lonLat: [number, number];
  buildingId?: string;
  /** How the building link was made. */
  buildingVia?: 'same-osm-feature' | 'point-in-outline';
  parcelId?: string;
  address?: string;
  addressSource?: 'osm' | 'parcel';
  /** OSM address vs the parcel's assessor address. */
  addressCheck?: 'match' | 'mismatch' | 'no-parcel-address' | 'no-osm-address';
  tags: Record<string, string>;
}

const INSTITUTION: Record<string, string[]> = { amenity: ['place_of_worship', 'school', 'fire_station', 'police', 'townhall', 'library', 'post_office', 'hospital', 'courthouse', 'community_centre', 'kindergarten'] };

export function categoryOf(t: Record<string, string>): { category: string; kind: 'business' | 'institution' } {
  for (const [k, vs] of Object.entries(INSTITUTION)) if (t[k] && vs.includes(t[k])) return { category: t[k].replace(/_/g, ' '), kind: 'institution' };
  for (const k of ['shop', 'amenity', 'tourism', 'leisure', 'craft', 'office']) if (t[k]) return { category: `${k === 'shop' ? 'shop: ' : ''}${t[k].replace(/_/g, ' ')}`, kind: 'business' };
  return { category: 'business', kind: 'business' };
}

const normName = (n: string) => n.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();

export function dedupePois(pois: PoiIn[], maxDist = 40): { kept: PoiIn[]; merged: { into: string; from: string }[]; mergedIds: Map<string, string[]> } {
  const kept: PoiIn[] = [];
  const merged: { into: string; from: string }[] = [];
  const mergedIds = new Map<string, string[]>();
  // Areas first: they carry the outline, a node of the same name merges into them.
  const order = [...pois].sort((a, b) => Number(!!b.ring) - Number(!!a.ring) || a.sourceId.localeCompare(b.sourceId));
  for (const p of order) {
    const name = p.tags.name ? normName(p.tags.name) : '';
    const dup = name ? kept.find((k) => k.tags.name && normName(k.tags.name) === name && dist(k.at, p.at) <= maxDist) : undefined;
    if (dup) {
      merged.push({ into: dup.sourceId, from: p.sourceId });
      mergedIds.set(dup.sourceId, [...(mergedIds.get(dup.sourceId) ?? [dup.sourceId]), p.sourceId]);
      // Tags the kept one lacks (an address on the node) are carried over.
      for (const [k, v] of Object.entries(p.tags)) if (dup.tags[k] === undefined) dup.tags[k] = v;
      continue;
    }
    kept.push({ ...p, tags: { ...p.tags } });
  }
  return { kept, merged, mergedIds };
}

export interface BuildingRef { id: string; ring: XY[]; sourceId?: string }
export interface ParcelRef { id: string; parts: XY[][]; address: string | null }

export function linkBusinesses(pois: PoiIn[], buildings: BuildingRef[], parcels: ParcelRef[], mergedIds: Map<string, string[]>): BusinessRec[] {
  const out: BusinessRec[] = [];
  for (const p of pois) {
    const { category, kind } = categoryOf(p.tags);
    const sameFeature = buildings.find((b) => b.sourceId === p.sourceId);
    const at = p.ring ? centroid(p.ring) : p.at;
    const inside = sameFeature ?? buildings.find((b) => pointInRing(at, b.ring));
    const parcel = parcels.find((q) => q.parts.some((r) => pointInRing(at, r)));
    const osmAddr = formatOsmAddress(p.tags);
    const rec: BusinessRec = {
      id: `biz:${p.sourceId.replace(/^osm:/, 'osm-').replace('/', '-')}`,
      name: p.tags.name ?? `(unnamed ${category})`,
      category, kind,
      sourceIds: mergedIds.get(p.sourceId) ?? [p.sourceId],
      at, lonLat: p.lonLat,
      tags: Object.fromEntries(Object.entries(p.tags).filter(([k]) => /^(name|amenity|shop|tourism|leisure|craft|office|brand|addr:.*|opening_hours|religion|healthcare|cuisine)$/.test(k))),
    };
    if (inside) { rec.buildingId = inside.id; rec.buildingVia = sameFeature ? 'same-osm-feature' : 'point-in-outline'; }
    if (parcel) rec.parcelId = parcel.id;
    if (osmAddr) { rec.address = osmAddr; rec.addressSource = 'osm'; }
    else if (parcel?.address) { rec.address = parcel.address; rec.addressSource = 'parcel'; }
    if (!osmAddr) rec.addressCheck = 'no-osm-address';
    else if (!parcel?.address) rec.addressCheck = 'no-parcel-address';
    else {
      const a = parseAddress(osmAddr), b = parseAddress(parcel.address);
      rec.addressCheck = a && b && sameAddress(a, b) ? 'match' : 'mismatch';
    }
    out.push(rec);
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}
