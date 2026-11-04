import type { GiftFor, SpendCat, SpendItem, SpendKind } from './spendData';
import { STORE_ITEMS_2 } from './storeData2';

/**
 * THE STORE: the rest of what money buys in 1960, on top of the Spend catalog
 * (spendData.ts appends these to SPEND, so buying, upkeep, the IRS and saves
 * all work the same way). This file only holds data and must not import
 * values from spendData (it is imported by it): types only.
 *
 * Eight tabs (STORE_SPEC "Store and protection"): Property, Vehicles, Crew &
 * Services, Equipment, Armory, Lifestyle, Investments, Family & Legacy; plus
 * "Luxury", the highlights (store.ts picks them).
 *
 * What is new on an item, beyond the Spend fields:
 *  - biz:   a legitimate business (or a building, or a share) the store runs
 *           for you: weekly revenue in and out of season, a manager, the
 *           condition and the place. The building, the business and the
 *           ownership share are kept apart (`stake`).
 *  - inv:   an investment: risk, an estimated return (never a promise),
 *           liquidity, the management it needs, a named partner; `term`
 *           weeks for a venture that pays out once.
 *  - horse / racer: a racehorse or a race car (store.ts runs the races).
 *  - equip: business equipment: capacity (not demand) for the businesses of
 *           a kind.
 *  - arms:  the armory, abstract: points with diminishing returns.
 *  - hire:  a contract: skill, reputation, availability, conflicts.
 *
 * Names: products and long-gone places are period; every person is invented.
 */

export type StoreTab = 'property' | 'vehicles' | 'services' | 'equipment' | 'armory' | 'lifestyle' | 'invest' | 'legacy';

export const STORE_TABS: StoreTab[] = ['property', 'vehicles', 'services', 'equipment', 'armory', 'lifestyle', 'invest', 'legacy'];

export const STORE_TAB_LABEL: Record<StoreTab, string> = {
  property: 'Property', vehicles: 'Vehicles', services: 'Crew & Services', equipment: 'Equipment', armory: 'Armory', lifestyle: 'Lifestyle', invest: 'Investments', legacy: 'Family & Legacy',
};

export const STORE_TAB_BLURB: Record<StoreTab, string> = {
  property: 'Homes, buildings, land and legitimate businesses. The building, the business and a share in it are three different things.',
  vehicles: 'Cars, trucks, boats, race cars, and what keeps them running: insurance, a mechanic, a slip.',
  services: 'Contracts and hires, never people owned: lawyers, an accountant, managers, staff, security, the pad.',
  equipment: 'Equipment unlocks capacity, not customers: a bigger kitchen serves more people only when the people come.',
  armory: 'Kept abstract and period: more is not always better, and carrying it draws attention.',
  lifestyle: 'Clothes, watches, jewelry, gifts, the house, the club, the track and vacations. A gift depends on who gets it.',
  invest: 'Shares, partnerships, bonds and ventures. Every return is an estimate, every partner has a name.',
  legacy: 'Schooling, care, weddings, the estate: what the dynasty becomes.',
};

/** A business type: which equipment helps it. */
export type BizType = 'kitchen' | 'bakery' | 'shop' | 'laundry' | 'arcade' | 'bar' | 'stage' | 'studio' | 'office' | 'garage' | 'hotel' | 'marina' | 'rent' | 'outdoor';

export interface StoreBiz {
  /** Weekly net revenue (1960 dollars) in season (June-August) and out of it. */
  rev: [number, number];
  type: BizType;
  /** Men or a manager needed to run it (0 = it runs itself). */
  mgr: number;
  cond: string;
  loc: string;
  /** What you own: the building, the business, or a share of someone's. */
  stake: 'building' | 'business' | 'share';
}

export type Liquidity = 'cash' | 'weeks' | 'months' | 'years';

export interface StoreInv {
  risk: 'low' | 'medium' | 'high';
  /** Estimated annual return, % (low, high). Promised returns are estimates. */
  ret: [number, number];
  liq: Liquidity;
  mgmt: string;
  partner: string;
  /** A venture: pays out once after this many weeks (then it's done). */
  term?: number;
  /** A controlling share: you decide, and you answer for it (management falls on you). */
  ctrl?: boolean;
  /** What the partner wants for himself (partners have their own interests). */
  wants?: string;
  /** How you get out. */
  exit?: string;
}

/** How it is had (CATALOG_DEEP §14). */
export type PurchaseModel = 'buy' | 'rent' | 'lease' | 'hire' | 'subscribe' | 'share';
/** A personal style (§11): impresses some people and irritates others. */
export type StoreStyle = 'understated' | 'traditional' | 'fashionable' | 'flamboyant' | 'practical';

/** Adult venues (§3): tracked conditions; never legal everywhere, every decade. */
export interface StoreAdult { eligibility: string; voluntary: string; pay: string; conditions: string; leave: string; legal: string }

export interface StoreHorse { cls: 'claimer' | 'allowance' | 'stakes'; speed: number }

export interface StoreHire { skill: number; rep: string; avail: string; conflict?: string }

/** The store's extra fields on a Spend item (all optional). */
export interface StoreFields {
  tab?: StoreTab;
  biz?: StoreBiz;
  inv?: StoreInv;
  horse?: StoreHorse;
  /** A race car's pace (0-100). */
  racer?: number;
  /** Equipment: the business types it helps and the capacity it adds (%). */
  equip?: { types: BizType[]; cap: number };
  /** Armory points (diminishing returns), and whether carrying it is seen. */
  arms?: { pts: number; carry?: boolean; train?: number };
  hire?: StoreHire;
  /** The adviser's line, when the generic one won't do. */
  advice?: string;
  /** Purchase model when it isn't the obvious one (own → buy, svc → hire, once → buy). */
  model?: PurchaseModel;
  /** Qualified staff or approvals it needs (owning it does not make you qualified). */
  quals?: string;
  /** Where it can be had, when not the island. */
  where?: string;
  /** Stories it can start (event hooks). */
  hooks?: string[];
  style?: StoreStyle;
  adult?: StoreAdult;
  /** Who it belongs to once bought: the boss (default for the pocket), the household, the person it was for, the company, the organization. */
  owner?: 'player' | 'household' | 'recipient' | 'company' | 'organization';
  /** Who it is "for" when the price is per relative. */
  fut?: string;
  /** Speed bonus for every horse in the barn (a trainer, a jockey, the farm). */
  horseBoost?: number;
  /** Mature content (a mistress's things): hidden and blocked when the Mature setting is Off. */
  mature?: boolean;
}

type O = Partial<Omit<SpendItem, 'id' | 'name' | 'cat' | 'price' | 'up' | 'blurb'>>;

const RESALE: Partial<Record<SpendCat, [number, number]>> = {
  cars: [0.6, -0.1], boats: [0.6, -0.05], style: [0.1, -0.2], jewelry: [0.5, 0], home: [0.5, -0.03], property: [0.9, 0.03], biz: [0.7, 0], racing: [0.4, -0.15],
  equip: [0.3, -0.1], armory: [0.4, -0.05], invest: [0.9, 0], gifts: [0.2, -0.1],
};

function X(tab: StoreTab, cat: SpendCat, kind: SpendKind, id: string, name: string, price: number, up: number, blurb: string, o: O = {}): SpendItem {
  const [resale, drift] = kind === 'own' ? RESALE[cat] ?? [0.5, -0.05] : [0, 0];
  const pot = cat === 'biz' || cat === 'equip' || cat === 'armory' || cat === 'services' ? 'family' : 'pocket';
  return { id, name, cat, kind, pot, price, up, blurb, flash: 0, resale, drift, tab, ...o };
}

const P = (id: string, name: string, price: number, up: number, blurb: string, o: O = {}) => X('property', 'property', 'own', id, name, price, up, blurb, o);
const B = (id: string, name: string, price: number, up: number, blurb: string, biz: StoreBiz, o: O = {}) => X('property', 'biz', 'own', id, name, price, up, blurb, { flash: 1, biz, mods: { declared: Math.round((biz.rev[0] + biz.rev[1]) / 4) }, ...o });
const biz = (rev: [number, number], type: BizType, mgr: number, cond: string, loc: string, stake: StoreBiz['stake'] = 'business'): StoreBiz => ({ rev, type, mgr, cond, loc, stake });
const V = (id: string, name: string, price: number, up: number, blurb: string, o: O = {}) => X('vehicles', 'cars', 'own', id, name, price, up, blurb, { unl: ['car'], ...o });
const BT = (id: string, name: string, price: number, up: number, blurb: string, o: O = {}) => X('vehicles', 'boats', 'own', id, name, price, up, blurb, { unl: ['boat'], ...o });
const R = (id: string, name: string, price: number, up: number, blurb: string, o: O = {}) => X('vehicles', 'racing', 'own', id, name, price, up, blurb, o);
const H = (id: string, name: string, price: number, up: number, blurb: string, horse: StoreHorse, o: O = {}) => X('lifestyle', 'racing', 'own', id, name, price, up, blurb, { horse, unl: ['horse'], respect: 2, relief: 3, flash: 4, g: { society: 2 }, ...o });
const S = (id: string, name: string, price: number, up: number, blurb: string, hire: StoreHire, o: O = {}) => X('services', 'services', 'svc', id, name, price, up, blurb, { hire, ...o });
const E = (id: string, name: string, price: number, up: number, blurb: string, types: BizType[], cap: number, o: O = {}) => X('equipment', 'equip', 'own', id, name, price, up, blurb, { equip: { types, cap }, limit: 3, ...o });
const A = (id: string, name: string, price: number, up: number, blurb: string, pts: number, o: O = {}) => X('armory', 'armory', 'own', id, name, price, up, blurb, { arms: { pts }, limit: 4, notice: ['The other families'], ...o });
const L = (cat: SpendCat, kind: SpendKind, id: string, name: string, price: number, up: number, blurb: string, o: O = {}) => X('lifestyle', cat, kind, id, name, price, up, blurb, o);
const G = (id: string, name: string, price: number, blurb: string, gift: GiftFor, o: O = {}) => X('lifestyle', 'gifts', 'once', id, name, price, 0, blurb, { gift, cd: 4, ...o });
const I = (id: string, name: string, price: number, up: number, blurb: string, inv: StoreInv, o: O = {}) => X('invest', 'invest', 'own', id, name, price, up, blurb, {
  inv, resale: inv.liq === 'cash' ? 1 : inv.liq === 'weeks' ? 0.97 : inv.liq === 'months' ? 0.9 : 0.6, drift: 0, limit: 3, ...o,
});
const F = (kind: SpendKind, id: string, name: string, price: number, up: number, blurb: string, o: O = {}) => X('legacy', 'family', kind, id, name, price, up, blurb, o);

export const STORE_ITEMS: SpendItem[] = [
  // ================================ PROPERTY: homes and buildings ================================
  X('property', 'property', 'svc', 'st_room', 'A rented room on Pacific Avenue', 15, 8, "A furnished room over a bar, a hot plate, a bathroom down the hall. Somewhere to be nobody.", { flash: 0, mods: { secrecy: 1 } }),
  X('property', 'property', 'svc', 'st_apartment', 'A small apartment in town', 40, 18, "Two rooms on Atlantic Avenue with a view of the back of the Convention Hall.", { flash: 0, relief: 1 }),
  P('st_rowhouse', 'A rowhouse on Pacific Avenue', 6500, 8, "Two bedrooms over a stoop. Where everybody starts.", { fam: 2, relief: 2, flash: 1, resale: 0.95, drift: 0.02, advice: "Cheap to keep and it holds its money. Nobody at the IRS looks twice at a rowhouse." }),
  P('st_cottage', 'A beach cottage in North Wildwood', 9000, 10, "Cedar shingles, an outdoor shower, sand in everything. Rent it out in August if you like.", { fam: 5, relief: 5, flash: 2, resale: 0.95, drift: 0.04 }),
  P('st_cresthouse', 'A family home in the Crest', 18000, 22, "A split-level on a corner lot, two blocks from the beach. The wife picks the wallpaper.", { fam: 8, relief: 6, respect: 3, flash: 3, resale: 0.95, drift: 0.03 }),
  P('st_waterfront', 'A waterfront house on the bay', 32000, 30, "A dock out back, the sunset over the marsh, a boat bobbing at the end of the lawn.", { fam: 8, relief: 8, respect: 3, flash: 4, resale: 0.95, drift: 0.04, unl: ['slip'] }),
  P('st_penthouse', 'A penthouse over the water', 55000, 60, "The top floor of the Ocean Towers: glass on three sides, the Atlantic under your feet, a private elevator. The only one like it on the island.", { respect: 6, relief: 8, fam: 3, flash: 8, stock: 1, resale: 0.9, drift: 0.03, notice: ['Every family in Philadelphia', 'The FBI (they rent the room below)'], advice: "Beautiful, and every car that stops downstairs is noted. A place to entertain, not to hide." }),
  P('st_mansion', 'A mansion on the bay', 65000, 70, "Columns, a dock, a wall around it. Everybody on the island knows whose it is.", { respect: 8, fam: 12, relief: 8, flash: 8, stock: 1, resale: 0.9, drift: 0.03, unl: ['slip'], notice: ['Every family in Philadelphia'] }),
  P('st_estate', 'A horse-country estate in Colts Neck', 90000, 110, "Forty acres, white fences, a stone house and a barn better than most houses.", { respect: 7, fam: 8, relief: 9, flash: 8, stock: 1, resale: 0.85, drift: 0.03, unl: ['farm'], horseBoost: 3, g: { society: 4 } }),
  P('st_capemay', 'A Victorian cottage in Cape May', 12000, 15, "A porch with gingerbread trim and a view of the lighthouse. Sundays only.", { fam: 6, relief: 8, respect: 1, flash: 2, resale: 0.95, drift: 0.04 }),
  P('st_pocono', 'A lodge in the Poconos', 15000, 16, "Stone fireplace, a lake, no telephone. The kids learn to fish.", { fam: 7, relief: 10, respect: 1, flash: 2, resale: 0.9, drift: 0.03 }),
  P('st_vacantlot', 'A vacant lot off New Jersey Avenue', 3000, 1, "Sand, weeds and a For Sale sign. Land on an island only goes one way.", { flash: 0, resale: 0.95, drift: 0.07, limit: 3, advice: "Land pays nothing while you wait. It's a bet on the island growing, and the island is growing." }),
  P('st_landbay', 'Marsh land on the bay (to be filled)', 12000, 2, "Forty acres of cattails in Diamond Beach. Fill it, pave it, and it's a neighborhood.", { flash: 1, resale: 0.6, drift: 0.12, g: { pols: 1 }, advice: "A permit from the state and a friend on the council turn mud into lots. Without them it stays mud." }),
  P('st_flophouse', 'A flop house on the bay side', 5000, 10, "Cots by the night, a man at a cage with a cigar box. The cops know every face.", { flash: 1, mods: { intel: 2, declared: 20 }, biz: biz([80, 45], 'rent', 0, 'Rough: the plaster is mostly memory', 'Bay side, by the railroad', 'business'), advice: "Cash every night, all year. Nobody respectable will thank you for it, and the beat cops will want their piece." }),
  P('st_rooming', 'A rooming house for summer workers', 9000, 18, "Thirty rooms for the kids who work the boardwalk. Rent by the week, cash on Friday.", { flash: 1, mods: { declared: 35 }, biz: biz([220, 30], 'rent', 0, 'Tired but sound', 'Two blocks off the boardwalk', 'building'), advice: "Strong summer business. We'll need enough cash to survive winter." }),
  P('st_apartments', 'An apartment building (twelve units)', 40000, 45, "Brick, three stories, twelve families who pay on the first of the month.", { flash: 2, mods: { declared: 60 }, biz: biz([170, 160], 'rent', 0, 'Good: a new boiler in 1957', 'Wildwood, near the high school', 'building'), advice: "Dull, steady, and the bank likes it. A property manager keeps you out of the tenants' kitchens." }),
  P('st_storefronts', 'The building on Pacific Avenue (a barber rents the ground floor)', 12000, 12, "You own the bricks; the barber owns his business and pays you rent. Upstairs is empty.", { flash: 1, mods: { declared: 20 }, biz: biz([65, 65], 'rent', 0, 'Fair', 'Pacific Avenue', 'building'), advice: "You own the building, not his business. You collect rent whether his chairs are full or not." }),
  P('st_parkinglot', 'A parking lot by the boardwalk', 8000, 4, "A dollar a car on a Saturday in July, a kid with an apron and a roll of tickets.", { flash: 1, mods: { declared: 25 }, biz: biz([170, 5], 'outdoor', 0, 'Gravel and a shack', 'A block from the boardwalk', 'business'), advice: "Ten weeks of good money and forty-two of nothing. Cheap to hold." }),
  P('st_garage', 'A garage (twenty bays)', 6000, 8, "Indoor parking for the summer people, and bays nobody asks about in winter.", { flash: 0, mods: { declared: 10, secrecy: 1 }, biz: biz([60, 35], 'garage', 0, 'Sound', 'Rio Grande Avenue', 'building') }),
  P('st_storage', 'A storage building', 7000, 6, "Cinderblock, a roll-up door, padlocks. People store boats, furniture, and things.", { flash: 0, mods: { declared: 10, secrecy: 1 }, biz: biz([40, 40], 'rent', 0, 'Dry', 'Off Route 47', 'building') }),
  P('st_warehouse', 'A warehouse on the bay', 15000, 12, "A loading dock on the water, a forklift, room for a trailer or two that came from somewhere.", { flash: 1, mods: { declared: 20 }, unl: ['warehouse'], biz: biz([90, 80], 'rent', 0, 'Good', 'The bay side, by the docks', 'building') }),
  P('st_socialclub', 'A social club on Pacific Avenue', 5000, 25, "A storefront with painted windows, an espresso machine, card tables, a back room. Members only.", { respect: 2, crew: 3, flash: 2, mods: { secrecy: 3 }, notice: ['The FBI (they photograph the door)'], advice: "Every man needs a place to be seen being loyal. The windows are painted for a reason." }),
  P('st_office', "The boss's office above a business", 4000, 15, "Up a flight of stairs over the luncheonette: a desk, a window on the street, a door that locks.", { respect: 1, relief: 2, flash: 1, mods: { intel: 3 } }),

  // ================================ PROPERTY: legitimate businesses ================================
  B('st_diner', 'A diner (stainless steel, open all night)', 9000, 30, "A Silk City diner, counter stools, pie in a glass case. Cops eat free at three in the morning.", biz([170, 95], 'kitchen', 1, 'Good: the grill was rebuilt last spring', 'Rio Grande Avenue', 'business'), { g: { cops: 1 }, advice: "A year-round business: the winter crowd is truckers and cops, and that's not nothing." }),
  B('st_bakery', 'A bakery', 4000, 15, "Bread at five, cannoli by nine, wedding cakes on order.", biz([95, 65], 'bakery', 0, 'Fair: the oven is older than you', 'Pacific Avenue', 'business'), { g: { town: 1 } }),
  B('st_candy', 'A candy store (taffy and fudge)', 2000, 8, "Saltwater taffy pulled in the window, fudge in slabs, a penny-candy counter for the kids.", biz([75, 20], 'shop', 0, 'Good', 'On the boardwalk', 'business'), { advice: "Strong summer business. We'll need enough cash to survive winter." }),
  B('st_barber', 'A barbershop', 1800, 6, "Three chairs, a pole, the Daily News, and the best gossip on the island.", biz([45, 35], 'shop', 0, 'Good', 'Pacific Avenue', 'business'), { mods: { intel: 2, declared: 20 } }),
  B('st_souvenir', 'A souvenir shop', 2500, 8, "Ashtrays shaped like the island, hermit crabs, postcards, a hat that says Wildwood by the Sea.", biz([95, 5], 'shop', 0, 'Good', 'On the boardwalk', 'business'), { advice: "Strong summer business. We'll need enough cash to survive winter." }),
  B('st_bikerent', 'A bicycle rental shop', 1500, 5, "Forty Schwinns and a tandem. Early-morning rides on the boards.", biz([75, 0], 'shop', 0, 'Good', 'Near the boardwalk', 'business'), { advice: "Pure summer: closed from October to May." }),
  B('st_records', 'A record shop', 3000, 10, "Listening booths, the top forty on the wall, and a disc jockey who drops by.", biz([60, 45], 'shop', 0, 'Good', 'Pacific Avenue', 'business'), { g: { press: 1 } }),
  B('st_marina', 'A marina on the bay', 40000, 80, "Sixty slips, a fuel dock, a bait shack and a crane. Every boat on the bay needs you.", biz([420, 60], 'marina', 1, 'Fair: the bulkhead needs work', "Otten's Harbor", 'business'), { flash: 3, unl: ['slip'], advice: "The summer pays for the year if the bulkhead holds. A storm could cost us a season." }),
  B('st_funeral', 'A funeral home', 20000, 40, "A Victorian on a quiet street, a chapel, two Cadillac hearses. Business is, sadly, steady.", biz([150, 175], 'office', 1, 'Excellent', 'Wildwood, near St. Ann\'s', 'business'), { needs: ['mortician'], quals: 'A state-licensed funeral director (owning it does not make you one)', g: { church: 2 }, mods: { secrecy: 2, declared: 80 }, advice: "Recession-proof, and families remember who buried their father with dignity." }),
  B('st_hotel', 'A hotel on the beach (a hundred and twenty rooms)', 90000, 220, "A grand old wooden hotel with a veranda, a ballroom, and a dining room for four hundred.", biz([1300, 120], 'hotel', 2, 'Tired: the wiring scares the fire marshal', 'Ocean Avenue', 'business'), { flash: 5, respect: 3, advice: "July and August pay for everything, if the fire marshal doesn't close us first. Budget for wiring." }),
  B('st_filmstudio', 'A film studio (industrial films and commercials)', 25000, 60, "A sound stage in a converted garage, two cameras, a man who did a picture in Hollywood once.", biz([170, 170], 'studio', 1, 'Good', 'Rio Grande', 'business'), { g: { press: 2 }, mods: { declared: 70, launder: 2 } }),
  B('st_recstudio', 'A recording studio', 9000, 25, "A booth, an Ampex tape machine, and the echo of a stairwell for the doo-wop groups.", biz([90, 80], 'studio', 0, 'Good', 'Over the music store', 'business'), { g: { press: 1 } }),
  B('st_bowling', 'A bowling alley (sixteen lanes)', 30000, 60, "Automatic pinsetters, a league every night of the week, a lounge with a bowling-ball sign.", biz([220, 270], 'arcade', 1, 'New', 'Rio Grande', 'business'), { g: { town: 2 }, advice: "Better in the winter than the summer: the leagues bowl when the beach is cold." }),
  B('st_drivein', 'A drive-in theater', 25000, 45, "Five hundred cars, speakers on posts, a snack bar with a cartoon hot dog.", biz([360, 0], 'outdoor', 1, 'Good', 'Route 9', 'business'), { advice: "Summer only, and the movie studios take half the gate." }),
  B('st_minigolf', 'A miniature golf course', 6000, 12, "A windmill, a volcano, a pirate ship, eighteen holes of fiberglass.", biz([150, 0], 'outdoor', 0, 'Good', 'Ocean Avenue', 'business'), { advice: "Strong summer business. We'll need enough cash to survive winter." }),
  B('st_gasstation', 'A gas station', 8000, 20, "Two pumps, a lift, a man in a cap who checks your oil. Thirty-one cents a gallon.", biz([120, 75], 'garage', 0, 'Good', 'Route 47', 'business'), { mods: { declared: 50, intel: 1 } }),
  B('st_liquor', 'A liquor store', 10000, 25, "A state license, a wall of whiskey, a back door for deliveries to the bars.", biz([150, 115], 'shop', 0, 'Good', 'Pacific Avenue', 'business'), { advice: "The license is the asset. The state ABC board will want to know who really owns it." }),
  B('st_drycleaner', 'A dry cleaner', 3500, 10, "A press, the chemical smell, a rack of plastic-wrapped suits.", biz([60, 55], 'laundry', 0, 'Good', 'New Jersey Avenue', 'business'), { mods: { launder: 2, declared: 30 } }),
  B('st_florist', 'A florist', 2500, 8, "Wreaths for funerals, corsages for proms, roses on Valentine's.", biz([45, 45], 'shop', 0, 'Good', 'Near St. Ann\'s', 'business'), { g: { church: 1 } }),
  B('st_beauty', 'A beauty parlor', 2500, 8, "Hair dryers like space helmets, and every wife in Wildwood under them on Thursday.", biz([55, 45], 'shop', 0, 'Good', 'Pacific Avenue', 'business'), { mods: { intel: 2, declared: 25 } }),
  B('st_bait', 'A bait and tackle shop', 1500, 5, "Bloodworms, squid, a wall of rods, and the fishing report every morning.", biz([55, 10], 'shop', 0, 'Good', 'By the inlet', 'business')),
  B('st_catering', 'A catering hall', 18000, 40, "Chandeliers, a dance floor, a kitchen for five hundred. Weddings every Saturday.", biz([260, 150], 'kitchen', 1, 'Good', 'Rio Grande', 'business'), { g: { town: 1 }, advice: "Book the weddings and the communions and it's full all year. The kitchen is the limit." }),
  B('st_photo', 'A photography studio', 2000, 6, "Weddings, babies, graduation portraits, and sometimes a picture somebody wants.", biz([40, 35], 'studio', 0, 'Good', 'Pacific Avenue', 'business'), { mods: { intel: 1 } }),
  B('st_musicstore', 'A music store', 3500, 10, "Accordions, trumpets, sheet music, lessons upstairs.", biz([50, 40], 'shop', 0, 'Good', 'Pacific Avenue', 'business')),
  B('st_furniture', 'A furniture and appliance store', 9000, 20, "Frigidaires, Danish modern, a television in the window with a crowd in front of it.", biz([120, 95], 'shop', 0, 'Good', 'Rio Grande Avenue', 'business'), { mods: { declared: 60, launder: 2 } }),
  B('st_travel', 'A travel agency', 2000, 8, "Posters of Bermuda, a phone line to the airlines, cruise brochures.", biz([40, 45], 'office', 0, 'Good', 'Pacific Avenue', 'business')),
  B('st_insurance', 'An insurance agency', 3000, 10, "Fire, auto, life. Everybody needs it, and the agent knows everybody's business.", biz([60, 60], 'office', 0, 'Good', 'New Jersey Avenue', 'business'), { quals: 'A licensed broker writes the policies', mods: { intel: 2, declared: 60 } }),
  B('st_realestate', 'A real estate office', 3000, 10, "Listings in the window, a man who knows which lots the state is about to buy.", biz([85, 40], 'office', 0, 'Good', 'Pacific Avenue', 'business'), { g: { pols: 1 } }),
  B('st_printshop', 'A print shop', 5000, 12, "A Heidelberg press: menus, raffle tickets, campaign signs, and the numbers slips.", biz([70, 70], 'office', 0, 'Good', 'Rio Grande', 'business'), { g: { pols: 1 } }),
  B('st_busline', 'A charter bus line', 15000, 50, "Four coaches: church trips to Atlantic City, school outings, the casino runs later.", biz([230, 80], 'garage', 1, 'Fair', 'Rio Grande', 'business')),
  B('st_ambulance', 'An ambulance service', 9000, 25, "Two Cadillac ambulances and a contract with the county. Also: a fast car nobody stops.", biz([80, 80], 'garage', 0, 'Good', 'Wildwood', 'business'), { g: { town: 1 } }),
  B('st_ferris', 'A Ferris wheel on the pier', 12000, 25, "Lights at night, a kid with a lever, and a view of the whole island from the top.", biz([310, 0], 'outdoor', 0, 'Good', 'On the amusement pier', 'business'), { flash: 2, advice: "Strong summer business. We'll need enough cash to survive winter." }),
  B('st_icecream', 'An ice cream parlor', 3000, 10, "Marble counter, a soda jerk, banana splits with a cherry on top.", biz([110, 10], 'kitchen', 0, 'Good', 'Ocean Avenue', 'business')),
  B('st_seafood', 'A seafood restaurant on the docks', 8000, 25, "Crab cakes, flounder, a window over the boats, a line out the door in July.", biz([210, 40], 'kitchen', 1, 'Good', "Otten's Harbor", 'business')),
  B('st_shoerepair', 'A shoe repair shop', 1200, 4, "A last, a stitching machine, an old man who fixes anything leather.", biz([30, 30], 'shop', 0, 'Good', 'Pacific Avenue', 'business')),
  B('st_newsstand', 'A newsstand and cigar store', 1500, 5, "Papers from Philly and New York, cigars, magazines in the back rack, a telephone.", biz([45, 35], 'shop', 0, 'Good', 'Pacific Avenue', 'business'), { mods: { intel: 1 } }),
  B('st_hardware', 'A hardware store', 6000, 15, "Nails by the pound, paint, rope, a man who explains how to fix it yourself.", biz([80, 70], 'shop', 0, 'Good', 'Rio Grande Avenue', 'business')),

  // ================================ VEHICLES ================================
  V('st_usedsedan', 'A used 1953 Chevrolet sedan', 600, 4, "Grey, dented, reliable. A car nobody remembers.", { flash: 0, limit: 3, mods: { secrecy: 1 }, advice: "Nobody looks at it. That is the whole point." }),
  V('st_belair', 'A Chevrolet Bel Air (a reliable family car)', 2500, 5, "Four doors, two-tone, the car on every driveway in the Crest.", { fam: 3, relief: 1, flash: 1 }),
  V('st_fury', 'A Plymouth Fury', 2800, 6, "Fins like a rocket, push-button drive, a car for a man with a future.", { fam: 2, relief: 2, flash: 2 }),
  V('st_bonneville', 'A Pontiac Bonneville convertible', 3500, 7, "Wide-track, a red interior, the top down on the causeway.", { fam: 3, relief: 3, flash: 3, gift: 'anyone' }),
  V('st_olds98', 'An Oldsmobile Ninety-Eight', 4000, 8, "The car of a successful dentist. Respectable, roomy, quiet.", { respect: 1, fam: 2, relief: 1, flash: 2 }),
  V('st_corvair', 'A Chevrolet Corvair', 2000, 4, "The engine is in the back. Your nephew thinks it's the future.", { fam: 1, flash: 1 }),
  V('st_beetle', 'A Volkswagen Beetle', 1600, 3, "German, round, it never breaks. The men laugh at it.", { relief: 1, flash: 1, crew: -1 }),
  V('st_xk150', 'A Jaguar XK150 roadster', 5100, 10, "British racing green, wire wheels, a growl.", { respect: 1, relief: 4, flash: 5, maxYear: 1961, gift: 'son' }),
  V('st_etype', 'A Jaguar E-Type', 5600, 11, "The most beautiful car ever made, says everyone who sees it.", { respect: 2, relief: 5, flash: 6, minYear: 1961 }),
  V('st_ferrari_gt', 'A Ferrari 250 GT California Spider', 12000, 22, "Italian, red, hand-built. There are a few dozen in the world.", { respect: 4, relief: 6, flash: 9, stock: 1, resale: 0.9, drift: 0.04, notice: ['Every car man on the island', 'The other families'] }),
  V('st_maserati_gt', 'A Maserati 3500 GT', 11000, 20, "A grand tourer from Modena: leather, walnut, a straight six.", { respect: 3, relief: 5, flash: 8, stock: 1, resale: 0.75, drift: -0.02 }),
  V('st_astondb4', 'An Aston Martin DB4', 10000, 20, "English, silver, fast. Bought through a dealer in New York who asked no questions.", { respect: 3, relief: 5, flash: 8, stock: 1 }),
  V('st_brougham', 'A Cadillac Eldorado Brougham', 13000, 24, "Hand-built in Turin, a stainless-steel roof, a vanity with a perfume atomizer. 1960 is the last year.", { respect: 5, fam: 3, relief: 3, flash: 9, stock: 1, maxYear: 1960, resale: 0.6, drift: -0.06 }),
  V('st_mustang', 'A Ford Mustang', 2600, 6, "Brand new and everybody wants one.", { fam: 4, relief: 3, flash: 2, minYear: 1964, gift: 'anyone' }),
  V('st_taxi', 'A Checker taxicab', 3000, 12, "Yellow, indestructible, a meter that says what you want it to.", { flash: 1, mods: { intel: 1 } }),
  V('st_van', 'A Chevrolet panel delivery truck', 2100, 6, "A box on wheels with your vending company's name on the side.", { flash: 0, maxYear: 1960, limit: 3 }),
  V('st_econoline', 'A Ford Econoline van', 2000, 5, "Flat-nosed, the engine between the seats, room for anything.", { flash: 0, minYear: 1961, limit: 3 }),
  V('st_pickup', 'A Ford F-100 pickup', 2100, 5, "For the yard, the lumber, and the things you don't ask about.", { flash: 0, limit: 3 }),
  V('st_boxtruck', 'An International box truck', 5000, 12, "Twenty feet of truck. Your trucking outfit puts it to work.", { flash: 0, limit: 4 }),
  V('st_harley', 'A Harley-Davidson Duo-Glide', 1300, 3, "Chrome, a solo seat, the sound of a summer night on Pacific Avenue.", { relief: 3, flash: 2 }),
  V('st_vespa', 'A Vespa scooter', 400, 1, "Italian, buzzing, the kids love it.", { fam: 2, flash: 1, gift: 'anyone' }),
  X('vehicles', 'cars', 'own', 'st_schwinn', 'A Schwinn bicycle', 60, 0, "A Black Phantom with chrome fenders. The boardwalk at dawn.", { relief: 1, flash: 0, gift: 'anyone', limit: 4 }),
  BT('st_skiff', 'A sixteen-foot outboard fishing boat', 900, 3, "An Evinrude on the back, a cooler, the back bay on a Saturday.", { relief: 3, fam: 2, flash: 1 }),
  BT('st_lapstrake', 'A Thompson lapstrake motorboat', 2200, 5, "Cedar planks, a windshield, water-skiing for the kids.", { relief: 4, fam: 4, flash: 2 }),
  BT('st_eggharbor', 'An Egg Harbor sport-fishing boat', 9000, 20, "Built across the bay in Egg Harbor City: mahogany, a flying bridge, twin engines.", { relief: 7, fam: 4, respect: 2, flash: 4, unl: ['boat', 'bigboat'], needs: ['slip'] }),
  BT('st_sailboat', 'A Lightning-class sailboat', 1800, 3, "Nineteen feet, a race on Sunday afternoons with the yacht club.", { relief: 4, fam: 2, flash: 2, g: { society: 1 } }),
  BT('st_yacht', 'A 65-foot motor yacht (a Trumpy from Annapolis)', 120000, 420, "Teak decks, a crew of three, staterooms for eight. Senators have spent weekends on boats like this.", { respect: 8, fam: 6, relief: 12, flash: 10, unl: ['boat', 'bigboat', 'yacht'], needs: ['slip'], stock: 1, resale: 0.65, drift: -0.04, notice: ['Every family in Philadelphia', 'The IRS', 'The FBI'], advice: "A yacht is a bill that floats. The crew, the fuel and the yard will cost us more every year than the boat earns in friends." }),
  X('vehicles', 'cars', 'svc', 'st_autoins', 'Auto insurance on the cars', 40, 8, "Fire, theft, liability, from an agent who doesn't ask who drives.", { flash: 0, needs: ['car'], relief: 1, mods: { strikeDamage: 3 } }),
  X('vehicles', 'cars', 'svc', 'st_mechanic', 'A mechanic on account', 30, 15, "He keeps the cars running and checks under them for things that shouldn't be there.", { flash: 0, needs: ['car'], mods: { guard: 2 } }),
  X('vehicles', 'cars', 'svc', 'st_gasacct', 'A gas account at the Esso station', 10, 10, "Fill up, sign the slip, the station sends a bill at the end of the month.", { flash: 0, needs: ['car'] }),
  X('vehicles', 'cars', 'svc', 'st_parking', 'Garage space downtown', 20, 6, "A heated bay in a garage on Atlantic Avenue: the car is never on the street.", { flash: 0, needs: ['car'], mods: { guard: 1 } }),
  X('vehicles', 'boats', 'svc', 'st_boatins', 'Marine insurance and the yard', 50, 15, "Haul-out in the fall, bottom paint in the spring, a policy against the next hurricane.", { flash: 0, needs: ['boat'] }),
  X('vehicles', 'boats', 'svc', 'st_yachtcrew', 'A yacht captain and crew', 200, 160, "A captain, a mate and a cook in white jackets.", { flash: 3, needs: ['yacht'], relief: 3, mods: { secrecy: 3 } }),
  // Race cars and the team.
  R('st_testarossa', 'A Ferrari 250 Testa Rossa (a sports racer)', 13000, 40, "Red valve covers, a V12, it won Le Mans. A car built to race, not to park.", { respect: 4, relief: 5, flash: 8, stock: 1, racer: 88, unl: ['racecar'], maxYear: 1962, resale: 0.7, drift: 0, notice: ['Every car man on the island'] }),
  R('st_birdcage', 'A Maserati Tipo 61 "Birdcage"', 14000, 40, "A frame of two hundred tiny tubes under an aluminum skin. It won Sebring.", { respect: 4, relief: 5, flash: 8, stock: 1, racer: 90, unl: ['racecar'], maxYear: 1962, resale: 0.6, drift: -0.05 }),
  R('st_porsche718', 'A Porsche 718 RS 60 Spyder', 9000, 30, "Small, silver, German, and it beats cars twice its size on a tight course.", { respect: 3, relief: 4, flash: 6, stock: 2, racer: 84, unl: ['racecar'], resale: 0.6, drift: -0.05 }),
  R('st_racevette', 'A Corvette prepared for SCCA racing', 6000, 25, "Numbers on the doors, a roll bar, the bumpers gone.", { respect: 2, relief: 4, flash: 5, racer: 72, unl: ['racecar'], resale: 0.4, drift: -0.1 }),
  X('vehicles', 'racing', 'svc', 'st_raceteam', 'A race team: Sebring entry, drivers and pit crew', 2500, 250, "Two drivers who've raced in Europe, a crew chief, a transporter truck painted in your colors.", { respect: 2, flash: 6, needs: ['racecar'], unl: ['raceteam'], hire: { skill: 70, rep: 'Two podiums at Watkins Glen', avail: 'From the spring season' }, notice: ['The press', 'The other families'] }),

  // ================================ RACEHORSES ================================
  H('st_claimer', 'A claimer from a Garden State claiming race', 3500, 45, "A five-year-old gelding with honest legs. Somebody else can claim him off you too.", { cls: 'claimer', speed: 55 }, { flash: 2, respect: 1, advice: "A claimer pays his feed now and then. Run him where he belongs and someone may claim him off us: that's the game." }),
  H('st_allowance', 'An allowance horse', 9000, 60, "A four-year-old filly who wins at Monmouth when the track is fast.", { cls: 'allowance', speed: 67 }),
  H('st_stakeshorse', 'A stakes horse with a pedigree', 40000, 95, "A three-year-old colt by a Derby winner. The Garden State Stakes, maybe. Maybe.", { cls: 'stakes', speed: 82 }, { stock: 1, respect: 5, relief: 5, flash: 7, g: { society: 5 }, notice: ['Society', 'The press'], advice: "A real horse: the purses are big, the feed is bigger, and a bowed tendon ends it overnight." }),
  H('st_yearling', 'A yearling from the Saratoga sales', 12000, 50, "Long legs, a good walk, a pedigree on two pages. Nobody knows yet.", { cls: 'allowance', speed: 70 }, { months: [8], flash: 4, g: { society: 3 } }),
  X('lifestyle', 'racing', 'svc', 'st_trainer', 'A trainer from Kentucky', 200, 100, "He has the horses out at five in the morning and says nothing to the press.", { needs: ['horse'], horseBoost: 4, flash: 1, hire: { skill: 75, rep: 'Saddled a winner in the Jersey Derby', avail: 'Now' } }),
  X('lifestyle', 'racing', 'svc', 'st_stable', 'Stalls and a groom at Garden State Park', 100, 45, "Two stalls on the backstretch, a groom who sleeps in the tack room.", { needs: ['horse'], horseBoost: 2, flash: 1 }),
  X('lifestyle', 'racing', 'svc', 'st_jockey', 'First call on a top jockey', 150, 70, "He rides your horses first, and he's never been caught doing anything.", { needs: ['horse'], horseBoost: 3, flash: 2 }),
  X('lifestyle', 'racing', 'svc', 'st_box', 'A box at the rail at Garden State Park', 300, 25, "Six chairs at the finish line, a waiter, your name on a brass plate.", { respect: 2, relief: 2, flash: 4, g: { society: 2, pols: 1 } }),

  // ================================ CREW & SERVICES ================================
  S('st_corplawyer', 'A corporate lawyer (Philadelphia)', 500, 200, "Wills, deeds, corporations inside corporations. He never asks what the money is.", { skill: 80, rep: 'A Penn man; partners with a former judge', avail: 'Now' }, { mods: { irsShield: 10, declared: 40 }, relief: 2 }),
  S('st_bizmanager', 'A business manager', 150, 90, "He runs the books of your straight businesses and nags about the inventory.", { skill: 65, rep: 'Ran a chain of five shoe stores', avail: 'Now', conflict: 'Also keeps the books of a man in Philadelphia' }, { mods: { income: 3 } }),
  S('st_finadviser', 'A finance adviser', 200, 80, "Stocks, bonds, a Swiss account he only mentions on the phone at the club.", { skill: 70, rep: 'A broker at a Walnut Street firm', avail: 'Now' }, { mods: { launder: 3 }, advice: "He'll make the money look like money. He'll also know where it is." }),
  S('st_propmanager', 'A property manager', 80, 50, "Collects the rents, fixes the boilers, throws out the deadbeats.", { skill: 60, rep: 'Manages half the rooming houses in town', avail: 'Now' }, { mods: { income: 2 } }),
  S('st_assistant', 'A personal assistant', 60, 40, "Your calendar, your errands, your messages. She remembers everything you tell her to forget.", { skill: 65, rep: 'Was secretary to a state senator', avail: 'Now' }, { relief: 2, mods: { intel: 2 } }),
  S('st_receptionist', 'A receptionist at the office', 40, 30, "She answers the phone with the name of the vending company and screens everybody.", { skill: 50, rep: 'Knows every voice in town', avail: 'Now' }, { mods: { secrecy: 1 } }),
  S('st_watchman', 'A night watchman for the places', 60, 45, "An old cop with a flashlight and a time clock, walking your properties all night.", { skill: 45, rep: 'Thirty years on the force', avail: 'Now' }, { mods: { strikeDamage: 5 } }),
  S('st_guardsvc', 'A security agency contract', 300, 180, "Uniformed guards at the businesses, a car that drives by every hour, a man at the bank deposits.", { skill: 60, rep: 'A Philadelphia agency that guards department stores', avail: 'In two weeks', conflict: 'The agency also works for the insurance companies' }, { mods: { strikeDamage: 10, guard: 3 }, flash: 2 }),
  S('st_bartenders', 'Bartenders and waiters for the house', 120, 90, "For the parties, the Sunday dinners, the nights the capos come over.", { skill: 55, rep: 'From the Latin Casino', avail: 'Weekends' }, { crew: 2, fam: 1 }),
  S('st_chef', 'A chef from New York', 250, 120, "He cooked at a famous restaurant on 52nd Street. The veal alone is worth it.", { skill: 85, rep: 'Two years at a famous New York room', avail: 'Now' }, { respect: 1, fam: 2, health: 1, flash: 3 }),
  S('st_houseband', 'A house band for the parties', 200, 120, "A six-piece combo, a girl singer, every song your wife likes.", { skill: 70, rep: 'Played the 500 Club', avail: 'Weekends' }, { fam: 2, crew: 2, relief: 2, flash: 2 }),
  S('st_contractor', 'A construction contractor on call', 150, 60, "Whatever you need built, fixed or poured, by Monday.", { skill: 65, rep: 'Poured half the foundations in the Crest', avail: 'Now', conflict: 'Also bids on the city jobs' }, { g: { labor: 1 } }),
  S('st_publicist', 'A publicist', 250, 120, "He gets your name in the paper next to the word \"philanthropist\" and out of it next to anything else.", { skill: 70, rep: 'Represented a crooner and a senator', avail: 'Now' }, { g: { press: 3 }, mods: { fedHeat: 1 }, flash: 1 }),
  S('st_pi', 'A private investigator', 200, 100, "An ex-FBI man with a camera, a car nobody notices and an appetite for overtime.", { skill: 75, rep: 'Ten years with the Bureau', avail: 'Now', conflict: 'Still has friends at the Bureau' }, { mods: { intel: 8 } }),
  S('st_doctor', 'A doctor on call', 150, 70, "He comes to the house, patches anybody, and writes \"fell down the stairs\".", { skill: 75, rep: 'Chief of surgery at the county hospital', avail: 'Day or night' }, { health: 2, crew: 2, mods: { secrecy: 2 } }),
  S('st_householdstaff', 'Household staff (a couple who live in)', 150, 110, "A cook and a houseman, married, from the old country, who see nothing.", { skill: 60, rep: 'Worked for a Main Line family', avail: 'Now' }, { fam: 3, relief: 2, flash: 2 }),

  // ================================ EQUIPMENT ================================
  E('st_register', 'A cash register (National, brass)', 400, 0, "It rings, it counts, it prints a tape the IRS can read.", ['shop', 'kitchen', 'bar'], 5, { mods: { declared: 5 } }),
  E('st_safe', 'A safe (Mosler, six hundred pounds)', 800, 0, "Bolted to the floor in the back office. Takes two men an hour, if they know how.", [], 0, { mods: { strikeDamage: 4 }, limit: 2 }),
  E('st_files', 'Filing cabinets (steel, locking)', 150, 0, "Four drawers of receipts that say the right things.", ['office'], 3, { mods: { irsShield: 2 }, limit: 1 }),
  E('st_desk', 'An office desk and chairs', 300, 0, "Steel tanker desk, swivel chair, two chairs for visitors who sit where you say.", ['office'], 5, { limit: 1 }),
  X('equipment', 'equip', 'svc', 'st_phoneline', 'A telephone line for the business', 25, 4, "Your own number in the book, a party line no more.", { equip: { types: ['shop', 'office', 'garage', 'hotel'], cap: 3 } }),
  E('st_extraphone', 'An additional office phone', 60, 2, "A second line, so the bookings don't wait for the book.", ['office', 'hotel'], 5, { limit: 2 }),
  E('st_answering', 'A telephone answering machine', 400, 1, "A tape that answers when you can't. A tape someone can subpoena.", ['office'], 5, { minYear: 1971, limit: 1, mods: { secrecy: -1 } }),
  E('st_radio', 'Two-way radio equipment', 1500, 3, "A base station and radios in the trucks and the taxis.", ['garage'], 10, { mods: { intel: 2 }, limit: 1, notice: ['The FCC', 'The FBI (they listen too)'] }),
  E('st_typewriter', 'An IBM electric typewriter', 450, 0, "Letters that look like a bank sent them.", ['office'], 4, { limit: 2 }),
  E('st_adding', 'An adding machine', 200, 0, "A Burroughs with a crank: the numbers come out right, or at least the same.", ['office', 'shop'], 3, { limit: 2 }),
  E('st_xerox', 'A Xerox 914 photocopier (leased)', 300, 30, "A copy of anything in seven seconds. Including things that should only exist once.", ['office'], 8, { minYear: 1961, limit: 1, mods: { secrecy: -1 } }),
  E('st_computer', 'A business computer (time-shared)', 15000, 150, "A terminal, a modem, and a company in Philadelphia that runs your books on a machine.", ['office'], 20, { minYear: 1975, limit: 1 }),
  E('st_fridges', 'Refrigerators and freezers (walk-in)', 2500, 3, "A walk-in box: the beef keeps, the fish keeps, other things keep too.", ['kitchen', 'bakery'], 10),
  E('st_kitchen', 'A commercial kitchen (Hobart, Garland)', 7000, 5, "Six burners, two ovens, a dishwasher, a hood. Twice the plates out of the same room.", ['kitchen'], 30, { advice: "More plates if the people come. It doesn't bring the people." }),
  E('st_pizzaoven', 'A pizza oven (Blodgett deck)', 1200, 1, "Four pies at a time, eight hundred degrees.", ['kitchen'], 15),
  E('st_bakeoven', 'A bakery oven (revolving tray)', 3000, 2, "The bread goes round like a Ferris wheel.", ['bakery'], 30),
  E('st_laundrymachines', 'Laundry machines (a row of Westinghouse washers)', 4000, 4, "Twenty machines, coin slots, dryers that eat socks.", ['laundry'], 30, { mods: { launder: 1 } }),
  E('st_jukebox', 'A Seeburg jukebox', 1200, 1, "A hundred selections and the light show. A nickel a play, or a dime for three.", ['bar', 'arcade'], 10, { pot: 'pocket', fam: 3, relief: 3, flash: 1 }),
  E('st_vendingmachines', 'Vending machines (cigarettes, candy, soda)', 1500, 2, "In every lobby and every bar. The quarters count themselves.", ['bar', 'arcade', 'hotel'], 10),
  E('st_arcadecabs', 'Arcade cabinets (pinball, Skee-Ball, a fortune teller)', 3500, 4, "A row of Gottliebs, the Skee-Ball lanes, Zoltar in a glass box.", ['arcade'], 25),
  E('st_pooltable', 'A Brunswick pool table', 800, 0, "Slate, green felt, the crew plays for quarters. The boss never loses.", ['bar', 'arcade'], 8, { pot: 'pocket', fam: 1, relief: 3, respect: 1 }),
  E('st_stagelights', 'Stage lighting', 2500, 2, "Spots, gels, a dimmer board: the girl singer glows.", ['stage', 'hotel'], 15),
  E('st_sound', 'A sound system (Altec Lansing)', 2000, 1, "Speakers the size of refrigerators. The band sounds like a record.", ['stage', 'bar', 'hotel'], 15),
  E('st_recording', 'Recording equipment (an Ampex two-track)', 5000, 3, "Tape, microphones, a mixing desk from a radio station.", ['studio'], 30),
  E('st_tools', 'Workshop tools (a lift, a welder, air tools)', 2500, 1, "A hydraulic lift, a welder, a compressor that runs all day.", ['garage'], 15),
  E('st_delivery', 'Delivery equipment (racks, hand trucks, a cooler truck)', 2000, 4, "Deliveries to the motels and the bars before breakfast.", ['kitchen', 'bakery', 'shop'], 10),
  E('st_firealarm', 'Fire alarms and sprinklers', 1500, 1, "The insurance man smiles. The fire marshal stops asking.", [], 0, { mods: { strikeDamage: 6 }, limit: 1 }),
  E('st_locks', 'New locks on every building', 300, 0, "Medeco cylinders, a locksmith who keeps no copies. Supposedly.", [], 0, { mods: { guard: 1 }, limit: 1 }),
  E('st_securitylights', 'Security lighting', 600, 2, "Floodlights on the lots and the back doors. Nobody works in the dark now.", [], 0, { mods: { guard: 1, strikeDamage: 2 }, limit: 1 }),
  E('st_alarm', 'An alarm system (wired to the station)', 2000, 4, "Bells, a direct line to the police station — so the police know when you're open, too.", [], 0, { mods: { strikeDamage: 8, guard: 1, secrecy: -1 }, limit: 1 }),
  E('st_cameras', 'Closed-circuit cameras', 6000, 6, "Grey monitors in the back office, a camera on every door.", [], 0, { minYear: 1968, mods: { guard: 3, intel: 2 }, limit: 1 }),

  // ================================ ARMORY (abstract) ================================
  A('st_revolvers', 'Revolvers (.38 Specials, a half-dozen)', 300, 0, "Smith & Wessons, clean, from a sporting-goods store in Pennsylvania.", 3, { arms: { pts: 3, carry: true } }),
  A('st_pistols', 'Semiautomatic pistols (.45s, a half-dozen)', 450, 0, "Army Colts, the kind the men carried home from the war.", 4, { arms: { pts: 4, carry: true } }),
  A('st_shotguns', 'Shotguns (pump, a half-dozen)', 400, 0, "Ithacas and Remingtons. Duck season, officially.", 5, { arms: { pts: 5 } }),
  A('st_rifles', 'Hunting rifles', 500, 0, "Deer rifles with scopes, for the camp in the pines.", 3, { arms: { pts: 3 } }),
  A('st_tommy', 'A Thompson submachine gun (registered: a federal file)', 1500, 0, "Registered under the 1934 Act: a tax stamp, fingerprints, and your name in Washington.", 8, { arms: { pts: 8 }, flash: 3, limit: 1, notice: ['The FBI', 'The Treasury (Alcohol and Tobacco Tax)'], advice: "Every one of these is a file in Washington. It frightens people, including the ones who write indictments." }),
  A('st_carbines', 'M1 carbines (army surplus)', 600, 0, "Light, reliable, sold by mail order through the gun magazines.", 5, { arms: { pts: 5 } }),
  X('armory', 'armory', 'svc', 'st_ammo', 'Ammunition supply (a sporting-goods account)', 50, 15, "Boxes of shells delivered with the fishing tackle.", { arms: { pts: 2 }, flash: 0 }),
  A('st_vests', 'Protective vests (army-surplus flak jackets)', 800, 0, "Heavy, hot, and better than nothing.", 0, { arms: { pts: 0 }, mods: { guard: 3 }, limit: 2 }),
  A('st_gunroom', 'Secure storage (a false wall in the garage)', 700, 0, "A wall that swings out, a cool dry room, a lock only two men can open.", 0, { arms: { pts: 0 }, mods: { secrecy: 2 }, limit: 1, advice: "Nothing is on the premises when they come with a warrant. That's worth more than another crate." }),
  X('armory', 'armory', 'svc', 'st_gunsmith', 'Maintenance (a gunsmith on account)', 60, 20, "A quiet man in the pines who cleans, fixes and forgets.", { arms: { pts: 0, train: 0.1 }, flash: 0 }),
  X('armory', 'armory', 'svc', 'st_range', 'Training at a range in the Pine Barrens', 100, 40, "A sand pit, targets on hay bales, a former Marine who shouts.", { arms: { pts: 0, train: 0.25 }, crew: 1, flash: 0, advice: "Training and judgment matter more than another box of guns. A man who knows when not to shoot is worth two who can." }),

  // ================================ LIFESTYLE: watches, jewelry, gifts ================================
  L('style', 'own', 'st_submariner', 'A Rolex Submariner', 200, 0, "Steel, black, waterproof to a hundred meters. You'll wear it in the shower.", { respect: 1, flash: 2, resale: 0.8, drift: 0.05, gift: 'anyone' }),
  L('style', 'own', 'st_dayDate', 'A Rolex Day-Date in gold', 800, 0, "The President's watch: the day of the week spelled out in a window.", { respect: 2, flash: 4, resale: 0.75, drift: 0.04, gift: 'anyone' }),
  L('style', 'own', 'st_seamaster', 'An Omega Seamaster', 150, 0, "Gold-capped, a seahorse on the back.", { respect: 1, flash: 1, resale: 0.5, drift: 0.02, gift: 'anyone' }),
  L('style', 'own', 'st_speedmaster', 'An Omega Speedmaster chronograph', 160, 0, "Three dials, a tachymeter. Time the horses with it.", { flash: 1, resale: 0.6, drift: 0.05, gift: 'son' }),
  L('style', 'own', 'st_cartier', 'A Cartier Tank watch', 600, 0, "Rectangular, gold, French. Elegant men wear these.", { respect: 1, flash: 3, resale: 0.6, drift: 0.02, gift: 'anyone' }),
  L('style', 'own', 'st_vacheron', 'A Vacheron Constantin', 1100, 0, "Older than America's watchmakers, thin as a coin.", { respect: 2, flash: 3, resale: 0.7, drift: 0.03 }),
  L('style', 'own', 'st_hamilton', 'A Hamilton Electric Ventura', 175, 0, "The first electric watch: a triangle of gold that hums.", { flash: 2, resale: 0.4, drift: 0, gift: 'anyone' }),
  L('style', 'own', 'st_audemars', 'An Audemars Piguet perpetual calendar', 1600, 0, "It knows the leap years. One came into New York this year.", { respect: 2, flash: 4, stock: 1, resale: 0.8, drift: 0.04 }),
  L('jewelry', 'own', 'st_diamondnecklace', 'A diamond necklace for your wife', 9000, 0, "A river of stones, platinum, for New Year's Eve at the Latin Casino.", { wife: 13, fam: 2, flash: 7, req: 'spouse', gift: 'wife', resale: 0.5, drift: 0.02, notice: ['Every wife on the island'] }),
  L('jewelry', 'own', 'st_rubyring', 'A ruby ring for your wife', 1800, 0, "Pigeon's-blood red, from a jeweler on Sansom Street.", { wife: 7, flash: 3, req: 'spouse', gift: 'wife' }),
  L('jewelry', 'once', 'st_emerald_g', 'An emerald cocktail ring for the goomar', 2000, 0, "Green as money, big as a grape.", { wife: 9, flash: 3, req: 'goomar', gift: 'goomar', cd: 13, risk: { p: 0.25, wife: -10, text: "Your wife saw the jeweler's box in the glove compartment. It was not her size." } }),
  L('jewelry', 'once', 'st_medal_son', 'A gold chain with a St. Christopher medal for your son', 120, 0, "Patron saint of travelers. He'll never take it off.", { fam: 3, flash: 0, req: 'son16', gift: 'son', cd: 104 }),
  L('jewelry', 'once', 'st_pearls_mother', 'A pearl necklace for your mother', 500, 0, "She'll wear it to Mass and to your funeral.", { fam: 5, flash: 1, req: 'parent', gift: 'mother', cd: 104 }),
  L('jewelry', 'own', 'st_ringyou', 'A sapphire ring for yourself', 900, 0, "A star sapphire set in gold. The capos notice it at the table.", { respect: 1, flash: 3 }),
  G('st_chanel', 'Chanel No. 5 for your wife', 25, "The big bottle, from Wanamaker's.", 'wife', { wife: 2, req: 'spouse', flash: 0 }),
  G('st_joy', 'Joy perfume for the goomar', 40, "The most expensive perfume in the world, they say.", 'goomar', { wife: 3, req: 'goomar', flash: 0, risk: { p: 0.1, wife: -4, text: 'Your wife smelled a perfume on your collar she does not own.' } }),
  G('st_cologne', 'Cologne for yourself (4711 and Old Spice)', 10, "The barber says it's the best.", 'anyone', { relief: 1, flash: 0, cd: 8 }),
  G('st_roses', 'Two dozen roses for your wife', 12, "Long-stemmed, red, delivered to the door with a card.", 'wife', { wife: 2, req: 'spouse', flash: 0, cd: 2 }),
  G('st_roses_g', 'Roses for the goomar', 12, "Delivered to her apartment, no card.", 'goomar', { wife: 2, req: 'goomar', flash: 0, cd: 2 }),
  X('lifestyle', 'gifts', 'svc', 'st_florist_order', 'A standing order with the florist', 10, 8, "Fresh flowers in the house every Friday.", { wife: 3, req: 'spouse', flash: 0 }),
  G('st_whitmans', "A Whitman's Sampler", 3, "The yellow box with the map inside.", 'anyone', { wife: 1, flash: 0, cd: 2 }),
  G('st_godiva', 'Belgian chocolates from a Fifth Avenue shop', 15, "A gold box, a ribbon, a tiny card in French.", 'anyone', { wife: 2, flash: 0, minYear: 1966 }),
  G('st_dinner_bookbinders', 'Dinner for two at Bookbinders', 40, "Snapper soup, a lobster the size of a cat, the old waiters.", 'wife', { wife: 4, req: 'spouse', relief: 2, flash: 1, cd: 2 }),
  G('st_dinner_zaberers', "A family dinner at Zaberer's", 60, "The biggest restaurant at the shore: the wagon wheels, the prime rib, the gift shop.", 'anyone', { fam: 3, relief: 1, flash: 1, cd: 2 }),
  G('st_theater', 'Theater tickets: a hit musical in New York', 60, "Orchestra seats, dinner before, the train home.", 'wife', { wife: 4, relief: 2, flash: 1, cd: 4 }),
  G('st_concert', 'Concert tickets: the crooner at the 500 Club', 40, "Ringside, the best voice in the country, an encore for your table.", 'anyone', { wife: 3, relief: 2, flash: 2, cd: 4 }),
  G('st_armynavy', 'The Army-Navy game in Philadelphia', 80, "Municipal Stadium, a hundred thousand people, the President in the stands.", 'son', { fam: 2, crew: 1, relief: 2, flash: 1, months: [11, 12], cd: 52 }),
  G('st_flowers_mother', 'Flowers for your mother every Sunday', 8, "Carnations, the ones she likes.", 'mother', { fam: 1, req: 'parent', flash: 0, cd: 1 }),
  G('st_time_together', 'A day off with your wife: no business, no phone', 10, "A drive to Cape May, lunch, a walk on the beach. She notices that you came.", 'wife', { wife: 6, req: 'spouse', relief: 3, flash: 0, cd: 4, advice: "Some people would rather have you than a bracelet. This one costs a day, not a dollar." }),
  // ---- The house, clubs, the good life
  L('home', 'own', 'st_danish', 'A Danish modern living room', 1500, 0, "Teak, low, clean lines. Your mother calls it uncomfortable.", { fam: 3, wife: 3, flash: 2, req: 'spouse' }),
  L('home', 'own', 'st_bedroomset', 'A bedroom set from a Philadelphia showroom', 900, 0, "A king bed, a vanity with a triple mirror, a cedar chest.", { wife: 3, fam: 1, flash: 1, req: 'spouse' }),
  L('home', 'own', 'st_recordcoll', 'A record collection (Sinatra to Puccini)', 200, 0, "A hundred albums in a wall unit.", { fam: 1, relief: 2, flash: 0 }),
  L('home', 'own', 'st_arttwo', 'A painting by a Philadelphia artist', 1200, 0, "A street scene of South Philly. Your mother finds her old building in it.", { fam: 2, flash: 1, resale: 0.8, drift: 0.04, g: { society: 1 } }),
  L('home', 'own', 'st_modernart', 'A modern painting from a New York gallery', 8000, 0, "Splashes. The man swears it'll be in a museum. The capos are not sure what it is.", { respect: 1, flash: 4, resale: 0.9, drift: 0.08, g: { society: 3 }, crew: -1 }),
  L('home', 'once', 'st_homebar', 'A home bar (a curved Formica bar, stools, neon)', 1800, 0, "A bar of your own, with a mirror and a neon sign that says your name.", { crew: 2, relief: 2, fam: 1, flash: 1, cd: 260 }),
  L('home', 'once', 'st_reno', 'A home renovation: a new wing for the family', 15000, 0, "Two bedrooms, a den, a bathroom with gold swan faucets.", { fam: 8, wife: 6, respect: 1, flash: 5, cd: 260 }),
  L('society', 'svc', 'st_yachtclub', 'Membership in the Wildwood Yacht Club', 1500, 15, "A blazer with a crest, a Sunday regatta, the commodore's handshake.", { respect: 2, flash: 2, g: { society: 3 }, needs: ['boat'] }),
  L('society', 'svc', 'st_elks', 'The Elks lodge', 50, 3, "Antlers on the wall, the bar, the clam bake, the businessmen of the island.", { respect: 1, flash: 0, g: { town: 2 } }),
  L('society', 'svc', 'st_variety', 'The Variety Club (a tent of show-business men)', 500, 10, "Charity dinners with comics and bandleaders. Your picture with a celebrity.", { respect: 1, flash: 2, g: { society: 2, press: 1 } }),
  L('society', 'once', 'st_anniv_party', 'An anniversary party for you and your wife', 3000, 0, "A hall, a band, your wedding song, the whole family and the capos.", { wife: 10, fam: 5, crew: 2, flash: 3, req: 'spouse', cd: 52 }),
  L('vice', 'once', 'st_bermuda', 'A week in Bermuda for two', 2200, 0, "Pink sand, a cottage colony, English tea. Nobody you know.", { wife: 8, relief: 8, flash: 2, req: 'spouse', cd: 26 }),
  L('vice', 'once', 'st_acapulco', 'Two weeks in Acapulco', 3000, 0, "The cliff divers, a terrace over the bay, and a man who says he knows a man.", { relief: 9, wife: 4, flash: 3, cd: 26 }),

  // ================================ INVESTMENTS ================================
  I('st_inv_restaurant', 'A minority share in a restaurant (25%)', 5000, 0, "A quarter of the Villa Capri: you get a share of the profit and a reserved table. You don't run it.", { risk: 'medium', ret: [6, 18], liq: 'months', mgmt: 'None: Sal runs the floor', partner: 'Sal Petrillo, the owner' }, { flash: 1, mods: { declared: 25 }, advice: "A quarter of a good restaurant is a quarter of the work's money and none of the work. If Sal drinks, it's a quarter of nothing." }),
  I('st_inv_motel', 'A partnership in a motel (40%)', 15000, 0, "The Satellite Motel, forty rooms. You and the Kaplan brothers split by the deed.", { risk: 'medium', ret: [8, 22], liq: 'months', mgmt: 'A monthly meeting with the brothers', partner: 'Morty and Sid Kaplan' }, { flash: 2, mods: { declared: 50 } }),
  I('st_inv_rental', 'Rental property: a duplex in Rio Grande', 11000, 4, "Two families, two rents, two boilers.", { risk: 'low', ret: [6, 10], liq: 'months', mgmt: 'A property manager or your weekends', partner: 'Nobody: it is yours' }, { mods: { declared: 25 } }),
  I('st_inv_commercial', 'Commercial property: a row of storefronts on New Jersey Avenue', 30000, 10, "Five storefronts, five leases, a parking lot in back.", { risk: 'low', ret: [5, 12], liq: 'years', mgmt: 'A property manager', partner: 'The Ocean City Trust, which holds the mortgage' }, { flash: 2, mods: { declared: 60 } }),
  I('st_inv_expansion', 'Expansion capital for your fronts', 10000, 0, "A second dining room, a new sign, a bigger bar. The fronts earn more if the customers come.", { risk: 'medium', ret: [5, 20], liq: 'years', mgmt: 'Your managers', partner: 'Your own businesses' }, { mods: { income: 3 }, limit: 2 }),
  I('st_inv_newloc', "A second location for a friend's luncheonette", 6000, 0, "Tony's opens a second Tony's in Cape May; you're the money.", { risk: 'high', ret: [-30, 35], liq: 'years', mgmt: "None: Tony's problem", partner: 'Tony Gallo' }),
  I('st_inv_reno', 'A renovation project: fix up a rundown motel and flip it', 20000, 0, "New paint, new neon, a kidney pool, and sell it to a doctor from Philadelphia.", { risk: 'high', ret: [-10, 45], liq: 'years', mgmt: 'A contractor and your patience', partner: 'Lou Ferrante, a builder', term: 26 }, { flash: 1 }),
  I('st_inv_land', 'Land development: subdivide the Diamond Beach marsh', 25000, 0, "Fill, survey, pave, sell lots to people from Philadelphia.", { risk: 'high', ret: [-25, 70], liq: 'years', mgmt: 'The permits, the council, the fill', partner: 'A syndicate with a councilman\'s brother-in-law', term: 52 }, { flash: 2, g: { pols: 2 } }),
  I('st_inv_stocks', 'Company shares through a Walnut Street broker', 10000, 0, "AT&T, General Motors, IBM: blue chips, a statement every month.", { risk: 'low', ret: [3, 12], liq: 'weeks', mgmt: 'None', partner: 'Your broker, Mr. Whitcomb' }, { mods: { declared: 15 }, limit: 5 }),
  I('st_inv_bonds', 'Government bonds (Series E savings bonds)', 5000, 0, "3.75% from Uncle Sam. The safest money there is.", { risk: 'low', ret: [3.75, 3.75], liq: 'months', mgmt: 'None', partner: 'The United States Treasury' }, { limit: 5, mods: { declared: 4 } }),
  I('st_inv_annuity', 'Retirement savings: an annuity', 5000, 0, "Pay in now, a check every month when you're sixty-five, if you get there.", { risk: 'low', ret: [3, 4.5], liq: 'years', mgmt: 'None', partner: 'The Prudential' }, { relief: 2, limit: 3 }),
  I('st_inv_wholelife', 'An insurance policy that builds cash value', 3000, 0, "Whole life: it pays your family, and you can borrow against it.", { risk: 'low', ret: [2, 3], liq: 'months', mgmt: 'None', partner: 'An agent from the Metropolitan' }, { fam: 3, relief: 2, limit: 2 }),
  I('st_inv_film', 'Film-production investment: a drive-in monster picture', 8000, 0, "A creature from the Pine Barrens, shot in three weeks, playing every drive-in in the South.", { risk: 'high', ret: [-80, 160], liq: 'years', mgmt: 'None (you get a credit)', partner: 'Marty Glick, a producer', term: 39 }, { flash: 2, g: { press: 1 }, advice: "Most of these lose everything. One in five pays for the other four." }),
  I('st_inv_session', 'Recording-session funding: a doo-wop group', 1500, 0, "Four boys from South Philly and a song about a girl named Darlene.", { risk: 'high', ret: [-100, 400], liq: 'years', mgmt: 'Get it on the radio', partner: 'The Velvetones and their manager', term: 13 }, { flash: 1 }),
  I('st_inv_sponsor', "Sponsorship of a performer: Vic Corsaro's comeback", 4000, 0, "A crooner who was big in '52. A new arrangement, a residency, a television spot.", { risk: 'high', ret: [-60, 120], liq: 'years', mgmt: 'Book him, keep him sober', partner: 'Vic Corsaro (fictional, and so is his manager)', term: 26 }, { flash: 2, g: { press: 1 } }),
  I('st_inv_vegas', 'A point in a Las Vegas casino (through a front)', 50000, 0, "A piece of a Strip casino, held in a dentist's name. The count room is generous.", { risk: 'high', ret: [10, 40], liq: 'years', mgmt: 'Trust men you have never met', partner: 'A dentist from Cleveland, on paper' }, { flash: 3, g: { philly: 2 }, notice: ['The FBI', 'The Nevada Gaming Commission'], advice: "The skim is real money. So is the Bureau's interest in who owns the points." }),
  I('st_inv_savings', 'A savings account at the Marine National Bank', 2000, 0, "A passbook, interest twice a year, a calendar at Christmas.", { risk: 'low', ret: [3, 3], liq: 'cash', mgmt: 'None', partner: 'Marine National Bank' }, { limit: 5, mods: { declared: 3 } }),
  I('st_inv_note', 'A mortgage note on a motel', 10000, 0, "You lend, they pay you 8%, the motel is the collateral.", { risk: 'medium', ret: [7, 9], liq: 'months', mgmt: 'Collect on the first', partner: 'The Bel-Air Motel\'s owners' }, { mods: { declared: 15 } }),

  // ================================ FAMILY & LEGACY ================================
  F('svc', 'st_vocational', 'Vocational training for your son (a trade and a union card)', 50, 15, "Electrician's school in Philadelphia. A trade nobody can take away.", { fam: 3, req: 'son16', kidAttr: { attr: 'business', amount: 3 }, fut: 'He may end up with his own business, and a life outside the family.' }),
  F('once', 'st_lawschool', 'Law school for your grown child', 4000, 0, "Three years at Penn or Temple. A lawyer in the family.", { fam: 6, flash: 1, req: 'adultChild', each: true, kidAttr: { attr: 'diplomacy', amount: 8 }, g: { society: 2 }, fut: 'A lawyer: maybe yours, maybe one who wants nothing to do with you.' }),
  F('svc', 'st_acting', 'Music or acting lessons for the kids', 20, 8, "A drama coach who was on Broadway once, and a voice teacher.", { fam: 2, req: 'kid', kidAttr: { attr: 'diplomacy', amount: 2 }, fut: 'An artist, maybe, who talks back.' }),
  F('svc', 'st_childcare', 'Childcare for the baby', 40, 25, "A woman from the parish who comes every morning.", { wife: 4, relief: 1, req: 'baby' }),
  F('svc', 'st_elders', 'Support for your elderly relatives', 60, 30, "An envelope every month to the aunts and uncles in South Philly.", { fam: 5, g: { church: 1 } }),
  F('once', 'st_familytrip', 'A family vacation (plan it in the vacation planner)', 1200, 0, "The whole family in the station wagon: a week at a lake, a motel with a pool.", { fam: 6, wife: 4, relief: 5, flash: 1, cd: 26 }),
  F('once', 'st_weddinggift', "A contribution to a niece's wedding", 1000, 0, "An envelope for the bride, the band paid for, your sister in tears.", { fam: 6, flash: 1, cd: 13, g: { church: 1 } }),
  F('once', 'st_relativebiz', "Start-up money for a relative's business", 5000, 0, "Your cousin Frankie's TV repair shop. He swears it's the future.", { fam: 6, flash: 1, cd: 52, advice: "Family money in family businesses: you'll get it back in gratitude, if not in dollars." }),
  F('once', 'st_estateplan', 'Estate planning with the lawyers', 1500, 0, "A will, a trust, a corporation that owns the house. Nothing for the government to seize in one piece.", { relief: 4, fam: 2, flash: 0, cd: 260, irsRelief: 5 }),
  F('own', 'st_trust', 'An inheritance trust for the grandchildren', 10000, 0, "Money in a trust at a Philadelphia bank: nobody touches it until they're twenty-one.", { fam: 8, relief: 3, flash: 0, resale: 1, drift: 0.03, limit: 3 }),
  F('once', 'st_memorial', 'A memorial donation in your father\'s name', 2500, 0, "A wing of the parish school library, a plaque, a Mass.", { fam: 4, respect: 1, flash: 2, cd: 52, g: { church: 4, town: 1 } }),
  F('once', 'st_hospitalgift', 'A charitable donation to the county hospital', 5000, 0, "An iron lung, an X-ray room, your name in the newsletter.", { respect: 2, flash: 3, cd: 52, g: { town: 4, society: 2, press: 1 } }),
  F('once', 'st_firsthome', 'First-home assistance for a nephew', 3000, 0, "The down payment on a Cape Cod in Rio Grande, so he can marry the girl.", { fam: 5, flash: 1, cd: 52 }),
  F('once', 'st_medical_kid', 'Medical treatment for a child (the specialists)', 1500, 0, "The best doctors at Children's Hospital in Philadelphia.", { fam: 6, wife: 4, flash: 0, req: 'kid', cd: 52 }),
  // The deeper catalog (CATALOG_DEEP: more businesses, property, the household, transport, style, experiences, protection).
  ...STORE_ITEMS_2,
];

/** Old Good Life items (goodlife.ts) → the store item that is the same thing. Owned ones keep counting. */
export const LUX_ALIAS: Record<string, string> = {
  cadillac: 'sp_eldorado', lincoln: 'sp_continental', imperial: 'sp_imperial', tbird: 'sp_tbird', corvette: 'sp_corvette', mustang: 'st_mustang',
  pickup: 'st_pickup', boxtruck: 'st_boxtruck', runabout: 'sp_runabout', cruiser: 'sp_cruiser', hifi: 'sp_hifi', jukebox: 'st_jukebox',
  pooltable: 'st_pooltable', colortv: 'sp_colortv', racehorse: 'sp_racehorse', fur: 'sp_mink', rowhouse: 'st_rowhouse', cresthouse: 'st_cresthouse',
  baymansion: 'st_mansion', cottage: 'st_capemay', florida: 'sp_bayharbor', pocono: 'st_pocono',
};

/** Which tab the older Spend items live in (by category, with exceptions). */
export const CAT_TAB: Record<SpendCat, StoreTab> = {
  cars: 'vehicles', boats: 'vehicles', style: 'lifestyle', jewelry: 'lifestyle', home: 'lifestyle', staff: 'services', society: 'lifestyle', family: 'legacy',
  vice: 'lifestyle', power: 'services', crew: 'services', property: 'property', biz: 'property', racing: 'vehicles', equip: 'equipment', armory: 'armory',
  invest: 'invest', services: 'services', gifts: 'lifestyle',
};

export const ID_TAB: Record<string, StoreTab> = {
  sp_stoneharbor: 'property', sp_bayharbor: 'property', sp_huntcamp: 'property', sp_safehouse: 'property', sp_garage: 'property',
  sp_laundromat: 'invest', sp_vending: 'invest', sp_carlot: 'invest', sp_stash: 'invest', sp_bailfund: 'invest', sp_college: 'legacy',
  sp_racehorse: 'lifestyle', sp_derby: 'lifestyle', sp_mausoleum: 'legacy', sp_lifeins: 'invest', sp_poolhall: 'property', sp_warchest: 'armory',
  sp_armor: 'vehicles', sp_bodyguard: 'services', sp_bodyguards: 'services',
};

/** A racehorse's class for the old Spend horse (it predates the store). */
export const LEGACY_HORSE: Record<string, StoreHorse> = { sp_racehorse: { cls: 'allowance', speed: 70 } };
