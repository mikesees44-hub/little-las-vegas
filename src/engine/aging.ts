import { growAttr } from './attrs';
import { ageOn } from './calendar';
import { crew, displayName, hasTrait, player } from './characters';
import { fam } from './familyState';
import type { Ctx } from './ledger';
import { addOpinion, opinion } from './relations';
import { paternityRumored } from './romance';
import { chance, hashSeed, type RngHolder } from './rng';
import type { Attributes, Character, Effect, EventInstance, GameState } from './types';

/**
 * AGING & LIFE TRAITS (CK3-style, adapted; spec AGING_TRAITS.md).
 *
 * Old-age traits come on progressively, each person on his own seeded
 * schedule, and take away from the six skills, health, fear, attraction and
 * stress. They are game mechanics, not medical advice: plain words, nothing
 * graphic.
 *
 *  - Infirm (1-3), Clouded Eyes (1-3, then Blind), Fragile Bones (1-3),
 *    Withering Mind (1-3, then Incapable), Faltering Heart (1-3, then death).
 *  - Incapable: every skill counts as 0; a boss needs someone to act for him.
 *  - Seasoned: the good side of age (judgment, a cooler head).
 *
 * LEARNED vs EFFECTIVE skills. `c.attributes` is what the rest of the engine
 * reads, so it holds the EFFECTIVE value. The learned value lives here
 * (`p.learned`) while anything takes away from it. Any change other code
 * makes to `c.attributes` between months (an event's +2, growth) is carried
 * into the learned value when the month settles, so nothing is lost.
 *
 * PRIVACY. The player knows his own conditions once the doctor names them
 * (before that he only feels the symptoms). He learns other people's through
 * what he sees and what is said (rumor → known), never by default.
 *
 * Family & earned traits: Bastard, Legitimized, Disinherited, Shamed,
 * Disputed Heritage, Twin, Loyal, Disloyal, Veteran, Former Boss. Most are
 * read off records the game already keeps; the rest are stored as tags.
 *
 * State lives on `s.aging` (optional; created by the monthly update, so a
 * load never changes anything) with its own dice (`aging.rng`).
 */

export type OldTrait = 'infirm' | 'eyes' | 'bones' | 'mind' | 'heart' | 'incapable';
export const OLD_TRAITS: OldTrait[] = ['infirm', 'eyes', 'bones', 'mind', 'heart', 'incapable'];
type Skill = keyof Attributes;
export const SKILLS: Skill[] = ['leadership', 'business', 'diplomacy', 'intrigue', 'force', 'discipline'];

export const OLD_INFO: Record<OldTrait, { name: string; levels: string[]; max: number; text: string; symptom: string[] }> = {
  infirm: {
    name: 'Infirm', levels: ['Infirm', 'Infirm 2', 'Infirm 3'], max: 3,
    text: 'The body slows: less muscle, less charm and business stamina; fear of him fades faster; a little worse health.',
    symptom: ['Stairs take longer than they used to.', 'You sat down halfway along the boardwalk.', 'Your hands are not as steady as they were.'],
  },
  eyes: {
    name: 'Clouded Eyes', levels: ['Clouded Eyes', 'Clouded Eyes 2', 'Clouded Eyes 3', 'Blind'], max: 4,
    text: 'The eyes go: less muscle and less intrigue (he misses things); at the end, blind.',
    symptom: ['The newspaper is held at arm\'s length now.', 'You did not recognize a man across the street until he spoke.', 'The headlights at night are all halos.'],
  },
  bones: {
    name: 'Fragile Bones', levels: ['Fragile Bones', 'Fragile Bones 2', 'Fragile Bones 3'], max: 3,
    text: 'A fall would be serious: less muscle, a shorter life, and men who mean him harm find it easier.',
    symptom: ['A small slip on the steps hurt for a week.', 'Your back aches in the mornings.', 'You move carefully now, and people notice.'],
  },
  mind: {
    name: 'Withering Mind', levels: ['Withering Mind', 'Withering Mind 2', 'Withering Mind 3'], max: 3,
    text: 'Memory slips: every skill loses about 8% a stage, he learns less and stress weighs more. At the end, he is incapable.',
    symptom: ['You walked into the kitchen and forgot why.', 'You called a capo by his father\'s name.', 'You told the same story twice at dinner.'],
  },
  heart: {
    name: 'Faltering Heart', levels: ['Faltering Heart', 'Faltering Heart 2', 'Faltering Heart 3'], max: 3,
    text: 'The heart works too hard: stress builds faster and lifts slower, a little worse health. Past the last stage, it stops.',
    symptom: ['Your chest was tight on the stairs.', 'You woke up short of breath.', 'Your ankles are swollen by evening.'],
  },
  incapable: {
    name: 'Incapable', levels: ['Incapable'], max: 1,
    text: 'Can no longer run his own affairs: every skill counts as 0, no council seat, no children, not in the line of succession. A boss needs someone to act for him.',
    symptom: ['The days run together.'],
  },
};

export type LifeTag = 'disinherited' | 'shamed' | 'disputed' | 'veteran' | 'formerBoss' | 'loyal' | 'disloyal';
export type LifeTrait = LifeTag | 'bastard' | 'legitimized' | 'twin' | 'seasoned';
export const LIFE_INFO: Record<LifeTrait, { name: string; text: string; good: boolean }> = {
  bastard: { name: 'Bastard', text: 'Born outside a marriage. Cannot inherit unless legitimized.', good: false },
  legitimized: { name: 'Legitimized', text: 'Born outside a marriage, recognized by the family: in the line of succession.', good: true },
  disinherited: { name: 'Disinherited', text: 'Put out of the line by the head of the family. Cannot inherit.', good: false },
  shamed: { name: 'Shamed', text: 'Denounced by the family: −10 as a candidate for the chair; people think less of him.', good: false },
  disputed: { name: 'Disputed Heritage', text: 'People say his father was another man. Last in line among his equals; −6 as a candidate.', good: false },
  twin: { name: 'Twin', text: 'Born the same day as a brother or sister. The elder by minutes comes first in line.', good: true },
  loyal: { name: 'Loyal', text: 'Years of service without a wrong word: +3 as a candidate, and the men know it. Earned.', good: true },
  disloyal: { name: 'Disloyal', text: 'Was seen with the other side, or went with a usurper. Remembered. −5 as a candidate.', good: false },
  veteran: { name: 'Veteran', text: 'A long time in the life: +3 as a candidate for the chair.', good: true },
  formerBoss: { name: 'Former Boss', text: 'Once sat in the chair. Keeps some of the men\'s respect: +6 as a voice in the family.', good: true },
  seasoned: { name: 'Seasoned', text: 'Age has its gifts: +2 diplomacy, +2 discipline (better judgment, a cooler head).', good: true },
};

export interface AgingPerson {
  /** Old-age traits and their stage (1..max). */
  t: Partial<Record<OldTrait, number>>;
  /** Week each trait reached its current stage. */
  at: Partial<Record<OldTrait, number>>;
  /** The learned skills, kept while anything takes away from them. */
  learned?: Attributes;
  /** The effective skills last written to `c.attributes`. */
  eff?: Attributes;
  /** The person himself knows these (the doctor named them). */
  dx?: OldTrait[];
  /** What the player has heard about this person ('rumor') or knows ('known'). */
  heard?: Partial<Record<OldTrait, 'rumor' | 'known'>>;
  /** Last doctor visit (week): slows things down for half a year. */
  care?: number;
  /** About the player: which conditions the crew talks about. */
  talk?: OldTrait[];
}

export interface AgingState {
  v: 1;
  rng: number;
  p: Record<string, AgingPerson>;
  /** Stored family & earned traits. */
  tags: Record<string, LifeTag[]>;
  /** Who acts for an incapable boss ('ub' = the underboss's acting authority, 'heir', or none). */
  regent?: { mode: 'ub' | 'heir' | 'none'; id?: string; since: number };
  stats: { onsets: number; stages: number; incapable: number; heartDeaths: number; diagnosed: number; rumors: number };
}

export type AgingOp =
  | { k: 'checkup'; charId: string }
  | { k: 'tag'; charId: string; tag: LifeTag; remove?: boolean }
  | { k: 'regent'; mode: 'ub' | 'heir' | 'none' };

export function ensureAging(s: GameState): AgingState {
  if (!s.aging) s.aging = { v: 1, rng: hashSeed(`${s.seed}:aging`), p: {}, tags: {}, stats: { onsets: 0, stages: 0, incapable: 0, heartDeaths: 0, diagnosed: 0, rumors: 0 } };
  return s.aging;
}

const EMPTY: AgingPerson = { t: {}, at: {} };
/** Read-only (safe in the UI). */
export function agingOf(s: GameState, id: string): AgingPerson {
  return s.aging?.p[id] ?? EMPTY;
}
function mut(s: GameState, id: string): AgingPerson {
  const A = ensureAging(s);
  return (A.p[id] ??= { t: {}, at: {} });
}

export function lvl(s: GameState, id: string, t: OldTrait): number {
  return s.aging?.p[id]?.t[t] ?? 0;
}
export function isIncapable(s: GameState, id: string): boolean {
  return lvl(s, id, 'incapable') > 0;
}
export function isBlind(s: GameState, id: string): boolean {
  return lvl(s, id, 'eyes') >= 4;
}
export function traitLabel(t: OldTrait, level: number): string {
  const L = OLD_INFO[t].levels;
  return L[Math.max(0, Math.min(L.length - 1, level - 1))];
}

/* ------------------------------------------------------------------ */
/* Onset: each person on his own schedule                              */
/* ------------------------------------------------------------------ */

function noise(s: GameState, id: string, key: string): number {
  return (hashSeed(`${s.seed}:old:${id}:${key}`) % 2001) / 1000 - 1;
}

/** The age at which a trait first shows for this person (seeded, shaped by health and habits). */
export function onsetAge(s: GameState, c: Character, t: Exclude<OldTrait, 'incapable'>): number {
  const n = noise(s, c.id, t);
  const g = fam(s, c.id).congenital;
  let a = { infirm: 67 + 7 * n, eyes: 69 + 8 * n, bones: 71 + 8 * n, mind: 74 + 9 * n, heart: 66 + 8 * n }[t];
  if (t === 'mind' && hashSeed(`${s.seed}:old:${c.id}:mindgene`) % 100 >= 55) a += 15;
  if (t === 'bones' && c.gender === 'F') a -= 4;
  if (t === 'heart') a += c.conditions.includes('Bad heart') ? -6 : c.health >= 70 ? 4 : 0;
  if (hasTrait(c, 'Drinker') && t !== 'eyes' && t !== 'bones') a -= 3;
  if (g.includes('Sickly')) a -= 3;
  if (g.includes('Strong') && (t === 'infirm' || t === 'bones')) a += 3;
  return Math.round(a * 10) / 10;
}

function drinks(c: Character): boolean {
  return hasTrait(c, 'Drinker') || c.conditions.includes("Drinker's liver") || !!c.vices?.includes('booze');
}

/* ------------------------------------------------------------------ */
/* Effective skills                                                    */
/* ------------------------------------------------------------------ */

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

/** Flat and multiplicative changes per skill, with the reasons (for "78 learned → 65 effective: Withering Mind 2"). */
export function skillMods(s: GameState, c: Character): Record<Skill, { flat: number; mult: number; why: string[] }> {
  const out = {} as Record<Skill, { flat: number; mult: number; why: string[] }>;
  for (const k of SKILLS) out[k] = { flat: 0, mult: 1, why: [] };
  const P = s.aging?.p[c.id];
  const add = (k: Skill, v: number, why: string) => { if (v) { out[k].flat += v; out[k].why.push(why); } };
  const T = P?.t ?? {};
  if (T.incapable) {
    for (const k of SKILLS) { out[k].mult = 0; out[k].why.push('Incapable'); }
    return out;
  }
  if (T.infirm) { const L = T.infirm; const w = traitLabel('infirm', L); add('diplomacy', -3 * L, w); add('force', -6 * L, w); add('business', -2 * L, w); }
  if (T.eyes) {
    const L = T.eyes; const w = traitLabel('eyes', L);
    if (L >= 4) { add('force', -25, w); add('intrigue', -15, w); add('business', -5, w); }
    else { add('force', -4 * L, w); add('intrigue', -3 * L, w); }
  }
  if (T.bones) add('force', -4 * T.bones, traitLabel('bones', T.bones));
  if (T.heart) add('force', -2 * T.heart, traitLabel('heart', T.heart));
  if (seasoned(s, c)) { add('diplomacy', 2, 'Seasoned'); add('discipline', 2, 'Seasoned'); }
  if (T.mind) for (const k of SKILLS) { out[k].mult *= 1 - 0.08 * T.mind; out[k].why.push(traitLabel('mind', T.mind)); }
  return out;
}

export function effectiveFrom(s: GameState, c: Character, learned: Attributes): Attributes {
  const m = skillMods(s, c);
  const e = {} as Attributes;
  for (const k of SKILLS) e[k] = clamp(Math.floor((learned[k] + m[k].flat) * m[k].mult + 1e-9));
  return e;
}

/** The learned skills (what he knows how to do), whatever is taking away from them. */
export function learnedSkills(s: GameState, c: Character): Attributes {
  return s.aging?.p[c.id]?.learned ?? c.attributes;
}

/** The record attrs.ts grows the skills on (the learned values when aging holds them). */
export function skillBase(s: GameState, c: Character): Attributes {
  return s.aging?.p[c.id]?.learned ?? c.attributes;
}

/** Carry outside changes into the learned skills, then write the effective ones. */
export function settleSkills(s: GameState, c: Character): void {
  const P = s.aging?.p[c.id];
  const learned: Attributes = P?.learned ? { ...P.learned } : { ...c.attributes };
  if (P?.learned && P.eff) for (const k of SKILLS) learned[k] = clamp(learned[k] + (c.attributes[k] - P.eff[k]));
  const eff = effectiveFrom(s, c, learned);
  const same = SKILLS.every((k) => eff[k] === learned[k]);
  if (same) {
    c.attributes = learned;
    if (P) { delete P.learned; delete P.eff; }
    return;
  }
  const Q = P ?? mut(s, c.id);
  Q.learned = learned;
  Q.eff = { ...eff };
  c.attributes = eff;
}

export interface SkillLine { skill: Skill; learned: number; effective: number; why: string[] }
/** For the sheet: learned vs effective, with only the causes the viewer may know. */
export function skillLines(s: GameState, c: Character): SkillLine[] {
  const L = learnedSkills(s, c);
  const m = skillMods(s, c);
  const shown = new Set(knownOld(s, c).map((k) => k.label));
  const life = new Set(lifeTraits(s, c).map((t) => LIFE_INFO[t].name));
  return SKILLS.map((k) => {
    const why = [...new Set(m[k].why)].map((w) => (shown.has(w) || life.has(w) ? w : c.id === s.playerId ? 'Something the doctor should look at' : 'Something you can\'t put your finger on'));
    return { skill: k, learned: L[k], effective: c.attributes[k], why: [...new Set(why)] };
  });
}

/* ------------------------------------------------------------------ */
/* What the player knows                                               */
/* ------------------------------------------------------------------ */

export interface KnownOld { trait: OldTrait; level: number; label: string; sure: boolean; text: string }

/** The old-age traits the player knows about on this person (his own once diagnosed; others' by rumor or sight). */
export function knownOld(s: GameState, c: Character): KnownOld[] {
  const P = s.aging?.p[c.id];
  if (!P) return [];
  const out: KnownOld[] = [];
  for (const t of OLD_TRAITS) {
    const L = P.t[t];
    if (!L) continue;
    const mine = c.id === s.playerId;
    const k = mine ? (P.dx?.includes(t) ? 'known' : undefined) : P.heard?.[t];
    if (!k) continue;
    out.push({ trait: t, level: L, label: traitLabel(t, L), sure: k === 'known', text: OLD_INFO[t].text });
  }
  return out;
}

/** The player's own symptoms the doctor has not named yet (plain words). */
export function undiagnosed(s: GameState): { trait: OldTrait; symptom: string }[] {
  const P = s.aging?.p[s.playerId];
  if (!P) return [];
  return OLD_TRAITS.filter((t) => P.t[t] && !P.dx?.includes(t)).map((t) => ({ trait: t, symptom: OLD_INFO[t].symptom[Math.min(OLD_INFO[t].symptom.length - 1, (P.t[t] ?? 1) - 1)] }));
}

/* ------------------------------------------------------------------ */
/* Life traits (family & earned)                                       */
/* ------------------------------------------------------------------ */

export function lifeTraits(s: GameState, c: Character): LifeTrait[] {
  const out: LifeTrait[] = [];
  const f = fam(s, c.id);
  if (f.bastardOf && !f.legitimized) out.push('bastard');
  if (f.legitimized) out.push('legitimized');
  for (const t of s.aging?.tags[c.id] ?? []) if (!out.includes(t)) out.push(t);
  // Disputed heritage also comes from the record: another man's child, and it is known.
  if (!out.includes('disputed') && paternityRumored(s, c)) out.push('disputed');
  if (!out.includes('formerBoss') && (f.retired !== undefined || (c.id === s.playerId && s.power?.fell && s.power.station !== 'boss'))) out.push('formerBoss');
  if (c.motherId && Object.values(s.characters).some((x) => x.id !== c.id && x.motherId === c.motherId && x.birth.y === c.birth.y && x.birth.m === c.birth.m && x.birth.d === c.birth.d)) out.push('twin');
  if (!out.includes('veteran') && c.rank !== 'civilian' && c.faction !== 'none' && ((c.bones?.length ?? 0) >= 3 || (c.madeWeek !== undefined && s.week - c.madeWeek >= 520))) out.push('veteran');
  if (seasoned(s, c)) out.push('seasoned');
  return out;
}

/** The good side of age: 55 and over, the mind still sharp. */
export function seasoned(s: GameState, c: Character): boolean {
  const P = s.aging?.p[c.id]?.t;
  return c.alive && ageOn(c.birth, s.date) >= 55 && !(P?.mind && P.mind >= 2) && !P?.incapable;
}

export function hasLife(s: GameState, c: Character, t: LifeTrait): boolean {
  return lifeTraits(s, c).includes(t);
}

/** Why this person cannot be in the line of succession (undefined = he can). */
export function successionBar(s: GameState, c: Character): string | undefined {
  if (isIncapable(s, c.id)) return 'Incapable';
  const f = fam(s, c.id);
  if (f.bastardOf && !f.legitimized) return 'A bastard (not legitimized)';
  if (s.aging?.tags[c.id]?.includes('disinherited')) return 'Disinherited';
  return undefined;
}

/** Points for or against him as a candidate (heir.ts capability). */
export function candidateMods(s: GameState, c: Character): { label: string; value: number }[] {
  const out: { label: string; value: number }[] = [];
  const life = lifeTraits(s, c);
  if (isIncapable(s, c.id)) out.push({ label: 'Incapable', value: -60 });
  if (life.includes('shamed')) out.push({ label: 'Shamed', value: -10 });
  if (life.includes('disputed')) out.push({ label: 'Disputed heritage', value: -6 });
  if (life.includes('disloyal')) out.push({ label: 'Disloyal', value: -5 });
  if (life.includes('formerBoss')) out.push({ label: 'Once sat in the chair', value: 6 });
  if (life.includes('loyal')) out.push({ label: 'Loyal', value: 3 });
  if (life.includes('veteran')) out.push({ label: 'A veteran', value: 3 });
  return out;
}

/** Sort key inside a tier of the blood line: disputed heritage goes last among equals. */
export function lineOrder(s: GameState, c: Character): number {
  return s.aging?.tags[c.id]?.includes('disputed') || paternityRumored(s, c) ? 1 : 0;
}

/* ------------------------------------------------------------------ */
/* Hooks the other systems read                                         */
/* ------------------------------------------------------------------ */

/** Multiplier on a stress change (Faltering Heart / Withering Mind: more gain, slower relief). */
export function stressMult(s: GameState, id: string, amount: number): number {
  const P = s.aging?.p[id]?.t;
  if (!P) return 1;
  if (amount > 0) return 1 + 0.1 * (P.heart ?? 0) + 0.1 * (P.mind ?? 0);
  return Math.max(0.4, 1 - 0.1 * (P.heart ?? 0));
}

/** Extra monthly fear decay toward a frail man (Infirm; Incapable fades it fast). */
export function fearFade(s: GameState, id: string): number {
  const P = s.aging?.p[id]?.t;
  if (!P) return 0;
  return (P.infirm ?? 0) + (P.incapable ? 3 : 0);
}

/** Attraction lost when people look at him (Infirm), as reasons. */
export function attractionMods(s: GameState, c: Character): { label: string; value: number }[] {
  const P = s.aging?.p[c.id]?.t;
  if (!P) return [];
  const out: { label: string; value: number }[] = [];
  if (P.infirm) out.push({ label: 'Frail', value: -8 * P.infirm });
  if (P.incapable) out.push({ label: 'Not himself any more', value: -40 });
  return out;
}

/** Fertility multiplier (Infirm −10% a stage; Incapable none). */
export function fertility(s: GameState, c: Character): number {
  const P = s.aging?.p[c.id]?.t;
  if (!P) return 1;
  if (P.incapable) return 0;
  return Math.max(0, 1 - 0.1 * (P.infirm ?? 0));
}

/** Lifestyle experience multiplier (Withering Mind learns less). */
export function xpMult(s: GameState, c: Character): number {
  const L = lvl(s, c.id, 'mind');
  return Math.max(0.25, 1 - 0.2 * L);
}

/** How much easier a scheme against him is (Fragile Bones), labelled for what the player knows. */
export function frailtyAgainst(s: GameState, c: Character): { label: string; value: number } | undefined {
  const L = lvl(s, c.id, 'bones');
  if (!L) return undefined;
  const known = c.id === s.playerId ? agingOf(s, c.id).dx?.includes('bones') : agingOf(s, c.id).heard?.bones;
  return { label: known ? 'Fragile bones: a fall would finish him' : 'Something you can\'t see', value: 5 * L };
}

/** Natural-death multiplier this month. */
export function deathMult(s: GameState, c: Character): number {
  const P = s.aging?.p[c.id]?.t;
  if (!P) return 1;
  return (1 + 0.1 * (P.bones ?? 0)) * (1 + 0.15 * (P.heart ?? 0)) * (1 + 0.05 * (P.infirm ?? 0)) * (P.incapable ? 1.5 : 1);
}

/* ------------------------------------------------------------------ */
/* The monthly step                                                    */
/* ------------------------------------------------------------------ */

const STAGE_MONTHS = 6;

/**
 * One person's month (called from dynasty.monthlyLife before the death roll).
 * Returns a cause when the heart gives out.
 */
export function agingFor(ctx: Ctx, c: Character): { kill?: string } {
  const s = ctx.s;
  const a = ageOn(c.birth, s.date);
  const has = s.aging?.p[c.id];
  if (a < 50 && !has) return {};
  const A = ensureAging(s);
  const h: RngHolder = A;
  const mine = c.id === s.playerId;
  const tracked = mine || c.dynasty || c.faction === 'player';
  let result: { kill?: string } = {};
  if (a >= 55) {
    const P = mut(s, c.id);
    const careRecent = P.care !== undefined && s.week - P.care <= 26;
    const stressL = s.dyn?.people[c.id]?.stressLevel ?? 0;
    for (const t of ['infirm', 'eyes', 'bones', 'mind', 'heart'] as const) {
      const L = P.t[t] ?? 0;
      if (!L) {
        if (P.t.incapable && t === 'mind') continue;
        if (a < onsetAge(s, c, t) || !chance(h, 1 / 6)) continue;
        P.t[t] = 1;
        P.at[t] = s.week;
        A.stats.onsets++;
        if (mine) ctx.log.push(OLD_INFO[t].symptom[0] + (P.dx?.includes(t) ? '' : ' Maybe the doctor should look at you.'));
        continue;
      }
      if (L >= OLD_INFO[t].max && t !== 'mind' && t !== 'heart') continue;
      if (s.week - (P.at[t] ?? 0) < STAGE_MONTHS * 4) continue;
      let p = 1 / 36;
      if (drinks(c) && (t === 'heart' || t === 'mind' || t === 'infirm')) p *= 1.4;
      if (t === 'heart' || t === 'mind') p *= 1 + 0.15 * stressL;
      if (careRecent) p *= 0.6;
      if (c.health < 40) p *= 1.3;
      if (!chance(h, p)) continue;
      // The last stages.
      if (t === 'mind' && L >= 3) {
        if (P.t.incapable) continue;
        P.t.incapable = 1;
        P.at.incapable = s.week;
        A.stats.incapable++;
        becameIncapable(ctx, c);
        continue;
      }
      if (t === 'heart' && L >= 3) {
        if (c.warnedWeek === undefined) { c.warnedWeek = s.week; c.health = clamp(c.health - 10); if (tracked) ctx.log.push(`${displayName(c)}'s heart gave him a scare. The doctor is worried.`); continue; }
        A.stats.heartDeaths++;
        result = { kill: 'his heart gave out' };
        continue;
      }
      P.t[t] = L + 1;
      P.at[t] = s.week;
      A.stats.stages++;
      if (mine) ctx.log.push(OLD_INFO[t].symptom[Math.min(OLD_INFO[t].symptom.length - 1, L)]);
      else if (t === 'eyes' && L + 1 === 4 && tracked) ctx.log.push(`${displayName(c)} can no longer see.`);
    }
    // Personality with the years (only for people whose details are kept): the drive fades, the ego
    // grows, and a sharp old man reads a room and a deal better than he did (not all of age is loss).
    if (tracked && c.attrs && !P.t.incapable) {
      if (chance(h, 0.04)) growAttr(s, c, 'ambition', -1);
      if (chance(h, 0.03)) growAttr(s, c, 'pride', 1);
      if (!(P.t.mind && P.t.mind >= 2) && chance(h, 0.04)) { growAttr(s, c, 'negotiation', 1); growAttr(s, c, 'judgment', 1); }
    }
    // Health: the slow costs.
    const hp = 0.3 * (P.t.infirm ?? 0) + 0.3 * (P.t.heart ?? 0) + (P.t.incapable ? 1 : 0);
    if (hp) c.health = clamp(c.health - hp + (careRecent ? 0.3 : 0));
  }
  settleSkills(s, c);
  return result;
}

/** After everyone's month: what people hear, earned traits, an incapable boss, tidy. */
export function agingMonth(ctx: Ctx): void {
  const s = ctx.s;
  if (!s.aging) return;
  const A = s.aging;
  const h: RngHolder = A;
  const boss = player(s);
  for (const id of Object.keys(A.p)) {
    const c = s.characters[id];
    const P = A.p[id];
    if (!c || !c.alive) {
      // The dead keep their traits for the record; the skill books close.
      if (P.learned) delete P.learned;
      if (P.eff) delete P.eff;
      if (!Object.keys(P.t).length) delete A.p[id];
      continue;
    }
    if (!Object.keys(P.t).length) continue;
    if (id === s.playerId) { heardAboutBoss(ctx, c, P); continue; }
    // What the player hears or sees.
    const close = c.dynasty || c.faction === 'player' || s.rivals.some((r) => r.leaderId === c.id);
    for (const t of OLD_TRAITS) {
      const L = P.t[t];
      if (!L || P.heard?.[t] === 'known') continue;
      const visible = t === 'eyes' || t === 'infirm' || t === 'incapable';
      if (t === 'incapable' && close) { (P.heard ??= {})[t] = 'known'; A.stats.rumors++; if (c.faction === 'player' || c.dynasty) ctx.log.push(`${displayName(c)} is no longer himself. Everybody can see it now.`); continue; }
      const p = (L >= 2 ? 0.05 : 0.01) * (close ? 2 : 1) * (visible ? 1.5 : 1);
      if (!chance(h, p)) continue;
      const was = P.heard?.[t];
      (P.heard ??= {})[t] = was === 'rumor' || (visible && close && L >= 2) ? 'known' : 'rumor';
      A.stats.rumors++;
      if (close && !was) ctx.log.push(`People are saying ${displayName(c)} ${t === 'mind' ? 'forgets things' : t === 'heart' ? 'has a bad heart' : t === 'eyes' ? 'can\'t see well' : t === 'bones' ? 'is frail' : 'is slowing down'}.`);
    }
    // An incapable man cannot hold a seat.
    if (P.t.incapable && s.council) for (const seat of Object.keys(s.council) as (keyof typeof s.council)[]) {
      if (s.council[seat]?.holderId === id) {
        s.council[seat] = { ...s.council[seat], holderId: undefined };
        ctx.log.push(`${displayName(c)} can no longer sit on the council. His seat is open.`);
      }
    }
  }
  earnedTraits(ctx);
  // An incapable boss: whoever acts for him keeps acting.
  if (isIncapable(s, boss.id) && A.regent?.mode === 'ub' && s.shadow) {
    s.shadow.actingUntil = Math.max(s.shadow.actingUntil ?? 0, s.week + 8);
  }
  if (A.regent && !isIncapable(s, boss.id)) delete A.regent;
}

/** The crew talks about the boss's health (only what can be noticed). */
function heardAboutBoss(ctx: Ctx, boss: Character, P: AgingPerson): void {
  const s = ctx.s;
  const A = s.aging!;
  for (const t of ['mind', 'heart', 'eyes', 'incapable'] as const) {
    const L = P.t[t];
    if (!L || P.talk?.includes(t)) continue;
    if (t !== 'incapable' && (L < 2 || !chance(A, 0.06))) continue;
    (P.talk ??= []).push(t);
    A.stats.rumors++;
    for (const c of crew(s)) if (c.id !== boss.id) addOpinion(s, c.id, boss.id, t === 'mind' || t === 'incapable' ? 'The old man is slipping' : 'The old man is not well', -3, 1);
    ctx.log.push(t === 'mind' ? 'The crew has noticed you forget things. They talk about it when you leave the room.' : t === 'heart' ? 'Word is going around that your heart is bad.' : t === 'eyes' ? 'The men have noticed you can\'t see as well as you did.' : 'Everybody knows the boss is not himself.');
  }
}

/** Loyal and Disloyal are earned (and lost) by what a man does. */
function earnedTraits(ctx: Ctx): void {
  const s = ctx.s;
  const A = s.aging!;
  const followers = new Set(s.power?.followerIds ?? []);
  for (const c of crew(s)) {
    if (c.id === s.playerId) continue;
    const tags = A.tags[c.id] ?? [];
    const disloyal = (c.defectStage ?? 0) >= 1 || (followers.has(c.id) && !!s.power?.fell);
    if (disloyal && !tags.includes('disloyal')) {
      A.tags[c.id] = [...tags.filter((t) => t !== 'loyal'), 'disloyal'];
      continue;
    }
    if (tags.includes('loyal') || tags.includes('disloyal')) continue;
    const years = c.madeWeek !== undefined ? (s.week - c.madeWeek) / 52 : 0;
    if (years >= 5 && opinion(s, c.id, s.playerId) >= 50 && !c.informantFor && !c.courtedBy) A.tags[c.id] = [...tags, 'loyal'];
  }
}

/* ------------------------------------------------------------------ */
/* The incapable boss                                                  */
/* ------------------------------------------------------------------ */

function becameIncapable(ctx: Ctx, c: Character): void {
  const s = ctx.s;
  if (c.id !== s.playerId) {
    if (c.dynasty || c.faction === 'player') ctx.log.push(`${displayName(c)} can no longer look after his own affairs.`);
    const r = s.rivals.find((x) => x.leaderId === c.id);
    if (r) ctx.log.push(`Word from ${r.shortName}: their boss doesn't know what day it is. Somebody else is running things.`);
    return;
  }
  s.eventQueue.push(buildIncapable(s));
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${displayName(c)} could no longer run the family himself.`, kind: 'family' });
}

export function buildIncapable(s: GameState): EventInstance {
  const ub = s.council?.underboss?.holderId ? s.characters[s.council.underboss.holderId] : crew(s).find((c) => c.rank === 'underboss');
  const heir = s.designatedHeirId ? s.characters[s.designatedHeirId] : undefined;
  const label = 'The doctor\'s verdict';
  const op = (o: AgingOp): Effect => ({ type: 'dyn', op: { op: 'aging', a: o }, label });
  return {
    iid: `ev${s.nextId++}`, defId: 'aging_incapable', week: s.week, mandatory: true, priority: 96,
    title: 'Someone Has to Sit In',
    text: 'The doctor said it plainly to your wife, not to you: you cannot run things any more. The days run together. Somebody has to act for you, or the family runs itself.',
    defaultChoiceId: ub?.alive ? 'ub' : 'none',
    actors: [ub?.id, heir?.id].filter((x): x is string => !!x),
    choices: [
      { id: 'ub', label: ub ? `${ub.firstName} acts for you` : 'The underboss acts for you', detail: 'He runs the family while you cannot. He may like it.', because: 'let the underboss act for him', effects: [op({ k: 'regent', mode: 'ub' })], disabledReason: ub?.alive ? undefined : 'There is no underboss' },
      { id: 'heir', label: heir ? `${heir.firstName} acts for you` : 'Your heir acts for you', detail: 'A test in front of everybody. He learns, or he fails.', because: 'let his heir act for him', effects: [op({ k: 'regent', mode: 'heir' })], disabledReason: heir?.alive && !isIncapable(s, heir.id) ? undefined : 'No heir who can do it' },
      { id: 'step', label: 'Step aside for good', detail: 'The heir takes the chair now; you retire to Florida.', because: 'stepped aside', effects: [{ type: 'dyn', op: { op: 'abdicate' }, label }] },
      { id: 'none', label: 'Nobody sits in', detail: 'Petitions pile up. The men notice.', because: 'let nobody act for him', effects: [op({ k: 'regent', mode: 'none' }), { type: 'crewOpinion', amount: -3, reason: 'The old man won\'t let go', label }] },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Effects                                                             */
/* ------------------------------------------------------------------ */

export function applyAgingOp(ctx: Ctx, o: AgingOp): void {
  const s = ctx.s;
  const A = ensureAging(s);
  switch (o.k) {
    case 'checkup': {
      const P = mut(s, o.charId);
      P.care = s.week;
      const found = OLD_TRAITS.filter((t) => P.t[t] && !P.dx?.includes(t));
      if (found.length) {
        P.dx = [...(P.dx ?? []), ...found];
        A.stats.diagnosed += found.length;
        if (o.charId === s.playerId) ctx.log.push(`The doctor named it: ${found.map((t) => traitLabel(t, P.t[t] ?? 1)).join(', ')}. Regular visits slow it down.`);
      }
      break;
    }
    case 'tag': {
      const cur = A.tags[o.charId] ?? [];
      A.tags[o.charId] = o.remove ? cur.filter((t) => t !== o.tag) : cur.includes(o.tag) ? cur : [...cur, o.tag];
      if (!A.tags[o.charId].length) delete A.tags[o.charId];
      const c = s.characters[o.charId];
      if (c && !o.remove && (o.tag === 'disinherited' || o.tag === 'shamed')) addOpinion(s, c.id, s.playerId, o.tag === 'disinherited' ? 'Put me out of the line' : 'Shamed me in front of the family', o.tag === 'disinherited' ? -30 : -20, 0.5);
      break;
    }
    case 'regent': {
      const boss = player(s);
      const ub = s.council?.underboss?.holderId ?? crew(s).find((c) => c.rank === 'underboss')?.id;
      const id = o.mode === 'ub' ? ub : o.mode === 'heir' ? s.designatedHeirId : undefined;
      A.regent = { mode: o.mode, id, since: s.week };
      if (o.mode === 'ub' && s.shadow) s.shadow.actingUntil = s.week + 8;
      if (id) addOpinion(s, id, boss.id, 'Trusted me with the family', 8, 1);
      break;
    }
  }
}

export function describeAgingOp(s: GameState, o: AgingOp): string | undefined {
  const nm = (id?: string) => (id && s.characters[id] ? s.characters[id].firstName : 'Someone');
  switch (o.k) {
    case 'checkup': return 'The doctor looks you over';
    case 'tag': return `${nm(o.charId)}: ${o.remove ? 'no longer ' : ''}${LIFE_INFO[o.tag].name}`;
    case 'regent': return o.mode === 'none' ? 'Nobody acts for you' : o.mode === 'ub' ? 'The underboss acts for you' : 'Your heir acts for you';
  }
}
