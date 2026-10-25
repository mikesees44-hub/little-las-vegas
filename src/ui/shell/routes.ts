/**
 * The route model of the map-first shell. A route names one drawer (a
 * "panel") and, optionally, one section inside it. Every old tab id still
 * resolves through LEGACY_TAB_ROUTE, so alerts, advice links and other
 * branches that say `goTab('business')` land in the right place.
 */
export type PanelId = 'you' | 'house' | 'borgata' | 'holdings' | 'ops' | 'diplomacy' | 'town' | 'chronicle';

export interface Route {
  panel?: PanelId;
  section?: string;
}

export const PANEL_IDS: PanelId[] = ['you', 'house', 'borgata', 'holdings', 'ops', 'diplomacy', 'town', 'chronicle'];

/** Old tab ids (the pre-shell tab bar, alerts' `tab`, advice links) → where they live now. */
export const LEGACY_TAB_ROUTE: Record<string, Route> = {
  map: {},
  // Rackets & Fronts
  business: { panel: 'holdings', section: 'rackets' },
  holdings: { panel: 'holdings', section: 'rackets' },
  realestate: { panel: 'holdings', section: 'property' },
  hq: { panel: 'holdings', section: 'hq' },
  books: { panel: 'holdings', section: 'books' },
  longgame: { panel: 'holdings', section: 'ventures' },
  // The crew
  tree: { panel: 'borgata', section: 'chart' },
  crew: { panel: 'borgata', section: 'council' },
  admin: { panel: 'borgata', section: 'council' },
  council: { panel: 'borgata', section: 'council' },
  capos: { panel: 'borgata', section: 'capos' },
  membership: { panel: 'borgata', section: 'membership' },
  grievances: { panel: 'borgata', section: 'grievances' },
  factions: { panel: 'borgata', section: 'grievances' },
  edicts: { panel: 'borgata', section: 'orders' },
  // Operations
  schemes: { panel: 'ops', section: 'progress' },
  travel: { panel: 'ops', section: 'travel' },
  envoys: { panel: 'ops', section: 'travel' },
  // Diplomacy
  table: { panel: 'diplomacy', section: 'table' },
  wars: { panel: 'diplomacy', section: 'wars' },
  blitz: { panel: 'diplomacy', section: 'balance' },
  front: { panel: 'diplomacy', section: 'front' },
  rivals: { panel: 'diplomacy', section: 'board' },
  // The house and the boss
  family: { panel: 'house', section: 'tree' },
  marriages: { panel: 'house', section: 'marriages' },
  succession: { panel: 'house', section: 'succession' },
  power: { panel: 'house', section: 'succession' },
  heirs: { panel: 'house', section: 'succession' },
  houses: { panel: 'house', section: 'houses' },
  activities: { panel: 'house', section: 'activities' },
  decisions: { panel: 'house', section: 'decisions' },
  legacy: { panel: 'house', section: 'legacy' },
  lifestyle: { panel: 'you', section: 'lifestyle' },
  goodlife: { panel: 'you', section: 'possessions' },
  possessions: { panel: 'you', section: 'possessions' },
  office: { panel: 'you', section: 'court' },
  audience: { panel: 'you', section: 'court' },
  you: { panel: 'you', section: 'character' },
  gifts: { panel: 'town', section: 'patronage' },
  // Town & Law
  law: { panel: 'town', section: 'case' },
  fugitive: { panel: 'town', section: 'case' },
  town: { panel: 'town', section: 'underbelly' },
  underbelly: { panel: 'town', section: 'underbelly' },
  cityhall: { panel: 'town', section: 'cityhall' },
  people: { panel: 'town', section: 'cityhall' },
  patronage: { panel: 'town', section: 'patronage' },
  night: { panel: 'town', section: 'night' },
  ears: { panel: 'town', section: 'night' },
  madam: { panel: 'town', section: 'night' },
  attached: { panel: 'town', section: 'attached' },
  // The feed
  chronicle: { panel: 'chronicle', section: 'all' },
  papers: { panel: 'chronicle', section: 'papers' },
  storylines: { panel: 'chronicle', section: 'stories' },
  reports: { panel: 'chronicle', section: 'reports' },
};

/** Resolve an old tab id, or a "panel" / "panel.section" string, to a route. */
export function routeFor(tab: string): Route {
  if (LEGACY_TAB_ROUTE[tab]) return LEGACY_TAB_ROUTE[tab];
  const [panel, section] = tab.split('.');
  if ((PANEL_IDS as string[]).includes(panel)) return { panel: panel as PanelId, section };
  return {};
}
