import type { ReactNode } from 'react';

/**
 * Silhouettes for the noir stills: men in overcoats and fedoras in a handful
 * of poses, women in 1960 dresses, and a '59 Cadillac. Local coordinates put
 * the feet (or the table edge, for seated-front) at y = 0; a standing man is
 * about 180 units tall at scale 1 and faces right.
 */

const INK = '#07070a';

export type Pose = 'stand' | 'walk' | 'run' | 'back' | 'seatedFront' | 'seatedSide' | 'seatedBack' | 'hatInHand' | 'bowed' | 'coat' | 'lean';

function Fedora({ x = 0, y, s = 1 }: { x?: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M-13,-1 C-14,-13 -10,-20 -4,-20 Q0,-17 4,-20 C10,-20 14,-13 13,-1Z" />
      <path d="M-25,0 Q-12,-5 0,-4 Q12,-5 25,0 Q12,4 0,3 Q-12,4 -25,0Z" />
    </g>
  );
}

function Head({ x = 0, y, hat, profile = false, r = 11 }: { x?: number; y: number; hat: boolean; profile?: boolean; r?: number }) {
  return (
    <g>
      <ellipse cx={x} cy={y} rx={r * 0.95} ry={r * 1.13} />
      {profile && <path d={`M${x + r * 0.85},${y - 2} l${r * 0.4},${r * 0.35} l-${r * 0.4},${r * 0.15}Z M${x + r * 0.5},${y + r * 0.7} l${r * 0.3},${r * 0.5} l-${r * 0.6},0Z`} />}
      <rect x={x - r * 0.45} y={y + r * 0.8} width={r * 0.9} height={r * 0.8} />
      {hat && <Fedora x={x} y={y - r * 0.55} s={r / 11} />}
    </g>
  );
}

const STAND = {
  torso: 'M-9,-140 L-22,-134 Q-26,-120 -25,-100 L-24,-38 L24,-38 L25,-100 Q26,-120 22,-134 L9,-140Z',
  arms: 'M-22,-134 Q-31,-131 -32,-118 L-34,-64 L-27,-62 L-25,-112Z M22,-134 Q31,-131 32,-118 L34,-64 L27,-62 L25,-112Z',
  hands: 'M-34,-64 q3,8 7,2 l0,-2Z M34,-64 q-3,8 -7,2 l0,-2Z',
  legs: 'M-19,-40 L-17,-3 L-6,-3 L-3,-38Z M3,-38 L6,-3 L17,-3 L19,-40Z',
  shoes: 'M-19,0 L-3,0 L-5,-5 L-17,-5Z M3,0 L19,0 L17,-5 L5,-5Z',
};

export function Man({ x, y, s = 1, pose = 'stand', hat = true, flip = false, rim }: { x: number; y: number; s?: number; pose?: Pose; hat?: boolean; flip?: boolean; rim?: string }) {
  let body: ReactNode;
  switch (pose) {
    case 'walk':
      body = (
        <>
          <path d="M-6,-140 L-15,-132 Q-19,-110 -17,-80 L-20,-42 L20,-42 L16,-80 Q16,-112 10,-132 L4,-140Z" />
          <path d="M-11,-130 L-24,-82 L-18,-78 L-4,-120Z M8,-130 L22,-86 L16,-82 L2,-122Z" />
          <path d="M-12,-44 L-28,-4 L-18,-2 L0,-40Z M0,-42 L14,-3 L26,-3 L14,-44Z M-31,-2 L-15,0 L-18,-6 L-29,-6Z M12,0 L29,0 L27,-5 L13,-5Z" />
          <Head x={1} y={-152} hat={hat} profile />
        </>
      );
      break;
    case 'run':
      body = (
        <>
          <g transform="rotate(16 0 -44)">
            <path d="M-6,-140 L-15,-132 Q-19,-110 -17,-80 L-18,-44 L18,-44 L16,-80 Q16,-112 10,-132 L4,-140Z" />
            <path d="M8,-130 L26,-112 L32,-124 L37,-120 L28,-100 L2,-118Z M-8,-130 L-30,-104 L-26,-98 L-2,-118Z" />
            <Head x={3} y={-152} hat={hat} profile />
          </g>
          <path d="M-4,-46 L-36,-26 L-40,-14 L-30,-14 L-2,-34Z M2,-46 L24,-20 L14,-2 L26,0 L34,-20 L14,-48Z" />
        </>
      );
      break;
    case 'seatedFront':
      body = (
        <>
          <path d="M-9,-84 L-27,-78 Q-33,-70 -33,-50 L-35,0 L35,0 L33,-50 Q33,-70 27,-78 L9,-84Z" />
          <Head y={-96} hat={hat} />
        </>
      );
      break;
    case 'seatedSide':
      body = (
        <>
          <path d="M-30,-104 L-24,-104 L-24,0 L-30,0Z M-28,-46 L22,-46 L22,-40 L-28,-40Z M16,-40 L20,0 L24,0 L22,-40Z" fill="#141418" />
          <path d="M-8,-114 L-17,-106 Q-20,-82 -18,-62 L-16,-56 L22,-58 L18,-64 Q16,-86 10,-108 L2,-114Z" />
          <path d="M-18,-64 L30,-64 L32,-48 L-16,-46Z M20,-52 L32,-52 L30,-4 L18,-4Z M16,0 L38,0 L36,-6 L18,-6Z" />
          <path d="M4,-106 L30,-84 L44,-86 L46,-80 L28,-72 L-2,-96Z" />
          <Head x={6} y={-126} hat={hat} profile />
        </>
      );
      break;
    case 'seatedBack':
      body = (
        <>
          <path d="M-34,-160 Q-34,-176 -12,-178 L12,-178 Q34,-176 34,-160 L34,-120 L-34,-120Z" />
          <Head y={-196} hat={hat} r={13} />
          <path d="M-40,-126 L40,-126 L42,0 L-42,0Z" fill="#0c0c10" />
          <path d="M-40,-126 L40,-126 L40,-118 L-40,-118Z" fill="#1a1a1e" />
        </>
      );
      break;
    case 'bowed':
      body = (
        <>
          <path d="M-40,-104 Q-38,-136 -10,-140 L10,-140 Q38,-136 40,-104 L44,0 L-44,0Z" />
          <Head y={-140} hat={hat} r={13} />
        </>
      );
      break;
    case 'hatInHand':
      body = (
        <>
          <path d={STAND.torso} />
          <path d="M-22,-134 Q-31,-131 -31,-118 L-27,-86 L-8,-70 L-5,-78 L-20,-92 L-24,-112Z M22,-134 Q31,-131 31,-118 L27,-86 L8,-70 L5,-78 L20,-92 L24,-112Z" />
          <path d={STAND.legs} />
          <path d={STAND.shoes} />
          <g transform="translate(0 -68) rotate(8)">
            <ellipse cx={0} cy={0} rx={20} ry={6} />
            <path d="M-11,0 Q-12,-10 0,-11 Q12,-10 11,0Z" />
          </g>
          <Head y={-152} hat={false} />
        </>
      );
      break;
    case 'coat':
      body = (
        <>
          <path d="M-10,-140 L-32,-132 Q-42,-124 -42,-100 L-38,-22 L38,-22 L42,-100 Q42,-124 32,-132 L10,-140Z" />
          <path d="M-42,-104 L-46,-30 L-38,-28Z M42,-104 L46,-30 L38,-28Z" />
          <path d="M-18,-24 L-17,-3 L-6,-3 L-3,-24Z M3,-24 L6,-3 L17,-3 L18,-24Z" />
          <path d={STAND.shoes} />
          <Head y={-152} hat={hat} />
          {rim && <path d="M-42,-100 Q-42,-124 -32,-132 L-10,-140 M10,-140 L32,-132 Q42,-124 42,-100 M-25,-157 Q-12,-162 0,-161 Q12,-162 25,-157 M-13,-158 C-14,-170 -10,-177 -4,-177" stroke={rim} strokeWidth={1.4} fill="none" opacity={0.7} />}
        </>
      );
      break;
    case 'lean':
      body = (
        <>
          <path d="M-10,-76 L-7,-3 L3,-3 L5,-56 L9,-3 L19,-3 L15,-76Z M-9,0 L5,0 L4,-5 L-8,-5Z M8,0 L24,0 L22,-5 L9,-5Z" />
          <path d="M-12,-80 L16,-70 L48,-108 L42,-124 L22,-130Z" />
          <path d="M30,-122 L42,-90 L50,-90 L42,-124Z M18,-126 L28,-92 L36,-92 L30,-126Z" />
          <rect x={26} y={-94} width={26} height={5} fill="#c8c0b0" opacity={0.25} />
          <Head x={50} y={-134} hat={hat} profile />
        </>
      );
      break;
    default:
      body = (
        <>
          <path d={STAND.torso} />
          <path d={STAND.arms} />
          <path d={STAND.hands} />
          <path d={STAND.legs} />
          <path d={STAND.shoes} />
          <Head y={-152} hat={hat} />
        </>
      );
  }
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`} fill={INK}>
      {rim && pose !== 'coat' && (
        <g fill={rim} opacity={0.55} transform={`translate(${flip ? 1.6 : -1.6} -1.4)`}>
          {body}
        </g>
      )}
      {body}
    </g>
  );
}

export function Woman({ x, y, s = 1, veil = false, bride = false, flip = false }: { x: number; y: number; s?: number; veil?: boolean; bride?: boolean; flip?: boolean }) {
  const fill = bride ? '#ece6d8' : INK;
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
      {bride && <path d="M-6,-152 Q-30,-120 -38,-20 L-20,-24 Q-14,-100 0,-146Z" fill="#f4f0e6" opacity={0.45} />}
      <g fill={INK}>
        <ellipse cx={0} cy={-140} rx={9.5} ry={11} />
        <path d="M-12,-138 Q-15,-162 0,-168 Q15,-162 12,-138 Q12,-150 0,-152 Q-12,-150 -12,-138Z" />
        <rect x={-3.5} y={-131} width={7} height={6} />
      </g>
      <path d="M-7,-126 L-17,-120 L-14,-92 L-10,-84 L10,-84 L14,-92 L17,-120 L7,-126Z" fill={fill} />
      <path d="M-17,-120 L-21,-84 L-17,-82 L-14,-110Z M17,-120 L21,-84 L17,-82 L14,-110Z" fill={fill} />
      <path d={bride ? 'M-10,-86 L-34,-2 Q0,4 34,-2 L10,-86Z' : 'M-10,-86 L-28,-32 Q0,-26 28,-32 L10,-86Z'} fill={fill} />
      {!bride && <path d="M-8,-32 L-7,-1 L-3,-1 L-2,-32Z M2,-32 L3,-1 L7,-1 L8,-32Z M-9,0 L-1,0 L-3,-4 L-8,-4Z M1,0 L9,0 L8,-4 L3,-4Z" fill={INK} />}
      {veil && <path d="M-14,-150 Q0,-160 14,-150 L18,-118 Q0,-112 -18,-118Z" fill={INK} opacity={0.6} />}
      {bride && <path d="M-12,-148 Q0,-160 12,-148" stroke="#f4f0e6" strokeWidth={3} fill="none" />}
    </g>
  );
}

/** A 1959 Cadillac in profile, facing right, wheels on y = 0. ~335 long. */
export function CADILLAC({ lit = false, light = '#e9e1cf' }: { lit?: boolean; light?: string }) {
  return (
    <g>
      <ellipse cx={168} cy={2} rx={175} ry={8} fill="#000" opacity={0.7} />
      <path d="M2,-12 L0,-30 L6,-44 L12,-68 L24,-50 L100,-47 L118,-48 L142,-75 L206,-75 L240,-49 L318,-45 Q331,-42 332,-30 L333,-14 L322,-10 L288,-10 A26,26 0 0 0 236,-10 L101,-10 A26,26 0 0 0 49,-10 Z" fill={INK} />
      {/* glass catching the lamp */}
      <path d="M126,-50 L146,-71 L172,-71 L172,-50Z M178,-50 L178,-71 L204,-71 L230,-50Z" fill={light} opacity={lit ? 0.22 : 0.08} />
      <path d="M150,-70 L136,-52" stroke={light} strokeOpacity={0.35} strokeWidth={3} />
      {/* chrome: the spear down the side, the roof line, the fin edge */}
      <path d="M22,-36 Q170,-40 326,-34" stroke={light} strokeOpacity={0.5} strokeWidth={1.6} fill="none" />
      <path d="M142,-75 L206,-75 L240,-49 L318,-45" stroke={light} strokeOpacity={lit ? 0.55 : 0.2} strokeWidth={1.4} fill="none" />
      <path d="M12,-68 L24,-50 L100,-47" stroke={light} strokeOpacity={0.4} strokeWidth={1.2} fill="none" />
      <path d="M318,-22 H333" stroke={light} strokeOpacity={0.6} strokeWidth={3} />
      {/* wheels */}
      {[75, 262].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy={-8} r={21} fill="#050506" />
          <circle cx={cx} cy={-8} r={11} fill="#2a2a2e" />
          <circle cx={cx} cy={-8} r={11} fill="none" stroke={light} strokeOpacity={0.45} strokeWidth={1.4} />
          <circle cx={cx} cy={-8} r={4} fill={light} opacity={0.3} />
        </g>
      ))}
      {/* the bullet tail-lights */}
      <ellipse cx={9} cy={-56} rx={2.6} ry={5} fill="#ff3020" />
      <ellipse cx={9} cy={-56} rx={12} ry={12} fill="#ff3020" opacity={0.25} />
      <ellipse cx={5} cy={-36} rx={2.2} ry={3} fill="#ff3020" opacity={0.8} />
    </g>
  );
}
