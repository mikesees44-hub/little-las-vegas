import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CITY_LIST } from '../src/engine/cities';
import { DISTRICTS } from '../src/engine/world';
import { LANDMARKS, NJ_TOWNS, PHILLY_HOODS } from '../src/ui/map/places';

const GEO = join(__dirname, '..', 'src', 'ui', 'map', 'geo');

describe('bundled map data', () => {
  it('stays within the geo budget (8 MB) and every layer parses', () => {
    let total = 0;
    for (const f of readdirSync(GEO)) {
      total += statSync(join(GEO, f)).size;
      expect(() => JSON.parse(readFileSync(join(GEO, f), 'utf8'))).not.toThrow();
    }
    expect(total).toBeLessThan(8 * 1024 * 1024);
  });
  it('every game district has a polygon at Wildwood\'s real position', () => {
    const fc = JSON.parse(readFileSync(join(GEO, 'wildwood.json'), 'utf8')) as GeoJSON.FeatureCollection;
    for (const d of DISTRICTS) {
      const f = fc.features.find((x) => x.properties?.id === d.id);
      expect(f, d.id).toBeTruthy();
      const flat = JSON.stringify(f!.geometry).match(/-?\d+\.\d+/g)!.map(Number);
      const lons = flat.filter((_, i) => i % 2 === 0);
      const lats = flat.filter((_, i) => i % 2 === 1);
      const lat = lats.reduce((a, b) => a + b, 0) / lats.length;
      const lon = lons.reduce((a, b) => a + b, 0) / lons.length;
      expect(Math.abs(lat - 38.99)).toBeLessThan(0.04);
      expect(Math.abs(lon + 74.82)).toBeLessThan(0.07);
    }
  });
  it('labels every shore town the brief asks for, plus Philadelphia neighbourhoods', () => {
    const names = new Set([...NJ_TOWNS.map((t) => t.n), ...CITY_LIST.map((c) => c.name)]);
    for (const n of ['Wildwood', 'North Wildwood', 'Wildwood Crest', 'Cape May', 'Stone Harbor', 'Avalon', 'Sea Isle City', 'Ocean City', 'Margate', 'Ventnor', 'Atlantic City', 'Brigantine', 'Somers Point', 'Rio Grande', 'Cape May Court House', 'Villas', 'Millville', 'Vineland', 'Bridgeton', 'Egg Harbor City', 'Hammonton', 'Pleasantville', 'Absecon', 'Mays Landing', 'Camden', 'Cherry Hill', 'Trenton', 'Toms River', 'Asbury Park', 'Long Branch', 'Newark', 'Jersey City', 'Hoboken']) expect(names, n).toContain(n);
    for (const n of ['South Philly', 'Center City', 'Kensington', 'Germantown']) expect(PHILLY_HOODS.map((p) => p.n)).toContain(n);
    const places = JSON.parse(readFileSync(join(GEO, 'places.json'), 'utf8')) as { n: string }[];
    expect(places.length).toBeGreaterThanOrEqual(150);
  });
  it('landmarks only appear once they existed', () => {
    for (const l of LANDMARKS) expect(l.since).toBeLessThanOrEqual(1960);
    const ace = JSON.parse(readFileSync(join(GEO, 'roads.topo.json'), 'utf8'));
    const geoms = Object.values(ace.objects as Record<string, { geometries: { properties: { n: string; y: number } }[] }>)[0].geometries;
    const expressway = geoms.filter((g) => g.properties.n === 'Atlantic City Expressway');
    expect(expressway.length).toBeGreaterThan(0);
    for (const g of expressway) expect(g.properties.y).toBe(1964);
  });
});
