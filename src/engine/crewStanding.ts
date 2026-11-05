import { capos, crew } from './characters';
import { loyaltyTrend } from './loyalty';
import { opinion, opinionBreakdown } from './relations';
import { RELATION_LABEL, sideOf, SIDE_STYLE } from './sides';
import type { Character, GameState } from './types';

/**
 * WHO IS WHOSE, AT A GLANCE (GODFATHER_LOYALTY_SKILLS.md §B). One strip of
 * every crew the boss deals with and where he stands with it: his own
 * regimes (by capo: what the capo and his men think of him) and the other
 * families (what their boss thinks, and war, feud or a pact). Each with a
 * word (tight / friendly / neutral / cold / at war), a meter, a trend and the
 * reasons. Pure reads; colours and emblems are sides.ts's (never colour alone).
 */

export type StandingLevel = 'tight' | 'friendly' | 'neutral' | 'cold' | 'war';
export const STANDING_LABEL: Record<StandingLevel, string> = { tight: 'Tight', friendly: 'Friendly', neutral: 'Neutral', cold: 'Cold', war: 'At war' };

export interface CrewStanding {
  key: string;
  kind: 'yours' | 'family';
  label: string;
  /** Chip text and emblem (sides.ts). */
  short: string;
  emblem: string;
  color: string;
  /** -100..100. */
  v: number;
  level: StandingLevel;
  /** ▲ ▼ → over the last weeks. */
  arrow: '▲' | '▼' | '→';
  why: string[];
  /** The man who speaks for it (the capo, the family's boss). */
  head?: string;
  n: number;
}

export function standingLevel(v: number, war = false): StandingLevel {
  if (war) return 'war';
  return v >= 40 ? 'tight' : v >= 15 ? 'friendly' : v > -15 ? 'neutral' : 'cold';
}

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

/** The men under a capo (alive, his regime). */
export function regimeOf(s: GameState, capoId: string): Character[] {
  return crew(s).filter((c) => c.capoId === capoId && c.id !== capoId);
}

/** Your guys grouped by capo, then the men who answer to you directly. */
export function yourMenByCapo(s: GameState): { capo?: Character; men: Character[] }[] {
  const ks = capos(s);
  const out: { capo?: Character; men: Character[] }[] = ks.map((k) => ({ capo: k, men: regimeOf(s, k.id) }));
  const placed = new Set(out.flatMap((g) => [g.capo!.id, ...g.men.map((m) => m.id)]));
  const rest = crew(s).filter((c) => !placed.has(c.id));
  if (rest.length) out.push({ men: rest });
  return out;
}

export function crewStandings(s: GameState): CrewStanding[] {
  const B = s.playerId;
  const out: CrewStanding[] = [];
  const gold = SIDE_STYLE.player;
  for (const k of capos(s)) {
    const men = regimeOf(s, k.id);
    const kv = opinion(s, k.id, B);
    const mv = avg(men.map((m) => opinion(s, m.id, B)));
    const v = men.length ? Math.round(kv * 0.6 + mv * 0.4) : kv;
    const t = loyaltyTrend(s, k.id);
    const why = [`${k.firstName} himself: ${kv > 0 ? '+' : ''}${kv}`, ...(men.length ? [`His ${men.length} m${men.length === 1 ? 'an' : 'en'} on average: ${mv > 0 ? '+' : ''}${mv}`] : []), ...t.why.slice(0, 2).map((x) => `${x.v > 0 ? '+' : ''}${x.v} ${x.y}`)];
    out.push({ key: `capo:${k.id}`, kind: 'yours', label: `${k.firstName}'s crew`, short: 'YOURS', emblem: gold.emblem, color: gold.color, v, level: standingLevel(v), arrow: t.arrow, why, head: k.id, n: men.length + 1 });
  }
  for (const r of s.rivals) {
    if (r.kind === 'law') continue;
    const L = s.characters[r.leaderId];
    if (!L?.alive) continue;
    const st = SIDE_STYLE[r.id as keyof typeof SIDE_STYLE] ?? SIDE_STYLE.none;
    const side = sideOf(s, L.id);
    const v = opinion(s, L.id, B);
    const war = !!r.war || side.relation === 'war';
    const mods = opinionBreakdown(s, L.id, B).mods.slice().sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 3);
    const why = [
      ...(side.relation ? [RELATION_LABEL[side.relation]] : []),
      ...(r.feud ? ['A blood feud'] : []),
      `${L.firstName} ${L.lastName} thinks ${v > 0 ? '+' : ''}${v} of you`,
      ...mods.map((m) => `${m.value > 0 ? '+' : ''}${Math.round(m.value)} ${m.reason}`),
    ];
    const level = r.feud && !war && v < 15 ? 'cold' : standingLevel(v, war);
    out.push({ key: `fam:${r.id}`, kind: 'family', label: r.kind === 'philly' ? 'Philadelphia' : `The ${r.shortName}s`, short: st.short, emblem: st.emblem, color: st.color, v, level, arrow: loyaltyTrend(s, L.id).arrow, why, head: L.id, n: Object.values(s.characters).filter((c) => c.alive && c.faction === r.id).length });
  }
  return out;
}

/** The crew a person is with, in words: "Sal's crew", "Manno", "Answers to you". */
export function crewWord(s: GameState, c: Character): string {
  const side = sideOf(s, c.id);
  if (side.kind !== 'yours') return side.short[0] + side.short.slice(1).toLowerCase();
  if (c.id === s.playerId) return 'The boss';
  if (c.rank === 'capo') return `Capo · ${c.firstName}'s crew`;
  const k = c.capoId ? s.characters[c.capoId] : undefined;
  if (k?.alive && k.id !== s.playerId) return `${k.firstName}'s crew`;
  if (c.rank === 'underboss' || c.rank === 'consigliere') return 'Administration';
  return c.faction === 'player' ? 'Answers to you' : 'On your side';
}
