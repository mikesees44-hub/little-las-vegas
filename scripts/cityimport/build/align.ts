/**
 * Game coordinates and alignment.
 *
 * Game coordinates are computed from the original lon/lat by the town
 * package's own frame (src/worldpack/cities/<town>.json → cityPackage.frameFns),
 * so imported data lands where the game's frame says the real place is. The
 * game's drawn street grid was laid out from memory, so the imported streets
 * and the game's streets disagree; `alignment` measures by how much (per named
 * street that both have) and fits u' = a·u + b, v' = c·v + d to the game grid,
 * which the view can apply ("fit to the game's streets").
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { frameFns, type CityPackage, type FrameFns } from '../../../src/engine/cityPackage';
import { streetKey } from '../lib/address';

export interface GameFrame { fns: FrameFns; pkg: CityPackage; describe: { frame: string; package: string; anchor: unknown; bearing: number; pin?: unknown; note: string } }

export function loadGameFrame(root: string, town = 'wildwood'): GameFrame {
  const pkg = JSON.parse(readFileSync(join(root, 'src', 'worldpack', 'cities', `${town}.json`), 'utf8')) as CityPackage;
  const f = pkg.geography.frame;
  if (!f) throw new Error(`${town} package has no frame`);
  return {
    fns: frameFns(f), pkg,
    describe: { frame: `${town}-island-uv`, package: `src/worldpack/cities/${town}.json (${pkg.contentVersion})`, anchor: f.anchor, bearing: f.bearing, pin: f.pin, note: 'u along the island (m), v inland (m); spherical 111,320 m/deg; stretched beyond pin.from towards the Hereford Inlet pin' },
  };
}

export interface StreetObs { key: string; display: string; kind: 'cross' | 'avenue'; gameValue: number; observed: number; n: number; residual: number; bearingDiff?: number }
export interface Alignment { ref?: { u: number; v: number }; streets: StreetObs[]; fit: { a: number; b: number; c: number; d: number; rmsBefore: number; rmsAfter: number; n: number }; notMatched: string[]; meanCrossBearingDiffDeg?: number }

/** Least squares y ≈ k·x + m (offset only when fewer than two points or x has no spread). */
function fit1(xs: number[], ys: number[]): { k: number; m: number } {
  const n = xs.length;
  if (!n) return { k: 1, m: 0 };
  const mx = xs.reduce((s, x) => s + x, 0) / n, my = ys.reduce((s, y) => s + y, 0) / n;
  const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  if (n < 2 || sxx < 1) return { k: 1, m: my - mx };
  const k = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / sxx;
  return { k, m: my - k * mx };
}

/**
 * `lines`: named street centrelines in game uv (true frame coordinates).
 * Cross streets compare their mean u with the game's u; avenues their mean v.
 */
export function measureAlignment(pkg: CityPackage, lines: { name: string; uv: [number, number][] }[]): Alignment {
  const game = new Map<string, { kind: 'cross' | 'avenue'; value: number; display: string }>();
  for (const s of pkg.streets) {
    if (s.kind === 'cross' && s.u !== undefined) game.set(streetKey(s.name), { kind: 'cross', value: s.u, display: s.name });
    if (s.kind === 'avenue' && s.v !== undefined) for (const n of new Set([s.name, ...Object.values(s.names ?? {})])) game.set(streetKey(n), { kind: 'avenue', value: s.v, display: n });
  }
  const acc = new Map<string, { sum: number; n: number; pts: [number, number][] }>();
  const notMatched = new Set<string>();
  for (const l of lines) {
    const k = streetKey(l.name);
    const g = game.get(k);
    if (!g) { notMatched.add(l.name); continue; }
    const a = acc.get(k) ?? { sum: 0, n: 0, pts: [] };
    for (const [u, v] of l.uv) { a.sum += g.kind === 'cross' ? u : v; a.n++; a.pts.push([u, v]); }
    acc.set(k, a);
  }
  const streets: StreetObs[] = [];
  // Streets are compared where they cross the middle of the area (a street not parallel to the game's
  // axis would otherwise read differently depending on which of its vertices fall in the box).
  const allPts = [...acc.values()].flatMap((a) => a.pts);
  const ref = { u: mid(allPts.map((p) => p[0])), v: mid(allPts.map((p) => p[1])) };
  for (const [k, a] of acc) {
    const g = game.get(k)!;
    // The street's direction in the frame vs the game's (cross streets run along v, avenues along u).
    const xs = a.pts.map((p) => (g.kind === 'cross' ? p[1] : p[0])), ys = a.pts.map((p) => (g.kind === 'cross' ? p[0] : p[1]));
    const f = fit1(xs, ys);
    const spread = Math.max(...xs) - Math.min(...xs);
    const observed = spread > 20 ? f.k * (g.kind === 'cross' ? ref.v : ref.u) + f.m : a.sum / a.n;
    streets.push({ key: k, display: g.display, kind: g.kind, gameValue: g.value, observed: Math.round(observed * 10) / 10, n: a.n, residual: Math.round((observed - g.value) * 10) / 10, bearingDiff: Math.round((Math.atan(f.k) * 180) / Math.PI * 10) / 10 });
  }
  streets.sort((x, y) => (x.kind === y.kind ? x.gameValue - y.gameValue : x.kind === 'cross' ? -1 : 1));
  const cross = streets.filter((s) => s.kind === 'cross'), ave = streets.filter((s) => s.kind === 'avenue');
  const fu = fit1(cross.map((s) => s.observed), cross.map((s) => s.gameValue));
  const fv = fit1(ave.map((s) => s.observed), ave.map((s) => s.gameValue));
  const all = streets.length || 1;
  const rmsBefore = Math.sqrt(streets.reduce((s, x) => s + x.residual ** 2, 0) / all);
  const rmsAfter = Math.sqrt(streets.reduce((s, x) => s + ((x.kind === 'cross' ? fu.k * x.observed + fu.m : fv.k * x.observed + fv.m) - x.gameValue) ** 2, 0) / all);
  const bd = cross.map((s) => s.bearingDiff ?? 0);
  return {
    ref: { u: r2(ref.u), v: r2(ref.v) },
    streets,
    fit: { a: r4(fu.k), b: r2(fu.m), c: r4(fv.k), d: r2(fv.m), rmsBefore: r2(rmsBefore), rmsAfter: r2(rmsAfter), n: streets.length },
    notMatched: [...notMatched].sort(),
    meanCrossBearingDiffDeg: bd.length ? r2(bd.reduce((s, x) => s + x, 0) / bd.length) : undefined,
  };
}

const mid = (xs: number[]) => (xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0);
const r2 = (x: number) => Math.round(x * 100) / 100;
const r4 = (x: number) => Math.round(x * 10000) / 10000;
