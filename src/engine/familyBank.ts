import type { ActionPreview } from './actions';
import { heat, respect, type Ctx } from './ledger';
import { fact } from './livingKnow';
import { pay } from './livingMoney';
import { clamp, pname, present, roll, type LivingState, type Td, type Th } from './livingState';
import { chemicalBank, homeRent, weeklyDebt, weeklyIncome } from './housing';
import { livingIndex, newDebt, upkeepOf, useEconomics } from './livingWorld';
import { inflation, USES_BY_ID } from './property';
import type { EventInstance, GameState } from './types';

/**
 * THE FAMILY'S LOAN DESK. Two tiers of lending in town:
 *
 *  - Chemical Bank, the legitimate bank, looks at a borrower's real finances
 *    (a family building a house, a shop that wants new booths or is going
 *    under) and approves or turns him down (housing.chemicalBank).
 *  - Turned down, he can come to the Family — when the boss owns a bank (the
 *    savings & loan from the front-man charter) or runs a shylock book.
 *
 * The boss sets the desk's POLICY: the interest (a bank's 6% a year up to the
 * street's five points a week), the term, who it lends to and how much, what
 * the borrower puts up (his house, a share of his business, nothing), and
 * what happens when he stops paying (more time with interest added, take the
 * collateral, take a piece of the business, send a collector, forgive it).
 * Applicants come as requests with their real finances as the Family knows
 * them; each is approved, countered or turned down, or the auto rule decides.
 *
 * Every loan is a real transfer out of the Family's money (livingMoney.pay
 * from 'family') and every payment a real transfer back; a default resolves
 * by the policy with real ownership changes (the deed passes to the Family;
 * the Family becomes a partner in the business). Shady terms bring heat (the
 * bank examiners, the federal people), resentment and talk; a bank that
 * lends clean washes money through its loan book.
 */

export type FbVia = 'bank' | 'book';
export type DefaultPolicy = 'extend' | 'collateral' | 'piece' | 'collector' | 'forgive';
export type Collateral = 'house' | 'stake' | 'none';
export type LendTo = 'households' | 'businesses' | 'both';
export type AutoRule = 'none' | 'safe' | 'all';

/** The terms on one loan the Family made. */
export interface FbTerms { via: FbVia; rate: number; weeks: number; coll: Collateral; onDef: DefaultPolicy; app?: string; ext?: number; col?: number; done?: 1 }

export interface BankPolicy {
  /** Interest per week (0.00115 = 6% a year; 0.05 = five points a week). */
  rate: number;
  /** Weeks to pay it back. */
  weeks: number;
  lendTo: LendTo;
  /** The most it lends to one borrower. */
  max: number;
  coll: Collateral;
  onDef: DefaultPolicy;
  auto: AutoRule;
}

export interface LoanApp {
  id: string;
  w: number;
  kind: 'home' | 'biz';
  hh: string;
  /** The borrower (a person id). */
  by: string;
  lot?: string;
  amt: number;
  /** What it is for, in his words. */
  why: string;
  /** Why Chemical Bank said no. */
  denied: string[];
  /** His finances as the Family knows them: a week's income, money in the house, a week's payments already owed. */
  income: number;
  cash: number;
  owed: number;
  st: 'open' | 'yes' | 'no' | 'gone';
  /** The terms it was made on (approved). */
  made?: { amt: number; rate: number; weeks: number };
}

export interface FbStats { apps: number; lent: number; loans: number; repaid: number; seized: number; pieces: number; collected: number; forgiven: number; extended: number; denied: number }

export interface FbState {
  policy: BankPolicy;
  apps: LoanApp[];
  next: number;
  stats: FbStats;
  /** What the town says about the Family's lending, 0-100. */
  talk: number;
  heatAcc: number;
  fedAcc: number;
  lastMonth?: string;
  lastTalk?: number;
}

/** 6% a year: what a bank charged in 1960 (the line between a loan and a shylock's). */
export const LEGAL_RATE = 0.06 / 52;

export const RATE_PRESETS: { id: string; label: string; rate: number }[] = [
  { id: 'friendly', label: 'Friendly: 4% a year', rate: 0.04 / 52 },
  { id: 'bank', label: 'Bank rate: 6% a year', rate: LEGAL_RATE },
  { id: 'steep', label: 'Steep: 15% a year', rate: 0.15 / 52 },
  { id: 'point', label: 'A point a week', rate: 0.01 },
  { id: 'vig', label: 'The vig: five points a week', rate: 0.05 },
];

export const TERM_PRESETS = [10, 20, 52, 260, 520];

export const DEFAULT_LABEL: Record<DefaultPolicy, { label: string; detail: string }> = {
  extend: { label: 'More time, with interest added', detail: 'Four more weeks; 10% of what he owes goes on top. Nobody gets hurt.' },
  collateral: { label: 'Take the collateral', detail: 'The deed to his house (he stays on and pays you rent) or the share of his business he put up passes to the Family.' },
  piece: { label: 'Take a piece of the business', detail: 'The Family becomes his partner: a quarter of what the place pays its owner, every week, from now on.' },
  collector: { label: 'Send a collector', detail: 'A man goes round and takes what is in the house. It gets paid, and it gets talked about (heat, and a grudge).' },
  forgive: { label: 'Forgive it', detail: 'Write it off. He, his family and the street remember who was kind.' },
};

export const COLL_LABEL: Record<Collateral, string> = { house: 'His house (the deed)', stake: 'Half his business', none: 'Nothing (his word)' };
export const LEND_LABEL: Record<LendTo, string> = { households: 'Families', businesses: 'Businesses', both: 'Families and businesses' };
export const AUTO_LABEL: Record<AutoRule, string> = { none: 'I decide every one', safe: 'Approve the ones who can carry the payments', all: 'Approve everyone up to the limit' };

/** The Family's desk, if it has one: its bank, else its shylock book. */
export function deskOpen(s: GameState): FbVia | undefined {
  const open = (k: string) => s.businesses.some((b) => b.owner === 'player' && b.kind === k && !(b.closedUntil !== undefined && b.closedUntil > s.week));
  return open('bank') ? 'bank' : open('loansharking') ? 'book' : undefined;
}

export function familyBankName(s: GameState): string {
  const b = s.businesses.find((x) => x.owner === 'player' && x.kind === 'bank');
  return b?.name ?? 'the Family\'s bank';
}

function blankPolicy(via: FbVia | undefined): BankPolicy {
  return via === 'book'
    ? { rate: 0.05, weeks: 20, lendTo: 'both', max: 3000, coll: 'none', onDef: 'collector', auto: 'none' }
    : { rate: LEGAL_RATE, weeks: 260, lendTo: 'both', max: 6000, coll: 'house', onDef: 'extend', auto: 'none' };
}

export function ensureFbank(s: GameState): FbState {
  if (!s.fbank) s.fbank = { policy: blankPolicy(deskOpen(s)), apps: [], next: 1, stats: { apps: 0, lent: 0, loans: 0, repaid: 0, seized: 0, pieces: 0, collected: 0, forgiven: 0, extended: 0, denied: 0 }, talk: 0, heatAcc: 0, fedAcc: 0 };
  return s.fbank;
}

/** Weekly payment on a loan: the principal over the term, plus the interest on it every week. */
export function weeklyPayment(amt: number, rate: number, weeks: number): number {
  return Math.max(1, Math.ceil((amt * (1 + rate * weeks)) / Math.max(1, weeks)));
}

/** The rate in plain words: a year's percent or the points a week, and what it costs on $1,000. */
export function rateWords(rate: number): string {
  const yr = rate * 52 * 100;
  const per = rate * 1000;
  const head = rate >= 0.005 ? `${Math.round(rate * 1000) / 10} points a week (${Math.round(yr)}% a year)` : `${Math.round(yr * 10) / 10}% a year`;
  return `${head}: $${per < 10 ? per.toFixed(2) : Math.round(per)} a week in interest on every $1,000`;
}

/** How shady the terms look: 0 a bank's, up from there (1 = twice the legal rate, ~5 = the vig). */
export function shadiness(rate: number): number {
  return rate <= LEGAL_RATE * 1.5 ? 0 : Math.log2(rate / LEGAL_RATE);
}

/* ------------------------------------------------------------------ */
/* Applications                                                        */
/* ------------------------------------------------------------------ */

/** A borrower Chemical Bank turned down comes to the Family's desk (if it lends to his kind). */
export function deskApply(s: GameState, L: LivingState, o: { kind: 'home' | 'biz'; hh: string; by: string; lot?: string; amt: number; why: string; denied: string[] }): LoanApp | undefined {
  const via = deskOpen(s);
  if (!via) return undefined;
  const F = ensureFbank(s);
  const to = F.policy.lendTo;
  if ((o.kind === 'home' && to === 'businesses') || (o.kind === 'biz' && to === 'households')) return undefined;
  if (F.apps.some((a) => a.st === 'open' && a.hh === o.hh)) return undefined;
  const hh = L.hh[o.hh];
  if (!hh) return undefined;
  const app: LoanApp = { id: `ap${F.next++}`, w: s.week, kind: o.kind, hh: o.hh, by: o.by, amt: Math.round(o.amt), why: o.why, denied: o.denied, income: weeklyIncome(L, hh, s.week), cash: Math.round(hh.cash), owed: weeklyDebt(L, hh), st: 'open' };
  if (o.lot) app.lot = o.lot;
  F.apps.push(app);
  F.stats.apps++;
  if (F.apps.length > 60) F.apps.splice(0, F.apps.length - 60);
  return app;
}

/** The plain line a request leads with ("Turned down at Chemical Bank — wants $3,000 for his diner's new booths"). */
export function appLine(s: GameState, a: LoanApp): string {
  const p = s.living?.people[a.by];
  return `${p ? pname(p) : 'Someone'}: turned down at Chemical Bank — wants $${a.amt.toLocaleString('en-US')} ${a.why}`;
}

/** Whether he can carry the payments on these terms (the "safe" auto rule, and the desk's advice). */
export function canCarry(a: LoanApp, amt: number, rate: number, weeks: number): boolean {
  return weeklyPayment(amt, rate, weeks) + a.owed <= Math.max(1, a.income) * 0.35;
}

/** Lend: the money leaves the Family for the borrower's house now; payments come back weekly. */
function lend(ctx: Ctx, L: LivingState, a: LoanApp, amt: number, rate: number, weeks: number): Td | undefined {
  const s = ctx.s;
  const F = ensureFbank(s);
  const via = deskOpen(s);
  const p = L.people[a.by];
  const hh = L.hh[a.hh];
  if (!via || !p || !present(p, s.week) || !hh || hh.gone !== undefined) { a.st = 'gone'; return undefined; }
  if (s.money < amt) return undefined;
  const lender = via === 'bank' ? familyBankName(s) : `the House of ${s.houseName}'s book`;
  const fid = fact(s, L, 'loan', [p.id, s.playerId], `${pname(p)} borrowed $${amt.toLocaleString('en-US')} from ${lender} ${a.why} (${rateWords(rate).split(':')[0]}, ${weeks} weeks).`, 2, { amt, at: a.lot });
  const d = newDebt(ctx, L, { lender: 'family', from: 'family', by: p, amt, rate: rate * weeks, weeks, why: `a loan from ${lender} ${a.why}`, fid });
  if (!d) return undefined;
  d.fb = { via, rate, weeks, coll: F.policy.coll, onDef: F.policy.onDef, app: a.id };
  if (a.lot) d.lot = a.lot;
  // A shop's loan goes into the till.
  if (a.kind === 'biz' && p.job && L.biz[p.job]?.owner === p.id) pay(ctx, L, `h:${hh.id}`, `b:${p.job}`, amt, `${pname(p)} puts the loan into the business`);
  a.st = 'yes';
  a.made = { amt, rate, weeks };
  F.stats.lent += amt;
  F.stats.loans++;
  return d;
}

export type Verdict = 'approve' | 'deny' | 'counter';

/** The boss's answer to an applicant (counter: half the money, or the terms he names). */
export function decideApp(ctx: Ctx, id: string, verdict: Verdict, o: { amt?: number; rate?: number; weeks?: number } = {}): boolean {
  const s = ctx.s;
  const L = s.living;
  const F = ensureFbank(s);
  const a = F.apps.find((x) => x.id === id);
  if (!L || !a || a.st !== 'open') return false;
  const p = L.people[a.by];
  if (verdict === 'deny') {
    a.st = 'no';
    F.stats.denied++;
    if (p) { const t = (p.ties[s.playerId] ??= { a: 0, tr: 30, gr: 0 }); t.a = clamp(t.a - 4, -100, 100); }
    return true;
  }
  const amt = Math.round(o.amt ?? (verdict === 'counter' ? a.amt / 2 : a.amt));
  const d = lend(ctx, L, a, amt, o.rate ?? F.policy.rate, o.weeks ?? F.policy.weeks);
  if (d && p) { const t = (p.ties[s.playerId] ??= { a: 0, tr: 30, gr: 0 }); t.a = clamp(t.a + (shadiness(d.fb!.rate) > 2 ? 2 : 10), -100, 100); }
  return !!d;
}

/* ------------------------------------------------------------------ */
/* Defaults                                                             */
/* ------------------------------------------------------------------ */

function hhOf(L: LivingState, d: Td): Th | undefined {
  return L.hh[d.hh];
}

function takeHouse(ctx: Ctx, L: LivingState, d: Td): boolean {
  const s = ctx.s;
  const hh = hhOf(L, d);
  const lot = s.econ?.lots.find((l) => (l.id === d.lot || l.id === hh?.lot) && l.hh === d.hh && l.hhOwns);
  if (!lot || !hh) return false;
  lot.status = 'owned';
  lot.owner = 'player';
  lot.boughtWeek = s.week;
  lot.invested = d.out;
  delete lot.hhOwns;
  delete lot.tenant;
  (lot.history ??= []).push({ year: s.date.y, week: s.week, owner: 'player', how: 'seized', by: 'the Family\'s loan desk', price: d.out });
  if (s.housing?.builds[lot.id]) delete s.housing.builds[lot.id];
  // They stay on, and pay the Family rent.
  if (lot.stage === 'open') { hh.rent = Math.max(1, Math.round(homeRent(s, lot) / inflation(s))); hh.home = `the house they used to own, ${lot.address}, rented from the House of ${s.houseName}`; }
  else { delete lot.hh; delete hh.lot; hh.rent = 14; hh.home = 'a rented room'; }
  d.st = 'seized';
  const txt = `The Family took the deed to ${hh.name.replace(/ family$/, '')}s' house at ${lot.address} for the $${d.out.toLocaleString('en-US')} they owed.`;
  fact(s, L, 'seized', [d.by, s.playerId], txt, 1, { at: lot.id, amt: d.out });
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: txt, kind: 'misc' });
  ensureFbank(s).stats.seized++;
  for (const id of hh.members) { const p = L.people[id]; if (p) { const t = (p.ties[s.playerId] ??= { a: 0, tr: 30, gr: 0 }); t.gr = clamp(t.gr + 30); t.why = 'took the house'; } }
  return true;
}

function takePiece(ctx: Ctx, L: LivingState, d: Td, pct: number): boolean {
  const s = ctx.s;
  const b = Object.values(L.biz).find((x) => x.owner === d.by);
  if (!b) return false;
  (b.stk ??= []).push({ c: 'family', pct, w: s.week, paid: 0 });
  d.st = 'seized';
  const l = s.econ?.lots.find((x) => x.id === b.lot);
  const txt = `The Family is ${pname(L.people[d.by])}'s partner now: ${Math.round(pct * 100)}% of ${l?.name ?? 'the business'} for the $${d.out.toLocaleString('en-US')} he could not pay back.`;
  fact(s, L, 'stake', [d.by, s.playerId], txt, 2, { at: b.lot, amt: d.out });
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: txt, kind: 'misc' });
  ensureFbank(s).stats.pieces++;
  return true;
}

function collector(ctx: Ctx, L: LivingState, d: Td, F: FbState): void {
  const s = ctx.s;
  const hh = hhOf(L, d);
  let got = 0;
  if (hh) got += pay(ctx, L, `h:${hh.id}`, 'family', d.out, `A collector at ${hh.name}'s door`, 'debt');
  const by = L.people[d.by];
  if (by && got < d.out) got += pay(ctx, L, `p:${by.id}`, 'family', d.out - got, `A collector takes ${pname(by)}'s own money`, 'debt');
  d.out -= got;
  d.fb!.col = (d.fb!.col ?? 0) + 1;
  F.stats.collected += got;
  heat(ctx, 'local', 2, `A collector for the Family's loans (${pname(by)})`, 'heat');
  F.talk = clamp(F.talk + 6);
  for (const id of hh?.members ?? []) { const p = L.people[id]; if (p) { const t = (p.ties[s.playerId] ??= { a: 0, tr: 30, gr: 0 }); t.gr = clamp(t.gr + 20); t.a = clamp(t.a - 10, -100, 100); t.why = 'sent a collector to the house'; } }
  fact(s, L, 'collector', [d.by, s.playerId], `A man from the Family came to ${hh?.name ?? 'the house'} about the loan and left with $${got.toLocaleString('en-US')}.`, 0, { amt: got });
  if (d.out <= 0) { d.out = 0; d.st = 'paid'; return; }
  if ((d.fb!.col ?? 0) >= 3) { d.st = 'default'; d.dw ??= s.week; d.fb!.done = 1; return; }
  d.missed = 0;
  d.next = s.week + 2;
}

/** A Family loan that stopped paying: the policy decides. */
function resolveDefault(ctx: Ctx, L: LivingState, d: Td, F: FbState): void {
  const s = ctx.s;
  const t = d.fb!;
  switch (t.onDef) {
    case 'extend':
      d.missed = 0;
      d.next = s.week + 4;
      d.out += Math.round(d.out * 0.1);
      t.ext = (t.ext ?? 0) + 1;
      F.stats.extended++;
      fact(s, L, 'mediated', [d.by, s.playerId], `The Family gave ${pname(L.people[d.by])} four more weeks on the loan, with 10% on top (owes $${d.out.toLocaleString('en-US')}).`, 2, { amt: d.out });
      return;
    case 'collateral':
      if (t.coll === 'stake' ? takePiece(ctx, L, d, 0.5) || takeHouse(ctx, L, d) : t.coll === 'house' ? takeHouse(ctx, L, d) || takePiece(ctx, L, d, 0.5) : false) return;
      collector(ctx, L, d, F);
      return;
    case 'piece':
      if (takePiece(ctx, L, d, 0.25) || takeHouse(ctx, L, d)) return;
      collector(ctx, L, d, F);
      return;
    case 'collector':
      collector(ctx, L, d, F);
      return;
    case 'forgive': {
      d.st = 'forgiven';
      F.stats.forgiven++;
      F.talk = clamp(F.talk - 4);
      respect(ctx, 1, `Forgave ${pname(L.people[d.by])}'s loan`, 'event');
      const hh = hhOf(L, d);
      for (const id of hh?.members ?? []) { const p = L.people[id]; if (p) { const tt = (p.ties[s.playerId] ??= { a: 0, tr: 30, gr: 0 }); tt.a = clamp(tt.a + 30, -100, 100); tt.tr = clamp(tt.tr + 15); } }
      fact(s, L, 'forgiven', [d.by, s.playerId], `The Family forgave the $${d.out.toLocaleString('en-US')} ${pname(L.people[d.by])} owed it.`, 0, { amt: d.out });
    }
  }
}

/* ------------------------------------------------------------------ */
/* The week and the month                                               */
/* ------------------------------------------------------------------ */

/** Businesses that want money: a shop going under, or one that wants to grow. Chemical Bank first; turned down, the Family's desk. */
function businessesApply(ctx: Ctx, L: LivingState): void {
  const s = ctx.s;
  const x = livingIndex(s, L);
  let n = 0;
  for (const b of Object.values(L.biz).sort((a, c) => a.lot.localeCompare(c.lot))) {
    if (n >= 2) break;
    const owner = L.people[b.owner];
    const l = x.lots.get(b.lot);
    const hh = owner ? L.hh[owner.hh] : undefined;
    if (!owner || !l || !hh || !present(owner, s.week) || hh.gone !== undefined) continue;
    if (L.debts.some((d) => d.by === owner.id && d.st === 'open' && (d.lender === 'bank' || d.lender === 'family'))) continue;
    const trouble = b.red >= 2;
    const grow = !trouble && b.net > 0 && owner.t[0] >= 62 && roll(L, s.week, `grow:${b.lot}`) < 0.06;
    if (!trouble && !grow) continue;
    if (trouble && roll(L, s.week, `apply:${b.lot}`) > 0.35) continue;
    const u = l.use ? USES_BY_ID[l.use] : undefined;
    const amt = Math.round((trouble ? useEconomics(l).exp * 5 : (u?.cost ?? 5000) * 0.25) * x.infl / 50) * 50;
    const what = trouble ? `to keep ${l.name ?? 'his place'} open` : `for ${l.name ?? 'his place'}: ${['new booths', 'a new freezer', 'a fresh coat of paint and a new sign', 'a bigger kitchen', 'a second counter'][Math.floor(roll(L, s.week, `what:${b.lot}`) * 5)]}`;
    n++;
    const v = chemicalBank(s, L, hh, amt, { total: amt, own: amt, weeks: 104, rate: 0.12 });
    if (trouble) v.ok = false, v.why.push('the books are in the red');
    if (v.ok) {
      const fid = fact(s, L, 'bank_yes', [owner.id], `Chemical Bank lent ${pname(owner)} $${amt.toLocaleString('en-US')} ${what}.`, 1, { at: b.lot, amt });
      const d = newDebt(ctx, L, { lender: 'bank', from: 'x:bank', by: owner, amt, rate: 0.12, weeks: 104, why: `a Chemical Bank loan ${what}`, fid });
      if (d) pay(ctx, L, `h:${hh.id}`, `b:${b.lot}`, amt, `${pname(owner)} puts the loan into the business`);
      continue;
    }
    fact(s, L, 'bank_no', [owner.id], `Chemical Bank turned ${pname(owner)} down for $${amt.toLocaleString('en-US')} ${what}: ${v.why.join('; ')}.`, 1, { at: b.lot, amt });
    deskApply(s, L, { kind: 'biz', hh: hh.id, by: owner.id, lot: b.lot, amt, why: what, denied: v.why });
  }
}

export function fbankWeek(ctx: Ctx): void {
  const s = ctx.s;
  const L = s.living;
  const via = deskOpen(s);
  if (!L || (!via && !s.fbank)) return;
  const F = ensureFbank(s);
  // Applicants who waited a month went elsewhere.
  for (const a of F.apps) if (a.st === 'open' && (s.week - a.w > 4 || !via)) a.st = 'gone';
  // The auto rule.
  if (via && F.policy.auto !== 'none') {
    for (const a of F.apps) {
      if (a.st !== 'open') continue;
      const amt = Math.min(a.amt, F.policy.max);
      if (amt < a.amt * 0.5) continue;
      if (F.policy.auto === 'safe' && !canCarry(a, amt, F.policy.rate, F.policy.weeks)) continue;
      decideApp(ctx, a.id, amt < a.amt ? 'counter' : 'approve', { amt });
    }
  }
  // Defaults: the policy decides (before the street's own default at six missed weeks).
  for (const d of L.debts) {
    if (d.st !== 'open' || d.lender !== 'family' || !d.fb || d.fb.done) continue;
    if (d.missed >= 3) resolveDefault(ctx, L, d, F);
  }
  // Shady terms: heat, the examiners, the talk.
  let shady = 0;
  let fed = 0;
  for (const d of L.debts) {
    if (d.st !== 'open' || !d.fb) continue;
    const sh = shadiness(d.fb.rate);
    if (!sh) continue;
    shady += sh * Math.min(3, d.out / 1000 + 0.3);
    if (d.fb.via === 'bank' && sh > 2) fed += (sh - 2) * Math.min(3, d.out / 1000 + 0.3);
  }
  F.heatAcc += shady * 0.04;
  F.fedAcc += fed * 0.03;
  if (F.heatAcc >= 1) { const n = Math.floor(F.heatAcc); F.heatAcc -= n; heat(ctx, 'local', n, 'Talk about the Family\'s loans at the vig', 'heat'); }
  if (F.fedAcc >= 1) { const n = Math.floor(F.fedAcc); F.fedAcc -= n; heat(ctx, 'federal', n, `Bank examiners look at ${familyBankName(s)}'s loan book`, 'heat'); }
  F.talk = clamp(F.talk + (shady > 0 ? Math.min(3, shady * 0.3) : -0.5));
  const mk = `${s.date.y}-${s.date.m}`;
  if (F.lastMonth !== mk) {
    F.lastMonth = mk;
    if (via) businessesApply(ctx, L);
    // Resentment: what the borrowers feel about the terms.
    for (const d of L.debts) {
      if (d.st !== 'open' || !d.fb) continue;
      const sh = shadiness(d.fb.rate);
      const p = L.people[d.by];
      if (!p || !sh) continue;
      const t = (p.ties[s.playerId] ??= { a: 0, tr: 30, gr: 0 });
      t.gr = clamp(t.gr + Math.min(12, sh * 2));
      t.why ??= 'bleeds him at the vig';
    }
    if (F.talk >= 35 && (F.lastTalk === undefined || s.week - F.lastTalk >= 12)) {
      F.lastTalk = s.week;
      fact(s, L, 'grudge', [s.playerId], `People on the island say ${via === 'bank' ? familyBankName(s) : 'the Family'} lends at the vig and does not wait long for its money.`, 0);
    }
  }
}

/** Dirty money a clean-looking bank washes through its loan book a week. */
export function fbankWash(s: GameState): number {
  if (deskOpen(s) !== 'bank' || !s.living) return 0;
  let out = 0;
  let shady = 0;
  for (const d of s.living.debts) {
    if (d.st !== 'open' || !d.fb) continue;
    out += d.out;
    if (shadiness(d.fb.rate) > 0) shady += d.out;
  }
  if (!out || shady > out * 0.25) return 0;
  return Math.round(Math.min(4000, (out - shady) * 0.1));
}

/* ------------------------------------------------------------------ */
/* Requests and orders                                                  */
/* ------------------------------------------------------------------ */

/** A fresh applicant comes up as a request (the rest wait at the Loan desk). */
export function fbankEventSource(s: GameState): EventInstance | undefined {
  const F = s.fbank;
  const L = s.living;
  const via = deskOpen(s);
  if (!F || !L || !via) return undefined;
  const a = F.apps.find((x) => x.st === 'open' && s.week - x.w <= 1);
  if (!a) return undefined;
  const p = L.people[a.by];
  if (!present(p, s.week)) return undefined;
  const pol = F.policy;
  const amt = Math.min(a.amt, pol.max);
  const pw = weeklyPayment(amt, pol.rate, pol.weeks);
  const half = Math.round(a.amt / 2);
  const op = (verdict: Verdict, amtx?: number) => ({ type: 'econ' as const, op: { op: 'loanApp' as const, id: a.id, verdict, ...(amtx ? { amt: amtx } : {}) }, label: `${pname(p)}: the loan` });
  const short = (n: number) => (s.money < n ? `The Family has $${Math.max(0, Math.round(s.money)).toLocaleString('en-US')}` : undefined);
  const where = via === 'bank' ? familyBankName(s) : 'the book';
  return {
    iid: `fbank:${a.id}`, defId: 'fbank_app', title: `A loan applicant at ${where}`, week: s.week, mandatory: false, priority: 30, defaultChoiceId: 'later', meta: { app: a.id },
    text: [
      `${appLine(s, a)}.`,
      `Chemical Bank said no: ${a.denied.join('; ') || 'no reason given'}.`,
      `What the Family knows: $${a.income}/wk coming in, $${a.cash.toLocaleString('en-US')} in the house, $${a.owed}/wk already owed.`,
      `Your terms: ${rateWords(pol.rate)}, ${pol.weeks} weeks — $${pw}/wk${canCarry(a, amt, pol.rate, pol.weeks) ? ', which he can carry' : ', more than he can carry'}. If he stops paying: ${DEFAULT_LABEL[pol.onDef].label.toLowerCase()}.`,
    ].join('\n\n'),
    choices: [
      { id: 'approve', label: `Lend $${amt.toLocaleString('en-US')} on your terms`, detail: `Family money, now; he pays $${pw}/wk for ${pol.weeks} weeks.`, because: `lent ${pname(p)} money`, effects: [op('approve', amt)], ...(short(amt) ? { disabledReason: short(amt) } : {}) },
      { id: 'counter', label: `Offer half ($${half.toLocaleString('en-US')})`, detail: `$${weeklyPayment(half, pol.rate, pol.weeks)}/wk on your terms.`, because: `offered ${pname(p)} half the loan`, effects: [op('counter', half)], ...(short(half) ? { disabledReason: short(half) } : {}) },
      { id: 'deny', label: 'Turn him down', detail: 'He will go elsewhere, or do without.', because: `turned ${pname(p)} down for a loan`, effects: [op('deny')] },
      { id: 'later', label: 'Decide at the Loan desk', detail: 'He waits up to four weeks.', because: 'put off a loan applicant', effects: [] },
    ],
  };
}

export type BankCmd =
  | { k: 'policy'; set: Partial<BankPolicy> }
  | { k: 'decide'; app: string; verdict: Verdict; amt?: number; rate?: number; weeks?: number }
  | { k: 'onDef'; debt: string; onDef: DefaultPolicy };

const nop = (title: string, why: string): ActionPreview => ({ title, effects: [], cost: 0, because: '', disabledReason: why, category: 'event' });

export function previewBank(s: GameState, c: BankCmd): ActionPreview {
  const via = deskOpen(s);
  const F = s.fbank ?? { policy: blankPolicy(via), apps: [] as LoanApp[] } as Pick<FbState, 'policy' | 'apps'>;
  const noDesk = via ? undefined : 'You need a bank (the charter) or a shylock book';
  const note = (text: string) => ({ type: 'econ' as const, op: { op: 'note' as const, text }, label: text });
  if (c.k === 'policy') {
    const p = { ...F.policy, ...c.set };
    const bits = [`${rateWords(p.rate)}`, `${p.weeks} weeks`, `lends to ${LEND_LABEL[p.lendTo].toLowerCase()}, up to $${p.max.toLocaleString('en-US')}`, `collateral: ${COLL_LABEL[p.coll].toLowerCase()}`, `if they stop paying: ${DEFAULT_LABEL[p.onDef].label.toLowerCase()}`, `applicants: ${AUTO_LABEL[p.auto].toLowerCase()}`];
    const sh = shadiness(p.rate);
    return { title: 'The Loan desk: new terms', detail: `${bits.join('; ')}.${sh > 0 ? ` Terms like these bring heat${via === 'bank' && sh > 2 ? ' and the bank examiners' : ''}, and the borrowers resent them.` : via === 'bank' ? ' Clean terms: the loan book washes money too.' : ''}`, effects: [note('New lending terms')], cost: 0, because: 'set the terms at the Family\'s loan desk', disabledReason: noDesk, category: 'event', verb: 'Set the terms' };
  }
  if (c.k === 'onDef') {
    const d = s.living?.debts.find((x) => x.id === c.debt);
    return { title: `If ${d ? pname(s.living!.people[d.by]) : 'he'} stops paying: ${DEFAULT_LABEL[c.onDef].label.toLowerCase()}`, detail: DEFAULT_LABEL[c.onDef].detail, effects: [note('A new default plan for this loan')], cost: 0, because: 'changed what happens if a borrower stops paying', disabledReason: !d?.fb || d.st !== 'open' ? 'Not an open Family loan' : undefined, category: 'event' };
  }
  const a = F.apps.find((x) => x.id === c.app);
  if (!a) return nop('Loan', 'No such applicant');
  const p = s.living?.people[a.by];
  const who = p ? pname(p) : 'him';
  if (c.verdict === 'deny') return { title: `Turn ${who} down`, detail: 'He goes elsewhere, or does without.', effects: [note(`${who} is turned down`)], cost: 0, because: `turned ${who} down for a loan`, disabledReason: a.st !== 'open' ? 'Already decided' : noDesk, category: 'event' };
  const amt = Math.round(c.amt ?? (c.verdict === 'counter' ? a.amt / 2 : a.amt));
  const rate = c.rate ?? F.policy.rate;
  const weeks = c.weeks ?? F.policy.weeks;
  const pw = weeklyPayment(amt, rate, weeks);
  return {
    title: `Lend ${who} $${amt.toLocaleString('en-US')}`,
    detail: `Family money, paid to ${who} now. He pays $${pw}/wk for ${weeks} weeks (${rateWords(rate)}): $${(pw * weeks).toLocaleString('en-US')} back in all. ${canCarry(a, amt, rate, weeks) ? 'He can carry it.' : 'More than he can carry: expect trouble.'}`,
    effects: [note(`−$${amt.toLocaleString('en-US')} Family money, lent; $${pw}/wk back`)], cost: amt, because: `lent ${who} money`,
    disabledReason: a.st !== 'open' ? 'Already decided' : noDesk ?? (s.money < amt ? `The Family has $${Math.max(0, Math.round(s.money)).toLocaleString('en-US')}` : undefined), category: 'event', verb: 'Lend',
  };
}

export function commitBank(ctx: Ctx, c: BankCmd): void {
  const s = ctx.s;
  const F = ensureFbank(s);
  if (c.k === 'policy') {
    const p = { ...F.policy, ...c.set };
    p.rate = Math.max(0, Math.min(0.1, p.rate));
    p.weeks = Math.max(4, Math.min(1040, Math.round(p.weeks)));
    p.max = Math.max(100, Math.round(p.max));
    F.policy = p;
    return;
  }
  if (c.k === 'onDef') {
    const d = s.living?.debts.find((x) => x.id === c.debt);
    if (d?.fb) d.fb.onDef = c.onDef;
    return;
  }
  decideApp(ctx, c.app, c.verdict, { amt: c.amt, rate: c.rate, weeks: c.weeks });
}

/** The desk's book: every open Family loan with its borrower, for the screen. */
export function deskLoans(s: GameState): { d: Td; who: string; pay: number; late: number }[] {
  const L = s.living;
  if (!L) return [];
  return L.debts.filter((d) => d.lender === 'family' && d.fb && d.st === 'open').map((d) => ({ d, who: pname(L.people[d.by]), pay: d.pay, late: d.missed }));
}

void upkeepOf;
