import { ageOn } from './calendar';
import {
  addKidRef, birthYear, clean, fatherOf, houseOfBirth, isAlive, kidsOf, linMut, motherOf, PLAYER_HOUSE, spousesOf, updLink, updPerson,
  type LineageState, type LPerson,
} from './houses';
import { OUTSIDE_SURNAMES, STOCK_NAMES, type Stock } from './housesData';
import { famMut } from './familyState';
import { promote } from './housesLife';
import { FEMALE_FIRST, MALE_FIRST, SURNAMES } from './names';
import { addOpinion } from './relations';
import { pick, randInt } from './rng';
import type { Character, GameState, KinRole, Trait } from './types';

/**
 * The living extended family, as real Characters: for your house a matriarch
 * who still gives orders, uncles and aunts, cousins (a priest, a cop, one who
 * wants in), your wife's brother who wants in, godchildren from your crew's
 * families; for the rival houses a matriarch and a cousin. The women get
 * roles with their own goals: running the legitimate fronts, the church
 * committee, a widow's numbers book, advising, marrying strategically,
 * wanting power of their own.
 *
 * Cast once when the houses are built (deterministic, on the lineage dice),
 * from the generated trees: people who are already in a tree are promoted
 * (same id, every tie kept); missing relatives are added to the tree first.
 * Roles are tags on the Character (`kinRoles`) so events can cast them:
 * see `kinByRole` and `rolesOf`.
 */

export const KIN_ROLE_INFO: Record<KinRole, { label: string; text: string }> = {
  matriarch: { label: 'Matriarch', text: 'The old woman of the house. Sunday dinner is at her table, and she still gives orders.' },
  uncle: { label: 'Uncle', text: 'Your father\'s brother: old opinions and old friends.' },
  aunt: { label: 'Aunt', text: 'Your father\'s sister: she hears everything at the parish.' },
  cousin: { label: 'Cousin', text: 'Blood, one step removed.' },
  priest: { label: 'The priest', text: 'Wears the collar. Hears confessions, buries the dead, and knows more than he should.' },
  cop: { label: 'The cop', text: 'Carries a badge. Family first, or the job?' },
  wantsIn: { label: 'Wants in', text: 'Wants to be part of the family business.' },
  inlaw: { label: 'In-law', text: 'Family by marriage, on your wife\'s side.' },
  godchild: { label: 'Godchild', text: 'You stood at the font for this child. In this family, that is for life.' },
  front: { label: 'Runs a front', text: 'Runs one of the family\'s legitimate businesses, and the books behind it.' },
  church: { label: 'Church committee', text: 'Sits on the Rosary Society and the parish committee: the island\'s best intelligence network.' },
  numbers: { label: 'Numbers book', text: 'A widow who kept her late husband\'s numbers book, and kept it profitable.' },
  advisor: { label: 'Advises the boss', text: 'Her counsel is asked for, and sometimes given unasked.' },
  match: { label: 'Marrying well', text: 'Means to marry into a house that matters, on her own terms.' },
  power: { label: 'Wants power', text: 'Wants a say in the family\'s business, and power of her own.' },
};

/* ---------------------------------------------------------------- */
/* Queries (for events and content packs)                             */
/* ---------------------------------------------------------------- */

export function rolesOf(s: GameState, id: string): KinRole[] {
  return s.characters[id]?.kinRoles ?? [];
}

export function hasKinRole(s: GameState, id: string, role: KinRole): boolean {
  return rolesOf(s, id).includes(role);
}

/** Living Characters with a role, optionally of one house (default: any). `house: 'player'` means your house. */
export function kinByRole(s: GameState, role: KinRole, house?: string): Character[] {
  const want = house === 'player' ? PLAYER_HOUSE : house;
  const out: Character[] = [];
  for (const id in s.characters) {
    const c = s.characters[id];
    if (!c.alive || !c.kinRoles?.includes(role)) continue;
    if (want && houseOfBirth(s, id) !== want && !(want === PLAYER_HOUSE && c.dynasty)) continue;
    out.push(c);
  }
  return out;
}

/* ---------------------------------------------------------------- */
/* Casting                                                            */
/* ---------------------------------------------------------------- */

interface K {
  s: GameState;
  L: LineageState;
  now: number;
}

function tag(c: Character, ...roles: KinRole[]): void {
  const have = c.kinRoles ?? (c.kinRoles = []);
  for (const r of roles) if (!have.includes(r)) have.push(r);
}

function addTrait(k: K, c: Character, t: Trait): void {
  if (c.traits.includes(t)) return;
  if (c.traits.length >= 3) c.traits[c.traits.length - 1] = t;
  else c.traits.push(t);
  void k;
}

function story(k: K, c: Character, text: string): void {
  (c.story ??= []).push({ week: k.s.week, text });
}

function stockOf(k: K, hid: string | undefined): Stock | undefined {
  return hid ? (k.L.houses[hid]?.stock as Stock | undefined) : undefined;
}

function firstFor(k: K, g: 'M' | 'F', eth: Character['ethnicity'], stock?: Stock): string {
  const list = (stock && STOCK_NAMES[stock]?.[g]) || (g === 'M' ? MALE_FIRST[eth] : FEMALE_FIRST[eth]);
  return pick(k.L, list);
}

function mkP(k: K, p: Omit<LPerson, 'id'>): LPerson {
  const rec = clean({ id: `L${k.L.next++}`, ...p } as LPerson);
  k.L.people[rec.id] = rec;
  return rec;
}

function age(k: K, id: string): number {
  return k.now - (birthYear(k.s, id) ?? k.now);
}

function genderOf(k: K, id: string): 'M' | 'F' | undefined {
  return k.s.characters[id]?.gender ?? k.L.people[id]?.g;
}

/** A lineage person (or Character) as a Character, joining the right side. */
function bring(k: K, id: string, player: boolean, force = false): Character | undefined {
  const c = k.s.characters[id] ?? promote(k.s, k.L, id);
  if (!c || !c.alive) return undefined;
  if (player && !c.dynasty && (force || houseOfBirth(k.s, id) === PLAYER_HOUSE)) {
    c.dynasty = true;
    c.faction = 'player';
    // The dynasty layer keeps a record for every member of the house (as refreshDynastyAfterStart does).
    const p = famMut(k.s, c.id);
    const a = ageOn(c.birth, k.s.date);
    p.wed = true;
    p.christened = true;
    p.cameOfAge = a >= 16;
    p.childhood = a >= 11 ? 2 : a >= 7 ? 1 : 0;
  }
  return c;
}

/** A living child added to a couple's tree (when the tree has nobody to play the part). */
function addChild(k: K, f: string, m: string | undefined, sex: 'M' | 'F', by: number, house: string | undefined, last: string): LPerson | undefined {
  const fb = birthYear(k.s, f)!;
  const mb = m ? birthYear(k.s, m)! : fb;
  const lo = Math.max(fb + 20, mb + 18);
  const hi = Math.min(fb + 50, mb + 42, k.now);
  if (lo > hi) return undefined;
  by = Math.max(lo, Math.min(hi, by));
  const eth = k.s.characters[f]?.ethnicity ?? k.L.people[f]?.eth ?? 'Italian';
  const p = mkP(k, { first: firstFor(k, sex, eth, stockOf(k, house)), last, g: sex, eth, by, bm: randInt(k.L, 1, 12), house, f, m });
  addKidRef(k.s, k.L, f, p.id);
  if (m) addKidRef(k.s, k.L, m, p.id);
  return p;
}

/** A wife for a man who has none living in the tree. */
function wifeOf(k: K, man: string): string {
  const live = spousesOf(k.s, man).find((x) => genderOf(k, x) === 'F');
  if (live) return live;
  const eth = k.s.characters[man]?.ethnicity ?? k.L.people[man]?.eth ?? 'Italian';
  const by = (birthYear(k.s, man) ?? 1910) + randInt(k.L, 0, 5);
  const last = k.s.characters[man]?.lastName ?? k.L.people[man]?.last ?? '';
  const w = mkP(k, { first: firstFor(k, 'F', eth), last, maiden: pick(k.L, SURNAMES[eth]), g: 'F', eth, by, bm: randInt(k.L, 1, 12), sp: [man] });
  if (k.s.characters[man]) updLink(k.L, man, { sp: [...(k.L.links[man]?.sp ?? []), w.id] });
  else updPerson(k.L, man, { sp: [...(k.L.people[man]?.sp ?? []), w.id] });
  return w.id;
}

const living = (k: K, id: string) => isAlive(k.s, id);

/** Cast the extended family of one house around its head. `full` for your house. */
function castHouse(k: K, hid: string, headId: string, full: boolean): void {
  const { s, L } = k;
  const head = s.characters[headId];
  if (!head) return;
  const last = L.houses[hid]?.name ?? head.lastName;
  const f = fatherOf(s, headId);
  const m = motherOf(s, headId);
  const gf = f ? fatherOf(s, f) : undefined;
  const gm = f ? motherOf(s, f) : undefined;

  // The matriarch: his mother, else his grandmother, else an old aunt; the grandmother lives on if she must.
  // (A woman of your own house who married a rival's father is his mother, but she is not their matriarch: she is yours.)
  const free = (x: string) => full || !s.characters[x]?.dynasty;
  let mat = [m, gm].find((x) => x && living(k, x) && age(k, x) >= 50 && free(x));
  if (!mat && gf) mat = kidsOf(s, gf).find((x) => x !== f && genderOf(k, x) === 'F' && living(k, x) && age(k, x) >= 55 && free(x));
  // Nobody old enough alive: in this telling his mother (or grandmother) did not die after all.
  for (const x of [m, gm]) {
    if (mat || !x || s.characters[x] || !L.people[x] || L.people[x].killer || age(k, x) > 88 || age(k, x) < 50) continue;
    updPerson(L, x, { dy: undefined, dm: undefined, cause: undefined });
    mat = x;
  }
  const matC = mat ? bring(k, mat, full, true) : undefined;
  if (matC) {
    tag(matC, 'matriarch', 'advisor');
    addTrait(k, matC, full ? 'Pious' : 'Vengeful');
    matC.ambition = 'Keep the family together, and keep her boy in line';
    const rel = mat === m ? 'My son' : 'My grandson';
    addOpinion(s, matC.id, headId, rel, 30, 0);
    addOpinion(s, headId, matC.id, mat === m ? 'Mama' : 'Nonna', 30, 0);
    story(k, matC, 'Sunday dinner is at her table. The boss still comes when she calls.');
  }

  // Uncles and aunts: the father's brothers and sisters.
  const sibs = gf ? kidsOf(s, gf).filter((x) => x !== f && x !== mat && living(k, x) && age(k, x) >= 30) : [];
  if (full && gf && !sibs.some((x) => genderOf(k, x) === 'M')) {
    const u = addChild(k, gf, gm, 'M', (birthYear(s, f!) ?? 1900) + randInt(L, 2, 8), hid, last);
    if (u) sibs.push(u.id);
  }
  const uncles = sibs.sort((a, b) => (genderOf(k, a) === 'M' ? 0 : 1) - (genderOf(k, b) === 'M' ? 0 : 1)).slice(0, full ? 3 : 1);
  for (const id of uncles) {
    const c = bring(k, id, full);
    if (!c) continue;
    tag(c, c.gender === 'M' ? 'uncle' : 'aunt');
    if (c.rank === 'civilian') c.ambition = c.gender === 'M' ? 'Be consulted, as the elder of the blood' : 'Keep the family\'s name clean in the parish';
    addOpinion(s, c.id, headId, c.gender === 'M' ? 'My nephew, the boss' : 'My brother\'s boy', randInt(L, 5, 20), 0);
  }

  // Cousins: the uncles' and aunts' children. Your house: a priest, a cop, one who wants in.
  const parents = gf ? kidsOf(s, gf).filter((x) => x !== f) : [];
  let cousins = parents.flatMap((p) => kidsOf(s, p)).filter((x) => living(k, x) && age(k, x) >= 17 && x !== headId);
  if (full) {
    const men = () => cousins.filter((x) => genderOf(k, x) === 'M');
    const uncle = uncles.find((x) => genderOf(k, x) === 'M' && living(k, x));
    for (let i = 0; men().length < 3 && uncle && i < 3; i++) {
      const w = wifeOf(k, uncle);
      const c = addChild(k, uncle, w, 'M', (birthYear(s, uncle) ?? 1905) + 26 + i * 3, hid, last);
      if (c) cousins.push(c.id);
    }
    cousins = [...men().sort((a, b) => age(k, b) - age(k, a)), ...cousins.filter((x) => genderOf(k, x) === 'F')];
  }
  const picks = cousins.slice(0, full ? 4 : 1);
  const jobs: KinRole[] = full ? ['priest', 'cop', 'wantsIn'] : ['wantsIn'];
  for (const id of picks) {
    const c = bring(k, id, full);
    if (!c) continue;
    tag(c, 'cousin');
    const a = ageOn(c.birth, s.date);
    // A cousin already in a crew keeps his trade.
    const job = c.gender === 'M' && c.rank === 'civilian' ? jobs.find((j) => (j === 'priest' ? a >= 24 : j === 'cop' ? a >= 21 : a <= 34)) : undefined;
    if (!job) continue;
    jobs.splice(jobs.indexOf(job), 1);
    tag(c, job);
    if (job === 'priest') {
      addTrait(k, c, 'Pious');
      c.ambition = 'Save his cousin\'s soul, if it can be saved';
      updLink(L, c.id, { note: 'Became a priest' });
      story(k, c, 'Ordained at St. Charles Borromeo; curate at St. Ann\'s in Wildwood.');
    } else if (job === 'cop') {
      addTrait(k, c, 'Honest');
      c.ambition = 'Make sergeant without choosing between the badge and the family';
      story(k, c, 'Joined the Wildwood police after the Army.');
    } else {
      addTrait(k, c, 'Ambitious');
      c.ambition = `Get made in his cousin's family`;
      addOpinion(s, c.id, headId, 'Wants in with his cousin', 15, 0);
      story(k, c, 'Hangs around the social club, waiting to be asked.');
    }
  }

  // Your wife's side: her brother wants in.
  if (full && head.spouseId && s.characters[head.spouseId]?.alive) castInlaws(k, s.characters[head.spouseId], headId);
}

function castInlaws(k: K, wife: Character, headId: string): void {
  const { s, L } = k;
  const maiden = wife.maidenName ?? wife.lastName;
  let wf = fatherOf(s, wife.id);
  let wm = motherOf(s, wife.id);
  const stock = stockOf(k, houseOfBirth(s, wife.id));
  if (!wf) {
    const by = wife.birth.y - randInt(L, 26, 34);
    const fp = mkP(k, { first: firstFor(k, 'M', wife.ethnicity, stock), last: maiden, g: 'M', eth: wife.ethnicity, by, bm: randInt(L, 1, 12) });
    const mp = mkP(k, { first: firstFor(k, 'F', wife.ethnicity, stock), last: maiden, maiden: pick(L, (stock && OUTSIDE_SURNAMES[stock]) || SURNAMES[wife.ethnicity]), g: 'F', eth: wife.ethnicity, by: by + randInt(L, 1, 5), bm: randInt(L, 1, 12), sp: [fp.id] });
    updPerson(L, fp.id, { sp: [mp.id], dy: k.now - randInt(L, 2, 14), dm: randInt(L, 1, 12), cause: pick(L, ['a heart attack', 'a stroke', 'cancer']) });
    wf = fp.id;
    wm = mp.id;
    updLink(L, wife.id, { f: wf, m: wm });
    addKidRef(s, L, wf, wife.id);
    addKidRef(s, L, wm, wife.id);
  }
  let bro = kidsOf(s, wf).find((x) => x !== wife.id && genderOf(k, x) === 'M' && living(k, x) && age(k, x) >= 20 && age(k, x) <= 45);
  if (!bro) bro = addChild(k, wf, wm, 'M', wife.birth.y + randInt(L, 2, 7), houseOfBirth(s, wife.id), maiden)?.id;
  const c = bro ? bring(k, bro, false) : undefined;
  if (!c) return;
  tag(c, 'inlaw');
  addOpinion(s, c.id, headId, 'My sister\'s husband', 15, 0);
  if (c.rank === 'civilian') {
    tag(c, 'wantsIn');
    addTrait(k, c, 'Ambitious');
    c.ambition = 'Get in with his sister\'s husband';
  }
  addOpinion(s, wife.id, c.id, 'My brother', 25, 0);
  story(k, c, c.rank === 'civilian' ? `${wife.firstName}'s brother. Drives a cab and wants more.` : `${wife.firstName}'s brother.`);
}

/** Godchildren: the boss stood at the font for children of his crew. */
function castGodchildren(k: K): void {
  const { s, L } = k;
  let n = 0;
  for (const c of Object.values(s.characters)) {
    if (n >= 2) break;
    if (!c.alive || c.faction !== 'player' || c.dynasty || c.rank === 'civilian' || !c.household?.kids.length) continue;
    const kid = kidsOf(s, c.id).find((x) => !s.characters[x] && living(k, x) && age(k, x) >= 2 && age(k, x) <= 16);
    if (!kid) continue;
    const g = promote(s, L, kid);
    if (!g) continue;
    tag(g, 'godchild');
    g.traits = g.traits.filter((x) => !['Drinker', 'Womanizer', 'Gambler', 'Cruel'].includes(x));
    for (const t of ['Charming', 'Honest', 'Patient'] as Trait[]) if (g.traits.length < 2 && !g.traits.includes(t)) g.traits.push(t);
    g.ambition = `Make ${g.gender === 'M' ? 'his' : 'her'} godfather proud`;
    addOpinion(s, g.id, s.playerId, 'My godfather', 25, 0);
    addOpinion(s, c.id, s.playerId, `You stood for my ${g.gender === 'M' ? 'son' : 'daughter'} at the font`, 10, 0);
    story(k, g, `${c.firstName} ${c.lastName}'s ${g.gender === 'M' ? 'boy' : 'girl'}. The boss is godfather.`);
    n++;
  }
}

/** The women of the house get roles of their own. */
function castWomen(k: K, hid: string, headId: string, full: boolean): void {
  const { s } = k;
  const head = s.characters[headId];
  if (!head) return;
  const women = Object.values(s.characters).filter((c) => c.alive && c.gender === 'F' && ageOn(c.birth, s.date) >= 16 && c.id !== headId
    && (full ? c.dynasty : houseOfBirth(s, c.id) === hid || c.id === head.spouseId));
  const roles = (c: Character) => c.kinRoles ?? [];
  const give = (c: Character, r: KinRole, ambition: string, trait: Trait) => {
    tag(c, r);
    c.ambition = ambition;
    addTrait(k, c, trait);
  };
  const isDaughter = (c: Character) => c.fatherId === headId || c.motherId === headId;
  const isSister = (c: Character) => !!head.fatherId && c.fatherId === head.fatherId;
  for (const c of women) {
    const a = ageOn(c.birth, s.date);
    const widow = !!c.spouseId && !s.characters[c.spouseId]?.alive || (!c.spouseId && spousesOf(s, c.id).length > 0 && !spousesOf(s, c.id).some((x) => isAlive(s, x)));
    if (roles(c).includes('matriarch')) {
      if (full) give(c, 'church', c.ambition, 'Pious');
    } else if (c.id === head.spouseId) {
      give(c, full ? 'front' : 'advisor', full ? 'Run the bakery and the laundry straight, and keep the books that are not' : 'Keep her husband alive and the family respectable', 'Patient');
    } else if (roles(c).includes('aunt') && widow) {
      give(c, 'numbers', 'Keep her late husband\'s numbers book, and keep it hers', 'Greedy');
    } else if (isDaughter(c) && a <= 28 && !c.spouseId) {
      give(c, 'match', 'Marry into a house that matters, on her own terms', 'Charming');
    } else if (isSister(c)) {
      give(c, 'power', 'Have a say in the family business, not just a seat at Sunday dinner', 'Ambitious');
    } else if (roles(c).includes('aunt') || roles(c).includes('cousin')) {
      give(c, 'church', 'Run the Rosary Society, and know everything the parish knows', 'Pious');
    } else if (full && a >= 30) {
      give(c, 'advisor', 'Be heard when the family decides', 'Patient');
    }
  }
}

/** Cast the living extended families (called when the houses are built). */
export function castKin(s: GameState): void {
  if (!s.lineage) return;
  const k: K = { s, L: linMut(s), now: s.date.y };
  castHouse(k, PLAYER_HOUSE, s.playerId, true);
  castGodchildren(k);
  castWomen(k, PLAYER_HOUSE, s.playerId, true);
  for (const r of s.rivals) {
    if (r.id === 'law') continue;
    const hid = houseOfBirth(s, r.leaderId);
    if (!hid) continue;
    castHouse(k, hid, r.leaderId, false);
    castWomen(k, hid, r.leaderId, false);
  }
}
