import { ageOn } from '../calendar';
import { hasTrait, isFree } from '../characters';
import { previewInteraction, OFFICE_BRIBE, playerHook } from '../interactions';
import type { Need } from '../minds/types';
import { opinion } from '../relations';
import { knownSecrets } from '../secrets';
import type { Character, Effect, GameState, Trait } from '../types';
import type { Reason } from './accept';
import { owedBy, tieOf } from './state';
import type { Axis, DeedCat, DeedId, DeedMode, Tier } from './types';
import { DEED_HOURS } from './hours';

/**
 * THE CATALOG. Every person-to-person deed, for the boss and for everyone
 * else, in one table: who it may be done to, what it costs (money, hours,
 * favors, a hook, respect), how long before it can be tried again on the
 * same man, how it is decided (he consents / it works / it is done), the
 * axes it is made of (what makes a man reach for it, how it lands), and its
 * four outcomes (better than hoped, success, failure, disaster) as ordinary
 * labelled Effects. The boss's verbs that already exist elsewhere (Sunday
 * dinner, gifts, the official's envelope, promote/demote, a hit, a match,
 * the women) stay where they are; this is everything else, and the same
 * verbs for the people who are not the boss.
 */

/** The parties of a deed. `boss`: the actor is the boss; `tBoss`: the target is. */
export interface DX {
  s: GameState;
  a: Character;
  t: Character;
  boss: boolean;
  tBoss: boolean;
  /** A third party (the cop who makes the arrest). */
  via?: Character;
  /** The boss leans on a hook he holds. */
  hook?: boolean;
}

export interface Cost {
  money?: number;
  /** 'pocket': the boss's own money; else the Family's. */
  pot?: 'pocket';
  /** Political favors spent. */
  favors?: number;
  /** A hook on him is spent (the boss's weak hook / an NPC's). */
  hook?: boolean;
  /** A favor he owes is spent. */
  owed?: boolean;
  /** Respect put on the line (lost on failure). */
  respect?: number;
}

export interface Outcome { fx: Effect[]; line: string }

export interface DeedDef {
  id: DeedId;
  cat: DeedCat;
  mode: DeedMode;
  hostile?: boolean;
  /** Button title ("Befriend Sal"). */
  name: (x: DX) => string;
  /** One line under it. */
  text: string;
  /** What makes a man reach for it (his traits through weights.ts). */
  act: Partial<Record<Axis, number>>;
  /** How it lands on the man it is done to. */
  recv: Partial<Record<Axis, number>>;
  /** What it gives the target (an urgent need makes it welcome). */
  gives?: Partial<Record<Need, number>>;
  /** What it does for the actor's needs (the minds' utility). */
  wants: Partial<Record<Need, number>>;
  base: number;
  opW?: number;
  fearW?: number;
  trustW?: number;
  skill?: 'diplomacy' | 'intrigue' | 'force' | 'business' | 'leadership';
  friendly?: boolean;
  /** Hours of the boss's day. */
  hours: number;
  /** Weeks before he can try it on the same man again. */
  cooldown: number;
  /** Share of successes that go better than hoped / of failures that go badly wrong. */
  crit?: number;
  critFail?: number;
  /** undefined: not offered for this pair at all; a string: shown, blocked, with the reason. */
  can: (x: DX) => true | string | undefined;
  cost?: (x: DX) => Cost;
  extra?: (x: DX) => Reason[];
  out: (x: DX, r: Tier) => Outcome;
  /** NPCs may do it: to each other ('npc'), to the boss ('boss'), or both. */
  npc?: 'npc' | 'boss' | 'both';
  /** When an NPC does it to the boss, the boss answers it (a popup), instead of it landing. */
  ask?: boolean;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const fn = (c: Character) => c.firstName;
const nm = (c: Character) => `${c.firstName} ${c.lastName}`;
const age = (s: GameState, c: Character) => ageOn(c.birth, s.date);
const adult = (s: GameState, c: Character) => age(s, c) >= 18;
const his = (c: Character) => (c.gender === 'F' ? 'her' : 'his');
const him = (c: Character) => (c.gender === 'F' ? 'her' : 'him');
const he = (c: Character) => (c.gender === 'F' ? 'she' : 'he');

function op(from: Character, to: Character, amount: number, reason: string, decay = 1): Effect {
  return { type: 'opinion', from: from.id, to: to.id, amount, reason, decay };
}
function meter(from: Character, to: Character, m: 'fear' | 'trust' | 'grievance', amount: number): Effect {
  return { type: 'meter', from: from.id, to: to.id, meter: m, amount };
}
/** `who` gets (or loses) money: the boss's pocket, or the man's own. */
export function cash(s: GameState, who: Character, amount: number, pot: 'pocket' | 'family' = 'pocket'): Effect {
  if (who.id === s.playerId) return pot === 'pocket' ? { type: 'money', amount, pot: 'pocket' } : { type: 'money', amount };
  return { type: 'wealth', charId: who.id, amount };
}
function respect(x: DX, amount: number): Effect[] {
  if (x.boss) return [{ type: 'respect', amount }];
  if (x.tBoss) return [{ type: 'respect', amount: -amount }];
  return [];
}
function mem(who: Character, about: Character, t: string, v: number): Effect {
  return { type: 'deed', op: { op: 'mem', who: who.id, about: about.id, t, v } };
}
function tie(a: Character, b: Character, k: 'friend' | 'ally' | 'rival' | 'feud' | 'lovers' | undefined, y: string): Effect {
  return { type: 'deed', op: { op: 'tie', a: a.id, b: b.id, ...(k ? { k } : {}), y } };
}
const traitR = (c: Character, t: Trait, label: string, v: number): Reason[] => (hasTrait(c, t) ? [{ label, value: v }] : []);

function isRivalMob(s: GameState, c: Character): boolean {
  return s.rivals.some((r) => r.id === c.faction && r.kind === 'mob');
}
function leads(s: GameState, c: Character): boolean {
  return s.rivals.some((r) => r.leaderId === c.id) || c.id === s.playerId;
}
function mine(s: GameState, c: Character): boolean {
  return c.faction === 'player' && c.rank !== 'civilian' && c.id !== s.playerId;
}
function myKid(boss: Character, c: Character): boolean {
  return boss.childrenIds.includes(c.id) || c.fatherId === boss.id || c.motherId === boss.id;
}
/** A cop the boss can call on: on the pad (outside 'cop' of ours), or an officer he holds a hook on. */
export function copOnPad(s: GameState): Character | undefined {
  const cops = Object.values(s.characters).filter((c) => c.alive && isFree(s, c) && (c.outside === 'cop' || c.office === 'Police sergeant' || c.office === 'Chief of Police'));
  return cops.find((c) => c.outside === 'cop' && c.faction === 'player')
    ?? cops.find((c) => s.hooks.some((h) => h.holder === 'player' && h.targetId === c.id))
    ?? cops.find((c) => opinion(s, c.id, s.playerId) >= 40);
}
/** A sum that means something to him: a share of what he has, rounded, within bounds. */
function slice(c: Character, f: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round((c.wealth * f) / 100) * 100));
}

/* ------------------------------------------------------------------ */
/* The deeds                                                           */
/* ------------------------------------------------------------------ */

export const DEEDS: Record<DeedId, DeedDef> = {
  /* ---------------- Diplomacy ---------------- */
  befriend: {
    id: 'befriend', cat: 'diplomacy', mode: 'consent', friendly: true,
    name: (x) => `Befriend ${fn(x.t)}`, text: 'Time, attention, a drink at the right bar. Friends are made slowly.',
    act: { social: 1, trust: 0.4 }, recv: { social: 0.6, trust: 0.8 }, gives: { loyalty: 0.3, respect: 0.4 }, wants: { loyalty: 0.4, safety: 0.3, power: 0.2 },
    base: 30, trustW: 0.3, hours: DEED_HOURS.befriend, cooldown: 10, crit: 0.25,
    can: (x) => (adult(x.s, x.t) ? true : undefined),
    out: (x, r) => {
      const { a, t } = x;
      if (r === 'crit') return { fx: [op(t, a, 25, 'We became friends', 1), meter(t, a, 'trust', 12), tie(a, t, 'friend', 'Got close over drinks'), mem(t, a, `became friends with ${fn(a)}`, 12)], line: `${fn(t)} and ${fn(a)} are friends now: the kind who call on a Sunday.` };
      if (r === 'success') return { fx: [op(t, a, 15, 'Made an effort with me', 1), meter(t, a, 'trust', 6)], line: `${fn(t)} warmed to ${fn(a)}.` };
      if (r === 'fail') return { fx: [op(t, a, -3, 'Tried too hard', 1)], line: `${fn(t)} kept ${fn(a)} at arm's length.` };
      return { fx: [op(t, a, -10, 'Pushy, wants something', 1), meter(t, a, 'trust', -6)], line: `${fn(t)} decided ${fn(a)} wants something from ${him(t)}, and said so.` };
    },
    npc: 'both',
  },
  flatter: {
    id: 'flatter', cat: 'diplomacy', mode: 'odds', friendly: true,
    name: (x) => `Flatter ${fn(x.t)}`, text: 'A word about his suit, his kids, his good sense. Cheap, and it shows if it is cheap.',
    act: { social: 0.8, scheme: 0.4 }, recv: { pride: 0.5, honor: -0.4, trust: 0.3 }, wants: { loyalty: 0.2, respect: 0.1 },
    base: 55, skill: 'diplomacy', opW: 0.2, hours: DEED_HOURS.flatter, cooldown: 6, crit: 0.2, critFail: 0.3,
    can: (x) => (adult(x.s, x.t) ? true : undefined),
    out: (x, r) => {
      const { a, t } = x;
      if (r === 'crit') return { fx: [op(t, a, 14, 'Knows a man of quality', 1)], line: `${fn(t)} stood a little taller after ${fn(a)}'s word.` };
      if (r === 'success') return { fx: [op(t, a, 7, 'Said kind things', 2)], line: `${fn(t)} liked hearing it from ${fn(a)}.` };
      if (r === 'fail') return { fx: [op(t, a, -3, 'Laid it on thick', 2)], line: `${fn(t)} saw through ${fn(a)}'s compliments.` };
      return { fx: [op(t, a, -10, 'A flatterer, a phony', 1), meter(t, a, 'trust', -5)], line: `${fn(t)} told the room ${fn(a)} would sell ${his(t)} own mother a compliment.` };
    },
    npc: 'both',
  },
  feast: {
    id: 'feast', cat: 'diplomacy', mode: 'consent', friendly: true,
    name: (x) => `Invite ${fn(x.t)} to dinner at Mack's`, text: 'Veal, the good wine, the corner booth. Breaking bread with a man who is not family.',
    act: { social: 1, money: -0.2 }, recv: { social: 0.8, trust: 0.4, honor: 0.1 }, gives: { respect: 0.5, pleasure: 0.4 }, wants: { loyalty: 0.3, respect: 0.2, power: 0.2 },
    base: 45, hours: DEED_HOURS.feast, cooldown: 8, crit: 0.2,
    can: (x) => {
      if (!adult(x.s, x.t)) return undefined;
      // The boss's own crew and kin have Sunday dinner (interactions.ts) instead.
      if (x.boss && (x.t.dynasty || mine(x.s, x.t))) return undefined;
      return true;
    },
    cost: (x) => ({ money: x.boss ? 300 : 150, pot: 'pocket' }),
    out: (x, r) => {
      const { a, t } = x;
      if (r === 'crit') return { fx: [op(t, a, 20, 'A fine evening, a real host', 1), meter(t, a, 'trust', 10), { type: 'deed', op: { op: 'owe', by: t.id, to: a.id, y: 'A dinner he means to repay' } }], line: `${fn(t)} talked until the waiters stacked the chairs, and left owing ${fn(a)} one.` };
      if (r === 'success') return { fx: [op(t, a, 12, 'Broke bread together', 1), meter(t, a, 'trust', 5)], line: `${fn(t)} came to dinner with ${fn(a)}. A good night.` };
      if (r === 'fail') return { fx: [op(t, a, -2, 'Pressed me to come to dinner', 2)], line: `${fn(t)} sent regrets.` };
      return { fx: [op(t, a, -8, 'An awkward dinner', 1), ...respect(x, -1)], line: `${fn(t)} came, said little, left before the coffee. People saw.` };
    },
    npc: 'npc',
  },
  sway: {
    id: 'sway', cat: 'diplomacy', mode: 'consent', friendly: true,
    name: (x) => `Sway ${fn(x.t)} to your side`, text: 'Remind him who his real friends are. Rival men think about their own boss too.',
    act: { power: 0.6, social: 0.6 }, recv: { social: 0.5, trust: 0.5, loyalty: -0.6 }, gives: { safety: 0.3, power: 0.3 }, wants: { power: 0.6, loyalty: 0.3 },
    base: 25, opW: 0.4, hours: DEED_HOURS.sway, cooldown: 12, crit: 0.2,
    can: (x) => (adult(x.s, x.t) && x.t.faction !== x.a.faction && x.t.rank !== 'civilian' && !leads(x.s, x.t) ? true : undefined),
    extra: (x) => {
      const L = x.s.rivals.find((r) => r.id === x.t.faction)?.leaderId;
      const loyal = L ? opinion(x.s, x.t.id, L) : 0;
      return L ? [{ label: loyal >= 0 ? 'Loyal to his own boss' : 'Sour on his own boss', value: -Math.round(loyal / 3) }] : [];
    },
    out: (x, r) => {
      const { a, t, s } = x;
      const L = s.rivals.find((rv) => rv.id === t.faction)?.leaderId;
      const Lc = L ? s.characters[L] : undefined;
      const sour = Lc ? [op(t, Lc, r === 'crit' ? -15 : -6, `${fn(a)} opened my eyes`, 1)] : [];
      if (r === 'crit') return { fx: [op(t, a, 18, 'Showed me who my friends are', 1), meter(t, a, 'trust', 10), ...sour], line: `${fn(t)} is listening to ${fn(a)} now more than to ${his(t)} own people.` };
      if (r === 'success') return { fx: [op(t, a, 10, 'Talked sense to me', 1), ...sour], line: `${fn(t)} came away thinking well of ${fn(a)}.` };
      if (r === 'fail') return { fx: [op(t, a, -4, 'Working on me', 1)], line: `${fn(t)} would not be moved.` };
      return { fx: [op(t, a, -12, 'Tried to turn me against my own', 1), ...(Lc ? [op(Lc, a, -10, `Working on my man ${fn(t)}`, 1)] : [])], line: `${fn(t)} told ${Lc ? fn(Lc) : 'his people'} exactly what ${fn(a)} said.` };
    },
    npc: 'npc',
  },
  askFavor: {
    id: 'askFavor', cat: 'diplomacy', mode: 'consent',
    name: (x) => `Ask ${fn(x.t)} for a favor`, text: 'A small thing now; he will remember he did it, and so will you.',
    act: { social: 0.3, power: 0.3 }, recv: { loyalty: 0.6, money: -0.2, trust: 0.4 }, wants: { money: 0.3, power: 0.3, respect: -0.1 },
    base: 40, fearW: 0.2, hours: DEED_HOURS.askFavor, cooldown: 8, crit: 0.15,
    can: (x) => {
      if (!adult(x.s, x.t)) return undefined;
      // The boss asks rivals, officials and front men through the old verb (interactions.ts).
      if (x.boss && previewInteraction(x.s, 'favor', x.t.id)) return undefined;
      return true;
    },
    out: (x, r) => {
      const { a, t, s } = x;
      const owe = { type: 'deed' as const, op: { op: 'owe' as const, by: a.id, to: t.id, y: `Did ${fn(a)} a favor` } };
      const gain: Effect[] = x.boss ? [{ type: 'favor', amount: 1 }] : [cash(s, a, Math.min(600, slice(t, 0.05, 100, 600)))];
      if (r === 'crit') return { fx: [...gain, ...(x.boss ? [{ type: 'favor', amount: 1 } as Effect] : []), op(t, a, 4, 'Glad to help', 2)], line: `${fn(t)} did more than ${fn(a)} asked, and did not keep count.` };
      if (r === 'success') return { fx: [...gain, owe, op(t, a, -3, 'Called on me', 2)], line: `${fn(t)} did ${fn(a)} the favor. ${fn(a)} owes ${him(t)} one.` };
      if (r === 'fail') return { fx: [...respect(x, -1)], line: `${fn(t)} found a reason not to.` };
      return { fx: [op(t, a, -8, 'Always asking', 1), ...respect(x, -1)], line: `${fn(t)} said no in front of people.` };
    },
    npc: 'both', ask: true,
  },
  callFavor: {
    id: 'callFavor', cat: 'diplomacy', mode: 'consent',
    name: (x) => `Call in a favor from ${fn(x.t)}`, text: 'He owes you, or you hold something on him. Now is when he pays.',
    act: { power: 0.6, money: 0.3 }, recv: { honor: 0.5, pride: -0.5 }, gives: {}, wants: { money: 0.5, power: 0.3 },
    base: 45, fearW: 0.3, hours: DEED_HOURS.callFavor, cooldown: 12, crit: 0.1, critFail: 0.25,
    can: (x) => {
      if (!adult(x.s, x.t)) return undefined;
      const owes = owedBy(x.s, x.t.id, x.a.id) > 0;
      const hook = x.boss ? !!playerHook(x.s, x.t.id) : (x.s.deeds?.hooks ?? []).some((h) => h.h === x.a.id && h.t === x.t.id);
      return owes || hook ? true : 'He owes you nothing, and you hold nothing on him';
    },
    cost: (x) => (owedBy(x.s, x.t.id, x.a.id) > 0 ? { owed: true } : { hook: true }),
    extra: (x) => (x.boss && owedBy(x.s, x.t.id, x.a.id) === 0 && playerHook(x.s, x.t.id) ? [{ label: playerHook(x.s, x.t.id)!.strong ? `Strong hook: ${playerHook(x.s, x.t.id)!.reason}` : `Weak hook: ${playerHook(x.s, x.t.id)!.reason} (spent)`, value: playerHook(x.s, x.t.id)!.strong ? 60 : 35 }] : []),
    out: (x, r) => {
      const { a, t, s } = x;
      const amt = slice(t, 0.15, 300, 3000);
      const pay: Effect[] = t.office || t.frontMan ? (x.boss ? [{ type: 'favor', amount: 2 }] : []) : [cash(s, t, -amt), cash(s, a, amt, 'family')];
      if (r === 'crit') return { fx: [...pay, ...(x.boss ? [{ type: 'favor', amount: 1 } as Effect] : [])], line: `${fn(t)} paid what ${he(t)} owed ${fn(a)}, and then some.` };
      if (r === 'success') return { fx: [...pay, op(t, a, -5, 'Called in the marker', 1)], line: `${fn(t)} settled up with ${fn(a)}. They are square.` };
      if (r === 'fail') return { fx: [op(t, a, -8, 'Leaned on me for an old favor', 1)], line: `${fn(t)} said the debt was paid already. ${fn(a)} let it go, for now.` };
      return { fx: [op(t, a, -20, 'Thinks I belong to him', 1), meter(t, a, 'grievance', 15), ...respect(x, -2)], line: `${fn(t)} told ${fn(a)} where to put the marker.` };
    },
    npc: 'npc',
  },
  alliance: {
    id: 'alliance', cat: 'diplomacy', mode: 'consent', friendly: true,
    name: (x) => (leads(x.s, x.t) && leads(x.s, x.a) ? `Propose a pact with ${fn(x.t)}` : `Propose an understanding with ${fn(x.t)}`), text: 'You watch his back, he watches yours. Between families, between men of the same rank.',
    act: { power: 0.8, trust: 0.4 }, recv: { power: 0.5, trust: 0.9, pride: -0.2 }, gives: { safety: 0.6, power: 0.3 }, wants: { safety: 0.6, power: 0.5 },
    base: 20, trustW: 0.4, hours: DEED_HOURS.alliance, cooldown: 26, crit: 0.15,
    can: (x) => {
      const { s, a, t } = x;
      if (!adult(s, t) || t.rank === 'civilian' || a.rank === 'civilian') return undefined;
      const heads = leads(s, a) && leads(s, t) && a.faction !== t.faction && isRivalMob(s, a.id === s.playerId ? t : a);
      const peers = a.faction === t.faction && a.rank === t.rank && (a.rank === 'capo' || a.rank === 'soldier');
      if (!heads && !peers) return undefined;
      return tieOf(s, a.id, t.id)?.k === 'ally' ? 'Already allies' : true;
    },
    out: (x, r) => {
      const { a, t, s } = x;
      const rv = (c: Character) => s.rivals.find((rr) => rr.leaderId === c.id);
      const fac: Effect[] = x.boss && rv(t) ? [{ type: 'rivalOpinion', rival: rv(t)!.id, amount: r === 'crit' ? 25 : 15, reason: 'A pact between our houses' }] : [];
      if (r === 'crit' || r === 'success') return { fx: [...fac, tie(a, t, 'ally', 'Shook on a pact'), op(t, a, r === 'crit' ? 20 : 10, 'We have an understanding', 1), meter(t, a, 'trust', 8)], line: `${fn(a)} and ${fn(t)} shook on it: an understanding between them.` };
      if (r === 'fail') return { fx: [op(t, a, -3, 'Wants me in his pocket', 2)], line: `${fn(t)} said ${he(t)} would think about it, which means no.` };
      return { fx: [op(t, a, -12, 'Thinks I need him', 1), ...(x.boss && rv(t) ? [{ type: 'rivalOpinion', rival: rv(t)!.id, amount: -10, reason: 'Came begging for a pact' } as Effect] : [])], line: `${fn(t)} laughed at the offer, and told people ${fn(a)} came begging.` };
    },
    npc: 'both', ask: true,
  },
  demandRespect: {
    id: 'demandRespect', cat: 'diplomacy', mode: 'consent', hostile: true,
    name: (x) => `Demand respect from ${fn(x.t)}`, text: 'In front of people: he takes his hat off, or he does not.',
    act: { power: 0.8, pride: 0.6, violence: 0.3 }, recv: { pride: -1, power: -0.5, risk: -0.6, violence: -0.3 }, wants: { respect: 0.8, power: 0.3, safety: -0.2 },
    base: 40, opW: 0.3, fearW: 0.6, hours: DEED_HOURS.demandRespect, cooldown: 12, crit: 0.15, critFail: 0.3,
    can: (x) => {
      const { s, a, t } = x;
      if (!adult(s, t) || t.gender !== 'M' || t.dynasty && a.dynasty) return undefined;
      if ((RANKS[a.rank] ?? 1) < (RANKS[t.rank] ?? 1) && !leads(s, a)) return undefined;
      return true;
    },
    cost: () => ({ respect: 2 }),
    out: (x, r) => {
      const { a, t } = x;
      if (r === 'crit') return { fx: [meter(t, a, 'fear', 20), ...respect(x, 3), op(t, a, -4, 'Made me bow', 1)], line: `${fn(t)} took ${his(t)} hat off to ${fn(a)} on the boardwalk, and everybody saw it.` };
      if (r === 'success') return { fx: [meter(t, a, 'fear', 12), ...respect(x, 2), op(t, a, -6, 'Made me bow', 1)], line: `${fn(t)} gave ${fn(a)} the respect asked for.` };
      if (r === 'fail') return { fx: [...respect(x, -2), op(t, a, -10, 'Tried to make me bow', 1), meter(t, a, 'grievance', 10)], line: `${fn(t)} looked ${fn(a)} in the eye and kept ${his(t)} hat on.` };
      return { fx: [...respect(x, -3), op(t, a, -18, 'Tried to humiliate me', 0), tie(a, t, 'rival', 'A public showdown')], line: `${fn(t)} laughed in ${fn(a)}'s face. Now it is a thing between them.` };
    },
    npc: 'both', ask: true,
  },
  insult: {
    id: 'insult', cat: 'diplomacy', mode: 'odds', hostile: true,
    name: (x) => `Insult ${fn(x.t)}`, text: 'A crack about his mother, his money, his manhood. It lands, or it bounces back.',
    act: { pride: 1, violence: 0.5, social: -0.6 }, recv: { pride: -0.4, social: -0.3 }, wants: { revenge: 0.8, respect: 0.4, safety: -0.3 },
    base: 60, skill: 'diplomacy', hours: DEED_HOURS.insult, cooldown: 8, crit: 0.2, critFail: 0.3,
    can: (x) => (adult(x.s, x.t) && !(x.a.dynasty && x.t.dynasty && x.boss) ? true : undefined),
    extra: (x) => traitR(x.t, 'Hot-headed', 'He will answer it', -5),
    out: (x, r) => {
      const { a, t } = x;
      if (r === 'crit') return { fx: [op(t, a, -30, `Humiliated me in public`, 0), ...respect(x, 2), tie(a, t, 'rival', 'An insult in public'), mem(t, a, `${fn(a)} made a fool of him in public`, -20)], line: `${fn(a)}'s crack about ${fn(t)} went all the way down the boardwalk. ${fn(t)} will not forget it.` };
      if (r === 'success') return { fx: [op(t, a, -18, 'Insulted me', 1), ...respect(x, 1)], line: `${fn(a)} insulted ${fn(t)}, and it stung.` };
      if (r === 'fail') return { fx: [op(t, a, -8, 'Ran his mouth at me', 1), ...respect(x, -1)], line: `${fn(a)} took a shot at ${fn(t)}; nobody laughed.` };
      return { fx: [op(t, a, -25, 'Insulted me, so I answered', 0), tie(a, t, 'feud', 'Words, then fists'), ...respect(x, -2), ...(x.boss || x.tBoss ? [{ type: 'heat', bar: 'local', amount: 2 } as Effect] : [])], line: `${fn(t)} answered ${fn(a)}'s insult with ${his(t)} fists. It is a feud now.` };
    },
    npc: 'both',
  },
  threaten: {
    id: 'threaten', cat: 'diplomacy', mode: 'consent', hostile: true,
    name: (x) => `Threaten ${fn(x.t)}`, text: 'Say it plainly. He backs off, or he does not.',
    act: { violence: 0.8, power: 0.4, social: -0.3 }, recv: { risk: -1, violence: -0.6, pride: -0.6 }, wants: { safety: 0.4, power: 0.4, revenge: 0.3 },
    base: 45, opW: 0, fearW: 0.6, hours: DEED_HOURS.threaten, cooldown: 8, crit: 0.15, critFail: 0.3,
    can: (x) => (adult(x.s, x.t) && x.t.gender === 'M' && !(x.t.dynasty && x.a.dynasty) ? true : undefined),
    extra: (x) => [{ label: x.a.attributes.force >= 60 ? `${x.boss ? 'Your' : `${fn(x.a)}'s`} muscle` : 'No great muscle behind it', value: Math.round((x.a.attributes.force - 50) / 3) }],
    out: (x, r) => {
      const { a, t } = x;
      if (r === 'crit') return { fx: [meter(t, a, 'fear', 30), op(t, a, -8, 'Threatened me', 1)], line: `${fn(t)} went white. ${He(t)} will cross the street when ${fn(a)} comes.` };
      if (r === 'success') return { fx: [meter(t, a, 'fear', 18), op(t, a, -12, 'Threatened me', 1)], line: `${fn(t)} backed off.` };
      if (r === 'fail') return { fx: [meter(t, a, 'grievance', 15), op(t, a, -15, 'Threatened me', 1)], line: `${fn(t)} heard ${fn(a)} out and did not blink.` };
      return { fx: [op(t, a, -25, 'Threatened me, and I will not forget it', 0), meter(t, a, 'grievance', 25), tie(a, t, 'feud', 'A threat that was answered'), ...respect(x, -1)], line: `${fn(t)} told ${fn(a)} to try it. Now neither can back down.` };
    },
    npc: 'npc',
  },

  /* ---------------- Intrigue ---------------- */
  findSecrets: {
    id: 'findSecrets', cat: 'intrigue', mode: 'odds', hostile: true,
    name: (x) => `Find out ${fn(x.t)}'s secrets`, text: 'Ask around. The bartender, the barber, his wife\'s sister.',
    act: { scheme: 1, risk: 0.2 }, recv: { scheme: -0.6, trust: 0.4 }, wants: { safety: 0.4, power: 0.4 },
    base: 45, skill: 'intrigue', hours: DEED_HOURS.findSecrets, cooldown: 12, crit: 0.2, critFail: 0.2,
    can: (x) => (adult(x.s, x.t) ? true : undefined),
    cost: (x) => (x.boss ? { money: 300, pot: 'pocket' } : {}),
    out: (x, r) => {
      const { a, t, s } = x;
      const hidden = s.secrets.filter((sc) => sc.ownerId === t.id && !sc.knownBy.includes('player'));
      if (r === 'crit' || r === 'success') {
        if (x.boss) {
          const fx: Effect[] = hidden.slice(0, r === 'crit' ? 2 : 1).map((sc) => ({ type: 'secretKnown', secretId: sc.id }) as Effect);
          if (!hidden.length) fx.push({ type: 'hook', targetId: t.id, strong: false, reason: 'Knows his business' });
          return { fx, line: hidden.length ? `${fn(a)} found out what ${fn(t)} keeps quiet.` : `${fn(t)} is cleaner than most; still, ${fn(a)} learned enough to lean on.` };
        }
        return { fx: [{ type: 'deed', op: { op: 'npcHook', h: a.id, t: t.id, s: r === 'crit' ? 1 : 0, y: 'Knows his business' } }], line: `${fn(a)} found out something ${fn(t)} would rather keep quiet.` };
      }
      if (r === 'fail') return { fx: [], line: `${fn(a)} asked around about ${fn(t)} and came up empty.` };
      return { fx: [op(t, a, -20, 'Has been asking about me', 1), meter(t, a, 'trust', -15)], line: `${fn(t)} heard ${fn(a)} was asking questions about ${him(t)}.` };
    },
    npc: 'npc',
  },
  fabricateHook: {
    id: 'fabricateHook', cat: 'intrigue', mode: 'odds', hostile: true,
    name: (x) => `Fabricate a hook on ${fn(x.t)}`, text: 'A photograph, a ledger page, a signature that looks like his. It only has to look true.',
    act: { scheme: 1, honor: -0.6, risk: 0.3 }, recv: { scheme: -0.6, trust: 0.3, honor: 0.2 }, wants: { power: 0.6, safety: 0.2 },
    base: 35, skill: 'intrigue', hours: DEED_HOURS.fabricateHook, cooldown: 26, crit: 0.15, critFail: 0.3,
    can: (x) => (adult(x.s, x.t) && !(x.boss && x.s.hooks.some((h) => h.holder === 'player' && h.targetId === x.t.id && h.strong)) ? true : x.boss ? 'You already hold a strong hook on him' : undefined),
    cost: (x) => (x.boss ? { money: 800 } : {}),
    out: (x, r) => {
      const { a, t } = x;
      const hk = (strong: boolean): Effect => (x.boss ? { type: 'hook', targetId: t.id, strong, reason: 'Papers that look like his' } : { type: 'deed', op: { op: 'npcHook', h: a.id, t: t.id, s: strong ? 1 : 0, y: 'Papers that look like his' } });
      if (r === 'crit') return { fx: [hk(true)], line: `The papers on ${fn(t)} look better than the real thing.` };
      if (r === 'success') return { fx: [hk(false)], line: `${fn(a)} has something on ${fn(t)} now. It will do once.` };
      if (r === 'fail') return { fx: [], line: `The forger botched it. Nothing usable on ${fn(t)}.` };
      return { fx: [op(t, a, -35, 'Tried to frame me with forged papers', 0), tie(a, t, 'rival', 'Forged papers'), ...(x.boss ? [{ type: 'heat', bar: 'local', amount: 3 } as Effect] : [])], line: `${fn(t)} got hold of the forgery, and knows whose it is.` };
    },
    npc: 'npc',
  },
  blackmail: {
    id: 'blackmail', cat: 'intrigue', mode: 'consent', hostile: true,
    name: (x) => `Blackmail ${fn(x.t)}`, text: 'You know what you know. He pays, every month, or everyone knows.',
    act: { scheme: 0.8, money: 0.5, honor: -0.8 }, recv: { risk: -0.8, pride: -0.6, violence: -0.4 }, wants: { money: 0.8, power: 0.3, safety: -0.2 },
    base: 40, opW: 0, fearW: 0.5, hours: DEED_HOURS.blackmail, cooldown: 26, crit: 0.1, critFail: 0.35,
    can: (x) => {
      if (!x.boss || !adult(x.s, x.t) || mine(x.s, x.t)) return undefined;
      return knownSecrets(x.s, x.t.id).length ? true : 'You know nothing on him (find his secrets first)';
    },
    extra: (x) => [{ label: 'What you know', value: 20 }, ...traitR(x.t, 'Vengeful', 'He will want it back', -10)],
    out: (x, r) => {
      const { a, t, s } = x;
      const amt = slice(t, 0.2, 500, 5000);
      if (r === 'crit') return { fx: [cash(s, t, -amt), cash(s, a, amt, 'family'), { type: 'hook', targetId: t.id, strong: true, reason: 'Pays to keep it quiet' }, meter(t, a, 'fear', 20)], line: `${fn(t)} paid, and will keep paying.` };
      if (r === 'success') return { fx: [cash(s, t, -amt), cash(s, a, amt, 'family'), op(t, a, -20, 'Bleeds me', 0)], line: `${fn(t)} paid to keep it quiet.` };
      if (r === 'fail') return { fx: [op(t, a, -25, 'Tried to blackmail me', 0), meter(t, a, 'grievance', 20)], line: `${fn(t)} called the bluff. Nobody paid.` };
      return { fx: [op(t, a, -40, 'Tried to blackmail me', 0), tie(a, t, 'feud', 'Blackmail'), { type: 'heat', bar: 'local', amount: 5 }, { type: 'evidence', charId: s.playerId, amount: 3 }], line: `${fn(t)} went to the police with ${his(t)} own story first.` };
    },
  },
  envelope: {
    id: 'envelope', cat: 'intrigue', mode: 'consent',
    name: (x) => `Slip ${fn(x.t)} an envelope`, text: 'Money for nothing, for now. A man who takes it once has taken it.',
    act: { money: -0.3, scheme: 0.6 }, recv: { money: 1, honor: -0.8 }, gives: { money: 1 }, wants: { power: 0.4, safety: 0.3 },
    base: 45, hours: DEED_HOURS.envelope, cooldown: 12, crit: 0.15, critFail: 0.25,
    can: (x) => {
      if (!adult(x.s, x.t) || x.t.dynasty) return undefined;
      // Officials take the boss's envelope through the old verb.
      if (x.boss && x.t.office && OFFICE_BRIBE[x.t.office]) return undefined;
      return true;
    },
    cost: (x) => ({ money: Math.max(300, slice(x.t, 0.1, 300, 2500)) }),
    extra: (x) => [{ label: 'The money', value: x.t.wealth < 2000 ? 15 : x.t.wealth < 10000 ? 8 : 0 }],
    out: (x, r) => {
      const { a, t, s } = x;
      const amt = Math.max(300, slice(t, 0.1, 300, 2500));
      const hk: Effect = x.boss ? { type: 'hook', targetId: t.id, strong: r === 'crit', reason: 'Took our money' } : { type: 'deed', op: { op: 'npcHook', h: a.id, t: t.id, s: r === 'crit' ? 1 : 0, y: 'Took his money' } };
      if (r === 'crit' || r === 'success') return { fx: [cash(s, t, amt), hk, op(t, a, 8, 'Generous', 2)], line: `${fn(t)} took the envelope from ${fn(a)}.` };
      if (r === 'fail') return { fx: [op(t, a, -6, 'Tried to buy me', 1)], line: `${fn(t)} pushed the envelope back across the table. ${fn(a)} is out the money.` };
      return { fx: [op(t, a, -15, 'Tried to buy me', 0), ...(x.boss ? [{ type: 'heat', bar: 'local', amount: 3 } as Effect] : [])], line: `${fn(t)} kept the envelope as evidence and told the wrong people.` };
    },
    npc: 'npc',
  },
  plantRumor: {
    id: 'plantRumor', cat: 'intrigue', mode: 'odds', hostile: true,
    name: (x) => `Plant a rumor about ${fn(x.t)}`, text: 'A word at the bar that he skims, that he talks to the feds. Words travel; they change on the way.',
    act: { scheme: 1, pride: 0.3, honor: -0.5 }, recv: { social: -0.4 }, wants: { revenge: 0.7, power: 0.4 },
    base: 50, skill: 'intrigue', hours: DEED_HOURS.plantRumor, cooldown: 12, crit: 0.2, critFail: 0.2,
    can: (x) => (adult(x.s, x.t) && x.t.rank !== 'civilian' && !(x.boss && (x.t.dynasty)) ? true : undefined),
    out: (x, r) => {
      const { a, t, s } = x;
      const L = t.faction === 'player' ? s.characters[s.playerId] : s.characters[s.rivals.find((rv) => rv.id === t.faction)?.leaderId ?? ''];
      const k: 'skim' | 'rat' = t.rank === 'capo' || t.rank === 'soldier' ? 'skim' : 'rat';
      const ru: Effect = { type: 'deed', op: { op: 'rumor', by: a.id, on: t.id, k } };
      const boss = L && L.id !== t.id && L.id !== a.id ? [op(L, t, r === 'crit' ? -20 : -8, k === 'skim' ? 'Word is he skims' : 'Word is he talks', 1)] : [];
      if (r === 'crit') return { fx: [ru, ...boss], line: `By Friday half the shore says ${fn(t)} ${k === 'skim' ? 'skims' : 'talks to the feds'}, and ${L ? fn(L) : 'his boss'} has heard it.` };
      if (r === 'success') return { fx: [ru, ...boss], line: `The story about ${fn(t)} is going around.` };
      if (r === 'fail') return { fx: [], line: `Nobody bit on the story about ${fn(t)}.` };
      return { fx: [op(t, a, -30, 'Spread lies about me', 0), tie(a, t, 'rival', 'Lies at the bar')], line: `The story about ${fn(t)} came back with ${fn(a)}'s name on it.` };
    },
    npc: 'npc',
  },
  turn: {
    id: 'turn', cat: 'intrigue', mode: 'consent', hostile: true,
    name: (x) => `Turn ${fn(x.t)}: make him your eyes inside`, text: 'He stays where he is, and tells you what his boss says. Money helps; a grudge helps more.',
    act: { scheme: 1, risk: 0.4 }, recv: { loyalty: -1, money: 0.5, risk: 0.5, honor: -0.4 }, gives: { money: 0.6, revenge: 0.4 }, wants: { power: 0.6, safety: 0.4 },
    base: 15, opW: 0.4, hours: DEED_HOURS.turn, cooldown: 26, crit: 0.1, critFail: 0.35,
    can: (x) => {
      const { s, t } = x;
      if (!x.boss || !isRivalMob(s, t) || leads(s, t) || t.rank === 'civilian') return undefined;
      return t.informantFor ? 'He already talks to somebody' : true;
    },
    cost: () => ({ money: 1500 }),
    extra: (x) => {
      const L = x.s.rivals.find((r) => r.id === x.t.faction)?.leaderId;
      const loyal = L ? opinion(x.s, x.t.id, L) : 0;
      return [{ label: loyal >= 0 ? 'Loyal to his own boss' : 'Hates his own boss', value: -Math.round(loyal / 2.5) }];
    },
    out: (x, r) => {
      const { a, t, s } = x;
      const L = s.characters[s.rivals.find((rv) => rv.id === t.faction)?.leaderId ?? ''];
      if (r === 'crit' || r === 'success') return { fx: [{ type: 'deed', op: { op: 'npcHook', h: a.id, t: t.id, s: 1, y: 'Our man inside' } }, { type: 'hook', targetId: t.id, strong: true, reason: 'He informs for us' }, cash(s, t, 1500)], line: `${fn(t)} will tell ${fn(a)}'s people what ${L ? fn(L) : 'his boss'} says. Every Tuesday, in the back of the bakery.` };
      if (r === 'fail') return { fx: [op(t, a, -15, 'Tried to turn me', 1)], line: `${fn(t)} would not sell out ${his(t)} people.` };
      return { fx: [op(t, a, -25, 'Tried to turn me', 0), ...(L ? [op(L, a, -20, `Tried to turn my man ${fn(t)}`, 0)] : [])], line: `${fn(t)} took the money straight to ${L ? fn(L) : 'his boss'}.` };
    },
  },
  court: {
    id: 'court', cat: 'intrigue', mode: 'consent', friendly: true,
    name: (x) => `Court ${fn(x.t)}`, text: 'Flowers, a night at the Starlight, walking her home. Both grown, both free; she decides.',
    act: { romance: 1, social: 0.4 }, recv: { romance: 0.3, social: 0.6, honor: -0.2 }, gives: { pleasure: 0.6, family: 0.4 }, wants: { pleasure: 0.8, family: 0.4 },
    base: 25, hours: DEED_HOURS.court, cooldown: 10, crit: 0.2,
    // NPCs only: the boss's own romance has its own screens (romance.ts, dating.ts).
    can: (x) => {
      const { s, a, t } = x;
      if (x.boss || x.tBoss || !adult(s, a) || !adult(s, t) || a.gender === t.gender) return undefined;
      if (a.spouseId || t.spouseId || a.dynasty && t.dynasty) return undefined;
      return true;
    },
    out: (x, r) => {
      const { a, t } = x;
      if (r === 'crit' || r === 'success') return { fx: [tie(a, t, 'lovers', 'Courting'), op(t, a, r === 'crit' ? 25 : 15, 'Courting me', 1)], line: `${fn(a)} and ${fn(t)} have been seen together at the Starlight.` };
      if (r === 'fail') return { fx: [op(t, a, -2, 'Not my type', 2)], line: `${fn(t)} let ${fn(a)} down gently.` };
      return { fx: [op(t, a, -10, 'Would not take no for an answer', 1)], line: `${fn(t)} told ${fn(a)} to stop calling.` };
    },
    npc: 'npc',
  },
  frame: {
    id: 'frame', cat: 'intrigue', mode: 'odds', hostile: true,
    name: (x) => `Have ${fn(x.t)} picked up${x.via ? ` (${x.via.office === 'Chief of Police' ? 'Chief' : 'Sgt.'} ${x.via.lastName})` : ''}`, text: 'A cop on the pad finds something in his trunk. A few months in county lockup.',
    act: { scheme: 0.8, violence: 0.2, honor: -0.8, risk: 0.4 }, recv: { scheme: -0.5 }, wants: { power: 0.5, revenge: 0.6, safety: -0.3 },
    base: 50, skill: 'intrigue', hours: DEED_HOURS.frame, cooldown: 26, crit: 0.15, critFail: 0.25,
    can: (x) => {
      if (!x.boss || !adult(x.s, x.t) || x.t.dynasty || x.t.office || mine(x.s, x.t) && x.t.rank === 'civilian') return undefined;
      if (!x.via) return 'You need a cop on the pad (or one you hold a hook on)';
      if (!isFree(x.s, x.t)) return 'He is already inside';
      return true;
    },
    cost: () => ({ money: 1500 }),
    extra: (x) => (x.via ? [{ label: `${x.via.firstName} ${x.via.lastName} does it right`, value: Math.round((x.via.attributes.intrigue - 50) / 3) }] : []),
    out: (x, r) => {
      const { a, t, via } = x;
      if (r === 'crit') return { fx: [{ type: 'imprison', charId: t.id, weeks: 20 }, { type: 'evidence', charId: t.id, amount: 15 }], line: `The police found what they were told to find in ${fn(t)}'s trunk. ${He(t)} is looking at a long stretch.` };
      if (r === 'success') return { fx: [{ type: 'imprison', charId: t.id, weeks: 10 }], line: `${fn(t)} was picked up on a charge that will hold for a while.` };
      if (r === 'fail') return { fx: [...(via ? [op(via, a, -10, 'Made me look bad downtown', 1)] : [])], line: `The charge against ${fn(t)} fell apart at the arraignment.` };
      return { fx: [op(t, a, -40, 'Had the cops frame me', 0), tie(a, t, 'feud', 'A frame-up'), { type: 'heat', bar: 'local', amount: 6 }, ...(via ? [op(via, a, -20, 'Nearly cost me my badge', 0)] : [])], line: `${fn(t)}'s lawyer pulled the thread, and it led back to ${fn(a)}.` };
    },
  },

  /* ---------------- Business ---------------- */
  offerPiece: {
    id: 'offerPiece', cat: 'business', mode: 'consent', friendly: true,
    name: (x) => `Offer ${fn(x.t)} a piece`, text: 'A cut of a route, a book, a card game. Money that comes every week buys more than a gift.',
    act: { money: -0.5, social: 0.4, power: 0.4 }, recv: { money: 1, trust: 0.4 }, gives: { money: 1, respect: 0.3 }, wants: { loyalty: 0.4, power: 0.4, money: -0.2 },
    base: 55, hours: DEED_HOURS.offerPiece, cooldown: 26, crit: 0.15,
    can: (x) => (adult(x.s, x.t) && x.t.rank !== 'civilian' && !(x.t.dynasty && x.a.dynasty) ? true : undefined),
    cost: (x) => ({ money: x.boss ? 2000 : Math.min(1500, slice(x.a, 0.1, 500, 1500)) }),
    out: (x, r) => {
      const { a, t, s } = x;
      const amt = x.boss ? 2000 : Math.min(1500, slice(a, 0.1, 500, 1500));
      const rival = t.faction !== a.faction ? s.characters[s.rivals.find((rv) => rv.id === t.faction)?.leaderId ?? ''] : undefined;
      if (r === 'crit' || r === 'success') return { fx: [cash(s, t, amt), op(t, a, r === 'crit' ? 22 : 14, 'Cut me in', 1), meter(t, a, 'trust', 8), ...(rival ? [op(t, rival, -5, `${fn(a)} pays better`, 1)] : [])], line: `${fn(t)} took a piece of ${fn(a)}'s business.` };
      if (r === 'fail') return { fx: [cash(s, a, amt, 'family')], line: `${fn(t)} did not want to be in ${fn(a)}'s debt. The money came back.` };
      return { fx: [cash(s, a, amt, 'family'), op(t, a, -8, 'Thinks he can buy me', 1)], line: `${fn(t)} took it as an insult.` };
    },
    npc: 'both', ask: true,
  },
  buyOut: {
    id: 'buyOut', cat: 'business', mode: 'consent',
    name: (x) => `Buy ${fn(x.t)}'s book`, text: 'A bookie, a fence, a numbers runner of his own: you pay, his trade and his customers come to you.',
    act: { money: 0.6, power: 0.6 }, recv: { money: 0.8, pride: -0.5 }, gives: { money: 0.8, safety: 0.3 }, wants: { money: 0.6, power: 0.6 },
    base: 35, hours: DEED_HOURS.buyOut, cooldown: 26, crit: 0.1,
    can: (x) => {
      const { t } = x;
      if (!x.boss || !t.outside || t.outside === 'cop' || t.outside === 'politician' || t.faction === 'player') return undefined;
      return true;
    },
    cost: (x) => ({ money: Math.max(2000, Math.round((x.t.wealth * 0.6) / 100) * 100) }),
    out: (x, r) => {
      const { a, t, s } = x;
      const price = Math.max(2000, Math.round((t.wealth * 0.6) / 100) * 100);
      if (r === 'crit' || r === 'success') return { fx: [cash(s, t, price), { type: 'recruit', charId: t.id }, { type: 'rank', charId: t.id, rank: 'associate' }, op(t, a, 10, 'Paid a fair price', 1)], line: `${fn(t)} sold ${his(t)} book to ${fn(a)}, and works it for ${him(a)} now.` };
      if (r === 'fail') return { fx: [cash(s, a, price, 'family')], line: `${fn(t)} would not sell.` };
      return { fx: [cash(s, a, price, 'family'), op(t, a, -12, 'Tried to muscle in on my book', 1)], line: `${fn(t)} took it as a shakedown, and will tell people so.` };
    },
  },
  partner: {
    id: 'partner', cat: 'business', mode: 'consent', friendly: true,
    name: (x) => `Go partners with ${fn(x.t)}`, text: 'Each puts up money, each takes a share every month for a year. Partners watch each other.',
    act: { money: 0.6, trust: 0.5 }, recv: { money: 0.6, trust: 0.8 }, gives: { money: 0.7 }, wants: { money: 0.7, loyalty: 0.2 },
    base: 35, trustW: 0.4, hours: DEED_HOURS.partner, cooldown: 52, crit: 0.15,
    can: (x) => (adult(x.s, x.t) && x.t.wealth >= 1500 && (x.a.id === x.s.playerId || x.a.wealth >= 1500) ? true : adult(x.s, x.t) ? 'He has no money to put up' : undefined),
    cost: () => ({ money: 1500 }),
    out: (x, r) => {
      const { a, t, s } = x;
      const n = r === 'crit' ? 330 : 260;
      if (r === 'crit' || r === 'success') return { fx: [cash(s, t, -1500), { type: 'deed', op: { op: 'partner', a: a.id, b: t.id, n } }, op(t, a, 10, 'We are partners', 1)], line: `${fn(a)} and ${fn(t)} put money together: about $${n} a month each, for a year, if it holds.` };
      if (r === 'fail') return { fx: [cash(s, a, 1500, 'family')], line: `${fn(t)} said ${he(t)} works alone.` };
      return { fx: [cash(s, a, 600, 'family'), op(t, a, -6, 'A partnership that went sour', 1)], line: `The venture went bust before it started. ${fn(a)} got some of the money back.` };
    },
    npc: 'both', ask: true,
  },
  askLoan: {
    id: 'askLoan', cat: 'business', mode: 'consent',
    name: (x) => `Ask ${fn(x.t)} for a loan`, text: 'Cash now, paid back with interest. Owing a man changes things between you.',
    act: { money: 1, pride: -0.3 }, recv: { money: -0.6, trust: 0.6, loyalty: 0.4 }, wants: { money: 1, respect: -0.2 },
    base: 40, trustW: 0.3, hours: DEED_HOURS.askLoan, cooldown: 26, crit: 0.1,
    can: (x) => (adult(x.s, x.t) && (x.tBoss || x.t.wealth >= 3000) ? true : adult(x.s, x.t) ? 'He does not have it to lend' : undefined),
    out: (x, r) => {
      const { a, t, s } = x;
      const amt = x.tBoss ? Math.max(500, Math.min(5000, Math.round(s.money * 0.05 / 100) * 100)) : slice(t, 0.25, 1000, 10000);
      const inflow: Effect[] = x.boss ? [{ type: 'debt', lender: nm(t), principal: amt, weeklyPayment: Math.round((amt * 1.1) / 20), weeks: 20 }, cash(s, t, -amt)] : [cash(s, t, -amt), cash(s, a, amt), { type: 'deed', op: { op: 'owe', by: a.id, to: t.id, y: 'Lent me money' } }];
      if (r === 'crit' || r === 'success') return { fx: inflow, line: `${fn(t)} lent ${fn(a)} $${amt.toLocaleString('en-US')}.` };
      if (r === 'fail') return { fx: [], line: `${fn(t)} said money was tight.` };
      return { fx: [op(t, a, -6, 'Came to me with his hand out', 1), ...respect(x, -1)], line: `${fn(t)} told people ${fn(a)} came asking for money.` };
    },
    npc: 'both', ask: true,
  },
  lend: {
    id: 'lend', cat: 'business', mode: 'consent', friendly: true,
    name: (x) => `Lend ${fn(x.t)} money`, text: 'He needs it; you have it. A loan is a favor that pays back twice.',
    act: { money: 0.3, power: 0.4, social: 0.2 }, recv: { money: 0.6, pride: -0.4 }, gives: { money: 1 }, wants: { power: 0.5, loyalty: 0.4, money: -0.1 },
    base: 55, hours: DEED_HOURS.lend, cooldown: 26, crit: 0.1,
    can: (x) => (adult(x.s, x.t) && !x.tBoss && x.t.wealth < 4000 ? true : adult(x.s, x.t) && !x.tBoss ? 'He has money of his own' : undefined),
    cost: (x) => ({ money: x.boss ? 1000 : Math.min(800, slice(x.a, 0.1, 300, 800)) }),
    out: (x, r) => {
      const { a, t, s } = x;
      const amt = x.boss ? 1000 : Math.min(800, slice(a, 0.1, 300, 800));
      if (r === 'crit' || r === 'success') return { fx: [cash(s, t, amt), { type: 'deed', op: { op: 'loan', by: a.id, to: t.id, amt: Math.round(amt * 1.1), due: s.week + 12 } }, { type: 'deed', op: { op: 'owe', by: t.id, to: a.id, y: 'Lent me money when I needed it' } }, op(t, a, r === 'crit' ? 18 : 10, 'Lent me money when I needed it', 1), mem(t, a, `${fn(a)} lent him money when he needed it`, 10)], line: `${fn(a)} lent ${fn(t)} $${amt.toLocaleString('en-US')}, due back with interest in twelve weeks.` };
      if (r === 'fail') return { fx: [cash(s, a, amt, 'family')], line: `${fn(t)} would not take the money.` };
      return { fx: [cash(s, a, amt, 'family'), op(t, a, -8, 'Thinks I am a charity case', 1)], line: `${fn(t)} took it as charity, and hated it.` };
    },
    npc: 'npc',
  },

  /* ---------------- Family ---------------- */
  legitimize: {
    id: 'legitimize', cat: 'family', mode: 'order', friendly: true,
    name: (x) => `Acknowledge ${fn(x.t)} as your own`, text: 'Your blood, by another woman. Give the child your name in front of everyone; your wife will hear of it.',
    act: { honor: 0.5, loyalty: 0.3 }, recv: {}, wants: { family: 0.8 },
    base: 100, hours: DEED_HOURS.legitimize, cooldown: 999,
    can: (x) => (x.boss && x.t.bioFatherId === x.a.id && x.t.fatherId !== x.a.id ? true : undefined),
    out: (x) => {
      const { a, t, s } = x;
      const wife = a.spouseId ? s.characters[a.spouseId] : undefined;
      return { fx: [{ type: 'deed', op: { op: 'legit', child: t.id, father: a.id } }, op(t, a, 40, 'Gave me his name', 0), { type: 'familyOpinion', amount: -4, reason: 'Brought his other child into the house' }, ...(wife ? [op(wife, a, -25, 'Shamed me with his bastard', 0)] : [])], line: `${fn(a)} gave ${fn(t)} ${his(a)} name, in front of the whole parish.` };
    },
  },
  disown: {
    id: 'disown', cat: 'family', mode: 'order', hostile: true,
    name: (x) => `Disown ${fn(x.t)}`, text: 'He is no son of yours, no part of this house. Nothing he does is on your name, and nothing of yours is his.',
    act: { pride: 0.6, loyalty: -0.6 }, recv: {}, wants: { respect: 0.4, family: -0.8 },
    base: 100, hours: DEED_HOURS.disown, cooldown: 999,
    can: (x) => (x.boss && x.t.dynasty && myKid(x.a, x.t) && x.t.id !== x.a.spouseId ? true : undefined),
    out: (x) => {
      const { a, t } = x;
      return { fx: [{ type: 'deed', op: { op: 'disown', who: t.id } }, op(t, a, -60, 'Disowned me', 0), { type: 'familyOpinion', amount: -6, reason: 'Threw one of us out of the house' }, mem(t, a, 'his father disowned him', -40)], line: `${fn(a)} disowned ${fn(t)}. The house does not say ${his(t)} name.` };
    },
  },
  educate: {
    id: 'educate', cat: 'family', mode: 'order', friendly: true,
    name: (x) => `See to ${fn(x.t)}'s education`, text: 'A tutor for the child: one of your people takes him under his wing, teaches what he knows.',
    act: { loyalty: 0.3 }, recv: {}, wants: { family: 0.6 },
    base: 100, hours: DEED_HOURS.educate, cooldown: 52,
    can: (x) => {
      const { s, t } = x;
      if (!x.boss || !t.dynasty || age(s, t) >= 16 || age(s, t) < 5) return undefined;
      return s.deeds?.edu[t.id] ? 'Already in someone\'s care' : true;
    },
    cost: () => ({ money: 500, pot: 'pocket' }),
    out: (x) => {
      const { a, t, s } = x;
      const tutor = tutorFor(s, a, t);
      const focus = tutor ? bestAttr(tutor) : 'diplomacy';
      return { fx: tutor ? [{ type: 'deed', op: { op: 'edu', child: t.id, tutor: tutor.id, focus } }, op(tutor, a, 8, 'Trusted me with his child', 1)] : [], line: tutor ? `${fn(tutor)} has taken ${fn(t)} under ${his(tutor)} wing: ${focus}, mostly.` : `Nobody fit to teach ${fn(t)}.` };
    },
  },

  /* ---------------- Crew ---------------- */
  recognize: {
    id: 'recognize', cat: 'crew', mode: 'order', friendly: true,
    name: (x) => `Recognize ${fn(x.t)} in front of the crew`, text: 'A toast at the Saturday table: this one does it right. The others hear it.',
    act: { social: 0.5, loyalty: 0.5 }, recv: { pride: 0.4 }, wants: { loyalty: 0.6, respect: 0.2 },
    base: 100, hours: DEED_HOURS.recognize, cooldown: 12,
    can: (x) => {
      const { s, a, t } = x;
      if (x.boss) return mine(s, t) ? true : undefined;
      return t.capoId === a.id ? true : undefined;
    },
    out: (x) => {
      const { a, t } = x;
      return { fx: [op(t, a, 14 + (hasTrait(t, 'Ambitious') ? 4 : 0), 'Recognized me in front of the crew', 1), ...(x.boss ? [{ type: 'crewOpinion', amount: 0, reason: `The boss's favorite, ${fn(t)}`, traitMods: { Ambitious: -3 } } as Effect] : [])], line: `${fn(a)} raised a glass to ${fn(t)} at the Saturday table.` };
    },
    npc: 'npc',
  },
  discipline: {
    id: 'discipline', cat: 'crew', mode: 'consent', hostile: true,
    name: (x) => `Discipline ${fn(x.t)}`, text: 'A fine, a slap, a week on the worst corner. He takes it, or he takes it badly.',
    act: { power: 0.6, violence: 0.4, pride: 0.2 }, recv: { pride: -0.8, violence: -0.4, loyalty: 0.6, risk: -0.4 }, wants: { power: 0.4, respect: 0.4, loyalty: 0.3 },
    base: 55, opW: 0.3, fearW: 0.5, hours: DEED_HOURS.discipline, cooldown: 8, crit: 0.15, critFail: 0.25,
    can: (x) => {
      const { s, a, t } = x;
      if (x.boss) return mine(s, t) && t.rank !== 'underboss' && t.rank !== 'consigliere' ? true : undefined;
      return t.capoId === a.id ? true : undefined;
    },
    out: (x, r) => {
      const { a, t } = x;
      const skim: Effect[] = (t.skimmed ?? 0) > 0 ? [{ type: 'skimReset', charId: t.id }] : [];
      if (r === 'crit') return { fx: [meter(t, a, 'fear', 18), ...skim, op(t, a, -3, 'Put me in my place', 2), mem(t, a, `${fn(a)} put him in his place, and he had it coming`, 4)], line: `${fn(t)} took ${his(t)} medicine, and came back better for it.` };
      if (r === 'success') return { fx: [meter(t, a, 'fear', 12), ...skim, op(t, a, -8, 'Disciplined me', 1)], line: `${fn(t)} took ${his(t)} punishment without a word.` };
      if (r === 'fail') return { fx: [meter(t, a, 'grievance', 18), op(t, a, -15, 'Humiliated me', 1)], line: `${fn(t)} took it, and is still chewing on it.` };
      return { fx: [meter(t, a, 'grievance', 35), op(t, a, -25, 'Treated me like a dog', 0), tie(a, t, 'rival', 'A punishment that did not take')], line: `${fn(t)} threw the fine on the floor and walked out.` };
    },
    npc: 'npc',
  },
};

/** Rank order for "outranks" checks. */
const RANKS: Record<string, number> = { boss: 6, underboss: 5, consigliere: 5, capo: 4, soldier: 3, associate: 2, civilian: 1 };

function He(c: Character): string {
  return c.gender === 'F' ? 'She' : 'He';
}

/** The best teacher among the boss's people for a child (consigliere, a capo, the wife). */
export function tutorFor(s: GameState, boss: Character, child: Character): Character | undefined {
  const pool = Object.values(s.characters).filter((c) => c.alive && c.id !== child.id && c.id !== boss.id && isFree(s, c) && (c.faction === 'player' && ['consigliere', 'underboss', 'capo'].includes(c.rank) || c.id === boss.spouseId));
  pool.sort((a, b) => Math.max(...Object.values(b.attributes)) - Math.max(...Object.values(a.attributes)) || a.id.localeCompare(b.id));
  return pool[0];
}

export function bestAttr(c: Character): string {
  const e = Object.entries(c.attributes).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return e[0]?.[0] ?? 'diplomacy';
}

export const DEED_ORDER: DeedId[] = Object.keys(DEEDS) as DeedId[];
