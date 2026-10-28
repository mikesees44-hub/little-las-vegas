/**
 * The walk network: street, lane and footway centrelines as a graph (nodes at
 * every OSM vertex, merged at shared OSM nodes), cut to the import box plus a
 * margin, and every playable entrance tied in by a short connector to the
 * nearest point on a walkable segment (that segment is split there).
 * Coordinates are local metres; the pack converts them to the game frame.
 */
import type { XY } from '../lib/crs';
import { closestOnSegment, dist, open as openRing, pointInRing } from '../lib/geom';

export interface NavLine { id: string; nodeIds: number[]; pts: XY[]; cls: 'street' | 'service' | 'foot' }
export interface NavEntrance { id: string; at: XY }

export interface NavBuilt {
  nodes: XY[];
  edges: [number, number][];
  /** Entrance id → its node. */
  entranceNode: Map<string, number>;
  /** Entrance id → connector length (m). */
  connector: Map<string, number>;
  /** Entrance id → why it could not be connected. */
  unconnected: Map<string, string>;
}

/** Whether segment pq crosses a ring (an edge crossing, or its middle inside). */
export function segmentHitsRing(p: XY, q: XY, ring: XY[]): boolean {
  const r = openRing(ring);
  const cross = (a: XY, b: XY, c: XY) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length];
    const d1 = cross(p, q, a), d2 = cross(p, q, b), d3 = cross(a, b, p), d4 = cross(a, b, q);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  }
  return pointInRing([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], ring);
}

/**
 * `obstacles`: building outlines and water a connector may not cross (never tie an
 * entrance to the nearest street through a wall or across water). The nearest
 * segments are tried in order; an entrance with no clear connector within
 * `maxConnector` is left unconnected and reported.
 */
export function buildNav(lines: NavLine[], entrances: NavEntrance[], opts: { keep?: (p: XY) => boolean; maxConnector?: number; obstacles?: XY[][] } = {}): NavBuilt {
  const keep = opts.keep ?? (() => true);
  const maxC = opts.maxConnector ?? 80;
  const nodes: XY[] = [];
  const byOsm = new Map<number, number>();
  const edgeSet = new Set<string>();
  const edges: [number, number][] = [];
  const addEdge = (a: number, b: number) => {
    if (a === b) return;
    const k = a < b ? `${a},${b}` : `${b},${a}`;
    if (edgeSet.has(k)) return;
    edgeSet.add(k);
    edges.push([a, b]);
  };
  const nodeFor = (osm: number, p: XY) => { let i = byOsm.get(osm); if (i === undefined) { i = nodes.length; nodes.push(p); byOsm.set(osm, i); } return i; };
  for (const l of lines) {
    for (let i = 1; i < l.pts.length; i++) {
      if (!keep(l.pts[i - 1]) && !keep(l.pts[i])) continue;
      addEdge(nodeFor(l.nodeIds[i - 1], l.pts[i - 1]), nodeFor(l.nodeIds[i], l.pts[i]));
    }
  }
  const entranceNode = new Map<string, number>();
  const connector = new Map<string, number>();
  const unconnected = new Map<string, string>();
  for (const e of entrances) {
    // Nearest walkable segment (the edges as they are now, so later entrances can use earlier splits).
    const cands: { k: number; pt: XY; t: number; d: number }[] = [];
    for (let k = 0; k < edges.length; k++) {
      const [a, b] = edges[k];
      const c = closestOnSegment(e.at, nodes[a], nodes[b]);
      if (c.d <= maxC) cands.push({ k, pt: c.pt, t: c.t, d: c.d });
    }
    cands.sort((x, y) => x.d - y.d);
    const obs = (opts.obstacles ?? []).filter((r) => r.some((q) => dist(q, e.at) < maxC + 60));
    const best = cands.slice(0, 12).find((c) => !obs.some((r) => segmentHitsRing(e.at, c.pt, r)));
    if (!best) { unconnected.set(e.id, cands.length ? `every walkable segment within ${maxC} m is behind a building or water (nearest ${Math.round(cands[0].d)} m)` : `no walkable segment within ${maxC} m`); continue; }
    const [a, b] = edges[best.k];
    let at: number;
    if (dist(best.pt, nodes[a]) < 0.5) at = a;
    else if (dist(best.pt, nodes[b]) < 0.5) at = b;
    else {
      at = nodes.length;
      nodes.push(best.pt);
      // Split the segment at the new node.
      edgeSet.delete(a < b ? `${a},${b}` : `${b},${a}`);
      edges.splice(best.k, 1);
      addEdge(a, at);
      addEdge(at, b);
    }
    const en = nodes.length;
    nodes.push(e.at);
    addEdge(en, at);
    entranceNode.set(e.id, en);
    connector.set(e.id, Math.round(best.d * 10) / 10);
  }
  return { nodes, edges, entranceNode, connector, unconnected };
}
