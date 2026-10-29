import { useEffect, useMemo, useRef, useState } from 'react';
import { extraSlots } from '../../engine/hoodGeo';
import { AVENUES, BOARDWALK, CROSS, PIERS, RES_SEED, aveRuns, aveV, bayEdge, beachWidth, boardwalkV, frontV, townAt } from '../../engine/hoodData';
import { PLACES as PLACES_ALL, applyPlaceEdits, lngLatToUv, placesGeoJson, placesIn, uvToLngLat, type PlaceEdit, type PlaceFeature } from '../../engine/placesGeo';
import { rivalName } from '../../engine/construction';
import type { GameState } from '../../engine/types';
import { OWNER_COLOR } from '../map/lotIcons';
import type { AssetKey } from './art/assetUrls';
import { AssetImg } from './AssetImg';
import type { Item } from './Buildings';
import { spriteOf } from './cutout';
import { layoutLabels, layoutSprites, type Box } from './planLayout';
import { storefrontArt } from './storefrontArt';
import { Turnaround } from './Turnaround';
import { TownEditor } from '../editor/TownEditor';
import { PoliticalOverlay } from '../realm/PoliticalOverlay';
import type { MapMode } from './MapControls';
import { wildwoodDetails, wildwoodHeat, wildwoodRackets, wildwoodRegions, wildwoodStyles } from './wildwoodRealm';

/**
 * The block map: the business-location layer, drawn to scale in meters in the
 * island's street frame (the Boardwalk running across, the ocean below).
 * Ground first — ocean, beach, the Boardwalk's planks and the piers, the
 * avenues and cross streets with their sidewalks — then the buildings at
 * their coordinates, turned and sized by their footprints, each standing as
 * a cutout of one view of its painting (the view that faces you). The
 * properties shown are the ones open in the game year. Click one for its
 * details; "Edit map" lets you move, turn and resize buildings, save the
 * corrections in this browser and copy them to the clipboard as GeoJSON (no download links: the published page cannot follow them).
 *
 * The areas cover the island south to north (makeAreas), the Boardwalk
 * around Hunt's Pier first.
 */

export interface PlanArea { id: string; name: string; u0: number; u1: number; v0: number; v1: number }
/**
 * The areas, laid out on the real grid: the island's places and house lots
 * taken south to north in windows of at most 700 m along the island, each
 * named by the streets at its ends (the Boardwalk around Hunt's Pier first).
 */
function makeAreas(): PlanArea[] {
  const pts: { u: number; v: number; id: string }[] = PLACES_ALL.map((f) => { const [u, v] = lngLatToUv(f.geometry.coordinates); return { u, v, id: f.id }; });
  const ex = extraSlots({});
  for (const r of RES_SEED) { const sl = ex.get(r.id); if (sl) pts.push({ u: (sl.u0 + sl.u1) / 2, v: (sl.v0 + sl.v1) / 2, id: r.id }); }
  pts.sort((a, b) => a.u - b.u);
  const streetAt = (u: number) => CROSS.filter((c) => !c.hidden).reduce((b, c) => (Math.abs(c.u - u) < Math.abs(b.u - u) ? c : b)).label;
  const out: PlanArea[] = [];
  for (let i = 0; i < pts.length;) {
    const start = pts[i].u;
    const win: typeof pts = [];
    while (i < pts.length && pts[i].u <= start + 700) win.push(pts[i++]);
    // A lone place at the end of the island joins the window before it.
    if (i >= pts.length && win.length < 2 && out.length) { const prev = out.pop()!; win.push({ u: prev.u0 + 50, v: prev.v0 + 60, id: '' }, { u: prev.u1 - 50, v: prev.v1 - 60, id: '' }); }
    const us = win.map((p) => p.u); const vs = win.map((p) => p.v);
    let v0 = Math.min(...vs) - 60; let v1 = Math.max(...vs) + 60;
    if (v1 - v0 < 320) { const m = (v0 + v1) / 2; v0 = m - 160; v1 = m + 160; }
    const u0 = Math.round(Math.min(...us) - 50); const u1 = Math.round(Math.max(...us, Math.min(...us) + 300) + 50);
    const hunts = win.some((p) => p.id === 'hunts-pier');
    const a = streetAt(u0 + 50); const b = streetAt(u1 - 50);
    out.push({ id: hunts ? 'hunts' : `a-${a.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, name: hunts ? 'The Boardwalk around Hunt\'s Pier' : `${townName(townAt((u0 + u1) / 2))}: ${a === b ? a : `${a} to ${b}`}`, u0, u1, v0: Math.round(v0), v1: Math.round(v1) });
  }
  return out.sort((x, y) => (x.id === 'hunts' ? -1 : y.id === 'hunts' ? 1 : 0));
}
const townName = (t: string) => (t === 'crest' ? 'The Crest' : t === 'north' ? 'North Wildwood' : 'Wildwood');
export const PLAN_AREAS: PlanArea[] = makeAreas();
const AREA_KEY = 'llv-place-area';
function loadArea(): PlanArea {
  try { const id = localStorage.getItem(AREA_KEY); return PLAN_AREAS.find((a) => a.id === id) ?? PLAN_AREAS[0]; } catch { return PLAN_AREAS[0]; }
}
const inArea = (A: PlanArea, u: number, v: number, pad = 50) => u >= A.u0 - pad && u <= A.u1 + pad && v >= A.v0 - pad && v <= A.v1 + pad;
function viewBoxFor(A: PlanArea) {
  if (typeof window !== 'undefined' && window.innerWidth < 640) {
    const w = Math.min(320, A.u1 - A.u0);
    return { x: (A.u0 + A.u1) / 2 - w / 2, y: -A.v1, w, h: Math.max(560, A.v1 - A.v0) };
  }
  return { x: A.u0, y: -A.v1, w: A.u1 - A.u0, h: A.v1 - A.v0 };
}
const EDIT_KEY = 'llv-place-edits';

function loadEdits(): Record<string, PlaceEdit> {
  try { const raw = localStorage.getItem(EDIT_KEY); return raw ? JSON.parse(raw) as Record<string, PlaceEdit> : {}; } catch { return {}; }
}
function saveEdits(e: Record<string, PlaceEdit>): boolean {
  try { localStorage.setItem(EDIT_KEY, JSON.stringify(e)); return true; } catch { return false; }
}

/** A building on the map: an authored feature, or a game record with no feature yet (placed from the game's grid). */
interface Placed { f: PlaceFeature; u: number; v: number; it?: Item; authored: boolean }

const KIND_FILL: Record<string, string> = { lot: '#d9c48f', house: '#e6b98a', school: '#c9a46a', church: '#d8d0c0', motel: '#d16b9b', civic: '#b5643c', lighthouse: '#f2d36b', sign: '#ff5fa2', comedy: '#e07a3f', pier: '#b98b5e', ride: '#d9a441', theater: '#9b6fb3', club: '#7c5cc4', saloon: '#b3473c', tavern: '#3f8f5a', restaurant: '#c9603f', deli: '#4aa3a0', arcade: '#3fb6c9', shop: '#5f8fd6', hotel: '#d16b9b', food: '#e0a03c', minigolf: '#5fae7f', landmark: '#c7a64a' };

/** Which quarter of a four-angle sheet faces the viewer at this rotation (front, corner, side, back). */
function facingQuarter(rot: number): number {
  const r = ((Math.round(rot / 90) % 4) + 4) % 4;
  return [0, 1, 3, 2][r];
}

function viewOf(p: Placed): { key?: AssetKey; quarter?: number } {
  const im = p.f.properties.images;
  if (im.views?.length) return { key: im.views[(((Math.round(p.f.properties.rotation / 90) % 4) + 4) % 4) % im.views.length] as AssetKey };
  if (im.turnaround) return { key: im.turnaround as AssetKey, quarter: facingQuarter(p.f.properties.rotation) };
  if (im.exterior?.length) return { key: im.exterior[0] as AssetKey };
  if (p.it) {
    const a = storefrontArt(p.it);
    if (a) {
      const k = (Array.isArray(a.key) ? a.key[0] : a.key) as AssetKey;
      return a.turn ? { key: k, quarter: facingQuarter(p.f.properties.rotation) } : { key: k };
    }
  }
  return {};
}

/** The photo for every building in view, with its aspect (height / width), loaded once and cached. */
const aspectCache = new Map<string, number>();
function usePlanSprites(placed: Placed[]): Record<string, { src: string; ar: number }> {
  const [got, setGot] = useState<Record<string, { src: string; ar: number }>>({});
  const want = useMemo(() => placed.map((p) => ({ id: p.f.id, ...viewOf(p) })).filter((x) => x.key), [placed]);
  const sig = want.map((x) => `${x.id}=${x.key}:${x.quarter ?? ''}`).join('|');
  useEffect(() => {
    let live = true;
    const next: Record<string, { src: string; ar: number }> = {};
    let left = want.length;
    const done = () => { if (--left <= 0 && live) setGot({ ...next }); };
    if (!want.length) setGot({});
    for (const x of want) {
      spriteOf(x.key!, x.quarter).then((src) => {
        if (!src) { done(); return; }
        const known = aspectCache.get(src);
        if (known) { next[x.id] = { src, ar: known }; done(); return; }
        const im = new Image();
        im.onload = () => { const ar = im.naturalHeight / Math.max(1, im.naturalWidth); aspectCache.set(src, ar); next[x.id] = { src, ar }; done(); };
        im.onerror = () => done();
        im.src = src;
      });
    }
    return () => { live = false; };
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  return got;
}

/**
 * Where the photo stands (screen: x = u, y = -v; the camera looks in from the ocean): the middle
 * of the footprint's lowest edge on the screen. A building that faces away (inland) stands just
 * inside its facing edge instead, so a long pier keeps its entrance at the Boardwalk. Either way
 * the photo stands on its own lot, never on the block behind it.
 */
function frontOf(p: Placed): { ax: number; ay: number; top?: boolean; ext: number } {
  const { w, d } = p.f.properties.footprint;
  const a = (p.f.properties.rotation * Math.PI) / 180;
  const ext = Math.abs(Math.sin(a)) * w + Math.abs(Math.cos(a)) * d;
  if (Math.cos(a) < -0.5) return { ax: p.u, ay: -p.v - ext / 2, top: true, ext };
  return { ax: p.u, ay: -p.v + ext / 2, ext };
}

/** The lot on the ground: the footprint, its front edge in the owner's color, and (in edit) the handles. */
function Footprint({ p, sel, edit, color, label, photo, dot, dotR, hs, onDown }: { p: Placed; sel: boolean; edit: boolean; color: string; label: string; photo: boolean; dot: boolean; dotR: number; hs: number; onDown: (e: React.PointerEvent, mode: 'move' | 'rot' | 'size') => void }) {
  const { w, d } = p.f.properties.footprint;
  const rot = p.f.properties.rotation;
  const kindFill = KIND_FILL[p.f.properties.kind] ?? '#8a8f9a';
  return (
    <g data-testid="plan-bldg" data-id={p.f.id} data-lot={p.f.properties.lotId ?? ''} data-authored={p.authored ? '1' : '0'} data-mode={photo ? 'photo' : dot ? 'dot' : 'plain'} style={{ cursor: edit ? 'move' : 'pointer' }}
      onPointerDown={(e) => onDown(e, 'move')}>
      <title>{label}</title>
      <g transform={`translate(${p.u} ${-p.v}) rotate(${rot})`}>
        <rect x={-w / 2} y={-d / 2} width={w} height={d} rx="1.5" fill={photo ? '#000' : kindFill} fillOpacity={photo ? 0.22 : 0.85} stroke={sel ? '#ffe28a' : color} strokeWidth={sel ? 2 : 1.2} strokeDasharray={p.f.properties.located === 'approximate' && edit ? '4 2' : undefined} />
        {!photo && <path d={`M${-w / 2 + 3} ${-d / 2 + 3}L${w / 2 - 3} ${d / 2 - 3}M${w / 2 - 3} ${-d / 2 + 3}L${-w / 2 + 3} ${d / 2 - 3}`} stroke="#ffffff" strokeOpacity="0.18" strokeWidth="1" />}
        <line x1={-w / 2} y1={d / 2} x2={w / 2} y2={d / 2} stroke={color} strokeWidth="2.4" />
      </g>
      {dot && <circle cx={p.u} cy={-p.v} r={dotR} fill={color} stroke="#1b1030" strokeWidth={dotR * 0.35} data-testid="plan-dot" />}
      {edit && sel && (
        <g transform={`translate(${p.u} ${-p.v}) rotate(${rot})`}>
          <line x1="0" y1={-d / 2} x2="0" y2={-d / 2 - 3 * hs} stroke="#ffe28a" strokeWidth="1" />
          <circle cx="0" cy={-d / 2 - 3 * hs} r={hs} fill="#ffe28a" stroke="#1b1030" strokeWidth="1" style={{ cursor: 'grab' }} data-testid="plan-rot" onPointerDown={(e) => { e.stopPropagation(); onDown(e, 'rot'); }} />
          <rect x={w / 2 - hs} y={-d / 2 - hs} width={2 * hs} height={2 * hs} fill="#5ff2e6" stroke="#1b1030" strokeWidth="1" style={{ cursor: 'nwse-resize' }} data-testid="plan-size" onPointerDown={(e) => { e.stopPropagation(); onDown(e, 'size'); }} />
        </g>
      )}
    </g>
  );
}

function Ground({ year, A }: { year: number; A: PlanArea }) {
  const { u0, u1, v0, v1 } = A;
  const um = (u0 + u1) / 2;
  const cross = CROSS.filter((c) => !c.hidden && c.u > u0 - 20 && c.u < u1 + 20);
  // The town's front here: the Boardwalk's inland edge where the boards run, else the oceanfront lots' line (y = -v).
  const onBoards = um >= BOARDWALK.from && um <= BOARDWALK.to;
  const fr = onBoards ? boardwalkV(um) : frontV(um);
  const sea = beachWidth(um);
  const piers = PIERS.filter((p) => p.u > u0 - 60 && p.u < u1 + 60 && (p.id !== 'hunts' || year >= 1957));
  const town = townAt(um);
  const aves = AVENUES.filter((a) => aveRuns(a.id, um) && aveV(a.id, um) < v1 + 40).map((a) => ({ id: a.id, v: aveV(a.id, um), n: a.names[town] ?? a.names.wildwood ?? '' }));
  const ocV = aves.length ? Math.min(...aves.map((a) => a.v)) : fr + 90;
  const bw0 = Math.max(u0 - 400, BOARDWALK.from);
  const bw1 = Math.min(u1 + 400, BOARDWALK.to);
  return (
    <g data-testid="plan-ground" pointerEvents="none">
      <defs>
        <pattern id="plan-planks" width="3" height="16" patternUnits="userSpaceOnUse"><rect width="3" height="16" fill="#a77b4f" /><rect width="0.5" height="16" fill="#7d5a38" /></pattern>
        <pattern id="plan-deck" width="16" height="3" patternUnits="userSpaceOnUse"><rect width="16" height="3" fill="#9c7348" /><rect width="16" height="0.5" fill="#6f4f31" /></pattern>
        <linearGradient id="plan-sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2c6f8f" /><stop offset="1" stopColor="#16365a" /></linearGradient>
      </defs>
      <rect x={u0 - 400} y={-v1 - 400} width={u1 - u0 + 800} height={v1 - v0 + 800} fill="#d9d2bf" />
      {/* Lots ground, ocean, beach. */}
      <rect x={u0 - 400} y={sea} width={u1 - u0 + 800} height={900} fill="url(#plan-sea)" />
      <rect x={u0 - 400} y={-fr + (onBoards ? 16 : 0)} width={u1 - u0 + 800} height={Math.max(0, sea + fr - (onBoards ? 16 : 0))} fill="#ecd9a6" />
      <path d={`M${u0 - 400} ${sea}H${u1 + 400}`} stroke="#ffffff" strokeOpacity="0.6" strokeWidth="2" />
      {/* Piers out over the beach and the water. */}
      {piers.map((p) => <rect key={p.id} x={p.u - p.w / 2} y={-boardwalkV(p.u) + 16} width={p.w} height={p.len} fill="url(#plan-deck)" stroke="#5e4128" strokeWidth="0.8" />)}
      {/* The Boardwalk. */}
      {bw1 > bw0 && <rect x={bw0} y={-fr} width={bw1 - bw0} height={16} fill="url(#plan-planks)" stroke="#5e4128" strokeWidth="0.6" />}
      {/* Avenues: sidewalk, curb, asphalt, center line. */}
      {aves.map((a) => (
        <g key={a.id}>
          <rect x={u0 - 400} y={-a.v - 9} width={u1 - u0 + 800} height={18} fill="#cfcac0" />
          <rect x={u0 - 400} y={-a.v - 6} width={u1 - u0 + 800} height={12} fill="#4a4a50" />
          <path d={`M${u0 - 400} ${-a.v}H${u1 + 400}`} stroke="#e8c84a" strokeWidth="0.5" strokeDasharray="4 4" />
        </g>
      ))}
      {/* Cross streets, with their sidewalks, down to the boards. */}
      {cross.map((c) => (
        <g key={c.n}>
          <rect x={c.u - 8} y={-(c.vRange?.[1] ?? v1 + 400)} width={16} height={(c.vRange?.[1] ?? v1 + 400) - Math.max(fr, c.vRange?.[0] ?? fr)} fill="#cfcac0" />
          <rect x={c.u - 5} y={-(c.vRange?.[1] ?? v1 + 400)} width={10} height={(c.vRange?.[1] ?? v1 + 400) - Math.max(fr, c.vRange?.[0] ?? fr)} fill="#4a4a50" />
          {aves.map((a) => <rect key={a.id} x={c.u - 5} y={-a.v - 6} width={10} height={12} fill="#4a4a50" />)}
        </g>
      ))}
      {/* The back bay, past the island's inland edge. */}
      {v1 + 400 > 500 && <path d={`M${u0 - 400} ${-v1 - 400}${Array.from({ length: Math.ceil((u1 - u0 + 800) / 20) + 1 }, (_, i) => { const u = u0 - 400 + i * 20; return `L${u} ${-bayEdge(u)}`; }).join('')}L${u1 + 400} ${-v1 - 400}Z`} fill="url(#plan-sea)" data-testid="plan-bay" />}
      {/* Names. */}
      {cross.map((c) => <text key={`t-${c.n}`} x={c.u} y={-ocV - 30} transform={`rotate(-90 ${c.u} ${-ocV - 30})`} fontSize="5.5" fill="#fffaf0" fontWeight="700" textAnchor="middle" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>{c.label}</text>)}
      {aves.map((a) => <text key={`t-${a.id}`} x={u0 + 6} y={-a.v + 2} fontSize="5.5" fill="#fffaf0" fontWeight="700" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>{a.n}</text>)}
      {bw1 > bw0 && <text x={Math.max(u0, bw0) + 6} y={-fr + 11} fontSize="5.5" fill="#3a2414" fontWeight="800" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>THE BOARDWALK</text>}
      <text x={u0 + 6} y={sea + 22} fontSize="8" fill="#cfe9f5" fontStyle="italic" style={{ fontFamily: 'Georgia, serif' }}>Atlantic Ocean</text>
    </g>
  );
}

function PlaceCard({ p, s, onOpenLot, onClose }: { p: Placed; s: GameState; onOpenLot?: () => void; onClose: () => void }) {
  const f = p.f.properties;
  const it = p.it;
  const name = it?.name ?? f.name;
  const years = f.opened || f.closed ? `${f.opened ?? '?'}–${f.closed ?? (f.opened ? 'today' : '?')}${f.datesApprox ? ' (years not sourced)' : ''}` : 'years not known';
  const [lng, lat] = p.f.geometry.coordinates;
  const ext = (f.images.exterior ?? []) as AssetKey[];
  const art = !f.images.turnaround && !ext.length && it ? storefrontArt(it) : undefined;
  return (
    <div className="space-y-2" data-testid="place-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.25em] text-stone-500">{f.address}</div>
          <div className="font-display text-xl leading-tight text-[#ffd1e6]">{name}</div>
          {it && it.name !== f.name && <div className="text-xs text-stone-400">Was: {f.name}</div>}
          <div className="text-xs text-stone-400">{years}</div>
        </div>
        <button type="button" onClick={onClose} className="text-xs text-stone-400 hover:text-gold-300 shrink-0">close ×</button>
      </div>
      {f.images.turnaround
        ? <div className="rounded-lg overflow-hidden border border-[#ff5fa2]/30"><Turnaround k={f.images.turnaround as AssetKey} name={name} fallback={<div className="p-3 text-xs text-stone-500">The painting is in the published game.</div>} /></div>
        : (ext.length || art) ? <AssetImg k={ext.length ? ext : art!.key} alt={`${name}, outside`} className="block w-full h-auto rounded-lg border border-[#ff5fa2]/30" fallback={<div className="rounded border border-noir-700 p-3 text-xs text-stone-500">The painting is in the published game.</div>} />
          : null}
      {f.images.interior && <AssetImg k={f.images.interior as AssetKey} alt={`${name}, inside`} className="block w-full h-32 object-cover rounded border border-noir-700" />}
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        {it && <><div className="text-stone-500">Held by</div><div className="text-stone-200 flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: OWNER_COLOR[it.mine ? 'player' : it.owner] ?? OWNER_COLOR.private }} />{it.mine ? `House of ${s.houseName}` : it.owner === 'private' ? (it.forSale ? 'On the market' : 'An independent owner') : rivalName(it.owner as never)}</div></>}
        {f.public && <><div className="text-stone-500">Status</div><div className="text-stone-200">A public landmark: it is never for sale.</div></>}
        {f.establishment && <><div className="text-stone-500">Status</div><div className="text-stone-200">An establishment: visit it, book an act; it is never for sale.</div></>}
        <div className="text-stone-500">Location</div>
        <div><span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${f.located === 'verified' ? 'bg-emerald-700/60 text-emerald-100' : 'bg-amber-700/50 text-amber-100'}`} data-testid="place-located">{f.located === 'verified' ? 'VERIFIED' : 'APPROXIMATE'}</span>{f.invented && <span className="ml-1 rounded px-1.5 py-0.5 text-[10px] font-bold bg-purple-700/50 text-purple-100" title="A fictional place on a real street" data-testid="place-invented">INVENTED</span>} <span className="text-stone-500 tabular-nums">{lat.toFixed(5)}, {lng.toFixed(5)}</span></div>
        <div className="text-stone-500">Footprint</div><div className="text-stone-300">{Math.round(f.footprint.w)} × {Math.round(f.footprint.d)} m · turned {Math.round(f.rotation)}°</div>
      </div>
      <p className="text-[11px] text-stone-400 leading-snug">{f.source}</p>
      {onOpenLot && <button type="button" className="btn-gold w-full" onClick={onOpenLot} data-testid="place-open-lot">The property card (buy, lease, the Designer)</button>}
    </div>
  );
}

export function PlanView({ s, items, onPick, onClose, mapMode = 'terrain' }: { s: GameState; items: Item[]; onPick: (key: string) => void; onClose: () => void; /** The island's map mode: a faint political (or heat, rackets) wash under the blocks. */ mapMode?: MapMode }) {
  const [edits, setEdits] = useState<Record<string, PlaceEdit>>(loadEdits);
  const [saved, setSaved] = useState<'saved' | 'failed' | undefined>();
  const [edit, setEdit] = useState(false);
  const [sel, setSel] = useState<string | undefined>();
  const [peek, setPeek] = useState<number | undefined>();
  const [exportText, setExportText] = useState<string | undefined>();
  const [A, setA] = useState<PlanArea>(loadArea);
  const [towns, setTowns] = useState(false);
  const year = peek ?? s.date.y;
  const svg = useRef<SVGSVGElement>(null);
  // A phone starts on Hunt's Pier and the blocks round it; a big screen sees the whole first area.
  const [vb, setVb] = useState(() => viewBoxFor(A));
  const goArea = (id: string) => {
    const n = PLAN_AREAS.find((a) => a.id === id);
    if (!n) return;
    setA(n);
    setVb(viewBoxFor(n));
    setSel(undefined);
    try { localStorage.setItem(AREA_KEY, n.id); } catch { /* per-viewer convenience only */ }
  };
  const drag = useRef<{ mode: 'pan' | 'move' | 'rot' | 'size'; id?: string; sx: number; sy: number; vb: typeof vb; start?: PlaceEdit & { u: number; v: number }; moved: boolean } | undefined>();

  // The screen size of the map, for zoom-aware sizes (photos vs dots, name tags in screen pixels).
  const [box, setBox] = useState({ w: 1000, h: 700 });
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const size = () => setBox({ w: el.clientWidth || 1000, h: el.clientHeight || 700 });
    size();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(size) : undefined;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);
  const pxPerM = Math.min(box.w / vb.w, box.h / vb.h);
  const realmRegions = useMemo(() => (mapMode === 'terrain' ? [] : wildwoodRegions(s, 'uv')), [s, mapMode]);
  const realmStyles = useMemo(() => wildwoodStyles(s), [s]);
  const realmValues = useMemo(() => (mapMode === 'heat' ? wildwoodHeat(s) : mapMode === 'rackets' ? wildwoodRackets(s) : undefined), [s, mapMode]);
  const realm = (layer: 'fill' | 'ink') => mapMode === 'terrain' ? null : (
    <PoliticalOverlay regions={realmRegions} styles={realmStyles} scale={pxPerM} layer={layer} idPrefix="plan-realm" fillOpacity={0.22} tooltips={layer === 'fill' && !edit}
      values={realmValues} ramp={mapMode === 'rackets' ? ['#efe6cf', '#1f8a4c'] : ['#f4e3b0', '#b3261e']} details={(r) => wildwoodDetails(s, r)} />
  );

  const byLot = useMemo(() => new Map(items.filter((x) => x.lot).map((x) => [x.lot!.id, x])), [items]);
  const placed: Placed[] = useMemo(() => {
    const feats = placesIn(year, applyPlaceEdits(edits));
    const out: Placed[] = [];
    const have = new Set<string>();
    for (const f of feats) {
      const [u, v] = lngLatToUv(f.geometry.coordinates);
      if (!inArea(A, u, v)) continue;
      const it = f.properties.lotId ? byLot.get(f.properties.lotId) : undefined;
      if (f.properties.lotId) have.add(f.properties.lotId);
      out.push({ f, u, v, it, authored: true });
    }
    // The rest of the game's records in the area: placed from the game's own grid (approximate).
    for (const it of items) {
      const l = it.lot;
      // Empty ground is drawn only where it is a house lot for sale (the town's own lots).
      if (!l || have.has(l.id) || (it.vacant && !(l.home && it.forSale)) || l.zone === 'piers') continue;
      const pc = it.parcel;
      const u = (pc.u0 + pc.u1) / 2;
      const v = (pc.v0 + pc.v1) / 2;
      if (!inArea(A, u, v, 0)) continue;
      // A researched building stands here: the game's generated record gives way on the map.
      // (Its middle inside the researched footprint, or most of its lot under it.)
      const pw = pc.u1 - pc.u0;
      const pd = pc.v1 - pc.v0;
      if (out.some((q) => {
        if (!q.authored) return false;
        const fw = q.f.properties.footprint.w;
        const fd = q.f.properties.footprint.d;
        if (Math.abs(q.u - u) < fw / 2 && Math.abs(q.v - v) < fd / 2) return true;
        const ou = Math.max(0, Math.min(q.u + fw / 2, pc.u1) - Math.max(q.u - fw / 2, pc.u0));
        const ov = Math.max(0, Math.min(q.v + fd / 2, pc.v1) - Math.max(q.v - fd / 2, pc.v0));
        return ou * ov > 0.4 * pw * pd;
      })) continue;
      const id = `lot:${l.id}`;
      const e = edits[id];
      const base: PlaceFeature = {
        type: 'Feature', id, geometry: { type: 'Point', coordinates: uvToLngLat(u, v) },
        properties: { building: l.id, lotId: l.id, name: it.name, kind: it.vacant ? 'lot' : it.icon === 'house' ? 'house' : it.icon === 'club' ? 'club' : it.icon === 'pizza' ? 'food' : it.icon === 'motel' || it.icon === 'hotel' ? 'hotel' : 'shop', address: l.address, opened: l.builtYear, rotation: pc.front === 'v1' ? 180 : 0, footprint: { w: Math.round(pc.u1 - pc.u0), d: Math.round(pc.v1 - pc.v0) }, images: {}, located: 'approximate', source: 'From the game\'s own street grid (a generated or authored record with no researched location).' },
      };
      const f = e ? applyPlaceEdits({ [id]: e }, [base])[0] : base;
      const [uu, vv] = lngLatToUv(f.geometry.coordinates);
      out.push({ f, u: uu, v: vv, it, authored: false });
    }
    // Draw from the back (inland) to the front (the ocean), so nearer buildings stand in front.
    return out.sort((a, b) => -a.v - -b.v);
  }, [year, edits, items, byLot, A]);
  const selP = placed.find((p) => p.f.id === sel);
  const sprites = usePlanSprites(placed);
  const colorOf = (p: Placed) => { const it = p.it; return it ? (it.mine ? OWNER_COLOR.player : it.forSale ? OWNER_COLOR.sale : OWNER_COLOR[it.owner] ?? OWNER_COLOR.private) : p.f.properties.establishment || p.f.properties.public ? '#c7a64a' : '#e8dfcb'; };
  const labelOf = (p: Placed) => { const it = p.it; const l = it?.vacant && it.lot ? `Lot for sale $${it.lot.price.toLocaleString('en-US')}` : (it?.name ?? p.f.properties.name).replace(/^The /, ''); return l.length > 26 ? `${l.slice(0, 25)}…` : l; };
  // Photos sized to their lots and kept off each other; then the name tags round them.
  const layout = useMemo(() => {
    const sp = layoutSprites(placed.map((p) => {
      const { ax, ay, top, ext } = frontOf(p);
      return { id: p.f.id, ax, ay, top, ext, w: p.f.properties.footprint.w, d: p.f.properties.footprint.d, ar: sprites[p.f.id]?.ar, sign: p.f.properties.kind === 'sign', keep: p.f.id === sel };
    }), pxPerM);
    const foot = (p: Placed): Box => { const { w, d } = p.f.properties.footprint; const r = Math.abs(Math.sin((p.f.properties.rotation * Math.PI) / 180)); const bw = w * (1 - r) + d * r; const bd = d * (1 - r) + w * r; return { x: p.u - bw / 2, y: -p.v - bd / 2, w: bw, h: bd }; };
    const around = (p: Placed): Box => { const b = sp.get(p.f.id); return b && b.mode === 'photo' ? b : foot(p); };
    const prio = (p: Placed) => (p.f.id === sel ? 100 : p.it?.mine ? 50 : 0) + (p.authored ? 20 : 0) + (p.it?.vacant ? 4 : p.f.properties.kind === 'house' ? 2 : 10) + Math.min(5, p.f.properties.footprint.w / 15);
    const labels = layoutLabels(placed.map((p) => ({ id: p.f.id, text: labelOf(p), prio: prio(p), around: around(p) })),
      placed.map((p) => ({ id: p.f.id, b: around(p) })), pxPerM);
    return { sp, labels };
  }, [placed, sprites, pxPerM, sel]); // eslint-disable-line react-hooks/exhaustive-deps
  const elsewhere = useMemo(() => placesIn(year, applyPlaceEdits(edits)).filter((f) => !inArea(A, ...lngLatToUv(f.geometry.coordinates))), [year, edits, A]);

  const toSvg = (cx: number, cy: number): [number, number] => {
    const el = svg.current;
    const m = el?.getScreenCTM();
    if (!el || !m) return [0, 0];
    const pt = el.createSVGPoint();
    pt.x = cx; pt.y = cy;
    const r = pt.matrixTransform(m.inverse());
    return [r.x, r.y];
  };

  const setEdit1 = (id: string, e: PlaceEdit) => setEdits((all) => ({ ...all, [id]: { ...all[id], ...e } }));

  const onDown = (e: React.PointerEvent, mode: 'pan' | 'move' | 'rot' | 'size', p?: Placed) => {
    if ((e.target as Element).closest('[data-plan-ui]')) return;
    e.stopPropagation();
    drag.current = { mode: edit || mode === 'pan' ? mode : 'pan', id: p?.f.id, sx: e.clientX, sy: e.clientY, vb, moved: false,
      start: p ? { u: p.u, v: p.v, rotation: p.f.properties.rotation, footprint: p.f.properties.footprint } : undefined };
    if (p && !edit) drag.current.id = p.f.id;
    const mv = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      if (!d.moved && Math.hypot(ev.clientX - d.sx, ev.clientY - d.sy) < 6) return;
      d.moved = true;
      const [x0, y0] = toSvg(d.sx, d.sy);
      const [x1, y1] = toSvg(ev.clientX, ev.clientY);
      if (d.mode === 'pan') {
        const k = d.vb.w / Math.max(1, svg.current?.clientWidth ?? 1);
        setVb({ ...d.vb, x: d.vb.x - (ev.clientX - d.sx) * k, y: d.vb.y - (ev.clientY - d.sy) * k });
        return;
      }
      const st = d.start!;
      if (d.mode === 'move') setEdit1(d.id!, { coordinates: uvToLngLat(st.u + (x1 - x0), st.v - (y1 - y0)) });
      if (d.mode === 'rot') {
        const ang = (Math.atan2(x1 - st.u, -(y1 - -st.v)) * 180) / Math.PI;
        setEdit1(d.id!, { rotation: Math.round(((ang % 360) + 360) % 360 / 5) * 5 });
      }
      if (d.mode === 'size') {
        const a = ((st.rotation ?? 0) * Math.PI) / 180;
        const dx = x1 - st.u;
        const dy = y1 - -st.v;
        // Into the building's own axes.
        const lx = dx * Math.cos(a) + dy * Math.sin(a);
        const ly = -dx * Math.sin(a) + dy * Math.cos(a);
        setEdit1(d.id!, { footprint: { w: Math.max(6, Math.round(Math.abs(lx) * 2)), d: Math.max(6, Math.round(Math.abs(ly) * 2)) } });
      }
    };
    const up = () => {
      const d = drag.current;
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      drag.current = undefined;
      if (d && !d.moved) setSel(d.id);
      if (d?.moved && d.mode !== 'pan') setSaved(undefined);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const zoom = (k: number, cx?: number, cy?: number) => setVb((b) => {
    const w = Math.min(2400, Math.max(60, b.w * k));
    const h = b.h * (w / b.w);
    const [px, py] = cx !== undefined && cy !== undefined ? toSvg(cx, cy) : [b.x + b.w / 2, b.y + b.h / 2];
    return { x: px - (px - b.x) * (w / b.w), y: py - (py - b.y) * (w / b.w), w, h };
  });
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY); };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const all = useMemo(() => applyPlaceEdits(edits), [edits]);
  const [copied, setCopied] = useState<'copied' | 'manual' | undefined>();
  const doExport = () => {
    // Authored features with their corrections, plus any game record you placed by hand.
    const extra = placed.filter((p) => !p.authored && edits[p.f.id]).map((p) => p.f);
    const text = JSON.stringify(placesGeoJson([...all, ...extra]), null, 2);
    // Copied, not downloaded: the published page can't follow blob: or data: links.
    // The box below always shows the JSON, selected, for copying by hand.
    setExportText(text);
    setCopied(undefined);
    try {
      void navigator.clipboard.writeText(text).then(() => setCopied('copied'), () => setCopied('manual'));
    } catch { setCopied('manual'); }
  };
  const nEdits = Object.keys(edits).length;

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#16365a]" data-testid="plan-view" data-year={year} data-edit={edit ? '1' : '0'}>
      <svg ref={svg} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full select-none" style={{ touchAction: 'none' }}
        onPointerDown={(e) => onDown(e, 'pan')}>
        <Ground year={year} A={A} />
        <g pointerEvents={edit ? 'none' : undefined}>{realm('fill')}</g>
        {/* The lots on the ground, then the photos from the back to the front, then the name tags over everything. */}
        {placed.map((p) => {
          const L = layout.sp.get(p.f.id);
          const photo = !!sprites[p.f.id] && L?.mode === 'photo';
          return <Footprint key={p.f.id} p={p} sel={sel === p.f.id} edit={edit} color={colorOf(p)} label={labelOf(p)} photo={photo} dot={!photo && !!sprites[p.f.id]} dotR={3.2 / pxPerM} hs={Math.max(3, vb.w / 90)} onDown={(e, mode) => onDown(e, mode, p)} />;
        })}
        <g data-testid="plan-sprites">
          {/* Depth: the photo standing lower on the screen is nearer, and drawn over. */}
          {[...placed].sort((a, b) => { const A = layout.sp.get(a.f.id); const B = layout.sp.get(b.f.id); return (A ? A.y + A.h : 0) - (B ? B.y + B.h : 0); }).map((p) => {
            const L = layout.sp.get(p.f.id);
            const sp = sprites[p.f.id];
            if (!sp || !L || L.mode !== 'photo') return null;
            const isSel = sel === p.f.id;
            return <image key={p.f.id} href={sp.src} x={L.x} y={L.y} width={L.w} height={L.h} preserveAspectRatio="xMidYMax meet" data-testid="plan-sprite" data-id={p.f.id} style={{ cursor: edit ? 'move' : 'pointer', filter: isSel ? 'drop-shadow(0 0 3px #ffe28a)' : 'drop-shadow(0 2px 2px rgba(0,0,0,0.6))' }} onPointerDown={(e) => onDown(e, 'move', p)} />;
          })}
        </g>
        <g data-testid="plan-labels" pointerEvents="none" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
          {placed.map((p) => {
            const t = layout.labels.get(p.f.id);
            if (!t) return null;
            const c = colorOf(p);
            return (
              <g key={p.f.id} data-testid="plan-label" data-id={p.f.id}>
                <rect x={t.x} y={t.y} width={t.w} height={t.h} rx={t.h / 2} fill="#1b1030" fillOpacity="0.85" stroke={sel === p.f.id ? '#ffe28a' : c} strokeWidth={t.fs * 0.1} />
                <text x={t.x + t.w / 2} y={t.y + t.h * 0.72} textAnchor="middle" fontSize={t.fs} fontWeight="700" fill="#fff3dc">{labelOf(p)}</text>
              </g>
            );
          })}
        </g>
        {realm('ink')}
      </svg>
      {/* Toolbar. */}
      <div className="absolute left-2 top-11 z-10 flex flex-wrap items-center gap-1.5 max-w-[calc(100%-1rem)]" data-plan-ui data-hv-ui>
        <button type="button" className="hv-btn" onClick={onClose} data-testid="plan-close">← Island map</button>
        <label className="hv-btn flex items-center gap-1">Area
          <select className="bg-transparent text-[11px] max-w-[9.5rem]" value={A.id} onChange={(e) => goArea(e.target.value)} data-testid="plan-area">
            {PLAN_AREAS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <span className="hv-btn hv-on" data-testid="plan-year">{year}{peek !== undefined ? ' (peek)' : ''}</span>
        <button type="button" className="hv-btn" onClick={() => zoom(1 / 1.4)} aria-label="Zoom in">+</button>
        <button type="button" className="hv-btn" onClick={() => zoom(1.4)} aria-label="Zoom out">−</button>
        <button type="button" className={`hv-btn ${edit ? 'hv-on' : ''}`} onClick={() => setEdit((x) => !x)} data-testid="plan-edit">{edit ? 'Editing map' : 'Edit map'}</button>
        <button type="button" className="hv-btn" onClick={() => setTowns(true)} title="Make or correct a town package: districts, parcels, years, evidence, art; validate and copy it out" data-testid="plan-town-editor">Town editor</button>
        {edit && <>
          <button type="button" className="hv-btn" onClick={() => setSaved(saveEdits(edits) ? 'saved' : 'failed')} data-testid="plan-save">Save corrections{nEdits ? ` (${nEdits})` : ''}</button>
          <button type="button" className="hv-btn" onClick={doExport} data-testid="plan-export">Copy corrections</button>
          {sel && edits[sel] && <button type="button" className="hv-btn" onClick={() => setEdits((all) => { const n = { ...all }; delete n[sel]; return n; })}>Undo this one</button>}
          <label className="hv-btn flex items-center gap-1">Peek
            <select className="bg-transparent text-[11px]" value={peek ?? ''} onChange={(e) => setPeek(e.target.value ? Number(e.target.value) : undefined)} data-testid="plan-peek">
              <option value="">game year</option>
              {[1955, 1960, 1965, 1970, 1975, 1980, 1986].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          {saved && <span className={`text-[11px] ${saved === 'saved' ? 'text-emerald-300' : 'text-rose-300'}`} data-testid="plan-saved">{saved === 'saved' ? 'Saved in this browser' : 'Could not save here — use Copy corrections'}</span>}
        </>}
      </div>
      <div className="absolute left-2 bottom-2 z-10 rounded bg-[#1b1030]/85 border border-[#ff5fa2]/60 px-2 py-1 text-[11px] text-[#ffd1e6] max-w-[70%]" data-plan-ui>
        <span className="font-display">{A.name}</span>
        <span className="text-stone-400"> · {placed.filter((p) => p.authored).length} placed, {placed.filter((p) => p.f.properties.located === 'verified').length} verified · dashed = approximate (in edit)</span>
        {elsewhere.length > 0 && <span className="hidden md:inline text-stone-400"> · {elsewhere.length} more in the other areas</span>}
      </div>
      {exportText && (
        <div className="absolute right-2 bottom-2 z-20 w-[min(420px,calc(100%-1rem))] panel p-2 space-y-1" data-plan-ui data-testid="plan-export-box">
          <div className="flex justify-between gap-2 text-xs text-stone-300">
            <span data-testid="plan-copied">{copied === 'copied' ? 'Copied to the clipboard (GeoJSON)' : copied === 'manual' ? 'Select all and copy (GeoJSON)' : 'Copying…'}</span>
            <button type="button" onClick={() => setExportText(undefined)}>close ×</button>
          </div>
          <textarea readOnly autoFocus value={exportText} className="w-full h-40 bg-noir-900 text-[10px] font-mono text-stone-300 p-1" ref={(el) => { if (el && copied === 'manual') el.select(); }} onFocus={(e) => e.currentTarget.select()} />
        </div>
      )}
      {selP && edit && !exportText && (
        <div className="absolute z-20 left-2 right-2 bottom-10 md:left-auto md:bottom-auto md:right-2 md:top-12 md:w-[300px] panel p-2 space-y-1.5 text-xs" data-plan-ui data-testid="plan-edit-panel">
          <div className="flex justify-between gap-2"><span className="font-display text-sm text-[#ffd1e6] truncate">{selP.it?.name ?? selP.f.properties.name}</span><button type="button" className="text-stone-400" onClick={() => setSel(undefined)}>done</button></div>
          <div className="text-stone-400">Drag it to move; the yellow handle turns it; the square resizes it.</div>
          <div className="grid grid-cols-3 gap-1">
            {([['Turn °', 'rotation'], ['Width m', 'w'], ['Depth m', 'd']] as const).map(([t, k]) => (
              <label key={k} className="flex flex-col text-[10px] text-stone-500">{t}
                <input type="number" className="bg-noir-900 border border-noir-700 rounded px-1 py-0.5 text-xs text-stone-200" data-testid={`plan-in-${k}`}
                  value={k === 'rotation' ? selP.f.properties.rotation : selP.f.properties.footprint[k]}
                  onChange={(e) => { const n = Number(e.target.value); if (!Number.isFinite(n)) return; setSaved(undefined); setEdit1(selP.f.id, k === 'rotation' ? { rotation: n } : { footprint: { ...selP.f.properties.footprint, [k]: Math.max(4, n) } }); }} />
              </label>
            ))}
          </div>
          <div className="text-stone-500 tabular-nums">{selP.f.geometry.coordinates[1].toFixed(6)}, {selP.f.geometry.coordinates[0].toFixed(6)} · {selP.f.properties.located}</div>
        </div>
      )}
      {towns && <TownEditor year={s.date.y} onClose={() => setTowns(false)} />}
      {selP && !edit && !exportText && (
        <div className="absolute z-20 panel overflow-y-auto p-3 inset-x-0 bottom-0 max-h-[60%] rounded-b-none md:inset-x-auto md:right-2 md:top-12 md:bottom-12 md:max-h-none md:w-[360px] md:rounded-b-lg" data-plan-ui>
          <PlaceCard p={selP} s={s} onClose={() => setSel(undefined)} onOpenLot={selP.it && !selP.f.properties.establishment ? () => onPick(selP.it!.key) : undefined} />
        </div>
      )}
    </div>
  );
}
