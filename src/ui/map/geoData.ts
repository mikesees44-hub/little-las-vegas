import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import countries from './geo/countries.topo.json';
import lakes from './geo/lakes.topo.json';
import landNa from './geo/land-na.json';
import places from './geo/places.json';
import rivers from './geo/rivers.topo.json';
import roads from './geo/roads.topo.json';
import us from './geo/us.topo.json';

/**
 * The bundled vector basemap (loaded as its own chunk, only in the browser).
 * Sources: OpenStreetMap-derived land polygons (geo-maps, ODbL), the US
 * Census states and counties (us-atlas), Natural Earth countries, lakes,
 * rivers, roads and populated places (public domain).
 */

type Topo = Topology;

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

export function loadBasemap(): Basemap {
  const u = us as unknown as Topo;
  const w = countries as unknown as Topo;
  const usaId = '840';
  return {
    land: landNa as unknown as GeoJSON.FeatureCollection,
    lakes: fc(lakes as unknown as Topo, 'lakes'),
    rivers: fc(rivers as unknown as Topo, 'rivers'),
    roads: fc(roads as unknown as Topo, 'roads'),
    stateLines: mesh(u, u.objects.states as GeometryCollection, (a, b) => a !== b) as unknown as GeoJSON.MultiLineString,
    countyLines: mesh(u, u.objects.counties as GeometryCollection, (a, b) => a !== b && String(a.id).slice(0, 2) === String(b.id).slice(0, 2)) as unknown as GeoJSON.MultiLineString,
    borders: mesh(w, w.objects.countries as GeometryCollection, (a, b) => a !== b && (a.id === usaId || b.id === usaId || ['124', '484', '192'].includes(String(a.id)))) as unknown as GeoJSON.MultiLineString,
    counties: fc(u, 'counties'),
    places: places as Basemap['places'],
  };
}
