/**
 * NPC MINDS (types). The shared cognition of the people who matter.
 *
 * A mind holds what an opinion number cannot: what the man NEEDS (eight
 * drives, weighted by his nature, his age and his station, each with how
 * satisfied it is), how he feels about it (a mood), what he WANTS (one
 * long ambition and a few short goals that come and go), what he BELIEVES
 * about the people around him (their loyalty, their strength, their money,
 * who did what, each with how sure he is, and he can be wrong), what he
 * REMEMBERS (events with an emotional weight that fades; grudges and debts
 * of gratitude), and what he is UP TO (a multi-step plan with preconditions
 * that can be interrupted and adapted). Every move a mind drives keeps its
 * motive chain (need, goal, belief, choice) for "Why did he do that?".
 *
 * Lives on `GameState.minds` (optional: made by the first week that needs
 * it; upgradeSave only tops up a save that already has it). Its dice are its
 * own (`MindsState.rng`): the main simulation's rolls never move because of
 * it. Keys are short: this goes into every save.
 */

export type Need = 'money' | 'respect' | 'safety' | 'power' | 'family' | 'pleasure' | 'revenge' | 'loyalty';
export const NEEDS: Need[] = ['money', 'respect', 'safety', 'power', 'family', 'pleasure', 'revenge', 'loyalty'];
export const NEED_LABEL: Record<Need, string> = {
  money: 'Money', respect: 'Respect', safety: 'Safety', power: 'Power', family: 'Family', pleasure: 'Pleasure', revenge: 'Revenge', loyalty: 'Loyalty',
};
/** What an unmet need sounds like ("he needs ..."). */
export const NEED_TEXT: Record<Need, string> = {
  money: 'needs money', respect: 'wants to be respected', safety: 'is afraid for his skin', power: 'wants more say', family: 'worries about his family',
  pleasure: 'wants his fun', revenge: 'wants to get even', loyalty: 'wants to do right by his people',
};

export type Mood = 'content' | 'proud' | 'restless' | 'angry' | 'afraid' | 'greedy' | 'grieving' | 'scheming' | 'loyal';
export const MOOD_TEXT: Record<Mood, string> = {
  content: 'Content', proud: 'Proud', restless: 'Restless', angry: 'Angry', afraid: 'Scared', greedy: 'Hungry for money', grieving: 'Grieving', scheming: 'Scheming', loyal: 'Devoted',
};

/** Long-term ambitions. */
export type AmbitionKind = 'made' | 'capo' | 'chair' | 'out' | 'avenge' | 'marry' | 'score' | 'rich' | 'crown' | 'keep';
export const AMBITION_TEXT: Record<AmbitionKind, string> = {
  made: 'Get made', capo: 'Run a crew of his own', chair: 'Sit in the boss\'s chair', out: 'Get out of the life', avenge: 'Avenge his blood',
  marry: 'Marry well', score: 'Make one big score', rich: 'Get rich', crown: 'Rule the Shore', keep: 'Keep his family safe',
};

export interface Ambition {
  k: AmbitionKind;
  /** Target (a character id) for avenge. */
  t?: string;
  /** Progress 0-100. */
  p: number;
  /** Week it took hold. */
  w: number;
}

/** Short-term goals, generated from the most urgent needs. */
export type GoalKind =
  | 'earn' | 'skim' | 'prove' | 'confront' | 'lielow' | 'protect' | 'following' | 'family' | 'indulge'
  | 'get_even' | 'smear' | 'serve' | 'expand' | 'befriend';
export const GOAL_TEXT: Record<GoalKind, string> = {
  earn: 'make some money', skim: 'put a little aside for himself', prove: 'prove himself', confront: 'have it out with someone', lielow: 'lie low',
  protect: 'find out who the rat is', following: 'build a following', family: 'take care of his family', indulge: 'enjoy himself',
  get_even: 'get even', smear: 'blacken a name quietly', serve: 'do right by the family', expand: 'take more ground', befriend: 'make friends where it counts',
};

export interface Goal {
  k: GoalKind;
  /** The need it answers. */
  n: Need;
  /** Target (a character id), if any. */
  t?: string;
  /** Priority 0-1. */
  pri: number;
  w: number;
  /** Dropped after this week if not renewed. */
  until: number;
}

/** What one man believes about another (values with confidence 0-1). */
export interface Belief {
  /** Loyalty / trustworthiness, -100..100 (to his own side; for the boss: to me). */
  t?: number;
  tc?: number;
  /** Strength, 0-100. */
  s?: number;
  sc?: number;
  /** Wealth, 0-100. */
  w?: number;
  wc?: number;
  /** Week last updated. */
  u: number;
}

/** "Who did what": the things people say happened. */
export type FactKind = 'hit' | 'rat' | 'skim' | 'courted' | 'plot' | 'killed' | 'weak';
export const FACT_TEXT: Record<FactKind, string> = {
  hit: 'hit our people', rat: 'talks to the law', skim: 'skims', courted: 'is being courted by another family', plot: 'is plotting', killed: 'killed', weak: 'is weaker than he looks',
};

export interface Fact {
  k: FactKind;
  /** Who did it (a character id). */
  by: string;
  /** To whom (a character id), if anyone. */
  on?: string;
  /** Confidence 0-1. */
  c: number;
  /** How he knows: saw it, was told, a rumor, or he made it up. */
  src: 'saw' | 'told' | 'rumor' | 'lie';
  /** Who told him. */
  from?: string;
  w: number;
  /** Hidden truth (never shown on a screen): is it so? */
  tr: boolean;
  /** The rumor it came from. */
  r?: string;
}

/** A remembered event. */
export type MemKind = 'slight' | 'favor' | 'grief' | 'betrayal' | 'gift' | 'talk' | 'win' | 'loss' | 'fear' | 'debt' | 'lie';
export interface Mem {
  w: number;
  k: MemKind;
  /** About whom (a character id). */
  who?: string;
  /** In his words, short. */
  t: string;
  /** Emotional weight, signed (-50..50). */
  v: number;
  /** Salience 0-1: fades with time. */
  s: number;
}

/** Multi-step plans. */
export type PlanKind = 'climb' | 'betray' | 'avenge' | 'score' | 'getout' | 'crush' | 'court';
export type StepKind =
  | 'prove' | 'favor' | 'ask'
  | 'befriend' | 'borrow' | 'welsh'
  | 'learn' | 'wait' | 'strike'
  | 'case' | 'crew' | 'pull'
  | 'save' | 'tell'
  | 'probe' | 'weaken' | 'ally' | 'deal';
export const PLAN_TEXT: Record<PlanKind, string> = {
  climb: 'Climbing: get noticed, do the boss a favor, ask for a crew',
  betray: 'Working an angle: befriend him, borrow from him, leave him holding the bag',
  avenge: 'Settling a score: find out who, wait for the moment, strike',
  score: 'A score: case it, pick a partner, pull it',
  getout: 'Getting out: put money aside, tell the boss',
  crush: 'Pushing on a rival: probe him, weaken him, hit him',
  court: 'Courting a family: friendly words, then a deal',
};
export const STEP_TEXT: Record<StepKind, string> = {
  prove: 'get noticed', favor: 'do the boss a favor', ask: 'ask for his own crew',
  befriend: 'get close to him', borrow: 'borrow from him', welsh: 'leave him holding the bag',
  learn: 'find out who did it', wait: 'wait for the moment', strike: 'strike',
  case: 'case the job', crew: 'pick a partner', pull: 'pull it',
  save: 'put money aside', tell: 'tell the boss',
  probe: 'test them', weaken: 'take their ground', ally: 'make friendly overtures', deal: 'offer a deal',
};

export interface Plan {
  k: PlanKind;
  /** Target (a character id). */
  t?: string;
  steps: StepKind[];
  /** Current step. */
  i: number;
  /** Week started, week the current step started. */
  w: number;
  sw: number;
  /** Times it was adapted (retargeted / re-ordered). */
  ad: number;
  /** Why (a motive chain, short). */
  why: string;
}

/** "Why did he do that?": the chain behind one act. */
export interface Motive {
  w: number;
  /** What he did. */
  a: string;
  n: Need;
  /** The goal or plan it served. */
  g?: string;
  /** The belief it rested on. */
  b?: string;
  /** The choice: what he weighed it against. */
  c?: string;
  /** Done in secret: the screens show it only once the boss could know. */
  h?: 1;
}

/** Plans worked in secret (their steps' motives are hidden). */
export const SECRET_PLANS: PlanKind[] = ['betray', 'score'];

export interface Mind {
  id: string;
  /** Satisfaction per need (NEEDS order), 0-100. */
  sat: number[];
  mood: Mood;
  /** Valence -100..100. */
  mv: number;
  amb?: Ambition;
  goals: Goal[];
  /** Beliefs by subject id. */
  bel: Record<string, Belief>;
  facts: Fact[];
  mem: Mem[];
  plan?: Plan;
  why: Motive[];
  /** Week he last thought things over. */
  th: number;
  /** Relation-modifier ids already turned into memories (recent only). */
  seen?: string[];
  /** Plan kinds he will not start again before this week (after one is done or dropped). */
  pc?: Partial<Record<PlanKind, number>>;
}

/** A rumor going around. */
export interface Rumor {
  id: string;
  k: FactKind;
  by: string;
  on?: string;
  /** Is it so (as first told)? */
  tr: boolean;
  /** Who started it. */
  o: string;
  w: number;
  /** Who has heard it (capped). */
  h: string[];
}

export interface MindsState {
  v: 1;
  rng: number;
  n: number;
  minds: Record<string, Mind>;
  rumors: Rumor[];
  /** Week the roster of important people was last drawn up. */
  roster: number;
  /** The boss's sit-down talks today (absolute day, count). */
  talk?: { d: number; n: number };
  /** What the boss heard in talks (fact rumors told to him), most recent last. */
  heard: { w: number; from: string; text: string; c: number }[];
  /** Decisions settled in the two-way window, right away (dialogue.ts), most recent last. */
  settled?: { w: number; text: string }[];
  stats: { thinks: number; plans: number; done: number; failed: number; adapted: number; rumors: number; lies: number; talks: number };
}

/** Weeks before the same kind of plan is taken up again. */
export const PLAN_COOLDOWN = 26;
/** Most full minds kept at once. */
export const MAX_FULL = 28;
/** Think steps a week (each full mind thinks about every two weeks). */
export const THINK_BUDGET = 16;
export const MEM_CAP = 10;
export const FACT_CAP = 8;
export const BEL_CAP = 8;
export const WHY_CAP = 5;
export const GOAL_CAP = 3;
export const RUMOR_CAP = 24;
export const HEARD_CAP = 12;
