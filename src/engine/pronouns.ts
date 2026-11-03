import type { Character, GameState } from './types';

/**
 * Words for a person in procedural text: the right pronouns for a woman, and
 * what a man's own child calls him (never "Boss"). Small on purpose: a
 * template asks `pr(c).he`, `pr(c).His`, and `bossWord(s, c)` for the
 * salutation in a quote.
 */
export interface Pronouns { he: string; He: string; his: string; His: string; him: string; Him: string; man: string }

const M: Pronouns = { he: 'he', He: 'He', his: 'his', His: 'His', him: 'him', Him: 'Him', man: 'man' };
const F: Pronouns = { he: 'she', He: 'She', his: 'her', His: 'Her', him: 'her', Him: 'Her', man: 'woman' };

export function pr(c: Pick<Character, 'gender'> | undefined): Pronouns {
  return c?.gender === 'F' ? F : M;
}

/** Is this person the boss's own child? */
export function isBossChild(s: GameState, c: Pick<Character, 'fatherId' | 'motherId'> | undefined): boolean {
  return !!c && (c.fatherId === s.playerId || c.motherId === s.playerId);
}

/** How this person addresses the boss to his face, capitalised: his children say "Pop" (or "Ma"), his wife his first name, everyone else "Boss". */
export function bossWord(s: GameState, c: Pick<Character, 'id' | 'fatherId' | 'motherId'> | undefined): string {
  const boss = s.characters[s.playerId];
  if (isBossChild(s, c)) return boss?.gender === 'F' ? 'Ma' : 'Pop';
  if (c && boss && boss.spouseId === c.id) return boss.firstName;
  return 'Boss';
}

/** A fixed line written about a man ("He isn't sure, and it shows."), said about this person. */
export function genderize(text: string, c: Pick<Character, 'gender'> | undefined): string {
  if (c?.gender !== 'F') return text;
  return text.replace(/\bhimself\b/g, 'herself').replace(/\bHimself\b/g, 'Herself')
    .replace(/\bHe\b/g, 'She').replace(/\bhe\b/g, 'she')
    .replace(/\bHis\b/g, 'Her').replace(/\bhis\b/g, 'her')
    .replace(/\bHim\b/g, 'Her').replace(/\bhim\b/g, 'her');
}
