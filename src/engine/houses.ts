import { ageOn } from './calendar';
import type { Ethnicity, FactionId, GameState } from './types';

/**
 * Houses (CK3 dynasties) for every family in the game: the player's, the
 * rival crews, Philadelphia's, the marriageable houses, the political and
 * police dynasties, the families of made men, show-business families.
 *
 * People come in two kinds and the trees treat them the same:
 *  - Characters (`s.characters`): everybody the engine simulates in full.
 *  - Lineage people (`s.lineage.people`): the dead of the generated history
 *    (1870s-1960) and off-screen living relatives, kept as light records and
 *    simulated monthly (housesLife.ts). A lineage person who has to act in
 *    the engine (marry one of yours, come of age in a marriageable house) is
 *    promoted to a Character under the same id.
 *
 * Extra family data for Characters (a lineage father, a dead first wife, the
 * house they were born into, titles) lives in `lineage.links[charId]`, so the
 * engine's own `fatherId`/`spouseId`/`childrenIds` only ever point at
 * Characters.
 *
 * Copy-on-write: `cloneState` shares the lineage object between weeks (it is
 * large and changes monthly). Mutating code calls `linMut(s)` first, which
 * gives the state its own shallow copy, and replaces records instead of
 * editing them in place.
 */

export type HouseType = 'crime' | 'political' | 'police' | 'fire' | 'legit' | 'showbiz';

export const HOUSE_TYPE_LABEL: Record<HouseType, string> = {
  crime: 'Crime family', political: 'Political dynasty', police: 'Police family', fire: 'Fire department family', legit: 'Legitimate family', showbiz: 'Show business',
};

export interface HeadTerm {
  id: string;
  from: number;
}

export interface LHouse {
  id: string;
  /** The surname ("Manno"); `title` is how it is shown. */
  name: string;
  title: string;
  type: HouseType;
  /** Where the house sits (a town). */
  seat: string;
  founded: number;
  /** Where the founder came from ("Sciacca, Sicily", "County Cork", "old Salem County Quaker stock"). */
  origin: string;
  eth: Ethnicity;
  /** Portrait/skin stock where the engine's three ethnicities are too coarse. */
  stock?: string;
  founderId?: string;
  headId?: string;
  /** Heads of the house in order (generated history and play). */
  heads: HeadTerm[];
  /** Linked marriageable house (familyHouses.ts). */
  dynId?: string;
  faction?: FactionId;
  player?: boolean;
  /** The made man this crew house grew up around. */
  crewOf?: string;
  extinct?: number;
  colors: [string, string];
  blurb?: string;
}

export interface LPerson {
  id: string;
  first: string;
  last: string;
  maiden?: string;
  nick?: string;
  g: 'M' | 'F';
  eth: Ethnicity;
  /** Birth year and month. */
  by: number;
  bm: number;
  /** Death year/month and cause (absent = alive). */
  dy?: number;
  dm?: number;
  cause?: string;
  /** House (or faction) responsible for a violent death. */
  killer?: string;
  /** House of birth (bloodline). Spouses married in keep their own. */
  house?: string;
  f?: string;
  m?: string;
  sp?: string[];
  kids?: string[];
  titles?: string[];
  born?: string;
  note?: string;
}

export interface LLink {
  house?: string;
  f?: string;
  m?: string;
  sp?: string[];
  kids?: string[];
  titles?: string[];
  born?: string;
  note?: string;
}

export type LEventKind = 'founding' | 'marriage' | 'feud' | 'title' | 'succession' | 'extinct' | 'deed' | 'birth' | 'death';

export interface LEvent {
  y: number;
  m?: number;
  /** House the event belongs to (and the other house, for marriages and feuds). */
  h: string;
  o?: string;
  k: LEventKind;
  t: string;
  /** People involved. */
  p?: string;
  q?: string;
}

/** A house remembers who killed its own. */
export interface Grudge {
  /** The aggrieved house. */
  h: string;
  /** The house blamed. */
  vs: string;
  victim: string;
  /** Who pulled the trigger, if known. */
  by?: string;
  y: number;
  t: string;
  /** Rival leaders who already took this grudge to heart (grievance applied once each). */
  felt?: string[];
}

export interface LineageState {
  v: 1;
  rng: number;
  next: number;
  houses: Record<string, LHouse>;
  /** House ids in display order. */
  order: string[];
  people: Record<string, LPerson>;
  links: Record<string, LLink>;
  events: LEvent[];
  grudges: Grudge[];
  /** Month key of the last monthly tick. */
  month?: string;
  /** What the feud memory last saw (grudges, boss, people, year): unchanged means nothing to redo. */
  gkey?: string;
}

export const PLAYER_HOUSE = 'h_player';

/* ---------------------------------------------------------------- */
/* Copy-on-write                                                      */
/* ---------------------------------------------------------------- */

const owned = new WeakMap<GameState, LineageState>();

/** Engine-side: the state's own (writable) lineage. Call before any change. */
export function linMut(s: GameState): LineageState {
  const L = s.lineage;
  if (!L) throw new Error('lineage not initialised');
  if (owned.get(s) === L) return L;
  const c: LineageState = {
    ...L,
    houses: { ...L.houses },
    order: L.order.slice(),
    people: { ...L.people },
    links: { ...L.links },
    events: L.events.slice(),
    grudges: L.grudges.slice(),
  };
  s.lineage = c;
  owned.set(s, c);
  return c;
}

/** Has this state already taken its own copy this week (i.e. changed it)? */
export function ownsLineage(s: GameState): boolean {
  return !!s.lineage && owned.get(s) === s.lineage;
}

/** Install a freshly built lineage as owned by this state. */
export function adoptLineage(s: GameState, L: LineageState): void {
  s.lineage = L;
  owned.set(s, L);
}

/**
 * Drop keys whose value is undefined, so a record has the same keys (and the
 * same order) live and after a save/load through JSON.
 */
export function clean<T extends object>(o: T): T {
  for (const k in o) if (o[k] === undefined) delete o[k];
  return o;
}

/** Tidy every record (after a batch of changes): see `clean`. */
export function tidyLineage(L: LineageState): void {
  for (const id in L.people) clean(L.people[id]);
  for (const id in L.links) clean(L.links[id]);
  for (const id in L.houses) clean(L.houses[id]);
  for (const e of L.events) clean(e);
  for (const g of L.grudges) clean(g);
}

export function updPerson(L: LineageState, id: string, patch: Partial<LPerson>): LPerson {
  const p = clean({ ...L.people[id], ...patch });
  L.people[id] = p;
  return p;
}

export function updLink(L: LineageState, id: string, patch: Partial<LLink>): LLink {
  const l = clean({ ...(L.links[id] ?? {}), ...patch });
  L.links[id] = l;
  return l;
}

export function updHouse(L: LineageState, id: string, patch: Partial<LHouse>): LHouse {
  const h = clean({ ...L.houses[id], ...patch });
  L.houses[id] = h;
  return h;
}

/** Add `kid` to a parent's children (Character or lineage person). */
export function addKidRef(s: GameState, L: LineageState, parentId: string, kid: string): void {
  const c = s.characters[parentId];
  if (c) {
    if (s.characters[kid]) {
      if (!c.childrenIds.includes(kid)) c.childrenIds.push(kid);
    } else {
      const l = L.links[parentId];
      if (!l?.kids?.includes(kid)) updLink(L, parentId, { kids: [...(l?.kids ?? []), kid] });
    }
    return;
  }
  const p = L.people[parentId];
  if (p && !p.kids?.includes(kid)) updPerson(L, parentId, { kids: [...(p.kids ?? []), kid] });
}

/** Add `other` to someone's spouses (Character: only as a lineage spouse in links). */
export function addSpouseRef(s: GameState, L: LineageState, id: string, other: string): void {
  const c = s.characters[id];
  if (c) {
    if (c.spouseId === other) return;
    const l = L.links[id];
    if (!l?.sp?.includes(other)) updLink(L, id, { sp: [...(l?.sp ?? []), other] });
    return;
  }
  const p = L.people[id];
  if (p && !p.sp?.includes(other)) updPerson(L, id, { sp: [...(p.sp ?? []), other] });
}

/* ---------------------------------------------------------------- */
/* Plain accessors (engine and UI)                                    */
/* ---------------------------------------------------------------- */

export function lineageOf(s: GameState): LineageState | undefined {
  return s.lineage;
}

export function lhouse(s: GameState, id: string | undefined): LHouse | undefined {
  return id ? s.lineage?.houses[id] : undefined;
}

export function lhouseByDyn(s: GameState, dynId: string): LHouse | undefined {
  const L = s.lineage;
  if (!L) return undefined;
  for (const id of L.order) if (L.houses[id].dynId === dynId) return L.houses[id];
  return undefined;
}

/** Does this person exist (Character or lineage)? */
export function personExists(s: GameState, id: string): boolean {
  return !!s.characters[id] || !!s.lineage?.people[id];
}

export function isAlive(s: GameState, id: string): boolean {
  const c = s.characters[id];
  if (c) return c.alive;
  const p = s.lineage?.people[id];
  return !!p && p.dy === undefined;
}

export function birthYear(s: GameState, id: string): number | undefined {
  const c = s.characters[id];
  if (c) return c.birth.y;
  return s.lineage?.people[id]?.by;
}

export function fatherOf(s: GameState, id: string): string | undefined {
  const c = s.characters[id];
  if (c) return c.fatherId ?? s.lineage?.links[id]?.f;
  return s.lineage?.people[id]?.f;
}

export function motherOf(s: GameState, id: string): string | undefined {
  const c = s.characters[id];
  if (c) return c.motherId ?? s.lineage?.links[id]?.m;
  return s.lineage?.people[id]?.m;
}

export function spousesOf(s: GameState, id: string): string[] {
  const c = s.characters[id];
  if (c) {
    const extra = s.lineage?.links[id]?.sp ?? [];
    return c.spouseId ? [...extra.filter((x) => x !== c.spouseId), c.spouseId] : extra.slice();
  }
  return s.lineage?.people[id]?.sp?.slice() ?? [];
}

export function kidsOf(s: GameState, id: string): string[] {
  const c = s.characters[id];
  if (c) {
    const extra = s.lineage?.links[id]?.kids ?? [];
    return extra.length ? [...c.childrenIds, ...extra.filter((k) => !c.childrenIds.includes(k))] : c.childrenIds.slice();
  }
  return s.lineage?.people[id]?.kids?.slice() ?? [];
}

export function nameOf(s: GameState, id: string): string {
  const c = s.characters[id];
  if (c) return `${c.firstName} ${c.lastName}`;
  const p = s.lineage?.people[id];
  return p ? `${p.first} ${p.last}` : '—';
}

export function firstNameOf(s: GameState, id: string): string {
  return s.characters[id]?.firstName ?? s.lineage?.people[id]?.first ?? '—';
}

/**
 * House of birth. Explicit records first, then the player's rule (members of
 * the house by blood carry its name), then the father's line, then the
 * marriageable-house record.
 */
export function houseOfBirth(s: GameState, id: string, depth = 0): string | undefined {
  const L = s.lineage;
  const c = s.characters[id];
  if (!c) return L?.people[id]?.house;
  const link = L?.links[id];
  if (link?.house) return link.house;
  if (c.dynasty && (c.maidenName ? c.maidenName === s.houseName : c.lastName === s.houseName)) return PLAYER_HOUSE;
  if (depth < 8) {
    const f = c.fatherId ?? link?.f;
    if (f) {
      const fh = houseOfBirth(s, f, depth + 1);
      if (fh) return fh;
    }
  }
  const dh = s.dyn?.people[id]?.houseId;
  if (dh && !c.maidenName) {
    const lh = L ? lhouseByDyn(s, dh) : undefined;
    if (lh) return lh.id;
  }
  return undefined;
}

/* ---------------------------------------------------------------- */
/* Kinship words (feud memory: "You killed my uncle Sal in 1962")     */
/* ---------------------------------------------------------------- */

function parents(s: GameState, id: string): string[] {
  const out: string[] = [];
  const f = fatherOf(s, id);
  const m = motherOf(s, id);
  if (f) out.push(f);
  if (m) out.push(m);
  return out;
}

/** What `to` is to `of` ("uncle", "grandfather", "cousin" ...), or undefined if no close blood/marriage tie. */
export function kinWord(s: GameState, of: string, to: string): string | undefined {
  if (of === to) return undefined;
  const g = (s.characters[to]?.gender ?? s.lineage?.people[to]?.g) === 'F';
  const w = (m: string, f: string) => (g ? f : m);
  if (spousesOf(s, of).includes(to)) return w('husband', 'wife');
  const P = parents(s, of);
  if (P.includes(to)) return w('father', 'mother');
  if (kidsOf(s, of).includes(to)) return w('son', 'daughter');
  const PT = parents(s, to);
  if (P.some((p) => PT.includes(p))) return w('brother', 'sister');
  const GP = P.flatMap((p) => parents(s, p));
  if (GP.includes(to)) return w('grandfather', 'grandmother');
  const toGP = PT.flatMap((p) => parents(s, p));
  if (toGP.includes(of)) return w('grandson', 'granddaughter');
  if (PT.some((p) => GP.includes(p))) return w('uncle', 'aunt');
  if (P.some((p) => toGP.includes(p))) return w('nephew', 'niece');
  if (GP.some((p) => toGP.includes(p))) return 'cousin';
  const GGP = GP.flatMap((p) => parents(s, p));
  if (GGP.includes(to)) return w('great-grandfather', 'great-grandmother');
  if (PT.some((p) => GGP.includes(p))) return w('great-uncle', 'great-aunt');
  const toGGP = toGP.flatMap((p) => parents(s, p));
  if (GGP.some((p) => toGGP.includes(p)) || GGP.some((p) => toGP.includes(p)) || GP.some((p) => toGGP.includes(p))) return 'cousin';
  return undefined;
}

export function ageAt(s: GameState, id: string): number | undefined {
  const c = s.characters[id];
  if (c) return ageOn(c.birth, c.death ? c.death.date : s.date);
  const p = s.lineage?.people[id];
  if (!p) return undefined;
  const ey = p.dy ?? s.date.y;
  const em = p.dy !== undefined ? p.dm ?? 6 : s.date.m;
  return ey - p.by - (em < p.bm ? 1 : 0);
}

/** "was shot in the beer wars", "disappeared (body never found)". */
export function deathPhrase(cause: string): string {
  return /^(disappeared|died|drowned|fell)/.test(cause) ? cause : `was ${cause}`;
}

export function plural(name: string): string {
  return /s$/.test(name) ? `${name}es` : `${name}s`;
}
