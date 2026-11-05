import type { Character } from './types';

/**
 * THE FIVE NEW SKILLS (owner's ask, 2026-11-05): Charm, Streetwise, Politics,
 * Showbiz and Gambling, beside the six attributes (types.ts Attributes),
 * never inside them: every character and every save depends on that type.
 *
 * Leaf module (types only): the names, the value a man has, and which deed
 * teaches which skill. bossSkills.ts (the boss's practice, points and perk
 * trees), crewXp.ts (a man's practice and points) and newSkills.ts (the
 * effects at the point of use) build on it.
 *
 * VALUE, 0-100 like the attributes: a base DERIVED from what he already is
 * (his attributes, traits, craft, outside role, office, vices), plus what he
 * has ADDED by practice and points (`Character.sk`, optional, a delta). An
 * old save and a fresh game store nothing: the value is read off the man.
 */

export type NewSkill = 'charm' | 'streetwise' | 'politics' | 'showbiz' | 'gambling';
export const NEW_SKILLS: NewSkill[] = ['charm', 'streetwise', 'politics', 'showbiz', 'gambling'];
export const NEW_SKILL_NAME: Record<NewSkill, string> = { charm: 'Charm', streetwise: 'Streetwise', politics: 'Politics', showbiz: 'Showbiz', gambling: 'Gambling' };
export const NEW_SKILL_HELP: Record<NewSkill, string> = {
  charm: 'Women, wives and the matchmakers: dates, a paid evening, a match, what the wife hears.',
  streetwise: 'The street: his own scores and the pinch, the cops\' moves, a rat in the room.',
  politics: 'City Hall, the pad, bribes, favors and the federal case.',
  showbiz: 'Clubs, venues and acts: the take at the door, signings and bookings.',
  gambling: 'Books, numbers, card games and the casino: the house\'s edge.',
};

export const isNewSkill = (k: string): k is NewSkill => (NEW_SKILLS as string[]).includes(k);

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
const tr = (c: Character, t: Character['traits'][number], v: number) => (c.traits.includes(t) ? v : 0);

/** The base a man has without practice: read off what he already is. Pure. */
export function derivedSkill(c: Character, k: NewSkill): number {
  const a = c.attributes;
  const craft = c.craft;
  const out = c.outside;
  switch (k) {
    case 'charm':
      return clamp(a.diplomacy * 0.8 + 10 + tr(c, 'Charming', 12) + tr(c, 'Womanizer', 6) - tr(c, 'Cruel', 10) - tr(c, 'Paranoid', 4) + (craft === 'talker' ? 4 : 0));
    case 'streetwise':
      return clamp(a.intrigue * 0.4 + a.force * 0.4 + 10
        + (craft === 'driver' || craft === 'burglar' || craft === 'collector' || craft === 'muscle' ? 8 : craft === 'bookmaker' || craft === 'earner' ? 4 : 0)
        + (out === 'bookie' || out === 'fence' || out === 'runner' ? 8 : 0)
        + (c.rank === 'civilian' && !out ? -15 : 0) + tr(c, 'Paranoid', 4));
    case 'politics':
      return clamp(a.diplomacy * 0.5 + a.business * 0.3 + 10 + (c.rank === 'consigliere' ? 8 : 0) + (out === 'politician' ? 15 : 0) + (c.office ? 10 : 0) - tr(c, 'Honest', 4));
    case 'showbiz':
      return clamp(a.diplomacy * 0.45 + a.business * 0.35 + 10 + tr(c, 'Charming', 6) + tr(c, 'Womanizer', 3) + tr(c, 'Drinker', 2) + (craft === 'talker' ? 6 : 0));
    case 'gambling':
      return clamp(a.business * 0.4 + a.intrigue * 0.4 + 10 + tr(c, 'Gambler', 12) + (craft === 'bookmaker' ? 15 : 0)
        + (out === 'bookie' ? 15 : out === 'runner' ? 8 : 0) + (c.vices?.includes('cards') || c.vices?.includes('horses') ? 5 : 0));
  }
}

/** What he has: the base plus what practice and points added. Pure. */
export function skillValue(c: Character | undefined, k: NewSkill): number {
  if (!c) return 0;
  return clamp(derivedSkill(c, k) + (c.sk?.[k] ?? 0));
}

/** The modest swing a skill gives at its point of use: −5..+5 around an average man (50). */
export function skillEdge(v: number): number {
  return Math.max(-5, Math.min(5, Math.round((v - 50) / 10)));
}

/** Which new skill a deed teaches, read off its words (undefined: none of them). */
export function newSkillOfDeed(text: string): NewSkill | undefined {
  const t = text.toLowerCase();
  if (/\bbook(ed|ing)? (an|the|a|her|him|them) (act|room|singer|band|comic)/.test(t)) return 'showbiz';
  if (/(casino|numbers|bookmak|bookie|the book\b|sports ?book|card ?game|cards\b|poker|dice|crap game|\bbet|wager|gambl|the horses|race ?track|policy bank|bingo)/.test(t)) return 'gambling';
  if (/(showbiz|nightclub|\bclub\b|supper ?club|burlesque|\bact\b|acts\b|singer|comic|band\b|booking|\bbook (an|the|a) (act|room)|stage|marquee|label|record|talent|venue|show\b|\bsign(ed)? (an|the|with)|agent)/.test(t)) return 'showbiz';
  if (/(dating|\bdate\b|ask(ed)? (her|out|\w+ out)|woman|women|girl|lady|ladies|wife|goomar|mistress|lover|romance|court(ing|ed)? her|flirt|flowers|an evening|night out|nightlife|dance|kiss|propos|matchmak)/.test(t)) return 'charm';
  if (/(payoff|pay ?off|on the pad|\bpad\b|bribe|envelope downtown|city hall|mayor|council|alderman|judge|lawyer|attorney|prosecutor|grand jury|indict|fed(eral)? case|\bfbi\b|the feds|trenton|politic|election|vote|license|permit|inspector|commissioner)/.test(t)) return 'politics';
  if (/(own score|a score\b|scores\b|the street|corner|hijack|truck|fence|heist|job\b|jobs\b|stake-?out|tail|intel|dig|informer|stool|rat\b|wire|tip\b|ears?\b|word on the|shakedown|collect)/.test(t)) return 'streetwise';
  return undefined;
}
