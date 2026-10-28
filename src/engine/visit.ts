import { ageOn, formatDate } from './calendar';
import { CITIES_BY_ID, hasPermission, needsPermission, standing } from './cities';
import { crew, displayName, isFree, makeCharacter, player } from './characters';
import { DAY_NAMES, daysOf, dayDate } from './days';
import { applyEffects, fmtMoney, shiftInfluence } from './effects';
import { addStress } from './familyStress';
import { heat, money, type Ctx } from './ledger';
import { opinion } from './relations';
import { rand, randInt } from './rng';
import { actingBoss, leaderBlock } from './travel';
import { DESTS, fare, legDays, MODES } from './travelDests';
import { gunFactor, optFare, resolveTransport, transportBlock, TRANSPORT, type TransportId } from './transport';
import {
  currentVisit, ensureTravel, fugitiveOf, nowDay, tripOf,
  type CityVerb, type JournalLine, type Visit, type VisitItem, type VisitMode, type VisitSlot,
} from './travelState';
import { sceneOf, shortName, type CityPlace, type CityScene } from './visitData';
import { whereAway } from './visitAway';
import { travelCover } from './protect';
import type { Character, Choice, Effect, EventInstance, GameState, RivalId } from './types';

/**
 * Going there yourself. The trip planner (travel.ts) books a trip that plays
 * itself out; a VISIT puts the boss in another city to play there:
 *
 * - He leaves today and spends a day on the road each way (more for a far
 *   city): the clock is days.ts's, a visit is absolute days like a trip.
 * - While he is away his home-only orders are disabled with the reason
 *   (visitAway.ts), the underboss runs things (travel.ts's acting boss, the
 *   capos act up), and home is a little more exposed: a rival may lean on a
 *   district (visitWeek).
 * - In the city he books an agenda — a sit-down with the local family or
 *   the Commission's man, a buy-in, laundering at a bank, moving swag
 *   through a fence, a politician, shopping, recruiting, lying low, a night
 *   on the town — one thing per day and one per night. Like the evenings,
 *   the agenda is a plan: the week resolves it (`visitWeek`), on the travel
 *   dice, through the ledger, into the report and the visit's journal.
 * - The road has its risks: a tail, the state police pulling the car over,
 *   and an ambush out of town where nobody owes you anything.
 *
 * Every state change the player makes (depart, book, come home) is a pure
 * function returning a new state (like days.ts's setEvening); nothing is
 * rolled until the week turns.
 */

export const VISIT_MODES: VisitMode[] = ['cars', 'train', 'bus'];
export const MAX_GUARDS = 2;

/* ---------------------------------------------------------------- */
/* Getting there                                                     */
/* ---------------------------------------------------------------- */

/** Days on the road each way (Philadelphia, AC, New York: one). */
export function visitLegDays(cityId: string, mode: VisitMode): number {
  const d = DESTS[cityId];
  return d ? legDays(mode, d.miles) : 1;
}

/** Modes that go there. */
export function visitModes(cityId: string): VisitMode[] {
  const d = DESTS[cityId];
  if (!d || d.noRoad) return [];
  return VISIT_MODES.filter((m) => d.modes.includes(m) || (m === 'cars' && !d.abroad));
}

/** The round trip (cars: gas and the driver; train/bus: a ticket each). */
export function visitFare(cityId: string, mode: VisitMode, guards: number, transport?: string): number {
  const d = DESTS[cityId];
  if (!d) return 0;
  if (transport) {
    const o = resolveTransport(mode, 'modest', d, transport);
    return mode === 'cars' ? 2 * optFare(o, d, 'modest') : 2 * (1 + guards) * optFare(o, d, 'modest');
  }
  return mode === 'cars' ? 2 * fare('cars', d.miles, 'modest') : 2 * (1 + guards) * fare(mode, d.miles, 'modest');
}

/** Crew who can come along as bodyguards. */
export function guardPool(s: GameState): Character[] {
  return crew(s).filter((c) => c.alive && isFree(s, c) && (c.rank === 'soldier' || c.rank === 'associate') && !tripOf(s, c.id) && !fugitiveOf(s, c.id) && (c.busyUntil ?? 0) <= s.week && !currentVisit(s)?.party.includes(c.id));
}

export interface DepartPlan { cityId: string; mode: VisitMode; guards: string[]; /** How exactly (transport.ts): the Caddy, a hired driver, the club car… */ transport?: TransportId }

export interface VisitRisks { tail: number; stop: number; ambush: number }

/** Why the boss can't go there now (undefined: he can). */
export function departBlock(s: GameState, plan: Pick<DepartPlan, 'cityId' | 'mode'> & { guards?: string[]; transport?: TransportId }): string | undefined {
  if (s.gameOver) return 'The game is over';
  const sc = sceneOf(plan.cityId);
  if (!sc) return plan.cityId === 'wildwood' ? 'You are home' : 'No such city';
  if (currentVisit(s)) return `${whereAway(s, currentVisit(s)!)}: come home first`;
  const lb = leaderBlock(s, s.playerId);
  if (lb) return lb;
  const b = player(s);
  if (b.health < 25) return 'In the hospital';
  if (!visitModes(plan.cityId).includes(plan.mode)) return visitModes(plan.cityId).length ? `No ${MODES[plan.mode].name.toLowerCase()} goes there` : 'Too far to just go: plan a trip';
  const guards = plan.guards ?? [];
  if (guards.length > MAX_GUARDS) return `At most ${MAX_GUARDS} bodyguards`;
  const pool = new Set(guardPool(s).map((c) => c.id));
  if (guards.some((g) => !pool.has(g))) return 'A bodyguard can\'t come';
  if (plan.transport) {
    const o = TRANSPORT[plan.transport];
    const d = DESTS[plan.cityId];
    if (!o || o.mode !== plan.mode) return 'Pick how you go';
    const tb = d ? transportBlock(o.id, d, s.date) : undefined;
    if (tb) return tb;
    if (guards.length > o.guards) return `${o.name}: at most ${o.guards} bodyguard${o.guards === 1 ? '' : 's'}`;
    if (o.seats && guards.length + 1 > o.seats) return `${o.name}: ${o.seats} seats`;
  }
  const cost = visitFare(plan.cityId, plan.mode, guards.length, plan.transport);
  if (s.money < cost + sc.nightly * 2) return `Needs ${fmtMoney(cost + sc.nightly * 2)} for the road and a couple of nights`;
  return undefined;
}

function rivalOf(s: GameState, place: CityPlace) {
  return place.rival ? s.rivals.find((r) => r.id === place.rival) : undefined;
}

/** What the rival who owns this place thinks of you (0 when nobody in the game owns it). */
function rivalOp(s: GameState, rival?: RivalId): number {
  const r = rival ? s.rivals.find((x) => x.id === rival) : undefined;
  return r && s.characters[r.leaderId]?.alive ? opinion(s, r.leaderId, s.playerId) : 0;
}

/** The city's home outfit (the one whose opinion decides how safe you are there). */
function cityRival(sc: CityScene): RivalId | undefined {
  return sc.places.find((p) => p.rival)?.rival;
}

/** The odds of trouble on this visit (per leg for the road, per week for an ambush). */
export function visitRisks(s: GameState, cityId: string, mode: VisitMode, guards: number, hid = false, transport?: string): VisitRisks {
  const sc = sceneOf(cityId);
  const fed = s.heat.federal;
  const ev = player(s)?.evidence ?? 0;
  const o = transport && DESTS[cityId] ? resolveTransport(mode, 'modest', DESTS[cityId], transport) : undefined;
  const tail = Math.min(0.6, MODES[mode].tail * (o?.tailMult ?? 1) * (0.4 + fed / 60) * (ev >= 40 ? 1.5 : 1) * (hid ? 0.5 : 1) + (mode === 'cars' ? 0.02 : 0));
  const stop = mode === 'cars' ? Math.min(0.4, (o ? o.stop : 0.04) + s.heat.local / 500 + guards * 0.015) : 0;
  const rv = sc ? cityRival(sc) : undefined;
  const r = rv ? s.rivals.find((x) => x.id === rv) : undefined;
  let ambush = 0.02;
  const op = rivalOp(s, rv);
  if (op < -30) ambush += 0.06;
  if (r?.war) ambush += 0.15;
  if (r?.feud) ambush += 0.08;
  if (standing(s, cityId) < -10) ambush += 0.04;
  ambush *= 1 - 0.25 * Math.min(MAX_GUARDS, guards) * (o ? gunFactor(o) : 1);
  if (hid) ambush *= 0.5;
  // The boss's own assigned bodyguard or escort (protect.ts) goes along: a share off, never all.
  ambush *= 1 - travelCover(s);
  return { tail, stop, ambush: Math.min(0.5, ambush) };
}

export interface DepartQuote { legDays: number; fare: number; nightly: number; risks: VisitRisks; arrive: string; block?: string }

export function departQuote(s: GameState, plan: DepartPlan): DepartQuote {
  const sc = sceneOf(plan.cityId);
  const leg = visitLegDays(plan.cityId, plan.mode);
  const now = nowDay(s);
  return {
    legDays: leg,
    fare: visitFare(plan.cityId, plan.mode, plan.guards.length, plan.transport),
    nightly: sc?.nightly ?? 25,
    risks: visitRisks(s, plan.cityId, plan.mode, plan.guards.length, false, plan.transport),
    arrive: absLabel(s, now + leg),
    block: departBlock(s, plan),
  };
}

/** "Tuesday" this week, else the date. */
export function absLabel(s: GameState, day: number): string {
  const w = Math.floor(day / 7);
  if (w === s.week) return DAY_NAMES[day % 7];
  if (w === s.week + 1) return `next ${DAY_NAMES[day % 7]}`;
  return formatDate(dayDate(s, day - s.week * 7));
}

function withTravel(s: GameState, f: (visits: Visit[]) => Visit[]): GameState {
  const tr = s.travel ?? ensureTravel({ ...s });
  return { ...s, travel: { ...tr, visits: f((tr.visits ?? []).map((v) => ({ ...v, agenda: v.agenda.map((i) => ({ ...i })), journal: [...v.journal], legs: [...v.legs], weeksDone: [...v.weeksDone], party: [...v.party] }))) } };
}

function note(v: Visit, day: number, text: string, tone: JournalLine['tone'] = 'neutral'): void {
  v.journal.push({ day, text, tone });
  if (v.journal.length > 40) v.journal = v.journal.slice(-40);
}

/** The boss leaves for the city now (pure). Returns the state unchanged when blocked. */
export function departFor(s: GameState, plan: DepartPlan): GameState {
  if (departBlock(s, plan)) return s;
  const now = nowDay(s);
  const leg = visitLegDays(plan.cityId, plan.mode);
  const sc = sceneOf(plan.cityId)!;
  const v: Visit = {
    id: `visit${s.nextId}`, cityId: plan.cityId, mode: plan.mode, party: [...plan.guards], ...(plan.transport ? { transport: plan.transport } : {}),
    departDay: now, arriveDay: now + leg, agenda: [], journal: [], legs: [], weeksDone: [], spent: 0,
  };
  const guards = plan.guards.map((id) => s.characters[id]?.firstName).filter(Boolean);
  note(v, now, `Left Wildwood for ${sc.name} by ${plan.transport ? TRANSPORT[plan.transport].name.replace(/^Your /, 'your ').replace(/^A /, 'a ') : MODES[plan.mode].name.toLowerCase()}${guards.length ? ` with ${guards.join(' and ')}` : ''}.`);
  let n = withTravel({ ...s, nextId: s.nextId + 1 }, (vs) => [...vs.filter((x) => !x.over || x.homeDay === undefined || x.homeDay > now - 28), v]);
  // The evenings he will miss come off this week's plan (the days layer already skips the mornings).
  const d = daysOf(n);
  if (d.plan) n = { ...n, days: { ...d, plan: d.plan.map((x, i) => (s.week * 7 + i >= now ? null : x)) } };
  return n;
}

/* ---------------------------------------------------------------- */
/* Being there: the places, the verbs, the agenda                    */
/* ---------------------------------------------------------------- */

export interface VerbPreview {
  verb: CityVerb;
  title: string;
  detail: string;
  /** Money it takes (paid when the week resolves). */
  cost: number;
  /** Money it brings (an estimate). */
  gain?: number;
  /** Success odds (0-1), when it can fail. */
  odds?: number;
  /** Which part of the day it takes. */
  slot: VisitSlot | 'any' | 'both';
  warning?: string;
  disabledReason?: string;
}

const VERB_NAME: Record<CityVerb, string> = {
  sitdown: 'Sit down', deal: 'Make a deal', launder: 'Wash money', shop: 'Go shopping', recruit: 'Look for recruits', hideout: 'Lie low', night: 'A night on the town',
};

/** "A rowhouse in Fishtown" in the middle of a sentence. */
const lower = (name: string) => (/^(A|An|The) /.test(name) ? name[0].toLowerCase() + name.slice(1) : name);

const clamp = (x: number, lo = 0.05, hi = 0.95) => Math.max(lo, Math.min(hi, x));

function priceIdx(cityId: string): number {
  return DESTS[cityId]?.price ?? 1;
}

/** The contact's name now (a rival leader's place shows whoever leads it today). */
export function contactOf(s: GameState, place: CityPlace): string | undefined {
  const r = rivalOf(s, place);
  const L = r ? s.characters[r.leaderId] : undefined;
  if (L?.alive && (place.kind === 'family')) return displayName(L);
  return place.contact;
}

/** The buy-in price for a partnership with the local family. */
export function buyInPrice(cityId: string): number {
  const c = CITIES_BY_ID[cityId];
  return Math.round(((c?.income ?? 250) * 10) / 100) * 100;
}

/** What a verb at a place would do (pure: no dice). */
export function verbPreview(s: GameState, v: Visit, place: CityPlace, verb: CityVerb): VerbPreview {
  const sc = sceneOf(v.cityId)!;
  const st = standing(s, v.cityId);
  const who = contactOf(s, place);
  const rv = rivalOf(s, place);
  const rop = rivalOp(s, place.rival);
  const px = priceIdx(v.cityId);
  const base: VerbPreview = { verb, title: `${VERB_NAME[verb]}: ${place.name}`, detail: '', cost: 0, slot: 'day' };
  let why: string | undefined = place.verbs.includes(verb) ? undefined : 'Not here';
  switch (verb) {
    case 'sitdown': {
      if (place.kind === 'commission') {
        base.cost = 1000;
        base.odds = clamp(0.4 + st / 120 + s.respect / 300);
        base.detail = `${who ?? 'The go-between'} hears you out over dinner. If it goes well: a favor owed, Philadelphia's eye off you (family heat −4), respect. An envelope for his charities (${fmtMoney(1000)}).`;
        if (st < 10) why = why ?? `They don't know you here yet (standing ${st}; 10 needed)`;
      } else {
        base.cost = place.kind === 'family' ? 200 : 150;
        base.odds = clamp(0.5 + st / 150 + (s.respect - 30) / 300 + rop / 250);
        base.detail = `${who ? `${who}${place.role ? `, ${place.role},` : ''}` : 'They'} at the table. Going to them yourself is a courtesy: standing in ${sc.name}${rv ? `, and ${rv.shortName}'s opinion of you` : ''}, if it goes well.`;
        if (rv?.war) why = why ?? `At war with ${rv.shortName}: no table here will seat you`;
      }
      base.slot = 'any';
      break;
    }
    case 'deal': {
      if (place.kind === 'family') {
        const price = buyInPrice(v.cityId);
        const c = CITIES_BY_ID[v.cityId];
        base.cost = price;
        base.odds = clamp(0.35 + st / 120 + s.respect / 400 + rop / 300);
        base.title = `Buy in: ${place.name}`;
        base.detail = `A piece of ${c?.owner ?? 'the local'}'s action: ${fmtMoney(price)} down for a partnership (about ${fmtMoney(c?.income ?? 0)} a week). If they say no, 70% comes back.`;
        const o = s.outposts.find((x) => x.city === v.cityId);
        if (o && o.kind !== 'contact') why = why ?? 'You already have a piece of this city';
        if (st < 15) why = why ?? `They don't trust you with their money yet (standing ${st}; 15 needed)`;
        if (rv?.war) why = why ?? `At war with ${rv.shortName}`;
        if (c && needsPermission(c) && !hasPermission(s, v.cityId)) base.warning = 'Outside South Jersey without Philadelphia\'s blessing: they will hear about it.';
        if (v.agenda.some((i) => i.verb === 'deal' && i.placeId === place.id)) why = why ?? 'One buy-in a visit';
      } else if (place.kind === 'politician') {
        base.cost = Math.round(1500 * px);
        base.odds = clamp(0.75 + st / 200);
        base.title = `Buy a friend: ${who ?? place.name}`;
        base.detail = `An envelope for ${who ?? 'him'}${place.role ? ` (${place.role})` : ''}: a favor owed and a friend in ${sc.name}. Politicians talk; the Feds listen.`;
      } else {
        base.gain = Math.round(1600 * px);
        base.odds = clamp(0.8 + st / 300);
        base.title = `Move swag: ${place.name}`;
        base.detail = `${who ?? 'The fence'} takes what your crews took off trucks, at a fair price, far from home: about ${fmtMoney(base.gain)}.`;
      }
      break;
    }
    case 'launder': {
      const cap = Math.round(12000 * px);
      const amt = Math.min(cap, Math.round(s.unwashed));
      base.cost = Math.round(amt * 0.12);
      base.title = `Wash money: ${place.name}`;
      base.detail = `${who ?? 'The manager'} turns shoebox cash into cashier's checks: ${fmtMoney(amt)} of your dirty money washed (up to ${fmtMoney(cap)}), for 12%.`;
      if (s.unwashed < 500) why = why ?? 'Nothing dirty to wash';
      break;
    }
    case 'shop':
      base.cost = Math.round(400 * px);
      base.detail = 'A suit for you, something for the wife and the kids. The family likes to be thought of; a good suit is respect.';
      break;
    case 'recruit':
      base.cost = 300;
      base.odds = clamp(0.7 + st / 200);
      base.slot = 'any';
      base.detail = `${who ? `${who} points` : 'Somebody points'} out a young man with nerve and no prospects. He comes to Wildwood as an associate.`;
      break;
    case 'hideout':
      base.cost = 40;
      base.slot = 'both';
      base.detail = 'A whole day indoors with the shades down. The Feds lose the thread (federal heat −2), you sleep, and the road home is quieter.';
      break;
    case 'night':
      base.cost = Math.round(250 * px);
      base.slot = 'night';
      base.detail = 'A ringside table, the late show and the people who matter in this town at the next table. You come back rested — usually.';
      break;
  }
  if (!why && v.agenda.some((i) => i.verb === verb && i.placeId === place.id && Math.floor(i.day / 7) === s.week)) why = 'Already on this week\'s agenda';
  if (!why && base.cost > 0 && s.money - bookedCost(s, v) < base.cost) why = `Needs ${fmtMoney(base.cost)}`;
  return { ...base, disabledReason: why };
}

/** Money already promised by this week's agenda. */
export function bookedCost(s: GameState, v: Visit): number {
  let total = 0;
  for (const i of v.agenda) {
    if (i.done || Math.floor(i.day / 7) !== s.week) continue;
    const place = sceneOf(v.cityId)?.places.find((p) => p.id === i.placeId);
    if (place) total += verbPreview(s, { ...v, agenda: [] }, place, i.verb).cost;
  }
  return total;
}

/** The days of this week he can still book (in town, from today). */
export function bookableDays(s: GameState, v: Visit): number[] {
  const out: number[] = [];
  const from = Math.max(nowDay(s), v.arriveDay);
  const end = s.week * 7 + 7;
  for (let d = from; d < end; d++) if (v.leaveDay === undefined || d < v.leaveDay) out.push(d);
  return out;
}

function slotsOf(slot: VerbPreview['slot']): VisitSlot[] {
  return slot === 'any' ? ['day', 'night'] : slot === 'both' ? ['day', 'night'] : [slot];
}

function taken(v: Visit, day: number, slot: VisitSlot): boolean {
  return v.agenda.some((i) => i.day === day && (i.slot === slot || i.verb === 'hideout'));
}

/** The first free day and part of the day for a verb (undefined: no room this week). */
export function nextSlot(s: GameState, v: Visit, verb: CityVerb, from?: number): { day: number; slot: VisitSlot } | undefined {
  const sp = verb === 'night' ? 'night' : verb === 'hideout' ? 'both' : verb === 'sitdown' || verb === 'recruit' ? 'any' : 'day';
  for (const day of bookableDays(s, v)) {
    if (from !== undefined && day < from) continue;
    if (sp === 'both') { if (!v.agenda.some((i) => i.day === day)) return { day, slot: 'day' }; continue; }
    for (const slot of slotsOf(sp)) if (!taken(v, day, slot)) return { day, slot };
  }
  return undefined;
}

/** Why this can't go on the agenda (undefined: it can). */
export function bookBlock(s: GameState, item: Pick<VisitItem, 'placeId' | 'verb' | 'day' | 'slot'>): string | undefined {
  const v = currentVisit(s);
  if (!v) return 'You are not away';
  const place = sceneOf(v.cityId)?.places.find((p) => p.id === item.placeId);
  if (!place) return 'No such place';
  const p = verbPreview(s, v, place, item.verb);
  if (p.disabledReason) return p.disabledReason;
  if (!bookableDays(s, v).includes(item.day)) return item.day < v.arriveDay ? 'You are not there yet' : 'Not a day you are in town this week';
  if (!slotsOf(p.slot).includes(item.slot)) return item.slot === 'day' ? 'That is for the evening' : 'That is for the daytime';
  if (taken(v, item.day, item.slot) || (p.slot === 'both' && v.agenda.some((i) => i.day === item.day))) return 'You already have something then';
  return undefined;
}

/** Put a verb on the agenda (pure). The state is unchanged when blocked. */
export function bookVisit(s: GameState, item: Pick<VisitItem, 'placeId' | 'verb' | 'day' | 'slot'>): GameState {
  if (bookBlock(s, item)) return s;
  const id = currentVisit(s)!.id;
  return withTravel(s, (vs) => vs.map((v) => (v.id === id ? { ...v, agenda: [...v.agenda, { ...item }].sort((a, b) => a.day - b.day || (a.slot === 'day' ? -1 : 1)) } : v)));
}

/** Take something off the agenda (not what already happened). */
export function unbookVisit(s: GameState, index: number): GameState {
  const v = currentVisit(s);
  if (!v || !v.agenda[index] || v.agenda[index].done) return s;
  return withTravel(s, (vs) => vs.map((x) => (x.id === v.id ? { ...x, agenda: x.agenda.filter((_, i) => i !== index) } : x)));
}

/** When he would leave if he said "come home" now: after the last thing on the agenda. */
export function comeHomePlan(s: GameState): { leaveDay: number; homeDay: number } | undefined {
  const v = currentVisit(s);
  if (!v) return undefined;
  const now = nowDay(s);
  const last = v.agenda.filter((i) => !i.done).reduce((a, i) => Math.max(a, i.day + 1), 0);
  // Still on the way there: he turns around where he is.
  if (now < v.arriveDay) return { leaveDay: now, homeDay: now + (now - v.departDay) + 1 };
  const leaveDay = Math.max(now, last);
  return { leaveDay, homeDay: leaveDay + visitLegDays(v.cityId, v.mode) };
}

/** Come home (pure): he leaves after the agenda; the road home takes its day. */
export function comeHome(s: GameState): GameState {
  const v = currentVisit(s);
  const plan = comeHomePlan(s);
  if (!v || !plan || v.leaveDay !== undefined) return s;
  return withTravel(s, (vs) => vs.map((x) => {
    if (x.id !== v.id) return x;
    const n: Visit = { ...x, leaveDay: plan.leaveDay, homeDay: plan.homeDay, agenda: x.agenda.filter((i) => i.done || i.day < plan.leaveDay) };
    note(n, nowDay(s), `Packed for home: leaving ${absLabel(s, plan.leaveDay)}, home ${absLabel(s, plan.homeDay)}.`);
    return n;
  }));
}

/** Change his mind: stay after all (only before he has left). */
export function stayOn(s: GameState): GameState {
  const v = currentVisit(s);
  if (!v || v.leaveDay === undefined || nowDay(s) > v.leaveDay || v.legs.includes('back') || nowDay(s) < v.arriveDay) return s;
  return withTravel(s, (vs) => vs.map((x) => (x.id === v.id ? { ...x, leaveDay: undefined, homeDay: undefined } : x)));
}

/** Where the visit stands today. */
export type VisitPhase = 'out' | 'there' | 'back';
export function visitPhase(s: GameState, v: Visit, day = nowDay(s)): VisitPhase {
  if (day < v.arriveDay) return 'out';
  if (v.leaveDay !== undefined && day >= v.leaveDay) return 'back';
  return 'there';
}

/* ---------------------------------------------------------------- */
/* The week: the road, the agenda, home without him                  */
/* ---------------------------------------------------------------- */

function makeVisitCharacter(s: GameState, opts: Parameters<typeof makeCharacter>[1]): Character {
  const tr = ensureTravel(s);
  const main = s.rng;
  s.rng = tr.rng;
  try {
    return makeCharacter(s, opts);
  } finally {
    tr.rng = s.rng;
    s.rng = main;
  }
}

function fx(ctx: Ctx, effects: Effect[], label: string, because: string): void {
  applyEffects(ctx, effects.map((e) => (e.label ? e : { ...e, label })), { label, because, category: 'event' });
}

/** Resolve one thing on the agenda. */
function resolveItem(ctx: Ctx, v: Visit, item: VisitItem): void {
  const s = ctx.s;
  const tr = ensureTravel(s);
  const sc = sceneOf(v.cityId)!;
  const place = sc.places.find((p) => p.id === item.placeId);
  item.done = true;
  if (!place) return;
  const p = verbPreview(s, { ...v, agenda: [] }, place, item.verb);
  const label = `${sc.short}: ${p.title}`;
  const who = contactOf(s, place) ?? 'They';
  const r = rivalOf(s, place);
  const done = (text: string, tone: JournalLine['tone']) => { item.outcome = text; item.tone = tone; note(v, item.day, text, tone); ctx.log.push(`${sc.short}: ${text}`); };
  if (p.disabledReason && p.disabledReason !== 'Already on this week\'s agenda') {
    done(`${p.title} fell through: ${p.disabledReason.toLowerCase()}.`, 'neutral');
    return;
  }
  if (p.cost) { money(ctx, -p.cost, label, 'event'); v.spent += p.cost; }
  const ok = p.odds === undefined || rand(tr) < p.odds;
  const boss = s.playerId;
  switch (item.verb) {
    case 'sitdown':
      if (place.kind === 'commission') {
        if (ok) { fx(ctx, [{ type: 'favor', amount: 1 }, { type: 'heat', bar: 'family', amount: -4 }, { type: 'standing', city: v.cityId, amount: 4 }, { type: 'respect', amount: 2 }], label, `sat down with ${who} in ${sc.name}`); done(`${who} listened, and nodded twice. A favor owed; the word goes back that you are a serious man.`, 'good'); }
        else { fx(ctx, [{ type: 'standing', city: v.cityId, amount: -3 }, { type: 'heat', bar: 'family', amount: 2 }], label, `asked too much of ${who}`); done(`${who} let you talk, paid for dinner, and promised nothing. It was a message.`, 'bad'); }
      } else if (ok) {
        fx(ctx, [{ type: 'standing', city: v.cityId, amount: place.kind === 'family' ? 6 : 5 }, { type: 'respect', amount: 1 }, ...(r ? [{ type: 'rivalOpinion', rival: r.id, amount: 10, reason: 'Came to my table himself' } as Effect] : [])], label, `sat down with ${who} in ${sc.name}`);
        done(`${who} came out from the back to shake your hand. A long lunch; the right things said.`, 'good');
      } else {
        fx(ctx, [{ type: 'standing', city: v.cityId, amount: -2 }, ...(r ? [{ type: 'rivalOpinion', rival: r.id, amount: -5, reason: 'Came around asking questions' } as Effect] : [])], label, `sat down with ${who}, and it went badly`);
        done(`${who} kept you waiting an hour and left after the soup.`, 'bad');
      }
      break;
    case 'deal':
      if (place.kind === 'family') {
        const c = CITIES_BY_ID[v.cityId];
        if (ok && c) {
          s.outposts = s.outposts.filter((o) => o.city !== c.id);
          s.outposts.push({ city: c.id, kind: 'partner', income: c.income, since: s.week });
          fx(ctx, [{ type: 'standing', city: c.id, amount: 10 }, { type: 'respect', amount: 2 }, ...(needsPermission(c) && !hasPermission(s, c.id) ? [{ type: 'rivalOpinion', rival: 'philly', amount: -8, reason: `Went into ${c.name} without asking` } as Effect] : [])], label, `bought into ${c.name}`);
          s.chronicle.push({ week: s.week, date: { ...s.date }, text: `The house bought a piece of ${c.owner}'s action in ${c.name}.`, kind: 'misc' });
          done(`${who} took the envelope and your hand: a partnership in ${c.name}, about ${fmtMoney(c.income)} a week.`, 'good');
        } else {
          const back = Math.round(p.cost * 0.7);
          money(ctx, back, `${label}: they said no (70% back)`, 'event');
          v.spent -= back;
          fx(ctx, [{ type: 'standing', city: v.cityId, amount: -2 }], label, `was turned down in ${sc.name}`);
          done(`${who} counted the money, gave most of it back, and said the time was not right.`, 'bad');
        }
      } else if (place.kind === 'politician') {
        if (ok) {
          fx(ctx, [{ type: 'favor', amount: 1 }, { type: 'standing', city: v.cityId, amount: 3 }], label, `put ${who} on the payroll`);
          if (rand(tr) < 0.2) heat(ctx, 'federal', 1, `${label}: somebody saw the envelope`, 'heat');
          done(`${who} put the envelope in his breast pocket without looking at it. A friend in ${sc.name}.`, 'good');
        } else {
          heat(ctx, 'federal', 2, `${label}: he took it and talked`, 'heat');
          done(`${who} took the money and then told the wrong people about it.`, 'bad');
        }
      } else {
        const got = ok ? Math.round((p.gain ?? 1000) * (0.7 + 0.6 * rand(tr))) : 0;
        if (ok) { money(ctx, got, label, 'event'); v.spent -= got; done(`${who} took the lot: ${fmtMoney(got)}, cash, no receipt.`, 'good'); }
        else { heat(ctx, 'local', 2, `${label}: a bad buyer`, 'heat'); done(`${who} would not touch it: hot, he said, too hot. Somebody saw you carry it in.`, 'bad'); }
        if (rand(tr) < 0.12) heat(ctx, 'federal', 1, `${label}: interstate stolen goods`, 'heat');
      }
      break;
    case 'launder': {
      const cap = Math.round(12000 * priceIdx(v.cityId));
      const amt = Math.min(cap, Math.round(s.unwashed));
      fx(ctx, [{ type: 'unwashed', amount: -amt }], label, `washed money in ${sc.name}`);
      if (rand(tr) < 0.1) { heat(ctx, 'federal', 2, `${label}: the bank filed a currency report`, 'heat'); done(`${fmtMoney(amt)} washed — but a teller filed a currency report.`, 'bad'); }
      else done(`${fmtMoney(amt)} of shoebox cash came back as cashier's checks.`, 'good');
      break;
    }
    case 'shop':
      fx(ctx, [{ type: 'familyOpinion', amount: 3, reason: `Brought something back from ${sc.name}` }, { type: 'respect', amount: 1 }], label, `went shopping in ${sc.name}`);
      addStress(s, boss, -3, 'domestic');
      done(`${place.name}: a suit for you and presents for the family.`, 'good');
      break;
    case 'recruit':
      if (ok) {
        const c = makeVisitCharacter(s, { gender: 'M', age: randInt(tr, 19, 29), rank: 'civilian', faction: 'none' });
        fx(ctx, [{ type: 'recruit', charId: c.id }, { type: 'story', charId: c.id, text: `Came down from ${sc.name}; the boss found him himself.` }], label, `found a recruit in ${sc.name}`);
        done(`${displayName(c)} — ${ageOn(c.birth, s.date)}, quick, nothing to lose — comes back to Wildwood with you.`, 'good');
      } else done('Nobody worth the bus fare. Maybe next time.', 'neutral');
      break;
    case 'hideout':
      heat(ctx, 'federal', -2, `${label}: out of sight`, 'heat');
      addStress(s, boss, -5, 'paranoia');
      v.hid = true;
      done(`A day behind drawn shades: ${lower(place.name)}. Nobody knew where you were. It felt good.`, 'good');
      break;
    case 'night': {
      addStress(s, boss, -6, 'paranoia');
      fx(ctx, [{ type: 'respect', amount: 1 }], label, `had a night on the town in ${sc.name}`);
      const roll = rand(tr);
      if (roll < 0.3) { fx(ctx, [{ type: 'standing', city: v.cityId, amount: 3 }], label, `met the right people in ${sc.name}`); done(`${place.name}: the right table, the right people. Standing in ${sc.name} up.`, 'good'); }
      else if (roll < 0.4) {
        const g = v.party.map((id) => s.characters[id]).find((c) => c?.alive);
        const hurt = randInt(tr, 3, 10);
        fx(ctx, [{ type: 'health', charId: g?.id ?? boss, amount: -hurt }], label, `got into a fight in ${sc.name}`);
        done(`${place.name}: words with a local tough, then fists. ${g ? `${g.firstName} took the worst of it.` : 'You took a punch.'}`, 'bad');
      } else done(`${place.name}: the late show, a bottle sent over, home at four.`, 'neutral');
      if (s.heat.federal > 40 && rand(tr) < 0.15) fx(ctx, [{ type: 'evidence', charId: boss, amount: 1 }], label, 'was photographed out on the town');
      break;
    }
  }
}

function visitEvent(s: GameState, v: Visit, key: string, title: string, text: string, choices: Choice[], actors: string[]): EventInstance {
  return {
    iid: `ev${s.nextId++}`, defId: `visit_${key}`, week: s.week, mandatory: true, priority: 64,
    title: `${sceneOf(v.cityId)?.name ?? '?'}: ${title}`, text, choices, defaultChoiceId: choices[0].id, meta: { visit: v.id }, actors: actors.slice(0, 3),
  };
}

/** The road out or home: a tail, the state police. */
function legRoll(ctx: Ctx, v: Visit, which: 'out' | 'back'): EventInstance | undefined {
  const s = ctx.s;
  const tr = ensureTravel(s);
  const sc = sceneOf(v.cityId)!;
  v.legs.push(which);
  const day = which === 'out' ? v.departDay : v.leaveDay ?? v.departDay;
  const rk = visitRisks(s, v.cityId, v.mode, v.party.length, which === 'back' && v.hid, v.transport);
  const label = `${sc.short}: the road ${which === 'out' ? 'up' : 'home'}`;
  const drv = v.party.map((id) => s.characters[id]).find((c) => c?.alive);
  if (rand(tr) < rk.tail) {
    v.tailed = true;
    tr.stats.tails++;
    note(v, day, which === 'out' ? 'A gray Ford picked you up at the causeway and stayed three cars back.' : 'The same gray Ford, three cars back, all the way home.', 'bad');
    return visitEvent(s, v, 'tail', 'A tail', `On the way ${which === 'out' ? `to ${sc.name}` : 'home'}, ${v.mode === 'cars' ? 'the same gray Ford has been three cars back since the causeway' : 'the same man in a brown hat has been in your car since the station'}. The Bureau, or somebody who wants to know where you go.`, [
      { id: 'lose', label: 'Lose him', detail: drv ? `${drv.firstName} knows the back roads.` : 'Side streets, a hotel lobby with two doors.', because: 'lost a tail', effects: [{ type: 'evidence', charId: s.playerId, amount: drv ? 0 : 1, label }] },
      { id: 'wave', label: 'Wave at him', detail: 'Let him know you know. They hate that.', because: 'waved at the tail', effects: [{ type: 'heat', bar: 'federal', amount: 2, label }, { type: 'respect', amount: 1, label }] },
      { id: 'carry', label: 'Carry on as if nothing', detail: `He sees every door you walk into in ${sc.name}.`, because: 'let the tail follow', effects: [{ type: 'evidence', charId: s.playerId, amount: 2, label }, { type: 'standing', city: v.cityId, amount: -3, label: `${label}: you brought the FBI to their door` }] },
    ], [s.playerId, ...(drv ? [drv.id] : [])]);
  }
  if (rand(tr) < rk.stop) {
    note(v, day, 'Red lights on the Parkway: a state trooper wants to see the license, the registration, and the trunk.', 'bad');
    return visitEvent(s, v, 'stop', 'Pulled over', `A New Jersey state trooper, ${v.party.length ? 'a Cadillac full of men in good coats' : 'a Cadillac with a man in a good coat'}, and a long look at the license. "Mind opening the trunk, Mr. ${player(s).lastName}?"`, [
      { id: 'fold', label: 'Fold a fifty into the license', detail: 'Most of them take it. The ones who don\'t remember it.', because: 'paid off a trooper', effects: [{ type: 'money', amount: -50, label }, { type: 'heat', bar: 'local', amount: 1, label }] },
      { id: 'polite', label: '"Yes, officer."', detail: 'Open the trunk, smile, wait. He writes down every name in the car.', because: 'let the trooper look', effects: [{ type: 'evidence', charId: s.playerId, amount: 1, label }] },
      { id: 'lean', label: 'Ask for his badge number', detail: 'A call to a friend in Trenton. He will not forget your face.', because: 'leaned on a state trooper', effects: [{ type: 'respect', amount: 1, label }, { type: 'heat', bar: 'local', amount: 4, label }] },
    ], [s.playerId, ...(drv ? [drv.id] : [])]);
  }
  note(v, day, which === 'out' ? `Arrived in ${sc.name}. ${sc.hotel[0].toUpperCase()}${sc.hotel.slice(1)}.` : 'An easy road home.', 'neutral');
  return undefined;
}

/** An ambush out of town, where nobody owes you anything. */
function ambush(ctx: Ctx, v: Visit, day: number): EventInstance {
  const s = ctx.s;
  const tr = ensureTravel(s);
  const sc = sceneOf(v.cityId)!;
  const rv = cityRival(sc);
  const r = rv ? s.rivals.find((x) => x.id === rv) : undefined;
  const g = v.party.map((id) => s.characters[id]).find((c) => c?.alive);
  const victim = g && rand(tr) < 0.6 ? g : player(s);
  const hurt = randInt(tr, 8, 25);
  const label = `${sc.short}: an ambush`;
  fx(ctx, [{ type: 'health', charId: victim.id, amount: -hurt }], label, `was ambushed in ${sc.name}`);
  const text = `Coming out of the hotel garage: a car with no lights, two men, a pipe and a pistol that jammed. ${victim.id === s.playerId ? `You took a beating (health −${hurt}) before ${g ? g.firstName : 'the doorman'} got them off you.` : `${victim.firstName} took it for you (health −${hurt}).`}`;
  note(v, day, text, 'bad');
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${displayName(player(s))} was jumped in ${sc.name}.`, kind: 'misc' });
  return visitEvent(s, v, 'ambush', 'Jumped', `${text} ${r ? `Nobody says the name ${r.shortName}. Nobody has to.` : 'Nobody in this town will say who sent them.'}`, [
    { id: 'remember', label: 'Remember it', detail: r ? `${r.shortName} will hear that you know.` : 'You will find out who.', because: `swore to remember ${sc.name}`, effects: [{ type: 'respect', amount: 1, label }, ...(r ? [{ type: 'rivalOpinion', rival: r.id, amount: -10, reason: 'He thinks we jumped him', label } as Effect] : [])] },
    { id: 'swallow', label: 'Swallow it', detail: 'Not your town. Let it go; they notice the restraint.', because: 'let an ambush go', effects: [{ type: 'respect', amount: -2, label }, { type: 'standing', city: v.cityId, amount: 3, label }] },
    { id: 'home', label: 'Go home. Now.', detail: 'Pack tonight; what is left on the agenda is off.', because: `cut short the visit to ${sc.name}`, effects: [{ type: 'travel', op: { op: 'visitHome' }, label }] },
  ], [victim.id, ...(rv && r ? [r.leaderId] : [])]);
}

/** Home without the boss: a rival leans on a district. */
function homeExposed(ctx: Ctx, v: Visit): void {
  const s = ctx.s;
  const tr = ensureTravel(s);
  const acting = actingBoss(s);
  if (rand(tr) >= (acting ? 0.2 : 0.35)) return;
  const options: { d: string; r: RivalId }[] = [];
  for (const d of s.districts) {
    if ((d.influence.player ?? 0) < 5) continue;
    for (const r of s.rivals) if (r.kind === 'mob' && (d.influence[r.id] ?? 0) > 0 && s.characters[r.leaderId]?.alive) options.push({ d: d.id, r: r.id });
  }
  if (!options.length) return;
  const pick = options[Math.floor(rand(tr) * options.length)];
  const d = s.districts.find((x) => x.id === pick.d)!;
  const r = s.rivals.find((x) => x.id === pick.r)!;
  const lost = -shiftInfluence(s, d.id, 'player', -3);
  shiftInfluence(s, d.id, r.id, lost);
  const text = `While you were in ${shortName(v.cityId)}, ${r.shortName}'s people leaned on ${d.name} (your influence −${lost}).`;
  ctx.log.push(text);
  note(v, s.week * 7 + 6, text, 'bad');
  s.chronicle.push({ week: s.week, date: { ...s.date }, text, kind: 'misc' });
}

function finishVisit(ctx: Ctx, v: Visit): void {
  const s = ctx.s;
  const tr = ensureTravel(s);
  v.over = true;
  const sc = sceneOf(v.cityId);
  note(v, v.homeDay ?? s.week * 7, 'Home in Wildwood.');
  tr.stats.trips++;
  tr.stats.business++;
  const highlights = v.journal.filter((j) => j.tone === 'good' || j.tone === 'bad').slice(-3).map((j) => j.text);
  tr.history.push({ week: s.week, destId: v.cityId, mode: v.mode, purpose: 'business', leaderId: s.playerId, party: [...v.party], cost: Math.max(0, v.spent), highlights });
  if (tr.history.length > 20) tr.history = tr.history.slice(-20);
  const text = `${displayName(player(s))} came home from ${sc?.name ?? v.cityId}.`;
  s.chronicle.push({ week: s.week, date: { ...s.date }, text, kind: 'family' });
  ctx.log.push(text);
}

/**
 * The boss's visits, one week (travel.ts's travelWeek calls it): the road,
 * the days in town and their agenda, the hotel bill, an ambush, home
 * without him, and the road home. Returns the popups it raises.
 */
export function visitWeek(ctx: Ctx): EventInstance[] {
  const s = ctx.s;
  const tr = s.travel;
  if (!tr?.visits?.length) return [];
  const out: EventInstance[] = [];
  const w0 = s.week * 7;
  const w1 = w0 + 7;
  for (const v of tr.visits) {
    if (v.over) continue;
    const boss = player(s);
    if (!boss?.alive || !isFree(s, boss) || fugitiveOf(s, boss.id)) {
      v.over = true;
      note(v, w0, 'The visit ended without him.');
      continue;
    }
    if (v.departDay >= w1) continue;
    const sc = sceneOf(v.cityId);
    if (!sc) { v.over = true; continue; }
    if (!v.legs.includes('out')) {
      const cost = visitFare(v.cityId, v.mode, v.party.length, v.transport);
      money(ctx, -cost, `${sc.short}: the road (${MODES[v.mode].name.toLowerCase()}, round trip)`, 'event');
      v.spent += cost;
      const ev = legRoll(ctx, v, 'out');
      if (ev) out.push(ev);
    }
    // The agenda, in day order.
    for (const item of v.agenda) {
      if (item.done || item.day >= w1) continue;
      if (v.leaveDay !== undefined && item.day >= v.leaveDay) { item.done = true; item.outcome = 'Left before it.'; continue; }
      resolveItem(ctx, v, item);
      if (s.gameOver) return out;
    }
    if (!v.weeksDone.includes(s.week)) {
      v.weeksDone.push(s.week);
      // Nights in town this week, and the hotel.
      const from = Math.max(w0, v.arriveDay);
      const to = Math.min(w1, v.leaveDay ?? w1);
      const nights = Math.max(0, to - from);
      if (nights) {
        const bill = nights * sc.nightly * (1 + v.party.length * 0.5);
        money(ctx, -Math.round(bill), `${sc.short}: ${sc.hotel}, ${nights} night${nights > 1 ? 's' : ''}`, 'event');
        v.spent += Math.round(bill);
        const rk = visitRisks(s, v.cityId, v.mode, v.party.length, v.hid, v.transport);
        if (rand(tr) < rk.ambush * Math.min(1, nights / 3)) out.unshift(ambush(ctx, v, from + Math.floor(rand(tr) * nights)));
      }
      homeExposed(ctx, v);
    }
    if (v.leaveDay !== undefined && v.leaveDay < w1 && !v.legs.includes('back')) {
      const ev = legRoll(ctx, v, 'back');
      if (ev) out.push(ev);
    }
    if (v.homeDay !== undefined && v.homeDay <= w1 && v.legs.includes('back')) finishVisit(ctx, v);
  }
  if (tr.visits.length > 6) tr.visits = tr.visits.filter((v) => !v.over || (v.homeDay ?? 0) > w0 - 28);
  return out;
}

/** The "Go home now" choice after an ambush: leave the day the week starts. */
export function cutVisitShort(s: GameState): void {
  const v = s.travel?.visits?.find((x) => !x.over && x.leaveDay === undefined);
  if (!v) return;
  const now = Math.max(nowDay(s), v.arriveDay);
  v.leaveDay = now;
  v.homeDay = now + visitLegDays(v.cityId, v.mode);
  v.agenda = v.agenda.filter((i) => i.done || i.day < now);
  note(v, now, 'Packed in the night and drove home.', 'bad');
}
