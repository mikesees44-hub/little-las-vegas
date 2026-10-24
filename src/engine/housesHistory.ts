import { FEMALE_FIRST, MALE_FIRST, SURNAMES } from './names';
import { chance, hashSeed, pick, rand, randInt } from './rng';
import {
  addKidRef, adoptLineage, birthYear, deathPhrase, kidsOf, PLAYER_HOUSE, plural, updLink, updPerson,
  type Grudge, type HouseType, type LEvent, type LHouse, type LineageState, type LPerson,
} from './houses';
import {
  ACCIDENTS, ARRIVAL, CREST_COLORS, crimeCauses, EXTRA_HOUSES, FACTION_SEAT, HEAD_TITLES, infantCause, KNOWN_HOUSES, KOREA, LINE_OF_DUTY,
  MEMBER_TITLES, naturalCause, OFFICIAL_HOUSES, ORIGINS, OUTSIDE_SURNAMES, SEA_DEATHS, STOCK_ETH, STOCK_NAMES, stockFor, WW1, WW2,
  type ExtraHouseDef, type Stock,
} from './housesData';
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
    const duty = type === 'police' && sex === 'M' && a >= 21 && a <= 60 ? 0.0012 : 0;
    const sea = shore && sex === 'M' && a >= 14 ? 0.0006 : 0;
    const acc = sex === 'M' ? 0.0011 : 0.0004;
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
    if ((r -= duty) < 0) return out(pick(g.L, LINE_OF_DUTY));
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
  let first = firstName(g, sex, stock, eth);
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
  const minChain = anchorChar ? 2 : seed.head ? 3 : 2;
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
  // Around the line: the line's brothers and sisters, and their families.
  for (let i = chain.length - 1; i >= 1; i--) {
    const father = chain[i];
    const mother = P(g, father)!.sp![0];
    const line = chain[i - 1];
    const gen = chain.length - 1 - i;
    const kids = genKids(g, h, father, mother, [line]);
    for (const k of kids) {
      const kp = P(g, k.id)!;
      const span = (kp.dy ?? g.now) - kp.by;
      if (kp.g === 'M' && span >= 21 && !g.extinct.has(h.id)) genBranch(g, h, k.id, gen + 1);
      else if (kp.g === 'F' && span >= 18) g.brides.push(k.id);
    }
    const lastKid = [line, ...kids.map((k) => k.id)].reduce((a, k) => Math.max(a, byOf(g, k)), 0);
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
      : `${fname} came over from ${origin} and settled in ${seed.seat}.`;
  L.events.push({ y: E, h: h.id, k: 'founding', t, p: founder });

  // Heads of the house, founder down.
  const line = chain.slice().reverse();
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
  const political = politicalSource?.();
  const extra = EXTRA_HOUSES.filter((d) => !(political && d.pack));
  for (const d of extra) {
    out.push({
      id: d.id, name: d.name, type: d.type, seat: d.seat, stock: d.stock, head: d.head, blurb: d.blurb, faction: d.faction,
      extinct: d.head ? undefined : d.id === 'h_benedetto' ? { y: 1931, cause: 'killed in the Castellammarese troubles', killer: 'h_moretti' } : { y: 1949, cause: 'died in prison (Trenton State Prison)' },
    });
  }
  if (political) out.push(...political);
  for (const c of Object.values(s.characters)) {
    if (used.has(c.id) || !wantsCrewHouse(c)) continue;
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
  return { s, L, now: s.date.y, nowM: s.date.m, brides: [], slots: [], seeds: {}, extinct: new Set(), size: {}, created: [] };
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
  matchBrides(g);
  attachMaidens(g);
  startingGrudges(g);
  memberTitles(g, seeds);
  markExtinct(g);
  L.events.sort((a, b) => a.y - b.y || (a.m ?? 0) - (b.m ?? 0));
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
