import type { GameState } from './types';
import { ensureAction } from './actionState';
import { stationOf } from './rankView';
import { crew } from './characters';
import type { Station } from './powerState';

/**
 * THE STREET HEATS UP (escalation): the longer he lasts and the higher he climbs, the harder the
 * island pushes. One number, 0 … 1, read by the systems that roll action (threats.ts aggression,
 * rivals.ts strikes and pushes, the rivals' leaning on a man in the ranks; the police stay on the heat alone), plus a dry-spell breaker: when nothing has
 * landed on him for too long, somebody who hates him makes a move.
 *
 * Inputs only (no state of its own beyond `action.lastHard`): the years played, his station, the
 * weeks since something last hit him.
 */

/** Years on the island before the time part tops out (≈ 0.45 by the third year). */
const PER_YEAR = 0.16;
const TIME_MAX = 0.5;
/** Each rung up the ladder draws more fire. */
const RANK: Partial<Record<Station, number>> = { associate: 0, soldier: 0.05, capo: 0.12, underboss: 0.18, boss: 0.22, independent: 0.15, exile: 0.1 };
/** How much of the years' build a man feels at each rung (a soldier is nobody's main target yet). */
const TIME_SHARE: Partial<Record<Station, number>> = { associate: 0.5, soldier: 0.5, capo: 0.75, underboss: 0.9, boss: 1, independent: 0.8, exile: 0.7 };
/** The crew size at which the build is felt in full, and the least share a tiny crew feels. */
const SIZE_FULL = 18;
const SIZE_FLOOR = 0.6;
/** A quiet stretch builds its own pressure: from this many weeks on, up to DRY_MAX more. */
const DRY_FROM = 4;
const DRY_MAX = 0.3;
/** The longest he goes without anything landing on him, early and late (the breaker's threshold). */
export const DRY_LIMIT_EARLY = 7;
export const DRY_LIMIT_LATE = 4;

/** When something last hit him (a threat landed, a raid, a strike). */
export function lastHard(s: GameState): number {
  return s.action?.lastHard ?? s.week;
}

/** Something landed on him this week: the quiet is over. */
export function noteHard(s: GameState): void {
  ensureAction(s).lastHard = s.week;
}

/** Weeks since anything last landed on him. */
export function quietWeeks(s: GameState): number {
  return Math.max(0, s.week - lastHard(s));
}

export interface EscalationView {
  level: number;
  parts: { label: string; value: number }[];
}

/** How hot the street runs for him this week (0 … 1), with the reasons. */
export function escalationView(s: GameState): EscalationView {
  const parts: { label: string; value: number }[] = [];
  const years = Math.max(0, s.week - 8) / 52;
  const time = Math.min(TIME_MAX, years * PER_YEAR) * (TIME_SHARE[stationOf(s)] ?? 1);
  if (time > 0.005) parts.push({ label: `Year ${Math.floor(s.week / 52) + 1}: the island knows your name`, value: time });
  const rank = RANK[stationOf(s)] ?? 0.1;
  if (rank > 0) parts.push({ label: 'Higher up, a bigger target', value: rank });
  // A small outfit is not worth the island's attention yet: the build scales with the size of his crew.
  const size = Math.max(SIZE_FLOOR, Math.min(1, crew(s).length / SIZE_FULL));
  if (size < 1) for (const p of parts) p.value *= size;
  if (size < 0.95) parts.push({ label: 'A small outfit: not worth a war yet', value: 0 });
  const dry = Math.min(DRY_MAX, Math.max(0, (quietWeeks(s) - DRY_FROM) / 10));
  if (dry > 0) parts.push({ label: 'Too quiet: somebody is getting ideas', value: dry });
  const level = Math.max(0, Math.min(1, parts.reduce((a, p) => a + p.value, 0)));
  return { level, parts };
}

export function escalation(s: GameState): number {
  return escalationView(s).level;
}

/** The ceiling on a rival's weekly chance to plan a move on him (0.4 when calm, up to 0.6). */
export function aggressionCap(s: GameState): number {
  return 0.4 + 0.2 * escalation(s);
}

/** A rival's weekly chance is lifted by this much. */
export function aggressionLift(s: GameState): number {
  return 1 + 0.5 * escalation(s);
}

/** The share of rivals who bother with a man in the ranks at all (0.25 when calm, up to 0.6). */
export function ranksLeanOdds(s: GameState): number {
  return 0.25 + 0.35 * escalation(s);
}

/** Weeks of quiet before somebody is sure to move (shorter as the street heats up). */
export function dryLimit(s: GameState): number {
  const e = escalation(s);
  return Math.round(DRY_LIMIT_EARLY - (DRY_LIMIT_EARLY - DRY_LIMIT_LATE) * Math.min(1, e / 0.7));
}

/** Has it been quiet so long that somebody must move this week? */
export function tooQuiet(s: GameState): boolean {
  return quietWeeks(s) >= dryLimit(s);
}
