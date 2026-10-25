import type { BuildStyle } from './design';
import type { ZoneId } from './econState';
import type { ConceptId, DeptKind, Housekeeping, RoomType, SpaceType, SupplyGroup } from './empireState';

/**
 * Static data for the Empire Designer: business concepts (Module 2/7),
 * departments (Module 4/6), space types (Module 3), guest segments (Module 9)
 * and suppliers (Module 5). 1960 dollars; `inflation()` scales them later.
 */

export type ConceptKind = 'lodging' | 'food' | 'bar' | 'club';

export interface ConceptDef {
  id: ConceptId;
  name: string;
  kind: ConceptKind;
  blurb: string;
  /** What running it is like (shown in the concept picker). */
  ops: string;
  /** Peak nightly rates by room type (hourly rooms: a short stay). */
  rates: Partial<Record<RoomType, number>>;
  /** Departments it must have, and the ones it may add. */
  depts: DeptKind[];
  optional: DeptKind[];
  /** Default supply tier (0 economy .. 3 luxury) and housekeeping. */
  tier: number;
  housekeeping: Housekeeping;
  /** Weekly licensing (hotel license, liquor, cabaret), 1960 dollars. */
  license: number;
  /** Local heat a week (an hourly motel draws the vice squad's eye). */
  heat: number;
  /** Guests a room turns over a day (hourly motels turn rooms). */
  turns: number;
  /** Utility for each guest segment: who comes, who stays away. */
  fit: Partial<Record<SegmentId, number>>;
  minYear?: number;
  /** Conversion prerequisites (as a reason string, or undefined if met), checked by the project. */
  minRooms?: number;
}

export const CONCEPTS: Record<ConceptId, ConceptDef> = {
  budget_motel: {
    id: 'budget_motel', name: 'Budget motel', kind: 'lodging',
    blurb: 'A neon sign, a kidney pool if you are lucky, rooms by the night. Families from Philadelphia who count every dollar.',
    ops: 'Low overhead, basic amenities, price-sensitive guests. Full in July, a tomb in February.',
    rates: { room_std: 7, room_deluxe: 9, suite: 13 }, depts: ['front', 'housekeeping', 'maintenance'], optional: ['laundry', 'pool', 'dining', 'bar', 'security', 'marketing', 'parking'],
    tier: 1, housekeeping: 'standard', license: 2, heat: 0, turns: 1, fit: { luxury: -2.2, couples: -0.3 },
  },
  hourly_motel: {
    id: 'hourly_motel', name: 'Hourly-stay motel', kind: 'lodging',
    blurb: 'Rooms by the stay, cash at the window, no questions. Business-level and discreet: the game tracks money, wear and heat, nothing else.',
    ops: 'Short stays and high turnover: more laundry, more wear, a night man at the desk, a license the councilman can pull, and a reputation families steer around.',
    rates: { room_hourly: 3.5, room_std: 6 }, depts: ['front', 'housekeeping', 'laundry', 'maintenance', 'security'], optional: ['marketing', 'parking'],
    tier: 0, housekeeping: 'basic', license: 6, heat: 0.15, turns: 2.4, fit: { family: -3, couples: -1.2, business: -1, luxury: -3, young: -0.4 },
  },
  rooming: {
    id: 'rooming', name: 'Rooming house', kind: 'lodging',
    blurb: 'Summer workers by the week: busboys, ride jockeys, lifeguards. Rent in cash on Friday.',
    ops: 'Cheapest to run. Long stays mean little laundry, but the guests are rough on the rooms.',
    rates: { room_std: 4 }, depts: ['housekeeping', 'maintenance'], optional: ['front', 'laundry', 'security'],
    tier: 0, housekeeping: 'basic', license: 1, heat: 0.02, turns: 0.5, fit: { young: 0.5, family: -0.8, couples: -1.5, business: -0.8, luxury: -3 },
  },
  boutique: {
    id: 'boutique', name: 'Boutique hotel', kind: 'lodging',
    blurb: 'Every room different, a lobby people photograph, a dining room the Inquirer writes about.',
    ops: 'Personalized service and design-led rooms at premium rates. Needs better staff, better linen and a restaurant to justify the price.',
    rates: { room_std: 11, room_deluxe: 14, suite: 22 }, depts: ['front', 'housekeeping', 'laundry', 'maintenance', 'dining', 'kitchen', 'marketing'], optional: ['bar', 'pool', 'spa', 'security', 'parking', 'club'],
    tier: 2, housekeeping: 'spotless', license: 5, heat: 0, turns: 1, fit: { couples: 0.6, luxury: 0.3, business: 0.25, family: -0.3, young: -0.2 }, minRooms: 16,
  },
  luxury_resort: {
    id: 'luxury_resort', name: 'Luxury resort', kind: 'lodging',
    blurb: 'Premium suites, a supper club, a pool deck, a spa, a doorman who remembers your name. Large capital, large staff, large reputation.',
    ops: 'High service standards across many departments sharing one property. Everything has to be right, all the time.',
    rates: { room_std: 14, room_deluxe: 18, suite: 32 }, depts: ['admin', 'front', 'housekeeping', 'laundry', 'maintenance', 'dining', 'kitchen', 'bar', 'pool', 'security', 'marketing'], optional: ['club', 'spa', 'parking'],
    tier: 3, housekeeping: 'spotless', license: 12, heat: 0.02, turns: 1, fit: { luxury: 1, couples: 0.5, business: 0.3, young: -0.3, family: -0.4 }, minRooms: 60,
  },
  restaurant: {
    id: 'restaurant', name: 'Restaurant', kind: 'food',
    blurb: 'Red sauce, red booths, a back table that is always reserved.',
    ops: 'Covers, the check average and the food cost: the kitchen is the business.',
    rates: {}, depts: ['dining', 'kitchen'], optional: ['bar', 'marketing', 'maintenance'],
    tier: 1, housekeeping: 'standard', license: 2, heat: 0, turns: 0, fit: {},
  },
  bar: {
    id: 'bar', name: 'Bar & lounge', kind: 'bar',
    blurb: 'Year-round regulars and summer crowds. A good place to hear things.',
    ops: 'Drinks, the pour cost and a bartender people trust.',
    rates: {}, depts: ['bar'], optional: ['dining', 'kitchen', 'security', 'club', 'marketing', 'maintenance'],
    tier: 1, housekeeping: 'standard', license: 4, heat: 0.03, turns: 0, fit: {},
  },
  nightclub: {
    id: 'nightclub', name: 'Nightclub', kind: 'club',
    blurb: 'Neon, a house band, a headliner from Philadelphia on Saturday.',
    ops: 'The cover, the bar and the act: entertainment contracts make or break it. Business-level; the vice squad buys tickets too.',
    rates: {}, depts: ['club', 'bar', 'security'], optional: ['dining', 'kitchen', 'marketing', 'maintenance'],
    tier: 1, housekeeping: 'standard', license: 6, heat: 0.08, turns: 0, fit: {},
  },
};

export const LODGING: ConceptId[] = ['budget_motel', 'hourly_motel', 'rooming', 'boutique', 'luxury_resort'];

/* ---------------- departments ---------------- */

export interface DeptDef {
  kind: DeptKind;
  name: string;
  /** What the staff are called. */
  staff: string;
  head: string;
  /** Weekly wage of a staffer (1960). */
  wage: number;
  /** Where it works. */
  space?: SpaceType;
  blurb: string;
  /** Only in season (lifeguards). */
  seasonal?: boolean;
}

export const DEPTS: Record<DeptKind, DeptDef> = {
  admin: { kind: 'admin', name: 'Administration', staff: 'Bookkeeper', head: 'Controller', wage: 60, space: 'office', blurb: 'The books, the payroll, the bank.' },
  front: { kind: 'front', name: 'Front desk & reception', staff: 'Desk clerk', head: 'Front office manager', wage: 45, space: 'lobby', blurb: 'Check-in, the switchboard, the cash drawer, the night man.' },
  housekeeping: { kind: 'housekeeping', name: 'Housekeeping', staff: 'Room maid', head: 'Head housekeeper', wage: 32, space: 'linen', blurb: 'Makes the rooms. The standard you set is how many rooms each maid turns a day.' },
  laundry: { kind: 'laundry', name: 'Laundry', staff: 'Laundress', head: 'Laundry chief', wage: 32, space: 'laundry', blurb: 'Washes and presses the linen in-house. Without it, a linen service charges by the bundle.' },
  maintenance: { kind: 'maintenance', name: 'Maintenance & engineering', staff: 'Handyman', head: 'Chief engineer', wage: 50, space: 'storage', blurb: 'The boiler, the roof, the pool pump, the leak in 14. Deferred maintenance is borrowed money.' },
  dining: { kind: 'dining', name: 'Dining room', staff: 'Waiter', head: 'Maître d\'', wage: 25, space: 'dining', blurb: 'The room, the service and the check average.' },
  kitchen: { kind: 'kitchen', name: 'Kitchen', staff: 'Cook', head: 'Chef', wage: 55, space: 'kitchen', blurb: 'The food cost lives here.' },
  bar: { kind: 'bar', name: 'Bar & lounge', staff: 'Bartender', head: 'Head bartender', wage: 45, space: 'lounge', blurb: 'The pour, the regulars, what gets said over the rail.' },
  club: { kind: 'club', name: 'Nightclub room', staff: 'Club staff', head: 'Booking manager', wage: 40, space: 'club', blurb: 'The stage, the band, the door. The booking manager is the key post: his skill and his contacts decide which acts he can land, and he takes his cut. Performers are independent adults on contract.' },
  pool: { kind: 'pool', name: 'Pool', staff: 'Lifeguard', head: 'Head lifeguard', wage: 35, space: 'pool', blurb: 'Families choose a motel by its pool. Summer staff only.', seasonal: true },
  spa: { kind: 'spa', name: 'Health spa', staff: 'Attendant', head: 'Spa director', wage: 40, space: 'spa', blurb: 'Steam room, massage table, a sun deck.' },
  security: { kind: 'security', name: 'Security', staff: 'Night watchman', head: 'House detective', wage: 45, blurb: 'Keeps the peace and the guests safe; keeps the police from needing to come.' },
  marketing: { kind: 'marketing', name: 'Sales & marketing', staff: 'Sales agent', head: 'Sales manager', wage: 70, space: 'office', blurb: 'Ads in the Philadelphia papers, bus tours, conventions.' },
  parking: { kind: 'parking', name: 'Parking & valet', staff: 'Valet', head: 'Head valet', wage: 25, space: 'parking', blurb: 'A paved lot, and boys in red jackets to park the Cadillacs.' },
};

export interface SpaceDef {
  type: SpaceType;
  name: string;
  /** Default square feet per unit and guests/seats per unit. */
  sqft: number;
  capacity: number;
  dept?: DeptKind;
  /** Must be on the ground floor. */
  ground?: boolean;
  /** Outdoors (lot area, not building area). */
  outdoor?: boolean;
}

export const SPACES: Record<SpaceType, SpaceDef> = {
  room_std: { type: 'room_std', name: 'Standard room', sqft: 240, capacity: 2 },
  room_deluxe: { type: 'room_deluxe', name: 'Deluxe room', sqft: 320, capacity: 3 },
  suite: { type: 'suite', name: 'Suite', sqft: 520, capacity: 4 },
  room_hourly: { type: 'room_hourly', name: 'Short-stay room', sqft: 200, capacity: 2 },
  lobby: { type: 'lobby', name: 'Lobby & front desk', sqft: 400, capacity: 0, dept: 'front', ground: true },
  office: { type: 'office', name: 'Office', sqft: 150, capacity: 0, dept: 'admin' },
  linen: { type: 'linen', name: 'Linen room', sqft: 120, capacity: 0, dept: 'housekeeping' },
  laundry: { type: 'laundry', name: 'Laundry room', sqft: 350, capacity: 0, dept: 'laundry', ground: true },
  dining: { type: 'dining', name: 'Dining room', sqft: 15, capacity: 1, dept: 'dining', ground: true },
  kitchen: { type: 'kitchen', name: 'Kitchen', sqft: 600, capacity: 0, dept: 'kitchen', ground: true },
  lounge: { type: 'lounge', name: 'Cocktail lounge', sqft: 14, capacity: 1, dept: 'bar', ground: true },
  club: { type: 'club', name: 'Nightclub room', sqft: 12, capacity: 1, dept: 'club', ground: true },
  pool: { type: 'pool', name: 'Swimming pool', sqft: 2400, capacity: 0, dept: 'pool', outdoor: true },
  spa: { type: 'spa', name: 'Health spa', sqft: 900, capacity: 0, dept: 'spa' },
  banquet: { type: 'banquet', name: 'Banquet hall', sqft: 12, capacity: 1, dept: 'dining', ground: true },
  parking: { type: 'parking', name: 'Paved parking', sqft: 300, capacity: 1, dept: 'parking', outdoor: true },
  storage: { type: 'storage', name: 'Workshop & storage', sqft: 200, capacity: 0, dept: 'maintenance' },
  staff: { type: 'staff', name: 'Staff room', sqft: 150, capacity: 0 },
};

export const ROOM_LABEL: Record<RoomType, string> = { room_std: 'Standard', room_deluxe: 'Deluxe', suite: 'Suite', room_hourly: 'Short-stay' };

/* ---------------- guest segments ---------------- */

export type SegmentId = 'family' | 'young' | 'couples' | 'business' | 'luxury' | 'hourly' | 'workers';

export interface SegmentDef {
  id: SegmentId;
  name: string;
  /** Share of the island's lodging demand at the peak. */
  share: number;
  /** Price sensitivity, quality and reputation weights. */
  price: number;
  quality: number;
  rep: number;
  /** What they pay at an average place (1960 peak). */
  ref: number;
  /** Guests per room. */
  perRoom: number;
  /** Prefers suites / deluxe rooms. */
  upscale: number;
  /** Amenity tastes. */
  likes: Partial<Record<string, number>>;
  styles: Partial<Record<BuildStyle, number>>;
  zones: Partial<Record<ZoneId, number>>;
  /** Off-season weight (business travel keeps coming). */
  winter: number;
  /** Dining capture per guest-night, drinks per guest-night, club visits per guest-night. */
  dine: number;
  drink: number;
  club: number;
}

const BEACH: Partial<Record<ZoneId, number>> = { boardwalk: 0.35, crest: 0.35, north: 0.25, piers: 0.3, pacific: 0.1, downtown: -0.05, docks: -0.5, causeway: -0.45, westww: -0.25, ac: 0.1, sphilly: -1.5 };

export const SEGMENTS: Record<SegmentId, SegmentDef> = {
  family: { id: 'family', name: 'Families', share: 0.44, price: 2.2, quality: 0.7, rep: 0.5, ref: 7, perRoom: 3.2, upscale: 0, likes: { pool: 0.45, ac: 0.25, tv: 0.2, color_tv: 0.12, parking: 0.2, dining: 0.1 }, styles: { doowop: 0.15, colonial: 0.15 }, zones: BEACH, winter: 0.05, dine: 0.25, drink: 0.2, club: 0 },
  young: { id: 'young', name: 'The young crowd', share: 0.24, price: 2.6, quality: 0.4, rep: 0.4, ref: 6, perRoom: 2.6, upscale: 0, likes: { pool: 0.3, club: 0.45, lounge: 0.2, ac: 0.15 }, styles: { doowop: 0.3, tiki: 0.35, midcentury: 0.1 }, zones: { ...BEACH, pacific: 0.35 }, winter: 0.05, dine: 0.15, drink: 1.6, club: 0.45 },
  couples: { id: 'couples', name: 'Couples & honeymooners', share: 0.15, price: 1.2, quality: 1.1, rep: 0.6, ref: 10, perRoom: 2, upscale: 0.5, likes: { dining: 0.3, lounge: 0.2, spa: 0.3, ac: 0.25, pool: 0.15 }, styles: { deco: 0.25, victorian: 0.3, midcentury: 0.15, tiki: 0.1 }, zones: BEACH, winter: 0.12, dine: 0.5, drink: 1.2, club: 0.2 },
  business: { id: 'business', name: 'Business & conventions', share: 0.07, price: 1, quality: 0.9, rep: 0.5, ref: 9, perRoom: 1.2, upscale: 0.2, likes: { phone: 0.35, ac: 0.3, dining: 0.25, lounge: 0.1, parking: 0.15 }, styles: { midcentury: 0.2, colonial: 0.15 }, zones: { downtown: 0.3, causeway: 0.1, ac: 0.3, sphilly: 0.2, boardwalk: 0, crest: 0 }, winter: 0.5, dine: 0.5, drink: 1.2, club: 0.1 },
  luxury: { id: 'luxury', name: 'High rollers & society', share: 0.03, price: 0.4, quality: 1.6, rep: 0.8, ref: 22, perRoom: 2, upscale: 1, likes: { dining: 0.4, spa: 0.5, club: 0.3, lounge: 0.2, pool: 0.3, ac: 0.3, parking: 0.2 }, styles: { deco: 0.3, midcentury: 0.2, victorian: 0.15 }, zones: { ...BEACH, ac: 0.4 }, winter: 0.15, dine: 0.75, drink: 2, club: 0.35 },
  workers: { id: 'workers', name: 'Summer workers', share: 0, price: 2.4, quality: 0.2, rep: 0.2, ref: 4.5, perRoom: 1.6, upscale: 0, likes: {}, styles: {}, zones: { pacific: 0.3, downtown: 0.3, boardwalk: 0.2, piers: 0.2, docks: 0.1 }, winter: 0, dine: 0.05, drink: 0.8, club: 0.1 },
  hourly: { id: 'hourly', name: 'Short stays', share: 0, price: 1.6, quality: 0.3, rep: 0.2, ref: 3.5, perRoom: 2, upscale: 0, likes: { parking: 0.3 }, styles: {}, zones: { causeway: 0.3, docks: 0.2, pacific: 0.2, downtown: 0.1 }, winter: 0.65, dine: 0, drink: 0.2, club: 0 },
};

export const SEGMENT_IDS: SegmentId[] = ['family', 'young', 'couples', 'business', 'luxury', 'hourly', 'workers'];

/* ---------------- suppliers ---------------- */

export interface Supplier {
  id: string;
  group: SupplyGroup;
  name: string;
  /** Price multiplier on the catalog price. */
  price: number;
  /** Chance a delivery comes on time. */
  reliable: number;
  blurb: string;
  /** Needs a business of yours (a family rate). */
  needsKind?: string;
}

export const SUPPLIERS: Supplier[] = [
  { id: 'shore_linen', group: 'linen', name: 'Shore Linen Service', price: 1, reliable: 0.96, blurb: 'Picks up Monday, back Wednesday. Never loses a sheet.' },
  { id: 'atlantic_linen', group: 'linen', name: 'Atlantic Linen Supply', price: 0.85, reliable: 0.84, blurb: 'Cheaper, and the truck is late in August when you need it most.' },
  { id: 'own_laundry', group: 'linen', name: 'Your own laundromat (family rate)', price: 0.75, reliable: 0.97, blurb: 'Your machines, your people, and the money stays in the house.', needsKind: 'laundromat' },
  { id: 'capemay_paper', group: 'paper', name: 'Cape May Paper & Janitorial', price: 1, reliable: 0.95, blurb: 'Toilet tissue, soap, the works. Delivers twice a week in season.' },
  { id: 'philly_paper', group: 'paper', name: 'Philadelphia Paper Co.', price: 0.88, reliable: 0.82, blurb: 'Wholesale prices, a truck that comes down the Pike when it comes.' },
  { id: 'capemay_clean', group: 'cleaning', name: 'Cape May Paper & Janitorial', price: 1, reliable: 0.95, blurb: 'Cleaners and disinfectant by the drum.' },
  { id: 'own_cleaning', group: 'cleaning', name: 'Your cleaning company (family rate)', price: 0.8, reliable: 0.97, blurb: 'Your night crews bring their own drums.', needsKind: 'cleaning' },
  { id: 'riogrande_produce', group: 'food', name: 'Rio Grande Produce & Meats', price: 1, reliable: 0.93, blurb: 'Jersey tomatoes, corn and a butcher who knows a strip steak.' },
  { id: 'sphilly_wholesale', group: 'food', name: 'Ninth Street Wholesale (a friend)', price: 0.9, reliable: 0.88, blurb: 'South Philly prices; some of it fell off a truck, nobody asks which.' },
  { id: 'shore_beverage', group: 'liquor', name: 'Shore Beverage Distributors', price: 1, reliable: 0.95, blurb: 'Licensed, bonded, on time.' },
  { id: 'friendly_beverage', group: 'liquor', name: 'A friendly distributor', price: 0.85, reliable: 0.9, blurb: 'Cheaper cases with the tax stamps a little crooked. The ABC agents notice eventually.' },
  { id: 'boardwalk_furniture', group: 'furniture', name: 'Boardwalk Hotel Supply', price: 1, reliable: 0.95, blurb: 'Everything a motel needs, from the beds to the ashtrays.' },
  { id: 'grand_rapids', group: 'furniture', name: 'Grand Rapids Contract Furniture', price: 1.12, reliable: 0.98, blurb: 'Better made, lasts longer, costs more.' },
];

export const SUPPLY_GROUP_LABEL: Record<SupplyGroup, string> = { linen: 'Linen & laundry', paper: 'Paper & guest supplies', cleaning: 'Cleaning supplies', food: 'Food', liquor: 'Liquor', furniture: 'Furniture & fittings' };

/* ---------------- policy labels ---------------- */

export const HOUSEKEEPING: Record<Housekeeping, { name: string; rooms: number; quality: number; washes: number; blurb: string }> = {
  basic: { name: 'Basic', rooms: 16, quality: 35, washes: 0.6, blurb: 'Beds made, towels changed every other day. 16 rooms a maid.' },
  standard: { name: 'Standard', rooms: 13, quality: 62, washes: 1, blurb: 'Fresh linen daily. 13 rooms a maid.' },
  spotless: { name: 'Spotless', rooms: 9, quality: 88, washes: 1.15, blurb: 'Turn-down service, mitered corners, a mint. 9 rooms a maid.' },
};

export const STAFFING = { lean: { name: 'Lean', mult: 0.8, blurb: 'Fewer hands. Cheaper; the staff run ragged in August.' }, standard: { name: 'Standard', mult: 1, blurb: 'Enough people for a normal week.' }, generous: { name: 'Generous', mult: 1.2, blurb: 'Hands to spare. Service shines; payroll shows it.' } } as const;

export const MAINTENANCE = { defer: { name: 'Defer it', wear: 1.6, cost: 0.5, blurb: 'Fix what breaks. Cheap now, expensive later.' }, normal: { name: 'Normal', wear: 1, cost: 1, blurb: 'Fix things as they wear.' }, preventive: { name: 'Preventive', wear: 0.6, cost: 1.5, blurb: 'Paint before it peels; the building ages slowly.' } } as const;

export const WINTER = { close: { name: 'Close for the winter', blurb: 'Boarded up from mid-October to May. A caretaker and the taxes.' }, skeleton: { name: 'Skeleton crew', blurb: 'Open with a clerk and a maid for the few who come.' }, open: { name: 'Open all year', blurb: 'Full staff all winter. Only worth it with business guests.' } } as const;

export const PRICE_STANCE = { budget: { name: 'Undercut', mult: 0.85 }, market: { name: 'Market', mult: 1 }, premium: { name: 'Premium', mult: 1.15 } } as const;
