import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { controllerOf, crewIn, nycOf } from '../../engine/nyc';
import { NYC_DISTRICTS } from '../../engine/nycData';
import { NYC_GEO, type NycLineKind } from '../../engine/nycGeo';
import { NYC_SIDE_STYLE, SIDE_STYLE } from '../../engine/sides';
import type { GameState } from '../../engine/types';
import { usePanZoom, type View } from '../hood/usePanZoom';

/**
 * New York, 1960, on the real map: the five boroughs' shorelines, the
 * rivers and the bay between them, the parks, the bridges, tunnels and
 * ferries of the year (no Verrazzano yet; the Third Avenue El only in the
 * Bronx), and the game's neighborhoods tinted by who runs them — each
 * family's colour AND emblem (engine/sides.ts), your gold star where you
 * run it, a gold ring where your crew works. Drag to pan, wheel or pinch to
 * zoom (usePanZoom, as the region map). Everything is bundled: no tiles.
 */

const G = NYC_GEO;
const W = G.meta.width;
const H = G.meta.height;
const BOUNDS = { x0: 0, y0: 0, x1: W, y1: H };

const INK = {
  sea: '#9fbfcc', seaLine: '#86a9b8', land: '#efe5cc', landEdge: '#7d7462', outside: '#ddd3bb', park: '#b9cf98', mesh: '#c9bb9a',
  water: '#2f5b70', label: '#3b342a', nj: '#6f6655', bridge: '#2b2621', tunnel: '#3f6fb0', ferry: '#2b6f9a', road: '#c9852e', el: '#8a4fa0', planned: '#8a7f86',
};

const LINE_STYLE: Record<NycLineKind, { stroke: string; w: number; dash?: string; cap?: 'round' | 'butt' }> = {
  bridge: { stroke: INK.bridge, w: 3.2, cap: 'butt' },
  tunnel: { stroke: INK.tunnel, w: 1.8, dash: '4 3' },
  ferry: { stroke: INK.ferry, w: 1.4, dash: '1.5 3', cap: 'round' },
  road: { stroke: INK.road, w: 1.3, cap: 'round' },
  el: { stroke: INK.el, w: 1.4, dash: '6 2' },
  planned: { stroke: INK.planned, w: 1.6, dash: '2 3' },
};

export interface DistrictTint { color: string; emblem: string; short: string; mine: boolean; crew: boolean; war: boolean }

/** How a neighborhood is drawn: its controller's colour and emblem, your crew, a war. */
export function districtTint(s: GameState, id: string): DistrictTint {
  const c = controllerOf(s, id);
  const crew = !!crewIn(s, id);
  if (c === 'player') return { color: SIDE_STYLE.player.color, emblem: SIDE_STYLE.player.emblem, short: 'YOURS', mine: true, crew, war: false };
  if (c === 'open') return { color: SIDE_STYLE.none.color, emblem: '○', short: 'OPEN', mine: false, crew, war: false };
  const st = NYC_SIDE_STYLE[c];
  return { color: st.color, emblem: st.emblem, short: st.short, mine: false, crew, war: nycOf(s).war.includes(c) };
}

export function NycMap({ s, sel, onSelect, height = '62vh' }: { s: GameState; sel?: string; onSelect: (id: string | undefined) => void; height?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const g = useRef<SVGGElement>(null);
  const apply = useCallback((v: View, m: number) => {
    g.current?.setAttribute('transform', `translate(${(v.tx + m).toFixed(1)} ${(v.ty + m).toFixed(1)}) scale(${v.sc.toFixed(4)})`);
  }, []);
  const pz = usePanZoom({ host, layer, apply, bounds: BOUNDS, minSc: 0.3, maxSc: 12 });
  // The legend folds away on a phone (it would cover half the map).
  const [legend, setLegend] = useState(() => typeof window === 'undefined' || window.innerWidth >= 640);
  const home = useCallback(() => pz.fitView(140, 30, W - 20, H - 20, 0.98), [pz.fitView]);
  useEffect(() => { pz.setView(home()); }, []);
  // Labels keep their size on screen as the map zooms.
  const k = 1 / Math.max(0.3, pz.sc);
  const fs = (px: number) => +(px * k).toFixed(3);
  const tier = pz.sc < 1.3 ? 0 : pz.sc < 2.6 ? 1 : 2;

  const ground = useMemo(() => (
    <>
      <rect x={-2000} y={-2000} width={W + 4000} height={H + 4000} fill="url(#nyc-sea)" />
      <path d={G.outside} fill={INK.outside} stroke={INK.landEdge} strokeWidth={0.6} strokeOpacity={0.5} vectorEffect="non-scaling-stroke" />
      {G.boroughs.map((b) => <path key={b.code} d={b.d} fill={INK.land} stroke={INK.landEdge} strokeWidth={1} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />)}
      <path d={G.parks} fill={INK.park} stroke="#8fae6e" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
      <path d={G.mesh} fill="none" stroke={INK.mesh} strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
    </>
  ), []);

  const tints = useMemo(() => Object.fromEntries(NYC_DISTRICTS.map((d) => [d.id, districtTint(s, d.id)])), [s]);
  const districts = NYC_DISTRICTS.map((d) => {
    const geo = G.districts[d.id];
    const t = tints[d.id];
    const on = sel === d.id;
    return (
      <g key={d.id} data-testid={`nyc-district-${d.id}`} data-owner={t.short} style={{ cursor: 'pointer' }}
        onClick={(e) => { e.stopPropagation(); if (!pz.wasDrag()) onSelect(d.id); }}>
        <title>{`${d.name} — ${t.short}`}</title>
        {/* The stroke in the fill colour covers the coarse neighborhood edge at the shore; the land clip keeps it off the water. */}
        <path d={geo.d} clipPath="url(#nyc-land)" fill={t.color} fillOpacity={on ? 0.55 : 0.36} stroke={t.color} strokeOpacity={on ? 0.55 : 0.36} strokeWidth={5} strokeLinejoin="round" />
        <path d={geo.d} fill={t.mine ? 'url(#nyc-hatch-gold)' : 'none'} stroke={t.color} strokeWidth={on ? 2.6 : 1.4} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {t.crew && <path d={geo.d} fill="none" stroke={SIDE_STYLE.player.color} strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />}
        {t.war && <path d={geo.d} fill="url(#nyc-hatch-war)" stroke="#b3261e" strokeWidth={1.6} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
      </g>
    );
  });

  const lines = G.lines.map((l) => {
    const st = LINE_STYLE[l.kind];
    if (l.kind === 'road' && tier === 0) return <path key={l.id} d={l.d} fill="none" stroke={st.stroke} strokeWidth={st.w * 0.8} strokeOpacity={0.55} vectorEffect="non-scaling-stroke" />;
    return (
      <g key={l.id} data-testid={`nyc-line-${l.kind}`}>
        <title>{l.name}{l.year ? ` (${l.year})` : ''}</title>
        {l.kind === 'bridge' && <path d={l.d} fill="none" stroke={INK.land} strokeWidth={st.w + 2} strokeLinecap="butt" vectorEffect="non-scaling-stroke" />}
        <path d={l.d} fill="none" stroke={st.stroke} strokeWidth={st.w} strokeDasharray={st.dash} strokeLinecap={st.cap ?? 'round'} strokeOpacity={l.kind === 'road' ? 0.8 : 1} vectorEffect="non-scaling-stroke" />
      </g>
    );
  });

  const lineLabels = tier >= 1 ? G.lines.filter((l) => l.kind !== 'road' || tier >= 2).map((l) => (
    <text key={l.id} x={l.mid[0]} y={l.mid[1] - fs(5)} fontSize={fs(l.kind === 'road' ? 8.5 : 9.5)} textAnchor="middle" fill={LINE_STYLE[l.kind].stroke} stroke={INK.land} strokeWidth={fs(2.6)} paintOrder="stroke" fontStyle={l.kind === 'planned' ? 'italic' : undefined} style={{ pointerEvents: 'none' }}>
      {l.name}
    </text>
  )) : null;

  const labels = G.labels.map((l, i) => {
    if (l.kind === 'landmark' && tier === 0) return null;
    const size = l.kind === 'borough' ? 15 : l.kind === 'water' ? 11 : l.kind === 'nj' ? 10.5 : 9;
    const common = { x: l.x, y: l.y, fontSize: fs(size), textAnchor: 'middle' as const, transform: l.rot ? `rotate(${l.rot} ${l.x} ${l.y})` : undefined, style: { pointerEvents: 'none' as const } };
    if (l.kind === 'water') return <text key={i} {...common} fill={INK.water} fontStyle="italic" letterSpacing={fs(1.5)} opacity={0.85}>{l.name}</text>;
    if (l.kind === 'borough') return <text key={i} {...common} fill={INK.label} fontWeight={700} letterSpacing={fs(5)} opacity={0.42}>{l.name}</text>;
    if (l.kind === 'nj') return <text key={i} {...common} fill={INK.nj} letterSpacing={fs(1)} opacity={0.8}>{l.name}</text>;
    return (
      <g key={i} style={{ pointerEvents: 'none' }}>
        <circle cx={l.x} cy={l.y} r={fs(2.2)} fill={INK.label} />
        <text {...common} y={l.y - fs(4.5)} fill={INK.label} stroke={INK.land} strokeWidth={fs(2.4)} paintOrder="stroke">{l.name}</text>
      </g>
    );
  });

  const districtLabels = NYC_DISTRICTS.map((d) => {
    const geo = G.districts[d.id];
    const t = tints[d.id];
    const on = sel === d.id;
    const [x, y] = geo.at;
    const r = fs(on ? 9 : 7.5);
    return (
      <g key={d.id} style={{ pointerEvents: 'none' }} data-testid={`nyc-label-${d.id}`}>
        <circle cx={x} cy={y} r={r} fill={t.color} stroke="#1d1a17" strokeWidth={fs(1.2)} />
        <text x={x} y={y + fs(on ? 3.4 : 2.9)} fontSize={fs(on ? 10 : 8.5)} textAnchor="middle" fill="#14110e" fontWeight={700}>{t.emblem}</text>
        {(tier >= 1 || on || t.crew || t.mine) && (
          <text x={x + r + fs(3)} y={y + fs(3.5)} fontSize={fs(on ? 12 : 10.5)} fill="#1d1a17" stroke="#f6efdc" strokeWidth={fs(3)} paintOrder="stroke" fontWeight={on ? 700 : 600}>
            {d.name}{t.crew ? ' ★' : ''}
          </text>
        )}
      </g>
    );
  });

  return (
    <div className="relative overflow-hidden rounded border border-noir-600 select-none" style={{ height, background: INK.sea, touchAction: 'none' }} data-testid="nyc-map">
      <div ref={host} className="absolute inset-0" onClick={() => { if (!pz.wasDrag()) onSelect(undefined); }}>
        <div ref={layer} className="absolute inset-0" style={{ transformOrigin: '0 0', willChange: 'transform' }}>
          <svg width={`calc(100% + ${pz.margin * 2}px)`} height={`calc(100% + ${pz.margin * 2}px)`} style={{ position: 'absolute', left: -pz.margin, top: -pz.margin }}>
            <defs>
              <pattern id="nyc-sea" width="14" height="14" patternUnits="userSpaceOnUse">
                <rect width="14" height="14" fill={INK.sea} />
                <path d="M0 7h14" stroke={INK.seaLine} strokeWidth="0.6" strokeOpacity="0.6" />
              </pattern>
              <pattern id="nyc-hatch-gold" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <path d="M0 0v6" stroke={SIDE_STYLE.player.color} strokeWidth="1.6" strokeOpacity="0.55" />
              </pattern>
              <pattern id="nyc-hatch-war" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
                <path d="M0 0v5" stroke="#b3261e" strokeWidth="1" strokeOpacity="0.5" />
              </pattern>
              <clipPath id="nyc-land">{G.boroughs.map((b) => <path key={b.code} d={b.d} />)}</clipPath>
            </defs>
            <g ref={g}>
              {ground}
              {districts}
              {lines}
              {labels}
              {lineLabels}
              {districtLabels}
            </g>
          </svg>
        </div>
      </div>
      <div data-pz-ui className="absolute left-2 top-2 flex flex-col gap-1">
        <button type="button" className="rounded bg-noir-900/90 border border-noir-600 w-7 h-7 text-stone-200 hover:text-gold-300" onClick={() => pz.zoomBy(1.5)} aria-label="Zoom in">+</button>
        <button type="button" className="rounded bg-noir-900/90 border border-noir-600 w-7 h-7 text-stone-200 hover:text-gold-300" onClick={() => pz.zoomBy(1 / 1.5)} aria-label="Zoom out">−</button>
        <button type="button" className="rounded bg-noir-900/90 border border-noir-600 w-7 h-7 text-[11px] text-stone-200 hover:text-gold-300" onClick={() => pz.animateTo(home(), 500)} title="The whole city" aria-label="The whole city">⌂</button>
      </div>
      {!legend && <button type="button" data-pz-ui className="absolute right-2 top-2 rounded bg-noir-900/90 border border-noir-600 px-2 py-1 text-[10px] text-stone-300" onClick={() => setLegend(true)}>Legend</button>}
      {legend && <div data-pz-ui className="absolute right-2 top-2 rounded bg-noir-900/85 border border-noir-600 px-2 py-1.5 text-[10px] text-stone-300 space-y-0.5" data-testid="nyc-legend" onClick={() => setLegend(false)} title="Click to fold">
        {Object.entries(NYC_SIDE_STYLE).map(([id, st]) => (
          <div key={id} className="flex items-center gap-1.5"><span className="inline-flex w-3.5 h-3.5 items-center justify-center rounded-full text-[8px] text-noir-900" style={{ background: st.color }}>{st.emblem}</span>{st.label.replace(/^The | family$/g, '')}</div>
        ))}
        <div className="flex items-center gap-1.5"><span className="inline-flex w-3.5 h-3.5 items-center justify-center rounded-full text-[8px] text-noir-900" style={{ background: SIDE_STYLE.player.color }}>★</span>Yours</div>
        <div className="flex items-center gap-1.5"><span className="inline-flex w-3.5 h-3.5 items-center justify-center rounded-full text-[8px] text-noir-900" style={{ background: SIDE_STYLE.none.color }}>○</span>Nobody's</div>
        <div className="flex items-center gap-1.5 text-gold-300"><span className="inline-block w-3.5 border-t-2 border-dashed border-gold-400" />Your crew there</div>
      </div>}
      <div data-pz-ui className="hidden sm:block absolute left-2 bottom-1.5 text-[9px] text-noir-700/90 bg-[#efe5cc]/70 rounded px-1">
        New York, 1960 · bridges &amp; roads traced by hand
      </div>
      <div data-pz-ui className="absolute right-2 bottom-1.5 text-[9px] text-noir-700/90 bg-[#efe5cc]/70 rounded px-1" data-testid="nyc-attribution">
        {G.meta.attribution}
      </div>
    </div>
  );
}
