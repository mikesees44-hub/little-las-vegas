import type { GameState } from './types';

/**
 * THE WEEK, LIVED DAY BY DAY (DAILY_LOGIC_AND_ACTION): the small state the daily layer keeps
 * between days and weeks. The week turn still decides the week; these are the counters the action
 * systems need (raid cooldowns, the weeks under water, Philadelphia's summons, the set-pieces).
 *
 * Optional: made by the first week turn that needs it (or by upgradeSave for a save that has threats).
 */
export interface ActionState {
  v: 1;
  /** Places raided or set up: business id -> the week it happened (no new raid there for RAID_COOLDOWN weeks). */
  raided: Record<string, number>;
  /** Weeks in a row the Family's money has been under water (the bail-out: daily.ts). */
  under: number;
  /** The week of the last bail-out offer. */
  bail?: number;
  /** The week of the last Philadelphia summons. */
  summons?: number;
  /** The last week the boss showed strength (a strike beaten off, a war won): respect above 90 holds that week. */
  strength?: number;
  /** Set-pieces fired: key ("memorial:1961") -> week. */
  sp: Record<string, number>;
  /** EXTRA front pages already shown as a card (paper item ids). */
  extras: string[];
  stats: { strikes: number; raids: number; summons: number; bail: number; extras: number; setPieces: number };
  /** The day/hour scheduler's items (schedule.ts scheduleAt) and its id counter. */
  sched?: import('./schedule').ScheduledItem[];
  schedN?: number;
}

export function ensureAction(s: GameState): ActionState {
  if (!s.action) s.action = { v: 1, raided: {}, under: 0, sp: {}, extras: [], stats: { strikes: 0, raids: 0, summons: 0, bail: 0, extras: 0, setPieces: 0 } };
  const A = s.action;
  A.raided ??= {};
  A.under ??= 0;
  A.sp ??= {};
  A.extras ??= [];
  A.stats ??= { strikes: 0, raids: 0, summons: 0, bail: 0, extras: 0, setPieces: 0 };
  return A;
}

/** No new raid or set-up on the same place for this many weeks (DAILY_LOGIC B3). */
export const RAID_COOLDOWN = 6;

/** Was this place raided (or set up) too recently to be hit again? */
export function raidedLately(s: GameState, bizId: string | undefined): boolean {
  if (!bizId) return false;
  const w = s.action?.raided[bizId];
  return w !== undefined && s.week - w < RAID_COOLDOWN;
}

export function noteRaided(s: GameState, bizId: string | undefined): void {
  if (!bizId) return;
  const A = ensureAction(s);
  A.raided[bizId] = s.week;
  A.stats.raids++;
  for (const [k, w] of Object.entries(A.raided)) if (s.week - w > RAID_COOLDOWN * 2) delete A.raided[k];
}
