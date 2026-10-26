import { CATALOG } from './catalog';
import { isInSeason } from './calendar';
import { shortName } from './characters';
import { earningsBoard } from './crewPurse';
import type { Ctx } from './ledger';
import { xfer } from './tribute';
import { ensureTribute, familyCash, normSplit, pctOf, pocketCash } from './tributeState';
import type { GameState, PlayerAction, ReportLine } from './types';

/**
 * MONEY, MADE SIMPLE. Two pots instead of four:
 *  - The Family: the treasury (`s.money`), everything operational. The old reserve lives on as an
 *    optional "set aside for lawyers & emergencies" line inside it (`tribute.acct.reserve`, filled only
 *    if the boss sets a set-aside share; it covers the treasury when it runs dry).
 *  - Your Pocket: the boss's own money (`tribute.acct.personal`): the Good Life, gifts, his household.
 * The envelope is split by ONE number, your cut, every week on its own. Everything the family earns is
 * collected automatically; the only lever is one global "Squeeze harder this week".
 *
 * `moneyView` is the Money screen (Holdings › Money, the top bar): this week as IN → OUT → NET, from
 * the one ledger (the Family) and the week's transfer journal (the Pocket and the set-aside), so its
 * NET is exactly the change in Family + Pocket. Pure; safe in render.
 */

/* ------------------------------------------------------------------ */
/* Migration: an older save moves to the two pots inside its next week */
/* ------------------------------------------------------------------ */

/** Old default (15% you / 75% family / 10% reserve). */
const OLD_DEFAULT = { personal: 1500, reserve: 1000 };

/**
 * Called by the engine right after the week's books open: the old reserve is folded into the Family
 * (a journal transfer and a ledger line, so both reconcile), the set-aside share goes to 0, and a
 * boss still on the old default split gets the new default cut (25%). His own money stays his.
 */
export function twoPots(ctx: Ctx): void {
  const s = ctx.s;
  const t = ensureTribute(s);
  if (t.pots === 2) return;
  if (t.acct.reserve > 0) xfer(ctx, 'reserve', 'treasury', t.acct.reserve, 'transfer', `w${s.week}:twopots`, { label: 'Two pots: the old reserve folded into the Family', category: 'transfer' });
  const personal = t.policy.personal === OLD_DEFAULT.personal && t.policy.reserve === OLD_DEFAULT.reserve ? 2500 : t.policy.personal;
  t.policy = { ...normSplit({ personal, reserve: 0 }), auto: t.policy.auto };
  t.pots = 2;
}

/* ------------------------------------------------------------------ */
/* Bigger, faster money: the take scales with what the family holds    */
/* ------------------------------------------------------------------ */

/**
 * The money pass's rebalance (check with `npx tsx scripts/sim.ts --games 30 --years 1`, the "Money curve" line): the crews' corners and hustle, the street with
 * no capo, and the rackets pay more than they used to, and each grows with the family's reach.
 */
export const INCOME = { corners: 1.75, hustle: 1.6, street: 1.5, rackets: 1.35 } as const;
/**
 * The season surge: the boost is biggest from Memorial Day to Labor Day (the island is full) and
 * small in the winter (a quarter of it), so the first winter still bites a boss who spent the summer's money.
 */
export const SEASON_BOOST = { summer: 1.3, winter: 0.25 } as const;

/** The money pass's income multiplier for one stream this week (season-weighted). */
export function incomeBoost(s: GameState, k: keyof typeof INCOME): number {
  const f = isInSeason(s.date) ? SEASON_BOOST.summer : SEASON_BOOST.winter;
  return Math.max(1, 1 + (INCOME[k] - 1) * f);
}
/** The fronts wash more (the books claim more customers), so the bigger take does not all pile up unwashed. */
export const WASH_SCALE = 2.2;
/** Every district the family runs (50%+ of the action) makes every corner pay more: protection prices go up. */
export const TERRITORY_STEP = 0.06;
export const TERRITORY_CAP = 0.45;
/** Every racket past the first feeds the others (layoff bets, runners, a fence): the network. */
export const NETWORK_STEP = 0.05;
export const NETWORK_CAP = 0.35;

/** Districts where the family holds 50%+ of the action. */
export function heldDistricts(s: GameState): number {
  return s.districts.filter((d) => (d.influence.player ?? 0) >= 50).length;
}

/** The territory multiplier on the crews' corners and hustle (1 + 6% a district held, capped). */
export function territoryMult(s: GameState): number {
  return 1 + Math.min(TERRITORY_CAP, TERRITORY_STEP * heldDistricts(s));
}

/** The rackets' network multiplier (1 + 5% for each racket past the first, capped). */
export function racketNetMult(s: GameState): number {
  const n = s.businesses.filter((b) => b.owner === 'player' && b.category === 'racket').length;
  return 1 + Math.min(NETWORK_CAP, NETWORK_STEP * Math.max(0, n - 1));
}

/** Your cut above this, and the capos notice: each skims a little more (economy.ts skimRate). */
export const GREED_CUT = 4000;

/** Extra skim the capos allow themselves when the boss's cut is greedy (0 at 40% or less). */
export function greedSkim(s: GameState): number {
  const cut = s.tribute?.policy.personal ?? 0;
  return cut >= 5000 ? 0.12 : cut > GREED_CUT ? 0.05 : 0;
}

/* ------------------------------------------------------------------ */
/* The one lever: Squeeze harder this week                             */
/* ------------------------------------------------------------------ */

export const SQUEEZE = { mult: 1.3, markers: 0.45, heat: 2, opinion: -3, gap: 4 } as const;

/** This week's squeeze multiplier on the crews' corners and hustle (1 when not squeezing). */
export function squeezeMult(s: GameState): number {
  return s.tribute?.squeeze === s.week ? SQUEEZE.mult : 1;
}

/** Share of a book's markers paid in this week (welshers lean harder when squeezed). */
export function markerPayRate(s: GameState): number {
  // Auto-collect: the welshers pay a fifth of what they owe every week on their own (no chasing them by hand).
  return s.tribute?.squeeze === s.week ? SQUEEZE.markers : 0.2;
}

export function squeezeWhy(s: GameState): string | undefined {
  const w = s.tribute?.squeeze;
  if (w !== undefined && s.week - w < SQUEEZE.gap) return `Squeezed ${s.week - w === 0 ? 'this week' : `${s.week - w} week${s.week - w > 1 ? 's' : ''} ago`}; the street needs ${SQUEEZE.gap} weeks to forget`;
  return undefined;
}

/** The order's own effect: this week is a squeeze week (its heat and the men's mood are chips on the order). */
export function applySqueeze(ctx: Ctx): void {
  const s = ctx.s;
  const t = ensureTribute(s);
  if (squeezeWhy(s)) return;
  t.squeeze = s.week;
}

/* ------------------------------------------------------------------ */
/* The Money view                                                      */
/* ------------------------------------------------------------------ */

export type FlowGroup =
  | 'rackets' | 'business' | 'kickups' | 'street' | 'rents' | 'cut' | 'otherIn'
  | 'wages' | 'philly' | 'upkeep' | 'pad' | 'goodlife' | 'loans' | 'raids' | 'invest' | 'otherOut';

export const GROUP_LABEL: Record<FlowGroup, string> = {
  rackets: 'Rackets', business: 'Businesses', kickups: 'Kick-ups from the crews', street: 'The street (hustle, corners with no capo)', rents: 'Rents & vig', cut: 'Your cut of the envelope', otherIn: 'Other money in',
  wages: 'Wages & payroll', philly: 'Philadelphia\'s tribute', upkeep: 'Upkeep & running costs', pad: 'Envelopes: cops & politicians', goodlife: 'The Good Life & your household', loans: 'Loan payments', raids: 'Raids, fines & rivals', invest: 'Buying & building', otherOut: 'Other spending',
};

/** Where a group is managed (a shell route or old tab id). */
export const GROUP_ROUTE: Partial<Record<FlowGroup, string>> = {
  rackets: 'holdings.hub', business: 'holdings.rackets', kickups: 'borgata.earnings', street: 'borgata.capos', rents: 'holdings.property', cut: 'borgata.take',
  wages: 'borgata.capos', philly: 'diplomacy.table', upkeep: 'holdings.rackets', pad: 'town.cityhall', goodlife: 'you.possessions', loans: 'holdings.take', raids: 'borgata.orders', invest: 'holdings.property',
};

export interface FlowItem { label: string; amount: number; who?: string; src?: string }
export interface FlowRow { group: FlowGroup; label: string; amount: number; pot: 'family' | 'pocket' | 'both'; items: FlowItem[]; route?: string }

export interface Leak { group: FlowGroup | 'short' | 'cut'; label: string; amount: number; why: string; fix: string; action?: PlayerAction; route?: string }

export interface MoneyView {
  /** The week this flow is (the last week played), or undefined before the first week. */
  week?: number;
  family: number;
  setAside: number;
  pocket: number;
  /** An envelope on the desk waiting for the Monday split (not yet in either pot). */
  waiting: number;
  familyDelta: number;
  pocketDelta: number;
  inRows: FlowRow[];
  outRows: FlowRow[];
  inTotal: number;
  outTotal: number;
  /** inTotal − outTotal == familyDelta + pocketDelta (every dollar from the ledger and the journal). */
  net: number;
  /** What came in landed in which pot (the cut is the Pocket's share), and what each pot paid out. */
  famIn: number;
  pocketIn: number;
  famOut: number;
  pocketOut: number;
  /** The flow, simplified for the Money screen: where it came from and where it went (a handful of groups each). */
  sources: FlowStage[];
  uses: FlowStage[];
  cutPct: number;
  setAsidePct: number;
  /** The last 8 weeks: what came in, what went out, and the two pots at the end of each (in/out absent for weeks played on an older build). */
  hist: MoneyWeek[];
  top: { id: string; name: string; amount: number; kind: 'man' | 'place' }[];
  leak?: Leak;
}

/** One stage of the simplified flow (a source of money or a use of it). */
export interface FlowStage { key: string; label: string; amount: number; route?: string }

/** One week of the money trend (kept 12 weeks in `tribute.flow`). */
export interface MoneyWeek { week: number; in?: number; out?: number; family: number; pocket: number }

/** Where the money came from, as the boss thinks of it: five sources. */
const SOURCE_OF: Record<FlowGroup, string | undefined> = {
  business: 'business', rackets: 'rackets', kickups: 'crews', cut: 'crews', street: 'street', rents: 'loans', otherIn: 'other',
  wages: undefined, philly: undefined, upkeep: undefined, pad: undefined, goodlife: undefined, loans: undefined, raids: undefined, invest: undefined, otherOut: undefined,
};
const SOURCE_LABEL: Record<string, string> = { business: 'Businesses', rackets: 'Rackets', crews: 'Crew envelopes', street: 'The street', loans: 'Loans, vig & rents', other: 'Other' };
const SOURCE_ROUTE: Record<string, string> = { business: 'holdings.rackets', rackets: 'holdings.hub', crews: 'borgata.earnings', street: 'borgata.capos', loans: 'holdings.property' };
/** Where it went: payroll, cops, upkeep, lifestyle, and the rest. */
const USE_OF: Partial<Record<FlowGroup, string>> = { wages: 'payroll', pad: 'cops', upkeep: 'upkeep', goodlife: 'lifestyle', philly: 'philly', loans: 'debt', raids: 'raids', invest: 'invest', otherOut: 'other' };
const USE_LABEL: Record<string, string> = { payroll: 'Payroll', cops: 'Cops & politicians', upkeep: 'Upkeep', lifestyle: 'Lifestyle', philly: 'Philadelphia', debt: 'Loan payments', raids: 'Raids & fines', invest: 'Buying & building', other: 'Other' };

function stages(rows: FlowRow[], of: Partial<Record<FlowGroup, string | undefined>>, label: Record<string, string>, route: Partial<Record<string, string>>): FlowStage[] {
  const by = new Map<string, FlowStage>();
  for (const r of rows) {
    const k = of[r.group] ?? 'other';
    const x = by.get(k) ?? { key: k, label: label[k] ?? k, amount: 0, route: route[k] ?? r.route };
    x.amount += r.amount;
    by.set(k, x);
  }
  return [...by.values()].filter((x) => x.amount > 0).sort((a, b) => (a.key === 'other' ? 1 : b.key === 'other' ? -1 : b.amount - a.amount));
}

const PAD = /^(Payroll: |Bribe: |Envelopes for the beat cops)|Grease the Chief|on the pad|envelopes downtown|friends at the federal building|lunches in Trenton|No-show jobs/i;
const WAGES = /^Wages|: payroll \(|salaries|Manager's share|Bodyguards|Lawyers & family support|Running things from inside|specialist|fee/i;
const UPKEEP = /^Upkeep|Off-season|first winter|^Laundering|supplies|utilities|^Lease: |Property tax|\(capital\)|Perks: thin margins|Bookkeeper's hours|The mattresses|^Headquarters|^HQ|In exile/i;
const INVEST = /^(Construction: |Community: |Buy |Bought |Open |Build |Upgrade )|: .*\(week \d+ of \d+, capital\)|^Investment: |Deal: |down payment/i;
const RENTS = /^(Vig: |Loan repaid: |Rent: |Property: )/;

/** Which group a Family ledger line belongs to. */
export function lineGroup(s: GameState, l: ReportLine): FlowGroup {
  const pos = l.amount > 0;
  if (pos) {
    if (RENTS.test(l.label)) return 'rents';
    if (l.category === 'kickup') return 'kickups';
    if (l.category === 'street') return 'street';
    if (l.category === 'business') {
      const b = l.src ? s.businesses.find((x) => x.id === l.src) : undefined;
      if (b && CATALOG[b.kind]?.category === 'racket') return 'rackets';
      return 'business';
    }
    return 'otherIn';
  }
  if (l.category === 'tribute') return 'philly';
  if (l.category === 'debt') return 'loans';
  if (l.category === 'heat' || l.category === 'rival') return 'raids';
  if (/^(The Good Life|Household & appearances)/.test(l.label)) return 'goodlife';
  if (PAD.test(l.label)) return 'pad';
  if (INVEST.test(l.label)) return 'invest';
  if (WAGES.test(l.label)) return 'wages';
  if (UPKEEP.test(l.label)) return 'upkeep';
  if (l.category === 'business') return 'upkeep'; // a losing week at a place
  if (l.category === 'event' && Math.abs(l.amount) >= 1500) return 'invest';
  return 'otherOut';
}

const POTS = new Set(['treasury', 'reserve', 'personal']);

/** The Pocket's and the set-aside's own movements this week (journal transfers with the outside world). */
function journalFlows(s: GameState, week: number): { inn: { g: FlowGroup; pot: 'family' | 'pocket'; label: string; a: number }[]; out: { g: FlowGroup; pot: 'family' | 'pocket'; label: string; a: number }[] } {
  const b = s.tribute?.books.find((x) => x.week === week);
  const inn: { g: FlowGroup; pot: 'family' | 'pocket'; label: string; a: number }[] = [];
  const out: { g: FlowGroup; pot: 'family' | 'pocket'; label: string; a: number }[] = [];
  if (!b) return { inn, out };
  for (const [f, to, a, c, n] of b.x) {
    // The treasury side is in the ledger; moves between the pots cancel.
    if (f === 'treasury' || to === 'treasury') continue;
    if (POTS.has(f) && POTS.has(to)) continue;
    if (POTS.has(to)) {
      if (to === 'personal') inn.push({ g: c === 'don_personal_share' ? 'cut' : 'otherIn', pot: 'pocket', label: c === 'don_personal_share' ? 'Your cut of the envelope' : n ?? 'Into your Pocket', a });
      else inn.push({ g: 'kickups', pot: 'family', label: 'Set aside from the envelope (lawyers & emergencies)', a });
    } else if (POTS.has(f)) {
      const pot = f === 'personal' ? 'pocket' : 'family';
      const label = n ?? (to.startsWith('wealth:') ? 'To one of the men' : 'Spent');
      const g: FlowGroup = f === 'personal' ? (/allowance/i.test(label) || /^(Household|The Good Life)/.test(label) || to === 'ext:household' ? 'goodlife' : 'otherOut') : /^Investment: /.test(label) ? 'invest' : /Lawyers/i.test(label) ? 'wages' : 'otherOut';
      out.push({ g, pot, label, a });
    }
  }
  return { inn, out };
}

function rowsOf(entries: { g: FlowGroup; pot: 'family' | 'pocket'; item: FlowItem }[]): FlowRow[] {
  const by = new Map<FlowGroup, FlowRow>();
  for (const e of entries) {
    const r = by.get(e.g) ?? { group: e.g, label: GROUP_LABEL[e.g], amount: 0, pot: e.pot, items: [], route: GROUP_ROUTE[e.g] };
    if (r.pot !== e.pot) r.pot = 'both';
    r.amount += e.item.amount;
    const same = r.items.find((x) => x.label === e.item.label && x.who === e.item.who);
    if (same) same.amount += e.item.amount;
    else r.items.push({ ...e.item });
    by.set(e.g, r);
  }
  const rows = [...by.values()].filter((r) => r.amount !== 0);
  for (const r of rows) r.items.sort((a, b) => b.amount - a.amount);
  return rows.sort((a, b) => b.amount - a.amount);
}

/** Kick-up lines grouped by crew (the capo who sent it up), so the row reads "Moretti's crew $X". */
function crewItems(s: GameState, items: FlowItem[]): FlowItem[] {
  const by = new Map<string, FlowItem>();
  for (const it of items) {
    const c = it.who ? s.characters[it.who] : undefined;
    const key = c && c.rank === 'capo' ? c.id : it.label.startsWith('Set aside') ? 'aside' : 'other';
    const label = c && c.rank === 'capo' ? `${shortName(c)}'s crew` : key === 'aside' ? it.label : it.label.startsWith('Late kick-up') || it.label.startsWith('Arrears') ? 'Late money & arrears' : 'Other kick-ups';
    const x = by.get(key) ?? { label, amount: 0, who: c?.rank === 'capo' ? c.id : undefined };
    x.amount += it.amount;
    by.set(key, x);
  }
  return [...by.values()].sort((a, b) => b.amount - a.amount);
}

/** `lite` skips the top earners and the leak (the weekly trend and the top bar need only the totals). */
export function moneyView(s: GameState, lite = false): MoneyView {
  const t = s.tribute;
  const r = s.lastReport;
  const pol = t?.policy ?? { personal: 2500, treasury: 7500, reserve: 0 };
  const base: MoneyView = {
    family: familyCash(s), setAside: t?.acct.reserve ?? 0, pocket: pocketCash(s), waiting: t?.reports.find((x) => x.status === 'presented')?.presented ?? 0,
    familyDelta: 0, pocketDelta: 0, inRows: [], outRows: [], inTotal: 0, outTotal: 0, net: 0, famIn: 0, pocketIn: 0, famOut: 0, pocketOut: 0, sources: [], uses: [], cutPct: pctOf(pol.personal), setAsidePct: pctOf(pol.reserve), hist: [], top: [],
  };
  base.hist = moneyHist(s);
  if (!r) return base;
  base.week = r.week;
  const ins: { g: FlowGroup; pot: 'family' | 'pocket'; item: FlowItem }[] = [];
  const outs: { g: FlowGroup; pot: 'family' | 'pocket'; item: FlowItem }[] = [];
  for (const l of r.lines) {
    if (l.stat !== 'money' || l.amount === 0 || l.category === 'transfer') continue;
    const g = lineGroup(s, l);
    const item = { label: l.label, amount: Math.abs(l.amount), who: l.who, src: l.src };
    (l.amount > 0 ? ins : outs).push({ g, pot: 'family', item });
  }
  const j = journalFlows(s, r.week);
  for (const x of j.inn) ins.push({ g: x.g, pot: x.pot, item: { label: x.label, amount: x.a } });
  for (const x of j.out) outs.push({ g: x.g, pot: x.pot, item: { label: x.label, amount: x.a } });
  base.inRows = rowsOf(ins);
  base.outRows = rowsOf(outs);
  const kick = base.inRows.find((x) => x.group === 'kickups');
  if (kick) kick.items = crewItems(s, kick.items);
  for (const e of ins) if (e.pot === 'pocket') base.pocketIn += e.item.amount; else base.famIn += e.item.amount;
  for (const e of outs) if (e.pot === 'pocket') base.pocketOut += e.item.amount; else base.famOut += e.item.amount;
  base.sources = stages(base.inRows, SOURCE_OF, SOURCE_LABEL, SOURCE_ROUTE);
  base.uses = stages(base.outRows, USE_OF, USE_LABEL, {});
  base.inTotal = base.inRows.reduce((a, x) => a + x.amount, 0);
  base.outTotal = base.outRows.reduce((a, x) => a + x.amount, 0);
  base.net = base.inTotal - base.outTotal;
  const b = t?.books.find((x) => x.week === r.week);
  const famStart = r.start.money + (b?.start.reserve ?? 0);
  const famEnd = r.end.money + (b?.end.reserve ?? 0);
  base.familyDelta = Math.round(famEnd - famStart);
  base.pocketDelta = b ? (b.end.personal ?? 0) - (b.start.personal ?? 0) : 0;
  if (lite) return base;
  base.top = topEarners(s, r.lines);
  base.leak = biggestLeak(s, base);
  return base;
}

/** Weeks of money trend kept in `tribute.flow`. */
export const FLOW_WEEKS = 12;

/**
 * End of the week (engine.ts, after the report is filed): this week's totals go into the trend.
 * Pure arithmetic on the report and the journal; no dice.
 */
export function recordMoneyWeek(s: GameState): void {
  const t = s.tribute;
  if (!t || !s.lastReport) return;
  const v = moneyView(s, true);
  const row: MoneyWeek = { week: s.lastReport.week, in: Math.round(v.inTotal), out: Math.round(v.outTotal), family: Math.round(v.family), pocket: Math.round(v.pocket) };
  t.flow = [...(t.flow ?? []).filter((x) => x.week !== row.week), row].slice(-FLOW_WEEKS);
}

/** The last 8 weeks for the trend: the recorded flow, or (an older save) the pots from the archived books. */
export function moneyHist(s: GameState, n = 8): MoneyWeek[] {
  const t = s.tribute;
  const flow = t?.flow ?? [];
  const books = (t?.books ?? []).map((b) => ({ week: b.week, family: Math.round((b.end.treasury ?? 0) + (b.end.reserve ?? 0)), pocket: b.end.personal ?? 0 }));
  const by = new Map<number, MoneyWeek>();
  for (const b of books) by.set(b.week, b);
  for (const f of flow) by.set(f.week, f);
  return [...by.values()].sort((a, b) => a.week - b.week).slice(-n);
}

/** The family's five best earners last week: men by what they kicked up, places by what they paid in. */
export function topEarners(s: GameState, lines: readonly ReportLine[] = s.lastReport?.lines ?? []): MoneyView['top'] {
  const out: MoneyView['top'] = [];
  for (const row of earningsBoard(s).rows) {
    const c = s.characters[row.id];
    if (c && row.up > 0) out.push({ id: c.id, name: `${c.firstName} ${c.lastName}`, amount: row.up, kind: 'man' });
  }
  const places = new Map<string, number>();
  for (const l of lines) if (l.stat === 'money' && l.category === 'business' && l.src && s.businesses.some((b) => b.id === l.src)) places.set(l.src, (places.get(l.src) ?? 0) + l.amount);
  for (const [id, a] of places) if (a > 0) out.push({ id, name: s.businesses.find((b) => b.id === id)!.name, amount: Math.round(a), kind: 'place' });
  return out.sort((a, b) => b.amount - a.amount).slice(0, 5);
}

/** The biggest leak this week, with a one-click fix. */
export function biggestLeak(s: GameState, v: Pick<MoneyView, 'outRows' | 'inTotal' | 'familyDelta' | 'cutPct' | 'family'>): Leak | undefined {
  const cands: Leak[] = [];
  const t = s.tribute;
  const rep = t?.reports[t.reports.length - 1];
  // A crew that came in short: have the books checked.
  if (rep) {
    const worst = [...rep.crews].sort((a, b) => b.short - a.short)[0];
    const k = worst ? s.characters[worst.capoId] : undefined;
    if (worst && k && worst.short >= 150) cands.push({ group: 'short', label: `${shortName(k)}'s crew came in short`, amount: worst.short, why: `${k.firstName}'s men owed ${fmt(worst.due)} and paid ${fmt(worst.paid)}.`, fix: `Go through ${k.firstName}'s crew books ($200)`, action: { kind: 'tribute', op: { op: 'audit', capoId: k.id } } });
  }
  // A place that lost money: look at it.
  const places = new Map<string, number>();
  for (const l of s.lastReport?.lines ?? []) if (l.stat === 'money' && l.src && s.businesses.some((b) => b.id === l.src && b.owner === 'player')) places.set(l.src, (places.get(l.src) ?? 0) + l.amount);
  const loser = [...places.entries()].sort((a, b) => a[1] - b[1])[0];
  if (loser && loser[1] <= -150) {
    const b = s.businesses.find((x) => x.id === loser[0])!;
    cands.push({ group: 'upkeep', label: `${b.name} lost money`, amount: -loser[1], why: `It cost more to run than it took in last week.`, fix: `Open ${b.name}: change how it runs, or sell it`, route: 'holdings.rackets' });
  }
  // The family running dry while the boss takes a big cut.
  if (v.familyDelta < 0 && v.cutPct > 15 && v.family < 8000) {
    const lower = Math.max(10, v.cutPct - 10);
    cands.push({ group: 'cut', label: 'Your cut while the Family runs dry', amount: Math.abs(v.familyDelta), why: `The Family lost ${fmt(-v.familyDelta)} this week and has ${fmt(v.family)} left.`, fix: `Lower your cut to ${lower}% until it recovers`, action: { kind: 'tribute', op: { op: 'policy', split: normSplit({ personal: lower * 100, reserve: t?.policy.reserve ?? 0 }) } } });
  }
  // The heaviest kind of spending, where it is managed.
  const FIX: Partial<Record<FlowGroup, string>> = {
    wages: 'Put idle men on a racket, or let an associate go', pad: 'Check who you are paying at City Hall', upkeep: 'Look at what each place costs to run', philly: 'Send Sal Moretti a gift, or take the tribute perk',
    goodlife: 'Sell something you do not use (upkeep every week)', loans: 'Pay the loan down when the season comes', raids: 'Lie low: cool the heat before the next raid', otherOut: 'Check last week\'s report line by line',
  };
  const spend = v.outRows.filter((r) => r.group !== 'invest' && FIX[r.group]).sort((a, b) => b.amount - a.amount)[0];
  if (spend && v.inTotal > 0 && spend.amount >= v.inTotal * 0.2) cands.push({ group: spend.group, label: spend.label, amount: spend.amount, why: `${Math.round((spend.amount / v.inTotal) * 100)}% of everything that came in went here.`, fix: FIX[spend.group]!, route: spend.route });
  return cands.sort((a, b) => b.amount - a.amount)[0];
}

/** The top bar: each pot with its change, and the top 3 in and out. */
export function moneyTop(s: GameState): { family: number; pocket: number; setAside: number; familyDelta?: number; pocketDelta?: number; topIn: FlowItem[]; topOut: FlowItem[] } {
  const v = moneyView(s, true);
  return {
    family: v.family, pocket: v.pocket, setAside: v.setAside, familyDelta: v.week !== undefined ? v.familyDelta : undefined, pocketDelta: v.week !== undefined ? v.pocketDelta : undefined,
    topIn: v.inRows.slice(0, 3).map((r) => ({ label: r.label, amount: r.amount })), topOut: v.outRows.slice(0, 3).map((r) => ({ label: r.label, amount: r.amount })),
  };
}

function fmt(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}
