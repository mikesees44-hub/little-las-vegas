/**
 * The papers' own words: mastheads, bylines, the Spout Off grumbles and the
 * false rumors, the rooms of the night, the weather, the help wanted. Every
 * name here is invented (near-miss shore names, no real living people, no
 * real performer); the 1960s film titles are real titles only.
 *
 * Nothing in this file is a fact about the game: paper.ts decides what is
 * printed from the state, and only uses these lines for voice and filler.
 */

export const DAILY = 'The Wildwood Daily Tide';
export const WEEKLY = 'The Five Mile Beach Weekly Leader';
export const DAILY_SHORT = 'Daily Tide';
export const WEEKLY_SHORT = 'Weekly Leader';

export const DAILY_MOTTO = 'All the news from the Inlet to the Crest';
export const WEEKLY_MOTTO = 'Serving Five Mile Beach every Thursday';

/** Fictional bylines (by beat). */
export const BYLINES: Record<string, string[]> = {
  front: ['By Walt Brennecke, Tide Staff', 'By Dorothy Kuhl, Tide Staff', 'By Gus Pfeiffer, City Desk'],
  blotter: ['Compiled by Ed Szalinski from police and court records'],
  deeds: ['From the County Clerk\'s office, Cape May Court House'],
  business: ['By Marty Ochs, Business Editor'],
  society: ['By Mrs. Evelyn Tate, Society Editor'],
  sports: ['By "Red" Dunleavy, Sports Editor'],
  ent: ['By Lenny Fass, Nightlife Columnist'],
  feature: ['By Harold Venn, Leader Staff Writer', 'By Ruth Abernathy, Leader Correspondent'],
  editorial: ['From the Editor\'s Desk'],
};

/** Spout Off: pure small-town grumbling. `m` limits to months (absent: any). */
export const GRUMBLES: { t: string; m?: number[] }[] = [
  { t: 'To the parking meter man on Pacific Avenue: I was gone four minutes. Four. Have a heart.' },
  { t: 'Can somebody tell the tourists the Boardwalk is not a speedway for bicycles after 11 A.M.?', m: [6, 7, 8, 9] },
  { t: 'The noise from the clubs on Pacific Avenue at two in the morning is a disgrace. Some of us work.', m: [6, 7, 8] },
  { t: 'The gulls on the Boardwalk are bigger than my grandson and twice as rude.', m: [5, 6, 7, 8, 9] },
  { t: 'Whoever keeps leaving sand in the phone booth on Spencer Avenue: the beach is that way.', m: [6, 7, 8] },
  { t: 'Thirty-five cents for a soft custard. My father would turn over in his grave.' },
  { t: 'Philadelphia drivers think a stop sign is a suggestion. It is the law, mister.', m: [5, 6, 7, 8, 9] },
  { t: 'The tram car nearly took my foot off at Schellenger. Watch the tram car, please, yourself included.', m: [6, 7, 8] },
  { t: 'Rock and roll on every radio on the beach. Whatever happened to a nice ballad?' },
  { t: 'To the teenagers in the hot rods on New Jersey Avenue: we can hear your mufflers in Cape May.' },
  { t: 'The potholes on Rio Grande Avenue have potholes. Where does our tax money go?' },
  { t: 'Not one stoplight works right on the Boulevard. Not one. I counted.' },
  { t: 'In the winter you could shoot a cannon down the Boardwalk and not hit a soul. Somebody open a luncheonette.', m: [11, 12, 1, 2, 3] },
  { t: 'Shovel your sidewalk, Atlantic Avenue. The rest of us did.', m: [12, 1, 2] },
  { t: 'Why do the motels put their signs up so bright? I can read the paper in bed at midnight by the Starlite.', m: [5, 6, 7, 8, 9] },
  { t: 'Bring back the old Boardwalk boards. These new ones give splinters to everybody\'s children.' },
  { t: 'Somebody at City Hall should count the cars on Ocean Avenue on a Saturday. Then build a lot.', m: [6, 7, 8] },
  { t: 'Labor Day comes and the whole island locks up like a bank. See you in May, I suppose.', m: [9] },
  { t: 'The fishing was better when I was a boy, and the bait was cheaper, too.' },
  { t: 'To the lady with the transistor radio on the 26th Street beach: some of us came for the waves.', m: [6, 7, 8] },
  { t: 'Can the church bells at St. Ann\'s and the church bells across the street at least agree on the time?' },
  { t: 'Two dollars to park for a day on the beach block. In 1960! What next, a toll on the bridge to come home?' },
  { t: 'The bus from Philadelphia unloads at the worst corner in town. Every Friday. Every single Friday.', m: [6, 7, 8] },
  { t: 'Spring cleaning on the Boardwalk: who is going to paint those railings before Memorial Day?', m: [3, 4, 5] },
  { t: 'Thank you to the young man who carried my groceries up Andrews Avenue. They don\'t make them like you anymore.' },
  { t: 'The jukebox at the luncheonette plays the same three records. I know every word now, against my will.' },
];

/** False rumors: never true in the game. `{S}` a local surname, `{H}` the boss's house name. */
export const FALSE_RUMORS: string[] = [
  'I have it on good authority the Convention Hall is being sold to a Las Vegas outfit and turned into a casino.',
  'They say a Hollywood studio is coming in July to shoot a picture on the Boardwalk. My cousin is going to be in it.',
  'Word is the county is putting a toll booth on the Rio Grande bridge. For us! The year-rounders!',
  'The {S} boy is supposedly joining the Navy to get away from a girl in North Wildwood. Ask anyone.',
  'Somebody told me the {H} family is selling everything and moving to Florida. I\'ll believe it when I see the truck.',
  'They\'re putting a monorail down the middle of the Boardwalk. You heard it here first.',
  'My neighbor swears there\'s a Russian submarine off the Crest. He saw the periscope. He also saw a mermaid in 1952.',
  'The new curate at St. Ann\'s is really a G-man. Look at his shoes.',
  'The {S} sisters bought a motel with money they found in the wall of their grandmother\'s house. That\'s the story going around.',
  'Big shot from Atlantic City is supposedly buying up every pier on the island. Don\'t sell, folks.',
  'The {H} people are supposedly putting up a twenty-story hotel on the beach block. Twenty stories, on sand?',
  'I heard the state is closing the beaches on Sundays. Over my dead body.',
];

/** True-rumor wordings by living-layer fact kind (anonymized: `{L}` a last name, `{P}` a place). */
export const FACT_RUMORS: Record<string, string[]> = {
  affair: ['Mrs. {L} might want to ask where her husband goes on Tuesday nights. Half the block already knows.', 'A certain {L} has been seen getting out of the wrong car on Atlantic Avenue. Not his wife\'s car, either.'],
  skim: ['The register at {P} is lighter than it should be, and it isn\'t the summer kid.', 'Somebody behind the counter at {P} is doing better than the owner. Count your drawer, friend.'],
  theft: ['Lock your doors, even on the island. The {L}s found out the hard way.'],
  separated: ['Why is Mr. {L} sleeping at his brother\'s house? Asking for the whole street.'],
  expecting: ['Congratulations are in order for the {L}s, a little early maybe. Mum\'s the word.'],
  struggling: ['{P} had three customers on a Saturday. Somebody should tell the owner about the bank.'],
  grudge: ['There is bad blood between two families on the {L} block, and it\'s going to boil over by August.'],
  default: ['Somebody owes the {L} family money and is crossing the street to avoid them.'],
};

/** The rooms of the night (the town's, not the player's). `min`: the season curve they open at. */
export interface Room {
  id: string;
  name: string;
  style: 'lounge' | 'rock' | 'supper' | 'ballroom' | 'revue' | 'pier' | 'hall' | 'movie';
  cats: string[];
  times: string;
  cover: string;
  min: number;
}

export const ROOMS: Room[] = [
  { id: 'riptide', name: 'The Riptide Lounge', style: 'lounge', cats: ['doo-wop', 'lounge-singer'], times: 'Nightly 9, 11 & 1', cover: '$1 cover', min: 0.04 },
  { id: 'hurricane', name: 'The Hurricane Room', style: 'rock', cats: ['rock-and-roll', 'doo-wop'], times: 'Shows 10 P.M. till closing', cover: '$1.50 cover', min: 0.45 },
  { id: 'rainbow', name: 'The Rainbow Room', style: 'lounge', cats: ['lounge-singer', 'jazz'], times: 'Two shows nightly, 9:30 & 12', cover: 'Two-drink minimum', min: 0.35 },
  { id: 'stardust', name: 'The Stardust Ballroom', style: 'ballroom', cats: ['bandleader', 'dancer'], times: 'Dancing 9 till 1', cover: '$1.25 admission', min: 0.5 },
  { id: 'paree', name: 'Club Paree', style: 'revue', cats: ['comic', 'dancer', 'lounge-singer'], times: 'Revue nightly at 10 & 12:30', cover: '$2 cover', min: 0.3 },
  { id: 'bolero', name: 'The Bolero Supper Club', style: 'supper', cats: ['lounge-singer', 'comic', 'bandleader'], times: 'Dinner from 6; shows 9 & 11:30', cover: 'Dinner show $4.50', min: 0 },
  { id: 'surf', name: 'The Surf Club', style: 'rock', cats: ['rock-and-roll', 'dj'], times: 'Teen dance Sat. 8 P.M.; nightly 10', cover: '75 cents', min: 0.55 },
  { id: 'marine', name: 'The Marine Pier Ballroom', style: 'pier', cats: ['bandleader', 'dancer', 'rock-and-roll'], times: 'Dancing nightly 8:30', cover: '$1 at the pier gate', min: 0.6 },
];

export const MOVIE_HOUSES = ['The Shore Theatre', 'The Strand on the Boardwalk', 'The Starlite Drive-In, Rio Grande'];

/** Real 1960s film titles by the year they were playing (titles only). */
export const FILMS: Record<number, string[]> = {
  1960: ['Psycho', 'The Apartment', 'Ocean\'s 11', 'The Magnificent Seven', 'Elmer Gantry', 'Pollyanna', 'The Time Machine', 'Swiss Family Robinson', 'House of Usher', 'Inherit the Wind', 'The Alamo', 'Spartacus', 'Ben-Hur', 'Please Don\'t Eat the Daisies'],
  1961: ['The Guns of Navarone', 'Splendor in the Grass', 'The Parent Trap', 'Breakfast at Tiffany\'s', 'The Hustler', 'West Side Story', 'One-Eyed Jacks', 'The Absent-Minded Professor', 'El Cid', 'Where the Boys Are'],
  1962: ['The Music Man', 'The Longest Day', 'Lawrence of Arabia', 'To Kill a Mockingbird', 'The Man Who Shot Liberty Valance', 'Mutiny on the Bounty', 'Cape Fear', 'Gypsy'],
  1963: ['The Birds', 'Cleopatra', 'The Great Escape', 'Charade', 'How the West Was Won', 'It\'s a Mad, Mad, Mad, Mad World', 'Bye Bye Birdie', 'Dr. No'],
  1964: ['Goldfinger', 'Mary Poppins', 'A Hard Day\'s Night', 'Dr. Strangelove', 'My Fair Lady', 'The Pink Panther', 'Zorba the Greek'],
  1965: ['The Sound of Music', 'Thunderball', 'Doctor Zhivago', 'The Great Race', 'Cat Ballou', 'Beach Blanket Bingo'],
};

/** Fictional house bands and opening acts, by style. */
export const OPENERS: Record<string, string[]> = {
  lounge: ['the Teddy Marlo Trio', 'Vic Amato at the piano', 'the Four Fathoms', 'Dolores Kaye, songstress'],
  rock: ['Johnny Starr & the Comets', 'the Del-Tones', 'the Boardwalk Rockers', 'Ricky Vale & the Vibrations', 'the Twistin\' Tornados'],
  supper: ['the Sal Lentini Orchestra', 'the Bolero Dancers', 'Phil Darrow, the Velvet Voice'],
  ballroom: ['the Mel Ross Orchestra', 'Bobby Dee and his Big Band', 'the Starlighters'],
  revue: ['the Paree Lovelies', 'Joey Banks, comic', 'Mimi LaRue and her Fans'],
  pier: ['the Hal Sterling Band', 'the Pier Cats', 'the Ocean Aires'],
  hall: ['the Convention Hall Pops'],
  movie: [],
};

export const RAVES: Record<string, string[]> = {
  'doo-wop': ['Harmonies so tight you could bounce a dime off them.', 'The falsetto on the closer had the whole room on its feet.'],
  'rock-and-roll': ['Loud, fast and gone by midnight; the kids wouldn\'t let them off the stage.', 'Your correspondent\'s ears are still ringing. Recommended.'],
  'lounge-singer': ['Smooth as a Manhattan and twice as strong.', 'A voice for the last drink of the night. Bring someone.'],
  jazz: ['Cool, late and worth staying up for.', 'The quiet ones in the back knew what they were hearing.'],
  comic: ['Forty minutes and not a dry eye at ringside.', 'The material is a little blue for the early show. The late show loved it.'],
  bandleader: ['A floor full of dancers from the first downbeat.', 'Sixteen pieces and every one of them swinging.'],
  dancer: ['Legs, sequins and a finale that stops traffic on Pacific Avenue.', 'The twist contest alone is worth the cover.'],
  dj: ['The records spin, the kids dance, the parents wait outside in the Buick.'],
  default: ['A good night out, and the drinks are honest.'],
};

/** Help wanted and rooms to let (filler, by season). */
export const HELP_WANTED: { t: string; m?: number[] }[] = [
  { t: 'COUNTERMAN wanted, Boardwalk luncheonette. Experienced. Apply in person mornings.', m: [5, 6, 7, 8] },
  { t: 'CHAMBERMAIDS, motel on Ocean Ave. Room and board for the season. Reliable girls only.', m: [5, 6, 7] },
  { t: 'LIFEGUARDS: Beach Patrol tryouts Saturday 8 A.M., 26th St. beach. Must swim 500 yds.', m: [5, 6] },
  { t: 'SHORT-ORDER COOK, nights. Good pay for a good man. Pacific Ave.', m: [6, 7, 8] },
  { t: 'BARKER for amusement pier. Loud voice, clean shirt. See Mr. Dutton at the pier office.', m: [5, 6, 7] },
  { t: 'BOOKKEEPER, part-time, year round. Hotel. Write Box 41, this paper.' },
  { t: 'FURNACE MAN, winter months, apartment house. Inquire at the Tide office.', m: [10, 11, 12, 1, 2] },
  { t: 'CLAM BOAT deckhand, Otten\'s Harbor. Early mornings. Strong back.', m: [3, 4, 5, 9, 10] },
  { t: 'CARPENTERS and laborers for spring Boardwalk repairs. Union scale.', m: [2, 3, 4] },
];

export const ROOMS_TO_LET: { t: string; m?: number[] }[] = [
  { t: 'ROOMS, beach block, weekly or season. Clean, cool, near the trams. Mrs. Haldane, Cedar Ave.', m: [5, 6, 7, 8] },
  { t: 'EFFICIENCY APT., 2 blocks to beach, kitchenette, $35 wk. Families welcome.', m: [5, 6, 7, 8] },
  { t: 'WINTER RENTAL, furnished bungalow, oil heat, $45 mo. Quiet street.', m: [9, 10, 11, 12, 1, 2, 3] },
  { t: 'SLEEPING ROOM for working gentleman, year round, $8 wk. No cooking.' },
  { t: 'APARTMENT over store, Pacific Ave., 3 rms. Season or year. Inquire within.' },
];

/** Local sport (fictional teams, horses and fighters). */
export const TEAMS = ['the Five Mile Beach Mariners', 'the Wildwood Catholic Crusaders', 'the Rio Grande Clippers', 'the Crest Anglers'];
export const HORSES = ['Sea Bright Lady', 'Pacific Bluff', 'Jetty Jim', 'Captain Otten', 'Salt Air', 'Midnight Tram', 'Lucky Inlet', 'Cedar Kid', 'Boardwalk Belle', 'Two Mile Run', 'Sandpiper', 'Neon Sign'];
export const FIGHTERS = ['Tommy Kuzak of Camden', 'Lou "the Clam" Ferrante', 'Ray Dupree of Atlantic City', 'Mickey Grogan of Gloucester', 'Sal Benedetto of Vineland', 'Eddie Kwasniewski of Trenton'];

/** The weather: highs by month (°F, the island's averages). */
export const HIGHS = [40, 42, 49, 58, 68, 77, 82, 81, 75, 65, 55, 45];
export const SKIES = ['Fair and sunny', 'Partly cloudy', 'Hazy, warm', 'Fog early, clearing', 'Showers likely', 'Breezy and clear', 'Overcast, a chance of rain', 'Thunderstorms in the afternoon'];
export const WINTER_SKIES = ['Raw and gray', 'Clear and cold', 'Northeast wind, flurries possible', 'Sleet by evening', 'Sunny, a cold wind off the ocean', 'Overcast, damp'];
