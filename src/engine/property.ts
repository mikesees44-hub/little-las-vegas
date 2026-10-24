import { isInSeason } from './calendar';
import { CATALOG } from './catalog';
import { eid, STAGES, type EconState, type Lot, type StageId, type ZoneId } from './econState';
import { chance, pick, randInt } from './rng';
import type { BusinessKind, FactionId, GameState } from './types';

/**
 * Property on the map. Each district (and Atlantic City, West Wildwood and
 * South Philadelphia) is split into lots: vacant land, buildings for sale
 * (some with a going concern inside), storefronts to lease, places held
 * privately and places a rival already owns.
 *
 * Buying land and building on it runs through visible stages (purchase →
 * permits → site prep → foundation → framing → exterior → interior → open).
 * Buildings last for decades: they age, get renovated, pass to the heir with
 * the rest of the house, get sold, or get bought out by a rival.
 *
 * Economics are ChatGPT's sample table scaled to 1960 dollars (÷11, monthly →
 * weekly, a little richer to match the game's pace). Uses that are also a
 * catalog business (a motel, a club, a deli ...) become a real Business when
 * they open and run through the normal business pipeline.
 */

export type UseCat = 'boardwalk' | 'services' | 'music' | 'realestate' | 'industrial' | 'food';

export interface PropertyUse {
  id: string;
  name: string;
  cat: UseCat;
  /** Building cost (not the land). */
  cost: number;
  /** Weeks from permits to opening. */
  weeks: number;
  /** Weekly revenue and expenses in an average week. */
  rev: number;
  exp: number;
  seasonal: boolean;
  /** Dirty money it can wash a week. */
  launder: number;
  /** Becomes this catalog business when it opens. */
  biz?: BusinessKind;
  zones?: ZoneId[];
  minYear?: number;
}

const U = (id: string, name: string, cat: UseCat, cost: number, weeks: number, rev: number, exp: number, seasonal: boolean, launder: number, extra: Partial<PropertyUse> = {}): PropertyUse =>
  ({ id, name, cat, cost, weeks, rev, exp, seasonal, launder, ...extra });

/** A use that becomes a catalog business: building one costs a third more than buying one. */
const B = (id: string, cat: UseCat, biz: BusinessKind, weeks: number, extra: Partial<PropertyUse> = {}): PropertyUse => {
  const d = CATALOG[biz];
  return U(id, d.name, cat, Math.round(d.cost * 1.3 / 100) * 100, weeks, 0, 0, d.season[1] < 0.7, 0, { biz, minYear: d.minYear, ...extra });
};

export const USES: PropertyUse[] = [
  // Boardwalk
  U('tshirt', 'T-shirt & novelty shop', 'boardwalk', 6800, 9, 530, 360, true, 250),
  U('souvenir', 'Souvenir shop', 'boardwalk', 4500, 8, 360, 250, true, 200),
  B('arcade', 'boardwalk', 'arcade', 10),
  B('stand', 'boardwalk', 'stand', 6),
  U('minigolf', 'Miniature golf', 'boardwalk', 5000, 10, 380, 230, true, 200),
  U('beachrental', 'Beach chair & umbrella rental', 'boardwalk', 1800, 4, 170, 100, true, 100),
  U('surf', 'Surf shop', 'boardwalk', 3500, 8, 250, 180, true, 150, { minYear: 1962 }),
  U('bikes', 'Bike rental', 'boardwalk', 2200, 5, 190, 120, true, 100),
  B('pizza', 'boardwalk', 'pizza', 8),
  U('giftshop', 'Gift shop', 'boardwalk', 4000, 8, 300, 210, true, 150),
  U('ride', 'Pier ride', 'boardwalk', 9000, 14, 700, 430, true, 300, { zones: ['piers', 'boardwalk', 'north', 'ac'] }),
  U('funhouse', 'Funhouse', 'boardwalk', 7500, 13, 560, 350, true, 250, { zones: ['piers', 'boardwalk', 'north', 'ac'] }),
  U('photo', 'Boardwalk photo studio', 'boardwalk', 2500, 6, 200, 130, true, 100),
  B('motel', 'boardwalk', 'motel', 30),
  B('boarding', 'boardwalk', 'boarding', 16),
  U('icecream', 'Ice cream parlor', 'boardwalk', 5500, 9, 440, 290, true, 200),
  // Services
  U('barber', 'Barbershop', 'services', 2000, 6, 120, 75, false, 150),
  U('salon', 'Beauty salon', 'services', 2500, 6, 140, 90, false, 150),
  B('laundromat', 'services', 'laundromat', 8),
  U('drycleaner', 'Dry cleaner', 'services', 3500, 8, 170, 110, false, 300),
  U('shoerepair', 'Shoe repair', 'services', 1500, 5, 80, 50, false, 80),
  U('tailor', 'Tailor shop', 'services', 1800, 5, 95, 60, false, 100),
  U('hardware', 'Hardware store', 'services', 6000, 10, 290, 200, false, 250),
  U('pharmacy', 'Pharmacy & soda fountain', 'services', 7000, 12, 340, 240, false, 300),
  U('florist', 'Florist', 'services', 2500, 6, 140, 95, false, 120),
  U('funeral', 'Funeral home', 'services', 9000, 16, 360, 220, false, 600),
  U('carwash', 'Car wash', 'services', 4500, 9, 260, 160, true, 500),
  U('gas', 'Gas station', 'services', 6500, 12, 300, 210, false, 250),
  B('garage', 'services', 'towing', 10),
  B('taxigarage', 'services', 'taxi', 10),
  U('printer', 'Print shop', 'services', 4000, 9, 190, 130, false, 200),
  U('furniture', 'Furniture store', 'services', 7000, 12, 300, 215, false, 300),
  U('appliances', 'Appliance store', 'services', 7500, 12, 320, 230, false, 300),
  U('bookstore', 'Bookstore & newsstand', 'services', 3000, 7, 140, 100, false, 150),
  B('pawnshop', 'services', 'pawn', 8),
  U('pets', 'Pet supply', 'services', 2500, 6, 120, 85, false, 100),
  // Music & entertainment
  B('studio', 'music', 'label', 14),
  U('rehearsal', 'Rehearsal studio', 'music', 3000, 8, 140, 90, false, 100),
  U('records', 'Record store', 'music', 4000, 9, 230, 160, true, 150),
  U('instruments', 'Music store', 'music', 8200, 13, 320, 260, false, 200),
  U('concerthall', 'Concert hall', 'music', 30000, 35, 1300, 900, true, 900),
  U('cinema', 'Movie theater', 'music', 18000, 26, 700, 470, true, 500),
  U('radio', 'AM radio station', 'music', 25000, 30, 800, 560, false, 400),
  U('comedy', 'Comedy club', 'music', 6000, 12, 380, 260, true, 250),
  B('jazzclub', 'music', 'club', 16),
  B('supper', 'music', 'supperclub', 22),
  B('agency', 'music', 'talent', 6),
  B('burlesque', 'music', 'burlesque', 16),
  B('gents', 'music', 'gentsclub', 26),
  B('hoodclub', 'music', 'hoodclub', 10),
  B('grindhouse', 'music', 'adulttheater', 18),
  // Real estate
  U('house', 'Single-family rental', 'realestate', 9000, 17, 75, 25, false, 50),
  U('duplex', 'Duplex', 'realestate', 13000, 20, 125, 45, false, 80),
  U('apartments', 'Apartment complex', 'realestate', 80000, 52, 1100, 500, false, 600),
  U('rooming', 'Rooming house', 'realestate', 12000, 18, 240, 120, true, 150),
  U('boardinghouse', 'Boarding house', 'realestate', 16800, 22, 290, 130, false, 150),
  U('flophouse', 'Flophouse', 'realestate', 10900, 17, 220, 115, false, 150),
  U('hotel', 'Oceanfront hotel', 'realestate', 120000, 78, 4200, 2900, true, 3000, { zones: ['boardwalk', 'crest', 'north', 'ac'] }),
  U('condo', 'Condominium building', 'realestate', 60000, 52, 900, 420, true, 400, { minYear: 1970 }),
  U('storefront', 'Storefront block', 'realestate', 15000, 20, 260, 110, false, 200),
  U('office', 'Office building', 'realestate', 30000, 35, 480, 230, false, 300),
  U('warehouse', 'Warehouse', 'realestate', 9000, 14, 160, 60, false, 300),
  U('marina', 'Marina', 'realestate', 25000, 30, 900, 560, true, 400, { zones: ['docks', 'westww', 'north', 'crest'] }),
  U('cottage', 'Vacation rental cottage', 'realestate', 8000, 13, 190, 70, true, 80),
  U('mall', 'Shopping center', 'realestate', 90000, 60, 1600, 900, false, 900, { minYear: 1962 }),
  // Industrial
  B('truckyard', 'industrial', 'trucking', 14),
  B('contractor', 'industrial', 'construction', 14),
  U('concrete', 'Concrete plant', 'industrial', 20000, 26, 600, 400, false, 700),
  B('carting', 'industrial', 'waste', 14),
  U('commlaundry', 'Commercial laundry', 'industrial', 9000, 14, 330, 220, false, 900),
  U('beverage', 'Beverage distributor', 'industrial', 15000, 20, 520, 360, true, 700),
  U('wholesale', 'Food wholesaler', 'industrial', 14000, 20, 480, 340, false, 600),
  U('printplant', 'Printing plant', 'industrial', 18000, 26, 470, 330, false, 500),
  U('machineshop', 'Machine shop', 'industrial', 9000, 14, 250, 170, false, 200),
  U('dockwh', 'Dock warehouse', 'industrial', 12000, 18, 260, 110, false, 400, { zones: ['docks', 'ac', 'sphilly', 'causeway'] }),
  U('delivery', 'Delivery company', 'industrial', 5000, 9, 230, 160, false, 300),
  B('vendroute', 'industrial', 'vending', 8),
  // Food
  B('deli', 'food', 'deli', 6),
  B('trattoria', 'food', 'restaurant', 12),
  U('diner', 'Diner', 'food', 5000, 10, 300, 210, false, 250),
  U('bakery', 'Italian bakery', 'food', 3000, 7, 170, 110, false, 150),
];

export const USES_BY_ID: Record<string, PropertyUse> = Object.fromEntries(USES.map((u) => [u.id, u]));

export const USE_CAT_LABEL: Record<UseCat, string> = {
  boardwalk: 'Boardwalk', services: 'Services', music: 'Music & nightlife', realestate: 'Real estate', industrial: 'Industrial', food: 'Food',
};

export interface ZoneInfo {
  id: ZoneId;
  name: string;
  /** Game district it belongs to (influence, rival presence), if on the island. */
  district?: string;
  /** Land values relative to Downtown Wildwood. */
  land: number;
  /** [in season, off-season] demand for seasonal places (averages ≈1 over the year). */
  season: [number, number];
  cats: UseCat[];
  streets: string[];
  /** Who already owns pieces of it. */
  rival?: FactionId;
}

export const ZONES: ZoneInfo[] = [
  { id: 'boardwalk', name: 'The Boardwalk', district: 'boardwalk', land: 1.5, season: [2.6, 0.35], cats: ['boardwalk', 'food'], streets: ['Boardwalk at Schellenger', 'Boardwalk at Cedar', 'Boardwalk at Oak', 'Boardwalk at Wildwood Ave', 'Boardwalk at Spencer'] },
  { id: 'pacific', name: 'Pacific Avenue', district: 'pacific', land: 1.4, season: [2.0, 0.6], cats: ['music', 'food', 'services'], streets: ['Pacific Ave', 'Pacific Ave', 'Atlantic Ave', 'Spicer Ave'] },
  { id: 'piers', name: 'The Piers', district: 'piers', land: 1.3, season: [2.6, 0.35], cats: ['boardwalk'], streets: ['Hunt\'s Pier', 'Marine Pier', 'Casino Pier', 'Sportland Pier'] },
  { id: 'downtown', name: 'Downtown Wildwood', district: 'downtown', land: 1.0, season: [1.4, 0.85], cats: ['services', 'food', 'realestate'], streets: ['Rio Grande Ave', 'New Jersey Ave', 'Oak Ave', 'Magnolia Ave'] },
  { id: 'docks', name: 'The Bay Docks', district: 'docks', land: 0.7, season: [1.3, 0.9], cats: ['industrial', 'realestate'], streets: ['Park Blvd', 'Susquehanna Ave', 'Bayside Dr', 'Otten\'s Harbor'] },
  { id: 'crest', name: 'Wildwood Crest', district: 'crest', land: 1.2, season: [2.3, 0.45], cats: ['realestate', 'boardwalk', 'food'], streets: ['Ocean Ave', 'Atlantic Ave', 'Rambler Rd', 'Heather Rd'] },
  { id: 'north', name: 'North Wildwood', district: 'north', land: 1.1, season: [2.2, 0.5], cats: ['music', 'boardwalk', 'realestate'], streets: ['Olde New Jersey Ave', 'Atlantic Ave', 'Spruce Ave', 'Anglesea Dr'], rival: 'kessler' },
  { id: 'causeway', name: 'Rio Grande & the Causeway', district: 'causeway', land: 0.6, season: [1.5, 0.8], cats: ['industrial', 'services'], streets: ['Route 47', 'Rio Grande Blvd', 'Railroad Ave'] },
  { id: 'westww', name: 'West Wildwood', land: 0.6, season: [1.8, 0.7], cats: ['realestate', 'industrial'], streets: ['Glenwood Ave', 'West Magnolia Ave', 'Bayview Ave'] },
  { id: 'ac', name: 'Atlantic City', land: 1.6, season: [1.5, 0.8], cats: ['music', 'realestate', 'boardwalk'], streets: ['Pacific Ave', 'Atlantic Ave', 'Kentucky Ave', 'Missouri Ave'], rival: 'manno' },
  { id: 'sphilly', name: 'South Philadelphia', land: 0.9, season: [1.0, 1.0], cats: ['food', 'services', 'industrial', 'realestate'], streets: ['Passyunk Ave', '9th St', 'Christian St', 'Snyder Ave', 'Oregon Ave'], rival: 'philly' },
];
export const ZONES_BY_ID = Object.fromEntries(ZONES.map((z) => [z.id, z])) as Record<ZoneId, ZoneInfo>;

export const LOTS_PER_ZONE = 8;

/** Seasonal demand multiplier for a zone this week (1 for year-round places). */
export function zoneSeason(zone: ZoneId, inSeason: boolean, seasonal = true): number {
  if (!seasonal) return 1;
  const z = ZONES_BY_ID[zone];
  return inSeason ? z.season[0] : z.season[1];
}

/**
 * The mild district tilt on catalog businesses: a seasonal place does a little
 * better where the summer crowd goes, a little worse where it doesn't (±8%).
 */
export function districtTilt(districtId: string, inSeason: boolean, kindSeasonal: boolean): number {
  if (!kindSeasonal) return 1;
  const z = ZONES.find((x) => x.district === districtId);
  if (!z) return 1;
  const t = inSeason ? z.season[0] / 2.1 : z.season[1] / 0.55;
  return Math.max(0.92, Math.min(1.08, t));
}

/* ---------------- construction ---------------- */

export const BUILD_STAGES: StageId[] = ['permits', 'siteprep', 'foundation', 'framing', 'exterior', 'interior'];
const STAGE_SHARE: Record<string, number> = { permits: 0.15, siteprep: 0.1, foundation: 0.15, framing: 0.2, exterior: 0.2, interior: 0.2 };
/** Share of the building cost paid when each stage starts. */
export const STAGE_COST: Record<string, number> = { permits: 0.05, siteprep: 0.1, foundation: 0.2, framing: 0.25, exterior: 0.2, interior: 0.2 };
export const STAGE_LABEL: Record<StageId, string> = {
  purchase: 'Purchased', permits: 'Survey & permits', siteprep: 'Site prep', foundation: 'Foundation', framing: 'Framing', exterior: 'Exterior', interior: 'Interior', open: 'Open',
};

/** Weeks for each build stage; they always add up to the total. */
export function stageWeeks(total: number): Record<string, number> {
  const out: Record<string, number> = {};
  let used = 0;
  for (const st of BUILD_STAGES) {
    out[st] = Math.max(1, Math.round(total * STAGE_SHARE[st]));
    used += out[st];
  }
  // Interior absorbs the rounding (never below 1).
  out.interior = Math.max(1, out.interior + (Math.max(BUILD_STAGES.length, total) - used));
  return out;
}

/** Weeks to build this use on this lot (a fit-out on a leased storefront is half). */
export function buildWeeks(lot: Lot, use: PropertyUse): number {
  return lot.status === 'leased' ? Math.max(BUILD_STAGES.length, Math.ceil(use.weeks / 2)) : Math.max(BUILD_STAGES.length, use.weeks);
}

/** Building cost (fit-out on a lease costs half). */
export function buildCost(lot: Lot, use: PropertyUse): number {
  return Math.round((lot.status === 'leased' ? use.cost * 0.5 : use.cost) * Math.max(0.8, ZONES_BY_ID[lot.zone].land));
}

export function underConstruction(lot: Lot): boolean {
  return !!lot.stage && lot.stage !== 'purchase' && lot.stage !== 'open';
}

export function stageIndex(lot: Lot): number {
  return lot.stage ? STAGES.indexOf(lot.stage) : -1;
}

/* ---------------- economics ---------------- */

/** Weekly net of a standing property you run (not a catalog business). Pure. */
export function propertyNet(s: GameState, lot: Lot, mgrMult = 1): { rev: number; exp: number } {
  const u = lot.use ? USES_BY_ID[lot.use] : undefined;
  if (!u || u.biz) return { rev: 0, exp: 0 };
  const inS = isInSeason(s.date);
  const cond = 0.6 + 0.4 * (lot.condition / 100);
  const reno = lot.renovated ? 1.1 : 1;
  const infl = inflation(s);
  const rev = Math.round(u.rev * zoneSeason(lot.zone, inS, u.seasonal) * cond * reno * mgrMult * infl);
  const exp = Math.round(u.exp * (u.seasonal && !inS ? 0.6 : 1) * infl);
  return { rev, exp };
}

/** What a tenant pays you when you own only the building. */
export function tenantRent(s: GameState, lot: Lot): number {
  const u = lot.use ? USES_BY_ID[lot.use] : undefined;
  if (!u) return 0;
  const net = u.biz ? CATALOG[u.biz].base * 0.8 : u.rev - u.exp;
  return Math.max(15, Math.round(net * 0.35 * inflation(s)));
}

/** Prices and rents creep up about 3% a year. */
export function inflation(s: GameState): number {
  return 1.03 ** Math.max(0, s.date.y - 1960);
}

/** Dirty money the buildings you run can wash a week. */
export function propertyWash(s: GameState): number {
  const e = s.econ;
  if (!e) return 0;
  let cap = 0;
  for (const l of e.lots) {
    if ((l.status !== 'owned' && l.status !== 'leased') || l.stage !== 'open' || !l.use || l.bizId) continue;
    if (l.tenant && !l.operating) continue;
    cap += USES_BY_ID[l.use]?.launder ?? 0;
  }
  return Math.round(cap);
}

/* ---------------- the market ---------------- */

function usesFor(z: ZoneInfo, year: number): PropertyUse[] {
  return USES.filter((u) => (u.minYear ?? 0) <= year && (u.zones ? u.zones.includes(z.id) : z.cats.includes(u.cat)) && u.cost <= 40000);
}

const OWNER_NAMES = ['Gus Papadakis', 'the Morey brothers', 'Abe Kaplan', 'the Sorensen family', 'Vince DiNardo', 'Mrs. Hallahan', 'the Kovacs family', 'Sid Weintraub', 'Lou Castellano', 'the Brennan estate', 'Joe Pirelli', 'Harry Lenz'];

/** Lays out the lots of every zone (once, at the start). */
export function generateLots(s: GameState, e: EconState): void {
  for (const z of ZONES) {
    for (let i = 0; i < LOTS_PER_ZONE; i++) e.lots.push(newLot(s, e, z, i));
  }
}

export function newLot(s: GameState, e: EconState, z: ZoneInfo, idx: number): Lot {
  const num = randInt(e, 1, 38) * 100 + randInt(e, 0, 1) * 2 + 1;
  const street = pick(e, z.streets);
  const address = street.startsWith('Boardwalk') || street.endsWith('Pier') || street.includes('Harbor') ? `${street} (lot ${idx + 1})` : `${num} ${street}`;
  const land = Math.round(1500 * z.land * (0.8 + 0.4 * randInt(e, 0, 100) / 100) * inflation(s) / 50) * 50;
  const roll = randInt(e, 0, 99);
  const lot: Lot = { id: eid(e, 'lot'), zone: z.id, idx, address, status: 'sale', owner: 'private', price: land, rent: 0, condition: 100 };
  const uses = usesFor(z, s.date.y);
  const someUse = () => pick(e, uses);
  if (roll < 25) {
    // Vacant land for sale.
    return lot;
  }
  const u = someUse();
  lot.use = u.id;
  lot.stage = 'open';
  lot.builtYear = s.date.y - randInt(e, 2, 40);
  lot.condition = randInt(e, 45, 95);
  const bldg = Math.round(u.cost * z.land * 0.85 * (0.6 + 0.4 * lot.condition / 100) * inflation(s) / 50) * 50;
  if (roll < 55) {
    // A building for sale; most with a going concern inside.
    lot.price = land + bldg;
    if (chance(e, 0.6)) lot.tenant = `${pick(e, OWNER_NAMES)}'s ${u.name.toLowerCase()}`;
    lot.rent = tenantRent(s, lot);
  } else if (roll < 70) {
    // An empty storefront to lease.
    lot.status = 'lease';
    lot.use = undefined;
    lot.stage = undefined;
    lot.rent = Math.max(15, Math.round(land * 0.006));
    lot.price = 0;
  } else if (roll < 90 || !z.rival) {
    lot.status = 'private';
    lot.price = land + bldg;
    lot.tenant = `${pick(e, OWNER_NAMES)}'s ${u.name.toLowerCase()}`;
  } else {
    lot.status = 'rival';
    lot.owner = z.rival;
    lot.price = land + bldg;
    lot.tenant = `a ${u.name.toLowerCase()} (rival-owned)`;
  }
  return lot;
}

/** Goodwill: what a going concern costs on top of the building. */
export function goodwill(s: GameState, lot: Lot): number {
  const u = lot.use ? USES_BY_ID[lot.use] : undefined;
  if (!u || !lot.tenant) return 0;
  const net = u.biz ? CATALOG[u.biz].base * 1.2 : u.rev - u.exp;
  return Math.round(net * 20 * inflation(s) / 50) * 50;
}

export function lotName(lot: Lot): string {
  const u = lot.use ? USES_BY_ID[lot.use] : undefined;
  return u ? `${u.name}, ${lot.address}` : `Lot at ${lot.address}`;
}

export function lotsIn(s: GameState, zone: ZoneId): Lot[] {
  return (s.econ?.lots ?? []).filter((l) => l.zone === zone);
}

export function ownedLots(s: GameState): Lot[] {
  return (s.econ?.lots ?? []).filter((l) => l.status === 'owned' || l.status === 'leased');
}
