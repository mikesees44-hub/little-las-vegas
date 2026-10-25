import type { BuildStyle, SignColor } from './design';
import type { ZoneId } from './econState';
import { hashSeed } from './rng';
import type { FactionId, GameState } from './types';

/**
 * The Empire Designer's data model (Module 16). Every record is plain JSON,
 * linked by id, and lives on `GameState.empire` (optional, so older saves
 * load; `ensureEmpire` migrates). The layer rolls on its own seeded stream
 * (`empire.rng`) so it never reshuffles the main simulation's dice.
 *
 *   Property ─┬─ Building ─ Floor ─ Space (a room block, a dining room, a pool)
 *             └─ Venue (the business unit) ─┬─ Department ─ Employment
 *                                           ├─ stock / durables (inventory records)
 *                                           ├─ SupplierContract
 *                                           └─ Project (construction / renovation)
 *
 * A Property is the lot (`lotId`) when there is one, or a storefront the
 * family bought without a lot record. The Venue's `opKey` is the key the old
 * economy uses for the place (a business id, or `lot:<id>` for a building you
 * run), so managers, the Deal and the map keep working unchanged.
 */

export type ConceptId = 'budget_motel' | 'hourly_motel' | 'rooming' | 'boutique' | 'luxury_resort' | 'restaurant' | 'bar' | 'nightclub';

export type DeptKind =
  | 'admin' | 'front' | 'housekeeping' | 'laundry' | 'maintenance' | 'dining' | 'kitchen' | 'bar' | 'club'
  | 'pool' | 'spa' | 'security' | 'marketing' | 'parking';

export type SpaceType =
  | 'room_std' | 'room_deluxe' | 'suite' | 'room_hourly' | 'lobby' | 'office' | 'linen' | 'laundry' | 'dining' | 'kitchen'
  | 'lounge' | 'club' | 'pool' | 'spa' | 'banquet' | 'parking' | 'storage' | 'staff';

export type RoomType = 'room_std' | 'room_deluxe' | 'suite' | 'room_hourly';
export const ROOM_TYPES: RoomType[] = ['room_std', 'room_deluxe', 'suite', 'room_hourly'];

export type Mode = 'owner' | 'manager' | 'micro';
export type Housekeeping = 'basic' | 'standard' | 'spotless';
export type Staffing = 'lean' | 'standard' | 'generous';
export type Maintenance = 'defer' | 'normal' | 'preventive';
export type Winter = 'close' | 'skeleton' | 'open';
export type PriceStance = 'budget' | 'market' | 'premium';

export type Owner = FactionId | 'private';

export interface VisualSnapshot {
  week: number;
  year: number;
  style?: BuildStyle;
  sign?: SignColor;
  stories: number;
  rooms: number;
  label: string;
}

export interface PropHistory {
  week: number;
  year: number;
  kind: 'acquired' | 'built' | 'renovated' | 'converted' | 'staff' | 'sold' | 'note' | 'opened' | 'closed';
  text: string;
}

export interface Property {
  id: string;
  lotId?: string;
  zone: ZoneId;
  address: string;
  /** Lot size and what the building covers (square feet). */
  lotSqft: number;
  buildingIds: string[];
  venueId?: string;
  owner: Owner;
  ownerName: string;
  /** Zoning designation and the uses it permits. */
  zoning: 'resort-commercial' | 'commercial' | 'mixed' | 'industrial';
  permitted: string[];
  /** Utilities on the lot. */
  utilities: string[];
  /** Assessed value (taxes are a share of it). */
  value: number;
  /** Outstanding debts against it (liens, notes). */
  debts: number;
  history: PropHistory[];
}

export interface Building {
  id: string;
  propertyId: string;
  floorIds: string[];
  style?: BuildStyle;
  sign?: SignColor;
  builtYear: number;
  /** 0..100. */
  condition: number;
  stories: number;
  /** Square feet the building covers on the lot. */
  footprint: number;
  /** Fire safety (sprinklers, alarms) and access (ramps) fitted. */
  sprinklers?: boolean;
  ramps?: boolean;
  elevator?: boolean;
  /** Every look the place has had (Module 12: kept as history). */
  visuals: VisualSnapshot[];
}

export interface Floor {
  id: string;
  buildingId: string;
  /** 0 = ground. */
  level: number;
  area: number;
  spaceIds: string[];
}

export interface Space {
  id: string;
  buildingId: string;
  floorId: string;
  type: SpaceType;
  /** Identical units in the block (rooms); 1 for a dining room, a pool. */
  units: number;
  /** Square feet per unit. */
  sqft: number;
  /** Guests per unit (rooms) or seats (dining, lounge, club). */
  capacity: number;
  /** 0..100: the fit-out. */
  quality: number;
  /** Furnishing package (tier 0..3). */
  furnishing: number;
  deptId?: string;
  condition: number;
  construction: 'done' | 'building';
  status: 'open' | 'closed' | 'renovating';
}

export interface Department {
  id: string;
  venueId: string;
  kind: DeptKind;
  /** Employment id of the head (a staffer, the wife, a son, a crew man). */
  headId?: string;
  spaceIds: string[];
  /** Equipment level 0..3 (laundry machines, a kitchen range, a sound system). */
  equipment: number;
  /** Extra weekly budget the department may spend (marketing, maintenance, training). */
  budget: number;
}

export interface Employment {
  id: string;
  venueId: string;
  deptId: string;
  name: string;
  female: boolean;
  /** A character of the game (family, crew) when it is one. */
  charId?: string;
  source: 'local' | 'family' | 'crew' | 'promoted';
  role: 'head' | 'staff';
  /** Weekly wage. */
  wage: number;
  skill: number;
  /** 0..100. */
  satisfaction: number;
  xp: number;
  since: number;
  /** 0..100: wants more (a raise, a promotion, a place of his own). */
  ambition: number;
  /** Hired for the summer only (let go after Labor Day in Owner mode). */
  seasonal?: boolean;
  /** Weeks of training received. */
  trained: number;
}

export interface StockLine {
  item: string;
  onHand: number;
  onOrder: number;
  /** Week the order arrives. */
  arrives?: number;
  /** Units used this year. */
  used: number;
  /** Weeks with a shortage this year. */
  short: number;
}

export interface DurableLine {
  item: string;
  units: number;
  /** 0..100 worn out. */
  wear: number;
}

export interface SupplierContract {
  id: string;
  venueId: string;
  group: SupplyGroup;
  supplierId: string;
  since: number;
}

export type SupplyGroup = 'linen' | 'paper' | 'food' | 'liquor' | 'furniture' | 'cleaning';

export interface Project {
  id: string;
  venueId: string;
  defId: string;
  started: number;
  weeks: number;
  weeksLeft: number;
  cost: number;
  paid: number;
  /** Room units taken out of service while the crews work. */
  closes: number;
  /** For restyles, remodels, conversions. */
  param?: string;
  status: 'active' | 'done' | 'waiting';
  /** Who approved it ('owner', 'manager'). */
  by: 'owner' | 'manager';
}

export interface OperatingPolicy {
  mode: Mode;
  presetId?: string;
  /** Peak-season nightly rates by room type (hourly rooms: per stay). */
  rates: Partial<Record<RoomType, number>>;
  /** Off-season and shoulder rates as a share of peak. */
  offPct: number;
  priceStance: PriceStance;
  occupancyTarget: number;
  housekeeping: Housekeeping;
  staffing: Staffing;
  maintenance: Maintenance;
  winter: Winter;
  /** Weekly marketing spend. */
  marketing: number;
  /** Weeks of consumables to keep on hand. */
  coverWeeks: number;
  /** Replace durables at this wear (0..100). */
  replaceAt: number;
  /** Chosen catalog item per category. */
  supplies: Record<string, string>;
  /** Supply tier the manager buys at (0..3) when he chooses. */
  supplyTier: number;
  /** Dining: average check; bar: a drink; club: the cover. */
  menuPrice?: number;
  drinkPrice?: number;
  coverCharge?: number;
  /** Weekly training budget per head. */
  training: number;
  /** The manager may approve projects up to this much on his own (Owner mode). */
  autoCapex: number;
  /** Weekly entertainment contract (club, lounge): a band, a comic, a headliner. */
  entertainment?: number;
  /**
   * HOOK (later phase: act booking and meeting the stars): this week's
   * headliner, from the world pack's entertainers. The booking manager's
   * skill sets the tier he can land (`actTier`); fee and draw feed the club.
   */
  act?: { worldId?: string; name: string; fee: number; draw: number; demands?: string };
  /** HOOK (later phase): the nightlife network operates here under an arrangement. */
  network?: boolean;
}

export interface OperatingPreset {
  id: string;
  name: string;
  blurb: string;
  builtIn?: boolean;
  /** Supply tier relative to the concept's (−1 cheaper, +1 better). */
  tierDelta?: number;
  policy: Partial<Omit<OperatingPolicy, 'rates' | 'supplies' | 'presetId'>>;
}

export interface WeekStat {
  week: number;
  open: boolean;
  capacity: number;
  roomNights: number;
  occ: number;
  adr: number;
  covers: number;
  drinks: number;
  clubGuests: number;
  guests: Record<string, number>;
  rev: { rooms: number; dining: number; bar: number; club: number; other: number };
  cogs: number;
  exp: Record<string, number>;
  capex: number;
  noi: number;
  quality: number;
  sat: number;
  shortages: string[];
  notes: string[];
}

export interface PeriodStat {
  key: string;
  rev: number;
  cogs: number;
  opex: number;
  noi: number;
  capex: number;
  roomNights: number;
  capacity: number;
  covers: number;
  sat: number;
  weeks: number;
}

export interface Venue {
  id: string;
  propertyId: string;
  owner: Owner;
  ownerName: string;
  name: string;
  concept: ConceptId;
  /** The old economy's key: a business id, or `lot:<id>`. */
  opKey?: string;
  policy: OperatingPolicy;
  stock: Record<string, StockLine>;
  durables: Record<string, DurableLine>;
  deptIds: string[];
  staffIds: string[];
  /** Amenities and fittings done (project ids: pool, ac, tv ...). */
  amenities: string[];
  /** 0..100. */
  reputation: number;
  opened: number;
  last?: WeekStat;
  months: PeriodStat[];
  years: PeriodStat[];
  capexTotal: number;
  /** Projects the manager proposes (def ids), waiting for the owner. */
  proposals: string[];
  /** Weeks the manager has disagreed with the owner's policy. */
  gripe: number;
  /** Rivals keep their own cash. */
  cash?: number;
  /** Weeks a rival has been losing money. */
  redWeeks?: number;
  closed?: string;
  /** Former employees (who left, why). */
  alumni: { name: string; week: number; why: string }[];
  /** First-time setup is done (the player confirmed or the manager ran it). */
  setup?: boolean;
  /** Rivals: the owner's manager's skill (player venues use the econ manager). */
  skill?: number;
  /** Rooms out of service after a breakdown, until this week. */
  brokenUntil?: number;
  brokenRooms?: number;
  /** The week whose statement has been posted to the ledger. */
  posted?: number;
  /** Expected weekly use of each consumable (the manager's forecast). */
  avgUse?: Record<string, number>;
}

/** Plans made before the place is yours (the Deal signs at the week's turn). */
export interface Plan {
  concept?: ConceptId;
  presetId?: string;
  mode?: Mode;
}

export interface EmpireStats {
  venues: number;
  projects: number;
  hires: number;
  quits: number;
  shortages: number;
  rivalsOpened: number;
  rivalsClosed: number;
  spinoffs: number;
}

export interface EmpireState {
  v: number;
  rng: number;
  nextId: number;
  properties: Record<string, Property>;
  buildings: Record<string, Building>;
  floors: Record<string, Floor>;
  spaces: Record<string, Space>;
  venues: Record<string, Venue>;
  depts: Record<string, Department>;
  staff: Record<string, Employment>;
  contracts: Record<string, SupplierContract>;
  projects: Record<string, Project>;
  presets: Record<string, OperatingPreset>;
  plans: Record<string, Plan>;
  stats: EmpireStats;
  /** Rival scan done for the town's existing lodging. */
  rivalsSeeded?: boolean;
  /** The week the market was last cleared. */
  marketWeek?: number;
}

export const EMPIRE_VERSION = 1;

export function blankEmpire(s: GameState): EmpireState {
  return {
    v: EMPIRE_VERSION,
    rng: hashSeed(`${s.seed}:empire`),
    nextId: 1,
    properties: {}, buildings: {}, floors: {}, spaces: {}, venues: {}, depts: {}, staff: {}, contracts: {}, projects: {}, presets: {}, plans: {},
    stats: { venues: 0, projects: 0, hires: 0, quits: 0, shortages: 0, rivalsOpened: 0, rivalsClosed: 0, spinoffs: 0 },
  };
}

/** The layer's state on a state you are allowed to mutate (created if missing). */
export function ensureEmpire(s: GameState): EmpireState {
  const g = s as GameState & { empire?: EmpireState };
  if (!g.empire) g.empire = blankEmpire(s);
  const e = g.empire;
  e.plans ??= {};
  e.presets ??= {};
  return e;
}

export function empireOf(s: GameState): EmpireState | undefined {
  return (s as GameState & { empire?: EmpireState }).empire;
}

export function xid(e: EmpireState, prefix: string): string {
  return `${prefix}${e.nextId++}`;
}
