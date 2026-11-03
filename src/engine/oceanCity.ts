import type { ActionPreview } from './actions';
import { isInSeason } from './calendar';
import { owned, ownsKind, isOpen } from './business';
import { capos, isFree, makeCharacter, shortName } from './characters';
import { CAPO_CUT, skimRate } from './economy';
import { applyEffects, fmtMoney } from './effects';
import { heat, money, respect, type Ctx } from './ledger';
import { inflation } from './property';
import { chance, hashSeed, rand, randInt } from './rng';
import { addSecret, knownSecrets } from './secrets';
import { xfer } from './tribute';
import type { Business, BusinessKind, Character, Choice, Effect, EventInstance, GameState, RivalId } from './types';

/**
 * OCEAN CITY: THE DRY TOWN. Twenty minutes up the shore, a Methodist resort
 * where nobody may sell a drink, and the summer people are thirsty.
 *
 *  - THE RUN (a racket): cases from a Wildwood bar or distributor the family
 *    controls, over the causeway by truck or into the back bay by boat. The
 *    price is high in the Season and low in winter; the risk is the town's
 *    police and the Camp Meeting board's attention. A capo can run it and
 *    kick up like any racket (his contract's end, his skim); the boss can
 *    run it himself (his fingerprints).
 *  - THE SPEAKEASY (a business to build): behind a soda fountain, under a
 *    church-supply store, or in the back of a boardwalk fudge shop, with
 *    upgrades (the peephole and password, a lookout and buzzer, a back exit,
 *    a band, card tables). A raid comes as a decision with its odds shown: a
 *    paid cop's tip-off raises them, a dry crusade lowers them.
 *  - THE COMMISSIONER (fictional: Elwood Batten): publicly dry, privately
 *    priced. Buy him, squeeze him with a secret (the secrets system, or a
 *    photograph), or back a "wet" referendum: a loud public fight.
 *  - RIVALS: Atlantic City and Philadelphia want the thirsty market too: a
 *    decision when the run gets fat, the retaliation hook, and the pressure
 *    toward a campaign (army.ts campaignPressure).
 *
 * Optional state (`s.oc`), made by the first order. Its dice are its own.
 * The authored scenes (scenes/ocean_city.json) read the flags this sets
 * (oc_run, oc_run_causeway, oc_easy, oc_raided, oc_wet ...) and talk back
 * through flags the weekly update reads (oc_crusade, oc_board_down ...).
 */

export type OcRoute = 'causeway' | 'boat';
export type OcFront = 'fountain' | 'church' | 'fudge';
export type OcUp = 'door' | 'lookout' | 'exit' | 'band' | 'cards';
export type OcStance = 'dry' | 'bought' | 'hooked' | 'wet';
export type RaidHow = 'back' | 'pay' | 'ride';

export interface OcRun { route: OcRoute; supply: string; runner: string; since: number; earned: number; seized: number; last?: number }
export interface OcEasy { front: OcFront; name: string; ups: OcUp[]; since: number; closedUntil?: number; earned: number; raids: number }

export interface OcState {
  rng: number;
  run?: OcRun;
  easy?: OcEasy;
  /** Commissioner Batten's id (a fictional character made with the state). */
  batten?: string;
  stance: OcStance;
  /** A photograph of the commissioner with a drink in his hand (a scene). */
  photo?: boolean;
  /** Week he last said no to an envelope. */
  refused?: number;
  /** The wet referendum, while it runs: support 0-100. */
  vote?: { start: number; ends: number; support: number };
  /** The Camp Meeting board's attention, 0-100. */
  board: number;
  /** A dry crusade (a preacher on the boardwalk) runs to this week. */
  crusade?: number;
  /** A paid cop's tip-off holds to this week. */
  tip?: number;
  /** A rival family's interest in the market. */
  rival?: { who: RivalId; week: number; deal?: 'piece' | 'no' | 'philly' };
  log: [number, string][];
  stats: { cases: number; take: number; raids: number; seized: number };
}

export type OcAction =
  | { op: 'run'; route: OcRoute; supply: string; runner: string }
  | { op: 'stopRun' }
  | { op: 'build'; front: OcFront }
  | { op: 'upgrade'; up: OcUp }
  | { op: 'buy' }
  | { op: 'dig' }
  | { op: 'squeeze' }
  | { op: 'vote' };

/** Event answers (the raid, the rival families). */
export type OcOp =
  | { op: 'raid'; how: RaidHow; p: number }
  | { op: 'rival'; who: RivalId; how: 'piece' | 'no' | 'philly' }
  /** An order with odds came back no (the commissioner refused, went to the board, nothing turned up). */
  | { op: 'refused'; what: 'buy' | 'squeeze' | 'dig' };

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */

export const ROUTES: Record<OcRoute, { label: string; text: string; cost: number; risk: number; cap: number }> = {
  causeway: { label: 'Over the causeway by truck', text: 'A bakery truck with a false floor across the bridge from Somers Point. Cheap, and the town police watch the bridge.', cost: 800, risk: 0.09, cap: 1 },
  boat: { label: 'Into the back bay by boat', text: 'A clam boat to a dock behind the Gardens. Dearer, quieter, and the bay is no place in a winter blow.', cost: 1500, risk: 0.045, cap: 0.85 },
};

export const FRONTS: Record<OcFront, { label: string; name: string; text: string; cost: number; base: number; season: [number, number]; cover: number }> = {
  fountain: { label: 'Behind a soda fountain', name: 'The back room at the Asbury Avenue fountain', text: 'Malteds up front, a door marked "Storage" in back. Busy all year.', cost: 4000, base: 240, season: [2.0, 0.6], cover: 0 },
  church: { label: 'Under a church-supply store', name: 'The basement under Wesley Church Supply', text: 'Hymnals and candles upstairs. The last place the board would look, and the worst scandal if they did.', cost: 3000, base: 180, season: [1.8, 0.7], cover: 0.025 },
  fudge: { label: 'In the back of a boardwalk fudge shop', name: 'The back of Pelham\'s Fudge on the boardwalk', text: 'The summer crowd walks right past the door. Dead in the winter.', cost: 5000, base: 320, season: [2.4, 0.3], cover: -0.01 },
};

export const UPS: Record<OcUp, { label: string; text: string; cost: number; weekly: number; raid: number; escape: number; take: number }> = {
  door: { label: 'A peephole door and a password', text: 'Nobody in who does not know the word.', cost: 400, weekly: 0, raid: -0.02, escape: 5, take: 0 },
  lookout: { label: 'A lookout and a buzzer', text: 'A kid on the corner with a button wired to the bar.', cost: 700, weekly: 30, raid: -0.01, escape: 15, take: 0 },
  exit: { label: 'A back exit to the alley', text: 'When the buzzer goes, the customers go too.', cost: 900, weekly: 0, raid: 0, escape: 20, take: 0 },
  band: { label: 'A band', text: 'A trio on Saturday night. People come from Margate.', cost: 1200, weekly: 60, raid: 0.02, escape: 0, take: 0.35 },
  cards: { label: 'Card tables', text: 'Two tables in the back and a house cut.', cost: 800, weekly: 0, raid: 0.01, escape: 0, take: 0.25 },
};
export const UP_ORDER: OcUp[] = ['door', 'lookout', 'exit', 'band', 'cards'];

/** What can supply the run: a bar, a club, a restaurant, or the untaxed-liquor racket (a distributor). */
export const SUPPLY_KINDS: BusinessKind[] = ['bootleg', 'bar', 'club', 'supperclub', 'hoodclub', 'gentsclub', 'restaurant'];

/** The fictional commissioner and the board. */
export const BATTEN = { first: 'Elwood', last: 'Batten', office: 'Ocean City commissioner' };

const r100 = (n: number) => Math.round(n / 100) * 100;
const $ = (n: number) => fmtMoney(Math.round(n));
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const pct = (p: number) => `${Math.round(p * 100)}%`;

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

export function ensureOc(s: GameState): OcState {
  if (!s.oc) s.oc = { rng: hashSeed(`${s.seed}:oc`), stance: 'dry', board: 20, log: [], stats: { cases: 0, take: 0, raids: 0, seized: 0 } };
  const o = s.oc;
  o.stance ??= 'dry';
  o.board ??= 20;
  o.log ??= [];
  o.stats ??= { cases: 0, take: 0, raids: 0, seized: 0 };
  if (o.easy) o.easy.ups ??= [];
  return o;
}

/** The commissioner (made the first time he is needed). */
export function batten(s: GameState): Character {
  const o = ensureOc(s);
  const c = o.batten ? s.characters[o.batten] : undefined;
  if (c) return c;
  const b = makeCharacter(s, { firstName: BATTEN.first, lastName: BATTEN.last, ethnicity: 'Irish', age: 58, rank: 'civilian', faction: 'none', traits: ['Pious', 'Greedy'], nickname: false, wealth: 9000 });
  b.office = BATTEN.office;
  o.batten = b.id;
  return b;
}

function note(s: GameState, text: string): void {
  const o = ensureOc(s);
  o.log.push([s.week, text]);
  if (o.log.length > 30) o.log.splice(0, o.log.length - 30);
}

/** The flags the authored scenes read. */
export function syncOcFlags(s: GameState): void {
  const o = s.oc;
  const set = (k: string, on: boolean) => { if (on) s.flags[k] = 1; else delete s.flags[k]; };
  set('oc_run', !!o?.run);
  set('oc_run_causeway', o?.run?.route === 'causeway');
  set('oc_easy', !!o?.easy);
  set('oc_wet', o?.stance === 'wet');
  set('oc_bought', o?.stance === 'bought' || o?.stance === 'hooked');
}

/* ------------------------------------------------------------------ */
/* The run                                                             */
/* ------------------------------------------------------------------ */

/** The places that can supply the run, best first (the untaxed-liquor racket is a distributor). */
export function supplies(s: GameState): Business[] {
  return owned(s).filter((b) => SUPPLY_KINDS.includes(b.kind) && isOpen(s, b)).sort((a, b) => SUPPLY_KINDS.indexOf(a.kind) - SUPPLY_KINDS.indexOf(b.kind));
}

/** Who can run it: the boss himself, or a free capo. */
export function runners(s: GameState): Character[] {
  return [s.characters[s.playerId], ...capos(s).filter((k) => isFree(s, k))].filter((c): c is Character => !!c?.alive);
}

/** A case's margin this week (1960 dollars × inflation): the Season pays. */
export function caseMargin(s: GameState, supplyKind?: BusinessKind): number {
  const base = isInSeason(s.date) ? 12 : 5;
  const o = s.oc;
  const wet = o?.stance === 'wet' ? 0.45 : 1;
  return Math.round(base * (supplyKind === 'bootleg' ? 1.25 : 1) * wet * inflation(s) * 100) / 100;
}

/** Cases a week. */
export function caseCount(s: GameState, route: OcRoute): number {
  const base = isInSeason(s.date) ? 34 : 9;
  const easy = s.oc?.easy ? 6 : 0;
  return Math.round((base + easy) * ROUTES[route].cap);
}

export interface OddsView { p: number; reasons: { label: string; value: number }[] }

/** The weekly odds the load is seized, with every reason (percent points). */
export function seizeOdds(s: GameState, route: OcRoute): OddsView {
  const o = s.oc;
  if (o?.stance === 'wet') return { p: 0, reasons: [{ label: 'The town voted wet: it is legal now', value: 0 }] };
  const r: { label: string; value: number }[] = [{ label: ROUTES[route].label, value: Math.round(ROUTES[route].risk * 100) }];
  const board = o?.board ?? 20;
  if (board >= 10) r.push({ label: `The Camp Meeting board's attention (${Math.round(board)})`, value: Math.round(board / 8) });
  if (o?.crusade && o.crusade > s.week) r.push({ label: 'A dry crusade on the boardwalk', value: 4 });
  if (o?.stance === 'bought' || o?.stance === 'hooked') r.push({ label: o.stance === 'bought' ? 'The commissioner is on the envelope' : 'The commissioner is on the hook', value: -4 });
  if (ownsKind(s, 'payoff')) r.push({ label: 'The pad', value: -2 });
  if (o?.tip && o.tip > s.week) r.push({ label: 'A paid cop\'s tip-off', value: -3 });
  if (route === 'boat' && !isInSeason(s.date)) r.push({ label: 'Winter on the bay', value: 3 });
  const p = clamp(r.reduce((a, x) => a + x.value, 0) / 100, 0.01, 0.5);
  return { p, reasons: r };
}

/** What the run would make this week, before a seizure (the runner's end included). */
export function runWeekly(s: GameState, route: OcRoute, supplyId?: string): number {
  const sup = supplyId ? s.businesses.find((b) => b.id === supplyId) : supplies(s)[0];
  return Math.round(caseCount(s, route) * caseMargin(s, sup?.kind));
}

/* ------------------------------------------------------------------ */
/* The speakeasy                                                       */
/* ------------------------------------------------------------------ */

export function easyWeekly(s: GameState, e: OcEasy | undefined = s.oc?.easy, front: OcFront = e?.front ?? 'fountain'): number {
  const f = FRONTS[front];
  const ups = e?.ups ?? [];
  const mult = 1 + ups.reduce((a, u) => a + UPS[u].take, 0);
  const supplied = s.oc?.run ? 1 : 0.6;
  const wet = s.oc?.stance === 'wet' ? 0.75 : 1;
  return Math.round(f.base * (isInSeason(s.date) ? f.season[0] : f.season[1]) * mult * supplied * wet * inflation(s));
}

/** The weekly odds of a raid, with every reason. */
export function raidOdds(s: GameState, e: OcEasy | undefined = s.oc?.easy): OddsView {
  const o = s.oc;
  if (o?.stance === 'wet') return { p: 0, reasons: [{ label: 'Licensed now: the town voted wet', value: 0 }] };
  const r: { label: string; value: number }[] = [{ label: 'A speakeasy in a dry town', value: 5 }];
  const board = o?.board ?? 20;
  if (board >= 10) r.push({ label: `The Camp Meeting board's attention (${Math.round(board)})`, value: Math.round(board / 6) });
  if (o?.crusade && o.crusade > s.week) r.push({ label: 'A dry crusade on the boardwalk', value: 5 });
  if (e) {
    const cover = FRONTS[e.front].cover;
    if (cover) r.push({ label: FRONTS[e.front].label, value: -Math.round(cover * 100) });
    for (const u of e.ups) if (UPS[u].raid) r.push({ label: UPS[u].label, value: Math.round(UPS[u].raid * 100) });
  }
  if (o?.stance === 'bought' || o?.stance === 'hooked') r.push({ label: 'The commissioner looks the other way', value: -4 });
  if (o?.tip && o.tip > s.week) r.push({ label: 'A paid cop\'s tip-off', value: -2 });
  const p = clamp(r.reduce((a, x) => a + x.value, 0) / 100, 0.01, 0.4);
  return { p, reasons: r };
}

/** The odds a way of meeting the raid works (percent points, with reasons). */
export function raidEscape(s: GameState, how: RaidHow): OddsView {
  const o = s.oc;
  const e = o?.easy;
  const r: { label: string; value: number }[] = [];
  const has = (u: OcUp) => !!e?.ups.includes(u);
  if (how === 'back') {
    r.push({ label: 'Clear the room', value: 40 });
    if (has('exit')) r.push({ label: UPS.exit.label, value: UPS.exit.escape });
    if (has('lookout')) r.push({ label: UPS.lookout.label, value: UPS.lookout.escape });
    if (has('door')) r.push({ label: UPS.door.label, value: UPS.door.escape });
  } else if (how === 'pay') {
    r.push({ label: 'An envelope for the sergeant', value: 45 });
    if (o?.stance === 'bought' || o?.stance === 'hooked') r.push({ label: 'The commissioner\'s friend', value: 20 });
    if (ownsKind(s, 'payoff')) r.push({ label: 'The pad', value: 10 });
    r.push({ label: `The board is watching (${Math.round(o?.board ?? 20)})`, value: -Math.round((o?.board ?? 20) / 4) });
  } else return { p: 1, reasons: [{ label: 'Certain: the lawyer and the fine', value: 100 }] };
  if (o?.tip && o.tip > s.week) r.push({ label: 'A paid cop called ahead', value: 15 });
  if (o?.crusade && o.crusade > s.week) r.push({ label: 'The dry crusaders are outside with cameras', value: -12 });
  const p = clamp(r.reduce((a, x) => a + x.value, 0) / 100, 0.05, 0.95);
  return { p, reasons: r };
}

/* ------------------------------------------------------------------ */
/* The commissioner                                                    */
/* ------------------------------------------------------------------ */

export function envelope(s: GameState): number {
  return r100(250 * inflation(s));
}

export function buyOdds(s: GameState): OddsView {
  const o = s.oc;
  const r: { label: string; value: number }[] = [{ label: 'He has a price', value: 40 }];
  r.push({ label: `Your respect (${Math.round(s.respect)})`, value: Math.round((s.respect - 40) / 4) });
  if ((o?.board ?? 20) >= 40) r.push({ label: 'The board is watching him', value: -15 });
  if (o?.vote) r.push({ label: 'The referendum: he cannot be seen with you', value: -30 });
  if (o?.refused !== undefined && s.week - o.refused < 8) r.push({ label: 'He said no a few weeks ago', value: -10 });
  if (s.flags.oc_case_party) r.push({ label: 'You sent cases to his party', value: 15 });
  const p = clamp(r.reduce((a, x) => a + x.value, 0) / 100, 0.05, 0.9);
  return { p, reasons: r };
}

/** What the boss holds on him: a known secret (the secrets system) or the photograph. */
export function leverOn(s: GameState): string | undefined {
  const b = s.oc?.batten;
  const sec = b ? knownSecrets(s, b)[0] : undefined;
  if (sec) return sec.text;
  return s.oc?.photo ? 'A photograph of the commissioner with a highball at his own party' : undefined;
}

export function voteCost(s: GameState): number {
  return r100(3000 * inflation(s));
}

/** The referendum's support to start with. */
export function voteStart(s: GameState): number {
  return clamp(30 + Math.round((s.respect - 40) / 5) + (s.oc?.stance === 'bought' || s.oc?.stance === 'hooked' ? 8 : 0) - Math.round((s.oc?.board ?? 20) / 10), 15, 55);
}

/* ------------------------------------------------------------------ */
/* Orders                                                              */
/* ------------------------------------------------------------------ */

const ACTION_TITLE: Record<OcAction['op'], string> = {
  run: 'Run liquor into Ocean City', stopRun: 'Shut down the Ocean City run', build: 'Open a speakeasy in Ocean City', upgrade: 'Fix up the speakeasy',
  buy: 'Put Commissioner Batten on an envelope', dig: 'Find out what Commissioner Batten hides', squeeze: 'Squeeze Commissioner Batten', vote: 'Back a "wet" referendum in Ocean City',
};

export function previewOc(s: GameState, a: OcAction): ActionPreview {
  const o = s.oc;
  const title = ACTION_TITLE[a.op];
  const base = { title, effects: [] as Effect[], cost: 0, because: title.charAt(0).toLowerCase() + title.slice(1), category: 'event' as const };
  const need = (cost: number) => (s.money < cost ? `Needs ${$(cost)} of Family money` : undefined);
  switch (a.op) {
    case 'run': {
      const R = ROUTES[a.route];
      const cost = r100(R.cost * inflation(s));
      const sup = s.businesses.find((b) => b.id === a.supply && b.owner === 'player');
      const k = s.characters[a.runner];
      const same = o?.run && o.run.route === a.route && o.run.runner === a.runner && o.run.supply === a.supply;
      const why = !sup || !SUPPLY_KINDS.includes(sup.kind) ? 'Needs a bar, a club or the untaxed-liquor racket to supply it' : !k?.alive || (k.id !== s.playerId && (k.rank !== 'capo' || !isFree(s, k))) ? 'Needs a free capo, or you' : same ? 'Already running that way' : need(o?.run ? 0 : cost);
      const weekly = runWeekly(s, a.route, a.supply);
      const odds = seizeOdds(s, a.route);
      const boss = a.runner === s.playerId;
      const keep = boss ? 0 : k?.keep ?? CAPO_CUT;
      return {
        ...base, title: `${o?.run ? 'Change the Ocean City run' : title}: ${R.label.toLowerCase()}`, cost: o?.run ? 0 : cost, disabledReason: why,
        detail: `${R.text} About ${caseCount(s, a.route)} cases a week at ${$(caseMargin(s, sup?.kind))} a case: ~${$(weekly)} a week${keep ? `, ${k!.firstName} keeps ${Math.round(keep * 100)}% and kicks up the rest` : ' (you run it: your fingerprints on it)'}. A load is seized ${pct(odds.p)} of weeks.${sup ? ` Supplied by ${sup.name}.` : ''}`,
        effects: o?.run ? [] : [{ type: 'money', amount: -cost, label: `${title}: ${a.route === 'boat' ? 'a boat and a dock' : 'a truck with a false floor'}` }, { type: 'heat', bar: 'local', amount: 1, label: title }],
        because: `started running liquor into Ocean City ${a.route === 'boat' ? 'by boat' : 'over the causeway'}${boss ? '' : ` (${k?.firstName ?? 'a capo'} runs it)`}`,
        verb: o?.run ? 'Change the run' : `Start the run — ${$(cost)}`,
      };
    }
    case 'stopRun':
      return { ...base, disabledReason: o?.run ? undefined : 'There is no run', detail: 'The truck goes back to the bakery; the boat goes back to clamming.', verb: 'Shut it down' };
    case 'build': {
      const f = FRONTS[a.front];
      const cost = r100(f.cost * inflation(s));
      return {
        ...base, title: `${title}: ${f.label.toLowerCase()}`, cost, disabledReason: o?.easy ? 'You already have one' : o?.stance === 'wet' ? 'The town is wet now: open a bar' : need(cost),
        detail: `${f.text} ~${$(easyWeekly(s, undefined, a.front))} a week now (more in the Season, less without your own liquor run). Raids: ${pct(raidOdds(s, { front: a.front, name: f.name, ups: [], since: 0, earned: 0, raids: 0 }).p)} of weeks.`,
        effects: [{ type: 'money', amount: -cost, label: `${title}: ${f.name}` }],
        because: `opened a speakeasy in Ocean City (${f.label.toLowerCase()})`, verb: `Open it — ${$(cost)}`,
      };
    }
    case 'upgrade': {
      const u = UPS[a.up];
      const cost = r100(u.cost * inflation(s));
      return {
        ...base, title: `Speakeasy: ${u.label.toLowerCase()}`, cost, disabledReason: !o?.easy ? 'There is no speakeasy' : o.easy.ups.includes(a.up) ? 'Already done' : need(cost),
        detail: `${u.text}${u.weekly ? ` ${$(u.weekly * inflation(s))} a week.` : ''}${u.raid ? ` Raids ${u.raid > 0 ? '+' : ''}${Math.round(u.raid * 100)} points.` : ''}${u.escape ? ` Getting out of a raid +${u.escape} points.` : ''}${u.take ? ` Take +${Math.round(u.take * 100)}%.` : ''}`,
        effects: [{ type: 'money', amount: -cost, label: `Speakeasy: ${u.label.toLowerCase()}` }],
        because: `put ${u.label.toLowerCase()} into the Ocean City speakeasy`, verb: `Do it — ${$(cost)}`,
      };
    }
    case 'buy': {
      const odds = buyOdds(s);
      const up = r100(1000 * inflation(s));
      return {
        ...base, cost: up,
        disabledReason: o?.stance === 'bought' || o?.stance === 'hooked' ? 'He is already yours' : o?.stance === 'wet' ? 'The town is wet: nothing left to buy' : need(up + envelope(s)),
        detail: `${$(up)} up front and ${$(envelope(s))} a week. On the envelope: fewer raids, fewer seized loads. If he says no he keeps the money and the board hears your name.`,
        effects: [{ type: 'money', amount: -up, label: `${title}: the first envelope` }],
        refuseEffects: [{ type: 'money', amount: -up, label: `${title}: he kept the envelope and said no` }, { type: 'heat', bar: 'local', amount: 2, label: title }, { type: 'oc', op: { op: 'refused', what: 'buy' }, label: title }],
        acceptance: { chance: odds.p, reasons: odds.reasons }, oddsKnown: true, oddsLabel: 'He takes it',
        because: 'put Commissioner Batten on an envelope', verb: `Make the offer — ${$(up)}`,
      };
    }
    case 'dig': {
      const cost = r100(500 * inflation(s));
      const known = leverOn(s);
      return {
        ...base, cost, disabledReason: known ? 'You already have something on him' : o?.stance === 'wet' ? 'Nothing to gain now' : need(cost),
        detail: 'A man follows him for two weeks: his bank, his evenings, the apartment over the jeweler\'s. Whatever turns up goes in your file on him.',
        effects: [{ type: 'money', amount: -cost, label: `${title}: the man who follows him` }],
        refuseEffects: [{ type: 'money', amount: -cost, label: `${title}: nothing turned up` }, { type: 'oc', op: { op: 'refused', what: 'dig' }, label: title }],
        acceptance: { chance: 0.55, reasons: [{ label: 'Every man hides something', value: 55 }] }, oddsKnown: true, oddsLabel: 'Something turns up',
        because: 'had Commissioner Batten followed', verb: `Have him followed — ${$(cost)}`,
      };
    }
    case 'squeeze': {
      const lever = leverOn(s);
      const p = clamp(0.7 + (s.respect - 50) / 200 - (o?.board ?? 20) / 400, 0.3, 0.9);
      return {
        ...base, disabledReason: !lever ? 'You have nothing on him yet (find something first)' : o?.stance === 'hooked' ? 'He is already on the hook' : o?.stance === 'wet' ? 'Nothing to gain now' : undefined,
        detail: `${lever ?? 'Nothing yet'}. No envelope: he does what he is told. If he does not scare, he goes to the board himself and the town comes after you.`,
        effects: [],
        refuseEffects: [{ type: 'heat', bar: 'local', amount: 5, label: `${title}: he went to the board` }, { type: 'oc', op: { op: 'refused', what: 'squeeze' }, label: title }],
        acceptance: { chance: p, reasons: [{ label: 'What you have on him', value: 70 }, { label: 'Your name', value: Math.round((s.respect - 50) / 2) }, { label: 'The board behind him', value: -Math.round((o?.board ?? 20) / 4) }] }, oddsKnown: true, oddsLabel: 'He folds',
        because: 'squeezed Commissioner Batten', verb: 'Show him what you have',
      };
    }
    case 'vote': {
      const cost = voteCost(s);
      return {
        ...base, cost, disabledReason: o?.vote ? 'The referendum is already running' : o?.stance === 'wet' ? 'The town is already wet' : need(cost),
        detail: `Petitions, a lawyer, ads in the Sentinel, and the summer people's votes: six weeks of noise. Support starts near ${voteStart(s)}% and the money and your name move it. The board will fight, a preacher will come, and everybody will know who paid. If it wins, liquor is legal: the run and the speakeasy earn less and fear nothing.`,
        effects: [{ type: 'money', amount: -cost, label: `${title}: petitions, ads and a lawyer` }, { type: 'heat', bar: 'local', amount: 3, label: title }],
        because: 'backed a "wet" referendum in Ocean City', verb: `Back it — ${$(cost)}`,
      };
    }
  }
}

export function commitOc(ctx: Ctx, a: OcAction): void {
  const s = ctx.s;
  const o = ensureOc(s);
  switch (a.op) {
    case 'run': {
      const was = o.run;
      o.run = { route: a.route, supply: a.supply, runner: a.runner, since: was?.since ?? s.week, earned: was?.earned ?? 0, seized: was?.seized ?? 0 };
      const k = s.characters[a.runner];
      const text = `The Ocean City run: ${ROUTES[a.route].label.toLowerCase()}, ${a.runner === s.playerId ? 'you run it yourself' : `${k?.firstName ?? 'a capo'} runs it`}.`;
      note(s, text);
      ctx.log.push(`Done: ${text}`);
      break;
    }
    case 'stopRun':
      delete o.run;
      note(s, 'The Ocean City run shut down.');
      ctx.log.push('Done: the Ocean City run is shut down.');
      break;
    case 'build': {
      const f = FRONTS[a.front];
      o.easy = { front: a.front, name: f.name, ups: [], since: s.week, earned: 0, raids: 0 };
      note(s, `Opened a speakeasy: ${f.name}.`);
      ctx.log.push(`Done: the speakeasy opens — ${f.name}.`);
      break;
    }
    case 'upgrade':
      if (o.easy && !o.easy.ups.includes(a.up)) o.easy.ups.push(a.up);
      note(s, `The speakeasy: ${UPS[a.up].label.toLowerCase()}.`);
      ctx.log.push(`Done: ${UPS[a.up].label.toLowerCase()} at the speakeasy.`);
      break;
    case 'buy':
      batten(s);
      o.stance = 'bought';
      note(s, 'Commissioner Batten took the envelope.');
      ctx.log.push('Done: Commissioner Batten is on the envelope. Publicly he is as dry as ever.');
      break;
    case 'dig': {
      const b = batten(s);
      const sec = addSecret(s, b, chance(o, 0.5) ? 'affair' : 'debt', ['player']);
      if (!sec.knownBy.includes('player')) sec.knownBy.push('player');
      note(s, `On the commissioner: ${sec.text}.`);
      ctx.log.push(`Done: your man found it — ${sec.text}.`);
      break;
    }
    case 'squeeze': {
      const b = batten(s);
      o.stance = 'hooked';
      applyEffects(ctx, [{ type: 'hook', targetId: b.id, strong: true, reason: 'What you have on him' }, { type: 'opinion', from: b.id, to: s.playerId, amount: -25, reason: 'Squeezed me', decay: 0 }], { label: 'Squeeze Commissioner Batten', because: 'squeezed the commissioner', category: 'event' });
      note(s, 'Commissioner Batten is on the hook.');
      ctx.log.push('Done: the commissioner folded. No envelope; he does what he is told.');
      break;
    }
    case 'vote':
      o.vote = { start: s.week, ends: s.week + 6, support: voteStart(s) };
      o.crusade = Math.max(o.crusade ?? 0, s.week + 8);
      o.board = clamp(o.board + 15, 0, 100);
      s.news.push({ week: s.week, date: { ...s.date }, paper: 'Ocean City Sentinel', headline: 'PETITION FORCES VOTE ON LIQUOR; CAMP MEETING BOARD VOWS FIGHT', body: 'Out-of-town money is said to be behind the drive. A revival tent goes up on the boardwalk Sunday.', kind: 'oc' });
      note(s, `The wet referendum: six weeks, support at ${o.vote.support}%.`);
      ctx.log.push(`Done: the wet referendum is on. Support starts at ${o.vote.support}%.`);
      break;
  }
  syncOcFlags(s);
}

/** The rejected side of an order with odds (the commissioner said no, or he went to the board). */
export function ocRefused(s: GameState, a: { op: OcAction['op'] }): void {
  const o = ensureOc(s);
  if (a.op === 'buy') { o.refused = s.week; o.board = clamp(o.board + 10, 0, 100); note(s, 'Commissioner Batten turned the envelope down (and kept it).'); }
  if (a.op === 'squeeze') { o.board = clamp(o.board + 25, 0, 100); o.crusade = Math.max(o.crusade ?? 0, s.week + 8); note(s, 'Commissioner Batten went to the board. A crusade is coming.'); }
  if (a.op === 'dig') note(s, 'Two weeks of following the commissioner turned up nothing.');
}

/* ------------------------------------------------------------------ */
/* The week                                                            */
/* ------------------------------------------------------------------ */

/** The flags the scenes set, read once. */
function readSceneFlags(s: GameState): void {
  const o = ensureOc(s);
  const take = (k: string) => { const v = !!s.flags[k]; delete s.flags[k]; return v; };
  if (take('oc_crusade')) { o.crusade = Math.max(o.crusade ?? 0, s.week + 8); o.board = clamp(o.board + 10, 0, 100); note(s, 'A dry crusade came to the boardwalk.'); }
  if (take('oc_board_down')) o.board = clamp(o.board - 15, 0, 100);
  if (take('oc_board_up')) o.board = clamp(o.board + 15, 0, 100);
  if (take('oc_raid_tip')) o.tip = s.week + 8;
  if (take('oc_batten_photo')) { o.photo = true; batten(s); note(s, 'You have a photograph of the commissioner with a drink in his hand.'); }
}

/** The run's week: cases over the bridge, the runner's end, a seizure. */
function runWeek(ctx: Ctx, o: OcState): void {
  const s = ctx.s;
  const run = o.run!;
  const sup = s.businesses.find((b) => b.id === run.supply && b.owner === 'player');
  const k = s.characters[run.runner];
  if (!sup || !isOpen(s, sup)) {
    const alt = supplies(s)[0];
    if (alt) run.supply = alt.id;
    else { ctx.log.push('The Ocean City run sat idle: no bar or distributor of yours to supply it.'); return; }
  }
  if (!k?.alive || (k.id !== s.playerId && !isFree(s, k))) {
    ctx.log.push(`The Ocean City run sat idle: ${k ? `${k.firstName} is not free` : 'nobody runs it'}. Give it to someone else.`);
    return;
  }
  const odds = seizeOdds(s, run.route);
  const cases = caseCount(s, run.route);
  const label = `Ocean City run (${run.route === 'boat' ? 'the back bay' : 'the causeway'})`;
  if (rand(o) < odds.p) {
    const lost = Math.round(cases * 4 * inflation(s));
    money(ctx, -lost, `${label}: the load was seized`, 'street');
    heat(ctx, 'local', 3, `${label}: a seized load`, 'heat');
    o.board = clamp(o.board + 5, 0, 100);
    run.seized++;
    o.stats.seized++;
    if (k.id === s.playerId) applyEffects(ctx, [{ type: 'evidence', charId: k.id, amount: 3 }], { label, because: 'ran liquor into Ocean City', category: 'street' });
    else if (rand(o) < 0.25) {
      const men = Object.values(s.characters).filter((c) => c.alive && c.faction === 'player' && c.capoId === k.id && isFree(s, c) && c.rank !== 'capo');
      const m = men.length ? men[randInt(o, 0, men.length - 1)] : undefined;
      if (m) applyEffects(ctx, [{ type: 'imprison', charId: m.id, weeks: randInt(o, 3, 8) }], { label: `${label}: ${m.firstName} was picked up with the load`, because: 'ran liquor into Ocean City', category: 'street' });
    }
    note(s, `A load was seized ${run.route === 'boat' ? 'at the dock' : 'on the causeway'} (${$(lost)} of goods).`);
    ctx.log.push(`${label}: the load was seized (${pct(odds.p)} odds this week).`);
    return;
  }
  const gross = Math.round(cases * caseMargin(s, s.businesses.find((b) => b.id === run.supply)?.kind));
  if (gross <= 0) return;
  money(ctx, gross, label, 'street');
  applyEffects(ctx, [{ type: 'unwashed', amount: gross }], { label, because: 'ran liquor into Ocean City', category: 'street' });
  if (k.id !== s.playerId) {
    // The capo keeps his end, skims what he skims, and kicks up the rest (like any racket).
    const end = Math.round(gross * (k.keep ?? CAPO_CUT));
    const skim = Math.round((gross - end) * skimRate(s, k));
    xfer(ctx, 'treasury', `wealth:${k.id}`, end, 'capo_distribution', `w${s.week}:oc:end:${k.id}`, { note: `${k.firstName}'s end of the Ocean City run`, category: 'street' });
    if (skim > 0) {
      xfer(ctx, 'treasury', `wealth:${k.id}`, skim, 'capo_distribution', `w${s.week}:oc:skim:${k.id}`, { note: 'off the top', hidden: true, category: 'street' });
      k.skimmed = (k.skimmed ?? 0) + skim;
    }
  }
  run.earned += gross;
  run.last = gross;
  o.stats.cases += cases;
  o.stats.take += gross;
}

function easyWeek(ctx: Ctx, o: OcState): void {
  const s = ctx.s;
  const e = o.easy!;
  if (e.closedUntil && e.closedUntil > s.week) return;
  const take = easyWeekly(s, e);
  const upkeep = Math.round(e.ups.reduce((a, u) => a + UPS[u].weekly, 0) * inflation(s));
  money(ctx, take, `Speakeasy: ${e.name}`, 'business');
  if (upkeep) money(ctx, -upkeep, `Speakeasy: ${e.name} (the lookout, the band)`, 'business');
  if (o.stance !== 'wet') applyEffects(ctx, [{ type: 'unwashed', amount: Math.max(0, take - upkeep) }], { label: 'Speakeasy', because: 'ran a speakeasy in Ocean City', category: 'business' });
  if (e.ups.includes('band')) o.board = clamp(o.board + 1, 0, 100);
  e.earned += take - upkeep;
  o.stats.take += take - upkeep;
  // A raid comes as a decision (odds on it).
  const odds = raidOdds(s, e);
  if (rand(o) < odds.p && !s.eventQueue.some((x) => x.defId === 'oc_raid')) s.eventQueue.push(buildRaidEvent(s));
}

function voteWeek(ctx: Ctx, o: OcState): void {
  const s = ctx.s;
  const v = o.vote!;
  // Noise: the board, the preacher, the papers.
  heat(ctx, 'local', 1, 'The wet referendum: the whole shore is talking', 'heat');
  o.board = clamp(o.board + 3, 0, 100);
  v.support = clamp(v.support + randInt(o, -3, 4) + (s.respect >= 60 ? 1 : 0) - (o.crusade && o.crusade > s.week ? 1 : 0), 5, 95);
  if (s.week < v.ends) return;
  const won = rand(o) * 100 < v.support;
  delete o.vote;
  if (won) {
    o.stance = 'wet';
    o.board = 10;
    delete o.crusade;
    respect(ctx, 5, 'Ocean City voted wet', 'event');
    s.news.push({ week: s.week, date: { ...s.date }, paper: 'Ocean City Sentinel', headline: 'OCEAN CITY VOTES WET', body: 'The first legal drink in the town\'s history is poured at a hotel bar on the boardwalk. The Camp Meeting board calls it a dark day.', kind: 'oc' });
    note(s, 'The referendum won: Ocean City is wet. The run is a legal distributorship now, the speakeasy a licensed bar.');
    ctx.log.push('The Ocean City referendum won. The town is wet.');
  } else {
    o.board = clamp(o.board + 30, 0, 100);
    o.crusade = Math.max(o.crusade ?? 0, s.week + 12);
    respect(ctx, -2, 'The Ocean City referendum lost', 'event');
    s.news.push({ week: s.week, date: { ...s.date }, paper: 'Ocean City Sentinel', headline: 'DRYS HOLD THE LINE', body: 'Voters reject the liquor petition. The board promises a closer watch on "certain out-of-town interests."', kind: 'oc' });
    note(s, 'The referendum lost. The board is out for blood.');
    ctx.log.push('The Ocean City referendum lost. The board is watching harder than ever.');
  }
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: won ? 'Ocean City voted wet. Everybody knows who paid for it.' : 'The wet referendum in Ocean City lost.', kind: 'misc' });
}

/** Weekly: the run, the speakeasy, the commissioner's envelope, the referendum, the rivals, the board. */
export function ocWeek(ctx: Ctx): void {
  const s = ctx.s;
  if (!s.oc || s.gameOver) return;
  const o = ensureOc(s);
  readSceneFlags(s);
  if (o.run) runWeek(ctx, o);
  if (o.easy) easyWeek(ctx, o);
  if (o.stance === 'bought') {
    const env = envelope(s);
    if (s.money >= env) money(ctx, -env, 'Commissioner Batten\'s envelope', 'event');
    else { o.stance = 'dry'; note(s, 'The commissioner\'s envelope was missed. He is dry again.'); ctx.log.push('Commissioner Batten\'s envelope was missed: he is dry again.'); }
  }
  if (o.vote) voteWeek(ctx, o);
  rivalWeek(s, o);
  // The rivals' piece of the run.
  if (o.rival?.deal === 'piece' && o.run?.last) {
    const cut = Math.round(o.run.last * 0.2);
    const r = s.rivals.find((x) => x.id === o.rival!.who);
    if (r && cut > 0) { money(ctx, -cut, `Ocean City: ${r.shortName ?? r.name}'s piece of the run`, 'street'); r.money += cut; }
  }
  if (o.run) o.run.last = undefined;
  // The board's attention fades when nothing happens.
  o.board = clamp(o.board - (o.crusade && o.crusade > s.week ? 0 : 1.5), 0, 100);
  syncOcFlags(s);
}

/* ------------------------------------------------------------------ */
/* Events: the raid, the rival families                                */
/* ------------------------------------------------------------------ */

export function buildRaidEvent(s: GameState): EventInstance {
  const o = ensureOc(s);
  const e = o.easy!;
  const fine = r100(1000 * inflation(s));
  const env = r100(600 * inflation(s));
  const back = raidEscape(s, 'back');
  const pay = raidEscape(s, 'pay');
  const why = (v: OddsView) => v.reasons.map((r) => `${r.label} ${r.value >= 0 ? '+' : ''}${r.value}`).join(', ');
  const ch = (id: RaidHow, label: string, detail: string, p: number, extra: Effect[] = []): Choice => ({
    id, label, detail, because: `met the Ocean City raid: ${label.toLowerCase().replace(/ \(.*\)$/, '')}`,
    effects: [...extra, { type: 'oc', op: { op: 'raid', how: id, p }, label: `The raid: ${label}` }],
  });
  return {
    iid: `ev${s.nextId++}`, defId: 'oc_raid', title: 'Raid in Ocean City', week: s.week, mandatory: true, priority: 40, meta: { oc: 'raid' },
    text: `The buzzer at ${e.name}. Four Ocean City patrolmen and a man from the Camp Meeting board are on the stairs, and the room is full. You have about a minute.`,
    defaultChoiceId: 'ride',
    choices: [
      ch('back', `Clear the room out the back (${pct(back.p)})`, `If it works the place is closed a week and nobody is named. If not: closed six weeks, a ${$(fine * 1.5)} fine, and a man held. ${why(back)}.`, back.p),
      ch('pay', `Pay the sergeant at the door (${$(env)}, ${pct(pay.p)})`, `If he takes it, nothing happened tonight. If he does not, the envelope is evidence. ${why(pay)}.`, pay.p, [{ type: 'money', amount: -env, label: 'The raid: the sergeant\'s envelope' }]),
      ch('ride', 'Let them take it; the lawyer handles it', `Certain: closed four weeks, a ${$(fine)} fine, and the board makes a speech.`, 1),
    ],
  };
}

function rivalWeek(s: GameState, o: OcState): void {
  if (o.rival || !o.run || o.stance === 'wet') return;
  if (o.run.earned < 4000 * inflation(s) || s.week - o.run.since < 6) return;
  if (s.eventQueue.some((x) => x.defId === 'oc_rival')) return;
  if (rand(o) > 0.25) return;
  const who: RivalId = s.rivals.some((r) => r.id === 'manno') && rand(o) < 0.65 ? 'manno' : 'philly';
  if (!s.rivals.some((r) => r.id === who)) return;
  o.rival = { who, week: s.week };
  s.eventQueue.push(buildRivalEvent(s, who));
}

export function buildRivalEvent(s: GameState, who: RivalId): EventInstance {
  const r = s.rivals.find((x) => x.id === who);
  const name = r?.shortName ?? r?.name ?? who;
  const L = r ? s.characters[r.leaderId] : undefined;
  const ac = who === 'manno';
  const pay = r100(2000 * inflation(s));
  const choices: Choice[] = [
    {
      id: 'piece', label: `Give ${name} a piece (a fifth of the run)`, detail: 'Peace on the bay, and a fifth of every load\'s money goes north.', because: `gave ${name} a piece of the Ocean City run`,
      effects: [{ type: 'rivalOpinion', rival: who, amount: 10, reason: 'Shared the dry town' }, { type: 'oc', op: { op: 'rival', who, how: 'piece' } }],
    },
    {
      id: 'no', label: 'Tell them the bay is ours', detail: `${name} will not forget it, and may come for it.`, because: `told ${name} the Ocean City market was ours`,
      effects: [
        { type: 'rivalOpinion', rival: who, amount: -15, reason: 'Kept the dry town from us' }, { type: 'respect', amount: 2 },
        { type: 'schedule', key: 'retaliation', minWeeks: 2, maxWeeks: 6, chance: 0.5, hint: `${name} may hit your trucks`, params: { rival: who } },
        { type: 'oc', op: { op: 'rival', who, how: 'no' } },
      ],
    },
  ];
  if (ac && s.rivals.some((x) => x.id === 'philly')) choices.push({
    id: 'philly', label: `Ask Philadelphia to tell them no (${$(pay)})`, detail: 'An envelope for the old man, and Atlantic City hears it from him.', because: 'paid Philadelphia to keep Atlantic City out of Ocean City',
    effects: [{ type: 'money', amount: -pay, label: 'Ocean City: an envelope for Philadelphia' }, { type: 'rivalOpinion', rival: 'philly', amount: 5, reason: 'Came to us first' }, { type: 'rivalOpinion', rival: who, amount: -6, reason: 'Went over our heads' }, { type: 'oc', op: { op: 'rival', who, how: 'philly' } }],
    disabledReason: s.money < pay ? `Needs ${$(pay)}` : undefined,
  });
  return {
    iid: `ev${s.nextId++}`, defId: 'oc_rival', title: ac ? 'Atlantic City wants Ocean City' : 'Philadelphia wants its taste', week: s.week, mandatory: false, priority: 36, actors: L ? [L.id] : [], meta: { rival: who },
    text: ac
      ? `${L ? shortName(L) : 'A man from Atlantic City'} sends word from Somers Point: Ocean City is next door to them, not to you. They want a piece of what goes over the bridge, or they will run their own trucks.`
      : `Philadelphia has heard about the dry town. ${L ? shortName(L) : 'The old man'} would like his taste of every case, the way he gets a taste of everything in South Jersey.`,
    choices, defaultChoiceId: 'piece',
  };
}

/** How much the Ocean City business pushes a rival toward a campaign on you (army.ts). */
export function ocPressure(s: GameState, rival: RivalId): number {
  const r = s.oc?.rival;
  if (!r || r.who !== rival || r.deal !== 'no') return 0;
  return s.week - r.week < 26 ? 10 : 4;
}

export function describeOcOp(_s: GameState, o: OcOp): string | undefined {
  if (o.op === 'refused') return o.what === 'squeeze' ? 'He goes to the board: a crusade' : o.what === 'buy' ? 'The board hears your name' : undefined;
  if (o.op === 'raid') return o.p >= 1 ? 'Closed four weeks, a fine' : `${pct(o.p)}: it works`;
  return o.how === 'piece' ? 'A fifth of the run goes to them' : o.how === 'no' ? 'The run stays yours' : 'Philadelphia tells them no';
}

export function applyOcOp(ctx: Ctx, op: OcOp): void {
  const s = ctx.s;
  const o = ensureOc(s);
  if (op.op === 'refused') { ocRefused(s, { op: op.what }); syncOcFlags(s); return; }
  if (op.op === 'rival') {
    o.rival = { who: op.who, week: o.rival?.week ?? s.week, deal: op.how };
    note(s, op.how === 'piece' ? 'A fifth of the run goes to the rivals now.' : op.how === 'no' ? 'You kept the dry town for yourself.' : 'Philadelphia told Atlantic City to stay out.');
    return;
  }
  const e = o.easy;
  if (!e) return;
  const fine = r100(1000 * inflation(s));
  const ok = op.p >= 1 ? false : rand(o) < op.p;
  o.stats.raids++;
  e.raids++;
  s.flags.oc_raided = 1;
  if (op.how === 'ride') {
    e.closedUntil = s.week + 4;
    money(ctx, -fine, 'The raid: the fine and the lawyer', 'event');
    heat(ctx, 'local', 2, 'The raid in Ocean City', 'heat');
    o.board = clamp(o.board + 8, 0, 100);
    note(s, 'Raided: closed four weeks, the fine paid.');
    ctx.log.push('The Ocean City raid: closed four weeks, the fine paid.');
    return;
  }
  if (ok) {
    if (op.how === 'back') e.closedUntil = s.week + 1;
    o.board = clamp(o.board + (op.how === 'back' ? 3 : 0), 0, 100);
    note(s, op.how === 'back' ? 'Raided: the room was empty when they got in.' : 'Raided: the sergeant took the envelope and found nothing.');
    ctx.log.push(`The Ocean City raid: ${op.how === 'back' ? 'out the back, nobody named' : 'the sergeant took it'} (${pct(op.p)}).`);
    return;
  }
  e.closedUntil = s.week + (op.how === 'back' ? 6 : 4);
  money(ctx, -Math.round(fine * 1.5), 'The raid: the fine', 'event');
  heat(ctx, 'local', op.how === 'pay' ? 6 : 5, 'The raid in Ocean City', 'heat');
  o.board = clamp(o.board + 12 + (e.front === 'church' ? 10 : 0), 0, 100);
  if (op.how === 'pay') applyEffects(ctx, [{ type: 'evidence', charId: s.playerId, amount: 3 }], { label: 'The raid: the envelope is evidence', because: 'tried to pay off a raid', category: 'event' });
  const man = capos(s).find((k) => k.id === o.run?.runner) ?? undefined;
  const held = Object.values(s.characters).find((c) => c.alive && c.faction === 'player' && c.rank === 'associate' && isFree(s, c) && (!man || c.capoId === man.id));
  if (held && op.how === 'back') applyEffects(ctx, [{ type: 'imprison', charId: held.id, weeks: randInt(o, 2, 6) }], { label: `The raid: ${held.firstName} was held`, because: 'ran a speakeasy in Ocean City', category: 'event' });
  if (e.front === 'church') s.news.push({ week: s.week, date: { ...s.date }, paper: 'Ocean City Sentinel', headline: 'SALOON FOUND UNDER CHURCH-SUPPLY STORE', body: 'The Camp Meeting board calls for a day of prayer.', kind: 'oc' });
  note(s, `Raided: closed ${op.how === 'back' ? 'six' : 'four'} weeks${e.front === 'church' ? ', and the church basement is in the paper' : ''}.`);
  ctx.log.push(`The Ocean City raid went badly (${pct(op.p)} odds).`);
}

/* ------------------------------------------------------------------ */
/* For the screens and the map                                         */
/* ------------------------------------------------------------------ */

export function ocMapLine(s: GameState): string | undefined {
  const o = s.oc;
  if (!o || (!o.run && !o.easy && o.stance === 'dry')) return undefined;
  const parts: string[] = [];
  if (o.run) parts.push('your liquor run');
  if (o.easy) parts.push('a speakeasy');
  if (o.stance === 'bought' || o.stance === 'hooked') parts.push('the commissioner');
  if (o.stance === 'wet') parts.push('a wet town');
  return parts.join(', ');
}

/** One line about where the town stands (for the panel). */
export function ocStatus(s: GameState): string {
  const o = s.oc;
  if (!o) return 'Nobody runs Ocean City. The Camp Meeting board keeps it dry; Commissioner Batten keeps the board happy.';
  const st = o.stance === 'wet' ? 'The town is wet now.' : o.stance === 'bought' ? `Commissioner Batten is on a ${$(envelope(s))}-a-week envelope.` : o.stance === 'hooked' ? 'Commissioner Batten is on your hook.' : 'Commissioner Batten is publicly dry and privately priced.';
  const board = o.board >= 60 ? 'The board is on the warpath' : o.board >= 30 ? 'The board is watching' : 'The board is quiet';
  return `${st} ${board} (${Math.round(o.board)}).${o.crusade && o.crusade > s.week ? ' A dry crusade is on the boardwalk.' : ''}${o.tip && o.tip > s.week ? ' A paid cop will call ahead.' : ''}`;
}
