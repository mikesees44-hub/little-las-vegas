import { hashSeed } from './rng';
import type { PerkKey } from './lifestyle';
import { SPEND_BY_ID, type SpendGroup, type SpendMod } from './spendData';
import type { GameState } from './types';

/**
 * SPEND: the state of what the boss bought from the Spend catalog (spend.ts,
 * spendData.ts). Optional on GameState: a save with none has bought nothing,
 * and the first purchase creates it. Nothing here is read by upgradeSave.
 */

export interface SpendOwned {
  uid: string;
  id: string;
  /** What was paid (the price at the time, all heads counted). */
  paid: number;
  /** Which pot paid, and so which pot gets the resale. */
  pot: 'pocket' | 'family';
  week: number;
  year: number;
  /** Whose it is when it isn't the boss's: the wife's jewelry, a son's car (a character id). */
  holder?: string;
}

export interface SpendState {
  v: 1;
  /** This layer's own dice (never the main stream). */
  rng: number;
  nextId: number;
  /** Things owned, and services on retainer (the maid, the captain on the pad). */
  owned: SpendOwned[];
  /** Item id → the week it was last bought (cooldowns). */
  last: Record<string, number>;
  /** Item id → how many of a limited stock are gone (bought by you or by somebody else). */
  gone: Record<string, number>;
  /** `${item}:${charId}` → week: the party each child had, the funeral each man had. */
  done: Record<string, number>;
  /** Goodwill with the town's groups, built by what you pay for (decays slowly). */
  standing: Partial<Record<SpendGroup, number>>;
  /** The visible spending the IRS can see: [week, dollars seen]. The last 52 weeks are kept. */
  seen: [number, number][];
  /** Audit pressure, 0-100: at 100 the IRS does a net-worth audit. */
  irs: number;
  /** The IRS warned (a man asked the bank about you) at this pressure, once per climb. */
  warned?: boolean;
  audits: number;
  /** Lifetime spending through the catalog, by pot. */
  spent: { pocket: number; family: number };
  log: [number, string][];
  /** The Store (store.ts): purchases on time, bank or finance company (absent until the first). */
  loans?: StoreLoan[];
  /** The Store: each racehorse's and race car's record, by owned uid. */
  races?: Record<string, RaceRecord>;
  /** Presents given, by recipient: the weeks (last 10). Repeating them wears thin. */
  gifts?: Record<string, number[]>;
  /** The week the boss was last told he can't keep up the upkeep. */
  strained?: number;
}

/** A purchase financed at the store: what is left to pay and the weekly payment. */
export interface StoreLoan {
  uid: string;
  item: string;
  pot: 'pocket' | 'family';
  pay: number;
  left: number;
  missed: number;
  lender: string;
}

export interface RaceRecord {
  starts: number;
  wins: number;
  places: number;
  earned: number;
  last: number;
  /** The last few results: [week, race id, finish]. */
  hist: [number, string, number][];
}

/** Other people's flexes (store.ts): what the capos and the rivals bought with their own money. Optional; bounded. */
export interface StoreNpcState {
  v: 1;
  /** [week, buyer id (a character, or "rival:<id>"), item id, price]. Last 30 kept. */
  buys: [number, string, string, number][];
  /** Legit businesses the capos bought themselves: [owner id, item id, week]. At most 20. */
  biz: [string, string, number][];
}

export type SpendAction =
  /** Buy. `finance`: a quarter down and weekly payments. `offer`: a price the seller agreed to (store.ts counterOffer). */
  | { op: 'buy'; item: string; finance?: boolean; offer?: number }
  | { op: 'sell'; uid: string }
  /** Enter a racehorse or a race car you own in a race (store.ts RACES). */
  | { op: 'race'; uid: string; race: string }
  /** Share the wealth (storeShare.ts): a sum spread over the crew, the widows, the church and the neighborhood. */
  | { op: 'share'; total: number; split: ShareSplit; by: 'rank' | 'merit'; pot: 'family' | 'pocket' };

/** Share the wealth: how the sum is split, in percent (normalized). */
export interface ShareSplit { crew: number; widows: number; church: number; hood: number }

export function newSpend(s: GameState): SpendState {
  return { v: 1, rng: hashSeed(`${s.seed}:spend`), nextId: 1, owned: [], last: {}, gone: {}, done: {}, standing: {}, seen: [], irs: 0, audits: 0, spent: { pocket: 0, family: 0 }, log: [] };
}

export function ensureSpend(s: GameState): SpendState {
  return (s.spend ??= newSpend(s));
}

/** A modifier summed over everything owned or on retainer (0 for a save with nothing). */
export function spendMod(s: GameState, key: SpendMod): number {
  const sp = s.spend;
  if (!sp?.owned.length) return 0;
  let v = 0;
  for (const o of sp.owned) v += SPEND_BY_ID[o.id]?.mods?.[key] ?? 0;
  return v;
}

/** The armory's points and training (store items with `arms`). */
export function armoryPoints(s: GameState): { pts: number; train: number; storage: boolean } {
  let pts = 0;
  let train = 0;
  let storage = false;
  for (const o of s.spend?.owned ?? []) {
    const a = SPEND_BY_ID[o.id]?.arms;
    if (!a) continue;
    pts += a.pts;
    train += a.train ?? 0;
    if (o.id === 'st_gunroom') storage = true;
  }
  return { pts, train, storage };
}

/**
 * The armory with diminishing returns: hits get harder by at most ~12 points
 * however many crates are in the garage; training and maintenance add up to
 * 35% on top. Guns are not leadership.
 */
export function armoryBonus(s: GameState): number {
  const { pts, train } = armoryPoints(s);
  if (!pts) return 0;
  return Math.round(12 * (1 - Math.exp(-pts / 10)) * (1 + Math.min(0.35, train)));
}

/** The perk-style modifiers (lifestyle.perkMod adds these): bodyguards guard, a captain on the pad cools local heat… */
export function spendPerk(s: GameState, key: PerkKey): number {
  return spendMod(s, key) + (key === 'hitPower' ? armoryBonus(s) : 0);
}
