import { memo } from 'react';
import { ageOn } from '../../engine/calendar';
import type { Character, GameDate } from '../../engine/types';

/**
 * Procedurally drawn period portrait. Deterministic from the game seed and the
 * character id: face shape, skin, hair (going grey with age), moustache,
 * fedora, glasses, suit and tie. Women get period hair and pearls; children a
 * plain collar. The dead are drawn in sepia.
 */

function hash(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function rng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const SKIN: Record<string, string[]> = {
  Italian: ['#c99a76', '#b98a66', '#d6aa84', '#a97c5a'],
  Irish: ['#f0cdb4', '#e8bfa2', '#f3d6c0'],
  Jewish: ['#dcb08c', '#cfa07c', '#e4bc98'],
};
const HAIR = ['#17120f', '#2b1f17', '#3d2a1c', '#5a3d27', '#7a3a1c', '#a8854e'];
const SUITS = ['#23252b', '#2e3440', '#3b3128', '#1f2a36', '#40362c', '#2a2a2a', '#4a4a50'];
const TIES = ['#7a1f1f', '#2f4f6f', '#6b5a2a', '#3d5a3a', '#5a2f4f', '#8a6a2a'];
const DRESS = ['#5a1f2a', '#1f3a4a', '#3a2a4a', '#2a4a3a', '#6a4a2a', '#222'];

function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

export interface PortraitProps {
  c: Character;
  seed: string;
  date: GameDate;
  size?: number;
  /** Faction tint for the background. */
  tint?: string;
  className?: string;
}

function PortraitImpl({ c, seed, date, size = 64, tint, className }: PortraitProps) {
  const r = rng(hash(`${seed}:${c.id}:${c.firstName}`));
  const id = `p${hash(c.id + seed).toString(36)}`;
  const age = ageOn(c.birth, c.death ? c.death.date : date);
  const male = c.gender === 'M';
  const child = age < 14;
  const skin = (SKIN[c.ethnicity] ?? SKIN.Italian)[Math.floor(r() * 3)];
  const baseHair = HAIR[Math.floor(r() * (c.ethnicity === 'Irish' ? HAIR.length : 4))];
  const grey = age >= 65 ? 0.85 : age >= 52 ? 0.55 : age >= 42 ? 0.25 : 0;
  const hair = mix(baseHair, '#c9c5be', grey);
  const faceW = 17 + r() * 6 - (child ? 3 : 0);
  const faceH = 22 + r() * 5 - (child ? 4 : 0);
  const square = male && r() < 0.55;
  const style = male
    ? age > 55 && r() < 0.35 ? 'bald' : age > 45 && r() < 0.4 ? 'receding' : ['slick', 'side', 'pompadour', 'slick'][Math.floor(r() * 4)]
    : ['bob', 'curls', 'updo', 'waves'][Math.floor(r() * 4)];
  const stache = male && !child && age >= 20 && r() < 0.42 ? (r() < 0.5 ? 'pencil' : 'full') : 'none';
  const hat = male && !child && c.rank !== 'civilian' && r() < (c.rank === 'boss' ? 0.5 : 0.32);
  const glasses = !child && r() < (age > 50 ? 0.3 : 0.12);
  const suit = SUITS[Math.floor(r() * SUITS.length)];
  const tie = TIES[Math.floor(r() * TIES.length)];
  const dress = DRESS[Math.floor(r() * DRESS.length)];
  const brow = mix(baseHair, '#9a958e', grey * 0.8);
  const cx = 50;
  const cy = 54;
  const eyeY = cy - 2;
  const eyeDx = faceW * 0.38;
  const bg = tint ?? '#2a2622';
  const dead = !c.alive;

  return (
    <svg viewBox="0 0 100 120" width={size} height={(size * 120) / 100} className={className} role="img" aria-label={`Portrait of ${c.firstName} ${c.lastName}`}>
      <defs>
        <radialGradient id={`${id}bg`} cx="50%" cy="40%" r="70%">
          <stop offset="0%" stopColor={mix(bg, '#ffffff', 0.12)} />
          <stop offset="100%" stopColor={mix(bg, '#000000', 0.55)} />
        </radialGradient>
        <filter id={`${id}sepia`}>
          <feColorMatrix type="matrix" values="0.39 0.77 0.19 0 0  0.35 0.69 0.17 0 0  0.27 0.53 0.13 0 0  0 0 0 1 0" />
        </filter>
      </defs>
      <rect x="0" y="0" width="100" height="120" rx="6" fill={`url(#${id}bg)`} />
      <g filter={dead ? `url(#${id}sepia)` : undefined} opacity={dead ? 0.85 : 1}>
        {/* body */}
        {male && !child ? (
          <>
            <path d="M6,120 Q8,94 34,87 L66,87 Q92,94 94,120 Z" fill={suit} />
            <path d="M40,87 L50,108 L60,87 Z" fill="#eee9df" />
            <path d="M47.5,92 L52.5,92 L54,112 L50,117 L46,112 Z" fill={tie} />
            <path d="M34,87 L44,87 L50,108 L41,99 Z" fill={mix(suit, '#000', 0.35)} />
            <path d="M66,87 L56,87 L50,108 L59,99 Z" fill={mix(suit, '#000', 0.35)} />
          </>
        ) : male || child ? (
          <path d="M14,120 Q16,96 36,89 L64,89 Q84,96 86,120 Z" fill={child ? '#6a7f96' : suit} />
        ) : (
          <>
            <path d="M10,120 Q12,96 34,89 L66,89 Q88,96 90,120 Z" fill={dress} />
            <path d="M38,89 Q50,104 62,89 Z" fill={skin} />
            {Array.from({ length: 9 }, (_, i) => (
              <circle key={i} cx={40 + i * 2.5} cy={95 + Math.sin((i / 8) * Math.PI) * 4} r="1.2" fill="#f4efe6" />
            ))}
          </>
        )}
        {/* neck */}
        <rect x={cx - 7} y={cy + faceH - 8} width="14" height="14" fill={mix(skin, '#000', 0.12)} />
        {/* back hair for women */}
        {!male && style !== 'updo' && <ellipse cx={cx} cy={cy + 4} rx={faceW + 6} ry={faceH + 4} fill={hair} />}
        {/* ears */}
        <ellipse cx={cx - faceW} cy={cy} rx="3.2" ry="5" fill={mix(skin, '#000', 0.08)} />
        <ellipse cx={cx + faceW} cy={cy} rx="3.2" ry="5" fill={mix(skin, '#000', 0.08)} />
        {/* face */}
        <ellipse cx={cx} cy={cy} rx={faceW} ry={faceH} fill={skin} />
        {square && <rect x={cx - faceW * 0.8} y={cy + 4} width={faceW * 1.6} height={faceH * 0.65} rx="6" fill={skin} />}
        {/* hair */}
        {male && style === 'slick' && <path d={`M${cx - faceW},${cy - 4} Q${cx - faceW},${cy - faceH - 6} ${cx},${cy - faceH - 5} Q${cx + faceW},${cy - faceH - 6} ${cx + faceW},${cy - 4} Q${cx + faceW - 2},${cy - faceH + 4} ${cx},${cy - faceH + 3} Q${cx - faceW + 2},${cy - faceH + 4} ${cx - faceW},${cy - 4} Z`} fill={hair} />}
        {male && style === 'side' && <path d={`M${cx - faceW},${cy - 2} Q${cx - faceW - 1},${cy - faceH - 6} ${cx + 4},${cy - faceH - 5} Q${cx + faceW + 1},${cy - faceH - 3} ${cx + faceW},${cy - 3} L${cx + faceW - 3},${cy - faceH + 6} L${cx - 6},${cy - faceH + 4} L${cx - faceW + 2},${cy - 4} Z`} fill={hair} />}
        {male && style === 'pompadour' && <path d={`M${cx - faceW},${cy - 4} Q${cx - faceW - 2},${cy - faceH - 11} ${cx + 2},${cy - faceH - 10} Q${cx + faceW + 3},${cy - faceH - 8} ${cx + faceW},${cy - 4} Q${cx},${cy - faceH + 2} ${cx - faceW},${cy - 4} Z`} fill={hair} />}
        {male && style === 'receding' && <path d={`M${cx - faceW},${cy - 2} Q${cx - faceW},${cy - faceH - 2} ${cx - faceW + 6},${cy - faceH + 2} L${cx - faceW + 3},${cy - 2} Z M${cx + faceW},${cy - 2} Q${cx + faceW},${cy - faceH - 2} ${cx + faceW - 6},${cy - faceH + 2} L${cx + faceW - 3},${cy - 2} Z`} fill={hair} />}
        {male && style === 'bald' && <path d={`M${cx - faceW},${cy + 2} Q${cx - faceW - 1},${cy - 8} ${cx - faceW + 3},${cy - 10} L${cx - faceW + 2},${cy + 2} Z M${cx + faceW},${cy + 2} Q${cx + faceW + 1},${cy - 8} ${cx + faceW - 3},${cy - 10} L${cx + faceW - 2},${cy + 2} Z`} fill={hair} />}
        {!male && <path d={`M${cx - faceW - 2},${cy - 2} Q${cx - faceW},${cy - faceH - 8} ${cx},${cy - faceH - 6} Q${cx + faceW},${cy - faceH - 8} ${cx + faceW + 2},${cy - 2} Q${cx + faceW - 4},${cy - faceH + 2} ${cx + 2},${cy - faceH + 5} Q${cx - faceW + 2},${cy - faceH + 2} ${cx - faceW - 2},${cy - 2} Z`} fill={hair} />}
        {!male && style === 'updo' && <ellipse cx={cx} cy={cy - faceH - 8} rx="9" ry="7" fill={hair} />}
        {!male && style === 'curls' && [-1, 1].map((sgn) => [0, 1, 2].map((i) => <circle key={`${sgn}${i}`} cx={cx + sgn * (faceW + 2)} cy={cy - 6 + i * 7} r="4.5" fill={hair} />))}
        {/* brows & eyes */}
        <path d={`M${cx - eyeDx - 5},${eyeY - 6} L${cx - eyeDx + 4},${eyeY - 7}`} stroke={brow} strokeWidth={male ? 2.4 : 1.4} strokeLinecap="round" />
        <path d={`M${cx + eyeDx - 4},${eyeY - 7} L${cx + eyeDx + 5},${eyeY - 6}`} stroke={brow} strokeWidth={male ? 2.4 : 1.4} strokeLinecap="round" />
        <ellipse cx={cx - eyeDx} cy={eyeY} rx="2.6" ry="1.7" fill="#1a1512" />
        <ellipse cx={cx + eyeDx} cy={eyeY} rx="2.6" ry="1.7" fill="#1a1512" />
        {!male && <path d={`M${cx - eyeDx - 3},${eyeY - 1.5} l-1.5,-1 M${cx + eyeDx + 3},${eyeY - 1.5} l1.5,-1`} stroke="#1a1512" strokeWidth="0.8" />}
        {/* nose & mouth */}
        <path d={`M${cx},${eyeY + 1} L${cx - 2.5},${eyeY + 10} L${cx + 1.5},${eyeY + 11}`} stroke={mix(skin, '#000', 0.35)} strokeWidth="1.2" fill="none" strokeLinecap="round" />
        <path d={`M${cx - 5.5},${eyeY + 17} Q${cx},${eyeY + (r() < 0.5 ? 18.5 : 16.5)} ${cx + 5.5},${eyeY + 17}`} stroke={male ? '#5a3a2e' : '#8a2a2e'} strokeWidth={male ? 1.4 : 2.2} fill="none" strokeLinecap="round" />
        {stache === 'pencil' && <path d={`M${cx - 6},${eyeY + 14} Q${cx},${eyeY + 12.5} ${cx + 6},${eyeY + 14}`} stroke={hair} strokeWidth="1.3" fill="none" />}
        {stache === 'full' && <path d={`M${cx - 8},${eyeY + 15.5} Q${cx - 4},${eyeY + 11} ${cx},${eyeY + 13} Q${cx + 4},${eyeY + 11} ${cx + 8},${eyeY + 15.5} Q${cx},${eyeY + 15} ${cx - 8},${eyeY + 15.5} Z`} fill={hair} />}
        {/* age lines */}
        {age >= 50 && (
          <g stroke={mix(skin, '#000', 0.3)} strokeWidth="0.7" fill="none" opacity="0.8">
            <path d={`M${cx - 8},${cy - faceH + 9} q8,-2 16,0`} />
            {age >= 60 && <path d={`M${cx - 7},${cy - faceH + 12} q7,-1.5 14,0`} />}
            <path d={`M${cx - 6},${eyeY + 9} q-2,5 -1,9 M${cx + 6},${eyeY + 9} q2,5 1,9`} />
          </g>
        )}
        {glasses && (
          <g stroke="#1a1512" strokeWidth="1.2" fill="rgba(200,220,230,0.12)">
            <rect x={cx - eyeDx - 5} y={eyeY - 4} width="10" height="7.5" rx="2.5" />
            <rect x={cx + eyeDx - 5} y={eyeY - 4} width="10" height="7.5" rx="2.5" />
            <path d={`M${cx - eyeDx + 5},${eyeY - 1} L${cx + eyeDx - 5},${eyeY - 1}`} />
          </g>
        )}
        {hat && (
          <g>
            <ellipse cx={cx} cy={cy - faceH + 3} rx={faceW + 13} ry="5" fill={mix(suit, '#000', 0.25)} />
            <path d={`M${cx - faceW + 1},${cy - faceH + 3} Q${cx - faceW},${cy - faceH - 15} ${cx},${cy - faceH - 14} Q${cx + faceW},${cy - faceH - 15} ${cx + faceW - 1},${cy - faceH + 3} Z`} fill={mix(suit, '#000', 0.15)} />
            <path d={`M${cx - 6},${cy - faceH - 12} Q${cx},${cy - faceH - 8} ${cx + 6},${cy - faceH - 12}`} stroke={mix(suit, '#000', 0.45)} strokeWidth="1.2" fill="none" />
            <rect x={cx - faceW + 1} y={cy - faceH - 2} width={faceW * 2 - 2} height="4" fill="#111" />
          </g>
        )}
      </g>
      <rect x="0.5" y="0.5" width="99" height="119" rx="6" fill="none" stroke={dead ? '#5a4a3a' : '#9c7a2c'} strokeOpacity="0.6" />
      {dead && <text x="88" y="16" fontSize="12" fill="#c49a3a" textAnchor="middle">†</text>}
    </svg>
  );
}

export const Portrait = memo(PortraitImpl);
