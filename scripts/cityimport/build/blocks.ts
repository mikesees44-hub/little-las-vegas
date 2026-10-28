/**
 * City blocks from the street network: the street centrelines are noded at
 * shared OSM nodes, dead ends are pruned, and the bounded faces of the planar
 * graph are the blocks (rings in local metres, along the centrelines).
 * Faces that run off the import box (the streets beyond it were not fetched)
 * are kept only when they look like a block, and flagged `complete: false`.
 */
import type { XY } from '../lib/crs';
import { area, centroid, pointInRing, signedArea } from '../lib/geom';

export interface StreetLine { id: string; nodeIds: number[]; pts: XY[] }

export interface Block { id: string; ring: XY[]; area: number; edgeWays: string[]; complete: boolean }

interface HalfEdge { from: number; to: number; pts: XY[]; way: string; angle: number; used: boolean; twin?: HalfEdge }

export function buildBlocks(lines: StreetLine[], opts: { inBox?: (p: XY) => boolean; minArea?: number; maxArea?: number } = {}): { blocks: Block[]; vertices: number; edges: number; pruned: number } {
  // Vertices: way ends and nodes shared by two or more way-ends / ways.
  const use = new Map<number, number>();
  for (const l of lines) l.nodeIds.forEach((n, i) => use.set(n, (use.get(n) ?? 0) + (i === 0 || i === l.nodeIds.length - 1 ? 2 : 1)));
  const pos = new Map<number, XY>();
  for (const l of lines) l.nodeIds.forEach((n, i) => pos.set(n, l.pts[i]));
  // Edges between vertices.
  type E = { a: number; b: number; pts: XY[]; way: string };
  let es: E[] = [];
  const key = new Set<string>();
  for (const l of lines) {
    let start = 0;
    for (let i = 1; i < l.nodeIds.length; i++) {
      if ((use.get(l.nodeIds[i]) ?? 0) >= 2 || i === l.nodeIds.length - 1) {
        const a = l.nodeIds[start], b = l.nodeIds[i];
        const k = a < b ? `${a}-${b}-${l.nodeIds.slice(start, i + 1).length}` : `${b}-${a}-${l.nodeIds.slice(start, i + 1).length}`;
        if (a !== b && !key.has(k)) { key.add(k); es.push({ a, b, pts: l.pts.slice(start, i + 1), way: l.id }); }
        start = i;
      }
    }
  }
  // Prune dead ends until none remain (they bound nothing).
  let pruned = 0;
  for (;;) {
    const deg = new Map<number, number>();
    for (const e of es) { deg.set(e.a, (deg.get(e.a) ?? 0) + 1); deg.set(e.b, (deg.get(e.b) ?? 0) + 1); }
    const keep = es.filter((e) => (deg.get(e.a) ?? 0) > 1 && (deg.get(e.b) ?? 0) > 1);
    if (keep.length === es.length) break;
    pruned += es.length - keep.length;
    es = keep;
  }
  // Half-edges, sorted by angle round each vertex.
  const out = new Map<number, HalfEdge[]>();
  const add = (h: HalfEdge) => { const l = out.get(h.from); if (l) l.push(h); else out.set(h.from, [h]); };
  for (const e of es) {
    const ang = (p: XY[]) => Math.atan2(p[1][1] - p[0][1], p[1][0] - p[0][0]);
    const r = [...e.pts].reverse();
    const h1: HalfEdge = { from: e.a, to: e.b, pts: e.pts, way: e.way, angle: ang(e.pts), used: false };
    const h2: HalfEdge = { from: e.b, to: e.a, pts: r, way: e.way, angle: ang(r), used: false, twin: h1 };
    h1.twin = h2;
    add(h1);
    add(h2);
  }
  for (const l of out.values()) l.sort((x, y) => x.angle - y.angle);
  const faces: { ring: XY[]; ways: Set<string> }[] = [];
  for (const list of out.values()) for (const h0 of list) {
    if (h0.used) continue;
    const ring: XY[] = [];
    const ways = new Set<string>();
    let h = h0;
    for (let guard = 0; guard < 10000; guard++) {
      h.used = true;
      ring.push(...h.pts.slice(0, -1));
      ways.add(h.way);
      // At h.to: the next edge clockwise from the way back (the face stays on the left).
      const around = out.get(h.to)!;
      const back = around.indexOf(h.twin!);
      const nx = around[(back - 1 + around.length) % around.length];
      if (nx === h0) break;
      if (nx.used) { ring.length = 0; break; }
      h = nx;
    }
    if (ring.length >= 3) faces.push({ ring, ways });
  }
  // Bounded faces: counter-clockwise (positive area); the outer face of each piece is clockwise.
  const minA = opts.minArea ?? 300;
  const maxA = opts.maxArea ?? 60000;
  const blocks: Block[] = [];
  for (const f of faces) {
    const sa = signedArea(f.ring);
    if (sa <= 0) continue;
    const a = area(f.ring);
    if (a < minA || a > maxA) continue;
    const complete = opts.inBox ? f.ring.every((p) => opts.inBox!(p)) : true;
    if (opts.inBox && !opts.inBox(centroid(f.ring))) continue;
    blocks.push({ id: '', ring: f.ring, area: a, edgeWays: [...f.ways].sort(), complete });
  }
  // Stable ids: by centroid, west to east then south to north (rounded to 10 m).
  blocks.sort((x, y) => { const [ax, ay] = centroid(x.ring); const [bx, by] = centroid(y.ring); return Math.round(ay / 10) - Math.round(by / 10) || ax - bx; });
  blocks.forEach((b, i) => { b.id = `blk-${String(i + 1).padStart(3, '0')}`; });
  return { blocks, vertices: out.size, edges: es.length, pruned };
}

/** The block a point stands in. */
export function blockOf(blocks: Block[], p: XY): Block | undefined {
  return blocks.find((b) => pointInRing(p, b.ring));
}
