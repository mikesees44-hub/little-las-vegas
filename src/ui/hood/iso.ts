/**
 * The illustrated island's projection and palettes. North is up; the island
 * (whose frame runs along its length, `u`, and inland, `v`) is turned to its
 * real bearing (~35° east of north) and the ground is tilted (2.5D) so the
 * ocean-facing fronts of buildings face the viewer. "Plan" flattens it.
 */

const TH = (35 * Math.PI) / 180;
const SIN = Math.sin(TH);
const COS = Math.cos(TH);

export interface Proj { k: number; hz: number; iso: boolean }
export const ISO: Proj = { k: 0.52, hz: 1.6, iso: true };
export const PLAN: Proj = { k: 1, hz: 0, iso: false };

/** Island frame (u, v, height z in meters) → screen (world units = meters). */
export function P(pr: Proj, u: number, v: number, z = 0): [number, number] {
  const x = u * SIN - v * COS;
  const y = u * COS + v * SIN;
  return [x, -y * pr.k - z * pr.hz];
}

export function pt(p: [number, number]): string {
  return `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
}

export function poly(ps: [number, number][]): string {
  return `M${ps.map(pt).join('L')}Z`;
}

export function line(ps: [number, number][]): string {
  return `M${ps.map(pt).join('L')}`;
}

/** Screen angle (degrees) of the island's long axis and of the cross streets. */
export function axisAngle(pr: Proj): number {
  const [x0, y0] = P(pr, 0, 0);
  const [x1, y1] = P(pr, 100, 0);
  return (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
}
export function crossAngle(pr: Proj): number {
  const [x0, y0] = P(pr, 0, 0);
  const [x1, y1] = P(pr, 0, -100);
  return (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
}

/* ---------------- color ---------------- */

export type Mood = 'day' | 'dusk' | 'night';

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('')}`;
}
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hex(a);
  const [r2, g2, b2] = hex(b);
  return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}
export function shade(c: string, t: number): string {
  return t >= 0 ? mix(c, '#ffffff', t) : mix(c, '#000000', -t);
}

/** Lighting: how a daytime color looks in this mood (neon is never tinted). */
export function lit(c: string, m: Mood): string {
  if (m === 'day') return c;
  if (m === 'dusk') return mix(mix(c, '#6a3d78', 0.35), '#ff8a5c', 0.08);
  return mix(c, '#0d1630', 0.64);
}

export interface Palette {
  ocean: string; ocean2: string; bay: string; foam: string; sand: string; sand2: string; ground: string; block: string; roofs: [string, string, string];
  street: string; streetLine: string; plank: string; plank2: string; marsh: string; mainland: string; label: string; labelHalo: string; water: string;
  sky: string; windowLit: string; window: string;
}

const DAY: Palette = {
  ocean: '#2fb5c9', ocean2: '#1d8fb3', bay: '#4bb8b0', foam: '#f4fbff', sand: '#f6e2b3', sand2: '#efd29a', ground: '#efe6cf', block: '#e6dcc2', roofs: ['#d99a8a', '#8fbfb8', '#e6c27a'],
  street: '#9a9690', streetLine: '#f3eee0', plank: '#c79a5c', plank2: '#a97c42', marsh: '#9db86f', mainland: '#b9c98c', label: '#21384f', labelHalo: '#fffaf0', water: '#5cc8d0',
  sky: '#bfe8f5', windowLit: '#ffe39a', window: '#3d6f8a',
};

export function palette(m: Mood): Palette {
  if (m === 'day') return DAY;
  const o = {} as Record<string, unknown>;
  for (const [k, v] of Object.entries(DAY)) o[k] = Array.isArray(v) ? v.map((x) => lit(x, m)) : typeof v === 'string' && v.startsWith('#') ? lit(v, m) : v;
  const p = o as unknown as Palette;
  p.label = m === 'night' ? '#e8dcbf' : '#f6ead2';
  p.labelHalo = m === 'night' ? '#0a1024' : '#3a2440';
  p.windowLit = '#ffd27a';
  p.window = m === 'night' ? '#ffcf6e' : '#ffb870';
  return p;
}

/** Doo Wop pastels for walls. */
export const PASTELS = ['#5fd3c4', '#ff8a73', '#ff9ec7', '#a8e6cf', '#ffd86b', '#fff3df', '#8ecae6', '#c3a6ff'];
