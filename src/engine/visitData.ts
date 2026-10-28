import { CITIES_BY_ID, type City } from './cities';
import { packageForTown } from '../worldpack/cities';
import type { CityVerb } from './travelState';
import type { RivalId } from './types';

/**
 * The cities as places to BE (visit.ts): where you go in Philadelphia,
 * Atlantic City, New York, Cape May and Ocean City, and who you see there.
 *
 * Naming rules: every person is fictional. Places that are long gone keep
 * their real names (the 500 Club, the Latin Casino, the Stork Club, the
 * Traymore, Wanamaker's); businesses that still operate get a near-miss
 * name; everything else is invented. A town with a city package (Cape May)
 * draws its places from the package; any other map city gets a generic
 * scene built from its row in cities.ts.
 */

export type PlaceKind = 'family' | 'commission' | 'club' | 'bank' | 'fence' | 'politician' | 'shop' | 'hideout' | 'gym' | 'hotel' | 'restaurant';

export interface CityPlace {
  id: string;
  name: string;
  kind: PlaceKind;
  text: string;
  verbs: CityVerb[];
  /** The person you see there (fictional). */
  contact?: string;
  /** What he is. */
  role?: string;
  /** The game's rival outfit this place belongs to (its opinion moves). */
  rival?: RivalId;
}

export interface CityScene {
  cityId: string;
  name: string;
  /** "Philly", "AC": how the boss says it ("You're in Philly"). */
  short: string;
  blurb: string;
  places: CityPlace[];
  /** Where the boss sleeps. */
  hotel: string;
  /** A night's room and meals, 1960 dollars. */
  nightly: number;
}

/** What each kind of place offers by default. */
export const KIND_VERBS: Record<PlaceKind, CityVerb[]> = {
  family: ['sitdown', 'deal'],
  commission: ['sitdown'],
  club: ['night', 'recruit'],
  bank: ['launder'],
  fence: ['deal'],
  politician: ['deal'],
  shop: ['shop'],
  hideout: ['hideout'],
  gym: ['recruit'],
  hotel: ['hideout', 'night'],
  restaurant: ['sitdown', 'night'],
};

export const KIND_LABEL: Record<PlaceKind, string> = {
  family: 'The family', commission: 'The Commission', club: 'Nightclub', bank: 'Bank', fence: 'Fence', politician: 'Politician',
  shop: 'Shopping', hideout: 'Hideout', gym: 'Gym & corner', hotel: 'Hotel', restaurant: 'Restaurant',
};

const P = (id: string, kind: PlaceKind, name: string, text: string, extra: Partial<CityPlace> = {}): CityPlace => ({ id, kind, name, text, verbs: KIND_VERBS[kind], ...extra });

const SCENES: CityScene[] = [
  {
    cityId: 'philadelphia', name: 'Philadelphia', short: 'Philly', hotel: 'a room at the Bellevue-Stratford', nightly: 30,
    blurb: 'Two hours up the Pike. The old man\'s city: no narcotics, no noise, and everybody notices who comes to see him.',
    places: [
      P('ph-ninth', 'family', 'A social club on Ninth Street', 'Espresso, card tables and the old man\'s people. You came on your own: that is noticed.', { contact: 'Salvatore "Sal the Bag" Moretti', role: 'South Jersey capo', rival: 'philly' }),
      P('ph-table', 'commission', 'The back room at the Vittorio Café', 'Where Philadelphia\'s administration sits when it has to sit. Opera on the phonograph so nobody hears.', { contact: 'Ottavio "Tavi" Bellanca', role: 'the old man\'s consigliere' }),
      P('ph-latin', 'club', 'The Latin Casino', 'Walnut Street\'s supper club: a headliner, a chorus line, and every booking agent on the East Coast at the bar.', { contact: 'Morty Glickstein', role: 'the room\'s booker' }),
      P('ph-bank', 'bank', 'Passyunk Savings & Loan', 'A neighborhood thrift with a back office that takes cash in paper bags and gives back cashier\'s checks.', { contact: 'Mr. Albert Coffey', role: 'branch manager' }),
      P('ph-fence', 'fence', 'Dock Street produce stalls', 'Bananas out front; behind the crates, anything that came off a truck in the last week.', { contact: 'Little Benny Orlick', role: 'fence' }),
      P('ph-ward', 'politician', 'The 2nd Ward clubhouse', 'Committeemen, turkeys at Christmas, and a ward leader whose friends get the city contracts.', { contact: 'Councilman Edward Fennimore', role: 'ward leader' }),
      P('ph-shop', 'shop', 'Jacob Reed\'s Sons', 'Chestnut Street\'s clothier: a suit made to measure, and a gift for the wife from Wanamaker\'s across the way.'),
      P('ph-gym', 'gym', 'A boxing gym on South Street', 'Heavy bags, the smell of liniment, and young men with fast hands and nothing to do.', { contact: 'Joe Pinto', role: 'trainer' }),
      P('ph-hide', 'hideout', 'A rowhouse in Fishtown', 'Your cousin\'s cousin. Nobody on the block talks to the police; nobody on the block talks to anybody.'),
    ],
  },
  {
    cityId: 'ac', name: 'Atlantic City', short: 'AC', hotel: 'a room at the Traymore', nightly: 25,
    blurb: 'Forty minutes up the shore road: the faded queen of the resorts, and Carmine Manno\'s home turf.',
    places: [
      P('ac-manno', 'family', 'A Ducktown bakery, the back table', 'Neutral ground, they say. Manno\'s people watch the door and count who comes in with you.', { contact: 'Carmine "The Fist" Manno', role: 'boss of the Atlantic City crew', rival: 'manno' }),
      P('ac-500', 'club', 'The 500 Club', 'The late show on Missouri Avenue. Every wiseguy on the shore is in the room; the cardroom upstairs never closes.', { contact: 'Lou Varga', role: 'the maître d\'' }),
      P('ac-harlem', 'club', 'Club Harlem', 'Kentucky Avenue at four in the morning: the breakfast show, the best band in town, the crowd from every other club.', { contact: 'Clarence Mabry', role: 'the owner\'s man' }),
      P('ac-bank', 'bank', 'Absecon Trust Company', 'Marble floors and a vice-president who does not ask where summer cash comes from.', { contact: 'Mr. Harold Pruitt', role: 'vice-president' }),
      P('ac-fence', 'fence', 'A pawnshop on Kentucky Avenue', 'Watches, rings, a saxophone in the window. In the back, a man who buys by the carton.', { contact: 'Sammy Weisz', role: 'pawnbroker' }),
      P('ac-boss', 'politician', 'The county organization, Ventnor', 'The machine that runs Atlantic County: jobs, contracts, and a state senator who likes to be asked.', { contact: 'State Senator Walter Dunleavy', role: 'county boss' }),
      P('ac-shop', 'shop', 'The Boardwalk shops', 'Saltwater taffy for the kids, a silk tie, a cashmere coat in the window at the Shelburne arcade.'),
      P('ac-hide', 'hideout', 'A rooming house on Pacific Avenue', 'Weekly rates, no questions, and a landlady deaf in exactly the right ear.'),
    ],
  },
  {
    cityId: 'newyork', name: 'New York', short: 'New York', hotel: 'a room at a hotel near Penn Station', nightly: 45,
    blurb: 'Three hours north. The garment center, the waterfront, the casino points — and the men who sit on the Commission.',
    places: [
      P('ny-marchetti', 'family', 'A social club on Mulberry Street', 'The Marchetti family\'s clubhouse: espresso, the ball game on the radio, and a man by the door who never sits.', { contact: 'Gaetano Marchetti', role: 'boss of the Marchetti family' }),
      P('ny-feld', 'family', 'An office in the garment center', 'Ira Feldstein\'s people count money here, upstairs from a coat company.', { contact: 'Ira Feldstein\'s accountant, Mr. Lazar', role: 'the money man\'s man', rival: 'feldstein' }),
      P('ny-comm', 'commission', 'A private room on Arthur Avenue', 'The Commission does not meet for you. But its go-between does, if your name is good.', { contact: 'Aurelio "the Judge" Fontana', role: 'the Commission\'s go-between' }),
      P('ny-stork', 'club', 'The Stork Club', 'Fifty-third Street: columnists, ballplayers, debutantes, and a table by the Cub Room door if somebody vouches for you.', { contact: 'Billy Dunphy', role: 'the captain' }),
      P('ny-latin', 'club', 'The Casa Latina', 'Broadway and Forty-seventh: the chorus line, the comics, the out-of-town money.', { contact: 'Sol Edelman', role: 'the room\'s manager' }),
      P('ny-bank', 'bank', 'Chatham Square Savings', 'A downtown savings bank where a cash deposit becomes a certificate of deposit by Friday.', { contact: 'Mr. Everett Kline', role: 'loan officer' }),
      P('ny-fence', 'fence', 'Brill Brothers Remnants, West 38th', 'Bolts of cloth up front. In back, a fence who moves furs, watches and whole trailers.', { contact: 'Herbie Brill', role: 'fence' }),
      P('ny-pol', 'politician', 'A Tammany clubhouse on East 14th', 'District leaders, judges\' clerks and a man who can fix a liquor license in three states.', { contact: 'District Leader Frank Mulvaney', role: 'Tammany district leader' }),
      P('ny-shop', 'shop', 'B. Altman & Co.', 'Fifth Avenue: a mink for the wife, a christening gown, a watch for the man who has everything.'),
      P('ny-hide', 'hideout', 'A cold-water flat in Red Hook', 'Over a bar the longshoremen own. You came in the back; you leave the same way.'),
    ],
  },
  {
    cityId: 'oceancity', name: 'Ocean City', short: 'Ocean City', hotel: 'a room at the Flanders Arms', nightly: 18,
    blurb: 'Twenty minutes up the shore: a dry Methodist town. Thirsty people pay well — and nobody runs it yet.',
    places: [
      P('oc-church', 'politician', 'The Camp Meeting board', 'The men who keep Ocean City dry. Their good opinion is a license to do business — quietly.', { contact: 'Commissioner Elwood Batten', role: 'city commissioner' }),
      P('oc-somers', 'club', 'Gus\'s Anchor Inn, Somers Point', 'Across the bridge where the town is wet: a band, a bar three deep, and every bootlegger on the bay.', { contact: 'Dutch Hallorann', role: 'the owner' }),
      P('oc-supper', 'restaurant', 'A supper club on the Longport road', 'Just outside the dry line: steaks, a piano, and the men who run the vending machines and the summer books.', { contact: 'Augie Lindqvist', role: 'runs the vending route' }),
      P('oc-bank', 'bank', 'Ocean City Title & Trust', 'A small bank with big summer deposits and a cashier who likes the horses.', { contact: 'Mr. Roland Smedley', role: 'head cashier' }),
      P('oc-book', 'fence', 'The cigar counter at the Strand Arcade', 'Bookmaking behind the cigars, a vending route out the back door.', { contact: 'Nate Gorski', role: 'bookmaker' }),
      P('oc-shop', 'shop', 'Shriber\'s Taffy & the Asbury Avenue shops', 'Taffy, fudge, a summer dress for the wife, a toy sailboat for the boy.'),
      P('oc-hide', 'hideout', 'A guest house on Wesley Avenue', 'Clean sheets, a Bible in every room, and nobody who would ever think to look for you here.'),
    ],
  },
];

/** Cape May from its town package: hotels, the harbor, the card room. */
function capeMayScene(): CityScene | undefined {
  const pkg = packageForTown('capemay');
  if (!pkg) return undefined;
  const byId = (id: string) => pkg.businesses.find((b) => b.id === id);
  const named = (id: string, fallback: string) => byId(id)?.name ?? fallback;
  return {
    cityId: 'capemay', name: pkg.displayName, short: 'Cape May', hotel: `a room at ${named('b:cm-c01', 'the Chalfont Arms')}`, nightly: 20,
    blurb: 'Fifteen minutes across the bridge: Victorian hotels, quiet money and summer gamblers. Nobody runs it — yet.',
    places: [
      P('cm-cards', 'club', `The card room at ${named('b:cm-b07', 'the Admiral')}`, 'Up the back stairs past a desk clerk who does not look up. Philadelphia doctors losing their summer money.', { contact: 'Eddie Brannigan', role: 'runs the game' }),
      P('cm-jeff', 'restaurant', named('b:cm-w12', 'The Jefferson Inn'), 'Supper with the hotel men who own Beach Avenue. They want a partner who keeps things quiet.', { contact: 'Walter Hollis', role: 'hotelman' }),
      P('cm-harbor', 'fence', named('b:cm-h01', 'Cape Island Fish Co.'), 'Coffee with the men who own the boats. Boats go places at night that nobody writes down.', { contact: 'Captain Nils Hartman', role: 'boat owner' }),
      P('cm-bank', 'bank', 'Cape Island Savings', 'A small bank with a big summer: the hotel men deposit cash all season and nobody counts how much.', { contact: 'Mr. Thaddeus Wilmot', role: 'cashier' }),
      P('cm-hall', 'politician', 'Cape May City Hall', 'A mayor who wants the summer people happy and the winter people working.', { contact: 'Mayor Clement Ashby', role: 'mayor' }),
      P('cm-shop', 'shop', named('b:cm-w01', 'Hollis Dry Goods'), 'Washington Street: a straw hat, a christening present, a box of fudge for the wife.'),
      P('cm-hide', 'hideout', named('b:cm-c02', 'Mrs. Albright\'s Guest House'), 'A porch, a widow who takes cash, and the whole off-season to say nothing.'),
    ],
  };
}

/** Any other map city: its family, a club, a bank, a fence, a hotel. */
function genericScene(c: City): CityScene {
  const owned = c.group !== 'unclaimed' && c.group !== 'exiles';
  const places: CityPlace[] = [];
  if (owned) places.push(P(`${c.id}-family`, 'family', `${c.owner}'s clubhouse`, `${c.flavor} You ask for ${c.boss}; somebody decides whether he is in.`, { contact: c.boss, role: `runs ${c.name}`, rival: c.group === 'philly' ? 'philly' : undefined }));
  else places.push(P(`${c.id}-money`, 'restaurant', 'A steakhouse downtown', `${c.flavor} The local money eats here.`, { contact: 'the local money', role: 'businessmen' }));
  places.push(
    P(`${c.id}-club`, 'club', 'The best club in town', 'A ringside table and a bottle sent over by the owner.'),
    P(`${c.id}-bank`, 'bank', 'A downtown savings bank', 'A manager who takes cash and asks nothing.'),
    P(`${c.id}-fence`, 'fence', 'A warehouse by the rail yard', 'Anything that came off a truck, bought or sold.'),
    P(`${c.id}-hide`, 'hideout', 'A rooming house by the station', 'Weekly rates, no questions.'),
  );
  return { cityId: c.id, name: c.name, short: c.name, hotel: 'a commercial hotel downtown', nightly: 25, blurb: c.flavor, places };
}

const CACHE: Record<string, CityScene | undefined> = {};

/** The scene for a map city (undefined for home, or a city that is not on the map). */
export function sceneOf(cityId: string): CityScene | undefined {
  if (cityId === 'wildwood') return undefined;
  if (cityId in CACHE) return CACHE[cityId];
  const c = CITIES_BY_ID[cityId];
  const sc = SCENES.find((x) => x.cityId === cityId) ?? (cityId === 'capemay' ? capeMayScene() : undefined) ?? (c ? genericScene(c) : undefined);
  CACHE[cityId] = sc;
  return sc;
}

/** "Philly", "AC" — how the boss says where he is. */
export function shortName(cityId: string): string {
  return sceneOf(cityId)?.short ?? CITIES_BY_ID[cityId]?.name ?? cityId;
}

/** The cities with a full scene, nearest first (the ones the departure card offers up front). */
export const FEATURED_CITIES = ['capemay', 'oceancity', 'ac', 'philadelphia', 'newyork'];
