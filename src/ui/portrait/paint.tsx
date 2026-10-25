import type { ReactElement, ReactNode } from 'react';
import type { Ethnicity, Rank, Specialty } from '../../engine/types';
import type { Expression, Genes } from './genes';

/**
 * The painter. Builds one portrait (an SVG <g> in a 100x120 box) from a Look.
 * Everything is flat paths + a handful of shared soft gradients: shading is
 * done by laying translucent radial "dabs" (dark and light) over the forms,
 * which reads as brushwork at small sizes and stays cheap to render.
 */

export interface Look {
  id: string;
  name: string;
  male: boolean;
  age: number;
  ethnicity: Ethnicity;
  rank: Rank;
  office?: string;
  specialty?: Specialty;
  frontMan: boolean;
  dead: boolean;
  jailed: boolean;
  tint?: string;
  genes: Genes;
  /** Chosen hair style / moustache (character creator); ignored where it can't apply. */
  hairStyle?: string;
  stache?: string;
  hat?: string;
  mood: Expression;
  r: () => number;
  serial: number;
}

/* ---------------- colour ---------------- */

const f = (n: number) => Math.round(n * 10) / 10;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function rgb(h: string): [number, number, number] {
  const s = h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h;
  return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
}
export function mix(a: string, b: string, t: number): string {
  const pa = rgb(a);
  const pb = rgb(b);
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
const dark = (c: string, t: number) => mix(c, '#140c08', t);
const lite = (c: string, t: number) => mix(c, '#fff4e2', t);

function pickFrom<T>(arr: readonly T[], x: number): T {
  return arr[Math.min(arr.length - 1, Math.floor(x * arr.length))];
}

/** 'Black': Great Migration families of the house trees (not an engine ethnicity). */
const SKIN: Record<Ethnicity | 'Black', [string, string, string]> = {
  Italian: ['#ecc6a0', '#cf9f76', '#a57552'],
  Irish: ['#f7e0cf', '#efc9ae', '#dfb093'],
  Jewish: ['#f2d0b2', '#dcb18c', '#bb8c68'],
  Black: ['#a9785a', '#7f5139', '#5a3524'],
};
const HAIR: Record<Ethnicity | 'Black', string[]> = {
  Italian: ['#110d0b', '#1a1310', '#251a13', '#33241a', '#46301f'],
  Irish: ['#231912', '#3f2a1c', '#5e3a23', '#7e4123', '#9c4f26', '#a8865a'],
  Jewish: ['#120e0c', '#231912', '#35251a', '#4d3424', '#6e4128'],
  Black: ['#0e0b0a', '#16110e', '#1f1712'],
};
const IRIS: Record<Ethnicity | 'Black', string[]> = {
  Italian: ['#2f1d11', '#3d2716', '#4a3119', '#5c4a25'],
  Irish: ['#4b6d8c', '#5f86a0', '#5b6d48', '#6d777c', '#3d2716'],
  Jewish: ['#2f1d11', '#3d2716', '#5c4a25', '#4b6d8c'],
  Black: ['#24170e', '#2f1d11', '#3d2716'],
};
const SUITS = ['#24262c', '#2c3340', '#3a3128', '#1f2935', '#3f362c', '#2b2b2e', '#47474d', '#30352f'];
const TIES = ['#7a1f22', '#2f4a6a', '#6b5428', '#2f4f36', '#5a2f4f', '#8a6326', '#3a3a40'];
const DRESS = ['#6a1f2a', '#1f3f52', '#3d2b55', '#24503f', '#7a4f26', '#1c1a1e', '#8a6a5a', '#2f4f6f'];
const HATS = ['#2a292b', '#46372a', '#55555a', '#1b1a19', '#3c3a33'];
const LIPSTICK = ['#9b2633', '#a8343c', '#7f1f2c', '#b04a4a'];

/* ---------------- geometry ---------------- */

interface Geo {
  cx: number;
  top: number;
  hw: number;
  cheekW: number;
  jawW: number;
  chinW: number;
  eyeY: number;
  chinY: number;
  templeY: number;
  cheekY: number;
  jawY: number;
  eyeDx: number;
  ew: number;
  eh: number;
  browY: number;
  noseY: number;
  noseW: number;
  mouthY: number;
  mouthW: number;
  neckW: number;
  shY: number;
  hl: number;
}

function headPath(g: Geo): string {
  const { cx, top, hw, cheekW, jawW, chinW, chinY, jawY, cheekY, templeY } = g;
  const R = (x: number) => f(cx + x);
  const L = (x: number) => f(cx - x);
  return [
    `M${L(chinW)},${f(chinY - 1.2)} Q${cx},${f(chinY + 1.3)} ${R(chinW)},${f(chinY - 1.2)}`,
    `C${R(chinW + 3.6)},${f(chinY - 0.6)} ${R(jawW + 0.1)},${f(jawY + 3.4)} ${R(jawW)},${f(jawY)}`,
    `C${R(jawW + 0.7)},${f(jawY - 4)} ${R(cheekW)},${f(cheekY + 4)} ${R(cheekW)},${f(cheekY)}`,
    `C${R(cheekW)},${f(cheekY - 6)} ${R(hw)},${f(templeY + 3)} ${R(hw)},${f(templeY)}`,
    `C${R(hw + 0.2)},${f(top + 9)} ${R(hw * 0.6)},${f(top)} ${cx},${f(top)}`,
    `C${L(hw * 0.6)},${f(top)} ${L(hw + 0.2)},${f(top + 9)} ${L(hw)},${f(templeY)}`,
    `C${L(hw)},${f(templeY + 3)} ${L(cheekW)},${f(cheekY - 6)} ${L(cheekW)},${f(cheekY)}`,
    `C${L(cheekW)},${f(cheekY + 4)} ${L(jawW + 0.7)},${f(jawY - 4)} ${L(jawW)},${f(jawY)}`,
    `C${L(jawW + 0.1)},${f(jawY + 3.4)} ${L(chinW + 3.6)},${f(chinY - 0.6)} ${L(chinW)},${f(chinY - 1.2)}Z`,
  ].join('');
}

/* ---------------- roles ---------------- */

type Outfit = 'suit' | 'boss' | 'sharkskin' | 'leather' | 'openCollar' | 'sport' | 'cardigan' | 'work' | 'cop' | 'priest' | 'judge' | 'bowtie' | 'fed' | 'dress' | 'girl' | 'boy';
type Hat = 'none' | 'fedora' | 'police' | 'flatcap';

function dressFor(L: Look, x: () => number): { outfit: Outfit; hat: Hat; glasses: number } {
  const { male, age, rank } = L;
  const office = (L.office ?? '').toLowerCase();
  let glasses = age > 48 ? 0.28 : 0.08;
  if (age < 13) return { outfit: male ? 'boy' : 'girl', hat: 'none', glasses: 0.03 };
  if (!male) return { outfit: 'dress', hat: 'none', glasses: age > 45 ? 0.25 : 0.06 };
  const roll = x();
  if (/police|chief|patrol|trooper|sheriff/.test(office)) return { outfit: 'cop', hat: 'police', glasses: 0.1 };
  if (/priest|father|monsignor|pastor|reverend/.test(office)) return { outfit: 'priest', hat: 'none', glasses: 0.35 };
  if (/judge|justice/.test(office)) return { outfit: 'judge', hat: 'none', glasses: 0.5 };
  if (/council|assembly|mayor|senator|commissioner|freeholder|politic/.test(office)) return { outfit: 'bowtie', hat: roll < 0.3 ? 'fedora' : 'none', glasses: 0.3 };
  if (/irs|fbi|agent|federal|treasury/.test(office)) return { outfit: 'fed', hat: roll < 0.5 ? 'fedora' : 'none', glasses: 0.75 };
  switch (L.specialty) {
    case 'lawyer':
    case 'accountant':
      return { outfit: roll < 0.4 ? 'bowtie' : 'suit', hat: 'none', glasses: 0.7 };
    case 'doctor':
      return { outfit: 'suit', hat: 'none', glasses: 0.6 };
    case 'wheelman':
      return { outfit: 'leather', hat: roll < 0.6 ? 'flatcap' : 'none', glasses };
    case 'safecracker':
      return { outfit: 'work', hat: 'flatcap', glasses: 0.4 };
    case 'forger':
      return { outfit: 'cardigan', hat: 'none', glasses: 0.8 };
    case 'torpedo':
      return { outfit: roll < 0.5 ? 'leather' : 'openCollar', hat: roll < 0.25 ? 'fedora' : 'none', glasses: 0.02 };
    default:
  }
  switch (rank) {
    case 'boss':
      return { outfit: 'boss', hat: roll < 0.7 ? 'fedora' : 'none', glasses };
    case 'underboss':
      return { outfit: roll < 0.5 ? 'boss' : 'suit', hat: roll < 0.4 ? 'fedora' : 'none', glasses };
    case 'consigliere':
      return { outfit: roll < 0.3 ? 'bowtie' : 'suit', hat: roll > 0.75 ? 'fedora' : 'none', glasses: glasses + 0.35 };
    case 'capo':
      return { outfit: 'sharkskin', hat: roll < 0.35 ? 'fedora' : 'none', glasses };
    case 'soldier':
      return { outfit: roll < 0.5 ? 'leather' : roll < 0.8 ? 'openCollar' : 'sport', hat: roll > 0.85 ? 'fedora' : 'none', glasses };
    case 'associate':
      return { outfit: roll < 0.35 ? 'openCollar' : roll < 0.6 ? 'leather' : roll < 0.8 ? 'work' : 'sport', hat: roll > 0.8 ? 'flatcap' : 'none', glasses };
    default:
      if (L.frontMan) return { outfit: roll < 0.5 ? 'suit' : 'bowtie', hat: 'none', glasses: glasses + 0.2 };
      return { outfit: age > 55 ? (roll < 0.5 ? 'cardigan' : 'suit') : roll < 0.3 ? 'work' : roll < 0.6 ? 'sport' : roll < 0.8 ? 'openCollar' : 'suit', hat: roll > 0.85 ? 'flatcap' : 'none', glasses };
  }
}

/* ---------------- painter ---------------- */

/** Hair styles a sitter can choose (character creator). */
export const MALE_STYLES: string[] = ['slick', 'side', 'pomp', 'crew', 'wavy', 'thin', 'bald'];
export const FEMALE_STYLES: string[] = ['bouffant', 'flip', 'curls', 'chignon'];
export const STACHES: string[] = ['none', 'pencil', 'chevron'];

export function paintPortrait(L: Look): ReactElement {
  const { id, male, age, genes: G, mood, r } = L;
  const t = Math.pow(clamp((age - 3) / 15, 0, 1), 1.4); // 0 = small child, 1 = grown
  const kid = 1 - t;
  const cx = 50;
  const adult = age >= 16;
  const u = (k: string) => `url(#${id}${k})`;

  /* ---- palette ---- */
  const skinBase = (() => {
    const [a, b, c] = SKIN[L.ethnicity] ?? SKIN.Italian;
    const s = G.skin;
    let k = s < 0.5 ? mix(a, b, s * 2) : mix(b, c, (s - 0.5) * 2);
    if (age > 62) k = mix(k, '#d8c2b0', clamp((age - 62) / 40, 0, 0.25));
    if (kid > 0.3) k = mix(k, '#f8d8c4', kid * 0.15);
    return k;
  })();
  const skinHi = lite(skinBase, 0.3);
  const skinSh = mix(skinBase, '#5a2418', 0.38);
  const skinDeep = mix(skinBase, '#2a0e08', 0.55);
  const rawHair = pickFrom(HAIR[L.ethnicity] ?? HAIR.Italian, G.hair);
  const youthHair = kid > 0.4 ? mix(rawHair, '#9a7448', (kid - 0.4) * 0.5) : rawHair;
  const greyT = male ? clamp((age - 34 - G.grey * 16) / 32, 0, 0.94) : clamp((age - 40 - G.grey * 16) / 34, 0, 0.9);
  const hair = mix(youthHair, age > 75 ? '#e2ddd4' : '#b9b4ac', greyT);
  const hairHi = lite(hair, greyT > 0.5 ? 0.35 : 0.22);
  const hairDk = dark(hair, 0.45);
  const brow = mix(youthHair, '#a7a199', greyT * 0.75);
  const stacheCol = mix(youthHair, '#c4bfb6', clamp(greyT * 1.15, 0, 1));
  const iris = pickFrom(IRIS[L.ethnicity] ?? IRIS.Italian, G.eyeColor);
  const look = r(); // consumed in fixed order below for determinism
  const dressRoll = r();
  const { outfit, hat: hat0, glasses: glassesP } = dressFor(L, r);
  const hatPick: Hat = L.hat === 'none' ? 'none' : L.hat === 'fedora' && male && hat0 !== 'police' ? 'fedora' : hat0;
  const hat: Hat = L.jailed || L.dead ? (hat0 === 'police' && L.dead ? 'police' : 'none') : hatPick;
  const wearsGlasses = r() < glassesP;
  const browline = r() < 0.55;
  const stacheRoll = r();
  const stacheOk = male && age >= 21 && outfit !== 'priest' && outfit !== 'cop';
  const stache = stacheOk && (L.stache === 'none' || L.stache === 'pencil' || L.stache === 'chevron') ? L.stache : stacheOk ? (stacheRoll < 0.14 ? 'pencil' : stacheRoll < 0.3 + clamp((age - 40) / 120, 0, 0.15) ? 'chevron' : 'none') : 'none';
  const suit = pickFrom(SUITS, r());
  const tie = pickFrom(TIES, r());
  const dress = pickFrom(DRESS, r());
  const hatCol = pickFrom(HATS, r());
  const lip = male || kid > 0.5 ? mix(skinBase, '#9a4a44', kid > 0.5 ? 0.3 : 0.38) : pickFrom(LIPSTICK, r());
  const bg = L.tint ?? '#3a3128';

  /* ---- face geometry ---- */
  const heavy = male && adult && G.heavy > 0.72 ? (G.heavy - 0.72) * 5 : 0; // 0..1.4
  const jowl = age > 48 ? clamp((age - 48) / 22, 0, 1) * (0.6 + G.heavy * 0.9) : 0;
  const eyeY = lerp(57, 53.5, t);
  const faceLen = lerp(18.5, 22.6 + G.faceLen * 5.4 - (male ? 0 : 1.6), t) + jowl * 0.8;
  const cheekW = lerp(17.8, 17 + G.cheek * 3.4 - (male ? 0 : 1) + heavy * 0.6, t);
  const eyeShape = Math.floor(G.eyes * 4); // 0 almond 1 round 2 hooded 3 deep-set
  let eh = [1.85, 2.2, 1.65, 1.45][eyeShape] * lerp(1.22, 1, t) * (age > 62 ? 0.88 : 1);
  if (mood === 'scowl' || mood === 'stern') eh *= 0.84;
  if (mood === 'smirk') eh *= 0.9;
  if (mood === 'wary') eh *= 1.1;
  const g0: Geo = {
    cx,
    eyeY,
    top: eyeY - lerp(29, 27, t),
    cheekW,
    hw: cheekW - 0.4 + kid * 0.9,
    jawW: lerp(13.8, male ? 14.2 + G.jaw * 4 + heavy : 12.6 + G.jaw * 2.8, t) + jowl * 1.3,
    chinW: lerp(5.5, male ? 5 + G.chin * 4.2 + heavy * 0.8 : 3.8 + G.chin * 2.6, t) + jowl * 0.8,
    chinY: eyeY + faceLen,
    templeY: eyeY - 9,
    cheekY: eyeY + lerp(4.2, 5, t),
    jawY: eyeY + faceLen - lerp(7.5, 8.6, t) + jowl * 1.6,
    eyeDx: lerp(7.6, 7.4 + G.cheek * 0.8, t),
    ew: lerp(3.4, 3.7, t),
    eh,
    browY: eyeY - lerp(4.6, 4.9, t) - (eyeShape === 3 ? -0.4 : 0),
    noseY: 0,
    noseW: 0,
    mouthY: 0,
    mouthW: lerp(3.8, (male ? 5.6 : 5) + G.lips * 0.9, t),
    neckW: male ? lerp(5.6, 8.2 + G.heavy * 1.8, t) : lerp(5.3, 6.4, t),
    shY: eyeY + faceLen + lerp(11, 9.5, t),
    hl: 0,
  };
  const noseType = kid > 0.55 ? 2 : Math.floor(G.nose * 5); // 0 straight 1 roman 2 snub 3 broad 4 hooked
  g0.noseY = eyeY + lerp(8, 10.2 + G.noseSize * 2.2 + (noseType === 4 ? 0.7 : 0), t);
  g0.noseW = lerp(2.1, 2.6 + G.noseSize * 1.1 + (noseType === 3 ? 0.8 : 0) + heavy * 0.3, t);
  g0.mouthY = Math.min(g0.noseY + lerp(4.6, 5.6, t), g0.chinY - lerp(4.6, 6, t));
  const recede = male ? clamp(G.bald * 1.35 - 0.2, 0, 1) * clamp((age - 22) / 42, 0, 1) : 0;
  g0.hl = eyeY - lerp(14.5, 16.8, t) - recede * 6;
  const g = g0;
  const { eyeDx, ew, browY, noseY, noseW, mouthY, mouthW, chinY, neckW, shY, top, hw } = g;

  /* ---- expression ---- */
  const corners: [number, number] =
    mood === 'scowl' ? [0.9, 0.9] : mood === 'stern' ? [0.45, 0.45] : mood === 'smirk' ? [0.15, -1.2] : mood === 'warm' ? [-0.75, -0.75] : mood === 'wary' ? [0.3, 0.2] : [0.25, 0.25];
  // per side: [inner dy, outer dy]; + is down
  const browL: [number, number] = mood === 'scowl' ? [1.7, -0.4] : mood === 'stern' ? [0.8, 0.1] : mood === 'wary' ? [-1, 0.2] : mood === 'smirk' ? [-0.2, -0.9] : mood === 'warm' ? [-0.3, 0.2] : [0, 0];
  const browR: [number, number] = mood === 'smirk' ? [0.5, 0.2] : browL;

  const els: ReactNode[] = [];
  const push = (n: ReactNode) => els.push(n);
  let k = 0;
  const key = () => `k${k++}`;
  const dab = (x: number, y: number, rx: number, ry: number, op: number, kind: 'd' | 'l' | 'w' | 's' | 'b' = 'd', rot = 0) =>
    push(<ellipse key={key()} cx={f(x)} cy={f(y)} rx={f(rx)} ry={f(ry)} fill={u(kind)} opacity={f(op * 100) / 100} transform={rot ? `rotate(${rot} ${f(x)} ${f(y)})` : undefined} />);
  const line = (d: string, stroke: string, w: number, op = 1, extra: Record<string, unknown> = {}) =>
    push(<path key={key()} d={d} stroke={stroke} strokeWidth={w} opacity={op} fill="none" strokeLinecap="round" strokeLinejoin="round" {...extra} />);
  const shape = (d: string, fill: string, op = 1, extra: Record<string, unknown> = {}) => push(<path key={key()} d={d} fill={fill} opacity={op} {...extra} />);

  /* ================= background ================= */
  if (L.jailed) {
    shape('M0,0H100V120H0Z', u('jb'));
    for (let i = 0; i < 6; i++) {
      const x = 7 + i * 17.5;
      shape(`M${x},0h4.6v120h-4.6Z`, u('bar'));
    }
    shape('M0,22h100v3.2H0Z', u('bar'), 0.9);
  } else {
    shape('M0,0H100V120H0Z', u('bg'));
    dab(66, 34, 34, 30, 0.35, 'l');
    // loose brushwork in the ground
    const br = mulberry(L.serial * 7 + 3);
    for (let i = 0; i < 7; i++) {
      const x = br() * 100;
      const y = br() * 90;
      const len = 20 + br() * 30;
      const ang = -0.6 + br() * 0.5;
      line(`M${f(x)},${f(y)} q${f(len * 0.5)},${f(len * ang * 0.5 - 3)} ${f(len)},${f(len * ang)}`, br() < 0.5 ? mix(bg, '#e8cf9a', 0.35) : mix(bg, '#000', 0.5), 4 + br() * 6, 0.07 + br() * 0.06);
    }
  }

  const figStart = els.length;

  /* ================= hair behind the head ================= */
  type HairStyle = 'slick' | 'side' | 'pomp' | 'crew' | 'wavy' | 'thin' | 'bald' | 'bouffant' | 'curls' | 'flip' | 'chignon' | 'girl' | 'boy';
  let style: HairStyle;
  if (male) {
    if (age < 13) style = 'boy';
    else if (recede > 0.8) style = 'bald';
    else if (recede > 0.56) style = 'thin';
    else {
      const s = (G.wave + look) % 1;
      style = G.wave > 0.78 ? 'wavy' : age < 32 && s < 0.3 ? 'pomp' : outfit === 'cop' || outfit === 'fed' || (s > 0.82 && age < 45) ? 'crew' : s < 0.55 ? 'slick' : 'side';
    }
  } else if (age < 13) style = 'girl';
  else if (age > 55) style = G.wave > 0.4 ? 'curls' : 'chignon';
  else if (age < 21) style = pickFrom(['flip', 'bouffant', 'flip'] as const, (G.wave * 0.6 + look * 0.4) % 1);
  else style = pickFrom(['bouffant', 'flip', 'curls', 'chignon', 'bouffant'] as const, (G.wave * 0.6 + look * 0.4) % 1);
  if (L.hairStyle && age >= 13) {
    const want = L.hairStyle as HairStyle;
    if (male ? MALE_STYLES.includes(want) : FEMALE_STYLES.includes(want)) style = want;
  }

  const backHair = (d: string) => {
    shape(d, u('hr'));
    shape(d, u('hs'), 0.6);
  };
  if (style === 'bouffant') backHair(`M${cx - hw - 2},${chinY - 6} C${cx - hw - 7},${chinY - 7} ${cx - hw - 7.5},${top + 2} ${cx},${top - 8.5} C${cx + hw + 7.5},${top + 2} ${cx + hw + 7},${chinY - 7} ${cx + hw + 2},${chinY - 6} Q${cx + hw + 7},${chinY - 1} ${cx + hw + 4},${chinY + 1} Q${cx},${chinY - 4} ${cx - hw - 4},${chinY + 1} Q${cx - hw - 7},${chinY - 1} ${cx - hw - 2},${chinY - 6}Z`);
  if (style === 'flip') backHair(`M${cx - hw - 1},${chinY - 4} C${cx - hw - 5},${chinY - 12} ${cx - hw - 5},${top} ${cx},${top - 5} C${cx + hw + 5},${top} ${cx + hw + 5},${chinY - 12} ${cx + hw + 1},${chinY - 4} Q${cx + hw + 5},${chinY + 2.5} ${cx + hw + 8},${chinY - 1} Q${cx + hw + 7},${chinY + 5} ${cx + hw + 1},${chinY + 3} L${cx - hw - 1},${chinY + 3} Q${cx - hw - 7},${chinY + 5} ${cx - hw - 8},${chinY - 1} Q${cx - hw - 5},${chinY + 2.5} ${cx - hw - 1},${chinY - 4}Z`);
  if (style === 'chignon') {
    backHair(`M${cx - hw - 1.5},${g.cheekY} C${cx - hw - 3.5},${top + 4} ${cx - 8},${top - 3.5} ${cx},${top - 3.5} C${cx + 8},${top - 3.5} ${cx + hw + 3.5},${top + 4} ${cx + hw + 1.5},${g.cheekY}Z`);
    shape(`M${f(cx + hw * 0.55)},${f(top + 7)} a7.5,6.5 0 1,1 0.1,0Z`, u('hr'));
    line(`M${f(cx + hw * 0.55 - 4)},${f(top + 5)} q4,-4 8,-1 M${f(cx + hw * 0.55 - 5)},${f(top + 8)} q5,-3 10,0`, hairHi, 0.5, 0.4);
  }
  if (style === 'curls') backHair(`M${cx - hw - 3},${g.noseY} C${cx - hw - 6},${top + 6} ${cx - 10},${top - 6} ${cx},${top - 6} C${cx + 10},${top - 6} ${cx + hw + 6},${top + 6} ${cx + hw + 3},${g.noseY}Z`);
  if (style === 'girl') {
    const tails = look < 0.5;
    if (tails) {
      for (const s of [-1, 1]) {
        const x0 = cx + s * (hw + 2);
        backHair(`M${x0 - s * 3},${eyeY - 4} C${x0 + s * 6},${eyeY} ${x0 + s * 4},${chinY + 6} ${x0 + s * 1},${chinY + 12} C${x0 - s * 1},${chinY + 6} ${x0 - s * 2},${eyeY + 4} ${x0 - s * 4},${eyeY}Z`);
      }
    } else backHair(`M${cx - hw - 2},${chinY + 4} C${cx - hw - 6},${eyeY} ${cx - hw - 5},${top} ${cx},${top - 4} C${cx + hw + 5},${top} ${cx + hw + 6},${eyeY} ${cx + hw + 2},${chinY + 4} Q${cx},${chinY + 8} ${cx - hw - 2},${chinY + 4}Z`);
  }

  /* ================= neck ================= */
  const neckTop = g.jawY - 2;
  shape(`M${f(cx - neckW)},${f(neckTop)} C${f(cx - neckW + 0.4)},${f(shY - 6)} ${f(cx - neckW - 1)},${f(shY - 1)} ${f(cx - neckW - 4)},${f(shY + 3)} L${f(cx + neckW + 4)},${f(shY + 3)} C${f(cx + neckW + 1)},${f(shY - 1)} ${f(cx + neckW - 0.4)},${f(shY - 6)} ${f(cx + neckW)},${f(neckTop)}Z`, u('nk'));
  dab(cx + 1.5, chinY + 1.5, g.jawW * 0.9, 5.5, 0.55);
  dab(cx + neckW * 0.7, shY - 6, 3.5, 8, 0.35);
  if (male && adult) line(`M${f(cx - 1.4)},${f(chinY + 6)} q1.4,1.6 2.8,0`, skinSh, 0.6, 0.35 + jowl * 0.2); // Adam's apple
  if (age > 62) line(`M${f(cx - neckW + 2)},${f(chinY + 3)} q2,6 1,${f(shY - chinY - 5)} M${f(cx + neckW - 2)},${f(chinY + 3)} q-2,6 -1,${f(shY - chinY - 5)}`, skinSh, 0.6, 0.45);

  /* ================= clothing ================= */
  paintClothes();

  /* ================= ears ================= */
  const earTop = g.templeY + 6;
  const earBot = noseY + lerp(0, 1.4, t);
  const earOut = lerp(2, 1.9 + G.ears * 1.3, t);
  for (const s of [-1, 1]) {
    const x0 = cx + s * (g.cheekW - 1.2);
    const x1 = cx + s * (g.cheekW + earOut);
    shape(`M${f(x0)},${f(earTop)} C${f(x1 + s * 0.6)},${f(earTop - 2)} ${f(x1 + s * 0.4)},${f(earBot - 4)} ${f(x1 - s * 1.2)},${f(earBot)} Q${f(x0 + s * 0.6)},${f(earBot + 2.4)} ${f(x0)},${f(earBot - 1.5)}Z`, s < 0 ? mix(skinBase, skinSh, 0.25) : mix(skinBase, skinSh, 0.6));
    line(`M${f(x0 + s * 1)},${f(earTop + 2)} C${f(x1 - s * 0.6)},${f(earTop + 1)} ${f(x1 - s * 0.6)},${f(earBot - 4)} ${f(x0 + s * 1.2)},${f(earBot - 2.5)}`, skinDeep, 0.6, 0.45);
    if (!male && adult) push(<circle key={key()} cx={f(x1 - s * 1.6)} cy={f(earBot + 1.4)} r={1.25} fill="#efe6d8" stroke="#a89c88" strokeWidth={0.3} />);
  }

  /* ================= head ================= */
  const hp = headPath(g);
  shape(hp, u('sk'));
  const clipStart = els.length;
  // terminator: the shaded right side of the face
  shape(`M${f(cx + g.cheekW * 0.25)},0H100V120H${f(cx + g.cheekW * 0.25)}Z`, u('ts'));
  // eye sockets
  for (const s of [-1, 1]) dab(cx + s * eyeDx + s * 0.5, eyeY - 1, 5.6, 3.9, (s > 0 ? 0.42 : 0.3) + (eyeShape === 3 ? 0.15 : 0) + clamp((age - 40) / 120, 0, 0.2), 's');
  // cheekbones & hollows
  if (adult) for (const s of [-1, 1]) dab(cx + s * (g.cheekW - 3.2), g.cheekY + 5, 2.6, 5.5, (male ? 0.18 : 0.1) * (1 - heavy * 0.5), 's', s * -12);
  for (const s of [-1, 1]) dab(cx + s * (g.cheekW - 5.8), g.cheekY + 1, 4.5, 3.4, (male ? 0.1 : 0.26) + kid * 0.2 + (L.ethnicity === 'Irish' ? 0.08 : 0), 'w');
  // beard shadow
  if (male && age >= 18) dab(cx + 1, mouthY + 3.5, g.jawW + 0.5, chinY - noseY, 0.12 + G.heavy * 0.1 + (L.ethnicity === 'Irish' ? -0.06 : 0.04), 'b');
  // light: forehead, nose bridge, cheek, chin
  dab(cx - 3.5, g.templeY - 3, 8, 4.8, 0.32 + (style === 'bald' || style === 'thin' ? 0.12 : 0), 'l');
  dab(cx - 0.7, eyeY + 5, 1.2, 4.6, 0.32, 'l');
  dab(cx - eyeDx - 1.5, g.cheekY + 1, 3.6, 2.4, 0.22, 'l');
  dab(cx - 1, chinY - 3, 3.4, 1.7, 0.2, 'l');
  // under the jaw
  dab(cx + 2, chinY + 1, g.jawW * 0.9, 3.5, 0.3);
  // jowls
  if (jowl > 0.2) for (const s of [-1, 1]) dab(cx + s * (g.jawW - 2.5), g.jawY + 2, 3, 4.5, jowl * 0.28, 's');
  // freckles
  if (L.ethnicity === 'Irish' && G.freckle > 0.6 && age < 50) {
    const fr = mulberry(L.serial);
    for (let i = 0; i < 16; i++) {
      const s = fr() < 0.5 ? -1 : 1;
      push(<circle key={key()} cx={f(cx + s * (2 + fr() * 10))} cy={f(eyeY + 2.5 + fr() * 6)} r={0.35} fill="#9a5432" opacity={0.4} />);
    }
  }
  // hat shadow over the brow
  if (hat !== 'none') shape(`M0,0H100V${f(eyeY + 3)}H0Z`, u('hb'));
  const clipped = els.splice(clipStart);
  push(<g key={key()} clipPath={u('hc')}>{clipped}</g>);
  line(hp, skinDeep, 0.7, 0.35);

  /* ---- age lines ---- */
  if (age > 36) {
    const op = clamp((age - 36) / 40, 0.12, 0.55);
    const fy = (browY + g.hl) / 2;
    line(`M${f(cx - 7)},${f(fy)} q3.5,-0.9 7,0 t7,0`, skinSh, 0.5, op);
    if (age > 50) line(`M${f(cx - 5.5)},${f(fy - 2.2)} q2.7,-0.7 5.5,0 t5.5,0`, skinSh, 0.45, op * 0.8);
    if (age > 58 && g.hl < fy - 5) line(`M${f(cx - 6)},${f(fy - 4.4)} q3,-0.7 6,0 t5,0`, skinSh, 0.4, op * 0.7);
  }
  if (mood === 'scowl' || mood === 'stern' || age > 55) line(`M${f(cx - 1.4)},${f(browY - 0.5)} l0.4,-2.4 M${f(cx + 1.4)},${f(browY - 0.5)} l-0.4,-2.4`, skinSh, 0.5, mood === 'scowl' ? 0.6 : 0.35);

  /* ================= eyes ================= */
  const tilt = (eyeShape === 0 ? 0.35 : eyeShape === 2 ? -0.25 : 0.1) + (male ? 0 : 0.25);
  for (const s of [-1, 1]) {
    const ex = cx + s * eyeDx;
    const inner = ex - s * ew;
    const outer = ex + s * ew;
    const ehh = g.eh * (mood === 'smirk' && s < 0 ? 1.08 : 1);
    const upper = `M${f(inner)},${f(eyeY + 0.3)} Q${f(ex - s * ew * 0.15)},${f(eyeY - ehh * 1.45)} ${f(outer)},${f(eyeY - tilt)}`;
    const eye = `${upper} Q${f(ex + s * 0.2)},${f(eyeY + ehh * (mood === 'warm' ? 0.75 : 1))} ${f(inner)},${f(eyeY + 0.3)}Z`;
    push(<path key={key()} d={eye} fill={mix('#e6dccb', skinBase, 0.3)} />);
    const ir = Math.min(lerp(1.75, 1.55, t), ehh * 0.95 + 0.25);
    const iy = eyeY - ehh * 0.15;
    const gaze = (look - 0.5) * 0.6;
    push(
      <g key={key()} clipPath={u(s < 0 ? 'e0' : 'e1')}>
        <circle cx={f(ex + gaze)} cy={f(iy)} r={f(ir)} fill={iris} />
        <circle cx={f(ex + gaze)} cy={f(iy)} r={f(ir)} fill="none" stroke={dark(iris, 0.6)} strokeWidth={0.35} />
        <circle cx={f(ex + gaze)} cy={f(iy)} r={f(ir * 0.45)} fill="#0b0705" />
        <path d={`M${f(inner - s)},${f(eyeY - 3)}H${f(outer + s)}V${f(eyeY - ehh * 0.35)}H${f(inner - s)}Z`} fill="#2a1408" opacity={0.28} />
      </g>,
    );
    push(<circle key={key()} cx={f(ex + gaze - 0.55)} cy={f(iy - 0.55)} r={0.42} fill="#fffaf0" opacity={0.9} />);
    line(upper, '#1c0f09', male ? 0.95 : 1.15, 0.95);
    if (!male && adult) line(`M${f(outer)},${f(eyeY - tilt)} l${s * 1.3},-0.9`, '#1c0f09', 0.6, 0.9);
    line(`M${f(inner + s * 0.4)},${f(eyeY + 0.5)} Q${f(ex)},${f(eyeY + ehh + 0.3)} ${f(outer)},${f(eyeY - tilt + 0.2)}`, skinDeep, 0.45, 0.4);
    // lid crease or hooded fold
    if (eyeShape === 2 || age > 58) shape(`M${f(inner - s * 0.3)},${f(eyeY - 0.4)} Q${f(ex)},${f(eyeY - ehh * 2.4)} ${f(outer + s * 0.8)},${f(eyeY - tilt + 0.1)} Q${f(ex)},${f(eyeY - ehh * 1.1)} ${f(inner - s * 0.3)},${f(eyeY - 0.4)}Z`, mix(skinBase, skinSh, s > 0 ? 0.4 : 0.15));
    else line(`M${f(inner + s * 0.3)},${f(eyeY - ehh - 0.6)} Q${f(ex)},${f(eyeY - ehh * 1.45 - 1.6)} ${f(outer + s * 0.4)},${f(eyeY - tilt - 0.8)}`, skinDeep, 0.5, 0.4);
    if (age > 42) line(`M${f(inner + s * 0.6)},${f(eyeY + ehh + 1.1)} Q${f(ex)},${f(eyeY + ehh + 2.3)} ${f(outer - s * 0.2)},${f(eyeY + 0.9)}`, skinSh, 0.5, clamp((age - 42) / 40, 0.15, 0.55));
    if (age > 52) line(`M${f(outer + s * 1.2)},${f(eyeY - 0.4)} l${s * 1.6},-0.7 M${f(outer + s * 1.3)},${f(eyeY + 0.8)} l${s * 1.7},0.4`, skinSh, 0.4, 0.45);
    // brow
    const [di, dout] = s < 0 ? browL : browR;
    const bi = cx + s * lerp(2.6, 2.2, t);
    const bo = ex + s * (ew + lerp(1.4, 2.2, t));
    const ba = ex + s * 0.6;
    const th = male ? lerp(0.8, 0.85 + G.brow * 1.1, t) : 0.65;
    const by = browY - (male ? 0 : 0.6);
    const arch = male ? 1.1 : 2;
    shape(
      `M${f(bi)},${f(by + di - th * 0.55)} Q${f(ba)},${f(by - arch - th + (di + dout) / 2)} ${f(bo)},${f(by + 0.6 + dout)} Q${f(ba)},${f(by - arch + th * 0.35 + (di + dout) / 2)} ${f(bi)},${f(by + di + th * 0.65)}Z`,
      brow,
      0.92,
    );
  }

  /* ================= nose ================= */
  {
    const nb = eyeY + 0.5;
    const bump = noseType === 1 ? 1.4 : noseType === 4 ? 1.8 : noseType === 2 ? -0.6 : 0.4;
    const tipDrop = noseType === 4 ? 0.9 : noseType === 2 ? -0.5 : 0;
    // bridge shadow on the shaded side, a soft stroke over a wide glaze
    line(`M${f(cx + 1.8)},${f(nb)} Q${f(cx + 1.6 + bump)},${f((nb + noseY) / 2)} ${f(cx + noseW * 0.75)},${f(noseY - 1.4)}`, skinSh, 3.2, 0.16);
    line(`M${f(cx + 1.7)},${f(nb + 1)} Q${f(cx + 1.3 + bump)},${f((nb + noseY) / 2)} ${f(cx + noseW * 0.65)},${f(noseY - 1.6)}`, skinSh, 0.9, 0.42);
    line(`M${f(cx - 1.6)},${f(nb + 2)} Q${f(cx - 1.4 - bump * 0.2)},${f((nb + noseY) / 2 + 1)} ${f(cx - noseW * 0.7)},${f(noseY - 1.6)}`, skinSh, 0.55, 0.2);
    // tip and wings
    dab(cx - 0.2, noseY - 0.8 + tipDrop, noseW * 0.62, 1.75, 0.4, 'l');
    dab(cx + 0.6, noseY + 1.6 + tipDrop * 0.5, noseW * 1.1, 1.2, 0.42);
    for (const s of [-1, 1]) {
      line(`M${f(cx + s * noseW * 0.35)},${f(noseY + 0.6 + tipDrop * 0.4)} Q${f(cx + s * (noseW + 0.6))},${f(noseY + 0.4)} ${f(cx + s * noseW * 0.92)},${f(noseY - 1.7)}`, skinDeep, 0.65, s > 0 ? 0.65 : 0.45);
      push(<ellipse key={key()} cx={f(cx + s * noseW * 0.42)} cy={f(noseY + 0.55 + tipDrop * 0.3)} rx={0.8} ry={0.42} fill="#2a120a" opacity={0.6} transform={`rotate(${s * 18} ${f(cx + s * noseW * 0.42)} ${f(noseY + 0.55)})`} />);
    }
  }

  /* ================= mouth ================= */
  {
    const [cl, cr] = corners;
    const lx = cx - mouthW;
    const rx = cx + mouthW;
    const ly = mouthY + cl;
    const ry = mouthY + cr;
    const full = male ? 0.95 + G.lips * 0.6 : 1.25 + G.lips * 0.55;
    const thin = mood === 'stern' || mood === 'scowl' ? 0.7 : 1;
    const mid = `Q${f(cx)},${f(mouthY + 0.45)}`;
    // nasolabial folds and smile lines
    const nl = clamp((age - 26) / 40, 0, 0.5) + (mood === 'warm' || mood === 'smirk' ? 0.12 : 0);
    if (nl > 0.05) for (const s of [-1, 1]) line(`M${f(cx + s * (noseW + 1.2))},${f(noseY - 0.4)} Q${f(cx + s * (mouthW + 2.6))},${f(mouthY - 2)} ${f(cx + s * (mouthW + 1.4))},${f(mouthY + 2.4 + jowl)}`, skinSh, 0.6, nl * (s > 0 ? 1.2 : 0.9));
    if (age > 58) for (const s of [-1, 1]) line(`M${f(cx + s * (mouthW + 0.6))},${f(mouthY + 1.6)} q${s * 0.6},2.5 ${s * 0.2},4.6`, skinSh, 0.5, 0.35);
    push(<path key={key()} d={`M${f(lx)},${f(ly)} Q${f(cx - mouthW * 0.5)},${f(mouthY - 1.55 * full * thin)} ${f(cx)},${f(mouthY - 0.85 * full * thin)} Q${f(cx + mouthW * 0.5)},${f(mouthY - 1.55 * full * thin)} ${f(rx)},${f(ry)} ${mid} ${f(lx)},${f(ly)}Z`} fill={dark(lip, 0.22)} />);
    push(<path key={key()} d={`M${f(lx + 0.4)},${f(ly + 0.1)} Q${f(cx)},${f(mouthY + 2.6 * full * thin)} ${f(rx - 0.4)},${f(ry + 0.1)} ${mid} ${f(lx + 0.4)},${f(ly + 0.1)}Z`} fill={lip} />);
    dab(cx - 0.8, mouthY + 1.35 * full * thin, mouthW * 0.38, 0.55, male ? 0.3 : 0.5, 'l');
    line(`M${f(lx - 0.2)},${f(ly)} ${mid} ${f(rx + 0.2)},${f(ry)}`, '#2a120c', 0.65, 0.85);
    dab(cx + 0.3, mouthY + 2.9 * full + 0.8, mouthW * 0.55, 0.95, 0.3);
    if (mood === 'smirk') line(`M${f(rx + 0.5)},${f(ry - 0.6)} q0.8,0.6 0.5,1.6`, skinSh, 0.5, 0.6);
    for (const [x, y] of [[lx, ly], [rx, ry]] as const) push(<circle key={key()} cx={f(x)} cy={f(y)} r={0.55} fill="#2a120c" opacity={0.35} />);
    if (stache === 'pencil') line(`M${f(cx - mouthW - 0.2)},${f(mouthY - 1.2)} Q${f(cx - mouthW * 0.5)},${f(mouthY - 2.3)} ${f(cx - 0.6)},${f(mouthY - 2.1)} M${f(cx + 0.6)},${f(mouthY - 2.1)} Q${f(cx + mouthW * 0.5)},${f(mouthY - 2.3)} ${f(cx + mouthW + 0.2)},${f(mouthY - 1.2)}`, stacheCol, 0.85, 0.95);
    if (stache === 'chevron') {
      const sy = noseY + 1.5;
      shape(`M${f(cx - mouthW - 1)},${f(mouthY + 0.5)} Q${f(cx - mouthW * 0.6)},${f(sy)} ${f(cx)},${f(sy + 0.4)} Q${f(cx + mouthW * 0.6)},${f(sy)} ${f(cx + mouthW + 1)},${f(mouthY + 0.5)} Q${f(cx)},${f(mouthY - 1.4)} ${f(cx - mouthW - 1)},${f(mouthY + 0.5)}Z`, stacheCol);
      line(`M${f(cx - 3)},${f(sy + 1)} l-0.8,1.6 M${f(cx - 1)},${f(sy + 0.8)} l-0.3,1.6 M${f(cx + 1.2)},${f(sy + 0.8)} l0.3,1.6 M${f(cx + 3.2)},${f(sy + 1)} l0.8,1.6`, lite(stacheCol, 0.3), 0.35, 0.5);
    }
  }

  /* ================= front hair ================= */
  paintHair();

  /* ================= glasses ================= */
  if (wearsGlasses) {
    const gy = eyeY - 0.2;
    const lw = ew + 1.9;
    const lh = 3.5;
    const frame = browline ? '#1a1210' : '#8a7a5a';
    for (const s of [-1, 1]) {
      const ex = cx + s * eyeDx;
      push(<rect key={key()} x={f(ex - lw)} y={f(gy - lh * 0.55)} width={f(lw * 2)} height={f(lh * 1.55)} rx={2.2} fill="#d8e4ea" fillOpacity={0.08} stroke={frame} strokeWidth={0.45} />);
      if (browline) push(<path key={key()} d={`M${f(ex - lw - 0.3)},${f(gy - lh * 0.4)} Q${f(ex)},${f(gy - lh * 0.85)} ${f(ex + lw + 0.3)},${f(gy - lh * 0.4)} L${f(ex + lw)},${f(gy - lh * 0.05)} Q${f(ex)},${f(gy - lh * 0.45)} ${f(ex - lw)},${f(gy - lh * 0.05)}Z`} fill={frame} />);
      line(`M${f(ex - lw + 1)},${f(gy - lh * 0.2)} l1.6,-0.8`, '#ffffff', 0.4, 0.45);
    }
    line(`M${f(cx - eyeDx + lw)},${f(gy - 0.6)} Q${f(cx)},${f(gy - 1.8)} ${f(cx + eyeDx - lw)},${f(gy - 0.6)}`, frame, 0.6);
    line(`M${f(cx - eyeDx - lw)},${f(gy - 0.6)} L${f(cx - g.cheekW)},${f(gy - 1)} M${f(cx + eyeDx + lw)},${f(gy - 0.6)} L${f(cx + g.cheekW)},${f(gy - 1)}`, frame, 0.5);
  }

  /* ================= hats ================= */
  paintHat();

  /* ================= finish ================= */
  const fig = els.splice(figStart);
  push(<g key={key()} transform="translate(50 66) scale(1.13) translate(-50 -66)">{fig}</g>);
  if (L.jailed) {
    push(<rect key={key()} x={27} y={103} width={46} height={13} rx={0.8} fill="#141414" stroke="#3a3a3a" strokeWidth={0.4} />);
    push(<text key={key()} x={50} y={108.2} fontSize={3.4} fill="#e8e2d6" textAnchor="middle" fontFamily="'Courier New',monospace" letterSpacing={0.4}>CAPE MAY CO. JAIL</text>);
    push(<text key={key()} x={50} y={114} fontSize={5} fill="#f2ede4" textAnchor="middle" fontFamily="'Courier New',monospace" fontWeight={700}>{`${L.serial}`}</text>);
  }
  shape('M0,0H100V120H0Z', u('vg'));
  shape('M0,0H100V120H0Z', '#7a4a18', 0.07);

  const frameStroke = L.dead ? '#77736c' : u('gd');
  const body = L.dead ? <g filter={u('gs')}>{els}</g> : <g>{els}</g>;

  return (
    <g>
      <defs>
        <radialGradient id={`${id}bg`} cx="0.62" cy="0.3" r="0.85">
          <stop offset="0" stopColor={mix(bg, '#c9a46a', 0.32)} />
          <stop offset="0.45" stopColor={mix(bg, '#1a1410', 0.25)} />
          <stop offset="1" stopColor={mix(bg, '#060404', 0.78)} />
        </radialGradient>
        <linearGradient id={`${id}jb`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4a4a46" />
          <stop offset="1" stopColor="#1e1e1c" />
        </linearGradient>
        <linearGradient id={`${id}bar`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#0c0c0c" />
          <stop offset="0.35" stopColor="#5a5a58" />
          <stop offset="1" stopColor="#141414" />
        </linearGradient>
        <radialGradient id={`${id}sk`} cx="0.38" cy="0.36" r="0.78">
          <stop offset="0" stopColor={skinHi} />
          <stop offset="0.42" stopColor={skinBase} />
          <stop offset="0.82" stopColor={mix(skinBase, skinSh, 0.6)} />
          <stop offset="1" stopColor={skinSh} />
        </radialGradient>
        <linearGradient id={`${id}ts`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={skinSh} stopOpacity={0} />
          <stop offset="0.4" stopColor={skinSh} stopOpacity={0.45} />
          <stop offset="1" stopColor={skinDeep} stopOpacity={0.85} />
        </linearGradient>
        <linearGradient id={`${id}nk`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={mix(skinBase, skinSh, 0.2)} />
          <stop offset="1" stopColor={mix(skinSh, skinDeep, 0.4)} />
        </linearGradient>
        <linearGradient id={`${id}hb`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0d0705" stopOpacity={0.75} />
          <stop offset={f((top + 13) / (eyeY + 3) * 100) / 100} stopColor="#0d0705" stopOpacity={0.55} />
          <stop offset="1" stopColor="#0d0705" stopOpacity={0} />
        </linearGradient>
        <radialGradient id={`${id}d`}>
          <stop offset="0" stopColor="#1a0a05" stopOpacity={1} />
          <stop offset="1" stopColor="#1a0a05" stopOpacity={0} />
        </radialGradient>
        <radialGradient id={`${id}s`}>
          <stop offset="0" stopColor={skinDeep} stopOpacity={1} />
          <stop offset="1" stopColor={skinDeep} stopOpacity={0} />
        </radialGradient>
        <radialGradient id={`${id}l`}>
          <stop offset="0" stopColor="#fff6e6" stopOpacity={1} />
          <stop offset="1" stopColor="#fff6e6" stopOpacity={0} />
        </radialGradient>
        <radialGradient id={`${id}w`}>
          <stop offset="0" stopColor="#d0584a" stopOpacity={1} />
          <stop offset="1" stopColor="#d0584a" stopOpacity={0} />
        </radialGradient>
        <radialGradient id={`${id}b`} cy="0.62">
          <stop offset="0.5" stopColor={mix(skinDeep, '#30343c', 0.5)} stopOpacity={1} />
          <stop offset="1" stopColor={mix(skinDeep, '#30343c', 0.5)} stopOpacity={0} />
        </radialGradient>
        <linearGradient id={`${id}hr`} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor={hairHi} />
          <stop offset="0.45" stopColor={hair} />
          <stop offset="1" stopColor={hairDk} />
        </linearGradient>
        <radialGradient id={`${id}hs`} cx="0.35" cy="0.25" r="0.7">
          <stop offset="0" stopColor="#fff2dc" stopOpacity={0.25} />
          <stop offset="1" stopColor="#000" stopOpacity={0.2} />
        </radialGradient>
        <linearGradient id={`${id}cl`} x1="0" y1="0" x2="1" y2="0.3">
          <stop offset="0" stopColor={lite(clothBase(), 0.18)} />
          <stop offset="0.5" stopColor={clothBase()} />
          <stop offset="1" stopColor={dark(clothBase(), 0.55)} />
        </linearGradient>
        <linearGradient id={`${id}sh`} x1="0" y1="0" x2="1" y2="0.6">
          <stop offset="0" stopColor="#5d6672" />
          <stop offset="0.22" stopColor="#a4adb6" />
          <stop offset="0.42" stopColor="#66707b" />
          <stop offset="0.62" stopColor="#8b95a0" />
          <stop offset="1" stopColor="#2f343b" />
        </linearGradient>
        <linearGradient id={`${id}wt`} x1="0" y1="0" x2="1" y2="0.4">
          <stop offset="0" stopColor="#f4eee2" />
          <stop offset="1" stopColor="#a39a8a" />
        </linearGradient>
        <linearGradient id={`${id}ht`} x1="0" y1="0" x2="1" y2="0.2">
          <stop offset="0" stopColor={lite(hatCol, 0.22)} />
          <stop offset="0.6" stopColor={hatCol} />
          <stop offset="1" stopColor={dark(hatCol, 0.6)} />
        </linearGradient>
        <radialGradient id={`${id}vg`} cx="0.5" cy="0.45" r="0.72">
          <stop offset="0.55" stopColor="#0a0604" stopOpacity={0} />
          <stop offset="1" stopColor="#0a0604" stopOpacity={0.78} />
        </radialGradient>
        <linearGradient id={`${id}gd`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f0d48a" />
          <stop offset="0.35" stopColor="#9c7a2c" />
          <stop offset="0.6" stopColor="#e2c06a" />
          <stop offset="1" stopColor="#6a4e18" />
        </linearGradient>
        <clipPath id={`${id}hc`}>
          <path d={hp} />
        </clipPath>
        {[-1, 1].map((s, i) => {
          const ex = cx + s * eyeDx;
          const ehh = g.eh * (mood === 'smirk' && s < 0 ? 1.08 : 1);
          const inner = ex - s * ew;
          const outer = ex + s * ew;
          return (
            <clipPath key={i} id={`${id}e${i}`}>
              <path d={`M${f(inner)},${f(eyeY + 0.3)} Q${f(ex - s * ew * 0.15)},${f(eyeY - ehh * 1.45)} ${f(outer)},${f(eyeY - tilt)} Q${f(ex + s * 0.2)},${f(eyeY + ehh * (mood === 'warm' ? 0.75 : 1))} ${f(inner)},${f(eyeY + 0.3)}Z`} />
            </clipPath>
          );
        })}
        {L.dead && (
          <filter id={`${id}gs`}>
            <feColorMatrix type="matrix" values="0.25 0.6 0.12 0 0.01  0.24 0.58 0.12 0 0.01  0.22 0.54 0.11 0 0.01  0 0 0 1 0" />
          </filter>
        )}
      </defs>
      {body}
      {L.dead && (
        <g>
          <path d="M60,0H76L100,24V40Z" fill="#0b0b0b" />
          <path d="M64,0H67L100,33V36Z" fill="#3a3a3a" opacity={0.6} />
        </g>
      )}
      <rect x="1.2" y="1.2" width="97.6" height="117.6" rx="2.5" fill="none" stroke="#120c07" strokeWidth="2.4" />
      <rect x="2.6" y="2.6" width="94.8" height="114.8" rx="1.8" fill="none" stroke={frameStroke} strokeWidth="1.5" />
      <rect x="3.8" y="3.8" width="92.4" height="112.4" rx="1.2" fill="none" stroke="#000" strokeOpacity="0.55" strokeWidth="0.6" />
    </g>
  );

  /* ---------------- helpers (hoisted) ---------------- */

  function clothBase(): string {
    switch (outfit) {
      case 'leather':
        return dressRoll < 0.6 ? '#1c1714' : '#3b2618';
      case 'cop':
        return '#1b2335';
      case 'priest':
      case 'judge':
        return '#141416';
      case 'dress':
        return dress;
      case 'girl':
        return mix(dress, '#c8b8a8', 0.3);
      case 'boy':
        return dressRoll < 0.5 ? '#3c4f68' : '#6a5038';
      case 'cardigan':
        return dressRoll < 0.5 ? '#5a4a36' : '#3d4a3f';
      case 'work':
        return dressRoll < 0.5 ? '#39465a' : '#5a5040';
      case 'sport':
        return dressRoll < 0.5 ? '#8a6a44' : '#6a6458';
      case 'openCollar':
        return dressRoll < 0.4 ? '#d8d2c4' : dressRoll < 0.7 ? '#93a6b8' : '#2a2a2c';
      default:
        return suit;
    }
  }

  function paintClothes() {
    const kidW = lerp(0.62, 1, t);
    const W = (male ? 47 : 40) * kidW;
    const sl = cx - neckW - 1;
    const sr = cx + neckW + 1;
    const bodyD = `M${f(sl)},${f(shY - 3)} C${f(sl - 7)},${f(shY)} ${f(cx - W * 0.55)},${f(shY + 2)} ${f(cx - W * 0.72)},${f(shY + 6)} C${f(cx - W * 0.92)},${f(shY + 9)} ${f(cx - W)},${f(shY + 16)} ${f(cx - W - 1)},121 L${f(cx + W + 1)},121 C${f(cx + W)},${f(shY + 16)} ${f(cx + W * 0.92)},${f(shY + 9)} ${f(cx + W * 0.72)},${f(shY + 6)} C${f(cx + W * 0.55)},${f(shY + 2)} ${f(sr + 7)},${f(shY)} ${f(sr)},${f(shY - 3)}Z`;
    const fill = outfit === 'sharkskin' ? u('sh') : u('cl');
    const shirt = u('wt');
    const vee = (depth: number, wide = 0) => `M${f(sl - wide)},${f(shY - 3)} L${f(cx)},${f(shY + depth)} L${f(sr + wide)},${f(shY - 3)}Z`;
    const collarPts = (spread: number, len: number, col: string) => {
      for (const s of [-1, 1]) shape(`M${f(cx + s * (neckW + 0.8))},${f(shY - 4.5)} L${f(cx + s * spread)},${f(shY + len)} L${f(cx + s * 0.6)},${f(shY + 1.5)}Z`, col);
    };
    const tieD = (w: number, end: number) => {
      shape(`M${f(cx - w)},${f(shY - 1)} L${f(cx + w)},${f(shY - 1)} L${f(cx + w * 0.7)},${f(shY + 2.4)} L${f(cx - w * 0.7)},${f(shY + 2.4)}Z`, dark(tie, 0.15));
      shape(`M${f(cx - w * 0.7)},${f(shY + 2.4)} L${f(cx + w * 0.7)},${f(shY + 2.4)} L${f(cx + w * 1.5)},${f(end)} L${f(cx)},${f(end + 2)} L${f(cx - w * 1.5)},${f(end)}Z`, tie);
      line(`M${f(cx + 0.3)},${f(shY + 3)} L${f(cx + w)},${f(end - 1)}`, dark(tie, 0.5), w * 0.8, 0.5);
    };
    const lapels = (col: string, depth: number, peak = false) => {
      for (const s of [-1, 1]) {
        const notchX = cx + s * (peak ? 16 : 13.5) * kidW;
        shape(
          `M${f(cx + s * (neckW + 0.6))},${f(shY - 3.6)} L${f(cx + s * (neckW + 4.5))},${f(shY - 0.5)} L${f(notchX)},${f(shY + 6.5)} L${f(notchX - s * (peak ? -1 : 2.6))},${f(shY + (peak ? 5 : 8))} L${f(cx + s * 11 * kidW)},${f(shY + 9.5)} L${f(cx + s * 0.6)},${f(shY + depth)} L${f(cx + s * 0.2)},${f(shY + depth - 1.6)}Z`,
          s < 0 ? lite(col, 0.12) : dark(col, 0.25),
        );
        line(`M${f(cx + s * (neckW + 4.5))},${f(shY - 0.5)} L${f(notchX)},${f(shY + 6.5)} M${f(cx + s * 11 * kidW)},${f(shY + 9.5)} L${f(cx + s * 0.6)},${f(shY + depth)}`, '#000', 0.45, 0.45);
      }
      line(`M${f(cx)},${f(shY + depth)} V121`, '#000', 0.6, 0.55);
      push(<circle key={key()} cx={f(cx + 1.2)} cy={f(shY + depth + 4.5)} r={0.9} fill={dark(col, 0.5)} />);
    };
    const folds = () => {
      line(`M${f(cx - W * 0.66)},${f(shY + 8)} q2,6 1,14 M${f(cx + W * 0.62)},${f(shY + 8)} q-2,6 -1,14`, '#000', 0.8, 0.25);
      line(`M${f(cx - W * 0.5)},${f(shY + 3)} q-6,2 -10,6`, '#fff4e0', 0.6, 0.18);
    };

    // skin of the chest for open necklines
    if (outfit === 'dress' || outfit === 'openCollar' || outfit === 'leather' || outfit === 'girl') shape(`M${f(sl - 6)},${f(shY - 3)} L${f(sr + 6)},${f(shY - 3)} L${f(cx + 10)},${f(shY + 20)} L${f(cx - 10)},${f(shY + 20)}Z`, mix(skinBase, skinSh, 0.35));

    switch (outfit) {
      case 'boss':
      case 'suit':
      case 'fed':
      case 'bowtie':
      case 'sharkskin': {
        shape(bodyD, fill);
        folds();
        shape(vee(outfit === 'bowtie' ? 15 : 16), shirt);
        collarPts(5.2, 2.5, '#efe8da');
        if (outfit === 'bowtie') {
          shape(`M${f(cx)},${f(shY + 0.6)} L${f(cx - 4.4)},${f(shY - 1.8)} L${f(cx - 4.6)},${f(shY + 3.2)}Z M${f(cx)},${f(shY + 0.6)} L${f(cx + 4.4)},${f(shY - 1.8)} L${f(cx + 4.6)},${f(shY + 3.2)}Z`, tie);
          push(<rect key={key()} x={f(cx - 1.1)} y={f(shY - 0.6)} width={2.2} height={2.4} rx={0.6} fill={dark(tie, 0.35)} />);
        } else tieD(outfit === 'sharkskin' || outfit === 'fed' ? 1.2 : 1.6, shY + 16);
        lapels(outfit === 'sharkskin' ? '#7f8892' : suit, 16, outfit === 'boss');
        if (outfit === 'boss') {
          const px = cx + 15 * kidW;
          const py = shY + 13;
          shape(`M${f(px - 3.4)},${f(py + 1.2)} L${f(px - 2.2)},${f(py - 2.6)} L${f(px - 0.6)},${f(py - 0.4)} L${f(px + 1)},${f(py - 3)} L${f(px + 3)},${f(py + 1)}Z`, '#f3ecdd');
          line(`M${f(px - 4)},${f(py + 1.3)} H${f(px + 3.6)}`, '#000', 0.6, 0.5);
        }
        break;
      }
      case 'leather': {
        shape(bodyD, fill);
        shape(`M${f(sl)},${f(shY - 3)} L${f(cx - 3.5)},${f(shY + 22)} L${f(cx - 3.5)},121 L${f(cx + 3.5)},121 L${f(cx + 3.5)},${f(shY + 22)} L${f(sr)},${f(shY - 3)}Z`, dressRoll > 0.5 ? '#e6dfd0' : '#2a2a2c');
        shape(`M${f(sl + 0.5)},${f(shY - 3)} Q${f(cx)},${f(shY + 6)} ${f(sr - 0.5)},${f(shY - 3)}Z`, mix(skinBase, skinSh, 0.3));
        for (const s of [-1, 1]) {
          shape(`M${f(cx + s * (neckW + 0.5))},${f(shY - 5.5)} L${f(cx + s * (neckW + 10))},${f(shY - 1)} L${f(cx + s * 16 * kidW)},${f(shY + 9)} L${f(cx + s * 4)},${f(shY + 19)} L${f(cx + s * (neckW + 1.5))},${f(shY - 1)}Z`, s < 0 ? lite(clothBase(), 0.12) : dark(clothBase(), 0.3));
          line(`M${f(cx + s * (neckW + 10))},${f(shY - 1)} L${f(cx + s * 16 * kidW)},${f(shY + 9)} L${f(cx + s * 4)},${f(shY + 19)}`, '#000', 0.5, 0.6);
        }
        line(`M${f(cx - W * 0.6)},${f(shY + 5)} q-4,4 -6,12 M${f(cx - 6)},${f(shY + 24)} q-3,-1 -8,2`, '#fff2e0', 0.7, 0.28);
        line(`M${f(cx + 3.5)},${f(shY + 22)} V121`, '#8a8478', 0.6, 0.6);
        break;
      }
      case 'openCollar':
      case 'sport':
      case 'work': {
        const shirtCol = outfit === 'openCollar' ? clothBase() : dressRoll < 0.5 ? '#e3dccd' : '#b9c4cc';
        if (outfit === 'openCollar') {
          shape(bodyD, fill);
          folds();
          shape(vee(13), mix(skinBase, skinSh, 0.25));
          shape(`M${f(sl + 2)},${f(shY + 3)} Q${f(cx)},${f(shY + 9)} ${f(sr - 2)},${f(shY + 3)} L${f(cx + 2.4)},${f(shY + 12)} L${f(cx - 2.4)},${f(shY + 12)}Z`, '#ebe5d8', 0.85);
          for (const s of [-1, 1]) shape(`M${f(cx + s * (neckW + 0.5))},${f(shY - 5)} L${f(cx + s * (neckW + 9))},${f(shY + 1)} L${f(cx + s * 13 * kidW)},${f(shY + 6)} L${f(cx + s * 1.8)},${f(shY + 13)}Z`, s < 0 ? lite(shirtCol, 0.15) : dark(shirtCol, 0.2));
          line(`M${f(cx)},${f(shY + 13)} V121`, dark(shirtCol, 0.4), 0.5, 0.6);
          if (dressRoll > 0.85) for (let i = 0; i < 6; i++) line(`M${f(cx - W + i * 3)},${f(shY + 8)} v30`, dark(shirtCol, 0.3), 0.6, 0.3);
        } else {
          shape(bodyD, fill);
          folds();
          shape(vee(16), shirtCol);
          collarPts(6, 3, lite(shirtCol, 0.1));
          if (outfit === 'work') tieD(1.3, shY + 16);
          lapels(clothBase(), 16);
          if (outfit === 'sport' && dressRoll < 0.5) for (let i = 0; i < 9; i++) line(`M${f(cx - W + i * 10)},${f(shY + 4)} l6,24`, dark(clothBase(), 0.4), 0.4, 0.3);
        }
        break;
      }
      case 'cardigan': {
        shape(bodyD, fill);
        folds();
        shape(vee(18), '#e8e1d2');
        collarPts(5.5, 3, '#f0e9dc');
        tieD(1.4, shY + 18);
        for (const s of [-1, 1]) line(`M${f(cx + s * (neckW + 1))},${f(shY - 3)} L${f(cx + s * 0.8)},${f(shY + 19)} V121`, dark(clothBase(), 0.35), 2.2, 0.7);
        for (let i = 0; i < 3; i++) push(<circle key={key()} cx={f(cx - 1.6)} cy={f(shY + 22 + i * 6)} r={0.8} fill="#2a1f14" />);
        break;
      }
      case 'cop': {
        shape(bodyD, fill);
        folds();
        shape(vee(11), '#c9cdd2');
        collarPts(5, 2.5, '#d6dade');
        tieD(1.4, shY + 11);
        for (const s of [-1, 1]) shape(`M${f(cx + s * (neckW + 0.6))},${f(shY - 3.6)} L${f(cx + s * (neckW + 5))},${f(shY - 0.5)} L${f(cx + s * 12 * kidW)},${f(shY + 5)} L${f(cx + s * 0.5)},${f(shY + 11)}Z`, s < 0 ? lite(clothBase(), 0.12) : dark(clothBase(), 0.3));
        for (let i = 0; i < 3; i++) push(<circle key={key()} cx={f(cx + 0.5)} cy={f(shY + 14 + i * 5.5)} r={0.9} fill="#c9a548" />);
        const bx = cx + 15 * kidW;
        const by = shY + 11;
        shape(`M${f(bx)},${f(by - 3)} l2.4,1 l0,2.6 l-2.4,2.4 l-2.4,-2.4 l0,-2.6Z`, '#d8b45a');
        push(<circle key={key()} cx={f(bx)} cy={f(by)} r={0.8} fill="#8a6a28" />);
        line(`M${f(cx - W * 0.7)},${f(shY + 6)} L${f(cx - W * 0.5)},${f(shY + 3)}`, '#c9a548', 0.8, 0.7);
        break;
      }
      case 'priest': {
        shape(bodyD, fill);
        folds();
        push(<rect key={key()} x={f(sl)} y={f(shY - 5)} width={f(sr - sl)} height={3.2} rx={1} fill="#1a1a1c" />);
        push(<rect key={key()} x={f(cx - 1.8)} y={f(shY - 4.6)} width={3.6} height={2.6} fill="#f5f2ea" />);
        line(`M${f(cx - W * 0.4)},${f(shY + 4)} q4,3 6,14`, '#fff', 0.5, 0.12);
        break;
      }
      case 'judge': {
        shape(bodyD, fill);
        shape(vee(14), shirt);
        collarPts(5, 2.4, '#efe8da');
        tieD(1.3, shY + 14);
        for (const s of [-1, 1]) line(`M${f(cx + s * (neckW + 1))},${f(shY - 3)} L${f(cx + s * 1)},${f(shY + 14)} V121`, '#000', 1.2, 0.6);
        for (let i = -2; i <= 2; i++) if (i) line(`M${f(cx + i * 8)},${f(shY + 8)} q${i},8 ${i * 2},24`, '#000', 0.8, 0.4);
        break;
      }
      case 'dress': {
        const neck = Math.floor(dressRoll * 4); // boat, vee, collar, jacket
        const nl = neck === 1 ? `L${f(cx)},${f(shY + 13)}` : `Q${f(cx)},${f(shY + (neck === 0 ? 8 : 5))}`;
        shape(`M${f(cx - 15 * kidW)},${f(shY - 1)} ${nl} ${f(cx + 15 * kidW)},${f(shY - 1)} C${f(cx + 24 * kidW)},${f(shY + 1)} ${f(cx + W * 0.85)},${f(shY + 6)} ${f(cx + W)},${f(shY + 14)} L${f(cx + W + 1)},121 L${f(cx - W - 1)},121 L${f(cx - W)},${f(shY + 14)} C${f(cx - W * 0.85)},${f(shY + 6)} ${f(cx - 24 * kidW)},${f(shY + 1)} ${f(cx - 15 * kidW)},${f(shY - 1)}Z`, fill);
        folds();
        if (neck === 2) for (const s of [-1, 1]) shape(`M${f(cx)},${f(shY + 5)} Q${f(cx + s * 7)},${f(shY + 2)} ${f(cx + s * 14)},${f(shY - 1)} Q${f(cx + s * 13)},${f(shY + 7)} ${f(cx + s * 2)},${f(shY + 8)}Z`, '#efe8da');
        if (neck === 3) {
          for (const s of [-1, 1]) line(`M${f(cx + s * 15)},${f(shY - 1)} Q${f(cx + s * 3)},${f(shY + 6)} ${f(cx + s * 1)},121`, lite(clothBase(), 0.3), 1.6, 0.6);
          for (let i = 0; i < 3; i++) push(<circle key={key()} cx={f(cx + 3)} cy={f(shY + 12 + i * 6)} r={0.9} fill="#d8c48a" />);
        }
        // pearls
        if (neck !== 2) {
          const n = 15;
          for (let i = 0; i < n; i++) {
            const a = i / (n - 1);
            const x = cx - neckW - 2 + a * (2 * neckW + 4);
            const y = shY - 3 + Math.sin(a * Math.PI) * 4.6;
            push(<circle key={key()} cx={f(x)} cy={f(y)} r={0.82} fill="#efe7da" stroke="#9a907e" strokeWidth={0.2} />);
          }
          if (age > 40) {
            for (let i = 0; i < 17; i++) {
              const a = i / 16;
              const x = cx - neckW - 3.5 + a * (2 * neckW + 7);
              const y = shY - 2 + Math.sin(a * Math.PI) * 7.5;
              push(<circle key={key()} cx={f(x)} cy={f(y)} r={0.78} fill="#efe7da" stroke="#9a907e" strokeWidth={0.2} />);
            }
          }
        } else push(<circle key={key()} cx={f(cx + 9)} cy={f(shY + 9)} r={1.5} fill="#d8c48a" stroke="#7a6630" strokeWidth={0.3} />);
        break;
      }
      case 'girl': {
        shape(`M${f(cx - 12 * kidW)},${f(shY - 1)} Q${f(cx)},${f(shY + 4)} ${f(cx + 12 * kidW)},${f(shY - 1)} C${f(cx + 20 * kidW)},${f(shY + 1)} ${f(cx + W * 0.85)},${f(shY + 6)} ${f(cx + W)},${f(shY + 14)} L${f(cx + W + 1)},121 L${f(cx - W - 1)},121 L${f(cx - W)},${f(shY + 14)} C${f(cx - W * 0.85)},${f(shY + 6)} ${f(cx - 20 * kidW)},${f(shY + 1)} ${f(cx - 12 * kidW)},${f(shY - 1)}Z`, fill);
        for (const s of [-1, 1]) shape(`M${f(cx)},${f(shY + 4)} Q${f(cx + s * 6)},${f(shY + 1)} ${f(cx + s * 12 * kidW)},${f(shY - 1)} Q${f(cx + s * 12)},${f(shY + 7)} ${f(cx + s * 1.5)},${f(shY + 8)}Z`, '#f2ece0');
        break;
      }
      case 'boy': {
        shape(bodyD, fill);
        folds();
        shape(vee(8), '#ece6da');
        collarPts(6, 3, '#f2ece0');
        if (dressRoll > 0.6) {
          shape(`M${f(cx)},${f(shY + 0.6)} L${f(cx - 3.4)},${f(shY - 1.2)} L${f(cx - 3.6)},${f(shY + 2.6)}Z M${f(cx)},${f(shY + 0.6)} L${f(cx + 3.4)},${f(shY - 1.2)} L${f(cx + 3.6)},${f(shY + 2.6)}Z`, tie);
        }
        for (let i = 0; i < 4; i++) line(`M${f(cx - W)},${f(shY + 10 + i * 4)} H${f(cx + W)}`, dark(clothBase(), 0.3), 0.6, 0.35);
        break;
      }
    }
  }

  function paintHair() {
    const hl = g.hl;
    const temple = g.templeY;
    const H = (d: string, op = 1) => {
      shape(d, u('hr'), op);
      shape(d, u('hs'), 0.5 * op);
    };
    const strands = (ds: string[], op = 0.35) => line(ds.join(' '), hairHi, 0.45, op);
    const shadowStrands = (ds: string[]) => line(ds.join(' '), hairDk, 0.5, 0.4);
    // generic male cap of hair
    const cap = (vol: number, rec: number, side: number, lean = 0) => {
      const sb = eyeY + side;
      const hlT = hl + 1.8 - rec * 8;
      return `M${f(cx - hw - 0.7)},${f(sb)} C${f(cx - hw - 1.6)},${f(temple - 2)} ${f(cx - hw - 1.8 - vol * 0.18)},${f(top + 6)} ${f(cx - hw * 0.55)},${f(top - vol * 0.75 + 1)} C${f(cx - hw * 0.2 + lean)},${f(top - vol - 0.6)} ${f(cx + hw * 0.3 + lean)},${f(top - vol - 0.6)} ${f(cx + hw * 0.62)},${f(top - vol * 0.7 + 1)} C${f(cx + hw + 1.8 + vol * 0.18)},${f(top + 6)} ${f(cx + hw + 1.6)},${f(temple - 2)} ${f(cx + hw + 0.7)},${f(sb)} L${f(cx + hw - 1.3)},${f(sb)} C${f(cx + hw - 1.4)},${f(temple)} ${f(cx + hw * 0.78)},${f(hlT + 2)} ${f(cx + hw * 0.62)},${f(hlT)} Q${f(cx + hw * 0.3)},${f(hl - 0.2)} ${f(cx)},${f(hl)} Q${f(cx - hw * 0.3)},${f(hl - 0.2)} ${f(cx - hw * 0.62)},${f(hlT)} C${f(cx - hw * 0.78)},${f(hlT + 2)} ${f(cx - hw + 1.4)},${f(temple)} ${f(cx - hw + 1.3)},${f(sb)}Z`;
    };
    switch (style) {
      case 'slick': {
        H(cap(1.8, recede, -1.5));
        dab(cx - 4, top + 3, 9, 3.2, 0.3, 'l', -8);
        const ds: string[] = [];
        for (let i = -3; i <= 3; i++) ds.push(`M${f(cx + i * 3.6)},${f(hl - 0.8)} Q${f(cx + i * 4.2)},${f(top + 2)} ${f(cx + i * 3.2 + 2)},${f(top - 1)}`);
        strands(ds, 0.38);
        break;
      }
      case 'side': {
        H(cap(2.8, recede, -1, 2));
        const px = cx - hw * 0.42;
        const ds: string[] = [];
        for (let i = 1; i <= 6; i++) ds.push(`M${f(px + 0.5)},${f(top - 1 + i * 0.8)} Q${f(px + i * 3)},${f(top - 3 + i * 0.4)} ${f(cx + hw - 1)},${f(hl + i * 0.9 - 1)}`);
        for (let i = 1; i <= 2; i++) ds.push(`M${f(px - 0.5)},${f(top + i * 1.5)} Q${f(px - 4)},${f(top + i)} ${f(cx - hw + 0.5)},${f(temple - 2 + i)}`);
        strands(ds, 0.35);
        line(`M${f(px)},${f(hl - 0.5)} L${f(px + 0.6)},${f(top - 1.5)}`, mix(hair, skinBase, 0.45), 0.6, 0.7);
        break;
      }
      case 'pomp': {
        H(cap(4, recede, -1.5));
        const q = `M${f(cx - hw * 0.72)},${f(hl + 0.6)} C${f(cx - hw * 0.9)},${f(top - 4)} ${f(cx - 3)},${f(top - 9.5)} ${f(cx + hw * 0.55)},${f(top - 6.5)} C${f(cx + hw * 0.9)},${f(top - 5)} ${f(cx + hw * 0.6)},${f(hl - 4)} ${f(cx + hw * 0.2)},${f(hl - 1.5)} Q${f(cx - 2)},${f(hl - 2.5)} ${f(cx - hw * 0.72)},${f(hl + 0.6)}Z`;
        H(q);
        strands([`M${f(cx - hw * 0.6)},${f(hl)} C${f(cx - hw * 0.6)},${f(top - 4)} ${f(cx)},${f(top - 8)} ${f(cx + hw * 0.5)},${f(top - 5.5)}`, `M${f(cx - hw * 0.3)},${f(hl - 1)} C${f(cx - hw * 0.3)},${f(top - 3)} ${f(cx + 2)},${f(top - 6)} ${f(cx + hw * 0.55)},${f(top - 3.5)}`, `M${f(cx)},${f(hl - 1.5)} C${f(cx)},${f(top - 1)} ${f(cx + 4)},${f(top - 3)} ${f(cx + hw * 0.6)},${f(top - 1.5)}`], 0.45);
        shadowStrands([`M${f(cx + hw * 0.2)},${f(hl - 1.5)} Q${f(cx - 2)},${f(hl - 2.5)} ${f(cx - hw * 0.72)},${f(hl + 0.6)}`]);
        break;
      }
      case 'crew': {
        H(cap(0.9, recede, -2.5), 0.96);
        const ds: string[] = [];
        for (let i = 0; i < 14; i++) {
          const a = i / 13;
          const x = cx - hw + a * hw * 2;
          ds.push(`M${f(x)},${f(hl - 0.6 + Math.abs(a - 0.5) * 3)} l0.3,-1.4`);
        }
        strands(ds, 0.3);
        break;
      }
      case 'wavy': {
        H(cap(3.4, recede, -0.5, 1));
        const ds: string[] = [];
        for (let j = 0; j < 4; j++) ds.push(`M${f(cx - hw + 2)},${f(hl - 1 - j * 2.4)} q${f(hw * 0.25)},-2 ${f(hw * 0.5)},0 t${f(hw * 0.5)},0 t${f(hw * 0.5)},0 t${f(hw * 0.4)},0`);
        strands(ds, 0.4);
        break;
      }
      case 'thin': {
        H(cap(0.6, 1, -1.5), 0.45);
        for (const s of [-1, 1]) H(`M${f(cx + s * (hw + 0.8))},${f(eyeY - 1)} C${f(cx + s * (hw + 1.8))},${f(temple - 3)} ${f(cx + s * (hw + 1))},${f(top + 7)} ${f(cx + s * (hw - 3))},${f(top + 4)} C${f(cx + s * (hw - 1.5))},${f(top + 9)} ${f(cx + s * (hw - 1.3))},${f(temple)} ${f(cx + s * (hw - 1.3))},${f(eyeY - 1)}Z`);
        const ds: string[] = [];
        for (let i = 0; i < 5; i++) ds.push(`M${f(cx - hw * 0.6)},${f(top + 3 + i * 1.5)} Q${f(cx)},${f(top + 1 + i * 1.5)} ${f(cx + hw * 0.7)},${f(top + 4 + i * 1.6)}`);
        line(ds.join(' '), hair, 0.35, 0.55);
        dab(cx - 3, top + 5, 7, 3.5, 0.3, 'l');
        break;
      }
      case 'bald': {
        for (const s of [-1, 1]) H(`M${f(cx + s * (hw + 0.9))},${f(eyeY - 0.5)} C${f(cx + s * (hw + 1.8))},${f(temple - 3)} ${f(cx + s * (hw + 1.3))},${f(top + 9)} ${f(cx + s * (hw - 1.2))},${f(top + 8)} C${f(cx + s * (hw - 0.6))},${f(top + 11.5)} ${f(cx + s * (hw - 1.2))},${f(temple)} ${f(cx + s * (hw - 1.2))},${f(eyeY - 0.5)}Z`);
        dab(cx - 4, top + 5, 7, 4, 0.45, 'l', -15);
        push(<ellipse key={key()} cx={f(cx - 5)} cy={f(top + 4)} rx={2.4} ry={1} fill="#fff8ec" opacity={0.35} transform={`rotate(-20 ${f(cx - 5)} ${f(top + 4)})`} />);
        break;
      }
      case 'boy': {
        H(cap(2.2, 0, -2, 1.5));
        const px = cx + hw * 0.4;
        H(`M${f(cx - hw * 0.8)},${f(hl + 1.6)} Q${f(cx - 2)},${f(hl - 1.4)} ${f(px)},${f(hl - 2.2)} L${f(px)},${f(top + 1)} Q${f(cx - 6)},${f(top + 1)} ${f(cx - hw * 0.8)},${f(hl + 1.6)}Z`);
        strands([`M${f(px)},${f(top + 1)} Q${f(cx - 4)},${f(top + 2)} ${f(cx - hw * 0.7)},${f(hl + 1)}`, `M${f(px)},${f(top + 3)} Q${f(cx - 2)},${f(top + 5)} ${f(cx - hw * 0.4)},${f(hl)}`], 0.4);
        break;
      }
      case 'girl': {
        H(`M${f(cx - hw - 1.4)},${f(eyeY - 1)} C${f(cx - hw - 3)},${f(top - 1)} ${f(cx - 7)},${f(top - 4)} ${f(cx)},${f(top - 4)} C${f(cx + 7)},${f(top - 4)} ${f(cx + hw + 3)},${f(top - 1)} ${f(cx + hw + 1.4)},${f(eyeY - 1)} L${f(cx + hw - 1.5)},${f(eyeY - 2)} L${f(cx + hw - 2)},${f(browY - 3)} Q${f(cx + 6)},${f(browY - 1.6)} ${f(cx)},${f(browY - 2.6)} Q${f(cx - 6)},${f(browY - 1.6)} ${f(cx - hw + 2)},${f(browY - 3)} L${f(cx - hw + 1.5)},${f(eyeY - 2)}Z`);
        const ds: string[] = [];
        for (let i = -3; i <= 3; i++) ds.push(`M${f(cx + i * 3)},${f(browY - 2.6)} Q${f(cx + i * 2.4)},${f(top + 3)} ${f(cx + i * 1.2)},${f(top - 3)}`);
        strands(ds, 0.35);
        const bx = cx + hw * 0.55;
        const by = top + 1;
        const bowCol = pickFrom(['#b0303a', '#3a5f9a', '#e8e0d0', '#d8a0b0'], look);
        shape(`M${f(bx)},${f(by)} l-5,-3 l0,6Z M${f(bx)},${f(by)} l5,-3 l0,6Z`, bowCol);
        push(<circle key={key()} cx={f(bx)} cy={f(by)} r={1.1} fill={dark(bowCol, 0.3)} />);
        break;
      }
      case 'bouffant': {
        H(`M${f(cx - hw - 1.4)},${f(eyeY - 2)} C${f(cx - hw - 3.5)},${f(top - 2)} ${f(cx - 8)},${f(top - 8.5)} ${f(cx + 2)},${f(top - 8)} C${f(cx + hw + 3)},${f(top - 6)} ${f(cx + hw + 3.5)},${f(temple)} ${f(cx + hw + 1.4)},${f(eyeY - 2)} L${f(cx + hw - 1.3)},${f(eyeY - 2.5)} C${f(cx + hw - 1)},${f(temple - 4)} ${f(cx + hw * 0.5)},${f(hl - 2.5)} ${f(cx + 2)},${f(hl - 1)} C${f(cx - hw * 0.5)},${f(hl + 1)} ${f(cx - hw + 1)},${f(temple - 1)} ${f(cx - hw + 1.2)},${f(eyeY - 3)}Z`);
        strands([`M${f(cx - hw * 0.8)},${f(hl + 1)} C${f(cx - hw)},${f(top - 3)} ${f(cx)},${f(top - 7)} ${f(cx + hw * 0.6)},${f(top - 5)}`, `M${f(cx - hw * 0.3)},${f(hl - 0.5)} C${f(cx - hw * 0.3)},${f(top - 2)} ${f(cx + 4)},${f(top - 5)} ${f(cx + hw * 0.9)},${f(top - 1)}`, `M${f(cx + 3)},${f(hl - 1.2)} C${f(cx + 7)},${f(hl - 3)} ${f(cx + hw)},${f(temple - 4)} ${f(cx + hw + 0.8)},${f(eyeY - 4)}`], 0.42);
        break;
      }
      case 'flip': {
        H(`M${f(cx - hw - 1.3)},${f(eyeY)} C${f(cx - hw - 3)},${f(top)} ${f(cx - 7)},${f(top - 5)} ${f(cx)},${f(top - 5)} C${f(cx + 7)},${f(top - 5)} ${f(cx + hw + 3)},${f(top)} ${f(cx + hw + 1.3)},${f(eyeY)} L${f(cx + hw - 1.2)},${f(eyeY - 2)} C${f(cx + hw - 1)},${f(temple - 4)} ${f(cx + hw * 0.4)},${f(hl - 2)} ${f(cx - hw * 0.35)},${f(hl - 1.5)} C${f(cx - hw * 0.7)},${f(hl)} ${f(cx - hw + 1)},${f(temple)} ${f(cx - hw + 1.2)},${f(eyeY - 2)}Z`);
        strands([`M${f(cx - hw * 0.35)},${f(hl - 1.5)} C${f(cx + 2)},${f(top - 2)} ${f(cx + hw)},${f(top + 1)} ${f(cx + hw + 1)},${f(eyeY - 3)}`, `M${f(cx - hw * 0.35)},${f(hl - 1.5)} C${f(cx - 4)},${f(top)} ${f(cx - hw - 1)},${f(top + 4)} ${f(cx - hw - 1)},${f(eyeY - 3)}`], 0.42);
        line(`M${f(cx - hw * 0.35)},${f(hl - 1.5)} L${f(cx - hw * 0.3)},${f(top - 4)}`, mix(hair, skinBase, 0.4), 0.5, 0.5);
        break;
      }
      case 'chignon': {
        H(`M${f(cx - hw - 1)},${f(eyeY - 2)} C${f(cx - hw - 2.5)},${f(top + 1)} ${f(cx - 6)},${f(top - 3)} ${f(cx)},${f(top - 3)} C${f(cx + 6)},${f(top - 3)} ${f(cx + hw + 2.5)},${f(top + 1)} ${f(cx + hw + 1)},${f(eyeY - 2)} L${f(cx + hw - 1.2)},${f(eyeY - 3)} C${f(cx + hw - 1)},${f(temple - 3)} ${f(cx + hw * 0.5)},${f(hl - 0.5)} ${f(cx)},${f(hl)} C${f(cx - hw * 0.5)},${f(hl - 0.5)} ${f(cx - hw + 1)},${f(temple - 3)} ${f(cx - hw + 1.2)},${f(eyeY - 3)}Z`);
        const ds: string[] = [];
        for (let i = -2; i <= 2; i++) ds.push(`M${f(cx + i * 4)},${f(hl - 0.3)} Q${f(cx + i * 5)},${f(top + 2)} ${f(cx + i * 2 + 3)},${f(top - 3)}`);
        strands(ds, 0.38);
        break;
      }
      case 'curls': {
        H(`M${f(cx - hw - 1.5)},${f(eyeY - 1)} C${f(cx - hw - 3)},${f(top - 1)} ${f(cx - 7)},${f(top - 5)} ${f(cx)},${f(top - 5)} C${f(cx + 7)},${f(top - 5)} ${f(cx + hw + 3)},${f(top - 1)} ${f(cx + hw + 1.5)},${f(eyeY - 1)} L${f(cx + hw - 1.2)},${f(eyeY - 2.5)} C${f(cx + hw - 1)},${f(temple - 3)} ${f(cx + hw * 0.5)},${f(hl)} ${f(cx)},${f(hl + 0.5)} C${f(cx - hw * 0.5)},${f(hl)} ${f(cx - hw + 1)},${f(temple - 3)} ${f(cx - hw + 1.2)},${f(eyeY - 2.5)}Z`);
        const n = 13;
        for (let i = 0; i < n; i++) {
          const a = Math.PI * (1.02 + (i / (n - 1)) * 0.96);
          const rx = hw + 2;
          const ry = eyeY - top + 2;
          const x = cx + Math.cos(a) * rx;
          const y = eyeY - 1 + Math.sin(a) * ry * 0.98;
          push(<circle key={key()} cx={f(x)} cy={f(y)} r={2.5} fill={u('hr')} />);
          line(`M${f(x - 1.4)},${f(y + 0.4)} a1.5,1.5 0 1,1 2,1`, hairHi, 0.45, 0.55);
        }
        for (let i = 0; i < 5; i++) {
          const x = cx - hw * 0.6 + i * hw * 0.3;
          const y = hl - 1.4 - Math.sin((i / 4) * Math.PI) * 1.2;
          push(<circle key={key()} cx={f(x)} cy={f(y)} r={2.2} fill={u('hr')} />);
          line(`M${f(x - 1.2)},${f(y + 0.3)} a1.3,1.3 0 1,1 1.8,0.9`, hairHi, 0.4, 0.5);
        }
        break;
      }
    }
  }

  function paintHat() {
    if (hat === 'none') return;
    if (hat === 'fedora') {
      const by = g.hl + 1.8; // brim at the front
      const cw = hw + 2.6;
      const crownTop = top - 8;
      // crown with a centre crease and side pinches
      shape(`M${f(cx - cw)},${f(by)} C${f(cx - cw - 0.8)},${f(crownTop + 6)} ${f(cx - cw * 0.65)},${f(crownTop)} ${f(cx - 2.4)},${f(crownTop + 1)} Q${f(cx)},${f(crownTop + 3.4)} ${f(cx + 2.4)},${f(crownTop + 1)} C${f(cx + cw * 0.65)},${f(crownTop)} ${f(cx + cw + 0.8)},${f(crownTop + 6)} ${f(cx + cw)},${f(by)}Z`, u('ht'));
      line(`M${f(cx - 4.5)},${f(crownTop + 2.5)} Q${f(cx - 3.2)},${f(crownTop + 8)} ${f(cx - 1.6)},${f(by - 7)} M${f(cx + 4.5)},${f(crownTop + 2.5)} Q${f(cx + 3.2)},${f(crownTop + 8)} ${f(cx + 1.6)},${f(by - 7)}`, dark(hatCol, 0.65), 1, 0.55);
      line(`M${f(cx - cw + 2)},${f(by - 6)} Q${f(cx - cw + 1.5)},${f(crownTop + 5)} ${f(cx - 6)},${f(crownTop + 1.5)}`, lite(hatCol, 0.4), 0.8, 0.35);
      // band
      shape(`M${f(cx - cw - 0.2)},${f(by - 4.2)} Q${f(cx)},${f(by - 2.6)} ${f(cx + cw + 0.2)},${f(by - 4.2)} L${f(cx + cw + 0.3)},${f(by)} Q${f(cx)},${f(by + 1.4)} ${f(cx - cw - 0.3)},${f(by)}Z`, '#0f0b09');
      line(`M${f(cx - cw + 1)},${f(by - 3.2)} Q${f(cx)},${f(by - 1.8)} ${f(cx + cw - 1)},${f(by - 3.2)}`, '#3a302a', 0.4, 0.8);
      // snap brim: up at the back and sides, down over the eyes in front
      shape(`M${f(cx - cw - 11)},${f(by - 2.6)} Q${f(cx - cw - 2)},${f(by - 0.6)} ${f(cx)},${f(by - 0.4)} Q${f(cx + cw + 2)},${f(by - 0.8)} ${f(cx + cw + 11)},${f(by - 3.6)} Q${f(cx + cw + 6)},${f(by + 2.6)} ${f(cx)},${f(by + 4.6)} Q${f(cx - cw - 6)},${f(by + 3.4)} ${f(cx - cw - 11)},${f(by - 2.6)}Z`, u('ht'));
      line(`M${f(cx - cw - 9)},${f(by - 1.4)} Q${f(cx - cw)},${f(by + 2.8)} ${f(cx)},${f(by + 3.8)}`, lite(hatCol, 0.4), 0.5, 0.5);
      return;
    }
    if (hat === 'police') {
      const by = g.hl;
      const cw = hw + 2.4;
      shape(`M${f(cx - cw + 1)},${f(by - 3.5)} C${f(cx - cw - 4)},${f(top - 3)} ${f(cx - 6)},${f(top - 7)} ${f(cx)},${f(top - 7)} C${f(cx + 6)},${f(top - 7)} ${f(cx + cw + 4)},${f(top - 3)} ${f(cx + cw - 1)},${f(by - 3.5)}Z`, '#1d2638');
      dab(cx - 4, top - 3, 8, 2.5, 0.3, 'l');
      push(<rect key={key()} x={f(cx - hw - 1)} y={f(by - 4.5)} width={f(hw * 2 + 2)} height={4.6} fill="#0e1118" />);
      line(`M${f(cx - hw - 1)},${f(by - 4.2)} H${f(cx + hw + 1)}`, '#c9a548', 0.5, 0.8);
      shape(`M${f(cx)},${f(by - 7.5)} l2.2,1.2 l0,2.8 l-2.2,2.2 l-2.2,-2.2 l0,-2.8Z`, '#d8b45a');
      shape(`M${f(cx - hw + 0.5)},${f(by)} Q${f(cx)},${f(by + 5)} ${f(cx + hw - 0.5)},${f(by)} Q${f(cx)},${f(by + 1.4)} ${f(cx - hw + 0.5)},${f(by)}Z`, '#07080b');
      line(`M${f(cx - hw * 0.5)},${f(by + 1.3)} Q${f(cx)},${f(by + 3)} ${f(cx + hw * 0.2)},${f(by + 2.2)}`, '#fff', 0.5, 0.35);
      return;
    }
    // flat cap
    const by = g.hl + 0.5;
    shape(`M${f(cx - hw - 1.5)},${f(by)} C${f(cx - hw - 2.5)},${f(top)} ${f(cx - 4)},${f(top - 4)} ${f(cx + 3)},${f(top - 3)} C${f(cx + hw + 4)},${f(top - 2)} ${f(cx + hw + 3)},${f(by - 3)} ${f(cx + hw + 1.5)},${f(by - 0.5)}Z`, u('ht'));
    const ds: string[] = [];
    for (let i = 0; i < 6; i++) ds.push(`M${f(cx - hw + i * 5)},${f(by - 1)} l1.5,-${f(4 + (i % 2))}`);
    line(ds.join(' '), lite(hatCol, 0.3), 0.4, 0.35);
    shape(`M${f(cx - hw + 2)},${f(by - 0.6)} Q${f(cx)},${f(by + 4.4)} ${f(cx + hw - 2)},${f(by - 0.6)} Q${f(cx)},${f(by + 0.8)} ${f(cx - hw + 2)},${f(by - 0.6)}Z`, dark(hatCol, 0.4));
  }
}

function mulberry(a: number) {
  let s = a >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}
