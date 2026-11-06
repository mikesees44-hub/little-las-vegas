import type { FamDef, SeedTie } from './familyWebData';

/**
 * THE CITIES, the data (familyWebCities.ts plays them): the Chicago Outfit,
 * New Orleans, Florida's families and the Havana men, the Colombian
 * connection. Same rules as familyWebData.ts: every family and every person
 * here is fictional; the cities are real backdrop only. Rosters are compact:
 * the leaders are named, the rest are counts (men, made, crews), and a named
 * man becomes a full character only when the boss deals with him (mintMan).
 */

export const CHICAGO_DEF: FamDef = {
  id: 'chicago', name: 'The Chicago Outfit', short: 'Chicago', group: 'chi', seat: 'Chicago (the Midway, Cicero, Rush Street)', boss: 'Tony Varrone', city: 'chicago', reach: 3,
  men: 300, made: 110, crews: 20, eth: 'Italian',
  rackets: ['everything west of Ohio', 'the racing wire', 'the desert skim', 'the union locals', 'Cicero\'s gambling joints', 'Rush Street nightclubs'],
  blurb: 'The Outfit runs the Midwest and counts the skim in the desert, and it does not share. It keeps a seat on the Commission in New York; Salvatore Pellegrini is its captain for the East, and the story in every union hall is that he can open the Teamsters\' pension fund for a friend. Nobody has ever proved it.',
  roster: [
    { name: 'Tony Varrone', role: 'boss', note: 'the Midway; never raises his voice' },
    { name: 'Dominic "Big Dom" Falcetta', role: 'underboss', note: 'the street crews and the collections' },
    { name: 'Michele "the Judge" Ruvolo', role: 'consigliere', note: 'the lawyers and the aldermen' },
    { name: 'Salvatore Pellegrini', role: 'capo', note: 'the Pellegrini house; the unions (and, they say, the pension money)' },
    { name: 'Marty "the Wire" Hoffmeyer', role: 'capo', note: 'the racing wire from the Ohio to the Rockies', eth: 'Jewish' },
    { name: 'Nick "Desert Nick" Ambrosetti', role: 'capo', note: 'the Outfit\'s man in Las Vegas: the count rooms' },
    { name: 'Frankie "Cicero" DiNapoli', role: 'capo', note: 'Cicero\'s gambling joints' },
    { name: 'Pietro "Pete Rush" Castellucci', role: 'capo', note: 'the Rush Street nightclubs' },
    { name: 'Walt Ostrowski', role: 'capo', note: 'the North Side wards and the juice loans', eth: 'Irish' },
    { name: 'Tommy "Taylor Street" Abbruzzese', role: 'soldier', note: 'a driver for the underboss' },
    { name: 'Eddie Sciortino', role: 'soldier', note: 'a collector in the Loop' },
  ],
};

/** The cities' families after Chicago (New Orleans, Florida, the Havana men, the Colombians). */
export const CITY_DEFS: FamDef[] = [];

/** The cities' ties on Memorial Day 1960 (added to the web at new game, and once to a save from before them). */
export const CITY_TIES: SeedTie[] = [
  { a: 'chicago', b: 'cleveland', kind: 'racket', since: 1955, strength: 55, story: 'Chicago and Cleveland point the same casinos at the same money. In every union hall they say the Teamsters\' pension fund lends to whatever the two of them build. Nobody has ever proved it.' },
  { a: 'chicago', b: 'marchetti', kind: 'truce', since: 1931, strength: 50, story: 'Chicago keeps a seat on the Commission in New York; Varrone and Marchetti vote together when it suits them both.' },
];
