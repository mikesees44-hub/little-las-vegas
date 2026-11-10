import { crew, displayName, isFree } from './characters';
import { booksRaid } from './ledgerbook';
import { applyEffect } from './effects';
import { heat, money, respect, type Ctx } from './ledger';
import { addOpinion } from './relations';
import { noteHard } from './escalation';
import { chance, pick, randInt } from './rng';
import { HEAT_BARS, type HeatBar } from './types';
/** The raid planner (threats.ts planHeatRaid), wired in by engine.ts so this module stays a leaf. */
let planHeatRaid: (s: import('./types').GameState) => unknown = () => undefined;
export function setHeatRaidPlanner(f: (s: import('./types').GameState) => unknown): void { planHeatRaid = f; }

/**
 * Heat: three bars (local cops/press, the Philadelphia family, the feds),
 * each clamped 0–100 by the ledger. From 50 each bar can trigger a named
 * consequence, the odds ramping to full at 80 (DAILY_LOGIC #3): a local raid
 * set for a night next week, a federal arrest. Philadelphia's summons is a
 * decision (pressure.ts); past 80 Philadelphia simply takes its pound of flesh.
 */

/** Where the bars start to bite (DAILY_LOGIC #3): the odds ramp from here up to full at HEAT_FULL. */
export const HEAT_THRESHOLD = 50;
export const HEAT_FULL = 80;
/** 0-1: how hard a bar bites at this level. */
export function heatRamp(v: number): number {
  return Math.max(0, Math.min(1, (v - HEAT_THRESHOLD) / (HEAT_FULL - HEAT_THRESHOLD)));
}
/** Flat decay per week when no heat was gained on that bar this week. */
export const QUIET_DECAY: Record<HeatBar, number> = { local: 3, family: 2, federal: 1 };
/** Flat decay per week when the bar did gain heat this week. */
export const BUSY_DECAY: Record<HeatBar, number> = { local: 1, family: 1, federal: 0 };
/** Additional decay proportional to the current level (pressure fades faster when it is high). */
export const QUIET_RATE: Record<HeatBar, number> = { local: 0.06, family: 0.05, federal: 0.04 };
export const BUSY_RATE: Record<HeatBar, number> = { local: 0.05, family: 0.04, federal: 0.035 };

export function decayAmount(bar: HeatBar, level: number, quiet: boolean): number {
  const flat = quiet ? QUIET_DECAY[bar] : BUSY_DECAY[bar];
  const rate = quiet ? QUIET_RATE[bar] : BUSY_RATE[bar];
  return Math.min(level, Math.round(flat + level * rate));
}

export const HEAT_LABELS: Record<HeatBar, string> = { local: 'Local', family: 'Family', federal: 'Federal' };

export function heatConsequences(ctx: Ctx): void {
  const s = ctx.s;
  // LOCAL: the county detectives put a warrant together: a raid on a night next week (a ticking clock: threats.ts planHeatRaid).
  if (s.heat.local >= HEAT_THRESHOLD && chance(s, 0.45 * heatRamp(s.heat.local)) && planHeatRaid(s)) {
    ctx.log.push('(Unknown to you, the county detectives are putting a warrant together.)');
  } else if (s.heat.local >= HEAT_FULL && chance(s, 0.2)) {
    const open = s.businesses.filter((b) => b.owner === 'player' && !(b.closedUntil !== undefined && b.closedUntil > s.week));
    const target = open.length ? pick(s, open) : undefined;
    if (target) {
      const weeks = randInt(s, 3, 6);
      applyEffect(ctx, { type: 'closeBusiness', businessId: target.id, weeks }, { label: '', because: '' });
      const seized = Math.min(Math.max(0, s.money), Math.round(target.weeklyBase * 3));
      if (seized > 0) money(ctx, -seized, `RAID: cash seized at ${target.name}`, 'heat');
      ctx.log.push(`RAID: Police padlock ${target.name} for ${weeks} weeks.`);
      s.chronicle.push({ week: s.week, date: { ...s.date }, text: `Police raided ${target.name} and padlocked it for ${weeks} weeks.`, kind: 'heat' });
    } else {
      const seized = Math.min(Math.max(0, s.money), 1500);
      if (seized > 0) money(ctx, -seized, 'RAID: cash seized from a back room', 'heat');
      ctx.log.push('RAID: Police turn over a back room on Pacific Avenue.');
    }
    noteHard(s);
    respect(ctx, -2, 'RAID: the papers print the photos', 'heat');
    booksRaid(ctx, 'police');
    heat(ctx, 'local', -20, 'RAID: pressure released after the raid', 'heat');
  }
  // FEDERAL: an arrest.
  if (s.heat.federal >= HEAT_THRESHOLD && chance(s, 0.35 * heatRamp(s.heat.federal))) {
    const pool = crew(s).filter((c) => isFree(s, c) && c.rank !== 'boss');
    if (pool.length) {
      const victim = pick(s, pool);
      const weeks = randInt(s, 26, 78);
      applyEffect(ctx, { type: 'imprison', charId: victim.id, weeks }, { label: '', because: '' });
      ctx.log.push(`ARREST: The FBI picks up ${displayName(victim)}.`);
      s.chronicle.push({ week: s.week, date: { ...s.date }, text: `ARREST: Federal agents arrested ${displayName(victim)} (${weeks} weeks).`, kind: 'heat' });
      addOpinion(s, victim.id, s.playerId, 'Took the fall for the boss', -10, 1);
    }
    const seized = Math.min(Math.max(0, s.money), 3000);
    if (seized > 0) money(ctx, -seized, 'ARREST: lawyers and bail', 'heat');
    noteHard(s);
    respect(ctx, -3, 'ARREST: a made man in cuffs on the front page', 'heat');
    booksRaid(ctx, 'fbi');
    heat(ctx, 'federal', -25, 'ARREST: feds take their headline', 'heat');
  }
  // FAMILY: Philadelphia loses patience (past the summons: pressure.ts summonsSource, a decision with odds).
  if (s.heat.family >= HEAT_FULL && chance(s, 0.4)) {
    const fine = Math.min(Math.max(0, s.money), Math.max(2000, Math.round(s.money * 0.12)));
    if (fine > 0) money(ctx, -fine, 'SEIZED: Philadelphia takes a cut of your treasury', 'heat');
    respect(ctx, -4, 'Summoned to Philadelphia like an errand boy', 'heat');
    heat(ctx, 'family', -25, 'Philadelphia is satisfied, for now', 'heat');
    ctx.log.push('Philadelphia summoned you across the bridge and took its pound of flesh.');
    s.chronicle.push({ week: s.week, date: { ...s.date }, text: 'Summoned to Philadelphia and fined.', kind: 'heat' });
  }
}

export function heatDecay(ctx: Ctx): void {
  const s = ctx.s;
  for (const bar of HEAT_BARS) {
    if (s.heat[bar] <= 0) continue;
    const quiet = ctx.heatGained[bar] === 0;
    const amt = decayAmount(bar, s.heat[bar], quiet);
    if (amt > 0) heat(ctx, bar, -amt, quiet ? `${HEAT_LABELS[bar]} heat cools (a quiet week)` : `${HEAT_LABELS[bar]} heat cools slightly`, 'heat');
  }
}

export function heatBand(v: number): 'cold' | 'warm' | 'hot' | 'boiling' {
  return v >= 80 ? 'boiling' : v >= 55 ? 'hot' : v >= 30 ? 'warm' : 'cold';
}
