import { previewAction, queuedMoney } from './actions';
import { briefing } from './briefing';
import { weekCheckIns, type CheckProblem } from './checkins';
import { DAY_NAMES, daysOf, weekPlan } from './days';
import { fmtMoney } from './effects';
import { roundOptions } from './rounds';
import { SCHEME_INFO } from './schemes';
import { obligations } from './tribute';
import type { GameState, PlayerAction } from './types';

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

export type DeskKind = 'decision' | 'morning' | 'sitdown' | 'order' | 'bill' | 'upcoming';

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
  /** Where it goes: an event iid, a morning's day, a sit-down item, an order index. */
  ref: { event?: string; day?: number; brief?: string; order?: number; charId?: string };
}

export interface DeskGroup { kind: DeskKind; title: string; items: DeskItem[] }

export interface DeskUi {
  answers?: Record<string, string>;
  orders?: readonly PlayerAction[];
  briefSkip?: readonly string[];
}

const GROUP_TITLE: Record<DeskKind, string> = {
  decision: 'Decisions waiting', morning: 'Capos\' morning requests', sitdown: 'The sit-down recommends', order: 'Orders for this week', bill: 'Bills and what is owed', upcoming: 'Coming up',
};

export function bossDesk(s: GameState, ui: DeskUi = {}): DeskGroup[] {
  const answers = ui.answers ?? {};
  const orders = ui.orders ?? [];
  const groups: Record<DeskKind, DeskItem[]> = { decision: [], morning: [], sitdown: [], order: [], bill: [], upcoming: [] };
  for (const ev of s.pendingEvents) {
    const ans = answers[ev.iid];
    const ch = ev.choices.find((c) => c.id === (ans ?? ev.defaultChoiceId)) ?? ev.choices[0];
    groups.decision.push({ key: `ev:${ev.iid}`, kind: 'decision', title: ev.title, detail: ans ? `You chose: ${ch?.label}` : ev.text.length > 120 ? `${ev.text.slice(0, 117)}…` : ev.text, ifNothing: ans ? undefined : ch ? `"${ch.label}"` : undefined, done: !!ans, urgent: ev.mandatory && !ans, ref: { event: ev.iid } });
  }
  const d = daysOf(s);
  for (const c of weekCheckIns(s)) {
    if (!c.problem || c.day < d.day || d.skipped.includes(c.day)) continue;
    const ans = d.answers[c.key];
    const a = ans ? c.problem.answers.find((x) => x.id === ans) : undefined;
    groups.morning.push({ key: `am:${c.key}`, kind: 'morning', title: `${DAY_NAMES[c.day]}: ${c.name}`, detail: a ? `You said: ${a.label}` : c.problem.text, ifNothing: ans ? undefined : ownWay(c.problem), done: !!ans, urgent: c.problem.urgent && !ans, ref: { day: c.day, charId: c.capoId } });
  }
  const b = briefing(s);
  for (const it of b.items) {
    if (ui.briefSkip?.includes(it.id)) continue;
    const rec = it.options.find((o) => o.id === it.recommended);
    groups.sitdown.push({ key: `sd:${it.id}`, kind: 'sitdown', title: `${it.speaker}: ${it.topic}`, detail: rec ? `Recommends: ${rec.label}` : it.line, ifNothing: it.routine ? 'A trusted adviser may handle it himself' : 'It waits a week', ref: { brief: it.id, charId: it.charId } });
  }
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
  for (const sc of s.schemes.filter((x) => x.owner === 'player').slice(0, 4)) {
    groups.upcoming.push({ key: `sch:${sc.id}`, kind: 'upcoming', title: `${SCHEME_INFO[sc.kind].name} under way`, detail: `${sc.progress}% along`, ref: { charId: sc.targetId } });
  }
  return (Object.keys(groups) as DeskKind[]).map((k) => ({ kind: k, title: GROUP_TITLE[k], items: groups[k] })).filter((g) => g.items.length);
}

export interface ReadyReview {
  /** Decisions not answered, and what each will be if he advances. */
  unanswered: { iid: string; title: string; becomes: string }[];
  /** Morning problems not answered this week (still to come or today). */
  mornings: { key: string; title: string; becomes: string }[];
  orders: { title: string; cost: number; pot: 'family' | 'pocket' }[];
  /** Known money out: orders, the evenings, the weekly bills. */
  costs: { orders: number; evenings: number; bills: number; familyAfter: number; pocketAfter: number };
  /** Short warnings (Family money below zero, an order the pocket can't pay). */
  warnings: string[];
  /** Nothing waiting: the review can be skipped. */
  clear: boolean;
}

/** What advancing the week will do with what is (and isn't) decided. Pure. */
export function readyReview(s: GameState, ui: DeskUi = {}): ReadyReview {
  const answers = ui.answers ?? {};
  const orders = ui.orders ?? [];
  const unanswered = s.pendingEvents.filter((e) => !answers[e.iid]).map((e) => {
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
  if (q.familyLeft < 0) warnings.push(`This week's orders need ${fmtMoney(-q.familyLeft)} more Family money than there is: some won't be carried out.`);
  if (q.pocketLeft - evenings < 0) warnings.push('Your evenings and pocket orders cost more than your pocket holds: the Family covers the evenings; pocket orders without your approval are skipped.');
  return {
    unanswered, mornings, orders: os,
    costs: { orders: os.reduce((a, o) => a + o.cost, 0), evenings, bills, familyAfter: Math.round(q.familyLeft), pocketAfter: Math.round(q.pocketLeft - evenings) },
    warnings,
    clear: !unanswered.length && !mornings.length && !warnings.length && !os.length,
  };
}
