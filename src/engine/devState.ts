import { crew, isFree } from './characters';
import { holder } from './council';
import { hashSeed } from './rng';
import { crewsOf } from './strength';
import { PATHS_BY_ID, TIERS, type DevEventId, type GearCat, type PathId } from './devData';
import type { Character, GameState, RivalId } from './types';

/**
 * FAMILY DEVELOPMENT: the saved state and the small reads other systems use
 * (the hooks). Optional on GameState (`s.dev`): created by the first week
 * that runs, topped up on load. Plain JSON; its own dice stream.
 */

/** One lot of equipment: one category, one holder (a capo's id, or 'family' for the boss's own men). Never in two places. */
export interface GearStack {
  id: string;
  cat: GearCat;
  n: number;
  /** 0..1 */
  cond: number;
  holder: string;
  since: number;
}

/** What one rival family has developed (abstract). */
export interface RivalDev {
  tiers: Partial<Record<PathId, number>>;
  /** Equipment: share of their men equipped (0..1.2) and its condition. */
  gear: number;
  cond: number;
  /** Years (0-3) this family runs behind the times: no two modernize on the same date. */
  lag: Partial<Record<PathId, number>>;
}

export interface HeardItem { week: number; rival: RivalId; text: string; via: string }

export interface DevState {
  rng: number;
  /** Path -> tier held (0 or absent: none). */
  tiers: Partial<Record<PathId, number>>;
  /** Path -> the man in charge (set when adopted; re-picked when he is gone). */
  resp: Partial<Record<PathId, string>>;
  gear: GearStack[];
  /** Capo id -> mandate level (0 ask me, 1 keep them equipped, 2 arm them heavy). */
  mandates: Record<string, 0 | 1 | 2>;
  /** "capoId:YYYY-M" -> Family money he spent on gear that month. */
  spent: Record<string, number>;
  /** 0..100: how much the street fears the crew (apart from respect and loyalty). */
  fear: number;
  /** 0..100: how much the neighborhoods resent the arming up. */
  resent: number;
  /** Tier id -> week it first became available (so the news says it once). */
  seen: Record<string, number>;
  /** Things that happened that open tiers. */
  events: Partial<Record<DevEventId, number>>;
  rivals: Partial<Record<RivalId, RivalDev>>;
  /** What you heard of the other families' development (newest last, short). */
  heard: HeardItem[];
  /** Running totals for the books. */
  stats: { spentTech: number; spentGear: number; upkeep: number; capoBuys: number; income: number };
}

const RIVAL_START: Partial<Record<RivalId, { gear: number; cond: number; tiers: Partial<Record<PathId, number>> }>> = {
  manno: { gear: 0.7, cond: 0.75, tiers: { wheels: 1 } },
  feldstein: { gear: 0.45, cond: 0.85, tiers: { books: 1, legit: 1 } },
  kessler: { gear: 0.55, cond: 0.7, tiers: { legit: 1 } },
};

export function initRivalDev(s: GameState, id: RivalId): RivalDev {
  const st = RIVAL_START[id] ?? { gear: 0.55, cond: 0.75, tiers: {} };
  const lag: Partial<Record<PathId, number>> = {};
  for (const p of Object.keys(PATHS_BY_ID) as PathId[]) lag[p] = hashSeed(`${s.seed}:devlag:${id}:${p}`) % 4;
  return { tiers: { ...st.tiers }, gear: st.gear, cond: st.cond, lag };
}

/** The starting stock in the club's back room: a few pieces for the boss's own men. */
function startingGear(s: GameState): GearStack[] {
  // With the crew that has the most men (the boss's own men when they are as many).
  const crews = crewsOf(s).sort((a, b) => b.members.length - a.members.length || (a.holder === 'family' ? -1 : b.holder === 'family' ? 1 : 0));
  const holder = crews[0]?.members.length ? crews[0].holder : 'family';
  return [
    { id: 'g1', cat: 'handguns', n: 6, cond: 0.7, holder, since: s.week },
    { id: 'g2', cat: 'shotguns', n: 2, cond: 0.6, holder, since: s.week },
  ];
}

/** The state as the development screens see it: before the first week has run, with the layer it will start with (the state itself is untouched). */
export function viewDev(s: GameState): GameState {
  if (s.dev) return s;
  const v = { ...s };
  ensureDev(v);
  return v;
}

export function ensureDev(s: GameState): DevState {
  if (!s.dev) {
    s.dev = {
      rng: hashSeed(`${s.seed}:dev`), tiers: {}, resp: {}, gear: startingGear(s), mandates: {}, spent: {}, fear: 20, resent: 0, seen: {}, events: {}, rivals: {}, heard: [],
      stats: { spentTech: 0, spentGear: 0, upkeep: 0, capoBuys: 0, income: 0 },
    };
  }
  const d = s.dev;
  d.tiers ??= {};
  d.resp ??= {};
  d.gear ??= [];
  d.mandates ??= {};
  d.spent ??= {};
  d.fear ??= 20;
  d.resent ??= 0;
  d.seen ??= {};
  d.events ??= {};
  d.rivals ??= {};
  d.heard ??= [];
  d.stats ??= { spentTech: 0, spentGear: 0, upkeep: 0, capoBuys: 0, income: 0 };
  for (const r of s.rivals) if (r.kind === 'mob' && !d.rivals[r.id]) d.rivals[r.id] = initRivalDev(s, r.id);
  return d;
}

export const tierOf = (s: GameState, p: PathId): number => s.dev?.tiers[p] ?? 0;

/* ------------------------------------------------------------------ */
/* Who answers for a path                                              */
/* ------------------------------------------------------------------ */

const usable = (s: GameState, c: Character | undefined): c is Character => !!c && c.alive && c.faction === 'player' && c.id !== s.playerId && isFree(s, c);

/** The man who would answer for a path now: the chosen one if still free, else the seat, else the best man at it. */
export function respFor(s: GameState, p: PathId): Character | undefined {
  const chosen = s.dev?.resp[p];
  if (chosen && usable(s, s.characters[chosen])) return s.characters[chosen];
  const def = PATHS_BY_ID[p];
  for (const r of def.resp) {
    let c: Character | undefined;
    if (r === 'keeper') { const id = s.ledgerBook?.keeperId; c = id ? s.characters[id] : undefined; }
    else if (r === 'underboss' || r === 'consigliere') c = holder(s, r) ?? crew(s).find((x) => x.rank === r && usable(s, x));
    else c = holder(s, r);
    if (usable(s, c)) return c;
  }
  const pool = crew(s).filter((c) => usable(s, c));
  if (def.spec) { const sp = pool.find((c) => c.specialty === def.spec); if (sp) return sp; }
  return pool.sort((a, b) => b.attributes[def.skill] - a.attributes[def.skill] || (a.id < b.id ? -1 : 1))[0];
}

/** How well a held path works: 0.6 with nobody in charge, 0.85..1.15 by his skill. */
export function pathEff(s: GameState, p: PathId): number {
  const c = respFor(s, p);
  if (!c) return 0.6;
  const def = PATHS_BY_ID[p];
  return 0.85 + Math.min(100, c.attributes[def.skill] + (def.spec && c.specialty === def.spec ? 20 : 0)) / 333;
}

/* ------------------------------------------------------------------ */
/* Hooks: the small numbers other systems read                         */
/* ------------------------------------------------------------------ */

const COMM_OBEY = [0, 0.04, 0.07, 0.1, 0.12];
const COMM_STR = [0, 0, 1, 2, 3];
const BOOKS_SKILL = [1, 1.12, 1.25, 1.45];
const BOOKS_ERR = [1, 0.85, 0.7, 0.5];
const WHEELS_STR = [0, 2, 3, 4];
const WHEELS_JOB = [0, 3, 5, 7];

/** Communications: added to the odds an order is carried out as given (hierarchy.obeyOdds). */
export function devObeyBonus(s: GameState): number {
  const t = tierOf(s, 'comm');
  return t ? COMM_OBEY[t] * pathEff(s, 'comm') : 0;
}

/** Business & finance: multiplies the bookkeeper's skill at catching skims (ledgerbook.keeperSkill). */
export function devKeeperMult(s: GameState): number {
  const t = tierOf(s, 'books');
  return t ? 1 + (BOOKS_SKILL[t] - 1) * pathEff(s, 'books') : 1;
}

/** Business & finance: multiplies the error in what the books expect from a capo. */
export function devReportErr(s: GameState): number {
  return BOOKS_ERR[tierOf(s, 'books')] ?? 1;
}

/** Transportation and communications: flat crew strength (coordination, being there fast). */
export function devStrengthTech(s: GameState): { wheels: number; comm: number } {
  const w = tierOf(s, 'wheels');
  const c = tierOf(s, 'comm');
  return { wheels: Math.round(WHEELS_STR[w] * (w ? pathEff(s, 'wheels') : 1)), comm: Math.round(COMM_STR[c] * (c ? pathEff(s, 'comm') : 1)) };
}

/** Transportation: odds on scores and loads (dirtyWork). */
export function devJobBonus(s: GameState): number {
  const w = tierOf(s, 'wheels');
  return w ? Math.round(WHEELS_JOB[w] * pathEff(s, 'wheels')) : 0;
}

/** Information: multiplies the weekly odds the feds plant a bug at headquarters (hq.bugOdds). */
export function devBugMult(s: GameState): number {
  return tierOf(s, 'info') >= 3 ? 0.5 : 1;
}

/** Equipment: multiplies weekly wear. */
export function devWearMult(s: GameState): number {
  const g = tierOf(s, 'gear');
  return g >= 2 ? 0.5 : g >= 1 ? 0.65 : 1;
}

/** Tiers as a flat list (for the UI and tests). */
export function heldTiers(s: GameState): string[] {
  return TIERS.filter((t) => tierOf(s, t.path) >= t.tier).map((t) => t.id);
}
