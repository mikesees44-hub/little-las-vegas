import type * as Leaflet from 'leaflet';
import type { Lot, ZoneId } from '../../engine/econState';
import { lotName, STAGE_LABEL, USES_BY_ID, ZONES_BY_ID } from '../../engine/property';
import { lotAsOf, lotColor, lotProgress, lotSvg } from './lotIcons';
import { SIGN_HEX } from '../../engine/design';
import type { GameState } from '../../engine/types';
import { fmt$ } from '../format';

/**
 * The property market on the Leaflet map, at the deepest zoom: every lot as a
 * small pin whose glyph shows its construction stage ($ bought, § permits,
 * ≈ site prep, ▁ foundation, # framing, ▣ exterior, ◩ interior, ★ open) and
 * whose colour shows who holds it.
 */


/** Off-island zones: a center to lay the lots around. */
const CENTERS: Partial<Record<ZoneId, [number, number]>> = {
  westww: [38.9921, -74.8262],
  ac: [39.3606, -74.4262],
  sphilly: [39.9236, -75.1662],
};

/** Minimum zoom for building icons (Wildwood level). */
export const LOT_ZOOM = 12.5;

function pointIn(poly: number[][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function ringOf(g: GeoJSON.Geometry): number[][] {
  if (g.type === 'Polygon') return g.coordinates[0];
  if (g.type === 'MultiPolygon') return g.coordinates.slice().sort((a, b) => b[0].length - a[0].length)[0][0];
  return [];
}

/** Where a lot sits: inside its district's polygon, or on a little grid around an off-island center. */
export function lotPosition(l: Lot, geo?: GeoJSON.FeatureCollection): [number, number] | undefined {
  const z = ZONES_BY_ID[l.zone];
  if (z.district && geo) {
    const f = geo.features.find((x) => String(x.properties?.id) === z.district);
    const ring = f ? ringOf(f.geometry) : [];
    if (ring.length) {
      const xs = ring.map((p) => p[0]);
      const ys = ring.map((p) => p[1]);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      let found = 0;
      for (let k = 150; k < 800; k++) {
        const x = x0 + ((k * 0.618034) % 1) * (x1 - x0);
        const y = y0 + ((k * 0.7548777) % 1) * (y1 - y0);
        if (pointIn(ring, x, y)) {
          if (found === l.idx) return [y, x];
          found++;
        }
      }
    }
  }
  const c = CENTERS[l.zone];
  if (!c) return undefined;
  return [c[0] + (Math.floor(l.idx / 3) - 1) * 0.0011, c[1] + ((l.idx % 3) - 1) * 0.0014];
}

function esc(t: string): string {
  return t.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
}

export function lotTooltip(l: Lot): string {
  const status = { sale: `For sale ${fmt$(l.price)}`, lease: `For lease ${fmt$(l.rent)}/wk`, private: 'Privately held', owned: 'Yours', leased: 'Yours (leased)', rival: 'Rival-owned', public: 'The city' }[l.status];
  const stage = l.stage ? ` · ${STAGE_LABEL[l.stage]}${l.stage !== 'open' && l.stage !== 'purchase' ? ` ${Math.round(lotProgress(l) * 100)}%` : ''}` : '';
  const what = l.use ? USES_BY_ID[l.use].name : 'Vacant lot';
  const by = l.developer && l.stage !== 'open' ? `<br>Building: ${esc(l.developer)}${l.contractor ? ' (your crews)' : ''}` : '';
  const built = l.builtYear && l.stage === 'open' ? ` · built ${l.builtYear}` : '';
  return `<b>${esc(lotName(l))}</b><br>${esc(what)}${esc(stage)}${built}<br>${esc(status)}${l.tenant ? `<br>${esc(l.tenant)}` : ''}${by}${l.stopWork ? `<br><span style="color:#e2563d">Stop-work: ${esc(l.stopWork.reason)}</span>` : ''}`;
}

/**
 * The name label under a building: yours always (once the island is in view),
 * rivals' from the normal Wildwood zoom, everyone else's only up close. The
 * tier is a CSS class the map shows or hides by zoom (declutter).
 */
export function lotLabel(s: GameState, l: Lot): { text: string; color: string; tier: 'own-player' | 'own-rival' | 'own-other' } | undefined {
  if (!l.use || !l.stage || l.stage === 'purchase') return undefined;
  const mine = l.status === 'owned' || l.status === 'leased';
  const u = USES_BY_ID[l.use];
  const biz = l.bizId ? s.businesses.find((b) => b.id === l.bizId) : undefined;
  const sign = mine ? s.econ?.designs?.[biz ? biz.id : `lot:${l.id}`]?.sign : undefined;
  const text = (l.name ?? biz?.name ?? u.name) + (l.stage !== 'open' ? ' (building)' : '');
  const tier = mine ? 'own-player' : l.status === 'rival' ? 'own-rival' : 'own-other';
  return { text, color: sign ? SIGN_HEX[sign] : lotColor(l), tier };
}

export interface LotView {
  /** Show the town as it stood in this year. */
  year?: number;
  /** Highlight what went up since 1960. */
  since1960?: boolean;
}

/** Redraws every lot into the layer as a building icon. */
export function drawLots(L: typeof Leaflet, layer: Leaflet.LayerGroup, s: GameState, geo?: GeoJSON.FeatureCollection, view: LotView = {}, onClick?: (lotId: string) => void): void {
  layer.clearLayers();
  for (const raw of s.econ?.lots ?? []) {
    const l = view.year !== undefined ? lotAsOf(raw, view.year, s.date.y) : raw;
    if (!l) continue;
    const at = lotPosition(l, geo);
    if (!at) continue;
    const isNew = !!view.since1960 && l.stage === 'open' && (l.builtYear ?? 0) >= 1960;
    const dim = !!view.since1960 && !isNew;
    const lab = lotLabel(s, l);
    const html = lotSvg(l, { size: 22, glow: isNew, dim }) + (lab && !dim ? `<span class="llv-blabel ${lab.tier}" style="color:${lab.color}">${esc(lab.text)}</span>` : '');
    L.marker(at, { pane: 'pins', icon: L.divIcon({ className: 'llv-lotico', html, iconSize: [22, 22], iconAnchor: [11, 11] }) })
      .bindTooltip(lotTooltip(l), { className: 'llv-tip' })
      .on('click', () => onClick?.(raw.id))
      .addTo(layer);
  }
}
