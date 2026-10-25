import { SIGN_HEX, type BuildStyle, type SignColor } from '../../engine/design';

/**
 * The building's street front, drawn from the authoritative record: its
 * style, its neon, how many stories and how many rooms. Doo Wop first:
 * pastel walls, boomerang roofs, starbursts and a pylon sign you can see
 * from the causeway. Each look the place has had is kept and redrawn in the
 * History tab (the visual gallery).
 */

export const STYLE_PALETTE: Record<BuildStyle, { wall: string; trim: string; roof: string; accent: string; sky: string }> = {
  doowop: { wall: '#f7c6d4', trim: '#5fd3c4', roof: '#f2f0e6', accent: '#ff7a59', sky: '#1d3550' },
  deco: { wall: '#f1e4c6', trim: '#9c7c48', roof: '#d9c79c', accent: '#2f6f73', sky: '#1f2a44' },
  tiki: { wall: '#c98d55', trim: '#4f2f1a', roof: '#d8b25c', accent: '#2e8b57', sky: '#17323a' },
  colonial: { wall: '#f4f1e8', trim: '#2f4f6f', roof: '#5b6770', accent: '#a33a2f', sky: '#1d2b3f' },
  midcentury: { wall: '#e8d9b5', trim: '#d9663b', roof: '#efe9dc', accent: '#3a7d8c', sky: '#1b3242' },
  victorian: { wall: '#bfe0d6', trim: '#f7f2e4', roof: '#7b5a7e', accent: '#e9a23b', sky: '#20263f' },
};

export function Facade({ style, sign, stories, rooms, name, w = 320, h = 170, dim }: { style?: BuildStyle; sign?: SignColor; stories: number; rooms: number; name: string; w?: number; h?: number; dim?: boolean }) {
  const st = style ?? 'doowop';
  const p = STYLE_PALETTE[st];
  const neon = SIGN_HEX[sign ?? 'pink'];
  const floors = Math.max(1, Math.min(6, stories));
  const ground = h - 18;
  const floorH = Math.min(28, (h - 70) / floors);
  const bw = Math.min(w - 90, 120 + Math.min(12, rooms / Math.max(1, floors)) * 9);
  const x0 = 70;
  const top = ground - floors * floorH;
  const perFloor = Math.max(3, Math.min(12, Math.ceil(rooms / floors)));
  const doors: JSX.Element[] = [];
  for (let f = 0; f < floors; f++) {
    for (let i = 0; i < perFloor; i++) {
      const dx = x0 + 8 + i * ((bw - 16) / perFloor);
      const dy = ground - (f + 1) * floorH + 6;
      doors.push(<rect key={`${f}-${i}`} x={dx} y={dy} width={(bw - 16) / perFloor - 4} height={floorH - 9} fill={i % 3 === 1 ? p.accent : p.trim} opacity={0.85} rx={st === 'deco' ? 3 : 0} />);
    }
    if (f > 0) doors.push(<rect key={`bal${f}`} x={x0} y={ground - f * floorH - 2} width={bw} height={3} fill={p.trim} />);
  }
  const roof = (() => {
    switch (st) {
      case 'doowop': return <path d={`M${x0 - 14} ${top + 4} L${x0 + bw * 0.45} ${top - 14} L${x0 + bw + 14} ${top + 2} L${x0 + bw + 14} ${top + 7} L${x0 + bw * 0.45} ${top - 8} L${x0 - 14} ${top + 9} Z`} fill={p.roof} stroke={p.trim} strokeWidth={2} />;
      case 'deco': return <path d={`M${x0} ${top} h${bw} v-6 h-${bw * 0.2} v-8 h-${bw * 0.6} v8 h-${bw * 0.2} Z`} fill={p.roof} stroke={p.trim} />;
      case 'tiki': return <path d={`M${x0 - 10} ${top + 2} L${x0 + bw / 2} ${top - 40} L${x0 + bw + 10} ${top + 2} Z`} fill={p.roof} stroke={p.trim} strokeWidth={2} />;
      case 'colonial': return <path d={`M${x0 - 6} ${top} L${x0 + bw / 2} ${top - 22} L${x0 + bw + 6} ${top} Z`} fill={p.roof} stroke={p.trim} />;
      case 'midcentury': return <rect x={x0 - 18} y={top - 6} width={bw + 36} height={6} fill={p.roof} stroke={p.trim} />;
      case 'victorian': return <g><path d={`M${x0} ${top} L${x0 + bw * 0.25} ${top - 26} L${x0 + bw * 0.5} ${top} Z M${x0 + bw * 0.5} ${top} L${x0 + bw * 0.75} ${top - 26} L${x0 + bw} ${top} Z`} fill={p.roof} stroke={p.trim} /><path d={`M${x0} ${ground - 12} h${bw}`} stroke={p.trim} strokeWidth={3} strokeDasharray="2 3" /></g>;
    }
  })();
  const extras = (() => {
    switch (st) {
      case 'doowop': return <g><polygon points={star(x0 + bw + 30, top - 2, 10, 4, 8)} fill={p.accent} /><polygon points={star(x0 - 30, top + 10, 6, 2.5, 8)} fill={neon} opacity={0.9} /></g>;
      case 'tiki': return <g>{[x0 - 16, x0 + bw + 12].map((x) => <g key={x}><rect x={x} y={ground - 34} width={4} height={34} fill={p.trim} /><circle cx={x + 2} cy={ground - 38} r={4} fill="#ff9a3c" /></g>)}</g>;
      case 'colonial': return <g>{[0.15, 0.35, 0.65, 0.85].map((f) => <rect key={f} x={x0 + bw * f - 3} y={ground - floorH} width={6} height={floorH} fill="#fff" stroke={p.trim} strokeWidth={0.5} />)}</g>;
      case 'deco': return <g><path d={`M${x0 + bw / 2} ${top - 14} v${-14}`} stroke={p.trim} strokeWidth={2} /><circle cx={x0 + bw / 2} cy={top - 30} r={3} fill={neon} /></g>;
      case 'midcentury': return <path d={`M${x0 + bw + 18} ${ground} v-16 a10 10 0 0 1 20 0 v16`} fill="none" stroke={p.accent} strokeWidth={2} />;
      case 'victorian': return <circle cx={x0 + bw * 0.25} cy={top - 10} r={4} fill={p.accent} />;
    }
  })();
  const label = name.replace(/^The /, '').toUpperCase().slice(0, 16);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ maxWidth: w, opacity: dim ? 0.55 : 1 }} role="img" aria-label={`${name}: street front`} data-testid="facade">
      <defs>
        <linearGradient id={`sky-${st}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={p.sky} /><stop offset="1" stopColor="#0b0a09" /></linearGradient>
        <filter id="neon"><feGaussianBlur stdDeviation="1.6" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <rect width={w} height={h} fill={`url(#sky-${st})`} rx={6} />
      <rect x={0} y={ground} width={w} height={h - ground} fill="#2b2620" />
      <rect x={0} y={ground + 6} width={w} height={2} fill="#e8d9b5" opacity={0.25} />
      {roof}
      <rect x={x0} y={top} width={bw} height={ground - top} fill={p.wall} stroke={p.trim} strokeWidth={1.5} />
      {doors}
      {extras}
      <g filter="url(#neon)">
        <rect x={18} y={ground - 92} width={6} height={92} fill="#d8d2c4" />
        <rect x={4} y={ground - 118} width={52} height={30} rx={st === 'doowop' ? 12 : 3} fill="#0b0a09" stroke={neon} strokeWidth={2.2} transform={st === 'doowop' ? `rotate(-8 30 ${ground - 103})` : undefined} />
        <text x={30} y={ground - 99} textAnchor="middle" fontSize={label.length > 9 ? 6.5 : 8.5} fontWeight={700} fill={neon} transform={st === 'doowop' ? `rotate(-8 30 ${ground - 103})` : undefined} style={{ fontFamily: 'ui-sans-serif, system-ui' }}>{label}</text>
        <text x={30} y={ground - 80} textAnchor="middle" fontSize={6} fill={neon}>VACANCY</text>
      </g>
    </svg>
  );
}

function star(cx: number, cy: number, r1: number, r2: number, n: number): string {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? r2 : r1;
    const a = (Math.PI * i) / n;
    pts.push(`${(cx + r * Math.sin(a)).toFixed(1)},${(cy - r * Math.cos(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}
