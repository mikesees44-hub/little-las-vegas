import { addFedEvidence } from './fedsState';
import { ableness, frailtyAgainst } from './aging';
import { manMod, perkMod } from './lifestyle';
import { bonesFromScheme } from './bones';
import { roll01 } from './bonesState';
import { fileReceipt, noteScore, receiptLie } from './ledgerbook';
import { ageOn } from './calendar';
import { crew, displayName, hasTrait, isFree, player } from './characters';
import { activeTask, seatPower } from './council';
import { hasSpecialist } from './crewlife';
import { queueHeist } from './minigameHeist';
import { applyEffects, fmtMoney, shiftInfluence } from './effects';
import type { Ctx } from './ledger';
import { addOpinion, changeMeter, opinion } from './relations';
import { chance, pick, randInt } from './rng';
import { FACTION_NAMES } from './world';
import { CITIES_BY_ID, CITY_LIST, hasPermission, needsPermission, standing } from './cities';
import { resolveEnvoy } from './envoys';
import { protectionFor } from './protect';
import { ownHitFallout } from './peopleRead';
export { outpostIncome } from './envoys';
import type { Character, Effect, EventInstance, FactionId, GameState, HeistKind, HitLocation, RivalId, Scheme, SchemeDepth, SchemeKind, SchemeOptions } from './types';

/**
 * Schemes (CK-style). A scheme has an owner, a target, 1–4 agents, a planning
 * depth and options. Each week it progresses; each week the other side may
 * discover it (secrecy). At 100% it resolves with one roll whose odds are
 * shown before you commit: power (agents, specialists, depth, equipment)
 * against resistance (rank, guards, the target's wits and muscle).
 *
 * Rivals run schemes on you too; the consigliere can uncover them.
 */

export const SCHEME_INFO: Record<SchemeKind, { name: string; verb: string; hostile: boolean; text: string }> = {
  murder: { name: 'Murder', verb: 'kill', hostile: true, text: 'Plan a hit: pick the team, the place, and how the body is found — or isn\'t.' },
  claim: { name: 'Fabricate a claim', verb: 'claim', hostile: true, text: 'Deeds, old IOUs and a forged ledger: a pretext to take a district by war.' },
  blackmail: { name: 'Blackmail', verb: 'blackmail', hostile: true, text: 'Use a secret you know to own him. A strong hook if it works.' },
  informant: { name: 'Turn an informant', verb: 'turn', hostile: true, text: 'Turn one of a rival\'s men. He feeds you their plans.' },
  heist: { name: 'Heist', verb: 'rob', hostile: true, text: 'A big score out of town. Bank robbery brings the FBI.' },
  envoy: { name: 'Send an envoy', verb: 'reach', hostile: false, text: 'Open an outpost in another city: steady money, new friends.' },
  befriend: { name: 'Befriend', verb: 'befriend', hostile: false, text: 'Slowly make a friend for life.' },
  sway: { name: 'Sway', verb: 'sway', hostile: false, text: 'Win him over, quickly and for a while.' },
  flip: { name: 'Flip a soldier', verb: 'flip', hostile: true, text: 'Turn a man against his boss.' },
  frame: { name: 'Frame', verb: 'frame', hostile: true, text: 'Feed the law a story.' },
};

export const DEPTH: Record<SchemeDepth, { name: string; speed: number; odds: number; cost: number; secrecy: number }> = {
  rushed: { name: 'Rushed', speed: 1.8, odds: -15, cost: 500, secrecy: -10 },
  planned: { name: 'Planned', speed: 1, odds: 0, cost: 1500, secrecy: 0 },
  meticulous: { name: 'Meticulous', speed: 0.55, odds: 15, cost: 4000, secrecy: 15 },
};

export const LOCATIONS: Record<HitLocation, { name: string; odds: number; witness: number; text: string }> = {
  barbershop: { name: 'The barbershop', odds: 10, witness: 0.3, text: 'Hot towel, eyes closed, back to the door.' },
  boardwalk: { name: 'The boardwalk', odds: 0, witness: 0.6, text: 'Crowds cover the approach — and see everything.' },
  car: { name: 'His car', odds: 5, witness: 0.1, text: 'A quiet street, a back seat. Easiest to make disappear.' },
  restaurant: { name: 'A restaurant', odds: 15, witness: 0.5, text: 'Guard down over the veal. Busy room.' },
};

export const EQUIPMENT = {
  street: { name: 'Street pieces', odds: 0, cost: 0, secrecy: 0 },
  clean: { name: 'Clean guns', odds: 8, cost: 600, secrecy: 5 },
  untraceable: { name: 'Untraceable', odds: 15, cost: 1500, secrecy: 15 },
} as const;

export const HEISTS: Record<HeistKind, { name: string; resistance: number; payout: [number, number]; heat: 'local' | 'federal'; heatAmt: number; text: string }> = {
  jewelry: { name: 'Jewelry exchange in Philadelphia', resistance: 30, payout: [8000, 15000], heat: 'local', heatAmt: 6, text: 'A Sansom Street exchange after closing.' },
  armored: { name: 'Armored car on the Black Horse Pike', resistance: 45, payout: [15000, 30000], heat: 'federal', heatAmt: 8, text: 'Payroll for the mainland factories.' },
  bank: { name: 'A bank in Delaware', resistance: 60, payout: [25000, 50000], heat: 'federal', heatAmt: 15, text: 'Out of state. The FBI will come.' },
};

/** Envoy destinations: the cities of cities.ts (kept under this name for older callers). */
export const CITIES: Record<string, { name: string; resistance: number; income: number; text: string }> = Object.fromEntries(
  CITY_LIST.filter((c) => c.id !== 'wildwood').map((c) => [c.id, { name: c.name, resistance: c.difficulty, income: c.income, text: c.flavor }]),
);

export const PROTECTED_OFFICES = 'Philadelphia\'s rule: no cops, no prosecutors, no politicians, no reporters.';

/* ---------------------------------------------------------------- */
/* Odds                                                              */
/* ---------------------------------------------------------------- */

export interface Odds {
  chance: number;
  weeks: number;
  secrecy: number;
  cost: number;
  reasons: { label: string; value: number }[];
  disabledReason?: string;
}

function agentChars(s: GameState, ids: string[]): Character[] {
  return ids.map((id) => s.characters[id]).filter((c): c is Character => !!c && c.alive && isFree(s, c));
}

function targetDefense(s: GameState, t: Character): { label: string; value: number }[] {
  const out: { label: string; value: number }[] = [];
  const isBoss = t.rank === 'boss' || s.rivals.some((r) => r.leaderId === t.id) || t.id === s.playerId;
  out.push({ label: isBoss ? 'He is a boss: bodyguards' : t.rank === 'capo' || t.rank === 'underboss' ? 'A capo: careful habits' : 'An ordinary man', value: -(isBoss ? 40 : t.rank === 'capo' || t.rank === 'underboss' ? 20 : 5) });
  out.push({ label: 'His wits', value: -Math.round(t.attributes.intrigue / 5) });
  if (hasTrait(t, 'Paranoid')) out.push({ label: 'Paranoid', value: -10 });
  const frail = frailtyAgainst(s, t);
  if (frail) out.push(frail);
  if (t.id === s.playerId) {
    const g = activeTask(s, 'ub_guard');
    if (g) out.push({ label: 'Your underboss guards you', value: -Math.round(25 * g) });
    if (s.businesses.some((b) => b.owner === 'player' && b.kind === 'safehouse')) out.push({ label: 'Your safehouses', value: -10 });
    const g2 = perkMod(s, 'guard');
    if (g2) out.push({ label: 'Your perks: hard to reach', value: -g2 });
  }
  // Men assigned to guard him (protect.ts): harder, never impossible.
  const pc = protectionFor(s, t.id);
  if (pc.cut > 0) out.push({ label: `Guarded by ${pc.names}`, value: -Math.round(pc.cut * 40) });
  const r = s.rivals.find((x) => x.id === t.faction);
  if (r) out.push({ label: `${r.shortName}'s muscle`, value: -Math.round(r.muscle / 6) });
  if (t.faction === 'player') {
    const men = crew(s).filter((c) => isFree(s, c)).length;
    out.push({ label: 'Your crew watches out for its own', value: -Math.min(20, men * 2) });
  }
  return out;
}

function agentPower(s: GameState, agents: Character[], kind: SchemeKind): { label: string; value: number }[] {
  const out: { label: string; value: number }[] = [];
  if (!agents.length) return out;
  const skill = (c: Character) =>
    kind === 'murder' || kind === 'heist' ? (c.attributes.force + c.attributes.intrigue) / 2
      : kind === 'befriend' || kind === 'sway' || kind === 'envoy' || kind === 'informant' ? (c.attributes.diplomacy + c.attributes.intrigue) / 2
        : c.attributes.intrigue;
  const total = agents.reduce((a, c) => a + skill(c), 0);
  out.push({ label: `${agents.length} agent${agents.length > 1 ? 's' : ''}`, value: Math.round(total / 4 + agents.length * 4) });
  const torpedo = agents.find((c) => c.specialty === 'torpedo');
  if (kind === 'murder' && torpedo) out.push({ label: `${torpedo.firstName} is a torpedo`, value: 15 });
  const wheel = agents.find((c) => c.specialty === 'wheelman');
  if ((kind === 'murder' || kind === 'heist') && wheel) out.push({ label: `${wheel.firstName} drives`, value: 10 });
  const safe = agents.find((c) => c.specialty === 'safecracker');
  if (kind === 'heist' && safe) out.push({ label: `${safe.firstName} cracks the safe`, value: 20 });
  const forger = agents.find((c) => c.specialty === 'forger') ?? hasSpecialist(s, 'forger');
  if (kind === 'claim' && forger) out.push({ label: `${forger.firstName}'s forged papers`, value: 20 });
  // The agents' growth perks (lifestyle.ts: Planner, Mastermind, Steady Hand).
  const plan = agents.reduce((x, c) => x + manMod(s, c, 'scheme'), 0);
  if (plan) out.push({ label: 'Their craft (perks)', value: plan });
  const cold = agents.filter((c) => hasTrait(c, 'Cowardly'));
  if (cold.length && (kind === 'murder' || kind === 'heist')) out.push({ label: 'A coward on the team', value: -10 });
  return out;
}

/** Up-front odds of a player scheme, with every reason. */
export function schemeOdds(s: GameState, kind: SchemeKind, targetId: string | undefined, agentIds: string[], opts: SchemeOptions): Odds {
  const agents = agentChars(s, agentIds);
  const t = targetId ? s.characters[targetId] : undefined;
  const reasons: { label: string; value: number }[] = [{ label: 'Base', value: 50 }];
  const d = DEPTH[opts.depth];
  let cost = kind === 'befriend' || kind === 'sway' ? 0 : d.cost;
  let secrecy = 60 + d.secrecy;
  let weeks = 4;
  let why: string | undefined;
  reasons.push(...agentPower(s, agents, kind));
  if (d.odds) reasons.push({ label: `${d.name} planning`, value: d.odds });
  if (!agents.length) why = 'Pick at least one agent';
  if (agents.length > 4) why = 'At most four agents';
  for (const a of agents) {
    if (hasTrait(a, 'Drinker')) secrecy -= 8;
    if (a.specialty === 'wheelman') secrecy += 10;
  }
  switch (kind) {
    case 'murder': {
      if (!t || !t.alive) why ??= 'No target';
      else {
        if (t.office || t.faction === 'law') why ??= PROTECTED_OFFICES;
        if (t.id === s.playerId) why ??= 'Not yourself';
        reasons.push(...targetDefense(s, t));
        const loc = LOCATIONS[opts.location ?? 'barbershop'];
        reasons.push({ label: loc.name, value: loc.odds });
        const eq = EQUIPMENT[opts.equipment ?? 'street'];
        if (eq.odds) reasons.push({ label: eq.name, value: eq.odds });
        cost += eq.cost;
        secrecy += eq.secrecy;
        if (opts.disposal === 'disappear') reasons.push({ label: 'Making the body disappear', value: opts.location === 'car' ? -3 : -10 });
        if (opts.alibi) {
          cost += 800;
          secrecy += 20;
        }
      }
      weeks = 4;
      break;
    }
    case 'heist': {
      const h = HEISTS[opts.heist ?? 'jewelry'];
      reasons.push({ label: h.name, value: -h.resistance });
      weeks = 5;
      break;
    }
    case 'envoy': {
      const c = CITIES_BY_ID[opts.city ?? 'capemay'];
      if (!c || c.id === 'wildwood') why ??= 'Pick a city';
      else {
        reasons.push({ label: `${c.name} (${c.owner})`, value: -c.difficulty });
        const st = standing(s, c.id);
        if (st) reasons.push({ label: 'Your standing there', value: Math.round(st / 4) });
        const fam = agents.find((a) => a.dynasty);
        if (fam) reasons.push({ label: `${fam.id === s.playerId ? 'You go yourself' : 'Family goes'}: it shows respect`, value: fam.id === s.playerId ? 15 : 8 });
        const o = s.outposts.find((x) => x.city === c.id);
        if (o?.kind === 'franchise') why ??= 'You already run a franchise there';
        if (needsPermission(c) && !hasPermission(s, c.id)) reasons.push({ label: 'No blessing from Philadelphia', value: -5 });
      }
      cost = c && c.difficulty >= 50 ? 4000 : 2000;
      weeks = 6 + Math.round((c?.difficulty ?? 30) / 15);
      secrecy = 100;
      break;
    }
    case 'claim': {
      const dist = s.districts.find((x) => x.id === opts.district);
      if (!dist) why ??= 'Pick a district';
      else {
        const owner = topRival(s, dist.id);
        if (!owner) why ??= 'Nobody else holds it';
        if (s.claims.some((c) => c.district === dist.id)) why ??= 'You already have a claim there';
      }
      reasons.push({ label: 'Records office clerks', value: -10 });
      weeks = 6;
      break;
    }
    case 'blackmail': {
      const sec = s.secrets.find((x) => x.id === opts.secretId);
      if (!t) why ??= 'No target';
      else if (!sec || sec.ownerId !== t.id || !sec.knownBy.includes('player')) why ??= 'You need a secret you know about him';
      if (t) reasons.push({ label: 'His wits', value: -Math.round(t.attributes.intrigue / 4) });
      reasons.push({ label: 'The photographs', value: 20 });
      weeks = 3;
      break;
    }
    case 'informant': {
      if (!t || !s.rivals.some((r) => r.id === t.faction) || s.rivals.some((r) => r.leaderId === t.id)) why ??= 'Pick one of a rival\'s men (not the boss)';
      else {
        const loyal = opinion(s, t.id, s.rivals.find((r) => r.id === t.faction)!.leaderId);
        reasons.push({ label: 'Loyalty to his boss', value: -Math.round(Math.max(0, loyal) / 3) - 15 });
        if (hasTrait(t, 'Greedy')) reasons.push({ label: 'Greedy', value: 15 });
        if (hasTrait(t, 'Loyal-to-a-fault')) reasons.push({ label: 'Loyal to a fault', value: -40 });
        if (t.informantFor) why ??= 'Already an informant';
      }
      cost = 2500;
      weeks = 6;
      break;
    }
    case 'befriend':
    case 'sway': {
      if (!t) why ??= 'No target';
      else {
        const op = opinion(s, t.id, s.playerId);
        reasons.push({ label: op >= 0 ? 'Opinion of you' : 'Dislikes you', value: Math.round(op / 3) });
        reasons.push({ label: 'Your diplomacy', value: Math.round((player(s).attributes.diplomacy - 50) / 3) });
      }
      weeks = kind === 'befriend' ? 10 : 3;
      secrecy = 100;
      break;
    }
    default:
      why ??= 'Not available';
  }
  const pk = kind === 'murder' ? perkMod(s, 'hitPower') : kind === 'heist' ? perkMod(s, 'heistPower') : kind === 'envoy' ? perkMod(s, 'envoy') : 0;
  if (pk) reasons.push({ label: 'Your perks', value: pk });
  if (kind !== 'envoy' && kind !== 'befriend' && kind !== 'sway') secrecy += perkMod(s, 'secrecy');
  const sum = reasons.reduce((a, r) => a + r.value, 0);
  return {
    chance: Math.max(0.05, Math.min(0.95, sum / 100)),
    weeks: Math.max(1, Math.round(weeks / d.speed)),
    secrecy: Math.max(5, Math.min(98, secrecy)),
    cost,
    reasons,
    disabledReason: why,
  };
}

export function topRival(s: GameState, districtId: string): RivalId | undefined {
  const d = s.districts.find((x) => x.id === districtId);
  if (!d) return undefined;
  return (Object.keys(d.influence) as FactionId[])
    .filter((f) => f !== 'player' && f !== 'none' && (d.influence[f] ?? 0) > 0 && s.rivals.some((r) => r.id === f))
    .sort((a, b) => (d.influence[b] ?? 0) - (d.influence[a] ?? 0))[0] as RivalId | undefined;
}

/** Hitting a made man needs the Table's sanction. */
export function needsSanction(s: GameState, t: Character): boolean {
  const r = s.rivals.find((x) => x.id === t.faction);
  return !!r && (r.kind === 'mob' || r.kind === 'philly') && t.rank !== 'civilian' && t.rank !== 'associate';
}

export function sanctioned(s: GameState, targetId: string): boolean {
  const t = s.characters[targetId];
  if (t && s.wars.some((w) => w.rival === t.faction && w.sanctioned)) return true;
  return (s.sanctions[targetId] ?? 0) >= s.week;
}

/* ---------------------------------------------------------------- */
/* Weekly                                                            */
/* ---------------------------------------------------------------- */

export function runSchemes(ctx: Ctx): void {
  const s = ctx.s;
  for (const sc of [...s.schemes]) {
    if (!s.schemes.includes(sc)) continue;
    const agents = agentChars(s, sc.agents);
    const target = sc.targetId ? s.characters[sc.targetId] : undefined;
    if ((sc.targetId && (!target || !target.alive)) || !s.characters[sc.ownerId]?.alive || (sc.owner === 'player' && !agents.length)) {
      s.schemes = s.schemes.filter((x) => x !== sc);
      if (sc.owner === 'player') ctx.log.push(`Scheme abandoned (${SCHEME_INFO[sc.kind].name}${target ? ` against ${displayName(target)}` : ''}): ${!agents.length ? 'no agents left' : 'the target is gone'}.`);
      continue;
    }
    for (const a of agents) a.busyUntil = s.week + 1;
    const weeks = sc.owner === 'player' ? schemeOdds(s, sc.kind, sc.targetId, sc.agents, sc.opts).weeks : sc.targetId === s.playerId ? 12 : 7;
    sc.progress = Math.min(100, sc.progress + Math.ceil(100 / weeks));
    // Discovery.
    if (sc.owner === 'player' && !sc.discovered && SCHEME_INFO[sc.kind].hostile) {
      const sec = schemeOdds(s, sc.kind, sc.targetId, sc.agents, sc.opts).secrecy;
      if (chance(s, (100 - sec) / 400)) {
        sc.discovered = true;
        onPlayerSchemeDiscovered(ctx, sc);
        if (!s.schemes.includes(sc)) continue;
      }
    } else if (sc.owner !== 'player' && !sc.discovered && sc.targetId && s.characters[sc.targetId]?.faction === 'player') {
      const spy = s.rivals.some((r) => r.id === sc.owner && Object.values(s.characters).some((x) => x.alive && x.faction === r.id && x.informantFor === 'player'));
      const p = 0.03 + (sc.targetId === s.playerId ? 0.04 : 0) + 0.07 * (s.council.consigliere.task === 'cons_secrets' ? seatPower(s, 'consigliere') : 0) + (spy ? 0.5 : 0);
      if (chance(s, p)) {
        sc.discovered = true;
        s.eventQueue.push(buildPlotUncovered(s, sc));
      }
    }
    if (sc.progress >= 100) {
      s.schemes = s.schemes.filter((x) => x !== sc);
      if (sc.owner === 'player') resolvePlayerScheme(ctx, sc);
      else resolveRivalScheme(ctx, sc);
    }
  }
}

function onPlayerSchemeDiscovered(ctx: Ctx, sc: Scheme): void {
  const s = ctx.s;
  const t = sc.targetId ? s.characters[sc.targetId] : undefined;
  const r = t ? s.rivals.find((x) => x.id === t.faction) : undefined;
  if (t) {
    addOpinion(s, t.id, s.playerId, `Plotted to ${SCHEME_INFO[sc.kind].verb} me`, -35, 1);
    changeMeter(s, t.id, s.playerId, 'grievance', 30);
  }
  if (r && t && r.leaderId !== t.id) addOpinion(s, r.leaderId, s.playerId, 'Plotted against my people', -20, 1);
  ctx.log.push(`Your scheme was discovered: ${SCHEME_INFO[sc.kind].name}${t ? ` against ${displayName(t)}` : ''}. They know.`);
  if (sc.kind === 'murder' && t && chance(s, 0.5)) {
    s.schemes = s.schemes.filter((x) => x !== sc);
    ctx.log.push(`${t.firstName} went to ground. The hit is off.`);
    cue(s, 'hit_botched', 'Gone to ground', `Somebody talked. ${displayName(t)} cleared out of his apartment overnight; the car sat empty on the street for a week.`);
  }
}

/* ---------------------------------------------------------------- */
/* Resolution                                                        */
/* ---------------------------------------------------------------- */

function apply(ctx: Ctx, label: string, because: string, effects: Effect[]): void {
  applyEffects(ctx, effects.map((e) => (e.label ? e : { ...e, label })), { label, because, category: 'event' });
}

function cue(s: GameState, key: string, title: string, text: string): void {
  if (s.cutscenes.length < 2) s.cutscenes.push({ key, title, text, week: s.week });
}

function resolvePlayerScheme(ctx: Ctx, sc: Scheme): void {
  const s = ctx.s;
  const odds = schemeOdds(s, sc.kind, sc.targetId, sc.agents, sc.opts);
  const t = sc.targetId ? s.characters[sc.targetId] : undefined;
  const agents = agentChars(s, sc.agents);
  const success = chance(s, odds.chance);
  const name = t ? displayName(t) : '';
  const label = `${SCHEME_INFO[sc.kind].name}${t ? `: ${t.firstName} ${t.lastName}` : ''}`;
  switch (sc.kind) {
    case 'murder': {
      if (!t) return;
      if (success) {
        const loc = LOCATIONS[sc.opts.location ?? 'barbershop'];
        const witness = chance(s, loc.witness * (sc.opts.disposal === 'disappear' ? 0.5 : 1) * (sc.opts.alibi ? 0.6 : 1));
        const pub = sc.opts.disposal !== 'disappear';
        const framed = sc.opts.frame ? s.rivals.find((r) => r.id === sc.opts.frame) : undefined;
        const frameHolds = framed ? chance(s, 0.7) : false;
        const killer: FactionId = framed && frameHolds ? framed.id : 'player';
        const cause = pub ? `shot at ${loc.name.toLowerCase()}` : 'disappeared — never found';
        const eff: Effect[] = [
          { type: 'kill', charId: t.id, cause, killer },
          { type: 'heat', bar: 'local', amount: pub ? 12 : 4 },
          { type: 'respect', amount: pub ? (sc.opts.location === 'boardwalk' ? 6 : 4) : 1 },
        ];
        const victimFaction = s.rivals.find((r) => r.id === t.faction);
        // One of his own (only ever on the boss's explicit, confirmed order): the crew, his family, a vendetta (peopleRead.ts).
        if (t.faction === 'player') eff.push(...ownHitFallout(s, t, pub));
        if (needsSanction(s, t) && !sanctioned(s, t.id) && !(framed && frameHolds)) {
          eff.push({ type: 'heat', bar: 'family', amount: 15 }, { type: 'rivalOpinion', rival: 'philly', amount: -20, reason: 'Killed a made man without the Table' });
          if (victimFaction && victimFaction.id !== 'philly') eff.push({ type: 'feud', rival: victimFaction.id });
        }
        if (framed && frameHolds && victimFaction && victimFaction.id !== framed.id) {
          addOpinion(s, s.characters[victimFaction.leaderId]?.id ?? '', framed.leaderId, `Killed ${t.firstName}`, -50, 0);
          ctx.log.push(`The word on the street: ${framed.shortName} did it.`);
        } else if (framed) {
          eff.push({ type: 'rivalOpinion', rival: framed.id, amount: -30, reason: 'Tried to frame us for a killing' });
          ctx.log.push(`Nobody believed ${framed.shortName} did it. Now ${framed.shortName} is angry too.`);
        }
        if (witness) {
          eff.push({ type: 'heat', bar: 'local', amount: 8 }, { type: 'heat', bar: 'federal', amount: 4 });
          for (const a of agents) addFedEvidence(s, a.id, 25, 'a murder');
          cue(s, 'hit_witness', 'A witness', `Someone saw the car. A waitress, a shoeshine boy — somebody who will remember a face.`);
        } else for (const a of agents) addFedEvidence(s, a.id, pub ? 10 : 6, 'a murder');
        if (!witness) cue(s, 'hit_success', pub ? 'A message' : 'Gone', pub ? `${name} was found at ${loc.name.toLowerCase()}. Everyone on the island knows what it means.` : `${name} went out for cigarettes and never came back.`);
        const war = s.wars.find((w) => w.rival === t.faction);
        if (war) eff.push({ type: 'warScore', warId: war.id, amount: s.rivals.some((r) => r.leaderId === t.id) ? 40 : 15 });
        apply(ctx, label, sc.because, eff);
        hitReceipt(s, sc, agents, name, witness);
        bonesFromScheme(ctx, sc, agents, true);
        ctx.log.push(`The hit on ${name} went ${witness ? 'down — but there was a witness' : 'down clean'}.`);
        s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${name} was killed${pub ? ` at ${loc.name.toLowerCase()}` : ' and never found'}.`, because: sc.because, becauseWeek: sc.startWeek, kind: 'death' });
      } else if (chance(s, 0.35) && agents.length) {
        const a = pick(s, agents);
        apply(ctx, label, sc.because, [{ type: 'imprison', charId: a.id, weeks: randInt(s, 26, 60) }, { type: 'heat', bar: 'local', amount: 10 }, { type: 'heat', bar: 'federal', amount: 5 }]);
        a.record = (a.record ?? 0) + 1;
        a.evidence = Math.min(100, (a.evidence ?? 0) + 20);
        cue(s, 'arrest_interrogation', 'Picked up', `${displayName(a)} was arrested two blocks from ${name}'s house with a pistol in his coat.`);
        bonesFromScheme(ctx, sc, agents, false);
        ctx.log.push(`The hit on ${name} fell apart; ${displayName(a)} was arrested.`);
      } else {
        t.health = Math.max(5, t.health - 30);
        const r = s.rivals.find((x) => x.id === t.faction);
        const eff: Effect[] = [{ type: 'heat', bar: 'local', amount: 10 }, { type: 'respect', amount: -3 }];
        if (r) {
          eff.push({ type: 'rivalOpinion', rival: r.id, amount: -30, reason: `Tried to kill ${t.firstName}` });
          eff.push({ type: 'schedule', key: 'retaliation', minWeeks: 1, maxWeeks: 3, chance: 0.8, hint: `${r.shortName} will hit back`, params: { rival: r.id } });
        }
        addOpinion(s, t.id, s.playerId, 'Tried to have me killed', -60, 0);
        if (t.faction === 'player') eff.push({ type: 'crewOpinion', amount: -5, reason: `The boss tried to have ${t.firstName} killed` });
        apply(ctx, label, sc.because, eff);
        cue(s, 'hit_botched', 'Botched', `The gun jammed. ${name} ran, bleeding, into the dark — and he saw who sent them.`);
        bonesFromScheme(ctx, sc, agents, false);
        ctx.log.push(`The hit on ${name} was botched. He survived and he knows.`);
      }
      break;
    }
    case 'heist': {
      const h = HEISTS[sc.opts.heist ?? 'jewelry'];
      // The job is played (or let play out) as a mini-game: minigameHeist.ts.
      if (queueHeist(ctx, sc, odds.chance)) break;
      if (success) {
        const take = randInt(s, h.payout[0] / 100, h.payout[1] / 100) * 100;
        // The man who carries the bag hands in the count. It is as honest as he is.
        const lead = agents[0];
        const skim = lead && receiptLie(s, lead, sc.id) ? Math.round(take * (0.1 + roll01(s.seed, sc.id, 'heistskim') * 0.2) / 100) * 100 : 0;
        apply(ctx, `Heist: ${h.name}`, sc.because, [{ type: 'money', amount: take - skim }, { type: 'unwashed', amount: take - skim }, { type: 'heat', bar: h.heat, amount: h.heatAmt }, { type: 'respect', amount: 2 }, ...(skim && lead ? [{ type: 'wealth', charId: lead.id, amount: skim } as Effect] : [])]);
        if (lead) {
          fileReceipt(s, { byId: lead.id, job: `the ${h.name.toLowerCase()}`, kind: 'heist', actual: take, reported: take - skim, outcome: 'clean', jobId: sc.id });
          noteScore(ctx, lead.id, take, h.name, take - skim);
        }
        bonesFromScheme(ctx, sc, agents, true);
        ctx.log.push(`The ${h.name.toLowerCase()} job came off: ${fmtMoney(take - skim)}${skim ? ' (by his count)' : ''}.`);
      } else {
        const eff: Effect[] = [{ type: 'heat', bar: h.heat, amount: h.heatAmt + 4 }];
        if (agents.length && chance(s, 0.5)) {
          const a = pick(s, agents);
          eff.push({ type: 'imprison', charId: a.id, weeks: randInt(s, 40, 100) });
          a.record = (a.record ?? 0) + 1;
          cue(s, 'arrest_interrogation', 'Pinched', `${displayName(a)} was caught with the bag.`);
        }
        apply(ctx, `Heist: ${h.name}`, sc.because, eff);
        bonesFromScheme(ctx, sc, agents, false);
        ctx.log.push(`The ${h.name.toLowerCase()} job went wrong.`);
      }
      break;
    }
    case 'envoy': {
      resolveEnvoy(ctx, sc, odds.chance, agents);
      break;
    }
    case 'claim': {
      const d = s.districts.find((x) => x.id === sc.opts.district);
      const owner = d ? topRival(s, d.id) : undefined;
      if (success && d && owner) {
        apply(ctx, `Claim: ${d.name}`, sc.because, [{ type: 'claim', district: d.id, against: owner, reason: 'Old deeds and a forged ledger say it was ours' }]);
        ctx.log.push(`Your people found (made) the papers: you now have a claim on ${d.name}.`);
      } else ctx.log.push(`The records clerk would not play along. No claim on ${d?.name ?? 'the district'}.`);
      break;
    }
    case 'blackmail': {
      if (!t) return;
      if (success) apply(ctx, label, sc.because, [{ type: 'hook', targetId: t.id, strong: true, reason: 'Blackmail' }, { type: 'opinion', from: t.id, to: s.playerId, amount: -20, reason: 'Blackmailed me', decay: 1 }, { type: 'meter', from: t.id, to: s.playerId, meter: 'fear', amount: 25 }]);
      else apply(ctx, label, sc.because, [{ type: 'opinion', from: t.id, to: s.playerId, amount: -30, reason: 'Tried to blackmail me', decay: 1 }]);
      ctx.log.push(success ? `${name} looked at the photographs for a long time. He belongs to you now.` : `${name} called your bluff.`);
      break;
    }
    case 'informant': {
      if (!t) return;
      if (success) {
        t.informantFor = 'player';
        const sec = { id: `x${s.nextId++}`, ownerId: t.id, kind: 'informant' as const, text: `${t.firstName} ${t.lastName} informs for you`, knownBy: ['player'] as FactionId[], week: s.week };
        s.secrets.push(sec);
        apply(ctx, label, sc.because, [{ type: 'hook', targetId: t.id, strong: true, reason: 'He informs for us' }]);
        ctx.log.push(`${name} now talks to your people every Tuesday. ${FACTION_NAMES[t.faction]} has a leak.`);
      } else {
        apply(ctx, label, sc.because, [{ type: 'opinion', from: t.id, to: s.playerId, amount: -20, reason: 'Tried to turn me', decay: 1 }]);
        ctx.log.push(`${name} turned you down and told his boss.`);
        const r = s.rivals.find((x) => x.id === t.faction);
        if (r) addOpinion(s, r.leaderId, s.playerId, 'Tried to turn my man', -15, 1);
      }
      break;
    }
    case 'befriend':
    case 'sway': {
      if (!t) return;
      if (success) {
        if (sc.kind === 'befriend') {
          addOpinion(s, t.id, s.playerId, 'Old friends', 30, 0);
          addOpinion(s, s.playerId, t.id, 'Old friends', 30, 0);
        } else addOpinion(s, t.id, s.playerId, 'Won me over', 20, 2);
        ctx.log.push(sc.kind === 'befriend' ? `${name} counts you as a friend now.` : `${name} has warmed to you.`);
      } else ctx.log.push(`${name} kept his distance.`);
      break;
    }
    default:
      break;
  }
}

/* ---------------------------------------------------------------- */
/* Rival schemes                                                     */
/* ---------------------------------------------------------------- */

export function rivalSchemes(ctx: Ctx): void {
  const s = ctx.s;
  const boss = player(s);
  for (const r of s.rivals) {
    if (r.kind !== 'mob') continue;
    const leader = s.characters[r.leaderId];
    if (!leader?.alive) continue;
    if (s.schemes.some((x) => x.owner === r.id)) continue;
    const op = opinion(s, r.leaderId, boss.id);
    const g = s.relations[`${r.leaderId}>${boss.id}`]?.grievance ?? 0;
    if (op > -30 && g < 40 && !r.feud && !r.war) continue;
    if (!chance(s, (r.feud || r.war ? 0.12 : 0.05) * ableness(s, r.leaderId))) continue;
    const lts = Object.values(s.characters).filter((c) => c.alive && c.faction === r.id && c.id !== leader.id);
    const agents = (lts.length ? lts : [leader]).slice(0, 2).map((c) => c.id);
    let kind: Scheme['kind'];
    let targetId: string | undefined;
    const ours = crew(s).filter((c) => isFree(s, c));
    if (op <= -70 && g >= 60 && chance(s, r.feud ? 0.5 : 0.3)) {
      kind = 'murder';
      targetId = boss.id;
    } else {
      const roll = randInt(s, 0, 3);
      if (roll === 0 && ours.some((c) => c.rank === 'capo')) {
        kind = 'murder';
        targetId = pick(s, ours.filter((c) => c.rank === 'capo')).id;
      } else if (roll === 1 && ours.some((c) => c.rank === 'soldier' || c.rank === 'associate')) {
        kind = 'flip';
        targetId = ours.filter((c) => c.rank === 'soldier' || c.rank === 'associate').sort((a, b) => opinion(s, a.id, boss.id) - opinion(s, b.id, boss.id))[0].id;
      } else if (roll === 2) {
        kind = 'frame';
        targetId = boss.id;
      } else {
        kind = 'claim';
        const d = s.districts.filter((x) => (x.influence.player ?? 0) > 10).sort((a, b) => (b.influence[r.id] ?? 0) - (a.influence[r.id] ?? 0))[0];
        if (!d) continue;
        s.schemes.push({ id: `sc${s.nextId++}`, kind, owner: r.id, ownerId: leader.id, targetId: undefined, agents, opts: { depth: 'planned', district: d.id }, progress: 0, startWeek: s.week, discovered: false, because: `${r.shortName} schemed against you` });
        continue;
      }
    }
    s.schemes.push({ id: `sc${s.nextId++}`, kind, owner: r.id, ownerId: leader.id, targetId, agents, opts: { depth: 'planned' }, progress: 0, startWeek: s.week, discovered: false, because: `${r.shortName} schemed against you` });
  }
}

function resolveRivalScheme(ctx: Ctx, sc: Scheme): void {
  const s = ctx.s;
  const r = s.rivals.find((x) => x.id === sc.owner);
  if (!r) return;
  const t = sc.targetId ? s.characters[sc.targetId] : undefined;
  const label = `${r.shortName}'s plot`;
  switch (sc.kind) {
    case 'murder': {
      if (!t?.alive || t.faction !== 'player') return;
      const def = targetDefense(s, t).reduce((a, x) => a + x.value, 0);
      const p = Math.max(0.05, Math.min(t.id === s.playerId ? 0.35 : 0.7, (50 + r.muscle / 3 + def) / 100));
      if (chance(s, p)) {
        cue(s, t.id === s.playerId ? 'boss_death' : 'hit_success', t.id === s.playerId ? 'The end of a reign' : 'One of ours', `${displayName(t)} was shot by ${r.shortName}'s men.`);
        apply(ctx, label, sc.because, [{ type: 'kill', charId: t.id, cause: `murdered on the orders of ${displayName(s.characters[r.leaderId])}`, killer: r.id }]);
      } else {
        t.health = Math.max(5, t.health - 25);
        apply(ctx, label, sc.because, [{ type: 'heat', bar: 'local', amount: 5 }]);
        ctx.log.push(`${r.shortName}'s gunmen tried for ${displayName(t)} and missed. He's in the hospital at Burdette Tomlin.`);
      }
      break;
    }
    case 'flip':
      if (t?.alive && t.faction === 'player') {
        t.informantFor = r.id;
        s.secrets.push({ id: `x${s.nextId++}`, ownerId: t.id, kind: 'informant', text: `${t.firstName} ${t.lastName} informs for ${r.shortName}`, knownBy: [r.id], week: s.week });
        ctx.log.push(`(Unknown to you, one of your men started talking to ${r.shortName}.)`);
      }
      break;
    case 'frame':
      apply(ctx, label, sc.because, [{ type: 'heat', bar: 'federal', amount: 8 }]);
      { const b = player(s); b.evidence = Math.min(100, (b.evidence ?? 0) + 15); }
      ctx.log.push(`${r.shortName} fed the FBI a story about you.`);
      break;
    case 'claim': {
      const d = s.districts.find((x) => x.id === sc.opts.district);
      if (d) {
        const lost = -shiftInfluence(s, d.id, 'player', -8);
        shiftInfluence(s, d.id, r.id, lost);
        apply(ctx, label, sc.because, [{ type: 'respect', amount: -2 }]);
        ctx.log.push(`${r.shortName} produced papers on ${d.name} and moved in: −${lost}% of your action there.`);
      }
      break;
    }
    default:
      break;
  }
}

export function buildPlotUncovered(s: GameState, sc: Scheme): EventInstance {
  const r = s.rivals.find((x) => x.id === sc.owner)!;
  const leader = s.characters[r.leaderId];
  const t = sc.targetId ? s.characters[sc.targetId] : undefined;
  const what = sc.kind === 'murder' ? `kill ${t?.id === s.playerId ? 'you' : t ? displayName(t) : 'one of yours'}` : sc.kind === 'flip' ? `turn ${t ? displayName(t) : 'one of your men'}` : sc.kind === 'frame' ? 'feed the FBI a story about you' : `take ${s.districts.find((d) => d.id === sc.opts.district)?.name ?? 'a district'} with forged papers`;
  const label = `Plot uncovered: ${r.shortName}`;
  return {
    iid: `ev${s.nextId++}`, defId: 'plot_uncovered', week: s.week, mandatory: true, priority: 78,
    title: 'A plot uncovered',
    text: `Your people heard it in a Ventnor bar: ${displayName(leader)} is planning to ${what}. It is ${sc.progress}% ready.`,
    defaultChoiceId: 'foil', meta: { scheme: sc.id }, actors: [leader.id, ...(t && t.id !== s.playerId ? [t.id] : [])],
    choices: [
      { id: 'foil', label: 'Foil it — and keep the proof', detail: 'A strong hook on him: you know what he tried.', because: `foiled ${r.shortName}'s plot`, effects: [{ type: 'endScheme', schemeId: sc.id, label }, { type: 'hook', targetId: leader.id, strong: true, reason: 'We know what he plotted', label }, { type: 'rivalOpinion', rival: r.id, amount: -10, reason: 'Foiled my plans', label }] },
      { id: 'strike', label: 'Strike first', detail: 'Hit his people tonight.', because: `struck first at ${r.shortName}`, effects: [{ type: 'endScheme', schemeId: sc.id, label }, { type: 'rivalResource', rival: r.id, muscle: -10, money: -2500, label }, { type: 'respect', amount: 3, label }, { type: 'heat', bar: 'local', amount: 6, label }, { type: 'rivalOpinion', rival: r.id, amount: -20, reason: 'Hit us first', label }] },
      { id: 'table', label: 'Take it to the Table', detail: 'Make him answer to Philadelphia.', because: `took ${r.shortName}'s plot to the Table`, effects: [{ type: 'endScheme', schemeId: sc.id, label }, { type: 'rivalResource', rival: r.id, exposure: 15, label }, { type: 'rivalOpinion', rival: 'philly', amount: 5, reason: 'Brought a grievance properly', label }, { type: 'flag', key: `grievance_${r.id}`, value: 1, label }] },
    ],
  };
}

/** The man who led a hit hands in his report: was it clean? A witness is the thing a liar leaves out. */
function hitReceipt(s: GameState, sc: Scheme, agents: Character[], name: string, witness: boolean): void {
  const lead = agents[0];
  if (!lead) return;
  const lie = witness && receiptLie(s, lead, sc.id);
  const truth = witness ? 'It got done, but a waitress got a look at the car.' : 'It got done. Nobody saw nothing.';
  fileReceipt(s, { byId: lead.id, job: `the ${name} piece of work`, kind: 'hit', actual: 0, reported: 0, said: lie ? 'It got done. Nobody saw nothing.' : truth, truth, jobId: sc.id });
}

export function ageOk(s: GameState, c: Character): boolean {
  return ageOn(c.birth, s.date) >= 16;
}
