import { PANELS, type SectionDef } from './panels';
import { HOME_IDS, LEGACY_TAB_ROUTE, routeFor, type HomeId, type PanelId, type Route } from './routes';

/**
 * The game's menus, organized the way a boss thinks: six homes (This Week,
 * Money, Rackets & Businesses, The Family, The Town, You), each a short
 * list of places with a plain name, an icon and one line on what it is for.
 *
 * panels.tsx stays the registry of screens (a section = one key such as
 * "holdings.money"); this file only says WHERE each one lives and what it is
 * called. A section added to panels.tsx without a line here still shows up,
 * at the end of the home its old drawer maps to (FALLBACK_HOME), so a branch
 * that only touches panels.tsx is never lost; tests/nav.test.ts lists them.
 */

export interface HomeDef {
  id: HomeId;
  icon: string;
  label: string;
  /** The rail's and the phone bar's short label. */
  short: string;
  /** One line under the title. */
  blurb: string;
  /** Letter shortcut. */
  key: string;
}

export interface NavItemDef {
  /** Registry keys shown here. The first is the default; more than one makes a row of views (The news: All, Mine, Street...). */
  keys: string[];
  /** Registry keys that are the same screen as this one (kept as links only). */
  aliases?: string[];
  icon: string;
  label: string;
  /** One line: what this is for. */
  sub: string;
  /** Labels for the views (defaults to the registry labels). */
  views?: string[];
}

export interface NavGroupDef {
  /** Omitted for a home with one plain list. */
  title?: string;
  items: NavItemDef[];
}

export const HOMES: HomeDef[] = [
  { id: 'week', icon: '◷', label: 'This Week', short: 'Week', key: 'w', blurb: 'Your week, day by day: the morning meeting with your capos, your evenings, the sit-down, decisions, jobs under way, the news.' },
  { id: 'money', icon: '$', label: 'Money', short: 'Money', key: 'm', blurb: 'The Family\'s money and your own pocket: what came in, where it went, who earned it.' },
  { id: 'biz', icon: '♣', label: 'Rackets & Businesses', short: 'Rackets', key: 'r', blurb: 'What you run and what you own: rackets, places, real estate, hotels.' },
  { id: 'family', icon: '⚑', label: 'The Family', short: 'Family', key: 'f', blurb: 'Your men and your blood: the council, the capos, who gets made, your wife, your kids, your heir.' },
  { id: 'town', icon: '⌂', label: 'The Town', short: 'Town', key: 't', blurb: 'Wildwood outside your door: the streets, the other families, City Hall and the cops.' },
  { id: 'you', icon: '☺', label: 'You', short: 'You', key: 'y', blurb: 'The boss himself: your sheet, how you live, your trips, your case. Settings and help.' },
];
export const HOMES_BY_ID = Object.fromEntries(HOMES.map((h) => [h.id, h])) as Record<HomeId, HomeDef>;

/** The old drawer letters still open the home their sections moved to. */
export const OLD_KEYS: Record<string, HomeId> = { h: 'family', b: 'family', l: 'biz', o: 'week', d: 'town', c: 'week' };

/** Where a registry section with no line in NAV lands: its old drawer's new home. */
export const FALLBACK_HOME: Record<PanelId, HomeId> = {
  you: 'you', house: 'family', borgata: 'family', holdings: 'biz', ops: 'week', diplomacy: 'town', town: 'town', chronicle: 'week',
};

/** Sections that live in the shell itself (not in panels.tsx); App renders them. */
export const NAV_ONLY = ['nav.settings', 'nav.help'] as const;

export const NAV: Record<HomeId, NavGroupDef[]> = {
  week: [
    { title: 'Under way', items: [
      { keys: ['ops.progress'], icon: '⚙', label: 'Jobs under way', sub: 'The hits, heists, envoys and plots your people are working on right now.' },
      { keys: ['ops.missions'], icon: '◈', label: 'The big cases', sub: 'Long jobs stage by stage, and talks waiting on your answer.' },
      { keys: ['ops.plan'], icon: '✚', label: 'Plan a job', sub: 'Start a hit, a heist, an envoy or a plot: who does it, how long, the odds.' },
    ] },
    { title: 'What happened', items: [
      { keys: ['chronicle.all', 'chronicle.mine', 'chronicle.street', 'chronicle.family', 'chronicle.papers', 'chronicle.stories'], icon: '✎', label: 'The news', sub: 'Your story, the street, the family, the papers and the storylines.', views: ['Everything', 'Yours', 'The street', 'Family', 'The papers', 'Storylines'] },
      { keys: ['chronicle.reports'], icon: '▤', label: 'Weekly reports', sub: 'Each week\'s report: money, respect and heat, line by line.' },
    ] },
  ],
  money: [
    { items: [
      { keys: ['holdings.money'], icon: '$', label: 'This week\'s money', sub: 'Where it came from, your cut into the Family and your Pocket, where it went, the last 8 weeks.' },
      { keys: ['holdings.take'], aliases: ['borgata.take'], icon: '✉', label: 'The weekly envelope', sub: 'What the underboss brings every Monday: each crew, your cut, agreements, the ledger.' },
      { keys: ['borgata.earnings'], icon: '▥', label: 'Who earned what', sub: 'Every man in the family: what he earned, kicked up and kept, and what he is worth.' },
      { keys: ['holdings.books'], icon: '✍', label: 'The books & dirty money', sub: 'How the books are kept, washing dirty money, loans, and the bookkeeper.' },
    ] },
  ],
  biz: [
    { items: [
      { keys: ['holdings.hub'], icon: '♣', label: 'The rackets', sub: 'Every racket on the island: start one, decide how it runs, what it pays.' },
      { keys: ['holdings.dirty'], icon: '✂', label: 'Dirty work', sub: 'One-off jobs: hijack a truck, shake down a shop, fix a fight, move a load.' },
      { keys: ['holdings.rackets'], icon: '▣', label: 'Your places', sub: 'The businesses you own by type: managers, upgrades, the take. Buy a new one.' },
      { keys: ['holdings.property'], icon: '▦', label: 'Real estate', sub: 'Lots and buildings in every neighborhood: buy, build, rent out.' },
      { keys: ['holdings.designer'], icon: '✧', label: 'Hotels & motels', sub: 'Set up your motels and hotels your way: the look, the staff, the supplies.' },
      { keys: ['holdings.hq'], icon: '♜', label: 'Headquarters', sub: 'Your social club: who meets there, bugs, and sweeping for them.' },
    ] },
  ],
  family: [
    { title: 'Your crew', items: [
      { keys: ['borgata.chart'], icon: '⚑', label: 'Who\'s who', sub: 'The whole family on one chart. Click anyone to open him.' },
      { keys: ['borgata.council'], icon: '♜', label: 'The council', sub: 'Five seats, one job each a week. Fill a seat, give it a job.' },
      { keys: ['borgata.capos'], icon: '⚔', label: 'Capos & soldiers', sub: 'Who runs each district, and every man under them.' },
      { keys: ['borgata.membership'], icon: '✋', label: 'Getting made', sub: 'Philadelphia\'s books, and the young men who want in.' },
      { keys: ['borgata.orders'], icon: '☰', label: 'Standing orders', sub: 'Rules for the whole family, and orders you give yourself.' },
      { keys: ['borgata.grievances'], icon: '☍', label: 'Grudges & factions', sub: 'Who feels passed over, and who is ganging up.' },
      { keys: ['diplomacy.front'], icon: '♛', label: 'The front boss', sub: 'When the Don the papers see and the man who really runs things are different men.' },
    ] },
    { title: 'Your blood', items: [
      { keys: ['house.tree'], icon: '♔', label: 'Family tree', sub: 'Your wife, your children, your house.' },
      { keys: ['house.marriages'], icon: '♥', label: 'Marriages & children', sub: 'Matches between houses, and the kids growing up.' },
      { keys: ['house.succession'], icon: '♕', label: 'Your heir', sub: 'Who takes over when you go, and the rule that decides it.' },
      { keys: ['house.activities'], icon: '✦', label: 'Dinners & outings', sub: 'Host a dinner, a feast, a trip: the guests think better of you.' },
      { keys: ['house.decisions'], icon: '➚', label: 'House ambitions', sub: 'Big moves for the house, what each takes and how close you are.' },
      { keys: ['house.legacy'], icon: '★', label: 'Legacy & renown', sub: 'What the house is known for, and renown to spend.' },
      { keys: ['house.houses'], icon: '⚘', label: 'Every house', sub: 'Every family\'s tree, back to the old country: the living and the dead.' },
    ] },
  ],
  town: [
    { title: 'On the street', items: [
      { keys: ['you.walk'], icon: '⇢', label: 'Walk the boardwalk', sub: 'Go out as yourself: walk into any place, buy it or run it, meet people.' },
      { keys: ['town.hoods'], icon: '⌂', label: 'Neighborhoods', sub: 'Each neighborhood: who lives and works there, who owns what, the police.' },
      { keys: ['town.night'], icon: '☾', label: 'The Night & the Ears', sub: 'The Madam and the girls who hear everything. She always decides.' },
      { keys: ['town.attached'], icon: '⚭', label: 'Who\'s with whom', sub: 'Sweethearts, regulars, and who keeps someone on the side.' },
      { keys: ['town.underbelly'], icon: '⚓', label: 'The underbelly', sub: 'Outfits that prey on people, and what you do about them.' },
    ] },
    { title: 'The other families', items: [
      { keys: ['diplomacy.board'], icon: '♞', label: 'The other families', sub: 'Every family and power you deal with. Click a face for what you can do.' },
      { keys: ['diplomacy.pacts'], icon: '✍', label: 'Pacts & truces', sub: 'Truces and partnerships, and how the families deal with each other.' },
      { keys: ['diplomacy.table'], icon: '⚖', label: 'The Table & wars', sub: 'Philadelphia\'s sit-down: disputes, rulings, and wars.' },
      { keys: ['diplomacy.balance'], icon: '▲', label: 'Who\'s strongest', sub: 'Muscle, money, men, allies and heat for every family.' },
    ] },
    { title: 'City Hall & the cops', items: [
      { keys: ['town.cityhall'], icon: '⌸', label: 'City Hall & cops', sub: 'Who holds every seat that matters, from the commission to Trenton.' },
      { keys: ['town.patronage'], icon: '❦', label: 'Gifts & patronage', sub: 'Season tickets, public projects, no-show jobs: buying goodwill.' },
    ] },
  ],
  you: [
    { title: 'The boss', items: [
      { keys: ['you.character'], icon: '☺', label: 'Your sheet', sub: 'Your skills, health, traits and standing.' },
      { keys: ['you.lifestyle'], icon: '♠', label: 'How you rule', sub: 'Your style as boss and its perks. Experience builds every week.' },
      { keys: ['you.possessions'], icon: '♦', label: 'The good life', sub: 'Homes, cars, the boat and the toys. Each one costs upkeep.' },
      { keys: ['you.court'], icon: '☏', label: 'Hold court', sub: 'Office hours: the people who come to see the boss.' },
      { keys: ['ops.travel'], icon: '✈', label: 'Trips & envoys', sub: 'Your trips, and the men you sent to other cities.' },
      { keys: ['town.case'], icon: '§', label: 'Your case', sub: 'The government\'s case against you, from a file to a trial.' },
    ] },
    { title: 'The game', items: [
      { keys: ['nav.settings'], icon: '⚙', label: 'Settings', sub: 'Motion, text speed, and when the game pauses by itself.' },
      { keys: ['nav.help'], icon: '?', label: 'Help & keys', sub: 'What should I do, the glossary, and the keyboard shortcuts.' },
    ] },
  ],
};

// ---- The tree, as the shell uses it (configured lines + fallbacks). ----

export interface NavItem extends NavItemDef {
  home: HomeId;
  /** The default key: the item's id. */
  id: string;
  wide: boolean;
}
export interface NavGroup { title?: string; items: NavItem[] }

const REGISTRY: Record<string, SectionDef> = Object.fromEntries(PANELS.flatMap((p) => p.sections.map((x) => [`${p.id}.${x.id}`, x])));
/** Every registry key (panel.section), in registry order. */
export const REGISTRY_KEYS = PANELS.flatMap((p) => p.sections.map((x) => `${p.id}.${x.id}`));
export const sectionDef = (key: string): SectionDef | undefined => REGISTRY[key];

const exists = (k: string) => !!REGISTRY[k] || (NAV_ONLY as readonly string[]).includes(k);

function build(): Record<HomeId, NavGroup[]> {
  const out = {} as Record<HomeId, NavGroup[]>;
  const placed = new Set<string>();
  for (const h of HOME_IDS) {
    out[h] = NAV[h].map((g) => ({
      title: g.title,
      items: g.items.flatMap((it) => {
        const keys = it.keys.filter((k) => exists(k) && !placed.has(k));
        if (!keys.length) return [];
        const aliases = (it.aliases ?? []).filter((k) => exists(k) && !placed.has(k));
        for (const k of [...keys, ...aliases]) placed.add(k);
        const views = it.views ? it.keys.map((k, i) => (exists(k) ? it.views![i] : undefined)).filter((v): v is string => v !== undefined) : undefined;
        return [{ ...it, keys, aliases, views, home: h, id: keys[0], wide: keys.some((k) => !!REGISTRY[k]?.wide) }];
      }),
    })).filter((g) => g.items.length);
  }
  // Anything registered but not placed: at the end of its old drawer's home.
  for (const k of REGISTRY_KEYS) {
    if (placed.has(k)) continue;
    const h = FALLBACK_HOME[k.split('.')[0] as PanelId] ?? 'you';
    const d = REGISTRY[k];
    const item: NavItem = { keys: [k], icon: '•', label: d.label, sub: d.blurb ?? '', home: h, id: k, wide: !!d.wide };
    const groups = out[h];
    const last = groups[groups.length - 1];
    if (last && last.title === 'More') last.items.push(item); else groups.push({ title: 'More', items: [item] });
    placed.add(k);
  }
  return out;
}

export const NAV_TREE: Record<HomeId, NavGroup[]> = build();
export const NAV_ITEMS: NavItem[] = HOME_IDS.flatMap((h) => NAV_TREE[h].flatMap((g) => g.items));

const BY_KEY: Record<string, NavItem> = {};
for (const it of NAV_ITEMS) for (const k of [...it.keys, ...(it.aliases ?? [])]) BY_KEY[k] = it;

/** The item a key (or an alias of it) lives in. */
export function itemOf(key: string): NavItem | undefined {
  return BY_KEY[key];
}

/** Registry keys an item shows (aliases resolve to the item's first key). */
export function canonicalKey(key: string): string | undefined {
  const it = BY_KEY[key];
  if (!it) return undefined;
  return it.keys.includes(key) ? key : it.keys[0];
}

/** Where the shell is: a home and, optionally, one section of it (a canonical key). */
export interface NavRoute { home?: HomeId; key?: string }

/**
 * Any route the game has ever used — a legacy tab id ("business"), a
 * registry route ({ panel: 'holdings', section: 'money' }, "holdings.money"),
 * an old panel alone ("borgata"), a home ("money", { home: 'money' }) — to
 * a home and a section. Unknown routes close the drawers (the map).
 */
export function resolveRoute(r: Route | string | undefined): NavRoute {
  if (!r) return {};
  const route = typeof r === 'string' ? routeFor(r) : r;
  if (route.home) {
    const k = route.key ? canonicalKey(route.key) : undefined;
    return k && itemOf(k)!.home === route.home ? { home: route.home, key: k } : { home: route.home };
  }
  if (route.panel) {
    const p = PANELS.find((x) => x.id === route.panel);
    const sec = route.section && p?.sections.some((x) => x.id === route.section) ? route.section : undefined;
    if (sec) {
      const k = canonicalKey(`${route.panel}.${sec}`);
      if (k) return { home: itemOf(k)!.home, key: k };
    }
    // An old drawer alone: its first section's home, on that section.
    const first = p?.sections[0] ? canonicalKey(`${p.id}.${p.sections[0].id}`) : undefined;
    if (first) return { home: itemOf(first)!.home, key: route.section ? undefined : first };
    return { home: FALLBACK_HOME[route.panel] };
  }
  return {};
}

/** Every legacy tab id, for the tests and the shortcut list. */
export const LEGACY_TABS = Object.keys(LEGACY_TAB_ROUTE);

/** The keyboard: new letters, old letters, F1–F6. */
export function homeForKey(key: string): HomeId | undefined {
  const k = key.toLowerCase();
  const f = /^f([1-6])$/.exec(k);
  if (f) return HOMES[Number(f[1]) - 1].id;
  return HOMES.find((h) => h.key === k)?.id ?? OLD_KEYS[k];
}
