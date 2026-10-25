import type { DeptKind, SupplyGroup } from './empireState';

/**
 * The purchasing catalog (Module 5), data-driven: every product is one row,
 * and the UI renders whatever is here. A row says what it costs, how good it
 * is (0..100), how long it lasts (weeks, or washes for linen), what it does
 * to the staff's workload, and the years it was on the market (Module 13:
 * no color television in 1960, no quilted tissue before 1968).
 *
 * Effects are proportional: toilet paper weighs 1.5% of a room's quality, a
 * mattress 18%. No trivial purchase carries a large bonus.
 */

export type ItemCat =
  | 'mattress' | 'pillows' | 'sheets' | 'blankets' | 'bedframe' | 'towels' | 'furniture' | 'fixtures' | 'carpet' | 'tv' | 'aircon' | 'phone'
  | 'toilet_paper' | 'soap' | 'shampoo' | 'cleaning'
  | 'ingredients' | 'tableware' | 'glassware' | 'uniforms' | 'kitchen'
  | 'liquor' | 'bar_equipment'
  | 'sound' | 'lighting' | 'stage' | 'seating'
  | 'spa_supplies' | 'pool_chemicals';

export type Scope = 'room' | 'seat' | 'venue' | 'staff';

export interface CatDef {
  id: ItemCat;
  name: string;
  /** Bedding, bathroom, room, restaurant, bar, club, amenities (the purchasing tabs). */
  section: 'Bedding' | 'Bathroom' | 'Room' | 'Housekeeping' | 'Restaurant' | 'Bar' | 'Nightclub' | 'Amenities';
  group: SupplyGroup;
  kind: 'durable' | 'consumable';
  /** Durables: how many units the place needs (per room, per seat, one for the place, per staffer). */
  scope: Scope;
  /** Units per room (beds' pillows: 2, linen sets on the shelf: 3). */
  per?: number;
  /** Consumables: what drives use. */
  driver?: 'roomNight' | 'cover' | 'drink' | 'spaVisit' | 'week';
  /** Units per driver (rolls per occupied room-night ...). */
  use?: number;
  unit: string;
  /** Weight in the room product score (lodging) or the department's score. */
  weight: number;
  /** Needs this department (a kitchen for ingredients). */
  dept?: DeptKind;
  /** Wears by washing (sheets, towels): life is counted in washes. */
  laundered?: boolean;
  /** Running out hurts: the guests notice at once. */
  critical?: boolean;
}

export const CATS: Record<ItemCat, CatDef> = {
  mattress: { id: 'mattress', name: 'Mattresses', section: 'Bedding', group: 'furniture', kind: 'durable', scope: 'room', per: 1.6, unit: 'mattress', weight: 0.18 },
  pillows: { id: 'pillows', name: 'Pillows', section: 'Bedding', group: 'linen', kind: 'durable', scope: 'room', per: 3, unit: 'pillow', weight: 0.05 },
  sheets: { id: 'sheets', name: 'Sheets', section: 'Bedding', group: 'linen', kind: 'durable', scope: 'room', per: 3, unit: 'set', weight: 0.09, laundered: true },
  blankets: { id: 'blankets', name: 'Blankets & spreads', section: 'Bedding', group: 'linen', kind: 'durable', scope: 'room', per: 1.6, unit: 'blanket', weight: 0.04 },
  bedframe: { id: 'bedframe', name: 'Bed frames & headboards', section: 'Bedding', group: 'furniture', kind: 'durable', scope: 'room', per: 1.6, unit: 'frame', weight: 0.04 },
  towels: { id: 'towels', name: 'Towels', section: 'Bathroom', group: 'linen', kind: 'durable', scope: 'room', per: 3, unit: 'set', weight: 0.07, laundered: true },
  toilet_paper: { id: 'toilet_paper', name: 'Toilet paper', section: 'Bathroom', group: 'paper', kind: 'consumable', scope: 'room', driver: 'roomNight', use: 0.3, unit: 'roll', weight: 0.015, critical: true },
  soap: { id: 'soap', name: 'Soap', section: 'Bathroom', group: 'paper', kind: 'consumable', scope: 'room', driver: 'roomNight', use: 0.7, unit: 'bar', weight: 0.015, critical: true },
  shampoo: { id: 'shampoo', name: 'Shampoo', section: 'Bathroom', group: 'paper', kind: 'consumable', scope: 'room', driver: 'roomNight', use: 0.6, unit: 'portion', weight: 0.01 },
  fixtures: { id: 'fixtures', name: 'Bathroom fixtures', section: 'Bathroom', group: 'furniture', kind: 'durable', scope: 'room', per: 1, unit: 'bath', weight: 0.09 },
  furniture: { id: 'furniture', name: 'Room furniture', section: 'Room', group: 'furniture', kind: 'durable', scope: 'room', per: 1, unit: 'room set', weight: 0.14 },
  carpet: { id: 'carpet', name: 'Floors & carpet', section: 'Room', group: 'furniture', kind: 'durable', scope: 'room', per: 1, unit: 'room', weight: 0.06 },
  tv: { id: 'tv', name: 'Television', section: 'Room', group: 'furniture', kind: 'durable', scope: 'room', per: 1, unit: 'set', weight: 0.07 },
  aircon: { id: 'aircon', name: 'Cooling', section: 'Room', group: 'furniture', kind: 'durable', scope: 'room', per: 1, unit: 'unit', weight: 0.09 },
  phone: { id: 'phone', name: 'Telephone', section: 'Room', group: 'furniture', kind: 'durable', scope: 'room', per: 1, unit: 'line', weight: 0.03 },
  cleaning: { id: 'cleaning', name: 'Cleaning products', section: 'Housekeeping', group: 'cleaning', kind: 'consumable', scope: 'room', driver: 'roomNight', use: 0.08, unit: 'gallon', weight: 0.02, critical: true },
  ingredients: { id: 'ingredients', name: 'Ingredients & food contracts', section: 'Restaurant', group: 'food', kind: 'consumable', scope: 'seat', driver: 'cover', use: 1, unit: 'cover', weight: 0.5, dept: 'kitchen', critical: true },
  tableware: { id: 'tableware', name: 'Table settings', section: 'Restaurant', group: 'furniture', kind: 'durable', scope: 'seat', per: 1.3, unit: 'setting', weight: 0.15, dept: 'dining' },
  glassware: { id: 'glassware', name: 'Glassware', section: 'Restaurant', group: 'furniture', kind: 'durable', scope: 'seat', per: 2, unit: 'glass', weight: 0.08, dept: 'dining' },
  uniforms: { id: 'uniforms', name: 'Uniforms', section: 'Restaurant', group: 'linen', kind: 'durable', scope: 'staff', per: 2, unit: 'uniform', weight: 0.07, dept: 'dining' },
  kitchen: { id: 'kitchen', name: 'Kitchen equipment', section: 'Restaurant', group: 'furniture', kind: 'durable', scope: 'venue', per: 1, unit: 'kitchen', weight: 0.2, dept: 'kitchen' },
  liquor: { id: 'liquor', name: 'Liquor', section: 'Bar', group: 'liquor', kind: 'consumable', scope: 'seat', driver: 'drink', use: 1, unit: 'drink', weight: 0.6, dept: 'bar', critical: true },
  bar_equipment: { id: 'bar_equipment', name: 'Bar equipment', section: 'Bar', group: 'furniture', kind: 'durable', scope: 'venue', per: 1, unit: 'bar', weight: 0.4, dept: 'bar' },
  sound: { id: 'sound', name: 'Sound equipment', section: 'Nightclub', group: 'furniture', kind: 'durable', scope: 'venue', per: 1, unit: 'system', weight: 0.3, dept: 'club' },
  lighting: { id: 'lighting', name: 'Lighting', section: 'Nightclub', group: 'furniture', kind: 'durable', scope: 'venue', per: 1, unit: 'rig', weight: 0.25, dept: 'club' },
  stage: { id: 'stage', name: 'Stage', section: 'Nightclub', group: 'furniture', kind: 'durable', scope: 'venue', per: 1, unit: 'stage', weight: 0.2, dept: 'club' },
  seating: { id: 'seating', name: 'Seating', section: 'Nightclub', group: 'furniture', kind: 'durable', scope: 'seat', per: 1, unit: 'seat', weight: 0.25, dept: 'club' },
  spa_supplies: { id: 'spa_supplies', name: 'Spa oils, robes & towels', section: 'Amenities', group: 'linen', kind: 'consumable', scope: 'venue', driver: 'spaVisit', use: 1, unit: 'visit kit', weight: 0.5, dept: 'spa' },
  pool_chemicals: { id: 'pool_chemicals', name: 'Pool chemicals', section: 'Amenities', group: 'cleaning', kind: 'consumable', scope: 'venue', driver: 'week', use: 1, unit: 'week\'s drum', weight: 0.5, dept: 'pool', critical: true },
};

export interface CatalogItem {
  id: string;
  cat: ItemCat;
  /** 0 economy, 1 standard, 2 premium, 3 luxury. */
  tier: number;
  name: string;
  /** 1960 dollars per unit. */
  price: number;
  /** 0..100. */
  q: number;
  /** Durables: weeks of life (or washes, for linen). */
  life?: number;
  /** Consumables: multiplier on use (one-ply goes faster). */
  useMult?: number;
  /** Workload change for the department that handles it (+0.1 = 10% more work). */
  work?: number;
  /** Extra weekly utilities per unit (air conditioners). */
  power?: number;
  from?: number;
  to?: number;
  note?: string;
  /** Quality falls as guests come to expect better (a room with no TV in 1966). */
  expect?: { from: number; perYear: number; floor: number };
}

const I = (cat: ItemCat, tier: number, id: string, name: string, price: number, q: number, extra: Partial<CatalogItem> = {}): CatalogItem => ({ id, cat, tier, name, price, q, ...extra });

export const ITEMS: CatalogItem[] = [
  // Bedding
  I('mattress', 0, 'mat_cotton', 'Cotton-batting mattress', 18, 28, { life: 260, to: 1975, note: 'Lumpy by August.' }),
  I('mattress', 1, 'mat_spring', 'Innerspring mattress', 32, 55, { life: 420 }),
  I('mattress', 2, 'mat_ortho', 'Firm orthopedic innerspring', 48, 72, { life: 470 }),
  I('mattress', 2, 'mat_foam', 'Latex foam mattress', 44, 70, { life: 400, note: 'No springs to squeak.' }),
  I('mattress', 3, 'mat_king', 'King-size luxury innerspring', 85, 90, { life: 520, from: 1962 }),
  I('mattress', 1, 'mat_water', 'Waterbed', 60, 58, { life: 300, from: 1971, note: 'The young crowd thinks it is a riot. Maintenance does not.', work: 0.04 }),
  I('pillows', 0, 'pil_cotton', 'Cotton-stuffed pillow', 0.6, 30, { life: 80 }),
  I('pillows', 1, 'pil_foam', 'Foam pillow', 0.9, 50, { life: 120, from: 1958 }),
  I('pillows', 2, 'pil_feather', 'Feather pillow', 1.6, 66, { life: 150 }),
  I('pillows', 3, 'pil_down', 'Goose-down pillow', 4, 90, { life: 200 }),
  I('sheets', 0, 'sh_muslin', 'Muslin sheets', 1.6, 30, { life: 90, note: 'Cheap, scratchy, and they gray fast.' }),
  I('sheets', 1, 'sh_percale', 'Cotton percale sheets', 2.6, 60, { life: 150, work: 0.08, note: 'Need ironing.' }),
  I('sheets', 1, 'sh_noiron', 'No-iron poly-cotton percale', 2.4, 58, { life: 230, work: -0.08, from: 1964, note: 'Out of the dryer and onto the bed. The laundry loves them.' }),
  I('sheets', 3, 'sh_egypt', 'Egyptian cotton percale', 6.5, 90, { life: 180, work: 0.12 }),
  I('blankets', 0, 'bl_surplus', 'Army-surplus wool blanket', 2, 25, { life: 300 }),
  I('blankets', 1, 'bl_wool', 'Wool blanket & cotton spread', 4.5, 55, { life: 350 }),
  I('blankets', 2, 'bl_chenille', 'Chenille bedspread', 7, 72, { life: 300, from: 1950, to: 1980 }),
  I('blankets', 3, 'bl_satin', 'Satin-bound wool & quilted spread', 14, 90, { life: 400 }),
  I('bedframe', 0, 'bf_cot', 'Steel cot frame', 6, 25, { life: 900 }),
  I('bedframe', 1, 'bf_maple', 'Maple headboard set', 18, 55, { life: 900 }),
  I('bedframe', 2, 'bf_uphol', 'Upholstered headboard', 30, 74, { life: 700 }),
  I('bedframe', 3, 'bf_poster', 'Mahogany four-poster', 70, 92, { life: 1200 }),
  // Bathroom
  I('towels', 0, 'tw_huck', 'Thin huck towels', 0.5, 25, { life: 90 }),
  I('towels', 1, 'tw_terry', 'Terry towel set', 0.9, 55, { life: 150 }),
  I('towels', 2, 'tw_thick', 'Thick-pile terry set', 1.6, 74, { life: 180, work: 0.04 }),
  I('towels', 3, 'tw_turkish', 'Turkish bath sheets', 2.8, 92, { life: 200, work: 0.06 }),
  I('toilet_paper', 0, 'tp_oneply', 'One-ply toilet tissue', 0.06, 22, { useMult: 1.25, note: 'Guests use more of it.' }),
  I('toilet_paper', 1, 'tp_twoply', 'Two-ply toilet tissue', 0.09, 55),
  I('toilet_paper', 1, 'tp_pink', 'Colored two-ply (pink, to match the bath)', 0.1, 62, { from: 1955, to: 1980 }),
  I('toilet_paper', 2, 'tp_soft', 'Extra-soft two-ply', 0.13, 74, { useMult: 0.95 }),
  I('toilet_paper', 3, 'tp_quilted', 'Quilted luxury tissue', 0.19, 90, { useMult: 0.9, from: 1968 }),
  I('soap', 0, 'so_plain', 'Plain bar soap (cut)', 0.01, 25),
  I('soap', 1, 'so_wrapped', 'Wrapped guest bar', 0.025, 55),
  I('soap', 2, 'so_perfumed', 'Perfumed guest soap', 0.045, 74),
  I('soap', 3, 'so_milled', 'French-milled soap', 0.09, 92),
  I('shampoo', 0, 'sp_none', 'None (bring your own)', 0, 45, { expect: { from: 1962, perYear: 3, floor: 15 } }),
  I('shampoo', 1, 'sp_packet', 'Shampoo packets', 0.02, 58),
  I('shampoo', 2, 'sp_bottle', 'Little guest bottles', 0.05, 76, { from: 1966 }),
  I('shampoo', 3, 'sp_kit', 'Salon toiletry kit', 0.15, 92, { from: 1970 }),
  I('fixtures', 0, 'fx_porcelain', 'Plain white porcelain', 40, 35, { life: 1500 }),
  I('fixtures', 1, 'fx_chrome', 'Chrome & colored tile', 75, 60, { life: 1500 }),
  I('fixtures', 2, 'fx_pastel', 'Pastel bathroom suite', 110, 74, { life: 1300, from: 1955, to: 1978 }),
  I('fixtures', 3, 'fx_marble', 'Marble & brass', 260, 92, { life: 2000 }),
  // Room
  I('furniture', 0, 'fu_used', 'Second-hand odds and ends', 35, 20, { life: 300 }),
  I('furniture', 1, 'fu_maple', 'Motel standard (maple)', 90, 50, { life: 650 }),
  I('furniture', 1, 'fu_formica', 'Formica & vinyl', 80, 46, { life: 900, from: 1956, work: -0.03, note: 'Wipes clean; lasts forever; nobody loves it.' }),
  I('furniture', 2, 'fu_danish', 'Danish modern', 160, 75, { life: 650, from: 1954 }),
  I('furniture', 3, 'fu_custom', 'Custom designer suite', 320, 92, { life: 800 }),
  I('carpet', 0, 'cp_lino', 'Linoleum floor', 20, 30, { life: 800 }),
  I('carpet', 1, 'cp_broad', 'Wall-to-wall broadloom', 55, 60, { life: 450, work: 0.03 }),
  I('carpet', 2, 'cp_shag', 'Shag carpet', 70, 70, { life: 400, work: 0.06, from: 1965, to: 1981 }),
  I('carpet', 3, 'cp_axminster', 'Wool Axminster', 140, 90, { life: 700, work: 0.03 }),
  I('tv', 0, 'tv_none', 'No television', 0, 55, { expect: { from: 1958, perYear: 6, floor: 5 } }),
  I('tv', 1, 'tv_bw', 'Black-and-white console', 140, 70, { life: 420, from: 1952, to: 1979, expect: { from: 1968, perYear: 5, floor: 25 } }),
  I('tv', 2, 'tv_color', 'Color television', 420, 88, { life: 420, from: 1965 }),
  I('tv', 3, 'tv_cable', 'Color TV with cable', 380, 94, { life: 420, from: 1975 }),
  I('aircon', 0, 'ac_none', 'Open windows & the sea breeze', 0, 50, { expect: { from: 1958, perYear: 4, floor: 10 } }),
  I('aircon', 0, 'ac_fan', 'Ceiling fan', 25, 55, { life: 700, power: 0.3, expect: { from: 1962, perYear: 3, floor: 25 } }),
  I('aircon', 1, 'ac_window', 'Window air conditioner', 160, 78, { life: 520, power: 1.6, from: 1955, note: 'Guests pay for cold rooms. So does the electric bill.' }),
  I('aircon', 2, 'ac_ptac', 'Through-wall unit (quiet)', 260, 90, { life: 600, power: 1.2, from: 1968 }),
  I('phone', 0, 'ph_lobby', 'Payphone in the lobby', 0, 50, { expect: { from: 1963, perYear: 4, floor: 15 } }),
  I('phone', 1, 'ph_switch', 'Room phone through the switchboard', 35, 70, { life: 800, work: 0.02 }),
  I('phone', 2, 'ph_direct', 'Direct-dial room phone', 60, 88, { life: 800, from: 1966 }),
  // Housekeeping
  I('cleaning', 0, 'cl_lye', 'Lye soap & bleach', 0.4, 30, { work: 0.12, note: 'Elbow grease does the rest.' }),
  I('cleaning', 1, 'cl_comm', 'Commercial all-purpose cleaner', 0.7, 60),
  I('cleaning', 2, 'cl_hospital', 'Hospital-grade disinfectant', 1.1, 82, { work: -0.05 }),
  // Restaurant
  I('ingredients', 0, 'in_canned', 'Frozen & canned', 0.55, 30),
  I('ingredients', 1, 'in_market', 'Market fresh', 0.85, 60),
  I('ingredients', 2, 'in_butcher', 'Butcher & fishmonger, Jersey produce', 1.15, 78),
  I('ingredients', 3, 'in_prime', 'Prime beef, imported cheese, live lobster', 1.8, 93),
  I('tableware', 0, 'tb_diner', 'Diner ware', 1.5, 30, { life: 150 }),
  I('tableware', 1, 'tb_china', 'Restaurant china', 3, 60, { life: 200 }),
  I('tableware', 3, 'tb_silver', 'Fine china & silver plate', 9, 92, { life: 260, work: 0.05 }),
  I('glassware', 0, 'gl_tumbler', 'Tumblers', 0.15, 30, { life: 60 }),
  I('glassware', 1, 'gl_stem', 'Stemware', 0.4, 62, { life: 60 }),
  I('glassware', 3, 'gl_crystal', 'Crystal', 1.4, 92, { life: 70 }),
  I('uniforms', 0, 'un_apron', 'Aprons', 2, 35, { life: 52 }),
  I('uniforms', 1, 'un_jacket', 'White jackets', 6, 62, { life: 80 }),
  I('uniforms', 3, 'un_tux', 'Tuxedos', 25, 92, { life: 120 }),
  I('kitchen', 0, 'ki_used', 'Used range & an icebox', 300, 30, { life: 400, work: 0.15 }),
  I('kitchen', 1, 'ki_comm', 'Commercial range & walk-in', 900, 62, { life: 600 }),
  I('kitchen', 2, 'ki_steel', 'Stainless kitchen', 2200, 80, { life: 800, work: -0.1 }),
  I('kitchen', 3, 'ki_micro', 'Stainless kitchen with microwave ovens', 3000, 88, { life: 800, work: -0.15, from: 1967 }),
  // Bar
  I('liquor', 0, 'lq_rail', 'Rail bottles', 0.1, 30),
  I('liquor', 1, 'lq_call', 'Call brands', 0.15, 62),
  I('liquor', 3, 'lq_top', 'Top shelf', 0.24, 88),
  I('bar_equipment', 0, 'be_chest', 'Ice chest & a tap', 150, 30, { life: 500, work: 0.1 }),
  I('bar_equipment', 1, 'be_back', 'Back bar & cooler', 600, 62, { life: 700 }),
  I('bar_equipment', 3, 'be_mirror', 'Mirrored back bar, ice machine', 1500, 88, { life: 800, work: -0.06 }),
  // Nightclub
  I('sound', 0, 'so_pa', 'House PA', 400, 40, { life: 400 }),
  I('sound', 1, 'so_hifi', 'Hi-fi PA & amplifiers', 1200, 65, { life: 450 }),
  I('sound', 3, 'so_concert', 'Stereo concert system', 3000, 88, { life: 500, from: 1966 }),
  I('lighting', 0, 'li_flood', 'Colored floods', 150, 35, { life: 500 }),
  I('lighting', 1, 'li_spots', 'Stage spots & dimmers', 700, 62, { life: 600 }),
  I('lighting', 3, 'li_show', 'Light show & mirror ball', 1800, 88, { life: 450, from: 1967 }),
  I('stage', 0, 'st_platform', 'A platform', 200, 35, { life: 900 }),
  I('stage', 1, 'st_band', 'Bandstand', 800, 62, { life: 900 }),
  I('stage', 3, 'st_revolve', 'Revolving stage', 3000, 90, { life: 1000 }),
  I('seating', 0, 'se_folding', 'Folding chairs', 3, 30, { life: 200 }),
  I('seating', 1, 'se_banquette', 'Banquettes', 12, 62, { life: 400 }),
  I('seating', 3, 'se_velvet', 'Velvet booths', 25, 90, { life: 450 }),
  // Amenities
  I('spa_supplies', 1, 'sa_basic', 'Robes, towels & oils', 0.6, 60),
  I('spa_supplies', 3, 'sa_lux', 'French oils & monogrammed robes', 1.4, 90),
  I('pool_chemicals', 1, 'pc_chlorine', 'Chlorine & a test kit', 6, 60),
  I('pool_chemicals', 2, 'pc_service', 'Pool service contract', 14, 85, { work: -0.3 }),
];

export const ITEMS_BY_ID: Record<string, CatalogItem> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
export const CAT_IDS = Object.keys(CATS) as ItemCat[];

/** On the market this year (Module 13). */
export function itemAvailable(it: CatalogItem, year: number): boolean {
  return (it.from ?? 0) <= year && (it.to ?? 9999) >= year;
}

export function itemsFor(cat: ItemCat, year: number): CatalogItem[] {
  return ITEMS.filter((i) => i.cat === cat && itemAvailable(i, year)).sort((a, b) => a.tier - b.tier || a.price - b.price);
}

/** Quality this year: guests come to expect better (no TV in 1966 reads as cheap). */
export function itemQ(it: CatalogItem, year: number): number {
  if (!it.expect || year <= it.expect.from) return it.q;
  return Math.max(it.expect.floor, it.q - (year - it.expect.from) * it.expect.perYear);
}

/** The item a manager buys at a tier (the closest one on the market, best value). */
export function itemAtTier(cat: ItemCat, tier: number, year: number): CatalogItem | undefined {
  const list = itemsFor(cat, year);
  if (!list.length) return undefined;
  const at = list.filter((i) => i.tier === tier);
  if (at.length) return at.sort((a, b) => itemQ(b, year) / Math.max(0.01, b.price) - itemQ(a, year) / Math.max(0.01, a.price))[0];
  const below = list.filter((i) => i.tier < tier).sort((a, b) => b.tier - a.tier);
  return below[0] ?? list[0];
}
