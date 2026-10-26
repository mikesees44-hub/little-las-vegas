/**
 * The route model of the map-first shell. A route names one drawer (a
 * "panel") and, optionally, one section inside it. Every old tab id still
 * resolves through LEGACY_TAB_ROUTE, so alerts, advice links and other
 * branches that say `goTab('business')` land in the right place.
 */
export type PanelId = 'you' | 'house' | 'borgata' | 'holdings' | 'ops' | 'diplomacy' | 'town' | 'chronicle';

/**
 * The six places a boss thinks in (see nav.ts): the rail and the phone's
 * bottom bar. A drawer section keeps its registry key ("holdings.money");
 * nav.ts says which home it lives in.
 */
export type HomeId = 'week' | 'money' | 'biz' | 'family' | 'town' | 'you';
export const HOME_IDS: HomeId[] = ['week', 'money', 'biz', 'family', 'town', 'you'];

export interface Route {
  /** A registry panel (with `section`): the old way to point at a section, still valid everywhere. */
  panel?: PanelId;
  section?: string;
  /** A home (nav.ts); with `key` ("holdings.money" or "nav.settings") one section of it, else its front page. */
  home?: HomeId;
  key?: string;
}

export const PANEL_IDS: PanelId[] = ['you', 'house', 'borgata', 'holdings', 'ops', 'diplomacy', 'town', 'chronicle'];

/** Old tab ids (the pre-shell tab bar, alerts' `tab`, advice links) → where they live now. */
export const LEGACY_TAB_ROUTE: Record<string, Route> = {
  map: {},
  money: { panel: 'holdings', section: 'money' },
  // Rackets & Fronts
  business: { panel: 'holdings', section: 'rackets' },
  holdings: { panel: 'holdings', section: 'rackets' },
  realestate: { panel: 'holdings', section: 'property' },
  designer: { panel: 'holdings', section: 'designer' },
  empire: { panel: 'holdings', section: 'designer' },
  hq: { panel: 'holdings', section: 'hq' },
  books: { panel: 'holdings', section: 'books' },
  take: { panel: 'holdings', section: 'take' },
  tribute: { panel: 'holdings', section: 'take' },
  envelope: { panel: 'holdings', section: 'take' },
  earnings: { panel: 'borgata', section: 'earnings' },
  longgame: { panel: 'town', section: 'case' },
  rackethub: { panel: 'holdings', section: 'hub' },
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
  wars: { panel: 'diplomacy', section: 'table' },
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
  neighborhoods: { panel: 'town', section: 'hoods' },
  missions: { panel: 'ops', section: 'missions' },
  pacts: { panel: 'diplomacy', section: 'pacts' },
  night: { panel: 'town', section: 'night' },
  ears: { panel: 'town', section: 'night' },
  madam: { panel: 'town', section: 'night' },
  attached: { panel: 'town', section: 'attached' },
  // The feed
  chronicle: { panel: 'chronicle', section: 'all' },
  papers: { panel: 'chronicle', section: 'papers' },
  storylines: { panel: 'chronicle', section: 'stories' },
  reports: { panel: 'chronicle', section: 'reports' },
  walk: { panel: 'you', section: 'walk' },
  hood: { panel: 'town', section: 'hoods' },
  plan: { panel: 'ops', section: 'plan' },
  settings: { home: 'you', key: 'nav.settings' },
  help: { home: 'you', key: 'nav.help' },
  // The six homes by name.
  week: { home: 'week' },
  biz: { home: 'biz' },
  rackets: { home: 'biz', key: 'holdings.hub' },
};

/**
 * Resolve an old tab id, a "panel" / "panel.section" string, a home id
 * ("money") or "home:<key>" to a route. nav.ts turns the route into a home
 * and a section.
 */
export function routeFor(tab: string): Route {
  if (Object.prototype.hasOwnProperty.call(LEGACY_TAB_ROUTE, tab)) return LEGACY_TAB_ROUTE[tab];
  if (tab.startsWith('home:')) {
    const [home, key] = tab.slice(5).split('/');
    if ((HOME_IDS as string[]).includes(home)) return { home: home as HomeId, key: key || undefined };
  }
  const [panel, section] = tab.split('.');
  if ((PANEL_IDS as string[]).includes(panel)) return { panel: panel as PanelId, section };
  if ((HOME_IDS as string[]).includes(panel)) return { home: panel as HomeId };
  return {};
}
