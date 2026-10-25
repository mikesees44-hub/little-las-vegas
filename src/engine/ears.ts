import { ageOn, isInSeason } from './calendar';
import { buildPlantFound } from './crewEvents';
import {
  AGENCIES, BOUNDARY_SAYS, BREAKUP, CHARITIES, CLUBS, COUNTER_LINES, EAR_BIO, FAIL_LINES, GOALS, HINT_LINES, HINT_SETTINGS, HINT_TAILS,
  HINT_TITLES, HOTELS, JEALOUSY, LEAVING, MADAM_INTRO, MADAM_SQUEEZE, OPINION_LINES, OPINION_PLAIN, OP_BASES, OP_RACKETS, PREGNANT, PROTECT_OPEN,
  PROTECT_PLEA, PROTECTOR, REFUSE_LINES, REGULAR_LINES, REPORT_LINES, REPORT_OPEN, RIPE_LINES, VENUES, WIFE, WORK_PLACES,
} from './earsData';
import {
  BOUNDARY_TEXT, CUT_INFO, emptyStats, GOAL_TEXT, WORK_LABEL,
  type Boundary, type CutTier, type Ear, type EarGoal, type EarJob, type EarsAction, type EarsOp, type EarsState, type EarWork, type IntelKind,
  type JobMode, type Madam, type Operator, type PendingHook,
} from './earsState';
import { activeLinks, addLink, endLink, findLink, hiddenLinksOf, married, pruneLinks, ROMANTIC, webMonth } from './earsWeb';
import { registerEventSource } from './events';
import { heat, money, respect, type Ctx } from './ledger';
import { ctlOf, peekCtl } from './polGov';
import type { PolPerson } from './polState';
import { addOpinion, opinion } from './relations';
import { chance, hashSeed, rand, randInt, type RngHolder } from './rng';
import { freshness } from './storyDirector';
import { orientationFor } from './storyState';
import type { ActionPreview } from './actions';
import type { Character, Choice, Effect, EventInstance, GameState, RivalId, Trait } from './types';
import { FIRST_NAMES, ORIGIN_TO_GAME, SURNAMES, type Origin } from '../worldpack';
import { AMBITIONS, FEMALE_AMBITIONS } from './characters';
import { eraOf } from '../worldpack/generators';

/**
 * THE EARS: nightlife workers are the best spies, and the Madam is the
 * boss's friend, not his employee.
 *
 *  - She comes to you: a worker drops a hint in one line ("Funny, the
 *    Councilman tips like a man who just came into money..."). Pay to hear
 *    the rest, brush it off, or tell her to keep listening.
 *  - You ask her: "Can you get close to him?" / "Give him a dance". She says
 *    yes, no, or names her price, by her trust in you, her nerve, the risk,
 *    the money, her opinion of him and her own lines. A yes is a quiet job on
 *    the In Motion strip; she reports back; you pay to hear it all.
 *  - The intel is real: secrets and hooks (leverage over affairs and graft,
 *    never orientation), dirt on officials, rats in the crew, rival plots
 *    uncovered, help with the boss's case.
 *  - Protection: a woman may come to you to get away from an operator who
 *    exploits women. Helping her makes her a loyal Ear; she can leave
 *    whenever she likes. Taking the operators down wins the Madam and the
 *    whole network.
 *  - The Madam: her own house, money, lieutenants, successor and loyalties.
 *    Diplomacy only: her opinion, favors, the protection cut, intel sharing,
 *    joint ventures. She can throw in with a rival, or need help when she is
 *    squeezed.
 *
 * HARD RULES: non-explicit and off-screen (set-ups and reports only); every
 * woman is an adult and decides for herself; the player never coerces,
 * holds debts over, recruits by force or trades in people (operators do, and
 * they are enemies); people are never gifts; nobody here is real.
 */

/* ------------------------------------------------------------------ */
/* Setup                                                               */
/* ------------------------------------------------------------------ */

const ORIGINS: Origin[] = ['Italian', 'Italian', 'Irish', 'Irish', 'Jewish', 'Polish', 'Black', 'WASP', 'Greek', 'PuertoRican', 'German'];
const WOMAN_TRAITS: Trait[] = ['Charming', 'Patient', 'Ambitious', 'Greedy', 'Honest', 'Paranoid', 'Pious', 'Drinker', 'Gambler', 'Loyal-to-a-fault', 'Vengeful', 'Cowardly'];
const OP_TRAITS: Trait[] = ['Cruel', 'Greedy', 'Hot-headed', 'Paranoid', 'Vengeful', 'Charming'];
const WORKS: EarWork[] = ['dancer', 'dancer', 'dancer', 'hostess', 'hostess', 'callgirl', 'callgirl', 'waitress', 'cigarette'];
const EARN: Record<EarWork, number> = { dancer: 45, hostess: 55, callgirl: 90, waitress: 25, cigarette: 18 };
const GOAL_AT: Record<EarGoal, number> = { own_place: 7000, leave_life: 2600, marry: 99999, records: 3200, send_home: 99999, vegas: 3600, school: 2200 };

const pickH = <T,>(h: RngHolder, xs: readonly T[]): T => xs[Math.floor(rand(h) * xs.length)];

function mkPerson(s: GameState, E: EarsState, gender: 'M' | 'F', age: number, traits: Trait[], origin = pickH(E, ORIGINS)): Character {
  const born = s.date.y - age;
  const era = eraOf(born);
  const id = `c${s.nextId++}`;
  const firsts = FIRST_NAMES[origin]?.[gender]?.[era] ?? FIRST_NAMES.Italian[gender][era];
  const lasts = SURNAMES[origin] ?? SURNAMES.Italian;
  const at = () => randInt(E, 4, 14);
  const c: Character = {
    id, firstName: pickH(E, firsts), lastName: pickH(E, lasts), gender, ethnicity: ORIGIN_TO_GAME[origin],
    birth: { y: born, m: randInt(E, 1, 12), d: randInt(E, 1, 28) }, health: randInt(E, 80, 100), conditions: [],
    attributes: { leadership: at(), business: at(), diplomacy: at() + 2, intrigue: at() + 3, force: at() - 2, discipline: at() },
    traits, ambition: pickH(E, gender === 'M' ? AMBITIONS : FEMALE_AMBITIONS), rank: 'civilian', faction: 'none', wealth: randInt(E, 300, 2500), dynasty: false, childrenIds: [], alive: true,
  };
  // Never younger than asked (the birthday may not have come yet this year).
  if (ageOn(c.birth, s.date) < age) c.birth.y -= 1;
  c.orientation = orientationFor(s.seed, c.id);
  s.characters[c.id] = c;
  return c;
}

function traitsFor(E: EarsState, pool: readonly Trait[], n: number): Trait[] {
  const out: Trait[] = [];
  for (let i = 0; i < 6 && out.length < n; i++) {
    const t = pickH(E, pool);
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

function newEar(s: GameState, E: EarsState, c: Character, network: Ear['network'], used: Set<string>): Ear {
  const work = pickH(E, WORKS);
  const free = VENUES.filter((v) => !used.has(v));
  const venue = pickH(E, free.length ? free : VENUES);
  used.add(venue);
  const bounds: Boundary[] = [];
  const all: Boundary[] = ['no_dances', 'no_cops', 'no_married', 'no_rivals', 'no_rough', 'no_stars'];
  const n = rand(E) < 0.3 ? 0 : rand(E) < 0.7 ? 1 : 2;
  for (let i = 0; i < n; i++) {
    const b = pickH(E, all);
    if (!bounds.includes(b) && !(b === 'no_dances' && (work === 'waitress' || work === 'cigarette'))) bounds.push(b);
  }
  const goal = pickH(E, GOALS);
  c.ambition = GOAL_TEXT[goal];
  const ear: Ear = {
    id: c.id, work, venue, network, known: false, loyalty: randInt(E, 22, 52) + (network === 'madam' ? 6 : 0),
    nerve: randInt(E, 25, 90), discretion: randInt(E, 30, 90), charm: randInt(E, 40, 95), greed: Math.round((0.8 + rand(E) * 0.7) * 100) / 100,
    goal, boundaries: bounds, status: 'listening', brushed: 0, paid: 0, hints: 0, savings: randInt(E, 0, 900), since: s.week,
  };
  if (rand(E) < (network === 'independent' ? 0.35 : 0.18)) {
    const mobs = s.rivals.filter((r) => r.kind === 'mob' && r.id !== 'philly');
    if (mobs.length) ear.sellsTo = pickH(E, mobs).id;
  }
  if (c.traits.includes('Paranoid')) ear.nerve = Math.max(10, ear.nerve - 15);
  if (c.traits.includes('Greedy')) ear.greed = Math.min(1.6, ear.greed + 0.2);
  E.ears[c.id] = ear;
  return ear;
}

function newOperator(s: GameState, E: EarsState, arrives: number): Operator {
  const c = mkPerson(s, E, 'M', randInt(E, 32, 52), traitsFor(E, OP_TRAITS, 2).concat(['Cruel']).filter((v, i, a) => a.indexOf(v) === i).slice(0, 3));
  if (rand(E) < 0.6) c.nickname = pickH(E, ['the Landlord', 'Sugar', 'the Bookkeeper', 'Smiles', 'the Agent', 'Mister Nice']);
  const op: Operator = { id: c.id, racket: pickH(E, OP_RACKETS), base: pickH(E, OP_BASES), strength: 30, exposure: 0, stage: arrives <= s.week ? 'active' : 'waiting', arrives };
  E.ops[c.id] = op;
  return op;
}

/** Builds the night: the Madam and her house, her lieutenants, the Ears, the operators, a first web of attachments. */
export function initEars(s: GameState): EarsState {
  if (s.ears) return s.ears;
  const E: EarsState = {
    rng: hashSeed(`${s.seed}:ears`), madam: undefined as unknown as Madam, ears: {}, ops: {}, links: [], jobs: [], held: [], hooks: [], used: {},
    lastHint: 0, lastHook: 0, lastMadam: 0, lastProtect: 0, notes: [], stats: emptyStats(),
  };
  s.ears = E;
  const origin = pickH(E, ['Italian', 'Irish', 'Jewish', 'Greek', 'WASP'] as Origin[]);
  const m = mkPerson(s, E, 'F', randInt(E, 44, 56), ['Patient', 'Charming', pickH(E, ['Ambitious', 'Greedy', 'Vengeful', 'Pious'] as Trait[])], origin);
  m.wealth = randInt(E, 60, 140) * 1000;
  m.attributes.intrigue = Math.max(m.attributes.intrigue, 15);
  m.attributes.diplomacy = Math.max(m.attributes.diplomacy, 14);
  m.attributes.business = Math.max(m.attributes.business, 13);
  m.ambition = 'Keep the house, keep the girls safe, and keep the city fathers grateful';
  if (rand(E) < 0.5) m.nickname = pickH(E, ['the Duchess', 'the Countess', 'Boss Lady', 'Queenie']);
  const lts = [0, 1].map(() => mkPerson(s, E, 'F', randInt(E, 30, 44), traitsFor(E, WOMAN_TRAITS, 2)));
  for (const l of lts) l.ambition = 'Run the house one day';
  E.madam = {
    id: m.id, house: `the ${m.lastName} house`, hotel: pickH(E, HOTELS), club: pickH(E, CLUBS), agency: pickH(E, AGENCIES), charity: pickH(E, CHARITIES),
    lieutenants: lts.map((x) => x.id), successorId: lts[0].id, money: m.wealth, network: randInt(E, 45, 65), cut: 1, intel: false, favors: 0, since: s.week, past: [],
  };
  addOpinion(s, m.id, s.playerId, 'Old friends from the boardwalk', 12, 0);
  for (const l of lts) addOpinion(s, l.id, s.playerId, 'The Madam\'s friend', 6, 0);
  const used = new Set<string>();
  for (let i = 0; i < 9; i++) {
    const c = mkPerson(s, E, 'F', randInt(E, 21, 34), traitsFor(E, WOMAN_TRAITS, 2));
    newEar(s, E, c, i < 6 ? 'madam' : 'independent', used);
  }
  const first = newOperator(s, E, s.week);
  newOperator(s, E, s.week + randInt(E, 55, 110));
  // A couple of independents live under the first operator's thumb.
  for (const e of Object.values(E.ears).filter((x) => x.network === 'independent').slice(0, 2)) e.underOp = first.id;
  // The first web: a few men already sweet on somebody.
  for (let i = 0; i < 6; i++) webMonth(s, E, E, () => {});
  return E;
}

/** The state, created for older saves on first use. */
export function ensureEars(s: GameState): EarsState {
  return s.ears ?? initEars(s);
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

const $ = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const r50 = (n: number) => Math.max(50, Math.round(n / 50) * 50);
const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

function fill(t: string, k: Record<string, string>): string {
  return t.replace(/\{(\w+)\}/g, (m, key) => k[key] ?? m);
}

/** A fresh index from a pool, never the same until the pool is used up (per game). */
function fresh(E: EarsState, key: string, n: number, h: RngHolder): number {
  const used = (E.used[key] ??= []);
  const free = Array.from({ length: n }, (_, i) => i).filter((i) => !used.includes(i));
  const i = free.length ? free[Math.floor(rand(h) * free.length)] : Math.floor(rand(h) * n);
  used.push(i);
  if (used.length >= n) used.splice(0, used.length - Math.max(0, Math.floor(n / 3)));
  return i;
}

function line(E: EarsState, key: string, pool: readonly string[], h: RngHolder, k: Record<string, string> = {}): string {
  return fill(pool[fresh(E, key, pool.length, h)], k);
}

export function callName(c: Character | undefined): string {
  if (!c) return '?';
  return c.nickname ? `${c.firstName} "${c.nickname}" ${c.lastName}` : `${c.firstName} ${c.lastName}`;
}

function short(c: Character | undefined): string {
  return c ? `${c.firstName} ${c.lastName}` : '?';
}

export function polOf(s: GameState, c: Character): PolPerson | undefined {
  for (const p of Object.values(s.pol?.people ?? {})) if (p.charId === c.id) return p;
  return undefined;
}

export function isLaw(c: Character): boolean {
  return c.faction === 'law' || /police|cop|sergeant|detective|prosecutor|judge|sheriff|trooper|agent|chief/i.test(c.office ?? '');
}

export function isRivalMob(s: GameState, c: Character): RivalId | undefined {
  const r = s.rivals.find((x) => x.id === c.faction && x.kind === 'mob');
  return r?.id;
}

function isStar(s: GameState, c: Character): boolean {
  return polOf(s, c)?.inst === 'showbiz';
}

/** What a man is, in a few words (for the hint lines). */
function title(s: GameState, c: Character): string {
  if (c.office) return `${c.office} ${c.lastName}`;
  const r = isRivalMob(s, c);
  if (r) return `${c.firstName} ${c.lastName}`;
  return short(c);
}

function importance(s: GameState, c: Character): number {
  if (s.rivals.some((r) => r.leaderId === c.id)) return 2.2;
  if (c.rank === 'underboss') return 1.7;
  if (c.rank === 'consigliere') return 1.6;
  if (c.rank === 'capo') return 1.4;
  if (c.office || isLaw(c)) return 1.5;
  return 1;
}

function note(s: GameState, E: EarsState, text: string): void {
  E.notes.push([s.week, text]);
  if (E.notes.length > 30) E.notes.shift();
}

function ev(s: GameState, defId: string, title0: string, text: string, choices: Choice[], actors: string[], priority: number, meta: Record<string, string | number> = {}, mandatory = false): EventInstance {
  return { iid: `ev${s.nextId++}`, defId, title: title0, text, week: s.week, choices, defaultChoiceId: choices[choices.length - 1].id, mandatory, priority, actors: actors.filter(Boolean).slice(0, 3), meta };
}

const X = (op: EarsOp, label: string): Effect => ({ type: 'ears', op, label }) as Effect;

export function earOf(s: GameState, id: string): Ear | undefined {
  return s.ears?.ears[id];
}

export function knownEars(s: GameState): Ear[] {
  return Object.values(s.ears?.ears ?? {}).filter((e) => e.known && e.status !== 'gone' && s.characters[e.id]?.alive);
}

export function madamOf(s: GameState): Character | undefined {
  const id = s.ears?.madam.id;
  return id ? s.characters[id] : undefined;
}

export function madamOpinion(s: GameState): number {
  const m = madamOf(s);
  return m ? opinion(s, m.id, s.playerId) : 0;
}

/* ------------------------------------------------------------------ */
/* Intel: what she can learn, and what it does                         */
/* ------------------------------------------------------------------ */

function leakingLink(_s: GameState, E: EarsState, man: Character) {
  return activeLinks(E).find((l) => l.a === man.id && ROMANTIC.includes(l.type) && !!E.ears[l.b]?.sellsTo);
}

/** What there is to learn about him, weighted. */
export function intelFor(s: GameState, E: EarsState, t: Character): [IntelKind, number][] {
  const out: [IntelKind, number][] = [];
  const unknownSecret = (kind: string) => s.secrets.some((x) => x.ownerId === t.id && x.kind === kind && !x.knownBy.includes('player'));
  if (t.faction === 'player' && t.informantFor) out.push(['rat', 6]);
  if (E.ops[t.id]?.stage === 'active') out.push(['operator', 6]);
  if (t.faction === 'player' && leakingLink(s, E, t)) out.push(['leak', 5]);
  if (t.office || polOf(s, t)) out.push(['graft', 3]);
  if (unknownSecret('affair') || activeLinks(E).some((l) => l.a === t.id && l.hidden && l.type === 'mistress') || (married(s, t) && t.traits.includes('Womanizer'))) out.push(['affair', 3]);
  if (t.faction === 'player' && t.rank === 'capo' && (t.skimmed ?? 0) >= 300) out.push(['skim', 4]);
  if (isRivalMob(s, t)) out.push(['plans', 4]);
  if (isLaw(t)) out.push(['case', s.legal && s.legal.stage !== 'quiet' ? 5 : 2]);
  if (unknownSecret('debt') || (t.vices ?? []).some((v) => v === 'debt' || v === 'horses' || v === 'cards') || !!t.debtTo) out.push(['debt', 2]);
  if (hiddenLinksOf(E, t.id).length) out.push(['link', 2]);
  if (!out.length) out.push(['nothing', 1]);
  return out;
}

function weighted<T>(h: RngHolder, xs: [T, number][]): T | undefined {
  const tot = xs.reduce((a, [, w]) => a + w, 0);
  if (tot <= 0) return undefined;
  let r = rand(h) * tot;
  for (const [x, w] of xs) {
    if (r < w) return x;
    r -= w;
  }
  return xs[xs.length - 1][0];
}

/** The effects a piece of intel has (shown as chips before you pay). */
export function intelEffects(s: GameState, earId: string, kind: IntelKind, t: Character, strong: boolean, label: string): Effect[] {
  const out: Effect[] = [];
  const legalOn = !!s.legal && s.legal.stage !== 'quiet' && s.legal.personId === s.playerId;
  switch (kind) {
    case 'graft':
      out.push({ type: 'hook', targetId: t.id, strong, reason: `${t.firstName} takes money he shouldn't (an Ear heard it)`, label });
      break;
    case 'affair':
      out.push({ type: 'storyOp', op: { op: 'secret', charId: t.id, kind: 'affair', knownBy: ['player'] }, label });
      out.push({ type: 'hook', targetId: t.id, strong, reason: `${t.firstName}'s affair`, label });
      break;
    case 'rat':
      out.push({ type: 'storyOp', op: { op: 'secret', charId: t.id, kind: 'informant', knownBy: ['player'] }, label });
      break;
    case 'skim':
      out.push({ type: 'storyOp', op: { op: 'secret', charId: t.id, kind: 'skimming', knownBy: ['player'] }, label });
      break;
    case 'plans':
      if (strong) out.push({ type: 'hook', targetId: t.id, strong: false, reason: `${t.firstName} talked out of school`, label });
      break;
    case 'case':
      if (legalOn) out.push({ type: 'legal', op: 'defense', amount: strong ? 8 : 5, label }, { type: 'legal', op: 'evidence', amount: strong ? -5 : -3, label });
      else out.push({ type: 'heat', bar: 'local', amount: strong ? -4 : -2, label });
      break;
    case 'debt':
      out.push({ type: 'storyOp', op: { op: 'secret', charId: t.id, kind: 'debt', knownBy: ['player'] }, label });
      if (strong) out.push({ type: 'hook', targetId: t.id, strong: false, reason: `${t.firstName}'s markers`, label });
      break;
    default:
      break;
  }
  if (kind !== 'nothing') out.push(X({ op: 'intel', earId, kind, targetId: t.id, strong }, label));
  return out;
}

const GRAFT_DIRT = [
  'He is on a paving contractor\'s payroll and the city\'s at the same time',
  'He took an envelope for a zoning vote, and an Ear knows the night and the amount',
  'A boat he could not afford, paid for by a friend with a permit',
];

function applyIntel(ctx: Ctx, E: EarsState, kind: IntelKind, t: Character, strong: boolean): void {
  const s = ctx.s;
  E.stats.intel[kind] = (E.stats.intel[kind] ?? 0) + 1;
  if (kind !== 'nothing') E.stats.hooks += kind === 'graft' || kind === 'affair' ? 1 : 0;
  // Whatever she heard about him, she also knows whom he is attached to.
  for (const l of hiddenLinksOf(E, t.id)) if (kind === 'affair' || kind === 'link' || kind === 'leak' || strong) l.hidden = false;
  switch (kind) {
    case 'graft':
    case 'affair': {
      const p = polOf(s, t);
      if (p) {
        const c = ctlOf(s, p.id);
        if (!c.dirt) c.dirt = kind === 'affair' ? 'An affair his wife does not know about, with dates and an address' : GRAFT_DIRT[(s.week + t.id.length) % GRAFT_DIRT.length];
      }
      ctx.log.push(`An Ear's word on ${short(t)}: ${kind === 'affair' ? 'an affair' : 'graft'}. You can lean on him now.`);
      break;
    }
    case 'rat':
      if (t.faction === 'player' && t.informantFor && t.alive) s.eventQueue.push(buildPlantFound(s, t));
      break;
    case 'skim':
      ctx.log.push(`${short(t)} keeps two counts. Now you know.`);
      break;
    case 'plans': {
      const rv = t.faction;
      let n = 0;
      for (const sc of s.schemes) if (sc.owner === rv && !sc.discovered) { sc.discovered = true; n++; }
      const r = s.rivals.find((x) => x.id === rv);
      if (r) r.exposure = clamp(r.exposure + (strong ? 6 : 3));
      ctx.log.push(n ? `${r?.shortName ?? 'A rival'}: ${n} plot${n > 1 ? 's' : ''} uncovered through an Ear.` : `${r?.shortName ?? 'A rival'}'s talk is in your hands now: where they are thin, who drinks.`);
      break;
    }
    case 'operator': {
      const op = E.ops[t.id];
      if (op) op.exposure = clamp(op.exposure + (strong ? 30 : 20));
      break;
    }
    case 'leak': {
      const l = leakingLink(s, E, t);
      if (l) {
        l.hidden = false;
        ctx.log.push(`${t.firstName}'s girl sells what he tells her. Now you know where your news has been going.`);
      }
      break;
    }
    default:
      break;
  }
}

/* ------------------------------------------------------------------ */
/* Asking her: "Can you get close to him?" / "Give him a dance"        */
/* ------------------------------------------------------------------ */

/** Her lines she will not cross for this man, if any. */
export function boundaryHit(s: GameState, ear: Ear, t: Character, mode: JobMode): Boundary | undefined {
  for (const b of ear.boundaries) {
    if (b === 'no_dances' && mode === 'dance') return b;
    if (b === 'no_cops' && isLaw(t)) return b;
    if (b === 'no_married' && married(s, t)) return b;
    if (b === 'no_rivals' && isRivalMob(s, t)) return b;
    if (b === 'no_rough' && (t.traits.includes('Cruel') || t.traits.includes('Hot-headed'))) return b;
    if (b === 'no_stars' && isStar(s, t)) return b;
  }
  return undefined;
}

export function jobPrice(s: GameState, ear: Ear, t: Character, mode: JobMode, generous = false): number {
  const base = mode === 'close' ? 520 : 160;
  return r50(base * importance(s, t) * ear.greed * (generous ? 1.5 : 1));
}

function riskOf(s: GameState, t: Character): number {
  return 15 + (isRivalMob(s, t) ? 25 : 0) + (t.traits.includes('Paranoid') ? 15 : 0) + (isLaw(t) ? 20 : 0) + (t.traits.includes('Cruel') ? 15 : 0) + (s.rivals.some((r) => r.leaderId === t.id) ? 15 : 0);
}

/** Will she do it? The odds and every reason. */
export function askOdds(s: GameState, ear: Ear, t: Character, mode: JobMode, generous = false): { chance: number; reasons: { label: string; value: number }[] } {
  const M = s.ears!.madam;
  const mOp = madamOpinion(s);
  const risk = riskOf(s, t) - (mode === 'dance' ? 10 : 0);
  const reasons = [
    { label: 'Base', value: 40 },
    { label: 'Her trust in you', value: Math.round((ear.loyalty - 50) / 2) },
    { label: 'Her nerve against the risk', value: Math.round((ear.nerve - risk) / 3) },
    { label: generous ? 'Your price: generous' : 'Your price: fair', value: generous ? 15 : 0 },
    { label: 'Her opinion of him', value: t.traits.includes('Cruel') ? -15 : t.traits.includes('Hot-headed') ? -6 : t.traits.includes('Charming') ? 5 : 0 },
    { label: 'Her goal (she needs the money)', value: generous && ['own_place', 'school', 'send_home', 'vegas'].includes(ear.goal) ? 6 : 0 },
    { label: 'You protect her', value: ear.protectedFrom ? 12 : 0 },
    { label: 'The Madam\'s word', value: ear.network !== 'madam' ? 0 : M.ally && M.ally === t.faction ? -25 : mOp >= 20 ? 10 : mOp <= -10 ? -15 : 0 },
    { label: 'Brushed her off lately', value: -6 * Math.min(3, ear.brushed) },
  ].filter((r) => r.value !== 0 || r.label === 'Base');
  const sum = reasons.reduce((a, r) => a + r.value, 0);
  return { chance: Math.max(0.05, Math.min(0.95, sum / 100)), reasons };
}

/** Once she is there: the odds she comes back with something. */
export function successOdds(_s: GameState, ear: Ear, t: Character, mode: JobMode): number {
  const p = 0.5 + (ear.discretion + ear.charm) / 400 - t.attributes.intrigue / 60 - (t.traits.includes('Paranoid') ? 0.15 : 0) + (t.traits.includes('Drinker') ? 0.1 : 0) - (mode === 'dance' ? 0.08 : 0);
  return Math.max(0.15, Math.min(0.92, p));
}

/** Who she is to the boss, in one line (tooltips). */
export function earLine(s: GameState, ear: Ear): string {
  const c = s.characters[ear.id];
  return `${c ? c.firstName : 'She'} ${WORK_PLACES[ear.work]} ${ear.venue}${ear.network === 'madam' ? ', one of the Madam\'s' : ', on her own'}`;
}

/* ------------------------------------------------------------------ */
/* Orders                                                              */
/* ------------------------------------------------------------------ */

export const EARS_PURPOSE: Record<string, string> = {
  ask: 'Put an Ear next to a man: she hears what he says when he thinks nobody is listening. She decides; she names her price.',
  retain: 'An envelope with no strings: she trusts you more, and her news comes to you first.',
  protect: 'Stand between her and the man who leans on her: she becomes loyal, and free to go.',
  madamCall: 'Keep the friendship warm: the Madam is an ally, not an employee.',
  madamCut: 'The cut she pays for protection: more money, or more goodwill.',
  madamIntel: 'Share what you hear, and her whole network listens for you.',
  madamVenture: 'Go into business with her: a steady line in the books, and a partner who cares if you fall.',
  madamFavor: 'Call in a favor: her best girl looks at a man for you, free.',
  opDig: 'Have the Ears gather what this man does to the women around him: names, rooms, dates.',
  opRunoff: 'Run him off the island your way: quick, and noticed.',
  opExpose: 'Hand the proof to the state police and a reporter: he goes away, and the town thanks you.',
  opMadam: 'Take him down with the Madam: her girls, your muscle. She will remember it.',
};

const VENTURE_STAKE = 5000;

function motelOwned(s: GameState): boolean {
  return s.businesses.some((b) => b.owner === 'player' && b.kind === 'motel');
}

/** Every order of the Ears layer previews as named chips with odds and reasons. */
export function previewEars(s: GameState, a: EarsAction): ActionPreview {
  const E = s.ears;
  const no = (title0: string, why: string): ActionPreview => ({ title: title0, effects: [], cost: 0, because: '', disabledReason: why, category: 'event' });
  if (!E) return no('The night', 'The night has not opened yet');
  const M = E.madam;
  const mc = s.characters[M.id];
  const mName = mc ? callName(mc) : 'The Madam';
  const mLabel = `The Madam: ${mc?.firstName ?? ''} ${mc?.lastName ?? ''}`.trim();
  switch (a.op) {
    case 'ask': {
      const ear = E.ears[a.earId];
      const c = s.characters[a.earId];
      const t = s.characters[a.targetId];
      const verb = a.mode === 'close' ? 'Can you get close to him?' : 'Give him a dance';
      const title0 = `${c?.firstName ?? '?'}: "${a.mode === 'close' ? `Can you get close to ${t?.firstName ?? 'him'}?` : `Give ${t?.firstName ?? 'him'} a dance${ear?.work === 'callgirl' || ear?.work === 'hostess' ? ', some VIP time' : ''}.`}"`;
      if (!ear || !c?.alive || ear.status === 'gone') return no(verb, 'She is gone');
      if (!ear.known) return no(verb, 'You don\'t know she listens yet');
      if (!t?.alive || t.gender !== 'M' || ageOn(t.birth, s.date) < 21) return no(verb, 'Not someone she can sit with');
      if (t.id === s.playerId) return no(verb, 'Not you');
      if (t.dynasty && t.faction === 'player') return no(verb, 'Not your own blood');
      if (E.ears[t.id]) return no(verb, 'Not one of the Ears');
      if (ear.status === 'working') return no(title0, 'She is already working someone for you');
      if (E.jobs.some((j) => j.targetId === t.id)) return no(title0, 'Someone is already next to him');
      if (a.mode === 'dance' && (ear.work === 'waitress' || ear.work === 'cigarette')) return no(title0, `She ${ear.work === 'waitress' ? 'waits tables' : 'sells cigarettes'}: she listens, she doesn't dance`);
      const hit = boundaryHit(s, ear, t, a.mode);
      if (hit) return no(title0, `She says no: ${BOUNDARY_SAYS[hit][(s.week + c.id.length) % BOUNDARY_SAYS[hit].length]} (${BOUNDARY_TEXT[hit]})`);
      const price = jobPrice(s, ear, t, a.mode, a.generous);
      const half = r50(price / 2);
      const label = `${c.firstName} and ${t.firstName}`;
      const acc = askOdds(s, ear, t, a.mode, a.generous);
      return {
        title: title0 + (a.generous ? ' (generous)' : ''),
        detail: `${earLine(s, ear)}. ${a.mode === 'close' ? 'A few weeks, quietly; she reports back' : 'One night; she tells you what she heard and what she thinks of him'}. Her price: ${$(price)}, half now and half when she reports. Nothing is shown; she decides.`,
        effects: [{ type: 'money', amount: -half, label: `${label}: half up front` }, X({ op: 'job', earId: c.id, targetId: t.id, mode: a.mode, price }, label)],
        refuseEffects: [X({ op: 'refused', earId: c.id, targetId: t.id, mode: a.mode, price, chance: acc.chance }, label)],
        acceptance: acc,
        odds: { chance: successOdds(s, ear, t, a.mode), reasons: [{ label: 'Her discretion and charm against his guard', value: Math.round(successOdds(s, ear, t, a.mode) * 100) }] },
        cost: half, because: `asked ${c.firstName} to ${a.mode === 'close' ? 'get close to' : 'give a dance to'} ${t.firstName} ${t.lastName}`, category: 'event',
        disabledReason: s.money < half ? `Needs ${$(half)}` : undefined,
      };
    }
    case 'retain': {
      const ear = E.ears[a.earId];
      const c = s.characters[a.earId];
      const label = `An envelope for ${c?.firstName ?? '?'}`;
      const amt = 300;
      return {
        title: `Take care of ${c?.firstName ?? '?'} (no strings)`, detail: 'An envelope, a cab account, a word with the bartender. She trusts you more.',
        effects: c ? [{ type: 'money', amount: -amt, label }, X({ op: 'retain', earId: c.id }, label)] : [], cost: amt, because: `took care of ${c?.firstName ?? 'an Ear'}`, category: 'event',
        disabledReason: !ear || !c?.alive || ear.status === 'gone' ? 'She is gone' : !ear.known ? 'You don\'t know her yet' : ear.lastGift !== undefined && s.week - ear.lastGift < 8 ? 'You took care of her recently' : s.money < amt ? `Needs ${$(amt)}` : undefined,
      };
    }
    case 'protect': {
      const ear = E.ears[a.earId];
      const c = s.characters[a.earId];
      const op = ear?.underOp ? E.ops[ear.underOp] : undefined;
      const oc = op ? s.characters[op.id] : undefined;
      const label = `Protection: ${c?.firstName ?? '?'}`;
      return {
        title: `Put ${c?.firstName ?? '?'} under your protection`, detail: oc ? `${callName(oc)} ${op!.racket}. A room somewhere he doesn't know, a man outside the door. She is free to go whenever she likes.` : 'Nobody is leaning on her.',
        effects: c && op ? [{ type: 'money', amount: -600, label }, X({ op: 'protect', earId: c.id, opId: op.id }, label), { type: 'respect', amount: 1, label }] : [], cost: 600,
        because: `put ${c?.firstName ?? 'a woman'} under your protection`, category: 'event',
        disabledReason: !ear || ear.status === 'gone' ? 'She is gone' : !op || op.stage !== 'active' ? 'Nobody is leaning on her' : ear.protectedFrom ? 'She is already under your protection' : s.money < 600 ? 'Needs $600' : undefined,
      };
    }
    case 'madamCall': {
      const label = `${mLabel}: an hour of your time`;
      return {
        title: `Pay your respects to ${mName}`, detail: `Flowers for ${M.charity}, a table at ${M.club}, an hour of your time. She is a friend; friends are kept.`,
        effects: [{ type: 'money', amount: -400, label }, { type: 'opinion', from: M.id, to: s.playerId, amount: 8, reason: 'He keeps the friendship', decay: 1, label }, X({ op: 'madam', field: 'call' }, label)],
        cost: 400, because: `paid your respects to ${mc?.firstName ?? 'the Madam'}`, category: 'event',
        disabledReason: !mc?.alive ? 'There is no Madam right now' : M.lastCall !== undefined && s.week - M.lastCall < 6 ? 'You saw her recently' : s.money < 400 ? 'Needs $400' : undefined,
      };
    }
    case 'madamCut': {
      const up = a.tier > M.cut;
      const label = `${mLabel}: the cut`;
      const op0 = madamOpinion(s);
      const reasons = [
        { label: 'Base', value: 50 },
        { label: 'Her opinion of you', value: Math.round(op0 / 2) },
        { label: up ? 'You want more' : 'You ask for less', value: up ? -15 * (a.tier - M.cut) : 30 },
        { label: 'She has thrown in with a rival', value: M.ally ? -25 : 0 },
      ].filter((r) => r.value !== 0 || r.label === 'Base');
      const sum = reasons.reduce((x, r) => x + r.value, 0);
      return {
        title: `${CUT_INFO[a.tier].name} from ${mc?.firstName ?? 'the Madam'} (${$(CUT_INFO[a.tier].weekly)}/wk)`,
        detail: up ? 'Protection is worth something. She will pay, and she will remember the price.' : 'A friend who asks for less is a friend she keeps.',
        effects: [X({ op: 'madam', field: 'cut', value: a.tier }, label), { type: 'opinion', from: M.id, to: s.playerId, amount: up ? -5 * (a.tier - M.cut) : 6 * (M.cut - a.tier), reason: up ? 'Raised my cut' : 'Eased my cut', decay: 1, label }],
        refuseEffects: [{ type: 'opinion', from: M.id, to: s.playerId, amount: -3, reason: 'Pushed me on the cut', decay: 1, label }],
        acceptance: up ? { chance: Math.max(0.05, Math.min(0.95, sum / 100)), reasons } : undefined,
        cost: 0, because: `${up ? 'raised' : 'eased'} the Madam's cut`, category: 'event',
        disabledReason: !mc?.alive ? 'There is no Madam right now' : a.tier === M.cut ? 'That is the cut now' : undefined,
      };
    }
    case 'madamIntel': {
      const label = `${mLabel}: what we hear`;
      const op0 = madamOpinion(s);
      const reasons = [{ label: 'Base', value: 45 }, { label: 'Her opinion of you', value: Math.round(op0 / 2) }, { label: 'She has thrown in with a rival', value: M.ally ? -30 : 0 }].filter((r) => r.value !== 0 || r.label === 'Base');
      const sum = reasons.reduce((x, r) => x + r.value, 0);
      return {
        title: a.on ? `Share what you hear with ${mc?.firstName ?? 'the Madam'}` : `Stop trading news with ${mc?.firstName ?? 'the Madam'}`,
        detail: a.on ? 'Her girls listen for you more often, and their price comes down. In return, she hears what you hear: friends share.' : 'You keep your news to yourself again.',
        effects: [X({ op: 'madam', field: 'intel', value: a.on ? 1 : 0 }, label), ...(a.on ? [] : [{ type: 'opinion', from: M.id, to: s.playerId, amount: -6, reason: 'Stopped sharing', decay: 1, label } as Effect])],
        acceptance: a.on ? { chance: Math.max(0.05, Math.min(0.95, sum / 100)), reasons } : undefined,
        refuseEffects: [], cost: 0, because: a.on ? 'agreed to share what you hear with the Madam' : 'stopped trading news with the Madam', category: 'event',
        disabledReason: !mc?.alive ? 'There is no Madam right now' : M.intel === a.on ? (a.on ? 'You already share' : 'You do not share') : undefined,
      };
    }
    case 'madamVenture': {
      const label = `${mLabel}: a venture`;
      const op0 = madamOpinion(s);
      const reasons = [{ label: 'Base', value: 40 }, { label: 'Her opinion of you', value: Math.round(op0 / 2) }, { label: 'She has thrown in with a rival', value: M.ally ? -30 : 0 }].filter((r) => r.value !== 0 || r.label === 'Base');
      const sum = reasons.reduce((x, r) => x + r.value, 0);
      const stake = a.kind === 'stake' ? VENTURE_STAKE : 0;
      return {
        title: a.kind === 'stake' ? `Go in with her on ${M.hotel} (${$(VENTURE_STAKE)})` : 'Let her network work your motel, under a deal',
        detail: a.kind === 'stake' ? `New carpet, a new sign, a lounge singer. About ${$(Math.round(VENTURE_STAKE * 0.022))} a week back to you, and a partner.` : 'Her people, her rules, her girls decide everything; you get a line in the books and the vice squad\'s curiosity. The family owns nothing but the building.',
        effects: [...(stake ? [{ type: 'money', amount: -stake, label } as Effect] : []), X({ op: 'madam', field: 'venture', kind: a.kind }, label), { type: 'opinion', from: M.id, to: s.playerId, amount: 6, reason: 'Partners', decay: 0, label }],
        acceptance: { chance: Math.max(0.05, Math.min(0.95, sum / 100)), reasons }, refuseEffects: [],
        cost: stake, because: a.kind === 'stake' ? 'went into business with the Madam' : 'let the Madam\'s network work your motel', category: 'event',
        disabledReason: !mc?.alive ? 'There is no Madam right now' : M.venture ? 'You already have a venture with her' : a.kind === 'motel' && !motelOwned(s) ? 'You own no motel' : s.money < stake ? `Needs ${$(stake)}` : undefined,
      };
    }
    case 'madamFavor': {
      const t = s.characters[a.targetId];
      const best = Object.values(E.ears).filter((e) => e.network === 'madam' && e.status === 'listening' && s.characters[e.id]?.alive && (!t || !boundaryHit(s, e, t, 'close'))).sort((x, y) => y.discretion + y.charm - (x.discretion + x.charm))[0];
      const label = `${mLabel}: a favor`;
      return {
        title: `Ask ${mc?.firstName ?? 'the Madam'} for a favor: someone next to ${t?.firstName ?? 'him'}`,
        detail: 'She sends her best girl; no charge between friends. The girl still decides, and she still reports.',
        effects: t && best ? [X({ op: 'madam', field: 'favors', value: -1 }, label), X({ op: 'newEar', earId: best.id, network: 'madam', loyalty: 0 }, label), X({ op: 'job', earId: best.id, targetId: t.id, mode: 'close', price: 0 }, label)] : [],
        cost: 0, because: `called in a favor from the Madam about ${t?.firstName ?? 'a man'}`, category: 'event',
        disabledReason: !mc?.alive ? 'There is no Madam right now' : M.favors < 1 ? 'She owes you nothing right now' : !t?.alive || t.gender !== 'M' || t.id === s.playerId ? 'Not someone she can help with' : E.jobs.some((j) => j.targetId === t.id) ? 'Someone is already next to him' : !best ? 'None of her girls is free (or willing)' : undefined,
      };
    }
    case 'opDig':
    case 'opRunoff':
    case 'opExpose':
    case 'opMadam': {
      const op = E.ops[a.opId];
      const oc = op ? s.characters[op.id] : undefined;
      const nm = oc ? callName(oc) : 'him';
      const label = `${oc?.firstName ?? 'The operator'} ${oc?.lastName ?? ''}`.trim();
      const off = !op || op.stage !== 'active' ? 'He is not on the island' : undefined;
      if (a.op === 'opDig') {
        const best = knownEars(s).sort((x, y) => y.discretion - x.discretion)[0];
        const gain = 10 + Math.round((best?.discretion ?? 0) / 8);
        return { title: `Have the Ears gather what ${nm} does`, detail: 'Names, rooms, dates. The girls talk to the girls.', effects: [{ type: 'money', amount: -600, label }, X({ op: 'operator', opId: a.opId, field: 'exposure', amount: gain }, label)], cost: 600, because: `had the Ears look into ${oc?.firstName ?? 'an operator'}`, category: 'event', disabledReason: off ?? (!best ? 'You know none of the Ears yet' : s.money < 600 ? 'Needs $600' : undefined) };
      }
      if (a.op === 'opRunoff') {
        return { title: `Run ${nm} off the island`, detail: 'Two cars and a conversation he won\'t forget. The police notice; so do the girls.', effects: [{ type: 'money', amount: -2500, label }, X({ op: 'operator', opId: a.opId, field: 'strength', amount: -60 }, label), { type: 'heat', bar: 'local', amount: 4, label }, { type: 'respect', amount: 2, label }], cost: 2500, because: `ran ${oc?.firstName ?? 'an operator'} off the island`, category: 'event', disabledReason: off ?? (s.money < 2500 ? 'Needs $2,500' : undefined) };
      }
      if (a.op === 'opExpose') {
        return { title: `Give the proof on ${nm} to the state police`, detail: 'The file, two girls who will talk under protection, a reporter who owes you. He goes away clean.', effects: [{ type: 'money', amount: -500, label }, X({ op: 'opDown', opId: a.opId, how: 'exposed and arrested by the state police' }, label)], cost: 500, because: `exposed ${oc?.firstName ?? 'an operator'}`, category: 'event', disabledReason: off ?? ((op?.exposure ?? 0) < 60 ? `Not enough proof yet (${Math.round(op?.exposure ?? 0)}/60)` : s.money < 500 ? 'Needs $500' : undefined) };
      }
      const mOp = madamOpinion(s);
      return { title: `Take ${nm} down with ${mc?.firstName ?? 'the Madam'}`, detail: 'Her girls know everything; your men do the rest. She will remember who stood with her.', effects: [{ type: 'money', amount: -900, label }, X({ op: 'operator', opId: a.opId, field: 'exposure', amount: 25 }, label), X({ op: 'operator', opId: a.opId, field: 'strength', amount: -20 }, label), { type: 'opinion', from: M.id, to: s.playerId, amount: 6, reason: 'Stood with my girls', decay: 1, label }], cost: 900, because: `went after ${oc?.firstName ?? 'an operator'} with the Madam`, category: 'event', disabledReason: off ?? (!mc?.alive ? 'There is no Madam right now' : mOp < 0 ? 'She does not trust you enough (opinion 0+)' : s.money < 900 ? 'Needs $900' : undefined) };
    }
  }
}

/** The sim's random player: a few sensible Ears orders. */
export function earsActions(s: GameState): { kind: 'ears'; op: EarsAction }[] {
  const E = s.ears;
  if (!E) return [];
  const out: { kind: 'ears'; op: EarsAction }[] = [];
  const A = (op: EarsAction) => out.push({ kind: 'ears', op });
  const ears = knownEars(s).filter((e) => e.status === 'listening');
  const targets = Object.values(s.characters).filter((c) => c.alive && c.gender === 'M' && c.id !== s.playerId && !E.ears[c.id] && (isRivalMob(s, c) || !!c.office || (c.faction === 'player' && c.rank === 'capo')));
  if (ears.length && targets.length) {
    const e = ears[s.week % ears.length];
    const t = targets[(s.week * 7) % targets.length];
    A({ op: 'ask', earId: e.id, targetId: t.id, mode: s.week % 3 === 0 ? 'dance' : 'close', generous: s.week % 4 === 0 });
    A({ op: 'retain', earId: e.id });
    if (E.madam.favors > 0) A({ op: 'madamFavor', targetId: t.id });
  }
  A({ op: 'madamCall' });
  A({ op: 'madamCut', tier: ((E.madam.cut + 1 + (s.week % 3)) % 4) as CutTier });
  A({ op: 'madamIntel', on: !E.madam.intel });
  A({ op: 'madamVenture', kind: s.week % 2 ? 'stake' : 'motel' });
  for (const op of Object.values(E.ops).filter((x) => x.stage === 'active')) {
    A({ op: 'opDig', opId: op.id });
    A({ op: 'opExpose', opId: op.id });
    A({ op: 'opMadam', opId: op.id });
    if (s.week % 5 === 0) A({ op: 'opRunoff', opId: op.id });
  }
  for (const e of knownEars(s).filter((x) => x.underOp && !x.protectedFrom)) A({ op: 'protect', earId: e.id });
  return out;
}

/* ------------------------------------------------------------------ */
/* Effect ops                                                          */
/* ------------------------------------------------------------------ */

export function describeEarsOp(s: GameState, o: EarsOp): string | undefined {
  const nm = (id?: string) => (id && s.characters[id] ? s.characters[id].firstName : '?');
  switch (o.op) {
    case 'loyalty': return `${nm(o.earId)}'s trust ${o.amount >= 0 ? '+' : '−'}${Math.abs(o.amount)}`;
    case 'paid': return undefined;
    case 'brush': return `${nm(o.earId)} remembers the brush-off`;
    case 'hold': return `${nm(o.earId)} keeps listening (she may come back with more)`;
    case 'intel': {
      const t = s.characters[o.targetId];
      const w: Record<IntelKind, string> = {
        graft: 'dirt on his graft', affair: 'his affair', rat: 'who he really talks to', skim: 'his second count', plans: 'his crew\'s plans', case: 'the case against you',
        debt: 'his debts', operator: 'proof against him', leak: 'where your news goes', link: 'whom he is attached to', nothing: 'nothing',
      };
      return `What ${nm(o.earId)} heard about ${t?.firstName ?? '?'}: ${w[o.kind]}${o.strong ? ' (the whole of it)' : ''}`;
    }
    case 'job': return `${nm(o.earId)} goes to work on ${nm(o.targetId)} (${o.mode === 'close' ? 'a few weeks' : 'one night'})`;
    case 'refused': return 'She may name a higher price instead';
    case 'stiff': return `${nm(o.earId)} feels cheated`;
    case 'link': return `${nm(o.a)} and ${nm(o.b)}: ${o.type.replace('_', ' ')}`;
    case 'endLink': return `${nm(o.a)} and ${nm(o.b)}: over`;
    case 'reveal': return `You learn whom ${nm(o.a)} is attached to`;
    case 'protect': return `${nm(o.earId)} under your protection`;
    case 'newEar': return o.loyalty ? `${nm(o.earId)} becomes one of your Ears` : undefined;
    case 'leave': return `${nm(o.earId)} leaves the life`;
    case 'retain': return `${nm(o.earId)}'s trust +10`;
    case 'network': return `The network ${o.amount >= 0 ? '+' : '−'}${Math.abs(o.amount)}`;
    case 'madam':
      if (o.field === 'cut') return `Her cut: ${CUT_INFO[(o.value ?? 0) as CutTier].name.toLowerCase()} (${$(CUT_INFO[(o.value ?? 0) as CutTier].weekly)}/wk)`;
      if (o.field === 'intel') return o.value ? 'Her network listens for you (hints more often, cheaper)' : 'No more trading news';
      if (o.field === 'venture') return o.kind === 'stake' ? `A stake in her hotel (~${$(VENTURE_STAKE * 0.022)}/wk)` : 'Her network at your motel (a weekly line, vice heat)';
      if (o.field === 'favors') return `${(o.value ?? 0) >= 0 ? '+' : '−'}${Math.abs(o.value ?? 0)} favor${Math.abs(o.value ?? 0) === 1 ? '' : 's'} she owes you`;
      if (o.field === 'squeeze') return o.value ? 'You help her with the squeeze' : 'She faces the squeeze alone';
      if (o.field === 'ally') return 'She throws in with a rival';
      if (o.field === 'network') return `Her network ${(o.value ?? 0) >= 0 ? '+' : '−'}${Math.abs(o.value ?? 0)}`;
      return undefined;
    case 'operator': return `${nm(o.opId)}: ${o.field === 'exposure' ? `+${o.amount} proof` : `${o.amount} strength`}`;
    case 'opDown': return `${nm(o.opId)} is finished (${o.how})`;
    case 'note': return undefined;
  }
}

function freeEar(_s: GameState, E: EarsState, id: string): void {
  const ear = E.ears[id];
  if (ear && ear.status === 'working' && !E.jobs.some((j) => j.earId === id)) ear.status = 'listening';
}

function leaveLife(s: GameState, E: EarsState, ear: Ear, why: string): void {
  ear.status = 'gone';
  ear.left = { week: s.week, why };
  E.jobs = E.jobs.filter((j) => j.earId !== ear.id);
  E.held = E.held.filter((x) => x.earId !== ear.id);
  E.stats.left++;
  const c = s.characters[ear.id];
  if (c) {
    c.ambition = why;
    note(s, E, `${c.firstName} ${c.lastName} left the life: ${why}.`);
  }
}

export function applyEarsOp(ctx: Ctx, o: EarsOp, label?: string): void {
  const s = ctx.s;
  const E = ensureEars(s);
  const ear = 'earId' in o ? E.ears[o.earId] : undefined;
  const c = 'earId' in o ? s.characters[o.earId] : undefined;
  switch (o.op) {
    case 'loyalty':
      if (ear) ear.loyalty = clamp(ear.loyalty + o.amount);
      break;
    case 'paid':
      if (ear) {
        ear.known = true;
        ear.paid += o.amount;
        ear.savings += o.amount;
        ear.brushed = 0;
        ear.loyalty = clamp(ear.loyalty + 5);
        E.stats.paid++;
      }
      break;
    case 'brush':
      if (ear) {
        ear.known = true;
        ear.brushed++;
        ear.loyalty = clamp(ear.loyalty - 6);
        E.stats.brushed++;
        // A cheap brush-off may send the next one to somebody else.
        if (!ear.sellsTo && (ear.brushed >= 2 || ear.loyalty < 25) && chance(E, 0.5)) {
          const mobs = s.rivals.filter((r) => r.kind === 'mob' && r.id !== 'philly');
          if (mobs.length) {
            ear.sellsTo = pickH(E, mobs).id;
            note(s, E, `${c?.firstName ?? 'An Ear'} has started selling what she hears elsewhere.`);
          }
        }
      }
      break;
    case 'hold':
      if (ear) {
        ear.known = true;
        E.held.push({ earId: o.earId, subject: o.subject, targetId: o.targetId, ripe: s.week + randInt(E, 2, 5) });
        E.stats.held++;
      }
      break;
    case 'intel': {
      const t = s.characters[o.targetId];
      if (t) applyIntel(ctx, E, o.kind, t, !!o.strong);
      if (ear) ear.known = true;
      break;
    }
    case 'job':
      if (ear && s.characters[o.targetId]?.alive) {
        ear.known = true;
        ear.status = 'working';
        const due = s.week + (o.mode === 'close' ? randInt(E, 2, 4) : 1);
        const prot = activeLinks(E).find((l) => l.b === o.earId && ROMANTIC.includes(l.type) && l.strength >= 40 && s.characters[l.a]?.faction === 'player' && s.characters[l.a]?.alive && l.a !== o.targetId);
        const job: EarJob = { id: `j${s.nextId++}`, earId: o.earId, targetId: o.targetId, mode: o.mode, start: s.week, due, price: o.price, protector: prot?.a };
        E.jobs.push(job);
        E.stats.jobs++;
        if (prot && !prot.hidden) E.hooks.push({ kind: 'protector', a: prot.a, her: o.earId, b: o.targetId, jobId: job.id, week: s.week });
      }
      break;
    case 'refused': {
      E.stats.refused++;
      const t = s.characters[o.targetId];
      // She may name her price instead of a flat no.
      if (ear && c && t && o.chance >= 0.2 && (ear.greed >= 1.05 || chance(E, 0.4))) {
        const price = r50(Math.max(o.price * 1.6, o.price + 200));
        const half = r50(price / 2);
        const L = `${c.firstName} and ${t.firstName}`;
        E.stats.countered++;
        s.eventQueue.push(ev(s, 'ears_counter', `${c.firstName} names her price`,
          `${c.firstName} ${c.lastName} thought about ${t.firstName} ${t.lastName} overnight. ${line(E, 'counter', COUNTER_LINES, E, { price: $(price) })}`,
          [
            { id: 'yes', label: `"${$(price)}. Done."`, detail: `${$(half)} now, the rest when she reports.`, because: `met ${c.firstName}'s price`, effects: [{ type: 'money', amount: -half, label: `${L}: half up front` }, X({ op: 'job', earId: c.id, targetId: t.id, mode: o.mode, price }, L)] },
            { id: 'no', label: '"Too rich for me."', detail: 'No hard feelings, she says.', because: `passed on ${c.firstName}'s price`, effects: [] },
          ], [c.id, t.id], 46, { charId: c.id, theme: 'town', asked: 1 }, true));
      } else ctx.log.push(`${c?.firstName ?? 'She'} said no about ${t?.firstName ?? 'him'}: ${line(E, 'refuse', REFUSE_LINES, E)}`);
      if (ear) ear.loyalty = clamp(ear.loyalty - 1);
      break;
    }
    case 'stiff':
      if (ear) {
        ear.loyalty = clamp(ear.loyalty - 15);
        ear.brushed++;
        if (!ear.sellsTo && chance(E, 0.5)) {
          const mobs = s.rivals.filter((r) => r.kind === 'mob' && r.id !== 'philly');
          if (mobs.length) ear.sellsTo = pickH(E, mobs).id;
        }
      }
      break;
    case 'link':
      addLink(s, E, o.a, o.b, o.type, o.strength, o.via, !!o.hidden);
      break;
    case 'endLink': {
      const l = findLink(E, o.a, o.b);
      if (l) endLink(s, l);
      break;
    }
    case 'reveal':
      for (const l of E.links) if (l.a === o.a && (!o.b || l.b === o.b)) l.hidden = false;
      break;
    case 'protect': {
      if (ear) {
        ear.protectedFrom = o.opId;
        ear.underOp = undefined;
        ear.known = true;
        ear.loyalty = clamp(Math.max(ear.loyalty + 25, 70));
        E.stats.protected++;
      }
      const op = E.ops[o.opId];
      if (op) op.strength = clamp(op.strength - 6);
      if (c) note(s, E, `${c.firstName} ${c.lastName} is under your protection.`);
      break;
    }
    case 'newEar': {
      const w = s.characters[o.earId];
      if (!w) break;
      const ex = E.ears[o.earId];
      if (ex) {
        ex.known = true;
        if (o.loyalty) ex.loyalty = clamp(Math.max(ex.loyalty, o.loyalty));
        break;
      }
      const e = newEar(s, E, w, o.network, new Set());
      e.known = true;
      e.loyalty = clamp(o.loyalty);
      e.sellsTo = undefined;
      break;
    }
    case 'leave':
      if (ear) leaveLife(s, E, ear, o.why);
      break;
    case 'retain':
      if (ear) {
        ear.loyalty = clamp(ear.loyalty + 10);
        ear.lastGift = s.week;
        ear.savings += 300;
        ear.brushed = 0;
      }
      break;
    case 'network':
      E.madam.network = clamp(E.madam.network + o.amount);
      break;
    case 'madam': {
      const M = E.madam;
      switch (o.field) {
        case 'cut': M.cut = (o.value ?? 0) as CutTier; break;
        case 'intel': M.intel = !!o.value; break;
        case 'venture': M.venture = { kind: (o.kind as 'stake' | 'motel') ?? 'stake', since: s.week, stake: o.kind === 'stake' ? VENTURE_STAKE : 0 }; break;
        case 'favors': M.favors = Math.max(0, M.favors + (o.value ?? 0)); break;
        case 'call': M.lastCall = s.week; break;
        case 'network': M.network = clamp(M.network + (o.value ?? 0)); break;
        case 'ally': M.ally = o.rival; break;
        case 'squeeze': {
          const sq = M.squeeze;
          if (!sq) break;
          if (o.value) {
            M.favors += 1;
            M.network = clamp(M.network + 5);
            if (sq.by === 'operator' && sq.who && E.ops[sq.who]) E.ops[sq.who].strength = clamp(E.ops[sq.who].strength - 15);
            note(s, E, `You stood by ${s.characters[M.id]?.firstName ?? 'the Madam'} when ${sq.by === 'rival' ? s.rivals.find((r) => r.id === sq.rival)?.shortName ?? 'a rival' : sq.by === 'law' ? 'the vice squad' : 'an operator'} squeezed her.`);
          } else {
            M.network = clamp(M.network - 10);
            M.cutPausedUntil = s.week + 8;
            if (sq.by === 'rival' && sq.rival && chance(E, 0.5)) {
              M.ally = sq.rival;
              note(s, E, `${s.characters[M.id]?.firstName ?? 'The Madam'} made her own arrangements with ${s.rivals.find((r) => r.id === sq.rival)?.shortName ?? 'a rival'}.`);
            }
          }
          M.squeeze = undefined;
          break;
        }
      }
      break;
    }
    case 'operator': {
      const op = E.ops[o.opId];
      if (!op || op.stage !== 'active') break;
      if (o.field === 'exposure') op.exposure = clamp(op.exposure + o.amount);
      else {
        op.strength = clamp(op.strength + o.amount);
        if (op.strength <= 0) opDown(ctx, E, op, 'run off the island');
      }
      break;
    }
    case 'opDown': {
      const op = E.ops[o.opId];
      if (op && op.stage === 'active') opDown(ctx, E, op, o.how);
      break;
    }
    case 'note':
      note(s, E, o.text);
      break;
  }
  void label;
}

/** An exploiter is finished: the Madam and the whole network remember who did it. */
function opDown(ctx: Ctx, E: EarsState, op: Operator, how: string): void {
  const s = ctx.s;
  op.stage = 'gone';
  op.strength = 0;
  op.outcome = how;
  E.stats.opsDown++;
  const oc = s.characters[op.id];
  respect(ctx, 4, `${oc ? short(oc) : 'An operator'} is finished (${how})`, 'event');
  const M = E.madam;
  if (s.characters[M.id]?.alive) addOpinion(s, M.id, s.playerId, 'Took down a man who hurt girls', 20, 1);
  M.network = clamp(M.network + 10);
  for (const e of Object.values(E.ears)) {
    if (e.status === 'gone') continue;
    e.loyalty = clamp(e.loyalty + (e.underOp === op.id || e.protectedFrom === op.id ? 15 : 8));
    if (e.underOp === op.id) e.underOp = undefined;
    if (e.protectedFrom === op.id) e.protectedFrom = undefined;
  }
  if (oc) {
    oc.ambition = `Finished on the island: ${how}`;
    if (how.includes('arrested')) oc.imprisonedUntil = s.week + 520;
    else oc.faction = 'none';
  }
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${oc ? short(oc) : 'An operator'} was finished: ${how}. The girls on the island noticed who did it.`, kind: 'rival' });
  if (how.includes('arrested')) s.news.push({ week: s.week, date: { ...s.date }, paper: 'Wildwood Leader', headline: 'STATE POLICE CLOSE "AGENCY"; OPERATOR HELD', body: `Troopers closed ${op.base} on information from "a concerned businessman." ${oc ? short(oc) : 'The operator'} is held without bail.`, kind: 'expose' });
  note(s, E, `${oc ? short(oc) : 'An operator'} is finished (${how}).`);
}

/* ------------------------------------------------------------------ */
/* The week                                                            */
/* ------------------------------------------------------------------ */

function succeedMadam(ctx: Ctx, E: EarsState, why: string): void {
  const s = ctx.s;
  const M = E.madam;
  const old = s.characters[M.id];
  const next = [M.successorId, ...M.lieutenants].map((id) => (id ? s.characters[id] : undefined)).find((c) => c?.alive && c.id !== M.id);
  M.past.push({ id: M.id, until: s.week, why });
  const heir = next ?? mkPerson(s, E, 'F', randInt(E, 34, 46), ['Ambitious', 'Charming']);
  M.id = heir.id;
  M.lieutenants = M.lieutenants.filter((id) => id !== heir.id && s.characters[id]?.alive);
  while (M.lieutenants.length < 2) {
    const l = mkPerson(s, E, 'F', randInt(E, 28, 42), traitsFor(E, WOMAN_TRAITS, 2));
    l.ambition = 'Run the house one day';
    M.lieutenants.push(l.id);
  }
  M.successorId = M.lieutenants[0];
  M.house = `the ${heir.lastName} house`;
  M.since = s.week;
  M.ally = undefined;
  M.squeeze = undefined;
  M.favors = Math.floor(M.favors / 2);
  heir.ambition = 'Hold the house her mentor built';
  heir.wealth = Math.max(heir.wealth, Math.round(M.money * 0.8));
  const prior = opinion(s, heir.id, s.playerId);
  if (prior < 5) addOpinion(s, heir.id, s.playerId, 'Her mentor\'s friend', 10 - prior > 0 ? Math.min(15, 10 - prior) : 0, 1);
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${old ? short(old) : 'The Madam'} ${why}. ${short(heir)} runs ${M.house} now.`, kind: 'misc' });
  note(s, E, `${short(heir)} took over the house (${old ? old.firstName : 'the Madam'} ${why}).`);
  ctx.log.push(`The Madam's house has a new head: ${short(heir)}.`);
}

function finishJob(ctx: Ctx, E: EarsState, job: EarJob): void {
  const s = ctx.s;
  const ear = E.ears[job.earId];
  const c = s.characters[job.earId];
  const t = s.characters[job.targetId];
  E.jobs = E.jobs.filter((j) => j !== job);
  if (!ear || !c?.alive) return;
  freeEar(s, E, ear.id);
  if (!t?.alive) {
    note(s, E, `${c.firstName}'s job ended: the man is gone.`);
    return;
  }
  E.stats.reports++;
  const h = E;
  const ok = chance(h, successOdds(s, ear, t, job.mode));
  const pool = intelFor(s, E, t).filter(([k]) => job.mode === 'close' || k !== 'rat' || chance(h, 0.4));
  let kind: IntelKind = ok ? weighted(h, pool) ?? 'nothing' : 'nothing';
  if (job.mode === 'dance' && kind !== 'nothing' && chance(h, 0.35)) kind = 'link';
  const strong = ok && job.mode === 'close' && chance(h, 0.4);
  const spotted = !ok && chance(h, riskOf(s, t) / 140);
  const rest = r50(job.price / 2);
  const label = `${c.firstName} on ${t.firstName}`;
  const op = line(E, 'rep_open', REPORT_OPEN, h, { her: c.firstName });
  const think = OPINION_LINES.filter((x) => t.traits.includes(x.trait as Trait));
  const thinkLine = think.length ? line(E, `think_${think[0].trait}`, think[0].lines, h) : line(E, 'think_plain', OPINION_PLAIN, h);
  const regular = ok && chance(h, job.mode === 'dance' ? 0.6 : 0.4);
  const attach: Effect[] = regular ? [X({ op: 'link', a: t.id, b: c.id, type: job.mode === 'dance' ? 'likes' : 'regular', strength: 45, via: 'report' }, label)] : [];
  const prot = job.protector ? s.characters[job.protector] : undefined;
  let text: string;
  let choices: Choice[];
  if (kind === 'nothing') {
    text = `${op} ${ok ? line(E, 'rep_nothing', REPORT_LINES.nothing, h) : line(E, 'rep_fail', FAIL_LINES, h)} About ${t.firstName}: ${thinkLine}${spotted ? ` She thinks somebody saw her leave. ${t.firstName} may know who sent her.` : ''}`;
    choices = [
      { id: 'pay', label: rest ? `Pay her the rest anyway (${$(rest)})` : 'Thank her', detail: 'She went; she gets paid.', because: `paid ${c.firstName} for a quiet night`, effects: [...(rest ? [{ type: 'money', amount: -rest, label } as Effect, X({ op: 'paid', earId: c.id, amount: rest }, label)] : [X({ op: 'loyalty', earId: c.id, amount: 3 }, label)]), ...attach] },
      { id: 'half', label: rest ? `"Half of that, for nothing." (${$(r50(rest / 2))})` : '"Next time, bring me something."', detail: 'She will remember the arithmetic.', because: `short-changed ${c.firstName}`, effects: [...(rest ? [{ type: 'money', amount: -r50(rest / 2), label } as Effect] : []), X({ op: 'loyalty', earId: c.id, amount: -6 }, label), ...attach] },
    ];
    if (spotted) for (const ch of choices) ch.effects.push({ type: 'opinion', from: t.id, to: s.playerId, amount: -8, reason: 'Sent a girl to spy on me', decay: 1, label });
  } else {
    const what = REPORT_LINES[kind];
    const teaser = line(E, `rep_${kind}`, what, h);
    text = `${op} About ${t.firstName}: ${thinkLine} ${regular ? line(E, 'regular', REGULAR_LINES, h) + ' ' : ''}Then she stops. "The rest is what you're paying for." She waits.`;
    const intel = intelEffects(s, c.id, kind, t, strong, label);
    choices = [
      { id: 'pay', label: rest ? `Pay her the rest (${$(rest)}) and hear it all` : 'Hear it all', detail: strong ? 'She has all of it.' : 'She has something on him.', because: `paid ${c.firstName} for what she heard about ${t.firstName}`, effects: [...(rest ? [{ type: 'money', amount: -rest, label } as Effect] : []), X({ op: 'paid', earId: c.id, amount: rest }, label), ...intel, X({ op: 'note', text: `${c.firstName} on ${t.firstName}: ${teaser}` }, label), ...attach] },
      { id: 'stiff', label: '"That\'s all you get."', detail: 'She keeps what she heard. Maybe she sells it to someone who pays.', because: `stiffed ${c.firstName}`, effects: [X({ op: 'stiff', earId: c.id, targetId: t.id }, label), ...attach] },
    ];
  }
  if (prot && prot.alive) text += ` ${prot.firstName}, who is sweet on her, was waiting outside in his car.`;
  const rep = ev(s, 'ears_report', `${c.firstName} reports on ${t.firstName}`, text, choices, [c.id, t.id], 55, { charId: c.id, theme: 'town', asked: 1, due: 1 }, true);
  // Unanswered, she is paid what was agreed.
  rep.defaultChoiceId = 'pay';
  s.eventQueue.push(rep);
  if (job.mode === 'close' && !ok && spotted) ear.loyalty = clamp(ear.loyalty - 5);
}

/** Weekly: the Madam, the operators, the money, the jobs, and once a month the web. */
export function earsWeek(ctx: Ctx): void {
  const s = ctx.s;
  const E = ensureEars(s);
  const M = E.madam;
  const mc = s.characters[M.id];
  if (!mc?.alive) succeedMadam(ctx, E, mc?.death ? `died (${mc.death.cause})` : 'is gone');
  for (const e of Object.values(E.ears)) {
    const c = s.characters[e.id];
    if (e.status !== 'gone' && !c?.alive) {
      e.status = 'gone';
      e.left = { week: s.week, why: 'gone' };
      E.jobs = E.jobs.filter((j) => j.earId !== e.id);
      continue;
    }
    if (e.status !== 'gone') e.savings += Math.round(EARN[e.work] * (isInSeason(s.date) ? 1.3 : 0.6));
  }
  // Operators arrive and grow.
  for (const op of Object.values(E.ops)) {
    if (op.stage === 'waiting' && s.week >= op.arrives) {
      op.stage = 'active';
      const oc = s.characters[op.id];
      if (oc) {
        note(s, E, `A new man in town: ${callName(oc)}, ${op.base}.`);
        s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${short(oc)} set up shop in ${op.base}. The girls stopped smiling.`, kind: 'rival' });
        for (const e of Object.values(E.ears).filter((x) => x.network === 'independent' && x.status !== 'gone' && !x.underOp && !x.protectedFrom).slice(0, 1)) e.underOp = op.id;
      }
    }
    if (op.stage !== 'active') continue;
    if (!s.characters[op.id]?.alive) {
      opDown(ctx, E, op, 'dead');
      continue;
    }
    op.strength = clamp(op.strength + 0.4 + (isInSeason(s.date) ? 0.3 : 0));
    if (s.week % 10 === 0 && op.strength >= 45) respect(ctx, -1, `${short(s.characters[op.id])}: the girls ask why you let it happen`, 'drift');
  }
  // The Madam's money.
  if (mc?.alive) {
    const paused = (M.cutPausedUntil ?? 0) > s.week || !!M.ally;
    const cut = paused ? 0 : Math.round(CUT_INFO[M.cut].weekly * (isInSeason(s.date) ? 1.25 : 0.75) * (0.6 + M.network / 125));
    if (cut > 0) money(ctx, cut, `The Madam's cut (${M.house})`, 'business');
    if (M.venture?.kind === 'stake') money(ctx, Math.round(M.venture.stake * (isInSeason(s.date) ? 0.03 : 0.012)), `Venture with the Madam: ${M.hotel}`, 'business');
    if (M.venture?.kind === 'motel' && motelOwned(s)) {
      money(ctx, Math.round(isInSeason(s.date) ? 260 : 90), 'The Madam\'s people at your motel (her deal)', 'business');
      if (s.week % 4 === 0) heat(ctx, 'local', 1, 'The vice squad is curious about your motel', 'heat');
    }
    if (M.squeeze) {
      M.squeeze.left--;
      if (M.squeeze.left <= 0) {
        addOpinion(s, M.id, s.playerId, 'He wasn\'t there when I needed him', -15, 1);
        applyEarsOp(ctx, { op: 'madam', field: 'squeeze', value: 0 });
      }
    }
  }
  // Jobs that are done.
  for (const j of E.jobs.filter((x) => x.due <= s.week)) finishJob(ctx, E, j);
  // Monthly (the first week of the month).
  if (s.date.d <= 7) earsMonth(ctx, E);
}

function earsMonth(ctx: Ctx, E: EarsState): void {
  const s = ctx.s;
  const M = E.madam;
  const mc = s.characters[M.id];
  pruneLinks(s, E);
  // The Madam's mood and her moves.
  if (mc?.alive) {
    const drift = (M.cut === 3 ? -3 : M.cut === 2 ? -1 : M.cut === 0 ? 1 : 0) + (M.intel ? 1 : 0) + (M.venture ? 1 : 0);
    if (drift) addOpinion(s, M.id, s.playerId, drift > 0 ? 'A fair friend' : 'His cut is heavy', drift, 1);
    M.money += Math.round(500 + M.network * 20);
    mc.wealth = M.money;
    const op0 = opinion(s, M.id, s.playerId);
    if (!M.ally && op0 <= -30 && chance(E, 0.3)) {
      const mobs = s.rivals.filter((r) => r.kind === 'mob' && r.id !== 'philly' && s.characters[r.leaderId]?.alive);
      if (mobs.length) {
        M.ally = pickH(E, mobs).id;
        const rn = s.rivals.find((r) => r.id === M.ally)?.shortName ?? 'a rival';
        note(s, E, line(E, 'ally', ['{madam} was seen at {rival}\'s table, laughing at the right moments.', 'Word is {madam} has a new friend: {rival}.'], E, { madam: mc.firstName, rival: rn }));
        s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${short(mc)} threw in with ${rn}.`, kind: 'rival' });
      }
    } else if (M.ally && op0 >= 10) {
      note(s, E, `${mc.firstName} let ${s.rivals.find((r) => r.id === M.ally)?.shortName ?? 'the rival'} know she is spoken for.`);
      M.ally = undefined;
    }
    if (M.ally) {
      const r = s.rivals.find((x) => x.id === M.ally);
      if (r) r.exposure = clamp(r.exposure - 2);
      for (const e of Object.values(E.ears)) if (e.network === 'madam' && e.status !== 'gone') e.loyalty = clamp(e.loyalty - 1);
    }
    // A squeeze.
    if (!M.squeeze && s.week >= 16 && chance(E, 0.05)) {
      const ops = Object.values(E.ops).filter((o) => o.stage === 'active');
      const mobs = s.rivals.filter((r) => r.kind === 'mob' && r.id !== 'philly' && r.id !== M.ally);
      const by = ops.length && chance(E, 0.4) ? 'operator' : mobs.length && chance(E, 0.6) ? 'rival' : 'law';
      M.squeeze = { by, rival: by === 'rival' ? pickH(E, mobs).id : undefined, who: by === 'operator' ? pickH(E, ops).id : undefined, since: s.week, left: 6 };
    }
    // Age and retirement.
    if (ageOn(mc.birth, s.date) >= 63 && chance(E, 0.03)) succeedMadam(ctx, E, 'retired to Fort Lauderdale');
  }
  // Ears who reach their goal may go; the web moves on its own.
  for (const e of Object.values(E.ears)) {
    if (e.status !== 'listening' || E.hooks.some((h) => h.her === e.id)) continue;
    const c = s.characters[e.id];
    if (!c?.alive) continue;
    const loveOut = e.goal === 'marry' && activeLinks(E).some((l) => l.b === e.id && l.type === 'in_love' && !married(s, s.characters[l.a]));
    if ((e.savings >= GOAL_AT[e.goal] || loveOut || ageOn(c.birth, s.date) >= 40) && chance(E, 0.2)) E.hooks.push({ kind: 'leaving', a: e.id, her: e.id, week: s.week });
  }
  // New girls come to the island every season: the Madam takes some in, some work on their own.
  const working = Object.values(E.ears).filter((e) => e.status !== 'gone').length;
  if (working < 9 && chance(E, isInSeason(s.date) ? 0.5 : 0.25)) {
    const c = mkPerson(s, E, 'F', randInt(E, 21, 30), traitsFor(E, WOMAN_TRAITS, 2));
    const used = new Set(Object.values(E.ears).filter((e) => e.status !== 'gone').map((e) => e.venue));
    const e = newEar(s, E, c, chance(E, M.network / 100) ? 'madam' : 'independent', used);
    note(s, E, `New in town: ${c.firstName} ${c.lastName}, ${WORK_LABEL[e.work].toLowerCase()} at ${e.venue}.`);
  }
  const hooks = webMonth(s, E, E, (man, her, rival) => {
    E.stats.leaks++;
    const sc = s.schemes.find((x) => x.owner === 'player' && !x.discovered);
    if (sc) sc.discovered = true;
    const r = s.rivals.find((x) => x.id === rival);
    if (r) r.exposure = clamp(r.exposure - 2);
    if (sc) ctx.log.push(`Somehow ${r?.shortName ?? 'a rival'} knew about your plans. (Somebody talks to somebody.)`);
    void man;
    void her;
  });
  for (const h of hooks) if (!E.hooks.some((x) => x.kind === h.kind && x.her === h.her)) E.hooks.push({ ...h, week: s.week });
  // A woman may come for protection from an operator.
  const active = Object.values(E.ops).filter((o) => o.stage === 'active');
  if (active.length && s.week - E.lastProtect >= 10 && chance(E, 0.35) && !E.hooks.some((x) => x.kind === 'protect')) {
    const op = pickH(E, active);
    const under = Object.values(E.ears).find((e) => e.underOp === op.id && !e.protectedFrom && e.status !== 'gone' && s.characters[e.id]?.alive);
    const her = under ? s.characters[under.id] : mkPerson(s, E, 'F', randInt(E, 21, 30), traitsFor(E, WOMAN_TRAITS, 2));
    if (!under) her.ambition = 'Get away from a man who says she owes him';
    E.hooks.push({ kind: 'protect', a: her.id, her: her.id, opId: op.id, week: s.week });
    E.lastProtect = s.week;
  }
  E.hooks = E.hooks.filter((x) => s.week - x.week <= 10);
}

/* ------------------------------------------------------------------ */
/* The popups: hints, scenes, the Madam                                */
/* ------------------------------------------------------------------ */

interface HintPick { subject: string; target: Character; w: number }

function hintCandidates(s: GameState, E: EarsState): HintPick[] {
  const out: HintPick[] = [];
  const add = (subject: string, target: Character | undefined, w: number) => { if (target?.alive && target.gender === 'M' && target.id !== s.playerId && !E.ears[target.id]) out.push({ subject, target, w }); };
  for (const c of Object.values(s.characters)) {
    if (!c.alive || c.gender !== 'M' || c.id === s.playerId) continue;
    if (c.faction === 'player' && c.informantFor && !s.secrets.some((x) => x.ownerId === c.id && x.kind === 'informant' && x.knownBy.includes('player'))) add('rat', c, 4);
    if (c.faction === 'player' && c.rank === 'capo' && (c.skimmed ?? 0) >= 400 && !s.secrets.some((x) => x.ownerId === c.id && x.kind === 'skimming' && x.knownBy.includes('player'))) add('skim', c, 2);
    if (c.office && !isLaw(c)) {
      const p = polOf(s, c);
      if (!p || !peekCtl(s, p.id)?.dirt) add('graft', c, 1.2);
    }
    if (isLaw(c) && c.office) add('case', c, s.legal && s.legal.stage !== 'quiet' ? 2.5 : 0.6);
    if (isRivalMob(s, c) && c.rank !== 'civilian') add('plans', c, s.schemes.some((x) => x.owner === c.faction && !x.discovered) ? 1.5 : 0.35);
    if (s.secrets.some((x) => x.ownerId === c.id && x.kind === 'affair' && !x.knownBy.includes('player'))) add('affair', c, 0.8);
    if (s.secrets.some((x) => x.ownerId === c.id && x.kind === 'debt' && !x.knownBy.includes('player'))) add('debt', c, 0.4);
  }
  for (const l of activeLinks(E)) {
    if (!l.hidden) continue;
    const man = s.characters[l.a];
    if (!man) continue;
    if (man.faction === 'player' && ROMANTIC.includes(l.type) && E.ears[l.b]?.sellsTo) add('leak', man, 3);
    else if (l.type === 'mistress') add('affair', man, 1.5);
    else add('link', man, 0.5);
  }
  for (const op of Object.values(E.ops)) if (op.stage === 'active' && op.exposure < 70) add('operator', s.characters[op.id], 1.2);
  return out;
}

const SUBJECT_KIND: Record<string, IntelKind> = { graft: 'graft', affair: 'affair', rat: 'rat', skim: 'skim', plans: 'plans', case: 'case', debt: 'debt', operator: 'operator', leak: 'leak', link: 'link' };
const SUBJECT_PRICE: Record<string, number> = { graft: 600, affair: 500, rat: 900, skim: 500, plans: 650, case: 800, debt: 300, operator: 200, leak: 600, link: 250 };
const SUBJECT_THEME: Record<string, string> = { graft: 'town', affair: 'town', rat: 'crew', skim: 'crew', plans: 'rivals', case: 'law', debt: 'town', operator: 'town', leak: 'crew', link: 'town' };

function hintPrice(_s: GameState, E: EarsState, ear: Ear, subject: string, ripe: boolean): number {
  return r50(SUBJECT_PRICE[subject] * ear.greed * (1 - ear.loyalty / 300) * (E.madam.intel && ear.network === 'madam' ? 0.75 : 1) * (ripe ? 1.4 : 1));
}

function buildHint(s: GameState, E: EarsState, h: RngHolder, ear: Ear, subject: string, t: Character, ripe: boolean): EventInstance {
  const c = s.characters[ear.id];
  const price = hintPrice(s, E, ear, subject, ripe);
  const kind = SUBJECT_KIND[subject];
  const rv = s.rivals.find((r) => r.id === t.faction) ?? s.rivals.find((r) => r.id === ear.sellsTo);
  const op = E.ops[t.id] ? callName(t) : '';
  const k = { him: title(s, t), rival: rv?.shortName ?? 'the other side', op, place: ear.venue };
  const said = ripe ? line(E, 'ripe', RIPE_LINES, h, k) : line(E, `hint_${subject}`, HINT_LINES[subject], h, k);
  const setting = line(E, 'hint_set', HINT_SETTINGS, h);
  const tail = line(E, 'hint_tail', HINT_TAILS, h);
  const who = `${callName(c)}, ${WORK_LABEL[ear.work].toLowerCase()} at ${ear.venue}.`;
  const label = `${c.firstName}: ${subject === 'operator' ? 'about ' + t.firstName : 'about ' + t.firstName}`;
  const intel = intelEffects(s, ear.id, kind, t, ripe, label);
  const choices: Choice[] = [
    { id: 'pay', label: `"Tell me the rest." (${$(price)})`, detail: 'Paying builds trust.', because: `paid ${c.firstName} for what she heard about ${t.firstName}`, effects: [{ type: 'money', amount: -price, label }, X({ op: 'paid', earId: ear.id, amount: price }, label), ...intel, X({ op: 'note', text: `${c.firstName} on ${t.firstName}: ${line(E, `rep_${kind}`, REPORT_LINES[kind], h)}` }, label)] },
    ...(ripe ? [] : [{ id: 'brush', label: '"Not interested."', detail: 'Free today. A cheap brush-off may send the next one elsewhere.', because: `brushed off ${c.firstName}`, effects: [X({ op: 'brush', earId: ear.id }, label)] } as Choice]),
    ripe
      ? { id: 'pass', label: '"Keep it."', detail: 'She shrugs. Somebody else may buy it.', because: `let ${c.firstName} keep what she heard`, effects: [X({ op: 'loyalty', earId: ear.id, amount: -2 }, label)] }
      : { id: 'keep', label: '"Keep listening."', detail: 'Free. She may come back with more; somebody else may get it first.', because: `told ${c.firstName} to keep listening`, effects: [X({ op: 'hold', earId: ear.id, subject, targetId: t.id }, label)] },
  ];
  const tt = HINT_TITLES[subject];
  return ev(s, `ears_hint_${subject}`, ripe ? `${c.firstName} again` : tt[fresh(E, `ht_${subject}`, tt.length, h)], `${who} ${setting} ${said} ${tail}`, choices, [ear.id], ripe ? 47 : 45, { charId: ear.id, theme: SUBJECT_THEME[subject] ?? 'town', ears: subject, target: t.id, ...(ripe ? { asked: 1 } : {}) });
}

function hookEvent(s: GameState, E: EarsState, h: RngHolder, hk: PendingHook): EventInstance | undefined {
  const her = s.characters[hk.her];
  const a = s.characters[hk.a];
  if (!her?.alive || !a?.alive) return undefined;
  const ear = E.ears[her.id];
  const place = ear?.venue ?? 'the club';
  const L = (x: string) => `${her.firstName}: ${x}`;
  switch (hk.kind) {
    case 'protect': {
      const op = hk.opId ? E.ops[hk.opId] : undefined;
      const oc = op ? s.characters[op.id] : undefined;
      if (!op || op.stage !== 'active' || !oc) return undefined;
      const k = { op: callName(oc) };
      const label = L('protection');
      const madamOk = madamOpinion(s) >= 0 && !E.madam.ally;
      return ev(s, 'ears_protect', `${her.firstName} asks for protection`,
        `${line(E, 'prot_open', PROTECT_OPEN, h)} ${her.firstName} ${her.lastName}. ${line(E, 'prot_plea', PROTECT_PLEA, h, k)}`,
        [
          { id: 'protect', label: '"Nobody touches you. You go where you want."', detail: '$600: a room he doesn\'t know about, a man outside the door. She becomes a loyal Ear; she can leave whenever she likes.', because: `took ${her.firstName} under your protection`, effects: [{ type: 'money', amount: -600, label }, X({ op: 'newEar', earId: her.id, network: 'independent', loyalty: 80 }, label), X({ op: 'protect', earId: her.id, opId: op.id }, label), X({ op: 'operator', opId: op.id, field: 'exposure', amount: 15 }, label), { type: 'respect', amount: 1, label }] },
          { id: 'ticket', label: '"Here\'s money and a ticket. Go home."', detail: '$300. She is gone by morning, and she tells the girls who helped.', because: `paid ${her.firstName}'s way out of town`, effects: [{ type: 'money', amount: -300, label }, X({ op: 'network', amount: 3 }, label), X({ op: 'operator', opId: op.id, field: 'strength', amount: -4 }, label), X({ op: 'note', text: `${her.firstName} ${her.lastName} took the bus home with your money.` }, label)] },
          ...(madamOk ? [{ id: 'madam', label: `"Go see ${s.characters[E.madam.id]?.firstName ?? 'the Madam'}. Tell her I sent you."`, detail: 'The Madam takes her in; she owes you one for the thought.', because: `sent ${her.firstName} to the Madam`, effects: [X({ op: 'newEar', earId: her.id, network: 'madam', loyalty: 55 }, label), { type: 'opinion', from: E.madam.id, to: s.playerId, amount: 4, reason: 'Sent a girl my way', decay: 1, label } as Effect] } as Choice] : []),
          { id: 'no', label: '"Not my business."', detail: 'The girls will hear how you answered.', because: `turned ${her.firstName} away`, effects: [{ type: 'respect', amount: -1, label }, X({ op: 'network', amount: -3 }, label)] },
        ], [her.id, oc.id], 47, { charId: her.id, theme: 'town', asked: 1 });
    }
    case 'leaving': {
      if (!ear || ear.status !== 'listening') return undefined;
      const label = L('leaving');
      return ev(s, 'ears_leaving', `${her.firstName} is leaving`,
        line(E, 'leaving', LEAVING, h, { her: `${her.firstName} ${her.lastName}` }),
        [
          { id: 'well', label: '"Good luck, kid." (an envelope, $200)', detail: 'She goes with your blessing; the other girls see it.', because: `wished ${her.firstName} well`, effects: [{ type: 'money', amount: -200, label }, X({ op: 'leave', earId: her.id, why: 'left the life with the boss\'s blessing' }, label), X({ op: 'network', amount: 2 }, label)] },
          { id: 'ask', label: '"Stay one more season?"', detail: 'Her choice. Most say no.', because: `asked ${her.firstName} to stay a while`, effects: chance(h, 0.25 + ear.loyalty / 400) ? [X({ op: 'loyalty', earId: her.id, amount: 4 }, label), X({ op: 'note', text: `${her.firstName} agreed to stay one more season.` }, label)] : [X({ op: 'leave', earId: her.id, why: 'left the life (she said no, kindly)' }, label)] },
          { id: 'nod', label: 'Nod. Say nothing.', detail: 'She goes.', because: `let ${her.firstName} go`, effects: [X({ op: 'leave', earId: her.id, why: 'left the life' }, label)] },
        ], [her.id], 30, { charId: her.id, theme: 'town', asked: 1 });
    }
    case 'protector': {
      const t = hk.b ? s.characters[hk.b] : undefined;
      const job = E.jobs.find((j) => j.id === hk.jobId);
      if (!t || !job) return undefined;
      const label = L(`${a.firstName} objects`);
      return ev(s, 'ears_web_protector', `${a.firstName} doesn't like it`,
        line(E, 'w_prot', PROTECTOR, h, { a: callName(a), her: her.firstName, him: t.firstName }),
        [
          { id: 'hers', label: '"It\'s her call, not yours."', detail: 'She notices who respected her choice.', because: `told ${a.firstName} it was ${her.firstName}'s call`, effects: [{ type: 'opinion', from: a.id, to: s.playerId, amount: -8, reason: 'Sent my girl into danger', decay: 1, label }, X({ op: 'loyalty', earId: her.id, amount: 5 }, label)] },
          { id: 'calm', label: '"She\'ll be fine. So will you." ($300)', detail: 'A night out on you, and a promise to keep a man near her.', because: `calmed ${a.firstName} down`, effects: [{ type: 'money', amount: -300, label }, { type: 'opinion', from: a.id, to: s.playerId, amount: 2, reason: 'The boss looked after my girl', decay: 1, label }] },
        ], [a.id, her.id], 40, { charId: a.id, theme: 'crew', asked: 1 });
    }
    case 'jealousy': {
      const b = hk.b ? s.characters[hk.b] : undefined;
      if (!b?.alive) return undefined;
      const label = L('two men');
      const lb = findLink(E, b.id, her.id);
      return ev(s, 'ears_web_jealousy', `Two men, one girl`,
        line(E, 'w_jeal', JEALOUSY, h, { a: callName(a), b: callName(b), her: her.firstName, place }),
        [
          { id: 'back', label: `Tell ${b.firstName} to back off`, detail: 'He will, for now. He won\'t like you for it.', because: `told ${b.firstName} to back off ${her.firstName}`, effects: [{ type: 'opinion', from: b.id, to: s.playerId, amount: -8, reason: 'Took sides over a girl', decay: 1, label }, ...(lb ? [X({ op: 'endLink', a: b.id, b: her.id, why: 'told to back off' }, label)] : [])] },
          { id: 'hers', label: '"It\'s her choice. Both of you, grow up."', detail: 'She chooses. The one she doesn\'t choose will sulk.', because: `let ${her.firstName} choose`, effects: [X({ op: 'loyalty', earId: her.id, amount: 5 }, label), { type: 'opinion', from: a.id, to: b.id, amount: -10, reason: 'Over a girl', decay: 1, label }, { type: 'opinion', from: b.id, to: a.id, amount: -10, reason: 'Over a girl', decay: 1, label }] },
          { id: 'out', label: 'Stay out of it', detail: 'Men settle these things. Sometimes in the parking lot.', because: `stayed out of ${a.firstName} and ${b.firstName}'s quarrel`, effects: [{ type: 'heat', bar: 'local', amount: 1, label }, { type: 'opinion', from: a.id, to: b.id, amount: -15, reason: 'A fight over a girl', decay: 1, label }, { type: 'opinion', from: b.id, to: a.id, amount: -15, reason: 'A fight over a girl', decay: 1, label }] },
        ], [a.id, b.id, her.id], 38, { charId: a.id, theme: 'crew' });
    }
    case 'breakup': {
      const rn = hk.rival ? s.rivals.find((r) => r.id === hk.rival)?.shortName ?? 'the other side' : 'the other side';
      const label = L('a breakup');
      return ev(s, 'ears_web_breakup', `${a.firstName} and ${her.firstName}: over`,
        line(E, 'w_break', BREAKUP, h, { a: callName(a), her: her.firstName, rival: rn }),
        [
          { id: 'kind', label: 'Send her something; no hard feelings ($200)', detail: 'She keeps listening for you, not for them.', because: `sent ${her.firstName} something after the breakup`, effects: [{ type: 'money', amount: -200, label }, X({ op: 'loyalty', earId: her.id, amount: 8 }, label)] },
          { id: 'let', label: 'Let it go', detail: 'What she knows about him goes where it goes.', because: `let ${a.firstName}'s breakup go`, effects: [X({ op: 'loyalty', earId: her.id, amount: -4 }, label)] },
        ], [a.id, her.id], 32, { charId: a.id, theme: 'crew' });
    }
    case 'pregnant': {
      const label = L('expecting');
      return ev(s, 'ears_web_pregnant', `${her.firstName} is expecting`,
        line(E, 'w_preg', PREGNANT, h, { a: callName(a), her: her.firstName }),
        [
          { id: 'help', label: '"Whatever you decide, you won\'t be alone." ($800)', detail: 'A good doctor, the rent paid, no questions asked. What comes next is her choice.', because: `helped ${her.firstName} quietly`, effects: [{ type: 'money', amount: -800, label }, X({ op: 'loyalty', earId: her.id, amount: 20 }, label), X({ op: 'note', text: `${her.firstName} is expecting; you made sure she was looked after.` }, label)] },
          { id: 'his', label: `"It's ${a.firstName}'s to handle. I'll tell him."`, detail: 'A man should know. Whether he does right is up to him.', because: `told ${a.firstName} about ${her.firstName}`, effects: a.faction === 'player' ? [{ type: 'opinion', from: a.id, to: s.playerId, amount: 3, reason: 'The boss told me straight', decay: 1, label }] : [X({ op: 'reveal', a: a.id, b: her.id }, label)] },
          { id: 'out', label: 'Stay out of it', detail: 'Not your business.', because: `stayed out of ${her.firstName}'s trouble`, effects: [X({ op: 'loyalty', earId: her.id, amount: -3 }, label)] },
        ], [her.id, a.id], 36, { charId: her.id, theme: 'romance' });
    }
    case 'wife': {
      const label = L(`${a.firstName}'s wife`);
      return ev(s, 'ears_web_wife', `${a.firstName}'s wife knows`,
        line(E, 'w_wife', WIFE, h, { a: callName(a), her: her.firstName, place }),
        [
          { id: 'end', label: `"End it, ${a.firstName}. Go home."`, detail: 'He will, or he won\'t. Either way he heard you.', because: `told ${a.firstName} to end it`, effects: [{ type: 'opinion', from: a.id, to: s.playerId, amount: -5, reason: 'Told me how to live', decay: 1, label }, X({ op: 'endLink', a: a.id, b: her.id, why: 'his wife found out' }, label)] },
          { id: 'wife', label: 'Send his wife flowers and a word ($250)', detail: 'The family takes care of its own, including the wives.', because: `sent ${a.firstName}'s wife flowers`, effects: [{ type: 'money', amount: -250, label }, { type: 'familyOpinion', amount: 1, reason: 'The boss looks after the wives', label }] },
          { id: 'out', label: 'Not my business', detail: 'It is his kitchen.', because: `stayed out of ${a.firstName}'s marriage`, effects: [] },
        ], [a.id, her.id], 33, { charId: a.id, theme: 'family' });
    }
    case 'intro':
      return undefined;
  }
}

function madamEvent(s: GameState, E: EarsState, h: RngHolder): EventInstance | undefined {
  const M = E.madam;
  const mc = s.characters[M.id];
  if (!mc?.alive) return undefined;
  const label = `The Madam: ${mc.firstName} ${mc.lastName}`;
  if (!M.introduced && s.week >= 3) {
    const her = Object.values(E.ears).find((e) => e.network === 'madam' && e.status === 'listening' && !e.known && s.characters[e.id]?.alive);
    if (!her) return undefined;
    const hc = s.characters[her.id];
    const others = Object.values(E.ears).filter((e) => e.network === 'madam' && e.id !== her.id && e.status === 'listening').slice(0, 2);
    M.introduced = true;
    return ev(s, 'ears_madam_intro', `Meet ${mc.firstName} ${mc.lastName}`,
      `${callName(mc)} owns ${M.hotel}, books acts through ${M.agency}, sits on the board of ${M.charity}, and runs most of the women who work the island's nights. In public she is a businesswoman; in private she is nobody's employee, yours included. ${line(E, 'intro', MADAM_INTRO, h, { madam: mc.firstName, her: callName(hc), hotel: M.hotel })} ${hc.firstName} ${WORK_PLACES[her.work]} ${her.venue}.`,
      [
        { id: 'warm', label: `"Any friend of ${mc.firstName}'s." (a bottle for the table, $150)`, detail: 'The Madam notices manners. So do her girls.', because: `met ${hc.firstName} through the Madam`, effects: [{ type: 'money', amount: -150, label }, X({ op: 'madam', field: 'call' }, label), X({ op: 'newEar', earId: hc.id, network: 'madam', loyalty: 0 }, label), ...others.map((o) => X({ op: 'newEar', earId: o.id, network: 'madam', loyalty: 0 }, label)), X({ op: 'loyalty', earId: hc.id, amount: 8 }, label), { type: 'opinion', from: M.id, to: s.playerId, amount: 4, reason: 'A gentleman at my table', decay: 1, label }] },
        { id: 'nod', label: 'A polite nod, an early night', detail: 'You know her name now. That\'s all.', because: `met ${hc.firstName} through the Madam`, effects: [X({ op: 'newEar', earId: hc.id, network: 'madam', loyalty: 0 }, label), X({ op: 'madam', field: 'call' }, label)] },
      ], [M.id, hc.id], 60, { charId: M.id, theme: 'town', asked: 1, due: 1 });
  }
  const sq = M.squeeze;
  if (sq && (M.squeezeAsked === undefined || s.week - M.squeezeAsked >= 3)) {
    M.squeezeAsked = s.week;
    const rn = sq.rival ? s.rivals.find((r) => r.id === sq.rival)?.shortName ?? 'a rival' : '';
    const oc = sq.who ? s.characters[sq.who] : undefined;
    const k = { madam: callName(mc), hotel: M.hotel, rival: rn, op: oc ? callName(oc) : 'a man', club: M.club };
    const text = line(E, `sq_${sq.by}`, MADAM_SQUEEZE[sq.by], h, k);
    const lawFix = sq.by === 'law';
    return ev(s, `ears_madam_squeeze`, `${mc.firstName} needs a friend`, `${text} (${sq.left} week${sq.left === 1 ? '' : 's'} before it costs her.)`,
      [
        lawFix
          ? { id: 'help', label: s.favors >= 1 ? '"I\'ll have a word downtown." (a favor)' : '"I\'ll take care of the detective." ($2,000)', detail: 'She owes you one. Her network grows.', because: `stood by the Madam against the vice squad`, effects: [...(s.favors >= 1 ? [{ type: 'favor', amount: -1, label } as Effect] : [{ type: 'money', amount: -2000, label } as Effect]), X({ op: 'madam', field: 'squeeze', value: 1 }, label), { type: 'opinion', from: M.id, to: s.playerId, amount: 18, reason: 'Stood by me', decay: 1, label }] }
          : { id: 'help', label: '"Two of my men will sit in your lobby." ($1,200)', detail: 'She owes you one; her network grows; the other side notices.', because: `stood by the Madam against ${rn || (oc ? oc.firstName : 'an operator')}`, effects: [{ type: 'money', amount: -1200, label }, { type: 'heat', bar: 'local', amount: 2, label }, X({ op: 'madam', field: 'squeeze', value: 1 }, label), { type: 'opinion', from: M.id, to: s.playerId, amount: 18, reason: 'Stood by me', decay: 1, label }, ...(sq.rival ? [{ type: 'rivalOpinion', rival: sq.rival, amount: -5, reason: 'Sided with the Madam', label } as Effect] : [])] },
        { id: 'no', label: '"Not this time."', detail: 'She will remember. She may make other friends.', because: `left the Madam to face the squeeze alone`, effects: [{ type: 'opinion', from: M.id, to: s.playerId, amount: -15, reason: 'Left me alone in a squeeze', decay: 1, label }, X({ op: 'madam', field: 'squeeze', value: 0 }, label)] },
        { id: 'later', label: '"Let me think about it."', detail: 'The clock keeps running.', because: 'asked the Madam for time', effects: [] },
      ], [M.id, ...(oc ? [oc.id] : [])], 50, { charId: M.id, theme: 'town', asked: 1 });
  }
  return undefined;
}

/** The weekly candidate: the Madam, a woman in trouble, a story from the web, or a hint. */
export function earsEventSource(s: GameState): EventInstance | undefined {
  const E = s.ears;
  if (!E || s.week < 2) return undefined;
  const h: RngHolder = { rng: hashSeed(`${s.seed}:${s.week}:ears`) };
  const mEv = madamEvent(s, E, h);
  if (mEv) return mEv;
  // Hooks waiting for a seat, oldest first (one a week).
  if (E.hooks.length && s.week - E.lastHook >= 2) {
    for (const hk of [...E.hooks].sort((x, y) => x.week - y.week)) {
      const id = hk.kind === 'protect' ? 'ears_protect' : hk.kind === 'leaving' ? 'ears_leaving' : `ears_web_${hk.kind}`;
      if (hk.kind !== 'protect' && hk.kind !== 'leaving' && hk.kind !== 'protector' && freshness(s, id) <= 0) continue;
      const e = hookEvent(s, E, h, hk);
      E.hooks = E.hooks.filter((x) => x !== hk);
      if (e) {
        E.lastHook = s.week;
        return e;
      }
    }
  }
  // A hint she held ("keep listening") comes back when it is ripe.
  const ripe = E.held.find((x) => x.ripe <= s.week);
  if (ripe) {
    E.held = E.held.filter((x) => x !== ripe);
    const ear = E.ears[ripe.earId];
    const t = s.characters[ripe.targetId];
    if (ear && ear.status !== 'gone' && t?.alive && s.characters[ear.id]?.alive) {
      // A low-trust Ear who also sells elsewhere may have sold it first.
      if (ear.sellsTo && ear.loyalty < 35 && rand(h) < 0.5) {
        note(s, E, `${s.characters[ear.id].firstName} sold what she was holding about ${t.firstName} to somebody else.`);
      } else {
        E.lastHint = s.week;
        return buildHint(s, E, h, ear, ripe.subject, t, true);
      }
    }
  }
  // She comes to you.
  const gap = E.madam.intel ? 3 : 4;
  if (s.week - E.lastHint < gap) return undefined;
  if (rand(h) > (E.madam.intel ? 0.42 : 0.3)) return undefined;
  const ears = Object.values(E.ears).filter((e) => e.status === 'listening' && s.characters[e.id]?.alive && (e.network !== 'madam' || !E.madam.ally));
  if (!ears.length) return undefined;
  const cands = hintCandidates(s, E).map((c) => ({ ...c, w: c.w * Math.min(2, freshness(s, `ears_hint_${c.subject}`)) })).filter((c) => c.w > 0);
  const pick0 = weighted(h, cands.map((c) => [c, c.w] as [HintPick, number]));
  if (!pick0) return undefined;
  const ear = weighted(h, ears.map((e) => [e, 10 + e.loyalty * (e.known ? 1 : 0.6) - (e.sellsTo ? 15 : 0)] as [Ear, number]).filter(([, w]) => w > 0));
  if (!ear) return undefined;
  E.lastHint = s.week;
  E.stats.hints++;
  ear.hints++;
  ear.lastHint = s.week;
  return buildHint(s, E, h, ear, pick0.subject, pick0.target, false);
}

registerEventSource(earsEventSource);

/* ------------------------------------------------------------------ */
/* Views for the UI                                                    */
/* ------------------------------------------------------------------ */

export interface EarView {
  ear: Ear;
  c: Character;
  line: string;
  job?: EarJob;
  bio: string;
}

export function earViews(s: GameState, includeUnknown = false): EarView[] {
  const E = s.ears;
  if (!E) return [];
  return Object.values(E.ears)
    .filter((e) => (includeUnknown || e.known) && s.characters[e.id])
    .map((e) => ({ ear: e, c: s.characters[e.id], line: earLine(s, e), job: E.jobs.find((j) => j.earId === e.id), bio: EAR_BIO[hashSeed(e.id) % EAR_BIO.length] }))
    .sort((a, b) => Number(a.ear.status === 'gone') - Number(b.ear.status === 'gone') || b.ear.loyalty - a.ear.loyalty);
}

export function trustWord(v: number): string {
  return v >= 75 ? 'Devoted' : v >= 55 ? 'Trusts you' : v >= 35 ? 'Warming' : v >= 20 ? 'Wary' : 'Cold';
}

export { GOAL_TEXT, BOUNDARY_TEXT, WORK_LABEL };
