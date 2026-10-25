import { hashSeed } from './rng';
import type { GameState } from './types';

/**
 * Travel, trips and flight: the state.
 *
 * Lives on `GameState.travel` (optional, so older saves load) and rolls on
 * its own seeded stream (`travel.rng`), so trips do not reshuffle the rest
 * of the simulation's dice. Time on the road is counted in DAYS (absolute
 * day = week * 7 + offset), so a plane to Miami and a convoy to Acapulco
 * really take different amounts of the week.
 *
 * This file holds only types and cheap queries, so shared modules (the
 * Long Game, the capo AI, orders) can ask "is the boss away?" without
 * importing the whole travel engine.
 */

export type TravelMode = 'plane' | 'train' | 'bus' | 'cars' | 'ship';
export type BudgetTier = 'modest' | 'first' | 'lavish';
export type TripPurpose = 'vacation' | 'business' | 'lam';
export type Entertainer = 'crooner' | 'comic' | 'bandleader';

/** What the player asks for in the trip planner. */
export interface TripPlan {
  purpose: 'vacation' | 'business';
  /** Who leads the trip (the boss, or anyone of yours you send). */
  leaderId: string;
  destId: string;
  mode: TravelMode;
  tier: BudgetTier;
  /** Invited people (family, crew, rivals, officials, other houses). */
  guests: string[];
  /** The companion slot: a lover (the romance system fills it) or a new lady/gentleman friend. */
  companionId?: string;
  /** Invite a new friend from the 500 Club for the companion slot (created if she/he says yes). */
  newCompanion?: boolean;
  /** The companion stays at another hotel (halves the discovery risk). */
  discreet?: boolean;
  /** Cars in the convoy (1-4) and the crew who drive them. */
  cars?: number;
  driverIds?: string[];
  /** Hire an act for the party. */
  entertainer?: Entertainer;
  /** The itinerary: one activity id per day at the destination (3-5 for a vacation). */
  days: string[];
  /** Leave this many weeks from now (0 = this week). Season matters. */
  departIn?: number;
}

export interface JournalLine {
  day: number;
  text: string;
  tone?: 'good' | 'bad' | 'neutral';
}

export interface Trip {
  id: string;
  purpose: TripPurpose;
  leaderId: string;
  /** Everyone travelling except the leader (guests, companion, drivers). */
  party: string[];
  guests: string[];
  companionId?: string;
  driverIds: string[];
  destId: string;
  mode: TravelMode;
  tier: BudgetTier;
  cars: number;
  discreet?: boolean;
  entertainer?: Entertainer;
  days: string[];
  /** Absolute days. */
  departDay: number;
  arriveDay: number;
  leaveDay: number;
  homeDay: number;
  cost: number;
  journal: JournalLine[];
  /** Day indexes of the itinerary already resolved. */
  done: number;
  /** Leg rolls already made ('out' / 'back'). */
  legs: string[];
  /** A trip event was queued this week (one popup per trip per week). */
  askedWeek?: number;
  tailed?: boolean;
  discovered?: boolean;
  /** The trip is over (kept a little while for the record). */
  over?: boolean;
  /** Who refused the invitation. */
  declined?: string[];
}

export interface TripRecord {
  week: number;
  destId: string;
  mode: TravelMode;
  purpose: TripPurpose;
  leaderId: string;
  party: string[];
  cost: number;
  highlights: string[];
}

export type FugitiveDest = 'vineland' | 'florida' | 'montreal' | 'mexico' | 'oldcountry';
export type FugitiveEnd = 'surrendered' | 'caught' | 'exiled' | 'returned';

/** What the player asks for when a man goes on the lam. */
export interface FleePlan {
  personId: string;
  dest: FugitiveDest;
  mode: TravelMode;
  /** Who owns the safehouse (a relative, a capo, a friend). */
  safehouseId?: string;
  /** New papers: a forger of yours, or bought. */
  papers?: boolean;
  /** A driver from the crew (car escapes). */
  driverId?: string;
}

export interface Fugitive {
  personId: string;
  dest: FugitiveDest;
  mode: TravelMode;
  tripId: string;
  since: number;
  /** The federal manhunt, 0-100. */
  manhunt: number;
  /** How well hidden (0-0.9). */
  cover: number;
  safehouseId?: string;
  papers?: boolean;
  driverId?: string;
  sightings: number;
  /** Bail he jumped (forfeited). */
  bailForfeited?: number;
  /** Legal stage when he ran (for the boss). */
  stageWhenFled?: string;
  /** The case fell apart while he was gone: he can come home quietly. */
  collapsed?: boolean;
  /** Week the last fugitive popup was raised. */
  askedWeek?: number;
  end?: FugitiveEnd;
  endWeek?: number;
}

/** The man running things while the boss is away. */
export interface ActingBoss {
  id: string;
  since: number;
  weeks: number;
  deeds: string[];
}

export interface TravelStats {
  trips: number;
  vacations: number;
  business: number;
  flights: number;
  captures: number;
  surrenders: number;
  exiles: number;
  returns: number;
  discoveries: number;
  tails: number;
  accidents: number;
  meetings: number;
  sightings: number;
}

export interface TravelState {
  rng: number;
  trips: Trip[];
  history: TripRecord[];
  fugitives: Fugitive[];
  acting?: ActingBoss;
  /** Lovers met through the trip planner (person id -> their friends). */
  friends: Record<string, string[]>;
  /** Discovered affairs waiting for the reckoning at home (spouse id -> week due). */
  aftermath: { spouseId: string; loverId: string; due: number; leaderId: string }[];
  stats: TravelStats;
}

/* ---------------------------------------------------------------- */
/* Actions (orders) and effect ops (event choices)                   */
/* ---------------------------------------------------------------- */

export type TravelAction =
  | { type: 'trip'; plan: TripPlan }
  | { type: 'cancel'; tripId: string }
  | { type: 'recall'; tripId: string }
  | { type: 'flee'; plan: FleePlan }
  | { type: 'surrender'; personId: string }
  | { type: 'comeHome'; personId: string }
  | { type: 'exile'; personId: string }
  | { type: 'hide'; personId: string };

export type TravelOp =
  | { op: 'flee'; plan: FleePlan }
  | { op: 'manhunt'; personId: string; amount: number }
  | { op: 'cover'; personId: string; amount: number }
  | { op: 'cutShort'; tripId: string }
  | { op: 'sendHome'; tripId: string; charId: string }
  | { op: 'coverStory'; tripId: string }
  | { op: 'confess'; tripId: string }
  | { op: 'tail'; tripId: string; outcome: 'lose' | 'wave' | 'confront' }
  | { op: 'endAffair'; leaderId: string; loverId: string }
  | { op: 'comeHome'; personId: string }
  | { op: 'surrender'; personId: string }
  | { op: 'exile'; personId: string }
  | { op: 'actingReward'; charId: string; amount: number };

/* ---------------------------------------------------------------- */
/* Access                                                            */
/* ---------------------------------------------------------------- */

export function blankTravel(s: GameState): TravelState {
  return {
    rng: hashSeed(`${s.seed}:travel`),
    trips: [],
    history: [],
    fugitives: [],
    friends: {},
    aftermath: [],
    stats: { trips: 0, vacations: 0, business: 0, flights: 0, captures: 0, surrenders: 0, exiles: 0, returns: 0, discoveries: 0, tails: 0, accidents: 0, meetings: 0, sightings: 0 },
  };
}

/** Engine-side: the travel state, created if missing (old saves). */
export function ensureTravel(s: GameState): TravelState {
  if (!s.travel) s.travel = blankTravel(s);
  return s.travel;
}

export const today = (s: GameState): number => s.week * 7;

/** Trips under way or booked (not finished). */
export function liveTrips(s: GameState): Trip[] {
  return s.travel ? s.travel.trips.filter((t) => !t.over) : [];
}

/** The trip a character is on (booked or travelling), if any. */
export function tripOf(s: GameState, charId: string): Trip | undefined {
  if (!s.travel) return undefined;
  for (const t of s.travel.trips) if (!t.over && (t.leaderId === charId || t.party.includes(charId))) return t;
  return undefined;
}

/** Is this character physically away from Wildwood during the current week? */
export function isAway(s: GameState, charId: string): boolean {
  if (!s.travel) return false;
  const mid = today(s) + 3;
  for (const t of s.travel.trips) {
    if (t.over || (t.leaderId !== charId && !t.party.includes(charId))) continue;
    if (t.departDay <= mid && mid < t.homeDay) return true;
  }
  return fugitiveOf(s, charId) !== undefined;
}

/** Is the boss himself away (on a trip or on the lam)? */
export function bossAway(s: GameState): boolean {
  return isAway(s, s.playerId);
}

export function fugitiveOf(s: GameState, charId: string): Fugitive | undefined {
  return s.travel?.fugitives.find((f) => f.personId === charId && !f.end);
}

export function bossFugitive(s: GameState): Fugitive | undefined {
  return fugitiveOf(s, s.playerId);
}

/** The Long Game is on hold while the man it is about is on the lam. */
export function legalPaused(s: GameState, personId: string): boolean {
  return fugitiveOf(s, personId) !== undefined;
}

/**
 * Lovers. The romance system (another branch) registers a source here; until
 * then the only lovers are friends met through the trip planner.
 */
export const LOVER_SOURCES: ((s: GameState, charId: string) => string[])[] = [];
export function registerLoverSource(fn: (s: GameState, charId: string) => string[]): void {
  if (!LOVER_SOURCES.includes(fn)) LOVER_SOURCES.push(fn);
}

export function loversOf(s: GameState, charId: string): string[] {
  const out = new Set<string>(s.travel?.friends[charId] ?? []);
  for (const src of LOVER_SOURCES) for (const id of src(s, charId)) out.add(id);
  return [...out].filter((id) => s.characters[id]?.alive && id !== s.characters[charId]?.spouseId);
}

export function isLover(s: GameState, charId: string, otherId: string): boolean {
  return loversOf(s, charId).includes(otherId);
}

/** Extra weeks a delegated order takes (messengers to a fugitive boss). */
export function messengerDelay(s: GameState): number {
  const f = s.travel ? bossFugitive(s) : undefined;
  if (!f) return 0;
  return { vineland: 0, florida: 1, montreal: 1, mexico: 2, oldcountry: 2 }[f.dest] ?? 1;
}

/** Orders garble on the way from a hideout (obey odds penalty). */
export function messengerPenalty(s: GameState): number {
  return s.travel && bossFugitive(s) ? 0.15 : 0;
}
