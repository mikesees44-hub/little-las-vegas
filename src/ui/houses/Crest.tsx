import { memo } from 'react';
import type { LHouse } from '../../engine/houses';

function hash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

const SHIELD = 'M6,4 H54 V30 C54,46 42,56 30,62 C18,56 6,46 6,30 Z';

/** A heraldic shield with the house's initial: field, an ordinary chosen by the house id, and the monogram. */
function CrestImpl({ id, name, colors, extinct, size = 40 }: { id: string; name: string; colors: [string, string]; extinct?: boolean; size?: number }) {
  const [field, metal] = colors;
  const kind = hash(id) % 5;
  const clip = `cr${hash(id).toString(36)}`;
  const letter = name.replace(/^O'/, 'O').charAt(0).toUpperCase();
  return (
    <svg viewBox="0 0 60 66" width={size} height={(size * 66) / 60} role="img" aria-label={`Crest of the house of ${name}`} style={extinct ? { filter: 'grayscale(1)', opacity: 0.7 } : undefined}>
      <defs>
        <clipPath id={clip}><path d={SHIELD} /></clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect x="0" y="0" width="60" height="66" fill={field} />
        {kind === 0 && <rect x="30" y="0" width="30" height="66" fill={metal} opacity="0.28" />}
        {kind === 1 && <path d="M0,46 L30,22 L60,46 L60,56 L30,32 L0,56 Z" fill={metal} opacity="0.35" />}
        {kind === 2 && <path d="M0,0 L14,0 L60,52 L60,66 L46,66 L0,14 Z" fill={metal} opacity="0.3" />}
        {kind === 3 && <rect x="0" y="0" width="60" height="16" fill={metal} opacity="0.32" />}
        {kind === 4 && <path d="M0,0 H60 V66 H0 Z M8,8 V58 H52 V8 Z" fill={metal} opacity="0.25" fillRule="evenodd" />}
      </g>
      <path d={SHIELD} fill="none" stroke={metal} strokeWidth="2.2" />
      <text x="30" y="40" textAnchor="middle" fontSize="27" fontFamily="'Playfair Display', Georgia, serif" fontWeight="700" fill={metal} stroke={field} strokeWidth="0.6">{letter}</text>
      {extinct && <path d="M8,58 L52,8" stroke="#0b0a09" strokeWidth="6" opacity="0.85" />}
    </svg>
  );
}

export const Crest = memo(CrestImpl);

export function HouseCrest({ h, size }: { h: LHouse; size?: number }) {
  return <Crest id={h.id} name={h.name} colors={h.colors} extinct={h.extinct !== undefined} size={size} />;
}
