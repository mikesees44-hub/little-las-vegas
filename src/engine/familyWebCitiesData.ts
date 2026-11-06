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
  {
    id: 'tampa', name: 'The Ybor City Family', short: 'Tampa', group: 'fla', seat: 'Tampa (Ybor City, the cigar factories)', boss: 'Enzo Ricci', city: 'tampa', reach: 3,
    men: 70, made: 25, crews: 6, eth: 'Italian',
    rackets: ['bolita in the cigar factories', 'what came home from Havana', 'Gulf Coast bookmaking', 'the Tampa docks'],
    blurb: 'Florida\'s own family, Sicilian, Cuban and Spanish together in the cigar town. Its people ran casino floors in Havana until New Year\'s Day 1959; Castro closed the casinos and took the hotels, and Enzo Ricci\'s cousins came home with the clothes they stood in. The bolita still pays.',
    roster: [
      { name: 'Enzo Ricci', role: 'boss', note: 'lost a casino in Havana; kept the bolita' },
      { name: 'Paolo "Paulie Bolita" Scaglione', role: 'underboss', note: 'the bolita in every cigar factory' },
      { name: 'Arturo Vinci', role: 'consigliere', note: 'a lawyer who flew to Havana every weekend until 1959' },
      { name: 'Manny Ferreiro', role: 'capo', note: 'ran a Havana casino floor; now runs a card room and holds a grudge' },
      { name: 'Gaspar "Gus" Alonso', role: 'capo', note: 'the Tampa docks' },
      { name: 'Joey Trapani', role: 'soldier', note: 'drives to Miami twice a week' },
    ],
  },
  {
    id: 'biscayne', name: 'The Biscayne Group', short: 'Miami', group: 'fla', seat: 'Miami Beach (the hotels on Collins Avenue)', boss: 'Morris Stahl', city: 'miami', reach: 3,
    men: 45, made: 0, crews: 4, eth: 'Jewish',
    rackets: ['Miami Beach hotel rooms', 'the winter bookmaking', 'exile money looking for a bank', 'the winter card games'],
    blurb: 'New York money in Miami Beach hotels. Every family in the East winters here: the bosses take the sun, sit down in the cabanas and settle what they could not settle in the snow. Morris Stahl keeps the rooms, the books and the peace.',
    roster: [
      { name: 'Morris Stahl', role: 'boss', note: 'the hotels; knows who is in which cabana' },
      { name: 'Bernie "the Cabana" Gutfreund', role: 'consigliere', note: 'the winter sit-downs' },
      { name: 'Lou Pincus', role: 'capo', note: 'the winter bookmaking' },
      { name: 'Al Coppola', role: 'capo', note: 'New York\'s man on the Beach', eth: 'Italian' },
      { name: 'Herbie Strauss', role: 'soldier', note: 'the bell captains and the doormen' },
    ],
  },
  {
    id: 'havana', name: 'The Havana Men', short: 'Havana men', group: 'fla', seat: 'Miami hotel rooms (Havana until 1959)', boss: 'Julius Marks', city: 'havana', reach: 3,
    men: 50, made: 0, crews: 4, eth: 'Jewish',
    rackets: ['what they carried out of Havana', 'the exile money', 'a casino in exile (a rumor)', 'guns for Cuba (they say)'],
    blurb: 'The casino men Castro threw out in 1959, and the Cuban exiles who came with them: men who lost fortunes in a night, living in Miami hotel rooms, looking for a new place to deal cards and a way back. In the hotel bars they say the government\'s men have asked the casino men for help with Castro. Nobody says it twice, and nobody has proved it.',
    roster: [
      { name: 'Julius "Havana Julie" Marks', role: 'boss', note: 'lost three casino floors in one night in 1959' },
      { name: 'Raúl Quintana', role: 'underboss', note: 'ran a Havana casino\'s cage; knows where the money went' },
      { name: 'Ernesto Valdés-Rojo', role: 'capo', note: 'an exile captain raising money for the cause' },
      { name: 'Lenny Fink', role: 'capo', note: 'the accounts nobody could seize' },
      { name: 'Tomás Iglesias', role: 'soldier', note: 'a croupier without a table' },
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
  { a: 'nola', b: 'tampa', kind: 'marriage', since: 1938, strength: 55, story: 'Henri Delacroix\'s niece married Enzo Ricci in 1938: New Orleans and Tampa are one family on the Gulf.' },
  { a: 'nola', b: 'havana', kind: 'partners', since: 1952, strength: 45, story: 'New Orleans\'s slot machines stood in the Havana casinos until 1959; Castro took the machines with the hotels, and the partners are still counting what they lost.' },
  { a: 'tampa', b: 'havana', kind: 'blood', since: 1920, strength: 60, story: 'Enzo Ricci\'s cousins ran the floor of a Havana casino; since 1959 they sleep on his couch.' },
  { a: 'marchetti', b: 'biscayne', kind: 'sponsor', since: 1948, strength: 55, story: 'New York money built Morris Stahl\'s Miami Beach hotels, and every family in the East winters in them.' },
  { a: 'biscayne', b: 'feldstein', kind: 'friends', since: 1950, strength: 40, story: 'Ira Feldstein and Morris Stahl buy hotels with the same New York money and play gin together every February.' },
  { a: 'biscayne', b: 'tampa', kind: 'broken', since: 1959, strength: 40, story: 'Who books Miami\'s winter: Tampa says the Gulf\'s bookmakers reach the Beach, and Stahl says they do not. The old arrangement broke in 1959.' },
  { a: 'biscayne', b: 'havana', kind: 'racket', since: 1959, strength: 45, story: 'Exile money comes off the boats and into the Biscayne hotels\' safes; Stahl takes a piece for keeping it.' },
  { a: 'havana', b: 'chicago', kind: 'debt', since: 1959, by: 'a', strength: 40, story: 'Chicago held points in the Havana casinos the Havana men ran; Castro took them, and Chicago says the Havana men owe it a casino.' },
  { a: 'saladino', b: 'tampa', kind: 'friends', since: 1955, strength: 35, story: 'The Saladino people winter in Tampa and play the bolita for fun.' },
];
