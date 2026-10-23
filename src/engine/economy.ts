import { seasonMultiplier } from './calendar';
import { crew, displayName, hasTrait, isFree, player, shortName } from './characters';
import { heat, money, respect, type Ctx } from './ledger';
import { addOpinion, opinion } from './relations';
import { gauss } from './rng';
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
    const amt = Math.round(d.streetBase * (infl / 100) * mult * NO_CAPO_EFFICIENCY);
    if (amt > 0) gross += money(ctx, amt, `Street take: ${d.name} (no capo, ${infl}% of the action)`, 'street');
  }
  // Street hustle by free soldiers & associates.
  const hustlers = crew(s).filter((c) => (c.rank === 'soldier' || c.rank === 'associate') && isFree(s, c));
  if (hustlers.length) {
    const per = hustlers.reduce((a, c) => a + (c.rank === 'soldier' ? 32 : 18) * (0.7 + c.attributes.business / 200), 0);
    const amt = Math.round(per * mult);
    gross += money(ctx, amt, `Street hustle: ${hustlers.length} soldiers & associates`, 'street');
  }

  // 2. Business income (net of upkeep shown separately).
  let upkeep = 0;
  for (const b of s.businesses) {
    if (b.owner !== 'player') continue;
    upkeep += b.upkeep;
    if (b.closedUntil !== undefined && b.closedUntil > s.week) {
      ctx.log.push(`${b.name} is padlocked (raid) — no income.`);
      continue;
    }
    const d = s.districts.find((x) => x.id === b.districtId);
    const control = d ? 0.6 + 0.4 * ((d.influence.player ?? 0) / 100) : 1;
    const amt = Math.round(b.weeklyBase * mult * control);
    gross += money(ctx, amt, `Business: ${b.name}`, 'business');
  }

  // 3. Capo kick-ups with trait-driven variance and skimming.
  for (const d of s.districts) {
    const capo = d.capoId ? s.characters[d.capoId] : undefined;
    if (!capo || !isFree(s, capo) || capo.faction !== 'player') continue;
    const infl = d.influence.player ?? 0;
    if (infl <= 0) continue;
    const skill = 0.85 + capo.attributes.business / 400; // 0.85 .. 1.10
    const variance = Math.max(0.3, 1 + gauss(s) * kickupSpread(capo));
    const take = d.streetBase * (infl / 100) * mult * skill * variance;
    const capoShare = take * CAPO_CUT;
    const owed = take - capoShare;
    const skim = Math.round(owed * skimRate(s, capo));
    const kick = Math.round(owed - skim);
    capo.wealth += Math.round(capoShare) + skim;
    if (skim > 0) capo.skimmed = (capo.skimmed ?? 0) + skim;
    if (kick > 0) gross += money(ctx, kick, `Kick-up: ${shortName(capo)} (${d.name})`, 'kickup');
  }
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
  // Keeping up appearances: the boss's household grows with the treasury.
  const lifestyle = Math.round(150 + Math.max(0, s.money - 60000) * 0.006);
  money(ctx, -lifestyle, `Household & appearances (${boss.firstName}'s family)`, 'cost');

  // 5. Debts.
  for (const debt of s.debts) {
    if (debt.weeksLeft <= 0) continue;
    money(ctx, -debt.weeklyPayment, `Loan payment: ${debt.lender} (${debt.weeksLeft} left)`, 'debt');
    debt.weeksLeft--;
  }
  s.debts = s.debts.filter((d) => d.weeksLeft > 0);

  // Track income history.
  s.incomeHistory.push(gross);
  if (s.incomeHistory.length > 12) s.incomeHistory.shift();

  // 6. Being broke has consequences.
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
  const raw = s.businesses
    .filter((b) => b.owner === 'player' && !(b.closedUntil !== undefined && b.closedUntil > s.week))
    .reduce((a, b) => a + b.heat, 0);
  // Accumulate fractional heat so small sources still count over time.
  s.flags.heatFrac = (s.flags.heatFrac ?? 0) + raw * mult;
  const whole = Math.floor(s.flags.heatFrac);
  if (whole > 0) {
    s.flags.heatFrac -= whole;
    heat(ctx, 'local', whole, 'Running the rackets (clubs, books, numbers)', 'heat');
  }
  // Cruel men in the crew attract attention.
  const cruel = crew(s).filter((c) => hasTrait(c, 'Cruel') && isFree(s, c)).length;
  if (cruel >= 2 && s.week % 3 === 0) heat(ctx, 'local', 1, `${cruel} cruel men in the crew make enemies`, 'heat');
  const hot = crew(s).filter((c) => hasTrait(c, 'Hot-headed') && isFree(s, c));
  if (hot.length && s.week % 5 === 0) heat(ctx, 'local', 1, `Bar fight: ${displayName(hot[0])}`, 'heat');
}
