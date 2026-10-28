import { hasTrait } from '../characters';
import { opinion } from '../relations';
import type { Character, GameState, Trait } from '../types';
import { ageOf, clamp, rivalLedBy } from './state';
import { NEEDS, type Mind, type Mood, type Need } from './types';

/**
 * Needs, drives and mood. A drive's WEIGHT is his nature (traits, age,
 * station: what he cares about); its SATISFACTION is his situation (what he
 * has). Urgency = weight x (1 - satisfaction): a greedy man who is broke is
 * driven by money; a greedy man who is rich is not, for now.
 */

export type Drives = Record<Need, number>;

const BASE: Drives = { money: 0.5, respect: 0.5, safety: 0.45, power: 0.3, family: 0.4, pleasure: 0.3, revenge: 0.2, loyalty: 0.4 };

const TRAIT_DRIVE: Partial<Record<Trait, Partial<Drives>>> = {
  Greedy: { money: 0.4, loyalty: -0.1 },
  Gambler: { money: 0.2, pleasure: 0.3 },
  Ambitious: { power: 0.5, respect: 0.2, loyalty: -0.1 },
  'Hot-headed': { respect: 0.3, revenge: 0.2 },
  Vengeful: { revenge: 0.5 },
  Cruel: { revenge: 0.2, power: 0.1 },
  Cowardly: { safety: 0.5, respect: -0.1 },
  Paranoid: { safety: 0.3 },
  Patient: { revenge: -0.05, safety: 0.05 },
  'Loyal-to-a-fault': { loyalty: 0.6 },
  Honest: { loyalty: 0.2, money: -0.1 },
  Pious: { family: 0.3, pleasure: -0.2 },
  Womanizer: { pleasure: 0.4 },
  Drinker: { pleasure: 0.3 },
  Charming: { respect: 0.1, pleasure: 0.1 },
};

/** What he cares about (0.05-1 per need), from his nature, age and station. */
export function drives(s: GameState, c: Character): Drives {
  const d: Drives = { ...BASE };
  for (const t of c.traits) {
    const m = TRAIT_DRIVE[t];
    if (m) for (const k in m) d[k as Need] += m[k as Need] ?? 0;
  }
  const age = ageOf(s, c);
  if (age < 25) { d.pleasure += 0.15; d.respect += 0.1; }
  if (age > 55) { d.safety += 0.2; d.family += 0.2; d.power -= 0.1; }
  if (c.rank === 'capo' || c.rank === 'underboss') d.power += 0.15;
  if (c.rank === 'associate') { d.respect += 0.15; d.money += 0.1; }
  if (rivalLedBy(s, c.id)) d.power += 0.3;
  if (c.spouseId || c.childrenIds.length || c.household?.kids.length) d.family += 0.2;
  if (c.gender === 'F' && c.rank === 'civilian') { d.family += 0.1; d.power -= 0.1; }
  for (const k of NEEDS) d[k] = Math.round(clamp(d[k], 0.05, 1) * 100) / 100;
  return d;
}

const RANK_POWER: Record<string, number> = { boss: 95, underboss: 80, consigliere: 72, capo: 62, soldier: 35, associate: 15, civilian: 25 };

/** Facts read off the world once a week for every mind (the expensive reads). */
export interface WeekLook {
  /** The boss's crew strength. */
  bossStrength: number;
  /** People a planned threat is aimed at. */
  threatened: Set<string>;
  /** Total influence per rival faction over the island (0..). */
  turf: Record<string, number>;
}

/** How satisfied each need is (0-100), from his situation. */
export function satisfaction(s: GameState, c: Character, look: WeekLook, prev?: Mind): number[] {
  const r = rivalLedBy(s, c.id);
  const out: number[] = [];
  const opBoss = opinion(s, c.id, s.playerId);
  const bossOfHim = opinion(s, s.playerId, c.id);
  const griefOrGrudge = prev ? prev.mem.reduce((a, m) => a + (m.v < 0 ? -m.v * m.s : 0), 0) : 0;
  for (const n of NEEDS) {
    let v = 50;
    switch (n) {
      case 'money':
        v = r ? r.money / 120 : 12 * Math.log(1 + Math.max(0, c.wealth) / 250) + ((c.lastEarn ?? 0) > 0 ? 8 : 0) - (c.debtTo ? 25 : 0);
        break;
      case 'respect':
        v = r ? 50 + (r.muscle - look.bossStrength) / 2 : c.faction === 'player' ? 45 + bossOfHim / 2 + (RANK_POWER[c.rank] ?? 25) / 4 : 50;
        break;
      case 'safety': {
        if (r) v = 95 - r.exposure - (r.war ? 25 : 0) - (r.feud ? 10 : 0);
        else {
          const heat = c.faction === 'player' ? (s.heat.local + s.heat.federal) / 5 : 0;
          v = 90 - (c.evidence ?? 0) * 0.6 - heat - (look.threatened.has(c.id) ? 30 : 0) - (c.debtTo ? 15 : 0);
        }
        break;
      }
      case 'power':
        v = r ? Math.min(100, (look.turf[r.id] ?? 0) / 3) : RANK_POWER[c.rank] ?? 25;
        break;
      case 'family':
        v = 40 + (c.spouseId && s.characters[c.spouseId]?.alive ? 30 : c.household?.wife ? 25 : 0) + Math.min(20, (c.childrenIds.length + (c.household?.kids.length ?? 0)) * 7);
        break;
      case 'pleasure':
        // Drifts down; his fun is had on his own dice (planner.ts).
        v = prev?.sat[5] ?? 55;
        break;
      case 'revenge':
        v = 100 - Math.min(100, griefOrGrudge * 2);
        break;
      case 'loyalty':
        v = r ? 60 : c.faction === 'player' ? 50 + opBoss / 2 : 55;
        break;
    }
    out.push(Number.isFinite(v) ? Math.round(clamp(v, 0, 100)) : 50);
  }
  return out;
}

/** Urgency per need: weight x (1 - satisfaction). */
export function urgencies(d: Drives, sat: number[]): Drives {
  const u = {} as Drives;
  NEEDS.forEach((n, i) => { u[n] = Math.round(d[n] * (1 - sat[i] / 100) * 100) / 100; });
  return u;
}

export function topNeeds(u: Drives, k = 2): Need[] {
  return [...NEEDS].sort((a, b) => u[b] - u[a] || NEEDS.indexOf(a) - NEEDS.indexOf(b)).slice(0, k);
}

/** How much risk he will take (0-1). */
export function riskTolerance(s: GameState, c: Character, mood?: Mood): number {
  let r = 0.5;
  if (hasTrait(c, 'Hot-headed')) r += 0.25;
  if (hasTrait(c, 'Gambler')) r += 0.2;
  if (hasTrait(c, 'Ambitious')) r += 0.1;
  if (hasTrait(c, 'Cruel')) r += 0.05;
  if (hasTrait(c, 'Cowardly')) r -= 0.3;
  if (hasTrait(c, 'Paranoid')) r -= 0.15;
  if (hasTrait(c, 'Patient')) r -= 0.1;
  if (ageOf(s, c) > 60) r -= 0.1;
  if (mood === 'afraid') r -= 0.2;
  if (mood === 'angry') r += 0.15;
  return Math.round(clamp(r, 0.05, 0.95) * 100) / 100;
}

/** A schemer plans long and works through lies; a hothead escalates. */
export function isSchemer(c: Character): boolean {
  if (hasTrait(c, 'Hot-headed')) return false;
  return hasTrait(c, 'Patient') || hasTrait(c, 'Paranoid') || (c.attributes.intrigue >= 58 && !hasTrait(c, 'Honest'));
}

export function isHothead(c: Character): boolean {
  return hasTrait(c, 'Hot-headed') || (hasTrait(c, 'Cruel') && !hasTrait(c, 'Patient'));
}

/** His mood, from his needs, his memories and what he is up to. */
export function moodOf(c: Character, d: Drives, sat: number[], m: Pick<Mind, 'mem' | 'plan'>, week: number): { mood: Mood; mv: number } {
  let num = 0;
  let den = 0;
  NEEDS.forEach((n, i) => { num += d[n] * (sat[i] - 50); den += d[n]; });
  const recent = m.mem.reduce((a, x) => a + x.v * x.s, 0);
  const mv = Math.round(clamp(num / Math.max(0.1, den) + clamp(recent / 3, -30, 30), -100, 100));
  const u = urgencies(d, sat);
  const top = topNeeds(u, 1)[0];
  const grief = m.mem.some((x) => x.k === 'grief' && week - x.w <= 8 && x.s > 0.4);
  let mood: Mood;
  if (grief) mood = 'grieving';
  else if (u.revenge >= 0.25 && (hasTrait(c, 'Hot-headed') || hasTrait(c, 'Vengeful') || hasTrait(c, 'Cruel'))) mood = 'angry';
  else if (top === 'safety' && (u.safety >= 0.3 || hasTrait(c, 'Cowardly'))) mood = 'afraid';
  else if (m.plan && (m.plan.k === 'betray' || m.plan.k === 'avenge') && isSchemer(c)) mood = 'scheming';
  else if (top === 'money' && hasTrait(c, 'Greedy') && u.money >= 0.2) mood = 'greedy';
  else if (top === 'loyalty' && hasTrait(c, 'Loyal-to-a-fault')) mood = 'loyal';
  else if (mv >= 25) mood = sat[1] >= 60 ? 'proud' : 'content';
  else if (mv <= -12) mood = u.revenge >= 0.2 ? 'angry' : 'restless';
  else mood = 'content';
  return { mood, mv };
}
