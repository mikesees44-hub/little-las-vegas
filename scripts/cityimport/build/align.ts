/**
 * Game coordinates and alignment.
 *
 * Game coordinates are computed from the original lon/lat by the town
 * package's own frame (src/worldpack/cities/<town>.json → cityPackage.frameFns),
 * so imported data lands where the game's frame says the real place is. The
 * game's street grid is measured from the same OSM data (cli.ts grid), so the
 * imported streets and the game's agree; `alignment` measures by how much (per
 * named street that both have: the median offset of its points from the
 * game's street, an avenue along its course) and fits u' = a·u + b, v' = c·v + d.
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
  // The game's streets by key; a name can repeat (Pine Ave in Wildwood and in North Wildwood: keyed by its printed label).
  type G = { kind: 'cross' | 'avenue'; value: number; display: string; path?: [number, number][]; from?: number; to?: number };
  const game = new Map<string, G[]>();
  const put = (k: string, g: G) => { const l = game.get(k); if (l) l.push(g); else game.set(k, [g]); };
  for (const s of pkg.streets) {
    if (s.hidden) continue;
    if (s.kind === 'cross' && s.u !== undefined) put(streetKey(s.label ?? s.name), { kind: 'cross', value: s.u, display: s.name });
    if (s.kind === 'avenue' && s.v !== undefined) for (const n of new Set([s.name, ...Object.values(s.names ?? {})])) put(streetKey(n), { kind: 'avenue', value: s.v, display: n, path: s.path, from: s.from as number | undefined, to: s.to as number | undefined });
  }
  const along = (pts: [number, number][], u: number) => { if (u <= pts[0][0]) return pts[0][1]; for (let i = 1; i < pts.length; i++) if (u <= pts[i][0]) { const a = pts[i - 1]; const b = pts[i]; return a[1] + ((u - a[0]) / (b[0] - a[0] || 1)) * (b[1] - a[1]); } return pts[pts.length - 1][1]; };
  // Where the game has the street at a point: a cross street's u; an avenue's v at that u (its course).
  const gameAt = (g: G, u: number) => (g.kind === 'cross' ? g.value : g.path ? along(g.path, u) : g.value);
  const acc = new Map<G, { res: number[]; n: number; key: string }>();
  const notMatched = new Set<string>();
  for (const l of lines) {
    const k = streetKey(l.name);
    const gs = game.get(k);
    if (!gs || !l.uv.length) { notMatched.add(l.name); continue; }
    const mu = l.uv.reduce((s, p) => s + p[0], 0) / l.uv.length;
    const mv = l.uv.reduce((s, p) => s + p[1], 0) / l.uv.length;
    const g = gs.reduce((b, x) => (Math.abs((x.kind === 'cross' ? mu : mv) - gameAt(x, mu)) < Math.abs((b.kind === 'cross' ? mu : mv) - gameAt(b, mu)) ? x : b));
    const a = acc.get(g) ?? { res: [], n: 0, key: k };
    for (const [u, v] of l.uv) { a.res.push((g.kind === 'cross' ? u : v) - gameAt(g, u)); a.n++; }
    acc.set(g, a);
  }
  const streets: StreetObs[] = [];
  for (const [g, a] of acc) {
    const s = [...a.res].sort((x, y) => x - y);
    const med = s[Math.floor(s.length / 2)];
    streets.push({ key: a.key, display: g.display, kind: g.kind, gameValue: g.value, observed: Math.round((g.value + med) * 10) / 10, n: a.n, residual: Math.round(med * 10) / 10 });
  }
  streets.sort((x, y) => (x.kind === y.kind ? x.gameValue - y.gameValue : x.kind === 'cross' ? -1 : 1));
  const cross = streets.filter((s) => s.kind === 'cross'); const ave = streets.filter((s) => s.kind === 'avenue');
  const fu = fit1(cross.map((s) => s.observed), cross.map((s) => s.gameValue));
  const fv = fit1(ave.map((s) => s.observed), ave.map((s) => s.gameValue));
  const all = streets.length || 1;
  const rmsBefore = Math.sqrt(streets.reduce((s, x) => s + x.residual ** 2, 0) / all);
  const rmsAfter = Math.sqrt(streets.reduce((s, x) => s + ((x.kind === 'cross' ? fu.k * x.observed + fu.m : fv.k * x.observed + fv.m) - x.gameValue) ** 2, 0) / all);
  return { streets, fit: { a: r4(fu.k), b: r2(fu.m), c: r4(fv.k), d: r2(fv.m), rmsBefore: r2(rmsBefore), rmsAfter: r2(rmsAfter), n: streets.length }, notMatched: [...notMatched].sort() };
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const r4 = (x: number) => Math.round(x * 10000) / 10000;
