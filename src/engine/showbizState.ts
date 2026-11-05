import { hashSeed } from './rng';
import type { GameState, RivalId } from './types';

/**
 * SHOWBIZ (state): the boss as an agent and a record man.
 *
 * - The bench: singers, vocal groups (one act with a lead), comics,
 *   bandleaders, dancers and actors working the shore. Each act is a real
 *   character (`s.characters`) with a compact record here: talent, draw,
 *   fame, ambition, contentment, who manages them, the deal, the gig.
 * - The ladder: the shore clubs, Atlantic City, New York, the Las Vegas
 *   showrooms, television, a Hollywood picture. Each rung wants draw,
 *   pull (a point in the room, a club of his own, favors, a famous friend)
 *   and a fee.
 * - The label back home: records pressed each season, the jukebox routes,
 *   radio play (payola, and the heat that comes with it), royalties, hits.
 *
 * HARD RULES: adults only (18+ on the day); every artist decides for
 * themselves (signing, renewing, leaving, suing, talking); the only
 * coercion is the boss's explicit choice to lean on a rival's office, and
 * that has consequences; nobody here is a real person or a room that still
 * operates.
 *
 * Lives on `GameState.showbiz` (optional: older saves get it the first
 * week) and rolls only on its own stream.
 */

export type ActKind = 'singer' | 'group' | 'comic' | 'band' | 'dancer' | 'actor';
export const KIND_LABEL: Record<ActKind, string> = {
  singer: 'Singer', group: 'Vocal group', comic: 'Comic', band: 'Bandleader', dancer: 'Dancer', actor: 'Actor',
};
/** Acts that can make a record (a comic makes a party album). */
export const RECORDS: ActKind[] = ['singer', 'group', 'band', 'comic'];

export type RungId = 'shore' | 'ac' | 'ny' | 'vegas' | 'tv' | 'film';
export interface Rung {
  id: RungId;
  name: string;
  /** The room (fictional, or long closed). */
  room: string;
  /** The act's draw it wants, 0-100. */
  draw: number;
  /** The boss's pull it wants (pullOf). */
  pull: number;
  /** The booking fee (the agent's travel, the maître d', the right lunches). */
  fee: number;
  /** The act's gross a week at the top of its draw. */
  pay: number;
  /** How long a booking runs. */
  weeks: number;
  /** How hard the room is to please (the notices). */
  diff: number;
}
export const RUNGS: Rung[] = [
  { id: 'shore', name: 'The shore clubs', room: 'a club on Pacific Avenue', draw: 0, pull: 0, fee: 0, pay: 220, weeks: 4, diff: 25 },
  { id: 'ac', name: 'Atlantic City', room: 'the 500 Club', draw: 25, pull: 1, fee: 250, pay: 520, weeks: 2, diff: 38 },
  { id: 'ny', name: 'New York', room: 'the Marquee Room on East 58th Street', draw: 45, pull: 2, fee: 700, pay: 950, weeks: 2, diff: 52 },
  { id: 'vegas', name: 'Las Vegas', room: 'the Silver Palms showroom on the Strip', draw: 60, pull: 3, fee: 1500, pay: 1700, weeks: 3, diff: 62 },
  { id: 'tv', name: 'Television', room: 'a Sunday-night variety hour out of New York', draw: 70, pull: 3, fee: 2000, pay: 2400, weeks: 1, diff: 68 },
  { id: 'film', name: 'Hollywood', room: 'a picture at a Hollywood studio', draw: 80, pull: 4, fee: 3000, pay: 1300, weeks: 8, diff: 74 },
];
export const RUNG_OF = Object.fromEntries(RUNGS.map((r, i) => [r.id, i])) as Record<RungId, number>;

/** A point in a room, bought through the outfit that owns a piece of it. */
export type RoomId = 'ac' | 'ny' | 'vegas';
export const ROOMS: Record<RoomId, { room: string; through: string; house?: string; rival?: RivalId; cost: number; div: number; respect: number }> = {
  ac: { room: 'the 500 Club', through: 'Philadelphia', rival: 'philly', cost: 3000, div: 30, respect: 30 },
  ny: { room: 'the Marquee Room', through: 'the Ruggeri family of Brooklyn', house: 'h_ruggeri', cost: 8000, div: 70, respect: 40 },
  vegas: { room: 'the Silver Palms', through: 'the Adlers, with the Chicago Outfit\'s okay', house: 'h_adler', cost: 15000, div: 120, respect: 50 },
};

/** Who manages an act: you, a rival family's office, or an independent agent. Absent: nobody (a free agent). */
export type Manager = 'p' | RivalId | 'ind';

export interface Deal {
  /** The agent's percentage of the act's gross. */
  pct: number;
  /** Week the contract runs out. */
  until: number;
  /** The advance paid at signing. */
  adv: number;
  since: number;
}

export interface Gig {
  /** Rung index. */
  r: number;
  room: string;
  until: number;
  /** At the boss's own club. */
  own?: 1;
}

export interface Act {
  /** The character. */
  id: string;
  k: ActKind;
  /** The group's name, or a stage name. */
  n?: string;
  tal: number;
  draw: number;
  fame: number;
  amb: number;
  /** Contentment with whoever manages them (with nobody: with life). */
  con: number;
  /** The highest rung played. */
  top: number;
  by?: Manager;
  deal?: Deal;
  gig?: Gig;
  /** Week of the last gig's end (for idleness). */
  idle?: number;
  /** What the boss has made from the act. */
  earn: number;
  /** The act's gross last week. */
  wk?: number;
  /** Publicity photo key (ui/showbiz/publicity.ts). */
  ph?: string;
  /** A local kid (from the island). */
  loc?: 1;
  /** Week of the last hit record. */
  hit?: number;
  /** The boss leaned on their office to get them (week): they know it. */
  lean?: number;
  /** A grudge against the boss (week). */
  grudge?: number;
  /** A buyout was offered and refused (week). */
  spurned?: number;
  /** A grateful star: a friend of the boss (week it began). */
  friend?: number;
  /** Week of the last scene (buyout, suit, talk): cooldown. */
  scene?: number;
  arr: number;
  h: [number, string][];
}

export interface Rec {
  id: string;
  act: string;
  title: string;
  /** Week pressed. */
  wk: number;
  /** Radio: 0 none, 1 a little something for the disc jockeys, 2 the full treatment. */
  radio: 0 | 1 | 2;
  /** Jukebox placements. */
  jb: number;
  /** Best chart reach: 0 local, 1 regional, 2 national. */
  reach: 0 | 1 | 2;
  sold: number;
  /** Royalties the label has taken. */
  roy: number;
  done?: 1;
}

export interface Label {
  name: string;
  home: 'Wildwood' | 'Philadelphia';
  since: number;
  recs: Rec[];
  /** How much the payola has been noticed, 0-100. */
  heat: number;
  /** Week of the last investigation. */
  probe?: number;
  hits: number;
}

export interface ShowbizState {
  v: 1;
  rng: number;
  acts: Record<string, Act>;
  /** Points in rooms (room -> week bought). */
  pts: Partial<Record<RoomId, number>>;
  label?: Label;
  seq: number;
  log: [number, string][];
  stats: { signed: number; gigs: number; left: number; hits: number; arrived: number };
}

export function blankShowbiz(s: GameState): ShowbizState {
  return { v: 1, rng: hashSeed(`${s.seed}:showbiz`), acts: {}, pts: {}, seq: 0, log: [], stats: { signed: 0, gigs: 0, left: 0, hits: 0, arrived: 0 } };
}

/** Peek without creating (safe in render). */
export function showOf(s: GameState): ShowbizState | undefined {
  return s.showbiz;
}

export type ShowbizAction =
  | { op: 'sign'; id: string; pct: number; weeks: number; adv: number; via?: string }
  | { op: 'buyout'; id: string; pct: number; weeks: number; adv: number }
  | { op: 'lean'; id: string }
  | { op: 'book'; id: string; rung: number }
  | { op: 'renew'; id: string; pct: number; weeks: number }
  | { op: 'release'; id: string }
  | { op: 'bonus'; id: string; amount: number }
  | { op: 'point'; room: RoomId }
  | { op: 'label'; home: 'Wildwood' | 'Philadelphia' }
  | { op: 'press'; id: string; radio: 0 | 1 | 2 }
  | { op: 'payola'; rec: string; radio: 0 | 1 | 2 };

/** What the effects carry out (the actions, their refusals, and the answers to the act's own scenes). */
export type ShowOp =
  | ShowbizAction
  | { op: 'no'; id: string; what: 'sign' | 'buyout' | 'lean' | 'renew' | 'book' | 'point'; rung?: number; room?: RoomId }
  | { op: 'buyme'; id: string; take: boolean; price: number }
  | { op: 'suit'; id: string; how: 'settle' | 'fight' | 'release'; price: number }
  | { op: 'probe'; how: 'lawyer' | 'dj' | 'stonewall' };
