import type { Lot } from '../../engine/econState';
import { BUILD_STAGES, USES_BY_ID, buildWeeks, stageWeeks, useIcon, type UseIcon } from '../../engine/property';
import type { FactionId } from '../../engine/types';

/**
 * Building icons for the map, as inline SVG strings (Leaflet divIcons and the
 * island SVG both use them). The icon follows the lot's stage — an empty lot,
 * survey stakes, a crew with a bulldozer, a poured slab, a timber frame, walls
 * going up under a crane — and, once open, the kind of place it is: hotel,
 * motel, house, apartments, store, pizza, club, pier attraction, warehouse,
 * public building. Colour shows the owner; a ring shows construction progress;
 * the crane swings (CSS animation `llv-crane`).
 */

export const OWNER_COLOR: Record<string, string> = {
  player: '#e7c25a', manno: '#c0453a', feldstein: '#6273c8', kessler: '#3c9e66', philly: '#8f5cb0', law: '#3f7fb0', none: '#9a8f7a',
  private: '#a89e88', city: '#6aa0c4', sale: '#5fae7f', lease: '#6aa7c9',
};

export function lotColor(l: Lot): string {
  if (l.status === 'sale' && !l.use) return OWNER_COLOR.sale;
  if (l.status === 'lease') return OWNER_COLOR.lease;
  if (l.status === 'owned' || l.status === 'leased') return OWNER_COLOR.player;
  return OWNER_COLOR[l.owner as FactionId | 'private' | 'city'] ?? OWNER_COLOR.private;
}

/** 0..1 through construction (permits to opening). */
export function lotProgress(l: Lot): number {
  if (!l.use || !l.stage || l.stage === 'purchase') return 0;
  if (l.stage === 'open') return 1;
  const u = USES_BY_ID[l.use];
  const w = stageWeeks(buildWeeks(l, u));
  const i = BUILD_STAGES.indexOf(l.stage as (typeof BUILD_STAGES)[number]);
  return Math.min(1, (i + Math.min(1, (l.stageWeek ?? 0) / Math.max(1, w[l.stage]))) / BUILD_STAGES.length);
}

const INK = '#0b0a09';

const TYPE: Record<UseIcon, (c: string) => string> = {
  hotel: (c) => `<rect x="7" y="3" width="10" height="18" fill="${c}" stroke="${INK}"/><path d="M9 6h2M13 6h2M9 9h2M13 9h2M9 12h2M13 12h2M9 15h2M13 15h2" stroke="${INK}"/><rect x="11" y="18" width="2" height="3" fill="${INK}"/>`,
  motel: (c) => `<rect x="2" y="12" width="17" height="8" fill="${c}" stroke="${INK}"/><path d="M5 15h2M9 15h2M13 15h2" stroke="${INK}"/><path d="M20.5 20V5" stroke="${INK}" stroke-width="1.5"/><rect x="18" y="4" width="5" height="5" rx="1" fill="#e2563d" stroke="${INK}"/>`,
  house: (c) => `<path d="M4 11L12 4l8 7v9H4z" fill="${c}" stroke="${INK}"/><rect x="10" y="14" width="4" height="6" fill="${INK}"/>`,
  apartment: (c) => `<rect x="4" y="6" width="16" height="15" fill="${c}" stroke="${INK}"/><path d="M7 9h2M11 9h2M15 9h2M7 13h2M11 13h2M15 13h2M7 17h2M15 17h2" stroke="${INK}"/>`,
  store: (c) => `<rect x="4" y="10" width="16" height="10" fill="${c}" stroke="${INK}"/><path d="M3 10l2-4h14l2 4z" fill="#f3ead6" stroke="${INK}"/><path d="M7 6v4M11 6v4M15 6v4" stroke="#c0453a"/><rect x="10" y="14" width="4" height="6" fill="${INK}"/>`,
  pizza: (c) => `<path d="M12 21L4 7q8-5 16 0z" fill="${c}" stroke="${INK}"/><circle cx="10" cy="10" r="1.3" fill="#c0453a"/><circle cx="14" cy="11" r="1.3" fill="#c0453a"/><circle cx="12" cy="15" r="1.2" fill="#c0453a"/>`,
  club: (c) => `<path d="M5 4h14l-7 8z" fill="${c}" stroke="${INK}"/><path d="M12 12v7M8 20h8" stroke="${INK}" stroke-width="1.6"/><circle cx="17" cy="5" r="1.4" fill="#e2563d"/>`,
  pier: (c) => `<circle cx="12" cy="10" r="7" fill="none" stroke="${c}" stroke-width="2"/><path d="M12 3v14M5 10h14M7 5l10 10M17 5L7 15" stroke="${INK}" stroke-width="0.8"/><path d="M8 21l4-11 4 11" fill="none" stroke="${INK}" stroke-width="1.4"/>`,
  warehouse: (c) => `<path d="M2 11l10-5 10 5v10H2z" fill="${c}" stroke="${INK}"/><rect x="8" y="14" width="8" height="7" fill="${INK}"/><path d="M8 16h8M8 18h8" stroke="${c}"/>`,
  public: (c) => `<path d="M3 9l9-5 9 5z" fill="${c}" stroke="${INK}"/><path d="M5 10v9M9.5 10v9M14.5 10v9M19 10v9" stroke="${INK}" stroke-width="1.6"/><rect x="3" y="19" width="18" height="2" fill="${c}" stroke="${INK}"/>`,
};

function crane(c: string): string {
  return `<g class="llv-crane"><path d="M19 22V4M19 4H6M19 4l-4 3" stroke="${INK}" stroke-width="1.4" fill="none"/><path d="M8 4v5" stroke="${c}" stroke-width="1"/><rect x="6.5" y="9" width="3" height="2" fill="${c}"/></g>`;
}

/**
 * A motel or hotel in its architectural style (the Empire Designer's
 * building record): a Doo Wop boomerang roof and starburst, a Deco stepped
 * top, a Tiki A-frame, Colonial columns, a Mid-century flat slab, Victorian
 * gables. The walls take the style's pastel; the sign takes the neon.
 */
const STYLE_ART: Record<string, (c: string, wall: string) => string> = {
  doowop: (c, w) => `<rect x="3" y="11" width="15" height="9" fill="${w}" stroke="${INK}"/><path d="M1 11.5L11 7.5l9 3v1.5L11 9 1 13z" fill="#f2f0e6" stroke="${INK}" stroke-width="0.8"/><path d="M6 14h2M10 14h2M14 14h2" stroke="${INK}"/><path d="M21 20V6" stroke="${INK}" stroke-width="1.4"/><rect x="18.5" y="3" width="5" height="4" rx="2" fill="${c}" stroke="${INK}" transform="rotate(-10 21 5)"/><path d="M5 4l.6 1.4L7 6l-1.4.6L5 8l-.6-1.4L3 6l1.4-.6z" fill="${c}"/>`,
  deco: (c, w) => `<rect x="4" y="9" width="14" height="11" fill="${w}" stroke="${INK}"/><path d="M4 9h14V7h-3V5H7v2H4z" fill="${w}" stroke="${INK}"/><path d="M7 12h8M7 15h8" stroke="${INK}"/><path d="M11 5V2" stroke="${INK}"/><circle cx="11" cy="2" r="1.2" fill="${c}"/><path d="M21 20V8" stroke="${INK}" stroke-width="1.4"/><rect x="19" y="5" width="4" height="4" fill="${c}" stroke="${INK}"/>`,
  tiki: (c, w) => `<path d="M3 20V13L11 3l8 10v7z" fill="${w}" stroke="${INK}"/><path d="M6 12L11 5l5 7" fill="#d8b25c" stroke="${INK}" stroke-width="0.8"/><rect x="9.5" y="15" width="3" height="5" fill="${INK}"/><path d="M1.5 20v-6M20.5 20v-6" stroke="${INK}"/><circle cx="1.5" cy="13" r="1.3" fill="${c}"/><circle cx="20.5" cy="13" r="1.3" fill="${c}"/>`,
  colonial: (c, w) => `<rect x="3" y="11" width="16" height="9" fill="${w}" stroke="${INK}"/><path d="M2 11l9-6 9 6z" fill="#5b6770" stroke="${INK}"/><path d="M6 12v8M9.5 12v8M13 12v8M16.5 12v8" stroke="#fff" stroke-width="1.2"/><path d="M22 20V8" stroke="${INK}" stroke-width="1.2"/><rect x="20" y="5" width="4" height="4" fill="${c}" stroke="${INK}"/>`,
  midcentury: (c, w) => `<rect x="3" y="11" width="15" height="9" fill="${w}" stroke="${INK}"/><rect x="1" y="9.5" width="19" height="1.8" fill="#efe9dc" stroke="${INK}" stroke-width="0.6"/><path d="M5 13h4v4H5zM11 13h5v4h-5z" fill="#9fd3e0" stroke="${INK}" stroke-width="0.6"/><path d="M21 20V7" stroke="${INK}" stroke-width="1.4"/><rect x="18.5" y="4" width="5" height="4" fill="${c}" stroke="${INK}"/>`,
  victorian: (c, w) => `<rect x="3" y="11" width="16" height="9" fill="${w}" stroke="${INK}"/><path d="M3 11l4-6 4 6M11 11l4-6 4 6" fill="#7b5a7e" stroke="${INK}"/><path d="M3 17h16" stroke="#fff" stroke-dasharray="1 1.4"/><circle cx="7" cy="8.5" r="1" fill="${c}"/><path d="M22 20V9" stroke="${INK}" stroke-width="1.2"/><rect x="20" y="6" width="4" height="3.5" fill="${c}" stroke="${INK}"/>`,
};
const STYLE_WALL: Record<string, string> = { doowop: '#f7c6d4', deco: '#f1e4c6', tiki: '#c98d55', colonial: '#f4f1e8', midcentury: '#e8d9b5', victorian: '#bfe0d6' };

/** The stage art (no ring). */
function stageArt(l: Lot, c: string, look?: { style?: string; sign?: string }): string {
  const st = l.stage;
  if (!l.use || !st || st === 'purchase') {
    return `<rect x="3" y="6" width="18" height="14" fill="${c}" fill-opacity="0.18" stroke="${c}" stroke-dasharray="2 2"/>${st === 'purchase' ? `<text x="12" y="17" font-size="9" text-anchor="middle" fill="${c}" font-weight="700">$</text>` : ''}`;
  }
  if (st === 'open') {
    const icon = useIcon(USES_BY_ID[l.use]);
    if (look?.style && STYLE_ART[look.style] && (icon === 'motel' || icon === 'hotel' || icon === 'club')) return STYLE_ART[look.style](look.sign ?? c, STYLE_WALL[look.style]);
    return TYPE[icon](c);
  }
  if (st === 'permits') return `<rect x="3" y="8" width="18" height="12" fill="${c}" fill-opacity="0.15" stroke="${c}" stroke-dasharray="2 2"/><path d="M6 20V9M18 20V9M6 12h12" stroke="${INK}" stroke-width="1.2"/><path d="M6 9l4 1.5-4 1.5z" fill="#e2563d"/><path d="M18 9l4 1.5-4 1.5z" fill="#e2563d"/>`;
  if (st === 'siteprep') return `<rect x="3" y="15" width="18" height="5" fill="#8a6a44"/><rect x="5" y="9" width="9" height="5" fill="${c}" stroke="${INK}"/><rect x="11" y="6" width="3" height="3" fill="${c}" stroke="${INK}"/><path d="M3 13l2-2v4z" fill="${INK}"/><circle cx="7" cy="16" r="1.5" fill="${INK}"/><circle cx="12" cy="16" r="1.5" fill="${INK}"/><circle cx="18" cy="11" r="1.6" fill="#f3ead6" stroke="${INK}"/>`;
  if (st === 'foundation') return `<rect x="3" y="15" width="18" height="5" fill="#9a9a94" stroke="${INK}"/><path d="M5 15v-5M9 15v-5M13 15v-5M17 15v-5" stroke="#b05a2a" stroke-width="1.2"/><rect x="3" y="18" width="18" height="2" fill="${c}"/>`;
  const frame = `<path d="M4 20V10L12 5l8 5v10M4 10h16M8 20V10M12 20V5M16 20V10M4 15h16" stroke="#b07a3a" stroke-width="1.3" fill="none"/>`;
  if (st === 'framing') return `${frame}<rect x="3" y="19" width="18" height="2" fill="${c}"/>${crane(c)}`;
  if (st === 'exterior') return `${frame}<path d="M4 20V12h8v8z" fill="${c}" fill-opacity="0.85" stroke="${INK}"/>${crane(c)}`;
  return `<path d="M4 20V10L12 5l8 5v10z" fill="${c}" fill-opacity="0.9" stroke="${INK}"/><path d="M8 13h2M14 13h2" stroke="${INK}"/>${crane(c)}`;
}

/** The full icon: art, a progress ring while building, a glow for new buildings. */
export function lotSvg(l: Lot, opts: { size?: number; glow?: boolean; dim?: boolean; look?: { style?: string; sign?: string } } = {}): string {
  const size = opts.size ?? 22;
  const c = lotColor(l);
  const building = !!l.use && !!l.stage && l.stage !== 'purchase' && l.stage !== 'open';
  const p = lotProgress(l);
  const R = 11.5;
  const C = 2 * Math.PI * R;
  const ring = building ? `<circle cx="12" cy="12" r="${R}" fill="none" stroke="#0b0a09" stroke-opacity="0.5" stroke-width="2"/><circle cx="12" cy="12" r="${R}" fill="none" stroke="${c}" stroke-width="2" stroke-dasharray="${(C * p).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 12 12)"/>` : '';
  const glow = opts.glow ? `<circle cx="12" cy="12" r="11.5" fill="#ecd38f" fill-opacity="0.18" stroke="#ecd38f" stroke-width="0.8"/>` : '';
  const stop = l.stopWork ? `<path d="M2 2l20 20M22 2L2 22" stroke="#e2563d" stroke-width="2"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 26 26" width="${size}" height="${size}" style="overflow:visible${opts.dim ? ';opacity:0.45' : ''}"><circle cx="12" cy="12" r="12.5" fill="#0b0a09" fill-opacity="0.55"/>${glow}${ring}${stageArt(l, c, opts.look)}${stop}</svg>`;
}

/**
 * What a lot looked like in a given year (the map's timeline): the building
 * that stood then, a site under construction, or empty ground.
 */
export function lotAsOf(l: Lot, year: number, now: number): Lot | undefined {
  if (year >= now) return l;
  const past = (l.past ?? []).find((p) => p.from <= year && p.to > year);
  if (past) return { ...l, use: past.use, stage: 'open', stopWork: undefined };
  if (l.use && l.stage === 'open' && (l.builtYear ?? 0) <= year) return l;
  if (l.use && (l.started ?? 9999) <= year) return { ...l, stage: 'framing', stageWeek: 0, stopWork: undefined };
  return { ...l, use: undefined, stage: undefined, stopWork: undefined };
}
