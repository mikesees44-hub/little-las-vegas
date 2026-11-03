import type { Character, GameState, RivalId } from './types';

/**
 * FEDS AND FLIPPING (imports/queue/FEDS_AND_FLIPPING.md): the state, and the small
 * hooks other branches plug into (the phone's wiretaps: `addFedEvidence`, `isInformant`,
 * `informantsAround`). The logic is in feds.ts.
 *
 * It ties together what already existed: a man's evidence file (Character.evidence),
 * the federal heat bar, the FBI's ladder (threats.ts T.fed), the informants
 * (Character.informantFor + secrets), the trial (trial.ts) and the capos' books (capos.ts).
 * Optional state: created by the first week that needs it; upgradeSave tops it up.
 */

export type PinchStage = 'coming' | 'held' | 'done';
export type PinchOutcome = 'dropped' | 'stood' | 'flipped' | 'clipped' | 'home' | 'gone';

/** One of the boss's men (or a rival's) picked up for something big. */
export interface Pinch {
  id: string;
  charId: string;
  /** What he is charged with, in words. */
  crime: string;
  /** Week it was set in motion. */
  w: number;
  stage: PinchStage;
  /** A serious charge (years) or a small one (it can go away). */
  serious: boolean;
  /** Years he is facing. */
  years: number;
  /** What the boss did for him: 'lawyer' | 'bail' | 'envelope' | 'visit' | 'capo' | 'word' | 'speed'. */
  care: string[];
  /** The visiting-room moment has been put on the clock (once). */
  scare?: 1;
  /** Week the government's offer is decided. */
  decide?: number;
  outcome?: PinchOutcome;
  /** Week he comes home (he stood up and did his time). */
  home?: number;
  /** A rival's man (no moment; the papers). */
  rival?: RivalId;
  /** Part of an indictment wave. */
  wave?: 1;
}

/** The boss himself turned (only ever once). */
export interface BossCoop {
  /** Who (the boss at the time). */
  id: string;
  /** Week he cooperated. */
  w: number;
  path: 'witness' | 'heir' | 'informant';
  /** Secret informant: how close the family is to knowing (0-100). */
  exposure?: number;
  /** Week of the next meet with his handlers. */
  next?: number;
  /** Names given, meets missed. */
  given?: number;
  missed?: number;
  /** It came out (week). */
  burned?: number;
}

/** "Don in name only": the capos run the family; he holds the title. */
export interface HollowCrown {
  /** Week it began. */
  since: number;
  /** How much of the family still answers to him, 0-100. */
  meter: number;
  /** Capos won back, one at a time. */
  won: string[];
  /** Week of the next crisis meeting on the clock. */
  next: number;
  /** The boss whose crown it is (it ends when the chair changes hands). */
  boss?: string;
  /** The plotters have set a date (a coup on the schedule). */
  move?: number;
  /** The capo leading it. */
  leadId?: string;
  /** The seven-day crisis (DEAD_MAN_WALKING.md): the plot against him, day by day. */
  crisis?: Crisis;
  /** Mercy was shown: the DEAD MAN WALKING reputation (week it began). Redeemed when the meter is won back. */
  dmw?: number;
}

/** What each man secretly decides when the plot comes to him. */
export type PlotStance = 'join' | 'resist' | 'inform' | 'exploit' | 'neutral';

/** The seven days (hidden network; the boss learns it through what he finds out). */
export interface Crisis {
  /** The week the seven days run in. */
  w: number;
  leadId: string;
  ubId?: string;
  /** The underboss: with him, on the fence, or after the chair himself. */
  ub: 'loyal' | 'wavering' | 'rival';
  /** Each man's hidden stance. */
  st: Record<string, PlotStance>;
  /** Men the boss knows are in it, and men he only suspects (some of them innocent). */
  known: string[];
  suspected: string[];
  /** How strong the plot is (men and money), how much of it has leaked, the boss's guard. */
  strength: number;
  exposure: number;
  guard: number;
  /** What the boss's moves took out of it (men who cooled, money it lost). */
  drag?: number;
  /** The last beat played (1-7). */
  beat: number;
  /** The money that did not come in (Wednesday's envelopes). */
  short: number;
  /** The young soldier with the warning, and whether he is telling the truth. */
  warnerId?: string;
  warnerTrue?: boolean;
  /** How it ended. */
  done?: 'early' | 'foiled' | 'killed' | 'judged';
  /** The second invitation: the underboss may not step in this time. */
  second?: 1;
}

/** A consequence set down for later (Sons of the Fallen, the capo you created, the second invitation…). */
export interface FedsSeed { key: string; at: number; ids: string[] }

/** The undercover agent (an associate with a cover story). */
export interface Brasco {
  id: string;
  /** His cover: what he says he does, where he says he is from. */
  cover: string;
  town: string;
  /** The "uncle" who supposedly vouches for him back home. */
  uncle: string;
  /** The man of yours who vouched for him. */
  voucherId: string;
  since: number;
  /** 0 hanging around · 1 trusted · 2 being sponsored · 3 proposed for the books. */
  stage: number;
  /** Tells noticed (keys). */
  tells: string[];
  /** Week the boss found out. */
  found?: number;
  /** How it ended. */
  end?: 'pulled' | 'killed' | 'frozen' | 'fed';
  /** Week the Bureau pulls him out (the indictment wave). */
  pull: number;
  /** Evidence he has gathered (feeds the wave). */
  take: number;
  /** Feeding him false information: until this week. */
  feeding?: number;
}

export interface FedsLogEntry { w: number; id: string; a: number; why: string }

export interface FedsStats {
  pinches: number; serious: number; dropped: number; rivalPinches: number;
  scares: number; flips: number; stood: number; homecomings: number; clipped: number;
  pushes: number; waves: number;
  bossOffers: number; bossFlips: number;
  hollow: number; hollowEnds: Record<string, number>;
  tipoffs: number; tipTaken: number;
  crises: number; crisisEnds: Record<string, number>; seedsFired: number;
  brasco: number; brascoFound: number; brascoPulled: number;
}

export interface FedsState {
  v: 1;
  rng: number;
  n: number;
  pinches: Pinch[];
  /** The last few evidence entries (the hook's record). */
  log: FedsLogEntry[];
  /** Evidence a wired man has gathered toward the next indictment wave. */
  wire: number;
  /** Week the last pinch was set in motion (they are spread out). */
  lastPinch: number;
  /** The boss's cooperation (the latest; never twice for the same man). */
  boss?: BossCoop;
  /** Every boss who ever cooperated (a man can only do it once). */
  flippers: string[];
  hollow?: HollowCrown;
  /** Week the last hollow crown ended. */
  hollowEnd?: number;
  /** Favors owed to the Bureau (warnings taken). */
  owed: number;
  /** Threat ids / coup ids already tipped. */
  tipped: string[];
  brasco?: Brasco;
  /** Follow-ups that grow out of the crisis's endings. */
  seeds: FedsSeed[];
  /** Rebuilding after a purge: until this week the family earns this much less. */
  rebuild?: { until: number; cut: number };
  /** A retired Don (the old boss, his kind of retirement). */
  retired?: { id: string; kind: 'honorable' | 'puppet' | 'isolated'; w: number };
  /** Week the last undercover operation ended. */
  brascoEnd?: number;
  stats: FedsStats;
}

function zeroStats(): FedsStats {
  return {
    pinches: 0, serious: 0, dropped: 0, rivalPinches: 0, scares: 0, flips: 0, stood: 0, homecomings: 0, clipped: 0, pushes: 0, waves: 0,
    bossOffers: 0, bossFlips: 0, hollow: 0, hollowEnds: {}, tipoffs: 0, tipTaken: 0, crises: 0, crisisEnds: {}, seedsFired: 0, brasco: 0, brascoFound: 0, brascoPulled: 0,
  };
}

function seedOf(s: GameState): number {
  const str = `${s.seed}|feds`;
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) || 1;
}

/** Create or top up (upgradeSave's step: a save from before it loads without a missing field). */
export function ensureFeds(s: GameState): FedsState {
  const F = (s.feds ??= { v: 1, rng: seedOf(s), n: 0, pinches: [], log: [], wire: 0, lastPinch: -99, owed: 0, tipped: [], flippers: [], seeds: [], stats: zeroStats() });
  F.pinches ??= [];
  F.log ??= [];
  F.tipped ??= [];
  F.flippers ??= [];
  F.seeds ??= [];
  F.wire ??= 0;
  F.owed ??= 0;
  F.lastPinch ??= -99;
  F.stats = { ...zeroStats(), ...(F.stats ?? {}) };
  F.stats.hollowEnds ??= {};
  F.stats.crisisEnds ??= {};
  if (!F.rng) F.rng = seedOf(s);
  return F;
}

/** The module's own dice (never moves the game's other rolls). */
export function fr(F: FedsState): number {
  let x = F.rng | 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  F.rng = x >>> 0 || 1;
  return (F.rng % 1_000_000) / 1_000_000;
}

export function fid(F: FedsState, p: string): string {
  F.n += 1;
  return `${p}${F.n}`;
}

/* ------------------------------------------------------------------ */
/* Hooks for other systems (the phone's wiretaps plug in here)          */
/* ------------------------------------------------------------------ */

/**
 * Evidence on a man, from anywhere (a wire, a tap, a rat, a crime): it goes on his file
 * (Character.evidence, 0-100) and in the record, so the pinch line can be crossed.
 * Returns what was actually added.
 */
export function addFedEvidence(s: GameState, charId: string, amount: number, why: string): number {
  const c = s.characters[charId];
  if (!c?.alive || !amount) return 0;
  const before = c.evidence ?? 0;
  c.evidence = Math.max(0, Math.min(100, before + amount));
  const got = c.evidence - before;
  if (got) {
    const F = ensureFeds(s);
    F.log.push({ w: s.week, id: charId, a: Math.round(got * 10) / 10, why });
    if (F.log.length > 40) F.log = F.log.slice(-40);
    // A wired man's tapes count toward the next indictment wave.
    if (why.startsWith('wire') && got > 0) F.wire = Math.min(200, F.wire + got);
  }
  return got;
}

/** Is he talking to the government (a flipped man, a capo who went to the FBI, the boss himself, the undercover)? */
export function isInformant(s: GameState, charId: string): boolean {
  const c = s.characters[charId];
  if (!c?.alive) return false;
  if (charId === s.playerId) return s.feds?.boss?.id === charId && s.feds.boss.path === 'informant' && !s.feds.boss.burned;
  if (s.feds?.brasco?.id === charId && !s.feds.brasco.end) return true;
  return c.informantFor === 'law';
}

/** The men around the boss who are talking to the government (for a wire, a call, a meet). */
export function informantsAround(s: GameState): Character[] {
  return Object.values(s.characters).filter((c) => c.alive && c.faction === 'player' && c.id !== s.playerId && c.informantFor === 'law');
}

/** The boss has cooperated once already (he can never do it again). */
export function bossHasFlipped(s: GameState): boolean {
  return !!s.feds?.flippers?.includes(s.playerId);
}

/** How much of the family answers to the boss (100 when there is no hollow crown). */
export function hollowMeter(s: GameState): number {
  return s.feds?.hollow ? s.feds.hollow.meter : 100;
}
