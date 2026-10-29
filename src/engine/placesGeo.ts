import { frameFns, type Placement } from './cityPackage';
import { WILDWOOD_PACKAGE as PKG } from '../worldpack/cities';

/**
 * The business-location layer: every placed property as a GeoJSON Feature
 * (flat, pure data). One feature is one occupant of a building: `building` is
 * the permanent building id (the lot id where the game has a lot), and a
 * building can have several features over the years — the map shows the one
 * whose `opened`..`closed` covers the game year (missing = not known).
 *
 *   geometry      [lng, lat] of the footprint's middle
 *   rotation      degrees, clockwise, relative to the street grid (0 = facing the ocean)
 *   footprint     width along the street × depth, in meters
 *   images        asset-store keys (art/assetUrls.ts in the UI): exterior views, a four-angle sheet, an interior
 *   located       'verified' only when the point itself comes from a source; else 'approximate'
 *   source        where the location (and the years) come from, and what is not sourced
 *
 * Coordinates were generated from the game's street frame and re-placed on
 * the real grid (2026-10-29) by address or corner where the record gives one. The records live in the Wildwood town package
 * (src/worldpack/cities/wildwood.json); corrections made in the map editor
 * are exported (a package, or GeoJSON) to be folded back in there.
 */

export interface PlaceProps {
  building: string;
  lotId?: string;
  name: string;
  kind: string;
  address: string;
  opened?: number;
  closed?: number;
  /** The years are placeholders, not sourced. */
  datesApprox?: boolean;
  /** A landmark establishment (named for a real person): visitable, never owned. */
  establishment?: boolean;
  /** A public building or landmark (a city hall, the lighthouse): never for sale. */
  public?: boolean;
  rotation: number;
  footprint: { w: number; d: number };
  /** exterior: card art, best first; views: transparent sprites of the building from different sides (rotation variants); turnaround: a four-angle sheet; interior. */
  images: { exterior?: string[]; views?: string[]; turnaround?: string; interior?: string };
  located: 'verified' | 'approximate';
  /** A fictional place on a real street (its evidence is invented, not researched). */
  invented?: boolean;
  source: string;
}

export interface PlaceFeature {
  type: 'Feature';
  id: string;
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: PlaceProps;
}

/** The street frame the layer is drawn in: the game's island frame (u along the island, v inland, meters), pinned to the map. */
const FRAME = PKG.geography.frame!;
export const PLACE_FRAME = { anchor: FRAME.anchor, anchorUV: FRAME.anchorUV, bearing: FRAME.bearing };

/** A package placement as the layer's GeoJSON feature. */
export function placementFeature(p: Placement): PlaceFeature {
  const props: PlaceProps = { building: p.building, name: p.name, kind: p.kind, address: p.address, rotation: p.rotation, footprint: p.footprint, images: p.art, located: p.evidence.confidence === 'verified' ? 'verified' : 'approximate', source: p.evidence.source };
  if (p.parcelId !== undefined) props.lotId = p.parcelId;
  if (p.years.from !== undefined) props.opened = p.years.from;
  if (p.years.to !== undefined) props.closed = p.years.to;
  if (p.years.approx) props.datesApprox = true;
  if (p.establishment) props.establishment = true;
  if (p.public) props.public = true;
  if (p.evidence.confidence === 'invented') props.invented = true;
  return { type: 'Feature', id: p.id, geometry: { type: 'Point', coordinates: p.geo }, properties: props };
}

/** The layer: the Wildwood package's placements (corrections are exported as a package or GeoJSON and folded back in there). */
export const PLACES: PlaceFeature[] = PKG.placements.map(placementFeature);

/**
 * The frame follows the real island (measured from OpenStreetMap, 2026-10-29:
 * a curvilinear frame along New Jersey Avenue, see `cityPackage.frameFns` and
 * scripts/cityimport `grid`), so a point's lng/lat and its u, v agree
 * everywhere; the sourced points (Hunt's Pier, the Hereford Inlet Light) land
 * on their own streets.
 */
const FNS = frameFns(FRAME);

/** Island frame (u, v meters) → [lng, lat]. */
export function uvToLngLat(u: number, v: number): [number, number] {
  return FNS.toLngLat(u, v);
}

/** [lng, lat] → island frame (u, v meters). */
export function lngLatToUv(p: [number, number]): [number, number] {
  return FNS.toUv(p);
}

/** Whether a feature is open in a given year (unknown years count as open). */
export function placeOpenIn(f: PlaceFeature, year: number): boolean {
  const { opened, closed } = f.properties;
  return (opened === undefined || opened <= year) && (closed === undefined || closed >= year);
}

/** The occupants standing in a year: per building, the latest one that has opened. */
export function placesIn(year: number, list: PlaceFeature[] = PLACES): PlaceFeature[] {
  const best = new Map<string, PlaceFeature>();
  for (const f of list) {
    if (!placeOpenIn(f, year)) continue;
    const cur = best.get(f.properties.building);
    if (!cur || (f.properties.opened ?? 0) > (cur.properties.opened ?? 0)) best.set(f.properties.building, f);
  }
  return list.filter((f) => best.get(f.properties.building) === f);
}

/** A correction made in the editor: where the building stands, how it turns, how big it is. */
export interface PlaceEdit { coordinates?: [number, number]; rotation?: number; footprint?: { w: number; d: number } }

/** The features with the editor's corrections applied. */
export function applyPlaceEdits(edits: Record<string, PlaceEdit>, list: PlaceFeature[] = PLACES): PlaceFeature[] {
  return list.map((f) => {
    const e = edits[f.id];
    if (!e) return f;
    return {
      ...f,
      geometry: { type: 'Point', coordinates: e.coordinates ?? f.geometry.coordinates },
      properties: { ...f.properties, rotation: e.rotation ?? f.properties.rotation, footprint: e.footprint ?? f.properties.footprint },
    };
  });
}

/** The corrected layer as a GeoJSON FeatureCollection (for "Copy corrections"). */
export function placesGeoJson(list: PlaceFeature[]): { type: 'FeatureCollection'; features: PlaceFeature[] } {
  return { type: 'FeatureCollection', features: list };
}
