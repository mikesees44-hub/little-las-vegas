/**
 * NEW YORK, 1960: the five families, the neighborhoods you can work in, and
 * the rackets there (nyc.ts plays them; ui/nyc draws them on the real map).
 *
 * Naming rules (as visitData.ts): every family and every person is
 * fictional. The neighborhoods, the markets, the piers and the airport are
 * real places as they stood in 1960 — Idlewild, not JFK; no Verrazzano
 * bridge (1964); the Third Avenue El gone from Manhattan (1955); the Fulton
 * Fish Market still on South Street.
 *
 * Each district is drawn from New York City's Neighborhood Tabulation Areas
 * (NYC Department of City Planning, public domain): `ntas` lists the NTA
 * codes it covers, and `clip` cuts one along a real street where two 1960
 * neighborhoods share a modern NTA (the Garment District and Times Square
 * meet at 42nd Street). scripts/geo/5_nyc.ts reads this file at build time.
 */

export type NycFamilyId = 'marchetti' | 'corvino' | 'saladino' | 'lobianco' | 'abbadessa';

export interface NycFamily {
  id: NycFamilyId;
  name: string;
  short: string;
  boss: string;
  /** Where the boss holds court (a CityPlace id in visitData.ts, when there is one). */
  seat?: string;
  /** How touchy they are about outsiders (0-1): grievance grows faster. */
  pride: number;
  flavor: string;
}

export const NYC_FAMILIES: Record<NycFamilyId, NycFamily> = {
  marchetti: {
    id: 'marchetti', name: 'The Marchetti family', short: 'Marchetti', boss: 'Gaetano Marchetti', seat: 'ny-marchetti', pride: 0.9,
    flavor: 'The oldest and richest of the five: Mulberry Street, the Garment Center\'s trucks and the Broadway rooms.',
  },
  corvino: {
    id: 'corvino', name: 'The Corvino family', short: 'Corvino', boss: 'Salvatore "Sally Hooks" Corvino', pride: 0.8,
    flavor: 'The waterfront family: the Brooklyn piers, the West Side docks and Staten Island. The hiring boss answers to them.',
  },
  saladino: {
    id: 'saladino', name: 'The Saladino family', short: 'Saladino', boss: 'Carlo "Charlie Ocean" Saladino', pride: 0.6,
    flavor: 'South Brooklyn: social clubs on Eighty-Sixth Street and the games on the Coney Island boardwalk.',
  },
  lobianco: {
    id: 'lobianco', name: 'The Lo Bianco family', short: 'Lo Bianco', boss: 'Ettore "the Teacher" Lo Bianco', pride: 0.7,
    flavor: 'Italian Harlem\'s policy banks and the Bronx produce trade. Old-fashioned, patient, and they keep score.',
  },
  abbadessa: {
    id: 'abbadessa', name: 'The Abbadessa family', short: 'Abbadessa', boss: 'Raffaele "Ralphie Wings" Abbadessa', pride: 0.5,
    flavor: 'The smallest family and the newest money: air cargo at Idlewild and the fish on South Street.',
  },
};

export const NYC_FAMILY_IDS = Object.keys(NYC_FAMILIES) as NycFamilyId[];

export type NycRacketKind = 'numbers' | 'books' | 'shylock' | 'docks' | 'garment' | 'fish' | 'cargo' | 'produce' | 'clubs';

export interface NycRacket {
  kind: NycRacketKind;
  name: string;
  /** Buy-in (1960 dollars). */
  cost: number;
  /** Weekly take at full strength. */
  income: number;
  /** Weekly heat it draws (local = New York police, federal = the Bureau and the rest). */
  heat: { local: number; federal: number };
  /** Who comes looking: the particular risk of this racket. */
  risk?: 'waterfront' | 'federal' | 'rackets';
  text: string;
}

export const NYC_RACKETS: Record<NycRacketKind, NycRacket> = {
  numbers: { kind: 'numbers', name: 'Numbers (policy)', cost: 3000, income: 320, heat: { local: 1, federal: 0 }, text: 'A policy bank: runners, a counting room, the last three digits of the Brooklyn handle.' },
  books: { kind: 'books', name: 'Bookmaking', cost: 3500, income: 360, heat: { local: 1, federal: 0.5 }, text: 'A wire room for the horses at Aqueduct and Belmont, and the Garden fights.' },
  shylock: { kind: 'shylock', name: 'Shylocking', cost: 4000, income: 300, heat: { local: 0.5, federal: 0 }, text: 'Money on the street at six-for-five: the vig comes in every Friday.' },
  docks: { kind: 'docks', name: 'The docks', cost: 8000, income: 900, heat: { local: 0.5, federal: 1 }, risk: 'waterfront', text: 'A hiring boss who owes you, a pier local\'s dues, and what falls off the slings.' },
  garment: { kind: 'garment', name: 'Garment trucking', cost: 9000, income: 850, heat: { local: 0.5, federal: 1 }, risk: 'rackets', text: 'The trucks that carry every dress from Seventh Avenue: a dress house that uses another trucker has a bad week.' },
  fish: { kind: 'fish', name: 'The fish market', cost: 6000, income: 650, heat: { local: 1, federal: 0.5 }, text: 'Unloading, parking and "watchmen" on South Street: every stall pays before dawn.' },
  cargo: { kind: 'cargo', name: 'Airport cargo', cost: 10000, income: 950, heat: { local: 0.5, federal: 1.5 }, risk: 'federal', text: 'Freight terminals at Idlewild: furs, watches and payrolls flown in from everywhere.' },
  produce: { kind: 'produce', name: 'The produce trade', cost: 6500, income: 600, heat: { local: 0.5, federal: 0.5 }, text: 'Who unloads the boxcars at the Terminal Market, and what each wholesaler pays to have it done.' },
  clubs: { kind: 'clubs', name: 'Nightclubs & after-hours', cost: 5000, income: 480, heat: { local: 1.5, federal: 0.5 }, text: 'A piece of a supper club and an after-hours joint behind a garage door.' },
};

export type NycBorough = 'Manhattan' | 'Brooklyn' | 'Bronx' | 'Queens' | 'Staten Island';

export interface NycDistrict {
  id: string;
  name: string;
  borough: NycBorough;
  /** NYC Neighborhood Tabulation Area codes it is drawn from. */
  ntas: string[];
  /** Cut along a street: keep the side of the line (lon, lat) that holds `keep`. */
  clip?: { line: [[number, number], [number, number]]; keep: [number, number] };
  /** Where the label sits (lon, lat). */
  at: [number, number];
  /** Who runs it in 1960 (undefined: open ground, nobody's). */
  family?: NycFamilyId;
  rackets: NycRacketKind[];
  /** City places (visitData.ts) that are here. */
  places?: string[];
  /** Income multiplier for the neighborhood (busy places pay more). */
  rich: number;
  text: string;
}

export const NYC_DISTRICTS: NycDistrict[] = [
  {
    id: 'littleitaly', name: 'Little Italy & Mulberry Street', borough: 'Manhattan', ntas: ['MN24'], at: [-73.9973, 40.7193], family: 'marchetti',
    rackets: ['numbers', 'shylock', 'clubs'], places: ['ny-marchetti', 'ny-bank'], rich: 1.1,
    text: 'Mulberry and Mott: social clubs, the San Gennaro feast every September, and the Marchettis\' clubhouse. Nobody opens a door here without asking.',
  },
  {
    id: 'lowereast', name: 'The Lower East Side', borough: 'Manhattan', ntas: ['MN28'], at: [-73.9840, 40.7160],
    rackets: ['numbers', 'shylock'], rich: 0.8,
    text: 'Tenements, pushcarts on Orchard Street and the old Jewish bookmakers, mostly gone uptown or to Florida. Nobody holds it any more.',
  },
  {
    id: 'fulton', name: 'Fulton Fish Market', borough: 'Manhattan', ntas: ['MN25'], at: [-74.0030, 40.7068], family: 'abbadessa',
    rackets: ['fish', 'shylock'], rich: 1,
    text: 'South Street under the old East River piers: the boats in at four, the fish sold by six, and every stall pays the "watchmen".',
  },
  {
    id: 'garment', name: 'The Garment District', borough: 'Manhattan', ntas: ['MN17'],
    clip: { line: [[-73.9862, 40.7564], [-73.9680, 40.7489]], keep: [-73.9905, 40.7510] }, at: [-73.9915, 40.7518], family: 'marchetti',
    rackets: ['garment', 'shylock', 'books'], places: ['ny-feld', 'ny-fence'], rich: 1.2,
    text: 'Seventh Avenue from 34th to 42nd: push boys with dress racks, the Garment Center\'s loft shops, and the trucks that carry it all.',
  },
  {
    id: 'timessq', name: 'Times Square & Broadway', borough: 'Manhattan', ntas: ['MN17'],
    clip: { line: [[-73.9862, 40.7564], [-73.9680, 40.7489]], keep: [-73.9840, 40.7600] }, at: [-73.9850, 40.7585], family: 'marchetti',
    rackets: ['clubs', 'books', 'numbers'], places: ['ny-latin', 'ny-stork', 'ny-shop'], rich: 1.3,
    text: 'The Crossroads of the World: the movie palaces, the supper clubs on Broadway, and the bookmakers in every cigar store.',
  },
  {
    id: 'hellskitchen', name: 'Hell\'s Kitchen & the West Side piers', borough: 'Manhattan', ntas: ['MN15'], at: [-73.9935, 40.7650], family: 'corvino',
    rackets: ['docks', 'shylock', 'numbers'], rich: 1,
    text: 'The ocean-liner piers on the Hudson, the shape-up at dawn, and Irish and Italian longshoremen who settle things with hooks.',
  },
  {
    id: 'eastharlem', name: 'East Harlem (Italian Harlem)', borough: 'Manhattan', ntas: ['MN33', 'MN34'], at: [-73.9380, 40.7960], family: 'lobianco',
    rackets: ['numbers', 'shylock', 'clubs'], rich: 0.9,
    text: 'Pleasant Avenue and 116th Street: the biggest policy banks in the city and the Lo Bianco family\'s oldest blocks.',
  },
  {
    id: 'bronxmarket', name: 'The Bronx Terminal Market', borough: 'Bronx', ntas: ['BX63'], at: [-73.9290, 40.8250], family: 'lobianco',
    rackets: ['produce', 'numbers'], rich: 1,
    text: 'The city\'s wholesale produce yards by the Harlem River, in the shadow of Yankee Stadium. Every crate is unloaded by somebody\'s man.',
  },
  {
    id: 'arthurave', name: 'Belmont & Arthur Avenue', borough: 'Bronx', ntas: ['BX06'], at: [-73.8870, 40.8550], family: 'lobianco',
    rackets: ['numbers', 'books', 'shylock'], places: ['ny-comm'], rich: 0.9,
    text: 'The Bronx\'s Little Italy: pork stores, the retail market, and the private room where the Commission\'s go-between eats.',
  },
  {
    id: 'redhook', name: 'Red Hook & the Brooklyn waterfront', borough: 'Brooklyn', ntas: ['BK33', 'BK38'], at: [-74.0080, 40.6800], family: 'corvino',
    rackets: ['docks', 'shylock', 'numbers'], places: ['ny-hide'], rich: 1.1,
    text: 'The busiest piers in the world: freighters three deep off Columbia Street, and a shape-up where the Corvinos pick who works.',
  },
  {
    id: 'bensonhurst', name: 'Bensonhurst', borough: 'Brooklyn', ntas: ['BK27', 'BK28', 'BK29'], at: [-73.9970, 40.6050], family: 'saladino',
    rackets: ['numbers', 'books', 'clubs'], rich: 0.9,
    text: 'Eighty-Sixth Street under the West End el: bakeries, social clubs and two-family houses. The Saladinos grew up here.',
  },
  {
    id: 'coney', name: 'Coney Island', borough: 'Brooklyn', ntas: ['BK21', 'BK19'], at: [-73.9860, 40.5774], family: 'saladino',
    rackets: ['clubs', 'shylock', 'numbers'], rich: 0.9,
    text: 'The boardwalk, the Cyclone, Steeplechase Park and every rigged game of chance on Surf Avenue. A Wildwood man feels at home.',
  },
  {
    id: 'idlewild', name: 'Idlewild Airport', borough: 'Queens', ntas: ['QN98'], at: [-73.7850, 40.6440], family: 'abbadessa',
    rackets: ['cargo'], rich: 1.2,
    text: 'New York International Airport — everybody says Idlewild — on the Jamaica Bay marshes, and its freight terminals. Air cargo is the new waterfront.',
  },
  {
    id: 'sidocks', name: 'Staten Island docks', borough: 'Staten Island', ntas: ['SI37', 'SI22'], at: [-74.0790, 40.6290], family: 'corvino',
    rackets: ['docks', 'numbers'], rich: 0.8,
    text: 'Stapleton\'s piers and the St. George ferry terminal. No bridge to Brooklyn: the ferry, or the long way round through New Jersey.',
  },
];

export const NYC_DISTRICTS_BY_ID: Record<string, NycDistrict> = Object.fromEntries(NYC_DISTRICTS.map((d) => [d.id, d]));
