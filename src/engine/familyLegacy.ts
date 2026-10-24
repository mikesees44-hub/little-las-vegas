import { ensureDynState, type LegacyTrack } from './familyState';
import type { GameState } from './types';

/**
 * Dynasty renown and Dynasty Legacies (CK3). Renown accrues from deeds —
 * holding districts, big scores, making men, winning at the Table, strong
 * marriages, heirs who survive to manhood, hosting the island — and buys
 * perks on four legacy tracks, unlocked in order. Legacies belong to the
 * house, not the man: they persist through every succession.
 */

export interface Perk {
  name: string;
  text: string;
}

export const LEGACY_COST = [200, 400, 650, 1000];

export const LEGACIES: Record<LegacyTrack, { name: string; motto: string; perks: Perk[] }> = {
  blood: {
    name: 'Blood',
    motto: 'Heirs are tougher',
    perks: [
      { name: 'Good Stock', text: 'Good blood traits (Sharp, Strong, Handsome) pass down twice as often; bad ones half as often.' },
      { name: 'Iron Constitution', text: 'Members of the house recover 1 health a month.' },
      { name: 'Hard Upbringing', text: 'Every child\'s education comes out one grade better.' },
      { name: 'The Old Blood', text: 'A new head of the house gets +10 leadership, and the crew trusts the blood (+10 opinion on succession).' },
    ],
  },
  name: {
    name: 'Name',
    motto: 'Respect and fear',
    perks: [
      { name: 'A Name on the Boardwalk', text: '+1 respect a month while respect is under 70.' },
      { name: 'Smooth Handover', text: 'Successions cost half the respect.' },
      { name: 'Feared Name', text: 'Grudges against the head of the house cool 3 points faster a month; the crew fears a new head (+15 fear).' },
      { name: 'Legend of the Shore', text: '+5 respect at once; activities earn half again as much renown.' },
    ],
  },
  money: {
    name: 'Money',
    motto: 'Laundering and legit fortunes',
    perks: [
      { name: 'Clean Books', text: 'The family accountant washes $2,000 of dirty cash a month.' },
      { name: 'Good Marriages', text: 'Dowries you receive are 50% larger; dowries you pay are halved.' },
      { name: 'Family Trust', text: '+$150 a week from legitimate holdings in trust.' },
      { name: 'Old Money', text: 'The family looks respectable: −2 federal heat a month.' },
    ],
  },
  church: {
    name: 'Church & City Hall',
    motto: 'Political pull',
    perks: [
      { name: 'Parish Friends', text: '−1 local heat a month; the monsignor speaks well of the family.' },
      { name: 'Ward Heelers', text: '+1 political favor every three months.' },
      { name: 'Friends in Trenton', text: 'Decisions that call in favors need one favor fewer.' },
      { name: 'The Machine', text: 'Every member of the Table leans your way (+10 in every vote).' },
    ],
  },
};

export const LEGACY_TRACKS = Object.keys(LEGACIES) as LegacyTrack[];

/** Is perk n (1-based) of a track unlocked? */
export function hasPerk(s: GameState, track: LegacyTrack, n: number): boolean {
  return (s.dyn?.legacy[track] ?? 0) >= n;
}

export function nextPerkCost(s: GameState, track: LegacyTrack): number | undefined {
  const have = s.dyn?.legacy[track] ?? 0;
  return have >= 4 ? undefined : LEGACY_COST[have];
}

export function unlockedPerks(s: GameState): { track: LegacyTrack; perk: Perk; n: number }[] {
  const out: { track: LegacyTrack; perk: Perk; n: number }[] = [];
  for (const t of LEGACY_TRACKS) for (let i = 0; i < (s.dyn?.legacy[t] ?? 0); i++) out.push({ track: t, perk: LEGACIES[t].perks[i], n: i + 1 });
  return out;
}

/** Add renown (engine-side). Activities get a bonus with Legend of the Shore. */
export function gainRenown(s: GameState, amount: number, reason: string): number {
  const d = ensureDynState(s);
  const amt = Math.round(amount);
  if (!amt) return 0;
  d.renown = Math.max(0, d.renown + amt);
  if (amt > 0) d.renownTotal += amt;
  d.renownLog.push({ week: s.week, amount: amt, reason });
  if (d.renownLog.length > 40) d.renownLog = d.renownLog.slice(-40);
  return amt;
}

/** Renown standing of the house: a named tier from lifetime renown. */
export function renownTier(total: number): string {
  if (total >= 3000) return 'A Shore Dynasty';
  if (total >= 1500) return 'An Old Family';
  if (total >= 700) return 'A Name People Know';
  if (total >= 250) return 'A Rising House';
  return 'New Money';
}
