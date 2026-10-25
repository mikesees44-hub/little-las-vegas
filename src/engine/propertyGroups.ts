import { USES_BY_ID, useIcon } from './property';
import type { Lot } from './econState';
import type { BusinessKind, GameState } from './types';

/**
 * One way to sort everything the family owns or can buy, used by every list
 * (Holdings, the buy catalog, the real-estate market): ten plain groups a
 * player recognises at a glance, instead of fronts / rackets / lots.
 */
export type PropGroup =
  | 'hotels' | 'food' | 'nightlife' | 'boardwalk' | 'shops' | 'gambling'
  | 'money' | 'building' | 'transport' | 'quiet' | 'homes';

export const PROP_GROUPS: { id: PropGroup; icon: string; label: string; blurb: string }[] = [
  { id: 'hotels', icon: '🏨', label: 'Hotels & Motels', blurb: 'Rooms by the night, the week or the season.' },
  { id: 'food', icon: '🍝', label: 'Food & Drink', blurb: 'Restaurants, pizza, delis, stands and bars.' },
  { id: 'nightlife', icon: '🎷', label: 'Nightlife & Shows', blurb: 'Clubs, supper clubs, burlesque, the acts and the labels.' },
  { id: 'boardwalk', icon: '🎡', label: 'Boardwalk & Amusements', blurb: 'Arcades, rides, mini golf, the machines.' },
  { id: 'shops', icon: '🛍', label: 'Shops & Storefronts', blurb: 'Souvenirs, T-shirts, the corner stores.' },
  { id: 'gambling', icon: '🎲', label: 'Gambling', blurb: 'The numbers, the book, card games and casinos.' },
  { id: 'money', icon: '💵', label: 'Money & Loans', blurb: 'The bank, the shylock book, the pawn shop.' },
  { id: 'building', icon: '🏗', label: 'Construction & Trades', blurb: 'Concrete, lumber, builders, the union hall, the bids.' },
  { id: 'transport', icon: '🚚', label: 'Trucking & Services', blurb: 'Trucks, cabs, tows, garbage, laundries, car lots.' },
  { id: 'quiet', icon: '🕶', label: 'The Quiet Work', blurb: 'Rackets that never have a sign out front.' },
  { id: 'homes', icon: '🏠', label: 'Homes & Real Estate', blurb: 'Houses, apartments, empty lots and safehouses.' },
];

export const PROP_GROUP_BY_ID = Object.fromEntries(PROP_GROUPS.map((g) => [g.id, g])) as Record<PropGroup, (typeof PROP_GROUPS)[number]>;

const BIZ_GROUP: Record<BusinessKind, PropGroup> = {
  motel: 'hotels', boarding: 'hotels',
  restaurant: 'food', pizza: 'food', stand: 'food', deli: 'food', bar: 'food',
  club: 'nightlife', supperclub: 'nightlife', burlesque: 'nightlife', gentsclub: 'nightlife', hoodclub: 'nightlife',
  adulttheater: 'nightlife', label: 'nightlife', talent: 'nightlife', filmdist: 'nightlife',
  arcade: 'boardwalk', vending: 'boardwalk',
  casino: 'gambling', numbers: 'gambling', bookmaking: 'gambling', cardgame: 'gambling',
  bank: 'money', loansharking: 'money', pawn: 'money',
  construction: 'building', concrete: 'building', lumber: 'building', bidrig: 'building', labor: 'building',
  cargo: 'transport', trucking: 'transport', towing: 'transport', waste: 'transport', cleaning: 'transport', taxi: 'transport',
  laundromat: 'transport', carlot: 'transport',
  vice: 'quiet', stag: 'quiet', blackmail: 'quiet', jewel: 'quiet', bankcrew: 'quiet', fencing: 'quiet', narcotics: 'quiet',
  safehouse: 'homes',
};

export function groupOfBiz(kind: BusinessKind): PropGroup {
  return BIZ_GROUP[kind] ?? 'shops';
}

/** A building's group: the business inside it, else what it is used for. */
export function groupOfLot(s: GameState, l: Lot): PropGroup {
  if (l.bizId) {
    const b = s.businesses.find((x) => x.id === l.bizId);
    if (b) return groupOfBiz(b.kind);
  }
  const u = l.use ? USES_BY_ID[l.use] : undefined;
  if (!u) return 'homes';
  if (u.biz) return groupOfBiz(u.biz);
  switch (useIcon(u)) {
    case 'hotel': return u.id === 'office' || u.id === 'mall' || u.id === 'condo' ? 'homes' : 'hotels';
    case 'motel': return 'hotels';
    case 'house': case 'apartment': case 'public': return 'homes';
    case 'pizza': return 'food';
    case 'club': return 'nightlife';
    case 'pier': return 'boardwalk';
    case 'warehouse': return u.cat === 'industrial' ? 'building' : 'transport';
    default: return u.cat === 'food' ? 'food' : 'shops';
  }
}

/** Groups in display order, each with its items; empty groups dropped. */
export function grouped<T>(items: T[], groupOf: (x: T) => PropGroup): { group: (typeof PROP_GROUPS)[number]; items: T[] }[] {
  return PROP_GROUPS.map((g) => ({ group: g, items: items.filter((x) => groupOf(x) === g.id) })).filter((x) => x.items.length > 0);
}
