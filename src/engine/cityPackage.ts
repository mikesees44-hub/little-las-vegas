/**
 * Town packages (master plan Phase 6, B23-B25): one versioned, validated JSON
 * document per town. A package holds the place itself — its street frame,
 * districts, streets, parcels, the businesses that occupied them and when,
 * public landmarks and institutions, routes to other towns, era rules, art
 * keys and walk stretches — and nothing about a game in progress. Live state
 * (who owns a lot, what it owes, its history) stays in the save, keyed by the
 * same stable ids, so a corrected package never overwrites a player's
 * holdings (see `towns.ts` for the migration).
 *
 * Every record that says where something is or when it existed carries
 * `evidence`: a source and a confidence (`verified` only when the source
 * itself gives it; `approximate` when it is placed from the street order or
 * memory; `invented` for fictional places on real streets).
 *
 * Pure: no DOM, no randomness. `validateCityPackage` never throws and never
 * mutates; `importCityPackage` reports every error before anything is used.
 */

export const CITY_SCHEMA_VERSION = 1;

/* ---------------- shared bits ---------------- */

export type Confidence = 'verified' | 'approximate' | 'invented';
/** What a `verified` source actually pins down. */
export type EvidenceScope = 'coordinates' | 'address' | 'identity' | 'dates' | 'footprint';

export interface Evidence {
  confidence: Confidence;
  source: string;
  /** For `verified`: which facts the source supports. */
  scope?: EvidenceScope[];
}

/** Valid years (inclusive). Missing ends are unknown, and count as open. */
export interface Years { from?: number; to?: number; approx?: boolean }

/** A point in the town's local street frame: `u` along the main street/shore, `v` inland, meters. */
export interface UV { u: number; v: number }

/* ---------------- geography ---------------- */

/** How the local frame sits on the globe: a rotation about one anchor, optionally stretched to a second pin. */
export interface Frame {
  anchor: { lat: number; lng: number };
  anchorUV: [number, number];
  /** Degrees clockwise from north of the +u axis. */
  bearing: number;
  /** A second sourced point the frame is stretched to, beyond `from` (plain-frame u). */
  pin?: { lngLat: [number, number]; uv: [number, number]; from: number };
  /**
   * A curvilinear frame that follows the town (it replaces the rotation; anchor
   * and bearing then only describe its middle and mean axis, for drawing): `u`
   * is the arc length along the spine plus `u0`, `v` the distance along the
   * spine's normal (inland positive) minus `v0`. The spine is a smoothed real
   * street (Wildwood: New Jersey Avenue), extended past the town's ends.
   */
  spine?: { pts: [number, number][]; u0: number; v0: number; source?: string; ribs?: number[] };
}

export interface Geography {
  crs: 'local-meters';
  frame: Frame | null;
  bounds: { u0: number; u1: number; v0: number; v1: number } | null;
  /** True only when the street frame itself was surveyed from a sourced map. */
  verified: boolean;
  /** Named parts of the town along u (`uMax` exclusive), e.g. the Crest / Wildwood / North Wildwood. */
  subTowns?: { id: string; name: string; uMax: number }[];
  /** Profiles along u: beach width, the bay edge (piecewise linear [u, value]). */
  profiles?: Record<string, { pts: [number, number][]; beyond: number }>;
  /** The island's ends along u. */
  uSouth?: number;
  uNorth?: number;
  /** Small islands or fixed rectangles (West Wildwood). */
  areas?: { id: string; name: string; u0: number; u1: number; v0: number; v1: number }[];
  /**
   * Traced outlines in the frame (rings of [u, v]): `land` the island(s), `town`
   * the land inland of the front (the built-up town, without the beach), and
   * one per municipality or named area. Drawn instead of the profiles when present.
   */
  outlines?: Record<string, [number, number][][]>;
  /** Where the geography was measured from (sources, dates, method). */
  derivedFrom?: { sources: string[]; method: string; at: string; report?: string };
}

export type StreetKind = 'cross' | 'avenue' | 'boardwalk' | 'road' | 'path';
export interface Street {
  id: string;
  name: string;
  kind: StreetKind;
  /** Cross streets: their u. */
  u?: number;
  /** Avenues: their v (distance inland). */
  v?: number;
  /** The part of town it belongs to (cross streets). */
  sub?: string;
  /** Avenues whose name changes by part of town. */
  names?: Record<string, string>;
  /** Where an avenue or boardwalk runs (u range, or cross-street names for a boardwalk). */
  from?: number | string;
  to?: number | string;
  width?: number;
  /** Free-form path for roads that are not on the grid; for an avenue, its real course ([u, v] along its length). */
  path?: [number, number][];
  /** What the map prints (when `name`, the street's key, had to be made unique: "Pine Ave (North Wildwood)" prints "Pine Ave"). */
  label?: string;
  /** A stable index for ids that encode a street (generated lots `hf.<zone>.<run>.<idx>.<half>`): never reused or renumbered. */
  idx?: number;
  /** Cross streets: where the street runs across the island (v from, to). */
  vRange?: [number, number];
  /** Not drawn: a street the game used that the sources do not show (kept so the places on it keep their ground). */
  hidden?: boolean;
  years?: Years;
  evidence?: Evidence;
}

export interface Frontage { zone: string; run: string; from: string; to: string }

export interface District {
  id: string;
  name: string;
  /** Game property zones whose lots make it up (Wildwood); a package town uses its own id. */
  zones?: string[];
  /** The game district its influence comes from. */
  gameDistrict?: string;
  pop: number;
  blurb: string;
  /** Outline in the local frame. Empty is allowed only in a draft. */
  polygon: [number, number][];
  /** Frontage runs where its parcels stand (grid towns). */
  frontage?: Frontage[];
  evidence?: Evidence;
}

export type MarketStatus = 'private' | 'rival' | 'sale' | 'lease' | 'public';

export interface Parcel {
  id: string;
  districtId: string;
  /** Game zone (Wildwood lots). */
  zone?: string;
  address?: string;
  /** Grid slot: frontage run, the cross street the block starts at, which half (or pier deck slot). */
  slot?: { run: string; cross: string; half: 'a' | 'b' | 'w' | 0 | 1 | 2 };
  /** Free position in the local frame. */
  pos?: UV;
  /** [lng, lat], when known. */
  geo?: [number, number];
  footprint?: { w: number; d: number };
  rotation?: number;
  structure?: { built?: number; condition?: number; style?: string; sign?: string; floors?: number; years?: Years };
  /** Who holds it at the start: status and owner (a faction id, 'private' or 'city'). */
  market?: { status: MarketStatus; owner: string };
  /** Never for sale (a public building). */
  ownable?: boolean;
  /** Land value multiplier for an aggregate town. */
  value?: number;
  art?: string[];
  /**
   * A house lot (Wildwood): the house standing on it (`use`: bungalow, cottage,
   * house, duplex, shorehouse, rooming) or, with no use, an empty lot. Who lives
   * there is game state (housing.ts), never the package's.
   */
  residential?: { use?: string };
  evidence: Evidence;
}

/** The kinds of house a residential parcel can hold. */
export const RESIDENTIAL_USES = ['bungalow', 'cottage', 'house', 'duplex', 'shorehouse', 'rooming'];

/** How a business is named: invented; a near-miss of a real one still operating; or its real (defunct) name. */
export type NamePolicy = 'fictional' | 'near-miss' | 'historical';

export interface BusinessRec {
  id: string;
  parcelId: string;
  name: string;
  use: string;
  kind?: string;
  years: Years;
  /** Who runs it (a fictional person). */
  operator?: string;
  namePolicy: NamePolicy;
  /** Near-miss: what it is a near miss of (research note, never shown as its name). */
  nearMissOf?: string;
  art?: string[];
  /** Weekly takings in season for an aggregate town (1960 dollars). */
  take?: number;
  /**
   * A second business sharing the property with the main occupant (a custard
   * stand in an arcade's corner, a bar on a pier): it rents its corner from
   * whoever holds the building, and never displaces the main occupant.
   */
  shares?: boolean;
  evidence: Evidence;
}

export interface Landmark {
  id: string;
  name: string;
  kind: string;
  /** The cross street it stands at (piers: the deck slots are named by it). */
  atStreet?: string;
  districtId?: string;
  pos?: UV;
  geo?: [number, number];
  /** Piers: width and length out over the water; a sign color. */
  size?: { w: number; d: number };
  sign?: string;
  years?: Years;
  /** Landmarks are never ownable. */
  ownable: false;
  art?: string[];
  blurb?: string;
  evidence: Evidence;
}

export type InstitutionKind = 'city-hall' | 'police' | 'church' | 'school' | 'courthouse' | 'fire' | 'military' | 'post-office' | 'hospital';
export interface Institution {
  id: string;
  kind: InstitutionKind;
  name: string;
  districtId?: string;
  parcelId?: string;
  placementId?: string;
  pos?: UV;
  geo?: [number, number];
  years?: Years;
  ownable: false;
  blurb?: string;
  evidence: Evidence;
}

export interface Route {
  id: string;
  name: string;
  kind: 'road' | 'causeway' | 'bridge' | 'ferry' | 'rail' | 'bus';
  /** Another town's id (a map city id: 'wildwood', 'capemay', 'ac' ...). */
  to: string;
  miles: number;
  years?: Years;
  /** Where it leaves town (a cross street) and how far inland its mainland end is. */
  atStreet?: string;
  mainlandV?: number;
  /** Where along the island its mainland end lies (the road need not run square to the island). */
  mainlandU?: number;
  /** Its course in the frame ([u, v]), when measured. */
  path?: [number, number][];
  evidence?: Evidence;
}

export interface EraRule {
  id: string;
  /** Business uses (or kinds) the rule governs. */
  uses: string[];
  from?: number;
  to?: number;
  note: string;
}

/**
 * The location layer's record: one occupant of one building, with a map point
 * (GeoJSON-ready). Mirrors `placesGeo.PlaceProps`.
 */
export interface Placement {
  id: string;
  building: string;
  parcelId?: string;
  name: string;
  kind: string;
  address: string;
  geo: [number, number];
  years: Years;
  rotation: number;
  footprint: { w: number; d: number };
  art: { exterior?: string[]; views?: string[]; turnaround?: string; interior?: string };
  establishment?: boolean;
  public?: boolean;
  evidence: Evidence;
}

/** Per-town generation inputs (what fills the frontage the authors did not place by hand). */
export interface Generation {
  fill?: { zone: string; run: string; from: string; to: string; p: number; uses: string[] }[];
  names?: { surnames: string[]; firstnames: string[]; adj: string[]; noun: Record<string, string[]>; motels: string[] };
  nextOnLot?: Record<string, { use: string; name: string }>;
  flagship?: { lotId: string; name: string; oldName: string };
}

export interface EconomyProfile {
  template: 'shore-resort' | 'industrial' | 'port' | 'suburb' | 'metropolis' | 'rural-hub';
  /** Demand multipliers by season. */
  seasonalDemand: { summer: number; winter: number };
  /** Weekly takings of the whole town at 1 (1960 dollars). */
  baseWeekly?: number;
  /** Tuning, not history. */
  note?: string;
}

/** A trip's options in town, drawn from the package (hotel tiers and things to do). */
export interface VisitInfo {
  hotels: [string, string, string];
  peak: number[];
  activities: { id: string; name: string; text: string; tags: string[]; cost: number; months?: number[]; at?: string }[];
}

export interface CityPackage {
  schemaVersion: number;
  contentVersion: string;
  /** Globally unique: `city:<slug>`. */
  id: string;
  /** The map city id the game uses (`wildwood`, `capemay`). */
  townId: string;
  displayName: string;
  regionId: string;
  era: { from: number; to: number };
  status: 'draft' | 'production';
  /** How much of it the game simulates: the home town in full, others in aggregate until visited. */
  detail: 'full' | 'aggregate';
  geography: Geography;
  streets: Street[];
  districts: District[];
  parcels: Parcel[];
  businesses: BusinessRec[];
  landmarks: Landmark[];
  institutions: Institution[];
  routes: Route[];
  eraRules: EraRule[];
  placements: Placement[];
  /** Walk stretches (the shape of `walkStretches.WalkStretch`). */
  walkStretches: unknown[];
  generation?: Generation;
  economyProfile: EconomyProfile;
  visit?: VisitInfo;
  provenance: Evidence[];
}

/* ---------------- validation ---------------- */

export interface CityIssue { path: string; message: string }
export interface CityValidation { ok: boolean; errors: CityIssue[]; warnings: CityIssue[] }

export interface ValidateOpts {
  /** 'production' (the default for a package's own status) also rejects empty outlines and missing frames. */
  mode?: 'draft' | 'production';
  /** Map city ids routes may point to. */
  knownTowns?: string[];
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isStr = (x: unknown): x is string => typeof x === 'string' && x.length > 0;
const YEAR_MIN = 1600;
const YEAR_MAX = 2100;

/** Whether a record's years cover a given year (unknown ends count as open). */
export function yearsCover(y: Years | undefined, year: number): boolean {
  if (!y) return true;
  return (y.from === undefined || y.from <= year) && (y.to === undefined || y.to >= year);
}

/** Era rules that forbid a business use in a year. */
export function eraViolations(pkg: Pick<CityPackage, 'eraRules'>, use: string, years: Years): EraRule[] {
  return pkg.eraRules.filter((r) => {
    if (!r.uses.includes(use)) return false;
    // The business may not stand at any time outside the rule's window.
    if (r.from !== undefined && (years.from === undefined || years.from < r.from)) return true;
    if (r.to !== undefined && (years.to === undefined || years.to > r.to)) return true;
    return false;
  });
}

/**
 * Validates anything claiming to be a town package. Errors make it unusable;
 * warnings are a research backlog. Readable messages, each with a path.
 */
export function validateCityPackage(raw: unknown, opts: ValidateOpts = {}): CityValidation {
  const errors: CityIssue[] = [];
  const warnings: CityIssue[] = [];
  const err = (path: string, message: string) => errors.push({ path, message });
  const warn = (path: string, message: string) => warnings.push({ path, message });
  if (!isObj(raw)) return { ok: false, errors: [{ path: '', message: 'Not a town package: expected a JSON object.' }], warnings };
  const p = raw as Partial<CityPackage>;
  const mode = opts.mode ?? (p.status === 'production' ? 'production' : 'draft');

  if (p.schemaVersion !== CITY_SCHEMA_VERSION) err('schemaVersion', `Schema version must be ${CITY_SCHEMA_VERSION} (got ${JSON.stringify(p.schemaVersion)}).`);
  if (!isStr(p.contentVersion)) err('contentVersion', 'Missing contentVersion (any label, e.g. "2026-10-27").');
  if (!isStr(p.id) || !/^city:[a-z0-9-]+$/.test(p.id)) err('id', `Package id must look like "city:cape-may" (got ${JSON.stringify(p.id)}).`);
  if (!isStr(p.townId) || !/^[a-z0-9]+$/.test(p.townId)) err('townId', 'townId must be a short lowercase map-city id like "capemay".');
  if (!isStr(p.displayName)) err('displayName', 'Missing displayName.');
  if (!isStr(p.regionId)) err('regionId', 'Missing regionId (e.g. "region:south-jersey").');
  if (!isObj(p.era) || !isNum(p.era.from) || !isNum(p.era.to) || p.era.from > p.era.to) err('era', 'era needs from <= to (years).');
  if (p.status !== 'draft' && p.status !== 'production') err('status', 'status must be "draft" or "production".');
  if (p.detail !== 'full' && p.detail !== 'aggregate') err('detail', 'detail must be "full" or "aggregate".');
  const arrays = ['streets', 'districts', 'parcels', 'businesses', 'landmarks', 'institutions', 'routes', 'eraRules', 'placements', 'walkStretches', 'provenance'] as const;
  for (const k of arrays) if (!Array.isArray(p[k])) err(k, `${k} must be a list (it may be empty).`);
  if (!isObj(p.geography)) err('geography', 'Missing geography.');
  if (!isObj(p.economyProfile)) err('economyProfile', 'Missing economyProfile.');
  if (errors.length) return { ok: false, errors, warnings };
  const pkg = p as CityPackage;

  // Geography.
  const g = pkg.geography;
  if (g.crs !== 'local-meters') err('geography.crs', 'crs must be "local-meters".');
  if (g.frame !== null) {
    const f = g.frame;
    if (!isObj(f) || !isObj(f.anchor) || !isNum(f.anchor.lat) || !isNum(f.anchor.lng) || !Array.isArray(f.anchorUV) || !isNum(f.bearing)) err('geography.frame', 'frame needs anchor {lat, lng}, anchorUV [u, v] and bearing.');
    else if (Math.abs(f.anchor.lat) > 90 || Math.abs(f.anchor.lng) > 180) err('geography.frame.anchor', 'anchor lat/lng out of range.');
  } else if (mode === 'production') err('geography.frame', 'Production packages need a frame (where the local streets sit on the globe).');
  if (g.bounds === null && mode === 'production') err('geography.bounds', 'Production packages need bounds (null bounds are draft only).');

  // Ids: unique across every record, prefixed by nothing in particular but never blank.
  const seen = new Map<string, string>();
  const idOf = (kind: string, i: number, r: { id?: unknown }) => {
    const path = `${kind}[${i}]`;
    if (!isStr(r.id)) { err(`${path}.id`, `${kind} #${i + 1} has no id.`); return; }
    const prev = seen.get(r.id);
    if (prev) err(`${path}.id`, `Duplicate id "${r.id}" (also ${prev}).`);
    else seen.set(r.id, path);
  };
  pkg.streets.forEach((r, i) => idOf('streets', i, r));
  pkg.districts.forEach((r, i) => idOf('districts', i, r));
  pkg.parcels.forEach((r, i) => idOf('parcels', i, r));
  pkg.businesses.forEach((r, i) => idOf('businesses', i, r));
  pkg.landmarks.forEach((r, i) => idOf('landmarks', i, r));
  pkg.institutions.forEach((r, i) => idOf('institutions', i, r));
  pkg.routes.forEach((r, i) => idOf('routes', i, r));
  pkg.eraRules.forEach((r, i) => idOf('eraRules', i, r));
  // Location-layer records keep their own namespace: one may share its id only with the parcel it occupies.
  const placeIds = new Set<string>();
  pkg.placements.forEach((r, i) => {
    const path = `placements[${i}]`;
    if (!isStr(r.id)) { err(`${path}.id`, `placements #${i + 1} has no id.`); return; }
    if (placeIds.has(r.id)) err(`${path}.id`, `Duplicate placement id "${r.id}".`);
    placeIds.add(r.id);
    const other = seen.get(r.id);
    if (other && r.parcelId !== r.id) err(`${path}.id`, `Placement id "${r.id}" collides with ${other} (only the parcel it stands on may share its id).`);
  });

  const yearsOk = (path: string, y: Years | undefined, what: string) => {
    if (y === undefined) return;
    if (!isObj(y)) { err(path, `${what}: years must be {from, to}.`); return; }
    for (const k of ['from', 'to'] as const) {
      const v = (y as Years)[k] as unknown;
      if (v === undefined) continue;
      if (typeof v !== 'number' || !Number.isInteger(v) || v < YEAR_MIN || v > YEAR_MAX) err(`${path}.${k}`, `${what}: ${k} year ${JSON.stringify(v)} is not a year between ${YEAR_MIN} and ${YEAR_MAX}.`);
    }
    const yy = y as Years;
    if (isNum(yy.from) && isNum(yy.to) && yy.from > yy.to) err(path, `${what}: opens ${yy.from} after it closes ${yy.to}.`);
  };
  const evidenceOk = (path: string, e: Evidence | undefined, what: string, required = true) => {
    if (!e) { if (required) err(`${path}.evidence`, `${what}: no evidence (give a source and a confidence: verified, approximate or invented).`); return; }
    if (e.confidence !== 'verified' && e.confidence !== 'approximate' && e.confidence !== 'invented') err(`${path}.evidence.confidence`, `${what}: confidence must be verified, approximate or invented.`);
    if (!isStr(e.source)) err(`${path}.evidence.source`, `${what}: evidence has no source text.`);
    if (e.confidence === 'verified' && !e.scope?.length) warn(`${path}.evidence.scope`, `${what}: verified, but not what was verified (coordinates, address, identity, dates, footprint).`);
  };
  const geoOk = (path: string, gp: [number, number] | undefined, what: string) => {
    if (gp === undefined) return;
    if (!Array.isArray(gp) || gp.length !== 2 || !isNum(gp[0]) || !isNum(gp[1]) || Math.abs(gp[0]) > 180 || Math.abs(gp[1]) > 90) err(path, `${what}: geo must be [lng, lat].`);
  };
  const uvOk = (path: string, x: UV | undefined, what: string) => {
    if (x === undefined) return;
    if (!isObj(x) || !isNum(x.u) || !isNum(x.v)) err(path, `${what}: pos must be {u, v} in meters.`);
  };

  const districts = new Set(pkg.districts.map((d) => d.id));
  const crossNames = new Set(pkg.streets.filter((s) => s.kind === 'cross').map((s) => s.name));
  const runs = new Set(pkg.districts.flatMap((d) => d.frontage ?? []).map((f) => f.run));

  pkg.streets.forEach((s, i) => {
    const path = `streets[${i}]`;
    if (!isStr(s.name)) err(`${path}.name`, `Street ${s.id}: no name.`);
    if (s.kind === 'cross' && !isNum(s.u)) err(`${path}.u`, `Cross street ${s.name}: no u (where it crosses the main line).`);
    if (s.kind === 'avenue' && !isNum(s.v)) err(`${path}.v`, `Avenue ${s.name}: no v (how far inland it runs).`);
    if (s.kind === 'road' && (!s.path || s.path.length < 2)) err(`${path}.path`, `Road ${s.name}: needs a path of at least two points.`);
    yearsOk(`${path}.years`, s.years, `Street ${s.name}`);
  });

  pkg.districts.forEach((d, i) => {
    const path = `districts[${i}]`;
    if (!isStr(d.name)) err(`${path}.name`, `District ${d.id}: no name.`);
    if (!Array.isArray(d.polygon)) err(`${path}.polygon`, `District ${d.name}: polygon must be a list of [u, v] points.`);
    else if (d.polygon.length < 3) {
      if (mode === 'production') err(`${path}.polygon`, `District ${d.name}: no outline (draw at least three points; empty outlines are allowed only in a draft).`);
      else warn(`${path}.polygon`, `District ${d.name}: no outline yet.`);
    } else if (d.polygon.some((pt) => !Array.isArray(pt) || !isNum(pt[0]) || !isNum(pt[1]))) err(`${path}.polygon`, `District ${d.name}: a polygon point is not [u, v].`);
    if (!isNum(d.pop) || d.pop < 0) err(`${path}.pop`, `District ${d.name}: pop must be a number of residents.`);
    for (const [k, f] of (d.frontage ?? []).entries()) {
      if (!crossNames.has(f.from) || !crossNames.has(f.to)) err(`${path}.frontage[${k}]`, `District ${d.name}: frontage ${f.run} runs between streets that do not exist (${f.from} to ${f.to}).`);
    }
    evidenceOk(path, d.evidence, `District ${d.name}`, false);
  });

  const parcels = new Map(pkg.parcels.map((x) => [x.id, x]));
  pkg.parcels.forEach((x, i) => {
    const path = `parcels[${i}]`;
    const what = `Parcel ${x.id}${x.address ? ` (${x.address})` : ''}`;
    if (!districts.has(x.districtId)) err(`${path}.districtId`, `${what}: district "${x.districtId}" does not exist.`);
    if (!x.slot && !x.pos && !x.geo) err(path, `${what}: incomplete geography — no grid slot, no pos {u, v} and no geo [lng, lat].`);
    if (x.slot) {
      if (x.slot.run !== 'pier' && !runs.has(x.slot.run)) err(`${path}.slot.run`, `${what}: frontage run "${x.slot.run}" is not in any district.`);
      if (!crossNames.has(x.slot.cross)) err(`${path}.slot.cross`, `${what}: cross street "${x.slot.cross}" does not exist.`);
    }
    uvOk(`${path}.pos`, x.pos, what);
    geoOk(`${path}.geo`, x.geo, what);
    if (x.footprint && (!isNum(x.footprint.w) || !isNum(x.footprint.d) || x.footprint.w <= 0 || x.footprint.d <= 0)) err(`${path}.footprint`, `${what}: footprint must be positive width and depth (m).`);
    if (x.structure?.built !== undefined) yearsOk(`${path}.structure`, { from: x.structure.built }, `${what} structure`);
    yearsOk(`${path}.structure.years`, x.structure?.years, `${what} structure`);
    if (x.residential?.use !== undefined && !RESIDENTIAL_USES.includes(x.residential.use)) err(`${path}.residential.use`, `${what}: "${x.residential.use}" is not a kind of house (${RESIDENTIAL_USES.join(', ')}).`);
    if (x.residential && !x.market) err(`${path}.market`, `${what}: a house lot needs a market (who holds it at the start).`);
    if (x.market && x.ownable === false && x.market.status !== 'public') err(`${path}.market`, `${what}: marked never ownable but listed as "${x.market.status}".`);
    evidenceOk(path, x.evidence, what);
  });

  const placements = new Set(pkg.placements.map((x) => x.id));
  pkg.businesses.forEach((b, i) => {
    const path = `businesses[${i}]`;
    const what = `Business ${b.name || b.id}`;
    const pc = parcels.get(b.parcelId);
    if (!pc) err(`${path}.parcelId`, `${what}: parcel "${b.parcelId}" does not exist.`);
    if (!isStr(b.name)) err(`${path}.name`, `${what}: no name.`);
    if (!isStr(b.use)) err(`${path}.use`, `${what}: no use (diner, motel, club ...).`);
    yearsOk(`${path}.years`, b.years, what);
    if (b.namePolicy === 'historical' && b.years?.to === undefined) err(`${path}.namePolicy`, `${what}: a real name is only for a business that has closed — give years.to, or use a near-miss name.`);
    if (b.shares && pc && !pkg.businesses.some((o) => o.parcelId === pc.id && !o.shares)) warn(`${path}.shares`, `${what}: shares a property, but nothing else stands on parcel ${pc.id}.`);
    if (b.namePolicy === 'near-miss' && !isStr(b.nearMissOf)) warn(`${path}.nearMissOf`, `${what}: near-miss name, but not of what (research note).`);
    if (b.namePolicy === 'near-miss' && b.nearMissOf && b.nearMissOf.trim().toLowerCase() === b.name.trim().toLowerCase()) err(`${path}.name`, `${what}: a near-miss name must differ from the real one.`);
    if (!['fictional', 'near-miss', 'historical'].includes(b.namePolicy)) err(`${path}.namePolicy`, `${what}: namePolicy must be fictional, near-miss or historical.`);
    if (pc && pc.ownable === false) err(`${path}.parcelId`, `${what}: stands on a parcel marked never ownable.`);
    for (const r of eraViolations(pkg, b.use, b.years ?? {})) err(`${path}.years`, `${what}: era rule "${r.id}" — ${r.note}`);
    evidenceOk(path, b.evidence, what);
  });

  pkg.landmarks.forEach((l, i) => {
    const path = `landmarks[${i}]`;
    const what = `Landmark ${l.name || l.id}`;
    if ((l as { ownable: unknown }).ownable !== false) err(`${path}.ownable`, `${what}: landmarks are never ownable (set ownable: false).`);
    if (l.districtId && !districts.has(l.districtId)) err(`${path}.districtId`, `${what}: district "${l.districtId}" does not exist.`);
    if (!l.pos && !l.geo) err(path, `${what}: incomplete geography — no pos and no geo.`);
    uvOk(`${path}.pos`, l.pos, what);
    geoOk(`${path}.geo`, l.geo, what);
    yearsOk(`${path}.years`, l.years, what);
    evidenceOk(path, l.evidence, what);
  });

  pkg.institutions.forEach((x, i) => {
    const path = `institutions[${i}]`;
    const what = `Institution ${x.name || x.id}`;
    if ((x as { ownable: unknown }).ownable !== false) err(`${path}.ownable`, `${what}: institutions are never ownable (set ownable: false).`);
    if (x.districtId && !districts.has(x.districtId)) err(`${path}.districtId`, `${what}: district "${x.districtId}" does not exist.`);
    if (x.parcelId) {
      const pc = parcels.get(x.parcelId);
      if (!pc) err(`${path}.parcelId`, `${what}: parcel "${x.parcelId}" does not exist.`);
      else if (pc.market && pc.market.status !== 'public') err(`${path}.parcelId`, `${what}: landmark/ownable conflict — its parcel ${pc.id} is listed as "${pc.market.status}".`);
      else if (pkg.businesses.some((b) => b.parcelId === pc.id)) err(`${path}.parcelId`, `${what}: landmark/ownable conflict — a business stands on its parcel ${pc.id}.`);
    }
    if (x.placementId && !placements.has(x.placementId)) err(`${path}.placementId`, `${what}: placement "${x.placementId}" does not exist.`);
    if (!x.parcelId && !x.placementId && !x.pos && !x.geo) err(path, `${what}: incomplete geography — no parcel, placement, pos or geo.`);
    if (x.kind === 'church' && /^(St\.?|Saint|Our Lady)\b/.test(x.name) && !x.evidence.source.toLowerCase().includes('fictional')) warn(`${path}.name`, `${what}: churches take fictional parish names; say so in the source.`);
    uvOk(`${path}.pos`, x.pos, what);
    geoOk(`${path}.geo`, x.geo, what);
    yearsOk(`${path}.years`, x.years, what);
    evidenceOk(path, x.evidence, what);
  });

  pkg.routes.forEach((r, i) => {
    const path = `routes[${i}]`;
    if (!isStr(r.to)) err(`${path}.to`, `Route ${r.name || r.id}: no destination town.`);
    else if (opts.knownTowns && !opts.knownTowns.includes(r.to)) warn(`${path}.to`, `Route ${r.name}: "${r.to}" is not a map city.`);
    if (!isNum(r.miles) || r.miles <= 0) err(`${path}.miles`, `Route ${r.name || r.id}: miles must be positive.`);
    yearsOk(`${path}.years`, r.years, `Route ${r.name}`);
  });

  pkg.eraRules.forEach((r, i) => {
    if (!Array.isArray(r.uses) || !r.uses.length) err(`eraRules[${i}].uses`, `Era rule ${r.id}: name the uses it governs.`);
    yearsOk(`eraRules[${i}]`, { from: r.from, to: r.to }, `Era rule ${r.id}`);
  });

  pkg.placements.forEach((x, i) => {
    const path = `placements[${i}]`;
    const what = `Placement ${x.name || x.id}`;
    geoOk(`${path}.geo`, x.geo, what);
    if (!x.geo) err(`${path}.geo`, `${what}: incomplete geography — no geo [lng, lat].`);
    if (x.parcelId && !parcels.has(x.parcelId) && mode === 'production') warn(`${path}.parcelId`, `${what}: lot "${x.parcelId}" is not a package parcel (a generated lot).`);
    if (x.parcelId && (x.public || x.establishment)) {
      const pc = parcels.get(x.parcelId);
      if (pc?.market && pc.market.status === 'sale') err(`${path}.public`, `${what}: landmark/ownable conflict — never for sale, but its parcel ${pc.id} is for sale.`);
    }
    if (!x.footprint || !isNum(x.footprint.w) || !isNum(x.footprint.d) || x.footprint.w <= 0 || x.footprint.d <= 0) err(`${path}.footprint`, `${what}: footprint must be positive width and depth (m).`);
    yearsOk(`${path}.years`, x.years, what);
    evidenceOk(path, x.evidence, what);
  });

  return { ok: errors.length === 0, errors, warnings };
}

/* ---------------- import / export ---------------- */

/** Stable JSON: keys in a fixed order at every level, two-space indent. Same package, same text. */
export function exportCityPackage(pkg: CityPackage): string {
  const sortKeys = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(sortKeys);
    if (isObj(x)) {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(x).sort()) if (x[k] !== undefined) out[k] = sortKeys(x[k]);
      return out;
    }
    return x;
  };
  // The header fields first, for a person reading it; then the rest sorted.
  const head = ['schemaVersion', 'contentVersion', 'id', 'townId', 'displayName', 'regionId', 'status', 'detail', 'era'];
  const body = sortKeys(pkg) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of head) if (k in body) out[k] = body[k];
  for (const k of Object.keys(body)) if (!(k in out)) out[k] = body[k];
  return JSON.stringify(out, null, 2);
}

export interface ImportResult { pkg?: CityPackage; validation: CityValidation }

/**
 * Reads pasted JSON. Reports every problem before anything is used (a bad
 * paste never replaces the package you had). Accepts a draft with errors in
 * `draft` mode only when `allowErrors` is set (the editor keeps working on it).
 */
export function importCityPackage(text: string, opts: ValidateOpts & { allowErrors?: boolean } = {}): ImportResult {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch (e) {
    return { validation: { ok: false, errors: [{ path: '', message: `Not JSON: ${(e as Error).message}` }], warnings: [] } };
  }
  const validation = validateCityPackage(raw, opts);
  if (!validation.ok && !opts.allowErrors) return { validation };
  // A structurally broken package (no lists) cannot be edited either.
  if (!isObj(raw) || !Array.isArray((raw as Partial<CityPackage>).parcels)) return { validation };
  return { pkg: raw as unknown as CityPackage, validation };
}

/** Loads a package that ships with the game: it must validate, or the build fails loudly in tests. */
export function loadCityPackage(raw: unknown, opts: ValidateOpts = {}): CityPackage {
  const v = validateCityPackage(raw, opts);
  if (!v.ok) throw new Error(`Town package invalid:\n${v.errors.slice(0, 12).map((e) => `  ${e.path}: ${e.message}`).join('\n')}`);
  return raw as CityPackage;
}

/** A blank draft to start a town from. */
export function blankCityPackage(slug: string, name: string, frame: Frame | null = null): CityPackage {
  return {
    schemaVersion: CITY_SCHEMA_VERSION, contentVersion: 'draft-1', id: `city:${slug}`, townId: slug.replace(/[^a-z0-9]/g, ''), displayName: name,
    regionId: 'region:south-jersey', era: { from: 1955, to: 1990 }, status: 'draft', detail: 'aggregate',
    geography: { crs: 'local-meters', frame, bounds: null, verified: false },
    streets: [], districts: [], parcels: [], businesses: [], landmarks: [], institutions: [], routes: [], eraRules: [], placements: [], walkStretches: [],
    economyProfile: { template: 'shore-resort', seasonalDemand: { summer: 2.2, winter: 0.5 }, baseWeekly: 4000, note: 'Tuning proposal, not history.' },
    provenance: [],
  };
}

/* ---------------- the local frame on the globe ---------------- */

const RAD = Math.PI / 180;
const M_LAT = 111320;

function rawToLngLat(f: Frame, u: number, v: number): [number, number] {
  const du = u - f.anchorUV[0];
  const dv = v - f.anchorUV[1];
  const b = f.bearing * RAD;
  const bi = (f.bearing - 90) * RAD;
  const north = du * Math.cos(b) + dv * Math.cos(bi);
  const east = du * Math.sin(b) + dv * Math.sin(bi);
  return [f.anchor.lng + east / (M_LAT * Math.cos(f.anchor.lat * RAD)), f.anchor.lat + north / M_LAT];
}

function rawToUv(f: Frame, p: [number, number]): [number, number] {
  const east = (p[0] - f.anchor.lng) * M_LAT * Math.cos(f.anchor.lat * RAD);
  const north = (p[1] - f.anchor.lat) * M_LAT;
  const b = f.bearing * RAD;
  const bi = (f.bearing - 90) * RAD;
  return [f.anchorUV[0] + north * Math.cos(b) + east * Math.sin(b), f.anchorUV[1] + north * Math.cos(bi) + east * Math.sin(bi)];
}

export interface FrameFns { toLngLat: (u: number, v: number) => [number, number]; toUv: (p: [number, number]) => [number, number] }

/**
 * The frame's two conversions. With a pin, the frame is the plain rotation up
 * to `pin.from` and stretches beyond it so the pin's point lands on its uv.
 */
export function frameFns(f: Frame): FrameFns {
  if (f.spine) return spineFns(f);
  if (!f.pin) return { toLngLat: (u, v) => rawToLngLat(f, u, v), toUv: (p) => rawToUv(f, p) };
  const pin = f.pin;
  const [bu, bv] = rawToUv(f, pin.lngLat);
  const W = { bu, du: pin.uv[0] - bu, dv: pin.uv[1] - bv };
  const warpAt = (x: number): [number, number] => {
    if (x <= pin.from) return [0, 0];
    const t = Math.min(1, (x - pin.from) / (W.bu - pin.from));
    return [t * W.du, t * W.dv];
  };
  return {
    toLngLat: (u, v) => {
      let lo = u - 4000;
      let hi = u + 4000;
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (mid + warpAt(mid)[0] < u) lo = mid; else hi = mid;
      }
      const b = (lo + hi) / 2;
      return rawToLngLat(f, b, v - warpAt(b)[1]);
    },
    toUv: (p) => {
      const [b, v] = rawToUv(f, p);
      const [du, dv] = warpAt(b);
      return [b + du, v + dv];
    },
  };
}

const spineCache = new WeakMap<object, FrameFns>();

/**
 * The curvilinear frame (`Frame.spine`): a point is C(s) + d·N(s), where C is
 * the spine polyline, s its arc length, and N the unit normal (inland) linearly
 * blended between the vertices' normals, so the frame bends smoothly and both
 * conversions are exact. Plane: metres east/north about the anchor (the same
 * 111,320 m/deg sphere as the rotation frame).
 */
function spineFns(f: Frame): FrameFns {
  const hit = spineCache.get(f.spine!);
  if (hit) return hit;
  const sp = f.spine!;
  const lat0 = f.anchor.lat;
  const lng0 = f.anchor.lng;
  const kx = M_LAT * Math.cos(lat0 * RAD);
  const toXY = (p: [number, number]): [number, number] => [(p[0] - lng0) * kx, (p[1] - lat0) * M_LAT];
  const toLL = (x: number, y: number): [number, number] => [lng0 + x / kx, lat0 + y / M_LAT];
  const P = sp.pts.map(toXY);
  const n = P.length;
  const S: number[] = [0];
  for (let i = 1; i < n; i++) S.push(S[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  // Segment normals (inland = the tangent turned 90° counter-clockwise, as the rotation frame's bearing - 90).
  const segN: [number, number][] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = P[i + 1][0] - P[i][0];
    const dy = P[i + 1][1] - P[i][1];
    const L = Math.hypot(dx, dy) || 1;
    segN.push([-dy / L, dx / L]);
  }
  // The cross direction at each vertex: the measured direction of the cross streets (`ribs`, bearings of +v), else the normal.
  const N: [number, number][] = P.map((_, i) => {
    if (sp.ribs?.[i] !== undefined) { const b = sp.ribs[i] * RAD; return [Math.sin(b), Math.cos(b)]; }
    const a = segN[Math.max(0, i - 1)];
    const b = segN[Math.min(n - 2, i)];
    const x = a[0] + b[0];
    const y = a[1] + b[1];
    const L = Math.hypot(x, y) || 1;
    return [x / L, y / L];
  });
  const at = (s: number): { c: [number, number]; nn: [number, number] } => {
    let i = 0;
    if (s >= S[n - 1]) i = n - 2;
    else if (s > 0) { let lo = 0; let hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; } i = lo; }
    const L = S[i + 1] - S[i] || 1;
    const t = (s - S[i]) / L;
    const tc = Math.max(0, Math.min(1, t));
    const c: [number, number] = [P[i][0] + t * (P[i + 1][0] - P[i][0]), P[i][1] + t * (P[i + 1][1] - P[i][1])];
    const x = N[i][0] + tc * (N[i + 1][0] - N[i][0]);
    const y = N[i][1] + tc * (N[i + 1][1] - N[i][1]);
    const l = Math.hypot(x, y) || 1;
    return { c, nn: [x / l, y / l] };
  };
  const fns: FrameFns = {
    toLngLat: (u, v) => {
      const { c, nn } = at(u - sp.u0);
      const d = v + sp.v0;
      return toLL(c[0] + d * nn[0], c[1] + d * nn[1]);
    },
    toUv: (ll) => {
      const p = toXY(ll);
      let best: { s: number; d: number } | undefined;
      const consider = (s: number) => {
        const { c, nn } = at(s);
        const rx = p[0] - c[0];
        const ry = p[1] - c[1];
        const d = rx * nn[0] + ry * nn[1];
        const off = Math.abs(rx * nn[1] - ry * nn[0]);
        if (off > 1e-3 * Math.max(1, Math.abs(d)) + 0.05) return;
        if (!best || Math.abs(d) < Math.abs(best.d)) best = { s, d };
      };
      for (let i = 0; i < n - 1; i++) {
        // (p - C(t))·T(t) = 0 with C, N linear in t (T = N turned back): a quadratic in t.
        const D: [number, number] = [P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]];
        const a: [number, number] = [p[0] - P[i][0], p[1] - P[i][1]];
        const b: [number, number] = [N[i][1], -N[i][0]];
        const e: [number, number] = [N[i + 1][1] - N[i][1], -(N[i + 1][0] - N[i][0])];
        const A2 = -(D[0] * e[0] + D[1] * e[1]);
        const B1 = a[0] * e[0] + a[1] * e[1] - (D[0] * b[0] + D[1] * b[1]);
        const C0 = a[0] * b[0] + a[1] * b[1];
        const roots: number[] = [];
        if (Math.abs(A2) < 1e-12) { if (Math.abs(B1) > 1e-12) roots.push(-C0 / B1); } else {
          const disc = B1 * B1 - 4 * A2 * C0;
          if (disc >= 0) { const q = Math.sqrt(disc); roots.push((-B1 + q) / (2 * A2), (-B1 - q) / (2 * A2)); }
        }
        const L = S[i + 1] - S[i];
        for (const t of roots) if (t >= -1e-9 && t <= 1 + 1e-9) consider(S[i] + t * L);
      }
      // Beyond the ends the frame runs straight on with the end normal.
      for (const [i, j, sgn] of [[0, 1, -1], [n - 1, n - 2, 1]] as const) {
        // p - P_i = s·D + d·N_i (D: the end segment's unit direction).
        const L = S[Math.max(i, j)] - S[Math.min(i, j)] || 1;
        const D: [number, number] = [(P[Math.max(i, j)][0] - P[Math.min(i, j)][0]) / L, (P[Math.max(i, j)][1] - P[Math.min(i, j)][1]) / L];
        const rx = p[0] - P[i][0];
        const ry = p[1] - P[i][1];
        const det = D[0] * N[i][1] - D[1] * N[i][0];
        if (Math.abs(det) < 1e-9) continue;
        const s = (rx * N[i][1] - ry * N[i][0]) / det;
        if (s * sgn > 0) consider(S[i] + s);
      }
      if (!best) {
        // Off the frame's reach (beyond its curvature): the nearest point on the spine.
        let bd = Infinity;
        for (let i = 0; i < n - 1; i++) {
          const D: [number, number] = [P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]];
          const L2 = D[0] * D[0] + D[1] * D[1] || 1;
          const t = Math.max(0, Math.min(1, ((p[0] - P[i][0]) * D[0] + (p[1] - P[i][1]) * D[1]) / L2));
          const q = [P[i][0] + t * D[0], P[i][1] + t * D[1]];
          const dd = Math.hypot(p[0] - q[0], p[1] - q[1]);
          if (dd < bd) { bd = dd; const s = S[i] + t * Math.sqrt(L2); const { c, nn } = at(s); best = { s, d: (p[0] - c[0]) * nn[0] + (p[1] - c[1]) * nn[1] }; }
        }
      }
      return [best!.s + sp.u0, best!.d - sp.v0];
    },
  };
  spineCache.set(sp, fns);
  return fns;
}

/** A piecewise-linear profile along u. */
export function profileAt(pr: { pts: [number, number][]; beyond: number }, u: number): number {
  const pts = pr.pts;
  for (let i = 1; i < pts.length; i++) {
    if (u <= pts[i][0]) {
      const [a, b] = [pts[i - 1], pts[i]];
      return a[1] + ((u - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
    }
  }
  return pr.beyond;
}

/** Where a parcel stands in the local frame, when it says (pos, or geo through the frame). */
export function parcelUV(pkg: CityPackage, x: Pick<Parcel, 'pos' | 'geo'>): UV | undefined {
  if (x.pos) return x.pos;
  if (x.geo && pkg.geography.frame) { const [u, v] = frameFns(pkg.geography.frame).toUv(x.geo); return { u, v }; }
  return undefined;
}

/** The parcel's confidence, the business's, the landmark's: one label for the UI. */
export function confidenceLabel(c: Confidence): string {
  return c === 'verified' ? 'Verified' : c === 'approximate' ? 'Approximate' : 'Invented';
}

/** Counts for a summary line: how much of a town is researched. */
export function evidenceSummary(pkg: CityPackage): Record<Confidence, number> {
  const out: Record<Confidence, number> = { verified: 0, approximate: 0, invented: 0 };
  for (const r of [...pkg.parcels, ...pkg.businesses, ...pkg.landmarks, ...pkg.institutions, ...pkg.placements]) out[r.evidence.confidence]++;
  return out;
}

/** What stands on a parcel in a year: the business whose years cover it (latest opened wins). */
export function occupantIn(pkg: Pick<CityPackage, 'businesses'>, parcelId: string, year: number): BusinessRec | undefined {
  let best: BusinessRec | undefined;
  for (const b of pkg.businesses) {
    if (b.parcelId !== parcelId || b.shares || !yearsCover(b.years, year)) continue;
    if (!best || (b.years.from ?? 0) > (best.years.from ?? 0)) best = b;
  }
  return best;
}

/** The businesses sharing a property with its main occupant in a year (a custard stand in an arcade's corner). */
export function coOccupantsIn(pkg: Pick<CityPackage, 'businesses'>, parcelId: string, year: number): BusinessRec[] {
  return pkg.businesses.filter((b) => b.parcelId === parcelId && b.shares && yearsCover(b.years, year));
}

/** Every main occupant a parcel has had, oldest first (the building outlives them). */
export function occupantsOf(pkg: Pick<CityPackage, 'businesses'>, parcelId: string): BusinessRec[] {
  return pkg.businesses.filter((b) => b.parcelId === parcelId && !b.shares).sort((a, b) => (a.years.from ?? 0) - (b.years.from ?? 0));
}

/** When a parcel's building stands from: its structure's years or built year, else its first occupant's opening (unknown: always). */
export function standsFrom(pkg: Pick<CityPackage, 'businesses'>, pc: Pick<Parcel, 'id' | 'structure'>): number | undefined {
  const st = pc.structure?.years?.from ?? pc.structure?.built;
  if (st !== undefined) return st;
  const first = occupantsOf(pkg, pc.id)[0];
  return first?.years.from;
}
