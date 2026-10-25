import { hashSeed } from './rng';
import type { FactionId, GameState, SecretKind } from './types';

/**
 * State for the story pillar: the content pack's bookkeeping (what fired,
 * which chain parts are due, who was cast) and the romance layer
 * (courtships, lovers, affairs, pregnancies). Both live on optional fields of
 * GameState so old saves load, and each rolls on its own seeded stream so
 * adding them does not reshuffle the rest of the simulation's dice.
 */

/** A chain part waiting to be shown (scheduled by a `followup`). */
export interface StoryDue {
  id: string;
  event: string;
  /** Carried role bindings (`role_<key>` -> character id) and the district. */
  params: Record<string, string | number>;
  since: number;
  because: string;
}

export interface StoryStats {
  shown: number;
  chainParts: number;
  /** Chains that reached a final part (one with no followup). */
  chainsDone: number;
  /** Chains that stopped early (a followup that did not come, or a role that could not be cast). */
  chainsEnded: number;
  skipped: number;
  history: number;
}

export interface StoryState {
  rng: number;
  /** Pack event id -> week it was last shown. */
  fired: Record<string, number>;
  due: StoryDue[];
  /** Pack event ids sitting in the engine's event queue (mandatory, crowded out). */
  queued: string[];
  /** `${event}:${role}` -> character created for that role (reused on re-offers). */
  spawned: Record<string, string>;
  /** Week the last random-pool pack event was shown. */
  lastRandom: number;
  /** Chain id -> week it started / last progressed / finished. */
  chains: Record<string, { started: number; last: number; done?: number }>;
  stats: StoryStats;
}

export type Orientation = 'straight' | 'gay' | 'bi' | 'ace';

export type RomanceKind = 'courtship' | 'lovers' | 'affair';

/** A romantic relationship between two consenting adults. */
export interface Romance {
  id: string;
  /** The one who started it. */
  a: string;
  b: string;
  kind: RomanceKind;
  /** Kept from the world (affairs and, in 1960, any same-sex couple). */
  secret: boolean;
  since: number;
  /** 0-100: how close it is to coming out. */
  exposure: number;
  /** Week it was discovered, and by whom (a spouse, the crew, a rival, the papers). */
  discovered?: number;
  discoveredBy?: string;
  /** Started to get even with a cheating spouse. */
  revenge?: boolean;
  ended?: number;
  endReason?: string;
}

export interface Pregnancy {
  id: string;
  motherId: string;
  /** The biological father. */
  fatherId: string;
  romanceId?: string;
  dueWeek: number;
}

export interface RomanceStats {
  courtships: number;
  affairs: number;
  lovers: number;
  marriages: number;
  ended: number;
  discovered: number;
  pregnancies: number;
  births: number;
  hiddenPaternity: number;
  truthOut: number;
  separations: number;
  rejected: number;
}

export interface RomanceState {
  rng: number;
  rels: Romance[];
  pregnancies: Pregnancy[];
  cooldowns: Record<string, number>;
  /** Separations (and the rare divorce). */
  separations: { a: string; b: string; week: number; divorce?: boolean }[];
  /** Children whose real father is now known to everyone. */
  truth: string[];
  /** Romance id -> week until which a couple is protected from the papers. */
  hushed: Record<string, number>;
  /** Recent discoveries for the alert rail (most recent last). */
  alerts: { week: number; romanceId: string; text: string }[];
  stats: RomanceStats;
}

/** Effect ops of the story pillar (applied through the one effect pipeline). */
export type StoryOp =
  | { op: 'secret'; charId: string; kind: SecretKind; knownBy: FactionId[]; text?: string }
  /** Two consenting adults begin a romance (the kind follows from who is married). */
  | { op: 'romance'; a: string; b: string; revenge?: boolean }
  | { op: 'endRomance'; romanceId: string; reason: string }
  | { op: 'marry'; a: string; b: string }
  | { op: 'separate'; a: string; divorce?: boolean }
  /** What the boss does about a child that is his by blood. */
  | { op: 'child'; childId: string; mode: 'acknowledge' | 'legitimize' | 'pay' | 'deny' }
  /** Someone said no to an advance. */
  | { op: 'rebuff'; by: string; of: string }
  /** Keep a secret couple out of the papers for a while. */
  | { op: 'hush'; romanceId: string };

export function ensureStory(s: GameState): StoryState {
  if (!s.story) {
    s.story = {
      rng: hashSeed(`${s.seed}:story`),
      fired: {},
      due: [],
      queued: [],
      spawned: {},
      lastRandom: -99,
      chains: {},
      stats: { shown: 0, chainParts: 0, chainsDone: 0, chainsEnded: 0, skipped: 0, history: 0 },
    };
  }
  return s.story;
}

export function ensureRomance(s: GameState): RomanceState {
  if (!s.romance) {
    s.romance = {
      rng: hashSeed(`${s.seed}:romance`),
      rels: [],
      pregnancies: [],
      cooldowns: {},
      separations: [],
      truth: [],
      hushed: {},
      alerts: [],
      stats: { courtships: 0, affairs: 0, lovers: 0, marriages: 0, ended: 0, discovered: 0, pregnancies: 0, births: 0, hiddenPaternity: 0, truthOut: 0, separations: 0, rejected: 0 },
    };
  }
  return s.romance;
}

/** Orientation from the seed and the id (fixed at birth, never rolled again, independent of traits). */
export function orientationFor(seed: string, id: string): Orientation {
  const r = (hashSeed(`${seed}:orient:${id}`) % 1000) / 1000;
  return r < 0.885 ? 'straight' : r < 0.94 ? 'gay' : r < 0.98 ? 'bi' : 'ace';
}
