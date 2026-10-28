/**
 * OSM JSON (API 0.6 map call or Overpass `out body`) → typed records per layer,
 * in original lon/lat. Every record keeps its source id (`osm:way/123`).
 */
import type { OsmDoc, OsmElement } from '../fetch/osm';

export type LL = [number, number];

export interface OsmLine { sourceId: string; tags: Record<string, string>; coords: LL[]; nodeIds: number[] }
export interface OsmArea { sourceId: string; tags: Record<string, string>; ring: LL[]; nodeIds: number[] }
export interface OsmPoint { sourceId: string; tags: Record<string, string>; at: LL }

export interface OsmLayers {
  roads: OsmLine[];
  rail: OsmLine[];
  waterLines: OsmLine[];
  waterAreas: OsmArea[];
  buildings: OsmArea[];
  /** Places of business or institutions (nodes, and ways that are not buildings, e.g. a hotel mapped as its grounds). */
  pois: (OsmPoint & { areaRing?: LL[] })[];
  /** Points tagged as entrances (`entrance=*`), real ones. */
  entrances: OsmPoint[];
  /** Counted and left out, with why. */
  ignored: Record<string, number>;
}

const POI_KEYS = ['amenity', 'shop', 'tourism', 'leisure', 'craft', 'office'];
/** POI values that are not occupants of a building. */
const NOT_OCCUPANT: Record<string, string[]> = {
  amenity: ['parking', 'parking_space', 'fountain', 'bench', 'waste_basket', 'bicycle_parking', 'drinking_water', 'post_box', 'telephone', 'shelter', 'parking_entrance', 'vending_machine', 'recycling'],
  leisure: ['park', 'swimming_pool', 'playground', 'pitch', 'garden', 'picnic_table', 'dog_park', 'track'],
  tourism: ['information', 'viewpoint', 'artwork', 'picnic_site'],
};

export function isOccupant(tags: Record<string, string>): boolean {
  return POI_KEYS.some((k) => tags[k] !== undefined && !(NOT_OCCUPANT[k] ?? []).includes(tags[k]));
}

export function parseOsm(doc: OsmDoc): OsmLayers {
  const nodes = new Map<number, OsmElement>();
  for (const e of doc.elements) if (e.type === 'node') nodes.set(e.id, e);
  const ways = new Map<number, OsmElement>();
  for (const e of doc.elements) if (e.type === 'way') ways.set(e.id, e);
  const out: OsmLayers = { roads: [], rail: [], waterLines: [], waterAreas: [], buildings: [], pois: [], entrances: [], ignored: {} };
  const ign = (k: string) => { out.ignored[k] = (out.ignored[k] ?? 0) + 1; };
  const coordsOf = (w: OsmElement): LL[] | undefined => {
    const c: LL[] = [];
    for (const id of w.nodes ?? []) { const n = nodes.get(id); if (!n || n.lon === undefined || n.lat === undefined) return undefined; c.push([n.lon, n.lat]); }
    return c;
  };
  for (const e of doc.elements) {
    const t = e.tags ?? {};
    if (e.type === 'node') {
      if (t.entrance) out.entrances.push({ sourceId: `osm:node/${e.id}`, tags: t, at: [e.lon!, e.lat!] });
      if (isOccupant(t)) out.pois.push({ sourceId: `osm:node/${e.id}`, tags: t, at: [e.lon!, e.lat!] });
      else if (POI_KEYS.some((k) => t[k])) ign(`node ${POI_KEYS.find((k) => t[k])}=${t[POI_KEYS.find((k) => t[k])!]} (not an occupant)`);
      continue;
    }
    if (e.type === 'way') {
      const c = coordsOf(e);
      if (!c) { if (Object.keys(t).length) ign('way with missing nodes'); continue; }
      const closed = c.length > 3 && e.nodes![0] === e.nodes![e.nodes!.length - 1];
      const sid = `osm:way/${e.id}`;
      if (t.building && closed) {
        out.buildings.push({ sourceId: sid, tags: t, ring: c, nodeIds: e.nodes! });
        if (isOccupant(t)) out.pois.push({ sourceId: sid, tags: t, at: meanLL(c), areaRing: c });
        continue;
      }
      // A former railway now a path is both: walkable (roads) and a rail alignment (rail).
      if (t.railway) out.rail.push({ sourceId: sid, tags: t, coords: c, nodeIds: e.nodes! });
      if (t.highway) { if (t.area === 'yes') ign('highway area'); else out.roads.push({ sourceId: sid, tags: t, coords: c, nodeIds: e.nodes! }); continue; }
      if (t.railway) continue;
      if (t.waterway) { out.waterLines.push({ sourceId: sid, tags: t, coords: c, nodeIds: e.nodes! }); continue; }
      if ((t.natural === 'water' || t.natural === 'wetland') && closed) { out.waterAreas.push({ sourceId: sid, tags: t, ring: c, nodeIds: e.nodes! }); continue; }
      if (t.natural === 'coastline') { out.waterLines.push({ sourceId: sid, tags: t, coords: c, nodeIds: e.nodes! }); continue; }
      if (isOccupant(t) && closed) { out.pois.push({ sourceId: sid, tags: t, at: meanLL(c), areaRing: c }); continue; }
      if (Object.keys(t).length) ign(`way ${Object.keys(t).find((k) => ['amenity', 'leisure', 'landuse', 'man_made'].includes(k)) ?? 'other'}`);
      continue;
    }
    if (e.type === 'relation') {
      if (t.type === 'multipolygon' && t.building) {
        const outer = (e.members ?? []).find((m) => m.type === 'way' && m.role === 'outer');
        const w = outer && ways.get(outer.ref);
        const c = w && coordsOf(w);
        if (c) out.buildings.push({ sourceId: `osm:relation/${e.id}`, tags: t, ring: c, nodeIds: w!.nodes! });
        else ign('building relation with missing outer');
      } else ign(`relation ${t.type ?? '?'}${t.route ? `=${t.route}` : ''}`);
    }
  }
  return out;
}

export function meanLL(c: LL[]): LL {
  const p = c.length > 1 && c[0][0] === c[c.length - 1][0] && c[0][1] === c[c.length - 1][1] ? c.slice(0, -1) : c;
  return [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length];
}

/** Road classes for the game: streets (blocks and walking), service lanes, foot paths. */
export function roadClass(highway: string): 'street' | 'service' | 'foot' {
  if (['footway', 'path', 'pedestrian', 'steps', 'cycleway', 'bridleway', 'corridor'].includes(highway)) return 'foot';
  if (['service', 'track', 'driveway'].includes(highway)) return 'service';
  return 'street';
}
