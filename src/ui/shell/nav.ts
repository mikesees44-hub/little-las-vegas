import { PANELS, type SectionDef } from './panels';
import { HOME_IDS, homeId, LEGACY_TAB_ROUTE, routeFor, type HomeId, type PanelId, type Route } from './routes';

/**
 * The game's menus, organized the way a boss thinks: seven homes, one domain each
 * (The Desk, Family, Crew, Money, Law, Rivals, Town; STREAMLINE_2 §3.1), each a
 * short list of places (at most eight) with a plain name, an icon and one line
 * on what it is for. The old homes and letters still land (routes.ts LEGACY_HOME, OLD_KEYS).
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
  /** Old names and other words players type for it (§3.5: labels change, ids don't; Find still matches). */
  words?: string;
}

export interface NavGroupDef {
  /** Omitted for a home with one plain list. */
  title?: string;
  items: NavItemDef[];
}

export const HOMES: HomeDef[] = [
  { id: 'desk', icon: '▤', label: 'The Desk', short: 'Desk', key: 'd', blurb: 'What needs you this week, and what your people are handling for you. Jobs under way, the news, holding court.' },
  { id: 'house', icon: '♔', label: 'Family', short: 'Family', key: 'f', blurb: 'Blood and the man himself: your sheet and how you rule, your wife, children and the goomar, your house, marriages, succession.' },
  { id: 'org', icon: '⚑', label: 'Crew', short: 'Crew', key: 'c', blurb: 'The organisation: the Rise, your capos and their men, the council, who handles what, standing orders, trouble inside.' },
  { id: 'money', icon: '$', label: 'Money', short: 'Money', key: 'b', blurb: 'The envelope and the money, the books, the rackets, dirty work, what you own, the loan desk, the Store.' },
  { id: 'law', icon: '§', label: 'Law', short: 'Law', key: 'l', blurb: 'The government\'s case against you, the heat and the Feds, your headquarters, guards and inquiries.' },
  { id: 'rivals', icon: '♞', label: 'Rivals', short: 'Rivals', key: 'r', blurb: 'The other families and intrigue, war, the Table, the front boss.' },
  { id: 'town', icon: '⌖', label: 'Town', short: 'Town', key: 't', blurb: 'Wildwood outside your door: the street and the boardwalk, the neighborhoods, the night, the underbelly, City Hall, trips.' },
];
export const HOMES_BY_ID = Object.fromEntries(HOMES.map((h) => [h.id, h])) as Record<HomeId, HomeDef>;

/**
 * The old letters still open the home their sections moved to (This Week w, You y, the old House h,
 * Ops o, the Map m, `$`). Where an old letter is a new home's letter now, the new home wins
 * (c = Crew, f = Family, l = Law); the shell says so once.
 */
export const OLD_KEYS: Record<string, HomeId> = { w: 'desk', y: 'house', h: 'house', o: 'desk', m: 'town', $: 'money' };
/** The one-time note for the letters that changed meaning. */
export const KEYS_CHANGED = 'Keys changed: D = the Desk, F = Family, C = Crew, B = Money, L = Law, R = Rivals, T = Town (M still opens Town).';
/** The letters whose meaning changed with the seven homes (the note above shows once). */
export const CHANGED_LETTERS = 'fclt';

/** Where a registry section with no line in NAV lands: its old drawer's new home. */
export const FALLBACK_HOME: Record<PanelId, HomeId> = {
  you: 'house', house: 'house', borgata: 'org', holdings: 'money', ops: 'desk', diplomacy: 'rivals', town: 'town', chronicle: 'desk',
};

/** Sections that live in the shell itself (not in panels.tsx); App renders them. ☰ opens them; nav parks them under the Desk. */
export const NAV_ONLY = ['nav.settings', 'nav.help'] as const;

export const NAV: Record<HomeId, NavGroupDef[]> = {
  // The front page of the Desk is the one list (App.tsx: BossDesk): what needs you, what is handled. Below it, its places.
  desk: [
    { items: [
      { keys: ['ops.progress', 'ops.missions', 'ops.plan'], icon: '⚙', label: 'Jobs', sub: 'What your people are working on, the big cases stage by stage, and planning a new job.', views: ['Under way', 'The big cases', 'A new job'], words: 'plan a job plan new schemes plans operations' },
      { keys: ['chronicle.book', 'chronicle.all', 'chronicle.mine', 'chronicle.street', 'chronicle.family', 'chronicle.papers', 'chronicle.stories', 'chronicle.reports'], icon: '✎', label: 'The news', sub: 'Your story, the street, the family, the papers, the storylines and each week\'s report.', views: ['Your File', 'Everything', 'Yours', 'The street', 'Family', 'The papers', 'Storylines', 'Weekly reports'] },
      { keys: ['you.court'], icon: '☏', label: 'Audience', sub: 'Office hours: the people who come to see the boss.', words: 'hold court office hours who wants to see you the door visitors calendar' },
      { keys: ['nav.settings', 'nav.help'], icon: '⚙', label: 'Settings & help', sub: 'Motion, text speed, when the game pauses; what should I do, the glossary, the keys.', views: ['Settings', 'Help & keys'] },
    ] },
  ],
  house: [
    { items: [
      { keys: ['you.character', 'you.lifestyle'], icon: '☺', label: 'You', sub: 'Your skills, health, traits and standing, and how you rule: lifestyle and perks.', views: ['Your sheet', 'How you rule'], words: 'your sheet character lifestyle perks how you rule' },
      { keys: ['you.people', 'you.dating', 'house.activities'], icon: '♥', label: 'Your people & dating', sub: 'Wife, goomars, kids, friends, enemies: what they feel and want. Dates, and dinners and outings.', views: ['Your people', 'Relationships & Dating', 'Dinners & outings'], words: 'dinners outings activities host a dinner feast' },
      { keys: ['house.tree', 'house.houses'], icon: '♔', label: 'Your house', sub: 'Your wife, your children, your house, and every family\'s tree back to the old country.', views: ['Family tree', 'Every house'] },
      { keys: ['house.marriages'], icon: '⚭', label: 'Marriages & children', sub: 'Matches between houses, and the kids growing up.' },
      { keys: ['house.court', 'house.succession'], icon: '♕', label: 'Succession', sub: 'Your heir, who backs whom as far as you know, the underboss\'s court, the promises.', views: ['Who backs whom', 'The heir & the law'], words: 'the succession heir shadow court' },
      { keys: ['house.decisions', 'house.legacy'], icon: '★', label: 'The house\'s name', sub: 'Big moves for the house, what it is known for, and renown to spend.', views: ['Big moves', 'Legacy & renown'], words: 'decisions ambitions' },
    ] },
  ],
  org: [
    { items: [
      { keys: ['borgata.rise', 'borgata.progress', 'borgata.membership', 'borgata.place'], icon: '▲', label: 'The Rise', sub: 'Grow the family: the ladder, your capos and their men, levels and focus, who is ready for more, getting made.', views: ['The Rise', 'Coming up', 'Getting made', 'Your place'] },
      { keys: ['borgata.chart', 'borgata.capos', 'borgata.mymen', 'borgata.eat', 'borgata.night'], icon: '⚑', label: 'Your men', sub: 'The chart and the civilian payroll, the capos and their men, who is hungry for work, the night people.', views: ['Who\'s who', 'Capos & soldiers', 'Take care of them', 'Let them eat', 'The night people'] },
      { keys: ['borgata.council', 'borgata.chain', 'borgata.orders'], icon: '♜', label: 'Council & standing orders', sub: 'Five seats, one job each; who handles what on their own; family rules and your standing orders.', views: ['The seats', 'Who handles what', 'Standing orders'], words: 'chain of command delegation edicts rules orders' },
      { keys: ['borgata.grievances'], icon: '☍', label: 'Trouble inside', sub: 'Who feels passed over, who is ganging up: grudges and factions.', words: 'grudges factions grievances' },
    ] },
  ],
  money: [
    { items: [
      { keys: ['holdings.money', 'holdings.take', 'borgata.earnings'], aliases: ['borgata.take'], icon: '$', label: 'The money', sub: 'This week\'s money and your Pocket, the envelope the underboss brings, what every man earned.', views: ['This week\'s money', 'The envelope', 'Who earned what'], words: 'envelope weekly take tribute earnings' },
      { keys: ['holdings.books'], icon: '✍', label: 'The books & dirty money', sub: 'How the books are kept, washing dirty money, loans, and the bookkeeper.' },
      { keys: ['holdings.hub'], icon: '♣', label: 'The rackets', sub: 'Every racket on the island: start one, decide how it runs, what it pays.' },
      { keys: ['holdings.dirty'], icon: '✂', label: 'Dirty work', sub: 'One-off jobs: hijack a truck, shake down a shop, fix a fight, move a load.' },
      { keys: ['holdings.rackets', 'holdings.property', 'holdings.designer'], icon: '▣', label: 'What you own', sub: 'Your places, your real estate, your hotels and motels.', views: ['Your places', 'Real estate', 'Hotels & motels'] },
      { keys: ['holdings.loandesk'], icon: '%', label: 'Loan desk', sub: 'Your bank or book: who Chemical Bank turned down, your rate (up to the vig), what happens if they don\'t pay.' },
      { keys: ['holdings.tech', 'holdings.gear'], icon: '⚙', label: 'Family development', sub: 'Technology, connections and crew equipment: how the family gets tougher over the years.', views: ['Technology & connections', 'Crew equipment'] },
      { keys: ['you.store', 'you.pocket', 'you.spend', 'you.possessions'], icon: '♠', label: 'The Store', sub: 'Everything money buys, from a flop house to a yacht. Spend your pocket; share the wealth; a family vacation.', views: ['The Store', 'Your pocket', 'Everything, as a list', 'The good life (yours)'] },
    ] },
  ],
  law: [
    { items: [
      { keys: ['town.case'], icon: '§', label: 'Your case', sub: 'The government\'s case against you, from a file to a trial, and the fugitive road.', words: 'feds fbi heat trial fugitive' },
      { keys: ['holdings.hq'], icon: '⌂', label: 'Headquarters', sub: 'Where the family meets, how safe it is from bugs and the Feds, and moving it.', words: 'hq bugs wiretap' },
      { keys: ['borgata.protect'], icon: '⛨', label: 'Guards & inquiries', sub: 'Who guards whom and on what schedule; the inquiries running and the reports.', words: 'guards bodyguard inquiry protect' },
    ] },
  ],
  rivals: [
    { items: [
      { keys: ['diplomacy.board', 'diplomacy.intrigue', 'diplomacy.balance'], icon: '♞', label: 'The other families', sub: 'Every family: the era with each, spies and moles, lies, and who is strongest.', views: ['The board', 'Intrigue', 'Who\'s strongest'], words: 'rivals intrigue spies moles' },
      { keys: ['diplomacy.army', 'diplomacy.warroom'], icon: '⚔', label: 'War', sub: 'Your army and allies, and the war room: the fronts, the ledger, peace terms.', views: ['The army', 'The war room'], words: 'army war room mattresses' },
      { keys: ['diplomacy.pacts', 'diplomacy.table'], icon: '⚖', label: 'The Table', sub: 'Truces and partnerships, and Philadelphia\'s sit-down: disputes, rulings, wars.', views: ['Pacts & truces', 'Disputes & wars'] },
      { keys: ['diplomacy.front'], icon: '☍', label: 'The front boss', sub: 'When another man fronts the family: who he is, what he answers for, and the way back.', words: 'front boss' },
    ] },
  ],
  town: [
    { items: [
      { keys: ['town.happening', 'town.attached', 'town.women', 'you.walk'], icon: '☷', label: 'The street', sub: 'The Boardwalk\'s people on their own, who\'s with whom, the women who earn, and the boardwalk on foot.', views: ['What\'s happening', 'Who\'s with whom', 'Women of the town', 'The boardwalk on foot'], words: 'walk the boardwalk walk the town go out' },
      { keys: ['town.hoods'], icon: '⌂', label: 'Neighborhoods', sub: 'Each neighborhood: who lives and works there, who owns what, the police.' },
      { keys: ['town.nightlife', 'town.showbiz', 'town.night'], icon: '☾', label: 'Nightlife, showbiz & the Ears', sub: 'The people of the night, the madams\' houses, your acts and your label, and the Ears.', views: ['Nightlife', 'Showbiz', 'The Ears & the Madam'] },
      { keys: ['town.underbelly'], icon: '⚓', label: 'The underbelly', sub: 'Outfits that prey on people, and what you do about them.' },
      { keys: ['town.cityhall', 'town.patronage'], icon: '⌸', label: 'City Hall', sub: 'Who holds every seat that matters, and buying goodwill: tickets, projects, no-show jobs.', views: ['Who holds what', 'Gifts & patronage'] },
      { keys: ['ops.travel'], icon: '✈', label: 'Trips & envoys', sub: 'Your trips, and the men you sent to other cities.' },
    ] },
  ],
};

// ---- The tree, as the shell uses it (configured lines + fallbacks). ----

export interface NavItem extends NavItemDef {
  home: HomeId;
  /** Above his rank (rankView.ts): shown greyed with the rung that opens it. */
  locked?: string;
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
    const h = FALLBACK_HOME[k.split('.')[0] as PanelId] ?? 'house';
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

/** "Money › The envelope › This week's envelope": where a key lives, home first (the "Opens …" of a link). */
export function wherePath(key: string): string | undefined {
  const k = canonicalKey(key.split('#')[0]);
  const it = k ? BY_KEY[k] : undefined;
  if (!it || !k) return undefined;
  const i = it.keys.indexOf(k);
  const view = it.keys.length > 1 ? it.views?.[i] ?? sectionDef(k)?.label : undefined;
  return [HOMES_BY_ID[it.home].short, it.label, view].filter(Boolean).join(' › ');
}

/** Registry keys an item shows (an alias resolves to the view with its section name, else the item's first key). */
export function canonicalKey(key: string): string | undefined {
  const it = BY_KEY[key];
  if (!it) return undefined;
  if (it.keys.includes(key)) return key;
  const sec = key.split('.')[1];
  return it.keys.find((k) => k.split('.')[1] === sec) ?? it.keys[0];
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
    const home = homeId(route.home)!;
    const k = route.key ? canonicalKey(route.key) : undefined;
    return k && itemOf(k)!.home === home ? { home, key: k } : k ? { home: itemOf(k)!.home, key: k } : { home };
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

/** The keyboard: new letters, old letters, F1–F7. */
export function homeForKey(key: string): HomeId | undefined {
  const k = key.toLowerCase();
  const f = /^f([1-7])$/.exec(k);
  if (f) return HOMES[Number(f[1]) - 1].id;
  return HOMES.find((h) => h.key === k)?.id ?? OLD_KEYS[k];
}
