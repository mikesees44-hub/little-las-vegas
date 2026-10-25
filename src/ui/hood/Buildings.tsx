import { memo } from 'react';
import { CATALOG } from '../../engine/catalog';
import { designOf, SIGN_HEX, type BuildStyle } from '../../engine/design';
import type { Lot } from '../../engine/econState';
import { lookOf } from '../../engine/hood';
import { footprint, iconOf, type Footprint, type Parcel } from '../../engine/hoodGeo';
import { USES, USES_BY_ID, useIcon, type UseIcon } from '../../engine/property';
import type { Business, GameState } from '../../engine/types';
import { OWNER_COLOR } from '../map/lotIcons';
import { lotProgress } from '../map/lotIcons';
import { lit, mix, P, PASTELS, poly, shade, type Mood, type Palette, type Proj } from './iso';

/**
 * Every record on the island as a little 2.5D illustration built from a
 * handful of reusable parts — a box, a roof (flat, gable, steep tiki, a Doo
 * Wop boomerang canopy, a Deco step), a window grid, a striped awning, a
 * sign (board, pylon with a starburst, rooftop letters, a chaser-bulb
 * marquee) — picked by what the place is, its style, its neon and its
 * condition. Pier rides get their own: the wheel, the coaster, the carousel.
 */

export interface Item {
  key: string;
  lot?: Lot;
  biz?: Business;
  parcel: Parcel;
  fp: Footprint;
  icon?: UseIcon;
  useId?: string;
  name: string;
  style: BuildStyle;
  sign: string;
  owner: string;
  mine: boolean;
  open: boolean;
  closed: boolean;
  building: boolean;
  progress: number;
  vacant: boolean;
  forSale: boolean;
  forLease: boolean;
  condition: number;
  depth: number;
}

function h32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const BIZ_ICON: Record<string, string> = Object.fromEntries(USES.filter((u) => u.biz).map((u) => [u.biz!, u.id]));

/** The drawable list: every lot on the island and every place of yours that has no lot. */
export function itemsOf(s: GameState, parcels: Map<string, Parcel>, pr: Proj): Item[] {
  const out: Item[] = [];
  for (const [key, p] of parcels) {
    if (key.startsWith('biz:')) {
      const b = s.businesses.find((x) => x.id === key.slice(4));
      if (!b) continue;
      const useId = BIZ_ICON[b.kind];
      const u = useId ? USES_BY_ID[useId] : undefined;
      const icon: UseIcon = u ? useIcon(u) : CATALOG[b.kind]?.category === 'racket' ? 'store' : 'store';
      const d = designOf(s, b.id);
      const hh = h32(b.id);
      out.push({ key, biz: b, parcel: p, fp: footprint(p, icon), icon, useId, name: b.name, style: d?.style ?? (['doowop', 'midcentury', 'deco'] as BuildStyle[])[hh % 3], sign: SIGN_HEX[d?.sign ?? (['pink', 'turquoise', 'gold'] as const)[hh % 3]], owner: 'player', mine: true, open: !(b.closedUntil !== undefined && b.closedUntil > s.week), closed: false, building: false, progress: 1, vacant: false, forSale: false, forLease: false, condition: 85, depth: 0 });
      continue;
    }
    const l = s.econ?.lots.find((x) => x.id === key);
    if (!l) continue;
    const mine = l.status === 'owned' || l.status === 'leased';
    const building = !!l.use && !!l.stage && l.stage !== 'open' && l.stage !== 'purchase';
    const open = !!l.use && l.stage === 'open';
    const icon = open || building ? iconOf(l) : l.status === 'lease' ? 'store' : undefined;
    const look = lookOf(s, l);
    const biz = l.bizId ? s.businesses.find((b) => b.id === l.bizId) : undefined;
    const name = l.name ?? biz?.name ?? (l.use ? USES_BY_ID[l.use]?.name : l.status === 'lease' ? 'Storefront for rent' : 'Empty lot');
    out.push({
      key, lot: l, biz, parcel: p, fp: footprint(p, icon), icon, useId: l.use, name, style: look.style, sign: SIGN_HEX[look.sign],
      owner: mine ? 'player' : l.owner, mine, open, closed: open && !mine && !l.tenant && !l.bizId && l.status !== 'public', building, progress: lotProgress(l),
      vacant: !l.use && l.status !== 'lease', forSale: l.status === 'sale', forLease: l.status === 'lease', condition: l.condition, depth: 0,
    });
  }
  for (const it of out) {
    const c = P(pr, (it.fp.u0 + it.fp.u1) / 2, it.fp.v0);
    it.depth = c[1];
  }
  return out.sort((a, b) => a.depth - b.depth);
}

/* ---------------- parts ---------------- */

const STYLE_WALLS: Record<BuildStyle, string[]> = {
  doowop: ['#5fd3c4', '#ff8a73', '#ff9ec7', '#ffd86b', '#8ecae6', '#a8e6cf'],
  deco: ['#fff1dc', '#ffd1dc', '#c8f0e0', '#f7e3b5'],
  tiki: ['#b97a45', '#a86b3a', '#c48a50'],
  colonial: ['#fbf6ee', '#f1ece2', '#e9f0f6'],
  midcentury: ['#e7f4ef', '#f4e9d4', '#9fd8cb', '#ffffff'],
  victorian: ['#c3a6ff', '#ffd86b', '#7fc8c0', '#ffb3a7', '#a8d8ff'],
};
const STYLE_ROOF: Record<BuildStyle, string> = { doowop: '#f6f1e6', deco: '#efe2c8', tiki: '#d8b06a', colonial: '#8a4a3a', midcentury: '#5b6670', victorian: '#4f5d75' };

type Pt = [number, number];

interface Ctx { pr: Proj; m: Mood; pal: Palette; tier: number }

function Box({ c, fp, z0 = 0, h, wall, roof, side }: { c: Ctx; fp: Footprint; z0?: number; h: number; wall: string; roof: string; side?: string }) {
  const { pr } = c;
  const F0 = P(pr, fp.u0, fp.v0, z0), F1 = P(pr, fp.u1, fp.v0, z0), B0 = P(pr, fp.u0, fp.v1, z0);
  const F0h = P(pr, fp.u0, fp.v0, z0 + h), F1h = P(pr, fp.u1, fp.v0, z0 + h), B1h = P(pr, fp.u1, fp.v1, z0 + h), B0h = P(pr, fp.u0, fp.v1, z0 + h);
  return (
    <>
      {pr.iso && <path d={poly([B0, F0, F0h, B0h])} fill={side ?? shade(wall, -0.18)} />}
      {pr.iso && <path d={poly([F0, F1, F1h, F0h])} fill={wall} />}
      <path d={poly([F0h, F1h, B1h, B0h])} fill={roof} />
    </>
  );
}

function Gable({ c, fp, h, rh, roof, wallEnd }: { c: Ctx; fp: Footprint; h: number; rh: number; roof: string; wallEnd: string }) {
  const { pr } = c;
  const vm = (fp.v0 + fp.v1) / 2;
  const ov = 1.2;
  const R0 = P(pr, fp.u0 - ov, vm, h + rh), R1 = P(pr, fp.u1 + ov, vm, h + rh);
  const F0h = P(pr, fp.u0 - ov, fp.v0 - ov, h), F1h = P(pr, fp.u1 + ov, fp.v0 - ov, h), B0h = P(pr, fp.u0 - ov, fp.v1 + ov, h), B1h = P(pr, fp.u1 + ov, fp.v1 + ov, h);
  const E0 = P(pr, fp.u0, fp.v0, h), E1 = P(pr, fp.u0, fp.v1, h), ER = P(pr, fp.u0, vm, h + rh);
  return (
    <>
      <path d={poly([R0, R1, B1h, B0h])} fill={shade(roof, -0.25)} />
      {pr.iso && <path d={poly([E0, ER, E1])} fill={shade(wallEnd, -0.12)} />}
      <path d={poly([F0h, F1h, R1, R0])} fill={roof} />
      {c.tier >= 1 && pr.iso && <path d={poly([F0h, F1h, P(pr, fp.u1 + ov, fp.v0 - ov, h - 0.4), P(pr, fp.u0 - ov, fp.v0 - ov, h - 0.4)])} fill={shade(roof, -0.35)} />}
    </>
  );
}

/** Window grid on the front wall (one path). */
function windows(c: Ctx, fp: Footprint, h: number, opts: { from?: number; lit: boolean; seed: number; dark?: boolean; tall?: boolean }): { day: string; night: string } {
  const { pr } = c;
  const floors = Math.max(1, Math.round((h - (opts.from ?? 0)) / 3.4));
  const w = fp.u1 - fp.u0;
  const cols = Math.max(1, Math.floor(w / 5.5));
  let day = '';
  let night = '';
  for (let f = 0; f < floors; f++) {
    const z0 = (opts.from ?? 0) + f * 3.4 + 1;
    const z1 = z0 + (opts.tall ? 2.1 : 1.5);
    if (z1 > h - 0.3) break;
    for (let k = 0; k < cols; k++) {
      const a = fp.u0 + (w / cols) * (k + 0.28);
      const b = fp.u0 + (w / cols) * (k + 0.72);
      const d = poly([P(pr, a, fp.v0 - 0.05, z0), P(pr, b, fp.v0 - 0.05, z0), P(pr, b, fp.v0 - 0.05, z1), P(pr, a, fp.v0 - 0.05, z1)]);
      if (opts.lit && !opts.dark && ((opts.seed >> ((f * cols + k) % 24)) & 3) !== 0) night += d;
      else day += d;
    }
  }
  return { day, night };
}

function Awning({ c, fp, z, colorA, colorB }: { c: Ctx; fp: Footprint; z: number; colorA: string; colorB: string }) {
  const { pr } = c;
  const n = Math.max(3, Math.round((fp.u1 - fp.u0) / 2.2));
  let a = '';
  let b = '';
  for (let i = 0; i < n; i++) {
    const u0 = fp.u0 + ((fp.u1 - fp.u0) / n) * i;
    const u1 = fp.u0 + ((fp.u1 - fp.u0) / n) * (i + 1);
    const d = poly([P(pr, u0, fp.v0, z + 0.9), P(pr, u1, fp.v0, z + 0.9), P(pr, u1, fp.v0 - 2.6, z), P(pr, u0, fp.v0 - 2.6, z)]);
    if (i % 2) b += d; else a += d;
  }
  return <><path d={a} fill={colorA} /><path d={b} fill={colorB} /></>;
}

function Neon({ c, x, y, text, color, size, glow, font }: { c: Ctx; x: number; y: number; text: string; color: string; size: number; glow: boolean; font?: string }) {
  return (
    <g style={{ pointerEvents: 'none' }}>
      {glow && <text x={x} y={y} fontSize={size} textAnchor="middle" fill="none" stroke={color} strokeOpacity="0.45" strokeWidth={size * 0.35} fontFamily={font} fontWeight="700">{text}</text>}
      <text x={x} y={y} fontSize={size} textAnchor="middle" fill={c.m === 'day' ? color : '#fff'} stroke={c.m === 'day' ? '#2a1f2e' : color} strokeWidth={size * (c.m === 'day' ? 0.12 : 0.1)} paintOrder="stroke" fontFamily={font} fontWeight="700">{text}</text>
    </g>
  );
}

function Star({ x, y, r, color }: { x: number; y: number; r: number; color: string }) {
  let d = '';
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const rr = i % 2 ? r * 0.38 : r;
    d += `${i ? 'L' : 'M'}${(x + Math.cos(a) * rr).toFixed(1)},${(y + Math.sin(a) * rr).toFixed(1)}`;
  }
  return <path d={`${d}Z`} fill={color} />;
}

export const FONT: Record<BuildStyle, string> = {
  doowop: "'Brush Script MT', 'Segoe Script', cursive",
  deco: "'Futura', 'Century Gothic', 'Trebuchet MS', sans-serif",
  tiki: "'Papyrus', 'Copperplate', fantasy",
  colonial: "Georgia, 'Times New Roman', serif",
  midcentury: "'Trebuchet MS', 'Gill Sans', sans-serif",
  victorian: "'Palatino Linotype', 'Book Antiqua', Georgia, serif",
};

/* ---------------- rides ---------------- */

function Wheel({ x, y, r, c, color, spin }: { x: number; y: number; r: number; c: Ctx; color: string; spin: boolean }) {
  const cars = 10;
  return (
    <g>
      <path d={`M${x - r * 0.7} ${y + r * 1.15}L${x} ${y}L${x + r * 0.7} ${y + r * 1.15}`} stroke={lit('#f4f1e8', c.m)} strokeWidth={r * 0.08} fill="none" />
      <g className={spin ? 'hv-spin' : undefined}>
        <circle cx={x} cy={y} r={r} fill="none" stroke={c.m === 'day' ? '#f4f1e8' : color} strokeWidth={r * 0.07} />
        <path d={Array.from({ length: cars }, (_, i) => { const a = (i / cars) * Math.PI * 2; return `M${x} ${y}L${(x + Math.cos(a) * r).toFixed(1)} ${(y + Math.sin(a) * r).toFixed(1)}`; }).join('')} stroke={c.m === 'day' ? '#d8d2c4' : color} strokeWidth={r * 0.03} strokeOpacity={c.m === 'day' ? 1 : 0.7} />
        {Array.from({ length: cars }, (_, i) => { const a = (i / cars) * Math.PI * 2; return <circle key={i} cx={x + Math.cos(a) * r} cy={y + Math.sin(a) * r} r={r * 0.11} fill={PASTELS[i % PASTELS.length]} />; })}
      </g>
    </g>
  );
}

function Coaster({ c, fp, color }: { c: Ctx; fp: Footprint; color: string }) {
  const { pr } = c;
  const pts: Pt[] = [];
  const supports: string[] = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = fp.u0 + (fp.u1 - fp.u0) * (0.5 + 0.48 * Math.cos(t * Math.PI * 2));
    const v = fp.v0 + (fp.v1 - fp.v0) * (0.5 + 0.45 * Math.sin(t * Math.PI * 2));
    const z = 4 + 12 * Math.abs(Math.sin(t * Math.PI * 3)) * (1 - t * 0.4);
    pts.push(P(pr, u, v, z));
    const g = P(pr, u, v, 0);
    supports.push(`M${g[0].toFixed(1)},${g[1].toFixed(1)}L${pts[i][0].toFixed(1)},${pts[i][1].toFixed(1)}`);
  }
  return (
    <g>
      <path d={supports.join('')} stroke={lit('#e9dcc0', c.m)} strokeWidth="0.7" />
      <path d={`M${pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L')}`} stroke={c.m === 'day' ? '#c0392b' : color} strokeWidth="1.6" fill="none" />
    </g>
  );
}

function Carousel({ c, fp, color }: { c: Ctx; fp: Footprint; color: string }) {
  const { pr } = c;
  const [x, y] = P(pr, (fp.u0 + fp.u1) / 2, (fp.v0 + fp.v1) / 2);
  const r = Math.min(fp.u1 - fp.u0, fp.v1 - fp.v0) * 0.42;
  const top = y - 9 * pr.hz - 6;
  return (
    <g>
      <ellipse cx={x} cy={y} rx={r} ry={r * pr.k * 0.9} fill={lit('#f4e3c3', c.m)} />
      <rect x={x - r} y={y - 7 * pr.hz} width={r * 2} height={7 * pr.hz} fill={lit('#fff1e0', c.m)} opacity="0.6" />
      <path d={`M${x - r * 1.1} ${y - 7 * pr.hz}L${x} ${top}L${x + r * 1.1} ${y - 7 * pr.hz}Z`} fill={lit('#ff6f91', c.m)} />
      <path d={`M${x - r * 0.35} ${y - 7 * pr.hz}L${x} ${top}L${x + r * 0.35} ${y - 7 * pr.hz}Z`} fill={lit('#fff7ea', c.m)} />
      <path d={`M${x} ${top}v-5`} stroke="#5b4a3a" strokeWidth="0.6" /><path d={`M${x} ${top - 5}l4 1.5l-4 1.5z`} fill={color} />
      {c.m !== 'day' && <path d={`M${x - r * 1.1} ${y - 7 * pr.hz}H${x + r * 1.1}`} stroke={color} strokeWidth="1.2" strokeDasharray="0.1 2.2" strokeLinecap="round" />}
    </g>
  );
}

/* ---------------- one building ---------------- */

export const Building = memo(function Building({ it, c, sel, tint, badge, onPick }: { it: Item; c: Ctx; sel: boolean; tint?: string; badge?: string; onPick: (key: string) => void }) {
  const { pr, m, tier } = c;
  const fp = it.fp;
  const hh = h32(it.key);
  const glowOn = m !== 'day' && it.open && !it.closed;
  const ownerCol = OWNER_COLOR[it.owner] ?? OWNER_COLOR.private;
  const plate = poly([P(pr, it.parcel.u0, it.parcel.v0), P(pr, it.parcel.u1, it.parcel.v0), P(pr, it.parcel.u1, it.parcel.v1), P(pr, it.parcel.u0, it.parcel.v1)]);
  const fpPoly = poly([P(pr, fp.u0, fp.v0), P(pr, fp.u1, fp.v0), P(pr, fp.u1, fp.v1), P(pr, fp.u0, fp.v1)]);
  const center = P(pr, (fp.u0 + fp.u1) / 2, fp.v0);
  const style = it.style;
  const weather = Math.max(0, (60 - it.condition) / 60);
  const wallBase = STYLE_WALLS[style][hh % STYLE_WALLS[style].length];
  const wall = lit(mix(wallBase, '#8d7f6c', weather * 0.55 + (it.closed ? 0.25 : 0)), m);
  const flatRoof = style === 'doowop' || style === 'deco' || style === 'midcentury';
  const roof = lit(mix(flatRoof ? mix(wallBase, '#fffaf0', 0.55) : STYLE_ROOF[style], '#6b6256', weather * 0.4), m);
  const parts: JSX.Element[] = [];
  const signCol = it.closed ? '#6b6256' : it.sign;
  const icon = it.icon;
  const h = it.building ? Math.max(1, fp.h * it.progress) : fp.h;
  const title = `${it.name}${it.lot?.address ? ` — ${it.lot.address}` : ''}`;

  // Long shadows at dusk, short by day.
  if (pr.iso && h > 0 && tier >= 1) {
    const L = m === 'dusk' ? 2.4 : m === 'night' ? 0 : 0.7;
    if (L > 0) {
      const d = h * L;
      const sh = poly([P(pr, fp.u0, fp.v0), P(pr, fp.u1, fp.v0), P(pr, fp.u1 + d * 0.6, fp.v0 + d * 0.8), P(pr, fp.u1 + d * 0.6, fp.v1 + d * 0.8), P(pr, fp.u0 + d * 0.6, fp.v1 + d * 0.8), P(pr, fp.u0, fp.v1)]);
      parts.push(<path key="sh" d={sh} fill="#1b1030" opacity={m === 'dusk' ? 0.32 : 0.16} />);
    }
  }
  if (tint) parts.push(<path key="tint" d={plate} fill={tint} opacity="0.55" stroke={tint} strokeWidth="1.5" />);

  if (!icon) {
    // Empty ground: sand, stakes, a sign.
    parts.push(<path key="lot" d={fpPoly} fill={lit('#f1dcae', m)} stroke={lit('#b89a68', m)} strokeWidth="0.8" strokeDasharray="3 2" />);
    if (it.forSale && tier >= 1) {
      const [x, y] = P(pr, fp.u0 + 6, fp.v0 + 4);
      parts.push(<g key="fs"><path d={`M${x} ${y}v-9`} stroke="#5b4a3a" strokeWidth="0.7" /><rect x={x - 6} y={y - 14} width="12" height="5.5" fill={lit('#ffffff', m)} stroke="#c0392b" strokeWidth="0.6" />{tier >= 2 && <text x={x} y={y - 10} fontSize="2.6" textAnchor="middle" fill="#c0392b" fontWeight="700">FOR SALE</text>}</g>);
    }
  } else if (it.building) {
    const frame = lit('#c08a4a', m);
    const F = (u: number, v: number, z: number) => P(pr, u, v, z);
    const full = Math.max(6, fp.h);
    const d = [
      [F(fp.u0, fp.v0, 0), F(fp.u0, fp.v0, h)], [F(fp.u1, fp.v0, 0), F(fp.u1, fp.v0, h)], [F(fp.u0, fp.v1, 0), F(fp.u0, fp.v1, h)], [F(fp.u1, fp.v1, 0), F(fp.u1, fp.v1, h)],
      [F(fp.u0, fp.v0, h), F(fp.u1, fp.v0, h)], [F(fp.u0, fp.v0, h / 2), F(fp.u1, fp.v0, h / 2)], [F(fp.u0, fp.v0, h), F(fp.u0, fp.v1, h)], [F(fp.u1, fp.v0, h), F(fp.u1, fp.v1, h)], [F(fp.u0, fp.v1, h), F(fp.u1, fp.v1, h)],
    ].map(([a, b]) => `M${a[0].toFixed(1)},${a[1].toFixed(1)}L${b[0].toFixed(1)},${b[1].toFixed(1)}`).join('');
    parts.push(<path key="slab" d={fpPoly} fill={lit('#b7b2a6', m)} />);
    if (it.progress > 0.55) parts.push(<Box key="walls" c={c} fp={fp} h={h * 0.8} wall={lit('#e8dcc4', m)} roof={lit('#cbbd9f', m)} />);
    parts.push(<path key="frame" d={d} stroke={frame} strokeWidth="0.9" fill="none" />);
    if (tier >= 1) {
      const [x, y] = P(pr, fp.u1, fp.v1, 0);
      const top = y - (full + 10) * pr.hz;
      parts.push(<g key="crane" className="hv-crane"><path d={`M${x} ${y}V${top}M${x - 18} ${top}H${x + 8}M${x - 14} ${top}v8`} stroke={lit('#f2b632', m)} strokeWidth="1.2" fill="none" /><rect x={x - 15.5} y={top + 8} width="3" height="2.2" fill="#5b4a3a" /></g>);
    }
  } else if (icon === 'pier') {
    const id = it.useId ?? '';
    const [x, y] = P(pr, (fp.u0 + fp.u1) / 2, (fp.v0 + fp.v1) / 2);
    if (id === 'ride' && (/wheel/i.test(it.name) || hh % 3 === 0)) {
      parts.push(<path key="base" d={fpPoly} fill={lit('#e9d8b4', m)} opacity="0.6" />);
      parts.push(<Wheel key="w" x={x} y={y - 18 * pr.hz} r={16} c={c} color={signCol} spin={tier >= 1} />);
    } else if (id === 'ride' && (/flyer|coaster/i.test(it.name) || hh % 3 === 1)) {
      parts.push(<Coaster key="co" c={c} fp={fp} color={signCol} />);
    } else if (id === 'ride') {
      parts.push(<Carousel key="ca" c={c} fp={fp} color={signCol} />);
    } else if (id === 'minigolf') {
      parts.push(<path key="g" d={fpPoly} fill={lit('#58b368', m)} stroke={lit('#2f8a57', m)} strokeWidth="0.8" />);
      if (tier >= 1) {
        const [wx, wy] = P(pr, fp.u0 + (fp.u1 - fp.u0) * 0.7, fp.v0 + (fp.v1 - fp.v0) * 0.5);
        parts.push(<g key="mill"><path d={`M${wx - 2.5} ${wy}L${wx - 1.5} ${wy - 9}H${wx + 1.5}L${wx + 2.5} ${wy}Z`} fill={lit('#ff8a73', m)} /><path d={`M${wx - 5} ${wy - 13}L${wx + 5} ${wy - 5}M${wx + 5} ${wy - 13}L${wx - 5} ${wy - 5}`} stroke={lit('#fff7ea', m)} strokeWidth="1.1" className="hv-spin" /></g>);
        const [vx, vy] = P(pr, fp.u0 + (fp.u1 - fp.u0) * 0.3, fp.v0 + (fp.v1 - fp.v0) * 0.4);
        parts.push(<path key="volc" d={`M${vx - 6} ${vy}L${vx - 1} ${vy - 7}H${vx + 1}L${vx + 6} ${vy}Z`} fill={lit('#a0522d', m)} />);
      }
    } else if (id === 'stand') {
      const k = { ...fp, u0: fp.u0 + (fp.u1 - fp.u0) * 0.3, u1: fp.u1 - (fp.u1 - fp.u0) * 0.3, v1: fp.v0 + 8 };
      parts.push(<Box key="k" c={c} fp={k} h={4} wall={wall} roof={roof} />);
      parts.push(<Awning key="aw" c={c} fp={k} z={3.2} colorA={lit('#ffffff', m)} colorB={lit('#e2453a', m)} />);
      if (tier >= 1) { const [sx, sy] = P(pr, (k.u0 + k.u1) / 2, k.v0, 9); parts.push(<g key="dog"><rect x={sx - 7} y={sy - 2.5} width="14" height="5" rx="2.5" fill={lit('#d9893b', m)} /><rect x={sx - 6} y={sy - 1} width="12" height="2" rx="1" fill={m === 'day' ? '#c0392b' : signCol} /></g>); }
    } else {
      // Arcade or funhouse: a box with an open, bulb-lit front.
      parts.push(<Box key="b" c={c} fp={fp} h={8} wall={wall} roof={roof} />);
      const arch = poly([P(pr, fp.u0 + 3, fp.v0 - 0.05, 0), P(pr, fp.u1 - 3, fp.v0 - 0.05, 0), P(pr, fp.u1 - 3, fp.v0 - 0.05, 5.5), P(pr, fp.u0 + 3, fp.v0 - 0.05, 5.5)]);
      if (pr.iso) parts.push(<path key="arch" d={arch} fill={m === 'day' ? '#3a2c3e' : '#ffcf6e'} opacity={m === 'day' ? 0.85 : 0.9} />);
      if (tier >= 1 && pr.iso) {
        const bulbs = Array.from({ length: 9 }, (_, i) => P(pr, fp.u0 + 3 + ((fp.u1 - fp.u0 - 6) * i) / 8, fp.v0 - 0.1, 6.6));
        parts.push(<path key="bulbs" d={bulbs.map((p) => `M${p[0].toFixed(1)},${p[1].toFixed(1)}h0.01`).join('')} stroke={m === 'day' ? '#fff3b0' : signCol} strokeWidth="1.3" strokeLinecap="round" className={m !== 'day' ? 'hv-chase' : undefined} />);
      }
      if (id === 'funhouse' && tier >= 1) { const [fx, fy] = P(pr, (fp.u0 + fp.u1) / 2, fp.v0, 10); parts.push(<g key="face"><circle cx={fx} cy={fy} r="4" fill={lit('#fff1e0', m)} /><circle cx={fx} cy={fy + 0.6} r="1.1" fill="#e2453a" /><path d={`M${fx - 2.2} ${fy + 1.8}q2.2 1.8 4.4 0`} stroke="#3a2c3e" strokeWidth="0.5" fill="none" /></g>); }
    }
  } else {
    // A building: box, roof by style, windows, storefront, sign.
    const isMotel = icon === 'motel';
    const isHotel = icon === 'hotel';
    const isShop = icon === 'store' || icon === 'pizza';
    const isClub = icon === 'club';
    const isHouse = icon === 'house' || /rooming|boarding|cottage|flop/.test(it.useId ?? '');
    let body = fp;
    if (isMotel && it.parcel.front === 'v0' && it.parcel.v1 - it.parcel.v0 > 50) {
      const dd = fp.v1 - fp.v0;
      body = { ...fp, v0: it.parcel.v1 - 4 - dd, v1: it.parcel.v1 - 4 };
      // The pool and the palms in front.
      const pool = poly([P(pr, fp.u0 + 8, fp.v0 + 4), P(pr, fp.u0 + 26, fp.v0 + 4), P(pr, fp.u0 + 26, body.v0 - 6), P(pr, fp.u0 + 8, body.v0 - 6)]);
      parts.push(<path key="deck" d={poly([P(pr, fp.u0, fp.v0), P(pr, fp.u1, fp.v0), P(pr, fp.u1, body.v0), P(pr, fp.u0, body.v0)])} fill={lit('#f3e8d2', m)} />);
      parts.push(<path key="pool" d={pool} fill={m === 'day' ? '#4fd1e0' : '#2fd6c8'} stroke={lit('#ffffff', m)} strokeWidth="0.8" opacity={m === 'night' ? 0.85 : 1} />);
      if (tier >= 1) {
        for (const [du, dv] of [[30, 6], [fp.u1 - fp.u0 - 6, 8]] as const) {
          const [x, y] = P(pr, fp.u0 + du, fp.v0 + dv);
          parts.push(<use key={`palm${du}`} href="#hv-palm" x={x - 8} y={y - 22} width="16" height="23" />);
        }
      }
    }
    const H = isHotel ? Math.max(18, body.h) : body.h;
    const gable = isHouse || style === 'colonial' || style === 'victorian' || style === 'tiki';
    parts.push(<Box key="box" c={c} fp={body} h={H} wall={wall} roof={roof} />);
    if (!gable && tier >= 1 && pr.iso && body.u1 - body.u0 > 14) {
      // Rooftop bits: a vent box and a trim line along the front.
      const vu = body.u0 + (body.u1 - body.u0) * (0.25 + (hh % 5) * 0.1);
      parts.push(<Box key="vent" c={c} fp={{ u0: vu, u1: vu + 3, v0: body.v0 + (body.v1 - body.v0) * 0.55, v1: body.v0 + (body.v1 - body.v0) * 0.55 + 3, h: 0 }} z0={H} h={1.4} wall={lit('#c9c2b4', m)} roof={lit('#e4ded2', m)} />);
      parts.push(<path key="trim" d={line([P(pr, body.u0, body.v0, H), P(pr, body.u1, body.v0, H)])} stroke={lit(style === 'doowop' ? (hh % 2 ? '#ff6f91' : '#2fb5a8') : shade(wallBase, -0.25), m)} strokeWidth="0.9" />);
    }
    if (gable && !isHotel && pr.iso) parts.push(<Gable key="gable" c={c} fp={body} h={H} rh={style === 'tiki' ? 9 : 5} roof={roof} wallEnd={wall} />);
    if (style === 'deco' && !gable && tier >= 1) {
      const cu = (body.u0 + body.u1) / 2;
      const step = { u0: cu - 5, u1: cu + 5, v0: body.v0, v1: body.v0 + 4, h: 0 };
      parts.push(<Box key="step" c={c} fp={step} z0={H} h={4} wall={shade(wall, 0.12)} roof={roof} />);
    }
    if (style === 'midcentury' && !gable && pr.iso) {
      const ov = poly([P(pr, body.u0 - 2, body.v0 - 2.5, H), P(pr, body.u1 + 2, body.v0 - 2.5, H), P(pr, body.u1 + 2, body.v0 - 2.5, H + 0.7), P(pr, body.u0 - 2, body.v0 - 2.5, H + 0.7)]);
      parts.push(<path key="ov" d={ov} fill={lit('#3d4650', m)} />);
    }
    if (pr.iso && tier >= 1) {
      const lit_ = it.open && !it.closed;
      const w = windows(c, body, H, { from: isShop || isClub ? 3.4 : 0, lit: lit_, seed: hh, dark: it.closed, tall: style === 'midcentury' });
      const glass = it.closed ? lit('#5b5148', m) : m === 'day' ? (style === 'tiki' ? '#5a3a22' : c.pal.window) : '#2a2440';
      if (w.day) parts.push(<path key="wd" d={w.day} fill={glass} />);
      if (w.night) parts.push(<path key="wn" d={w.night} fill={m === 'day' ? c.pal.window : c.pal.windowLit} />);
      if (isMotel) {
        // Doors and the upstairs walkway rail.
        const rail = `M${P(pr, body.u0, body.v0 - 1.4, 4.4).map((x) => x.toFixed(1)).join(',')}L${P(pr, body.u1, body.v0 - 1.4, 4.4).map((x) => x.toFixed(1)).join(',')}`;
        parts.push(<path key="rail" d={rail} stroke={lit('#ffffff', m)} strokeWidth="0.7" />);
        if (style === 'doowop' && tier >= 2) {
          // Colored doors on both floors, and a zig-zag neon band along the walkway.
          const n = Math.max(3, Math.floor((body.u1 - body.u0 - 4) / 4.5));
          const cols = ['#e86fa0', '#4f9fd8', '#f2c84a', '#e0574a'];
          for (const z of [0.2, 4.6]) {
            for (let i = 0; i < n; i++) {
              if (i % 3 === 0) continue;
              const u = body.u0 + 2 + ((body.u1 - body.u0 - 4) * (i + 0.5)) / n;
              const d = poly([P(pr, u - 0.7, body.v0 - 0.05, z), P(pr, u + 0.7, body.v0 - 0.05, z), P(pr, u + 0.7, body.v0 - 0.05, z + 2.6), P(pr, u - 0.7, body.v0 - 0.05, z + 2.6)]);
              parts.push(<path key={`dr${z}${i}`} d={d} fill={lit(cols[(i + hh) % 4], m)} />);
            }
          }
          const zn = Math.max(4, Math.round((body.u1 - body.u0) / 3));
          const zz = Array.from({ length: zn + 1 }, (_, i) => P(pr, body.u0 + ((body.u1 - body.u0) * i) / zn, body.v0 - 1.5, 3.6 + (i % 2) * 0.9));
          const neon = m === 'day' ? '#2fb5a8' : '#4ff0e6';
          parts.push(<path key="zz" d={line(zz)} stroke={neon} strokeWidth={m === 'day' ? 0.45 : 0.6} fill="none" />);
          if (glowOn) parts.push(<path key="zzg" d={line(zz)} stroke={neon} strokeOpacity="0.35" strokeWidth="2" fill="none" />);
        }
      }
      if (isShop || isClub) {
        const sf = poly([P(pr, body.u0 + 1.5, body.v0 - 0.05, 0.3), P(pr, body.u1 - 1.5, body.v0 - 0.05, 0.3), P(pr, body.u1 - 1.5, body.v0 - 0.05, 2.6), P(pr, body.u0 + 1.5, body.v0 - 0.05, 2.6)]);
        parts.push(<path key="sf" d={sf} fill={it.closed ? lit('#5b5148', m) : m === 'day' ? '#9fd4e6' : '#ffd58a'} opacity="0.95" />);
        if (isShop && !it.closed) parts.push(<Awning key="aw" c={c} fp={body} z={2.7} colorA={lit('#ffffff', m)} colorB={lit(hh % 2 ? '#ff6f91' : '#3cc6c0', m)} />);
        if (isClub && !it.closed) {
          const mq = poly([P(pr, body.u0 + 4, body.v0 - 3, 3), P(pr, body.u1 - 4, body.v0 - 3, 3), P(pr, body.u1 - 4, body.v0 - 3, 4.6), P(pr, body.u0 + 4, body.v0 - 3, 4.6)]);
          parts.push(<path key="mq" d={mq} fill={m === 'day' ? '#2a1f2e' : signCol} opacity={m === 'day' ? 1 : 0.9} />);
          const bulbs = Array.from({ length: 10 }, (_, i) => P(pr, body.u0 + 4 + ((body.u1 - body.u0 - 8) * i) / 9, body.v0 - 3.05, 4.9));
          parts.push(<path key="mb" d={bulbs.map((p) => `M${p[0].toFixed(1)},${p[1].toFixed(1)}h0.01`).join('')} stroke={m === 'day' ? '#fff3b0' : '#fff'} strokeWidth="1" strokeLinecap="round" className={m !== 'day' ? 'hv-chase' : undefined} />);
        }
        if (it.forLease) {
          const [x, y] = P(pr, (body.u0 + body.u1) / 2, body.v0 - 0.1, 1.5);
          if (tier >= 2) parts.push(<text key="rent" x={x} y={y} fontSize="2.2" textAnchor="middle" fill="#c0392b" fontWeight="700">FOR RENT</text>);
        }
      }
      if (style === 'doowop' && !gable && !isHotel) {
        // The boomerang canopy over the front.
        const can = poly([P(pr, body.u0 - 1, body.v0, H - 0.3), P(pr, body.u1 + 3, body.v0, H + 1.8), P(pr, body.u1 + 3, body.v0 - 5, H + 2.4), P(pr, body.u0 - 1, body.v0 - 4, H)]);
        parts.push(<path key="can" d={can} fill={lit(hh % 2 ? '#ff6f91' : '#2fb5a8', m)} />);
      }
      if (style === 'colonial' && pr.iso) {
        const cols = Array.from({ length: Math.max(2, Math.round((body.u1 - body.u0) / 6)) }, (_, i) => body.u0 + 1 + ((body.u1 - body.u0 - 2) * i) / Math.max(1, Math.round((body.u1 - body.u0) / 6) - 1));
        parts.push(<path key="cols" d={cols.map((u) => { const a = P(pr, u, body.v0 - 1.5, 0); const b = P(pr, u, body.v0 - 1.5, Math.min(H, 7)); return `M${a[0].toFixed(1)},${a[1].toFixed(1)}L${b[0].toFixed(1)},${b[1].toFixed(1)}`; }).join('')} stroke={lit('#ffffff', m)} strokeWidth="0.9" />);
      }
      if (style === 'victorian' && pr.iso) {
        const porch = poly([P(pr, body.u0, body.v0, 3.4), P(pr, body.u1, body.v0, 3.4), P(pr, body.u1, body.v0 - 3, 3), P(pr, body.u0, body.v0 - 3, 3)]);
        parts.push(<path key="porch" d={porch} fill={shade(roof, 0.1)} />);
        parts.push(<path key="gb" d={line([P(pr, body.u0, body.v0 - 3, 2.9), P(pr, body.u1, body.v0 - 3, 2.9)])} stroke={lit('#fff7ea', m)} strokeWidth="0.6" strokeDasharray="0.6 0.8" />);
      }
      if (style === 'tiki' && tier >= 1) {
        for (const du of [1.5, body.u1 - body.u0 - 1.5]) {
          const [x, y] = P(pr, body.u0 + du, body.v0 - 2.5, 0);
          parts.push(<g key={`t${du}`}><path d={`M${x} ${y}v-5`} stroke="#5a3a22" strokeWidth="0.6" /><path d={`M${x} ${y - 5}q-1 -1.5 0 -3q1 1.5 0 3z`} fill={m === 'day' ? '#ff8a3c' : '#ffd27a'} className="hv-flicker" /></g>);
        }
      }
    }
    // The sign.
    if (!it.closed && tier >= 1) {
      const glow = glowOn;
      if (isMotel || (style === 'doowop' && !isHotel)) {
        const [x, y] = P(pr, body.u0 + 2, body.v0 - 2, 0);
        const top = y - (H + 11) * pr.hz;
        parts.push(<g key="pylon"><path d={`M${x} ${y}V${top + 4}`} stroke={lit('#d8d2c4', m)} strokeWidth="1.1" />
          <rect x={x - 5.5} y={top - 4} width="11" height="8" rx="2" fill={m === 'day' ? '#fff7ea' : '#1b1030'} stroke={signCol} strokeWidth={glow ? 1.4 : 0.9} />
          {glow && <rect x={x - 5.5} y={top - 4} width="11" height="8" rx="2" fill="none" stroke={signCol} strokeOpacity="0.35" strokeWidth="3.5" />}
          {style === 'doowop' && <Star x={x + 6} y={top - 5} r={4} color={m === 'day' ? '#ffd34d' : signCol} />}
          {tier >= 2 && <text x={x} y={top + 1.4} fontSize="3.2" textAnchor="middle" fill={m === 'day' ? signCol : '#fff'} stroke={m === 'day' ? '#2a1f2e' : signCol} strokeWidth="0.35" paintOrder="stroke" fontWeight="700">{isMotel ? 'MOTEL' : it.name.replace(/^The /, '').split(' ')[0].toUpperCase().slice(0, 8)}</text>}
          {isMotel && tier >= 2 && <text x={x} y={top + 6.6} fontSize="1.8" textAnchor="middle" fill={m === 'day' ? '#c0392b' : '#ff4b3e'} fontWeight="700">VACANCY</text>}
        </g>);
      } else if (isHotel) {
        const [x, y] = P(pr, (body.u0 + body.u1) / 2, body.v0, H + 1.5);
        if (tier >= 2) parts.push(<Neon key="hs" c={c} x={x} y={y} text={it.name.replace(/^The /, '').toUpperCase()} color={signCol} size={3.6} glow={glow} font={FONT[style]} />);
        else parts.push(<path key="hs" d={`M${x - 8} ${y}h16`} stroke={signCol} strokeWidth="1.6" />);
      } else if (tier >= 1) {
        const [x, y] = P(pr, (body.u0 + body.u1) / 2, body.v0 - 0.1, isShop || isClub ? 4.4 : H - 0.8);
        const w = Math.min(body.u1 - body.u0 - 2, 20);
        parts.push(<g key="board"><rect x={x - w / 2} y={y - 2.2} width={w} height="3.2" rx="0.6" fill={m === 'day' ? '#fff7ea' : '#1b1030'} stroke={signCol} strokeWidth={glow ? 0.9 : 0.5} />
          {glow && <rect x={x - w / 2} y={y - 2.2} width={w} height="3.2" rx="0.6" fill="none" stroke={signCol} strokeOpacity="0.35" strokeWidth="2.4" />}
          {tier >= 2 && <text x={x} y={y + 0.6} fontSize="2.2" textAnchor="middle" fill={m === 'day' ? '#2a1f2e' : signCol} fontWeight="700" fontFamily={FONT[style]}>{it.name.replace(/^The /, '').slice(0, 18)}</text>}
        </g>);
      }
    }
    if (it.closed && tier >= 1) {
      const [x, y] = P(pr, body.u0 + 3, body.v0 - 3, 0);
      parts.push(<g key="fs"><path d={`M${x} ${y}v-8`} stroke="#5b4a3a" strokeWidth="0.7" /><rect x={x - 5} y={y - 13} width="10" height="5" fill={lit('#ffffff', m)} stroke="#c0392b" strokeWidth="0.6" />{tier >= 2 && <text x={x} y={y - 9.6} fontSize="2.2" textAnchor="middle" fill="#c0392b" fontWeight="700">CLOSED</text>}</g>);
    }
  }
  // Who holds it: a little pennant.
  if (tier >= 1 && !it.vacant && it.owner !== 'private') {
    const [x, y] = P(pr, fp.u1 - 1, fp.v0 + 1, Math.max(fp.h, 4) + (icon === 'pier' ? 2 : 0));
    parts.push(<g key="flag"><path d={`M${x} ${y}v-6`} stroke="#3a2c3e" strokeWidth="0.5" /><path d={`M${x} ${y - 6}l4.5 1.6l-4.5 1.6z`} fill={ownerCol} stroke="#2a1f2e" strokeWidth="0.25" /></g>);
  }
  // The business-type overlay: the group's icon on a little disc over the roof.
  if (badge && tint) {
    const [x, y] = P(pr, (fp.u0 + fp.u1) / 2, (fp.v0 + fp.v1) / 2, Math.max(fp.h, 4) + 6);
    parts.push(<g key="badge" pointerEvents="none"><circle cx={x} cy={y} r="6.2" fill="#1b1030" stroke={tint} strokeWidth="1.4" /><text x={x} y={y + 2.6} fontSize="7" textAnchor="middle">{badge}</text></g>);
  }
  if (sel) {
    parts.push(<path key="sel" d={plate} fill="none" stroke="#ffe066" strokeWidth="2.4" className="hv-sel" />);
    const top = center[1] - (fp.h + 14) * pr.hz - 6;
    parts.push(<path key="pin" d={`M${center[0]} ${top + 8}l-4 -6h8z`} fill="#ffe066" stroke="#2a1f2e" strokeWidth="0.6" className="hv-bounce" />);
  }
  return (
    <g data-testid="hv-bldg" data-key={it.key} onClick={(e) => { e.stopPropagation(); onPick(it.key); }} style={{ cursor: 'pointer' }}>
      <title>{title}</title>
      {parts}
    </g>
  );
});

function line(ps: Pt[]): string {
  return `M${ps.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L')}`;
}
