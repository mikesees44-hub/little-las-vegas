import { isInSeason } from './calendar';
import { displayName } from './characters';
import { heat, money, respect, type Ctx } from './ledger';
import { opinion } from './relations';
import type { ActionPreview } from './actions';
import type { EventInstance, GameState, RivalId, UnderbellyOp, UnderbellyState } from './types';
import { playerMuscle } from './war';

/**
 * The Underbelly: an out-of-town outfit that moves onto the island and preys
 * on people — runaways, workers without papers, anyone in debt to it. It is
 * a villain and nothing else: the player can never run what it runs, only
 * find out about it, expose it, run it off, or make common cause with a rival
 * against it. Nothing it does is shown in detail.
 *
 * While it is on the island it scares off summer trade, brings the police
 * down on everyone and makes people ask why the man who runs the island lets
 * it happen. Every one of those costs is a named ledger line.
 */
export const UB_NAME = 'the Harbor Crew';
export const UB_BOSS = 'Victor Krall';
export const INVESTIGATE_COST = 1500;
export const RUNOUT_COST = 3000;
export const ALLY_COST = 2000;
export const EXPOSE_AT = 60;

export function underbellyOf(s: GameState): UnderbellyState {
  if (!s.underbelly) {
    // Arrives in the town's second or third season; seeded from the game.
    const h = [...s.seed].reduce((a, c) => a + c.charCodeAt(0), 0);
    s.underbelly = { stage: 'waiting', strength: 0, exposure: 0, districts: [], since: s.week, arrives: 40 + (h % 40) };
  }
  return s.underbelly;
}

function arrival(s: GameState): EventInstance {
  const label = UB_NAME;
  return {
    iid: `ev${s.nextId++}`, defId: 'underbelly_arrives', week: s.week, mandatory: true, priority: 80,
    title: 'Strangers on the docks',
    text: `A crew out of the Camden waterfront has taken rooms over a bar on the Bay Docks. Their man is called ${UB_BOSS}. They move people the way other outfits move cigarettes — runaways, workers with no papers, anyone who owes them — and they keep them with debt and fear. It isn't your racket and it never will be. The question is what you do about it.`,
    defaultChoiceId: 'look',
    choices: [
      { id: 'look', label: 'Find out who they are', detail: 'Start a file. $500 to the right bartenders.', because: `started a file on ${UB_NAME}`, effects: [{ type: 'money', amount: -500, label }, { type: 'underbelly', op: 'exposure', amount: 12, label }] },
      { id: 'warn', label: 'Send word: not on my island', detail: 'Respect, and a target on your back.', because: `told ${UB_NAME} they were not welcome`, effects: [{ type: 'respect', amount: 3, label }, { type: 'underbelly', op: 'strength', amount: -5, label }] },
      { id: 'ignore', label: 'Not our business', detail: 'People will remember who looked away.', because: `looked away from ${UB_NAME}`, effects: [{ type: 'respect', amount: -3, label }] },
    ],
  };
}

/** Weekly: arrival, spread, its costs to you, and the end. */
export function underbellyWeek(ctx: Ctx): void {
  const s = ctx.s;
  const u = underbellyOf(s);
  if (u.stage === 'waiting') {
    if (s.week >= u.arrives) {
      u.stage = 'active';
      u.since = s.week;
      u.strength = 30;
      u.districts = ['docks'];
      s.eventQueue.push(arrival(s));
      s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${UB_NAME[0].toUpperCase()}${UB_NAME.slice(1)} set up on the Bay Docks.`, kind: 'rival' });
    }
    return;
  }
  if (u.stage !== 'active' && u.stage !== 'entrenched') return;
  // It grows unless someone stops it.
  let grow = 0.5 + (isInSeason(s.date) ? 0.3 : 0);
  if (u.ally) grow -= 1.5;
  u.strength = Math.max(0, Math.min(100, u.strength + grow));
  if (u.strength >= 45 && u.districts.length < 2) u.districts.push('causeway');
  if (u.strength >= 65 && u.districts.length < 3) u.districts.push('boardwalk');
  if (u.strength >= 100 && u.stage === 'active') {
    u.stage = 'entrenched';
    heat(ctx, 'family', 12, `${UB_BOSS} is entrenched: Philadelphia asks what you were doing`, 'heat');
    s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${UB_NAME} dug in on the island while the house watched.`, kind: 'rival' });
  }
  // What it costs you.
  const per = isInSeason(s.date) ? 25 : 8;
  money(ctx, -per * u.districts.length, `The Underbelly: trade scared off (${u.districts.length} district${u.districts.length > 1 ? 's' : ''})`, 'cost');
  if (s.week % 3 === 0) heat(ctx, 'local', 1, 'The Underbelly: cops crack down on everyone', 'heat');
  if (s.week % 6 === 0) respect(ctx, -1, 'The Underbelly: people ask why you let it happen', 'drift');
  if (u.stage === 'entrenched' && s.week % 12 === 0) heat(ctx, 'federal', 3, 'The Underbelly: federal task force on the island', 'heat');
  if (u.strength <= 0) finish(ctx, u.outcome ?? 'collapsed');
}

function finish(ctx: Ctx, how: string): void {
  const s = ctx.s;
  const u = underbellyOf(s);
  u.stage = 'gone';
  u.strength = 0;
  u.districts = [];
  u.outcome = how;
  respect(ctx, 8, `The Underbelly is gone (${how})`, 'event');
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${UB_NAME[0].toUpperCase()}${UB_NAME.slice(1)} left the island: ${how}.`, kind: 'rival' });
  if (s.cutscenes.length < 3) s.cutscenes.push({ key: 'sitdown', title: 'Gone', text: `The rooms over the dock bar are empty. ${UB_BOSS} took the early bus to Camden and didn't buy a return.`, week: s.week });
}

/** Applies an underbelly effect. */
export function applyUnderbelly(ctx: Ctx, op: string, amount = 0, rival?: RivalId): void {
  const s = ctx.s;
  const u = underbellyOf(s);
  switch (op) {
    case 'strength':
      u.strength = Math.max(0, Math.min(100, u.strength + amount));
      if (u.strength <= 0 && (u.stage === 'active' || u.stage === 'entrenched')) finish(ctx, 'run out');
      break;
    case 'exposure':
      u.exposure = Math.max(0, Math.min(100, u.exposure + amount));
      break;
    case 'ally':
      u.ally = rival;
      break;
    case 'expose':
      u.outcome = 'exposed in the papers and raided by the state police';
      u.exposure = 0;
      s.news.push({ week: s.week, date: { ...s.date }, paper: 'Wildwood Leader', headline: 'STATE POLICE RAID DOCKS RING; DOZENS FREED', body: `Acting on information from "a concerned businessman," troopers broke up a ring run out of rooms above a Bay Docks bar. ${UB_BOSS} is wanted for questioning.`, kind: 'expose' });
      applyUnderbelly(ctx, 'strength', -60);
      break;
    case 'runout':
      u.outcome = 'run off the island';
      applyUnderbelly(ctx, 'strength', -amount);
      break;
  }
}

/** The four things the boss can do about it, as orders. */
export function previewUnderbelly(s: GameState, op: UnderbellyOp, rival?: RivalId): ActionPreview {
  const u = s.underbelly;
  const on = !!u && (u.stage === 'active' || u.stage === 'entrenched');
  const off = !on ? 'Nothing like that on the island' : undefined;
  const label = `The Underbelly: ${op === 'investigate' ? 'digging' : op === 'expose' ? 'the file goes out' : op === 'runout' ? 'running them off' : 'common cause'}`;
  switch (op) {
    case 'investigate': {
      const cons = Object.values(s.characters).find((c) => c.alive && c.rank === 'consigliere' && c.faction === 'player');
      const gain = Math.round(10 + (cons ? cons.attributes.intrigue / 6 : 4));
      return {
        title: `Dig into ${UB_NAME}`, detail: `Bartenders, desk clerks, a cab dispatcher. ${cons ? `${displayName(cons)} runs it.` : 'You need a consigliere to do it well.'}`,
        effects: [{ type: 'money', amount: -INVESTIGATE_COST, label }, { type: 'underbelly', op: 'exposure', amount: gain, label }],
        cost: INVESTIGATE_COST, because: `dug into ${UB_NAME}`, category: 'event',
        disabledReason: off ?? ((u!.exposure >= 100) ? 'You know all there is' : s.money < INVESTIGATE_COST ? 'Needs $1,500' : undefined),
      };
    }
    case 'expose':
      return {
        title: 'Hand the file to the state police and the Leader',
        detail: 'A clean way to end it: names, addresses, the rooms over the bar. The cops get the credit; you get the town\'s thanks — and a little attention.',
        effects: [{ type: 'underbelly', op: 'expose', label }, { type: 'heat', bar: 'local', amount: 4, label }, { type: 'respect', amount: 4, label }],
        cost: 0, because: `exposed ${UB_NAME}`, category: 'event',
        disabledReason: off ?? (u!.exposure < EXPOSE_AT ? `You can't prove enough yet (${Math.round(u!.exposure)}/${EXPOSE_AT})` : undefined),
      };
    case 'runout': {
      const mine = playerMuscle(s);
      const reasons = [
        { label: 'Your muscle', value: Math.round(mine / 2) },
        { label: 'How dug-in they are', value: -Math.round(u?.strength ?? 0) / 2 },
        ...(u?.ally ? [{ label: 'Your allies help', value: 15 }] : []),
        ...(u && u.exposure >= 30 ? [{ label: 'You know where they sleep', value: 10 }] : []),
      ];
      const sum = 40 + reasons.reduce((a, r) => a + r.value, 0);
      return {
        title: `Run ${UB_NAME} off the island`, detail: 'Men at the door of every room they rent. Nobody gets hurt who doesn\'t start it.',
        effects: [{ type: 'money', amount: -RUNOUT_COST, label }, { type: 'underbelly', op: 'runout', amount: 45, label }, { type: 'heat', bar: 'local', amount: 5, label }],
        refuseEffects: [{ type: 'money', amount: -RUNOUT_COST, label: `${label}: it went wrong` }, { type: 'respect', amount: -3, label: `${label}: it went wrong` }, { type: 'underbelly', op: 'strength', amount: 5, label: `${label}: it went wrong` }],
        acceptance: { chance: Math.max(0.1, Math.min(0.9, sum / 100)), reasons: [{ label: 'Base', value: 40 }, ...reasons] },
        cost: RUNOUT_COST, because: `ran ${UB_NAME} off the docks`, category: 'event',
        disabledReason: off ?? (s.money < RUNOUT_COST ? 'Needs $3,000' : undefined),
      };
    }
    case 'ally': {
      const r = s.rivals.find((x) => x.id === rival);
      const op2 = r ? opinion(s, r.leaderId, s.playerId) : 0;
      const reasons = [
        { label: 'Their opinion of you', value: Math.round(op2 / 2) },
        { label: 'It hurts them too', value: 15 },
        ...(r?.war ? [{ label: 'You are at war', value: -60 }] : []),
      ];
      const sum = 35 + reasons.reduce((a, x) => a + x.value, 0);
      return {
        title: `Make common cause with ${r?.shortName ?? '?'} against ${UB_NAME}`,
        detail: 'For once everybody on the island wants the same thing.',
        effects: r ? [{ type: 'money', amount: -ALLY_COST, label }, { type: 'underbelly', op: 'ally', rival: r.id, label }, { type: 'opinion', from: r.leaderId, to: s.playerId, amount: 10, reason: 'Stood with us against the Harbor Crew', decay: 1, label }] : [],
        refuseEffects: [{ type: 'money', amount: -Math.round(ALLY_COST / 4), label: `${label}: refused` }],
        acceptance: { chance: Math.max(0.05, Math.min(0.95, sum / 100)), reasons: [{ label: 'Base', value: 35 }, ...reasons] },
        cost: ALLY_COST, because: `made common cause with ${r?.shortName ?? 'a rival'} against ${UB_NAME}`, category: 'event',
        disabledReason: off ?? (!r || r.kind !== 'mob' ? 'Pick a rival outfit' : u!.ally ? 'You already have an ally in this' : s.money < ALLY_COST ? 'Needs $2,000' : undefined),
      };
    }
  }
}

export function allyBonus(s: GameState): number {
  return s.underbelly?.ally ? 1.5 : 0;
}

/** For tests and the sim: rough odds of running them off now. */
export function runoutOdds(s: GameState): number {
  return previewUnderbelly(s, 'runout').acceptance?.chance ?? 0;
}
