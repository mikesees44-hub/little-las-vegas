import type { ZoneId } from './econState';
import type { BuildStyle, SignColor } from './design';
import type { FactionId } from './types';
import { occupantIn, occupantsOf, profileAt } from './cityPackage';
import { WILDWOOD_PACKAGE as PKG } from '../worldpack/cities';

/**
 * The illustrated island: Five Mile Beach in 1960 — Wildwood Crest, Wildwood
 * and North Wildwood — as a frame of avenues running along the island and
 * cross streets running across it.
 *
 * Coordinates are meters in the island's own frame: `u` runs along the island
 * from Diamond Beach (0) to Hereford Inlet (~8000); `v` runs inland from the
 * Wildwood Boardwalk line (0) toward the bay, negative out over the beach.
 * The frame follows the island (a smoothed New Jersey Avenue, its cross
 * direction leaning with the streets), and the street order, spacing, the
 * avenues' courses and the island's outline are measured from OpenStreetMap
 * (scripts/cityimport, `cli.ts grid`); today's grid, assumed for 1960.
 *
 * Everything here is small, static data (it ships inside the single-file
 * build). The neighborhood records themselves are ordinary lots in
 * `econ.lots`; this file only says where each one stands.
 *
 * Since the town-package pass (B23) the data itself lives in the Wildwood
 * package, src/worldpack/cities/wildwood.json, and this module only reads it
 * into the shapes the rest of the game has always used.
 */

/* ---------------- streets ---------------- */

export type Town = 'crest' | 'wildwood' | 'north';

export interface CrossStreet {
  n: string;
  u: number;
  town: Town;
  /** What the map prints (n is the key; it differs where a name repeats, "Pine Ave (North Wildwood)"). */
  label: string;
  /** Stable index (generated lot ids encode it; never renumbered). */
  idx: number;
  /** Where it runs across the island (v from, to); undefined for a hidden street. */
  vRange?: [number, number];
  /** A street of the old grid the sources do not show: kept for its records, not drawn. */
  hidden?: boolean;
}

/** The cross streets in their real order along the island (south to north), measured from OpenStreetMap. */
export const CROSS: CrossStreet[] = PKG.streets.filter((x) => x.kind === 'cross').map((x, i) => {
  const c: CrossStreet = { n: x.name, u: x.u!, town: x.sub as Town, label: x.label ?? x.name, idx: x.idx ?? i };
  if (x.vRange) c.vRange = x.vRange;
  if (x.hidden) c.hidden = true;
  return c;
}).sort((a, b) => a.u - b.u);
export const CROSS_BY_NAME: Record<string, CrossStreet> = Object.fromEntries(CROSS.map((c) => [c.n, c]));
export const CROSS_BY_IDX: Record<number, CrossStreet> = Object.fromEntries(CROSS.map((c) => [c.idx, c]));
export const crossU = (n: string): number => CROSS_BY_NAME[n]?.u ?? 0;
/** The street after this one along the island (north), hidden ones included. */
export function nextCross(c: CrossStreet): CrossStreet | undefined {
  const i = CROSS.indexOf(c);
  return i >= 0 ? CROSS[i + 1] : undefined;
}

/** The island's ends (land tapers off past these). */
export const U_SOUTH = PKG.geography.uSouth!;
export const U_NORTH = PKG.geography.uNorth!;
/** The view's extent in the frame. */
export const ISLAND_BOUNDS = PKG.geography.bounds!;
/** The frame's mean bearing (degrees east of north of +u): the island is drawn turned to it. */
export const ISLAND_BEARING = PKG.geography.frame?.bearing ?? 35;

/** Avenues: distance inland from the Boardwalk line, and their names by town. */
export type AveId = 'oc' | 'at' | 'pa' | 'nj' | 'pk' | 'bc' | 'sv' | 'by' | 'ar' | 'hu' | 'sq' | 'lr' | 'no' | 'ny' | 'de' | 'md';
export const AVENUES: { id: AveId; v: number; names: Partial<Record<Town, string>>; from?: number; to?: number; path?: [number, number][] }[] = PKG.streets.filter((x) => x.kind === 'avenue').map((x) => {
  const a: { id: AveId; v: number; names: Partial<Record<Town, string>>; from?: number; to?: number; path?: [number, number][] } = { id: x.id.slice(4) as AveId, v: x.v!, names: x.names as Partial<Record<Town, string>> };
  if (x.from !== undefined) a.from = x.from as number;
  if (x.to !== undefined) a.to = x.to as number;
  if (x.path) a.path = x.path;
  return a;
});
/** Each avenue's typical distance inland (its median; `aveV` gives it where it is). */
export const AVE_V: Record<AveId, number> = Object.fromEntries(AVENUES.map((a) => [a.id, a.v])) as Record<AveId, number>;

function along(pts: [number, number][], u: number): number {
  if (u <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (u <= pts[i][0]) { const a = pts[i - 1]; const b = pts[i]; return a[1] + ((u - a[0]) / (b[0] - a[0] || 1)) * (b[1] - a[1]); }
  return pts[pts.length - 1][1];
}

/** Where an avenue runs at u (its real course; its median where it has none, or beyond its ends). */
export function aveV(id: AveId, u: number): number {
  const a = AVENUES.find((x) => x.id === id);
  if (!a) return 0;
  return a.path ? along(a.path, u) : a.v;
}
/** Whether an avenue runs at u. */
export function aveRuns(id: AveId, u: number): boolean {
  const a = AVENUES.find((x) => x.id === id);
  return !!a && (a.from === undefined || u >= a.from - 20) && (a.to === undefined || u <= a.to + 20);
}

const SUBTOWNS = PKG.geography.subTowns!;
export function townAt(u: number): Town {
  return (SUBTOWNS.find((t) => u < t.uMax) ?? SUBTOWNS[SUBTOWNS.length - 1]).id as Town;
}
/** Where each town runs along the island ([from, to] in u). */
export const TOWN_SPANS: Record<Town, [number, number]> = (() => {
  const o = {} as Record<Town, [number, number]>;
  let lo = U_SOUTH;
  for (const t of SUBTOWNS) { o[t.id as Town] = [lo, Math.min(t.uMax, U_NORTH)]; lo = t.uMax; }
  return o;
})();

/** The Boardwalk: Cresse Avenue to 16th Avenue, 1960, on its real course (`path`: its inland edge). */
const BW = PKG.streets.find((x) => x.kind === 'boardwalk')!;
export const BOARDWALK = { from: crossU(BW.from as string), to: crossU(BW.to as string), w: BW.width!, path: BW.path };
/** The Boardwalk's line at u (v of its inland edge; 0 where it has no course). */
export function boardwalkV(u: number): number {
  return BOARDWALK.path ? along(BOARDWALK.path, u) : 0;
}

/** How far the beach runs out (to the waterline) from the Boardwalk line (v = 0). */
export function beachWidth(u: number): number {
  return profileAt(PKG.geography.profiles!.beach, u);
}

/** Where the land meets the back bay (inland edge of the island). */
export function bayEdge(u: number): number {
  return profileAt(PKG.geography.profiles!.bay, u);
}

/** The town's seaward edge (the Boardwalk, or the oceanfront lots' line): the beach lies beyond it. */
export function frontV(u: number): number {
  const f = PKG.geography.profiles!.front;
  return f ? profileAt(f, u) : 0;
}

/** Traced outlines of the island (land, the town without its beach, West Wildwood, the towns): rings of [u, v]. */
export const OUTLINES: Record<string, [number, number][][]> = PKG.geography.outlines ?? {};

/* ---------------- piers & landmarks ---------------- */

export interface Pier { id: string; name: string; u: number; w: number; len: number; sign: SignColor; at: string }
/** The amusement piers of 1960 (Hunt's Pier at its sourced point; the others at the streets the game gives them). `at` names their deck slots. */
export const PIERS: Pier[] = PKG.landmarks.filter((l) => l.kind === 'pier').map((l) => ({ id: l.id.slice(5), name: l.name, u: l.pos!.u, w: l.size!.w, len: l.size!.d, sign: l.sign as SignColor, at: l.atStreet ?? CROSS.reduce((b, c) => (Math.abs(c.u - l.pos!.u) < Math.abs(b.u - l.pos!.u) ? c : b)).n }));

/** Places on the island that are part of the ground, not property (no record). */
export const LANDMARKS: { n: string; u: number; v: number; kind: 'lighthouse' | 'harbor' | 'lake' | 'tower' }[] = PKG.landmarks
  .filter((l) => l.id.startsWith('lm:'))
  .map((l) => ({ n: l.name, u: l.pos!.u, v: l.pos!.v, kind: l.kind as 'lighthouse' | 'harbor' | 'lake' | 'tower' }));

/** The Rio Grande Avenue causeway: from the island's bay edge over the marsh to the mainland. */
const CW = PKG.routes.find((r) => r.kind === 'causeway')!;
export const CAUSEWAY = { u: crossU(CW.atStreet!), mainlandV: CW.mainlandV!, mainlandU: CW.mainlandU ?? crossU(CW.atStreet!), path: CW.path };
/** West Wildwood: the little island in the back bay. */
const WWA = PKG.geography.areas!.find((a) => a.id === 'westww')!;
export const WEST_WILDWOOD = { u0: WWA.u0, u1: WWA.u1, v0: WWA.v0, v1: WWA.v1 };

/* ---------------- neighborhoods ---------------- */

export type HoodId = 'boardwalk' | 'pacific' | 'downtown' | 'docks' | 'crest' | 'north' | 'causeway' | 'westww';

export interface HoodInfo {
  id: HoodId;
  name: string;
  /** The property zones whose lots make it up. */
  zones: ZoneId[];
  /** The game district its influence comes from. */
  district?: string;
  /** 1960 year-round residents (Census-scale guesses). */
  pop: number;
  blurb: string;
}

export const HOODS: HoodInfo[] = PKG.districts.map((d) => {
  const h: HoodInfo = { id: d.id.slice(2) as HoodId, name: d.name, zones: d.zones as ZoneId[], pop: d.pop, blurb: d.blurb };
  if (d.gameDistrict !== undefined) h.district = d.gameDistrict;
  return h;
});
export const HOOD_IDS: HoodId[] = HOODS.map((h) => h.id);
export const HOODS_BY_ID = Object.fromEntries(HOODS.map((h) => [h.id, h])) as Record<HoodId, HoodInfo>;

export function hoodOfZone(z: ZoneId): HoodId | undefined {
  return HOODS.find((h) => h.zones.includes(z))?.id;
}

/* ---------------- frontage runs (where lots stand) ---------------- */

/**
 * A run of frontage: an avenue side (`+` the inland side, `-` the ocean side),
 * the Boardwalk row, a pier deck, the mainland end of the causeway, or West
 * Wildwood. Each block between two cross streets holds two parcels.
 */
export type RunId = 'bw' | `${AveId}${'+' | '-'}` | 'pier' | 'cw' | 'ww';
export interface Run { run: RunId; from: string; to: string }

export const ZONE_RUNS: Partial<Record<ZoneId, Run[]>> = (() => {
  const out: Partial<Record<ZoneId, Run[]>> = {};
  for (const d of PKG.districts) for (const f of d.frontage ?? []) (out[f.zone as ZoneId] ??= []).push({ run: f.run as RunId, from: f.from, to: f.to });
  return out;
})();

/* ---------------- the authored 1960 records ---------------- */

/**
 * The hand-placed properties of 1960 (fictional businesses and owners on
 * real streets). Tuple: id, zone, run, cross street (the block north of it),
 * slot ('a' south half, 'b' north half, 'w' the whole block, or the deck
 * slot 0-2 on a pier), use, name, status, owner, who runs it, style, sign,
 * built, condition. Read from the package's grid parcels, in package order.
 */
export type SeedRow = [string, ZoneId, RunId, string, 'a' | 'b' | 'w' | 0 | 1 | 2, string, string, 'private' | 'rival' | 'sale' | 'lease' | 'public', FactionId | 'private' | 'city', string, BuildStyle, SignColor, number, number];

/** The year the 1960 records are written for (a later occupant takes over in play: hoodState.syncHomeOccupants). */
export const SEED_YEAR = 1960;
/** A parcel's main occupant in 1960 (else its first); a business sharing the property never is. */
const primaryOf = (id: string) => occupantIn(PKG, id, SEED_YEAR) ?? occupantsOf(PKG, id)[0];
export const SEED: SeedRow[] = PKG.parcels.filter((x) => x.slot && x.market && primaryOf(x.id)).map((x) => {
  const b = primaryOf(x.id)!;
  const st = x.structure!;
  return [x.id, x.zone as ZoneId, x.slot!.run as RunId, x.slot!.cross, x.slot!.half, b.use, b.name, x.market!.status, x.market!.owner as FactionId | 'private' | 'city', b.operator ?? '', st.style as BuildStyle, st.sign as SignColor, st.built!, st.condition!];
});

export const SEED_IDS = new Set(SEED.map((r) => r[0]));

const GEN = PKG.generation!;
/**
 * The family's signature venue: the old Seven Seas on Pacific Avenue becomes
 * "The 7 Sees" the week it is yours (a supper club first; the Empire Designer
 * can take it toward a hotel later). Lose it and the new owner takes the sign down.
 */
/** Lots with a story of their own: what opens there next when the place closes (Taylor's corner turns into a seafood bar). */
export const NEXT_ON_LOT: Record<string, { use: string; name: string }> = GEN.nextOnLot!;

export const FLAGSHIP = GEN.flagship!;

/**
 * Frontage the 1960 town had filled in: each free half-block on these runs
 * gets an ordinary independent business (a record like any other) with the
 * given chance, drawn from the run's mix. Generated once per game from the
 * seed; ids encode the slot (`hf.<zone>.<run>.<cross index>.<half>`).
 */
export const FILL: { zone: ZoneId; run: RunId; from: string; to: string; p: number; uses: string[] }[] = GEN.fill as { zone: ZoneId; run: RunId; from: string; to: string; p: number; uses: string[] }[];

export const SURNAMES = GEN.names!.surnames;
export const FIRSTNAMES = GEN.names!.firstnames;
export const ADJ = GEN.names!.adj;
export const NOUN: Record<string, string[]> = GEN.names!.noun;
export const MOTEL_NAMES = GEN.names!.motels;

/**
 * The town's house lots (the package's residential parcels): a house of the
 * town's people (its kind, when it went up, its look) or empty ground for one.
 * Placed by a point (`hoodGeo.extraSlots`); who lives there is game state
 * (housing.ts). Invented and approximately placed (the package says so).
 */
export interface ResSeed { id: string; zone: ZoneId; address: string; use?: string; built?: number; cond?: number; style?: BuildStyle; status: 'private' | 'sale'; art?: string }
export const RES_SEED: ResSeed[] = PKG.parcels.filter((x) => x.residential && x.zone && x.market && x.pos).map((x) => {
  const r: ResSeed = { id: x.id, zone: x.zone as ZoneId, address: x.address ?? x.id, status: x.market!.status === 'sale' ? 'sale' : 'private' };
  if (x.residential!.use) {
    r.use = x.residential!.use;
    r.built = x.structure?.built ?? 1925;
    r.cond = x.structure?.condition ?? 70;
    r.style = (x.structure?.style ?? 'colonial') as BuildStyle;
  }
  if (x.art?.[0]) r.art = x.art[0];
  return r;
});
