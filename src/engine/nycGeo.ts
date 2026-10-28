import raw from '../../data/nyc/nyc-1960.json';

/**
 * The bundled New York City map (built by scripts/geo/5_nyc.ts from NYC
 * Department of City Planning and US Census geodata, both public domain).
 * Everything is already projected to map units (1 unit ≈ 50 m, north up),
 * so the game draws SVG paths and never projects at runtime. Bundled into
 * the page: no network.
 */

export type NycLineKind = 'bridge' | 'tunnel' | 'ferry' | 'road' | 'el' | 'planned';
export type NycLabelKind = 'water' | 'borough' | 'nj' | 'landmark';

export interface NycGeo {
  meta: { lon0: number; lat0: number; lon1: number; lat1: number; latc: number; k: number; width: number; height: number; sources: string[]; attribution: string };
  /** New Jersey, Westchester and Nassau: land that is not New York City. */
  outside: string;
  boroughs: { name: string; code: number; d: string }[];
  parks: string;
  /** Neighborhood borders (thin lines). */
  mesh: string;
  /** Each playable district's outline, centroid and label point. */
  districts: Record<string, { d: string; c: [number, number]; at: [number, number] }>;
  lines: { id: string; name: string; kind: NycLineKind; year?: number; d: string; mid: [number, number] }[];
  labels: { name: string; kind: NycLabelKind; x: number; y: number; rot?: number }[];
}

export const NYC_GEO = raw as unknown as NycGeo;

/** Longitude/latitude to map units (the build's projection). */
export function nycProject(lon: number, lat: number): [number, number] {
  const m = NYC_GEO.meta;
  const cos = Math.cos((m.latc * Math.PI) / 180);
  return [(lon - m.lon0) * cos * m.k, (m.lat0 - lat) * m.k];
}

/** The numbers of an SVG path (x, y pairs). */
export function pathPoints(d: string): [number, number][] {
  const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i], nums[i + 1]]);
  return out;
}

/** Bounding box of an SVG path. */
export function pathBounds(d: string): { x0: number; y0: number; x1: number; y1: number } {
  const pts = pathPoints(d);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
}

/** Is a point inside a path's rings (even-odd)? */
export function pointInPath(d: string, x: number, y: number): boolean {
  let inside = false;
  for (const ring of d.split('M').filter(Boolean)) {
    const pts = pathPoints(ring);
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i];
      const [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}
