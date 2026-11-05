import { ageOn } from './calendar';
import { displayName, hasTrait, isFree, makeCharacter, player } from './characters';
import { datingLog, ensureBond, herDecision, isAdult, stageOf } from './dating';
import { adultOn, ensureDating } from './datingState';
import { applyEffects } from './effects';
import { marriageable } from './familyHouses';
import { houseById, houseOf, type House } from './familyState';
import { eveningsLeft } from './goomar';
import { leakIntel } from './honey';
import { addSign } from './honeyCore';
import { ensureHoney } from './honeyState';
import { allure, appetite, looksOf } from './looks';
import { bumpStanding, circleOf, coffeeDowry, ensureMatchmakers, type Weigh } from './matchmakers';
import { addOpinion, opinion } from './relations';
import { hashSeed } from './rng';
import { activeRomances, drawnTo, kin, romanceBetween } from './romance';
import type { ActionPreview } from './actions';
import type { Acceptance, Reason } from './interactions';
import type { Ctx } from './ledger';
import type { Character, Effect, FactionId, GameState, RivalId } from './types';

/**
 * SINGLE: the women who come to HIM, and his mother's match.
 *
 * The owner's ask (2026-11-05): "need more women that seek you out when
 * single or your mom tries to fix you up".
 *
 * 1. WHO COMES TO HIM. A single boss (no living wife, a widower, or
 *    separated) gets approached: a widow at St. Ann's, a girl at the club, a
 *    showgirl, a schoolteacher, a waitress, a rival's daughter, a woman from a
 *    good family. How often reads his allure (looks, Charming, a ladies' man,
 *    his appetite), his respect, his money and the season (approachRate,
 *    with its reasons on the screen). Each comes as ONE open card (who she is,
 *    why she is interested, the odds) with four answers: take her out, slow it
 *    down, turn her down kindly, turn her down cold. A rival's game is a honey
 *    trap (honey.ts keeps the agent). A married boss gets far fewer, and they
 *    are an affair if anything (mature content only, the dating rules apply).
 *    No popup: the card waits on the Desk (a request in the inbox, so it
 *    takes a Desk seat only where one is free) and on Relationships & Dating.
 *    The honey layer's stranger at the bar becomes this card for a single
 *    boss instead of its popup, so a single boss sees fewer interruptions,
 *    not more.
 *
 * 2. MA'S MATCH. When he is single and 25 or older, his mother (else a
 *    grandmother, an aunt, a sister, else the eldest woman of the house)
 *    brings him a match: matchmakers.ts' arranger, extended to the boss. She
 *    picks by what she weighs (a good Catholic girl, money, an alliance, peace
 *    with a rival family, grandchildren) from the houses or the parish, settles
 *    the coffee terms with the other mother, and brings the card. He can meet
 *    her (Sunday dinner, both families), say "not now, Ma", say he will find
 *    his own, or let Ma decide (she arranges the courtship). Her standing (her
 *    circle in matchmakers.ts) and her opinion of him move; she nags when he
 *    keeps putting her off. If he marries her pick, the matchmakers' "mom knows
 *    best" beat comes a year on.
 *
 * Hard rules: adults only (18+, checked at every step); she decides every
 * time (and her family; nobody is pushed); nothing explicit; nobody real.
 * State lives on `GameState.single` (optional: made the first time something
 * happens; upgradeSave only tops up a save that has it). Every roll is a hash
 * of (seed, week, purpose): no dice stream of its own. A woman the layer
 * makes is made on her own seed, so the game's dice never move.
 */

export type Who = 'widow' | 'club' | 'showgirl' | 'teacher' | 'waitress' | 'rivalDaughter' | 'goodFamily';
export type Motive = 'money' | 'looks' | 'power' | 'love' | 'family' | 'rival';
export type ComeAnswer = 'out' | 'slow' | 'kind' | 'cold';
export type MaWeigh = 'church' | 'money' | 'alliance' | 'peace' | 'grandkids';
export type MaAnswer = 'meet' | 'notNow' | 'own' | 'decide';

export interface Approach {
  /** Her character id. */
  id: string;
  w: number;
  who: Who;
  /** Why she is interested, as far as he can tell (a rival's game may wear another face). */
  why: Motive;
  /** He was married when she came: an affair, if anything. */
  m?: 1;
}

export interface FixUp {
  /** The woman Ma picked. */
  id: string;
  /** Ma (or the woman of the house who does the asking). */
  by: string;
  w: number;
  weigh: MaWeigh;
  why: string[];
  /** Her house, when she comes from one. */
  house?: string;
  /** The other mother: a character id, or just a name. */
  mother: string;
}

export interface SingleState {
  v: 1;
  open?: Approach;
  fix?: FixUp;
  /** Week of the last approach. */
  last?: number;
  /** Week before which Ma will not bring another. */
  rest?: number;
  /** How many times in a row he has put her off. */
  nag: number;
  /** Ma's picks he took to dinner or let her arrange: watched for a wedding (then the mom-knows-best beat). */
  wed: { id: string; by: string; w: number; weigh: MaWeigh; house?: string }[];
  n: { appr: number; fix: number; yes: number };
}

export function ensureSingle(s: GameState): SingleState {
  if (!s.single) s.single = { v: 1, nag: 0, wed: [], n: { appr: 0, fix: 0, yes: 0 } };
  const S = s.single;
  S.nag ??= 0;
  S.wed ??= [];
  S.n = { appr: 0, fix: 0, yes: 0, ...(S.n ?? {}) };
  return S;
}

/* ------------------------------------------------------------------ */
/* Words                                                               */
/* ------------------------------------------------------------------ */

export const WHO_INFO: Record<Who, { label: string; age: [number, number]; how: string; scene: string }> = {
  widow: { label: 'A widow from St. Ann\'s', age: [29, 44], how: 'After the nine o\'clock Mass', scene: 'waits by the holy-water font and asks if you would walk her to her car. Her husband has been gone two years; she says it plainly, and smiles anyway' },
  club: { label: 'A girl at the club', age: [21, 29], how: 'At the bar of the Riptide', scene: 'leans on the bar beside you and asks for a light. Then she asks your name, though she knows it' },
  showgirl: { label: 'A showgirl from the Rhumba Terrace', age: [21, 30], how: 'After the late show', scene: 'sends a note to your table, lipstick on a cocktail napkin: "Third from the left. Buy me breakfast?"' },
  teacher: { label: 'A schoolteacher from the Crest', age: [23, 34], how: 'At the parish bake sale', scene: 'talked you into the last pie, then asked whether you would be back next Saturday. She was not asking about pie' },
  waitress: { label: 'A waitress at the diner', age: [19, 30], how: 'Every morning at the Doo Wop diner', scene: 'has topped off your coffee without asking all month. Today she wrote her number on the check' },
  rivalDaughter: { label: 'A rival\'s daughter', age: [19, 32], how: 'At the Columbus Day feast', scene: 'crosses the hall to you in front of her father\'s men, and asks you to dance' },
  goodFamily: { label: 'A woman from a good family', age: [20, 33], how: 'At the Policemen\'s Ball', scene: 'was seated beside you by her mother\'s arrangement. She did the rest herself' },
};

export const MOTIVE_INFO: Record<Motive, { label: string; line: string }> = {
  money: { label: 'Your money', line: 'she has seen the Cadillac, and the tips you leave' },
  looks: { label: 'Your looks', line: 'she likes what she sees' },
  power: { label: 'Your power', line: 'she likes how a room goes quiet when you walk in' },
  love: { label: 'Love, maybe', line: 'she has had her eye on you a long time' },
  family: { label: 'Her family is pushing her', line: 'her mother wants her married to a man of standing' },
  rival: { label: 'A rival\'s game?', line: 'her father would like to know what you say over dinner' },
};

export const MA_WEIGH: Record<MaWeigh, { label: string; line: string; matches: Weigh }> = {
  church: { label: 'A good Catholic girl', line: 'she wants it blessed and proper', matches: 'church' },
  money: { label: 'Money', line: 'she wants you comfortable, and a dowry that shows it', matches: 'money' },
  alliance: { label: 'An alliance', line: 'she wants the house safe', matches: 'alliance' },
  peace: { label: 'Peace with a rival family', line: 'a wedding ends a war faster than a funeral', matches: 'alliance' },
  grandkids: { label: '"She\'ll give me grandchildren"', line: 'she wants grandchildren while she can still hold them', matches: 'love' },
};

export const COME_TITLE: Record<ComeAnswer, string> = { out: 'Take her out', slow: 'Slow it down', kind: 'Turn her down kindly', cold: 'Turn her down cold' };
export const MA_TITLE: Record<MaAnswer, string> = { meet: 'Meet her', notNow: '"Not now, Ma"', own: '"I\'ll find my own"', decide: 'Let Ma decide' };

/** Weeks an approach waits before she moves on; weeks Ma waits before she takes silence as "not now". */
export const OPEN_WEEKS = 3;
export const FIX_WEEKS = 6;
/** Weeks between Ma's matches (shorter once she starts nagging). */
export const FIX_GAP = 14;
export const FIX_AGE = 25;
const OUT_COST = 60;

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(v)));
const roll = (k: string) => (hashSeed(k) % 100003) / 100003;
const ageOf = (s: GameState, c: Character) => ageOn(c.birth, s.date);

/* ------------------------------------------------------------------ */
/* Who is single; who is Ma                                            */
/* ------------------------------------------------------------------ */

/** His living wife, if any (separated or not). */
export function wifeOf(s: GameState): Character | undefined {
  const b = player(s);
  const w = b?.spouseId ? s.characters[b.spouseId] : undefined;
  return w?.alive ? w : undefined;
}

/** Single in the island's eyes: no living wife, a widower, or separated. */
export function isSingle(s: GameState): boolean {
  const w = wifeOf(s);
  return !w || stageOf(s, w.id) === 'separated';
}

/** The boss this layer works for: a grown man, alive and free. */
function bossReady(s: GameState): Character | undefined {
  const b = player(s);
  if (!b?.alive || b.gender !== 'M' || !isAdult(s, b) || !isFree(s, b)) return undefined;
  if (s.travel?.fugitives.some((f) => !f.end && f.personId === b.id)) return undefined;
  return b;
}

/** The woman who fixes him up: his mother; else a grandmother, an aunt, a sister; else the eldest woman of the house. */
export function fixerOf(s: GameState): Character | undefined {
  const b = player(s);
  if (!b) return undefined;
  const ok = (c: Character | undefined): c is Character => !!c?.alive && c.gender === 'F' && c.id !== b.id && ageOf(s, c) >= 18 && c.id !== b.spouseId;
  const mom = b.motherId ? s.characters[b.motherId] : undefined;
  if (ok(mom)) return mom;
  const parents = [b.motherId, b.fatherId].map((id) => (id ? s.characters[id] : undefined)).filter((c): c is Character => !!c);
  const grand = parents.map((p) => (p.motherId ? s.characters[p.motherId] : undefined)).find(ok);
  if (grand) return grand;
  const gp = new Set(parents.flatMap((p) => [p.motherId, p.fatherId]).filter(Boolean));
  const aunts = Object.values(s.characters).filter((c) => ok(c) && !parents.includes(c) && ((c.motherId && gp.has(c.motherId)) || (c.fatherId && gp.has(c.fatherId))));
  aunts.sort((x, y) => ageOf(s, y) - ageOf(s, x) || x.id.localeCompare(y.id));
  if (aunts[0]) return aunts[0];
  const sisters = Object.values(s.characters).filter((c) => ok(c) && ((b.motherId && c.motherId === b.motherId) || (b.fatherId && c.fatherId === b.fatherId)));
  sisters.sort((x, y) => ageOf(s, y) - ageOf(s, x) || x.id.localeCompare(y.id));
  if (sisters[0]) return sisters[0];
  const women = Object.values(s.characters).filter((c) => ok(c) && c.dynasty && c.faction === 'player' && ageOf(s, c) >= 30);
  women.sort((x, y) => ageOf(s, y) - ageOf(s, x) || x.id.localeCompare(y.id));
  return women[0];
}

/** What she is to him, in a word ("Ma" when it is his mother). */
export function fixerRole(s: GameState, c: Character): string {
  const b = player(s);
  if (b.motherId === c.id) return 'your mother';
  if ([b.motherId, b.fatherId].some((id) => id && s.characters[id]?.motherId === c.id)) return 'your grandmother';
  if ((b.motherId && c.motherId === b.motherId) || (b.fatherId && c.fatherId === b.fatherId)) return 'your sister';
  const gp = [b.motherId, b.fatherId].map((id) => (id ? s.characters[id] : undefined)).flatMap((p) => [p?.motherId, p?.fatherId]).filter(Boolean);
  if ((c.motherId && gp.includes(c.motherId)) || (c.fatherId && gp.includes(c.fatherId))) return 'your aunt';
  return 'the eldest woman of the house';
}

/** "Ma", "Nonna", "Aunt Rose", "Rose". */
export function fixerCall(s: GameState, c: Character): string {
  const r = fixerRole(s, c);
  return r === 'your mother' ? 'Ma' : r === 'your grandmother' ? 'Nonna' : r === 'your aunt' ? `Aunt ${c.firstName}` : c.firstName;
}

/* ------------------------------------------------------------------ */
/* How often: his pull                                                  */
/* ------------------------------------------------------------------ */

/**
 * How many women come to him in a year, with every reason: his looks, Charming, a ladies' man, his appetite,
 * his respect, his money, his rank, the season, his age, whether he is seeing someone. A married man gets a
 * small share of it (and only with mature content on).
 */
export function approachRate(s: GameState): { perYear: number; reasons: Reason[]; single: boolean } {
  const boss = player(s);
  const reasons: Reason[] = [];
  const add = (label: string, value: number) => { if (value) reasons.push({ label, value: Math.round(value) }); };
  const l = looksOf(s, boss).score;
  if (l !== undefined) add(l >= 50 ? 'Your looks' : 'Your looks, such as they are', (l - 50) / 2.5);
  if (hasTrait(boss, 'Charming')) add('Charming', 12);
  if (hasTrait(boss, 'Womanizer')) add('A ladies\' man: they can tell', 10);
  const ap = appetite(s, boss);
  if (ap >= 70) add('A big appetite: you look back', (ap - 60) / 3);
  else if (ap <= 30) add('You hardly look up', -5);
  add('Your respect on the island', Math.max(-10, Math.min(15, (s.respect - 35) / 3)));
  const w = Math.max(1000, (boss.wealth ?? 0) + Math.max(0, s.tribute?.acct.personal ?? 0));
  add('Your money: the car, the tips', Math.max(-5, Math.min(20, (Math.log10(w) - 4) * 10)));
  if (boss.rank === 'boss') add('The boss\'s name', 6);
  else if (boss.rank === 'underboss' || boss.rank === 'consigliere' || boss.rank === 'capo') add('A man of standing', 3);
  const m = s.date.m;
  if (m >= 6 && m <= 8) add('Summer at the shore', 10);
  else if (m === 12) add('The holiday parties', 4);
  else if (m <= 2) add('Winter: the island is empty', -6);
  const a = ageOf(s, boss);
  if (a >= 60) add('Your age', -12);
  else if (a >= 50) add('Your age', -6);
  else if (a < 30) add('Young', 3);
  const wife = wifeOf(s);
  if (activeRomances(s, boss.id).some((r) => r.a !== wife?.id && r.b !== wife?.id)) add('You are seeing someone', -15);
  const sum = reasons.reduce((x, r) => x + r.value, 0);
  const single = isSingle(s);
  let perYear = Math.max(1, Math.min(16, 4 * Math.pow(2, sum / 25)));
  if (!single) {
    perYear = adultOn(s) ? Math.max(0.2, perYear * 0.12) : 0;
    reasons.push({ label: adultOn(s) ? 'You are married: a few still try' : 'You are married (and mature content is off)', value: -100 });
  }
  return { perYear: Math.round(perYear * 10) / 10, reasons, single };
}

/* ------------------------------------------------------------------ */
/* Who she is                                                          */
/* ------------------------------------------------------------------ */

function freeFor(s: GameState, boss: Character, c: Character | undefined): c is Character {
  if (!c?.alive || c.gender !== 'F' || !isAdult(s, c) || c.spouseId || kin(boss, c) || c.dynasty) return false;
  if (romanceBetween(s, boss.id, c.id) || s.dating?.bonds[c.id]) return false;
  if (s.single?.open?.id === c.id || s.single?.fix?.id === c.id) return false;
  return drawnTo(s, c, boss);
}

function rivalOf(s: GameState, h: House): RivalId | undefined {
  const r = s.rivals.find((x) => x.id === h.faction && x.kind === 'mob');
  return r?.id;
}

function hostileRival(s: GameState): RivalId | undefined {
  const mobs = s.rivals.filter((r) => r.kind === 'mob' && s.characters[r.leaderId]?.alive).sort((a, b) => a.id.localeCompare(b.id));
  const worst = mobs.map((r) => ({ r, v: opinion(s, r.leaderId, s.playerId) - (r.war ? 60 : r.feud ? 30 : 0) })).sort((a, b) => a.v - b.v)[0];
  return worst && worst.v <= -30 ? worst.r.id : undefined;
}

function housePick(s: GameState, boss: Character, kind: 'rival' | 'good', salt: string): { c: Character; h: House } | undefined {
  const out: { c: Character; h: House }[] = [];
  for (const h of s.dyn?.houses ?? []) {
    const fits = kind === 'rival' ? !!rivalOf(s, h) : h.kind === 'legit' || h.kind === 'political';
    if (!fits) continue;
    for (const c of marriageable(s, h)) if (freeFor(s, boss, c) && Math.abs(ageOf(s, c) - ageOf(s, boss)) <= 22) out.push({ c, h });
  }
  out.sort((a, b) => a.c.id.localeCompare(b.c.id));
  return out.length ? out[Math.floor(roll(salt) * out.length)] : undefined;
}

/** A woman of the island, made on her own seed (the game's dice never move). */
function townWoman(s: GameState, salt: string, age: [number, number], wealth: number): Character {
  const main = s.rng;
  s.rng = hashSeed(`${s.seed}|single|${salt}`);
  try {
    const a = age[0] + Math.floor(roll(`${s.seed}|${salt}|age`) * (age[1] - age[0] + 1));
    const c = makeCharacter(s, { gender: 'F', age: Math.max(19, a), rank: 'civilian', faction: 'none', nickname: false, wealth });
    while (ageOf(s, c) < 19) c.birth = { ...c.birth, y: c.birth.y - 1 };
    c.orientation = 'straight';
    c.traits = c.traits.filter((t) => t !== 'Cruel');
    return c;
  } finally { s.rng = main; }
}

function weighted<T extends string>(w: Partial<Record<T, number>>, r: number): T | undefined {
  const keys = (Object.keys(w) as T[]).filter((k) => (w[k] ?? 0) > 0).sort();
  const tot = keys.reduce((a, k) => a + (w[k] ?? 0), 0);
  let x = r * tot;
  for (const k of keys) { x -= w[k] ?? 0; if (x < 0) return k; }
  return keys[keys.length - 1];
}

function pickApproach(s: GameState, boss: Character, single: boolean): { c: Character; who: Who; why: Motive; agent?: RivalId } | undefined {
  const k = `${s.seed}|single|${s.week}`;
  const rival = single ? housePick(s, boss, 'rival', `${k}|rh`) : undefined;
  const good = single ? housePick(s, boss, 'good', `${k}|gh`) : undefined;
  const ww: Partial<Record<Who, number>> = single
    ? { widow: ageOf(s, boss) >= 30 ? 2 : 0, club: 3, showgirl: 2, teacher: 2, waitress: 3, rivalDaughter: rival ? 2 : 0, goodFamily: good ? 2 : 0 }
    : { club: 3, showgirl: 2, waitress: 2, widow: 1 };
  const who = weighted(ww, roll(`${k}|who`));
  if (!who) return undefined;
  const boss$ = Math.log10(Math.max(1000, boss.wealth ?? 0));
  const looks = looksOf(s, boss).score ?? 50;
  const hostile = adultOn(s) ? hostileRival(s) : undefined;
  const mw: Partial<Record<Motive, number>> = {
    money: 1 + Math.max(0, boss$ - 4) * 2 + (who === 'showgirl' || who === 'club' ? 1 : 0),
    looks: 1 + Math.max(0, (looks - 50) / 12),
    power: 1 + Math.max(0, (s.respect - 30) / 20) + (who === 'club' ? 1 : 0),
    love: who === 'widow' || who === 'teacher' || who === 'waitress' ? 3 : 1,
    family: who === 'goodFamily' ? 6 : who === 'rivalDaughter' ? 2 : who === 'teacher' || who === 'widow' ? 1 : 0,
    rival: who === 'rivalDaughter' ? 3 : hostile && (who === 'club' || who === 'showgirl') ? 1 : 0,
  };
  const why = weighted(mw, roll(`${k}|why`)) ?? 'looks';
  let c: Character | undefined;
  let agent: RivalId | undefined;
  if (who === 'rivalDaughter' && rival) { c = rival.c; if (why === 'rival') agent = rivalOf(s, rival.h); }
  else if (who === 'goodFamily' && good) c = good.c;
  else {
    const info = WHO_INFO[who];
    c = townWoman(s, `${s.week}|${who}`, info.age, who === 'widow' ? 1500 : 300);
    if (why === 'rival' && hostile) agent = hostile;
  }
  if (!c || !isAdult(s, c)) return undefined;
  return { c, who, why, agent };
}

/** Open the card: she has come to him. Records the honey agent when it is a rival's game. */
function openApproach(s: GameState, c: Character, who: Who, why: Motive, single: boolean, agent?: { kind: 'rival' | 'setup' | 'fbi'; master: FactionId }): Approach {
  const S = ensureSingle(s);
  const a: Approach = { id: c.id, w: s.week, who, why, ...(single ? {} : { m: 1 as const }) };
  S.open = a;
  S.last = s.week;
  S.n.appr++;
  if (agent && adultOn(s)) {
    const H = ensureHoney(s);
    if (!H.agents[c.id]) {
      H.agents[c.id] = { id: c.id, kind: agent.kind, master: agent.master, since: s.week, status: 'working', intel: 0 };
      H.stats.agents++;
    }
    H.seen[c.id] = s.week;
  }
  return a;
}

/* ------------------------------------------------------------------ */
/* The honey layer's stranger becomes his card (no popup)              */
/* ------------------------------------------------------------------ */

/** The approach card is free to take a new woman (single boss, nobody waiting). */
export function approachSlotFree(s: GameState): boolean {
  return !!bossReady(s) && isSingle(s) && !s.single?.open && (s.single?.last === undefined || s.week - s.single.last >= OPEN_WEEKS);
}

/** honey.ts: the stranger who sends over a drink comes to a single boss as his card instead of a popup. */
export function takeHoneyApproach(s: GameState, c: Character, agent: boolean): void {
  const why: Motive = agent ? 'power' : (['looks', 'money', 'power'] as Motive[])[hashSeed(`${s.seed}|hwhy|${c.id}`) % 3];
  openApproach(s, c, 'club', why, true);
}

/* ------------------------------------------------------------------ */
/* Ma's match                                                           */
/* ------------------------------------------------------------------ */

export function maWeighOf(s: GameState, ma: Character): MaWeigh {
  const boss = player(s);
  const r = (k: string) => roll(`${s.seed}|maweigh|${ma.id}|${k}`) * 20;
  const war = s.rivals.some((x) => x.war || x.feud);
  const sc: Record<MaWeigh, number> = {
    church: 14 + (hasTrait(ma, 'Pious') ? 30 : 0) + r('church'),
    money: 8 + (hasTrait(ma, 'Greedy') ? 28 : 0) + r('money'),
    alliance: 8 + (hasTrait(ma, 'Ambitious') ? 22 : 0) + r('alliance'),
    peace: (war ? 30 : 0) + r('peace'),
    grandkids: 10 + (ageOf(s, boss) >= 33 ? 20 : 0) + (boss.childrenIds.length ? -12 : 8) + r('grandkids'),
  };
  return (Object.keys(sc) as MaWeigh[]).sort((a, b) => sc[b] - sc[a] || a.localeCompare(b))[0];
}

/** How well a woman answers what Ma weighs, with Ma's own words. */
function maScore(s: GameState, weigh: MaWeigh, boss: Character, c: Character, h?: House): { v: number; why: string } {
  const sweet = roll(`${s.seed}|masweet|${c.id}`);
  const pious = hasTrait(c, 'Pious');
  const same = boss.ethnicity === c.ethnicity;
  const a = ageOf(s, c);
  const r = h ? s.rivals.find((x) => x.id === h.faction) : undefined;
  switch (weigh) {
    case 'church': return { v: 25 + (same ? 18 : 0) + (pious ? 25 : 0) + (h?.kind === 'legit' ? 6 : !h ? 10 : 0), why: pious ? `${c.firstName} never misses the nine o'clock Mass` : `the same parish, the same saints: Father will be pleased` };
    case 'money': return { v: 15 + (h ? Math.min(40, h.dowry / 100) + (h.kind === 'legit' || h.kind === 'political' ? 12 : 0) : 0), why: h ? `with ${h.name} comes money, and a name that opens doors on Pacific Avenue` : `a sensible girl who knows the value of a dollar` };
    case 'alliance': return { v: 10 + (h ? h.strength / 2 + (h.kind === 'mob' || h.kind === 'philly' ? 12 : 0) : 0), why: h ? `with ${h.name} as family, we never stand alone` : `a good girl, at least` };
    case 'peace': return { v: 5 + (r?.war || r?.feud ? 45 : r ? 20 : 0) + (h?.kind === 'mob' ? 8 : 0), why: r ? `marry into ${h!.name} and the shooting stops: a wedding ends a war faster than a funeral` : `a peaceful girl from a peaceful family` };
    case 'grandkids': return { v: 20 + (a >= 20 && a <= 28 ? 25 : a <= 32 ? 10 : 0) + sweet * 15, why: `${c.firstName} is from a big family: eight brothers and sisters. "She'll give me grandchildren"` };
  }
}

/** A nice girl from the parish (made on her own seed when the houses have nobody, or when Ma wants the parish). */
function parishGirl(s: GameState, boss: Character): Character {
  const a = ageOf(s, boss);
  const hi = Math.max(22, Math.min(36, a - 2));
  const c = townWoman(s, `parish|${s.week}`, [Math.min(21, hi), hi], 600);
  if (roll(`${s.seed}|parishpious|${c.id}`) < 0.5 && !c.traits.includes('Pious')) c.traits = [...c.traits.slice(0, 2), 'Pious'];
  if (boss.ethnicity) c.ethnicity = boss.ethnicity;
  return c;
}

/** Ma's ranked picks (best first). Adults only, single, not kin. */
export function maPicks(s: GameState, ma: Character, weigh = maWeighOf(s, ma)): { c: Character; h?: House; v: number; why: string }[] {
  const boss = player(s);
  const out: { c: Character; h?: House; v: number; why: string }[] = [];
  for (const h of s.dyn?.houses ?? []) {
    for (const c of marriageable(s, h)) {
      if (!freeFor(s, boss, c) || ageOf(s, c) > ageOf(s, boss) + 3 || ageOf(s, boss) - ageOf(s, c) > 20) continue;
      const sc = maScore(s, weigh, boss, c, h);
      out.push({ c, h, v: sc.v + roll(`${s.seed}|mapick|${c.id}`) * 10, why: sc.why });
    }
  }
  return out.sort((a, b) => b.v - a.v || a.c.id.localeCompare(b.c.id));
}

function otherMother(s: GameState, c: Character, h?: House): string {
  const mom = c.motherId ? s.characters[c.motherId] : undefined;
  if (mom?.alive) return mom.id;
  const head = h ? s.characters[h.headId] : undefined;
  const w = head?.spouseId ? s.characters[head.spouseId] : undefined;
  if (w?.alive && w.gender === 'F') return w.id;
  return `Mrs. ${head?.lastName ?? c.lastName}`;
}

export function motherName(s: GameState, m: string): string {
  const c = s.characters[m];
  return c ? `${c.firstName} ${c.lastName}` : m;
}

function makeFix(s: GameState, ma: Character, boss: Character): FixUp | undefined {
  const weigh = maWeighOf(s, ma);
  const picks = maPicks(s, ma, weigh);
  const parishFirst = (weigh === 'church' || weigh === 'grandkids') && roll(`${s.seed}|${s.week}|parish`) < 0.5;
  let c: Character;
  let h: House | undefined;
  let why: string;
  if (!picks.length || parishFirst) {
    c = parishGirl(s, boss);
    const sc = maScore(s, weigh, boss, c);
    why = weigh === 'church' || weigh === 'grandkids' ? sc.why : `a nice girl from the parish, ${c.firstName} ${c.lastName}; her mother sings in the choir`;
  } else {
    c = picks[0].c;
    h = picks[0].h;
    why = picks[0].why;
  }
  if (!isAdult(s, c)) return undefined;
  const lines = [why, MA_WEIGH[weigh].line];
  if (s.single?.nag) lines.push(s.single.nag >= 3 ? 'she has stopped asking nicely: she lights a candle for you every morning' : 'she has asked before, and she will ask again');
  return { id: c.id, by: ma.id, w: s.week, weigh, why: lines, house: h?.id, mother: otherMother(s, c, h) };
}

/* ------------------------------------------------------------------ */
/* The odds                                                            */
/* ------------------------------------------------------------------ */

/** She came to him: will she want a second evening after the first? The dating rules apply (a married man, her own marriage, piety...). */
export function outOdds(s: GameState, a: Approach): Acceptance {
  const c = s.characters[a.id];
  const boss = player(s);
  if (!c || !isAdult(s, c)) return { chance: 0, reasons: [{ label: 'Adults only', value: -100 }] };
  const base = herDecision(s, c, 'date', 'dinner');
  const extra: Reason[] = [{ label: 'She came to you', value: 28 }];
  if (a.why === 'love') extra.push({ label: 'She has wanted this a while', value: 10 });
  if (a.why === 'family') extra.push({ label: 'Her family wants it', value: 5 });
  if (a.why === 'money' && (boss.wealth ?? 0) >= 50000) extra.push({ label: 'Your money speaks for you', value: 6 });
  if (a.why === 'rival') extra.push({ label: 'She wants this to work (for her own reasons)', value: 12 });
  const sum = Math.round(base.chance * 100) + extra.reduce((x, r) => x + r.value, 0);
  return { chance: Math.max(0.05, Math.min(0.92, sum / 100)), reasons: [...base.reasons, ...extra] };
}

/** Ma's pick (and her family) agreeing: to Sunday dinner, or to the courtship Ma arranges. */
export function maOdds(s: GameState, f: FixUp, answer: 'meet' | 'decide'): Acceptance {
  const c = s.characters[f.id];
  const boss = player(s);
  const ma = s.characters[f.by];
  if (!c || !isAdult(s, c) || !isAdult(s, boss)) return { chance: 0, reasons: [{ label: 'Adults only', value: -100 }] };
  if (!drawnTo(s, c, boss)) return { chance: 0, reasons: [{ label: 'Not interested in you that way', value: -100 }] };
  const base = answer === 'meet' ? 62 : 48;
  const rs: Reason[] = [];
  const al = allure(s, boss, c);
  for (const r of al.reasons) rs.push({ label: r.label, value: Math.round(r.value * 0.6) });
  const st = ma ? circleOf(s, ma.id)?.standing ?? 10 : 10;
  if (st >= 15) rs.push({ label: `${ma?.firstName ?? 'Her'} standing among the women`, value: Math.round(st / 5) });
  const h = f.house ? houseById(s, f.house) : undefined;
  const head = h ? s.characters[h.headId] : undefined;
  if (head?.alive) { const o = opinion(s, head.id, boss.id); if (o) rs.push({ label: `${head.firstName} ${head.lastName} ${o >= 0 ? 'thinks well of you' : 'thinks little of you'}`, value: Math.max(-20, Math.min(15, Math.round(o / 4))) }); }
  const r = h ? s.rivals.find((x) => x.id === h.faction) : undefined;
  if (r?.war) rs.push({ label: `Her family is at war with yours`, value: -15 });
  const o = opinion(s, c.id, boss.id);
  if (o) rs.push({ label: o >= 0 ? 'She thinks well of you' : 'She thinks little of you', value: Math.round(o / 5) });
  if (hasTrait(c, 'Pious') && f.weigh === 'church') rs.push({ label: 'A match the priest would bless', value: 6 });
  if (answer === 'decide') rs.push({ label: `${ma?.firstName ?? 'She'} arranges it the old way, mother to mother`, value: 8 });
  const age = Math.abs(ageOf(s, c) - ageOf(s, boss));
  if (age > 12) rs.push({ label: `${age} years apart`, value: -Math.min(20, (age - 12) * 2) });
  if (activeRomances(s, c.id).some((x) => x.a !== boss.id && x.b !== boss.id)) rs.push({ label: 'She is seeing someone', value: -30 });
  if (hasTrait(boss, 'Cruel')) rs.push({ label: 'People say you have a cruel streak', value: -10 });
  const sum = rs.reduce((x, y) => x + y.value, base);
  return { chance: Math.max(0.05, Math.min(0.92, sum / 100)), reasons: [{ label: 'Base', value: base }, ...rs.filter((x) => x.value !== 0)] };
}

/* ------------------------------------------------------------------ */
/* Orders (dating ops: dating.ts delegates here)                       */
/* ------------------------------------------------------------------ */

export type SingleAction =
  | { op: 'come'; id: string; a: ComeAnswer }
  | { op: 'ma'; id: string; a: MaAnswer };

export type SingleOp = SingleAction
  | { op: 'comeNo'; id: string }
  | { op: 'maNo'; id: string; a: MaAnswer };

const X = (op: SingleOp, label: string): Effect => ({ type: 'dating', op, label }) as Effect;

function pre(title: string, because: string, disabledReason?: string): ActionPreview {
  return { title, effects: [], cost: 0, because, category: 'event', disabledReason };
}

export function openApproachOf(s: GameState): Approach | undefined {
  const a = s.single?.open;
  if (!a) return undefined;
  const c = s.characters[a.id];
  if (!c?.alive || !isAdult(s, c) || s.week - a.w > OPEN_WEEKS) return undefined;
  return a;
}

export function openFixOf(s: GameState): FixUp | undefined {
  const f = s.single?.fix;
  if (!f) return undefined;
  const c = s.characters[f.id];
  const ma = s.characters[f.by];
  if (!c?.alive || !ma?.alive || !isAdult(s, c) || c.spouseId || !isSingle(s)) return undefined;
  return f;
}

export function previewSingle(s: GameState, a: SingleAction): ActionPreview {
  const c = s.characters[a.id];
  const her = c?.firstName ?? 'her';
  const boss = player(s);
  const ready = bossReady(s) ? undefined : 'You are not free to';
  if (a.op === 'come') {
    const ap = openApproachOf(s);
    const title = `${COME_TITLE[a.a]}: ${her}`;
    if (!ap || ap.id !== a.id || !c) return pre(title, 'answered a woman who came to you', 'She is not waiting any more');
    const lbl = `${her} came to you`;
    switch (a.a) {
      case 'out': {
        const ev = eveningsLeft(s);
        const odds = outOdds(s, ap);
        return {
          ...pre(title, `took ${her} out`, ready ?? (ev <= 0 ? 'No evenings left this week' : odds.chance === 0 ? odds.reasons[0]?.label : undefined)),
          cost: OUT_COST, pot: 'pocket',
          detail: `Dinner at the Admiral and a walk on the boardwalk after (${'$'}${OUT_COST}, your pocket; one of your evenings, ${Math.max(0, ev)} left). Then she decides whether she wants a second one.${ap.m ? ' You are married: this is the start of an affair, and your wife may hear of it.' : ''} Fade to the morning.`,
          effects: [{ type: 'money', pot: 'pocket', amount: -OUT_COST, label: `Dinner with ${her}` }, X(a, lbl)],
          acceptance: odds, oddsLabel: 'She wants a second evening',
          refuseEffects: [{ type: 'money', pot: 'pocket', amount: -OUT_COST, label: `Dinner with ${her}` }, X({ op: 'comeNo', id: a.id }, lbl)],
          warning: ap.m ? 'Married: about 15% your wife hears of it.' : undefined,
          verb: `Take ${her} out — $${OUT_COST}`,
        };
      }
      case 'slow':
        return { ...pre(title, `took it slow with ${her}`, ready), effects: [X(a, lbl)], detail: `Coffee, a walk, your number on a matchbook. No evening, no money. She stays interested if she is the patient kind; a woman in a hurry may lose interest.`, verb: 'Slow it down' };
      case 'kind':
        return { ...pre(title, `turned ${her} down kindly`, ready), effects: [X(a, lbl)], detail: `"You're a lovely girl, and I'm flattered." She thinks well of you for it.${ap.who === 'goodFamily' || ap.who === 'rivalDaughter' ? ' Her family takes it in good part, mostly.' : ''}`, verb: 'Turn her down kindly' };
      case 'cold':
        return { ...pre(title, `turned ${her} down cold`, ready), effects: [X(a, lbl)], detail: `In front of people. She will not forget it${ap.who === 'goodFamily' || ap.who === 'rivalDaughter' ? ', and neither will her father' : ''}. Some of the crew like a boss nobody gets close to.`, verb: 'Turn her down cold' };
    }
  }
  // Ma's match.
  const f = openFixOf(s);
  const title = `${MA_TITLE[a.a]}: ${her}`;
  if (!f || f.id !== a.id || !c) return pre(title, 'answered his mother', 'There is no match waiting');
  const ma = s.characters[f.by];
  const call = fixerCall(s, ma);
  const lbl = `${call}'s match: ${her}`;
  const h = f.house ? houseById(s, f.house) : undefined;
  const dowry = h ? coffeeDowry(s, boss, h, ma.id) : 0;
  const coffee = `Coffee in ${motherName(s, f.mother)}'s kitchen set the terms: Sunday dinner at theirs, both families at the table${dowry > 0 ? `, and a dowry of $${dowry.toLocaleString('en-US')} if it ever comes to a wedding` : ''}.`;
  switch (a.a) {
    case 'meet':
      return {
        ...pre(title, `met ${call}'s match, ${her}`, ready),
        detail: `${coffee} ${call} is pleased and her standing rises; ${her} and her family decide too (nobody is pushed). Then it is up to the two of you.`,
        effects: [X(a, lbl)], acceptance: maOdds(s, f, 'meet'), oddsLabel: 'She and her family say yes',
        refuseEffects: [X({ op: 'maNo', id: a.id, a: 'meet' }, lbl)], verb: 'Meet her',
      };
    case 'decide':
      return {
        ...pre(title, `let ${call} arrange it with ${her}`, ready),
        detail: `${coffee} ${call} arranges the courtship the old way, mother to mother: if ${her} says yes, you are seeing each other, with the whole parish watching. ${call} is delighted; her standing rises the most. ${her} decides; so does her family.`,
        effects: [{ type: 'storyOp', op: { op: 'romance', a: boss.id, b: c.id }, label: lbl } as Effect, X(a, lbl)], acceptance: maOdds(s, f, 'decide'), oddsLabel: 'She and her family say yes',
        refuseEffects: [X({ op: 'maNo', id: a.id, a: 'decide' }, lbl)], verb: 'Let Ma decide',
      };
    case 'notNow': {
      const n = s.single?.nag ?? 0;
      return { ...pre(title, `put ${call} off`, undefined), effects: [X(a, lbl)], detail: `No roll. ${call} sighs, and thinks a little less of you (more each time: you have put her off ${n} time${n === 1 ? '' : 's'}). She will ask again in a couple of months.`, verb: 'Not now, Ma' };
    }
    case 'own':
      return { ...pre(title, `told ${call} he would find his own`, undefined), effects: [X(a, lbl)], detail: `No roll. ${call} is hurt, and the women talk: her standing slips. She leaves it alone for half a year.`, verb: 'I\'ll find my own' };
  }
}

export function describeSingleOp(s: GameState, o: SingleOp): string | undefined {
  const c = s.characters[o.id];
  const n = c?.firstName ?? 'her';
  const ma = s.single?.fix ? s.characters[s.single.fix.by] : undefined;
  const call = ma ? fixerCall(s, ma) : 'Ma';
  switch (o.op) {
    case 'come': return o.a === 'out' ? `An evening with ${n}: her feelings up, one of your evenings` : o.a === 'slow' ? `${n} waits for you, if she is the patient kind` : o.a === 'kind' ? `${n} thinks well of you for it` : `${n} will not forget it`;
    case 'comeNo': return `${n} had a nice time; no second evening`;
    case 'ma': return o.a === 'meet' ? `Sunday dinner with ${n}'s family · ${call} pleased, her standing up` : o.a === 'decide' ? `${call} arranges it: you and ${n} are seeing each other · her standing up` : o.a === 'notNow' ? `${call} thinks less of you · she will ask again` : `${call} is hurt · her standing slips`;
    case 'maNo': return `Someone said no: nobody is pushed`;
  }
}

function fileLine(ctx: Ctx, text: string, kind: 'date' | 'no' | 'family' | 'life', charId: string): void {
  datingLog(ensureDating(ctx.s), ctx.s, text, kind, charId);
  ctx.log.push(text);
}

export function applySingleOp(ctx: Ctx, o: SingleOp): void {
  const s = ctx.s;
  const boss = player(s);
  const c = s.characters[o.id];
  const S = ensureSingle(s);
  if (!c?.alive || !isAdult(s, c) || !isAdult(s, boss) || kin(boss, c)) { S.open = undefined; return; }
  const D = ensureDating(s);
  if (o.op === 'come' || o.op === 'comeNo') {
    const ap = S.open?.id === c.id ? S.open : undefined;
    S.open = undefined;
    const her = c.firstName;
    const who = ap ? WHO_INFO[ap.who].label.toLowerCase() : 'a woman who came to you';
    const via = ap ? `${WHO_INFO[ap.who].how}: she came to you` : 'She came to you';
    const agent = s.honey?.agents[c.id];
    const live = agent && agent.status === 'working' ? agent : undefined;
    const fam = ap?.who === 'goodFamily' || ap?.who === 'rivalDaughter' ? houseOf(s, c.id) : undefined;
    const head = fam ? s.characters[fam.headId] : undefined;
    if (o.op === 'comeNo') {
      const b = ensureBond(s, D, c.id, via);
      b.dates++; b.last = s.week; b.aff = clamp(b.aff + 3);
      D.evenings = D.evenings.week === s.week ? { week: s.week, n: D.evenings.n + 1 } : { week: s.week, n: 1 };
      fileLine(ctx, `Dinner with ${her} (${who}). A nice evening, and no spark: she said so herself, kindly. No second one.`, 'date', c.id);
      return;
    }
    switch (o.a) {
      case 'out': {
        const b = ensureBond(s, D, c.id, via);
        b.dates++; b.last = s.week; b.ended = undefined;
        b.aff = clamp(Math.max(b.aff, 30) + 10);
        if (b.rung === 'acquaintance') b.rung = 'friends';
        if (b.rung === 'friends' && b.aff >= 40) b.rung = 'attracted';
        D.evenings = D.evenings.week === s.week ? { week: s.week, n: D.evenings.n + 1 } : { week: s.week, n: 1 };
        D.stats.dates++;
        S.n.yes++;
        addOpinion(s, c.id, boss.id, 'He took me out', 6, 1);
        if (head?.alive) addOpinion(s, head.id, boss.id, 'Took my daughter out properly', 4, 1);
        fileLine(ctx, `Dinner with ${her} (${who}) at the Admiral, a walk on the boardwalk after. She wants to see you again.${s.dating?.settings.mature === 'standard' ? ' She took your arm on the way to the car.' : ''} Then it was morning.`, 'date', c.id);
        const wife = wifeOf(s);
        if (ap?.m && wife && roll(`${s.seed}|${s.week}|singlewife|${c.id}`) < 0.15) {
          applyEffects(ctx, [{ type: 'opinion', from: wife.id, to: boss.id, amount: -8, reason: 'Heard you were out with someone', decay: 1, label: `${wife.firstName} heard` }], { label: `${wife.firstName} heard`, because: `were seen out with ${her}`, category: 'event' });
          D.rumors.push({ week: s.week, text: `The boss was seen out with ${c.firstName} ${c.lastName}.`, about: boss.id, heard: [wife.id], true: true });
        }
        // A rival's game: she carries what she hears (honey.ts), and he may notice.
        if (live) {
          if (roll(`${s.seed}|${s.week}|singleleak|${c.id}`) < 0.35) leakIntel(ctx, live, 'pillow');
          if (roll(`${s.seed}|${s.week}|singlesign|${c.id}`) < 0.4) addSign(s, c.id, `${her} asked a lot of questions over dinner for a girl who said she didn't care about business.`, 14);
        }
        return;
      }
      case 'slow': {
        const b = ensureBond(s, D, c.id, via);
        const hurry = ap?.why === 'money' || ap?.why === 'rival';
        b.aff = clamp(Math.max(b.aff, 22) + (hurry ? 1 : 6));
        if (b.rung === 'acquaintance' && b.aff >= 25) b.rung = 'friends';
        addOpinion(s, c.id, boss.id, hurry ? 'Made me wait' : 'A gentleman, taking his time', hurry ? -2 : 4, 1);
        fileLine(ctx, hurry ? `Coffee with ${her}. You took it slow; she looked at her watch twice.` : `Coffee with ${her}, and your number on a matchbook. She liked that you took your time.`, 'date', c.id);
        return;
      }
      case 'kind': {
        addOpinion(s, c.id, boss.id, 'Let me down like a gentleman', 4, 1);
        if (head?.alive) addOpinion(s, head.id, boss.id, 'Was kind to my daughter', 2, 1);
        fileLine(ctx, `You turned ${her} down, kindly. She said the right girl is lucky, and meant it.`, 'no', c.id);
        return;
      }
      case 'cold': {
        addOpinion(s, c.id, boss.id, 'Humiliated me in front of people', -15, 0);
        const fx: Effect[] = [];
        if (head?.alive) fx.push({ type: 'opinion', from: head.id, to: boss.id, amount: -6, reason: 'Insulted my daughter', decay: 1, label: `${her}'s father` });
        const r = fam?.faction ? s.rivals.find((x) => x.id === fam.faction && x.kind === 'mob') : undefined;
        if (r) fx.push({ type: 'rivalOpinion', rival: r.id, amount: -4, reason: 'He insulted the daughter', label: `${r.shortName}` } as Effect);
        if (fx.length) applyEffects(ctx, fx, { label: `Turned ${her} down cold`, because: `turned ${her} down cold`, category: 'event' });
        if (live && live.kind !== 'fbi') live.status = 'done';
        fileLine(ctx, `You turned ${her} down cold, where people could see. The room went quiet; she left with her head up.`, 'no', c.id);
        return;
      }
    }
    return;
  }
  // Ma's match.
  const f = S.fix?.id === c.id ? S.fix : undefined;
  const ma = f ? s.characters[f.by] : undefined;
  if (!f || !ma?.alive) { S.fix = undefined; return; }
  const call = fixerCall(s, ma);
  const her = c.firstName;
  const h = f.house ? houseById(s, f.house) : undefined;
  const head = h ? s.characters[h.headId] : undefined;
  const mother = s.characters[f.mother];
  const rest = (weeks: number) => { S.fix = undefined; S.rest = s.week + weeks; };
  if (o.op === 'maNo') {
    bumpStanding(s, ma.id, -1);
    rest(10);
    const says = roll(`${s.seed}|${s.week}|mano|${c.id}`) < 0.5;
    fileLine(ctx, says ? `${her} said no, politely, through her mother. Nobody makes her. ${call} says the right one will come.` : `Over coffee, ${her}'s mother said she is promised elsewhere. Polite, and final. ${call} poured the coffee and said nothing.`, 'family', c.id);
    return;
  }
  switch (o.a) {
    case 'meet':
    case 'decide': {
      const b = ensureBond(s, D, c.id, `${call}'s match (${h ? h.name : 'the parish'})`);
      b.aff = clamp(Math.max(b.aff, o.a === 'decide' ? 40 : 28) + 6);
      b.last = s.week;
      b.rung = o.a === 'decide' || b.aff >= 40 ? 'attracted' : 'friends';
      addOpinion(s, ma.id, boss.id, o.a === 'decide' ? 'Let me arrange it' : 'Met the girl I found him', o.a === 'decide' ? 12 : 7, 1);
      addOpinion(s, c.id, boss.id, 'Sunday dinner with his family', 5, 1);
      if (head?.alive) addOpinion(s, head.id, boss.id, 'Our families sat down together', 6, 1);
      if (mother?.alive) addOpinion(s, mother.id, ma.id, 'We made the match', 10, 0);
      const r = h?.faction ? s.rivals.find((x) => x.id === h.faction && x.kind === 'mob') : undefined;
      if (r) applyEffects(ctx, [{ type: 'rivalOpinion', rival: r.id, amount: 5, reason: 'The families sat down to dinner', label: `${r.shortName}` } as Effect], { label: `${call}'s match`, because: `sat down with ${h!.name}`, category: 'event' });
      const st = bumpStanding(s, ma.id, o.a === 'decide' ? 7 : 4);
      S.nag = 0;
      S.n.yes++;
      S.wed = [...S.wed.filter((x) => x.id !== c.id), { id: c.id, by: ma.id, w: s.week, weigh: f.weigh, house: f.house }].slice(-6);
      rest(FIX_GAP);
      fileLine(ctx, o.a === 'decide'
        ? `${call} arranged it with ${motherName(s, f.mother)} over coffee: you and ${her} are courting, and the whole parish knows by Sunday. ${call}'s standing among the women: ${st}.`
        : `Sunday dinner at the ${c.lastName}s', both families at the table. ${her} laughed at your jokes; ${call} kicked you under the table twice. Her standing among the women: ${st}.`, 'family', c.id);
      return;
    }
    case 'notNow': {
      const n = S.nag;
      addOpinion(s, ma.id, boss.id, 'Keeps putting me off', -(3 + 2 * n), 1);
      bumpStanding(s, ma.id, -1);
      S.nag = n + 1;
      rest(n >= 2 ? 6 : 9);
      fileLine(ctx, n >= 2 ? `"Not now, Ma." Again. ${call} did not argue this time. She lit a candle at St. Ann's instead, and told Father why.` : `"Not now, Ma." ${call} sighed and put ${her}'s picture back in her purse. She will ask again.`, 'family', c.id);
      return;
    }
    case 'own': {
      addOpinion(s, ma.id, boss.id, 'Said he would find his own', -8, 1);
      bumpStanding(s, ma.id, -3);
      S.nag = 0;
      rest(26);
      fileLine(ctx, `"I'll find my own, Ma." ${call} said "Fine," which is never fine. By Sunday every kitchen on Pacific Avenue knew.`, 'family', c.id);
      return;
    }
  }
}

/* ------------------------------------------------------------------ */
/* The week                                                            */
/* ------------------------------------------------------------------ */

/** Ma's pick married him: the matchmakers' record (its "mom knows best" beat comes a year on) and her coffee dowry. */
function weddings(ctx: Ctx, S: SingleState): void {
  const s = ctx.s;
  const boss = player(s);
  for (const x of S.wed) {
    if (boss.spouseId !== x.id) continue;
    const ma = s.characters[x.by];
    S.wed = S.wed.filter((y) => y !== x);
    if (!ma?.alive) return;
    const M = ensureMatchmakers(s);
    const h = x.house ? houseById(s, x.house) : undefined;
    M.made.push({ memberId: boss.id, spouseId: x.id, houseId: h?.id ?? '', by: ma.id, week: s.week, weigh: MA_WEIGH[x.weigh].matches, how: 'hers' });
    if (M.made.length > 40) M.made.shift();
    const st = bumpStanding(s, ma.id, 8);
    addOpinion(s, ma.id, boss.id, 'Married the girl I found him', 15, 0);
    const dowry = h ? coffeeDowry(s, boss, h, ma.id) : 0;
    if (dowry > 0) applyEffects(ctx, [{ type: 'money', amount: dowry, label: `Dowry from ${h!.name}` }], { label: `${fixerCall(s, ma)}'s match`, because: `married ${fixerCall(s, ma)}'s match`, category: 'event' });
    fileLine(ctx, `You married ${fixerCall(s, ma)}'s match. She cried through the whole Mass. Her standing among the women: ${st}.`, 'family', x.id);
    return;
  }
  S.wed = S.wed.filter((x) => s.week - x.w < 156 && s.characters[x.id]?.alive && !s.characters[x.id].spouseId);
}

export function singleWeek(ctx: Ctx): void {
  const s = ctx.s;
  if (s.gameOver) return;
  const S0 = s.single;
  if (S0) {
    // She waited; he never called.
    if (S0.open && !openApproachOf(s)) {
      const c = s.characters[S0.open.id];
      if (c?.alive && s.week - S0.open.w > OPEN_WEEKS) {
        addOpinion(s, c.id, s.playerId, 'Never called', -3, 1);
        fileLine(ctx, `${c.firstName} waited for a call that never came, and moved on.`, 'life', c.id);
      }
      S0.open = undefined;
    }
    // Ma waited six weeks: she takes silence as "not now", and nags.
    if (S0.fix) {
      const f = openFixOf(s);
      if (!f) S0.fix = undefined;
      else if (s.week - f.w >= FIX_WEEKS) applySingleOp(ctx, { op: 'ma', id: f.id, a: 'notNow' });
    }
    weddings(ctx, S0);
  }
  const boss = bossReady(s);
  if (!boss || s.week < 3) return;
  const single = isSingle(s);
  // Someone comes to him.
  if (!s.single?.open && (s.single?.last === undefined || s.week - s.single.last >= OPEN_WEEKS)) {
    const r = approachRate(s);
    if (r.perYear > 0 && roll(`${s.seed}|single|appr|${s.week}`) < r.perYear / 52) {
      const p = pickApproach(s, boss, single);
      if (p) openApproach(s, p.c, p.who, p.why, single, p.agent ? { kind: 'rival', master: p.agent } : undefined);
    }
  }
  // Ma brings a match.
  const ma = single && ageOf(s, boss) >= FIX_AGE ? fixerOf(s) : undefined;
  if (ma && !s.single?.fix && (s.single?.rest ?? 0) <= s.week) {
    const nag = s.single?.nag ?? 0;
    if (roll(`${s.seed}|single|ma|${s.week}`) < 0.12 + nag * 0.06) {
      const f = makeFix(s, ma, boss);
      if (f) {
        const S = ensureSingle(s);
        S.fix = f;
        S.n.fix++;
        const c = s.characters[f.id];
        datingLog(ensureDating(s), s, `${fixerCall(s, ma)} has found a girl for you: ${c.firstName} ${c.lastName}. She wants your answer.`, 'family', c.id);
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Views                                                               */
/* ------------------------------------------------------------------ */

export interface ApproachView { a: Approach; c: Character; info: (typeof WHO_INFO)[Who]; motive: (typeof MOTIVE_INFO)[Motive]; age: number; read?: string; odds: Acceptance; left: number; house?: House }

export function approachView(s: GameState): ApproachView | undefined {
  const a = openApproachOf(s);
  if (!a) return undefined;
  const c = s.characters[a.id];
  const agent = s.honey?.agents[a.id];
  // His read on her: a rival's game shows only when he (or his men) notice something.
  const sees = agent && agent.status === 'working' && roll(`${s.seed}|singleread|${a.id}`) < 0.45 + (hasTrait(player(s), 'Paranoid') ? 0.3 : 0);
  const read = a.who === 'rivalDaughter' ? `Her father is ${s.rivals.find((r) => r.id === houseOf(s, c.id)?.faction)?.shortName ?? 'a rival'}. Nobody crosses that hall by accident.` : sees ? 'She checks the door a lot. Somebody may have sent her.' : undefined;
  return { a, c, info: WHO_INFO[a.who], motive: MOTIVE_INFO[a.why], age: ageOf(s, c), read, odds: outOdds(s, a), left: Math.max(0, OPEN_WEEKS - (s.week - a.w)), house: houseOf(s, c.id) };
}

export interface FixView { f: FixUp; c: Character; ma: Character; call: string; role: string; age: number; house?: House; odds: Acceptance; standing: number; nag: number; dowry: number; left: number }

export function fixView(s: GameState): FixView | undefined {
  const f = openFixOf(s);
  if (!f) return undefined;
  const c = s.characters[f.id];
  const ma = s.characters[f.by];
  const h = f.house ? houseById(s, f.house) : undefined;
  return {
    f, c, ma, call: fixerCall(s, ma), role: fixerRole(s, ma), age: ageOf(s, c), house: h, odds: maOdds(s, f, 'meet'),
    standing: circleOf(s, ma.id)?.standing ?? 10, nag: s.single?.nag ?? 0, dowry: h ? coffeeDowry(s, player(s), h, ma.id) : 0, left: Math.max(0, FIX_WEEKS - (s.week - f.w)),
  };
}

/** For the screen when nothing is waiting: whether Ma is asking around, and when. */
export function maStatus(s: GameState): string | undefined {
  const boss = player(s);
  if (!isSingle(s)) return undefined;
  const ma = fixerOf(s);
  if (!ma) return 'Nobody in the family is fixing you up.';
  const call = fixerCall(s, ma);
  if (ageOf(s, boss) < FIX_AGE) return `${call} says you are young yet. She will start asking around when you are ${FIX_AGE}.`;
  const rest = s.single?.rest ?? 0;
  return rest > s.week ? `${call} is letting it rest until about week ${rest}${s.single?.nag ? ` (you have put her off ${s.single.nag} time${s.single.nag === 1 ? '' : 's'})` : ''}.` : `${call} is asking around the parish.`;
}

export { displayName };
