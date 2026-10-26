/**
 * The careful (budget-aware) random player for the simulator.
 *
 * Still random, but not suicidal. Each game draws a temperament: how many
 * weeks of running costs it keeps in reserve (4–10) and what share of its
 * operating surplus it lets itself spend (35–85%). Then it:
 *  - only spends discretionary money above the reserve, out of an allowance
 *    that grows in the weeks it makes money and shrinks in the weeks it loses
 *    money (so it saves the rest, and tightens its belt in the winter);
 *  - takes on a new weekly bill (a payroll, a manager, bodyguards, a
 *    retainer ...) only with a second reserve to spare;
 *  - answers popups at random among the answers it can afford (the cheapest
 *    when it can afford none);
 *  - now and then cuts a standing bill when it is below the reserve.
 *
 * The careless boss is the old random player (sim.ts with no budget): he
 * spends at fixed weekly rates whatever the treasury says.
 */
import { previewAction } from '../src/engine/actions';
import { hashSeed } from '../src/engine/rng';
import type { Choice, Effect, GameState, PlayerAction, ReportLine } from '../src/engine/types';
import { rand } from '../src/engine/rng';
import type { EnvelopeChoice } from '../src/engine/tributeOps';

export interface Budget {
  /** Running average of the week's outgoings (costs, tribute, debt), in dollars. */
  weekly: number;
  /** Weeks of running costs kept in reserve (temperament). */
  reserveWeeks: number;
  /** Share of each week's operating result it lets itself spend (temperament). */
  spendShare: number;
  /** Discretionary money it may spend now. */
  allowance: number;
  /** Discretionary money spent this week (orders and popup answers). */
  spent: number;
}

const unit = (seed: string, salt: string) => (hashSeed(`${seed}:${salt}`) % 10000) / 10000;

/**
 * Is game `gi` played by a careless boss (the old random player)? Exactly `share` of the games are,
 * spread evenly through the run (so a 40-game run has the same mix as a 100-game one).
 */
export const isCareless = (gi: number, share: number) => Math.floor((gi + 1) * share) > Math.floor(gi * share);

export function newBudget(seed: string, startMoney = 0): Budget {
  const spendShare = 0.35 + unit(seed, 'spend') * 0.5;
  const b: Budget = { weekly: 2000, reserveWeeks: 4 + Math.round(unit(seed, 'reserve') * 6), spendShare, allowance: 0, spent: 0 };
  // The war chest he starts with counts as money made: he lets himself spend his share of what is above the reserve.
  b.allowance = spendShare * Math.max(0, startMoney - reserve(b));
  return b;
}

/** After the week: the running cost average, and the allowance (his share of the week's operating result). */
export function trackBudget(b: Budget, lines: readonly ReportLine[]) {
  let out = 0;
  let net = 0;
  for (const l of lines) {
    if (l.stat !== 'money') continue;
    net += l.amount;
    if (l.amount < 0 && (l.category === 'cost' || l.category === 'tribute' || l.category === 'debt')) out -= l.amount;
  }
  b.weekly = b.weekly * 0.94 + out * 0.06;
  b.allowance = Math.max(0, b.allowance + b.spendShare * (net + b.spent));
  b.spent = 0;
}

export const reserve = (b: Budget) => b.reserveWeeks * Math.max(1500, b.weekly);
export const spare = (s: GameState, b: Budget) => s.money - reserve(b);
/** What it may spend on optional things right now. */
export const room = (s: GameState, b: Budget) => Math.min(spare(s, b), b.allowance);
/** Books an optional spend against the allowance. */
export function spend(b: Budget, cost: number) {
  if (cost <= 0) return;
  b.allowance -= cost;
  b.spent += cost;
}

const moneyOut = (effects: readonly Effect[] | undefined) =>
  (effects ?? []).reduce((a, e) => a + (e.type === 'money' && e.amount < 0 ? -e.amount : 0), 0);
const moneyIn = (effects: readonly Effect[] | undefined) =>
  (effects ?? []).reduce((a, e) => a + (e.type === 'money' && e.amount > 0 ? e.amount : 0), 0);

/** Orders that start a standing weekly bill. */
export function isCommitment(a: PlayerAction): boolean {
  switch (a.kind) {
    case 'hire':
      return true;
    case 'edict':
      return a.on;
    case 'legal':
      return a.op === 'retainer';
    case 'pol':
      return a.op.op === 'payroll' && a.op.on;
    case 'econ':
      return ['manager', 'assistant', 'hq', 'leaseLot', 'build'].includes(a.op.type);
    case 'power':
      return a.op.op === 'bodyguards' || a.op.op === 'mattresses' ? a.op.on : a.op.op === 'front' || a.op.op === 'groom';
    case 'interact':
      return a.id === 'recruit' || a.id === 'bringIn';
    default:
      return false;
  }
}

/** Orders that stop a standing bill (what a careful boss cuts when the money runs dry). */
export function isCutback(a: PlayerAction): boolean {
  if (a.kind === 'pol') return a.op.op === 'payroll' && !a.op.on;
  if (a.kind === 'power') return (a.op.op === 'bodyguards' || a.op.op === 'mattresses') && !a.op.on;
  if (a.kind === 'edict') return !a.on;
  return false;
}

/** Up-front money an order costs (its cost, or the money its effects take). */
export function orderCost(s: GameState, a: PlayerAction): number {
  const p = previewAction(s, a);
  return Math.max(p.cost, moneyOut(p.effects));
}

/** May the careful player give this optional order now? */
export function affordable(s: GameState, b: Budget, a: PlayerAction): boolean {
  const p = previewAction(s, a);
  if (p.disabledReason) return false;
  if (isCutback(a)) return true;
  const cost = Math.max(p.cost, moneyOut(p.effects));
  if (cost <= 0 && moneyIn(p.effects) > 0) return true; // selling, borrowing, collecting
  const secondReserve = spare(s, b) >= reserve(b);
  if (cost <= 0) return !isCommitment(a) || secondReserve;
  const r = room(s, b);
  if (r <= 0) return false; // below the reserve or out of allowance: no optional spending
  return cost <= r && (!isCommitment(a) || secondReserve);
}

/** Popup answers it can afford (the cheapest when it can afford none). */
export function affordableChoices(s: GameState, b: Budget, legal: Choice[]): Choice[] {
  const r = Math.max(0, room(s, b));
  const ok = legal.filter((c) => moneyOut(c.effects) <= r);
  return ok.length ? ok : legal.slice().sort((x, y) => moneyOut(x.effects) - moneyOut(y.effects)).slice(0, 1);
}

export const choiceCost = (c: Choice) => moneyOut(c.effects);

/**
 * The weekly take: how the random player splits the underboss's envelope.
 * Careful: a sensible split (more to the family when the treasury is under
 * his reserve; often his underboss's advice). Careless: greedy (half or more
 * for himself, a token reserve), set as his standing policy on day one.
 */
export function envelopeChoice(s: GameState, b: Budget | undefined, h: { rng: number }): EnvelopeChoice | undefined {
  // Two pots (money.ts): one number, the boss's cut; the Family takes the rest. A careless boss is greedy.
  const t = s.tribute;
  if (!b) {
    if (s.week <= 1 || !t) return { split: { personal: 5500, treasury: 4500, reserve: 0 }, standing: true };
    const pend = t.reports.find((r) => r.status === 'presented');
    if (!pend) return undefined;
    const p = 5000 + Math.floor(rand(h) * 2000);
    return { report: pend.id, split: { personal: p, reserve: 0, treasury: 10000 - p }, grant: pend.petitions.filter(() => rand(h) < 0.3).map((x) => x.id) };
  }
  if (s.week <= 1 || !t) return { split: { personal: 2500, treasury: 7500, reserve: 0 }, standing: true };
  const pend = t.reports.find((r) => r.status === 'presented');
  const low = spare(s, b) < 0;
  const split = low ? { personal: 1000, treasury: 9000, reserve: 0 } : { personal: 2500, treasury: 7500, reserve: 0 };
  if (!pend) return low !== t.policy.personal <= 1000 ? { split, standing: true } : undefined;
  if (rand(h) < 0.4) return { report: pend.id, split: pend.rec, grant: pend.petitions.filter((x) => x.amount <= room(s, b)).map((x) => x.id) };
  return { report: pend.id, split, standing: rand(h) < 0.3, grant: pend.petitions.filter((x) => x.amount <= room(s, b) && rand(h) < 0.5).map((x) => x.id) };
}
