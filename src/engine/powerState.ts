import { hashSeed } from './rng';
import type { FactionId, GameState, RivalId, StoryEntry } from './types';
import type { Reason } from './interactions';

/**
 * POWER, SUCCESSION & AMBITION: the state of the power pillar.
 *
 * It lives on `GameState.power` (optional, so older saves load) and rolls on
 * its own seeded stream (`power.rng`), so the pillar does not reshuffle the
 * main simulation's dice. Expanded attributes live on the characters
 * themselves (`Character.attrs`, `Character.success`).
 */

/* ---------------- Expanded attributes ---------------- */

export type AttrKey =
  // Intelligence
  | 'intelligence' | 'knowledge' | 'memory' | 'strategy' | 'judgment' | 'learning'
  // Social
  | 'charisma' | 'interpersonal' | 'persuasion' | 'empathy' | 'humor' | 'negotiation' | 'manipulation'
  // Criminal
  | 'streetSmarts' | 'stealth' | 'discretion' | 'experience' | 'awareness' | 'survival'
  // Leadership
  | 'command' | 'organization' | 'delegation' | 'decisiveness' | 'conflict'
  // Business
  | 'finance' | 'entrepreneurship' | 'management' | 'earning' | 'investment'
  // Personality
  | 'ambition' | 'greed' | 'pride' | 'loyalty' | 'patience' | 'courage' | 'jealousy' | 'impulsiveness' | 'conscience';

export type AttrGroup = 'intelligence' | 'social' | 'criminal' | 'leadership' | 'business' | 'personality';

export interface ExtAttrs {
  v: Record<AttrKey, number>;
  /** Offset of each base skill from its group's mean at generation (keeps the 6 skills in sync without drift). */
  off: Record<string, number>;
  /** Upbringing already folded in (education kind). */
  up?: string;
  /** Men who would follow him (protégés, charismatic capos): feeds challenge pressure. */
  followers?: number;
}

/* ---------------- Hidden ambitions ---------------- */

export type AmbitionWant = 'chair' | 'underboss' | 'capo' | 'respect' | 'money' | 'out';
export interface HiddenAmbition {
  want: AmbitionWant;
  /** 0-100: how hard it pushes him. */
  intensity: number;
  /** A promise the boss made him (retire and hand over by week N). */
  promise?: { by: number; made: number; text: string };
  /** Promises broken so far. */
  broken: number;
  /** Known to the boss (the consigliere or intrigue found out). */
  revealed: boolean;
  /** What changed it, most recent last (capped). */
  log: StoryEntry[];
}

/* ---------------- Heirs ---------------- */

export type DesignationMode = 'underboss' | 'named' | 'private' | 'unwritten' | 'multiple' | 'none' | 'committee';
export type GroomPath = 'restaurant' | 'lawschool' | 'college' | 'legit' | 'charity' | 'properties' | 'consigliere' | 'political';
export interface Designation {
  mode: DesignationMode;
  /** The heir the crew sees (named / underboss). */
  publicId?: string;
  /** The heir the boss is really grooming (private / unwritten). */
  secretId?: string;
  heirs?: string[];
  grooming?: { charId: string; path: GroomPath; since: number };
  /** 0-100: how close the secret is to coming out. */
  exposure: number;
  exposed?: number;
}

/* ---------------- Passed over ---------------- */

export type GrievanceStatus = 'open' | 'resolved' | 'faded' | 'exploded';
export interface Grievance {
  id: string;
  charId: string;
  /** Post key ('capo', 'underboss', 'seat:bagman', 'heir', 'property', 'manager:b12', 'chair', 'justice'). */
  post: string;
  postLabel: string;
  winnerId?: string;
  /** Who he blames. */
  byId: string;
  severity: number;
  /** People who saw it happen. */
  witnesses: number;
  week: number;
  /** 0 disappointed · 1 private resentment · 2 faction building · 3 open disagreement · 4 breakdown · 5 crisis */
  stage: number;
  status: GrievanceStatus;
  reasons: Reason[];
  public: boolean;
  /** Week of the next escalation check. */
  next: number;
  resolution?: string;
}

/* ---------------- Crisis ---------------- */

export type CrisisCause = 'killed' | 'jailed' | 'incapacitated' | 'disappeared' | 'flipped' | 'removed' | 'blitz';
export type CrisisMove = 'stabilize' | 'ceasefire' | 'disengage' | 'escalate' | 'table' | 'secure' | 'hunt';
export interface CrisisMeters {
  cohesion: number;
  survival: number;
  escalation: number;
  loyalty: number;
}
export interface Crisis {
  id: string;
  cause: CrisisCause;
  fallenId: string;
  heirId: string;
  since: number;
  beat: number;
  beats: number;
  wave: number;
  meters: CrisisMeters;
  /** Treasury when the crisis began (the treasury track). */
  money0: number;
  /** What the heir knows (fog of war). */
  known: { killer?: FactionId | 'unknown'; nextHit?: boolean; leakId?: string; loyalty: Record<string, 'loyal' | 'wavering' | '?'> };
  /** What is true. */
  truth: { killer: FactionId; nextHit: boolean; leakId?: string };
  log: StoryEntry[];
  /** The move chosen at each beat. */
  moves: CrisisMove[];
}

/* ---------------- Blitz ---------------- */

export interface Blitz {
  id: string;
  attacker: FactionId;
  defender: FactionId;
  /** Targets in order (capos, consigliere, underboss, the boss, the heir). */
  targets: string[];
  idx: number;
  momentum: number;
  surprise: boolean;
  start: number;
  kills: string[];
  misses: string[];
  /** Why it stopped (undefined while running). */
  stopped?: string;
  /** For the player's own blitz: the odds shown when it was launched. */
  odds?: number;
  /** Hits this week were stopped by a good move. */
  shield?: number;
}

export interface BlitzPrep {
  intel: number;
  crews: number;
  safehouses: number;
}

/* ---------------- The front boss ---------------- */

export type FrontType = 'unaware' | 'willing' | 'prison' | 'elder' | 'rebellious';
export interface FrontBoss {
  figureheadId: string;
  type: FrontType;
  since: number;
  /** Official authority the figurehead holds (0-100). */
  authority: number;
  /** Real influence the shadow Don keeps (0-100). */
  influence: number;
  /** How close the figurehead is to seeing he is a puppet (0-100). */
  suspicion: number;
  /** How far the law and the rivals see through it (0-100). */
  seenByLaw: number;
  seenByRivals: number;
  discovered?: number;
  /** His reaction once he knows. */
  reaction?: 'accept' | 'demand' | 'retire' | 'rally';
}

/* ---------------- Audience chamber ---------------- */

export type PetitionKind = 'dispute' | 'kickup' | 'passedover' | 'inheritance' | 'debt' | 'sitdown' | 'claim';
export interface PetitionRec {
  id: string;
  kind: PetitionKind;
  petitionerId: string;
  againstId?: string;
  claim: string;
  /** Hidden: is he telling the truth? */
  truthful: boolean;
  week: number;
  status: 'open' | 'ruled' | 'investigating' | 'caught' | 'confirmed' | 'unclear';
  ruling?: string;
  rival?: RivalId;
}

/* ---------------- Fall & rise ---------------- */

export type Station = 'boss' | 'underboss' | 'capo' | 'soldier' | 'associate' | 'exile' | 'independent';

export interface PowerStats {
  blitzes: number;
  blitzesOnYou: number;
  crises: number;
  falls: number;
  comebacks: number;
  petitions: number;
  liarsCaught: number;
  grievances: number;
  fronts: number;
  discoveries: number;
  brokenPromises: number;
  promotions: number;
}

export interface PowerState {
  rng: number;
  ambitions: Record<string, HiddenAmbition>;
  /** Protégés placed in a post to learn (charId -> post). */
  placements: Record<string, { post: string; since: number; mentorId?: string }>;
  designation: Designation;
  grievances: Grievance[];
  /** Who held each post last week (vacancy detection). */
  posts: Record<string, string>;
  /** How vacancies are announced. */
  announce: 'public' | 'private';
  lastBossId?: string;
  lastMonth?: string;
  bossJailed?: boolean;
  crisis?: Crisis;
  /** Finished crises (summaries). */
  crises: StoryEntry[];
  blitzes: Blitz[];
  prep: BlitzPrep;
  mattresses?: number;
  bodyguards?: number;
  /** A rival may legitimately come for you until this week (you killed a made man without the Table). */
  legit: Partial<Record<RivalId, number>>;
  /** Rivals warned you of (an informant's tip): their surprise is gone. */
  warned: Partial<Record<FactionId, number>>;
  front?: FrontBoss;
  /** Prison: the acting boss while the boss is inside (two centers of power). */
  acting?: { id: string; since: number; authority: number };
  petitions: PetitionRec[];
  station: Station;
  /** The man above you (when you are not the boss). */
  overId?: string;
  fallenWeek?: number;
  /** Fell from the chair at least once (a return to it is a comeback). */
  fell?: boolean;
  /** The men who went with the usurper (they come back if you retake the chair). */
  followerIds?: string[];
  /** Week you last asked to move up. */
  climbWeek?: number;
  /** The family above a low start (valente.ts): the Don, his officers and capos, your standing, quota and sponsors. */
  above?: import('./valente').AboveFamily;
  stats: PowerStats;
}

export function blankStats(): PowerStats {
  return { blitzes: 0, blitzesOnYou: 0, crises: 0, falls: 0, comebacks: 0, petitions: 0, liarsCaught: 0, grievances: 0, fronts: 0, discoveries: 0, brokenPromises: 0, promotions: 0 };
}

export function newPowerState(s: GameState): PowerState {
  return {
    rng: hashSeed(`${s.seed}:power`),
    ambitions: {},
    placements: {},
    designation: { mode: s.successionLaw === 'underboss' ? 'underboss' : s.successionLaw === 'capos_elect' ? 'committee' : s.designatedHeirId ? 'named' : 'none', publicId: s.designatedHeirId, exposure: 0 },
    grievances: [],
    posts: {},
    announce: 'public',
    lastBossId: s.playerId,
    crises: [],
    blitzes: [],
    prep: { intel: 0, crews: 0, safehouses: 0 },
    legit: {},
    warned: {},
    petitions: [],
    station: 'boss',
    stats: blankStats(),
  };
}

/** The power state (created on first use; old saves get one lazily). */
export function pw(s: GameState): PowerState {
  if (!s.power) s.power = newPowerState(s);
  return s.power;
}

/** Read-only view for the UI that never mutates (returns a fresh blank state when absent). */
export function pwView(s: GameState): PowerState {
  return s.power ?? newPowerState(s);
}

/** Deterministic hash noise in [-1, 1] for (seed, id, key): attrs never touch any RNG stream. */
export function hashNoise(seed: string, id: string, key: string): number {
  const h = hashSeed(`${seed}|${id}|${key}`);
  // Sum of two uniforms → a soft bell in [-1, 1].
  const a = (h & 0xffff) / 0xffff;
  const b = (h >>> 16) / 0xffff;
  return a + b - 1;
}

/* ---------------- Ops (effects) and actions (orders) ---------------- */

/** State changes the power pillar's choices make (shown as named chips). */
export type PowerOp =
  | { op: 'crisis'; move: CrisisMove }
  | { op: 'blitzMove'; blitzId: string; move: 'mattresses' | 'hitback' | 'table' | 'hide' | 'payoff' | 'stand' }
  | { op: 'grievance'; id: string; resolve: 'amends' | 'post' | 'rebuke' | 'exile' | 'explain' | 'share' }
  | { op: 'promise'; charId: string; years: number }
  | { op: 'brokenPromise'; reply: 'truth' | 'official' | 'buy' | 'retire' | 'remove'; ubId: string; heirId: string }
  | { op: 'frontReply'; reply: 'authority' | 'pay' | 'retire' | 'end' | 'remove' | 'ignore' }
  | { op: 'prisonOrder'; reply: 'insist' | 'letrun' | 'replace' }
  | { op: 'handBack'; reply: 'thank' | 'force' | 'share' }
  | { op: 'petition'; id: string; ruling: 'for' | 'against' | 'investigate' | 'dismiss' | 'punish' | 'forgive' }
  | { op: 'station'; station: Station }
  | { op: 'heirMove'; charId: string; reply: 'stepaside' | 'promise' | 'refuse' | 'exile' }
  | { op: 'coerced'; charId: string; rival: RivalId; reply: 'reward' | 'trap' | 'ignore' }
  | { op: 'meter'; meter: keyof CrisisMeters; amount: number }
  /** A chip that names what an order's commit step does. */
  | { op: 'note'; text: string }
  | { op: 'climbAsked' }
  /** The climb from below (valente.ts): standing, rolls, sponsors, promotions. */
  | { op: 'low'; o: import('./valente').LowOp }
  /** The shadow court and the succession war (shadow.ts). */
  | { op: 'shadow'; o: import('./shadowState').ShadowOp };

/** Orders the player can give from the Power screens. */
export type PowerAction =
  | { op: 'designate'; mode: DesignationMode; charId?: string }
  | { op: 'groom'; charId: string; path: GroomPath }
  | { op: 'stopGrooming' }
  | { op: 'place'; charId: string; post: string }
  | { op: 'unplace'; charId: string }
  | { op: 'read'; charId: string }
  | { op: 'promise'; charId: string; years: number }
  | { op: 'amends'; grievanceId: string; kind: 'money' | 'apology' | 'share' }
  | { op: 'announce'; mode: 'public' | 'private' }
  | { op: 'prep'; kind: keyof BlitzPrep }
  | { op: 'blitz'; rival: RivalId }
  | { op: 'mattresses'; on: boolean }
  | { op: 'bodyguards'; on: boolean }
  | { op: 'front'; charId: string; type: Exclude<FrontType, 'prison' | 'rebellious'> }
  | { op: 'endFront' }
  | { op: 'consult' }
  | { op: 'climb' }
  | { op: 'low'; a: import('./valente').LowAction }
  | { op: 'takeover' }
  | { op: 'audience' }
  /** The shadow court and the succession war (shadowOps.ts). */
  | { op: 'shadow'; a: import('./shadowState').ShadowAction };
