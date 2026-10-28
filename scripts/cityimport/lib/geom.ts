/**
 * Planar geometry on local metres. Rings are arrays of [x, y]; a closing
 * point equal to the first is tolerated everywhere (and stripped by `open`).
 * Pure, deterministic.
 */
import type { XY } from './crs';

export type Ring = XY[];

export const open = (r: Ring): Ring => (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] ? r.slice(0, -1) : r);

export function signedArea(r: Ring): number {
  const p = open(r);
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

export const area = (r: Ring): number => Math.abs(signedArea(r));

export function centroid(r: Ring): XY {
  const p = open(r);
  let cx = 0, cy = 0, s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    const k = a[0] * b[1] - b[0] * a[1];
    s += k; cx += (a[0] + b[0]) * k; cy += (a[1] + b[1]) * k;
  }
  if (Math.abs(s) < 1e-9) {
    const n = p.length || 1;
    return [p.reduce((t, q) => t + q[0], 0) / n, p.reduce((t, q) => t + q[1], 0) / n];
  }
  return [cx / (3 * s), cy / (3 * s)];
}

export interface BBox { x0: number; y0: number; x1: number; y1: number }
export function bboxOf(pts: XY[]): BBox {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return { x0, y0, x1, y1 };
}
export const bboxOverlap = (a: BBox, b: BBox): boolean => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;

export function pointInRing(pt: XY, r: Ring): boolean {
  const p = open(r);
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i];
    const [xj, yj] = p[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function isConvex(r: Ring): boolean {
  const p = open(r);
  if (p.length < 4) return true;
  let sign = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length], c = p[(i + 2) % p.length];
    const z = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(z) < 1e-9) continue;
    const s = Math.sign(z);
    if (sign === 0) sign = s; else if (s !== sign) return false;
  }
  return true;
}

/** Sutherland–Hodgman: `subject` clipped by a convex `clip`. */
function clipConvex(subject: Ring, clip: Ring): Ring {
  let out = open(subject);
  const c = open(clip);
  const ccw = signedArea(c) > 0;
  for (let i = 0; i < c.length && out.length; i++) {
    const a = c[i];
    const b = c[(i + 1) % c.length];
    const inside = (p: XY) => { const z = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]); return ccw ? z >= -1e-12 : z <= 1e-12; };
    const cross = (p: XY, q: XY): XY => {
      const dx = q[0] - p[0], dy = q[1] - p[1];
      const ex = b[0] - a[0], ey = b[1] - a[1];
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-15) return p;
      const t = ((a[0] - p[0]) * ey - (a[1] - p[1]) * ex) / den;
      return [p[0] + t * dx, p[1] + t * dy];
    };
    const inp = out;
    out = [];
    for (let j = 0; j < inp.length; j++) {
      const cur = inp[j];
      const prev = inp[(j + inp.length - 1) % inp.length];
      const ci = inside(cur), pi = inside(prev);
      if (ci) { if (!pi) out.push(cross(prev, cur)); out.push(cur); } else if (pi) out.push(cross(prev, cur));
    }
  }
  return out;
}

/**
 * Area of the intersection of two simple polygons. Exact when either is
 * convex (Sutherland–Hodgman); otherwise estimated on a sample grid at
 * `step` metres (default: fine enough for ~2,500 samples over the overlap box).
 */
export function intersectionArea(a: Ring, b: Ring, step?: number): number {
  const ba = bboxOf(a), bb = bboxOf(b);
  if (!bboxOverlap(ba, bb)) return 0;
  if (isConvex(b)) return area(clipConvex(a, b));
  if (isConvex(a)) return area(clipConvex(b, a));
  const x0 = Math.max(ba.x0, bb.x0), x1 = Math.min(ba.x1, bb.x1), y0 = Math.max(ba.y0, bb.y0), y1 = Math.min(ba.y1, bb.y1);
  const s = step ?? Math.max(0.1, Math.sqrt(((x1 - x0) * (y1 - y0)) / 2500));
  let n = 0;
  for (let x = x0 + s / 2; x < x1; x += s) for (let y = y0 + s / 2; y < y1; y += s) if (pointInRing([x, y], a) && pointInRing([x, y], b)) n++;
  return n * s * s;
}

export const dist = (a: XY, b: XY): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function polylineLength(p: XY[]): number {
  let s = 0;
  for (let i = 1; i < p.length; i++) s += dist(p[i - 1], p[i]);
  return s;
}

/** The closest point on segment ab to p, with its parameter t in [0, 1]. */
export function closestOnSegment(p: XY, a: XY, b: XY): { pt: XY; t: number; d: number } {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L2 = dx * dx + dy * dy;
  const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
  const pt: XY = [a[0] + t * dx, a[1] + t * dy];
  return { pt, t, d: dist(p, pt) };
}

/** The closest point on a polyline. */
export function closestOnPolyline(p: XY, line: XY[]): { pt: XY; seg: number; t: number; d: number } {
  let best = { pt: line[0], seg: 0, t: 0, d: Infinity };
  for (let i = 1; i < line.length; i++) {
    const c = closestOnSegment(p, line[i - 1], line[i]);
    if (c.d < best.d) best = { ...c, seg: i - 1 };
  }
  return best;
}

/** Convex hull (monotone chain), counter-clockwise. */
export function convexHull(pts: XY[]): XY[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cr = (o: XY, a: XY, b: XY) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: XY[] = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  const hi: XY[] = [];
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}

/**
 * The minimum-area oriented rectangle around a ring: its centre, width (the
 * longer side), depth and the angle of the long side (degrees, from +x,
 * counter-clockwise). Used for footprints' sizes and the street-facing side.
 */
export function orientedRect(r: Ring): { c: XY; w: number; d: number; angle: number; corners: XY[] } {
  const h = convexHull(open(r));
  let best = { a: Infinity, c: [0, 0] as XY, w: 0, d: 0, ang: 0 };
  for (let i = 0; i < h.length; i++) {
    const a = h[i], b = h[(i + 1) % h.length];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const cs = Math.cos(ang), sn = Math.sin(ang);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const q of h) {
      const u = q[0] * cs + q[1] * sn;
      const v = -q[0] * sn + q[1] * cs;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    const ar = (u1 - u0) * (v1 - v0);
    if (ar < best.a - 1e-9) {
      const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
      best = { a: ar, c: [cu * cs - cv * sn, cu * sn + cv * cs], w: u1 - u0, d: v1 - v0, ang };
    }
  }
  let { w, d, ang } = best;
  if (d > w) { [w, d] = [d, w]; ang += Math.PI / 2; }
  const cs = Math.cos(ang), sn = Math.sin(ang);
  const corners: XY[] = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([u, v]) => [best.c[0] + u * cs - v * sn, best.c[1] + u * sn + v * cs]);
  let deg = (ang * 180) / Math.PI;
  deg = ((deg % 180) + 180) % 180;
  return { c: best.c, w, d, angle: deg, corners };
}

/** A ring shrunk towards its centroid by `k` (0..1 of the way): a simple inset for generated footprints. */
export function scaleRing(r: Ring, k: number): Ring {
  const c = centroid(r);
  return open(r).map(([x, y]) => [c[0] + (x - c[0]) * k, c[1] + (y - c[1]) * k]);
}

/** Polygon perimeter edges with their lengths. */
export function edges(r: Ring): { a: XY; b: XY; len: number }[] {
  const p = open(r);
  return p.map((a, i) => { const b = p[(i + 1) % p.length]; return { a, b, len: dist(a, b) }; });
}
