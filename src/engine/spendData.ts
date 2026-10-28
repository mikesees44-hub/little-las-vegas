import type { PerkKey } from './lifestyle';
import type { Attributes } from './types';

/**
 * THE SPEND CATALOG: what money buys in 1960 (spend.ts runs it). Prices are
 * 1960 dollars (inflated by year at the till); upkeep is weekly.
 *
 * Three kinds of thing:
 *  - own: a possession. It keeps (or loses) value and can be sold.
 *  - svc: a service on retainer (the maid, a driver, a captain on the pad).
 *    A small start-up price, then upkeep every week until you let it go.
 *  - once: an occasion or a donation. Spent and gone; some come round only
 *    in their season (turkeys in November), some once a year, some once per
 *    child or per fallen man.
 *
 * Every item says which pot pays: the boss's Pocket (his own things, his
 * family's parties, his vices) or the Family's money (the pad, the crew,
 * the business of power). `flash` is how visible it is (0-10): what the IRS
 * can see against the income the boss can explain.
 *
 * Real 1960 brands appear as products (a Cadillac, a Patek Philippe); the
 * places are period (Garden State Park, the Latin Casino, the 500 Club,
 * Franklin Field), and no real person is a character.
 */

export type SpendCat = 'cars' | 'boats' | 'style' | 'jewelry' | 'home' | 'staff' | 'society' | 'family' | 'vice' | 'power' | 'crew';
export type SpendGroup = 'church' | 'town' | 'society' | 'pols' | 'cops' | 'press' | 'philly' | 'labor';
export type SpendKind = 'own' | 'svc' | 'once';
/** Perk-style modifiers (read through lifestyle.perkMod) plus two of Spend's own: explainable income and an IRS shield (%). */
export type SpendMod = PerkKey | 'declared' | 'irsShield';
/** Who must exist for it to make sense. `each` items are bought once per such person. */
export type SpendReq = 'spouse' | 'goomar' | 'daughter' | 'son16' | 'kid' | 'baby' | 'communion' | 'confirmation' | 'sixteen' | 'adultChild' | 'marriedChild' | 'parent' | 'fallen';
export type GiftFor = 'wife' | 'goomar' | 'daughter' | 'son' | 'mother' | 'anyone';

export interface SpendItem {
  id: string;
  name: string;
  cat: SpendCat;
  kind: SpendKind;
  pot: 'pocket' | 'family';
  /** 1960 dollars: the purchase, the start-up of a service, the occasion. */
  price: number;
  /** Weekly upkeep (1960 dollars). */
  up: number;
  blurb: string;
  respect?: number;
  /** Everyone of your blood thinks better of you. */
  fam?: number;
  /** Your wife (or the goomar, the daughters, your mother: see `gift`). */
  wife?: number;
  crew?: number;
  /** Stress the boss sheds. */
  relief?: number;
  /** The boss's health. */
  health?: number;
  /** How visible: 0 (nobody sees it) to 10 (the whole island). */
  flash: number;
  /** Goodwill with groups. */
  g?: Partial<Record<SpendGroup, number>>;
  /** While owned or retained. */
  mods?: Partial<Record<SpendMod, number>>;
  /** Tags it gives (a boat → 'boat'), and tags it needs. */
  unl?: string[];
  needs?: string[];
  req?: SpendReq;
  /** Bought once per person who meets `req` (each child's communion). */
  each?: boolean;
  /** The price is per head. */
  per?: 'crew' | 'capo' | 'daughter' | 'child';
  /** How many the house may hold at once (default 1 for own and svc). */
  limit?: number;
  /** How many exist on the island at all: some are one-of-a-kind and sell out. */
  stock?: number;
  minYear?: number;
  maxYear?: number;
  /** Months it can be had (1-12). */
  months?: number[];
  /** Weeks before it can be had again (once items; default 1). */
  cd?: number;
  /** Share of the price it fetches when sold, and how that changes a year. */
  resale?: number;
  drift?: number;
  /** A bet: the chance to win and what a win pays (times the stake). */
  gamble?: { p: number; win: number };
  /** Something that can go wrong: the chance, what it costs with your wife, the words. */
  risk?: { p: number; wife: number; text: string };
  /** The parent's health. */
  parentHealth?: number;
  /** The child's skill (each-child items). */
  kidAttr?: { attr: keyof Attributes; amount: number };
  /** Lowers the IRS's audit pressure (a tax return, a clean set of books). */
  irsRelief?: number;
  /** Who it is for, when it is a present: the gift catalog other systems can use. */
  gift?: GiftFor;
  /** Who else notices, beyond what the effects say. */
  notice?: string[];
}

export const SPEND_CAT_LABEL: Record<SpendCat, string> = {
  cars: 'Cars & drivers', boats: 'Boats & the plane', style: 'Clothes & style', jewelry: 'Jewelry & furs', home: 'The house', staff: 'Staff',
  society: 'Status & society', family: 'Family occasions', vice: 'Vice & leisure', power: 'Business & power', crew: 'The crew',
};
export const SPEND_CATS = Object.keys(SPEND_CAT_LABEL) as SpendCat[];

export const GROUP_LABEL: Record<SpendGroup, string> = {
  church: 'The Church', town: 'The town', society: 'Society', pols: 'The politicians', cops: 'The cops', press: 'The press', philly: 'Philadelphia', labor: 'The unions',
};

type Opt = Partial<Omit<SpendItem, 'id' | 'name' | 'cat' | 'price' | 'up' | 'blurb'>>;

const KIND: Record<SpendCat, SpendKind> = { cars: 'own', boats: 'own', style: 'own', jewelry: 'own', home: 'own', staff: 'svc', society: 'once', family: 'once', vice: 'once', power: 'once', crew: 'once' };
const RESALE: Partial<Record<SpendCat, [number, number]>> = { cars: [0.6, -0.1], boats: [0.6, -0.05], style: [0.1, -0.2], jewelry: [0.5, 0], home: [0.5, -0.03] };

function I(cat: SpendCat, id: string, name: string, price: number, up: number, blurb: string, o: Opt = {}): SpendItem {
  const kind = o.kind ?? KIND[cat];
  const [resale, drift] = kind === 'own' ? RESALE[cat] ?? [0.5, -0.05] : [0, 0];
  return { id, name, cat, kind, pot: cat === 'power' || cat === 'crew' ? 'family' : 'pocket', price, up, blurb, flash: 0, resale, drift, ...o };
}

const SUMMER = [6, 7, 8];

export const SPEND: SpendItem[] = [
  // ---- Cars & drivers ---------------------------------------------------------------------------
  I('cars', 'sp_eldorado', 'Cadillac Eldorado Biarritz', 7400, 14, "The convertible: fins, chrome, a white top. Nothing on the island says it louder.", { respect: 3, fam: 3, relief: 3, flash: 7, unl: ['car'], gift: 'anyone', limit: 2 }),
  I('cars', 'sp_sedandeville', 'Cadillac Sedan de Ville', 5300, 11, "Four doors, black, the car the doctors drive. Respectable.", { respect: 2, fam: 3, relief: 2, flash: 5, unl: ['car'], limit: 2 }),
  I('cars', 'sp_fleetwood75', 'Cadillac Fleetwood 75 limousine', 9700, 20, "Jump seats, a glass partition. For weddings, funerals and arriving.", { respect: 4, fam: 2, flash: 7, unl: ['car', 'limo'] }),
  I('cars', 'sp_markv', 'Lincoln Continental Mark V', 6850, 13, "The last of the big ones, a block long. 1960 only.", { respect: 3, fam: 2, relief: 2, flash: 6, unl: ['car'], maxYear: 1960 }),
  I('cars', 'sp_continental', 'Lincoln Continental (suicide doors)', 6100, 11, "Black on black, the doors open backwards. A car for sit-downs.", { respect: 3, fam: 2, relief: 2, flash: 6, unl: ['car'], minYear: 1961 }),
  I('cars', 'sp_imperial', 'Chrysler Imperial Crown', 5400, 10, "Big, quiet, and nobody looks twice. Some men prefer that.", { respect: 2, fam: 2, relief: 2, flash: 3, unl: ['car'] }),
  I('cars', 'sp_electra', 'Buick Electra 225', 4300, 9, "The deuce-and-a-quarter: a businessman's car.", { respect: 1, fam: 2, relief: 1, flash: 3, unl: ['car'] }),
  I('cars', 'sp_tbird', 'Ford Thunderbird convertible', 3900, 8, "Top down on Ocean Avenue in July.", { respect: 1, fam: 4, relief: 4, flash: 4, unl: ['car'], gift: 'anyone' }),
  I('cars', 'sp_corvette', 'Chevrolet Corvette', 3900, 8, "Two seats and a lot of noise. Mid-life, on wheels.", { respect: 1, fam: 2, relief: 5, flash: 5, unl: ['car'], gift: 'son' }),
  I('cars', 'sp_300sl', 'Mercedes-Benz 300SL roadster', 11000, 20, "The only one in South Jersey. German, silver, and it holds its value.", { respect: 4, relief: 5, flash: 9, unl: ['car'], stock: 1, maxYear: 1963, resale: 0.85, drift: 0.02, notice: ['Every car man on the island'] }),
  I('cars', 'sp_rolls', 'Rolls-Royce Silver Cloud II', 15600, 28, "Hand-built in Crewe. Two came into the port of Philadelphia this year.", { respect: 6, fam: 3, relief: 4, flash: 10, unl: ['car', 'limo'], stock: 2, resale: 0.7, drift: -0.04, notice: ['Every family in Philadelphia'] }),
  I('cars', 'sp_wagon', 'Ford Country Squire station wagon', 3000, 6, "Wood on the sides, room for the kids and the groceries.", { fam: 5, relief: 1, flash: 1, unl: ['car'] }),
  I('cars', 'sp_impala', 'Chevrolet Impala convertible', 3100, 6, "Red, white top, the radio on WIBG.", { fam: 3, relief: 3, flash: 3, unl: ['car'], gift: 'anyone' }),
  I('cars', 'sp_falcon', 'A first car for your son: a Ford Falcon', 2000, 4, "Sensible, cheap, and he will wash it every Saturday.", { fam: 6, flash: 1, req: 'son16', gift: 'son', kind: 'once', cd: 52 }),
  I('cars', 'sp_armor', 'Armor plating on the car', 6000, 4, "Steel in the doors, glass an inch thick. The car sits lower and so do you.", { respect: 1, relief: 4, flash: 4, mods: { guard: 15 }, needs: ['car'], resale: 0.2, drift: -0.1, notice: ['The other families', 'The FBI'] }),
  I('cars', 'sp_driver', 'A driver', 140, 70, "A man who drives, waits, watches the mirrors and keeps his mouth shut.", { kind: 'svc', respect: 1, relief: 3, flash: 2, mods: { guard: 5 }, needs: ['car'] }),
  I('cars', 'sp_carphone', 'A radiotelephone in the car', 1200, 15, "Call the club from the causeway. The operator listens, and maybe somebody else.", { respect: 1, flash: 2, mods: { intel: 5, secrecy: -3 }, needs: ['car'], resale: 0.2, drift: -0.2 }),
  I('cars', 'sp_garage', 'A heated four-car garage', 4000, 5, "For the collection. Nobody parks on the street anymore.", { respect: 1, relief: 1, flash: 2, needs: ['car'], kind: 'own', resale: 0.8, drift: 0.02 }),

  // ---- Boats & the plane ------------------------------------------------------------------------
  I('boats', 'sp_runabout', 'Chris-Craft Sportsman runabout', 4500, 10, "Mahogany and chrome. Out the inlet on a Sunday.", { fam: 5, relief: 6, flash: 4, unl: ['boat'] }),
  I('boats', 'sp_whaler', 'A Boston Whaler for the kids', 1500, 3, "Unsinkable, they say. The kids learn the back bay.", { fam: 5, relief: 2, flash: 1, unl: ['boat'], minYear: 1961 }),
  I('boats', 'sp_slip', 'A slip at Otten\'s Harbor', 300, 12, "A berth for a real boat, with the charter captains for neighbors.", { kind: 'svc', flash: 1, unl: ['slip'] }),
  I('boats', 'sp_cruiser', 'Chris-Craft Constellation cabin cruiser', 28000, 45, "Forty feet, a galley, two cabins. Where the important talks happen.", { respect: 4, fam: 6, relief: 10, flash: 7, unl: ['boat', 'bigboat'], needs: ['slip'] }),
  I('boats', 'sp_sportfisher', 'A 41-foot Hatteras sportfisherman', 42000, 70, "Fiberglass, twin diesels, a tuna tower. The first one at the shore.", { respect: 5, relief: 10, flash: 8, unl: ['boat', 'bigboat'], needs: ['slip'], stock: 1, minYear: 1961 }),
  I('boats', 'sp_skipper', 'A captain for the boat', 120, 60, "An old Coast Guard man. Knows the inlet, the weather and when not to hear.", { kind: 'svc', relief: 3, flash: 1, mods: { secrecy: 3 }, needs: ['bigboat'] }),
  I('boats', 'sp_watersit', 'A sit-down on the water', 300, 0, "Out past the three-mile line, engines off. No wires out here.", { kind: 'once', g: { philly: 3 }, crew: 1, flash: 0, needs: ['boat'], cd: 4 }),
  I('boats', 'sp_tuna', 'Enter the Wildwood tuna tournament', 500, 0, "Two days offshore with the crew, a cooler of beer and a weigh-in.", { kind: 'once', respect: 2, crew: 3, relief: 5, flash: 2, needs: ['bigboat'], months: [7, 8], cd: 52, g: { town: 2 } }),
  I('boats', 'sp_plane', 'A share in a Beechcraft at Cape May County airport', 25000, 80, "Twin engines, a pilot on call. Philadelphia in forty minutes, Miami by dinner.", { respect: 4, relief: 4, flash: 7, unl: ['plane'], minYear: 1962, stock: 2, resale: 0.6, drift: -0.06 }),
  I('boats', 'sp_nassau', 'A weekend in Nassau by private plane', 3000, 0, "The casinos, the bankers who ask no questions, back by Monday.", { kind: 'once', relief: 8, wife: 4, flash: 4, needs: ['plane'], cd: 8 }),

  // ---- Clothes & style ---------------------------------------------------------------------------
  I('style', 'sp_suit', 'A suit from a Chestnut Street tailor', 250, 0, "Three fittings, a lining in your initials.", { respect: 1, relief: 1, flash: 1, limit: 3 }),
  I('style', 'sp_suits12', 'A dozen custom suits: silk, mohair, sharkskin', 2800, 2, "A closet that shines. The men copy the cut.", { respect: 3, relief: 2, flash: 3, crew: 1 }),
  I('style', 'sp_brooks', 'A Brooks Brothers sack suit (for court)', 110, 0, "Grey, plain, a jury's idea of an honest businessman.", { flash: 0, mods: { accept: 1 } }),
  I('style', 'sp_camel', 'A camel-hair overcoat', 175, 0, "Double-breasted, to the knee. The winter uniform.", { respect: 1, flash: 2 }),
  I('style', 'sp_cashmere', 'A cashmere topcoat', 300, 0, "Charcoal, soft as a cat.", { respect: 1, relief: 1, flash: 2 }),
  I('style', 'sp_fedoras', 'Borsalino fedoras, a half-dozen', 150, 0, "Italian felt, a snap brim, one for every suit.", { respect: 1, flash: 2 }),
  I('style', 'sp_homburg', 'A black homburg', 40, 0, "For funerals and the Cardinal's dinner.", { flash: 1, g: { church: 1 } }),
  I('style', 'sp_cufflinks', 'Gold and onyx cufflinks', 180, 0, "Square, heavy, monogrammed.", { respect: 1, flash: 2, gift: 'anyone' }),
  I('style', 'sp_stickpin', 'A diamond stickpin', 600, 0, "It catches the light at the bar.", { respect: 1, flash: 4 }),
  I('style', 'sp_pinky', 'A diamond pinky ring', 1500, 0, "Two carats on the little finger. Every man at the table sees it.", { respect: 2, flash: 5, resale: 0.5, drift: 0 }),
  I('style', 'sp_patek', 'A Patek Philippe Calatrava', 900, 0, "Gold, thin, Swiss. Your grandson will wear it.", { respect: 2, relief: 1, flash: 3, resale: 0.7, drift: 0.03, gift: 'anyone' }),
  I('style', 'sp_rolex', 'A Rolex Datejust', 300, 0, "Steel and gold, the date in a little window.", { respect: 1, flash: 2, resale: 0.6, drift: 0.02, gift: 'anyone' }),
  I('style', 'sp_moneyclip', 'A gold money clip with your initials', 90, 0, "For the roll. Hundreds outside, singles inside.", { flash: 2, gift: 'anyone' }),
  I('style', 'sp_gators', 'Hand-made alligator shoes', 120, 0, "From a shoemaker in South Philly who also does the Cardinal.", { respect: 1, flash: 2 }),
  I('style', 'sp_shirts', 'Shirts by the dozen from a Fifth Avenue shirtmaker', 300, 0, "Sea Island cotton, French cuffs, your initials over the heart.", { respect: 1, flash: 2 }),
  I('style', 'sp_tux', 'A midnight-blue tuxedo', 220, 0, "Blacker than black under the lights at the Latin Casino.", { respect: 1, flash: 2, unl: ['tux'] }),
  I('style', 'sp_cigcase', 'A gold cigarette case', 250, 0, "Engraved, a lighter to match.", { flash: 2, gift: 'anyone' }),
  I('style', 'sp_barber', 'The barber every morning', 16, 8, "A shave, a manicure, the hot towel, the news.", { kind: 'svc', respect: 1, relief: 2, flash: 1, mods: { intel: 2 } }),
  I('style', 'sp_haber', 'A haberdasher on call', 30, 15, "He comes to the house with the swatches.", { kind: 'svc', respect: 1, flash: 1 }),
  I('style', 'sp_wifewardrobe', 'A season\'s wardrobe for your wife from Wanamaker\'s', 1200, 0, "Dresses, gloves, a hat for Easter, shoes to match.", { kind: 'once', wife: 6, flash: 2, req: 'spouse', gift: 'wife', cd: 13 }),
  I('style', 'sp_easter', 'Easter clothes for the whole family', 300, 0, "New suits for the boys, white gloves for the girls, a picture on the church steps.", { kind: 'once', fam: 4, flash: 1, months: [3, 4], cd: 52, g: { church: 1 } }),

  // ---- Jewelry & furs ----------------------------------------------------------------------------
  I('jewelry', 'sp_anniv', 'A three-carat anniversary diamond for your wife', 6000, 0, "Emerald cut, platinum. She shows her sisters before she shows you.", { wife: 12, fam: 2, flash: 5, req: 'spouse', gift: 'wife', resale: 0.5, drift: 0.02 }),
  I('jewelry', 'sp_bracelet', 'A diamond bracelet for your wife', 2500, 0, "Forty stones in a line. For the Christmas Eve fish dinner.", { wife: 8, flash: 4, req: 'spouse', gift: 'wife' }),
  I('jewelry', 'sp_pearls', 'Cultured pearls for your wife', 800, 0, "Mikimoto, a double strand, a gold clasp.", { wife: 5, flash: 2, req: 'spouse', gift: 'wife' }),
  I('jewelry', 'sp_brooch', 'A jeweled brooch from Fifth Avenue', 1200, 0, "A bird in sapphires. For her good coat.", { wife: 6, flash: 3, req: 'spouse', gift: 'wife' }),
  I('jewelry', 'sp_earrings_g', 'Diamond earrings for the goomar', 1500, 0, "She wears them to dinner on the nights you can't be seen together.", { wife: 8, flash: 2, req: 'goomar', gift: 'goomar', kind: 'once', cd: 8, risk: { p: 0.2, wife: -10, text: "Your wife found the jeweler's receipt in your coat." } }),
  I('jewelry', 'sp_watch_g', 'A gold watch for the goomar', 600, 0, "Small, Swiss, engraved with nothing that could be read in court.", { wife: 5, flash: 1, req: 'goomar', gift: 'goomar', kind: 'once', cd: 8, risk: { p: 0.1, wife: -6, text: 'Somebody saw you at the jeweler\'s with a blonde.' } }),
  I('jewelry', 'sp_stole_g', 'A mink stole for the goomar', 1500, 0, "She wears it to the 500 Club. So does your wife's cousin.", { wife: 9, flash: 3, req: 'goomar', gift: 'goomar', kind: 'once', cd: 13, risk: { p: 0.3, wife: -12, text: "Your wife's cousin saw a mink at the 500 Club and knew the furrier." } }),
  I('jewelry', 'sp_charms', 'Gold charm bracelets for your daughters', 150, 0, "A charm for every birthday from here on.", { wife: 4, fam: 1, flash: 1, req: 'daughter', per: 'daughter', gift: 'daughter', kind: 'once', cd: 26 }),
  I('jewelry', 'sp_firstpearls', 'A first strand of pearls for your daughter', 300, 0, "For her confirmation picture, and her wedding after.", { wife: 6, flash: 1, req: 'daughter', gift: 'daughter', kind: 'once', each: true }),
  I('jewelry', 'sp_mink', 'Full-length ranch mink for your wife', 3000, 1, "For church, the Latin Casino and the other wives.", { wife: 10, fam: 1, flash: 6, req: 'spouse', gift: 'wife', resale: 0.3, drift: -0.05 }),
  I('jewelry', 'sp_chinchilla', 'A chinchilla coat', 12000, 2, "There is one on the East Coast in her size. It is grey and it is famous.", { wife: 14, respect: 2, flash: 9, req: 'spouse', gift: 'wife', stock: 1, resale: 0.4, drift: -0.04, notice: ['Every wife on the island'] }),
  I('jewelry', 'sp_sable', 'A Russian sable, through Montreal', 18000, 2, "Smuggled past two governments. The FBI would love to know how.", { wife: 15, respect: 3, flash: 10, req: 'spouse', gift: 'wife', stock: 1, resale: 0.4, drift: -0.03, notice: ['Customs', 'The FBI'] }),
  I('jewelry', 'sp_foxstole', 'A silver-fox stole', 450, 0, "For a wedding in Philadelphia.", { wife: 3, flash: 2, gift: 'anyone' }),
  I('jewelry', 'sp_lambcoat', 'A Persian lamb coat for your mother', 700, 0, "Black and curly, the coat of a widow who is still somebody.", { fam: 5, flash: 1, req: 'parent', gift: 'mother', kind: 'once', cd: 104 }),
  I('jewelry', 'sp_crucifix', 'A gold crucifix for your mother', 120, 0, "She'll wear it to the seven o'clock Mass for the rest of her life.", { fam: 3, flash: 0, req: 'parent', gift: 'mother', kind: 'once', cd: 52, g: { church: 1 } }),
  I('jewelry', 'sp_ring_son', 'A gold signet ring for your son', 250, 0, "The family crest, such as it is.", { fam: 3, flash: 1, req: 'son16', gift: 'son', kind: 'once', cd: 104 }),

  // ---- The house ---------------------------------------------------------------------------------
  I('home', 'sp_stoneharbor', 'A summer house in Stone Harbor', 22000, 25, "On the bay side, a dock, a porch with a glider. Ten minutes and a world away.", { fam: 8, relief: 8, respect: 2, flash: 4, resale: 0.95, drift: 0.04, unl: ['summer'] }),
  I('home', 'sp_bayharbor', 'A place in Bay Harbor, Florida', 30000, 30, "A ranch house on the water, a pool, the men from Philadelphia two doors down.", { fam: 8, relief: 10, respect: 3, flash: 5, resale: 0.9, drift: 0.04, unl: ['florida'], g: { philly: 3 } }),
  I('home', 'sp_huntcamp', 'A hunting camp in the Pine Barrens', 4000, 4, "A cabin, a woodstove, deer in November. Also: nobody comes by.", { relief: 6, crew: 2, flash: 1, resale: 0.8, drift: 0.02, unl: ['camp'] }),
  I('home', 'sp_kitchen', 'A new kitchen in pink and turquoise', 3500, 0, "General Electric everything, a wall oven, a dishwasher she won't trust.", { kind: 'once', wife: 8, fam: 3, flash: 2, cd: 260 }),
  I('home', 'sp_basement', 'A finished basement with a bar', 3000, 1, "Knotty pine, a bar with a brass rail, the fights on a set in the corner.", { kind: 'once', fam: 3, crew: 3, relief: 3, flash: 1, cd: 260 }),
  I('home', 'sp_redo', 'Redo the house: marble, gold fixtures, slipcovers', 12000, 0, "Columns at the door, a fountain, plastic on the sofa so it stays new.", { kind: 'once', wife: 8, respect: 2, flash: 6, cd: 260, notice: ['The neighbors', 'The IRS'] }),
  I('home', 'sp_shelter', 'A fallout shelter in the yard', 3000, 1, "Concrete, a hand-cranked fan, canned peaches for two weeks. The neighbors ask if there's room.", { fam: 3, relief: 3, flash: 2, maxYear: 1965, resale: 0.1, drift: -0.1, g: { town: 1 }, notice: ['The neighbors'] }),
  I('home', 'sp_pool', 'An in-ground swimming pool', 5000, 15, "Kidney-shaped, a diving board, a cabana. Every kid in the Crest wants an invitation.", { fam: 6, relief: 3, respect: 1, flash: 4, unl: ['pool'], resale: 0.4, drift: -0.02 }),
  I('home', 'sp_poolparty', 'A pool party for the crew and their families', 600, 0, "Sausage and peppers, the kids in the deep end, the capos in the cabana.", { kind: 'once', crew: 4, fam: 2, flash: 1, needs: ['pool'], months: SUMMER, cd: 8 }),
  I('home', 'sp_tv', 'A Zenith console television', 350, 0, "Black and white in a walnut cabinet. Bonanza on Saturday night.", { fam: 4, relief: 1, flash: 0, resale: 0.3, drift: -0.15 }),
  I('home', 'sp_colortv', 'An RCA color television', 700, 1, "In 1960 almost nobody has one, and there is barely anything to watch in color. The whole block comes over.", { fam: 6, respect: 1, relief: 1, flash: 3, stock: 3, resale: 0.3, drift: -0.12, g: { town: 1 } }),
  I('home', 'sp_hifi', 'A Magnavox stereo hi-fi console', 500, 0, "Stereo, a new thing. Sinatra in one ear, Basie in the other.", { fam: 3, relief: 2, flash: 1, resale: 0.3, drift: -0.1 }),
  I('home', 'sp_centralair', 'Central air conditioning', 3200, 6, "August without the fan in the window. Your mother cries.", { fam: 4, relief: 4, health: 1, flash: 2, resale: 0.3, drift: -0.05 }),
  I('home', 'sp_windowac', 'Window air conditioners in every bedroom', 600, 2, "They rattle, they drip, they work.", { fam: 3, relief: 2, flash: 1, resale: 0.2, drift: -0.15 }),
  I('home', 'sp_wall', 'A wall, a gate and floodlights', 6000, 6, "Eight feet of brick, an iron gate, lights that make the street look like Yankee Stadium.", { relief: 3, respect: 1, flash: 4, mods: { guard: 10 }, resale: 0.5, drift: 0, notice: ['The neighbors', 'The FBI (they photograph it)'] }),
  I('home', 'sp_dogs', 'A pair of German shepherds', 400, 5, "Rex and Duke. The mailman uses the side gate.", { relief: 2, fam: 2, flash: 1, mods: { guard: 4 }, resale: 0, drift: 0 }),
  I('home', 'sp_unlisted', 'An unlisted second telephone line', 25, 4, "A number nobody has, which is the point. Until somebody does.", { kind: 'svc', flash: 0, mods: { secrecy: 3 } }),
  I('home', 'sp_steinway', 'A Steinway for the parlor', 4500, 1, "A baby grand nobody plays until your daughter does.", { fam: 5, respect: 1, flash: 3, resale: 0.75, drift: 0.01 }),
  I('home', 'sp_portrait', 'An oil portrait of the family', 1500, 0, "A painter from Philadelphia, six sittings. It goes over the fireplace.", { kind: 'once', fam: 6, respect: 1, flash: 2, cd: 260 }),
  I('home', 'sp_shrine', 'A Blessed Mother shrine in the yard', 300, 0, "In a bathtub grotto, lights at night, flowers from your mother.", { fam: 2, flash: 1, g: { church: 2 }, resale: 0, drift: 0 }),
  I('home', 'sp_painting', 'A real oil painting from a New York gallery', 3000, 0, "A seascape by somebody who is in museums. It goes up in value, the man says.", { respect: 1, flash: 2, resale: 0.9, drift: 0.05, g: { society: 2 } }),

  // ---- Staff -------------------------------------------------------------------------------------
  I('staff', 'sp_maid', 'A maid', 80, 40, "Five days, Irish, takes the bus from Rio Grande.", { wife: 4, relief: 2, flash: 2, req: 'spouse' }),
  I('staff', 'sp_cook', 'A cook', 100, 50, "She makes the gravy almost like your mother. Almost.", { fam: 3, health: 1, relief: 1, flash: 2 }),
  I('staff', 'sp_gardener', 'A gardener', 50, 25, "The hedges square, the fig tree wrapped for winter.", { fam: 1, flash: 1 }),
  I('staff', 'sp_nanny', 'A nanny', 70, 35, "For the little ones, so your wife can go to the hairdresser on Thursdays.", { wife: 5, relief: 1, flash: 2, req: 'kid' }),
  I('staff', 'sp_houseman', 'A houseman', 120, 60, "Does the door, the bar, the car. Hears everything, says nothing.", { respect: 1, relief: 1, flash: 2, mods: { secrecy: 2 } }),
  I('staff', 'sp_bodyguard', 'A bodyguard', 200, 100, "A big quiet man who sits in the car and comes in first.", { respect: 1, relief: 3, flash: 3, mods: { guard: 8 } }),
  I('staff', 'sp_bodyguards', 'Two bodyguards around the clock', 500, 250, "Shifts, a car outside the house, a man in the hall. The FBI photographs them too.", { respect: 2, relief: 5, flash: 5, mods: { guard: 15 }, notice: ['The FBI', 'The other families'] }),
  I('staff', 'sp_secretary', 'A private secretary', 90, 45, "Keeps the calendar, answers the phone, forgets on command.", { relief: 2, flash: 1, mods: { intel: 3 } }),
  I('staff', 'sp_privatenurse', 'A private nurse for yourself', 160, 80, "Pills, pressure cuff, a lecture about the cigars.", { health: 3, relief: 1, flash: 1 }),

  // ---- Status & society --------------------------------------------------------------------------
  I('society', 'sp_club', 'Membership at a country club on the mainland', 5000, 40, "Initiation, dues, a locker. Some members will never forget where the money came from.", { kind: 'svc', respect: 3, relief: 2, flash: 3, g: { society: 5, pols: 2 }, unl: ['club'], notice: ['The members'] }),
  I('society', 'sp_golfmayor', 'Eighteen holes with the mayor', 200, 0, "You lose by two strokes, on purpose, and he knows it.", { relief: 2, flash: 1, needs: ['club'], cd: 4, g: { pols: 4 } }),
  I('society', 'sp_envelope', 'The Sunday envelope: a big one', 100, 0, "The usher notices the weight. So does the monsignor.", { flash: 0, cd: 1, g: { church: 2 } }),
  I('society', 'sp_roof', 'A new roof for St. Ann\'s', 15000, 0, "Slate, copper flashing, a plaque in the vestibule with your father's name.", { respect: 4, fam: 4, flash: 5, stock: 1, g: { church: 10, town: 4 } }),
  I('society', 'sp_window', 'A stained-glass window in your mother\'s name', 4000, 0, "St. Anthony, finder of lost things, in reds and blues. Your mother weeps.", { fam: 5, flash: 3, cd: 520, g: { church: 6 } }),
  I('society', 'sp_monsignor', 'Dinner for the monsignor', 150, 0, "Veal, a good bottle, a word about a boy who needs a school.", { cd: 4, flash: 0, g: { church: 3 } }),
  I('society', 'sp_littleleague', 'Sponsor a Little League team', 500, 0, "Uniforms with the name of your vending company on the back.", { fam: 2, flash: 1, months: [3, 4, 5, 6], cd: 52, g: { town: 4 } }),
  I('society', 'sp_feast', 'Pay for the Feast of Our Lady of Mount Carmel', 3000, 0, "The band, the lights over the street, the statue with the dollar bills, the fireworks.", { respect: 3, fam: 3, flash: 4, months: [6, 7], cd: 52, g: { church: 5, town: 6 } }),
  I('society', 'sp_fourth', 'Fourth of July fireworks over the beach', 2500, 0, "Rockets off a barge, the whole boardwalk looking up.", { respect: 2, flash: 4, months: [6, 7], cd: 52, g: { town: 5 } }),
  I('society', 'sp_charityball', 'A table at the hospital\'s charity ball', 1000, 0, "Black tie, a silent auction, a photograph in the paper.", { respect: 1, wife: 4, flash: 3, needs: ['tux'], cd: 12, g: { society: 4, press: 1 } }),
  I('society', 'sp_wing', 'A wing at the hospital, with your name on it', 60000, 0, "Thirty beds and a bronze plaque. They'll be saying your name for fifty years.", { respect: 6, fam: 4, flash: 8, stock: 1, g: { town: 10, society: 8, press: 3 }, notice: ['The IRS', 'Everyone'] }),
  I('society', 'sp_scholarship', 'A scholarship at the parish school', 2000, 0, "One boy a year to Villanova. Your name on the program.", { flash: 1, cd: 26, g: { church: 3, town: 2 } }),
  I('society', 'sp_racehorse', 'A racehorse at Garden State Park, and his trainer', 18000, 80, "A three-year-old colt, a trainer from Kentucky, a box at the rail.", { kind: 'own', respect: 4, relief: 5, flash: 6, unl: ['horse'], resale: 0.4, drift: -0.15, g: { society: 3 } }),
  I('society', 'sp_derby', 'Run your horse in the Jersey Derby', 1000, 0, "Entry, the jockey, a new blanket in your colors. The purse is real.", { respect: 2, relief: 3, flash: 4, needs: ['horse'], months: [5], cd: 52, gamble: { p: 0.15, win: 25 } }),
  I('society', 'sp_eagles', 'Eagles season tickets at Franklin Field', 160, 0, "Four seats on the forty. This is the year they win it all.", { crew: 2, fam: 2, relief: 2, flash: 1, months: [7, 8, 9], cd: 52 }),
  I('society', 'sp_phillies', 'A box at Connie Mack Stadium', 600, 0, "Behind first base. The Phillies lose; the box is for who you bring.", { flash: 2, months: [2, 3, 4], cd: 52, g: { pols: 2 } }),
  I('society', 'sp_ringside', 'Ringside at the Convention Hall fights', 200, 0, "Close enough to get sprayed. Everybody sees who sits next to whom.", { respect: 1, relief: 2, flash: 3, cd: 4 }),
  I('society', 'sp_500club', 'A table for the show at the 500 Club', 400, 0, "The big room in Atlantic City, the best act in the country, your table by the stage.", { respect: 2, relief: 4, wife: 3, flash: 3, cd: 8 }),
  I('society', 'sp_kennedy', 'A table at the $100-a-plate Democratic dinner', 1000, 0, "1960: the senator from Massachusetts is running. The county chairman will remember who bought a table.", { flash: 2, minYear: 1960, maxYear: 1960, cd: 52, g: { pols: 6, press: 1 } }),
  I('society', 'sp_partydinner', 'A table at the county party dinner', 1000, 0, "Chicken, speeches, and a long talk afterward with the freeholder.", { flash: 2, cd: 26, g: { pols: 5 } }),
  I('society', 'sp_pba', 'Tickets for the Policemen\'s Benevolent ball', 500, 0, "Fifty tickets, given out where they'll do good.", { flash: 1, cd: 26, g: { cops: 4 } }),
  I('society', 'sp_sonsofitaly', 'The Sons of Italy lodge: dues and the banquet', 300, 0, "A plaque, a speech about Columbus, a hundred hands to shake.", { flash: 1, cd: 52, g: { society: 2, town: 2 } }),
  I('society', 'sp_kofc', 'A new hall for the Knights of Columbus', 2000, 0, "Folding chairs, a bingo board, a picture of you with the Grand Knight.", { flash: 2, cd: 52, g: { church: 4, town: 1 } }),
  I('society', 'sp_bench', 'A boardwalk bench with a brass plaque', 75, 0, "\"In memory of\", and your father's name.", { fam: 1, flash: 1, cd: 26, g: { town: 1 } }),
  I('society', 'sp_pumper', 'A new pumper for the volunteer fire company', 18000, 0, "Red, chrome, your name painted small on the door. The firemen vote.", { respect: 3, flash: 4, stock: 1, g: { town: 8, pols: 2 } }),
  I('society', 'sp_xmasad', 'A full-page Christmas greeting in the paper', 300, 0, "\"Season's greetings from the family of…\"", { flash: 2, months: [12], cd: 52, g: { town: 2, press: 2 } }),
  I('society', 'sp_testimonial', 'A testimonial dinner in your honor', 5000, 0, "Three hundred guests, a congressman's telegram, a plaque that says \"Humanitarian\".", { respect: 5, fam: 3, flash: 7, cd: 104, g: { society: 4, philly: 2, press: 2 }, notice: ['The FBI (they take down the plates)'] }),
  I('society', 'sp_nameday', 'A Mass said for your father every year', 50, 0, "His name read out at the altar, the family in the front pew.", { fam: 2, flash: 0, cd: 52, g: { church: 1 } }),

  // ---- Family occasions ----------------------------------------------------------------------------
  I('family', 'sp_parochial', 'Parochial school for the children', 30, 15, "The nuns, the uniforms, the ruler. They come home with manners.", { kind: 'svc', fam: 4, flash: 0, req: 'kid', g: { church: 2 } }),
  I('family', 'sp_prep', 'A prep school for the children', 120, 60, "A boarding school with ivy. They'll know boys whose fathers run banks.", { kind: 'svc', fam: 5, wife: 3, flash: 2, req: 'kid', g: { society: 3 }, kidAttr: { attr: 'diplomacy', amount: 3 } }),
  I('family', 'sp_college', 'A college fund for the children', 5000, 0, "Money in a passbook with their names. It grows, and nobody can touch it.", { kind: 'own', fam: 6, relief: 3, flash: 0, req: 'kid', limit: 3, resale: 1, drift: 0.03 }),
  I('family', 'sp_wedding', 'A big wedding for your child', 25000, 0, "Our Lady Star of the Sea, then five hundred at the Latin Casino. Envelopes, an orchestra, a cake as tall as the groom.", { respect: 6, fam: 10, crew: 5, flash: 8, req: 'adultChild', each: true, g: { philly: 5, society: 3, church: 2 }, notice: ['The FBI (they take down the plates)', 'Every family in Philadelphia'] }),
  I('family', 'sp_newlyweds', 'A house for the newlyweds (a gift, not a dowry)', 12000, 0, "A two-bedroom in the Crest with the deed in their names.", { fam: 10, wife: 6, flash: 4, req: 'marriedChild', each: true }),
  I('family', 'sp_christening', 'A christening party for the baby', 600, 0, "The godfather's envelope, sugared almonds, the whole street.", { fam: 5, flash: 1, req: 'baby', each: true, g: { church: 2 } }),
  I('family', 'sp_communion', 'A First Communion party', 800, 0, "The white suit, the veil, a hall with a band, an envelope from every capo.", { fam: 5, crew: 1, flash: 2, req: 'communion', each: true, g: { church: 2 } }),
  I('family', 'sp_confirmation', 'A Confirmation party', 1000, 0, "The bishop comes; the party comes after.", { fam: 5, flash: 2, req: 'confirmation', each: true, g: { church: 2 } }),
  I('family', 'sp_sixteen', 'A debutante-style sweet sixteen at the hotel', 3000, 0, "Gowns, a court of sixteen girls, a father-daughter waltz. Her mother cries twice.", { fam: 8, wife: 6, flash: 4, req: 'sixteen', each: true, g: { society: 3 } }),
  I('family', 'sp_braces', 'Braces for the kids', 800, 0, "A dentist in Philadelphia, two years of rubber bands.", { fam: 3, wife: 2, flash: 0, req: 'kid', cd: 104 }),
  I('family', 'sp_camp', 'Summer camp in the Poconos for the kids', 400, 0, "Canoes, mosquitoes, letters home. Your wife gets July to herself.", { fam: 3, wife: 3, flash: 0, req: 'kid', months: [5, 6], cd: 52 }),
  I('family', 'sp_lessons', 'Piano lessons for the kids', 10, 5, "Every Tuesday. The scales come through the floor.", { kind: 'svc', fam: 2, flash: 0, req: 'kid' }),
  I('family', 'sp_tutor', 'A tutor from the college for your eldest', 60, 30, "Latin, algebra, how to talk to a judge's son.", { kind: 'svc', fam: 2, flash: 0, req: 'kid', mods: { heirGrowth: 20 } }),
  I('family', 'sp_nurse', 'A nurse at home for your mother', 120, 60, "A Filipino nurse who sings in the kitchen. Your mother says she doesn't need her.", { kind: 'svc', fam: 8, relief: 2, flash: 1, req: 'parent', parentHealth: 5 }),
  I('family', 'sp_nursinghome', 'The best nursing home in the county for your father', 100, 50, "A room with a view of the marsh and a priest on Sundays.", { kind: 'svc', fam: 4, relief: 3, flash: 1, req: 'parent', parentHealth: 3 }),
  I('family', 'sp_heartman', 'A heart man from Philadelphia for your mother', 1500, 0, "The specialist from Jefferson, at the house, on a Sunday.", { fam: 6, relief: 2, flash: 0, req: 'parent', cd: 26, parentHealth: 10 }),
  I('family', 'sp_mayo', 'A week at the Mayo Clinic for yourself', 2500, 0, "Rochester, Minnesota. Every test there is, and a doctor who says quit smoking.", { health: 8, relief: 3, flash: 1, cd: 52 }),
  I('family', 'sp_rome', 'An anniversary trip to Rome for you and your wife', 4000, 0, "The Pope from a distance, the village your grandmother left, a ring in a box at dinner.", { wife: 12, relief: 6, fam: 2, flash: 3, req: 'spouse', cd: 52 }),
  I('family', 'sp_mausoleum', 'A family mausoleum', 9000, 0, "Granite, bronze doors, room for four generations. Your name over the door.", { kind: 'own', fam: 6, respect: 2, flash: 3, resale: 0, drift: 0, g: { church: 2 } }),
  I('family', 'sp_brotherinlaw', 'Bail out your brother-in-law\'s business', 3000, 0, "The luncheonette again. Your wife won't ask you, so her mother does.", { wife: 6, fam: 5, flash: 1, req: 'spouse', cd: 52 }),
  I('family', 'sp_mothersday', 'Mother\'s Day dinner at the hotel for the whole family', 200, 0, "Three generations at one long table, carnations for every mother.", { fam: 4, wife: 3, flash: 1, months: [5], cd: 52 }),
  I('family', 'sp_xmaseve', 'The Feast of the Seven Fishes for the whole family', 400, 0, "Baccalà, smelts, calamari, the cousins from Philadelphia.", { fam: 5, relief: 2, flash: 1, months: [12], cd: 52 }),

  // ---- Vice & leisure ------------------------------------------------------------------------------
  I('vice', 'sp_cardgame', 'A seat at the high-stakes card game', 5000, 0, "Stud, a back room, men who can afford to lose. Sometimes you are one of them.", { relief: 3, flash: 2, cd: 2, gamble: { p: 0.45, win: 2 }, notice: ['The crew'] }),
  I('vice', 'sp_crapgame', 'A night at the floating crap game', 1000, 0, "A garage in North Wildwood, a pool table with a blanket on it.", { relief: 2, flash: 1, cd: 1, gamble: { p: 0.47, win: 2 } }),
  I('vice', 'sp_track', 'A day at Atlantic City Race Course', 500, 0, "The clubhouse, a tip from a groom, the double.", { relief: 3, flash: 2, months: [6, 7, 8, 9], cd: 1, gamble: { p: 0.3, win: 3 } }),
  I('vice', 'sp_series', 'A big bet on the World Series', 2000, 0, "With a book in New York, so it doesn't look like your own.", { relief: 1, flash: 0, months: [10], cd: 52, gamble: { p: 0.5, win: 1.9 } }),
  I('vice', 'sp_vegas', 'A weekend at the Sands in Las Vegas', 3000, 0, "The Copa Room, the biggest act in show business, the steam room with the men who own the place.", { relief: 8, respect: 2, flash: 4, cd: 8, g: { philly: 2 }, notice: ['The FBI'] }),
  I('vice', 'sp_saratoga', 'August at Saratoga', 2500, 0, "The Springs, the sales, the old money looking at your suit.", { relief: 7, flash: 3, months: [8], cd: 52, g: { society: 2 } }),
  I('vice', 'sp_havana', 'A weekend in Havana, while it lasts', 3000, 0, "The casinos are still open. For now.", { relief: 8, flash: 3, maxYear: 1960, cd: 13 }),
  I('vice', 'sp_miami', 'Two weeks at the Fontainebleau in Miami Beach', 3500, 0, "Cabanas, the men from Chicago and Philadelphia at the next table.", { relief: 9, wife: 6, flash: 4, months: [1, 2, 3], cd: 52, g: { philly: 2 } }),
  I('vice', 'sp_broadway', 'A night on Broadway and dinner at a famous saloon', 600, 0, "A hit musical, steaks after, the sports writers at the bar.", { wife: 4, relief: 3, flash: 2, cd: 8 }),
  I('vice', 'sp_pinehurst', 'A golf week at Pinehurst', 1500, 0, "Pine needles, a caddie who calls you sir.", { relief: 6, health: 1, flash: 2, cd: 26, g: { society: 2 } }),
  I('vice', 'sp_fishing', 'A day of deep-sea fishing with the crew', 400, 0, "A charter out of Otten's, bluefish, beer, a sunburn.", { crew: 3, relief: 3, flash: 1, months: [5, 6, 7, 8, 9, 10], cd: 4 }),
  I('vice', 'sp_clubtable', 'A table on retainer at the Latin Casino', 120, 60, "Your table by the stage, every night, whether you come or not.", { kind: 'svc', respect: 2, relief: 2, flash: 3 }),
  I('vice', 'sp_steam', 'The steam room at the Turkish baths, Tuesdays', 12, 6, "Towels, eucalyptus, and the men talk when there's nowhere to hide a wire.", { kind: 'svc', relief: 3, health: 1, flash: 0, mods: { intel: 3 } }),
  I('vice', 'sp_havanas', 'Havana cigars by the box', 60, 0, "H. Upmann, a cedar box. The good life smells like this.", { relief: 1, flash: 1, maxYear: 1961, cd: 4 }),
  I('vice', 'sp_havanas_ca', 'Havanas through Canada (the embargo)', 150, 0, "The same box, a Canadian stamp, double the price.", { relief: 1, flash: 1, minYear: 1962, cd: 4 }),
  I('vice', 'sp_scotch', 'A case of Chivas Regal for the house', 120, 0, "Twelve years old, for the men who come by.", { crew: 1, relief: 1, flash: 0, cd: 4 }),
  I('vice', 'sp_italy', 'A month in the old country', 2500, 0, "The village, the cousins, a mountain of food, nobody who knows what you do.", { relief: 10, fam: 3, flash: 2, cd: 52 }),

  // ---- Business & power (Family money) ---------------------------------------------------------
  I('power', 'sp_beatcops', 'An envelope for the beat cops', 60, 30, "Twenty dollars a man, Fridays. They look at the ocean when your trucks go by.", { kind: 'svc', flash: 0, g: { cops: 2 }, mods: { localHeat: 1 } }),
  I('power', 'sp_sergeant', 'The desk sergeant on the pad', 120, 60, "He loses paperwork. He tells you who came asking.", { kind: 'svc', flash: 0, g: { cops: 3 }, mods: { localHeat: 1, intel: 3 } }),
  I('power', 'sp_captain', 'The precinct captain on the pad', 300, 150, "The captain decides which doors get kicked. Now you do.", { kind: 'svc', flash: 0, g: { cops: 5 }, mods: { localHeat: 1, secrecy: 3 } }),
  I('power', 'sp_statecop', 'A State Police lieutenant', 500, 250, "Out of the barracks in Woodbine. He hears the state's plans a week early.", { kind: 'svc', flash: 0, g: { cops: 3 }, mods: { intel: 10, localHeat: 1 } }),
  I('power', 'sp_prosman', 'A man in the county prosecutor\'s office', 600, 300, "A clerk who copies the grand jury list.", { kind: 'svc', flash: 0, mods: { intel: 15, secrecy: 5 } }),
  I('power', 'sp_judge', 'A judge\'s campaign, quietly', 10000, 0, "Cash to a committee with a nice name. He'll remember at sentencing.", { flash: 1, cd: 104, g: { pols: 8 } }),
  I('power', 'sp_councilman', 'A councilman\'s mortgage', 5000, 0, "His house, paid off. His vote, paid for.", { flash: 1, cd: 26, g: { pols: 5 } }),
  I('power', 'sp_reporter', 'A newspaperman on the payroll', 150, 75, "He calls before the story runs, and sometimes it doesn't.", { kind: 'svc', flash: 0, g: { press: 4 }, mods: { localHeat: 1 } }),
  I('power', 'sp_columnist', 'A Philadelphia columnist\'s tab at Bookbinders', 240, 120, "Snapper soup, lobster, and a column about the \"so-called Mafia\".", { kind: 'svc', flash: 1, g: { press: 4 }, mods: { fedHeat: 1 } }),
  I('power', 'sp_lawyer', 'A criminal lawyer on retainer', 300, 150, "A Philadelphia man with a Cadillac and a perfect record. Any of yours who's pinched calls him first.", { kind: 'svc', crew: 3, flash: 1, mods: { secrecy: 5, defection: 1 } }),
  I('power', 'sp_bailfund', 'A bail fund in a safe-deposit box', 10000, 0, "Cash for when the wagon comes. Every man knows it's there.", { kind: 'own', crew: 5, flash: 0, mods: { defection: 1 }, resale: 1, drift: 0 }),
  I('power', 'sp_safehouse', 'A safehouse in the Pine Barrens', 8000, 15, "A farmhouse at the end of a sand road. Cots, canned food, a radio.", { kind: 'own', relief: 2, flash: 0, mods: { guard: 5, secrecy: 5 }, unl: ['safehouse'], resale: 0.8, drift: 0.02 }),
  I('power', 'sp_stash', 'A stash: cash in a garage wall', 5000, 0, "Behind the cinderblock in a garage in Rio Grande. Money nobody can see or seize.", { kind: 'own', relief: 3, flash: 0, resale: 1, drift: 0, limit: 4 }),
  I('power', 'sp_warchest', 'A war chest: cars and guns in a garage', 15000, 5, "Clean cars, clean guns, a key on the underboss's ring.", { kind: 'own', crew: 2, flash: 1, mods: { raid: 10, hitPower: 5 }, resale: 0.6, drift: -0.05 }),
  I('power', 'sp_laundromat', 'A laundromat in your cousin\'s name', 9000, 10, "Coin machines, real customers, and receipts that say whatever they need to.", { kind: 'own', flash: 0, mods: { declared: 60, launder: 5 }, resale: 0.7, drift: 0 }),
  I('power', 'sp_vending', 'A vending machine company', 15000, 15, "Cigarettes, candy, jukeboxes in every bar. Your salary is on the books.", { kind: 'own', flash: 1, mods: { declared: 120, income: 2 }, resale: 0.8, drift: 0, g: { labor: 2 } }),
  I('power', 'sp_carlot', 'Silent partner in a car dealership', 20000, 10, "On the White Horse Pike. Explains a Cadillac, and the Cadillacs of your friends.", { kind: 'own', respect: 1, flash: 1, mods: { declared: 150 }, resale: 0.8, drift: 0.01 }),
  I('power', 'sp_accountant', 'An accountant who knows the IRS', 120, 60, "He used to work for them. Now the numbers add up.", { kind: 'svc', relief: 2, flash: 0, mods: { irsShield: 30 } }),
  I('power', 'sp_company', 'Put the cars and the boat in the company\'s name', 800, 0, "Company cars, a company boat for entertaining clients. Deductible, even.", { kind: 'own', flash: 0, mods: { irsShield: 15 }, needs: ['car'], resale: 0, drift: 0 }),
  I('power', 'sp_taxreturn', 'File a respectable tax return (pay some taxes)', 3000, 0, "A real return with a real number. It hurts, and it's cheaper than an audit.", { flash: 0, cd: 52, irsRelief: 40, relief: 2 }),
  I('power', 'sp_fireins', 'Fire insurance on the house and the places', 50, 25, "From an agent who'd never set fire to anything. Usually.", { kind: 'svc', relief: 1, flash: 0, mods: { strikeDamage: 10 } }),
  I('power', 'sp_lifeins', 'Life insurance for your wife and children', 30, 15, "So that whatever happens, they're all right.", { kind: 'svc', pot: 'pocket', fam: 4, wife: 4, relief: 3, flash: 0 }),
  I('power', 'sp_unionlocal', 'Buy a union local\'s election', 12000, 0, "The Teamsters' local on the mainland: a new president, your friend.", { flash: 1, cd: 104, g: { labor: 8 } }),
  I('power', 'sp_oldman', 'A gift for the old man in Philadelphia', 5000, 0, "In a cigar box, carried by hand. He likes to be remembered.", { flash: 0, cd: 13, g: { philly: 8 } }),
  I('power', 'sp_table', 'An envelope for every boss at the Table', 10000, 0, "Respect paid, in cash, before you need it.", { flash: 0, cd: 26, g: { philly: 10 }, respect: 1 }),
  I('power', 'sp_nephew', 'Get a nephew onto the police force', 2000, 0, "A clean kid, a good test score, and a friend on the civil-service board.", { flash: 0, cd: 52, g: { cops: 4 } }),

  // ---- The crew (Family money) ------------------------------------------------------------------
  I('crew', 'sp_xmasbonus', 'Christmas bonuses for the crew', 100, 0, "An envelope for every man, a bottle for every capo.", { crew: 6, flash: 1, per: 'crew', months: [12], cd: 52 }),
  I('crew', 'sp_turkeys', 'Turkeys at Thanksgiving', 6, 0, "A bird for every man, and a truckload for the parish to give out.", { crew: 3, flash: 1, per: 'crew', months: [11], cd: 52, g: { town: 2, church: 1 } }),
  I('crew', 'sp_funeral', 'A funeral for a fallen man', 2500, 0, "Forty cars, a band, a wreath shaped like a broken clock. Every man sees how the family buries its own.", { crew: 6, respect: 2, flash: 4, req: 'fallen', each: true, g: { town: 2, church: 1 }, notice: ['The FBI (they take down the plates)'] }),
  I('crew', 'sp_widows', 'Pensions for the widows', 60, 30, "Every Friday, an envelope at the door. Every man knows it would be his wife's.", { kind: 'svc', crew: 4, flash: 0, req: 'fallen', mods: { defection: 1 } }),
  I('crew', 'sp_crewsuits', 'New suits for the whole crew', 80, 0, "Fittings at your tailor's, one at a time.", { crew: 3, respect: 1, flash: 2, per: 'crew', cd: 26 }),
  I('crew', 'sp_crewweekend', 'A weekend in the Poconos for the crew', 120, 0, "A lodge, a lake, a card game that runs two days.", { crew: 5, flash: 1, per: 'crew', cd: 26 }),
  I('crew', 'sp_hospital', 'Doctors for the men and their families', 80, 40, "A doctor in Wildwood on the family's account.", { kind: 'svc', crew: 3, flash: 0 }),
  I('crew', 'sp_commissary', 'Money in the commissary for the men inside', 50, 25, "Cigarettes, stamps, and a message: you're not forgotten.", { kind: 'svc', crew: 3, flash: 0, mods: { defection: 1 } }),
  I('crew', 'sp_capocars', 'A new Pontiac for every capo', 3200, 0, "Bonneville, any color, as long as it's dark.", { crew: 4, respect: 1, flash: 4, per: 'capo', cd: 104 }),
  I('crew', 'sp_envelopes', 'Envelopes at your men\'s weddings and christenings', 40, 20, "The boss's envelope is the thickest one in the basket.", { kind: 'svc', crew: 2, flash: 0 }),
  I('crew', 'sp_poolhall', 'A pool hall for the crew', 6000, 10, "Six tables, a back room, a coffee urn that never empties.", { kind: 'own', crew: 4, respect: 1, flash: 2, resale: 0.6, drift: 0 }),
  I('crew', 'sp_sundaydinner', 'Sunday dinner for the crew at your house', 300, 0, "Macaroni, meatballs, your wife's best dishes, the capos at your table.", { crew: 2, fam: -1, flash: 0, cd: 2 }),
  I('crew', 'sp_picnic', 'A picnic for the crew\'s families', 800, 0, "Clams, bocce, a softball game the wives win.", { crew: 3, fam: 1, flash: 1, months: SUMMER, cd: 52, g: { town: 1 } }),
  I('crew', 'sp_clambake', 'A clambake on the beach for the men', 500, 0, "Steamers, corn, beer in a rowboat full of ice.", { crew: 2, relief: 1, flash: 1, months: [5, 6, 7, 8, 9], cd: 8 }),
];

export const SPEND_BY_ID: Record<string, SpendItem> = Object.fromEntries(SPEND.map((x) => [x.id, x]));

/** Trips that take the boss out of town for days. */
const TRIPS = new Set(['sp_nassau', 'sp_vegas', 'sp_saratoga', 'sp_havana', 'sp_miami', 'sp_pinehurst', 'sp_italy', 'sp_rome', 'sp_mayo', 'sp_tuna']);

/**
 * Hours the boss spends on a purchase (timeCost.ts): a trip is a day (10 h), an
 * occasion or an evening out is an evening (4 h), a sit-down or a round of golf
 * three, a thing from a showroom an hour, a word to the right man a half hour.
 */
export function spendHours(id: string): number {
  const it = SPEND_BY_ID[id];
  if (!it) return 1;
  if (TRIPS.has(id)) return 10;
  if (it.kind === 'once' && (it.cat === 'family' || it.cat === 'vice' || it.cat === 'crew') && it.price >= 300) return 4;
  if (it.kind === 'once' && (it.cat === 'society' || it.cat === 'boats')) return 3;
  if (it.cat === 'power' && it.kind !== 'own') return 0.5;
  return 1;
}
