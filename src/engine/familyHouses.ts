import { ageOn } from './calendar';
import { displayName } from './characters';
import { ensureDynState, famMut, houseById, makeDynCharacter, type Alliance, type House, type HouseKind } from './familyState';
import { addOpinion } from './relations';
import { pick, randInt, rand } from './rng';
import type { Character, Ethnicity, FactionId, GameState } from './types';

/**
 * The other houses of the shore: rival crews, the Philadelphia families,
 * political families and legitimate Wildwood families. Each is a real
 * family of characters (a head, a spouse, grown and growing children) you
 * can marry into. A marriage between houses makes an alliance: they won't
 * move against you, they send men when you are at war, and their votes at
 * the Table lean your way.
 */

interface HouseDef {
  id: string;
  name: string;
  kind: HouseKind;
  faction?: FactionId;
  /** Rival id whose leader heads the house. */
  rival?: FactionId;
  /** Office of an existing official who heads the house. */
  office?: string;
  /** A new head: first name, surname, ethnicity, age range. */
  head?: { first: string; last: string; eth: Ethnicity; age: [number, number] };
  blurb: string;
  dowry: number;
  strength: number;
}

const HOUSE_DEFS: HouseDef[] = [
  { id: 'h_manno', name: 'House Manno', kind: 'mob', faction: 'manno', rival: 'manno', blurb: 'Carmine Manno\'s Atlantic City people. A marriage might end the old grudge — or seat a spy at your table.', dowry: 6000, strength: 60 },
  { id: 'h_feldstein', name: 'House Feldstein', kind: 'mob', faction: 'feldstein', rival: 'feldstein', blurb: 'New York money. A match would open doors in Manhattan and raise eyebrows at St. Ann\'s.', dowry: 12000, strength: 55 },
  { id: 'h_kessler', name: 'House Kessler', kind: 'mob', faction: 'kessler', rival: 'kessler', blurb: 'The Irish club owners of North Wildwood. Proud, independent, and short of friends.', dowry: 4000, strength: 40 },
  { id: 'h_moretti', name: 'House Moretti', kind: 'philly', faction: 'philly', rival: 'philly', blurb: 'Sal Moretti\'s family. Marrying into Philadelphia\'s bagman is marrying into the Table.', dowry: 10000, strength: 85 },
  { id: 'h_carbone', name: 'House Carbone', kind: 'philly', faction: 'philly', office: 'Camden capo', blurb: 'Leo Carbone runs Camden for Philadelphia and votes at the Table.', dowry: 7000, strength: 70 },
  { id: 'h_nardella', name: 'House Nardella', kind: 'philly', faction: 'philly', office: 'Trenton capo', blurb: 'Tommy Nardella has the Trenton rackets and the State House doormen.', dowry: 7000, strength: 70 },
  { id: 'h_dougherty', name: 'The Doughertys', kind: 'political', office: 'City councilman', blurb: 'Councilman Dougherty\'s Irish ward family. Every cousin has a city job.', dowry: 3000, strength: 45 },
  { id: 'h_pruitt', name: 'The Pruitts', kind: 'political', office: 'State assemblyman', blurb: 'Assemblyman Pruitt sits in Trenton. A son-in-law in the family is worth a bill or two.', dowry: 5000, strength: 55 },
  { id: 'h_albanese', name: 'The Albaneses', kind: 'legit', head: { first: 'Rocco', last: 'Albanese', eth: 'Italian', age: [48, 60] }, blurb: 'Bakery on Pacific, three concession stands on the piers. Mass every morning.', dowry: 5000, strength: 35 },
  { id: 'h_keane', name: 'The Keanes', kind: 'legit', head: { first: 'Martin', last: 'Keane', eth: 'Irish', age: [50, 62] }, blurb: 'Six motels in the Crest with neon names. Clean books, clean money.', dowry: 8000, strength: 40 },
  { id: 'h_weiss', name: 'The Weisses', kind: 'legit', head: { first: 'Herman', last: 'Weiss', eth: 'Jewish', age: [52, 64] }, blurb: 'Weiss\'s Department Store on Pacific Avenue since 1922. The bank knows them by name.', dowry: 9000, strength: 45 },
  { id: 'h_donnelly', name: 'The Donnellys', kind: 'legit', head: { first: 'Francis', last: 'Donnelly', eth: 'Irish', age: [45, 58] }, blurb: 'Donnelly Construction poured half the boardwalk. They need permits; you can get them.', dowry: 6000, strength: 40 },
];

export const HOUSE_KIND_LABEL: Record<HouseKind, string> = {
  mob: 'Rival crew', philly: 'Philadelphia family', political: 'Political family', legit: 'Legitimate Wildwood family',
};

function linkChild(father: Character, mother: Character | undefined, child: Character): void {
  child.fatherId = father.id;
  if (!father.childrenIds.includes(child.id)) father.childrenIds.push(child.id);
  if (mother) {
    child.motherId = mother.id;
    if (!mother.childrenIds.includes(child.id)) mother.childrenIds.push(child.id);
  }
}

/** A grown or growing child of a house. */
export function houseChild(s: GameState, h: House, age: number, gender?: 'M' | 'F'): Character | undefined {
  const head = s.characters[h.headId];
  if (!head) return undefined;
  const d = ensureDynState(s);
  const g = gender ?? (rand(d) < 0.5 ? 'M' : 'F');
  const kid = makeDynCharacter(s, { gender: g, ethnicity: head.ethnicity, lastName: head.lastName, age, rank: 'civilian', faction: 'none', nickname: false });
  const mother = head.spouseId ? s.characters[head.spouseId] : undefined;
  linkChild(head, mother?.alive ? mother : undefined, kid);
  famMut(s, kid.id).houseId = h.id;
  addOpinion(s, kid.id, head.id, 'My father', 25, 0);
  return kid;
}

function buildHouse(s: GameState, def: HouseDef): House | undefined {
  const d = ensureDynState(s);
  let head: Character | undefined;
  if (def.rival) {
    const r = s.rivals.find((x) => x.id === def.rival);
    head = r ? s.characters[r.leaderId] : undefined;
  } else if (def.office) {
    head = Object.values(s.characters).find((c) => c.alive && c.office === def.office);
  } else if (def.head) {
    head = makeDynCharacter(s, { firstName: def.head.first, lastName: def.head.last, ethnicity: def.head.eth, age: randInt(d, def.head.age[0], def.head.age[1]), rank: 'civilian', faction: 'none', nickname: false });
    head.ambition = 'Keep the family business in the family';
  }
  if (!head) return undefined;
  const h: House = { id: def.id, name: def.name, kind: def.kind, faction: def.faction, headId: head.id, blurb: def.blurb, dowry: def.dowry, strength: def.strength, leads: !!def.rival };
  famMut(s, head.id).houseId = h.id;
  // A wife (if he has none yet) — only for the houses whose heads you'll see most: the crews and Philadelphia.
  if (!head.spouseId && (def.kind === 'mob' || def.kind === 'philly') && def.rival) {
    const age = Math.max(30, ageOn(head.birth, s.date) - randInt(d, 1, 7));
    const wife = makeDynCharacter(s, { gender: 'F', ethnicity: head.ethnicity, age, rank: 'civilian', faction: 'none', nickname: false });
    wife.maidenName = wife.lastName;
    wife.lastName = head.lastName;
    wife.spouseId = head.id;
    head.spouseId = wife.id;
    famMut(s, wife.id).houseId = h.id;
  }
  // Children: one or two of marrying age, sometimes a younger one.
  const headAge = ageOn(head.birth, s.date);
  const n = 2;
  for (let i = 0; i < n; i++) {
    const maxAge = Math.max(10, Math.min(30, headAge - 22));
    const age = i < 2 ? randInt(d, Math.min(18, maxAge), maxAge) : randInt(d, 8, Math.max(9, maxAge - 6));
    houseChild(s, h, age, i === 0 ? 'F' : i === 1 ? 'M' : undefined);
  }
  return h;
}

/** Creates the houses of the shore (once per game). */
export function initHouses(s: GameState): void {
  const d = ensureDynState(s);
  if (d.houses.length) return;
  for (const def of HOUSE_DEFS) {
    const h = buildHouse(s, def);
    if (h) d.houses.push(h);
  }
}

/** Living members of a house (blood and married in), head first. */
export function houseMembers(s: GameState, h: House): Character[] {
  const out = Object.values(s.characters).filter((c) => c.alive && !c.dynasty && s.dyn?.people[c.id]?.houseId === h.id);
  return out.sort((a, b) => (a.id === h.headId ? -1 : b.id === h.headId ? 1 : a.birth.y - b.birth.y));
}

/** Unmarried members of a house of marrying age (18-35). */
export function marriageable(s: GameState, h: House): Character[] {
  return houseMembers(s, h).filter((c) => !c.spouseId && ageOn(c.birth, s.date) >= 18 && ageOn(c.birth, s.date) <= 35 && s.dyn?.people[c.id]?.path !== 'priest');
}

/** Monthly: houses grow new marriageable children; a dead head is replaced. */
export function refreshHouses(s: GameState): void {
  const d = ensureDynState(s);
  for (const h of d.houses) {
    let head = s.characters[h.headId];
    if (!head?.alive) {
      // The rival's new leader (or the eldest son) heads the house.
      const r = h.leads ? s.rivals.find((x) => x.id === h.faction) : undefined;
      const next = r && s.characters[r.leaderId]?.alive ? s.characters[r.leaderId] : houseMembers(s, h).find((c) => c.gender === 'M' && ageOn(c.birth, s.date) >= 21);
      if (!next) continue;
      h.headId = next.id;
      famMut(s, next.id).houseId = h.id;
      head = next;
    }
    if (marriageable(s, h).length >= 2 || houseMembers(s, h).length >= 5) continue;
    if (rand(d) < 0.06) houseChild(s, h, 18);
  }
}

/* ---------------------------------------------------------------- */
/* Alliances                                                          */
/* ---------------------------------------------------------------- */

function allianceActive(s: GameState, a: Alliance): boolean {
  if (a.until !== undefined) return a.until >= s.week;
  const ours = a.ourId ? s.characters[a.ourId] : undefined;
  const theirs = a.theirId ? s.characters[a.theirId] : undefined;
  return !!ours?.alive && !!theirs?.alive && ours.spouseId === theirs.id;
}

export function activeAlliances(s: GameState): Alliance[] {
  return (s.dyn?.alliances ?? []).filter((a) => allianceActive(s, a));
}

export function alliedHouse(s: GameState, houseId: string): boolean {
  return activeAlliances(s).some((a) => a.houseId === houseId);
}

/** Is the player allied (by marriage or pact) with this faction's leading house? */
export function alliedWithFaction(s: GameState, faction: FactionId): boolean {
  if (!s.dyn || faction === 'player' || faction === 'none') return false;
  return activeAlliances(s).some((a) => {
    const h = houseById(s, a.houseId);
    if (!h || h.faction !== faction) return false;
    // A Philadelphia match counts for Philadelphia only through Moretti's house; Carbone/Nardella sway their own votes.
    return h.leads;
  });
}

/** Extra lean of a Table member toward you (alliances, legacies). Used by the Table forecast. */
export function dynastyTableLean(s: GameState, member: Character): { label: string; value: number }[] {
  if (!s.dyn) return [];
  const out: { label: string; value: number }[] = [];
  const h = s.dyn.houses.find((x) => x.headId === member.id) ?? (s.dyn.people[member.id]?.houseId ? houseById(s, s.dyn.people[member.id].houseId!) : undefined);
  if (h && alliedHouse(s, h.id)) out.push({ label: 'Allied to your house by marriage', value: 35 });
  if (s.dyn.legacy.church >= 4) out.push({ label: 'The Machine (legacy)', value: 10 });
  if (s.dyn.titles.includes('Boss of the Shore')) out.push({ label: 'Boss of the Shore', value: 8 });
  return out;
}

export function addAlliance(s: GameState, a: Alliance): void {
  const d = ensureDynState(s);
  d.alliances = d.alliances.filter((x) => allianceActive(s, x));
  d.alliances.push(a);
  d.stats.alliances++;
}

export function breakAlliance(s: GameState, houseId: string): void {
  const d = ensureDynState(s);
  for (const a of d.alliances) if (a.houseId === houseId) a.until = s.week - 1;
}

export function houseLabel(s: GameState, c: Character): string | undefined {
  const hid = s.dyn?.people[c.id]?.houseId;
  const h = hid ? houseById(s, hid) : undefined;
  return h?.name;
}

export function pickHouseBride(s: GameState): Character | undefined {
  const d = ensureDynState(s);
  const pool = d.houses.flatMap((h) => marriageable(s, h));
  return pool.length ? pick(d, pool) : undefined;
}

export { displayName };
