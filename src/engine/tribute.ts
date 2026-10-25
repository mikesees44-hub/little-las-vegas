import { idleMen } from './business';
import { isInSeason } from './calendar';
import { capos, crew, hasTrait, isFree, player, shortName } from './characters';
import { holder } from './council';
import { CREW_WORK, firstWinter, FIRST_WINTER_HOLDBACK, kickupSpread, skimRate, slowPayers, smallStart, SLOW_PAY_HOLDBACK, ARREARS_REPAY } from './economy';
import { POLICY_TAKE } from './crewlife';
import { honesty, noteKick } from './ledgerbook';
import { perkMod } from './lifestyle';
import { attr } from './attrs';
import { money, type Ctx } from './ledger';
import { addOpinion, opinion } from './relations';
import { gauss, rand, type RngHolder } from './rng';
import { tributeTalk } from './tributeTalk';
import {
  balances, ensureTribute, normSplit, noteFavor, sumSplit,
  type AcctId, type MemberLine, type Petition, type ShortReason, type SourceLine, type Split,
  type Transfer, type TransferCat, type TributeReport, type TributeState, type UbType,
} from './tributeState';
import type { Character, CrewPolicy, GameState, LedgerCategory } from './types';

/**
 * THE WEEKLY TAKE. Every week:
 *  1. the crews earn (the corners of each capo's district, every man's own hustle, crew work);
 *  2. every man owes his contribution under his agreement (tributeState.ts `terms`, his
 *     policy, his capo's contract) and pays it, or comes up short — the TRUTH, what he SAID,
 *     what the underboss BELIEVES are kept apart;
 *  3. the capos reconcile their crews, keep their end under contract and remit the rest
 *     (a slow payer holds some back in the winter; a greedy one skims);
 *  4. the underboss reconciles, takes his authorized share (and maybe more), and puts
 *     what is actually there in the Don's envelope with his report;
 *  5. Monday: the Don splits the envelope — personal / family treasury / reserve — in one
 *     atomic set of transfers. On a quiet week his standing policy does it.
 *
 * Money only enters the accounts from the street (`ext:*`); moving it between the
 * family's accounts is never revenue. Treasury moves post through the one ledger.
 */

/* ------------------------------------------------------------------ */
/* The journal                                                         */
/* ------------------------------------------------------------------ */

const INTERNAL = ['personal', 'reserve', 'envelope', 'clearing'] as const;
type Internal = (typeof INTERNAL)[number];

function isInternal(id: AcctId): boolean {
  return (INTERNAL as readonly string[]).includes(id) || id.startsWith('crew:');
}

function validAcct(s: GameState, id: AcctId): boolean {
  if (id === 'treasury' || (INTERNAL as readonly string[]).includes(id)) return true;
  if (id.startsWith('crew:')) return !!s.characters[id.slice(5)];
  if (id.startsWith('wealth:')) return !!s.characters[id.slice(7)];
  return id.startsWith('ext:') && id.length > 4;
}

function getBal(t: TributeState, id: AcctId): number {
  if (id.startsWith('crew:')) return t.acct.crew[id.slice(5)] ?? 0;
  return t.acct[id as Internal];
}

function addBal(t: TributeState, id: AcctId, v: number): void {
  if (id.startsWith('crew:')) {
    const k = id.slice(5);
    t.acct.crew[k] = (t.acct.crew[k] ?? 0) + v;
  } else t.acct[id as Internal] += v;
}

export interface XferOpts {
  /** Ledger line when the treasury is touched. */
  label?: string;
  category?: LedgerCategory;
  who?: string;
  src?: string;
  note?: string;
  /** Hidden from the boss's view (a skim). */
  hidden?: boolean;
}

/**
 * Move money between two accounts. Idempotent by key within the week; never
 * takes an internal account below zero (it moves what is there); posts the
 * treasury side through the one ledger. Returns the amount moved.
 */
export function xfer(ctx: Ctx, from: AcctId, to: AcctId, amount: number, cat: TransferCat, key: string, o: XferOpts = {}): number {
  const s = ctx.s;
  const t = ensureTribute(s);
  let a = Math.round(amount);
  if (!(a > 0)) return 0;
  if (from === to) throw new Error(`transfer ${key}: same account ${from}`);
  if (!validAcct(s, from) || !validAcct(s, to)) throw new Error(`transfer ${key}: invalid account ${from} -> ${to}`);
  if (t.journal.some((x) => x.k === key)) return 0;
  if (isInternal(from)) a = Math.min(a, Math.max(0, getBal(t, from)));
  if (from.startsWith('wealth:')) a = Math.min(a, Math.max(0, Math.round(s.characters[from.slice(7)].wealth)));
  if (a <= 0) return 0;
  const label = o.label ?? o.note ?? key;
  if (from === 'treasury') {
    money(ctx, -a, label, o.category ?? 'transfer');
    tag(ctx, o);
  } else if (from.startsWith('wealth:')) s.characters[from.slice(7)].wealth -= a;
  else if (isInternal(from)) addBal(t, from, -a);
  if (to === 'treasury') {
    money(ctx, a, label, o.category ?? 'transfer');
    tag(ctx, o);
  } else if (to.startsWith('wealth:')) s.characters[to.slice(7)].wealth += a;
  else if (isInternal(to)) addBal(t, to, a);
  const x: Transfer = { f: from, t: to, a, c: cat, k: key };
  if (o.note) x.n = o.note;
  if (o.hidden) x.h = 1;
  t.journal.push(x);
  return a;
}

function tag(ctx: Ctx, o: XferOpts): void {
  const l = ctx.lines[ctx.lines.length - 1];
  if (!l) return;
  if (o.who) l.who = o.who;
  if (o.src) l.src = o.src;
}

/** Start of the week: snapshot the balances; the journal starts empty. */
export function tributeOpen(s: GameState): void {
  const t = ensureTribute(s);
  t.start = balances(s);
  t.startWeek = s.week;
  t.journal = [];
}

/** Internal accounts reconcile with the journal (start + in − out == end). Returns failures. */
export function reconcileAccounts(s: GameState): string[] {
  const t = s.tribute;
  if (!t?.start) return [];
  const end = balances(s);
  delete end.treasury;
  const exp: Record<string, number> = { ...t.start };
  delete exp.treasury;
  for (const x of t.journal) {
    if (isInternal(x.f)) exp[x.f] = (exp[x.f] ?? 0) - x.a;
    if (isInternal(x.t)) exp[x.t] = (exp[x.t] ?? 0) + x.a;
  }
  const errs: string[] = [];
  for (const k of new Set([...Object.keys(exp), ...Object.keys(end)])) {
    if (Math.abs((exp[k] ?? 0) - (end[k] ?? 0)) > 1e-9) errs.push(`account ${k}: journal says ${exp[k] ?? 0} but balance is ${end[k] ?? 0}`);
    if ((end[k] ?? 0) < 0) errs.push(`account ${k} is negative (${end[k]})`);
  }
  // No transfer repeats in a week.
  const keys = new Set<string>();
  for (const x of t.journal) {
    if (keys.has(x.k)) errs.push(`transfer ${x.k} repeated`);
    keys.add(x.k);
  }
  return errs;
}

/** End of the week: archive the journal into the books (26 weeks kept). */
export function archiveAccounts(s: GameState): void {
  const t = s.tribute;
  if (!t?.start) return;
  const end = balances(s);
  t.books.push({ week: t.startWeek ?? s.week - 1, start: { ...t.start }, end, x: t.journal.filter((x) => !x.h).map((x) => (x.n ? [x.f, x.t, x.a, x.c, x.n] : [x.f, x.t, x.a, x.c])), hx: t.journal.filter((x) => x.h).map((x) => [x.f, x.t, x.a, x.c]) });
  if (t.books.length > 26) t.books = t.books.slice(-26);
  // Crew accounts of men who are gone, and empty ones, are closed.
  for (const [k, v] of Object.entries(t.acct.crew)) if (v === 0) delete t.acct.crew[k];
  t.start = undefined;
  t.journal = [];
}

/* ------------------------------------------------------------------ */
/* The underboss                                                       */
/* ------------------------------------------------------------------ */

/** The man who brings the envelope: the underboss, or whoever is acting. */
export function envelopeMan(s: GameState): { c?: Character; acting: boolean } {
  const ub = holder(s, 'underboss');
  if (ub) return { c: ub, acting: false };
  const cons = holder(s, 'consigliere');
  if (cons) return { c: cons, acting: true };
  const k = capos(s).filter((c) => isFree(s, c)).sort((a, b) => b.attributes.leadership - a.attributes.leadership)[0];
  return { c: k, acting: true };
}

/** 0..1.5: how well he counts. */
export function ubSkill(s: GameState, c: Character): number {
  return Math.max(0.3, Math.min(1.5, (attr(s, c, 'finance') + attr(s, c, 'organization') + attr(s, c, 'judgment')) / 180));
}

export function ubType(s: GameState, c: Character | undefined, acting: boolean): UbType {
  if (!c) return 'none';
  if (acting) return 'acting';
  const load = crew(s).length;
  if (ubSkill(s, c) < 0.75 || (load > 22 && ubSkill(s, c) < 0.95) || c.health < 40) return 'overwhelmed';
  if (hasTrait(c, 'Ambitious') || attr(s, c, 'ambition') >= 70 || (hasTrait(c, 'Greedy') && honesty(s, c) < 45)) return 'ambitious';
  return 'loyal';
}

export const UB_TYPE_LABEL: Record<UbType, string> = {
  loyal: 'Loyal: accurate books, raises the hard issues',
  ambitious: 'Ambitious: courts the big earners, builds his own base',
  overwhelmed: 'Overwhelmed: late reports, misses discrepancies',
  acting: 'Acting: nobody holds the seat; the count is rough',
  none: 'Nobody brings the envelope',
};

/* ------------------------------------------------------------------ */
/* Agreements                                                          */
/* ------------------------------------------------------------------ */

/** A man's agreement in plain words, and the rate he owes on his own hustle. */
export function memberTerms(s: GameState, c: Character): { text: string; rate: number; fixed?: number; exempt?: boolean } {
  const t = s.tribute?.terms[c.id];
  if (t && t.until >= s.week) {
    if (t.kind === 'exempt') return { text: `exempt till wk ${t.until}`, rate: 0, exempt: true };
    if (t.kind === 'fixed') return { text: `$${t.amount} flat`, rate: 0, fixed: t.amount };
  }
  const pol: CrewPolicy = c.policy ?? 'tax';
  return { text: pol === 'earn' ? 'keeps his hustle' : `${Math.round(POLICY_TAKE[pol] * 100)}% of his hustle`, rate: POLICY_TAKE[pol] };
}

export function inExtension(s: GameState, id: string): boolean {
  const t = s.tribute?.terms[id];
  return !!t && t.kind === 'extension' && t.until >= s.week;
}

/* ------------------------------------------------------------------ */
/* Shortfalls: truth, what he says, what the underboss believes        */
/* ------------------------------------------------------------------ */

const FRAC: Record<ShortReason, [number, number]> = {
  bad_week: [0.3, 0.7], default: [0.5, 1], mistake: [0.1, 0.3], overspent: [0.4, 1], grievance: [0.3, 0.6],
  promised: [0.5, 1], investigation: [1, 1], lying: [0.2, 0.5], carried: [0, 0], late: [0, 0],
};

/** Weekly odds a man comes up short, and the weights of the true reasons. */
export function shortOdds(s: GameState, c: Character): { p: number; w: Partial<Record<ShortReason, number>> } {
  const h = honesty(s, c);
  const capo = c.capoId ? s.characters[c.capoId] : undefined;
  const opCapo = capo ? opinion(s, c.id, capo.id) : 0;
  const opBoss = opinion(s, c.id, s.playerId);
  const ev = c.evidence ?? 0;
  const off = !isInSeason(s.date);
  let p = 0.018 + (off ? 0.012 : 0);
  if (hasTrait(c, 'Gambler')) p += 0.03;
  if (hasTrait(c, 'Drinker')) p += 0.015;
  if (h < 40) p += 0.03;
  if (Math.min(opCapo, opBoss) < -10) p += 0.03;
  if (c.debtTo) p += 0.04;
  // His own money: a man in debt outside the family is tempted; a broke one has nothing to cover a bad week with.
  const debt = s.tribute?.life?.[c.id]?.debt ?? 0;
  if (debt > 0) p += debt >= 500 ? 0.04 : 0.02;
  else if (c.wealth < 100) p += 0.01;
  if (ev >= 50) p += 0.03;
  if (hasTrait(c, 'Honest')) p *= 0.5;
  const w: Partial<Record<ShortReason, number>> = {
    bad_week: 3 + (off ? 2 : 0), default: 1.5, mistake: 1,
    overspent: hasTrait(c, 'Gambler') || hasTrait(c, 'Drinker') || debt > 0 ? 3 : 0.4,
    grievance: Math.min(opCapo, opBoss) < 0 ? 3 : 0.2,
    promised: c.debtTo || debt >= 500 ? 4 : 0.3,
    investigation: ev >= 50 ? 4 : 0,
    lying: h < 45 ? 3 : h < 60 ? 0.6 : 0,
  };
  return { p: Math.min(0.25, p), w };
}

function wpick<T extends string>(h: RngHolder, w: Partial<Record<T, number>>): T {
  const es = Object.entries(w) as [T, number][];
  const tot = es.reduce((a, [, v]) => a + Math.max(0, v), 0);
  let r = rand(h) * tot;
  for (const [k, v] of es) {
    if (r < Math.max(0, v)) return k;
    r -= Math.max(0, v);
  }
  return es[0][0];
}

/** What a man says about his shortfall (an honest man tells the truth; the rest have a story). */
export function sayReason(s: GameState, c: Character, truth: ShortReason, h: RngHolder): ShortReason {
  const hon = honesty(s, c);
  if (hon >= 60 && truth !== 'lying') return truth;
  switch (truth) {
    case 'lying': return rand(h) < 0.6 ? 'bad_week' : 'default';
    case 'overspent': return hon >= 45 && rand(h) < 0.4 ? 'overspent' : 'bad_week';
    case 'grievance': return hon >= 40 ? 'grievance' : 'bad_week';
    case 'promised': return rand(h) < 0.5 ? 'default' : 'bad_week';
    case 'investigation': return rand(h) < 0.5 ? 'investigation' : 'bad_week';
    default: return truth;
  }
}

/** What the underboss believes (and will tell the Don). */
export function believeReason(s: GameState, ub: Character | undefined, type: UbType, m: Character, truth: ShortReason, said: ShortReason, h: RngHolder): ShortReason {
  if (!ub || said === truth) return said;
  if (type === 'overwhelmed' || type === 'acting') return said;
  // An ambitious underboss protects the earners who call him first.
  const t = s.tribute;
  if (type === 'ambitious' && m.capoId && t?.ub.callsFirst.includes(m.capoId)) return 'bad_week';
  return rand(h) < Math.min(0.85, ubSkill(s, ub) * 0.55) ? truth : said;
}

/** Share of his arrears a man makes good this week, by why he fell short. */
const REPAY: Record<ShortReason, number> = {
  bad_week: 0.35, default: 0.3, mistake: 1, overspent: 0.15, grievance: 0, promised: 0.1, investigation: 0.15, lying: 0, carried: 0.25, late: 1,
};

/* ------------------------------------------------------------------ */
/* Collection                                                          */
/* ------------------------------------------------------------------ */

function newReport(s: GameState, t: TributeState): TributeReport {
  const { c, acting } = envelopeMan(s);
  const prev = t.reports[t.reports.length - 1];
  return {
    id: `r${s.week}`, week: s.week, status: 'collecting', ubId: c?.id, acting: acting || undefined, ubType: ubType(s, c, acting),
    crews: [], direct: [], sources: [], collected: 0, ubShare: 0, ubSkim: 0, reported: 0, presented: 0,
    lastPresented: prev?.presented, issues: [], petitions: [], rec: { ...t.policy }, recWhy: [], talk: [],
  };
}

/**
 * The share of a capo's end he passes down to the men who worked his corners:
 * a generous or honest capo more, a greedy one less.
 */
export function menCut(capo: Character): number {
  let f = 0.4;
  if (hasTrait(capo, 'Greedy')) f -= 0.15;
  if (hasTrait(capo, 'Honest') || hasTrait(capo, 'Patient')) f += 0.05;
  return Math.max(0.15, Math.min(0.5, f));
}

/** One man's contribution this week: due, paid (or short, and why), arrears made good. */
function contribute(ctx: Ctx, t: TributeState, rep: TributeReport, m: Character, kind: MemberLine['kind'], earned: number, due: number, terms: string, to: AcctId, srcKey: string, h: RngHolder, ub: Character | undefined): MemberLine {
  const s = ctx.s;
  const line: MemberLine = { id: m.id, earned: Math.round(earned), due: Math.round(due), paid: 0, terms, kind };
  if (line.due <= 0) return line;
  let short = 0;
  const { p, w } = shortOdds(s, m);
  if (rand(h) < p) {
    const truth = wpick(h, w);
    const [lo, hi] = FRAC[truth];
    short = Math.round(line.due * (lo + rand(h) * (hi - lo)));
    if (short > 0) {
      line.truth = truth;
      line.said = sayReason(s, m, truth, h);
      line.believed = believeReason(s, ub, rep.ubType, m, truth, line.said, h);
      // An ambitious underboss covers for the earners who call him first: a favor the Don never hears of.
      if (ub && rep.ubType === 'ambitious' && m.capoId && t.ub.callsFirst.includes(m.capoId) && line.believed !== truth) {
        noteFavor(s, { byId: ub.id, toId: m.capoId, kind: 'protect', amount: short, authority: 'unauthorized', truth: `covered ${m.firstName}'s shortfall (${truth}) in his report` });
        addOpinion(s, m.capoId, ub.id, 'Covered for my crew', 2, 1);
      }
      (t.shortHist[m.id] ??= []).push(s.week);
      if (t.shortHist[m.id].length > 8) t.shortHist[m.id].shift();
      // A real bad week or a stiffed customer: the money was never there. Otherwise he has it, or had it.
      if (truth === 'lying' || truth === 'grievance' || truth === 'investigation' || truth === 'mistake') xfer(ctx, `ext:${srcKey}`, `wealth:${m.id}`, short, 'member_keep', `w${s.week}:pocket:${kind}:${m.id}`, { note: `${m.firstName} ${m.lastName} keeps what he did not pay`, hidden: true });
    }
  }
  line.paid = line.due - short;
  if (!inExtension(s, m.id) && short > 0) t.arrears[m.id] = (t.arrears[m.id] ?? 0) + short;
  if (short > 0) t.why[m.id] = line.truth!;
  xfer(ctx, `ext:${srcKey}`, to, line.paid, kind === 'hustle' ? 'crew_contribution' : kind === 'work' ? 'crew_contribution' : 'business_income', `w${s.week}:c:${kind}:${m.id}`, { note: `${m.firstName} ${m.lastName}: ${kind === 'hustle' ? 'his hustle' : kind === 'work' ? 'crew work' : 'the corners'}` });
  return line;
}

/** Arrears made good from a man's own pocket (by why he fell short). */
function repayArrears(ctx: Ctx, t: TributeState, m: Character, to: AcctId): number {
  const owed = t.arrears[m.id] ?? 0;
  if (owed <= 0 || inExtension(ctx.s, m.id)) return 0;
  const why = t.why[m.id] ?? 'bad_week';
  const op = opinion(ctx.s, m.id, ctx.s.playerId);
  const rate = why === 'grievance' && op >= 0 ? 0.3 : REPAY[why];
  if (rate <= 0) return 0;
  const want = Math.min(owed, Math.max(25, Math.round(owed * rate)));
  const got = xfer(ctx, `wealth:${m.id}`, to, want, 'arrears', `w${ctx.s.week}:back:${m.id}`, { note: `${m.firstName} ${m.lastName} makes good on what he owed` });
  t.arrears[m.id] = owed - got;
  if (t.arrears[m.id] <= 0) {
    delete t.arrears[m.id];
    delete t.why[m.id];
  }
  return got;
}

/**
 * The crews' week (called from the economy in place of the old direct
 * kick-ups): everything collected goes up through the capos to the
 * underboss's clearing account, and from there into the Don's envelope.
 * Returns what reached the underboss (counted in the week's gross).
 * Uses the main dice exactly where the old kick-ups did (one gauss per capo).
 */
export function collectTake(ctx: Ctx, mult: number): number {
  const s = ctx.s;
  const t = ensureTribute(s);
  if (t.lastCollect === s.week) return 0;
  t.lastCollect = s.week;
  // An envelope never split (it should not happen) goes by the standing policy first.
  const stale = t.reports.find((r) => r.status === 'presented' || r.status === 'ready');
  if (stale) allocate(ctx, stale, t.policy, 'policy', []);
  const rep = newReport(s, t);
  const h: RngHolder = t;
  const carried = t.acct.clearing;
  const ub = rep.ubId ? s.characters[rep.ubId] : undefined;
  const blitz = s.edicts?.blitz ? 1.2 : 1;
  const crewOf = (capoId: string) => {
    let cl = rep.crews.find((x) => x.capoId === capoId);
    if (!cl) {
      cl = { capoId, members: [], due: 0, paid: 0, short: 0, kept: 0, held: 0, skim: 0, remitted: 0, arrears: 0 };
      rep.crews.push(cl);
    }
    return cl;
  };
  const capoOk = (id?: string) => {
    const k = id ? s.characters[id] : undefined;
    return k && k.rank === 'capo' && k.faction === 'player' && isFree(s, k) && k.id !== s.playerId ? k : undefined;
  };
  const sources: Record<string, SourceLine> = {};
  const addSrc = (key: string, label: string, amount: number, who?: string, src?: string) => {
    if (amount <= 0) return;
    const x = (sources[key] ??= { label, amount: 0, who, src });
    x.amount += amount;
  };
  if (carried > 0) addSrc('carry', 'Kick-ups: the rest of last week\'s count', carried);
  rep.carry = carried;
  rep.inv = 0;

  // 1. Every idle man's own hustle (his agreement: his policy, or standing terms).
  const st = 1 + perkMod(s, 'street') / 100;
  const hustleBy: Record<string, { n: number; paid: number }> = {};
  for (const c of idleMen(s)) {
    const craft = c.craft === 'earner' || c.craft === 'bookmaker' ? 1.2 : c.craft === 'collector' ? 1.1 : 1;
    const earned = (c.rank === 'soldier' ? 32 : 18) * (0.7 + c.attributes.business / 200) * mult * blitz * craft;
    c.lastEarn = Math.round(earned);
    const terms = memberTerms(s, c);
    const pol = c.policy ?? 'tax';
    const bossCut = terms.fixed !== undefined ? Math.min(earned, terms.fixed) : earned * terms.rate;
    xfer(ctx, `ext:hustle:${c.id}`, `wealth:${c.id}`, Math.round(earned - bossCut), 'member_keep', `w${s.week}:mine:${c.id}`, { note: `${c.firstName} ${c.lastName} keeps his end of his hustle` });
    const due = Math.round(bossCut * (terms.fixed !== undefined ? 1 : st));
    const capo = capoOk(c.capoId);
    const to: AcctId = capo ? `crew:${capo.id}` : 'clearing';
    const ml = contribute(ctx, t, rep, c, 'hustle', earned, due, terms.text, to, `hustle:${c.id}`, h, ub);
    if (capo) {
      const cl = crewOf(capo.id);
      cl.members.push(ml);
    } else rep.direct.push(ml);
    const g = terms.fixed !== undefined ? 'fixed' : terms.exempt ? 'exempt' : pol;
    const hb = (hustleBy[g] ??= { n: 0, paid: 0 });
    hb.n++;
    hb.paid += ml.paid;
    if (ml.due === 0 && pol === 'earn') continue;
  }
  if (hustleBy.tax) addSrc('h:tax', `Street hustle: ${hustleBy.tax.n} men hand over 40%`, hustleBy.tax.paid);
  if (hustleBy.squeeze) addSrc('h:squeeze', `Street hustle: squeezing ${hustleBy.squeeze.n} men for 85%`, hustleBy.squeeze.paid);
  if (hustleBy.fixed) addSrc('h:fixed', `Street hustle: ${hustleBy.fixed.n} men on a flat weekly figure`, hustleBy.fixed.paid);
  if (hustleBy.earn?.n) ctx.log.push(`${hustleBy.earn.n} men kept everything they hustled this week.`);

  // 2. The corners of each capo's district (the old kick-up: same dice, same contract, same skim).
  const slow = new Set(isInSeason(s.date) ? [] : slowPayers(s).map((c) => c.id));
  for (const d of s.districts) {
    const capo = d.capoId ? s.characters[d.capoId] : undefined;
    if (!capo || !isFree(s, capo) || capo.faction !== 'player') continue;
    const infl = d.influence.player ?? 0;
    if (infl <= 0) continue;
    const skill = 0.85 + capo.attributes.business / 400;
    const variance = Math.max(0.3, 1 + gauss(s) * kickupSpread(capo));
    const take = d.streetBase * (infl / 100) * mult * skill * variance * blitz;
    const keep = capo.keep ?? 0.3;
    const owedTotal = take - take * keep;
    const cl = crewOf(capo.id);
    cl.districtId = d.id;
    cl.v = Math.round(variance * 100) / 100;
    cl.kept += Math.round(take * keep);
    xfer(ctx, `ext:street:${d.id}`, `wealth:${capo.id}`, Math.round(take * keep), 'capo_distribution', `w${s.week}:keep:${capo.id}:${d.id}`, { note: `${capo.firstName} ${capo.lastName} keeps his end (${Math.round(keep * 100)}%) of ${d.name}` });
    capo.lastEarn = Math.round(take);
    // His men work the corners: each owes his part of what goes up.
    const men = crew(s).filter((m) => m.capoId === capo.id && isFree(s, m) && (m.rank === 'soldier' || m.rank === 'associate'));
    const wts = [{ c: capo, w: 2 }, ...men.map((m) => ({ c: m, w: m.rank === 'soldier' ? 1 + m.attributes.business / 100 : 0.6 }))];
    const wsum = wts.reduce((a, x) => a + x.w, 0);
    let paidIn = 0;
    let assigned = 0;
    wts.forEach((x, i) => {
      const part = i === wts.length - 1 ? Math.round(owedTotal) - assigned : Math.round((owedTotal * x.w) / wsum);
      assigned += part;
      const earned = (take * x.w) / wsum;
      if (x.c.id === capo.id) {
        // The capo's own share always comes in (his skim and holdback come off the whole envelope below).
        const got = xfer(ctx, `ext:street:${d.id}`, `crew:${capo.id}`, part, 'business_income', `w${s.week}:own:${capo.id}:${d.id}`, { note: `${capo.firstName}'s own corners in ${d.name}` });
        cl.members.push({ id: capo.id, earned: Math.round(earned), due: part, paid: got, terms: `keeps ${Math.round(keep * 100)}%`, kind: 'capo' });
        paidIn += got;
      } else {
        const ml = contribute(ctx, t, rep, x.c, 'corners', earned, part, `${Math.round((1 - keep) * 100)}% of his corners`, `crew:${capo.id}`, `street:${d.id}`, h, ub);
        cl.members.push(ml);
        paidIn += ml.paid;
      }
    });
    // The capo pays his men their end of the corners out of his own end (capo distribution).
    const keptEnd = Math.round(take * keep);
    const menW = wts.filter((x) => x.c.id !== capo.id);
    const menSum = menW.reduce((a, x) => a + x.w, 0);
    if (menSum > 0 && keptEnd > 0) {
      const pool = Math.round(keptEnd * menCut(capo));
      const parts = apportion(pool, menW.map((x) => x.w));
      menW.forEach((x, i) => {
        if (parts[i] > 0) xfer(ctx, `wealth:${capo.id}`, `wealth:${x.c.id}`, parts[i], 'capo_distribution', `w${s.week}:end:${capo.id}:${x.c.id}:${d.id}`, { note: `${x.c.firstName} ${x.c.lastName}'s end of the corners from ${capo.firstName}` });
      });
    }
    // A capo whose generous streak covers a struggling man's dues.
    for (const ml of cl.members) {
      if (!ml.truth || (ml.truth !== 'bad_week' && ml.truth !== 'default')) continue;
      const m = s.characters[ml.id];
      const hist = t.shortHist[ml.id] ?? [];
      if (hist.filter((w) => s.week - w < 6).length < 2) continue;
      if (!(opinion(s, capo.id, m.id) >= 20 || hasTrait(capo, 'Honest') || hasTrait(capo, 'Patient'))) continue;
      const cover = Math.min(ml.due - ml.paid, Math.round(capo.wealth * 0.5));
      const got = xfer(ctx, `wealth:${capo.id}`, `crew:${capo.id}`, cover, 'crew_contribution', `w${s.week}:carry:${m.id}`, { note: `${capo.firstName} covers ${m.firstName}'s dues out of his own pocket` });
      if (got > 0) {
        ml.paid += got;
        ml.carried = got;
        ml.believed = 'carried';
        t.arrears[m.id] = Math.max(0, (t.arrears[m.id] ?? 0) - got);
        if (!t.arrears[m.id]) delete t.arrears[m.id];
        paidIn += got;
        const carry = t.carry;
        carry[`${capo.id}>${m.id}`] = (carry[`${capo.id}>${m.id}`] ?? 0) + got;
        noteFavor(s, { byId: capo.id, toId: m.id, kind: 'carry', amount: got, authority: 'delegated', truth: `covered ${m.firstName}'s dues out of his own pocket`, knownBy: rep.ubId && rep.ubType !== 'overwhelmed' ? [rep.ubId] : [] });
        if (carry[`${capo.id}>${m.id}`] >= 300) t.beats.push({ kind: 'carry', week: s.week, who: capo.id, forId: m.id, amount: carry[`${capo.id}>${m.id}`], pri: 50 });
      }
    }
    // The capo's envelope: what came in, less what he skims and what a slow payer holds back.
    const skim = Math.round(paidIn * skimRate(s, capo));
    let remit = paidIn - skim;
    let held = 0;
    if (!isInSeason(s.date) && remit > 0 && slow.has(capo.id)) {
      held = Math.round(remit * (firstWinter(s) ? FIRST_WINTER_HOLDBACK : SLOW_PAY_HOLDBACK));
      remit -= held;
      capo.arrears = (capo.arrears ?? 0) + held;
    }
    if (skim > 0) {
      xfer(ctx, `crew:${capo.id}`, `wealth:${capo.id}`, skim, 'capo_distribution', `w${s.week}:skim:${capo.id}`, { note: 'off the top', hidden: true });
      capo.skimmed = (capo.skimmed ?? 0) + skim;
    }
    if (held > 0) xfer(ctx, `crew:${capo.id}`, `wealth:${capo.id}`, held, 'capo_distribution', `w${s.week}:held:${capo.id}`, { note: `${capo.firstName} holds part of the winter envelope back (owed)` });
    const up = xfer(ctx, `crew:${capo.id}`, 'clearing', remit, 'crew_contribution', `w${s.week}:remit:${capo.id}:${d.id}`, { note: `${capo.firstName}'s crew (${d.name}) to the underboss` });
    cl.skim += skim;
    cl.held += held;
    cl.remitted += up;
    noteKick(s, capo.id, d.id, owedTotal, Math.max(0, up), held, skim);
    addSrc(`k:${capo.id}:${d.id}`, `Kick-up: ${shortName(capo)} (${d.name})`, up, capo.id, d.id);
  }
  // A capo with no district still has men (crew work for the small starts; their hustle above).
  // 3. In the season the slow payers make good what they held back.
  if (isInSeason(s.date)) {
    for (const capo of crew(s)) {
      if (!capo.arrears || !isFree(s, capo)) continue;
      const pay = Math.min(capo.arrears, Math.max(100, Math.round(capo.arrears * ARREARS_REPAY)), Math.max(0, capo.wealth));
      if (pay <= 0) continue;
      const got = xfer(ctx, `wealth:${capo.id}`, 'clearing', pay, 'arrears', `w${s.week}:late:${capo.id}`, { note: `${capo.firstName} makes good on the winter` });
      capo.arrears -= got;
      const cl = crewOf(capo.id);
      cl.late = (cl.late ?? 0) + got;
      cl.remitted += got;
      addSrc(`late:${capo.id}`, `Late kick-up: ${shortName(capo)} makes good on the winter`, got, capo.id, s.districts.find((x) => x.capoId === capo.id)?.id);
    }
  }
  // 4. Crew work (Rise to Power and the rank starts): steady small jobs by each capo's men.
  if (smallStart(s) && s.respect < 60) {
    const season = mult > 1 ? 1.0 : 1.15;
    for (const k of crew(s).filter((c) => c.rank === 'capo')) {
      if (!isFree(s, k)) continue;
      const men = crew(s).filter((m) => m.capoId === k.id && isFree(s, m) && (m.rank === 'soldier' || m.rank === 'associate'));
      if (!men.length) continue;
      const f = season * (0.9 + k.attributes.business / 500);
      const cl = crewOf(k.id);
      let paid = 0;
      for (const m of men) {
        const due = Math.round(CREW_WORK[m.rank as 'soldier' | 'associate'] * f);
        const ml = contribute(ctx, t, rep, m, 'work', due, due, 'crew work, flat', `crew:${k.id}`, `work:${m.id}`, h, ub);
        cl.members.push(ml);
        paid += ml.paid;
      }
      const up = xfer(ctx, `crew:${k.id}`, 'clearing', paid, 'crew_contribution', `w${s.week}:work:${k.id}`, { note: `${k.firstName}'s crew work to the underboss` });
      cl.remitted += up;
      addSrc(`work:${k.id}`, `Crew work: ${shortName(k)}'s crew (${men.length} m${men.length > 1 ? 'en' : 'an'})`, up, k.id);
    }
  }
  // 5. Arrears made good, and the hustle the capos pass up.
  let backTotal = 0;
  for (const id of Object.keys(t.arrears)) {
    const m = s.characters[id];
    if (!m?.alive || m.faction !== 'player' || !isFree(s, m)) continue;
    const capo = capoOk(m.capoId);
    const got = repayArrears(ctx, t, m, capo ? `crew:${capo.id}` : 'clearing');
    if (!got) continue;
    backTotal += got;
    const ml = (capo ? crewOf(capo.id).members : rep.direct).find((x) => x.id === id);
    if (ml) ml.back = (ml.back ?? 0) + got;
    else (capo ? crewOf(capo.id).members : rep.direct).push({ id, earned: 0, due: 0, paid: 0, back: got, terms: memberTerms(s, m).text, kind: 'hustle' });
  }
  for (const cl of rep.crews) {
    const left = t.acct.crew[cl.capoId] ?? 0;
    if (left > 0) {
      const capo = s.characters[cl.capoId];
      const got = xfer(ctx, `crew:${cl.capoId}`, 'clearing', left, 'crew_contribution', `w${s.week}:pass:${cl.capoId}`, { note: `${capo.firstName} passes his men's hustle up` });
      cl.remitted += got;
    }
    cl.due = cl.members.reduce((a, m) => a + m.due, 0);
    cl.paid = cl.members.reduce((a, m) => a + m.paid, 0);
    cl.short = cl.members.reduce((a, m) => a + Math.max(0, m.due - m.paid), 0);
    cl.arrears = cl.members.reduce((a, m) => a + (t.arrears[m.id] ?? 0), 0) + (s.characters[cl.capoId]?.arrears ?? 0);
    const prev = t.reports[t.reports.length - 1]?.crews.find((x) => x.capoId === cl.capoId);
    if (cl.short > 0 && prev && prev.short > 0) cl.again = true;
  }
  if (backTotal > 0) addSrc('back', `Arrears: men make good on what they owed`, backTotal);
  // Investments the Don funded pay into the take (or stop paying).
  for (const inv of t.investments.filter((x) => x.status === 'funded')) {
    if (s.week > inv.until) {
      inv.status = 'paid';
      continue;
    }
    if (!inv.good && s.week - inv.week >= 6) {
      inv.status = 'failed';
      t.beats.push({ kind: 'inv_failed', week: s.week, who: inv.byId, amount: inv.amount, ref: inv.id, pri: 45 });
      continue;
    }
    const got = xfer(ctx, `ext:inv:${inv.id}`, 'clearing', inv.weekly, 'business_income', `w${s.week}:inv:${inv.id}`, { note: `${inv.what} pays its week` });
    addSrc(`inv:${inv.id}`, `Investment: ${inv.what}`, got, inv.byId);
    rep.inv = (rep.inv ?? 0) + got;
  }
  // The rest of the hustle passed up by capos goes in its stream; direct payers too.
  const listed = Object.values(sources).reduce((a, x) => a + x.amount, 0);
  const inClearing = t.acct.clearing;
  if (inClearing > listed) addSrc('other', 'Kick-ups: the rest of the crews\' money', inClearing - listed);
  rep.sources = Object.values(sources).filter((x) => x.amount > 0);
  rep.collected = t.acct.clearing;

  // 6. The underboss reconciles: his authorized share, maybe more, and what is late.
  underbossCut(ctx, t, rep, ub, h);
  t.reports.push(rep);
  if (t.reports.length > 26) t.reports = t.reports.slice(-26);
  for (const cl of rep.crews) {
    if (cl.short > 0) t.stats.shortfalls++;
  }
  return rep.collected;
}

function underbossCut(ctx: Ctx, t: TributeState, rep: TributeReport, ub: Character | undefined, h: RngHolder): void {
  const s = ctx.s;
  const gross = t.acct.clearing;
  if (ub && !rep.acting) {
    const share = Math.round((gross * t.ub.rateBp) / 10000);
    rep.ubShare = xfer(ctx, 'clearing', `wealth:${ub.id}`, share, 'underboss_distribution', `w${s.week}:ub:${ub.id}`, { note: `${ub.firstName} ${ub.lastName}'s end (${t.ub.rateBp / 100}%)` });
    // A greedy or ambitious man takes a little more, and leaves it out of his report.
    const hon = honesty(s, ub);
    if (!rep.acting && hon < 50 && (rep.ubType === 'ambitious' || hasTrait(ub, 'Greedy')) && rand(h) < 0.5) {
      const extra = Math.round(gross * (0.01 + rand(h) * 0.04));
      rep.ubSkim = xfer(ctx, 'clearing', `wealth:${ub.id}`, extra, 'underboss_distribution', `w${s.week}:ubskim:${ub.id}`, { note: 'off the count', hidden: true });
    }
  }
  // Overwhelmed or acting: part of the count is not done by Monday (it stays in clearing, next week).
  let late = 0;
  if (rep.ubType === 'overwhelmed' || rep.ubType === 'acting' || !ub) {
    const p = rep.ubType === 'acting' || !ub ? 0.6 : 0.35;
    if (rand(h) < p) late = Math.round(t.acct.clearing * (0.1 + rand(h) * 0.2));
  }
  const present = Math.max(0, t.acct.clearing - late);
  rep.presented = xfer(ctx, 'clearing', 'envelope', present, 'crew_contribution', `w${s.week}:env`, { note: 'The Don\'s envelope' });
  rep.reported = rep.collected - rep.ubSkim;
  if (late > 0) rep.issues.push({ kind: 'late', text: `$${late.toLocaleString('en-US')} of the count is not done yet; it comes next week.`, amount: late, severity: 1 });
  rep.status = 'ready';
}

/* ------------------------------------------------------------------ */
/* Obligations and the underboss's recommendation                      */
/* ------------------------------------------------------------------ */

export interface Obligation {
  what: string;
  amount: number;
  /** Weeks until due (0 = this week, undefined = weekly). */
  due?: number;
  weekly?: boolean;
  kind: 'debt' | 'tribute' | 'legal' | 'payroll' | 'upkeep' | 'promise' | 'receivable';
}

/** Average weekly outgoings (costs, tribute, debt) over the last weeks. */
export function weeklyCosts(s: GameState): number {
  return Math.max(1200, Math.round(s.tribute?.costAvg ?? 2000));
}

export function obligations(s: GameState): Obligation[] {
  const out: Obligation[] = [];
  for (const d of s.debts) out.push({ what: `Loan: ${d.lender} (${d.weeksLeft} weeks left)`, amount: d.weeklyPayment, weekly: true, kind: 'debt' });
  const monthEnv = (s.director?.tribute ?? []).slice(-1)[0]?.[1];
  if (monthEnv) out.push({ what: 'Philadelphia\'s envelope (monthly)', amount: monthEnv, due: Math.max(0, 4 - (s.week % 4)), kind: 'tribute' });
  const jailed = crew(s).filter((c) => !isFree(s, c)).length;
  if (jailed) out.push({ what: `Lawyers & families of ${jailed} men inside`, amount: 40 * jailed, weekly: true, kind: 'legal' });
  if (s.legal && s.legal.personId === s.playerId && s.legal.stage !== 'quiet') out.push({ what: 'Your own lawyers (the case)', amount: 2500, due: Math.max(0, (s.legal.next ?? s.week + 4) - s.week), kind: 'legal' });
  out.push({ what: 'Payroll, upkeep, the pad (weekly average)', amount: weeklyCosts(s), weekly: true, kind: 'payroll' });
  const t = s.tribute;
  if (t) {
    const owed = Object.values(t.arrears).reduce((a, b) => a + b, 0) + crew(s).reduce((a, c) => a + (c.arrears ?? 0), 0);
    if (owed > 0) out.push({ what: 'Owed TO the family (arrears)', amount: owed, kind: 'receivable' });
  }
  return out;
}

/** What the underboss recommends, and why (every number from the records). */
export function recommendSplit(s: GameState, rep: TributeReport): { split: Split; why: string[] } {
  const t = ensureTribute(s);
  const pol = normSplit(t.policy);
  if (rep.ubType === 'acting' || rep.ubType === 'none') return { split: pol, why: ['Nobody holds the seat; he goes by your standing split.'] };
  if (rep.ubType === 'overwhelmed') return { split: pol, why: ['Same as always. He has not had time to look at what is coming.'] };
  const cost = weeklyCosts(s);
  const why: string[] = [];
  const debts = s.debts.reduce((a, d) => a + d.weeklyPayment * Math.min(4, d.weeksLeft), 0);
  const ob = obligations(s);
  const legal = ob.filter((o) => o.kind === 'legal' && !o.weekly).reduce((a, o) => a + o.amount, 0);
  const philly = ob.find((o) => o.kind === 'tribute');
  const reserveTarget = 3 * cost + debts + legal + (philly && (philly.due ?? 9) <= 2 ? philly.amount : 0);
  let reserve = 800;
  if (t.acct.reserve < reserveTarget / 2) {
    reserve = 2500;
    why.push(`The reserve has $${t.acct.reserve.toLocaleString('en-US')}; with ${legal ? 'legal bills, ' : ''}${debts ? 'loan payments, ' : ''}three weeks of bills it should hold $${reserveTarget.toLocaleString('en-US')}.`);
  } else if (t.acct.reserve < reserveTarget) {
    reserve = 1500;
    why.push(`Put a little more aside: the reserve is under $${reserveTarget.toLocaleString('en-US')}.`);
  } else why.push('The reserve is healthy.');
  let treasury: number;
  if (s.money < 2 * cost) {
    treasury = 7500;
    why.push(`The family has $${Math.round(s.money).toLocaleString('en-US')} against about $${cost.toLocaleString('en-US')} a week going out.`);
  } else if (s.money < 6 * cost) treasury = 6500;
  else {
    treasury = 5000;
    why.push('The family\'s operating money is comfortable.');
  }
  let personal = 10000 - reserve - treasury;
  // A loyal man never tells the boss to take more than a fifth; the rest stays working for the family.
  if (rep.ubType === 'loyal' && personal > 2000) {
    treasury += personal - 2000;
    personal = 2000;
  }
  if (rep.ubType === 'ambitious') {
    const more = Math.min(1000, treasury - 4000);
    personal += more;
    treasury -= more;
    why.push('"You earned it. Enjoy it. Let me worry about the crews."');
  }
  if (rep.ubType === 'loyal' && s.money < 2 * cost) {
    const less = Math.max(0, personal - 1000);
    personal -= less;
    treasury += less;
    why.push('"Take less this week. The family needs it more than you do."');
  }
  return { split: normSplit({ personal: Math.max(0, personal), reserve }), why };
}

/* ------------------------------------------------------------------ */
/* Allocation: Monday                                                  */
/* ------------------------------------------------------------------ */

/** Split a total over weights with largest-remainder rounding (sums exactly). */
function apportion(total: number, ws: number[]): number[] {
  const sum = ws.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total <= 0) return ws.map(() => 0);
  const raw = ws.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    out[i]++;
    left--;
  }
  return out;
}

/**
 * Split the envelope: petitions granted first (off the top), then personal /
 * treasury / reserve by basis points. One atomic set of transfers; a report is
 * never split twice.
 */
export function allocate(ctx: Ctx, rep: TributeReport, split: Split, by: 'policy' | 'his' | 'custom' | 'quiet', granted: string[]): void {
  const s = ctx.s;
  const t = ensureTribute(s);
  if (rep.alloc || rep.status === 'allocated') return;
  const sp = normSplit(split);
  if (sumSplit(sp) !== 10000) throw new Error('envelope split must total 100%');
  const k = `alloc:${rep.id}`;
  const done: string[] = [];
  for (const id of granted) {
    const p = rep.petitions.find((x) => x.id === id);
    if (!p) continue;
    if (grantPetition(ctx, t, rep, p)) done.push(id);
  }
  const env = Math.min(t.acct.envelope, rep.presented);
  const [personal, reserve] = [Math.floor((env * sp.personal) / 10000), Math.floor((env * sp.reserve) / 10000)];
  const treasury = env - personal - reserve;
  xfer(ctx, 'envelope', 'personal', personal, 'don_personal_share', `${k}:p`, { note: `Your cut (${sp.personal / 100}%)` });
  xfer(ctx, 'envelope', 'reserve', reserve, 'reserve_allocation', `${k}:r`, { note: `Put aside (${sp.reserve / 100}%)` });
  // The family's end goes into the treasury as the week's kick-up lines, per crew and stream.
  const srcs = rep.sources.filter((x) => x.amount > 0);
  const parts = apportion(treasury, srcs.map((x) => x.amount));
  let posted = 0;
  srcs.forEach((x, i) => {
    if (parts[i] <= 0) return;
    posted += xfer(ctx, 'envelope', 'treasury', parts[i], 'treasury_allocation', `${k}:t:${i}`, { label: x.label, category: x.label.startsWith('Street hustle') ? 'street' : 'kickup', who: x.who, src: x.src });
  });
  if (treasury - posted > 0) posted += xfer(ctx, 'envelope', 'treasury', treasury - posted, 'treasury_allocation', `${k}:t:rest`, { label: 'The envelope: the family\'s end', category: 'kickup' });
  rep.alloc = { split: sp, personal, treasury: posted, reserve, by, week: s.week, granted: done };
  rep.status = 'allocated';
  t.lastAlloc = s.week;
  t.greed.push(sp.personal);
  if (t.greed.length > 12) t.greed.shift();
}

function grantPetition(ctx: Ctx, t: TributeState, rep: TributeReport, p: Petition): boolean {
  const s = ctx.s;
  const by = s.characters[p.byId];
  const target = p.forId ? s.characters[p.forId] : by;
  if (!by?.alive) return false;
  const k = `grant:${rep.id}:${p.id}`;
  const src = p.from === 'reserve' ? 'reserve' : 'envelope';
  t.stats.granted++;
  noteFavor(s, { byId: s.playerId, toId: (target ?? by).id, kind: p.kind === 'extension' ? 'extension' : p.kind === 'advance' ? 'advance' : 'assistance', amount: p.amount, authority: 'don', truth: p.text, knownBy: [by.id, ...(rep.ubId ? [rep.ubId] : [])] });
  switch (p.kind) {
    case 'families': {
      const got = xfer(ctx, src, 'ext:families', p.amount, 'assistance', k, { note: `For the families of the men inside (${by.firstName} asked)` });
      return got > 0;
    }
    case 'extension':
      if (target) t.terms[target.id] = { kind: 'extension', until: s.week + 4, why: `${by.firstName} asked for time` };
      return true;
    case 'advance': {
      if (!target) return false;
      const got = xfer(ctx, src, `wealth:${target.id}`, p.amount, 'assistance', k, { note: `An advance for ${target.firstName} (he owes it back)` });
      if (got > 0) t.arrears[target.id] = (t.arrears[target.id] ?? 0) + got;
      return got > 0;
    }
    case 'help': {
      if (!target) return false;
      const got = xfer(ctx, src, `wealth:${target.id}`, p.amount, 'assistance', k, { note: `Help for ${target.firstName}'s household` });
      return got > 0;
    }
    case 'legal': {
      const got = xfer(ctx, src, 'ext:lawyers', p.amount, 'expense', k, { note: `Lawyers for ${target?.firstName ?? 'the man'}` });
      if (got > 0 && target) target.evidence = Math.max(0, (target.evidence ?? 0) - Math.round(p.amount / 150));
      return got > 0;
    }
    case 'investment': {
      const got = xfer(ctx, 'reserve', `ext:inv:${p.id}`, p.amount, 'expense', k, { note: `Investment: ${p.text}` });
      if (got <= 0) return false;
      const weeks = 20 + (hashInt(p.id) % 20);
      t.investments.push({ id: p.id, week: s.week, byId: p.byId, what: p.text, amount: got, weekly: Math.max(20, Math.round(got * 0.016)), until: s.week + weeks, good: p.honest, status: 'funded' });
      return true;
    }
  }
}

function hashInt(x: string): number {
  let h = 7;
  for (let i = 0; i < x.length; i++) h = (h * 31 + x.charCodeAt(i)) >>> 0;
  return h;
}

/** The Don's own money first, the treasury for the rest (the household bills). */
export function payFromPersonal(ctx: Ctx, amount: number, label: string, key: string): void {
  const s = ctx.s;
  const t = ensureTribute(s);
  const own = xfer(ctx, 'personal', 'ext:household', Math.min(amount, t.acct.personal), 'expense', `w${s.week}:${key}`, { note: label });
  if (amount - own > 0) money(ctx, -(amount - own), own > 0 ? `${label} (the rest from the family)` : label, 'cost');
}

/** When the treasury runs dry, the reserve covers it. */
export function coverFromReserve(ctx: Ctx): void {
  const s = ctx.s;
  const t = ensureTribute(s);
  if (s.money >= 0 || t.acct.reserve <= 0) return;
  const got = xfer(ctx, 'reserve', 'treasury', Math.min(t.acct.reserve, Math.ceil(-s.money) + 250), 'cover', `w${s.week}:cover`, { label: 'The reserve covers the week (the family ran dry)', category: 'transfer' });
  if (got) t.stats.covers++;
}

/* ------------------------------------------------------------------ */
/* The week's report: issues, petitions, the recommendation, the talk  */
/* ------------------------------------------------------------------ */

const PETITION_ODDS = 0.22;

/** After the crews are counted: issues, petitions, his recommended split, his words. */
export function prepareReport(ctx: Ctx): void {
  const s = ctx.s;
  const t = ensureTribute(s);
  const rep = t.reports[t.reports.length - 1];
  if (!rep || rep.week !== s.week || rep.talk.length) return;
  const h: RngHolder = t;
  // Issues from the records.
  for (const cl of rep.crews) {
    const capo = s.characters[cl.capoId];
    if (cl.short > 0) rep.issues.push({ kind: 'short', who: cl.capoId, amount: cl.short, severity: cl.short > cl.due * 0.15 || cl.again ? 2 : 1, text: `${capo.firstName} ${capo.lastName}'s crew came in $${cl.short.toLocaleString('en-US')} short${cl.again ? ' again' : ''}.` });
    if (cl.held > 0) rep.issues.push({ kind: 'short', who: cl.capoId, amount: cl.held, severity: 1, text: `${capo.firstName} held back $${cl.held.toLocaleString('en-US')} of the winter envelope; it is on the books.` });
  }
  for (const d of t.disputes.filter((x) => x.status === 'open')) {
    const capo = s.characters[d.capoId];
    if (capo) rep.issues.push({ kind: 'dispute', who: d.capoId, amount: d.amount, severity: 2, text: `${capo.firstName} disputes his assessment: ${d.claim}` });
  }
  const ob = obligations(s);
  for (const o of ob.filter((x) => x.kind === 'legal' && !x.weekly)) rep.issues.push({ kind: 'legal', amount: o.amount, severity: 2, text: `${o.what}: about $${o.amount.toLocaleString('en-US')} coming.` });
  const ph = ob.find((x) => x.kind === 'tribute');
  if (ph && (ph.due ?? 9) <= 1) rep.issues.push({ kind: 'tribute', amount: ph.amount, severity: 1, text: `Philadelphia's envelope is due: about $${ph.amount.toLocaleString('en-US')}.` });
  if (s.money < weeklyCosts(s)) rep.issues.push({ kind: 'treasury', amount: Math.round(s.money), severity: 2, text: `The family's treasury is down to $${Math.round(s.money).toLocaleString('en-US')}.` });
  if (rep.acting) rep.issues.push({ kind: 'acting', severity: 2, text: 'Nobody holds the underboss\'s seat. The count is rough and late.' });
  const avgGreed = t.greed.length ? t.greed.reduce((a, b) => a + b, 0) / t.greed.length : 0;
  if (t.greed.length >= 6 && avgGreed >= 5000) rep.issues.push({ kind: 'greed', severity: 2, text: `You have taken ${Math.round(avgGreed / 100)}% for yourself, week after week. The men notice when the family is short.` });
  // A petition, sometimes.
  if (rand(h) < PETITION_ODDS) {
    const p = makePetition(s, t, rep, h);
    if (p) {
      rep.petitions.push(p);
      t.stats.petitions++;
      t.petitionsTo[s.playerId] = (t.petitionsTo[s.playerId] ?? 0) + 1;
    }
  }
  const r = recommendSplit(s, rep);
  rep.rec = r.split;
  rep.recWhy = r.why;
  rep.talk = tributeTalk(s, rep, h);
}

function makePetition(s: GameState, t: TributeState, rep: TributeReport, h: RngHolder): Petition | undefined {
  const kinds: Petition['kind'][] = [];
  const jailed = crew(s).filter((c) => !isFree(s, c));
  if (jailed.length) kinds.push('families');
  const owing = Object.keys(t.arrears).map((id) => s.characters[id]).filter((c): c is Character => !!c?.alive && c.faction === 'player' && !!c.capoId);
  if (owing.length) kinds.push('extension');
  const broke = crew(s).filter((c) => (c.rank === 'soldier' || c.rank === 'associate') && isFree(s, c) && ((c.wealth < 150 && (c.household?.kids?.length ?? 0) > 0) || (t.life?.[c.id]?.debt ?? 0) >= 300));
  if (broke.length) kinds.push('advance', 'help');
  const pitchers = capos(s).filter((c) => isFree(s, c) && c.attributes.business >= 55);
  if (pitchers.length && t.acct.reserve >= 2000) kinds.push('investment');
  const hot = crew(s).filter((c) => isFree(s, c) && (c.evidence ?? 0) >= 60);
  if (hot.length) kinds.push('legal');
  if (!kinds.length) return undefined;
  const kind = kinds[Math.floor(rand(h) * kinds.length)];
  const any = <T,>(xs: T[]) => xs[Math.floor(rand(h) * xs.length)];
  const id = `p${s.week}`;
  const r100 = (n: number) => Math.max(100, Math.round(n / 100) * 100);
  switch (kind) {
    case 'families': {
      const k = any(capos(s).filter((c) => isFree(s, c))) ?? envelopeMan(s).c;
      if (!k) return undefined;
      return { id, kind, byId: k.id, amount: r100(Math.min(rep.presented * 0.15, 500 * jailed.length + 300)), from: 'treasury', honest: true, text: `something for the families of the ${jailed.length} m${jailed.length > 1 ? 'en' : 'an'} inside` };
    }
    case 'extension': {
      const m = any(owing);
      const k = s.characters[m.capoId!];
      if (!k) return undefined;
      return { id, kind, byId: k.id, forId: m.id, amount: t.arrears[m.id] ?? 0, from: 'treasury', honest: true, text: `four more weeks for ${m.firstName} ${m.lastName} to make good on $${(t.arrears[m.id] ?? 0).toLocaleString('en-US')}` };
    }
    case 'advance':
    case 'help': {
      const m = any(broke);
      const by = m.capoId && s.characters[m.capoId]?.alive ? s.characters[m.capoId] : m;
      return { id, kind, byId: by.id, forId: m.id, amount: r100(kind === 'advance' ? 300 + rand(h) * 500 : 200 + rand(h) * 400), from: 'treasury', honest: honesty(s, m) >= 45, text: kind === 'advance' ? `an advance for ${m.firstName}: the rent and the kids' shoes` : `help with ${m.firstName}'s household bills; he can't cover them this month` };
    }
    case 'investment': {
      const k = any(pitchers);
      const what = any(['a piece of a car wash on Rio Grande Avenue', 'a jukebox route in Villas', 'a share of a motel going up on Ocean Avenue', 'a linen service for the boardwalk hotels', 'a trucking outfit in Rio Grande', 'a pizza stand on the Crest end', 'a vending route in Cape May Court House', 'a bowling alley that needs new pins']);
      const good = rand(h) < 0.35 + k.attributes.business / 200 + (honesty(s, k) >= 50 ? 0.1 : -0.15);
      return { id, kind, byId: k.id, amount: r100(Math.min(t.acct.reserve * 0.6, 1500 + rand(h) * 4500)), from: 'reserve', honest: good, text: what };
    }
    case 'legal': {
      const m = any(hot);
      const by = m.capoId && s.characters[m.capoId]?.alive ? s.characters[m.capoId] : m;
      return { id, kind, byId: by.id, forId: m.id, amount: r100(1000 + rand(h) * 2000), from: 'treasury', honest: true, text: `a real lawyer for ${m.firstName} before the grand jury calls him` };
    }
  }
}

/** The house's money and its pieces (UI). */
export function accountsView(s: GameState) {
  const t = s.tribute;
  return {
    treasury: Math.round(s.money), personal: t?.acct.personal ?? 0, reserve: t?.acct.reserve ?? 0, envelope: t?.acct.envelope ?? 0, clearing: t?.acct.clearing ?? 0,
    crew: t?.acct.crew ?? {},
  };
}

export function latestReport(s: GameState): TributeReport | undefined {
  const t = s.tribute;
  return t?.reports[t.reports.length - 1];
}

export function pendingReport(s: GameState): TributeReport | undefined {
  return s.tribute?.reports.find((r) => r.status === 'presented');
}

export function isQuietWeek(rep: TributeReport): boolean {
  return !rep.issues.some((i) => i.severity >= 2) && !rep.petitions.length;
}

export { player };
