import type { FactionId, GameState, RivalId } from './types';

/**
 * THE INTRIGUE LAYER's state (intrigue.ts): the eras between the families,
 * the spies both ways, the lies and rumors, the plots, the war ledgers.
 *
 * It keeps only intrigue FACTS (who spies on whom, which lies were told, what
 * the boss was told and what he later learned). It is not a belief or memory
 * system: the NPC mind layer (minds/) can read these facts through the small
 * API in intrigue.ts (spyReport, plantFalseBelief, onIntrigue) after merge.
 *
 * Optional on GameState: made by the weekly update from week 2; an old save
 * without it loads unchanged.
 */

/** Peace → Tension → Cold war → Open war → Truce/Settlement → Peace. */
export type Era = 'peace' | 'tension' | 'cold' | 'war' | 'truce';

export const ERA_LABEL: Record<Era, string> = {
  peace: 'Peace', tension: 'Tension', cold: 'Cold war', war: 'Open war', truce: 'Truce',
};
/** What each era means, in a line. */
export const ERA_RULES: Record<Era, string> = {
  peace: 'Business between the families: peace pays in money and respect. Marriages and joint ventures are on the table.',
  tension: 'Insults, men leaning on each other\'s corners, spies at work. A sit-down can still cool it.',
  cold: 'Sabotage, poaching, informants and proxy fights. Nobody has shot anybody. Yet.',
  war: 'Hits and mattresses. Heat everywhere, Philadelphia worried. A war that wins takes rackets, ground and tribute.',
  truce: 'A settlement: reparations, new borders. Crossing the border now is an insult twice over.',
};
export const ERA_ORDER: Record<Era, number> = { peace: 0, truce: 1, tension: 2, cold: 3, war: 4 };

/** One pair of families (the player and a family, or two families). */
export interface EraTrack {
  /** "player|kessler", "kessler|manno" (sorted for two rivals; the player always first). */
  key: string;
  a: FactionId;
  b: RivalId;
  era: Era;
  since: number;
  /** 0..100: how close to blood. Driven by real events, decays toward a baseline. */
  tension: number;
  /** The last thing that moved the era. */
  cause: string;
  /** [week, era, cause], newest last (capped). */
  hist: [number, Era, string][];
  /** A settlement in force (truce era). */
  settlement?: Settlement;
}

export interface Settlement {
  week: number;
  until: number;
  /** Weekly payment: positive = they pay you, negative = you pay them. */
  weekly: number;
  /** The district the war was over: the new border. */
  border?: string;
  text: string;
  paid: number;
}

export type SpyHow = 'planted' | 'bribe' | 'blackmail' | 'debt' | 'woman';
export const SPY_HOW_LABEL: Record<SpyHow, string> = {
  planted: 'One of yours, planted inside', bribe: 'Bought with an envelope', blackmail: 'Turned with what you know', debt: 'Turned by a debt', woman: 'Turned through a woman',
};

/** A man reporting to someone outside his own family. */
export interface Spy {
  id: string;
  charId: string;
  /** Who he reports to. */
  master: FactionId;
  /** The family he sits inside. */
  inside: FactionId;
  how: SpyHow;
  since: number;
  /** 0..100: how well his cover holds. */
  cover: number;
  /** Doubled: the family he sits in found him and feeds his master lies through him (the master does not know). */
  doubled?: FactionId;
  /** Week his cover was blown / he was pulled out. */
  ended?: number;
  endedWhy?: string;
}

export type IntelKind = 'plan' | 'money' | 'weakman' | 'strength' | 'report';

/** What the boss was told, and (later) what he learned. */
export interface Intel {
  id: string;
  week: number;
  /** The spy (Spy.id) or the man who told him (character id). */
  spyId?: string;
  sourceId?: string;
  about: FactionId;
  kind: IntelKind;
  told: string;
  truth: string;
  /** Was it true when told? Hidden from the boss until learned. */
  true: boolean;
  /** The man it names (a weak man to turn). */
  subjectId?: string;
  /** Week the truth comes out. */
  learnAt: number;
  learned?: number;
  /** Self-serving: the teller had his own reason to say it. */
  motive?: string;
}

export type LieKind = 'deny' | 'bluff' | 'falseflag' | 'rumor' | 'forgery' | 'report' | 'canary';

export interface Lie {
  id: string;
  week: number;
  /** 'player', a family, or a character id (a man of yours lying to you). */
  teller: string;
  /** Who was lied to: a family or 'player'. */
  to: FactionId;
  kind: LieKind;
  text: string;
  truth: string;
  /** A third family named for something it did not do. */
  blame?: RivalId;
  /** Weekly chance it comes out. */
  risk: number;
  via?: 'paper' | 'gossip' | 'sitdown' | 'word';
  discovered?: number;
  /** Safe after this week. */
  until: number;
}

export type PlotKind = 'coup' | 'betrayal' | 'inlaw' | 'venture';

/** Drama in motion. */
export interface Plot {
  id: string;
  kind: PlotKind;
  /** The family it happens in (coup) or with (betrayal, venture). */
  faction: FactionId;
  actorId: string;
  targetId?: string;
  stage: number;
  startWeek: number;
  nextWeek: number;
  /** The boss knows it is going on. */
  known: boolean;
  /** The boss backed someone (coup: 'pretender' | 'boss'). */
  backed?: string;
  ended?: number;
  outcome?: string;
  /** Venture: weekly take, and whether they skim. */
  weekly?: number;
  skim?: boolean;
}

/** A canary trap: a different lie told to each suspect; whichever comes back names the leak. */
export interface Canary {
  id: string;
  week: number;
  checkWeek: number;
  entries: { charId: string; tale: string }[];
  result?: string;
  caught?: string;
}

export interface WarLedger {
  warId: string;
  rival: RivalId;
  district: string;
  startWeek: number;
  endWeek?: number;
  outcome?: 'won' | 'lost' | 'white';
  /** Money the war cost you (raids, mattresses, the noise). */
  spent: number;
  /** Money the war brought in (rackets taken, spoils, tribute). */
  gained: number;
  menLost: number;
  theirsLost: number;
  /** Your influence in the district at the start. */
  startInf: number;
  influence: number;
  respect: number;
  notes: [number, string][];
}

export interface IntrigueState {
  eras: Record<string, EraTrack>;
  spies: Spy[];
  intel: Intel[];
  lies: Lie[];
  plots: Plot[];
  canaries: Canary[];
  ledgers: WarLedger[];
  /** The boss's suspicion of his own men (character id → 0..100). */
  suspect: Record<string, number>;
  /** Snapshot for diffs: the player's influence by district, the families' men alive, deaths seen. */
  seen: { inf: Record<string, number>; week: number };
  /** Cooldowns by key → week. */
  cd: Record<string, number>;
  /** [week, text], newest last (capped). */
  log: [number, string][];
  nextId: number;
}

export const MOB_RIVALS = ['manno', 'feldstein', 'kessler'] as const;

export function pairKey(a: FactionId, b: FactionId): string {
  if (a === 'player') return `player|${b}`;
  if (b === 'player') return `player|${a}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function ensureIntrigue(s: GameState): IntrigueState {
  if (!s.intrigue) s.intrigue = { eras: {}, spies: [], intel: [], lies: [], plots: [], canaries: [], ledgers: [], suspect: {}, seen: { inf: {}, week: s.week }, cd: {}, log: [], nextId: 1 };
  const I = s.intrigue;
  // Every pair of families has a track.
  const mobs = s.rivals.filter((r) => r.kind === 'mob').map((r) => r.id);
  const pairs: [FactionId, RivalId][] = [];
  for (const m of mobs) pairs.push(['player', m]);
  for (let i = 0; i < mobs.length; i++) for (let j = i + 1; j < mobs.length; j++) pairs.push(mobs[i] < mobs[j] ? [mobs[i], mobs[j]] : [mobs[j], mobs[i]]);
  for (const [a, b] of pairs) {
    const k = pairKey(a, b);
    if (!I.eras[k]) I.eras[k] = { key: k, a, b, era: 'peace', since: s.week, tension: 15, cause: 'The way things have always been', hist: [[s.week, 'peace', 'The way things have always been']] };
  }
  return I;
}

/* ------------------------------------------------------------------ */
/* The boss's orders                                                    */
/* ------------------------------------------------------------------ */

export type RumorLine = 'weak' | 'rat' | 'skim';

export type IntrigueAction =
  /** Plant one of your men inside a family. */
  | { op: 'plant'; charId: string; rival: RivalId }
  /** Turn one of theirs. */
  | { op: 'turn'; targetId: string; how: Exclude<SpyHow, 'planted'> }
  /** Pull your spy out. */
  | { op: 'recall'; spyId: string }
  /** Tell each suspect a different tale and see which one comes back. */
  | { op: 'canary'; suspects: string[] }
  /** Sit a suspect down. 'hard' is the boss's explicit choice to lean on him. */
  | { op: 'question'; charId: string; how: 'talk' | 'hard' }
  /** What to do with a man you know talks to someone else. Only ever the boss's own choice. */
  | { op: 'moleFate'; charId: string; fate: 'feed' | 'forgive' | 'exile' | 'bury' }
  /** Spread a rumor about a family, in the paper's Spout Off or in the bars. */
  | { op: 'rumor'; rival: RivalId; line: RumorLine; via: 'paper' | 'gossip' }
  /** Forge proof that one family hit another (a false flag). */
  | { op: 'forge'; victim: RivalId; blame: RivalId }
  /** Cold-war sabotage: a load goes missing, a truck goes in the bay. */
  | { op: 'sabotage'; rival: RivalId }
  /** Fund one family against another (a proxy fight). */
  | { op: 'proxy'; ally: RivalId; against: RivalId }
  /** Ask for a sit-down to cool things down. */
  | { op: 'sitdown'; rival: RivalId }
  /** In a war: move the fight to another district. */
  | { op: 'front'; warId: string; district: string };
