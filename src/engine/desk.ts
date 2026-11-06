import { eventsOut } from './eventDays';
import { urgentMeetings } from './threats';
import { attackEstimate, pressurePoints } from './oldDon';
import { deskQueue, handlerOf } from './attention';
import { delegatedAsk } from './delegation';
import type { InboxItem } from './inbox';
import { previewAction, queuedMoney } from './actions';
import { weekCheckIns, type CheckProblem } from './checkins';
import { DAY_NAMES, daysOf, weekPlan } from './days';
import { fmtMoney } from './effects';
import { roundOptions } from './rounds';
import { SCHEME_INFO } from './schemes';
import { obligations } from './tribute';
import type { GameState, PlayerAction } from './types';
import { eaters, loadOf, openPitches } from './eat';
import { isFree } from './characters';
import { FIX_WEEKS, OPEN_WEEKS, openApproachOf, openFixOf } from './single';
import { SILENCE_WEEKS, openProposal } from './matchmakers';
import { missedCalls } from './phone';
import { askLapses } from './minds/askView';
import { heardOnDesk } from './ai/rivalMinds';
import { wordThisWeek } from './ai/calls';
import { wifeLapses } from './wife';

/**
 * THE BOSS'S DESK: everything that wants the boss this week, in one place —
 * decisions, the capos' morning requests, the sit-down's recommendations,
 * this week's orders, the bills, and what is coming up. And the "Ready to
 * advance?" review: what is still unanswered and what happens if he leaves
 * it, the orders that will run and what they cost.
 *
 * Pure: reads the state and the UI's unsent answers and orders.
 */

/** What a capo does with a problem nobody answered: his own answer, in words. */
function ownWay(p: CheckProblem): string {
  const a = p.answers.find((x) => x.id === p.own);
  return a ? `${a.label} (${a.hint})` : 'he handles it his own way';
}

/** Where a desk row came from (the inbox's kinds, plus the desk's own). */
export type DeskKind = 'decision' | 'petition' | 'urgent' | 'morning' | 'sitdown' | 'lieutenant' | 'request' | 'envelope' | 'lawyer' | 'order' | 'bill' | 'upcoming' | 'result';
/** The desk's sections: what needs you, what is handled for you, your orders, the bills, what is coming. */
export type DeskGroupKind = 'needs' | 'handled' | 'result' | 'order' | 'bill' | 'upcoming';

export interface DeskItem {
  key: string;
  kind: DeskKind;
  title: string;
  detail: string;
  /** What happens if he does nothing. */
  ifNothing?: string;
  done?: boolean;
  urgent?: boolean;
  /** Money involved (positive: a cost). */
  cost?: number;
  /** What is on the line, as chips (attention.ts). */
  why?: string[];
  /** Handled for you: who, what, which day. */
  handled?: { by: string; byId?: string; does: string; day?: number; delegated?: boolean };
  /** Where it goes: an event iid, a morning's day, a sit-down item, an order index, a lieutenant's job, a tip, a place ask. */
  /** A result's tone (how it went). */
  tone?: 'good' | 'bad';
  ref: { entry?: string; event?: string; day?: number; brief?: string; order?: number; charId?: string; lt?: string; tip?: string; ask?: string; trouble?: string; envelope?: string; single?: 'come' | 'ma'; /** A family asking for a sit-down (minds/familyAsks.ts). */ family?: string };
}

export interface DeskGroup { kind: DeskGroupKind; title: string; items: DeskItem[] }

export interface DeskUi {
  answers?: Record<string, string>;
  orders?: readonly PlayerAction[];
  briefSkip?: readonly string[];
  /** Items the boss took back from the handled list this week. */
  taken?: readonly string[];
}

const GROUP_TITLE: Record<DeskGroupKind, string> = {
  needs: 'Needs you', handled: 'Handled for you', result: 'Results', order: 'Your orders this week', bill: 'Bills and what is owed', upcoming: 'Coming up',
};

function fromInbox(it: InboxItem): DeskItem {
  return { key: it.key, kind: it.kind, title: it.title, detail: it.why, urgent: it.tone === 'red', why: it.stakes?.why, ref: { ...it.ref, charId: it.charId } };
}

/**
 * The desk: the attention queue (engine/attention.ts, built on the one inbox)
 * as Needs you and Handled for you, then the boss's own orders, the bills and
 * what is coming. The header's count is `needs.length` of the same queue, so
 * the count and the rows can never disagree. Decisions and mornings he has
 * already answered this week stay at the end of Needs you, ticked.
 */
export function bossDesk(s: GameState, ui: DeskUi = {}): DeskGroup[] {
  const answers = ui.answers ?? {};
  const orders = ui.orders ?? [];
  const groups: Record<DeskGroupKind, DeskItem[]> = { needs: [], handled: [], result: [], order: [], bill: [], upcoming: [] };
  const q = deskQueue(s, ui);
  for (const it of q.needs) {
    const row = fromInbox(it);
    if (it.ref.event) {
      const ev = s.pendingEvents.find((e) => e.iid === it.ref.event);
      const ch = ev?.choices.find((c) => c.id === ev.defaultChoiceId) ?? ev?.choices[0];
      if (ch) row.ifNothing = `"${ch.label}"`;
    } else if (it.kind === 'morning') {
      const c = weekCheckIns(s).find((x) => `am:${x.key}` === it.key);
      if (c?.problem) { row.ifNothing = ownWay(c.problem); row.title = `${DAY_NAMES[c.day]}: ${c.name}`; row.detail = c.problem.text; }
    } else {
      const h = handlerOf(s, it);
      row.ifNothing = `${h.by}: ${h.does}`;
    }
    groups.needs.push(row);
  }
  // Answered this week: ticked, at the end (they don't count).
  for (const ev of eventsOut(s)) {
    const ans = answers[ev.iid];
    if (!ans) continue;
    const ch = ev.choices.find((c) => c.id === ans);
    groups.needs.push({ key: `ev:${ev.iid}`, kind: 'decision', title: ev.title, detail: `You chose: ${ch?.label ?? ans}`, done: true, ref: { event: ev.iid } });
  }
  const d = daysOf(s);
  for (const c of weekCheckIns(s)) {
    if (!c.problem || c.day < d.day || d.skipped.includes(c.day)) continue;
    const ans = d.answers[c.key];
    const a = ans ? c.problem.answers.find((x) => x.id === ans) : undefined;
    if (a) groups.needs.push({ key: `am:${c.key}`, kind: 'morning', title: `${DAY_NAMES[c.day]}: ${c.name}`, detail: `You said: ${a.label}`, done: true, ref: { day: c.day, charId: c.capoId } });
  }
  for (const h of q.handled) {
    const row = fromInbox(h.item);
    row.handled = { by: h.by, byId: h.byId, does: h.does, day: h.day, ...(h.delegated ? { delegated: true } : {}) };
    groups.handled.push(row);
  }
  groups.result.push(...deskResults(s));
  orders.forEach((a, i) => {
    const p = previewAction(s, a);
    groups.order.push({ key: `or:${i}`, kind: 'order', title: p.title, detail: p.cost > 0 ? `${fmtMoney(p.cost)} from ${p.pot === 'pocket' ? 'your pocket' : 'Family money'}` : 'No money up front', cost: p.cost, ref: { order: i } });
  });
  for (const o of obligations(s)) {
    if (o.kind === 'receivable') continue;
    groups.bill.push({ key: `bill:${o.what}`, kind: 'bill', title: o.what, detail: `${fmtMoney(o.amount)}${o.weekly ? ' a week, paid when the week turns' : o.due !== undefined ? ` due in ${o.due} week${o.due === 1 ? '' : 's'}` : ''}`, cost: o.amount, ref: {} });
  }
  const opts = roundOptions(s);
  weekPlan(s).forEach((id, day) => {
    if (!id || day < d.day) return;
    const r = opts.find((x) => x.id === id);
    if (r) groups.upcoming.push({ key: `eve:${day}`, kind: 'upcoming', title: `${DAY_NAMES[day]} evening: ${r.label}`, detail: r.cost ? `${fmtMoney(r.cost)} from your pocket that evening` : 'Costs nothing', cost: r.cost, ref: { day } });
  });
  // The Old Don: the pressure points he knows of, with his own odds, and the fog over the coming move.
  const pts = pressurePoints(s);
  if (pts.length) {
    const est = attackEstimate(s);
    groups.upcoming.push({ key: 'od:move', kind: 'upcoming', title: `The coming move: ${est.lo}–${est.hi} men, by the talk`, detail: `How sure you are: ${est.intel}%. Rumors run hot; names and proof narrow it.`, urgent: true, ref: {} });
    for (const p of pts.slice(0, 5)) groups.upcoming.push({ key: `od:${p.role}`, kind: 'upcoming', title: p.title, detail: p.detail, ref: {} });
  }
  // Heard through a way into a rival boss's head: a move aimed at you, before it lands (ai/rivalMinds.ts).
  groups.upcoming.push(...heardOnDesk(s));
  // Calls and letters waiting this week (ai/calls.ts): on the phone.
  const word = wordThisWeek(s);
  if (word.length) groups.upcoming.push({ key: 'word', kind: 'upcoming', title: `Word from ${word.map((w) => w.name.split(' ')[0]).join(', ')}`, detail: `${word.length === 1 ? 'A call or a letter' : `${word.length} calls and letters`} waiting: on the phone, Calls & letters.`, ref: {} });
  for (const sc of s.schemes.filter((x) => x.owner === 'player').slice(0, 4)) {
    groups.upcoming.push({ key: `sch:${sc.id}`, kind: 'upcoming', title: `${SCHEME_INFO[sc.kind].name} under way`, detail: `${sc.progress}% along`, ref: { charId: sc.targetId } });
  }
  return (Object.keys(groups) as DeskGroupKind[]).map((k) => ({ kind: k, title: GROUP_TITLE[k], items: groups[k] })).filter((g) => g.items.length);
}

/**
 * Results (STREAMLINE §4.3): what the boss's own orders came to — the ones
 * settled in the moment this week, and the queued ones that landed when the
 * week turned — newest first, each one line from Your File (written once).
 */
export function deskResults(s: GameState, n = 8): DeskItem[] {
  const e = s.journal?.e ?? [];
  const out: DeskItem[] = [];
  for (let i = e.length - 1; i >= 0 && out.length < n; i--) {
    const x = e[i];
    if (x.w < s.week - 1) break;
    if (x.src !== 'order' || !x.mine) continue;
    const first = x.r?.[0];
    const bad = !!first && (/^Not carried out|^The answer was no/.test(first));
    const now = x.w === s.week;
    out.push({ key: `res:${x.id}`, kind: 'result', title: x.t, detail: `${now ? 'Done now' : 'At the week\'s turn'}: ${first ?? 'done.'}`, tone: bad ? 'bad' : 'good', ref: { entry: x.id } });
  }
  return out;
}

/** The desk's header count: the same queue's Needs you (attention.ts). */
export function deskHeaderCount(s: GameState, ui: DeskUi = {}): number {
  return deskQueue(s, ui).needs.length;
}

export interface ReadyReview {
  /** Decisions not answered, and what each will be if he advances. */
  unanswered: { iid: string; title: string; becomes: string }[];
  /** Morning problems not answered this week (still to come or today). */
  mornings: { key: string; title: string; becomes: string }[];
  orders: { title: string; cost: number; pot: 'family' | 'pocket' }[];
  /** Known money out: orders, the evenings, the weekly bills. `familyAfter` is after all three (the bills come out of the Family). */
  costs: { orders: number; evenings: number; bills: number; familyAfter: number; pocketAfter: number };
  /** Short warnings (Family money below zero, an order the pocket can't pay). */
  warnings: string[];
  /** What lapses if he advances without seeing to it (a pitch, a woman waiting, Ma's match, a call to return). */
  lapses: { key: string; title: string; what: string }[];
  /** Men with nothing to do this week (they earn little or nothing); a note, never a block. */
  idle: number;
  /** Nothing waiting: the review can be skipped. */
  clear: boolean;
}

/** What advancing the week will do with what is (and isn't) decided. Pure. */
export function readyReview(s: GameState, ui: DeskUi = {}): ReadyReview {
  const answers = ui.answers ?? {};
  const orders = ui.orders ?? [];
  // A small ask his standing order hands to the consigliere is handled, not unanswered (delegation.ts).
  const taken = ui.taken ?? [];
  const unanswered = eventsOut(s).filter((e) => !answers[e.iid] && (taken.includes(`ev:${e.iid}`) || !delegatedAsk(s, e))).map((e) => {
    const ch = e.choices.find((c) => c.id === e.defaultChoiceId && !c.disabledReason) ?? e.choices.find((c) => !c.disabledReason) ?? e.choices[0];
    return { iid: e.iid, title: e.title, becomes: ch ? ch.label : 'Nothing' };
  });
  const d = daysOf(s);
  const mornings = weekCheckIns(s).filter((c) => c.problem && c.day >= d.day && !d.skipped.includes(c.day) && !d.answers[c.key]).map((c) => ({ key: c.key, title: `${DAY_NAMES[c.day]}: ${c.name}`, becomes: ownWay(c.problem!) }));
  const os = orders.map((a) => { const p = previewAction(s, a); return { title: p.title, cost: p.cost, pot: (p.pot === 'pocket' ? 'pocket' : 'family') as 'family' | 'pocket' }; });
  const q = queuedMoney(s, orders);
  const opts = roundOptions(s);
  const evenings = weekPlan(s).reduce((a, id, day) => a + (id && day >= d.day ? opts.find((x) => x.id === id)?.cost ?? 0 : 0), 0);
  const bills = obligations(s).filter((o) => o.weekly && o.kind !== 'receivable').reduce((a, o) => a + o.amount, 0);
  const warnings: string[] = [];
  if (q.familyLeft >= 0 && q.familyLeft - bills < 0) warnings.push(`After this week's orders the weekly bills (${fmtMoney(bills)}) take the Family below zero: the men notice when payroll is late.`);
  if (q.familyLeft < 0) warnings.push(`This week's orders need ${fmtMoney(-q.familyLeft)} more Family money than there is: some won't be carried out.`);
  const urgent = urgentMeetings(s).filter((u) => u.status === 'waiting');
  if (urgent.length) warnings.push(`${urgent.length === 1 ? `${urgent[0].who} is` : `${urgent.length} people are`} still waiting on an urgent meeting: what they heard lands whether you listen or not.`);
  if (q.pocketLeft - evenings < 0) warnings.push('Your evenings and pocket orders cost more than your pocket holds: the Family covers the evenings; pocket orders without your approval are skipped.');
  const lapses = lapsesThisWeek(s);
  const idle = eaters(s).filter((c) => c.rank !== 'capo' && isFree(s, c) && !loadOf(s, c).length && !orders.some((o) => JSON.stringify(o).includes(`"${c.id}"`))).length;
  return {
    unanswered, mornings, orders: os, lapses, idle,
    costs: { orders: os.reduce((a, o) => a + o.cost, 0), evenings, bills, familyAfter: Math.round(q.familyLeft - bills), pocketAfter: Math.round(q.pocketLeft - evenings) },
    warnings,
    clear: !unanswered.length && !mornings.length && !warnings.length && !os.length && !lapses.length,
  };
}


/** Things with a clock on them that run out when the week turns (each read off its own system; pure). */
export function lapsesThisWeek(s: GameState): { key: string; title: string; what: string }[] {
  const out: { key: string; title: string; what: string }[] = [];
  const nm = (id?: string) => { const c = id ? s.characters[id] : undefined; return c ? `${c.firstName} ${c.lastName}` : 'Someone'; };
  const next = s.week + 1;
  // A man's pitch (Let them eat): unanswered, he takes it somewhere else.
  for (const p of openPitches(s)) if (next >= p.due) out.push({ key: `pitch:${p.id}`, title: `${nm(p.by)}'s pitch: ${p.what}`, what: "He takes it somewhere else if you don't answer. (Crew ▸ Let them eat)" });
  // A woman who came to him: she moves on.
  const a = openApproachOf(s);
  if (a && next - a.w > OPEN_WEEKS) out.push({ key: `appr:${a.id}`, title: `${nm(a.id)} is waiting to hear from you`, what: 'She moves on if you leave it another week.' });
  // Ma's match for him: silence reads as "not now".
  const f = openFixOf(s);
  if (f && next - f.w >= FIX_WEEKS) out.push({ key: `fix:${f.id}`, title: `${nm(f.by)}'s match for you: ${nm(f.id)}`, what: 'Say nothing and she takes it as "not now, Ma".' });
  // The women of the house's match for one of the Family: silence lets her go ahead.
  const mp = openProposal(s);
  if (mp && next - mp.week >= SILENCE_WEEKS) out.push({ key: `match:${mp.id}`, title: `${nm(mp.by)}'s match for ${nm(mp.memberId)}`, what: 'Say nothing and she goes ahead with it.' });
  // A call to return before it goes cold.
  for (const m of missedCalls(s)) if (!m.p.once && m.until < next * 7) out.push({ key: `call:${m.id}`, title: `Call ${m.p.name} back`, what: "After this week the call can't be returned." });
  // A family that asked for a sit-down (minds/familyAsks.ts): ignored, it has a consequence.
  out.push(...askLapses(s));
  // Your wife (wife.ts): falling short of the nights home, or standing her up.
  out.push(...wifeLapses(s));
  return out;
}
