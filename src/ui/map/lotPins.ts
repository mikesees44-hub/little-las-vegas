import type * as Leaflet from 'leaflet';
import type { Lot, ZoneId } from '../../engine/econState';
import { lotName, STAGE_LABEL, USES_BY_ID, ZONES_BY_ID } from '../../engine/property';
import type { GameState } from '../../engine/types';
import { fmt$ } from '../format';

/**
 * The property market on the Leaflet map, at the deepest zoom: every lot as a
 * small pin whose glyph shows its construction stage ($ bought, § permits,
 * ≈ site prep, ▁ foundation, # framing, ▣ exterior, ◩ interior, ★ open) and
 * whose colour shows who holds it.
 */

export const LOT_GLYPH: Record<string, string> = { purchase: '$', permits: '§', siteprep: '≈', foundation: '▁', framing: '#', exterior: '▣', interior: '◩', open: '★' };

/** Off-island zones: a center to lay the lots around. */
const CENTERS: Partial<Record<ZoneId, [number, number]>> = {
  westww: [38.9921, -74.8262],
  ac: [39.3606, -74.4262],
  sphilly: [39.9236, -75.1662],
};

/** Minimum zoom for lot pins. */
export const LOT_ZOOM = 14.5;

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
  const status = { sale: `For sale ${fmt$(l.price)}`, lease: `For lease ${fmt$(l.rent)}/wk`, private: 'Privately held', owned: 'Yours', leased: 'Yours (leased)', rival: 'Rival-owned' }[l.status];
  const stage = l.stage ? ` · ${STAGE_LABEL[l.stage]}` : '';
  const what = l.use ? USES_BY_ID[l.use].name : 'Vacant lot';
  return `<b>${esc(lotName(l))}</b><br>${esc(what)}${esc(stage)}<br>${esc(status)}${l.tenant ? `<br>${esc(l.tenant)}` : ''}`;
}

/** Redraws every lot pin into the layer. */
export function drawLots(L: typeof Leaflet, layer: Leaflet.LayerGroup, s: GameState, geo?: GeoJSON.FeatureCollection): void {
  layer.clearLayers();
  for (const l of s.econ?.lots ?? []) {
    const at = lotPosition(l, geo);
    if (!at) continue;
    const glyph = l.stage ? LOT_GLYPH[l.stage] : '·';
    L.marker(at, { pane: 'pins', icon: L.divIcon({ className: `llv-lot llv-lot-${l.status}`, html: `<span>${glyph}</span>`, iconSize: [14, 14] }) })
      .bindTooltip(lotTooltip(l), { className: 'llv-tip' })
      .addTo(layer);
  }
}
