import { ableness, isIncapable } from './aging';
import { ageOn, isInSeason } from './calendar';
import { crew, displayName, hasTrait, isFree, player } from './characters';
import { holder as seatHolder } from './council';
import { killCharacter } from './dynasty';
import { applyEffects, fmtMoney, shiftInfluence } from './effects';
import { alliedWithFaction } from './familyHouses';
import { newCtx as newCtxFor, respect, rivalMoneyHit, type Ctx } from './ledger';
import { rivalCaps } from './rivals';
import { awayReason, DAY_NAMES, today } from './days';
import { noteRaided, raidedLately, ensureAction } from './actionState';
import { journal } from './journal';
import { wireIn } from './phoneState';
import type { NowResult } from './deeds/now';
import { defectTo } from './regimes';
import { addOpinion, opinion } from './relations';
import { chance, hashSeed, pick, rand, randInt, type RngHolder } from './rng';
import { strengthTotal } from './strength';
import { pactWith } from './talks';
import { protectFoiled, protectionFor } from './protect';
import { wealthPressure } from './pressure';
import { noteThreatPlan, threatLean } from './minds/planner';
import type { Character, Effect, GameState, Rival, RivalId } from './types';
import { knobs } from './difficulty';
import { spareFromWars } from './rankView';

/**
 * THREATS AND URGENT MEETINGS.
 *
 * The other side does not wait its turn. Rival crews plan moves on you a week
 * or three ahead (a push on a district, a stick-up of a racket, poaching an
 * earner, an envelope for one of your men, a set-up for the cops, a hit on
 * one of yours); the county cops plan raids and stake-outs when the island
 * is hot; and the FBI, slow and patient, tries to set up in town: a rented
 * room across the street, a phone-company work order, a "tourist" asking
 * questions, a man of yours they are working on, the grand jury.
 *
 * Wildwood is a small, discreet town. A new face in October, a car with
 * New York plates, a lineman at the wrong pole: people notice, and the people
 * who notice talk to the people who pay them. So the warnings come TO the
 * boss: a capo, a soldier, a sergeant on the payroll, a woman from the clubs,
 * the night man at your motel asks for an urgent meeting. What they heard
 * depends on who they are, where they stand and how much they love you; some
 * of it is wrong, and some of it was put in their ear on purpose.
 *
 * The meeting: meet him yourself (it takes a couple of hours, and you have
 * to be in town), send the underboss or the consigliere, or brush him off.
 * At the meeting you hear the whole thing and choose an answer (double the
 * security, move the family, go to the mattresses, pay off the cop, strike
 * first, warn the man, lie low, sweep the phones, lawyers, or feed the feds
 * garbage). The answer is carried out when the week turns, before the threat
 * lands. Ignore a real warning and it lands in full, and the man who risked
 * his neck to bring it remembers.
 *
 * Violence stays off-screen. Every money and heat change is a ledger line.
 * The layer keeps its own dice (`ThreatsState.rng`), so it never shifts the
 * rest of the week's rolls.
 */

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type ThreatKind =
  | 'hit' | 'move' | 'racket' | 'poach' | 'bribe' | 'setup'
  | 'raid' | 'stakeout' | 'wire'
  | 'fed_post' | 'fed_wire' | 'fed_flip' | 'fed_under' | 'fed_gj';
export type ThreatBy = RivalId | 'police' | 'fbi';
export type SourceKind = 'underboss' | 'consigliere' | 'capo' | 'soldier' | 'cop' | 'official' | 'ear' | 'street';
export type TipTruth = 'solid' | 'garbled' | 'false';
export type MeetVia = 'boss' | 'underboss' | 'consigliere';
export type ResponseId = 'security' | 'move_family' | 'mattresses' | 'payoff' | 'counter' | 'warn' | 'lielow' | 'sweep' | 'lawyer' | 'feed' | 'nothing';
export type TipStatus = 'waiting' | 'met' | 'sent' | 'ignored' | 'done' | 'missed';

export interface Threat {
  id: string;
  kind: ThreatKind;
  by: ThreatBy;
  targetId?: string;
  bizId?: string;
  district?: string;
  /** Week it was planned and the week it lands. */
  start: number;
  due: number;
  /** 0-1: how much of it the boss's answers have taken off (rolled when it lands). */
  blunt: number;
  /** A rival scheme (schemes.ts) this threat is the street's view of: it resolves there, not here. */
  schemeId?: string;
  /** A honey trap (honey.ts): the woman who set the boss up for it. The hit waits where she asked him to meet her. */
  lure?: string;
  /** The day of its week it lands (0 Monday … 6 Sunday) and the hour (0-23): a ticking clock (daily.ts). Absent: it lands at the week's turn. */
  dueDay?: number;
  hour?: number;
  /** It is happening right now: the boss has a moment to answer (strikeView / resolveStrike). */
  live?: 1;
  /** A raid the heat brought (heat.ts): cash seized, a bigger padlock, the pressure released. */
  heatRaid?: 1;
}

export interface Tip {
  id: string;
  /** The real threat behind it (none: a false or planted tip). */
  threatId?: string;
  /** What the source says is coming (a garbled tip has the wrong man or place). */
  kind: ThreatKind;
  by: ThreatBy;
  targetId?: string;
  bizId?: string;
  district?: string;
  sourceId: string;
  sourceKind: SourceKind;
  sourceName: string;
  sourceRole: string;
  week: number;
  /** The last week to act: the week it is said to land. */
  deadline: number;
  truth: TipTruth;
  plantedBy?: RivalId;
  hint: string;
  detail: string;
  status: TipStatus;
  via?: MeetVia;
  /** What the man who took the meeting makes of it. */
  read?: string;
  response?: ResponseId;
  /** The arrival popup has been shown. */
  seen?: boolean;
  /** The day of the week the boss met him (for a time system). */
  metDay?: number;
  /** When the source says it comes (his day and hour; a garbled tip can be a day off). */
  dueDay?: number;
  hour?: number;
  /** When he asks for the meeting: the week and day it comes out on the clock (absent: at once). */
  rel?: { w: number; d: number };
}

export interface ThreatLog { week: number; text: string }

export interface ThreatsState {
  rng: number;
  n: number;
  threats: Threat[];
  tips: Tip[];
  /** The FBI's slow campaign: 0 nothing, 1 the post, 2 the wire, 3 men inside, 4 the grand jury. */
  fed: { stage: number; next: number; tries: number };
  /** Source id -> warnings the boss brushed off. */
  snubs: Record<string, number>;
  log: ThreatLog[];
  stats: { planned: number; landed: number; foiled: number; tips: number; falseTips: number; ignored: number };
}

/* ------------------------------------------------------------------ */
/* Tuning                                                              */
/* ------------------------------------------------------------------ */

/** No planned moves on the player before this week (the first weeks are for learning the island). */
export const GRACE_WEEKS = 8;
/** The Old Don's island is already in motion: the grace is short (oldDon.ts). */
export function graceWeeks(s: GameState): number {
  return s.flags.start_olddon ? 4 : GRACE_WEEKS;
}
/** The FBI does not bother with a new boss before this week. */
export const FED_GRACE = 14;
/** At most this many planned threats against the player at once. */
export const MAX_ACTIVE = 4;
/** Hours an in-person meeting takes (for a time system to charge). */
export const MEET_HOURS = 2;
/** Most tips a single threat produces. */
const TIPS_PER_THREAT = 2;
/** New tips a week, at most (the desk is not a switchboard). */
const TIPS_PER_WEEK = 3;

export const KIND_LABEL: Record<ThreatKind, string> = {
  hit: 'A hit', move: 'A move on your ground', racket: 'A move on a racket', poach: 'Poaching an earner', bribe: 'An envelope for one of yours', setup: 'A set-up',
  raid: 'A raid', stakeout: 'A stake-out', wire: 'A wiretap',
  fed_post: 'An FBI post', fed_wire: 'A federal wire', fed_flip: 'The FBI working on one of yours', fed_under: 'An undercover agent', fed_gj: 'Grand jury subpoenas',
};

const FED: ThreatKind[] = ['fed_post', 'fed_wire', 'fed_flip', 'fed_under', 'fed_gj'];
const POLICE: ThreatKind[] = ['raid', 'stakeout', 'wire'];
export const isFedKind = (k: ThreatKind): boolean => FED.includes(k);
export const isPoliceKind = (k: ThreatKind): boolean => POLICE.includes(k);

/** How much each answer takes off each kind of threat (0 none, 1 all of it). */
const EFFECT: Record<Exclude<ResponseId, 'nothing'>, Partial<Record<ThreatKind, number>>> = {
  security: { hit: 0.6, racket: 0.6, move: 0.3, setup: 0.4, raid: 0.2 },
  move_family: { hit: 1 },
  mattresses: { hit: 0.9, move: 0.7, racket: 0.7, poach: 0.3, bribe: 0.3 },
  payoff: { raid: 0.9, stakeout: 0.8, setup: 0.7, wire: 0.6 },
  counter: { move: 0.9, racket: 0.8, poach: 0.6, hit: 0.5, bribe: 0.4, setup: 0.5 },
  warn: { hit: 0.8, poach: 0.8, bribe: 0.8, fed_flip: 0.8 },
  lielow: { raid: 0.5, stakeout: 0.9, setup: 0.5, wire: 0.7, fed_post: 0.9, fed_under: 0.8, fed_wire: 0.6, fed_flip: 0.3, fed_gj: 0.3 },
  sweep: { wire: 1, fed_wire: 1 },
  lawyer: { fed_gj: 0.8, fed_flip: 0.3 },
  feed: { fed_post: 1, fed_under: 1, fed_wire: 1, wire: 1 },
};

const VIA_MULT: Record<MeetVia, number> = { boss: 1, consigliere: 0.9, underboss: 0.85 };

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

export function threatsOf(s: GameState): ThreatsState | undefined {
  return s.threats;
}

export function ensureThreats(s: GameState): ThreatsState {
  if (!s.threats) {
    s.threats = {
      rng: hashSeed(`${s.seed}:threats`), n: 1, threats: [], tips: [], fed: { stage: 0, next: FED_GRACE, tries: 0 }, snubs: {}, log: [],
      stats: { planned: 0, landed: 0, foiled: 0, tips: 0, falseTips: 0, ignored: 0 },
    };
  }
  return s.threats;
}

const nid = (T: ThreatsState, p: string): string => `${p}${T.n++}`;

function note(ctx: Ctx, T: ThreatsState, text: string, chronicle = true): void {
  const s = ctx.s;
  ctx.log.push(text);
  T.log.push({ week: s.week, text });
  if (T.log.length > 30) T.log = T.log.slice(-30);
  if (chronicle) s.chronicle.push({ week: s.week, date: { ...s.date }, text, kind: 'rival' });
}

/* ------------------------------------------------------------------ */
/* Who is who                                                          */
/* ------------------------------------------------------------------ */

function rivalName(s: GameState, by: ThreatBy): string {
  if (by === 'police') return 'the county detectives';
  if (by === 'fbi') return 'the FBI';
  return s.rivals.find((r) => r.id === by)?.shortName ?? 'somebody';
}

function bizName(s: GameState, id: string | undefined): string {
  return s.businesses.find((b) => b.id === id)?.name ?? 'one of your places';
}

function districtName(s: GameState, id: string | undefined): string {
  return s.districts.find((d) => d.id === id)?.name ?? 'your ground';
}

function personName(s: GameState, id: string | undefined): string {
  if (!id) return 'one of yours';
  if (id === s.playerId) return 'you';
  const c = s.characters[id];
  return c ? displayName(c) : 'one of yours';
}

function isFamily(s: GameState, c: Character): boolean {
  return c.dynasty && c.id !== s.playerId && c.rank === 'civilian';
}

function adultFamily(s: GameState): Character[] {
  return Object.values(s.characters).filter((c) => c.alive && isFamily(s, c) && ageOn(c.birth, s.date) >= 18);
}

/** How able a rival boss is to run his crew: Incapable bosses barely move, the infirm slow down. */
export function rivalCapacity(s: GameState, r: Rival): number {
  return ableness(s, r.leaderId);
}

/**
 * How hard a rival is pushing on you this week: the weekly chance he plans a
 * move, with every reason. Scales with his goal, his nature, what he thinks
 * of you, how weak you look, and how able he still is.
 */
export function aggression(s: GameState, r: Rival): { chance: number; reasons: { label: string; value: number }[] } {
  const reasons: { label: string; value: number }[] = [];
  const leader = s.characters[r.leaderId];
  if (r.kind !== 'mob' || !leader?.alive) return { chance: 0, reasons: [{ label: 'Not a crew that moves on you', value: 0 }] };
  if (alliedWithFaction(s, r.id) || pactWith(s, r.id)) return { chance: 0, reasons: [{ label: 'Bound to you by marriage or a pact', value: 0 }] };
  let p = 0.16;
  reasons.push({ label: 'Base', value: 16 });
  const mul = (label: string, m: number) => { if (Math.abs(m - 1) < 0.01) return; reasons.push({ label, value: Math.round((m - 1) * 100) }); p *= m; };
  const goalM: Record<string, number> = { conquer: 1.4, revenge: 1.6, squeeze: 1.2, enrich: 0.9, legitimacy: 0.6, survive: 0.5, headline: 0.8 };
  mul(`His aim: ${r.goal}`, goalM[r.goal] ?? 1);
  const T: Record<string, number> = { 'Hot-headed': 1.4, Ambitious: 1.3, Cruel: 1.2, Vengeful: 1.15, Greedy: 1.1, Cowardly: 0.6, Patient: 0.8, Honest: 0.85 };
  for (const t of leader.traits) if (T[t]) mul(t, T[t]);
  const op = opinion(s, r.leaderId, s.playerId);
  mul(op <= -30 ? 'He hates you' : op >= 30 ? 'He likes you' : 'What he thinks of you', op <= -30 ? 1.5 : op >= 30 ? 0.35 : 1 - op / 150);
  const mine = Math.max(5, strengthTotal(s));
  mul(r.muscle > mine ? 'You look weak next to him' : 'Your muscle', Math.max(0.6, Math.min(1.6, (r.muscle + 10) / (mine + 10))));
  if (s.heat.local >= 50) mul('Your heat: the cops will do his work', 1.2);
  if (r.war || r.feud) mul(r.war ? 'At war with you' : 'A feud', 1.5);
  if (r.money < 1500) mul('His treasury is thin', 0.4);
  mul(isIncapable(s, r.leaderId) ? 'His boss is Incapable' : 'His boss\'s health', rivalCapacity(s, r));
  // What is on his mind (minds/planner.ts): a grudge, a plan against you, his read of your strength.
  const lean = threatLean(s, r);
  if (lean) mul(lean.label, lean.mult);
  // Success draws fire (pressure.ts): a fat outfit is worth a move.
  const fat = wealthPressure(s);
  if (fat > 0) mul('You are getting fat: everybody wants a piece', 1 + 0.6 * fat);
  if (s.week < graceWeeks(s)) { p = 0; reasons.push({ label: 'Too early: they are still sizing you up', value: -100 }); }
  const dk = knobs(s).aggression;
  if (dk !== 1 && p > 0) mul(`Difficulty: ${knobs(s).label}`, dk);
  return { chance: Math.max(0, Math.min(0.4, p)), reasons };
}

/* ------------------------------------------------------------------ */
/* Planning                                                            */
/* ------------------------------------------------------------------ */

function active(T: ThreatsState): Threat[] {
  return T.threats;
}

function weighted<X>(h: RngHolder, xs: readonly [X, number][]): X | undefined {
  const tot = xs.reduce((a, [, w]) => a + Math.max(0, w), 0);
  if (tot <= 0) return undefined;
  let r = rand(h) * tot;
  for (const [x, w] of xs) { r -= Math.max(0, w); if (r < 0) return x; }
  return xs[xs.length - 1][0];
}

function ourBusinesses(s: GameState): GameState['businesses'] {
  return s.businesses.filter((b) => b.owner === 'player' && !(b.closedUntil !== undefined && b.closedUntil > s.week));
}

/** Places the cops (or a rival's planted gun) may hit: not one raided in the last RAID_COOLDOWN weeks (DAILY_LOGIC B3). */
function raidable(s: GameState): GameState['businesses'] {
  return ourBusinesses(s).filter((b) => !raidedLately(s, b.id));
}

/* ------------------------------------------------------------------ */
/* When: the day and the hour (ticking clocks)                         */
/* ------------------------------------------------------------------ */

const HOURS: Record<ThreatKind, number[]> = {
  hit: [22, 23, 0, 1, 2], move: [19, 20, 21, 22], racket: [23, 0, 1, 2, 3], poach: [13, 15, 20], bribe: [12, 14, 21], setup: [6, 7, 10, 11],
  raid: [1, 2, 3, 4, 22], stakeout: [9, 11, 14, 16], wire: [8, 10, 15],
  fed_post: [9, 10, 14], fed_wire: [8, 11], fed_flip: [7, 18, 19], fed_under: [20, 21, 22], fed_gj: [9, 10],
};
/** The days a kind likes (a hit on a Friday or Saturday night when the boardwalk is loud). */
const DAYS: Partial<Record<ThreatKind, number[]>> = { hit: [4, 5, 3, 4, 5, 2], racket: [4, 5, 6, 3, 2], move: [1, 2, 3, 4, 5], raid: [1, 2, 3, 4, 5, 6] };

/** A hash roll in [0,1) (the same as roundsPersonal.roll; kept here so this low-level module stays light). */
function hroll(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

/** Give a planned move its day and hour (hashed off the seed, never the dice). Day 1-6: Monday is for the warning. */
export function stampWhen(s: GameState, t: Threat): void {
  if (t.dueDay !== undefined) return;
  const ds = DAYS[t.kind] ?? [1, 2, 3, 4, 5, 6];
  const hs = HOURS[t.kind];
  t.dueDay = ds[Math.floor(hroll(`${s.seed}|${t.id}|dd`) * ds.length) % ds.length];
  t.hour = hs[Math.floor(hroll(`${s.seed}|${t.id}|hh`) * hs.length) % hs.length];
}

/** "2 a.m.", "11 p.m.", "midnight", "noon". */
export function hourText(h: number | undefined): string {
  if (h === undefined) return '';
  if (h === 0) return 'midnight';
  if (h === 12) return 'noon';
  return h < 12 ? `${h} a.m.` : `${h - 12} p.m.`;
}

/** "Friday, 2 a.m." */
export function whenText(day: number | undefined, hour: number | undefined): string {
  if (day === undefined) return '';
  const night = hour !== undefined && (hour >= 20 || hour <= 4);
  return `${DAY_NAMES[day]}${night ? ' night' : ''}${hour !== undefined ? `, ${hourText(hour)}` : ''}`;
}

/** Has this urgent meeting come out yet on the clock? */
export function tipOut(s: GameState, t: Tip): boolean {
  return !t.rel || s.week > t.rel.w || (s.week === t.rel.w && today(s) >= t.rel.d);
}

function planRival(s: GameState, T: ThreatsState, r: Rival): Threat | undefined {
  const leader = s.characters[r.leaderId];
  const op = opinion(s, r.leaderId, s.playerId);
  const men = crew(s).filter((c) => isFree(s, c));
  const soldiers = men.filter((c) => c.rank === 'soldier' || c.rank === 'associate');
  const caps = men.filter((c) => c.rank === 'capo');
  const ground = s.districts.filter((d) => (d.influence.player ?? 0) > 8);
  const biz = ourBusinesses(s);
  const hittable = raidable(s);
  const cruel = hasTrait(leader, 'Cruel') || hasTrait(leader, 'Hot-headed') ? 1.6 : 1;
  const hate = op <= -50 ? 1.6 : op <= -20 ? 1.2 : 0.6;
  const mk = threatLean(s, r)?.kinds ?? {};
  const kind = weighted<ThreatKind>(T, [
    ['move', (ground.length ? 3 : 0) * (mk.move ?? 1)],
    ['racket', (biz.length ? 2 : 0) * (mk.racket ?? 1)],
    ['poach', (soldiers.length ? 1.5 : 0) * (mk.poach ?? 1)],
    ['bribe', (men.length ? 1.2 * (hasTrait(leader, 'Greedy') || hasTrait(leader, 'Charming') ? 1.4 : 1) : 0) * (mk.bribe ?? 1)],
    ['setup', (hittable.length ? 1 + s.heat.local / 60 : 0) * (mk.setup ?? 1)],
    ['hit', (caps.length + soldiers.length ? 0.9 : 0) * cruel * hate * (mk.hit ?? 1)],
  ]);
  if (!kind) return undefined;
  const t: Threat = { id: nid(T, 'th'), kind, by: r.id, start: s.week, due: s.week + randInt(T, 1, 3), blunt: 0 };
  switch (kind) {
    case 'move': t.district = (ground.find((d) => (d.influence[r.id] ?? 0) > 0 && chance(T, 0.6)) ?? pick(T, ground)).id; break;
    case 'racket': { const b = pick(T, biz); t.bizId = b.id; t.district = b.districtId; break; }
    case 'setup': { const b = pick(T, hittable); t.bizId = b.id; t.district = b.districtId; break; }
    case 'poach': t.targetId = soldiers.sort((a, b) => opinion(s, a.id, s.playerId) - opinion(s, b.id, s.playerId))[0].id; break;
    case 'bribe': t.targetId = pick(T, men).id; break;
    case 'hit': {
      const fam = adultFamily(s);
      const pool: [string, number][] = [
        ...caps.map((c) => [c.id, 1.5] as [string, number]),
        ...soldiers.map((c) => [c.id, 1] as [string, number]),
        ...(op <= -50 ? fam.map((c) => [c.id, 0.4] as [string, number]) : []),
        ...(op <= -70 ? [[s.playerId, 0.5] as [string, number]] : []),
      ];
      t.targetId = weighted(T, pool);
      if (!t.targetId) return undefined;
      break;
    }
    default: break;
  }
  return t;
}

/** The police's weekly chance of a move (raid, stakeout, wire) at this heat. */
export function policeChance(s: GameState): number {
  const h = s.heat.local;
  // A family under water is not worth the vice squad's time half as often (Top 10 #5c: 25–40 raid lines a year in the spiral).
  const broke = s.money < -10000 ? 0.5 : 1;
  return ((h - 25) / 150 + 0.03 * wealthPressure(s) + (isInSeason(s.date) ? 0.015 : 0)) * knobs(s).police * broke;
}

function planPolice(s: GameState, T: ThreatsState): Threat | undefined {
  const h = s.heat.local;
  if (h < 30 || active(T).some((x) => x.by === 'police')) return undefined;
  // A fat outfit gets the county's attention too (pressure.ts); in season the county is on the boards.
  if (!chance(T, policeChance(s))) return undefined;
  const biz = raidable(s);
  const kind: ThreatKind = h >= 38 && biz.length ? (chance(T, 0.6) ? 'raid' : 'stakeout') : chance(T, 0.25) ? 'wire' : 'stakeout';
  const t: Threat = { id: nid(T, 'th'), kind, by: 'police', start: s.week, due: s.week + randInt(T, 1, 2), blunt: 0 };
  if (biz.length) { const b = pick(T, biz); t.bizId = b.id; t.district = b.districtId; }
  return t;
}

/** The FBI's next move: slow, patient, and a step further each time it works. */
function planFeds(s: GameState, T: ThreatsState): Threat | undefined {
  const F = T.fed;
  if (s.week < F.next || active(T).some((x) => x.by === 'fbi')) return undefined;
  const ev = player(s).evidence ?? 0;
  // Money talks to the government too: a fat outfit draws the FBI sooner (pressure.ts).
  const fat = wealthPressure(s);
  if (F.stage === 0 && s.heat.federal < 20 && ev < 15 && fat < 0.4) { F.next = s.week + 4; return undefined; }
  const kind: ThreatKind = F.stage <= 0 ? 'fed_post' : F.stage === 1 ? 'fed_wire' : F.stage === 2 ? (chance(T, 0.5) ? 'fed_flip' : 'fed_under') : 'fed_gj';
  const t: Threat = { id: nid(T, 'th'), kind, by: 'fbi', start: s.week, due: s.week + randInt(T, 2, 4), blunt: 0 };
  const men = crew(s).filter((c) => isFree(s, c));
  if (kind === 'fed_flip' && men.length) t.targetId = [...men].sort((a, b) => opinion(s, a.id, s.playerId) - opinion(s, b.id, s.playerId))[0].id;
  if (kind === 'fed_gj') { const k = men.filter((c) => c.rank === 'capo'); if (k.length) t.targetId = pick(T, k).id; }
  if (kind === 'fed_post' || kind === 'fed_under') { const b = ourBusinesses(s); if (b.length) { const x = pick(T, b); t.bizId = x.id; t.district = x.districtId; } }
  F.next = s.week + Math.max(4, randInt(T, 7, 11) - Math.round(fat * 4));
  return t;
}

/** The street's view of a rival scheme against your people (schemes.ts), so a source can warn about it. */
function schemeThreats(s: GameState, T: ThreatsState): void {
  for (const sc of s.schemes) {
    if (sc.owner === 'player' || sc.discovered || !s.rivals.some((r) => r.id === sc.owner)) continue;
    if (T.threats.some((x) => x.schemeId === sc.id)) continue;
    const tgt = sc.targetId ? s.characters[sc.targetId] : undefined;
    if (sc.targetId && tgt?.faction !== 'player') continue;
    const kind: ThreatKind | undefined = sc.kind === 'murder' ? 'hit' : sc.kind === 'flip' ? 'bribe' : sc.kind === 'frame' ? 'setup' : sc.kind === 'claim' ? 'move' : undefined;
    if (!kind) continue;
    const weeksLeft = Math.max(1, Math.ceil((100 - sc.progress) / Math.ceil(100 / (sc.targetId === s.playerId ? 12 : 7))));
    T.threats.push({ id: nid(T, 'th'), kind, by: sc.owner as RivalId, targetId: sc.targetId, district: sc.opts.district, start: s.week, due: s.week + weeksLeft, blunt: 0, schemeId: sc.id });
  }
}

/* ------------------------------------------------------------------ */
/* Sources                                                             */
/* ------------------------------------------------------------------ */

interface Source { id: string; kind: SourceKind; name: string; role: string; loyalty: number; wits: number; charId?: string; ownedBy?: RivalId }

function sourcesOf(s: GameState): Source[] {
  const out: Source[] = [];
  const ub = seatHolder(s, 'underboss');
  const cons = seatHolder(s, 'consigliere');
  for (const c of crew(s)) {
    if (!isFree(s, c) || c.informantFor === 'law') continue;
    const district = s.districts.find((d) => d.capoId === c.id)?.name;
    const kind: SourceKind = c.id === ub?.id ? 'underboss' : c.id === cons?.id ? 'consigliere' : c.rank === 'capo' || c.rank === 'underboss' || c.rank === 'consigliere' ? 'capo' : c.outside === 'cop' ? 'cop' : c.outside === 'politician' ? 'official' : 'soldier';
    const role = kind === 'underboss' ? 'Your underboss' : kind === 'consigliere' ? 'Your consigliere' : kind === 'capo' ? `Capo${district ? ` · ${district}` : ''}` : kind === 'cop' ? 'A cop on the pad' : kind === 'official' ? 'On the pad at City Hall' : c.rank === 'soldier' ? 'Soldier' : 'Associate';
    out.push({ id: c.id, charId: c.id, kind, name: displayName(c), role, loyalty: opinion(s, c.id, s.playerId), wits: c.attributes.intrigue, ownedBy: c.informantFor && c.informantFor !== 'player' && c.informantFor !== 'none' ? c.informantFor as RivalId : undefined });
  }
  const pol = s.pol;
  if (pol) for (const [id, ctl] of Object.entries(pol.ctl)) {
    if (!ctl.payroll || ctl.flipped) continue;
    const p = pol.people[id];
    if (!p || !p.alive || p.retired) continue;
    const law = /_pd|police|sheriff|prosecutor|fbi|federal|attorney/.test(p.inst);
    out.push({ id: `pol:${id}`, kind: law ? 'cop' : 'official', name: `${p.first} ${p.last}`, role: p.title, loyalty: Math.round((ctl.financial + ctl.personal) / 2 - ctl.resentment), wits: p.competence, ownedBy: ctl.owner });
  }
  for (const e of Object.values(s.ears?.ears ?? {})) {
    const c = s.characters[e.id];
    if (!c?.alive || !e.known || e.left || e.status === 'gone') continue;
    out.push({ id: e.id, charId: e.id, kind: 'ear', name: displayName(c), role: `From the clubs · ${e.venue}`, loyalty: Math.round(e.loyalty - 50), wits: c.attributes.intrigue, ownedBy: e.sellsTo });
  }
  const STREET: Partial<Record<string, string>> = { motel: 'the night clerk at', boarding: 'the landlady at', bar: 'the bartender at', club: 'the doorman at', restaurant: 'the maître d\' at', pizza: 'the counterman at', stand: 'the boy who works', arcade: 'the change man at', laundromat: 'the woman who runs', carlot: 'the lot man at' };
  for (const b of s.businesses) {
    if (b.owner !== 'player') continue;
    const who = STREET[b.kind];
    if (!who) continue;
    out.push({ id: `biz:${b.id}`, kind: 'street', name: `${who[0].toUpperCase()}${who.slice(1)} ${b.name}`, role: 'Works one of your places', loyalty: 10, wits: 45 });
  }
  return out;
}

/**
 * Small-town discretion: how much easier a stranger (a fed in a rented room, a
 * "businessman", a lineman nobody knows) is to notice. Off-season Wildwood is a
 * few thousand people who all know each other; in July the crowds hide anybody.
 */
export function strangersStandOut(s: GameState): number {
  return isInSeason(s.date) ? 0.6 : 1.7;
}

/** Weekly chance a source hears of a threat, with how much his ear is worth. */
function hearChance(s: GameState, src: Source, t: Threat, T: ThreatsState): number {
  if (src.loyalty <= -30 || src.ownedBy === t.by) return 0;
  if (src.charId && src.charId === t.targetId && t.kind === 'hit') return 0;
  const fed = isFedKind(t.kind);
  const cops = isPoliceKind(t.kind) || t.kind === 'setup';
  const base: Record<SourceKind, number> = { underboss: 0.1, consigliere: 0.1, capo: 0.09, soldier: 0.035, cop: 0.06, official: 0.04, ear: 0.05, street: 0.025 };
  let p = base[src.kind];
  if (cops && src.kind === 'cop') p = 0.35;
  if (cops && src.kind === 'official') p = 0.1;
  if (fed) {
    p = src.kind === 'street' ? 0.08 : src.kind === 'cop' ? 0.2 : src.kind === 'official' ? 0.12 : src.kind === 'ear' ? 0.08 : p * 0.6;
    p *= strangersStandOut(s);
  }
  // Close to it: his own men, his district, the man they came to buy.
  const tgt = t.targetId ? s.characters[t.targetId] : undefined;
  if (src.charId && tgt && (tgt.capoId === src.charId || tgt.id === src.charId)) p *= tgt.id === src.charId ? (src.loyalty >= 25 ? 6 : src.loyalty >= 0 ? 2 : 0) : 2.5;
  if (src.charId && t.district && s.districts.find((d) => d.id === t.district)?.capoId === src.charId) p *= 2.5;
  if (src.id.startsWith('biz:') && t.bizId && src.id === `biz:${t.bizId}`) p *= 3;
  p *= 1 + Math.max(-0.5, Math.min(0.5, src.loyalty / 100));
  p *= 0.7 + src.wits / 150;
  p *= Math.pow(0.6, T.snubs[src.id] ?? 0);
  return Math.min(0.75, p);
}

function reliability(src: Source, t: Threat): number {
  const base: Record<SourceKind, number> = { underboss: 0.75, consigliere: 0.8, capo: 0.7, soldier: 0.55, cop: 0.7, official: 0.6, ear: 0.65, street: 0.5 };
  let q = base[src.kind] + src.loyalty / 250 + (src.wits - 45) / 200;
  if (src.kind === 'cop' && (isPoliceKind(t.kind) || t.kind === 'setup')) q += 0.15;
  return Math.max(0.25, Math.min(0.95, q));
}

/* ------------------------------------------------------------------ */
/* What they say                                                       */
/* ------------------------------------------------------------------ */

const HINTS: Record<ThreatKind, string[]> = {
  hit: ['Says it can\'t wait. Somebody\'s name came up the wrong way.', 'He won\'t say it on the phone. Something about a car seen twice on the same block.'],
  move: ['Says {by} is getting ready to do something on {district}.', 'Something\'s moving on {district}. He wants five minutes.'],
  racket: ['Says {biz} needs looking after this week.', 'Heard something about {biz}. Won\'t say more out loud.'],
  poach: ['Somebody\'s been buying drinks for one of your earners.', 'One of your guys has been sitting with the wrong people.'],
  bribe: ['There\'s money going around for one of your men.', 'Somebody\'s been offering envelopes. He wants to tell you who.'],
  setup: ['Something about {biz} and the cops. He says it\'s a set-up.', 'Somebody wants the cops to find something at {biz}.'],
  raid: ['A cop friend says the county is getting paper ready.', 'Says the detectives have {biz} written on a blackboard.'],
  stakeout: ['A car has been parked on {district} three nights running. Two men, not talking.', 'Somebody\'s been watching {biz} from across the street.'],
  wire: ['Says to stay off the phones. He\'ll tell you why in person.', 'A Bell Telephone truck where there\'s no trouble on the line.'],
  fed_post: ['A man rented a room across from {biz}. In October. Paid a month cash.', 'A stranger took a room on {district}, off-season. Nobody takes a room in October.'],
  fed_wire: ['The phone company has a work order it doesn\'t want anybody to see.', 'A lineman nobody knows was up the pole on your street.'],
  fed_flip: ['Two men in hats have been visiting one of your guys at home.', 'Somebody close to you had a long lunch with men from Newark.'],
  fed_under: ['There\'s a "businessman" at {biz} asking too many questions for a tourist.', 'A fella with New York plates says he\'s here for the fishing. He doesn\'t fish.'],
  fed_gj: ['Subpoenas are being typed in Camden. Names you know.', 'A federal grand jury is going to want to talk to your people.'],
};

function fill(s: GameState, x: string, k: { by: ThreatBy; bizId?: string; district?: string }): string {
  return x.replace('{by}', rivalName(s, k.by)).replace('{biz}', bizName(s, k.bizId)).replace('{district}', districtName(s, k.district));
}

function detailText(s: GameState, k: { kind: ThreatKind; by: ThreatBy; targetId?: string; bizId?: string; district?: string }, weeks: number): string {
  const by = rivalName(s, k.by);
  const who = personName(s, k.targetId);
  const when = weeks <= 1 ? 'this week' : `within ${weeks} weeks`;
  switch (k.kind) {
    case 'hit': return k.targetId === s.playerId ? `${by} wants you dead. Men from out of town, ${when}. They know your car.` : `${by} has given the job on ${who} to two men from out of town. ${when[0].toUpperCase()}${when.slice(1)}.`;
    case 'move': return `${by} is putting men on ${districtName(s, k.district)} ${when}: new runners on your corners, your people told to pay them.`;
    case 'racket': return `${by} is going to hit ${bizName(s, k.bizId)} ${when}: stick it up, torch it, scare the help.`;
    case 'poach': return `${by} is courting ${who}: better end, a car, a promise. He's listening.`;
    case 'bribe': return `${by} is offering ${who} an envelope to talk to them about your business.`;
    case 'setup': return `${by} is going to plant something at ${bizName(s, k.bizId)} and call the county ${when}.`;
    case 'raid': return `The county detectives have a warrant coming for ${bizName(s, k.bizId)}, ${when}.`;
    case 'stakeout': return `The county has two men watching ${k.bizId ? bizName(s, k.bizId) : districtName(s, k.district)}, writing down plates.`;
    case 'wire': return 'The county is putting a tap on a phone you use. Maybe more than one.';
    case 'fed_post': return `The FBI rented a room facing ${k.bizId ? bizName(s, k.bizId) : 'your place'}: cameras, a log of who comes and goes. They start ${when}.`;
    case 'fed_wire': return `The FBI has a federal wire going in on your phones ${when}. The phone company was told to keep its mouth shut.`;
    case 'fed_flip': return `The FBI is working on ${who}: visits at home, what he could get, what he could lose.`;
    case 'fed_under': return `The man at ${k.bizId ? bizName(s, k.bizId) : 'your place'} is a federal agent, playing a businessman down for the season. He wants an introduction.`;
    case 'fed_gj': return `A federal grand jury is sending subpoenas ${when}${k.targetId ? `, ${who} among them` : ''}.`;
  }
}

/** A garbled tip: right kind, wrong man or wrong place. */
function garble(s: GameState, T: ThreatsState, t: Threat): Pick<Tip, 'kind' | 'by' | 'targetId' | 'bizId' | 'district'> {
  const out = { kind: t.kind, by: t.by, targetId: t.targetId, bizId: t.bizId, district: t.district };
  if (t.targetId && t.targetId !== s.playerId) {
    const other = crew(s).filter((c) => isFree(s, c) && c.id !== t.targetId);
    if (other.length) out.targetId = pick(T, other).id;
  } else if (t.bizId) {
    const other = ourBusinesses(s).filter((b) => b.id !== t.bizId);
    if (other.length) { const b = pick(T, other); out.bizId = b.id; out.district = b.districtId; }
  } else if (t.district) {
    const other = s.districts.filter((d) => d.id !== t.district && (d.influence.player ?? 0) > 0);
    if (other.length) out.district = pick(T, other).id;
  } else if (typeof t.by === 'string' && t.by !== 'police' && t.by !== 'fbi') {
    const other = s.rivals.filter((r) => r.kind === 'mob' && r.id !== t.by);
    if (other.length) out.by = pick(T, other).id;
  }
  return out;
}

function makeTip(s: GameState, T: ThreatsState, src: Source, claim: Pick<Tip, 'kind' | 'by' | 'targetId' | 'bizId' | 'district'>, deadline: number, truth: TipTruth, threatId?: string, plantedBy?: RivalId): Tip {
  const hint = fill(s, pick(T, HINTS[claim.kind]), claim);
  return {
    id: nid(T, 'tip'), threatId, ...claim, sourceId: src.id, sourceKind: src.kind, sourceName: src.name, sourceRole: src.role,
    week: s.week, deadline, truth, plantedBy, hint, detail: detailText(s, claim, Math.max(1, deadline - s.week)), status: 'waiting',
  };
}

/**
 * A move already in motion when a game opens (the Old Don start), with the
 * first word of it brought by one of the boss's own sources. `threat`
 * undefined: there is nothing behind the word (a bluff, a planted tip).
 */
export function seedThreat(s: GameState, threat: Omit<Threat, 'id' | 'start' | 'blunt'> | undefined, claim: Pick<Tip, 'kind' | 'by' | 'targetId' | 'bizId' | 'district'>, sourceId: string, truth: TipTruth, deadline: number, plantedBy?: RivalId): Tip | undefined {
  const T = ensureThreats(s);
  let threatId: string | undefined;
  if (threat) {
    const t: Threat = { ...threat, id: nid(T, 'th'), start: s.week, blunt: 0 };
    stampWhen(s, t);
    T.threats.push(t);
    T.stats.planned++;
    threatId = t.id;
  }
  const srcs = sourcesOf(s);
  const src = srcs.find((x) => x.id === sourceId) ?? srcs.find((x) => x.kind === 'capo') ?? srcs[0];
  if (!src) return undefined;
  const tip = makeTip(s, T, src, claim, deadline, truth, threatId, plantedBy);
  T.tips.push(tip);
  T.stats.tips++;
  if (truth === 'false') T.stats.falseTips++;
  return tip;
}

/* ------------------------------------------------------------------ */
/* The weekly steps                                                    */
/* ------------------------------------------------------------------ */

function responseEffects(s: GameState, tip: Tip, resp: ResponseId): Effect[] {
  const L = `Urgent meeting: ${RESPONSES[resp].label}`;
  const cash = (n: number): Effect => ({ type: 'money', amount: -n, category: 'event', label: L });
  const tgt = tip.targetId ? s.characters[tip.targetId] : undefined;
  const rival = typeof tip.by === 'string' && s.rivals.some((r) => r.id === tip.by && r.kind === 'mob') ? tip.by as RivalId : undefined;
  switch (resp) {
    case 'security': return [cash(800)];
    case 'move_family': return [cash(1500), ...adultFamily(s).slice(0, 4).map((c): Effect => ({ type: 'opinion', from: c.id, to: s.playerId, amount: -3, reason: 'Packed off to the cousins in a hurry', label: L }))];
    case 'mattresses': return [cash(3500), { type: 'crewOpinion', amount: -2, reason: 'Sleeping on mattresses over a garage', label: L }, { type: 'respect', amount: 1, label: L }, { type: 'heat', bar: 'local', amount: 3, label: L }];
    case 'payoff': return [cash(tip.sourceKind === 'cop' ? 600 : 1200), { type: 'heat', bar: 'local', amount: -2, label: L }];
    case 'counter': return rival ? [cash(1500), { type: 'rivalResource', rival, muscle: -8, money: -1500, label: L }, { type: 'rivalOpinion', rival, amount: -15, reason: 'Hit us first', label: L }, { type: 'heat', bar: 'local', amount: 4, label: L }, { type: 'respect', amount: 1, label: L }] : [];
    case 'warn': return tgt?.alive ? [{ type: 'opinion', from: tgt.id, to: s.playerId, amount: 6, reason: 'The boss looked out for me', label: L }] : [];
    case 'lielow': return [cash(Math.min(2500, Math.max(600, Math.round((s.lastReport?.grossIncome ?? 6000) * 0.15)))), { type: 'heat', bar: 'local', amount: -3, label: L }, { type: 'heat', bar: 'federal', amount: -2, label: L }];
    case 'sweep': return [cash(500)];
    case 'lawyer': return [cash(2500)];
    case 'feed': return [{ type: 'heat', bar: 'federal', amount: -3, label: L }];
    case 'nothing': return [];
  }
}

/** The answers given at this week's meetings are carried out; missed and brushed-off warnings are counted. */
export function threatsAnswer(ctx: Ctx): void {
  const s = ctx.s;
  const T = s.threats;
  if (!T) return;
  for (const tip of T.tips) {
    // His man died before the meeting: nothing to miss, nobody to snub.
    if (tip.status === 'waiting' && s.characters[tip.sourceId] && !s.characters[tip.sourceId].alive) { tip.status = 'done'; continue; }
    if (tip.status === 'waiting' && tip.deadline <= s.week) {
      tip.status = 'missed';
      T.stats.ignored++;
    }
    if (tip.status === 'ignored') {
      T.snubs[tip.sourceId] = (T.snubs[tip.sourceId] ?? 0) + 1;
      tip.status = 'done';
    }
    if (tip.status !== 'met' && tip.status !== 'sent') continue;
    if (!tip.response && tip.deadline > s.week) continue;
    answerTip(ctx, T, tip);
  }
}

/** One answered meeting is carried out (at the week's turn, or the moment its threat strikes). */
function answerTip(ctx: Ctx, T: ThreatsState, tip: Tip): void {
  const s = ctx.s;
  const resp = tip.response ?? 'nothing';
  tip.status = 'done';
  if (resp === 'nothing') return;
  const via = tip.via ?? 'boss';
  applyEffects(ctx, responseEffects(s, tip, resp), { label: `Urgent meeting: ${RESPONSES[resp].label}`, because: `${RESPONSES[resp].because} on ${tip.sourceName}'s word`, category: 'event' });
  if (resp === 'warn' && tip.targetId) { const c = s.characters[tip.targetId]; if (c?.alive && c.id !== s.playerId) c.busyUntil = Math.max(c.busyUntil ?? 0, s.week + 1); }
  if (resp === 'feed' && T.fed.stage > 0 && tip.truth !== 'false') T.fed.stage = Math.max(0, T.fed.stage - 1);
  // A planted tip that sent you after the wrong crew: the planter laughs.
  if (resp === 'counter' && tip.truth === 'false' && tip.plantedBy) note(ctx, T, `Word comes back: ${rivalName(s, tip.plantedBy)} put that story in ${tip.sourceName}'s ear. You hit ${rivalName(s, tip.by)} for nothing.`);
  const t = tip.threatId ? T.threats.find((x) => x.id === tip.threatId) : undefined;
  if (!t) return;
  let eff = (EFFECT[resp as Exclude<ResponseId, 'nothing'>]?.[t.kind] ?? 0) * VIA_MULT[via] * (tip.truth === 'garbled' ? 0.6 : 1);
  if (resp === 'move_family' && t.targetId && !(t.targetId === s.playerId || isFamily(s, s.characters[t.targetId]))) eff = 0.3;
  if (resp === 'warn' && t.targetId === s.playerId) eff = 0;
  if (resp === 'counter' && tip.by !== t.by) eff = 0;
  t.blunt = 1 - (1 - t.blunt) * (1 - Math.max(0, Math.min(1, eff)));
  // A scheme the street warned you about: an answer that works ends it now.
  if (t.schemeId && eff > 0 && chance(T, t.blunt)) {
    const sc = s.schemes.find((x) => x.id === t.schemeId);
    if (sc) {
      applyEffects(ctx, [{ type: 'endScheme', schemeId: sc.id, label: 'Urgent meeting' }], { label: 'Urgent meeting', because: `stopped ${rivalName(s, t.by)}'s plot on ${tip.sourceName}'s word`, category: 'event' });
      note(ctx, T, `${rivalName(s, t.by)}'s plot against ${personName(s, t.targetId)} came to nothing: ${tip.sourceName} warned you in time.`);
      credit(ctx, T, t);
    }
    T.threats = T.threats.filter((x) => x !== t);
  }
}

function credit(ctx: Ctx, T: ThreatsState, t: Threat): void {
  const s = ctx.s;
  for (const tip of T.tips) {
    if (tip.threatId !== t.id) continue;
    const c = s.characters[tip.sourceId];
    if (c?.alive && c.faction === 'player') addOpinion(s, c.id, s.playerId, 'The boss listened to me', 6, 1);
    T.snubs[tip.sourceId] = Math.max(0, (T.snubs[tip.sourceId] ?? 0) - 1);
  }
}

function blame(ctx: Ctx, T: ThreatsState, t: Threat): void {
  const s = ctx.s;
  for (const tip of T.tips) {
    if (tip.threatId !== t.id || (tip.status !== 'done' && tip.status !== 'missed')) continue;
    if (tip.response && tip.response !== 'nothing') continue;
    const c = s.characters[tip.sourceId];
    if (c?.alive && c.faction === 'player') addOpinion(s, c.id, s.playerId, 'I warned him and he didn\'t listen', -8, 1);
  }
}

function warned(T: ThreatsState, t: Threat): boolean {
  return T.tips.some((x) => x.threatId === t.id);
}

/** The share of the time a threat comes to nothing, now: its blunting so far and the guards on a hit. */
export function foilOdds(s: GameState, t: Threat, extra = 0): number {
  const tgt = t.targetId ? s.characters[t.targetId] : undefined;
  // Guards on the target take a share off a hit (protect.ts): never all of it.
  const guard = t.kind === 'hit' && tgt ? protectionFor(s, tgt.id, t.lure ? 'night' : 'any').cut : 0;
  return 1 - (1 - t.blunt) * (1 - guard) * (1 - Math.max(0, Math.min(0.95, extra)));
}

/** A threat comes due: what is left of it after the boss's answers lands. `outcome`: already rolled (a strike in the moment). */
function land(ctx: Ctx, T: ThreatsState, t: Threat, outcome?: 'foiled' | 'landed'): void {
  const s = ctx.s;
  const by = rivalName(s, t.by);
  const r = s.rivals.find((x) => x.id === t.by);
  const tgt = t.targetId ? s.characters[t.targetId] : undefined;
  const guard = t.kind === 'hit' && tgt ? protectionFor(s, tgt.id, t.lure ? 'night' : 'any').cut : 0;
  const blunt = foilOdds(s, t);
  if (outcome === 'foiled' || (outcome === undefined && blunt > 0 && chance(T, blunt))) {
    T.stats.foiled++;
    credit(ctx, T, t);
    if (guard > 0 && tgt) protectFoiled(ctx, tgt.id, by);
    note(ctx, T, `${KIND_LABEL[t.kind]} by ${by} came to nothing: you were ready for it.`);
    if (r && r.kind === 'mob') r.money = Math.max(0, r.money - 800);
    if (t.by === 'fbi') T.fed.tries++;
    return;
  }
  T.stats.landed++;
  blame(ctx, T, t);
  const tag = warned(T, t) ? ' You were warned.' : '';
  const L = `${by}: ${KIND_LABEL[t.kind].toLowerCase()}`;
  const eff = (effects: Effect[], because: string) => applyEffects(ctx, effects.map((e) => ({ ...e, label: e.label ?? L })), { label: L, because, category: 'heat' });
  switch (t.kind) {
    case 'hit': {
      if (!tgt?.alive) return;
      if (r) addOpinion(s, s.playerId, r.leaderId, `Went after ${tgt.id === s.playerId ? 'me' : tgt.firstName}`, -20, 1);
      if (tgt.id === s.playerId && t.lure) {
        // The honey trap: he went where she asked him to. Only here, only after the warnings, can it end him.
        const her = s.characters[t.lure];
        respect(ctx, -2, `${by} came for the boss`, 'rival');
        if (chance(T, LURE_DEADLY)) {
          note(ctx, T, `Room 9 at the Starlight. ${her ? her.firstName : 'She'} never came. ${by}'s men did.${tag}`);
          killCharacter(ctx, tgt.id, `shot in a motel room on the Boulevard, set up by ${her ? `${her.firstName} ${her.lastName}` : 'a woman'} for ${by}`, r?.id);
        } else {
          tgt.health = Math.max(10, tgt.health - 30);
          note(ctx, T, `Room 9 at the Starlight. ${her ? her.firstName : 'She'} never came. ${by}'s men did, and you went out the bathroom window with a bullet in your shoulder.${tag}`);
        }
      } else if (tgt.id === s.playerId) {
        tgt.health = Math.max(10, tgt.health - 25);
        respect(ctx, -2, `${by} came for the boss`, 'rival');
        note(ctx, T, `${by}'s men came for you. You walked away; the car didn't.${tag}`);
      } else if (isFamily(s, tgt)) {
        respect(ctx, -2, `${by} came to your family's door`, 'rival');
        addOpinion(s, tgt.id, s.playerId, 'Brought his business to our door', -8, 1);
        note(ctx, T, `Shots through ${tgt.firstName}'s front window at three in the morning. Nobody hurt. ${by} wanted you to know they know the address.${tag}`);
      } else if (chance(T, 0.4) && tgt.rank !== 'capo') {
        killCharacter(ctx, tgt.id, `killed on the orders of ${by}`, r?.id);
        note(ctx, T, `${displayName(tgt)} didn't come home. They found his car out by the bay.${tag}`);
      } else {
        tgt.health = Math.max(5, tgt.health - 30);
        respect(ctx, -1, `${by} put one of yours in the hospital`, 'rival');
        note(ctx, T, `${displayName(tgt)} was jumped leaving a bar on ${districtName(s, t.district ?? s.districts.find((d) => d.capoId === tgt.capoId)?.id)}. He's at Burdette Tomlin.${tag}`);
      }
      return;
    }
    case 'move': {
      if (!t.district || !r) return;
      const lost = -shiftInfluence(s, t.district, 'player', -randInt(T, 5, 9));
      shiftInfluence(s, t.district, r.id, lost);
      respect(ctx, -1, `${by} moved on ${districtName(s, t.district)}`, 'rival');
      note(ctx, T, `${by} moved men onto ${districtName(s, t.district)}: −${lost}% of your action there.${tag}`);
      return;
    }
    case 'racket': {
      const b = s.businesses.find((x) => x.id === t.bizId && x.owner === 'player');
      if (!b) return;
      eff([{ type: 'closeBusiness', businessId: b.id, weeks: randInt(T, 1, 3) }, { type: 'heat', bar: 'local', amount: 2 }], `${by} hit ${b.name}`);
      const lost = rivalMoneyHit(ctx, randInt(T, 8, 25) * 100, L, rivalCaps(s).moneyFrac);
      note(ctx, T, `${by} hit ${b.name}${lost ? ` (${fmtMoney(lost)} gone)` : ''}. It's shut while the glass gets swept up.${tag}`);
      return;
    }
    case 'poach': {
      if (!tgt?.alive || tgt.faction !== 'player' || !r) return;
      if (hasTrait(tgt, 'Loyal-to-a-fault') || opinion(s, tgt.id, s.playerId) >= 40) { note(ctx, T, `${by} tried to buy ${displayName(tgt)}. He told them where to go.`); return; }
      defectTo(ctx, tgt, r.id, 'courted');
      note(ctx, T, `${displayName(tgt)} went over to ${by}.${tag}`, false);
      return;
    }
    case 'bribe': {
      if (!tgt?.alive || tgt.faction !== 'player' || !r) return;
      if (hasTrait(tgt, 'Loyal-to-a-fault') || hasTrait(tgt, 'Honest') || opinion(s, tgt.id, s.playerId) >= 35) { note(ctx, T, `${by} offered ${displayName(tgt)} an envelope. He brought it to you instead.`); addOpinion(s, s.playerId, tgt.id, 'Brought me their envelope', 8, 1); return; }
      tgt.informantFor = r.id;
      s.secrets.push({ id: `x${s.nextId++}`, ownerId: tgt.id, kind: 'informant', text: `${tgt.firstName} ${tgt.lastName} informs for ${r.shortName}`, knownBy: [r.id], week: s.week });
      ctx.log.push(`(Unknown to you, ${by} has a man inside your crew now.)`);
      return;
    }
    case 'setup': case 'raid': {
      const b = s.businesses.find((x) => x.id === t.bizId && x.owner === 'player');
      noteRaided(s, t.bizId);
      if (t.heatRaid) {
        // The heat's own raid (heat.ts): a bigger padlock, the cash in the back room, the photos in the paper.
        const weeks = randInt(T, 3, 5);
        const effects: Effect[] = [{ type: 'heat', bar: 'local', amount: -18 }, { type: 'respect', amount: -2 }];
        if (b) effects.push({ type: 'closeBusiness', businessId: b.id, weeks });
        const seized = Math.min(Math.max(0, s.money), Math.round(b ? b.weeklyBase * 2 : 1500));
        if (seized > 0) effects.push({ type: 'money', amount: -seized, category: 'heat', label: `RAID: cash seized at ${bizName(s, t.bizId)}` });
        eff(effects, 'the heat brought a raid');
        note(ctx, T, `RAID: County detectives came through the door of ${bizName(s, t.bizId)} at ${hourText(t.hour ?? 2)} and padlocked it for ${weeks} weeks${seized > 0 ? `, with ${fmtMoney(seized)} from the back room` : ''}.${tag}`);
        return;
      }
      const fall = crew(s).filter((c) => isFree(s, c) && (c.rank === 'soldier' || c.rank === 'associate'));
      const effects: Effect[] = [{ type: 'heat', bar: 'local', amount: t.kind === 'setup' ? 6 : -8 }, { type: 'respect', amount: -1 }];
      if (b) effects.push({ type: 'closeBusiness', businessId: b.id, weeks: randInt(T, 2, 4) });
      if (fall.length && chance(T, t.kind === 'setup' ? 0.4 : 0.25)) {
        const v = pick(T, fall);
        effects.push({ type: 'evidence', charId: v.id, amount: 10 }, { type: 'imprison', charId: v.id, weeks: randInt(T, 6, 20) });
      }
      eff(effects, t.kind === 'setup' ? `${by} set you up` : 'the county raided you');
      note(ctx, T, t.kind === 'setup' ? `County detectives "found" a gun and a ledger at ${bizName(s, t.bizId)}. Somebody put them there. ${by}.${tag}` : `RAID: County detectives padlocked ${bizName(s, t.bizId)}.${tag}`);
      return;
    }
    case 'stakeout': case 'wire': {
      const k = t.district ? s.districts.find((d) => d.id === t.district)?.capoId : undefined;
      eff([{ type: 'evidence', charId: k ?? s.playerId, amount: 8 }, { type: 'heat', bar: 'local', amount: 4 }, ...(t.kind === 'wire' ? [{ type: 'evidence', charId: s.playerId, amount: 6 } as Effect] : [])], t.kind === 'wire' ? 'the county tapped your phones' : 'the county watched your place');
      if (t.kind === 'wire') wireIn(s, 'county');
      note(ctx, T, t.kind === 'wire' ? `The county had a tap on your phone for two weeks. They have hours of you on tape.${tag}` : `The county watched ${t.bizId ? bizName(s, t.bizId) : districtName(s, t.district)} for a week. They have plates, faces, times.${tag}`);
      return;
    }
    case 'fed_post': case 'fed_wire': case 'fed_under': case 'fed_flip': case 'fed_gj': {
      T.fed.stage = Math.min(3, T.fed.stage + 1);
      T.fed.tries = 0;
      // The grand jury sits for a while: the next push comes months later (and goes back to men inside).
      if (t.kind === 'fed_gj') { T.fed.stage = 2; T.fed.next = Math.max(T.fed.next, s.week + randInt(T, 16, 24)); }
      const effects: Effect[] = [];
      if (t.kind === 'fed_post') effects.push({ type: 'evidence', charId: s.playerId, amount: 5 }, { type: 'heat', bar: 'federal', amount: 4 });
      if (t.kind === 'fed_wire') effects.push({ type: 'evidence', charId: s.playerId, amount: 10 }, { type: 'heat', bar: 'federal', amount: 6 });
      if (t.kind === 'fed_wire') wireIn(s, 'fbi');
      if (t.kind === 'fed_under') { effects.push({ type: 'evidence', charId: s.playerId, amount: 6 }, { type: 'heat', bar: 'federal', amount: 5 }); const k = crew(s).find((c) => c.rank === 'capo' && isFree(s, c)); if (k) effects.push({ type: 'evidence', charId: k.id, amount: 10 }); }
      if (t.kind === 'fed_flip') effects.push({ type: 'heat', bar: 'federal', amount: 3 });
      if (t.kind === 'fed_gj') { effects.push({ type: 'evidence', charId: s.playerId, amount: 8 }, { type: 'heat', bar: 'federal', amount: 3 }); if (tgt?.alive) effects.push({ type: 'evidence', charId: tgt.id, amount: 6 }, { type: 'opinion', from: tgt.id, to: s.playerId, amount: -5, reason: 'Hauled in front of a grand jury', label: L }); }
      eff(effects, 'the FBI set up on you');
      if (t.kind === 'fed_flip' && tgt?.alive && tgt.faction === 'player' && !hasTrait(tgt, 'Loyal-to-a-fault') && opinion(s, tgt.id, s.playerId) < 30 && !s.flags.informant) {
        s.flags.informant = Number(tgt.id.replace(/\D/g, '')) || 0;
        ctx.log.push('(Unknown to you, one of your men has started talking to the FBI.)');
      }
      note(ctx, T, ({
        fed_post: `The FBI has a man at a window across from ${bizName(s, t.bizId)}, logging every car.`,
        fed_wire: 'There is a federal wire on your phones. Everything you said this week is in Newark.',
        fed_under: `The "businessman" at ${bizName(s, t.bizId)} got his introduction. He's been buying rounds for your people.`,
        fed_flip: `The FBI kept visiting ${personName(s, t.targetId)} at home. Nobody knows what he told them.`,
        fed_gj: `Subpoenas served. ${t.targetId ? `${personName(s, t.targetId)} spent a day in Camden in front of a grand jury.` : 'Your people are in Camden in front of a grand jury.'}`,
      } as Record<string, string>)[t.kind] + tag);
      return;
    }
  }
}

/** When a honey trap is not stopped: the share of the time it kills the boss (the rest, a bullet in the shoulder). */
export const LURE_DEADLY = 0.4;

/**
 * A honey trap (honey.ts): a rival family sets the boss up through a woman.
 * It is an ordinary hit on the boss in this pipeline (the answers at the
 * urgent meeting blunt it, his guards take their share when it lands), with
 * one difference: it waits where she asked him to meet her, and it can kill
 * him. It never comes without a warning: somebody always asks for an urgent
 * meeting about it (the night man at the motel, a guard, a woman from the
 * clubs). `caution` (0-1) is what the boss's own care already took off it.
 */
export function planLure(s: GameState, by: RivalId, womanId: string, caution = 0): Threat | undefined {
  const T = ensureThreats(s);
  if (T.threats.some((x) => x.lure === womanId)) return undefined;
  const boss = player(s);
  const blunt = Math.max(0, Math.min(0.9, caution + (hasTrait(boss, 'Paranoid') ? 0.35 : 0)));
  const t: Threat = { id: nid(T, 'th'), kind: 'hit', by, targetId: s.playerId, start: s.week, due: s.week + 1, blunt, lure: womanId };
  stampWhen(s, t);
  T.threats.push(t);
  T.stats.planned++;
  const srcs = sourcesOf(s).filter((x) => x.ownedBy !== by && x.loyalty > -30);
  const src = srcs.find((x) => x.kind === 'street' && /motel|night clerk/i.test(x.name)) ?? srcs.find((x) => x.kind === 'ear') ?? srcs.find((x) => x.kind === 'consigliere' || x.kind === 'underboss') ?? srcs[0];
  const her = s.characters[womanId];
  const solid = chance(T, src ? reliability(src, t) : 0.5);
  const tip = makeTip(s, T, src ?? { id: 'street:starlight', kind: 'street', name: 'The night clerk at the Starlight', role: 'Owes you a favor', loyalty: 10, wits: 45 }, { kind: 'hit', by: solid ? by : t.by, targetId: s.playerId }, t.due, solid ? 'solid' : 'garbled', t.id);
  tip.hint = `Two men from out of town took the room next to number 9 at the Starlight. They asked if a lady${her ? ` called ${her.firstName}` : ''} had checked in.`;
  tip.detail = `${rivalName(s, by)} has men waiting where ${her ? her.firstName : 'the woman'} asked you to meet her. If you go, you go into their room. Lie low, double the security, or move the family: and stay away from the Starlight.`;
  T.tips.push(tip);
  T.stats.tips++;
  return t;
}

/** The chance a planned honey trap lands, now (its blunting so far, and the boss's guards at night). */
export function lureOdds(s: GameState, t: Threat): number {
  const guard = protectionFor(s, s.playerId, 'night').cut;
  return (1 - t.blunt) * (1 - guard);
}

/** She called it off, or he never went: the honey trap comes to nothing (and its warning with it). */
export function dropLure(s: GameState, womanId: string): boolean {
  const T = s.threats;
  if (!T) return false;
  const t = T.threats.find((x) => x.lure === womanId);
  if (!t) return false;
  T.threats = T.threats.filter((x) => x !== t);
  for (const tip of T.tips) if (tip.threatId === t.id && tip.status === 'waiting') tip.status = 'done';
  return true;
}

/** Planted and garbled talk: a rival with wits puts a story in an ear he owns; a bar rumor grows legs. */
function falseTips(s: GameState, T: ThreatsState, srcs: Source[], out: Tip[]): void {
  for (const r of s.rivals) {
    if (r.kind !== 'mob') continue;
    const L = s.characters[r.leaderId];
    if (!L?.alive) continue;
    const sly = L.attributes.intrigue >= 60 || hasTrait(L, 'Charming') || hasTrait(L, 'Paranoid');
    if (!sly || !chance(T, 0.035 * rivalCapacity(s, r))) continue;
    const ears = srcs.filter((x) => x.ownedBy === r.id);
    const src = ears.length ? pick(T, ears) : srcs.filter((x) => x.kind === 'street' || x.kind === 'soldier')[0];
    if (!src) continue;
    const others = s.rivals.filter((x) => x.kind === 'mob' && x.id !== r.id);
    const biz = ourBusinesses(s);
    const claim = chance(T, 0.5) && others.length
      ? { kind: 'hit' as ThreatKind, by: pick(T, others).id, targetId: (crew(s).find((c) => c.rank === 'capo' && isFree(s, c)) ?? player(s)).id }
      : { kind: 'raid' as ThreatKind, by: 'police' as ThreatBy, ...(biz.length ? { bizId: pick(T, biz).id } : {}) };
    out.push(makeTip(s, T, src, claim, s.week + randInt(T, 1, 2), 'false', undefined, r.id));
  }
  // Barroom talk.
  const loose = srcs.filter((x) => x.kind === 'soldier' || x.kind === 'street' || x.kind === 'ear');
  if (loose.length >= 2 && chance(T, 0.03)) {
    const src = pick(T, loose);
    const mob = s.rivals.filter((r) => r.kind === 'mob');
    const ground = s.districts.filter((d) => (d.influence.player ?? 0) > 8);
    if (mob.length && ground.length) out.push(makeTip(s, T, src, { kind: 'move', by: pick(T, mob).id, district: pick(T, ground).id }, s.week + randInt(T, 1, 2), 'false'));
  }
}

/**
 * The week of the other side: due threats land, rivals, cops and the FBI
 * plan new ones, and the people who hear things ask for urgent meetings.
 * Runs after the rivals' own moves (rivals.ts) and before the heat settles.
 */
export function threatsWeek(ctx: Ctx): void {
  const s = ctx.s;
  if (s.gameOver) return;
  const T = ensureThreats(s);
  // 1. What comes due lands.
  for (const t of [...T.threats]) {
    if (t.schemeId) {
      if (!s.schemes.some((x) => x.id === t.schemeId && !x.discovered)) T.threats = T.threats.filter((x) => x !== t);
      continue;
    }
    if (t.due > s.week) continue;
    T.threats = T.threats.filter((x) => x !== t);
    if (s.gameOver) break;
    land(ctx, T, t);
  }
  if (s.gameOver) return;
  // 2. New plans.
  const planned: Threat[] = [];
  const room = () => MAX_ACTIVE - T.threats.filter((x) => !x.schemeId).length - planned.length;
  for (const r of s.rivals) {
    if (room() <= 0) break;
    if (r.kind !== 'mob' || T.threats.some((x) => x.by === r.id && !x.schemeId)) continue;
    // A man in the ranks is no family's target (B3): only now and then does a rival crew lean on him.
    if (spareFromWars(s) && !chance(T, 0.25)) continue;
    if (!chance(T, aggression(s, r).chance)) continue;
    const t = planRival(s, T, r);
    if (t) { planned.push(t); noteThreatPlan(s, r, t.kind, t.targetId); }
  }
  if (s.week >= GRACE_WEEKS && room() > 0) { const t = planPolice(s, T); if (t) planned.push(t); }
  if (room() > 0) { const t = planFeds(s, T); if (t) planned.push(t); }
  for (const t of planned) stampWhen(s, t);
  T.threats.push(...planned);
  T.stats.planned += planned.length;
  schemeThreats(s, T);
  // 3. Who hears what.
  const srcs = sourcesOf(s);
  const fresh: Tip[] = [];
  for (const t of T.threats) {
    if (fresh.length >= TIPS_PER_WEEK) break;
    const already = T.tips.filter((x) => x.threatId === t.id);
    if (already.length >= TIPS_PER_THREAT || already.some((x) => x.week === s.week)) continue;
    for (const src of srcs) {
      if (already.some((x) => x.sourceId === src.id)) continue;
      if (!chance(T, hearChance(s, src, t, T))) continue;
      const solid = chance(T, reliability(src, t));
      const claim = solid ? { kind: t.kind, by: t.by, targetId: t.targetId, bizId: t.bizId, district: t.district } : garble(s, T, t);
      fresh.push(makeTip(s, T, src, claim, t.due, solid ? 'solid' : 'garbled', t.id));
      break;
    }
  }
  if (s.week >= GRACE_WEEKS) falseTips(s, T, srcs, fresh);
  let k = 0;
  for (const tip of fresh.slice(0, TIPS_PER_WEEK + 1)) {
    // The meetings come out on the days of the week (never after the thing they warn of).
    const th = tip.threatId ? T.threats.find((x) => x.id === tip.threatId) : undefined;
    if (th?.dueDay !== undefined) {
      const off = tip.truth === 'garbled' ? (hroll(`${s.seed}|${tip.id}|off`) < 0.5 ? -1 : 1) : 0;
      tip.dueDay = Math.max(1, Math.min(6, th.dueDay + off));
      tip.hour = th.hour;
    } else if (!th) {
      // Talk with nothing behind it still names a night.
      const hs = HOURS[tip.kind];
      tip.dueDay = 1 + (Math.floor(hroll(`${s.seed}|${tip.id}|fd`) * 6) % 6);
      tip.hour = hs[Math.floor(hroll(`${s.seed}|${tip.id}|fh`) * hs.length) % hs.length];
    }
    const last = th && th.due === s.week + 1 && th.dueDay !== undefined ? th.dueDay - 1 : 4;
    // Staggered over Monday … Thursday (never on or after the night it warns of).
    const d = Math.min(last, (Math.floor(hroll(`${s.seed}|${tip.id}|rel`) * 4) + k++) % 4);
    tip.rel = { w: s.week + 1, d: Math.max(0, d) };
    T.tips.push(tip);
    T.stats.tips++;
    if (tip.truth === 'false') T.stats.falseTips++;
    ctx.log.push(`${tip.sourceName} (${tip.sourceRole}) asks for an urgent meeting.`);
  }
  // 4. Housekeeping: old tips go.
  T.tips = T.tips.filter((x) => (x.status !== 'done' && x.status !== 'missed') || x.week >= s.week - 8).slice(-24);
}

/* ------------------------------------------------------------------ */
/* The meeting (pure transforms for the screens)                       */
/* ------------------------------------------------------------------ */

export const RESPONSES: Record<ResponseId, { label: string; hint: string; because: string }> = {
  security: { label: 'Double the security', hint: '−$800 · men on the door, a car on the corner', because: 'doubled the security' },
  move_family: { label: 'Move the family', hint: '−$1,500 · the family goes to the cousins for a while', because: 'moved the family out of the house' },
  mattresses: { label: 'Go to the mattresses', hint: '−$3,500 · crew −2 · respect +1 · local heat +3', because: 'went to the mattresses' },
  payoff: { label: 'Pay off the cop', hint: '−$1,200 (−$600 through your own man) · local heat −2', because: 'paid off the cops' },
  counter: { label: 'Hit them first', hint: '−$1,500 · their muscle −8 · local heat +4 · respect +1', because: 'struck first' },
  warn: { label: 'Warn the man', hint: 'free · he lies low a week and remembers you looked out for him', because: 'warned the man' },
  lielow: { label: 'Lie low', hint: 'a slow week (−15% of the take) · local −3 · federal −2', because: 'went quiet for a week' },
  sweep: { label: 'Sweep the phones', hint: '−$500 · a man from the phone company who owes you', because: 'had the phones swept' },
  lawyer: { label: 'Get the lawyers ready', hint: '−$2,500 · the men go in coached', because: 'got the lawyers ready' },
  feed: { label: 'Feed them garbage', hint: 'free · only in person · they chase ghosts · federal −3', because: 'fed the feds a story' },
  nothing: { label: 'Do nothing', hint: 'Thank him and let it ride', because: 'let it ride' },
};

/** The answers that fit what he says is coming. */
export function responsesFor(s: GameState, tip: Tip): ResponseId[] {
  const tgt = tip.targetId ? s.characters[tip.targetId] : undefined;
  const mob = typeof tip.by === 'string' && s.rivals.some((r) => r.id === tip.by && r.kind === 'mob');
  const out: ResponseId[] = [];
  switch (tip.kind) {
    case 'hit':
      out.push('security');
      if (tip.targetId === s.playerId || (tgt && isFamily(s, tgt))) out.push('move_family');
      out.push('mattresses');
      if (tgt && tgt.id !== s.playerId) out.push('warn');
      if (mob) out.push('counter');
      break;
    case 'move': case 'racket': out.push('counter', 'security', 'mattresses'); break;
    case 'poach': case 'bribe': out.push('warn', 'counter'); break;
    case 'setup': out.push('payoff', 'lielow', 'security'); if (mob) out.push('counter'); break;
    case 'raid': case 'stakeout': out.push('payoff', 'lielow'); break;
    case 'wire': out.push('sweep', 'payoff', 'lielow'); if (tip.via === 'boss') out.push('feed'); break;
    case 'fed_post': case 'fed_under': out.push('lielow'); if (tip.via === 'boss') out.push('feed'); break;
    case 'fed_wire': out.push('sweep'); if (tip.via === 'boss') out.push('feed'); break;
    case 'fed_flip': out.push('warn', 'lawyer', 'lielow'); break;
    case 'fed_gj': out.push('lawyer', 'lielow'); break;
  }
  out.push('nothing');
  return out;
}

function withTip(s: GameState, id: string, f: (t: Tip) => Tip | undefined): GameState {
  const T = s.threats;
  if (!T) return s;
  const i = T.tips.findIndex((x) => x.id === id);
  if (i < 0) return s;
  const next = f({ ...T.tips[i] });
  if (!next) return s;
  const tips = T.tips.slice();
  tips[i] = next;
  return { ...s, threats: { ...T, tips } };
}

/** Why the boss can't take the meeting himself right now (undefined: he can). */
export function meetBlock(s: GameState): string | undefined {
  const why = awayReason(s, today(s));
  return why ? `${why}: send someone` : undefined;
}

/** What the man who takes the meeting makes of it: deterministic, from his wits and the truth. */
function readOf(s: GameState, tip: Tip, via: MeetVia): string {
  const man = via === 'boss' ? player(s) : seatHolder(s, via);
  const wits = man?.attributes.intrigue ?? 40;
  const bonus = via === 'consigliere' ? 0.15 : via === 'boss' ? 0.05 : 0;
  const p = Math.max(0.15, Math.min(0.92, 0.25 + (wits - 30) / 100 + bonus));
  const roll = hashSeed(`${tip.id}:${via}`) / 4294967296;
  const who = via === 'boss' ? 'You' : man ? man.firstName : 'He';
  if (roll >= p) return `${who === 'You' ? 'You can\'t' : `${who} can't`} tell. ${tip.sourceName} believes it, that much is sure.`;
  if (tip.truth === 'solid') return `${who === 'You' ? 'You' : who} believe${who === 'You' ? '' : 's'} him. It hangs together.`;
  if (tip.truth === 'garbled') return `${who === 'You' ? 'Something' : `${who} thinks something`} is true in it, but he has pieces wrong: the who or the where.`;
  return tip.plantedBy ? `It smells planted. Somebody wanted you to hear this${via !== 'underboss' ? `: ${rivalName(s, tip.plantedBy)}, maybe` : ''}.` : 'Barroom talk. Nothing behind it.';
}

/** Take the meeting: yourself, or send the underboss or consigliere. Reveals what he heard. */
export function meetTip(s: GameState, id: string, via: MeetVia, phone = false): GameState {
  if (via === 'boss' && !phone && meetBlock(s)) return s;
  if (via !== 'boss' && !seatHolder(s, via)) return s;
  return withTip(s, id, (t) => {
    if (t.status !== 'waiting') return undefined;
    return { ...t, status: via === 'boss' ? 'met' : 'sent', via, seen: true, read: readOf(s, t, via), ...(via === 'boss' ? { metDay: today(s) } : {}) };
  });
}

/** Choose the answer (carried out when the week turns). */
export function respondTip(s: GameState, id: string, response: ResponseId): GameState {
  return withTip(s, id, (t) => {
    if (t.status !== 'met' && t.status !== 'sent') return undefined;
    if (!responsesFor(s, t).includes(response)) return undefined;
    return { ...t, response };
  });
}

/** Brush him off. */
export function ignoreTip(s: GameState, id: string): GameState {
  return withTip(s, id, (t) => (t.status === 'waiting' ? { ...t, status: 'ignored', seen: true } : undefined));
}

/** The arrival popup was shown. */
export function markTipsSeen(s: GameState, ids: readonly string[]): GameState {
  const T = s.threats;
  if (!T || !ids.length) return s;
  return { ...s, threats: { ...T, tips: T.tips.map((t) => (ids.includes(t.id) ? { ...t, seen: true } : t)) } };
}

export interface UrgentView {
  id: string;
  who: string;
  role: string;
  sourceId: string;
  /** A character sheet to open, if he is one. */
  charId?: string;
  hint: string;
  detail?: string;
  read?: string;
  deadline: number;
  /** "This week" / "2 weeks". */
  when: string;
  status: TipStatus;
  via?: MeetVia;
  response?: ResponseId;
  canMeet?: string;
  underboss?: string;
  consigliere?: string;
  responses: { id: ResponseId; label: string; hint: string }[];
  seen: boolean;
}

/** The urgent meetings still open this week (newest first). */
export function urgentMeetings(s: GameState): UrgentView[] {
  const T = s.threats;
  if (!T) return [];
  const ub = seatHolder(s, 'underboss');
  const cons = seatHolder(s, 'consigliere');
  const block = meetBlock(s);
  // A dead man asks for no meetings: his request is dropped at his death (the playthrough met Raymond after his funeral).
  const gone = (t: Tip) => { const c = s.characters[t.sourceId]; return !!c && !c.alive; };
  return T.tips.filter((t) => (t.status === 'waiting' || t.status === 'met' || t.status === 'sent') && tipOut(s, t) && !(t.status === 'waiting' && gone(t))).map((t) => {
    const left = t.deadline - s.week;
    const open = t.status !== 'waiting';
    return {
      id: t.id, who: t.sourceName, role: t.sourceRole, sourceId: t.sourceId, charId: s.characters[t.sourceId] ? t.sourceId : undefined,
      hint: t.hint, detail: open ? t.detail : undefined, read: open ? t.read : undefined,
      deadline: t.deadline, when: left <= 0 && t.dueDay !== undefined ? whenText(t.dueDay, t.hour) : left <= 0 ? 'This week' : left === 1 ? 'By next week' : `Within ${left} weeks`,
      status: t.status, via: t.via, response: t.response,
      canMeet: block, underboss: ub ? displayName(ub) : undefined, consigliere: cons ? displayName(cons) : undefined,
      responses: open ? responsesFor(s, t).map((r) => ({ id: r, label: RESPONSES[r].label, hint: RESPONSES[r].hint })) : [],
      seen: !!t.seen,
    };
  }).reverse();
}

/** Meetings that still want the boss: not yet taken, or taken with no answer chosen. */
export function urgentCount(s: GameState): number {
  return urgentMeetings(s).filter((u) => u.status === 'waiting' || !u.response).length;
}

/** Ids of urgent meetings that have not had their arrival popup. */
export function unseenUrgent(s: GameState): string[] {
  return urgentMeetings(s).filter((u) => !u.seen && u.status === 'waiting').map((u) => u.id);
}


/* ------------------------------------------------------------------ */
/* Ticking clocks: a threat lands on its day, at its hour               */
/* ------------------------------------------------------------------ */

export type StrikeOptId = 'fight' | 'duck' | 'tipoff' | 'clean' | 'quiet' | 'ride';
export interface StrikeOption {
  id: StrikeOptId;
  label: string;
  hint: string;
  /** 0-1: the chance it comes to nothing if he answers this way. */
  odds: number;
  blocked?: string;
}
export interface StrikeView {
  id: string;
  kind: ThreatKind;
  title: string;
  text: string;
  when: string;
  /** He was warned (an urgent meeting about it). */
  warned: boolean;
  options: StrikeOption[];
  def: StrikeOptId;
}

interface OptSpec { id: StrikeOptId; label: string; hint: string; bonus: number; cost: Effect[]; win?: Effect[]; blocked?: string }

/** A strike worth stopping the clock for: he was warned, or it comes at his people or his doors. */
export function strikeWorthy(s: GameState, t: Threat): boolean {
  const T = s.threats;
  return (!!T && warned(T, t)) || t.kind === 'hit' || t.kind === 'raid' || t.kind === 'setup' || t.kind === 'racket';
}

function strikeSpecs(s: GameState, t: Threat): OptSpec[] {
  const r = s.rivals.find((x) => x.id === t.by && x.kind === 'mob');
  const mine = Math.max(5, strengthTotal(s));
  const muscle = r ? Math.max(0, Math.min(1, mine / (mine + Math.max(5, r.muscle)))) : 0.5;
  const L = `${rivalName(s, t.by)}: ${KIND_LABEL[t.kind].toLowerCase()}`;
  const cash = (n: number, why: string): Effect => ({ type: 'money', amount: -n, category: 'event', label: why });
  const capo = t.district ? s.districts.find((d) => d.id === t.district)?.capoId : undefined;
  const capoName = capo && s.characters[capo]?.alive ? s.characters[capo].firstName : undefined;
  const ride: OptSpec = { id: 'ride', label: capoName && r ? `Leave it to ${capoName}` : 'Let your people handle it', hint: capoName && r ? 'his street, his call · free' : 'free', bonus: capoName && r ? 0.08 : 0, cost: [] };
  const take = Math.max(200, Math.round((s.lastReport?.grossIncome ?? 4000) * 0.06 / 50) * 50);
  if (t.by === 'police') {
    const pay = Math.round(600 + s.heat.local * 12);
    return [
      { id: 'tipoff', label: 'Call the sergeant on the pad', hint: `−$${pay.toLocaleString('en-US')} · he loses the warrant for an hour`, bonus: 0.5, cost: [cash(pay, 'An envelope for the sergeant, at an ungodly hour')], blocked: s.money < pay ? `Needs $${pay.toLocaleString('en-US')}` : undefined },
      { id: 'clean', label: 'Get the books and the guns out the back', hint: `−$${take.toLocaleString('en-US')} (a night's take) · local heat −1`, bonus: 0.3, cost: [cash(take, 'Closed early, the back room emptied'), { type: 'heat', bar: 'local', amount: -1, label: L }] },
      ride,
    ];
  }
  if (t.by === 'fbi') {
    return [
      { id: 'quiet', label: 'Kill the phones, cancel every meet', hint: `−$${take.toLocaleString('en-US')} (a dead day) · federal −1`, bonus: 0.35, cost: [cash(take, 'A dead day: no phones, no meets'), { type: 'heat', bar: 'federal', amount: -1, label: L }] },
      ride,
    ];
  }
  const out: OptSpec[] = [];
  if (t.kind === 'setup') {
    const pay = Math.round(800 + s.heat.local * 10);
    out.push({ id: 'clean', label: 'Toss the place before the county does', hint: '−$300 · two men tear it apart looking for what was planted', bonus: 0.4, cost: [cash(300, 'Tossed the place before the county came')] });
    out.push({ id: 'tipoff', label: 'Call the sergeant on the pad', hint: `−$${pay.toLocaleString('en-US')} · the warrant gets lost`, bonus: 0.45, cost: [cash(pay, 'An envelope for the sergeant')], blocked: s.money < pay ? `Needs $${pay.toLocaleString('en-US')}` : undefined });
    out.push(ride);
    return out;
  }
  if (r && (t.kind === 'hit' || t.kind === 'move' || t.kind === 'racket')) {
    const fightBonus = Math.round((0.2 + 0.35 * muscle) * 100) / 100;
    out.push({
      id: 'fight', label: t.kind === 'hit' && t.targetId === s.playerId ? 'Shoot your way out' : t.kind === 'hit' ? 'Send the crew to meet them' : t.kind === 'move' ? 'Put men on the corner, tonight' : 'Men to the door, now',
      hint: `local heat +3 · if it works: respect +1, ${r.shortName} muscle −4`, bonus: fightBonus,
      cost: [{ type: 'heat', bar: 'local', amount: 3, label: L }],
      win: [{ type: 'respect', amount: 1, label: `Beat off ${r.shortName}` }, { type: 'rivalResource', rival: r.id as RivalId, muscle: -4, label: `Beat off ${r.shortName}` }],
    });
  }
  if (t.kind === 'hit') out.push({ id: 'duck', label: t.targetId === s.playerId ? 'Out the back, into the car' : 'Get word to him: out the back', hint: t.targetId === s.playerId ? 'respect −1 · the street hears you ran' : '−$300 · a car and a driver', bonus: 0.3, cost: t.targetId === s.playerId ? [{ type: 'respect', amount: -1, label: 'The boss went out the back' }] : [cash(300, 'A car and a driver, fast')] });
  if (t.kind === 'racket') out.push({ id: 'duck', label: 'Clear the till and close early', hint: `−$${take.toLocaleString('en-US')} (a night's take)`, bonus: 0.25, cost: [cash(take, 'Closed early, the till cleared')] });
  out.push(ride);
  return out;
}

function strikeTitle(s: GameState, t: Threat): string {
  const by = rivalName(s, t.by);
  switch (t.kind) {
    case 'hit': return t.targetId === s.playerId ? `${by}'s men are outside` : `${by} is going after ${personName(s, t.targetId)}`;
    case 'move': return `${by}'s men on ${districtName(s, t.district)}`;
    case 'racket': return `${by} at the door of ${bizName(s, t.bizId)}`;
    case 'setup': return `Something planted at ${bizName(s, t.bizId)}`;
    case 'raid': return `RAID: a warrant for ${bizName(s, t.bizId)}`;
    case 'stakeout': return 'A car with two men in it, again';
    case 'wire': return 'A lineman at the wrong pole';
    default: return `${KIND_LABEL[t.kind]}: it's happening`;
  }
}

function strikeText(s: GameState, t: Threat): string {
  const by = rivalName(s, t.by);
  switch (t.kind) {
    case 'hit': return t.targetId === s.playerId ? `Two cars with their lights off, one at each end of the block. The man on your door says they have been sitting there twenty minutes. ${by}.` : `A phone call: two men from out of town are waiting outside the bar where ${personName(s, t.targetId)} drinks. ${by} sent them.`;
    case 'move': return `${by}'s runners are on ${districtName(s, t.district)} tonight, telling your people who they pay now.`;
    case 'racket': return `A car has gone past ${bizName(s, t.bizId)} three times. There's a can of gasoline in the back seat. ${by}.`;
    case 'setup': return `The kid who sweeps up at ${bizName(s, t.bizId)} saw a man leave a package behind the bar. Ten minutes later somebody called the county.`;
    case 'raid': return `The sergeant's brother-in-law calls: the county has a warrant for ${bizName(s, t.bizId)}, and the cars are already rolling.`;
    case 'stakeout': return `The same Plymouth is parked across from ${t.bizId ? bizName(s, t.bizId) : districtName(s, t.district)} for the third day, two men eating sandwiches.`;
    case 'wire': return 'A man from the phone company is up a pole outside your place, and he is not from the phone company.';
    default: return `${detailText(s, t, 1)}`;
  }
}

/** The moves striking today, waiting on the boss (live). */
export function liveStrikes(s: GameState): Threat[] {
  return (s.threats?.threats ?? []).filter((t) => t.live);
}

export function strikeView(s: GameState, id: string): StrikeView | undefined {
  const T = s.threats;
  const t = T?.threats.find((x) => x.id === id);
  if (!T || !t) return undefined;
  const pend = pendingBlunt(s, T, t);
  const tt = { ...t, blunt: pend };
  const options = strikeSpecs(s, t).map((o) => ({ id: o.id, label: o.label, hint: o.hint, odds: Math.round(foilOdds(s, tt, o.bonus) * 100) / 100, ...(o.blocked ? { blocked: o.blocked } : {}) }));
  return { id, kind: t.kind, title: strikeTitle(s, t), text: strikeText(s, t), when: whenText(t.dueDay, t.hour), warned: warned(T, t), options, def: 'ride' };
}

/** The blunting a threat will have once the answers already given at the meetings are carried out (for the odds on the card). */
function pendingBlunt(s: GameState, T: ThreatsState, t: Threat): number {
  let b = t.blunt;
  for (const tip of T.tips) {
    if (tip.threatId !== t.id || (tip.status !== 'met' && tip.status !== 'sent') || !tip.response || tip.response === 'nothing') continue;
    let eff = (EFFECT[tip.response as Exclude<ResponseId, 'nothing'>]?.[t.kind] ?? 0) * VIA_MULT[tip.via ?? 'boss'] * (tip.truth === 'garbled' ? 0.6 : 1);
    if (tip.response === 'move_family' && t.targetId && !(t.targetId === s.playerId || isFamily(s, s.characters[t.targetId]))) eff = 0.3;
    if (tip.response === 'warn' && t.targetId === s.playerId) eff = 0;
    if (tip.response === 'counter' && tip.by !== t.by) eff = 0;
    b = 1 - (1 - b) * (1 - Math.max(0, Math.min(1, eff)));
  }
  return b;
}

/** Mark the threats due today as happening now (pure). Returns the new state and their ids. */
export function strikesToday(s: GameState): { state: GameState; ids: string[] } {
  const T = s.threats;
  if (!T || s.gameOver) return { state: s, ids: [] };
  const d = today(s);
  const ids = T.threats.filter((t) => !t.live && !t.schemeId && t.due === s.week && t.dueDay === d).map((t) => t.id);
  if (!ids.length) return { state: s, ids };
  return { state: { ...s, threats: { ...T, threats: T.threats.map((t) => (ids.includes(t.id) ? { ...t, live: 1 as const } : t)) } }, ids };
}

/**
 * The moment: the boss answers a strike, and it is rolled now (the threats' own dice). Pure. The
 * answers he gave at the urgent meetings are carried out first; the option's cost lands; then it
 * comes to nothing or lands in full. The result is written to Your File and to tomorrow's paper.
 */
export function resolveStrike(input: GameState, id: string, optId: StrikeOptId = 'ride'): { state: GameState; result: NowResult; extra?: { h: string; b: string } } {
  const t0 = input.threats?.threats.find((x) => x.id === id);
  const fail = (error: string): { state: GameState; result: NowResult } => ({ state: input, result: { ok: false, error, title: 'The night', tier: 'fail', headline: error, line: '', changes: [], leadsTo: [] } });
  if (!t0 || input.gameOver) return fail('It is over');
  const s = structuredClone(input) as GameState;
  const T = s.threats!;
  const t = T.threats.find((x) => x.id === id)!;
  const ctx = newStrikeCtx(s);
  const view = strikeView(s, id)!;
  let spec = strikeSpecs(s, t).find((o) => o.id === optId);
  if (!spec || spec.blocked) spec = strikeSpecs(s, t).find((o) => o.id === 'ride')!;
  const before = { money: s.money + Math.round(s.tribute?.acct.personal ?? 0), respect: s.respect, heat: { ...s.heat } };
  const logFrom = ctx.log.length;
  // The meetings first: what he answered is carried out now; a warning nobody went to is missed.
  for (const tip of T.tips) {
    if (tip.threatId !== t.id) continue;
    if (tip.status === 'waiting') { tip.status = 'missed'; T.stats.ignored++; }
    else if (tip.status === 'ignored') { T.snubs[tip.sourceId] = (T.snubs[tip.sourceId] ?? 0) + 1; tip.status = 'done'; }
    else if (tip.status === 'met' || tip.status === 'sent') answerTip(ctx, T, tip);
  }
  T.threats = T.threats.filter((x) => x.id !== t.id);
  if (spec.cost.length) applyEffects(ctx, spec.cost, { label: spec.label, because: spec.label.toLowerCase(), category: 'event' });
  const odds = foilOdds(s, t, spec.bonus);
  const r = rand(T);
  const foiled = r < odds;
  delete t.live;
  land(ctx, T, t, foiled ? 'foiled' : 'landed');
  if (foiled) {
    if (spec.win?.length) applyEffects(ctx, spec.win, { label: spec.label, because: spec.label.toLowerCase(), category: 'event' });
    ensureAction(s).strength = s.week;
  }
  ensureAction(s).stats.strikes++;
  const lines = ctx.log.slice(logFrom);
  const after = { money: s.money + Math.round(s.tribute?.acct.personal ?? 0), respect: s.respect, heat: { ...s.heat } };
  const changes: string[] = [];
  const sgn = (n: number) => `${n > 0 ? '+' : '−'}${Math.abs(Math.round(n))}`;
  if (after.money !== before.money) changes.push(`Money ${after.money > before.money ? '+' : '−'}$${Math.abs(after.money - before.money).toLocaleString('en-US')}`);
  if (after.respect !== before.respect) changes.push(`Respect ${sgn(after.respect - before.respect)}`);
  for (const k of ['local', 'family', 'federal'] as const) if (after.heat[k] !== before.heat[k]) changes.push(`${k[0].toUpperCase()}${k.slice(1)} heat ${sgn(after.heat[k] - before.heat[k])}`);
  const pct = Math.round(odds * 100);
  const title = `${view.when}: ${view.title}`;
  const line = lines[lines.length - 1] ?? (foiled ? 'It came to nothing.' : 'It landed.');
  journal(s, {
    d: today(s), tm: hourText(t.hour), c: t.by === 'police' || t.by === 'fbi' ? 'law' : 'rivals', t: title, r: [`You chose: ${spec.label}.`, ...lines].slice(0, 8),
    m: after.money - before.money, st: { respect: after.respect - before.respect, local: after.heat.local - before.heat.local, family: after.heat.family - before.heat.family, federal: after.heat.federal - before.heat.federal },
    src: 'strike', mine: 1, ...(t.targetId ? { p: [t.targetId] } : {}), ...(t.bizId ? { pl: [`b:${t.bizId}`] } : {}),
  });
  // The papers: violence and raids that landed make tomorrow's front page (EXTRA!: daily.ts puts it in the paper).
  const extra = !foiled && t.kind !== 'poach' && t.kind !== 'bribe' && t.kind !== 'fed_flip' ? { h: extraHeadline(s, t), b: line } : undefined;
  return {
    ...(extra ? { extra } : {}),
    state: s,
    result: { ok: true, title, ...(t.targetId && s.characters[t.targetId] ? { who: displayName(s.characters[t.targetId]) } : {}), chance: odds, roll: Math.floor(r * 100), tier: foiled ? (r < odds * 0.3 ? 'crit' : 'success') : 'fail', headline: `${pct}% — ${foiled ? 'it came to nothing' : 'it landed'}`, line, changes, leadsTo: foiled ? [] : ['It is in tomorrow\'s paper.'] },
  };
}

function extraHeadline(s: GameState, t: Threat): string {
  switch (t.kind) {
    case 'hit': return t.targetId === s.playerId ? 'SHOTS ON THE ISLAND; BUSINESSMAN UNHURT' : 'MAN ATTACKED; POLICE HAVE NO SUSPECTS';
    case 'racket': return 'FIRE, BROKEN GLASS AT LOCAL BUSINESS';
    case 'move': return 'STRANGERS ON THE CORNERS, MERCHANTS SAY';
    case 'raid': case 'setup': return 'COUNTY DETECTIVES RAID LOCAL BUSINESS';
    case 'stakeout': case 'wire': return 'POLICE STEP UP WATCH ON THE ISLAND';
    default: return 'FEDERAL AGENTS SEEN IN WILDWOOD';
  }
}

function newStrikeCtx(s: GameState): Ctx {
  return newCtxFor(s);
}

/** A planned raid the heat brought (heat.ts): due next week, on its night. */
export function planHeatRaid(s: GameState): Threat | undefined {
  const T = ensureThreats(s);
  if (T.threats.some((x) => x.by === 'police')) return undefined;
  const biz = raidable(s);
  if (!biz.length) return undefined;
  const b = pick(T, biz);
  const t: Threat = { id: nid(T, 'th'), kind: 'raid', by: 'police', bizId: b.id, district: b.districtId, start: s.week, due: s.week + 1, blunt: 0, heatRaid: 1 };
  stampWhen(s, t);
  T.threats.push(t);
  T.stats.planned++;
  return t;
}

/** A ticking clock the boss can see: an urgent meeting that named a night, or a strike happening now. */
export interface Ticking {
  key: string;
  tipId?: string;
  threatId?: string;
  /** "Manno's men · Fri night, 2 a.m.". */
  text: string;
  /** Days left (0: today/tonight; −1: now). */
  days: number;
  charId?: string;
}

const SHORT_KIND: Record<ThreatKind, string> = {
  hit: 'a hit', move: 'a move on your corners', racket: 'a hit on a place', poach: 'courting one of yours', bribe: 'an envelope for one of yours', setup: 'a set-up',
  raid: 'a raid', stakeout: 'a stake-out', wire: 'a wire', fed_post: 'an FBI post', fed_wire: 'a federal wire', fed_flip: 'the FBI on one of yours', fed_under: 'an undercover man', fed_gj: 'subpoenas',
};

/** The countdowns for the Desk and the In-motion strip, soonest first. */
export function tickingClocks(s: GameState): Ticking[] {
  const T = s.threats;
  if (!T || s.gameOver) return [];
  const d = today(s);
  const out: Ticking[] = [];
  for (const t of T.threats.filter((x) => x.live)) out.push({ key: `strike:${t.id}`, threatId: t.id, text: `${rivalName(s, t.by)}: ${SHORT_KIND[t.kind]} · NOW`, days: -1, ...(t.targetId && t.targetId !== s.playerId ? { charId: t.targetId } : {}) });
  for (const tip of T.tips) {
    if (tip.dueDay === undefined || !tipOut(s, tip) || tip.status === 'done' || tip.status === 'missed' || tip.status === 'ignored') continue;
    const left = (tip.deadline - s.week) * 7 + tip.dueDay - d;
    if (left < 0 || left > 13) continue;
    const when = left === 0 ? 'tonight' : left === 1 ? 'tomorrow' : `${left} days`;
    out.push({ key: `tick:${tip.id}`, tipId: tip.id, text: `${rivalName(s, tip.by)}: ${SHORT_KIND[tip.kind]} · ${whenText(tip.dueDay, tip.hour)} (${when})`, days: left });
  }
  return out.sort((a, b) => a.days - b.days || a.key.localeCompare(b.key));
}
