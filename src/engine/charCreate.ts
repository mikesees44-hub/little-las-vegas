import { addDays, ageOn } from './calendar';
import { ALL_ATTRS, ATTR_GROUPS, ensureAttrs } from './attrs';
import { ALL_TRAITS, OPPOSED, birthForAge, displayName, makeCharacter } from './characters';
import { addStory } from './hierarchy';
import { LIFESTYLES } from './lifestyle';
import { FEMALE_FIRST, MALE_FIRST } from './names';
import { nicknameOrigin } from './nicknames';
import { addOpinion } from './relations';
import { hashSeed } from './rng';
import { addSecret } from './secrets';
import type { AttrGroup } from './powerState';
import type { Appearance, Attributes, Character, Ethnicity, GameState, LifestyleId, Trait, Vice } from './types';

/**
 * The character creator (CK3-style ruler designer), applied on top of a
 * start. Pure and deterministic: the same seed, start and options always
 * build the same game. `validateCharOptions` is the one gate; `newGameWith`
 * refuses options that fail it.
 *
 * Point-buy: every start gives BUDGET points plus whatever its own boss's
 * traits were worth (so keeping the start's man as he is costs nothing).
 * Skills cost 1 a point, expanded attribute groups 2 a point, good traits
 * cost and flaws refund, a vice refunds 2.
 */

export type StartKey = 'classic' | 'olddon' | 'rise' | 'sees' | 'associate' | 'soldier' | 'capo';
type Skill = keyof Attributes;
export const SKILLS: Skill[] = ['leadership', 'business', 'diplomacy', 'intrigue', 'force', 'discipline'];
/** Groups you can buy into (personality comes from traits). */
export const BUY_GROUPS: AttrGroup[] = ['intelligence', 'social', 'criminal', 'leadership', 'business'];

export const BUDGET = 20;
export const SKILL_STEP = 10;
export const GROUP_STEP = 6;
export const GROUP_COST = 2;
export const VICE_REFUND = 2;
export const MAX_TRAITS = 3;

/** Good traits cost points, flaws refund them. */
export const TRAIT_COST: Record<Trait, number> = {
  Patient: 6, Charming: 6, Ambitious: 4, Honest: 3, Paranoid: 2, Pious: 2, 'Loyal-to-a-fault': 2,
  Vengeful: -1, Cruel: -2, Greedy: -2, Womanizer: -3, 'Hot-headed': -4, Gambler: -4, Drinker: -5, Cowardly: -6,
};

export type BirthplaceId = 'wildwood' | 'southphilly' | 'ac' | 'sicily' | 'calabria' | 'naples' | 'cork' | 'les';
export interface Birthplace { id: BirthplaceId; name: string; text: string; skills: Partial<Attributes>; effect: string; ethnicity?: Ethnicity }
export const BIRTHPLACES: Birthplace[] = [
  { id: 'wildwood', name: 'Wildwood', text: 'Born on the island. Everybody knew your mother.', skills: { diplomacy: 2 }, effect: 'Local heat −3' },
  { id: 'southphilly', name: 'South Philly', text: 'A Passyunk Avenue kid. Philadelphia remembers its own.', skills: { leadership: 1 }, effect: 'Philadelphia opinion +10' },
  { id: 'ac', name: 'Atlantic City', text: 'Grew up under the Steel Pier lights, next door to the Mannos.', skills: { intrigue: 2 }, effect: 'Manno opinion +5' },
  { id: 'sicily', name: 'Sicily', text: 'Came over on the boat at six. The old ways came with you.', skills: { discipline: 3 }, effect: 'Respect +3' },
  { id: 'calabria', name: 'Calabria', text: 'Mountain people. Hard heads and long memories.', skills: { force: 3 }, effect: '' },
  { id: 'naples', name: 'Naples', text: 'A city of hustlers. You can sell sand at the shore.', skills: { business: 3 }, effect: '' },
  { id: 'cork', name: 'County Cork', text: 'An Irish house in an Italian business. The cops on the island are your cousins.', skills: { diplomacy: 1 }, effect: 'Irish bloodline; Irish officials +10', ethnicity: 'Irish' },
  { id: 'les', name: 'Lower East Side', text: 'Mulberry and Delancey. You know New York money by its first name.', skills: { intrigue: 1 }, effect: 'Feldstein opinion +10' },
];

export type BackgroundId = 'numbers' | 'korea' | 'docks' | 'boxer' | 'college' | 'altar';
export interface Background { id: BackgroundId; name: string; text: string; skills: Partial<Attributes>; gives: string }
export const BACKGROUNDS: Background[] = [
  { id: 'numbers', name: 'Son of a numbers banker', text: 'You learned to count on your father\'s policy slips.', skills: { business: 4 }, gives: 'Contact: Sgt. Healy (+20), who took your father\'s envelope for years' },
  { id: 'korea', name: 'Korea veteran', text: 'Two winters at the Chosin Reservoir. Nothing on the island scares you.', skills: { discipline: 3, force: 3 }, gives: 'Contact: Chief Gorman (+15), an old Marine' },
  { id: 'docks', name: 'Came up on the docks', text: 'Longshoreman at fifteen, hiring boss at twenty-two.', skills: { force: 4 }, gives: 'Secret: Councilman Dougherty skims the pier contracts (a hook on him)' },
  { id: 'boxer', name: 'Ex-boxer', text: 'Golden Gloves middleweight. The crew saw you fight at Convention Hall.', skills: { force: 5, diplomacy: -1 }, gives: 'Contact: your whole crew (+6); respect +3' },
  { id: 'college', name: 'College boy', text: 'Two years at Villanova on your uncle\'s money. You talk like a lawyer.', skills: { business: 3, diplomacy: 3, force: -2 }, gives: 'Contact: Assemblyman Pruitt (+15), a classmate' },
  { id: 'altar', name: 'Altar boy at St. Ann\'s', text: 'You served Mass for Monsignor for six years and heard every whisper in the sacristy.', skills: { diplomacy: 2, discipline: 2 }, gives: 'Secret: Judge Voss owes a bookmaker (a hook on him)' },
];

export const VICES: { id: Vice | 'none'; name: string; text: string }[] = [
  { id: 'none', name: 'No vice', text: 'A clean man. They will look for something anyway.' },
  { id: 'horses', name: 'The horses', text: 'Garden State Park every Saturday.' },
  { id: 'cards', name: 'Cards', text: 'A standing pinochle game you never miss.' },
  { id: 'booze', name: 'Drink', text: 'Rye at lunch, rye at dinner.' },
  { id: 'women', name: 'Women', text: 'A wandering eye. Discreet, so far.' },
  { id: 'debt', name: 'Money', text: 'Lives beyond his means: the Cadillac, the suits, the tabs.' },
];

export interface CharOptions {
  firstName?: string;
  /** '' = no nickname. */
  nickname?: string;
  sex?: 'M' | 'F';
  age?: number;
  birthplace?: BirthplaceId;
  houseName?: string;
  appearance?: Appearance;
  /** Deltas from the start's values. */
  skills?: Partial<Record<Skill, number>>;
  /** Deltas to every value in an expanded attribute group. */
  groups?: Partial<Record<AttrGroup, number>>;
  traits?: Trait[];
  lifestyle?: LifestyleId;
  background?: BackgroundId;
  vice?: Vice | 'none';
  married?: boolean;
  spouseName?: string;
  kids?: number;
  motherAlive?: boolean;
  /** Hard economy (ironman): less cash, a shylock debt. */
  hard?: boolean;
}

export const AGE_RANGE: Record<StartKey, [number, number]> = {
  classic: [30, 62], olddon: [58, 74], sees: [52, 68], rise: [20, 36], associate: [18, 30], soldier: [22, 42], capo: [28, 52],
};
export const MOTHER_MAX_AGE = 86;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, Math.round(v)));

export function traitConflicts(traits: Trait[]): [Trait, Trait][] {
  return OPPOSED.filter(([a, b]) => traits.includes(a) && traits.includes(b));
}

export function opposites(t: Trait): Trait[] {
  return OPPOSED.flatMap(([a, b]) => (a === t ? [b] : b === t ? [a] : []));
}

export function traitCost(traits: Trait[]): number {
  return traits.reduce((a, t) => a + (TRAIT_COST[t] ?? 0), 0);
}

export interface CreatorBase {
  start: StartKey;
  firstName: string;
  nickname: string;
  sex: 'M' | 'F';
  age: number;
  house: string;
  traits: Trait[];
  skills: Attributes;
  ageRange: [number, number];
  kidsRange: [number, number];
  married: boolean;
  spouseName: string;
  kids: number;
  motherAlive: boolean;
  /** The points to spend: what you keep as written (traits, vices) is free; changes cost or refund. */
  budget: number;
  /** The start's own vices (as written). */
  vices?: Vice[];
}

function boss(s: GameState): Character {
  return s.characters[s.playerId];
}

function kidsOf(s: GameState, c: Character): Character[] {
  return c.childrenIds.map((id) => s.characters[id]).filter((k): k is Character => !!k && k.alive);
}

/** What the start gives you, before any picks (for the creator's defaults). */
export function creatorBase(s: GameState, start: StartKey): CreatorBase {
  const b = boss(s);
  const sp = b.spouseId ? s.characters[b.spouseId] : undefined;
  const mother = b.motherId ? s.characters[b.motherId] : undefined;
  return {
    start,
    firstName: b.firstName,
    nickname: b.nickname ?? '',
    sex: b.gender,
    age: ageOn(b.birth, s.date),
    house: s.houseName,
    traits: [...b.traits],
    skills: { ...b.attributes },
    ageRange: AGE_RANGE[start],
    kidsRange: [start === 'sees' || start === 'olddon' ? 3 : 0, 6],
    married: !!sp?.alive,
    spouseName: sp?.firstName ?? '',
    kids: kidsOf(s, b).length,
    motherAlive: !!mother?.alive,
    budget: BUDGET,
    vices: [...(b.vices ?? [])],
  };
}

/** Points spent by these picks (compare with `base.budget`). */
export function pointsSpent(base: Pick<CreatorBase, 'traits'> & { vices?: readonly Vice[] }, o: CharOptions): number {
  let n = 0;
  for (const k of SKILLS) n += o.skills?.[k] ?? 0;
  for (const g of BUY_GROUPS) n += (o.groups?.[g] ?? 0) * GROUP_COST;
  // Traits and the vice count against the start as written: keeping them is free, so the points left never exceed the pool.
  n += traitCost(o.traits ?? base.traits) - traitCost(base.traits);
  const had = (base.vices?.length ?? 0) > 0;
  const has = o.vice === undefined ? had : o.vice !== 'none';
  n -= ((has ? 1 : 0) - (had ? 1 : 0)) * VICE_REFUND;
  return n;
}

export function maxKids(age: number, start: StartKey): number {
  return age < 19 ? (start === 'sees' || start === 'olddon' ? 3 : 0) : 6;
}

/** Everything wrong with these options for this start (empty = fine). */
export function validateCharOptions(base: CreatorBase, o: CharOptions): string[] {
  const err: string[] = [];
  const traits = o.traits ?? base.traits;
  if (traits.length > MAX_TRAITS) err.push(`At most ${MAX_TRAITS} traits.`);
  if (new Set(traits).size !== traits.length) err.push('A trait is picked twice.');
  for (const t of traits) if (!ALL_TRAITS.includes(t)) err.push(`Unknown trait: ${t}.`);
  for (const [a, b] of traitConflicts(traits)) err.push(`${a} and ${b} are opposites.`);
  for (const k of SKILLS) {
    const d = o.skills?.[k] ?? 0;
    if (Math.abs(d) > SKILL_STEP) err.push(`${k} can move at most ${SKILL_STEP} points.`);
  }
  for (const g of Object.keys(o.groups ?? {}) as AttrGroup[]) {
    if (!BUY_GROUPS.includes(g)) err.push(`${g} cannot be bought.`);
    if (Math.abs(o.groups![g] ?? 0) > GROUP_STEP) err.push(`${g} can move at most ${GROUP_STEP} points.`);
  }
  const age = o.age ?? base.age;
  const [lo, hi] = base.ageRange;
  if (age < lo || age > hi) err.push(`Age must be ${lo}–${hi} for this start.`);
  const kids = o.kids ?? base.kids;
  const kMax = maxKids(age, base.start);
  if (kids < base.kidsRange[0] || kids > kMax) err.push(`Children must be ${base.kidsRange[0]}–${kMax}.`);
  if ((o.motherAlive ?? base.motherAlive) && age + 20 > MOTHER_MAX_AGE) err.push(`At ${age}, your mother would be past ${MOTHER_MAX_AGE}.`);
  if (o.firstName !== undefined && !o.firstName.trim()) err.push('Your man needs a name.');
  if (o.houseName !== undefined && !o.houseName.trim()) err.push('The house needs a name.');
  for (const x of [o.firstName, o.nickname, o.houseName, o.spouseName]) if (x && x.length > 24) err.push('Names are 24 letters at most.');
  const spent = pointsSpent(base, o);
  if (spent > base.budget) err.push(`Over budget: ${spent} of ${base.budget} points.`);
  return err;
}

function setAge(s: GameState, c: Character, age: number): void {
  c.birth = birthForAge({ rng: hashSeed(`${s.seed}:age:${c.id}:${age}`) }, s.date, age);
}

function removeCharacter(s: GameState, id: string): void {
  const c = s.characters[id];
  if (!c) return;
  for (const p of [c.fatherId, c.motherId, c.bioFatherId]) if (p && s.characters[p]) s.characters[p].childrenIds = s.characters[p].childrenIds.filter((x) => x !== id);
  delete s.characters[id];
  s.secrets = s.secrets.filter((x) => x.ownerId !== id);
  s.hooks = s.hooks.filter((x) => x.targetId !== id);
  for (const k of Object.keys(s.relations)) if (k.startsWith(`${id}>`) || k.endsWith(`>${id}`)) delete s.relations[k];
}

function bury(s: GameState, c: Character, yearsAgo: number, cause: string): void {
  c.alive = false;
  c.death = { week: 0, date: addDays({ y: s.date.y - yearsAgo, m: 3, d: 2 }, hashSeed(`${s.seed}:bury:${c.id}`) % 200), cause };
}

function nameFor(s: GameState, salt: string, g: 'M' | 'F', eth: Ethnicity): string {
  const pool = g === 'M' ? MALE_FIRST[eth] : FEMALE_FIRST[eth];
  return pool[hashSeed(`${s.seed}:${salt}`) % pool.length];
}

function official(s: GameState, office: string): Character | undefined {
  return Object.values(s.characters).find((c) => c.alive && c.office === office);
}

/** Apply validated creator picks to a freshly started game. */
export function applyCharOptions(s: GameState, start: StartKey, o: CharOptions): void {
  const base = creatorBase(s, start);
  const errs = validateCharOptions(base, o);
  if (errs.length) throw new Error(`Invalid character: ${errs.join(' ')}`);
  const b = boss(s);
  const oldName = displayName(b);
  const oldHouse = s.houseName;

  /* ---- who he is ---- */
  const place = BIRTHPLACES.find((p) => p.id === (o.birthplace ?? 'wildwood'))!;
  const sex = o.sex ?? b.gender;
  b.gender = sex;
  if (o.firstName) b.firstName = o.firstName.trim();
  else if (sex !== base.sex) b.firstName = nameFor(s, 'boss', sex, place.ethnicity ?? b.ethnicity);
  if (o.nickname !== undefined) b.nickname = o.nickname.trim() || undefined;
  if (o.appearance) b.appearance = { ...o.appearance, genes: o.appearance.genes ? { ...o.appearance.genes } : undefined };
  const house = o.houseName?.trim() || oldHouse;
  if (house !== oldHouse) {
    for (const c of Object.values(s.characters)) if (c.dynasty && c.lastName === oldHouse) c.lastName = house;
    s.houseName = house;
  }
  if (place.ethnicity) {
    for (const c of Object.values(s.characters)) {
      const blood = c.id === b.id || c.id === b.fatherId || c.id === b.motherId || (c.dynasty && c.fatherId && c.fatherId === b.fatherId) || b.childrenIds.includes(c.id);
      if (blood) c.ethnicity = place.ethnicity;
    }
  }

  /* ---- age, and everyone's age around him ---- */
  const age = o.age ?? base.age;
  if (age !== base.age) setAge(s, b, age);
  const parents = [b.fatherId, b.motherId].map((id) => (id ? s.characters[id] : undefined)).filter((c): c is Character => !!c);
  for (const p of parents) if (ageOn(p.birth, s.date) < age + 20) setAge(s, p, age + 22 + (p.gender === 'M' ? 3 : 0));
  for (const k of b.childrenIds.map((id) => s.characters[id]).filter(Boolean)) if (ageOn(k.birth, s.date) > age - 19) setAge(s, k, Math.max(0, age - 19));

  /* ---- traits and skills ---- */
  if (o.traits) b.traits = [...o.traits];
  const bg = o.background ? BACKGROUNDS.find((x) => x.id === o.background) : undefined;
  for (const k of SKILLS) {
    const d = (o.skills?.[k] ?? 0) + (place.skills[k] ?? 0) + (bg?.skills[k] ?? 0);
    b.attributes[k] = clamp(b.attributes[k] + d, 5, 95);
  }
  b.attrs = undefined;
  const x = ensureAttrs(s, b);
  for (const g of BUY_GROUPS) {
    const d = o.groups?.[g] ?? 0;
    if (d) for (const k of ATTR_GROUPS[g].keys) x.v[k] = clamp(x.v[k] + d, 0, 100);
  }
  for (const k of ALL_ATTRS) x.v[k] = clamp(x.v[k], 0, 100);

  /* ---- lifestyle and vice ---- */
  if (o.lifestyle && LIFESTYLES[o.lifestyle]) b.lifestyle = { focus: o.lifestyle, xp: 0, points: b.lifestyle?.points ?? 0, perks: b.lifestyle?.perks ?? [] };
  if (o.vice) b.vices = o.vice === 'none' ? [] : [o.vice];

  /* ---- where he was born ---- */
  const leader = (id: string) => s.rivals.find((r) => r.id === id)?.leaderId;
  switch (place.id) {
    case 'wildwood': s.heat.local = Math.max(0, s.heat.local - 3); break;
    case 'southphilly': { const l = leader('philly'); if (l) addOpinion(s, l, b.id, 'A South Philly kid', 10, 0); break; }
    case 'ac': { const l = leader('manno'); if (l) addOpinion(s, l, b.id, 'Grew up in Atlantic City', 5, 0); break; }
    case 'sicily': s.respect = Math.min(100, s.respect + 3); break;
    case 'les': { const l = leader('feldstein'); if (l) addOpinion(s, l, b.id, 'A Lower East Side boy', 10, 0); break; }
    case 'cork':
      for (const c of Object.values(s.characters)) if (c.alive && c.office && c.ethnicity === 'Irish') addOpinion(s, c.id, b.id, 'One of our own', 10, 0);
      break;
    default: break;
  }
  addStory(s, b, `Born in ${place.name}. ${place.text}`);

  /* ---- background: a bonus and a secret or a contact ---- */
  if (bg) {
    const hook = (c: Character | undefined, reason: string) => {
      if (!c) return;
      s.hooks.push({ id: `h${s.nextId++}`, holder: 'player', targetId: c.id, strong: false, reason, week: s.week });
    };
    switch (bg.id) {
      case 'numbers': { const c = official(s, 'Police sergeant'); if (c) addOpinion(s, c.id, b.id, 'Took your father\'s envelope for years', 20, 0); break; }
      case 'korea': { const c = official(s, 'Chief of Police'); if (c) addOpinion(s, c.id, b.id, 'A fellow Marine', 15, 0); break; }
      case 'docks': {
        const c = official(s, 'City councilman');
        if (c) { addSecret(s, c, 'skimming', ['player']); hook(c, 'Skims the pier contracts'); }
        break;
      }
      case 'boxer':
        s.respect = Math.min(100, s.respect + 3);
        for (const c of Object.values(s.characters)) if (c.alive && c.faction === 'player' && c.id !== b.id && !c.dynasty && c.rank !== 'civilian') addOpinion(s, c.id, b.id, 'Saw him fight at Convention Hall', 6, 0);
        break;
      case 'college': { const c = official(s, 'State assemblyman'); if (c) addOpinion(s, c.id, b.id, 'A Villanova classmate', 15, 0); break; }
      case 'altar': {
        const c = official(s, 'County judge');
        if (c) { addSecret(s, c, 'debt', ['player']); hook(c, 'Owes a bookmaker'); }
        break;
      }
    }
    addStory(s, b, `${bg.name}. ${bg.text}`);
  }
  const origin = nicknameOrigin(b.nickname);
  if (b.nickname && origin) addStory(s, b, `Called "${b.nickname}": ${origin}`);

  /* ---- family ---- */
  let sp = b.spouseId ? s.characters[b.spouseId] : undefined;
  const married = o.married ?? base.married;
  const kidsWanted = o.kids ?? base.kids;
  if (married) {
    if (!sp || !sp.alive) {
      if (sp) removeCharacter(s, sp.id);
      sp = makeCharacter(s, { gender: sex === 'M' ? 'F' : 'M', ethnicity: b.ethnicity, lastName: s.houseName, faction: 'player', dynasty: true, rank: 'civilian', age: Math.max(18, age - 3), nickname: false });
      sp.spouseId = b.id;
      b.spouseId = sp.id;
      addOpinion(s, sp.id, b.id, 'My spouse', 25, 0);
    }
    if (sp.gender === sex) {
      sp.gender = sex === 'M' ? 'F' : 'M';
      sp.firstName = nameFor(s, 'spouse', sp.gender, sp.ethnicity);
    }
    if (sp.gender === 'M') { sp.maidenName = undefined; sp.lastName = s.houseName; }
    if (o.spouseName?.trim()) sp.firstName = o.spouseName.trim();
    const spAge = ageOn(sp.birth, s.date);
    if (spAge > age + 12 || spAge < Math.max(18, age - 12)) setAge(s, sp, clamp(age + (sex === 'M' ? -3 : 3), 18, 90));
  } else if (sp) {
    const shared = kidsOf(s, b).length > 0 || kidsWanted > 0;
    if (shared) bury(s, sp, 2, sp.gender === 'F' ? 'complications after a long illness' : 'a heart attack');
    else { removeCharacter(s, sp.id); b.spouseId = undefined; sp = undefined; }
  }
  // Children: add or remove (youngest civilians first), then fix the links for a woman boss.
  let kids = kidsOf(s, b);
  if (kids.length > kidsWanted) {
    const spare = kids.filter((k) => k.rank === 'civilian').sort((a, c) => ageOn(a.birth, s.date) - ageOn(c.birth, s.date));
    for (const k of spare.slice(0, kids.length - kidsWanted)) removeCharacter(s, k.id);
  }
  kids = kidsOf(s, b);
  const kMax = Math.max(0, Math.min(age, sp && sp.alive ? ageOn(sp.birth, s.date) : age) - 19);
  for (let i = kids.length; i < kidsWanted; i++) {
    const g = hashSeed(`${s.seed}:kid:${i}`) % 2 ? 'M' : 'F';
    const k = makeCharacter(s, { gender: g, ethnicity: b.ethnicity, lastName: s.houseName, faction: 'player', dynasty: true, rank: 'civilian', age: hashSeed(`${s.seed}:kidage:${i}`) % (kMax + 1), nickname: false, wealth: 0 });
    k.ambition = g === 'M' ? 'Make the family proud' : 'Get off the island';
    b.childrenIds.push(k.id);
    if (sp) { sp.childrenIds.push(k.id); }
    k.fatherId = b.id;
    if (sp) k.motherId = sp.id;
    addOpinion(s, k.id, b.id, sex === 'M' ? 'My father' : 'My mother', 25, 0);
  }
  for (const k of kidsOf(s, b)) {
    if (sex === 'F') {
      k.motherId = b.id;
      k.fatherId = sp && sp.gender === 'M' ? sp.id : undefined;
    } else {
      k.fatherId = b.id;
      k.motherId = sp && sp.gender === 'F' ? sp.id : k.motherId;
    }
  }
  // The matriarch.
  const mother = b.motherId ? s.characters[b.motherId] : undefined;
  const wantMother = o.motherAlive ?? base.motherAlive;
  if (mother) {
    if (wantMother && !mother.alive) {
      mother.alive = true;
      mother.death = undefined;
      mother.health = Math.max(mother.health, 60);
      if (ageOn(mother.birth, s.date) > MOTHER_MAX_AGE) setAge(s, mother, MOTHER_MAX_AGE);
    } else if (!wantMother && mother.alive) bury(s, mother, 4, 'a stroke');
  }

  /* ---- difficulty ---- */
  if (o.hard) {
    s.money = Math.round(s.money * 0.6);
    s.debts.push({ id: `d${s.nextId++}`, lender: 'A Philadelphia shylock', principal: 6000, weeklyPayment: 200, weeksLeft: 40 });
    s.flags.hard = 1;
    s.flags.ironman = 1;
  }
  s.flags.custom_char = 1;
  if (bg) s.flags[`bg_${bg.id}`] = 1;
  s.flags[`born_${place.id}`] = 1;

  /* ---- the chronicle reads with the new name ---- */
  const newName = displayName(b);
  const fix = (t: string) => t.split(oldName).join(newName).split(`house of ${oldHouse}`).join(`house of ${house}`);
  for (const e of s.chronicle) e.text = fix(e.text);
  for (const e of s.dynastyHistory) e.text = fix(e.text);
}

/** A deterministic spouse first name (the creator's default). */
export function suggestSpouseName(salt: string, bossSex: 'M' | 'F', eth: Ethnicity = 'Italian'): string {
  const pool = bossSex === 'M' ? FEMALE_FIRST[eth] : MALE_FIRST[eth];
  return pool[hashSeed(`spouse:${salt}`) % pool.length];
}
