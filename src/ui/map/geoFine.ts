import landEast from './geo/land-east.json';
import landShore from './geo/land-shore.json';
import wildwood from './geo/wildwood.json';

/**
 * The fine coastline of the East Coast (barrier islands, Delaware Bay, the
 * Chesapeake, Long Island, Florida) — a separate chunk, loaded when you zoom
 * in — and the Wildwood districts cut from the real island outline.
 */
export function loadFine(): { land: GeoJSON.FeatureCollection; shore: GeoJSON.FeatureCollection; districts: GeoJSON.FeatureCollection } {
  return {
    land: landEast as unknown as GeoJSON.FeatureCollection,
    shore: landShore as unknown as GeoJSON.FeatureCollection,
    districts: wildwood as unknown as GeoJSON.FeatureCollection,
  };
}
