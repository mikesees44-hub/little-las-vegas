import type { FactionId, GameState, RivalId } from './types';

/**
 * HONEY (state): secrets, mistresses, and the women and men who keep score.
 * The layer under the women (women*.ts) and the night (nightlife*.ts, quickies.ts):
 *
 *  - CLAIMS: an affair with another man's wife (yours, a rival's, anybody's),
 *    once it is known, makes her "the boss's" in the island's eyes. Her
 *    husband's humiliation falls on her (he leaves, takes the kids to his
 *    mother's, cuts her off: implied, one line) and on the boss (revenge,
 *    defection, informing; a rival family's grievance; the crew split down
 *    the middle between the ones who admire it and the old school).
 *  - AGENTS: some women are working the boss: a rival family's spy, an FBI
 *    informant, the girl of one of his own low-level men feeding her fella,
 *    a set-up for a hit. The truth is hidden (`agents`); what the boss has
 *    seen is `watch` (warning signs, his suspicion, what he found out).
 *  - MISTRESSES as liabilities: a loud mouth leaks; a woman who wants
 *    something (money, an apartment, a ring, her brother a job, to be his
 *    wife) climbs from a hint to a threat to expose him (his wife, the feds,
 *    a rival family).
 *  - SCORN: the women and men who were wronged remember, and act.
 *
 * Rules that stay: adults only (re-checked at every list, commit and week);
 * non-explicit, fade to black, one-line reports; she always decides, nobody
 * is coerced; Mature content Off hides and stops all of it. Every roll is a
 * hash of (seed, week, purpose): the layer never moves the game's dice.
 * Lives on `GameState.honey` (optional: made by the weekly update the first
 * time there is something to keep; upgradeSave only tops up a save that has it).
 */

export const HONEY_HOURS: Record<'dare' | 'probe' | 'turn' | 'feed' | 'confront' | 'drop' | 'settle', number> = {
  dare: 0.5, probe: 0.5, turn: 1, feed: 0.5, confront: 1, drop: 1, settle: 1,
};

/** Who she really works for. */
export type AgentKind = 'rival' | 'fbi' | 'crew' | 'setup';
export const AGENT_TEXT: Record<AgentKind, string> = {
  rival: 'carries what she hears to another family',
  fbi: 'talks to the FBI',
  crew: 'feeds what she hears to one of your own men',
  setup: 'is setting you up for a hit',
};

/** The hidden truth about a woman working the boss (never shown until he knows). */
export interface Agent {
  id: string;
  kind: AgentKind;
  /** Who gets what she hears: a family, the law, or (crew) the player's own house. */
  master: FactionId;
  /** The man she reports to (her fella, a rival's capo); undefined for the FBI. */
  handler?: string;
  since: number;
  status: 'working' | 'turned' | 'fed' | 'burned' | 'done';
  /** Pieces of intelligence she passed. */
  intel: number;
  /** A set-up: the threat it became (threats.ts), once planned. */
  lure?: string;
}

/** What the boss has seen of a woman (visible: signs, his suspicion, what he learned). */
export interface Watch {
  id: string;
  susp: number;
  signs: [number, string][];
  /** He knows what she is (week). */
  known?: number;
  /** He looked and found nothing (week). */
  cleared?: number;
  /** How he found out. */
  how?: 'signs' | 'guard' | 'probe' | 'confessed' | 'late';
  /** The decision is waiting on him (event raised, week). */
  asked?: number;
}

export type Want = 'money' | 'apartment' | 'ring' | 'job' | 'wife';
export const WANT_TEXT: Record<Want, string> = {
  money: 'money of her own', apartment: 'an apartment in her name', ring: 'a ring, a real one', job: 'a job for her brother', wife: 'to be your wife',
};
export const WANT_COST: Record<Want, number> = { money: 1500, apartment: 2500, ring: 1200, job: 0, wife: 0 };

/** Who she says she will tell. */
export type Lever = 'wife' | 'feds' | 'rival';
export const LEVER_TEXT: Record<Lever, string> = { wife: 'your wife', feds: 'the FBI', rival: 'another family' };

export type SettleHow = 'pay' | 'promise' | 'bluff' | 'away' | 'consig' | 'worse';

/** A mistress as a liability. */
export interface Mistress {
  id: string;
  since: number;
  /** Loose lips 0-100. */
  mouth: number;
  want?: Want;
  /** 0 content, 1 a hint, 2 she asks, 3 she demands, 4 she threatens. */
  stage: 0 | 1 | 2 | 3 | 4;
  /** Next step (week). */
  next: number;
  lever?: Lever;
  /** The threat lands this week unless it is settled. */
  due?: number;
  /** A promise holds her until (week). */
  promised?: number;
  /** Money she has had. */
  paid: number;
  leaks: number;
  settled?: { week: number; how: string };
  /** Something the boss said that she means to hold him to (a promise broken). */
  broken?: number;
}

/** A married woman made "the boss's" in the island's eyes. */
export interface Claim {
  id: string;
  husband: string;
  since: number;
  /** What it cost her: he left, took the kids to his mother's, cut her off, or stayed in a cold house. */
  fallout: 'left' | 'kids' | 'cutoff' | 'cold';
  /** His family, if he is another family's man. */
  rival?: RivalId;
  /** Where it came from. */
  from: 'affair' | 'dare';
}

/** A wronged woman or man who remembers. */
export interface Scorn {
  id: string;
  kind: 'woman' | 'husband' | 'jilted';
  why: string;
  since: number;
  /** 0-100: how much it still burns. */
  heat: number;
  /** Week they last acted on it. */
  acted?: number;
  /** Times they acted. */
  n: number;
}

export interface HoneyState {
  v: 1;
  agents: Record<string, Agent>;
  watch: Record<string, Watch>;
  mistresses: Record<string, Mistress>;
  claims: Record<string, Claim>;
  scorn: Record<string, Scorn>;
  /** Women weighed once for whether they are working him (id -> week). */
  seen: Record<string, number>;
  /** Bold dares that went through (newest last, capped). */
  dares: { w: number; id: string; out: string; at: string }[];
  cool: Record<string, number>;
  log: [number, string][];
  stats: { dares: number; yes: number; agents: number; caught: number; turned: number; leaks: number; threats: number; settled: number; claims: number; scorned: number; acted: number; lures: number };
}

export function emptyHoneyStats(): HoneyState['stats'] {
  return { dares: 0, yes: 0, agents: 0, caught: 0, turned: 0, leaks: 0, threats: 0, settled: 0, claims: 0, scorned: 0, acted: 0, lures: 0 };
}

export function blankHoney(): HoneyState {
  return { v: 1, agents: {}, watch: {}, mistresses: {}, claims: {}, scorn: {}, seen: {}, dares: [], cool: {}, log: [], stats: emptyHoneyStats() };
}

/** The state (created lazily; upgradeSave tops up only a save that has it). */
export function ensureHoney(s: GameState): HoneyState {
  if (!s.honey) s.honey = blankHoney();
  const H = s.honey;
  H.agents ??= {};
  H.watch ??= {};
  H.mistresses ??= {};
  H.claims ??= {};
  H.scorn ??= {};
  H.seen ??= {};
  H.dares ??= [];
  H.cool ??= {};
  H.log ??= [];
  H.stats = { ...emptyHoneyStats(), ...(H.stats ?? {}) };
  return H;
}

/** Peek without creating (safe in render). */
export function honeyOf(s: GameState): HoneyState | undefined {
  return s.honey;
}
