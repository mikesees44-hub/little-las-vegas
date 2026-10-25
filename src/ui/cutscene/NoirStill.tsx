import type { ReactNode } from 'react';
import { CADILLAC, Man, Woman } from './figures';

/**
 * Code-drawn noir stills, one composition per cutscene key. Wildwood and South
 * Jersey, 1960: wet boardwalks under neon, a Cadillac under a sodium lamp, a
 * barbershop at dawn, a church full of lilies, a wedding band, a back room in
 * smoke. Black-and-white with one accent colour each, hard light, silhouettes,
 * film grain. A small animated element in each (rain, neon flicker, drifting
 * smoke, a candle) that stops under prefers-reduced-motion. Nothing graphic:
 * violence is told by shadows and what is left behind.
 *
 * Pure SVG, no assets. `seed` varies the details.
 */

const INK = '#07070a';
const LIGHT = '#e9e1cf';

function rng(seed: number) {
  let x = seed % 2147483647 || 1;
  if (x < 0) x += 2147483646;
  return () => (x = (x * 48271) % 2147483647) / 2147483647;
}

const f = (n: number) => Math.round(n * 10) / 10;

interface Ctx {
  r: () => number;
  id: (k: string) => string;
  u: (k: string) => string;
}

/* ---------------- building blocks ---------------- */

function Rain({ c, n = 90, op = 0.22, len = 26, slant = 7, area = [0, 0, 800, 460] }: { c: Ctx; n?: number; op?: number; len?: number; slant?: number; area?: [number, number, number, number] }) {
  const [x0, y0, w, h] = area;
  const d: string[] = [];
  for (let i = 0; i < n; i++) {
    const x = x0 + c.r() * (w + 40);
    const y = y0 - 60 + c.r() * (h + 60);
    const l = len * (0.6 + c.r() * 0.8);
    d.push(`M${f(x)},${f(y)}l${f(-slant * (l / len))},${f(l)}`);
  }
  return (
    <g className="ns-rain">
      <path d={d.join('')} stroke={LIGHT} strokeOpacity={op} strokeWidth={1.1} strokeLinecap="round" />
    </g>
  );
}

function Splashes({ c, y0, y1, n = 26, x0 = 0, x1 = 800 }: { c: Ctx; y0: number; y1: number; n?: number; x0?: number; x1?: number }) {
  const d: string[] = [];
  for (let i = 0; i < n; i++) {
    const x = x0 + c.r() * (x1 - x0);
    const y = y0 + c.r() * (y1 - y0);
    const w = 3 + c.r() * 5;
    d.push(`M${f(x - w)},${f(y)}q${f(w)},-3 ${f(w * 2)},0`);
  }
  return <path className="ns-flicker-slow" d={d.join('')} stroke={LIGHT} strokeOpacity={0.25} strokeWidth={0.8} fill="none" />;
}

function Cone({ c, x, y, w0 = 10, w1 = 160, y1 = 430, grad = 'cone', op = 1 }: { c: Ctx; x: number; y: number; w0?: number; w1?: number; y1?: number; grad?: string; op?: number }) {
  return <path d={`M${x - w0},${y} L${x - w1},${y1} L${x + w1},${y1} L${x + w0},${y} Z`} fill={c.u(grad)} opacity={op} />;
}

function Glow({ c, x, y, rx, ry, op = 0.5, grad = 'glow' }: { c: Ctx; x: number; y: number; rx: number; ry?: number; op?: number; grad?: string }) {
  return <ellipse cx={x} cy={y} rx={rx} ry={ry ?? rx} fill={c.u(grad)} opacity={op} />;
}

function Smoke({ c, x, y, w = 300, n = 5, op = 0.16, cls = 'ns-smoke' }: { c: Ctx; x: number; y: number; w?: number; n?: number; op?: number; cls?: string }) {
  return (
    <g className={cls} filter={c.u('soft')} opacity={op}>
      {Array.from({ length: n }, (_, i) => {
        const cx = x - w / 2 + c.r() * w;
        const cy = y + (c.r() - 0.5) * 60;
        return <path key={i} d={`M${f(cx - 80)},${f(cy)} q40,-${f(20 + c.r() * 25)} 80,-4 t80,6 t70,-10`} stroke={LIGHT} strokeWidth={14 + c.r() * 16} fill="none" strokeLinecap="round" />;
      })}
    </g>
  );
}

function Blinds({ x, y, w, h, n = 9, op = 0.5, skew = 0, color = LIGHT }: { x: number; y: number; w: number; h: number; n?: number; op?: number; skew?: number; color?: string }) {
  const d: string[] = [];
  const step = h / n;
  for (let i = 0; i < n; i++) {
    const yy = y + i * step;
    d.push(`M${x},${f(yy)} L${x + w},${f(yy + skew)} L${x + w},${f(yy + skew + step * 0.55)} L${x},${f(yy + step * 0.55)}Z`);
  }
  return <path d={d.join('')} fill={color} opacity={op} />;
}

function Neon({ c, x, y, text, color, size = 34, flicker = true, font = "'Brush Script MT','Snell Roundhand',cursive", rot = 0 }: { c: Ctx; x: number; y: number; text: string; color: string; size?: number; flicker?: boolean; font?: string; rot?: number }) {
  return (
    <g className={flicker ? 'ns-flicker' : undefined} transform={rot ? `rotate(${rot} ${x} ${y})` : undefined}>
      <text x={x} y={y} fontSize={size} fontFamily={font} fill="none" stroke={color} strokeWidth={6} opacity={0.35} textAnchor="middle" filter={c.u('glow')}>{text}</text>
      <text x={x} y={y} fontSize={size} fontFamily={font} fill="#fff4f4" stroke={color} strokeWidth={1.4} textAnchor="middle">{text}</text>
    </g>
  );
}

function Flame({ c, x, y, s = 1 }: { c: Ctx; x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx={0} cy={-8} rx={34} ry={40} fill={c.u('warm')} opacity={0.55} />
      <g className="ns-flame">
        <path d="M0,-26 C6,-16 7,-8 0,0 C-7,-8 -6,-16 0,-26Z" fill="#ffd27a" />
        <path d="M0,-17 C3,-11 3,-6 0,-2 C-3,-6 -3,-11 0,-17Z" fill="#fffbe8" />
      </g>
      <rect x={-0.6} y={-3} width={1.2} height={4} fill="#1a1208" />
    </g>
  );
}

function Lamp({ c, x, top = 90, ground = 420, arm = 34 }: { c: Ctx; x: number; top?: number; ground?: number; arm?: number }) {
  const hx = x + arm;
  return (
    <g>
      <Cone c={c} x={hx} y={top + 16} w0={14} w1={175} y1={ground + 4} />
      <Glow c={c} x={hx} y={ground - 2} rx={190} ry={30} op={0.55} grad="sodium" />
      <path d={`M${x - 3},${ground} L${x - 3},${top + 6} Q${x - 2},${top - 6} ${x + 12},${top - 4} L${hx},${top + 4}`} stroke={INK} strokeWidth={6} fill="none" />
      <path d={`M${hx - 16},${top + 4} L${hx + 16},${top + 4} L${hx + 9},${top + 14} L${hx - 9},${top + 14}Z`} fill={INK} />
      <ellipse cx={hx} cy={top + 15} rx={9} ry={3} fill="#fff2c8" />
      <Glow c={c} x={hx} y={top + 16} rx={40} op={0.8} grad="sodium" />
      <rect x={x - 7} y={ground - 22} width={8} height={22} fill={INK} />
    </g>
  );
}

function WetGround({ y, color = '#0d0e12' }: { y: number; color?: string }) {
  return <rect x={0} y={y} width={800} height={460 - y} fill={color} />;
}

/** Vertical smeared reflection of a light source on wet ground. */
function Reflection({ c, x, y, w = 30, h = 60, color = 'sodium', op = 0.6 }: { c: Ctx; x: number; y: number; w?: number; h?: number; color?: string; op?: number }) {
  return <ellipse cx={x} cy={y + h / 2} rx={w / 2} ry={h / 2} fill={c.u(color)} opacity={op} />;
}

function FerrisWheel({ x, y, r, op = 0.5, lights = true }: { x: number; y: number; r: number; op?: number; lights?: boolean }) {
  const spokes: string[] = [];
  const bulbs: ReactNode[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    spokes.push(`M${x},${y}L${f(x + Math.cos(a) * r)},${f(y + Math.sin(a) * r)}`);
    if (lights) bulbs.push(<circle key={i} cx={f(x + Math.cos(a) * r)} cy={f(y + Math.sin(a) * r)} r={2.2} fill="#ffe7b0" />);
  }
  return (
    <g opacity={op}>
      <circle cx={x} cy={y} r={r} fill="none" stroke={INK} strokeWidth={3} />
      <circle cx={x} cy={y} r={r * 0.62} fill="none" stroke={INK} strokeWidth={1.5} />
      <path d={spokes.join('')} stroke={INK} strokeWidth={1.2} />
      <path d={`M${x},${y} L${x - r * 0.55},${y + r + 40} M${x},${y} L${x + r * 0.55},${y + r + 40}`} stroke={INK} strokeWidth={4} />
      {bulbs}
    </g>
  );
}

function StainedWindow({ c, x, y, w, h }: { c: Ctx; x: number; y: number; w: number; h: number }) {
  const arch = `M${x},${y + h} L${x},${y + w / 2} A${w / 2},${w / 2} 0 0 1 ${x + w},${y + w / 2} L${x + w},${y + h} Z`;
  const panes: ReactNode[] = [];
  const cols = ['#c8a050', '#8a2a2a', '#d8c890', '#4a5a7a', '#b07a3a'];
  for (let i = 0; i < 18; i++) {
    const px = x + 6 + c.r() * (w - 18);
    const py = y + w / 3 + c.r() * (h - w / 3 - 14);
    panes.push(<rect key={i} x={f(px)} y={f(py)} width={f(6 + c.r() * 10)} height={f(8 + c.r() * 14)} fill={cols[i % cols.length]} opacity={0.55} />);
  }
  return (
    <g>
      <path d={arch} fill="#e8d6a8" opacity={0.85} />
      {panes}
      <path d={`${arch} M${x + w / 2},${y} V${y + h} M${x},${y + h * 0.55} H${x + w} M${x},${y + h * 0.8} H${x + w}`} fill="none" stroke={INK} strokeWidth={3} />
      <path d={`M${x + w / 2 - 6},${y + w * 0.45} h12 M${x + w / 2},${y + w * 0.36} v22`} stroke={INK} strokeWidth={3} />
    </g>
  );
}

function Lily({ x, y, s = 1, flip = false }: { x: number; y: number; s?: number; flip?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
      <path d="M0,0 Q4,-20 2,-40" stroke="#2a3020" strokeWidth={2} fill="none" />
      <path d="M2,-40 C-10,-46 -16,-56 -12,-62 C-6,-54 0,-50 2,-46 C4,-52 6,-62 12,-64 C14,-54 10,-46 2,-40Z" fill="#f2efe4" />
      <path d="M2,-40 C8,-44 18,-46 22,-42 C16,-38 8,-38 2,-40Z" fill="#dcd8c8" />
      <path d="M-4,-4 Q-14,-12 -16,-22 Q-8,-16 -2,-8Z" fill="#2a3020" />
    </g>
  );
}

/* ---------------- scenes ---------------- */

const SCENES: Record<string, (c: Ctx) => ReactNode> = {
  /* A Cadillac under a sodium lamp. The street is empty but for a hat in the light. */
  hit_success: (c) => {
    const sign = ['Cocktails', 'Bar · Grill', 'Motel'][Math.floor(c.r() * 3)];
    return (
      <>
        <rect width={800} height={460} fill={c.u('night')} />
        {/* brick wall and doorway, left */}
        <rect x={0} y={40} width={250} height={350} fill="#121216" />
        <path d={Array.from({ length: 18 }, (_, i) => `M0,${60 + i * 18}H250`).join('')} stroke="#1c1c22" strokeWidth={1.5} />
        <rect x={150} y={250} width={60} height={140} fill="#050506" />
        <rect x={150} y={250} width={60} height={140} fill={c.u('neonRed')} opacity={0.12} />
        <Neon c={c} x={120} y={170} text={sign} color="#ff3346" size={44} />
        <Glow c={c} x={120} y={160} rx={140} ry={70} op={0.35} grad="neonRed" />
        {/* distant buildings */}
        <path d="M250,300 V170 H300 V140 H360 V200 H420 V120 H470 V230 H560 V160 H620 V250 H700 V190 H800 V300 Z" fill="#0d0d11" />
        {Array.from({ length: 10 }, (_, i) => <rect key={i} x={265 + i * 52 + c.r() * 10} y={180 + c.r() * 80} width={6} height={9} fill="#d8c48a" opacity={0.15 + c.r() * 0.35} />)}
        <WetGround y={385} />
        <Reflection c={c} x={120} y={392} w={150} h={66} color="neonRed" op={0.45} />
        <Lamp c={c} x={430} top={70} ground={392} arm={40} />
        <Reflection c={c} x={470} y={392} w={70} h={68} op={0.5} />
        {/* the Cadillac */}
        <g transform="translate(250 392) scale(1.05)">{CADILLAC({ lit: true, light: LIGHT })}</g>
        {/* the hat on the wet street */}
        <g transform="translate(575 434) scale(1.2)">
          <ellipse cx={0} cy={6} rx={26} ry={5} fill="#000" opacity={0.6} />
          <path d="M-24,2 Q0,-6 24,0 Q14,8 0,8 Q-14,8 -24,2Z" fill="#141418" />
          <path d="M-12,1 Q-12,-14 0,-14 Q12,-14 12,0Z" fill="#1b1b20" />
          <path d="M-12,-3 Q0,-1 12,-3" stroke="#3a3a40" strokeWidth={2} />
          <path d="M-10,-10 Q-4,-14 4,-13" stroke={LIGHT} strokeOpacity={0.3} strokeWidth={1} fill="none" />
        </g>
        {/* the man walking away, long shadow towards us */}
        <Glow c={c} x={760} y={330} rx={120} ry={90} op={0.35} grad="cold" />
        <path d="M712,402 L640,460 L700,460 L722,404Z" fill="#000" opacity={0.55} />
        <Man x={716} y={404} s={0.7} pose="walk" rim="#cfd8e8" />
        <Rain c={c} n={150} />
        <Rain c={c} n={40} op={0.55} area={[300, 80, 330, 320]} />
        <Splashes c={c} y0={395} y1={455} n={40} />
      </>
    );
  },

  /* The title: the Wildwood boardwalk at night, 1960. Neon, the wheel, the sea, one man at the rail. */
  title: (c) => (
    <>
      <rect width={800} height={460} fill={c.u('night')} />
      {Array.from({ length: 40 }, (_, i) => <circle key={i} className="ns-twinkle" cx={f(c.r() * 800)} cy={f(c.r() * 150)} r={f(0.5 + c.r() * 0.9)} fill={LIGHT} opacity={0.25 + c.r() * 0.4} />)}
      <circle cx={140} cy={78} r={26} fill="#d9dde6" opacity={0.85} />
      <Glow c={c} x={140} y={78} rx={120} op={0.35} grad="cold" />
      {/* the sea, and the moon on it */}
      <rect x={0} y={210} width={800} height={60} fill="#0a0c11" />
      <g className="ns-shimmer">
        {Array.from({ length: 10 }, (_, i) => <rect key={i} x={f(120 - i * 3 + (c.r() - 0.5) * 10)} y={214 + i * 5} width={f(30 + i * 5)} height={1.6} fill="#c8d0e0" opacity={0.5 - i * 0.04} />)}
      </g>
      {/* the pier: the wheel, a coaster, the arcades */}
      <FerrisWheel x={600} y={120} r={88} op={0.85} />
      <Glow c={c} x={600} y={120} rx={150} op={0.25} grad="bulb" />
      <path d="M330,210 L360,150 L390,190 L420,130 L455,200 L480,170 L500,210" stroke={INK} strokeWidth={3} fill="none" />
      <path d={Array.from({ length: 9 }, (_, i) => `M${340 + i * 18},210 V${170 + (i % 3) * 12}`).join('')} stroke={INK} strokeWidth={1.4} />
      <path d="M0,150 H300 V262 H0Z" fill="#0f1015" />
      <path d="M520,190 H800 V262 H520Z" fill="#0f1015" />
      <Neon c={c} x={150} y={196} text="Casino Arcade" color="#ff4fa0" size={34} />
      <Glow c={c} x={150} y={186} rx={170} ry={50} op={0.35} grad="neonPink" />
      <Neon c={c} x={665} y={240} text="FROZEN CUSTARD" color="#59c7ff" size={18} flicker={false} font="'Futura','Century Gothic','Trebuchet MS',sans-serif" />
      <Glow c={c} x={665} y={234} rx={120} ry={30} op={0.3} grad="neonBlue" />
      <Neon c={c} x={745} y={212} text="Motel" color="#ff5040" size={20} font="'Futura','Century Gothic','Trebuchet MS',sans-serif" />
      {/* string lights along the boards */}
      <path d="M0,268 Q200,282 400,268 T800,268" stroke={INK} strokeWidth={1} fill="none" />
      {Array.from({ length: 24 }, (_, i) => <circle key={i} className={i % 3 ? undefined : 'ns-flicker-slow'} cx={i * 34 + 10} cy={f(270 + Math.sin(i / 3.8) * 6)} r={2.3} fill="#ffe7b0" />)}
      {/* the boardwalk in perspective, wet */}
      <WetGround y={262} color="#0d0d11" />
      <path d={Array.from({ length: 24 }, (_, i) => `M${i * 44 - 120},460 L${400 + (i * 44 - 520) * 0.25},262`).join('')} stroke="#1b1b20" strokeWidth={2} />
      <Reflection c={c} x={150} y={268} w={240} h={110} color="neonPink" op={0.35} />
      <Reflection c={c} x={665} y={268} w={160} h={80} color="neonBlue" op={0.3} />
      <Lamp c={c} x={300} top={120} ground={430} />
      {/* the railing on the sea side, and him at it */}
      <path d="M0,300 H800" stroke={INK} strokeWidth={5} />
      <path d={Array.from({ length: 17 }, (_, i) => `M${i * 50},300 V330`).join('')} stroke={INK} strokeWidth={4} />
      <Man x={660} y={445} s={1.35} pose="coat" rim="#ff9ad0" />
      <Rain c={c} n={70} op={0.14} />
      <Splashes c={c} y0={300} y1={455} n={20} />
    </>
  ),

  /* The boardwalk arcade: the neon half-dead, the glass in pieces, tail-lights smearing away. */
  hit_botched: (c) => (
    <>
      <rect width={800} height={460} fill={c.u('night')} />
      <FerrisWheel x={640} y={150} r={95} op={0.5} />
      <rect x={0} y={240} width={800} height={14} fill="#0b0b0e" />
      {/* arcade facade */}
      <path d="M0,70 H430 V380 H0Z" fill="#101014" />
      <path d="M0,70 H430 L410,52 H20Z" fill="#0b0b0e" />
      <Neon c={c} x={215} y={125} text="ARCADE" color="#ff4fa0" size={56} font="'Futura','Century Gothic','Trebuchet MS',sans-serif" />
      <Glow c={c} x={215} y={110} rx={220} ry={80} op={0.3} grad="neonPink" />
      {/* the window, cracked */}
      <rect x={40} y={170} width={300} height={170} fill="#1a1720" />
      <rect x={40} y={170} width={300} height={170} fill={c.u('neonPink')} opacity={0.18} />
      <g stroke={LIGHT} strokeOpacity={0.7} strokeWidth={1.1} fill="none">
        {Array.from({ length: 11 }, (_, i) => {
          const a = (i / 11) * Math.PI * 2 + c.r() * 0.3;
          const l = 40 + c.r() * 110;
          return <path key={i} d={`M210,250 l${f(Math.cos(a) * l * 0.4)},${f(Math.sin(a) * l * 0.4)} l${f(Math.cos(a + 0.2) * l * 0.6)},${f(Math.sin(a + 0.2) * l * 0.6)}`} />;
        })}
        <circle cx={210} cy={250} r={10} />
        <circle cx={210} cy={250} r={24} strokeOpacity={0.3} />
      </g>
      <rect x={40} y={170} width={300} height={170} fill="none" stroke={INK} strokeWidth={8} />
      {/* boardwalk planks in perspective */}
      <path d="M0,380 H800 V460 H0Z" fill="#0f0f12" />
      <path d={Array.from({ length: 22 }, (_, i) => `M${i * 40 - 40},460 L${400 + (i * 40 - 440) * 0.35},380`).join('')} stroke="#1d1d22" strokeWidth={2} />
      <Reflection c={c} x={215} y={385} w={260} h={70} color="neonPink" op={0.4} />
      {/* glass on the boards */}
      {Array.from({ length: 26 }, (_, i) => {
        const x = 90 + c.r() * 260;
        const y = 392 + c.r() * 55;
        return <path key={i} d={`M${f(x)},${f(y)} l${f(3 + c.r() * 6)},${f(-2 - c.r() * 3)} l${f(2 + c.r() * 3)},${f(4 + c.r() * 2)}Z`} fill={LIGHT} opacity={0.35 + c.r() * 0.5} />;
      })}
      {/* tail-lights streaking off */}
      <path d="M470,330 L800,318 L800,322 L470,336Z" fill={c.u('tail')} />
      <path d="M470,344 L800,336 L800,339 L470,348Z" fill={c.u('tail')} opacity={0.7} />
      <ellipse cx={470} cy={333} rx={8} ry={4} fill="#ff3020" />
      <Glow c={c} x={470} y={333} rx={60} ry={24} op={0.6} grad="neonRed" />
      {/* a man running for the dark */}
      <Glow c={c} x={420} y={330} rx={110} ry={110} op={0.35} grad="neonPink" />
      <Man x={420} y={420} s={1.05} pose="run" flip rim="#ff9ad0" />
      <Rain c={c} n={170} />
      <Splashes c={c} y0={385} y1={455} n={36} />
    </>
  ),

  /* Morning in the barbershop. The chair turned to the window. Someone outside saw. */
  hit_witness: (c) => (
    <>
      <rect width={800} height={460} fill="#16161a" />
      {/* checker floor */}
      <path d="M0,330 H800 V460 H0Z" fill="#0d0d10" />
      <path d={Array.from({ length: 16 }, (_, i) => `M${i * 60 - 60},460 L${400 + (i * 60 - 460) * 0.45},330`).join('') + Array.from({ length: 5 }, (_, i) => `M0,${340 + i * i * 6}H800`).join('')} stroke="#22222a" strokeWidth={2} />
      {/* the big window with blinds, light pouring in */}
      <rect x={430} y={50} width={320} height={260} fill="#d8d3c4" />
      <text x={590} y={120} fontSize={44} fontFamily="Georgia,serif" fontWeight={700} fill="#8a1c1c" textAnchor="middle" transform="scale(-1 1) translate(-1180 0)" opacity={0.75}>BARBER</text>
      <Blinds x={430} y={130} w={320} h={180} n={9} op={0.85} color={INK} />
      {/* witness silhouette at the window */}
      <g opacity={0.92}>
        <circle cx={700} cy={205} r={22} fill={INK} />
        <path d="M660,310 Q662,240 700,232 Q738,240 740,310Z" fill={INK} />
        <path d="M676,190 L724,190 L716,180 L712,166 Q700,160 688,166 L684,180Z" fill={INK} />
      </g>
      <rect x={430} y={50} width={320} height={260} fill="none" stroke={INK} strokeWidth={10} />
      <rect x={588} y={50} width={6} height={260} fill={INK} />
      {/* light rays from the blinds onto the floor */}
      <g opacity={0.35}>
        {Array.from({ length: 7 }, (_, i) => <path key={i} d={`M${440 + i * 2},${140 + i * 20} L${120 + i * 6},${360 + i * 14} L${120 + i * 6},${368 + i * 14} L${440 + i * 2},${148 + i * 20}Z`} fill={c.u('ray')} />)}
      </g>
      {/* barber pole, the only colour */}
      <g>
        <rect x={384} y={80} width={22} height={150} rx={10} fill="#e8e2d6" />
        <g clipPath={c.u('pole')}>
          <g className="ns-pole">
            {Array.from({ length: 14 }, (_, i) => <path key={i} d={`M380,${40 + i * 22} l30,-18 l0,10 l-30,18Z`} fill={i % 2 ? '#c41e2a' : '#22407a'} />)}
          </g>
        </g>
        <rect x={380} y={70} width={30} height={12} rx={4} fill="#9a9a9a" />
        <rect x={380} y={228} width={30} height={12} rx={4} fill="#9a9a9a" />
      </g>
      {/* mirror and counter on the left wall */}
      <rect x={20} y={70} width={250} height={150} fill="#22232a" stroke="#3a3a40" strokeWidth={6} />
      <path d="M30,80 L120,210 M90,80 L180,210" stroke={LIGHT} strokeOpacity={0.08} strokeWidth={24} />
      <rect x={0} y={230} width={300} height={22} fill="#0b0b0e" />
      {[40, 70, 100, 220].map((x, i) => <rect key={i} x={x} y={208 - i * 3} width={12} height={22 + i * 3} rx={3} fill="#2a2a32" />)}
      {/* the chair, empty, turned */}
      <g transform="translate(250 400)">
        <ellipse cx={0} cy={4} rx={80} ry={12} fill="#000" opacity={0.6} />
        <path d="M-14,0 L-10,-50 L10,-50 L14,0Z" fill="#2a2a30" />
        <ellipse cx={0} cy={0} rx={34} ry={7} fill="#3a3a42" />
        <path d="M-60,-62 L60,-62 L56,-50 L-56,-50Z" fill="#1a1a1e" />
        <path d="M-50,-62 L-46,-150 Q-40,-170 0,-172 Q40,-170 46,-150 L50,-62Z" fill="#0e0e12" />
        <path d="M-40,-150 Q0,-160 40,-150" stroke={LIGHT} strokeOpacity={0.25} strokeWidth={3} fill="none" />
        <path d="M-70,-100 L-46,-104 L-48,-60 L-72,-64Z M70,-100 L46,-104 L48,-60 L72,-64Z" fill="#1d1d22" />
        <rect x={-16} y={-196} width={32} height={20} rx={6} fill="#141418" />
        <path d="M-36,-52 L-60,-10 L-40,-6 L-20,-50Z" fill="#141418" />
      </g>
      {/* the cape dropped on the floor, a hat on the seat */}
      <path d="M300,410 Q340,392 390,402 Q420,410 410,428 Q360,440 300,430 Q280,420 300,410Z" fill="#d6d0c2" opacity={0.85} />
      <path d="M320,414 Q350,406 380,412" stroke="#8a8478" strokeWidth={1.5} fill="none" />
      <path d="M226,328 Q250,320 274,328 Q262,334 250,334 Q238,334 226,328Z M236,328 Q236,316 250,316 Q264,316 264,328Z" fill="#0a0a0c" />
      <Smoke c={c} x={300} y={140} w={260} n={4} op={0.08} />
    </>
  ),

  /* St. Ann's: the casket under lilies, stained glass, candles, the family in the front pew. */
  funeral: (c) => (
    <>
      <rect width={800} height={460} fill="#0c0c0f" />
      {/* nave columns */}
      <path d="M0,0 H140 V460 H0Z M660,0 H800 V460 H660Z" fill="#060608" />
      <path d="M140,0 Q170,60 180,460 M660,0 Q630,60 620,460" stroke="#18181c" strokeWidth={10} fill="none" />
      {/* window and rays */}
      <StainedWindow c={c} x={340} y={40} w={120} h={210} />
      <g opacity={0.3}>
        <path d="M350,120 L180,440 L330,440 L450,120Z" fill={c.u('ray')} />
        <path d="M420,140 L470,440 L600,440 L455,140Z" fill={c.u('ray')} opacity={0.6} />
      </g>
      {/* altar step */}
      <path d="M150,300 H650 L700,330 H100Z" fill="#141418" />
      {/* candle stands */}
      {[210, 590].map((x) => (
        <g key={x}>
          <rect x={x - 4} y={200} width={8} height={110} fill="#1a1810" />
          <rect x={x - 20} y={300} width={40} height={8} fill="#1a1810" />
          <rect x={x - 5} y={174} width={10} height={28} fill="#e8e0c8" />
          <Flame c={c} x={x} y={174} s={0.9} />
        </g>
      ))}
      {/* the casket on its bier */}
      <path d="M260,300 L540,300 L560,320 L240,320Z" fill="#0a0806" />
      <path d="M270,248 L530,248 Q548,252 552,270 L552,300 L248,300 L248,270 Q252,252 270,248Z" fill="#2a1d14" />
      <path d="M270,248 L530,248 Q548,252 552,270 L248,270 Q252,252 270,248Z" fill="#3e2c1e" />
      <path d="M262,262 H540" stroke="#d8b46a" strokeOpacity={0.5} strokeWidth={2} />
      <path d="M248,286 H552" stroke="#d8b46a" strokeOpacity={0.35} strokeWidth={3} />
      <path d="M280,250 Q300,240 360,244" stroke={LIGHT} strokeOpacity={0.35} strokeWidth={2} fill="none" />
      {/* lilies on the lid and at the foot */}
      {[300, 330, 360, 390, 420, 450, 480].map((x, i) => <Lily key={x} x={x} y={252} s={0.55 + (i % 2) * 0.12} flip={i % 2 === 1} />)}
      <Lily x={225} y={330} s={0.9} />
      <Lily x={245} y={334} s={0.8} flip />
      <Lily x={560} y={334} s={0.85} />
      <Lily x={580} y={330} s={0.9} flip />
      {/* the front pew, mourners' backs */}
      <path d="M40,380 H760 V460 H40Z" fill="#040405" />
      <path d="M40,372 H760 V386 H40Z" fill="#1a1612" />
      {[110, 190, 260, 340, 470, 540, 620, 690].map((x, i) =>
        i % 3 === 1 ? <Woman key={x} x={x} y={470} s={0.75} veil /> : <Man key={x} x={x} y={470} s={0.78} pose="back" hat={false} />,
      )}
      <Smoke c={c} x={400} y={150} w={400} n={4} op={0.07} />
    </>
  ),

  /* The reception at the Starlight: string lights, the band, the first dance. */
  wedding: (c) => (
    <>
      <rect width={800} height={460} fill="#120f0c" />
      <rect width={800} height={460} fill={c.u('warmBg')} />
      {/* string lights */}
      {[0, 1, 2].map((row) => (
        <g key={row} className={row === 1 ? 'ns-twinkle' : undefined}>
          <path d={`M-20,${50 + row * 26} Q400,${110 + row * 30} 820,${50 + row * 26}`} stroke="#000" strokeWidth={1.2} fill="none" />
          {Array.from({ length: 22 }, (_, i) => {
            const x = -10 + i * 38 + row * 12;
            const tt = (x + 20) / 840;
            const y = 50 + row * 26 + 4 * tt * (1 - tt) * (60 + row * 4);
            return (
              <g key={i}>
                <circle cx={f(x)} cy={f(y + 4)} r={8} fill={c.u('bulb')} opacity={0.6} />
                <circle cx={f(x)} cy={f(y + 4)} r={2.6} fill="#fff1c8" />
              </g>
            );
          })}
        </g>
      ))}
      {/* bandstand */}
      <path d="M520,250 H800 V330 H520Z" fill="#0a0806" />
      <path d="M520,250 H800" stroke="#d8b46a" strokeOpacity={0.4} strokeWidth={2} />
      <g fill={INK}>
        {/* drummer and kit */}
        <circle cx={700} cy={176} r={13} />
        <path d="M680,250 Q680,196 700,192 Q720,196 720,250Z" />
        <ellipse cx={700} cy={234} rx={26} ry={22} fill="#1d1712" stroke="#000" strokeWidth={3} />
        <text x={700} y={240} fontSize={9} fill="#d8b46a" textAnchor="middle" fontFamily="Georgia,serif" fontStyle="italic">The Sandpipers</text>
        <ellipse cx={662} cy={198} rx={16} ry={3} fill="#3a3020" />
        <path d="M662,198 V250" stroke={INK} strokeWidth={2} />
        {/* sax */}
        <circle cx={590} cy={150} r={13} />
        <path d="M570,250 Q570,176 590,168 Q612,176 612,250Z" />
        <path d="M596,172 Q610,190 606,214 Q600,232 588,226 Q584,218 592,212" stroke="#c9a548" strokeWidth={5} fill="none" />
        {/* upright bass */}
        <circle cx={768} cy={158} r={12} />
        <path d="M752,250 Q752,182 768,176 Q786,182 786,250Z" />
        <path d="M742,120 L742,190" stroke={INK} strokeWidth={3} />
        <path d="M742,186 Q722,196 728,222 Q716,236 730,252 L756,252 Q768,236 756,222 Q762,196 742,186Z" fill="#2a1a10" />
      </g>
      {/* spotlight on the couple */}
      <Cone c={c} x={330} y={0} w0={30} w1={150} y1={420} grad="ray" op={0.55} />
      <ellipse cx={330} cy={418} rx={150} ry={22} fill={c.u('warm')} opacity={0.5} />
      {/* the couple dancing */}
      <g>
        <Man x={312} y={420} s={1.15} pose="stand" hat={false} />
        <Woman x={352} y={420} s={1.12} bride />
      </g>
      {/* guests' tables in the foreground */}
      {[90, 610].map((x, i) => (
        <g key={x}>
          <ellipse cx={x} cy={430} rx={120} ry={22} fill="#e8e0c8" opacity={0.18} />
          <rect x={x - 120} y={430} width={240} height={30} fill="#050403" />
          {[-60, -10, 40].map((dx, j) => <path key={j} d={`M${x + dx},${404} l-5,-16 h10Z M${x + dx},${404} v20`} stroke={LIGHT} strokeOpacity={0.45} strokeWidth={1} fill={LIGHT} fillOpacity={0.12} />)}
          <Man x={x - 90} y={470} s={0.85} pose="back" hat={false} />
          {i === 0 ? <Woman x={x + 80} y={470} s={0.82} /> : <Man x={x + 90} y={470} s={0.88} pose="back" hat={false} />}
        </g>
      ))}
      {/* the cake */}
      <g transform="translate(470 404)">
        <rect x={-26} y={-20} width={52} height={20} fill="#e6dfcc" />
        <rect x={-18} y={-36} width={36} height={16} fill="#ece6d4" />
        <rect x={-10} y={-48} width={20} height={12} fill="#f2ecdc" />
        <path d="M-4,-48 l4,-8 l4,8" fill={INK} />
      </g>
      <Smoke c={c} x={400} y={210} w={600} n={5} op={0.08} />
    </>
  ),

  /* The back room. One lamp, the table, five hats and the smoke between them. */
  sitdown: (c) => (
    <>
      <rect width={800} height={460} fill="#0a0a0c" />
      {/* wall: wainscot, a calendar, a crucifix */}
      <path d="M0,250 H800 V460 H0Z" fill="#070708" />
      <rect x={90} y={110} width={60} height={80} fill="#2a2620" />
      <text x={120} y={128} fontSize={10} fill="#8a7a5a" textAnchor="middle" fontFamily="Georgia,serif">1960</text>
      <path d={Array.from({ length: 4 }, (_, i) => `M98,${140 + i * 12}H142`).join('')} stroke="#4a4234" strokeWidth={1} />
      <path d="M680,110 v60 M666,128 h28" stroke="#2a2620" strokeWidth={6} />
      {/* door crack, right */}
      <rect x={740} y={120} width={4} height={200} fill="#e8dcc0" opacity={0.5} />
      <path d="M744,320 L800,360 L800,368 L744,322Z" fill="#e8dcc0" opacity={0.12} />
      {/* the lamp */}
      <path d="M400,0 V96" stroke={INK} strokeWidth={2} />
      <Cone c={c} x={400} y={118} w0={44} w1={300} y1={400} op={0.85} />
      <path d="M352,118 Q400,72 448,118Z" fill="#141410" />
      <ellipse cx={400} cy={118} rx={48} ry={6} fill="#fff4d8" />
      <Glow c={c} x={400} y={120} rx={90} ry={34} op={0.7} grad="sodium" />
      {/* the table */}
      <ellipse cx={400} cy={330} rx={260} ry={44} fill="#2e2a22" />
      <ellipse cx={400} cy={326} rx={250} ry={38} fill={c.u('table')} />
      <path d="M150,334 Q400,390 650,334 L650,350 Q400,404 150,350Z" fill="#0b0a08" />
      {/* things on the table */}
      <g>
        <path d="M454,300 l-6,-34 h14 l4,-6 h4 l4,6 h4 l-6,34Z" fill="#1d2a1d" opacity={0.85} />
        <ellipse cx={360} cy={316} rx={14} ry={4} fill="#1a1a1a" />
        <path d="M352,314 h16" stroke="#d8d0c0" strokeWidth={2} />
        {[300, 410, 520].map((x, i) => <path key={i} d={`M${x},${318 + (i % 2) * 6} q0,-12 8,-12 q8,0 8,12Z`} fill="#e8e0c8" opacity={0.6} />)}
        <path className="ns-smoke" d="M360,312 q-10,-30 6,-56 q14,-24 -4,-50 q-12,-20 6,-44" stroke={LIGHT} strokeOpacity={0.35} strokeWidth={2} fill="none" filter={c.u('soft2')} />
      </g>
      {/* the men: two far side facing us, three near with their backs */}
      <Man x={290} y={300} s={0.62} pose="seatedFront" />
      <Man x={510} y={300} s={0.62} pose="seatedFront" />
      <Man x={400} y={292} s={0.58} pose="seatedFront" hat={false} />
      <Man x={235} y={480} s={1.15} pose="back" rim="#ffe0a0" />
      <Man x={565} y={480} s={1.15} pose="back" rim="#ffe0a0" />
      <Smoke c={c} x={400} y={210} w={520} n={7} op={0.2} />
      <Smoke c={c} x={420} y={160} w={300} n={4} op={0.14} cls="ns-smoke2" />
    </>
  ),

  /* The office over the arcade. Someone new in the big chair; the others hat in hand. */
  succession: (c) => (
    <>
      <rect width={800} height={460} fill="#0b0b0e" />
      {/* tall window with blinds and the boardwalk neon beyond */}
      <rect x={270} y={40} width={260} height={250} fill="#1c3346" />
      <rect x={270} y={40} width={260} height={250} fill={c.u('neonBlue')} opacity={0.5} />
      <Neon c={c} x={400} y={140} text="Wildwood" color="#4fc8ff" size={50} />
      <Glow c={c} x={400} y={130} rx={150} ry={60} op={0.4} grad="neonBlue" />
      <Blinds x={270} y={40} w={260} h={250} n={12} op={0.55} color="#050507" />
      <rect x={270} y={40} width={260} height={250} fill="none" stroke={INK} strokeWidth={10} />
      {/* blind shadows across the floor */}
      <g opacity={0.12}>
        {Array.from({ length: 9 }, (_, i) => <path key={i} d={`M${200 + i * 8},${330 + i * 14} L${640 + i * 8},${330 + i * 14} L${660 + i * 8},${336 + i * 14} L${210 + i * 8},${336 + i * 14}Z`} fill="#8ad8ff" />)}
      </g>
      {/* the chair, the man in it */}
      <path d="M330,330 L330,170 Q330,140 400,138 Q470,140 470,170 L470,330Z" fill="#050506" stroke="#2a3a4a" strokeWidth={2} strokeOpacity={0.6} />
      <Man x={400} y={330} s={0.92} pose="seatedFront" rim="#8ad8ff" />
      {/* the desk and its lamp */}
      <path d="M180,320 H620 L640,340 V460 H160 V340Z" fill="#100c08" />
      <path d="M180,320 H620 L640,340 H160Z" fill="#2a2018" />
      <path d="M520,320 v-28 M500,292 h40 l-6,-14 h-28Z" stroke="#1a1a10" strokeWidth={3} fill="#1d3a26" />
      <ellipse cx={520} cy={322} rx={60} ry={10} fill={c.u('sodium')} opacity={0.6} />
      <path d="M300,316 h40 v4 h-40Z" fill="#e8e0c8" opacity={0.6} />
      <circle cx={380} cy={316} r={4} fill="none" stroke="#d8b46a" strokeWidth={1.5} />
      {/* the others, standing, hats in hand */}
      <Man x={110} y={460} s={1.25} pose="hatInHand" rim="#8ad8ff" flip />
      <Man x={690} y={460} s={1.25} pose="hatInHand" rim="#8ad8ff" />
      <Smoke c={c} x={400} y={200} w={500} n={4} op={0.08} />
    </>
  ),

  /* The bedroom, the rain on the window, the priest, the one who stayed. */
  boss_death: (c) => (
    <>
      <rect width={800} height={460} fill="#0b0c10" />
      {/* the window, rain running down it */}
      <rect x={470} y={60} width={220} height={240} fill="#3a4250" />
      <rect x={470} y={60} width={220} height={240} fill={c.u('moon')} />
      <g className="ns-drip">
        {Array.from({ length: 22 }, (_, i) => {
          const x = 476 + c.r() * 208;
          const y = 64 + c.r() * 200;
          return <path key={i} d={`M${f(x)},${f(y)} q2,${f(10 + c.r() * 10)} 0,${f(20 + c.r() * 30)}`} stroke="#e8f0ff" strokeOpacity={0.35} strokeWidth={1.4} fill="none" />;
        })}
      </g>
      <path d="M580,60 V300 M470,180 H690" stroke={INK} strokeWidth={8} />
      <rect x={470} y={60} width={220} height={240} fill="none" stroke={INK} strokeWidth={12} />
      <path d="M470,300 L360,460 L700,460 L690,300Z" fill={c.u('moonRay')} opacity={0.35} />
      {/* crucifix and a stopped clock */}
      <path d="M260,90 v64 M244,110 h32" stroke="#1c1c22" strokeWidth={6} />
      <circle cx={140} cy={120} r={26} fill="#1a1a20" stroke="#2a2a32" strokeWidth={4} />
      <path d="M140,120 L140,102 M140,120 L152,128" stroke="#8a8a90" strokeWidth={2} />
      {/* the bed */}
      <path d="M160,300 H600 V380 H160Z" fill="#101014" />
      <path d="M150,230 Q150,200 180,200 L190,200 L190,380 L150,380Z" fill="#141418" />
      <path d="M190,290 Q250,270 330,284 Q420,262 500,286 Q560,276 600,300 L600,330 L190,330Z" fill="#c8ccd4" opacity={0.85} />
      <path d="M200,292 Q240,280 270,290" stroke="#7a7e88" strokeWidth={2} fill="none" />
      <ellipse cx={230} cy={276} rx={34} ry={14} fill="#d8dce4" opacity={0.8} />
      <path d="M232,258 q14,-6 28,4 q-4,10 -16,12 q-14,0 -12,-16Z" fill="#1a1a20" opacity={0.85} />
      {/* nightstand, candle, rosary */}
      <rect x={90} y={300} width={60} height={80} fill="#0c0c0f" />
      <rect x={112} y={270} width={12} height={30} fill="#e8e0c8" />
      <Flame c={c} x={118} y={270} s={0.8} />
      <path d="M100,300 q10,8 22,2 q8,-4 14,4" stroke="#c9a548" strokeOpacity={0.6} strokeWidth={1.5} strokeDasharray="1 2" fill="none" />
      {/* the priest standing, the son at the bedside */}
      <Man x={650} y={420} s={1} pose="stand" hat={false} />
      <rect x={645} y={274} width={10} height={6} fill="#e8e4dc" opacity={0.85} />
      <Man x={330} y={460} s={1.2} pose="bowed" hat={false} />
      <Rain c={c} n={40} op={0.18} area={[470, 60, 220, 240]} slant={2} />
    </>
  ),

  /* Dawn over the ocean. The heir on the boardwalk, the men behind him. */
  heir_rises: (c) => (
    <>
      <rect width={800} height={460} fill={c.u('dawn')} />
      <circle cx={400} cy={262} r={64} fill="#ffe2a8" />
      <Glow c={c} x={400} y={262} rx={260} ry={150} op={0.7} grad="sun" />
      <g opacity={0.05}>
        {Array.from({ length: 12 }, (_, i) => {
          const a = Math.PI + (i / 11) * Math.PI;
          return <path key={i} d={`M400,262 L${f(400 + Math.cos(a - 0.05) * 700)},${f(262 + Math.sin(a - 0.05) * 700)} L${f(400 + Math.cos(a + 0.05) * 700)},${f(262 + Math.sin(a + 0.05) * 700)}Z`} fill="#ffe8c0" />;
        })}
      </g>
      {/* ocean and the light path */}
      <rect x={0} y={262} width={800} height={200} fill="#1a1c22" />
      <g className="ns-shimmer">
        {Array.from({ length: 24 }, (_, i) => {
          const y = 268 + i * 6;
          const w = 20 + i * 6 + c.r() * 20;
          return <rect key={i} x={f(400 - w / 2 + (c.r() - 0.5) * 20)} y={y} width={f(w)} height={2} fill="#ffd890" opacity={0.6 - i * 0.02} />;
        })}
      </g>
      {/* gulls */}
      <path d="M200,120 q8,-8 16,0 q8,-8 16,0 M560,90 q6,-6 12,0 q6,-6 12,0 M600,140 q5,-5 10,0 q5,-5 10,0" stroke={INK} strokeWidth={2} fill="none" />
      {/* boardwalk railing and deck */}
      <path d="M0,330 H800 V460 H0Z" fill="#0b0a0a" />
      <path d="M0,318 H800 V326 H0Z" fill={INK} />
      <path d={Array.from({ length: 21 }, (_, i) => `M${i * 40},318 V350`).join('')} stroke={INK} strokeWidth={5} />
      <path d={Array.from({ length: 16 }, (_, i) => `M${i * 60 - 80},460 L${400 + (i * 60 - 480) * 0.3},350`).join('')} stroke="#1a1816" strokeWidth={2} />
      {/* the men behind, smaller, then him */}
      <Man x={130} y={420} s={0.95} pose="stand" />
      <Man x={210} y={430} s={1} pose="stand" />
      <Man x={600} y={430} s={1} pose="stand" flip />
      <Man x={680} y={420} s={0.95} pose="stand" flip />
      <path d="M400,452 L300,460 L500,460Z" fill="#000" opacity={0.5} />
      <Man x={400} y={456} s={1.55} pose="coat" rim="#ffd890" />
    </>
  ),

  /* The interrogation room: the lamp, the table, the mirror, the cigarette. */
  arrest_interrogation: (c) => (
    <>
      <rect width={800} height={460} fill="#0a0a0c" />
      {/* the two-way mirror */}
      <rect x={520} y={80} width={240} height={150} fill="#1a1c22" stroke="#2a2a30" strokeWidth={6} />
      <path d="M540,90 L620,220 M600,90 L680,220" stroke={LIGHT} strokeOpacity={0.06} strokeWidth={30} />
      <g opacity={0.3}>
        <Man x={640} y={232} s={0.45} pose="stand" />
      </g>
      {/* blind shadow across the back wall */}
      <Blinds x={40} y={60} w={300} h={180} n={8} op={0.06} skew={30} />
      {/* clock */}
      <circle cx={180} cy={120} r={22} fill="#141418" stroke="#2a2a30" strokeWidth={3} />
      <path d="M180,120 V104 M180,120 L192,124" stroke="#8a8a90" strokeWidth={2} />
      {/* the lamp */}
      <path d="M380,0 V70" stroke={INK} strokeWidth={2} />
      <path d="M352,92 L408,92 L396,70 L364,70Z" fill="#1a1a1a" />
      <Cone c={c} x={380} y={92} w0={26} w1={240} y1={400} op={0.95} />
      <Glow c={c} x={380} y={94} rx={60} ry={22} op={0.9} grad="cold" />
      {/* table */}
      <path d="M180,332 H580 L600,350 H160Z" fill="#2a2a2e" />
      <path d="M160,350 H600 V360 H160Z" fill="#0a0a0c" />
      <path d="M190,360 V460 M570,360 V460" stroke={INK} strokeWidth={10} />
      <ellipse cx={380} cy={340} rx={200} ry={14} fill={c.u('cold')} opacity={0.3} />
      {/* ashtray, cigarette, cuffs */}
      <ellipse cx={460} cy={338} rx={16} ry={4} fill="#3a3a40" />
      <path d="M452,336 h18" stroke="#e8e4dc" strokeWidth={2} />
      <circle cx={471} cy={336} r={1.6} fill="#ff8040" />
      <path className="ns-smoke" d="M471,334 q-8,-24 6,-48 q12,-22 -4,-46 q-10,-18 6,-40" stroke={LIGHT} strokeOpacity={0.4} strokeWidth={2} fill="none" filter={c.u('soft2')} />
      <path d="M300,338 a7,4 0 1,1 14,0 a7,4 0 1,1 -14,0 M316,338 a7,4 0 1,1 14,0 a7,4 0 1,1 -14,0" stroke="#c8ccd4" strokeWidth={1.6} fill="none" />
      {/* the suspect, seated, and the detective leaning in */}
      <Man x={262} y={452} s={1.3} pose="seatedSide" hat={false} rim="#e8f0ff" />
      <Man x={530} y={452} s={1.3} pose="lean" hat={false} flip rim="#e8f0ff" />
      <Smoke c={c} x={380} y={190} w={360} n={5} op={0.12} />
    </>
  ),

  /* The door opens. Light falls across the floor to the man in the chair. */
  betrayal_confrontation: (c) => (
    <>
      <rect width={800} height={460} fill="#060608" />
      {/* the open door: a slab of light */}
      <rect x={250} y={70} width={130} height={280} fill="#e9e1cf" />
      <Glow c={c} x={315} y={200} rx={200} ry={200} op={0.25} grad="cold" />
      <path d="M380,70 L440,52 L440,370 L380,350Z" fill="#141418" />
      {/* the light thrown into the room */}
      <path d="M250,350 L380,350 L640,460 L60,460Z" fill={c.u('floorLight')} />
      {/* the man in the doorway, his long shadow */}
      <Man x={315} y={350} s={1.18} pose="stand" />
      <path d="M296,350 L334,350 L420,460 L300,460Z" fill="#000" opacity={0.85} />
      {/* the room: a chair, a table, a bottle */}
      <rect x={500} y={330} width={180} height={10} fill="#1a1a1e" />
      <path d="M510,340 V460 M670,340 V460" stroke="#0e0e10" strokeWidth={8} />
      <path d="M600,330 l-4,-36 h12 l4,-10 h4 l4,10 h12 l-4,36Z" fill="#1d2a1d" opacity={0.85} />
      <path d="M560,330 l-3,-16 h10 l-3,16Z" fill={LIGHT} opacity={0.3} />
      {/* the seated man from behind, rim-lit */}
      <Man x={640} y={470} s={1.3} pose="seatedBack" hat={false} />
      <path d="M598,300 Q600,270 622,262" stroke={LIGHT} strokeOpacity={0.4} strokeWidth={2} fill="none" />
      <Smoke c={c} x={320} y={180} w={200} n={4} op={0.14} />
      <g opacity={0.25}>
        {Array.from({ length: 24 }, (_, i) => <circle key={i} className="ns-dust" cx={f(260 + c.r() * 110)} cy={f(90 + c.r() * 250)} r={f(0.6 + c.r() * 1.2)} fill={LIGHT} style={{ animationDelay: `${f(c.r() * 6)}s` }} />)}
      </g>
    </>
  ),

  /* The ceremony: a candle, a burning saint card in a man's hands, the circle around him. */
  made_man: (c) => (
    <>
      <rect width={800} height={460} fill="#050404" />
      <Glow c={c} x={400} y={250} rx={330} ry={250} op={0.55} grad="warm" />
      {/* the Madonna on the wall behind, barely there */}
      <g opacity={0.25}>
        <rect x={360} y={50} width={80} height={110} fill="#2a2016" stroke="#6a5530" strokeWidth={4} />
        <circle cx={400} cy={86} r={14} fill="none" stroke="#c9a548" strokeWidth={2} />
        <path d="M400,96 q-20,10 -22,50 h44 q-2,-40 -22,-50Z" fill="#3a5070" />
      </g>
      {/* the men around the table, underlit */}
      {[
        [130, 380, 1.05],
        [250, 350, 0.9],
        [550, 350, 0.9],
        [670, 380, 1.05],
      ].map(([x, y, s], i) => (
        <g key={i}>
          <Man x={x} y={y} s={s} pose="stand" hat={i % 2 === 0} flip={x > 400} rim="#ffb060" />
        </g>
      ))}
      {/* the table */}
      <path d="M150,380 H650 L700,420 H100Z" fill="#1a120a" />
      <path d="M100,420 H700 V460 H100Z" fill="#070504" />
      <ellipse cx={400} cy={392} rx={220} ry={20} fill={c.u('warm')} opacity={0.45} />
      {/* candle */}
      <rect x={455} y={320} width={16} height={68} fill="#e8dcc0" />
      <path d="M455,320 q8,6 16,0" stroke="#c8b898" fill="none" />
      <Flame c={c} x={463} y={320} s={1.3} />
      {/* the hands and the card */}
      <g transform="translate(360 346)">
        {/* forearms coming in from the dark */}
        <path d="M-150,70 Q-90,40 -40,24 L-30,44 Q-80,60 -130,90Z" fill="#0a0603" />
        <path d="M150,70 Q90,40 40,24 L30,44 Q80,60 130,90Z" fill="#090502" />
        {/* cupped hands */}
        <path d="M-44,22 Q-40,4 -22,0 Q-10,-2 -4,6 L-2,20 Q-6,34 -22,40 Q-38,40 -44,22Z" fill="#3a2414" />
        <path d="M44,22 Q40,4 22,0 Q10,-2 4,6 L2,20 Q6,34 22,40 Q38,40 44,22Z" fill="#2e1c0e" />
        <path d="M-20,2 Q-14,-10 -6,-8 Q-2,-4 -4,6Z M20,2 Q14,-10 6,-8 Q2,-4 4,6Z" fill="#4a2e1a" />
        <path d="M-40,18 Q-30,8 -14,8 M40,18 Q30,8 14,8" stroke="#ffb060" strokeOpacity={0.5} strokeWidth={1.5} fill="none" />
        <g transform="translate(0 -14) rotate(-6)">
          <rect x={-15} y={-30} width={30} height={42} rx={2} fill="#efe6d0" />
          <rect x={-12} y={-27} width={24} height={36} fill="none" stroke="#c9a548" strokeWidth={0.8} />
          <circle cx={0} cy={-15} r={6} fill="none" stroke="#c9a548" strokeWidth={1.4} />
          <circle cx={0} cy={-15} r={3.4} fill="#d8b890" />
          <path d="M0,-10 q-8,4 -8,17 h16 q0,-13 -8,-17Z" fill="#7a3a2a" />
          <path className="ns-burn" d="M-15,-30 L-3,-30 Q-6,-22 -15,-17Z" fill="#ff8a30" />
          <path d="M-15,-30 L-6,-30 Q-8,-25 -15,-21Z" fill="#1a0e06" />
          <path className="ns-flame" d="M-13,-30 q-4,-10 2,-17 q0,8 4,10 q-2,-7 4,-12 q2,10 -2,19Z" fill="#ffc060" opacity={0.95} />
        </g>
        <path d="M-30,30 Q-14,22 -2,24 M30,30 Q14,22 2,24" stroke="#1a0e06" strokeWidth={1.2} fill="none" />
      </g>
      <Smoke c={c} x={420} y={230} w={260} n={4} op={0.1} />
    </>
  ),
};

const STYLE = `
.ns-rain{animation:ns-fall .55s linear infinite}
@keyframes ns-fall{from{transform:translate(0,-40px)}to{transform:translate(-10px,24px)}}
.ns-flicker{animation:ns-flick 5.5s steps(1,end) infinite}
@keyframes ns-flick{0%,100%{opacity:1}61%{opacity:.35}62%{opacity:1}64%{opacity:.2}66%{opacity:1}88%{opacity:.75}89%{opacity:1}}
.ns-flicker-slow{animation:ns-flick 2.3s steps(1,end) infinite}
.ns-twinkle{animation:ns-twk 3.2s ease-in-out infinite alternate}
@keyframes ns-twk{from{opacity:.75}to{opacity:1}}
.ns-smoke{animation:ns-drift 11s ease-in-out infinite alternate}
.ns-smoke2{animation:ns-drift 15s ease-in-out infinite alternate-reverse}
@keyframes ns-drift{from{transform:translate(-18px,6px)}to{transform:translate(22px,-10px)}}
.ns-flame{animation:ns-fl .16s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:50% 100%}
@keyframes ns-fl{from{transform:scale(1,1) skewX(-2deg)}to{transform:scale(.92,1.08) skewX(3deg)}}
.ns-burn{animation:ns-glow 1.4s ease-in-out infinite alternate}
@keyframes ns-glow{from{opacity:.6}to{opacity:1}}
.ns-pole{animation:ns-pole 2.4s linear infinite}
@keyframes ns-pole{from{transform:translateY(0)}to{transform:translateY(44px)}}
.ns-drip{animation:ns-drip 6s linear infinite}
@keyframes ns-drip{from{transform:translateY(-6px)}to{transform:translateY(10px)}}
.ns-shimmer{animation:ns-twk 1.8s ease-in-out infinite alternate}
.ns-dust{animation:ns-dust 7s ease-in-out infinite alternate}
@keyframes ns-dust{from{transform:translate(0,0)}to{transform:translate(8px,-14px)}}
.ns-grain{animation:ns-grain .5s steps(5) infinite}
@keyframes ns-grain{0%{transform:translate(0,0)}20%{transform:translate(-14px,9px)}40%{transform:translate(11px,-13px)}60%{transform:translate(-8px,-6px)}80%{transform:translate(13px,10px)}}
@media (prefers-reduced-motion: reduce){.ns-rain,.ns-flicker,.ns-flicker-slow,.ns-twinkle,.ns-smoke,.ns-smoke2,.ns-flame,.ns-burn,.ns-pole,.ns-drip,.ns-shimmer,.ns-dust,.ns-grain{animation:none}}
`;

export function NoirStill({ cue, seed = 1 }: { cue: string; seed?: number }) {
  const r = rng(seed * 7919 + cue.length * 131 + cue.charCodeAt(0));
  const pre = `ns-${cue.replace(/[^a-z0-9]/gi, '')}-${seed}-`;
  const c: Ctx = { r, id: (k) => pre + k, u: (k) => `url(#${pre}${k})` };
  const draw = SCENES[cue] ?? SCENES.sitdown;
  const radial = (k: string, color: string, op = 1) => (
    <radialGradient id={pre + k}>
      <stop offset="0" stopColor={color} stopOpacity={op} />
      <stop offset="1" stopColor={color} stopOpacity={0} />
    </radialGradient>
  );
  return (
    <svg viewBox="0 0 800 460" preserveAspectRatio="xMidYMid slice" className="w-full h-full block" role="img" aria-label={cue.replace(/_/g, ' ')}>
      <style>{STYLE}</style>
      <defs>
        <linearGradient id={pre + 'night'} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1c1f26" />
          <stop offset="0.6" stopColor="#0d0e12" />
          <stop offset="1" stopColor="#060608" />
        </linearGradient>
        <linearGradient id={pre + 'cone'} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe6b0" stopOpacity={0.55} />
          <stop offset="1" stopColor="#ffe6b0" stopOpacity={0.03} />
        </linearGradient>
        <linearGradient id={pre + 'ray'} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f4e8cc" stopOpacity={0.8} />
          <stop offset="1" stopColor="#f4e8cc" stopOpacity={0} />
        </linearGradient>
        <linearGradient id={pre + 'moonRay'} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b8c8e0" stopOpacity={0.7} />
          <stop offset="1" stopColor="#b8c8e0" stopOpacity={0} />
        </linearGradient>
        <linearGradient id={pre + 'moon'} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9aa8c0" stopOpacity={0.6} />
          <stop offset="1" stopColor="#1a1e28" stopOpacity={0.2} />
        </linearGradient>
        <linearGradient id={pre + 'floorLight'} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e9e1cf" stopOpacity={0.55} />
          <stop offset="1" stopColor="#e9e1cf" stopOpacity={0.05} />
        </linearGradient>
        <linearGradient id={pre + 'dawn'} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#14161e" />
          <stop offset="0.45" stopColor="#4a3a3a" />
          <stop offset="0.57" stopColor="#c8875a" />
          <stop offset="0.6" stopColor="#f0c088" />
        </linearGradient>
        <linearGradient id={pre + 'tail'} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ff3020" stopOpacity={0.9} />
          <stop offset="1" stopColor="#ff3020" stopOpacity={0} />
        </linearGradient>
        <radialGradient id={pre + 'table'} cx="0.5" cy="0.4">
          <stop offset="0" stopColor="#6a5a40" />
          <stop offset="1" stopColor="#1a1610" />
        </radialGradient>
        <radialGradient id={pre + 'warmBg'} cx="0.45" cy="0.5" r="0.7">
          <stop offset="0" stopColor="#4a3420" stopOpacity={0.8} />
          <stop offset="1" stopColor="#000" stopOpacity={0} />
        </radialGradient>
        {radial('glow', '#fff2d0')}
        {radial('sodium', '#ffcf80')}
        {radial('warm', '#ff9a40')}
        {radial('bulb', '#ffd890')}
        {radial('sun', '#ffcf90')}
        {radial('cold', '#e8f0ff')}
        {radial('neonRed', '#ff2a3c')}
        {radial('neonPink', '#ff3fa0')}
        {radial('neonBlue', '#40c0ff')}
        <radialGradient id={pre + 'vig'} cx="0.5" cy="0.48" r="0.72">
          <stop offset="0.5" stopColor="#000" stopOpacity={0} />
          <stop offset="1" stopColor="#000" stopOpacity={0.9} />
        </radialGradient>
        <clipPath id={pre + 'pole'}>
          <rect x={384} y={80} width={22} height={150} rx={10} />
        </clipPath>
        <filter id={pre + 'glow'} x="-30%" y="-60%" width="160%" height="220%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <filter id={pre + 'soft'} x="-30%" y="-80%" width="160%" height="260%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
        <filter id={pre + 'soft2'} x="-100%" y="-20%" width="300%" height="140%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
        <filter id={pre + 'grain'} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={seed % 100} />
          <feColorMatrix values="0 0 0 0 0.55  0 0 0 0 0.52  0 0 0 0 0.48  0 0 0 0.16 0" />
        </filter>
      </defs>
      {draw(c)}
      <rect width={800} height={460} fill={c.u('vig')} />
      <rect className="ns-grain" x={-20} y={-20} width={840} height={500} filter={c.u('grain')} />
    </svg>
  );
}

