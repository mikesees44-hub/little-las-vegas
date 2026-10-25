import { CITIES_BY_ID, CITY_LIST } from './cities';
import type { GameDate, RivalId } from './types';
import type { BudgetTier, Entertainer, FugitiveDest, TravelMode } from './travelState';

/**
 * Where you can go in 1960, how you get there, and what there is to do.
 *
 * Every one of the 28 map cities is a destination (business: meet the local
 * family, look at investments, see the sights), and the resorts have their
 * own itineraries. Modes have period-correct speed, fares, comfort, risk and
 * conspicuousness: propliners and the first jets out of Philadelphia and
 * Newark (the Feds watch the airports), the Pennsylvania Railroad and the
 * Reading, Greyhound and Trailways, your own convoy, or a liner from the
 * West Side piers.
 */

export type ActTag =
  | 'relax' | 'family' | 'romance' | 'nightlife' | 'gamble' | 'business' | 'private' | 'culture' | 'pious'
  | 'exiles' | 'oldmen' | 'relatives' | 'moneymen' | 'sport' | 'pool' | 'shopping';

export interface ActivityOpt {
  id: string;
  name: string;
  text: string;
  tags: ActTag[];
  /** Per person, at the modest tier (first class ×1.8, lavish ×3). */
  cost: number;
  /** Only in these months. */
  months?: number[];
}

export interface Dest {
  id: string;
  name: string;
  lat: number;
  lon: number;
  region: string;
  blurb: string;
  /** The map city this destination belongs to (for standing and the local family). */
  cityId?: string;
  modes: TravelMode[];
  /** Offshore or overseas. */
  abroad?: boolean;
  /** Has a vacation itinerary. */
  resort: boolean;
  /** Months of the high season (prices up, the right crowd). */
  peak: number[];
  /** Hurricane months. */
  storms?: number[];
  /** Hotels by tier. */
  hotels: [string, string, string];
  /** Price index (1 = average). */
  price: number;
  /** Rival outfits whose people winter or play here. */
  rivals?: RivalId[];
  activities: ActivityOpt[];
  /** Miles by air / sea (great circle) from Wildwood. */
  miles: number;
  /** Not reachable by road. */
  noRoad?: boolean;
}

const WW = { lat: 38.9918, lon: -74.8149 };

export function greatCircle(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 3959;
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

type DestIn = Omit<Dest, 'miles'> & { miles?: number };

const BIZ = (city: string): ActivityOpt[] => [
  { id: 'meetboss', name: `Pay respects to the ${city} people`, text: 'A long lunch in a back room. You came to them; they remember that.', tags: ['business'], cost: 30 },
  { id: 'invest', name: 'Look at investments', text: 'A hotel that needs a partner, a vending route, a piece of a club.', tags: ['business', 'moneymen'], cost: 20 },
  { id: 'sights', name: 'See the sights', text: 'A good dinner, a ball game or a show.', tags: ['culture', 'relax', 'family'], cost: 15 },
  { id: 'nightclub', name: 'The best club in town', text: 'A ringside table and a bottle sent over by the owner.', tags: ['nightlife', 'romance'], cost: 25 },
];

const RESORTS: DestIn[] = [
  {
    id: 'miamibeach', name: 'Miami Beach', lat: 25.7907, lon: -80.13, region: 'Florida', cityId: 'miami', resort: true,
    blurb: 'Collins Avenue, the new hotels, and Havana money looking for a home.', modes: ['plane', 'train', 'bus', 'cars'],
    peak: [12, 1, 2, 3, 4], storms: [8, 9, 10], hotels: ['a motel on Collins Avenue', 'the Eden Roc', 'a suite at the Fontainebleau'], price: 1.3, rivals: ['feldstein', 'manno'],
    activities: [
      { id: 'fontainebleau', name: 'The Fontainebleau', text: 'Cabanas, the curving lobby, and everybody who is anybody by the pool.', tags: ['relax', 'pool', 'family'], cost: 20 },
      { id: 'show', name: 'A nightclub show', text: 'The La Ronde Room: a crooner, a comic and a chorus line.', tags: ['nightlife', 'romance'], cost: 25 },
      { id: 'fishing', name: 'Deep-sea fishing', text: 'A charter out of Haulover past the reef. Nobody listening for forty miles.', tags: ['private', 'sport'], cost: 30 },
      { id: 'dogtrack', name: 'The dog track', text: 'Flagler greyhounds under the lights. Your bookmaker is never far away.', tags: ['gamble'], cost: 15 },
      { id: 'exiles', name: 'Meet the Havana exiles', text: 'A hotel room on Brickell full of men who ran the Havana casinos and want back in somewhere.', tags: ['business', 'exiles'], cost: 10 },
      { id: 'beach', name: 'A day on the beach', text: 'Sand castles, sunburn, ice cream. The kids will talk about it all winter.', tags: ['family', 'relax'], cost: 5 },
    ],
  },
  {
    id: 'vegas', name: 'Las Vegas', lat: 36.1699, lon: -115.1398, region: 'Nevada', cityId: 'vegas', resort: true,
    blurb: 'The Strip, the showrooms, and the money men who count the drop.', modes: ['plane', 'train', 'bus', 'cars'],
    peak: [1, 2, 3, 4, 5, 10, 11, 12], hotels: ['a motor court downtown', 'the Desert Inn', 'a suite at the Sands'], price: 1.0, rivals: ['feldstein'],
    activities: [
      { id: 'showroom', name: 'The Copa Room show', text: 'The headliner and his friends, the late show, a table down front.', tags: ['nightlife', 'romance'], cost: 30 },
      { id: 'casinos', name: 'The casinos', text: 'Craps at the Sands, then the Flamingo. The money men watch who is betting.', tags: ['gamble', 'moneymen', 'business'], cost: 20 },
      { id: 'desert', name: 'A drive into the desert', text: 'Red Rock at sunset in a borrowed Cadillac. The quiet out there is enormous.', tags: ['relax', 'romance', 'private'], cost: 10 },
      { id: 'pool', name: 'By the pool', text: 'Floating craps tables and a hundred and ten in the shade.', tags: ['relax', 'pool', 'family'], cost: 10 },
      { id: 'countroom', name: 'Lunch with the money men', text: 'A booth at the back of the coffee shop. Points in a casino are for sale, if Chicago allows it.', tags: ['business', 'moneymen'], cost: 15 },
    ],
  },
  {
    id: 'catskills', name: 'The Catskills', lat: 41.7, lon: -74.65, region: 'New York', resort: true,
    blurb: 'The Borscht Belt: the big resorts, three meals a day, and the best comedians in America.', modes: ['bus', 'cars', 'train'],
    peak: [6, 7, 8], hotels: ['a bungalow colony', 'the Concord', 'a suite at Grossinger\'s'], price: 0.9,
    activities: [
      { id: 'resort', name: 'The resort', text: 'Shuffleboard, the lake, and a dining room the size of a hangar.', tags: ['relax', 'family'], cost: 10 },
      { id: 'comedians', name: 'The comedians', text: 'The nightclub at the Concord. A young comic does twenty minutes on his mother-in-law.', tags: ['nightlife', 'family'], cost: 12 },
      { id: 'golf', name: 'Eighteen holes', text: 'Golf with men who like to talk business on the back nine.', tags: ['business', 'sport', 'private'], cost: 15 },
      { id: 'lake', name: 'A rowboat on the lake', text: 'Just the two of you and the dragonflies.', tags: ['romance', 'relax'], cost: 5 },
    ],
  },
  {
    id: 'poconos', name: 'The Poconos', lat: 41.05, lon: -75.3, region: 'Pennsylvania', resort: true,
    blurb: 'Honeymoon lodges, lakes and the hunting camps of the Pennsylvania mountains.', modes: ['bus', 'cars', 'train'],
    peak: [6, 7, 8, 12, 1, 2], hotels: ['a cabin by the lake', 'Skytop Lodge', 'the honeymoon suite at Mount Airy'], price: 0.85,
    activities: [
      { id: 'lodge', name: 'The honeymoon lodge', text: 'A heart-shaped tub and a fireplace. Breakfast in bed.', tags: ['romance', 'relax'], cost: 15 },
      { id: 'lakeday', name: 'A day at the lake', text: 'Canoes, a cookout and a swim off the dock.', tags: ['family', 'relax'], cost: 6 },
      { id: 'hunting', name: 'The hunting camp', text: 'A cabin, a deer stand and men who say what they mean.', tags: ['private', 'sport'], cost: 10 },
      { id: 'ski', name: 'Skiing at Big Boulder', text: 'The kids learn on the bunny hill. You learn in the lodge bar.', tags: ['family', 'sport'], cost: 12, months: [12, 1, 2, 3] },
    ],
  },
  {
    id: 'saratoga', name: 'Saratoga', lat: 43.0831, lon: -73.7846, region: 'New York', resort: true,
    blurb: 'The August meet, the springs, and the old lake houses where the big money played.', modes: ['plane', 'train', 'bus', 'cars'],
    peak: [8], hotels: ['a rooming house on Union Avenue', 'the Gideon Putnam', 'a cottage at the Grand Union'], price: 1.1,
    activities: [
      { id: 'track', name: 'A day at the track', text: 'The oldest track in America. Your bookmakers want to know what you know.', tags: ['gamble', 'sport'], cost: 20, months: [8] },
      { id: 'springs', name: 'Take the waters', text: 'The mineral baths at the spa. Good for the liver, they say.', tags: ['relax'], cost: 10 },
      { id: 'yearlings', name: 'The yearling sales', text: 'Money men bidding on horses — and on each other.', tags: ['business', 'moneymen'], cost: 15, months: [8] },
      { id: 'lakehouse', name: 'Dinner at a lake house', text: 'An old casino turned supper club. The owner remembers your father.', tags: ['nightlife', 'romance', 'oldmen'], cost: 20 },
    ],
  },
  {
    id: 'hotsprings', name: 'Hot Springs', lat: 34.5037, lon: -93.0552, region: 'Arkansas', cityId: 'hotsprings', resort: true,
    blurb: 'Bathhouse Row, Oaklawn racing, and casinos the sheriff never seems to find.', modes: ['plane', 'train', 'bus', 'cars'],
    peak: [2, 3, 4], hotels: ['a tourist court', 'the Arlington', 'a suite at the Majestic'], price: 0.9,
    activities: [
      { id: 'bathhouse', name: 'Bathhouse Row', text: 'The Fordyce: a steam, a massage and a nap.', tags: ['relax'], cost: 10 },
      { id: 'oaklawn', name: 'Oaklawn Park', text: 'The spring meet. Every bookmaker in the South is in the grandstand.', tags: ['gamble', 'sport'], cost: 15, months: [2, 3, 4] },
      { id: 'casinos', name: 'The Southern Club', text: 'Wide open behind the cigar counter. The Combine wants to meet you.', tags: ['gamble', 'business'], cost: 20 },
      { id: 'mountain', name: 'A drive up the mountain', text: 'The tower on Hot Springs Mountain and the whole valley below.', tags: ['family', 'relax', 'romance'], cost: 5 },
    ],
  },
  {
    id: 'ac', name: 'Atlantic City', lat: 39.3643, lon: -74.4229, region: 'Jersey Shore', cityId: 'ac', resort: true,
    blurb: 'Forty minutes up the road: Steel Pier, the 500 Club and Manno\'s home turf.', modes: ['bus', 'cars', 'train'],
    peak: [6, 7, 8, 9], hotels: ['a rooming house on Pacific', 'the Chalfonte-Haddon Hall', 'a suite at the Traymore'], price: 1.0, rivals: ['manno'],
    activities: [
      { id: 'steelpier', name: 'Steel Pier', text: 'The diving horse, the big bands and saltwater taffy.', tags: ['family', 'relax'], cost: 6 },
      { id: 'club500', name: 'The 500 Club', text: 'The late show. Every wiseguy on the shore is in the room.', tags: ['nightlife', 'romance', 'business'], cost: 25 },
      { id: 'boardwalk', name: 'A rolling chair on the Boardwalk', text: 'Pushed along in a wicker chair like a Philadelphia banker.', tags: ['relax', 'romance', 'family'], cost: 5 },
      { id: 'manno', name: 'Coffee with the Manno people', text: 'A table at the back of a Ducktown bakery. Neutral ground, they say.', tags: ['business'], cost: 5 },
    ],
  },
  {
    id: 'newyork', name: 'New York', lat: 40.7128, lon: -74.006, region: 'New York', cityId: 'newyork', resort: true,
    blurb: 'The Copa, Broadway, the Garden — and the money in the garment center.', modes: ['plane', 'train', 'bus', 'cars'],
    peak: [10, 11, 12], hotels: ['a hotel near Penn Station', 'the Waldorf-Astoria', 'a suite at the Plaza'], price: 1.3, rivals: ['feldstein'],
    activities: [
      { id: 'copa', name: 'The Copacabana', text: 'The Copa girls, the headliner, and a maître d\' who knows your name by dessert.', tags: ['nightlife', 'romance'], cost: 30 },
      { id: 'broadway', name: 'A Broadway show', text: 'Orchestra seats for the musical everybody is humming.', tags: ['culture', 'family'], cost: 20 },
      { id: 'yankees', name: 'The Stadium', text: 'The Yankees, a hot dog and the kids\' first look at the big city.', tags: ['family', 'sport'], cost: 8, months: [4, 5, 6, 7, 8, 9] },
      { id: 'garment', name: 'The garment center', text: 'A loft on Seventh Avenue. Feldstein\'s money comes from rooms like this.', tags: ['business', 'moneymen'], cost: 10 },
      { id: 'fifth', name: 'Fifth Avenue', text: 'Saks, Tiffany\'s and the windows at Christmas.', tags: ['shopping', 'family', 'romance'], cost: 40 },
    ],
  },
  {
    id: 'philadelphia', name: 'Philadelphia', lat: 39.9526, lon: -75.1652, region: 'Delaware Valley', cityId: 'philadelphia', resort: true,
    blurb: 'Two hours up the Pike: Bookbinder\'s, Connie Mack Stadium, and the old man\'s family.', modes: ['train', 'bus', 'cars'],
    peak: [], hotels: ['a hotel on Arch Street', 'the Bellevue-Stratford', 'a suite at the Warwick'], price: 1.0, rivals: ['philly'],
    activities: [
      { id: 'bookbinders', name: 'Dinner at Bookbinder\'s', text: 'Snapper soup and lobster under the old ship pictures.', tags: ['family', 'relax'], cost: 12 },
      { id: 'phillies', name: 'The Phillies', text: 'Connie Mack Stadium. They lose, but the kids don\'t care.', tags: ['family', 'sport'], cost: 6, months: [4, 5, 6, 7, 8, 9] },
      { id: 'respects', name: 'Pay respects on Ninth Street', text: 'Coffee with Philadelphia. You came on your own; that is noticed.', tags: ['business', 'oldmen'], cost: 10 },
      { id: 'wanamaker', name: 'Wanamaker\'s', text: 'The Eagle, the organ, and the store where Philadelphia shops.', tags: ['shopping', 'family'], cost: 30 },
    ],
  },
  {
    id: 'montreal', name: 'Montreal', lat: 45.5017, lon: -73.5673, region: 'Quebec', resort: true,
    blurb: 'Old stone streets, nightclubs on St. Catherine, and friends who move things across the border.', modes: ['plane', 'train', 'bus', 'cars'],
    peak: [6, 7, 8, 9], hotels: ['a pension in the old city', 'the Queen Elizabeth', 'a suite at the Ritz-Carlton'], price: 1.0, abroad: true,
    activities: [
      { id: 'oldcity', name: 'The old city', text: 'Notre-Dame, cobblestones and a café where nobody speaks English.', tags: ['culture', 'romance', 'pious'], cost: 8 },
      { id: 'clubs', name: 'The clubs on St. Catherine', text: 'Jazz until four in the morning. Montreal never closes.', tags: ['nightlife', 'romance'], cost: 20 },
      { id: 'connections', name: 'The Montreal connections', text: 'Men with a warehouse by the port and friends in Buffalo. Good friends to have if you ever need to disappear.', tags: ['business', 'private'], cost: 10 },
      { id: 'forum', name: 'Hockey at the Forum', text: 'The Canadiens. The building shakes.', tags: ['sport', 'family'], cost: 10, months: [10, 11, 12, 1, 2, 3, 4] },
    ],
  },
  {
    id: 'acapulco', name: 'Acapulco', lat: 16.8531, lon: -99.8237, region: 'Mexico', resort: true, abroad: true,
    blurb: 'The bay, the cliff divers, and the Hollywood crowd at Las Brisas.', modes: ['plane', 'cars', 'bus'],
    peak: [12, 1, 2, 3, 4], storms: [8, 9, 10], hotels: ['a pensión above the bay', 'Las Brisas', 'a villa with its own pool'], price: 0.7,
    activities: [
      { id: 'beachmx', name: 'Caleta beach', text: 'The water is warm and the margaritas are cold.', tags: ['relax', 'family'], cost: 5 },
      { id: 'divers', name: 'The cliff divers', text: 'La Quebrada at night, torches in their hands.', tags: ['family', 'culture'], cost: 6 },
      { id: 'yacht', name: 'A yacht on the bay', text: 'A chartered boat, a sunset and nobody else.', tags: ['romance', 'private', 'relax'], cost: 25 },
      { id: 'mexicans', name: 'The Mexico City men', text: 'Friends of friends who move money and people across the border — and could hide a man for years.', tags: ['business', 'private'], cost: 10 },
    ],
  },
  {
    id: 'oldcountry', name: 'Rome & Palermo', lat: 38.1157, lon: 13.3615, region: 'The old country', resort: true, abroad: true, noRoad: true,
    blurb: 'The old country: Rome first, then the ferry to Palermo and the village your grandfather left.', modes: ['plane', 'ship'],
    peak: [4, 5, 6, 9, 10], hotels: ['a pensione near Termini', 'the Excelsior on Via Veneto', 'a suite at the Hassler'], price: 0.6,
    activities: [
      { id: 'relatives', name: 'Visit the relatives', text: 'Cousins you have never met, a table under the lemon trees, and an aunt who cries the whole time.', tags: ['family', 'relatives'], cost: 10 },
      { id: 'village', name: 'The old village', text: 'The church where your grandparents married, and the house with the blue door.', tags: ['culture', 'family', 'pious'], cost: 5 },
      { id: 'oldmen', name: 'The old-country men', text: 'In a café in Palermo, old men in cloth caps who know your family name. They have long memories.', tags: ['business', 'oldmen'], cost: 10 },
      { id: 'vatican', name: 'Mass at St. Peter\'s', text: 'Your mother will want to hear every detail.', tags: ['pious', 'culture', 'family'], cost: 5 },
      { id: 'veneto', name: 'Via Veneto at night', text: 'The cafés, the photographers, the film stars. La dolce vita.', tags: ['nightlife', 'romance'], cost: 20 },
    ],
  },
  {
    id: 'bermuda', name: 'Bermuda', lat: 32.3078, lon: -64.7505, region: 'Atlantic', resort: true, abroad: true, noRoad: true,
    blurb: 'Pink sand, quiet banks, and nobody from the Bureau.', modes: ['plane', 'ship'],
    peak: [4, 5, 6, 7, 8, 9, 10], storms: [8, 9, 10], hotels: ['a guest house in St. George\'s', 'the Castle Harbour', 'a cottage at the Mid Ocean Club'], price: 1.4,
    activities: [
      { id: 'pinksand', name: 'The pink beaches', text: 'Horseshoe Bay and a picnic in the coves.', tags: ['relax', 'family', 'romance'], cost: 6 },
      { id: 'sailing', name: 'Sailing the sound', text: 'A sloop, a skipper who sees nothing, and a long talk.', tags: ['private', 'relax', 'romance'], cost: 20 },
      { id: 'banks', name: 'The banks of Hamilton', text: 'A quiet word with a banker about accounts the IRS never needs to see.', tags: ['business', 'moneymen'], cost: 10 },
      { id: 'golfbm', name: 'Golf at Mid Ocean', text: 'Eighteen holes over the ocean with a man from New York.', tags: ['sport', 'business'], cost: 20 },
    ],
  },
  {
    id: 'havana', name: 'Havana', lat: 23.1136, lon: -82.3666, region: 'Cuba', cityId: 'havana', resort: true, abroad: true, noRoad: true,
    blurb: 'The last season: the casinos are shut, the Tropicana still dances, and the bearded men are watching.', modes: ['plane', 'ship'],
    peak: [12, 1, 2, 3], storms: [8, 9, 10], hotels: ['a room off the Prado', 'the Hotel Nacional', 'a suite at the Riviera'], price: 0.9,
    activities: [
      { id: 'tropicana', name: 'The Tropicana', text: 'Under the stars, the most beautiful show in the world, maybe for the last time.', tags: ['nightlife', 'romance'], cost: 25 },
      { id: 'oldcasino', name: 'The old casino men', text: 'They are packing. Whatever they can carry out, they want to put somewhere new.', tags: ['business', 'exiles', 'moneymen'], cost: 10 },
      { id: 'varadero', name: 'Varadero beach', text: 'White sand and turquoise water two hours east.', tags: ['relax', 'family'], cost: 8 },
      { id: 'cigars', name: 'The cigar factories', text: 'Partagás on Industria Street. The lector reads novels to the rollers.', tags: ['culture'], cost: 8 },
    ],
  },
];

/** Hideouts (only reachable when on the lam). */
export interface FleeDest {
  id: FugitiveDest;
  name: string;
  lat: number;
  lon: number;
  blurb: string;
  modes: TravelMode[];
  /** Chance a capture actually ends in extradition (1 = home soil). */
  extradition: number;
  /** Base cover (0-0.9). */
  cover: number;
  /** Weekly cost of living hidden. */
  drain: number;
  /** Isolation stress per week. */
  isolation: number;
  /** Extra weeks a message takes to reach Wildwood. */
  delay: number;
  /** Is it abroad (the boss can live out his days here). */
  abroad: boolean;
  miles: number;
}

const FLEE_IN: Omit<FleeDest, 'miles'>[] = [
  { id: 'vineland', name: 'The farm in Vineland', lat: 39.4864, lon: -75.026, blurb: 'A cousin\'s chicken farm forty minutes away. Close to home, close to the Feds.', modes: ['cars', 'bus'], extradition: 1, cover: 0.45, drain: 150, isolation: 2, delay: 0, abroad: false },
  { id: 'florida', name: 'A Florida hideout', lat: 26.1224, lon: -80.1373, blurb: 'A stucco house behind a hedge in Fort Lauderdale. Everybody down there is from somewhere else.', modes: ['plane', 'train', 'bus', 'cars'], extradition: 1, cover: 0.5, drain: 400, isolation: 3, delay: 1, abroad: false },
  { id: 'montreal', name: 'Canada (the Montreal connections)', lat: 45.5017, lon: -73.5673, blurb: 'A flat above a warehouse by the port. The Mounties cooperate — slowly.', modes: ['plane', 'train', 'bus', 'cars'], extradition: 0.55, cover: 0.55, drain: 350, isolation: 4, delay: 1, abroad: true },
  { id: 'mexico', name: 'Mexico', lat: 19.4326, lon: -99.1332, blurb: 'A villa in Cuernavaca and friends in the Mexico City police.', modes: ['plane', 'cars', 'bus'], extradition: 0.3, cover: 0.6, drain: 300, isolation: 4, delay: 2, abroad: true },
  { id: 'oldcountry', name: 'Italy (the old country)', lat: 38.1157, lon: 13.3615, blurb: 'The village. Italy does not send its own back to America.', modes: ['plane', 'ship'], extradition: 0.12, cover: 0.65, drain: 250, isolation: 3, delay: 2, abroad: true },
];

export const FLEE_DESTS: Record<FugitiveDest, FleeDest> = Object.fromEntries(FLEE_IN.map((d) => [d.id, { ...d, miles: greatCircle(WW, d) }])) as Record<FugitiveDest, FleeDest>;
export const FLEE_IDS = FLEE_IN.map((d) => d.id);

function cityDest(id: string): Dest | undefined {
  const c = CITIES_BY_ID[id];
  if (!c || id === 'wildwood') return undefined;
  const miles = greatCircle(WW, c);
  const modes: TravelMode[] = id === 'havana' ? ['plane', 'ship'] : miles < 150 ? ['bus', 'cars', 'train'] : ['plane', 'train', 'bus', 'cars'];
  return {
    id, name: c.name, lat: c.lat, lon: c.lon, region: c.region, blurb: c.flavor, cityId: id, modes, resort: false, peak: [], miles,
    hotels: ['a commercial hotel', 'the best hotel downtown', 'a suite at the best hotel in town'], price: 1, activities: BIZ(c.name), abroad: id === 'havana', noRoad: id === 'havana',
  };
}

/** Every destination: the resorts first, then the map's cities (business). */
export const DESTS: Record<string, Dest> = (() => {
  const out: Record<string, Dest> = {};
  for (const r of RESORTS) out[r.id] = { ...r, miles: r.miles ?? greatCircle(WW, r) } as Dest;
  for (const c of CITY_LIST) if (!out[c.id]) { const d = cityDest(c.id); if (d) out[c.id] = d; }
  // Resorts that sit in a map city also offer the business options.
  for (const r of RESORTS) if (r.cityId) for (const a of BIZ(r.name).slice(0, 2)) if (!out[r.id].activities.some((x) => x.id === a.id)) out[r.id].activities.push(a);
  return out;
})();
export const RESORT_IDS = RESORTS.map((r) => r.id);
export const DEST_IDS = Object.keys(DESTS);

/** Havana closes to Americans on January 1, 1961. */
export function havanaOpen(d: GameDate): boolean {
  return d.y < 1961;
}

/* ---------------------------------------------------------------- */
/* Modes                                                             */
/* ---------------------------------------------------------------- */

export interface ModeInfo {
  name: string;
  glyph: string;
  blurb: string;
  /** Comfort 0-1 (stress relief on the way). */
  comfort: number;
  /** Chance of an accident per leg (cars: per car). */
  accident: number;
  /** How visible: airports and passenger lists are watched (0-1). */
  conspicuous: number;
  /** Chance of picking up a tail per leg (scaled by federal heat). */
  tail: number;
  /** Chance of a chance meeting per leg. */
  meeting: number;
}

export const MODES: Record<TravelMode, ModeInfo> = {
  plane: { name: 'Plane', glyph: 'P', blurb: 'A propliner or one of the new jets out of Philadelphia or Newark. Fast — and the Feds watch the airports.', comfort: 0.85, accident: 0.002, conspicuous: 0.9, tail: 0, meeting: 0.12 },
  train: { name: 'Train', glyph: 'T', blurb: 'The Pennsylvania Railroad or the Reading out of Philadelphia, the shore line from Wildwood. A Pullman berth if you pay for it.', comfort: 0.7, accident: 0.002, conspicuous: 0.45, tail: 0.05, meeting: 0.2 },
  bus: { name: 'Bus', glyph: 'B', blurb: 'Greyhound or Trailways. Cheap, slow and anonymous.', comfort: 0.35, accident: 0.004, conspicuous: 0.1, tail: 0.02, meeting: 0.08 },
  cars: { name: 'Your own cars', glyph: 'C', blurb: 'A convoy of Cadillacs with crew at the wheel. Slow but private, bodyguards along — and it can be tailed.', comfort: 0.6, accident: 0.006, conspicuous: 0.5, tail: 0.12, meeting: 0.04 },
  ship: { name: 'Ship', glyph: 'S', blurb: 'A liner from the West Side piers or a cruise ship out of Miami. Slow, grand, and the purser keeps a passenger list.', comfort: 0.95, accident: 0.001, conspicuous: 0.35, tail: 0, meeting: 0.25 },
};
export const MODE_IDS = Object.keys(MODES) as TravelMode[];

export const TIER_INFO: Record<BudgetTier, { name: string; mult: number; fare: number; hotel: number; relief: number }> = {
  modest: { name: 'Modest', mult: 1, fare: 1, hotel: 8, relief: 10 },
  first: { name: 'First class', mult: 1.8, fare: 1.45, hotel: 20, relief: 16 },
  lavish: { name: 'Lavish', mult: 3, fare: 1.45, hotel: 45, relief: 22 },
};

export const ENTERTAINERS: Record<Entertainer, { name: string; fee: number; text: string }> = {
  crooner: { name: 'A crooner', fee: 1500, text: 'A saloon singer from the Copa circuit sings at your table. He owes somebody a favor.' },
  comic: { name: 'A comic', fee: 600, text: 'A Catskills comic does twenty minutes for the party.' },
  bandleader: { name: 'A bandleader', fee: 900, text: 'A twelve-piece band for one night only.' },
};

/** Road miles from Wildwood (the Parkway, the Turnpike, US 1 and Route 66 are not straight lines). */
export function roadMiles(miles: number): number {
  return Math.round(miles * 1.25);
}

/** Days one way (whole days, at least one). */
export function legDays(mode: TravelMode, miles: number): number {
  switch (mode) {
    case 'plane': return miles > 3000 ? 2 : 1;
    case 'train': return Math.max(1, Math.ceil(roadMiles(miles) / 450));
    case 'bus': return Math.max(1, Math.ceil(roadMiles(miles) / 300));
    case 'cars': return Math.max(1, Math.ceil(roadMiles(miles) / 330));
    case 'ship': return 1 + Math.max(1, Math.ceil(miles / 480));
  }
}

/** Fare one way per traveller (cars: per car), 1960 dollars. */
export function fare(mode: TravelMode, miles: number, tier: BudgetTier): number {
  const t = TIER_INFO[tier];
  switch (mode) {
    case 'plane': return Math.round((22 + 0.065 * miles) * t.fare);
    case 'train': return Math.round((5 + 0.032 * roadMiles(miles)) * (tier === 'modest' ? 1 : 1.6));
    case 'bus': return Math.round(3 + 0.02 * roadMiles(miles));
    case 'cars': return Math.round(0.035 * roadMiles(miles) + 15 * legDays('cars', miles));
    case 'ship': return Math.round(0.06 * miles * (tier === 'modest' ? 1 : 2.2));
  }
}

export function modeBlock(d: Dest | FleeDest, mode: TravelMode): string | undefined {
  if (!d.modes.includes(mode)) {
    if (mode === 'ship') return 'No liner goes there';
    if (mode === 'plane') return 'No airport near there';
    return 'No road or rail line goes there';
  }
  return undefined;
}
