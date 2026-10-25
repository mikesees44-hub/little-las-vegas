import { ageOn } from './calendar';
import { hasTrait } from './characters';
import { fam } from './familyState';
import { addStory } from './hierarchy';
import { chance } from './rng';
import { hashNoise, pw, type AttrGroup, type AttrKey, type ExtAttrs } from './powerState';
import type { Attributes, Character, GameState } from './types';

/**
 * Expanded attributes (design item 15): six groups, 38 values 0-100,
 * generated coherently from the six base skills and the traits, with
 * deterministic hash noise (seed + character + key), so the same seed always
 * gives the same people and no RNG stream is consumed.
 *
 * The six base skills stay the engine's currency. They are kept in sync:
 * every skill remembers its offset from its group's mean at generation, and
 * when the expanded values grow the skill follows (monthly, one point at a
 * time). Children inherit from both parents, and their upbringing
 * (education) is folded in when it is known.
 *
 * Skills GROW over time (item 18): jobs, mentorship, education, running
 * businesses, council seats and life events (see `growthMonth`).
 */

export const ATTR_GROUPS: Record<AttrGroup, { name: string; keys: AttrKey[] }> = {
  intelligence: { name: 'Intelligence', keys: ['intelligence', 'knowledge', 'memory', 'strategy', 'judgment', 'learning'] },
  social: { name: 'Social', keys: ['charisma', 'interpersonal', 'persuasion', 'empathy', 'humor', 'negotiation', 'manipulation'] },
  criminal: { name: 'Criminal', keys: ['streetSmarts', 'stealth', 'discretion', 'experience', 'awareness', 'survival'] },
  leadership: { name: 'Leadership', keys: ['command', 'organization', 'delegation', 'decisiveness', 'conflict'] },
  business: { name: 'Business', keys: ['finance', 'entrepreneurship', 'management', 'earning', 'investment'] },
  personality: { name: 'Personality', keys: ['ambition', 'greed', 'pride', 'loyalty', 'patience', 'courage', 'jealousy', 'impulsiveness', 'conscience'] },
};
export const GROUP_IDS = Object.keys(ATTR_GROUPS) as AttrGroup[];
export const ALL_ATTRS: AttrKey[] = GROUP_IDS.flatMap((g) => ATTR_GROUPS[g].keys);

export const ATTR_LABEL: Record<AttrKey, string> = {
  intelligence: 'Intelligence', knowledge: 'Knowledge', memory: 'Memory', strategy: 'Strategy', judgment: 'Judgment', learning: 'Learning',
  charisma: 'Charisma', interpersonal: 'Interpersonal', persuasion: 'Persuasion', empathy: 'Empathy', humor: 'Humor', negotiation: 'Negotiation', manipulation: 'Manipulation',
  streetSmarts: 'Street smarts', stealth: 'Stealth', discretion: 'Discretion', experience: 'Experience', awareness: 'Awareness', survival: 'Survival instinct',
  command: 'Command', organization: 'Organization', delegation: 'Delegation', decisiveness: 'Decisiveness', conflict: 'Conflict resolution',
  finance: 'Finance', entrepreneurship: 'Entrepreneurship', management: 'Management', earning: 'Earning', investment: 'Investment',
  ambition: 'Ambition', greed: 'Greed', pride: 'Pride', loyalty: 'Loyalty', patience: 'Patience', courage: 'Courage', jealousy: 'Jealousy', impulsiveness: 'Impulsiveness', conscience: 'Conscience',
};

type Skill = keyof Attributes;
/** Which expanded values each base skill follows. */
export const SKILL_FROM: Record<Skill, AttrKey[]> = {
  leadership: ['command', 'organization', 'decisiveness', 'strategy'],
  business: ['finance', 'entrepreneurship', 'management', 'earning', 'investment'],
  diplomacy: ['charisma', 'interpersonal', 'persuasion', 'negotiation'],
  intrigue: ['manipulation', 'stealth', 'awareness', 'memory'],
  force: ['courage', 'streetSmarts', 'survival'],
  discipline: ['discretion', 'patience', 'judgment'],
};
const SKILLS = Object.keys(SKILL_FROM) as Skill[];

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

function t(c: Character, trait: Character['traits'][number], v: number): number {
  return hasTrait(c, trait) ? v : 0;
}

/** The coherent base value of each expanded attribute from skills, traits, rank and age. */
function baseValues(s: GameState, c: Character): Record<AttrKey, number> {
  const a = c.attributes;
  const age = ageOn(c.birth, s.date);
  const inLife = c.rank !== 'civilian' || !!c.outside;
  const avg = (...xs: number[]) => xs.reduce((x, y) => x + y, 0) / xs.length;
  return {
    intelligence: avg(a.intrigue, a.business, a.leadership),
    knowledge: avg(a.business, a.diplomacy) + Math.min(10, age / 6),
    memory: a.intrigue,
    strategy: avg(a.leadership, a.intrigue),
    judgment: avg(a.discipline, a.diplomacy),
    learning: avg(a.business, a.intrigue, a.diplomacy) - Math.max(0, age - 45) / 3,
    charisma: a.diplomacy + t(c, 'Charming', 10),
    interpersonal: a.diplomacy + t(c, 'Paranoid', -8),
    persuasion: avg(a.diplomacy, a.intrigue),
    empathy: a.diplomacy + t(c, 'Cruel', -25) + t(c, 'Pious', 10) + t(c, 'Honest', 5),
    humor: a.diplomacy + t(c, 'Charming', 8) + t(c, 'Paranoid', -10),
    negotiation: avg(a.diplomacy, a.business),
    manipulation: a.intrigue + t(c, 'Honest', -15) + t(c, 'Charming', 6),
    streetSmarts: avg(a.intrigue, a.force) + (inLife ? 6 : -10),
    stealth: a.intrigue + t(c, 'Hot-headed', -8),
    discretion: a.discipline + t(c, 'Paranoid', 8) + t(c, 'Womanizer', -10) + t(c, 'Drinker', -12),
    experience: 20 + Math.min(50, Math.max(0, age - 16) * 1.6) + (inLife ? 10 : -10),
    awareness: a.intrigue + t(c, 'Paranoid', 12),
    survival: avg(a.force, a.intrigue) + t(c, 'Cowardly', 8) + t(c, 'Paranoid', 6),
    command: a.leadership,
    organization: avg(a.leadership, a.discipline),
    delegation: a.leadership + t(c, 'Paranoid', -15),
    decisiveness: avg(a.leadership, a.force) + t(c, 'Cowardly', -20) + t(c, 'Hot-headed', 8),
    conflict: avg(a.diplomacy, a.leadership) + t(c, 'Hot-headed', -15) + t(c, 'Patient', 8),
    finance: a.business,
    entrepreneurship: a.business + t(c, 'Ambitious', 8),
    management: avg(a.business, a.discipline),
    earning: a.business + t(c, 'Greedy', 8),
    investment: a.business + t(c, 'Gambler', -18) + t(c, 'Patient', 8),
    ambition: 40 + t(c, 'Ambitious', 30) + t(c, 'Loyal-to-a-fault', -15) + (c.goal === 'take_chair' ? 15 : c.goal === 'become_capo' ? 8 : c.goal === 'get_out' ? -15 : 0),
    greed: 35 + t(c, 'Greedy', 35) + t(c, 'Honest', -25),
    pride: 45 + t(c, 'Hot-headed', 10) + t(c, 'Vengeful', 12) + t(c, 'Charming', 5) + t(c, 'Cowardly', -10),
    loyalty: 55 + t(c, 'Loyal-to-a-fault', 35) + t(c, 'Ambitious', -15) + t(c, 'Greedy', -10) + t(c, 'Honest', 5),
    patience: 50 + t(c, 'Patient', 30) + t(c, 'Hot-headed', -25) + t(c, 'Gambler', -5),
    courage: 45 + a.force / 5 + t(c, 'Cowardly', -30) + t(c, 'Hot-headed', 10),
    jealousy: 35 + t(c, 'Vengeful', 20) + t(c, 'Paranoid', 15) + t(c, 'Ambitious', 8),
    impulsiveness: 40 + t(c, 'Hot-headed', 30) + t(c, 'Gambler', 15) + t(c, 'Drinker', 8) + t(c, 'Patient', -20),
    conscience: 50 + t(c, 'Pious', 25) + t(c, 'Honest', 20) + t(c, 'Cruel', -35) + t(c, 'Greedy', -8),
  };
}

/** Upbringing bonuses by education kind (applied once, scaled by tier 1-4). */
export const UPBRINGING: Record<string, Partial<Record<AttrKey, number>>> = {
  home: { empathy: 4, loyalty: 6, humor: 3 },
  priest: { conscience: 10, learning: 4, discretion: 3 },
  capo: { streetSmarts: 8, courage: 4, experience: 5, conscience: -6 },
  penn: { knowledge: 10, finance: 6, learning: 6, negotiation: 3 },
  military: { organization: 6, courage: 6, command: 4, impulsiveness: -6 },
};

function generate(s: GameState, c: Character): ExtAttrs {
  const base = baseValues(s, c);
  const v = {} as Record<AttrKey, number>;
  const father = c.fatherId ? s.characters[c.fatherId] : undefined;
  const mother = c.motherId ? s.characters[c.motherId] : undefined;
  const fv = father?.attrs?.v;
  const mv = mother?.attrs?.v;
  for (const k of ALL_ATTRS) {
    let x = base[k] + hashNoise(s.seed, c.id, k) * 12;
    // Inheritance: a child takes after both parents (temperament more than learning).
    if (fv || mv) {
      const pv = fv && mv ? (fv[k] + mv[k]) / 2 : (fv ?? mv)![k];
      const w = ATTR_GROUPS.personality.keys.includes(k) ? 0.4 : 0.3;
      x = x * (1 - w) + pv * w;
    }
    v[k] = clamp(x);
  }
  const off: Record<string, number> = {};
  for (const sk of SKILLS) off[sk] = Math.round(c.attributes[sk] - mean(v, SKILL_FROM[sk])) || 0;
  return { v, off };
}

function mean(v: Record<AttrKey, number>, keys: AttrKey[]): number {
  return keys.reduce((a, k) => a + v[k], 0) / keys.length;
}

/** The expanded attributes of a character (generated on first use). */
export function ensureAttrs(s: GameState, c: Character): ExtAttrs {
  if (!c.attrs) c.attrs = generate(s, c);
  return c.attrs;
}

/** Read without generating (UI on a frozen state): returns a fresh copy if absent. */
export function viewAttrs(s: GameState, c: Character): ExtAttrs {
  return c.attrs ?? generate(s, c);
}

/** Read one value (pure: never stores a generated set). */
export function attr(s: GameState, c: Character, k: AttrKey): number {
  return viewAttrs(s, c).v[k];
}

export function groupScore(s: GameState, c: Character, g: AttrGroup): number {
  const v = viewAttrs(s, c).v;
  return Math.round(mean(v, ATTR_GROUPS[g].keys));
}

/** Raise (or lower) one expanded value. Returns what was applied. */
export function growAttr(s: GameState, c: Character, k: AttrKey, amount: number): number {
  const x = ensureAttrs(s, c);
  const before = x.v[k];
  // Diminishing returns at the top.
  const step = amount > 0 && before >= 85 ? Math.max(0, amount - 1) : amount;
  x.v[k] = clamp(before + step);
  return x.v[k] - before;
}

/** Keep the six base skills in step with their expanded values (one point a month). */
export function syncSkills(s: GameState, c: Character): void {
  const x = ensureAttrs(s, c);
  for (const sk of SKILLS) {
    const target = mean(x.v, SKILL_FROM[sk]) + (x.off[sk] ?? 0);
    const d = target - c.attributes[sk];
    if (d >= 3) c.attributes[sk] = clamp(c.attributes[sk] + 1);
    else if (d <= -3) c.attributes[sk] = clamp(c.attributes[sk] - 1);
  }
}

/** Write an achievement on his record. */
export function addSuccess(s: GameState, c: Character | undefined, text: string): void {
  if (!c) return;
  if (!c.success) c.success = [];
  if (c.success.some((e) => e.text === text)) return;
  c.success.push({ week: s.week, text });
  if (c.success.length > 20) c.success = c.success.slice(-20);
}

/* ------------------------------------------------------------------ */
/* Growth (item 18)                                                    */
/* ------------------------------------------------------------------ */

/** Posts a protégé can be placed in to learn, and what each one builds. */
export const POSTS: Record<string, { name: string; text: string; keys: AttrKey[]; mentorSeat?: 'consigliere' | 'underboss' | 'bagman' | 'fixer' | 'enforcer'; cost: number }> = {
  hotel: { name: 'Run the hotel', text: 'The front desk of the family motel: books, staff, guests who must never know.', keys: ['management', 'earning', 'interpersonal', 'entrepreneurship'], cost: 0 },
  consigliere: { name: 'Sit with the consigliere', text: 'Learns judgment at the consigliere\'s elbow: who to trust, when to wait.', keys: ['judgment', 'strategy', 'negotiation', 'discretion'], mentorSeat: 'consigliere', cost: 0 },
  street: { name: 'Work the street with the underboss', text: 'Collections, corners and men: command learned the hard way.', keys: ['command', 'streetSmarts', 'courage', 'decisiveness'], mentorSeat: 'underboss', cost: 0 },
  books: { name: 'Keep the books with the bagman', text: 'Counts the envelopes and learns where money hides.', keys: ['finance', 'investment', 'memory', 'organization'], mentorSeat: 'bagman', cost: 0 },
  cityhall: { name: 'Carry envelopes to City Hall', text: 'Lunches with the fixer and the councilmen: persuasion and favors.', keys: ['persuasion', 'negotiation', 'charisma', 'knowledge'], mentorSeat: 'fixer', cost: 0 },
};

const JOB: Partial<Record<Character['rank'], AttrKey[]>> = {
  associate: ['streetSmarts', 'experience'],
  soldier: ['streetSmarts', 'experience', 'courage'],
  capo: ['command', 'organization', 'delegation', 'earning'],
  underboss: ['command', 'organization', 'conflict', 'strategy'],
  consigliere: ['judgment', 'negotiation', 'strategy'],
  boss: ['command', 'strategy', 'decisiveness'],
};
const CRAFT: Record<string, AttrKey[]> = {
  muscle: ['courage'], earner: ['earning'], driver: ['awareness'], bookmaker: ['finance'], collector: ['streetSmarts'], burglar: ['stealth'], talker: ['persuasion'],
};
const SEAT_GROWTH: Record<string, AttrKey[]> = {
  underboss: ['command'], consigliere: ['judgment'], bagman: ['finance'], enforcer: ['courage'], fixer: ['negotiation'],
};

/** Everyone whose attributes grow: the crew and the grown house. */
export function trackedPeople(s: GameState): Character[] {
  const out: Character[] = [];
  for (const id in s.characters) {
    const c = s.characters[id];
    if (!c.alive) continue;
    if ((c.faction === 'player' && c.rank !== 'civilian') || (c.dynasty && ageOn(c.birth, s.date) >= 12)) out.push(c);
  }
  return out;
}

/**
 * Monthly growth. Returns protégés whose following has grown enough to be
 * worth a line in the log ("the danger: a successful protégé gains money and
 * followers").
 */
export function growthMonth(s: GameState): string[] {
  const p = pw(s);
  const h = p; // the power stream
  const notes: string[] = [];
  const seats = s.council ?? {};
  const seatOf = (id: string) => (Object.keys(seats) as (keyof typeof seats)[]).find((k) => seats[k]?.holderId === id);
  const staffed = new Set<string>();
  for (const b of s.businesses) if (b.owner === 'player') for (const id of b.staffIds ?? []) staffed.add(id);
  for (const c of trackedPeople(s)) {
    const x = ensureAttrs(s, c);
    const age = ageOn(c.birth, s.date);
    const tryGrow = (keys: AttrKey[] | undefined, p0: number) => {
      for (const k of keys ?? []) if (chance(h, p0)) growAttr(s, c, k, 1);
    };
    // The job teaches.
    tryGrow(JOB[c.rank], 0.12);
    if (c.craft) tryGrow(CRAFT[c.craft], 0.15);
    const seat = seatOf(c.id);
    if (seat) tryGrow(SEAT_GROWTH[seat], 0.2);
    if (staffed.has(c.id)) tryGrow(['management', 'earning'], 0.15);
    // Education, for the young of the house.
    const fp = c.dynasty ? s.dyn?.people[c.id] : undefined;
    if (fp?.guardian && age < 18) tryGrow(age < 14 ? ['learning', 'memory'] : ['knowledge', 'learning'], 0.15);
    if (fp?.education && x.up !== fp.education.kind) {
      for (const [k, v] of Object.entries(UPBRINGING[fp.education.kind] ?? {})) growAttr(s, c, k as AttrKey, Math.round((v as number) * (0.6 + fp.education.tier * 0.2)));
      x.up = fp.education.kind;
    }
    // Life: years in the life, a man calms down with age.
    if (age >= 18 && c.rank !== 'civilian' && chance(h, 0.12)) growAttr(s, c, 'experience', 1);
    if (age >= 40 && chance(h, 0.05)) { growAttr(s, c, 'patience', 1); growAttr(s, c, 'impulsiveness', -1); }
    // Mentorship: a protégé placed in a post.
    const pl = p.placements[c.id];
    if (pl) {
      const post = POSTS[pl.post];
      const mentor = pl.mentorId ? s.characters[pl.mentorId] : undefined;
      const mentorBonus = mentor?.alive ? Math.max(0, (groupScore(s, mentor, 'leadership') + groupScore(s, mentor, 'intelligence')) / 2 - 50) / 100 : 0;
      tryGrow(post?.keys, 0.4 + mentorBonus);
      // The danger: a protégé who does well gets rich and gathers men.
      const shine = (x.v.charisma + x.v.command + x.v.earning) / 3;
      if (shine > 55 && chance(h, 0.3)) {
        x.followers = Math.min(30, (x.followers ?? 0) + 1);
        c.wealth += Math.round(shine * 8);
        if ((x.followers ?? 0) % 5 === 0) {
          const text = `${c.firstName} ${c.lastName} has ${x.followers} men who would follow him now.`;
          notes.push(text);
          addStory(s, c, `Gathered a following of ${x.followers} men.`);
        }
      }
    } else if (c.rank === 'capo' && x.v.charisma > 65 && chance(h, 0.08)) {
      x.followers = Math.min(20, (x.followers ?? 0) + 1);
    }
    syncSkills(s, c);
  }
  return notes;
}

export function placementPost(s: GameState, charId: string): string | undefined {
  return s.power?.placements[charId]?.post;
}

/** People whose upbringing is recorded (for the sheet). */
export function upbringingOf(s: GameState, c: Character): string | undefined {
  return c.dynasty ? fam(s, c.id).education?.kind : undefined;
}
