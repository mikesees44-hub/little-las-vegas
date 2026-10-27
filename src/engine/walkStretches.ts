import { displayName } from './characters';
import type { Lot } from './econState';
import { PLACES, placesIn, type PlaceFeature } from './placesGeo';
import type { Character, GameState } from './types';
import type { WalkNpc } from './walk';
import type { HotspotKind, WalkHotspot } from './walkData';

/**
 * The rest of the town on foot: stretches beyond the walkable Boardwalk at
 * Hunt's Pier, each one a painting of the street (the user's art) with the
 * places along it as cards. The places are the location layer's records
 * (placesGeo), so they follow the game year (a building's later occupant
 * takes its place), and where a place is a game lot its card has every verb
 * the Boardwalk's do (go in, make an offer, call a meeting, dirty work).
 * Each stretch also turns up a few of the district's own lots (for sale,
 * held by another family, yours) so there is always something to do there.
 *
 * Pure data and read-only helpers; nothing here changes the state.
 */

export interface WalkStretch {
  id: string;
  label: string;
  /** The street, in a few words (the header line). */
  where: string;
  /** The painting behind it, best first (asset keys; the UI falls back down the list). */
  backdrop: string[];
  /** The game zone (for Start a racket here, and the zone lots). */
  zone: string;
  /** The district whose capo walks it. */
  district: string;
  blurb: string;
  /** Location-layer ids, in the order you pass them walking. */
  places: string[];
  /** A line for each place, by id (the card's blurb). */
  lines: Record<string, string>;
  /** How many of the zone's own lots to turn up besides. */
  zoneLots: number;
}

export const STRETCHES: WalkStretch[] = [
  {
    id: 'boards-arcades', label: 'The arcade boards', where: 'The Boardwalk, Rio Grande Avenue up to Andrews',
    backdrop: ['scene_boardwalk_tram', 'boardwalk_blue_hour_1958'], zone: 'boardwalk', district: 'boardwalk', zoneLots: 2,
    blurb: 'The tram car rattles past arcade after arcade. Every one of these places takes in quarters all night, and every one of them pays somebody.',
    places: ['bw-sportsland', 'bw-nutty-hut', 'bw-old-macks', 'bw-bazaar', 'bw-olympia', 'bw-taffy-tides', 'bw-eds-fun-arcade', 'bw-flashback', 'bw-casino-arcadia', 'bw-surfside', 'sb03', 'bw-chapel'],
    lines: {
      'bw-sportsland': 'Surreys and bikes by the hour. The kid at the counter knows every cop who rides the boards in the morning.',
      'bw-nutty-hut': 'Roasted peanuts and cashews by the scoop. The smell carries half a block.',
      'bw-old-macks': 'Thin crust, a line out the door, and the same three pizza men since the war.',
      'bw-bazaar': 'Shells, ashtrays, and WILDWOOD on everything. Cash only.',
      'bw-olympia': 'Pokerino, skee-ball and a prize wall. The machines in the back pay out in cash, if you know to ask.',
      'bw-taffy-tides': 'Salt water taffy pulled in the window. The tourists stand and watch.',
      'bw-eds-fun-arcade': 'Pinball, the claw, and a change girl who sees everything.',
      'bw-flashback': 'Dress up like a gangster, have your picture taken. The irony is not lost on anybody.',
      'bw-casino-arcadia': 'The biggest arcade on the boards. Bingo in the back, and the bingo is where the money is.',
      'bw-surfside': 'Bathing suits and beach towels. The owner pays his envelope on time.',
      sb03: 'A family restaurant on the boards since anybody can remember. Chicken pot pie and a view of the ocean.',
      'bw-chapel': 'Hymns at night on the Boardwalk. A landmark: nobody shakes down a chapel.',
    },
  },
  {
    id: 'boards-north', label: 'The North End boards', where: 'The Boardwalk in North Wildwood, 26th Avenue down to 16th',
    backdrop: ['boardwalk_blue_hour_1958'], zone: 'north', district: 'north', zoneLots: 2,
    blurb: 'The quieter end of the boards: fries in paper cones, a pancake house, ice cream at the Sea Shell. North Wildwood is Kessler country, and his people watch who walks it.',
    places: ['sb01', 'bw-gateway-25', 'bw-lil-nickys', 'bw-fudge-kitchenette', 'bw-curlys', 'bw-sea-shell', 'bw-route-69', 'bw-bobby-ds', 'bw-octopus-golf', 'bw-boat-tag', 'bw-sammys', 'bw-skippers'],
    lines: {
      sb01: 'A seafood house on the boards with a big neon sign. The owner is getting old and thinking about selling.',
      'bw-gateway-25': 'An arcade at the 25th Avenue ramp, frozen custard at the window.',
      'bw-lil-nickys': 'Slices through a window, the boards\' late-night pizza.',
      'bw-fudge-kitchenette': 'Fudge made in copper kettles while you watch. Boxes for the trip home.',
      'bw-curlys': 'Fresh-cut fries in a paper cone, vinegar on the counter.',
      'bw-sea-shell': 'Ice cream in a gingerbread cottage. The picnic tables fill up after dark.',
      'bw-route-69': 'A diner with a car on the roof. Coffee all night.',
      'bw-bobby-ds': 'A family fun center: skee-ball, the claw, a prize counter.',
      'bw-octopus-golf': 'Indoor mini golf under a giant octopus.',
      'bw-boat-tag': 'Little motor boats in a pool, kids bumping each other for a dime.',
      'bw-sammys': 'Pancakes from six in the morning. The cops eat here, which is worth knowing.',
      'bw-skippers': 'Fried fish in a paper boat, a nautical rooftop, a line at lunch.',
    },
  },
  {
    id: 'pacific', label: 'Pacific Avenue after dark', where: 'Pacific Avenue, the club strip, Spicer Avenue to Burk',
    backdrop: ['street_pacific_neon', 'street_7sees', 'neighborhood_twilight_1958'], zone: 'pacific', district: 'pacific', zoneLots: 3,
    blurb: 'Neon from one end to the other: the clubs, the lounges, the saloons. The acts come down from Philadelphia and New York; so does the money. This is where a family shows it runs the town.',
    places: ['sa05', 'sa20', 'pa05', 'pa03', 'pa01', 'pa02', 'sa08', 'sa09', 'pa-rainbow', 'pa-quo-vadis', 'pa-oasis', 'pa-riptide', 'pa-stardust', 'pa-starburst', 'sb02', 'pa-fairview', 'pa-shore-comedy', 'pa-uncle-vinnys', 'pa-wildwood-high'],
    lines: {
      sa05: 'A Victorian corner bar older than the town\'s charter. The back room has seen every deal on the island.',
      sa20: 'Banjos, straw hats and beer by the pitcher. Packed every night in July.',
      pa05: 'The supper club: a floor show, a dance band, and tables down front for the people who matter.',
      pa03: 'A club with a cigarette girl and a back door onto the alley.',
      pa01: 'A small, dark lounge. The bartender keeps a book.',
      pa02: 'The velvet rope is real: the doorman decides who gets in.',
      sa08: 'Red sauce, candles in Chianti bottles, a private room upstairs.',
      sa09: 'Hoagies, cold cuts and a phone the bookies use.',
      'pa-rainbow': 'Rock and roll at the corner: the kids line up around the block.',
      'pa-quo-vadis': 'A cocktail lounge in turquoise and chrome.',
      'pa-oasis': 'A corner nightclub with palm trees in neon.',
      'pa-riptide': 'Twin bands, a long bar, sailors on leave.',
      'pa-stardust': 'A turquoise nightclub with a stage and a curtain.',
      'pa-starburst': 'Pizza at the window, the Neon arcade inside, the Starburst lounge on the corner and rooms upstairs.',
      sb02: 'A marquee nightclub with headliners all summer.',
      'pa-fairview': 'A neighborhood corner bar, the regulars on their own stools.',
      'pa-shore-comedy': 'A comedy club: two shows a night, a two-drink minimum.',
      'pa-uncle-vinnys': 'The comics who come down from New York play here.',
      'pa-wildwood-high': 'The high school. A public building: never for sale.',
    },
  },
  {
    id: 'docks', label: 'Otten\'s Harbor', where: 'The bay docks, Park Boulevard and the harbor',
    backdrop: ['street_docks_day', 'street_docks_day2', 'district_docks_bayside'], zone: 'docks', district: 'docks', zoneLots: 3,
    blurb: 'Fishing boats, ice houses, bait and fuel. Whatever comes onto the island by water comes in here, and the dock boss knows what is in every crate.',
    places: ['sb04', 'pk-ricks', 'pk-ship-shore', 'bay-urys'],
    lines: {
      sb04: 'A restaurant on pilings over the bay: the boats tie up at the back door.',
      'pk-ricks': 'Crabs, clams and shrimp to take out, benches out front. The fishermen eat here.',
      'pk-ship-shore': 'A bar on its own dock. The captains drink here, and so do the men who unload their boats.',
      'bay-urys': 'A waterfront restaurant at the foot of the causeway, boats at the rail.',
    },
  },
  {
    id: 'crest', label: 'The Crest motel strip', where: 'Wildwood Crest: Ocean and Atlantic Avenues',
    backdrop: ['scene_doowop_neighborhood', 'district_crest_doowop', 'blue_comet_motel'], zone: 'crest', district: 'crest', zoneLots: 3,
    blurb: 'New motels every season: boomerang roofs, kidney pools, pink doors. The builders need permits, concrete and labor, and every one of those can be sold to them.',
    places: ['sb05', 'sb06', 'oc-beach-haus', 'at-shore-motel', 'at-ebb-tyde', 'at-satellite', 'at-schumanns', 'oc-star-lux'],
    lines: {
      sb05: 'An oceanfront resort with palm trees in neon. Families from Philadelphia book the same week every year.',
      sb06: 'A motel built around its pool. Weekly rates, a manager who asks no questions.',
      'oc-beach-haus': 'Two stories around the pool, a beach ball on the sign.',
      'at-shore-motel': 'A small motel, clean and quiet. The owner wants to build a second floor.',
      'at-ebb-tyde': 'A blue-hour motel with a blade sign over Atlantic Avenue.',
      'at-satellite': 'A boomerang roof and a rocket on the sign: the newest thing in the Crest.',
      'at-schumanns': 'A family restaurant: the motel guests eat breakfast here.',
      'oc-star-lux': 'A modern motel with a pool pavilion and a starburst sign.',
    },
  },
  {
    id: 'north', label: 'North Wildwood', where: 'Atlantic Avenue in North Wildwood, up to the Hereford Inlet',
    backdrop: ['neighborhood_twilight_1958', 'street_crablegs'], zone: 'north', district: 'north', zoneLots: 2,
    blurb: 'Corner delis, churches, City Hall and the old lighthouse at the inlet. The year-round people live up here; so do the men who run the North End.',
    places: ['nw-lollypop', 'at-bils', 'at-al-pizza', 'at-corner-inn', 'at-romeos', 'nw-city-hall', 'nj-st-anselms', 'nj-holy-redeemer', 'nj-wesley', 'hereford-light', 'club-avalon'],
    lines: {
      'nw-lollypop': 'A motel with a lollipop on the sign. Kids pick it from the car window.',
      'at-bils': 'Pizza, steaks, hoagies, wings: the corner deli for the whole neighborhood.',
      'at-al-pizza': 'A corner pizza and deli. Delivery, which means a car that goes everywhere.',
      'at-corner-inn': 'A corner hotel with a bar on the ground floor.',
      'at-romeos': 'A pizzeria at Taylor Avenue, new in town.',
      'nw-city-hall': 'North Wildwood City Hall. The permits and the police are both here. Public: never for sale.',
      'nj-st-anselms': 'The parish church. Sunday mass is where the whole town sees who is with who.',
      'nj-holy-redeemer': 'A stone church on New Jersey Avenue.',
      'nj-wesley': 'A brick Methodist church.',
      'hereford-light': 'The Hereford Inlet Light, 1874. A public landmark.',
      'club-avalon': 'The landmark nightclub of the North End. A place to be seen; never anybody\'s to own.',
    },
  },
];

export const STRETCHES_BY_ID: Record<string, WalkStretch> = Object.fromEntries(STRETCHES.map((x) => [x.id, x]));

/** A stretch's place as the walk card's hotspot (no outline on a painting: the card is the place). */
export interface StretchSpot extends WalkHotspot {
  /** The location-layer record (absent for a zone lot). */
  place?: string;
}

function kindOf(f: PlaceFeature): HotspotKind {
  const k = f.properties.kind;
  if (f.properties.public || f.properties.establishment || k === 'church' || k === 'civic' || k === 'lighthouse' || k === 'landmark' || k === 'school') return 'landmark';
  if (k === 'pier') return 'pier';
  if (k === 'ride') return 'ride';
  return 'business';
}

function ownerLine(f: PlaceFeature): string | undefined {
  const p = f.properties;
  if (p.establishment) return 'A landmark establishment (never for sale)';
  if (p.public) return p.kind === 'church' ? 'The parish (not for sale)' : 'The city (not for sale)';
  if (p.kind === 'church') return 'The congregation (not for sale)';
  return undefined;
}

/** The place a feature is on a stretch. */
export function spotOfPlace(f: PlaceFeature, line?: string): StretchSpot {
  const p = f.properties;
  const art = [...(p.images.exterior ?? []), ...(p.images.turnaround ? [p.images.turnaround] : []), ...(p.images.interior ? [p.images.interior] : [])];
  const kind = kindOf(f);
  return {
    id: f.id, place: f.id, label: p.name, kind, poly: [], door: [0, 0],
    lots: p.lotId ? [p.lotId] : undefined,
    landmark: kind === 'landmark' || (!p.lotId && kind !== 'business') ? f.id : undefined,
    art: art.length ? art : undefined,
    address: p.address,
    ownerText: ownerLine(f),
    blurb: line ?? `${p.name}, ${p.address}.`,
  };
}

/**
 * The places standing on a stretch in the game year: each building's
 * occupant that year (a later one takes an earlier one's place), in walking
 * order, then a few of the zone's own lots (for sale first, then the other
 * families', then yours) that the location layer does not already show.
 */
export function stretchSpots(s: GameState, st: WalkStretch): StretchSpot[] {
  const open = placesIn(s.date.y);
  const out: StretchSpot[] = [];
  const seen = new Set<string>();
  const lotSeen = new Set<string>();
  for (const id of st.places) {
    const f = PLACES.find((x) => x.id === id);
    if (!f) continue;
    const cur = open.find((x) => x.properties.building === f.properties.building);
    if (!cur || seen.has(cur.id)) continue;
    seen.add(cur.id);
    if (cur.properties.lotId) lotSeen.add(cur.properties.lotId);
    out.push(spotOfPlace(cur, st.lines[cur.id] ?? st.lines[id]));
  }
  const placedLots = new Set(PLACES.map((f) => f.properties.lotId).filter(Boolean) as string[]);
  const rank = (l: Lot) => (l.status === 'sale' ? 0 : l.status === 'rival' ? 1 : l.owner === 'player' ? 2 : 3);
  const lots = (s.econ?.lots ?? [])
    .filter((l) => l.zone === st.zone && !lotSeen.has(l.id) && !placedLots.has(l.id) && l.status !== 'public' && (l.stage === undefined || l.stage === 'open' || l.status === 'sale'))
    .sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id))
    .slice(0, st.zoneLots);
  for (const l of lots) {
    out.push({
      id: `lot:${l.id}`, label: l.name ?? l.address, kind: 'business', poly: [], door: [0, 0], lots: [l.id], address: l.address,
      blurb: l.status === 'sale' ? 'For sale: the owner wants out, and the price is on the window.' : l.status === 'rival' ? 'Another family holds this one. They will notice who walks in.' : l.owner === 'player' ? 'One of yours.' : 'A going concern on the block.',
    });
  }
  return out;
}

const free = (s: GameState, c: Character | undefined): c is Character => !!c && c.alive && !(c.imprisonedUntil !== undefined && c.imprisonedUntil > s.week);

/** Who is out on a stretch this week: the district's capo if he is yours, the men running your places there, the rival bosses outside theirs. */
export function whoIsOnStretch(s: GameState, st: WalkStretch, spots = stretchSpots(s, st)): WalkNpc[] {
  const out: WalkNpc[] = [];
  const seen = new Set<string>([s.playerId]);
  const add = (c: Character, role: WalkNpc['role'], at: string, doing: string) => {
    if (seen.has(c.id) || out.length >= 6) return;
    seen.add(c.id);
    out.push({ charId: c.id, name: displayName(c), role, doing, at, pos: [0, 0], faction: c.faction });
  };
  const capoId = s.districts.find((d) => d.id === st.district)?.capoId;
  const capo = capoId ? s.characters[capoId] : undefined;
  const first = spots[0];
  if (free(s, capo) && capo.faction === 'player' && first) add(capo, 'capo', first.id, `Your capo, walking ${st.label.toLowerCase().replace(/^the /, 'the ')}`);
  for (const h of spots) {
    const l = h.lots ? s.econ?.lots.find((x) => x.id === h.lots![0]) : undefined;
    if (!l) continue;
    const m = s.econ?.managers[l.bizId ?? `lot:${l.id}`];
    const c = m?.charId ? s.characters[m.charId] : undefined;
    if (free(s, c)) add(c, 'manager', h.id, `Runs ${l.name ?? h.label} for you`);
    if (l.status === 'rival') {
      const r = s.rivals.find((x) => x.id === l.owner);
      const rc = r ? s.characters[r.leaderId] : undefined;
      if (free(s, rc)) add(rc, 'rival', h.id, `Outside ${l.name ?? h.label}, which his people hold`);
    }
  }
  return out;
}
