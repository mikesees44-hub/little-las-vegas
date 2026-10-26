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
 * Coordinates were generated from the game's street frame, anchored on the
 * sourced Hunt's Pier point; corrections made in the map editor are exported
 * as GeoJSON to be folded back in here.
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
  rotation: number;
  footprint: { w: number; d: number };
  images: { exterior?: string[]; turnaround?: string; interior?: string };
  located: 'verified' | 'approximate';
  source: string;
}

export interface PlaceFeature {
  type: 'Feature';
  id: string;
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: PlaceProps;
}

/** The street frame the layer is drawn in: the game's island frame (u along the island, v inland, meters), pinned to the map. */
export const PLACE_FRAME = { anchor: { lat: 38.989378, lng: -74.80456 }, anchorUV: [3750, -125] as [number, number], bearing: 49.2 };

export const PLACES: PlaceFeature[] = [
  {"type":"Feature","id":"hunts-pier","geometry":{"type":"Point","coordinates":[-74.80456,38.989378]},"properties":{"building":"pier:hunts","name":"Hunt's Pier","kind":"pier","address":"2701 Boardwalk","opened":1957,"closed":1985,"rotation":180,"footprint":{"w":74,"d":210},"images":{"exterior":["hunts_pier_golf_entrance"]},"located":"verified","source":"Coordinates: Coasterpedia, \"Dinosaur Beach\" (38.989378, -74.804560). Address and the Hunt's Pier years (1957-1985): Wikipedia, \"Hunt's Pier\". Philadelphia Architects & Buildings puts the earlier Ocean Pier on this site near E Poplar and E Juniper Aves; the game's street grid calls the cross street Oak Ave."}},
  {"type":"Feature","id":"hunts-flyer","geometry":{"type":"Point","coordinates":[-74.804371,38.989208]},"properties":{"building":"pier:hunts:2","lotId":"pr01","name":"The Flyer","kind":"ride","address":"Hunt's Pier","opened":1957,"rotation":0,"footprint":{"w":60,"d":46},"images":{},"located":"approximate","source":"A ride of the game's on the pier deck; its spot on the deck is approximate."}},
  {"type":"Feature","id":"hunts-slide","geometry":{"type":"Point","coordinates":[-74.804734,38.989617]},"properties":{"building":"pier:hunts:1","name":"The water slide","kind":"ride","address":"Hunt's Pier","opened":1978,"closed":1985,"datesApprox":true,"rotation":0,"footprint":{"w":40,"d":40},"images":{"exterior":["wipeout_slide"]},"located":"approximate","source":"A late-era attraction (the painting is of the 1970s-80s); the years are placeholders, not sourced."}},
  {"type":"Feature","id":"ocean-theatre","geometry":{"type":"Point","coordinates":[-74.805402,38.990783]},"properties":{"building":"bw:ocean-theatre","name":"The Ocean Theatre (Skyline Golf on the roof)","kind":"theater","address":"Boardwalk, opposite Hunt's Pier","rotation":0,"footprint":{"w":70,"d":66},"images":{"exterior":["hunts_pier_golf_entrance"]},"located":"approximate","source":"Wikipedia (\"Hunt's Pier\"): the Skyline Golf sign stood opposite the pier atop the Ocean Theater. Its footprint and years are not sourced."}},
  {"type":"Feature","id":"bw08","geometry":{"type":"Point","coordinates":[-74.807246,38.989546]},"properties":{"building":"bw08","lotId":"bw08","name":"Moonglow Miniature Golf","kind":"minigolf","address":"Boardwalk at Spicer Ave","opened":1957,"rotation":0,"footprint":{"w":37,"d":66},"images":{},"located":"approximate","source":"Placed by the game's street order (Hunt's Pier = Oak Avenue in the game); not a sourced location. Correct it in the editor."}},
  {"type":"Feature","id":"bw09","geometry":{"type":"Point","coordinates":[-74.806874,38.989795]},"properties":{"building":"bw09","lotId":"bw09","name":"Surrey & Bike Rental","kind":"shop","address":"Boardwalk at Spicer Ave","opened":1946,"rotation":0,"footprint":{"w":37,"d":66},"images":{},"located":"approximate","source":"Placed by the game's street order (Hunt's Pier = Oak Avenue in the game); not a sourced location. Correct it in the editor."}},
  {"type":"Feature","id":"bw10","geometry":{"type":"Point","coordinates":[-74.806415,38.990103]},"properties":{"building":"bw10","lotId":"bw10","name":"The Hurricane Room","kind":"club","address":"Boardwalk at Magnolia Ave","opened":1948,"rotation":0,"footprint":{"w":37,"d":66},"images":{"exterior":["anchor_tavern"]},"located":"approximate","source":"Placed by the game's street order (Hunt's Pier = Oak Avenue in the game); not a sourced location. Correct it in the editor."}},
  {"type":"Feature","id":"bw11","geometry":{"type":"Point","coordinates":[-74.806043,38.990353]},"properties":{"building":"bw11","lotId":"bw11","name":"Funland Novelties","kind":"shop","address":"Boardwalk at Magnolia Ave","opened":1950,"closed":1971,"rotation":0,"footprint":{"w":37,"d":66},"images":{"exterior":["boardwalk_fun_shop"]},"located":"approximate","source":"Placed by the game's street order (Hunt's Pier = Oak Avenue in the game); not a sourced location. Correct it in the editor."}},
  {"type":"Feature","id":"bw12","geometry":{"type":"Point","coordinates":[-74.804753,38.991219]},"properties":{"building":"bw12","lotId":"bw12","name":"Neptune's Fish House","kind":"restaurant","address":"Boardwalk at Pine Ave","opened":1936,"rotation":0,"footprint":{"w":37,"d":66},"images":{"exterior":["lobster_seafood_house"]},"located":"approximate","source":"Placed by the game's street order (Hunt's Pier = Oak Avenue in the game); not a sourced location. Correct it in the editor."}},
  {"type":"Feature","id":"bw13","geometry":{"type":"Point","coordinates":[-74.804381,38.991468]},"properties":{"building":"bw13","lotId":"bw13","name":"Lucky Strike Skee-Ball","kind":"arcade","address":"Boardwalk at Pine Ave","opened":1941,"rotation":0,"footprint":{"w":37,"d":66},"images":{"exterior":["lucky_sevens_arcade"]},"located":"approximate","source":"Placed by the game's street order (Hunt's Pier = Oak Avenue in the game); not a sourced location. Correct it in the editor."}},
  {"type":"Feature","id":"bw14","geometry":{"type":"Point","coordinates":[-74.803922,38.991776]},"properties":{"building":"bw14","lotId":"bw14","name":"The Wave Crest Hotel","kind":"hotel","address":"Boardwalk at Wildwood Ave","opened":1929,"rotation":0,"footprint":{"w":37,"d":66},"images":{},"located":"approximate","source":"Placed by the game's street order (Hunt's Pier = Oak Avenue in the game); not a sourced location. Correct it in the editor."}},
  {"type":"Feature","id":"bw15","geometry":{"type":"Point","coordinates":[-74.803091,38.992334]},"properties":{"building":"bw15","lotId":"bw15","name":"Coney Island Hot Dogs","kind":"food","address":"Boardwalk at Spencer Ave","opened":1953,"rotation":0,"footprint":{"w":37,"d":66},"images":{},"located":"approximate","source":"Placed by the game's street order (Hunt's Pier = Oak Avenue in the game); not a sourced location. Correct it in the editor."}},
  {"type":"Feature","id":"bw16","geometry":{"type":"Point","coordinates":[-74.802719,38.992583]},"properties":{"building":"bw16","lotId":"bw16","name":"Seaside Beachwear","kind":"shop","address":"Boardwalk at Spencer Ave","opened":1947,"rotation":0,"footprint":{"w":37,"d":66},"images":{"exterior":["boardwalk_fun_shop"]},"located":"approximate","source":"Placed by the game's street order (Hunt's Pier = Oak Avenue in the game); not a sourced location. Correct it in the editor."}},
  {"type":"Feature","id":"bw11-funshop","geometry":{"type":"Point","coordinates":[-74.806043,38.990353]},"properties":{"building":"bw11","lotId":"bw11","name":"The Boardwalk Fun Shop","kind":"shop","address":"Boardwalk at Magnolia Ave","opened":1972,"datesApprox":true,"rotation":0,"footprint":{"w":37,"d":66},"images":{"exterior":["boardwalk_fun_shop"]},"located":"approximate","source":"Placed by the game's street order (Hunt's Pier = Oak Avenue in the game); not a sourced location. Correct it in the editor. A later occupant of the same building (fictional years)."}},
  {"type":"Feature","id":"pa05","geometry":{"type":"Point","coordinates":[-74.807316,38.992513]},"properties":{"building":"pa05","lotId":"pa05","name":"The Seven Seas Supper Club","kind":"club","address":"Pacific Ave at Oak Ave","opened":1938,"rotation":180,"footprint":{"w":79,"d":52},"images":{"exterior":[]},"located":"approximate","source":"Placed by the game's street order (Hunt's Pier = Oak Avenue in the game); not a sourced location. Correct it in the editor."}},
  {"type":"Feature","id":"pa03","geometry":{"type":"Point","coordinates":[-74.806299,38.993195]},"properties":{"building":"pa03","lotId":"pa03","name":"Club Riviera","kind":"club","address":"Pacific Ave at Pine Ave","opened":1953,"rotation":180,"footprint":{"w":37,"d":52},"images":{},"located":"approximate","source":"Placed by the game's street order (Hunt's Pier = Oak Avenue in the game); not a sourced location. Correct it in the editor."}},
  {"type":"Feature","id":"sa20","geometry":{"type":"Point","coordinates":[-74.807659,38.993114]},"properties":{"building":"sa20","lotId":"sa20","name":"The Red Garter","kind":"saloon","address":"Pacific Ave at Oak Ave","opened":1958,"datesApprox":true,"rotation":0,"footprint":{"w":37,"d":52},"images":{"turnaround":"red_garter_turnaround","interior":"red_garter_interior_twilight"},"located":"approximate","source":"A long-gone banjo saloon (real name kept). Its block and its years are not sourced."}},
  {"type":"Feature","id":"sa05","geometry":{"type":"Point","coordinates":[-74.805009,38.994061]},"properties":{"building":"sa05","lotId":"sa05","name":"The Shamrock","kind":"tavern","address":"3700 Pacific Ave","opened":1899,"rotation":180,"footprint":{"w":37,"d":52},"images":{"turnaround":"shamrock_turnaround","interior":"shamrock_twilight"},"located":"approximate","source":"Address: 3700 Pacific Ave, from the user's research. Which block that is on the game's grid is a guess (Spencer Ave); the point is approximate."}},
  {"type":"Feature","id":"sa08","geometry":{"type":"Point","coordinates":[-74.809164,38.991273]},"properties":{"building":"sa08","lotId":"sa08","name":"Bellavita","kind":"restaurant","address":"Pacific Ave at Spicer Ave","opened":1951,"rotation":180,"footprint":{"w":37,"d":52},"images":{"turnaround":"bellavita_restaurant_turnaround"},"located":"approximate","source":"Placed by the game's street order (Hunt's Pier = Oak Avenue in the game); not a sourced location. Correct it in the editor."}},
  {"type":"Feature","id":"sa09","geometry":{"type":"Point","coordinates":[-74.80849,38.992556]},"properties":{"building":"sa09","lotId":"sa09","name":"Bayview Deli","kind":"deli","address":"Pacific Ave at Magnolia Ave","opened":1949,"rotation":0,"footprint":{"w":37,"d":52},"images":{"turnaround":"bayview_deli_turnaround"},"located":"approximate","source":"Placed by the game's street order (Hunt's Pier = Oak Avenue in the game); not a sourced location. Correct it in the editor."}},
  {"type":"Feature","id":"pa01","geometry":{"type":"Point","coordinates":[-74.809693,38.991749]},"properties":{"building":"pa01","lotId":"pa01","name":"The Blue Moon","kind":"club","address":"Pacific Ave at Spicer Ave","opened":1946,"rotation":0,"footprint":{"w":37,"d":52},"images":{},"located":"approximate","source":"Placed by the game's street order (Hunt's Pier = Oak Avenue in the game); not a sourced location. Correct it in the editor."}},
  {"type":"Feature","id":"pa02","geometry":{"type":"Point","coordinates":[-74.806368,38.993979]},"properties":{"building":"pa02","lotId":"pa02","name":"The Velvet Rope","kind":"club","address":"Pacific Ave at Wildwood Ave","opened":1950,"rotation":0,"footprint":{"w":37,"d":52},"images":{},"located":"approximate","source":"Placed by the game's street order (Hunt's Pier = Oak Avenue in the game); not a sourced location. Correct it in the editor."}},
  {"type":"Feature","id":"club-avalon","geometry":{"type":"Point","coordinates":[-74.787468,39.007669]},"properties":{"building":"nw:club-avalon","name":"Club Avalon","kind":"landmark","address":"Spruce Ave & Olde New Jersey Ave, North Wildwood","establishment":true,"rotation":0,"footprint":{"w":40,"d":45},"images":{},"located":"approximate","source":"Cross streets as given (Spruce Ave & Olde New Jersey Ave). The point is placed roughly in North Wildwood and is not geocoded. A real entertainer's club: an establishment only, never owned, never in a racket or a crime story."}},
];

const RAD = Math.PI / 180;
const M_LAT = 111320;

/** Island frame (u, v meters) → [lng, lat]. */
export function uvToLngLat(u: number, v: number): [number, number] {
  const { anchor, anchorUV, bearing } = PLACE_FRAME;
  const du = u - anchorUV[0];
  const dv = v - anchorUV[1];
  const b = bearing * RAD;
  const bi = (bearing - 90) * RAD;
  const north = du * Math.cos(b) + dv * Math.cos(bi);
  const east = du * Math.sin(b) + dv * Math.sin(bi);
  return [anchor.lng + east / (M_LAT * Math.cos(anchor.lat * RAD)), anchor.lat + north / M_LAT];
}

/** [lng, lat] → island frame (u, v meters). */
export function lngLatToUv(p: [number, number]): [number, number] {
  const { anchor, anchorUV, bearing } = PLACE_FRAME;
  const east = (p[0] - anchor.lng) * M_LAT * Math.cos(anchor.lat * RAD);
  const north = (p[1] - anchor.lat) * M_LAT;
  const b = bearing * RAD;
  const bi = (bearing - 90) * RAD;
  // The two axes are orthonormal: project onto each.
  const du = north * Math.cos(b) + east * Math.sin(b);
  const dv = north * Math.cos(bi) + east * Math.sin(bi);
  return [anchorUV[0] + du, anchorUV[1] + dv];
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

/** The corrected layer as a GeoJSON FeatureCollection (for "Export corrections"). */
export function placesGeoJson(list: PlaceFeature[]): { type: 'FeatureCollection'; features: PlaceFeature[] } {
  return { type: 'FeatureCollection', features: list };
}
