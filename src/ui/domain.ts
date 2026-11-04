/**
 * DOMAIN COLORS: each part of the Don's life has its own tinted accent over the
 * noir base (index.css `--d-*` tokens, `.llv-d-<domain>` classes, Tailwind `dom-*`
 * colors). This is the ONE place that says which domain a thing belongs to:
 * story themes, Your File categories, alert categories, Desk kinds, nav keys.
 *
 * Colour is never the only signal: every use keeps its icon and its words.
 */
import type { JCat } from '../engine/journal';
import { classify } from '../engine/journal';
import type { GameState } from '../engine/types';

export type Domain = 'family' | 'crew' | 'money' | 'law' | 'rivals' | 'romance' | 'politics' | 'church' | 'shore';

export const DOMAIN_IDS: Domain[] = ['family', 'crew', 'money', 'law', 'rivals', 'romance', 'politics', 'church', 'shore'];

export const DOMAINS: Record<Domain, { label: string; glyph: string; blurb: string }> = {
  family: { label: 'Family & house', glyph: '♔', blurb: 'Wife, children, blood, the succession, the chair' },
  crew: { label: 'Crew & the street', glyph: '⚑', blurb: 'Capos, soldiers, rackets, orders, the Rise' },
  money: { label: 'Money', glyph: '$', blurb: 'The envelope, the ledger, the store, cutting up a score' },
  law: { label: 'Law & the feds', glyph: '§', blurb: 'Heat, pinches, trials, wiretaps, threats' },
  rivals: { label: 'Rivals & war', glyph: '♞', blurb: 'The other families, the army, hits and strikes' },
  romance: { label: 'Romance & nightlife', glyph: '☾', blurb: 'The goomar, dates, clubs, the night' },
  politics: { label: 'Politics & the town', glyph: '⌸', blurb: 'City Hall, the commissioner, the Table' },
  church: { label: 'Church & community', glyph: '✝', blurb: 'The priest, funerals, charity, sharing the wealth' },
  shore: { label: 'The shore & travel', glyph: '≈', blurb: 'The boardwalk, Ocean City, trips, the storm' },
};

/** The class that sets a domain's colours (`--d`, `--d-ink`) on an element and its children. */
export function domClass(d: Domain | undefined): string {
  return d ? `llv-d-${d}` : '';
}

/** Card treatment: edge band and a faint tint in the domain's colour. */
export function domCard(d: Domain | undefined): string {
  return d ? `llv-d-${d} llv-dom-edge llv-dom-tint` : '';
}

const MAP: Record<string, Domain> = {
  // Your File categories (journal.ts JCat)
  money: 'money', crew: 'crew', family: 'family', romance: 'romance', rivals: 'rivals', law: 'law', property: 'money',
  rackets: 'crew', politics: 'politics', travel: 'shore', paper: 'politics', intrigue: 'rivals', town: 'politics',
  // Story director themes (storyDirector.ts Theme)
  business: 'money', chain: 'crew', world: 'shore', institution: 'church',
  // Desk kinds (desk.ts) that are a domain by themselves
  envelope: 'money', bill: 'money', lawyer: 'law', lieutenant: 'crew', sitdown: 'crew', request: 'crew',
  // Homes and nav keys (shell/nav.ts): the prefix decides, a few sections are their own
  desk: 'crew', org: 'crew', borgata: 'crew', ops: 'crew', holdings: 'money', you: 'family', house: 'family', life: 'family',
  diplomacy: 'rivals', chronicle: 'politics', map: 'shore',
  'town.case': 'law', 'town.cityhall': 'politics', 'town.patronage': 'politics', 'town.underbelly': 'crew', 'town.hoods': 'shore',
  'town.night': 'romance', 'town.nightlife': 'romance', 'town.attached': 'romance', 'town.happening': 'shore',
  'diplomacy.table': 'politics', 'diplomacy.pacts': 'politics', 'ops.travel': 'shore', 'you.walk': 'shore', 'you.dating': 'romance',
  'you.store': 'money', 'you.spend': 'money', 'you.possessions': 'money', 'house.court': 'family', 'house.succession': 'family',
  'borgata.earnings': 'money', 'borgata.take': 'money', 'ops.missions': 'crew',
  // The Store's tabs (engine/storeData.ts STORE_TABS), namespaced: what the thing bought is part of
  'store.luxury': 'money', 'store.property': 'money', 'store.vehicles': 'shore', 'store.services': 'crew', 'store.equipment': 'money',
  'store.armory': 'rivals', 'store.lifestyle': 'romance', 'store.invest': 'money', 'store.legacy': 'family',
  // The office's objects (office/hotspots.ts)
  'office.chair': 'crew', 'office.envelope': 'money', 'office.door': 'crew', 'office.ledger': 'money', 'office.phone': 'law',
  'office.calendar': 'family', 'office.newspaper': 'politics', 'office.photos': 'family', 'office.map': 'shore',
  'office.throne': 'family', 'office.church': 'church', 'office.coat': 'shore',
  // Alert / misc words
  heat: 'law', feds: 'law', fbi: 'law', war: 'rivals', army: 'rivals', strike: 'rivals', hit: 'rivals', church: 'church', priest: 'church',
  charity: 'church', funeral: 'church', goomar: 'romance', nightlife: 'romance', shore: 'shore', boardwalk: 'shore', oceancity: 'shore',
  succession: 'family', marriage: 'family', wife: 'family', kids: 'family', cityhall: 'politics', table: 'politics', store: 'money', envelopes: 'money',
};

/**
 * The domain of a key: a Your File category, a story theme, a Desk kind, a nav key
 * ("holdings.money", "town.case") or a home id. Undefined when it is nobody's.
 */
export function domainOf(key: string | undefined | null): Domain | undefined {
  if (!key) return undefined;
  if ((DOMAIN_IDS as string[]).includes(key)) return key as Domain;
  if (MAP[key]) return MAP[key];
  const dot = key.indexOf('.');
  if (dot > 0) {
    const sec = key.slice(dot + 1);
    if (MAP[sec]) return MAP[sec];
    return MAP[key.slice(0, dot)];
  }
  return undefined;
}

/** The domain of a line of text (a Desk row, a headline), through Your File's classifier. */
export function domainOfText(s: GameState | undefined, text: string, fallback?: JCat): Domain | undefined {
  if (/\b(church|priest|father [A-Z]|funeral|wake|charity|parish|novena|mass)\b/i.test(text)) return 'church';
  if (/\b(Ocean City|boardwalk|storm|hurricane|trip|travel)\b/i.test(text)) return 'shore';
  if (/\b(the Table|City Hall|commissioner|mayor)\b/i.test(text)) return 'politics';
  const NONE = '-' as JCat;
  const c = classify(s as GameState, text, fallback ?? NONE);
  return c === NONE ? undefined : domainOf(c);
}
