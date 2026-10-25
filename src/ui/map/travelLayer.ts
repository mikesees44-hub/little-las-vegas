import type * as Leaflet from 'leaflet';
import { CITIES_BY_ID } from '../../engine/cities';
import { travellers } from '../../engine/travel';
import { DESTS, MODES, RESORT_IDS } from '../../engine/travelDests';
import { destOf } from '../../engine/trips';
import type { GameState } from '../../engine/types';
import { MODE_SVG } from '../travel/icons';

/**
 * Travellers on the map: each trip as a route from Wildwood with an icon for
 * its mode, moving along the leg it covers this week (the animation loops
 * over the week's stretch of road, rail, air or sea). Resorts that are not
 * map cities get a small diamond pin. The old country is off the edge of
 * the map, so its route runs east to an anchor in the Atlantic.
 */

const OFFMAP: [number, number] = [37.6, -46];

function at(d: { lat: number; lon: number }): [number, number] {
  return d.lon > -40 ? OFFMAP : [d.lat, d.lon];
}

function curve(a: [number, number], b: [number, number], n = 32): [number, number][] {
  const mid: [number, number] = [(a[0] + b[0]) / 2 + (b[1] - a[1]) * 0.1, (a[1] + b[1]) / 2 - (b[0] - a[0]) * 0.1];
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push([(1 - t) ** 2 * a[0] + 2 * (1 - t) * t * mid[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * mid[1] + t * t * b[1]]);
  }
  return out;
}

function along(pts: [number, number][], f: number): [number, number] {
  const x = Math.max(0, Math.min(1, f)) * (pts.length - 1);
  const i = Math.floor(x);
  const j = Math.min(pts.length - 1, i + 1);
  const t = x - i;
  return [pts[i][0] + (pts[j][0] - pts[i][0]) * t, pts[i][1] + (pts[j][1] - pts[i][1]) * t];
}

function esc(t: string): string {
  return t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

let timers: number[] = [];

export function clearTravel(): void {
  for (const t of timers) clearInterval(t);
  timers = [];
}

export function drawTravel(L: typeof Leaflet, layer: Leaflet.LayerGroup, s: GameState, onDest?: (destId: string) => void): void {
  clearTravel();
  layer.clearLayers();
  const home: [number, number] = [CITIES_BY_ID.wildwood.lat, CITIES_BY_ID.wildwood.lon];
  // Resort pins (the ones that are not already map cities).
  for (const id of RESORT_IDS) {
    const d = DESTS[id];
    if (CITIES_BY_ID[id]) continue;
    const off = d.lon > -40;
    const m = L.marker(at(d), { pane: 'pins', icon: L.divIcon({ className: 'llv-resort', html: `<span class="dia"></span><span class="t">${esc(off ? `→ ${d.name}` : d.name)}</span>`, iconSize: undefined as never }) });
    m.bindTooltip(`<b>${esc(d.name)}</b><br>${esc(d.blurb)}<br><i>Click to plan a trip</i>`, { className: 'llv-tip', direction: 'top' });
    if (onDest) m.on('click', () => onDest(id));
    m.addTo(layer);
  }
  for (const p of travellers(s)) {
    const t = p.trip;
    if (p.phase === 'booked') continue;
    const d = destOf(t);
    const pts = curve(home, at(d));
    const lam = t.purpose === 'lam';
    L.polyline(pts, { pane: 'net', color: lam ? '#d0453a' : '#8fc3d8', weight: 1.6, opacity: 0.85, dashArray: t.mode === 'plane' ? '2 6' : t.mode === 'ship' ? '8 6' : '5 4', interactive: false }).addTo(layer);
    const leader = s.characters[t.leaderId];
    const icon = L.divIcon({
      className: `llv-traveller ${lam ? 'lam' : ''}`,
      html: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">${MODE_SVG[t.mode]}</svg>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
    const back = p.phase === 'back';
    const pos = (f: number) => along(pts, back ? 1 - f : f);
    const m = L.marker(pos(p.from), { pane: 'pins', icon, keyboard: false });
    const what = lam ? 'on the lam' : p.phase === 'there' ? `in ${d.name}` : back ? `coming home from ${d.name}` : `on the way to ${d.name}`;
    m.bindTooltip(`<b>${esc(leader ? `${leader.firstName} ${leader.lastName}` : '?')}</b> ${esc(what)}<br>${esc(MODES[t.mode].name)}${t.party.length ? ` · ${t.party.length} with him` : ''}`, { className: 'llv-tip', direction: 'top' });
    m.addTo(layer);
    if (p.to > p.from && typeof window !== 'undefined') {
      let k = 0;
      const steps = 60;
      timers.push(window.setInterval(() => {
        k = (k + 1) % (steps + 15);
        m.setLatLng(pos(p.from + (p.to - p.from) * Math.min(1, k / steps)));
      }, 70));
    }
  }
}
