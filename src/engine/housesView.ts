import { activeAlliances } from './familyHouses';
import {
  houseOfBirth, PLAYER_HOUSE, plural, type Grudge, type LEventKind, type LHouse,
} from './houses';
import { houseOfFaction } from './housesDeath';
import { opinion } from './relations';
import type { Character, FactionId, GameState, Rank } from './types';

/**
 * Read-only views of the houses for the UI: one index of everybody (Characters
 * and lineage people alike), house summaries, trees, timelines and family
 * listings. Memoized per state object, so a week's renders share one index.
 */

export interface PNode {
  id: string;
  char: boolean;
  first: string;
  last: string;
  maiden?: string;
  nick?: string;
  g: 'M' | 'F';
  eth: Character['ethnicity'];
  stock?: string;
  by: number;
  bm: number;
  dy?: number;
  dm?: number;
  cause?: string;
  /** House blamed for a violent death. */
  killer?: string;
  alive: boolean;
  house?: string;
  f?: string;
  m?: string;
  sp: string[];
  kids: string[];
  titles: string[];
  born?: string;
  note?: string;
  rank?: Rank;
  office?: string;
  faction?: FactionId;
}

export interface HouseIndex {
  nodes: Map<string, PNode>;
  members: Map<string, PNode[]>;
}

const memo = new WeakMap<GameState, HouseIndex>();

export function houseIndex(s: GameState): HouseIndex {
  const hit = memo.get(s);
  if (hit) return hit;
  const nodes = new Map<string, PNode>();
  const members = new Map<string, PNode[]>();
  const L = s.lineage;
  if (L) {
    for (const id in L.people) {
      const p = L.people[id];
      const h = p.house ? L.houses[p.house] : undefined;
      nodes.set(id, {
        id, char: false, first: p.first, last: p.last, maiden: p.maiden, nick: p.nick, g: p.g, eth: p.eth, stock: h?.stock, by: p.by, bm: p.bm,
        dy: p.dy, dm: p.dm, cause: p.cause, killer: p.killer, alive: p.dy === undefined, house: p.house, f: p.f, m: p.m, sp: p.sp ?? [], kids: p.kids ?? [],
        titles: p.titles ?? [], born: p.born, note: p.note,
      });
    }
  }
  for (const c of Object.values(s.characters)) {
    const link = L?.links[c.id];
    const house = L ? houseOfBirth(s, c.id) : undefined;
    const sp = link?.sp ? [...link.sp.filter((x) => x !== c.spouseId)] : [];
    if (c.spouseId) sp.push(c.spouseId);
    const kids = link?.kids ? [...c.childrenIds, ...link.kids.filter((k) => !c.childrenIds.includes(k))] : c.childrenIds.slice();
    const titles = [...(link?.titles ?? [])];
    if (c.office) titles.push(c.office);
    nodes.set(c.id, {
      id: c.id, char: true, first: c.firstName, last: c.lastName, maiden: c.maidenName, nick: c.nickname, g: c.gender, eth: c.ethnicity,
      stock: house && L ? L.houses[house]?.stock : undefined, by: c.birth.y, bm: c.birth.m, dy: c.death?.date.y, dm: c.death?.date.m, cause: c.death?.cause,
      killer: L && c.death?.killer ? houseOfFaction(L, c.death.killer) : undefined, alive: c.alive, house, f: c.fatherId ?? link?.f, m: c.motherId ?? link?.m,
      sp, kids, titles, born: link?.born, note: link?.note, rank: c.rank, office: c.office, faction: c.faction,
    });
  }
  for (const n of nodes.values()) {
    n.kids = n.kids.filter((k) => nodes.has(k));
    n.sp = n.sp.filter((k) => nodes.has(k));
    if (n.house) (members.get(n.house) ?? members.set(n.house, []).get(n.house)!).push(n);
  }
  const idx = { nodes, members };
  memo.set(s, idx);
  return idx;
}

export function node(s: GameState, id: string | undefined): PNode | undefined {
  return id ? houseIndex(s).nodes.get(id) : undefined;
}

export function fullName(n: PNode): string {
  return n.nick ? `${n.first} "${n.nick}" ${n.last}` : `${n.first} ${n.last}`;
}

/** "† 1931, killed in the Castellammarese troubles (the Morettis blamed)". */
export function deathLine(s: GameState, n: PNode): string | undefined {
  if (n.alive) return undefined;
  const k = n.killer ? s.lineage?.houses[n.killer] : undefined;
  const blame = k ? (k.player ? ' (by your house)' : ` (the ${plural(k.name)} blamed)`) : '';
  return `† ${n.dy ?? '?'}${n.cause ? `, ${n.cause}` : ''}${blame}`;
}

export function lifespan(s: GameState, n: PNode): string {
  if (n.alive) return `b. ${n.by} · ${s.date.y - n.by - (s.date.m < n.bm ? 1 : 0)} yrs`;
  return `${n.by}–${n.dy ?? '?'}`;
}

/* ---------------------------------------------------------------- */
/* Houses                                                             */
/* ---------------------------------------------------------------- */

export type RelTone = 'gold' | 'good' | 'bad' | 'warn' | 'neutral';

export interface HouseSummary {
  h: LHouse;
  head?: PNode;
  living: number;
  dead: number;
  relation: { label: string; tone: RelTone };
}

/** Pairs of spouses between two houses. */
export function marriagesBetween(s: GameState, a: string, b: string): { x: PNode; y: PNode }[] {
  const idx = houseIndex(s);
  const out: { x: PNode; y: PNode }[] = [];
  for (const n of idx.members.get(a) ?? []) {
    for (const sid of n.sp) {
      const o = idx.nodes.get(sid);
      if (o?.house === b) out.push({ x: n, y: o });
    }
  }
  return out;
}

export function feudsBetween(s: GameState, a: string, b: string): Grudge[] {
  return (s.lineage?.grudges ?? []).filter((g) => (g.h === a && g.vs === b) || (g.h === b && g.vs === a));
}

const FACTION_REL: Partial<Record<FactionId, { label: string; tone: RelTone }>> = {
  manno: { label: 'Rival crew', tone: 'bad' }, feldstein: { label: 'Rival crew', tone: 'warn' }, kessler: { label: 'Rival crew', tone: 'warn' },
  philly: { label: 'Philadelphia', tone: 'neutral' }, law: { label: 'The Law', tone: 'bad' },
};

export function relationToYou(s: GameState, h: LHouse): { label: string; tone: RelTone } {
  if (h.player) return { label: 'Your house', tone: 'gold' };
  const feuds = feudsBetween(s, h.id, PLAYER_HOUSE);
  if (feuds.some((g) => g.y >= 1960)) return { label: 'Blood feud', tone: 'bad' };
  if (h.dynId && activeAlliances(s).some((a) => a.houseId === h.dynId)) return { label: 'Allied by marriage', tone: 'good' };
  if (marriagesBetween(s, h.id, PLAYER_HOUSE).length) return { label: 'Kin by marriage', tone: 'good' };
  if (feuds.length) return { label: 'Old blood between you', tone: 'warn' };
  if (h.crewOf && s.characters[h.crewOf]?.faction === 'player') return { label: 'Your crew', tone: 'gold' };
  if (h.faction && FACTION_REL[h.faction]) return FACTION_REL[h.faction]!;
  return { label: 'Neutral', tone: 'neutral' };
}

export function houseSummary(s: GameState, h: LHouse): HouseSummary {
  const mem = houseIndex(s).members.get(h.id) ?? [];
  let living = 0;
  for (const n of mem) if (n.alive) living++;
  return { h, head: node(s, h.player ? s.playerId : h.headId), living, dead: mem.length - living, relation: relationToYou(s, h) };
}

export function houseSummaries(s: GameState): HouseSummary[] {
  const L = s.lineage;
  if (!L) return [];
  return L.order.map((id) => houseSummary(s, L.houses[id]));
}

/* ---------------------------------------------------------------- */
/* Trees                                                              */
/* ---------------------------------------------------------------- */

export interface TreeUnit {
  id: string;
  spouses: string[];
  kids: TreeUnit[];
  /** Children who belong to another house (a daughter's children). */
  outKids: number;
  depth: number;
  /** People in this subtree (blood). */
  size: number;
  /** Anyone alive in this subtree (blood or spouses). */
  living: boolean;
}

export interface HouseTree {
  root?: TreeUnit;
  /** Members not reachable from the founder. */
  orphans: string[];
  /** Generation rows: depth -> decade label ("1880s"). */
  gens: string[];
  people: number;
}

function byBirth(a: PNode, b: PNode): number {
  return a.by - b.by || a.bm - b.bm || (a.id < b.id ? -1 : 1);
}

export function houseTree(s: GameState, houseId: string): HouseTree {
  const idx = houseIndex(s);
  const h = s.lineage?.houses[houseId];
  const mem = idx.members.get(houseId) ?? [];
  if (!h) return { orphans: [], gens: [], people: 0 };
  const seen = new Set<string>();
  const births: number[][] = [];
  const build = (id: string, depth: number): TreeUnit | undefined => {
    const n = idx.nodes.get(id);
    if (!n || seen.has(id) || depth > 12) return undefined;
    seen.add(id);
    (births[depth] ??= []).push(n.by);
    const kidsAll = n.kids.map((k) => idx.nodes.get(k)).filter((k): k is PNode => !!k);
    const own = kidsAll.filter((k) => k.house === houseId).sort(byBirth);
    const kids = own.map((k) => build(k.id, depth + 1)).filter((u): u is TreeUnit => !!u);
    const spouses = n.sp.filter((x) => idx.nodes.has(x));
    const living = n.alive || spouses.some((x) => idx.nodes.get(x)!.alive) || kids.some((k) => k.living);
    return { id, spouses, kids, outKids: kidsAll.length - own.length, depth, size: 1 + kids.reduce((a, k) => a + k.size, 0), living };
  };
  const root = h.founderId ? build(h.founderId, 0) : undefined;
  const orphans = mem.filter((n) => !seen.has(n.id)).sort(byBirth).map((n) => n.id);
  const gens = births.map((ys) => {
    const sorted = ys.slice().sort((a, b) => a - b);
    const mid = sorted[Math.floor(sorted.length / 2)];
    return `${Math.floor(mid / 10) * 10}s`;
  });
  return { root, orphans, gens, people: mem.length };
}

/** Drop subtrees with nobody alive in them (the "show the dead" toggle off). */
export function livingOnly(u: TreeUnit): TreeUnit {
  return { ...u, kids: u.kids.filter((k) => k.living).map(livingOnly) };
}

/* ---------------------------------------------------------------- */
/* History                                                            */
/* ---------------------------------------------------------------- */

export interface TimelineItem {
  y: number;
  m?: number;
  kind: LEventKind;
  text: string;
  who?: string;
  other?: string;
}

const TITLE_YEARS = /(\d{4})(?:–(\d{4}))?$|since (\d{4})$/;

export function houseTimeline(s: GameState, houseId: string): TimelineItem[] {
  const L = s.lineage;
  if (!L) return [];
  const idx = houseIndex(s);
  const out: TimelineItem[] = [];
  for (const e of L.events) {
    if (e.h !== houseId && e.o !== houseId) continue;
    out.push({ y: e.y, m: e.m, kind: e.k, text: e.t, who: e.p, other: e.h === houseId ? e.o : e.h });
  }
  const feudVictims = new Set(out.filter((e) => e.kind === 'feud').map((e) => e.who));
  for (const n of idx.members.get(houseId) ?? []) {
    if (!n.alive && n.dy !== undefined && !feudVictims.has(n.id)) {
      const age = n.dy - n.by;
      out.push({ y: n.dy, m: n.dm, kind: 'death', text: `${fullName(n)} died${age >= 1 ? `, aged ${age}` : ' in infancy'}: ${n.cause ?? 'unknown causes'}.`, who: n.id });
    }
    for (const t of n.titles) {
      const m = TITLE_YEARS.exec(t);
      const y = m ? Number(m[1] ?? m[3]) : undefined;
      if (y && !out.some((e) => e.kind === 'title' && e.who === n.id)) out.push({ y, kind: 'title', text: `${fullName(n)}: ${t}.`, who: n.id });
    }
  }
  return out.sort((a, b) => a.y - b.y || (a.m ?? 6) - (b.m ?? 6));
}

/* ---------------------------------------------------------------- */
/* A person's family                                                  */
/* ---------------------------------------------------------------- */

export interface FamilyView {
  parents: PNode[];
  siblings: PNode[];
  spouses: PNode[];
  children: PNode[];
}

export function familyView(s: GameState, id: string): FamilyView {
  const idx = houseIndex(s);
  const n = idx.nodes.get(id);
  if (!n) return { parents: [], siblings: [], spouses: [], children: [] };
  const get = (x: string | undefined) => (x ? idx.nodes.get(x) : undefined);
  const parents = [get(n.f), get(n.m)].filter((x): x is PNode => !!x);
  const sib = new Map<string, PNode>();
  for (const p of parents) for (const k of p.kids) if (k !== id && idx.nodes.has(k)) sib.set(k, idx.nodes.get(k)!);
  return {
    parents,
    siblings: [...sib.values()].sort(byBirth),
    spouses: n.sp.map(get).filter((x): x is PNode => !!x),
    children: n.kids.map(get).filter((x): x is PNode => !!x).sort(byBirth),
  };
}

/** What this house holds against yours, and what yours holds against it. */
export function relationsWithYou(s: GameState, houseId: string) {
  const L = s.lineage!;
  const h = L.houses[houseId];
  const alliances = h.dynId ? activeAlliances(s).filter((a) => a.houseId === h.dynId) : [];
  const marriages = marriagesBetween(s, houseId, PLAYER_HOUSE);
  const feuds = feudsBetween(s, houseId, PLAYER_HOUSE);
  const head = node(s, h.headId);
  const headOpinion = head?.char && head.alive && head.id !== s.playerId ? opinion(s, head.id, s.playerId) : undefined;
  return { alliances, marriages, feuds, head, headOpinion };
}

export { PLAYER_HOUSE };
