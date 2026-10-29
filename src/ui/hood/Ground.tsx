import { SIGN_HEX } from '../../engine/design';
import { AVENUES, BOARDWALK, CAUSEWAY, CROSS, ISLAND_BOUNDS, LANDMARKS, OUTLINES, PIERS, TOWN_SPANS, U_NORTH, U_SOUTH, WEST_WILDWOOD, aveRuns, aveV, bayEdge, beachWidth, boardwalkV, frontV, townAt } from '../../engine/hoodData';
import { axisAngle, crossAngle, line, P, poly, type Mood, type Palette, type Proj } from './iso';

/**
 * The ground of the illustrated island: ocean, beach, the town's blocks,
 * the street grid, the Boardwalk and the pier decks, the back bay and its
 * marshes, the causeway, West Wildwood, and the names. No property here —
 * every building is drawn from a record (Buildings.tsx). The blocks carry a
 * texture of rooftops: the year-round town, not anyone's business.
 */

const step = (a: number, b: number, d: number) => { const o: number[] = []; for (let x = a; x <= b; x += d) o.push(x); if (o[o.length - 1] !== b) o.push(b); return o; };

function hash(n: number): number {
  let x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

export const VIEW_BOUNDS = (pr: Proj) => {
  const B = ISLAND_BOUNDS;
  // The island and its back bay (the mainland end of the causeway lies further out; the view need not take it in).
  const v1 = Math.min(B.v1, 2600);
  const pts = [P(pr, B.u0, B.v0), P(pr, B.u1, B.v0), P(pr, B.u1, v1), P(pr, B.u0, v1)];
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
};

export function GroundDefs({ pal, mood }: { pal: Palette; mood: Mood }) {
  const night = mood !== 'day';
  return (
    <defs>
      <linearGradient id="hv-ocean" x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0" stopColor={pal.ocean} />
        <stop offset="1" stopColor={pal.ocean2} />
      </linearGradient>
      <pattern id="hv-houses" width="22" height="15" patternUnits="userSpaceOnUse">
        <rect width="22" height="15" fill={pal.block} />
        <rect x="2" y="5.5" width="5.5" height="3.6" fill={night ? '#3a3550' : '#f7efdc'} />
        <path d="M1.6 5.7L4.75 3.2L7.9 5.7Z" fill={pal.roofs[0]} opacity="0.75" />
        <rect x="13" y="10" width="5" height="3.2" fill={night ? '#34304a' : '#f3e9d4'} />
        <path d="M12.6 10.2L15.5 7.9L18.4 10.2Z" fill={pal.roofs[1]} opacity="0.75" />
        {night && <><rect x="3.6" y="6.8" width="1" height="1" fill="#ffd27a" /><rect x="15" y="11.2" width="1" height="1" fill="#ffd27a" /></>}
        {!night && <><circle cx="10.5" cy="7" r="1.4" fill="#8cc084" opacity="0.8" /><circle cx="20" cy="4" r="1.1" fill="#8cc084" opacity="0.7" /></>}
      </pattern>
      <pattern id="hv-planks" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-55)">
        <rect width="5" height="5" fill={pal.plank} />
        <path d="M0 0.5H5" stroke={pal.plank2} strokeWidth="0.6" />
      </pattern>
      <symbol id="hv-umb-a" viewBox="-6 -9 12 10" overflow="visible"><path d="M0 0V-6" stroke="#5b4a3a" strokeWidth="0.6" /><path d="M-5 -5.5Q0 -10 5 -5.5Z" fill="#ff7aa8" /><path d="M-1.6 -5.5Q0 -10 1.6 -5.5Z" fill="#fff" /></symbol>
      <symbol id="hv-umb-b" viewBox="-6 -9 12 10" overflow="visible"><path d="M0 0V-6" stroke="#5b4a3a" strokeWidth="0.6" /><path d="M-5 -5.5Q0 -10 5 -5.5Z" fill="#3cc6c0" /><path d="M-1.6 -5.5Q0 -10 1.6 -5.5Z" fill="#fff" /></symbol>
      <symbol id="hv-umb-c" viewBox="-6 -9 12 10" overflow="visible"><path d="M0 0V-6" stroke="#5b4a3a" strokeWidth="0.6" /><path d="M-5 -5.5Q0 -10 5 -5.5Z" fill="#ffd34d" /><path d="M-1.6 -5.5Q0 -10 1.6 -5.5Z" fill="#ff8a5c" /></symbol>
      <symbol id="hv-palm" viewBox="-8 -22 16 23" overflow="visible">
        <path d="M0 0Q1.5 -9 0.5 -17" stroke="#8a5a32" strokeWidth="1.4" fill="none" />
        <path d="M0.5 -17Q-6 -19 -8 -14M0.5 -17Q6 -20 8 -15M0.5 -17Q-3 -22 -6 -21M0.5 -17Q4 -23 7 -21M0.5 -17Q0 -22 1 -23" stroke="#2f9e5b" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      </symbol>
      <symbol id="hv-guard" viewBox="-4 -12 8 13" overflow="visible"><path d="M-2.5 0L-1.5 -7M2.5 0L1.5 -7M-2 -3.5H2" stroke="#fff" strokeWidth="0.8" /><rect x="-2.6" y="-9.5" width="5.2" height="2.5" fill="#e2453a" /><path d="M-3 -9.5L0 -12L3 -9.5Z" fill="#fff" /></symbol>
      <symbol id="hv-boat" viewBox="-8 -12 16 13" overflow="visible"><path d="M-7 -1H7L5 1H-5Z" fill="#fff" /><path d="M0 -1V-11L6 -2Z" fill="#fff" stroke="#c9d6e0" strokeWidth="0.4" /><path d="M0 -11L-5 -2H0" fill="#ff8a73" /></symbol>
      <radialGradient id="hv-glow"><stop offset="0" stopColor="#ffd27a" stopOpacity="0.55" /><stop offset="1" stopColor="#ffd27a" stopOpacity="0" /></radialGradient>
    </defs>
  );
}

/** Rings of the frame as one path (even-odd: a ring inside another is a hole). */
function ringsPath(pr: Proj, rings: [number, number][][] | undefined): string {
  return (rings ?? []).map((r) => poly(r.map(([u, v]) => P(pr, u, v)))).join('');
}

function islandOutline(pr: Proj): string {
  if (OUTLINES.land?.length) return ringsPath(pr, OUTLINES.land);
  const sea: [number, number][] = step(-700, U_NORTH, 100).map((u) => P(pr, u, -beachWidth(u)));
  const tip: [number, number][] = [P(pr, U_NORTH + 70, 60), P(pr, U_NORTH + 40, 220)];
  const bay: [number, number][] = step(-700, U_NORTH, 100).reverse().map((u) => P(pr, u, bayEdge(u)));
  return poly([...sea, ...tip, ...bay]);
}

function townOutline(pr: Proj): string {
  if (OUTLINES.town?.length) return ringsPath(pr, OUTLINES.town);
  const front: [number, number][] = step(-700, U_NORTH - 20, 100).map((u) => P(pr, u, -2));
  const bay: [number, number][] = step(-700, U_NORTH - 20, 100).reverse().map((u) => P(pr, u, bayEdge(u) - 4));
  return poly([...front, ...bay]);
}

/** The lines the blocks lie between at u: the town's front, the avenues that run there, the bay. */
function linesAt(u: number): number[] {
  const out = [frontV(u)];
  for (const a of AVENUES) if (aveRuns(a.id, u)) out.push(aveV(a.id, u));
  out.push(bayEdge(u));
  return out.sort((x, y) => x - y);
}

/**
 * The blocks: between each pair of neighbouring cross streets, a block between
 * each pair of neighbouring avenues (the front and the bay at the ends), cut to
 * the town's outline by a clip path (Ground draws it), so the harbours and
 * lagoons cut into them as they do on the ground.
 */
function blocksPath(pr: Proj): string {
  let d = '';
  const grid = CROSS.filter((c) => !c.hidden);
  const all = [{ u: U_SOUTH - 60 }, ...grid, { u: U_NORTH - 20 }];
  for (let i = 0; i < all.length - 1; i++) {
    const ua = all[i].u + 7;
    const ub = all[i + 1].u - 7;
    if (ub - ua < 14) continue;
    const um = (ua + ub) / 2;
    const L = linesAt(um);
    for (let k = 0; k < L.length - 1; k++) {
      const v0 = L[k] + (k === 0 ? 2 : 8);
      const v1 = L[k + 1] - (k + 1 === L.length - 1 ? 0 : 8);
      if (v1 - v0 < 14) continue;
      // Each corner follows the avenues where they bend (they are measured, not straight).
      const ka = linesAt(ua); const kb = linesAt(ub);
      const same = ka.length === L.length && kb.length === L.length;
      const at = (K: number[], j: number, fb: number) => (same ? K[j] : fb);
      const a0 = at(ka, k, L[k]) - L[k] + v0; const b0 = at(kb, k, L[k]) - L[k] + v0;
      const a1 = at(ka, k + 1, L[k + 1]) - L[k + 1] + v1; const b1 = at(kb, k + 1, L[k + 1]) - L[k + 1] + v1;
      d += poly([P(pr, ua, a0), P(pr, ub, b0), P(pr, ub, b1), P(pr, ua, a1)]);
    }
  }
  return d;
}

function streetsPath(pr: Proj): { aves: string; cross: string } {
  let aves = '';
  for (const a of AVENUES) {
    if (a.path?.length) { aves += line(a.path.map(([u, v]) => P(pr, u, v))); continue; }
    aves += line([P(pr, a.from ?? U_SOUTH, a.v), P(pr, a.to ?? U_NORTH, a.v)]);
  }
  let cross = '';
  for (const c of CROSS) {
    if (c.hidden) continue;
    const [v0, v1] = c.vRange ?? [frontV(c.u), bayEdge(c.u) - 6];
    cross += line([P(pr, c.u, Math.max(v0, frontV(c.u)) - 2), P(pr, c.u, Math.min(v1, bayEdge(c.u)))]);
  }
  return { aves, cross };
}

function marshes(pr: Proj): { d: string; ch: string } {
  let d = '';
  let ch = '';
  for (let i = 0; i < 26; i++) {
    const u = -400 + hash(i + 1) * 8000;
    const v = 820 + hash(i + 50) * 1250;
    if (u > WEST_WILDWOOD.u0 - 80 && u < WEST_WILDWOOD.u1 + 80 && v < WEST_WILDWOOD.v1 + 80) continue;
    const r = 70 + hash(i + 99) * 160;
    const pts: [number, number][] = [];
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      const rr = r * (0.6 + 0.5 * hash(i * 13 + k));
      pts.push(P(pr, u + Math.cos(a) * rr * 1.6, v + Math.sin(a) * rr));
    }
    d += poly(pts);
    ch += line([P(pr, u - r * 0.8, v + 4), P(pr, u, v - 10), P(pr, u + r * 0.9, v + 6)]);
  }
  return { d, ch };
}

function mainland(pr: Proj): string {
  const v0 = CAUSEWAY.mainlandV;
  const B = ISLAND_BOUNDS;
  const edge: [number, number][] = step(B.u0, B.u1, 200).map((u, i) => P(pr, u, v0 + (hash(i + 7) - 0.5) * 60 + Math.max(0, u - 5200) * 0.12));
  return poly([...edge, P(pr, B.u1, v0 + 3000), P(pr, B.u0, v0 + 3000)]);
}

export function Ground({ pr, pal, mood, tier, sc }: { pr: Proj; pal: Palette; mood: Mood; tier: number; sc: number }) {
  const b = VIEW_BOUNDS(pr);
  const night = mood === 'night';
  const { aves, cross } = streetsPath(pr);
  const m = marshes(pr);
  const fs = (px: number) => px / sc;
  const ax = axisAngle(pr);
  const cx = crossAngle(pr);
  const waterline = line(step(-700, U_NORTH, 60).map((u) => P(pr, u, -beachWidth(u))));
  const wave = (off: number) => line(step(-700, U_NORTH + 300, 120).map((u, i) => P(pr, u, -beachWidth(Math.min(u, U_NORTH)) - off - (i % 2) * 6)));
  const cwPts: [number, number][] = CAUSEWAY.path?.length ? CAUSEWAY.path.map(([u, v]) => P(pr, u, v)) : [P(pr, CAUSEWAY.u, bayEdge(CAUSEWAY.u)), P(pr, CAUSEWAY.u - 260, 1300), P(pr, CAUSEWAY.u - 420, CAUSEWAY.mainlandV + 160)];
  const ww = WEST_WILDWOOD;
  const wwPoly = OUTLINES.westww?.length ? ringsPath(pr, OUTLINES.westww) : poly([P(pr, ww.u0, ww.v0), P(pr, ww.u1, ww.v0 - 20), P(pr, ww.u1 + 30, ww.v1), P(pr, ww.u0 - 20, ww.v1 + 10)]);
  // The bridge to West Wildwood: from its nearest corner straight to the island.
  const wwBridge = line([P(pr, ww.u0 + 60, ww.v0 + 10), P(pr, ww.u0 + 60, ww.v0 - 60)]);
  const label = (x: number, y: number, t: string, size: number, rot = 0, opts: { color?: string; ital?: boolean; spacing?: number; weight?: number } = {}) => (
    <text key={`${t}-${x.toFixed(0)}`} x={x} y={y} transform={rot ? `rotate(${rot} ${x} ${y})` : undefined} fontSize={fs(size)} textAnchor="middle" fill={opts.color ?? pal.label}
      stroke={pal.labelHalo} strokeWidth={fs(size) * 0.22} paintOrder="stroke" fontStyle={opts.ital ? 'italic' : undefined} letterSpacing={opts.spacing ? fs(size) * opts.spacing : undefined}
      fontWeight={opts.weight ?? 600} style={{ pointerEvents: 'none' }} fontFamily="'Trebuchet MS', 'Futura', system-ui, sans-serif">{t}</text>
  );
  const umbrellas: JSX.Element[] = [];
  const guards: JSX.Element[] = [];
  if (tier >= 1) {
    for (let u = U_SOUTH + 40; u < U_NORTH - 200; u += 34) {
      const i = Math.round(u);
      const f = Math.min(frontV(u), boardwalkV(u));
      const span = f + beachWidth(u);
      if (hash(i) < 0.35 || span < 70) continue;
      const v = f - 20 - hash(i + 3) * (span - 50);
      const [x, y] = P(pr, u + hash(i + 9) * 20, v);
      umbrellas.push(<use key={i} href={`#hv-umb-${'abc'[i % 3]}`} x={x - 6} y={y - 9} width="12" height="10" />);
    }
    for (let u = U_SOUTH + 200; u < U_NORTH - 300; u += 320) {
      const [x, y] = P(pr, u, -beachWidth(u) + 26);
      guards.push(<use key={u} href="#hv-guard" x={x - 4} y={y - 12} width="8" height="13" />);
    }
  }
  const boats: JSX.Element[] = [];
  if (tier >= 1 && mood !== 'night') {
    for (let i = 0; i < 9; i++) {
      const [x, y] = P(pr, 400 + i * 860 + hash(i) * 300, -beachWidth(400 + i * 860) - 180 - hash(i + 4) * 380);
      boats.push(<use key={i} href="#hv-boat" x={x - 8} y={y - 12} width="16" height="13" className="hv-bob" style={{ animationDelay: `${i * 0.7}s` }} />);
    }
  }
  const avLabels: JSX.Element[] = [];
  for (const a of tier >= 1 ? AVENUES : []) {
    const r: [number, number] = [a.from ?? U_SOUTH, a.to ?? U_NORTH];
    for (let u = r[0] + (tier >= 2 ? 250 : 500); u < r[1] - 150; u += tier >= 2 ? 700 : 1600) {
      const nm = a.names[townAt(u)];
      if (!nm) continue;
      const [x, y] = P(pr, u, aveV(a.id, u));
      avLabels.push(label(x, y + fs(3.5), nm.toUpperCase(), tier >= 2 ? 9 : 8, ax, { spacing: 0.12 }));
    }
  }
  const shown = CROSS.filter((c) => !c.hidden);
  const crossLabel = (c: (typeof CROSS)[number], size: number) => { const v = (aveRuns('at', c.u) ? aveV('at', c.u) : frontV(c.u) + 150) - 45; const [x, y] = P(pr, c.u, v); return label(x, y, c.label, size, cx, { weight: 500 }); };
  const crossLabels = tier >= 2 ? shown.map((c) => crossLabel(c, 8.5)) : tier >= 1 ? shown.filter((_, i) => i % 3 === 0).map((c) => crossLabel(c, 8)) : [];
  // The Boardwalk on its course: its inland edge (BOARDWALK.path) and the planks seaward of it.
  const bwUs = step(BOARDWALK.from, BOARDWALK.to, 40);
  const bwPoly = poly([...bwUs.map((u) => P(pr, u, boardwalkV(u) - BOARDWALK.w)), ...[...bwUs].reverse().map((u) => P(pr, u, boardwalkV(u)))]);
  const bwLine = line(step(BOARDWALK.from + 20, BOARDWALK.to - 20, 40).map((u) => P(pr, u, boardwalkV(u) - BOARDWALK.w / 2)));
  const lights = mood !== 'day';
  return (
    <g>
      <rect x={b.x0 - 4000} y={b.y0 - 4000} width={b.x1 - b.x0 + 8000} height={b.y1 - b.y0 + 8000} fill={pal.bay} />
      <path d={mainland(pr)} fill={pal.mainland} />
      <path d={m.d} fill={pal.marsh} opacity="0.9" />
      {tier >= 1 && <path d={m.ch} stroke={pal.bay} strokeWidth="6" fill="none" opacity="0.7" />}
      {/* The ocean: everything below the waterline. */}
      <path d={poly([...step(-700, U_NORTH + 600, 100).map((u) => P(pr, u, -beachWidth(Math.min(u, U_NORTH)) + (u > U_NORTH ? (u - U_NORTH) * 0.9 : 0))), P(pr, U_NORTH + 900, 2000), P(pr, 9000, 2400), P(pr, 9000, -4000), P(pr, -900, -4000)])} fill="url(#hv-ocean)" />
      <path d={wave(40)} stroke={pal.foam} strokeOpacity="0.35" strokeWidth={3} fill="none" strokeDasharray="30 50" className="hv-wave" />
      <path d={wave(120)} stroke={pal.foam} strokeOpacity="0.22" strokeWidth={3} fill="none" strokeDasharray="20 70" className="hv-wave hv-wave2" />
      <path d={islandOutline(pr)} fill={pal.sand} fillRule="evenodd" />
      <path d={waterline} stroke={pal.foam} strokeWidth="5" fill="none" strokeOpacity="0.85" />
      <clipPath id="hv-town-clip"><path d={townOutline(pr)} clipRule="evenodd" /></clipPath>
      <path d={townOutline(pr)} fill={pal.ground} fillRule="evenodd" />
      <path d={blocksPath(pr)} fill="url(#hv-houses)" stroke={pal.block} strokeWidth="1" clipPath="url(#hv-town-clip)" />
      <g clipPath="url(#hv-town-clip)">
        <path d={aves} stroke={pal.street} strokeWidth="14" fill="none" />
        <path d={cross} stroke={pal.street} strokeWidth="9" fill="none" />
      </g>
      {tier >= 1 && <path d={aves} stroke={pal.streetLine} strokeWidth="0.8" strokeDasharray="6 6" fill="none" opacity="0.8" />}
      {lights && tier >= 1 && <path d={aves} stroke="#ffd27a" strokeOpacity={night ? 0.22 : 0.14} strokeWidth="5" strokeLinecap="round" strokeDasharray="0 36" fill="none" />}
      {/* The causeway over the meadows, and West Wildwood. */}
      <path d={line(cwPts)} stroke={pal.street} strokeWidth="12" fill="none" />
      <path d={line(cwPts)} stroke={pal.streetLine} strokeWidth="1" strokeDasharray="8 8" fill="none" />
      <path d={wwPoly} fill={pal.ground} stroke={pal.sand2} strokeWidth="4" fillRule="evenodd" />
      <path d={wwPoly} fill="url(#hv-houses)" opacity="0.6" fillRule="evenodd" />
      <path d={wwBridge} stroke={pal.street} strokeWidth="7" />
      {/* The Boardwalk and the pier decks. */}
      <path d={bwPoly} fill="url(#hv-planks)" stroke={pal.plank2} strokeWidth="1.2" />
      {lights && <path d={bwLine} stroke="#ffe7a8" strokeOpacity={night ? 0.5 : 0.3} strokeWidth="2.4" strokeLinecap="round" strokeDasharray="0 22" fill="none" />}
      {PIERS.map((p) => {
        const L = p.len;
        const b0 = boardwalkV(p.u) - BOARDWALK.w;
        const deck = poly([P(pr, p.u - p.w / 2, b0), P(pr, p.u + p.w / 2, b0), P(pr, p.u + p.w / 2, b0 - L), P(pr, p.u - p.w / 2, b0 - L)]);
        const piles = step(0, p.w, 12).map((d) => P(pr, p.u - p.w / 2 + d, b0 - L, -4));
        return (
          <g key={p.id}>
            <path d={poly([P(pr, p.u - p.w / 2, b0 - L), P(pr, p.u + p.w / 2, b0 - L), P(pr, p.u + p.w / 2, b0 - L, -5), P(pr, p.u - p.w / 2, b0 - L, -5)])} fill={pal.plank2} />
            {tier >= 1 && piles.map((q, i) => <path key={i} d={line([q, [q[0], q[1] + 5]])} stroke={pal.plank2} strokeWidth="1.4" />)}
            <path d={deck} fill="url(#hv-planks)" stroke={pal.plank2} strokeWidth="1.5" />
          </g>
        );
      })}
      {umbrellas}
      {guards}
      {boats}
      {/* Landmarks that are part of the ground. */}
      {LANDMARKS.map((l) => {
        const [x, y] = P(pr, l.u, l.v);
        if (l.kind === 'lighthouse') return (
          <g key={l.n}>
            <path d={`M${x - 3} ${y}L${x - 2} ${y - 22}H${x + 2}L${x + 3} ${y}Z`} fill="#fff7ea" stroke="#5a4a3a" strokeWidth="0.5" />
            <rect x={x - 2.5} y={y - 26} width="5" height="4" fill={lights ? '#ffe680' : '#2e3a46'} />
            {lights && <circle cx={x} cy={y - 24} r="14" fill="url(#hv-glow)" />}
            <path d={`M${x - 9} ${y + 1}h18v-6l-9 -5l-9 5z`} fill="#fff7ea" stroke="#5a4a3a" strokeWidth="0.5" />
            {tier >= 1 && label(x, y + fs(12), l.n, 8, 0, { ital: true })}
          </g>
        );
        if (l.kind === 'tower') return <g key={l.n}><path d={`M${x - 4} ${y}L${x - 2} ${y - 18}M${x + 4} ${y}L${x + 2} ${y - 18}`} stroke="#7a8a96" strokeWidth="1" /><ellipse cx={x} cy={y - 21} rx="7" ry="4.5" fill="#d9e4ea" stroke="#7a8a96" strokeWidth="0.6" />{tier >= 2 && <text x={x} y={y - 19.5} fontSize="3" textAnchor="middle" fill="#2f5d7a" fontWeight="700">WILDWOOD</text>}</g>;
        if (l.kind === 'lake') return <g key={l.n}><ellipse cx={x} cy={y} rx={70} ry={40 * pr.k} fill={pal.bay} />{tier >= 1 && label(x, y + 3, l.n, 8, 0, { ital: true })}</g>;
        if (l.kind === 'harbor') return <g key={l.n}><path d={poly([P(pr, l.u - 60, l.v - 30), P(pr, l.u + 60, l.v - 30), P(pr, l.u + 70, l.v + 80), P(pr, l.u - 70, l.v + 80)])} fill={pal.bay} />{tier >= 1 && [0, 1, 2, 3].map((i) => { const [bx, by] = P(pr, l.u - 40 + i * 26, l.v + 10 + (i % 2) * 20); return <use key={i} href="#hv-boat" x={bx - 6} y={by - 9} width="12" height="10" />; })}{tier >= 1 && label(x, y - 18, l.n, 8, 0, { ital: true })}</g>;
        return null;
      })}
      {avLabels}
      {crossLabels}
      {/* Water and town names. */}
      {(() => { const [x, y] = P(pr, 3600, -beachWidth(3600) - 350); return label(x, y, 'ATLANTIC OCEAN', 13, ax, { color: mood === 'day' ? '#e9fbff' : '#9fc3d6', spacing: 0.6, ital: true }); })()}
      {(() => { const [x, y] = P(pr, 6900, 1350); return label(x, y, 'Grassy Sound', 10, ax, { ital: true, color: mood === 'day' ? '#1d5f63' : '#9fc3d6' }); })()}
      {(() => { const [x, y] = P(pr, U_NORTH + 260, 300); return label(x, y, 'Hereford Inlet', 10, 0, { ital: true, color: mood === 'day' ? '#1d5f63' : '#9fc3d6' }); })()}
      {(() => { const [x, y] = P(pr, CAUSEWAY.mainlandU, Math.min(CAUSEWAY.mainlandV, 2450)); return label(x, y, 'to RIO GRANDE ↓', 10, 0, { spacing: 0.3 }); })()}
      {(() => { const mid = CAUSEWAY.path?.[Math.floor((CAUSEWAY.path?.length ?? 0) / 3)] ?? [CAUSEWAY.u - 210, 1500]; const [x, y] = P(pr, mid[0] + 80, mid[1]); return tier >= 1 ? label(x, y, 'Rio Grande Ave causeway', 8, 0, { ital: true }) : null; })()}
      {(() => { const [x, y] = P(pr, -300, 300); return label(x, y, '↙ to Cape May', 9, 0, { ital: true }); })()}
      {(() => { const [x, y] = P(pr, (ww.u0 + ww.u1) / 2, (ww.v0 + ww.v1) / 2 + 60); return label(x, y, 'WEST WILDWOOD', 9, ax, { spacing: 0.25 }); })()}
      {sc < 0.5 && ([['WILDWOOD CREST', 'crest'], ['WILDWOOD', 'wildwood'], ['NORTH WILDWOOD', 'north']] as const).map(([t, k]) => { const [a, b] = TOWN_SPANS[k]; const u = (a + Math.min(b, U_NORTH - 300)) / 2; const [x, y] = P(pr, u, aveRuns('pa', u) ? aveV('pa', u) + 60 : 400); return label(x, y, t, 15, ax, { spacing: 0.35, weight: 800, color: mood === 'day' ? '#c2185b' : '#ff5fa2' }); })}
    </g>
  );
}


/** The arches over the pier entrances, with their names in neon (drawn over the buildings). */
export function PierArches({ pr, mood, tier, sc }: { pr: Proj; mood: Mood; tier: number; sc: number }) {
  if (tier < 1) return null;
  return (
    <g>
      {PIERS.map((p) => {
              // The arch over the pier's entrance, with its name in neon.
              const [ax, ay] = P(pr, p.u, boardwalkV(p.u) - BOARDWALK.w - 4);
              const hw = Math.min(26, p.w * 0.38);
              const neon = SIGN_HEX[p.sign];
              const fsz = Math.max(4.2, Math.min(9, 9 / sc));
              return (
                <g key={p.id} style={{ pointerEvents: 'none' }}>
                  <path d={`M${ax - hw} ${ay}V${ay - 16}M${ax + hw} ${ay}V${ay - 16}`} stroke={mood === 'day' ? '#fff7ea' : neon} strokeWidth="1.6" />
                  <rect x={ax - hw - 2} y={ay - 23} width={hw * 2 + 4} height="8" rx="3" fill={mood === 'day' ? '#fff7ea' : '#1b1030'} stroke={neon} strokeWidth={mood === 'day' ? 0.8 : 1.2} />
                  {mood !== 'day' && <rect x={ax - hw - 2} y={ay - 23} width={hw * 2 + 4} height="8" rx="3" fill="none" stroke={neon} strokeOpacity="0.35" strokeWidth="3" />}
                  <text x={ax} y={ay - 17} fontSize={Math.min(fsz, 6)} textAnchor="middle" fontWeight="800" fill={mood === 'day' ? neon : '#fff'} stroke={mood === 'day' ? '#2a1f2e' : neon} strokeWidth="0.3" paintOrder="stroke" letterSpacing="0.3">{p.name.toUpperCase()}</text>
                </g>
              );
      })}
    </g>
  );
}
