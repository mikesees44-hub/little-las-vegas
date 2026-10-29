import { describe, expect, it } from 'vitest';
import { applyPlaceEdits, lngLatToUv, placeOpenIn, placesGeoJson, placesIn, uvToLngLat, PLACES } from '../src/engine/placesGeo';
import { ASSET_URLS } from '../src/ui/hood/art/assetUrls';
import { newGame } from '../src/engine/newGame';
import { CROSS_BY_NAME, RES_SEED, aveV } from '../src/engine/hoodData';
import { extraSlots } from '../src/engine/hoodGeo';
import { PLAN_AREAS } from '../src/ui/hood/PlanView';

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
    expect(verified.map((f) => f.id)).toEqual(['hunts-pier', 'hereford-light']);
    expect(verified[0].geometry.coordinates).toEqual([-74.80456, 38.989378]);
    expect(verified[1].geometry.coordinates).toEqual([-74.79222, 39.00667]);
    expect(PLACES.find((f) => f.id === 'sa05')!.properties.address).toBe('3700 Pacific Ave');
    const avalon = PLACES.find((f) => f.id === 'club-avalon')!;
    expect(avalon.properties.establishment).toBe(true);
    expect(avalon.properties.lotId).toBeUndefined();
  });

  it('the street frame converts both ways', () => {
    for (const [u, v] of [[3750, -125], [3600, 300], [4100, 50], [2000, 175], [5200, 41], [6540, 245], [7246, 365]]) {
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

  it('the real frame puts both sourced points on their streets: Hunt\'s Pier between Poplar and Juniper (2701 Boardwalk), the lighthouse at 1st and Central', () => {
    const [hu, hv] = lngLatToUv(PLACES.find((f) => f.id === 'hunts-pier')!.geometry.coordinates);
    expect(hu).toBeGreaterThan(CROSS_BY_NAME['Poplar Ave'].u);
    expect(hu).toBeLessThan(CROSS_BY_NAME['Juniper Ave'].u + 20);
    expect(hv).toBeLessThan(0); // out over the beach, seaward of the boards
    const [lu, lv] = lngLatToUv(PLACES.find((f) => f.id === 'hereford-light')!.geometry.coordinates);
    expect(Math.abs(lu - CROSS_BY_NAME['1st Ave'].u)).toBeLessThan(40);
    expect(Math.abs(lv - aveV('pa', lu))).toBeLessThan(60);
  });

  it('every feature stands in one of the block-map areas, and each area has its places', () => {
    const inA = (a: (typeof PLAN_AREAS)[number], [u, v]: [number, number]) => u >= a.u0 - 50 && u <= a.u1 + 50 && v >= a.v0 - 50 && v <= a.v1 + 50;
    for (const f of PLACES) expect(PLAN_AREAS.some((a) => inA(a, lngLatToUv(f.geometry.coordinates))), f.id).toBe(true);
    // An area of houses (the Crest's empty south end) shows its house lots instead of businesses.
    const homes = [...extraSlots({}).entries()].filter(([id]) => RES_SEED.some((r) => r.id === id)).map(([, sl]) => [(sl.u0 + sl.u1) / 2, (sl.v0 + sl.v1) / 2] as [number, number]);
    for (const a of PLAN_AREAS) expect(PLACES.filter((f) => inA(a, lngLatToUv(f.geometry.coordinates))).length + homes.filter((uv) => inA(a, uv)).length, a.id).toBeGreaterThanOrEqual(2);
  });

  it('still-operating businesses carry near-miss names; defunct places and landmarks keep theirs; years follow the notes', () => {
    const names = PLACES.map((f) => f.properties.name).join(' | ');
    expect(names).not.toMatch(/(?<!Old )Mack's|Kohr|Lollipop|Pompeo|Pompei|Sportland(?! Pier)|Vinnie|Ebb Tide|Funcade|\bNut Hut|Fudge Kitchen(?!ette)|Gateway 26|Olympic|Morey|Lobster House/);
    for (const n of ['Old Mack\'s Pizza', 'Gateway 25', 'Kohl Bros.', 'The Lollypop Motel', 'Klug\'s', 'Sportsland', 'Uncle Vinny\'s', 'The Ebb Tyde Motel', 'The Nutty Hut', 'Ed\'s Fun Arcade', 'Casino Arcadia', 'Olympia Fascination']) expect(names).toContain(n);
    for (const n of ['Quo Vadis', 'The Rainbow Club', 'The Hurricane Club', 'The Riptide', 'The Satellite Motel', 'Schumann\'s Restaurant', 'North Wildwood City Hall', 'The Hereford Inlet Light']) expect(names).toContain(n);
    const by = (id: string) => PLACES.find((f) => f.id === id)!;
    // Klug's (the user's name for the breakfast place) is there from 1960: no 1978 gate.
    expect(placesIn(1960).some((f) => f.id === 'sb01')).toBe(true);
    expect(placesIn(1960).some((f) => f.id === 'bw-lil-nickys')).toBe(false);
    expect(by('at-ebb-tyde').properties).toMatchObject({ address: '5711 Atlantic Ave, Wildwood Crest', opened: 1957 });
    expect(by('at-satellite').properties).toMatchObject({ address: '5909 Atlantic Ave, Wildwood Crest', opened: 1958 });
    expect(by('at-schumanns').properties.address).toBe('5901 Atlantic Ave, Wildwood Crest');
    expect(by('nw-city-hall').properties).toMatchObject({ address: '901 Atlantic Ave, North Wildwood', public: true });
    expect(by('nw-lollypop').properties.address).toBe('2301 Atlantic Ave, North Wildwood');
    expect(by('nw-lollypop-sign').properties.kind).toBe('sign');
    expect(by('pa-rainbow').properties.address).toMatch(/Spicer/);
    // Nothing new is ownable: the new places are layer-only (no lot), and Club Avalon is never owned.
    for (const f of PLACES.filter((x) => /^(bw|nw|pa|at|nj|bay)-/.test(x.id))) expect(f.properties.lotId, f.id).toBeUndefined();
    // Churches, the school, City Hall and the lighthouse are public: never for sale.
    for (const id of ['bw-chapel', 'nj-st-anselms', 'nj-holy-redeemer', 'pa-wildwood-high', 'nw-city-hall', 'hereford-light']) expect(by(id).properties.public, id).toBe(true);
    // The batch-4 records are ownable 1960 lots.
    for (const id of ['sb01', 'sb02', 'sb03', 'sb04', 'sb05', 'sb06']) expect(by(id).properties.lotId).toBe(id);
  });
});
