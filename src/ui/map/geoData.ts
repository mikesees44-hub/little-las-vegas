import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';

/**
 * The bundled vector basemap. The data files live in public/geo and are
 * fetched at runtime (relative to the page) so the game itself loads fast.
 * Sources: OpenStreetMap-derived land polygons (geo-maps, ODbL), the US
 * Census states and counties (us-atlas), Natural Earth countries, lakes,
 * rivers, roads and populated places (public domain).
 */

type Topo = Topology;

export async function getGeo<T = unknown>(name: string): Promise<T> {
  const res = await fetch(`./geo/${name}`);
  if (!res.ok) throw new Error(`Map data ${name}: ${res.status}`);
  return (await res.json()) as T;
}

function fc(t: Topo, name: string): GeoJSON.FeatureCollection {
  return feature(t, t.objects[name] as GeometryCollection) as unknown as GeoJSON.FeatureCollection;
}

export interface Basemap {
  land: GeoJSON.FeatureCollection;
  lakes: GeoJSON.FeatureCollection;
  rivers: GeoJSON.FeatureCollection;
  roads: GeoJSON.FeatureCollection;
  stateLines: GeoJSON.MultiLineString;
  countyLines: GeoJSON.MultiLineString;
  borders: GeoJSON.MultiLineString;
  counties: GeoJSON.FeatureCollection;
  places: { n: string; lat: number; lon: number; z: number; st?: string }[];
}

export async function loadBasemap(): Promise<Basemap> {
  const [us, countries, lakes, landNa, places, rivers, roads] = await Promise.all([
    getGeo<Topo>('us.topo.json'),
    getGeo<Topo>('countries.topo.json'),
    getGeo<Topo>('lakes.topo.json'),
    getGeo<GeoJSON.FeatureCollection>('land-na.json'),
    getGeo<Basemap['places']>('places.json'),
    getGeo<Topo>('rivers.topo.json'),
    getGeo<Topo>('roads.topo.json'),
  ]);
  const u = us;
  const w = countries;
  const usaId = '840';
  return {
    land: landNa,
    lakes: fc(lakes, 'lakes'),
    rivers: fc(rivers, 'rivers'),
    roads: fc(roads, 'roads'),
    stateLines: mesh(u, u.objects.states as GeometryCollection, (a, b) => a !== b) as unknown as GeoJSON.MultiLineString,
    countyLines: mesh(u, u.objects.counties as GeometryCollection, (a, b) => a !== b && String(a.id).slice(0, 2) === String(b.id).slice(0, 2)) as unknown as GeoJSON.MultiLineString,
    borders: mesh(w, w.objects.countries as GeometryCollection, (a, b) => a !== b && (a.id === usaId || b.id === usaId || ['124', '484', '192'].includes(String(a.id)))) as unknown as GeoJSON.MultiLineString,
    counties: fc(u, 'counties'),
    places,
  };
}
