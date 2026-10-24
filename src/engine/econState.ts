import { hashSeed } from './rng';
import type { Character, FactionId, GameState } from './types';

/**
 * The economy & property layer's state: racket books, upgrade tiers, lots and
 * buildings on the map, managers and club staff, the headquarters, gifts,
 * season tickets and community projects.
 *
 * It lives on `GameState.econ` (optional, so older saves load) and rolls on its
 * own seeded stream (`econ.rng`), so the layer does not reshuffle the main
 * simulation's dice. Plain JSON like the rest of the state.
 */

/* ---------------- rackets ---------------- */

export interface RacketState {
  /** Upgrade-tree steps bought (0 = as bought). */
  tier: number;
  /** Bookmaking: this week's wagers, outstanding markers (bets taken on credit), last week's hold %. */
  handle?: number;
  markers?: number;
  lastHold?: number;
  /** Numbers: runners on the street, the bank's cash reserve, the last number that hit. */
  runners?: number;
  bank?: number;
  lastHit?: string;
  /** Cargo theft: friends on the docks. */
  contacts?: number;
  /** Vending: machines placed, and how hard the competition is pushing (0-100). */
  placements?: number;
  competition?: number;
  /** What it put in the treasury last week (after everything). */
  lastNet?: number;
  raids?: number;
}

/* ---------------- property ---------------- */

export type ZoneId = 'boardwalk' | 'pacific' | 'piers' | 'downtown' | 'docks' | 'crest' | 'north' | 'causeway' | 'westww' | 'ac' | 'sphilly';
export type StageId = 'purchase' | 'permits' | 'siteprep' | 'foundation' | 'framing' | 'exterior' | 'interior' | 'open';
export const STAGES: StageId[] = ['purchase', 'permits', 'siteprep', 'foundation', 'framing', 'exterior', 'interior', 'open'];

export type LotStatus = 'sale' | 'lease' | 'private' | 'owned' | 'leased' | 'rival' | 'public';

export interface Lot {
  id: string;
  zone: ZoneId;
  /** Position within the zone (the map places pins by it). */
  idx: number;
  /** Street address. */
  address: string;
  status: LotStatus;
  owner: FactionId | 'private' | 'city';
  /** Asking price (sale) — land, or land and building. */
  price: number;
  /** Weekly lease (lease lots, or what a tenant pays you when you own the building). */
  rent: number;
  /** What stands on it (undefined = a vacant lot). */
  use?: string;
  /** A going concern with a tenant/owner running it. */
  tenant?: string;
  /** You bought the business with the building (you run it). */
  operating?: boolean;
  /** Became a game Business when it opened (a motel, a club ...). */
  bizId?: string;
  /** Construction. */
  stage?: StageId;
  stageWeek?: number;
  /** Stalled for lack of money/permits this week. */
  stalled?: string;
  builtYear?: number;
  /** 0-100; falls a little each year, restored by renovation. */
  condition: number;
  renovated?: number;
  boughtWeek?: number;
  /** What the player has put into it (for resale). */
  invested?: number;
  /** Permits still pending (weeks left on each); 0 = granted. */
  permit?: { zoning: number; inspector: number; bribed?: boolean };
  /** A stop-work order: no progress until it is lifted. */
  stopWork?: { weeks: number; reason: string };
  /** Inspections passed during this build (stage ids). */
  inspected?: string[];
  /** Who is building it when it is not you (a rival, a developer, the city). */
  developer?: string;
  /** Your construction company holds the contract on someone else's build. */
  contractor?: boolean;
  /** Year construction started. */
  started?: number;
  /** What stood here before (burned, torn down) — for the map's timeline. */
  past?: { use: string; from: number; to: number; why: string }[];
  /** A rival is bidding for this lot too. */
  bidder?: FactionId;
}

/* ---------------- managers & staff ---------------- */

export type Oversight = 'weekly' | 'monthly' | 'quarterly' | 'hands_off';
export type ManagerSource = 'family' | 'crew' | 'pro';

export interface Manager {
  source: ManagerSource;
  /** Family or crew: the character. Pros are not full characters. */
  charId?: string;
  name: string;
  skill: number;
  loyalty: number;
  honesty: number;
  /** Weekly salary. */
  salary: number;
  /** Share of the take (0..0.3). */
  share: number;
  oversight: Oversight;
  since: number;
  /** Hidden: skimmed since the last audit. */
  skimmed: number;
  /** Shown once an audit or an accident turns it up. */
  found?: number;
  /** An adult child learning the trade. */
  assistantId?: string;
}

export type StaffRole = 'dancer' | 'bartender' | 'dj' | 'bandleader' | 'host' | 'server' | 'security' | 'chef' | 'performer';

export interface StaffMember {
  id: string;
  name: string;
  role: StaffRole;
  skill: number;
  ambition: number;
  since: number;
  /** What became of them (shown in the roster history). */
  fate?: string;
}

/* ---------------- headquarters ---------------- */

export type HQKind = 'social' | 'restaurant' | 'car' | 'walk';
export type BugSource = 'warrant' | 'informant' | 'technician';

export interface HQState {
  kind: HQKind;
  /** The restaurant whose back room it is. */
  bizId?: string;
  since: number;
  /** A federal bug, if one is planted (hidden until found). */
  bug?: { week: number; source: BugSource; leaked: number };
  sweeps: number;
  lastSweep?: number;
  /** Total evidence the bugs have produced, all time. */
  leaked: number;
  /** Bugs found, all time. */
  found: number;
  /** A hint that something is off (shown, not proof). */
  rumor?: string;
}

/* ---------------- gifts & community ---------------- */

export type TeamId = 'phillies' | 'eagles' | 'warriors' | 'sixers' | 'flyers';

export interface GiftRecord {
  week: number;
  to: string;
  giftId: string;
  value: number;
  /** +1 liked, 0 fine, -1 wrong gift. */
  fit: number;
}

export interface SeasonTicket {
  team: TeamId;
  holderId: string;
  since: number;
  box: boolean;
}

export interface CommunityProject {
  id: string;
  kind: string;
  zone: ZoneId;
  cost: number;
  weeks: number;
  progress: number;
  started: number;
  done?: number;
}

export interface ZoneRep {
  /** Appreciation (0-100). */
  rep: number;
  /** Whether they trust you (0-100): grows slower, falls with heat. */
  trust: number;
}

export interface CapoBook {
  skimStart: number;
  earned: number;
  normal: number;
  weeks: number;
}

export interface EconStats {
  built: number;
  lotsBought: number;
  rivalBuys: number;
  upgrades: number;
  gifts: number;
  leverage: number;
  projects: number;
  bugs: number;
  bugsFound: number;
  skimsCaught: number;
  bigScores: number;
  staffMoves: number;
  npcBuilt: number;
  fires: number;
  inspectionsFailed: number;
  contractsWon: number;
  outbid: number;
  inspectorPaid?: number;
}

export interface EconState {
  rng: number;
  nextId: number;
  rackets: Record<string, RacketState>;
  /** By business id, or `lot:<lotId>` for buildings. */
  managers: Record<string, Manager>;
  /** Club rosters, by business id. */
  staff: Record<string, StaffMember[]>;
  lots: Lot[];
  hq: HQState;
  gifts: GiftRecord[];
  tickets: SeasonTicket[];
  projects: CommunityProject[];
  zones: Partial<Record<ZoneId, ZoneRep>>;
  capoBooks: Record<string, CapoBook>;
  /** No-show jobs handed out as favors: weekly salary by character id. */
  jobs: Record<string, number>;
  cooldowns: Record<string, number>;
  /** The town's building inspector. He lives here rather than among the game's characters, so that adding him does not reshuffle the rest of the world. */
  inspector?: Character;
  /** Public and private contracts your companies are working (weekly payments). */
  contracts: { id: string; name: string; weekly: number; weeksLeft: number; kind: 'city' | 'rival' | 'private' }[];
  /** City jobs open for bids this month. */
  tenders: { id: string; name: string; value: number; weeks: number; closes: number }[];
  /** Short-capo cases the boss is looking at (the truth is hidden from the UI). */
  cases: Record<string, { skimming: boolean; shortfall: number; week: number }>;
  stats: EconStats;
  lastMonth?: string;
}

/* ---------------- ops and actions ---------------- */

/** Effect ops (inside `{ type: 'econ', op }`), applied by econ.ts. */
export type EconOp =
  | { op: 'skimFound'; key: string; recover: number }
  | { op: 'fireManager'; key: string }
  | { op: 'trustManager'; key: string; amount: number }
  | { op: 'auditCapo'; charId: string }
  | { op: 'squeeze'; charId: string }
  | { op: 'note'; text: string }
  | { op: 'credit'; charId: string; amount: number }
  | { op: 'zone'; zone: ZoneId; rep?: number; trust?: number }
  | { op: 'staffFate'; bizId: string; staffId: string; fate: 'promote' | 'leave' | 'keep' }
  | { op: 'competition'; bizId: string; amount: number }
  | { op: 'job'; charId: string; salary: number }
  | { op: 'gift'; to: string; giftId: string; fit: number; value: number }
  | { op: 'ticket'; team: TeamId; holderId: string; box: boolean }
  | { op: 'lotSold'; lotId: string; to: FactionId | 'private'; price: number }
  | { op: 'tenant'; lotId: string; name?: string }
  | { op: 'clearStop'; lotId: string }
  | { op: 'bribeStop'; lotId: string }
  | { op: 'outbid'; lotId: string };

/** Player orders (inside `{ kind: 'econ', op }`), previewed and committed by econ.ts. */
export type EconAction =
  | { type: 'upgrade'; bizId: string }
  | { type: 'collect'; bizId: string }
  | { type: 'buyLot'; lotId: string; going?: boolean }
  | { type: 'leaseLot'; lotId: string }
  | { type: 'build'; lotId: string; use: string }
  | { type: 'renovate'; lotId: string }
  | { type: 'sellLot'; lotId: string }
  | { type: 'permits'; lotId: string }
  | { type: 'bribeInspector'; lotId: string }
  | { type: 'puppetPermit'; lotId: string }
  | { type: 'fixCode'; lotId: string }
  | { type: 'slowRival'; lotId: string }
  | { type: 'bid'; contractId: string }
  | { type: 'manager'; key: string; source: ManagerSource; charId?: string; pro?: number }
  | { type: 'oversight'; key: string; level: Oversight }
  | { type: 'audit'; key: string }
  | { type: 'assistant'; key: string; charId?: string }
  | { type: 'hq'; kind: HQKind; bizId?: string }
  | { type: 'sweep' }
  | { type: 'gift'; giftId: string; to: string }
  | { type: 'project'; kind: string; zone: ZoneId }
  | { type: 'leverage'; mode: LeverageMode; to: string; withId?: string }
  | { type: 'invite'; team: TeamId; to: string };

export type LeverageMode = 'cash' | 'car' | 'property' | 'job' | 'invite' | 'introduce';

export function blankEcon(s: GameState): EconState {
  return {
    rng: hashSeed(`${s.seed}:econ`),
    nextId: 1,
    rackets: {},
    managers: {},
    staff: {},
    lots: [],
    hq: { kind: 'social', since: s.week, sweeps: 0, leaked: 0, found: 0 },
    gifts: [],
    tickets: [],
    projects: [],
    zones: {},
    capoBooks: {},
    jobs: {},
    cooldowns: {},
    cases: {},
    contracts: [],
    tenders: [],
    stats: { built: 0, lotsBought: 0, rivalBuys: 0, upgrades: 0, gifts: 0, leverage: 0, projects: 0, bugs: 0, bugsFound: 0, skimsCaught: 0, bigScores: 0, staffMoves: 0, npcBuilt: 0, fires: 0, inspectionsFailed: 0, contractsWon: 0, outbid: 0 },
  };
}

/** Engine-side accessor: the layer's state, created if missing. */
export function ensureEcon(s: GameState): EconState {
  if (!s.econ) s.econ = blankEcon(s);
  const e = s.econ;
  // Saves from before the construction update.
  e.contracts ??= [];
  e.tenders ??= [];
  for (const k of ['npcBuilt', 'fires', 'inspectionsFailed', 'contractsWon', 'outbid'] as const) e.stats[k] ??= 0;
  return e;
}

export function eid(e: EconState, prefix: string): string {
  return `${prefix}${e.nextId++}`;
}
