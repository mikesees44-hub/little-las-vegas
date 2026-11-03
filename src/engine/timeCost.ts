import { daysOf, DAY_NAMES } from './days';
import { addStress } from './familyStress';
import { departureHours, resolveTransport } from './transport';
import { DESTS } from './travelDests';
import { addOpinion } from './relations';
import { spendHours } from './spendData';
import { workHours } from './bizRacketData';
import { PROTECT_HOURS } from './protectData';
import { WOMEN_HOURS } from './womenState';
import { HONEY_HOURS } from './honeyState';
import { DEED_HOURS } from './deeds/hours';
import { CAPO_HOURS } from './caposState';
import type { GameState, PlayerAction } from './types';

/**
 * Time costs: everything the boss does takes hours out of his day.
 *
 * The day clock (days.ts) says which day of the week he is living; this layer
 * says what hour of that day it is. He is up at 8 AM and the day is done at
 * 2 AM: 18 hours. Each order he gives spends hours: telling a capo what to do
 * is a quarter of an hour, a sit-down is two or three, an evening with a woman
 * is four, a trip out of town is a day. When the hours run out the day ends and
 * the world marches on (the App runs the same day tick the clock runs).
 *
 * Hours after 10 PM cost sleep (stress), and a boss with a wife who is out
 * through the dinner hour (6 PM) is noticed. Both are felt when the week turns.
 *
 * `s.hours` is optional (old saves have none, and upgradeSave leaves it be):
 * no record means a fresh day with nothing spent.
 */

/** When the boss's day starts (8 AM) and how long it is (to 2 AM). */
export const DAY_START = 8;
export const DAY_HOURS = 18;
/** After this hour it is a late night (10 PM). */
export const LATE_AT = 22;
/** The family dinner hour (6 PM to 7 PM). */
export const DINNER_AT = 18;
/** The smallest cost: one order to the crew. Less than this left and the day is done. */
export const MIN_COST = 0.25;
/** "A day": a trip out of town. */
export const TRAVEL_DAY = 10;
/** The fallback for anything not in the table. */
export const DEFAULT_COST = 1;

export interface HoursState {
  /** The absolute day (week * 7 + day of the week) `used` is for. */
  abs: number;
  /** Hours spent that day. */
  used: number;
  /** Hours already promised to later days ("Do it tomorrow"), by absolute day. */
  booked?: Record<string, number>;
  /** Late hours (after 10 PM) not yet felt: they turn into stress when the week turns. */
  late?: number;
  /** Family dinners missed and not yet noticed (felt when the week turns). */
  missed?: number;
  /** The absolute day whose dinner was missed (counted once a day). */
  dinnerDay?: number;
}

/**
 * Hours per order, by kind or "kind:op" (op is the order's `type`/`op`/`t`,
 * the interaction id, the scheme kind or the talk). The guide:
 * an order to the crew ¼ h; a visit, a talk ~1 h; a meeting or sit-down
 * 2-3 h; an evening (a date, a dinner, the club) 3-5 h; travel a day.
 */
export const TIME_TABLE: Record<string, number> = {
  // Rackets & places
  buyBusiness: 2, sellBusiness: 2, lend: 1, findFrontMan: 2, charterBank: 3, casino: 3,
  'econ:racket': 1, 'econ:setup': 1, 'econ:spotCall': 0.5, 'econ:placeAsk': 0.5, 'econ:tenantCall': 0.5, 'econ:upgrade': 1, 'econ:collect': 1, 'econ:rename': 0.25,
  'econ:manager': 1, 'econ:oversight': 0.5, 'econ:audit': 2, 'econ:assistant': 1,
  'econ:buyLot': 2, 'econ:leaseLot': 1, 'econ:deal': 2, 'econ:sellLot': 2, 'econ:slowRival': 0.5, 'econ:bid': 1,
  'econ:build': 2, 'econ:renovate': 1, 'econ:permits': 1, 'econ:bribeInspector': 1, 'econ:puppetPermit': 1, 'econ:fixCode': 1, 'econ:home': 2,
  'econ:empire': 0.5, 'econ:bank': 1, 'econ:hq': 1, 'econ:sweep': 0.5,
  'econ:gift': 1, 'econ:invite': 3, 'econ:leverage': 1, 'econ:project': 2, 'econ:luxBuy': 2, 'econ:luxSell': 1,
  'hood:restyle': 0.5,
  dirty: 0.25,
  // Ocean City (oceanCity.ts): an order to the capo who runs it; a meeting with the commissioner; a campaign.
  'oc:run': 1, 'oc:stopRun': 0.25, 'oc:build': 2, 'oc:upgrade': 0.5, 'oc:buy': 2, 'oc:dig': 0.5, 'oc:squeeze': 1, 'oc:vote': 2,
  // Work this place: a visit with an offer is an hour or so; an order to the crew less (workHours).
  'work:pitch': 1, 'work:scheme': 1, 'work:press': 0.5, 'work:drop': 0.25,
  // Protection & intelligence: a word with the man, a word with the family (protectData.ts).
  ...Object.fromEntries(Object.entries(PROTECT_HOURS).map(([k, v]) => [`protect:${k}`, v])),
  // The capos (capos.ts): a word is a quarter of an hour; asking him straight, an hour; a christening, an afternoon.
  ...Object.fromEntries(Object.entries(CAPO_HOURS).map(([k, v]) => [`capo:${k}`, v])),
  // The women: a dinner, an evening, a gift (women.ts).
  ...Object.fromEntries(Object.entries(WOMEN_HOURS).map(([k, v]) => [`women:${k}`, v])),
  // Honey: a dare is half an hour; a word with her about what she is, an hour (honey.ts).
  ...Object.fromEntries(Object.entries(HONEY_HOURS).map(([k, v]) => [`honey:${k}`, v])),
  'dev:adopt': 1, 'dev:drop': 0.25, 'dev:resp': 0.25, 'dev:mandate': 0.25,
  'dev:buy': 1, 'dev:assign': 0.25, 'dev:repair': 0.25, 'dev:scrap': 0.25,
  // Money
  'tribute:policy': 0.5, 'tribute:squeeze': 0.5, 'tribute:move': 0.25,
  'tribute:audit': 2, 'tribute:auditUb': 2, 'tribute:terms': 1, 'tribute:forgive': 1,
  'tribute:ubRate': 0.5, 'tribute:allowance': 0.5,
  // Sit and talk with one of your people (minds/talk.ts): about an hour.
  'mind:talk': 1,
  'ledger:mode': 0.5, 'ledger:keeper': 1, 'ledger:check': 2, 'ledger:confront': 1, 'ledger:forgive': 1,
  'bones:assign': 0.5, 'bones:favor': 1,
  // The Family
  appoint: 1, councilTask: 0.25, policy: 0.25, contract: 1, edict: 0.25, order: 0.25,
  hire: 1, reassign: 0.25, propose: 1, background: 0.25,
  interact: 1,
  'interact:gift_small': 0.5, 'interact:gift_large': 1, 'interact:demand': 1, 'interact:threaten': 1,
  'interact:recruit': 1, 'interact:favor': 1, 'interact:dinner': 3, 'interact:promote': 0.5, 'interact:demote': 0.5,
  'interact:exile': 1, 'interact:make': 3, 'interact:whack': 0.25, 'interact:bringIn': 1, 'interact:bribe': 1, 'interact:expose': 1,
  'interact:court': 3, 'interact:affair': 4, 'interact:endRomance': 1, 'interact:proposeMarriage': 3, 'interact:separate': 2,
  'talk:ask': 1,
  'talk:meeting': 2, 'talk:job': 1, 'talk:business': 2, 'talk:partner': 3, 'talk:advice': 1,
  'talk:grievance': 1, 'talk:social': 4, 'talk:negotiate': 3, 'talk:succession': 2,
  'talk:answer': 0.5,
  // Jobs
  scheme: 0.5, cancelScheme: 0.25, mission: 1,
  // The other families
  declareWar: 2, raid: 0.25, terms: 3, raiseDispute: 3, lobby: 2, askPermission: TRAVEL_DAY, pushDistrict: 0.25,
  // Blood
  'dynasty:marry': 2, 'dynasty:guardian': 1, 'dynasty:host': 4, 'dynasty:decision': 1, 'dynasty:standing': 1, 'dynasty:legacy': 1,
  'power:designate': 1, 'power:groom': 2, 'power:stopGrooming': 0.5, 'power:place': 0.5, 'power:unplace': 0.5,
  'power:read': 1, 'power:promise': 1, 'power:shadow': 2,
  'power:amends': 2, 'power:announce': 1, 'power:prep': 1, 'power:consult': 2,
  'power:blitz': 0.25, 'power:mattresses': 0.5, 'power:bodyguards': 0.25,
  'power:front': 2, 'power:endFront': 1, 'power:climb': 2, 'power:takeover': 3, 'power:audience': 3,
  'dating:talk': 1, 'dating:invite': 4, 'dating:gift': 0.5, 'dating:steady': 3, 'dating:commit': 3,
  'dating:reconcile': 3, 'dating:meet': 3, 'dating:paid': 4, 'dating:askOut': 1,
  // Yourself
  lifestyle: 0.5, perk: 1, officeHours: 3,
  legal: 1, 'legal:retainer': 2, 'legal:lielow': 0.5,
  'travel:trip': TRAVEL_DAY, 'travel:cancel': 0.25, 'travel:recall': 0.25,
  // New York (nyc.ts): orders to a capo, a sit-down with a family or the Commission.
  'nyc:crew': 1, 'nyc:racket': 1, 'nyc:bless': 3, 'nyc:tribute': 0.5, 'nyc:sitdown': 3, 'nyc:recall': 0.25,
  'travel:flee': TRAVEL_DAY, 'travel:surrender': 4, 'travel:comeHome': 2, 'travel:exile': 0.5, 'travel:hide': 2,
  // The town
  'pol:cultivate': 2, 'pol:payroll': 1, 'pol:dig': 0.5, 'pol:coerce': 1, 'pol:favor': 1, 'pol:recruit': 1, 'pol:groom': 2,
  'pol:fund': 1, 'pol:endorse': 1, 'pol:patronage': 1, 'pol:dirty': 0.5, 'pol:puppet': 1, 'pol:lobby': 2,
  'pol:propose': 2, 'pol:enter': 2, 'pol:declare': 2,
  underbelly: 1, 'underbelly:investigate': 1, 'underbelly:expose': 1, 'underbelly:runout': 0.25, 'underbelly:ally': 2,
  'living:ask': 1, 'living:give': 1,
  'ears:ask': 1, 'ears:retain': 1, 'ears:protect': 1, 'ears:madamCall': 2, 'ears:madamCut': 1, 'ears:madamIntel': 1,
  'ears:madamVenture': 2, 'ears:madamFavor': 1,
  'ears:opDig': 0.5, 'ears:opRunoff': 0.25, 'ears:opExpose': 1, 'ears:opMadam': 1,
  // Nightlife: a night with her is an evening; business with the houses is a meeting.
  'nightlife:payroll': 1, 'nightlife:release': 0.5, 'nightlife:promise': 1, 'nightlife:keep': 3,
  'nightlife:goomar': 4, 'nightlife:endGoomar': 2, 'nightlife:deal': 2, 'nightlife:back': 0.5,
  // The papers: a word with the editor is an hour; buying the paper is a meeting with lawyers.
  'paper:plant': 1, 'paper:kill': 1, 'paper:ad': 0.5, 'paper:buy': 3, 'paper:sue': 2,
  // Intrigue: a word in the right ear is an hour; a sit-down is an evening; questioning a man takes the afternoon.
  'intrigue:plant': 1, 'intrigue:turn': 2, 'intrigue:recall': 0.5, 'intrigue:canary': 1, 'intrigue:question': 2, 'intrigue:moleFate': 1,
  'intrigue:rumor': 1, 'intrigue:forge': 1, 'intrigue:sabotage': 0.5, 'intrigue:proxy': 1, 'intrigue:sitdown': 3, 'intrigue:front': 0.5,
  'nightlife:invite': 4, 'nightlife:car': 0.75, 'nightlife:bold': 0.5, 'nightlife:partner': 2, 'nightlife:askMan': 0.5,
  // Your People (bonds.ts): an evening with your wife, an afternoon with a kid, a day fishing.
  'bond:date': 4, 'bond:anniversary': 4, 'bond:apologize': 1, 'bond:confess': 1, 'bond:deny': 0.5, 'bond:vacation': TRAVEL_DAY,
  'bond:gift': 1, 'bond:kids': 1, 'bond:ambition': 1, 'bond:kidTime': 3, 'bond:attention': 4, 'bond:reassure': 1,
  'bond:ultimatum': 2, 'bond:baby': 2, 'bond:herFamily': 1, 'bond:drink': 1.5, 'bond:fishing': 5, 'bond:cards': 3,
  'bond:godfather': 3, 'bond:lend': 0.5, 'bond:settle': 2, 'bond:test': 1, 'bond:confide': 1, 'bond:peace': 2,
  // Spend: buying a thing is an hour; an occasion is an evening and a trip a day (spendHours, with the state).
  'spend:buy': 1, 'spend:sell': 0.5,
  // My Men (myMen.ts): an envelope is a quarter of an hour; a sit-down is an afternoon; a jail visit, the drive to Cape May county.
  'mymen:bonus': 0.25, 'mymen:raise': 0.5, 'mymen:debt': 1, 'mymen:bills': 0.5, 'mymen:brother': 1, 'mymen:noshow': 1, 'mymen:tuition': 0.5, 'mymen:hospital': 1,
  'mymen:christmas': 2, 'mymen:guard': 0.25, 'mymen:safety': 1, 'mymen:lawyer': 1, 'mymen:inside': 0.5, 'mymen:visit': 3, 'mymen:hide': 1,
  'mymen:answer': 2, 'mymen:warn': 0.5, 'mymen:fine': 0.5, 'mymen:demote': 0.5, 'mymen:shelf': 0.5, 'mymen:kill': 1,
  // The Store: a day at the track (an afternoon), sharing the wealth (an hour of envelopes and phone calls).
  'spend:race': 4, 'spend:share': 1,
  // The army (army.ts): word to the capos is a quarter of an hour; a call to arms or a pact is a sit-down; an attack, an evening by the phone.
  'army:raise': 0.5, 'army:disband': 0.25, 'army:hire': 1, 'army:dismiss': 0.25, 'army:safehouses': 1,
  'army:ask': 3, 'army:pact': 3, 'army:attack': 2,
  // Deeds (deeds/): a flattering word is half an hour; a dinner is an evening; finding a man's secrets is an afternoon of asking around.
  deed: 1,
  ...Object.fromEntries(Object.entries(DEED_HOURS).map(([k, v]) => [`deed:${k}`, v])),
};

/** Time with the family: it is the dinner, not a missed one. */
const FAMILY_TIME = new Set(['dynasty:host', 'dynasty:marry', 'bond:date', 'bond:anniversary', 'bond:vacation', 'bond:kidTime', 'bond:kids']);

/** The op name of an order (`type` / `op` / `t`, the interaction id, the scheme kind), if it has one. */
export function opName(a: PlayerAction): string | undefined {
  if (a.kind === 'interact') return a.id;
  if (a.kind === 'deed') return a.id;
  if (a.kind === 'scheme') return a.scheme;
  const o = (a as { op?: unknown }).op;
  if (typeof o === 'string') return o;
  if (o && typeof o === 'object') {
    const r = o as { type?: unknown; op?: unknown; t?: unknown };
    const n = r.type ?? r.op ?? r.t;
    if (typeof n === 'string') return n;
  }
  return undefined;
}

/** Is there a cost written for this kind (and op)? (The registry test checks every order has one.) */
export function hasTimeCost(kind: string, op?: string): boolean {
  return (op !== undefined && `${kind}:${op}` in TIME_TABLE) || kind in TIME_TABLE;
}

/**
 * Hours the boss spends on an order. With the state, a trip he doesn't go on
 * himself is only an order (a quarter of an hour to send them off).
 */
export function timeCost(a: PlayerAction, s?: GameState): number {
  const op = opName(a);
  if (a.kind === 'talk' && a.op.t === 'ask') {
    const k = `talk:${a.op.talk}`;
    if (k in TIME_TABLE) return TIME_TABLE[k];
  }
  if (s && a.kind === 'travel' && a.op.type === 'trip') {
    const p = a.op.plan;
    if (p.leaderId !== s.playerId && !p.guests.includes(s.playerId) && p.companionId !== s.playerId) return 0.5;
    // Going himself: the door-to-door hours of the way he chose (a ferry to Lewes is an afternoon; Miami is the day).
    const d = DESTS[p.destId];
    if (d && p.transport) return departureHours(resolveTransport(p.mode, p.tier, d, p.transport), d, TRAVEL_DAY);
  }
  if (a.kind === 'spend' && a.op.op === 'buy') return spendHours(a.op.item);
  if (a.kind === 'work') return workHours(a.op, s?.playerId);
  if (op !== undefined && `${a.kind}:${op}` in TIME_TABLE) return TIME_TABLE[`${a.kind}:${op}`];
  if (a.kind in TIME_TABLE) return TIME_TABLE[a.kind];
  return DEFAULT_COST;
}

/** "15 minutes", "1 hour", "2½ hours", "a day (10 hours)". */
export function hoursLabel(h: number): string {
  if (h >= TRAVEL_DAY) return `a day (${h} hours)`;
  if (h < 1) return `${Math.round(h * 60)} minutes`;
  const whole = Math.floor(h);
  const frac = h - whole;
  const f = frac >= 0.74 ? '¾' : frac >= 0.49 ? '½' : frac >= 0.24 ? '¼' : '';
  return `${whole}${f} hour${whole === 1 && !f ? '' : 's'}`;
}

/** Short form for a row: "15m", "2h", "1½h", "1 day". */
export function hoursShort(h: number): string {
  if (h >= TRAVEL_DAY) return '1 day';
  if (h < 1) return `${Math.round(h * 60)}m`;
  return hoursLabel(h).replace(/ hours?$/, 'h');
}

/** An hour of the day (8 = 8 AM, 21.5 = 9:30 PM, 25 = 1 AM) as "9:30 PM". */
export function formatClock(h: number): string {
  const total = Math.round(h * 60);
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  const ap = hh < 12 ? 'AM' : 'PM';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}${mm ? `:${String(mm).padStart(2, '0')}` : ''} ${ap}`;
}

/** The absolute day the clock is on (week * 7 + day of the week). */
export function absDay(s: GameState): number {
  return s.week * 7 + daysOf(s).day;
}

/** Hours spent today (what was booked ahead for today counts). */
export function hoursUsed(s: GameState): number {
  const h = s.hours;
  if (!h) return 0;
  const abs = absDay(s);
  if (h.abs === abs) return h.used;
  return Math.min(DAY_HOURS, h.booked?.[abs] ?? 0);
}

export function hoursLeft(s: GameState): number {
  return Math.max(0, DAY_HOURS - hoursUsed(s));
}

/** The hour of the day now (8 = 8 AM … 26 = 2 AM). */
export function clockHour(s: GameState): number {
  return DAY_START + hoursUsed(s);
}

/** "Tue 9:15 PM". */
export function nowLabel(s: GameState): string {
  return `${DAY_NAMES[daysOf(s).day].slice(0, 3)} ${formatClock(clockHour(s))}`;
}

/** Is the boss's day used up (not even a quarter hour left)? */
export function dayDone(s: GameState): boolean {
  return hoursLeft(s) < MIN_COST - 1e-9;
}

/** Why this can't be done today for lack of time (undefined: there is time). */
export function timeBlock(s: GameState, a: PlayerAction): string | undefined {
  const need = timeCost(a, s);
  const left = hoursLeft(s);
  if (need <= left + 1e-9) return undefined;
  if (left < MIN_COST) return `No time left today: it takes ${hoursLabel(need)}`;
  return `Not enough time today: it takes ${hoursLabel(need)}, ${hoursLabel(left)} left`;
}

export interface TimeSpent {
  state: GameState;
  /** Hours it took. */
  hours: number;
  /** The clock before and after (hours of the day: 8 … 26). */
  from: number;
  to: number;
  /** The day is used up. */
  dayOver: boolean;
  /** Hours of it after 10 PM. */
  late: number;
  /** It ran through the family dinner. */
  missedDinner: boolean;
}

function prunedBooked(b: Record<string, number> | undefined, abs: number): Record<string, number> | undefined {
  if (!b) return undefined;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(b)) if (Number(k) > abs && v > 0) out[k] = v;
  return Object.keys(out).length ? out : undefined;
}

function hasHome(s: GameState): boolean {
  const b = s.characters[s.playerId];
  const w = b?.spouseId ? s.characters[b.spouseId] : undefined;
  return !!w?.alive;
}

/** Does this order keep the boss out through the dinner hour? */
function overDinner(a: PlayerAction, from: number, to: number): boolean {
  const k = `${a.kind}:${opName(a) ?? ''}`;
  if (FAMILY_TIME.has(k)) return false;
  return from < DINNER_AT + 1 && to > DINNER_AT;
}

/**
 * The boss does it today: the hours come off the day and the clock moves on.
 * Pure (returns a new state). Never refuses: the UI asks `timeBlock` first.
 */
export function spendTime(s: GameState, a: PlayerAction): TimeSpent {
  const hours = timeCost(a, s);
  const abs = absDay(s);
  const before = hoursUsed(s);
  const used = Math.min(DAY_HOURS, before + hours);
  const from = DAY_START + before;
  const to = DAY_START + used;
  const late = Math.max(0, to - Math.max(from, LATE_AT));
  const prev = s.hours;
  const alreadyMissed = prev?.dinnerDay === abs;
  const missedDinner = hasHome(s) && overDinner(a, from, to) && !alreadyMissed;
  const h: HoursState = {
    abs,
    used,
    ...(prunedBooked(prev?.booked, abs) ? { booked: prunedBooked(prev?.booked, abs) } : {}),
    ...((prev?.late ?? 0) + late > 0 ? { late: (prev?.late ?? 0) + late } : {}),
    ...((prev?.missed ?? 0) + (missedDinner ? 1 : 0) > 0 ? { missed: (prev?.missed ?? 0) + (missedDinner ? 1 : 0) } : {}),
    ...(missedDinner || alreadyMissed ? { dinnerDay: abs } : {}),
  };
  const state = { ...s, hours: h };
  return { state, hours, from, to, dayOver: dayDone(state), late, missedDinner };
}

/**
 * "Do it tomorrow": the order is given now, but its hours are promised to the
 * next day with room for it (tomorrow, or the first day after with room).
 * Returns the state and the day it was booked for (0 Monday … 6 Sunday).
 */
export function bookLater(s: GameState, a: PlayerAction): { state: GameState; day: number; hours: number } {
  const hours = timeCost(a, s);
  const abs = absDay(s);
  const prev = s.hours;
  const booked = { ...(prunedBooked(prev?.booked, abs) ?? {}) };
  let at = abs + 1;
  for (let i = 1; i <= 7; i++) {
    const t = abs + i;
    if ((booked[t] ?? 0) + hours <= DAY_HOURS + 1e-9) { at = t; break; }
  }
  booked[at] = Math.min(DAY_HOURS, (booked[at] ?? 0) + hours);
  const h: HoursState = { ...(prev ?? { abs, used: 0 }), booked };
  if (h.abs !== abs) { h.abs = abs; h.used = hoursUsed(s); }
  return { state: { ...s, hours: h }, day: at % 7, hours };
}

/** Undo: the hours an order took today come back (if it is still the same day). */
export function refundTime(s: GameState, hours: number, late = 0, missedDinner = false): GameState {
  const h = s.hours;
  if (!h || h.abs !== absDay(s)) return s;
  const next: HoursState = { ...h, used: Math.max(0, h.used - hours) };
  if (late) next.late = Math.max(0, (next.late ?? 0) - late);
  if (missedDinner) { next.missed = Math.max(0, (next.missed ?? 0) - 1); delete next.dinnerDay; }
  return { ...s, hours: next };
}

/** Undo of a "Do it tomorrow": the hours booked for that day are released. */
export function unbook(s: GameState, dayOfWeek: number, hours: number): GameState {
  const h = s.hours;
  if (!h?.booked) return s;
  const abs = absDay(s);
  const key = Object.keys(h.booked).map(Number).find((k) => k > abs && k % 7 === dayOfWeek);
  if (key === undefined) return s;
  const booked = { ...h.booked, [key]: Math.max(0, h.booked[key] - hours) };
  return { ...s, hours: { ...h, booked: prunedBooked(booked, abs) } };
}

/**
 * Engine side, when the week turns: the late nights and the missed dinners are
 * felt. Late hours: a point of stress per two (at most 8 a week). A missed
 * dinner: 2 stress for the boss, and his wife takes it personally (−4 each).
 * Then the tallies start over. Returns the lines for the report.
 */
export function hoursWeek(s: GameState): string[] {
  const h = s.hours;
  if (!h) return [];
  const out: string[] = [];
  const boss = s.characters[s.playerId];
  const late = h.late ?? 0;
  const missed = h.missed ?? 0;
  if (boss?.alive) {
    const lateStress = Math.min(8, Math.floor(late / 2));
    if (lateStress > 0) {
      addStress(s, boss.id, lateStress, 'domestic');
      out.push(`Late nights: ${hoursLabel(late)} after 10 PM this week (+${lateStress} stress).`);
    }
    if (missed > 0) {
      addStress(s, boss.id, Math.min(6, 2 * missed), 'domestic');
      const w = boss.spouseId ? s.characters[boss.spouseId] : undefined;
      if (w?.alive) {
        addOpinion(s, w.id, boss.id, 'Missed family dinners', -Math.min(12, 4 * missed), 1);
        out.push(`${w.firstName} kept your plate warm ${missed === 1 ? 'once' : `${missed} times`} this week. She noticed.`);
      }
    }
  }
  const next: HoursState = { abs: h.abs, used: h.used, ...(h.booked ? { booked: h.booked } : {}) };
  s.hours = next;
  return out;
}
