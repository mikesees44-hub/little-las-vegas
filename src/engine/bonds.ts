import { xpWants } from './crewXp';
import { ageOn } from './calendar';
import { displayName, hasTrait, isFree, player } from './characters';
import { stageOf as datingStage } from './dating';
import { daysOf } from './days';
import { applyEffects } from './effects';
import { activeGoomars, goomarLeaves, goomarOf } from './goomar';
import { earnPocket } from './pocket';
import { giftableItems } from './spend';
import type { GiftFor } from './spendData';
import { activeRomances, partnerOf } from './romance';
import { getRelation, opinion, setModifier } from './relations';
import { hashSeed } from './rng';
import { roll } from './roundsPersonal';
import { addSecret } from './secrets';
import {
  AMBITION_TEXT, ensureBonds, MEM_CAP, ROSTER_CAP, STAGE_TEXT, STAGE_TONE,
  type AmbitionKind, type Axes, type AxisKey, type BondRole, type BondsState, type BondStage, type MemKind, type Memory, type Tie,
} from './bondsState';
import type { ActionPreview } from './actions';
import type { Acceptance, Reason } from './interactions';
import type { Ctx } from './ledger';
import type { Character, Effect, GameState, PlayerAction } from './types';
import { applyMatchOp, describeMatchOp, previewMatchmaker, proposalView, type MatchAction, type MatchOp } from './matchmakers';

/**
 * YOUR PEOPLE: the deep relationships of the boss's life.
 *
 * Over the opinion system (relations.ts: named modifiers) and the love life
 * (romance.ts who is together, dating.ts her feelings, goomar.ts the kept
 * women), each person close to the boss gets:
 *
 *  - AXES: affection, trust, respect, fear, attraction (romantic ties only)
 *    and resentment, 0-100 each. They move with what he does and drift when
 *    he does nothing (no attention: affection fades, resentment builds).
 *  - MEMORIES: anniversaries, fights, favors, gifts, betrayals, the fishing
 *    trip. People bring them up ("You missed our anniversary last year too.").
 *  - A STAGE: wife newlywed / solid / strained / cold / separated; goomar
 *    fling / kept / serious / ultimatum / ended; friends acquaintance /
 *    friend / best friend / compare (godfather of your child); enemies grudge
 *    / enemy / nemesis; kids close / fine / distant.
 *  - NEEDS: a wife wants time, respect, the kids' future, not to be
 *    humiliated; a goomar security, attention, maybe more; a capo respect,
 *    money, recognition. "What she wants right now" is the first need unmet.
 *
 * The long stories run here: the wife's suspicion → questions → she finds
 * out → she confronts him → confess or deny → she decides (stays, stays for
 * the kids, or leaves); the goomar's ultimatum (leave your wife) with a
 * deadline; a goomar who runs into the wife; a goomar expecting (her choice:
 * she has decided to have the baby; he decides only where he stands); a
 * friend who becomes the compare; a confidant who knows too much; a
 * friendship betrayed.
 *
 * Every gesture is an order (kind 'bond') that takes hours of the boss's day
 * (timeCost.ts 'bond:*'). The other person decides: an acceptance with its
 * reasons is shown before he commits. Adults only for anything romantic;
 * nothing explicit (an evening fades to the morning); no coercion.
 */

/* ------------------------------------------------------------------ */
/* Orders and ops                                                      */
/* ------------------------------------------------------------------ */

export type BondAction =
  | { op: 'date'; id: string }
  | { op: 'anniversary'; id: string }
  | { op: 'apologize'; id: string }
  | { op: 'confess'; id: string }
  | { op: 'deny'; id: string }
  | { op: 'vacation'; id: string }
  | { op: 'gift'; id: string; item: string }
  | { op: 'kids'; id: string; stance: 'college' | 'family' }
  | { op: 'ambition'; id: string; back: boolean }
  | { op: 'kidTime'; id: string }
  | { op: 'attention'; id: string }
  | { op: 'reassure'; id: string }
  | { op: 'ultimatum'; id: string; answer: 'leave' | 'stall' | 'end' }
  | { op: 'baby'; id: string; stance: 'support' | 'distance' }
  | { op: 'herFamily'; id: string }
  | { op: 'drink'; id: string }
  | { op: 'fishing'; id: string }
  | { op: 'cards'; id: string }
  | { op: 'godfather'; id: string; kidId: string }
  | { op: 'lend'; id: string; amount: number }
  | { op: 'settle'; id: string; other: string; side: 'him' | 'other' | 'split' }
  | { op: 'test'; id: string }
  | { op: 'confide'; id: string }
  | { op: 'peace'; id: string }
  /** The matchmakers (matchmakers.ts): her match, his answer; her favors. */
  | MatchAction;

export type BondOp = BondAction | { op: 'refused'; id: string; what: string } | MatchOp;

/* ------------------------------------------------------------------ */
/* Gifts: the shop catalog's presents (spend.ts giftableItems)         */
/* ------------------------------------------------------------------ */

export interface Giftable { id: string; label: string; cost: number; for: 'her' | 'him' | 'kid' | 'any'; warmth: number; /** How visible (0-10), from the catalog. */ flash?: number }

export const DEFAULT_GIFTABLES: Giftable[] = [
  { id: 'flowers', label: 'Roses from the florist on Pacific', cost: 25, for: 'her', warmth: 4 },
  { id: 'perfume', label: 'A bottle of Chanel No. 5', cost: 40, for: 'her', warmth: 6 },
  { id: 'bracelet', label: 'A bracelet from Bailey Banks & Biddle', cost: 300, for: 'her', warmth: 10 },
  { id: 'stole', label: 'A mink stole', cost: 900, for: 'her', warmth: 14 },
  { id: 'cigars', label: 'A box of Havanas', cost: 30, for: 'him', warmth: 4 },
  { id: 'scotch', label: 'A case of Chivas', cost: 80, for: 'him', warmth: 6 },
  { id: 'watch', label: 'A gold Bulova', cost: 250, for: 'him', warmth: 9 },
  { id: 'bike', label: 'A Schwinn bicycle', cost: 45, for: 'kid', warmth: 8 },
  { id: 'tickets', label: 'Phillies tickets behind first base', cost: 20, for: 'any', warmth: 4 },
];

let OVERRIDE: Giftable[] | undefined;

/** Hand in a different list (tests, mods); an empty list goes back to the shop catalog. */
export function registerGiftables(list: readonly Giftable[]): void {
  OVERRIDE = list.length && list !== DEFAULT_GIFTABLES ? [...list] : undefined;
}

/** Who a present is for, in the catalog's words. */
function giftWho(s: GameState, id: string): GiftFor {
  const boss = s.characters[s.playerId];
  const c = s.characters[id];
  if (!boss || !c) return 'anyone';
  if (boss.spouseId === id) return 'wife';
  if (goomarOf(s, id) || activeRomances(s, boss.id).some((r) => partnerOf(r, boss.id) === id)) return 'goomar';
  if (boss.childrenIds.includes(id)) return c.gender === 'F' ? 'daughter' : 'son';
  if (boss.motherId === id) return 'mother';
  return 'anyone';
}

/** What can be given to this person: the shop catalog's presents (spend.ts), or the small defaults. */
export function giftablesFor(s: GameState, id: string): Giftable[] {
  const c = s.characters[id];
  if (!c) return [];
  const kid = ageOn(c.birth, s.date) < 16;
  const who: Giftable['for'] = kid ? 'kid' : c.gender === 'F' ? 'her' : 'him';
  if (OVERRIDE) return OVERRIDE.filter((g) => g.for === who || (g.for === 'any' && !kid));
  const cat = giftableItems(s, giftWho(s, id))
    .map((g) => ({ id: g.id, label: g.name, cost: g.price, for: who, warmth: Math.max(1, Math.min(20, Math.round(g.opinion))), flash: g.flash }))
    .sort((a, b) => a.cost - b.cost);
  return cat.length ? cat : DEFAULT_GIFTABLES.filter((g) => g.for === who || (g.for === 'any' && !kid));
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(v)));
const $ = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const X = (op: BondOp, label: string): Effect => ({ type: 'bond', op, label }) as Effect;
const R = (s: GameState, what: string, id: string) => roll(`${s.seed}|${s.week}|bond|${what}|${id}`);
const she = (c: Character) => (c.gender === 'F' ? 'she' : 'he');
const her = (c: Character) => (c.gender === 'F' ? 'her' : 'him');
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export const ADULT = 18;
export function ageOf(s: GameState, c: Character): number {
  return ageOn(c.birth, s.date);
}
function adult(s: GameState, c: Character | undefined): c is Character {
  return !!c && ageOf(s, c) >= ADULT;
}

export function wifeOf(s: GameState): Character | undefined {
  const b = s.characters[s.playerId];
  const w = b?.spouseId ? s.characters[b.spouseId] : undefined;
  return w?.alive ? w : undefined;
}

function separated(s: GameState, id: string): boolean {
  return datingStage(s, id) === 'separated';
}

/** The boss's own children, living. */
export function kidsOf(s: GameState): Character[] {
  const b = s.characters[s.playerId];
  return (b?.childrenIds ?? []).map((id) => s.characters[id]).filter((k): k is Character => !!k?.alive);
}

function minorKids(s: GameState): Character[] {
  return kidsOf(s).filter((k) => ageOf(s, k) < 18);
}

/** The boss's romances that are not his marriage (secret affairs, courtships). */
function otherWomen(s: GameState): string[] {
  const b = s.characters[s.playerId];
  if (!b) return [];
  const ids = new Set<string>(activeGoomars(s).map((g) => g.id));
  // An affair from the women layer (women.ts) is another woman too.
  for (const a of Object.values(s.women?.affairs ?? {})) if (a.with === b.id && a.stage === 'affair' && s.characters[a.id]?.alive) ids.add(a.id);
  for (const r of activeRomances(s, b.id)) {
    const o = partnerOf(r, b.id);
    if (o !== b.spouseId) ids.add(o);
  }
  return [...ids];
}

/** Is he cheating on his wife (a goomar, an affair)? */
export function cheating(s: GameState): boolean {
  return !!wifeOf(s) && otherWomen(s).length > 0;
}

/** The anniversary's week of the year for this wife (fixed per wife). */
export function annivWeek(s: GameState, wifeId: string): number {
  return hashSeed(`${s.seed}:anniv:${wifeId}`) % 52;
}
/** 0 = the anniversary week, 1 = the week after (still in time), … */
function annivOffset(s: GameState, wifeId: string, week = s.week): number {
  return (((week - annivWeek(s, wifeId)) % 52) + 52) % 52;
}
function annivOcc(s: GameState, wifeId: string, week = s.week): number {
  return Math.floor((week - annivWeek(s, wifeId)) / 52);
}
export function anniversaryNow(s: GameState, wifeId: string): boolean {
  return annivOffset(s, wifeId) <= 1;
}

/** What she wants for the kids (fixed per wife): college and a clean life, or the family business. */
export function kidsWish(s: GameState, wifeId: string): 'college' | 'family' {
  return roll(`${s.seed}|kidswish|${wifeId}`) < 0.75 ? 'college' : 'family';
}
function ambitionKind(s: GameState, wifeId: string): AmbitionKind {
  return (['shop', 'church', 'school'] as const)[hashSeed(`${s.seed}:amb:${wifeId}`) % 3];
}
/** A goomar who wants more than an apartment (fixed per woman). */
export function wantsMore(s: GameState, id: string): boolean {
  const p = s.nightlife?.people[id];
  if (p?.goal === 'marry') return true;
  return roll(`${s.seed}|wantsmore|${id}`) < 0.6;
}

/* ------------------------------------------------------------------ */
/* Who: the roster                                                     */
/* ------------------------------------------------------------------ */

/** Who this person is to the boss now (undefined: nobody close). */
export function roleFor(s: GameState, id: string, prev?: BondRole): BondRole | undefined {
  const boss = s.characters[s.playerId];
  const c = s.characters[id];
  if (!boss || !c?.alive || id === boss.id) return undefined;
  if (boss.spouseId === id) return 'wife';
  if (goomarOf(s, id) && adult(s, c)) return 'goomar';
  if (boss.childrenIds.includes(id)) return 'kid';
  if (adult(s, c) && activeRomances(s, boss.id).some((r) => partnerOf(r, boss.id) === id)) return 'lover';
  if (prev === 'rival') return 'rival';
  if (prev === 'friend') return 'friend';
  if (prev === 'goomar' || prev === 'lover') return undefined;
  if (c.faction === 'player' && (c.rank === 'underboss' || c.rank === 'consigliere' || c.rank === 'capo')) return 'crew';
  if (prev === 'crew' && c.faction === 'player') return 'crew';
  if (s.rivals.some((r) => r.kind === 'mob' && r.leaderId === id)) return 'rival';
  return prev;
}

/** Everyone who should be on the screen right now, with their role (wife first). */
export function rosterIds(s: GameState): { id: string; role: BondRole }[] {
  const boss = s.characters[s.playerId];
  if (!boss) return [];
  const out = new Map<string, BondRole>();
  const add = (id: string) => {
    if (out.has(id)) return;
    const r = roleFor(s, id, s.bonds?.ties[id]?.role);
    if (r) out.set(id, r);
  };
  if (boss.spouseId) add(boss.spouseId);
  for (const g of activeGoomars(s)) add(g.id);
  for (const id of otherWomen(s)) add(id);
  for (const k of kidsOf(s)) add(k.id);
  for (const id of Object.keys(s.bonds?.ties ?? {})) add(id);
  const RANK: Record<string, number> = { underboss: 0, consigliere: 1, capo: 2 };
  const crew = Object.values(s.characters).filter((c) => c.alive && c.faction === 'player' && c.id !== boss.id && c.rank in RANK)
    .sort((a, b) => RANK[a.rank] - RANK[b.rank] || a.id.localeCompare(b.id));
  for (const c of crew) add(c.id);
  for (const r of s.rivals) if (r.kind === 'mob' && s.characters[r.leaderId]?.alive) add(r.leaderId);
  const all = [...out.entries()].map(([id, role]) => ({ id, role }));
  const always = all.filter((x) => x.role === 'wife' || x.role === 'goomar' || x.role === 'lover' || x.role === 'kid');
  const rest = all.filter((x) => !always.includes(x)).slice(0, ROSTER_CAP);
  return [...always, ...rest];
}

/* ------------------------------------------------------------------ */
/* Ties: axes, memories, stages                                        */
/* ------------------------------------------------------------------ */

/** Where a new tie starts, read off what the game already knows. */
export function seedAxes(s: GameState, id: string, role: BondRole): Axes {
  const op = opinion(s, id, s.playerId);
  const rel = getRelation(s, id, s.playerId);
  const fear = rel?.fear ?? 0;
  const trust = rel?.trust ?? 30;
  const griev = rel?.grievance ?? 0;
  switch (role) {
    case 'wife': return { aff: clamp(58 + op / 2), trust: clamp(62 + op / 5), respect: clamp(55 + op / 5), fear: clamp(fear), attr: clamp(50 + op / 4), resent: clamp(griev) };
    case 'goomar':
    case 'lover': {
      const b = s.dating?.bonds[id];
      return { aff: clamp(b?.aff ?? 45 + op / 3), trust: 45, respect: clamp(40 + op / 5), fear: clamp(fear), attr: 70, resent: clamp(griev) };
    }
    case 'kid': return { aff: clamp(60 + op / 3), trust: 55, respect: 55, fear: clamp(fear), resent: clamp(griev) };
    case 'rival': return { aff: clamp(20 + op / 4), trust: 15, respect: 45, fear: clamp(fear), resent: clamp(40 + Math.max(0, -op) / 2 + griev / 2) };
    default: return { aff: clamp(40 + op / 2), trust: clamp(trust), respect: clamp(50 + op / 5), fear: clamp(fear), resent: clamp(griev) };
  }
}

function freshTie(s: GameState, id: string, role: BondRole): Tie {
  const t: Tie = { id, role, ax: seedAxes(s, id, role), stage: 'fine', since: s.week, last: s.week, mem: [] };
  if (role === 'wife' && s.week > 2) t.wed = s.week;
  t.stage = computeStage(s, t);
  return t;
}

/** The tie as it is, or as it would start (pure: nothing is written). */
export function peekTie(s: GameState, id: string): Tie | undefined {
  const t = s.bonds?.ties[id];
  if (t) return t;
  const role = roleFor(s, id);
  return role ? freshTie(s, id, role) : undefined;
}

export function ensureTie(s: GameState, id: string, role?: BondRole): Tie | undefined {
  const B = ensureBonds(s);
  let t = B.ties[id];
  const r = role ?? roleFor(s, id, t?.role) ?? t?.role;
  if (!r) return t;
  if (!t) {
    t = freshTie(s, id, r);
    B.ties[id] = t;
  } else if (t.role !== r) {
    t.role = r;
    if ((r === 'goomar' || r === 'lover' || r === 'wife') && t.ax.attr === undefined) t.ax.attr = 60;
  }
  return t;
}

/** Move the axes (clamped). */
export function nudge(t: Tie, d: Partial<Axes>): void {
  for (const k of Object.keys(d) as AxisKey[]) {
    const v = d[k];
    if (v === undefined) continue;
    if (k === 'attr' && t.ax.attr === undefined) continue;
    t.ax[k] = clamp((t.ax[k] ?? 0) + v);
  }
}

/** Remember something (the weightiest and the newest are kept). */
export function remember(s: GameState, t: Tie, k: MemKind, text: string, v: number): Memory {
  const m: Memory = { w: s.week, k, t: text, v: Math.max(-30, Math.min(30, Math.round(v))) };
  t.mem.push(m);
  while (t.mem.length > MEM_CAP) {
    // Drop the oldest of the lightest (never the newest four).
    const pool = t.mem.slice(0, -4);
    let i = 0;
    for (let j = 1; j < pool.length; j++) if (Math.abs(pool[j].v) < Math.abs(pool[i].v)) i = j;
    t.mem.splice(i, 1);
  }
  return m;
}

function blog(B: BondsState, s: GameState, text: string): void {
  B.log.push([s.week, text]);
  if (B.log.length > 40) B.log.splice(0, B.log.length - 40);
}

const lastMem = (t: Tie, k: MemKind | MemKind[]) => {
  const ks = Array.isArray(k) ? k : [k];
  for (let i = t.mem.length - 1; i >= 0; i--) if (ks.includes(t.mem[i].k)) return t.mem[i];
  return undefined;
};
const memsOf = (t: Tie, k: MemKind) => t.mem.filter((m) => m.k === k);
/** Good times shared (for the friend ladder). */
const goodTimes = (t: Tie) => t.mem.filter((m) => m.v > 0 && m.k !== 'stage').length;

/** Where it stands, from the axes and the story flags. */
export function computeStage(s: GameState, t: Tie): BondStage {
  const a = t.ax;
  switch (t.role) {
    case 'wife': {
      if (separated(s, t.id)) return 'separated';
      if (a.aff < 25 || (a.resent >= 60 && a.aff < 45)) return 'cold';
      // She knows, and it has not ended: strained at best.
      if (a.aff < 45 || a.resent >= 35 || t.confront !== undefined || (t.knows !== undefined && cheating(s))) return 'strained';
      if (t.wed !== undefined && s.week - t.wed < 52) return 'newlywed';
      return 'solid';
    }
    case 'goomar': {
      const g = goomarOf(s, t.id);
      if (!g) return 'ended';
      if (t.ult !== undefined) return 'ultimatum';
      if (s.week - g.since >= 20 && a.aff >= 65) return 'serious';
      return 'kept';
    }
    case 'lover': return 'fling';
    case 'kid': return a.aff >= 65 && a.resent < 30 ? 'close' : a.aff < 35 || a.resent >= 50 ? 'distant' : 'fine';
    case 'rival': return a.resent >= 80 ? 'nemesis' : a.resent >= 55 ? 'enemy' : 'grudge';
    default: {
      if (a.resent >= 55) return 'grudge';
      if (t.compare) return 'compare';
      const good = goodTimes(t);
      if (a.aff >= 72 && a.trust >= 60 && good >= 4) return 'best';
      if (a.aff >= 50 && a.trust >= 40 && good >= 2) return 'friend';
      return 'acquaintance';
    }
  }
}

/* ------------------------------------------------------------------ */
/* Needs and wants                                                     */
/* ------------------------------------------------------------------ */

export interface Want { key: string; text: string; met: boolean }

const NEGLECT_AFTER: Record<BondRole, number> = { wife: 3, goomar: 2, lover: 3, kid: 4, friend: 4, crew: 6, rival: 999 };

export function weeksApart(s: GameState, t: Tie): number {
  return s.week - (t.last ?? t.since);
}

/** What this person wants from the boss, met or not. */
export function wantsOf(s: GameState, t: Tie): Want[] {
  const c = s.characters[t.id];
  if (!c) return [];
  const apart = weeksApart(s, t);
  const thr = NEGLECT_AFTER[t.role];
  const time: Want = { key: 'time', text: apart > thr ? `Your time: ${apart} weeks since you gave ${her(c)} any` : 'Your time', met: apart <= thr };
  switch (t.role) {
    case 'wife': {
      const out: Want[] = [];
      if (t.confront !== undefined) out.push({ key: 'truth', text: 'The truth, from you, not from the girls at the beauty parlor', met: false });
      out.push(time);
      out.push({ key: 'respect', text: t.ax.respect < 45 ? 'To be treated with respect in her own house' : 'Respect', met: t.ax.respect >= 45 });
      const goomarsKnown = activeGoomars(s).filter((g) => g.wifeKnows || g.public);
      out.push({ key: 'humiliated', text: goomarsKnown.length ? `Not to be humiliated: the whole island knows about ${goomarsKnown.map((g) => s.characters[g.id]?.firstName ?? 'her').join(' and ')}` : 'Not to be humiliated', met: !goomarsKnown.length });
      if (kidsOf(s).length) {
        const wish = kidsWish(s, t.id);
        const said = lastMem(t, 'kids');
        out.push({ key: 'kids', text: wish === 'college' ? 'The kids\' future: college, a clean name, out of the life' : 'The kids\' future: a place for the boys in the family', met: !!said && said.v > 0 });
      }
      if (t.amb?.status === 'wants') out.push({ key: 'ambition', text: `Something of her own: to ${AMBITION_TEXT[t.amb.kind].want}`, met: false });
      if (anniversaryNow(s, t.id) && t.annivYear !== annivOcc(s, t.id)) out.push({ key: 'anniversary', text: 'Your anniversary: this week', met: false });
      return out;
    }
    case 'goomar':
    case 'lover': {
      const g = goomarOf(s, t.id);
      const out: Want[] = [];
      if (t.ult !== undefined) out.push({ key: 'more', text: `An answer: leave your wife, by week ${t.ult}`, met: false });
      if (t.preg && !t.preg.stance) out.push({ key: 'baby', text: 'To know where you stand on the baby (she has decided to have it)', met: false });
      out.push(time);
      if (g) out.push({ key: 'security', text: g.missed ? `Security: the rent didn't come ${g.missed} week${g.missed === 1 ? '' : 's'}` : 'Security: the rent and the allowance, on time', met: !g.missed });
      const others = activeGoomars(s).filter((x) => x.id !== t.id).length;
      if (others) out.push({ key: 'only', text: `To be the only one (you keep ${others} other${others === 1 ? '' : 's'})`, met: false });
      if (wantsMore(s, t.id) && t.role === 'goomar') out.push({ key: 'future', text: 'Maybe more, someday: a ring, a life in the open', met: !wifeOf(s) });
      return out;
    }
    case 'kid': return [time, { key: 'proud', text: 'For you to be proud of them', met: t.ax.respect >= 50 && t.ax.aff >= 50 }];
    case 'rival': return [{ key: 'even', text: 'To get even', met: t.ax.resent < 30 }];
    default: {
      const out: Want[] = [];
      out.push({ key: 'respect', text: 'Respect: to be listened to', met: t.ax.respect >= 50 });
      if (c.faction === 'player' && c.rank !== 'civilian') {
        const keep = c.keep;
        out.push({ key: 'money', text: keep !== undefined && keep < 0.25 ? `Money: he keeps ${Math.round(keep * 100)}% of his district` : 'Money: a fair cut', met: keep === undefined || keep >= 0.25 });
        out.push({ key: 'recognition', text: 'Recognition: a word from you in front of the others', met: apart <= thr });
        // A man who has come up wants more (crewXp.ts).
        out.push(...xpWants(s, c));
      } else out.push(time);
      if (t.loan) out.push({ key: 'loan', text: `Time to pay back the ${$(t.loan.amount)} (week ${t.loan.due})`, met: true });
      return out;
    }
  }
}

/** The first need not met right now (undefined: content, for now). */
export function wantNow(s: GameState, t: Tie): Want | undefined {
  return wantsOf(s, t).find((w) => !w.met);
}

/* ------------------------------------------------------------------ */
/* Living reactions: the mood of the day, what they say                 */
/* ------------------------------------------------------------------ */

export type Mood = 'warm' | 'cheerful' | 'tired' | 'worried' | 'quiet' | 'cross' | 'hurt' | 'lonely' | 'suspicious';
export const MOOD_TEXT: Record<Mood, string> = {
  warm: 'Warm', cheerful: 'In good spirits', tired: 'Tired', worried: 'Worried', quiet: 'Quiet', cross: 'Cross with you', hurt: 'Hurt', lonely: 'Lonely', suspicious: 'Suspicious',
};

/** Today's mood (the day's dice and the history; nothing is written). */
export function moodOf(s: GameState, t: Tie): Mood {
  if (t.confront !== undefined) return 'hurt';
  if (t.ax.resent >= 60) return 'cross';
  if ((t.sus ?? 0) >= 35) return 'suspicious';
  if (weeksApart(s, t) > NEGLECT_AFTER[t.role] + 1 && t.role !== 'rival') return 'lonely';
  const day = s.week * 7 + daysOf(s).day;
  const r = roll(`${s.seed}|mood|${day}|${t.id}`);
  const warmth = t.ax.aff / 100;
  if (r < warmth * 0.5) return 'warm';
  if (r < warmth * 0.5 + 0.2) return 'cheerful';
  return (['tired', 'worried', 'quiet'] as const)[Math.floor((r * 1000) % 3)];
}

/** "Remember …" / "I haven't forgotten …": the memory they would bring up. */
export function recall(s: GameState, t: Tie, notWeek?: number): Memory | undefined {
  let best: Memory | undefined;
  let score = 0;
  for (const m of t.mem) {
    if (m.k === 'stage' || m.w === notWeek) continue;
    const sc = Math.abs(m.v) * (1 / (1 + (s.week - m.w) / 26));
    if (sc > score) { score = sc; best = m; }
  }
  return best;
}

export function recallLine(s: GameState, t: Tie, notWeek?: number): string | undefined {
  const m = recall(s, t, notWeek);
  if (!m) return undefined;
  return m.v < 0 ? `"I haven't forgotten ${m.t}."` : `"Remember ${m.t}?"`;
}

/** One line in their voice, out of what happened between you. */
export function voiceOf(s: GameState, t: Tie): string {
  const c = s.characters[t.id];
  if (!c) return '';
  const apart = weeksApart(s, t);
  const thr = NEGLECT_AFTER[t.role];
  const recent = (k: MemKind | MemKind[], weeks: number) => { const m = lastMem(t, k); return m && s.week - m.w <= weeks ? m : undefined; };
  switch (t.role) {
    case 'wife': {
      if (separated(s, t.id)) return '"Call before you come by. The kids need to know when."';
      if (t.confront !== undefined) return '"I know about her. I want to hear it from you, not from the girls at the beauty parlor."';
      const missed = memsOf(t, 'missedAnniv');
      if (missed.length >= 2 && s.week - missed[missed.length - 1].w <= 12) return '"You missed our anniversary last year too."';
      if (missed.length && s.week - missed[missed.length - 1].w <= 8) return '"I set the table for our anniversary. I sat there until eleven."';
      if (t.lied && (t.sus ?? 0) >= 35) return '"You told me there was nobody. Say it again, I want to watch your face."';
      if ((t.sus ?? 0) >= 35) return '"Where were you Thursday? Don\'t say the club, I called the club."';
      if (apart > thr) return '"The kids asked if you still live here."';
      const fight = recent(['fight', 'neglect'], 10);
      if (fight) return `"We're not finished talking about ${fight.t}."`;
      if (t.amb?.status === 'wants') return `"Did you think about what I asked? ${AMBITION_TEXT[t.amb.kind].label}."`;
      const good = recent(['date', 'anniversary', 'vacation', 'gift', 'apology'], 6);
      if (good) return `"I keep thinking about ${good.t}."`;
      return moodOf(s, t) === 'tired' ? '"The baby was up all night. Your mother called twice."' : '"Sit. Eat something. You look like the Boardwalk in February."';
    }
    case 'goomar':
    case 'lover': {
      if (t.ult !== undefined) return `"I'm not waiting forever. Her or me. You have until week ${t.ult}."`;
      if (t.preg && !t.preg.stance) return '"I\'m having the baby. I decided. What I need to know is whether you\'re in the picture."';
      if (recent('metWife', 8)) return '"I saw her at the A&P. She looked right at me. She knew."';
      if (recent('jealous', 8)) return '"Who is she? Don\'t lie to me, I can smell her perfume on your coat."';
      const g = goomarOf(s, t.id);
      if (g?.missed) return '"The landlord came by again. Twice."';
      if (apart > thr) return '"I sit by the phone like a fool."';
      const good = recent(['date', 'gift', 'favor', 'family'], 8);
      if (good) return `"${cap(good.t)}. Nobody ever did that for me."`;
      return '"Stay a little. The coffee\'s on."';
    }
    case 'kid': {
      if (apart > thr) return '"Are you coming to the game Saturday? You said last time."';
      const good = recent(['date', 'gift', 'kids', 'fishing'], 10);
      return good ? `"Can we go again, Pop? Like ${good.t}?"` : '"Ma says you\'re busy. You\'re always busy."';
    }
    case 'rival': return t.ax.resent >= 80 ? '"One of these days, Wildwood will need a new boss."' : '"You and me, we\'re not finished."';
    default: {
      if (t.ax.resent >= 55) return '"You know what you did. Everybody knows what you did."';
      if (t.compare) {
        const kid = s.characters[t.compare];
        return `"Compare! How's my godchild${kid ? `, how's ${kid.firstName}` : ''}?"`;
      }
      if (t.welsh) return '"About the money... I\'ll make it right. Give me time."';
      if (t.knows2 !== undefined && t.ax.resent >= 30) return '"Funny, the things a man remembers when nobody\'s nice to him."';
      const good = recent(['fishing', 'cards', 'drink', 'favor', 'loan'], 12);
      if (good) return `"Remember ${good.t}? We should do that again."`;
      if (apart > thr && s.characters[t.id]?.faction === 'player') return '"I don\'t see you no more, boss. A man starts to wonder."';
      return '"Whatever you need, boss."';
    }
  }
}

/* ------------------------------------------------------------------ */
/* Suggested gestures                                                  */
/* ------------------------------------------------------------------ */

/** A man's quarrel with another of your men (for "settle a beef"). */
export function beefOf(s: GameState, id: string): string | undefined {
  const c = s.characters[id];
  if (!c || c.faction !== 'player') return undefined;
  let best: string | undefined;
  let worst = 0;
  for (const o of Object.values(s.characters)) {
    if (!o.alive || o.id === id || o.id === s.playerId || o.faction !== 'player' || o.rank === 'civilian') continue;
    const r = getRelation(s, id, o.id);
    const bad = (r?.grievance ?? 0) + Math.max(0, -opinion(s, id, o.id));
    if (bad >= 25 && bad > worst) { worst = bad; best = o.id; }
  }
  return best;
}

/** The boss's child who could have this man as godfather (young, no compare yet). */
export function godchildFor(s: GameState): Character | undefined {
  const taken = new Set(Object.values(s.bonds?.ties ?? {}).map((t) => t.compare).filter(Boolean));
  return kidsOf(s).filter((k) => ageOf(s, k) < 14 && !taken.has(k.id)).sort((a, b) => ageOf(s, a) - ageOf(s, b))[0];
}

/** Gestures that fit this person now (each a real order: previewed, costed, timed). */
export function gesturesFor(s: GameState, id: string): PlayerAction[] {
  const t = peekTie(s, id);
  const c = s.characters[id];
  if (!t || !c) return [];
  const b = (op: BondAction): PlayerAction => ({ kind: 'bond', op });
  const gifts = giftablesFor(s, id);
  const gift = gifts.length ? gifts[Math.min(gifts.length - 1, t.ax.aff >= 60 ? 1 : 0)] : undefined;
  const out: PlayerAction[] = [];
  const neg = t.mem.some((m) => m.v <= -8 && s.week - m.w <= 12 && m.k !== 'apology');
  switch (t.role) {
    case 'wife': {
      if (separated(s, id)) { out.push({ kind: 'dating', op: { op: 'reconcile', id } }); break; }
      // Her match waiting on his answer (matchmakers.ts).
      if (proposalView(s)?.by.id === id) out.push(b({ op: 'match', id, answer: 'bless' }), b({ op: 'match', id, answer: 'grumble' }), b({ op: 'match', id, answer: 'veto' }));
      if (t.confront !== undefined) out.push(b({ op: 'confess', id }), b({ op: 'deny', id }));
      if (anniversaryNow(s, id) && t.annivYear !== annivOcc(s, id)) out.push(b({ op: 'anniversary', id }));
      out.push(b({ op: 'date', id }));
      if (neg) out.push(b({ op: 'apologize', id }));
      if (t.amb?.status === 'wants') out.push(b({ op: 'ambition', id, back: true }), b({ op: 'ambition', id, back: false }));
      if (kidsOf(s).length) out.push(b({ op: 'kids', id, stance: 'college' }), b({ op: 'kids', id, stance: 'family' }));
      if (gift) out.push(b({ op: 'gift', id, item: gift.id }));
      out.push(b({ op: 'vacation', id }));
      if (t.confront === undefined && cheating(s)) out.push(b({ op: 'confess', id }));
      if (t.confront === undefined && (t.sus ?? 0) >= 35) out.push(b({ op: 'deny', id }));
      break;
    }
    case 'goomar':
    case 'lover': {
      if (t.ult !== undefined) out.push(b({ op: 'ultimatum', id, answer: 'leave' }), b({ op: 'ultimatum', id, answer: 'stall' }), b({ op: 'ultimatum', id, answer: 'end' }));
      if (t.preg && !t.preg.stance) out.push(b({ op: 'baby', id, stance: 'support' }), b({ op: 'baby', id, stance: 'distance' }));
      out.push(b({ op: 'attention', id }));
      if (activeGoomars(s).length > 1 || t.ax.resent >= 20) out.push(b({ op: 'reassure', id }));
      if (gift) out.push(b({ op: 'gift', id, item: gift.id }));
      if (t.role === 'goomar') out.push(b({ op: 'herFamily', id }));
      if (neg) out.push(b({ op: 'apologize', id }));
      if (t.role === 'goomar') out.push({ kind: 'nightlife', op: { op: 'endGoomar', id } });
      break;
    }
    case 'kid':
      out.push(b({ op: 'kidTime', id }));
      if (gift) out.push(b({ op: 'gift', id, item: gift.id }));
      if (neg) out.push(b({ op: 'apologize', id }));
      break;
    case 'rival':
      out.push(b({ op: 'peace', id }), b({ op: 'drink', id }));
      break;
    default: {
      out.push(b({ op: 'drink', id }), b({ op: 'fishing', id }), b({ op: 'cards', id }));
      const kid = godchildFor(s);
      if (kid && (t.stage === 'best' || t.stage === 'friend') && !t.compare) out.push(b({ op: 'godfather', id, kidId: kid.id }));
      if (!t.loan && !t.welsh) out.push(b({ op: 'lend', id, amount: 500 }));
      const other = beefOf(s, id);
      if (other) out.push(b({ op: 'settle', id, other, side: 'him' }), b({ op: 'settle', id, other, side: 'split' }), b({ op: 'settle', id, other, side: 'other' }));
      if (c.faction === 'player') out.push(b({ op: 'test', id }));
      if (t.knows2 === undefined && (t.stage === 'friend' || t.stage === 'best' || t.stage === 'compare')) out.push(b({ op: 'confide', id }));
      if (gift) out.push(b({ op: 'gift', id, item: gift.id }));
      if (neg) out.push(b({ op: 'apologize', id }));
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Previews: what it costs, who decides, what can go wrong              */
/* ------------------------------------------------------------------ */

const ROMANTIC = new Set<BondAction['op']>(['date', 'anniversary', 'attention', 'reassure', 'ultimatum', 'baby', 'herFamily', 'confess', 'deny', 'vacation']);
const ROLES_OF: Partial<Record<BondAction['op'], BondRole[]>> = {
  date: ['wife'], anniversary: ['wife'], confess: ['wife'], deny: ['wife'], vacation: ['wife'], kids: ['wife'], ambition: ['wife'],
  kidTime: ['kid'], attention: ['goomar', 'lover'], reassure: ['goomar', 'lover'], ultimatum: ['goomar'], baby: ['goomar', 'lover'], herFamily: ['goomar'],
  drink: ['friend', 'crew', 'rival'], fishing: ['friend', 'crew'], cards: ['friend', 'crew'], godfather: ['friend', 'crew'], lend: ['friend', 'crew'],
  settle: ['friend', 'crew'], test: ['friend', 'crew'], confide: ['friend', 'crew'], peace: ['rival', 'crew', 'friend'],
};

export const BOND_TITLE: Record<BondAction['op'], string> = {
  date: 'Date night', anniversary: 'Your anniversary', apologize: 'Apologize', confess: 'Tell her the truth', deny: 'Deny it', vacation: 'A family weekend in Cape May',
  gift: 'A gift', kids: 'The kids\' future', ambition: 'Her own ambition', kidTime: 'An afternoon together', attention: 'An evening at her place', reassure: 'Reassure her',
  ultimatum: 'Her ultimatum', baby: 'The baby', herFamily: 'Help her family', drink: 'Have a drink', fishing: 'Go fishing', cards: 'The card game', godfather: 'Ask him to stand godfather',
  lend: 'Lend him money', settle: 'Settle a beef', test: 'Test his loyalty', confide: 'Confide in him', peace: 'Clear the air',
  match: 'Her match', herFavor: 'Call in a favor',
};

function acc(base: number, reasons: Reason[], lo = 0.05, hi = 0.95): Acceptance {
  const sum = reasons.reduce((a, r) => a + r.value, base);
  return { chance: Math.max(lo, Math.min(hi, sum / 100)), reasons: [{ label: 'Base', value: base }, ...reasons.filter((r) => r.value !== 0)] };
}

/** How the person feels, as reasons for their answer. */
function feelings(t: Tie, k = 1): Reason[] {
  return [
    { label: `Affection ${t.ax.aff}`, value: Math.round((t.ax.aff - 50) * 0.4 * k) },
    { label: `Resentment ${t.ax.resent}`, value: -Math.round(t.ax.resent * 0.4 * k) },
  ];
}

/** What she would decide right now if it came out (no dice): for the preview. */
export function wifeLeaning(s: GameState, t: Tie, how: 'confess' | 'deny' | 'silence'): 'stay' | 'kids' | 'leave' {
  const sc = wifeScore(s, t, how);
  return sc >= 45 ? 'stay' : minorKids(s).length && sc >= 5 ? 'kids' : 'leave';
}
const LEANING_TEXT = { stay: 'she would probably stay, and want it ended', kids: 'she would probably stay, for the kids, and go cold', leave: 'she would probably leave you' } as const;

function wifeScore(s: GameState, t: Tie, how: 'confess' | 'deny' | 'silence'): number {
  const c = s.characters[t.id];
  const known = Math.max(1, activeGoomars(s).filter((g) => g.wifeKnows || g.public).length);
  return t.ax.aff + t.ax.trust / 2 - t.ax.resent - 10 * known + (minorKids(s).length ? 25 : 0) + (c && hasTrait(c, 'Pious') ? 10 : 0)
    + (how === 'confess' ? 12 : how === 'deny' ? -15 : -8) - (t.lied ? 10 : 0);
}

export function previewBond(s: GameState, a: BondAction): ActionPreview {
  if (a.op === 'match' || a.op === 'herFavor') return previewMatchmaker(s, a);
  const c = s.characters[a.id];
  const boss = s.characters[s.playerId];
  const t = peekTie(s, a.id);
  const title = c ? `${BOND_TITLE[a.op]}: ${c.firstName}` : BOND_TITLE[a.op];
  const base: ActionPreview = { title, effects: [], cost: 0, because: `${BOND_TITLE[a.op].toLowerCase()} with ${c?.firstName ?? 'someone'}`, category: 'event' };
  if (!c || !boss || !t) return { ...base, disabledReason: 'Not one of your people' };
  const block = bondBlock(s, a, c, t);
  const first = c.firstName;
  const eff = (label: string) => [X(a, label)];
  const refuse = (what: string) => [X({ op: 'refused', id: c.id, what }, `${first} said no`)];
  const p: ActionPreview = { ...base, effects: eff(title), disabledReason: block };
  const rec = recallLine(s, t);
  switch (a.op) {
    case 'date': {
      p.cost = 60; p.pot = 'pocket';
      p.effects = [{ type: 'money', pot: 'pocket', amount: -60, label: `Dinner at the Admiral with ${first}` }, ...eff(title)];
      p.detail = `Dinner at the Admiral, the two of you, no business at the table. ${first} decides whether she is in the mood for it.${rec ? ` She may bring up: ${rec}` : ''}`;
      p.acceptance = acc(80, feelings(t));
      p.refuseEffects = refuse('a date night');
      return p;
    }
    case 'anniversary': {
      p.cost = 150; p.pot = 'pocket';
      p.effects = [{ type: 'money', pot: 'pocket', amount: -150, label: `Anniversary with ${first}` }, ...eff(title)];
      p.detail = `The Sea Isle supper club, the song from your wedding, a corsage. ${anniversaryNow(s, c.id) ? 'It is this week.' : ''} Forgetting it is remembered for years.`;
      return p;
    }
    case 'apologize': {
      const m = t.mem.filter((x) => x.v < 0 && x.k !== 'apology').slice(-1)[0];
      p.detail = m ? `For ${m.t}. ${first} decides whether it means anything.` : `${first} decides whether it means anything.`;
      p.acceptance = acc(55, [...feelings(t, 0.5), { label: `Trust ${t.ax.trust}`, value: Math.round((t.ax.trust - 50) * 0.4) }, ...(memsOf(t, 'apology').filter((x) => s.week - x.w < 12).length ? [{ label: 'You apologized not long ago', value: -20 }] : [])]);
      p.refuseEffects = refuse('the apology');
      return p;
    }
    case 'confess': {
      const lean = wifeLeaning(s, t, 'confess');
      p.detail = `Everything, at the kitchen table: ${otherWomen(s).map((id) => s.characters[id]?.firstName).filter(Boolean).join(', ') || 'the other woman'}. It will hurt; a lie found out hurts more. Then ${first} decides (right now ${LEANING_TEXT[lean]}).`;
      p.warning = `She decides: stay, stay for the kids, or leave. Right now ${LEANING_TEXT[lean]}.`;
      return p;
    }
    case 'deny': {
      const knows = t.knows !== undefined;
      p.detail = knows
        ? `She has proof. Denying it to her face costs trust, and then ${first} decides (right now ${LEANING_TEXT[wifeLeaning(s, t, 'deny')]}).`
        : `She only suspects. About ${Math.round(t.ax.trust * 0.9)}% she believes you; the lie is remembered if it ever comes out.`;
      if (knows) p.warning = 'She knows. A denial now is an insult.';
      return p;
    }
    case 'vacation': {
      p.cost = 600; p.pot = 'pocket';
      p.effects = [{ type: 'money', pot: 'pocket', amount: -600, label: 'A family weekend in Cape May' }, ...eff(title)];
      p.detail = `The Chalfonte, the beach at Sunset, the kids on the carousel. A day of yours. ${first} decides whether she wants to go.`;
      p.acceptance = acc(85, feelings(t, 0.6));
      p.refuseEffects = refuse('the weekend away');
      return p;
    }
    case 'gift': {
      const g = giftablesFor(s, c.id).find((x) => x.id === a.item);
      if (!g) return { ...p, disabledReason: p.disabledReason ?? 'Not a gift for them' };
      const recent = memsOf(t, 'gift').filter((m) => s.week - m.w < 8).length;
      p.cost = g.cost; p.pot = 'pocket';
      p.title = `${g.label} for ${first}`;
      p.effects = [{ type: 'money', pot: 'pocket', amount: -g.cost, label: `${g.label} for ${first}` }, X(a, p.title)];
      p.detail = `${g.label}. Warms ${her(c)} a little${recent ? ` (less each time: ${recent} in the last 8 weeks)` : ''}; it never decides anything for ${her(c)}.${(g.flash ?? 0) >= 6 ? ' People will notice it, and so will the IRS.' : ''}${t.ax.resent >= 50 ? ` After everything, ${she(c)} may take it as an insult.` : ''}`;
      return p;
    }
    case 'kids': {
      const wish = kidsWish(s, c.id);
      p.title = `${a.stance === 'college' ? 'College and a clean life' : 'The boys come into the family'}: talk it out with ${first}`;
      p.detail = `${first} wants ${wish === 'college' ? 'college for the kids, a clean name, out of the life' : 'a place for the boys in the family'}. ${a.stance === wish ? 'You agree with her.' : 'You don\'t: it will be a fight.'}`;
      p.effects = eff(p.title);
      return p;
    }
    case 'ambition': {
      const k = t.amb?.kind ?? ambitionKind(s, c.id);
      const info = AMBITION_TEXT[k];
      p.title = `${a.back ? 'Back' : 'Refuse'} ${first}: ${info.label.toLowerCase()}`;
      p.cost = a.back ? info.cost : 0;
      if (a.back && info.cost) { p.pot = 'pocket'; p.effects = [{ type: 'money', pot: 'pocket', amount: -info.cost, label: `${info.label} (${first})` }, X(a, p.title)]; } else p.effects = eff(p.title);
      p.detail = `She wants to ${info.want}. ${a.back ? 'Something of her own, with your blessing.' : '"A wife of mine doesn\'t need it." She will remember who said no.'}`;
      return p;
    }
    case 'kidTime':
      p.detail = `The Boardwalk, Custard's Last Stand, the rides at Hunt's Pier. ${first} remembers these afternoons.`;
      return p;
    case 'attention':
      p.detail = `An evening at ${her(c)} place, the radio on. The evening fades to the morning. ${first} decides whether ${she(c)} wants company tonight.`;
      p.acceptance = acc(75, feelings(t));
      p.refuseEffects = refuse('the evening');
      if (wifeOf(s)) p.warning = 'Every evening away is an evening your wife notices.';
      return p;
    case 'reassure':
      p.detail = `Tell ${her(c)} where ${she(c)} stands. ${activeGoomars(s).length > 1 ? 'She knows she is not the only one.' : ''}`;
      return p;
    case 'ultimatum': {
      const w = wifeOf(s);
      p.title = a.answer === 'leave' ? `Leave ${w?.firstName ?? 'your wife'} for ${first}` : a.answer === 'stall' ? `Ask ${first} for more time` : `End it with ${first}`;
      p.effects = eff(p.title);
      p.detail = a.answer === 'leave'
        ? `You move out. ${w?.firstName ?? 'Your wife'} and the kids stay in the house. The parish, Philadelphia and your mother will all have something to say.`
        : a.answer === 'stall' ? `Four more weeks, once. ${first} will trust you less for it.` : `She keeps the apartment until the lease runs out. She will not forget it.`;
      if (a.answer === 'leave') p.warning = `A separation from ${w?.firstName ?? 'your wife'}: her people, your family and the Church take it badly.`;
      return p;
    }
    case 'baby':
      p.title = a.stance === 'support' ? `Stand by ${first} and the baby` : `Keep your distance from ${first}'s baby`;
      p.effects = a.stance === 'support' ? [{ type: 'money', pot: 'pocket', amount: -500, label: `For ${first} and the baby` }, X(a, p.title)] : eff(p.title);
      p.cost = a.stance === 'support' ? 500 : 0; if (p.cost) p.pot = 'pocket';
      p.detail = `${first} has decided to have the baby; that was ${her(c)} decision to make. Yours is where you stand: ${a.stance === 'support' ? 'money for the doctor at Burdette Tomlin and the crib, and your word that the child wants for nothing.' : 'you keep your distance. She will remember it.'}`;
      return p;
    case 'herFamily':
      p.cost = 300; p.pot = 'pocket';
      p.effects = [{ type: 'money', pot: 'pocket', amount: -300, label: `For ${first}'s family` }, ...eff(title)];
      p.detail = `Her mother's doctor in Philadelphia, her brother's union card. Quietly. ${first} will know who it came from.`;
      return p;
    case 'drink':
      p.detail = `The back booth at the Ship Bottom, a couple of rye-and-gingers.${t.role === 'rival' ? ' Neutral ground.' : ''}${rec ? ` He may bring up: ${rec}` : ''}`;
      p.acceptance = acc(t.role === 'rival' ? 45 : 85, feelings(t, t.role === 'rival' ? 0.5 : 1));
      p.refuseEffects = refuse('a drink');
      return p;
    case 'fishing':
      p.cost = 20; p.pot = 'pocket';
      p.effects = [{ type: 'money', pot: 'pocket', amount: -20, label: `Bait and beer with ${first}` }, ...eff(title)];
      p.detail = 'A rented boat out of Otten\'s Harbor, flounder off Hereford Inlet, nobody else for miles. Most of a day.';
      p.acceptance = acc(80, feelings(t));
      p.refuseEffects = refuse('the fishing trip');
      return p;
    case 'cards':
      p.detail = 'Pinochle in the back of the Beachcomber, a pot that matters. You may win or lose a little from your pocket.';
      p.acceptance = acc(85, feelings(t, 0.8));
      p.refuseEffects = refuse('the card game');
      return p;
    case 'godfather': {
      const kid = s.characters[a.kidId];
      p.title = `Ask ${first} to stand godfather to ${kid?.firstName ?? 'your child'}`;
      p.effects = eff(p.title);
      p.detail = `At St. Ann's, before God and the whole island. He becomes your compare: family, in every way that counts. He decides.`;
      p.acceptance = acc(70, [...feelings(t, 0.6), { label: `Trust ${t.ax.trust}`, value: Math.round((t.ax.trust - 50) * 0.4) }, { label: STAGE_TEXT[t.stage], value: t.stage === 'best' ? 20 : 0 }]);
      p.refuseEffects = refuse('standing godfather');
      return p;
    }
    case 'lend':
      p.cost = a.amount; p.pot = 'pocket';
      p.effects = [{ type: 'money', pot: 'pocket', amount: -a.amount, label: `Lent ${first} ${$(a.amount)}` }, ...eff(`Lent ${first} ${$(a.amount)}`)];
      p.title = `Lend ${first} ${$(a.amount)}`;
      p.detail = `From your own pocket, no vig, between friends. Due in eight weeks. ${hasTrait(c, 'Greedy') ? 'He is Greedy: you may not see it again.' : hasTrait(c, 'Honest') ? 'He is Honest: good for it.' : ''}`;
      return p;
    case 'settle': {
      const o = s.characters[a.other];
      p.title = a.side === 'split' ? `Split the difference between ${first} and ${o?.firstName ?? '?'}` : `Settle ${first}'s beef with ${o?.firstName ?? '?'}: side with ${a.side === 'him' ? first : o?.firstName ?? '?'}`;
      p.effects = eff(p.title);
      p.detail = `They sit across from you at the Gold Coast and say their piece. ${a.side === 'split' ? 'Neither one wins; both feel heard.' : 'One walks out happy, the other remembers.'}`;
      return p;
    }
    case 'test':
      p.detail = `Let a bit of false business slip in front of him and see where it ends up. If he is a rat, you may catch him. If he is straight and figures out it was a test, he will not like it.`;
      return p;
    case 'confide':
      p.detail = `Tell him what keeps you up at night. A friend who knows that much is closer, and dangerous if it ever goes bad between you.`;
      p.warning = 'A confidant who knows too much: if he turns on you, it comes out.';
      return p;
    case 'peace':
      p.detail = 'Coffee at the Doo Wop diner, no muscle, no grudges on the table. He decides whether he is ready.';
      p.acceptance = acc(40, [{ label: `Resentment ${t.ax.resent}`, value: -Math.round(t.ax.resent * 0.4) }, { label: `Respect ${t.ax.respect}`, value: Math.round((t.ax.respect - 50) * 0.3) }]);
      p.refuseEffects = refuse('clearing the air');
      return p;
  }
  return p;
}

/** Why this gesture can't be made now (undefined: it can). */
export function bondBlock(s: GameState, a: BondAction, c: Character, t: Tie): string | undefined {
  const boss = s.characters[s.playerId];
  if (!c.alive) return 'Not among the living';
  if (!boss?.alive) return 'You are gone';
  if (!isFree(s, boss)) return 'You are inside';
  if (!isFree(s, c)) return `${c.firstName} is inside`;
  const roles = ROLES_OF[a.op];
  if (roles && !roles.includes(t.role)) return `Not for ${ROLE_LABEL_LOWER[t.role]}`;
  if (ROMANTIC.has(a.op) && (!adult(s, c) || !adult(s, boss))) return 'Adults only';
  if (t.role === 'wife' && separated(s, c.id) && a.op !== 'kids' && a.op !== 'apologize' && a.op !== 'gift') return 'You are separated: ask her to come home first';
  switch (a.op) {
    case 'anniversary': return !anniversaryNow(s, c.id) ? `Not your anniversary (week ${annivWeek(s, c.id) + 1} of the year)` : t.annivYear === annivOcc(s, c.id) ? 'Already done this year' : undefined;
    case 'apologize': return t.mem.some((m) => m.v < 0 && s.week - m.w <= 26) ? undefined : 'Nothing to apologize for lately';
    case 'confess': return t.confront === undefined && !cheating(s) ? 'Nothing to confess' : undefined;
    case 'deny': return t.confront === undefined && (t.sus ?? 0) < 35 ? 'She has not asked' : undefined;
    case 'kids': return kidsOf(s).length ? (t.mem.some((m) => m.t.includes('kids\' future') && s.week - m.w < 12) ? 'You talked about it lately' : undefined) : 'No children';
    case 'ambition': return t.amb?.status === 'wants' ? undefined : 'She has not asked for anything';
    case 'ultimatum': return t.ult === undefined ? 'She has not given you one' : a.answer === 'stall' && t.stalled ? 'You already asked for more time' : a.answer === 'leave' && !wifeOf(s) ? 'You have no wife to leave' : undefined;
    case 'baby': return !t.preg ? 'She is not expecting' : t.preg.stance ? 'You already told her where you stand' : undefined;
    case 'herFamily': return memsOf(t, 'family').some((m) => s.week - m.w < 26) ? 'You helped them not long ago' : undefined;
    case 'godfather': {
      const kid = s.characters[a.kidId];
      if (!kid?.alive || !boss.childrenIds.includes(kid.id)) return 'Not your child';
      if (t.compare) return 'He is already your compare';
      if (Object.values(s.bonds?.ties ?? {}).some((x) => x.compare === kid.id)) return `${kid.firstName} has a godfather`;
      return t.stage === 'friend' || t.stage === 'best' ? undefined : `Only a real friend (now: ${STAGE_TEXT[t.stage].toLowerCase()})`;
    }
    case 'lend': return t.welsh ? 'He never paid back the last one' : t.loan ? 'He still owes you' : a.amount <= 0 ? 'Nothing to lend' : undefined;
    case 'settle': {
      const o = s.characters[a.other];
      return !o?.alive || o.faction !== 'player' ? 'Not one of yours' : beefOf(s, c.id) !== a.other ? 'No beef between them now' : undefined;
    }
    case 'test': return c.faction !== 'player' ? 'Not one of yours' : memsOf(t, 'test').some((m) => s.week - m.w < 26) ? 'You tested him not long ago' : undefined;
    case 'confide': return t.knows2 !== undefined ? 'He already knows' : t.stage === 'friend' || t.stage === 'best' || t.stage === 'compare' ? undefined : 'Not a man you confide in (not a friend yet)';
    default: return undefined;
  }
}

const ROLE_LABEL_LOWER: Record<BondRole, string> = { wife: 'your wife', goomar: 'your goomar', lover: 'her', kid: 'your child', friend: 'a friend', crew: 'your crew', rival: 'an enemy' };

export function describeBondOp(s: GameState, o: BondOp): string | undefined {
  if (o.op === 'match' || o.op === 'herFavor' || o.op === 'matchNo' || o.op === 'knewBest') return describeMatchOp(s, o);
  const c = s.characters[o.id];
  if (!c) return undefined;
  if (o.op === 'refused') return `${c.firstName} said no`;
  return `${BOND_TITLE[o.op]} with ${c.firstName}`;
}

/* ------------------------------------------------------------------ */
/* Doing it                                                            */
/* ------------------------------------------------------------------ */

/** Mirror the tie onto the opinion system (one named modifier each). */
function mirror(s: GameState, t: Tie): void {
  if (t.role === 'rival' || (t.role === 'crew' && !t.mem.length)) return;
  const v = Math.round((t.ax.aff - 50) / 4 + (t.ax.trust - 50) / 8 - t.ax.resent / 5);
  setModifier(s, t.id, s.playerId, 'Our history', Math.max(-30, Math.min(30, v)));
}

function attend(s: GameState, t: Tie): void {
  t.last = s.week;
}

export function applyBondOp(ctx: Ctx, o: BondOp): void {
  if (o.op === 'match' || o.op === 'herFavor' || o.op === 'matchNo' || o.op === 'knewBest') { applyMatchOp(ctx, o); return; }
  const s = ctx.s;
  const B = ensureBonds(s);
  const c = s.characters[o.id];
  const boss = s.characters[s.playerId];
  if (!c?.alive || !boss) return;
  const t = ensureTie(s, o.id);
  if (!t) return;
  // Backstops at the moment it happens: adults only for romance, the right person.
  if (o.op !== 'refused') {
    if (bondBlock(s, o, c, t)) return;
    if (ROMANTIC.has(o.op) && (!adult(s, c) || !adult(s, boss))) return;
  }
  const first = c.firstName;
  const say = (line: string) => ctx.log.push(line);
  const rec = recallLine(s, t, s.week);
  switch (o.op) {
    case 'refused':
      nudge(t, { aff: -1 });
      remember(s, t, 'fight', `the time ${first} turned down ${o.what}`, -3);
      break;
    case 'date': {
      attend(s, t);
      const warm = t.ax.resent < 40;
      nudge(t, { aff: warm ? 8 : 4, attr: 4, resent: -6, respect: 2 });
      remember(s, t, 'date', `the night at the Admiral, just the two of us`, warm ? 8 : 4);
      say(`Date night with ${first}.${rec ? ` Over coffee she brought up ${rec.replace(/^"|"$/g, '')}` : ''}`);
      break;
    }
    case 'anniversary': {
      attend(s, t);
      t.annivYear = annivOcc(s, c.id);
      const missedBefore = memsOf(t, 'missedAnniv').length;
      nudge(t, { aff: 12, attr: 5, resent: -10, trust: 3 });
      remember(s, t, 'anniversary', `our anniversary at the Sea Isle supper club, ${s.date.y}`, 12);
      say(missedBefore ? `${first}: "You remembered. This year you remembered."` : `Your anniversary with ${first}. They played your song.`);
      break;
    }
    case 'apologize': {
      attend(s, t);
      const m = t.mem.filter((x) => x.v < 0 && x.k !== 'apology').slice(-1)[0];
      nudge(t, { resent: -15, aff: 4, trust: 3, respect: t.role === 'crew' || t.role === 'friend' ? -2 : 0 });
      if (m) m.v = Math.min(0, m.v + 6);
      remember(s, t, 'apology', `the time you said you were sorry${m ? ` about ${m.t}` : ''}`, 5);
      say(`You apologized to ${first}.`);
      break;
    }
    case 'confess': {
      B.stats.confessed++;
      const fresh = t.knows === undefined;
      t.knows ??= s.week;
      nudge(t, fresh ? { aff: -15, trust: -10, resent: 20 } : { trust: 5, resent: -5 });
      remember(s, t, 'confess', 'the night you told her everything at the kitchen table', -8);
      for (const g of activeGoomars(s)) g.wifeKnows = true;
      wifeDecides(ctx, t, 'confess');
      break;
    }
    case 'deny': {
      B.stats.denied++;
      if (t.knows !== undefined) {
        nudge(t, { trust: -15, resent: 10, respect: -8 });
        t.lied = true;
        remember(s, t, 'lie', 'the time you looked her in the eye and said there was nobody', -12);
        wifeDecides(ctx, t, 'deny');
      } else if (R(s, 'believe', c.id) < t.ax.trust * 0.009) {
        t.sus = Math.max(0, (t.sus ?? 0) - 30);
        t.lied = true;
        remember(s, t, 'lie', 'the night you told her there was nobody', -2);
        say(`${first} believed you. For now.`);
      } else {
        t.sus = Math.min(100, (t.sus ?? 0) + 15);
        nudge(t, { trust: -8 });
        t.lied = true;
        remember(s, t, 'lie', 'the night you told her there was nobody', -6);
        say(`${first} didn't believe a word.`);
      }
      break;
    }
    case 'vacation': {
      attend(s, t);
      nudge(t, { aff: 10, resent: -10, trust: 4 });
      remember(s, t, 'vacation', 'the weekend in Cape May with the kids', 10);
      for (const k of kidsOf(s)) { const kt = ensureTie(s, k.id, 'kid'); if (kt) { attend(s, kt); nudge(kt, { aff: 6 }); remember(s, kt, 'vacation', 'the carousel in Cape May', 6); } }
      applyEffects(ctx, [{ type: 'dyn', op: { op: 'stress', charId: boss.id, amount: -8, source: 'domestic' }, label: 'A weekend away' } as Effect], { label: 'Cape May', because: 'took the family away', category: 'event' });
      say(`A weekend in Cape May with ${first} and the kids.`);
      break;
    }
    case 'gift': {
      const g = giftablesFor(s, c.id).find((x) => x.id === o.item);
      if (!g) break;
      const recent = memsOf(t, 'gift').filter((m) => s.week - m.w < 8).length;
      const warmth = Math.max(1, Math.round(g.warmth / (1 + recent)));
      if (t.ax.resent >= 50 && R(s, 'insult', c.id) < 0.4) {
        nudge(t, { resent: 3 });
        remember(s, t, 'gift', `${g.label.toLowerCase()} after everything, as if that fixed it`, -3);
        say(`${first} looked at ${g.label.toLowerCase()} and put it in a drawer.`);
      } else {
        nudge(t, { aff: warmth, resent: -Math.round(warmth / 2) });
        remember(s, t, 'gift', g.label.toLowerCase(), Math.min(10, warmth));
        say(`${first} liked ${g.label.toLowerCase()}.`);
      }
      attend(s, t);
      break;
    }
    case 'kids': {
      attend(s, t);
      const wish = kidsWish(s, c.id);
      if (o.stance === wish) {
        nudge(t, { respect: 8, aff: 5, trust: 4 });
        remember(s, t, 'kids', 'the talk about the kids\' future, when you listened', 8);
        say(`You and ${first} agree about the kids.`);
      } else {
        nudge(t, { resent: 12, aff: -6, respect: -4 });
        remember(s, t, 'fight', `the fight about the kids' future`, -10);
        say(`A fight with ${first} about the kids. The door slammed.`);
      }
      break;
    }
    case 'ambition': {
      attend(s, t);
      const k = t.amb?.kind ?? ambitionKind(s, c.id);
      t.amb = { kind: k, status: o.back ? 'backed' : 'refused', week: s.week };
      if (o.back) {
        nudge(t, { respect: 15, aff: 8, trust: 5, resent: -8 });
        remember(s, t, 'ambition', `the day you backed ${AMBITION_TEXT[k].label.toLowerCase()}`, 12);
        say(`${first}: ${AMBITION_TEXT[k].label.toLowerCase()}, with your blessing.`);
      } else {
        nudge(t, { resent: 15, aff: -6, respect: -6 });
        remember(s, t, 'fight', `the day you said no to ${AMBITION_TEXT[k].label.toLowerCase()}`, -12);
        say(`You told ${first} no. She said nothing at all.`);
      }
      break;
    }
    case 'kidTime': {
      attend(s, t);
      nudge(t, { aff: 8, respect: 3, resent: -5 });
      remember(s, t, 'date', 'the afternoon on Hunt\'s Pier', 7);
      const w = wifeOf(s);
      const wt = w ? ensureTie(s, w.id, 'wife') : undefined;
      if (wt) nudge(wt, { aff: 2, respect: 2 });
      say(`An afternoon with ${first} on the Boardwalk.`);
      break;
    }
    case 'attention': {
      attend(s, t);
      nudge(t, { aff: 7, attr: 3, resent: -5, trust: 2 });
      remember(s, t, 'date', 'the evening you stayed and the radio played', 6);
      const w = wifeOf(s);
      const wt = w ? ensureTie(s, w.id, 'wife') : undefined;
      if (wt && !separated(s, wt.id)) wt.sus = Math.min(100, (wt.sus ?? 0) + 4);
      say(`An evening at ${first}'s place. The morning came too soon.`);
      break;
    }
    case 'reassure': {
      attend(s, t);
      nudge(t, { resent: -10, trust: 4 });
      remember(s, t, 'favor', 'the night you told her where she stands', 4);
      say(`You told ${first} where she stands.`);
      break;
    }
    case 'ultimatum': {
      const w = wifeOf(s);
      if (o.answer === 'leave' && w) {
        t.ult = undefined;
        nudge(t, { aff: 15, trust: 15, resent: -20 });
        remember(s, t, 'ultimatum', 'the day you left your wife for her', 20);
        const wt = ensureTie(s, w.id, 'wife');
        if (wt) { nudge(wt, { aff: -30, trust: -30, resent: 40 }); wt.knows ??= s.week; wt.confront = undefined; remember(s, wt, 'betrayal', `the day you left us for ${first}`, -30); }
        applyEffects(ctx, [
          { type: 'storyOp', op: { op: 'separate', a: boss.id }, label: `You left ${w.firstName}` } as Effect,
          { type: 'familyOpinion', amount: -6, reason: 'Left his wife for his goomar', label: 'The family' },
          { type: 'rivalOpinion', rival: 'philly', amount: -4, reason: 'A boss who leaves his wife for a goomar', label: 'Philadelphia hears' } as Effect,
        ], { label: `You left ${w.firstName}`, because: `left your wife for ${first}`, category: 'event' });
        blog(B, s, `You left ${w.firstName} for ${first}.`);
        say(`You left ${w.firstName}. ${first} cried, then laughed.`);
      } else if (o.answer === 'stall') {
        t.stalled = true;
        t.ult = (t.ult ?? s.week) + 4;
        nudge(t, { trust: -15, resent: 8 });
        remember(s, t, 'ultimatum', 'the day you asked her to wait some more', -6);
        say(`${first} gave you four more weeks. She did not smile.`);
      } else {
        t.ult = undefined;
        remember(s, t, 'betrayal', 'the day you chose your wife', -20);
        nudge(t, { aff: -25, resent: 30 });
        applyEffects(ctx, [{ type: 'nightlife', op: { op: 'endGoomar', id: c.id, gift: 300 }, label: `It's over with ${first}` } as Effect], { label: `It's over with ${first}`, because: `ended it with ${first}`, category: 'event' });
        say(`You ended it with ${first}.`);
      }
      break;
    }
    case 'baby': {
      attend(s, t);
      t.preg = { week: t.preg?.week ?? s.week, stance: o.stance };
      if (o.stance === 'support') {
        nudge(t, { trust: 15, aff: 8, resent: -10 });
        remember(s, t, 'baby', 'the day you said the child would want for nothing', 15);
        say(`You told ${first} you'll be there. Whatever happens.`);
      } else {
        nudge(t, { trust: -15, aff: -12, resent: 20 });
        remember(s, t, 'betrayal', 'the day you kept your distance from her baby', -15);
        say(`You told ${first} to manage on her own. She heard you.`);
      }
      break;
    }
    case 'herFamily': {
      attend(s, t);
      nudge(t, { trust: 10, respect: 8, aff: 5 });
      remember(s, t, 'family', 'what you did for her mother', 10);
      say(`${first}'s family got help. She knows where it came from.`);
      break;
    }
    case 'drink':
    case 'fishing':
    case 'cards': {
      attend(s, t);
      const big = o.op === 'fishing';
      nudge(t, { aff: big ? 9 : 5, trust: big ? 5 : 3, respect: 2, resent: t.role === 'rival' ? -6 : -3 });
      const what = o.op === 'fishing' ? 'the flounder off Hereford Inlet' : o.op === 'cards' ? 'the pinochle game at the Beachcomber' : 'the rye-and-gingers at the Ship Bottom';
      remember(s, t, o.op, what, big ? 9 : 5);
      if (o.op === 'cards') {
        const r = R(s, 'cards', c.id);
        const amt = Math.round(50 + r * 150);
        if (r < 0.45) applyEffects(ctx, [{ type: 'money', pot: 'pocket', amount: -amt, label: `Lost at pinochle to ${first}` }], { label: 'Pinochle', because: 'played cards', category: 'event' });
        else if (r > 0.6) earnPocket(ctx, amt, `Won at pinochle off ${first}`, `cards:${c.id}`);
      }
      if (o.op === 'drink' && rec) say(`A drink with ${first}. He brought up ${rec.replace(/^"|"$/g, '')}`);
      else say(`${BOND_TITLE[o.op]} with ${first}.`);
      break;
    }
    case 'godfather': {
      attend(s, t);
      const kid = s.characters[o.kidId];
      t.compare = o.kidId;
      nudge(t, { aff: 15, trust: 15, respect: 10, resent: -10 });
      remember(s, t, 'godfather', `the christening of ${kid?.firstName ?? 'your child'} at St. Ann's`, 20);
      B.stats.compares++;
      blog(B, s, `${displayName(c)} stood godfather to ${kid?.firstName ?? 'your child'}. Your compare.`);
      applyEffects(ctx, [{ type: 'opinion', from: c.id, to: boss.id, amount: 15, reason: 'My compare', decay: 0, label: `${first} is your compare` }], { label: 'The christening', because: `made ${first} godfather`, category: 'event' });
      say(`${first} stood godfather to ${kid?.firstName ?? 'your child'}. Compare.`);
      break;
    }
    case 'lend': {
      attend(s, t);
      t.loan = { amount: o.amount, due: s.week + 8 };
      nudge(t, { aff: 6, trust: 5, respect: 3 });
      remember(s, t, 'loan', `the ${$(o.amount)} you lent him, no questions`, 8);
      say(`You lent ${first} ${$(o.amount)}.`);
      break;
    }
    case 'settle': {
      attend(s, t);
      const other = s.characters[o.other];
      if (!other) break;
      const ot = ensureTie(s, other.id, roleFor(s, other.id) ?? 'crew');
      const rel = getRelation(s, c.id, other.id);
      if (rel) rel.grievance = Math.max(0, rel.grievance - (o.side === 'split' ? 20 : 30));
      const rel2 = getRelation(s, other.id, c.id);
      if (rel2) rel2.grievance = Math.max(0, rel2.grievance - 15);
      const winner = o.side === 'him' ? t : o.side === 'other' ? ot : undefined;
      const loser = o.side === 'him' ? ot : o.side === 'other' ? t : undefined;
      if (winner) { nudge(winner, { aff: 10, respect: 6 }); remember(s, winner, 'beef', 'the day you took my side at the Gold Coast', 10); }
      if (loser) { nudge(loser, { resent: 15, aff: -6 }); remember(s, loser, 'fight', 'the day you sided against me at the Gold Coast', -12); }
      if (!winner) for (const x of [t, ot]) if (x) { nudge(x, { respect: 6, aff: 2 }); remember(s, x, 'beef', 'the sit-down at the Gold Coast, when you heard us both out', 5); }
      say(`You settled it between ${first} and ${other.firstName}.`);
      break;
    }
    case 'test': {
      remember(s, t, 'test', 'the bit of business that never happened', 0);
      const rat = c.informantFor && c.informantFor !== 'player';
      if (rat && R(s, 'catch', c.id) < 0.55) {
        const sec = addSecret(s, c, 'informant', ['player']);
        if (!sec.knownBy.includes('player')) sec.knownBy.push('player');
        nudge(t, { trust: -40, fear: 20 });
        remember(s, t, 'betrayal', 'the false tip that came back from the wrong people', -25);
        blog(B, s, `${displayName(c)} talks to ${c.informantFor === 'law' ? 'the law' : `the ${c.informantFor}`}. The test caught him.`);
        say(`The false tip came back. ${first} is talking to somebody.`);
      } else if (R(s, 'figured', c.id) < 0.25) {
        nudge(t, { resent: 12, trust: -6, aff: -4 });
        remember(s, t, 'test', 'the day you tested me like a stranger', -10);
        say(`${first} passed, and figured out it was a test. He didn't like it.`);
      } else {
        nudge(t, { trust: 0 });
        say(`${first} passed. Nothing came back.`);
      }
      break;
    }
    case 'confide': {
      attend(s, t);
      t.knows2 = s.week;
      nudge(t, { trust: 12, aff: 6, respect: 4 });
      remember(s, t, 'secret', 'the night you told him what keeps you up', 10);
      say(`You told ${first} things nobody else knows.`);
      break;
    }
    case 'peace': {
      attend(s, t);
      nudge(t, { resent: -20, respect: 5 });
      remember(s, t, 'peace', 'the coffee at the Doo Wop, no muscle', 8);
      say(`Coffee with ${first}. Nothing was settled, but it was quieter after.`);
      break;
    }
  }
  t.stage = computeStage(s, t);
  mirror(s, t);
}

/**
 * Time given through the other layers counts as attention: a dinner, a date,
 * an evening at her place, hosting the family (actions.ts calls this for
 * every order carried out).
 */
export function noteAttention(s: GameState, a: PlayerAction): void {
  const B = s.bonds;
  if (!B) return;
  const ids: string[] = [];
  if (a.kind === 'interact') ids.push(a.target);
  else if ((a.kind === 'dating' || a.kind === 'nightlife') && 'id' in a.op && typeof a.op.id === 'string') ids.push(a.op.id);
  else if (a.kind === 'dynasty' && a.op.type === 'host') {
    const boss = s.characters[s.playerId];
    if (boss?.spouseId) ids.push(boss.spouseId);
    ids.push(...(boss?.childrenIds ?? []));
  }
  for (const id of ids) { const t = B.ties[id]; if (t) t.last = s.week; }
}

/** She decides, after the truth (or the lie) is out. */
export function wifeDecides(ctx: Ctx, t: Tie, how: 'confess' | 'deny' | 'silence'): 'stay' | 'kids' | 'leave' {
  const s = ctx.s;
  const B = ensureBonds(s);
  const c = s.characters[t.id];
  const boss = s.characters[s.playerId];
  t.confront = undefined;
  if (!c || !boss) return 'stay';
  const noise = (R(s, `wifedecide|${how}`, c.id) - 0.5) * 20;
  const sc = wifeScore(s, t, how) + noise;
  const out: 'stay' | 'kids' | 'leave' = sc >= 45 ? 'stay' : minorKids(s).length && sc >= 5 ? 'kids' : 'leave';
  if (out === 'stay') {
    nudge(t, { trust: -5, resent: 5 });
    remember(s, t, 'fight', 'the night she said she would stay, and that it ends', -6);
    blog(B, s, `${c.firstName} stayed. She wants it ended.`);
    ctx.log.push(`${c.firstName} is staying. "It ends. Or I do."`);
  } else if (out === 'kids') {
    B.stats.stayedForKids++;
    t.ax.aff = Math.min(t.ax.aff, 22);
    nudge(t, { resent: 10 });
    remember(s, t, 'fight', 'the night she said she was staying for the kids and nothing else', -14);
    blog(B, s, `${c.firstName} is staying, for the kids. Nothing more.`);
    ctx.log.push(`${c.firstName} is staying, for the kids. Separate rooms.`);
  } else {
    B.stats.left++;
    remember(s, t, 'betrayal', 'the night she packed the kids into her sister\'s car', -25);
    applyEffects(ctx, [
      { type: 'storyOp', op: { op: 'separate', a: c.id }, label: `${c.firstName} left you` } as Effect,
      { type: 'familyOpinion', amount: -4, reason: 'His wife left him', label: 'The family' },
      { type: 'dyn', op: { op: 'stress', charId: boss.id, amount: 12, source: 'domestic' }, label: `${c.firstName} left` } as Effect,
    ], { label: `${c.firstName} left you`, because: 'were found out', category: 'event' });
    blog(B, s, `${c.firstName} left you and took the kids to her sister's in Ventnor.`);
    ctx.log.push(`${c.firstName} left. Her sister's car, the kids in the back seat.`);
  }
  t.stage = computeStage(s, t);
  return out;
}

/* ------------------------------------------------------------------ */
/* The week: drift, the long stories                                   */
/* ------------------------------------------------------------------ */

function found(ctx: Ctx, t: Tie, how: string): void {
  const s = ctx.s;
  const B = ensureBonds(s);
  const c = s.characters[t.id];
  if (!c || t.knows !== undefined) return;
  t.knows = s.week;
  t.confront = s.week;
  t.sus = 100;
  B.stats.found++;
  const k = t.lied ? 2 : 1;
  nudge(t, { aff: -20 * k, trust: -25 * k, resent: 30, respect: -10 });
  remember(s, t, 'found', t.lied ? `the day she found out you lied to her face (${how})` : `the day she found out (${how})`, -25);
  blog(B, s, `${c.firstName} found out: ${how}. She is waiting for you to say it.`);
  ctx.log.push(`${c.firstName} knows (${how}). She is waiting for you at the kitchen table.`);
}

function wifeWeek(ctx: Ctx, t: Tie): void {
  const s = ctx.s;
  const B = ensureBonds(s);
  const c = s.characters[t.id];
  if (!c || separated(s, t.id)) { t.confront = undefined; return; }
  const boss = player(s);
  // The anniversary: missed when two weeks have gone by without it.
  if (annivOffset(s, t.id) === 2) {
    const occ = annivOcc(s, t.id, s.week - 2);
    if (t.annivYear !== occ && s.week - t.since >= 2) {
      t.annivYear = occ;
      const before = memsOf(t, 'missedAnniv').length;
      nudge(t, { aff: before ? -12 : -8, resent: before ? 15 : 10 });
      remember(s, t, 'missedAnniv', `our anniversary in ${s.date.y}, when you forgot`, before ? -14 : -10);
      ctx.log.push(before ? `${c.firstName}: "You missed our anniversary last year too."` : `You forgot your anniversary. ${c.firstName} set the table anyway.`);
    }
  }
  // The other women: the existing systems found out first, or her suspicion grows.
  const goomars = activeGoomars(s);
  const affairFound = activeRomances(s, boss.id).some((r) => r.discovered !== undefined && r.discoveredBy === c.id);
  if (t.knows === undefined && (goomars.some((g) => g.wifeKnows) || affairFound)) found(ctx, t, 'the talk reached her');
  else if (t.knows === undefined && cheating(s)) {
    const recent = weeksApart(s, t) <= 2;
    const grow = 2 + 3 * goomars.length + 4 * goomars.filter((g) => g.public).length + (recent ? -2 : 1) + (hasTrait(boss, 'Womanizer') ? 1 : 0);
    t.sus = Math.max(0, Math.min(100, (t.sus ?? 0) + grow));
    if ((t.sus ?? 0) >= 35 && !t.mem.some((m) => m.k === 'questions' && s.week - m.w < 12)) {
      remember(s, t, 'questions', 'the night she asked where you really were', -4);
      ctx.log.push(`${c.firstName} asked where you were Thursday night.`);
    }
    if ((t.sus ?? 0) >= 70 && R(s, 'find', c.id) < ((t.sus ?? 0) - 55) / 100) {
      const g = goomars.slice().sort((a, b) => Number(!!b.public) - Number(!!a.public))[0];
      if (g) g.wifeKnows = true;
      addOpinionSafe(s, c.id, boss.id, g ? 'He keeps a woman in an apartment' : 'He has another woman', -20);
      found(ctx, t, g ? `a receipt for ${g.where.replace(/^an? /, 'the ')}` : 'a matchbook from a motel');
    }
  } else if (!cheating(s)) t.sus = Math.max(0, (t.sus ?? 0) - 3);
  // Waiting for him to say it: two weeks of silence and she decides on her own.
  if (t.confront !== undefined && s.week - t.confront >= 2) wifeDecides(ctx, t, 'silence');
  // Something of her own.
  if (!t.amb && s.week - t.since >= 8 && R(s, 'amb', c.id) < 0.05) {
    const k = ambitionKind(s, c.id);
    t.amb = { kind: k, status: 'wants', week: s.week };
    remember(s, t, 'ambition', `the night she said she wanted to ${AMBITION_TEXT[k].want}`, 0);
    blog(B, s, `${c.firstName} wants to ${AMBITION_TEXT[k].want}.`);
  }
  if (t.amb?.status === 'wants' && s.week - t.amb.week > 8 && s.week % 2 === 0) nudge(t, { resent: 1 });
}

function addOpinionSafe(s: GameState, from: string, to: string, reason: string, value: number): void {
  const r = getRelation(s, from, to);
  if (r?.modifiers.some((m) => m.reason === reason)) return;
  setModifier(s, from, to, reason, value);
}

function goomarWeekBond(ctx: Ctx, t: Tie): void {
  const s = ctx.s;
  const B = ensureBonds(s);
  const c = s.characters[t.id];
  const g = goomarOf(s, t.id);
  const boss = player(s);
  if (!c || !g) return;
  const w = wifeOf(s);
  const married = !!w && !separated(s, w.id);
  // The ultimatum: answered by leaving, or the deadline comes.
  if (t.ult !== undefined && !married) {
    t.ult = undefined;
    nudge(t, { aff: 10, trust: 10, resent: -10 });
    remember(s, t, 'ultimatum', 'the day you were free at last', 12);
  } else if (t.ult !== undefined && s.week >= t.ult) {
    t.ult = undefined;
    remember(s, t, 'betrayal', 'the day she stopped waiting', -20);
    nudge(t, { aff: -20, resent: 30 });
    goomarLeaves(s, c.id, 'you never chose');
    blog(B, s, `${c.firstName} stopped waiting. She left the apartment keys on the table.`);
    ctx.log.push(`${c.firstName} stopped waiting: she left the keys on the table.`);
    return;
  } else if (t.ult === undefined && !t.stalled && married && t.stage === 'serious' && s.week - g.since >= 26 && wantsMore(s, c.id) && R(s, 'ult', c.id) < 0.08) {
    t.ult = s.week + 6;
    B.stats.ultimatums++;
    remember(s, t, 'ultimatum', 'the night she said: her or me', -4);
    blog(B, s, `${c.firstName} gave you an ultimatum: leave your wife by week ${t.ult}.`);
    ctx.log.push(`${c.firstName}: "Her or me. I mean it." (by week ${t.ult})`);
  }
  // She runs into the wife.
  if (w && married && !t.mem.some((m) => m.k === 'metWife') && R(s, 'metwife', c.id) < 0.006 * (g.public ? 3 : 1) * (activeGoomars(s).length)) {
    remember(s, t, 'metWife', `the morning she ran into your wife at the A&P`, -6);
    nudge(t, { fear: 8, resent: 4 });
    const wt = ensureTie(s, w.id, 'wife');
    if (wt) {
      remember(s, wt, 'metWife', `the woman at the A&P who couldn't look at her`, -6);
      if (wt.knows === undefined) wt.sus = Math.min(100, (wt.sus ?? 0) + 35);
      else nudge(wt, { resent: 10 });
    }
    blog(B, s, `${c.firstName} ran into ${w.firstName} at the A&P on Pacific.`);
    ctx.log.push(`${c.firstName} ran into ${w.firstName} at the A&P. Neither one said a word.`);
  }
  // Jealousy between the women he keeps.
  const others = activeGoomars(s).filter((x) => x.id !== t.id);
  if (others.length) {
    if (s.week % 2 === 0) nudge(t, { resent: 1 });
    if (!t.mem.some((m) => m.k === 'jealous' && s.week - m.w < 12) && R(s, 'jealous', c.id) < 0.05 * others.length) {
      const oc = s.characters[others[0].id];
      remember(s, t, 'jealous', `the night she found out about ${oc?.firstName ?? 'the other one'}`, -10);
      nudge(t, { resent: 10, trust: -8 });
    }
  }
  // Security.
  if (g.missed) nudge(t, { trust: -3 });
  // A child: she knows first and decides; he learns when she tells him.
  if (!t.preg) {
    const P = (s.romance?.pregnancies ?? []).find((p) => p.motherId === c.id && p.fatherId === boss.id);
    const told = P && (s.dating?.preg ?? []).some((k) => k.id === P.id && k.knownBy.includes(boss.id));
    if (P && told) {
      t.preg = { week: s.week };
      remember(s, t, 'baby', 'the night she told you about the baby, and that she was keeping it', 4);
      blog(B, s, `${c.firstName} is expecting. She has decided to have the baby.`);
    }
  }
}

function friendWeek(ctx: Ctx, t: Tie): void {
  const s = ctx.s;
  const B = ensureBonds(s);
  const c = s.characters[t.id];
  const boss = player(s);
  if (!c) return;
  // A loan comes due.
  if (t.loan && s.week >= t.loan.due) {
    const odds = 0.45 + t.ax.trust / 250 + (hasTrait(c, 'Honest') ? 0.2 : 0) - (hasTrait(c, 'Greedy') ? 0.25 : 0);
    const amt = t.loan.amount;
    t.loan = undefined;
    if (R(s, 'repay', c.id) < odds) {
      earnPocket(ctx, amt, `${c.firstName} paid back the loan`, `loan:${c.id}`);
      nudge(t, { trust: 8, respect: 4 });
      remember(s, t, 'favor', `the ${$(amt)} he paid back to the dollar`, 6);
      ctx.log.push(`${c.firstName} paid back the ${$(amt)}.`);
    } else {
      t.welsh = true;
      nudge(t, { fear: 6, respect: -4 });
      remember(s, t, 'loan', `the ${$(amt)} he never paid back`, -8);
      ctx.log.push(`${c.firstName} came up short on the ${$(amt)}.`);
    }
  }
  // A confidant who knows too much: if it goes bad, it comes out.
  const rat = !!c.informantFor && c.informantFor !== 'player';
  if (t.knows2 !== undefined && (t.ax.resent >= 50 || rat) && R(s, 'betray', c.id) < (rat ? 0.06 : 0.04)) {
    B.stats.betrayals++;
    t.knows2 = undefined;
    t.role = 'rival';
    t.ax.resent = Math.max(t.ax.resent, 65);
    t.ax.trust = Math.min(t.ax.trust, 10);
    remember(s, t, 'betrayal', 'what he told them about you', -25);
    applyEffects(ctx, [{ type: 'evidence', charId: boss.id, amount: 8, label: `${c.firstName} talked` }], { label: `${c.firstName} talked`, because: 'confided in the wrong man', category: 'event' });
    blog(B, s, `${displayName(c)} talked. What you told him is out.`);
    ctx.log.push(`${c.firstName} talked. The things you told him over the rye are out.`);
  }
}

/** Drift without attention, the long stories, the stages. Called once a week. */
export function bondsWeek(ctx: Ctx): void {
  const s = ctx.s;
  const boss = s.characters[s.playerId];
  if (!boss?.alive) return;
  const roster = rosterIds(s);
  if (!roster.length && !s.bonds) return;
  const B = ensureBonds(s);
  const keep = new Set(roster.map((x) => x.id));
  // Gone from his life: the dead, and people no longer close (memories go with them).
  for (const id of Object.keys(B.ties)) {
    const c = s.characters[id];
    const t = B.ties[id];
    if (!c?.alive) { delete B.ties[id]; continue; }
    if (!keep.has(id) && (t.role === 'goomar' || t.role === 'lover')) {
      // Kept a while as "over", then let go.
      t.stage = 'ended';
      if (s.week - (t.last ?? t.since) > 12) delete B.ties[id];
      continue;
    }
    if (!keep.has(id)) delete B.ties[id];
  }
  for (const { id, role } of roster) ensureTie(s, id, role);
  for (const t of Object.values(B.ties)) {
    const c = s.characters[t.id];
    if (!c || !keep.has(t.id)) continue;
    // Evenings the other layers gave her (a date, a night at her place) count as his time.
    const dl = s.dating?.bonds[t.id]?.last;
    if (dl !== undefined && (t.role === 'goomar' || t.role === 'lover') && dl > (t.last ?? -1)) t.last = dl;
    // Drift: no attention, affection fades and resentment builds; old grudges cool slowly.
    const apart = weeksApart(s, t);
    const thr = NEGLECT_AFTER[t.role];
    if (apart > thr) {
      const close = t.role === 'wife' || t.role === 'goomar' || t.role === 'lover';
      nudge(t, { aff: close ? -2 : -1, resent: close && s.week % 2 === 0 ? 1 : 0, attr: close && s.week % 3 === 0 ? -1 : 0 });
      if (apart === thr + 4) remember(s, t, 'neglect', 'the weeks you were never around', -6);
      if (close || t.stage === 'friend' || t.stage === 'best' || t.stage === 'compare') setModifier(s, t.id, s.playerId, 'Never has time for me', -Math.min(20, (apart - thr) * 2));
    } else {
      setModifier(s, t.id, s.playerId, 'Never has time for me', 0);
      if (s.week % 4 === 0) nudge(t, { resent: -1 });
    }
    const rel = getRelation(s, t.id, s.playerId);
    if (rel && t.ax.fear > rel.fear) nudge(t, { fear: -1 });
    if (t.role === 'wife') wifeWeek(ctx, t);
    else if (t.role === 'goomar') goomarWeekBond(ctx, t);
    else if (t.role === 'friend' || t.role === 'crew') friendWeek(ctx, t);
    // An enemy who hates you enough stays an enemy, whatever his job.
    if ((t.role === 'crew' || t.role === 'friend') && t.ax.resent >= 70 && t.ax.aff < 25) t.role = 'rival';
    // Stages: a change is remembered.
    const st = computeStage(s, t);
    if (st !== t.stage) {
      const was = t.stage;
      t.stage = st;
      if (t.role !== 'crew' || st !== 'acquaintance') {
        remember(s, t, 'stage', `${STAGE_TEXT[was].toLowerCase()} → ${STAGE_TEXT[st].toLowerCase()}`, 0);
        if (STAGE_TONE[st] !== 'neutral') blog(B, s, `${c.firstName}: ${STAGE_TEXT[was].toLowerCase()} → ${STAGE_TEXT[st].toLowerCase()}.`);
      }
    }
    mirror(s, t);
  }
}

/* ------------------------------------------------------------------ */
/* The screen                                                          */
/* ------------------------------------------------------------------ */

export type BondGroupId = 'wife' | 'goomars' | 'kids' | 'friends' | 'crew' | 'rivals';
export const GROUP_LABEL: Record<BondGroupId, string> = { wife: 'Your wife', goomars: 'Goomars & lovers', kids: 'Your kids', friends: 'Friends', crew: 'Your crew', rivals: 'Enemies' };

export interface BondCard {
  id: string;
  name: string;
  age: number;
  role: BondRole;
  stage: BondStage;
  stageText: string;
  tone: 'good' | 'warn' | 'bad' | 'neutral';
  axes: { key: AxisKey; label: string; v: number }[];
  wants: Want[];
  now?: string;
  mood: Mood;
  line: string;
  memories: Memory[];
  gestures: PlayerAction[];
  badges: string[];
}

const AXIS_ORDER: AxisKey[] = ['aff', 'trust', 'respect', 'fear', 'attr', 'resent'];
const AX_LABEL: Record<AxisKey, string> = { aff: 'Affection', trust: 'Trust', respect: 'Respect', fear: 'Fear', attr: 'Attraction', resent: 'Resentment' };

export function bondCard(s: GameState, id: string): BondCard | undefined {
  const t = peekTie(s, id);
  const c = s.characters[id];
  if (!t || !c) return undefined;
  const badges: string[] = [];
  if (t.knows !== undefined && t.role === 'wife') badges.push('She knows');
  if ((t.sus ?? 0) >= 35 && t.knows === undefined) badges.push('Suspicious');
  if (t.compare) badges.push(`Godfather to ${s.characters[t.compare]?.firstName ?? 'your child'}`);
  if (t.knows2 !== undefined) badges.push('Knows too much');
  if (t.loan) badges.push(`Owes you ${$(t.loan.amount)}`);
  if (t.welsh) badges.push('Never paid you back');
  if (t.preg) badges.push('Expecting');
  if (t.ult !== undefined) badges.push(`Ultimatum: week ${t.ult}`);
  if (t.role === 'wife' && anniversaryNow(s, id) && t.annivYear !== annivOcc(s, id)) badges.push('Anniversary this week');
  const stage = t.stage;
  return {
    id, name: displayName(c), age: ageOf(s, c), role: t.role, stage, stageText: STAGE_TEXT[stage], tone: STAGE_TONE[stage],
    axes: AXIS_ORDER.filter((k) => t.ax[k] !== undefined).map((k) => ({ key: k, label: AX_LABEL[k], v: t.ax[k] as number })),
    wants: wantsOf(s, t), now: wantNow(s, t)?.text, mood: moodOf(s, t), line: voiceOf(s, t),
    memories: t.mem.filter((m) => m.k !== 'stage').slice(-3).reverse(), gestures: gesturesFor(s, id), badges,
  };
}

/** Everyone on the screen, grouped: wife, goomars and lovers, kids, friends, crew, enemies. */
export function bondGroups(s: GameState): { id: BondGroupId; label: string; cards: BondCard[] }[] {
  const groups: Record<BondGroupId, BondCard[]> = { wife: [], goomars: [], kids: [], friends: [], crew: [], rivals: [] };
  for (const { id } of rosterIds(s)) {
    const card = bondCard(s, id);
    if (!card) continue;
    const g: BondGroupId = card.role === 'wife' ? 'wife' : card.role === 'goomar' || card.role === 'lover' ? 'goomars' : card.role === 'kid' ? 'kids'
      : card.role === 'rival' ? 'rivals' : card.role === 'friend' || card.stage === 'friend' || card.stage === 'best' || card.stage === 'compare' ? 'friends' : 'crew';
    groups[g].push(card);
  }
  return (Object.keys(groups) as BondGroupId[]).map((id) => ({ id, label: GROUP_LABEL[id], cards: groups[id] }));
}

/** The layer's recent lines (most recent first). */
export function bondsLog(s: GameState, n = 8): [number, string][] {
  return [...(s.bonds?.log ?? [])].reverse().slice(0, n);
}
