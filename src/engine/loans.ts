import { CATALOG } from './catalog';
import { ownsKind } from './business';
import { money, type Ctx } from './ledger';
import { MALE_FIRST, SURNAMES } from './names';
import { chance, pick, randInt } from './rng';
import type { BusinessKind, GameState, Loan } from './types';

/**
 * The shylock book. Money put on the street pays "points" (vig) every week
 * until the principal comes back. Borrowers miss payments; two missed weeks
 * and the book raises a default the player has to answer (see events).
 */

export const VIG_RATE = 0.05; // five points a week
export const LOANS_PER_BOOK = 4;
export const LEND_AMOUNTS = [1000, 2500, 5000] as const;

const COLLATERAL: BusinessKind[] = ['bar', 'pizza', 'carlot', 'stand', 'restaurant', 'laundromat'];
const JOBS = ['a clam-boat captain', 'a boardwalk stand owner', 'a horseplayer from Rio Grande', 'a bar owner on New Jersey Ave', 'a contractor in Cape May', 'a motel man in the Crest', 'a trucker with a gambling problem', 'a car dealer on the Causeway'];

export function bookCapacity(s: GameState): number {
  return ownsKind(s, 'loansharking', true) ? LOANS_PER_BOOK * s.businesses.filter((b) => b.owner === 'player' && b.kind === 'loansharking').length : 0;
}

/** Creates a borrower and books the loan. Money leaves the treasury via the action's effects. */
export function bookLoan(s: GameState, amount: number): Loan {
  const first = pick(s, MALE_FIRST.Italian.concat(MALE_FIRST.Irish));
  const last = pick(s, SURNAMES.Italian.concat(SURNAMES.Irish, SURNAMES.Jewish));
  const job = pick(s, JOBS);
  const withCollateral = chance(s, 0.4);
  const coll = withCollateral ? pick(s, COLLATERAL) : undefined;
  const loan: Loan = {
    id: `l${s.nextId++}`,
    borrower: `${first} ${last}, ${job}`,
    collateral: coll,
    collateralName: coll ? `${last}'s ${CATALOG[coll].name.toLowerCase()}` : undefined,
    principal: amount,
    vig: Math.round(amount * VIG_RATE),
    risk: Math.round((0.01 + (job.includes('horseplayer') || job.includes('gambling') ? 0.03 : 0) + randInt(s, 0, 2) / 100) * 1000) / 1000,
    weeksLate: 0,
    dueWeek: s.week + randInt(s, 10, 20),
    week: s.week,
  };
  s.loans.push(loan);
  return loan;
}

/** Weekly vig and repayments. Returns the vig collected (dirty money). */
export function runLoans(ctx: Ctx): number {
  const s = ctx.s;
  let vig = 0;
  for (const l of s.loans) {
    if (l.weeksLate > 0 && l.weeksLate < 2 && chance(s, 0.4)) {
      // Caught up: pays the missed week too.
      l.weeksLate = 0;
      vig += money(ctx, l.vig * 2, `Vig: ${l.borrower.split(',')[0]} caught up on a missed week`, 'business');
      continue;
    }
    if (l.weeksLate > 0 || chance(s, l.risk)) {
      l.weeksLate++;
      if (l.weeksLate === 1) ctx.log.push(`${l.borrower.split(',')[0]} missed his payment to the book.`);
      continue;
    }
    if (s.week >= l.dueWeek) {
      money(ctx, l.principal, `Loan repaid: ${l.borrower.split(',')[0]} paid back the principal`, 'business');
      l.principal = 0;
      continue;
    }
    vig += money(ctx, l.vig, `Vig: ${l.borrower.split(',')[0]} (5 points on ${fmt(l.principal)})`, 'business');
  }
  s.loans = s.loans.filter((l) => l.principal > 0);
  // Written off after ten weeks with nobody chasing it.
  const dead = s.loans.filter((l) => l.weeksLate >= 10);
  for (const l of dead) ctx.log.push(`The book wrote off ${fmt(l.principal)} owed by ${l.borrower.split(',')[0]}.`);
  s.loans = s.loans.filter((l) => l.weeksLate < 10);
  return vig;
}

export function defaulter(s: GameState): Loan | undefined {
  return s.loans.filter((l) => l.weeksLate >= 2).sort((a, b) => b.principal - a.principal)[0];
}

function fmt(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}
