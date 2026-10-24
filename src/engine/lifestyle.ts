import { crew, livingDynasty, player } from './characters';
import { ageOn } from './calendar';
import { heat, type Ctx } from './ledger';
import { addOpinion } from './relations';
import { chance, pick } from './rng';
import type { Attributes, Character, GameState, LifestyleId } from './types';
export type { LifestyleId };

/**
 * Lifestyles and perks (CK-style). The boss picks a focus; experience
 * builds every week (faster with the matching skill); every 100 XP is a
 * perk point. Each lifestyle has three trees of four perks, bought in
 * order. Perks are numeric modifiers that the systems read through
 * perkMod(). Lifestyle and perks belong to the man, not the house: an heir
 * starts his own.
 */

export type PerkKey =
  | 'hitPower' | 'heistPower' | 'secrecy' | 'raid' | 'guard' | 'strikeDamage' | 'income' | 'street' | 'launder' | 'upkeep' | 'vig' | 'tribute'
  | 'accept' | 'vote' | 'bribe' | 'favor' | 'localHeat' | 'fedHeat' | 'familyOpinion' | 'crewOpinion' | 'defection' | 'heirGrowth' | 'intel' | 'envoy';

export interface Perk {
  id: string;
  name: string;
  text: string;
  mods: Partial<Record<PerkKey, number>>;
}

export interface Tree {
  name: string;
  perks: Perk[];
}

export interface LifestyleDef {
  id: LifestyleId;
  name: string;
  skill: keyof Attributes;
  text: string;
  trees: Tree[];
}

const P = (id: string, name: string, text: string, mods: Perk['mods']): Perk => ({ id, name, text, mods });

export const LIFESTYLES: Record<LifestyleId, LifestyleDef> = {
  muscle: {
    id: 'muscle', name: 'Muscle', skill: 'force', text: 'Rule by fear. Hits, raids and a wall of bodyguards.',
    trees: [
      { name: 'Enforcer', perks: [P('shake', 'Shakedown Artist', 'Street take +5%.', { street: 5 }), P('collector', 'Collector', 'Shylock vig +15%.', { vig: 15 }), P('hardcase', 'Hard Case', 'People are more likely to say yes (+5).', { accept: 5 }), P('scorched', 'Scorched Earth', 'War raids +15% to succeed.', { raid: 15 })] },
      { name: 'Gunman', perks: [P('marksman', 'Marksman', 'Hits +8 power.', { hitPower: 8 }), P('cleanup', 'Cleanup Man', 'Schemes +10 secrecy.', { secrecy: 10 }), P('pro', 'Professional', 'Hits and heists +8.', { hitPower: 8, heistPower: 8 }), P('rep', 'Reputation for Violence', '+5 acceptance; rival strikes cost 15% less.', { accept: 5, strikeDamage: 15 })] },
      { name: 'Bulwark', perks: [P('bodyguards', 'Bodyguards', 'Attempts on your life are harder (+15 resistance).', { guard: 15 }), P('fortified', 'Fortified', 'Rival strikes cost 20% less.', { strikeDamage: 20 }), P('loyalmen', 'Loyal Men', 'Ignored men drift slower; crew opinion +1 a month.', { defection: 1, crewOpinion: 1 }), P('untouchable', 'Untouchable', '+20 resistance to murder.', { guard: 20 })] },
    ],
  },
  money: {
    id: 'money', name: 'Money', skill: 'business', text: 'Rule by the dollar. Rackets, washing, the shylock book.',
    trees: [
      { name: 'Rackets', perks: [P('eye', 'Eye for a Racket', 'Business income +5%.', { income: 5 }), P('margins', 'Thin Margins', 'Upkeep −10%.', { upkeep: 10 }), P('summer', 'Summer Money', 'Business income +5%.', { income: 5 }), P('mogul', 'Mogul', 'Business income +10%.', { income: 10 })] },
      { name: 'Washing', perks: [P('books', 'Two Sets of Books', 'Wash capacity +15%.', { launder: 15 }), P('paper', 'Paper Trail', 'Federal heat cools faster.', { fedHeat: 1 }), P('frontmen', 'Front Men', 'Wash capacity +15%.', { launder: 15 }), P('bankers', 'Friendly Bankers', 'Wash capacity +20%; federal heat cools faster.', { launder: 20, fedHeat: 1 })] },
      { name: 'Loan Shark', perks: [P('points', 'Six Points', 'Vig +20%.', { vig: 20 }), P('terms', 'Easy Terms', '+3 acceptance.', { accept: 3 }), P('collateral', 'Collateral', 'Vig +20%.', { vig: 20 }), P('streetbank', 'Street Banker', 'Business income +5%, vig +10%.', { income: 5, vig: 10 })] },
    ],
  },
  politics: {
    id: 'politics', name: 'Politics', skill: 'diplomacy', text: 'Rule by friends. The Table, City Hall and the newspapers.',
    trees: [
      { name: 'The Table', perks: [P('envelope', 'A Fat Envelope', 'Tribute −5%.', { tribute: 5 }), P('friends', 'Friends at the Table', 'Table votes +8.', { vote: 8 }), P('elder', 'Respected Elder', 'Table votes +8, acceptance +3.', { vote: 8, accept: 3 }), P('statesman', 'Statesman', 'Table votes +10, tribute −5%.', { vote: 10, tribute: 5 })] },
      { name: 'City Hall', perks: [P('grease', 'Grease', 'Bribes cost 15% less.', { bribe: 15 }), P('favors', 'Favor Bank', 'Favors come 30% more often.', { favor: 30 }), P('machine', 'The Machine', 'Local heat cools faster.', { localHeat: 1 }), P('kingmaker', 'Kingmaker', 'Favors +50%, bribes −15%.', { favor: 50, bribe: 15 })] },
      { name: 'The Press', perks: [P('ink', 'Friendly Ink', 'Local heat cools faster.', { localHeat: 1 }), P('charity', 'Charity Dinners', 'Family opinion +1 a month, acceptance +3.', { familyOpinion: 1, accept: 3 }), P('spin', 'Spin', 'Federal heat cools faster.', { fedHeat: 1 }), P('legend', 'Local Legend', 'Acceptance +5.', { accept: 5 })] },
    ],
  },
  family: {
    id: 'family', name: 'Family', skill: 'leadership', text: 'Rule by blood. Sunday dinners, old ways, and heirs raised right.',
    trees: [
      { name: 'Patriarch', perks: [P('gravy', 'Sunday Gravy', 'Family opinion +2 a month.', { familyOpinion: 2 }), P('provider', 'Provider', 'Family opinion +2 a month.', { familyOpinion: 2 }), P('godfather', 'Godfather', 'Acceptance +5.', { accept: 5 }), P('dynast', 'Dynast', 'Your children grow in skill faster.', { heirGrowth: 50 })] },
      { name: 'Old Ways', perks: [P('oath', 'The Oath', 'Crew opinion +1 a month.', { crewOpinion: 1 }), P('loyal', 'Loyalty', 'Ignored men drift slower.', { defection: 1 }), P('honored', 'Honored', 'Crew opinion +2 a month.', { crewOpinion: 2 }), P('cosa', 'Our Thing', 'Table votes +5, crew opinion +1 a month.', { vote: 5, crewOpinion: 1 })] },
      { name: 'Bloodline', perks: [P('tutor', 'Tutors', 'Children grow in skill faster.', { heirGrowth: 30 }), P('mentor', 'Mentor', 'Children grow in skill faster.', { heirGrowth: 30 }), P('legacy', 'Legacy', 'Family opinion +1 a month; children grow faster.', { familyOpinion: 1, heirGrowth: 20 }), P('heirapparent', 'Heir Apparent', 'Crew opinion +1 a month, acceptance +3.', { crewOpinion: 1, accept: 3 })] },
    ],
  },
  shadows: {
    id: 'shadows', name: 'Shadows', skill: 'intrigue', text: 'Rule by knowing. Spies, schemes, and no fingerprints.',
    trees: [
      { name: 'Spymaster', perks: [P('ears', 'Ears Everywhere', 'Your consigliere digs 25% faster.', { intel: 25 }), P('stoolies', 'Stool Pigeons', 'Digging +25%.', { intel: 25 }), P('files', 'The Files', 'Digging +50%.', { intel: 50 }), P('allseeing', 'All-Seeing', 'Digging +50%; +10 resistance to murder.', { intel: 50, guard: 10 })] },
      { name: 'Schemer', perks: [P('quiet', 'Quiet Word', 'Schemes +10 secrecy.', { secrecy: 10 }), P('patience', 'Patience', 'Hits +5, secrecy +5.', { hitPower: 5, secrecy: 5 }), P('misdirection', 'Misdirection', 'Schemes +15 secrecy.', { secrecy: 15 }), P('architect', 'Architect', 'Hits and heists +10.', { hitPower: 10, heistPower: 10 })] },
      { name: 'Ghost', perks: [P('nofinger', 'No Fingerprints', 'Federal heat cools faster.', { fedHeat: 1 }), P('layers', 'Layers', 'Envoys +10, secrecy +5.', { envoy: 10, secrecy: 5 }), P('deniable', 'Deniable', 'Federal and local heat cool faster.', { fedHeat: 1, localHeat: 1 }), P('phantom', 'Phantom', '+15 resistance to murder; federal heat cools faster.', { guard: 15, fedHeat: 1 })] },
    ],
  },
};

export const LIFESTYLE_IDS = Object.keys(LIFESTYLES) as LifestyleId[];
export const XP_PER_POINT = 100;

export function allPerks(): (Perk & { lifestyle: LifestyleId; tree: number; index: number })[] {
  return LIFESTYLE_IDS.flatMap((l) => LIFESTYLES[l].trees.flatMap((t, ti) => t.perks.map((p, pi) => ({ ...p, lifestyle: l, tree: ti, index: pi }))));
}

export function findPerk(id: string) {
  return allPerks().find((p) => p.id === id);
}

/** Sum of a modifier across the boss's perks. */
export function perkMod(s: GameState, key: PerkKey): number {
  const b = s.characters[s.playerId];
  if (!b?.lifestyle) return 0;
  let v = 0;
  for (const id of b.lifestyle.perks) v += findPerkCached(id)?.mods[key] ?? 0;
  return v;
}

const CACHE = new Map<string, Perk>();
function findPerkCached(id: string): Perk | undefined {
  if (!CACHE.size) for (const p of allPerks()) CACHE.set(p.id, p);
  return CACHE.get(id);
}

/** Why a perk can't be taken (undefined = it can). */
export function perkBlocked(c: Character, id: string): string | undefined {
  const p = findPerk(id);
  if (!p) return 'Unknown perk';
  const ls = c.lifestyle;
  if (!ls) return 'Choose a lifestyle first';
  if (ls.perks.includes(id)) return 'Already yours';
  if (ls.focus !== p.lifestyle) return `Only while living the ${LIFESTYLES[p.lifestyle].name} life`;
  const prev = LIFESTYLES[p.lifestyle].trees[p.tree].perks[p.index - 1];
  if (prev && !ls.perks.includes(prev.id)) return `First: ${prev.name}`;
  if (ls.points < 1) return `Needs a perk point (${ls.xp}/${XP_PER_POINT} XP)`;
  return undefined;
}

/** Weekly experience. */
export function lifestyleWeek(ctx: Ctx): void {
  const s = ctx.s;
  const b = player(s);
  const ls = b.lifestyle;
  if (!ls) return;
  ls.xp += 6 + Math.round(b.attributes[LIFESTYLES[ls.focus].skill] / 12);
  while (ls.xp >= XP_PER_POINT) {
    ls.xp -= XP_PER_POINT;
    ls.points += 1;
    ctx.log.push(`${b.firstName} has learned something about the ${LIFESTYLES[ls.focus].name.toLowerCase()} life: a perk point to spend.`);
  }
  // Heat perks.
  const lh = perkMod(s, 'localHeat');
  if (lh && s.heat.local > 0 && s.week % 2 === 0) heat(ctx, 'local', -lh, 'Perks: friends downtown keep it quiet', 'heat');
  const fh = perkMod(s, 'fedHeat');
  if (fh && s.heat.federal > 0 && s.week % 3 === 0) heat(ctx, 'federal', -fh, 'Perks: nothing on paper for the feds', 'heat');
}

/** Monthly perk effects on people. */
export function lifestyleMonth(ctx: Ctx): void {
  const s = ctx.s;
  const b = player(s);
  const fo = perkMod(s, 'familyOpinion');
  if (fo) for (const m of livingDynasty(s)) if (m.id !== b.id) addOpinion(s, m.id, b.id, 'A good head of the family', fo, 1);
  const co = perkMod(s, 'crewOpinion');
  if (co) for (const m of crew(s)) addOpinion(s, m.id, b.id, 'Keeps the old ways', co, 1);
  const hg = perkMod(s, 'heirGrowth');
  if (hg) {
    for (const id of b.childrenIds) {
      const c = s.characters[id];
      if (!c?.alive || ageOn(c.birth, s.date) < 8) continue;
      if (chance(s, hg / 100)) {
        const k = pick(s, ['leadership', 'business', 'diplomacy', 'intrigue', 'force', 'discipline'] as (keyof Attributes)[]);
        c.attributes[k] = Math.min(100, c.attributes[k] + 1);
      }
    }
  }
}
