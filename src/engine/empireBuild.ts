import { CATS, CAT_IDS, ITEMS_BY_ID, itemAtTier, type ItemCat } from './empireCatalog';
import { CONCEPTS, DEPTS, SPACES } from './empireData';
import {
  ROOM_TYPES, xid, type Building, type ConceptId, type Department, type DeptKind, type EmpireState, type Floor, type OperatingPolicy, type Owner,
  type Property, type RoomType, type Space, type SpaceType, type Venue,
} from './empireState';
import type { BuildStyle, SignColor } from './design';
import type { ZoneId } from './econState';
import { ZONES_BY_ID, inflation } from './property';
import type { GameState } from './types';

/**
 * Building the records (Module 3): a property, its building, floors and
 * spaces, the departments that use them, and the rules that keep a layout
 * possible (lot coverage, ground-floor kitchens, sprinklers above three
 * stories, ramps on new work after 1973).
 */

/** Period construction rules (configurable by campaign year, Module 13). */
export const RULES = {
  /** Share of the lot a building may cover. */
  coverage: 0.6,
  /** Stories allowed by zoning. */
  maxStories: { 'resort-commercial': 8, commercial: 4, mixed: 3, industrial: 3 } as Record<Property['zoning'], number>,
  /** Sprinklers and alarms required above this many stories. */
  sprinklersAbove: 3,
  /** Elevators required above this many stories. */
  elevatorAbove: 3,
  /** Ramps and wide doors required on new work from this year (state barrier-free code). */
  rampsFrom: 1973,
  /** Corridors, stairs and walls on top of the rooms. */
  circulation: 0.18,
};

export interface VenueSpec {
  concept: ConceptId;
  rooms?: number;
  /** Seats in the dining room / lounge / club. */
  seats?: Partial<Record<'dining' | 'bar' | 'club', number>>;
  name: string;
  owner: Owner;
  ownerName: string;
  zone: ZoneId;
  address: string;
  lotId?: string;
  opKey?: string;
  builtYear: number;
  condition: number;
  /** Fit-out tier found in the building (0..3). */
  found: number;
  style?: BuildStyle;
  sign?: SignColor;
  extraDepts?: DeptKind[];
  lotSqft?: number;
}

/** Room mix by concept. */
export function roomMix(concept: ConceptId, rooms: number): Partial<Record<RoomType, number>> {
  const r = Math.max(0, Math.round(rooms));
  switch (concept) {
    case 'hourly_motel': { const h = Math.round(r * 0.75); return { room_hourly: h, room_std: r - h }; }
    case 'rooming': return { room_std: r };
    case 'boutique': { const su = Math.max(1, Math.round(r * 0.12)); const de = Math.round(r * 0.35); return { room_std: r - su - de, room_deluxe: de, suite: su }; }
    case 'luxury_resort': { const su = Math.max(2, Math.round(r * 0.15)); const de = Math.round(r * 0.35); return { room_std: r - su - de, room_deluxe: de, suite: su }; }
    case 'budget_motel': { const de = Math.round(r * 0.15); return { room_std: r - de, room_deluxe: de }; }
    default: return {};
  }
}

export function storiesFor(rooms: number): number {
  return rooms <= 0 ? 1 : rooms <= 14 ? 1 : rooms <= 48 ? 2 : rooms <= 90 ? 4 : 6;
}

const ZONING: Record<ZoneId, Property['zoning']> = {
  boardwalk: 'resort-commercial', piers: 'resort-commercial', crest: 'resort-commercial', north: 'resort-commercial', ac: 'resort-commercial',
  pacific: 'commercial', downtown: 'commercial', sphilly: 'mixed', westww: 'mixed', docks: 'industrial', causeway: 'industrial',
};

const PERMITTED: Record<Property['zoning'], string[]> = {
  'resort-commercial': ['Motels & hotels', 'Restaurants & bars', 'Nightclubs (cabaret license)', 'Amusements', 'Shops'],
  commercial: ['Motels & hotels', 'Restaurants & bars', 'Nightclubs (cabaret license)', 'Shops', 'Offices'],
  mixed: ['Rooming houses', 'Restaurants & bars', 'Shops', 'Apartments'],
  industrial: ['Warehouses', 'Truck yards', 'Motels (by variance)', 'Bars'],
};

/* ---------------- creating the records ---------------- */

export function newProperty(e: EmpireState, spec: Pick<VenueSpec, 'zone' | 'address' | 'lotId' | 'owner' | 'ownerName' | 'lotSqft'>, _s: GameState, sqft: number): Property {
  const zoning = ZONING[spec.zone] ?? 'commercial';
  const p: Property = {
    id: xid(e, 'p'), lotId: spec.lotId, zone: spec.zone, address: spec.address, lotSqft: spec.lotSqft ?? sqft,
    buildingIds: [], owner: spec.owner, ownerName: spec.ownerName, zoning, permitted: PERMITTED[zoning],
    utilities: ['City water', 'Sewer', 'Atlantic City Electric', 'Gas', 'Telephone'],
    value: 0, debts: 0, history: [],
  };
  e.properties[p.id] = p;
  return p;
}

function addSpace(e: EmpireState, b: Building, f: Floor, type: SpaceType, units: number, quality: number, furnishing: number, condition: number, capacity?: number): Space {
  const d = SPACES[type];
  const sp: Space = {
    id: xid(e, 'sp'), buildingId: b.id, floorId: f.id, type, units, sqft: d.sqft, capacity: capacity ?? d.capacity,
    quality, furnishing, condition, construction: 'done', status: 'open',
  };
  e.spaces[sp.id] = sp;
  f.spaceIds.push(sp.id);
  return sp;
}

/** Seats a dining room, lounge or club gets by default. */
export function defaultSeats(concept: ConceptId, rooms: number): Partial<Record<'dining' | 'bar' | 'club', number>> {
  switch (concept) {
    case 'boutique': return { dining: Math.max(30, Math.round(rooms * 1.2)), bar: 20 };
    case 'luxury_resort': return { dining: Math.max(80, Math.round(rooms * 1.2)), bar: 40, club: 120 };
    case 'restaurant': return { dining: 60 };
    case 'bar': return { bar: 40 };
    case 'nightclub': return { club: 150, bar: 30 };
    default: return {};
  }
}

/**
 * Lays out a building for a concept: rooms spread over the floors, the
 * service spaces on the ground floor, the pool and the parking on the lot.
 */
export function layoutBuilding(e: EmpireState, p: Property, v: Venue, spec: VenueSpec): Building {
  const rooms = spec.rooms ?? 0;
  const stories = storiesFor(rooms);
  const b: Building = {
    id: xid(e, 'b'), propertyId: p.id, floorIds: [], style: spec.style, sign: spec.sign, builtYear: spec.builtYear,
    condition: spec.condition, stories, footprint: 0, visuals: [],
    sprinklers: stories > RULES.sprinklersAbove, elevator: stories > RULES.elevatorAbove,
  };
  e.buildings[b.id] = b;
  p.buildingIds.push(b.id);
  const floors: Floor[] = [];
  for (let i = 0; i < stories; i++) {
    const f: Floor = { id: xid(e, 'f'), buildingId: b.id, level: i, area: 0, spaceIds: [] };
    e.floors[f.id] = f;
    b.floorIds.push(f.id);
    floors.push(f);
  }
  const q = 30 + spec.found * 20;
  const mix = roomMix(spec.concept, rooms);
  // Rooms floor by floor (the ground floor keeps room for the lobby and services).
  const perFloor = Math.ceil(rooms / stories);
  const room = floors.map(() => perFloor);
  for (const rt of ['room_std', 'room_hourly', 'room_deluxe', 'suite'] as RoomType[]) {
    let left = mix[rt] ?? 0;
    // Suites go up top.
    const order = rt === 'suite' ? [...floors.keys()].reverse() : [...floors.keys()];
    for (const i of order) {
      if (left <= 0) break;
      const n = Math.min(left, room[i]);
      if (n <= 0) continue;
      addSpace(e, b, floors[i], rt, n, q, spec.found, spec.condition);
      room[i] -= n;
      left -= n;
    }
    if (left > 0) addSpace(e, b, floors[floors.length - 1], rt, left, q, spec.found, spec.condition);
  }
  const g = floors[0];
  const kind = CONCEPTS[spec.concept].kind;
  if (kind === 'lodging') {
    addSpace(e, b, g, 'lobby', 1, q, spec.found, spec.condition);
    addSpace(e, b, g, 'linen', 1, q, spec.found, spec.condition);
  }
  addSpace(e, b, g, 'storage', 1, q, spec.found, spec.condition);
  const depts = new Set<DeptKind>([...CONCEPTS[spec.concept].depts, ...(spec.extraDepts ?? [])]);
  const seats = { ...defaultSeats(spec.concept, rooms), ...spec.seats };
  if (depts.has('laundry')) addSpace(e, b, g, 'laundry', 1, q, spec.found, spec.condition);
  if (depts.has('dining')) addSpace(e, b, g, 'dining', 1, q, spec.found, spec.condition, seats.dining ?? 40);
  if (depts.has('kitchen')) addSpace(e, b, g, 'kitchen', 1, q, spec.found, spec.condition);
  if (depts.has('bar')) addSpace(e, b, g, 'lounge', 1, q, spec.found, spec.condition, seats.bar ?? 24);
  if (depts.has('club')) addSpace(e, b, g, 'club', 1, q, spec.found, spec.condition, seats.club ?? 120);
  if (depts.has('spa')) addSpace(e, b, floors[Math.min(1, floors.length - 1)], 'spa', 1, q, spec.found, spec.condition);
  if (depts.has('admin') || depts.has('marketing')) addSpace(e, b, g, 'office', 1, q, spec.found, spec.condition);
  if (depts.has('pool')) addSpace(e, b, g, 'pool', 1, q, spec.found, spec.condition);
  if (depts.has('parking')) addSpace(e, b, g, 'parking', Math.max(10, Math.round(rooms * 0.8)), q, spec.found, spec.condition);
  recalcAreas(e, b);
  if (!spec.lotSqft) p.lotSqft = Math.max(p.lotSqft, Math.round((b.footprint / RULES.coverage) * 1.25 / 100) * 100 + outdoorArea(e, b));
  // Departments, each linked to its spaces.
  for (const k of depts) addDept(e, v, b, k);
  return b;
}

export function addDept(e: EmpireState, v: Venue, b: Building, kind: DeptKind): Department {
  const have = v.deptIds.map((id) => e.depts[id]).find((d) => d?.kind === kind);
  if (have) return have;
  const d: Department = { id: xid(e, 'd'), venueId: v.id, kind, spaceIds: [], equipment: 1, budget: 0 };
  e.depts[d.id] = d;
  v.deptIds.push(d.id);
  const want = DEPTS[kind].space;
  for (const fid of b.floorIds) for (const sid of e.floors[fid].spaceIds) {
    const sp = e.spaces[sid];
    if (want && sp.type === want && !sp.deptId) { sp.deptId = d.id; d.spaceIds.push(sp.id); }
    if (kind === 'housekeeping' && ROOM_TYPES.includes(sp.type as RoomType)) sp.deptId ??= d.id;
  }
  return d;
}

export function outdoorArea(e: EmpireState, b: Building): number {
  let a = 0;
  for (const fid of b.floorIds) for (const sid of e.floors[fid].spaceIds) {
    const sp = e.spaces[sid];
    if (SPACES[sp.type].outdoor) a += sp.sqft * sp.units;
  }
  return a;
}

/** Floor areas from the spaces, plus corridors; the footprint is the biggest floor. */
export function recalcAreas(e: EmpireState, b: Building): void {
  let foot = 0;
  for (const fid of b.floorIds) {
    const f = e.floors[fid];
    let a = 0;
    for (const sid of f.spaceIds) {
      const sp = e.spaces[sid];
      if (SPACES[sp.type].outdoor) continue;
      a += sp.sqft * (SPACES[sp.type].capacity === 1 && sp.type !== 'parking' ? sp.capacity : sp.units);
    }
    f.area = Math.round(a * (1 + RULES.circulation));
    foot = Math.max(foot, f.area);
  }
  b.footprint = foot;
}

/* ---------------- reading the layout ---------------- */

export function venueBuilding(e: EmpireState, v: Venue): Building | undefined {
  const p = e.properties[v.propertyId];
  return p ? e.buildings[p.buildingIds[0]] : undefined;
}

export function venueSpaces(e: EmpireState, v: Venue): Space[] {
  const p = e.properties[v.propertyId];
  if (!p) return [];
  const out: Space[] = [];
  for (const bid of p.buildingIds) for (const fid of e.buildings[bid]?.floorIds ?? []) for (const sid of e.floors[fid]?.spaceIds ?? []) if (e.spaces[sid]) out.push(e.spaces[sid]);
  return out;
}

export function roomsByType(e: EmpireState, v: Venue, openOnly = false): Record<RoomType, number> {
  const out: Record<RoomType, number> = { room_std: 0, room_deluxe: 0, suite: 0, room_hourly: 0 };
  for (const sp of venueSpaces(e, v)) {
    if (!ROOM_TYPES.includes(sp.type as RoomType)) continue;
    if (openOnly && (sp.status !== 'open' || sp.construction !== 'done')) continue;
    out[sp.type as RoomType] += sp.units;
  }
  return out;
}

export function roomCount(e: EmpireState, v: Venue): number {
  const r = roomsByType(e, v);
  return r.room_std + r.room_deluxe + r.suite + r.room_hourly;
}

export function seatsOf(e: EmpireState, v: Venue, type: 'dining' | 'lounge' | 'club'): number {
  return venueSpaces(e, v).filter((sp) => sp.type === type && sp.status === 'open' && sp.construction === 'done').reduce((a, sp) => a + sp.capacity, 0);
}

export function hasSpace(e: EmpireState, v: Venue, type: SpaceType): boolean {
  return venueSpaces(e, v).some((sp) => sp.type === type && sp.construction === 'done');
}

export function deptOf(e: EmpireState, v: Venue, kind: DeptKind): Department | undefined {
  return v.deptIds.map((id) => e.depts[id]).find((d) => d?.kind === kind);
}

/** Used and available area: building floors vs what zoning allows, outdoor vs the lot. */
export function areaReport(e: EmpireState, v: Venue): { floors: { level: number; area: number; spaces: number }[]; built: number; allowed: number; footprint: number; lot: number; outdoor: number; freeLot: number; maxStories: number } {
  const p = e.properties[v.propertyId];
  const b = venueBuilding(e, v);
  if (!p || !b) return { floors: [], built: 0, allowed: 0, footprint: 0, lot: 0, outdoor: 0, freeLot: 0, maxStories: 0 };
  const floors = b.floorIds.map((fid) => e.floors[fid]).map((f) => ({ level: f.level, area: f.area, spaces: f.spaceIds.length }));
  const built = floors.reduce((a, f) => a + f.area, 0);
  const maxStories = RULES.maxStories[p.zoning];
  const allowed = Math.round(p.lotSqft * RULES.coverage * maxStories);
  const outdoor = outdoorArea(e, b);
  return { floors, built, allowed, footprint: b.footprint, lot: p.lotSqft, outdoor, freeLot: Math.max(0, p.lotSqft - b.footprint - outdoor), maxStories };
}

/** Why a layout is impossible or breaks the period's codes (empty when it is fine). */
export function layoutProblems(e: EmpireState, v: Venue, year: number): string[] {
  const out: string[] = [];
  const p = e.properties[v.propertyId];
  const b = venueBuilding(e, v);
  if (!p || !b) return ['No building on the lot'];
  const a = areaReport(e, v);
  if (b.footprint > p.lotSqft * RULES.coverage + 1) out.push(`The building covers more than ${Math.round(RULES.coverage * 100)}% of the lot`);
  if (b.stories > a.maxStories) out.push(`Zoning (${p.zoning}) allows ${a.maxStories} stories`);
  if (b.stories > RULES.sprinklersAbove && !b.sprinklers) out.push(`Fire code: sprinklers and alarms are required above ${RULES.sprinklersAbove} stories`);
  if (b.stories > RULES.elevatorAbove && !b.elevator) out.push(`An elevator is required above ${RULES.elevatorAbove} stories`);
  const sp = venueSpaces(e, v);
  const ground = b.floorIds[0];
  for (const x of sp) if (SPACES[x.type].ground && x.floorId !== ground) out.push(`${SPACES[x.type].name} must be on the ground floor`);
  if (sp.some((x) => x.type === 'dining') && !sp.some((x) => x.type === 'kitchen')) out.push('A dining room needs a kitchen');
  if (CONCEPTS[v.concept].kind === 'lodging' && !sp.some((x) => x.type === 'lobby')) out.push('A hotel needs a lobby and a front desk');
  if (year >= RULES.rampsFrom && b.builtYear >= RULES.rampsFrom && !b.ramps) out.push('Barrier-free code: new buildings need ramps and wide doors');
  return out;
}

/* ---------------- fit-out ---------------- */

/** The item a building comes with for a category at a fit-out tier. */
export function foundItem(cat: ItemCat, tier: number, year: number): string | undefined {
  // Most motels in 1960 had no air conditioning and a black-and-white set at best.
  if (cat === 'aircon' && tier < 2) return itemAtTier(cat, 0, year)?.id;
  if (cat === 'tv' && tier < 1) return itemAtTier(cat, 0, year)?.id;
  if (cat === 'phone' && tier < 2) return itemAtTier(cat, 0, year)?.id;
  return itemAtTier(cat, tier, year)?.id;
}

/** Whether a category applies to this venue (it has the rooms or the department). */
export function catApplies(e: EmpireState, v: Venue, cat: ItemCat): boolean {
  const c = CATS[cat];
  if (c.dept) return !!deptOf(e, v, c.dept);
  return CONCEPTS[v.concept].kind === 'lodging' && roomCount(e, v) > 0;
}

/** Units of a durable category the venue needs. */
export function durableUnits(e: EmpireState, v: Venue, cat: ItemCat): number {
  const c = CATS[cat];
  const per = c.per ?? 1;
  if (c.scope === 'room') return Math.round(roomCount(e, v) * per);
  if (c.scope === 'seat') {
    const seats = cat === 'seating' ? seatsOf(e, v, 'club') : seatsOf(e, v, 'dining') + (cat === 'glassware' ? seatsOf(e, v, 'lounge') : 0);
    return Math.round(seats * per);
  }
  if (c.scope === 'staff') return Math.round(v.staffIds.length * per);
  return 1;
}

/** Fits out (or refits) durables and consumables at a tier, as found or bought. */
export function fitOut(s: GameState, e: EmpireState, v: Venue, tier: number, wear: number): void {
  const y = s.date.y;
  for (const cat of CAT_IDS) {
    if (!catApplies(e, v, cat)) continue;
    const c = CATS[cat];
    const it = c.kind === 'durable' ? foundItem(cat, tier, y) : itemAtTier(cat, tier, y)?.id;
    if (!it) continue;
    if (c.kind === 'durable') {
      v.durables[cat] = { item: it, units: durableUnits(e, v, cat), wear };
      v.policy.supplies[cat] ??= itemAtTier(cat, v.policy.supplyTier, y)?.id ?? it;
    } else {
      v.policy.supplies[cat] ??= it;
      v.stock[cat] ??= { item: it, onHand: 0, onOrder: 0, used: 0, short: 0 };
    }
  }
}

/** A blank operating policy for a concept (presets fill in the rest). */
export function basePolicy(s: GameState, concept: ConceptId, zone: ZoneId): OperatingPolicy {
  const c = CONCEPTS[concept];
  const infl = inflation(s);
  const land = ZONES_BY_ID[zone]?.land ?? 1;
  const zoneAdj = 0.85 + 0.15 * land;
  const rates: OperatingPolicy['rates'] = {};
  for (const [k, r] of Object.entries(c.rates)) rates[k as RoomType] = Math.round(r * infl * zoneAdj * 4) / 4;
  return {
    mode: 'owner', rates, offPct: 0.6, priceStance: 'market', occupancyTarget: 0.85, housekeeping: c.housekeeping, staffing: 'standard',
    maintenance: 'normal', winter: c.kind === 'lodging' && concept !== 'hourly_motel' ? 'close' : 'open', marketing: Math.round((c.kind === 'lodging' ? 6 : 4) * infl),
    coverWeeks: 2, replaceAt: 85, supplies: {}, supplyTier: c.tier, training: 0, autoCapex: Math.round(1000 * infl),
    menuPrice: c.kind === 'lodging' || c.kind === 'food' ? Math.round(2.75 * infl * (concept === 'luxury_resort' ? 2 : concept === 'boutique' ? 1.5 : 1) * 4) / 4 : undefined,
    drinkPrice: Math.round(0.6 * infl * 20) / 20,
    coverCharge: c.kind === 'club' || concept === 'luxury_resort' ? Math.round(2 * infl * 4) / 4 : undefined,
    entertainment: c.kind === 'club' ? Math.round(300 * infl) : concept === 'luxury_resort' ? Math.round(450 * infl) : undefined,
  };
}

/** Replacement cost of everything durable at a tier (for the refurnish project). */
export function refitCost(s: GameState, e: EmpireState, v: Venue, cats?: ItemCat[]): number {
  let c = 0;
  for (const cat of cats ?? CAT_IDS) {
    if (CATS[cat].kind !== 'durable' || !catApplies(e, v, cat)) continue;
    const id = v.policy.supplies[cat];
    const it = id ? ITEMS_BY_ID[id] : undefined;
    if (it) c += it.price * durableUnits(e, v, cat);
  }
  return Math.round(c * inflation(s));
}
