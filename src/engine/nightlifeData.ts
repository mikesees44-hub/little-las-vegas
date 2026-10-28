import type { Physique } from './looks';
import type { MaritalSt, NightBound, NightGoal, NightRole, PartnerKnows } from './nightlifeState';
import type { Ethnicity, Trait } from './types';

/**
 * The night's starting cast for the island (nightlife.ts builds them as
 * people of the world). Every one is a fictional adult; ages are on
 * Memorial Day 1960 and move with the calendar from there. The game keeps
 * making new adults as people retire, so the night never runs out.
 */

export interface CastSpec {
  f: string;
  l: string;
  nick?: string;
  eth: Ethnicity;
  age: number;
  role: NightRole;
  goal: NightGoal;
  dream?: 'record' | 'film' | 'adult';
  /** She has said herself she would consider adult pictures. */
  adultOk?: boolean;
  st: MaritalSt;
  kids?: number;
  /** Her husband or fella is away (where). */
  away?: string;
  knows?: PartnerKnows;
  mother?: 'ailing' | 'well';
  bounds?: NightBound[];
  /** Looks at her best, 0-100. */
  lk: number;
  ph?: Physique;
  st2?: string;
  traits?: Trait[];
  talent?: number;
  /** For madams: her house's name and front. */
  house?: string;
  front?: string;
  /** Who she works through: a madam's last name in this list. */
  via?: string;
  venue?: string;
}

export const VENUES = {
  lounge: 'the Riptide Lounge',
  burlesque: 'the Bijou Follies on Pacific',
  paree: 'Club Paree',
  supper: 'the Bolero Supper Club',
  hotel: 'the lounge of the Royal Palm',
  bar: 'the Anchor Bar on New Jersey Avenue',
  surf: 'the Surf Club',
  phone: 'a telephone answering service on Atlantic Avenue',
  street: 'Pacific Avenue after midnight',
  motor: 'the motor court on the Boulevard',
  corner: 'the corner of Rio Grande and New Jersey Avenue',
  hialeah: 'the Hialeah Bar',
} as const;

export const CAST: CastSpec[] = [
  // ---- Madams: each runs her own house -----------------------------------------------------------
  { f: 'Rita', l: 'Caruso', eth: 'Italian', age: 48, role: 'madam', goal: 'shop', st: 'widowed', kids: 2, lk: 70, st2: 'Businesslike', traits: ['Patient', 'Ambitious'], house: 'the Caruso house', front: 'Caruso Entertainment Agency, over the bank on Pacific', venue: VENUES.supper },
  { f: 'Marlene', l: 'Doyle', nick: 'Mickey', eth: 'Irish', age: 39, role: 'madam', goal: 'madam', st: 'divorced', kids: 1, lk: 62, st2: 'A provocative dresser', traits: ['Charming', 'Hot-headed'], house: 'Mickey Doyle\'s', front: 'rooms over the Anchor Bar', venue: VENUES.bar },
  { f: 'Vivian', l: 'Hart', eth: 'Irish', age: 44, role: 'madam', goal: 'home', st: 'single', lk: 76, st2: 'Glamorous', traits: ['Patient', 'Greedy'], house: 'the Hart agency', front: 'Hart Hostess Service, a suite at the Royal Palm', venue: VENUES.hotel },
  { f: 'Theresa', l: 'Bellini', eth: 'Italian', age: 36, role: 'madam', goal: 'club', st: 'married', kids: 3, knows: 'accepts', lk: 58, st2: 'Understated', traits: ['Honest', 'Loyal-to-a-fault'], house: 'Theresa\'s place', front: 'a boarding house on Lincoln Avenue', venue: VENUES.lounge },

  // ---- High-end escorts, the young list (18-25) -------------------------------------------------
  { f: 'Gina', l: 'Marchetti', eth: 'Italian', age: 19, role: 'escort', goal: 'act', dream: 'film', st: 'single', mother: 'ailing', lk: 88, ph: 'slender', st2: 'Glamorous', talent: 62, via: 'Hart' },
  { f: 'Donna Lee', l: 'Sutton', eth: 'Irish', age: 21, role: 'escort', goal: 'home', st: 'single', lk: 84, ph: 'statuesque', st2: 'Fashionable', bounds: ['no_married'], via: 'Hart' },
  { f: 'Francine', l: 'Russo', nick: 'Frankie', eth: 'Italian', age: 23, role: 'escort', goal: 'sing', dream: 'record', st: 'steady', knows: 'unaware', lk: 86, ph: 'curvy', st2: 'A provocative dresser', talent: 70, via: 'Caruso' },
  { f: 'Claire', l: 'Dumont', eth: 'Irish', age: 24, role: 'escort', goal: 'school', st: 'single', lk: 80, ph: 'petite', st2: 'Understated', bounds: ['careful', 'no_rough'], via: 'Hart' },
  { f: 'Bonnie', l: 'Kowalski', eth: 'Jewish', age: 20, role: 'escort', goal: 'marry', st: 'single', lk: 82, ph: 'curvy', st2: 'The girl next door', via: 'Caruso' },
  { f: 'Sylvia', l: 'Novak', eth: 'Jewish', age: 25, role: 'escort', goal: 'shop', st: 'divorced', lk: 85, ph: 'athletic', st2: 'Businesslike', bounds: ['careful'] },

  // ---- High-end escorts, the mature list (26+): established, steadier --------------------------
  { f: 'Evelyn', l: 'Price', eth: 'Irish', age: 32, role: 'escort', goal: 'shop', st: 'single', lk: 84, ph: 'statuesque', st2: 'Glamorous', traits: ['Patient'], bounds: ['careful', 'no_rough'] },
  { f: 'Carmen', l: 'Vega', eth: 'Italian', age: 29, role: 'escort', goal: 'madam', st: 'single', lk: 83, ph: 'curvy', st2: 'A provocative dresser', traits: ['Charming'], via: 'Caruso' },
  { f: 'Margaret', l: 'Halloran', nick: 'Peg', eth: 'Irish', age: 38, role: 'escort', goal: 'home', st: 'divorced', kids: 2, lk: 78, ph: 'fullfigured', st2: 'Businesslike', bounds: ['careful'], via: 'Hart' },
  { f: 'Lorraine', l: 'Weiss', eth: 'Jewish', age: 41, role: 'escort', goal: 'out', st: 'widowed', kids: 1, lk: 76, ph: 'slender', st2: 'Glamorous', bounds: ['no_film', 'careful'] },

  // ---- Call girls: the middle of the market --------------------------------------------------
  { f: 'Gloria', l: 'Romano', eth: 'Italian', age: 35, role: 'callgirl', goal: 'home', st: 'married', kids: 2, knows: 'suspects', mother: 'ailing', lk: 66, ph: 'curvy', st2: 'Businesslike', traits: ['Honest'], bounds: ['careful'] },
  { f: 'Diane', l: 'Mercer', eth: 'Irish', age: 27, role: 'callgirl', goal: 'shop', st: 'single', lk: 68, ph: 'petite', st2: 'Understated', via: 'Doyle' },
  { f: 'Patty', l: 'Flynn', eth: 'Irish', age: 24, role: 'callgirl', goal: 'marry', st: 'steady', knows: 'unaware', lk: 72, ph: 'slender', st2: 'The girl next door', via: 'Doyle' },
  { f: 'Nancy', l: 'DiNapoli', eth: 'Italian', age: 30, role: 'callgirl', goal: 'family', st: 'separated', kids: 1, lk: 64, ph: 'fullfigured', st2: 'Fashionable', via: 'Bellini' },
  { f: 'Judy', l: 'Abrams', eth: 'Jewish', age: 22, role: 'callgirl', goal: 'school', st: 'single', lk: 70, ph: 'athletic', st2: 'Understated', bounds: ['careful'], via: 'Bellini' },

  // ---- On the street -----------------------------------------------------------------------------
  { f: 'Rose', l: 'DeLuca', eth: 'Italian', age: 30, role: 'street', goal: 'home', st: 'single', lk: 58, ph: 'slender',st2: 'A provocative dresser', traits: ['Loyal-to-a-fault'], venue: VENUES.street },
  { f: 'Anita', l: 'Brooks', eth: 'Irish', age: 26, role: 'street', goal: 'shop', adultOk: true, dream: 'adult', st: 'single', lk: 62, ph: 'curvy', st2: 'A provocative dresser', venue: VENUES.corner },
  { f: 'Connie', l: 'Mazur', eth: 'Jewish', age: 34, role: 'street', goal: 'family', st: 'married', kids: 3, away: 'Rahway State Prison', knows: 'unaware', lk: 48, ph: 'fullfigured', st2: 'Understated', venue: VENUES.motor },
  { f: 'Lucille', l: 'Boyd', nick: 'Lucky', eth: 'Irish', age: 22, role: 'street', goal: 'out', st: 'single', lk: 60, ph: 'petite', st2: 'A provocative dresser', venue: VENUES.street },
  { f: 'Mae', l: 'Duffy', eth: 'Irish', age: 45, role: 'street', goal: 'out', st: 'widowed', kids: 2, lk: 40, ph: 'fullfigured', st2: 'Rumpled', venue: VENUES.motor },

  // ---- Dancers: burlesque, the clubs -------------------------------------------------------------
  { f: 'Lena', l: 'Moretti', eth: 'Italian', age: 23, role: 'dancer', goal: 'act', dream: 'film', st: 'single', lk: 80, ph: 'slender', st2: 'The girl next door', talent: 66, venue: VENUES.burlesque },
  { f: 'Jean', l: 'Foster', eth: 'Irish', age: 34, role: 'dancer', goal: 'club', st: 'divorced', kids: 1, lk: 70, ph: 'athletic', st2: 'Businesslike', talent: 58, venue: VENUES.lounge },
  { f: 'Dolores', l: 'Kaminski', nick: 'Tempest', eth: 'Jewish', age: 27, role: 'dancer', goal: 'home', adultOk: true, dream: 'adult', st: 'single', lk: 84, ph: 'curvy', st2: 'A provocative dresser', talent: 64, venue: VENUES.paree },
  { f: 'Kathleen', l: 'Malone', nick: 'Kitty', eth: 'Irish', age: 21, role: 'dancer', goal: 'sing', dream: 'record', st: 'single', lk: 78, ph: 'petite', st2: 'Fashionable', talent: 72, venue: VENUES.burlesque },
  { f: 'Bernadette', l: 'O\'Shea', nick: 'Bunny', eth: 'Irish', age: 25, role: 'dancer', goal: 'marry', st: 'steady', knows: 'knows', lk: 76, ph: 'curvy', st2: 'Glamorous', talent: 55, venue: VENUES.paree },
  { f: 'Sherry', l: 'Lamont', eth: 'Irish', age: 29, role: 'dancer', goal: 'shop', adultOk: true, st: 'married', kids: 1, knows: 'accepts', lk: 74, ph: 'statuesque', st2: 'Glamorous', talent: 60, venue: VENUES.lounge },

  // ---- Singers -----------------------------------------------------------------------------------
  { f: 'Ruby', l: 'Lane', eth: 'Irish', age: 28, role: 'singer', goal: 'sing', dream: 'record', st: 'divorced', kids: 1, lk: 78, ph: 'curvy', st2: 'Glamorous', talent: 80, traits: ['Charming'], venue: VENUES.lounge },
  { f: 'Doris', l: 'Fields', eth: 'Jewish', age: 41, role: 'singer', goal: 'sing', dream: 'record', st: 'married', knows: 'accepts', lk: 64, ph: 'fullfigured', st2: 'Glamorous', talent: 84, venue: VENUES.supper },

  // ---- Bar regulars --------------------------------------------------------------------------------
  { f: 'Betty', l: 'Quinn', eth: 'Irish', age: 37, role: 'barfly', goal: 'club', st: 'divorced', lk: 60, ph: 'curvy', st2: 'The girl next door', traits: ['Charming'], venue: VENUES.bar },
  { f: 'Irene', l: 'Callahan', eth: 'Irish', age: 44, role: 'barfly', goal: 'marry', st: 'widowed', kids: 2, lk: 52, ph: 'fullfigured', st2: 'Fashionable', traits: ['Drinker'], venue: VENUES.hialeah },
  { f: 'Dorothy', l: 'Pettinato', nick: 'Dot', eth: 'Italian', age: 52, role: 'barfly', goal: 'family', st: 'widowed', kids: 4, lk: 44, ph: 'fullfigured', st2: 'Rumpled', venue: VENUES.bar },
  { f: 'Velma', l: 'Hughes', eth: 'Irish', age: 31, role: 'barfly', goal: 'marry', st: 'separated', lk: 56, ph: 'slender', st2: 'A provocative dresser', venue: VENUES.surf },

  // ---- Women out at the clubs (not working: to meet, to date) -----------------------------------
  { f: 'Angela', l: 'Rossi', eth: 'Italian', age: 29, role: 'date', goal: 'shop', st: 'single', lk: 74, ph: 'curvy', st2: 'Fashionable', venue: VENUES.supper },
  { f: 'Carol', l: 'Whitman', eth: 'Irish', age: 33, role: 'date', goal: 'club', st: 'divorced', lk: 72, ph: 'slender', st2: 'Businesslike', venue: VENUES.hotel },
  { f: 'Joan', l: 'Kelly', eth: 'Irish', age: 26, role: 'date', goal: 'marry', st: 'single', lk: 66, ph: 'petite', st2: 'The girl next door', traits: ['Pious'], venue: VENUES.surf },
  { f: 'Teresa', l: 'Sorrentino', eth: 'Italian', age: 24, role: 'date', goal: 'marry', st: 'single', lk: 80, ph: 'curvy', st2: 'Glamorous', venue: VENUES.paree },
  { f: 'Marianne', l: 'Cole', eth: 'Irish', age: 31, role: 'date', goal: 'home', st: 'divorced', kids: 1, lk: 68, ph: 'athletic', st2: 'Understated', venue: VENUES.lounge },
  { f: 'Linda', l: 'Paolini', eth: 'Italian', age: 22, role: 'date', goal: 'act', dream: 'film', st: 'single', lk: 76, ph: 'slender', st2: 'Fashionable', talent: 60, venue: VENUES.surf },
];

/** Where newcomers come from (a line on her card). */
export const ARRIVALS = ['came down from Philadelphia', 'came over from Atlantic City', 'came up from Baltimore', 'came down from Newark', 'grew up in Rio Grande', 'came from Scranton after the mines closed'];

/** The businesses women open when they save enough. */
export const BUSINESSES = ['a beauty parlor on Pacific Avenue', 'a dress shop in Cape May', 'a luncheonette on the Boulevard', 'a motel on Ocean Drive', 'a dance school in Rio Grande', 'a florist on New Jersey Avenue'];

/** The record men and producers an introduction reaches (fictional). */
export const CONTACTS = {
  record: ['Sid Feldman at Seashore Records', 'a talent scout from Cameo-Parkway\'s rivals in Philadelphia', 'Lou Bracco, who books the Steel Pier acts', 'a songwriter from the Brill Building'],
  film: ['Harold Reiss, who casts pictures in New York', 'a screen-test man from a Hollywood studio\'s New York office', 'Mort Elkin, who makes beach pictures', 'a television casting director from Philadelphia'],
  adult: ['a stag-reel producer in New York, through a lawyer', 'Benny Kahn, who makes "art" pictures in Newark, through a lawyer', 'a producer of nudie pictures from Baltimore, through a lawyer'],
} as const;

export const APARTMENTS = ['an apartment on Atlantic Avenue', 'a second-floor flat on Spencer Avenue', 'a garden apartment in Rio Grande', 'a bungalow on Lake Road', 'an efficiency over a shop on Pacific'];

/** First names for husbands and fellas (made as people of the world). */
export const MEN_JOBS = ['a mechanic', 'a fisherman', 'a bartender', 'a carpenter', 'a cab driver', 'a boardwalk barker', 'a longshoreman in Camden', 'a bus driver'];
