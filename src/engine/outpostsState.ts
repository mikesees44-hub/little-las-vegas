import type { GameState } from './types';

/**
 * Outposts and safe passage: the state and cheap queries only (outposts.ts
 * plays them). Kept free of engine imports so travelState.ts can ask "is he
 * away at an outpost or lying low?" without a cycle.
 *
 * Lives on `GameState.posts` (optional: made by the first man sent; an
 * old save and a fresh game are the same). Its dice are its own.
 */

export type SpotKind = 'point' | 'lounge' | 'junket' | 'book' | 'loan';
export type PostCity = 'vegas' | 'miami' | 'chicago' | 'neworleans';

export interface Outpost {
  id: string;
  city: PostCity;
  spot: SpotKind;
  /** The man who runs it. */
  manId: string;
  /** Up to two more of the boss's men with him. */
  crew: string[];
  seed: number;
  since: number;
  /** His loyalty to the boss, 0-100 (starts high, drifts). */
  loyal: number;
  /** Loyalty at the end of each of the last weeks (newest last, up to 8): the trend. */
  hist: number[];
  /** The share of the take he keeps (0.2-0.5). */
  share: number;
  /** Things he started on his own (0-3): each keeps more of the money out there. */
  side: number;
  /** Money sent home in all, and his own take in all. */
  sent: number;
  kept: number;
  /** The last weeks' sends (newest last, up to 8). */
  sends: number[];
  /** The week of the boss's last visit, last letter; his wife came out; a marriage tie. */
  visit?: number;
  letter?: number;
  wife?: number;
  wed?: number;
  /** He refused to come home (week). */
  refused?: number;
  status: 'run' | 'broke' | 'poached' | 'home' | 'closed';
  /** The family that took him (poached). */
  by?: string;
  end?: number;
}

/** Someone of the boss's lying low in another city (safe passage). */
export interface LieLow {
  id: string;
  who: string;
  /** The outpost that hides him, or the friendly family that does. */
  postId?: string;
  fam?: string;
  city: string;
  since: number;
  until: number;
  /** The odds shown when he went (percent): safe the whole time, found, sold out by the host. */
  odds: { safe: number; found: number; sold: number };
  /** Who was hunting him when he went. */
  hunters: string[];
  /** Paid the locals to look away (found odds lower). */
  paid?: boolean;
  status: 'away' | 'home' | 'found' | 'sold';
  /** A danger popup is waiting (the week it was raised). */
  asked?: number;
}

export interface OutpostState {
  rng: number;
  next: number;
  list: Outpost[];
  lie: LieLow[];
}

/** The outpost a man is at (running), if any. */
export function postOf(s: GameState, charId: string): Outpost | undefined {
  return s.posts?.list.find((o) => o.status === 'run' && (o.manId === charId || o.crew.includes(charId)));
}

/** He is lying low somewhere (safe passage), if he is. */
export function lyingLow(s: GameState, charId: string): LieLow | undefined {
  return s.posts?.lie.find((l) => l.status === 'away' && l.who === charId);
}

/** Away from Wildwood because of an outpost or safe passage. */
export function awayOnPost(s: GameState, charId: string): boolean {
  if (!s.posts) return false;
  return !!postOf(s, charId) || !!lyingLow(s, charId);
}
