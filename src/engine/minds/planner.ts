import { displayName, hasTrait, isFree } from '../characters';
import { addStory } from '../hierarchy';
import { heat, money, type Ctx } from '../ledger';
import { addOpinion, changeMeter, opinion } from '../relations';
import type { Character, FactionId, GameState, Rival, RivalMove } from '../types';
import { believe, factText, nameOf, startRumor, sureWord } from './beliefs';
import { grudge, remember, worstGrudge } from './memory';
import { drives, isHothead, isSchemer, riskTolerance, urgencies, type Drives } from './psyche';
import { ageOf, clamp, mindOf, r01, rivalLedBy, roll } from './state';
import {
  AMBITION_TEXT, GOAL_TEXT, NEED_TEXT, NEEDS, PLAN_COOLDOWN, PLAN_TEXT, SECRET_PLANS, STEP_TEXT, WHY_CAP,
  type GoalKind, type Mind, type MindsState, type Motive, type Need, type Plan, type PlanKind, type StepKind,
} from './types';

/**
 * The utility planner. At each decision point the existing systems already
 * have (a rival's weekly move, a capo's own initiative, a rival planning a
 * move on you, a lieutenant's pick), the man's mind weighs the options by
 * expected utility: how much each would feed his most urgent needs, whether
 * it serves a goal or the step of a plan he is working, what he believes
 * about the target (is he weak? can he be trusted?), what he holds against
 * him, and how much risk he will take. The result scales the system's own
 * weights; the system still rolls its own dice, keeps its caps and its
 * cooldowns. Every choice keeps its motive chain.
 *
 * Multi-step plans run on the minds' own dice when he thinks: preconditions
 * are checked every step; a plan whose target is gone is re-aimed, one whose
 * risk has become too much for him is put off or dropped.
 */

/* ------------------------------------------------------------------ */
/* Utility                                                             */
/* ------------------------------------------------------------------ */

type Eff = Partial<Record<Need, number>>;

export type CapoMove = 'expand' | 'skim' | 'heat' | 'beef' | 'earn' | 'recruit' | 'cops';

const CAPO_EFF: Record<CapoMove, Eff> = {
  expand: { power: 0.6, respect: 0.4, money: 0.3, safety: -0.3 },
  skim: { money: 0.9, loyalty: -0.6, safety: -0.25 },
  heat: { loyalty: 0.9, respect: 0.2, safety: -0.5 },
  beef: { respect: 0.5, revenge: 0.8, safety: -0.35, loyalty: -0.1 },
  earn: { money: 0.5, loyalty: 0.3, safety: 0.1 },
  recruit: { power: 0.6, respect: 0.2 },
  cops: { safety: 0.5, power: 0.2 },
};
const CAPO_RISK: Record<CapoMove, number> = { expand: 0.5, skim: 0.4, heat: 0.5, beef: 0.7, earn: 0, recruit: 0.1, cops: 0.1 };
const CAPO_GOAL: Partial<Record<GoalKind, CapoMove[]>> = {
  earn: ['earn'], skim: ['skim'], prove: ['earn', 'expand'], confront: ['beef'], lielow: ['cops', 'earn'], following: ['recruit', 'expand'],
  get_even: ['beef'], serve: ['heat', 'earn'], expand: ['expand'], protect: ['cops'],
};

const RIVAL_EFF: Record<RivalMove, Eff> = {
  expand: { power: 0.7, money: 0.4, safety: -0.2 },
  ally: { safety: 0.5, power: 0.2, loyalty: 0.2 },
  strike: { revenge: 0.9, respect: 0.6, power: 0.3, safety: -0.5 },
  offer_deal: { money: 0.7, safety: 0.2 },
  hide: { safety: 0.8, respect: -0.2 },
  bribe: { safety: 0.6, money: -0.3 },
  inform: { revenge: 0.5, safety: 0.2, respect: -0.3 },
};
const RIVAL_RISK: Record<RivalMove, number> = { expand: 0.4, ally: 0, strike: 0.8, offer_deal: 0, hide: -0.3, bribe: 0.1, inform: 0.3 };
const RIVAL_GOAL: Partial<Record<GoalKind, RivalMove[]>> = {
  earn: ['offer_deal', 'expand'], expand: ['expand'], confront: ['strike'], get_even: ['strike'], smear: ['inform'], lielow: ['hide', 'bribe'],
  befriend: ['ally'], following: ['ally'],
};
const STEP_RIVAL: Partial<Record<StepKind, RivalMove>> = { probe: 'inform', weaken: 'expand', strike: 'strike', ally: 'ally', deal: 'offer_deal' };
const STEP_CAPO: Partial<Record<StepKind, CapoMove>> = { prove: 'earn', strike: 'beef', save: 'earn' };

/** The man's view right now: drives, urgencies, risk. */
export interface Outlook { c: Character; m: Mind; d: Drives; u: Drives; rt: number }

export function outlook(s: GameState, id: string): Outlook | undefined {
  const m = mindOf(s, id);
  const c = s.characters[id];
  if (!m || !c?.alive) return undefined;
  const d = drives(s, c);
  return { c, m, d, u: urgencies(d, m.sat), rt: riskTolerance(s, c, m.mood) };
}

/** Utility of an act with these need effects, for this man; and the need that drove it most. */
export function utilityOf(o: Outlook, eff: Eff, risk: number): { u: number; need: Need } {
  let u = 0;
  let best: Need = 'money';
  let bestV = -Infinity;
  for (const n of NEEDS) {
    const e = eff[n] ?? 0;
    const v = o.u[n] * e * 2;
    u += v;
    if (v > bestV) { bestV = v; best = n; }
  }
  u += risk * (o.rt - 0.5) * 1.2;
  return { u, need: best };
}

const mult = (u: number): number => Math.round(clamp(Math.exp(u * 1.4), 0.35, 2.6) * 100) / 100;

/* ------------------------------------------------------------------ */
/* Hooks: capos                                                        */
/* ------------------------------------------------------------------ */

export interface CapoLean { need: Record<string, Need>; goal: Record<string, string>; m: Record<string, number> }

/**
 * A capo's own initiative (regimes.ts): scale the move weights by his mind.
 * Pure on the minds (no dice). Returns what it weighed, for the motive.
 */
export function capoLean(s: GameState, k: Character, w: Record<CapoMove, number>): CapoLean | undefined {
  const o = outlook(s, k.id);
  if (!o) return undefined;
  const out: CapoLean = { need: {}, goal: {}, m: {} };
  const step = o.m.plan ? o.m.plan.steps[o.m.plan.i] : undefined;
  for (const mv of Object.keys(w) as CapoMove[]) {
    if (!(w[mv] > 0)) continue;
    const { u, need } = utilityOf(o, CAPO_EFF[mv], CAPO_RISK[mv]);
    let x = u;
    const g = o.m.goals.find((gl) => CAPO_GOAL[gl.k]?.includes(mv));
    if (g) { x += 0.35 * g.pri + 0.1; out.goal[mv] = GOAL_TEXT[g.k]; }
    if (step && STEP_CAPO[step] === mv) { x += 0.4; out.goal[mv] = `${PLAN_TEXT[o.m.plan!.k].split(':')[0]}: ${STEP_TEXT[step]}`; }
    // Cowards keep their heads down; loyalists sacrifice; the greedy skim.
    if (mv === 'beef' && hasTrait(k, 'Cowardly')) x -= 0.5;
    if (mv === 'heat' && hasTrait(k, 'Loyal-to-a-fault')) x += 0.25;
    if (mv === 'skim' && o.m.mood === 'greedy') x += 0.25;
    const f = mult(x);
    w[mv] = Math.round(w[mv] * f * 1000) / 1000;
    out.need[mv] = need;
    out.m[mv] = f;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Hooks: rivals                                                       */
/* ------------------------------------------------------------------ */

export function leaderFor(s: GameState, f: FactionId): string | undefined {
  if (f === 'player') return s.playerId;
  return s.rivals.find((r) => r.id === f)?.leaderId;
}

/** How the rival boss sizes up the target: believed strength vs his own (with how sure he is). */
function sizeUp(s: GameState, o: Outlook, r: Rival, targetLeader: string | undefined): { f: number; text?: string } {
  if (!targetLeader) return { f: 1 };
  const b = o.m.bel[targetLeader];
  if (b?.s === undefined) return { f: 1 };
  const gap = (r.muscle - b.s) / 100;
  const f = clamp(1 + gap * (b.sc ?? 0.3) * 1.5, 0.6, 1.6);
  const text = `${sureWord(b.sc ?? 0.3)} ${nameOf(s, targetLeader)} is ${b.s < r.muscle - 10 ? 'weaker than him' : b.s > r.muscle + 10 ? 'stronger than him' : 'about his match'}`;
  return { f, text };
}

export interface RivalCand { move: RivalMove; target: FactionId; score: number }

/**
 * A rival boss's weekly move (rivals.ts): each (move, target) is scaled by
 * his expected utility, his read of the target, his grudge and his plan.
 * Pure (no dice). The candidates are changed in place.
 */
export function rivalLean(s: GameState, r: Rival, cands: RivalCand[]): void {
  const o = outlook(s, r.leaderId);
  if (!o) return;
  const plan = o.m.plan;
  const step = plan ? plan.steps[plan.i] : undefined;
  for (const cd of cands) {
    const { u } = utilityOf(o, RIVAL_EFF[cd.move], RIVAL_RISK[cd.move]);
    let x = u;
    const tl = leaderFor(s, cd.target);
    const g = o.m.goals.find((gl) => RIVAL_GOAL[gl.k]?.includes(cd.move) && (!gl.t || gl.t === tl));
    if (g) x += 0.3 * g.pri + 0.1;
    if (step && STEP_RIVAL[step] === cd.move && plan && (!plan.t || plan.t === tl)) x += 0.45;
    let f = mult(x);
    if (cd.move === 'strike' || cd.move === 'expand') f *= sizeUp(s, o, r, tl).f;
    if ((cd.move === 'strike' || cd.move === 'inform') && tl) f *= clamp(1 + grudge(o.m, tl) / 50, 1, 1.8);
    if (cd.move === 'ally' && tl) { const b = o.m.bel[tl]; if (b?.t !== undefined) f *= clamp(1 + (b.t / 200) * (b.tc ?? 0.3), 0.6, 1.4); }
    cd.score = Math.round(cd.score * f * 1000) / 1000;
  }
}

/** His motive for the move he made; and a plan step that the move completes. */
export function noteRivalMove(s: GameState, r: Rival, move: RivalMove, target: FactionId): void {
  const o = outlook(s, r.leaderId);
  if (!o) return;
  const { need } = utilityOf(o, RIVAL_EFF[move], RIVAL_RISK[move]);
  const tl = leaderFor(s, target);
  const g = o.m.goals.find((gl) => RIVAL_GOAL[gl.k]?.includes(move));
  const plan = o.m.plan;
  const step = plan ? plan.steps[plan.i] : undefined;
  const stepHit = !!(step && STEP_RIVAL[step] === move && plan && (!plan.t || plan.t === tl));
  const su = move === 'strike' || move === 'expand' ? sizeUp(s, o, r, tl).text : undefined;
  const gr = tl ? grudge(o.m, tl) : 0;
  motive(s, o.m, {
    a: moveText(s, move, target),
    n: need,
    g: stepHit ? `${PLAN_TEXT[plan!.k].split(':')[0]}: ${STEP_TEXT[step!]}` : g ? GOAL_TEXT[g.k] : o.m.amb ? AMBITION_TEXT[o.m.amb.k] : undefined,
    b: su ?? (gr >= 10 ? `holds a grudge against ${nameOf(s, tl)}` : undefined),
    c: `${NEED_TEXT[need]}; risk taken ${Math.round(o.rt * 100)}%`,
  });
  if (stepHit) advanceStep(s, o.m, 'move');
}

function moveText(s: GameState, move: RivalMove, target: FactionId): string {
  const t = target === 'player' ? 'you' : s.rivals.find((x) => x.id === target)?.shortName ?? target;
  switch (move) {
    case 'expand': return `pushed into ${t === 'you' ? 'your' : `${t}'s`} ground`;
    case 'ally': return `made friendly overtures to ${t}`;
    case 'strike': return `struck at ${t}`;
    case 'offer_deal': return `offered ${t} a deal`;
    case 'hide': return 'laid low';
    case 'bribe': return 'spread money around City Hall';
    case 'inform': return `fed the law a story about ${t}`;
  }
  return move;
}

/* ------------------------------------------------------------------ */
/* Hooks: threats (a rival planning a move on you)                     */
/* ------------------------------------------------------------------ */

export interface ThreatLean { mult: number; label: string; kinds: Record<string, number> }

/** How his mind pushes a rival boss to plan against you (threats.ts). Pure. */
export function threatLean(s: GameState, r: Rival): ThreatLean | undefined {
  const o = outlook(s, r.leaderId);
  if (!o) return undefined;
  const g = grudge(o.m, s.playerId);
  const b = o.m.bel[s.playerId];
  const weak = b?.s !== undefined ? clamp((r.muscle - b.s) / 100 * (b.sc ?? 0.3), -0.4, 0.4) : 0;
  const planOnYou = o.m.plan && o.m.plan.t === s.playerId && (o.m.plan.k === 'crush' || o.m.plan.k === 'avenge') ? 0.25 : 0;
  const afraid = o.m.mood === 'afraid' ? -0.3 : 0;
  const hostility = o.u.revenge * 0.8 + o.u.power * 0.4 + g / 60 + weak + planOnYou + afraid - (o.m.plan?.k === 'court' && o.m.plan.t === s.playerId ? 0.3 : 0);
  const m = Math.round(clamp(0.75 + hostility, 0.5, 1.6) * 100) / 100;
  const label = planOnYou ? `His mind: ${PLAN_TEXT[o.m.plan!.k].split(':')[0].toLowerCase()}` : g >= 10 ? 'His mind: a grudge against you' : weak > 0.1 ? 'His mind: he thinks you are weak' : afraid ? 'His mind: he is scared' : `His mind: ${o.m.mood}`;
  return {
    mult: m,
    label,
    kinds: {
      hit: clamp(1 + o.u.revenge * 1.5 + g / 40 + (isHothead(o.c) ? 0.3 : 0), 0.5, 2.5),
      move: clamp(1 + o.u.power, 0.6, 2),
      racket: clamp(1 + o.u.money, 0.6, 2),
      poach: clamp(1 + o.u.power * 0.6, 0.6, 2),
      bribe: clamp(1 + (isSchemer(o.c) ? 0.4 : 0), 0.6, 2),
      setup: clamp(1 + (isSchemer(o.c) ? 0.5 : 0) + o.u.revenge * 0.5, 0.6, 2),
    },
  };
}

export function noteThreatPlan(s: GameState, r: Rival, kind: string, targetId?: string): void {
  const o = outlook(s, r.leaderId);
  if (!o) return;
  const g = grudge(o.m, s.playerId);
  const b = o.m.bel[s.playerId];
  const need: Need = kind === 'hit' ? 'revenge' : kind === 'racket' ? 'money' : kind === 'move' || kind === 'poach' ? 'power' : 'respect';
  motive(s, o.m, {
    a: `planned a ${kind === 'move' ? 'push on your ground' : kind === 'hit' ? 'hit' : kind === 'racket' ? 'stick-up of a racket' : kind}${targetId ? ` against ${nameOf(s, targetId)}` : ''}`,
    n: need,
    g: o.m.plan?.t === s.playerId ? PLAN_TEXT[o.m.plan.k].split(':')[0] : o.m.amb ? AMBITION_TEXT[o.m.amb.k] : undefined,
    b: g >= 10 ? 'holds a grudge against you' : b?.s !== undefined ? `${sureWord(b.sc ?? 0.3)} your crew is ${b.s < r.muscle ? 'weaker than his' : 'strong'}` : undefined,
  });
}

/* ------------------------------------------------------------------ */
/* Hooks: lieutenants                                                  */
/* ------------------------------------------------------------------ */

/** Leanings the lieutenant's mind adds to his profile (lieutenants.ts): only strong ones. Pure. */
export function ltLean(s: GameState, c: Character): { greedy?: boolean; ambitious?: boolean; cautious?: boolean; temper?: boolean } {
  const o = outlook(s, c.id);
  if (!o) return {};
  const out: { greedy?: boolean; ambitious?: boolean; cautious?: boolean; temper?: boolean } = {};
  if (o.u.money >= 0.35 && (o.m.mood === 'greedy' || o.m.goals.some((g) => g.k === 'skim'))) out.greedy = true;
  if (o.u.power >= 0.35 && (o.m.amb?.k === 'chair' || o.m.goals.some((g) => g.k === 'following'))) out.ambitious = true;
  if (o.m.mood === 'afraid' || o.u.safety >= 0.45) out.cautious = true;
  if (o.m.mood === 'angry' && o.u.revenge >= 0.3) out.temper = true;
  return out;
}

/* ------------------------------------------------------------------ */
/* Motives                                                             */
/* ------------------------------------------------------------------ */

export function motive(s: GameState, m: Mind, x: Omit<Motive, 'w'>): void {
  const mo: Motive = { w: s.week, a: x.a.slice(0, 120), n: x.n, ...(x.g ? { g: x.g.slice(0, 90) } : {}), ...(x.b ? { b: x.b.slice(0, 90) } : {}), ...(x.c ? { c: x.c.slice(0, 90) } : {}), ...(x.h ? { h: 1 as const } : {}) };
  m.why.push(mo);
  if (m.why.length > WHY_CAP) m.why.splice(0, m.why.length - WHY_CAP);
}

/** A capo's chosen move, with the chain behind it. */
export function noteCapoMove(s: GameState, k: Character, mv: CapoMove, lean: CapoLean | undefined, text?: string): void {
  const m = mindOf(s, k.id);
  if (!m || !lean) return;
  const others = Object.entries(lean.m).filter(([x]) => x !== mv).sort((a, b) => b[1] - a[1]);
  motive(s, m, {
    a: text ?? CAPO_TEXT[mv],
    n: lean.need[mv] ?? 'money',
    g: lean.goal[mv] ?? (m.amb ? AMBITION_TEXT[m.amb.k] : undefined),
    b: beliefLine(s, m),
    c: others.length ? `over ${CAPO_TEXT[others[0][0] as CapoMove]}` : undefined,
    ...(mv === 'skim' ? { h: 1 as const } : {}),
  });
  const step = m.plan ? m.plan.steps[m.plan.i] : undefined;
  if (step && STEP_CAPO[step] === mv) advanceStep(s, m, 'move');
}

const CAPO_TEXT: Record<CapoMove, string> = {
  expand: 'pushed onto a rival\'s corners on his own', skim: 'kept a little back from the envelope', heat: 'took the heat for the family',
  beef: 'started a beef', earn: 'worked his crew hard for a good week', recruit: 'brought a new kid in', cops: 'made a friend at City Hall',
};

function beliefLine(s: GameState, m: Mind): string | undefined {
  const b = m.bel[s.playerId];
  if (b?.t !== undefined && (b.tc ?? 0) >= 0.3) return `${sureWord(b.tc ?? 0)} the boss ${b.t >= 20 ? 'has his back' : b.t <= -20 ? 'is against him' : 'could go either way on him'}`;
  const f = m.facts.find((x) => x.c >= 0.4);
  return f ? `${sureWord(f.c)} ${factText(s, f)}` : undefined;
}

/* ------------------------------------------------------------------ */
/* Multi-step plans                                                    */
/* ------------------------------------------------------------------ */

const TEMPLATES: Record<PlanKind, { steps: StepKind[]; need: Need }> = {
  climb: { steps: ['prove', 'favor', 'ask'], need: 'respect' },
  betray: { steps: ['befriend', 'borrow', 'welsh'], need: 'money' },
  avenge: { steps: ['learn', 'wait', 'strike'], need: 'revenge' },
  score: { steps: ['case', 'crew', 'pull'], need: 'money' },
  getout: { steps: ['save', 'tell'], need: 'safety' },
  crush: { steps: ['probe', 'weaken', 'strike'], need: 'power' },
  court: { steps: ['ally', 'deal'], need: 'money' },
};
/** Bias steps finish when the system makes the move (or time out). */
const BIAS_STEPS = new Set<StepKind>(['probe', 'weaken', 'ally', 'deal']);
const STEP_TIMEOUT = 5;

export function startPlan(s: GameState, M: MindsState, m: Mind, k: PlanKind, t: string | undefined, why: string): Plan | undefined {
  if ((m.pc?.[k] ?? -1) > s.week) return undefined;
  const p: Plan = { k, ...(t ? { t } : {}), steps: TEMPLATES[k].steps.slice(), i: 0, w: s.week, sw: s.week, ad: 0, why: why.slice(0, 100) };
  m.plan = p;
  M.stats.plans++;
  return p;
}

function advanceStep(s: GameState, m: Mind, _how: string): void {
  const p = m.plan;
  if (!p) return;
  p.i++;
  p.sw = s.week;
  if (p.i >= p.steps.length) {
    remember(m, { w: s.week, k: 'win', ...(p.t ? { who: p.t } : {}), t: `saw it through: ${PLAN_TEXT[p.k].split(':')[0].toLowerCase()}`, v: 10 });
    cool(s, m, p.k);
    m.plan = undefined;
    if (s.minds) s.minds.stats.done++;
  }
}

function cool(s: GameState, m: Mind, k: PlanKind): void {
  m.pc = { ...(m.pc ?? {}), [k]: s.week + PLAN_COOLDOWN };
  for (const x of Object.keys(m.pc) as PlanKind[]) if ((m.pc[x] ?? 0) <= s.week) delete m.pc[x];
}

function dropPlan(s: GameState, M: MindsState, m: Mind, why: string): void {
  if (!m.plan) return;
  motive(s, m, { a: `gave up: ${PLAN_TEXT[m.plan.k].split(':')[0].toLowerCase()}`, n: TEMPLATES[m.plan.k].need, g: why });
  cool(s, m, m.plan.k);
  m.plan = undefined;
  M.stats.failed++;
}

/** Choose a plan for a man without one, if his ambition, goals and nature call for one. */
export function considerPlan(s: GameState, M: MindsState, o: Outlook): void {
  const { c, m } = o;
  if (m.plan) return;
  const r = rivalLedBy(s, c.id);
  const amb = m.amb?.k;
  const eager = isSchemer(c) ? 0.5 : 0.3;
  if (!roll(M, eager)) return;
  if (r) {
    if (r.kind === 'law') return;
    if (amb === 'avenge' && m.amb?.t) { startPlan(s, M, m, 'avenge', m.amb.t, `${NEED_TEXT.revenge}: ${nameOf(s, m.amb.t)}`); return; }
    // Who to push on: the one he resents most and believes weakest.
    const targets = [s.playerId, ...s.rivals.filter((x) => x.id !== r.id && x.kind === 'mob' && s.characters[x.leaderId]?.alive).map((x) => x.leaderId)];
    const score = (t: string) => grudge(m, t) / 20 + (r.muscle - (m.bel[t]?.s ?? 50)) / 40 + (t === s.playerId ? 0.5 : 0);
    const best = targets.sort((a, b) => score(b) - score(a) || a.localeCompare(b))[0];
    if ((amb === 'crown' || o.u.power >= 0.3 || o.u.revenge >= 0.3) && o.rt >= 0.35) {
      startPlan(s, M, m, 'crush', best, `${NEED_TEXT[o.u.revenge > o.u.power ? 'revenge' : 'power']}; ${sureWord(m.bel[best]?.sc ?? 0.3)} ${nameOf(s, best)} can be taken`);
      return;
    }
    const friend = targets.sort((a, b) => opinion(s, c.id, b) - opinion(s, c.id, a) || a.localeCompare(b))[0];
    if (opinion(s, c.id, friend) > -20) startPlan(s, M, m, 'court', friend, `${NEED_TEXT[o.u.safety > o.u.money ? 'safety' : 'money']}: better a deal than a war`);
    return;
  }
  if (c.faction !== 'player' || c.rank === 'civilian' || !isFree(s, c)) return;
  // (A grudge against the boss himself is carried, not acted on here: the chair is the shadow court's business.)
  if (amb === 'avenge' && m.amb?.t && m.amb.t !== s.playerId) { startPlan(s, M, m, 'avenge', m.amb.t, `${NEED_TEXT.revenge}: ${nameOf(s, m.amb.t)}`); return; }
  const opB = opinion(s, c.id, s.playerId);
  if (isSchemer(c) && (hasTrait(c, 'Greedy') || hasTrait(c, 'Ambitious')) && opB < 10 && !hasTrait(c, 'Loyal-to-a-fault') && !hasTrait(c, 'Honest')) {
    const mark = betrayTarget(s, m, c);
    if (mark) { startPlan(s, M, m, 'betray', mark, `${NEED_TEXT.money}; ${sureWord(m.bel[mark]?.wc ?? 0.3)} ${nameOf(s, mark)} has money and trusts him`); return; }
  }
  if ((amb === 'capo' || amb === 'made') && (c.rank === 'soldier' || c.rank === 'associate') && opB >= -10) {
    startPlan(s, M, m, 'climb', s.playerId, `${NEED_TEXT.respect}: ${AMBITION_TEXT[amb].toLowerCase()}`);
    return;
  }
  if ((amb === 'score' || amb === 'rich') && (hasTrait(c, 'Greedy') || hasTrait(c, 'Gambler')) && o.rt >= 0.45) {
    startPlan(s, M, m, 'score', undefined, `${NEED_TEXT.money}: one big score`);
    return;
  }
  if (amb === 'out' && ageOf(s, c) >= 55) startPlan(s, M, m, 'getout', s.playerId, `${NEED_TEXT.safety}: too old for this`);
}

function betrayTarget(s: GameState, m: Mind, c: Character): string | undefined {
  const pool = Object.keys(s.minds?.minds ?? {}).filter((id) => {
    const x = s.characters[id];
    return id !== c.id && x?.alive && x.faction === 'player' && x.id !== s.playerId && x.rank !== 'civilian' && isFree(s, x) && x.wealth >= 400;
  });
  pool.sort((a, b) => (m.bel[b]?.w ?? s.characters[b].wealth / 150) - (m.bel[a]?.w ?? s.characters[a].wealth / 150) || a.localeCompare(b));
  return pool[0];
}

/** Work the current step of his plan (on the minds' dice). Returns a line for the log, if any. */
export function workPlan(ctx: Ctx, M: MindsState, o: Outlook): string | undefined {
  const s = ctx.s;
  const { c, m } = o;
  const p = m.plan;
  if (!p) return undefined;
  const step = p.steps[p.i];
  const nm = displayName(c);
  const t = p.t ? s.characters[p.t] : undefined;
  const need = TEMPLATES[p.k].need;
  const label = PLAN_TEXT[p.k].split(':')[0];
  const secret = SECRET_PLANS.includes(p.k);
  const note = (a: string, b?: string) => motive(s, m, { a, n: need, g: `${label}: ${STEP_TEXT[step]}`, ...(b ? { b } : {}), c: p.why, ...(secret ? { h: 1 as const } : {}) });

  // Preconditions: the target must still be there; a step too dangerous for him now is put off or dropped.
  if (p.t && p.t !== s.playerId && !t?.alive) {
    if (p.k === 'avenge') { remember(m, { w: s.week, k: 'win', t: 'someone else got there first', v: 6 }); cool(s, m, 'avenge'); m.plan = undefined; M.stats.done++; return undefined; }
    const again = p.k === 'betray' ? betrayTarget(s, m, c) : undefined;
    if (again && p.ad < 2) { p.t = again; p.i = 0; p.sw = s.week; p.ad++; M.stats.adapted++; note(`turned his attention to ${nameOf(s, again)}`); return undefined; }
    dropPlan(s, M, m, 'the man he was working is gone');
    return undefined;
  }
  const risky = step === 'strike' || step === 'pull' || step === 'welsh';
  if (risky && o.u.safety >= 0.4) {
    if (hasTrait(c, 'Cowardly') || s.week - p.sw > 8) { dropPlan(s, M, m, `${NEED_TEXT.safety}: lost his nerve`); return undefined; }
    return undefined; // put off
  }
  if (BIAS_STEPS.has(step) || (step === 'strike' && rivalLedBy(s, c.id))) {
    // The system makes the move (rivalLean favors it); a step that never comes is skipped.
    if (s.week - p.sw >= STEP_TIMEOUT) {
      if (p.ad >= 2) { dropPlan(s, M, m, 'it never came together'); return undefined; }
      p.ad++; M.stats.adapted++;
      note(`changed his approach: skipped "${STEP_TEXT[step]}"`);
      advanceStep(s, m, 'skip');
    }
    return undefined;
  }
  // A capo's step that his own moves carry (regimes.ts) also waits for them, for a while.
  if (c.rank === 'capo' && STEP_CAPO[step] && s.week - p.sw < 3) return undefined;

  const isPlayerMan = c.faction === 'player' && c.id !== s.playerId;
  switch (step) {
    case 'prove': {
      if (!isPlayerMan) { advanceStep(s, m, 'x'); return undefined; }
      const amt = Math.round((300 + r01(M) * 400) / 10) * 10;
      money(ctx, amt, `${c.firstName} brings in a little extra: he wants to be noticed`, 'kickup');
      addOpinion(s, s.playerId, c.id, 'Brought in extra on his own', 3, 1);
      addStory(s, c, 'Brought in extra money on his own, to be noticed.');
      note('brought in extra money to be noticed');
      advanceStep(s, m, 'x');
      return `${nm} brought in a little extra on his own. He wants to be noticed.`;
    }
    case 'favor': {
      if (opinion(s, c.id, s.playerId) < -20) { dropPlan(s, M, m, 'he soured on the boss'); return undefined; }
      addOpinion(s, s.playerId, c.id, 'Did you a quiet favor', 4, 1);
      addStory(s, c, 'Did the boss a quiet favor, and made sure he knew it.');
      note('did the boss a quiet favor');
      advanceStep(s, m, 'x');
      return undefined;
    }
    case 'ask': {
      addStory(s, c, 'Let it be known he wants a crew of his own.');
      if (m.amb) m.amb.p = Math.min(100, m.amb.p + 25);
      note('let it be known he wants a crew of his own', `${sureWord(m.bel[s.playerId]?.tc ?? 0.3)} the boss thinks well of him`);
      advanceStep(s, m, 'x');
      return `${nm} lets it be known he wants a crew of his own.`;
    }
    case 'befriend': {
      if (!t) { advanceStep(s, m, 'x'); return undefined; }
      addOpinion(s, t.id, c.id, 'A good friend lately', 6, 2);
      addOpinion(s, c.id, t.id, 'Getting close', 2, 2);
      note(`got close to ${displayName(t)}`, `${sureWord(m.bel[t.id]?.wc ?? 0.3)} he has money`);
      advanceStep(s, m, 'x');
      return undefined;
    }
    case 'borrow': {
      if (!t) { advanceStep(s, m, 'x'); return undefined; }
      if (opinion(s, t.id, c.id) < 0) { dropPlan(s, M, m, `${displayName(t)} doesn't trust him`); return undefined; }
      const amt = Math.min(1500, Math.floor(Math.max(0, t.wealth) * 0.3));
      if (amt < 100) {
        const again = betrayTarget(s, m, c);
        if (again && again !== t.id && p.ad < 2) { p.t = again; p.i = 0; p.sw = s.week; p.ad++; M.stats.adapted++; note(`found ${displayName(t)} had nothing; turned to ${nameOf(s, again)}`); return undefined; }
        dropPlan(s, M, m, 'nobody worth borrowing from');
        return undefined;
      }
      t.wealth -= amt;
      c.wealth += amt;
      const tm = mindOf(s, t.id);
      if (tm) remember(tm, { w: s.week, k: 'favor', who: c.id, t: `lent ${c.firstName} money`, v: 4 });
      addStory(s, t, `Lent ${displayName(c)} $${amt.toLocaleString('en-US')}.`);
      note(`borrowed $${amt.toLocaleString('en-US')} from ${displayName(t)}`);
      advanceStep(s, m, 'x');
      return undefined;
    }
    case 'welsh': {
      if (!t) { advanceStep(s, m, 'x'); return undefined; }
      // He is found out first if the mark already believes he is plotting.
      const tm = mindOf(s, t.id);
      if (tm?.facts.some((f) => f.by === c.id && (f.k === 'plot' || f.k === 'skim') && f.c >= 0.5)) {
        remember(m, { w: s.week, k: 'fear', who: t.id, t: `${t.firstName} is onto him`, v: -8 });
        dropPlan(s, M, m, `${displayName(t)} is onto him`);
        return undefined;
      }
      addOpinion(s, t.id, c.id, 'Never paid back the loan', -15, 1);
      changeMeter(s, t.id, c.id, 'grievance', 15);
      if (tm) remember(tm, { w: s.week, k: 'betrayal', who: c.id, t: `${c.firstName} never paid back the loan`, v: -25 });
      addStory(s, t, `${displayName(c)} never paid back what he borrowed.`);
      // A schemer covers himself: a story about the mark, put in a friendly ear.
      if (isSchemer(c)) startRumor(s, M, m, { k: 'skim', by: t.id, tr: false }, true);
      note(`left ${displayName(t)} holding the bag`, isSchemer(c) ? `put it about that ${t.firstName} skims, to cover himself` : undefined);
      advanceStep(s, m, 'x');
      return `${displayName(t)} says ${nm} never paid back what he borrowed.`;
    }
    case 'learn': {
      // Asking around: the belief firms up (and may settle on the wrong man).
      const f = m.facts.filter((x) => (x.k === 'killed' || x.k === 'hit') && x.c >= 0.2).sort((a, b) => b.c - a.c)[0];
      if (f) {
        believe(s, m, { k: f.k, by: f.by, on: f.on, c: 0.25, src: 'told', tr: f.tr });
        if (p.t !== f.by && s.characters[f.by]?.alive && f.by !== s.playerId) { p.t = f.by; if (m.amb?.k === 'avenge') m.amb.t = f.by; }
      }
      note(`asked around about who did it`, f ? `${sureWord(f.c)} ${factText(s, f)}` : undefined);
      advanceStep(s, m, 'x');
      return undefined;
    }
    case 'wait': {
      const believed = t ? m.bel[t.id]?.s ?? 50 : 50;
      const patience = hasTrait(c, 'Patient') ? 4 : isHothead(c) ? 0 : 2;
      if (s.week - p.sw >= patience && (believed <= 55 || s.week - p.sw >= patience + 3)) {
        note('decided the moment had come', `${sureWord(m.bel[p.t ?? '']?.sc ?? 0.3)} ${nameOf(s, p.t)} is ${believed <= 55 ? 'not so strong' : 'still strong'}`);
        advanceStep(s, m, 'x');
      }
      return undefined;
    }
    case 'strike': {
      if (!t || !isPlayerMan) { advanceStep(s, m, 'x'); return undefined; }
      const rv = s.rivals.find((x) => x.id === t.faction);
      if (rv && rv.kind === 'mob') {
        rv.muscle = Math.max(5, rv.muscle - (4 + Math.floor(r01(M) * 4)));
        addOpinion(s, rv.leaderId, s.playerId, `${c.firstName} settled a score with our people`, -12, 1);
        heat(ctx, 'local', 2, `${c.firstName} settled a private score`, 'heat');
        addStory(s, c, `Settled a score with ${rv.shortName}'s people over ${nameOf(s, t.id)}.`);
        note(`settled his score with ${rv.shortName}'s people`, `${sureWord(m.facts.find((f) => f.by === t.id)?.c ?? 0.4)} ${nameOf(s, t.id)} did it`);
        remember(m, { w: s.week, k: 'win', who: t.id, t: 'settled the score', v: 15 });
        // The grudge is spent.
        for (const x of m.mem) if (x.who === t.id && x.v < 0) x.s *= 0.3;
        advanceStep(s, m, 'x');
        if (m.amb?.k === 'avenge') m.amb = { k: hasTrait(c, 'Ambitious') ? 'capo' : 'rich', p: 0, w: s.week };
        return `${nm} settled a private score with ${rv.shortName}'s people. Nobody ordered it.`;
      }
      // He blames one of his own: it comes to blows, not to blood (that is the boss's word, never his).
      addOpinion(s, t.id, c.id, 'Came at me over a lie', -15, 1);
      addOpinion(s, c.id, t.id, 'I know what you did', -10, 1);
      addStory(s, c, `Had it out with ${displayName(t)}, sure he was behind it.`);
      note(`had it out with ${displayName(t)}`, `${sureWord(m.facts.find((f) => f.by === t.id)?.c ?? 0.4)} ${nameOf(s, t.id)} did it`);
      advanceStep(s, m, 'x');
      return `${nm} had it out with ${displayName(t)}: he is sure ${t.firstName} was behind it.`;
    }
    case 'case':
      note('cased a job');
      advanceStep(s, m, 'x');
      return undefined;
    case 'crew': {
      const mates = Object.keys(M.minds).filter((id) => id !== c.id && s.characters[id]?.alive && s.characters[id].faction === c.faction && s.characters[id].rank !== 'civilian');
      mates.sort((a, b) => (m.bel[b]?.t ?? opinion(s, c.id, b)) - (m.bel[a]?.t ?? opinion(s, c.id, a)) || a.localeCompare(b));
      if (mates[0]) p.t = mates[0];
      note(mates[0] ? `picked ${nameOf(s, mates[0])} for the job` : 'decided to go it alone', mates[0] ? `${sureWord(m.bel[mates[0]]?.tc ?? 0.3)} he can be trusted` : undefined);
      advanceStep(s, m, 'x');
      return undefined;
    }
    case 'pull': {
      const p0 = clamp(0.45 + c.attributes.intrigue / 300 - (hasTrait(c, 'Gambler') ? 0.05 : 0), 0.2, 0.85);
      if (roll(M, p0)) {
        const gain = Math.round((1000 + r01(M) * 2000) / 50) * 50;
        c.wealth += Math.round(gain * 0.7);
        const mate = p.t ? s.characters[p.t] : undefined;
        if (mate?.alive) { mate.wealth += Math.round(gain * 0.3); addOpinion(s, mate.id, c.id, 'Cut me in on a score', 5, 2); }
        if (isPlayerMan && opinion(s, c.id, s.playerId) >= 10 && !hasTrait(c, 'Greedy')) money(ctx, Math.round(gain * 0.25), `${c.firstName}'s own score: his envelope up`, 'kickup');
        if (isPlayerMan) heat(ctx, 'local', 1, `${c.firstName}'s own score`, 'heat');
        addStory(s, c, 'Pulled a score of his own.');
        remember(m, { w: s.week, k: 'win', t: 'pulled his score', v: 12 });
        note(`pulled his score ($${gain.toLocaleString('en-US')})`);
        advanceStep(s, m, 'x');
        return isPlayerMan ? `${nm} pulled a score of his own.` : undefined;
      }
      c.evidence = Math.min(100, (c.evidence ?? 0) + 6);
      remember(m, { w: s.week, k: 'loss', t: 'the score went wrong', v: -10 });
      note('pulled his score, and it went wrong');
      cool(s, m, 'score');
      m.plan = undefined;
      M.stats.failed++;
      return undefined;
    }
    case 'save':
      note('put money aside');
      advanceStep(s, m, 'x');
      return undefined;
    case 'tell':
      addStory(s, c, 'Talks about Florida. He says he is getting too old for this.');
      if (m.amb) m.amb.p = Math.max(m.amb.p, 60);
      note('told the boss he is thinking about Florida');
      advanceStep(s, m, 'x');
      return `${nm} talks about Florida: he says he is getting too old for this.`;
    default:
      advanceStep(s, m, 'x');
      return undefined;
  }
}

/** For the UI: the step he is on. */
export function planLine(s: GameState, m: Mind): string | undefined {
  const p = m.plan;
  if (!p) return undefined;
  return `${PLAN_TEXT[p.k].split(':')[0]}${p.t && p.t !== s.playerId ? ` (${nameOf(s, p.t)})` : ''}: step ${p.i + 1} of ${p.steps.length}, ${STEP_TEXT[p.steps[p.i]]}`;
}

export { worstGrudge };
