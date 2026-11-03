/**
 * ARGUMENTS (types): conversation escalation. A heated decision (a dressing-
 * down, a refused request, a veteran passed over, an accusation, an affair in
 * the family brought into the open, a capo's proposal turned down) does not
 * end with the boss's choice: the man answers, there and then, and the boss
 * can answer him back, a few rounds at most, without leaving the window. The
 * people in the room may speak up on their own. It ends in a reconciliation,
 * a grudging truce, a walkout, a public split, or a man who swallows it (the
 * start of a plot). Everything lands in the persistent state: opinions,
 * fear, memories, grievances, rumors a week later, and story seeds that hand
 * the follow-up to the systems that already run stories (the grievance
 * ladder, the capos' plots, the minds' rumors, the authored scenes).
 *
 * `GameState.argue` is optional: made by the first argument (upgradeSave only
 * tops up a save that has it). Its dice are its own, so the main simulation's
 * rolls never move because of it.
 */

export type ArgKind = 'insult' | 'refuse' | 'passover' | 'accuse' | 'affair' | 'decline';

/** The boss's answers. Five at most on screen (the owner hates clutter). */
export type Reply = 'apologize' | 'double' | 'threaten' | 'dismiss' | 'mediate';
export const REPLIES: Reply[] = ['apologize', 'double', 'threaten', 'dismiss', 'mediate'];

/** How he carries himself this round (read from his nature, his mood, his fear, and what he hides). */
export type Posture = 'hot' | 'cold' | 'hurt' | 'scared' | 'smiling';
export const POSTURE_LABEL: Record<Posture, string> = { hot: 'Hot', cold: 'Cold', hurt: 'Hurt', scared: 'Scared', smiling: 'Smiling' };

export type ArgEnd = 'reconciled' | 'truce' | 'walkout' | 'split' | 'plot';
export const END_LABEL: Record<ArgEnd, string> = {
  reconciled: 'Reconciled', truce: 'A grudging truce', walkout: 'He walked out', split: 'A public split', plot: 'He swallowed it',
};
export const END_TONE: Record<ArgEnd, 'good' | 'plain' | 'bad'> = { reconciled: 'good', truce: 'plain', walkout: 'bad', split: 'bad', plot: 'plain' };

/** What a man in the room does when he speaks up on his own. */
export type Voice = 'peacemaker' | 'opportunist' | 'hothead' | 'loyalist';
export const VOICE_LABEL: Record<Voice, string> = { peacemaker: 'Peacemaker', opportunist: 'Taking notes', hothead: 'Backs his friend', loyalist: 'Backs the boss' };

/** One line of the exchange. `by`: a character id, 'boss', or '' for the narrator. */
export interface ArgLine {
  by: string;
  t: string;
  r?: Reply;
  v?: Voice;
  /** The reply landed (1) or not (0). */
  ok?: 0 | 1;
}

export interface Argument {
  id: string;
  k: ArgKind;
  /** The man the boss is arguing with. */
  t: string;
  /** The other man it is about (the young capo who got the chair, the wronged spouse). */
  about?: string;
  /** "You dressed Sal down in front of the capos". */
  label: string;
  w: number;
  /** Who is in the room (not the boss, not him): only they remember it first-hand. */
  room: string[];
  round: number;
  /** His temper, 0-100. Past the line he walks (or splits in public). */
  heat: number;
  /** How deep it cut (humiliation, injury), 0-100. What he carries out of the room. */
  hurt: number;
  pos: Posture;
  /** He is hiding something against the boss: he smiles and agrees (never shown as such). */
  mask?: 1;
  /** Chain depth: an argument born of a story seed is one deeper. */
  depth: number;
  /** Events used of the scene's budget (lines past the boss's own). */
  ev: number;
  /** Witnesses who already spoke up. */
  spoke: string[];
  used: Reply[];
  /** Fear of the boss gained in the room (applied when it ends). */
  fear: number;
  log: ArgLine[];
  end?: ArgEnd;
  /** The clear "done" line. */
  done?: string;
  /** Seeds it planted (ids). */
  seeds?: string[];
  /** The mediator who was asked in (id). */
  med?: string;
  src?: string;
}

/** Story seeds: what an argument may grow into. Stored apart from the stories they start. */
export type SeedKind =
  | 'allies' | 'plotDeep' | 'rumor' | 'mend' | 'shark' | 'skim' | 'feud' | 'courted' | 'wounded' | 'ratTalk' | 'vendetta' | 'scandal';

export const SEED_TEXT: Record<SeedKind, string> = {
  allies: 'He may look for friends who feel the way he does',
  plotDeep: 'He said all the right things',
  rumor: 'The story will get around, and grow on the way',
  mend: 'He may come back to make it right',
  shark: 'He may get the money somewhere worse',
  skim: 'He may take what he thinks he is owed',
  feud: 'There is bad blood between the two of them now',
  courted: 'Another family may hear he is unhappy',
  wounded: 'He will want to prove you wrong',
  ratTalk: 'The crew will look at him differently',
  vendetta: 'The other side of the family will want it settled',
  scandal: 'People will talk about the family',
};
/** Seeds the boss is never told about (he finds out the way he finds anything out). */
export const HIDDEN_SEEDS: SeedKind[] = ['plotDeep', 'skim'];

export interface Seed {
  id: string;
  k: SeedKind;
  who: string;
  about?: string;
  /** Week planted, week it grows. */
  w: number;
  due: number;
  /** The argument it came from. */
  from: string;
  /** Dedupe key: one seed of a kind about the same people at a time. */
  key: string;
  depth: number;
  /** Week it grew (into which system: the note). */
  done?: number;
  note?: string;
}

/** Second-hand: a man not in the room hears about it later, maybe exaggerated. */
export interface Hearsay {
  who: string;
  /** Who it is about (whose side of the story he takes away). */
  of: string;
  teller: string;
  arg: string;
  due: number;
  t: string;
  /** Emotional weight toward `of` (signed). */
  v: number;
  /** It grew in the telling. */
  big?: 1;
  /** What he comes to believe ('weak': the man backed down; 'plot': he is against the boss). */
  f?: 'weak' | 'plot';
}

export interface ArgLog { id: string; w: number; k: ArgKind; t: string; end: ArgEnd; done: string; room: string[] }

export interface ArgueState {
  v: 1;
  rng: number;
  n: number;
  /** The argument on screen (saved with the game: it resumes where it was). */
  live?: Argument;
  seeds: Seed[];
  hear: Hearsay[];
  hist: ArgLog[];
  /** No new argument with this man before this week. */
  cd: Record<string, number>;
  stats: { n: number; rounds: number; voices: number; seeds: number; grown: number; heard: number; ends: Partial<Record<ArgEnd, number>> };
}

/** Rounds the boss gets (after his opening decision). */
export const MAX_ROUNDS = 4;
/** Lines past the boss's own one argument may produce (interjections, narration): the event budget. */
export const EVENT_BUDGET = 9;
/** One interjection a round at most. */
export const VOICES_PER_ROUND = 1;
/** An argument born of a seed is one deeper; past this, a seed grows quietly and starts no argument. */
export const MAX_DEPTH = 2;
export const SEEDS_PER_ARG = 2;
export const SEED_CAP = 24;
export const HEAR_CAP = 40;
export const HEAR_PER_ARG = 6;
export const HIST_CAP = 30;
/** Weeks before the same man can be argued with again. */
export const COOLDOWN = 3;
/** Weeks before a seed of the same kind about the same man can be planted again. */
export const SEED_GAP = 26;
