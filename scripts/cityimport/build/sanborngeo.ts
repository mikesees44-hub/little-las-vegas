/**
 * Georeferencing the 1950 Sanborn sheets (dev time). Each sheet's control
 * points are street intersections read off the scan by eye (pixel x, y on the
 * 25% IIIF image, and the two street names), kept in
 * citydata/wildwood/evidence/sanborn-1950-control-points.json. The ground
 * position of each intersection comes from OpenStreetMap (where the two named
 * centrelines cross), so nothing about the sheet is guessed: the fit is an
 * affine transform pixel → local metres by least squares, with each point's
 * residual. A sheet is registered only with 3+ points and an RMS within the
 * tolerance (detailed sheets 15 m; the key map 60 m: it is drawn to a loose
 * 1000 ft/inch); everything else is reported as not fitted, with why.
 * Pure (inputs in, records out).
 */
import { localCrs, type XY } from '../lib/crs';
import type { OsmLayers, LL } from './osm';
import { roadClass } from './osm';
import { streetKey } from '../lib/address';

export interface ControlPoint { px: [number, number]; a: string; b: string; town?: 'crest' | 'wildwood' | 'north' | 'westww'; note?: string }
export interface SheetCP { file: string; size: [number, number]; kind?: 'sheet' | 'keymap'; /** Part of the scan this frame covers (a sheet drawn in two strips): px [x0, y0, x1, y1]. */ crop?: [number, number, number, number]; points: ControlPoint[]; skip?: string; note?: string }
export interface ControlDoc { schemaVersion: 1; source: Record<string, string>; method: string; sheets: Record<string, SheetCP> }

export interface SheetFit {
  sheet: string; file: string; size: [number, number]; kind: 'sheet' | 'keymap'; crop?: [number, number, number, number];
  status: 'registered' | 'not-fitted';
  why?: string;
  /** px → local metres: x = a·px + b·py + c, y = d·px + e·py + f (local CRS about the city origin). */
  affine?: [number, number, number, number, number, number];
  /** The scan's corners (top-left, top-right, bottom-right, bottom-left) in lon/lat. */
  cornersLonLat?: [number, number][];
  points: { px: [number, number]; a: string; b: string; lonLat?: [number, number]; residualM?: number; found: boolean }[];
  rmsM?: number; maxM?: number; scaleMPerPx?: number; rotationDeg?: number;
  /** Leave-one-out check: each point predicted by a fit of the others (worst miss, m); honest where the points sit on a regular grid. */
  looMaxM?: number;
}

const nk = (s: string) => streetKey(s.replace(/-/g, ' ')).replace(/^saint /, 'st ');

/** Where two named streets cross in OSM (every crossing; lon/lat). */
export function crossings(osm: OsmLayers, a: string, b: string): LL[] {
  const ka = nk(a); const kb = nk(b);
  const lines = (k: string) => osm.roads.filter((r) => r.tags.name && roadClass(r.tags.highway) !== 'foot' && nk(r.tags.name) === k).map((r) => r.coords);
  const A = lines(ka); const B = lines(kb);
  const out: LL[] = [];
  for (const la of A) for (const lb of B) for (let i = 1; i < la.length; i++) for (let j = 1; j < lb.length; j++) {
    const p = la[i - 1]; const q = la[i]; const r = lb[j - 1]; const s = lb[j];
    const d = (q[0] - p[0]) * (s[1] - r[1]) - (q[1] - p[1]) * (s[0] - r[0]);
    if (Math.abs(d) < 1e-14) continue;
    const t = ((r[0] - p[0]) * (s[1] - r[1]) - (r[1] - p[1]) * (s[0] - r[0])) / d;
    const u = ((r[0] - p[0]) * (q[1] - p[1]) - (r[1] - p[1]) * (q[0] - p[0])) / d;
    if (t >= -1e-6 && t <= 1 + 1e-6 && u >= -1e-6 && u <= 1 + 1e-6) out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
  }
  // Shared end nodes count as crossings too (a T at a node).
  for (const la of A) for (const lb of B) for (const p of [la[0], la[la.length - 1]]) for (const q of lb) if (Math.abs(p[0] - q[0]) < 1e-9 && Math.abs(p[1] - q[1]) < 1e-9) out.push(p);
  // One per place (a street split in pieces crosses at shared nodes several times).
  const uniq: LL[] = [];
  for (const p of out) if (!uniq.some((u) => Math.abs(u[0] - p[0]) < 5e-5 && Math.abs(u[1] - p[1]) < 5e-5)) uniq.push(p);
  return uniq;
}

function solve3(M: number[][], v: number[]): number[] | undefined {
  // Gaussian elimination, 3x3.
  const A = M.map((r, i) => [...r, v[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c; for (let r = c + 1; r < 3; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-12) return undefined;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < 3; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 4; k++) A[r][k] -= f * A[c][k]; }
  }
  return [0, 1, 2].map((i) => A[i][3] / A[i][i]);
}

/** Least-squares affine px → XY. */
export function fitAffine(px: [number, number][], xy: XY[]): [number, number, number, number, number, number] | undefined {
  let sxx = 0; let sxy = 0; let sx = 0; let syy = 0; let sy = 0; const n = px.length;
  const bx = [0, 0, 0]; const by = [0, 0, 0];
  px.forEach(([x, y], i) => {
    sxx += x * x; sxy += x * y; sx += x; syy += y * y; sy += y;
    bx[0] += x * xy[i][0]; bx[1] += y * xy[i][0]; bx[2] += xy[i][0];
    by[0] += x * xy[i][1]; by[1] += y * xy[i][1]; by[2] += xy[i][1];
  });
  const M = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]];
  const a = solve3(M, bx); const d = solve3(M, by);
  return a && d ? [a[0], a[1], a[2], d[0], d[1], d[2]] : undefined;
}

export function fitSheets(osm: OsmLayers, doc: ControlDoc, origin: { lon: number; lat: number }, townOf: (ll: LL) => string | undefined): SheetFit[] {
  const crs = localCrs(origin);
  const out: SheetFit[] = [];
  for (const [sheet, s] of Object.entries(doc.sheets)) {
    const kind = s.kind ?? 'sheet';
    const fit: SheetFit = { sheet, file: s.file, size: s.size, kind, status: 'not-fitted', points: [] };
    if (s.crop) fit.crop = s.crop;
    out.push(fit);
    if (s.skip) { fit.why = s.skip; continue; }
    const pts: { px: [number, number]; xy: XY; ll: LL; cp: ControlPoint }[] = [];
    // First pass: points whose crossing is unique (or unique in the stated town).
    const cand = s.points.map((cp) => ({ cp, xs: crossings(osm, cp.a, cp.b).filter((ll) => !cp.town || townOf(ll) === cp.town) }));
    for (const c of cand) if (c.xs.length === 1) pts.push({ px: c.cp.px, xy: crs.forward(c.xs[0][0], c.xs[0][1]), ll: c.xs[0], cp: c.cp });
    // Points with several crossings: the one nearest the others' middle.
    if (pts.length) {
      const mx = pts.reduce((a, p) => a + p.xy[0], 0) / pts.length; const my = pts.reduce((a, p) => a + p.xy[1], 0) / pts.length;
      for (const c of cand) if (c.xs.length > 1) {
        const best = c.xs.map((ll) => ({ ll, xy: crs.forward(ll[0], ll[1]) })).sort((p, q) => Math.hypot(p.xy[0] - mx, p.xy[1] - my) - Math.hypot(q.xy[0] - mx, q.xy[1] - my))[0];
        if (Math.hypot(best.xy[0] - mx, best.xy[1] - my) < (kind === 'keymap' ? 8000 : 1200)) pts.push({ px: c.cp.px, xy: best.xy, ll: best.ll, cp: c.cp });
      }
    }
    fit.points = s.points.map((cp) => { const p = pts.find((x) => x.cp === cp); return { px: cp.px, a: cp.a, b: cp.b, found: !!p, lonLat: p ? [Math.round(p.ll[0] * 1e7) / 1e7, Math.round(p.ll[1] * 1e7) / 1e7] : undefined }; });
    if (pts.length < 3) { fit.why = `only ${pts.length} control point${pts.length === 1 ? '' : 's'} found in OSM (${s.points.length} read off the sheet)`; continue; }
    const A = fitAffine(pts.map((p) => p.px), pts.map((p) => p.xy));
    if (!A) { fit.why = 'control points are collinear'; continue; }
    const apply = ([x, y]: [number, number]): XY => [A[0] * x + A[1] * y + A[2], A[3] * x + A[4] * y + A[5]];
    const res = pts.map((p) => { const q = apply(p.px); return Math.hypot(q[0] - p.xy[0], q[1] - p.xy[1]); });
    for (const p of fit.points) { const i = pts.findIndex((x) => x.cp.px === p.px); if (i >= 0) p.residualM = Math.round(res[i] * 10) / 10; }
    fit.rmsM = Math.round(Math.sqrt(res.reduce((a, r) => a + r * r, 0) / res.length) * 10) / 10;
    fit.maxM = Math.round(Math.max(...res) * 10) / 10;
    fit.affine = A.map((x) => Math.round(x * 1e6) / 1e6) as SheetFit['affine'];
    fit.scaleMPerPx = Math.round(Math.sqrt(Math.abs(A[0] * A[4] - A[1] * A[3])) * 1000) / 1000;
    fit.rotationDeg = Math.round((Math.atan2(A[3], A[0]) * 180) / Math.PI * 10) / 10;
    const [x0, y0, x1, y1] = s.crop ?? [0, 0, s.size[0], s.size[1]];
    fit.cornersLonLat = ([[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as [number, number][]).map((c) => { const q = apply(c); const ll = crs.inverse(q[0], q[1]); return [Math.round(ll[0] * 1e7) / 1e7, Math.round(ll[1] * 1e7) / 1e7]; });
    if (pts.length >= 4) {
      let worst = 0;
      for (let i = 0; i < pts.length; i++) {
        const rest = pts.filter((_, j) => j !== i);
        const B = fitAffine(rest.map((p) => p.px), rest.map((p) => p.xy));
        if (!B) continue;
        const q: XY = [B[0] * pts[i].px[0] + B[1] * pts[i].px[1] + B[2], B[3] * pts[i].px[0] + B[4] * pts[i].px[1] + B[5]];
        worst = Math.max(worst, Math.hypot(q[0] - pts[i].xy[0], q[1] - pts[i].xy[1]));
      }
      fit.looMaxM = Math.round(worst * 10) / 10;
    }
    const tol = kind === 'keymap' ? 60 : 15;
    if (fit.rmsM > tol) { fit.why = `RMS ${fit.rmsM} m over ${pts.length} points exceeds ${tol} m`; continue; }
    fit.status = 'registered';
  }
  return out;
}
