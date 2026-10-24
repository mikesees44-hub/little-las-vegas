import { crew, isFree, player } from './characters';
import { ensureEcon, type BugSource, type HQKind } from './econState';
import { addEvidence } from './hierarchy';
import type { Ctx } from './ledger';
import { chance, pick } from './rng';
import type { Character, GameState } from './types';

/**
 * Headquarters: where business gets done. A social club is good for the
 * crew's spirits and easy for the Feds to bug; the back of a restaurant you
 * own is quieter; a car is quieter still; walk-and-talks on the boardwalk are
 * nearly safe and make the crew think the boss is paranoid.
 *
 * The Feds plant a bug through a technician (a black-bag job, before 1968),
 * a warrant (Title III, from 1968), or an informant who tells them where to
 * put it. While it is there, everyone who talks business at the HQ adds to
 * his own evidence file every week. Counters: sweep for bugs, move the HQ,
 * talk outside.
 */

export interface HQInfo {
  name: string;
  blurb: string;
  /** Up-front cost of setting it up. */
  cost: number;
  /** Weekly upkeep. */
  upkeep: number;
  /** How easy to bug (relative). */
  bug: number;
  /** Evidence a week while bugged: the boss, and each capo/underboss who talks there. */
  boss: number;
  capo: number;
  /** Crew opinion while it is the HQ (a social club is what they expect). */
  morale: number;
}

export const HQ_INFO: Record<HQKind, HQInfo> = {
  social: { name: 'A social club', blurb: 'A storefront with the windows painted over, espresso and pinochle. Every crew expects one. So do the Feds.', cost: 1500, upkeep: 0, bug: 1, boss: 0.6, capo: 0.3, morale: 0 },
  restaurant: { name: 'The back of a restaurant', blurb: 'A table by the kitchen of a place you own. Noisy, public, and harder to wire.', cost: 0, upkeep: 0, bug: 0.6, boss: 0.4, capo: 0.2, morale: 0 },
  car: { name: 'In a car', blurb: 'A Lincoln parked on the beach block with the radio up. Only the boss and one man at a time; the capos feel shut out.', cost: 800, upkeep: 10, bug: 0.3, boss: 0.3, capo: 0, morale: -1 },
  walk: { name: 'Walk-and-talks', blurb: 'Business on the boardwalk at dawn, never indoors. Nearly safe. The crew thinks you have gone paranoid.', cost: 0, upkeep: 0, bug: 0.08, boss: 0.15, capo: 0, morale: -3 },
};

export const SWEEP_COST = 400;
/** The Feds pull a bug quietly after this many weeks (the evidence stays). */
export const BUG_WEEKS = 30;
export const SWEEP_FIND = 0.75;

const BUG_SOURCE_TEXT: Record<BugSource, string> = {
  technician: 'an FBI technician on a black-bag job',
  warrant: 'a court-ordered wiretap warrant',
  informant: 'an informant who told them where to put it',
};

const RUMORS = [
  'A telephone company van sat on the block for three days.',
  'The landlord says the city inspected the wiring. Nobody called an inspector.',
  'A new man at the counter of the luncheonette across the street watches the door.',
  'The line clicks when you pick up the phone.',
];

export function hqOpenKinds(s: GameState): HQKind[] {
  return (['social', 'restaurant', 'car', 'walk'] as HQKind[]).filter((k) => k !== 'restaurant' || hqRestaurants(s).length > 0);
}

/** Places you own with a back room. */
export function hqRestaurants(s: GameState) {
  return s.businesses.filter((b) => b.owner === 'player' && (b.kind === 'restaurant' || b.kind === 'deli' || b.kind === 'supperclub' || b.kind === 'pizza' || b.kind === 'bar'));
}

/** Who talks business at the HQ (and so lands on the tape). */
export function talkers(s: GameState): Character[] {
  const e = s.econ;
  const kind = e?.hq.kind ?? 'social';
  const boss = player(s);
  if (HQ_INFO[kind].capo <= 0) return [boss];
  return [boss, ...crew(s).filter((c) => isFree(s, c) && (c.rank === 'capo' || c.rank === 'underboss' || c.rank === 'consigliere'))];
}

/** Weekly odds the Feds get a bug in. */
export function bugOdds(s: GameState): number {
  const e = s.econ;
  const kind = e?.hq.kind ?? 'social';
  const rat = hasInformant(s);
  return HQ_INFO[kind].bug * (0.001 + (s.heat.federal / 100) * 0.008) * (rat ? 2 : 1);
}

export function hasInformant(s: GameState): boolean {
  return crew(s).some((c) => c.informantFor === 'law' && isFree(s, c)) || !!s.flags.informant;
}

/** The weekly HQ tick: upkeep, a bug being planted, evidence on the tape. */
export function hqWeek(ctx: Ctx, pay: (amount: number, label: string) => void): void {
  const s = ctx.s;
  const e = ensureEcon(s);
  const hq = e.hq;
  const info = HQ_INFO[hq.kind];
  if (info.upkeep) pay(-info.upkeep, `HQ: ${info.name.toLowerCase()} (rent, coffee, a man on the door)`);
  if (hq.kind === 'restaurant' && !s.businesses.some((b) => b.id === hq.bizId && b.owner === 'player')) {
    hq.kind = 'social';
    hq.bizId = undefined;
    hq.bug = undefined;
    ctx.log.push('The restaurant is gone; business moves back to a social club.');
  }
  if (!hq.bug) {
    if (chance(e, bugOdds(s))) {
      const source: BugSource = hasInformant(s) ? 'informant' : s.date.y >= 1968 ? 'warrant' : 'technician';
      hq.bug = { week: s.week, source, leaked: 0 };
      e.stats.bugs++;
      if (chance(e, 0.45)) hq.rumor = pick(e, RUMORS);
    }
    return;
  }
  if (s.week - hq.bug.week >= BUG_WEEKS) {
    hq.bug = undefined;
    return;
  }
  // The tape is rolling.
  let total = 0;
  for (const c of talkers(s)) {
    const amt = c.id === s.playerId ? info.boss : info.capo;
    // Fractional evidence accrues through a per-person carry so small amounts still count.
    const key = `hqcarry:${c.id}`;
    const carry = Math.round(((e.cooldowns[key] ?? 0) + amt) * 1e6) / 1e6;
    const whole = Math.floor(carry);
    e.cooldowns[key] = carry - whole;
    if (whole > 0) total += addEvidence(s, c, whole);
  }
  hq.bug.leaked += total;
  hq.leaked += total;
}

export function bugText(source: BugSource): string {
  return BUG_SOURCE_TEXT[source];
}

/** Monthly morale from the HQ. Returns the opinion change applied to each crew man. */
export function hqMorale(s: GameState): number {
  return HQ_INFO[s.econ?.hq.kind ?? 'social'].morale;
}
