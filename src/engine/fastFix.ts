import { previewAction } from './actions';
import { touchesAMan } from './bundles';
import { isOpen } from './business';
import { seasonInfo } from './calendar';
import { crewBoard as crewBoard0 } from './crewBoard';
import { daysOf } from './days';
import { lapsesThisWeek, readyReview } from './desk';
import { fmtMoney } from './effects';
import { heavyOf } from './heavy';
import { heldReturns } from './invest';
import { mensMoney as mensMoney0 } from './mensMoney';
import { moneyView } from './money';
import { opinion } from './relations';
import { nightsPlan, wifeHere } from './wife';
import { leasable } from './worth';
import type { GameState, PlayerAction } from './types';

/**
 * FASTER AND EASIER (fast7): what is wrong, why, and the one fix, read off the
 * existing engines (crewBoard, mensMoney, money, invest, desk, wife). Pure;
 * every fix is an existing order that goes through the normal queue with its
 * odds, and nothing here ever proposes an order that kills, jails, exiles or
 * hands over a man of the boss's ("Fix all" only takes safe ones).
 */

/* One read of the crew board and the men's money per state (the top bar, the Desk and every face share it). */
const boardMemo = new WeakMap<GameState, ReturnType<typeof crewBoard0>>();
const moneyMemo = new WeakMap<GameState, ReturnType<typeof mensMoney0>>();
function crewBoard(s: GameState): ReturnType<typeof crewBoard0> {
  let v = boardMemo.get(s);
  if (!v) { v = crewBoard0(s); boardMemo.set(s, v); }
  return v;
}
function mensMoney(s: GameState): ReturnType<typeof mensMoney0> {
  let v = moneyMemo.get(s);
  if (!v) { v = mensMoney0(s); moneyMemo.set(s, v); }
  return v;
}

/* ------------------------------------------------------------------ */
/* Safe orders                                                         */
/* ------------------------------------------------------------------ */

const HARM_KINDS = new Set<string>(['declareWar', 'raid', 'army', 'underbelly', 'terms', 'dirty']);
const HARM_OPS = new Set<string>([
  'interact:whack', 'interact:threaten', 'interact:exile', 'interact:demote', 'interact:imprison',
  'mymen:warn', 'mymen:fine', 'mymen:demote', 'mymen:kill', 'mymen:shelf',
  'scheme:hit', 'scheme:murder', 'scheme:frame', 'intrigue:front', 'travel:flee', 'power:handover', 'ears:opDig',
]);

function opOf(a: PlayerAction): string | undefined {
  const r = a as { kind: string; id?: string; scheme?: string; op?: unknown };
  if (r.kind === 'interact') return r.id;
  if (r.kind === 'scheme') return r.scheme;
  const op = r.op;
  if (op && typeof op === 'object') {
    const o = op as { type?: string; op?: string; t?: string; c?: string };
    return o.type ?? o.op ?? o.t;
  }
  return typeof op === 'string' ? op : undefined;
}

/** An order that hurts, kills, jails, exiles or hands over somebody (never repeated or fixed for him). */
export function harmful(s: GameState, a: PlayerAction): boolean {
  if (HARM_KINDS.has(a.kind)) return true;
  const op = opOf(a);
  if (op && HARM_OPS.has(`${a.kind}:${op}`)) return true;
  if (/"(kill|whack|hit|murder|handover|handOver|exile)"/.test(JSON.stringify(a))) return true;
  try {
    const p = previewAction(s, a);
    return touchesAMan(p.effects) || p.effects.some((e) => e.type === 'kill' || e.type === 'imprison');
  } catch { return true; }
}

/** Can this order be given now, and is it one the boss can give without a second thought (not harmful, not heavy)? */
export function safeFix(s: GameState, a: PlayerAction): boolean {
  try {
    if (previewAction(s, a).disabledReason) return false;
    return !harmful(s, a) && !heavyOf(s, a);
  } catch { return false; }
}

/* ------------------------------------------------------------------ */
/* Same as last week                                                   */
/* ------------------------------------------------------------------ */

/** Orders that happen once (a purchase, an appointment, a standing change): never re-queued. */
const ONCE_KINDS = new Set<string>([
  'buyBusiness', 'sellBusiness', 'findFrontMan', 'charterBank', 'appoint', 'propose', 'dynasty', 'hire', 'edict', 'policy',
  'contract', 'reassign', 'declareWar', 'travel', 'nyc', 'power', 'capo', 'casino', 'lend', 'cancelScheme', 'mission', 'perk', 'lifestyle',
]);
const ONCE_OPS = new Set<string>([
  'econ:deal', 'econ:buyLot', 'econ:build', 'econ:sellLot', 'econ:leaseOut', 'econ:endLease', 'econ:manager', 'econ:hq', 'econ:rename',
  'econ:leaseLot', 'econ:racket', 'econ:bank', 'econ:home', 'econ:lux', 'econ:empire', 'econ:project', 'econ:upgrade', 'econ:renovate',
  'mymen:pitch', 'mymen:answer', 'mymen:selfscore', 'mymen:staff', 'mymen:raise', 'mymen:noshow', 'mymen:brother', 'mymen:tuition', 'mymen:debt',
  'interact:promote', 'interact:make', 'interact:recruit', 'interact:marry', 'dynasty:marry', 'spend:buy', 'spend:sell',
]);

export function onceOnly(a: PlayerAction): boolean {
  if (ONCE_KINDS.has(a.kind)) return true;
  const op = opOf(a);
  return !!op && (ONCE_OPS.has(`${a.kind}:${op}`) || /^(buy|sell|start|open|close|marry|promote|appoint)/i.test(op));
}

export interface RepeatRow { action: PlayerAction; title: string; ok: boolean; why?: string; chance?: number; cost: number; pot: 'family' | 'pocket' }

const bare = (a: PlayerAction): PlayerAction => { const { fund: _f, ...b } = a as PlayerAction & { fund?: string }; void _f; return b as PlayerAction; };
const same = (a: PlayerAction, b: PlayerAction) => JSON.stringify(bare(a)) === JSON.stringify(bare(b));

/**
 * Last week's orders, each with whether it can be given again now: still valid (the preview is not disabled),
 * not a one-time order, never a hit or anything that kills, jails or hands over a man, not already queued.
 * `ok` rows are the ones "Same as last week" offers (each can be unticked); the rest say why not.
 */
export function repeatLastWeek(s: GameState, last: readonly PlayerAction[], queued: readonly PlayerAction[] = []): RepeatRow[] {
  const out: RepeatRow[] = [];
  for (const a0 of last) {
    const a = bare(a0);
    if (out.some((r) => same(r.action, a))) continue;
    let title = a.kind as string;
    let why: string | undefined;
    let chance: number | undefined;
    let cost = 0;
    let pot: 'family' | 'pocket' = 'family';
    try {
      const p = previewAction(s, a);
      title = p.title;
      cost = p.cost || 0;
      pot = p.pot === 'pocket' ? 'pocket' : 'family';
      chance = (p.odds ?? p.acceptance)?.chance;
      why = harmful(s, a) ? 'Never repeated for you: it hurts somebody' : onceOnly(a) ? 'A one-time order' : p.disabledReason ?? (heavyOf(s, a) ? 'A heavy order: give it yourself' : undefined);
    } catch { why = 'No longer possible'; }
    if (!why && queued.some((q) => same(q, a))) why = 'Already ordered this week';
    out.push({ action: a, title, ok: !why, why, chance, cost, pot });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* The fix chips                                                       */
/* ------------------------------------------------------------------ */

export type FixKind = 'earn' | 'places' | 'debts' | 'grudges' | 'nights' | 'lapses';

export interface FixRow {
  key: string;
  name: string;
  why: string;
  fix: string;
  /** The one order that fixes it (absent: open the screen). */
  action?: PlayerAction;
  /** Not an order: book an evening with her on this day (wife.ts nights). */
  evening?: number;
  /** Safe for "Fix all" (never a heavy or harmful order). */
  safe: boolean;
}

export interface FixGroup { kind: FixKind; glyph: string; label: string; title: string; route: string; rows: FixRow[] }

export const GRUDGE = -25;

const nm = (c: { firstName: string; lastName: string }) => `${c.firstName} ${c.lastName}`;

function row(s: GameState, key: string, name: string, why: string, fix: string, action?: PlayerAction, evening?: number): FixRow {
  return { key, name, why, fix, action, evening, safe: evening !== undefined || (!!action && safeFix(s, action)) };
}

function earnRows(s: GameState): FixRow[] {
  const board = crewBoard(s).rows.filter((r) => (r.status === 'needs' || r.status === 'starving') && r.assign);
  const broke = mensMoney(s).rows.filter((r) => r.level === 'broke' && r.need.fix && !board.some((b) => b.c.id === r.c.id));
  return [
    ...board.map((r) => row(s, `earn:${r.c.id}`, nm(r.c), r.status === 'starving' ? 'starving: no work' : 'no work', r.assign!.label, r.assign!.action)),
    ...broke.map((r) => row(s, `broke:${r.c.id}`, nm(r.c), 'broke', r.need.fix!.label, r.need.fix!.action as PlayerAction)),
  ];
}

/** Places that lose money: a negative net a week (take less upkeep), or a loss on last week's books. */
export function losingPlaces(s: GameState): { id: string; name: string; net: number; why: string }[] {
  const last = new Map<string, number>();
  for (const l of s.lastReport?.lines ?? []) if (l.stat === 'money' && l.src) last.set(l.src, (last.get(l.src) ?? 0) + l.amount);
  const out: { id: string; name: string; net: number; why: string }[] = [];
  for (const h of heldReturns(s)) {
    if (h.b.leasedTo) continue;
    const lw = last.get(h.b.id);
    const weeks = Math.max(0, s.week - (h.b.boughtWeek ?? 0));
    if (weeks < 2) continue;
    if (h.net < 0) out.push({ id: h.b.id, name: h.b.name, net: h.net, why: `loses about ${fmtMoney(-h.net)} a week (takes ${fmtMoney(h.weekly)}, costs ${fmtMoney(h.upkeep)})` });
    else if (lw !== undefined && lw <= -150) out.push({ id: h.b.id, name: h.b.name, net: Math.round(lw), why: `lost ${fmtMoney(-lw)} last week` });
  }
  return out.sort((a, b) => a.net - b.net);
}

function placeRows(s: GameState): FixRow[] {
  return losingPlaces(s).map((p) => {
    const b = s.businesses.find((x) => x.id === p.id)!;
    const lease: PlayerAction = { kind: 'econ', op: { type: 'leaseOut', bizId: b.id } };
    const sell: PlayerAction = { kind: 'sellBusiness', businessId: b.id };
    const canLease = leasable(b) && isOpen(s, b) && !previewAction(s, lease).disabledReason;
    return canLease ? row(s, `place:${b.id}`, p.name, p.why, 'Lease it to an operator', lease) : row(s, `place:${b.id}`, p.name, p.why, 'Sell it (you confirm)', previewAction(s, sell).disabledReason ? undefined : sell);
  });
}

function debtRows(s: GameState): FixRow[] {
  const late = (s.loans ?? []).filter((l) => l.weeksLate > 0);
  if (!late.length) return [];
  const collect: PlayerAction = { kind: 'order', key: 'shylock', via: 'direct' };
  let ok = false;
  try { ok = !previewAction(s, collect).disabledReason; } catch { ok = false; }
  return late.map((l) => row(s, `loan:${l.id}`, l.borrower, `${l.weeksLate} week${l.weeksLate > 1 ? 's' : ''} late on ${fmtMoney(l.principal)}`, ok ? 'Collect the book' : 'See the loan desk', ok ? collect : undefined));
}

function grudgeRows(s: GameState): FixRow[] {
  const out: FixRow[] = [];
  for (const c of Object.values(s.characters)) {
    if (!c.alive || c.faction !== 'player' || c.id === s.playerId || !['capo', 'underboss', 'consigliere', 'soldier'].includes(c.rank)) continue;
    const op = opinion(s, c.id, s.playerId);
    if (op > GRUDGE) continue;
    const raise: PlayerAction = { kind: 'mymen', op: { op: 'raise', id: c.id } } as PlayerAction;
    const bonus: PlayerAction = { kind: 'mymen', op: { op: 'bonus', id: c.id, amount: c.rank === 'soldier' ? 150 : 300 } } as PlayerAction;
    const a = c.rank !== 'soldier' && !previewAction(s, raise).disabledReason ? raise : bonus;
    out.push(row(s, `grudge:${c.id}`, nm(c), `thinks ${op} of you`, a === raise ? 'A bigger end' : `A ${fmtMoney((a as { op: { amount: number } }).op.amount)} bonus`, previewAction(s, a).disabledReason ? undefined : a));
  }
  return out.sort((a, b) => a.why.localeCompare(b.why));
}

function nightRows(s: GameState, orders: readonly PlayerAction[]): FixRow[] {
  const w = wifeHere(s);
  if (!w) return [];
  const p = nightsPlan(s, orders);
  if (!p.need || p.home >= p.need) return [];
  const now = daysOf(s).day;
  const day = p.rows.find((r) => r.day >= now && r.kind === 'out' && !r.ans)?.day;
  return [row(s, 'nights', w.firstName, `nights home ${p.home}/${p.need} this week`, day !== undefined ? `An evening with ${w.firstName}` : 'Plan the evenings', undefined, day)];
}

function lapseRows(s: GameState): FixRow[] {
  return lapsesThisWeek(s).map((l) => ({ key: `lapse:${l.key}`, name: l.title, why: l.what, fix: 'Open it', safe: false }));
}

const memo = new WeakMap<GameState, Map<string, FixGroup[]>>();

/** Every fix chip with something to fix (empty groups are left out). */
export function fixGroups(s: GameState, orders: readonly PlayerAction[] = []): FixGroup[] {
  const k = JSON.stringify(orders.filter((o) => o.kind === 'dating' || o.kind === 'women' || o.kind === 'nightlife'));
  let m = memo.get(s);
  const hit = m?.get(k);
  if (hit) return hit;
  const all: FixGroup[] = [
    { kind: 'earn', glyph: '$', label: 'not earning', title: 'Men not earning', route: 'borgata.eat', rows: earnRows(s) },
    { kind: 'places', glyph: '▣', label: 'losing money', title: 'Places losing money', route: 'holdings.rackets', rows: placeRows(s) },
    { kind: 'debts', glyph: '%', label: 'owe you', title: 'Late on what they owe you', route: 'holdings.loandesk', rows: debtRows(s) },
    { kind: 'grudges', glyph: '☍', label: 'upset', title: 'Men with a grudge', route: 'borgata.grievances', rows: grudgeRows(s) },
    { kind: 'nights', glyph: '♥', label: 'nights short', title: 'Nights home this week', route: 'you.people', rows: nightRows(s, orders) },
    { kind: 'lapses', glyph: '⚑', label: 'runs out', title: 'Runs out when the week turns', route: 'desk', rows: lapseRows(s) },
  ];
  const out = all.filter((g) => g.rows.length);
  if (!m) { m = new Map(); memo.set(s, m); }
  m.set(k, out);
  return out;
}

/* ------------------------------------------------------------------ */
/* Money first                                                         */
/* ------------------------------------------------------------------ */

export interface Drain { key: string; label: string; amount?: number; why: string; fix: string; action?: PlayerAction; route?: string }

export interface MoneyStrip {
  /** This week, roughly: last week's take at this week's season, less the known orders, evenings and bills. */
  expected: number;
  /** Last week's actual net (both pots), undefined before the first week. */
  lastNet?: number;
  drains: Drain[];
  top?: { name: string; amount: number; kind: 'man' | 'place' };
}

/** Last week's take scaled to this week's season (the season multiplier moves the take). */
export function expectedNet(s: GameState, orders: readonly PlayerAction[] = []): number {
  const v = moneyView(s, true);
  const r = readyReview(s, { orders: [...orders] });
  const was = s.lastReport?.multiplier || 1;
  const now = seasonInfo(s.date).multiplier || 1;
  const take = v.week !== undefined ? Math.round(v.inTotal * (now / was)) : 0;
  return take - r.costs.orders - r.costs.evenings - r.costs.bills;
}

/** The money strip at the top of the Desk: expected and last net, the top 3 drains each with its fix, and the top earner. */
export function moneyStrip(s: GameState, orders: readonly PlayerAction[] = []): MoneyStrip {
  const v = moneyView(s, true);
  const drains: Drain[] = [];
  // Idle men: the crew board's first one to put to work.
  const idle = crewBoard(s).rows.filter((x) => (x.status === 'needs' || x.status === 'starving') && x.assign);
  if (idle.length) drains.push({ key: 'idle', label: `${idle.length} m${idle.length === 1 ? 'an' : 'en'} idle`, why: 'Idle men draw wages and earn nothing.', fix: `${idle[0].c.firstName}: ${idle[0].assign!.label}`, action: idle[0].assign!.action, route: 'borgata.eat' });
  // The biggest leak the money view sees (a crew short on the count, the cut, a place, a heavy kind of spending).
  if (v.leak) drains.push({ key: `leak:${v.leak.group}`, label: v.leak.label, amount: v.leak.amount, why: v.leak.why, fix: v.leak.fix, action: v.leak.action, route: v.leak.route });
  // The editor's envelopes (the press), as a standing order.
  const press = (s.lastReport?.lines ?? []).filter((l) => l.stat === 'money' && l.amount < 0 && /editor|the tide|press|reporter|galleys/i.test(String(l.label))).reduce((a, l) => a - l.amount, 0);
  if (press > 0) drains.push({ key: 'press', label: "The editor's envelopes", amount: Math.round(press), why: 'Paid to keep stories out of the paper.', fix: 'Change the standing order', route: 'borgata.chain' });
  // A place that loses money: lease it (or sell it, your call).
  for (const p of placeRows(s).slice(0, 2)) if (!drains.some((d) => d.key === 'leak:upkeep' && d.label.startsWith(p.name))) drains.push({ key: p.key, label: p.name, amount: Math.abs(losingPlaces(s).find((x) => `place:${x.id}` === p.key)?.net ?? 0), why: p.why, fix: p.fix, action: p.action, route: 'holdings.rackets' });
  // Winter: the places that cost more than they take off-season.
  if (!seasonInfo(s.date).inSeason) {
    const cold = heldReturns(s).filter((h) => !h.b.leasedTo && h.upkeep > h.weekly);
    if (cold.length && !drains.some((d) => d.key.startsWith('place:'))) drains.push({ key: 'winter', label: `Winter costs (${cold.length} place${cold.length > 1 ? 's' : ''})`, amount: cold.reduce((a, h) => a + h.upkeep - h.weekly, 0), why: 'Off-season, they cost more to run than they take.', fix: 'Lease them for the winter', route: 'holdings.rackets' });
  }
  const top = v.top[0];
  return {
    expected: expectedNet(s, orders),
    lastNet: v.week !== undefined ? v.net : undefined,
    drains: drains.sort((a, b) => (b.amount ?? 1e9) - (a.amount ?? 1e9)).slice(0, 3),
    top: top ? { name: top.name, amount: top.amount, kind: top.kind } : undefined,
  };
}

/* ------------------------------------------------------------------ */
/* Hot or cold                                                         */
/* ------------------------------------------------------------------ */

export type Heat = 'green' | 'amber' | 'red';
export interface FaceMark { tone: Heat; why: string }

const marks = new WeakMap<GameState, Map<string, FaceMark>>();

/** The marker on a man's face: green earning, amber idle, red broke or holding a grudge. Undefined for anyone else (or away). */
export function faceMark(s: GameState, id: string): FaceMark | undefined {
  let m = marks.get(s);
  if (!m) {
    m = new Map();
    try {
      const board = crewBoard(s);
      const money = new Map(mensMoney(s).rows.map((r) => [r.c.id, r]));
      for (const r of board.rows) {
        const op = opinion(s, r.c.id, s.playerId);
        const mm = money.get(r.c.id);
        if (mm?.level === 'broke') m.set(r.c.id, { tone: 'red', why: `Broke: has ${fmtMoney(mm.has)}${mm.owes ? `, owes ${fmtMoney(mm.owes)}` : ''}` });
        else if (op <= GRUDGE) m.set(r.c.id, { tone: 'red', why: `A grudge: thinks ${op} of you` });
        else if (r.status === 'needs' || r.status === 'starving') m.set(r.c.id, { tone: 'amber', why: r.status === 'starving' ? 'Idle and starving: no work' : 'Idle: no work' });
        else if (r.status === 'earning' || r.status === 'own' || r.status === 'over') m.set(r.c.id, { tone: 'green', why: `Earning${r.upWeek ? `: kicks up about ${fmtMoney(r.upWeek)} a week` : ''}${r.status === 'over' ? ' (overworked)' : ''}` });
      }
    } catch { /* no marks */ }
    marks.set(s, m);
  }
  return m.get(id);
}
