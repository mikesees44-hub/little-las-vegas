/**
 * The illustrated South Jersey map's hand-authored layer: the 1960 roads
 * (the Garden State Parkway, Route 9, Route 47, the White and Black Horse
 * Pikes, the Atlantic City Expressway once it opens), the causeways and
 * toll bridges to the barrier islands, the bays and marshes, and the towns.
 * Coordinates are real (lat, lon), traced approximately from memory at the
 * scale of a road map; the coastline itself comes from the bundled
 * OpenStreetMap-derived land polygons (public/geo/land-shore.json).
 */

export type LatLon = [number, number];

/** Equirectangular projection in kilometres, centred on the Cape May peninsula. */
const LAT0 = 39.3;
const LON0 = -74.9;
const KX = 111.32 * Math.cos((LAT0 * Math.PI) / 180);
const KY = 110.95;
export function proj(lat: number, lon: number): [number, number] {
  return [(lon - LON0) * KX, (LAT0 - lat) * KY];
}
export function unproj(x: number, y: number): LatLon {
  return [LAT0 - y / KY, LON0 + x / KX];
}

/** The window of the map (world km), and how far the view may wander. */
export const REGION_BBOX = { s: 38.84, n: 40.08, w: -75.42, e: -74.18 };
export const REGION_BOUNDS = (() => {
  const [x0, y1] = proj(REGION_BBOX.s, REGION_BBOX.w);
  const [x1, y0] = proj(REGION_BBOX.n, REGION_BBOX.e);
  return { x0, y0, x1, y1 };
})();

export type RoadKind = 'parkway' | 'expressway' | 'us' | 'state' | 'causeway' | 'bridge' | 'ferry' | 'drive';

export interface Road {
  id: string;
  name: string;
  kind: RoadKind;
  /** Shield text (route number) and where along the line (0..1) to put shields. */
  shield?: string;
  shieldAt?: number[];
  since?: number;
  pts: LatLon[];
}

export const ROADS: Road[] = [
  {
    id: 'gsp', name: 'Garden State Parkway', kind: 'parkway', shield: 'GSP', shieldAt: [0.12, 0.42, 0.78],
    pts: [[38.951, -74.902], [38.975, -74.886], [39.005, -74.873], [39.045, -74.858], [39.084, -74.826], [39.13, -74.795], [39.18, -74.752], [39.22, -74.705], [39.262, -74.66], [39.296, -74.624], [39.316, -74.607], [39.355, -74.567], [39.395, -74.535], [39.432, -74.505], [39.478, -74.478], [39.53, -74.457], [39.566, -74.443], [39.605, -74.42], [39.65, -74.375], [39.7, -74.3], [39.76, -74.255], [39.84, -74.215], [39.92, -74.2], [40.0, -74.17], [40.08, -74.13]],
  },
  {
    id: 'us9', name: 'Route 9', kind: 'us', shield: '9', shieldAt: [0.2, 0.55],
    pts: [[38.94, -74.917], [38.975, -74.9], [39.019, -74.885], [39.06, -74.85], [39.083, -74.826], [39.135, -74.785], [39.19, -74.74], [39.24, -74.68], [39.29, -74.63], [39.318, -74.598], [39.36, -74.56], [39.39, -74.53], [39.43, -74.497], [39.48, -74.466], [39.53, -74.45], [39.585, -74.435], [39.63, -74.405], [39.66, -74.36], [39.7, -74.29], [39.76, -74.25], [39.85, -74.21], [39.95, -74.2], [40.08, -74.2]],
  },
  {
    id: 'nj47', name: 'Route 47', kind: 'state', shield: '47', shieldAt: [0.12, 0.5],
    pts: [[38.9935, -74.8165], [39.0, -74.84], [39.019, -74.877], [39.05, -74.905], [39.1, -74.89], [39.14, -74.865], [39.19, -74.83], [39.24, -74.86], [39.29, -74.94], [39.32, -74.98], [39.36, -75.02], [39.402, -75.039], [39.48, -75.05], [39.57, -75.06], [39.64, -75.09], [39.702, -75.112], [39.79, -75.135], [39.865, -75.155]],
  },
  {
    id: 'us30', name: 'White Horse Pike', kind: 'us', shield: '30', shieldAt: [0.45],
    pts: [[39.926, -75.11], [39.87, -75.03], [39.79, -74.93], [39.72, -74.87], [39.636, -74.8], [39.58, -74.72], [39.528, -74.648], [39.48, -74.56], [39.43, -74.497], [39.39, -74.45], [39.37, -74.435]],
  },
  {
    id: 'us322', name: 'Black Horse Pike', kind: 'us', shield: '322', shieldAt: [0.5],
    pts: [[39.9, -75.085], [39.8, -75.04], [39.7, -74.99], [39.6, -74.87], [39.52, -74.79], [39.452, -74.727], [39.435, -74.64], [39.405, -74.56], [39.39, -74.524], [39.37, -74.47], [39.362, -74.44]],
  },
  {
    id: 'ace', name: 'Atlantic City Expressway', kind: 'expressway', shield: 'ACE', shieldAt: [0.4], since: 1964,
    pts: [[39.765, -75.05], [39.7, -74.98], [39.645, -74.83], [39.585, -74.73], [39.52, -74.64], [39.45, -74.57], [39.4, -74.5], [39.375, -74.455], [39.366, -74.437]],
  },
  {
    id: 'nj49', name: 'Route 49', kind: 'state', shield: '49', shieldAt: [0.5],
    pts: [[39.427, -75.234], [39.41, -75.13], [39.402, -75.039], [39.36, -74.95], [39.3, -74.84], [39.28, -74.75], [39.27, -74.66], [39.282, -74.6]],
  },
  {
    id: 'nj55', name: 'Route 55', kind: 'expressway', shield: '55', shieldAt: [0.5], since: 1969,
    pts: [[39.402, -75.025], [39.47, -75.0], [39.55, -75.03], [39.62, -75.07]],
  },
  // The barrier islands' shore road and its toll bridges.
  {
    id: 'ocean', name: 'Ocean Drive', kind: 'drive',
    pts: [[38.931, -74.92], [38.948, -74.88], [38.962, -74.845], [38.975, -74.83], [38.99, -74.815], [39.002, -74.8], [39.02, -74.785], [39.05, -74.757], [39.075, -74.735], [39.1, -74.718], [39.125, -74.703], [39.153, -74.69], [39.18, -74.675], [39.21, -74.655], [39.24, -74.627], [39.27, -74.59], [39.292, -74.562], [39.31, -74.535], [39.322, -74.5], [39.335, -74.48], [39.35, -74.455], [39.364, -74.425]],
  },
  { id: 'cw-wildwood', name: 'The Wildwood causeway', kind: 'causeway', pts: [[39.017, -74.874], [39.006, -74.85], [38.998, -74.828]] },
  { id: 'cw-stone', name: 'Stone Harbor Boulevard', kind: 'causeway', pts: [[39.07, -74.82], [39.06, -74.79], [39.053, -74.765]] },
  { id: 'cw-avalon', name: 'Avalon Boulevard', kind: 'causeway', pts: [[39.113, -74.79], [39.105, -74.755], [39.1, -74.725]] },
  { id: 'cw-seaisle', name: 'Sea Isle Boulevard', kind: 'causeway', pts: [[39.17, -74.765], [39.16, -74.73], [39.154, -74.697]] },
  { id: 'cw-oc', name: 'Ninth Street bridge', kind: 'causeway', pts: [[39.302, -74.612], [39.29, -74.595], [39.281, -74.578]] },
  { id: 'cw-ac', name: 'The Albany Avenue causeway', kind: 'causeway', pts: [[39.385, -74.5], [39.37, -74.465], [39.36, -74.445]] },
  { id: 'br-bf', name: 'Ben Franklin Bridge', kind: 'bridge', pts: [[39.9535, -75.1435], [39.952, -75.13], [39.95, -75.122]] },
  { id: 'br-ww', name: 'Walt Whitman Bridge', kind: 'bridge', since: 1957, pts: [[39.906, -75.157], [39.905, -75.142], [39.904, -75.128]] },
  { id: 'ferry', name: 'Cape May–Lewes Ferry', kind: 'ferry', since: 1964, pts: [[38.968, -74.962], [38.92, -75.0], [38.84, -75.08]] },
];

/**
 * The back-bay marshes behind the barrier islands, as a band between the
 * mainland's edge (Route 9) and the inland side of the islands. Clipped to
 * the land, so the channels and bays stay water.
 */
export const MARSH_BANDS: LatLon[][] = [
  [[38.955, -74.905], [39.02, -74.88], [39.085, -74.83], [39.19, -74.745], [39.29, -74.635], [39.36, -74.565], [39.43, -74.5], [39.53, -74.45], [39.6, -74.42],
    [39.6, -74.33], [39.5, -74.36], [39.43, -74.39], [39.375, -74.44], [39.345, -74.475], [39.32, -74.51], [39.29, -74.57], [39.24, -74.635], [39.18, -74.682], [39.12, -74.712], [39.06, -74.755], [39.01, -74.795], [38.985, -74.83], [38.96, -74.858]],
  // Along the Delaware Bay shore of Cape May and Cumberland counties.
  [[38.97, -74.965], [39.06, -74.94], [39.15, -74.93], [39.23, -74.98], [39.27, -75.05], [39.3, -75.15], [39.36, -75.3], [39.42, -75.42], [39.36, -75.45], [39.28, -75.25], [39.22, -75.09], [39.16, -75.0], [39.06, -74.99], [38.98, -74.99]],
];

/** The Pine Barrens: little pines stippled inland. */
export const PINES: LatLon[] = [[39.98, -74.62], [39.95, -74.4], [39.82, -74.28], [39.65, -74.42], [39.58, -74.55], [39.5, -74.7], [39.36, -74.82], [39.25, -74.85], [39.3, -74.92], [39.45, -74.86], [39.62, -74.72], [39.78, -74.66], [39.9, -74.72]];

export interface WaterLabel { n: string; at: LatLon; size: number; rot?: number }
export const WATER_LABELS: WaterLabel[] = [
  { n: 'ATLANTIC OCEAN', at: [39.05, -74.42], size: 2.6, rot: -35 },
  { n: 'Delaware Bay', at: [39.08, -75.12], size: 2, rot: -35 },
  { n: 'Great Egg Harbor Bay', at: [39.3, -74.635], size: 0.9, rot: -40 },
  { n: 'Great Bay', at: [39.51, -74.38], size: 1.0, rot: -20 },
  { n: 'Delaware River', at: [39.75, -75.47], size: 1.4, rot: -55 },
  { n: 'Absecon Bay', at: [39.405, -74.45], size: 0.6, rot: -30 },
  { n: 'Great Sound', at: [39.115, -74.745], size: 0.6, rot: -45 },
  { n: 'Grassy Sound', at: [39.015, -74.815], size: 0.45, rot: -45 },
];

export const LAND_LABELS: WaterLabel[] = [
  { n: 'THE PINE BARRENS', at: [39.75, -74.5], size: 1.5, rot: -12 },
  { n: 'CAPE MAY COUNTY', at: [39.16, -74.86], size: 0.9, rot: -55 },
  { n: 'ATLANTIC COUNTY', at: [39.52, -74.75], size: 1.0, rot: -30 },
  { n: 'CUMBERLAND COUNTY', at: [39.33, -75.15], size: 1.0, rot: -20 },
  { n: 'GLOUCESTER', at: [39.72, -75.2], size: 0.9, rot: -30 },
  { n: 'NEW JERSEY', at: [39.58, -74.95], size: 1.8, rot: -20 },
  { n: 'DELAWARE', at: [38.95, -75.33], size: 1.4 },
  { n: 'PENNSYLVANIA', at: [40.04, -75.32], size: 1.4 },
];

export type TownRank = 1 | 2 | 3;
export interface Town {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** 1 = a game city with a big Doo Wop sign; 2 = a town; 3 = a village. */
  rank: TownRank;
  /** The engine's city, when it is one. */
  city?: string;
  /** A street-level view exists for it. */
  street?: boolean;
  /** Label side. */
  side?: 'l' | 'r';
  shore?: boolean;
  blurb?: string;
}

export const TOWNS: Town[] = [
  { id: 'wildwood', name: 'Wildwood', lat: 38.9918, lon: -74.8149, rank: 1, city: 'wildwood', street: true, side: 'r', shore: true, blurb: 'Little Las Vegas: neon, motels and the Boardwalk.' },
  { id: 'capemay', name: 'Cape May', lat: 38.9351, lon: -74.906, rank: 1, city: 'capemay', side: 'l', shore: true, blurb: 'Victorian hotels and quiet money.' },
  { id: 'oceancity', name: 'Ocean City', lat: 39.2776, lon: -74.5746, rank: 1, city: 'oceancity', side: 'r', shore: true, blurb: 'A dry town. Thirsty people pay well.' },
  { id: 'ac', name: 'Atlantic City', lat: 39.3643, lon: -74.4229, rank: 1, city: 'ac', side: 'r', shore: true, blurb: 'The faded queen of the resorts. Manno\'s turf.' },
  { id: 'vineland', name: 'Vineland', lat: 39.4864, lon: -75.026, rank: 1, city: 'vineland', side: 'l' },
  { id: 'camden', name: 'Camden', lat: 39.9259, lon: -75.1196, rank: 1, city: 'camden', side: 'r' },
  { id: 'philadelphia', name: 'Philadelphia', lat: 39.9526, lon: -75.1652, rank: 1, city: 'philadelphia', side: 'l' },
  { id: 'crest', name: 'Wildwood Crest', lat: 38.9748, lon: -74.8335, rank: 2, side: 'r', shore: true },
  { id: 'nww', name: 'North Wildwood', lat: 39.0004, lon: -74.7993, rank: 2, side: 'r', shore: true },
  { id: 'stone', name: 'Stone Harbor', lat: 39.051, lon: -74.7579, rank: 2, side: 'r', shore: true },
  { id: 'avalon', name: 'Avalon', lat: 39.1012, lon: -74.7177, rank: 2, side: 'r', shore: true },
  { id: 'seaisle', name: 'Sea Isle City', lat: 39.1534, lon: -74.6929, rank: 2, side: 'r', shore: true },
  { id: 'margate', name: 'Margate', lat: 39.3279, lon: -74.5035, rank: 2, side: 'r', shore: true },
  { id: 'ventnor', name: 'Ventnor', lat: 39.3401, lon: -74.4774, rank: 3, side: 'r', shore: true },
  { id: 'brigantine', name: 'Brigantine', lat: 39.4101, lon: -74.3646, rank: 3, side: 'r', shore: true },
  { id: 'rio', name: 'Rio Grande', lat: 39.0193, lon: -74.8774, rank: 2, side: 'l' },
  { id: 'cmch', name: 'Cape May Court House', lat: 39.0826, lon: -74.8238, rank: 2, side: 'l' },
  { id: 'villas', name: 'Villas', lat: 39.0287, lon: -74.9382, rank: 3, side: 'l' },
  { id: 'woodbine', name: 'Woodbine', lat: 39.2418, lon: -74.8152, rank: 3, side: 'l' },
  { id: 'somers', name: 'Somers Point', lat: 39.3176, lon: -74.5946, rank: 2, side: 'l' },
  { id: 'pleasantville', name: 'Pleasantville', lat: 39.3898, lon: -74.524, rank: 2, side: 'l' },
  { id: 'absecon', name: 'Absecon', lat: 39.4284, lon: -74.4957, rank: 3, side: 'l' },
  { id: 'mays', name: 'Mays Landing', lat: 39.4523, lon: -74.7277, rank: 3, side: 'l' },
  { id: 'egg', name: 'Egg Harbor City', lat: 39.5287, lon: -74.6479, rank: 3, side: 'r' },
  { id: 'hammonton', name: 'Hammonton', lat: 39.6365, lon: -74.8024, rank: 2, side: 'r', blurb: 'Blueberry capital of the world.' },
  { id: 'millville', name: 'Millville', lat: 39.4021, lon: -75.0393, rank: 2, side: 'l', blurb: 'Glass works and the Maurice River.' },
  { id: 'bridgeton', name: 'Bridgeton', lat: 39.4273, lon: -75.2341, rank: 2, side: 'l' },
  { id: 'portnorris', name: 'Port Norris', lat: 39.2457, lon: -75.0352, rank: 3, side: 'l', blurb: 'Oyster boats on the Maurice River Cove.' },
  { id: 'glassboro', name: 'Glassboro', lat: 39.7029, lon: -75.1118, rank: 3, side: 'l' },
  { id: 'woodbury', name: 'Woodbury', lat: 39.8382, lon: -75.1527, rank: 3, side: 'l' },
  { id: 'cherryhill', name: 'Cherry Hill', lat: 39.9349, lon: -75.0307, rank: 3, side: 'r' },
  { id: 'tuckerton', name: 'Tuckerton', lat: 39.6034, lon: -74.3401, rank: 3, side: 'l' },
];

/** Landmarks drawn as little vignettes at closer zoom. */
export interface Landmark { n: string; lat: number; lon: number; kind: 'light' | 'pier' | 'elephant' | 'hall' | 'bridge'; since?: number }
export const REGION_LANDMARKS: Landmark[] = [
  { n: 'Cape May Light', lat: 38.9331, lon: -74.9603, kind: 'light' },
  { n: 'Hereford Inlet Light', lat: 39.0066, lon: -74.7915, kind: 'light' },
  { n: 'Absecon Light', lat: 39.3662, lon: -74.4142, kind: 'light' },
  { n: 'Steel Pier', lat: 39.3611, lon: -74.4214, kind: 'pier' },
  { n: 'Lucy the Elephant', lat: 39.3204, lon: -74.5121, kind: 'elephant' },
  { n: 'Hunt\'s Pier', lat: 38.9938, lon: -74.8044, kind: 'pier' },
];

/** The road map's little drawings: boats, gulls, what each town is known for. */
export type DoodleKind = 'sail' | 'liner' | 'gull' | 'berries' | 'egg' | 'glass' | 'oyster' | 'umbrella' | 'compass' | 'fish' | 'plane';
export interface Doodle { kind: DoodleKind; at: LatLon; label?: string; rot?: number; tier?: number }
export const DOODLES: Doodle[] = [
  { kind: 'compass', at: [38.98, -74.38] },
  { kind: 'liner', at: [39.22, -74.36] },
  { kind: 'sail', at: [39.06, -74.6] },
  { kind: 'sail', at: [39.33, -74.33], tier: 1 },
  { kind: 'sail', at: [39.03, -75.06] },
  { kind: 'sail', at: [39.29, -74.62], tier: 1 },
  { kind: 'fish', at: [38.92, -74.72] },
  { kind: 'gull', at: [39.12, -74.55] },
  { kind: 'gull', at: [39.45, -74.3], tier: 1 },
  { kind: 'oyster', at: [39.19, -75.04], label: 'Oyster boats' },
  { kind: 'berries', at: [39.665, -74.77], label: 'Blueberries' },
  { kind: 'egg', at: [39.515, -75.0], label: 'Egg Basket of the World' },
  { kind: 'glass', at: [39.375, -75.065], label: 'Glass works' },
  { kind: 'umbrella', at: [38.985, -74.8], tier: 1 },
  { kind: 'umbrella', at: [39.27, -74.565], tier: 1 },
  { kind: 'umbrella', at: [38.928, -74.915], tier: 1 },
  { kind: 'plane', at: [39.455, -74.577], label: 'NAFEC airfield', tier: 1 },
];
