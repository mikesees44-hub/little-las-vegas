import { xpMult } from './aging';
import { crew, livingDynasty, player } from './characters';
import { ageOn } from './calendar';
import { heat, type Ctx } from './ledger';
import { addOpinion } from './relations';
import { chance, pick } from './rng';
import { spendPerk } from './spendState';
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
  // What he owns and keeps on retainer counts too (spendState.ts): bodyguards guard, a captain on the pad cools the heat.
  let v = s.spend ? spendPerk(s, key) : 0;
  if (!b?.lifestyle) return v;
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
  ls.xp += Math.round((6 + Math.round(b.attributes[LIFESTYLES[ls.focus].skill] / 12)) * xpMult(s, b));
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

/* ------------------------------------------------------------------ */
/* Every man's focus: the crew lifestyles (crewXp.ts grows them)        */
/* ------------------------------------------------------------------ */

/**
 * CK-style passive growth for every man in the family (not the boss, who has
 * the lifestyles above): a FOCUS (Muscle, Money, Brains, Diplomacy,
 * Leadership) picked from his nature or set by the boss; lifestyle XP every
 * month (crewXp.ts growthMonth); his focus skill ticks up on its own; and a
 * perk tree per focus (3 branches × 4 perks) that unlocks by itself every
 * CREW_PERK_LXP. The twelve old specialties (crewXp PERKS) are nodes in these
 * trees, so every hasPerk() still works. Perks act only where the man acts
 * (manMod: his jobs, his hustle, his corners, his crew, his seat).
 */
export type Focus = 'muscle' | 'money' | 'brains' | 'diplomacy' | 'leadership';
export const FOCUS_IDS: Focus[] = ['muscle', 'money', 'brains', 'diplomacy', 'leadership'];

/** What a crew perk moves (each key is read by one engine hook; tests/crewPerks.test.ts proves it). */
export type ManKey =
  | 'jobs' | 'muscleJobs' | 'fixJobs' | 'scoreJobs' | 'take' | 'hustle' | 'corners' | 'evidence' | 'rat' | 'flip'
  | 'loyalBoss' | 'crewLoyal' | 'popular' | 'poach' | 'crewLxp' | 'ltSkill' | 'scheme' | 'guard'
  /** Read by the deeds and dating once the interactions branch lands (stated, not yet wired). */
  | 'accept' | 'datingOdds' | 'pleadVote';
/** Keys whose hook waits for the interactions branch. */
export const MAN_KEYS_WAITING: ManKey[] = ['accept', 'datingOdds', 'pleadVote'];

export interface CrewPerk {
  id: string;
  name: string;
  text: string;
  mods: Partial<Record<ManKey, number>>;
  /** One of the twelve old specialties (crewXp PERKS): earning it here gives him that specialty. */
  xp?: 'bookmaker' | 'enforcer' | 'fixer' | 'wheelman' | 'safecracker' | 'talker' | 'ghost' | 'ironjaw' | 'rainmaker' | 'standup' | 'taskmaster' | 'mentor';
}
export interface CrewBranch { name: string; perks: CrewPerk[] }
export interface FocusDef {
  id: Focus;
  name: string;
  icon: string;
  /** The skill it feeds (and the second one, a third as fast). */
  skill: keyof Attributes;
  second: keyof Attributes;
  /** The boss's lifestyle it matches (for the heir who takes the chair). */
  lifestyle: LifestyleId;
  branches: [CrewBranch, CrewBranch, CrewBranch];
}

const C = (id: string, name: string, text: string, mods: CrewPerk['mods'], xp?: CrewPerk['xp']): CrewPerk => ({ id, name, text, mods, ...(xp ? { xp } : {}) });

export const FOCI: Record<Focus, FocusDef> = {
  muscle: {
    id: 'muscle', name: 'Muscle', icon: '✊', skill: 'force', second: 'discipline', lifestyle: 'muscle',
    branches: [
      { name: 'Collector', perks: [C('m_enforcer', 'Enforcer', '+8 on muscle jobs.', {}, 'enforcer'), C('m_heavy', 'Heavy Hand', 'His own hustle +5%.', { hustle: 5 }), C('m_debt', 'Debt Man', 'The take of his jobs +5%.', { take: 5 }), C('m_fear', 'Fear', '+5 when he asks something of a man (with the deeds).', { accept: 5 })] },
      { name: 'Shooter', perks: [C('m_wheel', 'Wheelman', '+8 on scores and loads.', {}, 'wheelman'), C('m_steady', 'Steady Hand', '+8 power on a hit he is on.', { scheme: 8 }), C('m_getaway', 'Clean Getaway', 'Evidence on him when a job goes wrong −10%.', { evidence: 10 }), C('m_pro', 'Professional', '+5 on every dirty job.', { jobs: 5 })] },
      { name: 'Wall', perks: [C('m_jaw', 'Iron jaw', 'Never talks when picked up.', {}, 'ironjaw'), C('m_bodyguard', 'Bodyguard', '+10% on any detail he guards.', { guard: 10 }), C('m_hard', 'Hard to Kill', 'Rivals want him 10 less (he is not worth the trouble).', { poach: 10 }), C('m_mattress', 'Mattress Veteran', '+8 on muscle jobs.', { muscleJobs: 8 })] },
    ],
  },
  money: {
    id: 'money', name: 'Money', icon: '$', skill: 'business', second: 'diplomacy', lifestyle: 'money',
    branches: [
      { name: 'Rackets', perks: [C('$_book', 'Bookmaker', 'His own hustle +15%.', {}, 'bookmaker'), C('$_margin', 'Eye for Margin', 'His own hustle +5%.', { hustle: 5 }), C('$_steady', 'Steady Earner', 'His own hustle +10%.', { hustle: 10 }), C('$_rain', 'Rainmaker', '+10% on every take he brings in.', {}, 'rainmaker')] },
      { name: 'Books', perks: [C('$_ledgers', 'Two Ledgers', 'The take of his jobs +5%.', { take: 5 }), C('$_paper', 'Paper Trail', 'Evidence on him −10%.', { evidence: 10 }), C('$_front', 'Clean Front', 'Evidence on him −10% more.', { evidence: 10 }), C('$_banker', 'Banker', 'His own hustle +10%; capos: district take +3%.', { hustle: 10, corners: 3 })] },
      { name: 'Loans', perks: [C('$_six', 'Six Points', 'The take of his jobs +5%.', { take: 5 }), C('$_terms', 'Easy Terms', '+3 when he asks something of a man (with the deeds).', { accept: 3 }), C('$_collat', 'Collateral', 'The take of his jobs +5%.', { take: 5 }), C('$_street', 'Street Banker', 'His own hustle +5%; take +5%.', { hustle: 5, take: 5 })] },
    ],
  },
  brains: {
    id: 'brains', name: 'Brains', icon: '✦', skill: 'intrigue', second: 'discipline', lifestyle: 'shadows',
    branches: [
      { name: 'Ears', perks: [C('b_listen', 'Listener', '+5 on scores (he hears where the money is).', { scoreJobs: 5 }), C('b_ghost', 'Ghost', 'Half the evidence; his file fades.', {}, 'ghost'), C('b_wire', 'Spot a Wire', 'His chance to talk when picked up −20%.', { rat: 20 }), C('b_rat', 'Rat Catcher', '+10% on any detail he guards.', { guard: 10 })] },
      { name: 'Schemer', perks: [C('b_plan', 'Planner', '+8 power on a scheme he is on.', { scheme: 8 }), C('b_safe', 'Safecracker', '+10 on warehouse, jewel and payroll jobs.', {}, 'safecracker'), C('b_alibi', 'Alibi', 'Evidence on him −15%.', { evidence: 15 }), C('b_master', 'Mastermind', '+8 more on a scheme he is on.', { scheme: 8 })] },
      { name: 'Liar', perks: [C('b_smooth', 'Smooth', '+4 on every dirty job.', { jobs: 4 }), C('b_forger', 'Forger', '+6 on fixes.', { fixJobs: 6 }), C('b_double', 'Double Game', 'At trial, 5 points less likely to flip.', { flip: 5 }), C('b_puppet', 'Puppeteer', '+6 power on a scheme he is on; +4 on every job.', { scheme: 6, jobs: 4 })] },
    ],
  },
  diplomacy: {
    id: 'diplomacy', name: 'Diplomacy', icon: '☏', skill: 'diplomacy', second: 'business', lifestyle: 'politics',
    branches: [
      { name: 'Talker', perks: [C('d_talk', 'Smooth talker', '+4 on every job, +6 more on fixes.', {}, 'talker'), C('d_peace', 'Peacemaker', 'His crew thinks 1 better of him every month.', { popular: 1 }), C('d_envoy', 'Envoy', 'In a council seat: +5 competence.', { ltSkill: 5 }), C('d_states', 'Statesman', '+5 on a Table vote when he pleads (with the deeds).', { pleadVote: 5 })] },
      { name: 'Fixer', perks: [C('d_fixer', 'Fixer', '+8 on fixes.', {}, 'fixer'), C('d_grease', 'Grease', '+6 on fixes.', { fixJobs: 6 }), C('d_favor', 'Favor Bank', 'The take of his jobs +5%.', { take: 5 }), C('d_king', 'Kingmaker', 'In a council seat: +8 competence.', { ltSkill: 8 })] },
      { name: 'Charm', perks: [C('d_friend', 'Friendly', 'His crew thinks 1 better of him every month.', { popular: 1 }), C('d_ladies', 'Ladies\' Man', '+10 on his dates (with the deeds).', { datingOdds: 10 }), C('d_popular', 'Popular', 'He thinks 1 better of the boss every month.', { loyalBoss: 1 }), C('d_beloved', 'Beloved', 'Rivals want him 15 less.', { poach: 15 })] },
    ],
  },
  leadership: {
    id: 'leadership', name: 'Leadership', icon: '♜', skill: 'leadership', second: 'diplomacy', lifestyle: 'family',
    branches: [
      { name: 'Captain', perks: [C('l_task', 'Taskmaster', 'District take +8%.', {}, 'taskmaster'), C('l_tight', 'Tight Crew', 'District take +4%.', { corners: 4 }), C('l_recruit', 'Recruiter', 'His crew grows 15% faster.', { crewLxp: 15 }), C('l_regime', 'Regime', 'District take +5%.', { corners: 5 })] },
      { name: 'Teacher', perks: [C('l_mentor', 'Mentor', 'His men learn 25% faster.', {}, 'mentor'), C('l_bring', 'Brings Them Up', 'His crew grows 15% faster.', { crewLxp: 15 }), C('l_proud', 'Proud Crew', 'His men think 1 better of the boss every month.', { crewLoyal: 1 }), C('l_old', 'Old School', 'His crew grows 10% faster; he thinks 1 better of the boss every month.', { crewLxp: 10, loyalBoss: 1 })] },
      { name: 'Strategist', perks: [C('l_reads', 'Reads the Street', 'In a council seat: +8 competence.', { ltSkill: 8 }), C('l_field', 'Field Commander', '+6 on muscle jobs he is on.', { muscleJobs: 6 }), C('l_hold', 'Holds the Line', 'His men think 1 better of the boss every month.', { crewLoyal: 1 }), C('l_standup', 'Stand-up guy', 'Can\'t be courted; thinks better of the boss.', {}, 'standup')] },
    ],
  },
};

/** Lifestyle XP for each perk in his branch. */
export const CREW_PERK_LXP = 100;

export function allCrewPerks(): (CrewPerk & { focus: Focus; branch: number; index: number })[] {
  return FOCUS_IDS.flatMap((f) => FOCI[f].branches.flatMap((b, bi) => b.perks.map((p, pi) => ({ ...p, focus: f, branch: bi, index: pi }))));
}
const CREW_CACHE = new Map<string, CrewPerk & { focus: Focus; branch: number; index: number }>();
export function crewPerk(id: string) {
  if (!CREW_CACHE.size) for (const p of allCrewPerks()) CREW_CACHE.set(p.id, p);
  return CREW_CACHE.get(id);
}

/** A man's crew perks (earned along his focus; never lost when it changes). */
export function crewPerksOf(s: GameState, id: string): string[] {
  return s.xp?.men[id]?.gp ?? [];
}

/** Sum of a modifier across ONE man's crew perks (read where he acts). */
export function manMod(s: GameState, c: Character | string | undefined, key: ManKey): number {
  const id = typeof c === 'string' ? c : c?.id;
  if (!id) return 0;
  let v = 0;
  for (const p of crewPerksOf(s, id)) v += crewPerk(p)?.mods[key] ?? 0;
  return v;
}

const lean = (c: Character, ...t: Character['traits'][number][]) => t.reduce((a, x) => a + (c.traits.includes(x) ? 12 : 0), 0);

/** The focus his nature takes him to: his top skill, leaned by his traits; a captain leads. */
export function natureFocus(_s: GameState, c: Character): Focus {
  const capo = c.rank === 'capo' || c.rank === 'underboss';
  const score: Record<Focus, number> = {
    muscle: c.attributes.force + lean(c, 'Cruel', 'Hot-headed'),
    money: c.attributes.business + lean(c, 'Greedy', 'Gambler'),
    brains: c.attributes.intrigue + lean(c, 'Paranoid', 'Patient'),
    diplomacy: c.attributes.diplomacy + lean(c, 'Charming', 'Womanizer'),
    leadership: c.attributes.leadership + lean(c, 'Ambitious') + (capo ? 40 : c.rank === 'consigliere' ? 10 : -15),
  };
  if (c.rank === 'consigliere') score.diplomacy += 25;
  return FOCUS_IDS.reduce((best, f) => (score[f] > score[best] ? f : best), FOCUS_IDS[0]);
}

/** The branch of his focus that fits his traits and skills best (ties: the first). */
export function natureBranch(_s: GameState, c: Character, f: Focus): 0 | 1 | 2 {
  const a = c.attributes;
  const fits: Record<Focus, [number, number, number]> = {
    muscle: [a.business / 2 + lean(c, 'Greedy', 'Cruel'), a.intrigue / 2 + lean(c, 'Hot-headed'), a.discipline / 2 + lean(c, 'Loyal-to-a-fault', 'Patient')],
    money: [a.business / 2 + lean(c, 'Gambler'), a.intrigue / 2 + lean(c, 'Patient', 'Honest'), a.force / 2 + lean(c, 'Greedy', 'Cruel')],
    brains: [a.discipline / 2 + lean(c, 'Paranoid'), a.force / 2 + lean(c, 'Patient'), a.diplomacy / 2 + lean(c, 'Charming')],
    diplomacy: [a.leadership / 2 + lean(c, 'Pious', 'Honest'), a.business / 2 + lean(c, 'Greedy'), a.diplomacy / 2 + lean(c, 'Charming', 'Womanizer')],
    leadership: [a.business / 2 + lean(c, 'Ambitious'), a.diplomacy / 2 + lean(c, 'Patient'), a.force / 2 + lean(c, 'Loyal-to-a-fault')],
  };
  const v = fits[f];
  return (v[1] > v[0] && v[1] >= v[2] ? 1 : v[2] > v[0] && v[2] > v[1] ? 2 : 0) as 0 | 1 | 2;
}
