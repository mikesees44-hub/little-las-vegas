import type { ZoneId } from './econState';
import type { BuildStyle, SignColor } from './design';
import type { FactionId } from './types';
import { profileAt } from './cityPackage';
import { WILDWOOD_PACKAGE as PKG } from '../worldpack/cities';

/**
 * The island, drawn by hand (no OpenStreetMap from here): Five Mile Beach in
 * 1960 — Wildwood Crest, Wildwood and North Wildwood — as a frame of
 * avenues running along the island and cross streets running across it.
 *
 * Coordinates are meters in the island's own frame: `u` runs along the island
 * from the Crest's south end (0) to Hereford Inlet (~7500); `v` runs inland
 * from the Boardwalk line (0) toward the bay, negative out over the beach.
 * The street ORDER and spacing are authored from memory and approximate;
 * the avenue order (Ocean, Atlantic, Pacific, New Jersey, Park) is right.
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

export interface CrossStreet { n: string; u: number; town: Town }

export const CROSS: CrossStreet[] = PKG.streets.filter((x) => x.kind === 'cross').map((x) => ({ n: x.name, u: x.u!, town: x.sub as Town }));
export const CROSS_BY_NAME: Record<string, CrossStreet> = Object.fromEntries(CROSS.map((c) => [c.n, c]));
export const crossU = (n: string): number => CROSS_BY_NAME[n]?.u ?? 0;

/** The island's ends (land tapers off past these). */
export const U_SOUTH = PKG.geography.uSouth!;
export const U_NORTH = PKG.geography.uNorth!;

/** Avenues: distance inland from the Boardwalk line, and their names by town. */
export type AveId = 'oc' | 'at' | 'pa' | 'nj' | 'pk';
export const AVENUES: { id: AveId; v: number; names: Partial<Record<Town, string>>; from?: number; to?: number }[] = PKG.streets.filter((x) => x.kind === 'avenue').map((x) => {
  const a: { id: AveId; v: number; names: Partial<Record<Town, string>>; from?: number; to?: number } = { id: x.id.slice(4) as AveId, v: x.v!, names: x.names as Partial<Record<Town, string>> };
  if (x.from !== undefined) a.from = x.from as number;
  if (x.to !== undefined) a.to = x.to as number;
  return a;
});
export const AVE_V: Record<AveId, number> = Object.fromEntries(AVENUES.map((a) => [a.id, a.v])) as Record<AveId, number>;

const SUBTOWNS = PKG.geography.subTowns!;
export function townAt(u: number): Town {
  return (SUBTOWNS.find((t) => u < t.uMax) ?? SUBTOWNS[SUBTOWNS.length - 1]).id as Town;
}

/** The Boardwalk: Cresse Avenue to 16th Avenue, 1960. */
const BW = PKG.streets.find((x) => x.kind === 'boardwalk')!;
export const BOARDWALK = { from: crossU(BW.from as string), to: crossU(BW.to as string), w: BW.width! };

/** How far the beach runs out (to the waterline) — wide at the Crest, thin at the north end. */
export function beachWidth(u: number): number {
  return profileAt(PKG.geography.profiles!.beach, u);
}

/** Where the land meets the back bay (inland edge of the island). */
export function bayEdge(u: number): number {
  return profileAt(PKG.geography.profiles!.bay, u);
}

/* ---------------- piers & landmarks ---------------- */

export interface Pier { id: string; name: string; u: number; w: number; len: number; sign: SignColor }
/** The amusement piers of 1960 (positions approximate). */
export const PIERS: Pier[] = PKG.landmarks.filter((l) => l.kind === 'pier').map((l) => ({ id: l.id.slice(5), name: l.name, u: l.pos!.u, w: l.size!.w, len: l.size!.d, sign: l.sign as SignColor }));

/** Places on the island that are part of the ground, not property (no record). */
export const LANDMARKS: { n: string; u: number; v: number; kind: 'lighthouse' | 'harbor' | 'lake' | 'tower' }[] = PKG.landmarks
  .filter((l) => l.id.startsWith('lm:'))
  .map((l) => ({ n: l.name, u: l.pos!.u, v: l.pos!.v, kind: l.kind as 'lighthouse' | 'harbor' | 'lake' | 'tower' }));

/** The Rio Grande Avenue causeway: from the island's bay edge over the marsh to the mainland. */
const CW = PKG.routes.find((r) => r.kind === 'causeway')!;
export const CAUSEWAY = { u: crossU(CW.atStreet!), mainlandV: CW.mainlandV! };
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

const BIZ_ON = new Map(PKG.businesses.map((b) => [b.parcelId, b]));
export const SEED: SeedRow[] = PKG.parcels.filter((x) => x.slot && x.market).map((x) => {
  const b = BIZ_ON.get(x.id)!;
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
