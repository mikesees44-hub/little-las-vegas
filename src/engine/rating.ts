import { ageOn } from './calendar';
import { appeal, looksOf } from './looks';
import type { Character, GameState } from './types';

/**
 * HOT OR NOT, at a glance: every adult's looks as a 1-10 rating with a plain
 * word and stars (looks.ts's score as people see them today), and "to you":
 * how attractive the boss finds this person (looks.ts `appeal`, personal:
 * his type, how much looks matter to him). Women and men alike. Adults only:
 * a minor has no rating, and nobody under 18 is ever an observer. Looks
 * never decide anyone's worth, skill or willingness.
 */

export type RatingWord = 'Homely' | 'Plain' | 'Average' | 'Pretty' | 'Very cute' | 'Hot' | 'Stunning' | 'Knockout' | 'Good-looking' | 'Handsome';
export type RatingTone = 'low' | 'mid' | 'good' | 'hot' | 'top';

export interface LooksRating {
  /** 1-10, as people generally see them. */
  score: number;
  word: RatingWord;
  /** 1-5 stars. */
  stars: number;
  tone: RatingTone;
  /** 1-10, to the boss's own eye (adults only, not the boss himself). */
  toYou?: number;
  toYouWord?: RatingWord;
}

/** The word for a 1-10 score (men get "Good-looking" and "Handsome" for Pretty and Very cute). */
export function ratingWord(score: number, gender: 'M' | 'F' = 'F'): RatingWord {
  const w: RatingWord = score <= 2 ? 'Homely' : score === 3 ? 'Plain' : score <= 5 ? 'Average' : score === 6 ? 'Pretty' : score === 7 ? 'Very cute' : score === 8 ? 'Hot' : score === 9 ? 'Stunning' : 'Knockout';
  if (gender === 'M' && w === 'Pretty') return 'Good-looking';
  if (gender === 'M' && w === 'Very cute') return 'Handsome';
  return w;
}

export function ratingTone(score: number): RatingTone {
  return score >= 9 ? 'top' : score >= 8 ? 'hot' : score >= 6 ? 'good' : score >= 4 ? 'mid' : 'low';
}

/** 0-100 looks score to the 1-10 rating. */
export function toTen(score: number): number {
  return Math.max(1, Math.min(10, Math.round(score / 10)));
}

/** The rating, or undefined for a minor. */
export function looksRating(s: GameState, c: Character, observer?: Character): LooksRating | undefined {
  if (ageOn(c.birth, c.death ? c.death.date : s.date) < 18) return undefined;
  const l = looksOf(s, c);
  if (l.score === undefined) return undefined;
  const score = toTen(l.score);
  const out: LooksRating = { score, word: ratingWord(score, c.gender), stars: Math.max(1, Math.min(5, Math.round(score / 2))), tone: ratingTone(score) };
  const o = observer ?? s.characters[s.playerId];
  if (o && o.id !== c.id && o.alive && ageOn(o.birth, s.date) >= 18 && o.gender !== c.gender) {
    const a = appeal(s, o, c);
    // The personal part only (her looks are already in the general score): his type, how much looks matter to him.
    const general = Math.round((l.score - 50) * 0.4);
    const t = Math.max(1, Math.min(10, score + Math.round((a.value - general) / 6)));
    out.toYou = t;
    out.toYouWord = ratingWord(t, c.gender);
  }
  return out;
}

/** "Hot or better". */
export function hotOrBetter(s: GameState, c: Character): boolean {
  const r = looksRating(s, c);
  return !!r && r.score >= 8;
}
