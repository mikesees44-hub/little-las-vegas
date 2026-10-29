import { attr } from './attrs';
import { ageOn } from './calendar';
import { crew, displayName, hasTrait, isFree } from './characters';
import { holder } from './council';
import { finOf, type FinLife } from './crewFinance';
import { addStory } from './hierarchy';
import { heat, type Ctx } from './ledger';
import { bossLearns, factById } from './livingKnow';
import { addOpinion, changeMeter, opinion } from './relations';
import { hashSeed, rand, type RngHolder } from './rng';
import { xfer } from './tribute';
import { tripOf } from './travelState';
import { revealReport } from './capos';
import { FACTION_NAMES } from './world';
import type { ActionPreview } from './actions';
import type { Character, Choice, Effect, EventInstance, GameState } from './types';
import {
  GUARD_LINES, KID_LINES, KIND_INFO, MAX_CUT, PROTECT_HOURS, PURPOSE_INFO, RANK_WAGE, SHIFT_INFO, TEEN_LINES,
  type InvPurpose, type ProtKind, type Remit, type Shift,
} from './protectData';

export type { InvPurpose, ProtKind, Remit, Shift } from './protectData';

/**
 * PROTECTION & INTELLIGENCE (the user's Store & Protection design, part two).
 *
 * Every character can be guarded and every adult can be looked into, by the
 * boss and by anyone else with the men and the money: a capo puts a soldier
 * on himself when he is threatened, a rival boss doubles his guard in a war,
 * the underboss has a member watched without telling you, a wife asks for a
 * driver after a threat.
 *
 * PROTECTION is an assignment of one to three men to a person (or a house, a
 * gathering), with a schedule (days, nights, around the clock), a duration,
 * a review date, a spending limit, the protected adult's own say, and who
 * gets the guard's reports. A guard has wages, hours, a judgment of his own,
 * and relationships; while he is on it he is off his other work (his racket
 * runs short a man: `busyUntil`). Protection takes a share off the real risk
 * rolls (a hit in threats.ts, a blitz, a jealous husband, an ambush on the
 * road), never all of it (MAX_CUT). It is about safety: a guard whose remit
 * is only safety keeps what is private private; a remit to report her private
 * life is monitoring, and monitoring that is found out costs trust.
 *
 * INTELLIGENCE is an investigation: a subject, a purpose, an investigator,
 * reports over time. The methods stay off-screen. A report only ever says
 * what the simulation already holds (crewFinance debts, stakes and spending,
 * the hidden skim, kick-up arrears, a rival's shylock, informant flags, a
 * rival courting him, factions, the succession court's private plans, the
 * lieutenants' hidden side deals, secrets, the living district's facts, the
 * wife's bond): nothing is manufactured because a report was paid for. Each
 * report separates the observation from the interpretation, says who
 * supplied it and how far to trust him, the innocent explanations, whether
 * the subject knows, what can fairly be concluded, and an adviser's word. An
 * investigator with a grudge may bring a false claim (the report says whose
 * word it is); one who loves the man may cover for him; a report can come
 * back with nothing.
 *
 * Following a woman because you are interested in her finds where she works
 * and nothing about her feelings: it never raises attraction or undoes a
 * no, and when she finds out, she is afraid and angry and tells people.
 * Children get guardian-approved safety only, and only age-appropriate events
 * (KID_LINES); nobody investigates a child.
 *
 * State: `s.protect` (optional, made by the first assignment), with its own
 * dice; NPC decisions roll on hashes of (seed, week, who), so a save with no
 * assignments is never changed by loading it, and nothing here moves another
 * system's dice.
 */

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

export type Consent = 'self' | 'agreed' | 'objected' | 'guardian' | 'unasked';
export type Confidence = 'low' | 'moderate' | 'high';
export type Reliability = 'solid' | 'mixed' | 'shaky';

export interface Assignment {
  id: string;
  type: 'protect' | 'investigate';
  kind?: ProtKind;
  purpose?: InvPurpose;
  /** Who ordered it (the boss, a capo, the underboss, a rival boss). */
  by: string;
  /** The guards, or the investigator. */
  agents: string[];
  /** The protected people, or the one being looked into. */
  subjects: string[];
  shift: Shift;
  start: number;
  /** It ends when this week comes. */
  until: number;
  /** The week it comes up for review. */
  review: number;
  /** Weekly wages, all the men together. */
  wage: number;
  /** Spending limit over the whole assignment (wages); it ends when reached. */
  limit?: number;
  spent: number;
  consent: Consent;
  remit: Remit;
  /** Who gets the reports (character ids). */
  reportsTo: string[];
  status: 'active' | 'ended';
  ended?: { w: number; why: string };
  /** The week the subject found out he was being watched (investigations, monitoring). */
  known?: number;
  /** A man on time off: back the week given. */
  off?: Record<string, number>;
  /** Where on the island (a district id, for the map). */
  district?: string;
  /** "She asked me not to tell you" has been asked (week). */
  asked?: number;
  /** Next report week (investigations, monitoring). */
  next?: number;
  /** Grounds already reported (no repeats). */
  found: string[];
  /** Kept from the boss (an NPC's own business he has not heard of). */
  secret?: boolean;
  /** Raise asked (week), resentment raised (week). */
  raise?: number;
  resent?: number;
}

/** What a report rests on: one record in the simulation. */
export interface Ground {
  src: 'skimmed' | 'arrears' | 'debt' | 'loan' | 'stake' | 'spend' | 'goal' | 'debtTo' | 'lt' | 'informant' | 'courted' | 'defect' | 'faction' | 'plan' | 'secret' | 'fact' | 'bond' | 'threat' | 'scheme' | 'grudge' | 'job';
  ref: string;
}

export interface Report {
  id: string;
  asg: string;
  w: number;
  subject: string;
  /** Who brought it (the investigator or guard). */
  by: string;
  purpose: InvPurpose | 'guard';
  status: 'received' | 'inconclusive';
  observation: string;
  interpretation: string;
  confidence: Confidence;
  /** Who supplied the information, in words. */
  source: string;
  reliability: Reliability;
  alternatives: string[];
  subjectKnows: 'no' | 'suspects' | 'yes';
  conclusion: string;
  advice: string;
  adviser?: string;
  grounds: Ground[];
  /** The source's own invention (a grudge): no ground. */
  falseClaim?: boolean;
  /** The investigator kept back what he found (a friend). */
  covered?: boolean;
  /** Who can read it. */
  access: string[];
}

export interface PLog { w: number; t: string; who: string[]; vis: string[]; kid?: boolean }

export interface ProtectState {
  v: 1;
  rng: number;
  next: number;
  asg: Assignment[];
  reports: Report[];
  log: PLog[];
  stats: { guards: number; inquiries: number; reports: number; falseClaims: number; discovered: number; foiled: number; npc: number };
}

export function ensureProtect(s: GameState): ProtectState {
  if (!s.protect) s.protect = { v: 1, rng: hashSeed(`${s.seed}:protect`), next: 1, asg: [], reports: [], log: [], stats: { guards: 0, inquiries: 0, reports: 0, falseClaims: 0, discovered: 0, foiled: 0, npc: 0 } };
  const P = s.protect;
  P.asg ??= [];
  P.reports ??= [];
  P.log ??= [];
  P.next ??= 1;
  P.stats ??= { guards: 0, inquiries: 0, reports: 0, falseClaims: 0, discovered: 0, foiled: 0, npc: 0 };
  return P;
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(v)));
const fmt = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const first = (s: GameState, id: string | undefined) => (id ? s.characters[id]?.firstName : undefined) ?? 'someone';
const full = (s: GameState, id: string | undefined) => { const c = id ? s.characters[id] : undefined; return c ? `${c.firstName} ${c.lastName}` : 'someone'; };
const fill = (t: string, m: Record<string, string>) => t.replace(/\{(\w+)\}/g, (_, k: string) => m[k] ?? '');
/** A roll on a hash: no stream is moved (NPC decisions, before any state exists). */
const hroll = (s: GameState, k: string) => rand({ rng: hashSeed(`${s.seed}|prot|${s.week}|${k}`) });

export function ageOf(s: GameState, c: Character): number {
  return ageOn(c.birth, s.date);
}
export function isMinor(s: GameState, c: Character | undefined): boolean {
  return !!c && ageOf(s, c) < 18;
}
const she = (c: Character | undefined) => (c?.gender === 'F' ? 'she' : 'he');
const her = (c: Character | undefined) => (c?.gender === 'F' ? 'her' : 'him');
const hisHer = (c: Character | undefined) => (c?.gender === 'F' ? 'her' : 'his');
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

/** The one place this layer writes the record ("Your File" may take it over: journal). */
export function fileNote(s: GameState, text: string, who: string[], vis: string[], kid = false, ctx?: Ctx): void {
  const P = ensureProtect(s);
  P.log.push({ w: s.week, t: text, who, vis, ...(kid ? { kid: true } : {}) });
  if (P.log.length > 80) P.log.splice(0, P.log.length - 80);
  if (ctx && vis.includes(s.playerId)) ctx.log.push(text);
}

/** The one place this layer leaves a memory on a person (the minds layer may take it over). */
export function mindNote(s: GameState, whoId: string, text: string, bond?: { k: 'betrayal' | 'questions' | 'favor' | 'secret'; v: number }): void {
  const c = s.characters[whoId];
  if (!c) return;
  addStory(s, c, text);
  const t = s.bonds?.ties[whoId];
  if (t && bond) {
    t.mem.push({ w: s.week, k: bond.k, t: text, v: Math.max(-30, Math.min(30, bond.v)) });
    if (t.mem.length > 14) t.mem.splice(0, t.mem.length - 14);
  }
}

function bondNudge(s: GameState, id: string, d: { aff?: number; trust?: number; resent?: number; fear?: number }): void {
  const t = s.bonds?.ties[id];
  if (!t) return;
  for (const [k, v] of Object.entries(d) as [keyof typeof d, number][]) (t.ax as unknown as Record<string, number>)[k] = clamp(((t.ax as unknown as Record<string, number>)[k] ?? 0) + v);
}

/* ------------------------------------------------------------------ */
/* The men: what makes a good guard                                    */
/* ------------------------------------------------------------------ */

export interface GuardAttrs { awareness: number; composure: number; judgment: number; discretion: number; reliability: number; loyalty: number; physical: number }

export const GUARD_ATTR_LABEL: Record<keyof GuardAttrs, string> = {
  awareness: 'Awareness', composure: 'Composure', judgment: 'Judgment', discretion: 'Discretion', reliability: 'Reliability', loyalty: 'Loyalty', physical: 'Physical',
};

/** A guard's qualities, read off his existing attributes and traits (pure). */
export function guardAttrs(s: GameState, c: Character, toward = s.playerId): GuardAttrs {
  const t = (tr: Character['traits'][number], v: number) => (hasTrait(c, tr) ? v : 0);
  const imp = attr(s, c, 'impulsiveness');
  const age = ageOf(s, c);
  return {
    awareness: clamp(attr(s, c, 'awareness') + t('Paranoid', 8)),
    composure: clamp((attr(s, c, 'courage') + attr(s, c, 'patience') + (100 - imp)) / 3 + t('Hot-headed', -15) + t('Cowardly', -15) + t('Patient', 5)),
    judgment: clamp(attr(s, c, 'judgment') + t('Hot-headed', -10) + t('Patient', 5) + t('Cruel', -5)),
    discretion: clamp(attr(s, c, 'discretion') + t('Honest', 5) + t('Drinker', -10) + t('Charming', -3)),
    reliability: clamp((c.attributes.discipline + attr(s, c, 'conscience') + (100 - imp)) / 3 + t('Drinker', -15) + t('Gambler', -5) + t('Loyal-to-a-fault', 10) - Math.max(0, 60 - c.health) / 2),
    loyalty: clamp(50 + opinion(s, c.id, toward) / 2 + (attr(s, c, 'loyalty') - 50) / 2 + t('Loyal-to-a-fault', 20) + t('Ambitious', -5)),
    physical: clamp(c.attributes.force * 0.6 + c.health * 0.4 - Math.max(0, age - 40) * 1.5),
  };
}

/** 0-1: how much good he does on a detail. */
export function guardScore(s: GameState, c: Character): number {
  const g = guardAttrs(s, c);
  return (g.awareness * 0.3 + g.composure * 0.2 + g.judgment * 0.15 + g.reliability * 0.2 + g.physical * 0.15) / 100;
}

/** His weekly wage on a shift. */
export function wageOf(s: GameState, c: Character, shift: Shift, investigating = false): number {
  const base = RANK_WAGE[c.rank] ?? 60;
  const phys = guardAttrs(s, c).physical;
  const w = (base + Math.round(phys / 20) * 5) * (investigating ? 0.8 : SHIFT_INFO[shift].wage);
  return Math.round(w / 5) * 5;
}

/* ------------------------------------------------------------------ */
/* Who is on what                                                      */
/* ------------------------------------------------------------------ */

export function activeAssignments(s: GameState): Assignment[] {
  return (s.protect?.asg ?? []).filter((a) => a.status === 'active');
}

/** The assignments a man is working (as guard or investigator). */
export function dutiesOf(s: GameState, charId: string): Assignment[] {
  return activeAssignments(s).filter((a) => a.agents.includes(charId));
}

/** Active guards on a person, with the assignment each is on (mymen's "put a guy on him" reads this). */
export function activeGuards(s: GameState, charId: string): { guard: Character; asg: Assignment }[] {
  const out: { guard: Character; asg: Assignment }[] = [];
  for (const a of activeAssignments(s)) {
    if (a.type !== 'protect' || !a.subjects.includes(charId)) continue;
    for (const g of a.agents) {
      const c = s.characters[g];
      if (c?.alive && isFree(s, c) && !((a.off?.[g] ?? 0) > s.week)) out.push({ guard: c, asg: a });
    }
  }
  return out;
}

const overlaps = (a: Shift, b: Shift) => a === 'around' || b === 'around' || a === b;

/** Why a man cannot take an assignment (hard), if he cannot. */
export function agentBlock(s: GameState, c: Character | undefined, shift: Shift, by = s.playerId, exceptAsg?: string): string | undefined {
  if (!c || !c.alive) return 'Not among the living';
  if (c.id === by) return 'Not a job for the man giving the order';
  if (!isFree(s, c)) return `${c.firstName} is inside`;
  if (isMinor(s, c)) return `${c.firstName} is a child`;
  const boss = s.characters[by];
  if (c.faction !== boss?.faction || c.rank === 'civilian') return `${c.firstName} is not one of ${by === s.playerId ? 'yours' : 'his'}`;
  if (c.rank === 'boss') return 'A boss does not stand guard';
  if (c.health < 30) return `${c.firstName} is too sick`;
  if (tripOf(s, c.id)) return `${c.firstName} is out of town`;
  const mine = dutiesOf(s, c.id).filter((a) => a.id !== exceptAsg);
  const clash = mine.find((a) => overlaps(a.shift, shift) || a.type === 'investigate');
  if (clash) return `${c.firstName} is already ${clash.type === 'investigate' ? `looking into ${first(s, clash.subjects[0])}` : `guarding ${first(s, clash.subjects[0])} (${SHIFT_INFO[clash.shift].name.toLowerCase()})`}: double-booked`;
  if ((c.busyUntil ?? 0) > s.week && !mine.length) return `${c.firstName} is away on a job`;
  return undefined;
}

/** What else the man does, that he would stop doing (the trade-off, in words). */
export function conflictsOf(s: GameState, c: Character, shift: Shift = 'around'): string[] {
  const out: string[] = [];
  if (c.craft === 'driver' && c.capoId) out.push(`${first(s, c.capoId)} needs another driver`);
  else if (c.craft === 'driver') out.push('you need another driver');
  const rackets = s.businesses.filter((b) => b.owner === 'player' && (b.staffIds ?? []).includes(c.id));
  if (rackets.length) out.push(`${rackets.map((b) => b.name).slice(0, 2).join(' and ')} will be short a man`);
  for (const seat of ['underboss', 'consigliere', 'bagman', 'enforcer', 'fixer'] as const) if (s.council?.[seat]?.holderId === c.id) out.push(`his seat as ${seat} gets less of him`);
  if (c.rank === 'capo') { const d = s.districts.find((x) => x.capoId === c.id); out.push(`${d?.name ?? 'his district'} runs without its capo`); }
  const other = dutiesOf(s, c.id).filter((a) => !overlaps(a.shift, shift));
  if (other.length) out.push(`he is on ${first(s, other[0].subjects[0])} ${SHIFT_INFO[other[0].shift].name.toLowerCase()} too: sixteen-hour days`);
  return out;
}

/** The men who could guard (or look into) someone for `by`. */
export function candidatesFor(s: GameState, subjectId: string, shift: Shift = 'around', by = s.playerId): Character[] {
  const boss = s.characters[by];
  const pool = by === s.playerId ? crew(s) : Object.values(s.characters).filter((c) => c.alive && c.faction === boss?.faction && c.id !== by);
  return pool.filter((c) => c.id !== subjectId && !c.specialty && !agentBlock(s, c, shift, by));
}

/* ------------------------------------------------------------------ */
/* The adviser's pick                                                  */
/* ------------------------------------------------------------------ */

export interface GuardRec { guard: Character; score: number; why: string; tradeoff?: string; line: string; adviser?: Character }

/** Who advises the boss on it: the underboss, else the consigliere (never the subject himself). */
export function adviserFor(s: GameState, notId?: string): Character | undefined {
  const ub = holder(s, 'underboss');
  if (ub && ub.id !== notId) return ub;
  const cons = holder(s, 'consigliere');
  return cons && cons.id !== notId ? cons : undefined;
}

function knowsFamily(s: GameState, g: Character, subjectId: string): boolean {
  return opinion(s, g.id, subjectId) > 5 || opinion(s, subjectId, g.id) > 5 || g.dynasty || (!!g.capoId && g.capoId === s.characters[subjectId]?.capoId);
}

/** The adviser's ranked picks for a detail, each with his reason and its trade-off. */
export function recommendGuards(s: GameState, subjectId: string, shift: Shift = 'around', n = 3): GuardRec[] {
  const adv = adviserFor(s, subjectId);
  const rows = candidatesFor(s, subjectId, shift).map((g) => {
    const knows = knowsFamily(s, g, subjectId);
    const cf = conflictsOf(s, g, shift);
    const ga = guardAttrs(s, g);
    const score = guardScore(s, g) * 100 + (knows ? 10 : 0) - cf.length * 12 - (g.rank === 'capo' ? 25 : 0) - (s.council && Object.values(s.council).some((x) => x?.holderId === g.id) ? 20 : 0);
    const best = (Object.keys(ga) as (keyof GuardAttrs)[]).filter((k) => k !== 'loyalty').sort((a, b) => ga[b] - ga[a])[0];
    const why = `${ga.reliability >= 60 ? 'dependable' : ga.reliability >= 45 ? 'steady enough' : 'not the most reliable'}${best ? `, good on ${GUARD_ATTR_LABEL[best].toLowerCase()}` : ''}${knows ? ', and already knows the family' : ''}`;
    const tradeoff = cf.length ? cf.slice(0, 2).join(', and ') : undefined;
    const line = `${g.firstName} is ${why}.${tradeoff ? ` But assigning him here means ${tradeoff}.` : ' Nobody misses him on the street.'}`;
    return { guard: g, score, why, tradeoff, line, adviser: adv };
  });
  return rows.sort((a, b) => b.score - a.score || a.guard.id.localeCompare(b.guard.id)).slice(0, n);
}

/* ------------------------------------------------------------------ */
/* What protection does: a share off the risk, never all of it         */
/* ------------------------------------------------------------------ */

export interface Cover { cut: number; guards: Character[]; names: string }

/**
 * How much the guards on a person take off a danger at this hour ('any' for a
 * thing that could come at any time). 0..MAX_CUT: never immunity.
 */
export function protectionFor(s: GameState, charId: string, when: 'day' | 'night' | 'any' = 'any', travel = false): Cover {
  const P = s.protect;
  if (!P?.asg.length) return { cut: 0, guards: [], names: '' };
  let keep = 1;
  const guards: Character[] = [];
  for (const a of P.asg) {
    if (a.status !== 'active' || a.type !== 'protect' || !a.subjects.includes(charId) || !a.kind) continue;
    if (a.kind === 'event' && a.until <= s.week) continue;
    if (travel && a.kind !== 'bodyguard' && a.kind !== 'escort' && a.kind !== 'driver') continue;
    if (a.kind === 'residence' && travel) continue;
    const sh = SHIFT_INFO[a.shift];
    const cov = when === 'day' ? sh.day : when === 'night' ? sh.night : sh.day * 0.55 + sh.night * 0.45;
    if (cov <= 0) continue;
    const men = a.agents.map((id) => s.characters[id]).filter((c): c is Character => !!c?.alive && isFree(s, c) && !((a.off?.[c.id] ?? 0) > s.week));
    if (!men.length) continue;
    let miss = 1;
    for (const m of men) miss *= 1 - 0.65 * guardScore(s, m);
    const team = 1 - miss;
    // One man cannot stay awake around the clock.
    const tired = a.shift === 'around' && men.length === 1 ? 0.8 : 1;
    const spread = a.kind === 'family' ? Math.min(1, 2 / Math.max(1, a.subjects.length)) : 1;
    const r = KIND_INFO[a.kind].cover * cov * team * tired * spread * 0.75;
    keep *= 1 - r;
    for (const m of men) if (!guards.includes(m)) guards.push(m);
  }
  const cut = Math.min(MAX_CUT, 1 - keep);
  return { cut: Math.round(cut * 1000) / 1000, guards, names: guards.map((g) => g.firstName).join(', ') };
}

/** The boss's guards on the road (the visit ambush). */
export function travelCover(s: GameState, charId = s.playerId): number {
  return protectionFor(s, charId, 'any', true).cut;
}

/** A danger the guards on a person turned away (threats.ts calls this when a hit is foiled with guards on). */
export function protectFoiled(ctx: Ctx, charId: string, by: string): void {
  const s = ctx.s;
  const cov = protectionFor(s, charId);
  if (!cov.guards.length) return;
  const P = ensureProtect(s);
  P.stats.foiled++;
  const c = s.characters[charId];
  const g = cov.guards[0];
  const a = activeAssignments(s).find((x) => x.type === 'protect' && x.subjects.includes(charId) && x.agents.includes(g.id));
  for (const m of cov.guards) {
    addOpinion(s, charId, m.id, 'He was there when it counted', 12, 1);
    addStory(s, m, `Was on ${c?.firstName ?? 'the job'} when ${by}'s men came. Nobody was hurt.`);
  }
  if (a && c) {
    const access = [...new Set([...a.reportsTo, a.by])];
    const rep = makeReport(s, a, g.id, charId, 'guard', {
      observation: `${g.firstName} saw the same car twice near ${c.firstName} and moved ${her(c)} before it came round a third time.`,
      interpretation: `Someone was looking for ${c.firstName}. ${by} had a reason.`,
      confidence: 'moderate', source: `${g.firstName}, who was there`, reliability: 'solid',
      alternatives: ['It could have been a car that was lost'], conclusion: `${c.firstName} is a target. The guard did his job; it does not make ${her(c)} safe.`, advice: `Keep ${g.firstName} on ${c.id === s.playerId ? 'you' : her(c)}, and find out who sent them.`, adviser: adviserFor(s, charId)?.id,
      grounds: [{ src: 'threat', ref: `foiled:${s.week}` }],
    });
    rep.access = access;
    fileNote(s, `${g.firstName} was on ${c.firstName} when ${by}'s people came. ${cap(she(c))} is unhurt.`, [g.id, charId], access, false, ctx);
  }
}

/* ------------------------------------------------------------------ */
/* The protected person's say                                          */
/* ------------------------------------------------------------------ */

/** Who decides for a child: the boss if it is his child, else a living parent. */
export function guardianOf(s: GameState, c: Character): Character | undefined {
  const boss = s.characters[s.playerId];
  if (boss?.childrenIds.includes(c.id)) return boss;
  const p = [c.motherId, c.fatherId].map((id) => (id ? s.characters[id] : undefined)).find((x) => x?.alive);
  return p;
}

/** Does the protected person (or the child's guardian) agree? Pure, so the window can say so up front. */
export function consentOf(s: GameState, subjectId: string, kind: ProtKind, by = s.playerId): { consent: Consent; who?: Character; why: string } {
  const c = s.characters[subjectId];
  if (!c) return { consent: 'unasked', why: 'Nobody to ask' };
  if (subjectId === by) return { consent: 'self', why: 'Your own guard' };
  if (isMinor(s, c)) {
    const g = guardianOf(s, c);
    if (!g) return { consent: 'objected', why: `${c.firstName} has no parent to agree to it` };
    if (g.id === by) return { consent: 'guardian', who: g, why: 'You are the parent: approved' };
    const ok = opinion(s, g.id, by) >= -10;
    return ok ? { consent: 'guardian', who: g, why: `${g.firstName}, the parent, agrees` } : { consent: 'objected', who: g, why: `${g.firstName}, the parent, does not want your men near ${hisHer(g)} child` };
  }
  const threat = threatened(s, subjectId);
  let score = 45 + opinion(s, subjectId, by) / 2 + (threat ? 30 : 0) + (hasTrait(c, 'Paranoid') ? 15 : 0) + (kind === 'residence' || kind === 'event' ? 10 : 0);
  if (hasTrait(c, 'Ambitious') || hasTrait(c, 'Hot-headed')) score -= 10;
  if (c.rank === 'capo' || c.rank === 'underboss' || c.rank === 'consigliere') score -= 5;
  const tie = s.bonds?.ties[subjectId];
  if (tie) score += (tie.ax.trust - 50) / 3;
  return score >= 50 ? { consent: 'agreed', who: c, why: `${c.firstName} agrees${threat ? `: ${she(c)} knows there is a threat` : ''}` } : { consent: 'objected', who: c, why: `${c.firstName} does not want a man following ${her(c)} around` };
}

/** Is someone in real danger right now (as the world holds it)? */
export function threatened(s: GameState, id: string): boolean {
  if (s.threats?.threats.some((t) => t.targetId === id && t.kind === 'hit')) return true;
  if (s.schemes.some((x) => x.kind === 'murder' && x.targetId === id && x.owner !== s.characters[id]?.faction)) return true;
  const c = s.characters[id];
  if (c && (c.id === s.playerId || c.dynasty) && (s.wars.length > 0 || s.rivals.some((r) => r.feud) || s.power?.blitzes?.some((b) => !b.stopped && b.defender === 'player'))) return true;
  return false;
}

/* ------------------------------------------------------------------ */
/* The orders                                                          */
/* ------------------------------------------------------------------ */

export type ProtectAction =
  | { op: 'guard'; subject: string; who: string[]; kind: ProtKind; shift: Shift; weeks: number; remit?: Remit; insist?: boolean; reportsTo?: 'me' | 'them' | 'both'; limit?: number; review?: number }
  | { op: 'investigate'; subject: string; purpose: InvPurpose; who: string; weeks: number }
  | { op: 'renew'; id: string; weeks: number }
  | { op: 'end'; id: string };

/** Choices on the layer's own events. */
export type ProtectOp =
  | { op: 'asked'; id: string; choice: 'safety' | 'tell' | 'ask' }
  | { op: 'raise'; id: string; agent: string; yes: boolean }
  | { op: 'resent'; id: string; keep: boolean }
  | { op: 'escort'; subject: string; agent?: string; yes: boolean };

export function protectHours(a: ProtectAction): number {
  return PROTECT_HOURS[a.op] ?? 0.5;
}

const noop = (title: string, why: string): ActionPreview => ({ title, effects: [], cost: 0, because: '', disabledReason: why, category: 'cost' });
const chip = (text: string): Effect => ({ type: 'econ', op: { op: 'note', text } } as Effect);

export interface GuardView {
  subject?: Character;
  wage: number;
  consent: ReturnType<typeof consentOf>;
  cut: number;
  before: number;
  conflicts: string[];
  block?: string;
  warn?: string;
  rec?: GuardRec;
}

/** Everything the assignment window shows for a protection order (pure). */
export function guardView(s: GameState, a: Extract<ProtectAction, { op: 'guard' }>): GuardView {
  const c = s.characters[a.subject];
  const consent = consentOf(s, a.subject, a.kind);
  const men = a.who.map((id) => s.characters[id]).filter((x): x is Character => !!x);
  const wage = men.reduce((t, m) => t + wageOf(s, m, a.kind === 'event' ? 'day' : a.shift), 0);
  const conflicts = men.flatMap((m) => conflictsOf(s, m, a.shift).map((x) => `${m.firstName}: ${x}`));
  let block: string | undefined;
  if (!c?.alive) block = 'Not among the living';
  else if (!a.who.length) block = 'Pick a man';
  else if (a.who.length > 3) block = 'Three men at most';
  else if (new Set(a.who).size !== a.who.length) block = 'The same man twice';
  else if (isMinor(s, c) && a.remit === 'monitor') block = `${c.firstName} is a child: safety only`;
  else if (isMinor(s, c) && consent.consent === 'objected') block = consent.why;
  else if (!(a.weeks >= 1 && a.weeks <= 52)) block = 'One week to a year';
  else if (a.kind === 'event' && a.weeks > 1) block = 'An event is one week';
  else block = men.map((m) => agentBlock(s, m, a.shift)).find((x) => !!x);
  if (!block && a.subject === s.playerId && a.remit === 'monitor') block = 'Nobody reports on you to you';
  const before = protectionFor(s, a.subject).cut;
  // What it would be with these men on (a scratch copy of the assignments).
  let cut = before;
  if (!block && c) {
    const base: ProtectState = s.protect ?? { v: 1, rng: 0, next: 0, asg: [], reports: [], log: [], stats: { guards: 0, inquiries: 0, reports: 0, falseClaims: 0, discovered: 0, foiled: 0, npc: 0 } };
    const scratch: GameState = { ...s, protect: { ...base, asg: [...base.asg, draft(s, a, 'tmp', consent.consent, wage)] } };
    cut = protectionFor(scratch, a.subject).cut;
  }
  const warn = a.remit === 'monitor' ? `${cap(she(c))} is not told the guard reports on ${hisHer(c)} private life. If ${she(c)} finds out, it costs you ${hisHer(c)} trust.` : consent.consent === 'objected' && !isMinor(s, c) ? (a.insist ? `${consent.why}. You are putting him on ${her(c)} anyway: ${she(c)} will resent it, and him.` : `${consent.why}. Without insisting, ${she(c)} says no and that is the end of it.`) : undefined;
  return { subject: c, wage, consent, cut, before, conflicts, block, warn, rec: c ? recommendGuards(s, c.id, a.shift, 1)[0] : undefined };
}

function draft(s: GameState, a: Extract<ProtectAction, { op: 'guard' }>, id: string, consent: Consent, wage: number, by = s.playerId): Assignment {
  const rt = a.reportsTo ?? 'me';
  const reportsTo = a.subject === by ? [by] : rt === 'them' ? [a.subject] : rt === 'both' ? [by, a.subject] : [by];
  return {
    id, type: 'protect', kind: a.kind, by, agents: [...a.who], subjects: [a.subject], shift: a.kind === 'event' ? 'day' : a.shift,
    start: s.week, until: s.week + Math.max(1, Math.round(a.weeks)), review: s.week + Math.max(1, Math.round(a.review ?? Math.min(a.weeks, 8))),
    wage, ...(a.limit ? { limit: a.limit } : {}), spent: 0, consent, remit: isMinor(s, s.characters[a.subject]) ? 'safety' : (a.remit ?? 'safety'),
    reportsTo, status: 'active', district: districtOf(s, a.subject), found: [],
  };
}

export interface InquiryView { subject?: Character; who?: Character; wage: number; block?: string; warn?: string; discovery: number; skill: number }

/** What an investigation order costs and risks (pure). */
export function inquiryView(s: GameState, a: Extract<ProtectAction, { op: 'investigate' }>, by = s.playerId): InquiryView {
  const c = s.characters[a.subject];
  const m = s.characters[a.who];
  const wage = m ? wageOf(s, m, 'day', true) : 0;
  let block: string | undefined;
  if (!c?.alive) block = 'Not among the living';
  else if (a.subject === by) block = 'Not yourself';
  else if (isMinor(s, c)) block = `${c.firstName} is a child. Nobody looks into a child.`;
  else if (a.who === a.subject) block = 'Not a man on himself';
  else if (!(a.weeks >= 2 && a.weeks <= 26)) block = 'Two weeks to six months';
  else if (activeAssignments(s).some((x) => x.type === 'investigate' && x.by === by && x.subjects.includes(a.subject))) block = `Someone is already on ${c.firstName}`;
  else block = agentBlock(s, m, 'day', by);
  const skill = m ? sleuth(s, m) : 0;
  const disc = c && m ? discoveryOdds(s, c, m, a.purpose) : 0;
  const warn = a.purpose === 'romance'
    ? `Following ${c?.firstName ?? 'her'} tells you where ${she(c)} works and who ${she(c)} sees. It does not make ${her(c)} like you. If ${she(c)} finds out, expect fear and anger, and the whole island hears.`
    : disc > 0.04 ? `${c?.firstName} may notice: about ${Math.round(disc * 100)}% a week. Being watched is not something people forgive easily.` : undefined;
  return { subject: c, who: m, wage, block, warn, discovery: disc, skill };
}

export function previewProtect(s: GameState, a: ProtectAction): ActionPreview {
  switch (a.op) {
    case 'guard': {
      const v = guardView(s, a);
      const c = v.subject;
      const men = a.who.map((id) => first(s, id)).join(' and ');
      const title = `${KIND_INFO[a.kind].name}: ${men || 'nobody'} on ${c ? (c.id === s.playerId ? 'you' : c.firstName) : '?'}`;
      const said = !isMinor(s, c) && v.consent.consent === 'objected' && !a.insist ? ` ${v.consent.why}.` : '';
      return {
        title,
        detail: `${SHIFT_INFO[a.kind === 'event' ? 'day' : a.shift].name}, ${a.weeks} week${a.weeks === 1 ? '' : 's'}, ${fmt(v.wage)} a week in wages.${said} Risk on ${c?.firstName ?? 'them'}: −${Math.round((v.cut - v.before) * 100)}% (never zero).${v.conflicts.length ? ` Costs: ${v.conflicts.join('; ')}.` : ''}`,
        effects: [chip(`${fmt(v.wage)}/wk`), chip(`Danger −${Math.round((v.cut - v.before) * 100)}%`), ...v.conflicts.slice(0, 2).map((x) => chip(x))],
        cost: 0, because: `put ${men} on ${c?.id === s.playerId ? 'yourself' : c?.firstName ?? 'someone'}`, disabledReason: v.block, warning: v.warn, category: 'cost',
      };
    }
    case 'investigate': {
      const v = inquiryView(s, a);
      const title = `${PURPOSE_INFO[a.purpose].name}: ${v.who?.firstName ?? '?'} on ${v.subject?.firstName ?? '?'}`;
      return {
        title,
        detail: `${v.who?.firstName ?? 'Your man'} finds out ${PURPOSE_INFO[a.purpose].ask}, over ${a.weeks} weeks, for ${fmt(v.wage)} a week. Reports come every two weeks and may come back with nothing. How it is done is his business.`,
        effects: [chip(`${fmt(v.wage)}/wk`), chip(`Possible: ${PURPOSE_INFO[a.purpose].finds}`)],
        cost: 0, because: `had ${v.who?.firstName ?? 'a man'} look into ${v.subject?.firstName ?? 'someone'}`, disabledReason: v.block, warning: v.warn, category: 'cost',
      };
    }
    case 'renew': {
      const x = s.protect?.asg.find((y) => y.id === a.id && y.status === 'active');
      if (!x) return noop('Renew an assignment', 'Not running');
      return { title: `Keep ${x.agents.map((id) => first(s, id)).join(' and ')} on ${first(s, x.subjects[0])} ${a.weeks} more weeks`, effects: [chip(`${fmt(x.wage)}/wk`)], cost: 0, because: 'kept an assignment going', disabledReason: x.by !== s.playerId ? 'Not yours' : undefined, category: 'cost' };
    }
    case 'end': {
      const x = s.protect?.asg.find((y) => y.id === a.id && y.status === 'active');
      if (!x) return noop('End an assignment', 'Not running');
      return { title: `Take ${x.agents.map((id) => first(s, id)).join(' and ')} off ${first(s, x.subjects[0])}`, effects: [chip('Back to his other work')], cost: 0, because: 'ended an assignment', disabledReason: x.by !== s.playerId ? 'Not yours' : undefined, category: 'cost' };
    }
  }
}

export function commitProtect(ctx: Ctx, a: ProtectAction): void {
  const s = ctx.s;
  const P = ensureProtect(s);
  switch (a.op) {
    case 'guard': {
      const v = guardView(s, a);
      const c = v.subject!;
      if (!isMinor(s, c) && v.consent.consent === 'objected' && !a.insist) {
        addOpinion(s, c.id, s.playerId, 'Asked me first', 3, 1);
        fileNote(s, `${c.firstName} said no to a guard. You let it be.`, [c.id], [s.playerId], false, ctx);
        return;
      }
      createGuard(ctx, a, s.playerId, v.consent.consent, v.wage);
      return;
    }
    case 'investigate': {
      const v = inquiryView(s, a);
      if (v.block) return;
      createInquiry(ctx, a.subject, a.purpose, a.who, a.weeks, s.playerId, [s.playerId]);
      return;
    }
    case 'renew': {
      const x = P.asg.find((y) => y.id === a.id && y.status === 'active');
      if (!x) return;
      x.until = Math.max(x.until, s.week) + Math.max(1, a.weeks);
      x.review = s.week + Math.min(8, Math.max(1, a.weeks));
      fileNote(s, `${x.agents.map((id) => first(s, id)).join(' and ')} stays on ${first(s, x.subjects[0])} to week ${x.until}.`, [...x.agents], [s.playerId], false, ctx);
      return;
    }
    case 'end': {
      const x = P.asg.find((y) => y.id === a.id && y.status === 'active');
      if (x) endAsg(ctx, x, 'You ended it');
      return;
    }
  }
}

function setBusy(s: GameState, a: Assignment): void {
  for (const id of a.agents) {
    const c = s.characters[id];
    if (c && c.id !== s.playerId) c.busyUntil = Math.max(c.busyUntil ?? 0, s.week + 1);
  }
}

export function createGuard(ctx: Ctx, a: Extract<ProtectAction, { op: 'guard' }>, by: string, consent: Consent, wage: number, secret = false): Assignment {
  const s = ctx.s;
  const P = ensureProtect(s);
  const asg = draft(s, a, `pa${P.next++}`, consent, wage, by);
  if (secret) asg.secret = true;
  P.asg.push(asg);
  P.stats.guards++;
  setBusy(s, asg);
  const c = s.characters[a.subject];
  const men = a.who.map((id) => first(s, id)).join(' and ');
  const vis = secret ? [by, ...a.who] : [...new Set([s.playerId, by, a.subject, ...a.who])];
  if (consent === 'objected' && c) {
    addOpinion(s, c.id, by, 'Put a man on me I did not want', -6, 1);
    mindNote(s, c.id, `${by === s.playerId ? 'The boss' : first(s, by)} put ${men} on ${her(c)} over ${hisHer(c)} objection.`, { k: 'questions', v: -6 });
  } else if (c && consent === 'agreed') addOpinion(s, c.id, by, 'Looks out for me', 4, 1);
  for (const id of a.who) {
    const g = s.characters[id];
    if (g && c) addStory(s, g, `Put on ${c.id === by ? 'the boss himself' : c.firstName} (${KIND_INFO[a.kind].name.toLowerCase()}).`);
  }
  fileNote(s, `${men} ${a.who.length > 1 ? 'are' : 'is'} on ${c?.id === s.playerId ? 'you' : c?.firstName ?? 'someone'}: ${KIND_INFO[a.kind].name.toLowerCase()}, ${SHIFT_INFO[asg.shift].name.toLowerCase()}, to week ${asg.until}.`, [...a.who, a.subject], vis, false, ctx);
  return asg;
}

export function createInquiry(ctx: Ctx, subject: string, purpose: InvPurpose, who: string, weeks: number, by: string, reportsTo: string[], secret = false): Assignment {
  const s = ctx.s;
  const P = ensureProtect(s);
  const m = s.characters[who];
  const asg: Assignment = {
    id: `pa${P.next++}`, type: 'investigate', purpose, by, agents: [who], subjects: [subject], shift: 'day', start: s.week, until: s.week + Math.max(2, Math.round(weeks)), review: s.week + Math.max(2, Math.round(weeks)),
    wage: m ? wageOf(s, m, 'day', true) : 0, spent: 0, consent: 'unasked', remit: 'monitor', reportsTo, status: 'active', district: districtOf(s, subject), next: s.week + 2, found: [], ...(secret ? { secret: true } : {}),
  };
  P.asg.push(asg);
  P.stats.inquiries++;
  setBusy(s, asg);
  fileNote(s, `${first(s, who)} is looking into ${full(s, subject)}: ${PURPOSE_INFO[purpose].name.toLowerCase()}.`, [who, subject], secret ? [by, who] : [by, who], false, ctx);
  return asg;
}

function endAsg(ctx: Ctx, a: Assignment, why: string): void {
  const s = ctx.s;
  a.status = 'ended';
  a.ended = { w: s.week, why };
  for (const id of a.agents) {
    const c = s.characters[id];
    if (c && (c.busyUntil ?? 0) === s.week + 1 && !dutiesOf(s, id).length) c.busyUntil = s.week;
  }
  const vis = a.secret ? [a.by, ...a.agents] : [...new Set([s.playerId, a.by, ...a.agents])];
  fileNote(s, `${a.agents.map((id) => first(s, id)).join(' and ')} off ${first(s, a.subjects[0])}: ${why.toLowerCase()}.`, [...a.agents], vis, false, ctx);
}

/* ------------------------------------------------------------------ */
/* Where and when (map, schedules)                                     */
/* ------------------------------------------------------------------ */

/** The district an assignment works in (for the map): his own district, or the boss's. */
export function districtOf(s: GameState, id: string): string | undefined {
  const c = s.characters[id];
  if (!c) return undefined;
  const own = s.districts.find((d) => d.capoId === id) ?? (c.capoId ? s.districts.find((d) => d.capoId === c.capoId) : undefined);
  if (own) return own.id;
  const best = [...s.districts].sort((a, b) => (b.influence[c.faction] ?? 0) - (a.influence[c.faction] ?? 0) || a.id.localeCompare(b.id))[0];
  return best?.id;
}

/** A man's duty in plain words, for his sheet and the schedules ("Guarding Maria, nights"). */
export function dutyLine(s: GameState, charId: string, viewer = s.playerId): string | undefined {
  const d = dutiesOf(s, charId).find((a) => canSee(s, a, viewer));
  if (!d) return undefined;
  return d.type === 'protect' ? `Guarding ${d.subjects[0] === viewer ? 'you' : first(s, d.subjects[0])}, ${SHIFT_INFO[d.shift].name.toLowerCase()}, to week ${d.until}` : `On a job for ${d.by === viewer ? 'you' : first(s, d.by)} to week ${d.until}`;
}

/** Map marks: districts with protection or an inquiry the viewer knows of. */
export function protectMarks(s: GameState, viewer = s.playerId): { district: string; label: string; asg: string }[] {
  return activeAssignments(s).filter((a) => a.district && canSee(s, a, viewer)).map((a) => ({
    district: a.district!, asg: a.id,
    label: a.type === 'protect' ? `${a.agents.map((id) => first(s, id)).join(', ')} on ${a.subjects[0] === viewer ? 'you' : first(s, a.subjects[0])}` : `${first(s, a.agents[0])}: an inquiry`,
  }));
}

/* ------------------------------------------------------------------ */
/* Who sees what                                                       */
/* ------------------------------------------------------------------ */

/** Can this person see the assignment at all? A secret one only by those in it (and the subject once he found out). */
export function canSee(s: GameState, a: Assignment, viewer: string): boolean {
  if (a.by === viewer || a.agents.includes(viewer) || a.reportsTo.includes(viewer)) return true;
  if (a.secret) return a.known !== undefined && a.subjects.includes(viewer);
  if (a.type === 'investigate') return a.known !== undefined && a.subjects.includes(viewer);
  // Protection that is not secret: the boss knows his own men's details; the protected know theirs (unless it is monitoring).
  if (a.subjects.includes(viewer)) return a.remit === 'safety' || a.known !== undefined;
  return viewer === s.playerId && s.characters[a.by]?.faction === 'player';
}

/** The assignments the viewer knows of. */
export function assignmentsFor(s: GameState, viewer = s.playerId): Assignment[] {
  return (s.protect?.asg ?? []).filter((a) => canSee(s, a, viewer));
}

/** The reports this person may read (the intrigue layer reads these). */
export function reportsFor(s: GameState, viewer = s.playerId): Report[] {
  return (s.protect?.reports ?? []).filter((r) => r.access.includes(viewer));
}

/** Reports about one person that the viewer may read. */
export function reportsAbout(s: GameState, subjectId: string, viewer = s.playerId): Report[] {
  return reportsFor(s, viewer).filter((r) => r.subject === subjectId);
}

/** The record the viewer may read. */
export function protectLog(s: GameState, viewer = s.playerId, n = 30): PLog[] {
  return (s.protect?.log ?? []).filter((l) => l.vis.includes(viewer)).slice(-n);
}

/* ------------------------------------------------------------------ */
/* Investigations: what the world already holds                        */
/* ------------------------------------------------------------------ */

interface Finding {
  ground: Ground;
  observation: string;
  interpretation: string;
  alternatives: string[];
  /** 0 public .. 3 a real secret: how hard it is to find. */
  secrecy: number;
  /** How much it matters. */
  weight: number;
  /** It opens a way to help, not punish. */
  helpful?: boolean;
  /** The kind of advice it needs. */
  tone?: 'money' | 'rat' | 'help' | 'talk';
  reveal?: (s: GameState, lvl: Confidence) => void;
}

const gkey = (g: Ground) => `${g.src}:${g.ref}`;

/** Every fact about a person, for a purpose, that the simulation holds. Nothing is invented here. */
export function findingsAbout(s: GameState, subjectId: string, purpose: InvPurpose): Finding[] {
  const c = s.characters[subjectId];
  if (!c) return [];
  const out: Finding[] = [];
  const he = she(c), He = cap(he), him = her(c), his = hisHer(c);
  const fin: FinLife | undefined = finOf(s, c.id);
  const life = s.tribute?.life?.[c.id];
  const raise = (to: 2 | 3) => (x: { seen: number }) => { if (x.seen < to) x.seen = to; };
  if (purpose === 'money') {
    if ((c.skimmed ?? 0) > 0) out.push({ ground: { src: 'skimmed', ref: c.id }, observation: `${c.firstName}'s envelope has run short of what ${his} corners should have paid.`, interpretation: `${He} may be holding money back.`, alternatives: ['A slow stretch on his corners', 'An honest mistake in the count'], secrecy: 2, weight: 3, tone: 'money' });
    if ((c.arrears ?? 0) > 0) out.push({ ground: { src: 'arrears', ref: c.id }, observation: `${He} still owes ${fmt(c.arrears!)} in kick-ups held back over the winter.`, interpretation: `${He} is behind, not hiding it.`, alternatives: ['The off-season was thin for everybody'], secrecy: 1, weight: 2, tone: 'money' });
    if ((life?.debt ?? 0) > 0) out.push({ ground: { src: 'debt', ref: c.id }, observation: `${He} owes the credit man about ${fmt(Math.round(life!.debt / 100) * 100)}.`, interpretation: `${He} is in over ${his} head somewhere.`, alternatives: ['A sick relative or a bad season: debts have reasons'], secrecy: 2, weight: 2, helpful: true, tone: 'help' });
    for (const [i, d] of (fin?.loans ?? []).entries()) {
      if (d.out <= 0 || d.lender === 'bank') continue;
      out.push({ ground: { src: 'loan', ref: `${c.id}:${i}` }, observation: `${He} borrowed from ${d.lender === 'credit' ? 'the credit man' : full(s, d.lender)}: ${fmt(d.out)} still owed.`, interpretation: 'A hidden debt.', alternatives: ['Men lend to each other; it may be nothing'], secrecy: d.seen >= 2 ? 0 : 2, weight: 2, helpful: true, tone: 'help', reveal: (st) => { const L = finOf(st, c.id)?.loans[i]; if (L) raise(2)(L); } });
    }
    for (const [i, x] of (fin?.assets ?? []).entries()) {
      if (x.k !== 'stake' || x.value <= 0) continue;
      out.push({ ground: { src: 'stake', ref: `${c.id}:${i}` }, observation: `${He} put money into ${x.label} on ${his} own.`, interpretation: `${He} has bought into a business independently.`, alternatives: ['Savings, or his wife\'s family\'s money: it may be clean', 'Expensive purchases are not automatically theft'], secrecy: x.seen >= 2 ? 0 : 2, weight: 2, tone: 'money', reveal: (st) => { const A = finOf(st, c.id)?.assets[i]; if (A) raise(2)(A); } });
    }
    for (const [i, e] of (fin?.hist ?? []).entries()) {
      if (e.amt > -1000 || s.week - e.w > 26 || e.seen >= 2) continue;
      out.push({ ground: { src: 'spend', ref: `${c.id}:${i}` }, observation: `${He} spent ${fmt(-e.amt)}: ${e.text}.`, interpretation: 'Spending his envelope does not explain.', alternatives: ['Expensive purchases are not automatically theft', 'A loan, savings, a windfall at the track'], secrecy: 1, weight: 1, tone: 'money', reveal: (st) => { const E = finOf(st, c.id)?.hist[i]; if (E) raise(2)(E); } });
    }
    if (fin?.goal === 'provide') out.push({ ground: { src: 'goal', ref: c.id }, observation: `${He} has been putting money toward ${his} family.`, interpretation: `${He} is supporting a relative.`, alternatives: [], secrecy: 1, weight: 1, helpful: true, tone: 'help' });
    if (c.debtTo) out.push({ ground: { src: 'debtTo', ref: c.id }, observation: `${He} owes ${fmt(c.debtTo.amount)} to a ${FACTION_NAMES[c.debtTo.rival] ?? 'rival'} shylock.`, interpretation: 'A man in debt to another family can be leaned on.', alternatives: ['He may have borrowed before he ever worked for you'], secrecy: 2, weight: 3, helpful: true, tone: 'help' });
    for (const h of s.briefing?.lt?.hidden ?? []) if (h.byId === c.id) out.push({ ground: { src: 'lt', ref: h.id }, observation: h.kind === 'skim' ? `On a job ${he} ran for you, the costs ${he} booked don't match what was paid out.` : `${He} made an arrangement on ${his} own with people from another family.`, interpretation: h.kind === 'skim' ? `${He} may have kept some.` : 'A side deal behind your back.', alternatives: ['Costs run over; receipts go missing'], secrecy: 3, weight: 3, tone: 'money' });
  }
  if (purpose === 'loyalty') {
    if (c.informantFor) out.push({ ground: { src: 'informant', ref: c.id }, observation: `${He} was seen twice with a man ${c.informantFor === 'law' ? 'who looks like a cop' : `the ${FACTION_NAMES[c.informantFor] ?? 'other'} people use`}.`, interpretation: `${He} may be talking to them.`, alternatives: ['A family connection', 'An old friendship from before'], secrecy: 3, weight: 5, tone: 'rat' });
    if (c.courtedBy) out.push({ ground: { src: 'courted', ref: c.id }, observation: `${c.firstName} met a member of another organization (${FACTION_NAMES[c.courtedBy.rival] ?? 'a rival'}).`, interpretation: 'Purpose unknown.', alternatives: ['The two have a family connection', 'An innocent friendship'], secrecy: 1, weight: 3, tone: 'talk' });
    if ((c.defectStage ?? 0) >= 1 && !c.courtedBy) out.push({ ground: { src: 'defect', ref: c.id }, observation: `${He} has been around another crew's places.`, interpretation: `${He} may be looking for a way out.`, alternatives: ['He may only be drinking where the drinks are cheaper'], secrecy: 1, weight: 2, tone: 'talk' });
    for (const f of s.factions) if (f.memberIds.includes(c.id) || f.leaderId === c.id) out.push({ ground: { src: 'faction', ref: f.id }, observation: `${He} has been meeting ${f.leaderId === c.id ? 'men who are sore' : `${first(s, f.leaderId)} and others who are sore`}.`, interpretation: `${He} is part of a group with demands.`, alternatives: ['Men who drink together complain together'], secrecy: 1, weight: 2, tone: 'talk' });
    const plan = s.shadow?.plans[c.id];
    if (plan && plan.goal === 'leave_organization') out.push({ ground: { src: 'plan', ref: c.id }, observation: `${He} has been asking how a man gets out.`, interpretation: `${He} wants to retire.`, alternatives: [], secrecy: 2, weight: 1, helpful: true, tone: 'help' });
    else if (plan && (plan.goal === 'seek_leadership' || plan.goal === 'support_underboss' || plan.goal === 'support_heir' || plan.goal === 'build_influence') && plan.prefer) out.push({ ground: { src: 'plan', ref: c.id }, observation: plan.prefer === c.id ? `${He} has been building support for ${him}self.` : `${He} has been talking up ${first(s, plan.prefer)} for after you.`, interpretation: 'Thinking about the succession.', alternatives: ['Every man thinks about it; few act'], secrecy: 2, weight: 2, tone: 'talk' });
    // A capo's own game (capos.ts): the deal he is making, and what he kept from you.
    const cb = s.capos?.books[c.id];
    if (cb?.plot) {
      const pk = cb.plot.k;
      out.push({ ground: { src: 'plan', ref: `capo:${c.id}` }, observation: pk === 'defect' ? `${He} has been sitting down with ${FACTION_NAMES[cb.plot.rival ?? 'none'] ?? 'another family'} people, at night, away from his corners.` : pk === 'fbi' ? `${He} got into a car with two men in gray suits, twice.` : `${He} has been counting heads among the capos.`, interpretation: pk === 'defect' ? `${He} may be making a deal to go over, with his crew.` : pk === 'fbi' ? `${He} may be talking to the FBI.` : `${He} may be part of a move against you.`, alternatives: ['Men meet for many reasons'], secrecy: 3, weight: 5, tone: pk === 'fbi' ? 'rat' : 'talk', reveal: (st, lvl) => { const b = st.capos?.books[c.id]; if (b?.plot && lvl !== 'low' && !b.plot.known) b.plot.known = st.week; } });
    }
    for (const r of s.capos?.reports ?? []) if (r.capo === c.id && r.kind !== 'honest' && r.rev === undefined && s.week - r.w <= 26) out.push({ ground: { src: 'fact', ref: `capo:${r.id}` }, observation: r.kind === 'slant' ? `What ${he} told you ("${r.told}") is not what the street says.` : `${He} knew something and did not bring it to you.`, interpretation: `The truth: ${r.truth}.`, alternatives: ['A capo hears a lot; not all of it is worth your time'], secrecy: 2, weight: 3, tone: 'talk', reveal: (st, lvl) => { if (lvl !== 'low') revealReport(st, r.id, 'The man you had look into him'); } });
    for (const x of s.secrets) if (x.ownerId === c.id && (x.kind === 'informant' || x.kind === 'plot') && !x.knownBy.includes('player')) out.push({ ground: { src: 'secret', ref: x.id }, observation: x.text.replace(/\.$/, '') + '.', interpretation: 'If it is true, it is serious.', alternatives: ['Things said about a man are not always so'], secrecy: 3, weight: 4, tone: 'rat', reveal: (st, lvl) => { const y = st.secrets.find((z) => z.id === x.id); if (y && lvl !== 'low' && !y.knownBy.includes('player')) y.knownBy.push('player'); } });
  }
  if (purpose === 'personal' || purpose === 'story') {
    for (const x of s.secrets) if (x.ownerId === c.id && (x.kind === 'affair' || x.kind === 'debt' || x.kind === 'bastard' || x.kind === 'drugs') && !x.knownBy.includes('player')) out.push({ ground: { src: 'secret', ref: x.id }, observation: x.text.replace(/\.$/, '') + '.', interpretation: 'A private matter.', alternatives: ['Not everything private is your business'], secrecy: 3, weight: 2, tone: 'talk', reveal: (st, lvl) => { const y = st.secrets.find((z) => z.id === x.id); if (y && lvl !== 'low' && !y.knownBy.includes('player')) y.knownBy.push('player'); } });
    const tie = s.bonds?.ties[c.id];
    if (tie?.role === 'wife') {
      if (tie.stage === 'separated' || tie.stage === 'cold') out.push({ ground: { src: 'bond', ref: `${c.id}:stage` }, observation: `${c.firstName} has been talking with ${his} own family about a separation.`, interpretation: `${He} is planning to leave.`, alternatives: ['People say things when they are hurt'], secrecy: 2, weight: 3, tone: 'talk' });
      if (tie.knows !== undefined) out.push({ ground: { src: 'bond', ref: `${c.id}:knows` }, observation: `${c.firstName} knows about the other woman.`, interpretation: `${He} has not said so to you.`, alternatives: [], secrecy: 2, weight: 2, tone: 'talk' });
      if (tie.amb?.status === 'wants') out.push({ ground: { src: 'bond', ref: `${c.id}:amb` }, observation: tie.amb.kind === 'shop' ? `${c.firstName} has been looking at a storefront on Pacific Avenue for a dress shop.` : tie.amb.kind === 'church' ? `${c.firstName} wants the chair of the Altar & Rosary Society.` : `${c.firstName} wants to run the Home & School Association.`, interpretation: `Something ${he} wants for ${him}self.`, alternatives: [], secrecy: 1, weight: 1, helpful: true, tone: 'help' });
    }
    const L = s.living;
    if (L) for (let i = L.facts.length - 1, n = 0; i >= 0 && n < 40; i--, n++) {
      const f = L.facts[i];
      if (!f.a.includes(c.id) || f.sec < 1 || s.week - f.w > 52) continue;
      if (!['courting', 'engaged', 'parted', 'affair', 'separated', 'expecting', 'loan', 'missed', 'default', 'grudge', 'asked_help', 'stake', 'plans_biz'].includes(f.k)) continue;
      out.push({ ground: { src: 'fact', ref: f.id }, observation: f.txt.replace(/\.$/, '') + '.', interpretation: f.k === 'affair' || f.k === 'courting' ? 'A private relationship.' : f.k === 'separated' || f.k === 'parted' ? 'Family trouble.' : 'Something in his own life.', alternatives: ['It may be exactly what it looks like, and nothing more'], secrecy: f.sec, weight: 1, tone: 'talk', reveal: (st, lvl) => { const g = st.living ? factById(st.living, f.id) : undefined; if (g) bossLearns(st, g, lvl === 'high' ? 'confirmed' : 'rumor', 'a man you had look into it'); } });
    }
  }
  if (purpose === 'threat') {
    for (const t of s.threats?.threats ?? []) if (t.targetId === c.id) out.push({ ground: { src: 'threat', ref: t.id }, observation: `Men from ${t.by === 'police' ? 'the county' : t.by === 'fbi' ? 'out of town' : FACTION_NAMES[t.by] ?? 'another crew'} have been asking where ${c.firstName} drinks and when ${he} goes home.`, interpretation: 'A genuine threat.', alternatives: ['Men ask questions for all kinds of reasons'], secrecy: 2, weight: 4, tone: 'talk' });
    for (const x of s.schemes) if (x.targetId === c.id && x.owner !== c.faction) out.push({ ground: { src: 'scheme', ref: x.id }, observation: `Somebody in ${FACTION_NAMES[x.owner] ?? 'another crew'} has been studying ${his} habits.`, interpretation: x.kind === 'murder' ? 'They mean harm.' : 'They want something from him.', alternatives: ['Mistaken identity is possible'], secrecy: 2, weight: 4, tone: 'talk' });
    const rel = s.relations ? Object.entries(s.relations).filter(([k, r]) => k.endsWith(`>${c.id}`) && r.grievance >= 50).slice(0, 2) : [];
    for (const [k] of rel) { const from = k.split('>')[0]; if (s.characters[from]?.alive) out.push({ ground: { src: 'grudge', ref: k }, observation: `${full(s, from)} has a real grievance with ${c.firstName}.`, interpretation: 'A genuine dispute.', alternatives: ['Grudges are mostly talk'], secrecy: 1, weight: 2, tone: 'talk' }); }
  }
  if (purpose === 'romance') {
    // Only what anyone could see: nothing about her feelings, nothing intimate.
    const job = s.living?.people[c.id]?.job;
    const lot = job ? s.econ?.lots.find((l) => l.id === job) : undefined;
    out.push({ ground: { src: 'job', ref: c.id }, observation: lot ? `${c.firstName} works at ${lot.name ?? lot.address} and keeps to ${him}self.` : `${c.firstName} keeps to ${him}self.`, interpretation: `Nothing here tells you how ${he} feels about you.`, alternatives: [], secrecy: 0, weight: 0 });
  }
  return out;
}

/** How good a man is at finding things out without being seen (0-1). */
export function sleuth(s: GameState, m: Character): number {
  return (attr(s, m, 'awareness') + m.attributes.intrigue + attr(s, m, 'streetSmarts') * 0.5 + attr(s, m, 'discretion') * 0.5) / 300;
}

/** The weekly chance the subject notices he is being looked into. */
export function discoveryOdds(s: GameState, subj: Character, m: Character, purpose?: InvPurpose): number {
  const notice = attr(s, subj, 'awareness') / 100 + (hasTrait(subj, 'Paranoid') ? 0.25 : 0);
  const hide = (attr(s, m, 'discretion') + attr(s, m, 'stealth')) / 200;
  return Math.max(0.01, Math.min(0.3, 0.03 + notice * 0.06 - hide * 0.04 + (purpose === 'romance' ? 0.06 : 0)));
}

function adviceFor(s: GameState, subjectId: string, f: Finding | undefined, conf: Confidence, rel: Reliability, by: string): { advice: string; adviser?: string } {
  const adv = adviserFor(s, subjectId);
  const name = first(s, subjectId);
  const c = s.characters[subjectId];
  let text: string;
  if (rel === 'shaky') text = `I wouldn't move on ${first(s, by)}'s word alone. Get it from somebody else first.`;
  else if (!f) text = `Nothing to act on. Let it go, or ask ${name} straight.`;
  else if (f.tone === 'help' || f.helpful) text = `This is a chance to help ${name}, not to punish ${her(c)}. Ask ${her(c)} about it.`;
  else if (f.tone === 'rat' && conf !== 'low') text = `Don't let ${name} know you know. Talk to me before anybody moves.`;
  else if (f.tone === 'money') text = `Have the books checked before you say a word. Then speak with ${name} before acting.`;
  else text = `Speak with ${name} before acting.`;
  return { advice: text, adviser: adv?.id };
}

function makeReport(s: GameState, a: Assignment, by: string, subject: string, purpose: Report['purpose'], o: Pick<Report, 'observation' | 'interpretation' | 'confidence' | 'source' | 'reliability' | 'alternatives' | 'conclusion' | 'grounds'> & Partial<Report>): Report {
  const P = ensureProtect(s);
  const knows: Report['subjectKnows'] = a.known !== undefined ? 'yes' : a.type === 'protect' && a.remit === 'safety' ? 'yes' : 'no';
  const adv = o.advice ? { advice: o.advice, adviser: o.adviser } : adviceFor(s, subject, undefined, o.confidence, o.reliability, by);
  const r: Report = { id: `pr${P.next++}`, asg: a.id, w: s.week, subject, by, purpose, status: o.status ?? 'received', subjectKnows: knows, access: [...new Set([a.by, ...a.reportsTo])], ...o, ...adv };
  P.reports.push(r);
  P.stats.reports++;
  if (P.reports.length > 60) P.reports.splice(0, P.reports.length - 60);
  return r;
}

/** An investigation (or a monitoring guard) brings in what he has. Exported for tests. */
export function reportIn(ctx: Ctx, a: Assignment, final = false, as?: InvPurpose): Report | undefined {
  const s = ctx.s;
  const P = ensureProtect(s);
  const m = s.characters[a.agents[0]];
  const subj = s.characters[a.subjects[0]];
  if (!m || !subj) return undefined;
  const purpose: InvPurpose = as ?? a.purpose ?? 'personal';
  const r: RngHolder = P;
  const sk = sleuth(s, m);
  const weeksOn = s.week - a.start;
  const all = findingsAbout(s, subj.id, purpose).filter((f) => !a.found.includes(gkey(f.ground)));
  const found = all.filter((f) => rand(r) < Math.max(0.05, Math.min(0.95, 0.25 + sk * 0.6 - f.secrecy * 0.12 + weeksOn * 0.04)));
  found.sort((x, y) => y.weight - x.weight || x.secrecy - y.secrecy);
  const top = found[0];
  const fondness = opinion(s, m.id, subj.id);
  const grudge = opinion(s, m.id, subj.id) <= -25 || (s.relations?.[`${m.id}>${subj.id}`]?.grievance ?? 0) >= 40;
  const knows: Report['subjectKnows'] = a.known !== undefined ? 'yes' : rand(r) < discoveryOdds(s, subj, m, purpose) * 2 ? 'suspects' : 'no';
  const src = `${m.firstName} ${m.lastName}${a.type === 'protect' ? `, ${her(subj)} guard` : ''}`;
  const visibleTo = [...new Set([a.by, ...a.reportsTo])];
  let rep: Report;
  if (top && fondness >= 50 && top.weight >= 2 && !top.helpful && rand(r) < 0.5) {
    // He found it and kept it back: a friend covers for a friend. The report says who he is to the man.
    rep = makeReport(s, a, m.id, subj.id, purpose, {
      status: 'inconclusive', observation: `${m.firstName} says there is nothing to it.`, interpretation: 'Nothing found.',
      confidence: 'low', source: src, reliability: 'mixed', alternatives: [`${m.firstName} and ${subj.firstName} are close; he may not be the man to ask`],
      conclusion: 'You cannot conclude much from a report by a friend of the man.', grounds: [], covered: true,
    });
  } else if (top) {
    const corroborated = found.length >= 2;
    const score = sk * 0.5 + (3 - top.secrecy) * 0.1 + (corroborated ? 0.15 : 0) + Math.min(0.15, weeksOn * 0.02);
    // One sighting is never certainty: high confidence needs a second thing that points the same way.
    let conf: Confidence = score >= 0.75 && corroborated ? 'high' : score >= 0.42 ? 'moderate' : 'low';
    // A meeting is not betrayal: an interpretation of a sighting is never better than moderate.
    if (top.tone === 'talk' && conf === 'high') conf = 'moderate';
    const rel: Reliability = sk >= 0.55 ? 'solid' : sk >= 0.35 ? 'mixed' : 'shaky';
    const adv = adviceFor(s, subj.id, top, conf, rel, m.id);
    rep = makeReport(s, a, m.id, subj.id, purpose, {
      observation: [top.observation, ...(corroborated ? [found[1].observation] : [])].join(' '),
      interpretation: top.interpretation, confidence: conf, source: src, reliability: rel,
      alternatives: [...top.alternatives, ...(corroborated ? found[1].alternatives : [])].filter((x, i, xs) => xs.indexOf(x) === i).slice(0, 3),
      conclusion: conf === 'high' ? `It is so. What it means is still yours to judge.` : conf === 'moderate' ? `Something is there. Not enough to act on alone.` : `A thread, not a fact.`,
      grounds: [top.ground, ...(corroborated ? [found[1].ground] : [])], ...adv,
    });
    for (const f of [top, ...(corroborated ? [found[1]] : [])]) {
      a.found.push(gkey(f.ground));
      if (visibleTo.includes(s.playerId)) f.reveal?.(s, conf);
    }
  } else if (grudge && purpose !== 'romance' && rand(r) < 0.5) {
    // A claim with nothing under it: the man has a grudge. The report is honest about whose word it is.
    P.stats.falseClaims++;
    const claim = purpose === 'money' ? `${m.firstName} says ${subj.firstName} is skimming.` : purpose === 'loyalty' ? `${m.firstName} says ${subj.firstName} has been meeting the other side.` : `${m.firstName} says ${subj.firstName} is hiding something.`;
    rep = makeReport(s, a, m.id, subj.id, purpose, {
      observation: claim, interpretation: 'His say-so: he names nothing anyone else saw.', confidence: 'low', source: `${src} (who has no love for ${subj.firstName})`, reliability: 'shaky',
      alternatives: [`${m.firstName} has a grudge against ${subj.firstName}`, 'A false accusation'], conclusion: 'Nothing you can act on.', grounds: [], falseClaim: true,
    });
  } else if (final || weeksOn >= 4) {
    rep = makeReport(s, a, m.id, subj.id, purpose, {
      status: 'inconclusive', observation: `${m.firstName} found nothing out of the ordinary in ${weeksOn} weeks.`, interpretation: purpose === 'romance' ? `Nothing about how ${she(subj)} feels. That was never going to be in a report.` : 'Either there is nothing, or nothing he could see.',
      confidence: 'low', source: src, reliability: sk >= 0.45 ? 'solid' : 'mixed', alternatives: purpose === 'money' ? ['An accounting mistake on our side'] : purpose === 'threat' ? ['Exaggerated rumors', 'Mistaken identity'] : [],
      conclusion: 'Insufficient evidence.', grounds: [],
    });
  } else return undefined;
  rep.subjectKnows = knows;
  rep.access = visibleTo;
  fileNote(s, `${m.firstName} reported on ${subj.firstName}: ${rep.status === 'inconclusive' ? 'nothing conclusive' : `${rep.confidence} confidence`}.`, [m.id, subj.id], visibleTo, false, ctx);
  return rep;
}

/* ------------------------------------------------------------------ */
/* Found out: the relationship cost of intrusive monitoring            */
/* ------------------------------------------------------------------ */

/** The subject finds out he (she) is being watched. Exported for tests. */
export function discovered(ctx: Ctx, a: Assignment): void {
  const s = ctx.s;
  if (a.known !== undefined) return;
  a.known = s.week;
  const P = ensureProtect(s);
  P.stats.discovered++;
  const subj = s.characters[a.subjects[0]];
  const by = s.characters[a.by];
  if (!subj || !by) return;
  const m = s.characters[a.agents[0]];
  const romance = a.purpose === 'romance';
  const bossDid = a.by === s.playerId;
  const what = a.type === 'protect' ? 'Had his man report on my private life' : romance ? 'Had me followed' : 'Had me watched';
  addOpinion(s, subj.id, by.id, what, romance ? -30 : -20, 1);
  changeMeter(s, subj.id, by.id, 'trust', romance ? -25 : -15);
  if (romance) changeMeter(s, subj.id, by.id, 'fear', 15);
  if (m) addOpinion(s, subj.id, m.id, a.type === 'protect' ? 'Reported on me' : 'Followed me', -15, 1);
  if (bossDid) {
    bondNudge(s, subj.id, romance ? { trust: -20, fear: 15, aff: -10, resent: 15 } : { trust: -15, resent: 12, aff: -6 });
    mindNote(s, subj.id, `Found out the boss ${a.type === 'protect' ? `had ${m?.firstName ?? 'the guard'} report on ${hisHer(subj)} private life` : `had ${her(subj)} ${romance ? 'followed' : 'watched'}`}.`, { k: 'betrayal', v: romance ? -22 : -18 });
  } else mindNote(s, subj.id, `Found out ${by.firstName} had ${her(subj)} watched.`);
  const vis = [...new Set([s.playerId, a.by, subj.id, ...a.agents])];
  if (romance) {
    // No attraction, no new chance: a no stays a no, and she says it louder.
    const D = s.dating;
    const b = D?.bonds[subj.id];
    if (b) { b.aff = Math.max(0, b.aff - 25); b.no = { week: s.week, what: 'having her followed' }; }
    if (D) D.rumors.push({ week: s.week, text: `${displayName(by)} had ${subj.firstName} ${subj.lastName} followed. She told everybody.`, about: by.id, heard: ['island'], true: true });
    if (bossDid) heat(ctx, 'local', 1, `${subj.firstName} complained to the police about being followed`, 'event');
    fileNote(s, `${subj.firstName} found out you had ${her(subj)} followed. ${cap(she(subj))} is frightened and angry, and ${she(subj)} has told people.`, [subj.id], vis, false, ctx);
    a.status = 'ended';
    a.ended = { w: s.week, why: 'She found out' };
    return;
  }
  if (subj.faction === by.faction && subj.rank !== 'civilian' && subj.id !== s.playerId) {
    // A made man watched by his own: he confronts, the others hear.
    changeMeter(s, subj.id, by.id, 'grievance', 15);
    if (bossDid) for (const k of crew(s).filter((x) => x.rank === 'capo' && x.id !== subj.id)) addOpinion(s, k.id, s.playerId, 'The boss watches his own', -2, 1);
    fileNote(s, `${subj.firstName} found out ${bossDid ? 'you' : by.firstName} had ${her(subj)} watched, and asked ${bossDid ? 'you' : by.firstName} to ${hisHer(by)} face why.`, [subj.id, by.id], a.secret && !bossDid ? [...vis.filter((x) => x !== s.playerId), ...(hroll(s, `tell:${a.id}`) < 0.6 ? [s.playerId] : [])] : vis, false, ctx);
    if (!bossDid && !a.secret) addOpinion(s, s.playerId, by.id, 'Watches my men behind my back', -4, 1);
    return;
  }
  fileNote(s, `${subj.firstName} found out ${bossDid ? 'you' : by.firstName} had ${her(subj)} ${a.type === 'protect' ? 'reported on' : 'watched'}.`, [subj.id], vis, false, ctx);
}

/* ------------------------------------------------------------------ */
/* The layer's events                                                  */
/* ------------------------------------------------------------------ */

const X = (op: ProtectOp, label: string): Effect => ({ type: 'protect', op, label } as Effect);

function ev(s: GameState, key: string, title: string, text: string, choices: Choice[], actors: string[], meta: Record<string, string | number> = {}): EventInstance {
  return { iid: `ev${s.nextId++}`, defId: `protect_${key}`, week: s.week, mandatory: true, priority: 52, title, text, choices, defaultChoiceId: choices[choices.length - 1].id, meta: { ...meta, asked: 1 }, actors: actors.slice(0, 3) };
}

/** A private thing about the protected person that the guard could know: only what the world holds. */
export function privateThing(s: GameState, subjectId: string): Finding | undefined {
  return findingsAbout(s, subjectId, 'personal').filter((f) => f.secrecy >= 1).sort((a, b) => b.weight - a.weight)[0];
}

/** "She Asked Me Not to Tell You": the guard knows something private. */
function askedEvent(s: GameState, a: Assignment, g: Character, p: Character, f: Finding): EventInstance {
  const wife = s.characters[s.playerId]?.spouseId === p.id;
  return ev(s, 'asked', `${p.firstName}: "She asked me not to tell you"`,
    `${g.firstName} comes to see you alone. ${wife ? 'Your wife' : p.firstName} knows he has seen something private, and asked him not to repeat it. ${cap(she(p))} says it has nothing to do with ${hisHer(p)} safety. ${g.firstName} wants to know what his job is: protecting ${her(p)}, or reporting ${hisHer(p)} life to you.`,
    [
      { id: 'safety', label: 'Her safety. The rest is hers.', detail: 'He keeps her confidence; you do not hear it.', because: `told ${g.firstName} to keep ${p.firstName}'s confidence`, effects: [X({ op: 'asked', id: a.id, choice: 'safety' }, 'She asked me not to tell you')] },
      { id: 'tell', label: 'You work for me. Tell me.', detail: 'You hear it. He becomes a man who reports on her, and she may find out.', because: `had ${g.firstName} tell what ${p.firstName} asked him to keep`, effects: [X({ op: 'asked', id: a.id, choice: 'tell' }, 'She asked me not to tell you')] },
      { id: 'ask', label: 'If it matters, I\'ll ask her myself.', detail: 'He keeps quiet; you know there is something.', because: `said you would ask ${p.firstName} yourself`, effects: [X({ op: 'asked', id: a.id, choice: 'ask' }, 'She asked me not to tell you')] },
    ], [g.id, p.id], { asg: a.id, fact: gkey(f.ground) });
}

export function describeProtectOp(s: GameState, o: ProtectOp): string | undefined {
  switch (o.op) {
    case 'asked': return o.choice === 'safety' ? 'The guard keeps her confidence' : o.choice === 'tell' ? 'You hear it; he reports on her now' : 'You will ask her yourself';
    case 'raise': return o.yes ? 'His wage goes up a fifth' : 'No raise';
    case 'resent': return o.keep ? 'He stays on her' : 'He comes off her';
    case 'escort': return o.yes ? `A man on ${first(s, o.subject)}` : 'No escort';
  }
}

export function applyProtectOp(ctx: Ctx, o: ProtectOp): void {
  const s = ctx.s;
  const P = ensureProtect(s);
  switch (o.op) {
    case 'asked': {
      const a = P.asg.find((x) => x.id === o.id);
      if (!a) return;
      const g = s.characters[a.agents[0]];
      const p = s.characters[a.subjects[0]];
      if (!g || !p) return;
      const f = privateThing(s, p.id);
      if (o.choice === 'safety') {
        a.remit = 'safety';
        addOpinion(s, p.id, g.id, 'He kept my confidence', 12, 1);
        addOpinion(s, g.id, s.playerId, 'Let me do the job right', 5, 1);
        bondNudge(s, p.id, { trust: 3 });
        mindNote(s, g.id, `The boss told him to keep ${p.firstName}'s confidences. His job is ${hisHer(p)} safety.`);
        fileNote(s, `${g.firstName} will keep ${p.firstName} safe and keep ${hisHer(p)} confidences. You do not know what ${she(p)} asked him to keep.`, [g.id, p.id], [s.playerId, g.id], false, ctx);
      } else if (o.choice === 'tell') {
        // A man closer to her than to you will not do it.
        const loyalHer = opinion(s, g.id, p.id) > opinion(s, g.id, s.playerId) + 25 && guardAttrs(s, g).discretion >= 60;
        if (loyalHer) {
          addOpinion(s, g.id, s.playerId, 'Wanted me to spy on her', -10, 1);
          addOpinion(s, s.playerId, g.id, 'Refused me', -6, 1);
          fileNote(s, `${g.firstName} would not tell you. "Find somebody else for that, boss." He stays on ${p.firstName}, for ${her(p)}.`, [g.id, p.id], [s.playerId, g.id], false, ctx);
          return;
        }
        a.remit = 'monitor';
        addOpinion(s, g.id, s.playerId, 'Made me a spy in his own house', -4, 1);
        if (f) {
          const conf: Confidence = guardAttrs(s, g).awareness >= 55 ? 'moderate' : 'low';
          makeReport(s, a, g.id, p.id, 'personal', {
            observation: f.observation, interpretation: f.interpretation, confidence: conf, source: `${g.firstName}, ${hisHer(p)} guard, who promised ${her(p)} he would not say`, reliability: 'solid',
            alternatives: f.alternatives, conclusion: `${p.firstName} did not choose to tell you.`, grounds: [f.ground], advice: `It was hers to tell. Speak with ${p.firstName}, and do not say how you know.`, adviser: adviserFor(s, p.id)?.id,
          }).access = [s.playerId];
          a.found.push(gkey(f.ground));
          f.reveal?.(s, conf);
        }
        mindNote(s, g.id, `Told the boss what ${p.firstName} asked him to keep.`);
        fileNote(s, `${g.firstName} told you what ${p.firstName} asked him to keep. From now on he reports on ${her(p)}.`, [g.id, p.id], [s.playerId, g.id], false, ctx);
        // She may see it in his face the next time.
        if (rand(P) < 0.25) discovered(ctx, a);
      } else {
        addOpinion(s, p.id, g.id, 'He kept my confidence', 6, 1);
        makeReport(s, a, g.id, p.id, 'personal', {
          status: 'inconclusive', observation: `There is something private ${p.firstName} asked ${g.firstName} to keep. He kept it.`, interpretation: 'Unknown.', confidence: 'low', source: `${g.firstName}, ${hisHer(p)} guard`, reliability: 'solid',
          alternatives: ['Most private things are just private'], conclusion: `Only ${p.firstName} can tell you.`, grounds: [], advice: `If it matters, ask ${p.firstName} yourself.`, adviser: adviserFor(s, p.id)?.id,
        }).access = [s.playerId];
        fileNote(s, `${g.firstName} kept ${p.firstName}'s confidence. You will ask ${her(p)} yourself, if it matters.`, [g.id, p.id], [s.playerId, g.id], false, ctx);
      }
      return;
    }
    case 'raise': {
      const a = P.asg.find((x) => x.id === o.id);
      const g = s.characters[o.agent];
      if (!a || !g) return;
      if (o.yes) { a.wage = Math.round(a.wage * 1.2 / 5) * 5; addOpinion(s, g.id, s.playerId, 'Gave me my raise', 8, 1); }
      else { addOpinion(s, g.id, s.playerId, 'Turned down my raise', -8, 1); }
      fileNote(s, o.yes ? `${g.firstName} got his raise.` : `No raise for ${g.firstName}. He took it quietly.`, [g.id], [s.playerId, g.id], false, ctx);
      return;
    }
    case 'resent': {
      const a = P.asg.find((x) => x.id === o.id);
      if (!a) return;
      const p = s.characters[a.subjects[0]];
      if (!o.keep) { endAsg(ctx, a, `${p?.firstName ?? 'She'} wanted him gone`); if (p) { addOpinion(s, p.id, s.playerId, 'Listened to me', 8, 1); bondNudge(s, p.id, { trust: 4, resent: -4 }); } return; }
      if (p) { addOpinion(s, p.id, s.playerId, 'Kept a man on me I did not want', -10, 1); bondNudge(s, p.id, { resent: 8, trust: -5 }); mindNote(s, p.id, `Asked the boss to take the guard off ${her(p)}. He would not.`, { k: 'questions', v: -8 }); }
      return;
    }
    case 'escort': {
      const p = s.characters[o.subject];
      if (!p) return;
      if (!o.yes) { addOpinion(s, p.id, s.playerId, 'Would not give me a driver', -6, 1); bondNudge(s, p.id, { trust: -4 }); return; }
      const g = o.agent ? s.characters[o.agent] : recommendGuards(s, p.id, 'day', 1)[0]?.guard;
      if (!g || agentBlock(s, g, 'day')) { fileNote(s, `There was nobody free to drive ${p.firstName}.`, [p.id], [s.playerId], false, ctx); return; }
      createGuard(ctx, { op: 'guard', subject: p.id, who: [g.id], kind: 'escort', shift: 'day', weeks: 8, reportsTo: 'both' }, s.playerId, 'agreed', wageOf(s, g, 'day'));
      addOpinion(s, p.id, s.playerId, 'Gave me a driver when I was scared', 8, 1);
      return;
    }
  }
}

/* ------------------------------------------------------------------ */
/* The week                                                            */
/* ------------------------------------------------------------------ */

export function protectWeek(ctx: Ctx): void {
  const s = ctx.s;
  npcAssignments(ctx);
  const P = s.protect;
  if (!P) return;
  const r: RngHolder = P;
  for (const a of [...P.asg]) {
    if (a.status !== 'active') continue;
    // The men still able to do it.
    a.agents = a.agents.filter((id) => { const c = s.characters[id]; return !!c?.alive && isFree(s, c) && c.faction === s.characters[a.by]?.faction; });
    const subj = s.characters[a.subjects[0]];
    if (!a.agents.length) { endAsg(ctx, a, 'Nobody left on it'); continue; }
    if (!subj?.alive || !s.characters[a.by]?.alive) { endAsg(ctx, a, subj?.alive ? 'The man who ordered it is gone' : `${subj?.firstName ?? 'The subject'} is gone`); continue; }
    if (s.week >= a.until) {
      if (a.type === 'investigate') reportIn(ctx, a, true);
      endAsg(ctx, a, 'Its time ran out');
      continue;
    }
    // Wages, every week, through the books.
    const pay = a.wage;
    if (pay > 0) {
      const each = Math.round(pay / a.agents.length);
      let paid = 0;
      for (const id of a.agents) {
        const label = a.type === 'protect' ? `Bodyguards: ${first(s, id)} on ${a.subjects[0] === a.by ? 'himself' : first(s, a.subjects[0])}` : `Wages: ${first(s, id)}, an inquiry`;
        paid += a.by === s.playerId
          ? xfer(ctx, 'treasury', `wealth:${id}`, each, 'expense', `protect:${a.id}:${id}:${s.week}`, { label, category: 'cost', who: id })
          : xfer(ctx, `wealth:${a.by}`, `wealth:${id}`, each, 'expense', `protect:${a.id}:${id}:${s.week}`, { who: id, hidden: !!a.secret });
      }
      a.spent += paid;
      if (a.by !== s.playerId && paid < each * a.agents.length * 0.5) { endAsg(ctx, a, 'The money ran out'); continue; }
      if (a.limit && a.spent + a.wage > a.limit) { endAsg(ctx, a, 'It reached its spending limit'); continue; }
    }
    // Off his other work while he is on this.
    for (const id of a.agents) { const c = s.characters[id]; if (c) c.busyUntil = Math.max(c.busyUntil ?? 0, s.week + 2); }
    if (a.review === s.week && a.by !== s.playerId) a.review = s.week + 8;
    if (a.type === 'investigate') { inquiryWeek(ctx, a, r); continue; }
    guardWeek(ctx, a, r);
  }
  // Keep the record small.
  P.asg = P.asg.filter((a) => a.status === 'active' || s.week - (a.ended?.w ?? s.week) <= 26);
}

function inquiryWeek(ctx: Ctx, a: Assignment, r: RngHolder): void {
  const s = ctx.s;
  const subj = s.characters[a.subjects[0]]!;
  const m = s.characters[a.agents[0]]!;
  if (a.known === undefined && rand(r) < discoveryOdds(s, subj, m, a.purpose)) {
    discovered(ctx, a);
    if (a.status !== 'active') return;
  }
  if ((a.next ?? 0) <= s.week) {
    a.next = s.week + 2;
    const rep = reportIn(ctx, a);
    // The underboss's own inquiry: a loyal one brings it to you.
    if (rep && a.by !== s.playerId && a.secret && s.characters[a.by]?.faction === 'player' && opinion(s, a.by, s.playerId) >= 30 && rep.status === 'received' && hroll(s, `share:${rep.id}`) < 0.5) {
      rep.access.push(s.playerId);
      a.secret = false;
      a.reportsTo.push(s.playerId);
      fileNote(s, `${first(s, a.by)} tells you he has had ${first(s, a.agents[0])} looking into ${subj.firstName}, and shows you what came back.`, [a.by, subj.id], [s.playerId, a.by], false, ctx);
    }
  }
}

function guardWeek(ctx: Ctx, a: Assignment, r: RngHolder): void {
  const s = ctx.s;
  const p = s.characters[a.subjects[0]]!;
  const g = s.characters[a.agents[0]]!;
  const weeks = s.week - a.start;
  const vis = a.secret ? [a.by, ...a.agents] : [...new Set([s.playerId, a.by, ...a.agents])];
  const child = isMinor(s, p);
  // A guard becomes part of the life he guards.
  if (weeks > 0 && weeks % 4 === 0) {
    for (const id of a.agents) { addOpinion(s, id, p.id, 'I look out for them', 2, 1); addOpinion(s, p.id, id, a.consent === 'objected' || a.remit === 'monitor' && a.known !== undefined ? 'Always there' : 'Looks out for me', a.consent === 'objected' ? -1 : 2, 1); }
  }
  if (child) {
    // Children: walks, waits, rides home. Nothing else.
    if (rand(r) < 0.25) {
      const lines = ageOf(s, p) >= 13 ? TEEN_LINES : KID_LINES;
      fileNote(s, fill(lines[Math.floor(rand(r) * lines.length)], { g: g.firstName, k: p.firstName }), [g.id, p.id], [...vis, ...(guardianOf(s, p) ? [guardianOf(s, p)!.id] : [])], true, ctx);
    }
    return;
  }
  if (rand(r) < 0.12) fileNote(s, fill(GUARD_LINES[Math.floor(rand(r) * GUARD_LINES.length)], { g: g.firstName, p: p.id === s.playerId ? 'you' : p.firstName }), [g.id, p.id], vis, false);
  if (weeks === 26) { addStory(s, g, `Half a year on ${p.firstName}. Part of the family now.`); fileNote(s, `${g.firstName} has been with ${p.id === s.playerId ? 'you' : p.firstName} half a year. He is a friend of the house now.`, [g.id, p.id], vis, false, ctx); }
  // Time off, health.
  if (rand(r) < (hasTrait(g, 'Drinker') ? 0.05 : 0.02) && weeks >= 4) {
    a.off = { ...(a.off ?? {}), [g.id]: s.week + 1 };
    fileNote(s, `${g.firstName} asked for a week off: family in Philadelphia. ${a.agents.length > 1 ? `${first(s, a.agents[1])} covers.` : `Nobody is on ${p.id === s.playerId ? 'you' : p.firstName} this week.`}`, [g.id], vis, false, ctx);
  }
  if (g.health < 45 && rand(r) < 0.1) fileNote(s, `${g.firstName} is not well; he is slower on the stairs than he was.`, [g.id], vis, false, ctx);
  const mine = a.by === s.playerId;
  // A raise, once, after a while.
  if (mine && a.raise === undefined && weeks >= 16 && rand(r) < 0.08) {
    a.raise = s.week;
    s.eventQueue.push(ev(s, 'raise', `${g.firstName} asks for a raise`, `${g.firstName} has been on ${p.id === s.playerId ? 'you' : p.firstName} ${weeks} weeks. He asks, carefully, for more: ${fmt(Math.round(a.wage / a.agents.length * 0.2))} a week.`,
      [{ id: 'yes', label: 'He earned it', because: `gave ${g.firstName} a raise`, effects: [X({ op: 'raise', id: a.id, agent: g.id, yes: true }, 'A raise')] }, { id: 'no', label: 'Not now', because: `turned down ${g.firstName}'s raise`, effects: [X({ op: 'raise', id: a.id, agent: g.id, yes: false }, 'No raise')] }], [g.id]));
  }
  // An adult who did not want it, or who is being reported on: it wears.
  if (p.id !== a.by && (a.consent === 'objected' || (a.remit === 'monitor' && a.known !== undefined))) {
    if (weeks % 4 === 0 && weeks > 0) { addOpinion(s, p.id, a.by, 'A man watching me all day', -2, 1); addOpinion(s, p.id, g.id, 'Always there', -2, 1); }
    if (mine && a.resent === undefined && weeks >= 6 && rand(r) < 0.15) {
      a.resent = s.week;
      s.eventQueue.push(ev(s, 'resent', `${p.firstName} wants ${g.firstName} gone`, `"I did not ask for him and I do not want him." ${p.firstName} wants ${g.firstName} off ${her(p)}.`,
        [{ id: 'go', label: 'He goes', because: `took ${g.firstName} off ${p.firstName}`, effects: [X({ op: 'resent', id: a.id, keep: false }, 'The guard goes')] }, { id: 'stay', label: 'He stays', because: `kept ${g.firstName} on ${p.firstName}`, effects: [X({ op: 'resent', id: a.id, keep: true }, 'The guard stays')] }], [p.id, g.id]));
    }
  }
  // Monitoring: he reports her life, and she may notice.
  if (a.remit === 'monitor' && p.id !== a.by) {
    if (a.known === undefined && rand(r) < discoveryOdds(s, p, g) * 0.7) discovered(ctx, a);
    if ((a.next ?? a.start + 4) <= s.week) { a.next = s.week + 4; reportIn(ctx, a, false, 'personal'); }
  }
  // "She asked me not to tell you": a guard on safety only, who has seen something private that is real.
  if (mine && a.remit === 'safety' && a.asked === undefined && p.id !== s.playerId && weeks >= 3 && rand(r) < 0.35) {
    const f = privateThing(s, p.id);
    if (f) { a.asked = s.week; s.eventQueue.push(askedEvent(s, a, g, p, f)); }
  }
  // Closer to her than to you.
  if (weeks === 20 && opinion(s, g.id, p.id) > opinion(s, g.id, a.by) + 20) fileNote(s, `${g.firstName} is closer to ${p.firstName} than to you now. He will protect ${her(p)}; whether he would report on ${her(p)} is another thing.`, [g.id, p.id], vis, false, ctx);
}

/* ------------------------------------------------------------------ */
/* The others: NPCs protect and look into people too                   */
/* ------------------------------------------------------------------ */

function hasGuard(s: GameState, id: string): boolean {
  return activeAssignments(s).some((a) => a.type === 'protect' && a.subjects.includes(id));
}

/** Monthly-ish: capos and rival bosses guard themselves, the underboss looks into a man, a wife asks for a driver. */
export function npcAssignments(ctx: Ctx): void {
  const s = ctx.s;
  if (s.week % 4 !== 1) return;
  // A capo with a threat on him (or a lot of money and nerves) puts one of his own soldiers on himself.
  for (const k of crew(s).filter((c) => c.rank === 'capo' && isFree(s, c)).sort((a, b) => a.id.localeCompare(b.id))) {
    if (hasGuard(s, k.id) || dutiesOf(s, k.id).length) continue;
    const want = threatened(s, k.id) ? 0.7 : k.wealth > 8000 && hasTrait(k, 'Paranoid') ? 0.25 : k.wealth > 15000 ? 0.06 : 0;
    if (!want || hroll(s, `capo:${k.id}`) >= want) continue;
    const g = crew(s).filter((c) => c.capoId === k.id && (c.rank === 'soldier' || c.rank === 'associate') && !c.specialty && !agentBlock(s, c, 'around', k.id)).sort((a, b) => guardScore(s, b) - guardScore(s, a) || a.id.localeCompare(b.id))[0];
    if (!g || k.wealth < wageOf(s, g, 'day') * 4) continue;
    ensureProtect(s).stats.npc++;
    createGuard(ctx, { op: 'guard', subject: k.id, who: [g.id], kind: 'bodyguard', shift: 'day', weeks: 12 }, k.id, 'self', wageOf(s, g, 'day'));
  }
  // A rival boss at war with you doubles his guard.
  for (const rv of s.rivals.filter((x) => x.kind === 'mob' && (x.war || x.feud)).sort((a, b) => a.id.localeCompare(b.id))) {
    const L = s.characters[rv.leaderId];
    if (!L?.alive || hasGuard(s, L.id)) continue;
    const men = Object.values(s.characters).filter((c) => c.alive && c.faction === rv.id && c.id !== L.id && c.rank !== 'civilian' && !agentBlock(s, c, 'around', L.id)).sort((a, b) => guardScore(s, b) - guardScore(s, a) || a.id.localeCompare(b.id)).slice(0, 2);
    if (!men.length || hroll(s, `rival:${rv.id}`) >= 0.6) continue;
    ensureProtect(s).stats.npc++;
    createGuard(ctx, { op: 'guard', subject: L.id, who: men.map((m) => m.id), kind: 'bodyguard', shift: 'around', weeks: 16 }, L.id, 'self', 0, true);
  }
  // The underboss has a man looked into without telling you, when there is something to look at.
  const ub = holder(s, 'underboss');
  if (ub && !activeAssignments(s).some((a) => a.by === ub.id && a.type === 'investigate')) {
    const target = crew(s).filter((c) => c.id !== ub.id && ((c.skimmed ?? 0) > 1500 || c.courtedBy || (c.defectStage ?? 0) >= 1)).sort((a, b) => a.id.localeCompare(b.id))[0];
    if (target && hroll(s, `ub:${target.id}`) < 0.3) {
      const m = crew(s).filter((c) => (c.capoId === ub.id || c.rank === 'soldier') && c.id !== target.id && !c.specialty && !agentBlock(s, c, 'day', ub.id)).sort((a, b) => sleuth(s, b) - sleuth(s, a) || a.id.localeCompare(b.id))[0];
      if (m) {
        ensureProtect(s).stats.npc++;
        createInquiry(ctx, target.id, target.courtedBy || target.defectStage ? 'loyalty' : 'money', m.id, 6, ub.id, [ub.id], true);
      }
    }
  }
  // A wife asks for a driver when the family is threatened.
  const boss = s.characters[s.playerId];
  const wife = boss?.spouseId ? s.characters[boss.spouseId] : undefined;
  if (wife?.alive && !hasGuard(s, wife.id) && threatened(s, wife.id) && hroll(s, `wife:${wife.id}`) < 0.3 && !(s.protect?.log ?? []).some((l) => l.w > s.week - 26 && l.t.startsWith(`${wife.firstName} asked for a driver`))) {
    const g = recommendGuards(s, wife.id, 'day', 1)[0];
    fileNote(s, `${wife.firstName} asked for a driver.`, [wife.id], [s.playerId], false);
    s.eventQueue.push(ev(s, 'escort', `${wife.firstName} asks for a driver`, `After what has been happening, ${wife.firstName} does not want to drive the children to school alone. ${g ? `${g.adviser?.firstName ?? 'Your underboss'}: "${g.line}"` : 'Nobody is free right now.'}`,
      [{ id: 'yes', label: g ? `Give her ${g.guard.firstName}` : 'Find her somebody', because: `gave ${wife.firstName} a driver`, effects: [X({ op: 'escort', subject: wife.id, agent: g?.guard.id, yes: true }, 'A driver for your wife')] },
        { id: 'no', label: 'Not now', because: `told ${wife.firstName} no driver`, effects: [X({ op: 'escort', subject: wife.id, yes: false }, 'No driver')] }], [wife.id, ...(g ? [g.guard.id] : [])]));
  }
}

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

export interface ProtectAlert { severity: 'info' | 'warn' | 'danger'; title: string; text: string; charId?: string }

/** What the boss should hear about this week: reviews due, new reports, being found out. */
export function protectAlerts(s: GameState): ProtectAlert[] {
  const out: ProtectAlert[] = [];
  for (const a of assignmentsFor(s)) {
    if (a.status !== 'active' || a.by !== s.playerId) continue;
    if (a.review <= s.week) out.push({ severity: 'info', title: `Review: ${a.agents.map((id) => first(s, id)).join(', ')} on ${first(s, a.subjects[0])}`, text: `The assignment is due for review (to week ${a.until}). Keep it or end it.`, charId: a.subjects[0] });
    if (a.known !== undefined && s.week - a.known <= 2) out.push({ severity: 'warn', title: `${first(s, a.subjects[0])} found out`, text: `${first(s, a.subjects[0])} knows ${a.type === 'investigate' ? 'about the inquiry' : 'what the guard reports'}.`, charId: a.subjects[0] });
  }
  const fresh = reportsFor(s).filter((r) => s.week - r.w <= 1);
  if (fresh.length) out.push({ severity: 'info', title: `${fresh.length} new report${fresh.length > 1 ? 's' : ''}`, text: fresh.map((r) => `${first(s, r.subject)}: ${r.status === 'inconclusive' ? 'inconclusive' : `${r.confidence} confidence`}`).join(' · '), charId: fresh[0].subject });
  return out;
}

/** The weekly cost of the boss's own assignments. */
export function protectBill(s: GameState): number {
  return activeAssignments(s).filter((a) => a.by === s.playerId).reduce((t, a) => t + a.wage, 0);
}
