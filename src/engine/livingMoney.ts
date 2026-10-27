import { money, type Ctx } from './ledger';
import { xfer } from './tribute';
import type { LivingState } from './livingState';
import type { GameState, RivalId } from './types';

/**
 * THE DISTRICT'S MONEY. Every dollar a townsman earns, spends, lends or
 * steals moves here, between named accounts, and is journaled:
 *
 *   h:<household>  the household's money (wages come in, the house is paid from it)
 *   p:<person>     a person's own money, apart from the house (a stash, a skim)
 *   b:<lot>        a business's till
 *
 * and the outside, which is where money comes from and goes to:
 *
 *   x:cust     the customers and the summer trade
 *   x:supply   suppliers, utilities, the seasonal help from off the island
 *   x:market   what a household spends to live (the grocer, the doctor, the church)
 *   x:rent     landlords off the district's books
 *   x:outwage  employers off the island, and the families' own places (their wages are in their books)
 *   x:land     a lot's seller or buyer who is not one of the district's people
 *   x:arrive   the savings a family brings when it moves in; x:depart what it takes when it leaves
 *   x:estate   what is left when the last of a household is gone
 *   wealth:<character id>  a crew member's own pocket (posted to the weekly take's journal too)
 *   family     the boss's Family (posted to the one ledger)
 *   rival:<id> a rival family's purse
 *
 * A transfer never takes an internal account below zero (it moves what is
 * there). `reconcileLiving` proves the books: every internal balance at the
 * last check, plus the journal, equals the balance now.
 */

export type LAcct = string;

function internal(id: LAcct): boolean {
  return id.startsWith('h:') || id.startsWith('p:') || id.startsWith('b:');
}

function getBal(L: LivingState, id: LAcct): number {
  const k = id.slice(2);
  if (id.startsWith('h:')) return L.hh[k]?.cash ?? 0;
  if (id.startsWith('p:')) return L.people[k]?.stash ?? 0;
  if (id.startsWith('b:')) return L.biz[k]?.cash ?? 0;
  return 0;
}

function addBal(L: LivingState, id: LAcct, v: number): void {
  const k = id.slice(2);
  if (id.startsWith('h:')) { const h = L.hh[k]; if (!h) throw new Error(`living: no household ${k}`); h.cash += v; }
  else if (id.startsWith('p:')) { const p = L.people[k]; if (!p) throw new Error(`living: no person ${k}`); p.stash += v; }
  else if (id.startsWith('b:')) { const b = L.biz[k]; if (!b) throw new Error(`living: no business ${k}`); b.cash += v; }
}

/** What an account can pay right now (outside sources are unlimited, except a pocket, a purse and the Family). */
export function available(s: GameState, L: LivingState, id: LAcct): number {
  if (internal(id)) return Math.max(0, getBal(L, id));
  if (id.startsWith('wealth:')) return Math.max(0, Math.floor(s.characters[id.slice(7)]?.wealth ?? 0));
  if (id.startsWith('rival:')) return Math.max(0, Math.floor(s.rivals.find((r) => r.id === id.slice(6))?.money ?? 0));
  if (id === 'family') return Math.max(0, Math.floor(s.money));
  return Number.MAX_SAFE_INTEGER;
}

/**
 * Move money. Returns what actually moved (never more than the payer has).
 * `why` is plain words for the journal ("Sal's wages", "Gus repays Abe").
 */
export function pay(ctx: Ctx, L: LivingState, from: LAcct, to: LAcct, amount: number, why: string): number {
  const s = ctx.s;
  let a = Math.floor(amount);
  if (!(a > 0) || from === to) return 0;
  a = Math.min(a, available(s, L, from));
  if (a <= 0) return 0;
  const key = `w${s.week}:town:${L.j.length}:${from}>${to}`;
  // The outside ends first: a pocket or the Family that cannot pay moves nothing.
  if (from.startsWith('wealth:')) {
    a = xfer(ctx, from, 'ext:town', a, 'transfer', key, { note: why });
    if (a <= 0) return 0;
  } else if (from.startsWith('rival:')) {
    const r = s.rivals.find((x) => x.id === (from.slice(6) as RivalId));
    if (!r) return 0;
    r.money -= a;
  } else if (from === 'family') {
    money(ctx, -a, why, 'event');
  }
  if (internal(from)) addBal(L, from, -a);
  if (internal(to)) addBal(L, to, a);
  if (to.startsWith('wealth:')) xfer(ctx, 'ext:town', to, a, 'transfer', key, { note: why });
  else if (to.startsWith('rival:')) {
    const r = s.rivals.find((x) => x.id === (to.slice(6) as RivalId));
    if (r) r.money += a;
  } else if (to === 'family') money(ctx, a, why, 'debt');
  L.j.push([from, to, a, why]);
  if (!internal(from)) L.flow[from] = (L.flow[from] ?? 0) - a;
  if (!internal(to)) L.flow[to] = (L.flow[to] ?? 0) + a;
  return a;
}

/** Every internal balance (households, people, businesses). */
export function livingBalances(L: LivingState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k in L.hh) if (L.hh[k].cash) out[`h:${k}`] = L.hh[k].cash;
  for (const k in L.people) if (L.people[k].stash) out[`p:${k}`] = L.people[k].stash;
  for (const k in L.biz) if (L.biz[k].cash) out[`b:${k}`] = L.biz[k].cash;
  return out;
}

/** The books balance: last check + journal == now, nothing negative. Returns failures. */
export function reconcileLiving(L: LivingState): string[] {
  const exp: Record<string, number> = { ...L.bal0 };
  for (const [f, t, a] of L.j) {
    if (internal(f)) exp[f] = (exp[f] ?? 0) - a;
    if (internal(t)) exp[t] = (exp[t] ?? 0) + a;
  }
  const now = livingBalances(L);
  const errs: string[] = [];
  for (const k of new Set([...Object.keys(exp), ...Object.keys(now)])) {
    if ((exp[k] ?? 0) !== (now[k] ?? 0)) errs.push(`living account ${k}: journal says ${exp[k] ?? 0}, balance is ${now[k] ?? 0}`);
    if ((now[k] ?? 0) < 0) errs.push(`living account ${k} is negative (${now[k]})`);
  }
  return errs;
}

/** Close the books for the week: the journal is folded into the opening balances. */
export function closeLivingBooks(L: LivingState): void {
  L.bal0 = livingBalances(L);
  L.j = [];
}

/** Total money held by the district's people and businesses. */
export function livingMoneyHeld(L: LivingState): number {
  let n = 0;
  for (const k in L.hh) n += L.hh[k].cash;
  for (const k in L.people) n += L.people[k].stash;
  for (const k in L.biz) n += L.biz[k].cash;
  return n;
}
