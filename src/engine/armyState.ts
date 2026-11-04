import { hashSeed } from './rng';
import type { FactionId, GameState, RivalId } from './types';

/**
 * THE ARMY's state (army.ts): CK levies for a 1960 crew.
 *
 * The men under arms (called up from each capo's crew), the outside muscle
 * on the payroll, the safehouses, the allies who answered a call to arms,
 * the pacts made in peacetime, and each war's campaign (the fronts, the
 * districts held by force, the men the enemy has left, the battle pending).
 *
 * Optional on GameState: made the first time the boss raises a man, makes a
 * pact, or a war or a campaign starts. An old save without it loads
 * unchanged. Rolls on its own seeded stream (`rng`), so it never shifts the
 * main simulation's dice.
 */

/** Who can be asked to send men: a family on the shore, a New York family, Philadelphia's own malcontents. */
export type AllyId = 'manno' | 'feldstein' | 'kessler' | 'camden' | `nyc:${string}`;

/** What you offer for their help. */
export type AllyOffer = 'money' | 'cut' | 'favor';

/** Outside muscle for hire. */
export type BandId = 'toughs' | 'irish' | 'shooters';

export type WarGoal = 'districts' | 'tribute' | 'install' | 'push';

/** A battle answer. */
export type BattleHow = 'meet' | 'lead' | 'strike' | 'fallback';

export interface Levy {
  /** Men answering the call now. */
  n: number;
  /** Men the capo was asked for. */
  asked: number;
  since: number;
  /** Men he is "still rounding up": they arrive at `lateWeek` (if he is not stalling for good). */
  late?: number;
  lateWeek?: number;
  /** He stalled: the rest never come. */
  stalled?: boolean;
}

export interface Hired {
  band: BandId;
  men: number;
  since: number;
}

/** Men an ally sent: shown separately; paid for after. */
export interface Commitment {
  id: string;
  ally: AllyId;
  warId: string;
  men: number;
  /** Starting men (losses come off `men`). */
  sent: number;
  offer: AllyOffer;
  /** Money: paid half up front, the rest owed at peace. Cut: weekly share or ground at peace. */
  price: number;
  since: number;
  until: number;
  /** The district that goes to them at peace (a cut, for a shore family). */
  district?: string;
}

/** A peacetime pact: each comes when the other calls. */
export interface WarPact {
  ally: AllyId;
  since: number;
  until: number;
}

/** A battle massing: the decision window, answered next week. */
export interface PendingBattle {
  id: string;
  warId: string;
  district: string;
  /** Who is attacking the district. */
  attacker: 'player' | RivalId;
  /** Their men committed. */
  enemyMen: number;
  week: number;
  /** Week it is fought (the boss answers before). */
  due: number;
  /** The decision popup's iid, when it was shown. */
  iid?: string;
}

export interface BattleRecord {
  week: number;
  warId: string;
  rival: RivalId;
  district: string;
  how: BattleHow;
  won: boolean;
  ours: number;
  theirs: number;
  odds: number;
  ourLost: number;
  theirLost: number;
  big: boolean;
  text: string;
}

/** One war's campaign: the fronts, the occupation, the enemy's men. */
export interface Campaign {
  warId: string;
  rival: RivalId;
  /** Who started it. */
  by: 'player' | RivalId;
  goal: WarGoal;
  /** Why they came (the casus belli in words). */
  why: string;
  enemyStart: number;
  enemyMen: number;
  /** Their men's quality (power per man). */
  enemyQ: number;
  /** Their weariness 0..100. */
  enemyTired: number;
  /** Men their friends sent them. */
  enemyAllies: { from: string; men: number }[];
  /** The road they take into Wildwood, entry first. */
  path: string[];
  /** Districts held by force: district → the side holding it. */
  occupied: Record<string, FactionId>;
  won: number;
  lost: number;
  lastBattle?: number;
  /** Next week they will move (mass). */
  nextMove: number;
  /** Week they last offered terms. */
  offered?: number;
}

export interface ArmyState {
  rng: number;
  nextId: number;
  levies: Record<string, Levy>;
  hired: Hired[];
  /** Safehouses: the mattresses are out. */
  safehouses: boolean;
  /** The week a breakthrough last reached the boss and only wounded him (army.ts). */
  bossWound?: number;
  safehousesSince?: number;
  /** 0..100: how tired the men under arms are. */
  weariness: number;
  /** Recent victories lift the men (decays). */
  glory: number;
  commits: Commitment[];
  pacts: WarPact[];
  camps: Record<string, Campaign>;
  pending: PendingBattle[];
  history: BattleRecord[];
  /** Philadelphia's (and the families') pressure to come in, last reading: rival → 0..100. */
  pressure: Record<string, number>;
  /** Overseer: Philadelphia's man sits over you until this week (a lost war). */
  overseerUntil?: number;
  /** Cooldowns by key → week. */
  cd: Record<string, number>;
  /** [week, text], newest last (capped). */
  log: [number, string][];
}

export function ensureArmy(s: GameState): ArmyState {
  if (!s.army) s.army = { rng: hashSeed(`${s.seed}:army`), nextId: 1, levies: {}, hired: [], safehouses: false, weariness: 0, glory: 0, commits: [], pacts: [], camps: {}, pending: [], history: [], pressure: {}, cd: {}, log: [] };
  const A = s.army;
  A.levies ??= {};
  A.hired ??= [];
  A.commits ??= [];
  A.pacts ??= [];
  A.camps ??= {};
  A.pending ??= [];
  A.history ??= [];
  A.pressure ??= {};
  A.cd ??= {};
  A.log ??= [];
  return A;
}

/** The boss's orders for the army. */
export type ArmyAction =
  /** Call up a crew's men ('family': your own men; 'all': every crew). */
  | { op: 'raise'; holder: string }
  /** Send a crew's men home. */
  | { op: 'disband'; holder: string }
  /** Hire outside muscle for the weeks it takes. */
  | { op: 'hire'; band: BandId }
  /** Let the hired men go. */
  | { op: 'dismiss'; band: BandId }
  /** Go to the mattresses: safehouses for the men and the boss (or come home). */
  | { op: 'safehouses'; on: boolean }
  /** Call to arms: ask a family to send men to this war. */
  | { op: 'ask'; ally: AllyId; warId: string; offer: AllyOffer }
  /** A pact in peacetime: each comes when the other calls. */
  | { op: 'pact'; ally: AllyId }
  /** Take the fight to them: hit a district they hold or have taken. */
  | { op: 'attack'; warId: string; district: string };
