/**
 * Name pools, nickname pools, archetypes and a seeded generator that makes new
 * WorldPeople for any institution, so the world keeps filling in after the
 * hand-written rosters run out (new rookies every June, new singers every
 * season, a new assistant prosecutor when one is promoted).
 *
 * Deterministic: the same seed string always produces the same person.
 */
import { INSTITUTIONS, LADDERS } from './institutions';
import type {
  AttrKey, Domain, GameRank, InstitutionId, LadderId, MobIntersect, Origin, PoliceBranch, PoliceFaction, Sex, ShowbizCategory,
  StreetOrigin, StreetSpecialty, Trajectory, WorldAttributes, WorldPerson, WorldSecret, WorldTrait, WorldVice, Circuit,
} from './schema';
import { ATTR_KEYS, OPPOSED_TRAITS, ORIGIN_TO_GAME } from './schema';

/* ------------------------------------------------------------------ */
/* Seeded RNG                                                          */
/* ------------------------------------------------------------------ */

export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface Rng {
  next(): number;
  int(lo: number, hi: number): number;
  gauss(): number;
  chance(p: number): boolean;
  pick<T>(xs: readonly T[]): T;
  weighted<T extends string>(w: Partial<Record<T, number>>): T;
}

export function makeRng(seed: string): Rng {
  let a = hashString(seed) || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    gauss: () => {
      const u = Math.max(1e-9, next());
      const v = next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    chance: (p) => next() < p,
    pick: (xs) => xs[Math.floor(next() * xs.length)],
    weighted: <T extends string>(w: Partial<Record<T, number>>): T => {
      const entries = Object.entries(w) as [T, number][];
      const total = entries.reduce((s, [, v]) => s + v, 0);
      let x = next() * total;
      for (const [k, v] of entries) {
        x -= v;
        if (x <= 0) return k;
      }
      return entries[entries.length - 1][0];
    },
  };
  return rng;
}

export const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

/* ------------------------------------------------------------------ */
/* Name pools by origin, sex and era                                   */
/* ------------------------------------------------------------------ */

export type Era = 'old' | 'mid' | 'young';
/** old: born before 1910 · mid: 1910-1929 · young: 1930 and after. */
export function eraOf(birthYear: number): Era {
  return birthYear < 1910 ? 'old' : birthYear < 1930 ? 'mid' : 'young';
}

type Pool = Record<Era, string[]>;

export const FIRST_NAMES: Record<Origin, Record<Sex, Pool>> = {
  Italian: {
    M: {
      old: ['Angelo', 'Salvatore', 'Gaetano', 'Pasquale', 'Giuseppe', 'Rocco', 'Nunzio', 'Carmine', 'Domenico', 'Raffaele', 'Sabato', 'Umberto', 'Luigi', 'Ottavio'],
      mid: ['Anthony', 'Joseph', 'Frank', 'Dominic', 'Vincent', 'Louis', 'Ralph', 'Philip', 'Albert', 'Nicholas', 'Michael', 'Peter', 'Carl', 'Leonard', 'Victor'],
      young: ['Anthony', 'Joseph', 'Frank', 'Richard', 'Robert', 'Ronald', 'Dennis', 'Vincent', 'Nicholas', 'Paul', 'Thomas', 'Gerald', 'Daniel', 'Mark', 'Steven', 'Ralph'],
    },
    F: {
      old: ['Maria', 'Rosa', 'Concetta', 'Assunta', 'Filomena', 'Carmela', 'Vincenza', 'Giovanna', 'Lucia', 'Domenica'],
      mid: ['Josephine', 'Rose', 'Theresa', 'Angela', 'Mary', 'Anna', 'Lena', 'Frances', 'Antoinette', 'Grace', 'Dolores', 'Gloria'],
      young: ['Linda', 'Donna', 'Patricia', 'Rosemarie', 'Diane', 'Maryann', 'Joanne', 'Carol', 'Annette', 'Marie', 'Toni', 'Denise', 'Lorraine'],
    },
  },
  Irish: {
    M: {
      old: ['Patrick', 'Michael', 'Cornelius', 'Timothy', 'Daniel', 'Hugh', 'Bernard', 'Owen', 'Thomas', 'Malachy', 'Dennis', 'Jeremiah'],
      mid: ['John', 'James', 'Francis', 'Edward', 'William', 'Joseph', 'Thomas', 'Robert', 'Raymond', 'Gerald', 'Walter', 'Charles', 'Martin'],
      young: ['Kevin', 'Brian', 'Michael', 'Dennis', 'Thomas', 'John', 'Patrick', 'Terrence', 'Brendan', 'Sean', 'Kenneth', 'Daniel', 'Joseph'],
    },
    F: {
      old: ['Bridget', 'Mary', 'Margaret', 'Honora', 'Delia', 'Ellen', 'Catherine', 'Johanna', 'Agnes', 'Nora'],
      mid: ['Mary', 'Margaret', 'Catherine', 'Helen', 'Anne', 'Eileen', 'Rita', 'Dorothy', 'Kathleen', 'Theresa', 'Frances'],
      young: ['Maureen', 'Kathleen', 'Patricia', 'Eileen', 'Peggy', 'Sheila', 'Colleen', 'Noreen', 'Kathy', 'Mary Pat', 'Bernadette'],
    },
  },
  Jewish: {
    M: {
      old: ['Abraham', 'Isadore', 'Morris', 'Hyman', 'Jacob', 'Samuel', 'Max', 'Meyer', 'Solomon', 'Louis', 'Nathan', 'Reuben'],
      mid: ['Irving', 'Harold', 'Sidney', 'Bernard', 'Milton', 'Seymour', 'Herbert', 'Morton', 'Murray', 'Stanley', 'Arnold', 'Leonard'],
      young: ['Alan', 'Richard', 'Michael', 'Steven', 'Barry', 'Howard', 'Gary', 'Jeffrey', 'Mark', 'Neil', 'Joel', 'Kenneth', 'David'],
    },
    F: {
      old: ['Sarah', 'Esther', 'Rose', 'Ida', 'Fannie', 'Minnie', 'Bessie', 'Rebecca', 'Gussie', 'Hannah'],
      mid: ['Ruth', 'Sylvia', 'Miriam', 'Shirley', 'Lillian', 'Evelyn', 'Gertrude', 'Thelma', 'Florence', 'Pearl', 'Muriel'],
      young: ['Judith', 'Barbara', 'Susan', 'Ellen', 'Roberta', 'Arlene', 'Marcia', 'Rhoda', 'Sheila', 'Joan', 'Elaine'],
    },
  },
  Polish: {
    M: {
      old: ['Stanislaus', 'Casimir', 'Wladyslaw', 'Jozef', 'Walter', 'Anthony', 'Frank', 'Stephen', 'Ignatius', 'Michael'],
      mid: ['Stanley', 'Walter', 'Edward', 'Chester', 'Joseph', 'Henry', 'Edmund', 'Theodore', 'Raymond', 'Leon', 'Bernard'],
      young: ['Richard', 'Robert', 'Thomas', 'Edward', 'Gerald', 'Ronald', 'Stephen', 'Mark', 'Dennis', 'Gary', 'Kenneth'],
    },
    F: {
      old: ['Stella', 'Wanda', 'Josephine', 'Anna', 'Sophie', 'Helen', 'Mary', 'Agnes', 'Jadwiga', 'Frances'],
      mid: ['Helen', 'Dorothy', 'Stella', 'Irene', 'Genevieve', 'Lottie', 'Jean', 'Bernice', 'Evelyn', 'Theresa'],
      young: ['Barbara', 'Carol', 'Patricia', 'Janice', 'Diane', 'Christine', 'Marlene', 'Elaine', 'Joyce', 'Kathy'],
    },
  },
  Black: {
    M: {
      old: ['Clarence', 'Willie', 'Henry', 'Ernest', 'Lucius', 'Booker', 'Elijah', 'Moses', 'Isaiah', 'Samuel', 'Cornelius', 'Wendell'],
      mid: ['James', 'Robert', 'Charles', 'Leroy', 'Calvin', 'Earl', 'Walter', 'Herbert', 'Marcus', 'Eugene', 'Roosevelt', 'Harold', 'Lawrence'],
      young: ['Ronald', 'Larry', 'Gregory', 'Kenneth', 'Michael', 'Curtis', 'Reginald', 'Darnell', 'Alvin', 'Jerome', 'Melvin', 'Otis', 'Vernon'],
    },
    F: {
      old: ['Hattie', 'Mattie', 'Lula', 'Cora', 'Pearl', 'Viola', 'Ella', 'Minnie', 'Essie', 'Daisy'],
      mid: ['Dorothy', 'Mildred', 'Geraldine', 'Lorraine', 'Ernestine', 'Bernice', 'Juanita', 'Louise', 'Gladys', 'Inez', 'Thelma'],
      young: ['Gloria', 'Brenda', 'Shirley', 'Delores', 'Yvonne', 'Bettye', 'Carolyn', 'Gwendolyn', 'Jacqueline', 'Wanda', 'Beverly'],
    },
  },
  WASP: {
    M: {
      old: ['Arthur', 'Edgar', 'Walter', 'Harold', 'Chester', 'Lyman', 'Howard', 'Clarence', 'Elmer', 'Horace', 'Calvin', 'Wendell'],
      mid: ['George', 'Robert', 'William', 'Richard', 'Donald', 'Charles', 'Kenneth', 'Warren', 'Gordon', 'Russell', 'Lloyd', 'Douglas'],
      young: ['David', 'Bruce', 'Craig', 'Scott', 'Jeffrey', 'Douglas', 'Peter', 'Andrew', 'Bradley', 'Todd', 'Gregory', 'Philip'],
    },
    F: {
      old: ['Eleanor', 'Edith', 'Florence', 'Mildred', 'Ethel', 'Gladys', 'Mabel', 'Bertha', 'Harriet', 'Clara'],
      mid: ['Marjorie', 'Barbara', 'Virginia', 'Doris', 'Jean', 'Betty', 'Shirley', 'Lois', 'Phyllis', 'Elizabeth', 'Nancy'],
      young: ['Susan', 'Nancy', 'Karen', 'Sandra', 'Judith', 'Carol', 'Caroline', 'Pamela', 'Deborah', 'Wendy', 'Cynthia'],
    },
  },
  Greek: {
    M: {
      old: ['Constantine', 'Demetrios', 'Spiros', 'Panagiotis', 'Athanasios', 'Christos', 'Vasilios', 'Nikolaos'],
      mid: ['Gus', 'George', 'Peter', 'Nick', 'James', 'Steve', 'Chris', 'Louis', 'Harry', 'Tom'],
      young: ['George', 'Peter', 'Nick', 'John', 'Gus', 'Dean', 'Chris', 'Steve', 'Theo', 'Alex'],
    },
    F: {
      old: ['Despina', 'Eleni', 'Kalliope', 'Vasiliki', 'Panagiota', 'Sophia', 'Anastasia', 'Katina'],
      mid: ['Helen', 'Mary', 'Georgia', 'Irene', 'Christine', 'Angela', 'Pauline', 'Bessie'],
      young: ['Georgia', 'Elaine', 'Maria', 'Christina', 'Toula', 'Helen', 'Athena', 'Diana'],
    },
  },
  PuertoRican: {
    M: {
      old: ['Juan', 'José', 'Ramón', 'Pedro', 'Julio', 'Luis', 'Ángel', 'Rafael'],
      mid: ['José', 'Luis', 'Carlos', 'Miguel', 'Héctor', 'Rafael', 'Roberto', 'Víctor', 'Ángel', 'Félix'],
      young: ['Carlos', 'Luis', 'Héctor', 'Edwin', 'Ramón', 'Ricardo', 'Wilfredo', 'Manny', 'Tito', 'Eddie'],
    },
    F: {
      old: ['Carmen', 'María', 'Ana', 'Rosa', 'Juana', 'Isabel', 'Luz', 'Dolores'],
      mid: ['Carmen', 'Gloria', 'Ana', 'Lydia', 'Iris', 'Nilda', 'Elba', 'Norma', 'Ramona'],
      young: ['Gloria', 'Iris', 'Millie', 'Nydia', 'Maritza', 'Sonia', 'Evelyn', 'Wanda', 'Migdalia'],
    },
  },
  German: {
    M: {
      old: ['Herman', 'Otto', 'Wilhelm', 'Karl', 'Frederick', 'August', 'Gustav', 'Henry', 'Ernst', 'Conrad'],
      mid: ['Carl', 'Fred', 'Henry', 'Walter', 'Robert', 'William', 'Kurt', 'Paul', 'Herbert', 'Arthur'],
      young: ['Gary', 'Richard', 'Karl', 'Eric', 'Dennis', 'Larry', 'Wayne', 'Dale', 'Glenn', 'Roger'],
    },
    F: {
      old: ['Elsa', 'Frieda', 'Gertrude', 'Hilda', 'Louise', 'Wilhelmina', 'Augusta', 'Clara', 'Emma'],
      mid: ['Dorothy', 'Ruth', 'Marian', 'Gertrude', 'Erna', 'Louise', 'Irma', 'Hazel', 'Edna'],
      young: ['Karen', 'Linda', 'Gretchen', 'Heidi', 'Ingrid', 'Janet', 'Sharon', 'Kathy', 'Diane'],
    },
  },
};

/**
 * Surnames. Deliberately excludes the engine's named houses (Manno, Feldstein,
 * Kessler, Moretti, Carbone, Nardella, Keane, Donnelly, Dougherty, Pruitt,
 * Albanese, Weiss, Sees) and any Godfather-derived names.
 */
export const SURNAMES: Record<Origin, string[]> = {
  Italian: ['Amoroso', 'Bastone', 'Ciccone', 'D\'Amico', 'DeFelice', 'DiStefano', 'Fiorentino', 'Gentile', 'Iannucci', 'LaSpada', 'Lombardi', 'Mastrangelo', 'Palumbo', 'Pescatore', 'Quaranta', 'Ricciardi', 'Sacco', 'Scarpelli', 'Valenti', 'Zarrella', 'Buonocore', 'Cerrone', 'DiMarco', 'Fanelli', 'Iacovelli', 'Mazzola', 'Petrillo', 'Spadaro', 'Tomasello', 'Vespucci'],
  Irish: ['Boyle', 'Brennan', 'Cassidy', 'Conway', 'Costello', 'Cullen', 'Dempsey', 'Duffy', 'Fahey', 'Finnegan', 'Garrity', 'Hanlon', 'Kearney', 'Lafferty', 'McBride', 'McGovern', 'McKenna', 'Moran', 'Mulligan', 'O\'Rourke', 'Phelan', 'Rafferty', 'Scanlon', 'Sheehan', 'Tobin', 'Ward', 'Coyle', 'Gilhooley', 'Kinsella', 'Roche'],
  Jewish: ['Abrams', 'Baron', 'Berman', 'Blumenthal', 'Danziger', 'Eisen', 'Fishman', 'Ginsberg', 'Gross', 'Hirsch', 'Kramer', 'Lefkowitz', 'Margolis', 'Novick', 'Pearlstein', 'Resnick', 'Rothman', 'Sachs', 'Siegel', 'Tannenbaum', 'Wexler', 'Zuckerman', 'Brodsky', 'Felder', 'Glickman', 'Levine', 'Mendel', 'Shulman'],
  Polish: ['Kowalski', 'Nowak', 'Wisniewski', 'Zielinski', 'Lewandowski', 'Dabrowski', 'Kaminski', 'Jankowski', 'Wojcik', 'Mazur', 'Krawczyk', 'Pawlak', 'Sobczak', 'Grabowski', 'Michalski', 'Zawacki', 'Kozlowski', 'Wrobel'],
  Black: ['Washington', 'Jefferson', 'Coleman', 'Hayes', 'Bryant', 'Mosley', 'Tillman', 'Gaines', 'Whitfield', 'Pettiford', 'Spruill', 'Lattimore', 'Gholson', 'Mayfield', 'Pinckney', 'Truitt', 'Robbins', 'Tolliver', 'Merritt', 'Bonner', 'Alston', 'Fauntleroy', 'Hairston', 'Spence'],
  WASP: ['Ashby', 'Barlow', 'Cartwright', 'Chamberlain', 'Ellsworth', 'Foster', 'Hale', 'Hollister', 'Lockwood', 'Merriweather', 'Prescott', 'Radcliffe', 'Stockton', 'Thorne', 'Underwood', 'Van Horn', 'Wainwright', 'Hand', 'Ludlam', 'Schellenger', 'Townsend', 'Corson', 'Hughes', 'Learning'],
  Greek: ['Andreadis', 'Christopoulos', 'Dimas', 'Georgiou', 'Kallas', 'Karras', 'Mavros', 'Nikolaidis', 'Pappas', 'Stavros', 'Theodorou', 'Vlahos', 'Zervas', 'Galanis', 'Kontos'],
  PuertoRican: ['Rivera', 'Rodríguez', 'Colón', 'Santiago', 'Ortiz', 'Vázquez', 'Medina', 'Figueroa', 'Quiñones', 'Rosario', 'Torres', 'Cruz', 'Negrón', 'Pagán', 'Báez'],
  German: ['Bauer', 'Becker', 'Brandt', 'Eberhardt', 'Fischer', 'Hartmann', 'Kraus', 'Lehmann', 'Meyer', 'Neumann', 'Richter', 'Schaefer', 'Schmidt', 'Vogel', 'Wagner', 'Zimmerman', 'Hoffmann', 'Kuehn'],
};

/* ------------------------------------------------------------------ */
/* Nicknames by profession                                             */
/* ------------------------------------------------------------------ */

export type NickProfession = 'politician' | 'cop' | 'fire' | 'lawyer' | 'judge' | 'tough' | 'woman-in-the-life' | 'entertainer' | 'civilian';

export const NICKNAMES: Record<NickProfession, string[]> = {
  politician: ['The Senator', 'Handshake', 'Smiling Jack', 'The Deacon', 'Boss', 'The Undertaker', 'Silk Hat', 'Gravy', 'Ballot Box', 'The Banker', 'Two-Term', 'The Professor', 'Honest', 'Dollar', 'Snowball'],
  cop: ['The Sarge', 'Big Mike', 'Nightstick', 'Hawk', 'Bulldog', 'The Collector', 'Brass', 'Flatfoot', 'Iron Mike', 'Choirboy', 'Envelope', 'Cuffs', 'Sunshine', 'The Monk', 'Radar'],
  fire: ['Smokey', 'Ladder', 'Hose', 'Cinders', 'Torch', 'Ashcan', 'Chief', 'Sparky', 'Hydrant', 'Matchbook'],
  lawyer: ['The Mouthpiece', 'Counselor', 'Silver Tongue', 'The Fixer', 'Habeas', 'Loophole', 'The Professor', 'Writs', 'Hung Jury', 'Continuance'],
  judge: ['Hanging', 'Gavel', 'Sleepy', 'The Bishop', 'Recess', 'Long Lunch', 'The Owl', 'Thirty Days'],
  tough: ['Knuckles', 'Junior', 'Butch', 'Spider', 'Tiger', 'Ace', 'Bats', 'Chickie', 'Lefty', 'Moose', 'Whitey', 'Red', 'Blackie', 'Specs', 'Cowboy', 'Hammer', 'Babyface', 'Skids', 'Bones', 'Flash', 'Duke', 'Rabbit', 'Gears', 'Tank', 'Socks', 'Peanut', 'Cookie', 'Bunny', 'Juice', 'Boots', 'The Kid', 'Slats', 'Ziggy', 'Pinky', 'Champ', 'Dutch', 'Sneakers', 'Hollywood', 'Smiley'],
  'woman-in-the-life': ['Kitty', 'Duchess', 'The Countess', 'Ledger', 'Red', 'Babe', 'Queenie', 'Lucky', 'Slim', 'Dimples', 'Sis', 'Boss Lady', 'Pennies', 'Cookie'],
  entertainer: ['The Voice', 'Little', 'Kid', 'Sugar', 'Velvet', 'Satin', 'Dynamite', 'Mr. Excitement', 'The Crooner', 'Sweet', 'Lady', 'Baby', 'Daddy', 'Cool', 'Stardust', 'Moonglow'],
  civilian: ['Doc', 'Pop', 'Mom', 'Captain', 'Professor', 'Shorty', 'Red', 'Sunny', 'Skip', 'Buddy', 'Sis', 'Aunt', 'Uncle'],
};

/* ------------------------------------------------------------------ */
/* Archetypes: coherent attribute profiles                             */
/* ------------------------------------------------------------------ */

export type Archetype =
  // political
  | 'machine' | 'reformer' | 'idealist' | 'patrician' | 'labor-boss' | 'climber' | 'hack' | 'fixer'
  // police
  | 'bagman-cop' | 'pad-cop' | 'straight-cop' | 'crusader' | 'careerist' | 'brute-cop' | 'fed' | 'old-timer'
  // fire
  | 'fire-hero' | 'fire-hack' | 'inspector-for-sale' | 'arson-hound'
  // legal
  | 'mob-lawyer' | 'crusading-prosecutor' | 'political-prosecutor' | 'hanging-judge' | 'bought-judge' | 'fair-judge' | 'drunk-judge'
  | 'hack-lawyer' | 'idealist-lawyer' | 'bondsman' | 'clerk'
  // street
  | 'brawler' | 'thinker' | 'earner-kid' | 'wild-card' | 'quiet-pro' | 'charmer' | 'leader-born' | 'woman-operator'
  // entertainment
  | 'star' | 'striver' | 'has-been' | 'operator' | 'artist' | 'columnist'
  // civilian
  | 'pillar' | 'small-business' | 'cleric' | 'reporter' | 'union-man' | 'widow' | 'professional' | 'gossip' | 'kid';

type Profile = Partial<Record<AttrKey, number>>;

/** Mean attribute values per archetype (unlisted = 50). SD is 10 for generated people, 6 for hand-written jitter. */
export const ARCHETYPES: Record<Archetype, Profile> = {
  machine: { loyalty: 65, ambition: 60, greed: 65, courage: 45, competence: 60, corruption: 75, morality: 35, charisma: 65, leadership: 60, diplomacy: 65, intrigue: 60, force: 35 },
  reformer: { loyalty: 55, ambition: 65, greed: 25, courage: 65, competence: 65, corruption: 15, morality: 75, charisma: 60, diplomacy: 50, intrigue: 55, force: 30, discipline: 65 },
  idealist: { loyalty: 60, ambition: 55, greed: 20, courage: 60, competence: 55, corruption: 10, morality: 85, charisma: 60, diplomacy: 45, intrigue: 35, force: 25, discipline: 55 },
  patrician: { loyalty: 50, ambition: 60, greed: 50, courage: 45, competence: 65, corruption: 45, morality: 50, charisma: 60, leadership: 60, business: 70, diplomacy: 65, intrigue: 55, force: 25 },
  'labor-boss': { loyalty: 60, ambition: 60, greed: 55, courage: 65, competence: 60, corruption: 55, morality: 45, charisma: 70, leadership: 70, diplomacy: 55, intrigue: 50, force: 60 },
  climber: { loyalty: 35, ambition: 85, greed: 55, courage: 55, competence: 65, corruption: 50, morality: 40, charisma: 65, leadership: 55, diplomacy: 60, intrigue: 65 },
  hack: { loyalty: 75, ambition: 30, greed: 55, courage: 35, competence: 35, corruption: 60, morality: 40, charisma: 50, leadership: 30, business: 40, discipline: 35 },
  fixer: { loyalty: 55, ambition: 55, greed: 65, courage: 45, competence: 70, corruption: 80, morality: 30, charisma: 60, diplomacy: 75, intrigue: 75, business: 60, force: 30 },
  'bagman-cop': { loyalty: 60, ambition: 55, greed: 80, courage: 50, competence: 60, corruption: 90, morality: 20, charisma: 55, intrigue: 65, business: 55, force: 50 },
  'pad-cop': { loyalty: 55, ambition: 40, greed: 70, courage: 45, competence: 45, corruption: 75, morality: 35, charisma: 45, force: 55, discipline: 40 },
  'straight-cop': { loyalty: 65, ambition: 45, greed: 25, courage: 65, competence: 60, corruption: 10, morality: 75, charisma: 45, force: 60, discipline: 65 },
  crusader: { loyalty: 40, ambition: 70, greed: 15, courage: 80, competence: 70, corruption: 5, morality: 80, charisma: 50, intrigue: 60, force: 55, discipline: 75 },
  careerist: { loyalty: 40, ambition: 75, greed: 50, courage: 40, competence: 65, corruption: 40, morality: 45, charisma: 55, diplomacy: 60, intrigue: 55 },
  'brute-cop': { loyalty: 55, ambition: 35, greed: 55, courage: 70, competence: 40, corruption: 60, morality: 25, charisma: 30, force: 80, discipline: 30, diplomacy: 25 },
  fed: { loyalty: 70, ambition: 65, greed: 15, courage: 60, competence: 75, corruption: 5, morality: 70, charisma: 45, intrigue: 70, discipline: 80, diplomacy: 45 },
  'old-timer': { loyalty: 60, ambition: 20, greed: 45, courage: 45, competence: 55, corruption: 50, morality: 50, charisma: 50, discipline: 45 },
  'fire-hero': { loyalty: 70, ambition: 40, greed: 25, courage: 85, competence: 65, corruption: 15, morality: 70, charisma: 55, force: 65, discipline: 65 },
  'fire-hack': { loyalty: 65, ambition: 30, greed: 55, courage: 45, competence: 40, corruption: 55, morality: 45, charisma: 50, discipline: 35 },
  'inspector-for-sale': { loyalty: 45, ambition: 45, greed: 80, courage: 30, competence: 55, corruption: 85, morality: 25, charisma: 45, intrigue: 50, business: 55 },
  'arson-hound': { loyalty: 55, ambition: 50, greed: 20, courage: 60, competence: 80, corruption: 10, morality: 70, charisma: 40, intrigue: 70, discipline: 70 },
  'mob-lawyer': { loyalty: 60, ambition: 60, greed: 75, courage: 50, competence: 80, corruption: 75, morality: 30, charisma: 70, diplomacy: 75, intrigue: 75, business: 65, force: 20 },
  'crusading-prosecutor': { loyalty: 45, ambition: 80, greed: 20, courage: 75, competence: 75, corruption: 10, morality: 70, charisma: 60, intrigue: 60, discipline: 70, diplomacy: 45 },
  'political-prosecutor': { loyalty: 55, ambition: 70, greed: 50, courage: 40, competence: 60, corruption: 50, morality: 45, charisma: 60, diplomacy: 65, intrigue: 60 },
  'hanging-judge': { loyalty: 50, ambition: 40, greed: 20, courage: 70, competence: 65, corruption: 10, morality: 65, charisma: 35, discipline: 80, diplomacy: 30 },
  'bought-judge': { loyalty: 55, ambition: 40, greed: 75, courage: 30, competence: 50, corruption: 85, morality: 25, charisma: 50, diplomacy: 55, intrigue: 50 },
  'fair-judge': { loyalty: 50, ambition: 40, greed: 20, courage: 60, competence: 75, corruption: 10, morality: 75, charisma: 50, discipline: 70, diplomacy: 55 },
  'drunk-judge': { loyalty: 55, ambition: 20, greed: 50, courage: 35, competence: 40, corruption: 55, morality: 45, charisma: 55, discipline: 25 },
  'hack-lawyer': { loyalty: 55, ambition: 40, greed: 60, courage: 35, competence: 40, corruption: 55, morality: 40, charisma: 55, diplomacy: 50 },
  'idealist-lawyer': { loyalty: 60, ambition: 50, greed: 20, courage: 70, competence: 70, corruption: 5, morality: 85, charisma: 55, discipline: 60 },
  bondsman: { loyalty: 45, ambition: 50, greed: 75, courage: 50, competence: 60, corruption: 60, morality: 35, charisma: 50, business: 70, intrigue: 55, force: 45 },
  clerk: { loyalty: 60, ambition: 30, greed: 50, courage: 35, competence: 65, corruption: 45, morality: 50, charisma: 40, intrigue: 60, discipline: 60 },
  brawler: { loyalty: 55, ambition: 45, greed: 50, courage: 75, competence: 40, corruption: 60, morality: 40, charisma: 40, leadership: 35, force: 80, discipline: 30, intrigue: 30 },
  thinker: { loyalty: 50, ambition: 65, greed: 55, courage: 50, competence: 70, corruption: 60, morality: 40, charisma: 50, leadership: 55, business: 65, intrigue: 70, force: 35, discipline: 65 },
  'earner-kid': { loyalty: 50, ambition: 70, greed: 70, courage: 45, competence: 60, corruption: 65, morality: 35, charisma: 55, business: 70, force: 35 },
  'wild-card': { loyalty: 30, ambition: 65, greed: 60, courage: 75, competence: 50, corruption: 70, morality: 25, charisma: 55, force: 65, discipline: 20 },
  'quiet-pro': { loyalty: 65, ambition: 35, greed: 50, courage: 60, competence: 80, corruption: 65, morality: 40, charisma: 35, discipline: 80, intrigue: 60, diplomacy: 35 },
  charmer: { loyalty: 45, ambition: 60, greed: 60, courage: 45, competence: 55, corruption: 60, morality: 40, charisma: 80, diplomacy: 75, force: 35 },
  'leader-born': { loyalty: 55, ambition: 75, greed: 55, courage: 70, competence: 70, corruption: 60, morality: 45, charisma: 70, leadership: 80, diplomacy: 60, intrigue: 60, force: 60, discipline: 60 },
  'woman-operator': { loyalty: 55, ambition: 65, greed: 60, courage: 55, competence: 75, corruption: 60, morality: 45, charisma: 60, business: 75, intrigue: 70, force: 25, discipline: 70 },
  star: { loyalty: 40, ambition: 75, greed: 55, courage: 50, competence: 70, corruption: 35, morality: 45, charisma: 85, diplomacy: 60 },
  striver: { loyalty: 50, ambition: 85, greed: 50, courage: 55, competence: 60, corruption: 35, morality: 50, charisma: 70 },
  'has-been': { loyalty: 50, ambition: 45, greed: 55, courage: 35, competence: 55, corruption: 45, morality: 45, charisma: 60, discipline: 30 },
  operator: { loyalty: 40, ambition: 70, greed: 75, courage: 45, competence: 70, corruption: 65, morality: 35, charisma: 65, business: 75, diplomacy: 65, intrigue: 65 },
  artist: { loyalty: 55, ambition: 55, greed: 30, courage: 50, competence: 75, corruption: 25, morality: 60, charisma: 60, discipline: 45 },
  columnist: { loyalty: 30, ambition: 70, greed: 55, courage: 55, competence: 70, corruption: 50, morality: 40, charisma: 60, intrigue: 80, diplomacy: 55 },
  pillar: { loyalty: 60, ambition: 45, greed: 40, courage: 45, competence: 65, corruption: 25, morality: 65, charisma: 55, business: 65, diplomacy: 55 },
  'small-business': { loyalty: 55, ambition: 45, greed: 50, courage: 40, competence: 60, corruption: 35, morality: 55, charisma: 50, business: 60 },
  cleric: { loyalty: 65, ambition: 35, greed: 20, courage: 55, competence: 60, corruption: 15, morality: 80, charisma: 65, diplomacy: 70, force: 20 },
  reporter: { loyalty: 40, ambition: 70, greed: 35, courage: 65, competence: 65, corruption: 25, morality: 60, charisma: 55, intrigue: 75 },
  'union-man': { loyalty: 65, ambition: 55, greed: 55, courage: 65, competence: 55, corruption: 55, morality: 45, charisma: 60, leadership: 65, force: 60 },
  widow: { loyalty: 60, ambition: 30, greed: 40, courage: 50, competence: 55, corruption: 20, morality: 65, charisma: 50, intrigue: 60 },
  professional: { loyalty: 50, ambition: 55, greed: 50, courage: 45, competence: 75, corruption: 30, morality: 55, charisma: 50, business: 60, discipline: 65 },
  gossip: { loyalty: 35, ambition: 40, greed: 45, courage: 45, competence: 50, corruption: 35, morality: 45, charisma: 60, intrigue: 80 },
  kid: { loyalty: 55, ambition: 60, greed: 45, courage: 55, competence: 40, corruption: 30, morality: 55, charisma: 55 },
};

/** Trait effects on the 14 attributes (applied after the archetype). */
export const TRAIT_MODS: Partial<Record<WorldTrait, Profile>> = {
  Greedy: { greed: 15, corruption: 10, morality: -5 },
  'Hot-headed': { discipline: -12, courage: 5, diplomacy: -6 },
  Patient: { discipline: 10, intrigue: 4 },
  Ambitious: { ambition: 20, loyalty: -6 },
  'Loyal-to-a-fault': { loyalty: 20 },
  Paranoid: { intrigue: 8, loyalty: -5, diplomacy: -4 },
  Pious: { morality: 10, corruption: -5 },
  Womanizer: { morality: -6, discipline: -4 },
  Gambler: { business: -6, discipline: -5 },
  Honest: { corruption: -20, morality: 15, greed: -15 },
  Cruel: { force: 8, morality: -15 },
  Cowardly: { force: -15, courage: -20 },
  Charming: { diplomacy: 12, charisma: 10 },
  Vengeful: { loyalty: -3, intrigue: 4 },
  Drinker: { discipline: -6, competence: -5 },
  Idealist: { morality: 12, corruption: -15, greed: -10 },
  Vain: { charisma: 8, loyalty: -5, discipline: -3 },
  Discreet: { intrigue: 10, discipline: 5 },
  Ruthless: { morality: -15, force: 8, courage: 5 },
  Lazy: { competence: -15, ambition: -12, discipline: -10 },
  Zealous: { ambition: 8, discipline: 10, morality: 5 },
  Reckless: { discipline: -10, courage: 10 },
  Cunning: { intrigue: 12, diplomacy: 4 },
  Sentimental: { loyalty: 8 },
  Brave: { courage: 20, force: 5 },
  Flirt: { charisma: 8 },
};

export function rollAttributes(rng: Rng, arch: Archetype, traits: WorldTrait[], sd: number, overrides: Partial<WorldAttributes> = {}): WorldAttributes {
  const base = ARCHETYPES[arch];
  const out = {} as WorldAttributes;
  for (const k of ATTR_KEYS) out[k] = (base[k] ?? 50) + rng.gauss() * sd;
  for (const t of traits) {
    const m = TRAIT_MODS[t];
    if (!m) continue;
    for (const k of Object.keys(m) as AttrKey[]) out[k] += m[k] ?? 0;
  }
  // Coherence: corruption and morality pull against each other, greed feeds corruption.
  out.corruption = out.corruption * 0.8 + (100 - out.morality) * 0.1 + out.greed * 0.1;
  for (const k of ATTR_KEYS) out[k] = clamp(out[k]);
  for (const k of Object.keys(overrides) as AttrKey[]) out[k] = clamp(overrides[k] ?? out[k]);
  return out;
}

/* ------------------------------------------------------------------ */
/* Trait and vice pools                                                */
/* ------------------------------------------------------------------ */

const TRAIT_WEIGHTS: Record<Archetype, Partial<Record<WorldTrait, number>>> = {
  machine: { Greedy: 3, Charming: 3, Patient: 2, 'Loyal-to-a-fault': 1, Drinker: 2, Vengeful: 1, Cunning: 2 },
  reformer: { Honest: 3, Ambitious: 2, Zealous: 2, Paranoid: 1, Idealist: 2, Vain: 1, Pious: 1 },
  idealist: { Honest: 3, Idealist: 3, Pious: 1, Brave: 2, Sentimental: 1 },
  patrician: { Patient: 2, Vain: 2, Discreet: 2, Ambitious: 1, Charming: 2, Cunning: 1 },
  'labor-boss': { 'Hot-headed': 2, Charming: 2, Greedy: 2, Brave: 1, Vengeful: 1, Drinker: 1 },
  climber: { Ambitious: 4, Charming: 2, Cunning: 2, Vain: 1, Ruthless: 1 },
  hack: { 'Loyal-to-a-fault': 3, Lazy: 2, Drinker: 2, Gambler: 1, Cowardly: 1 },
  fixer: { Cunning: 3, Discreet: 3, Greedy: 2, Patient: 2, Charming: 1 },
  'bagman-cop': { Greedy: 3, Discreet: 2, Patient: 1, Cunning: 2, Gambler: 1 },
  'pad-cop': { Greedy: 2, Lazy: 2, Drinker: 2, 'Loyal-to-a-fault': 1, Gambler: 1, Cowardly: 1 },
  'straight-cop': { Honest: 3, Brave: 2, Pious: 2, Patient: 1, Sentimental: 1 },
  crusader: { Honest: 3, Zealous: 3, Brave: 2, Paranoid: 1, Vengeful: 1 },
  careerist: { Ambitious: 3, Charming: 2, Cunning: 2, Cowardly: 1 },
  'brute-cop': { Cruel: 3, 'Hot-headed': 3, Drinker: 1, Brave: 1, Vengeful: 1 },
  fed: { Patient: 3, Zealous: 2, Honest: 2, Paranoid: 2, Ambitious: 1 },
  'old-timer': { Patient: 2, Drinker: 2, Sentimental: 2, Lazy: 1 },
  'fire-hero': { Brave: 4, Honest: 2, 'Loyal-to-a-fault': 2, Reckless: 1 },
  'fire-hack': { Lazy: 2, Drinker: 2, Gambler: 1, 'Loyal-to-a-fault': 2 },
  'inspector-for-sale': { Greedy: 4, Cowardly: 2, Gambler: 1, Discreet: 1 },
  'arson-hound': { Zealous: 3, Patient: 2, Honest: 2, Paranoid: 1 },
  'mob-lawyer': { Charming: 3, Cunning: 3, Greedy: 2, Vain: 1, Discreet: 2 },
  'crusading-prosecutor': { Ambitious: 3, Zealous: 3, Honest: 2, Vain: 1 },
  'political-prosecutor': { Ambitious: 3, Charming: 2, Cowardly: 1, Cunning: 1 },
  'hanging-judge': { Zealous: 2, Pious: 2, Honest: 2, Vengeful: 1 },
  'bought-judge': { Greedy: 3, Gambler: 2, Drinker: 1, Cowardly: 1 },
  'fair-judge': { Honest: 3, Patient: 3, Pious: 1 },
  'drunk-judge': { Drinker: 4, Lazy: 2, Sentimental: 1 },
  'hack-lawyer': { Drinker: 2, Lazy: 2, Gambler: 1, Charming: 1, Greedy: 1 },
  'idealist-lawyer': { Idealist: 3, Honest: 2, Brave: 2, Zealous: 1 },
  bondsman: { Greedy: 3, Cunning: 2, Gambler: 1 },
  clerk: { Discreet: 3, Patient: 2, Greedy: 1 },
  brawler: { 'Hot-headed': 3, Brave: 2, Reckless: 2, Cruel: 1, 'Loyal-to-a-fault': 1, Drinker: 1 },
  thinker: { Patient: 3, Cunning: 3, Ambitious: 2, Discreet: 2 },
  'earner-kid': { Greedy: 3, Ambitious: 2, Charming: 2, Gambler: 1 },
  'wild-card': { Reckless: 3, 'Hot-headed': 2, Ambitious: 1, Cruel: 1, Womanizer: 1 },
  'quiet-pro': { Discreet: 3, Patient: 3, 'Loyal-to-a-fault': 1 },
  charmer: { Charming: 4, Womanizer: 2, Vain: 1, Flirt: 1 },
  'leader-born': { Ambitious: 3, Charming: 2, Brave: 2, Patient: 1, Cunning: 1 },
  'woman-operator': { Discreet: 3, Cunning: 3, Patient: 2, Ambitious: 2 },
  star: { Vain: 3, Charming: 3, Ambitious: 2, Drinker: 1, Womanizer: 1, Flirt: 1 },
  striver: { Ambitious: 4, Charming: 2, Reckless: 1 },
  'has-been': { Drinker: 3, Sentimental: 2, Gambler: 2, Vain: 1 },
  operator: { Cunning: 3, Greedy: 3, Charming: 2 },
  artist: { Sentimental: 2, Idealist: 1, Drinker: 1, Patient: 1, Reckless: 1 },
  columnist: { Vain: 2, Cunning: 3, Vengeful: 2, Charming: 1 },
  pillar: { Pious: 2, Patient: 2, Honest: 2, Discreet: 1 },
  'small-business': { Patient: 2, Greedy: 1, Honest: 1, Cowardly: 1 },
  cleric: { Pious: 4, Patient: 2, Brave: 1, Discreet: 1 },
  reporter: { Zealous: 2, Brave: 2, Ambitious: 2, Drinker: 1 },
  'union-man': { 'Hot-headed': 2, Brave: 2, Charming: 1, Greedy: 1, 'Loyal-to-a-fault': 1 },
  widow: { Pious: 2, Patient: 2, Discreet: 1, Sentimental: 2 },
  professional: { Patient: 2, Discreet: 2, Ambitious: 1, Gambler: 1 },
  gossip: { Cunning: 2, Vain: 1, Vengeful: 1, Charming: 1 },
  kid: { Ambitious: 2, Reckless: 2, Charming: 1, Idealist: 1 },
};

const VICE_WEIGHTS: Partial<Record<WorldVice, number>> = { booze: 4, horses: 3, cards: 2, women: 2, debt: 2, dice: 1, spending: 2, pills: 1 };

export function rollTraits(rng: Rng, arch: Archetype, n: number): WorldTrait[] {
  const out: WorldTrait[] = [];
  const w = { ...TRAIT_WEIGHTS[arch] } as Record<string, number>;
  for (let i = 0; i < 20 && out.length < n; i++) {
    const keys = Object.keys(w);
    if (!keys.length) break;
    const t = rng.weighted(w) as WorldTrait;
    delete w[t];
    if (OPPOSED_TRAITS.some(([a, b]) => (a === t && out.includes(b)) || (b === t && out.includes(a)))) continue;
    out.push(t);
  }
  return out;
}

export function rollVices(rng: Rng, traits: WorldTrait[], sex: Sex): WorldVice[] {
  const v: WorldVice[] = [];
  if (traits.includes('Drinker')) v.push('booze');
  if (traits.includes('Gambler')) v.push(rng.pick(['horses', 'cards', 'dice'] as WorldVice[]));
  if (traits.includes('Womanizer')) v.push('women');
  if (v.length < 2 && rng.chance(0.3)) {
    const w = { ...VICE_WEIGHTS };
    if (sex === 'F') { delete w.women; (w as Record<string, number>).men = 1; }
    v.push(rng.weighted(w) as WorldVice);
  }
  return [...new Set(v)].slice(0, 2);
}

/* ------------------------------------------------------------------ */
/* Demographics and role templates per institution                      */
/* ------------------------------------------------------------------ */

/** Origin weights by institution (period-plausible, not quotas). */
export const DEMOGRAPHICS: Partial<Record<InstitutionId, Partial<Record<Origin, number>>>> & { default: Partial<Record<Origin, number>> } = {
  default: { Irish: 30, Italian: 30, WASP: 15, Jewish: 10, German: 7, Polish: 4, Black: 6, Greek: 2 },
  wildwood_pd: { Irish: 45, Italian: 22, German: 12, WASP: 12, Polish: 4, Black: 3, Greek: 2 },
  north_wildwood_pd: { Irish: 45, German: 15, WASP: 20, Italian: 18, Polish: 2 },
  crest_pd: { WASP: 35, German: 20, Irish: 35, Italian: 10 },
  philadelphia_pd: { Irish: 40, Italian: 22, Polish: 14, Black: 12, German: 8, Jewish: 4 },
  atlantic_city_pd: { Irish: 32, Italian: 25, Black: 18, WASP: 12, Jewish: 6, Greek: 4, German: 3 },
  nj_state_police: { WASP: 40, German: 18, Irish: 22, Italian: 10, Polish: 10 },
  fbi_newark: { Irish: 40, WASP: 40, German: 12, Italian: 6, Jewish: 2 },
  fbi_philadelphia: { Irish: 40, WASP: 40, German: 12, Italian: 6, Jewish: 2 },
  private_bar: { Jewish: 30, Irish: 25, Italian: 22, WASP: 18, Black: 5 },
  showbiz: { Italian: 28, Jewish: 22, Black: 22, Irish: 12, WASP: 10, PuertoRican: 4, Greek: 2 },
  street: { Italian: 45, Irish: 22, Polish: 8, Black: 10, Jewish: 7, PuertoRican: 4, Greek: 4 },
  business: { Italian: 22, Irish: 20, WASP: 20, Jewish: 15, German: 10, Greek: 8, Black: 5 },
  union: { Italian: 35, Irish: 35, Black: 12, Polish: 10, Jewish: 8 },
};

const STREET_ORIGIN_DEMO: Record<StreetOrigin, Partial<Record<Origin, number>>> = {
  Wildwood: { Italian: 45, Irish: 35, Black: 10, German: 5, Greek: 5 },
  'North Wildwood': { Irish: 55, Italian: 30, German: 15 },
  'Rio Grande': { WASP: 40, Irish: 25, Italian: 20, Black: 15 },
  'Cape May': { WASP: 35, Irish: 30, Italian: 20, Black: 15 },
  'South Philly': { Italian: 75, Jewish: 10, Irish: 10, Black: 5 },
  Kensington: { Irish: 45, Polish: 40, German: 15 },
  'Atlantic City': { Italian: 35, Irish: 25, Black: 30, Jewish: 10 },
  Camden: { Italian: 35, Polish: 20, Black: 25, PuertoRican: 15, Irish: 5 },
  Vineland: { Italian: 50, Jewish: 20, PuertoRican: 20, WASP: 10 },
};

interface RoleTemplate {
  archetypes: Partial<Record<Archetype, number>>;
  /** Weight per ladder rung index (lower rungs are more common). */
  rungWeights: number[];
  domain: Domain;
  femaleShare: number;
}

export const ROLE_TEMPLATES: Partial<Record<InstitutionId, RoleTemplate>> = {
  wildwood_pd: { domain: 'police', femaleShare: 0.02, archetypes: { 'pad-cop': 40, 'straight-cop': 22, careerist: 15, 'brute-cop': 10, 'old-timer': 8, 'bagman-cop': 5 }, rungWeights: [30, 40, 15, 8, 4, 1] },
  north_wildwood_pd: { domain: 'police', femaleShare: 0.02, archetypes: { 'pad-cop': 45, 'straight-cop': 20, 'old-timer': 15, 'brute-cop': 10, careerist: 10 }, rungWeights: [25, 45, 18, 8, 3, 1] },
  crest_pd: { domain: 'police', femaleShare: 0.03, archetypes: { 'straight-cop': 40, 'old-timer': 25, 'pad-cop': 20, careerist: 15 }, rungWeights: [25, 45, 18, 8, 3, 1] },
  atlantic_city_pd: { domain: 'police', femaleShare: 0.03, archetypes: { 'pad-cop': 45, 'bagman-cop': 8, 'straight-cop': 18, careerist: 15, 'brute-cop': 14 }, rungWeights: [45, 18, 16, 10, 6, 3, 1, 1] },
  philadelphia_pd: { domain: 'police', femaleShare: 0.04, archetypes: { 'pad-cop': 35, 'straight-cop': 25, careerist: 18, 'brute-cop': 14, crusader: 5, 'bagman-cop': 3 }, rungWeights: [45, 18, 16, 10, 6, 3, 1, 1] },
  nj_state_police: { domain: 'police', femaleShare: 0, archetypes: { 'straight-cop': 45, careerist: 25, crusader: 15, 'brute-cop': 10, 'pad-cop': 5 }, rungWeights: [55, 25, 10, 6, 3, 1] },
  cmc_prosecutor_detectives: { domain: 'police', femaleShare: 0.05, archetypes: { careerist: 30, 'pad-cop': 25, 'straight-cop': 25, crusader: 10, 'bagman-cop': 10 }, rungWeights: [60, 25, 10, 5] },
  cmc_sheriff: { domain: 'police', femaleShare: 0.08, archetypes: { hack: 35, 'pad-cop': 30, 'brute-cop': 15, 'straight-cop': 20 }, rungWeights: [70, 20, 8, 0] },
  fbi_newark: { domain: 'police', femaleShare: 0, archetypes: { fed: 80, careerist: 20 }, rungWeights: [10, 70, 8, 8, 3, 1, 0] },
  fbi_philadelphia: { domain: 'police', femaleShare: 0, archetypes: { fed: 80, careerist: 20 }, rungWeights: [10, 70, 8, 8, 3, 1, 0] },
  wildwood_fd: { domain: 'fire', femaleShare: 0, archetypes: { 'fire-hero': 45, 'fire-hack': 40, 'inspector-for-sale': 5, careerist: 10 }, rungWeights: [50, 18, 14, 10, 5, 2] },
  north_wildwood_fd: { domain: 'fire', femaleShare: 0, archetypes: { 'fire-hero': 45, 'fire-hack': 45, careerist: 10 }, rungWeights: [70, 12, 10, 5, 3] },
  crest_fd: { domain: 'fire', femaleShare: 0, archetypes: { 'fire-hero': 50, 'fire-hack': 40, careerist: 10 }, rungWeights: [70, 12, 10, 5, 3] },
  county_fire: { domain: 'fire', femaleShare: 0.05, archetypes: { 'inspector-for-sale': 45, 'arson-hound': 20, 'fire-hack': 35 }, rungWeights: [70, 25, 5] },
  insurance: { domain: 'fire', femaleShare: 0.1, archetypes: { 'arson-hound': 40, 'inspector-for-sale': 30, careerist: 30 }, rungWeights: [70, 25, 5] },
  cmc_prosecutor: { domain: 'legal', femaleShare: 0.08, archetypes: { 'political-prosecutor': 50, 'crusading-prosecutor': 30, 'hack-lawyer': 20 }, rungWeights: [70, 20, 8, 2] },
  us_attorney_nj: { domain: 'legal', femaleShare: 0.08, archetypes: { 'crusading-prosecutor': 60, 'political-prosecutor': 40 }, rungWeights: [85, 8, 5, 2] },
  private_bar: { domain: 'legal', femaleShare: 0.06, archetypes: { 'hack-lawyer': 40, 'mob-lawyer': 15, 'idealist-lawyer': 15, professional: 30 }, rungWeights: [45, 40, 15] },
  municipal_court: { domain: 'legal', femaleShare: 0.03, archetypes: { 'bought-judge': 35, 'drunk-judge': 20, 'fair-judge': 30, 'hanging-judge': 15 }, rungWeights: [100] },
  county_court: { domain: 'legal', femaleShare: 0.03, archetypes: { 'bought-judge': 20, 'drunk-judge': 15, 'fair-judge': 40, 'hanging-judge': 25 }, rungWeights: [0, 40, 60] },
  wildwood_city: { domain: 'political', femaleShare: 0.1, archetypes: { machine: 40, hack: 25, climber: 20, reformer: 10, idealist: 5 }, rungWeights: [60, 30, 9, 1] },
  philadelphia_ward: { domain: 'political', femaleShare: 0.1, archetypes: { machine: 50, hack: 30, climber: 15, reformer: 5 }, rungWeights: [80, 18, 2, 0] },
  union: { domain: 'civilian', femaleShare: 0.15, archetypes: { 'union-man': 70, 'labor-boss': 20, hack: 10 }, rungWeights: [70, 25, 5] },
  business: { domain: 'civilian', femaleShare: 0.25, archetypes: { 'small-business': 60, pillar: 20, gossip: 10, professional: 10 }, rungWeights: [30, 60, 10] },
  community: { domain: 'civilian', femaleShare: 0.55, archetypes: { widow: 30, gossip: 25, 'small-business': 25, kid: 20 }, rungWeights: [70, 25, 5] },
};

/* ------------------------------------------------------------------ */
/* Text fragments for generated people                                 */
/* ------------------------------------------------------------------ */

const PUBLIC: Partial<Record<Archetype, string[]>> = {
  machine: ['Knows every family on his block by name.', 'Gets the potholes filled and the nephews hired.', 'Shakes every hand at every wake.'],
  reformer: ['Calls himself the taxpayers\' watchdog.', 'Reads the budget line by line at public meetings.'],
  'pad-cop': ['A friendly face on the beat.', 'Known for letting the summer kids off with a warning.'],
  'bagman-cop': ['A desk man everybody likes.', 'The guy who organizes the department picnic.'],
  'straight-cop': ['By-the-book and proud of it.', 'Coaches the PAL boxing team.'],
  'brute-cop': ['Keeps the boardwalk quiet, one way or another.'],
  careerist: ['Always in the newspaper photo.', 'Studying for the next exam.'],
  fed: ['A polite man in a gray suit who asks a lot of questions.'],
  'fire-hero': ['Pulled two kids out of a rooming-house fire.', 'Everybody\'s favorite at the firemen\'s carnival.'],
  'fire-hack': ['Never misses the company dinner.'],
  'inspector-for-sale': ['A stickler for paperwork, they say.'],
  'mob-lawyer': ['The best trial lawyer south of Camden.'],
  'hack-lawyer': ['Handles closings, wills and the occasional drunk driver.'],
  'bought-judge': ['A genial judge who likes a quiet courtroom.'],
  'fair-judge': ['Known for patience and long opinions.'],
  'hanging-judge': ['Gives the maximum and says so from the bench.'],
  'drunk-judge': ['A war hero with a famous lunch hour.'],
  brawler: ['Golden Gloves at sixteen.', 'Breaks up fights at the Starlight by finishing them.'],
  thinker: ['Quiet kid, good with numbers.'],
  'earner-kid': ['Always has a hustle going.'],
  charmer: ['Everybody on the boardwalk knows his smile.'],
  'union-man': ['Speaks up at every meeting.'],
  'woman-operator': ['Keeps the books for a luncheonette and three other businesses nobody asks about.', 'Runs a beauty parlor where every bet on the block gets written.'],
  widow: ['Lights a candle every morning at St. Ann\'s.'],
  'small-business': ['Open seven days a week from Memorial Day to Labor Day.'],
};

const HIDDEN: Partial<Record<Archetype, string[]>> = {
  machine: ['Keeps a card file on every favor he has done.', 'Never forgets a vote against him.'],
  reformer: ['Wants the job of the man he is investigating.', 'Enjoys the headlines more than the reforms.'],
  'pad-cop': ['Takes the envelope because everybody does and he has four kids.', 'Afraid of the sergeant, more afraid of his wife.'],
  'bagman-cop': ['Skims the pad before it reaches the captain.', 'Keeps his own list of who paid and who did not.'],
  'straight-cop': ['Hates the pad but has never reported it.', 'Is keeping notes in a shoebox for the day somebody asks.'],
  'brute-cop': ['Enjoys it.', 'Drinks before shifts.'],
  careerist: ['Will flip to whichever side is winning.'],
  fed: ['Has an informant he trusts too much.', 'Is quietly building a case nobody has authorized.'],
  'fire-hero': ['Has nightmares about the one he did not reach.'],
  'fire-hack': ['Owes money at a card game.'],
  'inspector-for-sale': ['Has a price list in his head.', 'Signs anything for fifty dollars.'],
  'mob-lawyer': ['Holds the family\'s secrets and a few of his own.'],
  'hack-lawyer': ['Behind on his own taxes.'],
  'bought-judge': ['Owes a bookmaker more than his salary.'],
  'fair-judge': ['Would risk his seat for the right case.'],
  'hanging-judge': ['Lost a brother to a holdup man.'],
  'drunk-judge': ['Doesn\'t remember half his sentences.'],
  brawler: ['Wants somebody to tell him what to do with all of it.'],
  thinker: ['Already planning how to run his own book.'],
  'earner-kid': ['Wants more than the corner, and soon.'],
  charmer: ['Says what people want to hear and believes none of it.'],
  'union-man': ['Would sell out the local for a better pension.'],
  'woman-operator': ['Knows to the dollar what every runner on the island turns in, and who is shorting whom.', 'Wants her own bank and her own name on it.'],
  widow: ['Knows exactly who killed her husband.'],
  'small-business': ['Pays two different men for the same protection.'],
};

const HOOKS: Partial<Record<Archetype, string[]>> = {
  machine: ['Will trade a liquor license for a precinct\'s votes.', 'His nephew needs a job, and he needs a favor.'],
  reformer: ['Is about to subpoena the wrong ledger.', 'Needs one witness to make his career.'],
  'pad-cop': ['Two more years to his pension; he will do anything to get there clean.', 'His envelope has been light and he has noticed.'],
  'bagman-cop': ['Has a list of every cop on the pad, and a reason to sell it.'],
  'straight-cop': ['Has just been transferred to the vice squad and does not know the rules.'],
  'brute-cop': ['One more complaint and he is finished; somebody could make it go away.'],
  careerist: ['Wants the lieutenant\'s exam answers and knows who has them.'],
  fed: ['His informant is in your crew.', 'Wants a transfer home to Ohio and needs one big case.'],
  'fire-hero': ['Saw something at the last fire that the report left out.'],
  'inspector-for-sale': ['Can condemn a rival\'s club by Friday.'],
  'mob-lawyer': ['Knows where every body is buried, legally speaking.'],
  'bought-judge': ['His bookmaker is about to call in the marker.'],
  brawler: ['Lost a fight he should have won; somebody paid somebody.'],
  thinker: ['Has noticed a numbers bank that nobody is protecting.'],
  'earner-kid': ['Running a craps game in a motel basement without permission.'],
  'union-man': ['Can call a strike in July, or not.'],
  'woman-operator': ['Her ledger is the only true record of a bank the bosses think they understand.'],
  widow: ['Has her late husband\'s notebook.'],
  'small-business': ['Wants out from under a shylock.'],
};

const SECRETS: Partial<Record<Archetype, WorldSecret[]>> = {
  machine: [{ kind: 'vote-fraud', severity: 2, text: 'Padded the voter rolls with the names of summer renters.', proof: 'The precinct registration book', inheritable: true }],
  'pad-cop': [{ kind: 'bribe', severity: 2, text: 'On the pad: a weekly envelope from a bookmaker.', proof: 'The bookmaker\'s own notebook' }],
  'bagman-cop': [{ kind: 'skimming', severity: 3, text: 'Collects the pad for the whole precinct and keeps a cut.', proof: 'A pocket diary of collections' }],
  'brute-cop': [{ kind: 'cover-up', severity: 2, text: 'Beat a prisoner badly in 1957; the report says he fell.', proof: 'A hospital orderly who saw it' }],
  'inspector-for-sale': [{ kind: 'bribe', severity: 2, text: 'Signs off on fire exits that do not exist.', proof: 'Inspection cards for three clubs' }],
  'bought-judge': [{ kind: 'debt', severity: 2, text: 'Deep in debt to a bookmaker.', proof: 'The bookmaker\'s markers' }],
  'drunk-judge': [{ kind: 'drugs', severity: 1, text: 'Takes pills to stay awake on the bench.', proof: 'A pharmacist\'s ledger' }],
  'mob-lawyer': [{ kind: 'plot', severity: 3, text: 'Carried a message that got a witness killed.', proof: 'The client who sent it' }],
  'earner-kid': [{ kind: 'skimming', severity: 1, text: 'Shorts the numbers bank a few dollars every week.' }],
  'union-man': [{ kind: 'skimming', severity: 2, text: 'Borrowed from the welfare fund and never paid it back.', proof: 'The fund\'s books' }],
  widow: [{ kind: 'past', severity: 1, text: 'Her husband\'s insurance claim was not entirely honest.' }],
  'small-business': [{ kind: 'fraud', severity: 1, text: 'Keeps two sets of books for the IRS.' }],
};

/* ------------------------------------------------------------------ */
/* The generator                                                       */
/* ------------------------------------------------------------------ */

export interface GenerateOpts {
  institution: InstitutionId;
  /** Deterministic seed: e.g. `${gameSeed}:${year}:${institution}:${n}`. */
  seed: string;
  /** Current game year (for age). */
  year: number;
  sex?: Sex;
  origin?: Origin;
  birthYear?: number;
  archetype?: Archetype;
  ladderRung?: number;
  /** Override the generated id. */
  id?: string;
  /** Street toughs: force an origin neighborhood and a specialty. */
  streetOrigin?: StreetOrigin;
  specialty?: StreetSpecialty;
  /** Entertainment: force a category. */
  showbizCategory?: ShowbizCategory;
}

function ageRangeFor(domain: Domain, rung: number, rungs: number): [number, number] {
  if (domain === 'street') return [17, 30];
  const frac = rungs > 1 ? rung / (rungs - 1) : 0.5;
  const lo = 21 + Math.round(frac * 20);
  return [lo, Math.min(66, lo + 18)];
}

function policeInfo(rng: Rng, arch: Archetype, inst: InstitutionId): { branch: PoliceBranch; faction: PoliceFaction; padWeekly: number } {
  const faction: PoliceFaction =
    arch === 'pad-cop' || arch === 'bagman-cop' || arch === 'brute-cop' ? 'pad'
      : arch === 'crusader' || arch === 'straight-cop' ? (rng.chance(0.4) ? 'reform' : 'neutral')
        : arch === 'fed' ? 'federal' : arch === 'careerist' ? 'careerist' : 'neutral';
  const branch: PoliceBranch = inst.startsWith('fbi') || inst === 'federal_other' ? 'federal'
    : inst === 'nj_state_police' ? 'state' : inst === 'cmc_sheriff' || inst === 'cmc_prosecutor_detectives' ? 'county'
      : rng.weighted<PoliceBranch>({ patrol: 55, detective: 15, vice: 10, boardwalk: inst === 'wildwood_pd' ? 15 : 2, homicide: inst === 'philadelphia_pd' ? 5 : 0.1, intelligence: 2, 'internal-affairs': 1 });
  const padWeekly = faction === 'pad' ? (arch === 'bagman-cop' ? rng.int(40, 100) : rng.int(5, 30)) : 0;
  return { branch, faction, padWeekly };
}

const SHOWBIZ_CATS: Partial<Record<ShowbizCategory, number>> = {
  'doo-wop': 12, 'rock-and-roll': 10, 'lounge-singer': 12, jazz: 6, comic: 10, bandleader: 5, dancer: 8, dj: 5, actress: 6, actor: 6,
  agent: 4, columnist: 2, songwriter: 3, 'record-man': 3, promoter: 3, photographer: 2, producer: 2,
};

/** Make one new person for an institution. */
export function generatePerson(opts: GenerateOpts): WorldPerson {
  const rng = makeRng(opts.seed);
  const inst = INSTITUTIONS.find((i) => i.id === opts.institution);
  if (!inst) throw new Error(`Unknown institution ${opts.institution}`);
  const tpl = ROLE_TEMPLATES[opts.institution] ?? {
    domain: inst.domain, femaleShare: inst.domain === 'entertainment' ? 0.45 : inst.domain === 'civilian' ? 0.35 : 0.08,
    archetypes: defaultArchetypes(inst.domain), rungWeights: [60, 30, 10],
  };
  const ladderId: LadderId = inst.ladder ?? 'civilian';
  const ladder = LADDERS[ladderId];
  const rung = opts.ladderRung ?? Math.min(ladder.rungs.length - 1, pickIndex(rng, tpl.rungWeights));
  const sex: Sex = opts.sex ?? (rng.chance(tpl.femaleShare) ? 'F' : 'M');

  let streetOrigin: StreetOrigin | undefined;
  let origin: Origin;
  if (inst.domain === 'street') {
    streetOrigin = opts.streetOrigin ?? rng.weighted<StreetOrigin>({ Wildwood: 22, 'North Wildwood': 8, 'Rio Grande': 8, 'South Philly': 22, 'Atlantic City': 14, Camden: 12, Vineland: 8, Kensington: 4, 'Cape May': 2 });
    origin = opts.origin ?? rng.weighted<Origin>(STREET_ORIGIN_DEMO[streetOrigin]);
  } else {
    origin = opts.origin ?? rng.weighted<Origin>(DEMOGRAPHICS[opts.institution] ?? DEMOGRAPHICS.default);
  }

  const [lo, hi] = ageRangeFor(inst.domain, rung, ladder.rungs.length);
  const birthYear = opts.birthYear ?? opts.year - rng.int(lo, hi);
  const era = eraOf(birthYear);
  const first = rng.pick(FIRST_NAMES[origin][sex][era]);
  const last = rng.pick(SURNAMES[origin]);

  let arch: Archetype = opts.archetype ?? rng.weighted<Archetype>(tpl.archetypes);
  if (inst.domain === 'street' && sex === 'F' && !opts.archetype) arch = 'woman-operator';
  const traits = rollTraits(rng, arch, rng.chance(0.5) ? 2 : 3);
  const attributes = rollAttributes(rng, arch, traits, 10);
  const vices = rollVices(rng, traits, sex);
  const id = opts.id ?? `gen_${opts.institution}_${hashString(opts.seed).toString(36)}`;
  const rungTitle = ladder.rungs[rung]?.title ?? 'Member';

  const p: WorldPerson = {
    id,
    name: { first, last },
    sex,
    birthYear,
    origin,
    gameEthnicity: ORIGIN_TO_GAME[origin],
    hometown: streetOrigin ?? inst.jurisdiction.split(/[,(]/)[0].trim(),
    domain: inst.domain,
    institution: opts.institution,
    office: `${rungTitle}, ${inst.name}`,
    ladder: { id: ladderId, rung },
    careerHistory: [{ year: Math.max(birthYear + 18, opts.year - rng.int(0, Math.max(1, (opts.year - birthYear - 20)))), title: rungTitle }],
    publicReputation: rng.pick(PUBLIC[arch] ?? ['Keeps to a small circle.']),
    hiddenPersonality: rng.pick(HIDDEN[arch] ?? ['Wants more than this life has given so far.']),
    attributes,
    traits,
    vices,
    secrets: SECRETS[arch] && rng.chance(0.6) ? [{ ...rng.pick(SECRETS[arch]!) }] : [],
    debts: vices.includes('horses') || vices.includes('cards') || vices.includes('dice') ? [{ to: 'A bookmaker', kind: 'money', amount: rng.int(3, 30) * 100 }] : [],
    relationships: [],
    ties: [],
    wealth: Math.round((ladder.rungs[rung]?.salary ?? 3000) * (0.5 + rng.next() * 2)),
    hook: rng.pick(HOOKS[arch] ?? ['Could be useful to somebody who asks the right way.']),
    gameRank: 'civilian' as GameRank,
    tags: ['generated'],
  };
  if (inst.domain === 'political') {
    p.party = opts.institution === 'philadelphia_ward' || opts.institution === 'philadelphia_city' ? 'D' : rng.chance(0.6) ? 'R' : 'D';
    if (opts.institution === 'wildwood_city' || opts.institution === 'crest_borough' || opts.institution === 'atlantic_city') p.party = 'Nonpartisan';
    p.ideology = arch === 'reformer' || arch === 'idealist' ? 'reform' : arch === 'labor-boss' ? 'labor' : arch === 'patrician' ? 'establishment' : 'machine';
    p.electoralStrength = clamp(attributes.charisma * 0.5 + attributes.leadership * 0.3 + rng.int(0, 20));
  }
  if (inst.domain === 'police') {
    const pi = policeInfo(rng, arch, opts.institution);
    p.police = { ...pi };
  }
  if (inst.domain === 'fire') {
    p.fire = {
      role: opts.institution === 'insurance' ? 'adjuster' : opts.institution === 'county_fire' || opts.institution === 'state_fire' ? 'inspector'
        : rung >= ladder.rungs.length - 1 ? 'chief' : rung >= 2 ? 'officer' : ladderId === 'fire_volunteer' ? 'volunteer' : 'firefighter',
      arsonEye: clamp(arch === 'arson-hound' ? 75 + rng.gauss() * 8 : 40 + rng.gauss() * 15),
      signsForCash: arch === 'inspector-for-sale' || (arch === 'fire-hack' && rng.chance(0.3)),
    };
  }
  if (inst.domain === 'legal') {
    p.legal = {
      role: arch === 'mob-lawyer' ? 'mob-lawyer' : arch.endsWith('judge') ? 'judge' : arch.endsWith('prosecutor') ? 'prosecutor' : arch === 'bondsman' ? 'bail-bondsman' : arch === 'clerk' ? 'clerk' : 'defense',
      reachable: clamp(attributes.corruption * 0.7 + attributes.greed * 0.3),
    };
  }
  if (inst.domain === 'street') {
    const spec = opts.specialty ?? (sex === 'F'
      ? rng.weighted<StreetSpecialty>({ bookkeeper: 3, 'numbers-banker': 2, fence: 2, 'club-owner': 1, 'card-sharp': 1, 'smooth-talker': 1 })
      : rng.weighted<StreetSpecialty>({ muscle: 6, boxer: 4, wheelman: 4, 'bookie-runner': 4, 'numbers-kid': 4, 'card-sharp': 2, burglar: 2, safecracker: 1, fixer: 1, 'smooth-talker': 2, shylock: 1, mechanic: 2, forger: 1 }));
    const lp = clamp(attributes.leadership * 0.5 + attributes.charisma * 0.2 + attributes.intrigue * 0.15 + attributes.discipline * 0.15 + rng.gauss() * 8);
    p.street = {
      origin: streetOrigin!, specialty: spec, leadershipPotential: lp,
      groomability: clamp(attributes.loyalty * 0.4 + attributes.discipline * 0.4 + (100 - attributes.ambition) * 0.2 + rng.gauss() * 8),
      record: pickIndex(rng, [4, 3, 2, 1]), currentlyWith: 'none',
      arc: lp >= 70 ? 'Could run a crew by thirty if somebody brings him along.' : lp >= 50 ? 'A solid soldier in the making.' : 'Will do what he is told until he is told the wrong thing.',
    };
    p.gameRank = 'civilian';
    p.ladder = { id: 'street', rung: 0 };
    p.office = sex === 'F' ? 'Woman in the life' : 'Street tough';
  }
  if (inst.domain === 'entertainment') {
    const cat = opts.showbizCategory ?? rng.weighted<ShowbizCategory>(SHOWBIZ_CATS);
    const traj: Trajectory = rng.weighted<Trajectory>({ rising: 4, peaking: 2, fading: 2, comeback: 1 });
    const fame = clamp(traj === 'rising' ? 25 + rng.int(0, 30) : traj === 'peaking' ? 55 + rng.int(0, 35) : 35 + rng.int(0, 35));
    const intersect: MobIntersect[] = [rng.pick(['bookings', 'debt', 'payola', 'protection', 'jukebox', 'blackmail'] as MobIntersect[])];
    const circuit: Circuit[] = [rng.weighted<Circuit>({ Wildwood: 5, Philadelphia: 4, 'Atlantic City': 3, 'New York': 3, Catskills: 1, 'Las Vegas': 1, Hollywood: 1 })];
    p.showbiz = {
      category: cat, circuit, trajectory: traj, fame, peakYear: opts.year + (traj === 'rising' ? rng.int(2, 8) : traj === 'peaking' ? 0 : -rng.int(2, 8)),
      scandalRisk: clamp(25 + traits.length * 5 + vices.length * 12 + rng.int(-10, 10)), mobIntersect: intersect,
      weekFee: Math.round((150 + fame * fame * 0.4) / 50) * 50,
    };
    p.office = cat.replace(/-/g, ' ');
  }
  if (inst.domain === 'civilian') p.civilian = { occupation: rungTitle, usefulness: clamp(30 + rng.gauss() * 15) };
  return p;
}

function pickIndex(rng: Rng, w: number[]): number {
  const total = w.reduce((a, b) => a + b, 0);
  let x = rng.next() * total;
  for (let i = 0; i < w.length; i++) {
    x -= w[i];
    if (x <= 0) return i;
  }
  return w.length - 1;
}

function defaultArchetypes(d: Domain): Partial<Record<Archetype, number>> {
  switch (d) {
    case 'political': return { machine: 40, hack: 25, climber: 20, reformer: 10, idealist: 5 };
    case 'police': return { 'pad-cop': 35, 'straight-cop': 30, careerist: 20, 'brute-cop': 10, crusader: 5 };
    case 'fire': return { 'fire-hero': 45, 'fire-hack': 45, 'inspector-for-sale': 10 };
    case 'legal': return { 'hack-lawyer': 35, 'political-prosecutor': 15, 'fair-judge': 15, 'bought-judge': 15, 'mob-lawyer': 10, 'idealist-lawyer': 10 };
    case 'street': return { brawler: 25, 'earner-kid': 20, 'wild-card': 15, 'quiet-pro': 15, charmer: 10, thinker: 10, 'leader-born': 5 };
    case 'entertainment': return { striver: 40, star: 10, 'has-been': 20, operator: 15, artist: 15 };
    case 'civilian': return { 'small-business': 40, widow: 15, gossip: 15, pillar: 10, professional: 10, 'union-man': 10 };
  }
}

/** Seasonal top-up: how many new people each institution gets per year (see lifecycle.md). */
export const YEARLY_INFLOW: Partial<Record<InstitutionId, number>> = {
  wildwood_pd: 3, north_wildwood_pd: 1, crest_pd: 1, atlantic_city_pd: 4, philadelphia_pd: 4, nj_state_police: 2, fbi_newark: 1,
  wildwood_fd: 2, county_fire: 1, private_bar: 3, cmc_prosecutor: 1, us_attorney_nj: 1, street: 12, showbiz: 10, business: 4, community: 4, union: 2,
};
