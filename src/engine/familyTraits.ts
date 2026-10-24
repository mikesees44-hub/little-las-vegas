import { ageOn } from './calendar';
import { ALL_TRAITS, hasTrait } from './characters';
import { ensureDynState, fam, famMut, type Congenital, type EducationKind, type FamPerson, type GoalId, type LifePath } from './familyState';
import { chance, gauss, pick, rand } from './rng';
import type { Attributes, Character, GameState, Trait } from './types';

/**
 * Bloodline traits (CK congenital traits), childhood temperament,
 * education by a guardian, coming of age at 16, the paths grown children
 * choose, and each family member's goal.
 */

export const CONGENITAL_INFO: Record<Congenital, { text: string; good: boolean; opposite: Congenital }> = {
  Sharp: { text: 'Quick mind: +8 business, diplomacy and intrigue. Passed down in the blood.', good: true, opposite: 'Slow' },
  Slow: { text: 'Slow-witted: −8 business, diplomacy and intrigue.', good: false, opposite: 'Sharp' },
  Strong: { text: 'Built like a longshoreman: +12 muscle, hardier health.', good: true, opposite: 'Sickly' },
  Sickly: { text: 'Never was well: −15 health, ages badly.', good: false, opposite: 'Strong' },
  Handsome: { text: 'The whole parish says so: +6 diplomacy, better marriage prospects.', good: true, opposite: 'Homely' },
  Homely: { text: 'A face for radio: −4 diplomacy, harder to match.', good: false, opposite: 'Handsome' },
};
export const CONGENITALS = Object.keys(CONGENITAL_INFO) as Congenital[];

/** Chance a child gets a trait: both parents have it / one parent has it / neither (spontaneous). */
export const INHERIT = { both: 0.5, one: 0.18, none: 0.03 } as const;

/**
 * Roll a child's congenital traits from both parents. `goodMult` / `badMult`
 * come from the Blood legacy. Pure apart from the RNG holder.
 */
export function inheritCongenital(h: { rng: number }, father: Congenital[], mother: Congenital[], goodMult = 1, badMult = 1): Congenital[] {
  const out: Congenital[] = [];
  for (const t of CONGENITALS) {
    const n = (father.includes(t) ? 1 : 0) + (mother.includes(t) ? 1 : 0);
    let p: number = n === 2 ? INHERIT.both : n === 1 ? INHERIT.one : INHERIT.none;
    p *= CONGENITAL_INFO[t].good ? goodMult : badMult;
    if (rand(h) < Math.min(0.95, p) && !out.includes(CONGENITAL_INFO[t].opposite)) out.push(t);
  }
  return out;
}

function clamp(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

export function applyCongenital(c: Character, traits: Congenital[]): void {
  const a = c.attributes;
  for (const t of traits) {
    if (t === 'Sharp') { a.business = clamp(a.business + 8); a.diplomacy = clamp(a.diplomacy + 8); a.intrigue = clamp(a.intrigue + 8); }
    if (t === 'Slow') { a.business = clamp(a.business - 8); a.diplomacy = clamp(a.diplomacy - 8); a.intrigue = clamp(a.intrigue - 8); }
    if (t === 'Strong') { a.force = clamp(a.force + 12); c.health = clamp(c.health + 5); }
    if (t === 'Sickly') c.health = clamp(c.health - 15);
    if (t === 'Handsome') a.diplomacy = clamp(a.diplomacy + 6);
    if (t === 'Homely') a.diplomacy = clamp(a.diplomacy - 4);
  }
}

/** Seed congenital traits on people who existed before the dynasty layer (spontaneous rates only). */
export function seedCongenital(s: GameState, c: Character): void {
  const p = famMut(s, c.id);
  if (p.congenital.length) return;
  const d = ensureDynState(s);
  for (const t of CONGENITALS) if (rand(d) < 0.07 && !p.congenital.includes(CONGENITAL_INFO[t].opposite)) p.congenital.push(t);
}

/**
 * A newborn: inherit the blood from both parents, average their talents,
 * start with no personality (it is earned in childhood). Children of our
 * daughters married out belong to their father's house unless the match
 * was matrilineal.
 */
export function processNewborn(s: GameState, child: Character, goodMult: number, badMult: number): FamPerson {
  const d = ensureDynState(s);
  const father = child.fatherId ? s.characters[child.fatherId] : undefined;
  const mother = child.motherId ? s.characters[child.motherId] : undefined;
  const p = famMut(s, child.id);
  p.congenital = inheritCongenital(d, father ? fam(s, father.id).congenital : [], mother ? fam(s, mother.id).congenital : [], goodMult, badMult);
  child.traits = [];
  if (father && mother) {
    const keys = Object.keys(child.attributes) as (keyof Attributes)[];
    for (const k of keys) child.attributes[k] = clamp((father.attributes[k] + mother.attributes[k]) / 2 - 5 + gauss(d) * 8);
  }
  applyCongenital(child, p.congenital);
  p.goal = 'grow_up';
  child.ambition = 'Grow up';
  // Whose house is the baby?
  // Matrilineal: the husband married into our house, the children carry our name.
  if (father && mother?.dynasty && fam(s, father.id).matrilineal) {
    child.lastName = mother.lastName;
    child.dynasty = true;
    child.faction = 'player';
  } else if (father && !father.dynasty && mother?.dynasty) {
    // Our daughter married out: the baby belongs to his father's house.
    child.dynasty = false;
    child.faction = father.faction === 'player' ? 'player' : 'none';
    const hid = fam(s, father.id).houseId;
    if (hid) p.houseId = hid;
  }
  return p;
}

/* ---------------------------------------------------------------- */
/* Childhood                                                          */
/* ---------------------------------------------------------------- */

/** Temperaments a childhood event can set, in opposed pairs. */
export const CHILDHOOD_PAIRS: [Trait, Trait, string][] = [
  ['Hot-headed', 'Patient', 'got into a fight behind the school'],
  ['Charming', 'Paranoid', 'talked the nuns out of a detention'],
  ['Greedy', 'Honest', 'was caught running numbers for a corner bookie'],
  ['Cruel', 'Pious', 'was found throwing rocks at the gulls on the beach'],
  ['Ambitious', 'Loyal-to-a-fault', 'told the whole parish he was going to run Wildwood'],
];

/** Roll a childhood trait without an event (used for most children and the sim). */
export function autoChildhoodTrait(s: GameState, c: Character): Trait | undefined {
  const d = ensureDynState(s);
  const free = ALL_TRAITS.filter((t) => !hasTrait(c, t) && !c.traits.some((x) => CHILDHOOD_PAIRS.some(([a, b]) => (a === t && b === x) || (b === t && a === x))));
  const pool = free.filter((t) => t !== 'Womanizer' && t !== 'Drinker' && t !== 'Gambler');
  if (!pool.length) return undefined;
  const t = pick(d, pool);
  c.traits.push(t);
  return t;
}

/* ---------------------------------------------------------------- */
/* Education and coming of age                                        */
/* ---------------------------------------------------------------- */

export const EDUCATION: Record<EducationKind, { name: string; guardian: string; trait: string; attrs: (keyof Attributes)[]; cost: number; text: string; path: LifePath; minAge: number }> = {
  home: { name: 'Raised at home', guardian: 'His mother', trait: 'Raised on Glenwood Avenue', attrs: ['diplomacy'], cost: 0, text: 'Sunday gravy and the back of a wooden spoon.', path: 'straight', minAge: 0 },
  priest: { name: 'Father Callahan at St. Ann\'s', guardian: 'Father Callahan', trait: 'Parish schooled', attrs: ['diplomacy', 'discipline'], cost: 300, text: 'Latin, catechism and a conscience. Some boys hear a calling.', path: 'priest', minAge: 6 },
  capo: { name: 'Put him with a capo', guardian: 'A capo of your choosing', trait: 'Street educated', attrs: ['force', 'leadership', 'intrigue'], cost: 0, text: 'Runs envelopes at twelve, collects at fifteen. Learns the life from the inside.', path: 'life', minAge: 10 },
  penn: { name: 'College at Penn', guardian: 'The University of Pennsylvania', trait: 'Penn man', attrs: ['business', 'diplomacy'], cost: 4000, text: 'Prep school, then Philadelphia. Comes home talking like a banker.', path: 'politics', minAge: 13 },
  military: { name: 'The Army', guardian: 'The U.S. Army, Fort Dix', trait: 'Army man', attrs: ['discipline', 'force', 'leadership'], cost: 0, text: 'Basic at Fort Dix. Comes back with a crew cut and a temper under control.', path: 'straight', minAge: 14 },
};
export const EDUCATION_KINDS = Object.keys(EDUCATION) as EducationKind[];
export const TIER_NAME = ['', 'Poor', 'Fair', 'Good', 'Excellent'];

/** Education quality 1-4 from the guardian's skill, the child's wits and the Blood legacy. */
export function educationTier(s: GameState, child: Character, kind: EducationKind, guardianId?: string, bonus = 0): number {
  const d = ensureDynState(s);
  const g = guardianId ? s.characters[guardianId] : undefined;
  const info = EDUCATION[kind];
  const skill = g ? info.attrs.reduce((a, k) => a + g.attributes[k], 0) / info.attrs.length : kind === 'penn' ? 70 : kind === 'military' ? 60 : kind === 'priest' ? 60 : 45;
  const wits = fam(s, child.id).congenital.includes('Sharp') ? 12 : fam(s, child.id).congenital.includes('Slow') ? -12 : 0;
  const roll = skill + wits + gauss(d) * 12;
  const tier = roll >= 75 ? 4 : roll >= 60 ? 3 : roll >= 42 ? 2 : 1;
  return Math.max(1, Math.min(4, tier + bonus));
}

/** Apply a finished education: attribute bonuses, a trait-like label, sometimes a temperament. */
export function finishEducation(s: GameState, child: Character, tierBonus: number): { kind: EducationKind; tier: number } {
  const p = famMut(s, child.id);
  const kind = p.guardian?.kind ?? 'home';
  const tier = educationTier(s, child, kind, p.guardian?.guardianId, tierBonus);
  p.education = { kind, tier };
  for (const k of EDUCATION[kind].attrs) child.attributes[k] = clamp(child.attributes[k] + tier * 4);
  const d = ensureDynState(s);
  if (kind === 'priest' && !hasTrait(child, 'Cruel') && !hasTrait(child, 'Pious') && chance(d, 0.4)) child.traits.push('Pious');
  if (kind === 'military' && hasTrait(child, 'Hot-headed') && chance(d, 0.5)) child.traits = child.traits.filter((t) => t !== 'Hot-headed');
  if (kind === 'capo' && !hasTrait(child, 'Pious') && !hasTrait(child, 'Cruel') && chance(d, 0.25)) child.traits.push('Cruel');
  return { kind, tier };
}

export function educationLabel(e: { kind: EducationKind; tier: number } | undefined): string | undefined {
  return e ? `${EDUCATION[e.kind].trait} (${TIER_NAME[e.tier]})` : undefined;
}

export const PATH_INFO: Record<LifePath, { name: string; text: string; ambition: string }> = {
  life: { name: 'Join the life', text: 'Becomes an associate of your crew. On the road to being made.', ambition: 'Make his bones' },
  straight: { name: 'Go straight', text: 'A legitimate job and a clean record. A future front man.', ambition: 'Get out clean' },
  priest: { name: 'Take holy orders', text: 'Enters the seminary. Will never marry; the parish will love the family.', ambition: 'Serve the parish' },
  politics: { name: 'Go into politics', text: 'Runs for the city commission one day. A favor a year from the ward.', ambition: 'Win a seat at City Hall' },
  fronts: { name: 'Run a legit front', text: 'Keeps the books at the family\'s legitimate places. Clean money, better laundering.', ambition: 'Open a dress shop on Pacific Avenue' },
  adviser: { name: 'The power behind the throne', text: 'Stays close to the head of the house. Quiet counsel, sharper schemes.', ambition: 'Keep the family together' },
  marry: { name: 'Marry well', text: 'Waits for a good match with a strong house.', ambition: 'See her children married well' },
};

/** Which paths are open to a child at 16. */
export function openPaths(c: Character): LifePath[] {
  return c.gender === 'M' ? ['life', 'straight', 'priest', 'politics'] : ['marry', 'fronts', 'adviser', 'straight'];
}

/** What the child wants for himself (the path they lean toward). */
export function leaningPath(s: GameState, c: Character): LifePath {
  const p = fam(s, c.id);
  const kind = p.guardian?.kind ?? 'home';
  if (c.gender === 'F') {
    if (hasTrait(c, 'Ambitious') || hasTrait(c, 'Paranoid')) return 'adviser';
    if (kind === 'penn' || c.attributes.business >= 60) return 'fronts';
    if (hasTrait(c, 'Honest')) return 'straight';
    return 'marry';
  }
  if (kind === 'priest' && (hasTrait(c, 'Pious') || hasTrait(c, 'Honest'))) return 'priest';
  if (kind === 'penn') return hasTrait(c, 'Charming') || hasTrait(c, 'Ambitious') ? 'politics' : 'straight';
  if (hasTrait(c, 'Honest') || hasTrait(c, 'Cowardly')) return 'straight';
  if (kind === 'capo' || hasTrait(c, 'Cruel') || hasTrait(c, 'Hot-headed') || hasTrait(c, 'Ambitious')) return 'life';
  return EDUCATION[kind].path === 'priest' ? 'straight' : EDUCATION[kind].path;
}

export const GOAL_INFO: Record<GoalId, string> = {
  the_chair: 'Sit in the chair one day',
  get_out: 'Get out of the life',
  make_bones: 'Make his bones',
  marry_well: 'Marry into a strong house',
  college: 'Finish college',
  priesthood: 'Serve the parish',
  politics: 'Win a seat at City Hall',
  own_business: 'Run a legitimate business',
  protect_family: 'Keep the family safe',
  revenge: 'Avenge the family',
  grow_up: 'Grow up',
};

/** A goal that follows from a path and temperament (drives behaviour and events). */
export function goalFor(_s: GameState, c: Character, path: LifePath, isHeir: boolean): GoalId {
  if (path === 'life') return hasTrait(c, 'Ambitious') || (!isHeir && hasTrait(c, 'Greedy')) ? 'the_chair' : 'make_bones';
  if (path === 'straight') return isHeir || hasTrait(c, 'Honest') ? 'get_out' : 'own_business';
  if (path === 'priest') return 'priesthood';
  if (path === 'politics') return 'politics';
  if (path === 'fronts') return 'own_business';
  if (path === 'adviser') return hasTrait(c, 'Ambitious') ? 'the_chair' : 'protect_family';
  return 'marry_well';
}

/** Initial goals for the people present when the dynasty layer starts. */
export function seedGoal(s: GameState, c: Character, isHeir: boolean): GoalId {
  const a = ageOn(c.birth, s.date);
  if (a < 16) return 'grow_up';
  if (c.id === s.playerId) return 'protect_family';
  if (c.gender === 'F') return c.spouseId ? 'protect_family' : 'marry_well';
  if (c.rank !== 'civilian') return hasTrait(c, 'Ambitious') && !isHeir ? 'the_chair' : 'make_bones';
  return hasTrait(c, 'Honest') ? 'get_out' : isHeir ? 'the_chair' : 'own_business';
}
