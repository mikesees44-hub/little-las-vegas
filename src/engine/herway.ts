import { ageOn } from './calendar';
import { capos, displayName, hasTrait, isFree, makeCharacter, player } from './characters';
import { holder } from './council';
import { adultOn } from './datingState';
import { applyEffects } from './effects';
import type { Ctx } from './ledger';
import { nightActionsFor } from './nightlife';
import { DEAL_LABEL } from './nightlifeState';
import { OFFICE_BY_ID } from './polData';
import { ctlOf, materializeOfficial } from './polGov';
import { fromCharacter } from './polPeople';
import { mIdx, mutP, parseSeat } from './polState';
import { addOpinion, opinion } from './relations';
import { hashSeed } from './rng';
import { CITY_RACES, HER_CAST, PATHS, PATH_ORDER, type HerPath } from './herwayData';
import type { ActionPreview } from './actions';
import type { Acceptance, Reason } from './interactions';
import type { Character, Effect, FactionId, GameState, PlayerAction, RivalId } from './types';

export { PATHS, PATH_ORDER, type HerPath } from './herwayData';

/**
 * HER WAY: women who find their own way into the deep world and into power,
 * and earn. Each one is a real character with a career path (the street to a
 * house of her own; the numbers; the books; fronts; politics; information),
 * a weekly income, a standing, heat, and whom she kicks up to (the boss, a
 * rival family, or nobody). She rises and falls every week on her own dice.
 *
 * Built on what exists: a madam is the existing nightlife madam (her house's
 * deal stays nightlife's); a councilwoman is an existing pol office held by a
 * woman (the election machinery seats her); a daughter who goes into
 * politics goes into the pol layer's own ladder.
 *
 * The boss deals with her, the odds on the card first, settled in the moment
 * (deeds/now.ts), landed in Your File: partner, protect for a cut, hire her
 * (a bookkeeper: safer books, but she knows), lend to her, back her run, use
 * her as ears, squeeze her (a cut now, an enemy for good), or leave her be.
 *
 * HARD RULES: adults only (18+ on the day); she always decides (every deal is
 * her yes or no); no coercion; nobody is traded; no debt is ever held over
 * anyone (a loan she can't pay is written off, and nobody is squeezed while
 * she owes); non-explicit; the street path is hidden with mature content Off.
 * Nobody here is real.
 *
 * Lives on `GameState.herway` (optional: a new game seeds it in newGame; an
 * older save gets it with its first week). Its own dice: a stream for the
 * cast, hashes of (seed, week, purpose, id) for the weeks.
 */

export type HerDeal = 'none' | 'partner' | 'protect' | 'hired' | 'ears';
export const HER_DEAL_LABEL: Record<HerDeal, string> = {
  none: 'On her own', partner: 'Partners with the Family', protect: 'Pays for your protection', hired: 'Keeps the Family\'s books', ears: 'Your ears',
};
/** The Family's cut of her week, by deal. */
export const HER_CUT: Record<HerDeal, number> = { none: 0, partner: 0.4, protect: 0.2, hired: 0, ears: 0 };
/** What the Family pays her a week for the work (hired: the books; ears: what she hears). */
export const HER_FEE: Record<HerDeal, number> = { none: 0, partner: 0, protect: 0, hired: 75, ears: 40 };
export const BACK_COST = 2500;

export type OwnKind = 'goomar' | 'widow' | 'daughter';

export interface Earner {
  id: string;
  path: HerPath;
  rung: number;
  venue: string;
  /** Her gross last week. */
  income: number;
  standing: number;
  heat: number;
  side: FactionId;
  deal: HerDeal;
  savings: number;
  since: number;
  status: 'active' | 'out';
  /** Money the boss lent her: what is left and the weekly payment. Never held over her. */
  loan?: { left: number; weekly: number; missed: number };
  /** A hired bookkeeper: how much she knows about the Family's money, 0-100. */
  knows?: number;
  /** Pinched: out of business until this week. */
  pinched?: number;
  /** The boss squeezed her (week): she does not forget. */
  enemy?: number;
  /** She already got back at him for it. */
  paidBack?: boolean;
  /** She rose to rival the boss (week). */
  rival?: number;
  /** Politics: her pol person, her race, her campaign money from the boss. */
  polId?: string;
  race?: string;
  fund?: number;
  /** The terms she agreed to (her cut to the Family, the Family's weekly fee to her), when not the standard ones. */
  terms?: { cut?: number; fee?: number };
  /** One of the boss's own women who chose this path. */
  own?: OwnKind;
  hist: [number, string][];
}

export interface HerWayState {
  v: 1;
  rng: number;
  e: Record<string, Earner>;
  log: [number, string][];
  /** His own women who already chose a path (id -> week). */
  beats: Record<string, number>;
  stats: { rose: number; fell: number; pinched: number; squeezed: number; rivals: number; won: number };
}

/** Who carries the offer: the boss in person (his hours), his underboss or consigliere, a capo, a soldier. */
export type HerVia = 'boss' | 'top' | 'capo' | 'soldier';
export const VIA_LABEL: Record<HerVia, string> = { boss: 'You, in person', top: 'Your underboss or consigliere', capo: 'One of your capos', soldier: 'A soldier' };
/** What the boss offers: measured against what she needs and expects. */
export type HerOffer = 'low' | 'fair' | 'generous' | 'name';
export const OFFER_LABEL: Record<HerOffer, string> = { low: 'Low', fair: 'Fair', generous: 'Generous', name: 'Name your price' };
export const OFFERS: HerOffer[] = ['low', 'fair', 'generous', 'name'];
export const VIAS: HerVia[] = ['boss', 'top', 'capo', 'soldier'];
/** The orders that are an offer (who asks and how much matter); a squeeze and leaving her be are not. */
export const OFFER_OPS = ['partner', 'protect', 'hire', 'lend', 'back', 'ears'] as const;

export type HerAction =
  | { op: 'partner'; id: string; via?: HerVia; offer?: HerOffer }
  | { op: 'protect'; id: string; via?: HerVia; offer?: HerOffer }
  | { op: 'hire'; id: string; via?: HerVia; offer?: HerOffer }
  | { op: 'lend'; id: string; via?: HerVia; offer?: HerOffer }
  | { op: 'back'; id: string; via?: HerVia; offer?: HerOffer }
  | { op: 'ears'; id: string; via?: HerVia; offer?: HerOffer }
  | { op: 'squeeze'; id: string; via?: HerVia; offer?: HerOffer }
  | { op: 'leave'; id: string; via?: HerVia; offer?: HerOffer };

export type HerOp =
  | { op: 'deal'; id: string; deal: HerDeal; stake?: number; cut?: number; fee?: number }
  | { op: 'lend'; id: string; amount: number; rate?: number }
  | { op: 'back'; id: string; fund: number }
  | { op: 'squeeze'; id: string; ok: boolean; take: number }
  | { op: 'leave'; id: string }
  | { op: 'refused'; id: string; what: string }
  | { op: 'beat'; id: string; kind: 'club' | 'book' | 'politics'; how: 'back' | 'bless' | 'doubt' };

const HX = (op: HerOp, label: string): Effect => ({ type: 'herway', op, label }) as Effect;
const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const $ = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const low = (x: string) => x.charAt(0).toLowerCase() + x.slice(1);
const roll = (k: string) => (hashSeed(k) % 100003) / 100003;
const RIVALS: RivalId[] = ['manno', 'feldstein', 'kessler'];

/* ------------------------------------------------------------------ */
/* State and the cast                                                  */
/* ------------------------------------------------------------------ */

function blank(s: GameState): HerWayState {
  return { v: 1, rng: hashSeed(`${s.seed}:herway`), e: {}, log: [], beats: {}, stats: { rose: 0, fell: 0, pinched: 0, squeezed: 0, rivals: 0, won: 0 } };
}

function withRng<T>(s: GameState, H: HerWayState, fn: () => T): T {
  const main = s.rng;
  s.rng = H.rng;
  try { return fn(); } finally { H.rng = s.rng; s.rng = main; }
}

function newEarner(s: GameState, id: string, path: HerPath, rung: number, venue: string, o: Partial<Earner> = {}): Earner {
  return { id, path, rung, venue, income: 0, standing: 50, heat: 0, side: 'none', deal: 'none', savings: 0, since: s.week, status: 'active', hist: [], ...o };
}

/** Seeds the town's women earners (the cast, and the women already in office). Its own dice. */
function seed(s: GameState, H: HerWayState): void {
  for (const x of HER_CAST) {
    const c = withRng(s, H, () => makeCharacter(s, { gender: 'F', age: x.age, firstName: x.f, lastName: x.l, ethnicity: x.eth, rank: 'civilian', faction: 'none', nickname: false, traits: x.traits.slice(), wealth: 500 + x.rung * 3000 }));
    while (ageOn(c.birth, s.date) < 18) c.birth = { ...c.birth, y: c.birth.y - 1 };
    if (x.nick) c.nickname = x.nick;
    c.ambition = x.wants;
    const e = newEarner(s, c.id, x.path, x.rung, x.venue, { standing: x.standing, side: x.side, heat: x.rung * 8, savings: 400 + x.rung * 2500 });
    e.income = incomeOf(e);
    e.hist.push([s.week, `${PATHS[x.path].rungs[x.rung]}: ${x.venue}.`]);
    H.e[c.id] = e;
  }
  // The women who already hold a seat (the pol layer's own people) are given a body and a card.
  const pol = s.pol;
  if (pol) {
    for (const p of Object.values(pol.people).sort((a, b) => (a.id < b.id ? -1 : 1))) {
      if (p.sex !== 'F' || !p.alive || !p.seat) continue;
      const k = parseSeat(p.seat);
      const def = k ? OFFICE_BY_ID[k.office] : undefined;
      if (!def || !def.reach || (def.level !== 'city' && def.level !== 'county' && def.level !== 'state')) continue;
      const c = p.charId ? s.characters[p.charId] : materializeOfficial(s, p, def.short);
      if (!c?.alive || H.e[c.id]) continue;
      const e = newEarner(s, c.id, 'politics', 3, def.title, { standing: 60, polId: p.id, heat: 0 });
      e.income = incomeOf(e);
      e.hist.push([s.week, `${def.title}.`]);
      H.e[c.id] = e;
    }
  }
}

/** The state (seeded the first time: newGame does it, an older save gets it with its first week). */
export function ensureHerWay(s: GameState): HerWayState {
  if (!s.herway) {
    s.herway = blank(s);
    seed(s, s.herway);
  }
  const H = s.herway;
  H.beats ??= {};
  H.log ??= [];
  return H;
}

function hlog(s: GameState, H: HerWayState, e: Earner | undefined, text: string): void {
  H.log.push([s.week, text]);
  if (H.log.length > 60) H.log.splice(0, H.log.length - 60);
  if (e) {
    e.hist.push([s.week, text]);
    if (e.hist.length > 12) e.hist.splice(0, e.hist.length - 12);
  }
}

/* ------------------------------------------------------------------ */
/* Reading her                                                         */
/* ------------------------------------------------------------------ */

export function earnerOf(s: GameState, id: string): Earner | undefined {
  return s.herway?.e[id];
}

export function titleOf(e: Earner): string {
  const P = PATHS[e.path];
  return P.rungs[Math.min(e.rung, P.rungs.length - 1)];
}

/** Her gross for a week (0 while she is pinched). */
export function incomeOf(e: Earner, week?: number): number {
  if (e.pinched !== undefined && week !== undefined && week < e.pinched) return 0;
  const P = PATHS[e.path];
  return Math.round(P.base[Math.min(e.rung, P.base.length - 1)] * (0.6 + (e.standing / 100) * 0.8));
}

function sideName(s: GameState, f: FactionId): string {
  if (f === 'player') return 'you';
  if (f === 'none') return 'nobody';
  return `the ${s.rivals.find((r) => r.id === f)?.shortName ?? f} family`;
}

function bossBlock(s: GameState): string | undefined {
  const b = player(s);
  if (!b?.alive) return 'You are not here';
  if (!isFree(s, b)) return 'You are inside';
  return undefined;
}

/** Why the boss can't deal with her at all (undefined: he can). Adults only; the street only with mature content on. */
export function herBlock(s: GameState, id: string): string | undefined {
  const e = earnerOf(s, id);
  const c = s.characters[id];
  if (!e || !c) return 'Nobody';
  if (!c.alive || e.status !== 'active') return 'She is out of it';
  if (ageOn(c.birth, s.date) < 18) return 'Adults only';
  if (e.path === 'street' && !adultOn(s)) return 'Mature content is Off in Settings';
  if (!isFree(s, c)) return 'She is inside';
  return bossBlock(s);
}

/** The risks she runs, in words. */
export function risksOf(s: GameState, e: Earner): string[] {
  const out: string[] = [];
  if (e.pinched !== undefined && s.week < e.pinched) out.push(`Pinched: out of business until week ${e.pinched}`);
  else if (e.heat >= 50) out.push(`The law is looking hard (heat ${Math.round(e.heat)})`);
  else if (e.heat >= 25) out.push(`Some heat (${Math.round(e.heat)})`);
  if (e.side !== 'player' && e.side !== 'none' && e.path !== 'politics') out.push(`Kicks up to ${sideName(s, e.side)}`);
  else if (e.side === 'none' && e.rung >= 1 && ['numbers', 'books', 'fronts'].includes(e.path)) out.push('Unprotected: a rival family could lean on her');
  if (e.deal === 'hired' && (e.knows ?? 0) >= 40) out.push(`Knows where your money goes (${Math.round(e.knows ?? 0)})`);
  if (e.enemy !== undefined) out.push('You squeezed her: she has not forgotten');
  if (e.rival !== undefined) out.push('A rival to you now: she takes action off your corners');
  if (e.loan) out.push(`Owes you ${$(e.loan.left)} (no strings: written off if she can't pay)`);
  return out;
}

/* ------------------------------------------------------------------ */
/* The boss's orders                                                   */
/* ------------------------------------------------------------------ */

/** The Family's cut of her week and its weekly fee to her, under the terms she took. */
export function cutOf(e: Earner): number {
  return e.deal === 'none' ? 0 : e.terms?.cut ?? HER_CUT[e.deal];
}
export function feeOf(e: Earner): number {
  return e.deal === 'none' ? 0 : e.terms?.fee ?? HER_FEE[e.deal];
}

/** The man who would carry the offer (undefined: there is nobody of that rank to send). */
export function askerOf(s: GameState, via: HerVia): Character | undefined {
  const free = (c: Character | undefined) => !!c && c.alive && isFree(s, c);
  if (via === 'boss') { const b = player(s); return free(b) ? b : undefined; }
  const crew = Object.values(s.characters).filter((c) => c.faction === 'player' && c.id !== s.playerId && free(c)).sort((a, b) => (a.id < b.id ? -1 : 1));
  if (via === 'top') return [holder(s, 'underboss'), holder(s, 'consigliere')].find(free) ?? crew.find((c) => c.rank === 'underboss');
  if (via === 'capo') return capos(s).filter(free).sort((a, b) => (a.id < b.id ? -1 : 1))[0];
  return crew.find((c) => c.rank === 'soldier');
}
const VIA_BONUS: Record<HerVia, number> = { boss: 15, top: 8, capo: 4, soldier: 0 };
const VIA_WORDS: Record<HerVia, string> = { boss: 'The boss himself', top: 'Your underboss or consigliere', capo: 'A capo of yours', soldier: 'A soldier of yours' };

/** The terms of an offer at each level: money up front, her cut, the fee, the loan's rate, and how it compares with what she expects (1 = fair). */
export function termsOf(e: Earner, op: HerAction['op'], offer: HerOffer = 'fair'): { cost: number; cut?: number; fee?: number; rate?: number; fund?: number; ratio: number; text: string } {
  const i = OFFERS.indexOf(offer);
  // How the offer compares with what she expects, the same scale for every kind of deal (1 = fair).
  const ratio = [0.65, 1, 1.5, 2.2][i];
  switch (op) {
    case 'partner': {
      const m = [0.6, 1, 1.5, 2.2][i];
      const stake = Math.max(300, Math.round((stakeOf(e) * m) / 100) * 100);
      return { cost: stake, ratio, text: `${$(stake)} into her business` };
    }
    case 'protect': {
      const cut = [0.25, 0.2, 0.15, 0.1][i];
      return { cost: 0, cut, ratio, text: `${Math.round(cut * 100)}% of her week` };
    }
    case 'hire': {
      const fee = [50, 75, 110, 160][i];
      return { cost: 0, fee, ratio, text: `${$(fee)} a week` };
    }
    case 'ears': {
      const fee = [25, 40, 60, 90][i];
      return { cost: 0, fee, ratio, text: `${$(fee)} a week` };
    }
    case 'lend': {
      const rate = [0.2, 0.1, 0.05, 0][i];
      const amt = lendOf(e);
      return { cost: amt, rate, ratio, text: rate ? `${$(amt)} at ${Math.round(rate * 100)}% on top` : `${$(amt)}, nothing on top` };
    }
    case 'back': {
      const fund = [1500, 2500, 4000, 6000][i];
      return { cost: fund, fund, ratio, text: `${$(fund)} for her campaign` };
    }
    default:
      return { cost: 0, ratio: 1, text: '' };
  }
}

function capAcc(baseV: number, reasons: Reason[], cap = 0.9): Acceptance {
  const sum = reasons.reduce((a, r) => a + r.value, baseV);
  return { chance: Math.max(0.05, Math.min(cap, sum / 100)), reasons: [{ label: 'Base', value: baseV }, ...reasons.filter((r) => r.value !== 0)] };
}

function common(s: GameState, e: Earner, c: Character, reasons: Reason[]): void {
  const op = opinion(s, c.id, s.playerId);
  reasons.push({ label: op >= 0 ? 'Thinks well of you' : 'Thinks little of you', value: Math.round(op * 0.4) });
  if (e.enemy !== undefined) reasons.push({ label: 'You squeezed her', value: -40 });
  if (e.side !== 'player' && e.side !== 'none') reasons.push({ label: `Works for ${sideName(s, e.side).replace(/^the /, '').replace(/ family$/, '')}`, value: -20 });
  if (e.own) reasons.push({ label: 'One of your own', value: 15 });
}

/** The odds she says yes, with every reason. */
export function herAcceptance(s: GameState, id: string, what: HerAction['op'], via: HerVia = 'boss', offer: HerOffer = 'fair'): Acceptance {
  const a0 = herAcceptanceBase(s, id, what, via, offer);
  const e = earnerOf(s, id);
  if (!e || !(OFFER_OPS as readonly string[]).includes(what)) return a0;
  // Her loyalty to a rival or her own independence caps what any offer can do. Her choice either way.
  const cap = e.enemy !== undefined ? 0.35 : e.rival !== undefined ? 0.5 : e.side !== 'player' && e.side !== 'none' ? 0.6 : 0.9;
  if (a0.chance <= cap) return a0;
  const why = e.enemy !== undefined ? 'You squeezed her: no offer buys that back' : e.rival !== undefined ? 'Her own boss now: no offer buys her' : `Loyal to ${sideName(s, e.side)}: no offer buys more`;
  return { chance: cap, reasons: [...a0.reasons, { label: `${why} (at most ${Math.round(cap * 100)}%)`, value: Math.round(cap * 100 - a0.chance * 100) }] };
}

function herAcceptanceBase(s: GameState, id: string, what: HerAction['op'], via: HerVia, offer: HerOffer): Acceptance {
  const e = earnerOf(s, id);
  const c = s.characters[id];
  if (!e || !c) return { chance: 0, reasons: [] };
  const r: Reason[] = [];
  common(s, e, c, r);
  if ((OFFER_OPS as readonly string[]).includes(what)) {
    // Who asks: the boss in person counts most.
    r.push({ label: VIA_WORDS[via], value: VIA_BONUS[via] });
    // What he offers, against what she needs and expects (diminishing returns).
    const tm = termsOf(e, what, offer);
    const needs = e.savings < 1500;
    let v = Math.round(28 * Math.log2(tm.ratio) * (needs && tm.ratio > 1 ? 1.25 : 1));
    v = Math.max(-20, Math.min(25, v));
    r.push({ label: `${OFFER_LABEL[offer]}: ${tm.text}${needs && tm.ratio > 1 ? ' (she needs it)' : ''}`, value: v });
  }
  switch (what) {
    case 'partner':
      if (e.standing >= 65) r.push({ label: 'Doing fine on her own', value: -10 });
      if (e.heat >= 40) r.push({ label: 'The heat is on her', value: 15 });
      if (e.rival !== undefined) r.push({ label: 'She means to be her own boss', value: -15 });
      if (hasTrait(c, 'Greedy')) r.push({ label: 'Greedy: a partner takes a piece', value: -10 });
      if (hasTrait(c, 'Ambitious')) r.push({ label: 'Ambitious: your money takes her higher', value: 10 });
      return capAcc(35, r);
    case 'protect':
      if (e.heat >= 40) r.push({ label: 'The heat is on her', value: 20 });
      if (e.side === 'none' && e.rung >= 1) r.push({ label: 'Nobody stands behind her', value: 10 });
      r.push(incomeOf(e) >= 200 ? { label: 'Her week is real money to share', value: -5 } : { label: 'A small week: cheap peace of mind', value: 5 });
      if (e.rival !== undefined) r.push({ label: 'She means to be her own boss', value: -15 });
      if (hasTrait(c, 'Greedy')) r.push({ label: 'Greedy', value: -5 });
      return capAcc(45, r);
    case 'hire':
      if (e.rung >= 1) r.push({ label: 'Has a book of her own to keep', value: -10 * e.rung });
      if (hasTrait(c, 'Honest')) r.push({ label: 'Honest: she would not like what she sees', value: -15 });
      if (e.savings < 1000) r.push({ label: 'Needs steady work', value: 15 });
      return capAcc(40, r);
    case 'lend':
      if (e.savings < 1500) r.push({ label: 'She could use it', value: 15 });
      if (hasTrait(c, 'Paranoid')) r.push({ label: 'Paranoid about owing anybody', value: -15 });
      return capAcc(60, r);
    case 'back':
      if (hasTrait(c, 'Ambitious')) r.push({ label: 'Ambitious', value: 25 });
      r.push({ label: `Her standing in the ward (${Math.round(e.standing)})`, value: Math.round((e.standing - 50) / 3) });
      return capAcc(45, r);
    case 'ears':
      if (e.path === 'info') r.push({ label: 'She hears things for a living', value: 25 });
      if (hasTrait(c, 'Honest')) r.push({ label: 'Honest', value: -15 });
      if (hasTrait(c, 'Loyal-to-a-fault')) r.push({ label: 'Loyal', value: 10 });
      return capAcc(35, r);
    case 'squeeze': {
      // The odds that she pays (not her consent: a shakedown).
      const q: Reason[] = [{ label: `Her standing (${Math.round(e.standing)})`, value: -Math.round(e.standing / 4) }];
      q.push({ label: `Your respect (${Math.round(s.respect)})`, value: Math.round((s.respect - 50) / 3) });
      if (e.side !== 'player' && e.side !== 'none') q.push({ label: `${sideName(s, e.side)} stands behind her`, value: -20 });
      if (e.rival !== undefined) q.push({ label: 'She has her own people now', value: -20 });
      if (e.deal === 'protect' || e.deal === 'partner') q.push({ label: 'She already pays you: she has nowhere to run', value: 15 });
      return capAcc(70, q, 0.95);
    }
    default:
      return { chance: 1, reasons: [] };
  }
}

function stakeOf(e: Earner): number {
  return Math.max(500, Math.round((incomeOf(e) * 6) / 100) * 100);
}

function lendOf(e: Earner): number {
  return e.rung >= 2 ? 2500 : 1000;
}

function squeezeTake(e: Earner): number {
  return Math.max(300, Math.round((incomeOf(e) * 4) / 50) * 50);
}

/** An open city race she could go on the ballot for (the earliest). */
function openRace(s: GameState): string | undefined {
  const pol = s.pol;
  if (!pol) return undefined;
  const now = mIdx(s.date.y, s.date.m);
  return pol.elections.filter((x) => CITY_RACES.includes(x.office) && x.when >= now).sort((a, b) => a.when - b.when || (a.id < b.id ? -1 : 1))[0]?.id;
}

function base(title: string, because: string): ActionPreview {
  return { title, effects: [], cost: 0, because, category: 'event' };
}

export function previewHer(s: GameState, a: HerAction): ActionPreview {
  const e = earnerOf(s, a.id);
  const c = s.characters[a.id];
  if (!e || !c) return { ...base('Nobody', 'did nothing'), disabledReason: 'Nobody' };
  const nm = c.firstName;
  const block = herBlock(s, a.id);
  const inc = incomeOf(e);
  const biz = ['numbers', 'books', 'fronts'].includes(e.path);
  const street = e.path === 'street';
  const via: HerVia = a.via ?? 'boss';
  const offer: HerOffer = a.offer ?? 'fair';
  const asker = askerOf(s, via);
  const by = via === 'boss' ? '' : asker ? ` (${asker.firstName} ${asker.lastName} asks for you)` : '';
  const viaBlock = via !== 'boss' && !asker ? `You have no ${via === 'top' ? 'underboss or consigliere' : via} free to send` : undefined;
  const tm = termsOf(e, a.op, offer);
  const ofr = offer === 'fair' ? '' : ` (${OFFER_LABEL[offer].toLowerCase()})`;
  const acc = (op: HerAction['op']) => herAcceptance(s, a.id, op, via, offer);
  const refused = (what: string): Effect[] => [HX({ op: 'refused', id: c.id, what }, `${nm} said no`)];
  switch (a.op) {
    case 'partner': {
      const stake = tm.cost;
      return {
        ...base(`Offer ${nm} a partnership${ofr}`, `went into partnership with ${nm}`), cost: stake,
        detail: `${$(stake)} of Family money into her ${PATHS[e.path].label.toLowerCase()} (${titleOf(e)})${by}. The Family takes 40% of her week (about ${$(Math.round(inc * 0.4))} now) and your name keeps the law and the other families gentler with her. Her pinch is your heat. A bigger stake makes a yes likelier, never certain: she decides.`,
        effects: [{ type: 'money', amount: -stake, label: `Partnership with ${nm}` }, HX({ op: 'deal', id: c.id, deal: 'partner', stake }, `${nm}: partners with the Family`)],
        acceptance: acc('partner'), refuseEffects: refused('a partnership'),
        disabledReason: block ?? viaBlock ?? (street ? 'Her house\'s deal is made in Nightlife' : !biz ? 'Not a business: back her run or use her ears' : e.deal === 'partner' ? 'Partners already' : s.money < stake ? `Needs ${$(stake)}` : undefined),
      };
    }
    case 'protect':
      return {
        ...base(`Offer ${nm} protection${ofr}`, `offered ${nm} protection`),
        detail: `She pays the Family ${Math.round(tm.cut! * 100)}% of her week (about ${$(Math.round(inc * tm.cut!))} now)${by}. Your people keep the other crews off her and the heat on her cools faster. Better terms make a yes likelier, never certain: she decides.`,
        effects: [HX({ op: 'deal', id: c.id, deal: 'protect', cut: tm.cut }, `${nm}: under your protection`)],
        acceptance: acc('protect'), refuseEffects: refused('protection'),
        disabledReason: block ?? viaBlock ?? (street ? 'Her house\'s deal is made in Nightlife' : !biz ? 'Not a business: nothing to protect' : e.deal === 'protect' ? 'Under your protection already' : e.deal === 'partner' ? 'Partners already (protection is part of it)' : undefined),
      };
    case 'hire':
      return {
        ...base(`Hire ${nm} to keep the Family's books${ofr}`, `hired ${nm} to keep the books`),
        detail: `${$(tm.fee!)} a week from the Family${by}. Clean books: the evidence against you thins a little every month. But she learns where the money goes, and if she is ever pinched and does not think well of you, she can talk.`,
        effects: [HX({ op: 'deal', id: c.id, deal: 'hired', fee: tm.fee }, `${nm}: keeps the Family's books`)],
        acceptance: acc('hire'), refuseEffects: refused('the job'),
        warning: 'She will know where the money goes.',
        disabledReason: block ?? viaBlock ?? (e.path !== 'books' ? 'Only a woman who keeps books' : e.deal === 'hired' ? 'She keeps your books already' : undefined),
      };
    case 'lend': {
      const amt = tm.cost;
      return {
        ...base(`Lend ${nm} ${$(amt)}${ofr}`, `lent ${nm} ${$(amt)}`), cost: amt,
        detail: `${$(amt)} from the Family to grow her business${by}, paid back ${tm.rate ? `with ${Math.round(tm.rate * 100)}% on top` : 'with nothing on top'} over twelve weeks. No strings: if she can't pay, it is written off. Nobody holds a debt over her.`,
        effects: [{ type: 'money', amount: -amt, label: `A loan to ${nm}` }, HX({ op: 'lend', id: c.id, amount: amt, rate: tm.rate }, `${nm}: a loan`)],
        acceptance: acc('lend'), refuseEffects: refused('the loan'),
        disabledReason: block ?? viaBlock ?? (street ? 'Her house\'s money is Nightlife\'s' : e.loan ? 'She is still paying off the last one' : s.money < amt ? `Needs ${$(amt)}` : undefined),
      };
    }
    case 'back': {
      const running = e.rung >= 2;
      const race = e.race ?? openRace(s);
      const def = race ? OFFICE_BY_ID[s.pol?.elections.find((x) => x.id === race)?.office ?? ''] : undefined;
      const fund = tm.fund!;
      return {
        ...base(running ? `Put ${$(fund)} behind ${nm}'s campaign` : `Back ${nm}'s run for office${ofr}`, `backed ${nm}'s run for office`), cost: fund,
        detail: `${$(fund)} of Family money for her campaign${def ? ` (${def.title})` : ''}${by}: posters, the ward captains, the Communion breakfasts. ${race ? 'The race is open: she goes on the ballot now.' : 'No race is open yet: she goes on the ballot when one opens.'} Win or lose, she will remember who stood behind her: a friend in City Hall.`,
        effects: [{ type: 'money', amount: -fund, label: `${nm}'s campaign` }, HX({ op: 'back', id: c.id, fund }, `${nm}: your money behind her`)],
        acceptance: running ? undefined : acc('back'), refuseEffects: running ? undefined : refused('your money for a campaign'),
        disabledReason: block ?? viaBlock ?? (e.path !== 'politics' ? 'Not in politics' : !s.pol ? 'No politics here' : e.rung === 3 && !race ? 'Her seat is not up yet' : s.money < fund ? `Needs ${$(fund)}` : undefined),
      };
    }
    case 'ears':
      return {
        ...base(`Ask ${nm} to be your ears${ofr}`, `asked ${nm} to pass on what she hears`),
        detail: `${$(tm.fee!)} a week from the Family for what she hears at ${e.venue}${by}: a raid coming, a rival's move, who is talking. ${e.path === 'info' ? 'She hears more than most.' : ''} She decides what she passes on.`,
        effects: [HX({ op: 'deal', id: c.id, deal: 'ears', fee: tm.fee }, `${nm}: your ears`)],
        acceptance: acc('ears'), refuseEffects: refused('passing on what she hears'),
        disabledReason: block ?? viaBlock ?? (street ? 'The Madam\'s ears are The Night & the Ears' : e.deal === 'ears' ? 'Your ears already' : e.deal === 'partner' || e.deal === 'hired' ? 'She works with you already: she tells you what she hears' : undefined),
      };
    case 'squeeze': {
      const take = squeezeTake(e);
      const odds = herAcceptance(s, a.id, 'squeeze');
      const rv = e.side !== 'player' && e.side !== 'none' ? e.side : RIVALS[hashSeed(`${s.seed}:sq:${c.id}`) % RIVALS.length];
      return {
        ...base(`Squeeze ${nm} for ${$(take)}`, `squeezed ${nm}`),
        detail: `Two of your men at ${e.venue} with a number: about four weeks of her take, now. Money for the Family today; an enemy for good. She stops paying anything else, and one day she may go to the cops or to ${sideName(s, rv)}.`,
        effects: [HX({ op: 'squeeze', id: c.id, ok: true, take }, `${nm} paid`), { type: 'money', amount: take, category: 'event', label: `Squeezed ${nm}` },
          { type: 'opinion', from: c.id, to: s.playerId, amount: -35, reason: 'He squeezed me', decay: 0 }],
        odds, oddsLabel: 'She pays',
        refuseEffects: [HX({ op: 'squeeze', id: c.id, ok: false, take: 0 }, `${nm} would not pay`), { type: 'heat', bar: 'local', amount: 2, label: 'A scene at her place' }, { type: 'respect', amount: -2, label: `${nm} stood up to you` },
          { type: 'opinion', from: c.id, to: s.playerId, amount: -30, reason: 'He tried to squeeze me', decay: 0 }],
        warning: 'A short-term cut, a long-term enemy.',
        disabledReason: block ?? (street ? 'Her house is Nightlife\'s' : e.loan ? 'She owes you money: no squeezing a woman in your debt' : e.enemy !== undefined && s.week - e.enemy < 26 ? 'You squeezed her not long ago' : inc <= 0 ? 'She has nothing coming in' : undefined),
      };
    }
    case 'leave':
      return {
        ...base(`Leave ${nm} alone`, `left ${nm} alone`),
        detail: e.deal !== 'none' ? `Whatever is between you ends: ${HER_DEAL_LABEL[e.deal].toLowerCase()} no more. No hard feelings; she owes you nothing.` : 'You let her go her own way. She notices.',
        effects: [HX({ op: 'leave', id: c.id }, `${nm}: her own way`)],
        disabledReason: block ?? (street ? 'Her house\'s deal is made in Nightlife' : e.deal === 'none' && e.side !== 'player' && e.enemy === undefined && s.herway?.e[c.id]?.hist.some(([w, t]) => w === s.week && t.startsWith('You left')) ? 'Already' : undefined),
      };
  }
}

/** Every order the boss can give about her (never removed: a reason when not now). The street: her house's own deals. */
export function herActionsFor(s: GameState, id: string): PlayerAction[] {
  const e = earnerOf(s, id);
  if (!e || e.status !== 'active') return [];
  if (e.path === 'street') return adultOn(s) ? nightActionsFor(s, id).filter((a) => a.kind === 'nightlife' && (a.op.op === 'deal' || a.op.op === 'back')) : [];
  const ops: HerAction['op'][] = ['partner', 'protect', 'hire', 'lend', 'back', 'ears', 'squeeze', 'leave'];
  return ops.map((op) => ({ kind: 'herway', op: { op, id } }) as PlayerAction);
}

/** The ones that make sense for her path first (the card shows these; the rest fold under More). */
export function herBestFirst(s: GameState, id: string): PlayerAction[] {
  const e = earnerOf(s, id);
  const all = herActionsFor(s, id);
  if (!e || e.path === 'street') return all;
  const order: Record<Exclude<HerPath, 'street'>, HerAction['op'][]> = {
    numbers: ['protect', 'partner', 'lend', 'squeeze', 'ears', 'leave', 'hire', 'back'],
    books: ['hire', 'protect', 'partner', 'lend', 'ears', 'squeeze', 'leave', 'back'],
    fronts: ['partner', 'protect', 'lend', 'ears', 'squeeze', 'leave', 'hire', 'back'],
    politics: ['back', 'ears', 'lend', 'leave', 'squeeze', 'partner', 'protect', 'hire'],
    info: ['ears', 'lend', 'leave', 'squeeze', 'partner', 'protect', 'hire', 'back'],
  };
  const o = order[e.path];
  return all.slice().sort((a, b) => o.indexOf((a as { op: HerAction }).op.op) - o.indexOf((b as { op: HerAction }).op.op));
}

/* ------------------------------------------------------------------ */
/* Applying                                                            */
/* ------------------------------------------------------------------ */

/**
 * She joins the Family's side on a deal (partner, protection, the books, her ears).
 * The one seam for a general civilian payroll: point `hired`/`partner` here at it.
 * Her money reaches the Family only as a weekly kick-up through the ordinary money effects.
 */
export function joinFamily(_s: GameState, e: Earner, deal: HerDeal): void {
  e.deal = deal;
  e.terms = undefined;
  if (deal === 'partner' || deal === 'protect' || deal === 'hired') { e.side = 'player'; e.rival = undefined; }
  if (deal === 'hired') e.knows = e.knows ?? 10;
  e.enemy = undefined;
}

function ensurePolPerson(s: GameState, e: Earner, c: Character): string | undefined {
  const pol = s.pol;
  if (!pol) return undefined;
  if (e.polId && pol.people[e.polId]) return e.polId;
  const found = Object.values(pol.people).find((p) => p.charId === c.id && p.alive);
  if (found) { e.polId = found.id; return found.id; }
  const p = fromCharacter(c, 'wildwood_city', 'local_politics', e.rung >= 1 ? 1 : 0, e.rung >= 1 ? 'Ward leader, Wildwood Democrats' : 'Committeewoman, Wildwood Democrats', s.date.y);
  p.party = 'D';
  p.since = s.date.y;
  p.strength = Math.max(p.strength, 30 + Math.round(e.standing / 3));
  pol.people[p.id] = p;
  e.polId = p.id;
  return p.id;
}

/** Puts her on the ballot of an open city race (with the boss's money, if any). */
function joinRace(s: GameState, H: HerWayState, e: Earner, c: Character): boolean {
  const pol = s.pol;
  const pid = ensurePolPerson(s, e, c);
  const rid = openRace(s);
  if (!pol || !pid || !rid) return false;
  const el = pol.elections.find((x) => x.id === rid)!;
  const def = OFFICE_BY_ID[el.office];
  let cand = el.candidates.find((x) => x.id === pid);
  if (!cand) {
    cand = { id: pid, party: def?.partisan ? 'D' : undefined, incumbent: false, fund: 0, patronage: 0, dirty: [] };
    el.candidates.push(cand);
  }
  cand.fund += e.fund ?? 0;
  e.race = rid;
  if (e.rung < 3) e.rung = 2;
  hlog(s, H, e, `${c.firstName} ${c.lastName} is on the ballot for ${def?.title ?? 'the commission'}.`);
  return true;
}

export function applyHerOp(ctx: Ctx, o: HerOp): void {
  const s = ctx.s;
  const H = ensureHerWay(s);
  const boss = s.playerId;
  if (o.op === 'beat') { applyBeat(ctx, H, o); return; }
  const e = H.e[o.id];
  const c = s.characters[o.id];
  if (!e || !c?.alive || ageOn(c.birth, s.date) < 18) return;
  const nm = `${c.firstName} ${c.lastName}`;
  switch (o.op) {
    case 'deal':
      joinFamily(s, e, o.deal);
      e.terms = o.cut !== undefined || o.fee !== undefined ? { ...(o.cut !== undefined ? { cut: o.cut } : {}), ...(o.fee !== undefined ? { fee: o.fee } : {}) } : undefined;
      if (o.stake) { e.savings += o.stake; e.standing = clamp(e.standing + 8); }
      addOpinion(s, c.id, boss, 'We have an understanding', 5, 1);
      hlog(s, H, e, `${nm}: ${HER_DEAL_LABEL[o.deal].toLowerCase()}.`);
      ctx.log.push(`${nm}: ${HER_DEAL_LABEL[o.deal].toLowerCase()}.`);
      break;
    case 'lend': {
      const due = Math.round(o.amount * (1 + (o.rate ?? 0.1)));
      e.loan = { left: due, weekly: Math.ceil(due / 12), missed: 0 };
      e.savings += o.amount;
      e.standing = clamp(e.standing + 5);
      addOpinion(s, c.id, boss, 'Lent me money, no strings', 6, 1);
      hlog(s, H, e, `You lent ${nm} ${$(o.amount)}.`);
      break;
    }
    case 'back': {
      e.fund = (e.fund ?? 0) + o.fund;
      e.standing = clamp(e.standing + 8);
      const pid = ensurePolPerson(s, e, c);
      if (pid && s.pol) {
        const ct = ctlOf(s, pid);
        ct.personal = clamp(ct.personal + 25);
        ct.financial = clamp(ct.financial + Math.round(o.fund / 100));
        const el = e.race ? s.pol.elections.find((x) => x.id === e.race) : undefined;
        const cand = el?.candidates.find((x) => x.id === pid);
        if (cand) cand.fund += o.fund;
        else if (!joinRace(s, H, e, c) && e.rung < 2) hlog(s, H, e, `${nm} will run when a race opens, with your money behind her.`);
      }
      addOpinion(s, c.id, boss, 'Backed my run', 10, 1);
      hlog(s, H, e, `You put ${$(o.fund)} behind ${nm}'s campaign.`);
      break;
    }
    case 'squeeze': {
      H.stats.squeezed++;
      e.enemy = s.week;
      e.paidBack = undefined;
      if (o.ok) {
        e.deal = 'none';
        if (e.side === 'player') e.side = 'none';
        e.rival = undefined;
        e.savings = Math.max(0, e.savings - o.take);
        e.standing = clamp(e.standing - 10);
        hlog(s, H, e, `You squeezed ${nm} for ${$(o.take)}. She paid. She will not forget it.`);
      } else {
        const rv = e.side !== 'player' && e.side !== 'none' ? e.side : RIVALS[hashSeed(`${s.seed}:sq:${c.id}`) % RIVALS.length];
        e.deal = 'none';
        e.side = rv;
        hlog(s, H, e, `${nm} would not pay. She went to ${sideName(s, rv)} for protection.`);
      }
      if (e.polId && s.pol?.people[e.polId]) ctlOf(s, e.polId).resentment = clamp(ctlOf(s, e.polId).resentment + 30);
      break;
    }
    case 'leave':
      if (e.deal !== 'none') hlog(s, H, e, `You left ${nm} alone: ${HER_DEAL_LABEL[e.deal].toLowerCase()} no more.`);
      else hlog(s, H, e, `You left ${nm} to her own business.`);
      e.deal = 'none';
      if (e.side === 'player') e.side = 'none';
      addOpinion(s, c.id, boss, 'He let me be', 2, 1);
      break;
    case 'refused':
      addOpinion(s, c.id, boss, 'Asked, and took the no', -2, 1);
      hlog(s, H, e, `${nm} said no to ${o.what}.`);
      break;
  }
}

export function describeHerOp(s: GameState, o: HerOp): string | undefined {
  const c = s.characters[o.id];
  const nm = c?.firstName ?? 'She';
  switch (o.op) {
    case 'deal': { const cut = o.cut ?? HER_CUT[o.deal]; const fee = o.fee ?? HER_FEE[o.deal]; return `${nm}: ${HER_DEAL_LABEL[o.deal].toLowerCase()}${cut ? ` (the Family takes ${Math.round(cut * 100)}% of her week)` : fee ? ` (${$(fee)} a week from the Family)` : ''}`; }
    case 'lend': return `${nm} pays it back over twelve weeks${o.rate === 0 ? ', nothing on top' : `, ${Math.round((o.rate ?? 0.1) * 100)}% on top`}; written off if she can't`;
    case 'back': return `${nm} runs with your money behind her; a friend in City Hall`;
    case 'squeeze': return o.ok ? `${nm} pays, and becomes your enemy` : `${nm} goes to a rival family for protection`;
    case 'leave': return `${nm} goes her own way`;
    case 'refused': return undefined;
    case 'beat': return o.how === 'back' ? `${nm} goes ahead with your money behind her` : o.how === 'bless' ? `${nm} goes ahead with your blessing` : `${nm} goes ahead anyway`;
  }
}

/* ------------------------------------------------------------------ */
/* His own women choose a path                                         */
/* ------------------------------------------------------------------ */

const BEAT: Record<'club' | 'book' | 'politics', { path: HerPath; rung: number; venue: (c: Character) => string; cost: number; title: string; text: string; back: string }> = {
  club: { path: 'fronts', rung: 0, venue: (c) => `the ${c.firstName} Room, a supper club on Pacific Avenue`, cost: 3000, title: 'She is opening a club', text: 'has found a room on Pacific Avenue: a bandstand, twelve tables, a liquor license in her own name. She is opening a supper club, with you or without you.', back: 'Put up $3,000 as her partner' },
  book: { path: 'numbers', rung: 1, venue: () => 'her late husband\'s book, out of the kitchen', cost: 0, title: 'She is keeping his book', text: 'is not selling her husband\'s book. The players know her voice on the phone already; the slips come to her kitchen now. She is running it herself.', back: 'Protect it for a cut' },
  politics: { path: 'politics', rung: 0, venue: () => 'the Democratic club, the Fourth Ward', cost: 1500, title: 'She is going into politics', text: 'signed on as a committeewoman at the Democratic club. Communion breakfasts, every wake in the parish, the ward captain\'s ear. She means to run one day.', back: 'Back her ($1,500 for the club and the right lunches)' },
};

function beatEvent(s: GameState, c: Character, kind: 'club' | 'book' | 'politics', who: string): import('./types').EventInstance {
  const B = BEAT[kind];
  const id = c.id;
  const nm = c.firstName;
  const choices: import('./types').Choice[] = [
    { id: 'back', label: `"${B.back}."`, detail: kind === 'book' ? 'The Family takes 20% of the book; your name keeps the other families off her kitchen.' : kind === 'club' ? 'The Family takes 40% of the club\'s week.' : 'A friend in City Hall, one day.', because: `backed ${nm}`, effects: [...(B.cost ? [{ type: 'money', amount: -B.cost, label: `${nm}: ${B.title.toLowerCase()}` } as Effect] : []), HX({ op: 'beat', id, kind, how: 'back' }, `${nm}: ${B.title.toLowerCase()}`)] },
    { id: 'doubt', label: '"It\'s a mistake. Don\'t."', detail: 'She does it anyway: it is her life. She remembers what you said.', because: `told ${nm} it was a mistake`, effects: [HX({ op: 'beat', id, kind, how: 'doubt' }, `${nm}: ${B.title.toLowerCase()}`)] },
    { id: 'bless', label: '"Good for you."', detail: 'Your blessing, and nothing else. It is hers.', because: `gave ${nm} your blessing`, effects: [HX({ op: 'beat', id, kind, how: 'bless' }, `${nm}: ${B.title.toLowerCase()}`)] },
  ];
  return { iid: `ev${s.nextId++}`, defId: `herway_${kind}`, week: s.week, mandatory: false, priority: 35, title: `${displayName(c)}: ${B.title}`, text: `${who} ${B.text} It is her choice. She wanted you to hear it from her.`, choices, defaultChoiceId: 'bless', actors: [id] };
}

function applyBeat(ctx: Ctx, H: HerWayState, o: Extract<HerOp, { op: 'beat' }>): void {
  const s = ctx.s;
  const c = s.characters[o.id];
  if (!c?.alive || ageOn(c.birth, s.date) < 18) return;
  const B = BEAT[o.kind];
  const own: OwnKind = o.kind === 'club' ? 'goomar' : o.kind === 'book' ? 'widow' : 'daughter';
  let e = H.e[c.id];
  if (!e || e.status !== 'active') {
    e = newEarner(s, c.id, B.path, B.rung, B.venue(c), { standing: 45, own, savings: 500 });
    e.income = incomeOf(e);
    H.e[c.id] = e;
  }
  const nm = `${c.firstName} ${c.lastName}`;
  if (o.kind === 'politics' && s.pol) {
    const pid = ensurePolPerson(s, e, c);
    if (pid && c.dynasty && !s.pol.kids[c.id]) s.pol.kids[c.id] = { since: s.week, groomed: 0, held: [] };
    if (pid && o.how === 'back') { const ct = ctlOf(s, pid); ct.personal = clamp(ct.personal + 30); }
  }
  if (o.how === 'back') {
    if (o.kind !== 'politics') joinFamily(s, e, o.kind === 'club' ? 'partner' : 'protect');
    e.standing = clamp(e.standing + 10);
    addOpinion(s, c.id, s.playerId, 'He backed me when I went my own way', 10, 1);
  } else if (o.how === 'bless') addOpinion(s, c.id, s.playerId, 'He wished me well', 5, 1);
  else addOpinion(s, c.id, s.playerId, 'He told me I was making a mistake', -8, 1);
  const line = `${nm} ${o.kind === 'club' ? 'opened a supper club of her own' : o.kind === 'book' ? 'took over her late husband\'s book' : 'went into politics'}${o.how === 'back' ? ', with you behind her' : o.how === 'doubt' ? ', though you told her not to' : ''}.`;
  hlog(s, H, e, line);
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: line, kind: 'family' });
}

/** The boss's own women who may choose a path now (adults; each chooses once). */
function ownCandidates(s: GameState, H: HerWayState): { c: Character; kind: 'club' | 'book' | 'politics'; who: string }[] {
  const out: { c: Character; kind: 'club' | 'book' | 'politics'; who: string }[] = [];
  const b = player(s);
  if (!b) return out;
  const ok = (c: Character | undefined): c is Character => !!c && c.alive && c.gender === 'F' && c.id !== b.id && ageOn(c.birth, s.date) >= 21 && !H.beats[c.id] && !(H.e[c.id]?.status === 'active') && isFree(s, c);
  // A goomar who wants a place of her own.
  const goomars = new Set<string>([...Object.keys(s.nightlife?.goomars ?? {}), ...Object.values(s.bonds?.ties ?? {}).filter((t) => t.role === 'goomar' && t.stage !== 'ended').map((t) => t.id)]);
  for (const id of [...goomars].sort()) { const c = s.characters[id]; if (ok(c)) out.push({ c, kind: 'club', who: displayName(c) }); }
  // A widow of one of the Family's men.
  for (const d of Object.values(s.characters)) {
    if (d.alive || d.gender !== 'M' || !d.spouseId || (d.faction !== 'player' && !d.dynasty)) continue;
    const w = s.characters[d.spouseId];
    if (ok(w) && !w.spouseId && b.spouseId !== w.id) out.push({ c: w, kind: 'book', who: `${displayName(w)}, ${d.firstName}'s widow,` });
  }
  // A daughter who goes into politics (not one already there).
  for (const c of Object.values(s.characters)) {
    if (!ok(c) || !c.dynasty || (c.fatherId !== b.id && c.motherId !== b.id)) continue;
    if (c.rank !== 'civilian' || (c.record ?? 0) > 0 || s.pol?.kids[c.id]) continue;
    out.push({ c, kind: 'politics', who: `Your daughter ${c.firstName}` });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* The week                                                            */
/* ------------------------------------------------------------------ */

function money(ctx: Ctx, amount: number, label: string, category: 'kickup' | 'cost' | 'rival' | 'event'): void {
  if (!amount) return;
  applyEffects(ctx, [{ type: 'money', amount, category, label }], { label, because: label, category });
}

function pinch(ctx: Ctx, H: HerWayState, e: Earner, c: Character, r: number): void {
  const s = ctx.s;
  const nm = `${c.firstName} ${c.lastName}`;
  e.pinched = s.week + 4 + Math.floor(r * 6);
  e.heat = Math.round(e.heat / 3);
  e.standing = clamp(e.standing - 8);
  H.stats.pinched++;
  hlog(s, H, e, `${nm} was pinched (${PATHS[e.path].label.toLowerCase()}). Out of business until week ${e.pinched}.`);
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${nm} was pinched: ${low(titleOf(e))} at ${e.venue}.`, kind: 'heat' });
  if (e.deal === 'partner') applyEffects(ctx, [{ type: 'heat', bar: 'local', amount: 2, label: `Your partner ${c.firstName} was pinched` }], { label: 'A partner pinched', because: `partnered with ${c.firstName}`, category: 'heat' });
  if (e.deal === 'hired' && (e.knows ?? 0) >= 50) {
    if (opinion(s, c.id, s.playerId) < 40) {
      applyEffects(ctx, [{ type: 'evidence', charId: s.playerId, amount: 6, label: `${c.firstName} talked about the books` }, { type: 'heat', bar: 'federal', amount: 3, label: `${c.firstName} talked` }], { label: 'Your bookkeeper talked', because: `hired ${c.firstName} to keep the books`, category: 'heat' });
      hlog(s, H, e, `${nm} told them where some of your money goes.`);
    } else hlog(s, H, e, `${nm} kept her mouth shut about your books.`);
  }
}

export function herwayWeek(ctx: Ctx): void {
  const s = ctx.s;
  const H = ensureHerWay(s);
  const now = s.week;
  let rivalNow = Object.values(H.e).some((x) => x.status === 'active' && x.rival !== undefined);
  for (const e of Object.values(H.e).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (e.status !== 'active') continue;
    const c = s.characters[e.id];
    const nm = c ? `${c.firstName} ${c.lastName}` : 'She';
    if (!c?.alive) { e.status = 'out'; hlog(s, H, e, `${nm} is gone.`); continue; }
    if (e.path === 'street') continue; // a madam's house is Nightlife's week
    const r = (k: string) => roll(`${s.seed}|${now}|her|${k}|${e.id}`);
    const pinched = e.pinched !== undefined && now < e.pinched;
    if (e.pinched !== undefined && !pinched) { e.pinched = undefined; hlog(s, H, e, `${nm} is back in business.`); }
    e.income = incomeOf(e, now);
    const covered = e.side === 'player' && (e.deal === 'partner' || e.deal === 'protect');
    // Heat: what her rung draws, less with your name behind her; it cools by itself.
    const P = PATHS[e.path];
    e.heat = clamp(e.heat + P.heat[Math.min(e.rung, P.heat.length - 1)] * (covered ? 0.5 : 1) - 1);
    if (!pinched && (e.path !== 'politics' && e.path !== 'info') && r('pinch') < e.heat / 800) pinch(ctx, H, e, c, r('pdur'));
    // Money: the cut kicks up through the Family's ordinary books; her rivals' cut to them.
    const cut = e.side === 'player' ? Math.round(e.income * cutOf(e)) : 0;
    if (cut > 0) money(ctx, cut, `${c.firstName} ${c.lastName} kicked up: ${low(titleOf(e))}`, 'kickup');
    if (e.side !== 'player' && e.side !== 'none' && e.income > 0) {
      const rv = s.rivals.find((x) => x.id === e.side);
      if (rv) rv.money += Math.round(e.income * 0.2);
    }
    const fee = feeOf(e);
    if (fee) money(ctx, -fee, `${c.firstName} ${c.lastName}: ${e.deal === 'hired' ? 'keeping your books' : 'what she hears'}`, 'cost');
    e.savings += Math.max(0, e.income - cut);
    // A loan: paid back from her week; never held over her (three missed weeks and it is written off).
    if (e.loan) {
      const pay = Math.min(e.loan.left, e.loan.weekly);
      if (!pinched && e.savings >= pay) {
        e.savings -= pay;
        e.loan.left -= pay;
        e.loan.missed = 0;
        money(ctx, pay, `${c.firstName} ${c.lastName} paid on her loan`, 'kickup');
        if (e.loan.left <= 0) { e.loan = undefined; hlog(s, H, e, `${nm} paid back every dollar.`); addOpinion(s, c.id, s.playerId, 'Trusted me with money', 3, 1); }
      } else if (++e.loan.missed >= 3) {
        hlog(s, H, e, `${nm} could not keep up the payments. The rest (${$(e.loan.left)}) is written off: nobody holds a debt over her.`);
        e.loan = undefined;
      }
    }
    // Her standing: the work, your name, a pinch.
    e.standing = clamp(e.standing + (r('st') - 0.45) * 4 + (covered ? 0.5 : 0) - (pinched ? 1 : 0));
    // The other families lean on a woman nobody stands behind.
    if (!pinched && e.rung >= 1 && ['numbers', 'books', 'fronts'].includes(e.path) && r('lean') < 0.02) {
      const rv = RIVALS[Math.floor(r('who') * RIVALS.length)];
      const rn = s.rivals.find((x) => x.id === rv)?.shortName ?? rv;
      if (covered) { e.standing = clamp(e.standing + 2); hlog(s, H, e, `The ${rn} people came by ${e.venue}; your name sent them away.`); }
      else if (e.side === 'none') {
        if (r('give') < 0.5) { e.side = rv; hlog(s, H, e, `The ${rn} people leaned on ${nm}. She pays them now.`); }
        else { e.standing = clamp(e.standing - 6); hlog(s, H, e, `The ${rn} people leaned on ${nm}. She held out, and it cost her.`); }
      }
    }
    // The books: a hired bookkeeper keeps them cleaner, and learns.
    if (e.deal === 'hired') {
      e.knows = clamp((e.knows ?? 0) + 2);
      const boss = player(s);
      if (now % 4 === 0 && (boss?.evidence ?? 0) > 0) applyEffects(ctx, [{ type: 'evidence', charId: s.playerId, amount: -1, label: `${c.firstName} keeps clean books` }], { label: 'Clean books', because: `hired ${c.firstName}`, category: 'event' });
    }
    // Her ears: a raid coming, a rival's move.
    if (e.deal === 'ears' && !pinched && r('tip') < (e.path === 'info' ? 0.25 : 0.12)) {
      if (r('tk') < 0.6) applyEffects(ctx, [{ type: 'heat', bar: 'local', amount: -2, label: `${c.firstName} warned you of a raid` }], { label: 'A tip', because: `made ${c.firstName} your ears`, category: 'heat' });
      else applyEffects(ctx, [{ type: 'favor', amount: 1, label: `${c.firstName} heard something useful` }], { label: 'A tip', because: `made ${c.firstName} your ears`, category: 'event' });
      hlog(s, H, e, `${nm} passed something on.`);
    }
    // A squeezed woman gets even, once.
    if (e.enemy !== undefined && !e.paidBack && now - e.enemy >= 6 && r('rev') < 0.02) {
      e.paidBack = true;
      if (r('how') < 0.5) {
        applyEffects(ctx, [{ type: 'heat', bar: 'local', amount: 3, label: `${c.firstName} went to the police` }, { type: 'evidence', charId: s.playerId, amount: 2, label: `${c.firstName} talked` }], { label: 'She went to the police', because: `squeezed ${c.firstName}`, category: 'heat' });
        hlog(s, H, e, `${nm} went to the police about the men you sent.`);
      } else {
        e.side = RIVALS[Math.floor(r('rv') * RIVALS.length)];
        hlog(s, H, e, `${nm} took her business, and what she knows about yours, to ${sideName(s, e.side)}.`);
      }
    }
    // Politics: the race and the seat (the pol layer's elections decide it).
    if (e.path === 'politics' && s.pol) {
      const pol = s.pol;
      const seat = e.polId ? pol.people[e.polId]?.seat : undefined;
      if (e.rung === 2 && e.race && !pol.elections.some((x) => x.id === e.race)) {
        e.race = undefined;
        if (seat) { e.rung = 3; H.stats.won++; e.venue = OFFICE_BY_ID[parseSeat(seat)!.office]?.title ?? e.venue; hlog(s, H, e, `${nm} won: ${e.venue}.`); s.chronicle.push({ week: now, date: { ...s.date }, text: `${nm} won a seat: ${e.venue}.`, kind: 'misc' }); }
        else { e.rung = 1; e.standing = clamp(e.standing - 10); e.fund = 0; hlog(s, H, e, `${nm} lost the race. She says next time.`); }
      } else if (e.rung === 3 && !seat && !e.race) { e.rung = 1; hlog(s, H, e, `${nm} is out of office.`); }
      else if (e.rung === 3 && seat) e.venue = OFFICE_BY_ID[parseSeat(seat)!.office]?.title ?? e.venue;
      else if (e.rung === 1 && !e.race && ((e.fund ?? 0) > 0 || (e.standing >= 70 && r('run') < 0.03)) && openRace(s)) joinRace(s, H, e, c);
      if (e.polId && pinched === false && e.heat >= 60 && r('scandal') < 0.02) { const m = mutP(s, e.polId); if (m) m.scandal = Math.min(100, m.scandal + 15); }
    }
    // Rise and fall.
    const max = P.rungs.length - 1;
    const climbs = e.path !== 'politics' || e.rung === 0;
    if (!pinched && climbs && e.rung < max && e.standing >= 60 && r('rise') < (e.standing - 50) / 600 + (e.loan ? 0.01 : 0) + (e.deal === 'partner' ? 0.01 : 0)) {
      e.rung++;
      e.standing = clamp(e.standing - 15);
      H.stats.rose++;
      hlog(s, H, e, `${nm} moved up: ${low(titleOf(e))}.`);
      s.chronicle.push({ week: now, date: { ...s.date }, text: `${nm} moved up: ${low(titleOf(e))}.`, kind: 'misc' });
    } else if (e.standing < 15 && r('fall') < 0.1) {
      H.stats.fell++;
      if (e.rung > 0 && !(e.path === 'politics' && e.rung >= 2)) { e.rung--; e.standing = 35; hlog(s, H, e, `${nm} came down a step: ${low(titleOf(e))}.`); }
      else if (e.path !== 'politics' || e.rung === 0) { e.status = 'out'; e.deal = 'none'; e.loan = undefined; hlog(s, H, e, `${nm} got out of it, with what she had put by.`); continue; }
    }
    // A rare one rises to rival the boss: the top of her path, and nobody's.
    if (!rivalNow && e.rival === undefined && e.side !== 'player' && e.rung === max && ['numbers', 'books', 'fronts'].includes(e.path) && e.standing >= 75 && r('rival') < 0.02) {
      e.rival = now;
      e.side = 'none';
      rivalNow = true;
      H.stats.rivals++;
      hlog(s, H, e, `${nm} answers to nobody now. Her people are taking action off your corners.`);
      s.chronicle.push({ week: now, date: { ...s.date }, text: `${nm} has become a power on the island in her own right: a rival to you.`, kind: 'rival' });
    }
    if (e.rival !== undefined) {
      if (e.side === 'player' || pinched) { e.rival = undefined; hlog(s, H, e, `${nm} is no rival to you now.`); }
      else money(ctx, -Math.min(150, Math.round(e.income * 0.25)), `${c.firstName} ${c.lastName}'s people took action off your corners`, 'rival');
    }
  }
  // His own women choose a path (one at a time, now and then). Each choice is hers.
  if (now % 4 === 2) {
    for (const x of ownCandidates(s, H)) {
      if (roll(`${s.seed}|${now}|herbeat|${x.c.id}`) >= 0.04) continue;
      H.beats[x.c.id] = now;
      s.eventQueue.push(beatEvent(s, x.c, x.kind, x.who));
      break;
    }
  }
}

/* ------------------------------------------------------------------ */
/* The view                                                            */
/* ------------------------------------------------------------------ */

export interface HerRow {
  id: string;
  name: string;
  age: number;
  path: HerPath;
  pathLabel: string;
  title: string;
  venue: string;
  /** Her gross a week. */
  income: number;
  /** What the Family gets from her a week (her cut, less what you pay her). */
  toFamily: number;
  standing: number;
  heat: number;
  side: FactionId;
  sideLabel: string;
  dealLabel: string;
  risks: string[];
  own?: OwnKind;
  rival: boolean;
  hist: [number, string][];
}

/** The women of the town, by path (the street only with mature content on; adults only). */
export function herRows(s: GameState): HerRow[] {
  const H = s.herway;
  const out: HerRow[] = [];
  if (H) for (const e of Object.values(H.e)) {
    const c = s.characters[e.id];
    if (e.status !== 'active' || !c?.alive || ageOn(c.birth, s.date) < 18) continue;
    const inc = incomeOf(e, s.week);
    out.push({
      id: e.id, name: displayName(c), age: ageOn(c.birth, s.date), path: e.path, pathLabel: PATHS[e.path].label, title: titleOf(e), venue: e.venue,
      income: inc, toFamily: (e.side === 'player' ? Math.round(inc * cutOf(e)) : 0) - feeOf(e), standing: Math.round(e.standing), heat: Math.round(e.heat),
      side: e.side, sideLabel: e.path === 'politics' ? (e.fund ? 'Your money behind her' : 'Her own woman') : e.side === 'player' ? 'Kicks up to you' : e.side === 'none' ? 'Kicks up to nobody' : `Kicks up to ${sideName(s, e.side)}`,
      dealLabel: HER_DEAL_LABEL[e.deal], risks: risksOf(s, e), own: e.own, rival: e.rival !== undefined, hist: e.hist.slice(-6),
    });
  }
  // The madams: Nightlife's houses, as they stand.
  if (adultOn(s) && s.nightlife) for (const h of Object.values(s.nightlife.houses)) {
    const c = s.characters[h.id];
    if (!c?.alive || ageOn(c.birth, s.date) < 18 || h.ears) continue;
    const toFam = h.with === 'player' ? Math.round(h.take * (h.deal === 'partner' ? 0.3 : 0.15)) : 0;
    out.push({
      id: h.id, name: displayName(c), age: ageOn(c.birth, s.date), path: 'street', pathLabel: PATHS.street.label, title: PATHS.street.rungs[1], venue: `${h.name} (${h.front})`,
      income: Math.round(h.take), toFamily: toFam, standing: Math.round(clamp(30 + h.money / 2000)), heat: Math.round(h.heat), side: h.with,
      sideLabel: h.with === 'player' ? 'Kicks up to you' : h.with === 'none' ? 'Kicks up to nobody' : `Kicks up to ${sideName(s, h.with)}`, dealLabel: DEAL_LABEL[h.deal],
      risks: [...(h.heat >= 40 ? [`The vice squad is looking (heat ${Math.round(h.heat)})`] : []), ...(h.squeeze ? [`The ${s.rivals.find((x) => x.id === h.squeeze!.by)?.shortName} family is squeezing her`] : [])],
      rival: false, hist: (s.nightlife.people[h.id]?.hist ?? []).slice(-6),
    });
  }
  return out.sort((a, b) => PATH_ORDER.indexOf(a.path) - PATH_ORDER.indexOf(b.path) || b.income - a.income || (a.id < b.id ? -1 : 1));
}

/** The women's town in numbers: how many, what they make, what comes to you. */
export function herSummary(s: GameState): { women: number; weekly: number; toFamily: number; withYou: number; rivals: number } {
  const rows = herRows(s);
  return { women: rows.length, weekly: rows.reduce((a, r) => a + r.income, 0), toFamily: rows.reduce((a, r) => a + r.toFamily, 0), withYou: rows.filter((r) => r.side === 'player').length, rivals: rows.filter((r) => r.rival).length };
}

export function herLog(s: GameState, n = 12): { week: number; text: string }[] {
  return (s.herway?.log ?? []).slice(-n).reverse().map(([week, text]) => ({ week, text }));
}

/** A random-player order (the sim). */
export function herActions(s: GameState): PlayerAction[] {
  const e = Object.values(s.herway?.e ?? {}).filter((x) => x.status === 'active' && x.path !== 'street').sort((a, b) => (a.id < b.id ? -1 : 1));
  if (!e.length) return [];
  const x = e[s.week % e.length];
  return [{ kind: 'herway', op: { op: x.path === 'info' ? 'ears' : x.path === 'politics' ? 'back' : 'protect', id: x.id } } as PlayerAction];
}

