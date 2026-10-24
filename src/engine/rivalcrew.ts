import { capos, crew, displayName, hasTrait, isFree } from './characters';
import { buildOfferReported, poachScore } from './crewEvents';
import { addStory, bumpStat, outsideGuys } from './hierarchy';
import { rivalHeatHit, type Ctx } from './ledger';
import { addOpinion, getRelation, opinion } from './relations';
import { chance, randInt, weightedPick } from './rng';
import { executeMove, rivalCaps } from './rivals';
import type { Character, GameState, Rival, RivalGoal } from './types';

/**
 * Rivals go after the family's people, not just its money: they court your
 * soldiers, push onto your corners, buy your cops, make offers to your
 * capos and try to get a man inside. At least one such named move lands
 * every two to four weeks; each is written to the log and the chronicle and
 * shows on the alert rail. The choice comes from the rival's goal and its
 * memory of you (opinion and grievance).
 */

export type CrewMove = 'poach' | 'corners' | 'bribe_cop' | 'capo_deal' | 'plant';

const GOAL_W: Record<RivalGoal, Record<CrewMove, number>> = {
  conquer: { poach: 1.5, corners: 1, bribe_cop: 0.8, capo_deal: 1.5, plant: 1 },
  enrich: { poach: 1, corners: 0.4, bribe_cop: 2.5, capo_deal: 1.5, plant: 0.8 },
  revenge: { poach: 2, corners: 0.6, bribe_cop: 1, capo_deal: 1, plant: 2 },
  legitimacy: { poach: 0.8, corners: 0.2, bribe_cop: 2, capo_deal: 1, plant: 0.6 },
  survive: { poach: 1, corners: 0.2, bribe_cop: 2, capo_deal: 0.6, plant: 1 },
  squeeze: { poach: 1, corners: 1, bribe_cop: 1, capo_deal: 1, plant: 1 },
  headline: { poach: 0, corners: 0, bribe_cop: 0, capo_deal: 0, plant: 3 },
};

function poachTarget(s: GameState): Character | undefined {
  const pool = crew(s).filter((c) => isFree(s, c) && poachScore(s, c) > 20);
  return pool.sort((a, b) => poachScore(s, b) - poachScore(s, a))[0];
}

function dealTarget(s: GameState, r: Rival): Character | undefined {
  return capos(s).filter((c) => isFree(s, c) && !c.courtedBy && !hasTrait(c, 'Loyal-to-a-fault') && opinion(s, c.id, s.playerId) < 45)
    .sort((a, b) => opinion(s, a.id, s.playerId) - opinion(s, b.id, s.playerId) + (opinion(s, b.id, r.leaderId) - opinion(s, a.id, r.leaderId)) / 2)[0];
}

function copOnPad(s: GameState): Character | undefined {
  return outsideGuys(s).find((c) => c.outside === 'cop' || c.outside === 'politician');
}

function moveWeights(s: GameState, r: Rival): Record<CrewMove, number> {
  const w = { ...GOAL_W[r.goal] };
  const op = opinion(s, r.leaderId, s.playerId);
  const g = getRelation(s, r.leaderId, s.playerId)?.grievance ?? 0;
  if (op < -30 || g > 40) {
    w.plant *= 1.5;
    w.poach *= 1.5;
  }
  if (!poachTarget(s)) w.poach = 0;
  if (!dealTarget(s, r)) w.capo_deal = 0;
  if (!copOnPad(s)) w.bribe_cop = 0;
  if (s.flags[`plant_${r.id}`]) w.plant = 0;
  if (!s.districts.some((d) => (d.influence.player ?? 0) > 5)) w.corners = 0;
  if (r.money < 2000) {
    w.corners *= 0.3;
    w.bribe_cop *= 0.3;
  }
  return w;
}

function say(ctx: Ctx, r: Rival, text: string): void {
  const s = ctx.s;
  r.lastMove = { week: s.week, move: 'offer_deal', target: 'player', text };
  ctx.log.push(`[${r.shortName}] ${text}`);
  s.chronicle.push({ week: s.week, date: { ...s.date }, text, kind: 'rival' });
  s.flags.lastRivalCrewWeek = s.week;
  s.flags.lastRivalCrewText = s.nextId; // marks that the alert rail has something fresh
  bumpStat(s, 'rivalCrewMoves');
}

export function executeCrewMove(ctx: Ctx, r: Rival, m: CrewMove): boolean {
  const s = ctx.s;
  const L = s.characters[r.leaderId];
  const nm = `${L.firstName} ${L.lastName}`;
  switch (m) {
    case 'poach': {
      const c = poachTarget(s);
      if (!c) return false;
      c.courtedBy = { rival: r.id, week: s.week };
      const why = c.debtTo?.rival === r.id ? 'offering to forget what he owes' : c.goal === 'become_capo' ? 'promising him a crew of his own' : c.policy === 'squeeze' ? 'telling him he would keep what he earns' : opinion(s, c.id, s.playerId) < 0 ? 'telling him the boss does not respect him' : 'buying every round';
      addOpinion(s, c.id, r.leaderId, 'They treat me with respect', 10, 2);
      addStory(s, c, `${r.name} started courting him.`);
      say(ctx, r, `${r.shortName}'s people are courting ${displayName(c)} at the Anchor Bar, ${why}.`);
      return true;
    }
    case 'corners': {
      const before = s.chronicle.length;
      executeMove(ctx, r, { move: 'expand', target: 'player', score: 1 });
      if (s.chronicle.length === before) return false;
      s.flags.lastRivalCrewWeek = s.week;
      bumpStat(s, 'rivalCrewMoves');
      return true;
    }
    case 'bribe_cop': {
      const c = copOnPad(s);
      if (!c) return false;
      r.money -= 1500;
      c.faction = r.id;
      c.capoId = undefined;
      rivalHeatHit(ctx, 'local', 3, `${c.office ?? 'Your man'} ${c.lastName} now takes ${r.shortName}'s envelope`, rivalCaps(s).heatPerBar);
      addStory(s, c, `Went over to ${r.name}'s pad.`);
      say(ctx, r, `${nm} got to ${c.office ? `${c.office} ` : ''}${displayName(c)}: he takes ${r.shortName}'s envelope now, not yours.`);
      return true;
    }
    case 'capo_deal': {
      const c = dealTarget(s, r);
      if (!c) return false;
      c.courtedBy = { rival: r.id, week: s.week };
      addOpinion(s, c.id, r.leaderId, 'Made me a generous offer', 8, 2);
      const loyal = opinion(s, c.id, s.playerId) >= 25;
      if (loyal) {
        s.eventQueue.push(buildOfferReported(s, c, r.id));
        say(ctx, r, `${nm} made ${displayName(c)} an offer to bring his crew over.`);
      } else {
        addStory(s, c, `Had lunch with ${nm}'s consigliere at the Diamond Beach Club. He did not mention it.`);
        say(ctx, r, `${displayName(c)} was seen having lunch with ${nm}'s consigliere at the Diamond Beach Club.`);
      }
      return true;
    }
    case 'plant': {
      s.flags[`plant_${r.id}`] = s.week;
      say(ctx, r, r.kind === 'law' ? 'Word from the courthouse: the FBI wants a man inside your crew.' : `Word on the docks: ${nm} wants a man inside your crew. Watch who you bring in.`);
      return true;
    }
  }
}

/**
 * Weekly. A rival makes a move on your people when one is due (every 2–4
 * weeks), and occasionally in between.
 */
export function rivalCrewWeek(ctx: Ctx): void {
  const s = ctx.s;
  if (s.week < 2) return;
  const last = s.flags.lastRivalCrewWeek ?? 0;
  const gap = s.flags.rivalCrewGap || 3;
  const due = s.week - last >= gap;
  if (!due && !chance(s, 0.1)) return;
  const rs = s.rivals.filter((r) => (r.kind === 'mob' || r.kind === 'law') && s.characters[r.leaderId]?.alive);
  const scored = rs.map((r) => {
    const w = moveWeights(s, r);
    const total = Object.values(w).reduce((a, b) => a + b, 0);
    const heatOn = 1 + Math.max(0, -opinion(s, r.leaderId, s.playerId)) / 40 + (getRelation(s, r.leaderId, s.playerId)?.grievance ?? 0) / 60;
    return { r, w, score: total * heatOn * (r.kind === 'law' ? 0.25 : 1) };
  });
  for (let i = 0; i < 3; i++) {
    const pickR = weightedPick(s, scored, (x) => x.score);
    if (!pickR) return;
    const moves = (Object.keys(pickR.w) as CrewMove[]).filter((m) => pickR.w[m] > 0);
    const m = weightedPick(s, moves, (x) => pickR.w[x]);
    if (m && executeCrewMove(ctx, pickR.r, m)) {
      s.flags.rivalCrewGap = randInt(s, 2, 4);
      return;
    }
  }
}

/** Plants: the next man brought in may be working for someone else. */
export function maybePlant(s: GameState, c: Character): void {
  if (c.dynasty || c.informantFor) return;
  for (const r of s.rivals) {
    const since = s.flags[`plant_${r.id}`];
    if (since && s.week - since <= 20 && chance(s, 0.5)) {
      c.informantFor = r.id;
      s.flags[`plant_${r.id}`] = 0;
      return;
    }
  }
  if (chance(s, 0.025)) c.informantFor = 'law';
}
