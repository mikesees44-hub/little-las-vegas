import { inbox, type InboxItem, type InboxUi } from './inbox';
import { envelopeMan, latestReport } from './tribute';
import { briefing as briefing0, speakerLabel } from './briefing';
import { weekCheckIns as weekCheckIns0 } from './checkins';
import { DAY_NAMES, today } from './days';
import { capoLevelOf, chosenOpt, docketOf, levelOf } from './lieutenants';
import { displayName } from './characters';
import type { Choice, Effect, GameState } from './types';

/**
 * THE BOSS'S ATTENTION: the inbox (engine/inbox.ts, the one list) ranked by
 * what is on the line and split in two.
 *
 *  - NEEDS YOU: at most DESK_CAP items a week. Red items always surface, up to
 *    DESK_HARD_MAX; then the highest stakes fill what is left of the cap.
 *  - HANDLED FOR YOU: everything else, with who handles it, what he will do
 *    and on which day. Nothing is lost: the boss can take any of it back
 *    (decide it himself before the man's day) and it moves up to Needs you.
 *
 * The stakes are a sum of named parts, each shown to the player as a reason
 * chip ("a man's life", "$4,000 on the line"). Pure and deterministic: reads
 * the state and the UI's unsent bits, never writes.
 */

/** Per-state memo of the heavy reads (the sit-down, the week's check-ins): one pass per state, however many items ask. */
const reads = new WeakMap<GameState, { b?: ReturnType<typeof briefing0>; w?: ReturnType<typeof weekCheckIns0> }>();
function memo1(s: GameState) { let r = reads.get(s); if (!r) { r = {}; reads.set(s, r); } return r; }
const briefing = (s: GameState) => { const r = memo1(s); return (r.b ??= briefing0(s)); };
const weekCheckIns = (s: GameState) => { const r = memo1(s); return (r.w ??= weekCheckIns0(s)); };

export const DESK_CAP = 5;
export const DESK_HARD_MAX = 8;
/** Clock mode: at most this many non-red pauses per game day. */
export const DAY_PAUSES = 2;

export type StakePart = 'life' | 'money' | 'standing' | 'deadline' | 'outside' | 'novelty' | 'red' | 'taken';

export interface Stakes {
  score: number;
  parts: { part: StakePart; points: number; why: string }[];
  /** The parts' words, for chips. */
  why: string[];
}

export interface Handled {
  item: InboxItem;
  /** Who handles it ("Sal", "Your underboss", "Nobody"). */
  by: string;
  byId?: string;
  /** What he will do, in a few words. */
  does: string;
  /** The day he does it (0 Monday … 6 Sunday), when known. */
  day?: number;
  /** Handled by a standing order (delegation), not just over the week's cap. */
  delegated?: boolean;
}

export interface DeskQueueUi extends InboxUi {
  /** Keys the boss took back this week: always in Needs you. */
  taken?: readonly string[];
}

export interface DeskQueue {
  needs: (InboxItem & { stakes: Stakes })[];
  handled: Handled[];
  /** Red items beyond DESK_HARD_MAX (handled, counted here so the UI can say so). */
  overflow: number;
}

const CONSIGLIERE_DOMAINS = new Set(['law', 'families', 'table']);
const money$ = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

function effectsOf(cs: readonly { effects?: readonly Effect[] }[]): Effect[][] {
  return cs.map((c) => [...(c.effects ?? [])]);
}

function deadly(effs: readonly Effect[]): boolean {
  return effs.some((e) => e.type === 'kill' || (e.type === 'health' && e.amount <= -40));
}

function moneyOf(effs: readonly Effect[]): number {
  return effs.reduce((a, e) => a + (e.type === 'money' ? (e as Extract<Effect, { type: 'money' }>).amount : 0), 0);
}

function standingOf(effs: readonly Effect[], s: GameState): number {
  let v = 0;
  for (const e of effs) {
    if (e.type === 'respect') v += Math.abs((e as { amount: number }).amount) * 2;
    if (e.type === 'opinion') {
      const o = e as { from: string; to: string; amount: number };
      const who = s.characters[o.from];
      if (o.to === s.playerId && who && (who.rank === 'capo' || who.rank === 'underboss' || who.rank === 'consigliere')) v += Math.abs(o.amount) / 5;
    }
  }
  return v;
}

/**
 * The money chip says the same numbers the card does: the amounts the answers move ("$3,200–$7,300 on the
 * line" for a bagman asking $5,400, or less, or more), never the gap between them (which no card shows).
 */
export function moneyAtStake(ms: readonly number[]): string {
  const amts = ms.map((m) => Math.abs(Math.round(m))).filter((m) => m > 0);
  if (!amts.length) return 'money on the line';
  const lo = Math.min(...amts);
  const hi = Math.max(...amts);
  return lo === hi ? `${money$(hi)} on the line` : `${money$(lo)}–${money$(hi)} on the line`;
}

/** What one inbox item has on the line, part by part (each part a chip). */
export function stakesOf(s: GameState, it: InboxItem, ui: DeskQueueUi = {}): Stakes {
  const parts: Stakes['parts'] = [];
  const add = (part: StakePart, points: number, why: string) => { if (points > 0) parts.push({ part, points: Math.round(points), why }); };
  let options: Effect[][] = [];
  let costs: number[] = [];
  let lands: number | undefined;
  let outside = false;
  let novel = false;
  const d = today(s);
  if (it.ref.event) {
    const ev = s.pendingEvents.find((e) => e.iid === it.ref.event);
    if (ev) {
      options = effectsOf(ev.choices as Choice[]);
      if (ev.mandatory) lands = d;
      const seen = (s.director?.hist ?? []).filter((h) => h[1] === ev.defId && h[0] < ev.week).length;
      novel = seen === 0;
    }
  } else if (it.ref.lt) {
    const a = docketOf(s).find((x) => x.id === it.ref.lt);
    if (a) {
      costs = a.options.map((o) => o.cost);
      lands = a.day;
      outside = CONSIGLIERE_DOMAINS.has(a.domain);
      if (a.options.some((o) => o.action.kind === 'interact' && (o.action.id === 'whack' || o.action.id === 'exile'))) parts.push({ part: 'life', points: 60, why: 'a man\'s life' });
    }
  } else if (it.kind === 'morning' && it.ref.day !== undefined) {
    const c = weekCheckIns(s).find((x) => `am:${x.key}` === it.key);
    if (c?.problem) options = effectsOf(c.problem.answers);
    lands = it.ref.day;
  } else if (it.ref.brief) {
    const b = briefing(s).items.find((x) => x.id === it.ref.brief);
    if (b) {
      costs = b.options.map((o) => o.cost ?? 0);
      outside = b.role === 'consigliere' && /law|rival|war|dispute|table/i.test(b.id);
    }
  } else if (it.ref.tip) {
    lands = d + 1;
  }
  if (options.some(deadly)) add('life', 60, 'a man\'s life');
  const ms = [...options.map(moneyOf), ...costs.map((c) => -c)];
  if (ms.length > 1 || (ms.length === 1 && ms[0] !== 0)) {
    const spread = ms.length > 1 ? Math.max(...ms) - Math.min(...ms) : Math.abs(ms[0]);
    add('money', Math.min(30, spread / 500), moneyAtStake(ms));
  }
  const st = Math.max(0, ...options.map((o) => standingOf(o, s)));
  add('standing', Math.min(20, st), 'your standing');
  if (lands !== undefined) {
    const left = lands - d;
    if (left <= 1) add('deadline', 15, left <= 0 ? 'today' : 'by tomorrow');
    else if (left <= 3) add('deadline', 8, `by ${DAY_NAMES[Math.min(6, lands)]}`);
  }
  if (outside) add('outside', 10, 'the outside world');
  if (novel) add('novelty', 10, 'something new');
  if (it.tone === 'red') add('red', 100, 'it lands whether you answer or not');
  if (ui.taken?.includes(it.key)) add('taken', 200, 'you took it back');
  const score = parts.reduce((a, p) => a + p.points, 0);
  return { score, parts, why: parts.filter((p) => p.part !== 'red' && p.part !== 'taken').map((p) => p.why) };
}

/** Who handles an item the boss does not see to, and what he does. */
export function handlerOf(s: GameState, it: InboxItem): Omit<Handled, 'item'> {
  const m = envelopeMan(s).c;
  const ub = m ? { by: displayName(m), byId: m.id as string | undefined } : { by: 'Nobody', byId: undefined as string | undefined };
  if (it.ref.lt) {
    const a = docketOf(s).find((x) => x.id === it.ref.lt);
    if (a) {
      const c = s.characters[a.byId];
      const o = chosenOpt(s, a);
      return { by: c ? displayName(c) : 'Your lieutenant', byId: a.byId, does: a.needsOk ? 'lets it go (over his budget)' : a.waits ? 'waits for your word (a big step)' : `${(o?.label ?? a.topic).toLowerCase()}`, day: a.day };
    }
  }
  if (it.kind === 'morning' && it.ref.day !== undefined) {
    const c = weekCheckIns(s).find((x) => `am:${x.key}` === it.key);
    const own = c?.problem?.answers.find((x) => x.id === c.problem!.own);
    const k = c ? s.characters[c.capoId] : undefined;
    return { by: k ? displayName(k) : c?.name ?? 'The capo', byId: c?.capoId, does: own ? `his way: ${own.label.toLowerCase()}` : 'his own way', day: it.ref.day };
  }
  if (it.ref.brief) {
    const bf = briefing(s);
    const b = bf.items.find((x) => x.id === it.ref.brief);
    const rec = b?.options.find((o) => o.id === b.recommended);
    const who = b?.charId ? s.characters[b.charId] : undefined;
    const said = b ? speakerLabel(bf, b.speaker) : undefined;
    return { by: who ? displayName(who) : said ? said.charAt(0).toUpperCase() + said.slice(1) : ub.by, byId: who?.id, does: rec && rec.id !== 'wait' ? `as he recommends: ${rec.label.toLowerCase()}` : 'it waits a week' };
  }
  if (it.ref.event) {
    const ev = s.pendingEvents.find((e) => e.iid === it.ref.event);
    const def = ev?.choices.find((c) => c.id === ev.defaultChoiceId && !c.disabledReason) ?? ev?.choices[0];
    return { ...ub, does: def ? `"${def.label}"` : 'the usual', day: 6 };
  }
  if (it.kind === 'envelope') return { ...ub, does: 'takes the standing split', day: 0 };
  if (it.ref.ask) return { ...ub, does: 'lets the offer stand until you answer' };
  if (it.ref.trouble) return { ...ub, does: 'keeps an eye on it' };
  if (it.ref.tip) return { by: 'Nobody', does: 'what they heard lands whether you listen or not' };
  if (it.kind === 'lawyer') return { by: 'Your lawyer', does: 'waits for an hour of your time' };
  return { ...ub, does: 'the usual' };
}

/**
 * Items a standing order hands to somebody else (delegation): never in Needs
 * you unless the boss takes them back. Empty until the delegation lines
 * (lieutenants.ts) say otherwise.
 */
export type DelegationRule = (s: GameState, it: InboxItem) => boolean;
const RULES: DelegationRule[] = [
  // A capo's routine morning problem: his territory, his call (unless the boss keeps it).
  (s, it) => {
    if (it.kind !== 'morning') return false;
    const c = weekCheckIns(s).find((x) => `am:${x.key}` === it.key);
    return !!c?.problem && !c.problem.urgent && capoLevelOf(s, c.capoId) === 'handle';
  },
  // The envelope on a quiet week: the bagman takes the standing split (only a short, a skim or a petition needs the boss).
  (s, it) => it.kind === 'envelope' && !envelopeOff(s),
  // The sit-down's routine items: the speaker sees to them.
  (s, it) => {
    if (!it.ref.brief) return false;
    return !!briefing(s).items.find((x) => x.id === it.ref.brief)?.routine;
  },
  // A tenant asking to run his racket at your place, trouble at a tenant's: the underboss's rackets, at Handle it.
  (s, it) => (!!it.ref.ask || !!it.ref.trouble) && it.tone === 'gold' && levelOf(s, 'rackets') === 'handle' && !!envelopeMan(s).c,
];

/** Something off in this week's envelope: a short crew, an issue, a petition (MAKE_IT_GREAT #9). */
export function envelopeOff(s: GameState): boolean {
  const rep = latestReport(s);
  if (!rep) return false;
  return rep.issues.length > 0 || rep.petitions.length > 0 || rep.crews.some((c) => c.short > 0);
}
/** Register a delegation line (lieutenants.ts and friends; kept here so attention stays a leaf for them). */
export function addDelegationRule(r: DelegationRule): void { if (!RULES.includes(r)) RULES.push(r); }
export function delegated(s: GameState, it: InboxItem): boolean {
  return it.tone !== 'red' && RULES.some((r) => { try { return r(s, it); } catch { return false; } });
}

const queues = new WeakMap<GameState, Map<string, DeskQueue>>();

/** The week's desk: what needs the boss, and what is handled for him. Pure, deterministic. */
export function deskQueue(s: GameState, ui: DeskQueueUi = {}): DeskQueue {
  const k = JSON.stringify([ui.answers ?? {}, ui.briefSkip ?? [], ui.taken ?? [], ui.orders ?? []]);
  let m = queues.get(s);
  if (!m) { m = new Map(); queues.set(s, m); }
  const hit = m.get(k);
  if (hit) return hit;
  const items = inbox(s, ui).map((it) => ({ ...it, stakes: stakesOf(s, it, ui) }));
  const taken = new Set(ui.taken ?? []);
  const byScore = (a: { stakes: Stakes; key: string }, b: { stakes: Stakes; key: string }) => b.stakes.score - a.stakes.score || a.key.localeCompare(b.key);
  const forced = items.filter((x) => taken.has(x.key)).sort(byScore);
  const reds = items.filter((x) => !taken.has(x.key) && x.tone === 'red').sort(byScore);
  const rest = items.filter((x) => !taken.has(x.key) && x.tone !== 'red');
  const free = rest.filter((x) => !delegated(s, x)).sort(byScore);
  const needs = [...forced];
  let overflow = 0;
  for (const r of reds) {
    if (needs.length < DESK_HARD_MAX) needs.push(r); else overflow++;
  }
  for (const x of free) if (needs.length < DESK_CAP) needs.push(x);
  const inNeeds = new Set(needs.map((x) => x.key));
  const handled: Handled[] = items.filter((x) => !inNeeds.has(x.key)).map((x) => ({ item: x, ...handlerOf(s, x), ...(delegated(s, x) ? { delegated: true } : {}) }));
  handled.sort((a, b) => (a.day ?? 7) - (b.day ?? 7) || a.item.key.localeCompare(b.item.key));
  const out = { needs, handled, overflow };
  m.set(k, out);
  return out;
}

/** The one count the boss sees: what needs him (the Desk's header, the top bar, the door). */
export function deskCount(s: GameState, ui: DeskQueueUi = {}): number {
  return deskQueue(s, ui).needs.length;
}

/** The count and its worst tone, for a badge. */
export function deskBadge(s: GameState, ui: DeskQueueUi = {}): { n: number; tone?: InboxItem['tone']; handled: number } {
  const q = deskQueue(s, ui);
  const tone = q.needs.some((x) => x.tone === 'red') ? 'red' : q.needs.some((x) => x.tone === 'amber') ? 'amber' : q.needs.length ? 'gold' : undefined;
  return { n: q.needs.length, tone, handled: q.handled.length };
}
