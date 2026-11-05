import type { Ethnicity } from './types';

/** Period-appropriate (born ~1890-1960) first names, surnames and nicknames. */

export const MALE_FIRST: Record<Ethnicity, string[]> = {
  Italian: [
    'Anthony', 'Salvatore', 'Vincent', 'Joseph', 'Frank', 'Carmine', 'Dominic', 'Nicholas', 'Michael', 'Angelo',
    'Rocco', 'Pasquale', 'Carlo', 'Gaetano', 'Philip', 'Louis', 'Ralph', 'Paul', 'Peter', 'Thomas',
    'Albert', 'Emilio', 'Gennaro', 'Giuseppe', 'Leonard', 'Mario', 'Nunzio', 'Raymond', 'Santo', 'Victor',
    'Alphonse', 'Aniello', 'Benedetto', 'Charles', 'Ettore', 'Felix', 'Guido', 'John', 'Lorenzo', 'Matteo',
    'Ottavio', 'Patsy', 'Richard', 'Sabato', 'Silvio', 'Tullio', 'Umberto', 'Arthur', 'Eugene',
  ],
  Irish: [
    'Patrick', 'Thomas', 'James', 'John', 'Francis', 'Michael', 'Edward', 'William', 'Joseph', 'Daniel',
    'Kevin', 'Brendan', 'Dennis', 'Gerald', 'Hugh', 'Martin', 'Owen', 'Raymond', 'Timothy', 'Cornelius',
    'Desmond', 'Eamon', 'Fergus', 'Lawrence', 'Malachy', 'Neil', 'Robert', 'Walter', 'Charles', 'George',
  ],
  Jewish: [
    'Irving', 'Morris', 'Samuel', 'Abraham', 'Isadore', 'Louis', 'Meyer', 'Benjamin', 'Harold', 'Herbert',
    'Jacob', 'Nathan', 'Solomon', 'Sidney', 'Max', 'Milton', 'Seymour', 'Bernard', 'Saul', 'Julius',
    'Emanuel', 'Leonard', 'Murray', 'Norman', 'Reuben', 'Sheldon', 'Stanley', 'Arnold', 'David',
  ],
  Black: [
    'Calvin', 'Clarence', 'Otis', 'Willie', 'Leroy', 'Curtis', 'Earl', 'Harold', 'Lester', 'Roosevelt',
    'Marvin', 'Booker', 'Cleveland', 'Ellis', 'Floyd', 'Jesse', 'Lionel', 'Melvin', 'Nathaniel', 'Odell',
    'Percy', 'Reginald', 'Sylvester', 'Theodore', 'Walter', 'Alvin', 'Cornelius', 'Herman', 'Julius', 'Rufus',
  ],
};

export const FEMALE_FIRST: Record<Ethnicity, string[]> = {
  Italian: [
    'Maria', 'Rosa', 'Concetta', 'Angela', 'Carmela', 'Theresa', 'Josephine', 'Lucia', 'Antoinette', 'Philomena',
    'Anna', 'Assunta', 'Carmella', 'Domenica', 'Filomena', 'Grace', 'Immaculata', 'Loretta', 'Marie', 'Nancy',
    'Rita', 'Rosemarie', 'Teresa', 'Vincenza', 'Yolanda', 'Connie', 'Dolores', 'Frances', 'Gloria', 'Lena',
  ],
  Irish: [
    'Mary', 'Margaret', 'Catherine', 'Bridget', 'Eileen', 'Kathleen', 'Nora', 'Maureen', 'Anne', 'Helen',
    'Agnes', 'Delia', 'Ellen', 'Honora', 'Julia', 'Moira', 'Patricia', 'Rose', 'Sheila', 'Theresa',
  ],
  Jewish: [
    'Esther', 'Ruth', 'Sarah', 'Rose', 'Miriam', 'Rachel', 'Sylvia', 'Pearl', 'Frances', 'Gertrude',
    'Hannah', 'Ida', 'Lillian', 'Minnie', 'Naomi', 'Shirley', 'Sophie', 'Thelma', 'Bessie', 'Dorothy',
  ],
  Black: [
    'Lorraine', 'Bettye', 'Gwendolyn', 'Hattie', 'Mattie', 'Odessa', 'Pearl', 'Ruby', 'Della', 'Ernestine',
    'Geraldine', 'Inez', 'Juanita', 'Loretta', 'Mavis', 'Nettie', 'Ola Mae', 'Rosetta', 'Thelma', 'Vernice',
  ],
};

export const SURNAMES: Record<Ethnicity, string[]> = {
  Italian: [
    'Brunetti', 'Esposito', 'Russo', 'Romano', 'Ricci', 'Marino', 'Greco', 'Bianchi', 'DeLuca', 'Costa',
    'Gallo', 'Conti', 'Mancini', 'Lombardo', 'Barbieri', 'Fontana', 'Caruso', 'Ferraro', 'Rizzo', 'Morelli',
    'Amato', 'Bellini', 'Cappelli', 'D\'Angelo', 'DiNapoli', 'Falcone', 'Giordano', 'Iacono', 'LaRosa', 'Lupo',
    'Marchetti', 'Napolitano', 'Orlando', 'Palermo', 'Pellegrino', 'Rinaldi', 'Sabatini', 'Santoro', 'Testa', 'Vitale',
    'Abruzzo', 'Calabrese', 'Cusumano', 'DelVecchio', 'Fusco', 'Guarino', 'Mastrangelo', 'Pagano', 'Scarpa', 'Tedesco',
    'Avellino', 'Buscemi', 'Castellano', 'Dragonetti', 'Infantino', 'Lo Bianco', 'Pirone', 'Scalia', 'Troisi', 'Zito',
  ],
  Irish: [
    'Murphy', 'Kelly', 'O\'Brien', 'Sullivan', 'Walsh', 'McCarthy', 'Byrne', 'Ryan', 'O\'Connor', 'Doyle',
    'Gallagher', 'Kennedy', 'Lynch', 'Quinn', 'Dolan', 'Brennan', 'Fitzgerald', 'Hogan', 'Keane', 'Mahoney',
    'Callahan', 'Devlin', 'Flanagan', 'Higgins', 'Malone', 'Nolan', 'Regan', 'Shea', 'Tierney', 'Whelan',
  ],
  Jewish: [
    'Cohen', 'Levy', 'Goldberg', 'Shapiro', 'Rosen', 'Katz', 'Friedman', 'Weiss', 'Kaplan', 'Stein',
    'Bernstein', 'Greenbaum', 'Horowitz', 'Lieberman', 'Mandel', 'Nussbaum', 'Perlman', 'Rubin', 'Schwartz', 'Silver',
    'Adler', 'Blum', 'Feld', 'Gold', 'Halpern', 'Jacobs', 'Kessler', 'Lerner', 'Mintz', 'Pincus',
  ],
  Black: [
    'Jackson', 'Johnson', 'Freeman', 'Washington', 'Carter', 'Brooks', 'Hill', 'Gaines', 'Reed', 'Mitchell',
    'Coleman', 'Harris', 'Hayes', 'Simms', 'Lassiter', 'Dunbar', 'Wingate', 'Satterfield', 'Holloway', 'Tate',
    'Pettiford', 'Greer', 'Bynum', 'Dorsey', 'Whitfield', 'McNair', 'Overton', 'Speight', 'Toliver', 'Mabry',
  ],
};

export const NICKNAMES: string[] = [
  'The Mule', 'Slim', 'Fat Patsy', 'Little Sal', 'The Professor', 'Cookie', 'Bobo', 'Sunny Jim', 'Butch', 'Southpaw',
  'The Hat', 'Big Ears', 'Specs', 'The Shoe', 'Blackie', 'Red', 'Whitey', 'Kid Gloves', 'Patsy Pockets', 'The Barber',
  'Knuckles', 'The Undertaker', 'Tommy Guns', 'Spats', 'Cigars', 'The Saint', 'Elbows', 'Bootsie', 'The Ferret', 'Moose',
  'Sally Boy', 'Jimmy Brass', 'The Fox', 'Mousey', 'Pretty Boy', 'Dutch', 'The Ox', 'Stitches', 'Tippy', 'Chubby',
  'The Greek', 'Shorty', 'Frankie Ice', 'Bats', 'Buckles', 'The Count', 'Gimpy', 'Hooks', 'Peanuts', 'Ritzy',
  'The Tailor', 'Trigger', 'Cappy', 'The Deacon', 'Doc', 'Fingers', 'Slick', 'Mumbles', 'The Clam', 'Two Times',
  'Saltwater', 'Boardwalk', 'The Pier', 'Taffy', 'Sandbar', 'Tides', 'Gull', 'The Ferris', 'Neon', 'Jukebox',
];

export const BUSINESS_NAMES: Record<string, string[]> = {
  club: ['The Riptide Lounge', 'Club Bolero', 'The Starlight Room', 'The Velvet Anchor', 'The Hurricane Room', 'Club Sorrento', 'The Moonglow'],
  numbers: ['Pacific Ave numbers bank', 'Cigar-store policy wheel', 'Back-room numbers drop'],
  bookmaking: ['Wire room over the barbershop', 'Racing book at the newsstand', 'Telephone book on Rio Grande'],
  arcade: ['Skee-Ball parlor', 'Pinball arcade', 'Penny arcade on the pier'],
  loansharking: ['Shylock book', 'Payday street loans'],
  fencing: ['Bay-side fence', 'Pawn counter on Oak Ave'],
  boarding: ['Motel on Ocean Ave', 'Rooming house on Spencer'],
  restaurant: ['Mamma\'s Kitchen', 'The Crab Shack', 'Sorrento Grill', 'Shore Diner'],
};
