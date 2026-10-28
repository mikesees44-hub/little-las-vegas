/**
 * Playtest bots: five play styles for the long-play harness (scripts/playtest/longplay.ts).
 * Each bot answers every popup by scoring the choice's effects with its own weights,
 * and queues orders from the families it cares about. They are deliberately simple and
 * greedy — the point is to find out which style the game rewards, not to play well.
 */
import { autoDeal } from '../../src/engine/deals';
import { legalActions, previewAction } from '../../src/engine/actions';
import { polActions } from '../../src/engine/politics';
import { romanceActions } from '../../src/engine/romance';
import { datingActions } from '../../src/engine/dating';
import { racketActions } from '../../src/engine/racketLife';
import { ORDERS } from '../../src/engine/events';
import { rand } from '../../src/engine/rng';
import { usualWeek } from '../../src/engine/rounds';
import { defaultMan, jobLock, JOBS, jobSummary, targetsFor } from '../../src/engine/dirtyWork';
import type { Choice, Effect, GameState, PlayerAction, PlayerChoices } from '../../src/engine/types';
import type { LifestyleId } from '../../src/engine/lifestyle';

export type BotId = 'passive' | 'greedy' | 'violent' | 'political' | 'family';
export const BOTS: BotId[] = ['passive', 'greedy', 'violent', 'political', 'family'];

interface Weights { money: number; heat: number; respect: number; crew: number; family: number; kill: number; favor: number; influence: number }
const W: Record<BotId, Weights> = {
  passive: { money: 0, heat: -1, respect: 0, crew: 0, family: 0, kill: -5, favor: 0, influence: 0 },
  greedy: { money: 1 / 100, heat: -0.5, respect: 0.2, crew: 0.1, family: 0, kill: -2, favor: 0.5, influence: 0.5 },
  violent: { money: 1 / 400, heat: 0.3, respect: 1, crew: 0.3, family: 0, kill: 8, favor: 0, influence: 1 },
  political: { money: 1 / 300, heat: -2, respect: 0.5, crew: 0.2, family: 0.1, kill: -6, favor: 8, influence: 0.5 },
  family: { money: 1 / 400, heat: -1, respect: 0.2, crew: 0.3, family: 2, kill: -6, favor: 0.5, influence: 0.1 },
};
const LIFESTYLE: Record<BotId, LifestyleId | undefined> = { passive: undefined, greedy: 'money', violent: 'muscle', political: 'politics', family: 'family' };

export function scoreEffects(s: GameState, effs: Effect[], w: Weights): number {
  let v = 0;
  for (const e of effs) {
    switch (e.type) {
      case 'money': v += e.amount * w.money; break;
      case 'heat': v += e.amount * w.heat; break;
      case 'respect': v += e.amount * w.respect; break;
      case 'crewOpinion': v += e.amount * w.crew; break;
      case 'familyOpinion': v += e.amount * w.family; break;
      case 'kill': v += e.charId === s.playerId ? -1000 : w.kill; break;
      case 'favor': v += e.amount * w.favor; break;
      case 'influence': v += e.amount * w.influence; break;
      case 'opinion': if (e.to === s.playerId) v += e.amount * 0.05; break;
      default: break;
    }
  }
  return v;
}

/** Is a choice set a real decision (2+ legal options whose effects differ)? */
export function isMeaningful(choices: Choice[]): boolean {
  const legal = choices.filter((c) => !c.disabledReason);
  if (legal.length < 2) return false;
  const sigs = new Set(legal.map((c) => JSON.stringify(c.effects.map((e) => [e.type, (e as { amount?: number }).amount ?? 0]))));
  return sigs.size >= 2;
}

function pick<T>(h: { rng: number }, xs: T[]): T | undefined { return xs.length ? xs[Math.floor(rand(h) * xs.length)] : undefined; }

function smartJob(s: GameState, heatCap: number): PlayerAction | undefined {
  let best: { a: PlayerAction; ev: number } | undefined;
  for (const j of JOBS) {
    if (j.wrap || jobLock(s, j.id)) continue;
    if ((j.heat.local ?? 0) > 0 && s.heat.local > heatCap) continue;
    const m = defaultMan(s, j.id);
    if (!m) continue;
    const ts = targetsFor(s, j.id);
    const sum = jobSummary(s, j.id, m.c.id, ts[0]?.id);
    if (sum.lock || !sum.action || sum.cost > s.money - 5000) continue;
    const ev = (sum.odds / 100) * ((sum.take[0] + sum.take[1]) / 2) - sum.cost - sum.arrest * 40;
    if (!best || ev > best.ev) best = { a: sum.action, ev };
  }
  return best?.a;
}

export interface BotWeek { choices: PlayerChoices; legalCount: number; legalByKind: Record<string, number>; meaningfulPopups: number }

export function botChoices(s: GameState, bot: BotId, salt: number): BotWeek {
  const h = { rng: (s.rng ^ Math.imul(salt + 7, 0x9e3779b1)) >>> 0 };
  const w = W[bot];
  const choices: Record<string, string> = {};
  let meaningfulPopups = 0;
  for (const ev of s.pendingEvents) {
    const legal = ev.choices.filter((c) => !c.disabledReason);
    if (isMeaningful(ev.choices)) meaningfulPopups++;
    if (!legal.length) continue;
    if (bot === 'passive') { choices[ev.iid] = (legal.find((c) => c.id === ev.defaultChoiceId) ?? legal[0]).id; continue; }
    // Score, with a tiny noise so ties do not always break the same way; cannot afford -> skip.
    let best = legal[0]; let bv = -Infinity;
    for (const c of legal) {
      const cost = c.effects.filter((e) => e.type === 'money' && e.amount < 0).reduce((a, e) => a + (e as { amount: number }).amount, 0);
      if (-cost > s.money + 2000) continue;
      const v = scoreEffects(s, c.effects, w) + rand(h) * 0.01;
      if (v > bv) { bv = v; best = c; }
    }
    choices[ev.iid] = best.id;
  }
  const all = legalActions(s);
  const byKind: Record<string, number> = {};
  for (const a of all) byKind[a.kind] = (byKind[a.kind] ?? 0) + 1;
  const actions: PlayerAction[] = [];
  const add = (a: PlayerAction | undefined) => {
    if (!a) return;
    a = autoDeal(s, a, h);
    const p = previewAction(s, a);
    if (p.disabledReason) return;
    if (p.cost > 0 && p.cost > s.money - 3000) return;
    if (!actions.some((x) => JSON.stringify(x) === JSON.stringify(a))) actions.push(a);
  };
  const boss = s.characters[s.playerId];
  const ls = LIFESTYLE[bot];
  if (ls && boss && !boss.lifestyle) add({ kind: 'lifestyle', focus: ls });
  else if (boss?.lifestyle?.points) add(pick(h, all.filter((a) => a.kind === 'perk')));
  const order = (keys: RegExp) => {
    const os = ORDERS.filter((o) => keys.test(o.key)).map((o) => ({ kind: 'order', key: o.key, via: 'underboss' }) as PlayerAction).filter((a) => !previewAction(s, a).disabledReason);
    add(pick(h, os));
  };
  switch (bot) {
    case 'passive':
      break;
    case 'greedy': {
      // Buy whatever earns, start rackets, lend; spend down to a $5K floor.
      const econ = all.filter((a) => a.kind === 'buyBusiness' || a.kind === 'econ' || a.kind === 'lend');
      for (let k = 0; k < 2; k++) add(pick(h, econ));
      if (rand(h) < 0.3) add(pick(h, racketActions(s)));
      if (rand(h) < 0.4) order(/shakedown|collect|numbers|book|loan|skim|score/);
      if (rand(h) < 0.15) add(smartJob(s, 60));
      break;
    }
    case 'violent': {
      add(pick(h, all.filter((a) => a.kind === 'declareWar' || a.kind === 'raid')));
      if (rand(h) < 0.5) add(smartJob(s, 90));
      if (rand(h) < 0.3) add(pick(h, all.filter((a) => (a.kind === 'interact' && /whack|threaten|demand/.test(a.id)) || (a.kind === 'scheme' && /murder|heist/.test(a.scheme)))));
      if (rand(h) < 0.5) order(/.*/);
      if (rand(h) < 0.1) add(pick(h, all.filter((a) => a.kind === 'buyBusiness')));
      break;
    }
    case 'political': {
      const pol = polActions(s).filter((a) => !previewAction(s, a).disabledReason);
      for (let k = 0; k < 2; k++) add(pick(h, pol));
      if (rand(h) < 0.3) add(pick(h, all.filter((a) => (a.kind === 'interact' && /bribe|favor/.test(a.id)) || a.kind === 'lobby' || a.kind === 'askPermission' || (a.kind === 'scheme' && /envoy|befriend|sway|blackmail/.test(a.scheme)) || a.kind === 'legal')));
      if (rand(h) < 0.15) add(pick(h, all.filter((a) => a.kind === 'buyBusiness' || a.kind === 'econ')));
      break;
    }
    case 'family': {
      add(pick(h, all.filter((a) => a.kind === 'dynasty')));
      if (rand(h) < 0.4) add(pick(h, datingActions(s)));
      if (rand(h) < 0.2) add(pick(h, romanceActions(s) as PlayerAction[]));
      if (rand(h) < 0.2) add(pick(h, all.filter((a) => a.kind === 'interact' && /gift|dinner/.test(a.id))));
      if (rand(h) < 0.1) add(pick(h, all.filter((a) => a.kind === 'buyBusiness' || a.kind === 'econ')));
      break;
    }
  }
  const pc: PlayerChoices = { choices, actions };
  if (bot !== 'passive') pc.rounds = usualWeek(s);
  // Envelope: greedy/violent take a fat cut, others modest; passive takes the defaults (none).
  const t = s.tribute;
  if (t && bot !== 'passive') {
    const personal = bot === 'greedy' || bot === 'violent' ? 5000 : 2500;
    const pend = t.reports.find((r) => r.status === 'presented');
    if (s.week <= 1) pc.envelope = { split: { personal, treasury: 10000 - personal, reserve: 0 }, standing: true };
    else if (pend) pc.envelope = { report: pend.id, split: { personal, treasury: 10000 - personal, reserve: 0 }, grant: pend.petitions.filter((x) => x.amount < s.money / 10).map((x) => x.id) };
  }
  return { choices: pc, legalCount: all.length, legalByKind: byKind, meaningfulPopups };
}
