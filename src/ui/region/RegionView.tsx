import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { CITIES_BY_ID, GROUP_LABEL, type OwnerGroup } from '../../engine/cities';
import type { GameState } from '../../engine/types';
import { getGeo } from '../map/geoData';
import { COUNTY_HOLDERS, TOWN_OWNERS } from '../map/places';
import { GROUP_COLOR } from '../map/WorldMap';
import { CityPanel } from '../map/MapView';
import { lit, mix, type Mood } from '../hood/iso';
import { usePanZoom, type View } from '../hood/usePanZoom';
import {
  DOODLES, LAND_LABELS, MARSH_BANDS, PINES, proj, REGION_BBOX, REGION_BOUNDS, REGION_LANDMARKS, ROADS, TOWNS, WATER_LABELS,
  type Doodle, type LatLon, type Road, type Town,
} from './regionData';

/**
 * South Jersey, illustrated: the region level of the map as a 1960 road-map
 * postcard. Real coastline (the bundled land polygons), the counties tinted
 * by who holds them, the back-bay marshes, the Pine Barrens, the Parkway and
 * the old routes with their shields, the causeways to the islands, and every
 * town; the big ones carry Doo Wop signs in their holder's color. Drag to
 * pan (inertia, bounds), wheel or pinch to zoom, ⌂ Recenter. A town opens
 * its card; Wildwood zooms down to street level (the illustrated island).
 */

type Geo = { land: string; counties: { id: string; d: string }[]; countyLines: string; stateLines: string };

const P = (ll: LatLon) => proj(ll[0], ll[1]);
const WEST_X = proj(39.5, -75.648)[0];
const f2 = (n: number) => n.toFixed(2);

function ringsToPath(rings: number[][][]): string {
  let d = '';
  for (let ri = 0; ri < rings.length; ri++) {
    const r = rings[ri];
    // Holes: only the real lakes and bays, not every farm pond.
    if (r.length < 3 || (ri > 0 && r.length < 14)) continue;
    d += 'M';
    for (let i = 0; i < r.length; i++) {
      const [x, y] = proj(r[i][1], r[i][0]);
      d += `${i ? 'L' : ''}${f2(x)},${f2(y)}`;
    }
    d += 'Z';
  }
  return d;
}

function inBox(rings: number[][][], pad = 0.15): boolean {
  for (const r of rings) for (const [lon, lat] of r) {
    if (lat > REGION_BBOX.s - pad && lat < REGION_BBOX.n + pad && lon > REGION_BBOX.w - pad && lon < REGION_BBOX.e + pad) return true;
  }
  return false;
}

function geomPath(g: GeoJSON.Geometry | null | undefined): string {
  if (!g) return '';
  if (g.type === 'Polygon') return inBox(g.coordinates) ? ringsToPath(g.coordinates) : '';
  if (g.type === 'MultiPolygon') return g.coordinates.filter((p) => inBox(p)).map(ringsToPath).join('');
  return '';
}

function linesPath(ml: GeoJSON.MultiLineString): string {
  let d = '';
  for (const l of ml.coordinates) {
    if (!inBox([l], 0.05)) continue;
    l.forEach(([lon, lat], i) => { const [x, y] = proj(lat, lon); d += `${i ? 'L' : 'M'}${f2(x)},${f2(y)}`; });
  }
  return d;
}

let geoCache: Promise<Geo> | undefined;
function loadRegion(): Promise<Geo> {
  geoCache ??= (async () => {
    const [shore, us] = await Promise.all([getGeo<GeoJSON.FeatureCollection>('land-shore.json'), getGeo<Topology>('us.topo.json')]);
    const land = shore.features.map((f) => geomPath(f.geometry)).join('');
    const cfc = feature(us, us.objects.counties as GeometryCollection) as unknown as GeoJSON.FeatureCollection;
    const counties = cfc.features
      .filter((f) => /^(34|42|10)/.test(String(f.id)))
      .map((f) => ({ id: String(f.id), d: geomPath(f.geometry) }))
      .filter((c) => c.d);
    const countyLines = linesPath(mesh(us, us.objects.counties as GeometryCollection, (a, b) => a !== b && String(a.id).slice(0, 2) === String(b.id).slice(0, 2)) as unknown as GeoJSON.MultiLineString);
    const stateLines = linesPath(mesh(us, us.objects.states as GeometryCollection, (a, b) => a !== b) as unknown as GeoJSON.MultiLineString);
    return { land, counties, countyLines, stateLines };
  })();
  geoCache.catch(() => { geoCache = undefined; });
  return geoCache;
}

/* ---------------- palette ---------------- */

interface Pal { sea: string; sea2: string; wave: string; land: string; beach: string; marsh: string; marshInk: string; pine: string; ink: string; inkSoft: string; halo: string; road: string; roadEdge: string; county: string; paper: string }
const DAY: Pal = {
  sea: '#7fd3d6', sea2: '#5cbfcc', wave: '#ffffff', land: '#f7ecd2', beach: '#f9dfa6', marsh: '#b9cf8a', marshInk: '#7f9f5a', pine: '#5f8f6a',
  ink: '#27405a', inkSoft: '#5b6f80', halo: '#fffaf0', road: '#fffaf0', roadEdge: '#b3532f', county: '#b9a98a', paper: '#fdf6e6',
};
function pal(m: Mood): Pal {
  if (m === 'day') return DAY;
  const o = {} as Record<string, string>;
  for (const [k, v] of Object.entries(DAY)) o[k] = lit(v, m);
  const p = o as unknown as Pal;
  p.ink = m === 'night' ? '#efe2c4' : '#fff3dc';
  p.inkSoft = m === 'night' ? '#b9b0c8' : '#f0d8d8';
  p.halo = m === 'night' ? '#0b1430' : '#3a2440';
  return p;
}

const HOLDER_COLOR: Record<string, string> = { ...GROUP_COLOR };
function moodFor(s: GameState): Mood {
  const h = Math.max(s.heat.local, s.heat.federal * 0.8);
  return h >= 80 ? 'night' : h >= 55 ? 'dusk' : 'day';
}
const LS = 'llv:region';
function pref(): { mood?: 'auto' | Mood } {
  try { return JSON.parse(localStorage.getItem(LS) ?? '{}'); } catch { return {}; }
}
function savePref(p: { mood?: 'auto' | Mood }): void {
  try { localStorage.setItem(LS, JSON.stringify({ ...pref(), ...p })); } catch { /* private window */ }
}

/** Pattern detail per tier (waves, reeds and pines get finer as you zoom in). */
const PZ = [1, 2.2, 5];
/** px per km at which more appears. */
const tierOf = (sc: number) => (sc < 9 ? 0 : sc < 22 ? 1 : 2);

/* ---------------- roads ---------------- */

function roadPath(r: Road): string {
  return r.pts.map((ll, i) => { const [x, y] = P(ll); return `${i ? 'L' : 'M'}${f2(x)},${f2(y)}`; }).join('');
}
function along(r: Road, t: number): [number, number] {
  const ps = r.pts.map(P);
  const seg = ps.slice(1).map((p, i) => Math.hypot(p[0] - ps[i][0], p[1] - ps[i][1]));
  const total = seg.reduce((a, b) => a + b, 0);
  let d = total * t;
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i]) { const k = d / seg[i]; return [ps[i][0] + (ps[i + 1][0] - ps[i][0]) * k, ps[i][1] + (ps[i + 1][1] - ps[i][1]) * k]; }
    d -= seg[i];
  }
  return ps[ps.length - 1];
}

const ROAD_STYLE: Record<Road['kind'], { w: number; edge: number; color: (p: Pal, m: Mood) => string; edgeColor: (p: Pal, m: Mood) => string; dash?: string }> = {
  parkway: { w: 3.2, edge: 1.4, color: (_p, m) => lit('#3f8f5a', m), edgeColor: (_p, m) => lit('#fffaf0', m) },
  expressway: { w: 3, edge: 1.2, color: (_p, m) => lit('#2f6fae', m), edgeColor: (_p, m) => lit('#fffaf0', m) },
  us: { w: 2.2, edge: 1, color: (p) => p.road, edgeColor: (p) => p.roadEdge },
  state: { w: 1.7, edge: 0.9, color: (p) => p.road, edgeColor: (_p, m) => lit('#8a7a68', m) },
  drive: { w: 1.4, edge: 0.7, color: (p) => p.road, edgeColor: (_p, m) => lit('#a08a6a', m) },
  causeway: { w: 2, edge: 1, color: (p) => p.road, edgeColor: (_p, m) => lit('#6b5a48', m) },
  bridge: { w: 2.4, edge: 1.2, color: (_p, m) => lit('#5a86b8', m), edgeColor: (_p, m) => lit('#fffaf0', m) },
  ferry: { w: 1.2, edge: 0, color: (_p, m) => lit('#ffffff', m), edgeColor: () => 'none', dash: '4 4' },
};

function Shield({ r, x, y, m }: { r: Road; x: number; y: number; m: Mood }) {
  const t = r.shield ?? '';
  const w = Math.max(14, t.length * 6 + 6);
  if (r.kind === 'parkway' || r.kind === 'expressway') {
    const c = r.kind === 'parkway' ? '#2f7a4a' : '#2f5f9e';
    return (
      <g transform={`translate(${x} ${y})`}>
        <path d={`M${-w / 2} -8h${w}v9q0 6 -${w / 2} 8q-${w / 2} -2 -${w / 2} -8z`} fill={lit(c, m)} stroke="#fffaf0" strokeWidth="1.2" />
        <text y="2.5" fontSize="7.5" fontWeight="800" textAnchor="middle" fill="#fffaf0">{t}</text>
      </g>
    );
  }
  if (r.kind === 'us') {
    return (
      <g transform={`translate(${x} ${y})`}>
        <path d={`M${-w / 2} -8h${w}q1 6 -2 11q-${w / 2 - 2} 6 -${w / 2 - 2} 6q0 0 -${w / 2 - 2} -6q-3 -5 -2 -11z`} fill="#fffaf0" stroke="#1d1d1d" strokeWidth="1.1" />
        <text y="3" fontSize="8" fontWeight="800" textAnchor="middle" fill="#1d1d1d">{t}</text>
      </g>
    );
  }
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse rx={w / 2 + 1} ry="7.5" fill="#fffaf0" stroke="#1d1d1d" strokeWidth="1.1" />
      <text y="2.8" fontSize="7.5" fontWeight="800" textAnchor="middle" fill="#1d1d1d">{t}</text>
    </g>
  );
}

/* ---------------- town signs ---------------- */

function star(r: number, n = 8): string {
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.36 : r;
    d += `${i ? 'L' : 'M'}${(Math.cos(a) * rr).toFixed(1)},${(Math.sin(a) * rr).toFixed(1)}`;
  }
  return `${d}Z`;
}

const TownMark = memo(function TownMark({ t, x, y, sc, tier, m, color, mine, sel, crowded, onPick }: { t: Town; x: number; y: number; sc: number; tier: number; m: Mood; color: string; mine: boolean; sel: boolean; crowded: boolean; onPick: (id: string) => void }) {
  const glow = m !== 'day';
  const k = 1 / sc;
  const side = t.side === 'l' ? -1 : 1;
  if (t.rank === 1) {
    const name = t.name;
    const w = name.length * 7.4 + 22;
    const bx = side > 0 ? 14 : -14 - w;
    return (
      <g transform={`translate(${f2(x)} ${f2(y)}) scale(${k.toFixed(5)})`} data-testid="rv-town" data-town={t.id} onClick={(e) => { e.stopPropagation(); onPick(t.id); }} style={{ cursor: 'pointer' }}>
        <title>{t.name}</title>
        <circle r="18" fill="transparent" />
        <circle r="6.5" fill={color} stroke="#fffaf0" strokeWidth="2" />
        {mine && <circle r="10.5" fill="none" stroke={color} strokeWidth="1.6" strokeDasharray="3 2" />}
        {/* The sign: a boomerang panel on a pole, a starburst on top. */}
        <path d={`M0 0L${bx + (side > 0 ? 0 : w)} -16`} stroke={lit('#5b4a3a', m)} strokeWidth="1.2" />
        <g transform={`translate(${bx} -30)`}>
          {glow && <rect x="-3" y="-3" width={w + 6} height="26" rx="12" fill={color} opacity="0.35" filter="url(#rv-blur)" />}
          <path d={`M4 0H${w - 10}Q${w} 0 ${w} 10Q${w - 4} 20 ${w - 14} 20H10Q0 20 0 10Q0 0 4 0Z`} fill={m === 'night' ? '#1b1030' : '#fffaf0'} stroke={color} strokeWidth={glow ? 2.2 : 1.8} />
          <text x={w / 2} y="14.5" fontSize="12.5" textAnchor="middle" fontWeight="800" fontStyle="italic" fill={m === 'night' ? '#fff' : mix(color, '#1d1d1d', 0.25)} style={{ fontFamily: "'Brush Script MT', 'Segoe Script', 'Playfair Display', cursive", letterSpacing: '0.3px' }} stroke={glow ? color : 'none'} strokeWidth="0.4">{name}</text>
          <path d={star(7)} transform={`translate(${side > 0 ? w - 6 : 6} -2)`} fill={m === 'day' ? '#ffd23f' : '#ffe680'} stroke={m === 'day' ? '#e0a020' : 'none'} strokeWidth="0.6" />
          {t.street && <g transform={`translate(${w / 2} 30)`}><rect x="-30" y="-7" width="60" height="12" rx="6" fill={m === 'day' ? '#c2185b' : '#ff5fa2'} /><text y="2.2" fontSize="7" textAnchor="middle" fontWeight="800" fill="#fffaf0" letterSpacing="0.8">STREET LEVEL ›</text></g>}
        </g>
        {sel && <circle r="13" fill="none" stroke="#ffe066" strokeWidth="2.4" className="hv-sel" />}
      </g>
    );
  }
  const showLabel = t.rank === 2 ? tier >= 1 || (t.shore && !crowded) : tier >= 1;
  if (t.rank === 3 && tier < 1) return null;
  return (
    <g transform={`translate(${f2(x)} ${f2(y)}) scale(${k.toFixed(5)})`} data-testid="rv-town" data-town={t.id} onClick={(e) => { e.stopPropagation(); onPick(t.id); }} style={{ cursor: 'pointer' }}>
      <title>{t.name}</title>
      <circle r="10" fill="transparent" />
      <circle r={t.rank === 2 ? 4 : 3} fill={color} stroke={m === 'night' ? '#fffaf0' : '#2a1f2e'} strokeWidth="1" />
      {mine && <circle r="7" fill="none" stroke={color} strokeWidth="1.2" />}
      {showLabel && (
        <text x={side * 7} y="3.5" fontSize={t.rank === 2 ? 10.5 : 9} textAnchor={side > 0 ? 'start' : 'end'} fontWeight={t.rank === 2 ? 700 : 600}
          fill={m === 'day' ? '#2a3a4a' : '#f6ead2'} stroke={m === 'day' ? '#fffaf0' : '#1b1030'} strokeWidth="2.6" paintOrder="stroke" strokeLinejoin="round">{t.name}</text>
      )}
      {sel && <circle r="9" fill="none" stroke="#ffe066" strokeWidth="2" className="hv-sel" />}
    </g>
  );
});

function Landmark({ kind, x, y, sc, m, name }: { kind: string; x: number; y: number; sc: number; m: Mood; name: string }) {
  const k = 1 / sc;
  const light = m !== 'day';
  return (
    <g transform={`translate(${f2(x)} ${f2(y)}) scale(${k.toFixed(5)})`} pointerEvents="none">
      <title>{name}</title>
      {kind === 'light' && <g><path d="M-2.5 0L-1.6 -14H1.6L2.5 0Z" fill={lit('#fffaf0', m)} stroke={lit('#b3532f', m)} strokeWidth="0.8" /><path d="M-1.8 -10H1.8M-2 -6H2" stroke={lit('#b3532f', m)} strokeWidth="1.2" />{light && <path d="M0 -14L-22 -20L-22 -8Z" fill="#ffe9a8" opacity="0.4" />}<circle cy="-15" r="1.8" fill={light ? '#ffe9a8' : '#3a3a3a'} /></g>}
      {kind === 'pier' && <g><path d="M-6 0h12v-3h-12z" fill={lit('#c79a5c', m)} /><circle cy="-9" r="6" fill="none" stroke={light ? '#ff5fa2' : lit('#e05a7a', m)} strokeWidth="1.2" /><path d="M0 -9V-3" stroke={lit('#8a6a4a', m)} strokeWidth="0.8" /></g>}
      {kind === 'elephant' && <g><ellipse cy="-6" rx="7" ry="4.5" fill={lit('#9aa0a8', m)} /><path d="M6 -7q4 2 2 8" stroke={lit('#9aa0a8', m)} strokeWidth="2" fill="none" /><path d="M-4 -2v4M3 -2v4" stroke={lit('#9aa0a8', m)} strokeWidth="2" /><rect x="-3" y="-14" width="6" height="3" fill={lit('#c2185b', m)} /></g>}
    </g>
  );
}

function DoodleArt({ d, x, y, sc, tier, m }: { d: Doodle; x: number; y: number; sc: number; tier: number; m: Mood }) {
  const k = (tier === 0 ? 1 : tier === 1 ? 1.25 : 1.5) / sc;
  const ink = m === 'day' ? '#27405a' : '#e8dcbf';
  const L = (c: string) => lit(c, m);
  let art: JSX.Element;
  switch (d.kind) {
    case 'compass':
      art = <g><circle r="22" fill="none" stroke={ink} strokeOpacity="0.5" strokeWidth="1" strokeDasharray="2 3" /><path d={star(20, 4)} fill={L('#ff8a73')} stroke={ink} strokeWidth="0.8" /><path d={star(12, 4)} transform="rotate(45)" fill={L('#5fd3c4')} stroke={ink} strokeWidth="0.6" /><text y="-25" fontSize="9" fontWeight="800" textAnchor="middle" fill={ink}>N</text></g>;
      break;
    case 'liner':
      art = <g><path d="M-22 0h44l-6 7h-32z" fill={L('#2a2a3a')} /><path d="M-16 -6h30v6h-30z" fill={L('#fffaf0')} /><rect x="-6" y="-14" width="6" height="8" fill={L('#c0392b')} /><rect x="4" y="-13" width="6" height="7" fill={L('#c0392b')} />{m !== 'day' && <path d="M-14 -3h26" stroke="#ffe39a" strokeDasharray="2 2" strokeWidth="1.4" />}<path d="M-30 9q8 -3 16 0t16 0t16 0t16 0" stroke={L('#ffffff')} strokeOpacity="0.7" fill="none" /></g>;
      break;
    case 'sail':
      art = <g><path d="M-9 0h18l-3 4h-12z" fill={L('#8a5a3a')} /><path d="M0 -1V-18L10 -2z" fill={L('#fffaf0')} stroke={ink} strokeWidth="0.5" /><path d="M-1 -2V-14L-8 -2z" fill={L('#ff9ec7')} /></g>;
      break;
    case 'fish':
      art = <g><path d="M-8 0q8 -7 14 0q-6 7 -14 0zM6 0l5 -4v8z" fill={L('#ffd86b')} stroke={ink} strokeWidth="0.5" /><circle cx="-4" cy="-1" r="0.9" fill={ink} /></g>;
      break;
    case 'gull':
      art = <path d="M-9 0q4 -5 9 0q5 -5 9 0" fill="none" stroke={ink} strokeWidth="1.4" strokeLinecap="round" />;
      break;
    case 'oyster':
      art = <g><path d="M-10 0h20l-4 5h-12z" fill={L('#c0392b')} /><path d="M-2 0V-16M-2 -14l8 12" stroke={ink} strokeWidth="0.8" fill="none" /><path d="M-2 -15L-9 -2h7z" fill={L('#fffaf0')} /></g>;
      break;
    case 'berries':
      art = <g>{[[-4, 0], [3, -1], [-1, -6], [5, -6]].map(([bx, by], i) => <circle key={i} cx={bx} cy={by} r="3.6" fill={L('#4f6fd0')} stroke={L('#2a3a8a')} strokeWidth="0.6" />)}<path d="M-1 -10q3 -5 8 -4q-3 4 -8 4z" fill={L('#5f8f4a')} /></g>;
      break;
    case 'egg':
      art = <g><ellipse cy="-6" rx="5.5" ry="7" fill={L('#fff8e8')} stroke={ink} strokeWidth="0.7" /><path d="M-10 0q10 6 20 0" fill={L('#c79a5c')} stroke={ink} strokeWidth="0.6" /></g>;
      break;
    case 'glass':
      art = <g><path d="M-3 -16h6v4l3 4v8h-12v-8l3 -4z" fill={L('#5fd3c4')} fillOpacity="0.85" stroke={ink} strokeWidth="0.7" /><path d="M-4 -6h8" stroke="#ffffff" strokeOpacity="0.8" /></g>;
      break;
    case 'umbrella':
      art = <g><path d="M-8 -6q8 -10 16 0z" fill={L('#ff5fa2')} /><path d="M-3 -6q3 -8 6 0" fill={L('#fffaf0')} /><path d="M0 -6V2" stroke={ink} strokeWidth="0.8" /></g>;
      break;
    case 'plane':
      art = <g><path d="M-10 0h20M-2 -7l3 7l-3 7M7 -3l2 3l-2 3" stroke={ink} strokeWidth="1.6" fill="none" strokeLinecap="round" /></g>;
      break;
  }
  return (
    <g transform={`translate(${f2(x)} ${f2(y)}) scale(${k.toFixed(5)})${d.rot ? ` rotate(${d.rot})` : ''}`} pointerEvents="none" opacity={m === 'day' ? 0.95 : 0.85}>
      {art}
      {d.label && tier >= 1 && <text y="14" fontSize="7.5" fontStyle="italic" textAnchor="middle" fill={ink} stroke={m === 'day' ? '#fffaf0' : '#1b1030'} strokeWidth="2" paintOrder="stroke" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>{d.label}</text>}
    </g>
  );
}

/* ---------------- the view ---------------- */

export function RegionView({ s, onStreet, onSurvey, onEnvoy }: { s: GameState; onStreet: (townId: string) => void; onSurvey?: () => void; onEnvoy: (cityId: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const g = useRef<SVGGElement>(null);
  const [geo, setGeo] = useState<Geo | undefined>();
  const [err, setErr] = useState(false);
  const [sel, setSel] = useState<string | undefined>();
  const [leaving, setLeaving] = useState(false);
  const [moodSet, setMoodSet] = useState<'auto' | Mood>(() => pref().mood ?? 'auto');
  const mood: Mood = moodSet === 'auto' ? moodFor(s) : moodSet;
  const p = pal(mood);
  const year = s.date.y;

  const apply = useCallback((v: View, m: number) => {
    g.current?.setAttribute('transform', `translate(${(v.tx + m).toFixed(1)} ${(v.ty + m).toFixed(1)}) scale(${v.sc.toFixed(4)})`);
  }, []);
  const [minSc, setMinSc] = useState(3);
  const pz = usePanZoom({ host, layer, apply, bounds: REGION_BOUNDS, minSc, maxSc: 140 });
  const tier = tierOf(pz.sc);

  useEffect(() => {
    let live = true;
    loadRegion().then((x) => live && setGeo(x)).catch(() => live && setErr(true));
    return () => { live = false; };
  }, []);

  const homeView = useCallback(() => {
    const [x0, y1] = proj(38.9, -75.32);
    const [x1, y0] = proj(40.0, -74.36);
    return pz.fitView(x0, y0, x1, y1, 0.96);
  }, [pz.fitView]);
  useEffect(() => { const v = homeView(); setMinSc(v.sc * 0.8); pz.setView(v); }, []);

  const pick = useCallback((id: string) => { if (!pz.wasDrag()) setSel(id); }, [pz.wasDrag]);
  const goStreet = useCallback((t: Town) => {
    setSel(undefined);
    setLeaving(true);
    const [x0, y1] = proj(38.955, -74.86);
    const [x1, y0] = proj(39.012, -74.785);
    const v = pz.fitView(x0, y0, x1, y1, 1);
    pz.animateTo(v, 1100, () => onStreet(t.id), { noClamp: true });
  }, [pz, onStreet]);

  /* --- static layers (redrawn only on mood/tier/data) --- */
  const ground = useMemo(() => {
    if (!geo) return null;
    const [bx0, by0] = [REGION_BOUNDS.x0 - 200, REGION_BOUNDS.y0 - 200];
    const [bw, bh] = [REGION_BOUNDS.x1 - REGION_BOUNDS.x0 + 400, REGION_BOUNDS.y1 - REGION_BOUNDS.y0 + 400];
    const marsh = MARSH_BANDS.map((b) => `M${b.map((ll) => P(ll).map(f2).join(',')).join('L')}Z`).join('');
    const pines = `M${PINES.map((ll) => P(ll).map(f2).join(',')).join('L')}Z`;
    return (
      <g>
        <rect x={bx0} y={by0} width={bw} height={bh} fill={p.sea} />
        <rect x={bx0} y={by0} width={bw} height={bh} fill="url(#rv-waves)" />
        {/* The beach and shoals: a wide sandy edge under the land. */}
        <path d={geo.land} fill={p.beach} stroke={p.beach} strokeWidth={tier >= 1 ? 3.2 : 4.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <path d={geo.land} fill={p.land} />
        {/* The data stops at 75.65°W (all land there: Delaware and Pennsylvania); the map carries on. */}
        <rect x={bx0} y={by0} width={WEST_X - bx0 + 0.05} height={bh} fill={p.land} />
        <g clipPath="url(#rv-land)">
          {geo.counties.map((c) => {
            const h = COUNTY_HOLDERS[c.id];
            return h ? <path key={c.id} d={c.d} fill={HOLDER_COLOR[h] ?? '#8a8378'} opacity={mood === 'night' ? 0.16 : 0.13} /> : null;
          })}
          <path d={marsh} fill={p.marsh} opacity="0.9" />
          <path d={marsh} fill="url(#rv-reeds)" />
          <path d={pines} fill="url(#rv-pines)" opacity="0.85" />
          <path d={geo.countyLines} fill="none" stroke={p.county} strokeWidth="1" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
        </g>
        <path d={geo.land} fill="none" stroke={mix(p.sea2, '#1d4f6a', 0.25)} strokeWidth="0.9" strokeOpacity="0.8" vectorEffect="non-scaling-stroke" />
        <path d={geo.stateLines} fill="none" stroke={lit('#8a5a7a', mood)} strokeWidth="1.8" strokeDasharray="8 3 2 3" vectorEffect="non-scaling-stroke" opacity="0.8" />
      </g>
    );
  }, [geo, mood, tier]);

  const roads = useMemo(() => {
    const rs = ROADS.filter((r) => !r.since || r.since <= year).filter((r) => tier >= 1 || (r.kind !== 'drive' && r.kind !== 'state') || r.id === 'nj47');
    const order: Road['kind'][] = ['ferry', 'drive', 'causeway', 'state', 'us', 'bridge', 'expressway', 'parkway'];
    rs.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
    const zoomW = tier === 0 ? 0.8 : tier === 1 ? 1 : 1.35;
    return (
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {rs.map((r) => {
          const st = ROAD_STYLE[r.kind];
          const d = roadPath(r);
          return (
            <g key={r.id} data-road={r.id}>
              <title>{r.name}{r.since ? ` (opened ${r.since})` : ''}</title>
              {st.edge > 0 && <path d={d} stroke={st.edgeColor(p, mood)} strokeWidth={(st.w + st.edge * 2) * zoomW} vectorEffect="non-scaling-stroke" />}
              <path d={d} stroke={st.color(p, mood)} strokeWidth={st.w * zoomW} strokeDasharray={st.dash} vectorEffect="non-scaling-stroke" />
              {r.kind === 'parkway' && tier >= 1 && <path d={d} stroke="#fffaf0" strokeWidth="0.6" strokeDasharray="6 6" vectorEffect="non-scaling-stroke" opacity="0.8" />}
              {mood !== 'day' && (r.kind === 'parkway' || r.kind === 'us' || r.kind === 'expressway') && <path d={d} stroke="#ffe7a8" strokeWidth="1.6" strokeDasharray="0 14" vectorEffect="non-scaling-stroke" className="rv-cars" />}
            </g>
          );
        })}
      </g>
    );
  }, [year, tier, mood]);

  /* --- scale-dependent layers --- */
  const sc = pz.sc;
  const shields = useMemo(() => (
    <g pointerEvents="none">
      {ROADS.filter((r) => r.shield && (!r.since || r.since <= year)).flatMap((r) => (r.shieldAt ?? []).filter((_, i) => tier >= 1 || i === 0).map((t, i) => {
        const [x, y] = along(r, t);
        return <g key={`${r.id}${i}`} transform={`translate(${f2(x)} ${f2(y)}) scale(${(1 / sc).toFixed(5)})`}><Shield r={r} x={0} y={0} m={mood} /></g>;
      }))}
    </g>
  ), [sc, tier, year, mood]);

  const labels = useMemo(() => (
    <g pointerEvents="none" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
      {WATER_LABELS.filter((w) => w.size >= 1.4 || tier >= 1).map((w) => {
        const [x, y] = P(w.at);
        const fs = Math.max(10, w.size * 9) / sc;
        return <text key={w.n} x={f2(x)} y={f2(y)} fontSize={fs.toFixed(2)} textAnchor="middle" fontStyle="italic" fill={mix(p.sea2, '#0d3b52', mood === 'day' ? 0.55 : 0.1)} opacity={mood === 'day' ? 0.75 : 0.9} letterSpacing={(fs * 0.12).toFixed(2)} transform={w.rot ? `rotate(${w.rot} ${f2(x)} ${f2(y)})` : undefined}>{w.n}</text>;
      })}
      {LAND_LABELS.filter((w) => w.size >= 1.4 || tier >= 1).map((w) => {
        const [x, y] = P(w.at);
        const fs = Math.max(9, w.size * 8) / sc;
        return <text key={w.n} x={f2(x)} y={f2(y)} fontSize={fs.toFixed(2)} textAnchor="middle" fontWeight="800" fill={mood === 'day' ? '#b08a5a' : '#c9b38a'} opacity={0.55} letterSpacing={(fs * 0.25).toFixed(2)} transform={w.rot ? `rotate(${w.rot} ${f2(x)} ${f2(y)})` : undefined}>{w.n}</text>;
      })}
    </g>
  ), [sc, tier, mood]);

  const towns = useMemo(() => {
    const outposts = new Set(s.outposts.map((o) => o.city));
    const sorted = [...TOWNS].sort((a, b) => b.rank - a.rank);
    return (
      <g>
        {DOODLES.filter((d) => (d.tier ?? 0) <= tier).map((d, i) => { const [x, y] = P(d.at); return <DoodleArt key={i} d={d} x={x} y={y} sc={sc} tier={tier} m={mood} />; })}
        {tier >= 1 && REGION_LANDMARKS.filter((l) => !l.since || l.since <= year).map((l) => { const [x, y] = proj(l.lat, l.lon); return <Landmark key={l.n} kind={l.kind} name={l.n} x={x} y={y} sc={sc} m={mood} />; })}
        {sorted.map((t) => {
          const [x, y] = proj(t.lat, t.lon);
          const c = t.city ? CITIES_BY_ID[t.city] : undefined;
          const holder = c ? c.group : TOWN_OWNERS[t.name] ?? 'unclaimed';
          const mine = holder === 'player' || (!!t.city && outposts.has(t.city));
          // A small town right under a big sign keeps quiet until you zoom in.
          const crowded = t.rank > 1 && TOWNS.some((o) => { if (o.rank !== 1) return false; const [ox, oy] = proj(o.lat, o.lon); return Math.hypot(ox - x, oy - y) * sc < 70; });
          return <TownMark key={t.id} t={t} x={x} y={y} sc={sc} tier={tier} m={mood} color={HOLDER_COLOR[holder] ?? '#8a8378'} mine={mine} sel={sel === t.id} crowded={crowded} onPick={pick} />;
        })}
      </g>
    );
  }, [sc, tier, mood, sel, pick, s.outposts, year]);

  const selTown = sel ? TOWNS.find((t) => t.id === sel) : undefined;
  const selCity = selTown?.city ? CITIES_BY_ID[selTown.city] : undefined;
  const selHolder: string = selCity ? selCity.group : selTown ? TOWN_OWNERS[selTown.name] ?? 'unclaimed' : 'unclaimed';
  const legend: [string, string][] = [['You', HOLDER_COLOR.player], ['Philadelphia', HOLDER_COLOR.philly], ['Manno (AC)', HOLDER_COLOR.manno], ['Kessler', HOLDER_COLOR.kessler], ['New York', HOLDER_COLOR.newyork], ['Nobody yet', HOLDER_COLOR.unclaimed]];

  return (
    <div className={`absolute inset-0 overflow-hidden select-none transition-opacity duration-300 ${leaving ? 'opacity-0' : ''}`} style={{ background: p.sea, touchAction: 'none', transitionDelay: leaving ? '800ms' : '0ms' }} data-testid="region-view" data-mood={mood} data-tier={tier}>
      <div ref={host} className="absolute inset-0" onClick={() => { if (!pz.wasDrag()) setSel(undefined); }}>
        <div ref={layer} className="absolute inset-0" style={{ transformOrigin: '0 0', willChange: 'transform' }}>
          <svg width={`calc(100% + ${pz.margin * 2}px)`} height={`calc(100% + ${pz.margin * 2}px)`} style={{ position: 'absolute', left: -pz.margin, top: -pz.margin }}>
            <defs>
              <pattern id="rv-waves" width="44" height="22" patternUnits="userSpaceOnUse" patternTransform={`scale(${(0.12 / PZ[tier]).toFixed(4)})`}>
                <path d="M2 14q5 -6 10 0t10 0" fill="none" stroke={p.wave} strokeOpacity={mood === 'day' ? 0.55 : 0.18} strokeWidth="1.6" strokeLinecap="round" />
              </pattern>
              <pattern id="rv-reeds" width="10" height="8" patternUnits="userSpaceOnUse" patternTransform={`scale(${(0.09 / PZ[tier]).toFixed(4)})`}>
                <path d="M2 7v-4M4 7v-5M6 7v-3" stroke={p.marshInk} strokeWidth="0.8" strokeLinecap="round" />
              </pattern>
              <pattern id="rv-pines" width="18" height="16" patternUnits="userSpaceOnUse" patternTransform={`scale(${(0.11 / PZ[tier]).toFixed(4)})`}>
                <path d="M5 12l3 -8l3 8z" fill={p.pine} /><path d="M12 15l2.5 -6l2.5 6z" fill={mix(p.pine, '#2f5a3a', 0.3)} />
              </pattern>
              <clipPath id="rv-land"><path d={geo?.land ?? ''} /></clipPath>
              <filter id="rv-blur" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="4" /></filter>
            </defs>
            <g ref={g}>
              {ground}
              {roads}
              {labels}
              {shields}
              {towns}
            </g>
          </svg>
        </div>
      </div>
      {!geo && <div className="absolute inset-0 grid place-items-center text-sm text-stone-200" data-pz-ui>{err ? 'The map could not load. Use the Survey map.' : 'Unfolding the road map…'}</div>}
      {/* Controls */}
      <div className="absolute top-2 right-2 z-10 flex flex-col items-end gap-1.5" data-pz-ui>
        <div className="flex gap-1">
          <button type="button" className="hv-btn" onClick={() => pz.zoomBy(1.6)} aria-label="Zoom in">+</button>
          <button type="button" className="hv-btn" onClick={() => pz.zoomBy(1 / 1.6)} aria-label="Zoom out">−</button>
          <button type="button" className="hv-btn" onClick={() => pz.animateTo(homeView(), 500)} title="Back to the whole of South Jersey" data-testid="rv-recenter">⌂ Recenter</button>
        </div>
        <div className="flex gap-1" role="group" aria-label="Light">
          {(['auto', 'day', 'dusk', 'night'] as const).map((m) => (
            <button key={m} type="button" className={`hv-btn ${moodSet === m ? 'hv-on' : ''}`} onClick={() => { setMoodSet(m); savePref({ mood: m }); }} title={m === 'auto' ? 'Follows the heat' : m}>{m === 'auto' ? 'Auto' : m === 'day' ? '☀' : m === 'dusk' ? '◐' : '☾'}</button>
          ))}
        </div>
        {onSurvey && <button type="button" className="hv-btn" onClick={onSurvey} title="The survey map (real map, all levels)">Survey map</button>}
      </div>
      {/* The cartouche and legend */}
      <div className="absolute right-2 bottom-6 z-10 hidden sm:block pointer-events-none" data-testid="rv-cartouche">
        <div className="rounded-xl border-2 px-3 py-2 text-center shadow-lg" style={{ background: mood === 'night' ? '#1b1030ee' : '#fffaf0f0', borderColor: '#ff5fa2' }}>
          <div className="text-[9px] uppercase tracking-[0.35em]" style={{ color: mood === 'night' ? '#9fe7e0' : '#2a8f8a' }}>Greetings from</div>
          <div className="font-display text-xl leading-none" style={{ color: mood === 'night' ? '#ffd1e6' : '#c2185b' }}>South Jersey</div>
          <div className="text-[9px] tracking-[0.3em] mt-0.5" style={{ color: mood === 'night' ? '#e8dcbf' : '#5b4a3a' }}>THE SHORE · {year}</div>
          <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5 text-left text-[10px]" style={{ color: mood === 'night' ? '#e8dcbf' : '#3a2c3e' }}>
            {legend.map(([t, c]) => <div key={t} className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full border border-black/30" style={{ background: c }} />{t}</div>)}
          </div>
        </div>
      </div>
      {/* The town card */}
      {selTown && (
        <div className="absolute z-20 right-2 top-24 w-[340px] max-w-[calc(100%-16px)] max-h-[calc(100%-120px)] overflow-y-auto rounded-lg border border-gold-600/40 bg-noir-900/95 p-3 shadow-xl max-sm:left-2 max-sm:right-2 max-sm:top-auto max-sm:bottom-2 max-sm:w-auto max-sm:max-h-[55%]" data-pz-ui data-testid="rv-card" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">{selTown.shore ? 'The Shore' : 'South Jersey'}</div>
              <div className="font-display text-xl text-gold-300 leading-tight">{selTown.name}</div>
              {!selCity && <div className="text-xs text-stone-400 flex items-center gap-1.5 mt-0.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: HOLDER_COLOR[selHolder] }} />{selHolder === 'kessler' ? 'Kessler\'s clubs' : GROUP_LABEL[selHolder as OwnerGroup] ?? 'Nobody yet'}</div>}
            </div>
            <button type="button" className="text-xs text-stone-400 hover:text-gold-300 shrink-0" onClick={() => setSel(undefined)} aria-label="Close">close ×</button>
          </div>
          {selTown.street && <button type="button" className="btn-gold w-full mt-2" data-testid="rv-street" onClick={() => goStreet(selTown)}>Down to street level ›</button>}
          {selTown.blurb && !selCity && <p className="text-sm text-stone-300 italic mt-2">{selTown.blurb}</p>}
          {selCity && <div className="mt-2"><CityPanel s={s} id={selCity.id} onEnvoy={onEnvoy} /></div>}
        </div>
      )}
    </div>
  );
}
