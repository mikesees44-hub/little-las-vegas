import { CATS, CAT_IDS, ITEMS_BY_ID, itemAtTier, type ItemCat } from './empireCatalog';
import {
  RULES, addDept, areaReport, catApplies, deptOf, durableUnits, recalcAreas, roomCount, roomsByType, storiesFor, venueBuilding, venueSpaces,
} from './empireBuild';
import { CONCEPTS, SPACES, type ConceptKind } from './empireData';
import { xid, type ConceptId, type EmpireState, type RoomType, type Space, type SpaceType, type Venue } from './empireState';
import { SIGN_HEX, STYLES, type BuildStyle, type SignColor } from './design';
import { inflation } from './property';
import type { GameState } from './types';

/**
 * The upgrade and renovation tree (Module 10): cosmetic work, furniture,
 * equipment, remodels, expansions, amenities, structural repairs, energy,
 * access, technology and complete conversions. Each has prerequisites, a
 * cost (paid week by week through the ledger), a duration, rooms out of
 * service while the crews work, and real effects on the building record.
 *
 * Capital is in the game's 1960 construction dollars (the same scale as the
 * lots and the build costs on the map); durables are bought at
 * DURABLE_SCALE of their list price for the same reason.
 */

export const DURABLE_SCALE = 0.35;

export type ProjectKind = 'cosmetic' | 'furniture' | 'equipment' | 'remodel' | 'expansion' | 'building' | 'amenity' | 'structural' | 'energy' | 'access' | 'technology' | 'conversion' | 'safety';

export const KIND_LABEL: Record<ProjectKind, string> = {
  cosmetic: 'Cosmetic', furniture: 'Furniture', equipment: 'Equipment', remodel: 'Room remodel', expansion: 'Department expansion', building: 'Building expansion',
  amenity: 'New amenity', structural: 'Structural repair', energy: 'Energy efficiency', access: 'Accessibility', technology: 'Technology', conversion: 'Conversion', safety: 'Fire safety',
};

export interface ProjectDef {
  id: string;
  name: string;
  kind: ProjectKind;
  blurb: string;
  /** What it does, in a line. */
  effect: string;
  from?: number;
  to?: number;
  /** Concept kinds it applies to. */
  kinds: ConceptKind[];
  /** Done once (an amenity the place now has). */
  once?: boolean;
  needs?: (s: GameState, e: EmpireState, v: Venue) => string | undefined;
  cost: (s: GameState, e: EmpireState, v: Venue, param?: string) => number;
  weeks: (e: EmpireState, v: Venue) => number;
  /** Room units out of service while it runs. */
  closes?: (e: EmpireState, v: Venue) => number;
  /** Options (a style, a concept). */
  params?: (s: GameState, e: EmpireState, v: Venue) => { id: string; label: string }[];
  apply: (s: GameState, e: EmpireState, v: Venue, param?: string) => string;
}

const L = (s: GameState) => inflation(s);
const rooms = (e: EmpireState, v: Venue) => roomCount(e, v);
const styleCost = (e: EmpireState, v: Venue) => 1 + (venueBuilding(e, v)?.style ? STYLES[venueBuilding(e, v)!.style!].cost : 0);
const has = (v: Venue, a: string) => v.amenities.includes(a);

function ground(e: EmpireState, v: Venue) {
  const b = venueBuilding(e, v)!;
  return e.floors[b.floorIds[0]];
}

function newSpace(e: EmpireState, v: Venue, floorId: string, type: SpaceType, units: number, capacity?: number): Space {
  const b = venueBuilding(e, v)!;
  const sp: Space = {
    id: xid(e, 'sp'), buildingId: b.id, floorId, type, units, sqft: SPACES[type].sqft, capacity: capacity ?? SPACES[type].capacity,
    quality: 40 + v.policy.supplyTier * 18, furnishing: v.policy.supplyTier, condition: 100, construction: 'done', status: 'open',
  };
  e.spaces[sp.id] = sp;
  e.floors[floorId].spaceIds.push(sp.id);
  const dk = SPACES[type].dept;
  if (dk) {
    const d = deptOf(e, v, dk) ?? addDept(e, v, b, dk);
    sp.deptId = d.id;
    if (!d.spaceIds.includes(sp.id)) d.spaceIds.push(sp.id);
  }
  return sp;
}

/** Adds rooms: to the floors with room, or a new floor on top. */
export function addRooms(e: EmpireState, v: Venue, type: RoomType, n: number, newFloor = false): void {
  const b = venueBuilding(e, v)!;
  let fid = b.floorIds[b.floorIds.length - 1];
  if (newFloor) {
    const f = { id: xid(e, 'f'), buildingId: b.id, level: b.floorIds.length, area: 0, spaceIds: [] as string[] };
    e.floors[f.id] = f;
    b.floorIds.push(f.id);
    b.stories = b.floorIds.length;
    fid = f.id;
  } else fid = b.floorIds[0];
  const hk = deptOf(e, v, 'housekeeping');
  const sp = newSpace(e, v, fid, type, n);
  if (hk) sp.deptId = hk.id;
  recalcAreas(e, b);
}

/** Changes room units from one type to another (merging rooms into suites when `ratio` is 2). */
export function convertRooms(e: EmpireState, v: Venue, from: RoomType, to: RoomType, n: number, ratio = 1): number {
  let left = n * ratio;
  const made: Record<string, number> = {};
  for (const sp of venueSpaces(e, v)) {
    if (sp.type !== from || left <= 0) continue;
    const take = Math.min(sp.units, left);
    sp.units -= take;
    left -= take;
    made[sp.floorId] = (made[sp.floorId] ?? 0) + take;
    if (sp.units <= 0) {
      e.floors[sp.floorId].spaceIds = e.floors[sp.floorId].spaceIds.filter((x) => x !== sp.id);
      delete e.spaces[sp.id];
    }
  }
  let out = 0;
  for (const [fid, units] of Object.entries(made)) {
    const k = Math.floor(units / ratio);
    if (k <= 0) continue;
    const sp = newSpace(e, v, fid, to, k);
    sp.deptId = deptOf(e, v, 'housekeeping')?.id;
    out += k;
  }
  recalcAreas(e, venueBuilding(e, v)!);
  return out;
}

/** Puts every durable of these categories at the policy's chosen item (bought new). */
export function refitDurables(s: GameState, e: EmpireState, v: Venue, cats: ItemCat[]): void {
  for (const cat of cats) {
    if (CATS[cat].kind !== 'durable' || !catApplies(e, v, cat)) continue;
    const it = v.policy.supplies[cat] ?? itemAtTier(cat, v.policy.supplyTier, s.date.y)?.id;
    if (!it) continue;
    v.durables[cat] = { item: it, units: durableUnits(e, v, cat), wear: 0 };
  }
  for (const sp of venueSpaces(e, v)) {
    sp.furnishing = Math.max(sp.furnishing, v.policy.supplyTier);
    sp.quality = Math.max(sp.quality, 40 + v.policy.supplyTier * 18);
  }
}

/** Cost of buying durables at the policy's choice (game dollars). */
export function durablesCost(s: GameState, e: EmpireState, v: Venue, cats: ItemCat[], tier?: number): number {
  let c = 0;
  for (const cat of cats) {
    if (CATS[cat].kind !== 'durable' || !catApplies(e, v, cat)) continue;
    const id = tier !== undefined ? itemAtTier(cat, tier, s.date.y)?.id : (v.policy.supplies[cat] ?? itemAtTier(cat, v.policy.supplyTier, s.date.y)?.id);
    const it = id ? ITEMS_BY_ID[id] : undefined;
    if (it) c += it.price * durableUnits(e, v, cat);
  }
  return Math.round(c * DURABLE_SCALE * L(s));
}

const ROOM_CATS: ItemCat[] = ['mattress', 'pillows', 'sheets', 'blankets', 'bedframe', 'towels', 'furniture', 'fixtures', 'carpet'];

function setDurable(s: GameState, e: EmpireState, v: Venue, cat: ItemCat, itemId: string): void {
  v.policy.supplies[cat] = itemId;
  v.durables[cat] = { item: itemId, units: durableUnits(e, v, cat), wear: 0 };
  void s;
}

function bestOf(cat: ItemCat, s: GameState, ids: string[]): string {
  const ok = ids.filter((id) => { const it = ITEMS_BY_ID[id]; return it && (it.from ?? 0) <= s.date.y && (it.to ?? 9999) >= s.date.y; });
  return ok[ok.length - 1] ?? itemAtTier(cat, 1, s.date.y)!.id;
}

function convert(s: GameState, e: EmpireState, v: Venue, to: ConceptId): void {
  const c = CONCEPTS[to];
  const b = venueBuilding(e, v)!;
  v.concept = to;
  for (const k of c.depts) addDept(e, v, b, k);
  v.policy.supplyTier = c.tier;
  v.policy.housekeeping = c.housekeeping;
  for (const [k, r] of Object.entries(c.rates)) v.policy.rates[k as RoomType] = Math.round(r * L(s) * 4) / 4;
  for (const k of Object.keys(v.policy.rates)) if (!(k in c.rates)) delete v.policy.rates[k as RoomType];
  for (const cat of CAT_IDS) if (CATS[cat].kind === 'consumable') v.policy.supplies[cat] = itemAtTier(cat, c.tier, s.date.y)?.id ?? v.policy.supplies[cat];
}

export const PROJECTS: ProjectDef[] = [
  {
    id: 'paint', name: 'Fresh paint & new neon', kind: 'cosmetic', kinds: ['lodging', 'food', 'bar', 'club'],
    blurb: 'Scrape, prime, two coats, and new tubes in the sign. Salt air eats paint.', effect: 'Building condition +12, rooms +8, reputation +2',
    cost: (s, e, v) => Math.round((120 + 8 * rooms(e, v)) * L(s) * styleCost(e, v)), weeks: () => 2,
    apply: (_s, e, v) => {
      const b = venueBuilding(e, v)!;
      b.condition = Math.min(100, b.condition + 12);
      for (const sp of venueSpaces(e, v)) sp.condition = Math.min(100, sp.condition + 8);
      v.reputation = Math.min(100, v.reputation + 2);
      return 'Fresh paint and new neon';
    },
  },
  {
    id: 'restyle', name: 'Restyle the façade', kind: 'cosmetic', kinds: ['lodging', 'food', 'bar', 'club'],
    blurb: 'A new look on the street: boomerang roofs, chrome, bamboo or gingerbread, and a new color in the sign.', effect: 'Changes the style and the neon on the map; each style has its own draw, upkeep and prestige',
    params: (s) => (Object.keys(STYLES) as BuildStyle[]).filter((k) => (STYLES[k].from ?? 0) <= s.date.y).flatMap((k) => (Object.keys(SIGN_HEX) as SignColor[]).slice(0, 7).map((c) => ({ id: `${k}:${c}`, label: `${STYLES[k].name}, ${c} neon` }))),
    cost: (s, e, v, p) => Math.round((600 + 25 * rooms(e, v)) * L(s) * (1 + (p ? STYLES[p.split(':')[0] as BuildStyle]?.cost ?? 0 : 0))),
    weeks: () => 5, closes: (e, v) => Math.round(rooms(e, v) * 0.15),
    apply: (_s, e, v, p) => {
      const b = venueBuilding(e, v)!;
      const [st, sg] = (p ?? 'doowop:pink').split(':') as [BuildStyle, SignColor];
      b.style = st;
      b.sign = sg;
      b.condition = Math.min(100, b.condition + 6);
      return `Restyled: ${STYLES[st].name}, ${sg} neon`;
    },
  },
  {
    id: 'refurnish', name: 'Refurnish the rooms', kind: 'furniture', kinds: ['lodging'],
    blurb: 'Everything out, everything new, at the purchasing choices you set: mattresses, linen, furniture, fixtures, floors.', effect: 'All room furnishings new (wear 0) at your chosen items',
    cost: (s, e, v) => durablesCost(s, e, v, ROOM_CATS) + Math.round(20 * rooms(e, v) * L(s)), weeks: () => 3, closes: (e, v) => Math.round(rooms(e, v) * 0.25),
    apply: (s, e, v) => { refitDurables(s, e, v, ROOM_CATS); return 'Rooms refurnished'; },
  },
  {
    id: 'ac', name: 'Air-condition every room', kind: 'equipment', kinds: ['lodging'], from: 1955, once: true,
    blurb: 'A window unit in every room. Guests pay for a cold room in August; so does the electric bill.', effect: 'Cooling in every room: more draw and higher rates; utilities rise',
    cost: (s, e, v) => Math.round(((s.date.y >= 1968 ? 260 : 160) * DURABLE_SCALE + 12) * rooms(e, v) * L(s)), weeks: () => 3, closes: (e, v) => Math.round(rooms(e, v) * 0.2),
    apply: (s, e, v) => { setDurable(s, e, v, 'aircon', bestOf('aircon', s, ['ac_window', 'ac_ptac'])); return 'Air conditioning in every room'; },
  },
  {
    id: 'tv', name: 'Television in every room', kind: 'technology', kinds: ['lodging'], from: 1952, once: true,
    blurb: '"TV in every room!" on the sign brings families off the Parkway.', effect: 'A set in every room',
    cost: (s, e, v) => Math.round((s.date.y >= 1965 ? 420 : 140) * DURABLE_SCALE * rooms(e, v) * L(s)), weeks: () => 1,
    apply: (s, e, v) => { setDurable(s, e, v, 'tv', bestOf('tv', s, ['tv_bw', 'tv_color', 'tv_cable'])); return 'Television in every room'; },
  },
  {
    id: 'color_tv', name: 'Color television', kind: 'technology', kinds: ['lodging'], from: 1965, once: true,
    needs: (_s, _e, v) => (v.durables.tv && v.durables.tv.item !== 'tv_none' ? undefined : 'Needs television in the rooms first'),
    blurb: 'Bonanza in color. The sign says so.', effect: 'Color sets in every room',
    cost: (s, e, v) => Math.round(420 * DURABLE_SCALE * rooms(e, v) * L(s)), weeks: () => 1,
    apply: (s, e, v) => { setDurable(s, e, v, 'tv', bestOf('tv', s, ['tv_color', 'tv_cable'])); return 'Color television in every room'; },
  },
  {
    id: 'phones', name: 'Telephones in the rooms', kind: 'technology', kinds: ['lodging'], once: true,
    blurb: 'A line in every room through the switchboard (direct dial once Bell offers it).', effect: 'Business travelers notice; a little more desk work',
    cost: (s, e, v) => Math.round(((s.date.y >= 1966 ? 60 : 35) * DURABLE_SCALE + 8) * rooms(e, v) * L(s)), weeks: () => 2,
    apply: (s, e, v) => { setDurable(s, e, v, 'phone', bestOf('phone', s, ['ph_switch', 'ph_direct'])); return 'Telephones in every room'; },
  },
  {
    id: 'remodel', name: 'Remodel rooms into deluxe', kind: 'remodel', kinds: ['lodging'],
    needs: (_s, e, v) => (roomsByType(e, v).room_std >= 4 ? undefined : 'Needs standard rooms to remodel'),
    blurb: 'Bigger beds, a sitting area, a better view: up to ten standard rooms become deluxe.', effect: 'Up to 10 standard rooms → deluxe (higher rate)',
    cost: (s, e, v) => Math.round(180 * Math.min(10, roomsByType(e, v).room_std) * L(s) * styleCost(e, v)), weeks: () => 6,
    closes: (e, v) => Math.min(10, roomsByType(e, v).room_std),
    apply: (_s, e, v) => { const n = convertRooms(e, v, 'room_std', 'room_deluxe', Math.min(10, roomsByType(e, v).room_std)); if (!v.policy.rates.room_deluxe) v.policy.rates.room_deluxe = Math.round((v.policy.rates.room_std ?? 7) * 1.3 * 4) / 4; return `${n} rooms remodeled into deluxe`; },
  },
  {
    id: 'suites', name: 'Knock through for suites', kind: 'remodel', kinds: ['lodging'],
    needs: (_s, e, v) => (roomsByType(e, v).room_std >= 8 ? undefined : 'Needs eight standard rooms'),
    blurb: 'Two rooms become one suite: a sitting room, a bar cart, a honeymoon. Four suites from eight rooms.', effect: '8 standard rooms → 4 suites',
    cost: (s, e, v) => Math.round(450 * 4 * L(s) * styleCost(e, v)), weeks: () => 8, closes: () => 8,
    apply: (_s, e, v) => { const n = convertRooms(e, v, 'room_std', 'suite', 4, 2); if (!v.policy.rates.suite) v.policy.rates.suite = Math.round((v.policy.rates.room_std ?? 7) * 2 * 4) / 4; return `${n} suites made from ${n * 2} rooms`; },
  },
  {
    id: 'wing', name: 'Add a wing (+10 rooms)', kind: 'building', kinds: ['lodging'],
    needs: (_s, e, v) => {
      const a = areaReport(e, v);
      const add = 10 * SPACES.room_std.sqft * (1 + RULES.circulation) / Math.max(1, venueBuilding(e, v)!.stories);
      return a.freeLot >= add && a.footprint + add <= a.lot * RULES.coverage ? undefined : 'No room on the lot for a wing (build up instead)';
    },
    blurb: 'Another row of doors along the parking lot. More rooms for July; more rooms to heat in March.', effect: '+10 standard rooms',
    cost: (s, e, v) => Math.round(900 * 10 * L(s) * styleCost(e, v)), weeks: () => 16,
    apply: (_s, e, v) => { addRooms(e, v, 'room_std', 10); return 'A new wing: ten more rooms'; },
  },
  {
    id: 'floor', name: 'Add a floor', kind: 'building', kinds: ['lodging'],
    needs: (_s, e, v) => {
      const b = venueBuilding(e, v)!;
      const p = e.properties[v.propertyId];
      if (b.stories + 1 > RULES.maxStories[p.zoning]) return `Zoning allows ${RULES.maxStories[p.zoning]} stories`;
      if (b.stories + 1 > RULES.sprinklersAbove && !b.sprinklers) return 'Fire code: install sprinklers first';
      if (b.stories + 1 > RULES.elevatorAbove && !b.elevator) return 'Install an elevator first';
      return undefined;
    },
    blurb: 'Build up: a new story of rooms on top, the same footprint.', effect: '+ one floor of standard rooms',
    cost: (s, e, v) => Math.round(1000 * Math.max(8, Math.ceil(rooms(e, v) / Math.max(1, venueBuilding(e, v)!.stories))) * L(s) * styleCost(e, v)), weeks: () => 20,
    apply: (_s, e, v) => { const n = Math.max(8, Math.ceil(rooms(e, v) / Math.max(1, venueBuilding(e, v)!.stories))); addRooms(e, v, 'room_std', n, true); return `A new floor: ${n} more rooms`; },
  },
  {
    id: 'structural', name: 'Structural repairs', kind: 'structural', kinds: ['lodging', 'food', 'bar', 'club'],
    needs: (_s, e, v) => ((venueBuilding(e, v)?.condition ?? 100) < 90 ? undefined : 'The building is sound'),
    blurb: 'The roof, the pilings, the wiring, the boiler. Nobody sees it; everybody notices when it fails.', effect: 'Building condition +35; fewer breakdowns',
    cost: (s, e, v) => Math.round((400 + 20 * rooms(e, v)) * L(s)), weeks: () => 4, closes: (e, v) => Math.round(rooms(e, v) * 0.3),
    apply: (_s, e, v) => { const b = venueBuilding(e, v)!; b.condition = Math.min(100, b.condition + 35); for (const sp of venueSpaces(e, v)) sp.condition = Math.min(100, sp.condition + 15); return 'Structural repairs: roof, pilings, wiring'; },
  },
  {
    id: 'pool', name: 'Swimming pool', kind: 'amenity', kinds: ['lodging'], once: true,
    needs: (_s, e, v) => (areaReport(e, v).freeLot >= SPACES.pool.sqft ? undefined : 'Not enough open lot for a pool'),
    blurb: 'A kidney-shaped pool with a diving board. Families choose a motel by its pool.', effect: 'Pool department (lifeguards in summer); families and the young crowd come',
    cost: (s) => Math.round(3500 * L(s)), weeks: () => 10,
    apply: (_s, e, v) => { newSpace(e, v, ground(e, v).id, 'pool', 1); return 'A swimming pool'; },
  },
  {
    id: 'dining', name: 'Coffee shop & dining room', kind: 'expansion', kinds: ['lodging', 'bar'], once: true,
    needs: (_s, e, v) => (deptOf(e, v, 'dining') ? 'Already has a dining room' : undefined),
    blurb: 'Breakfast for the guests, dinner for the town. A kitchen, a dining room and the staff for both.', effect: 'Adds dining room (40+ seats) and kitchen departments',
    cost: (s, e, v) => Math.round((4000 + 40 * rooms(e, v)) * L(s) * styleCost(e, v)), weeks: () => 12,
    apply: (_s, e, v) => {
      const g = ground(e, v).id;
      newSpace(e, v, g, 'kitchen', 1);
      newSpace(e, v, g, 'dining', 1, Math.max(40, Math.round(rooms(e, v) * 1.2)));
      v.policy.menuPrice ??= 2.75;
      return 'A coffee shop and dining room';
    },
  },
  {
    id: 'lounge', name: 'Cocktail lounge', kind: 'amenity', kinds: ['lodging', 'food'], once: true,
    needs: (_s, e, v) => (deptOf(e, v, 'bar') ? 'Already has a lounge' : undefined),
    blurb: 'A dark room with a long bar, a piano and a liquor license from the ABC board.', effect: 'Adds a bar department; liquor license fees',
    cost: (s) => Math.round(1900 * L(s)), weeks: () => 8,
    apply: (_s, e, v) => { newSpace(e, v, ground(e, v).id, 'lounge', 1, 30); v.policy.drinkPrice ??= 0.6; return 'A cocktail lounge'; },
  },
  {
    id: 'club', name: 'Nightclub room', kind: 'expansion', kinds: ['lodging', 'bar', 'food'], once: true,
    needs: (_s, e, v) => (deptOf(e, v, 'club') ? 'Already has a club' : deptOf(e, v, 'bar') || deptOf(e, v, 'dining') ? undefined : 'Needs a lounge or a dining room first'),
    blurb: 'A stage, a dance floor, a house band and a headliner on Saturday. The performers are independent adults on contract.', effect: 'Adds a club (120 seats), security; entertainment contracts',
    cost: (s) => Math.round(7000 * L(s)), weeks: () => 14,
    apply: (s, e, v) => {
      newSpace(e, v, ground(e, v).id, 'club', 1, 120);
      addDept(e, v, venueBuilding(e, v)!, 'security');
      v.policy.coverCharge ??= Math.round(1.5 * L(s) * 4) / 4;
      v.policy.entertainment ??= Math.round(250 * L(s));
      return 'A nightclub room';
    },
  },
  {
    id: 'spa', name: 'Health spa & steam room', kind: 'amenity', kinds: ['lodging'], once: true,
    needs: (_s, e, v) => (rooms(e, v) >= 30 ? undefined : 'Needs at least 30 rooms to pay'),
    blurb: 'A steam room, massage tables and a sun deck. Couples and society love it.', effect: 'Adds a spa department',
    cost: (s) => Math.round(5000 * L(s)), weeks: () => 10,
    apply: (_s, e, v) => { const b = venueBuilding(e, v)!; newSpace(e, v, b.floorIds[Math.min(1, b.floorIds.length - 1)], 'spa', 1); return 'A health spa'; },
  },
  {
    id: 'laundry', name: 'In-house laundry', kind: 'equipment', kinds: ['lodging'], once: true,
    needs: (_s, e, v) => (deptOf(e, v, 'laundry') ? 'Already has a laundry' : undefined),
    blurb: 'Washers, a mangle for the sheets, two laundresses. No more paying the linen service by the bundle.', effect: 'Laundry department replaces the linen service',
    cost: (s) => Math.round(900 * L(s)), weeks: () => 4,
    apply: (_s, e, v) => { newSpace(e, v, ground(e, v).id, 'laundry', 1); return 'An in-house laundry'; },
  },
  {
    id: 'parking', name: 'Paved parking', kind: 'amenity', kinds: ['lodging', 'food', 'bar', 'club'], once: true,
    needs: (_s, e, v) => (areaReport(e, v).freeLot >= Math.max(10, rooms(e, v) * 0.8) * SPACES.parking.sqft * 0.5 ? undefined : 'Not enough open lot'),
    blurb: 'Blacktop, painted lines and a sign: PARK FREE. Families arrive by car.', effect: 'Families and business guests like it',
    cost: (s, e, v) => Math.round((300 + 10 * rooms(e, v)) * L(s)), weeks: () => 3,
    apply: (_s, e, v) => { newSpace(e, v, ground(e, v).id, 'parking', Math.max(10, Math.round(rooms(e, v) * 0.8))); return 'Paved parking'; },
  },
  {
    id: 'sprinklers', name: 'Fire sprinklers & alarms', kind: 'safety', kinds: ['lodging', 'food', 'bar', 'club'], once: true,
    needs: (_s, e, v) => (venueBuilding(e, v)?.sprinklers ? 'Already fitted' : undefined),
    blurb: 'Sprinkler heads in every room and a pull station on every floor. Required above three stories; the insurer gives a discount.', effect: 'Insurance −25%; allows a fourth story',
    cost: (s, e, v) => Math.round((600 + 15 * rooms(e, v)) * L(s)), weeks: () => 6,
    apply: (_s, e, v) => { venueBuilding(e, v)!.sprinklers = true; return 'Fire sprinklers and alarms'; },
  },
  {
    id: 'elevator', name: 'Passenger elevator', kind: 'access', kinds: ['lodging'], once: true,
    needs: (_s, e, v) => (venueBuilding(e, v)?.elevator ? 'Already has one' : (venueBuilding(e, v)?.stories ?? 1) < 2 ? 'Needs a second story' : undefined),
    blurb: 'An Otis car with a brass gate. Required above three stories; older guests notice it at two.', effect: 'Allows taller buildings; a little draw with business and society guests',
    cost: (s) => Math.round(3500 * L(s)), weeks: () => 12,
    apply: (_s, e, v) => { venueBuilding(e, v)!.elevator = true; return 'A passenger elevator'; },
  },
  {
    id: 'ramps', name: 'Ramps & wide doors', kind: 'access', kinds: ['lodging', 'food', 'bar', 'club'], from: 1968, once: true,
    needs: (_s, e, v) => (venueBuilding(e, v)?.ramps ? 'Already done' : undefined),
    blurb: 'A ramp at the entrance and wider doors on the ground floor. The barrier-free code will require it on new work.', effect: 'Code compliance; a little draw with older guests',
    cost: (s, e, v) => Math.round((350 + 4 * rooms(e, v)) * L(s)), weeks: () => 3,
    apply: (_s, e, v) => { venueBuilding(e, v)!.ramps = true; return 'Ramps and wide doors'; },
  },
  {
    id: 'insulation', name: 'Storm windows & insulation', kind: 'energy', kinds: ['lodging', 'food', 'bar', 'club'], once: true,
    blurb: 'Storm windows, weatherstripping and insulation in the attic. Cheaper heat in the shoulder season; cheaper cooling in August.', effect: 'Utilities −20%',
    cost: (s, e, v) => Math.round((200 + 10 * rooms(e, v)) * L(s)), weeks: () => 4,
    apply: () => 'Storm windows and insulation',
  },
  {
    id: 'keycards', name: 'Electronic key cards', kind: 'technology', kinds: ['lodging'], from: 1979, once: true,
    blurb: 'A plastic card instead of a brass key. No more re-keying a room when a guest walks off with one.', effect: 'Front desk −10% work; business guests notice',
    cost: (s, e, v) => Math.round(30 * rooms(e, v) * L(s)), weeks: () => 2,
    apply: () => 'Electronic key cards',
  },
  {
    id: 'to_boutique', name: 'Convert to a boutique hotel', kind: 'conversion', kinds: ['lodging'], from: 1960,
    needs: (_s, e, v) => (v.concept === 'boutique' ? 'Already a boutique hotel' : v.concept === 'luxury_resort' ? 'A resort does not step down to a boutique' : rooms(e, v) < 16 ? 'Needs 16 rooms or more' : !deptOf(e, v, 'dining') ? 'Needs a dining room first (Coffee shop & dining room)' : undefined),
    blurb: 'Every room redone by a decorator, premium linen, a maître d\', turn-down service. The rates go up with it.', effect: 'Concept → boutique: premium supplies, spotless housekeeping, laundry and marketing departments, deluxe rooms and suites',
    cost: (s, e, v) => durablesCost(s, e, v, ROOM_CATS, 2) + Math.round(300 * rooms(e, v) * L(s) * styleCost(e, v)), weeks: () => 10, closes: (e, v) => rooms(e, v),
    apply: (s, e, v) => {
      convert(s, e, v, 'boutique');
      const r = roomsByType(e, v);
      const n = rooms(e, v);
      if (r.room_deluxe < n * 0.3) convertRooms(e, v, 'room_std', 'room_deluxe', Math.round(n * 0.3 - r.room_deluxe));
      if (roomsByType(e, v).suite < 2 && roomsByType(e, v).room_std >= 4) convertRooms(e, v, 'room_std', 'suite', 2, 2);
      for (const cat of ROOM_CATS) v.policy.supplies[cat] = itemAtTier(cat, 2, s.date.y)?.id ?? v.policy.supplies[cat];
      refitDurables(s, e, v, ROOM_CATS);
      return 'Converted to a boutique hotel';
    },
  },
  {
    id: 'to_resort', name: 'Convert to a luxury resort', kind: 'conversion', kinds: ['lodging'], from: 1960,
    needs: (_s, e, v) => (v.concept === 'luxury_resort' ? 'Already a resort' : rooms(e, v) < 60 ? 'Needs 60 rooms or more' : !deptOf(e, v, 'dining') ? 'Needs a dining room' : !v.amenities.includes('pool') ? 'Needs a pool' : undefined),
    blurb: 'Marble, a doorman, a supper club, valets in red jackets. Large capital, large staff, the society pages.', effect: 'Concept → luxury resort: luxury supplies, admin, bar, security, marketing and parking departments',
    cost: (s, e, v) => durablesCost(s, e, v, ROOM_CATS, 3) + Math.round(1200 * rooms(e, v) * L(s) * styleCost(e, v)), weeks: () => 26, closes: (e, v) => rooms(e, v),
    apply: (s, e, v) => {
      convert(s, e, v, 'luxury_resort');
      const b = venueBuilding(e, v)!;
      if (!deptOf(e, v, 'bar')) newSpace(e, v, b.floorIds[0], 'lounge', 1, 40);
      addDept(e, v, b, 'parking');
      for (const cat of ROOM_CATS) v.policy.supplies[cat] = itemAtTier(cat, 3, s.date.y)?.id ?? v.policy.supplies[cat];
      refitDurables(s, e, v, ROOM_CATS);
      return 'Converted to a luxury resort';
    },
  },
  {
    id: 'to_hourly', name: 'Convert to hourly stays', kind: 'conversion', kinds: ['lodging'],
    needs: (_s, _e, v) => (v.concept === 'hourly_motel' ? 'Already hourly' : v.concept === 'luxury_resort' || v.concept === 'boutique' ? 'Not with this clientele' : undefined),
    blurb: 'Rooms by the stay, a window for cash, a night man. Business-level: more turnover, more laundry, more wear, a license at risk and a vice-squad eye.', effect: 'Concept → hourly-stay motel (local heat; families stay away)',
    cost: (s, e, v) => Math.round(60 * rooms(e, v) * L(s)), weeks: () => 4, closes: (e, v) => Math.round(rooms(e, v) * 0.5),
    apply: (s, e, v) => { convert(s, e, v, 'hourly_motel'); convertRooms(e, v, 'room_std', 'room_hourly', Math.round(rooms(e, v) * 0.75)); convertRooms(e, v, 'room_deluxe', 'room_hourly', roomsByType(e, v).room_deluxe); return 'Converted to hourly stays'; },
  },
  {
    id: 'to_budget', name: 'Convert to a family motel', kind: 'conversion', kinds: ['lodging'],
    needs: (_s, _e, v) => (v.concept === 'budget_motel' ? 'Already a family motel' : undefined),
    blurb: 'Back to basics: nightly rates, families, a clean pool.', effect: 'Concept → budget motel',
    cost: (s, e, v) => Math.round(40 * rooms(e, v) * L(s)), weeks: () => 3, closes: (e, v) => Math.round(rooms(e, v) * 0.3),
    apply: (s, e, v) => { convertRooms(e, v, 'room_hourly', 'room_std', roomsByType(e, v).room_hourly); convert(s, e, v, 'budget_motel'); return 'Converted to a family motel'; },
  },
];

export const PROJECTS_BY_ID: Record<string, ProjectDef> = Object.fromEntries(PROJECTS.map((p) => [p.id, p]));

export interface ProjectOption {
  def: ProjectDef;
  cost: number;
  weeks: number;
  closes: number;
  why?: string;
}

/** What can be done to this venue now (with the reason when it cannot). */
export function projectOptions(s: GameState, e: EmpireState, v: Venue, param?: string): ProjectOption[] {
  const kind = CONCEPTS[v.concept].kind;
  const y = s.date.y;
  const busy = Object.values(e.projects).filter((p) => p.venueId === v.id && p.status !== 'done');
  return PROJECTS.filter((d) => d.kinds.includes(kind)).map((d) => {
    let why: string | undefined;
    if ((d.from ?? 0) > y) why = `Not available until ${d.from}`;
    else if ((d.to ?? 9999) < y) why = 'No longer done';
    else if (d.once && (v.amenities.includes(d.id) || busy.some((p) => p.defId === d.id))) why = v.amenities.includes(d.id) ? 'Done' : 'Under way';
    else if (busy.some((p) => p.defId === d.id)) why = 'Under way';
    else if (busy.length >= 2) why = 'Two projects already under way';
    else why = d.needs?.(s, e, v);
    return { def: d, cost: d.cost(s, e, v, param), weeks: d.weeks(e, v), closes: d.closes?.(e, v) ?? 0, why };
  });
}

/** Has this amenity been built (pool, ac ...)? */
export function hasAmenity(v: Venue, id: string): boolean {
  return has(v, id);
}

export { storiesFor };
