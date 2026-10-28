import { displayName } from '../../engine/characters';
import { lotName } from '../../engine/property';
import { FACTION_NAMES } from '../../engine/world';
import type { GameState } from '../../engine/types';
import { ACTION_ENTRIES, AT_LABEL } from './actionEntries';
import { HOMES_BY_ID, NAV_ITEMS, sectionDef } from './nav';

/**
 * FIND…: one box for the whole game (Ctrl+K, "/", the top bar's ⌕). Pure:
 * screens (every place and every view of it), people (by name or nickname),
 * places (districts, businesses, lots by name or address) and things to do
 * (the action registry: "lend", "hit", "gift" → where you do it).
 */
export type FindKind = 'do' | 'screen' | 'person' | 'place';

export type FindGo =
  | { to: 'route'; key: string }
  | { to: 'sheet'; id: string }
  | { to: 'map'; district?: string }
  | { to: 'office' }
  | { to: 'person-hint' };

export interface FindResult {
  kind: FindKind;
  id: string;
  title: string;
  sub: string;
  go: FindGo;
  score: number;
}

export const FIND_KIND_LABEL: Record<FindKind, string> = { do: 'Things to do', screen: 'Screens', person: 'People', place: 'Places' };

const norm = (x: string) => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** How well a text answers the words: 0 = not at all; a title starting with the query scores best. */
function score(words: string[], title: string, rest = ''): number {
  const t = norm(title);
  const all = `${t} ${norm(rest)}`;
  if (!words.every((w) => all.includes(w))) return 0;
  const q = words.join(' ');
  return 1 + (t.startsWith(q) ? 4 : 0) + (t.includes(q) ? 2 : 0) + words.filter((w) => t.includes(w)).length;
}

export function findAll(s: GameState, query: string, opts: { open?: (key: string) => boolean; limit?: number } = {}): FindResult[] {
  const words = norm(query).split(/\s+/).filter((w) => w.length > 0);
  if (!words.length || words.join('').length < 2) return [];
  const limit = opts.limit ?? 6;
  const open = opts.open ?? (() => true);
  const out: FindResult[] = [];

  // Things to do (the action registry).
  for (const [i, e] of ACTION_ENTRIES.entries()) {
    const sc = score(words, e.label, e.words);
    if (!sc) continue;
    out.push(entryResult(i, open, sc + 1));
  }

  // Screens: every place and every view.
  for (const it of NAV_ITEMS) {
    const home = HOMES_BY_ID[it.home].label;
    for (const [i, k] of it.keys.entries()) {
      if (!open(k)) continue;
      const view = it.keys.length > 1 ? (it.views?.[i] ?? sectionDef(k)?.label) : undefined;
      const title = view ? `${it.label} › ${view}` : it.label;
      const sc = score(words, title, `${it.sub} ${sectionDef(k)?.label ?? ''} ${home}`);
      if (sc) out.push({ kind: 'screen', id: `screen:${k}`, title, sub: `${home} · ${i === 0 ? it.sub : sectionDef(k)?.blurb ?? it.sub}`, go: { to: 'route', key: k }, score: sc });
    }
  }

  // People.
  let people = 0;
  for (const c of Object.values(s.characters)) {
    if (!c.alive || people > 40) continue;
    const name = displayName(c);
    const sc = score(words, name, `${c.firstName} ${c.lastName} ${c.nickname ?? ''}`);
    if (!sc) continue;
    people++;
    const who = c.id === s.playerId ? 'You' : `${c.rank !== 'civilian' ? c.rank[0].toUpperCase() + c.rank.slice(1) : c.office ?? 'Townsperson'} · ${FACTION_NAMES[c.faction] ?? ''}`;
    out.push({ kind: 'person', id: `person:${c.id}`, title: name, sub: who, go: { to: 'sheet', id: c.id }, score: sc + (c.faction === 'player' ? 1 : 0) });
  }

  // Places: districts, businesses, lots.
  for (const d of s.districts) {
    const sc = score(words, d.name);
    if (sc) out.push({ kind: 'place', id: `district:${d.id}`, title: d.name, sub: 'A district: show it on the map', go: { to: 'map', district: d.id }, score: sc + 1 });
  }
  for (const b of s.businesses) {
    const sc = score(words, b.name);
    if (!sc) continue;
    const mine = b.owner === 'player';
    out.push({ kind: 'place', id: `biz:${b.id}`, title: b.name, sub: `${mine ? 'Yours' : FACTION_NAMES[b.owner] ?? 'A business'} · ${s.districts.find((d) => d.id === b.districtId)?.name ?? ''}`, go: mine ? { to: 'route', key: 'holdings.rackets' } : { to: 'map', district: b.districtId }, score: sc });
  }
  let lots = 0;
  for (const l of s.econ?.lots ?? []) {
    if (lots > 20) break;
    const name = lotName(l);
    const sc = score(words, name, l.address);
    if (!sc) continue;
    lots++;
    out.push({ kind: 'place', id: `lot:${l.id}`, title: name, sub: `${l.address} · real estate`, go: { to: 'route', key: 'holdings.property' }, score: sc - 1 });
  }

  // Best first within each kind, a few of each kind.
  const kinds: FindKind[] = ['do', 'screen', 'person', 'place'];
  return kinds.flatMap((k) => out.filter((r) => r.kind === k).sort((a, b) => b.score - a.score).slice(0, limit));
}

/** A thing to do (the registry's i-th entry) as a Find result: where it is done, and the way there. */
export function entryResult(i: number, open: (key: string) => boolean = () => true, sc = 1): FindResult {
  const e = ACTION_ENTRIES[i];
  const at = e.at.find((a) => !AT_LABEL[a] && open(a)) ?? e.at[0];
  const where = AT_LABEL[at] ? AT_LABEL[at] : placeLabel(at);
  const go: FindGo = at === 'person' ? { to: 'person-hint' } : at === 'office' || at === 'event' ? { to: 'office' } : at === 'map' ? { to: 'map' } : at === 'place' ? { to: 'route', key: 'you.walk' } : { to: 'route', key: at };
  return { kind: 'do', id: `do:${i}`, title: e.label, sub: `Where: ${where}${e.at.length > 1 ? ` · also ${e.at.filter((a) => a !== at).map((a) => AT_LABEL[a] ?? placeLabel(a)).join(', ')}` : ''}`, go, score: sc };
}

/** "What you own › Real estate (Rackets & Businesses)" for a registry key. */
export function placeLabel(key: string): string {
  const it = NAV_ITEMS.find((x) => x.keys.includes(key));
  if (!it) return key;
  const i = it.keys.indexOf(key);
  const view = it.keys.length > 1 ? it.views?.[i] : undefined;
  return `${it.label}${view ? ` › ${view}` : ''} (${HOMES_BY_ID[it.home].short})`;
}
