import { useMemo, useState } from 'react';
import { HOODS_BY_ID, hoodOfZone } from '../../engine/hoodData';
import type { HoodOverlay } from '../../engine/hood';
import type { GameState } from '../../engine/types';
import { OWNER_COLOR } from '../map/lotIcons';
import type { Item } from './Buildings';
import type { Mood } from './iso';
import { NEIGHBORHOOD_ART as blockArt, STREET_ART as streetArt } from './art/paintedArt';

/**
 * Where you land: two painted views of a Wildwood block at dusk (the user's
 * own art), with every building on them a live hotspot bound to a real
 * record on the Boardwalk — its current name and owner on the label, the
 * owner's color glowing round it on hover, badges for a sale, a closing or
 * a crew at work, and the island's overlays tinting it. Click one and its
 * street-view card opens, exactly as on the map.
 *
 *   block   the bird's-eye view of the block, the pier and the wheel behind
 *   street  standing on Pacific Avenue, looking down to the pier
 */

export type Scene = 'block' | 'street';

type Want = 'motel' | 'hotel' | 'food' | 'club' | 'arcade' | 'shop' | 'pier' | 'house';

interface Spot {
  id: string;
  want: Want[];
  /** Polygon in image pixels (1024 × 559). */
  poly: [number, number][];
  /** Where its live label sits. */
  label: [number, number];
}

const W = 1024;
const H = 559;

const BLOCK: Spot[] = [
  { id: 'caribbean', want: ['motel', 'hotel'], poly: [[0, 112], [70, 118], [200, 96], [210, 150], [205, 232], [60, 252], [0, 252]], label: [96, 118] },
  { id: 'capri', want: ['motel', 'hotel'], poly: [[200, 96], [300, 92], [410, 104], [415, 150], [300, 160], [210, 150]], label: [262, 88] },
  { id: 'flamingo', want: ['motel', 'hotel'], poly: [[412, 84], [530, 78], [545, 100], [540, 132], [480, 140], [420, 140]], label: [478, 78] },
  { id: 'strip', want: ['food', 'shop', 'arcade', 'club'], poly: [[268, 175], [410, 148], [545, 140], [588, 190], [585, 255], [470, 330], [380, 356], [295, 305]], label: [430, 150] },
  { id: 'annex', want: ['shop', 'house', 'food'], poly: [[188, 200], [270, 192], [292, 300], [210, 300], [188, 260]], label: [232, 196] },
  { id: 'oceans', want: ['club', 'food'], poly: [[545, 150], [690, 140], [705, 175], [700, 232], [600, 240], [585, 190]], label: [612, 140] },
  { id: 'shell', want: ['shop', 'food', 'club'], poly: [[690, 128], [760, 118], [770, 180], [705, 190]], label: [728, 116] },
  { id: 'pink', want: ['food', 'shop', 'club'], poly: [[720, 98], [822, 92], [828, 140], [760, 146], [722, 140]], label: [772, 92] },
  { id: 'pier', want: ['pier'], poly: [[630, 40], [700, 0], [830, 0], [900, 60], [905, 98], [820, 96], [700, 100], [632, 90]], label: [760, 22] },
  { id: 'pierEnd', want: ['pier', 'arcade', 'food'], poly: [[830, 52], [940, 50], [948, 90], [905, 98], [880, 110], [832, 96]], label: [890, 46] },
  { id: 'farRight', want: ['shop', 'club', 'food', 'motel'], poly: [[905, 98], [1024, 80], [1024, 175], [940, 168], [915, 150]], label: [966, 92] },
  { id: 'balconies', want: ['motel', 'hotel'], poly: [[825, 192], [1024, 180], [1024, 340], [930, 330], [840, 300]], label: [930, 190] },
  { id: 'bite', want: ['food', 'shop'], poly: [[650, 262], [800, 282], [812, 330], [805, 450], [710, 440], [655, 380]], label: [730, 268] },
  { id: 'arcadeCity', want: ['arcade', 'pier', 'shop'], poly: [[815, 330], [1024, 330], [1024, 520], [905, 512], [815, 470]], label: [915, 342] },
  { id: 'caribMotel', want: ['motel', 'house'], poly: [[0, 330], [120, 336], [215, 370], [212, 520], [80, 559], [0, 559]], label: [110, 336] },
  { id: 'houses', want: ['house', 'shop'], poly: [[0, 52], [120, 50], [340, 60], [345, 92], [200, 96], [70, 112], [0, 108]], label: [170, 52] },
];

const STREET: Spot[] = [
  { id: 'rooms', want: ['motel', 'hotel'], poly: [[0, 30], [140, 30], [490, 140], [520, 260], [300, 300], [0, 290]], label: [230, 70] },
  { id: 'pizza', want: ['food'], poly: [[92, 300], [300, 300], [300, 490], [100, 492], [92, 400]], label: [196, 300] },
  { id: 'neon', want: ['arcade', 'pier', 'shop'], poly: [[300, 296], [450, 288], [452, 430], [300, 440]], label: [374, 290] },
  { id: 'starburst', want: ['club', 'food', 'shop'], poly: [[450, 265], [560, 255], [560, 400], [452, 420]], label: [505, 252] },
  { id: 'farLeft', want: ['shop', 'food', 'arcade'], poly: [[560, 250], [680, 268], [760, 300], [760, 340], [580, 360], [560, 340]], label: [640, 246] },
  { id: 'wheel', want: ['pier'], poly: [[630, 196], [728, 196], [730, 300], [632, 300]], label: [680, 190] },
  { id: 'driftwood', want: ['club', 'food'], poly: [[880, 60], [1024, 40], [1024, 500], [930, 470], [880, 340]], label: [962, 44] },
  { id: 'starRight', want: ['club', 'shop', 'food'], poly: [[808, 220], [880, 200], [880, 360], [812, 370]], label: [842, 196] },
];

const SCENES: Record<Scene, { art: string; spots: Spot[]; title: string; blurb: string }> = {
  block: { art: blockArt, spots: BLOCK, title: 'The Boardwalk block', blurb: 'Dusk on the strip: the motels, the clubs and the pier.' },
  street: { art: streetArt, spots: STREET, title: 'Pacific Avenue', blurb: 'On the sidewalk, looking down to the pier.' },
};

function iconWant(it: Item): Want {
  const ic = it.icon;
  if (ic === 'motel' || ic === 'hotel' || ic === 'house' || ic === 'club' || ic === 'pier') return ic;
  if (ic === 'pizza') return 'food';
  if (ic === 'apartment') return 'house';
  return 'shop';
}

/**
 * Bind every hotspot to a record: the Boardwalk's buildings (then the next
 * neighborhood's), by kind, in a stable order — the same building always
 * stands in the same place.
 */
export function bindSpots(items: Item[], spots: Spot[]): Map<string, Item> {
  const hoodOf = (it: Item) => hoodOfZone((it.lot?.zone ?? 'downtown') as never);
  const pool = items
    .filter((it) => it.lot && !it.vacant)
    .sort((a, b) => (hoodOf(a) === 'boardwalk' ? 0 : 1) - (hoodOf(b) === 'boardwalk' ? 0 : 1) || a.key.localeCompare(b.key));
  const used = new Set<string>();
  const out = new Map<string, Item>();
  for (const sp of spots) {
    let pick: Item | undefined;
    for (const w of sp.want) {
      pick = pool.find((it) => !used.has(it.key) && (iconWant(it) === w || (w === 'arcade' && it.useId === 'arcade')));
      if (pick) break;
    }
    pick ??= pool.find((it) => !used.has(it.key));
    if (pick) { used.add(pick.key); out.set(sp.id, pick); }
  }
  return out;
}

const pts = (p: [number, number][]) => p.map(([x, y]) => `${x},${y}`).join(' ');

export function PaintedView({ s, items, scene, mood, overlay, tint, sel, onPick, onScene, onMap }: {
  s: GameState;
  items: Item[];
  scene: Scene;
  mood: Mood;
  overlay: HoodOverlay;
  tint: (it: Item) => string | undefined;
  sel?: string;
  onPick: (key: string) => void;
  onScene: (sc: Scene) => void;
  onMap: () => void;
}) {
  const [hover, setHover] = useState<string | undefined>();
  const [names, setNames] = useState(false);
  const def = SCENES[scene];
  const bound = useMemo(() => bindSpots(items, def.spots), [items, def]);
  const filter = mood === 'day' ? 'brightness(1.16) saturate(1.06) contrast(0.98)' : mood === 'night' ? 'brightness(0.78) saturate(1.12)' : undefined;
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#0b1430]" data-testid="painted-view" data-scene={scene}>
      <div key={scene} className={`absolute inset-0 ${scene === 'street' ? 'pv-walk' : 'pv-land'}`}>
        <img src={def.art} alt={`${def.title}: ${def.blurb}`} className="absolute inset-0 h-full w-full object-cover select-none" style={{ filter }} draggable={false} />
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
          <defs>
            <filter id="pv-glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          </defs>
          {def.spots.map((sp) => {
            const it = bound.get(sp.id);
            if (!it) return null;
            const own = it.mine ? OWNER_COLOR.player : it.forSale ? OWNER_COLOR.sale : OWNER_COLOR[it.owner] ?? OWNER_COLOR.private;
            const t = overlay !== 'none' ? tint(it) : undefined;
            const on = hover === sp.id || sel === it.key;
            return (
              <g key={sp.id}>
                <polygon
                  points={pts(sp.poly)} data-testid="pv-spot" data-spot={sp.id} data-key={it.key}
                  fill={t ?? '#ffffff'} fillOpacity={t ? 0.38 : on ? 0.08 : 0} stroke={on ? own : t ?? 'none'} strokeWidth={on ? 3 : t ? 1.5 : 0}
                  filter={on ? 'url(#pv-glow)' : undefined} style={{ cursor: 'pointer' }}
                  onPointerEnter={() => setHover(sp.id)} onPointerLeave={() => setHover((h) => (h === sp.id ? undefined : h))}
                  onClick={(e) => { e.stopPropagation(); onPick(it.key); }}
                />
              </g>
            );
          })}
        </svg>
        {/* Live labels: the place's current name, who holds it, and what is going on there. */}
        <div className="pointer-events-none absolute inset-0">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full overflow-visible">
            {def.spots.map((sp) => {
              const it = bound.get(sp.id);
              if (!it) return null;
              const own = it.mine ? OWNER_COLOR.player : OWNER_COLOR[it.owner] ?? OWNER_COLOR.private;
              const on = hover === sp.id || sel === it.key;
              const [x, y] = sp.label;
              if (!on && !names) {
                return (
                  <g key={sp.id} transform={`translate(${x} ${y})`} data-testid="pv-label">
                    <circle r="6" fill="#1b1030" fillOpacity="0.8" stroke={own} strokeWidth="2" />
                    <circle r="2.6" fill={own} />
                    {(it.forSale || it.building || it.closed) && <circle cx="6" cy="-6" r="3" fill={it.forSale ? '#2ecc71' : it.building ? '#ff9f1c' : '#c0392b'} stroke="#1b1030" strokeWidth="1" />}
                  </g>
                );
              }
              const badge = it.building ? 'BUILDING' : it.closed ? 'CLOSED' : it.forSale ? 'FOR SALE' : it.forLease ? 'FOR RENT' : it.mine ? 'YOURS' : undefined;
              const name = it.name.length > 24 ? `${it.name.slice(0, 23)}…` : it.name;
              const w = Math.max(60, name.length * 6.1 + 22);
              return (
                <g key={sp.id} transform={`translate(${x} ${y})`} opacity={on ? 1 : 0.9} data-testid="pv-label">
                  <rect x={-w / 2} y="-12" width={w} height="17" rx="8.5" fill="#1b1030" fillOpacity={on ? 0.94 : 0.78} stroke={own} strokeWidth={on ? 2 : 1.2} />
                  <circle cx={-w / 2 + 9} cy="-3.5" r="3.6" fill={own} />
                  <text x={-w / 2 + 17} y="0" fontSize="10.5" fontWeight="700" fill="#fff3dc" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>{name}</text>
                  {badge && <g transform={`translate(${w / 2 - 6} -14)`}><rect x={-badge.length * 3.6 - 6} y="-7" width={badge.length * 3.6 + 10} height="11" rx="5.5" fill={badge === 'YOURS' ? OWNER_COLOR.player : badge === 'FOR SALE' ? '#2ecc71' : badge === 'BUILDING' ? '#ff9f1c' : '#c0392b'} /><text x={-badge.length * 1.8 - 1} y="1.4" fontSize="6.5" fontWeight="800" textAnchor="middle" fill="#1b1030">{badge}</text></g>}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
      {/* Where you are, and where you can go. */}
      <div className="absolute left-2 top-11 z-10 flex flex-wrap gap-1.5 max-w-[60%]" data-hv-ui data-pz-ui>
        <button type="button" className="hv-btn" onClick={onMap} data-testid="pv-map">← Island map</button>
        {scene === 'block'
          ? <button type="button" className="hv-btn hv-on" onClick={() => onScene('street')} data-testid="pv-to-street">Walk down Pacific Avenue →</button>
          : <button type="button" className="hv-btn hv-on" onClick={() => onScene('block')} data-testid="pv-to-block">↑ Back up over the block</button>}
        <button type="button" className={`hv-btn ${names ? 'hv-on' : ''}`} onClick={() => setNames((x) => !x)} data-testid="pv-names">Names</button>
      </div>
      <div className="absolute left-1/2 -translate-x-1/2 top-3 z-10 pointer-events-none rounded-full hidden sm:block border border-[#ff5fa2] bg-[#1b1030]/85 px-3 py-1 text-center">
        <div className="font-display text-sm leading-tight text-[#ffd1e6]" data-testid="pv-title">{def.title}</div>
        <div className="text-[10px] text-[#9fe7e0] hidden sm:block">{def.blurb} · {HOODS_BY_ID.boardwalk.name}, {s.date.y}</div>
      </div>
    </div>
  );
}
