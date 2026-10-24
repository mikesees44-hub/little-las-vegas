import { makeCharacter, type MakeCharOpts } from './characters';
import { hashSeed } from './rng';
import type { Character, FactionId, GameState, Trait } from './types';

/**
 * The CK dynasty layer's state: houses you can marry into, alliances,
 * renown and legacies, per-person dynasty data (congenital traits,
 * education, life path, goal, stress), hosted activities and decisions.
 *
 * It lives on `GameState.dyn` (optional, so older saves load) and uses its
 * own seeded stream (`dyn.rng`), so adding the layer does not reshuffle the
 * rest of the simulation's dice.
 */

export type Congenital = 'Sharp' | 'Slow' | 'Strong' | 'Sickly' | 'Handsome' | 'Homely';
export type EducationKind = 'home' | 'priest' | 'capo' | 'penn' | 'military';
export type LifePath = 'life' | 'straight' | 'priest' | 'politics' | 'fronts' | 'adviser' | 'marry';
export type GoalId =
  | 'the_chair' | 'get_out' | 'make_bones' | 'marry_well' | 'college' | 'priesthood' | 'politics' | 'own_business'
  | 'protect_family' | 'revenge' | 'grow_up';
export type StressSource = 'irs' | 'paranoia' | 'honor' | 'domestic';
export type Coping = 'Drinker' | 'Gambler' | 'Temper' | 'Insomniac' | 'Devout';
export type LegacyTrack = 'blood' | 'name' | 'money' | 'church';
export type HouseKind = 'mob' | 'philly' | 'political' | 'legit';
export type ActivityKind = 'wedding' | 'christening' | 'funeral' | 'sunday' | 'clambake' | 'club500' | 'fishing';
export type DecisionId =
  | 'shore_boss' | 'city_hall' | 'bank' | 'florida' | 'legit' | 'festival' | 'monument' | 'break_philly' | 'casino';

export interface FamPerson {
  congenital: Congenital[];
  /** Set at coming of age. */
  education?: { kind: EducationKind; tier: number };
  /** Who is raising the child (chosen by the boss). */
  guardian?: { kind: EducationKind; guardianId?: string; since: number };
  path?: LifePath;
  goal?: GoalId;
  stress: number;
  stressSrc: Record<StressSource, number>;
  /** Breaking points already reached (0-3). */
  stressLevel: number;
  coping: Coping[];
  /** House the person was born into (non-player houses). */
  houseId?: string;
  bastardOf?: string;
  legitimized?: boolean;
  /** Presses (or could press) a claim on the chair. */
  claimant?: boolean;
  /** Childhood temperament events done. */
  childhood: number;
  /** Married into our house through a matrilineal match (children take our name). */
  matrilineal?: boolean;
  marriedWeek?: number;
  /** A wedding for this marriage has been held. */
  wed?: boolean;
  christened?: boolean;
  cameOfAge?: boolean;
  /** Week the man retired to Florida (abdicated). */
  retired?: number;
}

export interface House {
  id: string;
  name: string;
  kind: HouseKind;
  /** The rival faction this house leads or belongs to, if any. */
  faction?: FactionId;
  headId: string;
  blurb: string;
  /** Typical dowry this house pays or expects. */
  dowry: number;
  /** 0-100: how much a match with them is worth. */
  strength: number;
  /** The head is the leader of `faction` (so an alliance binds the whole crew). */
  leads?: boolean;
}

export interface Alliance {
  houseId: string;
  since: number;
  /** Married couple holding the alliance together (a pact sealed at an activity has none). */
  ourId?: string;
  theirId?: string;
  /** Pacts sealed with a handshake expire. */
  until?: number;
}

export interface ActiveActivity {
  id: string;
  kind: ActivityKind;
  hostId: string;
  guests: string[];
  honoreeId?: string;
  startWeek: number;
  endWeek: number;
  cost: number;
}

export interface ActivityRecord {
  week: number;
  kind: ActivityKind;
  guests: string[];
  outcomes: string[];
}

export interface DynStats {
  marriages: number;
  births: number;
  successions: number;
  legacies: number;
  activities: number;
  decisions: number;
  dramas: number;
  comingOfAge: number;
  breakingPoints: number;
  alliances: number;
}

export interface DynState {
  rng: number;
  renown: number;
  /** Renown earned over the whole dynasty (never spent). */
  renownTotal: number;
  renownLog: { week: number; amount: number; reason: string }[];
  legacy: Record<LegacyTrack, number>;
  houses: House[];
  alliances: Alliance[];
  people: Record<string, FamPerson>;
  activity?: ActiveActivity;
  activityLog: ActivityRecord[];
  /** Decision id -> week taken. */
  decisions: Partial<Record<DecisionId, number>>;
  titles: string[];
  cooldowns: Record<string, number>;
  lastHeadId: string;
  /** Made men last week (to notice new ones). */
  madeCount: number;
  stats: DynStats;
}

/* ---------------------------------------------------------------- */
/* Dynasty-layer actions (orders) and effect ops (event choices)     */
/* ---------------------------------------------------------------- */

export type DynAction =
  | { type: 'marry'; memberId: string; spouseId: string; matrilineal?: boolean }
  | { type: 'guardian'; childId: string; kind: EducationKind; guardianId?: string }
  | { type: 'host'; activity: ActivityKind; guests: string[]; honoreeId?: string }
  | { type: 'decision'; id: DecisionId; option?: string }
  | { type: 'legacy'; track: LegacyTrack };

export type DynOp =
  | { op: 'stress'; charId: string; amount: number; source: StressSource }
  | { op: 'renown'; amount: number; reason: string }
  | { op: 'trait'; charId: string; trait: Trait; remove?: boolean }
  | { op: 'coping'; charId: string; coping: Coping }
  | { op: 'path'; charId: string; path: LifePath }
  | { op: 'goal'; charId: string; goal: GoalId }
  | { op: 'marry'; memberId: string; spouseId: string; matrilineal?: boolean }
  | { op: 'alliance'; houseId: string; weeks: number }
  | { op: 'breakAlliance'; houseId: string }
  | { op: 'legitimize'; charId: string }
  | { op: 'claimant'; charId: string; on: boolean }
  | { op: 'abdicate' }
  | { op: 'decision'; id: DecisionId; option?: string }
  | { op: 'attr'; charId: string; attr: keyof Character['attributes']; amount: number }
  | { op: 'appoint'; charId: string }
  | { op: 'evidence'; charId: string; amount: number }
  | { op: 'away'; charId: string; weeks: number }
  | { op: 'comeOfAge'; charId: string; path: LifePath }
  | { op: 'secret'; charId: string; kind: 'affair' | 'bastard' };

/* ---------------------------------------------------------------- */
/* Access helpers                                                    */
/* ---------------------------------------------------------------- */

export const EMPTY_STRESS: Record<StressSource, number> = { irs: 0, paranoia: 0, honor: 0, domestic: 0 };

export function blankPerson(): FamPerson {
  return { congenital: [], stress: 0, stressSrc: { ...EMPTY_STRESS }, stressLevel: 0, coping: [], childhood: 0 };
}

function blankDyn(s: GameState): DynState {
  return {
    rng: hashSeed(`${s.seed}:dynasty`),
    renown: 0,
    renownTotal: 0,
    renownLog: [],
    legacy: { blood: 0, name: 0, money: 0, church: 0 },
    houses: [],
    alliances: [],
    people: {},
    activityLog: [],
    decisions: {},
    titles: [],
    cooldowns: {},
    lastHeadId: s.playerId,
    madeCount: 0,
    stats: { marriages: 0, births: 0, successions: 0, legacies: 0, activities: 0, decisions: 0, dramas: 0, comingOfAge: 0, breakingPoints: 0, alliances: 0 },
  };
}

/** Engine-side: the dynasty state, created if missing (old saves). */
export function ensureDynState(s: GameState): DynState {
  if (!s.dyn) s.dyn = blankDyn(s);
  return s.dyn;
}

const READONLY_BLANK = blankPerson();

/** Read-only view of a person's dynasty data (never mutates; safe in the UI). */
export function fam(s: GameState, id: string): FamPerson {
  return s.dyn?.people[id] ?? READONLY_BLANK;
}

/** Engine-side: a person's dynasty record, created if missing. */
export function famMut(s: GameState, id: string): FamPerson {
  const d = ensureDynState(s);
  let p = d.people[id];
  if (!p) {
    p = blankPerson();
    d.people[id] = p;
  }
  return p;
}

/** Run character creation on the dynasty's own dice. */
export function makeDynCharacter(s: GameState, opts: MakeCharOpts): Character {
  const d = ensureDynState(s);
  const main = s.rng;
  s.rng = d.rng;
  try {
    return makeCharacter(s, opts);
  } finally {
    d.rng = s.rng;
    s.rng = main;
  }
}

export function houseOf(s: GameState, charId: string): House | undefined {
  const d = s.dyn;
  if (!d) return undefined;
  const hid = d.people[charId]?.houseId;
  return hid ? d.houses.find((h) => h.id === hid) : d.houses.find((h) => h.headId === charId);
}

export function houseById(s: GameState, id: string): House | undefined {
  return s.dyn?.houses.find((h) => h.id === id);
}

export function cooldownReady(s: GameState, key: string, weeks: number): boolean {
  const last = s.dyn?.cooldowns[key];
  return last === undefined || s.week - last >= weeks;
}

export function setCooldown(s: GameState, key: string): void {
  ensureDynState(s).cooldowns[key] = s.week;
}
