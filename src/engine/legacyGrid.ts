import legacy from '../worldpack/cities/wildwood-legacy-grid.json';
import { frameFns, type Frame } from './cityPackage';
import { AVENUES, CROSS, CROSS_BY_NAME, WEST_WILDWOOD, aveRuns, aveV, frontV, nextCross, type AveId } from './hoodData';
import { WILDWOOD_PACKAGE as PKG } from '../worldpack/cities';

/**
 * The old Wildwood grid (authored from memory, drawn until 2026-10-29) and the
 * way from it to the real one. Positions saved on the old grid — places added
 * in a game from the editor (`s.addedPlaces`), corrections kept in a browser —
 * move by the streets around them: the same spot between the same two cross
 * streets (or in the block north of the first, where those two are not
 * neighbours in reality), the same offset from the nearest avenue (kept inside
 * half the way to the next one). The same rule re-placed the package's own
 * records (scripts/cityimport/build/islandpkg.ts). Pure.
 */

const OLD_CROSS: [string, number][] = [...(legacy.cross as [string, number][])].sort((a, b) => a[1] - b[1]);
const OLD_AVES = legacy.avenues as [string, number][];
const OLD_WW = legacy.westww as { u0: number; u1: number; v0: number; v1: number };
const OLD_FNS = frameFns(legacy.frame as Frame);
const NEW_FNS = frameFns(PKG.geography.frame!);

/** The content version of the package the old grid belonged to. */
export const LEGACY_GRID_VERSION = legacy.contentVersion as string;

/** An old-grid position (u, v) on the real grid. */
export function legacyToNew(u: number, v: number): { u: number; v: number } {
  if (u >= OLD_WW.u0 - 30 && u <= OLD_WW.u1 + 30 && v >= OLD_WW.v0 - 30 && v <= OLD_WW.v1 + 30) {
    const ww = WEST_WILDWOOD;
    const tu = (u - OLD_WW.u0) / (OLD_WW.u1 - OLD_WW.u0);
    const tv = Math.max(0, Math.min(1, (v - OLD_WW.v0) / (OLD_WW.v1 - OLD_WW.v0)));
    return { u: ww.u0 + tu * (ww.u1 - ww.u0), v: ww.v0 + tv * Math.min(400, ww.v1 - ww.v0) };
  }
  let ia = 0;
  for (let i = 0; i < OLD_CROSS.length; i++) if (OLD_CROSS[i][1] <= u) ia = i;
  const [an, au] = OLD_CROSS[ia];
  const B = OLD_CROSS[ia + 1];
  const t = B ? Math.max(0, Math.min(1, (u - au) / (B[1] - au))) : 0.5;
  const nA = CROSS_BY_NAME[an] ?? CROSS[0];
  const after = nextCross(nA);
  const nu = nA.u + t * ((after ? after.u : nA.u + 80) - nA.u);
  const refs: [string, number][] = [['front', 0], ...OLD_AVES];
  const ref = refs.reduce((b, r) => (Math.abs(r[1] - v) < Math.abs(b[1] - v) ? r : b));
  const dv = v - ref[1];
  const base = ref[0] !== 'front' && aveRuns(ref[0] as AveId, nu) ? aveV(ref[0] as AveId, nu) : frontV(nu) + (ref[0] === 'front' ? 0 : ref[1]);
  const lines = [frontV(nu), ...AVENUES.filter((a) => aveRuns(a.id, nu)).map((a) => aveV(a.id, nu))].sort((a, b) => a - b);
  const next = dv >= 0 ? lines.find((x) => x > base + 1) : [...lines].reverse().find((x) => x < base - 1);
  const lim = next !== undefined ? Math.abs(next - base) * 0.45 : Infinity;
  return { u: nu, v: base + Math.sign(dv) * Math.min(Math.abs(dv), lim) };
}

/** A [lng, lat] computed from the old grid (the old frame) moved to where the same spot is on the real grid. */
export function legacyGeoToNew(geo: [number, number]): [number, number] {
  const [u, v] = OLD_FNS.toUv(geo);
  const n = legacyToNew(u, v);
  return NEW_FNS.toLngLat(n.u, n.v).map((x) => Math.round(x * 1e6) / 1e6) as [number, number];
}

/** The grid version a save's own positions are on (GameState.islandGrid). */
export const ISLAND_GRID = 2;

/**
 * Moves the positions an old save holds on the old grid (the places added in
 * the game from the editor: their lots' points, their map points, their
 * landmarks) onto the real grid, once. Ids, owners and everything else stay.
 */
export function migrateIslandGrid(s: { addedPlaces?: import('./addPlace').AddedPlaces; islandGrid?: number }): number {
  if (s.islandGrid === ISLAND_GRID) return 0;
  let n = 0;
  const w = s.addedPlaces?.wildwood;
  // A save with nothing of its own on the grid is left exactly as it is (it is stamped when it first adds a place).
  if (!w || (!w.parcels.length && !w.landmarks.length && !w.placements.length)) return 0;
  {
    for (const p of w.parcels) {
      if (p.pos) { const q = legacyToNew(p.pos.u, p.pos.v); p.pos = { u: Math.round(q.u), v: Math.round(q.v) }; n++; } else if (p.geo) { p.geo = legacyGeoToNew(p.geo); n++; }
    }
    for (const l of w.landmarks) { if (l.pos) { const q = legacyToNew(l.pos.u, l.pos.v); l.pos = { u: Math.round(q.u), v: Math.round(q.v) }; n++; } else if (l.geo) { l.geo = legacyGeoToNew(l.geo); n++; } }
    for (const pl of w.placements) { pl.geo = legacyGeoToNew(pl.geo); n++; }
  }
  s.islandGrid = ISLAND_GRID;
  return n;
}
