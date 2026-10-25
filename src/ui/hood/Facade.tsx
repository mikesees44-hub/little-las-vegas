import { useId } from 'react';
import type { BuildStyle } from '../../engine/design';
import { FONT } from './Buildings';
import { mix, type Mood } from './iso';

/**
 * The "street view": an original storefront facade, drawn as a vintage
 * postcard from what the record says — what the place is, its style (Doo
 * Wop, Deco, Tiki, Colonial, Mid-century, Seaside Victorian), its neon color,
 * its name on the sign, its condition and its decade. Renovate it and the
 * paint comes back; restyle it and the front changes; let it go and the
 * letters fall off the sign.
 */

export type FacadeKind = 'motel' | 'hotel' | 'shop' | 'food' | 'club' | 'house' | 'warehouse' | 'public' | 'ride' | 'wheel' | 'arcade' | 'minigolf' | 'stand' | 'vacant' | 'lease' | 'construction';

export interface FacadeSpec {
  kind: FacadeKind;
  name: string;
  style: BuildStyle;
  sign: string;
  condition: number;
  closed: boolean;
  mood: Mood;
  year: number;
  /** The era of its look (built or last fixed up). */
  lookYear: number;
  progress: number;
  boardwalk: boolean;
  address: string;
  seed: number;
}

const SIXTIES: Record<BuildStyle, string[]> = {
  doowop: ['#5fd3c4', '#ff8a73', '#ff9ec7', '#ffd86b', '#8ecae6'],
  deco: ['#fff1dc', '#ffd1dc', '#c8f0e0', '#f7e3b5'],
  tiki: ['#b97a45', '#a86b3a', '#c48a50'],
  colonial: ['#fbf6ee', '#f1ece2', '#e9f0f6'],
  midcentury: ['#e7f4ef', '#9fd8cb', '#f4e9d4'],
  victorian: ['#c3a6ff', '#ffd86b', '#7fc8c0', '#ffb3a7'],
};
const SEVENTIES = ['#c8794a', '#d8a24a', '#8a9a5b', '#b5651d', '#e8d3a9', '#a0522d'];

function hashStr(seed: number, i: number): number {
  const x = Math.sin(seed * 9.13 + i * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function Facade({ f }: { f: FacadeSpec }) {
  const uid = useId().replace(/:/g, '');
  const glowId = `sv-glow-${uid}`;
  const clipId = `sv-clip-${uid}`;
  const night = f.mood === 'night';
  const dusk = f.mood === 'dusk';
  const lit = (c: string) => (night ? mix(c, '#0d1630', 0.6) : dusk ? mix(c, '#6a3d78', 0.3) : c);
  const seventies = f.lookYear >= 1969 && (f.style === 'colonial' || f.style === 'midcentury' || f.style === 'tiki');
  const pal = seventies ? SEVENTIES : SIXTIES[f.style];
  const wear = Math.max(0, (60 - f.condition) / 60);
  const wall = lit(mix(pal[f.seed % pal.length], '#8d7f6c', wear * 0.5 + (f.closed ? 0.25 : 0)));
  const trim = lit(f.style === 'tiki' ? '#5a3a22' : f.style === 'colonial' ? '#ffffff' : f.style === 'victorian' ? '#fff7ea' : '#f6f1e6');
  const neonOn = !f.closed && f.kind !== 'vacant' && f.kind !== 'lease' && f.kind !== 'construction';
  const signFill = night || dusk ? (neonOn ? f.sign : '#4a4250') : f.sign;
  const font = FONT[f.style];
  const glass = f.closed ? lit('#5b5148') : night ? '#ffd27a' : dusk ? '#ffb870' : '#9fd4e6';
  const name = f.name.length > 26 ? `${f.name.slice(0, 25)}…` : f.name;
  // Letters fall off a sign nobody keeps up.
  const letters = name.split('').map((ch, i) => ({ ch, off: (f.condition < 45 || f.closed) && ch !== ' ' && hashStr(f.seed, i) < (f.closed ? 0.3 : 0.18) }));
  const W = 320;
  const ground = 150;

  const SignText = ({ x, y, size, maxW, anchor = 'middle', color = signFill }: { x: number; y: number; size: number; maxW: number; anchor?: 'middle' | 'start'; color?: string }) => {
    const fs = Math.min(size, (maxW * 1.75) / Math.max(4, name.length));
    return (
      <text x={x} y={y} fontSize={fs} textAnchor={anchor} fontFamily={font} fontWeight="700" fill={night || dusk ? (neonOn ? '#fff' : '#6b6256') : color}
        stroke={night || dusk ? color : '#2a1f2e'} strokeWidth={night || dusk ? fs * 0.06 : fs * 0.05} paintOrder="stroke" filter={(night || dusk) && neonOn ? `url(#${glowId})` : undefined} data-testid="sv-sign">
        {letters.map((l, i) => <tspan key={i} opacity={l.off ? 0.12 : 1}>{l.ch}</tspan>)}
      </text>
    );
  };

  const Windows = ({ x, y, w, h, cols, rows, gap = 6 }: { x: number; y: number; w: number; h: number; cols: number; rows: number; gap?: number }) => {
    const cw = (w - gap * (cols + 1)) / cols;
    const rh = (h - gap * (rows + 1)) / rows;
    const out: JSX.Element[] = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const on = !f.closed && (night || dusk ? hashStr(f.seed, r * 10 + c) > 0.3 : true);
      out.push(<rect key={`${r}-${c}`} x={x + gap + c * (cw + gap)} y={y + gap + r * (rh + gap)} width={cw} height={rh} fill={on ? glass : lit('#3d3a48')} stroke={trim} strokeWidth="1" />);
      if (f.closed) out.push(<path key={`b${r}-${c}`} d={`M${x + gap + c * (cw + gap)} ${y + gap + r * (rh + gap)}l${cw} ${rh}M${x + gap + c * (cw + gap) + cw} ${y + gap + r * (rh + gap)}l${-cw} ${rh}`} stroke={lit('#a07a4a')} strokeWidth="2.2" />);
    }
    return <>{out}</>;
  };

  const Awning = ({ x, y, w }: { x: number; y: number; w: number }) => {
    const n = Math.round(w / 12);
    const a = lit('#ffffff');
    const b = lit(f.seed % 2 ? '#ff6f91' : '#3cc6c0');
    return <g>{Array.from({ length: n }, (_, i) => <path key={i} d={`M${x + (w / n) * i} ${y}h${w / n}l2 12h${-w / n}z`} fill={i % 2 ? a : b} />)}<path d={Array.from({ length: n }, (_, i) => `M${x + 2 + (w / n) * i} ${y + 12}q${w / n / 2} 5 ${w / n} 0`).join('')} fill={i2(a, b, f.seed)} stroke="none" /></g>;
  };

  const Star = ({ x, y, r, c }: { x: number; y: number; r: number; c: string }) => {
    let d = '';
    for (let i = 0; i < 16; i++) { const an = (i / 16) * Math.PI * 2; const rr = i % 2 ? r * 0.35 : r; d += `${i ? 'L' : 'M'}${(x + Math.cos(an) * rr).toFixed(1)},${(y + Math.sin(an) * rr).toFixed(1)}`; }
    return <path d={`${d}Z`} fill={c} filter={(night || dusk) && neonOn ? `url(#${glowId})` : undefined} />;
  };

  const Palm = ({ x, s = 1 }: { x: number; s?: number }) => (
    <g transform={`translate(${x} ${ground}) scale(${s})`}>
      <path d="M0 0Q4 -30 1 -58" stroke={lit('#8a5a32')} strokeWidth="4" fill="none" />
      <path d="M1 -58Q-18 -64 -26 -46M1 -58Q18 -66 26 -48M1 -58Q-10 -74 -20 -70M1 -58Q12 -76 22 -70M1 -58Q0 -72 3 -76" stroke={lit('#2f9e5b')} strokeWidth="5" fill="none" strokeLinecap="round" />
    </g>
  );

  const body: JSX.Element[] = [];
  const k = f.kind;
  if (k === 'vacant') {
    body.push(<rect key="lot" x="20" y={ground - 6} width="280" height="10" fill={lit('#e9d3a1')} />);
    body.push(<path key="fence" d={Array.from({ length: 15 }, (_, i) => `M${30 + i * 18} ${ground}v-26`).join('') + `M30 ${ground - 22}h252M30 ${ground - 8}h252`} stroke={lit('#9a8f7a')} strokeWidth="1.5" />);
    body.push(<g key="sale"><path d={`M210 ${ground}v-46`} stroke={lit('#6b4a2a')} strokeWidth="3" /><rect x="170" y={ground - 78} width="80" height="36" fill={lit('#fffaf0')} stroke="#c0392b" strokeWidth="2" /><text x="210" y={ground - 62} textAnchor="middle" fontSize="13" fontWeight="800" fill="#c0392b" fontFamily="Georgia, serif">FOR SALE</text><text x="210" y={ground - 49} textAnchor="middle" fontSize="7" fill="#2a1f2e">Inquire at City Hall</text></g>);
    body.push(<path key="gull" d="M90 50q6 -6 12 0q6 -6 12 0" stroke={lit('#3a3a3a')} strokeWidth="1.6" fill="none" />);
  } else if (k === 'construction') {
    const top = ground - 30 - 70 * f.progress;
    body.push(<rect key="walls" x="60" y={Math.max(top + 20, ground - 50)} width="200" height={ground - Math.max(top + 20, ground - 50)} fill={lit('#e8dcc4')} />);
    body.push(<path key="scaf" d={`${Array.from({ length: 6 }, (_, i) => `M${60 + i * 40} ${ground}V${top}`).join('')}${Array.from({ length: 4 }, (_, i) => `M56 ${ground - i * 22 - 10}H264`).join('')}`} stroke={lit('#c08a4a')} strokeWidth="2.4" />);
    body.push(<g key="crane" className="hv-crane"><path d={`M285 ${ground}V18M240 18H300M250 18v40`} stroke={lit('#f2b632')} strokeWidth="3.5" fill="none" /><rect x="244" y="58" width="12" height="8" fill={lit('#5b4a3a')} /></g>);
    body.push(<g key="soon"><rect x="40" y={ground - 44} width="110" height="30" fill={lit('#fffaf0')} stroke={f.sign} strokeWidth="2" /><text x="95" y={ground - 32} textAnchor="middle" fontSize="8" fontWeight="800" fill="#2a1f2e">COMING SOON</text><text x="95" y={ground - 20} textAnchor="middle" fontSize="8" fill="#c0392b" fontFamily={font}>{name.slice(0, 22)}</text></g>);
  } else if (k === 'motel') {
    const x0 = 34;
    const w = 252;
    body.push(<rect key="b" x={x0} y="62" width={w} height={ground - 62} fill={wall} />);
    body.push(<rect key="rail" x={x0} y="100" width={w} height="4" fill={trim} />);
    body.push(<path key="posts" d={Array.from({ length: 10 }, (_, i) => `M${x0 + 4 + i * 27.5} 104V${ground}`).join('')} stroke={trim} strokeWidth="2" />);
    for (let row = 0; row < 2; row++) for (let i = 0; i < 8; i++) {
      const dx = x0 + 12 + i * 30;
      const dy = row ? 112 : 70;
      body.push(<rect key={`d${row}${i}`} x={dx} y={dy} width="11" height="24" fill={lit(['#ff6f91', '#3cc6c0', '#ffd34d'][(i + row) % 3])} stroke={trim} />);
      body.push(<rect key={`w${row}${i}`} x={dx + 14} y={dy + 4} width="11" height="10" fill={f.closed ? lit('#5b5148') : (night || dusk) && hashStr(f.seed, i + row * 8) > 0.4 ? '#ffd27a' : lit('#9fd4e6')} stroke={trim} />);
    }
    if (f.style === 'tiki' || f.style === 'colonial' || f.style === 'victorian') body.push(<path key="roof" d={`M${x0 - 10} 64L${W / 2} ${f.style === 'tiki' ? 18 : 36}L${x0 + w + 10} 64Z`} fill={lit(f.style === 'tiki' ? '#d8b06a' : f.style === 'colonial' ? '#8a4a3a' : '#4f5d75')} />);
    else body.push(<path key="roof" d={`M${x0 - 8} 62L${x0 + w + 14} 50L${x0 + w + 14} 58L${x0 - 8} 66Z`} fill={lit(f.style === 'doowop' ? (f.seed % 2 ? '#ff6f91' : '#2fb5a8') : '#3d4650')} />);
    // The pylon sign.
    body.push(<g key="pylon"><rect x="10" y="20" width="6" height={ground - 20} fill={lit('#d8d2c4')} />
      <rect x="-4" y="14" width="96" height="40" rx="8" fill={night || dusk ? '#1b1030' : lit('#fff7ea')} stroke={f.sign} strokeWidth="3" filter={(night || dusk) && neonOn ? `url(#${glowId})` : undefined} />
      <SignText x={44} y={40} size={16} maxW={88} />
      {f.style === 'doowop' && <Star x={94} y={12} r={13} c={night || dusk ? f.sign : '#ffd34d'} />}
      <rect x="2" y="58" width="58" height="14" rx="3" fill={night || dusk ? '#1b1030' : '#fff7ea'} stroke="#ff4b3e" strokeWidth="1.5" />
      <text x="31" y="68.5" textAnchor="middle" fontSize="9" fontWeight="800" fill={f.closed ? '#6b6256' : '#ff4b3e'} filter={(night || dusk) && neonOn ? `url(#${glowId})` : undefined}>{f.closed ? 'NO VACANCY' : 'VACANCY'}</text>
      <text x="31" y="82" textAnchor="middle" fontSize="6.5" fontWeight="700" fill={night ? '#9fe8ff' : '#1d6f8a'}>POOL · TV · AIR COND.</text>
    </g>);
    body.push(<Palm key="p1" x={300} s={0.9} />);
  } else if (k === 'hotel') {
    const x0 = 80;
    const w = 160;
    body.push(<rect key="b" x={x0} y="26" width={w} height={ground - 26} fill={wall} />);
    body.push(<Windows key="w" x={x0} y={34} w={w} h={ground - 64} cols={6} rows={6} gap={5} />);
    if (f.style === 'deco') body.push(<path key="fin" d={`M${W / 2 - 14} 26V10H${W / 2 + 14}V26Z`} fill={lit(mix(wall, '#ffffff', 0.2))} />);
    body.push(<rect key="ent" x={W / 2 - 22} y={ground - 26} width="44" height="26" fill={glass} stroke={trim} strokeWidth="2" />);
    body.push(<path key="can" d={`M${W / 2 - 36} ${ground - 30}h72l-6 -8h-60z`} fill={lit('#2a1f2e')} />);
    body.push(<SignText key="s" x={W / 2} y={22} size={18} maxW={190} />);
    body.push(<Palm key="p1" x={46} />);
    body.push(<Palm key="p2" x={276} s={0.85} />);
  } else if (k === 'club') {
    const x0 = 70;
    const w = 180;
    body.push(<rect key="b" x={x0} y="46" width={w} height={ground - 46} fill={f.style === 'deco' ? wall : lit(mix(wall, '#2a1f2e', 0.35))} />);
    if (f.style === 'tiki') body.push(<path key="roof" d={`M${x0 - 14} 50L${W / 2} 4L${x0 + w + 14} 50Z`} fill={lit('#d8b06a')} />);
    body.push(<rect key="marq" x={x0 - 10} y="92" width={w + 20} height="16" fill={night || dusk ? f.sign : '#2a1f2e'} filter={(night || dusk) && neonOn ? `url(#${glowId})` : undefined} />);
    body.push(<path key="bulbs" d={Array.from({ length: 24 }, (_, i) => `M${x0 - 6 + i * ((w + 12) / 23)} 89h0.01`).join('') + Array.from({ length: 24 }, (_, i) => `M${x0 - 6 + i * ((w + 12) / 23)} 111h0.01`).join('')} stroke={neonOn ? '#fff3b0' : '#6b6256'} strokeWidth="4" strokeLinecap="round" className={(night || dusk) && neonOn ? 'hv-chase' : undefined} />);
    body.push(<text key="tonight" x={W / 2} y="104" textAnchor="middle" fontSize="9" fontWeight="800" fill={night || dusk ? '#1b1030' : '#fff3b0'}>{f.closed ? 'CLOSED' : 'TONIGHT · DANCING · COCKTAILS'}</text>);
    body.push(<rect key="door" x={W / 2 - 14} y={ground - 40} width="28" height="40" fill={lit('#5a1f2e')} stroke={trim} strokeWidth="2" />);
    body.push(<path key="rope" d={`M${W / 2 - 40} ${ground - 8}q12 8 24 0M${W / 2 + 16} ${ground - 8}q12 8 24 0`} stroke="#b0303a" strokeWidth="2.5" fill="none" />);
    body.push(<rect key="blade" x={x0 + 8} y="50" width="40" height="40" rx="4" fill={night || dusk ? '#1b1030' : '#fff7ea'} stroke={f.sign} strokeWidth="2" />);
    body.push(<SignText key="s" x={W / 2 + 30} y={78} size={20} maxW={150} />);
  } else if (k === 'house') {
    const x0 = 80;
    const w = 160;
    body.push(<rect key="b" x={x0} y="66" width={w} height={ground - 66} fill={wall} />);
    body.push(<path key="roof" d={`M${x0 - 12} 68L${W / 2} 22L${x0 + w + 12} 68Z`} fill={lit(f.style === 'victorian' ? '#4f5d75' : '#8a4a3a')} />);
    if (f.style === 'victorian') body.push(<path key="ging" d={Array.from({ length: 16 }, (_, i) => `M${x0 + i * 10} 110q5 6 10 0`).join('')} stroke={trim} strokeWidth="2" fill="none" />);
    body.push(<rect key="porch" x={x0 - 6} y="108" width={w + 12} height="5" fill={trim} />);
    body.push(<path key="posts" d={Array.from({ length: 6 }, (_, i) => `M${x0 + i * 32} 113V${ground}`).join('')} stroke={trim} strokeWidth="3" />);
    body.push(<Windows key="w" x={x0 + 10} y={72} w={w - 20} h={34} cols={4} rows={1} />);
    body.push(<rect key="door" x={W / 2 - 10} y={ground - 32} width="20" height="32" fill={lit('#5a3a22')} />);
    body.push(<rect key="sb" x={W / 2 - 44} y={118} width="88" height="14" fill={lit('#fff7ea')} stroke={f.sign} strokeWidth="1.5" />);
    body.push(<SignText key="s" x={W / 2} y={129} size={10} maxW={82} />);
  } else if (k === 'warehouse') {
    body.push(<path key="b" d={`M40 ${ground}V70Q160 40 280 70V${ground}Z`} fill={wall} />);
    body.push(<path key="cor" d={Array.from({ length: 30 }, (_, i) => `M${44 + i * 8} 70V${ground}`).join('')} stroke={lit(mix(wall, '#000000', 0.15))} strokeWidth="1.5" />);
    body.push(<rect key="door" x="120" y={ground - 50} width="80" height="50" fill={lit('#5b6670')} />);
    body.push(<SignText key="s" x={W / 2} y={86} size={16} maxW={200} color={f.sign} />);
  } else if (k === 'public') {
    body.push(<rect key="b" x="40" y="58" width="240" height={ground - 58} fill={wall} />);
    body.push(<path key="ped" d="M30 60L160 26L290 60Z" fill={lit(mix(wall, '#ffffff', 0.3))} stroke={trim} />);
    body.push(<path key="cols" d={Array.from({ length: 8 }, (_, i) => `M${58 + i * 29} 64V${ground}`).join('')} stroke={trim} strokeWidth="6" />);
    body.push(<path key="flag" d="M160 26V4" stroke={lit('#6b6256')} strokeWidth="1.5" />);
    body.push(<path key="fl" d="M160 4h18v10h-18z" fill="#c0392b" />);
    body.push(<SignText key="s" x={W / 2} y={52} size={14} maxW={160} color={f.sign} />);
  } else if (k === 'wheel' || k === 'ride') {
    if (k === 'wheel') {
      body.push(<g key="wh"><path d="M120 150L160 70L200 150" stroke={lit('#d8d2c4')} strokeWidth="4" fill="none" />
        <g className="hv-spin"><circle cx="160" cy="70" r="58" fill="none" stroke={night || dusk ? f.sign : '#f4f1e8'} strokeWidth="4" />
          <path d={Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return `M160 70L${160 + Math.cos(a) * 58} ${70 + Math.sin(a) * 58}`; }).join('')} stroke={night || dusk ? f.sign : '#d8d2c4'} strokeWidth="1.5" />
          {Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return <circle key={i} cx={160 + Math.cos(a) * 58} cy={70 + Math.sin(a) * 58} r="6" fill={['#ff6f91', '#3cc6c0', '#ffd34d', '#c3a6ff'][i % 4]} />; })}</g></g>);
    } else {
      body.push(<g key="co"><path d={`M20 ${ground}L60 40L100 120L140 60L190 130L230 70L300 ${ground}`} stroke={night || dusk ? f.sign : '#c0392b'} strokeWidth="5" fill="none" />
        <path d={Array.from({ length: 28 }, (_, i) => `M${20 + i * 10} ${ground}V${Math.min(ground, 50 + Math.abs(Math.sin(i / 3)) * 80)}`).join('')} stroke={lit('#e9dcc0')} strokeWidth="1.5" /></g>);
    }
    body.push(<g key="gate"><path d={`M70 ${ground}V100Q160 70 250 100V${ground}`} fill="none" stroke={lit('#fff7ea')} strokeWidth="8" /><SignText x={W / 2} y={98} size={18} maxW={160} /></g>);
  } else if (k === 'minigolf') {
    body.push(<rect key="g" x="20" y={ground - 26} width="280" height="26" fill={lit('#58b368')} />);
    body.push(<g key="mill"><path d="M200 150L210 70H226L236 150Z" fill={lit('#ff8a73')} /><g className="hv-spin"><path d="M218 70l-40 -30M218 70l40 30M218 70l30 -40M218 70l-30 40" stroke={lit('#fff7ea')} strokeWidth="6" /></g></g>);
    body.push(<path key="volc" d="M60 150L100 90H116L156 150Z" fill={lit('#a0522d')} />);
    body.push(<rect key="sb" x="40" y="30" width="140" height="34" rx="6" fill={night || dusk ? '#1b1030' : '#fff7ea'} stroke={f.sign} strokeWidth="2.5" />);
    body.push(<SignText key="s" x={110} y={53} size={14} maxW={130} />);
  } else {
    // Shops, food, arcades, stands: a storefront.
    const x0 = k === 'stand' ? 90 : 60;
    const w = k === 'stand' ? 140 : 200;
    const top = 70;
    if (f.style === 'tiki') body.push(<path key="roof" d={`M${x0 - 16} ${top + 4}L${x0 + w / 2} ${top - 46}L${x0 + w + 16} ${top + 4}Z`} fill={lit('#d8b06a')} />);
    if (f.style === 'victorian' || f.style === 'colonial') body.push(<path key="roof" d={`M${x0 - 10} ${top + 2}L${x0 + w / 2} ${top - 30}L${x0 + w + 10} ${top + 2}Z`} fill={lit(f.style === 'colonial' ? '#8a4a3a' : '#4f5d75')} />);
    if (f.style === 'deco') body.push(<path key="step" d={`M${x0 + w / 2 - 40} ${top}V${top - 14}H${x0 + w / 2 - 20}V${top - 26}H${x0 + w / 2 + 20}V${top - 14}H${x0 + w / 2 + 40}V${top}Z`} fill={lit(mix(wall, '#ffffff', 0.25))} />);
    if (f.style === 'doowop') body.push(<path key="boom" d={`M${x0 - 10} ${top + 4}L${x0 + w + 24} ${top - 18}L${x0 + w + 24} ${top - 8}L${x0 - 10} ${top + 12}Z`} fill={lit(f.seed % 2 ? '#ff6f91' : '#2fb5a8')} />);
    body.push(<rect key="b" x={x0} y={top} width={w} height={ground - top} fill={wall} />);
    if (f.style === 'midcentury') body.push(<rect key="stone" x={x0 + w - 30} y={top} width="30" height={ground - top} fill={lit('#b9ada0')} />);
    body.push(<rect key="band" x={x0 + 6} y={top + 6} width={w - 12} height="24" rx="3" fill={night || dusk ? '#1b1030' : lit('#fff7ea')} stroke={f.sign} strokeWidth="2" />);
    body.push(<SignText key="s" x={x0 + w / 2} y={top + 24} size={17} maxW={w - 24} />);
    if (k !== 'arcade') body.push(<Awning key="aw" x={x0 - 4} y={top + 34} w={w + 8} />);
    if (k === 'arcade') {
      body.push(<path key="arch" d={`M${x0 + 20} ${ground}V${top + 64}Q${x0 + w / 2} ${top + 34} ${x0 + w - 20} ${top + 64}V${ground}Z`} fill={night || dusk ? '#ffcf6e' : '#3a2c3e'} />);
      body.push(<path key="bulbs" d={Array.from({ length: 16 }, (_, i) => { const t = i / 15; const x = x0 + 20 + (w - 40) * t; const y = top + 64 - Math.sin(t * Math.PI) * 26; return `M${x} ${y}h0.01`; }).join('')} stroke={neonOn ? '#fff3b0' : '#6b6256'} strokeWidth="5" strokeLinecap="round" className={(night || dusk) && neonOn ? 'hv-chase' : undefined} />);
      body.push(<text key="t" x={x0 + w / 2} y={ground - 10} textAnchor="middle" fontSize="9" fontWeight="800" fill={night || dusk ? '#2a1f2e' : '#fff3b0'}>SKEE-BALL · PINBALL · PRIZES</text>);
    } else {
      body.push(<rect key="win" x={x0 + 10} y={top + 52} width={w / 2 - 26} height={ground - top - 60} fill={glass} stroke={trim} strokeWidth="2" />);
      body.push(<rect key="win2" x={x0 + w / 2 + 16} y={top + 52} width={w / 2 - 26} height={ground - top - 60} fill={glass} stroke={trim} strokeWidth="2" />);
      body.push(<rect key="door" x={x0 + w / 2 - 12} y={top + 50} width="24" height={ground - top - 50} fill={lit('#5a3a22')} stroke={trim} strokeWidth="2" />);
      if (f.closed || k === 'lease') body.push(<g key="c"><rect x={x0 + 16} y={top + 62} width="60" height="16" fill="#fffaf0" stroke="#c0392b" /><text x={x0 + 46} y={top + 73} textAnchor="middle" fontSize="8" fontWeight="800" fill="#c0392b">{k === 'lease' ? 'FOR RENT' : 'CLOSED'}</text></g>);
      if (k === 'food' && !f.closed) body.push(<g key="cone"><path d={`M${x0 + w + 18} ${top + 48}l8 26l8 -26z`} fill={lit('#d9893b')} /><circle cx={x0 + w + 26} cy={top + 44} r="9" fill={lit('#ffd1dc')} /></g>);
    }
    if (f.style === 'tiki') for (const x of [x0 - 8, x0 + w + 8]) body.push(<g key={`t${x}`}><path d={`M${x} ${ground}V${top + 20}`} stroke="#5a3a22" strokeWidth="3" /><path d={`M${x} ${top + 20}q-5 -7 0 -14q5 7 0 14z`} fill="#ff8a3c" className="hv-flicker" /></g>);
    if (f.style === 'doowop' && k !== 'stand') body.push(<Star key="star" x={x0 + w + 20} y={top - 24} r={14} c={night || dusk ? f.sign : '#ffd34d'} />);
    if (f.style === 'doowop' || f.style === 'tiki') body.push(<Palm key="p" x={30} s={0.85} />);
  }
  // Wear: stains on a building nobody keeps up.
  const stains = wear > 0.15 && k !== 'vacant' ? Array.from({ length: Math.round(wear * 8) }, (_, i) => <ellipse key={i} cx={60 + hashStr(f.seed, i + 30) * 200} cy={70 + hashStr(f.seed, i + 60) * 70} rx={6 + hashStr(f.seed, i) * 10} ry={3 + hashStr(f.seed, i + 5) * 6} fill="#5b4a3a" opacity={0.12 + wear * 0.12} />) : null;

  const sky = night ? ['#0b1430', '#26305a'] : dusk ? ['#4b2b6a', '#ff9a6b'] : ['#8fd3f4', '#fdf6e3'];
  const yr = f.year;
  return (
    <svg viewBox="0 0 320 210" className="w-full h-auto block" role="img" aria-label={`${f.name}: street view`} data-testid="street-view">
      <defs>
        <linearGradient id={`${glowId}-sky`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={sky[0]} /><stop offset="1" stopColor={sky[1]} /></linearGradient>
        <filter id={glowId} x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="2.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        <clipPath id={clipId}><rect x="10" y="10" width="300" height="160" rx="6" /></clipPath>
      </defs>
      <rect x="0" y="0" width="320" height="210" rx="10" fill="#fbf3e0" />
      <rect x="4" y="4" width="312" height="202" rx="8" fill="none" stroke="#e2c99a" strokeWidth="1" strokeDasharray="3 3" />
      <g clipPath={`url(#${clipId})`}>
        <rect x="10" y="10" width="300" height="160" fill={`url(#${glowId}-sky)`} />
        {!night && !dusk && <><circle cx="268" cy="34" r="12" fill="#ffe27a" /><path d="M40 40q8 -10 18 -2q8 -6 14 2q8 0 6 6h-40q-6 -4 2 -6z" fill="#ffffff" opacity="0.9" /></>}
        {dusk && <circle cx="250" cy="120" r="22" fill="#ffcf6e" opacity="0.8" />}
        {night && <><circle cx="262" cy="32" r="9" fill="#fff7d6" /><circle cx="266" cy="29" r="8" fill="#0b1430" />{Array.from({ length: 18 }, (_, i) => <circle key={i} cx={14 + hashStr(7, i) * 292} cy={14 + hashStr(9, i) * 50} r="0.9" fill="#fff" opacity="0.8" />)}</>}
        {body}
        {stains}
        {/* The street, or the planks. */}
        {f.boardwalk ? (
          <g><rect x="10" y={ground} width="300" height="20" fill={lit('#c79a5c')} /><path d={Array.from({ length: 30 }, (_, i) => `M${10 + i * 11} ${ground}l${(i - 15) * 1.2} 20`).join('')} stroke={lit('#a97c42')} strokeWidth="1" /></g>
        ) : (
          <g><rect x="10" y={ground} width="300" height="6" fill={lit('#d9d3c7')} /><rect x="10" y={ground + 6} width="300" height="14" fill={lit('#6f6b66')} /><path d="M20 163h20M60 163h20M100 163h20M140 163h20M180 163h20M220 163h20M260 163h20" stroke={lit('#f3eee0')} strokeWidth="1.2" /></g>
        )}
        {f.mood !== 'day' && <rect x="10" y="10" width="300" height="160" fill="#0b1430" opacity={night ? 0.08 : 0.04} />}
      </g>
      <text x="16" y="186" fontSize="12" fontFamily="'Brush Script MT', 'Segoe Script', cursive" fill="#c2185b">Greetings from Wildwood-by-the-Sea</text>
      <text x="16" y="199" fontSize="7.5" fill="#6b5a46">{f.address}</text>
      <text x="304" y="199" fontSize="7.5" fill="#6b5a46" textAnchor="end">{yr}</text>
      <g transform="translate(282 176)"><rect width="22" height="14" fill="#fff" stroke="#c2185b" strokeDasharray="1.5 1" /><text x="11" y="10" fontSize="7" textAnchor="middle" fill="#c2185b">3¢</text></g>
    </svg>
  );
}

function i2(a: string, b: string, seed: number): string {
  return seed % 2 ? a : b;
}
