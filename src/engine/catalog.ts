import type { BusinessCategory, BusinessKind } from './types';

/**
 * The business catalog. Every legit front, racket and property the crew can
 * own. Weekly take = base × the season multiplier for that kind (in season /
 * off-season), scaled by district control and staffing. Fronts wash dirty
 * money up to `launder` a week; anything a racket earns beyond what the fronts
 * can wash piles up as unwashed cash, and unwashed cash draws the IRS.
 *
 * Vice rackets are abstract on purpose: the game tracks money, heat and risk,
 * never what goes on behind the door.
 */
export interface BusinessDef {
  kind: BusinessKind;
  name: string;
  category: BusinessCategory;
  blurb: string;
  cost: number;
  /** Weekly take before the season multiplier. */
  base: number;
  /** [in season, off-season] multipliers on base. */
  season: [number, number];
  upkeep: number;
  /** Local heat per week (fractional, accumulates). */
  heat: number;
  /** Federal heat per week (fractional, accumulates). */
  fedHeat: number;
  /** Made men or associates needed to run it. */
  staff: number;
  /** Dirty money it can wash per week (fronts only). */
  launder: number;
  /** Not offered in the shop (granted by goals, starting assets ...). */
  hidden?: boolean;
  /** Most you can own. */
  max?: number;
  /** Earliest game date year it can be bought. */
  minYear?: number;
}

export const CATALOG: Record<BusinessKind, BusinessDef> = {
  /* ---------------- fronts ---------------- */
  restaurant: { kind: 'restaurant', name: 'Italian restaurant', category: 'front', blurb: 'Red sauce, red booths, a back table that is always reserved.', cost: 3500, base: 120, season: [2.4, 0.45], upkeep: 35, heat: 0, fedHeat: 0, staff: 0, launder: 500 },
  pizza: { kind: 'pizza', name: 'Pizza parlor', category: 'front', blurb: 'Tomato pie by the slice. The register rings whether anyone ate or not.', cost: 2500, base: 90, season: [2.5, 0.5], upkeep: 25, heat: 0, fedHeat: 0, staff: 0, launder: 350 },
  stand: { kind: 'stand', name: 'Boardwalk stand', category: 'front', blurb: 'Custard, taffy, a wheel of chance. Boarded up from Labor Day to Memorial Day.', cost: 2000, base: 120, season: [3.0, 0], upkeep: 25, heat: 0, fedHeat: 0, staff: 0, launder: 300 },
  motel: { kind: 'motel', name: 'Doo-wop motel', category: 'front', blurb: 'Neon sign, kidney pool, forty rooms. Full in July, a tomb in February.', cost: 9000, base: 200, season: [2.8, 0.15], upkeep: 90, heat: 0, fedHeat: 0, staff: 0, launder: 900 },
  bar: { kind: 'bar', name: 'Bar & grill', category: 'front', blurb: 'Year-round regulars. A good place to hear things.', cost: 5000, base: 150, season: [2.0, 0.75], upkeep: 50, heat: 0.05, fedHeat: 0, staff: 0, launder: 600 },
  construction: { kind: 'construction', name: 'Construction company', category: 'front', blurb: 'Paving, cement, city contracts. Better with a friend at City Hall.', cost: 14000, base: 260, season: [1.3, 0.6], upkeep: 100, heat: 0.05, fedHeat: 0.02, staff: 1, launder: 1600 },
  vending: { kind: 'vending', name: 'Jukebox & vending route', category: 'front', blurb: 'Every jukebox and cigarette machine from the Crest to Anglesea.', cost: 6000, base: 160, season: [2.0, 0.7], upkeep: 35, heat: 0.1, fedHeat: 0, staff: 1, launder: 700 },
  laundromat: { kind: 'laundromat', name: 'Laundromat', category: 'front', blurb: 'Coin machines count themselves. Nobody audits quarters.', cost: 4000, base: 70, season: [1.2, 1.0], upkeep: 20, heat: 0, fedHeat: 0, staff: 0, launder: 1400 },
  carlot: { kind: 'carlot', name: 'Used-car lot', category: 'front', blurb: 'Cash deals, loose titles, a back lot full of questions.', cost: 7000, base: 130, season: [1.5, 0.8], upkeep: 40, heat: 0.05, fedHeat: 0, staff: 0, launder: 1100 },
  arcade: { kind: 'arcade', name: 'Arcade', category: 'front', blurb: 'Skee-Ball and pinball. Nobody counts the nickels twice.', cost: 4000, base: 140, season: [2.6, 0.15], upkeep: 20, heat: 0.1, fedHeat: 0, staff: 0, launder: 400 },
  boarding: { kind: 'boarding', name: 'Rooming house', category: 'front', blurb: 'Summer workers by the week. Rent paid in cash.', cost: 4000, base: 110, season: [2.4, 0.35], upkeep: 20, heat: 0.05, fedHeat: 0, staff: 0, launder: 300 },
  club: { kind: 'club', name: 'Nightclub', category: 'front', blurb: 'Neon, a house band, a card room upstairs.', cost: 7500, base: 260, season: [2.6, 0.3], upkeep: 50, heat: 0.35, fedHeat: 0, staff: 1, launder: 800 },
  bank: { kind: 'bank', name: 'Savings & loan', category: 'front', blurb: 'A state charter, a marble lobby, and a vault that washes anything.', cost: 50000, base: 300, season: [1, 1], upkeep: 165, heat: 0, fedHeat: 0, staff: 0, launder: 6000, hidden: true, max: 1 },
  casino: { kind: 'casino', name: 'Atlantic City casino stake', category: 'front', blurb: 'A licensed piece of a boardwalk casino. The dream.', cost: 0, base: 3200, season: [1.3, 1.0], upkeep: 450, heat: 0, fedHeat: 0.05, staff: 0, launder: 12000, hidden: true, max: 1 },

  /* ---------------- rackets ---------------- */
  numbers: { kind: 'numbers', name: 'Numbers bank', category: 'racket', blurb: 'A penny a play, every day of the year. The working man\'s lottery.', cost: 3500, base: 170, season: [1.6, 0.8], upkeep: 10, heat: 0.3, fedHeat: 0.02, staff: 1, launder: 0 },
  bookmaking: { kind: 'bookmaking', name: 'Bookmaking wire room', category: 'racket', blurb: 'Phones, a race wire and a chalkboard. Football in the fall.', cost: 4500, base: 190, season: [1.8, 0.7], upkeep: 15, heat: 0.35, fedHeat: 0.05, staff: 1, launder: 0 },
  loansharking: { kind: 'loansharking', name: 'Shylock book', category: 'racket', blurb: 'Five points a week. Lets you put money on the street.', cost: 3000, base: 40, season: [1, 1], upkeep: 10, heat: 0.2, fedHeat: 0, staff: 1, launder: 0 },
  cardgame: { kind: 'cardgame', name: 'Card game', category: 'racket', blurb: 'A floating high-stakes game. The house always takes a cut.', cost: 2500, base: 140, season: [2.2, 0.55], upkeep: 15, heat: 0.25, fedHeat: 0, staff: 1, launder: 0 },
  vice: { kind: 'vice', name: 'Call service', category: 'racket', blurb: 'A telephone, a discreet address, and men who would rather not be named. The vice squad is always curious.', cost: 6000, base: 250, season: [2.4, 0.6], upkeep: 45, heat: 0.6, fedHeat: 0.05, staff: 1, launder: 0 },
  stag: { kind: 'stag', name: 'Stag-film distribution', category: 'racket', blurb: 'Reels in plain cans for private clubs up and down the coast. Interstate — the feds care.', cost: 5000, base: 170, season: [1.2, 1.0], upkeep: 20, heat: 0.15, fedHeat: 0.25, staff: 1, launder: 0 },
  blackmail: { kind: 'blackmail', name: 'Blackmail ring', category: 'racket', blurb: 'Photographs, hotel registers, a patient man with a camera. Turns officials into favors.', cost: 7000, base: 110, season: [1.6, 1.0], upkeep: 30, heat: 0.1, fedHeat: 0.1, staff: 1, launder: 0 },
  jewel: { kind: 'jewel', name: 'Jewel-thief crew', category: 'racket', blurb: 'Second-story men who work the summer cottages. Big, irregular scores — better with a fence.', cost: 5000, base: 0, season: [1.6, 0.6], upkeep: 30, heat: 0.2, fedHeat: 0.1, staff: 2, launder: 0 },
  bankcrew: { kind: 'bankcrew', name: 'Bank-robbery crew', category: 'racket', blurb: 'Out-of-town banks only. Huge scores, and bank robbery is a federal crime.', cost: 8000, base: 0, season: [1, 1], upkeep: 45, heat: 0.1, fedHeat: 0.2, staff: 3, launder: 0 },
  fencing: { kind: 'fencing', name: 'Fence', category: 'racket', blurb: 'Moves what falls off trucks. Doubles what the jewel crew is worth.', cost: 2500, base: 120, season: [1.6, 1.0], upkeep: 10, heat: 0.3, fedHeat: 0, staff: 1, launder: 0 },
  narcotics: { kind: 'narcotics', name: 'Narcotics pipeline', category: 'racket', blurb: 'Heroin through the docks to Philadelphia buyers. Angelo Bruno forbids it. If Philadelphia finds out, there will be a reckoning.', cost: 10000, base: 850, season: [1.4, 1.0], upkeep: 75, heat: 0.3, fedHeat: 0.5, staff: 2, launder: 0, max: 1 },

  /* ---------------- property ---------------- */
  safehouse: { kind: 'safehouse', name: 'Safehouse', category: 'property', blurb: 'A quiet house with a cellar. Hides cash from raids and the boss from gunmen.', cost: 6000, base: 0, season: [1, 1], upkeep: 60, heat: 0, fedHeat: 0, staff: 0, launder: 150, max: 3 },
};

export const CATEGORY_LABEL: Record<BusinessCategory, string> = { front: 'Legit front', racket: 'Racket', property: 'Property' };

/** Shop order. */
export const SHOP_KINDS: BusinessKind[] = (Object.keys(CATALOG) as BusinessKind[]).filter((k) => !CATALOG[k].hidden);

/** Names for new places, by kind. The first unused one is taken. */
export const BIZ_NAMES: Record<BusinessKind, string[]> = {
  restaurant: ['Sorrento Grill', 'Mamma Lucia\'s', 'The Villa Roma', 'Capri Supper Room', 'Shore Diner'],
  pizza: ['Mack\'s Tomato Pies', 'Sam\'s Pizza Palace', 'Two Brothers Pizza', 'Pizza on the Boards'],
  stand: ['Frozen custard stand', 'Saltwater taffy stand', 'Wheel-of-chance stand', 'Lemonade & franks stand', 'Pitch-and-toss stand'],
  motel: ['The Caribbean Motel', 'The Sea Breeze Motel', 'The Pink Flamingo Motel', 'The Satellite Motel', 'The Bel-Air Motel'],
  bar: ['The Shamrock', 'Ship\'s Wheel Tavern', 'The Anchor Bar', 'Rio Grande Tap Room', 'The Admiral Lounge'],
  construction: ['Bayview Paving & Concrete', 'Shore Line Builders', 'Cape Atlantic Construction'],
  vending: ['Seashore Amusement Machines', 'Ocean Vending Co.', 'Atlantic Music Route'],
  laundromat: ['Wash-o-Mat on Pacific', 'Bubbles Coin Laundry', 'Crest Launderette'],
  carlot: ['Honest Al\'s Motors', 'Causeway Used Cars', 'Boardwalk Auto Sales'],
  arcade: ['Skee-Ball parlor', 'Pinball arcade', 'Penny arcade on the pier', 'Fascination parlor'],
  boarding: ['Rooming house on Spencer', 'Ocean Ave guest house', 'Glenwood rooms'],
  club: ['The Riptide Lounge', 'Club Bolero', 'The Starlight Room', 'The Velvet Anchor', 'The Hurricane Room', 'Club Avalon', 'The Moonglow'],
  bank: ['Shore Federal Savings & Loan'],
  casino: ['A boardwalk casino stake'],
  numbers: ['Pacific Ave numbers bank', 'Cigar-store policy wheel', 'Back-room numbers drop', 'Bayside numbers bank'],
  bookmaking: ['Wire room over the barbershop', 'Racing book at the newsstand', 'Telephone book on Rio Grande', 'Football book at the tap room'],
  loansharking: ['Shylock book', 'Payday street loans', 'The Friday book'],
  cardgame: ['Floating card game', 'High-stakes game above the Starlight', 'Tuesday game at the social club'],
  vice: ['Call service on Spencer Ave', 'The after-hours house', 'The telephone exchange'],
  stag: ['Plain-can film route', 'Smoker-reel distribution', 'Private-club film route'],
  blackmail: ['The camera man\'s ring', 'Hotel-register ring', 'The photograph business'],
  jewel: ['Second-story crew', 'Cottage-season jewel crew', 'The cat burglars'],
  bankcrew: ['Out-of-town bank crew', 'The Delaware Valley crew'],
  fencing: ['Bay-side fence', 'Pawn counter on Oak Ave', 'Warehouse fence in Rio Grande'],
  narcotics: ['The dock pipeline'],
  safehouse: ['Safehouse on Hand Ave', 'Cellar house in the Crest', 'Bayside bungalow', 'Farmhouse in Rio Grande'],
};

export function bizDef(kind: BusinessKind): BusinessDef {
  return CATALOG[kind];
}

export function seasonalMult(kind: BusinessKind, inSeason: boolean): number {
  const d = CATALOG[kind];
  return inSeason ? d.season[0] : d.season[1];
}
