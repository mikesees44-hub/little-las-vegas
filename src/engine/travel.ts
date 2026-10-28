import { pocketPrice } from './pocket';
import type { ActionPreview } from './actions';
import { guestGroup } from './activities';
import { addDays, ageOn, dateOfWeek, formatDate, isInSeason, monthName } from './calendar';
import { crew, displayName, hasTrait, isFree, makeCharacter, player } from './characters';
import { holder } from './council';
import { chooseHeir } from './dynasty';
import { applyEffects, fmtMoney, shiftInfluence } from './effects';
import { addStress } from './familyStress';
import { addStory } from './hierarchy';
import type { Acceptance, Reason } from './interactions';
import { heat, money, type Ctx } from './ledger';
import { addOpinion, changeMeter, opinion } from './relations';
import { rand, randInt, weightedPick } from './rng';
import { addSecret } from './secrets';
import {
  buildAftermath, coverOdds, destOf, journal, partyOf, resolveDay, T, tripDiscoveryChance, tripEvent, tripLabel,
} from './trips';
import {
  DESTS, ENTERTAINERS, havanaOpen, legDays, MODE_IDS, MODES, modeBlock, RESORT_IDS, TIER_INFO, type Dest,
} from './travelDests';
import {
  bossAway, bossFugitive, currentVisit, ensureTravel, messengerDelay, messengerPenalty, fugitiveOf, isAway, liveTrips, loversOf, today, tripOf,
  type TravelAction, type TravelOp, type Trip, type TripPlan,
} from './travelState';
import {
  ferryOpen, legHours, manifestChance, optFare, optLegDays, resolveTransport, roadOf, transportBlock, transportRisks, type TransportOpt,
} from './transport';
import { commitFugitive, describeFugitiveOp, fugitiveWeek, onLamLeg, previewFugitive, applyFugitiveOp } from './fugitive';
import type { Character, Effect, EventInstance, GameState, PlayerAction } from './types';
import { cutVisitShort, visitWeek } from './visit';
import { resolveVacDay } from './vacation';
import { shortName } from './visitData';

/**
 * Travel and trips: planning (destination, mode, budget, dates, guests,
 * itinerary), the journey (legs that take real days, with tails, accidents,
 * airport sightings and chance meetings), the stay (trips.ts), and the boss
 * being away (capos act up, orders go through the chain, the underboss or
 * heir runs things). Flight from prosecution is in fugitive.ts.
 */

export const MAX_GUESTS = 8;
export const FAR = 1e9;

/* ---------------------------------------------------------------- */
/* Who can go                                                        */
/* ---------------------------------------------------------------- */

export function isOurs(s: GameState, c: Character): boolean {
  return c.id === s.playerId || c.dynasty || (c.faction === 'player' && c.rank !== 'civilian');
}

/** Why this man can't lead a trip right now (undefined = he can). */
export function leaderBlock(s: GameState, id: string): string | undefined {
  const c = s.characters[id];
  if (!c?.alive) return 'Not among the living';
  if (!isOurs(s, c)) return 'Not one of yours to send';
  if (!isFree(s, c)) return 'Behind bars';
  if (ageOn(c.birth, s.date) < 16) return 'Too young to travel alone';
  if (fugitiveOf(s, id)) return 'On the lam';
  if (tripOf(s, id)) return 'Already travelling';
  const v = currentVisit(s);
  if (v && (id === s.playerId || v.party.includes(id))) return id === s.playerId ? `Away in ${shortName(v.cityId)} (come home first)` : 'Away with the boss';
  if (id === s.playerId) {
    const l = s.legal;
    if (l && l.personId === id && (l.stage === 'indicted' || (l.stage === 'trial' && l.bail))) return 'The court has his passport (leaving now means jumping bail — see The Law)';
    if (l && l.personId === id && l.stage === 'parole') return 'On parole: he can\'t leave the state';
  }
  return undefined;
}

export function canTravel(s: GameState, id: string): boolean {
  return !leaderBlock(s, id);
}

function freeToGo(s: GameState, c: Character): boolean {
  return c.alive && isFree(s, c) && !tripOf(s, c.id) && !fugitiveOf(s, c.id) && (c.busyUntil ?? 0) <= s.week;
}

/** Everyone who could be invited on a trip led by `leaderId`. */
export function guestPool(s: GameState, leaderId: string): Character[] {
  const leader = s.characters[leaderId];
  const lovers = new Set(leader ? loversOf(s, leaderId) : []);
  return Object.values(s.characters).filter((c) => {
    if (c.id === leaderId || !freeToGo(s, c) || lovers.has(c.id)) return false;
    if (c.dynasty) return true;
    if (c.faction === 'player' && c.rank !== 'civilian') return true;
    if (c.faction === 'law' && !c.office) return false;
    if (ageOn(c.birth, s.date) < 18) return false;
    return !!guestGroup(s, c);
  });
}

export function companionPool(s: GameState, leaderId: string): Character[] {
  return loversOf(s, leaderId).map((id) => s.characters[id]).filter((c) => c && freeToGo(s, c));
}

export function driverPool(s: GameState, leaderId: string): Character[] {
  const wheel = (c: Character) => c.craft === 'driver' || c.specialty === 'wheelman';
  return crew(s).filter((c) => c.id !== leaderId && freeToGo(s, c) && ((c.rank === 'soldier' || c.rank === 'associate') && !c.specialty || c.specialty === 'wheelman'))
    .sort((a, b) => Number(wheel(b)) - Number(wheel(a)));
}

/* ---------------------------------------------------------------- */
/* The quote                                                         */
/* ---------------------------------------------------------------- */

export interface CostLine { label: string; amount: number }

export interface TripQuote {
  dest?: Dest;
  out: number;
  stay: number;
  back: number;
  totalDays: number;
  weeks: number;
  departWeek: number;
  arriveDate: string;
  people: number;
  lines: CostLine[];
  cost: number;
  season: 'peak' | 'off' | 'none';
  risks: { accident: number; tail: number; sighting: number; discovery: number; stop: number; weather: number; manifest: number };
  comfort: number;
  relief: number;
  /** The way they go (transport.ts) and its door-to-door hours one way. */
  transport?: TransportOpt;
  hours: number;
  block?: string;
}

/** Crew who come along as bodyguards (not family, not drivers). */
function crewGuests(s: GameState, guests: string[]): number {
  return guests.filter((id) => { const c = s.characters[id]; return c && !c.dynasty && c.faction === 'player' && c.rank !== 'civilian'; }).length;
}

/** A convoy of crew cars (each with a crew driver); the Caddy and the hired car are one car and need none. */
export function isConvoy(o: TransportOpt): boolean {
  return o.id === 'crewcar';
}

export function dayDate(day: number) {
  return addDays(dateOfWeek(Math.floor(day / 7)), day % 7);
}

function seasonOf(d: Dest, month: number): 'peak' | 'off' | 'none' {
  if (!d.peak.length) return 'none';
  return d.peak.includes(month) ? 'peak' : 'off';
}

/** Cost, time and risk of a planned trip (pure). */
export function quoteTrip(s: GameState, plan: TripPlan): TripQuote {
  const d = DESTS[plan.destId];
  const empty: TripQuote = { out: 0, stay: 0, back: 0, totalDays: 0, weeks: 0, departWeek: s.week, arriveDate: '', people: 0, lines: [], cost: 0, season: 'none', risks: { accident: 0, tail: 0, sighting: 0, discovery: 0, stop: 0, weather: 0, manifest: 0 }, comfort: 0, relief: 0, hours: 0 };
  if (!d) return { ...empty, block: 'Pick a destination' };
  const o = resolveTransport(plan.mode, plan.tier, d, plan.transport);
  const tier = TIER_INFO[plan.tier];
  const departWeek = s.week + Math.max(0, Math.min(26, plan.departIn ?? 0));
  const out = optLegDays(o, d);
  const stay = plan.days.length;
  const departDay = departWeek * 7;
  const arrive = dayDate(departDay + out);
  const season = seasonOf(d, arrive.m);
  const sMult = season === 'peak' ? 1.3 : season === 'off' ? 0.85 : 1;
  const convoy = plan.mode === 'cars' && isConvoy(o);
  const cars = plan.mode === 'cars' ? (convoy ? Math.max(1, Math.min(4, plan.cars ?? 1)) : 1) : 0;
  const travellers = 1 + plan.guests.length + (plan.companionId || plan.newCompanion ? 1 : 0);
  const people = travellers + (convoy ? (plan.driverIds?.length ?? 0) : 0);
  const lines: CostLine[] = [];
  if (plan.mode === 'cars') {
    const what = o.id === 'caddy' ? 'gas and tolls, you at the wheel' : o.id === 'chauffeur' ? 'the livery: car, driver and his meals' : 'gas, tires and the drivers\' pay';
    lines.push({ label: `${convoy ? `${cars} car${cars > 1 ? 's' : ''}` : o.name}: ${what} (${roadOf(d).toLocaleString('en-US')} road miles each way)`, amount: 2 * cars * optFare(o, d, plan.tier) });
    const roadNights = Math.max(0, out - 1) * 2;
    if (roadNights) lines.push({ label: `Motels on the road (${roadNights} nights)`, amount: Math.round(roadNights * people * tier.hotel * 0.5) });
  } else {
    lines.push({ label: `${o.mode === 'plane' || o.mode === 'ship' ? o.name : `${MODES[o.mode].name} (${o.name.toLowerCase()})`} fares, round trip (${travellers} × ${fmtMoney(2 * optFare(o, d, plan.tier))})`, amount: travellers * 2 * optFare(o, d, plan.tier) });
  }
  const rooms = travellers + (plan.discreet && (plan.companionId || plan.newCompanion) ? 1 : 0);
  if (stay) lines.push({ label: `${d.hotels[plan.tier === 'modest' ? 0 : plan.tier === 'first' ? 1 : 2]}, ${stay} night${stay > 1 ? 's' : ''}${season === 'peak' ? ' (high season)' : season === 'off' ? ' (off season)' : ''}`, amount: Math.round(stay * rooms * tier.hotel * d.price * sMult) });
  const actCost = plan.days.reduce((a, id) => a + (d.activities.find((x) => x.id === id)?.cost ?? 0), 0);
  if (actCost) lines.push({ label: 'The itinerary (shows, tables, charters, dinners)', amount: Math.round(actCost * travellers * tier.mult) });
  if (plan.entertainer) lines.push({ label: ENTERTAINERS[plan.entertainer].name, amount: Math.round(ENTERTAINERS[plan.entertainer].fee * (plan.tier === 'lavish' ? 2 : plan.tier === 'first' ? 1.4 : 1)) });
  const cost = lines.reduce((a, l) => a + l.amount, 0);
  const totalDays = out + stay + out;
  const fed = s.heat.federal;
  const legs = 2;
  const leader = s.characters[plan.leaderId];
  const evid = leader?.evidence ?? 0;
  const leg = transportRisks(o, d, arrive.m, fed, s.heat.local, evid, cars, crewGuests(s, plan.guests));
  const both = (p: number) => 1 - (1 - p) ** legs;
  const risks = {
    accident: both(leg.accident),
    tail: both(leg.tail),
    sighting: both(leg.seen),
    stop: plan.transport ? both(leg.stop) : 0,
    weather: plan.transport ? both(leg.weather) : 0,
    manifest: plan.transport ? both(manifestChance(o, fed)) : 0,
    discovery: plan.companionId || plan.newCompanion ? tripDiscoveryChance(s, { leaderId: plan.leaderId, party: [...plan.guests, plan.companionId ?? 'new'], companionId: plan.companionId ?? (plan.newCompanion ? 'new' : undefined), discreet: plan.discreet, tier: plan.tier, discovered: false, days: plan.days, destId: plan.destId }) : 0,
  };
  if (plan.newCompanion && !plan.companionId) {
    // A new friend is a lover once she says yes: estimate as if she were one.
    const L = s.characters[plan.leaderId];
    const spouseOn = !!L?.spouseId && plan.guests.includes(L.spouseId);
    risks.discovery = 1 - (1 - (spouseOn ? 0.2 : L?.spouseId ? 0.015 : 0) * (plan.discreet ? 0.5 : 1)) ** Math.max(1, stay);
  }
  risks.discovery = Math.min(0.95, risks.discovery * o.discovery);
  const relief = plan.purpose === 'vacation' ? Math.round((tier.relief + stay * 3) * (0.7 + 0.3 * o.comfort)) : Math.round(stay * 2 * o.comfort);
  const q: TripQuote = {
    dest: d, out, stay, back: out, totalDays, weeks: Math.ceil(totalDays / 7), departWeek, arriveDate: formatDate(arrive), people, lines, cost, season, risks, comfort: o.comfort, relief,
    transport: o, hours: legHours(o, d),
  };
  q.block = planBlock(s, plan, q);
  return q;
}

function planBlock(s: GameState, plan: TripPlan, q: TripQuote): string | undefined {
  const d = q.dest!;
  const lb = leaderBlock(s, plan.leaderId);
  if (lb) return lb;
  if (d.id === 'havana' && !havanaOpen(dayDate(q.departWeek * 7))) return 'Havana is closed to Americans since January 1961';
  const mb = modeBlock(d, plan.mode);
  if (mb) return mb;
  const o = q.transport ?? resolveTransport(plan.mode, plan.tier, d, plan.transport);
  const tb = transportBlock(o.id, d, dayDate(q.departWeek * 7));
  if (tb) return tb;
  if (o.seats && q.people > o.seats) return `${o.name}: ${o.seats} seats, and the party is ${q.people}`;
  if (!isConvoy(o) && crewGuests(s, plan.guests) > o.guards) return `${o.name}: at most ${o.guards} bodyguard${o.guards === 1 ? '' : 's'} along`;
  if (plan.purpose === 'vacation' && (plan.days.length < 3 || plan.days.length > 5)) return 'A vacation is 3 to 5 days: plan each day';
  if (plan.purpose === 'business' && (plan.days.length < 1 || plan.days.length > 3)) return 'A business trip is 1 to 3 days';
  const month = dayDate(q.departWeek * 7 + q.out).m;
  for (const id of plan.days) {
    const a = d.activities.find((x) => x.id === id);
    if (!a) return 'Something on the itinerary is not offered there';
    if (a.months && !a.months.includes(month)) return `${a.name}: not in ${monthName(month)}`;
  }
  if (plan.guests.length > MAX_GUESTS) return `At most ${MAX_GUESTS} guests`;
  if (new Set(plan.guests).size !== plan.guests.length) return 'Someone is on the list twice';
  const pool = new Set(guestPool(s, plan.leaderId).map((c) => c.id));
  if (plan.guests.some((g) => !pool.has(g))) return 'Someone on the list can\'t come';
  if (plan.companionId && !companionPool(s, plan.leaderId).some((c) => c.id === plan.companionId)) return 'The companion can\'t come';
  if (plan.mode === 'cars' && isConvoy(o)) {
    const cars = plan.cars ?? 1;
    if (cars < 1 || cars > 4) return 'A convoy is 1 to 4 cars';
    const drivers = plan.driverIds ?? [];
    if (drivers.length !== cars) return `${cars} car${cars > 1 ? 's need' : ' needs'} ${cars} driver${cars > 1 ? 's' : ''} from the crew`;
    const dp = new Set(driverPool(s, plan.leaderId).map((c) => c.id));
    if (drivers.some((x) => !dp.has(x) || plan.guests.includes(x))) return 'A driver can\'t come';
    if (q.people > cars * 4) return `${q.people} people don't fit in ${cars} car${cars > 1 ? 's' : ''}`;
  }
  // A vacation is the boss's own: his pocket pays, the Family covers what it cannot.
  if (q.cost > s.money + (plan.purpose === 'business' ? 0 : Math.max(0, s.tribute?.acct.personal ?? 0))) return `Needs ${fmtMoney(q.cost)}`;
  return undefined;
}

/** Will they come? CK-style odds with the reasons. */
export function guestOdds(s: GameState, plan: Pick<TripPlan, 'leaderId' | 'tier' | 'purpose' | 'guests'>, id: string): Acceptance {
  const c = s.characters[id];
  const L = s.characters[plan.leaderId];
  if (!c || !L) return { chance: 0, reasons: [] };
  if (c.dynasty && ageOn(c.birth, s.date) < 16) return { chance: 1, reasons: [{ label: 'A child goes where the family goes', value: 100 }] };
  const reasons: Reason[] = [];
  const op = opinion(s, id, L.id);
  const ours = c.dynasty || c.faction === 'player';
  reasons.push({ label: 'Base', value: c.id === L.spouseId ? 85 : ours ? 60 : 30 });
  if (op) reasons.push({ label: op >= 0 ? `Likes ${L.firstName}` : `Dislikes ${L.firstName}`, value: Math.round(op / 2) });
  if (plan.tier === 'lavish') reasons.push({ label: 'A lavish trip', value: ours ? 10 : 15 });
  if (plan.tier === 'modest' && !ours) reasons.push({ label: 'A modest trip', value: -10 });
  if (!ours && plan.purpose === 'business') reasons.push({ label: 'Business to be done', value: 10 });
  if (c.id === L.spouseId && plan.guests.some((g) => loversOf(s, L.id).includes(g))) reasons.push({ label: 'Senses something', value: -20 });
  if (hasTrait(c, 'Greedy') && plan.tier !== 'modest') reasons.push({ label: 'Greedy: a free trip', value: 10 });
  if (hasTrait(c, 'Paranoid') && !ours) reasons.push({ label: 'Paranoid: a trap?', value: -20 });
  if (s.wars.some((w) => s.rivals.find((r) => r.id === w.rival)?.leaderId === id || (s.rivals.find((r) => r.id === w.rival)?.id === c.faction))) reasons.push({ label: 'At war with you', value: -50 });
  const sum = reasons.reduce((a, r) => a + r.value, 0);
  return { chance: Math.max(0.05, Math.min(0.98, sum / 100)), reasons };
}

export function newCompanionOdds(s: GameState, plan: Pick<TripPlan, 'leaderId' | 'tier'>): Acceptance {
  const L = s.characters[plan.leaderId];
  const reasons: Reason[] = [{ label: 'Base', value: 50 }];
  if (L && hasTrait(L, 'Charming')) reasons.push({ label: 'Charming', value: 15 });
  if (L && hasTrait(L, 'Womanizer')) reasons.push({ label: 'Has a way with people', value: 10 });
  if (plan.tier === 'lavish') reasons.push({ label: 'A lavish trip', value: 15 });
  if (plan.tier === 'modest') reasons.push({ label: 'A modest trip', value: -15 });
  if (L?.spouseId) reasons.push({ label: 'He is married', value: -10 });
  const sum = reasons.reduce((a, r) => a + r.value, 0);
  return { chance: Math.max(0.05, Math.min(0.95, sum / 100)), reasons };
}

/* ---------------------------------------------------------------- */
/* Orders                                                            */
/* ---------------------------------------------------------------- */

function verb(s: GameState, plan: TripPlan): string {
  const L = s.characters[plan.leaderId];
  const d = DESTS[plan.destId];
  const who = plan.leaderId === s.playerId ? 'took' : `sent ${L?.firstName ?? 'a man'}`;
  const fam = L?.spouseId && plan.guests.includes(L.spouseId);
  return plan.purpose === 'business' ? `${who} to ${d?.name ?? '?'} on business` : `${who} ${fam ? (plan.leaderId === s.playerId ? 'the family' : 'his family') : 'a party'} to ${d?.name ?? '?'}`;
}

export function previewTravel(s: GameState, a: TravelAction): ActionPreview {
  switch (a.type) {
    case 'trip': {
      const q = quoteTrip(s, a.plan);
      const d = DESTS[a.plan.destId];
      const L = s.characters[a.plan.leaderId];
      const label = `${a.plan.purpose === 'business' ? 'Business trip' : 'Vacation'}: ${d?.name ?? '?'} (${MODES[a.plan.mode].name.toLowerCase()}, ${TIER_INFO[a.plan.tier].name.toLowerCase()})`;
      const risks = [
        q.risks.sighting >= 0.01 ? `${Math.round(q.risks.sighting * 100)}% seen by the Feds` : '',
        q.risks.tail >= 0.01 ? `${Math.round(q.risks.tail * 100)}% tailed` : '',
        q.risks.accident >= 0.01 ? `${Math.round(q.risks.accident * 100)}% accident` : '',
        q.risks.discovery >= 0.01 ? `${Math.round(q.risks.discovery * 100)}% the wife finds out` : '',
      ].filter(Boolean);
      return {
        title: label,
        detail: `${L ? displayName(L) : '?'}${a.plan.guests.length ? ` and ${a.plan.guests.length} guest${a.plan.guests.length > 1 ? 's' : ''}` : ''}. ${q.out} day${q.out > 1 ? 's' : ''} each way, ${q.stay} there; arrives ${q.arriveDate}.${a.plan.leaderId === s.playerId ? ' While he is gone the underboss runs things and the capos get ideas.' : ''}`,
        effects: a.plan.purpose === 'business' ? [{ type: 'money', amount: -q.cost, label }] : pocketPrice(s, q.cost, label).effects,
        cost: q.cost,
        pot: a.plan.purpose === 'business' ? undefined : 'pocket',
        because: verb(s, a.plan),
        disabledReason: q.block,
        warning: risks.length ? risks.join(' · ') : undefined,
        category: 'event',
      };
    }
    case 'cancel': {
      const t = s.travel?.trips.find((x) => x.id === a.tripId);
      const refund = t ? Math.round(t.cost * 0.8) : 0;
      return {
        title: `Cancel the trip to ${t ? destOf(t).name : '?'}`, effects: t ? [{ type: 'money', amount: refund, label: 'Trip cancelled: 80% back' }] : [], cost: 0, because: 'cancelled a trip', category: 'event',
        disabledReason: !t || t.over ? 'No such trip' : t.departDay <= today(s) ? 'Already gone' : undefined,
      };
    }
    case 'recall': {
      const t = s.travel?.trips.find((x) => x.id === a.tripId);
      return {
        title: `Call ${t ? s.characters[t.leaderId]?.firstName ?? 'them' : 'them'} home early`, detail: 'The rest of the itinerary is lost; nothing is refunded.', effects: [], cost: 0, because: 'cut a trip short', category: 'event',
        disabledReason: !t || t.over || t.purpose === 'lam' ? 'No such trip' : t.departDay > today(s) ? 'Not gone yet (cancel instead)' : today(s) >= t.leaveDay ? 'Already on the way home' : undefined,
      };
    }
    default:
      return previewFugitive(s, a);
  }
}

export function commitTravel(ctx: Ctx, a: TravelAction): void {
  if (a.type === 'trip') startTrip(ctx, a.plan);
  else if (a.type === 'cancel') {
    const t = ctx.s.travel?.trips.find((x) => x.id === a.tripId);
    if (t) {
      t.over = true;
      for (const c of partyOf(ctx.s, t)) if (c.id !== ctx.s.playerId) c.busyUntil = undefined;
    }
  } else if (a.type === 'recall') {
    const t = ctx.s.travel?.trips.find((x) => x.id === a.tripId);
    if (t) {
      cutTrip(ctx.s, t);
      journal(ctx.s, t, 'Called home early.', 'neutral');
    }
  } else commitFugitive(ctx, a);
}

function cutTrip(s: GameState, t: Trip): void {
  const now = Math.max(t.arriveDay, today(s));
  if (now >= t.leaveDay) return;
  const back = t.homeDay - t.leaveDay;
  t.leaveDay = now;
  t.homeDay = now + back;
  t.days = t.days.slice(0, Math.max(0, Math.min(t.days.length, now - t.arriveDay)));
}

/** Run character creation on the travel stream. */
function makeTravelCharacter(s: GameState, opts: Parameters<typeof makeCharacter>[1]): Character {
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

/** Engine-side: book the trip, roll the invitations, refund who said no. */
export function startTrip(ctx: Ctx, plan: TripPlan): Trip | undefined {
  const s = ctx.s;
  const tr = ensureTravel(s);
  const d = DESTS[plan.destId];
  const L = s.characters[plan.leaderId];
  if (!d || !L) return undefined;
  const quoted = quoteTrip(s, plan);
  const declined: string[] = [];
  const guests = plan.guests.filter((g) => {
    const ok = rand(tr) < guestOdds(s, plan, g).chance;
    if (!ok) declined.push(g);
    return ok;
  });
  let companionId = plan.companionId;
  if (!companionId && plan.newCompanion) {
    if (rand(tr) < newCompanionOdds(s, plan).chance) {
      const f = makeTravelCharacter(s, { gender: L.gender === 'M' ? 'F' : 'M', age: randInt(tr, 22, 34), rank: 'civilian', faction: 'none', nickname: false });
      tr.friends[L.id] = [...(tr.friends[L.id] ?? []), f.id];
      addOpinion(s, f.id, L.id, 'Swept me off to ' + d.name, 20, 1);
      companionId = f.id;
      ctx.log.push(`${f.firstName} ${f.lastName}, ${f.gender === 'F' ? 'a singer' : 'a bandleader'} from the 500 Club, said yes to ${d.name}.`);
    } else ctx.log.push(`The ${L.gender === 'M' ? 'lady' : 'gentleman'} from the 500 Club said no to ${d.name}. Politely.`);
  }
  const final: TripPlan = { ...plan, guests, companionId, newCompanion: false };
  const q = quoteTrip(s, final);
  const refund = quoted.cost - q.cost;
  if (refund > 0) money(ctx, refund, `${tripLabel({ destId: d.id, purpose: plan.purpose } as Trip)}: ${declined.length ? declined.map((x) => s.characters[x]?.firstName).join(', ') + ' declined' : 'no companion'} — refund`, 'event');
  for (const g of declined) {
    const c = s.characters[g];
    if (c) ctx.log.push(`${displayName(c)} declined the invitation to ${d.name}.`);
  }
  const departDay = q.departWeek * 7;
  const convoy = plan.mode === 'cars' && !!q.transport && isConvoy(q.transport);
  const drivers = convoy ? plan.driverIds ?? [] : [];
  const t: Trip = {
    id: `trip${s.nextId++}`, purpose: plan.purpose, leaderId: L.id, party: [...guests, ...(companionId ? [companionId] : []), ...drivers],
    guests, companionId, driverIds: drivers, destId: d.id, mode: plan.mode, tier: plan.tier, cars: plan.mode === 'cars' ? (convoy ? plan.cars ?? 1 : 1) : 0,
    ...(plan.transport ? { transport: plan.transport } : {}),
    discreet: plan.discreet, entertainer: plan.entertainer, days: [...plan.days],
    departDay, arriveDay: departDay + q.out, leaveDay: departDay + q.out + q.stay, homeDay: departDay + q.out + q.stay + q.back,
    cost: q.cost, journal: [], done: 0, legs: [], declined,
  };
  tr.trips.push(t);
  tr.stats.trips++;
  if (plan.purpose === 'vacation') tr.stats.vacations++;
  else tr.stats.business++;
  journal(s, t, `Booked: ${d.name} by ${plan.transport && q.transport ? q.transport.name.replace(/^Your /, 'his ').replace(/^An? /, '').toLowerCase() : MODES[t.mode].name.toLowerCase()}, ${TIER_INFO[t.tier].name.toLowerCase()}, leaving ${formatDate(dayDate(departDay))}.`, 'neutral', today(s));
  return t;
}

/* ---------------------------------------------------------------- */
/* The weekly tick                                                   */
/* ---------------------------------------------------------------- */

const ACCIDENT_SCALE = 3;

function legRoll(ctx: Ctx, t: Trip, which: 'out' | 'back'): EventInstance | undefined {
  const s = ctx.s;
  const tr = T(s);
  const m = MODES[t.mode];
  const L = s.characters[t.leaderId];
  t.legs.push(which);
  const day = which === 'out' ? t.departDay : t.leaveDay;
  const lam = t.purpose === 'lam';
  const label = tripLabel(t);
  const o = resolveTransport(t.mode, t.tier, destOf(t), t.transport);
  let ev: EventInstance | undefined;
  // Accidents.
  const pAcc = (t.mode === 'cars' ? 1 - (1 - m.accident) ** t.cars : m.accident) * o.accMult * ACCIDENT_SCALE;
  if (rand(tr) < pAcc) {
    const pool = partyOf(s, t).filter((c) => ageOn(c.birth, s.date) >= 16);
    const v = pool[Math.floor(rand(tr) * pool.length)];
    const what = t.mode === 'cars' ? 'a blown tire on the Turnpike put the lead car in a ditch' : t.mode === 'bus' ? 'the bus slid off the road in the rain outside Richmond' : t.mode === 'train' ? 'the train hit a stalled truck at a crossing' : t.mode === 'plane' ? 'a hard landing in a crosswind' : 'a storm at sea, a week of it';
    if (v) {
      const hurt = randInt(tr, 6, t.mode === 'cars' ? 25 : 15);
      applyEffects(ctx, [{ type: 'health', charId: v.id, amount: -hurt, label: `${label}: ${what}` }], { label, because: 'travelled', category: 'event' });
      journal(s, t, `On the road: ${what}. ${v.firstName} was hurt (health −${hurt}). A day lost.`, 'bad', day);
      s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${displayName(v)} was hurt on the way ${which === 'out' ? 'to' : 'home from'} ${destOf(t).name}: ${what}.`, kind: 'misc' });
    }
    if (which === 'out') { t.arriveDay++; t.leaveDay++; t.homeDay++; } else if (t.homeDay < FAR) t.homeDay++;
    tr.stats.accidents++;
  }
  // The Feds watch the airports, the stations and the passenger lists.
  const pSee = m.conspicuous * o.seenMult * (s.heat.federal / 100) * 0.5;
  if (rand(tr) < pSee) {
    tr.stats.sightings++;
    if (lam) onLamLeg(ctx, t, 'sighting');
    else if (L && (isOurs(s, L) && L.rank !== 'civilian' || L.id === s.playerId)) {
      applyEffects(ctx, [{ type: 'evidence', charId: L.id, amount: 1, label: `${label}: photographed ${t.mode === 'plane' ? 'at the airport' : 'at the station'}` }], { label, because: 'travelled', category: 'event' });
      heat(ctx, 'federal', 1, `${label}: two men in raincoats wrote down who was travelling`, 'heat');
      journal(s, t, `${t.mode === 'plane' ? 'Philadelphia International' : t.mode === 'ship' ? 'The pier' : 'The station'}: two men in raincoats wrote down everyone in the party.`, 'bad', day);
    }
  }
  // Tails.
  const pTail = m.tail * o.tailMult * (0.4 + s.heat.federal / 60) * ((L?.evidence ?? 0) >= 40 ? 1.5 : 1);
  if (L && (L.rank !== 'civilian' || lam) && rand(tr) < pTail) {
    tr.stats.tails++;
    t.tailed = true;
    if (t.askedWeek !== s.week) ev = buildTail(s, t, which);
    else journal(s, t, 'A gray Ford stayed three cars back from Wilmington to Baltimore. Nobody said anything about it.', 'bad', day);
  }
  // The way they chose (transport.ts): a trooper, the weather, a passenger list. Old trips (no choice) roll none of it.
  if (t.transport && !lam) wayRoll(ctx, t, o, which, day);
  // Chance meetings.
  if (!ev && !lam && t.askedWeek !== s.week && rand(tr) < m.meeting) {
    tr.stats.meetings++;
    ev = buildMeeting(s, t);
  }
  return ev;
}

/** The risks of the particular way to go: troopers on the road, fog on the bay, a passenger list on a federal desk. */
function wayRoll(ctx: Ctx, t: Trip, o: TransportOpt, which: 'out' | 'back', day: number): void {
  const s = ctx.s;
  const tr = T(s);
  const L = s.characters[t.leaderId];
  const d = destOf(t);
  const label = `${tripLabel(t)}: ${o.name}`;
  const crewAlong = t.party.filter((id) => { const c = s.characters[id]; return c && !c.dynasty && c.faction === 'player' && c.rank !== 'civilian'; }).length;
  const r = transportRisks(o, d, dayDate(day).m, s.heat.federal, s.heat.local, L?.evidence ?? 0, t.cars, crewAlong);
  if (r.stop && rand(tr) < r.stop) {
    const armed = crewAlong > 0 && o.guns === 'yes';
    if (armed) {
      applyEffects(ctx, [{ type: 'money', amount: -150, label: `${label}: a trooper and a .38 under the seat` }, { type: 'heat', bar: 'local', amount: 2, label: `${label}: a trooper wrote down every name in the car` }], { label, because: 'got pulled over with a gun in the car', category: 'event' });
      if (L && L.rank !== 'civilian') applyEffects(ctx, [{ type: 'evidence', charId: L.id, amount: 1, label: `${label}: the trooper's report` }], { label, because: 'got pulled over', category: 'event' });
      journal(s, t, `A state trooper pulled the car over ${which === 'out' ? 'on the way down' : 'on the way home'} and found a .38 under the seat. A hundred and fifty dollars and a report with every name in it.`, 'bad', day);
    } else journal(s, t, `A state trooper pulled the car over, read the license twice, looked at everybody in the back, and let it go with a ticket.`, 'neutral', day);
  }
  if (r.weather && rand(tr) < r.weather) {
    const what = o.mode === 'plane' ? 'Weather over the field: the flight sat on the ground until the next morning' : o.id === 'charter' ? 'Fog on the bay: the captain would not take the boat out until it lifted the next day' : o.mode === 'ship' ? 'Heavy seas: a day lost' : 'Snow on the line: a day late';
    journal(s, t, `${what}.`, 'bad', day);
    if (which === 'out') { t.arriveDay++; t.leaveDay++; t.homeDay++; } else if (t.homeDay < FAR) t.homeDay++;
    if (L?.alive) addStress(s, L.id, 2, 'domestic');
  }
  if (o.manifest && L && L.rank !== 'civilian' && rand(tr) < manifestChance(o, s.heat.federal)) {
    applyEffects(ctx, [{ type: 'evidence', charId: L.id, amount: 1, label: `${label}: the passenger list reached the Federal Building` }], { label, because: 'travelled under his own name', category: 'event' });
    journal(s, t, `The ${o.mode === 'plane' ? 'airline\'s passenger list' : o.mode === 'ship' ? 'purser\'s list' : 'Pullman reservation'} — ${L.firstName}'s name and everyone's with him — ended up on a desk in the Federal Building.`, 'bad', day);
  }
}

function buildTail(s: GameState, t: Trip, which: 'out' | 'back'): EventInstance {
  const lam = t.purpose === 'lam';
  const label = `${tripLabel(t)}: a tail`;
  const drv = t.driverIds.map((id) => s.characters[id]).find((c) => c?.alive);
  const where = t.mode === 'cars' ? `the same gray Ford has been three cars back since the Delaware Memorial Bridge` : `the same man in a brown hat has been in the next car since Thirtieth Street`;
  return tripEvent(s, t, 'tail', lam ? 'Somebody is following' : 'A tail', `On the way ${which === 'out' ? 'down' : 'home'}, ${where}.${lam ? ' If it is the Bureau, the whole run is over.' : ''}`, [
    { id: 'lose', label: 'Lose him', detail: drv ? `${drv.firstName} knows the back roads.` : 'Side streets, a hotel lobby with two doors.', because: 'lost a tail', effects: [{ type: 'travel', op: { op: 'tail', tripId: t.id, outcome: 'lose' }, label }] },
    { id: 'wave', label: 'Wave at him', detail: 'Let him know you know. They hate that.', because: 'waved at the FBI tail', effects: lam ? [{ type: 'travel', op: { op: 'tail', tripId: t.id, outcome: 'wave' }, label }] : [{ type: 'heat', bar: 'federal', amount: 2, label }, { type: 'respect', amount: 1, label }] },
    { id: 'confront', label: lam ? 'Change plans: go to ground for a day' : 'Carry on as if nothing', because: lam ? 'went to ground' : 'let the tail follow', effects: [{ type: 'travel', op: { op: 'tail', tripId: t.id, outcome: 'confront' }, label }] },
  ], [t.leaderId, ...(drv ? [drv.id] : [])]);
}

function buildMeeting(s: GameState, t: Trip): EventInstance {
  const tr = T(s);
  const m = MODES[t.mode];
  const where = t.mode === 'plane' ? 'In the first-class cabin' : t.mode === 'train' ? 'In the club car' : t.mode === 'ship' ? 'At the captain\'s table' : t.mode === 'bus' ? 'At a rest stop diner' : 'At a Howard Johnson\'s on the turnpike';
  const official = Object.values(s.characters).find((c) => c.alive && c.office && !t.party.includes(c.id) && rand(tr) < 0.35);
  const rival = s.rivals.filter((r) => r.kind === 'mob').map((r) => s.characters[r.leaderId]).find((c) => c?.alive && !t.party.includes(c.id) && rand(tr) < 0.3);
  const label = `${tripLabel(t)}: a chance meeting`;
  void m;
  if (official) {
    return tripEvent(s, t, 'meeting', 'A chance meeting', `${where}: ${displayName(official)} (${official.office}), loosening his tie, alone, with a long way to go.`, [
      { id: 'drink', label: 'Buy him a drink', detail: 'Just two men passing the time.', because: `bought ${official.firstName} ${official.lastName} a drink on the road`, effects: [{ type: 'opinion', from: official.id, to: t.leaderId, amount: 10, reason: 'Good company on a long trip', decay: 1, label }, { type: 'favor', amount: 1, label }] },
      { id: 'nod', label: 'Nod and keep to yourself', because: 'kept to yourself', effects: [] },
    ], [official.id, t.leaderId]);
  }
  if (rival) {
    const r = s.rivals.find((x) => x.leaderId === rival.id)!;
    return tripEvent(s, t, 'meeting', `${r.shortName} on board`, `${where}: ${displayName(rival)}, three seats away. Neither of you has anywhere to go for hours.`, [
      { id: 'talk', label: 'Talk', detail: 'Neutral ground in motion.', because: `talked with ${r.shortName} on the road`, effects: [{ type: 'rivalOpinion', rival: r.id, amount: 8, reason: 'A long talk on the road', label }] },
      { id: 'ignore', label: 'Read the paper', because: `ignored ${r.shortName}`, effects: [{ type: 'rivalOpinion', rival: r.id, amount: -3, reason: 'Ignored me for six hours', label }] },
    ], [rival.id, t.leaderId]);
  }
  return tripEvent(s, t, 'meeting', 'A famous face', `${where}: a crooner whose records are on every jukebox on the boardwalk. He knows who you are, or pretends to.`, [
    { id: 'invite', label: 'Invite him to play Wildwood next summer', detail: 'A name on the marquee of one of your clubs.', because: 'booked a star on the road', effects: [{ type: 'dyn', op: { op: 'renown', amount: 12, reason: 'Booked a star for the boardwalk' }, label }, { type: 'respect', amount: 1, label }] },
    { id: 'autograph', label: 'Get an autograph for the kids', because: 'got an autograph', effects: [{ type: 'familyOpinion', amount: 2, reason: 'Brought home an autograph', label }] },
  ], [t.leaderId]);
}

function finishTrip(ctx: Ctx, t: Trip): void {
  const s = ctx.s;
  const tr = T(s);
  t.over = true;
  const L = s.characters[t.leaderId];
  const d = destOf(t);
  for (const c of partyOf(s, t)) if (c.id !== s.playerId && (c.busyUntil ?? 0) > s.week) c.busyUntil = s.week;
  if (L?.alive && t.purpose === 'vacation' && !t.discovered) addStress(s, L.id, -Math.round(TIER_INFO[t.tier].relief / 2), 'paranoia');
  if (L?.alive && t.mode === 'bus' && t.homeDay - t.departDay > 6) addStress(s, L.id, 3, 'domestic');
  journal(s, t, `Home in Wildwood.`, 'neutral', t.homeDay);
  const highlights = t.journal.filter((j) => j.tone === 'good' || j.tone === 'bad').slice(-3).map((j) => j.text);
  tr.history.push({ week: s.week, destId: d.id, mode: t.mode, purpose: t.purpose, leaderId: t.leaderId, party: [...t.party], cost: t.cost, highlights });
  if (tr.history.length > 20) tr.history = tr.history.slice(-20);
  if (L) {
    const text = `${displayName(L)} came home from ${d.name}${t.party.length ? ` with ${partyOf(s, t).filter((c) => c.id !== L.id && !t.driverIds.includes(c.id)).map((c) => c.firstName).slice(0, 4).join(', ') || 'the drivers'}` : ''}.`;
    s.chronicle.push({ week: s.week, date: { ...s.date }, text, kind: t.leaderId === s.playerId || L.dynasty ? 'family' : 'misc' });
    ctx.log.push(text);
    if (L.id !== s.playerId && L.faction === 'player') addStory(s, L, `Went to ${d.name}${t.purpose === 'business' ? ' on business' : ''}.`);
  }
}

/** One trip, one week: departure, the legs, the itinerary days, home. */
function tripWeek(ctx: Ctx, t: Trip): EventInstance[] {
  const s = ctx.s;
  const out: EventInstance[] = [];
  const d0 = today(s);
  const d1 = d0 + 7;
  const L = s.characters[t.leaderId];
  if (!L?.alive) {
    finishTrip(ctx, t);
    return out;
  }
  if (t.departDay >= d1) return out;
  if (!t.legs.includes('out')) {
    journal(s, t, `Left Wildwood by ${MODES[t.mode].name.toLowerCase()} for ${destOf(t).name}.`, 'neutral', t.departDay);
    for (const c of partyOf(s, t)) if (c.id !== s.playerId) c.busyUntil = Math.max(c.busyUntil ?? 0, Math.min(s.week + 520, Math.ceil(t.homeDay / 7)));
    const ev = legRoll(ctx, t, 'out');
    if (ev) out.push(ev);
  }
  if (t.purpose !== 'lam') {
    for (let i = t.done; i < t.days.length; i++) {
      if (t.arriveDay + i >= d1) break;
      out.push(...resolveDay(ctx, t, i));
      if (t.over) return out;
      // The boss's own plans for the day (vacation.ts): the show, the track, the sit-down…
      if (t.purpose === 'vacation' && t.leaderId === s.playerId) {
        const ev = resolveVacDay(ctx, t, i);
        if (!out.length) out.push(...ev);
      }
    }
  }
  if (t.leaveDay < d1 && !t.legs.includes('back') && t.leaveDay < FAR) {
    const ev = legRoll(ctx, t, 'back');
    if (ev && !out.length) out.push(ev);
  }
  if (t.homeDay < d1 && t.legs.includes('back')) finishTrip(ctx, t);
  return out;
}

/**
 * The weekly tick (engine.ts calls it right after the Long Game): trips,
 * the reckonings that follow them, the acting boss, and the fugitives.
 */
export function travelWeek(ctx: Ctx): void {
  const s = ctx.s;
  if (!s.travel) return;
  const tr = s.travel;
  const queued: EventInstance[] = [];
  for (const t of tr.trips) {
    if (t.over) continue;
    queued.push(...tripWeek(ctx, t));
  }
  // The boss gone somewhere himself (visit.ts): the road, the agenda, home without him.
  queued.push(...visitWeek(ctx));
  // At most two travel popups a week; the rest resolve on their defaults.
  for (const ev of queued.slice(0, 2)) s.eventQueue.push(ev);
  for (const ev of queued.slice(2)) {
    const ch = ev.choices.find((c) => c.id === ev.defaultChoiceId) ?? ev.choices[0];
    if (ch) applyEffects(ctx, ch.effects, { label: ev.title, because: ch.because, category: 'event' });
  }
  // The reckoning at home.
  const due = tr.aftermath.filter((a) => a.due <= s.week);
  if (due.length) {
    tr.aftermath = tr.aftermath.filter((a) => a.due > s.week);
    const a = due[0];
    if (!isAway(s, a.spouseId) && !isAway(s, a.leaderId)) {
      const ev = buildAftermath(s, a);
      if (ev) s.eventQueue.push(ev);
    } else tr.aftermath.push({ ...a, due: s.week + 1 });
  }
  ferryNews(ctx);
  fugitiveWeek(ctx);
  actingWeek(ctx);
  // Forget finished trips after a while.
  if (tr.trips.length > 6) tr.trips = tr.trips.filter((t) => !t.over || t.homeDay > today(s) - 21);
}

/** July 1964: the Cape May–Lewes Ferry sails, and the trip planner gets a new way across the bay. Told once. */
export function ferryNews(ctx: Ctx): void {
  const s = ctx.s;
  if (!ferryOpen(s.date) || s.flags.capeMayLewesFerry) return;
  s.flags.capeMayLewesFerry = 1;
  const text = 'The Cape May–Lewes Ferry sailed for the first time: seventy minutes across the mouth of the bay, cars and all. Delaware is an afternoon away now — no more fishing captains, no more four hours around by the Memorial Bridge.';
  s.chronicle.push({ week: s.week, date: { ...s.date }, text, kind: 'misc' });
  ctx.log.push(text);
}

/* ---------------------------------------------------------------- */
/* While the boss is away                                            */
/* ---------------------------------------------------------------- */

/** Who runs things while the boss is away: the underboss, else the heir, else the best capo. */
export function actingBoss(s: GameState): Character | undefined {
  const ok = (c: Character | undefined): c is Character => !!c && c.alive && c.id !== s.playerId && isFree(s, c) && !isAway(s, c.id) && ageOn(c.birth, s.date) >= 18;
  const ub = holder(s, 'underboss') ?? crew(s).find((c) => c.rank === 'underboss');
  if (ok(ub)) return ub;
  const heir = chooseHeir(s, player(s)).heir;
  if (ok(heir)) return heir;
  return crew(s).filter((c) => c.rank === 'capo' && ok(c)).sort((a, b) => b.attributes.leadership - a.attributes.leadership)[0];
}

/** How much more often capos act on their own while the boss is away (1 = he is home). */
export function awayActMult(s: GameState): number {
  if (!s.travel) return 1;
  if (bossFugitive(s)) return 2.2;
  if (!bossAway(s)) return 1;
  return isInSeason(s.date) ? 2 : 1.6;
}

/** Capos get ideas when the boss is away (a small hook into regimes.ts). */
export function awayCapoBias(s: GameState, k: Character, w: Record<string, number>): void {
  if (awayActMult(s) === 1) return;
  if (opinion(s, k.id, s.playerId) < 50 && !hasTrait(k, 'Loyal-to-a-fault')) w.skim = (w.skim ?? 0) + 1.5;
  w.beef = (w.beef ?? 0) + 0.8;
  w.expand = (w.expand ?? 0) + 0.8;
  if (hasTrait(k, 'Loyal-to-a-fault')) w.heat = (w.heat ?? 0) + 1;
}

/** Orders the boss gives himself need him in Wildwood. */
export function directOrderBlock(s: GameState): string | undefined {
  if (!s.travel || !bossAway(s)) return undefined;
  const f = bossFugitive(s);
  if (f) return 'The boss is on the lam: everything goes through messengers';
  const t = tripOf(s, s.playerId);
  return `The boss is away${t ? ` (${destOf(t).name})` : ''}: orders go through the underboss or a capo`;
}

export { messengerDelay, messengerPenalty };

function actingWeek(ctx: Ctx): void {
  const s = ctx.s;
  const tr = T(s);
  const boss = player(s);
  if (!bossAway(s)) {
    if (tr.acting) {
      const a = tr.acting;
      tr.acting = undefined;
      const k = s.characters[a.id];
      if (k?.alive && a.weeks >= 2 && boss.alive) s.eventQueue.push(buildWelcomeHome(s, k, a));
    }
    return;
  }
  const k = actingBoss(s);
  if (!k) return;
  if (!tr.acting || tr.acting.id !== k.id) {
    tr.acting = { id: k.id, since: s.week, weeks: 0, deeds: [] };
    ctx.log.push(`${displayName(k)} runs things while ${boss.firstName} is away.`);
    addStory(s, k, `Ran the family while ${boss.firstName} was away.`);
  }
  const a = tr.acting;
  a.weeks++;
  if (a.weeks % 2 === 0) for (const m of crew(s)) if (m.id !== k.id && m.faction === 'player') addOpinion(s, m.id, k.id, 'Ran things while the boss was away', 1, 1);
  if (bossFugitive(s) && a.weeks % 4 === 0) for (const m of crew(s)) addOpinion(s, m.id, boss.id, 'The boss is never here', -1, 1);
  if (rand(tr) >= 0.45) return;
  type Deed = 'steady' | 'settle' | 'overreach' | 'skim' | 'quiet';
  const w: Record<Deed, number> = {
    steady: 2, settle: k.attributes.diplomacy >= 55 || hasTrait(k, 'Charming') ? 1.5 : 0.5,
    overreach: hasTrait(k, 'Ambitious') || hasTrait(k, 'Hot-headed') ? 1.5 : 0.3, skim: hasTrait(k, 'Greedy') ? 2 : 0.2, quiet: hasTrait(k, 'Loyal-to-a-fault') || hasTrait(k, 'Patient') ? 1.5 : 0.4,
  };
  const deed = weightedPick(tr, Object.keys(w) as Deed[], (x) => w[x]) ?? 'steady';
  const nm = displayName(k);
  let text = '';
  switch (deed) {
    case 'steady': {
      const amt = Math.round((300 + crew(s).filter((c) => c.rank === 'capo').length * 120) * (isInSeason(s.date) ? 1.5 : 0.8));
      money(ctx, amt, `${nm} kept the envelopes coming while the boss was away`, 'kickup');
      text = `${nm} kept the envelopes coming.`;
      break;
    }
    case 'settle':
      for (const m of crew(s)) if (m.id !== k.id) addOpinion(s, m.id, k.id, 'Settled a beef fair and square', 2, 1);
      text = `${nm} settled a beef between two crews before it got loud.`;
      break;
    case 'overreach': {
      const d = s.districts.filter((x) => (x.influence.player ?? 0) > 0 && (x.influence.player ?? 0) < 90)[0];
      if (d) shiftInfluence(s, d.id, 'player', 2);
      heat(ctx, 'local', 2, `${nm} made a move without asking`, 'heat');
      for (const m of crew(s)) if (m.id !== k.id) addOpinion(s, m.id, k.id, 'Acts like the boss already', 2, 1);
      text = `${nm} made a move on ${d ? d.name : 'a rival\'s corner'} without asking anybody.`;
      break;
    }
    case 'skim':
      k.skimmed = (k.skimmed ?? 0) + randInt(tr, 200, 600);
      text = `${nm} counted the money alone. Twice.`;
      break;
    case 'quiet':
      if (s.heat.local > 5) heat(ctx, 'local', -2, `${nm} kept things quiet while the boss was away`, 'heat');
      text = `${nm} kept the town quiet. Not a headline all week.`;
      break;
  }
  a.deeds.push(text);
  if (a.deeds.length > 8) a.deeds = a.deeds.slice(-8);
  ctx.log.push(text);
}

function buildWelcomeHome(s: GameState, k: Character, a: NonNullable<GameState['travel']>['acting'] & object): EventInstance {
  const boss = player(s);
  const label = 'Back in Wildwood';
  const ambitious = hasTrait(k, 'Ambitious') && opinion(s, k.id, boss.id) < 20;
  return {
    iid: `ev${s.nextId++}`, defId: 'trip_welcome', week: s.week, mandatory: true, priority: 66, title: 'Back in Wildwood', actors: [k.id, boss.id], meta: { trip: 'acting' },
    text: `${displayName(k)} ran things for ${a.weeks} weeks. ${a.deeds.slice(-3).join(' ')}${ambitious ? ` He has started sitting in your chair at the club. He gets up when you walk in — slowly.` : ''}`,
    defaultChoiceId: 'thank',
    choices: [
      { id: 'thank', label: `Thank him with an envelope ($1,000)`, because: `thanked ${k.firstName} for minding the store`, effects: [{ type: 'money', amount: -1000, label }, { type: 'opinion', from: k.id, to: boss.id, amount: 12, reason: 'Thanked me for minding the store', decay: 1, label }, { type: 'meter', from: k.id, to: boss.id, meter: 'trust', amount: 8, label }], disabledReason: s.money < 1000 ? 'Needs $1,000' : undefined },
      { id: 'back', label: 'I\'m back. Everything goes through me again.', because: `took the reins back from ${k.firstName}`, effects: [{ type: 'respect', amount: 1, label }, { type: 'opinion', from: k.id, to: boss.id, amount: ambitious ? -12 : -4, reason: 'Took the chair back without a word', decay: 1, label }] },
      { id: 'share', label: 'Let him keep a hand in', detail: 'He keeps a few of the decisions he made.', because: `let ${k.firstName} keep a hand in`, effects: [{ type: 'opinion', from: k.id, to: boss.id, amount: 8, reason: 'Trusts me with real decisions', decay: 1, label }, { type: 'respect', amount: -1, label }] },
    ],
  };
}

/* ---------------------------------------------------------------- */
/* Effect ops                                                        */
/* ---------------------------------------------------------------- */

export function applyTravelOp(ctx: Ctx, op: TravelOp, label: string): void {
  const s = ctx.s;
  const tr = ensureTravel(s);
  const trip = 'tripId' in op ? tr.trips.find((x) => x.id === op.tripId) : undefined;
  switch (op.op) {
    case 'cutShort':
      if (trip) cutTrip(s, trip);
      break;
    case 'sendHome': {
      if (!trip) break;
      trip.party = trip.party.filter((x) => x !== op.charId);
      if (trip.companionId === op.charId) trip.companionId = undefined;
      const c = s.characters[op.charId];
      if (c && (c.busyUntil ?? 0) > s.week) c.busyUntil = s.week;
      journal(s, trip, `${c?.firstName ?? 'Someone'} went home early.`, 'bad');
      break;
    }
    case 'coverStory': {
      if (!trip) break;
      const L = s.characters[trip.leaderId];
      const w = L?.spouseId ? s.characters[L.spouseId] : undefined;
      if (!L || !w) break;
      if (rand(tr) < coverOdds(s, L.id)) {
        addOpinion(s, w.id, L.id, 'Something isn\'t right', -6, 1);
        journal(s, trip, `${w.firstName} believed it. Mostly.`, 'neutral');
        ctx.log.push(`${label}: ${w.firstName} believed the story. Mostly.`);
      } else {
        addOpinion(s, w.id, L.id, 'Lied to my face about the other woman', -40, 1);
        addStress(s, w.id, 25, 'domestic');
        changeGrievance(s, w.id, L.id, 20);
        markAffair(s, L.id, trip.companionId);
        tr.aftermath.push({ spouseId: w.id, loverId: trip.companionId ?? '', due: s.week + randInt(tr, 2, 4), leaderId: L.id });
        journal(s, trip, `${w.firstName} did not believe a word. She took the next train home.`, 'bad');
        trip.party = trip.party.filter((x) => x !== w.id);
        if ((w.busyUntil ?? 0) > s.week) w.busyUntil = s.week;
        ctx.log.push(`${label}: ${w.firstName} did not believe a word of it.`);
      }
      break;
    }
    case 'confess': {
      if (!trip) break;
      const L = s.characters[trip.leaderId];
      if (!L?.spouseId) break;
      markAffair(s, L.id, trip.companionId);
      tr.aftermath.push({ spouseId: L.spouseId, loverId: trip.companionId ?? '', due: s.week + randInt(tr, 2, 4), leaderId: L.id });
      journal(s, trip, 'A long night with the door closed. In the morning they had breakfast at separate tables.', 'bad');
      break;
    }
    case 'tail': {
      if (!trip) break;
      if (trip.purpose === 'lam') { applyFugitiveOp(ctx, op, label); break; }
      const drv = trip.driverIds.map((id) => s.characters[id]).find((c) => c?.alive);
      if (op.outcome === 'lose') {
        const p = 0.45 + (drv && (drv.craft === 'driver' || drv.specialty === 'wheelman') ? 0.3 : 0) + (trip.mode === 'cars' ? 0.05 : 0);
        if (rand(tr) < p) journal(s, trip, 'Lost him in the back streets.', 'good');
        else {
          applyEffects(ctx, [{ type: 'evidence', charId: trip.leaderId, amount: 2, label: `${label}: he stuck` }], { label, because: 'tried to lose a tail', category: 'event' });
          journal(s, trip, 'He stuck like glue. The Bureau knows where you went and who you saw.', 'bad');
        }
      } else if (op.outcome === 'confront') {
        applyEffects(ctx, [{ type: 'evidence', charId: trip.leaderId, amount: 2, label: `${label}: they followed you all the way` }, ...(destOf(trip).cityId ? [{ type: 'standing', city: destOf(trip).cityId!, amount: -4, label: `${label}: you brought the FBI to their door` } as Effect] : [])], { label, because: 'let the tail follow', category: 'event' });
        journal(s, trip, 'He followed all the way. The people you came to see were not pleased.', 'bad');
      }
      break;
    }
    case 'endAffair': {
      tr.friends[op.leaderId] = (tr.friends[op.leaderId] ?? []).filter((x) => x !== op.loverId);
      break;
    }
    case 'actingReward':
      addOpinion(s, op.charId, s.playerId, 'Rewarded for minding the store', op.amount, 1);
      break;
    case 'gossip': {
      if (!trip) break;
      const L = s.characters[trip.leaderId];
      if (!L?.spouseId || !trip.companionId) break;
      if (rand(tr) < 0.5) {
        tr.aftermath.push({ spouseId: L.spouseId, loverId: trip.companionId, due: s.week + randInt(tr, 1, 3), leaderId: L.id });
        journal(s, trip, 'He talked. It will be home before you are.', 'bad');
      } else journal(s, trip, 'He kept it to himself. For now.', 'neutral');
      break;
    }
    case 'visitHome':
      cutVisitShort(s);
      break;
    default:
      applyFugitiveOp(ctx, op, label);
  }
}

function changeGrievance(s: GameState, from: string, to: string, amount: number): void {
  changeMeter(s, from, to, 'grievance', amount);
}

function markAffair(s: GameState, leaderId: string, loverId?: string): void {
  const L = s.characters[leaderId];
  if (L) addSecret(s, L, 'affair', ['player']);
  void loverId;
}

export function describeTravelOp(s: GameState, op: TravelOp): string | undefined {
  switch (op.op) {
    case 'cutShort': return 'The trip ends early';
    case 'sendHome': return `${s.characters[op.charId]?.firstName ?? '?'} goes home early`;
    case 'coverStory': return 'She believes it — or she doesn\'t';
    case 'confess': return 'The affair is out (a reckoning at home)';
    case 'tail': return op.outcome === 'lose' ? 'Try to lose him' : op.outcome === 'wave' ? 'The tail knows you know' : 'He follows you all the way';
    case 'endAffair': return `The affair with ${s.characters[op.loverId]?.firstName ?? '?'} is over`;
    case 'actingReward': return `${s.characters[op.charId]?.firstName ?? '?'} opinion +${op.amount}`;
    case 'gossip': return 'Half a chance it gets back to the wife';
    case 'visitHome': return 'You pack and go home';
    default: return describeFugitiveOp(s, op);
  }
}

/* ---------------------------------------------------------------- */
/* Suggestions (the planner's defaults and the sim's random player)  */
/* ---------------------------------------------------------------- */

/** A sensible default plan: the family, the best mode, a good itinerary. */
export function suggestPlan(s: GameState, leaderId: string, destId?: string, purpose: 'vacation' | 'business' = 'vacation'): TripPlan {
  const L = s.characters[leaderId];
  const dest = DESTS[destId ?? (purpose === 'vacation' ? 'catskills' : 'philadelphia')] ?? DESTS.catskills;
  const mode: TravelMode = dest.modes.includes('plane') && dest.miles > 300 ? 'plane' : dest.modes.includes('train') ? 'train' : dest.modes[0];
  const pool = new Set(guestPool(s, leaderId).map((c) => c.id));
  const guests: string[] = [];
  if (purpose === 'vacation' && L) {
    if (L.spouseId && pool.has(L.spouseId)) guests.push(L.spouseId);
    for (const k of L.childrenIds) if (pool.has(k) && guests.length < 4) guests.push(k);
  }
  const month = dayDate(s.week * 7 + legDays(mode, dest.miles)).m;
  const acts = dest.activities.filter((a) => !a.months || a.months.includes(month));
  const n = purpose === 'vacation' ? Math.min(4, Math.max(3, acts.length)) : 1;
  const preferred = purpose === 'business' ? acts.filter((a) => a.tags.includes('business')) : acts;
  const days: string[] = [];
  for (let i = 0; i < n; i++) days.push((preferred[i % Math.max(1, preferred.length)] ?? acts[i % acts.length]).id);
  const plan: TripPlan = { purpose, leaderId, destId: dest.id, mode, tier: 'first', guests, days, departIn: 0 };
  if (mode === 'cars') {
    plan.cars = 1;
    plan.driverIds = driverPool(s, leaderId).slice(0, 1).map((c) => c.id);
  }
  return plan;
}

/** The random player's occasional trip. */
export function randomTravelAction(s: GameState, h: { rng: number }): PlayerAction | undefined {
  if (s.money < 15000) return undefined;
  const r = (n: number) => Math.floor(rand(h) * n);
  const fug = bossFugitive(s);
  if (fug) {
    // Wait it out; come home when the case collapses; sometimes give up.
    if (fug.collapsed) return { kind: 'travel', op: { type: 'comeHome', personId: fug.personId } };
    if (rand(h) < 0.05) return { kind: 'travel', op: { type: 'surrender', personId: fug.personId } };
    if (rand(h) < 0.15) return { kind: 'travel', op: { type: 'hide', personId: fug.personId } };
    return undefined;
  }
  const ours = [s.playerId, ...crew(s).filter((c) => c.rank === 'capo' || c.rank === 'soldier').map((c) => c.id)];
  const leaderId = rand(h) < 0.6 ? s.playerId : ours[r(ours.length)];
  if (!canTravel(s, leaderId)) return undefined;
  const purpose = leaderId === s.playerId && rand(h) < 0.7 ? 'vacation' : 'business';
  const ids = purpose === 'vacation' ? RESORT_IDS.filter((x) => x !== 'havana' || havanaOpen(s.date)) : Object.keys(DESTS).filter((x) => DESTS[x].cityId);
  const plan = suggestPlan(s, leaderId, ids[r(ids.length)], purpose);
  const modes = MODE_IDS.filter((m) => DESTS[plan.destId].modes.includes(m));
  plan.mode = modes[r(modes.length)];
  if (plan.mode === 'cars') {
    plan.cars = 1;
    plan.driverIds = driverPool(s, leaderId).slice(0, 1).map((c) => c.id);
  } else { plan.cars = undefined; plan.driverIds = undefined; }
  plan.tier = (['modest', 'first', 'lavish'] as const)[r(3)];
  if (purpose === 'vacation' && rand(h) < 0.25) {
    const lovers = companionPool(s, leaderId);
    if (lovers.length) plan.companionId = lovers[0].id;
    else plan.newCompanion = true;
    plan.discreet = rand(h) < 0.5;
  }
  if (purpose === 'vacation' && rand(h) < 0.2) {
    const out = guestPool(s, leaderId).filter((c) => !c.dynasty && c.faction !== 'player');
    if (out.length) plan.guests.push(out[r(out.length)].id);
  }
  const q = quoteTrip(s, plan);
  if (q.block || q.cost > s.money * 0.15) return undefined;
  return { kind: 'travel', op: { type: 'trip', plan } };
}

/* ---------------------------------------------------------------- */
/* Where everybody is (for the map)                                  */
/* ---------------------------------------------------------------- */

export interface TravellerPos {
  trip: Trip;
  /** 'out' | 'there' | 'back' | 'booked' */
  phase: 'booked' | 'out' | 'there' | 'back';
  /** Fraction of the leg at the start and the end of this week (for the animation). */
  from: number;
  to: number;
}

export function travellers(s: GameState): TravellerPos[] {
  const out: TravellerPos[] = [];
  const d0 = today(s);
  const d1 = d0 + 7;
  for (const t of liveTrips(s)) {
    const leg = (a: number, b: number, x: number) => Math.max(0, Math.min(1, b > a ? (x - a) / (b - a) : 1));
    if (d0 < t.departDay) { out.push({ trip: t, phase: 'booked', from: 0, to: 0 }); continue; }
    if (d0 < t.arriveDay) out.push({ trip: t, phase: 'out', from: leg(t.departDay, t.arriveDay, d0), to: leg(t.departDay, t.arriveDay, d1) });
    else if (d0 < t.leaveDay || t.leaveDay >= FAR) out.push({ trip: t, phase: 'there', from: 1, to: 1 });
    else out.push({ trip: t, phase: 'back', from: leg(t.leaveDay, t.homeDay, d0), to: leg(t.leaveDay, t.homeDay, d1) });
  }
  return out;
}

type TravelMode = TripPlan['mode'];
