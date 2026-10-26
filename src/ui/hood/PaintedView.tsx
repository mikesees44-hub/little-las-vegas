import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FLAGSHIP, HOODS_BY_ID, hoodOfZone, type HoodId } from '../../engine/hoodData';
import { rivalName } from '../../engine/construction';
import type { HoodOverlay } from '../../engine/hood';
import type { GameState } from '../../engine/types';
import { OWNER_COLOR } from '../map/lotIcons';
import type { Item } from './Buildings';
import type { Mood } from './iso';
import { AssetImg } from './AssetImg';
import type { AssetKey } from './art/assetUrls';

/**
 * Where you land: painted street-level views of Wildwood (the user's own
 * art), with every building on them a live hotspot bound to a real record — its current name and owner on the label, the
 * owner's color glowing round it on hover, badges for a sale, a closing or
 * a crew at work, and the island's overlays tinting it. Click one and its
 * street-view card opens, exactly as on the map.
 *
 *   block   the bird's-eye view of the Boardwalk block, the pier and the wheel behind
 *   street  standing on Pacific Avenue, looking down to the pier
 *   sees    Pacific at Oak: the old Seven Seas, which becomes The 7 Sees once it is yours
 *   taylor  Taylor Avenue: Sheila's weekly rooms and, next door, whatever is on the corner lot
 *           now (Crab Legs, or the Off Shore seafood bar, or someone else's sign)
 *   taylorRev  the same street looking back: the King's ballroom and the Music Key's pool
 *   bwBlue  the boards at blue hour (asset store): the shops on the boards, the wheel, the Tropicana
 *   twilight  the year-round town off New Jersey Avenue at twilight (asset store)
 *   docks / lane  Otten's Harbor from above, then down on the lane
 *
 * The inlined paintings are a separate chunk, fetched the first time you come
 * down to street level; the asset store's sharper copies are tried first, and
 * a view whose only painting is in the asset store falls back to a drawn
 * street when it can't load (local dev, tests). Every view is a stage at the
 * painting's own aspect: on a narrow screen drag to look along it; the edge
 * arrows and "Walk to…" move you down the street.
 */

export type Scene = 'block' | 'bwBlue' | 'street' | 'sees' | 'taylor' | 'taylorRev' | 'twilight' | 'docks' | 'lane';

type Want = 'motel' | 'hotel' | 'food' | 'club' | 'arcade' | 'shop' | 'pier' | 'house' | 'warehouse';

interface Spot {
  id: string;
  want: Want[];
  /** Polygon in image pixels (1024 × 559). */
  poly: [number, number][];
  /** Where its live label sits. */
  label: [number, number];
  /** Bound to this exact record (a landmark), not by kind. */
  lot?: string;
}

const W = 1024;
const H = 559;

const BLOCK: Spot[] = [
  { id: 'caribbean', want: ['motel', 'hotel'], poly: [[0, 112], [70, 118], [200, 96], [210, 150], [205, 232], [60, 252], [0, 252]], label: [96, 118] },
  { id: 'capri', want: ['motel', 'hotel'], poly: [[200, 96], [300, 92], [410, 104], [415, 150], [300, 160], [210, 150]], label: [262, 88] },
  { id: 'flamingo', want: ['motel', 'hotel'], poly: [[412, 84], [530, 78], [545, 100], [540, 132], [480, 140], [420, 140]], label: [478, 78] },
  { id: 'strip', want: ['food', 'shop', 'arcade', 'club'], poly: [[268, 175], [410, 148], [545, 140], [588, 190], [585, 255], [470, 330], [380, 356], [295, 305]], label: [430, 150] },
  { id: 'annex', want: ['shop', 'house', 'food'], poly: [[188, 200], [270, 192], [292, 300], [210, 300], [188, 260]], label: [232, 196] },
  { id: 'oceans', want: ['club', 'food'], poly: [[545, 150], [690, 140], [705, 175], [700, 232], [600, 240], [585, 190]], label: [612, 140] },
  { id: 'shell', want: ['shop', 'food', 'club'], poly: [[690, 128], [760, 118], [770, 180], [705, 190]], label: [728, 116] },
  { id: 'pink', want: ['food', 'shop', 'club'], poly: [[720, 98], [822, 92], [828, 140], [760, 146], [722, 140]], label: [772, 92] },
  { id: 'pier', want: ['pier'], poly: [[630, 40], [700, 0], [830, 0], [900, 60], [905, 98], [820, 96], [700, 100], [632, 90]], label: [760, 22] },
  { id: 'pierEnd', want: ['pier', 'arcade', 'food'], poly: [[830, 52], [940, 50], [948, 90], [905, 98], [880, 110], [832, 96]], label: [890, 46] },
  { id: 'farRight', want: ['shop', 'club', 'food', 'motel'], poly: [[905, 98], [1024, 80], [1024, 175], [940, 168], [915, 150]], label: [966, 92] },
  { id: 'balconies', want: ['motel', 'hotel'], poly: [[825, 192], [1024, 180], [1024, 340], [930, 330], [840, 300]], label: [930, 190] },
  { id: 'bite', want: ['food', 'shop'], poly: [[650, 262], [800, 282], [812, 330], [805, 450], [710, 440], [655, 380]], label: [730, 268] },
  { id: 'arcadeCity', want: ['arcade', 'pier', 'shop'], poly: [[815, 330], [1024, 330], [1024, 520], [905, 512], [815, 470]], label: [915, 342] },
  { id: 'caribMotel', want: ['motel', 'house'], poly: [[0, 330], [120, 336], [215, 370], [212, 520], [80, 559], [0, 559]], label: [110, 336] },
  { id: 'houses', want: ['house', 'shop'], poly: [[0, 52], [120, 50], [340, 60], [345, 92], [200, 96], [70, 112], [0, 108]], label: [170, 52] },
];

const STREET: Spot[] = [
  { id: 'rooms', want: ['motel', 'hotel'], poly: [[0, 30], [140, 30], [490, 140], [520, 260], [300, 300], [0, 290]], label: [230, 70] },
  { id: 'pizza', want: ['food'], poly: [[92, 300], [300, 300], [300, 490], [100, 492], [92, 400]], label: [196, 300] },
  { id: 'neon', want: ['arcade', 'pier', 'shop'], poly: [[300, 296], [450, 288], [452, 430], [300, 440]], label: [374, 290] },
  { id: 'starburst', want: ['club', 'food', 'shop'], poly: [[450, 265], [560, 255], [560, 400], [452, 420]], label: [505, 252] },
  { id: 'farLeft', want: ['shop', 'food', 'arcade'], poly: [[560, 250], [680, 268], [760, 300], [760, 340], [580, 360], [560, 340]], label: [640, 246] },
  { id: 'wheel', want: ['pier'], poly: [[630, 196], [728, 196], [730, 300], [632, 300]], label: [680, 190] },
  { id: 'driftwood', want: ['club', 'food'], poly: [[880, 60], [1024, 40], [1024, 500], [930, 470], [880, 340]], label: [962, 44] },
  { id: 'starRight', want: ['club', 'shop', 'food'], poly: [[808, 220], [880, 200], [880, 360], [812, 370]], label: [842, 196] },
];

const DOCKS: Spot[] = [
  { id: 'seafood', lot: 'sa18', want: ['food', 'club'], poly: [[700, 282], [790, 160], [900, 10], [1024, 60], [1024, 559], [870, 559], [705, 420]], label: [840, 246] },
  { id: 'cafe', lot: 'sa19', want: ['food', 'shop'], poly: [[0, 262], [60, 250], [110, 300], [178, 372], [182, 470], [50, 500], [0, 500]], label: [70, 258] },
  { id: 'bait', want: ['shop', 'warehouse'], poly: [[530, 262], [586, 262], [590, 372], [532, 372]], label: [558, 254] },
  { id: 'charters', want: ['warehouse', 'shop'], poly: [[590, 282], [660, 270], [702, 300], [702, 416], [596, 402]], label: [646, 266] },
  { id: 'boats', want: ['warehouse', 'shop'], poly: [[360, 172], [440, 120], [522, 240], [512, 296], [400, 272], [370, 232]], label: [446, 150] },
  { id: 'boats2', want: ['warehouse', 'food', 'shop'], poly: [[630, 232], [700, 135], [782, 182], [762, 272], [642, 266]], label: [708, 140] },
  { id: 'row', want: ['house', 'motel', 'shop'], poly: [[95, 140], [200, 140], [216, 240], [200, 322], [112, 302]], label: [150, 128] },
];

const LANE: Spot[] = [
  { id: 'seafood', lot: 'sa18', want: ['food', 'club'], poly: [[710, 240], [790, 130], [880, 0], [1024, 0], [1024, 500], [930, 500], [720, 400]], label: [846, 196] },
  { id: 'cafe', lot: 'sa19', want: ['food', 'shop'], poly: [[0, 80], [150, 80], [175, 250], [275, 340], [275, 450], [40, 520], [0, 520]], label: [86, 140] },
  { id: 'bait', want: ['shop', 'warehouse'], poly: [[550, 256], [602, 256], [606, 346], [556, 346]], label: [576, 248] },
  { id: 'charters', want: ['warehouse', 'shop'], poly: [[606, 270], [700, 250], [722, 300], [716, 380], [610, 370]], label: [652, 260] },
  { id: 'boats', want: ['warehouse', 'shop'], poly: [[400, 172], [500, 160], [526, 300], [420, 292], [405, 250]], label: [462, 162] },
  { id: 'row', want: ['house', 'motel', 'shop'], poly: [[150, 140], [245, 170], [252, 300], [176, 322], [160, 250]], label: [202, 144] },
];

const SEES: Spot[] = [
  { id: 'palace', lot: FLAGSHIP.lotId, want: ['club'], poly: [[598, 170], [640, 140], [700, 60], [770, 14], [880, 40], [1024, 80], [1024, 450], [860, 450], [640, 430], [598, 380]], label: [800, 300] },
  { id: 'pizza', want: ['food', 'shop'], poly: [[0, 200], [80, 160], [170, 185], [170, 450], [0, 455]], label: [90, 196] },
  { id: 'neon', want: ['arcade', 'club', 'shop'], poly: [[170, 185], [240, 190], [252, 440], [170, 450]], label: [212, 214] },
  { id: 'star', want: ['club', 'food', 'shop'], poly: [[240, 190], [312, 260], [312, 420], [252, 440]], label: [278, 236] },
  { id: 'wheel', want: ['pier'], poly: [[322, 208], [426, 208], [426, 300], [322, 300]], label: [374, 204] },
];

const TAYLOR: Spot[] = [
  { id: 'corner', lot: 'pa06', want: ['club'], poly: [[628, 160], [730, 40], [970, 30], [1024, 90], [1024, 500], [940, 500], [650, 450], [628, 380]], label: [850, 330] },
  { id: 'sheilas', lot: 'pa07', want: ['house', 'motel'], poly: [[440, 140], [520, 120], [640, 70], [680, 100], [660, 440], [470, 450], [440, 330]], label: [560, 108] },
  { id: 'guest', want: ['house', 'motel', 'shop'], poly: [[276, 160], [350, 145], [440, 140], [442, 420], [282, 410]], label: [350, 150] },
  { id: 'strip', want: ['food', 'club', 'shop'], poly: [[0, 300], [60, 300], [64, 410], [0, 412]], label: [30, 296] },
  { id: 'wheel', want: ['pier'], poly: [[16, 214], [124, 214], [124, 290], [16, 290]], label: [70, 210] },
];

const TAYLOR_REV: Spot[] = [
  { id: 'corner', lot: 'pa06', want: ['club'], poly: [[130, 150], [200, 115], [262, 190], [270, 400], [150, 420], [135, 330]], label: [200, 128] },
  { id: 'sheilas', lot: 'pa07', want: ['house'], poly: [[0, 40], [110, 60], [130, 150], [135, 500], [0, 500]], label: [56, 168] },
  { id: 'kings', lot: 'pa08', want: ['club'], poly: [[560, 160], [640, 120], [760, 118], [860, 160], [860, 360], [600, 380], [560, 330]], label: [706, 132] },
  { id: 'musickey', lot: 'pa09', want: ['motel'], poly: [[850, 150], [1024, 130], [1024, 430], [930, 500], [700, 470], [700, 390], [860, 372]], label: [940, 150] },
  { id: 'monaco', want: ['shop', 'food', 'club'], poly: [[272, 180], [352, 180], [356, 330], [276, 336]], label: [312, 176] },
  { id: 'wheel', want: ['pier'], poly: [[372, 134], [450, 134], [450, 200], [372, 200]], label: [410, 130] },
];


/** The Boardwalk at blue hour, 1958, from above (1600 × 874): the strip of shops on the boards, the pier rides, the motel row behind. */
const BW_BLUE: Spot[] = [
  { id: 'motel', lot: 'bw20', want: ['motel'], poly: [[215, 200], [590, 140], [665, 160], [665, 300], [420, 345], [330, 380], [220, 330]], label: [430, 168] },
  { id: 'houseL', want: ['house', 'motel', 'hotel'], poly: [[95, 150], [190, 115], [280, 150], [275, 240], [210, 245], [100, 250]], label: [175, 122] },
  { id: 'houseL2', want: ['house', 'motel', 'hotel'], poly: [[0, 300], [60, 285], [160, 330], [165, 420], [40, 445], [0, 440]], label: [72, 300] },
  { id: 'houses', want: ['house', 'motel', 'hotel'], poly: [[570, 80], [650, 60], [810, 80], [815, 180], [660, 190], [575, 150]], label: [700, 66] },
  { id: 'cottage', want: ['house', 'motel', 'hotel'], poly: [[840, 90], [900, 68], [970, 85], [970, 180], [845, 185]], label: [905, 74] },
  { id: 'aparts', want: ['motel', 'hotel', 'house'], poly: [[975, 130], [1040, 100], [1220, 120], [1225, 230], [1080, 245], [980, 220]], label: [1110, 108] },
  { id: 'pizza', lot: 'bw06', want: ['food'], poly: [[160, 470], [240, 445], [390, 470], [392, 610], [250, 635], [160, 600]], label: [270, 452] },
  { id: 'arcade', lot: 'bw04', want: ['arcade'], poly: [[392, 470], [470, 440], [560, 390], [665, 400], [690, 430], [690, 540], [520, 580], [392, 600]], label: [560, 396] },
  { id: 'taffy', lot: 'bw07', want: ['shop'], poly: [[690, 400], [780, 380], [855, 385], [860, 500], [700, 535]], label: [778, 384] },
  { id: 'souvenirs', lot: 'bw16', want: ['shop'], poly: [[860, 365], [1050, 340], [1060, 450], [870, 500]], label: [955, 346] },
  { id: 'frosty', lot: 'bw19', want: ['food'], poly: [[1060, 300], [1140, 265], [1215, 300], [1215, 400], [1070, 450]], label: [1140, 272] },
  { id: 'wheel', lot: 'pr02', want: ['pier'], poly: [[1285, 170], [1425, 170], [1425, 370], [1285, 370]], label: [1355, 166] },
  { id: 'coaster', lot: 'pr01', want: ['pier'], poly: [[1430, 240], [1520, 230], [1600, 300], [1600, 410], [1535, 390], [1530, 325], [1430, 320]], label: [1530, 238] },
  { id: 'pavilion', want: ['food', 'shop', 'pier'], poly: [[1395, 330], [1530, 325], [1530, 405], [1400, 405]], label: [1462, 334] },
];

/** A 1958 neighborhood off New Jersey Avenue at twilight (1536 × 1024): the motel and its pool, houses, the pizza parlor, the laundry, the barber and the social club. */
const TWILIGHT: Spot[] = [
  { id: 'motel', want: ['motel', 'hotel'], poly: [[655, 100], [680, 68], [1000, 105], [1000, 210], [940, 240], [905, 300], [855, 300], [700, 200], [655, 170]], label: [820, 74] },
  { id: 'pizza', lot: 'sa03', want: ['food'], poly: [[45, 420], [90, 345], [165, 315], [175, 500], [60, 505]], label: [110, 330] },
  { id: 'boomerang', want: ['shop', 'food'], poly: [[175, 340], [300, 320], [370, 335], [370, 450], [300, 510], [178, 500]], label: [270, 318] },
  { id: 'house1', want: ['house', 'shop'], poly: [[495, 410], [580, 365], [665, 400], [660, 530], [520, 545]], label: [580, 372] },
  { id: 'house2', want: ['house', 'shop'], poly: [[670, 380], [760, 345], [840, 370], [840, 520], [680, 540]], label: [755, 350] },
  { id: 'laundry', lot: 'sa02', want: ['shop'], poly: [[990, 450], [1050, 400], [1195, 420], [1195, 610], [1000, 600]], label: [1095, 410] },
  { id: 'barber', lot: 'sa01', want: ['shop'], poly: [[1195, 500], [1290, 480], [1300, 640], [1195, 640]], label: [1248, 486] },
  { id: 'candy', lot: 'sa04', want: ['shop'], poly: [[1300, 440], [1420, 420], [1460, 470], [1450, 650], [1300, 655]], label: [1385, 428] },
  { id: 'club', lot: 'sa06', want: ['club'], poly: [[665, 740], [720, 655], [870, 650], [940, 720], [930, 860], [680, 880]], label: [800, 662] },
  { id: 'housesTR', want: ['house', 'motel', 'shop'], poly: [[1070, 190], [1150, 165], [1230, 200], [1365, 230], [1365, 340], [1080, 330]], label: [1215, 176] },
  { id: 'housesBL', want: ['house', 'shop'], poly: [[100, 660], [170, 615], [270, 640], [440, 660], [430, 790], [110, 780]], label: [255, 626] },
  { id: 'housesBR', want: ['house', 'shop'], poly: [[1040, 800], [1110, 735], [1250, 760], [1430, 800], [1420, 930], [1050, 920]], label: [1240, 748] },
];

export const SPOTS: Record<Scene, Spot[]> = { block: BLOCK, street: STREET, sees: SEES, taylor: TAYLOR, taylorRev: TAYLOR_REV, bwBlue: BW_BLUE, twilight: TWILIGHT, docks: DOCKS, lane: LANE };

type ArtKey = 'NEIGHBORHOOD_ART' | 'STREET_ART' | 'SEES_ART' | 'CRAB_ART' | 'OFFSHORE_ART' | 'ROCK_ART' | 'DOCKS_ART' | 'DOCKS_LANE_ART';
/** The big copy of each inlined painting in the asset store (same framing, sharper); tried first. */
const ART_ASSET: Partial<Record<ArtKey, AssetKey>> = {
  SEES_ART: 'street_7sees', CRAB_ART: 'street_crablegs', OFFSHORE_ART: 'street_taylor_offshore', ROCK_ART: 'street_taylor_rockclub', DOCKS_ART: 'street_docks_day', DOCKS_LANE_ART: 'street_docks_day2',
};

type Dir = 'left' | 'right' | 'up' | 'turn';
interface Link { to: Scene; label: string; dir: Dir }
interface SceneDef {
  /** The inlined painting (always there), or none: then the asset store's, with the drawn fallback. */
  art?: ArtKey;
  asset?: AssetKey;
  size: [number, number];
  spots: Spot[];
  title: string;
  blurb: string;
  hoods: HoodId[];
  daylight?: boolean;
  /** Where a narrow screen starts looking (0 = the left edge, 1 = the right). */
  focus?: number;
  links: Link[];
}

const S1024: [number, number] = [W, H];
const SCENES: Record<Scene, SceneDef> = {
  block: { art: 'NEIGHBORHOOD_ART', size: S1024, spots: BLOCK, title: 'The Boardwalk block', blurb: 'Dusk on the strip: the motels, the clubs and the pier.', hoods: ['boardwalk', 'crest'], focus: 0.55, links: [{ to: 'bwBlue', label: '← Along the boards', dir: 'left' }, { to: 'street', label: 'Walk down Pacific Avenue →', dir: 'right' }] },
  bwBlue: { asset: 'boardwalk_blue_hour_1958', size: [1600, 874], spots: BW_BLUE, title: 'The boards at blue hour', blurb: 'Pizza, the arcade, taffy and soft serve, the wheel and the coaster; the Tropicana behind.', hoods: ['boardwalk', 'crest'], focus: 0.45, links: [{ to: 'block', label: 'Up the boards to the block →', dir: 'right' }, { to: 'twilight', label: '← Inland, off the boards', dir: 'left' }] },
  street: { art: 'STREET_ART', size: S1024, spots: STREET, title: 'Pacific Avenue', blurb: 'On the sidewalk, looking down to the pier.', hoods: ['boardwalk', 'crest'], focus: 0.4, links: [{ to: 'block', label: '↑ Back up over the block', dir: 'up' }, { to: 'sees', label: 'Up Pacific to Oak Avenue →', dir: 'right' }] },
  sees: { art: 'SEES_ART', size: S1024, spots: SEES, title: 'Pacific at Oak', blurb: 'The big corner: the old Seven Seas and the strip across the way.', hoods: ['pacific', 'boardwalk'], focus: 0.78, links: [{ to: 'street', label: '← Back down Pacific', dir: 'left' }, { to: 'taylor', label: 'Around to Taylor Avenue →', dir: 'right' }] },
  taylor: { art: 'CRAB_ART', size: S1024, spots: TAYLOR, title: 'Taylor Avenue', blurb: 'Weekly rooms, fire escapes and the place on the corner.', hoods: ['pacific', 'downtown'], focus: 0.75, links: [{ to: 'sees', label: '← Back to Pacific & Oak', dir: 'left' }, { to: 'taylorRev', label: 'Turn around ↺', dir: 'turn' }, { to: 'twilight', label: 'Inland to New Jersey Ave →', dir: 'right' }] },
  taylorRev: { art: 'ROCK_ART', size: S1024, spots: TAYLOR_REV, title: 'Taylor Avenue, looking back', blurb: 'The King\'s ballroom, the Music Key\'s pool, and the corner across the way.', hoods: ['pacific', 'downtown'], focus: 0.6, links: [{ to: 'taylor', label: 'Turn around ↺', dir: 'turn' }, { to: 'sees', label: '← Back to Pacific & Oak', dir: 'left' }] },
  twilight: { asset: 'neighborhood_twilight_1958', size: [1536, 1024], spots: TWILIGHT, title: 'Off New Jersey Avenue', blurb: 'The year-round town at twilight: the barber, the laundry, the social club, a motel and a lot of porches.', hoods: ['downtown', 'crest', 'westww'], focus: 0.5, links: [{ to: 'taylor', label: '← Back to Taylor Avenue', dir: 'left' }, { to: 'bwBlue', label: 'Down to the boards ↑', dir: 'up' }, { to: 'docks', label: 'Over to the bay →', dir: 'right' }] },
  docks: { art: 'DOCKS_ART', size: S1024, spots: DOCKS, title: 'The docks', blurb: 'Otten\'s Harbor in the morning: the boats are in.', hoods: ['docks', 'causeway', 'westww'], daylight: true, focus: 0.6, links: [{ to: 'twilight', label: '← Back into town', dir: 'left' }, { to: 'lane', label: 'Walk down the lane →', dir: 'right' }] },
  lane: { art: 'DOCKS_LANE_ART', size: S1024, spots: LANE, title: 'The harbor lane', blurb: 'Down on the lane between the cafe and the seafood house.', hoods: ['docks', 'causeway', 'westww'], daylight: true, focus: 0.5, links: [{ to: 'docks', label: '↑ Back up over the docks', dir: 'up' }] },
};
export const SCENE_HOODS: Record<Scene, HoodId[]> = Object.fromEntries(Object.entries(SCENES).map(([k, v]) => [k, v.hoods])) as Record<Scene, HoodId[]>;
export const SCENE_TITLE: Record<Scene, string> = Object.fromEntries(Object.entries(SCENES).map(([k, v]) => [k, v.title])) as Record<Scene, string>;
/** Walking order for the "Walk to…" list. */
export const SCENE_ORDER: Scene[] = ['block', 'bwBlue', 'street', 'sees', 'taylor', 'taylorRev', 'twilight', 'docks', 'lane'];

/** Which painted view a neighborhood lands on. */
export function sceneForHood(id: HoodId | undefined): Scene {
  return id === 'docks' || id === 'causeway' || id === 'westww' ? 'docks' : id === 'pacific' ? 'sees' : id === 'downtown' || id === 'crest' ? 'twilight' : 'block';
}

/** What stands on Taylor and Oak's corner lot decides which picture you see. */
const SEAFOOD = new Set(['trattoria', 'diner', 'seafood', 'deli', 'pizza', 'bar', 'tavern']);
function taylorArt(items: Item[]): { art: ArtKey; patch?: string } {
  const it = items.find((x) => x.lot?.id === 'pa06');
  const use = it?.lot?.use;
  if (!it || use === 'gents') return { art: 'CRAB_ART' };
  if (use && SEAFOOD.has(use)) return { art: 'OFFSHORE_ART', patch: it.name !== 'Off Shore' ? it.name : undefined };
  return { art: 'OFFSHORE_ART', patch: it.vacant ? 'FOR SALE' : it.name };
}

/** Looking back down Taylor, the corner lot's sign is Off Shore's; anything else gets its own board. */
function taylorRevPatch(items: Item[]): { art: ArtKey; patch?: string; rev: true } {
  const it = items.find((x) => x.lot?.id === 'pa06');
  const use = it?.lot?.use;
  return { art: 'ROCK_ART', rev: true, patch: !it ? undefined : use && SEAFOOD.has(use) && it.name === 'Off Shore' ? undefined : it.vacant ? 'FOR SALE' : it.name };
}

function iconWant(it: Item): Want {
  const ic = it.icon;
  if (ic === 'motel' || ic === 'hotel' || ic === 'house' || ic === 'club' || ic === 'pier') return ic;
  if (ic === 'pizza') return 'food';
  if (ic === 'apartment') return 'house';
  if (ic === 'warehouse') return 'warehouse';
  return 'shop';
}

/**
 * Bind every hotspot to a record: a landmark to its own lot; the rest to the
 * scene's neighborhoods' buildings by kind, in a stable order — the same
 * building always stands in the same place.
 */
export function bindSpots(items: Item[], spots: Spot[], hoods: HoodId[] = ['boardwalk', 'crest']): Map<string, Item> {
  const hoodOf = (it: Item) => hoodOfZone((it.lot?.zone ?? 'downtown') as never);
  const used = new Set<string>();
  const out = new Map<string, Item>();
  for (const sp of spots) {
    if (!sp.lot) continue;
    const it = items.find((x) => x.lot?.id === sp.lot);
    if (it) { used.add(it.key); out.set(sp.id, it); }
  }
  const pool = items
    .filter((it) => it.lot && !it.vacant && !used.has(it.key) && hoods.includes(hoodOf(it) as HoodId))
    .sort((a, b) => hoods.indexOf(hoodOf(a) as HoodId) - hoods.indexOf(hoodOf(b) as HoodId) || a.key.localeCompare(b.key));
  for (const sp of spots) {
    if (out.has(sp.id)) continue;
    let pick: Item | undefined;
    for (const w of sp.want) {
      pick = pool.find((it) => !used.has(it.key) && (iconWant(it) === w || (w === 'arcade' && it.useId === 'arcade')));
      if (pick) break;
    }
    pick ??= pool.find((it) => !used.has(it.key));
    if (pick) { used.add(pick.key); out.set(sp.id, pick); }
  }
  return out;
}

const pts = (p: [number, number][]) => p.map(([x, y]) => `${x},${y}`).join(' ');

let artCache: Promise<Record<ArtKey, string>> | undefined;
function loadArt(): Promise<Record<ArtKey, string>> {
  artCache ??= import('./art/paintedArt') as unknown as Promise<Record<ArtKey, string>>;
  artCache.catch(() => { artCache = undefined; });
  return artCache;
}

const WANT_HUE: Record<Want, string> = { motel: '#ff7fb5', hotel: '#ff7fb5', food: '#ffb35c', club: '#c48bff', arcade: '#5ff2e6', shop: '#7fd6ff', pier: '#ffd75c', house: '#f3e2b8', warehouse: '#9fb3c8' };

/**
 * The drawn stand-in when a painting can't be shown (the asset store is only
 * there in the published page): a dusk street of neon-edged blocks, one per
 * hotspot, so every place on the view can still be found and opened.
 */
function DrawnScene({ def }: { def: SceneDef }) {
  const [w, h] = def.size;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" data-testid="pv-drawn" aria-hidden>
      <defs>
        <linearGradient id="pvd-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={def.daylight ? '#8fb8d8' : '#0b1430'} /><stop offset="0.55" stopColor={def.daylight ? '#d7e3e8' : '#2a1f52'} /><stop offset="1" stopColor={def.daylight ? '#b9b2a0' : '#3a2440'} />
        </linearGradient>
        <pattern id="pvd-win" width="22" height="26" patternUnits="userSpaceOnUse"><rect x="6" y="7" width="9" height="11" rx="1" fill="#ffd98a" opacity="0.55" /></pattern>
      </defs>
      <rect width={w} height={h} fill="url(#pvd-sky)" />
      <path d={`M0 ${h * 0.78}L${w} ${h * 0.7}V${h}H0Z`} fill={def.daylight ? '#7d7a70' : '#1a1430'} opacity="0.8" />
      {def.spots.map((sp) => {
        const c = WANT_HUE[sp.want[0]];
        return (
          <g key={sp.id}>
            <polygon points={pts(sp.poly)} fill="#241a3e" stroke={c} strokeWidth="3" strokeLinejoin="round" opacity="0.95" />
            <polygon points={pts(sp.poly)} fill="url(#pvd-win)" />
          </g>
        );
      })}
    </svg>
  );
}

/** The stage: the scene at its own aspect, covering the view; drag to look along it when it is wider (or taller) than the screen. */
function useStage(size: [number, number], focus = 0.5) {
  const box = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState<[number, number]>([0, 0]);
  const [off, setOff] = useState<[number, number] | undefined>();
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | undefined>();
  const moved = useRef(false);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const upd = () => setVp([el.clientWidth, el.clientHeight]);
    upd();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(upd) : undefined;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);
  const [vw, vh] = vp;
  const a = size[0] / size[1];
  const sw = vw / Math.max(1, vh) > a ? vw : vh * a;
  const sh = sw / a;
  const clamp = (o: [number, number]): [number, number] => [Math.min(0, Math.max(vw - sw, o[0])), Math.min(0, Math.max(vh - sh, o[1]))];
  const start: [number, number] = [(vw - sw) * focus, (vh - sh) / 2];
  const cur = clamp(off ?? start);
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-pv-ui]')) return;
    drag.current = { x: e.clientX, y: e.clientY, ox: cur[0], oy: cur[1], moved: false };
    moved.current = false;
    const mv = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = ev.clientX - d.x;
      const dy = ev.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) < 6) return;
      d.moved = true;
      moved.current = true;
      setOff(clamp([d.ox + dx, d.oy + dy]));
    };
    const up = () => { drag.current = undefined; window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  const pannable = sw - vw > 2 || sh - vh > 2;
  return { box, style: { width: sw || '100%', height: sh || '100%', transform: `translate3d(${cur[0]}px, ${cur[1]}px, 0)` }, onPointerDown, moved, pannable, reset: () => setOff(undefined) };
}

const ARROW: Record<Dir, string> = { left: '‹', right: '›', up: '⌃', turn: '↺' };

export function PaintedView({ s, items, scene, mood, overlay, tint, sel, onPick, onScene, onMap, onDistricts }: {
  s: GameState;
  items: Item[];
  scene: Scene;
  mood: Mood;
  overlay: HoodOverlay;
  tint: (it: Item) => string | undefined;
  sel?: string;
  onPick: (key: string) => void;
  onScene: (sc: Scene) => void;
  onMap: () => void;
  /** Opens the district cards. */
  onDistricts?: () => void;
}) {
  const [hover, setHover] = useState<string | undefined>();
  const [names, setNames] = useState(false);
  const [walk, setWalk] = useState(false);
  const [art, setArt] = useState<Record<ArtKey, string> | undefined>();
  const [shown, setShown] = useState<'store' | 'inline' | 'fallback' | undefined>();
  useEffect(() => { let live = true; loadArt().then((a) => live && setArt(a)).catch(() => {}); return () => { live = false; }; }, []);
  const def = SCENES[scene];
  const [VW, VH] = def.size;
  const ls = VW / 1024;
  const stage = useStage(def.size, def.focus);
  useEffect(() => { stage.reset(); setWalk(false); setHover(undefined); }, [scene]); // eslint-disable-line react-hooks/exhaustive-deps
  const bound = useMemo(() => bindSpots(items, def.spots, def.hoods), [items, def]);
  const taylor = scene === 'taylor' ? taylorArt(items) : scene === 'taylorRev' ? taylorRevPatch(items) : undefined;
  const artKey = taylor?.art ?? def.art;
  const assetKey = artKey ? ART_ASSET[artKey] : def.asset;
  // The flagship's sign: lit and yours, or dark and somebody else's.
  const flagship = scene === 'sees' ? items.find((x) => x.lot?.id === FLAGSHIP.lotId) : undefined;
  // The painted light: the strip is a dusk picture, the docks a morning one.
  const filter = def.daylight
    ? (mood === 'night' ? 'brightness(0.5) saturate(0.7) hue-rotate(-10deg)' : mood === 'dusk' ? 'brightness(0.85) saturate(1.15) sepia(0.25)' : undefined)
    : (mood === 'day' ? 'brightness(1.16) saturate(1.06) contrast(0.98)' : mood === 'night' ? 'brightness(0.78) saturate(1.12)' : undefined);
  const waiting = !!artKey && !art;
  const go = (to: Scene) => onScene(to);
  return (
    <div ref={stage.box} className={`absolute inset-0 overflow-hidden bg-[#0b1430] ${stage.pannable ? 'cursor-grab active:cursor-grabbing' : ''}`} style={{ touchAction: 'none' }} onPointerDown={stage.onPointerDown}
      data-testid="painted-view" data-scene={scene} data-art={artKey ?? def.asset} data-art-shown={shown}>
      <div className="absolute left-0 top-0" style={stage.style} data-testid="pv-stage">
        <div key={scene} className={`absolute inset-0 ${scene === 'block' || scene === 'docks' || scene === 'bwBlue' ? 'pv-land' : 'pv-walk'}`}>
          {def.daylight && mood === 'night' && <div className="absolute inset-0 z-[1] pointer-events-none" style={{ background: 'rgba(12,22,60,0.35)' }} />}
          {waiting
            ? <div className="absolute inset-0 grid place-items-center text-sm text-[#ffd1e6]">Walking down to the street…</div>
            : <AssetImg key={`${scene}:${artKey ?? ''}`} k={assetKey} inline={artKey ? art?.[artKey] : undefined} alt={`${def.title}: ${def.blurb}`} className="absolute inset-0 h-full w-full select-none" style={{ filter }} fallback={<DrawnScene def={def} />} onShown={setShown} />}
          <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
            <defs>
              <filter id="pv-glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation={3 * ls} result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            </defs>
            {flagship && !flagship.mine && (
              // Not yours yet: the big sign is dark, boarded, with the old name or the new owner's.
              <g pointerEvents="none" data-testid="pv-flagship-dark">
                <path d="M600 30H1024V295H600Z" fill="#0b1430" opacity={flagship.owner === 'private' ? 0.72 : 0.82} />
                <g transform="translate(812 150)">
                  <rect x="-150" y="-34" width="300" height="68" rx="8" fill="#f3ead2" stroke="#8a6a4a" strokeWidth="3" />
                  <text y="-8" textAnchor="middle" fontSize="22" fontWeight="800" fill="#3a2c3e" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>{flagship.name}</text>
                  <text y="20" textAnchor="middle" fontSize="13" fontWeight="700" fill={flagship.forSale ? '#c0392b' : '#5b4a3a'}>{flagship.forSale ? 'FOR SALE · INQUIRE WITHIN' : flagship.owner === 'private' ? 'UNDER NEW MANAGEMENT' : `A ${rivalName(flagship.owner as never)} place`}</text>
                </g>
              </g>
            )}
            {taylor?.patch && (
              // Something else on the corner now: its own board over the old one.
              <g pointerEvents="none" data-testid="pv-corner-sign">
                {'rev' in taylor
                  ? <><path d="M150 150H262V262H150Z" fill="#1d2a36" opacity="0.9" /><text x="206" y="212" textAnchor="middle" fontSize={Math.min(20, 190 / Math.max(6, taylor.patch.length))} fontWeight="800" fill="#ff9ec7" stroke="#ff5fa2" strokeWidth="0.6" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>{taylor.patch}</text></>
                  : <><path d="M628 40H990V240H628Z" fill="#1d2a36" opacity="0.88" /><text x="809" y="130" textAnchor="middle" fontSize={Math.min(46, 620 / Math.max(6, taylor.patch.length))} fontWeight="800" fill="#ffd27a" stroke="#ff8a3c" strokeWidth="1" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>{taylor.patch}</text></>}
              </g>
            )}
            {def.spots.map((sp) => {
              const it = bound.get(sp.id);
              if (!it) return null;
              const own = it.mine ? OWNER_COLOR.player : it.forSale ? OWNER_COLOR.sale : OWNER_COLOR[it.owner] ?? OWNER_COLOR.private;
              const t = overlay !== 'none' ? tint(it) : undefined;
              const on = hover === sp.id || sel === it.key;
              return (
                <g key={sp.id}>
                  <polygon
                    points={pts(sp.poly)} data-testid="pv-spot" data-spot={sp.id} data-key={it.key}
                    fill={t ?? (on ? own : '#ffffff')} fillOpacity={t ? 0.38 : on ? 0.14 : 0} stroke={on ? own : t ?? 'none'} strokeWidth={(on ? 3 : t ? 1.5 : 0) * ls}
                    filter={on ? 'url(#pv-glow)' : undefined} style={{ cursor: 'pointer' }}
                    onPointerEnter={() => setHover(sp.id)} onPointerLeave={() => setHover((h) => (h === sp.id ? undefined : h))}
                    onClick={(e) => { e.stopPropagation(); if (stage.moved.current) return; onPick(it.key); }}
                  />
                </g>
              );
            })}
          </svg>
          {/* Live labels: the place's current name, who holds it, and what is going on there. */}
          <div className="pointer-events-none absolute inset-0">
            <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
              {def.spots.map((sp) => {
                const it = bound.get(sp.id);
                if (!it) return null;
                const own = it.mine ? OWNER_COLOR.player : OWNER_COLOR[it.owner] ?? OWNER_COLOR.private;
                const on = hover === sp.id || sel === it.key || !!sp.lot;
                const [x, y] = sp.label;
                if (!on && !names) {
                  return (
                    <g key={sp.id} transform={`translate(${x} ${y}) scale(${ls})`} data-testid="pv-label">
                      <circle r="6" fill="#1b1030" fillOpacity="0.8" stroke={own} strokeWidth="2" />
                      <circle r="2.6" fill={own} />
                      {(it.forSale || it.building || it.closed) && <circle cx="6" cy="-6" r="3" fill={it.forSale ? '#2ecc71' : it.building ? '#ff9f1c' : '#c0392b'} stroke="#1b1030" strokeWidth="1" />}
                    </g>
                  );
                }
                const badge = it.building ? 'BUILDING' : it.closed ? 'CLOSED' : it.forSale ? 'FOR SALE' : it.forLease ? 'FOR RENT' : it.mine ? 'YOURS' : undefined;
                const name = it.name.length > 24 ? `${it.name.slice(0, 23)}…` : it.name;
                const w = Math.max(60, name.length * 6.1 + 22);
                return (
                  <g key={sp.id} transform={`translate(${x} ${y}) scale(${ls})`} opacity={on ? 1 : 0.9} data-testid="pv-label" data-live-name={it.name}>
                    <rect x={-w / 2} y="-12" width={w} height="17" rx="8.5" fill="#1b1030" fillOpacity={on ? 0.94 : 0.78} stroke={own} strokeWidth={on ? 2 : 1.2} />
                    <circle cx={-w / 2 + 9} cy="-3.5" r="3.6" fill={own} />
                    <text x={-w / 2 + 17} y="0" fontSize="10.5" fontWeight="700" fill="#fff3dc" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>{name}</text>
                    {badge && <g transform={`translate(${w / 2 - 6} -14)`}><rect x={-badge.length * 3.6 - 6} y="-7" width={badge.length * 3.6 + 10} height="11" rx="5.5" fill={badge === 'YOURS' ? OWNER_COLOR.player : badge === 'FOR SALE' ? '#2ecc71' : badge === 'BUILDING' ? '#ff9f1c' : '#c0392b'} /><text x={-badge.length * 1.8 - 1} y="1.4" fontSize="6.5" fontWeight="800" textAnchor="middle" fill="#1b1030">{badge}</text></g>}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </div>
      {/* Walking: arrows on the edges of the view, like turning a corner. */}
      {def.links.map((l) => {
        const pos = l.dir === 'left' ? 'left-1 top-1/2 -translate-y-1/2' : l.dir === 'right' ? 'right-1 top-1/2 -translate-y-1/2' : l.dir === 'up' ? 'left-1/2 -translate-x-1/2 bottom-14' : 'left-1/2 -translate-x-1/2 bottom-14';
        if (l.dir === 'up' && def.links.some((x) => x.dir === 'turn')) return null;
        return (
          <button key={`a-${l.to}`} type="button" data-pv-ui onClick={() => go(l.to)} data-testid={`pv-arrow-${l.to}`} title={l.label} aria-label={l.label}
            className={`absolute z-10 ${pos} group flex items-center gap-1 rounded-full border border-[#5ff2e6]/70 bg-[#1b1030]/75 text-[#c9fffa] shadow-[0_0_10px_rgba(95,242,230,0.35)] hover:bg-[#1b1030] ${l.dir === 'left' || l.dir === 'right' ? 'h-12 min-w-12 px-3 text-2xl' : 'h-9 px-3 text-sm'}`}>
            <span aria-hidden>{ARROW[l.dir]}</span>
            <span className={`text-[11px] font-semibold whitespace-nowrap ${l.dir === 'left' || l.dir === 'right' ? 'hidden lg:group-hover:inline' : ''}`}>{l.label.replace(/^[←↑]\s*|\s*[→↺↑]$/g, '')}</span>
          </button>
        );
      })}
      {/* Where you are, and where you can go. */}
      <div className="absolute left-2 top-11 z-10 flex flex-wrap gap-1.5 max-w-[calc(100%-1rem)] sm:max-w-[62%]" data-hv-ui data-pz-ui data-pv-ui>
        <button type="button" className="hv-btn" onClick={onMap} data-testid="pv-map">← Island map</button>
        {def.links.map((l) => <button key={l.to} type="button" className="hv-btn hv-on hidden sm:inline-block" onClick={() => go(l.to)} data-testid={`pv-to-${l.to}`}>{l.label}</button>)}
        <div className="relative">
          <button type="button" className={`hv-btn ${walk ? 'hv-on' : ''}`} onClick={() => setWalk((x) => !x)} aria-expanded={walk} data-testid="pv-walk">Walk to… ▾</button>
          {walk && (
            <div className="absolute left-0 mt-1 w-56 rounded border border-noir-600 bg-noir-900/95 p-1 shadow-xl z-20" role="menu" data-testid="pv-walk-menu">
              {SCENE_ORDER.map((sc) => (
                <button key={sc} type="button" role="menuitem" disabled={sc === scene} onClick={() => go(sc)} data-testid={`pv-walk-${sc}`}
                  className={`block w-full text-left rounded px-2 py-1 text-xs ${sc === scene ? 'text-gold-300 bg-gold-500/10' : 'text-stone-300 hover:bg-noir-800'}`}>
                  {SCENES[sc].title}<span className="block text-[10px] text-stone-500">{HOODS_BY_ID[SCENES[sc].hoods[0]].name}</span>
                </button>
              ))}
              {onDistricts && <button type="button" role="menuitem" onClick={() => { setWalk(false); onDistricts(); }} className="mt-1 block w-full text-left rounded px-2 py-1 text-xs text-[#ffd1e6] border-t border-noir-700" data-testid="pv-districts">The six districts…</button>}
            </div>
          )}
        </div>
        <button type="button" className={`hv-btn ${names ? 'hv-on' : ''}`} onClick={() => setNames((x) => !x)} data-testid="pv-names">Names</button>
      </div>
      <div className="absolute left-1/2 -translate-x-1/2 bottom-2 z-10 pointer-events-none rounded-full border border-[#ff5fa2] bg-[#1b1030]/85 px-3 py-0.5 sm:py-1 text-center max-w-[78%] sm:max-w-[52%]">
        <div className="font-display text-xs sm:text-sm leading-tight text-[#ffd1e6] truncate" data-testid="pv-title">{def.title}</div>
        <div className="text-[10px] text-[#9fe7e0] hidden md:block truncate">{def.blurb} · {HOODS_BY_ID[def.hoods[0]].name}, {s.date.y}</div>
        {stage.pannable && <div className="text-[10px] text-[#9fe7e0] md:hidden">drag to look around</div>}
      </div>
    </div>
  );
}
