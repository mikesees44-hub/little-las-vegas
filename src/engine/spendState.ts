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
}

export type SpendAction =
  | { op: 'buy'; item: string }
  | { op: 'sell'; uid: string };

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

/** The perk-style modifiers (lifestyle.perkMod adds these): bodyguards guard, a captain on the pad cools local heat… */
export function spendPerk(s: GameState, key: PerkKey): number {
  return spendMod(s, key);
}
