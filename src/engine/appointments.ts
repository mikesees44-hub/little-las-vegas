import { fundingBlock, previewAction, resolveActions } from './actions';
import { REFUSALS_TO_PAUSE, SLOT_HOUR, SLOT_LABEL, adultAct, apptVisible, lastWeek, liveIn, occurrences, reservedEvenings, startWeek, usesEvening, weekOccurrences, type Appt, type ApptCadence, type ApptSlot, type ApptState, type Occurrence } from './apptsState';
import { wifeOf } from './bonds';
import { capoActionsFor } from './capos';
import { displayName, player } from './characters';
import { isAdult } from './dating';
import { adultOn } from './datingState';
import { awayReason, DAY_NAMES, DAY_SHORT } from './days';
import { deedsFor } from './deeds/resolve';
import { interactionsFor } from './interactions';
import { bookMark, bookOrder, journal } from './journal';
import type { Ctx } from './ledger';
import { bookHours } from './planner/hours';
import { roundSlots } from './rounds';
import { TALK_IDS, talkApplies, type TalkId } from './talks';
import { absDay, DAY_HOURS, hoursLabel, timeCost } from './timeCost';
import type { Effect, GameState, PlayerAction } from './types';

/**
 * STANDING APPOINTMENTS (owner, 2026-11-05: "set up a weekly appointment with people … so you can fill out
 * your days; daily or weekly meetings with anyone: an ear on the street, it would be easier to talk
 * frequently").
 *
 * The boss picks a person, one of the orders that person's menu already offers (a date with the girl he
 * is courting, an evening with a working woman when mature content is on, dinner with his wife, a night
 * out with a friend, a meet with an Ear, a sit-down with a capo, a word with a cop or a politician), how
 * often (every day or one day a week, at a time of day), for how long and with a weekly budget.
 *
 *  - The days fill: each one holds its hours on the datebook (`HoursState.booked`, the same record the
 *    datebook's own plans use) and its evening, if it takes one (the rounds count it: apptsState.ts), first;
 *    the rest of the day stays free. Too many for the week's hours or evenings is said up front.
 *  - At the week's turn each one due is a REAL order on the normal path (resolveActions): it costs, rolls
 *    and lands in Your File exactly as if he had given it. Skipped with the reason when it can't be done
 *    (she is not available, no evening left, no money, over its budget, he is away, she said no this week).
 *  - She decides, every time. Two refusals in a row pause a standing date, and he is told.
 *  - Adults only; paid company only with mature content on (Off hides those appointments and they do not
 *    happen); nothing that takes a man's life or freedom can be made routine.
 *  - Money comes from the pot the order names (his pocket for his own life, the Family for business).
 */

/* ------------------------------------------------------------------ */
/* What can be made a standing appointment with someone                */
/* ------------------------------------------------------------------ */

export interface ApptOption {
  key: string;
  action: PlayerAction;
  /** The order's own title ("Ask Rosa out: dinner"). */
  label: string;
  hours: number;
  /** Money each time (the preview's cost) and from which pot. */
  cost: number;
  pot: 'pocket' | 'family';
  evening: boolean;
  adult: boolean;
  /** Why it could not be done right now (it may be later: shown, still choosable). */
  now?: string;
}

/** Reasons that are about this week (the money, the evenings, the time), not about the person: the option still stands. */
const PASSING = /evening|this week|recent|needs \$|pocket|money|time|busy|again|booked|already|every day|weeks?\)|not yet|until week|in jail/i;

/** Effects that put a man in the ground, inside, out of town or in someone else's hands: never routine. */
const MAN_FX = new Set<string>(['kill', 'imprison', 'exile', 'faction', 'flip', 'retire', 'rank']);
function grave(effs: readonly Effect[]): boolean {
  return effs.some((e) => MAN_FX.has(e.type) || (e.type === 'health' && (e as { amount: number }).amount <= -40));
}

function candidates(s: GameState, who: string): PlayerAction[] {
  const c = s.characters[who];
  const boss = player(s);
  if (!c?.alive || !boss || c.id === boss.id) return [];
  const out: PlayerAction[] = [];
  const add = (a: PlayerAction) => out.push(a);
  const wife = wifeOf(s);
  const isWife = !!wife && wife.id === c.id;
  // The ones closest to him: his wife, his kids, his friends (bonds.ts).
  for (const op of ['date', 'attention', 'kidTime', 'drink', 'fishing', 'cards', 'confide', 'reassure', 'herFamily'] as const) add({ kind: 'bond', op: { op, id: c.id } });
  // Courting, and company (dating.ts): adults only; paid company only with mature content on.
  if (isAdult(s, c) && (!c.dynasty || isWife)) {
    if (!isWife) {
      add({ kind: 'dating', op: { op: 'talk', id: c.id } });
      for (const date of ['coffee', 'dinner', 'night'] as const) add({ kind: 'dating', op: { op: 'invite', id: c.id, date } });
    }
    add({ kind: 'dating', op: { op: 'gift', id: c.id, tier: 'flowers' } });
    if (adultOn(s) && s.dating?.providers[c.id]) {
      add({ kind: 'dating', op: { op: 'paid', id: c.id } });
      for (const what of ['arm', 'hostess', 'weekend'] as const) add({ kind: 'dating', op: { op: 'pro', id: c.id, what } });
    }
  }
  // An Ear on the street (ears.ts): the meet, and taking care of her.
  if (s.ears?.ears[c.id]) {
    add({ kind: 'ears', op: { op: 'meet', earId: c.id } });
    add({ kind: 'ears', op: { op: 'retain', earId: c.id } });
  }
  // A capo (capos.ts): ask him what he hears, recognize him, an envelope.
  for (const a of capoActionsFor(s, c.id)) if (a.op === 'ask' || a.op === 'recognize' || a.op === 'reward') add({ kind: 'capo', op: a });
  // A word with anyone (talks.ts): a sit-down, business, advice, a social evening, his grievance.
  const talks: TalkId[] = ['meeting', 'business', 'advice', 'social', 'grievance'];
  for (const t of TALK_IDS) if (talks.includes(t) && !talkApplies(s, t, c)) add({ kind: 'talk', op: { t: 'ask', talk: t, target: c.id } });
  // The old courtesies (interactions.ts): dinner, a small gift, the envelope for a cop or a politician on the pad.
  for (const p of interactionsFor(s, c.id)) if (p.id === 'dinner' || p.id === 'gift_small' || p.id === 'bribe') add({ kind: 'interact', id: p.id, target: c.id });
  // Friendly deeds (deeds/): the ones meant to keep a person close.
  let n = 0;
  for (const d of deedsFor(s, s.playerId, c.id)) {
    if (d.def.hostile || (d.def.cat !== 'diplomacy' && d.def.cat !== 'family') || n >= 4) continue;
    add({ kind: 'deed', id: d.def.id, target: c.id });
    n++;
  }
  return out;
}

/** The orders that can be made standing with this person (each still checked every time it comes due). */
export function apptOptions(s: GameState, who: string): ApptOption[] {
  const out: ApptOption[] = [];
  const seen = new Set<string>();
  for (const a of candidates(s, who)) {
    const key = JSON.stringify(a);
    if (seen.has(key)) continue;
    seen.add(key);
    if (adultAct(a) && !adultOn(s)) continue;
    let p;
    try { p = previewAction(s, a); } catch { continue; }
    if (!p || !p.title) continue;
    if (grave(p.effects)) continue;
    if (p.disabledReason && !PASSING.test(p.disabledReason)) continue;
    out.push({ key, action: a, label: p.title, hours: timeCost(a, s), cost: Math.max(0, p.cost ?? 0), pot: p.pot === 'pocket' ? 'pocket' : 'family', evening: usesEvening(a), adult: adultAct(a), ...(p.disabledReason ? { now: p.disabledReason } : {}) });
  }
  return out;
}

/** The order his menu would put first for her (a date, a meet, a sit-down), for "Same time next week?". */
export function bestApptOption(s: GameState, who: string, prefer?: PlayerAction): ApptOption | undefined {
  const opts = apptOptions(s, who);
  if (prefer) {
    const k = JSON.stringify(prefer);
    const same = opts.find((o) => o.key === k);
    if (same) return same;
  }
  return opts.find((o) => !o.now) ?? opts[0];
}

/** Can this order be made a standing appointment (it is one of her options)? */
export function canStand(s: GameState, a: PlayerAction): boolean {
  const who = personOfAct(s, a);
  if (!who) return false;
  const k = JSON.stringify(a);
  return apptOptions(s, who).some((o) => o.key === k);
}

/** The person an order is aimed at. */
export function personOfAct(s: GameState, a: PlayerAction): string | undefined {
  const r = a as { target?: unknown; op?: Record<string, unknown> };
  for (const x of [r.target, r.op?.id, r.op?.earId, r.op?.capo, r.op?.target, r.op?.to, r.op?.who]) if (typeof x === 'string' && s.characters[x] && x !== s.playerId) return x;
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Making, changing, pausing, ending                                   */
/* ------------------------------------------------------------------ */

export interface ApptDraft {
  who: string;
  action: PlayerAction;
  cadence: ApptCadence;
  day?: number;
  slot: ApptSlot;
  weeks?: number;
  budget?: number;
}

/** Copy-on-write of the appointments record (UI state functions are pure). */
function apptsClone(s: GameState): GameState & { appts: ApptState } {
  const A = s.appts ?? { list: [], seq: 0 };
  return { ...s, appts: { ...A, list: A.list.map((a) => ({ ...a })), ...(A.done ? { done: { ...A.done, k: A.done.k.slice() } } : {}), ...(A.res ? { res: { ...A.res } } : {}) } };
}

/** Why this draft can't be made (undefined: it can). */
export function draftBlock(s: GameState, d: ApptDraft): string | undefined {
  const c = s.characters[d.who];
  if (!c?.alive) return 'Nobody by that name';
  if (adultAct(d.action) && !adultOn(s)) return 'Adult content is off in Settings';
  if ((d.action.kind === 'dating' || d.action.kind === 'nightlife') && !isAdult(s, c)) return 'Adults only';
  if (!apptOptions(s, d.who).some((o) => o.key === JSON.stringify(d.action))) return 'That is not something you can make routine with them';
  if (d.cadence === 'weekly' && (d.day === undefined || d.day < 0 || d.day > 6)) return 'Pick a day';
  if (d.budget !== undefined && d.budget < 0) return 'A budget is a sum of money';
  if (d.weeks !== undefined && d.weeks < 1) return 'At least a week';
  return undefined;
}

/** In words: "Dinner with Rosa", from the order's own title. */
function whatOf(s: GameState, a: PlayerAction): string {
  try { return previewAction(s, a).title; } catch { return 'An appointment'; }
}

/** Make a standing appointment. Pure. Its hours this week are held on the book at once. */
export function addAppt(s: GameState, d: ApptDraft): { state: GameState; id?: string; error?: string } {
  const why = draftBlock(s, d);
  if (why) return { state: s, error: why };
  const x = apptsClone(s);
  const A = x.appts;
  A.seq += 1;
  const id = `ap${A.seq}`;
  const a: Appt = {
    id, who: d.who, action: d.action, what: whatOf(s, d.action), cadence: d.cadence, day: d.cadence === 'weekly' ? d.day! : 0, slot: d.slot,
    start: absDay(s), no: 0, ...(d.weeks !== undefined ? { weeks: d.weeks } : {}), ...(d.budget !== undefined ? { budget: d.budget } : {}),
  };
  A.list.push(a);
  const c = s.characters[d.who];
  journal(x, { c: 'family', t: `Standing: ${a.what}, ${whenWords(a)}`, src: 'planner', mine: 1, p: [d.who], r: [`${c ? displayName(c) : 'They'} will be expecting you.`] });
  return { state: reserved(x), id };
}

/** Change its order, its days, its length or its budget. Pure. */
export function editAppt(s: GameState, id: string, d: Partial<ApptDraft>): { state: GameState; error?: string } {
  const cur = s.appts?.list.find((a) => a.id === id);
  if (!cur) return { state: s, error: 'No such appointment' };
  const merged: ApptDraft = { who: cur.who, action: d.action ?? cur.action, cadence: d.cadence ?? cur.cadence, day: d.day ?? cur.day, slot: d.slot ?? cur.slot, weeks: 'weeks' in d ? d.weeks : cur.weeks, budget: 'budget' in d ? d.budget : cur.budget };
  const why = draftBlock(s, merged);
  if (why) return { state: s, error: why };
  const x = apptsClone(s);
  const a = x.appts.list.find((y) => y.id === id)!;
  a.action = merged.action;
  a.what = whatOf(s, merged.action);
  a.cadence = merged.cadence;
  a.day = merged.cadence === 'weekly' ? merged.day! : 0;
  a.slot = merged.slot;
  if (merged.weeks === undefined) delete a.weeks;
  else a.weeks = merged.weeks + (startWeek(a) < s.week ? s.week - startWeek(a) : 0);
  if (merged.budget === undefined) delete a.budget; else a.budget = merged.budget;
  delete a.ended;
  return { state: reserved(x) };
}

/** Pause or resume. A paused one holds no hours and does not happen. Pure. */
export function pauseAppt(s: GameState, id: string, on: boolean): GameState {
  if (!s.appts?.list.some((a) => a.id === id)) return s;
  const x = apptsClone(s);
  const a = x.appts.list.find((y) => y.id === id)!;
  if (on) a.paused = 'You paused it';
  else { delete a.paused; a.no = 0; }
  return reserved(x);
}

/** Call it off for good: its hours come back. Pure. */
export function cancelAppt(s: GameState, id: string): GameState {
  const a = s.appts?.list.find((y) => y.id === id);
  if (!a) return s;
  const x = apptsClone(s);
  x.appts.list = x.appts.list.filter((y) => y.id !== id);
  const c = s.characters[a.who];
  journal(x, { c: 'family', t: `Called off: standing ${a.what.charAt(0).toLowerCase()}${a.what.slice(1)}`, src: 'planner', mine: 1, p: [a.who], r: c ? [`${c.firstName} will notice.`] : [] });
  return reserved(x);
}

/* ------------------------------------------------------------------ */
/* The hours held on the book                                          */
/* ------------------------------------------------------------------ */

/** Hours each day of this week is held for, by absolute day (today and ahead). */
function wanted(s: GameState): Record<string, number> {
  const now = absDay(s);
  const out: Record<string, number> = {};
  const done = s.appts?.done && s.appts.done.w === s.week ? s.appts.done.k : [];
  for (const o of weekOccurrences(s)) {
    const abs = s.week * 7 + o.d;
    if (abs < now || done.includes(o.key)) continue;
    out[abs] = (out[abs] ?? 0) + timeCost(o.a.action, s);
  }
  return out;
}

/** Give back what was held and hold what is due now (pure, on a state whose appts record is its own). */
function reserved<T extends GameState>(x: T): T {
  const A = x.appts;
  if (!A) return x;
  const now = absDay(x);
  let y: GameState = x;
  for (const [k, h] of Object.entries(A.res ?? {})) if (Number(k) >= now) y = bookHours(y, Number(k), -h);
  const want = wanted(y);
  for (const [k, h] of Object.entries(want)) y = bookHours(y, Number(k), h);
  const res = Object.keys(want).length ? want : undefined;
  const appts: ApptState = { ...A };
  if (res) appts.res = res; else delete appts.res;
  return { ...x, hours: y.hours, appts } as T;
}

/** The engine's side when the week turns: the new week's hours are held. Mutates `s` (the turn's copy). */
export function holdApptHours(s: GameState): void {
  if (!s.appts?.list.length) return;
  // Last week's holds are gone with last week; this week's are made fresh.
  if (s.appts.done && s.appts.done.w !== s.week) delete s.appts.done;
  const y = reserved(s);
  s.hours = y.hours;
  s.appts = y.appts;
}

/* ------------------------------------------------------------------ */
/* What the boss sees                                                  */
/* ------------------------------------------------------------------ */

/** "Tuesdays, evening", "Every day, mornings". */
export function whenWords(a: Pick<Appt, 'cadence' | 'day' | 'slot'>): string {
  return a.cadence === 'daily' ? `every day, ${SLOT_LABEL[a.slot]}s` : `${DAY_NAMES[a.day]}s, ${SLOT_LABEL[a.slot]}`;
}

export interface ApptView {
  a: Appt;
  who: string;
  name: string;
  when: string;
  /** "until week 30" / "open-ended" / "over". */
  span: string;
  /** This week's times and money, estimated from the order's own price. */
  perWeek: { times: number; cost: number; hours: number; pot: 'pocket' | 'family' };
  status: 'on' | 'paused' | 'over';
  last?: string;
}

/** Every standing appointment he can see (adult ones hidden with mature content Off). */
export function apptViews(s: GameState): ApptView[] {
  return (s.appts?.list ?? []).filter((a) => apptVisible(s, a)).map((a) => {
    const c = s.characters[a.who];
    const times = a.cadence === 'daily' ? 7 : 1;
    let cost = 0;
    let pot: 'pocket' | 'family' = 'pocket';
    try { const p = previewAction(s, a.action); cost = Math.max(0, p.cost ?? 0); pot = p.pot === 'pocket' ? 'pocket' : 'family'; } catch { /* a person gone */ }
    const lw = lastWeek(a);
    const over = !!a.ended || s.week > lw;
    return {
      a, who: a.who, name: c ? displayName(c) : 'Someone', when: whenWords(a),
      span: over ? 'over' : lw === Infinity ? 'open-ended' : `through week ${lw}`,
      perWeek: { times, cost: Math.min(a.budget ?? Infinity, cost * times), hours: timeCost(a.action, s) * times, pot },
      status: over ? 'over' : a.paused ? 'paused' : 'on',
      ...(a.last ? { last: `${a.last.w === s.week - 1 ? 'Last week' : `Week ${a.last.w}`}, ${DAY_SHORT[a.last.d]}: ${a.last.text}` } : {}),
    };
  });
}

export interface WeekAppt { id: string; who: string; d: number; h: number; hours: number; title: string; text: string }

/** This week's appointments, for the datebook and "Ready to advance" ("Standing: dinner with Rosa Tue evening"). */
export function weekAppts(s: GameState, w: number = s.week): WeekAppt[] {
  return weekOccurrences(s, w).map((o) => ({
    id: o.key, who: o.a.who, d: o.d, h: SLOT_HOUR[o.a.slot], hours: timeCost(o.a.action, s),
    title: `Standing: ${o.a.what}`, text: `Standing: ${lc(o.a.what)} ${DAY_SHORT[o.d]} ${SLOT_LABEL[o.a.slot]}`,
  }));
}

/** The orders this week's appointments will give (counted as already decided by "Handle the week"). */
export function weekApptActions(s: GameState): PlayerAction[] {
  const done = s.appts?.done && s.appts.done.w === s.week ? s.appts.done.k : [];
  return weekOccurrences(s).filter((o) => !done.includes(o.key)).map((o) => o.a.action);
}

const lc = (x: string) => `${x.charAt(0).toLowerCase()}${x.slice(1)}`;

/**
 * Too much for the week: a day with more hours held than it has, two in the same time of day, or more
 * evenings than the week has. With a draft: what it would be if he made it.
 */
export function overbook(s: GameState, draft?: ApptDraft): string[] {
  let occ = weekOccurrences(s).filter((o) => s.week * 7 + o.d >= absDay(s));
  if (draft) {
    const tmp: Appt = { id: 'draft', who: draft.who, action: draft.action, what: whatOf(s, draft.action), cadence: draft.cadence, day: draft.day ?? 0, slot: draft.slot, start: absDay(s), no: 0 };
    occ = [...occ, ...occurrences(s, tmp, s.week)];
    // Next week too, for a draft made late in the week (its days are all ahead of it there).
    if (occurrences(s, tmp, s.week).length === 0) occ = [...weekOccurrences(s, s.week + 1), ...occurrences(s, tmp, s.week + 1)];
  }
  const out: string[] = [];
  for (let d = 0; d < 7; d++) {
    const day = occ.filter((o) => o.d === d);
    const hours = day.reduce((n, o) => n + timeCost(o.a.action, s), 0);
    if (hours > DAY_HOURS) out.push(`${DAY_NAMES[d]}: ${hoursLabel(hours)} of standing appointments in an ${DAY_HOURS}-hour day`);
    for (const sl of ['morning', 'afternoon', 'evening'] as ApptSlot[]) {
      const at = day.filter((o) => o.a.slot === sl);
      if (at.length > 1) out.push(`${DAY_NAMES[d]} ${sl}: ${at.map((o) => lc(o.a.what)).join(' and ')} at the same time`);
    }
  }
  const evenings = occ.filter((o) => usesEvening(o.a.action)).length;
  const slots = roundSlots(s).slots + reservedEvenings(s);
  if (evenings > slots) out.push(`${evenings} standing evenings, and your week has ${slots}: some will be skipped`);
  return [...new Set(out)];
}

/* ------------------------------------------------------------------ */
/* The week's turn: the due ones are given                             */
/* ------------------------------------------------------------------ */

function skip(ctx: Ctx, o: Occurrence, why: string, lines: string[]): void {
  const s = ctx.s;
  const mark = bookMark(ctx);
  o.a.last = { w: s.week, d: o.d, outcome: 'skipped', text: `skipped (${why})` };
  bookOrder(ctx, mark, o.a.action, { title: `Standing: ${o.a.what} (${DAY_SHORT[o.d]})`, outcome: 'blocked', why, p: [o.a.who] });
  lines.push(`Standing: ${lc(o.a.what)} (${DAY_SHORT[o.d]}) skipped: ${why}.`);
}

/**
 * At the week's turn, after the boss's own orders: each appointment due this week is given, in the order of
 * its days, through resolveActions (the same checks, dice, effects and Your File as his own orders).
 * Returns the report's lines. Mutates the turn's copy.
 */
export function apptsWeek(ctx: Ctx): string[] {
  const s = ctx.s;
  const A = s.appts;
  if (!A?.list.length) return [];
  const lines: string[] = [];
  const occ = weekOccurrences(s);
  A.done = A.done && A.done.w === s.week ? A.done : { w: s.week, k: [] };
  const saidNo = new Set<string>();
  for (const o of occ) {
    if (s.gameOver) break;
    if (A.done.k.includes(o.key)) continue;
    A.done.k.push(o.key);
    const a = o.a;
    if (!liveIn(s, a, s.week)) continue;
    const c = s.characters[a.who];
    if (!c?.alive) { a.paused = 'They are gone'; skip(ctx, o, 'they are gone', lines); continue; }
    if (saidNo.has(a.id)) { skip(ctx, o, `${c.firstName} said no this week`, lines); continue; }
    const away = awayReason(s, o.d);
    if (away) { skip(ctx, o, `you were away (${away.toLowerCase()})`, lines); continue; }
    let p;
    try { p = previewAction(s, a.action); } catch { skip(ctx, o, 'it could not be done', lines); continue; }
    if (p.disabledReason) { skip(ctx, o, p.disabledReason, lines); continue; }
    if (grave(p.effects)) { a.paused = 'Not something to make routine'; skip(ctx, o, 'not something to make routine', lines); continue; }
    const spent = a.spent && a.spent.w === s.week ? a.spent.n : 0;
    const cost = Math.max(0, p.cost ?? 0);
    if (a.budget !== undefined && spent + cost > a.budget) { skip(ctx, o, `over its budget of $${a.budget.toLocaleString('en-US')} a week`, lines); continue; }
    const fb = fundingBlock(s, a.action, p);
    if (fb) { skip(ctx, o, fb, lines); continue; }
    let outcome: 'done' | 'refused' | 'blocked' = 'blocked';
    let why: string | undefined;
    resolveActions(ctx, [a.action], { strictFunding: true, own: 1, onOutcome: (_i, x, w) => { outcome = x; why = w; } });
    const when = `${DAY_SHORT[o.d]} ${SLOT_LABEL[a.slot]}`;
    if (outcome === 'done') {
      a.spent = { w: s.week, n: spent + cost };
      a.no = 0;
      a.last = { w: s.week, d: o.d, outcome: 'done', text: 'kept' };
      lines.push(`Standing: ${lc(a.what)} (${when}): kept.`);
    } else if (outcome === 'refused') {
      a.no += 1;
      saidNo.add(a.id);
      a.last = { w: s.week, d: o.d, outcome: 'refused', text: `${c.firstName} said no` };
      if (a.no >= REFUSALS_TO_PAUSE) {
        a.paused = `${c.firstName} said no ${a.no} times in a row`;
        lines.push(`Standing: ${lc(a.what)} (${when}): ${c.firstName} said no again. You let it rest: it is paused until you take it up again.`);
        s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${c.firstName} said no to you ${a.no} times in a row. You stopped asking.`, kind: 'decision' });
      } else lines.push(`Standing: ${lc(a.what)} (${when}): ${c.firstName} said no.`);
    } else {
      a.last = { w: s.week, d: o.d, outcome: 'skipped', text: `skipped (${why ?? 'it could not be done'})` };
      lines.push(`Standing: ${lc(a.what)} (${when}) skipped: ${why ?? 'it could not be done'}.`);
    }
  }
  // Their weeks are over.
  for (const a of A.list) if (!a.ended && s.week >= lastWeek(a)) a.ended = true;
  // Long over: off the list (a month later).
  A.list = A.list.filter((a) => !(a.ended && s.week - lastWeek(a) > 4));
  return lines;
}
