import { NYC_FAMILIES, NYC_FAMILY_IDS, type NycFamilyId } from './nycData';
import type { RivalId } from './types';

/**
 * THE FAMILIES' WEB, the data: every crime family the house deals with, near
 * and far, grouped the way the boss thinks of them (the island, Philadelphia
 * over the Shore, the Atlantic City crew, New York, out of town), each with a
 * lean roster and the ties it starts the game with (familyWeb.ts plays them).
 *
 * Naming rules (as visitData.ts and nycData.ts): every family and every
 * person here is fictional. Cities are real backdrop only. The casinos in
 * Atlantic City are not legal until 1976-78: in 1960 the Atlantic City crew
 * runs the boardwalk games, the numbers, the Club (a back-room card game in
 * Ducktown) and the inlet docks. Philadelphia's own boss is the old man in
 * South Philadelphia, never named and never quoted (history.ts): the men the
 * Shore deals with are his underboss, his consigliere and his capos.
 */

export type FamGroup = 'local' | 'philly' | 'ac' | 'nj' | 'nyc' | 'out';

export const GROUP_TITLE: Record<FamGroup, string> = {
  local: 'On the island',
  philly: 'Philadelphia',
  ac: 'Atlantic City',
  nj: 'North Jersey',
  nyc: 'New York',
  out: 'Out of town',
};

export const GROUP_ORDER: FamGroup[] = ['local', 'philly', 'ac', 'nj', 'nyc', 'out'];

/** Philadelphia's other outfits (South Philadelphia is the 'philly' family at the Table). */
export type PhillyOutfit = 'westphilly' | 'nephilly' | 'northphilly';
export type OutFamId = PhillyOutfit | 'chicago' | 'vegas' | 'cleveland' | 'newark' | 'boston';

/** A family in the web: a rival on the board, a New York family, an outfit out of town, or the boss's own house. */
export type FamKey = 'player' | Exclude<RivalId, 'law'> | NycFamilyId | OutFamId;

export type RosterRole = 'boss' | 'underboss' | 'consigliere' | 'capo' | 'soldier';

export interface RosterMan {
  name: string;
  role: RosterRole;
  /** What he runs, or where he sits. */
  note?: string;
  /** Kept out of sight (Philadelphia's old man): shown by role, never by name. */
  offstage?: boolean;
  /** For a mixed outfit: his people (the outfit's own otherwise). */
  eth?: 'Italian' | 'Irish' | 'Jewish' | 'Black';
}

export interface FamDef {
  id: Exclude<FamKey, 'player'>;
  name: string;
  short: string;
  group: FamGroup;
  seat: string;
  /** The boss's name, for a family without a character on the board. */
  boss?: string;
  rackets: string[];
  blurb: string;
  /** The men (fictional); for a family on the board its living characters come first. */
  roster: RosterMan[];
  /** A cities.ts id where the envoy goes. */
  city?: string;
  /** How far: a local envoy is cheap, a man to Chicago is not. */
  reach: 1 | 2 | 3;
  /** Realistic size in compact form: men in all (made men and associates), made men, crews. */
  men: number;
  made: number;
  crews: number;
  /** Their people (a named man minted on demand gets it; a mixed outfit names it per man). */
  eth: 'Italian' | 'Irish' | 'Jewish' | 'Black';
}

const NYC_ROSTER: Record<NycFamilyId, RosterMan[]> = {
  marchetti: [
    { name: 'Aldo "the Tailor" Fiorentino', role: 'underboss', note: 'the Garment Center\'s trucks' },
    { name: 'Bartolomeo Scuderi', role: 'consigliere', note: 'Mulberry Street' },
    { name: 'Nino Gargano', role: 'capo', note: 'the Broadway rooms' },
    { name: 'Freddie Lentini', role: 'soldier' },
  ],
  corvino: [
    { name: 'Paul "the Crane" Ventimiglia', role: 'underboss', note: 'the Brooklyn piers' },
    { name: 'Ignazio Calò', role: 'consigliere' },
    { name: 'Jimmy "Pier Six" Dellamonica', role: 'capo', note: 'the West Side docks' },
    { name: 'Tony Sabatella', role: 'soldier' },
  ],
  saladino: [
    { name: 'Sebastiano "Benny Shoes" Amalfitano', role: 'underboss', note: 'Eighty-Sixth Street' },
    { name: 'Cosimo Ferlito', role: 'consigliere' },
    { name: 'Carmine Ruggeri', role: 'capo', note: 'South Brooklyn (the Ruggeri house)' },
    { name: 'Vinnie "Coney" Lupardo', role: 'capo', note: 'the Coney Island games' },
  ],
  lobianco: [
    { name: 'Fortunato "Freddie" Iovine', role: 'underboss', note: 'East Harlem policy' },
    { name: 'Anselmo Briganti', role: 'consigliere' },
    { name: 'Gus "Arthur Avenue" Nunziata', role: 'capo', note: 'the Bronx produce yards' },
  ],
  abbadessa: [
    { name: 'Rocco "the Gull" Spina', role: 'underboss', note: 'the Fulton Fish Market' },
    { name: 'Leonard Weisbrod', role: 'consigliere', note: 'the books' },
    { name: 'Sammy "Cargo" Delfino', role: 'capo', note: 'air cargo at Idlewild' },
  ],
};

const NYC_RACKETS: Record<NycFamilyId, string[]> = {
  marchetti: ['Garment Center trucks', 'Broadway card rooms', 'casino points'],
  corvino: ['The waterfront', 'Staten Island', 'shylocking'],
  saladino: ['Social clubs', 'Coney Island games', 'bookmaking'],
  lobianco: ['Harlem policy banks', 'Bronx produce'],
  abbadessa: ['Fulton Fish Market', 'Idlewild air cargo'],
};

/** Size of the New York families in 1960 (compact: counts, not people). */
const NYC_SIZE: Record<NycFamilyId, [number, number, number]> = {
  marchetti: [340, 120, 22], corvino: [300, 110, 20], lobianco: [220, 80, 15], saladino: [200, 75, 14], abbadessa: [160, 60, 11],
};

const NYC_DEFS: FamDef[] = NYC_FAMILY_IDS.map((id) => {
  const f = NYC_FAMILIES[id];
  const [men, made, crews] = NYC_SIZE[id];
  return {
    id, name: f.name, short: f.short, group: 'nyc' as const, seat: 'New York', boss: f.boss,
    rackets: NYC_RACKETS[id], blurb: f.flavor, roster: [{ name: f.boss, role: 'boss' as const }, ...NYC_ROSTER[id]], city: 'newyork', reach: 2 as const,
    men, made, crews, eth: 'Italian' as const,
  };
});

export const FAMILY_DEFS: FamDef[] = [
  {
    id: 'kessler', name: 'Kessler\'s Clubs', short: 'Kessler', group: 'local', seat: 'North Wildwood', reach: 1, men: 18, made: 0, crews: 2, eth: 'Irish',
    rackets: ['North Wildwood clubs', 'after-hours bars', 'a bookmaker or two'],
    blurb: 'Danny Kessler answers to nobody: an Irish club owner with cousins in Boston and no love for Atlantic City.',
    roster: [{ name: 'Mickey Kessler', role: 'capo', note: 'the bars on Olde New Jersey Avenue' }],
  },
  {
    id: 'feldstein', name: 'Feldstein Money', short: 'Feldstein', group: 'local', seat: 'The boardwalk (New York money)', reach: 1, men: 12, made: 0, crews: 1, eth: 'Jewish',
    rackets: ['boardwalk leases', 'hotel paper', 'casino points out west'],
    blurb: 'Ira Feldstein buys the boardwalk with New York money; the Genovese people stand behind him, and the desert pays him a point.',
    roster: [{ name: 'Herschel "Hesh" Lieberman', role: 'consigliere', note: 'the accountant' }],
  },
  {
    id: 'philly', name: 'The South Philadelphia family', short: 'South Philly', group: 'philly', seat: 'South Philadelphia', reach: 1, city: 'philadelphia', men: 80, made: 45, crews: 8, eth: 'Italian',
    rackets: ['the Table over the Shore', 'tribute from every crew', 'the Ninth Street market', 'Vineland egg-farm numbers', 'Camden shipyards'],
    blurb: 'The Italian family that sits over the Shore and keeps the Table. The old man never comes down; his capos keep the Table, his underboss sends a man to look at the books.',
    roster: [
      { name: 'The old man', role: 'boss', note: 'South Philadelphia; never comes to the Shore', offstage: true },
      { name: 'Vincenzo "Jimmy Chairs" Lauritano', role: 'underboss', note: 'sends the men who check the books' },
      { name: 'Ottavio "the Professor" Massaro', role: 'consigliere', note: 'keeps the rules of the Table' },
      { name: 'Nicholas Lucarelli', role: 'capo', note: 'the Ninth Street market (the Lucarelli house)' },
      { name: 'Pasquale "Patsy Eggs" Dorazio', role: 'capo', note: 'Vineland and the egg-farm numbers' },
      { name: 'Rocco Tafuri', role: 'soldier', note: 'the underboss\'s driver' },
      { name: 'Gino Spadafora', role: 'soldier', note: 'a bagman on the White Horse Pike' },
      { name: 'Dom "the Bull" Iacobucci', role: 'soldier' },
    ],
  },
  {
    id: 'westphilly', name: 'The Lancaster Avenue men', short: 'West Philly', group: 'philly', seat: 'West Philadelphia', reach: 1, city: 'philadelphia', men: 30, made: 0, crews: 3, eth: 'Black',
    rackets: ['the West Philadelphia numbers banks', 'after-hours clubs on Lancaster Avenue', 'a jitney line'],
    blurb: 'An all-Black outfit that banks the numbers from Haverford Avenue to the Bottom. They pay South Philadelphia a street tax and resent every dollar of it.',
    roster: [
      { name: 'Clarence "Deacon" Whitfield', role: 'boss', note: 'the biggest numbers bank west of the Schuylkill' },
      { name: 'Odell Harmon', role: 'underboss', note: 'the counting rooms' },
      { name: 'Leroy "Sugar" Battle', role: 'capo', note: 'the after-hours clubs' },
      { name: 'Marcus Pettaway', role: 'capo', note: 'the runners and the jitneys' },
      { name: 'Booker Odom', role: 'soldier' },
    ],
  },
  {
    id: 'nephilly', name: 'The Tacony crew', short: 'Northeast Philly', group: 'philly', seat: 'Northeast Philadelphia', reach: 1, city: 'philadelphia', men: 25, made: 0, crews: 3, eth: 'Irish',
    rackets: ['hijacked trucks on the Roosevelt Boulevard', 'the Frankford bookmakers', 'union muscle at the Navy Yard'],
    blurb: 'Irish truck thieves and union muscle from Tacony and Mayfair. They answer to nobody in South Philadelphia, and say so loudly.',
    roster: [
      { name: 'Francis "Frank the Shovel" Gallagher', role: 'boss' },
      { name: 'Dinny McBride', role: 'underboss', note: 'the trucks' },
      { name: 'Tommy Kilbane', role: 'capo', note: 'the Frankford books' },
      { name: 'Eamon Flood', role: 'capo', note: 'the Navy Yard locals' },
    ],
  },
  {
    id: 'northphilly', name: 'The Girard Avenue crew', short: 'North Philly', group: 'philly', seat: 'North Philadelphia', reach: 1, city: 'philadelphia', men: 35, made: 0, crews: 4, eth: 'Italian',
    rackets: ['policy on Girard Avenue', 'fencing off the rail yards', 'card games in every back room'],
    blurb: 'A wild mix that grew up on the same blocks: Italian, Irish, Jewish, Black, Puerto Rican and Polish, loyal to each other and to the money. Everybody wants them; nobody controls them.',
    roster: [
      { name: 'Benny "the Bookkeeper" Rosen', role: 'boss', note: 'keeps the peace and the books', eth: 'Jewish' },
      { name: 'Joey Cucinotta', role: 'underboss', note: 'the fences', eth: 'Italian' },
      { name: 'Earl Tate', role: 'capo', note: 'the policy writers', eth: 'Black' },
      { name: 'Héctor "Tito" Figueroa', role: 'capo', note: 'the card games on Fifth Street' },
      { name: 'Ray Kowalczyk', role: 'capo', note: 'the rail yards', eth: 'Irish' },
      { name: 'Paddy Doyle Byrne', role: 'soldier', eth: 'Irish' },
    ],
  },
  {
    id: 'manno', name: 'The Atlantic City crew (Manno)', short: 'Manno', group: 'ac', seat: 'Atlantic City, forty miles up the Shore', reach: 1, city: 'ac', men: 35, made: 14, crews: 4, eth: 'Italian',
    rackets: ['the boardwalk games and auction houses', 'the numbers', 'the Club (a Ducktown card room)', 'the inlet docks'],
    blurb: 'Carmine Manno runs Atlantic City for South Philadelphia and sits at its Table. No casinos here yet: the boardwalk games, the numbers, the Club and the inlet pay, and he wants Wildwood\'s summer too.',
    roster: [
      { name: 'Frank "Ducktown" Abruzzo', role: 'underboss', note: 'Ducktown, the Club' },
      { name: 'Gennaro "Doc" Sacco', role: 'consigliere' },
      { name: 'Lou "the Boards" Ciampa', role: 'capo', note: 'the boardwalk games and auction houses' },
      { name: 'Eddie Fusco', role: 'capo', note: 'the numbers' },
      { name: 'Joe "the Club" Marraccini', role: 'capo', note: 'the Club\'s card game' },
      { name: 'Tony "Inlet" Dellarocca', role: 'capo', note: 'the inlet docks' },
      { name: 'Sonny Gentile', role: 'soldier', note: 'in Wildwood for the summer' },
      { name: 'Ritchie Vona', role: 'soldier', note: 'in Wildwood for the summer' },
    ],
  },
  {
    id: 'newark', name: 'The DeAngelis crew (North Jersey)', short: 'North Jersey', group: 'nj', seat: 'Newark, Elizabeth and Paterson', boss: 'Augie DeAngelis', city: 'newark', reach: 2, men: 40, made: 18, crews: 5, eth: 'Italian',
    rackets: ['Port Newark', 'Ironbound policy', 'garbage carting', 'the Elizabeth docks', 'Paterson mill-town numbers', 'jukebox routes down the Shore'],
    blurb: 'North Jersey\'s crew: the port, the policy banks of the Ironbound, carting from Elizabeth to Paterson. The Genovese people made them, and their jukeboxes play in Atlantic City.',
    roster: [
      { name: 'Augie DeAngelis', role: 'boss' },
      { name: 'Sal "Specs" Mazzarella', role: 'underboss', note: 'Elizabeth and the docks' },
      { name: 'Dutch Kronauer', role: 'capo', note: 'the carting routes', eth: 'Irish' },
      { name: 'Vito Carrano', role: 'capo', note: 'Paterson' },
      { name: 'Nicky "Jukebox" Albano', role: 'capo', note: 'the jukebox routes down the Shore' },
    ],
  },
  ...NYC_DEFS,
  {
    id: 'boston', name: 'The Corrigan Gang', short: 'Corrigan', group: 'out', seat: 'Boston', boss: 'Francis Corrigan', city: 'boston', reach: 3, men: 70, made: 0, crews: 6, eth: 'Irish',
    rackets: ['bookmaking', 'liquor', 'loansharking'],
    blurb: 'Southie\'s Irish gang. Danny Kessler\'s mother was a Corrigan.',
    roster: [{ name: 'Francis Corrigan', role: 'boss' }, { name: 'Kevin "Mouse" Corrigan', role: 'capo', note: 'the books' }],
  },
  {
    id: 'chicago', name: 'The Midway Outfit', short: 'Chicago', group: 'out', seat: 'Chicago', boss: 'Tony Varrone', city: 'chicago', reach: 3, men: 300, made: 110, crews: 20, eth: 'Italian',
    rackets: ['everything west of Ohio', 'the racing wire', 'the desert skim'],
    blurb: 'They run Las Vegas from Chicago and they do not share. Salvatore Pellegrini is their captain for the East.',
    roster: [{ name: 'Tony Varrone', role: 'boss' }, { name: 'Salvatore Pellegrini', role: 'capo', note: 'the Pellegrini house; the unions' }],
  },
  {
    id: 'vegas', name: 'The Silver Strip Partners', short: 'Las Vegas', group: 'out', seat: 'Las Vegas', boss: 'Sid Wexler', city: 'vegas', reach: 3, men: 60, made: 0, crews: 4, eth: 'Jewish',
    rackets: ['casino points', 'the count room'],
    blurb: 'The count room in the desert. Everyone back east has a point in a Strip casino; the Adlers keep the skim honest.',
    roster: [{ name: 'Sid Wexler', role: 'boss' }, { name: 'Meyer Adler', role: 'consigliere', note: 'the Adler house; the count room' }],
  },
  {
    id: 'cleveland', name: 'The Kovacs Syndicate', short: 'Cleveland', group: 'out', seat: 'Cleveland', boss: 'Geza Kovacs', city: 'cleveland', reach: 3, men: 90, made: 30, crews: 7, eth: 'Italian',
    rackets: ['casino points', 'the Teamsters', 'jukebox routes'],
    blurb: 'Lake Erie money with a hand in the Vegas casinos. Angelo Galvani is the Syndicate\'s underboss.',
    roster: [{ name: 'Geza Kovacs', role: 'boss' }, { name: 'Angelo Galvani', role: 'underboss', note: 'the Galvani house' }],
  },
];

export const FAMILY_BY_ID: Record<string, FamDef> = Object.fromEntries(FAMILY_DEFS.map((d) => [d.id, d]));
export const FAM_KEYS = FAMILY_DEFS.map((d) => d.id);

/* ------------------------------------------------------------------ */
/* Ties                                                                 */
/* ------------------------------------------------------------------ */

export type TieKind = 'marriage' | 'blood' | 'partners' | 'racket' | 'sponsor' | 'debt' | 'friends' | 'truce' | 'broken' | 'feud';

/** How warm a tie runs (−1 hostile … +1 kin). */
export const TIE_SIGN: Record<TieKind, number> = {
  marriage: 1, blood: 1, sponsor: 0.9, partners: 0.8, racket: 0.6, friends: 0.5, debt: 0.4, truce: 0.2, broken: -0.7, feud: -1,
};

export const TIE_LABEL: Record<TieKind, string> = {
  marriage: 'Marriage', blood: 'Blood kin', partners: 'Partners', racket: 'A shared racket', sponsor: 'Made them', debt: 'A debt',
  friends: 'Friends', truce: 'A truce', broken: 'A broken truce', feud: 'Feud',
};

export const TIE_GLYPH: Record<TieKind, string> = {
  marriage: '⚭', blood: '≡', sponsor: '♔', partners: '⇄', racket: '$', debt: '⊖', friends: '☺', truce: '⚐', broken: '⚡', feud: '⚔',
};

export interface SeedTie {
  a: FamKey;
  b: FamKey;
  kind: TieKind;
  since: number;
  strength: number;
  story: string;
  /** Debt: who owes (a or b); sponsor: who made whom (a made b). */
  by?: 'a' | 'b';
}

/**
 * The web as it stood on Memorial Day 1960. Every family has at least one
 * tie (tests/familyTies.test.ts); the player's house is tied to Philadelphia,
 * the family that put it on the island.
 */
export const SEED_TIES: SeedTie[] = [
  { a: 'philly', b: 'player', kind: 'sponsor', since: 1958, strength: 60, story: 'Philadelphia put your house on the island and takes its tribute every week.' },
  { a: 'philly', b: 'manno', kind: 'sponsor', since: 1952, strength: 70, story: 'Philadelphia gave Carmine Manno Atlantic City in 1952; he sits at the Table and kicks up to South Philadelphia.' },
  { a: 'manno', b: 'kessler', kind: 'feud', since: 1956, strength: 55, story: 'Manno wants North Wildwood\'s bars; Kessler threw his collector through a plate-glass window in 1956.' },
  { a: 'manno', b: 'saladino', kind: 'marriage', since: 1949, strength: 60, story: 'Carmine Manno\'s sister married a Saladino nephew in 1949: Brooklyn money summers in Atlantic City.' },
  { a: 'feldstein', b: 'marchetti', kind: 'partners', since: 1953, strength: 70, story: 'Genovese money is behind every lease Ira Feldstein buys on the boardwalk.' },
  { a: 'feldstein', b: 'vegas', kind: 'racket', since: 1955, strength: 45, story: 'Feldstein holds a point in a Strip casino through the Silver Strip Partners.' },
  { a: 'kessler', b: 'boston', kind: 'blood', since: 1924, strength: 65, story: 'Danny Kessler\'s mother was a Corrigan: Boston cousins who come down in August.' },
  { a: 'philly', b: 'marchetti', kind: 'truce', since: 1931, strength: 50, story: 'An old understanding from 1931: New York stays out of the Delaware Valley, Philadelphia stays out of New York.' },
  { a: 'corvino', b: 'philly', kind: 'debt', since: 1957, strength: 40, by: 'a', story: 'The Gambino family owes South Philadelphia for a Camden pier boss who looked the other way in 1957.' },
  { a: 'marchetti', b: 'lobianco', kind: 'marriage', since: 1946, strength: 65, story: 'A Marchetti daughter married Ettore Lo Bianco\'s son in 1946; the two families vote together on the Commission.' },
  { a: 'corvino', b: 'saladino', kind: 'feud', since: 1958, strength: 50, story: 'The Gambino piers against the Profaci clubs: two Gambino men went missing in 1958 and nobody forgot.' },
  { a: 'corvino', b: 'abbadessa', kind: 'racket', since: 1950, strength: 50, story: 'The fish comes off the Gambino piers to the Bonanno market: they share the waterfront\'s take.' },
  { a: 'marchetti', b: 'newark', kind: 'sponsor', since: 1947, strength: 60, story: 'Gaetano Marchetti made Augie DeAngelis boss of Newark in 1947.' },
  { a: 'chicago', b: 'vegas', kind: 'racket', since: 1950, strength: 75, story: 'Chicago\'s men count the skim in the desert: the Silver Strip Partners answer to the Outfit.' },
  { a: 'cleveland', b: 'vegas', kind: 'partners', since: 1952, strength: 55, story: 'The Kovacs Syndicate built half a Strip casino and keeps its points.' },
  { a: 'chicago', b: 'lobianco', kind: 'broken', since: 1957, strength: 40, story: 'A truce over the racing wire, broken in 1957 when Chicago cut the Harlem books off.' },
  { a: 'westphilly', b: 'philly', kind: 'truce', since: 1955, strength: 40, story: 'The Lancaster Avenue men pay South Philadelphia a street tax on the numbers; the truce holds as long as the envelope comes.' },
  { a: 'westphilly', b: 'northphilly', kind: 'racket', since: 1953, strength: 55, story: 'West and North Philadelphia lay off each other\'s big numbers hits: one wire, two banks.' },
  { a: 'nephilly', b: 'northphilly', kind: 'feud', since: 1959, strength: 50, story: 'A Tacony crew truck full of furs went missing in a Girard Avenue rail yard in 1959.' },
  { a: 'nephilly', b: 'boston', kind: 'blood', since: 1930, strength: 45, story: 'Frank Gallagher\'s brother married into Southie: the Corrigans send men when Tacony needs them.' },
  { a: 'nephilly', b: 'philly', kind: 'broken', since: 1958, strength: 45, story: 'The Tacony crew stopped paying South Philadelphia in 1958, and the Table has not decided what to do about it.' },
  { a: 'northphilly', b: 'feldstein', kind: 'debt', since: 1957, strength: 30, by: 'b', story: 'Feldstein borrowed Girard Avenue money to close a boardwalk lease; Benny Rosen keeps the note.' },
  { a: 'newark', b: 'manno', kind: 'racket', since: 1956, strength: 45, story: 'DeAngelis jukeboxes play in every Atlantic City bar; Manno takes a quarter of the coin.' },
  { a: 'abbadessa', b: 'manno', kind: 'partners', since: 1958, strength: 35, story: 'Bonanno trucks run Manno\'s inlet fish to South Street, and the Atlantic City crew takes a nickel a crate.' },
];

/** Extra ties a seed can add (one each new game, on the web's own dice): the island's mixed loyalties. */
export const SEED_EXTRAS: SeedTie[] = [
  { a: 'kessler', b: 'player', kind: 'debt', since: 1959, strength: 35, by: 'a', story: 'Your house lent Danny Kessler the money to reopen after the fire of 1959. He has not forgotten, or paid.' },
  { a: 'feldstein', b: 'player', kind: 'partners', since: 1959, strength: 30, story: 'Feldstein holds the paper on one of your motels: a partner nobody chose.' },
  { a: 'saladino', b: 'player', kind: 'friends', since: 1957, strength: 30, story: 'Your father drank with Charlie Ocean Saladino at the Riptide every August.' },
  { a: 'lobianco', b: 'feldstein', kind: 'debt', since: 1958, strength: 35, by: 'b', story: 'Feldstein borrowed Lo Bianco money for a hotel on the boards and still owes the last third.' },
];

/** The grudge start: Manno never forgave your father (newGame.ts STARTING_PROBLEMS.grudge). */
export const GRUDGE_TIE: SeedTie = { a: 'manno', b: 'player', kind: 'feud', since: 1951, strength: 60, story: 'Your father killed Carmine Manno\'s cousin in 1951. Manno has never forgiven it.' };
