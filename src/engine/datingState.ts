import { hashSeed } from './rng';
import type { GameState } from './types';

/**
 * RELATIONSHIPS & DATING (state). The boss's own love life and the paid
 * company of the island's nights, as one layer over the systems that already
 * exist: romance.ts keeps who is together, married or separated (and the
 * pregnancies and births); the Ears keep the dancers and call girls; living
 * keeps the townsfolk; the Pocket pays. This record only adds what those do
 * not know: her feelings toward the boss (a bond), the women who work the
 * street and the high-end trade (providers), the evenings dates take, the
 * rumors, and the player's content settings.
 *
 * HARD RULES (enforced in dating.ts at every list, preview and commit, and
 * revalidated every week): adults only (18+ on the day); she decides every
 * time (money and gifts never guarantee anything); a paid evening is an
 * explicit, agreed transaction with an adult and creates no feelings, no
 * relationship and no standing access; nothing is explicit (the report fades
 * to the morning); no coercion, no debts held over anyone, nobody is traded;
 * nobody here is real.
 *
 * Lives on `GameState.dating` (optional: older saves get it the first week)
 * and rolls only hashes of (seed, week, purpose) or its own stream.
 */

/** Mature content: Off (no adult services anywhere), Fade-out only (a line, then morning), Standard (a short, non-explicit scene). */
export type MatureSetting = 'off' | 'fade' | 'standard';
/** Pregnancy from the boss's relationships: never, rarely, or at the normal rate. */
export type PregnancySetting = 'off' | 'rare' | 'normal';

export interface DatingSettings {
  mature: MatureSetting;
  pregnancy: PregnancySetting;
}

export const DEFAULT_SETTINGS: DatingSettings = { mature: 'fade', pregnancy: 'rare' };

export const MATURE_LABEL: Record<MatureSetting, string> = { off: 'Off', fade: 'Fade-out only', standard: 'Standard' };
export const MATURE_BLURB: Record<MatureSetting, string> = {
  off: 'No adult services anywhere in the game: not in this screen, the phone, the evenings or the clubs.',
  fade: 'Adult services are listed with their prices. The report says only that the evening happened, then it is morning.',
  standard: 'As fade-out, with a short scene before the fade (dinner, the drive, the talk). Never explicit.',
};
export const PREGNANCY_LABEL: Record<PregnancySetting, string> = { off: 'Off', rare: 'Rare', normal: 'Normal' };
/** Odds per qualifying evening (see dating.ts PREGNANCY_RULES). */
export const PREGNANCY_ODDS: Record<PregnancySetting, number> = { off: 0, rare: 0.01, normal: 0.04 };

/** The ladder, as the player sees it. Together / married / separated are read off romance.ts. */
export type Stage = 'acquaintance' | 'friends' | 'attracted' | 'dating' | 'committed' | 'married' | 'separated' | 'ended';

export const STAGE_LABEL: Record<Stage, string> = {
  acquaintance: 'Acquaintance', friends: 'Friends', attracted: 'Attraction', dating: 'Dating', committed: 'Committed', married: 'Married', separated: 'Separated', ended: 'It ended',
};

/** Her side of things with the boss (the boss's feelings are his own business). */
export interface Bond {
  id: string;
  /** Her affection for him, 0-100. Gifts nudge it; only time and good evenings build it. */
  aff: number;
  /** Highest rung she has reached on her own (acquaintance / friends / attracted). */
  rung: 'acquaintance' | 'friends' | 'attracted';
  dates: number;
  /** Week of the last evening together. */
  last?: number;
  since: number;
  /** She made it exclusive with him. */
  committed?: boolean;
  /** She keeps it professional until this week (an escort or a dancer who said "business only"). */
  pro?: number;
  /** Week she last said no, and to what. */
  no?: { week: number; what: string };
  /** Gifts in the last weeks (diminishing returns). */
  gifts: number[];
  /** How the boss came to know her. */
  via: string;
  ended?: { week: number; why: string };
  /** On the date (dateTalk.ts): a line or two she remembers from each talk (newest last, capped), and the week of the last one. Optional. */
  notes?: { w: number; t: string; open?: string }[];
  talkW?: number;
}

export type ProviderKind = 'street' | 'callgirl' | 'escort' | 'dancer';

export const PROVIDER_LABEL: Record<ProviderKind, string> = {
  street: 'Street worker', callgirl: 'Call girl', escort: 'High-end escort', dancer: 'Dancer',
};

/** A working woman's own terms (her price, where, whether she offers company at all). */
export interface Provider {
  id: string;
  kind: ProviderKind;
  /** Where she works or takes calls. */
  venue: string;
  /** Her rate for an evening, in dollars (her decision). */
  price: number;
  /** Not every dancer offers company; the ones who do say so themselves. */
  offers: boolean;
  /** How discreet she is, 0-100 (lowers the risks). */
  discretion: number;
  /** How the boss can reach her: on the street, through the Madam, at the club. */
  via: 'street' | 'madam' | 'club' | 'phone';
  since: number;
  status: 'working' | 'left';
  left?: { week: number; why: string };
  /** Weeks the boss has booked her (no standing access: each is its own agreement). */
  visits: number[];
  /** An Ear's record lives in ears.ts; this provider is that woman. */
  ear?: boolean;
  /** One of the nightlife cast (nightlife.ts keeps her price and her life). */
  nl?: boolean;
}

/** A rumor: labeled as one, true or not. */
export interface Rumor {
  week: number;
  text: string;
  about: string;
  /** Who has heard it (character ids, or 'island'). */
  heard: string[];
  true: boolean;
}

/** What the boss knows of a pregnancy (romance.ts keeps the record itself). */
export interface PregKnow {
  /** Pregnancy id (romance.ts). */
  id: string;
  motherId: string;
  week: number;
  /** Who knows: the mother always; the boss once she tells him. */
  knownBy: string[];
  /** Week she will decide whether to tell him. */
  tellAt: number;
}

export interface DatingLogEntry {
  week: number;
  text: string;
  charId?: string;
  kind: 'date' | 'paid' | 'gift' | 'no' | 'stage' | 'family' | 'rumor' | 'life';
}

export interface DatingState {
  rng: number;
  settings: DatingSettings;
  /** People the boss has met personally (character id -> week). */
  met: Record<string, number>;
  bonds: Record<string, Bond>;
  providers: Record<string, Provider>;
  /** Townsfolk the boss was introduced to: living person id -> character id. */
  tp: Record<string, string>;
  /** Evenings dates and paid company took this week (they come out of the week's evenings). */
  evenings: { week: number; n: number };
  rumors: Rumor[];
  preg: PregKnow[];
  log: DatingLogEntry[];
  stats: { dates: number; refused: number; paid: number; declinedPaid: number; gifts: number; intros: number; pregnancies: number; providersLeft: number };
}

export function ensureDating(s: GameState): DatingState {
  if (!s.dating) {
    s.dating = {
      rng: hashSeed(`${s.seed}:dating`), settings: { ...DEFAULT_SETTINGS }, met: {}, bonds: {}, providers: {}, tp: {},
      evenings: { week: s.week, n: 0 }, rumors: [], preg: [], log: [],
      stats: { dates: 0, refused: 0, paid: 0, declinedPaid: 0, gifts: 0, intros: 0, pregnancies: 0, providersLeft: 0 },
    };
  }
  const D = s.dating;
  D.settings ??= { ...DEFAULT_SETTINGS };
  D.preg ??= [];
  D.rumors ??= [];
  D.tp ??= {};
  return D;
}

/** The settings, read-only (defaults for a save without the layer). */
export function datingSettings(s: GameState): DatingSettings {
  return s.dating?.settings ?? DEFAULT_SETTINGS;
}

/** Adult services are on (mature content is not Off). */
export function adultOn(s: GameState): boolean {
  return datingSettings(s).mature !== 'off';
}

/** Change a setting now (a state-to-state function for the UI; takes effect at once, everywhere). */
export function setDatingSettings(s: GameState, patch: Partial<DatingSettings>): GameState {
  const next = { ...s };
  const prev = s.dating;
  if (!prev) {
    ensureDating(next);
    next.dating = { ...next.dating!, settings: { ...next.dating!.settings, ...patch } };
    return next;
  }
  next.dating = { ...prev, settings: { ...prev.settings, ...patch } };
  return next;
}

/** Evenings the boss's dates and paid company take this week. */
export function datingEvenings(s: GameState): number {
  const e = s.dating?.evenings;
  return e && e.week === s.week ? e.n : 0;
}
