import { crew, hasTrait, isFree } from './characters';
import { attr } from './attrs';
import { marketValue } from './econ';
import type { Ctx } from './ledger';
import { fact, factById, factSeen } from './livingKnow';
import { pay as livingPay } from './livingMoney';
import { pname, type Tb } from './livingState';
import { addOpinion, opinion } from './relations';
import { hashSeed, rand } from './rng';
import { xfer } from './tribute';
import type { PurseLife } from './crewPurse';
import type { Character, GameState } from './types';

/**
 * THE MEN'S FINANCIAL LIVES (an extension of crewPurse.ts, not a second
 * economy). Every capo, soldier and associate already keeps his end in his own
 * pocket (`Character.wealth`, journaled as `wealth:<id>`) and lives on it.
 * Here he also:
 *  - puts money by in the bank (savings, `ext:bank`), and draws on it when short;
 *  - buys a home on a mortgage and a car (assets, with what is owed on them);
 *  - takes a stake in a real business on the Boardwalk (a living-district
 *    owner who needs capital takes his money for a share of the draw; the
 *    share is paid out of that business's till, and lost if it closes);
 *  - lends to and borrows from the other men (wealth to wealth, repaid weekly,
 *    or it turns into bad feeling);
 *  - has a money goal and an appetite for risk from his character, and a
 *    history of the big money moments of his life.
 * Every dollar moves through `xfer` (the weekly take's journal) or the living
 * district's journal: nothing is created or lost. Family contributions are not
 * touched here; they flow through the envelope exactly once, as before.
 *
 * Rolls are hashes of (seed, week, man, purpose): the tribute stream's dice
 * are not touched, and one man's choices do not reshuffle another's.
 */

/** How the boss knows a thing: 0 he does not, 1 rumor, 2 reported, 3 verified (he can see it or it is in the books). */
export type Vis = 0 | 1 | 2 | 3;

export type AssetK = 'home' | 'car' | 'stake' | 'note';
export interface Asset {
  k: AssetK;
  label: string;
  /** What it is worth now (a stake: its share of the place's value; a note: what is still owed to him). */
  value: number;
  w: number;
  lot?: string;
  pct?: number;
  /** A note: who owes it; a stake: the fact that records it. */
  who?: string;
  fid?: string;
  /** Paid out to him so far (a stake's share of the draw). */
  paid?: number;
  seen: Vis;
}

export interface PDebt {
  /** 'bank' (a mortgage), 'credit' (the credit man), or a character id. */
  lender: string;
  label: string;
  out: number;
  pay: number;
  w: number;
  missed: number;
  seen: Vis;
}

export interface MoneyEvent { w: number; text: string; amt: number; seen: Vis; fid?: string }

export type FinGoal = 'nest_egg' | 'own_home' | 'business' | 'clear_debts' | 'live_large' | 'provide';
export const FIN_GOAL_WORDS: Record<FinGoal, string> = {
  nest_egg: 'put money by', own_home: 'a house of his own', business: 'a piece of a business', clear_debts: 'to get clear of his debts', live_large: 'to live large', provide: 'to provide for his family',
};

export interface FinLife {
  bank: number;
  assets: Asset[];
  loans: PDebt[];
  goal: FinGoal;
  /** 0-100: how much risk he takes with money. */
  risk: number;
  hist: MoneyEvent[];
  /** What his open books explain of his own money (no skim, no hidden pocketing): the boss's estimate. */
  est: number;
  month?: string;
  /** The estate of a man who died: kept, not erased. */
  estate?: number;
}

/* ------------------------------------------------------------------ */

function roll(s: GameState, id: string, k: string): number {
  return rand({ rng: hashSeed(`${s.seed}|fin|${s.week}|${id}|${k}`) });
}

export function finOf(s: GameState, id: string): FinLife | undefined {
  return (s.tribute?.life?.[id] as (PurseLife & { fin?: FinLife }) | undefined)?.fin;
}

/** His financial life (made the first time, from his character). */
export function ensureFin(s: GameState, c: Character, life: PurseLife): FinLife {
  const L = life as PurseLife & { fin?: FinLife };
  if (L.fin) return L.fin;
  let risk = 35 + Math.round(roll(s, c.id, 'risk') * 20);
  if (hasTrait(c, 'Gambler')) risk += 35;
  if (hasTrait(c, 'Ambitious')) risk += 12;
  if (hasTrait(c, 'Greedy')) risk += 8;
  if (hasTrait(c, 'Patient')) risk -= 15;
  if (hasTrait(c, 'Paranoid')) risk -= 10;
  const fin: FinLife = { bank: 0, assets: [], loans: [], goal: 'nest_egg', risk: Math.max(5, Math.min(95, risk)), hist: [], est: Math.round(c.wealth) };
  // What he already had: a car or a house the purse remembered.
  if (life.car !== undefined) fin.assets.push({ k: 'car', label: 'a Buick', value: 1500, w: life.car, seen: 3 });
  if (life.house !== undefined) fin.assets.push({ k: 'home', label: 'a house', value: 20000, w: life.house, seen: 3 });
  fin.goal = goalFor(s, c, life, fin);
  L.fin = fin;
  return fin;
}

function goalFor(s: GameState, c: Character, life: PurseLife, fin: FinLife): FinGoal {
  if (life.debt > 0 || fin.loans.some((d) => d.out > 0 && d.lender !== 'bank')) return 'clear_debts';
  if (hasTrait(c, 'Greedy') && c.wealth > 2000) return 'live_large';
  const family = !!(c.household?.wife || c.spouseId || c.household?.kids?.length);
  if (family && !fin.assets.some((a) => a.k === 'home')) return 'own_home';
  if (attr(s, c, 'ambition') >= 60 || hasTrait(c, 'Ambitious')) return 'business';
  return family ? 'provide' : 'nest_egg';
}

export function note(fin: FinLife, w: number, text: string, amt: number, seen: Vis, fid?: string): void {
  fin.hist.push(fid ? { w, text, amt: Math.round(amt), seen, fid } : { w, text, amt: Math.round(amt), seen });
  if (fin.hist.length > 14) fin.hist.splice(0, fin.hist.length - 14);
}

/* ------------------------------------------------------------------ */
/* Hooks from the purse                                                */
/* ------------------------------------------------------------------ */

/** The purse bought him a house (a down payment): the house is his, the bank holds the rest. */
export function boughtHome(s: GameState, c: Character, life: PurseLife, down: number): void {
  const fin = ensureFin(s, c, life);
  const price = Math.round(down * 2.5);
  fin.assets.push({ k: 'home', label: 'a house in the Crest', value: price, w: s.week, seen: 3 });
  fin.loans.push({ lender: 'bank', label: 'the mortgage', out: price - down, pay: Math.ceil((price - down) / 260), w: s.week, missed: 0, seen: 2 });
  note(fin, s.week, `bought a house ($${down.toLocaleString('en-US')} down, the bank holds the rest)`, -down, 3);
}

export function boughtCar(s: GameState, c: Character, life: PurseLife, price: number): void {
  const fin = ensureFin(s, c, life);
  fin.assets.push({ k: 'car', label: 'a new Buick', value: price, w: s.week, seen: 3 });
  note(fin, s.week, 'bought a new Buick', -price, 3);
}

export function lostAtTrack(s: GameState, c: Character, life: PurseLife, amt: number): void {
  if (amt < 150) return;
  const fin = ensureFin(s, c, life);
  note(fin, s.week, `lost $${amt.toLocaleString('en-US')} at the track`, -amt, 1);
}

/* ------------------------------------------------------------------ */
/* The week and the month                                              */
/* ------------------------------------------------------------------ */

function mv(ctx: Ctx, from: string, to: string, amt: number, k: string, noteTxt: string): number {
  return xfer(ctx, from, to, amt, 'transfer', `w${ctx.s.week}:fin:${k}`, { note: noteTxt });
}

/** Weekly: the mortgage and the men's loans to each other; the estimate follows the open books. */
export function financeWeek(ctx: Ctx, c: Character, life: PurseLife, kept: number, spent: number): void {
  const s = ctx.s;
  const fin = ensureFin(s, c, life);
  fin.est = Math.max(0, Math.round(fin.est + kept - spent));
  for (const d of fin.loans) {
    if (d.out <= 0) continue;
    const due = Math.min(d.pay, d.out);
    const to = d.lender === 'bank' || d.lender === 'credit' ? `ext:${d.lender}` : `wealth:${d.lender}`;
    if (to.startsWith('wealth:') && !s.characters[d.lender]) { d.out = 0; continue; }
    // Short of cash, he draws on his savings first.
    if (c.wealth < due && fin.bank > 0) {
      const back = mv(ctx, 'ext:bank', `wealth:${c.id}`, Math.min(fin.bank, due * 4), `draw:${c.id}`, `${c.firstName} ${c.lastName} draws on his savings`);
      fin.bank -= back;
    }
    const paid = mv(ctx, `wealth:${c.id}`, to, due, `pay:${c.id}:${d.lender}`, `${c.firstName} ${c.lastName} pays ${d.label}`);
    d.out -= paid;
    fin.est = Math.max(0, fin.est - paid);
    if (to.startsWith('wealth:')) {
      const lf = finOf(s, d.lender);
      const n = lf?.assets.find((a) => a.k === 'note' && a.who === c.id && a.value > 0);
      if (n) n.value = Math.max(0, n.value - paid);
      if (lf) lf.est += paid;
    }
    if (paid < due) {
      d.missed++;
      if (d.missed === 6 && to.startsWith('wealth:')) {
        addOpinion(s, d.lender, c.id, 'Stopped paying me back', -15, 1);
        note(fin, s.week, `stopped paying back ${s.characters[d.lender]?.firstName ?? 'a friend'}`, 0, 2);
      }
    } else if (d.out <= 0) {
      if (d.lender !== 'bank') note(fin, s.week, `paid off ${d.label}`, 0, 2);
      else note(fin, s.week, 'paid off the house', 0, 3);
    }
  }
  fin.loans = fin.loans.filter((d) => d.out > 0 || s.week - d.w < 26);
  const mk = `${s.date.y}-${s.date.m}`;
  if (fin.month !== mk) {
    fin.month = mk;
    financeMonth(ctx, c, life, fin);
  }
}

/** What he spends in an ordinary week (from his purse's last weeks). */
function weekly(s: GameState, id: string): number {
  const rows = s.tribute?.purse?.[id] ?? [];
  return Math.max(10, Math.round(rows.reduce((a, r) => a + r.spent, 0) / Math.max(1, rows.length)));
}

function financeMonth(ctx: Ctx, c: Character, life: PurseLife, fin: FinLife): void {
  const s = ctx.s;
  if (!isFree(s, c)) return;
  fin.goal = goalFor(s, c, life, fin);
  // Cars lose value; a house holds it (a little more each year).
  for (const a of fin.assets) {
    if (a.k === 'car') a.value = Math.round(a.value * 0.985);
    if (a.k === 'home' && s.date.m === 1) a.value = Math.round(a.value * 1.03);
    if (a.k === 'stake' && a.lot) {
      const l = s.econ?.lots.find((x) => x.id === a.lot);
      const alive = !!s.living?.biz[a.lot]?.stk?.some((x) => x.c === c.id);
      a.value = alive && l ? Math.round(marketValue(s, l) * (a.pct ?? 0)) : 0;
    }
  }
  const need = Math.max(40, weekly(s, c.id));
  // Short: draw on the bank, else ask another man for a loan.
  if (c.wealth < need * 2 && fin.bank > 0) {
    const back = mv(ctx, 'ext:bank', `wealth:${c.id}`, Math.min(fin.bank, need * 6), `mdraw:${c.id}`, `${c.firstName} ${c.lastName} draws on his savings`);
    fin.bank -= back;
    if (back >= 300) note(fin, s.week, `drew $${back.toLocaleString('en-US')} out of the bank`, back, 0);
  } else if (c.wealth < need && !fin.loans.some((d) => d.lender !== 'bank' && d.out > 0) && roll(s, c.id, 'ask') < 0.5) {
    askPeer(ctx, c, life, fin, need * 8);
  }
  // Comfortable: put some by (the careful more than the reckless).
  const spare = c.wealth - need * 8;
  if (spare > 200 && roll(s, c.id, 'save') < (100 - fin.risk) / 100) {
    const put = mv(ctx, `wealth:${c.id}`, 'ext:bank', Math.round(spare * (0.2 + (100 - fin.risk) / 250)), `save:${c.id}`, `${c.firstName} ${c.lastName} puts money in the bank`);
    fin.bank += put;
  }
  // A house of his own: a quarter down, the bank holds the rest.
  if (fin.goal === 'own_home' && !fin.assets.some((a) => a.k === 'home')) {
    const price = Math.round(((c.rank === 'capo' || c.rank === 'underboss' || c.rank === 'consigliere' ? 14000 : 9000) * (0.85 + roll(s, c.id, 'price') * 0.3)) / 100) * 100;
    const down = Math.round(price * 0.25);
    if (c.wealth + fin.bank >= down + need * 10 && roll(s, c.id, 'home') < 0.35) {
      if (c.wealth < down) fin.bank -= mv(ctx, 'ext:bank', `wealth:${c.id}`, Math.min(fin.bank, down - c.wealth), `hdraw:${c.id}`, `${c.firstName} ${c.lastName} draws on his savings`);
      const got = mv(ctx, `wealth:${c.id}`, 'ext:life:a house', down, `home:${c.id}`, `${c.firstName} ${c.lastName}: down payment on a house`);
      if (got >= down) {
        life.house = s.week;
        life.last = 'bought a house';
        fin.est = Math.max(0, fin.est - got);
        fin.assets.push({ k: 'home', label: 'a house in the Crest', value: price, w: s.week, seen: 3 });
        fin.loans.push({ lender: 'bank', label: 'the mortgage', out: price - got, pay: Math.ceil((price - got) / 260), w: s.week, missed: 0, seen: 2 });
        note(fin, s.week, `bought a house ($${got.toLocaleString('en-US')} down, the bank holds the rest)`, -got, 3);
        fin.goal = goalFor(s, c, life, fin);
      }
    }
  }
  // A piece of a business: an ambitious man with money looks for an owner who needs capital.
  const liquid = c.wealth + fin.bank;
  const stakes = fin.assets.filter((a) => a.k === 'stake' && a.value > 0).length;
  if ((fin.goal === 'business' || fin.risk >= 60) && liquid >= 2500 && stakes < 2 && roll(s, c.id, 'stake') < 0.25) takeStake(ctx, c, fin, liquid);
  // A gambler's lucky night now and then (varied outcomes, paid by the track).
  if (fin.risk >= 70 && c.wealth > 100 && roll(s, c.id, 'luck') < 0.06) {
    const won = mv(ctx, 'ext:life:the track', `wealth:${c.id}`, Math.round(200 + roll(s, c.id, 'won') * 1800), `won:${c.id}`, `${c.firstName} ${c.lastName} hits at the track`);
    if (won) note(fin, s.week, `hit big at the track ($${won.toLocaleString('en-US')})`, won, 1);
  }
}

/** He asks one of the other men for a loan; the other decides from what he thinks of him and what he can spare. */
function askPeer(ctx: Ctx, c: Character, life: PurseLife, fin: FinLife, amt: number): void {
  const s = ctx.s;
  const peers = crew(s).filter((m) => m.id !== c.id && m.id !== s.playerId && isFree(s, m) && m.wealth >= amt * 3 && (m.capoId === c.capoId || m.id === c.capoId || m.capoId === c.id)).sort((a, b) => a.id.localeCompare(b.id));
  const lender = peers.find((m) => opinion(s, m.id, c.id) + roll(s, m.id, `lend:${c.id}`) * 40 >= 25);
  if (!lender) { note(fin, s.week, 'asked around the crew for a loan and was turned down', 0, 1); return; }
  const got = mv(ctx, `wealth:${lender.id}`, `wealth:${c.id}`, amt, `loan:${lender.id}:${c.id}`, `${lender.firstName} ${lender.lastName} lends ${c.firstName} ${c.lastName} money`);
  if (!got) return;
  fin.loans.push({ lender: lender.id, label: `${lender.firstName}'s loan`, out: got, pay: Math.ceil(got / 12), w: s.week, missed: 0, seen: 2 });
  note(fin, s.week, `borrowed $${got.toLocaleString('en-US')} from ${lender.firstName} ${lender.lastName}`, got, 2);
  const lf = ensureFin(s, lender, (s.tribute!.life![lender.id] ??= { debt: 0, earned: 0, up: 0, kept: 0, spent: 0 }));
  lf.assets.push({ k: 'note', label: `what ${c.firstName} owes him`, value: got, w: s.week, who: c.id, seen: 2 });
  note(lf, s.week, `lent ${c.firstName} ${c.lastName} $${got.toLocaleString('en-US')}`, -got, 2);
  lf.est = Math.max(0, lf.est - got);
  fin.est += got;
  addOpinion(s, c.id, lender.id, 'Lent me money when I was short', 8, 1);
  void life;
}

/** A stake in a living-district business: the owner takes the money for a share of his draw. */
function takeStake(ctx: Ctx, c: Character, fin: FinLife, liquid: number): void {
  const s = ctx.s;
  const L = s.living;
  if (!L) return;
  const cands = Object.values(L.biz).filter((b) => !(b.stk?.length) && L.people[b.owner] && !L.people[b.owner].dead).sort((a, b) => a.lot.localeCompare(b.lot));
  // An owner who needs capital says yes; a comfortable one usually says no.
  let pick: Tb | undefined;
  for (const b of cands) {
    const hh = L.hh[L.people[b.owner].hh];
    const needs = b.red > 0 || (hh?.cash ?? 0) < 400 || L.debts.some((d) => d.hh === hh?.id && d.st === 'open');
    if (roll(s, c.id, `owner:${b.lot}`) < (needs ? 0.6 : 0.08)) { pick = b; break; }
  }
  const l = pick ? s.econ?.lots.find((x) => x.id === pick!.lot) : undefined;
  if (!pick || !l) return;
  const amt = Math.round(Math.min(3000, liquid * 0.4) / 50) * 50;
  if (c.wealth < amt && fin.bank > 0) fin.bank -= mv(ctx, 'ext:bank', `wealth:${c.id}`, Math.min(fin.bank, amt - c.wealth), `sdraw:${c.id}`, `${c.firstName} ${c.lastName} draws on his savings`);
  const got = livingPay(ctx, L, `wealth:${c.id}`, `b:${pick.lot}`, amt, `${c.firstName} ${c.lastName} buys into ${l.name ?? 'the place'}`);
  if (!got) return;
  const pct = Math.max(0.05, Math.min(0.35, Math.round((got / Math.max(1, marketValue(s, l))) * 100) / 100));
  (pick.stk ??= []).push({ c: c.id, pct, w: s.week, paid: 0 });
  const owner = L.people[pick.owner];
  const fid = fact(s, L, 'stake', [c.id, owner.id], `${c.firstName} ${c.lastName} put $${got.toLocaleString('en-US')} into ${l.name ?? 'a place on the Boardwalk'} for ${Math.round(pct * 100)}% of ${pname(owner)}'s take.`, 2, { at: l.id, amt: got });
  fin.assets.push({ k: 'stake', label: `${Math.round(pct * 100)}% of ${l.name ?? 'a Boardwalk place'}`, value: Math.round(marketValue(s, l) * pct), w: s.week, lot: l.id, pct, fid, paid: 0, seen: 0 });
  fin.est = Math.max(0, fin.est - got);
  note(fin, s.week, `bought into ${l.name ?? 'a Boardwalk place'} ($${got.toLocaleString('en-US')})`, -got, 0, fid);
}

/** Living district: a stakeholder's share of the owner's draw (called from the business week). */
export function stakeShare(s: GameState, cid: string, lot: string, amt: number): void {
  const fin = finOf(s, cid);
  const a = fin?.assets.find((x) => x.k === 'stake' && x.lot === lot && x.value >= 0);
  if (!fin || !a) return;
  a.paid = (a.paid ?? 0) + amt;
  // The boss's estimate counts it only if he knows of the stake.
  if (stakeSeen(s, a)) fin.est += amt;
}

/** Living district: the place closed or was sold; the stake is gone (or paid out). */
export function stakeEnded(s: GameState, cid: string, lot: string, got: number, how: string): void {
  const fin = finOf(s, cid);
  const a = fin?.assets.find((x) => x.k === 'stake' && x.lot === lot && x.value >= 0);
  if (!fin || !a) return;
  a.value = 0;
  note(fin, s.week, got ? `got $${got.toLocaleString('en-US')} back when ${how}` : `lost his stake when ${how}`, got, a.seen, a.fid);
}

/** At death: the estate is kept on the books (assets and debts stay recorded). */
export function closeEstate(s: GameState, c: Character): void {
  const fin = finOf(s, c.id);
  if (!fin || fin.estate !== undefined) return;
  fin.estate = s.week;
  note(fin, s.week, 'died; his estate is what is listed here', 0, 3);
}

/* ------------------------------------------------------------------ */
/* What the boss knows (the Financial Life section)                    */
/* ------------------------------------------------------------------ */

export type Label = 'verified' | 'reported' | 'rumor' | 'estimate';
const LBL: Record<Vis, Label | undefined> = { 0: undefined, 1: 'rumor', 2: 'reported', 3: 'verified' };

export interface FinView {
  cash: { text: string; label: Label };
  savings?: { text: string; label: Label };
  income: { text: string; label: Label }[];
  assets: { text: string; label: Label }[];
  debts: { text: string; label: Label }[];
  goal: { text: string; label: Label };
  risk: { text: string; label: Label };
  hist: { w: number; text: string; label: Label }[];
  dev?: { wealth: number; bank: number; est: number; assets: Asset[]; loans: PDebt[] };
}

function band(n: number): string {
  if (n < 100) return 'next to nothing';
  if (n < 1000) return `about $${(Math.round(n / 100) * 100).toLocaleString('en-US')}`;
  if (n < 10000) return `about $${(Math.round(n / 500) * 500).toLocaleString('en-US')}`;
  return `about $${(Math.round(n / 5000) * 5000).toLocaleString('en-US')}`;
}

/** A stake is known when the fact of it reached the boss. */
function stakeSeen(s: GameState, a: Asset): Vis {
  if (a.seen) return a.seen;
  const f = a.fid && s.living ? factById(s.living, a.fid) : undefined;
  const seen = f ? factSeen(s, f) : undefined;
  return !seen ? 0 : seen.lvl === 'rumor' ? 1 : 2;
}

export function finView(s: GameState, c: Character, dev = false): FinView {
  const life = s.tribute?.life?.[c.id] as (PurseLife & { fin?: FinLife }) | undefined;
  const fin = life?.fin;
  const rows = s.tribute?.purse?.[c.id] ?? [];
  const est = fin?.est ?? Math.round(c.wealth);
  const kept8 = rows.reduce((a, r) => a + r.kept, 0);
  const income: FinView['income'] = [];
  if (rows.length) income.push({ text: `kept $${kept8.toLocaleString('en-US')} from his end in the last ${rows.length} week${rows.length === 1 ? '' : 's'} (the envelope's books)`, label: 'verified' });
  const stakes = (fin?.assets ?? []).filter((a) => a.k === 'stake');
  for (const a of stakes) {
    const v = stakeSeen(s, a);
    if (v && a.paid) income.push({ text: `$${a.paid.toLocaleString('en-US')} so far from ${a.label}`, label: LBL[v]! });
  }
  const assets: FinView['assets'] = [];
  for (const a of fin?.assets ?? []) {
    const v = a.k === 'stake' ? stakeSeen(s, a) : a.seen;
    if (!v || a.value <= 0) continue;
    assets.push({ text: `${a.label}${a.k === 'note' ? '' : ''} — ${a.k === 'note' ? `$${a.value.toLocaleString('en-US')} owed to him` : band(a.value)}`, label: LBL[v]! });
  }
  const debts: FinView['debts'] = [];
  for (const d of fin?.loans ?? []) if (d.out > 0 && d.seen) debts.push({ text: `${d.label}: $${d.out.toLocaleString('en-US')} still owed`, label: LBL[d.seen]! });
  if ((life?.debt ?? 0) > 0) debts.push({ text: `owes the credit man ${band(life!.debt)}`, label: 'rumor' });
  if (c.debtTo) debts.push({ text: `owes a rival family's shylock`, label: 'reported' });
  const hist = (fin?.hist ?? []).map((e) => {
    const v: Vis = e.fid && s.living ? (() => { const f = factById(s.living!, e.fid!); const seen = f ? factSeen(s, f) : undefined; return seen ? (seen.lvl === 'rumor' ? 1 : 2) as Vis : 0; })() : e.seen;
    return { w: e.w, text: e.text, label: LBL[v] };
  }).filter((e): e is { w: number; text: string; label: Label } => !!e.label).reverse();
  const out: FinView = {
    cash: { text: `${band(est)} that his books explain`, label: 'estimate' },
    ...(fin && fin.bank > 0 && fin.hist.some((e) => e.seen >= 1 && /bank/.test(e.text)) ? { savings: { text: 'keeps money in the bank', label: 'rumor' as Label } } : {}),
    income, assets, debts,
    goal: { text: fin ? FIN_GOAL_WORDS[fin.goal] : 'hard to say', label: 'estimate' },
    risk: { text: !fin ? 'hard to say' : fin.risk >= 70 ? 'a plunger: he bets big' : fin.risk >= 45 ? 'takes a chance now and then' : 'careful with a dollar', label: 'estimate' },
    hist,
  };
  if (dev) out.dev = { wealth: Math.round(c.wealth), bank: fin?.bank ?? 0, est, assets: fin?.assets ?? [], loans: fin?.loans ?? [] };
  return out;
}

/** The estimate of a man's own money that the screens may show (A09: never the exact private balance). */
export function seenWealth(s: GameState, c: Character, dev = false): string {
  if (dev || c.id === s.playerId) return `$${Math.round(c.wealth).toLocaleString('en-US')}`;
  const est = finOf(s, c.id)?.est ?? Math.round(c.wealth);
  return `${band(est)} (est.)`;
}

/** What the boss can say about a man's skim: never the hidden rate unless an audit found it. */
export function seenSkim(s: GameState, c: Character, flags: string[], dev = false, rate = 0): string {
  if (dev) return `skims ~${Math.round(rate * 100)}%`;
  const k = s.econ?.cases?.[c.id];
  if (k && k.week >= 0) return k.skimming ? `caught skimming ($${k.shortfall.toLocaleString('en-US')})` : 'his books checked out';
  if (flags.includes('above')) return 'lives above his envelope (talk)';
  return 'no sign of a skim';
}
