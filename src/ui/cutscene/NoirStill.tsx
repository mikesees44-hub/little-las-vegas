import type { ReactNode } from 'react';

/**
 * Code-drawn noir stills, one composition per cutscene key: hard light, rain,
 * silhouettes. Pure SVG, no assets. `seed` varies the details.
 */
const INK = '#0b0a09';
const SMOKE = '#2a2722';
const LIGHT = '#e8dcc0';

function rng(seed: number) {
  let x = seed % 2147483647 || 1;
  return () => (x = (x * 48271) % 2147483647) / 2147483647;
}

function Rain({ r, n = 70 }: { r: () => number; n?: number }) {
  return (
    <g stroke={LIGHT} strokeOpacity={0.18} strokeWidth={1}>
      {Array.from({ length: n }, (_, i) => {
        const x = r() * 820 - 10;
        const y = r() * 460;
        return <line key={i} x1={x} y1={y} x2={x - 6} y2={y + 22 + r() * 18} />;
      })}
    </g>
  );
}

function Man({ x, y, s = 1, hat = true, flip = false }: { x: number; y: number; s?: number; hat?: boolean; flip?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`} fill={INK}>
      <path d="M-26 0 L-22 -92 Q-20 -112 0 -116 Q20 -112 22 -92 L26 0 Z" />
      <circle cx={0} cy={-130} r={15} />
      {hat && <path d="M-24 -136 L24 -136 L18 -142 L14 -156 Q0 -162 -14 -156 L-18 -142 Z" />}
    </g>
  );
}

function Lamp({ x, glow = true }: { x: number; glow?: boolean }) {
  return (
    <g>
      {glow && <ellipse cx={x} cy={380} rx={140} ry={30} fill={LIGHT} opacity={0.12} />}
      {glow && <path d={`M${x - 8} 120 L${x - 110} 390 L${x + 110} 390 L${x + 8} 120 Z`} fill="url(#cone)" />}
      <rect x={x - 3} y={110} width={6} height={280} fill={INK} />
      <rect x={x - 12} y={104} width={24} height={14} rx={3} fill={glow ? LIGHT : SMOKE} />
    </g>
  );
}

function Car({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} fill={INK}>
      <path d="M0 0 L20 -34 L70 -52 L170 -52 L215 -30 L280 -24 L292 0 Z" />
      <circle cx={60} cy={2} r={20} fill={SMOKE} stroke={INK} strokeWidth={6} />
      <circle cx={230} cy={2} r={20} fill={SMOKE} stroke={INK} strokeWidth={6} />
      <path d="M80 -46 L120 -46 L120 -30 L70 -30 Z" fill={LIGHT} opacity={0.15} />
    </g>
  );
}

function Window({ x, y, w = 160, h = 200 }: { x: number; y: number; w?: number; h?: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={LIGHT} opacity={0.22} />
      {[1, 2, 3].map((i) => <rect key={i} x={x} y={y + (h / 4) * i} width={w} height={3} fill={INK} />)}
      <rect x={x + w / 2 - 2} y={y} width={4} height={h} fill={INK} />
    </g>
  );
}

const SCENES: Record<string, (r: () => number) => ReactNode> = {
  hit_success: (r) => (
    <>
      <Lamp x={560} />
      <Car x={60} y={392} />
      <Man x={470} y={400} s={1.15} />
      <path d={`M470 404 l-${80 + r() * 40} 26 l${160 + r() * 40} 0 Z`} fill={INK} opacity={0.6} />
      <Rain r={r} />
    </>
  ),
  hit_botched: (r) => (
    <>
      <Lamp x={250} />
      <Car x={420} y={392} />
      <Man x={320} y={400} flip />
      <circle cx={600} cy={330} r={30} fill={LIGHT} opacity={0.5} />
      <circle cx={600} cy={330} r={70} fill={LIGHT} opacity={0.08} />
      <Rain r={r} n={90} />
    </>
  ),
  hit_witness: (r) => (
    <>
      <Window x={540} y={70} w={130} h={170} />
      <Man x={605} y={260} s={0.6} hat={false} />
      <Lamp x={220} />
      <Man x={260} y={400} />
      <Rain r={r} />
    </>
  ),
  funeral: (r) => (
    <>
      <path d="M380 70 L380 20 M360 40 L400 40" stroke={INK} strokeWidth={10} />
      <rect x={250} y={300} width={300} height={60} rx={8} fill={INK} />
      {[0, 1, 2, 3, 4, 5].map((i) => <Man key={i} x={120 + i * 115 + (i > 2 ? 60 : 0)} y={430} s={0.9 + r() * 0.15} />)}
      <Rain r={r} n={110} />
    </>
  ),
  wedding: (r) => (
    <>
      {Array.from({ length: 14 }, (_, i) => <circle key={i} cx={40 + i * 56} cy={60 + (i % 2) * 14} r={7} fill={LIGHT} opacity={0.6} />)}
      <path d="M20 60 Q400 110 780 60" stroke={INK} strokeWidth={2} fill="none" />
      <Man x={350} y={420} s={1.1} hat={false} />
      <g transform="translate(450 420)" fill={LIGHT} opacity={0.85}><path d="M-34 0 L-14 -100 Q0 -112 14 -100 L34 0 Z" /><circle cx={0} cy={-124} r={14} /></g>
      <rect x={60} y={300} width={140} height={120} fill={INK} />
      <rect x={600} y={300} width={140} height={120} fill={INK} />
      <Rain r={r} n={0} />
    </>
  ),
  sitdown: (r) => (
    <>
      <ellipse cx={400} cy={120} rx={60} ry={12} fill={LIGHT} opacity={0.5} />
      <path d="M380 60 L420 60 L460 120 L340 120 Z" fill={LIGHT} opacity={0.15} />
      <rect x={140} y={300} width={520} height={30} fill={INK} />
      {[0, 1, 2, 3, 4].map((i) => <Man key={i} x={200 + i * 100} y={330} s={0.8} hat={r() > 0.4} />)}
      <path d="M0 0 L800 0 L800 460 L0 460 Z" fill="url(#vig)" />
    </>
  ),
  succession: (r) => (
    <>
      <Window x={320} y={60} w={160} h={220} />
      <rect x={340} y={250} width={120} height={160} rx={10} fill={INK} />
      <Man x={400} y={330} s={0.9} hat={false} />
      {[0, 1].map((i) => <Man key={i} x={i ? 640 : 160} y={430} s={0.95 + r() * 0.1} />)}
    </>
  ),
  boss_death: (r) => (
    <>
      <Window x={330} y={70} w={140} h={180} />
      <rect x={250} y={330} width={300} height={70} fill={INK} />
      <path d="M260 330 Q400 300 540 330" fill={LIGHT} opacity={0.3} />
      <rect x={560} y={240} width={8} height={90} fill={INK} />
      <ellipse cx={564} cy={236} rx={10} ry={16} fill={LIGHT} opacity={0.5 + r() * 0.2} />
    </>
  ),
  heir_rises: (r) => (
    <>
      <path d="M400 30 L250 460 L550 460 Z" fill={LIGHT} opacity={0.12} />
      <Man x={400} y={420} s={1.3} />
      {[0, 1, 2, 3].map((i) => <Man key={i} x={i < 2 ? 100 + i * 90 : 520 + i * 60} y={440} s={0.8 + r() * 0.1} flip={i < 2} />)}
    </>
  ),
  arrest_interrogation: (r) => (
    <>
      <path d="M400 0 L400 90" stroke={INK} strokeWidth={3} />
      <circle cx={400} cy={100} r={14} fill={LIGHT} />
      <path d="M390 110 L180 400 L620 400 L410 110 Z" fill={LIGHT} opacity={0.12} />
      <rect x={250} y={320} width={300} height={20} fill={INK} />
      <Man x={330} y={400} s={0.85} hat={false} />
      <Man x={490} y={400} s={0.95} flip />
      <path d={`M400 310 q${r() * 20} -30 0 -60 q-10 -20 6 -40`} stroke={LIGHT} strokeOpacity={0.35} fill="none" />
    </>
  ),
  betrayal_confrontation: (r) => (
    <>
      <Lamp x={140} glow={r() > 0.2} />
      <Car x={250} y={392} />
      <Man x={330} y={350} s={0.6} />
      <Man x={480} y={350} s={0.6} flip />
      <Rain r={r} n={100} />
    </>
  ),
  made_man: (r) => (
    <>
      <path d="M400 360 Q380 300 400 250 Q420 300 400 360 Z" fill={LIGHT} opacity={0.85} />
      <ellipse cx={400} cy={300} rx={80} ry={90} fill={LIGHT} opacity={0.12} />
      <rect x={160} y={380} width={480} height={20} fill={INK} />
      {[0, 1, 2, 3].map((i) => <Man key={i} x={180 + i * 150 + (i > 1 ? 60 : 0)} y={460} s={0.9 + r() * 0.1} hat={false} />)}
    </>
  ),
};

export function NoirStill({ cue, seed = 1 }: { cue: string; seed?: number }) {
  const r = rng(seed * 7919 + cue.length * 131);
  const draw = SCENES[cue] ?? SCENES.sitdown;
  return (
    <svg viewBox="0 0 800 460" preserveAspectRatio="xMidYMid slice" className="w-full h-full block" role="img" aria-label={cue.replace(/_/g, ' ')}>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a352d" />
          <stop offset="1" stopColor="#121110" />
        </linearGradient>
        <linearGradient id="cone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={LIGHT} stopOpacity={0.35} />
          <stop offset="1" stopColor={LIGHT} stopOpacity={0.02} />
        </linearGradient>
        <radialGradient id="vig" cx="0.5" cy="0.45" r="0.75">
          <stop offset="0.55" stopColor="#000" stopOpacity={0} />
          <stop offset="1" stopColor="#000" stopOpacity={0.85} />
        </radialGradient>
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={seed % 100} />
          <feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0.09 0" />
        </filter>
      </defs>
      <rect width={800} height={460} fill="url(#sky)" />
      <rect y={400} width={800} height={60} fill="#151311" />
      {draw(r)}
      <rect width={800} height={460} fill="url(#vig)" />
      <rect width={800} height={460} filter="url(#grain)" />
    </svg>
  );
}
