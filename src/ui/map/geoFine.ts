import { getGeo } from './geoData';

/**
 * The fine coastline of the East Coast (barrier islands, Delaware Bay, the
 * Chesapeake, Long Island, Florida), fetched after the basemap, and the
 * Wildwood districts cut from the real island outline.
 */
export async function loadFine(): Promise<{ land: GeoJSON.FeatureCollection; shore: GeoJSON.FeatureCollection; districts: GeoJSON.FeatureCollection }> {
  const [land, shore, districts] = await Promise.all([
    getGeo<GeoJSON.FeatureCollection>('land-east.json'),
    getGeo<GeoJSON.FeatureCollection>('land-shore.json'),
    getGeo<GeoJSON.FeatureCollection>('wildwood.json'),
  ]);
  return { land, shore, districts };
}
