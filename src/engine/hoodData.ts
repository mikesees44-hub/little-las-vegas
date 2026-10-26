import type { ZoneId } from './econState';
import type { BuildStyle, SignColor } from './design';
import type { FactionId } from './types';

/**
 * The island, drawn by hand (no OpenStreetMap from here): Five Mile Beach in
 * 1960 — Wildwood Crest, Wildwood and North Wildwood — as a frame of
 * avenues running along the island and cross streets running across it.
 *
 * Coordinates are meters in the island's own frame: `u` runs along the island
 * from the Crest's south end (0) to Hereford Inlet (~7500); `v` runs inland
 * from the Boardwalk line (0) toward the bay, negative out over the beach.
 * The street ORDER and spacing are authored from memory and approximate;
 * the avenue order (Ocean, Atlantic, Pacific, New Jersey, Park) is right.
 *
 * Everything here is small, static data (it ships inside the single-file
 * build). The neighborhood records themselves are ordinary lots in
 * `econ.lots`; this file only says where each one stands.
 */

/* ---------------- streets ---------------- */

export type Town = 'crest' | 'wildwood' | 'north';

export interface CrossStreet { n: string; u: number; town: Town }

const CREST_ST = ['Lake Rd', 'Jefferson Ave', 'Aster Rd', 'St. Paul Ave', 'Morning Glory Rd', 'Columbine Rd', 'Trenton Ave', 'Sweet Briar Rd', 'Raleigh Ave', 'Miami Ave', 'Lotus Rd', 'Orchid Rd', 'Primrose Rd', 'Cardinal Rd', 'Rochester Ave', 'Atlanta Ave', 'Myrtle Rd', 'Fern Rd', 'Buttercup Rd', 'Toledo Ave', 'Lavender Rd', 'Stockton Rd', 'Heather Rd', 'Rambler Rd'];
const WW_ST = ['Cresse Ave', 'Roberts Ave', 'Hand Ave', 'Bennett Ave', 'Montgomery Ave', 'Taylor Ave', 'Burk Ave', 'Cedar Ave', 'Spicer Ave', 'Magnolia Ave', 'Oak Ave', 'Pine Ave', 'Wildwood Ave', 'Spencer Ave', 'Schellenger Ave', 'Garfield Ave', 'Lincoln Ave', 'Youngs Ave', 'Hildreth Ave', 'Rio Grande Ave', 'Davis Ave', 'Crocker Ave', 'Leaming Ave', 'Andrews Ave'];
const ord = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'} Ave`;

export const CROSS: CrossStreet[] = [
  ...CREST_ST.map((n, i) => ({ n, u: 260 + i * 105, town: 'crest' as Town })),
  ...WW_ST.map((n, i) => ({ n, u: 2800 + i * 95, town: 'wildwood' as Town })),
  ...Array.from({ length: 26 }, (_, i) => ({ n: ord(26 - i), u: 5090 + i * 88, town: 'north' as Town })),
];
export const CROSS_BY_NAME: Record<string, CrossStreet> = Object.fromEntries(CROSS.map((c) => [c.n, c]));
export const crossU = (n: string): number => CROSS_BY_NAME[n]?.u ?? 0;

/** The island's ends (land tapers off past these). */
export const U_SOUTH = 120;
export const U_NORTH = 7480;

/** Avenues: distance inland from the Boardwalk line, and their names by town. */
export type AveId = 'oc' | 'at' | 'pa' | 'nj' | 'pk';
export const AVENUES: { id: AveId; v: number; names: Partial<Record<Town, string>>; from?: number; to?: number }[] = [
  { id: 'oc', v: 90, names: { crest: 'Ocean Ave', wildwood: 'Ocean Ave', north: 'Ocean Ave' } },
  { id: 'at', v: 210, names: { crest: 'Atlantic Ave', wildwood: 'Atlantic Ave', north: 'Atlantic Ave' } },
  { id: 'pa', v: 330, names: { crest: 'Pacific Ave', wildwood: 'Pacific Ave', north: 'Central Ave' } },
  { id: 'nj', v: 450, names: { crest: 'New Jersey Ave', wildwood: 'New Jersey Ave', north: 'Olde New Jersey Ave' } },
  { id: 'pk', v: 570, names: { crest: 'Park Blvd', wildwood: 'Park Blvd' }, from: 900, to: 5090 },
];
export const AVE_V: Record<AveId, number> = Object.fromEntries(AVENUES.map((a) => [a.id, a.v])) as Record<AveId, number>;

export function townAt(u: number): Town {
  return u < 2790 ? 'crest' : u < 5050 ? 'wildwood' : 'north';
}

/** The Boardwalk: Cresse Avenue to 16th Avenue, 1960. */
export const BOARDWALK = { from: crossU('Cresse Ave'), to: crossU('16th Ave'), w: 16 };

/** How far the beach runs out (to the waterline) — wide at the Crest, thin at the north end. */
export function beachWidth(u: number): number {
  const pts: [number, number][] = [[0, 165], [2800, 150], [4400, 140], [5300, 105], [6400, 70], [7100, 45], [7600, 25]];
  for (let i = 1; i < pts.length; i++) {
    if (u <= pts[i][0]) {
      const [a, b] = [pts[i - 1], pts[i]];
      return a[1] + ((u - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
    }
  }
  return 30;
}

/** Where the land meets the back bay (inland edge of the island). */
export function bayEdge(u: number): number {
  const pts: [number, number][] = [[0, 520], [1500, 540], [2700, 600], [3300, 690], [4200, 700], [4700, 680], [5200, 640], [6400, 620], [7000, 520], [7500, 300]];
  for (let i = 1; i < pts.length; i++) {
    if (u <= pts[i][0]) {
      const [a, b] = [pts[i - 1], pts[i]];
      return a[1] + ((u - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
    }
  }
  return 300;
}

/* ---------------- piers & landmarks ---------------- */

export interface Pier { id: string; name: string; u: number; w: number; len: number; sign: SignColor }
/** The amusement piers of 1960 (positions approximate). */
export const PIERS: Pier[] = [
  { id: 'hunts', name: 'Hunt\'s Pier', u: crossU('Oak Ave'), w: 74, len: 210, sign: 'red' },
  { id: 'marine', name: 'Marine Pier', u: crossU('Schellenger Ave'), w: 70, len: 200, sign: 'turquoise' },
  { id: 'sportland', name: 'Sportland Pier', u: crossU('Rio Grande Ave'), w: 62, len: 190, sign: 'pink' },
  { id: 'casino', name: 'Casino Pier', u: crossU('25th Ave'), w: 56, len: 150, sign: 'gold' },
];

/** Places on the island that are part of the ground, not property (no record). */
export const LANDMARKS: { n: string; u: number; v: number; kind: 'lighthouse' | 'harbor' | 'lake' | 'tower' }[] = [
  { n: 'Hereford Inlet Light', u: 7190, v: 430, kind: 'lighthouse' },
  { n: 'Otten\'s Harbor', u: crossU('Youngs Ave'), v: 700, kind: 'harbor' },
  { n: 'Sunset Lake', u: 700, v: 560, kind: 'lake' },
  { n: 'Water tower', u: crossU('Hildreth Ave') + 40, v: 520, kind: 'tower' },
];

/** The Rio Grande Avenue causeway: from the island's bay edge over the marsh to the mainland. */
export const CAUSEWAY = { u: crossU('Rio Grande Ave'), mainlandV: 2200 };
/** West Wildwood: the little island in the back bay. */
export const WEST_WILDWOOD = { u0: crossU('Pine Ave') - 60, u1: crossU('Davis Ave') + 40, v0: 840, v1: 1080 };

/* ---------------- neighborhoods ---------------- */

export type HoodId = 'boardwalk' | 'pacific' | 'downtown' | 'docks' | 'crest' | 'north' | 'causeway' | 'westww';
export const HOOD_IDS: HoodId[] = ['boardwalk', 'pacific', 'downtown', 'docks', 'crest', 'north', 'causeway', 'westww'];

export interface HoodInfo {
  id: HoodId;
  name: string;
  /** The property zones whose lots make it up. */
  zones: ZoneId[];
  /** The game district its influence comes from. */
  district?: string;
  /** 1960 year-round residents (Census-scale guesses). */
  pop: number;
  blurb: string;
}

export const HOODS: HoodInfo[] = [
  { id: 'boardwalk', name: 'The Boardwalk', zones: ['boardwalk', 'piers'], district: 'boardwalk', pop: 380, blurb: 'Two miles of planks, the piers, the tram car and the summer money.' },
  { id: 'pacific', name: 'Pacific Avenue', zones: ['pacific'], district: 'pacific', pop: 900, blurb: 'The nightclub strip: neon, jazz, a line out the door at two in the morning.' },
  { id: 'downtown', name: 'Downtown Wildwood', zones: ['downtown'], district: 'downtown', pop: 1900, blurb: 'City Hall, the cigar stores, the numbers banks, the year-round town.' },
  { id: 'docks', name: 'Otten\'s Harbor & the Bay', zones: ['docks'], district: 'docks', pop: 620, blurb: 'Fishing boats, freight, and things that fall off trucks.' },
  { id: 'crest', name: 'Wildwood Crest', zones: ['crest'], district: 'crest', pop: 3000, blurb: 'Motel row on Ocean Avenue: pastel, quiet, family money.' },
  { id: 'north', name: 'North Wildwood', zones: ['north'], district: 'north', pop: 3600, blurb: 'Anglesea and the clubs — Danny Kessler\'s side of the island.' },
  { id: 'causeway', name: 'Rio Grande & the Causeway', zones: ['causeway'], district: 'causeway', pop: 1400, blurb: 'The road onto the island. Whoever holds it sees everyone coming.' },
  { id: 'westww', name: 'West Wildwood', zones: ['westww'], pop: 320, blurb: 'A bayside village of fishermen and bungalows.' },
];
export const HOODS_BY_ID = Object.fromEntries(HOODS.map((h) => [h.id, h])) as Record<HoodId, HoodInfo>;

export function hoodOfZone(z: ZoneId): HoodId | undefined {
  return HOODS.find((h) => h.zones.includes(z))?.id;
}

/* ---------------- frontage runs (where lots stand) ---------------- */

/**
 * A run of frontage: an avenue side (`+` the inland side, `-` the ocean side),
 * the Boardwalk row, a pier deck, the mainland end of the causeway, or West
 * Wildwood. Each block between two cross streets holds two parcels.
 */
export type RunId = 'bw' | `${AveId}${'+' | '-'}` | 'pier' | 'cw' | 'ww';
export interface Run { run: RunId; from: string; to: string }

export const ZONE_RUNS: Partial<Record<ZoneId, Run[]>> = {
  boardwalk: [{ run: 'bw', from: 'Cresse Ave', to: '16th Ave' }],
  pacific: [{ run: 'pa+', from: 'Burk Ave', to: 'Rio Grande Ave' }, { run: 'pa-', from: 'Burk Ave', to: 'Rio Grande Ave' }],
  downtown: [{ run: 'nj+', from: 'Cedar Ave', to: 'Rio Grande Ave' }, { run: 'nj-', from: 'Cedar Ave', to: 'Rio Grande Ave' }, { run: 'at+', from: 'Spicer Ave', to: 'Schellenger Ave' }],
  docks: [{ run: 'pk+', from: 'Lincoln Ave', to: 'Andrews Ave' }, { run: 'pk-', from: 'Garfield Ave', to: 'Andrews Ave' }],
  crest: [{ run: 'oc-', from: 'Lake Rd', to: 'Rambler Rd' }, { run: 'oc+', from: 'Jefferson Ave', to: 'Rambler Rd' }, { run: 'at+', from: 'Morning Glory Rd', to: 'Cardinal Rd' }],
  north: [{ run: 'at+', from: '26th Ave', to: '3rd Ave' }, { run: 'nj-', from: '24th Ave', to: '5th Ave' }, { run: 'oc+', from: '15th Ave', to: '3rd Ave' }],
  causeway: [{ run: 'cw', from: 'Pine Ave', to: 'Andrews Ave' }],
  westww: [{ run: 'ww', from: 'Pine Ave', to: 'Davis Ave' }],
};

/* ---------------- the authored 1960 records ---------------- */

/**
 * The hand-placed properties of 1960 (fictional businesses and owners on
 * real streets). Tuple: id, zone, run, cross street (the block north of it),
 * slot ('a' south half, 'b' north half, 'w' the whole block, or the deck
 * slot 0-2 on a pier), use, name, status, owner, who runs it, style, sign,
 * built, condition.
 */
export type SeedRow = [string, ZoneId, RunId, string, 'a' | 'b' | 'w' | 0 | 1 | 2, string, string, 'private' | 'rival' | 'sale' | 'lease' | 'public', FactionId | 'private' | 'city', string, BuildStyle, SignColor, number, number];

export const SEED: SeedRow[] = [
  // The Boardwalk, Cresse Avenue north to the piers.
  ['bw01', 'boardwalk', 'bw', 'Montgomery Ave', 'a', 'icecream', 'Kitty Hawk Frozen Custard', 'private', 'private', 'Rose Albrecht', 'doowop', 'pink', 1956, 82],
  ['bw02', 'boardwalk', 'bw', 'Montgomery Ave', 'b', 'souvenir', 'Seashell Souvenir Emporium', 'private', 'private', 'Abe Kaplan', 'victorian', 'turquoise', 1931, 64],
  ['bw03', 'boardwalk', 'bw', 'Taylor Ave', 'a', 'photo', 'Snap-Shot Photo Studio', 'private', 'private', 'Gus Papadakis', 'deco', 'white', 1938, 70],
  ['bw04', 'boardwalk', 'bw', 'Taylor Ave', 'b', 'arcade', 'Fortune Fun Arcade', 'rival', 'manno', 'Manno crew', 'doowop', 'gold', 1952, 77],
  ['bw05', 'boardwalk', 'bw', 'Burk Ave', 'w', 'concerthall', 'Convention Hall', 'public', 'city', 'the City of Wildwood', 'deco', 'white', 1927, 68],
  ['bw06', 'boardwalk', 'bw', 'Cedar Ave', 'a', 'pizza', 'Pete\'s Boardwalk Pizza', 'private', 'private', 'Pete Marchetti', 'midcentury', 'red', 1949, 74],
  ['bw07', 'boardwalk', 'bw', 'Cedar Ave', 'b', 'giftshop', 'Saltwater Taffy Kitchen', 'private', 'private', 'the Sorensen family', 'victorian', 'pink', 1924, 61],
  ['bw08', 'boardwalk', 'bw', 'Spicer Ave', 'a', 'minigolf', 'Moonglow Miniature Golf', 'private', 'private', 'Harry Lenz', 'tiki', 'green', 1957, 88],
  ['bw09', 'boardwalk', 'bw', 'Spicer Ave', 'b', 'bikes', 'Surrey & Bike Rental', 'private', 'private', 'Mrs. Hallahan', 'colonial', 'blue', 1946, 72],
  ['bw10', 'boardwalk', 'bw', 'Magnolia Ave', 'a', 'jazzclub', 'The Hurricane Room', 'rival', 'kessler', 'Kessler\'s Clubs', 'deco', 'blue', 1948, 79],
  ['bw11', 'boardwalk', 'bw', 'Magnolia Ave', 'b', 'tshirt', 'Funland Novelties', 'lease', 'private', '', 'midcentury', 'turquoise', 1950, 66],
  ['bw12', 'boardwalk', 'bw', 'Pine Ave', 'a', 'trattoria', 'Neptune\'s Fish House', 'private', 'private', 'Lou Castellano', 'colonial', 'red', 1936, 69],
  ['bw13', 'boardwalk', 'bw', 'Pine Ave', 'b', 'arcade', 'Lucky Strike Skee-Ball', 'rival', 'philly', 'a Philadelphia syndicate', 'deco', 'gold', 1941, 71],
  ['bw14', 'boardwalk', 'bw', 'Wildwood Ave', 'a', 'hotel', 'The Wave Crest Hotel', 'rival', 'feldstein', 'Feldstein\'s people', 'deco', 'turquoise', 1929, 75],
  ['bw15', 'boardwalk', 'bw', 'Spencer Ave', 'a', 'stand', 'Coney Island Hot Dogs', 'private', 'private', 'Sid Weintraub', 'doowop', 'red', 1953, 80],
  ['bw16', 'boardwalk', 'bw', 'Spencer Ave', 'b', 'souvenir', 'Seaside Beachwear', 'sale', 'private', 'Joe Pirelli', 'midcentury', 'pink', 1947, 58],
  ['bw17', 'boardwalk', 'bw', 'Garfield Ave', 'a', 'rooming', 'The Driftwood Rooming House', 'private', 'private', 'the Brennan estate', 'victorian', 'white', 1911, 46],
  ['bw18', 'boardwalk', 'bw', 'Garfield Ave', 'b', 'supper', 'The Flamingo Supper Club', 'rival', 'manno', 'Manno crew', 'tiki', 'pink', 1955, 84],
  ['bw19', 'boardwalk', 'bw', 'Lincoln Ave', 'a', 'icecream', 'Arctic Penguin Soft Serve', 'private', 'private', 'Vince DiNardo', 'doowop', 'turquoise', 1958, 90],
  ['bw20', 'boardwalk', 'bw', 'Lincoln Ave', 'b', 'motel', 'The Tropicana Motel', 'sale', 'private', 'the Kovacs family', 'doowop', 'turquoise', 1957, 86],
  ['bw21', 'boardwalk', 'bw', 'Youngs Ave', 'a', 'beachrental', 'Beach Chair & Umbrella Co.', 'private', 'private', 'the Mahaffey brothers', 'colonial', 'gold', 1950, 73],
  ['bw22', 'boardwalk', 'bw', 'Hildreth Ave', 'a', 'motel', 'The Coral Reef Motor Inn', 'rival', 'feldstein', 'Feldstein\'s people', 'doowop', 'pink', 1959, 95],
  // On the piers: a signature ride each.
  ['pr01', 'piers', 'pier', 'Oak Ave', 2, 'ride', 'The Flyer', 'private', 'private', 'the pier company', 'deco', 'red', 1957, 85],
  ['pr02', 'piers', 'pier', 'Schellenger Ave', 2, 'ride', 'The Giant Wheel', 'private', 'private', 'the pier company', 'doowop', 'turquoise', 1955, 82],
  ['pr03', 'piers', 'pier', 'Rio Grande Ave', 2, 'funhouse', 'Laff-Land Funhouse', 'private', 'private', 'the pier company', 'tiki', 'pink', 1954, 78],
  ['pr04', 'piers', 'pier', '25th Ave', 2, 'ride', 'Carousel by the Sea', 'private', 'private', 'the pier company', 'victorian', 'gold', 1925, 66],
  // Ocean Avenue behind the boards at Hunt's Pier (the walkable stretch, walkData.ts): fictional places.
  ['ow01', 'boardwalk', 'oc+', 'Oak Ave', 'a', 'motel', 'The Pelican Court', 'sale', 'private', 'the Lindgren family', 'doowop', 'turquoise', 1956, 74],
  ['ow02', 'boardwalk', 'oc+', 'Oak Ave', 'b', 'diner', 'Irma\'s Luncheonette', 'private', 'private', 'Irma Szabo', 'midcentury', 'red', 1947, 68],
  ['ow03', 'boardwalk', 'oc+', 'Pine Ave', 'a', 'motel', 'The Driftline Motor Inn', 'private', 'private', 'Walt Brennan', 'doowop', 'pink', 1958, 90],
  // Motel row in the Crest (the boom is just starting).
  ['cr01', 'crest', 'oc-', 'Heather Rd', 'w', 'motel', 'The Sputnik Motor Inn', 'private', 'private', 'the Kovacs family', 'doowop', 'turquoise', 1959, 97],
  ['cr02', 'crest', 'oc-', 'Toledo Ave', 'w', 'motel', 'The Coral Flamingo', 'private', 'private', 'Gus Papadakis', 'doowop', 'pink', 1958, 94],
  ['cr03', 'crest', 'oc-', 'Fern Rd', 'w', 'motel', 'The Bali Hai Court', 'private', 'private', 'Harry Lenz', 'tiki', 'green', 1957, 92],
  ['cr04', 'crest', 'oc-', 'Rochester Ave', 'a', 'motel', 'The Tidewater Inn', 'rival', 'feldstein', 'Feldstein\'s people', 'midcentury', 'blue', 1956, 90],
  ['cr05', 'crest', 'oc+', 'Stockton Rd', 'a', 'diner', 'The Rocket Diner', 'private', 'private', 'Mrs. Hallahan', 'doowop', 'red', 1955, 88],
  // The Pacific Avenue strip.
  ['pa01', 'pacific', 'pa+', 'Spicer Ave', 'a', 'jazzclub', 'The Blue Moon', 'rival', 'kessler', 'Kessler\'s Clubs', 'deco', 'blue', 1946, 72],
  ['pa02', 'pacific', 'pa+', 'Wildwood Ave', 'a', 'burlesque', 'The Velvet Rope', 'rival', 'manno', 'Manno crew', 'deco', 'red', 1950, 65],
  ['pa03', 'pacific', 'pa-', 'Pine Ave', 'b', 'supper', 'Club Riviera', 'private', 'private', 'Lou Castellano', 'midcentury', 'gold', 1953, 80],
  ['pa04', 'pacific', 'pa-', 'Schellenger Ave', 'a', 'records', 'Platter Party Records', 'private', 'private', 'Sid Weintraub', 'doowop', 'pink', 1956, 83],
  // The old Seven Seas: a tired supper club on Pacific at Oak, for sale. Whoever buys it can make it the flagship.
  // Taylor Avenue: Crab Legs (a gentlemen's club: business-level, everyone there an adult who chose it) and Sheila's weekly rooms.
  ['pa06', 'pacific', 'pa+', 'Taylor Ave', 'a', 'gents', 'Crab Legs', 'rival', 'kessler', 'Kessler\'s Clubs', 'deco', 'pink', 1958, 81],
  ['pa07', 'pacific', 'pa+', 'Taylor Ave', 'b', 'rooming', 'Sheila\'s Place', 'private', 'private', 'Sheila Dougherty', 'victorian', 'turquoise', 1912, 57],
  // Across Taylor: the King's ballroom (a supper club where the booking manager's acts play) and the Music Key motel.
  ['pa08', 'pacific', 'pa-', 'Taylor Ave', 'a', 'supper', 'The King\'s Club', 'private', 'private', 'Rocco Albano', 'deco', 'pink', 1937, 66],
  ['pa09', 'pacific', 'pa-', 'Taylor Ave', 'b', 'motel', 'Music Key Pool & Suites', 'private', 'private', 'the Novak family', 'doowop', 'turquoise', 1959, 93],
  ['pa05', 'pacific', 'pa-', 'Oak Ave', 'w', 'supper', 'The Seven Seas Supper Club', 'sale', 'private', 'the Albrecht estate', 'deco', 'turquoise', 1938, 52],
  // Anglesea.
  ['nw01', 'north', 'at+', '22nd Ave', 'a', 'hoodclub', 'The Anglesea Inn', 'rival', 'kessler', 'Kessler\'s Clubs', 'victorian', 'green', 1902, 58],
  ['nw02', 'north', 'oc+', '10th Ave', 'a', 'cottage', 'Seabreeze Cottages', 'private', 'private', 'the Sorensen family', 'victorian', 'white', 1922, 63],
  // The places the user painted for the street level (fictional, or long gone: the Shamrock, Chemical Bank).
  // Downtown: the barber, the laundry, the pizza parlor and the soda fountain on New Jersey Avenue.
  ['sa01', 'downtown', 'nj+', 'Cedar Ave', 'a', 'barber', 'Bayshore Barber Shop', 'private', 'private', 'Carmine Ianelli', 'midcentury', 'red', 1948, 71],
  ['sa02', 'downtown', 'nj+', 'Cedar Ave', 'b', 'laundromat', 'Spin City Laundry', 'private', 'private', 'Dot Kriebel', 'doowop', 'turquoise', 1957, 86],
  ['sa03', 'downtown', 'nj+', 'Spicer Ave', 'a', 'pizza', 'Moon Slice Pizza', 'private', 'private', 'Eddie Mastro', 'doowop', 'pink', 1956, 80],
  ['sa04', 'downtown', 'nj+', 'Spicer Ave', 'b', 'pharmacy', 'Penny Candy & Soda', 'private', 'private', 'Bea Galloway', 'victorian', 'pink', 1931, 66],
  // The Shamrock: the old Victorian corner tavern where everybody drinks (and some back rooms get used).
  // (3700 Pacific Avenue, per the user's research; the game's block for it is approximate.)
  ['sa05', 'pacific', 'pa-', 'Spencer Ave', 'a', 'hoodclub', 'The Shamrock', 'private', 'private', 'Packy Gallagher', 'victorian', 'green', 1899, 61],
  ['sa06', 'downtown', 'nj-', 'Oak Ave', 'a', 'hoodclub', 'The Bella Napoli Social Club', 'private', 'private', 'the club\'s members', 'colonial', 'green', 1921, 63],
  ['sa07', 'downtown', 'nj-', 'Pine Ave', 'a', 'office', 'Chemical Bank', 'private', 'private', 'the bank', 'deco', 'white', 1926, 58],
  // Pacific Avenue: an Italian place, a deli and a bar.
  ['sa08', 'pacific', 'pa-', 'Spicer Ave', 'a', 'trattoria', 'Bellavita', 'private', 'private', 'Connie Russo', 'midcentury', 'red', 1951, 77],
  ['sa09', 'pacific', 'pa+', 'Magnolia Ave', 'b', 'deli', 'Bayview Deli', 'private', 'private', 'Max Rubin', 'midcentury', 'turquoise', 1949, 72],
  // The Red Garter: a banjo-and-beer saloon (long gone; its block and years here are unverified).
  ['sa20', 'pacific', 'pa+', 'Oak Ave', 'b', 'hoodclub', 'The Red Garter', 'private', 'private', 'Banjo Bill Kearney', 'victorian', 'red', 1958, 74],
  ['sa10', 'pacific', 'pa+', 'Burk Ave', 'a', 'hoodclub', 'The Anchor Bar & Lounge', 'private', 'private', 'Walt O\'Hara', 'deco', 'turquoise', 1947, 70],
  // The south end of the Boardwalk.
  ['sa11', 'boardwalk', 'bw', 'Roberts Ave', 'a', 'icecream', 'Starlight Scoops', 'private', 'private', 'Irene Petrakis', 'doowop', 'pink', 1957, 88],
  ['sa12', 'boardwalk', 'bw', 'Roberts Ave', 'b', 'giftshop', 'Seaside Sweets Fudge', 'private', 'private', 'Marge Yeager', 'victorian', 'red', 1928, 70],
  ['sa13', 'boardwalk', 'bw', 'Hand Ave', 'a', 'arcade', 'Lucky Sevens Arcade', 'private', 'private', 'Stan Fiorentino', 'doowop', 'turquoise', 1954, 78],
  ['sa14', 'boardwalk', 'bw', 'Bennett Ave', 'a', 'trattoria', 'Captain\'s Table Seafood', 'private', 'private', 'Frank Schmidt', 'midcentury', 'red', 1952, 75],
  // Two new motels in the Crest.
  ['sa15', 'crest', 'oc-', 'Lavender Rd', 'w', 'motel', 'The Blue Comet Motel', 'private', 'private', 'the Novak family', 'doowop', 'blue', 1958, 95],
  ['sa16', 'crest', 'oc-', 'Myrtle Rd', 'w', 'motel', 'The Starfin Motel', 'private', 'private', 'Harry Lenz', 'doowop', 'turquoise', 1959, 96],
  // The cab garage at the foot of the causeway; the seafood house and the cafe on the harbor lane.
  ['sa17', 'causeway', 'cw', 'Pine Ave', 'a', 'taxigarage', 'Shore Cab Co.', 'private', 'private', 'Sal Petrakis', 'midcentury', 'gold', 1950, 68],
  ['sa18', 'docks', 'pk-', 'Garfield Ave', 'a', 'trattoria', 'The Seafood House', 'private', 'private', 'Lou Kriebel', 'victorian', 'white', 1934, 64],
  ['sa19', 'docks', 'pk-', 'Garfield Ave', 'b', 'diner', 'The Cafe', 'private', 'private', 'Connie Duffy', 'victorian', 'red', 1930, 62],
  // Batch 4 (the user's three-quarter models): ownable places on the block map. Klug's and the two
  // motels are near-miss names (the real ones still operate); Groff's is closed (real name kept);
  // the Hurricane is long gone (real name kept); the Boathouse is generic.
  ['sb01', 'boardwalk', 'bw', '26th Ave', 'a', 'diner', 'Klug\'s', 'private', 'private', 'Hank Klug', 'midcentury', 'blue', 1948, 74],
  ['sb02', 'pacific', 'pa+', 'Burk Ave', 'b', 'jazzclub', 'The Hurricane Club', 'private', 'private', 'Dutch Mahler', 'midcentury', 'red', 1952, 70],
  ['sb03', 'boardwalk', 'bw', 'Bennett Ave', 'b', 'trattoria', 'Groff\'s Restaurant', 'private', 'private', 'Elsie Brandt', 'colonial', 'green', 1946, 68],
  ['sb04', 'docks', 'pk+', 'Youngs Ave', 'w', 'trattoria', 'The Boathouse', 'private', 'private', 'Cap Lindqvist', 'victorian', 'blue', 1949, 66],
  ['sb05', 'crest', 'oc-', 'Buttercup Rd', 'w', 'motel', 'The Wai-Kiki Oceanfront Resort', 'private', 'private', 'the Kalani family', 'doowop', 'turquoise', 1959, 94],
  ['sb06', 'crest', 'oc-', 'Atlanta Ave', 'w', 'motel', 'The Malibu Beach Motel', 'private', 'private', 'Ray Delmonico', 'doowop', 'red', 1958, 92],
];

export const SEED_IDS = new Set(SEED.map((r) => r[0]));

/**
 * The family's signature venue: the old Seven Seas on Pacific Avenue becomes
 * "The 7 Sees" the week it is yours (a supper club first; the Empire Designer
 * can take it toward a hotel later). Lose it and the new owner takes the sign down.
 */
/** Lots with a story of their own: what opens there next when the place closes (Taylor's corner turns into a seafood bar). */
export const NEXT_ON_LOT: Record<string, { use: string; name: string }> = { pa06: { use: 'trattoria', name: 'Off Shore' } };

export const FLAGSHIP = { lotId: 'pa05', name: 'The 7 Sees', oldName: 'The Seven Seas Supper Club' };

/* ---------------- the rest of the street ---------------- */

/**
 * Frontage the 1960 town had filled in: each free half-block on these runs
 * gets an ordinary independent business (a record like any other) with the
 * given chance, drawn from the run's mix. Generated once per game from the
 * seed; ids encode the slot (`hf.<zone>.<run>.<cross index>.<half>`).
 */
export const FILL: { zone: ZoneId; run: RunId; from: string; to: string; p: number; uses: string[] }[] = [
  { zone: 'boardwalk', run: 'bw', from: 'Roberts Ave', to: 'Andrews Ave', p: 0.72, uses: ['souvenir', 'stand', 'arcade', 'photo', 'pizza', 'icecream', 'giftshop', 'tshirt', 'beachrental', 'arcade', 'pizza', 'icecream', 'stand', 'giftshop'] },
  { zone: 'pacific', run: 'pa+', from: 'Burk Ave', to: 'Rio Grande Ave', p: 0.32, uses: ['jazzclub', 'supper', 'comedy', 'records', 'barber', 'pizza', 'trattoria', 'deli', 'hoodclub', 'diner', 'salon', 'bookstore'] },
  { zone: 'pacific', run: 'pa-', from: 'Burk Ave', to: 'Rio Grande Ave', p: 0.28, uses: ['jazzclub', 'hoodclub', 'records', 'pizza', 'trattoria', 'deli', 'diner', 'barber', 'comedy'] },
  { zone: 'downtown', run: 'nj+', from: 'Cedar Ave', to: 'Rio Grande Ave', p: 0.22, uses: ['barber', 'salon', 'hardware', 'pharmacy', 'florist', 'tailor', 'shoerepair', 'bookstore', 'deli', 'bakery', 'diner', 'drycleaner', 'furniture', 'appliances', 'funeral', 'printer'] },
  { zone: 'downtown', run: 'nj-', from: 'Cedar Ave', to: 'Rio Grande Ave', p: 0.18, uses: ['barber', 'pharmacy', 'bakery', 'deli', 'hardware', 'florist', 'diner', 'bookstore'] },
  { zone: 'crest', run: 'oc-', from: 'Lake Rd', to: 'Rambler Rd', p: 0.34, uses: ['motel', 'motel', 'motel', 'motel', 'motel', 'cottage'] },
  { zone: 'crest', run: 'oc+', from: 'Jefferson Ave', to: 'Rambler Rd', p: 0.12, uses: ['motel', 'diner', 'icecream', 'cottage', 'giftshop'] },
  { zone: 'north', run: 'at+', from: '26th Ave', to: '3rd Ave', p: 0.18, uses: ['hoodclub', 'jazzclub', 'cottage', 'rooming', 'pizza', 'deli', 'barber', 'motel'] },
  { zone: 'north', run: 'oc+', from: '15th Ave', to: '3rd Ave', p: 0.15, uses: ['cottage', 'motel', 'rooming', 'icecream'] },
  { zone: 'docks', run: 'pk+', from: 'Lincoln Ave', to: 'Andrews Ave', p: 0.25, uses: ['warehouse', 'dockwh', 'marina', 'wholesale', 'machineshop', 'commlaundry'] },
  { zone: 'causeway', run: 'cw', from: 'Pine Ave', to: 'Andrews Ave', p: 0.3, uses: ['gas', 'diner', 'motel', 'garage', 'carwash', 'lumberyard'] },
  { zone: 'westww', run: 'ww', from: 'Pine Ave', to: 'Davis Ave', p: 0.15, uses: ['cottage', 'house', 'marina', 'bakery'] },
];

export const SURNAMES = ['Kaplan', 'DiNardo', 'Papadakis', 'Lenz', 'Sorensen', 'Kovacs', 'Weintraub', 'Castellano', 'Brennan', 'Pirelli', 'Fiorentino', 'Yeager', 'Rubin', 'Mastro', 'Kriebel', 'Duffy', 'Ianelli', 'Novak', 'Albrecht', 'Marchetti', 'Hallahan', 'Russo', 'Schmidt', 'O\'Hara', 'Petrakis', 'Galloway'];
export const FIRSTNAMES = ['Gus', 'Abe', 'Vince', 'Dot', 'Harry', 'Sid', 'Lou', 'Joe', 'Max', 'Connie', 'Walt', 'Sal', 'Bea', 'Rose', 'Pete', 'Marge', 'Eddie', 'Frank', 'Irene', 'Stan'];
export const ADJ = ['Seaside', 'Ocean Breeze', 'Sandy\'s', 'Sunny', 'Starlight', 'Boardwalk', 'Neptune\'s', 'Mermaid', 'Captain\'s', 'Tropical', 'Jolly', 'Lucky', 'Sea Gull', 'Surfside', 'Shore'];
export const NOUN: Record<string, string[]> = {
  souvenir: ['Souvenirs', 'Seashell Shop'], stand: ['Hot Dogs', 'Franks', 'Lemonade'], arcade: ['Arcade', 'Fun Center', 'Playland'], photo: ['Photo', 'Snapshots'], pizza: ['Pizza', 'Tomato Pies'],
  icecream: ['Frozen Custard', 'Ice Cream', 'Soft Serve'], giftshop: ['Gifts', 'Taffy', 'Fudge'], tshirt: ['Novelties'], beachrental: ['Umbrellas'], bikes: ['Bikes'],
  jazzclub: ['Lounge', 'Club'], supper: ['Supper Club'], comedy: ['Comedy Club'], records: ['Records'], barber: ['Barber Shop'], trattoria: ['Ristorante'], deli: ['Deli', 'Subs'],
  hoodclub: ['Tavern', 'Bar & Grill'], diner: ['Diner'], salon: ['Beauty Salon'], bookstore: ['News & Books'], hardware: ['Hardware'], pharmacy: ['Pharmacy'], florist: ['Flowers'],
  tailor: ['Tailor'], shoerepair: ['Shoe Repair'], bakery: ['Bakery'], drycleaner: ['Cleaners'], furniture: ['Furniture'], appliances: ['Appliances'], funeral: ['Funeral Home'], printer: ['Printing'],
  motel: ['Motel', 'Motor Inn', 'Court'], hotel: ['Hotel'], cottage: ['Cottages'], rooming: ['Guest House'], warehouse: ['Storage'], dockwh: ['Marine Supply'], marina: ['Marina'],
  wholesale: ['Seafood Co.'], machineshop: ['Machine Works'], commlaundry: ['Linen Service'], gas: ['Service Station'], garage: ['Garage'], carwash: ['Car Wash'], house: ['Cottage'], lumberyard: ['Lumber'],
};
export const MOTEL_NAMES = ['The Sea Gull', 'The Sandpiper', 'The Surf Rider', 'The Royal Islander', 'The Aqua Vista', 'The Shore Crest', 'The Blue Heron', 'The Coral Sands', 'The Ala Kai', 'The Sea Horse', 'The Monte Carlo', 'The Jet Stream', 'The Sea Shell', 'The Mayan Sun', 'The Imperial 400', 'The Gemini', 'The Orbit', 'The Tahitian', 'The Driftwood', 'The Sun Deck'];
