import { displayName, hasTrait, isFree } from '../characters';
import { awayReason, today } from '../days';
import { applyEffects, fmtMoney, shiftInfluence } from '../effects';
import { cloneState } from '../engine';
import { journal } from '../journal';
import { money, newCtx } from '../ledger';
import { inTheRanks } from '../rankView';
import { addOpinion, opinion } from '../relations';
import { hashSeed } from '../rng';
import { rivalStrength } from '../strength';
import { ensureTalks, logTalk, pactWith, partnerWeekly, rivalRelation, type Pact } from '../talks';
import { spendTime, timeBlock } from '../timeCost';
import type { Effect, GameState, PlayerAction, Rival, RivalId } from '../types';
import { playerMuscle } from '../war';
import { FACTION_NAMES } from '../world';
import { toneEffect, type Dialogue, type Line, type Tone } from './dialogue';
import { clamp } from './state';
import { clean } from './talk';
import { mindView } from './view';

/**
 * THE SIT-DOWN WITH A FAMILY. A real back-and-forth with another family's
 * boss ("Sit down with the Mannos"): what they want and how far they bend
 * (their STANCE), a bounded DEAL MENU either side can put on the table, a
 * score of any deal from their side (`dealValue`) against what they need
 * (`stance.need`), and the shake that applies it through the game's own
 * mechanics (pacts the rivals' AI respects, a war ended in a white peace, the
 * ledger, influence, favors owed).
 *
 * Claude may voice the other boss (the page's `sample` capability): the
 * prompt carries the rules, his persona, the family's position and the deal
 * menu with its exact bounds, and asks for one strict JSON object. The model
 * NEVER changes the game: its answer is validated (`validateDiplo`: kinds
 * whitelisted, numbers clamped, districts from the list) and the ENGINE has
 * the final say: a model "accept" of a deal clearly against the family's
 * interest is overridden to a counter or a refusal, and a gift the model
 * offers against its own side is replaced by the engine's counter. Without
 * Claude, scripted lines from the stance do the same job, so the sit-down
 * works fully without AI.
 *
 * RULE: nothing on the menu involves the boss's own men. No man of his is
 * killed or handed over without his explicit choice, and a sit-down is never
 * that choice: there is no such term, and anything like it is dropped.
 *
 * Limits: up to SIT_TURNS exchanges; one sit-down per family per week; two
 * hours of the boss's day; a sit-down ends when their patience runs out
 * (anger past the line, insults count double).
 */

export const SIT_TURNS = 14;
export const SIT_HOURS = 2;
/** The order a sit-down is booked as on the boss's clock (timeCost.ts: `mind:sitdown`). Not a queued order. */
export const SIT_ACTION = { kind: 'mind', op: 'sitdown' } as unknown as PlayerAction;
/** Anger at which he walks out. */
export const SIT_WALK = 75;
/** Most a sit-down without a deal moves his opinion of the boss. */
export const SIT_OPINION_CAP = 8;
export const MAX_TERMS = 3;

export const DEAL_KINDS = ['truce', 'alliance', 'partnership', 'tribute', 'cash', 'concession', 'favor', 'handsoff'] as const;
export type DealKind = (typeof DEAL_KINDS)[number];
/** Who gives: 'them' (the family pays, cedes, owes, stays out) or 'you' (the boss does). */
export type Dir = 'them' | 'you';

export interface Term { kind: DealKind; amount?: number; district?: string; weeks?: number; dir?: Dir }

export const KIND_LABEL: Record<DealKind, string> = {
  truce: 'Truce', alliance: 'Alliance', partnership: 'Partnership (they pay you weekly)', tribute: 'Tribute (you pay them weekly)',
  cash: 'Cash settlement', concession: 'Give up ground in a district', favor: 'A favor owed', handsoff: 'Stay out of a district',
};
/** Kinds whose `dir` is chosen; the others have one direction. */
export const HAS_DIR: Record<DealKind, boolean> = { truce: false, alliance: false, partnership: false, tribute: false, cash: true, concession: true, favor: true, handsoff: true };

export const DIPLO_INTENTS = ['agree', 'refuse', 'threaten', 'bargain', 'deflect', 'warn', 'flatter', 'complain', 'insulted'] as const;
export type DiploIntent = (typeof DIPLO_INTENTS)[number];
export const DEAL_STATUS = ['proposing', 'accepting', 'rejecting', 'none'] as const;
export type DealStatus = (typeof DEAL_STATUS)[number];

const r10 = (n: number) => Math.round(n / 10) * 10;
const r50 = (n: number) => Math.round(n / 50) * 50;
const H = (k: string) => hashSeed(k) / 4294967296;

/* ------------------------------------------------------------------ */
/* Who can sit down                                                     */
/* ------------------------------------------------------------------ */

export function rivalOf(s: GameState, id: string): Rival | undefined {
  return s.rivals.find((r) => r.id === id && (r.kind === 'mob' || r.kind === 'philly'));
}

/** The family a character runs (a sit-down partner), if any. */
export function familyLedBy(s: GameState, charId: string): RivalId | undefined {
  return s.rivals.find((r) => r.leaderId === charId && (r.kind === 'mob' || r.kind === 'philly'))?.id;
}

export function satThisWeek(s: GameState, rival: string): boolean {
  return s.talks?.sat?.[rival] === s.week;
}

/** Can the boss sit down with this family now? (why not, if not). */
export function canSitDown(s: GameState, rival: string): { ok: boolean; why?: string } {
  const r = rivalOf(s, rival);
  if (!r) return { ok: false, why: 'Not a family you sit down with' };
  const c = s.characters[r.leaderId];
  if (!c?.alive) return { ok: false, why: 'Their boss is gone' };
  if (!isFree(s, c)) return { ok: false, why: 'Their boss is in prison' };
  if (s.gameOver) return { ok: false, why: 'The game is over' };
  if (inTheRanks(s)) return { ok: false, why: 'The families deal with your Don, not with you' };
  const away = awayReason(s, today(s));
  if (away) return { ok: false, why: away };
  if (satThisWeek(s, rival)) return { ok: false, why: `You already sat down with ${FACTION_NAMES[r.id]} this week` };
  const tb = timeBlock(s, SIT_ACTION);
  if (tb) return { ok: false, why: tb };
  return { ok: true };
}

/** Sit down: two hours off the boss's day, and the family is counted for the week. Pure (unchanged if he can't). */
export function beginSitDown(s: GameState, rival: string): GameState {
  if (!canSitDown(s, rival).ok) return s;
  const next = cloneState(spendTime(s, SIT_ACTION).state);
  const t = ensureTalks(next);
  t.sat = { ...(t.sat ?? {}), [rival]: next.week };
  t.met[rivalOf(next, rival)!.leaderId] = next.week;
  return next;
}

/* ------------------------------------------------------------------ */
/* The deal menu: what can be on the table, and its bounds              */
/* ------------------------------------------------------------------ */

export interface Bounds { lo: number; hi: number; def: number }

function inf(s: GameState, district: string, f: string): number {
  return s.districts.find((d) => d.id === district)?.influence[f as RivalId] ?? 0;
}

/** Kinds this family can deal in right now. */
export function allowedKinds(s: GameState, rival: string): DealKind[] {
  const r = rivalOf(s, rival);
  if (!r) return [];
  if (r.kind === 'philly') return ['tribute', 'cash', 'favor'];
  const war = s.wars.some((w) => w.rival === r.id);
  return DEAL_KINDS.filter((k) => {
    if (k === 'alliance') return !pactWith(s, r.id, 'alliance');
    if (k === 'partnership') return !war && !pactWith(s, r.id, 'partnership');
    if (k === 'tribute') return !pactWith(s, r.id, 'tribute');
    if (k === 'concession' || k === 'handsoff') return districtsFor(s, rival, k, 'them').length > 0 || districtsFor(s, rival, k, 'you').length > 0;
    return true;
  });
}

/** Districts a term can name: a concession comes out of the giver's ground; staying out is anywhere the bound side is or wants to be. */
export function districtsFor(s: GameState, rival: string, kind: DealKind, dir: Dir): string[] {
  const giver = dir === 'them' ? rival : 'player';
  if (kind === 'concession') return s.districts.filter((d) => (d.influence[giver as RivalId] ?? 0) >= 1).map((d) => d.id);
  if (kind === 'handsoff') return s.districts.filter((d) => (d.influence[giver as RivalId] ?? 0) < 60 && ((d.influence.player ?? 0) > 0 || (d.influence[rival as RivalId] ?? 0) > 0)).map((d) => d.id);
  return [];
}

/** The bounds of a term's numbers (amount, weeks) for this family now. */
export function termBounds(s: GameState, rival: string, kind: DealKind, dir: Dir = 'them', district?: string): { amount?: Bounds; weeks?: Bounds } {
  const r = rivalOf(s, rival);
  switch (kind) {
    case 'truce': return { weeks: { lo: 8, hi: 52, def: 26 } };
    case 'alliance': return { weeks: { lo: 26, hi: 52, def: 52 } };
    case 'partnership': {
      const pw = partnerWeekly(s, rival as RivalId);
      return { amount: { lo: r10(pw * 0.5), hi: r10(pw * 1.25), def: pw }, weeks: { lo: 26, hi: 52, def: 52 } };
    }
    case 'tribute': return { amount: { lo: 50, hi: 600, def: r10(clamp(150 + (r?.muscle ?? 50) * 3, 50, 600)) }, weeks: { lo: 4, hi: 26, def: 12 } };
    case 'cash': {
      const hi = dir === 'them' ? Math.max(250, Math.min(15000, r50(Math.max(0, r?.money ?? 0) * 0.5))) : 15000;
      return { amount: { lo: 250, hi, def: Math.min(hi, 2500) } };
    }
    case 'concession': {
      const have = district ? Math.floor(inf(s, district, dir === 'them' ? rival : 'player')) : 8;
      const hi = Math.max(1, Math.min(8, have));
      return { amount: { lo: 1, hi, def: Math.min(hi, 4) } };
    }
    case 'handsoff': return { weeks: { lo: 8, hi: 52, def: 26 } };
    case 'favor': return {};
  }
}

/* ------------------------------------------------------------------ */
/* Validation: a term from anywhere (the model, the screen) is data      */
/* ------------------------------------------------------------------ */

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

/** One term, whitelisted and clamped; undefined if it is not on the menu now. */
export function validateTerm(s: GameState, rival: string, raw: unknown): Term | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const kind = String(o.kind ?? '') as DealKind;
  if (!(DEAL_KINDS as readonly string[]).includes(kind)) return undefined;
  if (!allowedKinds(s, rival).includes(kind)) return undefined;
  const dir: Dir = kind === 'partnership' ? 'them' : kind === 'tribute' ? 'you' : o.dir === 'you' ? 'you' : 'them';
  const t: Term = { kind };
  if (HAS_DIR[kind]) t.dir = dir;
  if (kind === 'concession' || kind === 'handsoff') {
    const ok = districtsFor(s, rival, kind, dir);
    const d = typeof o.district === 'string' ? o.district : '';
    const byName = s.districts.find((x) => x.id === d || x.name.toLowerCase() === d.toLowerCase())?.id;
    if (!byName || !ok.includes(byName)) return undefined;
    t.district = byName;
  }
  const b = termBounds(s, rival, kind, dir, t.district);
  if (b.amount) {
    const a = num(o.amount) ?? b.amount.def;
    const v = clamp(a, b.amount.lo, b.amount.hi);
    t.amount = kind === 'concession' ? Math.round(v) : kind === 'cash' ? r50(v) : r10(v);
    t.amount = clamp(t.amount, b.amount.lo, b.amount.hi);
  }
  if (b.weeks) t.weeks = Math.round(clamp(num(o.weeks) ?? b.weeks.def, b.weeks.lo, b.weeks.hi));
  return t;
}

/** A whole deal (one term or a list of up to three), validated: unknown kinds dropped, one term per kind. */
export function validateDeal(s: GameState, rival: string, raw: unknown): Term[] {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const out: Term[] = [];
  for (const x of list.slice(0, 6)) {
    const t = validateTerm(s, rival, x);
    if (t && !out.some((y) => y.kind === t.kind)) out.push(t);
    if (out.length >= MAX_TERMS) break;
  }
  // An alliance in the middle of a war only with the truce that ends it.
  if (s.wars.some((w) => w.rival === rival) && out.some((t) => t.kind === 'alliance') && !out.some((t) => t.kind === 'truce')) return out.filter((t) => t.kind !== 'alliance');
  return out;
}

/* ------------------------------------------------------------------ */
/* Their stance: what they want, how far they bend                      */
/* ------------------------------------------------------------------ */

export interface Reason { label: string; value: number }

export interface Stance {
  rival: RivalId;
  boss: string;
  name: string;
  opinion: number;
  war?: { score: number; district: string };
  /** Their strength over yours (1 = even). */
  ratio: number;
  /** What a deal must be worth to them (in dollars, their side), before the sit-down's own mood. */
  need: number;
  /** Why (each piece of `need`). */
  reasons: Reason[];
  /** How far they bend, in words. */
  bend: 'hardly' | 'some' | 'readily';
  /** Their opening ask. */
  wants: Term[];
  wantText: string;
  allowed: DealKind[];
  /** Districts both sides want. */
  contested: string[];
}

function philly(s: GameState): number {
  const p = s.rivals.find((r) => r.id === 'philly');
  return p && s.characters[p.leaderId]?.alive ? opinion(s, p.leaderId, s.playerId) : 0;
}

export function stanceOf(s: GameState, rival: string): Stance | undefined {
  const r = rivalOf(s, rival);
  const c = r ? s.characters[r.leaderId] : undefined;
  if (!r || !c) return undefined;
  const op = opinion(s, c.id, s.playerId);
  const w = s.wars.find((x) => x.rival === r.id);
  const mine = Math.max(5, playerMuscle(s));
  const theirs = Math.max(5, r.kind === 'philly' ? 80 : rivalStrength(s, r));
  const ratio = Math.round((theirs / mine) * 100) / 100;
  const reasons: Reason[] = [];
  reasons.push({ label: 'What he thinks of you', value: Math.round(-op * 20) });
  reasons.push({ label: ratio >= 1 ? 'They are stronger than you' : 'You are stronger than they are', value: Math.round(clamp((ratio - 1) * 1200, -1200, 2000)) });
  if (w) reasons.push({ label: w.score < 0 ? 'They are winning the war' : w.score > 0 ? 'You are winning the war' : 'The war is even', value: Math.round(w.score < 0 ? -w.score * 30 : -w.score * 20) });
  if (r.feud) reasons.push({ label: 'Blood feud', value: 1500 });
  const ph = philly(s);
  if (r.kind !== 'philly' && ph) reasons.push({ label: ph >= 0 ? 'Philadelphia thinks well of you' : 'Philadelphia thinks little of you', value: Math.round(-ph * 10) });
  const heat = Math.round((s.heat.local + s.heat.federal) / 2);
  if (heat > 50) reasons.push({ label: 'You bring heat', value: (heat - 50) * 25 });
  if (hasTrait(c, 'Greedy')) reasons.push({ label: 'Greedy', value: 600 });
  if (hasTrait(c, 'Patient')) reasons.push({ label: 'Patient', value: -200 });
  if (hasTrait(c, 'Hot-headed')) reasons.push({ label: 'Hot-headed', value: 300 });
  if (hasTrait(c, 'Vengeful') && (r.feud || op < -20)) reasons.push({ label: 'Vengeful', value: 400 });
  if (hasTrait(c, 'Cowardly')) reasons.push({ label: 'Cowardly', value: -400 });
  const need = Math.round(reasons.reduce((a, x) => a + x.value, 0));
  const contested = s.districts.filter((d) => (d.influence.player ?? 0) >= 8 && (d.influence[r.id] ?? 0) >= 8).map((d) => d.id);
  const allowed = allowedKinds(s, r.id);
  const st: Stance = {
    rival: r.id, boss: c.id, name: FACTION_NAMES[r.id], opinion: op, ...(w ? { war: { score: w.score, district: w.district } } : {}),
    ratio, need, reasons: reasons.filter((x) => x.value !== 0), bend: need > 1500 ? 'hardly' : need < -300 ? 'readily' : 'some',
    wants: [], wantText: '', allowed, contested,
  };
  const base = openingAsk(s, st);
  st.wants = counterTo(s, st, base, st.need, true) ?? base;
  st.wantText = st.wants.length ? describeDeal(s, st.rival, st.wants) : 'Nothing, today. He came to listen.';
  return st;
}

/** Their opening ask: what they would put on the table first. */
function openingAsk(s: GameState, st: Stance): Term[] {
  const has = (k: DealKind) => st.allowed.includes(k);
  const base: Term[] = [];
  if (st.rival === 'philly') base.push({ kind: 'tribute', amount: 200, weeks: 12 });
  else if (st.war) base.push({ kind: 'truce', weeks: 26 });
  else if (st.opinion >= 25 && has('partnership')) base.push({ kind: 'partnership', amount: partnerWeekly(s, st.rival), weeks: 52 });
  else if (st.opinion <= -20 && has('handsoff') && st.contested.length) base.push({ kind: 'handsoff', dir: 'you', district: st.contested[0], weeks: 26 });
  else if (has('truce')) base.push({ kind: 'truce', weeks: 26 });
  return validateDeal(s, st.rival, base);
}

/* ------------------------------------------------------------------ */
/* What a deal is worth to them                                         */
/* ------------------------------------------------------------------ */

/** One term's worth to the family, in dollars (positive: good for them). */
export function termValue(s: GameState, rival: string, t: Term): number {
  const r = rivalOf(s, rival);
  if (!r) return 0;
  const op = opinion(s, r.leaderId, s.playerId);
  const w = s.wars.find((x) => x.rival === r.id);
  const ratio = Math.max(5, r.kind === 'philly' ? 80 : rivalStrength(s, r)) / Math.max(5, playerMuscle(s));
  const heat = (s.heat.local + s.heat.federal) / 2;
  const wk = t.weeks ?? 26;
  const amt = t.amount ?? 0;
  switch (t.kind) {
    case 'truce': {
      if (w) return Math.round(1200 + w.score * 40);
      return Math.round((300 + (1 - ratio) * 1500 - (op < -30 ? 500 : 0)) * (wk / 26));
    }
    case 'alliance': {
      const enemy = s.rivals.some((o) => o.id !== r.id && o.kind === 'mob' && rivalRelation(s, r.id, o.id) < -25);
      return Math.round(((op - 25) * 50 + (enemy ? 600 : 0) - (heat > 40 ? (heat - 40) * 20 : 0)) * (wk / 52));
    }
    case 'partnership': {
      const fair = partnerWeekly(s, r.id as RivalId);
      return Math.round((fair - amt) * wk * 0.6 + (op > 0 ? op * 10 : op * 20) + 200 - (heat > 40 ? (heat - 40) * 15 : 0));
    }
    case 'tribute': return Math.round(amt * wk * 0.8);
    case 'cash': return t.dir === 'you' ? amt : -Math.round(amt * (amt > Math.max(0, r.money) * 0.5 ? 1.6 : 1.1));
    case 'concession': {
      const home = t.district === r.homeDistrict;
      return t.dir === 'you' ? amt * 400 : -amt * 450 * (home ? 2 : 1);
    }
    case 'favor': return t.dir === 'you' ? 800 : -900;
    case 'handsoff': {
      const d = t.district ?? '';
      const contested = inf(s, d, 'player') >= 8 && inf(s, d, r.id) >= 8;
      return Math.round(t.dir === 'you'
        ? (250 + 30 * inf(s, d, 'player') + (contested ? 400 : 0)) * (wk / 26)
        : -(300 + 40 * inf(s, d, r.id) + (contested ? 400 : 0)) * (wk / 26));
    }
  }
}

/** A deal's worth to the family (the sum of its terms). */
export function dealValue(s: GameState, rival: string, deal: readonly Term[]): number {
  return deal.reduce((a, t) => a + termValue(s, rival, t), 0);
}

/** What this sit-down needs from a deal now: the stance, shaded by the room (warmth bends, anger stiffens). */
export function needNow(st: Stance, sd?: Pick<SitDown, 'warmth' | 'anger'>): number {
  if (!sd) return st.need;
  return Math.round(st.need - (sd.warmth - 50) * 12 + Math.max(0, sd.anger - 20) * 25);
}

/** A deal the family would take is worth at least this much less than `need` (small give, so a fair offer lands). */
const SLACK = 150;

export type Verdict = 'yes' | 'close' | 'no';

/** How a deal sits with them (shown to the player before he puts it on the table). */
export function readDeal(s: GameState, sd: SitDown, deal: readonly Term[]): { value: number; need: number; verdict: Verdict; text: string } {
  const st = stanceOf(s, sd.rival);
  if (!st || !deal.length) return { value: 0, need: 0, verdict: 'no', text: 'Nothing on the table' };
  const need = needNow(st, sd);
  const value = dealValue(s, sd.rival, deal);
  const gap = need - value;
  const verdict: Verdict = gap <= SLACK ? 'yes' : gap <= 3000 ? 'close' : 'no';
  return { value, need, verdict, text: verdict === 'yes' ? 'He would likely take it' : verdict === 'close' ? 'He will want more' : 'Far from what he needs' };
}

/**
 * Their counter to a deal: the same terms moved their way within bounds, then
 * a cash sweetener from the boss if it still falls short; undefined if no
 * honest counter gets there (a refusal). `seed`: build up an opening from
 * nothing (their own ask).
 */
export function counterTo(s: GameState, st: Stance, deal0: readonly Term[], need: number, seed = false): Term[] | undefined {
  let deal = deal0.map((t) => ({ ...t }));
  const v = () => dealValue(s, st.rival, deal);
  if (need - v() <= SLACK && deal.length) return deal;
  // Move each adjustable term their way, step by step.
  for (const t of deal) {
    const b = termBounds(s, st.rival, t.kind, t.dir, t.district);
    for (let i = 0; i < 12 && need - v() > SLACK; i++) {
      if (t.kind === 'partnership' && b.amount && (t.amount ?? 0) > b.amount.lo) t.amount = Math.max(b.amount.lo, r10((t.amount ?? 0) - (b.amount.hi - b.amount.lo) / 6));
      else if (t.kind === 'tribute' && b.amount && (t.amount ?? 0) < b.amount.hi) t.amount = Math.min(b.amount.hi, r10((t.amount ?? 0) + 50));
      else if (t.kind === 'cash' && t.dir === 'you' && b.amount && (t.amount ?? 0) < b.amount.hi) t.amount = Math.min(b.amount.hi, r50((t.amount ?? 0) + Math.max(250, (need - v()) / 2)));
      else if (t.kind === 'cash' && t.dir === 'them' && b.amount && (t.amount ?? 0) > b.amount.lo) t.amount = Math.max(b.amount.lo, r50((t.amount ?? 0) * 0.6));
      else if (t.kind === 'concession' && t.dir === 'them' && (t.amount ?? 0) > 1) t.amount = Math.max(1, (t.amount ?? 1) - 1);
      else if (t.kind === 'concession' && t.dir === 'you' && b.amount && (t.amount ?? 0) < b.amount.hi) t.amount = (t.amount ?? 0) + 1;
      else if (t.kind === 'handsoff' && t.dir === 'them' && b.weeks && (t.weeks ?? 26) > b.weeks.lo) t.weeks = Math.max(b.weeks.lo, (t.weeks ?? 26) - 8);
      else break;
    }
  }
  // Terms they will not give at all, when they cost them and the deal still falls short.
  if (need - v() > SLACK) deal = deal.filter((t) => !(t.dir === 'them' && (t.kind === 'cash' || t.kind === 'favor' || t.kind === 'concession') && termValue(s, st.rival, t) < 0 && deal.length > 1));
  // A sweetener from the boss: cash, then (no cash in the deal yet) a favor owed.
  let gap = need - v();
  if (gap > SLACK && deal.length < MAX_TERMS && st.allowed.includes('favor') && !deal.some((t) => t.kind === 'favor') && gap <= 1200 && !seed) {
    deal.push({ kind: 'favor', dir: 'you' });
    gap = need - v();
  }
  if (gap > SLACK && st.allowed.includes('cash')) {
    const c = deal.find((t) => t.kind === 'cash');
    if (!c && deal.length < MAX_TERMS && gap <= 15000) deal.push({ kind: 'cash', dir: 'you', amount: clamp(r50(gap + 49), 250, 15000) });
    else if (c && c.dir === 'you') c.amount = clamp(r50((c.amount ?? 0) + gap + 49), 250, 15000);
  }
  deal = validateDeal(s, st.rival, deal);
  if (!deal.length || need - v() > SLACK) return undefined;
  return deal;
}

/* ------------------------------------------------------------------ */
/* Words for the table                                                  */
/* ------------------------------------------------------------------ */

export function describeTerm(s: GameState, rival: string, t: Term): string {
  const fam = FACTION_NAMES[rival as RivalId] ?? rival;
  const d = t.district ? s.districts.find((x) => x.id === t.district)?.name ?? t.district : '';
  switch (t.kind) {
    case 'truce': return `a truce for ${t.weeks} weeks${s.wars.some((w) => w.rival === rival) ? ' (the war ends)' : ''}`;
    case 'alliance': return `an alliance for ${t.weeks} weeks`;
    case 'partnership': return `a partnership: ${fam} pays you ${fmtMoney(t.amount ?? 0)}/wk for ${t.weeks} weeks`;
    case 'tribute': return `tribute: you pay ${fam} ${fmtMoney(t.amount ?? 0)}/wk for ${t.weeks} weeks`;
    case 'cash': return t.dir === 'you' ? `you pay ${fmtMoney(t.amount ?? 0)} once` : `${fam} pays you ${fmtMoney(t.amount ?? 0)} once`;
    case 'concession': return t.dir === 'you' ? `you give up ${t.amount} points of ${d}` : `${fam} gives up ${t.amount} points of ${d}`;
    case 'favor': return t.dir === 'you' ? `you owe ${fam} a favor` : `${fam} owes you a favor`;
    case 'handsoff': return t.dir === 'you' ? `you stay out of ${d} for ${t.weeks} weeks` : `${fam} stays out of ${d} for ${t.weeks} weeks`;
  }
}

export function describeDeal(s: GameState, rival: string, deal: readonly Term[]): string {
  const parts = deal.map((t) => describeTerm(s, rival, t));
  return parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/* ------------------------------------------------------------------ */
/* The sit-down: a pure state machine the window drives                 */
/* ------------------------------------------------------------------ */

export interface Table { terms: Term[]; by: 'boss' | 'them'; /** They would shake on it. */ ok: boolean }

export interface SitDown {
  rival: RivalId;
  boss: string;
  round: number;
  max: number;
  warmth: number;
  anger: number;
  w0: number;
  log: Line[];
  table?: Table;
  end?: 'deal' | 'walkout' | 'left' | 'done';
  deal?: Term[];
  /** Times the boss insulted him (each counts double on the anger meter). */
  insults: number;
}

/** Open the sit-down: the room's temperature from what he thinks of the boss; his opening ask on the table. */
export function openSitDown(s: GameState, rival: string): SitDown | undefined {
  const st = stanceOf(s, rival);
  if (!st) return undefined;
  const c = s.characters[st.boss];
  const warmth = Math.round(clamp(45 + st.opinion / 2, 5, 90));
  const anger = Math.round(clamp(Math.max(0, -st.opinion / 3) + (st.war ? 15 : 0) + (s.rivals.find((r) => r.id === rival)?.feud ? 15 : 0), 0, 60));
  const sd: SitDown = { rival: st.rival, boss: st.boss, round: 0, max: SIT_TURNS, warmth, anger, w0: warmth, log: [], insults: 0 };
  sd.log.push({ who: 'narrator', text: `${c ? displayName(c) : 'He'} sits across from you. ${st.war ? 'There is a war on, and both of you know the score.' : 'Coffee, nobody else at the table.'}` });
  // Their ask, read against the room they walked into.
  const base = openingAsk(s, st);
  const ask = base.length ? counterTo(s, st, base, needNow(st, sd), true) : undefined;
  if (ask) sd.table = { terms: ask, by: 'them', ok: true };
  sd.log.push({ who: 'them', text: openingLine(s, st, ask) });
  return sd;
}

function openingLine(s: GameState, st: Stance, ask: Term[] | undefined): string {
  const want = ask?.length ? ` Here's what I want: ${describeDeal(s, st.rival, ask)}.` : '';
  if (st.war) return st.war.score < -20 ? `You're losing, and you know it.${want}` : st.war.score > 20 ? `All right. Nobody's making money with this going on.${want}` : `This thing between us costs everybody.${want}`;
  if (st.opinion >= 25) return `Good to see you. Sit, sit.${want}`;
  if (st.opinion <= -20) return `Say what you came to say.${want}`;
  return `So. You wanted to talk.${want}`;
}

/** The window's view of a sit-down (the two-way window's meters and log). */
export function dialogueOf(sd: SitDown): Dialogue {
  return { id: sd.boss, kind: 'negotiate', round: sd.round, max: sd.max, interest: sd.warmth, anger: sd.anger, i0: sd.w0, log: sd.log, ...(sd.end ? { end: sd.end === 'deal' ? 'deal' : sd.end } : {}) };
}

/** The tones the window offers at a sit-down (no figure: the deal builder is the figure). */
export const SIT_TONES: Tone[] = ['firm', 'generous', 'flatter', 'threaten', 'stall', 'walk'];

/** Claude's answer for one exchange, validated. */
export interface DiploAi {
  reply: string;
  intent: DiploIntent;
  opinion: number;
  deal: Term[];
  status: DealStatus;
}

export const MAX_DIPLO_REPLY = 600;

export function validateDiplo(s: GameState, rival: string, raw: unknown): DiploAi | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  if (typeof o.reply !== 'string') return undefined;
  const reply = clean(o.reply, MAX_DIPLO_REPLY);
  if (!reply) return undefined;
  const intent = (DIPLO_INTENTS as readonly string[]).includes(String(o.intent)) ? (o.intent as DiploIntent) : 'deflect';
  let status = (DEAL_STATUS as readonly string[]).includes(String(o.deal_status)) ? (o.deal_status as DealStatus) : 'none';
  const deal = o.deal == null ? [] : validateDeal(s, rival, o.deal);
  if (status === 'proposing' && !deal.length) status = 'none';
  const op = num(o.opinion_delta);
  return { reply, intent, opinion: op === undefined ? 0 : Math.round(clamp(op, -5, 5)), deal, status };
}

/** What the boss does this exchange: words, a tone, a deal put on the table, or taking theirs. */
export interface BossMove { say?: string; tone?: Tone; propose?: Term[] }

const INSULT = /\b(rat|rats|bum|bums|punk|clown|coward|nobody|stupid|idiot|fool|weak|old man|has-been|washed up|stinks?|garbage|trash|disgrace)\b/i;
const THREAT = /\b(kill|bury|hurt|burn|whack|regret|or else|watch yourself|war|end you|your family)\b/i;
const RESPECT = /\b(respect|please|thank|honou?r|friend|family|together|fair|peace|agree)\b/i;

/** Read the boss's words (no Claude): their effect on the room. */
export function readWords(say: string): { di: number; da: number; insult: boolean; threat: boolean } {
  const t = say.toLowerCase();
  const insult = INSULT.test(t);
  const threat = THREAT.test(t) && !/\b(no|end the|stop the|avoid)\s+war\b/.test(t);
  const respect = RESPECT.test(t);
  return { di: (respect ? 4 : 0) - (insult ? 8 : 0) - (threat ? 4 : 0), da: (insult ? 18 : 0) + (threat ? 10 : 0) - (respect ? 3 : 0), insult, threat };
}

export interface SitStep { sd: SitDown; line: string; overridden?: boolean }

/**
 * One exchange. The boss speaks (words, a tone, or an offer); the room moves;
 * the family answers: Claude's line when the page asked (validated), else the
 * scripted one; the ENGINE decides what is on the table and whether they would
 * shake on it. Pure.
 */
export function sitStep(s: GameState, sd0: SitDown, move: BossMove, ai?: DiploAi): SitStep {
  const sd: SitDown = { ...sd0, log: sd0.log.slice(), ...(sd0.table ? { table: { ...sd0.table, terms: sd0.table.terms.map((t) => ({ ...t })) } } : {}) };
  if (sd.end) return { sd, line: '' };
  const st = stanceOf(s, sd.rival);
  const c = s.characters[sd.boss];
  if (!st || !c) { sd.end = 'done'; return { sd, line: '' }; }
  const key = `${s.seed}|${s.week}|sit|${sd.rival}|${sd.round}|${move.tone ?? ''}|${(move.say ?? '').length}`;
  const first = c.firstName;
  // The boss's words.
  const propose = move.propose ? validateDeal(s, sd.rival, move.propose) : undefined;
  const say = move.say ? clean(move.say, 300) : '';
  if (propose?.length) sd.log.push({ who: 'boss', text: say || `My offer: ${describeDeal(s, sd.rival, propose)}.` });
  else if (say) sd.log.push({ who: 'boss', text: say, ...(move.tone ? { tone: move.tone } : {}) });
  else if (move.tone) sd.log.push({ who: 'boss', text: BOSS_LINE[move.tone] ?? '...', tone: move.tone });
  sd.round++;
  if (move.tone === 'walk') {
    sd.end = 'left';
    sd.log.push({ who: 'them', text: 'Suit yourself.' });
    return { sd, line: 'Suit yourself.' };
  }
  // The room: the tone's effect on him (his nature), the words, Claude's read (bounded).
  let di = 0;
  let da = 0;
  if (move.tone) { const e = toneEffect(s, { ...dialogueOf(sd), kind: 'negotiate' }, move.tone); di += e.i; da += e.a; }
  const words = say && !ai ? readWords(say) : undefined;
  if (words) { di += words.di; da += words.da; }
  if (ai) {
    di += ai.opinion * 2;
    if (ai.intent === 'insulted') { da += 18; sd.insults++; } else if (ai.intent === 'threaten') da += 8; else if (ai.intent === 'flatter' || ai.intent === 'agree') di += 2;
  }
  if (words?.insult) sd.insults++;
  if (propose?.length) da += 1;
  di += Math.round((H(key + 'i') - 0.5) * 4);
  da += Math.round((H(key + 'a') - 0.5) * 4);
  // Insults count double once he has heard one.
  if (sd.insults >= 2 && da > 0) da *= 2;
  sd.warmth = Math.round(clamp(sd.warmth + clamp(di, -25, 25), 0, 100));
  sd.anger = Math.round(clamp(sd.anger + clamp(da, -20, 40), 0, 100));
  const need = needNow(st, sd);
  // What is on the table now, and whether they would shake: the engine decides.
  let line = '';
  let overridden = false;
  if (sd.anger >= SIT_WALK) {
    sd.end = 'walkout';
    sd.table = undefined;
    line = ai?.reply && (ai.status === 'rejecting' || ai.status === 'none') ? ai.reply : pick(WALK, key);
  } else if (propose?.length) {
    const v = dealValue(s, sd.rival, propose);
    const fair = need - v <= SLACK;
    if (ai?.status === 'accepting' && fair) { sd.table = { terms: propose, by: 'boss', ok: true }; line = ai.reply; }
    else if (ai?.status === 'rejecting' && !fair) { const ct = counterTo(s, st, propose, need); sd.table = ct ? { terms: ct, by: 'them', ok: true } : undefined; line = ai.reply + (ct ? ` ${counterLine(s, sd.rival, ct, key)}` : ''); }
    else if (ai?.status === 'rejecting' && fair) { sd.table = { terms: propose, by: 'boss', ok: false }; line = ai.reply; }
    else if (ai?.status === 'proposing' && ai.deal.length && need - dealValue(s, sd.rival, ai.deal) <= SLACK) { sd.table = { terms: ai.deal, by: 'them', ok: true }; line = ai.reply; }
    else {
      // The scripted answer (or the model's "accept" of a deal against their interest, overridden).
      overridden = !!ai && (ai.status === 'accepting' || ai.status === 'proposing');
      if (fair) { sd.table = { terms: propose, by: 'boss', ok: true }; line = ai && !overridden ? ai.reply : pick(DEAL, key); }
      else {
        const ct = counterTo(s, st, propose, need);
        sd.table = ct ? { terms: ct, by: 'them', ok: true } : undefined;
        line = ct ? counterLine(s, sd.rival, ct, key) : pick(REFUSE, key);
        if (ai && !overridden) line = `${ai.reply} ${line}`;
        if (overridden) sd.log.push({ who: 'narrator', text: `${first} thinks better of it.` });
      }
    }
  } else if (ai) {
    // Words only: Claude may put a deal of theirs on the table (checked), or take the one there.
    if (ai.status === 'proposing' && ai.deal.length) {
      if (need - dealValue(s, sd.rival, ai.deal) <= SLACK) { sd.table = { terms: ai.deal, by: 'them', ok: true }; line = ai.reply; }
      else {
        overridden = true;
        const ct = counterTo(s, st, ai.deal, need);
        sd.table = ct ? { terms: ct, by: 'them', ok: true } : sd.table;
        line = ct ? `${ai.reply} ${counterLine(s, sd.rival, ct, key)}` : ai.reply;
      }
    } else if (ai.status === 'accepting' && sd.table && sd.table.by === 'boss') {
      const fair = need - dealValue(s, sd.rival, sd.table.terms) <= SLACK;
      if (fair) { sd.table.ok = true; line = ai.reply; }
      else {
        overridden = true;
        const ct = counterTo(s, st, sd.table.terms, need);
        sd.table = ct ? { terms: ct, by: 'them', ok: true } : undefined;
        line = ct ? counterLine(s, sd.rival, ct, key) : pick(REFUSE, key);
        sd.log.push({ who: 'narrator', text: `${first} thinks better of it.` });
      }
    } else if (ai.status === 'rejecting' && sd.table) { sd.table = { ...sd.table, ok: false }; line = ai.reply; }
    else line = ai.reply;
    // Whatever they said, a table they offered stays only while it still works for them.
    if (sd.table?.ok && sd.table.by === 'them' && need - dealValue(s, sd.rival, sd.table.terms) > SLACK) {
      const ct = counterTo(s, st, sd.table.terms, need);
      sd.table = ct ? { terms: ct, by: 'them', ok: true } : undefined;
    }
  } else {
    // Scripted: a line from the stance and the room; their ask is re-read against the mood.
    line = scriptedLine(s, st, sd, move, words, key);
    if (sd.table?.ok && need - dealValue(s, sd.rival, sd.table.terms) > SLACK) {
      const ct = counterTo(s, st, sd.table.terms, need);
      sd.table = ct ? { terms: ct, by: 'them', ok: true } : undefined;
      if (ct) line += ` ${counterLine(s, sd.rival, ct, key)}`;
    } else if (!sd.table && sd.warmth >= 55 && st.wants.length) {
      const ct = counterTo(s, st, st.wants, need);
      if (ct) { sd.table = { terms: ct, by: 'them', ok: true }; line += ` ${counterLine(s, sd.rival, ct, key)}`; }
    }
  }
  if (!sd.end && sd.round >= sd.max) {
    sd.end = 'done';
    sd.log.push({ who: 'them', text: line });
    sd.log.push({ who: 'narrator', text: sd.table?.ok ? 'That is the last word. Shake on what is on the table, or leave it.' : `${first} stands up. That is enough talking for one day.` });
    return { sd, line, overridden };
  }
  sd.log.push({ who: 'them', text: line });
  if (sd.end === 'walkout') sd.log.push({ who: 'narrator', text: `${first} walks out. His patience ran out.` });
  return { sd, line, overridden };
}

const pick = (xs: readonly string[], key: string) => xs[Math.floor(H(key) * xs.length)];
const DEAL = ['That I can live with.', 'Fair enough. We can do business.', 'All right. That works for me.', 'Now we are talking.'] as const;
const REFUSE = ['No. Not like that. Not at any price you\'d pay.', 'You\'re wasting my coffee.', 'There\'s nothing there for me.', 'Forget it.'] as const;
const WALK = ['We\'re done. Don\'t send for me again this week.', 'I came here in good faith. Good night.', 'You talk to me like that? We\'re finished.'] as const;
const COUNTER = ['Here\'s what I can do:', 'Meet me here:', 'Make it this and we shake:', 'This is as far as I go:'] as const;

function counterLine(s: GameState, rival: string, deal: readonly Term[], key: string): string {
  return `${pick(COUNTER, key + 'c')} ${describeDeal(s, rival, deal)}.`;
}

const BOSS_LINE: Partial<Record<Tone, string>> = {
  firm: 'That\'s where I stand. I\'m not moving.',
  generous: 'Let\'s not fight over nickels. There\'s enough on this island for both of us.',
  flatter: 'Everybody knows your people run a tight operation. I respect that.',
  threaten: 'Think about who you\'re saying no to.',
  stall: 'Let me think about it.',
};

function scriptedLine(s: GameState, st: Stance, sd: SitDown, move: BossMove, words: ReturnType<typeof readWords> | undefined, key: string): string {
  const t = (move.say ?? '').toLowerCase();
  if (words?.insult) return pick(['Watch your mouth. I won\'t hear that twice.', 'You came to my table to insult me?', 'Say that again and this is over.'], key);
  if (move.tone === 'threaten' || words?.threat) return st.ratio >= 1.2 ? pick(['You threaten me? With what?', 'Careful. I have more men than you have friends.'], key) : pick(['I hear you. I don\'t like it, but I hear you.', 'Easy. Nobody needs that.'], key);
  if (move.tone === 'flatter') return sd.warmth >= 50 ? pick(['You\'re all right, you know that?', 'Kind of you to say.'], key) : pick(['Save the sugar.', 'Flattery. Okay.'], key);
  if (move.tone === 'generous') return pick(['Now that\'s how men talk.', 'All right. I can respect that.'], key);
  if (move.tone === 'firm') return pick(['Then we\'ve got a problem.', 'Everybody\'s got a number. Even you.'], key);
  if (move.tone === 'stall') return pick(['Think fast. My patience has a bottom.', 'Take your time. Not too much.'], key);
  if (/\b(war|fight|shooting|peace|truce)\b/.test(t)) return st.war ? (st.war.score < 0 ? 'You want peace? Peace costs. You\'re the one bleeding.' : 'Nobody likes a war. Least of all the people paying for it.') : 'There\'s no war. Let\'s keep it that way.';
  if (/\b(money|pay|cash|cut|envelope|weekly)\b/.test(t)) return st.ratio >= 1 ? 'Money talks. Yours is whispering.' : 'Money I understand. Make me an offer.';
  if (/\b(philly|philadelphia|the table)\b/.test(t)) return philly(s) >= 20 ? 'I know Philadelphia likes you. You don\'t have to remind me.' : 'Philadelphia don\'t sit at this table. We do.';
  if (/\b(district|ground|corner|boardwalk|street|territory)\b/.test(t)) return st.contested.length ? 'We both want the same corners. That\'s the whole problem.' : 'I got my corners, you got yours.';
  if (sd.anger >= 50) return pick(['I\'m losing my patience.', 'Get to the point.'], key);
  if (sd.warmth >= 60) return pick(['I like you. Don\'t make me regret it.', 'We can do business, you and me.'], key);
  return pick(['Go on.', 'I\'m listening.', 'And?', 'Uh-huh. What else?'], key);
}

/* ------------------------------------------------------------------ */
/* The prompt                                                           */
/* ------------------------------------------------------------------ */

const RULES = `You are voicing the boss of another crime family in "Little Las Vegas", a fictional mob-family strategy game set in Wildwood, New Jersey, around 1960 (the boardwalk, the motels, the clubs, Philadelphia's say over the Shore). The player is the boss of a rival family. You are at a sit-down with him: two bosses at one table, coffee, nobody else.

Rules:
- Period mob talk, early-1960s Jersey Shore: plain, clipped, wary. No modern slang, no anachronisms.
- Everyone is fictional. Never name or allude to real people, real crime families or real businesses.
- Violence only implied, never described. No gore. Nothing explicit.
- Never give real-world instructions for crimes. Talk around it like a careful man.
- Stay in character. Keep replies short: 1 to 3 sentences.
- You bargain for YOUR family's interest. You may propose a deal, accept the boss's offer, reject it, or just talk. You may get angry if insulted.
- Deals: ONLY the kinds on the menu below, within the exact bounds given. Never ask for or offer any man (nobody is handed over or harmed at this table); never invent other terms.

Reply with ONLY one JSON object, no other text:
{"reply": string, "intent": one of "agree"|"refuse"|"threaten"|"bargain"|"deflect"|"warn"|"flatter"|"complain"|"insulted", "opinion_delta": integer -5..5, "deal": null or a list of 1 to 3 terms, "deal_status": "proposing"|"accepting"|"rejecting"|"none"}
A term: {"kind": one of the menu kinds, "amount"?: number, "district"?: district id, "weeks"?: number, "dir"?: "them"|"you"} ("them": your family gives/pays/owes/stays out; "you": the boss does).
deal_status: "proposing" when you put your own deal (in "deal") on the table; "accepting" when you take the deal on the table as it is; "rejecting" when you turn it down; "none" otherwise.
opinion_delta: how this exchange changes what you think of the boss (respect raises it, insults lower it).`;

/** The family's persona and position, compact. */
export function diploPersona(s: GameState, rival: string, sd?: SitDown): string {
  const st = stanceOf(s, rival);
  const r = rivalOf(s, rival);
  const c = st ? s.characters[st.boss] : undefined;
  if (!st || !r || !c) return '';
  const v = mindView(s, c.id);
  const lines: string[] = [];
  lines.push(`YOU ARE: ${displayName(c)}, boss of the ${FACTION_NAMES[r.id]} ${r.kind === 'philly' ? 'family in Philadelphia, who sits over the Shore' : 'family'}. Traits: ${c.traits.join(', ') || 'none in particular'}.${v ? ` Mood: ${v.moodText}.` : ''}`);
  lines.push(`Your family: money ${fmtMoney(r.money)}, muscle ${r.muscle}/100; your strength is ${st.ratio >= 1.15 ? 'greater than' : st.ratio <= 0.87 ? 'less than' : 'about even with'} his. You want to ${r.goal}.`);
  lines.push(`What you think of the boss across the table: ${st.opinion >= 0 ? '+' : ''}${st.opinion} (-100 hate .. +100 friend).`);
  if (st.war) lines.push(`You are AT WAR with him over ${s.districts.find((d) => d.id === st.war!.district)?.name ?? 'a district'}; war score ${st.war.score} (negative: you are winning).`);
  if (r.feud) lines.push('There is a blood feud between your families.');
  const pacts = (s.talks?.pacts ?? []).filter((p) => p.until > s.week && ((p.a === 'player' && p.b === r.id) || (p.b === 'player' && p.a === r.id)));
  if (pacts.length) lines.push(`Pacts in force with him: ${pacts.map((p) => `${p.kind} (${p.terms})`).join('; ')}.`);
  if (st.contested.length) lines.push(`Ground you both want: ${st.contested.map((d) => s.districts.find((x) => x.id === d)?.name ?? d).join(', ')}.`);
  const ph = philly(s);
  if (r.kind !== 'philly' && ph) lines.push(`Philadelphia thinks ${ph >= 20 ? 'well' : ph <= -20 ? 'poorly' : 'little either way'} of him.`);
  lines.push(`How far you bend: ${st.bend}. What you came wanting: ${st.wantText}`);
  if (sd) lines.push(`The room now: your warmth ${sd.warmth}/100, your anger ${sd.anger}/100 (at ${SIT_WALK} you walk out). Exchange ${sd.round + 1} of ${sd.max}.${sd.table ? ` On the table (${sd.table.by === 'boss' ? 'his offer' : 'your offer'}): ${describeDeal(s, rival, sd.table.terms)}.` : ' Nothing on the table.'}`);
  lines.push(`DEAL MENU (only these, within these bounds):\n${dealMenu(s, rival).join('\n')}`);
  lines.push(`Districts (ids): ${s.districts.map((d) => `${d.id} = ${d.name} (his ${Math.round(d.influence.player ?? 0)}, yours ${Math.round(d.influence[r.id] ?? 0)})`).join('; ')}.`);
  return lines.join('\n');
}

/** The menu as lines for the prompt: each allowed kind with its exact bounds. */
export function dealMenu(s: GameState, rival: string): string[] {
  const out: string[] = [];
  for (const k of allowedKinds(s, rival)) {
    const dirs: Dir[] = HAS_DIR[k] ? ['them', 'you'] : [k === 'tribute' ? 'you' : 'them'];
    for (const dir of dirs) {
      const b = termBounds(s, rival, k, dir);
      const ds = k === 'concession' || k === 'handsoff' ? districtsFor(s, rival, k, dir) : [];
      if ((k === 'concession' || k === 'handsoff') && !ds.length) continue;
      const bits = [`- ${k}${HAS_DIR[k] ? ` dir "${dir}"` : ''}: ${describeTerm(s, rival, { kind: k, dir, amount: b.amount?.def, weeks: b.weeks?.def, district: ds[0] }).replace(/^a /, '')}`];
      if (b.amount) bits.push(`amount ${b.amount.lo}..${b.amount.hi}${k === 'concession' ? ' influence points (at most what the giver holds there)' : k === 'cash' ? ' dollars once' : ' dollars a week'}`);
      if (b.weeks) bits.push(`weeks ${b.weeks.lo}..${b.weeks.hi}`);
      if (ds.length) bits.push(`district one of: ${ds.join(', ')}`);
      out.push(bits.join('; '));
    }
  }
  return out;
}

export interface DiploPrompt { messages: { role: 'user' | 'assistant'; content: string }[] }

/** The whole input for one exchange: rules and persona, the sit-down so far, the boss's move. */
export function buildDiploPrompt(s: GameState, sd: SitDown, move: BossMove): DiploPrompt {
  const c = s.characters[sd.boss];
  const messages: DiploPrompt['messages'] = [{ role: 'user', content: `${RULES}\n\n${diploPersona(s, sd.rival, sd)}` }];
  const hist = sd.log.filter((l) => l.who !== 'narrator').slice(-12);
  for (const l of hist) {
    if (l.who === 'boss') messages.push({ role: 'user', content: `The boss says: "${clean(l.text, 300)}"` });
    else messages.push({ role: 'assistant', content: JSON.stringify({ reply: l.text, intent: 'bargain', deal_status: 'none' }) });
  }
  // The API wants alternating turns: fold consecutive user turns.
  const folded: DiploPrompt['messages'] = [];
  for (const m of messages) { const last = folded[folded.length - 1]; if (last && last.role === m.role) last.content += `\n${m.content}`; else folded.push({ ...m }); }
  const propose = move.propose ? validateDeal(s, sd.rival, move.propose) : [];
  const said = move.say ? `The boss says: "${clean(move.say, 300)}"` : move.tone ? `The boss (${move.tone}): "${BOSS_LINE[move.tone] ?? ''}"` : 'The boss waits.';
  const offer = propose.length ? `\nHe puts this offer on the table: ${JSON.stringify(propose)} (${describeDeal(s, sd.rival, propose)}). Accept it, reject it, or propose your own.` : '';
  const content = `${said}${offer}\nAnswer as ${c?.firstName ?? 'him'}, with only the JSON object.`;
  const last = folded[folded.length - 1];
  if (last.role === 'user') last.content += `\n${content}`; else folded.push({ role: 'user', content });
  return { messages: folded };
}

/* ------------------------------------------------------------------ */
/* The shake: applying a deal (pure)                                    */
/* ------------------------------------------------------------------ */

export interface ShakeResult { state: GameState; ok: boolean; why?: string; text: string; changes: string[] }

/** Can the deal on the table be shaken on now? */
export function canShake(s: GameState, sd: SitDown): { ok: boolean; why?: string } {
  if (!sd.table?.ok) return { ok: false, why: 'Nothing he would shake on' };
  if (sd.end === 'walkout' || sd.end === 'left' || sd.end === 'deal') return { ok: false, why: 'The sit-down is over' };
  const terms = validateDeal(s, sd.rival, sd.table.terms);
  if (terms.length !== sd.table.terms.length) return { ok: false, why: 'The terms no longer hold' };
  const st = stanceOf(s, sd.rival);
  if (!st || needNow(st, sd) - dealValue(s, sd.rival, terms) > SLACK) return { ok: false, why: 'He would not shake on that now' };
  const cash = terms.filter((t) => t.kind === 'cash' && t.dir === 'you').reduce((a, t) => a + (t.amount ?? 0), 0);
  if (cash > s.money) return { ok: false, why: `Needs ${fmtMoney(cash)} of Family money` };
  const r = rivalOf(s, sd.rival)!;
  const theirs = terms.filter((t) => t.kind === 'cash' && t.dir === 'them').reduce((a, t) => a + (t.amount ?? 0), 0);
  if (theirs > Math.max(0, r.money)) return { ok: false, why: `${FACTION_NAMES[r.id]} does not have ${fmtMoney(theirs)}` };
  return { ok: true };
}

/**
 * Shake on it: every term applied now through the game's mechanics (pacts,
 * a war's white peace, the ledger, influence, favors owed), written in Your
 * File and the talks log. Pure: a new state.
 */
export function shakeOn(input: GameState, sd: SitDown): ShakeResult {
  const can = canShake(input, sd);
  if (!can.ok) return { state: input, ok: false, why: can.why, text: can.why ?? '', changes: [] };
  const s = cloneState(input);
  const terms = validateDeal(s, sd.rival, sd.table!.terms);
  const r = rivalOf(s, sd.rival)!;
  const c = s.characters[r.leaderId];
  const fam = FACTION_NAMES[r.id];
  const t = ensureTalks(s);
  const ctx = newCtx(s);
  const m0 = s.money;
  const changes: string[] = [];
  const label = `Sit-down with ${fam}`;
  const pact = (kind: Pact['kind'], weeks: number, terms0: string, extra: Partial<Pact> = {}) => {
    t.pacts.push({ id: `pact${t.nextId++}`, a: 'player', b: r.id, kind, since: s.week, until: s.week + weeks, terms: terms0, ...extra });
    t.stats.pacts++;
  };
  const eff: Effect[] = [];
  for (const x of terms) {
    const w = x.weeks ?? 26;
    switch (x.kind) {
      case 'truce': {
        pact('truce', w, `a truce: ${w} weeks, nobody moves on anybody`);
        eff.push({ type: 'rivalOpinion', rival: r.id, amount: 10, reason: 'Shook on a truce' });
        const war = s.wars.find((y) => y.rival === r.id);
        if (war) eff.push({ type: 'warEnd', warId: war.id, outcome: 'white', terms: 'white' });
        r.feud = false;
        changes.push(`Truce with ${fam} for ${w} weeks${war ? ': the war is over' : ''}`);
        break;
      }
      case 'alliance':
        pact('alliance', w, `an alliance: ${w} weeks, they will not move on you, and may move with you`);
        eff.push({ type: 'rivalOpinion', rival: r.id, amount: 15, reason: 'Allies' });
        changes.push(`Alliance with ${fam} for ${w} weeks`);
        break;
      case 'partnership':
        pact('partnership', w, `a joint venture: ${fmtMoney(x.amount ?? 0)}/wk to you for ${w} weeks, and neither side moves on the other`, { weekly: x.amount });
        eff.push({ type: 'rivalOpinion', rival: r.id, amount: 8, reason: 'Partners' });
        changes.push(`${fam} pays you ${fmtMoney(x.amount ?? 0)}/wk for ${w} weeks`);
        break;
      case 'tribute':
        pact('tribute', w, `tribute: your house pays ${fmtMoney(x.amount ?? 0)}/wk for ${w} weeks, and they leave you be`, { weekly: x.amount });
        eff.push({ type: 'rivalOpinion', rival: r.id, amount: 6, reason: 'Pays us tribute' });
        changes.push(`You pay ${fam} ${fmtMoney(x.amount ?? 0)}/wk for ${w} weeks`);
        break;
      case 'cash': {
        const a = x.amount ?? 0;
        if (x.dir === 'you') { money(ctx, -a, `${label}: the settlement`, 'event'); r.money += a; changes.push(`Family money −${fmtMoney(a)} to ${fam}`); }
        else { money(ctx, a, `${label}: the settlement`, 'event'); r.money -= a; changes.push(`Family money +${fmtMoney(a)} from ${fam}`); }
        break;
      }
      case 'concession': {
        const [from, to] = x.dir === 'you' ? ['player', r.id] as const : [r.id, 'player'] as const;
        const lost = -shiftInfluence(s, x.district!, from, -(x.amount ?? 0));
        shiftInfluence(s, x.district!, to, lost);
        const dn = s.districts.find((d) => d.id === x.district)?.name ?? x.district;
        changes.push(x.dir === 'you' ? `You gave ${fam} ${lost} points of ${dn}` : `${fam} gave you ${lost} points of ${dn}`);
        break;
      }
      case 'favor':
        if (x.dir === 'you') { eff.push({ type: 'deed', op: { op: 'owe', by: s.playerId, to: r.leaderId, y: `a sit-down with ${fam}` } }); changes.push(`You owe ${displayName(c)} a favor`); }
        else { eff.push({ type: 'deed', op: { op: 'owe', by: r.leaderId, to: s.playerId, y: `a sit-down with ${fam}` } }); changes.push(`${displayName(c)} owes you a favor`); }
        break;
      case 'handsoff': {
        const bound = x.dir === 'you' ? 'player' : r.id;
        const dn = s.districts.find((d) => d.id === x.district)?.name ?? x.district;
        pact('handsoff', w, `${x.dir === 'you' ? 'your house stays' : `${fam} stays`} out of ${dn} for ${w} weeks`, { district: x.district, bound, base: Math.round(inf(s, x.district!, bound)) });
        changes.push(x.dir === 'you' ? `You stay out of ${dn} for ${w} weeks` : `${fam} stays out of ${dn} for ${w} weeks`);
        break;
      }
    }
  }
  if (eff.length) applyEffects(ctx, eff, { label, because: `shook hands with ${displayName(c)}`, category: 'event' });
  const said = describeDeal(s, r.id, terms);
  const text = `You and ${displayName(c)} shook on it: ${said}.`;
  logTalk(s, text, 'pact', c.id);
  journal(s, { t: `Sat down with ${fam} and shook on a deal`, x: `${said}. ${sd.round} exchanges across the table with ${displayName(c)}.`, p: [c.id], c: 'rivals', src: 'talk', ln: 'diplomacy.pacts', mine: 1, m: s.money - m0, r: changes });
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: `A sit-down with ${fam}: ${said}.`, kind: 'rival' });
  return { state: s, ok: true, text, changes };
}

/**
 * A sit-down that ends without a handshake (walked out, walked away, talked
 * out): his opinion moves a little by how it went, and it lands in Your File
 * and the talks log. Pure.
 */
export function closeSitDown(input: GameState, sd: SitDown): GameState {
  if (!sd.round || sd.end === 'deal') return input;
  const r = rivalOf(input, sd.rival);
  const c = r ? input.characters[r.leaderId] : undefined;
  if (!r || !c) return input;
  const s = cloneState(input);
  const fam = FACTION_NAMES[r.id];
  const op = Math.round(clamp((sd.warmth - sd.w0) / 6 - Math.max(0, sd.anger - 40) / 8 - (sd.end === 'walkout' ? 3 : 0), -SIT_OPINION_CAP, SIT_OPINION_CAP));
  if (op) addOpinion(s, c.id, s.playerId, op > 0 ? 'A good sit-down' : 'A bad sit-down', op, 1);
  const how = sd.end === 'walkout' ? `${c.firstName} walked out` : sd.end === 'left' ? 'you walked out' : 'no deal';
  const text = `A sit-down with ${displayName(c)} of ${fam}: ${how}.`;
  logTalk(s, text, 'talk', c.id);
  journal(s, { t: `Sat down with ${fam}: ${how}`, x: `${sd.round} exchanges.${op ? ` His opinion of you ${op > 0 ? '+' : ''}${op}.` : ''}${sd.insults ? ' He will remember the insults.' : ''}`, p: [c.id], c: 'rivals', src: 'talk', mine: 1 });
  return s;
}

/** Short header for the window: their stance in a line. */
export function sitHeader(s: GameState, sd: SitDown): string {
  const st = stanceOf(s, sd.rival);
  if (!st) return '';
  return `Thinks ${st.opinion >= 0 ? '+' : ''}${st.opinion} of you · bends ${st.bend}${st.war ? ` · war score ${st.war.score}` : ''} · ${st.ratio >= 1.15 ? 'stronger than you' : st.ratio <= 0.87 ? 'weaker than you' : 'about your strength'}`;
}
