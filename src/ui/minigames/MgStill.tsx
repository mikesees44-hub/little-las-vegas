import type { ReactNode } from 'react';
import { NoirStill } from '../cutscene/NoirStill';
import { CADILLAC, Man, Woman } from '../cutscene/figures';

/**
 * Noir stills for the mini-games, drawn in code in the manner of the
 * cutscene art: a courtroom, a card table under one lamp, the back room of
 * the social club, a vault, a ward map on election night, the church and the
 * ceremony room. Unknown keys fall back to the cutscene stills.
 */
const INK = '#07070a';
const LIGHT = '#e9e1cf';

function Grain({ id }: { id: string }) {
  return (
    <>
      <filter id={`${id}g`} x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={3} />
        <feColorMatrix values="0 0 0 0 0.55  0 0 0 0 0.52  0 0 0 0 0.48  0 0 0 0.14 0" />
      </filter>
      <radialGradient id={`${id}v`} cx="0.5" cy="0.48" r="0.72">
        <stop offset="0.5" stopColor="#000" stopOpacity={0} />
        <stop offset="1" stopColor="#000" stopOpacity={0.9} />
      </radialGradient>
      <radialGradient id={`${id}l`}>
        <stop offset="0" stopColor="#ffe6b0" stopOpacity={0.55} />
        <stop offset="1" stopColor="#ffe6b0" stopOpacity={0} />
      </radialGradient>
      <linearGradient id={`${id}c`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffe6b0" stopOpacity={0.45} />
        <stop offset="1" stopColor="#ffe6b0" stopOpacity={0.02} />
      </linearGradient>
    </>
  );
}

const SCENES: Record<string, (id: string) => ReactNode> = {
  courtroom: (id) => (
    <>
      <rect width={800} height={460} fill="#14120f" />
      {/* tall windows with blinds */}
      {[90, 610].map((x) => (
        <g key={x}>
          <rect x={x} y={40} width={100} height={220} fill="#2a2a2e" />
          {Array.from({ length: 14 }, (_, i) => <rect key={i} x={x} y={44 + i * 15} width={100} height={7} fill={LIGHT} opacity={0.35} />)}
          <path d={`M${x},260 L${x - 60},460 L${x + 170},460 L${x + 100},260Z`} fill={`url(#${id}c)`} opacity={0.5} />
        </g>
      ))}
      {/* the bench */}
      <rect x={260} y={150} width={280} height={130} fill="#2b2118" />
      <rect x={250} y={140} width={300} height={16} fill="#3a2c1f" />
      <rect x={385} y={40} width={30} height={90} fill="#3a2c1f" opacity={0.6} />
      <circle cx={400} cy={70} r={22} fill="none" stroke="#6a5a40" strokeWidth={3} />
      <Man x={400} y={150} s={0.62} pose="seatedFront" hat={false} />
      <ellipse cx={400} cy={120} rx={160} ry={90} fill={`url(#${id}l)`} />
      {/* the rail and the tables */}
      <rect x={0} y={330} width={800} height={10} fill="#3a2c1f" />
      {Array.from({ length: 30 }, (_, i) => <rect key={i} x={i * 27 + 4} y={340} width={5} height={40} fill="#2b2118" />)}
      <rect x={60} y={300} width={240} height={14} fill="#2b2118" />
      <rect x={500} y={300} width={240} height={14} fill="#2b2118" />
      <g fill={INK}>
        <Man x={130} y={330} s={0.7} pose="seatedBack" hat={false} />
        <Man x={220} y={330} s={0.7} pose="seatedBack" hat={false} />
        <Man x={590} y={330} s={0.7} pose="seatedBack" hat={false} />
        <Man x={680} y={330} s={0.68} pose="stand" hat={false} flip />
        {[60, 160, 260, 360, 460, 560, 660, 760].map((x, i) => <Man key={x} x={x} y={470} s={0.8} pose="seatedBack" hat={i % 3 === 0} />)}
      </g>
    </>
  ),
  cardtable: (id) => (
    <>
      <rect width={800} height={460} fill="#100d0b" />
      <path d="M400,0 L300,200 L500,200Z" fill={`url(#${id}c)`} />
      <path d="M392,0 L392,60 M408,0 L408,60" stroke="#333" strokeWidth={2} />
      <path d="M370,60 L430,60 L445,85 L355,85Z" fill="#2a2620" />
      <ellipse cx={400} cy={330} rx={330} ry={95} fill="#1c3a26" />
      <ellipse cx={400} cy={330} rx={330} ry={95} fill={`url(#${id}l)`} />
      <ellipse cx={400} cy={330} rx={330} ry={95} fill="none" stroke="#3a2c1f" strokeWidth={14} />
      {[[320, 320, -12], [360, 335, 6], [450, 318, 14], [480, 340, -4]].map(([x, y, r], i) => (
        <rect key={i} x={x} y={y} width={30} height={42} rx={3} fill={LIGHT} transform={`rotate(${r} ${x} ${y})`} opacity={0.85} />
      ))}
      {[[250, 345], [270, 350], [540, 340], [530, 352], [400, 365]].map(([x, y], i) => <ellipse key={i} cx={x} cy={y} rx={12} ry={5} fill={i % 2 ? '#a3352b' : '#d9b75f'} />)}
      <g fill={INK}>
        <Man x={120} y={300} s={0.95} pose="seatedSide" />
        <Man x={680} y={300} s={0.95} pose="seatedSide" flip />
        <Man x={400} y={250} s={0.8} pose="seatedFront" />
      </g>
      <path d="M150,180 q30,-40 10,-80 q-20,-30 5,-60" stroke="#888" strokeWidth={6} fill="none" opacity={0.08} />
    </>
  ),
  club: (id) => (
    <>
      <rect width={800} height={460} fill="#120f0c" />
      <rect x={40} y={60} width={300} height={200} fill="#1d1813" />
      {Array.from({ length: 12 }, (_, i) => <rect key={i} x={44} y={66 + i * 16} width={292} height={7} fill={LIGHT} opacity={0.2} />)}
      <rect x={430} y={90} width={300} height={160} fill="#2a2018" />
      {[460, 520, 580, 640, 700].map((x) => <rect key={x} x={x} y={110} width={14} height={40} fill="#3a4a3a" opacity={0.8} />)}
      <rect x={410} y={250} width={340} height={40} fill="#3a2c1f" />
      <circle cx={600} cy={60} r={30} fill={`url(#${id}l)`} />
      <rect x={598} y={0} width={4} height={50} fill="#333" />
      <rect x={80} y={300} width={220} height={12} fill="#2b2118" />
      <path d="M200,312 L200,420" stroke="#2b2118" strokeWidth={8} />
      <rect x={150} y={270} width={36} height={22} fill="#222" />
      <path d="M150,280 q-20,-20 -10,-40" stroke="#222" strokeWidth={3} fill="none" />
      <g fill={INK}>
        <Man x={520} y={460} s={1.1} pose="lean" />
        <Man x={300} y={460} s={1.05} pose="coat" flip />
      </g>
    </>
  ),
  vault: (id) => (
    <>
      <rect width={800} height={460} fill="#0e0f12" />
      <circle cx={400} cy={220} r={170} fill="#1f2228" stroke="#3a3f48" strokeWidth={16} />
      <circle cx={400} cy={220} r={60} fill="#2a2e36" stroke="#4a505a" strokeWidth={6} />
      {Array.from({ length: 8 }, (_, i) => <rect key={i} x={396} y={140} width={8} height={40} fill="#4a505a" transform={`rotate(${i * 45} 400 220)`} />)}
      <path d="M220,0 L120,460 L300,460Z" fill={`url(#${id}c)`} />
      <g fill={INK}>
        <Man x={150} y={460} s={1.2} pose="lean" />
        <Man x={650} y={460} s={1.15} pose="coat" flip />
      </g>
    </>
  ),
  ward: (id) => (
    <>
      <rect width={800} height={460} fill="#13110e" />
      <rect x={120} y={50} width={560} height={260} fill="#d9d2bf" opacity={0.85} />
      {Array.from({ length: 6 }, (_, i) => (
        <g key={i}>
          <rect x={150} y={80 + i * 36} width={120} height={20} fill="#2a2620" opacity={0.7} />
          <rect x={290} y={80 + i * 36} width={80 + ((i * 53) % 260)} height={20} fill={i % 2 ? '#a3352b' : '#1f3a52'} opacity={0.8} />
        </g>
      ))}
      <circle cx={400} cy={30} r={60} fill={`url(#${id}l)`} />
      <g fill={INK}>
        <Man x={160} y={470} s={1.1} pose="back" />
        <Man x={420} y={470} s={1.15} pose="back" />
        <Woman x={620} y={470} s={1.05} />
      </g>
    </>
  ),
  church: (id) => (
    <>
      <rect width={800} height={460} fill="#110f0d" />
      <path d="M340,40 L400,0 L460,40 L460,220 L340,220Z" fill="#3a2f2a" />
      {[0, 1, 2, 3].map((i) => <rect key={i} x={352 + i * 26} y={60} width={20} height={150} fill={['#7a2a2a', '#c49a3a', '#2a4a7a', '#3a6a3a'][i]} opacity={0.5} />)}
      <path d="M340,220 L200,460 L600,460 L460,220Z" fill={`url(#${id}c)`} opacity={0.7} />
      <rect x={330} y={280} width={140} height={46} rx={6} fill="#5a4a30" />
      {Array.from({ length: 9 }, (_, i) => <ellipse key={i} cx={345 + i * 14} cy={276} rx={8} ry={5} fill="#f0ead8" />)}
      {[300, 500].map((x) => <g key={x}><rect x={x} y={250} width={5} height={70} fill="#d9b75f" /><ellipse cx={x + 2} cy={244} rx={4} ry={8} fill="#ffd890" /><circle cx={x + 2} cy={244} r={24} fill={`url(#${id}l)`} /></g>)}
      <g fill={INK}>
        {[90, 180, 620, 710].map((x, i) => <Man key={x} x={x} y={470} s={1} pose={i % 2 ? 'hatInHand' : 'back'} hat={false} />)}
        <Man x={400} y={470} s={1.1} pose="back" hat={false} />
      </g>
    </>
  ),
  ceremony: (id) => (
    <>
      <rect width={800} height={460} fill="#0d0b09" />
      {Array.from({ length: 12 }, (_, i) => <rect key={i} x={560} y={50 + i * 16} width={180} height={7} fill={LIGHT} opacity={0.12} />)}
      <circle cx={400} cy={250} r={200} fill={`url(#${id}l)`} />
      <ellipse cx={400} cy={330} rx={220} ry={50} fill="#2b2118" />
      <rect x={330} y={318} width={60} height={10} fill="#555" />
      <rect x={410} y={322} width={50} height={4} fill="#aaa" />
      <rect x={385} y={300} width={6} height={20} fill="#e9e1cf" />
      <ellipse cx={388} cy={296} rx={4} ry={8} fill="#ffd890" />
      <rect x={470} y={318} width={22} height={30} fill="#d9c9a0" transform="rotate(-8 470 318)" />
      <g fill={INK}>
        {[110, 230, 570, 690].map((x, i) => <Man key={x} x={x} y={440} s={0.95} pose="stand" hat={false} flip={i > 1} />)}
        <Man x={400} y={300} s={0.75} pose="seatedFront" hat={false} />
      </g>
    </>
  ),
  street: (id) => (
    <>
      <rect width={800} height={460} fill="#0d0e12" />
      <rect x={0} y={360} width={800} height={100} fill="#0a0a0c" />
      <rect x={608} y={80} width={6} height={290} fill="#222" />
      <circle cx={611} cy={80} r={90} fill={`url(#${id}l)`} />
      <path d="M611,84 L540,370 L690,370Z" fill={`url(#${id}c)`} />
      <g transform="translate(160 300) scale(1.1)" fill={INK}><CADILLAC /></g>
      <g fill={INK}><Man x={560} y={372} s={1} pose="coat" flip /></g>
    </>
  ),
};

export function MgStill({ scene, seed = 1 }: { scene: string; seed?: number }) {
  const draw = SCENES[scene];
  if (!draw) return <NoirStill cue={scene} seed={seed} />;
  const id = `mg-${scene}-${seed}-`;
  return (
    <svg viewBox="0 0 800 460" preserveAspectRatio="xMidYMid slice" className="w-full h-full block" role="img" aria-label={scene}>
      <defs><Grain id={id} /></defs>
      {draw(id)}
      <rect width={800} height={460} fill={`url(#${id}v)`} />
      <rect x={-20} y={-20} width={840} height={500} filter={`url(#${id}g)`} />
    </svg>
  );
}
