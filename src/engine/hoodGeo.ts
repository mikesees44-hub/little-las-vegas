import type { Lot, ZoneId } from './econState';
import { AVE_V, CAUSEWAY, CROSS, CROSS_BY_NAME, FILL, HOODS, PIERS, SEED, WEST_WILDWOOD, ZONE_RUNS, type AveId, type HoodId, type RunId } from './hoodData';
import { USES_BY_ID, useIcon, type UseIcon } from './property';
import type { GameState } from './types';
import { homePackage } from './homePackage';
import { AVENUES } from './hoodData';
import type { Parcel as PkgParcel } from './cityPackage';

/**
 * Where every record stands on the illustrated island. Pure and
 * deterministic: a lot's place follows from its zone and index (or, for the
 * authored 1960 records, from the seed table), so nothing about geometry is
 * saved and nothing moves between sessions.
 */

export interface Parcel {
  /** A lot id, or `biz:<id>` for one of your places that has no lot. */
  key: string;
  zone: ZoneId;
  run: RunId;
  /** The cross street the block starts at. */
  cross: string;
  /** The slot (u along the island, v inland), meters. */
  u0: number; u1: number; v0: number; v1: number;
  /** Which long side faces the street: the ocean side (v0) or inland (v1). */
  front: 'v0' | 'v1';
  pier?: string;
}

export interface Footprint { u0: number; u1: number; v0: number; v1: number; h: number }

const STREET_HALF = 9;

function blocksOf(from: string, to: string): { cross: string; u0: number; u1: number }[] {
  const a = CROSS_BY_NAME[from]?.u ?? 0;
  const b = CROSS_BY_NAME[to]?.u ?? 0;
  const out: { cross: string; u0: number; u1: number }[] = [];
  for (let i = 0; i < CROSS.length - 1; i++) {
    const c = CROSS[i];
    if (c.u < Math.min(a, b) || c.u >= Math.max(a, b)) continue;
    out.push({ cross: c.n, u0: c.u + 8, u1: CROSS[i + 1].u - 8 });
  }
  return out;
}

/** The v band of a run (inland distance of the slot's two long sides). */
function band(run: RunId): { v0: number; v1: number; front: 'v0' | 'v1' } {
  if (run === 'bw') return { v0: 8, v1: 74, front: 'v0' };
  if (run === 'cw') return { v0: CAUSEWAY.mainlandV + 40, v1: CAUSEWAY.mainlandV + 100, front: 'v0' };
  if (run === 'ww') return { v0: WEST_WILDWOOD.v0 + 40, v1: WEST_WILDWOOD.v0 + 100, front: 'v0' };
  const ave = AVE_V[run.slice(0, 2) as AveId];
  if (run === 'oc-') return { v0: 8, v1: ave - STREET_HALF, front: 'v1' };
  return run.endsWith('+') ? { v0: ave + STREET_HALF, v1: ave + STREET_HALF + 52, front: 'v0' } : { v0: ave - STREET_HALF - 52, v1: ave - STREET_HALF, front: 'v1' };
}

export type Slot = Omit<Parcel, 'key'> & { tag: string };

function slotOf(zone: ZoneId, run: RunId, b: { cross: string; u0: number; u1: number }, half: 'a' | 'b' | 'w'): Slot {
  const bd = band(run);
  const mid = (b.u0 + b.u1) / 2;
  const [u0, u1] = half === 'w' ? [b.u0, b.u1] : half === 'a' ? [b.u0, mid - 3] : [mid + 3, b.u1];
  return { tag: `${run}:${b.cross}:${half}`, zone, run, cross: b.cross, u0, u1, v0: bd.v0, v1: bd.v1, front: bd.front };
}

function pierSlot(zone: ZoneId, cross: string, k: number): Slot | undefined {
  const p = PIERS.find((x) => x.u === CROSS_BY_NAME[cross]?.u);
  if (!p) return undefined;
  const seg = p.len / 4;
  const v1 = -20 - k * seg;
  return { tag: `pier:${cross}:${k}`, zone, run: 'pier', cross, u0: p.u - p.w / 2 + 5, u1: p.u + p.w / 2 - 5, v0: v1 - seg + 6, v1, front: 'v0', pier: p.id };
}

/** Every free slot of a zone, in a stable order. */
function zoneSlots(zone: ZoneId): Slot[] {
  if (zone === 'piers') {
    const out: Slot[] = [];
    for (const p of PIERS) for (let k = 0; k < 4; k++) { const c = CROSS.find((x) => x.u === p.u)!; out.push(pierSlot(zone, c.n, k)!); }
    return out;
  }
  const out: Slot[] = [];
  for (const r of ZONE_RUNS[zone] ?? []) for (const b of blocksOf(r.from, r.to)) out.push(slotOf(zone, r.run, b, 'a'), slotOf(zone, r.run, b, 'b'));
  return out;
}

const SEED_SLOT: Record<string, Slot> = {};
for (const r of SEED) {
  const [id, zone, run, cross, half] = r;
  if (run === 'pier') { const s = pierSlot(zone, cross, half as number); if (s) SEED_SLOT[id] = s; continue; }
  const i = CROSS.findIndex((c) => c.n === cross);
  if (i < 0 || i >= CROSS.length - 1) continue;
  SEED_SLOT[id] = slotOf(zone, run, { cross, u0: CROSS[i].u + 8, u1: CROSS[i + 1].u - 8 }, half as 'a' | 'b' | 'w');
}

/** A grid slot by name (a package parcel's `slot`): undefined if the street is not on the grid. */
export function slotRect(zone: ZoneId, run: RunId, cross: string, half: 'a' | 'b' | 'w' | 0 | 1 | 2): Slot | undefined {
  if (run === 'pier') return pierSlot(zone, cross, half as number);
  const i = CROSS.findIndex((c) => c.n === cross);
  if (i < 0 || i >= CROSS.length - 1) return undefined;
  return slotOf(zone, run, { cross, u0: CROSS[i].u + 8, u1: CROSS[i + 1].u - 8 }, half as 'a' | 'b' | 'w');
}

/** A package parcel placed by a point (not on a grid slot): its footprint around the point, its front toward the nearest avenue. */
export function posSlot(pc: Pick<PkgParcel, 'id' | 'zone' | 'pos' | 'footprint' | 'rotation'>): Slot | undefined {
  if (!pc.pos) return undefined;
  const { u, v } = pc.pos;
  const turned = Math.abs(((pc.rotation ?? 0) % 180)) === 90;
  const w = pc.footprint?.w ?? 16;
  const d = pc.footprint?.d ?? 22;
  const [du, dv] = turned ? [d, w] : [w, d];
  let best = AVENUES[0];
  for (const a of AVENUES) if (Math.abs(a.v - v) < Math.abs(best.v - v)) best = a;
  const inland = v >= best.v;
  const cross = [...CROSS].reverse().find((c) => c.u <= u)?.n ?? CROSS[0].n;
  return { tag: `pos:${pc.id}`, zone: (pc.zone ?? 'downtown') as ZoneId, run: `${best.id}${inland ? '+' : '-'}` as RunId, cross, u0: u - du / 2, u1: u + du / 2, v0: v - dv / 2, v1: v + dv / 2, front: inland ? 'v0' : 'v1' };
}

/** The extra package parcels of this game (placed by point, or added live) and where they stand. */
export function extraSlots(s: Pick<GameState, 'addedPlaces'>): Map<string, Slot> {
  const pkg = homePackage(s);
  const out = new Map<string, Slot>();
  for (const pc of pkg.parcels) {
    if (SEED_SLOT[pc.id] || !pc.market || !pc.zone) continue;
    const sl = pc.slot ? slotRect(pc.zone as ZoneId, pc.slot.run as RunId, pc.slot.cross, pc.slot.half) : posSlot(pc);
    if (sl) out.set(pc.id, sl);
  }
  return out;
}

/** A generated record's slot, from its id (`hf.<zone>.<run>.<cross index>.<half>`). */
function fillSlot(id: string): Slot | undefined {
  if (!id.startsWith('hf.')) return undefined;
  const [, zone, run, ci, half] = id.split('.');
  const i = Number(ci);
  if (!CROSS[i + 1]) return undefined;
  return slotOf(zone as ZoneId, run as RunId, { cross: CROSS[i].n, u0: CROSS[i].u + 8, u1: CROSS[i + 1].u - 8 }, half as 'a' | 'b');
}

/** Every half-block the generated records may take (not already a 1960 seed's), in a stable order. */
export function fillCandidates(): { id: string; zone: ZoneId; p: number; uses: string[] }[] {
  const seeded = new Set<string>();
  for (const sl of Object.values(SEED_SLOT)) for (const t of taken(sl.tag)) seeded.add(t);
  const out: { id: string; zone: ZoneId; p: number; uses: string[] }[] = [];
  for (const f of FILL) {
    for (const b of blocksOf(f.from, f.to)) {
      const ci = CROSS.findIndex((c) => c.n === b.cross);
      for (const half of ['a', 'b'] as const) {
        const sl = slotOf(f.zone, f.run, b, half);
        if (seeded.has(sl.tag)) continue;
        out.push({ id: `hf.${f.zone}.${f.run}.${ci}.${half}`, zone: f.zone, p: f.p, uses: f.uses });
      }
    }
  }
  return out;
}

function taken(tag: string): string[] {
  // A whole block takes both halves.
  return tag.endsWith(':w') ? [tag, tag.replace(/:w$/, ':a'), tag.replace(/:w$/, ':b')] : [tag, tag.replace(/:[ab]$/, ':w')];
}

/**
 * Whether a 1960 record's ground is already built on by a generated record
 * (an old save made before the record was authored): then it isn't added.
 */
export function seedBlocked(seedId: string, lotIds: Iterable<string>): boolean {
  return !!seedBlocker(seedId, lotIds);
}

/** The generated record standing on a 1960 record's ground (undefined: the ground is free). */
export function seedBlocker(seedId: string, lotIds: Iterable<string>, slot: Slot | undefined = SEED_SLOT[seedId]): string | undefined {
  const sl = slot;
  if (!sl) return undefined;
  const mine = new Set(taken(sl.tag));
  for (const id of lotIds) {
    if (!id.startsWith('hf.')) continue;
    const [, , run, ci, half] = id.split('.');
    const c = CROSS[Number(ci)];
    if (c && mine.has(`${run}:${c.n}:${half}`)) return id;
  }
  return undefined;
}

let memoKey = '';
let memo: Map<string, Parcel> = new Map();

/**
 * Places every lot and every lot-less place of yours on the island (the
 * off-island zones — Atlantic City, South Philadelphia — get none).
 */
export function placeAll(s: GameState): Map<string, Parcel> {
  const lots = s.econ?.lots ?? [];
  const mine = s.businesses.filter((b) => b.owner === 'player' && !lots.some((l) => l.bizId === b.id) && (!!ZONE_RUNS[b.districtId as ZoneId] || b.districtId === 'piers'));
  const extra = extraSlots(s);
  const key = `${lots.length}:${lots.map((l) => l.id).join(',')}|${mine.map((b) => b.id).join(',')}|${[...extra.keys()].join(',')}`;
  if (key === memoKey) return memo;
  const out = new Map<string, Parcel>();
  const used = new Set<string>();
  // Ground taken by parcels placed by a point: nothing placed by index stands on it.
  const pts = [...extra.values()].filter((x) => x.tag.startsWith('pos:'));
  const overlaps = (a: Slot) => pts.some((b) => a.zone !== 'piers' && a.u0 < b.u1 && b.u0 < a.u1 && a.v0 < b.v1 && b.v0 < a.v1);
  for (const l of lots) {
    const sl = SEED_SLOT[l.id] ?? extra.get(l.id) ?? fillSlot(l.id);
    if (!sl) continue;
    for (const t of taken(sl.tag)) used.add(t);
    out.set(l.id, { ...sl, key: l.id });
  }
  const byZone = new Map<ZoneId, Slot[]>();
  const slots = (z: ZoneId) => {
    if (!byZone.has(z)) byZone.set(z, zoneSlots(z));
    return byZone.get(z)!;
  };
  const place = (key: string, zone: ZoneId, pref: number) => {
    const list = slots(zone);
    if (!list.length) return;
    for (let k = 0; k < list.length; k++) {
      const sl = list[(pref + k) % list.length];
      if (used.has(sl.tag) || overlaps(sl)) continue;
      for (const t of taken(sl.tag)) used.add(t);
      out.set(key, { ...sl, key });
      return;
    }
  };
  for (const l of lots) {
    if (out.has(l.id) || !ZONE_RUNS[l.zone] && l.zone !== 'piers') continue;
    const n = slots(l.zone).length;
    if (n) place(l.id, l.zone, (l.idx * 7 + 3) % n);
  }
  for (const b of mine) {
    const z = b.districtId as ZoneId;
    const n = slots(z).length;
    let h = 0;
    for (const ch of b.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    if (n) place(`biz:${b.id}`, z, h % n);
  }
  memoKey = key;
  memo = out;
  return out;
}

/** Size of a building by what it is: width along the street, depth, height (m). */
const SIZE: Record<UseIcon, [number, number, number]> = {
  hotel: [99, 44, 34], motel: [99, 30, 8], house: [22, 20, 9], apartment: [99, 32, 16], store: [99, 28, 7], pizza: [99, 28, 7],
  club: [99, 40, 10], pier: [99, 99, 0], warehouse: [99, 38, 9], public: [99, 46, 14],
};

export function iconOf(l: Pick<Lot, 'use'>): UseIcon | undefined {
  const u = l.use ? USES_BY_ID[l.use] : undefined;
  return u ? useIcon(u) : undefined;
}

/** The building's footprint inside its slot (it sits on the street side). */
export function footprint(p: Parcel, icon: UseIcon | undefined): Footprint {
  if (!icon) return { u0: p.u0 + 2, u1: p.u1 - 2, v0: p.v0 + 2, v1: p.v1 - 2, h: 0 };
  const [w, d, h] = SIZE[icon];
  const slotW = p.u1 - p.u0;
  const slotD = p.v1 - p.v0;
  // Commercial fronts fill their slot wall to wall; houses sit in a yard.
  const ww = Math.min(slotW - 3, w);
  const dd = Math.min(slotD - 4, d);
  const um = (p.u0 + p.u1) / 2;
  const [v0, v1] = p.front === 'v0' ? [p.v0 + 3, p.v0 + 3 + dd] : [p.v1 - 3 - dd, p.v1 - 3];
  return { u0: um - ww / 2, u1: um + ww / 2, v0, v1, h };
}

/**
 * A neighborhood's boundary, from its records: the band of the island its
 * parcels occupy (u and v extents, padded). Undefined if it has none.
 */
export function hoodBounds(s: GameState, id: HoodId): { u0: number; u1: number; v0: number; v1: number } | undefined {
  const h = HOODS.find((x) => x.id === id);
  if (!h) return undefined;
  let b: { u0: number; u1: number; v0: number; v1: number } | undefined;
  for (const p of placeAll(s).values()) {
    if (!h.zones.includes(p.zone)) continue;
    b = b ? { u0: Math.min(b.u0, p.u0), u1: Math.max(b.u1, p.u1), v0: Math.min(b.v0, p.v0), v1: Math.max(b.v1, p.v1) } : { u0: p.u0, u1: p.u1, v0: p.v0, v1: p.v1 };
  }
  return b && { u0: b.u0 - 25, u1: b.u1 + 25, v0: b.v0 - 12, v1: b.v1 + 12 };
}

/** Where an authored 1960 record stands (its grid slot), for the town editor; undefined if it is not one. */
export function seedSlotRect(id: string): { u0: number; u1: number; v0: number; v1: number } | undefined {
  const sl = SEED_SLOT[id];
  return sl && { u0: sl.u0, u1: sl.u1, v0: sl.v0, v1: sl.v1 };
}
