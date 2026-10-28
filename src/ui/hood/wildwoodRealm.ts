import { HOODS, U_NORTH, WEST_WILDWOOD, bayEdge, beachWidth, type HoodId } from '../../engine/hoodData';
import { placeAll, type Parcel } from '../../engine/hoodGeo';
import { SIDE_STYLE } from '../../engine/sides';
import { frontsOf, warNotes } from '../../engine/army';
import type { GameState } from '../../engine/types';
import { regionsFromGrid } from '../realm/gridRegions';
import type { HolderStyle } from '../realm/PoliticalOverlay';
import { holderFromShares, type Pt, type RealmRegion } from '../realm/realmGeo';
import { P, type Proj } from './iso';

/**
 * Wildwood's political map: the island cut into its game districts (each
 * patch of land goes to the district of the nearest record standing on it),
 * each held by whoever has the most influence there (s.districts), for the
 * <PoliticalOverlay>. The cut depends only on where the records stand, so it
 * is cached per placement and projection; the holders are read fresh.
 */

/** Region id → the neighbourhood the map selects for it. */
export const REGION_HOOD: Record<string, HoodId> = { piers: 'boardwalk', westww: 'westww' };
for (const h of HOODS) if (h.district) REGION_HOOD[h.district] = h.id;

function regionOfZone(zone: string): string | undefined {
  if (zone === 'piers') return 'piers';
  const h = HOODS.find((x) => x.zones.includes(zone as never));
  return h ? h.district ?? h.id : undefined;
}

const DU = 40;
const DV = 20;
const U0 = -700;
const V0 = -360;

/** 'uv' is the block map's flat frame (x = u, y = -v). */
export type RealmFrame = Proj | 'uv';

const cache = new WeakMap<Map<string, Parcel>, Map<RealmFrame, Map<string, Pt[][]>>>();

/** The district shapes (world coordinates of the projection), cached on the placement. */
export function wildwoodShapes(s: GameState, pr: RealmFrame): Map<string, Pt[][]> {
  const parcels = placeAll(s);
  let byPr = cache.get(parcels);
  if (!byPr) cache.set(parcels, (byPr = new Map()));
  const hit = byPr.get(pr);
  if (hit) return hit;
  const ps = [...parcels.values()].map((p) => ({ ...p, r: regionOfZone(p.zone) })).filter((p): p is Parcel & { r: string } => !!p.r);
  const vMax = Math.max(1100, ...ps.map((p) => p.v1 + 60));
  const cols = Math.ceil((U_NORTH + 80 - U0) / DU);
  const rows = Math.ceil((vMax - V0) / DV);
  // Parcels bucketed along the island, for the nearest-record search.
  const B = 400;
  const buckets = new Map<number, typeof ps>();
  for (const p of ps) for (let b = Math.floor((p.u0 - U0) / B); b <= Math.floor((p.u1 - U0) / B); b++) { const l = buckets.get(b); if (l) l.push(p); else buckets.set(b, [p]); }
  const near = (u: number, v: number, pad: number): { r: string; d: number } | undefined => {
    const b0 = Math.floor((u - U0) / B);
    let best: { r: string; d: number } | undefined;
    for (let ring = 0; ring <= 8; ring++) {
      for (const b of ring ? [b0 - ring, b0 + ring] : [b0]) for (const p of buckets.get(b) ?? []) {
        const du = Math.max(p.u0 - u, 0, u - p.u1);
        const dv = Math.max(p.v0 - v, 0, v - p.v1);
        const d = Math.hypot(du, dv * 1.3);
        if (!best || d < best.d) best = { r: p.r, d };
      }
      if ((best && best.d <= ring * B) || ring * B > pad) break;
    }
    return best && best.d <= pad ? best : undefined;
  };
  const ww = WEST_WILDWOOD;
  const label = (i: number, j: number): string | null => {
    const u = U0 + (i + 0.5) * DU;
    const v = V0 + (j + 0.5) * DV;
    if (u >= ww.u0 - 20 && u <= ww.u1 + 20 && v >= ww.v0 - 20 && v <= ww.v1 + 20) return 'westww';
    const island = u <= U_NORTH + 40 && v >= -beachWidth(Math.max(u, -700)) && v <= bayEdge(Math.max(u, -700));
    const hit = near(u, v, island ? 1e9 : 45);
    return hit ? hit.r : null;
  };
  const shapes = regionsFromGrid(cols, rows, label, (x, y) => (pr === 'uv' ? [U0 + x * DU, -(V0 + y * DV)] : P(pr, U0 + x * DU, V0 + y * DV)), { vote: 2, smooth: 3 });
  byPr.set(pr, shapes);
  return shapes;
}

/** The family names as painted, and their colours (sides.ts), keyed by faction id. */
export function wildwoodStyles(s: GameState): Record<string, HolderStyle> {
  const out: Record<string, HolderStyle> = {};
  const house = (s.houseName || 'Your').trim();
  out.player = { color: SIDE_STYLE.player.color, name: `THE ${house.toUpperCase()} FAMILY`, label: `The ${house} family (yours)`, emblem: SIDE_STYLE.player.emblem, ink: '#f4cf5a', halo: '#1a1206' };
  for (const id of ['manno', 'kessler', 'feldstein', 'philly'] as const) {
    const r = s.rivals.find((x) => x.id === id);
    const st = SIDE_STYLE[id];
    const short = id === 'philly' ? 'Philadelphia' : r?.shortName ?? st.label.replace(/^The | family$/g, '');
    out[id] = { color: st.color, name: id === 'philly' ? 'PHILADELPHIA' : `THE ${short.toUpperCase()} FAMILY`, label: id === 'philly' ? 'Philadelphia' : `The ${short} family`, emblem: st.emblem };
  }
  return out;
}

/** The island's regions with their holders, for the overlay. */
export function wildwoodRegions(s: GameState, pr: RealmFrame): RealmRegion[] {
  const shapes = wildwoodShapes(s, pr);
  // The war fronts (army.ts): districts held by force or with a battle massing, striped in both colours.
  const foe: Record<string, string> = {};
  for (const w of s.wars) for (const f of frontsOf(s, w)) if (f.occupied || f.massing) foe[f.district] = w.rival;
  const out: RealmRegion[] = [];
  for (const [id, polygons] of shapes) {
    const d = s.districts.find((x) => x.id === id);
    const name = d?.name ?? HOODS.find((h) => h.id === id)?.name ?? id;
    const h = d ? holderFromShares(d.influence) : { holder: null, share: 0 };
    // A war front or a district held by force is striped (army.ts).
    const front: [string, string] | undefined = foe[id] ? [h.holder && h.holder !== foe[id] ? h.holder : 'player', foe[id]] : undefined;
    out.push({ id, name, polygons, holder: h.holder, share: h.share, contested: h.contested ?? front, hideName: id === 'westww' });
  }
  const order = ['boardwalk', 'piers', 'pacific', 'downtown', 'docks', 'crest', 'north', 'causeway', 'westww'];
  return out.sort((a, b) => (order.indexOf(a.id) + 99) % 99 - (order.indexOf(b.id) + 99) % 99);
}

/** Heat on the map: police attention per district (0..1). */
export function wildwoodHeat(s: GameState): Record<string, { t: number; text: string }> {
  const out: Record<string, { t: number; text: string }> = {};
  for (const [rid, hid] of Object.entries(REGION_HOOD)) {
    const st = s.hood?.stats[hid];
    const biz = s.businesses.filter((b) => b.districtId === rid && b.owner === 'player').reduce((a, b) => a + b.heat, 0);
    const t = Math.min(1, ((st?.police ?? 0) + biz * 4) / 100);
    out[rid] = { t, text: `Heat ${Math.round(t * 100)}` };
  }
  return out;
}

/** Rackets on the map: what your places there gross a week, against your best district. */
export function wildwoodRackets(s: GameState): Record<string, { t: number; text: string }> {
  const gross: Record<string, number> = {};
  for (const b of s.businesses) if (b.owner === 'player') gross[b.districtId] = (gross[b.districtId] ?? 0) + b.weeklyBase;
  const max = Math.max(1, ...Object.values(gross));
  const out: Record<string, { t: number; text: string }> = {};
  for (const rid of Object.keys(REGION_HOOD)) {
    const g = gross[rid] ?? 0;
    out[rid] = { t: g / max, text: g ? `$${Math.round(g).toLocaleString()}/wk` : 'Nothing of yours' };
  }
  return out;
}

/** Tooltip rows: the rackets there and the heat. */
export function wildwoodDetails(s: GameState, r: RealmRegion): [string, string][] {
  const biz = s.businesses.filter((b) => b.districtId === r.id);
  const mine = biz.filter((b) => b.owner === 'player');
  const theirs = biz.length - mine.length;
  const rows: [string, string][] = [];
  rows.push(['Rackets', biz.length ? `${mine.length} yours${theirs ? `, ${theirs} theirs` : ''}${mine.length ? ` — ${mine.slice(0, 3).map((b) => b.name).join(', ')}${mine.length > 3 ? '…' : ''}` : ''}` : 'None on the books']);
  const hid = REGION_HOOD[r.id];
  const st = hid ? s.hood?.stats[hid] : undefined;
  if (st) rows.push(['Heat', `Police ${Math.round(st.police)} · reputation ${Math.round(st.rep)}`]);
  for (const t of s.wars.length ? warNotes(s)[r.id] ?? [] : []) rows.push(['War', t]);
  const d = s.districts.find((x) => x.id === r.id);
  if (d) {
    const others = Object.entries(d.influence).filter(([k, v]) => k !== 'none' && (v ?? 0) > 0).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
      .map(([k, v]) => `${k === 'player' ? 'You' : (SIDE_STYLE[k as keyof typeof SIDE_STYLE]?.short ?? k).replace(/^./, (c) => c.toUpperCase()).toLowerCase().replace(/^./, (c) => c.toUpperCase())} ${Math.round(v ?? 0)}`);
    if (others.length) rows.push(['Influence', others.join(' · ')]);
  }
  return rows;
}
