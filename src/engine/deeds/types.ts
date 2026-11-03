/**
 * DEEDS (types). The CK-style person-to-person interactions, used the same
 * way by the boss and by everyone else: a capo asks you for a favor, a rival
 * sends an insult, a smooth talker calls on your wife, two hotheads in one
 * crew go at each other. One catalog (catalog.ts), one acceptance engine
 * (accept.ts: every point of the odds has a reason), one resolver
 * (resolve.ts: success, failure, the critical ends), one set of personality
 * weights (weights.ts) read both ways: what a man WANTS to do, and how he
 * TAKES what is done to him.
 *
 * `GameState.deeds` is optional (made by the first week that needs it;
 * upgradeSave only tops up a save that has it). Its dice are its own. Keys
 * are short: this goes into every save, and every list is capped.
 */

export type DeedCat = 'diplomacy' | 'intrigue' | 'business' | 'family' | 'crew';
export const DEED_CATS: DeedCat[] = ['diplomacy', 'intrigue', 'business', 'family', 'crew'];
export const DEED_CAT_LABEL: Record<DeedCat, string> = {
  diplomacy: 'Diplomacy', intrigue: 'Intrigue', business: 'Business', family: 'Family', crew: 'Crew',
};

export type DeedId =
  /* diplomacy */
  | 'befriend' | 'flatter' | 'feast' | 'sway' | 'askFavor' | 'callFavor' | 'alliance' | 'demandRespect' | 'insult' | 'threaten'
  /* intrigue */
  | 'findSecrets' | 'fabricateHook' | 'blackmail' | 'envelope' | 'plantRumor' | 'turn' | 'court' | 'frame'
  /* business */
  | 'offerPiece' | 'buyOut' | 'partner' | 'askLoan' | 'lend'
  /* family */
  | 'legitimize' | 'disown' | 'educate'
  /* crew */
  | 'recognize' | 'discipline';

/**
 * The personality axes. Every trait leans on some of them (weights.ts), and
 * every deed is made of some of them: what makes a man reach for it (`act`)
 * and how it lands on the man it is done to (`recv`).
 */
export type Axis = 'violence' | 'money' | 'risk' | 'power' | 'social' | 'trust' | 'scheme' | 'honor' | 'loyalty' | 'romance' | 'pride';
export const AXES: Axis[] = ['violence', 'money', 'risk', 'power', 'social', 'trust', 'scheme', 'honor', 'loyalty', 'romance', 'pride'];

/**
 * How the other side's answer is decided:
 *  - consent: he decides (acceptance %, his reasons);
 *  - odds: it works or it doesn't (success %, your skill against his guard);
 *  - order: it is done (certain); only how he takes it varies.
 */
export type DeedMode = 'consent' | 'odds' | 'order';

export type Tier = 'crit' | 'success' | 'fail' | 'critFail';
export const TIER_LABEL: Record<Tier, string> = { crit: 'Better than hoped', success: 'Success', fail: 'Failure', critFail: 'Disaster' };

/** A standing tie between two people (clash.ts), keyed by the sorted pair. */
export type TieKind = 'friend' | 'ally' | 'rival' | 'feud' | 'lovers';
export const TIE_LABEL: Record<TieKind, string> = { friend: 'Friends', ally: 'Allies', rival: 'Rivals', feud: 'Blood feud', lovers: 'Sweethearts' };
export interface Tie {
  k: TieKind;
  /** Week it formed. */
  w: number;
  /** Why, in a few words ("Two hotheads in one room"). */
  y: string;
}

/** One deed done (by anyone), for the feed, the leans panel and the voice. */
export interface DeedLog {
  w: number;
  id: DeedId;
  a: string;
  t: string;
  r: Tier;
  /** The engine's line (what happened). */
  x: string;
  /** Odds it was rolled at (0-100). */
  p: number;
}

/** A favor owed: `by` owes `to` (spent by Call in a favor). */
export interface Owed { by: string; to: string; w: number; y: string }

/** A hook one NPC holds on another (the boss's hooks live in `s.hooks`). */
export interface NpcHook { h: string; t: string; s: 0 | 1; w: number; y: string }

/** Something an NPC asked of the boss, waiting for the popup pipeline (npc.ts). */
export interface Ask {
  id: string;
  d: DeedId | 'clash' | 'wife';
  a: string;
  /** The other party (clash: the second man; wife: the boss's wife). */
  t?: string;
  w: number;
  /** Odds / score it was made at. */
  p: number;
  /** Extra (money asked, the clash's reason). */
  n?: number;
  y?: string;
}

/** A follow-up authored scene (authored/run.ts) waiting for its week. */
export interface SceneDue { id: string; at: number; cast: Record<string, string>; from?: string }

export interface DeedsState {
  v: 1;
  rng: number;
  /** Cooldowns: "deed:actor:target" -> the week it may be done again. */
  cd: Record<string, number>;
  /** Ties: "a|b" (sorted ids) -> the tie. */
  ties: Record<string, Tie>;
  /** The latest deeds, most recent last (capped). */
  log: DeedLog[];
  owed: Owed[];
  hooks: NpcHook[];
  asks: Ask[];
  /** Week each NPC last acted on his own (npc.ts). */
  last: Record<string, number>;
  /** Pairs already surfaced to the boss: "a|b:kind" -> week. */
  told: Record<string, number>;
  /** Children being educated: child id -> [tutor id, focus attribute, since week]. */
  edu: Record<string, [string, string, number]>;
  /** Authored scenes: id -> week last fired; follow-ups due. */
  sc: Record<string, number>;
  due: SceneDue[];
  /** Week the clashes were last weighed. */
  cw: number;
  pt: Partnership[];
  ln: Loan[];
  stats: { done: number; npc: number; asks: number; ties: number; scenes: number };
  /** Settled in the moment this week (now.ts): one entry per order, so a double click is one order. */
  now?: { w: number; k: string[] };
}

/** Effect ops of the deeds layer (the `deed` Effect). */
export type DeedOp =
  /** Record a deed's result (log, cooldown, memories, ties) after its effects landed. */
  | { op: 'note'; id: DeedId; a: string; t: string; r: Tier; x: string; p: number; cd: number }
  /** A favor now owed. */
  | { op: 'owe'; by: string; to: string; y: string }
  /** Spend an owed favor. */
  | { op: 'spendOwed'; by: string; to: string }
  /** An NPC hook. */
  | { op: 'npcHook'; h: string; t: string; s: 0 | 1; y: string }
  /** A memory in his mind (minds/): "he remembers ...". */
  | { op: 'mem'; who: string; about: string; t: string; v: number }
  /** Set or break a tie. */
  | { op: 'tie'; a: string; b: string; k?: TieKind; y: string }
  /** Educate a child: a tutor and a focus. */
  | { op: 'edu'; child: string; tutor: string; focus: string }
  /** The boss answered an ask (drops it from the queue). */
  | { op: 'answered'; ask: string }
  /** A rumor planted (minds/ rumors): about `on`, of this kind, by `by`. */
  | { op: 'rumor'; by: string; on: string; k: 'skim' | 'rat' | 'weak' | 'plot' }
  /** An authored scene: fired (cooldown/once) / a choice whose odds roll now / a follow-up / a flag. */
  | { op: 'sceneFired'; id: string }
  | { op: 'sceneRoll'; id: string; c: number; cast: Record<string, string>; p: number }
  /** A code event's choice with odds (pressure.ts, setPieces.ts): rolled on the deeds' dice when the answer lands. */
  | { op: 'gamble'; p: number; ok: import('../types').Effect[]; bad: import('../types').Effect[]; okText: string; badText: string; label: string }
  | { op: 'sceneNext'; id: string; after: [number, number]; cast: Record<string, string>; from: string }
  /** Run a deed between two NPCs now (from a scene). */
  | { op: 'npcDeed'; id: DeedId; a: string; t: string }
  /** A partnership: both draw a monthly share for a year. */
  | { op: 'partner'; a: string; b: string; n: number }
  /** A loan to be paid back (with interest) at `due`. */
  | { op: 'loan'; by: string; to: string; amt: number; due: number }
  /** The boss acknowledges his child; disowns one of his house. */
  | { op: 'legit'; child: string; father: string }
  | { op: 'disown'; who: string }
  /** The reactions to a decision (reactions/): first in a choice's effects, so they are read before the rest lands. */
  | { op: 'react'; d: import('../reactions/types').Decision };

/** A partnership (both draw `n` a month for a year from week `w`). */
export interface Partnership { a: string; b: string; w: number; n: number }
/** A loan: `to` owes `by` `amt` (interest included) at week `due`. */
export interface Loan { by: string; to: string; amt: number; due: number }

/** The player's order: do a deed to someone. `via`: a third party (the cop for a frame). */
export interface DeedAction { id: DeedId; target: string; via?: string; hook?: boolean }

export const LOG_CAP = 40;
export const OWED_CAP = 30;
export const HOOK_CAP = 30;
export const ASK_CAP = 6;
export const TIE_CAP = 120;
export const DUE_CAP = 12;
