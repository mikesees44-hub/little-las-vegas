import { drawLots, LOT_ZOOM } from './lotPins';
import { clearTravel, drawTravel } from './travelLayer';
import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import { owned } from '../../engine/business';
import { CATALOG } from '../../engine/catalog';
import { CITY_LIST, CITIES_BY_ID, GROUP_LABEL, stake, type OwnerGroup } from '../../engine/cities';
import { FACTION_NAMES } from '../../engine/world';
import type { FactionId, GameState } from '../../engine/types';
import { fmt$ } from '../format';
import { districtHeat, districtIncome, FACTION_FILL, type MapMode } from '../components/IslandMap';
import { EAST_BOX, SHORE_BOX } from './bounds';
import { COUNTY_HOLDERS, LANDMARKS, NJ_TOWNS, PHILLY_HOODS, STATE_LABELS, TOWN_OWNERS, type Place } from './places';

/**
 * The real map (Leaflet). Three levels by zoom: the nation (cities and their
 * families), South Jersey (counties and towns shaded by who holds them) and
 * Wildwood (the districts, cut from the real island outline). Esri's dark
 * gray tiles are used when the host allows them; otherwise a bundled vector
 * basemap draws land, water, borders, roads and labels.
 */

export const GROUP_COLOR: Record<OwnerGroup | 'kessler', string> = {
  player: '#e0b84a', philly: '#8a5aa8', manno: '#c0392b', newyork: '#4f6fd0', other: '#7d9a80', unclaimed: '#8a8378', exiles: '#2f9a9a', kessler: '#2f8a57',
};

export type Level = 'usa' | 'region' | 'wildwood';
const WILDWOOD: [number, number] = [38.9885, -74.8175];
const VIEWS: Record<Level, { center: [number, number]; zoom: number }> = {
  usa: { center: [37.5, -92], zoom: 4 },
  region: { center: [39.45, -74.85], zoom: 9 },
  wildwood: { center: WILDWOOD, zoom: 14 },
};

export function levelFor(z: number): Level {
  return z >= 12 ? 'wildwood' : z >= 7 ? 'region' : 'usa';
}

const US_BOUNDS: [[number, number], [number, number]] = [[24, -124.5], [49.5, -67]];
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';

export interface WorldMapProps {
  s: GameState;
  mode: MapMode;
  selectedDistrict?: string;
  onDistrict: (id: string) => void;
  onCity: (id: string) => void;
  onEnvoy: (cityId: string) => void;
  /** Plan a trip to a destination (travel layer). */
  onTrip?: (destId: string) => void;
  onLevel?: (l: Level) => void;
  /** Imperative fly-to requests from breadcrumbs (bump the nonce to repeat). */
  flyTo?: { level: Level; nonce: number };
}

export function WorldMap(props: WorldMapProps) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<MapApi | undefined>(undefined);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [L] = await Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]);
        const { loadBasemap } = await import('./geoData');
        const base = await loadBasemap();
        if (cancelled || !host.current) return;
        api.current = buildMap(L.default ?? (L as unknown as typeof Leaflet), host.current, base, latest);
        api.current.update(latest.current);
        setStatus('ready');
        const { loadFine } = await import('./geoFine');
        if (cancelled) return;
        const fine = await loadFine();
        if (cancelled || !api.current) return;
        api.current.addFine(fine);
        api.current.update(latest.current);
      } catch (e) {
        console.error(e);
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
      api.current?.destroy();
      api.current = undefined;
    };
  }, []);

  useEffect(() => {
    api.current?.update(props);
  }, [props.s, props.mode, props.selectedDistrict]);

  useEffect(() => {
    if (props.flyTo) api.current?.fly(props.flyTo.level);
  }, [props.flyTo?.nonce]);

  return (
    <div className="relative w-full h-full">
      <div ref={host} className="absolute inset-0 llv-map" data-testid="island-map" />
      {status === 'loading' && <div className="absolute inset-0 flex items-center justify-center text-stone-500 text-sm">Unfolding the map…</div>}
      {status === 'error' && <div className="absolute inset-0 flex items-center justify-center text-red-400 text-sm">The map could not be drawn.</div>}
    </div>
  );
}

interface MapApi {
  update: (p: WorldMapProps) => void;
  addFine: (f: { land: GeoJSON.FeatureCollection; shore: GeoJSON.FeatureCollection; districts: GeoJSON.FeatureCollection }) => void;
  fly: (l: Level) => void;
  destroy: () => void;
}

function esc(t: string): string {
  return t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function curve(a: [number, number], b: [number, number], n = 24): [number, number][] {
  const mid: [number, number] = [(a[0] + b[0]) / 2 + (b[1] - a[1]) * 0.12, (a[1] + b[1]) / 2 - (b[0] - a[0]) * 0.12];
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push([(1 - t) ** 2 * a[0] + 2 * (1 - t) * t * mid[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * mid[1] + t * t * b[1]]);
  }
  return out;
}

function pointIn(poly: number[][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function outerRing(g: GeoJSON.Geometry): number[][] {
  if (g.type === 'Polygon') return g.coordinates[0];
  if (g.type === 'MultiPolygon') return g.coordinates.slice().sort((a, b) => b[0].length - a[0].length)[0][0];
  return [];
}

/** Deterministic spots inside a polygon for business pins. */
function spots(ring: number[][], n: number): [number, number][] {
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const out: [number, number][] = [];
  let k = 0;
  while (out.length < n && k < 400) {
    k++;
    const x = x0 + ((k * 0.618034) % 1) * (x1 - x0);
    const y = y0 + ((k * 0.7548777) % 1) * (y1 - y0);
    if (pointIn(ring, x, y)) out.push([y, x]);
  }
  return out;
}

function buildMap(L: typeof Leaflet, el: HTMLDivElement, base: import('./geoData').Basemap, latest: { current: WorldMapProps }): MapApi {
  const map = L.map(el, {
    center: VIEWS.usa.center, zoom: VIEWS.usa.zoom, minZoom: 3, maxZoom: 16, zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 90,
    worldCopyJump: false, maxBounds: L.latLngBounds([5, -175], [72, -40]), attributionControl: true, preferCanvas: false, zoomControl: false,
  });
  L.control.zoom({ position: 'topright' }).addTo(map);
  map.attributionControl.setPrefix('');
  const pane = (name: string, z: number) => {
    const p = map.createPane(name);
    p.style.zIndex = String(z);
    return name;
  };
  pane('land', 210);
  pane('mask1', 211);
  pane('land1', 212);
  pane('mask2', 213);
  pane('land2', 214);
  pane('water', 220);
  pane('lines', 230);
  pane('shade', 300);
  pane('districts', 410);
  pane('net', 450);
  pane('pins', 620);
  pane('labels', 640);

  // Esri tiles when the host allows them; the vector basemap otherwise.
  const vector = L.layerGroup().addTo(map);
  const tiles = L.tileLayer(ESRI, { maxZoom: 16, attribution: 'Tiles © Esri — Esri, DeLorme, NAVTEQ', className: 'llv-tiles' });
  const tileLabels = L.tileLayer(ESRI.replace('World_Dark_Gray_Base', 'World_Dark_Gray_Reference'), { maxZoom: 16, pane: 'labels', className: 'llv-tiles' });
  let tileOk = false;
  let tileErr = 0;
  tiles.on('tileload', () => {
    if (!tileOk) {
      tileOk = true;
      el.classList.add('llv-has-tiles');
      // Real tiles: the vector basemap steps aside (game layers stay).
      map.removeLayer(vector);
      tileLabels.addTo(map);
      onZoom();
    }
  });
  tiles.on('tileerror', () => {
    tileErr++;
    if (!tileOk && tileErr >= 2) map.removeLayer(tiles);
  });
  tiles.addTo(map);
  setTimeout(() => {
    if (!tileOk && map.hasLayer(tiles)) map.removeLayer(tiles);
  }, 3000);
  map.attributionControl.addAttribution('Basemap: OpenStreetMap contributors, US Census, Natural Earth');

  const landStyle = { pane: 'land', stroke: true, color: '#3a3328', weight: 0.6, fillColor: '#1d1b18', fillOpacity: 1, interactive: false };
  L.geoJSON(base.land as never, { style: () => landStyle, ...{ interactive: false } }).addTo(vector);
  const lakes = L.geoJSON(base.lakes as never, { style: () => ({ pane: 'water', stroke: true, color: '#1b3446', weight: 0.6, fillColor: '#0c1822', fillOpacity: 1, interactive: false }) }).addTo(vector);
  const rivers = L.geoJSON(base.rivers as never, { style: () => ({ pane: 'water', color: '#1f4560', weight: 1.2, opacity: 0.9, interactive: false }) });
  const stateLines = L.geoJSON(base.stateLines as never, { style: () => ({ pane: 'lines', color: '#6a5f4c', weight: 0.9, opacity: 0.9, interactive: false }) });
  const countyLines = L.geoJSON(base.countyLines as never, { style: () => ({ pane: 'lines', color: '#3b352c', weight: 0.5, opacity: 0.9, dashArray: '2 3', interactive: false }) });
  const borders = L.geoJSON(base.borders as never, { style: () => ({ pane: 'lines', color: '#8a7a58', weight: 1.2, opacity: 0.9, interactive: false }) }).addTo(map);
  stateLines.addTo(map);
  let fineLand: Leaflet.GeoJSON | undefined;
  let shoreLand: Leaflet.GeoJSON | undefined;
  const oceanMask = { stroke: false, fillColor: '#0b1720', fillOpacity: 1, interactive: false };
  let mask1: Leaflet.Rectangle | undefined;
  let mask2: Leaflet.Rectangle | undefined;

  // Roads: US routes, turnpikes and parkways by the year they existed.
  const roadLayer = L.layerGroup();
  let roadsYear = -1;
  function drawRoads(year: number) {
    if (year === roadsYear) return;
    roadsYear = year;
    roadLayer.clearLayers();
    L.geoJSON(base.roads as never, {
      filter: (f) => (f.properties?.y ?? 0) <= year,
      style: (f) => {
        const k = f?.properties?.k;
        return k === 'us' ? { pane: 'lines', color: '#4b4232', weight: 0.8, opacity: 0.85, interactive: false } : { pane: 'lines', color: '#9c7a2c', weight: 1.8, opacity: 0.9, interactive: false };
      },
      onEachFeature: (f, layer) => {
        if (f.properties?.k !== 'us') layer.bindTooltip(String(f.properties?.n), { sticky: true, className: 'llv-road-tip' });
      },
    }).addTo(roadLayer);
  }

  // Territory shading of South Jersey counties.
  const shade = L.geoJSON(base.counties as never, {
    filter: (f) => !!COUNTY_HOLDERS[String(f.id)],
    style: (f) => ({ pane: 'shade', stroke: false, fillColor: GROUP_COLOR[COUNTY_HOLDERS[String(f?.id)]], fillOpacity: 0.16, interactive: false }),
  });

  // Labels by zoom.
  type Lab = { m: Leaflet.Marker; z: number; zMax?: number; since?: number; until?: number };
  const labels: Lab[] = [];
  const labelLayer = L.layerGroup().addTo(map);
  const label = (p: Place, cls: string, zMax?: number) => {
    const m = L.marker([p.lat, p.lon], { pane: 'labels', interactive: false, keyboard: false, icon: L.divIcon({ className: `llv-label ${cls}`, html: `<span>${esc(p.n)}</span>`, iconSize: undefined as never }) });
    labels.push({ m, z: p.z, zMax, since: p.since, until: p.until });
  };
  for (const p of STATE_LABELS) label(p, 'llv-state', 7.5);
  const cityNames = new Set(CITY_LIST.map((c) => c.name.replace(', KY', '')));
  for (const p of base.places) if (!cityNames.has(p.n)) label({ ...p, z: p.z + 1 } as Place, 'llv-place');
  for (const p of NJ_TOWNS) if (!cityNames.has(p.n)) label(p, 'llv-town');
  for (const p of PHILLY_HOODS) label(p, 'llv-hood');
  const landmarkPins: { m: Leaflet.Marker; z: number; since?: number; until?: number }[] = [];
  for (const p of LANDMARKS) {
    const m = L.marker([p.lat, p.lon], { pane: 'pins', icon: L.divIcon({ className: 'llv-landmark', html: `<span class="dot"></span><span class="t">${esc(p.n)}</span>`, iconSize: undefined as never }) });
    if (p.note) m.bindTooltip(`<b>${esc(p.n)}</b><br>${esc(p.note)}`, { className: 'llv-tip', direction: 'top' });
    landmarkPins.push({ m, z: p.z, since: p.since, until: p.until });
  }

  // Cities (national level) and towns (regional).
  const cityLayer = L.layerGroup().addTo(map);
  const townLayer = L.layerGroup();
  const net = L.layerGroup().addTo(map);
  const travelLayer = L.layerGroup().addTo(map);
  const districtLayer = L.layerGroup();
  const districtPins = L.layerGroup();
  const lotLayer = L.layerGroup();
  let districtsGeo: GeoJSON.FeatureCollection | undefined;

  // Popup buttons (capture phase: Leaflet stops propagation inside popups).
  const onPopupClick = (ev: MouseEvent) => {
    const b = (ev.target as HTMLElement | null)?.closest?.('button[data-act]') as HTMLButtonElement | null;
    if (!b || b.disabled) return;
    ev.stopPropagation();
    const id = b.dataset.city!;
    map.closePopup();
    if (b.dataset.act === 'view') latest.current.onCity(id);
    else if (b.dataset.act === 'envoy') latest.current.onEnvoy(id);
    else if (b.dataset.act === 'enter') fly('wildwood');
    else if (b.dataset.act === 'trip') latest.current.onTrip?.(id);
  };
  el.addEventListener('click', onPopupClick, true);

  function cityPopup(s: GameState, id: string): string {
    const c = CITIES_BY_ID[id];
    const run = s.schemes.some((x) => x.owner === 'player' && x.kind === 'envoy' && x.opts.city === id);
    return `<div class="llv-card">
      <div class="r">${esc(c.region.toUpperCase())}</div>
      <div class="n">${esc(c.name)}</div>
      <div class="l"><span class="k">Control:</span> ${esc(c.owner)}${c.group !== 'player' && c.group !== 'unclaimed' ? ` <span class="k">(${esc(c.boss)})</span>` : ''}</div>
      <div class="l"><span class="k">Your stake:</span> ${esc(stake(s, id))}</div>
      <div class="l"><span class="k">Rackets:</span> ${esc(c.rackets.join(', '))}</div>
      <div class="f">${esc(c.flavor)}</div>
      <div class="b">
        ${id === 'wildwood' ? `<button data-act="enter" data-city="${id}">Enter Wildwood</button>` : `<button data-act="view" data-city="${id}">View city</button><button data-act="envoy" data-city="${id}" ${run ? 'disabled' : ''}>${run ? 'Envoy on the way' : 'Send an envoy'}</button><button data-act="trip" data-city="${id}">Travel here</button>`}
      </div></div>`;
  }

  function drawCities(s: GameState) {
    cityLayer.clearLayers();
    for (const c of CITY_LIST) {
      const out = s.outposts.find((o) => o.city === c.id);
      const col = out ? GROUP_COLOR.player : GROUP_COLOR[c.group];
      const r = c.id === 'wildwood' ? 9 : c.difficulty >= 60 ? 8 : 6;
      const m = L.circleMarker([c.lat, c.lon], { pane: 'pins', radius: r, color: out ? '#ecd38f' : '#0b0a09', weight: out ? 2.5 : 1.5, fillColor: col, fillOpacity: 0.95 });
      m.bindTooltip(c.name, { permanent: true, interactive: true, direction: 'right', className: `llv-city ${c.id === 'wildwood' ? 'home' : ''}`, offset: [6, 0] });
      m.getTooltip()?.on('click', () => m.openPopup());
      m.bindPopup(() => cityPopup(latest.current.s, c.id), { className: 'llv-popup', maxWidth: 280, minWidth: 230 });
      m.addTo(cityLayer);
    }
  }

  function drawTowns() {
    townLayer.clearLayers();
    const cityNames = new Set(CITY_LIST.map((c) => c.name));
    for (const t of NJ_TOWNS) {
      const owner = TOWN_OWNERS[t.n];
      if (!owner || cityNames.has(t.n)) continue;
      L.circleMarker([t.lat, t.lon], { pane: 'pins', radius: 4.5, color: '#0b0a09', weight: 1, fillColor: GROUP_COLOR[owner], fillOpacity: 0.95 })
        .bindTooltip(`<b>${esc(t.n)}</b><br>${owner === 'kessler' ? 'Kessler\'s Clubs' : GROUP_LABEL[owner as OwnerGroup]}`, { className: 'llv-tip' })
        .addTo(townLayer);
    }
  }

  function drawNetwork(s: GameState) {
    net.clearLayers();
    const home: [number, number] = [CITIES_BY_ID.wildwood.lat, CITIES_BY_ID.wildwood.lon];
    for (const o of s.outposts) {
      const c = CITIES_BY_ID[o.city];
      if (!c) continue;
      L.polyline(curve(home, [c.lat, c.lon]), { pane: 'net', color: '#e0b84a', weight: o.kind === 'franchise' ? 2.5 : 1.6, opacity: 0.85, dashArray: o.kind === 'contact' ? '3 5' : undefined, interactive: false }).addTo(net);
    }
    for (const sc of s.schemes.filter((x) => x.owner === 'player' && x.kind === 'envoy')) {
      const c = CITIES_BY_ID[sc.opts.city ?? ''];
      if (!c) continue;
      const pts = curve(home, [c.lat, c.lon]);
      L.polyline(pts, { pane: 'net', color: '#f3ead6', weight: 1.4, opacity: 0.8, dashArray: '6 6', className: 'llv-envoy-line', interactive: false }).addTo(net);
      const at = pts[Math.min(pts.length - 1, Math.round((sc.progress / 100) * (pts.length - 1)))];
      L.circleMarker(at, { pane: 'net', radius: 3.5, color: '#f3ead6', fillColor: '#f3ead6', fillOpacity: 1, interactive: false }).addTo(net);
    }
  }

  function districtStyle(s: GameState, id: string, mode: MapMode, selected?: string): Leaflet.PathOptions {
    const d = s.districts.find((x) => x.id === id);
    if (!d) return { opacity: 0, fillOpacity: 0 };
    let color = '#444';
    let op = 0.6;
    if (mode === 'control') {
      const top = (Object.entries(d.influence) as [FactionId, number][]).filter(([f]) => f !== 'none').sort((a, b) => b[1] - a[1])[0] ?? ['none', 0];
      color = FACTION_FILL[top[0]];
      op = 0.3 + 0.55 * (top[1] / 100);
    } else if (mode === 'heat') {
      const h = districtHeat(s, id) / 100;
      color = `rgb(${Math.round(42 + 166 * h)},${Math.round(58 - 10 * h)},${Math.round(74 - 27 * h)})`;
      op = 0.8;
    } else if (mode === 'income') {
      const max = Math.max(1, ...s.districts.map((x) => districtIncome(s, x.id)));
      const t = districtIncome(s, id) / max;
      color = `rgb(${Math.round(42 + 189 * t)},${Math.round(38 + 156 * t)},${Math.round(32 + 58 * t)})`;
      op = 0.8;
    } else {
      const rv = (Object.entries(d.influence) as [FactionId, number][]).filter(([f]) => f !== 'player' && f !== 'none').reduce((a, [, v]) => Math.max(a, v), 0) / 100;
      color = `rgb(${Math.round(42 + 134 * rv)},${Math.round(42 + 6 * rv)},${Math.round(42 + 0 * rv)})`;
      op = 0.8;
    }
    return { pane: 'districts', color: selected === id ? '#ecd38f' : '#0b0a09', weight: selected === id ? 3 : 1.2, fillColor: color, fillOpacity: op };
  }

  function drawDistricts(p: WorldMapProps) {
    if (!districtsGeo) return;
    const s = p.s;
    drawLots(L, lotLayer, s, districtsGeo);
    districtLayer.clearLayers();
    districtPins.clearLayers();
    L.geoJSON(districtsGeo as never, {
      style: (f) => districtStyle(s, String(f?.properties?.id), p.mode, p.selectedDistrict),
      onEachFeature: (f, layer) => {
        const id = String(f.properties?.id);
        const d = s.districts.find((x) => x.id === id);
        layer.on('click', () => latest.current.onDistrict(id));
        if (d) {
          const infl = (Object.entries(d.influence) as [FactionId, number][]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([fa, v]) => `${FACTION_NAMES[fa]} ${v}%`).join('<br>');
          layer.bindTooltip(`<b>${esc(d.name)}</b><br>${infl}<br>Take ~${fmt$(districtIncome(s, id))}/wk · heat ${districtHeat(s, id)}`, { className: 'llv-tip', sticky: true });
        }
      },
    }).addTo(districtLayer);
    for (const f of districtsGeo.features) {
      const id = String(f.properties?.id);
      const ring = outerRing(f.geometry);
      const d = s.districts.find((x) => x.id === id);
      if (!ring.length || !d) continue;
      const biz = owned(s).filter((b) => b.districtId === id);
      const pts = spots(ring, biz.length + 2);
      biz.forEach((b, i) => {
        const cat = CATALOG[b.kind].category;
        L.circleMarker(pts[i + 2] ?? pts[0], { pane: 'pins', radius: 4, color: '#0b0a09', weight: 1, fillColor: cat === 'racket' ? '#b0302a' : cat === 'front' ? '#e7c25a' : '#99aaaa', fillOpacity: 1 })
          .bindTooltip(`<b>${esc(b.name)}</b><br>${esc(CATALOG[b.kind].name)}`, { className: 'llv-tip' })
          .addTo(districtPins);
      });
      const hq = s.rivals.find((r) => r.homeDistrict === id && s.characters[r.leaderId]?.alive);
      const at = pts[0];
      if (at) {
        L.marker(at, { pane: 'labels', interactive: false, icon: L.divIcon({ className: 'llv-label llv-district', html: `<span>${esc(d.name.replace(' Clubs', '').replace('Amusement ', ''))}</span>`, iconSize: undefined as never }) }).addTo(districtPins);
      }
      if (hq && pts[1]) L.marker(pts[1], { pane: 'pins', icon: L.divIcon({ className: 'llv-hq', html: `<span style="background:${FACTION_FILL[hq.id]}">${esc(hq.shortName[0])}</span>`, iconSize: [16, 16] }) }).bindTooltip(`${esc(hq.name)} headquarters`, { className: 'llv-tip' }).addTo(districtPins);
      if (id === 'pacific' && pts[1]) L.marker(pts[1], { pane: 'pins', icon: L.divIcon({ className: 'llv-hq', html: `<span style="background:${FACTION_FILL.player}">${esc(s.houseName[0] ?? 'Y')}</span>`, iconSize: [16, 16] }) }).bindTooltip(`House of ${esc(s.houseName)}`, { className: 'llv-tip' }).addTo(districtPins);
    }
  }

  // Zoom-driven visibility.
  function onZoom() {
    const z = map.getZoom();
    const year = latest.current.s.date.y;
    const toggle = (layer: Leaflet.Layer, on: boolean) => {
      if (on && !map.hasLayer(layer)) layer.addTo(map);
      if (!on && map.hasLayer(layer)) map.removeLayer(layer);
    };
    toggle(shade, z >= 7 && z < 12.5);
    toggle(townLayer, z >= 7.5 && z < 12.5);
    toggle(cityLayer, z < 12);
    toggle(travelLayer, z < 12);
    toggle(districtLayer, z >= 11.5);
    toggle(districtPins, z >= 12.5);
    toggle(lotLayer, z >= LOT_ZOOM);
    const vec = !tileOk;
    if (fineLand && mask1) {
      toggle(mask1, vec && z >= 6.5);
      toggle(fineLand, vec && z >= 6.5);
    }
    if (shoreLand && mask2) {
      toggle(mask2, vec && z >= 10);
      toggle(shoreLand, vec && z >= 10);
    }
    toggle(lakes, vec);
    toggle(rivers, vec && z >= 5);
    toggle(stateLines, vec);
    toggle(countyLines, vec && z >= 7);
    toggle(roadLayer, vec && z >= 6);
    toggle(labelLayer, vec);
    for (const l of labels) {
      const on = z >= l.z && (l.zMax === undefined || z < l.zMax);
      if (on && !labelLayer.hasLayer(l.m)) l.m.addTo(labelLayer);
      if (!on && labelLayer.hasLayer(l.m)) labelLayer.removeLayer(l.m);
    }
    for (const l of landmarkPins) {
      const on = z >= l.z && (l.since ?? 0) <= year && (l.until ?? 9999) > year;
      if (on && !map.hasLayer(l.m)) l.m.addTo(map);
      if (!on && map.hasLayer(l.m)) map.removeLayer(l.m);
    }
    el.dataset.level = levelFor(z);
    latest.current.onLevel?.(levelFor(z));
  }
  map.on('zoomend', onZoom);

  function fly(l: Level) {
    if (l === 'usa') map.flyToBounds(US_BOUNDS, { duration: 1.4 });
    else map.flyTo(VIEWS[l].center, VIEWS[l].zoom, { duration: 1.4 });
  }
  map.fitBounds(US_BOUNDS);

  drawTowns();
  onZoom();
  void lakes;
  void borders;

  return {
    update(p) {
      drawRoads(p.s.date.y);
      drawCities(p.s);
      drawNetwork(p.s);
      drawTravel(L, travelLayer, p.s, (id) => latest.current.onTrip?.(id));
      drawDistricts(p);
      onZoom();
    },
    addFine(f) {
      mask1 = L.rectangle(EAST_BOX, { pane: 'mask1', ...oceanMask });
      fineLand = L.geoJSON(f.land as never, { style: () => ({ ...landStyle, pane: 'land1' }) });
      mask2 = L.rectangle(SHORE_BOX, { pane: 'mask2', ...oceanMask });
      shoreLand = L.geoJSON(f.shore as never, { style: () => ({ ...landStyle, pane: 'land2' }) });
      districtsGeo = f.districts;
      onZoom();
    },
    fly,
    destroy() {
      clearTravel();
      el.removeEventListener('click', onPopupClick, true);
      map.remove();
    },
  };
}
