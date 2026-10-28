import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { labelPoint, linesPath, mergeRealms, placeRealmLabel, realmBorders, realmKey, ringsPath, spreadLabels, type Pt, type RealmRegion } from './realmGeo';

/**
 * <PoliticalOverlay>: the Paradox political map mode as one SVG layer, for
 * any map. Hand it regions in the map's own world coordinates and a style per
 * holder; it draws
 *
 *  - each area washed in its holder's colour (contested areas striped in both
 *    colours, unheld areas parchment), eased so the streets still show;
 *  - thick borders between realms, thin ones between a realm's districts;
 *  - each contiguous realm's name ("THE TROISI FAMILY") painted in big spaced
 *    capitals along the territory's long axis, shrinking and fading as you
 *    zoom in, until the district names take over;
 *  - a tooltip on hover (holder, crest, control, and any rows the map adds);
 *  - a colour wash across an area when it changes hands.
 *
 * Usage (inside the map's zoomed <g>, coordinates = the map's world units):
 *
 *   <PoliticalOverlay regions={regions} styles={{ player: {...}, manno: {...} }}
 *     scale={pxPerUnit} onPick={(id) => select(id)} details={(r) => rows} />
 *
 * `layer` splits it in two for a map whose buildings should sit on top of the
 * wash: render layer="fill" under the buildings and layer="ink" (borders and
 * names) over them. `values` + `ramp` turn it into a choropleth (heat,
 * rackets) on the same shapes. The geometry helpers are in realmGeo.ts; a map
 * with no district shapes can make them with gridRegions.ts.
 */

export interface HolderStyle {
  /** Wash colour (hex). */
  color: string;
  /** The realm's name as painted on the map: "THE MANNO FAMILY". */
  name: string;
  /** Short name for the tooltip: "The Manno family". */
  label?: string;
  /** Crest glyph (never colour alone). */
  emblem?: string;
  /** Name fill; default a pale tint of the colour. */
  ink?: string;
  /** Name outline; default near-black. */
  halo?: string;
}

export interface OverlayValue { t: number; text?: string }

export interface PoliticalOverlayProps {
  regions: RealmRegion[];
  styles: Record<string, HolderStyle>;
  /** Screen pixels per world unit (the map's zoom). */
  scale: number;
  /** Which part to draw. Default 'all'. */
  layer?: 'all' | 'fill' | 'ink';
  /** Wash opacity. Default 0.5. */
  fillOpacity?: number;
  /** Unheld land. Default parchment. */
  neutral?: string;
  /** Choropleth mode: a value per region id, coloured along `ramp`; realm names give way to the values. */
  values?: Record<string, OverlayValue>;
  ramp?: [string, string];
  /** Clicked an area. */
  onPick?: (id: string) => void;
  /** Extra tooltip rows for an area. */
  details?: (r: RealmRegion) => [string, ReactNode][];
  /** Hover tooltips. Default true. */
  tooltips?: boolean;
  /** Screen size (px) above which realm names fade out; default 72. */
  realmMaxPx?: number;
  /** Prefix for SVG ids (two overlays on one page). */
  idPrefix?: string;
  /** Selected region id (outlined). */
  selected?: string;
}

const NEUTRAL = '#e9dcbc';

function hex(c: string): [number, number, number] {
  if (c.startsWith('rgb')) { const m = c.match(/\d+/g) ?? ['0', '0', '0']; return [+m[0], +m[1], +m[2]]; }
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function mixColor(a: string, b: string, t: number): string {
  const x = hex(a);
  const y = hex(b);
  const c = x.map((v, i) => Math.round(v + (y[i] - v) * Math.max(0, Math.min(1, t))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function PoliticalOverlay(p: PoliticalOverlayProps) {
  const { regions, styles, scale, layer = 'all', fillOpacity = 0.5, neutral = NEUTRAL, values, ramp = ['#f4e3b0', '#b3261e'], onPick, details, tooltips = true, realmMaxPx = 72, idPrefix = 'po', selected } = p;
  const geo = useMemo(() => {
    const realms = mergeRealms(regions);
    const borders = realmBorders(regions);
    const paths = new Map(regions.map((r) => [r.id, ringsPath(r.polygons)]));
    const centers = new Map(regions.map((r) => [r.id, labelPoint(r.polygons)]));
    return { realms, borders, paths, centers };
  }, [regions]);
  const labels = useMemo(() => geo.realms.filter((r) => r.holder && !r.contested && styles[r.holder]).map((r) => {
    const name = styles[r.holder!].name;
    return { realm: r, name, lab: placeRealmLabel(r.polygons, name) };
  }), [geo, styles]);

  // A colour wash when an area changes hands.
  const prev = useRef(new Map<string, string>());
  const [wash, setWash] = useState<Record<string, { from: string; n: number }>>({});
  const fillOf = (r: Pick<RealmRegion, 'holder' | 'contested' | 'id'>): string => {
    if (values) { const v = values[r.id]; return v ? mixColor(ramp[0], ramp[1], v.t) : neutral; }
    if (r.contested) return `url(#${idPrefix}-hatch-${r.contested.join('-')})`;
    return r.holder && styles[r.holder] ? styles[r.holder].color : neutral;
  };
  useEffect(() => {
    const next: Record<string, { from: string; n: number }> = {};
    for (const r of regions) {
      const k = realmKey(r);
      const was = prev.current.get(r.id);
      if (was !== undefined && was !== k && !values) {
        const [kind, rest] = was.includes(':') ? was.split(':') : [was, ''];
        const from = kind === 'contested' ? `url(#${idPrefix}-hatch-${rest.split('|').join('-')})` : styles[was]?.color ?? neutral;
        next[r.id] = { from, n: Date.now() };
      }
      prev.current.set(r.id, k);
    }
    if (Object.keys(next).length) {
      setWash((w) => ({ ...w, ...next }));
      const t = setTimeout(() => setWash((w) => { const o = { ...w }; for (const id in next) if (o[id]?.n === next[id].n) delete o[id]; return o; }), 1800);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [regions]); // eslint-disable-line react-hooks/exhaustive-deps

  const [hover, setHover] = useState<{ id: string; x: number; y: number } | undefined>();
  const hoverRegion = hover ? regions.find((r) => r.id === hover.id) : undefined;
  const px = 1 / Math.max(1e-6, scale);
  const pairs = useMemo(() => {
    const m = new Map<string, [string, string]>();
    for (const r of regions) if (r.contested) m.set(r.contested.join('-'), r.contested);
    return [...m.entries()];
  }, [regions]);

  const drawFill = layer !== 'ink';
  const drawInk = layer !== 'fill';
  const realmOp = values ? 0 : 1;
  // A realm's name holds at full strength until it would outgrow realmMaxPx, then is gone by 1.3× (the district names take over).
  const fade = (fsPx: number) => clamp01((realmMaxPx * 1.3 - fsPx) / (realmMaxPx * 0.3));

  return (
    <g data-testid={`political-${layer}`} className="political-overlay">
      {drawFill && (
        <>
          <defs>
            {pairs.map(([id, [a, b]]) => (
              <pattern key={id} id={`${idPrefix}-hatch-${id}`} patternUnits="userSpaceOnUse" width={12 * px} height={12 * px} patternTransform="rotate(45)">
                <rect width={12 * px} height={12 * px} fill={styles[a]?.color ?? neutral} />
                <rect width={6 * px} height={12 * px} fill={styles[b]?.color ?? neutral} />
              </pattern>
            ))}
            {regions.filter((r) => wash[r.id]).map((r) => {
              const c = geo.centers.get(r.id)!;
              return (
                <clipPath key={`${r.id}:${wash[r.id].n}`} id={`${idPrefix}-wash-${r.id}`}>
                  <circle cx={c[0]} cy={c[1]} r="0">
                    <animate attributeName="r" from="0" to={4000} dur="1.5s" fill="freeze" calcMode="spline" keySplines="0.4 0 0.2 1" keyTimes="0;1" />
                  </circle>
                </clipPath>
              );
            })}
          </defs>
          <g opacity={fillOpacity} data-testid="political-fills">
            {regions.map((r) => {
              const w = wash[r.id];
              const d = geo.paths.get(r.id)!;
              const handlers = {
                onPointerMove: tooltips ? (e: React.PointerEvent) => { if (e.pointerType === 'mouse') setHover({ id: r.id, x: e.clientX, y: e.clientY }); } : undefined,
                onPointerLeave: () => setHover((h) => (h?.id === r.id ? undefined : h)),
                onClick: onPick ? (e: React.MouseEvent) => { e.stopPropagation(); onPick(r.id); } : undefined,
              };
              return (
                <g key={r.id} data-region={r.id} data-holder={realmKey(r)} style={{ cursor: onPick ? 'pointer' : undefined }} {...handlers}>
                  {w ? <path d={d} fill={w.from} fillRule="evenodd" /> : null}
                  <path d={d} fill={fillOf(r)} fillRule="evenodd" clipPath={w ? `url(#${idPrefix}-wash-${r.id})` : undefined} />
                </g>
              );
            })}
          </g>
        </>
      )}
      {drawInk && (
        <g style={{ pointerEvents: 'none' }}>
          <path d={linesPath(geo.borders.district)} fill="none" stroke="#2b2116" strokeOpacity={0.55} strokeWidth={0.9 * px} strokeDasharray={`${4 * px} ${3 * px}`} />
          <path d={linesPath(geo.borders.realm)} fill="none" stroke="#1d150d" strokeOpacity={0.85} strokeWidth={3.2 * px} strokeLinejoin="round" strokeLinecap="round" />
          <path d={linesPath(geo.borders.realm)} fill="none" stroke="#f6ecd2" strokeOpacity={0.35} strokeWidth={1 * px} strokeLinejoin="round" />
          <path d={linesPath(geo.borders.outer)} fill="none" stroke="#1d150d" strokeOpacity={0.5} strokeWidth={1.6 * px} strokeLinejoin="round" />
          {selected && geo.paths.get(selected) && <path d={geo.paths.get(selected)} fill="none" stroke="#fff3c4" strokeWidth={3 * px} fillRule="evenodd" />}
          {realmOp > 0 && labels.map(({ realm, name, lab }) => {
            if (!lab) return null;
            const st = styles[realm.holder!];
            const fsPx = Math.min(lab.fontSize * scale, realmMaxPx);
            if (fsPx < 7) return null;
            const op = fade(lab.fontSize * scale);
            if (op <= 0.02) return null;
            const fs = fsPx * px;
            const tl = Math.min(lab.textLength, lab.textLength * (fs / lab.fontSize) * 1.6, lab.length * 0.9);
            const chars = [...name].length;
            const spacing = Math.max(0, (tl - chars * fs * 0.72) / chars);
            const id = `${idPrefix}-realm-${realm.ids.join('_')}`;
            return (
              <g key={realm.ids.join('_')} opacity={op} data-testid="realm-name" data-realm={realm.key}>
                <path id={id} d={lab.d} fill="none" stroke="none" />
                <text fontSize={fs} fontWeight={700} letterSpacing={spacing} fill={st.ink ?? mixColor(st.color, '#ffffff', 0.72)} stroke={st.halo ?? '#140d06'} strokeWidth={fs * 0.16} strokeLinejoin="round" paintOrder="stroke"
                  style={{ fontFamily: "'Cinzel', 'Trajan Pro', 'Palatino Linotype', Georgia, serif", fontVariant: 'small-caps' }}>
                  <textPath href={`#${id}`} startOffset="50%" textAnchor="middle" dx={spacing / 2}>{name}</textPath>
                </text>
              </g>
            );
          })}
          {(() => {
            // District names: when the realm names give way (closer in), on contested and unheld land, and always in a choropleth.
            const fs = 11 * px;
            const shown = regions.flatMap((r) => {
              const realm = labels.find((l) => l.realm.ids.includes(r.id));
              const realmVis = realm?.lab && !values ? fade(realm.lab.fontSize * scale) * (Math.min(realm.lab.fontSize * scale, realmMaxPx) >= 7 ? 1 : 0) : 0;
              const op = values ? 1 : clamp01(1 - realmVis);
              if (op <= 0.05 || r.hideName) return [];
              const sub = values?.[r.id]?.text ?? (r.contested ? 'Contested' : undefined);
              return [{ r, op, sub, c: geo.centers.get(r.id)! }];
            });
            const spots = spreadLabels(shown.map(({ r, sub, c }) => ({ id: r.id, x: c[0], y: c[1] - fs * 0.35, w: [...r.name].length * fs * 0.62, h: fs * (sub ? 2.4 : 1.3) })));
            return shown.map(({ r, op, sub }) => {
              const [x, yc] = spots.get(r.id)!;
              const y = yc + fs * (sub ? -0.1 : 0.35);
              return (
                <g key={r.id} opacity={op} data-testid="district-name">
                  <text x={x} y={y} fontSize={fs} fontWeight={700} textAnchor="middle" fill="#fff8e6" stroke="#1d150d" strokeWidth={fs * 0.28} paintOrder="stroke" letterSpacing={fs * 0.08}
                    style={{ fontFamily: "'Palatino Linotype', Georgia, serif", fontVariant: 'small-caps' }}>{r.name}</text>
                  {sub && <text x={x} y={y + fs * 1.2} fontSize={fs * 0.85} fontWeight={700} textAnchor="middle" fill={r.contested && !values ? '#ffd27a' : '#fff8e6'} stroke="#1d150d" strokeWidth={fs * 0.24} paintOrder="stroke">{sub}</text>}
                </g>
              );
            });
          })()}
        </g>
      )}
      {tooltips && hover && hoverRegion && typeof document !== 'undefined' && createPortal(<RealmTooltip r={hoverRegion} styles={styles} x={hover.x} y={hover.y} rows={details?.(hoverRegion) ?? []} />, document.body)}
    </g>
  );
}

/** The hover card: crest, holder, area, control, and the map's own rows. */
export function RealmTooltip({ r, styles, x, y, rows }: { r: RealmRegion; styles: Record<string, HolderStyle>; x: number; y: number; rows: [string, ReactNode][] }) {
  const st = r.holder ? styles[r.holder] : undefined;
  const other = r.contested ? styles[r.contested[1]] : undefined;
  const left = typeof window !== 'undefined' && x > window.innerWidth - 260 ? x - 250 : x + 16;
  return (
    <div role="tooltip" data-testid="realm-tooltip" className="pointer-events-none fixed z-[2000] w-[230px] rounded border border-noir-600 bg-noir-900/95 px-2.5 py-2 text-[11px] text-stone-200 shadow-xl" style={{ left, top: y + 14 }}>
      <div className="flex items-center gap-2">
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-sm" style={{ borderColor: st?.color ?? NEUTRAL, color: st?.color ?? '#b9ad8f', background: '#120d08' }}>{st?.emblem ?? '○'}</span>
        <div className="min-w-0">
          <div className="truncate font-semibold text-stone-100">{r.name}</div>
          <div className="truncate text-[10px]" style={{ color: st?.color ?? '#b9ad8f' }}>
            {r.contested ? `Contested: ${st?.label ?? r.contested[0]} vs ${other?.label ?? r.contested[1]}` : st ? st.label ?? st.name : 'Nobody holds it'}
          </div>
        </div>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <span className="text-stone-500">Control</span>
        <span className="h-1.5 flex-1 overflow-hidden rounded bg-noir-700"><span className="block h-full" style={{ width: `${Math.max(0, Math.min(100, r.share))}%`, background: st?.color ?? NEUTRAL }} /></span>
        <span className="tabular-nums">{Math.round(r.share)}%</span>
      </div>
      {rows.map(([k, v]) => <div key={k} className="mt-0.5 flex gap-1.5"><span className="w-14 shrink-0 text-stone-500">{k}</span><span className="min-w-0">{v}</span></div>)}
    </div>
  );
}

export type { Pt, RealmRegion };
