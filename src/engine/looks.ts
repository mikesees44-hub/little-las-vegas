import { ageOn } from './calendar';
import { hasTrait } from './characters';
import { fam } from './familyState';
import { hashSeed } from './rng';
import { figureTaste } from './body';
import type { Character, GameState } from './types';

/**
 * APPEARANCE TRAITS for every character: how people look (a face from
 * Beautiful/Handsome down to Homely/Ugly, a build, one feature people
 * remember, a way of dressing) and how that changes with the years.
 *
 * Pure and derived: a person's looks come from the seed and their id, from
 * their parents' looks when the parents are known (children inherit), from
 * the house's blood traits (Handsome / Homely), from age and health. Nothing
 * is stored unless something changed it (`s.nightlife.looks`), so every old
 * save already has looks and two runs of the same seed agree.
 *
 * Looks are one reason among many. Attraction is personal (`appeal`): each
 * observer has his or her own type and cares more or less about looks; a
 * face never decides anyone's worth, skill or willingness. Children get a
 * build and features only; no adult measure of looks is ever computed for a
 * minor, and nobody under 18 is ever an observer.
 */

export type Physique =
  | 'slender' | 'petite' | 'curvy' | 'fullfigured' | 'athletic' | 'statuesque'
  | 'lean' | 'wiry' | 'broad' | 'stocky' | 'heavyset';

export const PHYSIQUE_LABEL: Record<Physique, string> = {
  slender: 'Slender', petite: 'Petite', curvy: 'Curvy', fullfigured: 'Full-figured', athletic: 'Athletic', statuesque: 'Tall & statuesque',
  lean: 'Lean', wiry: 'Wiry', broad: 'Broad-shouldered', stocky: 'Stocky', heavyset: 'Heavyset',
};

const F_PHYS: Physique[] = ['slender', 'petite', 'curvy', 'fullfigured', 'athletic', 'statuesque'];
const M_PHYS: Physique[] = ['lean', 'wiry', 'athletic', 'broad', 'stocky', 'heavyset'];
/** What a build tends to become in middle age (for some people, not all). */
const SETTLES: Partial<Record<Physique, Physique>> = { slender: 'fullfigured', petite: 'curvy', curvy: 'fullfigured', athletic: 'stocky', lean: 'stocky', wiry: 'lean', broad: 'heavyset', stocky: 'heavyset' };

const F_FEATURE = ['Striking eyes', 'A beautiful face', 'A warm smile', 'A beauty mark', 'Freckles', 'Red hair', 'A strong nose', 'A husky laugh', 'Long dark hair', 'Platinum hair'];
const M_FEATURE = ['A strong jaw', 'Kind eyes', 'A broken nose', 'A scar over one eye', 'A Roman nose', 'Heavy eyebrows', 'A great head of hair', 'A gap-toothed grin', 'Cold eyes', 'A booming laugh'];
const F_STYLE = ['Glamorous', 'Understated', 'A provocative dresser', 'Businesslike', 'The girl next door', 'Fashionable'];
const M_STYLE = ['A sharp dresser', 'Rumpled', 'Flashy', 'Conservative', 'A workingman\'s clothes'];

export type LooksTier = 'stunning' | 'attractive' | 'ordinary' | 'plain' | 'homely' | 'ugly';

export const TIER_LABEL: Record<LooksTier, { F: string; M: string; good: boolean | undefined }> = {
  stunning: { F: 'Beautiful', M: 'Handsome', good: true },
  attractive: { F: 'Attractive', M: 'Good-looking', good: true },
  ordinary: { F: 'Ordinary-looking', M: 'Ordinary-looking', good: undefined },
  plain: { F: 'Plain', M: 'Plain', good: false },
  homely: { F: 'Homely', M: 'Homely', good: false },
  ugly: { F: 'Unattractive', M: 'Ugly', good: false },
};

/** A stored change (a person who got her figure back, a scar, a new way of dressing). */
export interface LookOverride {
  /** Base looks 0-100 at her best (the nightlife cast is cast, not rolled). */
  b?: number;
  ph?: Physique;
  st?: string;
  ft?: string;
}

export interface Looks {
  /** At their best (inherited, then the blood traits). */
  base: number;
  /** As people see them today (age, health, style). Undefined for a minor. */
  score?: number;
  tier?: LooksTier;
  tierLabel?: string;
  physique: Physique;
  physiqueLabel: string;
  feature: string;
  style: string;
  /** Short chips for a card: tier first (adults only), then build, feature, style. */
  chips: { text: string; good?: boolean }[];
  /** How the years have changed them, in words (adults only). */
  aging?: string;
}

const u = (k: string) => (hashSeed(k) % 100003) / 100003;
const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(v)));

function overrideOf(s: GameState, id: string): LookOverride | undefined {
  return s.nightlife?.looks?.[id];
}

/** Base looks at their best: the parents' (when known), the person's own luck, the house's blood. */
export function baseLooks(s: GameState, c: Character, depth = 0): number {
  const o = overrideOf(s, c.id);
  if (o?.b !== undefined) return o.b;
  const own = ((u(`${s.seed}:lk1:${c.id}`) + u(`${s.seed}:lk2:${c.id}`) + u(`${s.seed}:lk3:${c.id}`)) / 3) * 100;
  let v = own;
  if (depth < 2) {
    const fid = c.bioFatherId ?? c.fatherId;
    const f = fid ? s.characters[fid] : undefined;
    const m = c.motherId ? s.characters[c.motherId] : undefined;
    const ps = [f, m].filter((x): x is Character => !!x).map((p) => baseLooks(s, p, depth + 1));
    if (ps.length === 2) v = 0.6 * ((ps[0] + ps[1]) / 2) + 0.4 * own;
    else if (ps.length === 1) v = 0.35 * ps[0] + 0.65 * own;
  }
  const g = fam(s, c.id).congenital;
  if (g.includes('Handsome')) v = Math.max(v, 70) + 8;
  if (g.includes('Homely')) v = Math.min(v, 34) - 8;
  return clamp(v, 3, 97);
}

function physiqueOf(s: GameState, c: Character, age: number): { ph: Physique; settled: boolean } {
  const o = overrideOf(s, c.id);
  const list = c.gender === 'F' ? F_PHYS : M_PHYS;
  let ph = o?.ph ?? list[hashSeed(`${s.seed}:ph:${c.id}`) % list.length];
  if (hasTrait(c, 'Drinker') && c.gender === 'M' && ph === 'lean') ph = 'stocky';
  // Some people settle in middle age (the age it happens is theirs).
  const at = 38 + (hashSeed(`${s.seed}:settle:${c.id}`) % 18);
  const settles = !o?.ph && u(`${s.seed}:settles:${c.id}`) < 0.4 && age >= at && SETTLES[ph];
  return settles ? { ph: SETTLES[ph]!, settled: true } : { ph, settled: false };
}

function tierOf(v: number): LooksTier {
  return v >= 82 ? 'stunning' : v >= 66 ? 'attractive' : v >= 40 ? 'ordinary' : v >= 24 ? 'plain' : v >= 12 ? 'homely' : 'ugly';
}

/** Everything about how someone looks today. */
export function looksOf(s: GameState, c: Character): Looks {
  const age = ageOn(c.birth, c.death ? c.death.date : s.date);
  const base = baseLooks(s, c);
  const o = overrideOf(s, c.id);
  const { ph, settled } = physiqueOf(s, c, age);
  const fl = c.gender === 'F' ? F_FEATURE : M_FEATURE;
  let feature = o?.ft ?? fl[hashSeed(`${s.seed}:ft:${c.id}`) % fl.length];
  if (c.gender === 'M' && feature === 'A great head of hair' && age >= 45 + (hashSeed(`${s.seed}:bald:${c.id}`) % 15)) feature = 'Thinning hair';
  const sl = c.gender === 'F' ? F_STYLE : M_STYLE;
  const style = o?.st ?? sl[hashSeed(`${s.seed}:st:${c.id}`) % sl.length];
  const chips: Looks['chips'] = [];
  const out: Looks = { base, physique: ph, physiqueLabel: PHYSIQUE_LABEL[ph], feature, style, chips };
  if (age >= 18) {
    let v = base;
    if (age <= 28) v += 4;
    const peak = c.gender === 'F' ? 32 : 36;
    if (age > peak) v -= (age - peak) * (c.gender === 'F' ? 0.9 : 0.7);
    v = Math.max(v, base * 0.35);
    if (/Glamorous|sharp dresser|Fashionable/.test(style)) v += 3;
    if (/Rumpled/.test(style)) v -= 3;
    if (c.alive && c.health < 40) v -= 8;
    const score = clamp(v, 1, 99);
    const tier = tierOf(score);
    out.score = score;
    out.tier = tier;
    out.tierLabel = TIER_LABEL[tier][c.gender];
    chips.push({ text: out.tierLabel, good: TIER_LABEL[tier].good });
    const was = tierOf(clamp(base + 4));
    const notes: string[] = [];
    if (was !== tier && age > peak) notes.push(`Was ${TIER_LABEL[was][c.gender].toLowerCase()} when ${c.gender === 'F' ? 'she' : 'he'} was young`);
    if (settled) notes.push(`${c.gender === 'F' ? 'Her' : 'His'} build has settled with the years`);
    if (feature === 'Thinning hair') notes.push('The hair is going');
    if (notes.length) out.aging = notes.join('; ');
  }
  chips.push({ text: PHYSIQUE_LABEL[ph] }, { text: feature });
  if (age >= 16) chips.push({ text: style });
  return out;
}

/** 0.7 .. 1.3: what looks do to a performer's or an escort's money (one factor among many). */
export function looksEarnings(s: GameState, c: Character): number {
  const l = looksOf(s, c);
  return l.score === undefined ? 1 : 0.7 + (l.score / 100) * 0.6;
}

/** How much looks matter to this observer (fixed per person): 0.5, 1 or 1.5. */
export function looksMatter(s: GameState, o: Character): number {
  const k = hashSeed(`${s.seed}:lm:${o.id}`) % 3;
  return k === 0 ? 0.5 : k === 1 ? 1 : 1.5;
}

/** The build this observer likes best (fixed per person). */
export function typeOf(s: GameState, o: Character, forGender: 'M' | 'F'): Physique {
  const list = forGender === 'F' ? F_PHYS : M_PHYS;
  return list[hashSeed(`${s.seed}:type:${o.id}:${forGender}`) % list.length];
}

/**
 * How `observer` sees `target`'s looks: personal (his type, how much looks
 * matter to him), with reasons. Adults only on both sides; 0 otherwise.
 */
export function appeal(s: GameState, observer: Character, target: Character): { value: number; reasons: { label: string; value: number }[] } {
  if (ageOn(observer.birth, s.date) < 18 || ageOn(target.birth, s.date) < 18) return { value: 0, reasons: [] };
  const l = looksOf(s, target);
  if (l.score === undefined) return { value: 0, reasons: [] };
  const w = looksMatter(s, observer);
  const reasons: { label: string; value: number }[] = [];
  const lv = Math.round((l.score - 50) * 0.4 * w);
  if (Math.abs(lv) >= 2) reasons.push({ label: l.tierLabel!, value: lv });
  if (typeOf(s, observer, target.gender) === l.physique) reasons.push({ label: `${l.physiqueLabel}: just ${observer.gender === 'F' ? 'her' : 'his'} type`, value: 8 });
  const ft = figureTaste(s, observer, target);
  if (ft) reasons.push(ft);
  if (l.style === 'A provocative dresser' && hasTrait(observer, 'Womanizer')) reasons.push({ label: 'The way she dresses', value: 5 });
  if (l.style === 'A provocative dresser' && hasTrait(observer, 'Pious')) reasons.push({ label: 'The way she dresses', value: -5 });
  const value = Math.max(-25, Math.min(30, reasons.reduce((a, r) => a + r.value, 0)));
  return { value, reasons };
}

/** A first impression in words, from the observer's side (the calling card shows the boss's). */
export function impressionWord(v: number): string {
  return v >= 18 ? 'Catches your eye' : v >= 6 ? 'Easy on the eyes, to you' : v > -6 ? 'Looks are neither here nor there, to you' : 'Not your type';
}

/**
 * APPETITE (0-100): how much a man (or a woman) goes after romance. Fixed per person from the seed,
 * pushed up by a roving eye, down by piety. High appetite makes him bolder (he asks, and asks well);
 * it is not charm, and it is not a promise she says yes.
 */
export function appetite(s: GameState, c: Character): number {
  let v = 25 + (hashSeed(`${s.seed}:appetite:${c.id}`) % 51);
  if (hasTrait(c, 'Womanizer')) v += 30;
  if (hasTrait(c, 'Pious')) v -= 20;
  if (hasTrait(c, 'Drinker')) v += 5;
  return Math.max(0, Math.min(100, v));
}

/**
 * ALLURE: how easily `man` gets around with `woman`, in one place, with reasons: how he looks to her
 * (appeal), Charming, a ladies' man's practice, his appetite (boldness), and rank (the boss's name opens
 * doors). Adults only (0 otherwise). Every offer, date, ask and honey-trap uses this so looks always count.
 */
export function allure(s: GameState, man: Character, woman: Character): { value: number; reasons: { label: string; value: number }[] } {
  if (ageOn(man.birth, s.date) < 18 || ageOn(woman.birth, s.date) < 18) return { value: 0, reasons: [] };
  const reasons: { label: string; value: number }[] = [];
  const a = appeal(s, woman, man).value;
  if (a) reasons.push({ label: a > 0 ? 'His looks, to her' : 'Not her type', value: a });
  if (hasTrait(man, 'Charming')) reasons.push({ label: 'Charming', value: 10 });
  if (hasTrait(man, 'Womanizer')) reasons.push({ label: 'A ladies\' man: he knows what to say', value: 8 });
  const ap = appetite(s, man);
  if (ap >= 70) reasons.push({ label: 'A big appetite: he asks, and asks well', value: Math.round((ap - 60) / 4) });
  if (man.rank === 'boss') reasons.push({ label: 'The boss\'s name opens doors', value: 6 });
  else if (man.rank === 'underboss' || man.rank === 'consigliere' || man.rank === 'capo') reasons.push({ label: 'A man of standing', value: 3 });
  const value = Math.max(-25, Math.min(40, reasons.reduce((x, r) => x + r.value, 0)));
  return { value, reasons };
}
