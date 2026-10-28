import { describe, expect, it } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { NYC_DISTRICTS } from '../src/engine/nycData';
import { NYC_GEO, nycProject, pathBounds, pointInPath } from '../src/engine/nycGeo';

const FILE = join(__dirname, '..', 'data', 'nyc', 'nyc-1960.json');

describe('the New York map data', () => {
  it('is bundled, small, and says where it came from', () => {
    expect(statSync(FILE).size).toBeLessThan(400 * 1024);
    expect(JSON.parse(readFileSync(FILE, 'utf8')).meta.width).toBe(NYC_GEO.meta.width);
    expect(NYC_GEO.meta.sources.join(' ')).toMatch(/City Planning/);
    expect(NYC_GEO.meta.sources.join(' ')).toMatch(/Census/);
  });

  it('has all five boroughs, inside a sane frame', () => {
    const names = NYC_GEO.boroughs.map((b) => b.name).sort();
    expect(names).toEqual(['Bronx', 'Brooklyn', 'Manhattan', 'Queens', 'Staten Island']);
    const { width: W, height: H } = NYC_GEO.meta;
    expect(W).toBeGreaterThan(900);
    expect(W).toBeLessThan(1100);
    expect(H).toBeGreaterThan(900);
    for (const b of NYC_GEO.boroughs) {
      const bb = pathBounds(b.d);
      expect(bb.x0).toBeGreaterThanOrEqual(-1);
      expect(bb.y0).toBeGreaterThanOrEqual(-1);
      expect(bb.x1).toBeLessThanOrEqual(W + 1);
      expect(bb.y1).toBeLessThanOrEqual(H + 1);
      expect(b.d.length).toBeGreaterThan(1000);
    }
  });

  it('projects real places onto the right borough', () => {
    const at = (lon: number, lat: number) => NYC_GEO.boroughs.find((b) => pointInPath(b.d, ...nycProject(lon, lat)))?.name;
    expect(at(-73.9855, 40.758)).toBe('Manhattan'); // Times Square
    expect(at(-73.9262, 40.8296)).toBe('Bronx'); // Yankee Stadium
    expect(at(-73.9442, 40.6782)).toBe('Brooklyn'); // Crown Heights
    expect(at(-73.7781, 40.6413)).toBe('Queens'); // Idlewild
    expect(at(-74.1502, 40.5795)).toBe('Staten Island');
    expect(at(-74.03, 40.7)).toBeUndefined(); // the harbor
    expect(at(-74.03, 40.74)).toBeUndefined(); // Hoboken is New Jersey
    // North is up, east is right.
    const [x1, y1] = nycProject(-74, 40.6);
    const [x2, y2] = nycProject(-73.9, 40.7);
    expect(x2).toBeGreaterThan(x1);
    expect(y2).toBeLessThan(y1);
  });

  it('every district maps to a polygon that holds its label, in its borough', () => {
    expect(NYC_DISTRICTS.length).toBeGreaterThanOrEqual(12);
    for (const d of NYC_DISTRICTS) {
      const g = NYC_GEO.districts[d.id];
      expect(g, d.id).toBeDefined();
      expect(g.d.length, d.id).toBeGreaterThan(40);
      expect(pointInPath(g.d, ...g.at), `${d.id} label inside`).toBe(true);
      const boro = NYC_GEO.boroughs.find((b) => b.name === d.borough)!;
      expect(pointInPath(boro.d, ...g.at), `${d.id} in ${d.borough}`).toBe(true);
    }
  });

  it('the Garment District and Times Square split at 42nd Street', () => {
    const g = NYC_GEO.districts.garment;
    const t = NYC_GEO.districts.timessq;
    expect(pointInPath(g.d, ...nycProject(-73.9905, 40.7525))).toBe(true); // 38th & 7th
    expect(pointInPath(t.d, ...nycProject(-73.9855, 40.758))).toBe(true); // Times Square
    expect(pointInPath(g.d, ...nycProject(-73.9855, 40.758))).toBe(false);
  });

  it('draws 1960: Idlewild not JFK, no Verrazzano, the Third Avenue El only in the Bronx', () => {
    const names = [...NYC_GEO.lines.map((l) => l.name), ...NYC_GEO.labels.map((l) => l.name)].join(' | ');
    expect(names).not.toMatch(/Kennedy|JFK|Verrazz?ano/);
    expect(NYC_GEO.lines.find((l) => l.id === 'narrows')?.kind).toBe('planned');
    for (const l of NYC_GEO.lines) if (l.kind === 'bridge' || l.kind === 'tunnel') expect(l.year ?? 0, l.name).toBeLessThanOrEqual(1960);
    expect(NYC_GEO.lines.filter((l) => l.kind === 'bridge').length).toBeGreaterThanOrEqual(10);
    expect(NYC_GEO.lines.filter((l) => l.kind === 'tunnel').length).toBe(4);
    expect(NYC_GEO.lines.find((l) => l.kind === 'el')?.name).toMatch(/Bronx/);
  });
});
