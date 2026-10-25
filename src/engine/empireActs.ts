import { hashSeed, rand } from './rng';
import { seasonCurve, actTier } from './empireOps';
import type { EmpireState, Venue } from './empireState';
import { inflation } from './property';
import type { GameState } from './types';
import { ENTERTAINMENT, type WorldPerson } from '../worldpack';

/**
 * HOOK for the act-booking phase: the club's booking manager books a weekly
 * headliner from the world pack's entertainers. His skill sets the tier of
 * act he can land (local band → headliner); the act's fame is its draw; the
 * fee, plus his 10% cut, is the club's entertainment line. A later phase
 * builds the full booking calendar, the acts' demands and meeting the stars;
 * this keeps the post, the act record and the numbers.
 */

export const ACT_TIER_FAME = [25, 45, 70, 101];
export const BOOKER_CUT = 0.1;

export function actFee(p: WorldPerson, s: GameState): number {
  const fame = p.showbiz?.fame ?? 20;
  return Math.round((p.showbiz?.weekFee ?? Math.round((150 + fame * fame * 0.4) / 50) * 50) * inflation(s));
}

/** Who the booking manager could land this month, within his reach and the budget. */
export function bookableActs(s: GameState, e: EmpireState, v: Venue, budget: number): WorldPerson[] {
  const cap = ACT_TIER_FAME[actTier(e, v)];
  return ENTERTAINMENT.filter((p) => p.showbiz && !p.deathYear && p.birthYear <= s.date.y - 18 && (p.showbiz.fame ?? 0) < cap && actFee(p, s) <= budget * 1.25)
    .sort((a, b) => (b.showbiz!.fame - a.showbiz!.fame) || a.id.localeCompare(b.id));
}

/** The month's booking (deterministic for the club and the month). */
export function bookAct(s: GameState, e: EmpireState, v: Venue): void {
  const base = v.policy.entertainment ?? 0;
  if (!base) { v.policy.act = undefined; return; }
  const budget = base * (0.35 + 0.65 * seasonCurve(s.date));
  const list = bookableActs(s, e, v, budget).slice(0, 6);
  if (!list.length) { v.policy.act = { name: 'The house band', fee: Math.round(budget * 0.6), draw: 0.1 }; return; }
  const h = { rng: hashSeed(`${v.id}:${s.date.y}-${s.date.m}`) };
  const p = list[Math.floor(rand(h) * list.length)];
  const fee = actFee(p, s);
  v.policy.act = { worldId: p.id, name: p.nickname && p.showbiz?.act ? p.showbiz.act : `${p.name.first} ${p.name.last}${p.showbiz?.act ? ` & ${p.showbiz.act}` : ''}`, fee: Math.round(fee * (1 + BOOKER_CUT)), draw: (p.showbiz?.fame ?? 20) / 100 };
}
