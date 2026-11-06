import { ageOn } from './calendar';
import { capos, displayName, hasTrait, isFree, makeCharacter, player } from './characters';
import { adultOn, datingEvenings } from './datingState';
import { awayReason, daysOf, DAY_NAMES, setEvening, today, weekPlan } from './days';
import { usesEvening, weekOccurrences } from './apptsState';
import { personOfAct } from './appointments';
import { applyEffects } from './effects';
import { activeGoomars } from './goomar';
import { journal } from './journal';
import { newCtx, type Ctx } from './ledger';
import { spendPocket } from './pocket';
import { addOpinion, changeMeter, opinion } from './relations';
import { hashSeed } from './rng';
import { addSecret } from './secrets';
import { fixerOf } from './single';
import { houseById } from './familyState';
import { chooseHeir } from './dynasty';
import { cloneState } from './engine';
import type { Character, Effect, EventInstance, FactionId, GameState, PlayerAction, RivalId } from './types';

/**
 * YOUR WIFE (the owner's ask): a married boss has to come home. She asks
 * every day whether to expect him for dinner; he has to be home at least
 * every other night (4 of 7); she gets suspicious when he is gone long or
 * keeps company with many different women; she calls his closest people to
 * ask about him, and a man she grows close to while he neglects her may be
 * the one she steps out with; she can ask for a divorce (a scandal in 1960
 * Catholic New Jersey, with a settlement and alimony through the ledger); or
 * she can agree to an arrangement: he lives his life, she gets hers (an
 * allowance she sets and raises, the house, discretion, money of her own).
 *
 * Built on what exists: the nights out are read off the week's evenings
 * (days.ts' plan of rounds, standing appointments, the dating layer's
 * evenings, queued dates, trips and visits); the women off the dating bonds,
 * the paid company and the goomars; rumors off the dating layer; her opinion
 * is the one relation; money goes through the pocket (spendPocket); the
 * divorce is romance.ts' own separation; results land in Your File.
 *
 * HARD RULES: adults only; non-explicit (fade to black, report lines only);
 * she decides (every answer of hers is odds, shown); no coercion; NO harm
 * to her, ever: no option anywhere in this module touches her person; no man
 * of the boss's is killed or handed over here (the options are talk, keep
 * your distance, a job away, words, forgive, separate, the arrangement,
 * divorce). Fictional people only.
 *
 * Lives on `GameState.wife` (optional: made the first week a married boss
 * lives; old saves and a fresh game have none). Its dice are hashes of
 * (seed, week, purpose).
 */

export type Dinner = 'home' | 'out' | 'late';
export const DINNER_LABEL: Record<Dinner, string> = { home: "I'll be home", out: 'Not tonight', late: 'Late, keep a plate warm' };

export type NightKind = 'home' | 'withHer' | 'out' | 'woman' | 'trip' | 'neutral';

export interface NightRow {
  day: number;
  kind: NightKind;
  /** What has him out (or home) that evening. */
  why?: string;
  /** What he told her (undefined: not asked, or not answered: taken from what is booked). */
  ans?: Dinner;
  /** 1 home, 0.5 late, 0 out; neutral nights do not count either way. */
  credit: number;
  /** He said he'd be home, and something else had that evening. */
  stoodUp?: boolean;
}

export interface NightsPlan { rows: NightRow[]; home: number; need: number; short: number; withHer: number; trip: number; stoodUp: number }

export interface WifeWeek { w: number; home: number; need: number; women: string[] }
export interface WifeCall { w: number; who: string; how: 'cover' | 'vague' | 'slip'; t: string }
export interface HerAffair { man: string; since: number; kind: 'his' | 'rival' | 'town'; rival?: RivalId; known?: number; out?: number; ended?: number }
export interface Arrangement {
  since: number;
  /** The weekly allowance she set (from your pocket). */
  allowance: number;
  /** Her own business, if she has one. */
  shop?: { kind: ShopKind; since: number; weekly: number };
  /** Her money of her own, so far. */
  herMoney: number;
  /** Payments missed and humiliations, toward breaking it. */
  breach: number;
  /** The week she will next ask for more. */
  next: number;
}
export interface Alimony { id: string; amount: number; until: number; since: number }

export interface WifeState {
  /** The wife this record is about (a new wife, a new record). */
  id: string;
  /** 0-100. */
  susp: number;
  /** Why it moved (newest last, a few weeks). */
  why: { w: number; t: string; v: number }[];
  weeks: WifeWeek[];
  /** This week's answers to "Should I expect you for dinner?" (index = day). */
  dinner?: { w: number; a: (Dinner | null)[] };
  /** "Answer her for me": home when nothing is booked, otherwise not tonight. */
  auto?: boolean;
  /** Weeks in a row he has been "that bad" (suspicion high and her opinion low). */
  bad: number;
  /** She has proof (found something, he confessed, she learned of a goomar). */
  proof?: boolean;
  /** He promised to be home: until this week, falling short costs double. */
  promise?: number;
  /** Cooldowns by key (week it may come again). */
  cd: Record<string, number>;
  /** Her closeness to his people (character id -> 0-100). */
  close: Record<string, number>;
  calls: WifeCall[];
  her?: HerAffair;
  arr?: Arrangement;
  /** Arrangements broken so far. */
  broken?: number;
  /** A running roll counter. */
  n: number;
  /** Lines for her card (newest last). */
  log: [number, string][];
  /** Alimony he owes former wives (kept across wives). */
  ali?: Alimony[];
}

export type ShopKind = 'dress' | 'beauty' | 'share';
export const SHOP_INFO: Record<ShopKind, { label: string; cost: number; weekly: number }> = {
  dress: { label: 'a dress shop on Pacific Avenue', cost: 3500, weekly: 60 },
  beauty: { label: 'a beauty parlor on Rio Grande', cost: 2500, weekly: 45 },
  share: { label: 'a share of a restaurant on the Boardwalk', cost: 4500, weekly: 80 },
};

export type WifeKey =
  | 'deny' | 'confess' | 'gift' | 'promise' | 'propose'
  | 'termsYes' | 'termsHaggle' | 'termsNo'
  | 'raiseYes' | 'raiseCounter' | 'raiseNo' | 'shopYes' | 'shopShare' | 'shopNo'
  | 'herTalk' | 'herDistance' | 'herAway' | 'herWords' | 'herForgive'
  | 'separate' | 'divorce' | 'fight' | 'reconcile' | 'settle'
  | 'talk' | 'home' | 'endArr' | 'distance' | 'away' | 'confront';

export interface WifeOp { op: 'wife'; k: WifeKey; chance?: number; amount?: number; man?: string; mult?: number; shop?: ShopKind; cost?: number }

/** The minimum: every other night. */
export const NEED_OF_SEVEN = 4;
export const SCENES: { at: number; key: string; title: string }[] = [
  { at: 80, key: 'confront', title: 'She confronts you' },
  { at: 65, key: 'club', title: 'She called the club' },
  { at: 50, key: 'pockets', title: 'She went through your pockets' },
  { at: 30, key: 'breakfast', title: 'Questions at breakfast' },
];

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(v)));
const clampP = (v: number, lo = 0.05, hi = 0.85) => Math.max(lo, Math.min(hi, v));
const pct = (p: number) => `${Math.round(p * 100)}%`;
const $ = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const r25 = (n: number) => Math.max(25, Math.round(n / 25) * 25);
const WX = (op: Omit<WifeOp, 'op'>, label?: string): Effect => ({ type: 'dating', op: { op: 'wife', ...op }, ...(label ? { label } : {}) }) as Effect;

/* ------------------------------------------------------------------ */
/* Who                                                                  */
/* ------------------------------------------------------------------ */

function separated(s: GameState, a: string, b: string): boolean {
  return (s.romance?.separations ?? []).some((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
}

/** His wife, if this layer applies: a grown boss, married, living together (not separated). */
export function wifeHere(s: GameState): Character | undefined {
  const b = player(s);
  if (!b?.alive || ageOn(b.birth, s.date) < 18) return undefined;
  const w = b.spouseId ? s.characters[b.spouseId] : undefined;
  if (!w?.alive || ageOn(w.birth, s.date) < 18) return undefined;
  if (separated(s, b.id, w.id)) return undefined;
  return w;
}

function fresh(id: string, keep?: WifeState): WifeState {
  return { id, susp: 10, why: [], weeks: [], bad: 0, cd: {}, close: {}, calls: [], n: 0, log: [], ...(keep?.ali?.length ? { ali: keep.ali } : {}), ...(keep?.auto ? { auto: true } : {}) };
}

export function ensureWife(s: GameState, w: Character): WifeState {
  if (!s.wife || s.wife.id !== w.id) s.wife = fresh(w.id, s.wife);
  const W = s.wife;
  W.cd ??= {}; W.close ??= {}; W.calls ??= []; W.log ??= []; W.why ??= []; W.weeks ??= [];
  return W;
}

/** Read-only: the record for this wife (undefined when there is none yet). */
export function wifeRecord(s: GameState): WifeState | undefined {
  const w = wifeHere(s);
  return w && s.wife?.id === w.id ? s.wife : undefined;
}

function roll(s: GameState, W: WifeState | undefined, k: string): number {
  const n = W ? W.n++ : 0;
  return (hashSeed(`${s.seed}|${s.week}|wife|${k}|${n}`) % 100003) / 100003;
}

function note(s: GameState, W: WifeState, t: string, p: string[] = [], heard = false): void {
  W.log.push([s.week, t]);
  if (W.log.length > 24) W.log.splice(0, W.log.length - 24);
  journal(s, { t, c: 'romance', src: 'wife', p: [W.id, ...p], ...(heard ? { k: 'heard' as const } : {}) });
}

function bump(s: GameState, W: WifeState, v: number, t: string): void {
  v = Math.round(v);
  if (!v) return;
  W.susp = clamp(W.susp + v);
  W.why.push({ w: s.week, t, v });
  if (W.why.length > 16) W.why.splice(0, W.why.length - 16);
}

/* ------------------------------------------------------------------ */
/* The nights                                                           */
/* ------------------------------------------------------------------ */

const FILL = [1, 3, 4, 2, 5, 0, 6];

/**
 * The week's nights: what has him out each evening (a trip, a round out, a
 * standing evening, the dating layer's evenings and queued dates), what he
 * told her, and the credit each night earns toward the minimum.
 */
export function nightsPlan(s: GameState, orders: readonly PlayerAction[] = []): NightsPlan {
  const w = wifeHere(s);
  const rows: NightRow[] = [];
  const plan = weekPlan(s);
  const ans = s.wife && w && s.wife.id === w.id && s.wife.dinner?.w === s.week ? s.wife.dinner.a : [];
  for (let d = 0; d < 7; d++) {
    const away = awayReason(s, d);
    if (away === 'In prison' || away === 'In hiding' || away === 'In the hospital') { rows.push({ day: d, kind: 'neutral', why: away, credit: 0 }); continue; }
    if (away) { rows.push({ day: d, kind: 'trip', why: away, credit: 0 }); continue; }
    const id = plan[d];
    if (id) {
      if (id === 'fam:wife') rows.push({ day: d, kind: 'withHer', why: 'An evening with her', credit: 1 });
      else if (id.startsWith('fam:') || id.startsWith('self:')) rows.push({ day: d, kind: 'home', why: id === 'fam:sunday' ? 'Sunday dinner' : undefined, credit: 1 });
      else rows.push({ day: d, kind: id.startsWith('fun:lover:') || id === 'fun:escort' ? 'woman' : 'out', why: roundLabel(id), credit: 0 });
      continue;
    }
    rows.push({ day: d, kind: 'home', credit: 1 });
  }
  // Standing appointments in the evening.
  for (const o of weekOccurrences(s)) {
    if (o.a.slot !== 'evening') continue;
    const r = rows[o.d];
    if (r.kind === 'trip' || r.kind === 'neutral') continue;
    const who = personOfAct(s, o.a.action);
    if (w && who === w.id) { r.kind = 'withHer'; r.why = o.a.what; r.credit = 1; continue; }
    if (r.kind === 'home') { r.kind = usesEvening(o.a.action) ? 'woman' : 'out'; r.why = o.a.what; r.credit = 0; }
  }
  // The dating layer's evenings this week (dates done, paid company, a goomar's place, an evening plan) and queued dates.
  const done = s.appts?.done && s.appts.done.w === s.week ? s.appts.done.k : [];
  const apptDone = weekOccurrences(s).filter((o) => usesEvening(o.a.action) && done.includes(o.key)).length;
  let extra = Math.max(0, datingEvenings(s) - apptDone) + orders.filter((a) => usesEvening(a)).length;
  const now = today(s);
  // Nights he told her he'd be out (or late) take them first; then the days gone; then the week ahead.
  const told = (d: number) => (ans[d] === 'out' || ans[d] === 'late' ? 0 : 1);
  const order = [...[0, 1, 2, 3, 4, 5, 6].filter((d) => d < now), ...FILL.filter((d) => d >= now)].map((d, i) => [d, i] as const).sort((x, y) => told(x[0]) - told(y[0]) || x[1] - y[1]).map((x) => x[0]);
  for (const d of order) {
    if (extra <= 0) break;
    if (rows[d].kind !== 'home' || rows[d].why) continue;
    rows[d] = { day: d, kind: 'woman', why: 'An evening out with company', credit: 0 };
    extra--;
  }
  // What he told her.
  let stoodUp = 0;
  for (const r of rows) {
    const a = ans[r.day] ?? undefined;
    if (!a || r.kind === 'neutral') continue;
    r.ans = a;
    const booked = r.kind === 'out' || r.kind === 'woman' || r.kind === 'trip';
    if (a === 'home' && booked) { r.stoodUp = true; stoodUp++; r.credit = 0; }
    else if (a === 'late') r.credit = r.kind === 'trip' ? 0 : 0.5;
    else if (a === 'out' && !booked) { r.kind = 'out'; r.why = r.why ?? 'Out (you told her)'; r.credit = 0; }
  }
  const open = rows.filter((r) => r.kind !== 'neutral').length;
  const need = wifeArr(s) ? 0 : Math.ceil((open * NEED_OF_SEVEN) / 7);
  const home = rows.reduce((a, r) => a + r.credit, 0);
  return { rows, home, need, short: Math.max(0, need - home), withHer: rows.filter((r) => r.kind === 'withHer').length, trip: rows.filter((r) => r.kind === 'trip').length, stoodUp };
}

function roundLabel(id: string): string {
  if (id === 'fun:club') return 'A night at the club';
  if (id === 'fun:cards') return 'Cards with the boys';
  if (id === 'fun:fights') return 'The fights';
  if (id.startsWith('fun:lover:')) return 'An evening away';
  if (id === 'fun:escort') return 'Company, arranged';
  if (id.startsWith('fun:')) return 'A night out';
  return 'Business';
}

function wifeArr(s: GameState): Arrangement | undefined {
  const w = wifeHere(s);
  return w && s.wife?.id === w.id ? s.wife.arr : undefined;
}

/** "Should I expect you for dinner?": his answer for a day (null clears it). Pure. */
export function setDinner(s: GameState, day: number, a: Dinner | null): GameState {
  const w = wifeHere(s);
  if (!w || day < today(s) || day > 6) return s;
  const n = { ...s };
  const W = s.wife && s.wife.id === w.id ? { ...s.wife } : fresh(w.id, s.wife);
  const prev = W.dinner?.w === s.week ? [...W.dinner.a] : Array<Dinner | null>(7).fill(null);
  prev[day] = a;
  W.dinner = { w: s.week, a: prev };
  n.wife = W;
  return n;
}

/** "Answer her for me" on or off. Pure. */
export function setAutoDinner(s: GameState, on: boolean): GameState {
  const w = wifeHere(s);
  if (!w) return s;
  const W = s.wife && s.wife.id === w.id ? { ...s.wife } : fresh(w.id, s.wife);
  if (on) W.auto = true; else delete W.auto;
  return { ...s, wife: W };
}

/** What she asks today on the clock (undefined: nothing to ask: not married, answered, or answered for him). */
export function dinnerAsk(s: GameState): { day: number; booked?: string; kind: NightKind; home: number; need: number } | undefined {
  const w = wifeHere(s);
  if (!w || s.gameOver) return undefined;
  if (s.wife?.id === w.id && s.wife.auto) return undefined;
  const d = today(s);
  if (s.wife?.id === w.id && s.wife.dinner?.w === s.week && s.wife.dinner.a[d]) return undefined;
  const p = nightsPlan(s);
  const r = p.rows[d];
  if (r.kind === 'neutral' || r.kind === 'trip') return undefined;
  return { day: d, booked: r.kind === 'out' || r.kind === 'woman' ? r.why : undefined, kind: r.kind, home: p.home, need: p.need };
}

/** The default answer for a day (what "Answer her for me" says): home when nothing is booked. */
export function defaultDinner(s: GameState, day: number): Dinner {
  const r = nightsPlan(s).rows[day];
  return r.kind === 'out' || r.kind === 'woman' || r.kind === 'trip' ? 'out' : 'home';
}

/* ------------------------------------------------------------------ */
/* Her people: who she calls                                            */
/* ------------------------------------------------------------------ */

export interface CallTarget { id: string; role: string; man: boolean }

/** His closest people, the ones she would call: the council, his close (★) men, the capos and their wives, Ma. */
export function peopleSheCalls(s: GameState): CallTarget[] {
  const b = player(s);
  const out: CallTarget[] = [];
  const seen = new Set<string>([b.id, b.spouseId ?? '']);
  const add = (c: Character | undefined, role: string) => {
    if (!c?.alive || seen.has(c.id) || ageOn(c.birth, s.date) < 18) return;
    seen.add(c.id);
    out.push({ id: c.id, role, man: c.gender === 'M' });
  };
  for (const seat of ['underboss', 'consigliere', 'bagman', 'enforcer', 'fixer'] as const) {
    const h = s.council?.[seat]?.holderId;
    add(h ? s.characters[h] : undefined, `your ${seat}`);
  }
  for (const id of s.pins?.on ?? []) { const c = s.characters[id]; if (c?.gender === 'M' && c.faction === 'player') add(c, 'one of your close men'); }
  for (const c of capos(s)) add(c, 'your capo');
  for (const c of capos(s)) add(c.spouseId ? s.characters[c.spouseId] : undefined, `${c.firstName}'s wife`);
  const ma = fixerOf(s);
  if (ma && ma.id === b.motherId) add(ma, 'your mother');
  return out.slice(0, 12);
}

/** How he (or she) answers her about the boss: covers, stays vague, or lets something slip. */
export function callOdds(s: GameState, c: Character): { cover: number; slip: number } {
  const b = player(s);
  if (c.id === b.motherId) return { cover: 0.75, slip: 0.05 };
  if (c.gender === 'F') return { cover: 0.25, slip: 0.35 };
  const op = opinion(s, c.id, b.id);
  let cover = 0.35 + op / 150 + (hasTrait(c, 'Loyal-to-a-fault') ? 0.25 : 0) - (hasTrait(c, 'Honest') ? 0.2 : 0);
  let slip = 0.15 - op / 300 + (hasTrait(c, 'Honest') ? 0.15 : 0) + (hasTrait(c, 'Hot-headed') ? 0.05 : 0);
  cover = clampP(cover, 0.05, 0.9);
  slip = clampP(slip, 0.02, 0.6);
  if (cover + slip > 0.95) slip = 0.95 - cover;
  return { cover, slip };
}

/* ------------------------------------------------------------------ */
/* Odds                                                                 */
/* ------------------------------------------------------------------ */

function kidsOf(s: GameState, w: Character): Character[] {
  const b = player(s);
  return (b.childrenIds ?? []).map((id) => s.characters[id]).filter((c): c is Character => !!c?.alive && c.motherId === w.id);
}

/** Her yes to the arrangement (she decides). */
export function arrangementOdds(s: GameState, w: Character, W?: WifeState): number {
  let p = 0.15;
  if (hasTrait(w, 'Ambitious') || hasTrait(w, 'Greedy')) p += 0.15;
  if (hasTrait(w, 'Pious')) p -= 0.15;
  if (W?.proof) p += 0.15;
  if (W?.her && !W.her.ended) p += 0.25;
  p += (W?.susp ?? 0) / 400;
  if (kidsOf(s, w).length) p += 0.1;
  if ((s.tribute?.acct.personal ?? 0) >= 5000) p += 0.1;
  if ((W?.broken ?? 0) > 0) p -= 0.2 * (W?.broken ?? 0);
  return clampP(p, 0.05, 0.75);
}

/** "I don't know what you're talking about": she believes him. */
export function denyOdds(s: GameState, w: Character, W: WifeState): number {
  const b = player(s);
  return clampP(0.55 - (W.susp - 50) / 150 + (hasTrait(b, 'Charming') ? 0.1 : 0) - (W.proof ? 0.3 : 0) + opinion(s, w.id, b.id) / 400, 0.08, 0.85);
}

/** The allowance she sets. */
export function herAllowance(s: GameState, w: Character): number {
  return Math.min(400, r25(100 + 50 * kidsOf(s, w).length + (hasTrait(w, 'Greedy') ? 75 : 0) + (hasTrait(w, 'Ambitious') ? 25 : 0)));
}

function divorceTerms(s: GameState, w: Character, mult = 1): { lump: number; alimony: number } {
  const pocket = Math.max(0, s.tribute?.acct.personal ?? 0);
  const kids = kidsOf(s, w).length;
  return { lump: Math.round((Math.max(1500, pocket * 0.3) * mult) / 100) * 100, alimony: Math.min(500, r25((75 + 25 * kids) * mult)) };
}

/* ------------------------------------------------------------------ */
/* Events                                                               */
/* ------------------------------------------------------------------ */

function pending(s: GameState, prefix = 'wife_'): boolean {
  return s.eventQueue.some((e) => e.defId.startsWith(prefix)) || s.pendingEvents.some((e) => e.defId.startsWith(prefix));
}

function ev(s: GameState, w: Character, defId: string, title: string, text: string, choices: EventInstance['choices'], priority = 52, actors: string[] = []): EventInstance {
  return { iid: `ev${s.nextId++}`, defId, title, text, week: s.week, choices, defaultChoiceId: choices[0].id, mandatory: false, priority, meta: { wife: w.id }, actors: [w.id, ...actors] };
}

function sceneEvent(s: GameState, w: Character, W: WifeState, key: string, title: string): EventInstance {
  const f = w.firstName;
  const text: Record<string, string> = {
    breakfast: `${f} pours your coffee and doesn't sit down. "Where were you Tuesday? And Thursday? The Russos had us for dinner and I made excuses for you again."`,
    pockets: `${f} had your good jacket out for the cleaner's. She found a matchbook and a receipt you don't remember keeping, and she lays them on the table without a word.`,
    club: `${f} called the club looking for you. They said you'd left hours before. She was still up when you came in, with the lamp on.`,
    confront: `${f} is waiting in the front room with her coat on. "I'm not a fool, and I won't be made one in front of this whole island. Tell me the truth, or I go to my sister's."`,
  };
  const gift = key === 'breakfast' ? 150 : key === 'pockets' ? 300 : 600;
  const deny = denyOdds(s, w, W);
  const arr = arrangementOdds(s, w, W);
  const choices: EventInstance['choices'] = [
    { id: 'deny', label: `Deny it (${pct(deny)})`, detail: `${pct(deny)} she believes you: suspicion −10. Otherwise suspicion +10 and she thinks less of you (−8).`, because: 'denied it to your wife', effects: [WX({ k: 'deny', chance: deny })] },
    { id: 'gift', label: `Something nice for her (${$(gift)})`, detail: `From your pocket: suspicion −15, her opinion +6 (${W.susp >= 65 ? '25% she sees through it: only −5' : 'certain'}).`, because: 'brought your wife something nice', effects: [WX({ k: 'gift', cost: gift, chance: W.susp >= 65 ? 0.75 : 1 })] },
    { id: 'promise', label: 'Promise to be home more', detail: 'Certain: suspicion −12 now. For four weeks, falling short of four nights home costs double.', because: 'promised your wife to be home more', effects: [WX({ k: 'promise' })] },
    { id: 'confess', label: 'Tell her the truth', detail: 'Certain: suspicion −25, but she knows now (her opinion −15). The arrangement gets likelier.', because: 'told your wife the truth', effects: [WX({ k: 'confess' })] },
  ];
  if (W.susp >= 50 && !W.arr) choices.push({ id: 'propose', label: `Propose an arrangement (${pct(arr)})`, detail: `${pct(arr)} she agrees: you live your life, she sets an allowance and wants money of her own. Otherwise her opinion −10, suspicion +5.`, because: 'proposed an arrangement to your wife', effects: [WX({ k: 'propose', chance: arr })] });
  return ev(s, w, `wife_${key}`, title, text[key], choices, key === 'confront' ? 60 : 50);
}

function termsEvent(s: GameState, w: Character): EventInstance {
  const a = herAllowance(s, w);
  const haggle = clampP(0.45 + opinion(s, w.id, player(s).id) / 300, 0.1, 0.7);
  return ev(s, w, 'wife_terms', `${w.firstName} has terms`,
    `${w.firstName} has had enough of waiting up. "Live your life, then. I'll live mine. ${$(a)} a week, the house stays mine, nobody laughs at me in church, and I want money of my own someday." She means it.`,
    [
      { id: 'yes', label: `Agree (${$(a)} a week)`, detail: `Certain: the arrangement. ${$(a)} a week from your pocket; her suspicion matters less, but public humiliation and missed payments break it.`, because: 'agreed to your wife\'s terms', effects: [WX({ k: 'termsYes', amount: a })] },
      { id: 'haggle', label: `Talk her down to ${$(r25(a * 0.7))} (${pct(haggle)})`, detail: `${pct(haggle)} she takes it; otherwise she holds at ${$(a)} and thinks less of you (−5).`, because: 'haggled over your wife\'s terms', effects: [WX({ k: 'termsHaggle', amount: a, chance: haggle })] },
      { id: 'no', label: 'Refuse', detail: 'Certain: no arrangement. Her opinion −10; things go on as they were (her suspicion stays).', because: 'refused your wife\'s terms', effects: [WX({ k: 'termsNo' })] },
    ], 56);
}

function askEvent(s: GameState, w: Character, W: WifeState, A: Arrangement): EventInstance {
  const f = w.firstName;
  const shop = !A.shop && (hasTrait(w, 'Ambitious') || roll(s, W, 'askKind') < 0.5);
  const lets = clampP(0.3 + opinion(s, w.id, player(s).id) / 300, 0.1, 0.6);
  if (shop) {
    const kind: ShopKind = (['dress', 'beauty', 'share'] as ShopKind[])[hashSeed(`${s.seed}:${w.id}:shop`) % 3];
    const I = SHOP_INFO[kind];
    const share = clampP(0.5 + opinion(s, w.id, player(s).id) / 300, 0.15, 0.75);
    return ev(s, w, 'wife_ask', `${f} wants her own shop`,
      `"I want my own money, that I make myself." ${f} has found ${I.label}. ${$(I.cost)}, and she says it clears about ${$(I.weekly)} a week once it's running. Hers, not yours.`,
      [
        { id: 'yes', label: `Buy it for her (${$(I.cost)})`, detail: `From your pocket. Certain: her own business; her opinion +15; she asks for less for a long while.`, because: `bought your wife ${I.label}`, effects: [WX({ k: 'shopYes', shop: kind, cost: I.cost })] },
        { id: 'share', label: `A smaller share instead (${$(Math.round(I.cost / 2))}, ${pct(share)})`, detail: `${pct(share)} she takes it (a half share, half the income); otherwise she counts it a refusal.`, because: 'offered your wife a smaller share', effects: [WX({ k: 'shopShare', shop: kind, cost: Math.round(I.cost / 2), chance: share })] },
        { id: 'no', label: `Not now (${pct(lets)} she lets it go)`, detail: `${pct(lets)} she lets it go for now; otherwise it counts against the arrangement and her opinion −10.`, because: 'told your wife no about a shop', effects: [WX({ k: 'shopNo', chance: lets })] },
      ], 54);
  }
  const more = r25(A.allowance * 0.3);
  const counter = clampP(0.55 + opinion(s, w.id, player(s).id) / 300, 0.2, 0.8);
  return ev(s, w, 'wife_ask', `${f} wants more a week`,
    `"Prices go up. So do I." ${f} wants ${$(more)} more a week: ${$(A.allowance + more)} in all.`,
    [
      { id: 'yes', label: `Yes (${$(A.allowance + more)} a week)`, detail: 'Certain: her opinion +6.', because: 'raised your wife\'s allowance', effects: [WX({ k: 'raiseYes', amount: more })] },
      { id: 'counter', label: `Half that (${pct(counter)})`, detail: `${pct(counter)} she takes ${$(r25(more / 2))} more; otherwise she counts it a refusal (it counts against the arrangement).`, because: 'countered your wife\'s ask', effects: [WX({ k: 'raiseCounter', amount: r25(more / 2), chance: counter })] },
      { id: 'no', label: `No (${pct(lets)} she lets it go)`, detail: `${pct(lets)} she lets it go; otherwise it counts against the arrangement and her opinion −10.`, because: 'told your wife no', effects: [WX({ k: 'raiseNo', chance: lets })] },
    ], 54);
}

function herEvent(s: GameState, w: Character, W: WifeState, H: HerAffair): EventInstance {
  const m = s.characters[H.man];
  const f = w.firstName;
  const mn = m ? displayName(m) : 'a man';
  const mf = m?.firstName ?? 'him';
  const talk = clampP(0.35 + opinion(s, w.id, player(s).id) / 200 + (hasTrait(w, 'Pious') ? 0.15 : 0), 0.1, 0.75);
  const arr = arrangementOdds(s, w, W);
  const who = H.kind === 'his' ? `${mn}, one of your own` : H.kind === 'rival' ? `${mn}, a ${s.rivals.find((r) => r.id === H.rival)?.shortName ?? 'rival'} man` : `${mn}, from the neighborhood`;
  const choices: EventInstance['choices'] = [
    { id: 'talk', label: `Talk to her (${pct(talk)})`, detail: `${pct(talk)} she ends it: suspicion −10 both ways. Otherwise she keeps seeing him, her opinion −5.`, because: 'talked to your wife about the other man', effects: [WX({ k: 'herTalk', chance: talk })] },
  ];
  if (H.kind === 'his' && m) {
    const dist = clampP(0.4 + opinion(s, m.id, player(s).id) / 150 + (hasTrait(m, 'Loyal-to-a-fault') ? 0.2 : 0), 0.1, 0.85);
    choices.push(
      { id: 'distance', label: `Tell ${mf} to keep his distance (${pct(dist)})`, detail: `${pct(dist)} he does, and it ends; his opinion of you −10. Otherwise he keeps on (his grievance +15).`, because: `told ${mn} to keep his distance from your wife`, effects: [WX({ k: 'herDistance', man: m.id, chance: dist })] },
      { id: 'away', label: `Give ${mf} a job away from the island`, detail: 'Certain: it ends (Florida for a season); his opinion −15, grievance +10. Nobody is hurt.', because: `sent ${mn} away`, effects: [WX({ k: 'herAway', man: m.id })] },
    );
  } else if (m) {
    const words = 0.6;
    choices.push({ id: 'words', label: `Have words with ${mf} (${pct(words)})`, detail: `${pct(words)} he backs off and it ends. Otherwise he talks about it: respect −2. Words only.`, because: `had words with ${mn}`, effects: [WX({ k: 'herWords', man: m.id, chance: words })] });
  }
  choices.push(
    { id: 'forgive', label: 'Forgive her (50% she ends it)', detail: 'Certain: suspicion −20, her opinion +10. 50% she ends it herself.', because: 'forgave your wife', effects: [WX({ k: 'herForgive', chance: 0.5 })] },
  );
  if (!W.arr) choices.push({ id: 'arr', label: `The arrangement (${pct(arr)})`, detail: `${pct(arr)} she agrees: you each live your own lives, discreetly; her terms are an allowance and money of her own.`, because: 'offered your wife an arrangement', effects: [WX({ k: 'propose', chance: arr })] });
  choices.push(
    { id: 'separate', label: 'Separate', detail: 'Certain: she moves to her sister\'s. Respect −3; the family thinks less of you (−8).', because: 'separated from your wife', effects: [WX({ k: 'separate' })] },
    { id: 'divorce', label: 'Divorce', detail: `Certain, and a scandal: ${divorceLine(s, w)}`, because: 'divorced your wife', effects: [WX({ k: 'divorce', mult: 0.8 })] },
  );
  return ev(s, w, 'wife_her', `${f} and ${mf}`, `It's true: ${f} has been seeing ${who}. Nothing more needs to be said about it than that. What you do now is yours to decide; she is not to be harmed, and nobody is.`, choices, 64, m ? [m.id] : []);
}

export function divorceLine(s: GameState, w: Character, mult = 1): string {
  const t = divorceTerms(s, w, mult);
  return `${$(t.lump)} up front, ${$(t.alimony)} a week alimony, she keeps the house; respect −8, the family −10, Philadelphia thinks less of you, the Church and your children take it hard.`;
}

function divorceEvent(s: GameState, w: Character, W: WifeState): EventInstance {
  const b = player(s);
  const fight = clampP(0.3 + (hasTrait(w, 'Pious') ? 0.25 : 0) + (kidsOf(s, w).length ? 0.1 : 0) + opinion(s, w.id, b.id) / 300, 0.05, 0.7);
  const rec = clampP(0.2 + opinion(s, w.id, b.id) / 200 + (W.weeks.slice(-2).every((x) => x.home >= x.need) ? 0.15 : 0), 0.05, 0.6);
  const arr = clampP(arrangementOdds(s, w, W) + 0.1, 0.05, 0.75);
  return ev(s, w, 'wife_divorce', `${w.firstName} wants a divorce`,
    `${w.firstName} has seen a lawyer in Cape May. In a Catholic town, in 1960, this is the worst thing a wife can do to a man in your position, and she knows it. She wants out.`,
    [
      { id: 'settle', label: 'Give her the divorce', detail: `Certain: ${divorceLine(s, w)}`, because: 'gave your wife her divorce', effects: [WX({ k: 'settle', mult: 1 })] },
      { id: 'fight', label: `Fight it (${pct(fight)})`, detail: `${pct(fight)} the Church and her mother talk her out of it (her opinion −10). Otherwise she gets it on worse terms (×1.5) and respect −3 more.`, because: 'fought your wife\'s divorce', effects: [WX({ k: 'fight', chance: fight })] },
      { id: 'reconcile', label: `Ask her to stay (${pct(rec)})`, detail: `${pct(rec)} she stays: suspicion −25, her opinion +15, and you promised to be home. Otherwise she goes ahead.`, because: 'asked your wife to stay', effects: [WX({ k: 'reconcile', chance: rec })] },
      ...(!W.arr ? [{ id: 'arr', label: `The arrangement instead (${pct(arr)})`, detail: `${pct(arr)} she takes it instead of the divorce. Otherwise she goes ahead.`, because: 'offered your wife an arrangement instead', effects: [WX({ k: 'propose', chance: arr, mult: 1 })] }] : []),
    ], 66);
}

/* ------------------------------------------------------------------ */
/* Ops                                                                  */
/* ------------------------------------------------------------------ */

function startArr(s: GameState, W: WifeState, w: Character, allowance: number): void {
  W.arr = { since: s.week, allowance, herMoney: 0, breach: 0, next: s.week + 10 + (hashSeed(`${s.seed}:${w.id}:ask`) % 5) };
  W.susp = Math.min(W.susp, 30);
  note(s, W, `You and ${w.firstName} came to an arrangement: ${$(allowance)} a week, the house, discretion. You live your life; she lives hers.`);
}

function breakArr(ctx: Ctx, W: WifeState, w: Character, why: string): void {
  const s = ctx.s;
  W.arr = undefined;
  W.broken = (W.broken ?? 0) + 1;
  W.susp = Math.max(W.susp, 70);
  addOpinion(s, w.id, s.playerId, 'He broke our arrangement', -20, 1);
  note(s, W, `${w.firstName} called off the arrangement: ${why}.`);
  ctx.log.push(`${w.firstName} called off your arrangement: ${why}.`);
}

function endHer(s: GameState, W: WifeState, w: Character, why: string): void {
  if (!W.her || W.her.ended !== undefined) return;
  W.her.ended = s.week;
  const m = s.characters[W.her.man];
  if (m) W.close[m.id] = Math.min(W.close[m.id] ?? 0, 20);
  note(s, W, `${w.firstName} ended it with ${m ? displayName(m) : 'him'}: ${why}.`, m ? [m.id] : []);
}

/** Divorce, final: romance.ts' separation (a divorce), the scandal, the settlement through the pocket, alimony each week after. */
export function finalizeDivorce(ctx: Ctx, w: Character, mult = 1, by: 'her' | 'him' = 'her'): void {
  const s = ctx.s;
  const b = player(s);
  const W = ensureWife(s, w);
  const t = divorceTerms(s, w, mult);
  const kids = kidsOf(s, w);
  const heir = chooseHeir(s, b).heir;
  // Her family's ties go with her (the alliance holds only while they are married).
  const al = (s.dyn?.alliances ?? []).find((a) => a.theirId === w.id || a.ourId === w.id);
  const house = al ? houseById(s, al.houseId) : undefined;
  const fx: Effect[] = [
    { type: 'storyOp', op: { op: 'separate', a: b.id, divorce: true } } as Effect,
    { type: 'respect', amount: -8 },
    { type: 'familyOpinion', amount: -10, reason: 'A divorce, in this family' },
    { type: 'rivalOpinion', rival: 'philly' as RivalId, amount: -8, reason: 'A boss who can\'t keep his marriage' },
    { type: 'crewOpinion', amount: -2, reason: 'The boss\'s divorce', traitMods: { Pious: -3 } },
    ...kids.map((k) => ({ type: 'opinion', from: k.id, to: b.id, amount: heir?.id === k.id ? -25 : -15, reason: 'Divorced our mother', decay: 0 }) as Effect),
    ...(s.dyn ? [{ type: 'dyn', op: { op: 'stress', charId: b.id, amount: 15, source: 'domestic' } } as Effect] : []),
  ];
  applyEffects(ctx, fx, { label: `Divorced from ${w.firstName}`, because: by === 'him' ? 'asked for a divorce' : 'were divorced', category: 'event' });
  spendPocket(ctx, t.lump, `The divorce settlement for ${w.firstName}`, `wife:lump:${w.id}`);
  const S = s.wife ?? W;
  S.ali = [...(S.ali ?? []), { id: w.id, amount: t.alimony, since: s.week, until: s.week + 260 }];
  const lines = [
    `${displayName(b)} and ${displayName(w)} were divorced. In a Catholic town it is all anyone talks about; the monsignor stops coming to dinner.`,
    `She keeps the house; ${$(t.lump)} up front and ${$(t.alimony)} a week alimony.`,
    ...(kids.length ? [`The children took it hard${heir && kids.some((k) => k.id === heir.id) ? `, ${heir.firstName} hardest` : ''}.`] : []),
    ...(house ? [`The ${house.name} house is through with you.`] : []),
  ];
  for (const l of lines) ctx.log.push(l);
  journal(s, { t: `Divorced from ${w.firstName}`, x: lines.join(' '), c: 'romance', src: 'wife', p: [w.id, ...kids.map((k) => k.id)], m: -t.lump, mine: 1 });
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: lines[0], kind: 'family' });
  // The record of this marriage is closed; alimony carries on.
  s.wife = { ...fresh(w.id, S), id: `former:${w.id}`, ali: S.ali };
}

export function applyWifeOp(ctx: Ctx, o: WifeOp): void {
  const s = ctx.s;
  const b = player(s);
  const w = wifeHere(s);
  if (!w) return;
  const W = ensureWife(s, w);
  const hit = (c: number | undefined) => c === undefined || roll(s, W, `op:${o.k}`) < c;
  const f = w.firstName;
  const op = (amount: number, reason: string) => addOpinion(s, w.id, b.id, reason, amount, 1);
  switch (o.k) {
    case 'deny':
      if (hit(o.chance)) { bump(s, W, -10, 'You denied it, and she believed you'); note(s, W, `You told ${f} there was nothing. She believed you, this time.`); }
      else { bump(s, W, 10, 'You denied it; she didn\'t believe you'); op(-8, 'He lied to my face'); note(s, W, `You told ${f} there was nothing. She didn't believe a word.`); }
      break;
    case 'confess':
      bump(s, W, -25, 'You told her the truth'); W.proof = true; op(-15, 'He admitted it');
      note(s, W, `You told ${f} the truth. She didn't throw anything. She just knows now.`);
      break;
    case 'gift': {
      if (o.cost) spendPocket(ctx, o.cost, `Something nice for ${f}`, `wife:gift:${s.week}:${W.n}`);
      if (hit(o.chance)) { bump(s, W, -15, 'You brought her something nice'); op(6, 'He brought me something'); note(s, W, `${f} wore it to Mass on Sunday.`); }
      else { bump(s, W, -5, 'A gift (she saw through it)'); note(s, W, `${f} put it in the drawer. "Guilty men buy jewelry."`); }
      break;
    }
    case 'promise':
      bump(s, W, -12, 'You promised to be home more'); W.promise = s.week + 4;
      note(s, W, `You promised ${f} you'd be home more. She'll be counting.`);
      break;
    case 'home':
      bump(s, W, -4, 'You told her you\'d be home more');
      break;
    case 'talk':
      if (hit(o.chance)) { bump(s, W, -8, 'A real talk with her'); op(5, 'We talked, really talked'); note(s, W, `You sat with ${f} after the kids were in bed, and really talked.`); }
      else { op(-3, 'He talks, he doesn\'t listen'); note(s, W, `You tried to talk to ${f}. It turned into the same fight.`); }
      break;
    case 'propose':
      if (hit(o.chance)) { startArr(s, W, w, o.amount ?? herAllowance(s, w)); op(4, 'At least he\'s honest now'); W.proof = true; }
      else { op(-10, 'He wants a license to cheat'); bump(s, W, 5, 'You proposed an arrangement; she said no'); note(s, W, `${f} said no to an arrangement. "I married a husband."`); }
      break;
    case 'termsYes': startArr(s, W, w, o.amount ?? herAllowance(s, w)); break;
    case 'termsHaggle':
      if (hit(o.chance)) startArr(s, W, w, r25((o.amount ?? herAllowance(s, w)) * 0.7));
      else { startArr(s, W, w, o.amount ?? herAllowance(s, w)); op(-5, 'He haggled over me'); }
      break;
    case 'termsNo': op(-10, 'He refused my terms'); note(s, W, `You refused ${f}'s terms. Nothing is settled.`); break;
    case 'raiseYes': if (W.arr) { W.arr.allowance += o.amount ?? 0; W.arr.next = s.week + 12; op(6, 'He gave me what I asked'); note(s, W, `${f}'s allowance is ${$(W.arr.allowance)} a week now.`); } break;
    case 'raiseCounter':
      if (!W.arr) break;
      if (hit(o.chance)) { W.arr.allowance += o.amount ?? 0; W.arr.next = s.week + 10; note(s, W, `${f} took the smaller raise: ${$(W.arr.allowance)} a week.`); }
      else { W.arr.breach++; W.arr.next = s.week + 6; op(-6, 'He nickel-and-dimes me'); note(s, W, `${f} wouldn't take half. It counts against the arrangement.`); }
      break;
    case 'raiseNo': case 'shopNo':
      if (!W.arr) break;
      if (hit(o.chance)) { W.arr.next = s.week + 8; note(s, W, `${f} let it go, for now.`); }
      else { W.arr.breach++; W.arr.next = s.week + 6; op(-10, 'He said no to me'); note(s, W, `${f} didn't let it go. It counts against the arrangement.`); }
      break;
    case 'shopYes': case 'shopShare': {
      if (!W.arr || !o.shop) break;
      const I = SHOP_INFO[o.shop];
      if (o.k === 'shopShare' && !hit(o.chance)) { W.arr.breach++; W.arr.next = s.week + 6; op(-6, 'Half a shop'); note(s, W, `${f} wouldn't take half a shop. It counts against the arrangement.`); break; }
      if (o.cost) spendPocket(ctx, o.cost, `${f}'s shop: ${I.label}`, `wife:shop:${w.id}`);
      W.arr.shop = { kind: o.shop, since: s.week, weekly: o.k === 'shopShare' ? Math.round(I.weekly / 2) : I.weekly };
      W.arr.next = s.week + 20;
      op(o.k === 'shopYes' ? 15 : 8, 'My own shop');
      note(s, W, `${f} has ${o.k === 'shopShare' ? 'a half share in ' : ''}${I.label}. Her own money, from her own work.`);
      break;
    }
    case 'herTalk':
      if (hit(o.chance)) { endHer(s, W, w, 'you talked'); bump(s, W, -10, 'You talked it through'); }
      else { op(-5, 'He doesn\'t get to tell me'); note(s, W, `${f} heard you out, and kept on seeing him.`); }
      break;
    case 'herDistance': case 'distance': {
      const m = o.man ? s.characters[o.man] : undefined;
      if (!m) break;
      if (hit(o.chance)) {
        addOpinion(s, m.id, b.id, 'The boss warned me off', -10, 1);
        W.close[m.id] = Math.min(W.close[m.id] ?? 0, 15);
        if (W.her?.man === m.id) endHer(s, W, w, `${m.firstName} kept his distance`);
        else note(s, W, `You told ${m.firstName} to keep his distance from the house. He does.`, [m.id]);
      } else {
        changeMeter(s, m.id, b.id, 'grievance', 15);
        note(s, W, `You told ${m.firstName} to keep his distance. He still comes around.`, [m.id]);
      }
      break;
    }
    case 'herAway': case 'away': {
      const m = o.man ? s.characters[o.man] : undefined;
      if (!m) break;
      addOpinion(s, m.id, b.id, 'Sent me away', -15, 1);
      changeMeter(s, m.id, b.id, 'grievance', 10);
      m.busyUntil = Math.max(m.busyUntil ?? 0, s.week + 13);
      W.close[m.id] = 0;
      if (W.her?.man === m.id) endHer(s, W, w, `${m.firstName} was sent to Florida for a season`);
      else note(s, W, `You gave ${m.firstName} a job away from the island for a season.`, [m.id]);
      break;
    }
    case 'herWords': case 'confront': {
      const m = o.man ? s.characters[o.man] : undefined;
      if (!m) break;
      if (hit(o.chance ?? 0.6)) {
        changeMeter(s, m.id, b.id, 'fear', 10);
        W.close[m.id] = Math.min(W.close[m.id] ?? 0, 10);
        if (W.her?.man === m.id) endHer(s, W, w, `${m.firstName} backed off`);
        else note(s, W, `You had words with ${m.firstName}. He got the message.`, [m.id]);
      } else {
        applyEffects(ctx, [{ type: 'respect', amount: -2 }], { label: `${m.firstName} talks`, because: `had words with ${m.firstName}`, category: 'event' });
        changeMeter(s, m.id, b.id, 'grievance', 15);
        note(s, W, `You had words with ${m.firstName}. He told everyone about it.`, [m.id]);
      }
      break;
    }
    case 'herForgive':
      bump(s, W, -20, 'You forgave her'); op(10, 'He forgave me');
      if (hit(o.chance)) endHer(s, W, w, 'you forgave her, and she was ashamed');
      else note(s, W, `You forgave ${f}. She hasn't ended it.`);
      break;
    case 'separate':
      applyEffects(ctx, [
        { type: 'storyOp', op: { op: 'separate', a: b.id } } as Effect,
        { type: 'respect', amount: -3 },
        { type: 'familyOpinion', amount: -8, reason: 'Broke up the marriage' },
        { type: 'opinion', from: w.id, to: b.id, amount: -20, reason: 'He sent me away', decay: 1 },
      ], { label: `Separated from ${f}`, because: 'separated from your wife', category: 'event' });
      note(s, W, `${f} moved to her sister's. The parish talks.`);
      break;
    case 'divorce': finalizeDivorce(ctx, w, o.mult ?? 1, 'him'); break;
    case 'settle': finalizeDivorce(ctx, w, o.mult ?? 1, 'her'); break;
    case 'fight':
      if (hit(o.chance)) { op(-10, 'He made me stay'); W.cd.divorce = s.week + 26; note(s, W, `The monsignor and ${f}'s mother talked her out of it. She stays. She isn't happy.`); }
      else { applyEffects(ctx, [{ type: 'respect', amount: -3 }], { label: 'A fought divorce', because: 'fought the divorce', category: 'event' }); finalizeDivorce(ctx, w, 1.5, 'her'); }
      break;
    case 'reconcile':
      if (hit(o.chance)) { bump(s, W, -25, 'She agreed to stay'); op(15, 'He asked me to stay'); W.promise = s.week + 6; W.cd.divorce = s.week + 26; note(s, W, `${f} tore up the lawyer's letter. You promised to be home.`); }
      else finalizeDivorce(ctx, w, 1, 'her');
      break;
    case 'endArr':
      if (!W.arr) break;
      W.arr = undefined; W.susp = Math.max(W.susp, 50);
      note(s, W, `You ended the arrangement with ${f}. Back to the way it was: she'll want you home.`);
      break;
  }
}

export function describeWifeOp(s: GameState, o: WifeOp): string | undefined {
  const w = wifeHere(s);
  const f = w?.firstName ?? 'Your wife';
  if (o.k === 'divorce' || o.k === 'settle') return `Divorce from ${f}`;
  if (o.k === 'propose' || o.k === 'termsYes') return `An arrangement with ${f}`;
  if (o.k === 'separate') return `Separation from ${f}`;
  return undefined;
}

/* ------------------------------------------------------------------ */
/* The week                                                             */
/* ------------------------------------------------------------------ */

function payAlimony(ctx: Ctx): void {
  const s = ctx.s;
  const A = s.wife?.ali;
  if (!A?.length) return;
  for (const a of A) {
    const ex = s.characters[a.id];
    if (!ex?.alive || a.until < s.week) continue;
    spendPocket(ctx, a.amount, `Alimony to ${ex.firstName}`, `wife:ali:${a.id}`, true);
  }
  s.wife!.ali = A.filter((a) => s.characters[a.id]?.alive && a.until >= s.week);
}

/** The women he spent evenings with this week (adults; the dating bonds, the paid company, the goomars). */
export function womenThisWeek(s: GameState, w: Character): string[] {
  const out = new Set<string>();
  const D = s.dating;
  for (const [id, b] of Object.entries(D?.bonds ?? {})) if (id !== w.id && b.last === s.week) out.add(id);
  for (const p of Object.values(D?.providers ?? {})) if (p.visits.includes(s.week)) out.add(p.id);
  for (const g of activeGoomars(s)) if (D?.bonds[g.id]?.last === s.week) out.add(g.id);
  return [...out];
}

/**
 * The wife's week (engine.ts, after the women and the single layer): alimony;
 * then for a married boss the nights home against the minimum, the women,
 * the rumors, the scenes at the thresholds, her calls to his people, the man
 * she grows close to, stepping out, the arrangement's terms and asks, and
 * the divorce. `plan`: the nights as the boss lived the week (read before
 * the days plan is dropped).
 */
export function wifeWeek(ctx: Ctx, plan?: NightsPlan): void {
  const s = ctx.s;
  if (s.gameOver) return;
  payAlimony(ctx);
  const w = wifeHere(s);
  if (!w) return;
  const b = player(s);
  if (!isFree(s, b)) return;
  const W = ensureWife(s, w);
  const p = plan ?? nightsPlan(s);
  const f = w.firstName;
  const A = W.arr;
  const k = A ? 0.25 : 1;
  // The nights.
  if (!A) {
    const doubled = W.promise !== undefined && W.promise >= s.week ? 2 : 1;
    if (p.short > 0) {
      bump(s, W, (p.short - Math.min(p.short, p.trip) / 2) * 4 * doubled, `Home ${fmtN(p.home)} of ${p.need} nights`);
      addOpinion(s, w.id, b.id, doubled > 1 ? 'He promised to be home' : 'Never home', -Math.round(2 * p.short * doubled), 1);
    } else {
      bump(s, W, -3 - Math.max(0, p.home - p.need) * 2, `Home ${fmtN(p.home)} of ${p.need} nights`);
      addOpinion(s, w.id, b.id, 'Home for dinner', 2, 1);
    }
    if (p.withHer) { bump(s, W, -3 * p.withHer, 'Evenings with her'); addOpinion(s, w.id, b.id, 'He took me out', 2 * p.withHer, 1); }
    const streak = longestOut(p);
    if (streak >= 3) bump(s, W, 2 * (streak - 2), `${streak} nights out in a row`);
    if (p.trip >= 5) bump(s, W, 6, `Out of town ${p.trip} nights`);
  }
  if (p.stoodUp) {
    bump(s, W, 5 * p.stoodUp * Math.max(k, 0.5), p.stoodUp === 1 ? 'You said you\'d be home, and weren\'t' : `Stood her up ${p.stoodUp} times`);
    addOpinion(s, w.id, b.id, 'Said he\'d be home', -3 * p.stoodUp, 1);
  }
  // The women.
  const women = womenThisWeek(s, w);
  W.weeks.push({ w: s.week, home: p.home, need: p.need, women });
  if (W.weeks.length > 10) W.weeks.splice(0, W.weeks.length - 10);
  const distinct = new Set(W.weeks.filter((x) => s.week - x.w < 6).flatMap((x) => x.women)).size;
  if (women.length) bump(s, W, 3 * women.length * k, women.length === 1 ? 'Another woman this week' : `${women.length} women this week`);
  if (distinct >= 3) bump(s, W, (distinct - 2) * 2 * k, `${distinct} different women in six weeks`);
  const paid = Object.values(s.dating?.providers ?? {}).filter((x) => x.visits.includes(s.week)).length;
  if (paid && adultOn(s)) bump(s, W, 3 * paid * k, 'Paid company');
  // Rumors that reached her; the goomar she knows of.
  const heard = (s.dating?.rumors ?? []).filter((r) => r.week === s.week && (r.heard.includes(w.id) || r.heard.includes('island')));
  const herEars = heard.filter((r) => r.heard.includes(w.id)).length;
  if (herEars) { bump(s, W, 8 * herEars * k, 'Talk reached her'); if (herEars) W.proof = true; }
  if (activeGoomars(s).some((g) => g.wifeKnows)) W.proof = true;
  // Lipstick and perfume: a woman this week leaves a trace.
  if (women.length && !A && roll(s, W, 'trace') < 0.12 * women.length) {
    const trace = roll(s, W, 'traceKind') < 0.5 ? 'lipstick on your collar' : 'perfume on your jacket that isn\'t hers';
    bump(s, W, 10, `She found ${trace}`);
    note(s, W, `${f} found ${trace}.`);
  }
  // Time and nothing to find: it eases.
  if (!women.length && p.short <= 0 && !heard.length) bump(s, W, -2, 'A quiet week');
  // Under the arrangement: her money, her terms.
  if (A) arrangementWeek(ctx, W, w, A, heard.length);
  // Her calls to his people.
  calls(ctx, W, w, p, women);
  // The man she grows close to.
  closeness(ctx, W, w, p);
  // How bad it is.
  const op = opinion(s, w.id, b.id);
  W.bad = W.susp >= 70 && op <= -20 ? W.bad + 1 : 0;
  // Her own life.
  her(ctx, W, w, op);
  // The scenes at the thresholds, her terms, the divorce.
  if (!pending(s)) maybeEvent(ctx, W, w, op);
}

function fmtN(n: number): string { return Number.isInteger(n) ? String(n) : n.toFixed(1); }

function longestOut(p: NightsPlan): number {
  let best = 0, run = 0;
  for (const r of p.rows) { if (r.kind === 'neutral') continue; run = r.credit === 0 ? run + 1 : 0; best = Math.max(best, run); }
  return best;
}

function arrangementWeek(ctx: Ctx, W: WifeState, w: Character, A: Arrangement, publicTalk: number): void {
  const s = ctx.s;
  const pocket = s.tribute?.acct.personal ?? 0;
  if (pocket >= A.allowance) spendPocket(ctx, A.allowance, `${w.firstName}'s allowance (the arrangement)`, `wife:allow:${w.id}`, true);
  else { A.breach++; addOpinion(s, w.id, s.playerId, 'The money didn\'t come', -8, 1); note(s, W, `${w.firstName}'s allowance didn't come this week (your pocket is short). It counts against the arrangement.`); }
  if (A.shop) A.herMoney += A.shop.weekly;
  if (publicTalk) { A.breach++; addOpinion(s, w.id, s.playerId, 'He humiliated me in public', -6, 1); note(s, W, `It was talk on the island, and ${w.firstName} heard it in church. Discretion was the deal.`); }
  if (A.breach >= 3) { breakArr(ctx, W, w, 'too many missed payments and too much talk'); return; }
  if (s.week >= A.next && !pending(s)) { s.eventQueue.push(askEvent(s, w, W, A)); A.next = s.week + 8; }
}

function calls(ctx: Ctx, W: WifeState, w: Character, p: NightsPlan, women: string[]): void {
  const s = ctx.s;
  if (W.arr) return;
  if (!(W.susp >= 35 || p.trip >= 3 || p.short >= 2)) return;
  if (roll(s, W, 'call') >= 0.6) return;
  const people = peopleSheCalls(s);
  if (!people.length) return;
  const n = W.susp >= 65 ? 2 : 1;
  const recentWomen = women.length ? women : W.weeks.slice(-3).flatMap((x) => x.women);
  for (let i = 0; i < n; i++) {
    const weights = people.map((t) => 1 + (W.close[t.id] ?? 0) / 20);
    let r = roll(s, W, 'callWho') * weights.reduce((a, x) => a + x, 0);
    const t = people.find((_, j) => (r -= weights[j]) < 0) ?? people[0];
    const c = s.characters[t.id];
    const o = callOdds(s, c);
    const x = roll(s, W, 'callHow');
    let how: WifeCall['how'] = x < o.cover ? 'cover' : x < o.cover + o.slip ? 'slip' : 'vague';
    if (how === 'slip' && !recentWomen.length && p.short <= 0) how = 'vague';
    const nm = c.firstName;
    let line: string;
    if (how === 'cover') { bump(s, W, -5, `${nm} covered for you`); line = `${w.firstName} called ${nm}. He covered for you.`.replace('He covered', c.gender === 'F' ? 'She covered' : 'He covered'); }
    else if (how === 'vague') { bump(s, W, 2, `${nm} was vague`); line = `${w.firstName} called ${nm}. ${c.gender === 'F' ? 'She' : 'He'} didn't know, or said so.`; }
    else {
      const wid = recentWomen[Math.floor(roll(s, W, 'callName') * recentWomen.length)];
      const wc = wid ? s.characters[wid] : undefined;
      bump(s, W, 10, `${nm} let something slip`);
      if (wc) W.proof = W.proof || roll(s, W, 'callProof') < 0.3;
      line = `${w.firstName} called ${nm}, and ${c.gender === 'F' ? 'she' : 'he'} let something slip${wc ? `: a name, ${wc.firstName}` : ''}.`;
    }
    if (t.man) W.close[t.id] = clamp((W.close[t.id] ?? 0) + (how === 'cover' ? 8 : how === 'vague' ? 5 : 4));
    W.calls.push({ w: s.week, who: t.id, how, t: line });
    if (W.calls.length > 12) W.calls.splice(0, W.calls.length - 12);
    note(s, W, line, [t.id], true);
  }
}

function closeness(ctx: Ctx, W: WifeState, w: Character, p: NightsPlan): void {
  const s = ctx.s;
  for (const id of Object.keys(W.close)) {
    const c = s.characters[id];
    if (!c?.alive) { delete W.close[id]; continue; }
    const called = W.calls.some((x) => x.who === id && s.week - x.w < 4);
    W.close[id] = clamp(W.close[id] + (called && p.short > 0 ? 3 : -2));
    if (W.close[id] <= 0) { delete W.close[id]; continue; }
  }
  const top = closestMan(s, W);
  if (top && top.v >= 40 && (W.cd.sign ?? 0) <= s.week && roll(s, W, 'sign') < 0.4) {
    const m = s.characters[top.id];
    const t = top.v >= 70 ? `${m.firstName} gets evasive when you ask about home.` : top.v >= 55 ? `${w.firstName} mentions ${m.firstName} at dinner. Twice.` : `${m.firstName} has been by the house a lot while you're out.`;
    W.cd.sign = s.week + 3;
    note(s, W, t, [m.id], true);
  }
}

/** The man she has grown closest to (one of his people she calls), with how close. */
export function closestMan(s: GameState, W: WifeState): { id: string; v: number } | undefined {
  let best: { id: string; v: number } | undefined;
  for (const [id, v] of Object.entries(W.close)) {
    const c = s.characters[id];
    if (!c?.alive || c.gender !== 'M' || id === s.playerId) continue;
    if (!best || v > best.v) best = { id, v };
  }
  return best;
}

function her(ctx: Ctx, W: WifeState, w: Character, op: number): void {
  const s = ctx.s;
  const b = player(s);
  const H = W.her && W.her.ended === undefined ? W.her : undefined;
  if (H) {
    const m = s.characters[H.man];
    if (!m?.alive) { endHer(s, W, w, 'he is gone'); return; }
    // It comes out: to the boss, and maybe to the island.
    if (H.known === undefined && roll(s, W, 'herKnown') < (H.kind === 'his' ? 0.22 : 0.15)) {
      H.known = s.week;
      note(s, W, `You know now: ${w.firstName} has been seeing ${displayName(m)}.`, [m.id]);
      ctx.log.push(`You found out: ${w.firstName} has been seeing ${displayName(m)}.`);
      if (!pending(s, 'wife_her')) s.eventQueue.push(herEvent(s, w, W, H));
    } else if (H.known === undefined && roll(s, W, 'herSign') < 0.3) {
      note(s, W, `${w.firstName} has been out evenings herself lately, and doesn't say where.`, [], true);
    }
    if (H.out === undefined && roll(s, W, 'herOut') < 0.08 * (H.known !== undefined ? 2 : 1)) {
      H.out = s.week;
      const fx: Effect[] = [{ type: 'respect', amount: H.kind === 'town' ? -2 : -4 }];
      if (H.kind === 'his') fx.push({ type: 'crewOpinion', amount: -3, reason: `The boss's wife and ${m.firstName}`, traitMods: { 'Loyal-to-a-fault': -2 } });
      if (H.kind === 'rival' && H.rival) {
        const sec = addSecret(s, w, 'affair', [H.rival as FactionId]);
        if (!sec.knownBy.includes(H.rival as FactionId)) sec.knownBy.push(H.rival as FactionId);
        sec.text = `${displayName(w)} has been seeing ${displayName(m)}, a ${H.rival} man`;
      }
      applyEffects(ctx, fx, { label: `Talk about ${w.firstName}`, because: 'your wife was seen with another man', category: 'event' });
      note(s, W, `It's talk on the island now: the boss's wife and ${displayName(m)}.${H.kind === 'rival' ? ' A rival family has a lever.' : H.kind === 'his' ? ' Your men talk about it behind your back.' : ''}`, [m.id], true);
    }
    return;
  }
  if (W.arr) return;
  // Stepping out: he has been that bad for weeks, or she has proof and nothing left for him.
  const bad = W.bad >= 3 || (W.proof && op <= -30 && W.susp >= 60);
  if (!bad || (W.cd.her ?? 0) > s.week) return;
  if (roll(s, W, 'stepOut') >= 0.25) return;
  const top = closestMan(s, W);
  let man: Character | undefined;
  let kind: HerAffair['kind'] = 'town';
  let rival: RivalId | undefined;
  if (top && top.v >= 50 && roll(s, W, 'herHis') < 0.75) { man = s.characters[top.id]; kind = man.faction === 'player' ? 'his' : 'town'; }
  if (!man && roll(s, W, 'herRival') < 0.3) {
    const rv = s.rivals.find((r) => r.kind === 'mob');
    const men = rv ? Object.values(s.characters).filter((c) => c.alive && c.gender === 'M' && c.faction === rv.id && c.rank === 'soldier' && ageOn(c.birth, s.date) >= 21 && ageOn(c.birth, s.date) <= 55) : [];
    if (rv && men.length) { man = men[Math.floor(roll(s, W, 'herRivalWho') * men.length)]; kind = 'rival'; rival = rv.id; }
  }
  if (!man) {
    const age = Math.max(25, Math.min(55, ageOn(w.birth, s.date) + 2));
    man = makeCharacter(s, { gender: 'M', age, rank: 'civilian', faction: 'none', nickname: false, wealth: 800 });
  }
  W.her = { man: man.id, since: s.week, kind, ...(rival ? { rival } : {}) };
  W.cd.her = s.week + 26;
  W.log.push([s.week, `${w.firstName} has stopped asking where you were.`]);
  void b;
}

function maybeEvent(ctx: Ctx, W: WifeState, w: Character, op: number): void {
  const s = ctx.s;
  // The divorce: the worst of it, for weeks.
  const wantsOut = (op <= -40 && W.susp >= 75 && W.bad >= 4) || (W.broken ?? 0) >= 2 || (W.her?.known !== undefined && W.her.ended === undefined && op <= -40);
  if (wantsOut && (W.cd.divorce ?? 0) <= s.week && roll(s, W, 'divorce') < 0.2) {
    W.cd.divorce = s.week + 12;
    s.eventQueue.push(divorceEvent(s, w, W));
    return;
  }
  // Her terms: she knows, and she's done waiting.
  if (!W.arr && W.proof && W.susp >= 70 && op < 0 && (W.cd.terms ?? 0) <= s.week && roll(s, W, 'terms') < arrangementOdds(s, w, W) * 0.4) {
    W.cd.terms = s.week + 16;
    s.eventQueue.push(termsEvent(s, w));
    return;
  }
  if (W.arr) return;
  // The scenes at the thresholds (one a week, each with its own cooldown).
  for (const sc of SCENES) {
    if (W.susp < sc.at || (W.cd[sc.key] ?? 0) > s.week) continue;
    W.cd[sc.key] = s.week + 6;
    s.eventQueue.push(sceneEvent(s, w, W, sc.key, sc.title));
    return;
  }
}

/* ------------------------------------------------------------------ */
/* The card, the Desk, Ready to advance                                 */
/* ------------------------------------------------------------------ */

export interface WifeAct { k: WifeKey; label: string; detail: string; chance?: number; cost?: number; man?: string; confirm?: string; disabled?: string }

/** What the boss can do from her card, each with its odds. */
export function wifeActs(s: GameState): WifeAct[] {
  const w = wifeHere(s);
  if (!w) return [];
  const W = wifeRecord(s) ?? fresh(w.id, s.wife);
  const b = player(s);
  const out: WifeAct[] = [];
  const talk = clampP(0.5 + opinion(s, w.id, b.id) / 200 - W.susp / 300, 0.15, 0.85);
  const gifts = W.why.filter((x) => s.week - x.w < 4 && /something nice/.test(x.t)).length;
  out.push({ k: 'home', label: 'Home for dinner', detail: 'Book an evening with her on the next free night (it counts toward nights home).' });
  out.push({ k: 'gift', label: 'Bring her something ($250)', detail: `From your pocket: suspicion −15, her opinion +6${gifts ? ' (she notices a pattern: 25% she sees through it)' : ''}.`, cost: 250, chance: gifts ? 0.75 : 1 });
  out.push({ k: 'talk', label: `Sit down and talk (${pct(talk)})`, detail: `${pct(talk)}: suspicion −8, her opinion +5. Otherwise the same fight (−3).`, chance: talk });
  if (W.arr) out.push({ k: 'endArr', label: 'End the arrangement', detail: 'Certain: back to the way it was (she will want you home; suspicion at least 50).' });
  else { const a = arrangementOdds(s, w, W); out.push({ k: 'propose', label: `Propose an arrangement (${pct(a)})`, detail: `${pct(a)} she agrees: you live your life; she sets an allowance (about ${$(herAllowance(s, w))} a week) and wants money of her own. Otherwise her opinion −10.`, chance: a }); }
  const top = closestMan(s, W);
  if (top && top.v >= 40 && !(W.her && W.her.ended === undefined && W.her.man === top.id && W.her.known !== undefined)) {
    const m = s.characters[top.id];
    if (m.faction === 'player') {
      const dist = clampP(0.4 + opinion(s, m.id, b.id) / 150 + (hasTrait(m, 'Loyal-to-a-fault') ? 0.2 : 0), 0.1, 0.85);
      out.push({ k: 'distance', man: m.id, label: `Tell ${m.firstName} to keep his distance (${pct(dist)})`, detail: `${pct(dist)} he does; his opinion −10. Otherwise he keeps coming around (grievance +15).`, chance: dist });
      out.push({ k: 'away', man: m.id, label: `Give ${m.firstName} a job away`, detail: 'Certain: Florida for a season; his opinion −15, grievance +10. Nobody is hurt.' });
    }
    out.push({ k: 'confront', man: m.id, label: `Have words with ${m.firstName} (60%)`, detail: '60% he gets the message (he fears you a little more). Otherwise he talks: respect −2. Words only.', chance: 0.6 });
  }
  out.push({ k: 'divorce', label: 'Ask for a divorce', detail: `Certain, and a scandal: ${divorceLine(s, w)}`, confirm: `Divorce ${w.firstName}? ${divorceLine(s, w)}` });
  return out;
}

/** Do it from her card, now. Pure: a new state and the line for the toast (Your File has it too). */
export function wifeAct(s0: GameState, k: WifeKey, man?: string): { state: GameState; line: string; ok: boolean } {
  const w0 = wifeHere(s0);
  const a = wifeActs(s0).find((x) => x.k === k && (man === undefined || x.man === man));
  if (!w0 || !a || a.disabled) return { state: s0, line: a?.disabled ?? 'Not now', ok: false };
  if (k === 'home') {
    const plan = weekPlan(s0);
    const free = [...FILL].filter((d) => d >= today(s0)).find((d) => !plan[d]);
    if (free === undefined) return { state: s0, line: 'No free evening left this week', ok: false };
    let s1 = setEvening(s0, free, 'fam:wife');
    if (s1 === s0) return { state: s0, line: 'No free evening left this week', ok: false };
    s1 = setDinner(s1, free, 'home');
    return { state: s1, line: `${DAY_NAMES[free]}: an evening with ${w0.firstName}.`, ok: true };
  }
  const s = cloneState(s0);
  const ctx = newCtx(s);
  const W = ensureWife(s, wifeHere(s)!);
  const n0 = W.log.length;
  applyWifeOp(ctx, { op: 'wife', k, chance: a.chance, cost: a.cost, man: a.man });
  const line = (s.wife?.log.slice(n0).map((x) => x[1]).pop()) ?? ctx.log[ctx.log.length - 1] ?? 'Done.';
  return { state: s, line, ok: true };
}

export interface WifeView {
  wife: Character;
  plan: NightsPlan;
  susp: number;
  /** Suspicion in words. */
  word: string;
  why: { t: string; v: number }[];
  opinion: number;
  arr?: Arrangement;
  her?: { man: Character; kind: HerAffair['kind'] };
  close?: { man: Character; v: number };
  calls: WifeCall[];
  log: string[];
  acts: WifeAct[];
  auto: boolean;
  alimony: { name: string; amount: number }[];
}

export function suspWord(v: number): string {
  return v >= 80 ? 'She knows something' : v >= 65 ? 'Watching you' : v >= 50 ? 'Suspicious' : v >= 30 ? 'Wondering' : 'Trusts you';
}

/** Her card (undefined: an unmarried boss sees nothing). */
export function wifeView(s: GameState, orders: readonly PlayerAction[] = []): WifeView | undefined {
  const w = wifeHere(s);
  if (!w) return undefined;
  const W = wifeRecord(s);
  const susp = W?.susp ?? 10;
  const H = W?.her && W.her.ended === undefined && W.her.known !== undefined ? W.her : undefined;
  const top = W ? closestMan(s, W) : undefined;
  return {
    wife: w, plan: nightsPlan(s, orders), susp, word: suspWord(susp),
    why: (W?.why ?? []).filter((x) => s.week - x.w <= 3).slice(-6).reverse().map((x) => ({ t: x.t, v: x.v })),
    opinion: opinion(s, w.id, s.playerId),
    ...(W?.arr ? { arr: W.arr } : {}),
    ...(H && s.characters[H.man] ? { her: { man: s.characters[H.man], kind: H.kind } } : {}),
    ...(top && top.v >= 25 ? { close: { man: s.characters[top.id], v: top.v } } : {}),
    calls: (W?.calls ?? []).slice(-4).reverse(),
    log: (W?.log ?? []).slice(-5).reverse().map((x) => x[1]),
    acts: wifeActs(s), auto: !!W?.auto,
    alimony: (s.wife?.ali ?? []).filter((a) => s.characters[a.id]?.alive).map((a) => ({ name: s.characters[a.id].firstName, amount: a.amount })),
  };
}

/** Does she need him on the Desk this week (falling short, high suspicion, an open question today)? */
export function wifeNeeds(s: GameState, orders: readonly PlayerAction[] = []): string | undefined {
  const w = wifeHere(s);
  if (!w) return undefined;
  const p = nightsPlan(s, orders);
  if (p.need && p.home < p.need) return `Nights home this week: ${fmtN(p.home)}/${p.need}`;
  const W = wifeRecord(s);
  if (W && W.susp >= 50) return `${w.firstName} is ${suspWord(W.susp).toLowerCase()}`;
  if (dinnerAsk(s)) return `${w.firstName} asks if she should expect you for dinner`;
  return undefined;
}

/** Ready to advance: a lapse when he'd fall short of the nights, or stand her up. */
export function wifeLapses(s: GameState): { key: string; title: string; what: string }[] {
  const w = wifeHere(s);
  if (!w) return [];
  const p = nightsPlan(s);
  const out: { key: string; title: string; what: string }[] = [];
  if (p.need && p.home < p.need) out.push({ key: 'wife:nights', title: `Nights home this week: ${fmtN(p.home)}/${p.need}`, what: `${w.firstName} notices: her suspicion rises and she thinks less of you. Book an evening with her, or tell her you'll be home.` });
  if (p.stoodUp) out.push({ key: 'wife:stood', title: `You told ${w.firstName} you'd be home, and you're booked (${p.stoodUp} night${p.stoodUp > 1 ? 's' : ''})`, what: 'Standing her up costs more than an honest "not tonight".' });
  return out;
}

/** Days still to answer this week (for the compact weekly card). */
export function dinnerWeek(s: GameState): { day: number; name: string; ans?: Dinner; def: Dinner; row: NightRow; past: boolean }[] {
  const w = wifeHere(s);
  if (!w) return [];
  const p = nightsPlan(s);
  const now = daysOf(s).day;
  return p.rows.map((r) => ({ day: r.day, name: DAY_NAMES[r.day], ans: r.ans, def: r.kind === 'out' || r.kind === 'woman' || r.kind === 'trip' ? 'out' : 'home', row: r, past: r.day < now }));
}
