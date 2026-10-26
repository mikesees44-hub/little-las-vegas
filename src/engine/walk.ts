import { displayName } from './characters';
import type { Lot } from './econState';
import type { Character, GameState } from './types';
import { BLOCKED, CELL, HOTSPOTS, REACH, WALKABLE, WALK_BOUNDS, type Pt, type WalkHotspot } from './walkData';

/**
 * Walking the town (the boss on the street): the grid and the pathfinder over
 * the hand-authored walkmesh (walkData.ts), and what each place on it is in
 * the game today: its record, who holds it, who is standing around.
 * Pure and read-only: nothing here changes the state; what the boss does
 * there goes through the ordinary queued actions.
 */

export function pointInPoly(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Distance from a point to a polygon (0 inside). */
export function distToPoly(p: Pt, poly: Pt[]): number {
  if (pointInPoly(p, poly)) return 0;
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j];
    const [bx, by] = poly[i];
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(p[0] - (ax + t * dx), p[1] - (ay + t * dy)));
  }
  return best;
}

export function centroid(poly: Pt[]): Pt {
  let x = 0;
  let y = 0;
  for (const p of poly) { x += p[0]; y += p[1]; }
  return [x / poly.length, y / poly.length];
}

/* ---------------- the grid ---------------- */

export interface WalkGrid { nx: number; ny: number; x0: number; y0: number; cell: number; walk: Uint8Array }

let GRID: WalkGrid | undefined;

/** The walkable cells: inside a walkable area and outside everything that blocks. Built once. */
export function walkGrid(): WalkGrid {
  if (GRID) return GRID;
  const { x0, y0, x1, y1 } = WALK_BOUNDS;
  const nx = Math.ceil((x1 - x0) / CELL);
  const ny = Math.ceil((y1 - y0) / CELL);
  const walk = new Uint8Array(nx * ny);
  const blocks = [...BLOCKED.map((b) => b.poly), ...HOTSPOTS.filter((h) => h.blocks).map((h) => h.poly)];
  const box = (poly: Pt[]) => ({ x0: Math.min(...poly.map((p) => p[0])), x1: Math.max(...poly.map((p) => p[0])), y0: Math.min(...poly.map((p) => p[1])), y1: Math.max(...poly.map((p) => p[1])) });
  const wb = WALKABLE.map((a) => ({ poly: a.poly, b: box(a.poly) }));
  const bb = blocks.map((poly) => ({ poly, b: box(poly) }));
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const p: Pt = [x0 + (i + 0.5) * CELL, y0 + (j + 0.5) * CELL];
      const inB = (x: { poly: Pt[]; b: ReturnType<typeof box> }) => p[0] >= x.b.x0 && p[0] <= x.b.x1 && p[1] >= x.b.y0 && p[1] <= x.b.y1 && pointInPoly(p, x.poly);
      if (wb.some(inB) && !bb.some(inB)) walk[j * nx + i] = 1;
    }
  }
  GRID = { nx, ny, x0, y0, cell: CELL, walk };
  return GRID;
}

function cellIdx(g: WalkGrid, p: Pt): number {
  const i = Math.floor((p[0] - g.x0) / g.cell);
  const j = Math.floor((p[1] - g.y0) / g.cell);
  if (i < 0 || j < 0 || i >= g.nx || j >= g.ny) return -1;
  return j * g.nx + i;
}
const cellCenter = (g: WalkGrid, k: number): Pt => [g.x0 + ((k % g.nx) + 0.5) * g.cell, g.y0 + (Math.floor(k / g.nx) + 0.5) * g.cell];

export function isWalkable(p: Pt): boolean {
  const g = walkGrid();
  const k = cellIdx(g, p);
  return k >= 0 && g.walk[k] === 1;
}

/** The nearest walkable spot to a point (a click on the ocean walks you to the railing), within `maxR` pixels. */
export function nearestWalkable(p: Pt, maxR = 90): Pt | undefined {
  if (isWalkable(p)) return p;
  const g = walkGrid();
  const ci = Math.floor((p[0] - g.x0) / g.cell);
  const cj = Math.floor((p[1] - g.y0) / g.cell);
  const R = Math.ceil(maxR / g.cell);
  let best: Pt | undefined;
  let bd = Infinity;
  for (let r = 1; r <= R; r++) {
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = ci + di;
        const j = cj + dj;
        if (i < 0 || j < 0 || i >= g.nx || j >= g.ny || !g.walk[j * g.nx + i]) continue;
        const c = cellCenter(g, j * g.nx + i);
        const d = Math.hypot(c[0] - p[0], c[1] - p[1]);
        if (d < bd) { bd = d; best = c; }
      }
    }
    if (best && bd <= r * g.cell) return best;
  }
  return best;
}

/** Whether a straight walk from a to b stays on walkable ground. */
export function lineWalkable(a: Pt, b: Pt): boolean {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.ceil(d / (CELL * 0.4)));
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    if (!isWalkable([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])) return false;
  }
  return true;
}

/**
 * The way from a to b along the walkable ground (A* on the grid, eight ways,
 * no cutting corners past a blocked cell), straightened where a straight
 * line is clear. Null when b can't be reached (inside a building, out at sea).
 */
export function findPath(a: Pt, b: Pt): Pt[] | null {
  const g = walkGrid();
  const s0 = cellIdx(g, a);
  const t0 = cellIdx(g, b);
  if (s0 < 0 || t0 < 0 || !g.walk[s0] || !g.walk[t0]) return null;
  if (s0 === t0) return [a, b];
  const N = g.nx * g.ny;
  const gs = new Float32Array(N).fill(Infinity);
  const from = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const heap: number[] = [];
  const f = new Float32Array(N);
  const tx = t0 % g.nx;
  const ty = Math.floor(t0 / g.nx);
  const h = (k: number) => { const dx = Math.abs((k % g.nx) - tx); const dy = Math.abs(Math.floor(k / g.nx) - ty); return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy); };
  const push = (k: number) => {
    heap.push(k);
    let i = heap.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (f[heap[p]] <= f[heap[i]]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
  };
  const pop = (): number => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l;
        if (r < heap.length && f[heap[r]] < f[heap[m]]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  gs[s0] = 0;
  f[s0] = h(s0);
  push(s0);
  const DIRS: [number, number, number][] = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  let found = false;
  while (heap.length) {
    const k = pop();
    if (closed[k]) continue;
    if (k === t0) { found = true; break; }
    closed[k] = 1;
    const i = k % g.nx;
    const j = Math.floor(k / g.nx);
    for (const [di, dj, c] of DIRS) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= g.nx || nj >= g.ny) continue;
      const nk = nj * g.nx + ni;
      if (!g.walk[nk] || closed[nk]) continue;
      if (di && dj && (!g.walk[j * g.nx + ni] || !g.walk[nj * g.nx + i])) continue;
      const ng = gs[k] + c;
      if (ng < gs[nk]) { gs[nk] = ng; from[nk] = k; f[nk] = ng + h(nk); push(nk); }
    }
  }
  if (!found) return null;
  const cells: Pt[] = [];
  for (let k = t0; k !== s0 && k >= 0; k = from[k]) cells.push(cellCenter(g, k));
  cells.reverse();
  const raw: Pt[] = [a, ...cells.slice(0, -1), b];
  // Straighten: from each point, jump to the farthest one in plain sight.
  const out: Pt[] = [raw[0]];
  let i = 0;
  while (i < raw.length - 1) {
    let j = raw.length - 1;
    while (j > i + 1 && !lineWalkable(raw[i], raw[j])) j--;
    out.push(raw[j]);
    i = j;
  }
  return out;
}

export function pathLength(p: Pt[]): number {
  let d = 0;
  for (let i = 1; i < p.length; i++) d += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  return d;
}

/* ---------------- the places, live ---------------- */

/** The game record a hotspot stands for (the first of its lots that exists). */
export function hotspotLot(s: GameState, h: WalkHotspot): Lot | undefined {
  if (!h.lots) return undefined;
  for (const id of h.lots) { const l = s.econ?.lots.find((x) => x.id === id); if (l) return l; }
  return undefined;
}

/** The hotspot under a point of the painting (the smallest outline wins: a stand in front of the beach). */
export function hotspotAt(p: Pt): WalkHotspot | undefined {
  const hits = HOTSPOTS.filter((h) => pointInPoly(p, h.poly));
  const area = (poly: Pt[]) => { let a = 0; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]); return Math.abs(a / 2); };
  return hits.sort((a, b) => area(a.poly) - area(b.poly))[0];
}

/** The hotspot whose door the boss is standing at. */
export function hotspotNear(p: Pt, reach = REACH * 0.7): WalkHotspot | undefined {
  let best: WalkHotspot | undefined;
  let bd = reach;
  for (const h of HOTSPOTS) {
    const d = h.kind === 'beach' ? (pointInPoly(p, h.poly) ? 0 : Infinity) : Math.hypot(p[0] - h.door[0], p[1] - h.door[1]);
    if (d < bd) { bd = d; best = h; }
  }
  return best;
}

export type NpcRole = 'capo' | 'manager' | 'crew' | 'rival' | 'ear';

export interface WalkNpc {
  charId: string;
  name: string;
  role: NpcRole;
  /** What he is doing there, in a few words. */
  doing: string;
  at: string;
  pos: Pt;
  faction: string;
}

const free = (s: GameState, c: Character | undefined): c is Character => !!c && c.alive && !(c.imprisonedUntil !== undefined && c.imprisonedUntil > s.week);

function h32(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Who is out on this stretch this week: your capo on the boards, the men
 * running your places here, a couple of his soldiers, the rival bosses
 * outside the places they hold, and an Ear at the hotel bar. Deterministic
 * for the week (the same faces stand in the same places until it turns).
 */
export function whoIsAround(s: GameState): WalkNpc[] {
  const out: WalkNpc[] = [];
  const seen = new Set<string>([s.playerId]);
  const byId = Object.fromEntries(HOTSPOTS.map((h) => [h.id, h]));
  const place = (c: Character, role: NpcRole, at: string, doing: string) => {
    if (seen.has(c.id) || out.length >= 7) return;
    seen.add(c.id);
    const h = byId[at];
    const k = out.filter((n) => n.at === at).length;
    const ang = ((h32(`${c.id}:${s.week}`) % 360) * Math.PI) / 180 + k * 1.9;
    const want: Pt = [h.door[0] + Math.cos(ang) * 14, h.door[1] + Math.sin(ang) * 9];
    const pos = nearestWalkable(want, 40) ?? h.door;
    out.push({ charId: c.id, name: displayName(c), role, doing, at, pos, faction: c.faction });
  };
  // The capo whose district the boards are.
  const capoId = s.districts.find((d) => d.id === 'boardwalk')?.capoId;
  const capo = capoId ? s.characters[capoId] : undefined;
  if (free(s, capo) && capo.faction === 'player') place(capo, 'capo', 'neptunes', 'Your capo on the boards, at his usual booth');
  // Whoever runs your places here.
  for (const h of HOTSPOTS) {
    const l = hotspotLot(s, h);
    if (!l) continue;
    const m = s.econ?.managers[l.bizId ?? `lot:${l.id}`];
    const c = m?.charId ? s.characters[m.charId] : undefined;
    if (free(s, c)) place(c, 'manager', h.id, `Runs ${l.name ?? h.label} for you`);
  }
  // A couple of the capo's soldiers walking the boards.
  if (capo) {
    const men = Object.values(s.characters).filter((c) => free(s, c) && c.faction === 'player' && c.capoId === capo.id && c.id !== capo.id)
      .sort((a, b) => h32(`${a.id}:${s.week}`) - h32(`${b.id}:${s.week}`)).slice(0, 2);
    const spots = ['tram-stop', 'skee-ball'];
    men.forEach((c, i) => place(c, 'crew', spots[i], i === 0 ? 'Watching the tram stop for you' : 'Collecting along the boards'));
  }
  // The rival bosses, outside the places their families hold.
  for (const h of HOTSPOTS) {
    const l = hotspotLot(s, h);
    if (!l || l.status !== 'rival') continue;
    const r = s.rivals.find((x) => x.id === l.owner);
    const c = r ? s.characters[r.leaderId] : undefined;
    if (free(s, c)) place(c, 'rival', h.id, `${r!.shortName ?? r!.name} hold ${l.name ?? h.label}`);
  }
  // One of the Ears, at the hotel bar.
  const ear = Object.values(s.ears?.ears ?? {}).filter((e) => e.known && e.status !== 'gone').sort((a, b) => h32(`${a.id}:${s.week}`) - h32(`${b.id}:${s.week}`))[0];
  const ec = ear ? s.characters[ear.id] : undefined;
  if (free(s, ec)) place(ec, 'ear', 'wave-crest', 'Works the hotel bar; she hears things');
  return out;
}

/** The light on the painting this week: summer days are bright, winter ones grey; heat brings the dusk. */
export function walkLight(s: GameState): { mood: 'day' | 'dusk' | 'night'; winter: boolean } {
  const h = Math.max(s.heat.local, s.heat.federal * 0.8);
  const winter = s.date.m <= 3 || s.date.m >= 11;
  return { mood: h >= 80 ? 'night' : h >= 55 ? 'dusk' : 'day', winter };
}
