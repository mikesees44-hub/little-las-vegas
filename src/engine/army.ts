import { crew, displayName, isFree } from './characters';
import { ESTIMATE_BAND } from './devData';
import { tierOf } from './devState';
import { applyEffects, fmtMoney, shiftInfluence } from './effects';
import { alliedWithFaction } from './familyHouses';
import { dice, eraWith, ledgerOf } from './intrigue';
import { playerHook, type Acceptance, type Reason } from './interactions';
import { heat, money, respect, type Ctx } from './ledger';
import { outlook } from './minds/planner';
import { grudge } from './minds/memory';
import { NYC_FAMILIES, type NycFamilyId } from './nycData';
import { atWar as nycAtWar, familyOpinion, grievanceOf } from './nyc';
import { addOpinion, opinion } from './relations';
import { rand } from './rng';
import { crewStrength, outReason, rivalStrength } from './strength';
import { level, hasPerk } from './crewXp';
import { pactWith, rivalRelation } from './talks';
import { changeScore, endWar } from './war';
import { FACTION_NAMES } from './world';
import { backMeter } from './myMen';
import { capoLevyReasons } from './capos';
import {
  ensureArmy, type AllyId, type AllyOffer, type ArmyAction, type ArmyState, type BandId, type BattleHow, type BattleRecord,
  type Campaign, type Commitment, type PendingBattle, type WarGoal,
} from './armyState';
import type { ActionPreview } from './actions';
import type { Character, Effect, EventInstance, FactionId, GameState, PlayerChoices, RivalId, War } from './types';

/**
 * THE ARMY — CK levies for the mob (design: "raise the troops").
 *
 * Your strength in a war is the men under arms. You call them up crew by
 * crew (a capo who doesn't love you sends fewer, or stalls), hire outside
 * muscle by the week, arm them (the development screen's equipment), and go
 * to the mattresses. Men under arms are off their rackets (the take drops),
 * cost upkeep, draw heat and get tired.
 *
 * Other families can be asked to send men (a call to arms): they weigh what
 * they think of you, marriages and pacts, the hooks you hold, what you
 * offer, their own wars and whether you look like the winning side. Their
 * men fight beside yours, shown separately, and they want paying after.
 *
 * Every war is a campaign: the enemy pushes along a road into Wildwood
 * (Philadelphia over the Rio Grande causeway, the easier way in), massing
 * men at a district; the boss answers — meet them, lead the men himself,
 * hit them first, or fall back. A battle is decided by strength (men x
 * quality x morale x leadership x ground x surprise) and the dice; the loser
 * takes the heavier losses (hurt, picked up, killed: off-screen, combat
 * outcomes, never a man handed over), the district changes hands, and the
 * war score moves. At the thresholds the losing side offers terms.
 *
 * Philadelphia decides to come in on its own (a lean over its grievances:
 * short envelopes, insults, family heat, weakness, Sal's own nature and
 * grudges, as the minds layer reads him).
 */

/* ------------------------------------------------------------------ */
/* The map: the island's roads                                          */
/* ------------------------------------------------------------------ */

/** Which districts touch (the roads an army can take). */
export const ADJ: Record<string, string[]> = {
  causeway: ['docks', 'downtown'],
  docks: ['causeway', 'downtown', 'north'],
  north: ['docks', 'piers'],
  downtown: ['causeway', 'docks', 'pacific', 'crest'],
  pacific: ['downtown', 'boardwalk', 'piers'],
  boardwalk: ['pacific', 'piers', 'crest'],
  piers: ['boardwalk', 'pacific', 'north'],
  crest: ['downtown', 'boardwalk'],
};
/** The heart of the island: where the boss lives and the money is. */
export const CORE = ['pacific', 'boardwalk', 'piers', 'downtown'];
/** Where each family comes onto the island. Philadelphia (and Atlantic City) come over the causeway. */
export const ENTRY: Partial<Record<RivalId, string>> = { philly: 'causeway', manno: 'causeway', kessler: 'north', feldstein: 'boardwalk' };
/** The district they drive for. */
export const HEART = 'pacific';

/** The road from a family's entry to the heart of the island (breadth-first, deterministic). */
export function pathFor(s: GameState, rival: RivalId): string[] {
  const ids = new Set(s.districts.map((d) => d.id));
  const start = ENTRY[rival] && ids.has(ENTRY[rival]!) ? ENTRY[rival]! : s.districts.find((d) => d.id === s.rivals.find((r) => r.id === rival)?.homeDistrict)?.id ?? s.districts[0]?.id;
  if (!start) return [];
  const prev: Record<string, string | null> = { [start]: null };
  const q = [start];
  while (q.length) {
    const x = q.shift()!;
    if (x === HEART) break;
    for (const y of ADJ[x] ?? []) if (ids.has(y) && !(y in prev)) { prev[y] = x; q.push(y); }
  }
  if (!(HEART in prev)) return [start];
  const out: string[] = [];
  for (let x: string | null = HEART; x; x = prev[x]) out.unshift(x);
  return out;
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

/** Weekly upkeep per man under arms (food, cars, rooms, a little extra in the envelope). */
export const RAISE_UPKEEP = 40;
export const SAFEHOUSE_SETUP = 800;
export const SAFEHOUSE_WEEKLY = 300;
/** A battle with this many men on both sides together is a big one. */
export const BIG_BATTLE = 24;
/** Men on the street (not called up) fight at this share of their strength. */
export const UNRAISED_SHARE = 0.4;
export const ATTACK_COST = 600;
export const PACT_GIFT = 2500;
export const PACT_WEEKS = 52;
export const COMMIT_WEEKS = 16;

export const BANDS: Record<BandId, { name: string; men: number; q: number; weekly: number; heat: number; blurb: string }> = {
  toughs: { name: 'Boardwalk toughs', men: 6, q: 2.2, weekly: 450, heat: 1, blurb: 'Bouncers, longshoremen, a couple of ex-boxers. Cheap, loud, not much good when it gets serious.' },
  irish: { name: 'The Kensington Irish', men: 7, q: 3.1, weekly: 1100, heat: 2, blurb: 'A Philadelphia Irish crew with no love for Sal Moretti. Hard men; they drink on your tab.' },
  shooters: { name: 'Out-of-town shooters', men: 4, q: 4.2, weekly: 1200, heat: 2, blurb: 'Four men from Youngstown nobody on the island has seen. The best money can rent.' },
};
export const BAND_IDS = Object.keys(BANDS) as BandId[];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const r1 = (v: number) => Math.round(v * 10) / 10;
const pct = (p: number) => `${Math.round(p * 100)}%`;

function districtName(s: GameState, id: string): string {
  return s.districts.find((d) => d.id === id)?.name ?? id;
}
export function rivalLabel(s: GameState, id: RivalId | FactionId): string {
  if (id === 'philly') return 'Philadelphia';
  return s.rivals.find((r) => r.id === id)?.shortName ?? FACTION_NAMES[id as FactionId] ?? String(id);
}
function note(A: ArmyState, week: number, text: string): void {
  A.log.push([week, text]);
  if (A.log.length > 40) A.log.splice(0, A.log.length - 40);
}

/** Read-only: the army layer if the save has one. */
export function armyOf(s: GameState): ArmyState | undefined {
  return s.army;
}

/* ------------------------------------------------------------------ */
/* Raising the troops                                                  */
/* ------------------------------------------------------------------ */

export interface CrewLevy {
  holder: string;
  name: string;
  capoId?: string;
  members: number;
  /** Free to fight this week. */
  available: number;
  raised: number;
  /** Power per man (muscle, gear, experience). */
  perMan: number;
  /** Share of his men a call-up brings, and why. */
  willing: number;
  reasons: Reason[];
  late?: number;
  stalled?: boolean;
}

/** How much of a crew answers the call: a capo who doesn't love you sends fewer, or stalls. */
export function willingness(s: GameState, holder: string): { f: number; reasons: Reason[]; stall: 'late' | 'never' | undefined } {
  const reasons: Reason[] = [];
  if (holder === 'family') {
    const own = crewStrengthCrews(s).find((c) => c.holder === 'family');
    const ids = own?.ids ?? [];
    const avg = ids.length ? ids.reduce((a, id) => a + opinion(s, id, s.playerId), 0) / ids.length : 0;
    reasons.push({ label: 'Your own men: they answer to you', value: 88 });
    reasons.push({ label: 'What they think of you', value: Math.round(avg / 3) });
    const back = backMeter(s);
    if (back !== 50) reasons.push({ label: 'Does the boss have our back?', value: Math.round((back - 50) / 4) });
    const v = reasons.reduce((a, r) => a + r.value, 0);
    return { f: clamp(v / 100, 0.4, 1), reasons, stall: v < 100 ? 'late' : undefined };
  }
  const k = s.characters[holder];
  if (!k) return { f: 0, reasons: [{ label: 'No such crew', value: -100 }], stall: 'never' };
  const op = opinion(s, k.id, s.playerId);
  reasons.push({ label: 'Base', value: 80 });
  reasons.push({ label: `${k.firstName} thinks of you`, value: Math.round(op / 2) });
  const traits = k.traits;
  if (traits.includes('Loyal-to-a-fault')) reasons.push({ label: 'Loyal to a fault', value: 25 });
  if (traits.includes('Ambitious')) reasons.push({ label: 'Ambitious: keeps some back for himself', value: -10 });
  if (traits.includes('Cowardly')) reasons.push({ label: 'Cowardly', value: -15 });
  if (traits.includes('Greedy')) reasons.push({ label: 'Greedy: his men are his income', value: -8 });
  if (k.courtedBy) reasons.push({ label: 'Another family is courting him', value: -15 });
  // His stance and his last crisis move (capos.ts): a rally, or men kept home.
  reasons.push(...capoLevyReasons(s, k));
  const back = backMeter(s);
  if (back !== 50) reasons.push({ label: 'Does the boss have our back?', value: Math.round((back - 50) / 4) });
  const v = reasons.reduce((a, r) => a + r.value, 0);
  return { f: clamp(v / 100, 0.2, 1), reasons, stall: v >= 100 ? undefined : op >= -15 ? 'late' : 'never' };
}

interface CrewLite { holder: string; name: string; capoId?: string; ids: string[]; free: Character[]; members: number; total: number }

/** The crews with the men free to fight (strength.ts), with ids. */
function crewStrengthCrews(s: GameState): CrewLite[] {
  const a = crewStrength(s);
  const all = crew(s);
  const capos = new Set(all.filter((c) => c.rank === 'capo').map((c) => c.id));
  return a.crews.map((c) => {
    const members = c.holder === 'family'
      ? all.filter((m) => !capos.has(m.id) && !(m.capoId && capos.has(m.capoId)))
      : all.filter((m) => m.id === c.holder || m.capoId === c.holder);
    return { holder: c.holder, name: c.name, capoId: c.capoId, ids: members.map((m) => m.id), free: members.filter((m) => !outReason(s, m)), members: c.members, total: c.total };
  });
}

/** One man's edge from his experience (crewXp.ts): levels, an Enforcer. */
function xpEdge(s: GameState, men: Character[]): number {
  if (!men.length) return 1;
  const lv = men.reduce((a, m) => a + level(s, m.id), 0) / men.length;
  const enf = men.filter((m) => hasPerk(s, m, 'enforcer')).length / men.length;
  return 1 + lv * 0.03 + enf * 0.12;
}

/** Every crew's call-up: what it has, what answers, what it is worth. */
export function levyView(s: GameState): CrewLevy[] {
  const A = s.army;
  return crewStrengthCrews(s).map((c) => {
    const avail = c.free.length;
    const perMan = avail ? (c.total / avail) * xpEdge(s, c.free) : 3;
    const w = willingness(s, c.holder);
    const lv = A?.levies[c.holder];
    return {
      holder: c.holder, name: c.name, capoId: c.capoId, members: c.members, available: avail,
      raised: Math.min(avail, lv?.n ?? 0), perMan: r1(perMan), willing: w.f, reasons: w.reasons,
      late: lv?.late, stalled: lv?.stalled,
    };
  });
}

export function raisedMen(s: GameState): number {
  return levyView(s).reduce((a, c) => a + c.raised, 0);
}
export function availableMen(s: GameState): number {
  return levyView(s).reduce((a, c) => a + c.available, 0);
}
export function hiredMen(s: GameState): number {
  return (s.army?.hired ?? []).reduce((a, h) => a + h.men, 0);
}
function hiredPower(s: GameState): number {
  return (s.army?.hired ?? []).reduce((a, h) => a + h.men * BANDS[h.band].q, 0);
}
/** Allies' men in a war (or in all wars). */
export function allyMen(s: GameState, warId?: string): number {
  return (s.army?.commits ?? []).filter((c) => (!warId || c.warId === warId) && c.until > s.week).reduce((a, c) => a + c.men, 0);
}
function allyPower(s: GameState, warId?: string): number {
  return (s.army?.commits ?? []).filter((c) => (!warId || c.warId === warId) && c.until > s.week).reduce((a, c) => a + c.men * allyQ(c.ally), 0);
}
function allyQ(id: AllyId): number {
  return id.startsWith('nyc:') ? 3.6 : id === 'camden' ? 3.4 : 3.2;
}

/* ------------------------------------------------------------------ */
/* Morale, upkeep, the commander                                        */
/* ------------------------------------------------------------------ */

export function morale(s: GameState): { v: number; reasons: Reason[] } {
  const A = s.army;
  const reasons: Reason[] = [{ label: 'Base', value: 60 }];
  const crews = crewStrengthCrews(s);
  const raisedIds = crews.flatMap((c) => c.free.slice(0, Math.max(0, A?.levies[c.holder]?.n ?? c.free.length)));
  const avg = raisedIds.length ? raisedIds.reduce((a, m) => a + opinion(s, m.id, s.playerId), 0) / raisedIds.length : 0;
  reasons.push({ label: 'What the men think of you', value: Math.round(clamp(avg / 3, -15, 15)) });
  const back = backMeter(s);
  if (back !== 50) reasons.push({ label: 'Does the boss have our back?', value: Math.round((back - 50) / 5) });
  if (A?.safehouses) reasons.push({ label: 'Safehouses: a bed, a phone, a hot meal', value: 8 });
  if (A?.glory) reasons.push({ label: 'Recent victories', value: Math.round(A.glory) });
  if (A?.weariness) reasons.push({ label: 'War weariness', value: -Math.round(A.weariness / 2) });
  return { v: Math.round(clamp(reasons.reduce((a, r) => a + r.value, 0), 10, 100)), reasons };
}
const moraleFactor = (m: number) => 0.7 + m / 250;
const leadFactor = (c: Character | undefined) => 0.85 + (c?.attributes.leadership ?? 40) / 300;

/** Who leads the men in the field: the underboss, else your best capo, else you. */
export function commanderOf(s: GameState): Character | undefined {
  const free = crew(s).filter((c) => !outReason(s, c));
  const ub = free.find((c) => c.rank === 'underboss');
  if (ub) return ub;
  const capos = free.filter((c) => c.rank === 'capo').sort((a, b) => b.attributes.leadership - a.attributes.leadership || (a.id < b.id ? -1 : 1));
  return capos[0] ?? s.characters[s.playerId];
}

/** Can the boss lead the men himself this week? */
export function bossCanLead(s: GameState): string | undefined {
  const b = s.characters[s.playerId];
  if (!b?.alive) return 'You are not among the living';
  if (!isFree(s, b)) return 'You are inside';
  const why = outReason(s, b);
  if (why === 'hurt') return 'You are in no shape to';
  if (why === 'away') return 'You are out of town';
  return undefined;
}

/** What a week under arms costs: upkeep, the hired men, safehouses, the take the men are not bringing in. */
export function weeklyBill(s: GameState): { upkeep: number; hired: number; safehouses: number; incomeLoss: number; total: number; heat: number } {
  const A = s.army;
  const raised = A ? raisedMen(s) : 0;
  const upkeep = raised * RAISE_UPKEEP;
  const hired = (A?.hired ?? []).reduce((a, h) => a + BANDS[h.band].weekly, 0);
  const safehouses = A?.safehouses ? SAFEHOUSE_WEEKLY : 0;
  const recent = s.incomeHistory.slice(-4);
  const avg = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 2000;
  const perMan = clamp(Math.round(avg / Math.max(4, crew(s).length) * 0.5), 25, 300);
  const incomeLoss = raised * perMan;
  const heatW = Math.round((raised + hiredMen(s) * 1.5) / 5);
  return { upkeep, hired, safehouses, incomeLoss, total: upkeep + hired + safehouses + incomeLoss, heat: heatW };
}

/* ------------------------------------------------------------------ */
/* The enemy                                                           */
/* ------------------------------------------------------------------ */

/** A family's men under arms and their quality (power per man). Philadelphia brings the Table's soldiers. */
export function enemyArmy(s: GameState, rival: RivalId): { men: number; q: number } {
  const r = s.rivals.find((x) => x.id === rival);
  if (!r) return { men: 0, q: 3 };
  const st = rivalStrength(s, r);
  const men = Math.round(st * 0.32) + (rival === 'philly' ? 6 : 0);
  const q = r1(3.1 * clamp(st / Math.max(1, r.muscle), 0.8, 1.4) * (rival === 'philly' ? 1.05 : 1));
  return { men, q };
}

/** Your spies inside a family (intrigue.ts). */
function spiesIn(s: GameState, rival: RivalId): number {
  return (s.intrigue?.spies ?? []).filter((x) => x.master === 'player' && x.inside === rival && !x.ended).length;
}

/** What you think they have: fogged unless you have spies inside or a good Information path. */
export function enemyEstimate(s: GameState, rival: RivalId, real: number): { lo: number; hi: number; mid: number; fogged: boolean; spies: number } {
  const spies = spiesIn(s, rival);
  const band = (ESTIMATE_BAND[tierOf(s, 'info')] ?? 0.3) * (spies ? 0.35 : 1);
  const h = dice(s, `armyEst:${rival}:${Math.floor(s.week / 2)}`);
  const mid = Math.max(0, real * (1 + (h - 0.5) * band));
  return { lo: Math.max(0, Math.round(mid * (1 - band))), hi: Math.round(mid * (1 + band) + 0.49), mid: Math.round(mid), fogged: !spies && tierOf(s, 'info') === 0, spies };
}

/* ------------------------------------------------------------------ */
/* Battles                                                             */
/* ------------------------------------------------------------------ */

/** The odds the side with `ours` beats `theirs` (pure; rises with `ours`, falls with `theirs`). */
export function battleOdds(ours: number, theirs: number): number {
  if (ours <= 0) return 0.03;
  if (theirs <= 0) return 0.97;
  return clamp((ours * ours) / (ours * ours + theirs * theirs), 0.03, 0.97);
}

export interface BattlePlan {
  how: BattleHow;
  /** Your power and men, theirs (real), and their men as you see them. */
  ours: number;
  ourMen: number;
  theirs: number;
  theirMen: number;
  est: { lo: number; hi: number; fogged: boolean };
  odds: number;
  big: boolean;
  /** Chance the man leading dies; the boss's own chance (whether or not he leads). */
  commanderRisk: number;
  bossRisk: number;
  commander?: Character;
  factors: Reason[];
  allies: number;
}

interface BattleSpot { warId: string; district: string; attacker: 'player' | RivalId; enemyMen: number }

/** Everything about a battle before you commit: your power, theirs, the odds, the risk to the men leading it. */
export function battlePlan(s: GameState, b: BattleSpot, how: BattleHow): BattlePlan {
  const w = s.wars.find((x) => x.id === b.warId);
  const rival = (w?.rival ?? 'philly') as RivalId;
  const camp = s.army?.camps[b.warId];
  const lev = levyView(s);
  const raisedP = lev.reduce((a, c) => a + c.raised * c.perMan, 0);
  const streetP = lev.reduce((a, c) => a + (c.available - c.raised) * c.perMan, 0) * UNRAISED_SHARE;
  const ourMen = lev.reduce((a, c) => a + c.raised, 0) + hiredMen(s) + allyMen(s, b.warId);
  const allies = allyMen(s, b.warId);
  const m = morale(s).v;
  const boss = s.characters[s.playerId];
  const cmd = how === 'lead' ? boss : commanderOf(s);
  const factors: Reason[] = [];
  const baseP = raisedP + streetP + hiredPower(s) + allyPower(s, b.warId);
  factors.push({ label: `Your men under arms (${lev.reduce((a, c) => a + c.raised, 0)})`, value: Math.round(raisedP) });
  if (streetP) factors.push({ label: 'Men still on the street (fight at 40%)', value: Math.round(streetP) });
  if (hiredMen(s)) factors.push({ label: `Hired muscle (${hiredMen(s)})`, value: Math.round(hiredPower(s)) });
  if (allies) factors.push({ label: `Allies' men (${allies})`, value: Math.round(allyPower(s, b.warId)) });
  let mult = moraleFactor(m) * leadFactor(cmd) * (how === 'lead' ? 1.05 : 1);
  factors.push({ label: `Morale ${m}`, value: Math.round((moraleFactor(m) - 1) * 100) });
  factors.push({ label: `${how === 'lead' ? 'You lead them' : `${cmd ? cmd.firstName : 'Nobody'} leads them`}`, value: Math.round((leadFactor(cmd) * (how === 'lead' ? 1.05 : 1) - 1) * 100) });
  const d = s.districts.find((x) => x.id === b.district);
  const theyHold = !!d && (camp?.occupied[b.district] === rival || ((d.influence[rival] ?? 0) > (d.influence.player ?? 0)));
  const weDefend = b.attacker !== 'player' && how !== 'strike';
  if (weDefend && !theyHold) { mult *= 1.15; factors.push({ label: 'Your ground: they come to you', value: 15 }); }
  if (weDefend && b.district === 'causeway') { mult *= 1.1; factors.push({ label: 'The causeway: whoever holds it sees everyone coming', value: 10 }); }
  if (s.army?.safehouses && weDefend) { mult *= 1.08; factors.push({ label: 'The mattresses: men ready, nobody home to find', value: 8 }); }
  if (how === 'strike') {
    const intel = spiesIn(s, rival) > 0 || tierOf(s, 'info') >= 2;
    const f = intel ? 1.25 : 1.06;
    mult *= f;
    factors.push({ label: intel ? 'Hit them first: you know where they sleep' : 'Hit them first (without inside word, they may be ready)', value: Math.round((f - 1) * 100) });
  }
  const ours = baseP * mult;
  // Theirs.
  const r = s.rivals.find((x) => x.id === rival);
  const q = camp?.enemyQ ?? enemyArmy(s, rival).q;
  const theirMen = b.enemyMen;
  let tm = 1;
  const leader = r ? s.characters[r.leaderId] : undefined;
  tm *= leadFactor(leader);
  if (rival === 'philly') tm *= 1.1;
  if (!weDefend && theyHold) tm *= 1.15;
  if (b.attacker === 'player' && b.district === 'causeway' && theyHold) tm *= 1.1;
  tm *= 1 - (camp?.enemyTired ?? 0) / 400;
  const theirs = theirMen * q * tm;
  if (rival === 'philly') factors.push({ label: 'Philadelphia: the easier way in (the causeway, the Table\'s men, the supply line)', value: -10 });
  const odds = battleOdds(ours, theirs);
  const est = enemyEstimate(s, rival, theirMen);
  const big = ourMen + theirMen >= BIG_BATTLE;
  const support = allies ? 0.6 : 1.5;
  const safe = s.army?.safehouses ? 0.7 : 1;
  const deathIfLost = (big ? 0.15 : 0.08) * support * safe;
  const commanderRisk = clamp((1 - odds) * deathIfLost + odds * 0.02, 0, 0.6);
  const coreHit = CORE.includes(b.district) ? 0.04 : 0.01;
  const bossRisk = how === 'lead' ? commanderRisk : clamp((1 - odds) * coreHit * support * (s.army?.safehouses ? 0.35 : 1) * (big ? 1.3 : 1), 0, 0.3);
  return { how, ours: r1(ours), ourMen, theirs: r1(theirs), theirMen, est: { lo: est.lo, hi: est.hi, fogged: est.fogged }, odds, big, commanderRisk, bossRisk, commander: cmd, factors, allies };
}

/** Pick `n` of your men from the crews under arms (deterministic order, the army's dice). */
function casualties(s: GameState, A: ArmyState, n: number): { m: Character; holder: string }[] {
  const lev = crewStrengthCrews(s);
  const pool: { m: Character; holder: string }[] = [];
  for (const c of lev) {
    const k = A.levies[c.holder]?.n ?? 0;
    pool.push(...c.free.filter((m) => m.id !== s.playerId && m.rank !== 'underboss').sort((a, b) => (a.id < b.id ? -1 : 1)).slice(0, k).map((m) => ({ m, holder: c.holder })));
  }
  const out: { m: Character; holder: string }[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rand(A) * pool.length), 1)[0]);
  return out;
}

/**
 * Fight it out. `roll` (0..1) can be given (tests); otherwise the army's dice.
 * Losses are combat outcomes: men hurt, picked up or killed — never handed over.
 */
export function resolveBattle(ctx: Ctx, b: PendingBattle, how: BattleHow, roll?: number): BattleRecord | undefined {
  const s = ctx.s;
  const A = ensureArmy(s);
  A.pending = A.pending.filter((x) => x.id !== b.id);
  const w = s.wars.find((x) => x.id === b.warId);
  if (!w) return undefined;
  const camp = ensureCampaign(s, w);
  const rival = w.rival;
  const r = s.rivals.find((x) => x.id === rival);
  const dn = districtName(s, b.district);
  const label = `Battle for ${dn}`;
  const theyName = rivalLabel(s, rival);
  if (how === 'fallback') {
    occupy(s, camp, b.district, rival);
    changeScore(s, w.id, -5);
    A.glory = Math.max(0, A.glory - 3);
    const text = `You pulled the men back from ${dn}. ${theyName} walked in without a fight.`;
    const rec: BattleRecord = { week: s.week, warId: w.id, rival, district: b.district, how, won: false, ours: 0, theirs: 0, odds: 0, ourLost: 0, theirLost: 0, big: false, text };
    pushRecord(s, A, rec);
    ctx.log.push(text);
    return rec;
  }
  const plan = battlePlan(s, b, how);
  const x = roll ?? rand(A);
  const won = x < plan.odds;
  // Losses: the loser bleeds more; a lopsided fight bleeds the weak side worst.
  const ourShare = won ? 0.06 + 0.08 * (1 - plan.odds) : 0.18 + 0.15 * (1 - plan.odds);
  const theirShare = won ? 0.18 + 0.15 * plan.odds : 0.06 + 0.08 * plan.odds;
  let ourLost = Math.round(plan.ourMen * ourShare);
  const theirLost = Math.min(camp.enemyMen, Math.max(1, Math.round(b.enemyMen * theirShare)));
  camp.enemyMen = Math.max(0, camp.enemyMen - theirLost);
  if (r) r.muscle = Math.max(5, Math.round(r.muscle - theirLost * 0.6));
  // Our losses: the hired men first, then the allies, then your own.
  const lostLines: string[] = [];
  for (const h of A.hired) {
    if (ourLost <= 0) break;
    const k = Math.min(h.men, Math.ceil(ourLost * 0.5));
    h.men -= k; ourLost -= k;
    if (k) lostLines.push(`${k} of the ${BANDS[h.band].name.toLowerCase()}`);
  }
  A.hired = A.hired.filter((h) => h.men > 0);
  for (const c of A.commits.filter((y) => y.warId === w.id && y.until > s.week)) {
    if (ourLost <= 0) break;
    const k = Math.min(c.men, Math.ceil(ourLost * 0.5));
    c.men -= k; ourLost -= k;
    if (k) lostLines.push(`${k} of ${allyName(s, c.ally)}'s men`);
  }
  const effects: Effect[] = [];
  const own = casualties(s, A, Math.max(0, ourLost));
  let killed = 0, hurt = 0, held = 0;
  for (const { m, holder } of own) {
    const y = rand(A);
    const pKill = won ? 0.06 : 0.16;
    if (y < pKill) { effects.push({ type: 'kill', charId: m.id, cause: `killed in the fighting for ${dn}`, killer: rival, label }); killed++; }
    else if (y < pKill + 0.28) { effects.push({ type: 'imprison', charId: m.id, weeks: 2 + Math.floor(rand(A) * 5), label: `${label}: picked up` }); held++; }
    else { m.health = Math.max(5, m.health - 35 - Math.floor(rand(A) * 20)); hurt++; }
    const lv = A.levies[holder];
    if (lv) lv.n = Math.max(0, lv.n - 1);
  }
  // The man leading them, and the boss.
  const cmd = plan.commander;
  const bossLeads = how === 'lead';
  const cmdDeath = won ? 0.02 : (plan.commanderRisk - plan.odds * 0.02) / Math.max(0.03, 1 - plan.odds);
  if (cmd && cmd.alive && (bossLeads || cmd.id !== s.playerId)) {
    const y = rand(A);
    if (y < cmdDeath) effects.push({ type: 'kill', charId: cmd.id, cause: `killed leading the men at ${dn}`, killer: rival, label });
    else if (!won && y < cmdDeath + 0.3) cmd.health = Math.max(5, cmd.health - 30);
  }
  if (!bossLeads && !won) {
    const pBoss = plan.bossRisk / Math.max(0.03, 1 - plan.odds);
    if (rand(A) < pBoss) effects.push({ type: 'kill', charId: s.playerId, cause: `killed when ${theyName} broke through at ${dn}`, killer: rival, label });
  }
  // The ground and the score.
  const swing = plan.big ? 20 : 12;
  if (won) {
    changeScore(s, w.id, swing);
    A.glory = Math.min(15, A.glory + (plan.big ? 8 : 5));
    camp.won++;
    if (b.attacker === 'player') occupy(s, camp, b.district, 'player');
    camp.enemyTired = Math.min(100, camp.enemyTired + (plan.big ? 12 : 7));
  } else {
    changeScore(s, w.id, -swing);
    A.glory = Math.max(0, A.glory - 4);
    camp.lost++;
    if (b.attacker !== 'player') occupy(s, camp, b.district, rival);
    A.weariness = Math.min(100, A.weariness + (plan.big ? 8 : 4));
  }
  camp.lastBattle = s.week;
  const l = ledgerOf(s, w.id);
  if (l) { l.menLost += own.length; l.theirsLost += theirLost; l.notes.push([s.week, `${label}: ${won ? 'won' : 'lost'}`]); }
  const lossText = [killed ? `${killed} dead` : '', held ? `${held} picked up` : '', hurt ? `${hurt} hurt` : '', ...lostLines].filter(Boolean).join(', ');
  const text = won
    ? `${b.attacker === 'player' ? 'Your men took' : 'Your men held'} ${dn} against ${theyName} (${pct(plan.odds)} odds). ${theyName} lost ${theirLost} men${lossText ? `; it cost you ${lossText}` : ''}.`
    : `${theyName} ${b.attacker === 'player' ? 'threw your men back at' : 'broke your men at'} ${dn} (${pct(plan.odds)} odds)${lossText ? `: ${lossText}` : ''}. They lost ${theirLost}.`;
  effects.push({ type: 'respect', amount: won ? (plan.big ? 3 : 2) : -(plan.big ? 3 : 1), label });
  effects.push({ type: 'heat', bar: 'local', amount: plan.big ? 6 : 3, label: `${label}: the noise` });
  if (plan.big) effects.push({ type: 'heat', bar: 'federal', amount: 2, label: `${label}: the papers` });
  applyEffects(ctx, effects, { label, because: `fought ${theyName} for ${dn}` });
  ctx.log.push(text);
  s.chronicle.push({ week: s.week, date: { ...s.date }, text, kind: 'rival' });
  const rec: BattleRecord = { week: s.week, warId: w.id, rival, district: b.district, how, won, ours: plan.ours, theirs: plan.theirs, odds: plan.odds, ourLost: own.length + lostLines.length, theirLost, big: plan.big, text };
  pushRecord(s, A, rec);
  return rec;
}

function pushRecord(s: GameState, A: ArmyState, rec: BattleRecord): void {
  A.history.push(rec);
  if (A.history.length > 30) A.history.splice(0, A.history.length - 30);
  note(A, s.week, rec.text);
}

/** A district taken by force: the influence moves, the occupation is recorded. */
function occupy(s: GameState, camp: Campaign, district: string, by: FactionId): void {
  const prev = camp.occupied[district];
  if (by === 'player') {
    const from = (prev && prev !== 'player' ? prev : camp.rival) as FactionId;
    const lost = -shiftInfluence(s, district, from, -18);
    shiftInfluence(s, district, 'player', lost);
    if (prev && prev !== 'player') delete camp.occupied[district];
    else camp.occupied[district] = 'player';
  } else {
    const lost = -shiftInfluence(s, district, 'player', -18);
    shiftInfluence(s, district, by, lost);
    if (prev === 'player') delete camp.occupied[district];
    else camp.occupied[district] = by;
  }
}

/* ------------------------------------------------------------------ */
/* Allies: the call to arms                                            */
/* ------------------------------------------------------------------ */

/** Everyone you could ask, for a war against `enemy` (or in peace). */
export function allyIds(s: GameState, enemy?: RivalId): AllyId[] {
  const out: AllyId[] = [];
  for (const id of ['manno', 'feldstein', 'kessler'] as const) {
    const r = s.rivals.find((x) => x.id === id);
    if (r && s.characters[r.leaderId]?.alive && id !== enemy) out.push(id);
  }
  for (const f of Object.keys(NYC_FAMILIES)) out.push(`nyc:${f}`);
  if (enemy === 'philly' && camdenCapo(s)) out.push('camden');
  return out;
}

/** Philadelphia's own malcontent: the Camden capo who wants Sal's chair. */
export function camdenCapo(s: GameState): Character | undefined {
  return Object.values(s.characters).find((c) => c.alive && c.faction === 'philly' && c.office === 'Camden capo');
}

export function allyName(s: GameState, id: AllyId): string {
  if (id.startsWith('nyc:')) return NYC_FAMILIES[id.slice(4) as NycFamilyId]?.name ?? id;
  if (id === 'camden') { const c = camdenCapo(s); return c ? `${c.firstName} ${c.lastName} (Camden)` : 'The Camden capo'; }
  if (id === 'manno') return 'The Manno crew (Atlantic City)';
  return s.rivals.find((r) => r.id === id)?.name ?? id;
}
export function allyLeader(s: GameState, id: AllyId): Character | undefined {
  if (id === 'camden') return camdenCapo(s);
  if (id.startsWith('nyc:')) return undefined;
  const r = s.rivals.find((x) => x.id === id);
  return r ? s.characters[r.leaderId] : undefined;
}

/** Men they would send. */
export function allyMenOffer(s: GameState, id: AllyId): number {
  if (id.startsWith('nyc:')) return 9 + Math.floor(dice(s, `nycmen:${id}:${Math.floor(s.week / 13)}`) * 5);
  if (id === 'camden') return 7;
  const r = s.rivals.find((x) => x.id === id);
  if (!r) return 0;
  return Math.max(2, Math.round(r.muscle * (id === 'feldstein' ? 0.15 : 0.18)));
}

/** What it costs: money is half now, half at peace; a cut is ground (a shore family) or a share at peace; a favor is owed. */
export function allyPrice(s: GameState, id: AllyId, offer: AllyOffer): number {
  const men = allyMenOffer(s, id);
  return offer === 'money' ? Math.round(men * 450 / 50) * 50 : offer === 'cut' ? (isShore(id) ? 10 : Math.round(men * 300 / 50) * 50) : 0;
}
const isShore = (id: AllyId): id is 'manno' | 'feldstein' | 'kessler' => id === 'manno' || id === 'feldstein' || id === 'kessler';

/** The district a shore family wants as its cut (next to its own ground, held by you). */
export function cutDistrict(s: GameState, id: AllyId): string | undefined {
  if (!isShore(id)) return undefined;
  const home = s.rivals.find((r) => r.id === id)?.homeDistrict;
  const cands = s.districts.filter((d) => !CORE.includes(d.id) && (d.influence.player ?? 0) >= 10).sort((a, b) => ((b.influence[id] ?? 0) + (ADJ[home ?? '']?.includes(b.id) ? 20 : 0)) - ((a.influence[id] ?? 0) + (ADJ[home ?? '']?.includes(a.id) ? 20 : 0)) || (a.id < b.id ? -1 : 1));
  return cands[0]?.id;
}

function allyAtWarElsewhere(s: GameState, id: AllyId): boolean {
  if (isShore(id)) return eraWith(s, id) === 'war' || Object.values(s.intrigue?.eras ?? {}).some((t) => t.a !== 'player' && t.era === 'war' && (t.a === id || t.b === id));
  return false;
}

/** Will they come? Opinion, marriages and pacts, hooks, the offer, their own wars, and whether you look like winning. */
export function allyOdds(s: GameState, id: AllyId, warId: string | undefined, offer: AllyOffer | 'pact'): Acceptance {
  const reasons: Reason[] = [{ label: 'Base', value: offer === 'pact' ? 10 : 15 }];
  const w = warId ? s.wars.find((x) => x.id === warId) : undefined;
  const enemy = w?.rival;
  const lead = allyLeader(s, id);
  if (id.startsWith('nyc:')) {
    const f = id.slice(4) as NycFamilyId;
    reasons.push({ label: `${NYC_FAMILIES[f]?.short ?? f} think of you`, value: Math.round(familyOpinion(s, f) / 2) });
    const g = grievanceOf(s, f);
    if (g) reasons.push({ label: 'What they hold against you', value: -Math.round(g / 3) });
    if (enemy === 'philly') reasons.push({ label: 'New York does not go to war with Philadelphia lightly', value: -15 });
    if (s.nyc?.blessed && (s.nyc.blessed[f] ?? -1) >= s.week) reasons.push({ label: 'You have their blessing in the city', value: 10 });
  } else if (lead) {
    reasons.push({ label: `${lead.firstName} ${lead.lastName} thinks of you`, value: Math.round(clamp(opinion(s, lead.id, s.playerId) / 2, -30, 30)) });
  }
  if (isShore(id)) {
    if (alliedWithFaction(s, id)) reasons.push({ label: 'Married into your house', value: 35 });
    const p = pactWith(s, id);
    if (p) reasons.push({ label: p.kind === 'alliance' ? 'An alliance with you' : p.kind === 'partnership' ? 'Partners with you' : 'A truce with you', value: p.kind === 'alliance' ? 30 : p.kind === 'partnership' ? 15 : 5 });
    if (enemy && enemy !== 'philly' && enemy !== 'law') {
      const rel = rivalRelation(s, id, enemy);
      if (rel) reasons.push({ label: `They feel ${rel > 0 ? 'warmly' : 'coldly'} toward ${rivalLabel(s, enemy)}`, value: -Math.round(rel / 3) });
    }
    if (enemy === 'philly') {
      if (id === 'manno') reasons.push({ label: 'Carmine sits at Philadelphia\'s Table', value: -25 });
      if (id === 'kessler') reasons.push({ label: 'Kessler answers to nobody, least of all Philadelphia', value: 10 });
      if (id === 'feldstein') reasons.push({ label: 'Feldstein does business with Philadelphia', value: -10 });
    }
    if (allyAtWarElsewhere(s, id)) reasons.push({ label: 'Fighting their own war', value: -30 });
  }
  if (id === 'camden') {
    const c = camdenCapo(s);
    const mor = s.rivals.find((r) => r.id === 'philly')?.leaderId;
    reasons.push({ label: 'Wants Sal Moretti\'s chair', value: 20 });
    if (c && mor) reasons.push({ label: `${c.firstName} thinks of Sal`, value: -Math.round(opinion(s, c.id, mor) / 3) });
    reasons.push({ label: 'Turning on his own family is a death sentence if it goes wrong', value: -20 });
  }
  if (s.army?.pacts.some((p) => p.ally === id && p.until > s.week)) reasons.push({ label: 'Bound by your pact', value: offer === 'pact' ? 0 : 40 });
  if (lead) {
    const h = playerHook(s, lead.id);
    if (h) reasons.push({ label: h.strong ? `A strong hook: ${h.reason}` : `A hook: ${h.reason}`, value: h.strong ? 30 : 15 });
  }
  if (offer === 'money') reasons.push({ label: `Money: ${fmtMoney(allyPrice(s, id, 'money'))}`, value: 20 });
  if (offer === 'cut') reasons.push({ label: isShore(id) ? `A cut of Wildwood: ${allyPrice(s, id, 'cut')}% of ${districtName(s, cutDistrict(s, id) ?? '')}` : `A cut of the take: ${fmtMoney(allyPrice(s, id, 'cut'))} at peace`, value: 28 });
  if (offer === 'favor') reasons.push({ label: 'A favor owed (they will call it in)', value: 10 });
  if (offer === 'pact') reasons.push({ label: `A gift to seal it (${fmtMoney(PACT_GIFT)})`, value: 15 });
  if (w) {
    const camp = s.army?.camps[w.id];
    const theirs = (camp?.enemyMen ?? enemyArmy(s, w.rival).men) * (camp?.enemyQ ?? 3.2);
    const lev = levyView(s);
    const ours = lev.reduce((a, c) => a + c.raised * c.perMan, 0) + hiredPower(s) + allyPower(s, w.id);
    const ratio = ours / Math.max(1, theirs);
    if (ratio < 0.5) reasons.push({ label: 'Nobody joins the losing side', value: -15 });
    else if (ratio > 1.1) reasons.push({ label: 'You look like the winning side', value: 10 });
    if (w.score <= -40) reasons.push({ label: 'The war is going badly for you', value: -10 });
  }
  const sum = reasons.reduce((a, r) => a + r.value, 0);
  return { chance: clamp(sum / 100, 0.03, 0.95), reasons };
}

/* ------------------------------------------------------------------ */
/* Campaigns                                                           */
/* ------------------------------------------------------------------ */

/** The campaign of a war (made the first time it is needed). */
export function ensureCampaign(s: GameState, w: War): Campaign {
  const A = ensureArmy(s);
  let c = A.camps[w.id];
  if (!c) {
    const e = enemyArmy(s, w.rival);
    const by = (w.by ?? 'player') as Campaign['by'];
    c = {
      warId: w.id, rival: w.rival, by, goal: by === 'player' ? 'push' : 'districts', why: by === 'player' ? 'You went to war' : `${rivalLabel(s, w.rival)} came at you`,
      enemyStart: e.men, enemyMen: e.men, enemyQ: e.q, enemyTired: 0, enemyAllies: [], path: pathFor(s, w.rival), occupied: {}, won: 0, lost: 0,
      nextMove: s.week + (by === 'player' ? 3 : 1),
    };
    A.camps[w.id] = c;
  }
  return c;
}

/**
 * Philadelphia's lean (the minds layer's read of Sal and the facts on the ground):
 * how close it is to coming down the causeway, and why.
 */
export function campaignPressure(s: GameState, rival: RivalId = 'philly'): { value: number; reasons: Reason[]; goal: WarGoal; why: string } {
  const reasons: Reason[] = [{ label: 'Base', value: -10 }];
  const r = s.rivals.find((x) => x.id === rival);
  const leader = r ? s.characters[r.leaderId] : undefined;
  if (!r || !leader?.alive) return { value: 0, reasons: [{ label: 'Nobody to lead it', value: -100 }], goal: 'districts', why: '' };
  if (s.flags.bag_short) reasons.push({ label: 'Short envelopes', value: 22 });
  const op = opinion(s, leader.id, s.playerId);
  if (op < 0) reasons.push({ label: `${leader.firstName} thinks of you (${op})`, value: Math.round(Math.min(30, -op / 2)) });
  else if (op >= 30) reasons.push({ label: `${leader.firstName} likes you (${op})`, value: -15 });
  const fh = s.heat.family;
  if (fh > 40) reasons.push({ label: `Family heat ${Math.round(fh)}`, value: Math.round(Math.min(25, (fh - 40) / 2)) });
  // Weakness: what he sees against what he has.
  const e = enemyArmy(s, rival);
  const lev = levyView(s);
  const visible = lev.reduce((a, c) => a + c.available * c.perMan, 0) + hiredPower(s);
  const ratio = visible / Math.max(1, e.men * e.q);
  if (ratio < 0.3) reasons.push({ label: 'You look weak', value: 25 });
  else if (ratio < 0.45) reasons.push({ label: 'You look weak', value: 15 });
  else if (ratio > 0.9) reasons.push({ label: 'You have too many men to take lightly', value: -12 });
  if (s.respect >= 75) reasons.push({ label: 'Getting too big for the island', value: 8 });
  // His nature and his grudges (minds/).
  const o = outlook(s, leader.id);
  if (o) {
    if (o.rt !== 0.5) reasons.push({ label: o.rt > 0.5 ? `${leader.firstName} takes risks` : `${leader.firstName} is careful`, value: Math.round((o.rt - 0.5) * 30) });
    const g = grudge(o.m, s.playerId);
    if (g >= 5) reasons.push({ label: `${leader.firstName} holds a grudge`, value: Math.round(Math.min(15, g / 2)) });
  }
  // What holds him back.
  const pacts = (s.army?.pacts ?? []).filter((p) => p.until > s.week).length;
  if (pacts) reasons.push({ label: `Your pacts (${pacts})`, value: -Math.min(25, pacts * 10) });
  if (alliedWithFaction(s, rival)) reasons.push({ label: 'Married into his house', value: -30 });
  const value = Math.round(clamp(reasons.reduce((a, x) => a + x.value, 0), 0, 100));
  const goal: WarGoal = s.flags.bag_short || fh > 60 ? 'tribute' : ratio < 0.45 ? 'install' : 'districts';
  const why = goal === 'tribute' ? 'short envelopes and the noise you make' : goal === 'install' ? 'you look weak, and Sal wants his own man over you' : 'insults Sal will not swallow';
  return { value, reasons, goal, why };
}

export const GOAL_LABEL: Record<WarGoal, string> = {
  districts: 'Take your districts',
  tribute: 'Collect what you owe, and more',
  install: 'Put their own man over you',
  push: 'Your war: take their ground',
};

/** Philadelphia comes in: a war on you, the campaign, the cutscene. */
export function startCampaign(ctx: Ctx, rival: RivalId, goal: WarGoal, why: string): War | undefined {
  const s = ctx.s;
  const r = s.rivals.find((x) => x.id === rival);
  if (!r || s.wars.some((w) => w.rival === rival)) return undefined;
  const path = pathFor(s, rival);
  const target = path.find((d) => (s.districts.find((x) => x.id === d)?.influence.player ?? 0) >= 20) ?? path[path.length - 1] ?? 'downtown';
  const w: War = { id: `w${s.nextId++}`, rival, district: target, cb: 'grievance', sanctioned: rival === 'philly', score: 0, startWeek: s.week, by: rival };
  s.wars.push(w);
  r.war = true;
  const A = ensureArmy(s);
  const c = ensureCampaign(s, w);
  c.goal = goal;
  c.why = why;
  c.nextMove = s.week + 1;
  A.cd[`camp:${rival}`] = s.week + 52;
  // A friend of Philadelphia's may send men too.
  if (rival === 'philly') {
    const manno = s.rivals.find((x) => x.id === 'manno');
    if (manno && s.characters[manno.leaderId]?.alive && opinion(s, manno.leaderId, r.leaderId) >= 15 && !alliedWithFaction(s, 'manno') && !A.pacts.some((p) => p.ally === 'manno' && p.until > s.week) && rand(A) < 0.5) {
      const men = Math.round(manno.muscle * 0.12);
      c.enemyAllies.push({ from: 'manno', men });
      c.enemyMen += men;
      c.enemyStart += men;
    }
  }
  addOpinion(s, r.leaderId, s.playerId, 'Went to war with him', -15, 1);
  const text = `${rivalLabel(s, rival)} is coming down the ${districtName(s, path[0] ?? 'causeway')}: ${displayName(s.characters[r.leaderId])} wants to ${GOAL_LABEL[goal].toLowerCase()} (${why}).`;
  ctx.log.push(text);
  s.chronicle.push({ week: s.week, date: { ...s.date }, text, kind: 'rival' });
  if (s.cutscenes.length < 2) s.cutscenes.push({ key: 'sitdown', title: 'War', text: `${text} Raise the troops.`, week: s.week });
  note(A, s.week, text);
  // Pact allies answer a defensive war on their own (if they will).
  for (const p of A.pacts.filter((x) => x.until > s.week)) {
    const odds = allyOdds(s, p.ally, w.id, 'favor');
    if (rand(A) < odds.chance) joinWar(s, A, p.ally, w, 'favor');
  }
  return w;
}

function joinWar(s: GameState, A: ArmyState, ally: AllyId, w: War, offer: AllyOffer): Commitment {
  const men = allyMenOffer(s, ally);
  const c: Commitment = { id: `ac${A.nextId++}`, ally, warId: w.id, men, sent: men, offer, price: allyPrice(s, ally, offer), since: s.week, until: s.week + COMMIT_WEEKS, district: offer === 'cut' ? cutDistrict(s, ally) : undefined };
  A.commits.push(c);
  note(A, s.week, `${allyName(s, ally)} sent ${men} men to the war with ${rivalLabel(s, w.rival)}.`);
  return c;
}

/* ------------------------------------------------------------------ */
/* The decision windows                                                */
/* ------------------------------------------------------------------ */

const HOW_LABEL: Record<BattleHow, string> = { meet: 'Meet them', lead: 'Lead the men yourself', strike: 'Hit them first', fallback: 'Fall back' };

export function buildBattleEvent(s: GameState, b: PendingBattle): EventInstance {
  const w = s.wars.find((x) => x.id === b.warId)!;
  const theyName = rivalLabel(s, w.rival);
  const dn = districtName(s, b.district);
  const plans = (['meet', 'lead', 'strike'] as const).map((h) => battlePlan(s, b, h));
  const [meet, lead, strike] = plans;
  const est = meet.est;
  const fog = est.fogged ? ' (a guess: you have nobody inside)' : '';
  const risk = (p: BattlePlan) => `${pct(p.odds)} to win; the man leading ${pct(p.commanderRisk)}, your own life ${pct(p.bossRisk)}${p.allies ? '' : '; no allies beside you'}`;
  const canLead = bossCanLead(s);
  const label = `Battle for ${dn}`;
  return {
    iid: `ev${s.nextId++}`, defId: 'war_battle', week: s.week, mandatory: true, priority: 84,
    title: `${theyName} is massing at ${dn}`,
    text: `${theyName}'s men are massing at ${dn}: about ${est.lo === est.hi ? est.lo : `${est.lo}–${est.hi}`} men${fog}. You have ${meet.ourMen} under arms${meet.allies ? `, ${meet.allies} of them your allies'` : ''}. Meet them, fall back, or hit them first?${meet.big && !meet.allies ? ' A big fight without allies: the men leading it may not come home.' : ''}`,
    defaultChoiceId: 'meet', meta: { army: b.id, theme: 'rivals', rival: w.rival }, actors: [s.rivals.find((r) => r.id === w.rival)?.leaderId ?? s.playerId],
    choices: [
      { id: 'meet', label: `${HOW_LABEL.meet}${meet.commander && meet.commander.id !== s.playerId ? ` (${meet.commander.firstName} leads)` : ''}`, detail: risk(meet), because: `met ${theyName} at ${dn}`, effects: [{ type: 'warScore', warId: w.id, amount: 0, label }] },
      { id: 'lead', label: HOW_LABEL.lead, detail: `${risk(lead)}. The men fight harder with you there.`, because: `led the men at ${dn} yourself`, effects: [{ type: 'respect', amount: 1, label: `${label}: the boss in the street` }], disabledReason: canLead },
      { id: 'strike', label: HOW_LABEL.strike, detail: `${risk(strike)}. ${spiesIn(s, w.rival) || tierOf(s, 'info') >= 2 ? 'Your man inside says where they sleep.' : 'Without inside word they may be ready for you.'}`, because: `hit ${theyName} first at ${dn}`, effects: [{ type: 'heat', bar: 'local', amount: 2, label: `${label}: you struck first` }] },
      { id: 'fallback', label: HOW_LABEL.fallback, detail: `Give up ${dn} without a fight; the men live to fight another week. War score −5.`, because: `fell back from ${dn}`, effects: [{ type: 'crewOpinion', amount: -1, reason: 'Gave up ground without a fight', label }] },
    ],
  };
}

function buildEnemyDemands(s: GameState, w: War, c: Campaign): EventInstance {
  const theyName = rivalLabel(s, w.rival);
  const held = Object.entries(c.occupied).filter(([, f]) => f === w.rival).map(([d]) => districtName(s, d));
  const demand = c.goal === 'tribute' ? `pay ${fmtMoney(Math.min(20000, Math.max(4000, Math.round(s.money * 0.25))))} now, and the envelope goes up by half for a year`
    : c.goal === 'install' ? 'their man sits over you for a year: the envelope up by half, and nothing moves on the island without his nod'
    : `${held.length ? held.join(' and ') : 'the ground they took'} stays theirs, and you pay for the damage`;
  const label = `War with ${theyName}`;
  return {
    iid: `ev${s.nextId++}`, defId: 'war_demands', week: s.week, mandatory: true, priority: 83,
    title: `${theyName} names its terms`,
    text: `A messenger at the Shamrock: ${demand}. Accept, and it ends tonight.`,
    defaultChoiceId: 'accept', meta: { armyTerms: w.id, theme: 'rivals', rival: w.rival }, actors: [s.rivals.find((r) => r.id === w.rival)?.leaderId ?? s.playerId],
    choices: [
      { id: 'accept', label: 'Accept their terms', because: `accepted ${theyName}'s terms`, effects: [{ type: 'respect', amount: c.goal === 'install' ? -8 : -4, label }] },
      { id: 'fight', label: 'Fight on', detail: 'The men will bleed for it.', because: `refused ${theyName}'s terms`, effects: [{ type: 'crewOpinion', amount: -3, reason: 'Kept us at war', label }, { type: 'respect', amount: 1, label }] },
    ],
  };
}

function buildEnemyOffer(s: GameState, w: War, c: Campaign): EventInstance {
  const theyName = rivalLabel(s, w.rival);
  const label = `War with ${theyName}`;
  const winning = w.score >= 50;
  return {
    iid: `ev${s.nextId++}`, defId: 'war_offer', week: s.week, mandatory: true, priority: 82,
    title: `${theyName} wants out`,
    text: winning
      ? `${theyName} has had enough: ${c.enemyMen} men left of ${c.enemyStart}. They offer what you won and a payment, if it ends now.`
      : `${theyName} is tired of it (weariness ${Math.round(c.enemyTired)}). They offer a white peace: everybody goes home.`,
    defaultChoiceId: 'accept', meta: { armyOffer: w.id, theme: 'rivals', rival: w.rival, winning: winning ? 1 : 0 }, actors: [s.rivals.find((r) => r.id === w.rival)?.leaderId ?? s.playerId],
    choices: [
      { id: 'accept', label: winning ? 'Take it' : 'A white peace', because: `made peace with ${theyName}`, effects: [{ type: 'respect', amount: winning ? 4 : 1, label }] },
      { id: 'fight', label: 'Fight on', detail: winning ? 'Total victory, or more blood.' : 'You want more than a white peace.', because: `fought on against ${theyName}`, effects: [{ type: 'crewOpinion', amount: -2, reason: 'Kept us at war', label }] },
    ],
  };
}

/** The boss's answers to this layer's decisions, after the week's choices. */
export function armyResolve(ctx: Ctx, resolved: readonly EventInstance[], choices: PlayerChoices): void {
  const s = ctx.s;
  const A = s.army;
  if (!A) return;
  for (const e of resolved) {
    const pick = () => {
      const wanted = choices.choices?.[e.iid];
      return (e.choices.find((c) => c.id === wanted && !c.disabledReason) ?? e.choices.find((c) => c.id === e.defaultChoiceId) ?? e.choices[0])?.id;
    };
    if (e.meta?.army) {
      const b = A.pending.find((x) => x.id === e.meta!.army);
      if (b && !s.gameOver) resolveBattle(ctx, b, (pick() ?? 'meet') as BattleHow);
    } else if (e.meta?.armyTerms) {
      const w = s.wars.find((x) => x.id === e.meta!.armyTerms);
      if (w && pick() === 'accept') acceptEnemyTerms(ctx, w);
    } else if (e.meta?.armyOffer) {
      const w = s.wars.find((x) => x.id === e.meta!.armyOffer);
      if (w && pick() === 'accept') endWar(ctx, w, e.meta.winning ? 'won' : 'white', e.meta.winning ? 'tribute' : 'white');
    } else if (e.meta?.armyFavor) {
      const ally = String(e.meta.armyFavor) as AllyId;
      const lead = allyLeader(s, ally);
      if (pick() === 'honor') { money(ctx, -Number(e.meta.cost ?? 2500), `A favor for ${allyName(s, ally)}`, 'event'); if (lead) addOpinion(s, lead.id, s.playerId, 'Paid his debt', 10, 1); }
      else { if (lead) addOpinion(s, lead.id, s.playerId, 'Would not pay what he owed', -30, 1); A.pacts = A.pacts.filter((p) => p.ally !== ally); if (ally.startsWith('nyc:') && s.nyc) { const f = ally.slice(4) as NycFamilyId; s.nyc.opinion[f] = (s.nyc.opinion[f] ?? 0) - 25; } }
    }
  }
}

function acceptEnemyTerms(ctx: Ctx, w: War): void {
  const s = ctx.s;
  const A = ensureArmy(s);
  const c = ensureCampaign(s, w);
  const theyName = rivalLabel(s, w.rival);
  if (c.goal === 'tribute') {
    const amt = Math.min(20000, Math.max(4000, Math.round(s.money * 0.25)));
    money(ctx, -amt, `Terms to ${theyName}: what you owe`, 'tribute');
    A.overseerUntil = s.week + 52;
  } else if (c.goal === 'install') {
    A.overseerUntil = s.week + 52;
    respect(ctx, -4, `${theyName}'s man sits over you`, 'event');
  }
  // The ground they took stays theirs.
  c.occupied = Object.fromEntries(Object.entries(c.occupied).filter(([, f]) => f !== w.rival));
  endWar(ctx, w, 'lost');
}

/* ------------------------------------------------------------------ */
/* The weekly update                                                   */
/* ------------------------------------------------------------------ */

/** Weekly: the bill for the men under arms, weariness, the enemy's moves, the score, the terms; Philadelphia's lean. */
export function armyWeek(ctx: Ctx): void {
  const s = ctx.s;
  // Philadelphia's lean: once a month, even with no army layer yet.
  if (s.week % 4 === 2 && s.week >= 20 && !s.gameOver) phillyLean(ctx);
  if (!s.army && !s.wars.length) return;
  const A = ensureArmy(s);
  upkeepWeek(ctx, A);
  for (const w of s.wars) campaignWeek(ctx, A, w);
  // Wars that ended: settle the allies, clear the battles.
  for (const id of Object.keys(A.camps)) {
    if (s.wars.some((w) => w.id === id)) continue;
    settleAllies(ctx, A, id);
    delete A.camps[id];
    A.pending = A.pending.filter((b) => b.warId !== id);
  }
  // Favors called in.
  for (const [k, wk] of Object.entries(A.cd)) {
    if (!k.startsWith('favor:') || wk !== s.week) continue;
    const ally = k.slice(6) as AllyId;
    const cost = 2500;
    s.eventQueue.push({
      iid: `ev${s.nextId++}`, defId: 'army_favor', week: s.week, mandatory: false, priority: 60,
      title: `${allyName(s, ally)} calls in the favor`,
      text: `They sent men when you needed them. Now they want something back: a load moved through your docks, a man of theirs hidden for a month, a debt forgotten — call it ${fmtMoney(cost)} of trouble.`,
      defaultChoiceId: 'honor', meta: { armyFavor: ally, cost, theme: 'rivals' },
      choices: [
        { id: 'honor', label: 'Honor it', because: `honored a favor owed to ${allyName(s, ally)}`, effects: [{ type: 'money', amount: -cost, label: `A favor for ${allyName(s, ally)}` }] },
        { id: 'refuse', label: 'Refuse', detail: 'They will remember. The pact is over.', because: `refused a favor owed to ${allyName(s, ally)}`, effects: [{ type: 'respect', amount: -1, label: 'Did not pay a debt' }] },
      ],
    });
  }
  A.pacts = A.pacts.filter((p) => p.until > s.week - 26);
  A.commits = A.commits.filter((c) => c.until > s.week - 26 && (s.wars.some((w) => w.id === c.warId) || c.until > s.week));
}

function upkeepWeek(ctx: Ctx, A: ArmyState): void {
  const s = ctx.s;
  // Keep the levies honest: men hurt or picked up drop out; late men arrive; stale crews go.
  const lev = crewStrengthCrews(s);
  for (const [holder, l] of Object.entries(A.levies)) {
    const c = lev.find((x) => x.holder === holder);
    if (!c) { delete A.levies[holder]; continue; }
    if (l.late && l.lateWeek !== undefined && l.lateWeek <= s.week) {
      l.n += l.late;
      note(A, s.week, `${c.name}: ${l.late} more men turned up.`);
      l.late = undefined; l.lateWeek = undefined;
    }
    l.n = Math.min(l.n, c.free.length);
    if (l.n <= 0 && !l.late && !l.stalled) delete A.levies[holder];
  }
  const bill = weeklyBill(s);
  const raised = raisedMen(s);
  if (bill.upkeep) money(ctx, -bill.upkeep, `Men under arms: upkeep (${raised} men)`, 'cost');
  if (bill.incomeLoss) money(ctx, -bill.incomeLoss, `Men under arms: off their rackets (${raised} men)`, 'cost');
  if (bill.hired) money(ctx, -bill.hired, 'Hired muscle', 'cost');
  if (bill.safehouses) money(ctx, -bill.safehouses, 'Safehouses (the mattresses)', 'cost');
  if (bill.heat >= 1) heat(ctx, 'local', bill.heat, 'Armed men on the island', 'heat');
  const under = raised + hiredMen(s) > 0 || A.safehouses;
  A.weariness = clamp(A.weariness + (under ? (A.safehouses ? 4 : 3) : -6), 0, 100);
  A.glory = Math.max(0, Math.round(A.glory * 0.85 * 10) / 10);
  for (const w of s.wars) { const l = ledgerOf(s, w.id); if (l && bill.total) l.spent += Math.round(bill.total / Math.max(1, s.wars.length)); }
  if (A.weariness >= 50 && raised) {
    for (const holder of Object.keys(A.levies)) { const k = s.characters[holder]; if (k?.alive) addOpinion(s, k.id, s.playerId, 'Too long under arms', -1, 1); }
  }
  if (A.weariness >= 80) {
    const h = Object.keys(A.levies).sort()[s.week % Math.max(1, Object.keys(A.levies).length)];
    if (h && A.levies[h].n > 0) { A.levies[h].n--; note(A, s.week, 'A man under arms drifted home: the men are tired of the mattresses.'); }
  }
}

function campaignWeek(ctx: Ctx, A: ArmyState, w: War): void {
  const s = ctx.s;
  const r = s.rivals.find((x) => x.id === w.rival);
  if (!r || !s.characters[r.leaderId]?.alive) return;
  const c = ensureCampaign(s, w);
  // The score ticks with the ground held by force.
  const theirs = Object.values(c.occupied).filter((f) => f === w.rival).length;
  const ours = Object.values(c.occupied).filter((f) => f === 'player').length;
  if (theirs || ours) changeScore(s, w.id, ours - theirs);
  c.enemyTired = clamp(c.enemyTired + 1.5, 0, 100);
  // Philadelphia keeps sending men over the bridge.
  if (w.rival === 'philly' && s.week % 2 === 0 && c.enemyMen < c.enemyStart) c.enemyMen++;
  // Peace thresholds.
  const pendingEv = s.eventQueue.some((e) => (e.meta?.armyTerms ?? e.meta?.armyOffer) === w.id) || s.pendingEvents.some((e) => (e.meta?.armyTerms ?? e.meta?.armyOffer) === w.id);
  if (w.score <= -100) {
    ctx.log.push(`${rivalLabel(s, w.rival)} broke you. You take their terms.`);
    acceptEnemyTerms(ctx, w);
    return;
  }
  if (w.score >= 100 || c.enemyMen <= 0) {
    ctx.log.push(`${rivalLabel(s, w.rival)} is finished on the island: total victory.`);
    for (const [d, f] of Object.entries(c.occupied)) if (f === 'player') { const lost = -shiftInfluence(s, d, w.rival, -10); shiftInfluence(s, d, 'player', lost); }
    endWar(ctx, w, 'won', 'district');
    return;
  }
  if (!pendingEv && (c.offered ?? -99) <= s.week - 6) {
    if (w.score <= -60) { s.eventQueue.push(buildEnemyDemands(s, w, c)); c.offered = s.week; }
    else if (w.score >= 60 || c.enemyMen <= c.enemyStart * 0.3 || (c.enemyTired >= 60 && w.score >= -10)) { s.eventQueue.push(buildEnemyOffer(s, w, c)); c.offered = s.week; }
  }
  // A battle whose decision never reached the desk is fought anyway: your men meet them.
  for (const b of A.pending.filter((x) => x.warId === w.id && x.due < s.week)) resolveBattle(ctx, b, 'meet');
  if (!s.wars.includes(w)) return;
  // Their move: mass men at the next district on the road.
  if (A.pending.some((b) => b.warId === w.id) || s.week < c.nextMove) return;
  const target = nextTarget(s, c);
  if (!target || c.enemyMen < 4) { c.nextMove = s.week + 3; return; }
  const frac = 0.6 + 0.2 * dice(s, `mass:${w.id}`);
  const men = Math.max(3, Math.round(c.enemyMen * frac));
  // Sal sizes you up first: a careful man waits for better odds.
  const leader = s.characters[r.leaderId];
  const o = outlook(s, leader.id);
  const rt = o?.rt ?? 0.5;
  const lev = levyView(s);
  const seen = lev.reduce((a, x) => a + (x.raised + (x.available - x.raised) * UNRAISED_SHARE) * x.perMan, 0) + hiredPower(s) + allyPower(s, w.id);
  const ratio = (men * c.enemyQ) / Math.max(1, seen);
  if ((ratio < 1.25 - rt * 0.6 && c.by !== w.rival) || ratio < 0.9 - rt * 0.4) {
    // Held off by your strength: they wait, and the waiting wears on them.
    c.nextMove = s.week + 2;
    c.enemyTired = clamp(c.enemyTired + 4, 0, 100);
    if ((A.cd[`held:${w.id}`] ?? 0) <= s.week) { note(A, s.week, `${rivalLabel(s, w.rival)} is holding back: your men are too many to take on right now.`); A.cd[`held:${w.id}`] = s.week + 8; }
    return;
  }
  const b: PendingBattle = { id: `bt${A.nextId++}`, warId: w.id, district: target, attacker: w.rival, enemyMen: men, week: s.week, due: s.week + 1 };
  A.pending.push(b);
  const ev = buildBattleEvent(s, b);
  b.iid = ev.iid;
  s.eventQueue.push(ev);
  note(A, s.week, `${rivalLabel(s, w.rival)} is massing ${men} men at ${districtName(s, target)}.`);
  c.nextMove = s.week + (c.by === w.rival ? 3 : 4);
}

/** The next district on their road they do not hold by force (a district you took from them first). */
function nextTarget(s: GameState, c: Campaign): string | undefined {
  const retake = Object.entries(c.occupied).find(([, f]) => f === 'player')?.[0];
  if (retake) return retake;
  return c.path.find((d) => c.occupied[d] !== c.rival && s.districts.some((x) => x.id === d));
}

/** At peace the allies want paying: the rest of the money, their cut, the favor. */
function settleAllies(ctx: Ctx, A: ArmyState, warId: string): void {
  const s = ctx.s;
  for (const c of A.commits.filter((x) => x.warId === warId)) {
    c.until = Math.min(c.until, s.week);
    const lead = allyLeader(s, c.ally);
    if (c.offer === 'money') {
      const rest = Math.round(c.price / 2);
      if (rest) money(ctx, -rest, `${allyName(s, c.ally)}: the rest of what you promised`, 'cost');
    } else if (c.offer === 'cut') {
      if (isShore(c.ally) && c.district) {
        const lost = -shiftInfluence(s, c.district, 'player', -c.price);
        shiftInfluence(s, c.district, c.ally, lost);
        ctx.log.push(`${allyName(s, c.ally)} took its cut: ${lost}% of ${districtName(s, c.district)}.`);
      } else if (c.price) money(ctx, -c.price, `${allyName(s, c.ally)}: its cut of the take`, 'cost');
    } else if (c.offer === 'favor') {
      A.cd[`favor:${c.ally}`] = s.week + 3 + (A.nextId % 6);
    }
    if (lead) addOpinion(s, lead.id, s.playerId, 'Fought beside us', 6, 1);
  }
}

/** Once a month: does Philadelphia come down the causeway? */
function phillyLean(ctx: Ctx): void {
  const s = ctx.s;
  if (s.wars.some((w) => w.rival === 'philly') || s.flags.brokeFromPhilly) return;
  if ((s.army?.cd['camp:philly'] ?? 0) > s.week) return;
  const p = campaignPressure(s, 'philly');
  if (p.value >= 40 || s.army) {
    const A = ensureArmy(s);
    const before = A.pressure.philly ?? 0;
    A.pressure.philly = p.value;
    if (p.value >= 45 && before < 45) {
      const t = `Word from Philadelphia: Sal Moretti is counting your men (${p.why}). Raise the troops, or make friends.`;
      note(A, s.week, t);
      ctx.log.push(t);
    }
  }
  if (p.value < 55) return;
  if (dice(s, 'campaign:philly') < (p.value - 45) / 120) startCampaign(ctx, 'philly', p.goal, p.why);
}

/* ------------------------------------------------------------------ */
/* The meter (top bar) and the fronts (war room, map)                  */
/* ------------------------------------------------------------------ */

export interface ArmyMeter {
  show: boolean;
  raised: number;
  available: number;
  hired: number;
  allies: number;
  power: number;
  morale: number;
  weariness: number;
  enemy?: { rival: RivalId; name: string; lo: number; hi: number; fogged: boolean };
  bill: number;
  pressure: number;
}

/**
 * The enemy's men in the field AS THE BOSS KNOWS IT: the one estimate every screen shows (the top bar,
 * the Army, the War room). The true count (`camps[w].enemyMen`) is never printed while it is fogged.
 */
export function enemyInField(s: GameState, rival: RivalId, warId?: string): { lo: number; hi: number; fogged: boolean; text: string } {
  const real = s.army?.camps[warId ?? '']?.enemyMen ?? enemyArmy(s, rival).men;
  const e = enemyEstimate(s, rival, real);
  return { lo: e.lo, hi: e.hi, fogged: e.fogged, text: `${e.lo === e.hi ? e.lo : `${e.lo}–${e.hi}`}${e.fogged ? '?' : ''}` };
}

export function armyMeter(s: GameState): ArmyMeter {
  const A = s.army;
  const lev = levyView(s);
  const raised = lev.reduce((a, c) => a + c.raised, 0);
  const available = lev.reduce((a, c) => a + c.available, 0);
  const w = s.wars[0];
  const pressure = A?.pressure.philly ?? 0;
  const era = Object.values(s.intrigue?.eras ?? {}).some((t) => t.a === 'player' && (t.era === 'cold' || t.era === 'war'));
  const show = !!s.wars.length || raised > 0 || hiredMen(s) > 0 || pressure >= 40 || era || (A?.pending.length ?? 0) > 0;
  let enemy: ArmyMeter['enemy'];
  const foe = (w?.rival ?? (pressure >= 40 ? 'philly' : undefined)) as RivalId | undefined;
  if (foe) {
    const e = enemyInField(s, foe, w?.rival === foe ? w.id : undefined);
    enemy = { rival: foe, name: rivalLabel(s, foe), lo: e.lo, hi: e.hi, fogged: e.fogged };
  }
  const power = lev.reduce((a, c) => a + c.raised * c.perMan, 0) + hiredPower(s) + allyPower(s);
  return { show, raised, available, hired: hiredMen(s), allies: allyMen(s), power: Math.round(power), morale: morale(s).v, weariness: Math.round(A?.weariness ?? 0), enemy, bill: weeklyBill(s).total, pressure };
}

export interface FrontView { district: string; name: string; holder: FactionId | undefined; occupied?: FactionId; mine: number; theirs: number; onRoad: boolean; massing?: PendingBattle }

/** The fronts of a war, district by district. */
export function frontsOf(s: GameState, w: War): FrontView[] {
  const c = s.army?.camps[w.id];
  const path = c?.path ?? pathFor(s, w.rival);
  return s.districts.map((d) => {
    const mine = Math.round(d.influence.player ?? 0);
    const theirs = Math.round(d.influence[w.rival] ?? 0);
    const occ = c?.occupied[d.id];
    return { district: d.id, name: d.name, holder: occ ?? (mine >= theirs ? (mine ? 'player' : undefined) : w.rival), occupied: occ, mine, theirs, onRoad: path.includes(d.id), massing: s.army?.pending.find((b) => b.warId === w.id && b.district === d.id) };
  });
}

/** District → what is going on there in the wars (for the political map's tooltip). */
export function warNotes(s: GameState): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const add = (d: string, t: string) => { (out[d] ??= []).push(t); };
  for (const w of s.wars) {
    const c = s.army?.camps[w.id];
    if (!c) continue;
    for (const [d, f] of Object.entries(c.occupied)) add(d, f === 'player' ? `Taken from ${rivalLabel(s, w.rival)} by your men` : `Occupied by ${rivalLabel(s, w.rival)}`);
    for (const b of s.army?.pending.filter((x) => x.warId === w.id) ?? []) add(b.district, `${rivalLabel(s, w.rival)} massing ~${b.enemyMen} men: a battle next week`);
    const next = nextTarget(s, c);
    if (next && !s.army?.pending.some((x) => x.warId === w.id)) add(next, `Front line: ${rivalLabel(s, w.rival)} pushes here next`);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Orders                                                              */
/* ------------------------------------------------------------------ */

function holderLabel(s: GameState, holder: string): string {
  if (holder === 'all') return 'every crew';
  if (holder === 'family') return 'your own men';
  const k = s.characters[holder];
  return k ? `${k.firstName} ${k.lastName}'s crew` : 'a crew';
}

export function previewArmy(s: GameState, a: ArmyAction): ActionPreview {
  const base = { cost: 0, category: 'event' as const, effects: [] as Effect[] };
  const A = s.army;
  switch (a.op) {
    case 'raise': {
      const lev = levyView(s).filter((c) => a.holder === 'all' || c.holder === a.holder);
      const rows = lev.map((c) => {
        const want = c.available - c.raised;
        const now = Math.floor(want * c.willing + 1e-9);
        return { c, want, now, rest: want - now };
      });
      const now = rows.reduce((x, r) => x + r.now, 0);
      const rest = rows.reduce((x, r) => x + r.rest, 0);
      const bill = weeklyBill(s);
      const perMan = RAISE_UPKEEP + (raisedMen(s) ? bill.incomeLoss / Math.max(1, raisedMen(s)) : Math.round(bill.incomeLoss));
      const stall = rows.filter((r) => r.rest > 0).map((r) => `${r.c.name}: ${r.now} come now, ${r.rest} ${willingness(s, r.c.holder).stall === 'never' ? 'he keeps back (he stalls)' : 'in two weeks'}`);
      const label = `Raise the troops: ${holderLabel(s, a.holder)}`;
      return {
        ...base, title: label,
        detail: `${now} men called up${rest ? `; ${stall.join('; ')}` : ''}. Every man under arms costs about ${fmtMoney(RAISE_UPKEEP)} a week and the take he isn't bringing in; the island notices armed men.`,
        effects: now ? [{ type: 'heat', bar: 'local', amount: Math.max(1, Math.round(now / 4)), label: `${label}: the island notices` }] : [],
        warning: rows.some((r) => r.c.willing < 0.6) ? 'A capo who does not love you sends fewer men, and some never come.' : perMan > 0 ? undefined : undefined,
        because: `called up ${holderLabel(s, a.holder)}`,
        disabledReason: !lev.length ? 'No such crew' : !rows.some((r) => r.want > 0) ? 'Everyone free is already under arms' : now <= 0 && !rest ? 'Nobody free to call up' : undefined,
        odds: { chance: lev.length ? lev.reduce((x, c) => x + c.willing, 0) / lev.length : 0, reasons: lev.length === 1 ? lev[0].reasons : lev.map((c) => ({ label: c.name, value: Math.round(c.willing * 100) })) },
      };
    }
    case 'disband': {
      const n = Object.entries(A?.levies ?? {}).filter(([h]) => a.holder === 'all' || h === a.holder).reduce((x, [, l]) => x + l.n + (l.late ?? 0), 0);
      return { ...base, title: `Send them home: ${holderLabel(s, a.holder)}`, detail: `${n} men go back to their rackets. The take comes back; the weariness fades.`, because: `sent ${holderLabel(s, a.holder)} home`, disabledReason: n ? undefined : 'Nobody under arms there' };
    }
    case 'hire': {
      const b = BANDS[a.band];
      const label = `Hire ${b.name.toLowerCase()}`;
      return {
        ...base, title: label, detail: `${b.men} men, ${fmtMoney(b.weekly)} a week (the first week up front). ${b.blurb}`,
        effects: [{ type: 'money', amount: -b.weekly, label: `${label}: the first week` }, { type: 'heat', bar: 'local', amount: b.heat, label }], cost: b.weekly,
        because: `hired ${b.name.toLowerCase()}`, category: 'cost',
        disabledReason: A?.hired.some((h) => h.band === a.band) ? 'Already on the payroll' : s.money < b.weekly ? `Needs ${fmtMoney(b.weekly)}` : undefined,
      };
    }
    case 'dismiss': {
      const b = BANDS[a.band];
      return { ...base, title: `Let ${b.name.toLowerCase()} go`, detail: 'Paid off, on the next bus.', because: `let ${b.name.toLowerCase()} go`, disabledReason: A?.hired.some((h) => h.band === a.band) ? undefined : 'Not on the payroll' };
    }
    case 'safehouses': {
      const label = a.on ? 'Go to the mattresses' : 'Come home from the mattresses';
      return {
        ...base, title: label,
        detail: a.on ? `Safehouses for the men and for you: ${fmtMoney(SAFEHOUSE_SETUP)} to set up, ${fmtMoney(SAFEHOUSE_WEEKLY)} a week. Morale up, the men defend better, your own risk in a lost fight falls by two thirds. The men are away from their families: they tire faster.` : 'The men sleep at home again.',
        effects: a.on ? [{ type: 'money', amount: -SAFEHOUSE_SETUP, label: 'Safehouses: setting up' }] : [], cost: a.on ? SAFEHOUSE_SETUP : 0, category: 'cost',
        because: a.on ? 'went to the mattresses' : 'came home from the mattresses',
        disabledReason: !!A?.safehouses === a.on ? (a.on ? 'Already on the mattresses' : 'Not on the mattresses') : a.on && s.money < SAFEHOUSE_SETUP ? `Needs ${fmtMoney(SAFEHOUSE_SETUP)}` : undefined,
      };
    }
    case 'ask': {
      const w = s.wars.find((x) => x.id === a.warId);
      const men = allyMenOffer(s, a.ally);
      const price = allyPrice(s, a.ally, a.offer);
      const name = allyName(s, a.ally);
      const label = `Call to arms: ${name}`;
      const offerText = a.offer === 'money' ? `${fmtMoney(price)} (half now, half at peace)` : a.offer === 'cut' ? (isShore(a.ally) ? `${price}% of ${districtName(s, cutDistrict(s, a.ally) ?? '')} at peace` : `${fmtMoney(price)} of the take at peace`) : 'a favor owed';
      const refusedAt = s.flags[`armyAsk_${a.ally}_${a.warId}`] ?? -99;
      const nyc = a.ally.startsWith('nyc:') ? (a.ally.slice(4) as NycFamilyId) : undefined;
      let why: string | undefined;
      if (!w) why = 'No such war';
      else if (!allyIds(s, w.rival).includes(a.ally)) why = 'Not someone you can ask';
      else if (A?.commits.some((c) => c.warId === a.warId && c.ally === a.ally && c.until > s.week)) why = 'Their men are already with you';
      else if (nyc && nycAtWar(s, nyc)) why = 'You are at war with them';
      else if (s.week - refusedAt < 6) why = 'They said no; ask again in a few weeks';
      else if (a.offer === 'money' && s.money < Math.round(price / 2)) why = `Needs ${fmtMoney(Math.round(price / 2))}`;
      return {
        ...base, title: label, detail: `${men} men for ${w ? `the war with ${rivalLabel(s, w.rival)}` : 'the war'}, for ${offerText}.`,
        effects: a.offer === 'money' ? [{ type: 'money', amount: -Math.round(price / 2), label: `${label}: half up front` }] : [], cost: a.offer === 'money' ? Math.round(price / 2) : 0, category: 'cost',
        acceptance: allyOdds(s, a.ally, a.warId, a.offer),
        refuseEffects: [{ type: 'flag', key: `armyAsk_${a.ally}_${a.warId}`, value: s.week, label: `${label}: refused` }, ...(a.offer === 'money' ? [{ type: 'money', amount: Math.round(price / 2), label: `${label}: the money back` } as Effect] : [])],
        because: `asked ${name} to send men`, disabledReason: why,
      };
    }
    case 'pact': {
      const name = allyName(s, a.ally);
      const nyc = a.ally.startsWith('nyc:') ? (a.ally.slice(4) as NycFamilyId) : undefined;
      let why: string | undefined;
      if (!allyIds(s).includes(a.ally) && a.ally !== 'camden') why = 'Not someone you can make a pact with';
      if (a.ally === 'camden') why = 'Not while Sal Moretti lives';
      else if (A?.pacts.some((p) => p.ally === a.ally && p.until > s.week)) why = 'You already have a pact';
      else if (isShore(a.ally) && s.wars.some((w) => w.rival === a.ally)) why = 'You are at war with them';
      else if (nyc && nycAtWar(s, nyc)) why = 'You are at war with them';
      else if (s.money < PACT_GIFT) why = `Needs ${fmtMoney(PACT_GIFT)}`;
      return {
        ...base, title: `A pact with ${name}`, detail: `Each comes when the other calls, for a year: their men answer your wars far more readily, and Philadelphia thinks twice. A gift seals it.`,
        effects: [{ type: 'money', amount: -PACT_GIFT, label: `A pact with ${name}: the gift` }], cost: PACT_GIFT, category: 'cost',
        acceptance: allyOdds(s, a.ally, undefined, 'pact'), refuseEffects: [{ type: 'money', amount: Math.round(PACT_GIFT / 2), label: `A pact with ${name}: refused (half the gift came back)` }],
        because: `made a pact with ${name}`, disabledReason: why,
      };
    }
    case 'attack': {
      const w = s.wars.find((x) => x.id === a.warId);
      const c = A?.camps[a.warId];
      const d = s.districts.find((x) => x.id === a.district);
      const garrison = c ? Math.max(2, Math.round(c.enemyMen * (c.occupied[a.district] === w?.rival ? 0.45 : 0.3))) : 0;
      const plan = w ? battlePlan(s, { warId: w.id, district: a.district, attacker: 'player', enemyMen: garrison }, 'strike') : undefined;
      const label = `Take the fight to ${w ? rivalLabel(s, w.rival) : 'them'} at ${d?.name ?? '?'}`;
      let why: string | undefined;
      if (!w || !c || !d) why = 'No such war or district';
      else if (c.occupied[a.district] === 'player') why = 'Your men already hold it';
      else if (!attackable(s, w, a.district)) why = 'They hold nothing there worth taking';
      else if ((A?.cd[`attack:${a.warId}`] ?? 0) > s.week) why = 'The men need a week between fights';
      else if (raisedMen(s) + hiredMen(s) + allyMen(s, a.warId) <= 0) why = 'Nobody under arms: raise the troops first';
      else if (s.money < ATTACK_COST) why = `Needs ${fmtMoney(ATTACK_COST)}`;
      return {
        ...base, title: label,
        detail: plan ? `About ${garrison} of theirs hold it${plan.est.fogged ? ' (a guess)' : ''}. ${pct(plan.odds)} to win; the man leading ${pct(plan.commanderRisk)}, your own life ${pct(plan.bossRisk)}${plan.allies ? '' : '; no allies beside you'}.` : undefined,
        effects: [{ type: 'money', amount: -ATTACK_COST, label: `${label}: cars, guns, a lookout` }], cost: ATTACK_COST, category: 'cost',
        odds: plan ? { chance: plan.odds, reasons: plan.factors } : undefined,
        because: `attacked ${w ? rivalLabel(s, w.rival) : 'them'} at ${d?.name ?? 'a district'}`, disabledReason: why,
      };
    }
  }
}

export function commitArmy(ctx: Ctx, a: ArmyAction): void {
  const s = ctx.s;
  const A = ensureArmy(s);
  switch (a.op) {
    case 'raise': {
      for (const c of levyView(s).filter((x) => a.holder === 'all' || x.holder === a.holder)) {
        const want = c.available - c.raised;
        if (want <= 0) continue;
        const now = Math.floor(want * c.willing + 1e-9);
        const rest = want - now;
        const stall = willingness(s, c.holder).stall;
        const l = A.levies[c.holder] ?? { n: 0, asked: 0, since: s.week };
        l.n = c.raised + now;
        l.asked = c.available;
        l.stalled = rest > 0 && stall === 'never';
        if (rest > 0 && stall === 'late') { l.late = rest; l.lateWeek = s.week + 2; }
        A.levies[c.holder] = l;
        const k = s.characters[c.holder];
        if (k?.alive) addOpinion(s, k.id, s.playerId, 'Pulled my men off the street', -2, 1);
        note(A, s.week, `${c.name}: ${now} of ${want} men under arms${rest ? (l.stalled ? `; ${k?.firstName ?? 'he'} is keeping ${rest} back` : `; ${rest} more in two weeks`) : ''}.`);
      }
      break;
    }
    case 'disband':
      for (const h of Object.keys(A.levies)) if (a.holder === 'all' || h === a.holder) delete A.levies[h];
      break;
    case 'hire':
      if (!A.hired.some((h) => h.band === a.band)) A.hired.push({ band: a.band, men: BANDS[a.band].men, since: s.week });
      break;
    case 'dismiss':
      A.hired = A.hired.filter((h) => h.band !== a.band);
      break;
    case 'safehouses':
      A.safehouses = a.on;
      A.safehousesSince = a.on ? s.week : undefined;
      break;
    case 'ask': {
      const w = s.wars.find((x) => x.id === a.warId);
      if (w) { const c = joinWar(s, A, a.ally, w, a.offer); ctx.log.push(`${allyName(s, a.ally)} answered the call: ${c.men} men.`); }
      break;
    }
    case 'pact':
      A.pacts = A.pacts.filter((p) => p.ally !== a.ally);
      A.pacts.push({ ally: a.ally, since: s.week, until: s.week + PACT_WEEKS });
      note(A, s.week, `A pact with ${allyName(s, a.ally)}: each comes when the other calls.`);
      break;
    case 'attack': {
      const w = s.wars.find((x) => x.id === a.warId);
      const c = w ? ensureCampaign(s, w) : undefined;
      if (!w || !c) break;
      const garrison = Math.max(2, Math.round(c.enemyMen * (c.occupied[a.district] === w.rival ? 0.45 : 0.3)));
      A.cd[`attack:${a.warId}`] = s.week + 1;
      resolveBattle(ctx, { id: `bt${A.nextId++}`, warId: w.id, district: a.district, attacker: 'player', enemyMen: garrison, week: s.week, due: s.week }, 'strike');
      break;
    }
  }
}

/** Orders on offer (the sim's bots and tests). */
export function armyActions(s: GameState): ArmyAction[] {
  const out: ArmyAction[] = [{ op: 'raise', holder: 'all' }, { op: 'disband', holder: 'all' }, { op: 'safehouses', on: !s.army?.safehouses }];
  for (const b of BAND_IDS) out.push(s.army?.hired.some((h) => h.band === b) ? { op: 'dismiss', band: b } : { op: 'hire', band: b });
  for (const w of s.wars) {
    for (const ally of allyIds(s, w.rival)) out.push({ op: 'ask', ally, warId: w.id, offer: 'money' });
    for (const f of frontsOf(s, w)) if (attackable(s, w, f.district)) out.push({ op: 'attack', warId: w.id, district: f.district });
  }
  if (!s.wars.length) for (const ally of allyIds(s)) out.push({ op: 'pact', ally });
  return out;
}

/**
 * Where you can take the fight to them: a district they took by force, ground of theirs on the
 * island, or — when they came at you — their camp where the road comes onto the island.
 */
export function attackable(s: GameState, w: War, district: string): boolean {
  const c = s.army?.camps[w.id];
  const d = s.districts.find((x) => x.id === district);
  if (!d || c?.occupied[district] === 'player') return false;
  if (c?.occupied[district] === w.rival) return true;
  if ((d.influence[w.rival] ?? 0) >= 15) return true;
  return !!c && c.by === w.rival && c.path[0] === district;
}

/** The envelope multiplier while Philadelphia's man sits over you (a lost war). */
export function overseerMult(s: GameState): number {
  return (s.army?.overseerUntil ?? 0) > s.week ? 1.5 : 1;
}
