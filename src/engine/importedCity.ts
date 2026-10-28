/**
 * Imported city data in the game (beta): the compact game layer the city
 * importer writes (scripts/cityimport → public/geo/imported-<city>-<area>.json),
 * the historical-overrides format, and the pure functions both the importer and
 * the game use on them (applying overrides for a year, the walk graph).
 *
 * Nothing here is part of a save: the layer is static data loaded when its view
 * opens, and the map editor's corrections live in the browser (and are exported
 * as historical-overrides.json to be folded back into the city pack).
 *
 * Coordinates in the game layer are the game's island frame (u along the shore,
 * v inland, metres; the same frame PlanView draws), computed from the original
 * lon/lat by the Wildwood package's own frame functions. The original lon/lat
 * and the local metric coordinates stay in the full city pack (citydata/).
 */

export const IMPORTED_LAYER_VERSION = 1;

/** How sure a historical statement is. */
export type HistConfidence = 'high' | 'medium' | 'low';

/** One piece of evidence for (or against) a record in the target year. */
export interface HistEvidence {
  /** The year the evidence speaks for (e.g. a Sanborn sheet's correction date, a directory's year, the assessor's year built). */
  year: number | null;
  source: string;
  confidence: HistConfidence;
  note: string;
}

/**
 * What the game believes about a modern feature in the target year:
 *   unverified       no historical evidence checked yet (the default for every modern feature)
 *   likely-existed   evidence says it stood (e.g. assessor year built ≤ target year)
 *   absent           evidence says it did not stand yet (built after the target year): removed for that year
 *   unknown          the evidence that was checked says nothing (no year built)
 *   verified         a person checked it against period evidence (a Sanborn sheet, a photo, a directory)
 */
export type HistStatus = 'unverified' | 'likely-existed' | 'absent' | 'unknown' | 'verified';

export type OverrideAction = 'add' | 'remove' | 'keep' | 'rename' | 'move' | 'set-years' | 'verify' | 'set-asset';

/** One correction to the imported data for the target year (historical-overrides.json). */
export interface HistOverride {
  id: string;
  /** The record it changes: a layer and the record's id (for `add`, the new record's id). */
  target: { layer: 'buildings' | 'businesses' | 'roads' | 'parcels'; id: string };
  action: OverrideAction;
  /** add: name/category/where; rename: name; move: where (game uv and, when known, lon/lat); set-years; set-asset: assetId. */
  name?: string;
  category?: string;
  at?: { u: number; v: number; lonLat?: [number, number] };
  years?: { from?: number; to?: number };
  assetId?: string;
  /** The building a business occupies (add / move). */
  buildingId?: string;
  evidence: HistEvidence;
  /** 'pipeline' for rules the importer applied; 'editor' for a person's correction. */
  origin: 'pipeline' | 'editor';
  /** Rules the importer applies are proposals until a person accepts them. */
  status: 'proposed' | 'accepted';
  createdAt: string;
}

export interface HistOverridesFile {
  schemaVersion: 1;
  packId: string;
  targetYear: number;
  overrides: HistOverride[];
}

/* ---------------- the game layer ---------------- */

/** Flat coordinates: [u0, v0, u1, v1, …] in the game frame, decimetre-rounded. */
export type Flat = number[];

export interface LayerRoad { id: string; name?: string; cls: 'street' | 'service' | 'foot'; pts: Flat }
export interface LayerParcel { id: string; addr?: string; yr?: number; cls?: string; block?: string; pts: Flat }
export interface LayerBlock { id: string; pts: Flat; taxBlocks: string[] }
export interface LayerEntrance { id: string; u: number; v: number; gen: boolean; node: number }
export interface LayerBuilding {
  id: string;
  /** 'osm' = a surveyed outline; 'generated' = an inset of a parcel with an assessor building record and no outline. */
  src: 'osm' | 'generated';
  pts: Flat;
  name?: string;
  h: number;
  hGen: boolean;
  roof: string;
  roofGen: boolean;
  levels?: number;
  tpl: string;
  parcels: string[];
  status: HistStatus;
  yr?: number;
  entrances: LayerEntrance[];
  asset?: string;
}
export interface LayerBusiness { id: string; name: string; cat: string; u: number; v: number; building?: string; parcel?: string; addr?: string; srcIds: string[]; status: HistStatus }
export interface LayerNav { nodes: Flat; edges: number[] }

export interface ImportedLayer {
  v: number;
  packId: string;
  name: string;
  targetYear: number;
  frame: string;
  attribution: string[];
  bounds: { u0: number; u1: number; v0: number; v1: number };
  /** Least-squares fit from this layer's (true) frame coordinates to the game's drawn street grid: u' = a·u + b, v' = c·v + d. */
  fit: { a: number; b: number; c: number; d: number; rmsBefore: number; rmsAfter: number; n: number };
  roads: LayerRoad[];
  rail: LayerRoad[];
  water: { id: string; pts: Flat }[];
  parcels: LayerParcel[];
  blocks: LayerBlock[];
  buildings: LayerBuilding[];
  businesses: LayerBusiness[];
  nav: LayerNav;
}

/** [[u, v], …] from a flat list. */
export function unflat(f: Flat): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < f.length; i += 2) out.push([f[i], f[i + 1]]);
  return out;
}

/* ---------------- overrides ---------------- */

/** The newest override per target and action kind wins; editor corrections beat pipeline proposals. */
function ordered(list: HistOverride[]): HistOverride[] {
  return [...list].sort((a, b) => (a.origin === b.origin ? a.createdAt.localeCompare(b.createdAt) : a.origin === 'pipeline' ? -1 : 1));
}

export interface ViewBuilding extends LayerBuilding { shown: boolean; why: string; evidence: HistEvidence[] }
export interface ViewBusiness extends LayerBusiness { shown: boolean; why: string; evidence: HistEvidence[] }

/**
 * The layer as it stands in a year, with the overrides applied. Nothing is
 * deleted: a building or business that did not stand is returned with
 * `shown: false` and why, so the map can show it ghosted and the editor can
 * still pick it. Modern businesses with no evidence are hidden in the target
 * year (they are today's tenants), unless `showUnverified`.
 */
export function layerForYear(layer: Pick<ImportedLayer, 'buildings' | 'businesses' | 'targetYear'>, overrides: HistOverride[], year: number, opts: { showUnverified?: boolean } = {}): { buildings: ViewBuilding[]; businesses: ViewBusiness[] } {
  const ov = ordered(overrides);
  const forId = (layerId: string, id: string) => ov.filter((o) => o.target.layer === layerId && o.target.id === id);
  const yearsCover = (y: { from?: number; to?: number } | undefined) => !y || ((y.from === undefined || y.from <= year) && (y.to === undefined || y.to >= year));

  const buildings: ViewBuilding[] = layer.buildings.map((b) => {
    // The assessor's year built (when known) decides first: not standing before it.
    let out: ViewBuilding = { ...b, shown: b.yr === undefined || b.yr <= year, why: b.yr !== undefined && b.yr > year ? `built ${b.yr} (assessor's year built), after ${year}` : '', evidence: [] };
    for (const o of forId('buildings', b.id)) {
      out.evidence.push(o.evidence);
      // Pipeline proposals are already reflected in the status and year; only accepted corrections change the map.
      if (o.status !== 'accepted') continue;
      if (o.action === 'remove' && yearsCover(o.years)) { out.shown = false; out.why = o.evidence.note; }
      if ((o.action === 'keep' || o.action === 'verify') && yearsCover(o.years)) { out.shown = true; out.why = o.evidence.note; }
      if (o.action === 'verify') out = { ...out, status: 'verified' };
      if (o.action === 'set-years' && o.years) { out.shown = yearsCover(o.years); out.why = o.evidence.note; }
      if (o.action === 'set-asset' && o.assetId) out = { ...out, asset: o.assetId };
      if (o.action === 'move' && o.at) out = { ...out, pts: shiftTo(out.pts, o.at.u, o.at.v) };
      if (o.action === 'rename' && o.name) out = { ...out, name: o.name };
    }
    return out;
  });

  const businesses: ViewBusiness[] = layer.businesses.map((b) => {
    // Today's tenants: hidden in the period unless verified (or asked for).
    let out: ViewBusiness = { ...b, shown: !!opts.showUnverified || b.status === 'verified', why: b.status === 'verified' ? '' : 'a modern business with no period evidence', evidence: [] };
    for (const o of forId('businesses', b.id)) {
      out.evidence.push(o.evidence);
      if (o.status !== 'accepted') continue;
      if (o.action === 'remove' && yearsCover(o.years)) { out.shown = false; out.why = o.evidence.note; }
      if (o.action === 'rename' && o.name) out = { ...out, name: o.name };
      if (o.action === 'move' && o.at) out = { ...out, u: o.at.u, v: o.at.v, building: o.buildingId ?? out.building };
      if (o.action === 'set-years' && o.years) { out.shown = yearsCover(o.years); out.why = o.evidence.note; }
      if (o.action === 'verify') { out = { ...out, status: 'verified' }; out.shown = true; }
    }
    return out;
  });
  // Additions: period businesses the evidence says were there (a directory, a Sanborn label).
  for (const o of ov) {
    if (o.action !== 'add' || o.target.layer !== 'businesses' || !o.at || !o.name) continue;
    if (businesses.some((b) => b.id === o.target.id)) continue;
    businesses.push({ id: o.target.id, name: o.name, cat: o.category ?? 'business', u: o.at.u, v: o.at.v, building: o.buildingId, srcIds: [`override:${o.id}`], status: o.status === 'accepted' ? 'verified' : 'unverified', shown: o.status === 'accepted' && yearsCover(o.years), why: o.evidence.note, evidence: [o.evidence] });
  }
  return { buildings, businesses };
}

/** Moves a flat outline so its centroid (vertex mean) sits at u, v. */
export function shiftTo(pts: Flat, u: number, v: number): Flat {
  const n = pts.length / 2;
  let cu = 0, cv = 0;
  for (let i = 0; i < pts.length; i += 2) { cu += pts[i]; cv += pts[i + 1]; }
  cu /= n; cv /= n;
  return pts.map((x, i) => Math.round((i % 2 === 0 ? x + u - cu : x + v - cv) * 10) / 10);
}

/** Applies an editor move to a building: an override record (the caller stores it). */
export function editorOverride(target: HistOverride['target'], action: OverrideAction, fields: Partial<HistOverride>, note: string, now: string): HistOverride {
  return {
    id: `ed-${target.layer}-${target.id}-${action}-${now.replace(/[^0-9]/g, '').slice(0, 14)}`,
    target, action, ...fields,
    evidence: fields.evidence ?? { year: null, source: 'map editor (a person\'s correction)', confidence: 'medium', note },
    origin: 'editor', status: 'accepted', createdAt: now,
  };
}

/* ---------------- the walk graph ---------------- */

export interface NavGraph { n: number; xy: (i: number) => [number, number]; adj: { to: number; w: number }[][] }

export function navGraph(nav: LayerNav): NavGraph {
  const n = nav.nodes.length / 2;
  const adj: { to: number; w: number }[][] = Array.from({ length: n }, () => []);
  const xy = (i: number): [number, number] => [nav.nodes[2 * i], nav.nodes[2 * i + 1]];
  for (let k = 0; k + 1 < nav.edges.length; k += 2) {
    const a = nav.edges[k], b = nav.edges[k + 1];
    const [ax, ay] = xy(a), [bx, by] = xy(b);
    const w = Math.hypot(ax - bx, ay - by);
    adj[a].push({ to: b, w });
    adj[b].push({ to: a, w });
  }
  return { n, xy, adj };
}

/** Connected components: a component id per node. */
export function components(g: NavGraph): number[] {
  const comp = new Array<number>(g.n).fill(-1);
  let c = 0;
  for (let s = 0; s < g.n; s++) {
    if (comp[s] >= 0) continue;
    const st = [s];
    comp[s] = c;
    while (st.length) { const x = st.pop()!; for (const e of g.adj[x]) if (comp[e.to] < 0) { comp[e.to] = c; st.push(e.to); } }
    c++;
  }
  return comp;
}

/** Shortest walk between two nodes (Dijkstra): the node path and its length, or undefined. */
export function shortestPath(g: NavGraph, from: number, to: number): { path: number[]; length: number } | undefined {
  const dist = new Array<number>(g.n).fill(Infinity);
  const prev = new Array<number>(g.n).fill(-1);
  dist[from] = 0;
  const heap: [number, number][] = [[0, from]];
  const push = (d: number, i: number) => {
    heap.push([d, i]);
    let k = heap.length - 1;
    while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; }
  };
  const pop = (): [number, number] => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1;
        let m = k;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
    }
    return top;
  };
  while (heap.length) {
    const [d, x] = pop();
    if (d > dist[x]) continue;
    if (x === to) break;
    for (const e of g.adj[x]) {
      const nd = d + e.w;
      if (nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = x; push(nd, e.to); }
    }
  }
  if (!Number.isFinite(dist[to])) return undefined;
  const path = [to];
  while (path[path.length - 1] !== from) path.push(prev[path[path.length - 1]]);
  return { path: path.reverse(), length: dist[to] };
}

/** The nearest nav node to a point. */
export function nearestNode(g: NavGraph, u: number, v: number): number {
  let best = -1, bd = Infinity;
  for (let i = 0; i < g.n; i++) { const [x, y] = g.xy(i); const d = (x - u) ** 2 + (y - v) ** 2; if (d < bd) { bd = d; best = i; } }
  return best;
}
