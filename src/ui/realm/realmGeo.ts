/**
 * REALM GEOMETRY — the pure half of the political map mode (Paradox style:
 * every area washed in the colour of the family that holds it, the family's
 * name painted across its territory).
 *
 * Nothing here knows about Wildwood, React or the game state. Any map — the
 * island, the NYC map, an imported city — hands in a list of `RealmRegion`s
 * in its own SVG world coordinates and gets back:
 *
 *  - `holderFromShares`  who holds an area (or that it is contested / neutral)
 *                        from its influence shares;
 *  - `mergeRealms`       the realms: adjacent areas held by the same holder,
 *                        merged into one (one label per contiguous realm);
 *  - `realmBorders`      border segments classified as realm borders (between
 *                        different holders, drawn thick), district borders
 *                        (inside one realm, drawn thin) and the outer edge;
 *  - `placeRealmLabel`   where to paint a realm's name: a gentle curve along
 *                        the territory's long (principal) axis, with a font
 *                        size and text length that fit inside it.
 *
 * Shared borders are found by matching edges, so two neighbouring regions
 * should share their boundary vertices (as `regionsFromGrid` produces, or as
 * topological data such as TopoJSON does). Regions that do not share
 * vertices still work; they just each get their own outline, and can declare
 * `neighbors` explicitly to be merged into one realm.
 */

export type Pt = [number, number];

export interface RealmRegion {
  /** Stable id (a district id). */
  id: string;
  /** Display name of the area ("Pacific Avenue"). */
  name: string;
  /** One or more rings, in the map's SVG world coordinates. Holes are rings inside rings (even-odd). */
  polygons: Pt[][];
  /** The holder's key (a faction id), or null when nobody holds it. */
  holder: string | null;
  /** The holder's share of the area, 0-100. */
  share: number;
  /** When contested: the two holders fighting over it (striped in both colours). */
  contested?: [string, string];
  /** No district name on the map (the ground already names it). */
  hideName?: boolean;
  /** Optional explicit neighbours (ids), for data whose borders do not share vertices. */
  neighbors?: string[];
}

/* ---------------- who holds it ---------------- */

export interface HoldOpts {
  /** Keys that never hold (the unaligned share). Default ['none']. */
  ignore?: string[];
  /** The least share that holds an area. Default 30. */
  min?: number;
  /** The lead over the runner-up needed to hold it outright. Default 10. */
  lead?: number;
  /** Below this, the runner-up is not a contender (no contest). Default 20. */
  contender?: number;
}

/**
 * The holder of an area from its influence shares: the top share holds it
 * when it has at least `min` and leads the runner-up by `lead`; two
 * contenders within `lead` of each other (both at least `contender`) contest
 * it; anything else is neutral.
 */
export function holderFromShares(shares: Partial<Record<string, number>>, o: HoldOpts = {}): { holder: string | null; share: number; contested?: [string, string] } {
  const ignore = new Set(o.ignore ?? ['none']);
  const min = o.min ?? 30;
  const lead = o.lead ?? 10;
  const contender = o.contender ?? 20;
  const ranked = Object.entries(shares)
    .filter(([k, v]) => !ignore.has(k) && (v ?? 0) > 0)
    .map(([k, v]) => [k, v ?? 0] as [string, number])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const [a, b] = ranked;
  if (!a) return { holder: null, share: 0 };
  if (b && b[1] >= contender && a[1] - b[1] < lead) return { holder: a[0], share: a[1], contested: [a[0], b[0]] };
  if (a[1] >= min) return { holder: a[0], share: a[1] };
  return { holder: null, share: a[1] };
}

/** The key regions are merged on: the holder, a contest (never merged into either side), or neutral. */
export function realmKey(r: Pick<RealmRegion, 'holder' | 'contested'>): string {
  if (r.contested) return `contested:${[...r.contested].sort().join('|')}`;
  return r.holder ?? 'neutral';
}

/* ---------------- polygon basics ---------------- */

export function ringArea(r: Pt[]): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return a / 2;
}

/** Even-odd point in polygon over all rings. */
export function insideRings(rings: Pt[][], x: number, y: number): boolean {
  let inside = false;
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i];
      const [xj, yj] = r[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

export function bboxOf(rings: Pt[][]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rings) for (const [x, y] of r) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return { x0, y0, x1, y1 };
}

/** Points on a grid inside the rings (about `n` across the longer side). */
export function interiorSamples(rings: Pt[][], n = 48): Pt[] {
  const b = bboxOf(rings);
  if (!isFinite(b.x0)) return [];
  const step = Math.max(b.x1 - b.x0, b.y1 - b.y0) / n || 1;
  const out: Pt[] = [];
  for (let y = b.y0 + step / 2; y < b.y1; y += step) for (let x = b.x0 + step / 2; x < b.x1; x += step) if (insideRings(rings, x, y)) out.push([x, y]);
  if (!out.length) for (const r of rings) out.push(...r);
  return out;
}

/** The centre of mass of the rings' interior (a point inside, for a district name). */
export function labelPoint(rings: Pt[][]): Pt {
  const pts = interiorSamples(rings, 40);
  if (!pts.length) return [0, 0];
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  if (insideRings(rings, cx, cy)) return [cx, cy];
  // A crescent: the interior sample nearest the centre of mass.
  let best = pts[0];
  let bd = Infinity;
  for (const p of pts) { const d = (p[0] - cx) ** 2 + (p[1] - cy) ** 2; if (d < bd) { bd = d; best = p; } }
  return best;
}

/* ---------------- edges, borders, merging ---------------- */

const q = (n: number) => Math.round(n * 100) / 100;
const vkey = (p: Pt) => `${q(p[0])},${q(p[1])}`;
const ekey = (a: Pt, b: Pt) => { const ka = vkey(a); const kb = vkey(b); return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`; };

/** Which regions own each edge (by matched endpoints). */
function edgeOwners(regions: readonly RealmRegion[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const r of regions) for (const ring of r.polygons) for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (a[0] === b[0] && a[1] === b[1]) continue;
    const k = ekey(a, b);
    const l = m.get(k);
    if (!l) m.set(k, [r.id]);
    else if (!l.includes(r.id)) l.push(r.id);
  }
  return m;
}

/** Region adjacency (shared edges, plus declared neighbours). */
export function adjacency(regions: readonly RealmRegion[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>(regions.map((r) => [r.id, new Set<string>()]));
  for (const owners of edgeOwners(regions).values()) {
    for (const a of owners) for (const b of owners) if (a !== b) adj.get(a)!.add(b);
  }
  for (const r of regions) for (const n of r.neighbors ?? []) if (adj.has(n)) { adj.get(r.id)!.add(n); adj.get(n)!.add(r.id); }
  return adj;
}

export interface Realm {
  /** realmKey of its regions. */
  key: string;
  holder: string | null;
  contested?: [string, string];
  /** Region ids, in input order. */
  ids: string[];
  polygons: Pt[][];
}

/** Contiguous realms: adjacent regions with the same realm key merged into one. */
export function mergeRealms(regions: readonly RealmRegion[]): Realm[] {
  const adj = adjacency(regions);
  const byId = new Map(regions.map((r) => [r.id, r]));
  const seen = new Set<string>();
  const out: Realm[] = [];
  for (const r of regions) {
    if (seen.has(r.id)) continue;
    const key = realmKey(r);
    const ids: string[] = [];
    const stack = [r.id];
    seen.add(r.id);
    while (stack.length) {
      const id = stack.pop()!;
      ids.push(id);
      for (const n of adj.get(id) ?? []) {
        if (seen.has(n) || realmKey(byId.get(n)!) !== key) continue;
        seen.add(n);
        stack.push(n);
      }
    }
    const order = new Map(regions.map((x, i) => [x.id, i]));
    ids.sort((a, b) => order.get(a)! - order.get(b)!);
    out.push({ key, holder: r.holder, contested: r.contested, ids, polygons: ids.flatMap((id) => byId.get(id)!.polygons) });
  }
  return out;
}

export interface RealmBorders {
  /** Between areas of different holders (and contested areas): drawn thick. */
  realm: Pt[][];
  /** Between areas of the same holder: drawn thin. */
  district: Pt[][];
  /** The outer edge (coast, map edge): one region only. */
  outer: Pt[][];
}

/** Border polylines, classified. Each shared edge is emitted once. */
export function realmBorders(regions: readonly RealmRegion[]): RealmBorders {
  const owners = edgeOwners(regions);
  const byId = new Map(regions.map((r) => [r.id, r]));
  const out: RealmBorders = { realm: [], district: [], outer: [] };
  for (const r of regions) for (const ring of r.polygons) {
    let run: Pt[] = [];
    let cls: keyof RealmBorders | undefined;
    const flush = () => { if (cls && run.length > 1) out[cls].push(run); run = []; cls = undefined; };
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      if (a[0] === b[0] && a[1] === b[1]) continue;
      const own = owners.get(ekey(a, b)) ?? [r.id];
      const other = own.find((x) => x !== r.id);
      // Emitted by the first owner only.
      let c: keyof RealmBorders | undefined;
      if (!other) c = 'outer';
      else if (own[0] === r.id) c = realmKey(r) === realmKey(byId.get(other)!) ? 'district' : 'realm';
      if (c !== cls) { flush(); cls = c; if (c) run = [a]; }
      if (c) run.push(b);
    }
    flush();
  }
  return out;
}

/* ---------------- the realm's name ---------------- */

export interface LabelOpts {
  /** Advance of one capital letter, in em. Default 0.72. */
  charW?: number;
  /** Largest letter spacing to spread over, in em. Default 1.1. */
  maxSpacing?: number;
  /** Part of the territory's length the name may run over. Default 0.82. */
  fill?: number;
  /** Largest font size as a part of the territory's thickness. Default 0.5. */
  thick?: number;
  /** Absolute cap on the font size (world units). */
  maxFs?: number;
  /** How far the curve may bow, as a part of its length. Default 0.08. */
  bow?: number;
}

export interface RealmLabel {
  /** The baseline curve (for a <textPath>), left to right. */
  d: string;
  /** The curve's sample points (left to right). */
  points: Pt[];
  fontSize: number;
  /** What to set as textLength (spacing spreads the letters over it). */
  textLength: number;
  /** Degrees of the principal axis, in (-90, 90]. */
  angle: number;
  center: Pt;
  /** The territory's extent along and across its long axis. */
  length: number;
  thickness: number;
}

/**
 * Where to paint a realm's name, Paradox style: along the territory's long
 * axis (the principal axis of its interior), bowed gently through the middle
 * of each slice of the territory, as large as the territory allows (by its
 * thickness and by its length) with the letters spread across it. The curve
 * always reads left to right.
 */
export function placeRealmLabel(rings: Pt[][], text: string, o: LabelOpts = {}): RealmLabel | undefined {
  const pts = interiorSamples(rings, 56);
  if (pts.length < 3 || !text.length) return undefined;
  const n = pts.length;
  const cx = pts.reduce((a, p) => a + p[0], 0) / n;
  const cy = pts.reduce((a, p) => a + p[1], 0) / n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const [x, y] of pts) { sxx += (x - cx) ** 2; syy += (y - cy) ** 2; sxy += (x - cx) * (y - cy); }
  let th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  // Read left to right; a near-vertical realm reads upward.
  let ax: Pt = [Math.cos(th), Math.sin(th)];
  if (ax[0] < -1e-6 || (Math.abs(ax[0]) <= 1e-6 && ax[1] > 0)) ax = [-ax[0], -ax[1]];
  th = Math.atan2(ax[1], ax[0]);
  const nx: Pt = [-ax[1], ax[0]];
  const tn = pts.map(([x, y]) => [(x - cx) * ax[0] + (y - cy) * ax[1], (x - cx) * nx[0] + (y - cy) * nx[1]] as Pt);
  const tMin = Math.min(...tn.map((p) => p[0]));
  const tMax = Math.max(...tn.map((p) => p[0]));
  const b = bboxOf(rings);
  const cell = Math.max(b.x1 - b.x0, b.y1 - b.y0) / 56;
  const length = tMax - tMin + cell;
  // Slices along the axis: the middle and thickness of each.
  const K = 7;
  const slices: { t: number; mid: number; w: number; n: number }[] = [];
  for (let k = 0; k < K; k++) {
    const a0 = tMin + ((tMax - tMin) * k) / K;
    const a1 = tMin + ((tMax - tMin) * (k + 1)) / K + (k === K - 1 ? 1e-9 : 0);
    const inS = tn.filter((p) => p[0] >= a0 && p[0] < a1);
    if (!inS.length) continue;
    const lo = Math.min(...inS.map((p) => p[1]));
    const hi = Math.max(...inS.map((p) => p[1]));
    slices.push({ t: (a0 + a1) / 2, mid: (lo + hi) / 2, w: hi - lo + cell, n: inS.length });
  }
  const ws = slices.map((s) => s.w).sort((x, y) => x - y);
  const thickness = ws[Math.floor(ws.length / 2)] ?? cell;
  // A quadratic through the slice middles (least squares, weighted by the slice's size), its bow capped.
  const fill = o.fill ?? 0.82;
  const half = (length * fill) / 2;
  const tc = (tMin + tMax) / 2;
  const fit = quadFit(slices.map((s) => [s.t - tc, s.mid, s.n]));
  const at = (t: number) => fit[0] * t * t + fit[1] * t + fit[2];
  const bowCap = (o.bow ?? 0.08) * length;
  const ends = (at(-half) + at(half)) / 2;
  const sag = at(0) - ends;
  const k = Math.abs(sag) > bowCap && sag !== 0 ? bowCap / Math.abs(sag) : 1;
  const lineN = (t: number) => {
    // Keep the chord of the fit and scale its bow; never leave the territory's band.
    const chord = at(-half) + ((at(half) - at(-half)) * (t + half)) / (2 * half || 1);
    const v = chord + (at(t) - chord) * k;
    return Math.max(-thickness / 2, Math.min(thickness / 2, v));
  };
  const M = 9;
  const points: Pt[] = [];
  for (let i = 0; i < M; i++) {
    const t = -half + (2 * half * i) / (M - 1);
    const nv = lineN(t);
    points.push([cx + ax[0] * (t + tc) + nx[0] * nv, cy + ax[1] * (t + tc) + nx[1] * nv]);
  }
  const charW = o.charW ?? 0.72;
  const chars = [...text].length;
  const byLen = (2 * half) / (chars * charW);
  let fontSize = Math.min(byLen, thickness * (o.thick ?? 0.5));
  if (o.maxFs !== undefined) fontSize = Math.min(fontSize, o.maxFs);
  const textLength = Math.min(2 * half, chars * fontSize * (charW + (o.maxSpacing ?? 1.1)));
  const d = `M${points.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join('L')}`;
  return { d, points, fontSize, textLength, angle: (th * 180) / Math.PI, center: [cx, cy], length, thickness };
}

/** Least-squares y = a x² + b x + c over weighted points [x, y, w]; falls back to a line, then a constant. */
function quadFit(p: [number, number, number][]): [number, number, number] {
  const mean = p.reduce((a, q) => a + q[1] * q[2], 0) / Math.max(1e-9, p.reduce((a, q) => a + q[2], 0));
  if (p.length < 2) return [0, 0, p[0]?.[1] ?? 0];
  const solve = (deg: 1 | 2): number[] | undefined => {
    const m = deg + 1;
    const A = Array.from({ length: m }, () => new Array(m + 1).fill(0));
    for (const [x, y, w] of p) {
      const pow = [1, x, x * x];
      for (let i = 0; i < m; i++) { for (let j = 0; j < m; j++) A[i][j] += w * pow[i] * pow[j]; A[i][m] += w * pow[i] * y; }
    }
    for (let c = 0; c < m; c++) {
      let piv = c;
      for (let r = c + 1; r < m; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      if (Math.abs(A[piv][c]) < 1e-9) return undefined;
      [A[c], A[piv]] = [A[piv], A[c]];
      for (let r = 0; r < m; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let j = c; j <= m; j++) A[r][j] -= f * A[c][j]; }
    }
    return A.map((row, i) => row[m] / row[i]);
  };
  if (p.length >= 3) { const s = solve(2); if (s) return [s[2], s[1], s[0]]; }
  const l = solve(1);
  return l ? [0, l[1], l[0]] : [0, 0, mean];
}

/** An SVG path for rings (even-odd). */
export function ringsPath(rings: Pt[][]): string {
  return rings.map((r) => `M${r.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L')}Z`).join('');
}

/** An SVG path for open polylines. */
export function linesPath(lines: Pt[][]): string {
  return lines.map((l) => `M${l.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L')}`).join('');
}

/**
 * Keep small labels (district names) off each other: in order, each label
 * takes the first of its spot, one height below, one above, two below, two
 * above that does not overlap a label already placed (or its spot, if none
 * is free). Boxes are centred on (x, y). Returns each label's new centre.
 */
export function spreadLabels(items: { id: string; x: number; y: number; w: number; h: number }[]): Map<string, Pt> {
  const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const out = new Map<string, Pt>();
  for (const it of items) {
    let at: Pt = [it.x, it.y];
    for (const k of [0, 1, -1, 2, -2]) {
      const y = it.y + k * it.h;
      const b = { x0: it.x - it.w / 2, y0: y - it.h / 2, x1: it.x + it.w / 2, y1: y + it.h / 2 };
      if (!placed.some((p) => p.x0 < b.x1 && b.x0 < p.x1 && p.y0 < b.y1 && b.y0 < p.y1)) { at = [it.x, y]; break; }
    }
    placed.push({ x0: at[0] - it.w / 2, y0: at[1] - it.h / 2, x1: at[0] + it.w / 2, y1: at[1] + it.h / 2 });
    out.set(it.id, at);
  }
  return out;
}
