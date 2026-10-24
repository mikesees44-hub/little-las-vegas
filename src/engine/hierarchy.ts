import { ageOn } from './calendar';
import { capos, crew, displayName, hasTrait, isFree, makeCharacter, player } from './characters';
import { holder } from './council';
import { FEMALE_FIRST, MALE_FIRST } from './names';
import { addOpinion, opinion, setModifier } from './relations';
import { chance, pick, randInt, shuffle } from './rng';
import type { Character, Craft, CrewStats, GameState, Household, OutsideRole, PersonalGoal, Vice } from './types';

/**
 * The family tree: Boss → Underboss → Consigliere → Capos → each capo's
 * regime (soldiers, associates) → outside guys (bookies, fences, numbers
 * runners, cops and politicians on the pad).
 *
 * A man in a regime is loyal to his capo first: loyalty to the capo is his
 * opinion of the capo, loyalty to the boss his opinion of the boss — both
 * are ordinary named opinion modifiers, so every point has a reason.
 *
 * Invariants (checked by validateHierarchy, kept by tidyRegimes):
 *  - only soldiers, associates and outside guys have a capoId;
 *  - a capoId always points at a living capo of the player's family;
 *  - capos, the underboss, the consigliere and the boss report to nobody,
 *    so the chain of command can never loop.
 */

export const CRAFT_INFO: Record<Craft, { name: string; text: string }> = {
  muscle: { name: 'Muscle', text: 'Collections and intimidation. Draws the cops.' },
  earner: { name: 'Earner', text: 'Always has a hustle going. Brings in more.' },
  driver: { name: 'Driver', text: 'Knows every back road off the island.' },
  bookmaker: { name: 'Bookmaker', text: 'Takes action on the horses and the fights.' },
  collector: { name: 'Collector', text: 'Shylock collections. People pay him.' },
  burglar: { name: 'Second-story man', text: 'Summer cottages, jewel cases. Risky.' },
  talker: { name: 'Talker', text: 'Smooths things over with cops and bartenders.' },
};

export const GOAL_INFO: Record<PersonalGoal, string> = {
  get_made: 'Get made',
  own_bar: 'Own a bar of his own',
  become_capo: 'Run his own crew',
  get_out: 'Get out of the life',
  get_rich: 'Get rich',
  take_chair: 'Sit in the chair',
};

export const VICE_INFO: Record<Vice, string> = {
  horses: 'Plays the horses at Atlantic City Race Course',
  women: 'Keeps company he should not',
  booze: 'Drinks too much',
  cards: 'Cannot walk past a card game',
  debt: 'Lives beyond his means',
};

export const OUTSIDE_INFO: Record<OutsideRole, string> = {
  bookie: 'Bookie',
  fence: 'Fence',
  runner: 'Numbers runner',
  cop: 'Cop on the pad',
  politician: 'Politician on the pad',
};

const STORY_CAP = 10;

/* ---------------------------------------------------------------- */
/* Lookups                                                           */
/* ---------------------------------------------------------------- */

export function isMade(c: Character): boolean {
  return c.rank === 'soldier' || c.rank === 'capo' || c.rank === 'underboss' || c.rank === 'consigliere' || c.rank === 'boss';
}

/** A man who belongs in a regime (soldiers and associates; hired specialists report to the boss). */
export function inRegimeRank(c: Character): boolean {
  return (c.rank === 'soldier' || c.rank === 'associate') && !c.specialty;
}

export function validCapo(s: GameState, id: string | undefined): Character | undefined {
  const c = id ? s.characters[id] : undefined;
  return c && c.alive && c.faction === 'player' && c.rank === 'capo' && c.id !== s.playerId ? c : undefined;
}

/** Members of a capo's regime (made men and associates). */
export function regime(s: GameState, capoId: string): Character[] {
  const out: Character[] = [];
  for (const id in s.characters) {
    const c = s.characters[id];
    if (c.capoId === capoId && c.alive && c.faction === 'player' && c.id !== s.playerId && inRegimeRank(c)) out.push(c);
  }
  return out;
}

/** Regime sizes for every capo in one pass. */
export function regimeSizes(s: GameState): Map<string, number> {
  const m = new Map<string, number>();
  for (const id in s.characters) {
    const c = s.characters[id];
    if (c.capoId && c.alive && c.faction === 'player' && inRegimeRank(c)) m.set(c.capoId, (m.get(c.capoId) ?? 0) + 1);
  }
  return m;
}

/** Outside guys attached to a capo (or all of them). */
export function outsideGuys(s: GameState, capoId?: string): Character[] {
  return Object.values(s.characters).filter((c) => c.alive && c.outside && c.faction === 'none' && (capoId === undefined || c.capoId === capoId));
}

/** Men who report straight to the boss (unassigned soldiers/associates and hired specialists). */
export function unassigned(s: GameState): Character[] {
  return crew(s).filter((c) => (c.rank === 'soldier' || c.rank === 'associate') && !validCapo(s, c.capoId));
}

export function capoOf(s: GameState, c: Character): Character | undefined {
  return validCapo(s, c.capoId);
}

/** Loyalty to his capo (his opinion of him), or undefined if he has none. */
export function capoLoyalty(s: GameState, c: Character): number | undefined {
  const k = capoOf(s, c);
  return k ? opinion(s, c.id, k.id) : undefined;
}

export function bossLoyalty(s: GameState, c: Character): number {
  return opinion(s, c.id, s.playerId);
}

/** A capo's own treasury is his personal money. */
export function capoTreasury(c: Character): number {
  return c.wealth;
}

/** Share of the district take a capo kicks up (the contract), 0..1. */
export function kickupRate(c: Character): number {
  return 1 - (c.keep ?? 0.3);
}

export function crewStats(s: GameState): CrewStats {
  if (!s.crewStats) s.crewStats = { defections: 0, coups: 0, flips: 0, makings: 0, rivalCrewMoves: 0 };
  return s.crewStats;
}

export function bumpStat(s: GameState, k: keyof CrewStats): void {
  crewStats(s)[k] += 1;
}

/* ---------------------------------------------------------------- */
/* Personal chronicle                                                */
/* ---------------------------------------------------------------- */

export function addStory(s: GameState, c: Character | undefined, text: string): void {
  if (!c) return;
  const st = c.story ?? (c.story = []);
  st.push({ week: s.week, text });
  const cap = c.alive ? STORY_CAP : 5;
  if (st.length > cap) c.story = st.slice(st.length - cap);
}

/* ---------------------------------------------------------------- */
/* Assignment                                                        */
/* ---------------------------------------------------------------- */

/** Put a man in a capo's regime (or make him report to the boss). Opinion of the new capo starts from "my capo". */
export function assignTo(s: GameState, c: Character, capoId: string | undefined, why?: string): void {
  const prev = validCapo(s, c.capoId);
  const next = validCapo(s, capoId);
  if (prev?.id === next?.id && c.capoId === capoId) return;
  if (prev && prev.id !== next?.id) {
    setModifier(s, c.id, prev.id, 'My capo', 0);
    addOpinion(s, c.id, prev.id, 'My old capo', 4, 1);
  }
  c.capoId = next?.id;
  if (next) {
    setModifier(s, c.id, next.id, 'My capo', 10);
    if (why) addStory(s, c, why);
  }
}

/** The capo with the smallest regime (deterministic: ties go to the lowest id). */
export function smallestRegime(s: GameState, except?: string): Character | undefined {
  const sizes = regimeSizes(s);
  let best: Character | undefined;
  for (const c of capos(s)) {
    if (c.id === except) continue;
    if (!best) { best = c; continue; }
    const d = (sizes.get(c.id) ?? 0) - (sizes.get(best.id) ?? 0);
    if (d < 0 || (d === 0 && c.id < best.id)) best = c;
  }
  return best;
}

/**
 * Keep the tree valid: men of a dead, departed or demoted capo go to the
 * capo with the smallest regime; anyone who is no longer a soldier or an
 * associate stops reporting to a capo. Deterministic (no dice).
 */
export function tidyRegimes(s: GameState): void {
  for (const c of Object.values(s.characters)) {
    if (!c.capoId) continue;
    const ok = c.alive && ((c.faction === 'player' && inRegimeRank(c)) || (!!c.outside && c.faction === 'none'));
    if (!ok) {
      c.capoId = undefined;
      continue;
    }
    if (!validCapo(s, c.capoId)) {
      const to = smallestRegime(s);
      assignTo(s, c, to?.id, to ? `Moved to ${displayName(to)}'s crew when his old capo was gone.` : undefined);
      if (!to) c.capoId = undefined;
    }
  }
  // Men with no capo land in the smallest regime (new recruits, men coming home).
  for (const c of crew(s)) {
    if (!inRegimeRank(c) || c.capoId) continue;
    const to = smallestRegime(s);
    if (to) assignTo(s, c, to.id);
  }
  // Outside guys whose handler is gone get a new one.
  for (const o of Object.values(s.characters)) {
    if (!o.alive || !o.outside || o.faction !== 'none' || o.capoId) continue;
    const to = smallestRegime(s);
    if (to) o.capoId = to.id;
  }
}

/** When a capo dies, is jailed for good or walks out: a man of his own regime is the natural heir. */
export function heirFromRegime(s: GameState, capoId: string): Character | undefined {
  return regime(s, capoId).filter((c) => c.rank === 'soldier' && isFree(s, c) && !c.dynasty)
    .sort((a, b) => b.attributes.leadership + b.attributes.business - (a.attributes.leadership + a.attributes.business))[0];
}

/** Hand a whole regime to another capo. */
export function transferRegime(s: GameState, fromId: string, toId: string | undefined): number {
  let n = 0;
  for (const c of Object.values(s.characters)) {
    if (c.capoId !== fromId || !c.alive) continue;
    if (toId && c.id === toId) {
      c.capoId = undefined;
      continue;
    }
    if (c.outside) c.capoId = toId;
    else assignTo(s, c, toId, toId ? `Went to ${displayName(s.characters[toId])}'s crew.` : undefined);
    n++;
  }
  return n;
}

/** Integrity check for tests and the simulator. Empty = OK. */
export function validateHierarchy(s: GameState): string[] {
  const errs: string[] = [];
  for (const c of Object.values(s.characters)) {
    if (!c.alive || !c.capoId) continue;
    const k = s.characters[c.capoId];
    if (!k) errs.push(`${c.id} reports to missing ${c.capoId}`);
    else if (!k.alive) errs.push(`${c.id} reports to dead ${k.id}`);
    else if (k.rank !== 'capo') errs.push(`${c.id} reports to ${k.id} who is a ${k.rank}`);
    else if (k.faction !== 'player') errs.push(`${c.id} reports to ${k.id} who left the family`);
    if (c.faction === 'player' && !inRegimeRank(c)) errs.push(`${c.id} (${c.rank}) should report to nobody but the boss`);
    if (c.faction !== 'player' && !c.outside) errs.push(`${c.id} left the family but still reports to ${c.capoId}`);
    // Cycle check: walk up the chain.
    const seen = new Set<string>([c.id]);
    let cur: Character | undefined = c;
    for (let i = 0; i < 6 && cur?.capoId; i++) {
      if (seen.has(cur.capoId)) {
        errs.push(`cycle through ${cur.capoId}`);
        break;
      }
      seen.add(cur.capoId);
      cur = s.characters[cur.capoId];
    }
  }
  if (s.characters[s.playerId]?.capoId) errs.push('the boss reports to someone');
  return errs;
}

/* ---------------------------------------------------------------- */
/* Biographies                                                       */
/* ---------------------------------------------------------------- */

export function rollCraft(s: GameState, c: Character): Craft {
  const a = c.attributes;
  const opts: [Craft, number][] = [
    ['muscle', a.force * 1.2], ['earner', a.business * 1.1], ['driver', 40], ['bookmaker', a.business * 0.8 + (hasTrait(c, 'Gambler') ? 30 : 0)],
    ['collector', (a.force + a.business) / 2], ['burglar', a.intrigue * 0.7], ['talker', a.diplomacy * 0.9 + (hasTrait(c, 'Charming') ? 30 : 0)],
  ];
  opts.sort((x, y) => y[1] - x[1]);
  return pick(s, opts.slice(0, 3))[0];
}

export function rollGoal(s: GameState, c: Character): PersonalGoal {
  const a = ageOn(c.birth, s.date);
  if (c.rank === 'associate') return chance(s, 0.75) ? 'get_made' : chance(s, 0.5) ? 'get_rich' : 'own_bar';
  if (c.rank === 'capo' || c.rank === 'underboss') return hasTrait(c, 'Ambitious') ? 'take_chair' : a > 58 ? 'get_out' : pick(s, ['get_rich', 'get_rich', 'take_chair', 'own_bar'] as PersonalGoal[]);
  if (a > 54) return chance(s, 0.5) ? 'get_out' : 'get_rich';
  if (hasTrait(c, 'Ambitious')) return 'become_capo';
  return pick(s, ['become_capo', 'own_bar', 'get_rich', 'get_rich', a > 44 ? 'get_out' : 'own_bar'] as PersonalGoal[]);
}

export function rollVices(s: GameState, c: Character): Vice[] {
  const v: Vice[] = [];
  if (hasTrait(c, 'Gambler')) v.push(chance(s, 0.5) ? 'horses' : 'cards');
  if (hasTrait(c, 'Womanizer')) v.push('women');
  if (hasTrait(c, 'Drinker')) v.push('booze');
  if (v.length < 2 && chance(s, 0.18)) v.push(pick(s, ['horses', 'cards', 'debt', 'booze'] as Vice[]));
  return [...new Set(v)].slice(0, 2);
}

export function rollHousehold(s: GameState, c: Character): Household {
  const a = ageOn(c.birth, s.date);
  const h: Household = { kids: [] };
  if (c.gender !== 'M') return h;
  if (a >= 23 && chance(s, a >= 30 ? 0.8 : 0.45)) {
    h.wife = pick(s, FEMALE_FIRST[c.ethnicity]);
    const n = a < 26 ? randInt(s, 0, 1) : randInt(s, 0, 4);
    for (let i = 0; i < n; i++) {
      const maxAge = Math.max(0, Math.min(a - 21, 30));
      const male = chance(s, 0.52);
      h.kids.push({ name: pick(s, male ? MALE_FIRST[c.ethnicity] : FEMALE_FIRST[c.ethnicity]), male, born: s.date.y - randInt(s, 0, maxAge) });
    }
    h.kids.sort((x, y) => x.born - y.born);
  }
  return h;
}

/** Fill in who a man is: his craft, what he wants, his weaknesses, his family. */
export function giveBio(s: GameState, c: Character): void {
  if (!c.craft && c.rank !== 'boss') c.craft = rollCraft(s, c);
  if (!c.goal && c.rank !== 'boss') c.goal = rollGoal(s, c);
  if (!c.vices) c.vices = rollVices(s, c);
  if (!c.household && !c.dynasty) c.household = rollHousehold(s, c);
  if (c.evidence === undefined) c.evidence = c.rank === 'associate' ? randInt(s, 0, 6) : randInt(s, 2, 22);
  if (c.record === undefined) c.record = c.rank === 'associate' ? (chance(s, 0.3) ? 1 : 0) : randInt(s, 0, 3);
}

/** Kids of age to want in (18+, sons). */
export function grownSons(s: GameState, c: Character): { name: string; age: number }[] {
  return (c.household?.kids ?? []).filter((k) => k.male && s.date.y - k.born >= 18 && s.date.y - k.born <= 26).map((k) => ({ name: k.name, age: s.date.y - k.born }));
}

/* ---------------------------------------------------------------- */
/* Seeding the tree at the start of a game                           */
/* ---------------------------------------------------------------- */

const REGIME_REASONS: [string, number][] = [
  ['Brought me up on the street', 18], ['Stood up for me with the cops', 14], ['Took care of my family', 16],
  ['Never shorts my end', 10], ['Gave me my first piece of work', 12], ['Treats me like a dog', -12], ['Took credit for my score', -10],
];

const OUTSIDE_NAMES: Record<OutsideRole, string[]> = {
  bookie: ['takes action behind the cigar counter', 'runs a wire from his barbershop', 'books the fights out of a candy store'],
  fence: ['moves swag out of a pawn counter', 'buys anything that fell off a truck', 'runs a used-furniture lot nobody shops at'],
  runner: ['carries policy slips up Pacific Avenue', 'picks up numbers on the boardwalk', 'runs the numbers drop at the bus depot'],
  cop: ['walks a beat on Atlantic Avenue', 'works the desk at the Wildwood PD'],
  politician: ['sits on the zoning board', 'clerks for the county freeholders'],
};

export function makeOutsideGuy(s: GameState, role: OutsideRole, capoId?: string): Character {
  const eth = role === 'cop' || role === 'politician' ? 'Irish' : pick(s, ['Italian', 'Italian', 'Jewish', 'Irish'] as const);
  const c = makeCharacter(s, { rank: 'civilian', faction: 'none', ethnicity: eth, age: randInt(s, 26, 60), nickname: role !== 'cop' && role !== 'politician' && chance(s, 0.4) });
  c.outside = role;
  c.capoId = capoId;
  c.ambition = `Stay on the right side of everybody (${pick(s, OUTSIDE_NAMES[role])})`;
  c.vices = rollVices(s, c);
  c.household = rollHousehold(s, c);
  c.record = role === 'cop' || role === 'politician' ? 0 : randInt(s, 0, 2);
  c.evidence = randInt(s, 0, 10);
  if (role === 'cop') c.office = 'Patrolman';
  if (role === 'politician') c.office = 'Zoning board member';
  return c;
}

/**
 * Build regimes for a new game: spread the soldiers and associates among
 * the capos, give each man a story, a few named loyalties to his capo, and
 * hang a couple of outside guys off every regime. Also seeds an old beef
 * between two capos and puts a cop on the pad.
 */
export function seedHierarchy(s: GameState): void {
  const caps = capos(s).sort((a, b) => (a.id < b.id ? -1 : 1));
  const men = shuffle(s, crew(s).filter((c) => inRegimeRank(c)));
  men.forEach((m, i) => {
    if (!caps.length) return;
    const k = caps[i % caps.length];
    m.capoId = k.id;
    setModifier(s, m.id, k.id, 'My capo', 10);
    for (const [r, v] of shuffle(s, REGIME_REASONS).slice(0, randInt(s, 1, 2))) addOpinion(s, m.id, k.id, r, v + randInt(s, -4, 4), 0);
    addOpinion(s, k.id, m.id, 'One of my guys', randInt(s, 5, 20), 0);
  });
  for (const c of crew(s, true)) {
    giveBio(s, c);
    if (c.id !== s.playerId) addStory(s, c, startStory(s, c));
  }
  const roles: OutsideRole[] = ['bookie', 'fence', 'runner', 'bookie', 'runner', 'fence'];
  caps.forEach((k, i) => {
    makeOutsideGuy(s, roles[i % roles.length], k.id);
    if (chance(s, 0.6)) makeOutsideGuy(s, roles[(i + 3) % roles.length], k.id);
  });
  if (caps.length) {
    makeOutsideGuy(s, 'cop', caps[0].id);
    if (caps.length > 1) makeOutsideGuy(s, 'politician', caps[caps.length - 1].id);
  }
  // An old beef between two capos.
  if (caps.length >= 2) {
    const [a, b] = shuffle(s, caps).slice(0, 2);
    const why = pick(s, ['Who runs the jukebox route on Pacific Avenue', 'A 1957 score he says was his', 'Insulted his wife at a christening', 'Moved in on his bookmaker']);
    addOpinion(s, a.id, b.id, why, -randInt(s, 18, 35), 0);
    addOpinion(s, b.id, a.id, why, -randInt(s, 12, 28), 0);
    addStory(s, a, `Has not spoken to ${displayName(b)} since the argument over ${why.charAt(0).toLowerCase()}${why.slice(1)}.`);
  }
  if (!s.books) s.books = { open: false, slots: 0, nextChange: randInt(s, 6, 14) };
  crewStats(s);
}

function startStory(s: GameState, c: Character): string {
  const a = ageOn(c.birth, s.date);
  if (c.rank === 'capo') return `Has run a crew for the family since ${s.date.y - randInt(s, 2, 12)}.`;
  if (c.rank === 'underboss') return 'Second in command. Was with the old man before you.';
  if (c.rank === 'consigliere') return 'Has the boss\'s ear and the lawyers\' phone numbers.';
  if (c.rank === 'soldier') return `Took the oath in ${s.date.y - randInt(s, 1, Math.max(1, Math.min(20, a - 21)))}.`;
  return pick(s, ['Started running numbers for the crew as a kid.', 'Came over from South Philly last summer.', 'Drove for one of the capos before he was trusted with more.']);
}

/** The boss's own evidence file (what the Prosecutor and the FBI have on him). */
export function bossEvidence(s: GameState): number {
  return player(s).evidence ?? 0;
}

export function addEvidence(_s: GameState, c: Character | undefined, amount: number): number {
  if (!c) return 0;
  const before = c.evidence ?? 0;
  c.evidence = Math.max(0, Math.min(100, before + amount));
  return c.evidence - before;
}

/** The man who carries an order when it does not come from the boss himself. */
export function orderAgent(s: GameState, via: 'underboss' | 'capo'): Character | undefined {
  if (via === 'underboss') return holder(s, 'underboss') ?? crew(s).find((c) => c.rank === 'underboss' && isFree(s, c));
  return capos(s).filter((c) => isFree(s, c)).sort((a, b) => opinion(s, b.id, s.playerId) - opinion(s, a.id, s.playerId))[0];
}

/** Odds that an order passed down the chain is carried out as given (rest: distorted or ignored). */
export function obeyOdds(s: GameState, agent: Character): { obey: number; distort: number } {
  const op = opinion(s, agent.id, s.playerId);
  let obey = 0.6 + op / 160 + (agent.attributes.discipline - 50) / 250;
  if (hasTrait(agent, 'Loyal-to-a-fault')) obey += 0.15;
  if (hasTrait(agent, 'Hot-headed') || hasTrait(agent, 'Greedy')) obey -= 0.1;
  if (hasTrait(agent, 'Ambitious') && op < 20) obey -= 0.08;
  obey = Math.max(0.15, Math.min(0.95, obey));
  const disobey = Math.max(0.02, Math.min(0.4, (1 - obey) * (op < 0 ? 0.6 : 0.3)));
  return { obey, distort: Math.max(0, 1 - obey - disobey) };
}

/** True if the man carries the vice. */
export function hasVice(c: Character, v: Vice): boolean {
  return !!c.vices?.includes(v);
}

/** Living soldiers/associates/capos eligible to star in a crew event this week (per-character cooldown). */
export function available(s: GameState, c: Character, cooldown = 5): boolean {
  return c.alive && c.faction === 'player' && c.id !== s.playerId && isFree(s, c) && s.week - (c.lastAskWeek ?? -99) >= cooldown;
}
