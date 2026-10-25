import { hashSeed } from './rng';
import type { FactionId, GameState } from './types';

/**
 * Making your bones: the state of the requirement that an associate prove
 * himself on a serious job for the family before his name can go to
 * Philadelphia. Rolls on its own seeded stream (`bones.rng`); outcomes of
 * a job are a pure hash of the seed and the job, so they never reshuffle
 * the main simulation's dice and replay exactly.
 */

export type BonesJobKind = 'hit' | 'heist' | 'collection' | 'pinch';
/** How a prospect handles the job: does it, freezes, talks too much afterward, or goes at it like a hothead. */
export type BonesOutcome = 'clean' | 'froze' | 'talked' | 'hothead';

/** One line on a man's record: he made his bones. */
export interface BonesEntry {
  week: number;
  year: number;
  /** "the Garden Pier job" */
  job: string;
  kind: BonesJobKind;
  /** shooter · on the team · on the crew · collector · stood up */
  role: string;
  text: string;
  /** False when the family only has his word for it (his report has not been checked). */
  verified?: boolean;
}

/** A job a prospect has been put on to make his bones (yours or a rival's). */
export interface BonesJob {
  id: string;
  owner: FactionId;
  prospectId: string;
  sponsorId: string;
  kind: BonesJobKind;
  name: string;
  startWeek: number;
  dueWeek: number;
  /** A rival's job aimed at your people: the man or the place. */
  targetId?: string;
  targetBizId?: string;
  /** A hit he joined (a player murder scheme). */
  schemeId?: string;
  /** You heard about a rival's job in time and put men on it. */
  guarded?: boolean;
  /** The warning has been shown. */
  warned?: boolean;
}

export interface BonesHistory {
  week: number;
  owner: FactionId;
  prospectId: string;
  kind: BonesJobKind;
  name: string;
  outcome: BonesOutcome;
  /** For a rival's job on your people: what it cost you. */
  onYou?: string;
}

export interface BonesState {
  rng: number;
  jobs: BonesJob[];
  /** Associates Philadelphia agreed to make without bones (a favor), by week. */
  waived: Record<string, number>;
  /** Rival prospect per rival family. */
  rivalProspects: Partial<Record<FactionId, string>>;
  history: BonesHistory[];
  cooldowns: Record<string, number>;
  stats: { jobs: number; made: number; froze: number; talked: number; hotheads: number; favors: number; rivalJobs: number; rivalOnYou: number; restless: number };
}

export function ensureBones(s: GameState): BonesState {
  if (!s.bones) {
    s.bones = {
      rng: hashSeed(`${s.seed}:bones`),
      jobs: [], waived: {}, rivalProspects: {}, history: [], cooldowns: {},
      stats: { jobs: 0, made: 0, froze: 0, talked: 0, hotheads: 0, favors: 0, rivalJobs: 0, rivalOnYou: 0, restless: 0 },
    };
  }
  return s.bones;
}

/** A stable roll in [0, 1) from the seed and some keys (no dice drawn). */
export function roll01(...parts: (string | number)[]): number {
  return hashSeed(parts.join('|')) / 4294967296;
}

/** Ops applied through the one effect pipeline (`{ type: 'bones', op }`). */
export type BonesOp =
  | { op: 'assign'; charId: string; sponsorId: string; kind: 'heist' | 'collection' | 'hit'; schemeId?: string }
  | { op: 'waive'; charId: string }
  | { op: 'pinch'; charId: string }
  | { op: 'guard'; jobId: string }
  | { op: 'note'; text: string };

/** Player orders (`{ kind: 'bones', op }`). */
export type BonesAction =
  | { op: 'assign'; charId: string; kind: 'heist' | 'collection' | 'hit'; schemeId?: string }
  | { op: 'favor'; charId: string };
