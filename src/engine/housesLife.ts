import { monthlyDeathChance } from './characters';
import { killCharacter } from './dynasty';
import { famMut, makeDynCharacter } from './familyState';
import {
  addKidRef, addSpouseRef, birthYear, fatherOf, houseOfBirth, isAlive, kidsOf, kinWord, linMut, motherOf, PLAYER_HOUSE, spousesOf, updHouse, updLink,
  clean, ownsLineage, updPerson, tidyLineage, type LineageState, type LPerson,
} from './houses';
import { rememberGrudges } from './housesDeath';
import { castKin } from './housesKin';
import { housesTitles } from './housesTitles';
import { OUTSIDE_SURNAMES, STOCK_NAMES, type Stock } from './housesData';
import { crewSeed, generateHouses, initLineage, syncHousehold, wantsCrewHouse, type HouseSeed } from './housesHistory';
import type { Ctx } from './ledger';
import { FEMALE_FIRST, MALE_FIRST, SURNAMES } from './names';
import { addOpinion } from './relations';
import { hashSeed, pick, rand } from './rng';
import type { Character, Ethnicity, GameState } from './types';

/**
 * Ongoing life for every house, monthly: off-screen people age, marry
 * (within and across houses), have children and die through the one death
 * function; made men get houses of their own; brides who marry into your
 * house come from somewhere; heads succeed heads; lines die out. Light by
 * design: lineage people are a dozen fields each.
 */

/* ---------------------------------------------------------------- */
/* Setup                                                              */
/* ---------------------------------------------------------------- */

/** Build the houses and their history, then bring the living into the engine where needed. Called by newGame and after a start. */
export function setupHouses(s: GameState): void {
  initLineage(s);
  const L = linMut(s);
  // Marriages already in the game go into the histories.
  const known = marriageKeys(L);
  for (const c of Object.values(s.characters)) {
    if (c.gender !== 'M' || !c.spouseId) continue;
    const w = s.characters[c.spouseId];
    if (!w || known.has(`${c.id}|${w.id}`)) continue;
    const kids = c.childrenIds.map((k) => s.characters[k]?.birth.y).filter((y): y is number => y !== undefined);
    const y = kids.length ? Math.min(...kids) - 1 : Math.min(s.date.y - 1, Math.max(c.birth.y, w.birth.y) + 22);
    recordMarriage(s, L, c.id, w.id, Math.max(y, Math.max(c.birth.y, w.birth.y) + 16));
  }
  // Wives already in the game whose families are not houses stay "from outside".
  for (const c of Object.values(s.characters)) if (c.maidenName && !L.links[c.id]) updLink(L, c.id, {});
  // Grown, unmarried sons and daughters of the marriageable houses are people you can meet.
  promoteMarriageable(s, L, census(s, L), 2);
  // The living extended families become Characters with roles (housesKin.ts).
  castKin(s);
  // Made men who share a crew house's name join it as kin.
  newcomers(s);
  rememberGrudges(s);
  tidyLineage(s.lineage!);
}

/* ---------------------------------------------------------------- */
/* Helpers                                                            */
/* ---------------------------------------------------------------- */

function ageNow(s: GameState, p: LPerson): number {
  return s.date.y - p.by - (s.date.m < p.bm ? 1 : 0);
}

function ageOf(s: GameState, id: string): number {
  const c = s.characters[id];
  if (c) return s.date.y - c.birth.y - (s.date.m < c.birth.m ? 1 : 0);
  const p = s.lineage!.people[id];
  return p ? ageNow(s, p) : 0;
}

function genderOf(s: GameState, id: string): 'M' | 'F' | undefined {
  return s.characters[id]?.gender ?? s.lineage?.people[id]?.g;
}

function noteOf(s: GameState, id: string): string | undefined {
  return s.lineage?.people[id]?.note ?? s.lineage?.links[id]?.note;
}

/** The living spouse, if any. */
function livingSpouse(s: GameState, id: string): string | undefined {
  const sp = spousesOf(s, id);
  for (let i = sp.length - 1; i >= 0; i--) if (isAlive(s, sp[i])) return sp[i];
  return undefined;
}

function stockOfHouse(L: LineageState, h: string | undefined): Stock | undefined {
  return h ? (L.houses[h]?.stock as Stock | undefined) : undefined;
}

function first(L: LineageState, g: 'M' | 'F', eth: Ethnicity, stock?: Stock): string {
  const list = (stock && STOCK_NAMES[stock]?.[g]) || (g === 'M' ? MALE_FIRST[eth] : FEMALE_FIRST[eth]);
  return pick(L, list);
}

function newPerson(L: LineageState, p: Omit<LPerson, 'id'>): LPerson {
  const id = `L${L.next++}`;
  const rec = clean({ id, ...p } as LPerson);
  L.people[id] = rec;
  return rec;
}

function marriageKeys(L: LineageState): Set<string> {
  const out = new Set<string>();
  for (const e of L.events) if (e.k === 'marriage' && e.p && e.q) out.add(`${e.p}|${e.q}`);
  return out;
}

function nm(s: GameState, id: string): string {
  const c = s.characters[id];
  if (c) return `${c.firstName} ${c.lastName}`;
  const p = s.lineage!.people[id];
  return p ? `${p.first} ${p.last}` : '?';
}

function recordMarriage(s: GameState, L: LineageState, husband: string, wife: string, y: number): void {
  const hh = houseOfBirth(s, husband);
  const wh = houseOfBirth(s, wife);
  const home = hh ?? wh;
  if (!home) return;
  const other = hh && wh && hh !== wh ? wh : undefined;
  const wn = s.characters[wife] ? `${s.characters[wife].firstName} ${s.characters[wife].maidenName ?? s.characters[wife].lastName}` : (() => { const p = L.people[wife]; return p ? `${p.first} ${p.maiden ?? p.last}` : '?'; })();
  L.events.push(clean({ y, m: s.date.m, h: home, o: other, k: 'marriage', t: `${nm(s, husband)} married ${wn}${other ? ` of ${L.houses[other].title}` : ''}.`, p: husband, q: wife }));
}

/* ---------------------------------------------------------------- */
/* Promotion: a lineage person becomes a Character                    */
/* ---------------------------------------------------------------- */

/** Bring a lineage person into the engine as a Character, keeping the id and every family tie. */
export function promote(s: GameState, L: LineageState, id: string): Character | undefined {
  const p = L.people[id];
  if (!p || p.dy !== undefined) return undefined;
  const h = p.house ? L.houses[p.house] : undefined;
  const age = Math.max(0, ageNow(s, p));
  const made = makeDynCharacter(s, { firstName: p.first, lastName: p.last, gender: p.g, ethnicity: p.eth, age, rank: 'civilian', faction: 'none', nickname: false, wealth: 0 });
  delete s.characters[made.id];
  const c: Character = { ...made, id, birth: { y: p.by, m: p.bm, d: 1 + (hashSeed(id) % 28) } };
  if (p.maiden) c.maidenName = p.maiden;
  if (p.nick) c.nickname = p.nick;
  s.characters[id] = c;
  const link: { house?: string; f?: string; m?: string; sp?: string[]; kids?: string[]; titles?: string[]; born?: string; note?: string } = {
    house: p.house, titles: p.titles, born: p.born, note: p.note,
  };
  for (const [par, key] of [[p.f, 'f'], [p.m, 'm']] as const) {
    if (!par) continue;
    const pc = s.characters[par];
    if (pc) {
      if (key === 'f') c.fatherId = par;
      else c.motherId = par;
      if (!pc.childrenIds.includes(id)) pc.childrenIds.push(id);
      const pl = L.links[par];
      if (pl?.kids?.includes(id)) updLink(L, par, { kids: pl.kids.filter((k) => k !== id) });
    } else link[key] = par;
  }
  const sp: string[] = [];
  for (const o of p.sp ?? []) {
    const oc = s.characters[o];
    if (oc && oc.alive && !c.spouseId && (!oc.spouseId || oc.spouseId === id)) {
      c.spouseId = o;
      oc.spouseId = id;
      const ol = L.links[o];
      if (ol?.sp?.includes(id)) updLink(L, o, { sp: ol.sp.filter((x) => x !== id) });
    } else sp.push(o);
  }
  if (sp.length) link.sp = sp;
  const kids: string[] = [];
  for (const k of p.kids ?? []) {
    const kc = s.characters[k];
    if (kc) {
      if (p.g === 'M') kc.fatherId = id;
      else kc.motherId = id;
      c.childrenIds.push(k);
      const kl = L.links[k];
      if (kl && (kl.f === id || kl.m === id)) updLink(L, k, { f: kl.f === id ? undefined : kl.f, m: kl.m === id ? undefined : kl.m });
    } else kids.push(k);
  }
  if (kids.length) link.kids = kids;
  delete L.people[id];
  L.links[id] = clean(link);
  if (h?.dynId) famMut(s, id).houseId = h.dynId;
  const father = c.fatherId ? s.characters[c.fatherId] : undefined;
  if (father?.alive) addOpinion(s, id, father.id, 'My father', 25, 0);
  return c;
}

/** Keep at least `target` grown, unmarried Characters in each marriageable house, drawn from its tree. */
function promoteMarriageable(s: GameState, L: LineageState, cen: Census, target: number): void {
  for (const id of L.order) {
    const h = L.houses[id];
    if (!h.dynId || h.extinct) continue;
    const mem = cen.members.get(id) ?? [];
    let have = 0;
    const light: LPerson[] = [];
    for (const m of mem) {
      const c = s.characters[m];
      if (c) {
        const a = ageOf(s, m);
        if (c.alive && !c.spouseId && a >= 18 && a <= 35) have++;
      } else {
        const p = L.people[m];
        if (!p || p.dy !== undefined || p.note) continue;
        const a = ageNow(s, p);
        if (a >= 16 && a <= 30 && !livingSpouse(s, m)) light.push(p);
      }
    }
    light.sort((x, y) => x.by - y.by || (x.id < y.id ? -1 : 1));
    for (let i = 0; i < target - have && i < light.length; i++) promote(s, L, light[i].id);
  }
}

/** Who is alive and in which house, once per month. */
interface Census {
  alive: string[];
  charHouse: Map<string, string>;
  members: Map<string, string[]>;
}

function census(s: GameState, L: LineageState): Census {
  // (reads only)
  const alive: string[] = [];
  const charHouse = new Map<string, string>();
  const members = new Map<string, string[]>();
  const add = (h: string, id: string) => (members.get(h) ?? members.set(h, []).get(h)!).push(id);
  for (const id in L.people) {
    const p = L.people[id];
    if (p.dy !== undefined) continue;
    alive.push(id);
    if (p.house) add(p.house, id);
  }
  for (const c of Object.values(s.characters)) {
    if (!c.alive) continue;
    const h = houseOfBirth(s, c.id);
    if (!h) continue;
    charHouse.set(c.id, h);
    add(h, c.id);
  }
  return { alive, charHouse, members };
}

/* ---------------------------------------------------------------- */
/* Marriage                                                           */
/* ---------------------------------------------------------------- */

/** Marry two people (any kind). A Character marrying a lineage person brings the other into the engine. */
export function marryPeople(s: GameState, L: LineageState, man: string, woman: string): void {
  if (s.characters[man] && !s.characters[woman]) promote(s, L, woman);
  if (s.characters[woman] && !s.characters[man]) promote(s, L, man);
  const mc = s.characters[man];
  const wc = s.characters[woman];
  if (mc && wc) {
    for (const [c, other] of [[mc, wc], [wc, mc]] as const) {
      if (c.spouseId && c.spouseId !== other.id) {
        // The late spouse stays in the tree.
        const old = c.spouseId;
        updLink(L, c.id, { sp: [...(L.links[c.id]?.sp ?? []).filter((x) => x !== old), old] });
      }
      c.spouseId = other.id;
    }
    if (!wc.maidenName) wc.maidenName = wc.lastName;
    wc.lastName = mc.lastName;
    addOpinion(s, mc.id, wc.id, 'My wife', 20, 0);
    addOpinion(s, wc.id, mc.id, 'My husband', 20, 0);
  } else {
    addSpouseRef(s, L, man, woman);
    addSpouseRef(s, L, woman, man);
    const w = L.people[woman];
    updPerson(L, woman, { maiden: w.maiden ?? w.last, last: L.people[man]?.last ?? w.last });
  }
  recordMarriage(s, L, man, woman, s.date.y);
}

function outsider(L: LineageState, year: number, g: 'M' | 'F', eth: Ethnicity, age: number, stock?: Stock): LPerson {
  const last = pick(L, (stock && OUTSIDE_SURNAMES[stock]) || SURNAMES[eth]);
  return newPerson(L, { first: first(L, g, eth, stock), last, g, eth, by: year - age, bm: 1 + Math.floor(rand(L) * 12) });
}

/* ---------------------------------------------------------------- */
/* The monthly tick                                                   */
/* ---------------------------------------------------------------- */

const ADULT_CAUSES = ['heart attack', 'cancer', 'a stroke', 'sugar diabetes', 'heart attack'];
const OLD_CAUSES = ['old age', 'heart failure', 'a stroke', 'pneumonia', 'old age'];
const YOUNG_CAUSES = ['an automobile accident on the Garden State Parkway', 'drowned off Cape May', 'leukemia', 'a burst appendix', 'pneumonia'];

function lightDeaths(ctx: Ctx, L: LineageState, cen: Census): void {
  const s = ctx.s;
  for (const id of cen.alive) {
    const p = L.people[id];
    if (!p || p.dy !== undefined) continue;
    const a = ageNow(s, p);
    const hp = Math.max(5, Math.min(95, 100 - Math.max(0, a - 35) * 0.95));
    let pd = 1 - Math.pow(1 - monthlyDeathChance(a, hp), SPAN);
    if (a === 0) pd += 0.0012 * SPAN;
    if (a > 104) pd = 1;
    if (rand(L) >= pd) continue;
    const cause = a < 1 ? 'pneumonia in the first winter' : pick(L, a < 45 ? YOUNG_CAUSES : a < 70 ? ADULT_CAUSES : OLD_CAUSES);
    killCharacter(ctx, id, cause);
  }
}

function births(s: GameState, L: LineageState, cen: Census): void {
  const mothers: string[] = [];
  for (const id of cen.alive) {
    const p = L.people[id];
    if (p.g === 'F' && p.sp && s.date.y - p.by >= 18 && s.date.y - p.by <= 42) mothers.push(id);
  }
  for (const c of Object.values(s.characters)) if (c.gender === 'F' && c.alive && !c.dynasty && c.spouseId && s.date.y - c.birth.y <= 42) mothers.push(c.id);
  for (const m of mothers) {
    const a = ageOf(s, m);
    if (a < 18 || a > 42) continue;
    const f = livingSpouse(s, m);
    if (!f || genderOf(s, f) !== 'M') continue;
    const fc = s.characters[f];
    // Your house and the crew men's households have their children through the engine.
    if (fc?.dynasty || fc?.household) continue;
    const fh = fc ? cen.charHouse.get(f) ?? houseOfBirth(s, f) : L.people[f]?.house;
    if (!fh || L.houses[fh]?.player) continue;
    const n = kidsOf(s, m).length;
    const pr = SPAN * 0.011 * (n >= 4 ? 0.3 : n >= 2 ? 0.7 : 1) * (a > 36 ? 0.5 : 1);
    if (rand(L) >= pr) continue;
    const sex = rand(L) < 0.51 ? 'M' : 'F';
    const eth = fc?.ethnicity ?? L.people[f]?.eth ?? 'Italian';
    const last = fc?.lastName ?? L.people[f]?.last ?? L.houses[fh].name;
    const kid = newPerson(L, { first: first(L, sex, eth, stockOfHouse(L, fh)), last, g: sex, eth, by: s.date.y, bm: s.date.m, house: fh, f, m });
    addKidRef(s, L, f, kid.id);
    addKidRef(s, L, m, kid.id);
  }
}

function closeKin(s: GameState, a: string, b: string): boolean {
  const k = kinWord(s, a, b);
  return !!k && k !== 'cousin';
}

function marriages(s: GameState, L: LineageState, cen: Census): void {
  const houseOf = (id: string) => (s.characters[id] ? cen.charHouse.get(id) : L.people[id]?.house);
  const isFree = (id: string, g: 'M' | 'F', lo: number, hi: number) => {
    const c = s.characters[id];
    if (c && (c.dynasty || !c.alive || c.id === s.playerId)) return false;
    if (genderOf(s, id) !== g || noteOf(s, id)) return false;
    const a = ageOf(s, id);
    return a >= lo && a <= hi && !livingSpouse(s, id);
  };
  let pool: string[] | undefined;
  const women = () => {
    if (pool) return pool;
    pool = [];
    for (const id of cen.alive) {
      const p = L.people[id];
      if (p.g === 'F' && s.date.y - p.by >= 18 && s.date.y - p.by <= 36 && isFree(id, 'F', 18, 35)) pool.push(id);
    }
    for (const id of cen.charHouse.keys()) if (s.characters[id].gender === 'F' && isFree(id, 'F', 18, 35)) pool.push(id);
    return pool;
  };
  const taken = new Set<string>();
  const men: string[] = [];
  for (const id of cen.alive) {
    const p = L.people[id];
    if (p.g === 'M' && p.house && s.date.y - p.by >= 20 && s.date.y - p.by <= 46) men.push(id);
  }
  for (const [id, h] of cen.charHouse) if (s.characters[id].gender === 'M' && !L.houses[h]?.player) men.push(id);
  for (const man of men) {
    if (rand(L) >= SPAN * 0.012 || !isFree(man, 'M', 20, 45)) continue;
    const mh = houseOf(man);
    const eth = s.characters[man]?.ethnicity ?? L.people[man]?.eth ?? 'Italian';
    const ma = ageOf(s, man);
    if (!s.characters[man] && rand(L) < 0.25) {
      const bride = outsider(L, s.date.y, 'F', eth, Math.max(18, ma - Math.floor(rand(L) * 6)), stockOfHouse(L, mh));
      marryPeople(s, L, man, bride.id);
      continue;
    }
    const pl = women();
    let best: string | undefined;
    for (let i = 0; i < 12 && pl.length; i++) {
      const w = pl[Math.floor(rand(L) * pl.length)];
      if (taken.has(w)) continue;
      const wa = ageOf(s, w);
      if (wa > ma + 3 || wa < ma - 15) continue;
      // Characters marry Characters and the off-screen marry the off-screen (no one is pulled into the engine just to wed).
      if (!!s.characters[w] !== !!s.characters[man]) continue;
      if (houseOf(w) === mh || closeKin(s, man, w)) continue;
      const we = s.characters[w]?.ethnicity ?? L.people[w]?.eth;
      if (we !== eth && rand(L) > 0.15) continue;
      best = w;
      break;
    }
    if (!best) continue;
    taken.add(best);
    marryPeople(s, L, man, best);
  }
  // Daughters who marry outside the houses.
  for (const id of cen.alive) {
    const p = L.people[id];
    if (!p || p.g !== 'F' || p.dy !== undefined || taken.has(id)) continue;
    const a = s.date.y - p.by;
    if (a < 19 || a > 34 || rand(L) >= SPAN * 0.003 || !isFree(id, 'F', 18, 35)) continue;
    const husband = outsider(L, s.date.y, 'M', p.eth, ageNow(s, p) + Math.floor(rand(L) * 6), stockOfHouse(L, p.house));
    marryPeople(s, L, husband.id, id);
  }
}

/** Made men get houses; rival heirs find their kin; brides of your house come from somewhere. */
function newcomers(s: GameState): void {
  const seeds: HouseSeed[] = [];
  const L0 = s.lineage!;
  let known: Set<string> | undefined;
  for (const c of Object.values(s.characters)) {
    if (!c.alive) continue;
    const link = L0.links[c.id];
    const unhoused = !c.dynasty && !c.fatherId && !link?.f && !link?.house;
    // A newcomer with a house's name in the same outfit (a rival's new boss, a made man's cousin): one of theirs.
    const kinHouse = unhoused && (c.rank !== 'civilian' || c.faction !== 'none')
      ? L0.order.find((id) => {
        const h = L0.houses[id];
        return h.name === c.lastName && h.faction === c.faction && !h.player && h.extinct === undefined;
      })
      : undefined;
    if (kinHouse) {
      attachKin(s, linMut(s), c, kinHouse);
      continue;
    }
    if (wantsCrewHouse(c) && !link?.house && !houseOfBirth(s, c.id)) {
      const sd = crewSeed(c);
      if (!L0.houses[sd.id] && !seeds.some((x) => x.name === sd.name && x.faction === sd.faction)) seeds.push(sd);
      continue;
    }
    if (c.dynasty && c.gender === 'F' && c.maidenName && c.maidenName !== s.houseName && !link && !c.fatherId && c.spouseId) {
      attachBride(s, linMut(s), c);
    }
    if (c.household && !c.dynasty && householdChanged(s, c)) syncHousehold(s, linMut(s), c);
    if (c.gender === 'M' && c.spouseId && s.characters[c.spouseId]) {
      known ??= marriageKeys(s.lineage!);
      if (known.has(`${c.id}|${c.spouseId}`)) continue;
      recordMarriage(s, linMut(s), c.id, c.spouseId, s.date.y);
      known.add(`${c.id}|${c.spouseId}`);
    }
  }
  if (seeds.length) generateHouses(s, linMut(s), seeds);
}

/** Cheap check before a sync: a new wife or child the tree has not seen. */
function householdChanged(s: GameState, c: Character): boolean {
  const hh = c.household!;
  const L = s.lineage!;
  if (!L.links[c.id]?.house) return false;
  // Children and wives the tree knows, whether they stayed off-screen or became Characters.
  return hh.kids.length > kidsOf(s, c.id).length || (!!hh.wife && spousesOf(s, c.id).length === 0);
}

function fathersIn(s: GameState, L: LineageState, hid: string, childBy: number): string[] {
  const out: string[] = [];
  const fits = (id: string) => {
    const by = birthYear(s, id)!;
    if (childBy - by < 20 || childBy - by > 45) return false;
    const c = s.characters[id];
    const dy = c ? (c.alive ? undefined : c.death?.date.y) : L.people[id]?.dy;
    return dy === undefined || dy >= childBy - 1;
  };
  for (const p of Object.values(L.people)) if (p.house === hid && p.g === 'M' && fits(p.id)) out.push(p.id);
  for (const c of Object.values(s.characters)) if (c.gender === 'M' && houseOfBirth(s, c.id) === hid && fits(c.id)) out.push(c.id);
  return out;
}

function motherFor(s: GameState, L: LineageState, father: string, childBy: number): string | undefined {
  return spousesOf(s, father).find((w) => {
    const by = birthYear(s, w);
    if (by === undefined || childBy - by < 18 || childBy - by > 42) return false;
    const c = s.characters[w];
    const dy = c ? (c.alive ? undefined : c.death?.date.y) : L.people[w]?.dy;
    return dy === undefined || dy >= childBy;
  });
}

/** A newcomer with a house's name (a rival's new boss): one of theirs. */
function attachKin(s: GameState, L: LineageState, c: Character, hid: string): void {
  const fs = fathersIn(s, L, hid, c.birth.y);
  if (!fs.length) {
    updLink(L, c.id, { house: hid });
    return;
  }
  const f = pick(L, fs);
  const m = motherFor(s, L, f, c.birth.y);
  updLink(L, c.id, { house: hid, f, m });
  addKidRef(s, L, f, c.id);
  if (m) addKidRef(s, L, m, c.id);
}

/** A bride who married into your house: whose daughter was she? */
function attachBride(s: GameState, L: LineageState, c: Character): void {
  if (rand(L) < 0.7) {
    const hs = L.order.filter((id) => {
      const h = L.houses[id];
      return !h.player && !h.extinct && h.eth === c.ethnicity;
    });
    for (let i = 0; i < 6 && hs.length; i++) {
      const hid = pick(L, hs);
      const fs = fathersIn(s, L, hid, c.birth.y).filter((f) => motherFor(s, L, f, c.birth.y));
      if (!fs.length) continue;
      const f = pick(L, fs);
      const m = motherFor(s, L, f, c.birth.y)!;
      c.maidenName = L.houses[hid].name;
      updLink(L, c.id, { house: hid, f, m });
      addKidRef(s, L, f, c.id);
      addKidRef(s, L, m, c.id);
      return;
    }
  }
  updLink(L, c.id, {});
}

function heirOf(s: GameState, dead: string, members: Set<string>): string | undefined {
  // Nearest living blood by kinship (children, grandchildren, brothers, nephews ...), men and grown first.
  const seen = new Set([dead]);
  let frontier = [dead];
  for (let depth = 1; depth <= 7 && frontier.length; depth++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const x of [...kidsOf(s, id), fatherOf(s, id), motherOf(s, id)]) {
        if (!x || seen.has(x)) continue;
        seen.add(x);
        next.push(x);
      }
    }
    const found = next.filter((x) => members.has(x));
    if (found.length) {
      found.sort((a, b) => score(s, a) - score(s, b) || (birthYear(s, a) ?? 0) - (birthYear(s, b) ?? 0));
      return found[0];
    }
    frontier = next;
  }
  const all = [...members];
  all.sort((a, b) => score(s, a) - score(s, b) || (birthYear(s, a) ?? 0) - (birthYear(s, b) ?? 0));
  return all[0];
}

function score(s: GameState, id: string): number {
  return (genderOf(s, id) === 'M' ? 0 : 2) + (ageOf(s, id) >= 18 ? 0 : 4);
}

function successions(s: GameState, getCensus: () => Census): void {
  const L0 = s.lineage!;
  const due = L0.order.filter((id) => {
    const h = L0.houses[id];
    if (h.extinct) return false;
    if (h.player) return h.headId !== s.playerId || h.name !== s.houseName;
    return !h.headId || !isAlive(s, h.headId);
  });
  if (!due.length) return;
  const L = linMut(s);
  const cen = getCensus();
  const members = new Map<string, Set<string>>();
  for (const [h, ids] of cen.members) members.set(h, new Set(ids.filter((x) => isAlive(s, x))));
  for (const id of due) {
    const h = L.houses[id];
    if (h.player) {
      if (h.name !== s.houseName) updHouse(L, id, { name: s.houseName, title: `House ${s.houseName}` });
      if (h.headId !== s.playerId) {
        updHouse(L, id, { headId: s.playerId, heads: [...h.heads, { id: s.playerId, from: s.date.y }], name: s.houseName });
        L.events.push(clean({ y: s.date.y, m: s.date.m, h: id, k: 'succession', t: `${nm(s, s.playerId)} became head of ${h.title}.`, p: s.playerId }));
      }
      continue;
    }
    if (h.headId && isAlive(s, h.headId)) continue;
    const mem = members.get(id);
    if (!mem?.size) {
      updHouse(L, id, { extinct: s.date.y, headId: undefined });
      L.events.push(clean({ y: s.date.y, m: s.date.m, h: id, k: 'extinct', t: `The line of ${h.title} ended.` }));
      s.chronicle.push({ week: s.week, date: { ...s.date }, text: `The line of ${h.title} has ended. No one of the blood is left.`, kind: 'family' });
      continue;
    }
    const heir = heirOf(s, h.headId ?? h.founderId ?? '', mem);
    if (!heir) continue;
    updHouse(L, id, { headId: heir, heads: [...h.heads, { id: heir, from: s.date.y }] });
    const rel = h.headId ? kinWord(s, heir, h.headId) : undefined;
    L.events.push(clean({ y: s.date.y, m: s.date.m, h: id, k: 'succession', t: `${nm(s, heir)} became head of ${h.title}${rel && h.headId ? ` after the death of ${genderOf(s, heir) === 'F' ? 'her' : 'his'} ${rel} ${nm(s, h.headId)}` : ''}.`, p: heir }));
  }
}

/** Engine hook: the monthly tick for every house. */
export function housesMonth(ctx: Ctx): void {
  const s = ctx.s;
  if (!s.lineage) {
    setupHouses(s);
    return;
  }
  newcomers(s);
  let cen: Census | undefined;
  // The off-screen families live by the season (every third month, three months' worth): cheap, and nobody is watching.
  if (s.date.m % 3 === 1) {
    const L = linMut(s);
    L.month = `${s.date.y}-${s.date.m}`;
    cen = census(s, L);
    lightDeaths(ctx, L, cen);
    births(s, L, cen);
    marriages(s, L, cen);
    cen = census(s, L);
    promoteMarriageable(s, L, cen, 2);
  }
  successions(s, () => (cen ??= census(s, s.lineage!)));
  housesTitles(s);
  // Feud memory: redone when there is a new grudge, a new boss, new people, or a new year.
  if (s.lineage.grudges.some((g) => g.vs === PLAYER_HOUSE)) {
    const key = `${s.lineage.grudges.length}|${s.playerId}|${Object.keys(s.characters).length}|${s.date.y}`;
    if (s.lineage.gkey !== key) {
      rememberGrudges(s, cen?.charHouse);
      // A new top-level record only (the collections stay shared until someone writes to them).
      s.lineage = ownsLineage(s) ? Object.assign(s.lineage, { gkey: key }) : { ...s.lineage, gkey: key };
    }
  }
}

/** Months of life the off-screen tick covers. */
const SPAN = 3;

export { PLAYER_HOUSE };
