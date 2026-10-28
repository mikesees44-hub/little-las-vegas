import { hasTrait } from '../characters';
import type { Character, GameState } from '../types';
import { clamp } from './state';
import { MEM_CAP, type Mem, type MemKind, type Mind } from './types';

/**
 * Memory: salient events with an emotional weight that fades. A slight
 * remembered by a Vengeful man barely fades; a Patient man lets go sooner.
 * Grudges and debts of gratitude are what is left, per person.
 */

/** Weekly fade of salience (≈ 0.81 a month). */
export const FADE = 0.95;

export function remember(m: Mind, mem: Omit<Mem, 's'> & { s?: number }): void {
  const v = Math.round(clamp(mem.v, -50, 50));
  if (v === 0) return;
  // The same thing about the same man again: it weighs more, it is fresh again.
  const same = m.mem.find((x) => x.k === mem.k && x.who === mem.who && x.t === mem.t);
  if (same) {
    same.v = Math.round(clamp(same.v + v / 2, -50, 50));
    same.s = 1;
    same.w = mem.w;
    return;
  }
  m.mem.push({ w: mem.w, k: mem.k, ...(mem.who ? { who: mem.who } : {}), t: mem.t.slice(0, 90), v, s: clamp(mem.s ?? 1, 0, 1) });
  if (m.mem.length > MEM_CAP) {
    // The weakest goes: weight x salience.
    let worst = 0;
    for (let i = 1; i < m.mem.length; i++) if (Math.abs(m.mem[i].v) * m.mem[i].s < Math.abs(m.mem[worst].v) * m.mem[worst].s) worst = i;
    m.mem.splice(worst, 1);
  }
}

/** One week of fading. Negative memories of a Vengeful man barely fade. */
export function fadeMemories(c: Character, m: Mind, weeks = 1): void {
  const vengeful = hasTrait(c, 'Vengeful');
  const patient = hasTrait(c, 'Patient');
  for (const x of m.mem) {
    const f = x.v < 0 ? (vengeful ? 0.99 : patient ? 0.92 : FADE) : FADE;
    x.s = Math.round(x.s * Math.pow(f, weeks) * 1000) / 1000;
  }
  m.mem = m.mem.filter((x) => x.s >= 0.08);
}

/** The weight of what he holds against someone (≥ 0). */
export function grudge(m: Mind, who: string): number {
  let g = 0;
  for (const x of m.mem) if (x.who === who && x.v < 0) g += -x.v * x.s;
  return Math.round(g);
}

/** What he owes someone in gratitude (≥ 0). */
export function gratitude(m: Mind, who: string): number {
  let g = 0;
  for (const x of m.mem) if (x.who === who && x.v > 0) g += x.v * x.s;
  return Math.round(g);
}

/** The man he holds the most against (and how much). */
export function worstGrudge(s: GameState, m: Mind): { who: string; g: number } | undefined {
  const by = new Map<string, number>();
  for (const x of m.mem) if (x.who && x.v < 0 && s.characters[x.who]?.alive) by.set(x.who, (by.get(x.who) ?? 0) + -x.v * x.s);
  let best: { who: string; g: number } | undefined;
  for (const [who, g] of by) if (!best || g > best.g || (g === best.g && who < best.who)) best = { who, g: Math.round(g) };
  return best;
}

const MOD_KIND = (v: number, reason: string): MemKind => {
  const r = reason.toLowerCase();
  if (/rat|betray|flip|sold/.test(r)) return 'betrayal';
  if (/gift|envelope|paid|gave/.test(r)) return v > 0 ? 'gift' : 'slight';
  return v > 0 ? 'favor' : 'slight';
};

/**
 * "They remember": new, strong opinion modifiers he holds about anyone
 * become memories (once each). Reads `s.relations` for his outgoing edges
 * among the people the minds layer watches.
 */
export function absorbOpinions(s: GameState, m: Mind, watch: readonly string[]): void {
  const seen = new Set(m.seen ?? []);
  const fresh: string[] = [];
  for (const to of watch) {
    if (to === m.id) continue;
    const r = s.relations[`${m.id}>${to}`];
    if (!r) continue;
    for (const mod of r.modifiers) {
      if (Math.abs(mod.value) < 8 || s.week - mod.week > 3) continue;
      const key = `${mod.id}:${mod.value > 0 ? 'p' : 'n'}`;
      if (seen.has(key)) continue;
      fresh.push(key);
      remember(m, { w: mod.week, k: MOD_KIND(mod.value, mod.reason), who: to, t: mod.reason, v: mod.value / 2 });
    }
  }
  if (fresh.length || m.seen) m.seen = [...(m.seen ?? []), ...fresh].slice(-16);
}
