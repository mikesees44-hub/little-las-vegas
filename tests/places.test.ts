import { describe, expect, it } from 'vitest';
import { applyPlaceEdits, lngLatToUv, placeOpenIn, placesGeoJson, placesIn, uvToLngLat, PLACES } from '../src/engine/placesGeo';
import { ASSET_URLS } from '../src/ui/hood/art/assetUrls';
import { newGame } from '../src/engine/newGame';

describe('the business-location layer', () => {
  it('every feature is a well-formed GeoJSON point with a permanent building id, footprint, rotation, sources and known image keys', () => {
    const ids = new Set<string>();
    for (const f of PLACES) {
      expect(f.type).toBe('Feature');
      expect(ids.has(f.id), f.id).toBe(false);
      ids.add(f.id);
      const [lng, lat] = f.geometry.coordinates;
      expect(lng).toBeGreaterThan(-74.9); expect(lng).toBeLessThan(-74.7);
      expect(lat).toBeGreaterThan(38.93); expect(lat).toBeLessThan(39.02);
      const p = f.properties;
      expect(p.building).toBeTruthy();
      expect(p.footprint.w).toBeGreaterThan(0);
      expect(p.footprint.d).toBeGreaterThan(0);
      expect(p.source.length).toBeGreaterThan(20);
      for (const k of [...(p.images.exterior ?? []), p.images.turnaround, p.images.interior].filter(Boolean)) expect(k! in ASSET_URLS, k).toBe(true);
    }
  });

  it('marks a location verified only where the point itself is sourced', () => {
    const verified = PLACES.filter((f) => f.properties.located === 'verified');
    expect(verified.map((f) => f.id)).toEqual(['hunts-pier']);
    expect(verified[0].geometry.coordinates).toEqual([-74.80456, 38.989378]);
    expect(PLACES.find((f) => f.id === 'sa05')!.properties.address).toBe('3700 Pacific Ave');
    const avalon = PLACES.find((f) => f.id === 'club-avalon')!;
    expect(avalon.properties.establishment).toBe(true);
    expect(avalon.properties.lotId).toBeUndefined();
  });

  it('the street frame converts both ways', () => {
    for (const [u, v] of [[3750, -125], [3600, 300], [4100, 50]]) {
      const [uu, vv] = lngLatToUv(uvToLngLat(u, v));
      expect(uu).toBeCloseTo(u, 1);
      expect(vv).toBeCloseTo(v, 1);
    }
  });

  it('filters by the year: Hunt\'s Pier from 1957 to 1985; one occupant per building', () => {
    const hunts = PLACES.find((f) => f.id === 'hunts-pier')!;
    expect(placeOpenIn(hunts, 1956)).toBe(false);
    expect(placeOpenIn(hunts, 1960)).toBe(true);
    expect(placeOpenIn(hunts, 1986)).toBe(false);
    const y60 = placesIn(1960);
    const y75 = placesIn(1975);
    expect(y60.some((f) => f.id === 'bw11')).toBe(true);
    expect(y60.some((f) => f.id === 'bw11-funshop')).toBe(false);
    expect(y75.some((f) => f.id === 'bw11')).toBe(false);
    expect(y75.some((f) => f.id === 'bw11-funshop')).toBe(true);
    for (const list of [y60, y75]) {
      const b = list.map((f) => f.properties.building);
      expect(new Set(b).size).toBe(b.length);
    }
    expect(placesIn(1960).some((f) => f.id === 'hunts-slide')).toBe(false);
  });

  it('every authored lot link points at a real 1960 record', () => {
    const s = newGame('places');
    for (const f of PLACES) if (f.properties.lotId) expect(s.econ!.lots.some((l) => l.id === f.properties.lotId), f.id).toBe(true);
  });

  it('editor corrections apply and export as a FeatureCollection', () => {
    const e = { 'sa20': { coordinates: [-74.81, 38.99] as [number, number], rotation: 45, footprint: { w: 20, d: 30 } } };
    const out = applyPlaceEdits(e);
    const g = out.find((f) => f.id === 'sa20')!;
    expect(g.geometry.coordinates).toEqual([-74.81, 38.99]);
    expect(g.properties.rotation).toBe(45);
    expect(g.properties.footprint).toEqual({ w: 20, d: 30 });
    expect(PLACES.find((f) => f.id === 'sa20')!.properties.rotation).toBe(0);
    const fc = placesGeoJson(out);
    expect(fc.type).toBe('FeatureCollection');
    expect(JSON.parse(JSON.stringify(fc)).features.length).toBe(PLACES.length);
  });
});
