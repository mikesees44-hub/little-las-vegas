import { fertility } from './aging';
import { allure } from './looks';
import { ageOn } from './calendar';
import { displayName, hasTrait, isFree, makeCharacter, player } from './characters';
import { earOf, madamOf } from './ears';
import { ROMANTIC } from './earsWeb';
import { applyEffects } from './effects';
import { activeRomances, attraction, drawnTo, endRomance, kin, romanceBetween } from './romance';
import { addOpinion, getRelation, opinion } from './relations';
import { addSecret } from './secrets';
import { hashSeed, rand, type RngHolder } from './rng';
import { ensureRomance } from './storyState';
import { roundSlots } from './rounds';
import { roll } from './roundsPersonal';
import { ageOf, present, type Tp } from './livingState';
import {
  adultOn, datingEvenings, datingSettings, ensureDating, PREGNANCY_ODDS, PROVIDER_LABEL, STAGE_LABEL,
  type Bond, type DatingState, type Provider, type ProviderKind, type Stage,
} from './datingState';
import type { ActionPreview } from './actions';
import type { Acceptance, Reason } from './interactions';
import type { Ctx } from './ledger';
import type { Character, Effect, FactionId, GameState, PlayerAction } from './types';

/**
 * RELATIONSHIPS & DATING. One screen for the boss's love life and the paid
 * company of the island's nights, built on what already exists:
 *
 *  - romance.ts is the truth of who is together, married, separated; its
 *    births make the children (with valid parents, a birth date, the boss's
 *    "what do you do about the child" decision, succession by legitimizing).
 *  - The Ears (ears.ts) are the dancers and call girls; this layer adds the
 *    women who work the street and the high-end trade, each with her own
 *    price and her own say.
 *  - The living district's single women can be met through an introduction.
 *  - The Pocket pays (actions.ts' fundingBlock: a short Pocket only dips into
 *    the Family when the player approved it on the button).
 *
 * THE LADDER: acquaintance → friends / attraction → dating (a romance.ts
 * courtship, or an affair when someone is married) → committed → marriage
 * (romance.ts' proposal) → separation → reconciliation. Every step up is
 * HER decision from her own state (attraction, her feelings, her marriage,
 * her other man, her faith, what she knows about the boss, how recently he
 * asked); gifts nudge her feelings with diminishing returns and never
 * decide anything.
 *
 * PAID COMPANY: an explicit, agreed transaction with an adult: who, her
 * price, which account pays, when she is free, and what can go wrong are
 * shown before the boss confirms; she can still say no (and then nothing is
 * paid). It creates no affection, no relationship and no standing access.
 * Asking a dancer or an escort out for a personal evening is a separate
 * invitation: she can say no, keep it professional, or take it personally.
 *
 * PREGNANCY (PREGNANCY_RULES below): only inside a relationship the boss and
 * an adult woman of 18-42 are both in, on an evening they spend together,
 * at the odds the setting gives. Never from paid company, a talk, a gift or
 * any other social event.
 *
 * Content: non-explicit. A paid evening's report fades to the morning; the
 * mature-content setting (Off / Fade-out only / Standard) is checked at every
 * entry point: this screen, the phone, the evenings, the venues, the preview
 * and the commit.
 *
 * Adults only: every list, every preview and every commit re-checks that
 * both are 18 or older on the day; a bond with anyone who is not is dropped.
 */

export const ADULT = 18;

export const PREGNANCY_RULES = [
  'Only inside a relationship you are both in (dating, committed, or an affair), never from paid company.',
  'Only on an evening you spend together (an accepted date, or an evening with your lover). Talks, gifts and introductions never count.',
  'Only with an adult woman aged 18 to 42 who is not already expecting.',
  'The odds per such evening: Off 0%, Rare 1%, Normal 4%.',
  'She knows first. She decides when (and whether) to tell you; nobody else is told.',
  'A child is a person in the game: born at Burdette Tomlin with a mother, a father by blood, a birth date; you decide what to do about a child of yours (pay, acknowledge, give the child your name and a place in the succession, or deny).',
];

/* ------------------------------------------------------------------ */
/* Orders and effect ops                                               */
/* ------------------------------------------------------------------ */

export type DateKind = 'coffee' | 'dinner' | 'night';
export type GiftTier = 'flowers' | 'jewelry';

export type DatingAction =
  | { op: 'talk'; id: string }
  | { op: 'invite'; id: string; date: DateKind }
  | { op: 'gift'; id: string; tier: GiftTier }
  | { op: 'steady'; id: string }
  | { op: 'commit'; id: string }
  | { op: 'reconcile'; id: string }
  | { op: 'meet'; tp: string }
  | { op: 'paid'; id: string }
  | { op: 'askOut'; id: string };

export type DatingOp =
  | { op: 'talk'; id: string }
  | { op: 'date'; id: string; date: DateKind }
  | { op: 'gift'; id: string; tier: GiftTier }
  | { op: 'steady'; id: string }
  | { op: 'commit'; id: string }
  | { op: 'reconcile'; id: string }
  | { op: 'meet'; tp: string }
  | { op: 'paid'; id: string; price: number }
  | { op: 'askOut'; id: string }
  | { op: 'refused'; id: string; what: string };

export const DATE_INFO: Record<DateKind, { label: string; cost: number; aff: number; where: string }> = {
  coffee: { label: 'Coffee', cost: 15, aff: 5, where: 'coffee and a pastry at the Doo Wop diner' },
  dinner: { label: 'Dinner', cost: 60, aff: 9, where: 'dinner at the Admiral, a walk on the boardwalk after' },
  night: { label: 'A night out', cost: 120, aff: 12, where: 'a table at the Rhumba Terrace, the band, a drive down to Cape May' },
};

export const GIFT_INFO: Record<GiftTier, { label: string; cost: number; aff: number }> = {
  flowers: { label: 'Flowers', cost: 25, aff: 4 },
  jewelry: { label: 'A bracelet from Bailey Banks & Biddle', cost: 300, aff: 8 },
};

const X = (op: DatingOp, label: string): Effect => ({ type: 'dating', op, label }) as Effect;
const $ = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

/* ------------------------------------------------------------------ */
/* Who: adults only, known people only                                 */
/* ------------------------------------------------------------------ */

export function ageOfChar(s: GameState, c: Character): number {
  return ageOn(c.birth, s.date);
}

/** An adult on the day (the one check every list, preview and commit makes). */
export function isAdult(s: GameState, c: Character | undefined): c is Character {
  return !!c && ageOfChar(s, c) >= ADULT;
}

const she = (c: Character) => (c.gender === 'F' ? 'she' : 'he');
const her = (c: Character) => (c.gender === 'F' ? 'her' : 'him');

function bossOk(s: GameState): string | undefined {
  const b = player(s);
  if (!b?.alive) return 'You are not here';
  if (!isFree(s, b)) return 'You are inside';
  if (s.travel?.fugitives.some((f) => !f.end && f.personId === b.id)) return 'You are in hiding';
  if (!isAdult(s, b)) return 'Not until you are 18';
  return undefined;
}

/** Why this person can't be part of the boss's dating life at all (undefined: she can). */
export function datingBlock(s: GameState, c: Character | undefined): string | undefined {
  const boss = player(s);
  if (!c || !c.alive) return 'Not here';
  if (c.id === boss.id) return 'That is you';
  if (!isAdult(s, c)) return 'Adults only';
  if (kin(boss, c)) return 'Family';
  return undefined;
}

/** How the boss knows her (undefined: he doesn't, and she isn't reasonably discoverable). */
export function knownVia(s: GameState, c: Character): string | undefined {
  const D = s.dating;
  const boss = player(s);
  if (D?.bonds[c.id]) return D.bonds[c.id].via;
  if (D?.met[c.id] !== undefined) return 'You have met';
  if (romanceBetween(s, boss.id, c.id)) return 'You are seeing each other';
  const ear = earOf(s, c.id);
  if (ear && ear.known && ear.status !== 'gone') return `One of the Ears (${ear.venue})`;
  if (s.ears && (s.ears.madam.id === c.id || s.ears.madam.lieutenants.includes(c.id))) return 'The Madam\'s house';
  const sp = c.spouseId ? s.characters[c.spouseId] : undefined;
  if (sp && sp.faction === 'player' && sp.id !== boss.id) return `${sp.firstName} ${sp.lastName}'s wife`;
  if (getRelation(s, c.id, boss.id) || getRelation(s, boss.id, c.id)) return 'You know each other';
  return undefined;
}

function isProviderOnly(s: GameState, c: Character): boolean {
  const p = s.dating?.providers[c.id];
  const b = s.dating?.bonds[c.id];
  return !!p && (!b || (b.pro ?? 0) > s.week || b.ended !== undefined);
}

/** The people the boss knows who could be part of his love life (adults he is drawn to; not family). */
export function peopleYouKnow(s: GameState): Character[] {
  const boss = player(s);
  return Object.values(s.characters).filter((c) => {
    if (datingBlock(s, c) || c.dynasty || c.id === boss.spouseId) return false;
    if (!drawnTo(s, boss, c) || !drawnTo(s, c, boss)) return false;
    if (isProviderOnly(s, c)) return false;
    return !!knownVia(s, c);
  });
}

/* ------------------------------------------------------------------ */
/* Her side: the stage, her decision                                   */
/* ------------------------------------------------------------------ */

export function bondOf(s: GameState, id: string): Bond | undefined {
  return s.dating?.bonds[id];
}

function ensureBond(s: GameState, D: DatingState, id: string, via: string): Bond {
  let b = D.bonds[id];
  if (!b) {
    const op = opinion(s, id, s.playerId);
    b = { id, aff: clamp(10 + Math.round(op / 4), 0, 40), rung: 'acquaintance', dates: 0, since: s.week, gifts: [], via };
    D.bonds[id] = b;
    D.met[id] ??= s.week;
  }
  return b;
}

function separatedFrom(s: GameState, a: string, b: string): boolean {
  return (s.romance?.separations ?? []).some((x) => !x.divorce && ((x.a === a && x.b === b) || (x.a === b && x.b === a)));
}

/** Where things stand between the boss and her, read off romance.ts first. */
export function stageOf(s: GameState, id: string): Stage {
  const boss = player(s);
  if (boss.spouseId === id && s.characters[id]?.alive) return separatedFrom(s, boss.id, id) ? 'separated' : 'married';
  const b = s.dating?.bonds[id];
  if (romanceBetween(s, boss.id, id)) return b?.committed ? 'committed' : 'dating';
  if (b?.ended) return 'ended';
  return b?.rung ?? 'acquaintance';
}

export function affectionWord(v: number): string {
  return v >= 80 ? 'in love with you' : v >= 60 ? 'very fond of you' : v >= 40 ? 'fond of you' : v >= 25 ? 'warm' : v >= 10 ? 'polite' : 'cool';
}

function married(s: GameState, c: Character): Character | undefined {
  const sp = c.spouseId ? s.characters[c.spouseId] : undefined;
  return sp?.alive ? sp : undefined;
}

function seeingSomeoneElse(s: GameState, c: Character): Character | undefined {
  const boss = player(s);
  const r = activeRomances(s, c.id).find((x) => x.a !== boss.id && x.b !== boss.id);
  if (r) return s.characters[r.a === c.id ? r.b : r.a];
  const E = s.ears;
  if (E) {
    const l = E.links.find((x) => x.ended === undefined && ROMANTIC.includes(x.type) && (x.a === c.id || x.b === c.id) && x.a !== boss.id && x.b !== boss.id);
    if (l) return s.characters[l.a === c.id ? l.b : l.a];
  }
  return undefined;
}

/**
 * Her answer to an invitation or a step up, as odds with every reason (the
 * same Acceptance the rest of the game shows). Never above 90%.
 */
export function herDecision(s: GameState, c: Character, what: 'talk' | 'date' | 'steady' | 'commit' | 'askOut' | 'reconcile', date?: DateKind): Acceptance {
  const boss = player(s);
  if (!isAdult(s, c) || !isAdult(s, boss)) return { chance: 0, reasons: [{ label: 'Adults only', value: -100 }] };
  if (what !== 'talk' && what !== 'reconcile' && !drawnTo(s, c, boss)) return { chance: 0, reasons: [{ label: `Not interested in you that way`, value: -100 }] };
  const op = opinion(s, c.id, boss.id);
  if (op <= -40) return { chance: 0, reasons: [{ label: `${c.firstName} wants nothing to do with you`, value: -100 }] };
  const b = bondOf(s, c.id);
  const aff = b?.aff ?? clamp(10 + Math.round(op / 4), 0, 40);
  const reasons: Reason[] = [];
  const base = what === 'talk' ? 70 : what === 'date' ? 20 : what === 'askOut' ? 10 : what === 'reconcile' ? 10 : 5;
  if (what !== 'talk' && what !== 'reconcile') {
    // Looks, charm, a ladies' man's practice and appetite at full weight (looks.ts allure); the rest of attraction at half.
    const al = allure(s, boss, c);
    for (const r of al.reasons) reasons.push(r);
    for (const r of attraction(s, c, boss).reasons) if (r.label !== 'Likes them' && r.label !== 'Dislikes them' && !/Charming|roving eye|type|looks|eye/i.test(r.label)) reasons.push({ label: r.label, value: Math.round(r.value * 0.5) });
  }
  reasons.push({ label: `Her feelings: ${affectionWord(aff)}`, value: Math.round((aff - 20) * (what === 'talk' ? 0.3 : 0.6)) });
  if (op) reasons.push({ label: op > 0 ? 'Thinks well of you' : 'Thinks little of you', value: Math.round(op * 0.2) });
  const st = stageOf(s, c.id);
  if (what === 'date') {
    const bonus: Partial<Record<Stage, number>> = { friends: 5, attracted: 10, dating: 20, committed: 25 };
    if (bonus[st]) reasons.push({ label: STAGE_LABEL[st], value: bonus[st]! });
    if (date === 'coffee') reasons.push({ label: 'Only coffee', value: 10 });
    if (date === 'night' && (st === 'acquaintance' || st === 'friends')) reasons.push({ label: 'A big night, too soon', value: -10 });
  }
  if (what === 'steady') reasons.push({ label: `${b?.dates ?? 0} evenings together`, value: Math.min(25, (b?.dates ?? 0) * 6) });
  if (what === 'commit') {
    const r = romanceBetween(s, boss.id, c.id);
    if (r) reasons.push({ label: `Together ${s.week - r.since} weeks`, value: Math.min(25, s.week - r.since) });
  }
  if (what === 'reconcile') {
    const sep = (s.romance?.separations ?? []).find((x) => (x.a === boss.id && x.b === c.id) || (x.b === boss.id && x.a === c.id));
    if (sep) reasons.push({ label: `Apart ${s.week - sep.week} weeks`, value: Math.min(20, Math.round((s.week - sep.week) / 2)) });
    if (activeRomances(s, boss.id).some((r) => r.a !== c.id && r.b !== c.id)) reasons.push({ label: 'You are still seeing someone', value: -30 });
  }
  if (what !== 'talk' && what !== 'reconcile') {
    const sp = married(s, c);
    if (sp) {
      reasons.push({ label: `Married to ${sp.firstName}`, value: -30 });
      const o = opinion(s, c.id, sp.id);
      if (o < 0) reasons.push({ label: 'An unhappy marriage', value: Math.min(25, Math.round(-o / 2)) });
    }
    const other = seeingSomeoneElse(s, c);
    if (other) reasons.push({ label: `Seeing ${other.firstName} ${other.lastName}`, value: -20 });
    if (married(s, boss)) {
      reasons.push({ label: 'You are a married man, and she knows it', value: -15 });
      if (hasTrait(c, 'Pious')) reasons.push({ label: 'Pious', value: -20 });
      if (hasTrait(c, 'Honest')) reasons.push({ label: 'Honest', value: -10 });
    }
    const ear = earOf(s, c.id);
    if (ear?.goal === 'marry') reasons.push({ label: 'Wants to marry well and quit', value: 8 });
    if (ear && (ear.goal === 'own_place' || ear.goal === 'vegas') && what === 'askOut') reasons.push({ label: 'Keeps her mind on her plans', value: -8 });
    if (ear?.boundaries.includes('no_married') && married(s, boss)) reasons.push({ label: 'Will not see a married man', value: -40 });
  }
  if (b?.no && s.week - b.no.week < 3) reasons.push({ label: `You asked ${s.week - b.no.week === 0 ? 'this' : s.week - b.no.week === 1 ? 'last' : 'two weeks ago, a'} week`, value: -15 });
  if (hasTrait(boss, 'Cruel')) reasons.push({ label: 'People say you have a cruel streak', value: -10 });
  const sum = reasons.reduce((a, r) => a + r.value, base);
  const cap = what === 'talk' ? 0.95 : 0.9;
  return { chance: Math.max(0.05, Math.min(cap, sum / 100)), reasons: [{ label: 'Base', value: base }, ...reasons.filter((r) => r.value !== 0)] };
}

/* ------------------------------------------------------------------ */
/* Providers: the street, the call girls, the high-end trade, dancers   */
/* ------------------------------------------------------------------ */

const STREET_SPOTS = ['Pacific Avenue after midnight', 'the corner of Rio Grande and New Jersey Avenue', 'outside the Bayview Grill', 'the motor court on the Boulevard'];
const ESCORT_SPOTS = ['through Starbright Talent', 'a number the Madam gives out', 'the lounge of the Royal Palm'];

function withRng<T>(s: GameState, D: DatingState, fn: () => T): T {
  const main = s.rng;
  s.rng = D.rng;
  try { return fn(); } finally { D.rng = s.rng; s.rng = main; }
}

const r10 = (n: number) => Math.max(10, Math.round(n / 10) * 10);
const r50 = (n: number) => Math.max(50, Math.round(n / 50) * 50);

function newProvider(s: GameState, D: DatingState, kind: 'street' | 'escort'): Provider {
  const h: RngHolder = D;
  const age = kind === 'street' ? 22 + Math.floor(rand(h) * 14) : 24 + Math.floor(rand(h) * 10);
  const c = withRng(s, D, () => makeCharacter(s, { gender: 'F', age, rank: 'civilian', faction: 'none', nickname: false, wealth: kind === 'escort' ? 4000 : 300 }));
  c.ambition = kind === 'street' ? 'Get off the street and into something steady' : 'Save enough to never need anyone';
  const p: Provider = {
    id: c.id, kind, venue: kind === 'street' ? STREET_SPOTS[Math.floor(rand(h) * STREET_SPOTS.length)] : ESCORT_SPOTS[Math.floor(rand(h) * ESCORT_SPOTS.length)],
    price: kind === 'street' ? r10(40 + rand(h) * 40) : r50(600 + rand(h) * 600), offers: true,
    discretion: kind === 'street' ? 25 + Math.floor(rand(h) * 30) : 70 + Math.floor(rand(h) * 25),
    via: kind === 'street' ? 'street' : 'madam', since: s.week, status: 'working', visits: [],
  };
  D.providers[c.id] = p;
  return p;
}

/** Dancers and call girls are the Ears' women: their terms come from her record (a dancer offers company only if she does). */
function syncEars(s: GameState, D: DatingState): void {
  for (const e of Object.values(s.ears?.ears ?? {})) {
    if (e.work !== 'dancer' && e.work !== 'callgirl') continue;
    const c = s.characters[e.id];
    let p = D.providers[e.id];
    if (!p) {
      const kind: ProviderKind = e.work === 'callgirl' ? 'callgirl' : 'dancer';
      const offers = kind === 'callgirl' || hashSeed(`${s.seed}:offers:${e.id}`) % 100 < 35;
      const base = kind === 'callgirl' ? 150 + (hashSeed(`${s.seed}:cg:${e.id}`) % 150) : 200 + (hashSeed(`${s.seed}:dn:${e.id}`) % 150);
      p = { id: e.id, kind, venue: e.venue, price: r50(base * e.greed), offers, discretion: e.discretion, via: kind === 'callgirl' ? 'phone' : 'club', since: s.week, status: 'working', visits: [], ear: true };
      D.providers[e.id] = p;
    }
    if ((e.status === 'gone' || !c?.alive) && p.status === 'working') {
      p.status = 'left';
      p.left = { week: s.week, why: e.left?.why ?? 'she left the island' };
    }
  }
}

/** The roster: the street and the high-end trade (made once), and the Ears' dancers and call girls. */
export function ensureProviders(s: GameState, D: DatingState): void {
  const own = Object.values(D.providers).filter((p) => !p.ear);
  if (!own.length) {
    for (let i = 0; i < 3; i++) newProvider(s, D, 'street');
    for (let i = 0; i < 2; i++) newProvider(s, D, 'escort');
  }
  syncEars(s, D);
}

export interface ProviderRow {
  id: string;
  name: string;
  age: number;
  kind: ProviderKind;
  kindLabel: string;
  where: string;
  price: number;
  /** How to reach her, plain. */
  reach: string;
  /** Why she can't be booked now (shown as the disabled reason). */
  blocked?: string;
  /** Her answer is not a given. */
  note: string;
}

function providerReach(s: GameState, p: Provider): { reach: string; blocked?: string } {
  if (p.via === 'street') return { reach: `On ${p.venue}` };
  if (p.via === 'club') return { reach: `Dances at ${p.venue}` };
  const m = madamOf(s);
  if (p.via === 'madam') {
    if (!m?.alive) return { reach: 'Through the Madam', blocked: 'There is no Madam to make the call' };
    if (opinion(s, m.id, s.playerId) < -10) return { reach: `Through ${m.firstName}`, blocked: `${m.firstName} is not taking your calls` };
    return { reach: `Through ${m.firstName}, ${p.venue}` };
  }
  return { reach: `Takes calls at ${p.venue}` };
}

/** Is she bookable at all this week, and why not. */
export function providerBlock(s: GameState, p: Provider | undefined): string | undefined {
  if (!adultOn(s)) return 'Adult services are turned off in Settings';
  if (!p) return 'Not available';
  const c = s.characters[p.id];
  if (!isAdult(s, c)) return 'Adults only';
  if (!c.alive || p.status !== 'working') return 'She has left the life';
  if (!p.offers) return `${c.firstName} dances; she does not offer company`;
  if (!isFree(s, c)) return 'She is in jail';
  const why = bossOk(s);
  if (why) return why;
  if (p.visits.includes(s.week)) return 'Already booked this week';
  const r = providerReach(s, p);
  return r.blocked;
}

/** The adult-services list (empty when the setting is Off). Dancers who do not offer company are not on it. */
export function providerRows(s: GameState, venue?: string): ProviderRow[] {
  if (!adultOn(s)) return [];
  const D = s.dating;
  if (!D) return [];
  const out: ProviderRow[] = [];
  for (const p of Object.values(D.providers)) {
    const c = s.characters[p.id];
    if (!c?.alive || !isAdult(s, c) || p.status !== 'working' || !p.offers) continue;
    if (venue && p.venue !== venue) continue;
    const r = providerReach(s, p);
    out.push({
      id: p.id, name: displayName(c), age: ageOfChar(s, c), kind: p.kind, kindLabel: PROVIDER_LABEL[p.kind], where: p.venue, price: p.price,
      reach: r.reach, blocked: providerBlock(s, p),
      note: p.kind === 'street' ? 'Cash, her terms. She can say no.' : p.kind === 'escort' ? 'Dinner first, discretion guaranteed. She chooses her clients.' : p.kind === 'dancer' ? 'She offers company herself. She can still say no.' : 'By telephone. She decides who she sees.',
    });
  }
  const order: Record<ProviderKind, number> = { street: 0, dancer: 1, callgirl: 2, escort: 3 };
  return out.sort((a, b) => order[a.kind] - order[b.kind] || a.price - b.price);
}

/* ------------------------------------------------------------------ */
/* What can go wrong (shown before the boss confirms)                  */
/* ------------------------------------------------------------------ */

export interface PaidRisk { key: 'wife' | 'rumor' | 'photo' | 'vice' | 'ear'; chance: number; text: string; effects: Effect[] }

export function paidRisks(s: GameState, p: Provider): PaidRisk[] {
  const boss = player(s);
  const c = s.characters[p.id];
  const wife = married(s, boss);
  const d = 1 - p.discretion / 150;
  const k = { street: 1.4, dancer: 1, callgirl: 0.8, escort: 0.4 }[p.kind] * (hasTrait(boss, 'Womanizer') ? 1.3 : 1) * d;
  const pc = (x: number) => Math.round(Math.min(0.5, x * k) * 100) / 100;
  const out: PaidRisk[] = [];
  if (wife) out.push({ key: 'wife', chance: pc(0.1), text: `${wife.firstName} hears where you spent the night`, effects: [{ type: 'opinion', from: wife.id, to: boss.id, amount: -12, reason: 'Heard where you spent the night', decay: 1, label: 'She heard' }, { type: 'familyOpinion', amount: -2, reason: 'The boss and his nights out', label: 'She heard' }] });
  out.push({ key: 'rumor', chance: pc(0.1), text: 'A rumor goes around the island (true or not, it is a rumor)', effects: [{ type: 'respect', amount: -1, label: 'Talk about the boss' }, ...(p.kind === 'street' ? [{ type: 'rivalOpinion', rival: 'philly', amount: -3, reason: 'A boss who gets talked about on Pacific Avenue', label: 'Philadelphia hears' } as Effect] : [])] });
  out.push({ key: 'photo', chance: pc(0.05), text: 'Somebody has a photograph (a secret a rival can use)', effects: [] });
  if (p.kind === 'street') out.push({ key: 'vice', chance: pc(0.07), text: 'The vice squad was working the avenue that night', effects: [{ type: 'heat', bar: 'local', amount: 3, label: 'The vice squad saw your car' }] });
  if (p.ear && c) out.push({ key: 'ear', chance: pc(0.12), text: `${c.firstName} is one of the Ears, and she talks to the Madam`, effects: [{ type: 'heat', bar: 'local', amount: 1, label: 'The island knows where the boss spends his nights' }] });
  return out;
}

/* ------------------------------------------------------------------ */
/* Previews                                                            */
/* ------------------------------------------------------------------ */

function eveningsLeft(s: GameState): number {
  return roundSlots(s).slots - datingEvenings(s);
}

function base(title: string, because: string): ActionPreview {
  return { title, effects: [], cost: 0, because, category: 'event' };
}

/** The button's own words: what you do, to whom, and the price. */
export function previewDating(s: GameState, a: DatingAction): ActionPreview {
  const p0 = previewDating0(s, a);
  const zero = p0.acceptance && p0.acceptance.chance === 0 ? p0.acceptance.reasons.find((r) => r.value <= -100)?.label : undefined;
  const p = zero && !p0.disabledReason ? { ...p0, disabledReason: zero } : p0;
  const c = a.op === 'meet' ? undefined : s.characters[a.id];
  const n = c?.firstName ?? 'her';
  const cost = p.cost ? ` — ${$(p.cost)}` : '';
  const words: Record<DatingAction['op'], string> = {
    talk: `Talk to ${n}`, invite: a.op === 'invite' ? `Ask ${n} to ${a.date === 'coffee' ? 'coffee' : a.date === 'dinner' ? 'dinner' : 'a night out'}` : '', gift: `Send the gift`, steady: `Ask ${n}`, commit: `Ask ${n}`,
    reconcile: `Ask ${n} to come home`, meet: 'Arrange the introduction', paid: `Ask ${n} for the evening`, askOut: `Ask ${n} out`,
  };
  return { ...p, verb: `${words[a.op]}${cost}` };
}

function previewDating0(s: GameState, a: DatingAction): ActionPreview {
  const D = s.dating;
  if (a.op === 'meet') return previewMeet(s, a.tp);
  const c = s.characters[a.id];
  const blocked = datingBlock(s, c) ?? bossOk(s);
  if (!c) return { ...base('Nobody', 'did nothing'), disabledReason: 'Not here' };
  const first = c.firstName;
  const st = stageOf(s, c.id);
  const b = bondOf(s, c.id);
  const evenings = eveningsLeft(s);
  const noEvening = evenings <= 0 ? 'No evenings left this week' : undefined;
  const evNote = `Takes one of your evenings this week (${Math.max(0, evenings)} left before it).`;
  switch (a.op) {
    case 'talk': {
      const p = base(`Get to know ${first}`, `got to know ${first}`);
      return {
        ...p, detail: `A few minutes wherever ${she(c)} is: the bakery on Pacific, after Mass, the coat check. No evening, no money.`,
        effects: [X({ op: 'talk', id: c.id }, `Got to know ${first}`)], acceptance: herDecision(s, c, 'talk'),
        refuseEffects: [X({ op: 'refused', id: c.id, what: 'talk' }, `${first} was busy`)],
        disabledReason: blocked ?? (!isFree(s, c) ? 'In jail' : undefined),
      };
    }
    case 'invite': {
      const info = DATE_INFO[a.date];
      const pro = b?.pro && b.pro > s.week ? `${first} asked to keep it professional (until week ${b.pro})` : undefined;
      const provider = D?.providers[c.id] && !b ? `${first} works nights: ask ${her(c)} for a personal date first` : undefined;
      const over = st === 'married' || st === 'separated' ? `${first} is your wife: an evening with her is in your rounds` : undefined;
      return {
        ...base(`Ask ${first} out: ${info.label.toLowerCase()}`, `asked ${first} out`), cost: info.cost, pot: 'pocket',
        detail: `${info.where[0].toUpperCase()}${info.where.slice(1)}. ${evNote} ${she(c)[0].toUpperCase()}${she(c).slice(1)} decides; if ${she(c)} says no, you pay nothing.`,
        effects: [{ type: 'money', pot: 'pocket', amount: -info.cost, label: `${info.label} with ${first}` }, X({ op: 'date', id: c.id, date: a.date }, `${info.label} with ${first}`)],
        acceptance: herDecision(s, c, 'date', a.date), refuseEffects: [X({ op: 'refused', id: c.id, what: 'a date' }, `${first} said no`)],
        warning: married(s, c) ? `${first} is married. A date is an affair, and secrets on this island get out.` : married(s, player(s)) ? 'You are married. Your wife may hear of it.' : undefined,
        disabledReason: blocked ?? over ?? pro ?? provider ?? (!isFree(s, c) ? 'In jail' : undefined) ?? noEvening,
      };
    }
    case 'gift': {
      const g = GIFT_INFO[a.tier];
      const recent = (b?.gifts ?? []).filter((w) => s.week - w < 8).length;
      return {
        ...base(`Send ${first} ${a.tier === 'flowers' ? 'flowers' : 'a bracelet'}`, `sent ${first} a gift`), cost: g.cost, pot: 'pocket',
        detail: `${g.label}. A gift warms ${her(c)} a little${recent ? ` (less each time: ${recent} in the last 8 weeks)` : ''}; it never decides anything for ${her(c)}.${a.tier === 'jewelry' && st !== 'dating' && st !== 'committed' && (hasTrait(c, 'Honest') || hasTrait(c, 'Pious')) ? ` ${first} may think it too much, too soon.` : ''}`,
        effects: [{ type: 'money', pot: 'pocket', amount: -g.cost, label: `${g.label} for ${first}` }, X({ op: 'gift', id: c.id, tier: a.tier }, `${g.label} for ${first}`)],
        disabledReason: blocked ?? (b?.pro && b.pro > s.week ? `${first} keeps it professional` : undefined) ?? (D?.providers[c.id] && !b ? `Ask ${first} for a personal date first` : undefined),
      };
    }
    case 'steady': {
      const ready = b && b.rung === 'attracted' && b.aff >= 40 && b.dates >= 2;
      const why = !b ? `Get to know ${first} first` : b.rung !== 'attracted' ? `${first} is not drawn to you yet (${STAGE_LABEL[b.rung].toLowerCase()})` : b.aff < 40 ? `${first} is not there yet (feelings ${b.aff} of 40)` : b.dates < 2 ? `Only ${b.dates} evening${b.dates === 1 ? '' : 's'} together (needs 2)` : undefined;
      const affair = married(s, c) || married(s, player(s));
      return {
        ...base(`Ask ${first} to be your girl`, `asked ${first} to go steady`),
        detail: affair ? `Someone is married: this would be an affair. Secret, and secrets get out.` : 'A courtship: Sunday drives, the whole parish watching. The first step toward a ring.',
        effects: [{ type: 'storyOp', op: { op: 'romance', a: player(s).id, b: c.id }, label: `${first} and you` }, X({ op: 'steady', id: c.id }, `${first} and you`)],
        acceptance: ready ? herDecision(s, c, 'steady') : undefined, refuseEffects: [X({ op: 'refused', id: c.id, what: 'going steady' }, `${first} said not yet`)],
        disabledReason: blocked ?? (romanceBetween(s, player(s).id, c.id) ? 'You are already together' : undefined) ?? (ready ? undefined : why) ?? (!drawnTo(s, player(s), c) || !drawnTo(s, c, player(s)) ? `${first} is not interested in you that way` : undefined),
      };
    }
    case 'commit': {
      const r = romanceBetween(s, player(s).id, c.id);
      return {
        ...base(`Make it exclusive with ${first}`, `made it exclusive with ${first}`),
        detail: 'No one else, and everyone knows it. She decides.',
        effects: [X({ op: 'commit', id: c.id }, `Exclusive with ${first}`)], acceptance: r ? herDecision(s, c, 'commit') : undefined,
        refuseEffects: [X({ op: 'refused', id: c.id, what: 'commitment' }, `${first} wants to wait`)],
        disabledReason: blocked ?? (!r ? 'You are not together' : b?.committed ? 'Already committed' : r && s.week - r.since < 4 ? `Together only ${s.week - r.since} weeks (needs 4)` : (b?.aff ?? 0) < 50 ? `${first} is not there yet (feelings ${b?.aff ?? 0} of 50)` : undefined),
      };
    }
    case 'reconcile': {
      const sep = st === 'separated';
      return {
        ...base(`Ask ${first} to come home`, `asked ${first} to come home`),
        detail: 'Flowers, the monsignor, a promise. She decides whether it means anything.',
        cost: 200, pot: 'pocket',
        effects: [{ type: 'money', pot: 'pocket', amount: -200, label: `Courting ${first} again` }, X({ op: 'reconcile', id: c.id }, `${first} comes home`)],
        acceptance: sep ? herDecision(s, c, 'reconcile') : undefined, refuseEffects: [X({ op: 'refused', id: c.id, what: 'coming home' }, `${first} said no`)],
        disabledReason: blocked ?? (sep ? undefined : 'You are not separated'),
      };
    }
    case 'paid': return previewPaid(s, c);
    case 'askOut': {
      const p = D?.providers[c.id];
      const pursue = pursueChance(s, c);
      const pro = b?.pro && b.pro > s.week ? `${first} asked to keep it professional (until week ${b.pro})` : undefined;
      return {
        ...base(`Ask ${first} out for a personal evening`, `asked ${first} out, off the clock`), cost: DATE_INFO.dinner.cost, pot: 'pocket',
        detail: `Not a booking: dinner as yourself, no money changing hands with ${her(c)}. ${evNote} If ${she(c)} says yes, about ${Math.round(pursue * 100)}% ${she(c)} takes it personally; otherwise ${she(c)} keeps it professional.`,
        effects: [{ type: 'money', pot: 'pocket', amount: -DATE_INFO.dinner.cost, label: `Dinner with ${first}` }, X({ op: 'askOut', id: c.id }, `Dinner with ${first}`)],
        acceptance: herDecision(s, c, 'askOut'), refuseEffects: [X({ op: 'refused', id: c.id, what: 'a personal date' }, `${first} said no`)],
        disabledReason: blocked ?? (!p ? 'Ask her out the usual way' : undefined) ?? (b && !b.pro && !b.ended ? 'You are already seeing each other personally' : undefined) ?? pro ?? (!isFree(s, c) ? 'In jail' : undefined) ?? noEvening,
      };
    }
  }
}

function pursueChance(s: GameState, c: Character): number {
  const att = attraction(s, c, player(s)).value;
  const ear = earOf(s, c.id);
  return clamp(0.3 + att / 100 + (ear?.goal === 'marry' ? 0.15 : 0) - (ear && (ear.goal === 'own_place' || ear.goal === 'vegas') ? 0.1 : 0), 0.05, 0.85);
}

function paidAcceptance(s: GameState, c: Character, p: Provider): Acceptance {
  const boss = player(s);
  const reasons: Reason[] = [];
  const op = opinion(s, c.id, boss.id);
  if (op < 0) reasons.push({ label: 'Thinks little of you', value: Math.round(op / 2) });
  if (hasTrait(boss, 'Cruel')) reasons.push({ label: 'Has heard you can be cruel', value: -40 });
  const ear = earOf(s, c.id);
  if (ear?.boundaries.includes('no_married') && married(s, boss)) return { chance: 0, reasons: [{ label: 'Will not see a married man', value: -100 }] };
  if (ear?.boundaries.includes('no_rough') && hasTrait(boss, 'Cruel')) return { chance: 0, reasons: [{ label: 'Will not see a man known to get rough', value: -100 }] };
  const other = seeingSomeoneElse(s, c);
  if (other) reasons.push({ label: `Seeing ${other.firstName} now`, value: -25 });
  if (p.visits.length) reasons.push({ label: 'You were a gentleman last time', value: 5 });
  const base = 80;
  const sum = reasons.reduce((a, r) => a + r.value, base);
  return { chance: Math.max(0.05, Math.min(0.95, sum / 100)), reasons: [{ label: 'Base', value: base }, ...reasons] };
}

function previewPaid(s: GameState, c: Character): ActionPreview {
  const D = s.dating;
  const p = D?.providers[c.id];
  const first = c.firstName;
  const kind = p ? PROVIDER_LABEL[p.kind].toLowerCase() : 'companion';
  const price = p?.price ?? 0;
  const risks = p ? paidRisks(s, p) : [];
  const evenings = eveningsLeft(s);
  const reach = p ? providerReach(s, p) : undefined;
  return {
    ...base(`An evening with ${first}: ${$(price)}`, `paid for an evening's company`), cost: price, pot: 'pocket',
    detail: `${displayName(c)}, ${p ? ageOfChar(s, c) : '?'}, ${kind}. ${reach?.reach ?? ''}. Her price is ${$(price)} for the evening, paid from your pocket${price ? '' : ''}; it is an agreed transaction between adults and nothing more: no feelings, no relationship, no standing arrangement. She can say no, and then you pay nothing. Takes one of your evenings this week (${Math.max(0, evenings)} left before it). The report ends at the door.`,
    effects: [{ type: 'money', pot: 'pocket', amount: -price, label: `An evening's company (${first})` }, X({ op: 'paid', id: c.id, price }, `An evening's company (${first})`)],
    acceptance: p ? paidAcceptance(s, c, p) : undefined,
    refuseEffects: [X({ op: 'refused', id: c.id, what: 'the booking' }, `${first} said no`)],
    warning: risks.length ? `What can go wrong: ${risks.map((r) => `${Math.round(r.chance * 100)}% ${r.text}`).join(' · ')}` : undefined,
    disabledReason: providerBlock(s, p) ?? (evenings <= 0 ? 'No evenings left this week' : undefined),
  };
}

/** Townswomen you could be introduced to (the living district's single adult women, a few a month). */
export function introductions(s: GameState): { tp: string; name: string; age: number; line: string }[] {
  const L = s.living;
  if (!L) return [];
  const boss = player(s);
  const D = s.dating;
  const y = s.date.y;
  const m = s.date.m;
  const month = Math.floor(s.week / 4);
  const pool: { p: Tp; k: number }[] = [];
  for (const p of Object.values(L.people)) {
    if (!present(p, s.week) || p.sp || p.sepd || D?.tp[p.id]) continue;
    const a = ageOf(p, y, m);
    if (a < ADULT || a > 45) continue;
    if (boss.gender === 'M' ? p.g !== 'F' : p.g !== 'M') continue;
    pool.push({ p, k: hashSeed(`${s.seed}:intro:${month}:${p.id}`) });
  }
  return pool.sort((a, b) => a.k - b.k).slice(0, 4).map(({ p }) => {
    const hh = L.hh[p.hh];
    const job = p.job && L.biz[p.job] ? 'works on the Boardwalk' : p.job === 'home' ? 'keeps house for her family' : p.job === 'school' ? 'is finishing school' : 'is looking for work';
    return { tp: p.id, name: `${p.f} ${p.l}`, age: ageOf(p, y, m), line: `Of ${hh?.name ?? 'a Boardwalk family'}; ${job}.` };
  });
}

function previewMeet(s: GameState, tp: string): ActionPreview {
  const L = s.living;
  const p = L?.people[tp];
  const a = p ? ageOf(p, s.date.y, s.date.m) : 0;
  const nm = p ? `${p.f} ${p.l}` : 'her';
  return {
    ...base(`Get introduced to ${nm}`, `were introduced to ${nm}`),
    detail: `Your capo's wife knows the family. A proper introduction after Mass: nothing more is promised, and ${p?.f ?? 'she'} makes up her own mind about you.`,
    effects: [X({ op: 'meet', tp }, `Introduced to ${nm}`)],
    disabledReason: bossOk(s) ?? (!p || !present(p, s.week) ? 'She is not around' : a < ADULT ? 'Adults only' : p.sp ? 'She is married' : s.dating?.tp[tp] ? 'You have met' : undefined),
  };
}

/* ------------------------------------------------------------------ */
/* Effect ops                                                          */
/* ------------------------------------------------------------------ */

function log(D: DatingState, s: GameState, text: string, kind: DatingState['log'][number]['kind'], charId?: string): void {
  D.log.push({ week: s.week, text, kind, charId });
  if (D.log.length > 60) D.log.splice(0, D.log.length - 60);
}

function useEvening(s: GameState, D: DatingState): void {
  if (D.evenings.week !== s.week) D.evenings = { week: s.week, n: 0 };
  D.evenings.n++;
}

function climb(s: GameState, b: Bond, c: Character): string | undefined {
  const boss = player(s);
  if (b.rung === 'acquaintance' && b.aff >= 25) { b.rung = 'friends'; return `${c.firstName} and you are friends now.`; }
  if (b.rung === 'friends' && b.aff >= 40 && attraction(s, c, boss).value > 0) { b.rung = 'attracted'; return `${c.firstName} looks at you differently lately.`; }
  return undefined;
}

/** The odds a qualifying evening starts a pregnancy (0 when the rules say it can't). */
export function conceptionOdds(s: GameState, c: Character): number {
  const boss = player(s);
  const odds = PREGNANCY_ODDS[datingSettings(s).pregnancy];
  if (!odds) return 0;
  const r = romanceBetween(s, boss.id, c.id);
  if (!r) return 0;
  const woman = c.gender === 'F' ? c : boss.gender === 'F' ? boss : undefined;
  const man = woman === c ? boss : c;
  if (!woman || man.gender !== 'M' || woman.gender !== 'F') return 0;
  const a = ageOfChar(s, woman);
  if (a < ADULT || a > 42 || !isAdult(s, man)) return 0;
  if ((s.romance?.pregnancies ?? []).some((p) => p.motherId === woman.id)) return 0;
  return odds * fertility(s, man) * fertility(s, woman);
}

/** An evening together inside a relationship: the only way a pregnancy begins here (`mult` < 1: she is careful). */
export function maybeConceive(s: GameState, D: DatingState, c: Character, key: string, mult = 1): void {
  const odds = conceptionOdds(s, c) * mult;
  if (!odds || roll(`${s.seed}|${s.week}|conceive|${key}|${c.id}`) >= odds) return;
  const boss = player(s);
  const woman = c.gender === 'F' ? c : boss;
  const man = woman === c ? boss : c;
  const R = ensureRomance(s);
  const r = romanceBetween(s, boss.id, c.id);
  const id = `pg${s.nextId++}`;
  R.pregnancies.push({ id, motherId: woman.id, fatherId: man.id, romanceId: r?.id, dueWeek: s.week + 36 + Math.floor(roll(`${s.seed}|${s.week}|due|${c.id}`) * 4) });
  R.stats.pregnancies++;
  D.stats.pregnancies++;
  D.preg.push({ id, motherId: woman.id, week: s.week, knownBy: [woman.id], tellAt: s.week + 6 + Math.floor(roll(`${s.seed}|tell|${id}`) * 4) });
}

function rumor(s: GameState, D: DatingState, about: string, text: string, isTrue: boolean, heard: string[]): void {
  D.rumors.push({ week: s.week, text, about, heard, true: isTrue });
  if (D.rumors.length > 20) D.rumors.splice(0, D.rumors.length - 20);
}

export function applyDatingOp(ctx: Ctx, o: DatingOp): void {
  const s = ctx.s;
  const D = ensureDating(s);
  const boss = player(s);
  if (o.op === 'meet') {
    const L = s.living;
    const p = L?.people[o.tp];
    if (!p || !present(p, s.week) || D.tp[o.tp] || p.sp) return;
    const a = ageOf(p, s.date.y, s.date.m);
    if (a < ADULT) return;
    const c = withRng(s, D, () => makeCharacter(s, { gender: p.g, firstName: p.f, lastName: p.l, ethnicity: p.eth, age: a, rank: 'civilian', faction: 'none', nickname: false, wealth: 300 }));
    c.birth = { y: p.by, m: p.bm, d: 1 + (hashSeed(p.id) % 28) };
    if (ageOfChar(s, c) < ADULT) c.birth = { ...c.birth, y: s.date.y - ADULT - 1 };
    D.tp[o.tp] = c.id;
    D.met[c.id] = s.week;
    ensureBond(s, D, c.id, `Introduced after Mass (${L!.hh[p.hh]?.name ?? 'a Boardwalk family'})`);
    D.stats.intros++;
    log(D, s, `You were introduced to ${p.f} ${p.l}.`, 'life', c.id);
    ctx.log.push(`You were introduced to ${p.f} ${p.l} after Mass.`);
    return;
  }
  const c = s.characters[o.id];
  // Adults only, re-checked when the week runs.
  if (!c?.alive || !isAdult(s, c) || !isAdult(s, boss) || kin(boss, c)) return;
  switch (o.op) {
    case 'talk': {
      const b = ensureBond(s, D, c.id, 'You have met');
      b.aff = clamp(b.aff + 4);
      addOpinion(s, c.id, boss.id, 'We talked', 3, 1);
      const up = climb(s, b, c);
      if (up) log(D, s, up, 'stage', c.id);
      break;
    }
    case 'date': {
      const b = ensureBond(s, D, c.id, 'You have met');
      const info = DATE_INFO[o.date];
      const chem = attraction(s, c, boss).value;
      b.aff = clamp(b.aff + info.aff + Math.round(Math.max(-4, Math.min(6, chem / 8))));
      b.dates++;
      b.last = s.week;
      b.ended = undefined;
      useEvening(s, D);
      D.stats.dates++;
      addOpinion(s, c.id, boss.id, 'A good evening', 4, 1);
      const up = climb(s, b, c);
      const line = `${info.label} with ${c.firstName}: ${info.where}.`;
      log(D, s, up ? `${line} ${up}` : line, 'date', c.id);
      ctx.log.push(up ? `${line} ${up}` : line);
      const wife = married(s, boss);
      if (wife && wife.id !== c.id && roll(`${s.seed}|${s.week}|datewife|${c.id}`) < 0.12) {
        applyEffects(ctx, [{ type: 'opinion', from: wife.id, to: boss.id, amount: -8, reason: 'Heard you were out with someone', decay: 1, label: `${wife.firstName} heard` }], { label: `${wife.firstName} heard`, because: `were seen out with ${c.firstName}`, category: 'event' });
        rumor(s, D, boss.id, `The boss was seen out with ${c.firstName} ${c.lastName}.`, true, [wife.id]);
      }
      maybeConceive(s, D, c, `date:${o.date}`);
      break;
    }
    case 'gift': {
      const b = ensureBond(s, D, c.id, 'You have met');
      const g = GIFT_INFO[o.tier];
      const n = b.gifts.filter((w) => s.week - w < 8).length;
      const st = stageOf(s, c.id);
      const tooMuch = o.tier === 'jewelry' && st !== 'dating' && st !== 'committed' && (hasTrait(c, 'Honest') || hasTrait(c, 'Pious'));
      b.aff = clamp(b.aff + (tooMuch ? -3 : Math.round(g.aff / (1 + n))));
      b.gifts = [...b.gifts.filter((w) => s.week - w < 8), s.week];
      D.stats.gifts++;
      log(D, s, tooMuch ? `${c.firstName} sent the bracelet back with a polite note. Too much, too soon.` : `${c.firstName} got your ${o.tier === 'flowers' ? 'flowers' : 'bracelet'}.`, 'gift', c.id);
      if (tooMuch) ctx.log.push(`${c.firstName} sent the bracelet back. Too much, too soon.`);
      break;
    }
    case 'steady': {
      const b = ensureBond(s, D, c.id, 'You have met');
      b.aff = clamp(b.aff + 5);
      log(D, s, `${c.firstName} said yes. You are seeing each other.`, 'stage', c.id);
      break;
    }
    case 'commit': {
      const b = ensureBond(s, D, c.id, 'You have met');
      if (!romanceBetween(s, boss.id, c.id)) break;
      b.committed = true;
      b.aff = clamp(b.aff + 5);
      log(D, s, `${c.firstName} and you: nobody else.`, 'stage', c.id);
      break;
    }
    case 'reconcile': {
      const R = ensureRomance(s);
      R.separations = R.separations.filter((x) => !((x.a === boss.id && x.b === c.id) || (x.b === boss.id && x.a === c.id)));
      addOpinion(s, c.id, boss.id, 'He asked me to come home', 20, 1);
      log(D, s, `${c.firstName} came home.`, 'stage', c.id);
      s.dynastyHistory.push({ week: s.week, date: { ...s.date }, text: `${displayName(boss)} and ${displayName(c)} were reconciled.` });
      break;
    }
    case 'askOut': {
      const p = D.providers[c.id];
      useEvening(s, D);
      const pursue = roll(`${s.seed}|${s.week}|pursue|${c.id}`) < pursueChance(s, c);
      const b = ensureBond(s, D, c.id, p ? `${PROVIDER_LABEL[p.kind]}, ${p.venue}` : 'You have met');
      b.dates++;
      b.last = s.week;
      if (pursue) {
        b.pro = undefined;
        b.ended = undefined;
        b.aff = clamp(b.aff + 12);
        if (b.rung === 'acquaintance') b.rung = 'friends';
        log(D, s, `Dinner with ${c.firstName}, off the clock. She laughed, and meant it. She wants to see you again, as herself.`, 'date', c.id);
        ctx.log.push(`Dinner with ${c.firstName}, off the clock. She wants to see you again.`);
        maybeConceive(s, D, c, 'askOut');
      } else {
        b.pro = s.week + 12;
        b.aff = clamp(b.aff + 2);
        log(D, s, `Dinner with ${c.firstName}. She was lovely, and she was clear: business is business. She keeps it professional.`, 'date', c.id);
        ctx.log.push(`${c.firstName} had dinner with you and kept it professional.`);
      }
      break;
    }
    case 'paid': {
      const p = D.providers[c.id];
      if (!p || providerBlock(s, p)) break;
      p.visits = [...p.visits.filter((w) => s.week - w < 52), s.week];
      useEvening(s, D);
      D.stats.paid++;
      // No affection, no relationship, no standing access: only the evening, and what may come of it.
      const mature = datingSettings(s).mature;
      const scene = mature === 'standard'
        ? (p.kind === 'escort' ? `Dinner in Cape May with ${c.firstName}, who knew which fork and which wine, and a drive back along the bay. ` : p.kind === 'street' ? `${c.firstName} named her price and her rules in the car, and you kept to both. ` : `${c.firstName} met you after her last set, in a coat over the costume, and you talked until the band packed up. `)
        : '';
      const line = `${scene}An evening with ${c.firstName}, agreed and paid. Then it was morning.`;
      log(D, s, line, 'paid', c.id);
      ctx.log.push(line);
      applyEffects(ctx, [{ type: 'dyn', op: { op: 'stress', charId: boss.id, amount: -10, source: 'domestic' }, label: 'An evening away from everything' } as Effect].filter(() => !!s.dyn), { label: 'An evening away', because: 'took an evening away', category: 'event' });
      if (p.ear && s.ears?.ears[c.id]) applyEffects(ctx, [{ type: 'ears', op: { op: 'loyalty', earId: c.id, amount: 2 }, label: 'Paid what she asked, asked nothing else' } as Effect], { label: 'Paid what she asked', because: 'paid what she asked', category: 'event' });
      for (const r of paidRisks(s, p)) {
        if (roll(`${s.seed}|${s.week}|risk:${r.key}|${c.id}`) >= r.chance) continue;
        if (r.effects.length) applyEffects(ctx, r.effects, { label: r.text, because: r.text.toLowerCase(), category: 'event' });
        if (r.key === 'rumor' || r.key === 'wife' || r.key === 'ear') rumor(s, D, boss.id, `The boss was seen with ${PROVIDER_LABEL[p.kind].toLowerCase() === 'dancer' ? 'a dancer' : 'a working girl'} from ${p.venue}.`, true, r.key === 'wife' ? [married(s, boss)?.id ?? 'island'] : ['island']);
        if (r.key === 'photo') {
          const rival = s.rivals.find((x) => x.kind === 'mob' && s.characters[x.leaderId]?.alive);
          const knownBy: FactionId[] = rival ? [rival.id as FactionId] : [];
          const sec = addSecret(s, boss, 'affair', knownBy);
          sec.text = `${displayName(boss)} was photographed with ${displayName(c)}`;
          if (rival && !sec.knownBy.includes(rival.id as FactionId)) sec.knownBy.push(rival.id as FactionId);
        }
        ctx.log.push(`${r.text}.`);
        log(D, s, `${r.text}.`, 'rumor', c.id);
        break;
      }
      break;
    }
    case 'refused': {
      const b = ensureBond(s, D, c.id, 'You have met');
      b.no = { week: s.week, what: o.what };
      if (o.what === 'the booking') D.stats.declinedPaid++;
      else D.stats.refused++;
      if (o.what === 'a date' || o.what === 'going steady') addOpinion(s, c.id, boss.id, 'Asked me out', -2, 1);
      log(D, s, `${c.firstName} said no (${o.what}). That is her right.`, 'no', c.id);
      break;
    }
  }
}

export function describeDatingOp(s: GameState, o: DatingOp): string | undefined {
  if (o.op === 'meet') return 'An introduction (nothing promised)';
  const c = s.characters[o.id];
  const first = c?.firstName ?? 'her';
  switch (o.op) {
    case 'talk': return `${first}'s feelings +4`;
    case 'date': return `An evening with ${first}: her feelings up, one of your evenings`;
    case 'gift': return `${first}'s feelings up a little (never a guarantee)`;
    case 'steady': return `You and ${first} are seeing each other`;
    case 'commit': return `Exclusive with ${first}`;
    case 'reconcile': return `${first} comes home`;
    case 'paid': return 'One evening, agreed and paid. No feelings, no relationship, no standing arrangement';
    case 'askOut': return `A personal evening with ${first}: she may keep it professional`;
    case 'refused': return undefined;
  }
}

/* ------------------------------------------------------------------ */
/* The week and the month                                              */
/* ------------------------------------------------------------------ */

/** Weekly: providers, the boss's lover evenings, news she shares, neglect, the adults-only revalidation. */
export function datingWeek(ctx: Ctx): void {
  const s = ctx.s;
  if (s.gameOver) return;
  const D = ensureDating(s);
  ensureProviders(s, D);
  const boss = player(s);
  // An evening with his lover (Your rounds) is an evening together.
  const h = (s.rounds?.history ?? []).find((x) => x.week === s.week);
  for (const id of h?.ids ?? []) {
    if (!id.startsWith('fun:lover:')) continue;
    const c = s.characters[id.slice('fun:lover:'.length)];
    if (c?.alive && isAdult(s, c)) {
      const b = ensureBond(s, D, c.id, 'You are seeing each other');
      b.last = s.week;
      b.aff = clamp(b.aff + 3);
      maybeConceive(s, D, c, 'lover');
    }
  }
  // She knows first; she decides when to tell him.
  const live = new Set((s.romance?.pregnancies ?? []).map((p) => p.id));
  for (const k of D.preg) {
    if (!live.has(k.id)) continue;
    if (k.knownBy.includes(boss.id) || s.week < k.tellAt) continue;
    const m = s.characters[k.motherId];
    if (!m?.alive) continue;
    if (roll(`${s.seed}|tells|${k.id}`) < 0.85) {
      k.knownBy.push(boss.id);
      log(D, s, `${m.firstName} told you, quietly: she is expecting. Nobody else knows.`, 'family', m.id);
      ctx.log.push(`${m.firstName} told you she is expecting. Nobody else knows.`);
    } else k.tellAt = s.week + 9999;
  }
  D.preg = D.preg.filter((k) => live.has(k.id) || s.week - k.week < 60);
  // Revalidate: adults only, the living only, the boss's own bonds only.
  for (const [id, b] of Object.entries(D.bonds)) {
    const c = s.characters[id];
    if (!c || !isAdult(s, c) || kin(boss, c)) { delete D.bonds[id]; continue; }
    if (!c.alive && !b.ended) b.ended = { week: s.week, why: `${c.firstName} died` };
    // Neglect: feelings fade when he is never around; she may walk away.
    const r = romanceBetween(s, boss.id, id);
    if (r && b.last !== undefined && s.week - b.last > 6) {
      b.aff = clamp(b.aff - 1);
      if (b.aff < 10 && roll(`${s.seed}|${s.week}|walk|${id}`) < 0.25) {
        endRomance(s, r, `${c.firstName} stopped waiting`);
        b.committed = undefined;
        b.ended = { week: s.week, why: 'She stopped waiting for you' };
        log(D, s, `${c.firstName} stopped waiting for you. It is over.`, 'stage', id);
        ctx.log.push(`${c.firstName} stopped waiting for you.`);
      }
    }
    if (!r && b.committed) b.committed = undefined;
    if (b.ended && r) b.ended = undefined;
  }
  // Introduced townswomen live their own lives in the living district.
  const L = s.living;
  if (L) {
    for (const [tp, cid] of Object.entries(D.tp)) {
      const p = L.people[tp];
      const c = s.characters[cid];
      const b = D.bonds[cid];
      if (!p || !c) continue;
      if (boss.spouseId === cid) { if (p.left === undefined) p.left = s.week; continue; }
      const gone = p.dead ? `${p.f} died` : p.sp ? `${p.f} married someone else` : p.left !== undefined ? `${p.f} moved away` : undefined;
      if (gone && b && !b.ended) {
        const r = romanceBetween(s, boss.id, cid);
        if (r) endRomance(s, r, gone);
        b.ended = { week: s.week, why: gone };
        b.committed = undefined;
        log(D, s, `${gone}.`, 'life', cid);
      }
    }
  }
  if (s.week % 4 === 0) providersMonth(ctx, D);
}

/** Monthly: the working women's own lives (some leave the life, new ones arrive, prices drift). */
function providersMonth(ctx: Ctx, D: DatingState): void {
  const s = ctx.s;
  for (const p of Object.values(D.providers)) {
    // The Ears' women and the nightlife cast live their own lives elsewhere (ears.ts, nightlife.ts).
    if (p.ear || p.nl || p.status !== 'working') continue;
    const c = s.characters[p.id];
    if (!c?.alive) { p.status = 'left'; p.left = { week: s.week, why: 'died' }; continue; }
    if (roll(`${s.seed}|${s.week}|leave|${p.id}`) < 0.03) {
      p.status = 'left';
      const why = ['she went to nursing school in Philadelphia', 'she married a mechanic from Rio Grande', 'she moved to Miami', 'she opened a beauty parlor in Cape May'][hashSeed(`${s.seed}:why:${p.id}`) % 4];
      p.left = { week: s.week, why };
      D.stats.providersLeft++;
      log(D, s, `${c.firstName} ${c.lastName} left the life: ${why}.`, 'life', p.id);
    } else if (roll(`${s.seed}|${s.week}|price|${p.id}`) < 0.1) {
      p.price = p.kind === 'street' ? r10(p.price * 1.1) : r50(p.price * 1.08);
    }
  }
  const working = (k: ProviderKind) => Object.values(D.providers).filter((p) => p.kind === k && p.status === 'working').length;
  if (s.nightlife) return;
  if (working('street') < 2) newProvider(s, D, 'street');
  if (working('escort') < 1) newProvider(s, D, 'escort');
}

/* ------------------------------------------------------------------ */
/* What the sim's random player may try                                */
/* ------------------------------------------------------------------ */

export function datingActions(s: GameState): PlayerAction[] {
  const out: PlayerAction[] = [];
  const ppl = peopleYouKnow(s).slice(0, 3);
  for (const c of ppl) {
    out.push({ kind: 'dating', op: { op: 'talk', id: c.id } }, { kind: 'dating', op: { op: 'invite', id: c.id, date: 'dinner' } });
  }
  const pr = providerRows(s).filter((r) => !r.blocked)[0];
  if (pr) out.push({ kind: 'dating', op: { op: 'paid', id: pr.id } });
  return out;
}

/* ------------------------------------------------------------------ */
/* The screen's view                                                   */
/* ------------------------------------------------------------------ */

export interface PersonRow {
  id: string;
  name: string;
  age: number;
  stage: Stage;
  stageLabel: string;
  aff: number;
  feelings: string;
  via: string;
  /** Married, seeing someone, working nights: what to keep in mind. */
  notes: string[];
  /** The next sensible step first, then the rest. */
  actions: PlayerAction[];
}

function nextActions(s: GameState, c: Character, st: Stage): PlayerAction[] {
  const id = c.id;
  const D = s.dating;
  const b = D?.bonds[id];
  const d = (op: DatingAction): PlayerAction => ({ kind: 'dating', op });
  const i = (x: 'proposeMarriage' | 'endRomance' | 'separate'): PlayerAction => ({ kind: 'interact', id: x, target: id });
  const providerNoBond = !!D?.providers[id] && (!b || (b.pro ?? 0) > s.week);
  if (providerNoBond) return [d({ op: 'askOut', id })];
  switch (st) {
    case 'acquaintance': return [d({ op: 'talk', id }), d({ op: 'invite', id, date: 'coffee' }), d({ op: 'invite', id, date: 'dinner' }), d({ op: 'gift', id, tier: 'flowers' })];
    case 'friends': return [d({ op: 'invite', id, date: 'dinner' }), d({ op: 'talk', id }), d({ op: 'invite', id, date: 'coffee' }), d({ op: 'invite', id, date: 'night' }), d({ op: 'gift', id, tier: 'flowers' })];
    case 'attracted': return [d({ op: 'steady', id }), d({ op: 'invite', id, date: 'dinner' }), d({ op: 'invite', id, date: 'night' }), d({ op: 'gift', id, tier: 'flowers' }), d({ op: 'gift', id, tier: 'jewelry' })];
    case 'dating': return [d({ op: 'invite', id, date: 'night' }), d({ op: 'commit', id }), d({ op: 'invite', id, date: 'dinner' }), d({ op: 'gift', id, tier: 'jewelry' }), d({ op: 'gift', id, tier: 'flowers' }), i('proposeMarriage'), i('endRomance')];
    case 'committed': return [i('proposeMarriage'), d({ op: 'invite', id, date: 'night' }), d({ op: 'invite', id, date: 'dinner' }), d({ op: 'gift', id, tier: 'jewelry' }), i('endRomance')];
    case 'married': return [d({ op: 'gift', id, tier: 'flowers' }), d({ op: 'gift', id, tier: 'jewelry' }), i('separate')];
    case 'separated': return [d({ op: 'reconcile', id })];
    case 'ended': return [d({ op: 'talk', id }), d({ op: 'invite', id, date: 'coffee' })];
  }
}

export function personRow(s: GameState, c: Character): PersonRow {
  const st = stageOf(s, c.id);
  const b = bondOf(s, c.id);
  const aff = b?.aff ?? clamp(10 + Math.round(opinion(s, c.id, s.playerId) / 4), 0, 40);
  const notes: string[] = [];
  const sp = married(s, c);
  if (sp && sp.id !== s.playerId) notes.push(`Married to ${displayName(sp)}`);
  const other = seeingSomeoneElse(s, c);
  if (other) notes.push(`Seeing ${displayName(other)}`);
  const p = s.dating?.providers[c.id];
  if (p && adultOn(s)) notes.push(`${PROVIDER_LABEL[p.kind]} (${p.venue})`);
  if (b?.pro && b.pro > s.week) notes.push('Keeps it professional');
  if (b?.ended) notes.push(b.ended.why);
  if (!isFree(s, c)) notes.push('In jail');
  return {
    id: c.id, name: displayName(c), age: ageOfChar(s, c), stage: st, stageLabel: STAGE_LABEL[st], aff, feelings: affectionWord(aff),
    via: knownVia(s, c) ?? (st === 'married' || st === 'separated' ? 'Your wife' : 'You have met'), notes, actions: nextActions(s, c, st),
  };
}

export interface FamilyLine { text: string; label?: 'Rumor' | 'Private' | 'Known'; charId?: string }

export interface DatingView {
  settings: ReturnType<typeof datingSettings>;
  evenings: { slots: number; used: number };
  /** The relationships: wife, girlfriends, lovers (most serious first). */
  relationships: PersonRow[];
  /** Everyone else he knows who could be more. */
  people: PersonRow[];
  intros: ReturnType<typeof introductions>;
  /** Empty when mature content is Off. */
  adult: ProviderRow[];
  family: { pregnancies: FamilyLine[]; children: FamilyLine[]; rumors: FamilyLine[]; consequences: FamilyLine[] };
  /** The last things that happened (her answers, the evenings). */
  recent: { week: number; text: string }[];
}

const STAGE_ORDER: Stage[] = ['married', 'separated', 'committed', 'dating', 'attracted', 'friends', 'acquaintance', 'ended'];

/** Everything the Relationships & Dating screen shows (pure; adults only; adult services only when the setting allows). */
export function datingView(s: GameState, opts: { venue?: string } = {}): DatingView {
  const boss = player(s);
  const rows: PersonRow[] = peopleYouKnow(s).map((c) => personRow(s, c));
  const wife = boss.spouseId ? s.characters[boss.spouseId] : undefined;
  if (wife?.alive && isAdult(s, wife)) rows.push(personRow(s, wife));
  rows.sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage) || b.aff - a.aff);
  const together: Stage[] = ['married', 'separated', 'committed', 'dating'];
  const D = s.dating;
  const preg: FamilyLine[] = [];
  for (const k of D?.preg ?? []) {
    if (!k.knownBy.includes(boss.id)) continue;
    const p = s.romance?.pregnancies.find((x) => x.id === k.id);
    const m = s.characters[k.motherId];
    if (!p || !m) continue;
    preg.push({ text: `${displayName(m)} is expecting your child (due around week ${p.dueWeek}). Only the two of you know.`, label: 'Private', charId: m.id });
  }
  const kids = Object.values(s.characters).filter((k) => k.alive && (k.fatherId === boss.id || k.bioFatherId === boss.id || k.motherId === boss.id));
  const children: FamilyLine[] = kids.map((k) => {
    const a = ageOfChar(s, k);
    const mom = k.motherId ? s.characters[k.motherId] : undefined;
    const hidden = k.bioFatherId === boss.id && k.fatherId !== boss.id;
    return { text: `${displayName(k)}, ${a === 0 ? 'a baby' : `${a}`}${mom ? `, ${mom.firstName}'s` : ''}${hidden ? ' (yours by blood; not in your name)' : ''}`, label: hidden ? 'Private' as const : 'Known' as const, charId: k.id };
  });
  const rumors: FamilyLine[] = (D?.rumors ?? []).slice(-6).reverse().map((r) => ({ text: `${r.text} (heard ${s.week - r.week === 0 ? 'this week' : `${s.week - r.week} weeks ago`})`, label: 'Rumor' as const }));
  const consequences: FamilyLine[] = [];
  if (wife?.alive) consequences.push({ text: `${wife.firstName} thinks ${opinion(s, wife.id, boss.id)} of you.`, charId: wife.id });
  const sec = s.secrets.filter((x) => x.ownerId === boss.id && x.kind === 'affair');
  for (const x of sec) consequences.push({ text: `${x.text}. ${x.knownBy.length ? `Known to: ${x.knownBy.map((f) => s.rivals.find((r) => r.id === f)?.shortName ?? (f === 'player' ? 'your people' : f)).join(', ')}. A secret like that is leverage.` : 'Nobody has it yet.'}`, label: 'Known' });
  const disc = (s.romance?.rels ?? []).filter((r) => (r.a === boss.id || r.b === boss.id) && r.secret && r.ended === undefined);
  for (const r of disc) {
    const o = s.characters[r.a === boss.id ? r.b : r.a];
    if (o) consequences.push({ text: `Your affair with ${o.firstName}: ${r.discovered !== undefined ? 'it came out' : r.exposure >= 50 ? 'people are starting to talk' : 'still a secret'} (exposure ${r.exposure}).`, label: 'Private', charId: o.id });
  }
  return {
    settings: datingSettings(s),
    evenings: { slots: roundSlots(s).slots, used: datingEvenings(s) },
    relationships: rows.filter((r) => together.includes(r.stage)),
    people: rows.filter((r) => !together.includes(r.stage)),
    intros: introductions(s),
    adult: providerRows(s, opts.venue),
    family: { pregnancies: preg, children, rumors, consequences },
    recent: (D?.log ?? []).slice(-8).reverse().map((l) => ({ week: l.week, text: l.text })),
  };
}

/** The phone's dating lines: the women he is seeing, and (when allowed) a number for company. */
export function datingPhone(s: GameState): { key: string; name: string; charId?: string; role: string; blocked?: string; adult?: boolean }[] {
  const boss = player(s);
  const out: { key: string; name: string; charId?: string; role: string; blocked?: string; adult?: boolean }[] = [];
  for (const r of activeRomances(s, boss.id)) {
    const c = s.characters[r.a === boss.id ? r.b : r.a];
    if (!c?.alive || !isAdult(s, c)) continue;
    out.push({ key: `date:${c.id}`, name: displayName(c), charId: c.id, role: `${STAGE_LABEL[stageOf(s, c.id)]} · ask her out`, blocked: !isFree(s, c) ? 'In jail' : undefined });
  }
  if (adultOn(s)) {
    const m = madamOf(s);
    if (m?.alive) out.push({ key: 'company', name: `${m.firstName} (for company)`, charId: m.id, role: 'Adult services: who is working, her price, which account pays', adult: true, blocked: opinion(s, m.id, boss.id) < -10 ? `${m.firstName} is not taking your calls` : undefined });
  }
  return out;
}
