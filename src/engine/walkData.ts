/**
 * The first walkable stretch of town, hand-authored over the user's aerial
 * painting (`walk_aerial_boardwalk`, 1536 × 1024, looking north up the
 * island): the Boardwalk from Hunt's Pier (the near pier, bottom of the
 * picture) up to the next pier, the beach between them, the cross streets
 * and the first block of Ocean Avenue behind the boards.
 *
 * Everything is in the painting's own pixels. The view is fixed-angle 2.5D
 * (no rotation), so the painting is the ground and these polygons sit on it:
 *
 *   WALKABLE  where the boss can stand (boards, pier decks, streets, the sand)
 *   BLOCKED   what stops him (pier buildings, rides, the tram stop kiosk,
 *             the railing between the boards and the beach), cut out of
 *             the walkable ground
 *   HOTSPOTS  the places you walk up to: each with its outline on the
 *             painting, a door (where you stand to go in, always walkable)
 *             and the game record it is: a lot id, or a landmark
 *
 * The ocean, the bay and every building not listed are simply not walkable.
 * The painting compresses the four game blocks between the two piers into
 * one painted block; the places keep their game records and addresses.
 */

export type Pt = [number, number];

export const WALK_W = 1536;
export const WALK_H = 1024;

/** The walkable area and its pathfinding grid (pixels of the painting). */
export const WALK_BOUNDS = { x0: 360, y0: 370, x1: 1520, y1: 1024 };
export const CELL = 5;

/** A strip of the given width along a centerline (a street, a sidewalk). */
export function strip(a: Pt, b: Pt, w: number): Pt[] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  const nx = (-dy / l) * (w / 2);
  const ny = (dx / l) * (w / 2);
  return [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]];
}

/** Hunt's Pier deck: the front edge (the railing over the beach) runs from the pier's mouth to its end. */
const DECK_A: Pt = [778, 808];
const DECK_B: Pt = [1487, 870];
const deckY = (x: number) => DECK_A[1] + ((x - DECK_A[0]) * (DECK_B[1] - DECK_A[1])) / (DECK_B[0] - DECK_A[0]);

export interface Area { id: string; label: string; poly: Pt[] }

export const WALKABLE: Area[] = [
  {
    id: 'boards', label: 'The Boardwalk',
    // Inland edge (the storefronts) from the bottom of the picture up to the next pier, then back down the ocean side
    // (the railing over the beach), round the Hunt's Pier buildings.
    poly: [
      [408, 1020], [455, 940], [545, 895], [548, 850], [650, 835], [660, 800], [718, 785], [722, 740], [790, 712], [800, 690],
      [899, 650], [930, 578], [968, 530], [1003, 490], [1030, 465], [1092, 468],
      [1083, 476], [1040, 530], [998, 577], [983, 600], [945, 650], [915, 688], [870, 698], [800, 728], [797, 800], [778, 808], [527, 1024],
    ],
  },
  {
    id: 'hunts-deck', label: 'Hunt\'s Pier deck',
    poly: [[782, deckY(782) - 24], [DECK_B[0], deckY(DECK_B[0]) - 24], [DECK_B[0], deckY(DECK_B[0]) - 3], [782, deckY(782) - 3]],
  },
  { id: 'next-deck', label: 'The next pier\'s deck', poly: [[1070, 452], [1505, 477], [1505, 492], [1070, 472]] },
  { id: 'beach', label: 'The beach', poly: [[928, 692], [1090, 484], [1230, 492], [1252, 560], [1248, 662], [962, 700]] },
  // The stairs down from the boards to the sand (the only way onto the beach here).
  { id: 'stairs', label: 'The beach stairs', poly: [[1018, 548], [1038, 526], [1072, 538], [1052, 562]] },
  // Ocean Avenue, the first block behind the boards (street and both sidewalks).
  { id: 'ocean-ave', label: 'Ocean Avenue', poly: strip([380, 690], [712, 451], 36) },
  // The cross street at the pier (Oak Avenue in the game) and the next one up.
  { id: 'oak-ave', label: 'Oak Avenue', poly: strip([380, 676], [804, 706], 22) },
  { id: 'upper-st', label: 'The next cross street', poly: strip([640, 498], [992, 514], 16) },
];

/** The railing between the boards and the sand, broken only at the stairs. */
const RAIL_LO = strip([915, 688], [1024, 552], 10);
const RAIL_HI = strip([1050, 520], [1086, 473], 10);

export const BLOCKED: Area[] = [
  { id: 'rail-lo', label: 'The railing', poly: RAIL_LO },
  { id: 'rail-hi', label: 'The railing', poly: RAIL_HI },
  { id: 'hunts-gate', label: 'Hunt\'s Pier gate and pavilion', poly: [[800, 731], [871, 700], [945, 700], [945, 798], [800, 790]] },
  { id: 'flyer', label: 'The Flyer', poly: [[950, 690], [1340, 700], [1340, 800], [950, 800]] },
  { id: 'booths', label: 'Ride booths', poly: [[1019, 777], [1105, 777], [1105, 806], [1019, 806]] },
  { id: 'carousel', label: 'The carousel', poly: [[1118, 785], [1180, 785], [1180, 826], [1118, 826]] },
  { id: 'pavilion', label: 'The red pavilion', poly: [[1225, 790], [1325, 790], [1325, 838], [1225, 838]] },
  { id: 'castle', label: 'Castle Dungeon', poly: [[1400, 760], [1487, 760], [1487, 838], [1400, 838]] },
  { id: 'tram-kiosk', label: 'The tram stop', poly: [[968, 562], [999, 562], [999, 592], [968, 592]] },
  { id: 'next-gate', label: 'The next pier\'s gate', poly: [[1088, 424], [1140, 424], [1140, 452], [1092, 452]] },
  { id: 'next-rides', label: 'The next pier\'s rides', poly: [[1150, 390], [1470, 390], [1470, 452], [1150, 452]] },
];

export type HotspotKind = 'pier' | 'ride' | 'business' | 'landmark' | 'beach' | 'tram';

export interface WalkHotspot {
  id: string;
  label: string;
  kind: HotspotKind;
  /** Its outline on the painting. */
  poly: Pt[];
  /** Where the boss stands to go in (walkable). */
  door: Pt;
  /** The game record, by lot id (the first one that exists). */
  lots?: string[];
  /** A landmark record (placesGeo id): never for sale. */
  landmark?: string;
  /** The building art for its card (asset keys, best first; the UI decides). */
  art?: string | string[];
  /** Its street address on the card (else the lot's, else the Boardwalk at Hunt's Pier). */
  address?: string;
  /** Who holds it, when it is not a lot (a church, City Hall). */
  ownerText?: string;
  /** Its outline also stops the boss (a building on the walkable ground). */
  blocks?: boolean;
  blurb: string;
}

export const HOTSPOTS: WalkHotspot[] = [
  {
    id: 'hunts-pier', label: 'Hunt\'s Pier', kind: 'pier', landmark: 'hunts-pier', art: 'walk_hunts_flyer',
    poly: [[800, 731], [871, 700], [945, 700], [945, 798], [800, 790]], door: [775, 768],
    blurb: 'The gate, the ticket booth and the red-roofed pavilion. The pier company runs every ride out to the end of the deck.',
  },
  {
    id: 'flyer', label: 'The Flyer', kind: 'ride', lots: ['pr01'], art: 'walk_hunts_flyer',
    poly: [[950, 690], [1340, 700], [1340, 800], [950, 800]], door: [1060, 822],
    blurb: 'The wooden coaster over the surf. Every car sold out on a Saturday night; the line runs back to the carousel.',
  },
  {
    id: 'castle-dungeon', label: 'Castle Dungeon', kind: 'ride', landmark: 'hunts-pier', art: 'walk_castle_dungeon',
    poly: [[1400, 752], [1487, 752], [1487, 845], [1400, 845]], door: [1440, 856],
    blurb: 'The dark ride at the end of the deck: a painted castle, a creaking door, and the screams carry all the way to the boards.',
  },
  {
    id: 'carousel', label: 'The carousel', kind: 'ride', landmark: 'hunts-pier', art: 'walk_hunts_flyer',
    poly: [[1115, 786], [1182, 786], [1182, 833], [1115, 833]], door: [1150, 833],
    blurb: 'Brass rings and a band organ. Where half the island had a first date.',
  },
  {
    id: 'tram-stop', label: 'The tram car stop', kind: 'tram', art: 'walk_pier_beach',
    poly: [[968, 562], [999, 562], [999, 592], [968, 592]], door: [952, 580],
    blurb: '"Watch the tram car, please." The yellow cars run the length of the boards. From here you can ride, or plan a trip off the island.',
  },
  {
    id: 'ocean-theatre', label: 'The Ocean Theatre', kind: 'landmark', landmark: 'ocean-theatre',
    poly: [[620, 718], [712, 712], [716, 782], [625, 790]], door: [736, 752],
    blurb: 'Across the boards from Hunt\'s Pier: a picture house with a miniature golf course up on the roof.',
  },
  {
    id: 'neptunes', label: 'Neptune\'s Fish House', kind: 'business', lots: ['bw12'],
    poly: [[735, 640], [800, 636], [800, 690], [740, 700]], door: [822, 704],
    blurb: 'Fried flounder, clam strips, and a back booth with a view of everybody who comes off the pier.',
  },
  {
    id: 'wave-crest', label: 'The Wave Crest Hotel', kind: 'business', lots: ['bw14'],
    poly: [[708, 558], [880, 558], [880, 635], [708, 635]], door: [916, 628],
    blurb: 'Four stories of yellow stucco and awnings. The bar off the lobby is where deals get made in July.',
  },
  {
    id: 'skee-ball', label: 'Lucky Strike Skee-Ball', kind: 'business', lots: ['bw13'],
    poly: [[870, 530], [935, 525], [938, 585], [880, 600]], door: [950, 570],
    blurb: 'Forty lanes, a prize counter, and a back room where the tickets are worth more than prizes.',
  },
  {
    id: 'coney', label: 'Coney Island Hot Dogs', kind: 'business', lots: ['bw15'],
    poly: [[940, 478], [972, 474], [975, 494], [944, 497]], door: [958, 508],
    blurb: 'A window, a griddle and a striped umbrella. The counterman sees who walks by, and remembers.',
  },
  {
    id: 'beachwear', label: 'Seaside Beachwear', kind: 'business', lots: ['bw16'],
    poly: [[980, 452], [1015, 448], [1018, 474], [985, 480]], door: [1030, 480],
    blurb: 'Bathing suits, sunglasses and rubber rafts. The owner has been trying to sell all summer.',
  },
  {
    id: 'next-pier', label: 'The next pier', kind: 'pier', lots: ['pr02'], art: ['cutout_ferris_wheel', 'cutout_ferris_white'],
    poly: [[1090, 400], [1470, 390], [1505, 470], [1090, 455]], door: [1180, 470],
    blurb: 'The next amusement pier up the boards: its own coaster, its own carousel, the Giant Wheel turning over the water.',
  },
  {
    id: 'beach', label: 'The beach', kind: 'beach', art: 'walk_pier_beach',
    poly: [[928, 692], [1090, 484], [1230, 492], [1252, 560], [1248, 662], [962, 700]], door: [1150, 590],
    blurb: 'Free sand, rented umbrellas, lifeguard stands. A good place to talk where nobody can listen.',
  },
  {
    id: 'pelican', label: 'The Pelican Court', kind: 'business', lots: ['ow01'],
    poly: [[603, 630], [760, 636], [760, 684], [603, 678]], door: [690, 700],
    blurb: 'A two-story motor court on the cross street, a block from the pier. For sale: the family wants out.',
  },
  {
    id: 'luncheonette', label: 'Irma\'s Luncheonette', kind: 'business', lots: ['ow02'],
    poly: [[380, 700], [455, 700], [455, 735], [380, 735]], door: [440, 688],
    blurb: 'Coffee, eggs, a counter of regulars and a pay phone in the back. Open at five for the fishermen.',
  },
  {
    id: 'driftline', label: 'The Driftline Motor Inn', kind: 'business', lots: ['ow03'],
    poly: [[300, 572], [452, 572], [448, 612], [413, 651], [300, 651]], door: [480, 600],
    blurb: 'Pink stucco, a kidney pool and a neon arrow on Ocean Avenue. Weekly rates.',
  },
];

/** Where the boss arrives: on the boards at the mouth of Hunt's Pier. */
export const SPAWN: Pt = [760, 770];

/** How close the boss must be to a door to go in. */
export const REACH = 46;
