import { occupantIn, type CityPackage, type MarketStatus } from './cityPackage';
import { AWAY_PACKAGES, CITY_PACKAGES, WILDWOOD_PACKAGE } from '../worldpack/cities';
import type { Lot } from './econState';
import { hashSeed } from './rng';
import { today } from './travelState';
import type { GameState } from './types';

/**
 * Towns away from home (B27/B28 seed). A town package that is not the home
 * town runs as an aggregate — a seasonal economy computed from the package,
 * the game seed and the week, with no state and no dice — until someone of
 * yours goes there. The first visit materializes its lots (`s.towns[id]`,
 * optional so older saves load): who holds each one, the asking price, what
 * it owes, its history. Every number comes from hashes of the seed and the
 * lot's stable id, never from the game's dice, so it does not matter which
 * week the visit happens and nothing else in the game rolls differently.
 * Once materialized a town is never rerolled; a corrected package is merged
 * in by stable ids and never overwrites who owns what (`migrateTown`).
 */

export type TownHow = 'built' | 'bought' | 'sold' | 'seized' | 'inherited';

export interface TownLot {
  id: string;
  status: MarketStatus;
  /** A faction id, 'private', 'city' or 'player'. */
  owner: string;
  /** Asking price (sale) or what it would fetch. */
  price: number;
  /** A mortgage or a note held against it. */
  debt: number;
  condition: number;
  history: { year: number; week: number; owner: string; how: TownHow; price?: number; by?: string }[];
  /** The business open there now (package id), if any. */
  occupant?: string;
  /** No longer in the package (kept, never deleted: somebody may own it). */
  orphan?: boolean;
}

export interface TownState {
  id: string;
  /** The package id and the content version it was last merged from. */
  pkg: string;
  contentVersion: string;
  /** The week it came into focus. */
  since: number;
  visits: number;
  lastTrip?: string;
  lots: Record<string, TownLot>;
  log: { week: number; y: number; text: string }[];
}

/** Packages simulated away from home, by town id. */
export function awayPackage(townId: string): CityPackage | undefined {
  const p = CITY_PACKAGES[townId];
  return p && p.detail === 'aggregate' ? p : undefined;
}

export { AWAY_PACKAGES };

/** A 0..1 number from a key (no dice). */
function h01(key: string): number {
  return hashSeed(key) / 4294967296;
}

/** Season multiplier for a month (1-12): summer, the shoulder months, winter. */
export function seasonOf(pkg: CityPackage, month: number): number {
  const { summer, winter } = pkg.economyProfile.seasonalDemand;
  if (month >= 6 && month <= 8) return summer;
  if (month === 5 || month === 9) return (summer + winter) / 2 + 0.25;
  return winter;
}

export interface TownAggregate { econ: number; season: number; weekly: number }

/**
 * The town's economy in a week, from the package, the seed and the date
 * alone: the same answer every time it is asked (no state, no dice).
 */
export function townAggregate(pkg: CityPackage, seed: string, week: number, month: number): TownAggregate {
  const season = seasonOf(pkg, month);
  // A slow drift (a good year, a bad one) plus a little weekly noise.
  const year = Math.floor((week - 1) / 52);
  const drift = 0.9 + 0.2 * h01(`${seed}:${pkg.id}:y${year}`);
  const noise = 0.95 + 0.1 * h01(`${seed}:${pkg.id}:w${week}`);
  const econ = Math.round(drift * noise * 1000) / 1000;
  const base = pkg.economyProfile.baseWeekly ?? pkg.businesses.reduce((a, b) => a + (b.take ?? 0), 0);
  return { econ, season, weekly: Math.round(base * season * econ) };
}

/** Land at value 1 in 1960 dollars (a Cape May half-lot with a house). */
const LAND = 9000;

function freshLot(pkg: CityPackage, seed: string, parcelId: string, year: number): TownLot | undefined {
  const pc = pkg.parcels.find((x) => x.id === parcelId);
  if (!pc) return undefined;
  const k = `${seed}:${pkg.id}:${pc.id}`;
  const status: MarketStatus = pc.ownable === false ? 'public' : pc.market?.status ?? 'private';
  const owner = pc.market?.owner ?? (status === 'public' ? 'city' : 'private');
  const occ = occupantIn(pkg, pc.id, year);
  const price = status === 'public' ? 0 : Math.round((LAND * (pc.value ?? 1) * (0.8 + 0.4 * h01(`${k}:price`)) + (occ?.take ?? 0) * 30) / 50) * 50;
  const debt = status === 'public' || h01(`${k}:mortgaged`) > 0.4 ? 0 : Math.round(price * (0.2 + 0.4 * h01(`${k}:debt`)) / 50) * 50;
  const built = pc.structure?.built ?? pkg.era.from;
  return {
    id: pc.id, status, owner, price, debt, condition: 45 + Math.floor(50 * h01(`${k}:cond`)),
    history: [{ year: built, week: 0, owner, how: 'built', by: occ?.operator }],
    occupant: occ?.id,
  };
}

/**
 * Brings a town into focus: its lots, from the package and the seed. If it
 * is already materialized nothing changes (no reroll).
 */
export function materializeTown(s: GameState, pkg: CityPackage): TownState {
  s.towns ??= {};
  const have = s.towns[pkg.townId];
  if (have) return have;
  const lots: Record<string, TownLot> = {};
  for (const pc of pkg.parcels) {
    const l = freshLot(pkg, s.seed, pc.id, s.date.y);
    if (l) lots[pc.id] = l;
  }
  const t: TownState = { id: pkg.townId, pkg: pkg.id, contentVersion: pkg.contentVersion, since: s.week, visits: 0, lots, log: [] };
  s.towns[pkg.townId] = t;
  return t;
}

export interface MigrationReport { kept: string[]; added: string[]; orphaned: string[]; changed: boolean }

/**
 * Merges a (corrected) package into a materialized town by stable ids:
 * parcels new to the package are added fresh; lots the package no longer
 * lists are kept and flagged (someone may own them); everything live —
 * owner, status, debt, history, price — is never touched. Geometry, art,
 * addresses and names live in the package, so moving them loses nothing.
 */
export function migrateTown(t: TownState, pkg: CityPackage, seed: string, year: number): MigrationReport {
  const ids = new Set(pkg.parcels.map((p) => p.id));
  const rep: MigrationReport = { kept: [], added: [], orphaned: [], changed: false };
  for (const id of Object.keys(t.lots)) {
    if (ids.has(id)) {
      rep.kept.push(id);
      if (t.lots[id].orphan) { delete t.lots[id].orphan; rep.changed = true; }
    } else if (!t.lots[id].orphan) {
      t.lots[id].orphan = true;
      rep.orphaned.push(id);
      rep.changed = true;
    }
  }
  for (const pc of pkg.parcels) {
    if (t.lots[pc.id]) continue;
    const l = freshLot(pkg, seed, pc.id, year);
    if (l) { t.lots[pc.id] = l; rep.added.push(pc.id); rep.changed = true; }
  }
  if (t.contentVersion !== pkg.contentVersion) { t.contentVersion = pkg.contentVersion; rep.changed = true; }
  return rep;
}

/** Every materialized town merged with the package that ships now (on load, and each week). */
export function migrateTowns(s: GameState): void {
  for (const t of Object.values(s.towns ?? {})) {
    const pkg = CITY_PACKAGES[t.id];
    if (pkg && pkg.contentVersion !== t.contentVersion) migrateTown(t, pkg, s.seed, s.date.y);
  }
}

/** Trips of yours in a package town this week. */
function visitsThisWeek(s: GameState): { townId: string; tripId: string }[] {
  const out: { townId: string; tripId: string }[] = [];
  const d0 = today(s);
  for (const t of s.travel?.trips ?? []) {
    if (!awayPackage(t.destId)) continue;
    if (t.arriveDay < d0 + 7 && t.leaveDay >= d0) out.push({ townId: t.destId, tripId: t.id });
  }
  return out;
}

/**
 * The week for towns away from home: a visit brings a town into focus; a
 * town in focus keeps its occupants in step with the year (what opened,
 * what closed) and logs the change. No dice; nothing changes if nobody has
 * gone anywhere.
 */
export function townsWeek(s: GameState): void {
  for (const v of visitsThisWeek(s)) {
    const pkg = awayPackage(v.townId)!;
    const t = materializeTown(s, pkg);
    if (t.lastTrip !== v.tripId) {
      t.visits++;
      t.lastTrip = v.tripId;
      t.log.push({ week: s.week, y: s.date.y, text: t.visits === 1 ? `Your people get to know ${pkg.displayName}: who holds what, and what it owes.` : `Your people are back in ${pkg.displayName}.` });
    }
  }
  if (!s.towns) return;
  migrateTowns(s);
  for (const t of Object.values(s.towns)) {
    const pkg = CITY_PACKAGES[t.id];
    if (!pkg) continue;
    for (const l of Object.values(t.lots)) {
      if (l.orphan) continue;
      const occ = occupantIn(pkg, l.id, s.date.y);
      if (occ?.id === l.occupant) continue;
      const was = l.occupant ? pkg.businesses.find((b) => b.id === l.occupant) : undefined;
      if (was) t.log.push({ week: s.week, y: s.date.y, text: `${was.name} has closed.` });
      if (occ) t.log.push({ week: s.week, y: s.date.y, text: `${occ.name} opens${was ? ` where ${was.name} was` : ''}.` });
      l.occupant = occ?.id;
    }
    if (t.log.length > 60) t.log = t.log.slice(-60);
  }
}

/* ---------------- the home town ---------------- */

export interface HomeReconcile { matched: number; generated: number; unknown: string[]; missingSeeds: string[] }

/**
 * The home town's live lots against its package: lots are keyed by the same
 * ids as the package's parcels (generated frontage by its slot id), so a
 * corrected package — moved buildings, new art, fixed addresses — leaves
 * ownership, debts and history alone. Reports, never changes.
 */
export function reconcileHomeLots(lots: Pick<Lot, 'id'>[], pkg: CityPackage = WILDWOOD_PACKAGE): HomeReconcile {
  const seeds = new Set(pkg.parcels.map((p) => p.id));
  const out: HomeReconcile = { matched: 0, generated: 0, unknown: [], missingSeeds: [] };
  const have = new Set<string>();
  for (const l of lots) {
    have.add(l.id);
    if (seeds.has(l.id)) out.matched++;
    else if (l.id.startsWith('hf.')) out.generated++;
    else out.unknown.push(l.id);
  }
  for (const id of seeds) if (!have.has(id)) out.missingSeeds.push(id);
  return out;
}
