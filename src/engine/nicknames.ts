import { hashSeed } from './rng';
import { NICKNAMES } from './names';

/**
 * Where a street name came from: one line each. Every nickname the game
 * hands out has an origin, so a boss who picks (or is given) one in the
 * character creator gets the story with it. Non-explicit; violence implied.
 */
export const NICKNAME_ORIGINS: Record<string, string> = {
  'The Mule': 'Carried a full case of Canadian whisky up four flights on a bet, and never once put it down.',
  Slim: 'Never weighed more than a wet newspaper, no matter how much gravy his mother poured.',
  'Fat Patsy': 'There was already a Patsy on the corner. You were the bigger one.',
  'Little Sal': 'Named after an uncle who stood six-four. You did not.',
  'The Professor': 'Read the racing form like scripture and could quote odds from 1948.',
  Cookie: 'Worked the counter at Mack\'s bakery as a kid and ate half the profits.',
  Bobo: 'Your baby sister could not say "Roberto." The name stuck for life.',
  'Sunny Jim': 'Smiled through a grand jury once. The papers loved it.',
  Butch: 'Cut your own hair at nine with your father\'s razor. Your mother cried.',
  Southpaw: 'Fought left-handed at the Convention Hall smokers and never lost a purse.',
  'The Hat': 'Nobody has seen the top of your head since Truman.',
  'Big Ears': 'Heard a cop\'s whisper across a crowded diner. Twice.',
  Specs: 'Wore glasses at twelve, and the kid who laughed at them stopped laughing.',
  'The Shoe': 'Shined shoes on the boardwalk and learned every secret worth knowing from the knees down.',
  Blackie: 'Came out of the coal yards in Camden with soot that never quite washed off.',
  Red: 'The hair, at first. Later it was the temper.',
  Whitey: 'Went grey at twenty-five after a night in a cold Atlantic City basement.',
  'Kid Gloves': 'Handled the touchy cases. Nobody ever saw you raise your voice.',
  'Patsy Pockets': 'Always had a roll in each pocket, and knew to the dollar what was in both.',
  'The Barber': 'Your first legitimate job, and still where you hear the best news.',
  Knuckles: 'Cracked them before every card game. The table learned to fold.',
  'The Undertaker': 'Wore black to every meeting, even in August, even at the shore.',
  'Tommy Guns': 'Carried a trombone case to band practice. Nobody believed it was a trombone.',
  Spats: 'The last man in Wildwood who still wore them, and wore them well.',
  Cigars: 'Never without one, never seen to light it.',
  'The Saint': 'Lit a candle at St. Ann\'s every Sunday, whatever you did on Saturday.',
  Elbows: 'Cleared a path through the Fourth of July crowd on the boardwalk like Moses at the sea.',
  Bootsie: 'Your grandmother\'s word for you. You let only her use it, until everyone did.',
  'The Ferret': 'Found a missing ledger inside a church organ.',
  Moose: 'Lifted the back end of a Studebaker off a boy on Pacific Avenue.',
  'Sally Boy': 'The youngest Salvatore in a family of five of them.',
  'Jimmy Brass': 'Polished the rail at your uncle\'s bar every night for six years.',
  'The Fox': 'Walked out of a raid on Rio Grande Avenue through the kitchen, with the cash.',
  Mousey: 'Quiet enough that men forgot you were in the room. That was the point.',
  'Pretty Boy': 'A girl at the Starlight said it once, loudly. It never went away.',
  Dutch: 'Your mother was from Cape May Point and nobody could pronounce her maiden name.',
  'The Ox': 'Pulled a rowboat full of men against the tide off Hereford Inlet.',
  Stitches: 'Thirty-one of them after a disagreement on the docks. You won the disagreement.',
  Tippy: 'Tipped every waitress a dollar when coffee was a nickel.',
  Chubby: 'A baby picture your aunt showed the whole wedding.',
  'The Greek': 'Ran a dice game in the back of a Greek diner for three summers.',
  Shorty: 'Five-foot-four in lifts. Taller in a room.',
  'Frankie Ice': 'Sold ice off a truck on the island before anybody had a Frigidaire.',
  Bats: 'Kept a Louisville Slugger behind the arcade counter. It was not for baseball.',
  Buckles: 'Won a belt at the Golden Gloves and wore the buckle every day after.',
  'The Count': 'Counted a night\'s numbers take in your head, to the penny, faster than the adding machine.',
  Gimpy: 'Took a bad fall off the Hunt\'s Pier coaster scaffold as a kid. Never slowed down.',
  Hooks: 'Gaffed fish on the party boats out of Otten\'s Harbor every summer as a boy.',
  Peanuts: 'Sold them at the ballpark in Shibe Park, and kept the change.',
  Ritzy: 'Showed up to a Wildwood clambake in a dinner jacket.',
  'The Tailor': 'Can tell what a man earns, and what he hides, from the cut of his suit.',
  Trigger: 'Quick with answers, quicker with decisions.',
  Cappy: 'Ran a charter boat out of the harbor before you ran anything else.',
  'The Deacon': 'Passed the collection plate at St. Ann\'s and never took a cent from it.',
  Doc: 'Stitched up half the corner in your mother\'s kitchen. Two years of Temple pre-med.',
  Fingers: 'Played piano at the Riptide, and could palm a card without looking.',
  Slick: 'Your hair, your shoes, and the way you talked a judge into a continuance.',
  Mumbles: 'Spoke so softly the wiretaps never got a word.',
  'The Clam': 'Said nothing for three days in a Philadelphia station house.',
  'Two Times': 'Says everything twice. Says everything twice.',
  Saltwater: 'Born in a rowboat, or so your father told it.',
  Boardwalk: 'Walked all thirty-eight blocks of it every night like a beat cop.',
  'The Pier': 'Your first job was sweeping Marine Pier at dawn.',
  Taffy: 'Pulled salt-water taffy in a shop window at eleven years old.',
  Sandbar: 'Got a rumrunner\'s boat off a sandbar at low tide, cargo intact.',
  Tides: 'Always knew when the cops were coming in and going out.',
  Gull: 'Never missed a free meal on the boardwalk.',
  'The Ferris': 'Ran the wheel at the Casino Pier for two summers and saw everything from the top.',
  Neon: 'Hung the signs on Pacific Avenue, and still knows who pays for the electric.',
  Jukebox: 'Placed the machines in every bar from Rio Grande to Cresse Avenue.',
};

/** Nicknames for a woman who runs things (period-appropriate, never demeaning). */
export const FEMALE_NICKNAMES: Record<string, string> = {
  Queenie: 'Ran the bingo hall at the parish like a royal court, and the parish let her.',
  Duchess: 'Wore white gloves to a sit-down with Philadelphia. Nobody laughed twice.',
  'The Widow': 'Wore black for a year for a man the papers said nothing about.',
  'Lady Luck': 'Picked three winners at Garden State Park on her first visit.',
  Kitty: 'Kept the kitty for her father\'s card game from the age of ten.',
  'Sister Mary': 'Two years in the convent before she came home to keep the books.',
  Babe: 'Hit a ball over the fence at the Wildwood Little League field. In a skirt.',
  'The Bookkeeper': 'Knew where every dollar on the island slept at night.',
};

export function nicknameOrigin(n: string | undefined): string | undefined {
  if (!n) return undefined;
  return NICKNAME_ORIGINS[n] ?? FEMALE_NICKNAMES[n];
}

/** A deterministic suggestion from a salt (the creator's "suggest" button). */
export function suggestNickname(salt: string, female: boolean): { nickname: string; origin: string } {
  const pool = female ? Object.keys(FEMALE_NICKNAMES) : NICKNAMES;
  const nickname = pool[hashSeed(`nick:${salt}`) % pool.length];
  return { nickname, origin: nicknameOrigin(nickname) ?? '' };
}
