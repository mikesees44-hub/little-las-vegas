import { addDays, ageOn } from './calendar';
import { FEMALE_FIRST, MALE_FIRST, NICKNAMES, SURNAMES } from './names';
import { orientationFor } from './storyState';
import { chance, gauss, pick, rand, randInt, shuffle, type RngHolder } from './rng';
import type { Attributes, Character, Ethnicity, FactionId, GameDate, GameState, Rank, Trait } from './types';

export const ALL_TRAITS: Trait[] = [
  'Greedy', 'Hot-headed', 'Patient', 'Ambitious', 'Loyal-to-a-fault', 'Paranoid', 'Pious', 'Womanizer',
  'Gambler', 'Honest', 'Cruel', 'Cowardly', 'Charming', 'Vengeful', 'Drinker',
];

/** Pairs of traits that cannot appear on the same character. */
export const OPPOSED: [Trait, Trait][] = [
  ['Greedy', 'Honest'],
  ['Hot-headed', 'Patient'],
  ['Cruel', 'Pious'],
  ['Cowardly', 'Hot-headed'],
  ['Loyal-to-a-fault', 'Ambitious'],
  ['Pious', 'Womanizer'],
  ['Cowardly', 'Vengeful'],
];

export const TRAIT_INFO: Record<Trait, string> = {
  Greedy: 'Skims kick-ups; wants a bigger cut.',
  'Hot-headed': 'Volatile earnings; starts fights that draw local heat.',
  Patient: 'Steady earnings; grudges cool quicker.',
  Ambitious: 'Wants the chair; skims when unhappy.',
  'Loyal-to-a-fault': 'Never skims; forgives slights.',
  Paranoid: 'Slow to trust anyone.',
  Pious: 'Likes church and charity; hates cruelty.',
  Womanizer: 'Scandal follows him.',
  Gambler: 'Wild swings in his earnings.',
  Honest: 'Never skims; dislikes bribery.',
  Cruel: 'Breeds fear and local heat.',
  Cowardly: 'Folds under pressure; prosecutors love him.',
  Charming: 'Better at deals and making friends.',
  Vengeful: 'Grudges never fade.',
  Drinker: 'Health declines faster.',
};

export const AMBITIONS = [
  'Become a capo', 'Take the chair', 'Retire to Florida', 'Open a legitimate restaurant', 'Make his bones',
  'Run the Boardwalk', 'Buy a house in the Crest', 'Get out clean', 'Send his kids to college', 'Settle an old score',
  'Win the respect of Philadelphia', 'Own a nightclub on Pacific Avenue',
];
export const FEMALE_AMBITIONS = [
  'See her children married well', 'Keep the family together', 'Run a respectable household', 'Open a dress shop',
  'Get the family out of the life', 'Be the first in the family to finish college',
];

export function hasTrait(c: Character, t: Trait): boolean {
  return c.traits.includes(t);
}

export function rollTraits(h: RngHolder, n: number): Trait[] {
  const out: Trait[] = [];
  for (const t of shuffle(h, ALL_TRAITS)) {
    if (out.length >= n) break;
    if (OPPOSED.some(([a, b]) => (a === t && out.includes(b)) || (b === t && out.includes(a)))) continue;
    out.push(t);
  }
  return out;
}

function clampStat(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

export function rollAttributes(h: RngHolder, rank: Rank, traits: Trait[]): Attributes {
  const rankBonus: Record<Rank, number> = { boss: 15, underboss: 12, consigliere: 10, capo: 8, soldier: 3, associate: 0, civilian: -5 };
  const b = rankBonus[rank];
  const a = (bias = 0) => clampStat(45 + b + bias + gauss(h) * 14);
  const attrs: Attributes = {
    leadership: a(rank === 'boss' || rank === 'capo' ? 5 : 0),
    business: a(),
    diplomacy: a(rank === 'consigliere' ? 10 : 0),
    intrigue: a(),
    force: a(rank === 'soldier' ? 8 : 0),
    discipline: a(),
  };
  if (traits.includes('Charming')) attrs.diplomacy = clampStat(attrs.diplomacy + 12);
  if (traits.includes('Hot-headed')) attrs.discipline = clampStat(attrs.discipline - 12);
  if (traits.includes('Patient')) attrs.discipline = clampStat(attrs.discipline + 10);
  if (traits.includes('Cowardly')) attrs.force = clampStat(attrs.force - 15);
  if (traits.includes('Cruel')) attrs.force = clampStat(attrs.force + 8);
  if (traits.includes('Paranoid')) attrs.intrigue = clampStat(attrs.intrigue + 8);
  if (traits.includes('Gambler')) attrs.business = clampStat(attrs.business - 6);
  return attrs;
}

export function newId(s: GameState, prefix: string): string {
  return `${prefix}${s.nextId++}`;
}

/** Nicknames currently in use by living members of a faction. */
export function usedNicknames(s: GameState, faction: FactionId): Set<string> {
  const used = new Set<string>();
  for (const c of Object.values(s.characters)) {
    if (c.alive && c.faction === faction && c.nickname) used.add(c.nickname);
  }
  return used;
}

export function pickNickname(s: GameState, faction: FactionId): string | undefined {
  const used = usedNicknames(s, faction);
  const free = NICKNAMES.filter((n) => !used.has(n));
  return free.length ? pick(s, free) : undefined;
}

export interface MakeCharOpts {
  gender?: 'M' | 'F';
  ethnicity?: Ethnicity;
  lastName?: string;
  firstName?: string;
  age?: number;
  rank?: Rank;
  faction?: FactionId;
  dynasty?: boolean;
  nickname?: boolean;
  traits?: Trait[];
  wealth?: number;
}

export function birthForAge(h: RngHolder, today: GameDate, age: number): GameDate {
  // Birthday somewhere in the year before `today - age years`.
  const base: GameDate = { y: today.y - age, m: today.m, d: Math.min(today.d, 28) };
  return addDays(base, -randInt(h, 0, 364));
}

/**
 * B7: a child of the house is not given the first name of a living member of the house (two or three
 * Pasquale Scalias alive at once made the tree and the history read wrong). One draw, as before; on a
 * clash the next free name in the list.
 */
function freshFirstName(s: GameState, list: readonly string[], house: string | undefined): string {
  const first = pick(s, list as string[]);
  if (!house) return first;
  const taken = new Set<string>();
  for (const c of Object.values(s.characters)) if (c.alive && c.dynasty && c.lastName === house) taken.add(c.firstName);
  if (!taken.has(first)) return first;
  const i = list.indexOf(first);
  for (let k = 1; k < list.length; k++) { const n = list[(i + k) % list.length]; if (!taken.has(n)) return n; }
  return first;
}

export function makeCharacter(s: GameState, opts: MakeCharOpts = {}): Character {
  const gender = opts.gender ?? 'M';
  const eth = opts.ethnicity ?? (pick(s, ['Italian', 'Italian', 'Italian', 'Italian', 'Irish', 'Jewish']) as Ethnicity);
  const rank = opts.rank ?? 'civilian';
  const age = opts.age ?? randInt(s, 22, 55);
  const traits = opts.traits ?? rollTraits(s, rand(s) < 0.5 ? 2 : 3);
  const faction = opts.faction ?? 'none';
  const c: Character = {
    id: newId(s, 'c'),
    firstName: opts.firstName ?? freshFirstName(s, gender === 'M' ? MALE_FIRST[eth] : FEMALE_FIRST[eth], opts.dynasty ? opts.lastName : undefined),
    lastName: opts.lastName ?? pick(s, SURNAMES[eth]),
    gender,
    ethnicity: eth,
    birth: birthForAge(s, s.date, age),
    health: 100,
    conditions: [],
    attributes: rollAttributes(s, rank, traits),
    traits,
    ambition: pick(s, gender === 'M' ? AMBITIONS : FEMALE_AMBITIONS),
    rank,
    faction,
    wealth: opts.wealth ?? Math.max(0, Math.round((rank === 'civilian' ? 800 : 2500) * (1 + rand(s) * 3))),
    dynasty: opts.dynasty ?? false,
    childrenIds: [],
    alive: true,
  };
  if (opts.nickname ?? (gender === 'M' && rank !== 'civilian' && chance(s, 0.75))) {
    c.nickname = pickNickname(s, faction);
  }
  // Orientation is fixed at birth from the seed and the id (no dice drawn, independent of traits).
  c.orientation = orientationFor(s.seed, c.id);
  rollInitialHealth(s, c);
  s.characters[c.id] = c;
  return c;
}

export function age(s: GameState, c: Character): number {
  return ageOn(c.birth, c.death ? c.death.date : s.date);
}

/** Starting health and chronic conditions based on age and lifestyle traits. */
export function rollInitialHealth(h: RngHolder & { date: GameDate }, c: Character): void {
  const a = ageOn(c.birth, h.date);
  let hp = 100 - Math.max(0, a - 35) * 0.9 + gauss(h) * 6;
  if (c.traits.includes('Drinker')) {
    hp -= 8;
    if (a > 35 && chance(h, 0.5)) c.conditions.push("Drinker's liver");
  }
  if (a > 45 && chance(h, 0.18)) c.conditions.push('Bad heart');
  if (a > 30 && chance(h, 0.35)) c.conditions.push("Smoker's cough");
  if (a > 50 && chance(h, 0.12)) c.conditions.push('Sugar diabetes');
  hp -= c.conditions.length * 5;
  c.health = clampStat(Math.min(100, hp));
}

/** Monthly health drift for one living character. Returns a string if a new condition appeared. */
export function monthlyHealth(h: RngHolder & { date: GameDate }, c: Character): string | undefined {
  const a = ageOn(c.birth, h.date);
  let delta = 0;
  if (a < 40) delta += 1.0; // recovers
  else if (a < 55) delta -= 0.15;
  else if (a < 70) delta -= 0.45;
  else delta -= 0.9;
  if (c.traits.includes('Drinker')) delta -= 0.4;
  delta -= c.conditions.length * 0.12;
  delta += gauss(h) * 0.9;
  // gentle pull back toward an age-appropriate ceiling so the young heal
  const ceiling = 100 - Math.max(0, a - 40) * 0.8;
  if (c.health < ceiling - 20) delta += 0.8;
  if (c.health > ceiling) delta = Math.min(delta, 0);
  c.health = clampStat(c.health + delta);

  let added: string | undefined;
  if (a > 40 && !c.conditions.includes('Bad heart') && chance(h, 0.0015 * (a - 40) / 5)) added = 'Bad heart';
  else if (c.traits.includes('Drinker') && a > 35 && !c.conditions.includes("Drinker's liver") && chance(h, 0.006)) added = "Drinker's liver";
  else if (a > 55 && !c.conditions.includes('Sugar diabetes') && chance(h, 0.002)) added = 'Sugar diabetes';
  if (added) {
    c.conditions.push(added);
    c.health = clampStat(c.health - 6);
  }
  return added;
}

/**
 * Monthly probability of natural death given age and health.
 * Roughly tracks 1960 US mortality for working-class men, skewed by health.
 */
export function monthlyDeathChance(a: number, health: number): number {
  let annual: number;
  if (a < 30) annual = 0.0015;
  else if (a < 40) annual = 0.003;
  else if (a < 50) annual = 0.007;
  else if (a < 60) annual = 0.017;
  else if (a < 70) annual = 0.038;
  else if (a < 80) annual = 0.085;
  else annual = 0.18;
  const healthFactor = health >= 70 ? 0.6 : health >= 50 ? 1 : health >= 30 ? 2.2 : health >= 15 ? 5 : 12;
  return Math.min(0.6, 1 - Math.pow(1 - Math.min(0.97, annual * healthFactor), 1 / 12));
}

export function displayName(c: Character): string {
  if (c.nickname) return `${c.firstName} "${c.nickname}" ${c.lastName}`;
  return `${c.firstName} ${c.lastName}`;
}

export function shortName(c: Character): string {
  return c.nickname ? `${c.firstName} "${c.nickname}" ${c.lastName}` : `${c.firstName} ${c.lastName}`;
}

/** Living members of the player's crew (made men + associates), excluding the boss. */
export function crew(s: GameState, includeBoss = false): Character[] {
  const out: Character[] = [];
  const all = s.characters;
  for (const id in all) {
    const c = all[id];
    if (c.alive && c.faction === 'player' && c.rank !== 'civilian' && (includeBoss || c.id !== s.playerId)) out.push(c);
  }
  return out;
}

export function capos(s: GameState): Character[] {
  return crew(s).filter((c) => c.rank === 'capo');
}

export function dynastyMembers(s: GameState): Character[] {
  return Object.values(s.characters).filter((c) => c.dynasty);
}

export function livingDynasty(s: GameState): Character[] {
  return dynastyMembers(s).filter((c) => c.alive);
}

export function player(s: GameState): Character {
  return s.characters[s.playerId];
}

export function isFree(s: GameState, c: Character): boolean {
  return c.alive && (c.imprisonedUntil === undefined || c.imprisonedUntil <= s.week);
}

/** Closest blood relatives of a character (parents, children, siblings, spouse). */
export function relatives(s: GameState, c: Character): Character[] {
  const out = new Set<string>();
  if (c.spouseId) out.add(c.spouseId);
  if (c.fatherId) out.add(c.fatherId);
  if (c.motherId) out.add(c.motherId);
  c.childrenIds.forEach((id) => out.add(id));
  for (const o of Object.values(s.characters)) {
    if (o.id !== c.id && c.fatherId && o.fatherId === c.fatherId) out.add(o.id);
  }
  return [...out].map((id) => s.characters[id]).filter((x): x is Character => !!x && x.alive);
}

export function relationLabel(s: GameState, of: Character, to: Character): string {
  if (of.spouseId === to.id) return to.gender === 'F' ? 'wife' : 'husband';
  if (of.fatherId === to.id) return 'father';
  if (of.motherId === to.id) return 'mother';
  if (of.childrenIds.includes(to.id)) return to.gender === 'M' ? 'son' : 'daughter';
  if (of.fatherId && of.fatherId === to.fatherId) return to.gender === 'M' ? 'brother' : 'sister';
  const ofFather = of.fatherId ? s.characters[of.fatherId] : undefined;
  if (ofFather && ofFather.fatherId && ofFather.fatherId === to.fatherId && to.id !== ofFather.id) return to.gender === 'M' ? 'uncle' : 'aunt';
  const toFather = to.fatherId ? s.characters[to.fatherId] : undefined;
  if (toFather && toFather.fatherId && toFather.fatherId === of.fatherId && toFather.id !== of.id) return to.gender === 'M' ? 'nephew' : 'niece';
  if (toFather && toFather.fatherId === of.id) return to.gender === 'M' ? 'grandson' : 'granddaughter';
  return 'kin';
}
