import type { ActionPreview } from './actions';
import { ageOn } from './calendar';
import { displayName, isFree, player } from './characters';
import { chooseHeir, succeed } from './dynasty';
import { applyEffects, fmtMoney } from './effects';
import { famMut } from './familyState';
import { addStress } from './familyStress';
import { addStory } from './hierarchy';
import { heat, money, respect, type Ctx } from './ledger';
import { BAIL, GJ_WEEKS, legalOf, stageLabel, TRIAL_WEEKS } from './longgame';
import { BULLETIN, LEADER } from './newspaper';
import { addOpinion, opinion } from './relations';
import { rand } from './rng';
import { ownsFloridaPlace } from './spendState';
import { journal, T } from './trips';
import { FLEE_DESTS, FLEE_IDS, fare, legDays, MODES, modeBlock } from './travelDests';
import {
  ensureTravel, fugitiveOf, today, tripOf,
  type FleePlan, type Fugitive, type FugitiveDest, type TravelAction, type TravelMode, type TravelOp, type Trip,
} from './travelState';
import type { Character, Choice, Effect, EventInstance, GameState } from './types';

/**
 * On the lam. When the boss — or one of his people — is under
 * investigation, indicted or out on bail, he can run: a hideout (the farm
 * in Vineland, Florida, Montreal, Mexico, the old country), a way to get
 * there (a conspicuous plane or a quiet car), and help (a safehouse, new
 * papers, a driver).
 *
 * A fugitive lives under a federal MANHUNT meter: it grows every week,
 * faster with an indictment and federal heat, slower abroad, and cools
 * after six months. Each week there is a chance he is seen (less with good
 * cover); a sighting may end in capture — but abroad, capture means
 * extradition, and Italy does not send its own back. Hiding costs money
 * every week and the isolation wears on him. While the boss is gone, his
 * orders travel by messenger (late and garbled) and the underboss or heir
 * runs things.
 *
 * It ends one of four ways: he surrenders (the trial is harder, the bail is
 * forfeit), he is caught (harder still), he lives out his days abroad (the
 * heir takes the chair), or the case quietly collapses and he comes home.
 */

export const PAPERS_COST = 1500;
export const SAFEHOUSE_COST = 500;
export const HIDE_COST = 2000;
export const EXILE_WEEKS = 4;

/** Why the law wants him (undefined = nobody is looking for him). */
export function wantedFor(s: GameState, personId: string): string | undefined {
  const c = s.characters[personId];
  if (!c?.alive) return undefined;
  if (personId === s.playerId) {
    const l = s.legal;
    if (!l || l.personId !== personId) return undefined;
    if (l.stage === 'investigation' || l.stage === 'grandjury' || l.stage === 'indicted') return stageLabel(l);
    if (l.stage === 'trial' && l.bail) return 'Out on bail, awaiting trial';
    return undefined;
  }
  if ((c.evidence ?? 0) >= 50 && (c.faction === 'player' || c.dynasty)) return `The Prosecutor wants him (evidence ${Math.round(c.evidence ?? 0)})`;
  return undefined;
}

/** People who could go on the lam right now. */
export function wantedPeople(s: GameState): Character[] {
  return Object.values(s.characters).filter((c) => c.alive && isFree(s, c) && !fugitiveOf(s, c.id) && !!wantedFor(s, c.id));
}

/** A week's keep in hiding: half, with no rent, when the boss lies low in his own place in Florida. */
export function fleeDrain(s: GameState, dest: FugitiveDest, personId: string): number {
  const d = FLEE_DESTS[dest];
  return dest === 'florida' && personId === s.playerId && ownsFloridaPlace(s) ? Math.round(d.drain / 2) : d.drain;
}

export function cover(s: GameState, plan: FleePlan): { value: number; reasons: { label: string; value: number }[] } {
  const d = FLEE_DESTS[plan.dest];
  const reasons: { label: string; value: number }[] = [{ label: d.name, value: d.cover }];
  if (plan.safehouseId) {
    const h = s.characters[plan.safehouseId];
    reasons.push({ label: `${h ? h.firstName + '\'s' : 'A'} safehouse`, value: 0.1 + (h && opinion(s, h.id, plan.personId) >= 30 ? 0.05 : 0) });
  }
  if (plan.papers) reasons.push({ label: 'New papers', value: 0.1 });
  if (plan.dest === 'florida' && plan.personId === s.playerId && ownsFloridaPlace(s)) reasons.push({ label: 'Your own place down there (no landlord, no register)', value: 0.05 });
  if ((plan.dest === 'montreal' && s.flags.lam_montreal) || (plan.dest === 'mexico' && s.flags.lam_mexico)) reasons.push({ label: 'Friends there (met on a trip)', value: 0.1 });
  if (MODES[plan.mode].conspicuous >= 0.8) reasons.push({ label: `${MODES[plan.mode].name}: the airports are watched`, value: -0.05 });
  const value = Math.max(0.05, Math.min(0.9, reasons.reduce((a, r) => a + r.value, 0)));
  return { value, reasons };
}

export function startManhunt(s: GameState, plan: FleePlan): number {
  const stage = plan.personId === s.playerId ? s.legal?.stage : undefined;
  const base = stage === 'trial' ? 45 : stage === 'indicted' ? 35 : stage === 'grandjury' ? 18 : stage === 'investigation' ? 8 : Math.round((s.characters[plan.personId]?.evidence ?? 50) / 3);
  const driver = plan.driverId && plan.mode === 'cars' ? 5 : 0;
  return Math.max(0, Math.min(100, Math.round(base + MODES[plan.mode].conspicuous * 20 - driver)));
}

export interface FleeQuote {
  cost: number;
  lines: { label: string; amount: number }[];
  days: number;
  manhunt: number;
  cover: number;
  coverReasons: { label: string; value: number }[];
  extradition: number;
  drain: number;
  block?: string;
}

export function fleeQuote(s: GameState, plan: FleePlan): FleeQuote {
  const d = FLEE_DESTS[plan.dest];
  const lines: { label: string; amount: number }[] = [];
  lines.push({ label: `${MODES[plan.mode].name} to ${d.name}`, amount: fare(plan.mode, d.miles, 'modest') });
  if (plan.papers) lines.push({ label: s.characters[forgerOf(s) ?? '']?.alive ? 'New papers (your forger)' : 'New papers (bought)', amount: forgerOf(s) ? 0 : PAPERS_COST });
  if (plan.safehouseId) lines.push({ label: 'Setting up the safehouse', amount: SAFEHOUSE_COST });
  const drain = fleeDrain(s, plan.dest, plan.personId);
  lines.push({ label: drain < d.drain ? 'The first week\'s keep (your own place: no rent)' : 'The first week\'s keep', amount: drain });
  const cov = cover(s, plan);
  const q: FleeQuote = {
    cost: lines.reduce((a, l) => a + l.amount, 0), lines, days: legDays(plan.mode, d.miles), manhunt: startManhunt(s, plan), cover: cov.value, coverReasons: cov.reasons,
    extradition: d.extradition, drain,
  };
  q.block = fleeBlock(s, plan, q.cost);
  return q;
}

function forgerOf(s: GameState): string | undefined {
  return Object.values(s.characters).find((c) => c.alive && c.faction === 'player' && c.specialty === 'forger' && isFree(s, c))?.id;
}

export function fleeBlock(s: GameState, plan: FleePlan, cost: number): string | undefined {
  const c = s.characters[plan.personId];
  const d = FLEE_DESTS[plan.dest];
  if (!c?.alive) return 'Not among the living';
  if (!(c.id === s.playerId || c.dynasty || c.faction === 'player')) return 'Not one of yours';
  if (!isFree(s, c)) return 'Already behind bars';
  if (fugitiveOf(s, c.id)) return 'Already on the lam';
  if (tripOf(s, c.id)) return 'Travelling (wait until he is home)';
  if (!wantedFor(s, c.id)) return 'Nobody is looking for him';
  if (!d) return 'Pick a hideout';
  const mb = modeBlock(d, plan.mode);
  if (mb) return mb;
  if (plan.safehouseId) {
    const h = s.characters[plan.safehouseId];
    if (!h?.alive || h.id === c.id || !isFree(s, h) || !(h.dynasty || h.faction === 'player')) return 'The safehouse owner can\'t help';
  }
  if (plan.driverId) {
    const dr = s.characters[plan.driverId];
    if (plan.mode !== 'cars') return 'A driver only helps by car';
    if (!dr?.alive || dr.id === c.id || !isFree(s, dr) || dr.faction !== 'player' || tripOf(s, dr.id)) return 'The driver can\'t help';
  }
  if (cost > s.money) return `Needs ${fmtMoney(cost)}`;
  return undefined;
}

/** The chance a fugitive is seen this week. */
export function sightingChance(f: Pick<Fugitive, 'manhunt' | 'cover'>): number {
  return Math.max(0, Math.min(0.9, (f.manhunt / 100) * 0.3 * (1 - f.cover)));
}

/** The chance a sighting ends in capture (abroad: extradition). */
export function captureChance(f: Pick<Fugitive, 'manhunt' | 'cover' | 'dest'>): number {
  const d = FLEE_DESTS[f.dest];
  return Math.max(0, Math.min(0.95, (0.2 + f.manhunt / 100) * 0.6 * d.extradition * (1 - f.cover / 2)));
}

/** How fast the manhunt grows this week, with the reasons. */
export function manhuntGrowth(s: GameState, f: Fugitive): number {
  const d = FLEE_DESTS[f.dest];
  let g = 1.5 + (f.stageWhenFled === 'indicted' || f.stageWhenFled === 'trial' ? 1.5 : 0) + s.heat.federal / 50;
  if (d.abroad) g *= 0.6;
  if (s.week - f.since > 26) g -= 2.5;
  return g;
}

/* ---------------------------------------------------------------- */
/* Orders                                                            */
/* ---------------------------------------------------------------- */

export function previewFugitive(s: GameState, a: TravelAction): ActionPreview {
  switch (a.type) {
    case 'flee': {
      const q = fleeQuote(s, a.plan);
      const c = s.characters[a.plan.personId];
      const d = FLEE_DESTS[a.plan.dest];
      const label = `On the lam: ${c?.firstName ?? '?'} to ${d?.name ?? '?'}`;
      return {
        title: label,
        detail: `${q.days} day${q.days > 1 ? 's' : ''} by ${MODES[a.plan.mode].name.toLowerCase()}. Manhunt starts at ${q.manhunt}; cover ${Math.round(q.cover * 100)}%; ${d.extradition >= 1 ? 'home soil: a capture means jail' : `extradition risk ${Math.round(d.extradition * 100)}%`}. ${fmtMoney(d.drain)} a week to stay hidden.`,
        effects: [{ type: 'money', amount: -q.cost, label }, { type: 'travel', op: { op: 'flee', plan: a.plan }, label }],
        cost: q.cost, because: `${c?.id === s.playerId ? 'went' : `sent ${c?.firstName ?? 'a man'}`} on the lam to ${d.name}`, disabledReason: q.block, category: 'event',
        warning: a.plan.personId === s.playerId && s.legal?.bail ? `Jumping bail: the ${fmtMoney(BAIL)} bond is forfeit and the trial will be harder if he is caught.` : undefined,
      };
    }
    case 'surrender': {
      const f = fugitiveOf(s, a.personId);
      const c = s.characters[a.personId];
      return {
        title: `${c?.firstName ?? '?'} surrenders`, detail: 'Walk into the federal building with a lawyer. The trial will be harder for having run.',
        effects: [{ type: 'travel', op: { op: 'surrender', personId: a.personId }, label: 'Surrender' }], cost: 0, because: 'gave himself up', category: 'event',
        disabledReason: f ? undefined : 'Not on the lam',
      };
    }
    case 'comeHome': {
      const f = fugitiveOf(s, a.personId);
      const c = s.characters[a.personId];
      return {
        title: `${c?.firstName ?? '?'} comes home quietly`, detail: 'The case is gone. Nobody is waiting at the station.', effects: [{ type: 'travel', op: { op: 'comeHome', personId: a.personId }, label: 'Home' }], cost: 0, because: 'came home from hiding', category: 'event',
        disabledReason: !f ? 'Not on the lam' : !f.collapsed && wantedFor(s, a.personId) ? 'They are still looking for him (surrender instead)' : undefined,
      };
    }
    case 'exile': {
      const f = fugitiveOf(s, a.personId);
      const d = f ? FLEE_DESTS[f.dest] : undefined;
      const isBoss = a.personId === s.playerId;
      const heir = isBoss ? chooseHeir(s, player(s)).heir : undefined;
      return {
        title: `Live out his days in ${d?.name ?? '?'}`, detail: isBoss ? `He never comes back. ${heir ? displayName(heir) : 'Nobody'} takes the chair; play continues as the heir.` : 'He never comes back. He leaves the family.',
        effects: [], cost: 0, because: `stayed in ${d?.name ?? 'exile'} for good`, category: 'event',
        disabledReason: !f ? 'Not on the lam' : !d?.abroad ? 'Only abroad (Canada, Mexico, Italy)' : s.week - f.since < EXILE_WEEKS ? `After ${EXILE_WEEKS} weeks abroad` : isBoss && !heir ? 'No heir to take the chair' : undefined,
      };
    }
    case 'hide': {
      const f = fugitiveOf(s, a.personId);
      return {
        title: 'Pay to stay hidden', detail: 'A cop on the take, a landlord who forgets, a new address.',
        effects: [{ type: 'money', amount: -HIDE_COST, label: 'On the lam: paying to stay hidden' }, { type: 'travel', op: { op: 'cover', personId: a.personId, amount: 0.08 }, label: 'Hidden' }, { type: 'travel', op: { op: 'manhunt', personId: a.personId, amount: -6 }, label: 'Hidden' }],
        cost: HIDE_COST, because: 'paid to stay hidden', category: 'event',
        disabledReason: !f ? 'Not on the lam' : s.money < HIDE_COST ? `Needs ${fmtMoney(HIDE_COST)}` : undefined,
      };
    }
    default:
      return { title: '?', effects: [], cost: 0, because: '', disabledReason: 'Unknown', category: 'event' };
  }
}

export function commitFugitive(ctx: Ctx, a: TravelAction): void {
  if (a.type === 'exile') exileAbroad(ctx, a.personId);
  else if (a.type === 'surrender') endFlight(ctx, a.personId, 'surrendered');
  else if (a.type === 'comeHome') comeHome(ctx, a.personId);
  // flee and hide are carried by their effects.
}

/* ---------------------------------------------------------------- */
/* Running                                                           */
/* ---------------------------------------------------------------- */

function wantedNews(s: GameState, _c: Character, text: string, headline: string): void {
  s.news.push({ week: s.week, date: { ...s.date }, paper: BULLETIN, headline, body: text, kind: 'wanted' });
}

/** Engine-side: he runs. */
export function startFlight(ctx: Ctx, plan: FleePlan): Fugitive | undefined {
  const s = ctx.s;
  const tr = ensureTravel(s);
  const c = s.characters[plan.personId];
  const d = FLEE_DESTS[plan.dest];
  if (!c?.alive || !d || fugitiveOf(s, c.id) || !isFree(s, c)) return undefined;
  const days = legDays(plan.mode, d.miles);
  const now = today(s);
  const t: Trip = {
    id: `trip${s.nextId++}`, purpose: 'lam', leaderId: c.id, party: [], guests: [], driverIds: plan.driverId && plan.mode === 'cars' ? [plan.driverId] : [], destId: plan.dest,
    mode: plan.mode, tier: 'modest', cars: plan.mode === 'cars' ? 1 : 0, days: [], departDay: now, arriveDay: now + days, leaveDay: 1e9, homeDay: 1e9,
    cost: 0, journal: [], done: 0, legs: [],
  };
  tr.trips.push(t);
  const cov = cover(s, plan);
  const f: Fugitive = {
    personId: c.id, dest: plan.dest, mode: plan.mode, tripId: t.id, since: s.week, manhunt: startManhunt(s, plan), cover: cov.value,
    safehouseId: plan.safehouseId, papers: plan.papers, driverId: plan.driverId, sightings: 0,
  };
  // A rat for a landlord is the worst luck there is (the cover number does not show it).
  const h = plan.safehouseId ? s.characters[plan.safehouseId] : undefined;
  if (h?.informantFor === 'law') f.cover = Math.max(0.05, f.cover - 0.3);
  if (c.id === s.playerId) {
    const l = legalOf(s);
    f.stageWhenFled = l.stage;
    if (l.bail) {
      f.bailForfeited = BAIL;
      l.bail = false;
      s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${displayName(c)} jumped bail. The ${fmtMoney(BAIL)} bond is forfeit.`, kind: 'heat' });
    }
  } else {
    c.busyUntil = s.week + 520;
  }
  if (plan.driverId) {
    const dr = s.characters[plan.driverId];
    if (dr) {
      dr.busyUntil = s.week + Math.ceil(days / 7) + 1;
      addStory(s, dr, `Drove ${c.firstName} to ${d.name} when the law came looking.`);
      addOpinion(s, c.id, dr.id, 'Drove me out when it mattered', 15, 1);
    }
  }
  if (h) {
    addStory(s, h, `Hid ${c.firstName} from the law.`);
    addOpinion(s, c.id, h.id, 'Hid me from the law', 15, 1);
  }
  tr.fugitives.push(f);
  tr.stats.flights++;
  journal(s, t, `Gone. ${MODES[plan.mode].name} to ${d.name}.`, 'bad', now);
  const text = `${displayName(c)} disappeared. Federal agents say he has fled to avoid prosecution.`;
  s.chronicle.push({ week: s.week, date: { ...s.date }, text, kind: 'heat' });
  ctx.log.push(`${displayName(c)} went on the lam: ${d.name}.`);
  wantedNews(s, c, `The FBI has issued a warrant for ${displayName(c)} for unlawful flight to avoid prosecution. Anyone with information is asked to call the Newark field office.`, `WANTED: ${c.firstName.toUpperCase()} ${c.lastName.toUpperCase()}`);
  return f;
}

/** A leg of the escape was seen (an airport, a station). */
export function onLamLeg(ctx: Ctx, t: Trip, what: 'sighting'): void {
  const s = ctx.s;
  const f = s.travel?.fugitives.find((x) => x.tripId === t.id && !x.end);
  if (!f || what !== 'sighting') return;
  f.manhunt = Math.min(100, f.manhunt + 10);
  f.sightings++;
  journal(s, t, `${t.mode === 'plane' ? 'At the airport' : 'At the station'} a man in a raincoat looked at him twice. (Manhunt +10)`, 'bad');
  if (rand(T(s)) < captureChance(f) * 0.5) endFlight(ctx, f.personId, 'caught');
}

function bossLabel(s: GameState, f: Fugitive): string {
  const c = s.characters[f.personId];
  return `On the lam: ${c?.firstName ?? '?'} in ${FLEE_DESTS[f.dest].name}`;
}

/** The weekly life of everyone in hiding. */
export function fugitiveWeek(ctx: Ctx): void {
  const s = ctx.s;
  const tr = s.travel;
  if (!tr || !tr.fugitives.length) return;
  for (const f of tr.fugitives) {
    if (f.end) continue;
    const c = s.characters[f.personId];
    const t = tr.trips.find((x) => x.id === f.tripId);
    if (!c?.alive) {
      f.end = 'caught';
      f.endWeek = s.week;
      if (t) t.over = true;
      continue;
    }
    if (!isFree(s, c)) {
      endFlight(ctx, c.id, 'caught');
      continue;
    }
    const d = FLEE_DESTS[f.dest];
    const label = bossLabel(s, f);
    const arrived = !t || t.arriveDay <= today(s) + 6;
    // The cost of hiding, and the isolation.
    money(ctx, -(c.id === s.playerId ? fleeDrain(s, f.dest, c.id) : Math.round(d.drain / 2)), `${label}: rent, food, and a man who brings the papers`, 'cost');
    addStress(s, c.id, d.isolation + (s.week - f.since > 26 ? 1 : 0), 'paranoia');
    // The manhunt.
    f.manhunt = Math.max(0, Math.min(100, Math.round((f.manhunt + manhuntGrowth(s, f)) * 10) / 10));
    if (f.manhunt >= 80 && !s.flags[`tenmost_${c.id}`]) {
      s.flags[`tenmost_${c.id}`] = 1;
      wantedNews(s, c, `${displayName(c)} has been added to the FBI's list of the Ten Most Wanted Fugitives. His photograph will hang in every post office in America.`, `${c.lastName.toUpperCase()} NAMED TO 'TEN MOST WANTED'`);
      heat(ctx, 'federal', 3, `${label}: the Ten Most Wanted list`, 'heat');
    }
    // The case drifts while he is gone: witnesses move, forget, recant.
    const ev = c.evidence ?? 0;
    let drop = 0.6;
    if (rand(tr) < 0.02) {
      drop += 12;
      ctx.log.push(`${label}: a key witness against ${c.firstName} has recanted.`);
    }
    c.evidence = Math.max(0, Math.round((ev - drop) * 10) / 10);
    if (!f.collapsed && (c.evidence ?? 0) < 20) {
      f.collapsed = true;
      if (c.id === s.playerId) {
        const l = legalOf(s);
        Object.assign(l, { stage: 'quiet', defense: 0, since: s.week, next: undefined, bail: undefined });
      }
      const text = `The case against ${displayName(c)} has collapsed. The witnesses are gone and the U.S. Attorney has moved on.`;
      s.chronicle.push({ week: s.week, date: { ...s.date }, text, kind: 'heat' });
      s.news.push({ week: s.week, date: { ...s.date }, paper: LEADER, headline: `CHARGES QUIETLY DROPPED IN ${c.lastName.toUpperCase()} CASE`, body: text, kind: 'wanted' });
      s.eventQueue.push(buildCollapsed(s, f));
      f.askedWeek = s.week;
      continue;
    }
    if (f.collapsed || !arrived) continue;
    // Seen?
    if (rand(tr) < sightingChance(f)) {
      f.sightings++;
      tr.stats.sightings++;
      f.manhunt = Math.min(100, f.manhunt + 8);
      const where = d.abroad ? `in ${d.name.replace(/ \(.+\)$/, '')}` : f.dest === 'vineland' ? 'near Vineland' : 'in Florida';
      s.news.push({ week: s.week, date: { ...s.date }, paper: BULLETIN, headline: `${c.lastName.toUpperCase()} REPORTED SEEN ${where.toUpperCase()}`, body: `A tipster told agents ${displayName(c)} was seen ${where}. The FBI would not comment.`, kind: 'wanted' });
      if (t) journal(s, t, `Somebody saw him ${where}. (Manhunt +8)`, 'bad');
      if (rand(tr) < captureChance(f)) {
        endFlight(ctx, c.id, 'caught');
        continue;
      }
    }
    // A messenger from Wildwood now and then.
    if (s.week - (f.askedWeek ?? f.since) >= 6) {
      f.askedWeek = s.week;
      s.eventQueue.push(buildMessenger(s, f));
    }
  }
}

function buildCollapsed(s: GameState, f: Fugitive): EventInstance {
  const c = s.characters[f.personId];
  const d = FLEE_DESTS[f.dest];
  const label = bossLabel(s, f);
  return {
    iid: `ev${s.nextId++}`, defId: 'lam_collapsed', week: s.week, mandatory: true, priority: 88, title: 'The case is gone', actors: [c.id], meta: { fugitive: c.id },
    text: `A lawyer's letter reaches ${d.name}: the witnesses have scattered and the government has dropped the case against ${c.firstName}. He can come home — quietly.`,
    defaultChoiceId: 'home',
    choices: [
      { id: 'home', label: 'Come home', because: 'came home when the case collapsed', effects: [{ type: 'travel', op: { op: 'comeHome', personId: c.id }, label }] },
      { id: 'stay', label: 'Stay put a while longer', detail: 'Cases have a way of coming back.', because: 'stayed in hiding a little longer', effects: [{ type: 'dyn', op: { op: 'stress', charId: c.id, amount: 3, source: 'paranoia' }, label }] },
    ],
  };
}

function buildMessenger(s: GameState, f: Fugitive): EventInstance {
  const c = s.characters[f.personId];
  const d = FLEE_DESTS[f.dest];
  const label = bossLabel(s, f);
  const weeks = s.week - f.since;
  const isBoss = c.id === s.playerId;
  const heir = isBoss ? chooseHeir(s, player(s)).heir : undefined;
  const choices: Choice[] = [
    { id: 'sit', label: 'Sit tight', because: 'sat tight in hiding', effects: [] },
    { id: 'hide', label: `Send money to stay hidden (${fmtMoney(HIDE_COST)})`, detail: 'A new address, a cop paid to look elsewhere.', because: 'paid to stay hidden', effects: [{ type: 'money', amount: -HIDE_COST, label }, { type: 'travel', op: { op: 'cover', personId: c.id, amount: 0.08 }, label }, { type: 'travel', op: { op: 'manhunt', personId: c.id, amount: -6 }, label }], disabledReason: s.money < HIDE_COST ? `Needs ${fmtMoney(HIDE_COST)}` : undefined },
    { id: 'surrender', label: 'Come back and surrender', detail: 'With a lawyer, on his own terms. The trial will be harder for having run.', because: 'came back to surrender', effects: [{ type: 'travel', op: { op: 'surrender', personId: c.id }, label }] },
  ];
  if (d.abroad && weeks >= EXILE_WEEKS && (!isBoss || heir)) {
    choices.push({ id: 'exile', label: `Never come back`, detail: isBoss ? `Live out his days in ${d.name}. ${heir ? displayName(heir) : 'The heir'} takes the chair.` : 'He leaves the family for good.', because: `stayed in ${d.name} for good`, effects: [{ type: 'travel', op: { op: 'exile', personId: c.id }, label }] });
  }
  return {
    iid: `ev${s.nextId++}`, defId: 'lam_messenger', week: s.week, mandatory: true, priority: 70, title: `A messenger from Wildwood`, actors: [c.id], meta: { fugitive: c.id },
    text: `${weeks} weeks in ${d.name}. ${f.manhunt >= 60 ? 'His face is on the post office wall.' : f.manhunt >= 30 ? 'The Bureau is still asking questions.' : 'The Bureau seems to have other cases.'} A cousin brings the news from home, a sack of mail and an envelope of cash.${isBoss ? ` The men say ${s.travel?.acting ? s.characters[s.travel.acting.id]?.firstName ?? 'the acting boss' : 'nobody'} is running things.` : ''} (Manhunt ${Math.round(f.manhunt)}, cover ${Math.round(f.cover * 100)}%)`,
    defaultChoiceId: 'sit', choices,
  };
}

/* ---------------------------------------------------------------- */
/* Endings                                                           */
/* ---------------------------------------------------------------- */

function closeTrip(s: GameState, f: Fugitive): void {
  const t = s.travel?.trips.find((x) => x.id === f.tripId);
  if (t) t.over = true;
}

/** Surrender or capture: home, and the case goes on — harder. */
export function endFlight(ctx: Ctx, personId: string, how: 'surrendered' | 'caught'): void {
  const s = ctx.s;
  const tr = ensureTravel(s);
  const f = fugitiveOf(s, personId);
  const c = s.characters[personId];
  if (!f || !c) return;
  f.end = how;
  f.endWeek = s.week;
  closeTrip(s, f);
  const caught = how === 'caught';
  if (caught) tr.stats.captures++;
  else tr.stats.surrenders++;
  const d = FLEE_DESTS[f.dest];
  const label = `${caught ? 'Caught' : 'Surrendered'}: ${c.firstName} ${c.lastName}`;
  if (c.id === s.playerId) {
    const l = legalOf(s);
    const ev = caught ? 15 : 6;
    c.evidence = Math.max(0, Math.min(100, (c.evidence ?? 0) + ev));
    if (f.stageWhenFled === 'indicted' || f.stageWhenFled === 'trial' || l.stage === 'indicted' || l.stage === 'trial') {
      l.stage = 'trial';
      l.bail = false;
      l.next = s.week + TRIAL_WEEKS;
      l.since = s.week;
      l.defense = Math.max(0, l.defense - (caught ? 10 : 5));
      c.imprisonedUntil = s.week + TRIAL_WEEKS;
    } else {
      l.stage = 'grandjury';
      l.next = s.week + Math.ceil(GJ_WEEKS / 2);
      l.since = s.week;
    }
    respect(ctx, caught ? -6 : -2, `${label}: ${caught ? 'dragged home in handcuffs' : 'walked in with his lawyer'}`, 'heat');
    if (caught && s.cutscenes.length < 3) s.cutscenes.push({ key: 'arrest_interrogation', title: 'Caught', text: `${d.abroad ? 'Extradited' : 'Picked up'} after ${s.week - f.since} weeks on the run. ${c.firstName} asks for his hat.`, week: s.week });
  } else {
    c.busyUntil = s.week;
    const weeks = Math.round((caught ? 26 : 13) + (c.evidence ?? 0) / (caught ? 2 : 3));
    applyEffects(ctx, [{ type: 'imprison', charId: c.id, weeks, label }], { label, because: caught ? 'was caught on the lam' : 'surrendered', category: 'event' });
    c.evidence = Math.max(0, (c.evidence ?? 0) - 20);
    addStory(s, c, caught ? `Caught in ${d.name} after ${s.week - f.since} weeks on the run.` : `Came back from ${d.name} and gave himself up.`);
  }
  const text = caught
    ? `${displayName(c)} was ${d.abroad ? 'arrested in ' + d.name + ' and extradited' : 'arrested at a hideout ' + (f.dest === 'vineland' ? 'near Vineland' : 'in Florida')} after ${s.week - f.since} weeks on the run.`
    : `${displayName(c)} walked into the federal building with his lawyer and surrendered after ${s.week - f.since} weeks on the run.`;
  s.chronicle.push({ week: s.week, date: { ...s.date }, text, kind: 'heat' });
  s.news.push({ week: s.week, date: { ...s.date }, paper: BULLETIN, headline: caught ? `FUGITIVE ${c.lastName.toUpperCase()} CAPTURED` : `${c.lastName.toUpperCase()} GIVES HIMSELF UP`, body: text, kind: 'wanted' });
  ctx.log.push(text);
}

/** The case is gone (or never was): he comes home quietly. */
export function comeHome(ctx: Ctx, personId: string): void {
  const s = ctx.s;
  const tr = ensureTravel(s);
  const f = fugitiveOf(s, personId);
  const c = s.characters[personId];
  if (!f || !c) return;
  if (!f.collapsed && wantedFor(s, personId)) {
    endFlight(ctx, personId, 'surrendered');
    return;
  }
  f.end = 'returned';
  f.endWeek = s.week;
  tr.stats.returns++;
  const t = tr.trips.find((x) => x.id === f.tripId);
  if (t) {
    // Turn the one-way trip into a trip home.
    const days = legDays(t.mode, FLEE_DESTS[f.dest].miles);
    t.purpose = 'business';
    t.leaveDay = Math.max(t.arriveDay, today(s));
    t.homeDay = t.leaveDay + days;
    t.legs = ['out'];
    journal(s, t, 'Coming home.', 'good');
  }
  if (c.id !== s.playerId) c.busyUntil = s.week + 1;
  const text = `${displayName(c)} came home quietly after ${s.week - f.since} weeks away. Nobody was waiting at the station.`;
  s.chronicle.push({ week: s.week, date: { ...s.date }, text, kind: 'heat' });
  ctx.log.push(text);
}

/** He never comes back: abroad for good (the boss abdicates to his heir). */
export function exileAbroad(ctx: Ctx, personId: string): void {
  const s = ctx.s;
  const tr = ensureTravel(s);
  const f = fugitiveOf(s, personId);
  const c = s.characters[personId];
  if (!f || !c) return;
  const d = FLEE_DESTS[f.dest];
  if (!d.abroad) return;
  if (c.id === s.playerId) {
    const heir = chooseHeir(s, c).heir;
    if (!heir) return;
    f.end = 'exiled';
    f.endWeek = s.week;
    tr.stats.exiles++;
    closeTrip(s, f);
    succeed(ctx, c);
    if (s.playerId === c.id) return;
    c.rank = 'civilian';
    c.wealth = 0;
    c.busyUntil = s.week + 5200;
    famMut(s, c.id).retired = s.week;
    for (const dd of s.districts) if (dd.capoId === c.id) dd.capoId = undefined;
    addOpinion(s, s.playerId, c.id, 'Left me the chair from exile', 15, 1);
    const text = `${displayName(c)} will live out his days in ${d.name}. ${displayName(s.characters[s.playerId])} is the head of the house now.`;
    s.dynastyHistory.push({ week: s.week, date: { ...s.date }, text });
    s.chronicle.push({ week: s.week, date: { ...s.date }, text, kind: 'succession' });
    ctx.log.push(text);
  } else {
    f.end = 'exiled';
    f.endWeek = s.week;
    tr.stats.exiles++;
    closeTrip(s, f);
    applyEffects(ctx, [{ type: 'exile', charId: c.id, label: `${c.firstName} stays in ${d.name} for good` }], { label: 'Exile', because: `stayed in ${d.name}`, category: 'event' });
    if (s.characters[c.id]) s.characters[c.id].busyUntil = s.week + 5200;
    s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${displayName(c)} will never come back from ${d.name}.`, kind: 'misc' });
  }
}

/* ---------------------------------------------------------------- */
/* Effect ops                                                        */
/* ---------------------------------------------------------------- */

export function applyFugitiveOp(ctx: Ctx, op: TravelOp, label: string): void {
  const s = ctx.s;
  switch (op.op) {
    case 'flee':
      startFlight(ctx, op.plan);
      break;
    case 'manhunt': {
      const f = fugitiveOf(s, op.personId);
      if (f) f.manhunt = Math.max(0, Math.min(100, f.manhunt + op.amount));
      break;
    }
    case 'cover': {
      const f = fugitiveOf(s, op.personId);
      if (f) f.cover = Math.max(0.05, Math.min(0.9, Math.round((f.cover + op.amount) * 100) / 100));
      break;
    }
    case 'comeHome':
      comeHome(ctx, op.personId);
      break;
    case 'surrender':
      endFlight(ctx, op.personId, 'surrendered');
      break;
    case 'tail': {
      const t = s.travel?.trips.find((x) => x.id === op.tripId);
      const f = t ? s.travel?.fugitives.find((x) => x.tripId === t.id && !x.end) : undefined;
      if (!t || !f) break;
      const drv = t.driverIds.map((id) => s.characters[id]).find((c) => c?.alive);
      if (op.outcome === 'lose') {
        const p = 0.5 + (drv && (drv.craft === 'driver' || drv.specialty === 'wheelman') ? 0.3 : 0);
        if (rand(T(s)) < p) journal(s, t, 'Lost them on the back roads below Dover.', 'good');
        else { f.manhunt = Math.min(100, f.manhunt + 12); journal(s, t, 'They stuck. Now they know which way he went. (Manhunt +12)', 'bad'); }
      } else if (op.outcome === 'wave') {
        f.manhunt = Math.min(100, f.manhunt + 8);
      } else {
        t.arriveDay += 2;
        f.manhunt = Math.max(0, f.manhunt - 2);
        journal(s, t, 'Two days in a motel outside Salisbury with the blinds down.', 'neutral');
      }
      break;
    }
    case 'exile':
      exileAbroad(ctx, op.personId);
      break;
  }
  void label;
}

export function describeFugitiveOp(s: GameState, op: TravelOp): string | undefined {
  switch (op.op) {
    case 'flee': {
      const d = FLEE_DESTS[op.plan.dest];
      return `${s.characters[op.plan.personId]?.firstName ?? '?'} goes on the lam: ${d?.name ?? '?'}`;
    }
    case 'manhunt': return `Manhunt ${op.amount > 0 ? '+' : '−'}${Math.abs(op.amount)}`;
    case 'cover': return `Cover +${Math.round(op.amount * 100)}%`;
    case 'comeHome': return 'Comes home quietly';
    case 'surrender': return 'Surrenders: back to face the case (harder)';
    case 'exile': return 'Never comes back';
    default:
      return undefined;
  }
}

/* ---------------------------------------------------------------- */
/* The Flee option where bail and indictment are decided             */
/* ---------------------------------------------------------------- */

/** Default escape plans for a man (quiet and close; far and safe). */
export function defaultFleePlans(s: GameState, personId: string): FleePlan[] {
  const crewHelp = Object.values(s.characters).filter((c) => c.alive && c.id !== personId && isFree(s, c) && (c.dynasty || c.faction === 'player') && ageOn(c.birth, s.date) >= 21);
  const safe = crewHelp.sort((a, b) => opinion(s, b.id, personId) - opinion(s, a.id, personId))[0];
  const driver = crewHelp.find((c) => c.faction === 'player' && (c.craft === 'driver' || c.specialty === 'wheelman') && !tripOf(s, c.id));
  return [
    { personId, dest: 'vineland', mode: 'cars', safehouseId: safe?.id, driverId: driver?.id },
    { personId, dest: 'oldcountry', mode: 'plane', papers: true },
  ];
}

/** Extra choices for the indictment card (a small hook in longgame.ts). */
export function fleeChoices(s: GameState): Choice[] {
  const id = s.playerId;
  return defaultFleePlans(s, id).map((plan) => {
    const d = FLEE_DESTS[plan.dest];
    const q = fleeQuote(s, plan);
    // At indictment time he is not out on bail yet, so the stage check uses the indictment itself.
    const block = q.block === 'Nobody is looking for him' ? undefined : q.block;
    const label = `On the lam: ${d.name}`;
    return {
      id: `flee_${plan.dest}`,
      label: plan.dest === 'vineland' ? 'Run: the farm in Vineland (a quiet car)' : 'Run: the old country (a plane from Idlewild)',
      detail: `${d.blurb} Manhunt starts at ${q.manhunt}; ${d.extradition >= 1 ? 'a capture means jail' : `extradition risk ${Math.round(d.extradition * 100)}%`}. ${fmtMoney(d.drain)}/week.`,
      because: `ran from the indictment to ${d.name}`,
      effects: [{ type: 'money', amount: -q.cost, label }, { type: 'travel', op: { op: 'flee', plan }, label }] as Effect[],
      disabledReason: block,
    };
  });
}

export { FLEE_IDS };
export type { FugitiveDest, TravelMode };
