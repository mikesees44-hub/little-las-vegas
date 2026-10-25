import { CATALOG } from './catalog';
import { ensureEcon } from './econState';
import { hashSeed, rand } from './rng';
import type { GameState } from './types';
import { USES_BY_ID } from './property';
import type { DealTarget } from './deals';

/**
 * The look of a place you own: its name, its architectural style, the color
 * of its neon, and its key staff. Stored per place in `econ.designs` (keyed
 * like managers: a business id, or `lot:<id>` for a building), and the name
 * also on the business or the lot itself.
 *
 * Growth path (Empire Designer): the lot is the Property (stable `lot.id`,
 * address, zone, owner + `history`, condition, built year, price); a Design
 * keyed `lot:<id>` (or a business id for a storefront racket with no lot) is
 * where Building → Floor → Space records will hang by id later
 * (`buildingIds`), with staff growing into Employment records.
 *
 * Styles have small effects: tourist draw (take), build cost, upkeep and
 * prestige (respect when it opens). The map draws the marker in the style's
 * shape and the sign's color.
 */

export type BuildStyle = 'doowop' | 'deco' | 'tiki' | 'colonial' | 'midcentury' | 'victorian';
export type SignColor = 'pink' | 'turquoise' | 'red' | 'gold' | 'green' | 'blue' | 'white';
export type StaffPost = 'manager' | 'desk' | 'bar' | 'maintenance';

export interface StaffHire {
  name: string;
  /** Weekly wage. */
  wage: number;
  /** 0..100. */
  quality: number;
}

export interface Design {
  style?: BuildStyle;
  sign?: SignColor;
  /** Key posts (the manager himself lives in econ.managers). */
  staff?: Partial<Record<Exclude<StaffPost, 'manager'>, StaffHire>>;
}

export const STYLES: Record<BuildStyle, { name: string; blurb: string; draw: number; cost: number; upkeep: number; prestige: number; from?: number }> = {
  doowop: { name: 'Doo Wop / Googie', blurb: 'Boomerang roofs, angled glass, a sign you can see from the causeway. The Crest\'s own style.', draw: 0.08, cost: 0.06, upkeep: 0.05, prestige: 1, from: 1955 },
  deco: { name: 'Art Deco', blurb: 'Chrome, curves and a terrazzo lobby. Old money remembers it fondly.', draw: 0.03, cost: 0.08, upkeep: 0.03, prestige: 2 },
  tiki: { name: 'Tiki / Polynesian', blurb: 'Torches, bamboo and a volcano in the cocktail menu. The young crowd loves it.', draw: 0.07, cost: 0.05, upkeep: 0.06, prestige: 0, from: 1957 },
  colonial: { name: 'Colonial', blurb: 'White columns and shutters. Families feel safe; nobody takes a picture.', draw: 0, cost: 0.02, upkeep: 0, prestige: 1 },
  midcentury: { name: 'Mid-century Modern', blurb: 'Clean lines, big windows, a pool you can see from the road.', draw: 0.04, cost: 0.04, upkeep: 0.02, prestige: 1 },
  victorian: { name: 'Seaside Victorian', blurb: 'Gingerbread trim and a wraparound porch, Cape May style. Charm, and drafts.', draw: 0.02, cost: 0.07, upkeep: 0.05, prestige: 2 },
};

export const SIGN_HEX: Record<SignColor, string> = {
  pink: '#ff5fa2', turquoise: '#2fd6c8', red: '#ff4b3e', gold: '#f2c14e', green: '#5fe37a', blue: '#4ea8ff', white: '#f4f1e8',
};

export function designOf(s: GameState, key: string): Design | undefined {
  return s.econ?.designs?.[key];
}

export function designMut(s: GameState, key: string): Design {
  const e = ensureEcon(s);
  return ((e.designs ??= {})[key] ??= {});
}

/** Take multiplier from the style's tourist draw. */
export function styleDraw(s: GameState, key: string): number {
  const st = designOf(s, key)?.style;
  return st ? 1 + STYLES[st].draw : 1;
}

/* ---------------- names ---------------- */

const MOTEL = ['The Starlite', 'The Caribbean', 'The Satellite', 'The Pink Flamingo', 'The Ebb Tide', 'The Bel Air', 'The Casa Bahama', 'The Lollipop', 'The Waikiki', 'The Admiral\'s Rest', 'The Shalimar', 'The Aztec', 'The Jolly Roger', 'The Tangiers', 'The Fantasy'];
const CLUB = ['The Blue Moon', 'The Hurricane Room', 'Club Riviera', 'The Bamboo Lounge', 'The Velvet Rope', 'The Starlight Room', 'The 500 Club', 'The Copa', 'The Golden Slipper'];
const SHOP = ['{S}\'s', '{S} Brothers', 'Seaside', 'Ocean Breeze', 'Boardwalk', 'Shore', 'Crest', 'Sunny Day'];
const NOUN: Record<string, string> = { restaurant: 'Restaurant', bar: 'Tavern', laundromat: 'Laundromat', vending: 'Vending Co.', bakery: 'Bakery', garage: 'Garage', trucking: 'Trucking', construction: 'Construction', concrete: 'Concrete', lumber: 'Lumber & Supply' };

/** A few period names for a place (deterministic per place). */
export function suggestNames(s: GameState, t: DealTarget, n = 4): string[] {
  const boss = s.characters[s.playerId];
  const sur = boss?.lastName ?? 'Family';
  const h = { rng: hashSeed(`${s.seed}:names:${t.kind === 'lot' ? t.lotId : `${t.biz}:${t.district}`}`) };
  let kind = '';
  let label = '';
  if (t.kind === 'biz') { kind = t.biz; label = CATALOG[t.biz].name; } else {
    const l = s.econ?.lots.find((x) => x.id === t.lotId);
    const u = l?.use ? USES_BY_ID[l.use] : undefined;
    kind = u?.biz ?? u?.id ?? 'lot';
    label = u?.name ?? 'Lot';
  }
  const pool = /motel|hotel|boarding|rooming/.test(kind) ? MOTEL : /club|lounge|supper|jazz|burlesque|gents/.test(kind) ? CLUB : SHOP.map((x) => `${x.replace('{S}', sur)} ${NOUN[kind] ?? label}`);
  const out = new Set<string>();
  let guard = 0;
  while (out.size < n && guard++ < 40) out.add(pool[Math.floor(rand(h) * pool.length)]);
  return [...out];
}
