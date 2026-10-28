import type { Pt } from './realmGeo';

/**
 * Regions from a label grid: the way a map without hand-drawn district
 * shapes gets its political areas. Label every cell of a grid laid over the
 * land (by the district of the nearest record, say; null for water), and
 * this traces each label's cells into rings and smooths them, so that
 *
 *  - neighbouring regions share their border exactly (the same points, in
 *    opposite order), which is what `realmBorders` and `mergeRealms` match on;
 *  - the points where three areas (or two areas and the sea) meet stay put,
 *    so the smoothing never opens a gap;
 *  - stray single cells are voted away first (a mode filter).
 *
 * Grid vertex (x, y) runs 0..cols, 0..rows; `toWorld` maps it (fractional
 * after smoothing) into the map's SVG coordinates. Pure.
 */

export interface GridOpts {
  /** Mode-filter passes over the labels before tracing. Default 2. */
  vote?: number;
  /** Chaikin smoothing passes. Default 3. */
  smooth?: number;
}

export function regionsFromGrid(cols: number, rows: number, label: (i: number, j: number) => string | null, toWorld: (x: number, y: number) => Pt, o: GridOpts = {}): Map<string, Pt[][]> {
  let L: (string | null)[] = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) L.push(label(i, j));
  const at = (g: (string | null)[], i: number, j: number) => (i < 0 || j < 0 || i >= cols || j >= rows ? null : g[j * cols + i]);
  for (let pass = 0; pass < (o.vote ?? 2); pass++) {
    const next = L.slice();
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const own = L[j * cols + i];
      if (own === null) continue;
      const count = new Map<string, number>();
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const x = at(L, i + di, j + dj);
        if (x !== null) count.set(x, (count.get(x) ?? 0) + 1);
      }
      let best = own;
      let bn = count.get(own) ?? 0;
      for (const [k, n] of count) if (n > bn) { best = k; bn = n; }
      next[j * cols + i] = best;
    }
    L = next;
  }
  const lab = (i: number, j: number) => at(L, i, j);

  // Pinned vertices: three or more labels meet (water counts), or a checkerboard.
  const pinned = (x: number, y: number) => {
    const a = lab(x - 1, y - 1), b = lab(x, y - 1), c = lab(x - 1, y), d = lab(x, y);
    const n = new Set([a, b, c, d]).size;
    return n >= 3 || (n === 2 && a === d && b === c && a !== b);
  };

  // Directed boundary edges, each label's cells kept on the left (counter-clockwise in grid space).
  type E = { a: [number, number]; b: [number, number]; used?: boolean };
  const edges = new Map<string, Map<string, E[]>>();
  const add = (k: string, a: [number, number], b: [number, number]) => {
    let m = edges.get(k);
    if (!m) edges.set(k, (m = new Map()));
    const s = `${a[0]},${a[1]}`;
    const l = m.get(s);
    if (l) l.push({ a, b }); else m.set(s, [{ a, b }]);
  };
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const k = lab(i, j);
    if (k === null) continue;
    if (lab(i, j - 1) !== k) add(k, [i, j], [i + 1, j]);
    if (lab(i + 1, j) !== k) add(k, [i + 1, j], [i + 1, j + 1]);
    if (lab(i, j + 1) !== k) add(k, [i + 1, j + 1], [i, j + 1]);
    if (lab(i - 1, j) !== k) add(k, [i, j + 1], [i, j]);
  }

  const out = new Map<string, Pt[][]>();
  for (const [k, m] of edges) {
    const rings: PP[][] = [];
    for (const list of m.values()) for (const e0 of list) {
      if (e0.used) continue;
      const ring: [number, number][] = [];
      let e: E | undefined = e0;
      while (e && !e.used) {
        e.used = true;
        ring.push(e.a);
        const din = [e.b[0] - e.a[0], e.b[1] - e.a[1]];
        const cand: E[] = (m.get(`${e.b[0]},${e.b[1]}`) ?? []).filter((x) => !x.used);
        // At a checkerboard vertex, turn left: the diagonal cells stay separate rings.
        cand.sort((p, q) => turn(din, q) - turn(din, p));
        e = cand[0];
      }
      if (ring.length >= 3) rings.push(simplify(ring, pinned));
    }
    out.set(k, rings.map((r) => chaikin(r, o.smooth ?? 3).map(([x, y]) => toWorld(x, y))));
  }
  return out;
}

function turn(din: number[], e: { a: [number, number]; b: [number, number] }): number {
  const dx = e.b[0] - e.a[0];
  const dy = e.b[1] - e.a[1];
  const cross = din[0] * dy - din[1] * dx;
  return cross > 0 ? 2 : cross === 0 ? 1 : 0;
}

type PP = { p: Pt; pin: boolean };

/** Drop collinear vertices (except pinned ones), keeping the pins. */
function simplify(r: [number, number][], pinned: (x: number, y: number) => boolean): PP[] {
  const out: PP[] = [];
  const n = r.length;
  for (let i = 0; i < n; i++) {
    const a = r[(i - 1 + n) % n];
    const b = r[i];
    const c = r[(i + 1) % n];
    const pin = pinned(b[0], b[1]);
    const col = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) === 0;
    if (pin || !col) out.push({ p: [b[0], b[1]], pin });
  }
  return out;
}

/** The same point for (a, b, t) and (b, a, 1 - t): shared borders smooth identically from both sides. */
function lerp(a: Pt, b: Pt, t: number): Pt {
  if (a[0] > b[0] || (a[0] === b[0] && a[1] > b[1])) { [a, b] = [b, a]; t = 1 - t; }
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Chaikin corner cutting that never moves a pinned vertex. */
function chaikin(r: PP[], passes: number): Pt[] {
  let cur = r;
  for (let k = 0; k < passes; k++) {
    const next: PP[] = [];
    const n = cur.length;
    if (n < 3) break;
    for (let i = 0; i < n; i++) {
      const a = cur[i];
      const b = cur[(i + 1) % n];
      if (a.pin) next.push(a);
      next.push({ p: lerp(a.p, b.p, 0.25), pin: false }, { p: lerp(a.p, b.p, 0.75), pin: false });
    }
    cur = next;
  }
  return cur.map((x) => x.p);
}
