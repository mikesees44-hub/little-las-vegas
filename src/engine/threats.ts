import { ableness, isIncapable } from './aging';
import { ageOn, isInSeason } from './calendar';
import { crew, displayName, hasTrait, isFree, player } from './characters';
import { holder as seatHolder } from './council';
import { killCharacter } from './dynasty';
import { applyEffects, fmtMoney, shiftInfluence } from './effects';
import { alliedWithFaction } from './familyHouses';
import { respect, rivalMoneyHit, type Ctx } from './ledger';
import { rivalCaps } from './rivals';
import { awayReason, today } from './days';
import { defectTo } from './regimes';
import { addOpinion, opinion } from './relations';
import { chance, hashSeed, pick, rand, randInt, type RngHolder } from './rng';
import { strengthTotal } from './strength';
import { pactWith } from './talks';
import { protectFoiled, protectionFor } from './protect';
import type { Character, Effect, GameState, Rival, RivalId } from './types';

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
  if (s.week < GRACE_WEEKS) { p = 0; reasons.push({ label: 'Too early: they are still sizing you up', value: -100 }); }
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

function planRival(s: GameState, T: ThreatsState, r: Rival): Threat | undefined {
  const leader = s.characters[r.leaderId];
  const op = opinion(s, r.leaderId, s.playerId);
  const men = crew(s).filter((c) => isFree(s, c));
  const soldiers = men.filter((c) => c.rank === 'soldier' || c.rank === 'associate');
  const caps = men.filter((c) => c.rank === 'capo');
  const ground = s.districts.filter((d) => (d.influence.player ?? 0) > 8);
  const biz = ourBusinesses(s);
  const cruel = hasTrait(leader, 'Cruel') || hasTrait(leader, 'Hot-headed') ? 1.6 : 1;
  const hate = op <= -50 ? 1.6 : op <= -20 ? 1.2 : 0.6;
  const kind = weighted<ThreatKind>(T, [
    ['move', ground.length ? 3 : 0],
    ['racket', biz.length ? 2 : 0],
    ['poach', soldiers.length ? 1.5 : 0],
    ['bribe', men.length ? 1.2 * (hasTrait(leader, 'Greedy') || hasTrait(leader, 'Charming') ? 1.4 : 1) : 0],
    ['setup', biz.length ? 1 + s.heat.local / 60 : 0],
    ['hit', (caps.length + soldiers.length ? 0.9 : 0) * cruel * hate],
  ]);
  if (!kind) return undefined;
  const t: Threat = { id: nid(T, 'th'), kind, by: r.id, start: s.week, due: s.week + randInt(T, 1, 3), blunt: 0 };
  switch (kind) {
    case 'move': t.district = (ground.find((d) => (d.influence[r.id] ?? 0) > 0 && chance(T, 0.6)) ?? pick(T, ground)).id; break;
    case 'racket': case 'setup': { const b = pick(T, biz); t.bizId = b.id; t.district = b.districtId; break; }
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

function planPolice(s: GameState, T: ThreatsState): Threat | undefined {
  const h = s.heat.local;
  if (h < 35 || active(T).some((x) => x.by === 'police')) return undefined;
  if (!chance(T, (h - 30) / 160)) return undefined;
  const biz = ourBusinesses(s);
  const kind: ThreatKind = h >= 60 && biz.length ? (chance(T, 0.6) ? 'raid' : 'stakeout') : chance(T, 0.25) ? 'wire' : 'stakeout';
  const t: Threat = { id: nid(T, 'th'), kind, by: 'police', start: s.week, due: s.week + randInt(T, 1, 2), blunt: 0 };
  if (biz.length) { const b = pick(T, biz); t.bizId = b.id; t.district = b.districtId; }
  return t;
}

/** The FBI's next move: slow, patient, and a step further each time it works. */
function planFeds(s: GameState, T: ThreatsState): Threat | undefined {
  const F = T.fed;
  if (s.week < F.next || active(T).some((x) => x.by === 'fbi')) return undefined;
  const ev = player(s).evidence ?? 0;
  if (F.stage === 0 && s.heat.federal < 20 && ev < 15) { F.next = s.week + 4; return undefined; }
  const kind: ThreatKind = F.stage <= 0 ? 'fed_post' : F.stage === 1 ? 'fed_wire' : F.stage === 2 ? (chance(T, 0.5) ? 'fed_flip' : 'fed_under') : 'fed_gj';
  const t: Threat = { id: nid(T, 'th'), kind, by: 'fbi', start: s.week, due: s.week + randInt(T, 2, 4), blunt: 0 };
  const men = crew(s).filter((c) => isFree(s, c));
  if (kind === 'fed_flip' && men.length) t.targetId = [...men].sort((a, b) => opinion(s, a.id, s.playerId) - opinion(s, b.id, s.playerId))[0].id;
  if (kind === 'fed_gj') { const k = men.filter((c) => c.rank === 'capo'); if (k.length) t.targetId = pick(T, k).id; }
  if (kind === 'fed_post' || kind === 'fed_under') { const b = ourBusinesses(s); if (b.length) { const x = pick(T, b); t.bizId = x.id; t.district = x.districtId; } }
  F.next = s.week + randInt(T, 7, 11);
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
    const resp = tip.response ?? 'nothing';
    tip.status = 'done';
    if (resp === 'nothing') continue;
    const via = tip.via ?? 'boss';
    applyEffects(ctx, responseEffects(s, tip, resp), { label: `Urgent meeting: ${RESPONSES[resp].label}`, because: `${RESPONSES[resp].because} on ${tip.sourceName}'s word`, category: 'event' });
    if (resp === 'warn' && tip.targetId) { const c = s.characters[tip.targetId]; if (c?.alive && c.id !== s.playerId) c.busyUntil = Math.max(c.busyUntil ?? 0, s.week + 1); }
    if (resp === 'feed' && T.fed.stage > 0 && tip.truth !== 'false') T.fed.stage = Math.max(0, T.fed.stage - 1);
    // A planted tip that sent you after the wrong crew: the planter laughs.
    if (resp === 'counter' && tip.truth === 'false' && tip.plantedBy) note(ctx, T, `Word comes back: ${rivalName(s, tip.plantedBy)} put that story in ${tip.sourceName}'s ear. You hit ${rivalName(s, tip.by)} for nothing.`);
    const t = tip.threatId ? T.threats.find((x) => x.id === tip.threatId) : undefined;
    if (!t) continue;
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

/** A threat comes due: what is left of it after the boss's answers lands. */
function land(ctx: Ctx, T: ThreatsState, t: Threat): void {
  const s = ctx.s;
  const by = rivalName(s, t.by);
  const r = s.rivals.find((x) => x.id === t.by);
  const tgt = t.targetId ? s.characters[t.targetId] : undefined;
  // Guards on the target take a share off a hit (protect.ts): never all of it.
  const guard = t.kind === 'hit' && tgt ? protectionFor(s, tgt.id).cut : 0;
  const blunt = guard > 0 ? 1 - (1 - t.blunt) * (1 - guard) : t.blunt;
  if (blunt > 0 && chance(T, blunt)) {
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
      if (tgt.id === s.playerId) {
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
    if (!chance(T, aggression(s, r).chance)) continue;
    const t = planRival(s, T, r);
    if (t) planned.push(t);
  }
  if (s.week >= GRACE_WEEKS && room() > 0) { const t = planPolice(s, T); if (t) planned.push(t); }
  if (room() > 0) { const t = planFeds(s, T); if (t) planned.push(t); }
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
  for (const tip of fresh.slice(0, TIPS_PER_WEEK + 1)) {
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
export function meetTip(s: GameState, id: string, via: MeetVia): GameState {
  if (via === 'boss' && meetBlock(s)) return s;
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
  return T.tips.filter((t) => t.status === 'waiting' || t.status === 'met' || t.status === 'sent').map((t) => {
    const left = t.deadline - s.week;
    const open = t.status !== 'waiting';
    return {
      id: t.id, who: t.sourceName, role: t.sourceRole, sourceId: t.sourceId, charId: s.characters[t.sourceId] ? t.sourceId : undefined,
      hint: t.hint, detail: open ? t.detail : undefined, read: open ? t.read : undefined,
      deadline: t.deadline, when: left <= 0 ? 'This week' : left === 1 ? 'By next week' : `Within ${left} weeks`,
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

