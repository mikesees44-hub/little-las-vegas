/**
 * The game's island grid, re-derived from real data (dev time only).
 *
 * The illustrated island (hoodData.ts, Ground/PlanView, the iso and block maps,
 * the political overlay) draws Five Mile Beach as a frame of cross streets at
 * a `u` along the island and avenues at a `v` inland. Its street order and
 * spacing were authored from memory; this module measures them from the
 * OpenStreetMap download and the NJ tax parcels instead:
 *
 *   frame       a curvilinear frame along New Jersey Avenue (smoothed), u along
 *               the island, v inland from the Wildwood Boardwalk line
 *   streets     every named cross street (its u where it crosses the middle of
 *               the island, its skew) and every lengthwise avenue (its v
 *               profile along u), each tagged with its municipality
 *   land        the island, the town (inland of the boardwalk/front street),
 *               West Wildwood and the municipal boundaries, as a 10 m raster
 *               in the frame and as traced outlines
 *   profiles    the front (boardwalk or ocean-front street), the waterline and
 *               the bay edge along u
 *
 * Pure: inputs in, records out (the CLI writes them).
 */
import type { Frame } from '../../../src/engine/cityPackage';
import { frameFns } from '../../../src/engine/cityPackage';
import type { OsmDoc } from '../fetch/osm';
import { streetDisplay, streetKey } from '../lib/address';
import { parseOsm, roadClass, type LL, type OsmLayers } from './osm';
import { dedupeParcels, type ParcelRec, type RawParcelFeature } from './parcels';

export type UVp = [number, number];

export const MUNI_TOWN: Record<string, 'crest' | 'wildwood' | 'north' | 'westww'> = { '0515': 'crest', '0514': 'wildwood', '0507': 'north', '0513': 'westww' };
const MUNI_CODE: Record<string, number> = { '0515': 1, '0514': 2, '0507': 3, '0513': 4 };
export const CODE_MUNI = ['', '0515', '0514', '0507', '0513'];

const M_LAT = 111320;
const RAD = Math.PI / 180;

/* ---------------- small helpers ---------------- */

const median = (xs: number[]): number => { if (!xs.length) return NaN; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const quant = (xs: number[], q: number): number => { if (!xs.length) return NaN; const s = [...xs].sort((a, b) => a - b); return s[Math.max(0, Math.min(s.length - 1, Math.round((s.length - 1) * q)))]; };
export const r1 = (x: number) => Math.round(x * 10) / 10;
const r6 = (x: number) => Math.round(x * 1e6) / 1e6;

function fitLine(xs: number[], ys: number[]): { k: number; m: number } {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0; let sxy = 0;
  for (let i = 0; i < n; i++) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); }
  const k = sxx > 1e-6 ? sxy / sxx : 0;
  return { k, m: my - k * mx };
}

/** Douglas–Peucker on an open polyline. */
export function simplifyLine(pts: UVp[], tol: number): UVp[] {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const st: [number, number][] = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop()!;
    const [ax, ay] = pts[a]; const [bx, by] = pts[b];
    const L = Math.hypot(bx - ax, by - ay) || 1e-9;
    let md = -1; let mi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / L;
      if (d > md) { md = d; mi = i; }
    }
    if (md > tol) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

export function simplifyRing(r: UVp[], tol: number): UVp[] {
  if (r.length < 8) return r;
  // Split at the farthest pair so the ring's ends are not pinned arbitrarily.
  let far = 0; let fd = -1;
  for (let i = 0; i < r.length; i++) { const d = Math.hypot(r[i][0] - r[0][0], r[i][1] - r[0][1]); if (d > fd) { fd = d; far = i; } }
  const a = simplifyLine(r.slice(0, far + 1), tol);
  const b = simplifyLine([...r.slice(far), r[0]], tol);
  return [...a, ...b.slice(1, -1)];
}

/* ---------------- the frame ---------------- */

export interface SpineInfo { frame: Frame; describe: Record<string, unknown> }

/**
 * The spine: New Jersey Avenue's centreline (the one avenue that runs the
 * whole island), binned every 100 m along its mean axis, the median offset of
 * each bin, smoothed (±400 m moving average, three passes) and extended 3 km
 * past both ends along the end directions. A vertex every 200 m.
 */
export function deriveSpine(osm: OsmLayers): SpineInfo {
  const nj = osm.roads.filter((r) => r.tags.name === 'New Jersey Avenue' && roadClass(r.tags.highway) === 'street');
  const pts = nj.flatMap((r) => r.coords);
  const lat0 = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const lng0 = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const kx = M_LAT * Math.cos(lat0 * RAD);
  const xy = pts.map((p) => [(p[0] - lng0) * kx, (p[1] - lat0) * M_LAT] as [number, number]);
  // Mean axis (principal direction).
  let sxx = 0; let syy = 0; let sxy = 0;
  for (const [x, y] of xy) { sxx += x * x; syy += y * y; sxy += x * y; }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy); // from east, counter-clockwise
  let t: [number, number] = [Math.cos(ang), Math.sin(ang)];
  if (t[1] < 0) t = [-t[0], -t[1]]; // +u runs north-east (towards Hereford Inlet)
  const nrm: [number, number] = [-t[1], t[0]]; // inland (north-west)
  const along = xy.map(([x, y]) => x * t[0] + y * t[1]);
  const across = xy.map(([x, y]) => x * nrm[0] + y * nrm[1]);
  const B = 100;
  const x0 = Math.floor(Math.min(...along) / B) * B;
  const x1 = Math.ceil(Math.max(...along) / B) * B;
  const nb = Math.round((x1 - x0) / B) + 1;
  const bins: number[][] = Array.from({ length: nb }, () => []);
  along.forEach((a, i) => bins[Math.round((a - x0) / B)].push(across[i]));
  let ys = bins.map((b) => (b.length ? median(b) : NaN));
  // Fill gaps by linear interpolation.
  for (let i = 0; i < nb; i++) if (Number.isNaN(ys[i])) {
    let a = i - 1; while (a >= 0 && Number.isNaN(ys[a])) a--;
    let b = i + 1; while (b < nb && Number.isNaN(ys[b])) b++;
    ys[i] = a < 0 ? ys[b] : b >= nb ? ys[a] : ys[a] + ((ys[b] - ys[a]) * (i - a)) / (b - a);
  }
  for (let pass = 0; pass < 3; pass++) ys = ys.map((_, i) => { let s = 0; let c = 0; for (let k = -4; k <= 4; k++) { const j = Math.max(0, Math.min(nb - 1, i + k)); s += ys[j]; c++; } return s / c; });
  const yAt = (x: number) => { const f = (x - x0) / B; const i = Math.max(0, Math.min(nb - 2, Math.floor(f))); const tt = f - i; return ys[i] + (ys[i + 1] - ys[i]) * tt; };
  // End slopes over the last kilometre.
  const slope0 = (yAt(x0 + 1000) - yAt(x0)) / 1000;
  const slope1 = (yAt(x1) - yAt(x1 - 1000)) / 1000;
  const EXT = 3000;
  const sp: [number, number][] = [];
  for (let x = x0 - EXT; x <= x1 + EXT + 1e-6; x += 200) {
    const y = x < x0 ? yAt(x0) + slope0 * (x - x0) : x > x1 ? yAt(x1) + slope1 * (x - x1) : yAt(x);
    const px = x * t[0] + y * nrm[0];
    const py = x * t[1] + y * nrm[1];
    sp.push([r6(lng0 + px / kx), r6(lat0 + py / M_LAT)]);
  }
  const bearing = (90 - (Math.atan2(t[1], t[0]) / RAD) + 360) % 360;
  const frame: Frame = {
    anchor: { lat: r6(lat0), lng: r6(lng0) }, anchorUV: [0, 0], bearing: Math.round(bearing * 100) / 100,
    spine: { pts: sp, u0: 0, v0: 0, source: 'OpenStreetMap: New Jersey Avenue centreline, binned every 100 m, median offset, smoothed (±400 m, 3 passes), extended 3 km past both ends; a vertex every 200 m' },
  };
  return { frame, describe: { njWays: nj.length, njPoints: pts.length, axisBearing: frame.bearing, alongRange: [x0, x1], vertices: sp.length } };
}

/* ---------------- rasters in the frame ---------------- */

export interface Raster { u0: number; v0: number; cell: number; cols: number; rows: number; data: Uint8Array }

export function makeRaster(u0: number, u1: number, v0: number, v1: number, cell: number): Raster {
  const cols = Math.ceil((u1 - u0) / cell);
  const rows = Math.ceil((v1 - v0) / cell);
  return { u0, v0, cell, cols, rows, data: new Uint8Array(cols * rows) };
}
export const rAt = (r: Raster, u: number, v: number): number => { const i = Math.floor((u - r.u0) / r.cell); const j = Math.floor((v - r.v0) / r.cell); return i < 0 || j < 0 || i >= r.cols || j >= r.rows ? 0 : r.data[j * r.cols + i]; };

/** Fills a polygon (uv ring) into the raster with `val` (scanline, cell centres). */
export function fillPoly(r: Raster, ring: UVp[], val: number | ((old: number) => number)): void {
  if (ring.length < 3) return;
  let vmin = Infinity; let vmax = -Infinity;
  for (const p of ring) { vmin = Math.min(vmin, p[1]); vmax = Math.max(vmax, p[1]); }
  const j0 = Math.max(0, Math.floor((vmin - r.v0) / r.cell));
  const j1 = Math.min(r.rows - 1, Math.ceil((vmax - r.v0) / r.cell));
  const n = ring.length;
  for (let j = j0; j <= j1; j++) {
    const v = r.v0 + (j + 0.5) * r.cell;
    const xs: number[] = [];
    for (let k = 0; k < n; k++) {
      const a = ring[k]; const b = ring[(k + 1) % n];
      if ((a[1] <= v && b[1] > v) || (b[1] <= v && a[1] > v)) xs.push(a[0] + ((v - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((xs[k] - r.u0) / r.cell - 0.5));
      const i1 = Math.min(r.cols - 1, Math.floor((xs[k + 1] - r.u0) / r.cell - 0.5));
      for (let i = i0; i <= i1; i++) { const o = j * r.cols + i; r.data[o] = typeof val === 'number' ? val : val(r.data[o]); }
    }
  }
}

/** Marks cells within `w` of a polyline. */
export function strokeLine(r: Raster, line: UVp[], w: number, val: number): void {
  for (let k = 0; k + 1 < line.length; k++) {
    const [a, b] = [line[k], line[k + 1]];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.max(1, Math.ceil(L / (r.cell / 2)));
    const rc = Math.ceil(w / r.cell);
    for (let s = 0; s <= steps; s++) {
      const u = a[0] + ((b[0] - a[0]) * s) / steps; const v = a[1] + ((b[1] - a[1]) * s) / steps;
      const i0 = Math.floor((u - r.u0) / r.cell); const j0 = Math.floor((v - r.v0) / r.cell);
      for (let dj = -rc; dj <= rc; dj++) for (let di = -rc; di <= rc; di++) {
        const i = i0 + di; const j = j0 + dj;
        if (i < 0 || j < 0 || i >= r.cols || j >= r.rows) continue;
        if (Math.hypot(di * r.cell, dj * r.cell) <= w) r.data[j * r.cols + i] = val;
      }
    }
  }
}

/** Binary morphology on a 0/1 mask (square-ish disc of radius k cells). */
export function dilate(m: Uint8Array, cols: number, rows: number, k: number): Uint8Array {
  // Separable box passes (close to a disc for small k).
  const tmp = new Uint8Array(m.length); const out = new Uint8Array(m.length);
  for (let j = 0; j < rows; j++) { let run = -1e9; for (let i = 0; i < cols; i++) { if (m[j * cols + i]) run = i; if (i - run <= k) tmp[j * cols + i] = 1; } run = 1e9; for (let i = cols - 1; i >= 0; i--) { if (m[j * cols + i]) run = i; if (run - i <= k) tmp[j * cols + i] = 1; } }
  for (let i = 0; i < cols; i++) { let run = -1e9; for (let j = 0; j < rows; j++) { if (tmp[j * cols + i]) run = j; if (j - run <= k) out[j * cols + i] = 1; } run = 1e9; for (let j = rows - 1; j >= 0; j--) { if (tmp[j * cols + i]) run = j; if (run - j <= k) out[j * cols + i] = 1; } }
  return out;
}
export function erode(m: Uint8Array, cols: number, rows: number, k: number): Uint8Array {
  const inv = m.map((x) => (x ? 0 : 1));
  return dilate(inv, cols, rows, k).map((x) => (x ? 0 : 1));
}
/** Spreads labels into unlabeled cells up to `k` steps (4-neighbour BFS): the nearest label within k cells. */
export function spreadLabels(r: Raster, k: number): Raster {
  const out: Raster = { ...r, data: r.data.slice() };
  let front: number[] = [];
  for (let s = 0; s < r.data.length; s++) if (r.data[s]) front.push(s);
  for (let step = 0; step < k && front.length; step++) {
    const next: number[] = [];
    for (const c of front) {
      const i = c % r.cols; const j = (c - i) / r.cols;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di; const jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= r.cols || jj >= r.rows) continue;
        const o = jj * r.cols + ii;
        if (!out.data[o]) { out.data[o] = out.data[c]; next.push(o); }
      }
    }
    front = next;
  }
  return out;
}

/** Connected components (4-neighbour) of a 0/1 mask: label per cell, sizes. */
export function components(m: Uint8Array, cols: number, rows: number): { label: Int32Array; sizes: number[] } {
  const label = new Int32Array(m.length).fill(-1);
  const sizes: number[] = [];
  const st: number[] = [];
  for (let s = 0; s < m.length; s++) {
    if (!m[s] || label[s] >= 0) continue;
    const id = sizes.length; let n = 0;
    label[s] = id; st.push(s);
    while (st.length) {
      const c = st.pop()!; n++;
      const i = c % cols; const j = (c - i) / cols;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di; const jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= cols || jj >= rows) continue;
        const o = jj * cols + ii;
        if (m[o] && label[o] < 0) { label[o] = id; st.push(o); }
      }
    }
    sizes.push(n);
  }
  return { label, sizes };
}

/* ---------------- measuring streets ---------------- */

export interface CrossObs {
  key: string; display: string; town: string; muni: string; u: number; skewDeg: number; vMin: number; vMax: number; length: number; ways: string[]; n: number;
  /** u at the ocean and bay ends of its measured stretch (the street's own run across the island). */
  uEnds: [number, number];
  /** Where u was read when not at the middle of the island (a converging pair: the v where they are furthest apart). */
  measuredAt?: number;
}
export interface AveObs { key: string; display: string; town: string; muni: string; v: number; uMin: number; uMax: number; length: number; prof: UVp[]; ways: string[] }

/** Splits named street ways into cross streets and avenues (by direction in the frame) and clusters same-named pieces. */
export function measureStreets(osm: OsmLayers, toUv: (p: LL) => UVp, muniAt: (u: number, v: number) => string, vRef: number): { cross: CrossObs[]; aves: AveObs[] } {
  type Piece = { key: string; name: string; uv: UVp[]; way: string; len: number };
  const crossP: Piece[] = []; const aveP: Piece[] = [];
  for (const r of osm.roads) {
    if (!r.tags.name || roadClass(r.tags.highway) !== 'street') continue;
    if (r.tags.bridge === 'yes' && /parkway|route/i.test(r.tags.name)) continue;
    const uv = r.coords.map(toUv);
    let du = 0; let dv = 0; let len = 0;
    for (let i = 1; i < uv.length; i++) { const a = uv[i - 1]; const b = uv[i]; du += Math.abs(b[0] - a[0]); dv += Math.abs(b[1] - a[1]); len += Math.hypot(b[0] - a[0], b[1] - a[1]); }
    const p: Piece = { key: streetKey(r.tags.name), name: r.tags.name, uv, way: r.sourceId, len };
    // Island pieces only (most vertices on a parcel of the four towns, or beside one).
    // Diamond Beach (Lower Township, south of the Crest: no parcels in the download) counts as island.
    const diamond = (q: UVp) => q[0] > -800 && q[0] < 520 && q[1] > -400 && q[1] < 900;
    if (uv.filter((q) => muniAt(q[0], q[1]) || diamond(q)).length < uv.length * 0.5) continue;
    if (dv > du * 1.6) crossP.push(p); else if (du > dv * 1.6) aveP.push(p);
  }
  // Cluster pieces of one name: cross streets by u (gap > 150 m apart = a different street), avenues by v (> 120 m).
  const cluster = (ps: Piece[], coord: 0 | 1, gap: number) => {
    const by = new Map<string, Piece[]>();
    for (const p of ps) { const l = by.get(p.key); if (l) l.push(p); else by.set(p.key, [p]); }
    const out: Piece[][] = [];
    for (const list of by.values()) {
      const items = list.map((p) => ({ p, c: median(p.uv.map((q) => q[coord])) })).sort((a, b) => a.c - b.c);
      let cur: Piece[] = []; let last = -Infinity;
      for (const it of items) { if (it.c - last > gap && cur.length) { out.push(cur); cur = []; } cur.push(it.p); last = it.c; }
      if (cur.length) out.push(cur);
    }
    return out;
  };
  const cross: CrossObs[] = [];
  for (const cl of cluster(crossP, 0, 150)) {
    const pts = cl.flatMap((p) => p.uv);
    const us = pts.map((p) => p[0]); const vs = pts.map((p) => p[1]);
    const vMin = Math.min(...vs); const vMax = Math.max(...vs);
    const f = vMax - vMin > 40 ? fitLine(vs, us) : { k: 0, m: median(us) };
    const vEval = Math.max(vMin, Math.min(vMax, vRef));
    const u = f.k * vEval + f.m;
    const muniVotes = new Map<string, number>();
    for (const p of pts) { const m = muniAt(p[0], p[1]); if (m) muniVotes.set(m, (muniVotes.get(m) ?? 0) + 1); }
    const muni = [...muniVotes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    cross.push({ key: cl[0].key, display: streetDisplay(cl[0].name), town: MUNI_TOWN[muni] ?? 'other', muni, u, skewDeg: Math.atan(f.k) / RAD, vMin, vMax, length: cl.reduce((s, p) => s + p.len, 0), ways: cl.map((p) => p.way), n: pts.length, uEnds: [f.k * vMin + f.m, f.k * vMax + f.m] });
  }
  // Streets that converge (Schellenger and Cedar meet west of New Jersey Avenue) can come out a few metres apart
  // at vRef, though along most of their run they are a block apart: such a pair is measured where they are
  // furthest apart within the stretch both run (the ocean side of the town), so the grid keeps a real block between them.
  const long = cross.filter((c) => c.vMax - c.vMin > 300).sort((a, b) => a.u - b.u);
  const uAt = (c: CrossObs, v: number) => c.uEnds[0] + ((v - c.vMin) * (c.uEnds[1] - c.uEnds[0])) / Math.max(1, c.vMax - c.vMin);
  for (let i = 0; i + 1 < long.length; i++) {
    const a = long[i]; const b = long[i + 1];
    if (b.u - a.u >= 45) continue;
    const v0 = Math.max(a.vMin, b.vMin, 0); const v1 = Math.min(a.vMax, b.vMax, 700);
    let best = { v: vRef, gap: b.u - a.u };
    for (let v = v0; v <= v1; v += 10) { const g = uAt(b, v) - uAt(a, v); if (g > best.gap) best = { v, gap: g }; }
    if (best.gap - (b.u - a.u) < 5) continue;
    a.u = uAt(a, best.v); b.u = uAt(b, best.v);
    a.measuredAt = b.measuredAt = Math.round(best.v);
  }
  const aves: AveObs[] = [];
  for (const cl of cluster(aveP, 1, 120)) {
    const pts = cl.flatMap((p) => p.uv).sort((a, b) => a[0] - b[0]);
    const us = pts.map((p) => p[0]);
    const muniVotes = new Map<string, number>();
    for (const p of pts) { const m = muniAt(p[0], p[1]); if (m) muniVotes.set(m, (muniVotes.get(m) ?? 0) + 1); }
    const muni = [...muniVotes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    // Profile: median v per 50 m of u where the avenue runs.
    const prof: UVp[] = [];
    const u0 = Math.floor(Math.min(...us) / 50) * 50; const u1 = Math.ceil(Math.max(...us) / 50) * 50;
    for (let u = u0; u <= u1; u += 50) { const vs = pts.filter((p) => Math.abs(p[0] - u) <= 30).map((p) => p[1]); if (vs.length) prof.push([u, median(vs)]); }
    aves.push({ key: cl[0].key, display: streetDisplay(cl[0].name), town: MUNI_TOWN[muni] ?? 'other', muni, v: median(pts.map((p) => p[1])), uMin: Math.min(...us), uMax: Math.max(...us), length: cl.reduce((s, p) => s + p.len, 0), prof, ways: cl.map((p) => p.way) });
  }
  return { cross, aves };
}

/* ---------------- everything measured ---------------- */

export interface Measured {
  frame: Frame;
  fns: ReturnType<typeof frameFns>;
  osm: OsmLayers;
  parcels: ParcelRec[];
  /** Municipality raster (codes 1..4 = CODE_MUNI), land raster (1 land), in the final u/v. */
  muni: Raster;
  land: Raster;
  cross: CrossObs[];
  aves: AveObs[];
  boardwalk: UVp[][];
  /** The download's box [w, s, e, n]. */
  bbox: [number, number, number, number];
  /** Named OSM nodes (lon/lat by name), for landmarks that are not businesses. */
  namedNodes: Map<string, LL>;
  spineInfo: Record<string, unknown>;
  shift: { du: number; dv: number; why: string };
}

export const GRID = { u0: -1600, u1: 9600, v0: -1700, v1: 3300, cell: 10 };

/** The municipality raster (codes 1..4 = CODE_MUNI) in a frame. */
function muniRaster(parcels: ParcelRec[], toUv: (p: LL) => UVp): Raster {
  const r = makeRaster(GRID.u0, GRID.u1, GRID.v0, GRID.v1, GRID.cell);
  for (const p of parcels) for (const part of p.parts) fillPoly(r, part.map(toUv), MUNI_CODE[p.mun!]);
  return r;
}

/** Shifts the raw spine frame so v = 0 is the Wildwood Boardwalk and u = 0 lies 450 m south of the Crest. */
function shifted(raw: Frame, parcels: ParcelRec[], bwWays: { coords: LL[] }[]): { frame: Frame; du: number; bwV: number } {
  const f0: Frame = { ...raw, anchorUV: [0, 0], spine: { ...raw.spine!, u0: 0, v0: 0 } };
  const fns = frameFns(f0);
  const us = (mun: string) => parcels.filter((p) => p.mun === mun).flatMap((p) => p.parts[0].filter((_, i) => i % 3 === 0).map((q) => fns.toUv(q)[0]));
  const crestS = quant(us('0515'), 0.001);
  const ww = us('0514');
  const wwU0 = quant(ww, 0.02);
  const wwU1 = quant(ww, 0.98);
  const bwV = median(bwWays.flatMap((r) => r.coords.map((q) => fns.toUv(q))).filter(([u]) => u > wwU0 && u < wwU1).map((p) => p[1]));
  const du = -(crestS - 450);
  const frame: Frame = { ...raw, spine: { ...raw.spine!, u0: r1(du), v0: r1(bwV) } };
  const [au, av] = frameFns({ ...frame, anchorUV: [0, 0] }).toUv([frame.anchor.lng, frame.anchor.lat]);
  frame.anchorUV = [r1(au), r1(av)];
  return { frame, du, bwV };
}

/**
 * The rib directions: where the cross streets are not square to the spine
 * (north of Cedar Avenue and in North Wildwood they lean several degrees),
 * the frame's cross direction follows them, so a cross street keeps one u
 * from the ocean to the bay. Per spine vertex: the median skew (du/dv) of the
 * long cross streets within 150 m, smoothed, as a bearing.
 */
function ribsFor(frame: Frame, cross: CrossObs[]): number[] {
  const sp = frame.spine!;
  const lat0 = frame.anchor.lat; const lng0 = frame.anchor.lng;
  const kx = M_LAT * Math.cos(lat0 * RAD);
  const P = sp.pts.map((p) => [(p[0] - lng0) * kx, (p[1] - lat0) * M_LAT] as [number, number]);
  const S: number[] = [0];
  for (let i = 1; i < P.length; i++) S.push(S[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const fns = frameFns(frame);
  const long = cross.filter((c) => c.town !== 'other' && c.town !== 'westww' && c.vMax - c.vMin >= 300);
  const ks = P.map((_, i) => {
    const u = S[i] + sp.u0;
    const near = long.filter((c) => Math.abs(c.u - u) <= 150);
    return near.length ? median(near.map((c) => Math.tan(c.skewDeg * RAD))) : NaN;
  });
  // Fill gaps (ends: the nearest measured value), then smooth over three vertices.
  for (let i = 0; i < ks.length; i++) if (Number.isNaN(ks[i])) {
    let a = i - 1; while (a >= 0 && Number.isNaN(ks[a])) a--;
    let b = i + 1; while (b < ks.length && Number.isNaN(ks[b])) b++;
    ks[i] = a < 0 ? (b < ks.length ? ks[b] : 0) : b >= ks.length ? ks[a] : ks[a] + ((ks[b] - ks[a]) * (i - a)) / (b - a);
  }
  const sm = ks.map((_, i) => (ks[Math.max(0, i - 1)] + 2 * ks[i] + ks[Math.min(ks.length - 1, i + 1)]) / 4);
  return P.map((_, i) => {
    // The current cross direction and the along direction at the vertex, from the frame itself.
    const u = S[i] + sp.u0;
    const v = 600;
    const a = fns.toLngLat(u, v); const b = fns.toLngLat(u, v + 100); const c = fns.toLngLat(u + 100, v);
    const R = [(b[0] - a[0]) * kx / 100, (b[1] - a[1]) * M_LAT / 100];
    const T = [(c[0] - a[0]) * kx / 100, (c[1] - a[1]) * M_LAT / 100];
    const x = R[0] + sm[i] * T[0]; const y = R[1] + sm[i] * T[1];
    return Math.round(((Math.atan2(x, y) / RAD + 360) % 360) * 100) / 100;
  });
}

export function measureIsland(doc: OsmDoc, parcelFeatures: RawParcelFeature[]): Measured {
  const osm = parseOsm(doc);
  const sp = deriveSpine(osm);
  const dd = dedupeParcels(parcelFeatures);
  const parcels = dd.parcels.filter((p) => p.mun && MUNI_CODE[p.mun]);
  const bwWays = osm.roads.filter((r) => /boardwalk/i.test(r.tags.name ?? '') && ['footway', 'pedestrian', 'path'].includes(r.tags.highway));
  let raw = sp.frame;
  let frame!: Frame; let du = 0; let bwV = 0; let muni!: Raster; let st!: { cross: CrossObs[]; aves: AveObs[] };
  const ribLog: number[] = [];
  for (let iter = 0; iter < 3; iter++) {
    ({ frame, du, bwV } = shifted(raw, parcels, bwWays));
    const fns = frameFns(frame);
    muni = muniRaster(parcels, (p) => fns.toUv(p));
    const m = spreadLabels(muni, 4);
    const muniNear = (u: number, v: number): string => CODE_MUNI[rAt(m, u, v)] ?? '';
    st = measureStreets(osm, (p) => fns.toUv(p), muniNear, frame.anchorUV[1]);
    const long = st.cross.filter((c) => c.town !== 'other' && c.town !== 'westww' && c.vMax - c.vMin >= 300);
    ribLog.push(r1(Math.sqrt(long.reduce((s, c) => s + c.skewDeg ** 2, 0) / Math.max(1, long.length))));
    if (iter === 2) break;
    raw = { ...raw, spine: { ...raw.spine!, ribs: ribsFor(frame, st.cross) } };
  }
  const fns = frameFns(frame);
  const land = makeRaster(GRID.u0, GRID.u1, GRID.v0, GRID.v1, GRID.cell);
  for (let k = 0; k < muni.data.length; k++) if (muni.data[k]) land.data[k] = 1;
  const nodeLL = new Map<number, LL>();
  for (const e of doc.elements) if (e.type === 'node' && e.lon !== undefined) nodeLL.set(e.id, [e.lon, e.lat!]);
  // Beaches mapped in OSM (the town's parcels stop short of the waterline in places).
  for (const w of doc.elements) {
    if (w.type !== 'way' || w.tags?.natural !== 'beach') continue;
    const ring = (w.nodes ?? []).map((n) => nodeLL.get(n)).filter((x): x is LL => !!x);
    if (ring.length > 3) fillPoly(land, ring.map((q) => fns.toUv(q)), 1);
  }
  const boardwalk = bwWays.map((r) => r.coords.map((q) => fns.toUv(q)));
  const namedNodes = new Map<string, LL>();
  for (const e of doc.elements) if (e.type === 'node' && e.tags?.name && e.lon !== undefined) namedNodes.set(e.tags.name, [e.lon, e.lat!]);
  return {
    frame, fns, osm, parcels, muni, land, cross: st.cross, aves: st.aves, boardwalk, namedNodes,
    bbox: doc.bounds ? [doc.bounds.minlon, doc.bounds.minlat, doc.bounds.maxlon, doc.bounds.maxlat] : [-180, -90, 180, 90],
    spineInfo: { ...sp.describe, crossSkewRmsDegByIteration: ribLog, boardwalkWays: bwWays.length },
    shift: { du: r1(du), dv: r1(-bwV), why: 'u = 0 lies 450 m south of the Crest\'s southernmost parcel (Diamond Beach); v = 0 is the median line of the Wildwood Boardwalk (OSM)' },
  };
}
