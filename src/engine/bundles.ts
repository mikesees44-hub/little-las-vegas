import { previewAction, queuedMoney } from './actions';
import { envelopeOff } from './attention';
import { weekCheckIns } from './checkins';
import { daysOf } from './days';
import { alwaysOn, consiglierePick, counselor, delegatedAsk, delegationLevel, notRoutine, SMALL_MONEY } from './delegation';
import { eventsOut } from './eventDays';
import { hows, openPitches, pitchById, type PitchHow } from './eat';
import { capoLevelOf } from './lieutenants';
import { displayName } from './characters';
import type { Effect, GameState, PlayerAction } from './types';

/**
 * BUNDLED DECISIONS and "HANDLE THE WEEK FOR ME" (STREAMLINE_2 addendum, owner 2026-11-04: "make the game
 * easier but don't eliminate the options").
 *
 * Every small open item of the week (a decision, a capo's morning problem, a man's pitch, the envelope) as
 * one row with ALL its answers, the one his people would pick already chosen, its cost and odds, and, when
 * it is not routine, why it stays the boss's. Same-kind routine items become one bundle ("Settle all 3 the
 * consigliere's way"), each row still overridable; "Handle the week" settles every routine item at once.
 *
 * Nothing new is decided here: every answer is one the item's own screen offers, given through the same
 * path (the decision's answer, the capo's check-in answer, the pitch's order), so it costs, rolls and lands
 * in Your File exactly as if the boss had tapped it there. Pure: reads the state and the UI's unsent answers.
 */

export type BundleKind = 'asks' | 'mornings' | 'pitches' | 'envelope';

/** How an answer is given: the same three paths the single items use. */
export type SettleAnswer =
  | { kind: 'event'; iid: string; choiceId: string }
  | { kind: 'checkin'; key: string; answer: string }
  | { kind: 'order'; action: PlayerAction };

export interface SettleOption {
  id: string;
  label: string;
  /** Money out (positive: a cost). */
  cost: number;
  /** The chance it comes off (0..1), when there are dice. */
  odds?: number;
  disabled?: string;
  answer: SettleAnswer;
}

export interface SettleItem {
  /** The Desk's key for the subject ("ev:<iid>", "am:<key>", "pitch:<id>", "envelope"). */
  key: string;
  kind: BundleKind;
  title: string;
  /** Whom it is about. */
  charId?: string;
  options: SettleOption[];
  /** The option his people would pick (the consigliere's, the capo's own way, the underboss's split). */
  pick: string;
  /** Who picks it ("Tommy", "each capo"). */
  by: string;
  /** Why it stays the boss's (undefined: routine, his people may settle it). */
  yours?: string;
  /** A standing order already hands it off (delegation): settled for him if he does nothing. */
  delegated?: boolean;
}

export interface SettleUi {
  answers?: Record<string, string>;
  orders?: readonly PlayerAction[];
  /** Keys the boss took back this week: always his. */
  taken?: readonly string[];
}

export interface Bundle {
  kind: BundleKind;
  title: string;
  by: string;
  items: SettleItem[];
  /** Money out if every pick stands. */
  cost: number;
  /** Plain odds summary ("2 sure things, 1 on the dice at 64%"). */
  odds: string;
}

const KIND_TITLE: Record<BundleKind, string> = { asks: 'small asks', mornings: "capos' morning requests", pitches: "your men's pitches", envelope: 'the envelope' };

/** Effects that put a man of the boss's in the ground, inside, out of town or in someone else's hands. */
const MAN_FX = new Set<string>(['kill', 'imprison', 'exile', 'faction', 'flip', 'retire', 'rank']);
export function touchesAMan(effs: readonly Effect[]): boolean {
  return effs.some((e) => MAN_FX.has(e.type) || (e.type === 'health' && (e as { amount: number }).amount <= -40));
}

/** The money ceiling a routine item may cost, by the boss's delegation level (Hands-on: less goes without him). */
export function settleLimit(s: GameState): number {
  return delegationLevel(s) === 'hands' ? 1000 : SMALL_MONEY;
}

const moneyOut = (effs: readonly Effect[]) => Math.max(0, -effs.reduce((a, e) => a + (e.type === 'money' ? (e as { amount: number }).amount : 0), 0));
const lc1 = (x: string) => `${x.charAt(0).toLowerCase()}${x.slice(1)}`;
const sameAct = (a: PlayerAction, b: PlayerAction) => JSON.stringify({ ...a, fund: undefined }) === JSON.stringify({ ...b, fund: undefined });

/** The consigliere's answer to a man's pitch: the best expected return he can afford, else "no" (never a big stake). */
export function pitchPick(s: GameState, pid: string): PitchHow | undefined {
  const p = pitchById(s, pid);
  if (!p) return undefined;
  const limit = settleLimit(s);
  let best: { how: PitchHow; v: number } | undefined;
  for (const how of hows(p)) {
    if (how === 'no') continue;
    const pv = previewAction(s, { kind: 'mymen', op: { op: 'pitch', pitch: pid, how } } as PlayerAction);
    if (pv.disabledReason) continue;
    const cost = pv.cost ?? 0;
    if (cost > limit) continue;
    const chance = pv.odds?.chance ?? 1;
    // A racket ask or a place has no money in the odds: putting the man on it is the point.
    const v = p.kind === 'racket' || p.kind === 'place' ? (how === 'back' ? 100 : 50) : chance * (p.stake * p.ret + (how === 'join' ? p.stake * 0.3 : 0)) - (1 - chance) * cost;
    if (!best || v > best.v) best = { how, v };
  }
  return best && best.v > 0 ? best.how : 'no';
}

/** Every small open item of the week, each with its answers and the pick. */
export function settleItems(s: GameState, ui: SettleUi = {}): SettleItem[] {
  const answers = ui.answers ?? {};
  const orders = ui.orders ?? [];
  const taken = new Set(ui.taken ?? []);
  const limit = settleLimit(s);
  const man = counselor(s);
  const by = man ? displayName(man) : 'Your people';
  const out: SettleItem[] = [];
  // Decisions (small asks, petitioners at the door) and the envelope.
  for (const ev of eventsOut(s)) {
    if (answers[ev.iid]) continue;
    const key = `ev:${ev.iid}`;
    const opts: SettleOption[] = ev.choices.map((c) => ({ id: c.id, label: c.label, cost: moneyOut(c.effects ?? []), disabled: c.disabledReason, answer: { kind: 'event', iid: ev.iid, choiceId: c.id } }));
    if (ev.defId === 'tribute_audience') {
      if (!ev.choices.some((c) => c.id === 'his' && !c.disabledReason)) continue;
      const off = envelopeOff(s) && !alwaysOn(s, 'envelopes');
      out.push({
        key: 'envelope', kind: 'envelope', title: ev.title, options: opts, pick: 'his', by: 'Your underboss',
        yours: taken.has('envelope') || taken.has(key) ? 'you took it back' : off ? 'a short, a skim or a petition in it' : undefined,
        delegated: alwaysOn(s, 'envelopes') || undefined,
      });
      continue;
    }
    const p = consiglierePick(s, ev);
    if (!p) continue;
    const pickOpt = opts.find((o) => o.id === p.choiceId);
    const yours = taken.has(key) ? 'you took it back'
      : notRoutine(s, ev)
        ?? (touchesAMan(ev.choices.find((c) => c.id === p.choiceId)?.effects ?? []) ? "one of your men's lives or freedom" : undefined)
        ?? ((pickOpt?.cost ?? 0) > limit ? 'real money' : undefined);
    const who = ev.actors?.[0] ?? (ev.meta?.charId ? String(ev.meta.charId) : undefined);
    out.push({ key, kind: 'asks', title: ev.title, charId: who, options: opts, pick: p.choiceId, by: p.by, yours, delegated: delegatedAsk(s, ev) && !taken.has(key) ? true : undefined });
  }
  // The capos' morning problems still to come: each capo his own way (what he does if nobody answers).
  const d = daysOf(s);
  for (const c of weekCheckIns(s)) {
    const pr = c.problem;
    if (!pr || pr.kind === 'pitch' || c.day < d.day || d.skipped.includes(c.day) || d.answers[c.key]) continue;
    const key = `am:${c.key}`;
    const opts: SettleOption[] = pr.answers.map((a) => ({ id: a.id, label: a.label, cost: moneyOut(a.effects), answer: { kind: 'checkin', key: c.key, answer: a.id } }));
    const own = opts.find((o) => o.id === pr.own) ? pr.own : opts[0]?.id;
    if (!own) continue;
    const k = s.characters[c.capoId];
    const yours = taken.has(key) ? 'you took it back' : pr.urgent ? 'it is urgent' : touchesAMan(pr.answers.find((a) => a.id === own)?.effects ?? []) ? "one of your men's lives or freedom" : undefined;
    out.push({ key, kind: 'mornings', title: `${c.name}: ${pr.text}`, charId: c.capoId, options: opts, pick: own, by: k ? displayName(k) : c.name, yours, delegated: !pr.urgent && capoLevelOf(s, c.capoId) === 'handle' && !taken.has(key) ? true : undefined });
  }
  // The men's pitches (Let them eat), unanswered and not already ordered.
  for (const p of openPitches(s)) {
    const key = `pitch:${p.id}`;
    const acts = hows(p).map((how) => ({ how, action: { kind: 'mymen', op: { op: 'pitch', pitch: p.id, how } } as PlayerAction }));
    if (orders.some((o) => acts.some((a) => sameAct(o, a.action)))) continue;
    const opts: SettleOption[] = acts.map(({ how, action }) => {
      const pv = previewAction(s, action);
      return { id: how, label: pv.title, cost: pv.cost ?? 0, odds: pv.odds?.chance, disabled: pv.disabledReason, answer: { kind: 'order', action } };
    });
    const pick = pitchPick(s, p.id) ?? 'no';
    const c = s.characters[p.by];
    out.push({ key, kind: 'pitches', title: `${c ? displayName(c) : 'A man'}'s pitch: ${p.what}`, charId: p.by, options: opts, pick, by, yours: taken.has(key) ? 'you took it back' : undefined });
  }
  return out;
}

/** The option an item settles on: an override (when allowed), else the pick. */
export function chosen(it: SettleItem, override?: string): SettleOption | undefined {
  const o = override ? it.options.find((x) => x.id === override && !x.disabled) : undefined;
  return o ?? it.options.find((x) => x.id === it.pick && !x.disabled);
}

function oddsLine(opts: SettleOption[]): string {
  const dice = opts.filter((o) => o.odds !== undefined);
  const sure = opts.length - dice.length;
  const parts: string[] = [];
  if (sure) parts.push(`${sure} sure thing${sure === 1 ? '' : 's'}`);
  if (dice.length) parts.push(`${dice.length} on the dice at ${Math.round((dice.reduce((a, o) => a + o.odds!, 0) / dice.length) * 100)}%${dice.length > 1 ? ' on average' : ''}`);
  return parts.join(', ') || 'nothing to roll';
}

/** Cost and odds of a set of choices. */
export function summarize(chosenOpts: SettleOption[]): { cost: number; odds: string } {
  return { cost: chosenOpts.reduce((a, o) => a + o.cost, 0), odds: oddsLine(chosenOpts) };
}

/**
 * The bundles: two or more routine, open items of the same kind, not already handed off by a standing
 * order, become one card. Items that stay the boss's are never in a bundle.
 */
export function deskBundles(s: GameState, ui: SettleUi = {}, kinds: readonly BundleKind[] = ['asks', 'mornings', 'pitches']): Bundle[] {
  const items = settleItems(s, ui).filter((x) => !x.yours && !x.delegated && kinds.includes(x.kind) && chosen(x));
  const out: Bundle[] = [];
  for (const k of kinds) {
    const its = items.filter((x) => x.kind === k);
    if (its.length < 2) continue;
    const sum = summarize(its.map((x) => chosen(x)!));
    const by = k === 'mornings' ? 'each capo' : its[0].by;
    out.push({ kind: k, title: `${its.length} ${KIND_TITLE[k]}`, by, items: its, ...sum });
  }
  return out;
}

/** The answers a bundle gives, with the boss's per-item overrides ("skip": leave that one for him). */
export function bundleAnswers(b: Bundle, overrides: Record<string, string> = {}): { key: string; title: string; label: string; answer: SettleAnswer }[] {
  const out: { key: string; title: string; label: string; answer: SettleAnswer }[] = [];
  for (const it of b.items) {
    if (overrides[it.key] === 'skip') continue;
    const o = chosen(it, overrides[it.key]);
    if (o) out.push({ key: it.key, title: it.title, label: o.label, answer: o.answer });
  }
  return out;
}

export interface WeekPlanRow { key: string; kind: BundleKind; title: string; label: string; by: string; cost: number; odds?: number; answer: SettleAnswer }
export interface WeekPlan {
  /** What his people settle, by the pick. */
  settle: WeekPlanRow[];
  /** What stays his, and why. */
  yours: { key: string; title: string; why: string }[];
  cost: number;
  odds: string;
}

/**
 * "Handle the week for me": every routine item settled by his people's pick; everything that is not
 * routine (a life, a man handed over, the law, a war, real money, his own family, something he took back)
 * stays his, listed with why. Money is counted against what the Family has after this week's orders: an
 * item it can't cover stays his too.
 */
export function handleWeekPlan(s: GameState, ui: SettleUi = {}): WeekPlan {
  const settle: WeekPlanRow[] = [];
  const yours: WeekPlan['yours'] = [];
  let left = queuedMoney(s, ui.orders ?? []).familyLeft;
  for (const it of settleItems(s, ui)) {
    if (it.yours) { yours.push({ key: it.key, title: it.title, why: it.yours }); continue; }
    const o = chosen(it);
    if (!o) { yours.push({ key: it.key, title: it.title, why: 'no answer can be given now' }); continue; }
    if (o.cost > 0 && o.cost > left) { yours.push({ key: it.key, title: it.title, why: 'the Family can\'t cover it' }); continue; }
    left -= o.cost;
    settle.push({ key: it.key, kind: it.kind, title: it.title, label: o.label, by: it.kind === 'mornings' ? `${it.by}, his way` : it.by, cost: o.cost, odds: o.odds, answer: o.answer });
  }
  const sum = summarize(settle.map((r) => ({ id: r.key, label: r.label, cost: r.cost, odds: r.odds, answer: r.answer })));
  return { settle, yours, ...sum };
}

/** In words, what one settled row does ("Tommy: do him the favor"). */
export function rowWords(r: WeekPlanRow): string {
  return `${r.by}: ${lc1(r.label)}`;
}

/** An answer is still only queued (can be taken back): the decision unresolved, the morning still to come, the order not yet carried out. */
export function stillQueued(s: GameState, a: SettleAnswer, ui: SettleUi = {}): boolean {
  if (a.kind === 'event') return s.pendingEvents.some((e) => e.iid === a.iid) && ui.answers?.[a.iid] === a.choiceId;
  if (a.kind === 'checkin') {
    const d = daysOf(s);
    const c = weekCheckIns(s).find((x) => x.key === a.key);
    return !!c && c.day >= d.day && d.answers[a.key] === a.answer;
  }
  return (ui.orders ?? []).some((o) => sameAct(o, a.action));
}
