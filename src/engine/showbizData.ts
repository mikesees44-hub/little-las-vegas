import type { Ethnicity, Trait } from './types';
import type { ActKind, Manager } from './showbizState';

/**
 * The showbiz bench at the start (all fictional): the acts working the
 * shore in the summer of 1960, and the kids from the island with a voice
 * or a pair of feet. Talent, draw and fame are 0-100; `amb` is how far they
 * mean to go. `ph` is the publicity photo (ui/showbiz/publicity.ts).
 *
 * Talent, pay and chances never depend on anyone's background: the numbers
 * here are each act's own.
 */
export interface BenchSeed {
  k: ActKind;
  g: 'M' | 'F';
  eth: Ethnicity;
  age: number;
  f: string;
  l: string;
  nick?: string;
  /** The group's name or the billing. */
  n?: string;
  tal: number;
  fame: number;
  amb: number;
  by?: Manager;
  ph?: string;
  loc?: 1;
  t?: Trait[];
  /** One line on who they are. */
  who: string;
}

export const BENCH: BenchSeed[] = [
  // The two Black singers first: the painted stage faces s05 and s08 are theirs (faces.ts).
  { k: 'singer', g: 'M', eth: 'Black', age: 22, f: 'Otis', l: 'Greer', tal: 72, fame: 14, amb: 88, ph: 'pb07', t: ['Ambitious', 'Charming'], who: 'A tenor out of Atlantic City\'s Northside who sings like he is late for something.' },
  { k: 'singer', g: 'M', eth: 'Black', age: 31, f: 'Clarence', l: 'Holloway', nick: 'Smooth', tal: 78, fame: 40, amb: 74, ph: 'pb05', t: ['Charming', 'Patient'], who: 'A ballad singer with a following from Baltimore to the Boardwalk.' },
  { k: 'singer', g: 'F', eth: 'Black', age: 29, f: 'Della', l: 'Mabry', tal: 82, fame: 46, amb: 70, by: 'feldstein', ph: 'pb08', t: ['Ambitious', 'Greedy'], who: 'A torch singer the New York columnists keep calling "the next one".' },
  { k: 'singer', g: 'F', eth: 'Black', age: 24, f: 'Ruby', l: 'Toliver', tal: 75, fame: 16, amb: 66, ph: 'pb04', t: ['Pious', 'Patient'], who: 'Raised in a choir loft in Camden; the club owners heard her at a wedding.' },
  { k: 'singer', g: 'F', eth: 'Black', age: 52, f: 'Odessa', l: 'Reed', nick: 'Mother', tal: 86, fame: 36, amb: 30, ph: 'pb09', t: ['Patient', 'Honest'], who: 'Thirty years of blues rooms; the young singers come to watch her work.' },
  { k: 'singer', g: 'M', eth: 'Italian', age: 27, f: 'Johnny', l: 'Valente', tal: 62, fame: 34, amb: 72, t: ['Greedy', 'Charming'], who: 'The Pacific Avenue crooner, a South Philly boy in a white dinner jacket.' },
  { k: 'singer', g: 'M', eth: 'Italian', age: 24, f: 'Nicky', l: 'Sorrentino', tal: 56, fame: 20, amb: 82, by: 'manno', t: ['Ambitious', 'Hot-headed'], who: 'A pompadour and a record nobody bought; Manno\'s people book him.' },
  { k: 'singer', g: 'M', eth: 'Irish', age: 35, f: 'Eddie', l: 'Byrne', tal: 52, fame: 30, amb: 40, by: 'ind', t: ['Drinker', 'Charming'], who: 'Sings "Danny Boy" twice a night at the Irish bars and means it both times.' },
  { k: 'singer', g: 'F', eth: 'Italian', age: 26, f: 'Connie', l: 'Marchetti', tal: 66, fame: 28, amb: 76, ph: 'pg06', t: ['Ambitious', 'Honest'], who: 'A big voice from Vineland, singing standards with a band that is beneath her.' },
  { k: 'singer', g: 'F', eth: 'Jewish', age: 33, f: 'Lorna', l: 'Gold', tal: 72, fame: 50, amb: 48, by: 'ind', ph: 'pg09', t: ['Patient', 'Charming'], who: 'A supper-club torch singer with a record on the Philadelphia stations.' },
  { k: 'group', g: 'M', eth: 'Black', age: 23, f: 'Curtis', l: 'Pettiford', n: 'The Tidewaters', tal: 70, fame: 24, amb: 82, ph: 'pb01', t: ['Ambitious', 'Charming'], who: 'Four voices from the Northside and a lead who writes his own songs.' },
  { k: 'group', g: 'F', eth: 'Black', age: 22, f: 'Juanita', l: 'Dorsey', n: 'The Velvetones', tal: 71, fame: 20, amb: 72, ph: 'pb06', t: ['Honest', 'Ambitious'], who: 'Three girls from Chester with harmonies the radio would love.' },
  { k: 'group', g: 'M', eth: 'Italian', age: 20, f: 'Ray', l: 'Infantino', n: 'The Crestones', tal: 60, fame: 22, amb: 86, by: 'manno', t: ['Gambler', 'Charming'], who: 'Four kids who sang under the boardwalk until a Manno man heard them.' },
  { k: 'group', g: 'M', eth: 'Irish', age: 25, f: 'Kevin', l: 'Devlin', n: 'The Kilkenny Four', tal: 52, fame: 14, amb: 58, t: ['Loyal-to-a-fault'], who: 'A barbershop quartet that learned rock and roll at the Knights of Columbus.' },
  { k: 'comic', g: 'M', eth: 'Jewish', age: 48, f: 'Sid', l: 'Pincus', tal: 70, fame: 46, amb: 38, by: 'ind', t: ['Patient', 'Greedy'], who: 'Twenty summers in the Catskills and the 500 Club; does the wife jokes in his sleep.' },
  { k: 'comic', g: 'M', eth: 'Jewish', age: 30, f: 'Lenny', l: 'Halpern', tal: 66, fame: 18, amb: 86, t: ['Ambitious', 'Gambler'], who: 'A fast young comic who does the material the old men will not.' },
  { k: 'comic', g: 'M', eth: 'Irish', age: 41, f: 'Jimmy', l: 'Doyle', tal: 55, fame: 28, amb: 30, t: ['Drinker', 'Charming'], who: '"The Mayor of the Boardwalk": emcee, comic and the man who knows every bartender.' },
  { k: 'comic', g: 'M', eth: 'Black', age: 50, f: 'Percy', l: 'Speight', tal: 74, fame: 32, amb: 58, ph: 'pb12', t: ['Patient', 'Charming'], who: 'Worked every Black room from Kansas City to Club Harlem; the white rooms are just finding him.' },
  { k: 'band', g: 'M', eth: 'Italian', age: 45, f: 'Tony', l: 'Cappelli', n: 'Tony Cappelli and His Orchestra', tal: 60, fame: 40, amb: 34, t: ['Patient'], who: 'Fourteen pieces, the wedding circuit and the Convention Hall on the Fourth.' },
  { k: 'band', g: 'M', eth: 'Black', age: 47, f: 'Earl', l: 'Whitfield', n: 'The Earl Whitfield Quintet', tal: 82, fame: 34, amb: 50, ph: 'pb03', t: ['Patient', 'Honest'], who: 'Jazz the after-hours crowd drives forty miles for.' },
  { k: 'band', g: 'M', eth: 'Jewish', age: 52, f: 'Benny', l: 'Mintz', n: 'Benny Mintz and the Riviera Orchestra', tal: 58, fame: 44, amb: 24, by: 'feldstein', t: ['Greedy'], who: 'The society band for every bar mitzvah from Margate to the Main Line.' },
  { k: 'dancer', g: 'F', eth: 'Irish', age: 23, f: 'Kitty', l: 'Callahan', tal: 66, fame: 14, amb: 74, ph: 'pg04', loc: 1, t: ['Ambitious', 'Honest'], who: 'Learned to tap at the Flanagan school on the island; wants Broadway.' },
  { k: 'dancer', g: 'F', eth: 'Black', age: 26, f: 'Hattie', l: 'Bynum', tal: 77, fame: 22, amb: 70, ph: 'pb11', t: ['Charming', 'Patient'], who: 'A tap dancer who learned from her uncles and outdances both of them.' },
  { k: 'dancer', g: 'F', eth: 'Italian', age: 19, f: 'Rosemarie', l: 'Testa', tal: 60, fame: 4, amb: 82, ph: 'pw07', loc: 1, t: ['Ambitious'], who: 'A Wildwood kid in the chorus at the Riptide, nineteen and in a hurry.' },
  { k: 'dancer', g: 'M', eth: 'Irish', age: 28, f: 'Danny', l: 'Regan', tal: 63, fame: 18, amb: 55, t: ['Charming', 'Gambler'], who: 'A hoofer with a good smile and a bad knee.' },
  { k: 'actor', g: 'M', eth: 'Italian', age: 32, f: 'Vincent', l: 'Lo Bianco', tal: 66, fame: 24, amb: 86, t: ['Greedy', 'Ambitious'], who: 'Summer stock at the Cape May playhouse and a screen test he talks about too much.' },
  { k: 'actor', g: 'F', eth: 'Italian', age: 27, f: 'Gloria', l: 'Fontana', tal: 70, fame: 30, amb: 90, ph: 'pg01', t: ['Ambitious', 'Charming'], who: 'Two television parts in New York and a hunger for a picture.' },
  { k: 'actor', g: 'M', eth: 'Black', age: 34, f: 'Theodore', l: 'Overton', nick: 'Teddy', tal: 76, fame: 20, amb: 76, ph: 'pb10', t: ['Patient', 'Honest'], who: 'A stage actor from the Philadelphia companies, waiting for the parts to be written.' },
  // The island's own kids with talent (all adults).
  { k: 'singer', g: 'M', eth: 'Italian', age: 18, f: 'Frankie', l: 'Pirone', tal: 63, fame: 3, amb: 90, loc: 1, t: ['Ambitious', 'Charming'], who: 'Sings at the Italian-American club on Saturdays; the girls come to watch.' },
  { k: 'singer', g: 'F', eth: 'Irish', age: 18, f: 'Bridget', l: 'Malone', tal: 58, fame: 2, amb: 70, ph: 'pw01', loc: 1, t: ['Patient'], who: 'Just out of Wildwood Catholic, singing in the choir and at the Shamrock on Fridays.' },
  { k: 'singer', g: 'F', eth: 'Irish', age: 21, f: 'Peggy', l: 'Shea', tal: 60, fame: 10, amb: 62, ph: 'pw03', loc: 1, t: ['Charming'], who: 'A waitress at the Surf who sings when the band takes a break.' },
];

/** Publicity photos (the owner's sheets, cropped to 8x10s): who each can be. `b`: the sepia sheet, for Black performers only. */
export const PHOTOS: { k: string; m: boolean; age: [number, number]; b?: 1; glam?: 1 }[] = [
  { k: 'pb01', m: true, age: [19, 32], b: 1 }, { k: 'pb02', m: false, age: [21, 36], b: 1 }, { k: 'pb03', m: true, age: [40, 65], b: 1 },
  { k: 'pb04', m: false, age: [18, 30], b: 1 }, { k: 'pb05', m: true, age: [26, 45], b: 1 }, { k: 'pb06', m: false, age: [18, 28], b: 1 },
  { k: 'pb07', m: true, age: [18, 30], b: 1 }, { k: 'pb08', m: false, age: [24, 40], b: 1 }, { k: 'pb09', m: false, age: [40, 65], b: 1 },
  { k: 'pb10', m: true, age: [24, 42], b: 1 }, { k: 'pb11', m: false, age: [21, 38], b: 1 }, { k: 'pb12', m: true, age: [42, 68], b: 1 },
  { k: 'pw09', m: false, age: [18, 32], b: 1 },
  { k: 'pg01', m: false, age: [24, 38], glam: 1 }, { k: 'pg03', m: false, age: [24, 38], glam: 1 }, { k: 'pg04', m: false, age: [19, 30], glam: 1 },
  { k: 'pg05', m: false, age: [38, 55], glam: 1 }, { k: 'pg06', m: false, age: [23, 38], glam: 1 }, { k: 'pg07', m: false, age: [21, 35], glam: 1 },
  { k: 'pg08', m: false, age: [27, 42], glam: 1 }, { k: 'pg09', m: false, age: [27, 42], glam: 1 }, { k: 'pg10', m: false, age: [48, 65], glam: 1 },
  { k: 'pw01', m: false, age: [18, 30] }, { k: 'pw03', m: false, age: [18, 26] }, { k: 'pw04', m: false, age: [19, 28] }, { k: 'pw05', m: false, age: [27, 40] },
  { k: 'pw06', m: false, age: [21, 32] }, { k: 'pw07', m: false, age: [18, 28] }, { k: 'pw08', m: false, age: [19, 30] }, { k: 'pw10', m: false, age: [27, 40] },
  { k: 'pw11', m: false, age: [21, 32] }, { k: 'pw12', m: false, age: [44, 60] }, { k: 'pw13', m: false, age: [27, 40] }, { k: 'pw14', m: false, age: [19, 30] },
  { k: 'pw15', m: false, age: [19, 30] }, { k: 'pw16', m: false, age: [19, 30] }, { k: 'pw17', m: false, age: [54, 72] }, { k: 'pw18', m: false, age: [40, 55] },
  { k: 'pw19', m: false, age: [24, 38] }, { k: 'pw20', m: false, age: [40, 55] }, { k: 'pw21', m: false, age: [19, 30] }, { k: 'pw22', m: false, age: [62, 82] },
  { k: 'pw23', m: false, age: [54, 72] }, { k: 'pw24', m: false, age: [48, 66] },
];

export const GROUP_A = ['The Sea', 'The Moon', 'The Star', 'The Sand', 'The Silver', 'The Velvet', 'The Harbor', 'The Gull', 'The Dune', 'The Satin', 'The Coral', 'The Twilight'];
export const GROUP_B = ['tones', 'lites', 'larks', 'dells', 'chords', 'tunes', 'jays', 'beats', 'notes', 'rays'];

export const SONG_A = ['Boardwalk', 'Summer', 'Moonlight', 'Tidewater', 'Lonely', 'Sandcastle', 'Last Dance', 'Ferris Wheel', 'Saltwater', 'Neon', 'Starlight', 'Seashell', 'Little', 'Cherry'];
export const SONG_B = ['Moon', 'Girl', 'Heart', 'Kiss', 'Serenade', 'Blues', 'Promise', 'Shuffle', 'Rendezvous', 'Lullaby', 'Darling', 'Tears', 'Romance', 'Stroll'];
export const COMEDY_LP = ['Live at the Riptide', 'Don\'t Tell My Wife', 'A Funny Thing on the Boardwalk', 'Ringside Laughs', 'The Late Show'];

export const LABEL_NAMES: Record<'Wildwood' | 'Philadelphia', string[]> = {
  Wildwood: ['Seabright Records', 'Boardwalk Records', 'Sea Breeze Records'],
  Philadelphia: ['Quaker Row Records', 'Schuylkill Records', 'Broad Street Records'],
};

export const MANAGER_LABEL: Record<string, string> = {
  p: 'You', ind: 'An independent agent', manno: 'The Manno office', feldstein: 'The Feldstein office', kessler: 'The Kessler office', philly: 'A Philadelphia office', law: 'Nobody',
};
