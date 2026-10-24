import { isInSeason, seasonMultiplier } from './calendar';
import { CATALOG } from './catalog';
import { expectedTake, isOpen, owned, ownsKind, staffFactor, washCapacity } from './business';
import { activeTask } from './council';
import { crewHustle, specialistFees } from './crewlife';
import { crew, displayName, hasTrait, isFree, player, shortName } from './characters';
import { scheduleConsequence } from './effects';
import { runLoans } from './loans';
import { outpostIncome } from './schemes';
import { heat, money, respect, type Ctx } from './ledger';
import { addOpinion, opinion } from './relations';
import { chance, gauss, randInt } from './rng';
import type { Character, GameState } from './types';

/**
 * The weekly economy. ONE ledger, applied once per week, in a fixed order:
 * street income → business income → capo kick-ups → costs → debts.
 * Tribute is paid through the monthly bagman event (also a ledger line).
 * Every line goes through ledger.post() with a human label.
 */

export const CAPO_CUT = 0.3; // capo keeps 30% of his district's take
export const NO_CAPO_EFFICIENCY = 0.55; // a district with no capo leaks money
export const WAGES = { underboss: 160, consigliere: 130, capo: 0, soldier: 55, associate: 25 } as const;
export const COP_PAYOFF = 110;
export const WINTER_COST = 320;
/** Share of washed money the counting room keeps. */
export const LAUNDER_FEE = 0.05;
/** Unwashed cash above this draws the IRS. */
export const UNWASHED_SAFE = 15000;

/** Weekly variance spread for a capo's kick-up, driven by traits. */
export function kickupSpread(c: Character): number {
  if (hasTrait(c, 'Gambler')) return 0.4;
  if (hasTrait(c, 'Hot-headed')) return 0.25;
  if (hasTrait(c, 'Drinker')) return 0.2;
  if (hasTrait(c, 'Patient') || hasTrait(c, 'Honest')) return 0.05;
  return 0.12;
}

/** Fraction of his kick-up a capo skims this week, driven by traits and opinion of the boss. */
export function skimRate(s: GameState, c: Character): number {
  if (hasTrait(c, 'Honest') || hasTrait(c, 'Loyal-to-a-fault')) return 0;
  const op = opinion(s, c.id, s.playerId);
  let r = 0;
  if (hasTrait(c, 'Greedy')) r += 0.1;
  if (hasTrait(c, 'Ambitious') && op < 10) r += 0.08;
  if (hasTrait(c, 'Gambler')) r += 0.04;
  if (op < -20) r += 0.06;
  if (op > 40) r *= 0.5;
  r *= 1 - 0.4 * Math.min(1.5, activeTask(s, 'bag_tax'));
  const fear = s.relations[`${c.id}>${s.playerId}`]?.fear ?? 0;
  r *= 1 - Math.min(0.8, fear / 100);
  return Math.min(0.3, r);
}

export function districtTake(s: GameState, districtId: string): number {
  const d = s.districts.find((x) => x.id === districtId)!;
  return d.streetBase * ((d.influence.player ?? 0) / 100) * seasonMultiplier(s.date);
}

export function runEconomy(ctx: Ctx): void {
  const s = ctx.s;
  const mult = seasonMultiplier(s.date);
  const boss = player(s);
  let gross = 0;

  // 1. Street income from districts without a working capo.
  for (const d of s.districts) {
    const infl = d.influence.player ?? 0;
    if (infl <= 0) continue;
    const capo = d.capoId ? s.characters[d.capoId] : undefined;
    if (capo && isFree(s, capo) && capo.faction === 'player') continue;
    const amt = Math.round(d.streetBase * (infl / 100) * mult * NO_CAPO_EFFICIENCY * (s.edicts?.blitz ? 1.2 : 1));
    if (amt > 0) gross += money(ctx, amt, `Street take: ${d.name} (no capo, ${infl}% of the action)`, 'street');
  }
  // Street hustle by free soldiers & associates.
  gross += crewHustle(ctx, mult);

  // 2. Business income (net of upkeep shown separately).
  const biz = runBusinesses(ctx);
  gross += biz.gross;
  const upkeep = biz.upkeep;
  let dirty = gross - biz.clean; // street + hustle + rackets (kick-ups added below)

  // 3. Capo kick-ups with trait-driven variance and skimming.
  for (const d of s.districts) {
    const capo = d.capoId ? s.characters[d.capoId] : undefined;
    if (!capo || !isFree(s, capo) || capo.faction !== 'player') continue;
    const infl = d.influence.player ?? 0;
    if (infl <= 0) continue;
    const skill = 0.85 + capo.attributes.business / 400; // 0.85 .. 1.10
    const variance = Math.max(0.3, 1 + gauss(s) * kickupSpread(capo));
    const take = d.streetBase * (infl / 100) * mult * skill * variance * (s.edicts?.blitz ? 1.2 : 1);
    const capoShare = take * (capo.keep ?? CAPO_CUT);
    const owed = take - capoShare;
    const skim = Math.round(owed * skimRate(s, capo));
    const kick = Math.round(owed - skim);
    capo.wealth += Math.round(capoShare) + skim;
    if (skim > 0) capo.skimmed = (capo.skimmed ?? 0) + skim;
    if (kick > 0) {
      const k = money(ctx, kick, `Kick-up: ${shortName(capo)} (${d.name})`, 'kickup');
      gross += k;
      dirty += k;
    }
  }
  // Outposts in other cities.
  const out = outpostIncome(ctx);
  gross += out;
  dirty += out;
  // Loan-shark vig is dirty money too.
  const vig = runLoans(ctx);
  gross += vig;
  dirty += vig;
  ctx.gross = gross;

  // 4. Costs.
  const ub = crew(s).filter((c) => (c.rank === 'underboss' || c.rank === 'consigliere') && isFree(s, c));
  const ubWages = ub.reduce((a, c) => a + WAGES[c.rank as 'underboss' | 'consigliere'], 0);
  if (ubWages) money(ctx, -ubWages, `Wages: ${ub.map((c) => c.rank).join(' & ')}`, 'cost');
  const men = crew(s).filter((c) => c.rank === 'soldier' || c.rank === 'associate');
  const menWages = men.reduce((a, c) => a + WAGES[c.rank as 'soldier' | 'associate'], 0);
  if (menWages) money(ctx, -menWages, `Wages: ${men.length} soldiers & associates`, 'cost');
  const jailed = crew(s).filter((c) => !isFree(s, c));
  if (jailed.length) money(ctx, -40 * jailed.length, `Lawyers & family support: ${jailed.length} man${jailed.length > 1 ? 'men' : ''} inside`.replace('man men', 'men'), 'cost');
  if (upkeep) money(ctx, -upkeep, `Upkeep: ${s.businesses.filter((b) => b.owner === 'player').length} businesses`, 'cost');
  money(ctx, -COP_PAYOFF, 'Envelopes for the beat cops', 'cost');
  if (!isInSeason(s.date)) {
    // The off-season bites: heating oil, idle payroll, the boardwalk boarded up.
    const winter = WINTER_COST + 25 * owned(s).filter((b) => CATALOG[b.kind].season[1] < 0.5).length;
    money(ctx, -winter, 'Off-season: heating oil, idle payroll, shutters on the boardwalk', 'cost');
  }
  // Keeping up appearances: the boss's household grows with the treasury.
  const lifestyle = Math.round((150 + Math.max(0, s.money - 60000) * 0.006) * (s.edicts?.lowprofile ? 0.5 : 1));
  money(ctx, -lifestyle, `Household & appearances (${boss.firstName}'s family)${s.edicts?.lowprofile ? ' — low profile' : ''}`, 'cost');
  specialistFees(ctx);

  // 5. Debts.
  for (const debt of s.debts) {
    if (debt.weeksLeft <= 0) continue;
    money(ctx, -debt.weeklyPayment, `Loan payment: ${debt.lender} (${debt.weeksLeft} left)`, 'debt');
    debt.weeksLeft--;
  }
  s.debts = s.debts.filter((d) => d.weeksLeft > 0);

  // 6. Laundering: fronts wash what they can; the rest piles up as unwashed cash.
  launder(ctx, Math.max(0, dirty));

  // Track income history.
  s.incomeHistory.push(gross);
  if (s.incomeHistory.length > 12) s.incomeHistory.shift();

  // 7. Being broke has consequences.
  if (s.money < 0) {
    s.weeksInRed++;
    respect(ctx, -1, 'Word is the boss can\'t make payroll', 'drift');
    if (s.weeksInRed % 4 === 0) {
      for (const m of crew(s)) addOpinion(s, m.id, boss.id, 'Hasn\'t been paid', -6, 2);
      ctx.log.push('The crew has not been paid in a month. Grumbling in the back rooms.');
    }
  } else s.weeksInRed = 0;
}

/** Operational heat from running businesses, and the weekly cooling. Called after all other heat is posted. */
export function operationalHeat(ctx: Ctx): void {
  const s = ctx.s;
  const mult = seasonMultiplier(s.date) > 1 ? 1.4 : 0.6;
  const open = owned(s).filter((b) => isOpen(s, b));
  const raw = open.reduce((a, b) => a + b.heat, 0);
  // Accumulate fractional heat so small sources still count over time.
  s.flags.heatFrac = (s.flags.heatFrac ?? 0) + raw * mult;
  const whole = Math.floor(s.flags.heatFrac);
  if (whole > 0) {
    s.flags.heatFrac -= whole;
    heat(ctx, 'local', whole, 'Running the rackets (clubs, books, numbers)', 'heat');
  }
  const fedRaw = open.reduce((a, b) => a + CATALOG[b.kind].fedHeat, 0);
  s.flags.fedFrac = (s.flags.fedFrac ?? 0) + fedRaw;
  const fedWhole = Math.floor(s.flags.fedFrac);
  if (fedWhole > 0) {
    s.flags.fedFrac -= fedWhole;
    const worst = open.filter((b) => CATALOG[b.kind].fedHeat > 0).sort((a, b) => CATALOG[b.kind].fedHeat - CATALOG[a.kind].fedHeat)[0];
    heat(ctx, 'federal', fedWhole, `Federal interest in your rackets${worst ? ` (${worst.name})` : ''}`, 'heat');
  }
  // Unwashed cash draws the IRS.
  if (s.unwashed > UNWASHED_SAFE) {
    const amt = s.unwashed > 80000 ? 3 : s.unwashed > 40000 ? 2 : 1;
    heat(ctx, 'federal', amt, `Unwashed cash: $${Math.round(s.unwashed).toLocaleString('en-US')} in shoeboxes (the IRS notices)`, 'heat');
  }
  // Cruel men in the crew attract attention.
  const cruel = crew(s).filter((c) => hasTrait(c, 'Cruel') && isFree(s, c)).length;
  if (cruel >= 2 && s.week % 3 === 0) heat(ctx, 'local', 1, `${cruel} cruel men in the crew make enemies`, 'heat');
  const hot = crew(s).filter((c) => hasTrait(c, 'Hot-headed') && isFree(s, c));
  if (hot.length && s.week % 5 === 0) heat(ctx, 'local', 1, `Bar fight: ${displayName(hot[0])}`, 'heat');
}

/**
 * Business income, scores and side-risks. Returns gross, the clean (front)
 * part of it, and total upkeep. Every line is labelled with the place's name.
 */
export function runBusinesses(ctx: Ctx): { gross: number; clean: number; upkeep: number } {
  const s = ctx.s;
  let gross = 0;
  let clean = 0;
  let upkeep = 0;
  const hasFence = ownsKind(s, 'fencing', true);
  for (const b of owned(s)) {
    upkeep += b.upkeep;
    if (!isOpen(s, b)) {
      ctx.log.push(`${b.name} is padlocked (raid) — no income.`);
      continue;
    }
    const def = CATALOG[b.kind];
    let amt = expectedTake(s, b);
    let label = `Business: ${b.name}`;
    // Crews that work by the score.
    if (b.kind === 'jewel') {
      const p = (isInSeason(s.date) ? 0.3 : 0.12) * staffFactor(s, b);
      if (chance(s, p)) {
        amt = randInt(s, 20, 60) * 100 * (hasFence ? 1 : 0.55);
        label = `Score: ${b.name} lifted a jewel case from a summer cottage${hasFence ? '' : ' (no fence — sold cheap)'}`;
        heat(ctx, 'local', 2, `Burglary reports: ${b.name}`, 'heat');
      } else amt = 0;
    } else if (b.kind === 'bankcrew') {
      if (chance(s, 0.07 * staffFactor(s, b))) {
        amt = randInt(s, 60, 150) * 100;
        label = `Score: ${b.name} hit an out-of-town bank`;
        heat(ctx, 'federal', 6, `FBI bank-robbery task force: ${b.name}`, 'heat');
        if (chance(s, 0.2)) {
          const men = (b.staffIds ?? []).map((id) => s.characters[id]).filter((c): c is Character => !!c && isFree(s, c));
          const m = men.length ? men[randInt(s, 0, men.length - 1)] : undefined;
          if (m) {
            m.imprisonedUntil = s.week + randInt(s, 40, 90);
            m.record = (m.record ?? 0) + 1;
            ctx.log.push(`${displayName(m)} was picked up after the bank job.`);
            s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${displayName(m)} was arrested after a bank job.`, kind: 'heat' });
          }
        }
      } else amt = 0;
    }
    if (amt > 0) {
      const got = money(ctx, Math.round(amt), label, 'business');
      gross += got;
      if (def.category === 'front') clean += got;
    }
    // Side-risks of particular rackets.
    if (b.kind === 'vice' && chance(s, 0.025)) scheduleConsequence(s, 'vice_scandal', 1, 3, `ran ${b.name}`, { biz: b.name });
    if (b.kind === 'stag' && chance(s, 0.02)) scheduleConsequence(s, 'postal_inspectors', 1, 4, `ran ${b.name}`, { biz: b.name });
    if (b.kind === 'blackmail' && chance(s, 0.07 * staffFactor(s, b))) {
      s.favors += 1;
      ctx.log.push(`${b.name} turned a councilman's hotel register into a favor you can call in.`);
    }
    if (b.kind === 'narcotics' && !s.flags.brunoKnows) {
      const weeks = s.week - (b.boughtWeek ?? s.week);
      if (chance(s, Math.min(0.2, 0.03 + weeks * 0.006))) {
        s.flags.brunoKnows = s.week;
        scheduleConsequence(s, 'narcotics_found_out', 1, 2, `ran a narcotics pipeline against Bruno's rule`, {});
      }
    }
  }
  return { gross, clean, upkeep };
}

/** Wash dirty money through the fronts. */
export function launder(ctx: Ctx, dirty: number): void {
  const s = ctx.s;
  const cap = washCapacity(s);
  const pile = s.unwashed + dirty;
  const washed = Math.min(pile, cap);
  s.unwashed = Math.max(0, pile - washed);
  const fee = Math.round(washed * LAUNDER_FEE);
  if (fee > 0) money(ctx, -fee, `Laundering: the fronts washed $${Math.round(washed).toLocaleString('en-US')} (5% to the counting room)`, 'cost');
  s.unwashed = Math.min(s.unwashed, Math.max(0, s.money));
}
