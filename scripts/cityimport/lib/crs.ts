/**
 * Coordinate systems for the city importer.
 *
 *   geographic  EPSG:4326 lon/lat (WGS84). Every source is converted to it first,
 *               and it is kept, unchanged, as the record's original coordinates.
 *   local       metres on a transverse Mercator plane centred on the city's origin
 *               (x east, y north, origin = 0,0, scale 1 on the central meridian).
 *               Accurate to well under a millimetre per 10 km at city scale, so it
 *               works for Philadelphia's 30 km as well as for a beach island.
 *   game        the game's own frame (Wildwood: the island frame u along the shore,
 *               v inland), computed from geographic coordinates by the game's own
 *               frame functions. Stored separately; never used to derive the others.
 *
 * Pure; no I/O.
 */

/** WGS84. */
const A = 6378137;
const F = 1 / 298.257223563;
const E2 = F * (2 - F);
const EP2 = E2 / (1 - E2);
const RAD = Math.PI / 180;

export interface LonLat { lon: number; lat: number }
export type XY = [number, number];

/** Meridional arc length from the equator to latitude phi (radians). */
function meridianArc(phi: number): number {
  const e4 = E2 * E2;
  const e6 = e4 * E2;
  return A * ((1 - E2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * phi
    - ((3 * E2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * phi)
    + ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * phi)
    - ((35 * e6) / 3072) * Math.sin(6 * phi));
}

/** A local transverse Mercator projection about an origin (k0 = 1). */
export interface LocalCrs {
  origin: LonLat;
  /** lon/lat → local metres [x east, y north]. */
  forward: (lon: number, lat: number) => XY;
  /** local metres → [lon, lat]. */
  inverse: (x: number, y: number) => [number, number];
  /** A description to store in city.json. */
  describe: () => { type: 'transverse-mercator'; datum: 'WGS84'; origin: LonLat; k0: 1; units: 'm'; axes: 'x east, y north' };
}

export function localCrs(origin: LonLat): LocalCrs {
  const lon0 = origin.lon * RAD;
  const M0 = meridianArc(origin.lat * RAD);
  const forward = (lon: number, lat: number): XY => {
    const phi = lat * RAD;
    const lam = lon * RAD - lon0;
    const s = Math.sin(phi);
    const c = Math.cos(phi);
    const t = Math.tan(phi);
    const N = A / Math.sqrt(1 - E2 * s * s);
    const T = t * t;
    const C = EP2 * c * c;
    const Aa = lam * c;
    const M = meridianArc(phi);
    const x = N * (Aa + ((1 - T + C) * Aa ** 3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * EP2) * Aa ** 5) / 120);
    const y = M - M0 + N * t * ((Aa * Aa) / 2 + ((5 - T + 9 * C + 4 * C * C) * Aa ** 4) / 24 + ((61 - 58 * T + T * T + 600 * C - 330 * EP2) * Aa ** 6) / 720);
    return [x, y];
  };
  const inverse = (x: number, y: number): [number, number] => {
    const M = M0 + y;
    const mu = M / (A * (1 - E2 / 4 - (3 * E2 * E2) / 64 - (5 * E2 ** 3) / 256));
    const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
    const phi1 = mu + ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu)
      + ((21 * e1 * e1) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu)
      + ((151 * e1 ** 3) / 96) * Math.sin(6 * mu)
      + ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
    const s1 = Math.sin(phi1);
    const c1 = Math.cos(phi1);
    const t1 = Math.tan(phi1);
    const N1 = A / Math.sqrt(1 - E2 * s1 * s1);
    const R1 = (A * (1 - E2)) / (1 - E2 * s1 * s1) ** 1.5;
    const T1 = t1 * t1;
    const C1 = EP2 * c1 * c1;
    const D = x / N1;
    const phi = phi1 - ((N1 * t1) / R1) * ((D * D) / 2 - ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * EP2) * D ** 4) / 24
      + ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * EP2 - 3 * C1 * C1) * D ** 6) / 720);
    const lam = (D - ((1 + 2 * T1 + C1) * D ** 3) / 6 + ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * EP2 + 24 * T1 * T1) * D ** 5) / 120) / c1;
    return [(lon0 + lam) / RAD, phi / RAD];
  };
  return {
    origin,
    forward,
    inverse,
    describe: () => ({ type: 'transverse-mercator', datum: 'WGS84', origin, k0: 1, units: 'm', axes: 'x east, y north' }),
  };
}

/**
 * Ellipsoidal distance in metres (Vincenty's inverse formula, WGS84): the
 * reference the projection's scale is checked against.
 */
export function geodesicDistance(a: [number, number], b: [number, number]): number {
  const L = (b[0] - a[0]) * RAD;
  const U1 = Math.atan((1 - F) * Math.tan(a[1] * RAD));
  const U2 = Math.atan((1 - F) * Math.tan(b[1] * RAD));
  const sU1 = Math.sin(U1), cU1 = Math.cos(U1), sU2 = Math.sin(U2), cU2 = Math.cos(U2);
  let lam = L;
  let sinS = 0, cosS = 0, sig = 0, cos2a = 0, cos2sm = 0;
  for (let i = 0; i < 200; i++) {
    const sl = Math.sin(lam), cl = Math.cos(lam);
    sinS = Math.sqrt((cU2 * sl) ** 2 + (cU1 * sU2 - sU1 * cU2 * cl) ** 2);
    if (sinS === 0) return 0;
    cosS = sU1 * sU2 + cU1 * cU2 * cl;
    sig = Math.atan2(sinS, cosS);
    const sinA = (cU1 * cU2 * sl) / sinS;
    cos2a = 1 - sinA * sinA;
    cos2sm = cos2a === 0 ? 0 : cosS - (2 * sU1 * sU2) / cos2a;
    const C = (F / 16) * cos2a * (4 + F * (4 - 3 * cos2a));
    const prev = lam;
    lam = L + (1 - C) * F * sinA * (sig + C * sinS * (cos2sm + C * cosS * (-1 + 2 * cos2sm * cos2sm)));
    if (Math.abs(lam - prev) < 1e-13) break;
  }
  const B = A * (1 - F);
  const u2 = (cos2a * (A * A - B * B)) / (B * B);
  const AA = 1 + (u2 / 16384) * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)));
  const BB = (u2 / 1024) * (256 + u2 * (-128 + u2 * (74 - 47 * u2)));
  const dS = BB * sinS * (cos2sm + (BB / 4) * (cosS * (-1 + 2 * cos2sm * cos2sm) - (BB / 6) * cos2sm * (-3 + 4 * sinS * sinS) * (-3 + 4 * cos2sm * cos2sm)));
  return B * AA * (sig - dS);
}

/** Rounds a coordinate pair (lon/lat to 1e-7 ≈ 1 cm; metres to 1 cm). */
export const roundLL = (p: [number, number]): [number, number] => [Math.round(p[0] * 1e7) / 1e7, Math.round(p[1] * 1e7) / 1e7];
export const roundM = (p: [number, number], d = 100): [number, number] => [Math.round(p[0] * d) / d, Math.round(p[1] * d) / d];
