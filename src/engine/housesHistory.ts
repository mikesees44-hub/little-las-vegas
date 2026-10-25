import { FEMALE_FIRST, MALE_FIRST, SURNAMES } from './names';
import { chance, hashSeed, pick, rand, randInt } from './rng';
import {
  addKidRef, adoptLineage, birthYear, clean, tidyLineage, deathPhrase, kidsOf, PLAYER_HOUSE, plural, updLink, updPerson,
  type Grudge, type HouseType, type LEvent, type LHouse, type LineageState, type LPerson,
} from './houses';
import {
  ACCIDENTS, ARRIVAL, CREST_COLORS, crimeCauses, EXTRA_HOUSES, FACTION_SEAT, FIRE_DUTY, HEAD_TITLES, infantCause, KNOWN_HOUSES, KOREA, LINE_OF_DUTY,
  MEMBER_TITLES, naturalCause, OFFICIAL_HOUSES, ORIGINS, OUTSIDE_SURNAMES, SEA_DEATHS, STOCK_ETH, STOCK_NAMES, stockFor, WW1, WW2,
  type ExtraHouseDef, type Stock,
} from './housesData';
import type { PackDynasty } from './housesPackData';
import { packSeeds } from './housesPack';
import type { Character, Ethnicity, FactionId, GameState } from './types';

/**
 * Generated history for every house, back to the founders who came over in
 * the 1870s-1900s (or the old-stock families already here). Deterministic per
 * game seed: it runs on its own dice stream (`lineage.rng`).
 *
 * History is attached ABOVE and AROUND the characters the engine already
 * made: the oldest Character of a house's line gets generated parents and
 * grandparents up to the founder, the founder's other children and their
 * families fill the tree around the line, and the wives of each generation
 * are matched with daughters of other houses so the trees interlock.
 */

export interface HouseSeed {
  id: string;
  name: string;
  type: HouseType;
  seat: string;
  stock: Stock;
  /** Existing Character heading (or anchoring) the house. */
  anchor?: string;
  /** Head created for houses with no Characters. */
  head?: ExtraHouseDef['head'];
  blurb?: string;
  dynId?: string;
  faction?: FactionId;
  player?: boolean;
  crewOf?: string;
  /** The line is extinct by 1960 (old houses). */
  extinct?: { y: number; cause: string; killer?: string };
  /** A world-pack dynasty: its people are the anchors (housesPack.ts). */
  pack?: PackDynasty;
}

interface Slot {
  wife: string;
  husband: string;
}

interface G {
  s: GameState;
  L: LineageState;
  now: number;
  nowM: number;
  brides: string[];
  slots: Slot[];
  seeds: Record<string, HouseSeed>;
  /** Houses being generated as extinct lines: no branches for siblings. */
  extinct: Set<string>;
  /** Branches grown per house. */
  size: Record<string, number>;
  /** Everyone created in this run. */
  created: string[];
  /** Pack people who married in with a maiden name (matched to a house's daughters later). */
  packBrides: string[];
  /** Pack heads chosen during generation (house -> person). */
  packHeads: Record<string, string>;
}

const SHORE = /Wildwood|Cape May|Atlantic|Crest|Five Mile/;

/* ---------------------------------------------------------------- */
/* People                                                             */
/* ---------------------------------------------------------------- */

function mk(g: G, p: Omit<LPerson, 'id'>): LPerson {
  const id = `L${g.L.next++}`;
  const rec = { id, ...p } as LPerson;
  g.L.people[id] = rec;
  g.created.push(id);
  return rec;
}

function firstName(g: G, sex: 'M' | 'F', stock: Stock, eth: Ethnicity): string {
  const list = STOCK_NAMES[stock]?.[sex] ?? (sex === 'M' ? MALE_FIRST[eth] : FEMALE_FIRST[eth]);
  return pick(g.L, list);
}

function outsideSurname(g: G, stock: Stock, eth: Ethnicity, avoid: string): string {
  const list = OUTSIDE_SURNAMES[stock] ?? SURNAMES[eth];
  for (let i = 0; i < 4; i++) {
    const n = pick(g.L, list);
    if (n !== avoid) return n;
  }
  return pick(g.L, list);
}

function P(g: G, id: string): LPerson | undefined {
  return g.L.people[id];
}

function byOf(g: G, id: string): number {
  return birthYear(g.s, id) ?? 1900;
}

/** Death year of anyone (undefined = alive). */
function dyOf(g: G, id: string): number | undefined {
  const c = g.s.characters[id];
  if (c) return c.alive ? undefined : c.death?.date.y;
  return P(g, id)?.dy;
}

interface DeathRoll {
  dy: number;
  dm: number;
  cause: string;
  killer?: string;
}

function warCause(list: [string, number[]][], y: number, g: G): string {
  const fits = list.filter(([, ys]) => ys.includes(y));
  return pick(g.L, (fits.length ? fits : list).map(([c]) => c));
}

/**
 * When does someone born in `by` die (from `minYear` on)? Annual hazards by
 * age and era, plus the period's wars, the 1918 influenza, the sea, and the
 * life of a crime or police family. Gentle: rates are a little under the
 * real ones. Undefined = alive in 1960.
 */
function rollDeath(g: G, by: number, sex: 'M' | 'F', house: LHouse | undefined, minYear: number, eth: Ethnicity): DeathRoll | undefined {
  const type = house?.type;
  const shore = house ? SHORE.test(house.seat) : false;
  for (let y = Math.max(by + 1, minYear); y < g.now; y++) {
    const a = y - by;
    let base = a < 5 ? 0.005 : a < 15 ? 0.0018 : a < 40 ? 0.0035 : a < 50 ? 0.0065 : a < 60 ? 0.014 : a < 70 ? 0.031 : a < 80 ? 0.068 : 0.15;
    base *= y < 1920 ? 1.25 : y < 1946 ? 1 : 0.85;
    const flu = y === 1918 ? (a >= 15 && a <= 40 ? 0.009 : 0.003) : 0;
    const ww1 = sex === 'M' && (y === 1917 || y === 1918) && a >= 18 && a <= 31 ? 0.01 : 0;
    const ww2 = sex === 'M' && y >= 1942 && y <= 1945 && a >= 18 && a <= 35 ? 0.01 : 0;
    const korea = sex === 'M' && y >= 1950 && y <= 1953 && a >= 18 && a <= 27 ? 0.004 : 0;
    const crime = type === 'crime' && sex === 'M' && a >= 17 && a <= 60 ? (y >= 1920 && y <= 1933 ? 0.009 : 0.004) : 0;
    const duty = (type === 'police' || type === 'fire') && sex === 'M' && a >= 21 && a <= 60 ? 0.0012 : 0;
    const sea = shore && sex === 'M' && a >= 14 ? 0.0006 : 0;
    // Accidents of work and the road are for grown people; children die of the period's illnesses.
    const acc = a < 14 ? 0 : sex === 'M' ? 0.0011 : 0.0004;
    const total = base + flu + ww1 + ww2 + korea + crime + duty + sea + acc;
    let r = rand(g.L);
    if (r >= total) continue;
    const dm = randInt(g.L, 1, 12);
    const out = (cause: string, killer?: string): DeathRoll => ({ dy: y, dm, cause, killer });
    if ((r -= base) < 0) return out(pick(g.L, naturalCause(y, a, sex)));
    if ((r -= flu) < 0) return out('1918 influenza');
    if ((r -= ww1) < 0) return out(warCause(WW1, y, g));
    if ((r -= ww2) < 0) return out(warCause(WW2, y, g));
    if ((r -= korea) < 0) return out(warCause(KOREA, y, g));
    if ((r -= crime) < 0) {
      const cause = pick(g.L, crimeCauses(eth, y));
      let killer: string | undefined;
      if (!/prison/.test(cause) && chance(g.L, 0.45)) {
        const others = g.L.order.filter((id) => {
          const h = g.L.houses[id];
          return h.type === 'crime' && h.id !== house?.id && !h.crewOf && h.founded <= y && (cause.includes('Castellammarese') ? h.eth === 'Italian' : true);
        });
        if (others.length) killer = pick(g.L, others);
      }
      return out(cause, killer);
    }
    if ((r -= duty) < 0) return out(pick(g.L, type === 'fire' ? FIRE_DUTY : LINE_OF_DUTY));
    if ((r -= sea) < 0) return out(pick(g.L, SEA_DEATHS));
    return out(pick(g.L, ACCIDENTS));
  }
  if (g.now - by > 96) {
    const y = Math.max(minYear, by + randInt(g.L, 84, 94));
    if (y < g.now) return { dy: y, dm: randInt(g.L, 1, 12), cause: 'old age' };
  }
  return undefined;
}

function applyDeath(g: G, id: string, d: DeathRoll | undefined): void {
  if (!d) return;
  const p = P(g, id);
  if (!p) return;
  const dm = d.dy === p.by ? Math.max(p.bm, d.dm) : d.dm;
  updPerson(g.L, id, { dy: d.dy, dm, cause: d.cause, killer: d.killer });
  if (d.killer && p.house && p.house !== d.killer) {
    const t = `${p.first} ${p.last} ${deathPhrase(d.cause)} (${d.dy}); the ${plural(g.L.houses[d.killer].name)} were blamed.`;
    g.L.grudges.push({ h: p.house, vs: d.killer, victim: id, y: d.dy, t });
    g.L.events.push({ y: d.dy, m: dm, h: p.house, o: d.killer, k: 'feud', t, p: id });
  }
}

function infantP(by: number): number {
  return by < 1895 ? 0.12 : by < 1915 ? 0.08 : by < 1935 ? 0.045 : by < 1950 ? 0.022 : 0.012;
}

/** A child of `f` and `m` born in `by`, of house `h`. Rolls infant mortality and a lifespan. */
function child(g: G, h: LHouse, f: string, m: string | undefined, by: number, sex: 'M' | 'F', stock: Stock, eth: Ethnicity, last: string): LPerson {
  const fp = P(g, f);
  // Italian naming: the first son often carries the paternal grandfather's name.
  // Brothers and sisters don't share a first name (unless an infant died and the name was given again).
  const sibNames = new Set(kidsOf(g.s, f).filter((k) => dyOf(g, k) === undefined || (dyOf(g, k)! - byOf(g, k)) > 2).map((k) => g.s.characters[k]?.firstName ?? P(g, k)?.first));
  let first = firstName(g, sex, stock, eth);
  for (let i = 0; i < 6 && sibNames.has(first); i++) first = firstName(g, sex, stock, eth);
  const gf = fp?.f ?? g.s.characters[f]?.fatherId ?? g.L.links[f]?.f;
  if (sex === 'M' && gf && eth === 'Italian' && !kidsOf(g.s, f).some((k) => (g.s.characters[k]?.gender ?? P(g, k)?.g) === 'M') && chance(g.L, 0.55)) {
    first = g.s.characters[gf]?.firstName ?? P(g, gf)?.first ?? first;
  }
  const k = mk(g, { first, last, g: sex, eth, by, bm: randInt(g.L, 1, 12), house: h.id, f, m });
  addKidRef(g.s, g.L, f, k.id);
  if (m) addKidRef(g.s, g.L, m, k.id);
  if (by < g.now - 1 && chance(g.L, infantP(by))) {
    const dy = Math.min(g.now - 1, by + (chance(g.L, 0.7) ? 0 : 1));
    applyDeath(g, k.id, { dy, dm: dy === by ? Math.min(12, k.bm + randInt(g.L, 0, 5)) : randInt(g.L, 1, 12), cause: pick(g.L, infantCause(by)) });
  } else applyDeath(g, k.id, rollDeath(g, by, sex, h, by + 1, eth));
  return P(g, k.id)!;
}

function kidCount(g: G, fby: number): number {
  if (fby < 1870) return randInt(g.L, 4, 9);
  if (fby < 1890) return randInt(g.L, 3, 8);
  if (fby < 1910) return randInt(g.L, 1, 5);
  if (fby < 1930) return randInt(g.L, 1, 4);
  return randInt(g.L, 0, 3);
}

/**
 * Children of a couple (house `h`), placed around the children who already
 * exist (`existing`), inside the mother's fertile years, before either
 * parent's death and not after 1960.
 */
function genKids(g: G, h: LHouse, f: string, m: string, existing: string[], opts: { last?: string; onlyDaughters?: boolean; max?: number } = {}): LPerson[] {
  const fby = byOf(g, f);
  const mby = byOf(g, m);
  const fdy = dyOf(g, f);
  const mdy = dyOf(g, m);
  const married = Math.max(fby + randInt(g.L, 20, 27), mby + randInt(g.L, 17, 22));
  let start = Math.max(mby + 18, married);
  const end = Math.min(mby + 43, g.now, fdy !== undefined ? fdy + 1 : 9999, mdy ?? 9999);
  const taken = new Set(existing.map((id) => byOf(g, id)));
  for (const y of taken) start = Math.min(start, y);
  let n = kidCount(g, fby) - existing.length;
  if (opts.max !== undefined) n = Math.min(n, opts.max);
  const out: LPerson[] = [];
  const stock = (g.seeds[h.id]?.stock ?? 'Sicilian') as Stock;
  const eth = h.eth;
  let y = start + randInt(g.L, 0, 2);
  let motherDied = false;
  while (n > 0 && y <= end && !motherDied) {
    if (!taken.has(y)) {
      const sex = opts.onlyDaughters ? 'F' : rand(g.L) < 0.51 ? 'M' : 'F';
      const k = child(g, h, f, m, y, sex, stock, eth, opts.last ?? h.name);
      out.push(k);
      n--;
      // Childbed fever, before the war.
      const mp = P(g, m);
      if (mp && mp.dy === undefined && y < 1935 && chance(g.L, 0.008)) {
        updPerson(g.L, m, { dy: y, dm: k.bm, cause: 'childbed fever' });
        motherDied = true;
      }
    }
    y += randInt(g.L, 1, 3);
  }
  return out;
}

/** A wife from outside (later perhaps matched with a daughter of another house). */
function wifeFor(g: G, h: LHouse, man: string, stock: Stock, eth: Ethnicity): LPerson {
  const mby = byOf(g, man);
  const w = mk(g, {
    first: firstName(g, 'F', stock, eth), last: h.name, maiden: outsideSurname(g, stock, eth, h.name), g: 'F', eth,
    by: mby + randInt(g.L, -1, 7), bm: randInt(g.L, 1, 12), sp: [man],
  });
  const mp = P(g, man);
  if (mp) updPerson(g.L, man, { sp: [...(mp.sp ?? []), w.id] });
  else updLink(g.L, man, { sp: [...(g.L.links[man]?.sp ?? []), w.id] });
  g.slots.push({ wife: w.id, husband: man });
  return w;
}

/** A man's own family: a wife, children, and (for some) the next generation. */
function genBranch(g: G, h: LHouse, man: string, gen: number): void {
  const p = P(g, man);
  if (!p || p.g !== 'M' || gen > 5) return;
  // Keep trees a readable size: big houses stop sprouting new branches.
  const size = (g.size[h.id] = (g.size[h.id] ?? 0) + 1);
  if (size > 6 && p.by > 1900 && chance(g.L, 0.6)) return;
  const lifespan = (p.dy ?? g.now) - p.by;
  if (lifespan < 21 || p.by + 21 > g.now) return;
  if (chance(g.L, 0.09)) {
    if ((p.eth === 'Italian' || p.eth === 'Irish') && chance(g.L, 0.4) && h.type !== 'crime') updPerson(g.L, man, { note: 'Became a priest' });
    return;
  }
  const stock = (g.seeds[h.id]?.stock ?? 'Sicilian') as Stock;
  const w = wifeFor(g, h, man, stock, h.eth);
  const kids = genKids(g, h, man, w.id, []);
  const lastKid = kids.reduce((a, k) => Math.max(a, k.by), w.by + 18);
  if (P(g, w.id)?.dy === undefined) applyDeath(g, w.id, rollDeath(g, w.by, 'F', undefined, Math.max(lastKid, p.by + 20), w.eth));
  for (const k of kids) {
    const kp = P(g, k.id)!;
    const span = (kp.dy ?? g.now) - kp.by;
    if (kp.g === 'M' && span >= 21 && kp.by <= g.now - 21 && (gen + 1 <= 1 || chance(g.L, kp.by > 1915 ? 0.35 : 0.6))) genBranch(g, h, k.id, gen + 1);
    else if (kp.g === 'F' && span >= 18) g.brides.push(k.id);
  }
}

/* ---------------------------------------------------------------- */
/* A house                                                            */
/* ---------------------------------------------------------------- */

/** The oldest Character up the father's line who still belongs to the same family. */
function topAncestorChar(s: GameState, id: string): string {
  let c = s.characters[id];
  for (let i = 0; i < 4; i++) {
    const f = c.fatherId ? s.characters[c.fatherId] : undefined;
    if (!f || f.lastName !== c.lastName && !(c.dynasty && f.dynasty)) break;
    c = f;
  }
  return c.id;
}

function crestColors(id: string): [string, string] {
  return CREST_COLORS[hashSeed(id) % CREST_COLORS.length];
}

export function registerHouse(L: LineageState, seed: HouseSeed, now: number): LHouse {
  const taken = Object.values(L.houses).some((h) => h.name === seed.name);
  const h: LHouse = {
    id: seed.id, name: seed.name, title: taken ? `House ${seed.name} of ${seed.seat}` : `House ${seed.name}`, type: seed.type, seat: seed.seat,
    founded: now, origin: '', eth: STOCK_ETH[seed.stock], stock: seed.stock, heads: [], colors: crestColors(seed.id), blurb: seed.blurb,
    dynId: seed.dynId, faction: seed.faction, player: seed.player, crewOf: seed.crewOf,
  };
  L.houses[h.id] = h;
  L.order.push(h.id);
  return h;
}

function genHouse(g: G, seed: HouseSeed): void {
  const { s, L } = g;
  const h = L.houses[seed.id];
  const stock = seed.stock;
  const eth = h.eth;
  let anchor: string;
  let anchorChar = false;
  if (seed.anchor && s.characters[seed.anchor]) {
    anchor = topAncestorChar(s, seed.anchor);
    anchorChar = true;
    h.eth = s.characters[seed.anchor].ethnicity;
  } else if (seed.pack) {
    anchor = genPackPeople(g, h, seed.pack, stock);
  } else if (seed.head) {
    const sex = seed.head.g ?? 'M';
    const hp = mk(g, { first: seed.head.first, last: h.name, g: sex, eth, by: g.now - seed.head.age, bm: randInt(L, 1, 12), house: h.id });
    anchor = hp.id;
    updPerson(L, anchor, { titles: [`${seed.head.office} since ${g.now - randInt(L, 2, 12)}`] });
    if (sex === 'M') genBranch(g, h, anchor, 3);
    else {
      // A matrilineal head: her husband married in and the children carry her name.
      const husband = mk(g, { first: firstName(g, 'M', stock, eth), last: outsideSurname(g, stock, eth, h.name), g: 'M', eth, by: hp.by - randInt(L, 0, 6), bm: randInt(L, 1, 12), sp: [anchor] });
      updPerson(L, anchor, { sp: [husband.id] });
      const kids = genKids(g, h, husband.id, anchor, [], { last: h.name, max: 4 });
      applyDeath(g, husband.id, rollDeath(g, husband.by, 'M', undefined, kids.reduce((a, k) => Math.max(a, k.by), hp.by + 20), eth));
      for (const k of kids) if (k.g === 'F' && (k.dy ?? g.now) - k.by >= 18) g.brides.push(k.id);
    }
  } else {
    // An extinct line: its last man.
    const ext = seed.extinct!;
    const last = mk(g, { first: firstName(g, 'M', stock, eth), last: h.name, g: 'M', eth, by: ext.y - randInt(L, 30, 48), bm: randInt(L, 1, 12), house: h.id });
    anchor = last.id;
    g.extinct.add(h.id);
    applyDeath(g, anchor, { dy: ext.y, dm: randInt(L, 1, 12), cause: ext.cause, killer: ext.killer && L.houses[ext.killer] ? ext.killer : undefined });
    if (chance(L, 0.7)) {
      const w = wifeFor(g, h, anchor, stock, eth);
      const kids = genKids(g, h, anchor, w.id, [], { onlyDaughters: true, max: 2 });
      applyDeath(g, w.id, rollDeath(g, w.by, 'F', undefined, kids.reduce((a, k) => Math.max(a, k.by), ext.y), eth));
      for (const k of kids) if ((k.dy ?? g.now) - k.by >= 18) g.brides.push(k.id);
    }
  }

  // Up the line to the founder.
  const [a0, a1] = ARRIVAL[stock];
  let E = randInt(L, a0, a1);
  const chain = [anchor];
  let cur = anchor;
  const minChain = seed.pack ? 1 : anchorChar ? 2 : seed.head ? 3 : 2;
  while ((byOf(g, cur) > E - 12 || chain.length < minChain) && chain.length < 5) {
    const cb = byOf(g, cur);
    const fby = cb - randInt(L, 25, 36);
    const father = mk(g, { first: firstName(g, 'M', stock, eth), last: h.name, g: 'M', eth, by: fby, bm: randInt(L, 1, 12), house: h.id });
    const mby = Math.max(cb - 40, Math.min(cb - 18, fby + randInt(L, -2, 7)));
    const mother = mk(g, { first: firstName(g, 'F', stock, eth), last: h.name, maiden: outsideSurname(g, stock, eth, h.name), g: 'F', eth, by: mby, bm: randInt(L, 1, 12), sp: [father.id] });
    updPerson(L, father.id, { sp: [mother.id] });
    g.slots.push({ wife: mother.id, husband: father.id });
    if (s.characters[cur]) updLink(L, cur, { f: father.id, m: mother.id });
    else updPerson(L, cur, { f: father.id, m: mother.id });
    addKidRef(s, L, father.id, cur);
    addKidRef(s, L, mother.id, cur);
    chain.push(father.id);
    cur = father.id;
  }
  const founder = cur;
  const fb = byOf(g, founder);
  if (E - fb > 38) E = fb + randInt(L, 18, 32);
  if (E < fb + 12) E = fb + randInt(L, 16, 26);
  E = Math.min(E, g.now - 1);
  if (seed.pack) {
    shareSiblings(g, seed.pack);
    attachPackRoots(g, h, anchor, chain);
    widenPack(g, h, chain);
  }
  // Around the line: the line's brothers and sisters, and their families.
  for (let i = chain.length - 1; i >= 1; i--) {
    const father = chain[i];
    const mother = P(g, father)!.sp![0];
    const gen = chain.length - 1 - i;
    const kids = genKids(g, h, father, mother, kidsOf(s, father));
    for (const k of kids) {
      const kp = P(g, k.id)!;
      const span = (kp.dy ?? g.now) - kp.by;
      if (kp.g === 'M' && span >= 21 && !g.extinct.has(h.id)) genBranch(g, h, k.id, gen + 1);
      else if (kp.g === 'F' && span >= 18) g.brides.push(k.id);
    }
    const lastKid = kidsOf(s, father).reduce((a, k) => Math.max(a, byOf(g, k)), 0);
    applyDeath(g, father, rollDeath(g, byOf(g, father), 'M', h, Math.max(lastKid, i === chain.length - 1 ? E + 1 : 0), eth));
    if (P(g, mother)?.dy === undefined) applyDeath(g, mother, rollDeath(g, byOf(g, mother), 'F', undefined, lastKid, eth));
  }
  // A Character head with children and no wife: she died.
  if (anchorChar) {
    const c = s.characters[anchor];
    if (!c.spouseId && c.gender === 'M') {
      const kids = c.childrenIds.filter((k) => s.characters[k]);
      if (kids.length) {
        const kb = kids.map((k) => s.characters[k].birth.y);
        const min = Math.min(...kb);
        const max = Math.max(...kb);
        const w = mk(g, {
          first: firstName(g, 'F', stock, c.ethnicity), last: c.lastName, maiden: outsideSurname(g, stock, c.ethnicity, c.lastName), g: 'F', eth: c.ethnicity,
          by: Math.max(max - 42, Math.min(min - 18, c.birth.y + randInt(L, -1, 6))), bm: randInt(L, 1, 12), sp: [anchor],
        });
        updLink(L, anchor, { sp: [w.id] });
        for (const k of kids) {
          updLink(L, k, { m: w.id });
          addKidRef(s, L, w.id, k);
        }
        let d = rollDeath(g, w.by, 'F', undefined, max, c.ethnicity);
        if (!d) d = { dy: randInt(L, max, g.now - 1), dm: randInt(L, 1, 12), cause: pick(L, naturalCause(g.now - 3, g.now - 3 - w.by, 'F')) };
        applyDeath(g, w.id, d);
        g.slots.push({ wife: w.id, husband: anchor });
      }
    }
  }
  // Founding.
  updPerson(L, founder, { born: pick(L, ORIGINS[stock]) });
  const origin = P(g, founder)!.born!;
  h.founded = E;
  h.origin = origin;
  h.founderId = founder;
  const fname = `${P(g, founder)!.first} ${h.name}`;
  const t = stock === 'OldStock'
    ? `${fname}, of ${origin}, set the family up in ${seed.seat}.`
    : stock === 'Migration'
      ? `${fname} came north with ${origin} and settled in ${seed.seat}.`
      : stock === 'Caribbean'
        ? `${fname} came up from ${origin} and settled in ${seed.seat}.`
        : `${fname} came over from ${origin} and settled in ${seed.seat}.`;
  L.events.push({ y: E, h: h.id, k: 'founding', t, p: founder });

  // Heads of the house, founder down.
  const line = seed.pack && g.packHeads[h.id] ? headLine(g, h, founder, g.packHeads[h.id]) : chain.slice().reverse();
  if (seed.anchor && seed.anchor !== anchor && s.characters[seed.anchor]) line.push(seed.anchor);
  const heads = [];
  let from = E;
  for (let i = 0; i < line.length; i++) {
    const id = line[i];
    heads.push({ id, from: Math.max(from, byOf(g, id) + 16) });
    const d = dyOf(g, id);
    from = d ?? Math.min(g.now, Math.max(from + 1, g.now - randInt(L, 1, 8)));
  }
  h.heads = heads;
  h.headId = heads[heads.length - 1]?.id;
  // Titles of the heads who came before the current one.
  for (let i = 0; i < heads.length - 1; i++) {
    const id = heads[i].id;
    if (!P(g, id) && !s.characters[id]) continue;
    const opts = HEAD_TITLES[h.type][Math.min(i, 3)];
    const title = pick(L, opts).replace('{seat}', seed.seat);
    const start = Math.max(heads[i].from, byOf(g, id) + 26);
    const end = Math.min(heads[i + 1].from, (dyOf(g, id) ?? g.now) );
    if (start >= end) continue;
    addTitle(g, id, `${title} ${start}–${end}`);
    if (i > 0 && chance(L, 0.5)) L.events.push({ y: start, h: h.id, k: 'title', t: `${nm(g, id)}: ${title}.`, p: id });
  }
}

/* ---------------------------------------------------------------- */
/* World-pack dynasties                                               */
/* ---------------------------------------------------------------- */

/**
 * The pack's people of a dynasty become lineage people with their real
 * births, deaths, offices and ties. Women with no parents in the dynasty
 * who married one of its men married in; everyone else is of the blood.
 * Returns the anchor: the eldest of the blood with no parents recorded.
 */
function genPackPeople(g: G, h: LHouse, d: PackDynasty, stock: Stock): string {
  const { L } = g;
  const people = d.people.filter((p) => p.by <= g.now);
  const ids = new Set(people.map((p) => p.id));
  const rel = (id: string, kind: string) => people.find((p) => p.id === id)!.rel.filter(([k, o]) => k === kind && ids.has(o)).map(([, o]) => o);
  const hasParents = (id: string) => rel(id, 'parent').length > 0;
  const blood = new Set<string>();
  for (const p of people) {
    if (hasParents(p.id) || p.g === 'M') blood.add(p.id);
    else if (p.maiden ? p.maiden === h.name : !rel(p.id, 'spouse').length) blood.add(p.id);
  }
  for (const p of people) {
    const titles = p.office ? [p.office.replace(/\.$/, '')] : undefined;
    const married = !blood.has(p.id);
    mk(g, {
      first: p.first, last: p.last, maiden: married ? p.maiden ?? outsideSurname(g, stock, p.eth, h.name) : p.maiden, nick: p.nick, g: p.g, eth: p.eth,
      by: p.by, bm: 1 + (hashSeed(p.id) % 12), house: married ? undefined : h.id, titles,
    });
    // The new record took the next id: re-key it under the pack's own id.
    const tmp = `L${L.next - 1}`;
    L.people[p.id] = { ...L.people[tmp], id: p.id };
    delete L.people[tmp];
    g.created[g.created.length - 1] = p.id;
    if (married && p.maiden) g.packBrides.push(p.id);
  }
  // Family ties.
  for (const p of people) {
    for (const par of rel(p.id, 'parent')) {
      const pp = P(g, par)!;
      updPerson(L, p.id, pp.g === 'M' ? { f: par } : { m: par });
      addKidRef(g.s, L, par, p.id);
    }
    for (const sp of [...rel(p.id, 'spouse'), ...rel(p.id, 'ex-spouse')]) {
      const me = P(g, p.id)!;
      if (!me.sp?.includes(sp)) updPerson(L, p.id, { sp: [...(me.sp ?? []), sp] });
    }
  }
  // A child with one parent recorded: the other is the parent's spouse.
  for (const p of people) {
    const me = P(g, p.id)!;
    const one = me.f ?? me.m;
    if (!one || (me.f && me.m)) continue;
    const other = P(g, one)?.sp?.find((x) => ids.has(x));
    if (other) {
      updPerson(L, p.id, me.f ? { m: other } : { f: other });
      addKidRef(g.s, L, other, p.id);
    }
  }
  // Brothers and sisters share parents.
  for (const p of people) {
    for (const sib of rel(p.id, 'sibling')) {
      const a = P(g, p.id)!;
      const b = P(g, sib)!;
      if ((a.f || a.m) && !b.f && !b.m) {
        updPerson(L, sib, { f: a.f, m: a.m });
        if (a.f) addKidRef(g.s, L, a.f, sib);
        if (a.m) addKidRef(g.s, L, a.m, sib);
      }
    }
  }
  // A grandchild with no parent in the pack: the parent between them died before 1960.
  for (const p of people) {
    const me = P(g, p.id)!;
    if (me.f || me.m) continue;
    const gp = rel(p.id, 'grandparent')[0];
    if (!gp) continue;
    const gpp = P(g, gp)!;
    const by = Math.round((gpp.by + me.by) / 2);
    const mid = mk(g, { first: firstName(g, 'M', stock, me.eth), last: h.name, g: 'M', eth: me.eth, by, bm: randInt(L, 1, 12), house: h.id, f: gpp.g === 'M' ? gp : undefined, m: gpp.g === 'F' ? gp : undefined });
    addKidRef(g.s, L, gp, mid.id);
    const gsp = gpp.sp?.[0];
    if (gsp) {
      updPerson(L, mid.id, gpp.g === 'M' ? { m: gsp } : { f: gsp });
      addKidRef(g.s, L, gsp, mid.id);
    }
    const w = wifeFor(g, h, mid.id, stock, me.eth);
    updPerson(L, p.id, { f: mid.id, m: w.id });
    addKidRef(g.s, L, mid.id, p.id);
    addKidRef(g.s, L, w.id, p.id);
    let dd = rollDeath(g, by, 'M', h, me.by, me.eth);
    if (!dd) dd = { dy: randInt(L, Math.min(g.now - 1, me.by + 1), g.now - 1), dm: randInt(L, 1, 12), cause: pick(L, naturalCause(g.now - 5, g.now - 5 - by, 'M')) };
    applyDeath(g, mid.id, dd);
    applyDeath(g, w.id, rollDeath(g, w.by, 'F', undefined, me.by, me.eth));
    blood.add(mid.id);
  }
  // Pack deaths before 1960 keep their causes; the rest of the dead get one.
  for (const p of people) {
    if (p.dy === undefined) continue;
    updPerson(L, p.id, { dy: p.dy, dm: 1 + (hashSeed(`${p.id}:d`) % 12), cause: p.cause ? p.cause.charAt(0).toLowerCase() + p.cause.slice(1) : pick(L, naturalCause(p.dy, p.dy - p.by, p.g)) });
  }
  // Men of the blood with children and no wife recorded: she is in the tree too.
  for (const p of people) {
    const me = P(g, p.id)!;
    if (me.g !== 'M' || me.sp?.length || !blood.has(p.id)) continue;
    const kids = (me.kids ?? []).map((k) => P(g, k)!).filter((k) => !k.m);
    if (!kids.length) continue;
    const minK = Math.min(...kids.map((k) => k.by));
    const maxK = Math.max(...kids.map((k) => k.by));
    const w = mk(g, {
      first: firstName(g, 'F', stock, me.eth), last: me.last, maiden: outsideSurname(g, stock, me.eth, h.name), g: 'F', eth: me.eth,
      by: Math.max(maxK - 40, Math.min(minK - 19, me.by + randInt(L, 0, 5))), bm: randInt(L, 1, 12), sp: [p.id],
    });
    updPerson(L, p.id, { sp: [w.id] });
    for (const k of kids) {
      updPerson(L, k.id, { m: w.id });
      addKidRef(g.s, L, w.id, k.id);
    }
    applyDeath(g, w.id, rollDeath(g, w.by, 'F', undefined, maxK, me.eth));
    g.slots.push({ wife: w.id, husband: p.id });
  }
  // The head in 1960: the eldest of the blood of age; a widow who married in if none.
  const living = (id: string) => P(g, id)?.dy === undefined;
  const age = (id: string) => g.now - P(g, id)!.by;
  const byAge = (xs: string[]) => xs.sort((a, b) => P(g, a)!.by - P(g, b)!.by);
  const bl = byAge(people.filter((p) => blood.has(p.id) && living(p.id) && age(p.id) <= 85).map((p) => p.id));
  const head = bl.find((id) => age(id) >= 25) ?? byAge(people.filter((p) => !blood.has(p.id) && living(p.id) && age(p.id) >= 25).map((p) => p.id))[0] ?? bl[0];
  if (head) g.packHeads[h.id] = head;
  // The anchor: the eldest of the blood with no parents.
  const roots = byAge([...blood].filter((id) => !P(g, id)?.f && !P(g, id)?.m));
  return roots[0] ?? people[0].id;
}

/** Pack brothers and sisters share the parents the line above them was given. */
function shareSiblings(g: G, d: PackDynasty): void {
  const { L } = g;
  for (const p of d.people) {
    for (const [k, sib] of p.rel) {
      if (k !== 'sibling') continue;
      const a = P(g, p.id);
      const b = P(g, sib);
      if (!a || !b || (!a.f && !a.m) || b.f || b.m) continue;
      const pa = a.f ? P(g, a.f) : a.m ? P(g, a.m) : undefined;
      if (pa && b.by - pa.by < 16) continue;
      updPerson(L, sib, { f: a.f, m: a.m });
      if (a.f) addKidRef(g.s, L, a.f, sib);
      if (a.m) addKidRef(g.s, L, a.m, sib);
    }
  }
}

/** Other pack roots of the blood (cousins with no recorded parents) hang off the generated tree. */
function attachPackRoots(g: G, h: LHouse, anchor: string, chain: string[]): void {
  const { L } = g;
  const roots = Object.values(L.people).filter((p) => p.house === h.id && !p.f && !p.m && p.id !== anchor && !chain.includes(p.id) && g.created.includes(p.id));
  for (const r of roots.sort((a, b) => a.by - b.by)) {
    const men = Object.values(L.people).filter((p) => p.house === h.id && p.g === 'M' && p.id !== r.id && (p.sp?.length ?? 0) > 0);
    const fits = men.filter((x) => r.by - x.by >= 20 && r.by - x.by <= 45 && (x.dy === undefined || x.dy >= r.by - 1))
      .sort((a, b) => Math.abs(r.by - a.by - 30) - Math.abs(r.by - b.by - 30));
    let f = fits[0];
    if (!f) {
      // A generated son of an older man of the house, who fathered this one.
      const gfs = men.filter((x) => r.by - x.by >= 42 && r.by - x.by <= 75).sort((a, b) => b.by - a.by);
      const gf = gfs[0] ?? P(g, chain[chain.length - 1]);
      // Nobody old enough to be a grandfather: this one stays a root of the house ("other kin").
      if (!gf || r.by - gf.by < 42) continue;
      const by = Math.max(gf.by + 22, r.by - 30);
      f = mk(g, { first: firstName(g, 'M', h.stock as Stock, r.eth), last: h.name, g: 'M', eth: r.eth, by, bm: randInt(L, 1, 12), house: h.id, f: gf.id, m: gf.sp?.[0] });
      addKidRef(g.s, L, gf.id, f.id);
      if (gf.sp?.[0]) addKidRef(g.s, L, gf.sp[0], f.id);
      wifeFor(g, h, f.id, h.stock as Stock, r.eth);
      applyDeath(g, f.id, rollDeath(g, by, 'M', h, r.by, r.eth));
      f = P(g, f.id)!;
    }
    const m = P(g, f.id)!.sp?.find((w) => { const wp = P(g, w); return !!wp && r.by - wp.by >= 17 && r.by - wp.by <= 43; });
    updPerson(L, r.id, { f: f.id, m });
    addKidRef(g.s, L, f.id, r.id);
    if (m) addKidRef(g.s, L, m, r.id);
  }
}

/** The older pack couples had more children than the pack names: their brothers and sisters, and their families. */
function widenPack(g: G, h: LHouse, chain: string[]): void {
  const men = Object.values(g.L.people).filter((p) => p.house === h.id && p.g === 'M' && p.by < 1915 && !chain.includes(p.id) && (p.sp?.length ?? 0) > 0);
  for (const man of men) {
    const wife = man.sp![0];
    const kids = genKids(g, h, man.id, wife, kidsOf(g.s, man.id), { max: 3 });
    for (const k of kids) {
      const kp = P(g, k.id)!;
      const span = (kp.dy ?? g.now) - kp.by;
      if (kp.g === 'M' && span >= 21) genBranch(g, h, k.id, 3);
      else if (kp.g === 'F' && span >= 18) g.brides.push(k.id);
    }
  }
}

/** Heads of a house from its founder down to `head` along the blood (a widow follows her husband). */
function headLine(g: G, h: LHouse, founder: string, head: string): string[] {
  const out: string[] = [];
  let cur: string | undefined = head;
  const hp = P(g, head);
  if (hp && hp.house !== h.id) {
    out.push(head);
    cur = hp.sp?.find((x) => P(g, x)?.house === h.id);
  }
  for (let i = 0; cur && i < 12; i++) {
    out.push(cur);
    if (cur === founder) break;
    const p: LPerson | undefined = P(g, cur);
    const f: string | undefined = p?.f ?? g.L.links[cur]?.f;
    const m: string | undefined = p?.m ?? g.L.links[cur]?.m;
    cur = f && (P(g, f)?.house === h.id || g.s.characters[f]) ? f : m && P(g, m)?.house === h.id ? m : f;
  }
  return out.reverse();
}

function nm(g: G, id: string): string {
  const c = g.s.characters[id];
  if (c) return `${c.firstName} ${c.lastName}`;
  const p = P(g, id);
  return p ? `${p.first} ${p.last}` : '?';
}

function addTitle(g: G, id: string, t: string): void {
  if (g.s.characters[id]) updLink(g.L, id, { titles: [...(g.L.links[id]?.titles ?? []), t] });
  else updPerson(g.L, id, { titles: [...(P(g, id)?.titles ?? []), t] });
}

/* ---------------------------------------------------------------- */
/* Households: a crew man's wife and children                         */
/* ---------------------------------------------------------------- */

/**
 * A crew man's household (the engine keeps only a wife's first name and the
 * children's names and years) mirrored as lineage people in his house's
 * tree. Idempotent: matches by name and year, so it also runs monthly
 * (housesLife.ts). During generation (`g`) the wife can turn out to be a
 * daughter of another house (matchBrides).
 */
export function syncHousehold(s: GameState, L: LineageState, c: Character, g?: G): void {
  const hh = c.household;
  if (!hh || c.dynasty || (!hh.wife && !hh.kids.length)) return;
  const house = L.links[c.id]?.house;
  if (!house || L.houses[house]?.player) return;
  const stock = (L.houses[house]?.stock ?? 'Irish') as Stock;
  const add = (p: Omit<LPerson, 'id'>): LPerson => {
    if (g) return mk(g, p);
    const rec = clean({ id: `L${L.next++}`, ...p } as LPerson);
    L.people[rec.id] = rec;
    return rec;
  };
  let wife = spousesOfAny(s, L, c.id).find((w) => (s.characters[w]?.firstName ?? L.people[w]?.first) === hh.wife);
  if (hh.wife && !wife) {
    const born = hh.kids.length ? Math.min(...hh.kids.map((k) => k.born)) : s.date.y;
    const by = Math.min(born - 19, c.birth.y + randInt(L, 0, 5));
    const w = add({ first: hh.wife, last: c.lastName, maiden: outsideSurnameL(L, stock, c.ethnicity, c.lastName), g: 'F', eth: c.ethnicity, by, bm: randInt(L, 1, 12), sp: [c.id] });
    updLink(L, c.id, { sp: [...(L.links[c.id]?.sp ?? []), w.id] });
    wife = w.id;
    if (g) g.slots.push({ wife: w.id, husband: c.id });
  }
  const have = kidsOf(s, c.id);
  for (const k of hh.kids) {
    if (have.some((x) => (L.people[x]?.first ?? s.characters[x]?.firstName) === k.name && birthYear(s, x) === k.born)) continue;
    const kid = add({ first: k.name, last: c.lastName, g: k.male ? 'M' : 'F', eth: c.ethnicity, by: k.born, bm: k.born === s.date.y ? s.date.m : randInt(L, 1, 12), house, f: c.id, m: wife });
    addKidRef(s, L, c.id, kid.id);
    if (wife) addKidRef(s, L, wife, kid.id);
  }
}

function spousesOfAny(s: GameState, L: LineageState, id: string): string[] {
  const c = s.characters[id];
  const extra = c ? L.links[id]?.sp ?? [] : L.people[id]?.sp ?? [];
  return c?.spouseId ? [...extra, c.spouseId] : extra.slice();
}

function outsideSurnameL(L: LineageState, stock: Stock, eth: Ethnicity, avoid: string): string {
  const list = OUTSIDE_SURNAMES[stock] ?? SURNAMES[eth];
  const n = pick(L, list);
  return n === avoid ? pick(L, list) : n;
}

/* ---------------------------------------------------------------- */
/* Interlocking: wives matched with daughters of other houses         */
/* ---------------------------------------------------------------- */

function matchBrides(g: G): void {
  const { L, s } = g;
  const free = new Set(g.brides);
  for (const slot of g.slots) {
    const w = P(g, slot.wife);
    if (!w) continue;
    const husbandHouse = P(g, slot.husband)?.house ?? L.links[slot.husband]?.house ?? (s.characters[slot.husband] ? houseFromSeedAnchor(g, slot.husband) : undefined);
    const kids = kidsOf(s, slot.wife);
    const kb = kids.map((k) => byOf(g, k));
    const minK = kb.length ? Math.min(...kb) : w.by + 22;
    const maxK = kb.length ? Math.max(...kb) : w.by + 22;
    const married = minK - 1;
    const hdy = dyOf(g, slot.husband);
    if (!chance(L, 0.62)) continue;
    const cands: LPerson[] = [];
    for (const id of free) {
      const b = P(g, id);
      if (!b || b.sp?.length || b.house === husbandHouse) continue;
      if (Math.abs(b.by - w.by) > 4 || (b.eth !== w.eth && rand(L) > 0.1)) continue;
      if (b.by > minK - 17 || b.by < maxK - 43 || b.by + 16 > married) continue;
      if (b.dy !== undefined && b.dy < maxK) continue;
      if (hdy !== undefined && hdy < married) continue;
      if (b.f && (b.f === P(g, slot.husband)?.f)) continue;
      cands.push(b);
      if (cands.length >= 6) break;
    }
    if (!cands.length) continue;
    const b = pick(L, cands);
    free.delete(b.id);
    // The daughter takes the outside wife's place.
    updPerson(L, b.id, { last: w.last, maiden: b.last, sp: [slot.husband], kids: w.kids?.slice() ?? [] });
    if (w.dy !== undefined && b.dy === undefined && w.cause === 'childbed fever') updPerson(L, b.id, { dy: w.dy, dm: w.dm, cause: w.cause });
    for (const k of kids) {
      if (s.characters[k]) updLink(L, k, { m: b.id });
      else updPerson(L, k, { m: b.id });
    }
    const hp = P(g, slot.husband);
    // A crew man's household knows his wife by her first name.
    const hc = s.characters[slot.husband];
    if (hc?.household?.wife === w.first) hc.household.wife = b.first;
    if (hp) updPerson(L, slot.husband, { sp: (hp.sp ?? []).map((x) => (x === w.id ? b.id : x)) });
    else updLink(L, slot.husband, { sp: (L.links[slot.husband]?.sp ?? []).map((x) => (x === w.id ? b.id : x)) });
    delete L.people[w.id];
    if (husbandHouse && b.house) {
      L.events.push({ y: married, h: husbandHouse, o: b.house, k: 'marriage', t: `${nm(g, slot.husband)} married ${b.first} ${b.last} of ${L.houses[b.house].title}.`, p: slot.husband, q: b.id });
    }
  }
  // Daughters nobody matched: an outside husband, the convent, or a spinster aunt.
  for (const id of free) {
    const b = P(g, id);
    if (!b || b.sp?.length) continue;
    const h = b.house ? L.houses[b.house] : undefined;
    const stock = (h && g.seeds[h.id]?.stock) || 'Irish';
    if (chance(L, 0.62)) {
      const husband = mk(g, { first: firstName(g, 'M', stock as Stock, b.eth), last: outsideSurname(g, stock as Stock, b.eth, b.last), g: 'M', eth: b.eth, by: b.by + randInt(L, 0, 6), bm: randInt(L, 1, 12), sp: [id] });
      applyDeath(g, husband.id, rollDeath(g, husband.by, 'M', undefined, b.by + 20, b.eth));
      updPerson(L, id, { last: husband.last, maiden: b.last, sp: [husband.id] });
    } else if ((b.eth === 'Irish' || b.eth === 'Italian') && h?.type !== 'crime' && chance(L, 0.25)) {
      updPerson(L, id, { note: 'Took the veil' });
    }
  }
}

/**
 * The pack's own crossings: a wife who married in from a house's name is
 * that house's daughter (Miriam Rosenfeld, born a Weiss), and a daughter who
 * took another house's name married one of its sons (Eileen Callahan, now a
 * Kilbride).
 */
function packCrossings(g: G): void {
  const { s, L } = g;
  const byName = new Map<string, string>();
  for (const id of L.order) if (!byName.has(L.houses[id].name)) byName.set(L.houses[id].name, id);
  const people = Object.values(L.people);
  const menOf = (hid: string) => people.filter((p) => p.house === hid && p.g === 'M');
  for (const id of g.packBrides) {
    const w = P(g, id);
    const hid = w?.maiden ? byName.get(w.maiden) : undefined;
    if (!w || !hid || w.f || w.m) continue;
    const fathers = menOf(hid).filter((f) => {
      const m = f.sp?.[0] ? P(g, f.sp[0]) : undefined;
      return !!m && w.by - f.by >= 20 && w.by - f.by <= 45 && w.by - m.by >= 18 && w.by - m.by <= 42 && (f.dy ?? 9999) >= w.by - 1 && (m.dy ?? 9999) >= w.by;
    });
    // A Character head of that house (Herman Weiss) can be her brother: she is his parents' daughter.
    const head = L.houses[hid].headId ? s.characters[L.houses[hid].headId!] : undefined;
    const hf = head ? (head.fatherId ?? L.links[head.id]?.f) : undefined;
    const hm = head ? (head.motherId ?? L.links[head.id]?.m) : undefined;
    let f: string | undefined;
    let m: string | undefined;
    if (hf && hm && Math.abs(head!.birth.y - w.by) <= 14 && w.by - (birthYear(s, hm) ?? 0) <= 42 && w.by - (birthYear(s, hm) ?? 9999) >= 17) {
      f = hf;
      m = hm;
    } else if (fathers.length) {
      const x = pick(L, fathers);
      f = x.id;
      m = x.sp![0];
    }
    if (!f || !m) continue;
    updPerson(L, id, { f, m, house: hid });
    addKidRef(s, L, f, id);
    addKidRef(s, L, m, id);
    const husband = w.sp?.[0];
    const hh = husband ? P(g, husband)?.house : undefined;
    if (husband && hh) L.events.push({ y: w.by + 21, h: hh, o: hid, k: 'marriage', t: `${nm(g, husband)} married ${w.first} ${w.maiden} of ${L.houses[hid].title}.`, p: husband, q: id });
  }
  for (const w of people) {
    if (w.g !== 'F' || !w.maiden || w.sp?.length || !w.house || !g.created.includes(w.id)) continue;
    const hid = byName.get(w.last);
    if (!hid || hid === w.house || w.last === w.maiden) continue;
    const cands = menOf(hid).filter((x) => !x.sp?.length && x.by >= w.by - 8 && x.by <= w.by + 3 && x.dy === undefined && !x.note);
    const x = cands.sort((a, b) => Math.abs(a.by - w.by + 3) - Math.abs(b.by - w.by + 3))[0];
    if (!x) continue;
    updPerson(L, w.id, { sp: [x.id] });
    updPerson(L, x.id, { sp: [w.id] });
    L.events.push({ y: Math.max(w.by, x.by) + 22, h: hid, o: w.house, k: 'marriage', t: `${x.first} ${x.last} married ${w.first} ${w.maiden} of ${L.houses[w.house].title}.`, p: x.id, q: w.id });
  }
}

function houseFromSeedAnchor(g: G, charId: string): string | undefined {
  for (const id of g.L.order) {
    const seed = g.seeds[id];
    if (seed?.anchor === charId || g.L.houses[id].heads.some((x) => x.id === charId)) return id;
  }
  return undefined;
}

/** Wives already in the game whose maiden name is a house: make them its daughters. */
function attachMaidens(g: G): void {
  const { s, L } = g;
  const byName = new Map<string, string>();
  for (const id of L.order) if (!byName.has(L.houses[id].name)) byName.set(L.houses[id].name, id);
  const members = new Map<string, LPerson[]>();
  for (const id of g.created) {
    const p = L.people[id];
    if (p?.house && p.g === 'M') (members.get(p.house) ?? members.set(p.house, []).get(p.house)!).push(p);
  }
  for (const c of Object.values(s.characters)) {
    if (c.gender !== 'F' || !c.maidenName || c.fatherId || L.links[c.id]?.f || L.links[c.id]?.house) continue;
    const hid = byName.get(c.maidenName);
    if (!hid) continue;
    const husband = c.spouseId ? s.characters[c.spouseId] : undefined;
    if (husband && L.links[husband.id]?.house === hid) continue;
    const cands = (members.get(hid) ?? []).filter((f) => {
      const m = f.sp?.[0] ? P(g, f.sp[0]) : undefined;
      if (!m || c.birth.y - m.by < 18 || c.birth.y - m.by > 42 || c.birth.y - f.by < 20) return false;
      if (f.dy !== undefined && f.dy < c.birth.y - 1) return false;
      if (m.dy !== undefined && m.dy < c.birth.y) return false;
      return true;
    });
    if (!cands.length) continue;
    const f = pick(L, cands);
    const m = f.sp![0];
    updLink(L, c.id, { house: hid, f: f.id, m });
    addKidRef(s, L, f.id, c.id);
    addKidRef(s, L, m, c.id);
    if (husband) {
      const hh = L.links[husband.id]?.house ?? (husband.dynasty ? PLAYER_HOUSE : undefined);
      if (hh) L.events.push({ y: Math.max(c.birth.y + 18, g.now - 30), h: hh, o: hid, k: 'marriage', t: `${husband.firstName} ${husband.lastName} married ${c.firstName} ${c.maidenName} of ${L.houses[hid].title}.`, p: husband.id, q: c.id });
    }
  }
}

/* ---------------------------------------------------------------- */
/* Seeds: every house in the game                                     */
/* ---------------------------------------------------------------- */

const MADE: Character['rank'][] = ['underboss', 'consigliere', 'capo', 'soldier'];
const CREW_FACTIONS: FactionId[] = ['player', 'manno', 'feldstein', 'kessler', 'philly'];

/** Is this Character a made man who should head a crew house of his own? */
export function wantsCrewHouse(c: Character): boolean {
  return c.alive && !c.dynasty && MADE.includes(c.rank) && CREW_FACTIONS.includes(c.faction);
}

export function crewSeed(c: Character): HouseSeed {
  return {
    id: `h_crew_${c.id}`, name: c.lastName, type: 'crime', seat: FACTION_SEAT[c.faction] ?? 'Wildwood', stock: stockFor(c.ethnicity, hashSeed(c.id)),
    anchor: c.id, faction: c.faction, crewOf: c.id,
    blurb: `The family of ${c.firstName}${c.nickname ? ` "${c.nickname}"` : ''} ${c.lastName}, ${c.rank} with ${c.faction === 'player' ? 'your crew' : c.faction}.`,
  };
}

/** Political/police houses: the world pack's people when plugged in, the built-in set otherwise. */
export type PoliticalSource = () => HouseSeed[];
let politicalSource: PoliticalSource | undefined;
/** Plug in another source of political dynasties (see housesPack.ts). */
export function setPoliticalSource(src: PoliticalSource | undefined): void {
  politicalSource = src;
}

export function buildSeeds(s: GameState): HouseSeed[] {
  const out: HouseSeed[] = [];
  const used = new Set<string>();
  const boss = s.characters[s.playerId];
  out.push({
    id: PLAYER_HOUSE, name: s.houseName, type: 'crime', seat: 'Wildwood', stock: stockFor(boss.ethnicity, hashSeed(s.seed)), anchor: boss.id, faction: 'player', player: true,
    blurb: 'Your house.',
  });
  used.add(boss.id);
  for (const h of s.dyn?.houses ?? []) {
    const head = s.characters[h.headId];
    const k = KNOWN_HOUSES[h.id];
    if (!head || !k) continue;
    out.push({ id: h.id, name: head.lastName, type: k.type, seat: k.seat, stock: k.stock, anchor: head.id, blurb: h.blurb, dynId: h.id, faction: h.faction });
    used.add(head.id);
  }
  const law = s.rivals.find((r) => r.id === 'law');
  const lawHead = law ? s.characters[law.leaderId] : undefined;
  if (lawHead && !used.has(lawHead.id)) {
    out.push({ id: 'h_keough', name: lawHead.lastName, type: 'police', seat: 'Cape May Court House', stock: 'Irish', anchor: lawHead.id, faction: 'law', blurb: 'Prosecutors and county detectives. They want a headline.' });
    used.add(lawHead.id);
  }
  for (const c of Object.values(s.characters)) {
    const o = c.office ? OFFICIAL_HOUSES[c.office] : undefined;
    if (!o || used.has(c.id) || !c.alive) continue;
    out.push({ id: `h_off_${c.id}`, name: c.lastName, type: o.type, seat: o.seat, stock: o.stock, anchor: c.id, blurb: o.blurb, faction: c.faction === 'law' ? 'law' : undefined });
    used.add(c.id);
  }
  // The world pack's dynasties by default; the built-in list stands in if the pack is unplugged (setPoliticalSource(() => [])).
  const political = politicalSource ? politicalSource() : packSeeds();
  const extra = EXTRA_HOUSES.filter((d) => !(political.length && d.pack));
  for (const d of extra) {
    out.push({
      id: d.id, name: d.name, type: d.type, seat: d.seat, stock: d.stock, head: d.head, blurb: d.blurb, faction: d.faction,
      extinct: d.head ? undefined : d.id === 'h_benedetto' ? { y: 1931, cause: 'killed in the Castellammarese troubles', killer: 'h_moretti' } : { y: 1949, cause: 'died in prison (Trenton State Prison)' },
    });
  }
  out.push(...political);
  for (const c of Object.values(s.characters)) {
    if (used.has(c.id) || !wantsCrewHouse(c)) continue;
    // Two made men of one name in one outfit are one house (the second joins as kin, housesLife.ts).
    if (out.some((x) => x.crewOf && x.name === c.lastName && x.faction === c.faction)) continue;
    out.push(crewSeed(c));
    used.add(c.id);
  }
  return out;
}

/* ---------------------------------------------------------------- */
/* Entry points                                                       */
/* ---------------------------------------------------------------- */

function blank(s: GameState): LineageState {
  return { v: 1, rng: hashSeed(`${s.seed}:lineage`), next: 1, houses: {}, order: [], people: {}, links: {}, events: [], grudges: [] };
}

function newG(s: GameState, L: LineageState): G {
  return { s, L, now: s.date.y, nowM: s.date.m, brides: [], slots: [], seeds: {}, extinct: new Set(), size: {}, created: [], packBrides: [], packHeads: {} };
}

/** Grudges the engine's starting problems imply (Manno and your father, 1951). */
function startingGrudges(g: G): void {
  const { s, L } = g;
  if (!s.flags.problem_grudge) return;
  const manno = L.houses.h_manno;
  const boss = s.characters[s.playerId];
  const father = boss.fatherId ?? L.links[boss.id]?.f;
  if (!manno?.headId || !father) return;
  const head = manno.headId;
  const cands = Object.values(L.people).filter((p) => p.house === 'h_manno' && p.g === 'M' && p.by >= 1905 && p.by <= 1932 && (p.dy === undefined || p.dy >= 1951)
    && !(p.kids ?? []).some((k) => byOf(g, k) > 1951) && !kidsOf(s, p.id).includes(head) && p.id !== head);
  if (!cands.length) return;
  const v = pick(L, cands);
  updPerson(L, v.id, { dy: 1951, dm: randInt(L, 3, 10), cause: 'shot on the Rio Grande causeway', killer: PLAYER_HOUSE });
  const t = `${v.first} Manno was shot on the Rio Grande causeway (1951). ${nm(g, father)} of ${L.houses[PLAYER_HOUSE].title} pulled the trigger.`;
  L.grudges.push({ h: 'h_manno', vs: PLAYER_HOUSE, victim: v.id, by: father, y: 1951, t });
  L.events.push({ y: 1951, h: 'h_manno', o: PLAYER_HOUSE, k: 'feud', t, p: v.id, q: father });
}

function memberTitles(g: G, seeds: HouseSeed[]): void {
  const { L } = g;
  const heads = new Set(seeds.flatMap((sd) => L.houses[sd.id].heads.map((x) => x.id)));
  for (const id of g.created) {
    const p = L.people[id];
    if (!p || !p.house || heads.has(p.id) || p.titles?.length) continue;
    const h = L.houses[p.house];
    if (p.g === 'F' && h.type !== 'showbiz') continue;
    const span = (p.dy ?? g.now) - p.by;
    if (span < 30 || !chance(L, 0.22)) continue;
    const start = p.by + randInt(L, 24, 34);
    const end = Math.min(p.dy ?? g.now, start + randInt(L, 3, 18));
    if (start >= end || start >= g.now) continue;
    const t = pick(L, MEMBER_TITLES[h.type]).replace('{seat}', h.seat);
    updPerson(L, p.id, { titles: [end >= g.now && p.dy === undefined ? `${t} since ${start}` : `${t} ${start}–${end}`] });
  }
}

/** Mark houses with nobody of the blood left alive as extinct. */
function markExtinct(g: G): void {
  const { L, s } = g;
  for (const id of g.created) {
    const p = L.people[id];
    if (!p || !p.house || !g.extinct.has(p.house) || p.dy !== undefined) continue;
    const lastKid = (p.kids ?? []).reduce((a, k) => Math.max(a, byOf(g, k)), p.by + 1);
    const dy = Math.max(lastKid, Math.min(g.now - 1, p.by + randInt(L, 55, 75)));
    updPerson(L, p.id, { dy, dm: randInt(L, 1, 12), cause: pick(L, naturalCause(dy, dy - p.by, p.g)) });
  }
  const alive = new Set<string>();
  const lastDeath: Record<string, number> = {};
  for (const id of g.created) {
    const p = L.people[id];
    if (!p?.house || !g.seeds[p.house]) continue;
    if (p.dy === undefined) alive.add(p.house);
    else lastDeath[p.house] = Math.max(lastDeath[p.house] ?? 0, p.dy);
  }
  for (const id of Object.keys(L.links)) if (s.characters[id]?.alive && L.links[id].house) alive.add(L.links[id].house!);
  for (const id of Object.keys(g.seeds)) {
    const h = L.houses[id];
    if (h.player || alive.has(id) || (h.headId && s.characters[h.headId]?.alive)) continue;
    if (lastDeath[id] === undefined) continue;
    h.extinct = lastDeath[id];
    L.events.push({ y: lastDeath[id], h: id, k: 'extinct', t: `The line of ${h.title} ended.` });
  }
}

/** Members of a crew house with the head's own record. */
function tagAnchors(g: G, seeds: HouseSeed[]): void {
  for (const sd of seeds) {
    if (!sd.anchor || !g.s.characters[sd.anchor]) continue;
    for (const hd of g.L.houses[sd.id].heads) if (g.s.characters[hd.id] && !g.L.links[hd.id]?.house && hd.id !== g.s.playerId) updLink(g.L, hd.id, { house: sd.id });
    if (sd.anchor !== g.s.playerId && !g.s.characters[sd.anchor].dynasty) updLink(g.L, sd.anchor, { house: sd.id });
  }
}

/** Generate the full history for a set of seeds into lineage `L` (used at the start and for new crew houses). */
export function generateHouses(s: GameState, L: LineageState, seeds: HouseSeed[]): void {
  if (s.lineage !== L) throw new Error('generateHouses: lineage must be the state\'s own');
  const g = newG(s, L);
  for (const sd of seeds) {
    g.seeds[sd.id] = sd;
    registerHouse(L, sd, g.now);
  }
  for (const sd of seeds) genHouse(g, sd);
  tagAnchors(g, seeds);
  for (const sd of seeds) if (sd.crewOf && s.characters[sd.crewOf]) syncHousehold(s, L, s.characters[sd.crewOf], g);
  matchBrides(g);
  attachMaidens(g);
  packCrossings(g);
  startingGrudges(g);
  memberTitles(g, seeds);
  markExtinct(g);
  L.events.sort((a, b) => a.y - b.y || (a.m ?? 0) - (b.m ?? 0));
  tidyLineage(L);
}

/** Build every house and its history (once per game; again after a start reshapes the family). */
export function initLineage(s: GameState): void {
  const L = blank(s);
  adoptLineage(s, L);
  generateHouses(s, L, buildSeeds(s));
  L.month = `${s.date.y}-${s.date.m}`;
}

/** Lineage events that mention a person. */
export function eventsAbout(L: LineageState, id: string): LEvent[] {
  return L.events.filter((e) => e.p === id || e.q === id);
}

export type { Grudge };
