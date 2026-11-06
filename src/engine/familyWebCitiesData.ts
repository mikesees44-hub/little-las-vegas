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
export const CITY_DEFS: FamDef[] = [
  {
    id: 'nola', name: 'The Delacroix Family', short: 'New Orleans', group: 'nola', seat: 'New Orleans (the French Quarter and Jefferson Parish)', boss: 'Henri Delacroix', city: 'neworleans', reach: 3,
    men: 90, made: 35, crews: 7, eth: 'Italian',
    rackets: ['the port', 'slot machines across the Gulf Coast', 'the racetracks and the layoff', 'Jefferson Parish casinos', 'the shrimp-boat docks'],
    blurb: 'The oldest family in the country: Sicilians on the levee since before the century turned. The port, the slot machines in every bar from Biloxi to Lake Charles, the tracks, the parish casinos the sheriff never finds. Henri Delacroix was born Enrico Della Croce and answers to no Commission; New York asks, it does not tell.',
    roster: [
      { name: 'Henri "the Frenchman" Delacroix', role: 'boss', note: 'born Enrico Della Croce; the oldest chair in the country' },
      { name: 'Achille Bonfiglio', role: 'underboss', note: 'the port and the stevedores' },
      { name: 'Ignazio "Father Iggy" Perrone', role: 'consigliere', note: 'remembers 1910' },
      { name: 'Julius "Slots" Cacioppo', role: 'capo', note: 'the slot machines from Biloxi to Lake Charles' },
      { name: 'Raymond Thibodeaux', role: 'capo', note: 'the Jefferson Parish casinos; a Cajun the old man trusts', eth: 'Irish' },
      { name: 'Sal "the Track" Gennusa', role: 'capo', note: 'the racetracks and the layoff bets' },
      { name: 'Beau Landry', role: 'capo', note: 'the shrimp-boat docks and the Gulf', eth: 'Irish' },
      { name: 'Nunzio Cefalù', role: 'soldier', note: 'a collector on Decatur Street' },
    ],
  },
];

/**
 * The cities' ties on Memorial Day 1960 (added to the web at new game, and
 * once to a save from before them). APPEND ONLY: a save remembers how many it
 * has (FamState.c2) and gets the rest.
 */
export const CITY_TIES: SeedTie[] = [
  { a: 'chicago', b: 'cleveland', kind: 'racket', since: 1955, strength: 55, story: 'Chicago and Cleveland point the same casinos at the same money. In every union hall they say the Teamsters\' pension fund lends to whatever the two of them build. Nobody has ever proved it.' },
  { a: 'chicago', b: 'marchetti', kind: 'truce', since: 1931, strength: 50, story: 'Chicago keeps a seat on the Commission in New York; Varrone and Marchetti vote together when it suits them both.' },
  { a: 'chicago', b: 'nola', kind: 'racket', since: 1946, strength: 50, story: 'Chicago\'s racing wire runs south through New Orleans: Delacroix pays for it and sells it on to every bookmaker on the Gulf.' },
  { a: 'nola', b: 'saladino', kind: 'friends', since: 1952, strength: 35, story: 'The Saladino people winter in New Orleans for the racing season, and Delacroix\'s tables treat them well.' },
];
