import { capos, crew, displayName } from '../../engine/characters';
import { bossDesk, type DeskItem, type DeskUi } from '../../engine/desk';
import { recommendations, type Rec } from '../../engine/planner/brief';
import { getRelation } from '../../engine/relations';
import type { Character, GameState } from '../../engine/types';
import { verbOfEntry, VERBS, type Verb } from '../plans/actionVerbs';
import { ACTION_ENTRIES } from './actionEntries';
import { DOMAIN_HOMES, homeDomains, homeOfDeskItem, homeOfPerson, homeOfText } from './homeDomain';
import { itemOf, resolveRoute } from './nav';
import type { HomeId } from './routes';

export { homeDomains };

/**
 * ONE FRONT PAGE FOR EVERY HOME (STREAMLINE_2 §3.3), pure. Drawer.tsx renders the five bands in
 * this order, each empty-safe:
 *   1. Recommended  — the consigliere's picks for this home's domains (at most three)
 *   2. Needs you    — the Desk's "Needs you" papers that belong here (plus doNow, which the shell adds)
 *   3. Your people  — the people this home is about (at most n, "Everyone ▸" for the rest)
 *   4. Do something — this home's things to do (actionEntries), by verb
 *   5. Records      — the places (nav.ts), as before
 * Nothing here is new content: every row is something reachable elsewhere, gathered by domain.
 */

/** The one domain home a recommendation belongs to: its words, the place it opens, the person it names. */
export function homeOfRec(s: GameState, r: Rec): Exclude<HomeId, 'desk'> {
  const g = r.go;
  let key: string | undefined;
  if (g.tab) { try { key = resolveRoute(g.tab).key; } catch { key = undefined; } }
  const ev = g.event ? s.pendingEvents.find((e) => e.iid === g.event) : undefined;
  const text = `${r.title}. ${r.why}${ev ? ` ${ev.title}` : ''}`;
  // A plain order or an event: its words decide; a link: the place it opens.
  return homeOfText(s, text, g.order || g.event ? undefined : key, g.char);
}

/** Band 1: the consigliere's picks for this home (the Desk: his top three overall). At most three. */
export function recsFor(s: GameState, home: HomeId, ui: Pick<DeskUi, 'answers' | 'briefSkip' | 'orders'> = {}): Rec[] {
  try {
    if (home === 'desk') return recommendations(s, ui);
    return recommendations(s, ui, undefined, { keep: (r) => homeOfRec(s, r) === home, n: 3 });
  } catch { return []; }
}

/** Band 2: the Desk's "Needs you" papers for this home (the Desk: all of them), open ones first. */
export function needsFor(s: GameState, home: HomeId, ui: DeskUi = {}): DeskItem[] {
  let items: DeskItem[] = [];
  try { items = bossDesk(s, ui).find((g) => g.kind === 'needs')?.items ?? []; } catch { items = []; }
  const mine = home === 'desk' ? items : items.filter((it) => homeOfDeskItem(s, it) === home);
  return [...mine.filter((x) => !x.done), ...mine.filter((x) => x.done)];
}

export interface FrontPerson {
  id: string;
  name: string;
  /** "Your wife", "Capo", "Manno family" */
  role: string;
  trust?: number;
  /** Grievance: a beef with you. */
  beef?: number;
  away?: string;
}

const alive = (s: GameState, id: string | undefined): Character | undefined => {
  const c = id ? s.characters[id] : undefined;
  return c && c.alive ? c : undefined;
};

const RIVAL_NAME: Record<string, string> = { manno: 'Manno', feldstein: 'Feldstein', kessler: 'Kessler', philly: 'Philadelphia' };

/** Everyone a home is about, most important first (pure, deterministic). */
export function peopleOf(s: GameState, home: HomeId): { c: Character; role: string }[] {
  const me = s.characters[s.playerId];
  if (!me) return [];
  const out: { c: Character; role: string }[] = [];
  const add = (c: Character | undefined, role: string) => { if (c && c.id !== s.playerId && !out.some((x) => x.c.id === c.id)) out.push({ c, role }); };
  const rankWord = (c: Character) => c.rank.charAt(0).toUpperCase() + c.rank.slice(1);
  if (home === 'house') {
    add(alive(s, me.spouseId), me.gender === 'M' ? 'Your wife' : 'Your husband');
    for (const id of me.childrenIds) { const k = alive(s, id); add(k, k?.gender === 'F' ? 'Your daughter' : 'Your son'); }
    add(alive(s, me.fatherId), 'Your father');
    add(alive(s, me.motherId), 'Your mother');
    for (const c of Object.values(s.characters)) if (c.alive && c.dynasty) add(c, 'Your house');
  } else if (home === 'org') {
    for (const c of capos(s)) add(c, 'Capo');
    for (const c of crew(s)) if (!c.specialty) add(c, rankWord(c));
  } else if (home === 'money') {
    for (const c of crew(s)) if (c.specialty === 'accountant') add(c, 'Your accountant');
    for (const c of crew(s)) if (c.frontMan) add(c, 'Front man');
    for (const c of [...capos(s)].sort((a, b) => b.wealth - a.wealth || a.id.localeCompare(b.id))) add(c, 'Capo, earner');
  } else if (home === 'law') {
    for (const c of crew(s)) if (c.specialty === 'lawyer') add(c, 'Your lawyer');
    for (const c of crew(s)) if (c.imprisonedUntil && c.imprisonedUntil > s.week) add(c, 'Pinched');
    for (const c of Object.values(s.characters)) if (c.alive && homeOfPerson(s, c.id) === 'law') add(c, c.office ?? 'The law');
  } else if (home === 'rivals') {
    for (const r of s.rivals) add(alive(s, r.leaderId), `Boss of the ${RIVAL_NAME[r.id] ?? r.id} family`);
  } else if (home === 'town') {
    for (const c of Object.values(s.characters)) if (c.alive && c.office && homeOfPerson(s, c.id) === 'town') add(c, c.office);
  }
  return out;
}

/** Band 3: at most `n` people for this home, with trust and beef as far as he knows. The Desk has none (it is everyone). */
export function peopleFor(s: GameState, home: HomeId, n = 6): { shown: FrontPerson[]; total: number } {
  if (home === 'desk') return { shown: [], total: 0 };
  let all: { c: Character; role: string }[] = [];
  try { all = peopleOf(s, home); } catch { all = []; }
  const shown = all.slice(0, n).map(({ c, role }): FrontPerson => {
    const rel = getRelation(s, c.id, s.playerId);
    return { id: c.id, name: displayName(c), role, trust: rel?.trust, beef: rel?.grievance, away: c.imprisonedUntil && c.imprisonedUntil > s.week ? 'inside' : undefined };
  });
  return { shown, total: all.length };
}

/** The home(s) an entry of the action registry is done in: the homes of its places; else its words. */
export function entryHomes(s: GameState | undefined, i: number): HomeId[] {
  const e = ACTION_ENTRIES[i];
  const out = new Set<HomeId>();
  for (const at of e.at) {
    if (at === 'office' || at === 'event') out.add('desk');
    else if (at === 'map' || at === 'place') out.add('town');
    else if (at !== 'person') { const it = itemOf(at); if (it) out.add(it.home); }
  }
  if (!out.size) out.add(s ? homeOfText(s, `${e.label} ${e.words}`) : 'org');
  return [...out];
}

/** Band 4: this home's things to do, grouped by verb (indices into ACTION_ENTRIES), verbs in hub order. */
export function actionsFor(home: HomeId, s?: GameState): { verb: Verb; label: string; glyph: string; entries: number[] }[] {
  const by = new Map<Verb, number[]>();
  ACTION_ENTRIES.forEach((e, i) => {
    if (!entryHomes(s, i).includes(home)) return;
    const v = verbOfEntry(e);
    by.set(v, [...(by.get(v) ?? []), i]);
  });
  return VERBS.filter((v) => by.has(v.id)).map((v) => ({ verb: v.id, label: v.label, glyph: v.glyph, entries: by.get(v.id)! }));
}

/** Every domain home (for tests and the Round). */
export const FRONT_HOMES = DOMAIN_HOMES;
