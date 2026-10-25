import { useEffect, useMemo, useState } from 'react';
import { FLAGSHIP, HOODS_BY_ID, hoodOfZone, type HoodId } from '../../engine/hoodData';
import { rivalName } from '../../engine/construction';
import type { HoodOverlay } from '../../engine/hood';
import type { GameState } from '../../engine/types';
import { OWNER_COLOR } from '../map/lotIcons';
import type { Item } from './Buildings';
import type { Mood } from './iso';

/**
 * Where you land: painted street-level views of Wildwood (the user's own
 * art), with every building on them a live hotspot bound to a real record — its current name and owner on the label, the
 * owner's color glowing round it on hover, badges for a sale, a closing or
 * a crew at work, and the island's overlays tinting it. Click one and its
 * street-view card opens, exactly as on the map.
 *
 *   block   the bird's-eye view of the Boardwalk block, the pier and the wheel behind
 *   street  standing on Pacific Avenue, looking down to the pier
 *   sees    Pacific at Oak: the old Seven Seas, which becomes The 7 Sees once it is yours
 *   taylor  Taylor Avenue: Sheila's weekly rooms and, next door, whatever is on the corner lot
 *           now (Crab Legs, or the Off Shore seafood bar, or someone else's sign)
 *   docks / lane  Otten's Harbor from above, then down on the lane
 *
 * The art is a separate chunk, fetched the first time you come down to street level.
 */

export type Scene = 'block' | 'street' | 'sees' | 'taylor' | 'taylorRev' | 'docks' | 'lane';

type Want = 'motel' | 'hotel' | 'food' | 'club' | 'arcade' | 'shop' | 'pier' | 'house' | 'warehouse';

interface Spot {
  id: string;
  want: Want[];
  /** Polygon in image pixels (1024 × 559). */
  poly: [number, number][];
  /** Where its live label sits. */
  label: [number, number];
  /** Bound to this exact record (a landmark), not by kind. */
  lot?: string;
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

const DOCKS: Spot[] = [
  { id: 'seafood', want: ['food', 'club'], poly: [[700, 282], [790, 160], [900, 10], [1024, 60], [1024, 559], [870, 559], [705, 420]], label: [840, 246] },
  { id: 'cafe', want: ['food', 'shop'], poly: [[0, 262], [60, 250], [110, 300], [178, 372], [182, 470], [50, 500], [0, 500]], label: [70, 258] },
  { id: 'bait', want: ['shop', 'warehouse'], poly: [[530, 262], [586, 262], [590, 372], [532, 372]], label: [558, 254] },
  { id: 'charters', want: ['warehouse', 'shop'], poly: [[590, 282], [660, 270], [702, 300], [702, 416], [596, 402]], label: [646, 266] },
  { id: 'boats', want: ['warehouse', 'shop'], poly: [[360, 172], [440, 120], [522, 240], [512, 296], [400, 272], [370, 232]], label: [446, 150] },
  { id: 'boats2', want: ['warehouse', 'food', 'shop'], poly: [[630, 232], [700, 135], [782, 182], [762, 272], [642, 266]], label: [708, 140] },
  { id: 'row', want: ['house', 'motel', 'shop'], poly: [[95, 140], [200, 140], [216, 240], [200, 322], [112, 302]], label: [150, 128] },
];

const LANE: Spot[] = [
  { id: 'seafood', want: ['food', 'club'], poly: [[710, 240], [790, 130], [880, 0], [1024, 0], [1024, 500], [930, 500], [720, 400]], label: [846, 196] },
  { id: 'cafe', want: ['food', 'shop'], poly: [[0, 80], [150, 80], [175, 250], [275, 340], [275, 450], [40, 520], [0, 520]], label: [86, 140] },
  { id: 'bait', want: ['shop', 'warehouse'], poly: [[550, 256], [602, 256], [606, 346], [556, 346]], label: [576, 248] },
  { id: 'charters', want: ['warehouse', 'shop'], poly: [[606, 270], [700, 250], [722, 300], [716, 380], [610, 370]], label: [652, 260] },
  { id: 'boats', want: ['warehouse', 'shop'], poly: [[400, 172], [500, 160], [526, 300], [420, 292], [405, 250]], label: [462, 162] },
  { id: 'row', want: ['house', 'motel', 'shop'], poly: [[150, 140], [245, 170], [252, 300], [176, 322], [160, 250]], label: [202, 144] },
];

const SEES: Spot[] = [
  { id: 'palace', lot: FLAGSHIP.lotId, want: ['club'], poly: [[598, 170], [640, 140], [700, 60], [770, 14], [880, 40], [1024, 80], [1024, 450], [860, 450], [640, 430], [598, 380]], label: [800, 300] },
  { id: 'pizza', want: ['food', 'shop'], poly: [[0, 200], [80, 160], [170, 185], [170, 450], [0, 455]], label: [90, 196] },
  { id: 'neon', want: ['arcade', 'club', 'shop'], poly: [[170, 185], [240, 190], [252, 440], [170, 450]], label: [212, 214] },
  { id: 'star', want: ['club', 'food', 'shop'], poly: [[240, 190], [312, 260], [312, 420], [252, 440]], label: [278, 236] },
  { id: 'wheel', want: ['pier'], poly: [[322, 208], [426, 208], [426, 300], [322, 300]], label: [374, 204] },
];

const TAYLOR: Spot[] = [
  { id: 'corner', lot: 'pa06', want: ['club'], poly: [[628, 160], [730, 40], [970, 30], [1024, 90], [1024, 500], [940, 500], [650, 450], [628, 380]], label: [850, 330] },
  { id: 'sheilas', lot: 'pa07', want: ['house', 'motel'], poly: [[440, 140], [520, 120], [640, 70], [680, 100], [660, 440], [470, 450], [440, 330]], label: [560, 108] },
  { id: 'guest', want: ['house', 'motel', 'shop'], poly: [[276, 160], [350, 145], [440, 140], [442, 420], [282, 410]], label: [350, 150] },
  { id: 'strip', want: ['food', 'club', 'shop'], poly: [[0, 300], [60, 300], [64, 410], [0, 412]], label: [30, 296] },
  { id: 'wheel', want: ['pier'], poly: [[16, 214], [124, 214], [124, 290], [16, 290]], label: [70, 210] },
];

const TAYLOR_REV: Spot[] = [
  { id: 'corner', lot: 'pa06', want: ['club'], poly: [[130, 150], [200, 115], [262, 190], [270, 400], [150, 420], [135, 330]], label: [200, 128] },
  { id: 'sheilas', lot: 'pa07', want: ['house'], poly: [[0, 40], [110, 60], [130, 150], [135, 500], [0, 500]], label: [56, 168] },
  { id: 'kings', lot: 'pa08', want: ['club'], poly: [[560, 160], [640, 120], [760, 118], [860, 160], [860, 360], [600, 380], [560, 330]], label: [706, 132] },
  { id: 'musickey', lot: 'pa09', want: ['motel'], poly: [[850, 150], [1024, 130], [1024, 430], [930, 500], [700, 470], [700, 390], [860, 372]], label: [940, 150] },
  { id: 'monaco', want: ['shop', 'food', 'club'], poly: [[272, 180], [352, 180], [356, 330], [276, 336]], label: [312, 176] },
  { id: 'wheel', want: ['pier'], poly: [[372, 134], [450, 134], [450, 200], [372, 200]], label: [410, 130] },
];

export const SPOTS: Record<Scene, Spot[]> = { block: BLOCK, street: STREET, sees: SEES, taylor: TAYLOR, taylorRev: TAYLOR_REV, docks: DOCKS, lane: LANE };

type ArtKey = 'NEIGHBORHOOD_ART' | 'STREET_ART' | 'SEES_ART' | 'CRAB_ART' | 'OFFSHORE_ART' | 'ROCK_ART' | 'DOCKS_ART' | 'DOCKS_LANE_ART';
interface SceneDef { art: ArtKey; spots: Spot[]; title: string; blurb: string; hoods: HoodId[]; daylight?: boolean; links: { to: Scene; label: string }[] }

const SCENES: Record<Scene, SceneDef> = {
  block: { art: 'NEIGHBORHOOD_ART', spots: BLOCK, title: 'The Boardwalk block', blurb: 'Dusk on the strip: the motels, the clubs and the pier.', hoods: ['boardwalk', 'crest'], links: [{ to: 'street', label: 'Walk down Pacific Avenue →' }] },
  street: { art: 'STREET_ART', spots: STREET, title: 'Pacific Avenue', blurb: 'On the sidewalk, looking down to the pier.', hoods: ['boardwalk', 'crest'], links: [{ to: 'block', label: '↑ Back up over the block' }, { to: 'sees', label: 'Up Pacific to Oak Avenue →' }] },
  sees: { art: 'SEES_ART', spots: SEES, title: 'Pacific at Oak', blurb: 'The big corner: the old Seven Seas and the strip across the way.', hoods: ['pacific', 'boardwalk'], links: [{ to: 'street', label: '← Back down Pacific' }, { to: 'taylor', label: 'Around to Taylor Avenue →' }] },
  taylor: { art: 'CRAB_ART', spots: TAYLOR, title: 'Taylor Avenue', blurb: 'Weekly rooms, fire escapes and the club on the corner.', hoods: ['pacific', 'downtown'], links: [{ to: 'sees', label: '← Back to Pacific & Oak' }, { to: 'taylorRev', label: 'Turn around ↺' }] },
  taylorRev: { art: 'ROCK_ART', spots: TAYLOR_REV, title: 'Taylor Avenue, looking back', blurb: 'The King\'s ballroom, the Music Key\'s pool, and the corner across the way.', hoods: ['pacific', 'downtown'], links: [{ to: 'taylor', label: 'Turn around ↺' }, { to: 'sees', label: '← Back to Pacific & Oak' }] },
  docks: { art: 'DOCKS_ART', spots: DOCKS, title: 'The docks', blurb: 'Otten\'s Harbor in the morning: the boats are in.', hoods: ['docks', 'causeway', 'westww'], daylight: true, links: [{ to: 'lane', label: 'Walk down the lane →' }] },
  lane: { art: 'DOCKS_LANE_ART', spots: LANE, title: 'The harbor lane', blurb: 'Down on the lane between the cafe and the seafood house.', hoods: ['docks', 'causeway', 'westww'], daylight: true, links: [{ to: 'docks', label: '↑ Back up over the docks' }] },
};
export const SCENE_HOODS: Record<Scene, HoodId[]> = Object.fromEntries(Object.entries(SCENES).map(([k, v]) => [k, v.hoods])) as Record<Scene, HoodId[]>;

/** Which painted view a neighborhood lands on. */
export function sceneForHood(id: HoodId | undefined): Scene {
  return id === 'docks' || id === 'causeway' || id === 'westww' ? 'docks' : id === 'pacific' || id === 'downtown' ? 'sees' : 'block';
}

/** What stands on Taylor and Oak's corner lot decides which picture you see. */
const SEAFOOD = new Set(['trattoria', 'diner', 'seafood', 'deli', 'pizza', 'bar', 'tavern']);
function taylorArt(items: Item[]): { art: ArtKey; patch?: string } {
  const it = items.find((x) => x.lot?.id === 'pa06');
  const use = it?.lot?.use;
  if (!it || use === 'gents') return { art: 'CRAB_ART' };
  if (use && SEAFOOD.has(use)) return { art: 'OFFSHORE_ART', patch: it.name !== 'Off Shore' ? it.name : undefined };
  return { art: 'OFFSHORE_ART', patch: it.vacant ? 'FOR SALE' : it.name };
}

/** Looking back down Taylor, the corner lot's sign is Off Shore's; anything else gets its own board. */
function taylorRevPatch(items: Item[]): { art: ArtKey; patch?: string; rev: true } {
  const it = items.find((x) => x.lot?.id === 'pa06');
  const use = it?.lot?.use;
  return { art: 'ROCK_ART', rev: true, patch: !it ? undefined : use && SEAFOOD.has(use) && it.name === 'Off Shore' ? undefined : it.vacant ? 'FOR SALE' : it.name };
}

function iconWant(it: Item): Want {
  const ic = it.icon;
  if (ic === 'motel' || ic === 'hotel' || ic === 'house' || ic === 'club' || ic === 'pier') return ic;
  if (ic === 'pizza') return 'food';
  if (ic === 'apartment') return 'house';
  if (ic === 'warehouse') return 'warehouse';
  return 'shop';
}

/**
 * Bind every hotspot to a record: a landmark to its own lot; the rest to the
 * scene's neighborhoods' buildings by kind, in a stable order — the same
 * building always stands in the same place.
 */
export function bindSpots(items: Item[], spots: Spot[], hoods: HoodId[] = ['boardwalk', 'crest']): Map<string, Item> {
  const hoodOf = (it: Item) => hoodOfZone((it.lot?.zone ?? 'downtown') as never);
  const used = new Set<string>();
  const out = new Map<string, Item>();
  for (const sp of spots) {
    if (!sp.lot) continue;
    const it = items.find((x) => x.lot?.id === sp.lot);
    if (it) { used.add(it.key); out.set(sp.id, it); }
  }
  const pool = items
    .filter((it) => it.lot && !it.vacant && !used.has(it.key) && hoods.includes(hoodOf(it) as HoodId))
    .sort((a, b) => hoods.indexOf(hoodOf(a) as HoodId) - hoods.indexOf(hoodOf(b) as HoodId) || a.key.localeCompare(b.key));
  for (const sp of spots) {
    if (out.has(sp.id)) continue;
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

let artCache: Promise<Record<ArtKey, string>> | undefined;
function loadArt(): Promise<Record<ArtKey, string>> {
  artCache ??= import('./art/paintedArt') as unknown as Promise<Record<ArtKey, string>>;
  artCache.catch(() => { artCache = undefined; });
  return artCache;
}

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
  const [art, setArt] = useState<Record<ArtKey, string> | undefined>();
  useEffect(() => { let live = true; loadArt().then((a) => live && setArt(a)).catch(() => {}); return () => { live = false; }; }, []);
  const def = SCENES[scene];
  const bound = useMemo(() => bindSpots(items, def.spots, def.hoods), [items, def]);
  const taylor = scene === 'taylor' ? taylorArt(items) : scene === 'taylorRev' ? taylorRevPatch(items) : undefined;
  const artKey = taylor?.art ?? def.art;
  // The flagship's sign: lit and yours, or dark and somebody else's.
  const flagship = scene === 'sees' ? items.find((x) => x.lot?.id === FLAGSHIP.lotId) : undefined;
  // The painted light: the strip is a dusk picture, the docks a morning one.
  const filter = def.daylight
    ? (mood === 'night' ? 'brightness(0.5) saturate(0.7) hue-rotate(-10deg)' : mood === 'dusk' ? 'brightness(0.85) saturate(1.15) sepia(0.25)' : undefined)
    : (mood === 'day' ? 'brightness(1.16) saturate(1.06) contrast(0.98)' : mood === 'night' ? 'brightness(0.78) saturate(1.12)' : undefined);
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#0b1430]" data-testid="painted-view" data-scene={scene} data-art={artKey}>
      <div key={scene} className={`absolute inset-0 ${scene === 'block' || scene === 'docks' ? 'pv-land' : 'pv-walk'}`}>
        {def.daylight && mood === 'night' && <div className="absolute inset-0 z-[1] pointer-events-none" style={{ background: 'rgba(12,22,60,0.35)' }} />}
        {art ? <img src={art[artKey]} alt={`${def.title}: ${def.blurb}`} className="absolute inset-0 h-full w-full object-cover select-none" style={{ filter }} draggable={false} />
          : <div className="absolute inset-0 grid place-items-center text-sm text-[#ffd1e6]">Walking down to the street…</div>}
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
          <defs>
            <filter id="pv-glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          </defs>
          {flagship && !flagship.mine && (
            // Not yours yet: the big sign is dark, boarded, with the old name or the new owner's.
            <g pointerEvents="none" data-testid="pv-flagship-dark">
              <path d="M600 30H1024V295H600Z" fill="#0b1430" opacity={flagship.owner === 'private' ? 0.72 : 0.82} />
              <g transform="translate(812 150)">
                <rect x="-150" y="-34" width="300" height="68" rx="8" fill="#f3ead2" stroke="#8a6a4a" strokeWidth="3" />
                <text y="-8" textAnchor="middle" fontSize="22" fontWeight="800" fill="#3a2c3e" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>{flagship.name}</text>
                <text y="20" textAnchor="middle" fontSize="13" fontWeight="700" fill={flagship.forSale ? '#c0392b' : '#5b4a3a'}>{flagship.forSale ? 'FOR SALE · INQUIRE WITHIN' : flagship.owner === 'private' ? 'UNDER NEW MANAGEMENT' : `A ${rivalName(flagship.owner as never)} place`}</text>
              </g>
            </g>
          )}
          {taylor?.patch && (
            // Something else on the corner now: its own board over the old one.
            <g pointerEvents="none" data-testid="pv-corner-sign">
              {'rev' in taylor
                ? <><path d="M150 150H262V262H150Z" fill="#1d2a36" opacity="0.9" /><text x="206" y="212" textAnchor="middle" fontSize={Math.min(20, 190 / Math.max(6, taylor.patch.length))} fontWeight="800" fill="#ff9ec7" stroke="#ff5fa2" strokeWidth="0.6" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>{taylor.patch}</text></>
                : <><path d="M628 40H990V240H628Z" fill="#1d2a36" opacity="0.88" /><text x="809" y="130" textAnchor="middle" fontSize={Math.min(46, 620 / Math.max(6, taylor.patch.length))} fontWeight="800" fill="#ffd27a" stroke="#ff8a3c" strokeWidth="1" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>{taylor.patch}</text></>}
            </g>
          )}
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
              const on = hover === sp.id || sel === it.key || !!sp.lot;
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
        {def.links.map((l) => <button key={l.to} type="button" className="hv-btn hv-on" onClick={() => onScene(l.to)} data-testid={`pv-to-${l.to}`}>{l.label}</button>)}
        <button type="button" className={`hv-btn ${names ? 'hv-on' : ''}`} onClick={() => setNames((x) => !x)} data-testid="pv-names">Names</button>
      </div>
      <div className="absolute left-1/2 -translate-x-1/2 top-3 z-10 pointer-events-none rounded-full hidden sm:block border border-[#ff5fa2] bg-[#1b1030]/85 px-3 py-1 text-center">
        <div className="font-display text-sm leading-tight text-[#ffd1e6]" data-testid="pv-title">{def.title}</div>
        <div className="text-[10px] text-[#9fe7e0] hidden sm:block">{def.blurb} · {HOODS_BY_ID[def.hoods[0]].name}, {s.date.y}</div>
      </div>
    </div>
  );
}
