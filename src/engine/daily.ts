import { ensureAction } from './actionState';
import { daysOf, tickDay } from './days';
import { roll } from './roundsPersonal';
import { liveStrikes, resolveStrike, stampWhen, strikesToday, strikeView, strikeWorthy, type StrikeOptId } from './threats';
import { answerItem, deliveryFor, dropItem, dueItems, itemView, liveItems, markLive, type MomentView } from './schedule';
export { registerDelivery, scheduleAt, scheduleInto, type DeliveryHook, type MomentView, type ScheduledItem } from './schedule';
import { resolveStorm, stormTonight, stormView, type StormOptId } from './setPieces';
import type { NowResult } from './deeds/now';
import { extraPress } from './paper';
import { phoneDay } from './phone';
import './phoneMeet';
import './planner/datebook';
import { eventOut, eventsOut } from './eventDays';
export { eventOut, eventsOut };
import type { EventInstance, GameState } from './types';

/**
 * THE WEEK SPREAD ACROSS THE DAYS (DAILY_LOGIC_AND_ACTION #1, #5). The week turn still computes
 * the week; this layer hands its results to the running clock on their days, the way the papers
 * already come out day by day (paper.ts setEditions / isOut):
 *
 *  - Decisions: the mandatory ones (the money, the chair, a funeral, the set-pieces) are on the desk
 *    Monday, in the Sit-Down; the rest come out Tuesday to Friday (`meta.day`, round-robin). They
 *    stay in `pendingEvents`, so the engine is unchanged: an answer is applied at the turn; skipping
 *    the week with Advance Week brings them all out first (releaseAll), so nothing is lost.
 *  - Urgent meetings come out on their day (threats.ts Tip.rel).
 *  - Threats land on their day and hour (threats.ts Threat.dueDay/hour): the clock stops, the boss
 *    answers with odds, and it is rolled in the moment (resolveStrike). The hurricane's night is a
 *    moment too (setPieces.ts), and so is anything put on the general scheduler (schedule.ts
 *    scheduleAt + registerDelivery: the phone's calls and meets plug in there).
 *
 * Pure: every function returns a new state.
 */

/** The last day a decision comes out (Saturday): it leaves him Sunday to answer, and no day of the week sits empty. */
export const LAST_RELEASE_DAY = 5;

/** Decisions that must be on the desk the moment the week opens (the money, the chair, a summons, a set-piece). */
const MONDAY = new Set(['tribute_audience', 'bagman', 'made_boss', 'philly_summons', 'bailout', 'making']);
function mondayOnly(ev: EventInstance): boolean {
  return ev.mandatory || MONDAY.has(ev.defId) || ev.defId.startsWith('setpiece_') || !!ev.meta?.asked;
}
/** Pressing but not binding (priority 90+): out on Tuesday, the first morning after the week opens. */
const PRESSING = 90;

/**
 * At the end of the week turn: Monday's decisions stay as they are, the rest are given the day they
 * come out (`meta.day`, Tuesday … Saturday). Every decision stays in `pendingEvents` (the engine and
 * an answer given early are unchanged); the screens show one only once it is out (`eventOut`).
 * Mutates `s` (the turn's working copy).
 */
export function scheduleWeek(s: GameState): void {
  if (s.gameOver || !s.pendingEvents.length) return;
  const later = s.pendingEvents.filter((e) => !mondayOnly(e)).sort((a, b) => b.priority - a.priority || a.iid.localeCompare(b.iid));
  const first = Math.floor(roll(`${s.seed}|${s.week}|rel`) * LAST_RELEASE_DAY);
  let i = 0;
  for (const ev of later) {
    const day = ev.priority >= PRESSING ? 1 : 1 + ((first + i++) % LAST_RELEASE_DAY);
    ev.meta = { ...(ev.meta ?? {}), day, dw: s.week };
  }
}

/** Decisions still to come this week. */
export function heldEvents(s: GameState): EventInstance[] {
  return s.pendingEvents.filter((e) => !eventOut(s, e));
}

/** Everything the week still holds comes out now (Advance Week, the "Ready to advance" review). Pure. */
export function releaseAll(s: GameState): GameState {
  if (!heldEvents(s).length) return s;
  return { ...s, pendingEvents: s.pendingEvents.map((e) => (eventOut(s, e) ? e : { ...e, meta: { ...(e.meta ?? {}), day: 0, dw: s.week } })) };
}

export interface DayResult {
  state: GameState;
  /** Decisions that came out this morning. */
  released: string[];
  /** Threats striking now that wait on the boss (the clock stops: strikeView / answerStrike). */
  strikes: string[];
  /** Strikes that landed on their own today (no moment to answer: a quiet move, or the week moved on). */
  landed: NowResult[];
}

/**
 * One day passes on the clock (Monday → … → Sunday; the caller turns the week after Sunday):
 * the day ticks, a strike left unanswered from yesterday lands with the default, the day's held
 * decisions come out, and today's threats strike.
 */
export function advanceDay(s0: GameState): DayResult {
  let s = s0;
  const landed: NowResult[] = [];
  // Nobody answered yesterday's strike (the clock was not held): his people did what they could.
  for (const t of liveStrikes(s)) {
    const r = answerStrike(s, t.id, 'ride');
    if (r.result.ok) { s = r.state; landed.push(r.result); }
  }
  if (stormTonight(s)) { const r = answerMoment(s, 'storm', 'ride'); if (r.result.ok) { s = r.state; landed.push(r.result); } }
  for (const it of liveItems(s)) {
    // A moment that outlived its cause (a Dead Man Walking call after the boss changed): dropped, not answered.
    if (!deliveryFor(it.kind)?.view(s, it)) { s = dropItem(s, it.id); continue; }
    const r = answerMoment(s, `sched:${it.id}`); if (r.result.ok) { s = r.state; landed.push(r.result); } }
  if (daysOf(s).day >= 6) return { state: s, released: [], strikes: [], landed };
  const before = new Set(eventsOut(s).map((e) => e.iid));
  s = tickDay(s);
  const released = eventsOut(s).filter((e) => !before.has(e.iid)).map((e) => e.iid);
  const st = strikesToday(s);
  s = st.state;
  const strikes: string[] = [];
  for (const id of st.ids) {
    const t = s.threats!.threats.find((x) => x.id === id)!;
    if (strikeWorthy(s, t)) { strikes.push(id); continue; }
    // A quiet move (a man courted, a car across the street): it lands on its day, and he hears of it.
    const r = answerStrike(s, id, 'ride');
    if (r.result.ok) { s = r.state; landed.push(r.result); }
  }
  // The September storm's night (setPieces.ts): the same kind of moment.
  if (stormTonight(s)) strikes.push('storm');
  // The phone (phone.ts): an urgent meeting or a capo's urgent morning rings as a call; somebody else may call.
  s = phoneDay(s);
  // Anything else on the day/hour schedule (schedule.ts: a phone call, a meet): a moment, or delivered quietly.
  for (const it of dueItems(s)) {
    const hook = deliveryFor(it.kind);
    if (!hook || !hook.view(s, it)) { s = dropItem(s, it.id); continue; }
    const late = it.w < s.week || it.d < daysOf(s).day;
    if (!late && (hook.moment?.(s, it) ?? true)) { s = markLive(s, it.id); strikes.push(`sched:${it.id}`); continue; }
    const r = answerMoment(s, `sched:${it.id}`);
    if (r.result.ok) { s = r.state; landed.push(r.result); }
  }
  return { state: s, released, strikes, landed };
}

/** Every moment waiting on the boss now (strikes first, then the scheduled calls and meets), by id. */
export function liveMoments(s: GameState): string[] {
  return [...liveStrikes(s).map((t) => t.id), ...liveItems(s).map((x) => `sched:${x.id}`)];
}

/** A moment on the clock, by id: a threat striking now, or 'storm' (the hurricane's night). */
export function momentView(s: GameState, id: string): MomentView | undefined {
  if (id === 'storm') return stormView(s);
  if (id.startsWith('sched:')) return itemView(s, id.slice(6));
  return strikeView(s, id);
}

/** Answer a moment (a strike or the storm) in the moment; what landed goes in tomorrow's paper. */
export function answerMoment(s: GameState, id: string, opt?: string): { state: GameState; result: NowResult } {
  if (id.startsWith('sched:')) {
    const r = answerItem(s, id.slice(6), opt);
    if (!r) return { state: dropItem(s, id.slice(6)), result: { ok: false, error: 'It is over', title: 'The moment passed', tier: 'fail', headline: 'It is over', line: '', changes: [], leadsTo: [] } };
    if (r.extra) extraPress(r.state, r.extra.h, r.extra.b);
    return { state: r.state, result: r.result };
  }
  if (id === 'storm') {
    const r = resolveStorm(s, (opt ?? 'ride') as StormOptId);
    if (!r) return { state: s, result: { ok: false, error: 'It is over', title: 'The storm', tier: 'fail', headline: 'It is over', line: '', changes: [], leadsTo: [] } };
    extraPress(r.state, r.extra.h, r.extra.b);
    return { state: r.state, result: r.result };
  }
  return answerStrike(s, id, (opt ?? 'ride') as StrikeOptId);
}

/** The boss answers a strike in the moment (what landed is in tomorrow's paper: EXTRA!). */
export function answerStrike(s: GameState, id: string, opt: StrikeOptId): { state: GameState; result: NowResult } {
  const r = resolveStrike(s, id, opt);
  if (r.extra) extraPress(r.state, r.extra.h, r.extra.b);
  return { state: r.state, result: r.result };
}

/** Before the week turns: strikes still waiting land with the default, and every held decision is out. */
export function closeWeek(s0: GameState): GameState {
  let s = s0;
  for (const t of liveStrikes(s)) {
    const r = answerStrike(s, t.id, 'ride');
    if (r.result.ok) s = r.state;
  }
  return releaseAll(s);
}

/**
 * upgradeSave's step for the daily layer: a save from before it gets the ActionState, and the
 * threats already planned get their day and hour (hashed off the seed: loading never moves the dice).
 * An old urgent meeting has no release day: it is out at once.
 */
export function ensureDaily(s: GameState): void {
  ensureAction(s);
  for (const t of s.threats?.threats ?? []) if (!t.schemeId) stampWhen(s, t);
}
