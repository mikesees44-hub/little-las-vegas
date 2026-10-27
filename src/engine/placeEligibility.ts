import type { Lot } from './econState';
import { rivalName } from './construction';
import { USES_BY_ID } from './property';
import type { Business, GameState } from './types';

/**
 * CENTRAL ELIGIBILITY for places (map, block map, street card, walk card,
 * interiors, Holdings). One function says what condition a property is in —
 * a going concern, a shop that closed with nobody running it, empty ground,
 * a building going up, a storefront for rent, a public building — and one
 * says which of the place verbs fit it, each with a plain reason when it
 * does not. Every card asks these, so a closed pizza parlor never offers an
 * act aimed at a shop that is open (the shakedown, robbing the back-room
 * game, buying it as a going concern, a round at the bar), and the same
 * place reads the same way wherever it is clicked.
 *
 * The UI never hides a verb that does not fit: it shows it greyed with the
 * reason (the standing rule: never remove options; make them friendly).
 */

export type PlaceCondition = 'operating' | 'closed' | 'vacant' | 'building' | 'for-rent' | 'public' | 'home' | 'empty-home';

export const CONDITION_LABEL: Record<PlaceCondition, string> = {
  operating: 'Open for business',
  closed: 'Closed: nobody is running it',
  vacant: 'Empty ground',
  building: 'Going up',
  'for-rent': 'An empty storefront for rent',
  public: 'A public building',
  home: 'A family lives here',
  'empty-home': 'An empty house: nobody lives here',
};

export function isMineLot(l: Pick<Lot, 'status'>): boolean {
  return l.status === 'owned' || l.status === 'leased';
}

/** What state a property is in, from the record itself (nothing else decides it). */
export function placeCondition(l: Lot): PlaceCondition {
  if (l.status === 'public') return 'public';
  if (l.use && l.stage && l.stage !== 'open' && l.stage !== 'purchase') return 'building';
  if (!l.use) return l.status === 'lease' ? 'for-rent' : 'vacant';
  // A house of the town's (or yours, rented to a family): a home, not a shop.
  if (l.home) return l.hh ? 'home' : isMineLot(l) ? 'operating' : 'empty-home';
  if (isMineLot(l)) return 'operating';
  return l.tenant || l.bizId ? 'operating' : 'closed';
}

/** A going concern: open, and somebody runs it. */
export function isOperating(l: Lot | undefined): boolean {
  return !!l && placeCondition(l) === 'operating';
}

/** Who holds the building, in words (the same text on every card). */
export function placeOwnerLabel(s: GameState, l: Lot): string {
  if (isMineLot(l)) return `House of ${s.houseName}`;
  if (l.status === 'public' || l.owner === 'city') return 'The city (not for sale)';
  if (l.owner === 'private') return l.status === 'sale' ? 'On the market' : 'An independent owner';
  return rivalName(l.owner);
}

/** Who runs what is inside, in words. */
export function placeRunByLabel(s: GameState, l: Lot): string {
  const c = placeCondition(l);
  if (c === 'vacant') return 'Nobody — empty ground';
  if (c === 'for-rent') return 'Nobody — the storefront is for rent';
  if (c === 'closed') return 'Nobody — it closed';
  if (c === 'home') return householdLabel(s, l);
  if (c === 'empty-home') return l.status === 'sale' ? 'Nobody — the house is for sale' : 'Nobody — the house is for rent';
  if (c === 'building') return l.developer ? `${l.developer} is building` : 'The builders';
  if (isMineLot(l)) {
    const m = s.econ?.managers[l.bizId ?? `lot:${l.id}`];
    return m?.name ?? 'Your people';
  }
  return l.tenant ?? 'The owner';
}

/** Who lives in a house, in words ("The Kowalski family (they own it)"). */
export function householdLabel(s: GameState, l: Lot): string {
  const hh = l.hh ? s.living?.hh[l.hh] : undefined;
  if (!hh) return 'A family';
  const nm = hh.name.charAt(0).toUpperCase() + hh.name.slice(1);
  return `${nm} (${l.hhOwns ? 'they own it' : isMineLot(l) ? 'they rent it from you' : 'they rent it'})`;
}

/** Bars, taverns and restaurants: the places with an inside you can walk into. */
export function interiorKind(useId: string | undefined, name = ''): 'bar' | 'restaurant' | undefined {
  if (!useId) return /tavern|saloon|bar\b|caf[eé]|pub\b/i.test(name) ? 'bar' : undefined;
  if (['hoodclub', 'jazzclub', 'supper', 'burlesque', 'comedy', 'gents'].includes(useId) || /tavern|saloon|bar\b|pub\b|caf[eé]/i.test(name)) return 'bar';
  if (['trattoria', 'diner', 'pizza', 'deli'].includes(useId)) return 'restaurant';
  return undefined;
}

export type PlaceActionId = 'goIn' | 'inside' | 'offer' | 'buyBusiness' | 'lease' | 'shakedown' | 'runoff' | 'cardgame' | 'torch' | 'manage' | 'renovate' | 'restyle' | 'develop' | 'meeting';

export interface PlaceAct {
  id: PlaceActionId;
  label: string;
  /** Undefined: it fits. Otherwise why not, in a sentence. */
  why?: string;
}

const LANDMARK = /avalon|chapel/i;

/**
 * Every verb a property card offers, each with whether it fits this place now
 * and why not. `biz` is a business of yours with no lot (a racket front).
 */
export function placeActions(s: GameState, l: Lot | undefined, biz?: Business): PlaceAct[] {
  const out: PlaceAct[] = [];
  if (!l) {
    if (biz) out.push({ id: 'manage', label: 'Manage it' }, { id: 'meeting', label: 'Call a meeting here' });
    return out;
  }
  const c = placeCondition(l);
  const mine = isMineLot(l);
  const rival = !mine && l.owner !== 'private' && l.owner !== 'city' && l.status === 'rival';
  // A family you can move against on the street (the dirty-work jobs aim at mob families only).
  const mob = rival && s.rivals.some((r) => r.id === l.owner && r.kind === 'mob');
  const landmark = LANDMARK.test(`${l.name ?? ''} ${l.address}`);
  const inside = interiorKind(l.use, l.name ?? '');
  const shut = c === 'home' ? 'A family\'s home, not a business' : c === 'empty-home' ? 'An empty house, not a business' : c === 'closed' ? 'It closed: nobody is running it' : c === 'vacant' ? 'There is nothing here but ground' : c === 'for-rent' ? 'The storefront is empty' : c === 'building' ? 'It is still going up' : undefined;
  out.push({ id: 'goIn', label: mine ? 'Go in · Manage' : c === 'operating' ? 'Go in' : 'Look it over' });
  if (inside) out.push({ id: 'inside', label: inside === 'bar' ? 'Go inside the bar' : 'Go inside', why: c === 'operating' ? undefined : shut ?? 'Not open' });
  if (!mine) {
    out.push({
      id: 'offer', label: `Make an offer${l.use ? ' on the building' : ' on the land'}`,
      why: c === 'public' ? 'The city does not sell it' : l.status === 'lease' ? 'Only for lease' : l.status === 'rival' ? `${rivalName(l.owner)} owns it` : l.status !== 'sale' ? 'The owner is not selling' : undefined,
    });
    out.push({
      id: 'buyBusiness', label: 'Buy the business with it',
      why: !l.use ? 'There is no business here' : c !== 'operating' ? (shut ?? 'Not open') : l.status !== 'sale' ? (l.status === 'rival' ? `${rivalName(l.owner)} owns it` : 'The owner is not selling') : !l.tenant ? 'Nobody inside to buy out' : undefined,
    });
    if (l.status === 'lease') out.push({ id: 'lease', label: 'Lease the storefront' });
  }
  if (!mine && !rival && c !== 'public') out.push({ id: 'shakedown', label: 'Shake them down', why: landmark ? 'A landmark: nobody shakes it down' : c !== 'operating' ? (shut ?? 'Not open') : l.owner !== 'private' ? 'Not an independent shop' : undefined });
  if (mob) {
    out.push({ id: 'runoff', label: 'Run them off', why: landmark ? 'A landmark' : undefined });
    out.push({ id: 'cardgame', label: 'Rob their game', why: landmark ? 'A landmark' : c !== 'operating' ? (shut ?? 'Not open') : undefined });
  }
  if (mine) {
    const b = l.bizId ? s.businesses.find((x) => x.id === l.bizId) : undefined;
    out.push({ id: 'manage', label: 'Manage it', why: c === 'operating' ? undefined : c === 'home' ? 'A family rents it: nothing to manage but the rent' : c === 'building' ? 'It is still going up' : 'Nothing open to manage yet' });
    out.push({ id: 'renovate', label: 'Fix it up', why: (c === 'operating' || c === 'home') && l.use ? undefined : 'Only a place that is open' });
    out.push({ id: 'restyle', label: 'A new look', why: (c === 'operating' || c === 'home') && l.use ? undefined : 'Only a place that is open' });
    if (!l.use) out.push({ id: 'develop', label: 'Develop it', why: l.stage === 'permits' ? 'Already in permits' : undefined });
    if (b) out.push({ id: 'torch', label: 'An insurance fire', why: (b.closedUntil ?? 0) > s.week ? 'It is already closed' : undefined });
  }
  out.push({ id: 'meeting', label: 'Call a meeting here' });
  return out;
}

/** One verb's eligibility (undefined: the verb does not apply to this place at all). */
export function placeAction(s: GameState, l: Lot | undefined, id: PlaceActionId, biz?: Business): PlaceAct | undefined {
  return placeActions(s, l, biz).find((a) => a.id === id);
}

/** The business kind a use becomes (for the cards' small print). */
export function useName(useId: string | undefined): string | undefined {
  return useId ? USES_BY_ID[useId]?.name : undefined;
}
