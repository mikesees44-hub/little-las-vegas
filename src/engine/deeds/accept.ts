import { ageOn } from '../calendar';
import { hasTrait } from '../characters';
import { grudge, gratitude } from '../minds/memory';
import { drives, satisfaction, urgencies } from '../minds/psyche';
import { mindOf } from '../minds/state';
import { NEED_LABEL, NEEDS, type Need } from '../minds/types';
import { getRelation, opinion } from '../relations';
import type { Character, GameState } from '../types';
import { npcHookOn, owedBy, tieOf } from './state';
import { TIE_LABEL, type Axis, type DeedMode } from './types';
import { traitTerms } from './weights';

/**
 * THE ACCEPTANCE ENGINE. One function decides how a deed lands, whoever does
 * it to whoever: the boss asking a capo, a capo asking the boss (the AI uses
 * it to judge its chances), two soldiers between themselves. The total is a
 * plain sum of named reasons, CK-style: "+20 opinion of you, +15 you're his
 * boss, −30 Paranoid, +10 the gift, −25 he hates your capo". Every number
 * comes from the state: opinion (named modifiers), fear and trust, rank,
 * blood, his traits through the one weight table (weights.ts), and, when he
 * has a mind (minds/), his needs, his grudges and debts, what he believes
 * about you, his mood. Pure.
 */

export interface Reason { label: string; value: number }
export interface Acceptance { chance: number; reasons: Reason[] }

export interface AcceptSpec {
  mode: DeedMode;
  base: number;
  /** How it lands on him, by axis (his traits through weights.ts). */
  recv: Partial<Record<Axis, number>>;
  /** What it gives him, by need (an urgent need makes it welcome). */
  gives?: Partial<Record<Need, number>>;
  /** Weight of his opinion of the actor (default 0.5; hostile deeds use less). */
  opW?: number;
  /** Weight of his fear of the actor (default 0). */
  fearW?: number;
  /** Weight of his trust (default 0). */
  trustW?: number;
  /** Rank counts (an ask from his boss): default true for consent deeds. */
  rank?: boolean;
  /** For odds deeds: the actor's attribute against the target's. */
  skill?: 'diplomacy' | 'intrigue' | 'force' | 'business' | 'leadership';
  /** A friendly deed (grudges hurt it, gratitude helps it, an angry mood sours it). */
  friendly?: boolean;
}

export const RANK_ORDER: Record<string, number> = { boss: 6, underboss: 5, consigliere: 5, capo: 4, soldier: 3, associate: 2, civilian: 1 };

const clampP = (v: number) => Math.max(5, Math.min(95, Math.round(v)));

/** "Fears you", "Opinion of you": in the boss's words when he is the actor, else in the third person. */
function you(s: GameState, a: Character, own: string, other: string): string {
  return a.id === s.playerId ? own : other.replace('{a}', a.firstName);
}

/** Who he answers to: is the actor his boss, his capo, does he outrank him? */
function rankReasons(s: GameState, a: Character, t: Character): Reason[] {
  const out: Reason[] = [];
  const boss = a.id === s.playerId;
  if (boss && t.faction === 'player' && t.rank !== 'civilian') out.push({ label: "You're his boss", value: 15 });
  else if (t.capoId === a.id) out.push({ label: you(s, a, "You're his capo", '{a} is his capo'), value: 10 });
  else if (a.faction === t.faction && t.faction !== 'player' && s.rivals.some((r) => r.id === a.faction && r.leaderId === a.id)) out.push({ label: you(s, a, "You're his boss", '{a} is his boss'), value: 15 });
  else if (a.faction === t.faction && a.rank !== 'civilian' && t.rank !== 'civilian') {
    const d = (RANK_ORDER[a.rank] ?? 1) - (RANK_ORDER[t.rank] ?? 1);
    if (d >= 1) out.push({ label: you(s, a, 'You outrank him', '{a} outranks him'), value: 5 * Math.min(2, d) });
    else if (d <= -1) out.push({ label: you(s, a, 'He outranks you', 'He outranks {a}'), value: -8 });
  }
  if (a.dynasty && t.dynasty && a.id === s.playerId) out.push({ label: 'Blood: your own house', value: 10 });
  return out;
}

/** The man he hates most among the people close to the actor ("he hates your capo"). */
function hatedAssociate(s: GameState, a: Character, t: Character): Reason | undefined {
  const near: [string, string][] = [];
  if (a.spouseId) near.push([a.spouseId, a.id === s.playerId ? 'your wife' : `${a.firstName}'s wife`]);
  if (a.capoId) near.push([a.capoId, a.id === s.playerId ? 'your capo' : `${a.firstName}'s capo`]);
  if (a.id === s.playerId) {
    const ub = Object.values(s.characters).find((c) => c.alive && c.faction === 'player' && c.rank === 'underboss');
    if (ub) near.push([ub.id, 'your underboss']);
    if (t.capoId && t.faction === 'player') near.push([t.capoId, 'your capo']);
  }
  let worst: Reason | undefined;
  for (const [id, word] of near) {
    if (id === t.id) continue;
    const op = opinion(s, t.id, id);
    if (op > -30) continue;
    const who = s.characters[id];
    const v = Math.round(Math.max(-30, op * 0.4));
    if (!worst || v < worst.value) worst = { label: `He hates ${word}${who ? ` ${who.firstName}` : ''}`, value: v };
  }
  return worst;
}

/** His needs right now (minds when he has one; read lightly when not). */
function needsOf(s: GameState, t: Character): Record<Need, number> {
  const m = mindOf(s, t.id);
  const d = drives(s, t);
  const sat = m?.sat.length ? m.sat : satisfaction(s, t, { bossStrength: 50, threatened: new Set(), turf: {} });
  return urgencies(d, sat);
}

/**
 * The reasons (and the total) for actor `a` doing a deed to target `t`.
 * `extra` are the deed's own reasons (the gift, the hook, his debts).
 */
export function acceptance(s: GameState, a: Character, t: Character, spec: AcceptSpec, extra: Reason[] = []): Acceptance {
  const reasons: Reason[] = [];
  const op = opinion(s, t.id, a.id);
  const rel = getRelation(s, t.id, a.id);
  if (spec.mode !== 'odds' || spec.opW) {
    const w = spec.opW ?? 0.5;
    const v = Math.round(op * w);
    if (v) reasons.push({ label: v >= 0 ? you(s, a, 'Opinion of you', 'Opinion of {a}') : you(s, a, 'Dislikes you', 'Dislikes {a}'), value: v });
  }
  if (spec.fearW && rel?.fear) {
    const v = Math.round(rel.fear * spec.fearW);
    if (v) reasons.push({ label: you(s, a, 'Fears you', 'Fears {a}'), value: v });
  }
  if (spec.trustW && rel) {
    const v = Math.round((rel.trust - 30) * spec.trustW);
    if (v) reasons.push({ label: v > 0 ? you(s, a, 'Trusts you', 'Trusts {a}') : you(s, a, 'Does not trust you', 'Does not trust {a}'), value: v });
  }
  if (spec.mode === 'consent' && spec.rank !== false) reasons.push(...rankReasons(s, a, t));
  if (spec.skill) {
    const mine = a.attributes[spec.skill] ?? 50;
    const his = t.attributes[spec.skill === 'force' ? 'force' : 'intrigue'] ?? 50;
    const v = Math.round((mine - 50) / 2);
    const g = -Math.round((his - 50) / 3);
    if (v) reasons.push({ label: you(s, a, `Your ${spec.skill}`, `{a}'s ${spec.skill}`), value: v });
    if (g) reasons.push({ label: g < 0 ? 'He is careful' : 'He is careless', value: g });
  }
  // His nature (the one weight table).
  for (const x of traitTerms(t, spec.recv)) reasons.push({ label: x.trait, value: x.value });
  // His needs: an urgent need makes what feeds it welcome.
  if (spec.gives) {
    const u = needsOf(s, t);
    let best: [Need, number] | undefined;
    for (const n of NEEDS) {
      const g = spec.gives[n];
      if (!g) continue;
      const v = Math.round(u[n] * g * 40);
      if (!best || Math.abs(v) > Math.abs(best[1])) best = [n, v];
    }
    if (best && best[1]) reasons.push({ label: best[1] > 0 ? `He needs ${NEED_LABEL[best[0]].toLowerCase()}` : `Costs him ${NEED_LABEL[best[0]].toLowerCase()} he can't spare`, value: best[1] });
  }
  // His mind: grudges and debts, what he believes about the actor, his mood.
  const m = mindOf(s, t.id);
  if (m) {
    const g = grudge(m, a.id);
    const gr = gratitude(m, a.id);
    if (spec.friendly && g >= 5) reasons.push({ label: you(s, a, 'Holds a grudge against you', 'Holds a grudge against {a}'), value: -Math.min(30, Math.round(g)) });
    if (spec.friendly && gr >= 5) reasons.push({ label: you(s, a, 'Owes you a debt of gratitude', 'Owes {a} a debt of gratitude'), value: Math.min(25, Math.round(gr)) });
    const b = m.bel[a.id];
    if (spec.friendly && b?.t !== undefined && (b.tc ?? 0) >= 0.3) {
      const v = Math.round((b.t / 5) * (b.tc ?? 0));
      if (Math.abs(v) >= 2) reasons.push({ label: v > 0 ? you(s, a, 'Believes you have his back', 'Believes {a} has his back') : you(s, a, 'Believes you are against him', 'Believes {a} is against him'), value: v });
    }
    if (m.mood === 'angry' && spec.friendly) reasons.push({ label: 'He is angry these days', value: -10 });
    if (m.mood === 'afraid' && spec.mode === 'consent' && !spec.friendly) reasons.push({ label: 'He is scared these days', value: 10 });
    if (m.mood === 'greedy' && spec.gives?.money) reasons.push({ label: 'He is hungry for money', value: 10 });
    if (m.mood === 'loyal' && spec.friendly && a.id === s.playerId) reasons.push({ label: 'He is devoted to you', value: 10 });
  }
  // Standing ties between them (clash.ts).
  const tie = tieOf(s, a.id, t.id);
  if (tie) {
    const v = tie.k === 'friend' ? 20 : tie.k === 'ally' ? 15 : tie.k === 'lovers' ? 20 : tie.k === 'rival' ? -20 : -40;
    reasons.push({ label: `${TIE_LABEL[tie.k]}${tie.y ? ` (${tie.y.toLowerCase()})` : ''}`, value: spec.friendly ? v : spec.mode === 'odds' ? 0 : Math.round(v / 2) });
  }
  if (spec.friendly) {
    const h = hatedAssociate(s, a, t);
    if (h) reasons.push(h);
  }
  // Reputation: the boss's name opens doors (or closes them).
  if (a.id === s.playerId && spec.mode === 'consent') {
    const v = Math.round((s.respect - 40) / 3);
    if (v) reasons.push({ label: 'Your reputation', value: v });
  }
  // Leverage: favors he owes, hooks held.
  const owes = owedBy(s, t.id, a.id);
  if (owes && spec.mode === 'consent') reasons.push({ label: `He owes ${a.id === s.playerId ? 'you' : a.firstName} ${owes === 1 ? 'a favor' : `${owes} favors`}`, value: Math.min(30, 12 * owes) });
  const nh = a.id !== s.playerId ? npcHookOn(s, a.id, t.id) : undefined;
  if (nh && spec.mode === 'consent') reasons.push({ label: `${a.firstName} has something on him`, value: nh.s ? 40 : 20 });
  // Children and the old.
  const age = ageOn(t.birth, s.date);
  if (age >= 70 && spec.mode === 'consent' && !spec.friendly) reasons.push({ label: 'Too old to be pushed around', value: -10 });
  if (hasTrait(a, 'Charming') && spec.friendly && a.id !== t.id) reasons.push({ label: you(s, a, 'You are Charming', '{a} is Charming'), value: 8 });
  reasons.push(...extra);
  const kept = reasons.filter((r) => r.value !== 0);
  const sum = kept.reduce((acc, r) => acc + r.value, spec.base);
  return { chance: clampP(sum) / 100, reasons: [{ label: spec.mode === 'odds' ? 'The odds' : 'Base', value: spec.base }, ...kept] };
}

/** The raw sum of an acceptance's reasons (before the 5-95% clamp): what the breakdown adds up to. */
export function rawSum(a: Acceptance): number {
  return a.reasons.reduce((acc, r) => acc + r.value, 0);
}
