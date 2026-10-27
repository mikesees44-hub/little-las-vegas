import { hashSeed } from './rng';
import type { GameState, RivalId, StoryEntry } from './types';

/**
 * THE AGING DON, THE SHADOW COURT & THE SUCCESSION WAR: state.
 *
 * Lives on `GameState.shadow` (optional, so older saves load; it is made the
 * first time the week runs) and rolls on its own seeded stream
 * (`shadow.rng`), so it never reshuffles the main simulation's dice.
 *
 * THREE LAYERS OF INFORMATION
 *  1. What really happened: the records below (sessions, petitions,
 *     promises, plans) are authoritative and never shown as such.
 *  2. What people believe: `know[charId][recordId]` — who attended, who
 *     heard later, and whether what they heard was distorted.
 *  3. What the Don learns: the same map under the boss's id (so an heir who
 *     sat in on a meeting knows it the day he takes the chair), and `views`
 *     for what he believes about who backs whom. The UI reads only this.
 *
 * Builds on what already exists: the underboss as a person (underboss.ts:
 * his career goal, patronage book), his authority level and favors
 * (tributeState.ts), hidden ambitions and the designation (heir.ts),
 * grievances (grievances.ts), the Ears (ears.ts), factions and defections.
 */

export type PlanGoal =
  | 'support_heir' | 'support_underboss' | 'seek_promotion' | 'build_influence' | 'remain_neutral'
  | 'leave_organization' | 'seek_leadership' | 'repair_grievance' | 'build_business';

/** A man's private plan for the future (never shown unless the Don has learned it). */
export interface PrivatePlan {
  goal: PlanGoal;
  /** Whom he wants in the chair next (a character id; his own id = himself). */
  prefer?: string;
  /** 0-100: how sure he is. */
  conf: number;
  since: number;
  /** The top reasons, plain words ("Vincent lent him $800"). */
  why: string[];
  /** Whom he backed before the last change, and when it changed. */
  was?: string;
  changed?: number;
}

export type PetSubject = 'promotion' | 'financial_dispute' | 'business_opportunity' | 'member_grievance' | 'succession' | 'organizational_policy';
export type PetTo = 'don' | 'ub' | 'cons' | 'capo';
export type PetStatus = 'submitted' | 'under_review' | 'resolved' | 'rejected' | 'raised' | 'promised';

export interface ShPetition {
  id: string;
  by: string;
  subject: PetSubject;
  text: string;
  week: number;
  status: PetStatus;
  /** What was decided, in plain words (the truth). */
  decision?: string;
  /** Within the underboss's delegated authority. */
  authorized?: boolean;
  amount?: number;
  promiseId?: string;
}

/** A meeting the underboss held without the Don: a real, persistent event. */
export interface ShSession {
  id: string;
  week: number;
  presiding: string;
  participants: string[];
  petitions: ShPetition[];
  auth: 'delegated' | 'acting_authority' | 'unauthorized';
  where: string;
}

export type PromiseStatus = 'outstanding' | 'fulfilled' | 'broken' | 'disputed';

export interface ShPromise {
  id: string;
  week: number;
  maker: string;
  to: string;
  /** What was promised ("his own crew", "underboss", "a bigger end"). */
  role: string;
  /** The agreed terms, in his words. */
  terms: string;
  condition: string;
  status: PromiseStatus;
  witnesses: string[];
  sessionId?: string;
  confidential: boolean;
  settled?: number;
}

export type KnowLvl = 'rumor' | 'confirmed';
/** What one person believes about one record. */
export interface Belief {
  lvl: KnowLvl;
  /** Week learned. */
  w: number;
  /** How (attended, "Sal at the morning meeting", "an Ear at the Starlight"). */
  via: string;
  /** What he heard, when it differs from the truth. */
  txt?: string;
  /** The version he heard is distorted. */
  wrong?: 1;
}

/** What the Don believes one man's plan is. */
export interface BackSeen {
  prefer?: string;
  goal?: PlanGoal;
  lvl: KnowLvl;
  w: number;
  via: string;
}

export type RivalStance = 'steady' | 'probe' | 'renegotiate' | 'court' | 'recruit' | 'warn';
export interface RivalRead {
  stance: RivalStance;
  /** Their favorite successor. */
  favor?: string;
  /** The pressure they believe (may be wrong). */
  thinks: number;
  w: number;
  /** What the Don knows of it. */
  known?: KnowLvl;
  moves: number;
}

export type TemplateId =
  | 'own_court' | 'unheard_promise' | 'young_capo' | 'unwanted_son' | 'secret_heir' | 'sick_don'
  | 'real_leader' | 'rival_favorite' | 'refused_boss' | 'consig_compromise' | 'wouldnt_retire' | 'split_family';

/** One of the twelve story templates, playing out as an event chain. */
export interface ShStory {
  id: string;
  tpl: TemplateId;
  stage: number;
  since: number;
  /** Week of the next beat. */
  next: number;
  /** The people in it, by role ("ub", "capo", "heir", "rival"...). */
  cast: Record<string, string>;
  /** Waiting on the Don's answer to this event (iid) since week. */
  waiting?: { iid: string; since: number };
  outcome?: string;
  ended?: number;
  /** The Don knows this story is going on. */
  known: boolean;
  log: StoryEntry[];
}

export type SuccessionOutcome = 'peaceful' | 'kingmaker' | 'contested' | 'usurped' | 'split' | 'acting' | 'ub_retired' | 'ub_succeeded';

export interface ShSuccession {
  week: number;
  fromId: string;
  toId: string;
  why: 'death' | 'retire' | 'other';
  outcome: SuccessionOutcome;
  ubId?: string;
  /** Support shares (0-100) at the moment of the transition. */
  support: Record<string, number>;
  text: string;
}

export interface Splinter {
  id: string;
  leaderId: string;
  memberIds: string[];
  week: number;
  /** Came back (reunified) in this week. */
  back?: number;
}

export interface Whisper {
  capoId: string;
  day: number;
  recId: string;
  text: string;
}

export interface ShadowStats {
  sessions: number;
  petitions: number;
  toDon: number;
  toUb: number;
  promises: number;
  broken: number;
  unauthorized: number;
  learned: number;
  /** Records the Don learned 8+ weeks after they happened. */
  lateLearned: number;
  maxLag: number;
  rivalMoves: number;
  rivalWarnings: number;
  stories: number;
  storiesEnded: number;
  successions: number;
  planChanges: number;
  heirLostBackers: number;
  financialTies: number;
}

export interface ShadowState {
  v: 1;
  rng: number;
  plans: Record<string, PrivatePlan>;
  /** Petitions waiting for the underboss's next meeting. */
  pending: ShPetition[];
  sessions: ShSession[];
  promises: ShPromise[];
  /** Layer 2 and 3: who believes what about which record (charId -> recId -> belief). */
  know: Record<string, Record<string, Belief>>;
  /** Layer 3: what the Don believes about who backs whom (manId -> what he heard). */
  views: Record<string, BackSeen>;
  stories: ShStory[];
  rivals: Record<string, RivalRead>;
  plant?: { kind: 'ear' | 'man'; id: string; since: number; until: number; blown?: number; reports: number };
  /** Petitions by recipient, a row a week: [week, don, ub, cons, capos]. */
  aud: [number, number, number, number, number][];
  /** Monthly history: [week, pressure, declared heir's true support share, his support as the Don knows it]. */
  hist: [number, number, number, number][];
  heirOf?: string;
  /** Things the underboss brought to the Don himself (the Sit-Down shows them). */
  raised: { id: string; week: number; by: string; petId: string; sessionId: string }[];
  /** This week's check-in hints (computed at the end of the week before). */
  whispers: Whisper[];
  /** Persistent character memories of the succession (charId -> entries, capped). */
  mem: Record<string, StoryEntry[]>;
  emeritus?: { id: string; since: number; mode: 'consigliere' | 'emeritus' };
  /** The Don this state was last run for (a change is a transition). */
  donId?: string;
  /** The underboss as of last week (was the new boss the underboss?). */
  ubWas?: string;
  successions: ShSuccession[];
  splinters: Splinter[];
  /** Acting authority the underboss holds until a week (sickness, a young heir). */
  actingUntil?: number;
  cool: Record<string, number>;
  /** Week the Don last held a family council on the succession. */
  council?: number;
  lastMonth?: string;
  stats: ShadowStats;
}

export function blankShadowStats(): ShadowStats {
  return { sessions: 0, petitions: 0, toDon: 0, toUb: 0, promises: 0, broken: 0, unauthorized: 0, learned: 0, lateLearned: 0, maxLag: 0, rivalMoves: 0, rivalWarnings: 0, stories: 0, storiesEnded: 0, successions: 0, planChanges: 0, heirLostBackers: 0, financialTies: 0 };
}

function fresh(s: GameState): ShadowState {
  return {
    v: 1, rng: hashSeed(`${s.seed}:shadow`), plans: {}, pending: [], sessions: [], promises: [], know: {}, views: {}, stories: [], rivals: {},
    aud: [], hist: [], raised: [], whispers: [], mem: {}, successions: [], splinters: [], cool: {}, stats: blankShadowStats(),
  };
}

/** The shadow state (created on first use; an older save gets one lazily and keeps what it has). */
export function ensureShadow(s: GameState): ShadowState {
  if (!s.shadow) {
    s.shadow = fresh(s);
    return s.shadow;
  }
  const t = s.shadow as unknown as Record<string, unknown>;
  const d = fresh(s) as unknown as Record<string, unknown>;
  for (const k of Object.keys(d)) {
    if (t[k] === undefined) t[k] = d[k];
    else if (k === 'stats') {
      const tv = t[k] as Record<string, unknown>, dv = d[k] as Record<string, unknown>;
      for (const kk of Object.keys(dv)) if (tv[kk] === undefined) tv[kk] = dv[kk];
    }
  }
  return s.shadow;
}

/** Read-only view for the UI (a blank state when the layer has not run yet; never mutates). */
export function shadowView(s: GameState): ShadowState {
  return s.shadow ?? fresh(s);
}

/** Orders the Don gives about the succession (through `{ kind: 'power', op: { op: 'shadow', a } }`). */
export type ShadowAction =
  | { op: 'report' }
  | { op: 'authority'; level: 'routine' | 'operational' | 'executive' | 'acting' }
  | { op: 'test'; charId: string }
  | { op: 'meet'; charId: string }
  | { op: 'reward'; charId: string }
  | { op: 'plant'; kind: 'ear' | 'man'; id: string }
  | { op: 'confront' }
  | { op: 'council' }
  | { op: 'honor'; promiseId: string }
  | { op: 'disown'; promiseId: string }
  | { op: 'retire'; mode: 'florida' | 'consigliere' | 'emeritus' }
  | { op: 'reunite'; splinterId: string };

/** State changes the shadow court's choices make (shown as named chips). */
export type ShadowOp =
  | { op: 'story'; id: string; choice: string }
  | { op: 'learn'; recId: string; lvl: KnowLvl; via: string }
  | { op: 'learnAll'; via: string; max: number }
  | { op: 'note'; text: string };

export type { RivalId };

/**
 * Someone hears of a fact from the living district (livingKnow.ts). The same
 * record of belief and the same rule as `learn` (never downgrades; a rumor may
 * carry a distorted version), kept in the same map so "what the boss knows" is
 * one place; the succession court's own statistics are left alone.
 */
export function learnFact(s: GameState, viewer: string, recId: string, lvl: KnowLvl, via: string, txt?: string, wrong?: boolean): boolean {
  const sh = ensureShadow(s);
  const k = (sh.know[viewer] ??= {});
  const was = k[recId];
  if (was && (was.lvl === 'confirmed' || lvl === 'rumor')) return false;
  k[recId] = { lvl, w: s.week, via, ...(txt && lvl === 'rumor' ? { txt } : {}), ...(wrong && lvl === 'rumor' ? { wrong: 1 as const } : {}) };
  return true;
}

/** Forget beliefs about records that no longer exist (the living district prunes old facts). */
export function forgetFacts(s: GameState, keep: (recId: string) => boolean, prefix: string): void {
  const sh = s.shadow;
  if (!sh) return;
  for (const viewer of Object.keys(sh.know)) {
    const k = sh.know[viewer];
    for (const id of Object.keys(k)) if (id.startsWith(prefix) && !keep(id)) delete k[id];
    if (!Object.keys(k).length) delete sh.know[viewer];
  }
}


