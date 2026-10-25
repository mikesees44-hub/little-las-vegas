import { ageOn } from './calendar';
import { capos, crew, displayName, isFree, player } from './characters';
import { addSuccess, attr } from './attrs';
import { killCharacter } from './dynasty';
import { challengePressure } from './heir';
import { depose } from './station';
import { activeBlitz } from './blitz';
import { addStory } from './hierarchy';
import { respect, type Ctx } from './ledger';
import { addOpinion, opinion } from './relations';
import { defectTo } from './regimes';
import { chance, pick } from './rng';
import { pw, type Crisis, type CrisisCause, type CrisisMeters, type CrisisMove } from './powerState';
import { FACTION_NAMES } from './world';
import type { Effect, EventInstance, FactionId, GameState } from './types';

/**
 * SUDDEN SUCCESSION and the CRISIS PHASE (design item 14).
 *
 * The moment the boss is killed, jailed, incapacitated, disappears, flips or
 * is removed, play stops: the heir takes over with incomplete information
 * (who did it, who is loyal, whether another hit is coming). The crisis
 * plays out in 3-6 beats, one choice each — stabilize, ceasefire/mediation,
 * disengage, escalate, ask the Table for recognition, secure the family,
 * hunt the leak — tracked as cohesion, survival, treasury, escalation and
 * loyalty. The heir can die in the same wave. It always ends with a valid
 * boss in the chair, or with the house extinct.
 */

export const MOVE_INFO: Record<CrisisMove, { name: string; text: string; d: Partial<CrisisMeters>; cost: number }> = {
  stabilize: { name: 'Stabilize', text: 'Sit with every capo. Pay the widows. Keep the envelopes moving.', d: { cohesion: 15, loyalty: 10, escalation: -5 }, cost: 2000 },
  ceasefire: { name: 'Emergency ceasefire', text: 'A go-between, a neutral diner, a promise nobody believes.', d: { escalation: -20, survival: 10, cohesion: -5 }, cost: 2500 },
  disengage: { name: 'Disengage', text: 'Pull the men off the street. Give ground to live.', d: { survival: 15, escalation: -10, loyalty: -10, cohesion: -5 }, cost: 0 },
  escalate: { name: 'Escalate', text: 'Hit back now, harder than they hit you.', d: { escalation: 20, loyalty: 10, survival: -10 }, cost: 1500 },
  table: { name: 'Ask the Table for recognition', text: 'Philadelphia\'s blessing makes you boss in fact as well as in name.', d: { cohesion: 15, escalation: -10, loyalty: 5 }, cost: 3000 },
  secure: { name: 'Secure the family', text: 'Wife and children to the shore house, men on the doors.', d: { survival: 20, cohesion: 5 }, cost: 1500 },
  hunt: { name: 'Hunt the leak', text: 'Somebody told them where he would be. Find out who.', d: { loyalty: 5, cohesion: -5 }, cost: 500 },
};
export const CRISIS_MOVES = Object.keys(MOVE_INFO) as CrisisMove[];

export const CAUSE_TEXT: Record<CrisisCause, string> = {
  killed: 'was killed', jailed: 'is in jail', incapacitated: 'cannot run the family', disappeared: 'has disappeared', flipped: 'has gone over to the other side', removed: 'was removed', blitz: 'fell in a blitz',
};

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

/** Start a crisis for the new heir (or the acting boss). */
export function startCrisis(ctx: Ctx, cause: CrisisCause, fallenId: string, killer: FactionId): Crisis {
  const s = ctx.s;
  const p = pw(s);
  const heir = player(s);
  const men = crew(s).filter((c) => isFree(s, c));
  const avgOp = men.length ? men.reduce((a, c) => a + opinion(s, c.id, heir.id), 0) / men.length : 0;
  const caps = capos(s);
  const capOp = caps.length ? caps.reduce((a, c) => a + opinion(s, c.id, heir.id), 0) / caps.length : avgOp;
  const blitz = activeBlitz(s, undefined, 'player');
  const leak = crew(s).find((c) => c.informantFor && c.informantFor !== 'law') ?? (killer !== 'none' && killer !== 'player' ? men.find((c) => opinion(s, c.id, heir.id) < -20) : undefined);
  const beats = Math.min(6, 3 + (cause === 'killed' || cause === 'blitz' ? 1 : 0) + (blitz ? 1 : 0) + (ageOn(heir.birth, s.date) < 25 ? 1 : 0));
  const c: Crisis = {
    id: `cr${s.nextId++}`, cause, fallenId, heirId: heir.id, since: s.week, beat: 0, beats, wave: 1,
    meters: {
      cohesion: clamp(50 + avgOp / 2),
      survival: clamp(blitz ? 45 : 65),
      escalation: clamp(blitz ? 55 : killer !== 'none' && killer !== 'player' ? 35 : 15),
      loyalty: clamp(50 + capOp / 2),
    },
    money0: s.money,
    known: { killer: cause === 'jailed' ? 'law' : 'unknown', loyalty: Object.fromEntries(caps.map((k) => [k.id, '?'])) },
    truth: { killer, nextHit: !!blitz, leakId: leak?.id },
    log: [{ week: s.week, text: `${displayName(s.characters[fallenId])} ${CAUSE_TEXT[cause]}. ${displayName(heir)} is in charge.` }],
    moves: [],
  };
  p.crisis = c;
  p.stats.crises++;
  const fallen = s.characters[fallenId];
  s.cutscenes.push(cause === 'killed' || cause === 'blitz'
    ? { key: 'boss_death', title: 'The chair is empty', text: `${fallen ? displayName(fallen) : 'The boss'} ${CAUSE_TEXT[cause]}. ${heir.firstName} has the chair, and no idea who is next.`, week: s.week }
    : { key: 'betrayal_confrontation', title: 'A family without a head', text: `${fallen ? displayName(fallen) : 'The boss'} ${CAUSE_TEXT[cause]}. Every phone in Wildwood is ringing.`, week: s.week });
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: `A succession crisis: ${c.log[0].text}`, kind: 'succession' });
  ctx.log.push(`Crisis: ${c.log[0].text} ${beats} hard weeks ahead.`);
  return c;
}

function fog(s: GameState, c: Crisis): string {
  const who = c.known.killer === 'unknown' ? 'Who did it: nobody knows yet.' : c.known.killer ? `Who did it: ${FACTION_NAMES[c.known.killer] ?? c.known.killer}.` : '';
  const next = c.known.nextHit === undefined ? 'Is another hit coming? Nobody can say.' : c.known.nextHit ? 'Another hit IS coming.' : 'The shooting seems to be over.';
  const leak = c.known.leakId ? `The leak: ${displayName(s.characters[c.known.leakId])}.` : '';
  return [who, next, leak].filter(Boolean).join(' ');
}

/** The beat in front of the heir this week. */
export function buildCrisisBeat(s: GameState, c: Crisis): EventInstance {
  const heir = player(s);
  const m = c.meters;
  const label = `Crisis, beat ${c.beat + 1} of ${c.beats}`;
  const blitz = activeBlitz(s, undefined, 'player');
  const choices = CRISIS_MOVES.map((mv) => {
    const info = MOVE_INFO[mv];
    const effects: Effect[] = [];
    if (info.cost) effects.push({ type: 'money', amount: -info.cost, label });
    const meters = Object.entries(info.d).map(([k, v]) => `${k[0].toUpperCase()}${k.slice(1)} ${(v as number) > 0 ? '+' : '−'}${Math.abs(v as number)}`).join(' · ') + (mv === 'hunt' ? ' · learn who did it' : '');
    effects.push({ type: 'power', op: { op: 'crisis', move: mv }, label: meters });
    if (mv === 'escalate') effects.push({ type: 'heat', bar: 'local', amount: 4, label });
    if (mv === 'disengage') effects.push({ type: 'respect', amount: -3, label });
    if (mv === 'table') effects.push({ type: 'heat', bar: 'family', amount: -3, label });
    const tooPoor = info.cost > 0 && s.money < info.cost ? `Needs $${info.cost.toLocaleString('en-US')}` : undefined;
    return { id: mv, label: info.name, detail: info.text, because: `chose to ${info.name.toLowerCase()} in the crisis`, effects, disabledReason: tooPoor };
  });
  return {
    iid: `ev${s.nextId++}`, defId: 'power_crisis', week: s.week, mandatory: true, priority: 99,
    title: `${label}: ${heir.firstName} in the chair`,
    text: `${fog(s, c)}${blitz ? ` The blitz is still running: ${blitz.targets.length - blitz.idx} names left on their list.` : ''} Cohesion ${m.cohesion} · Survival ${m.survival} · Escalation ${m.escalation} · Loyalty ${m.loyalty} · Treasury ${s.money >= c.money0 ? 'holding' : `down $${(c.money0 - s.money).toLocaleString('en-US')}`}.`,
    defaultChoiceId: 'stabilize', meta: { crisis: c.id }, actors: [heir.id],
    choices,
  };
}

/** Apply the heir's move for this beat; roll the consequences; maybe end the crisis. */
export function crisisMove(ctx: Ctx, move: CrisisMove): void {
  const s = ctx.s;
  const p = pw(s);
  const c = p.crisis;
  if (!c) return;
  const info = MOVE_INFO[move];
  for (const [k, v] of Object.entries(info.d)) c.meters[k as keyof CrisisMeters] = clamp(c.meters[k as keyof CrisisMeters] + (v as number));
  c.moves.push(move);
  c.beat++;
  const heir = player(s);
  const blitz = activeBlitz(s, undefined, 'player');
  let text = `${info.name}.`;
  if (move === 'hunt') {
    c.known.killer = c.truth.killer;
    c.known.nextHit = c.truth.nextHit;
    const finder = attr(s, heir, 'awareness') + (s.council?.consigliere?.holderId ? 15 : 0);
    if (c.truth.leakId && chance(p, Math.min(0.9, finder / 100))) {
      c.known.leakId = c.truth.leakId;
      const leak = s.characters[c.truth.leakId];
      text += ` The leak was ${leak ? displayName(leak) : 'a man in the crew'}.`;
      if (leak?.alive) {
        killCharacter(ctx, leak.id, 'killed as the leak behind the boss\'s death', 'player');
        c.meters.loyalty = clamp(c.meters.loyalty + 15);
        c.meters.cohesion = clamp(c.meters.cohesion + 5);
      }
    } else text += ' Whoever talked is still talking.';
    for (const k of capos(s)) c.known.loyalty[k.id] = opinion(s, k.id, heir.id) >= 0 ? 'loyal' : 'wavering';
  }
  if (move === 'table') {
    const philly = s.rivals.find((r) => r.id === 'philly');
    const op = philly ? opinion(s, philly.leaderId, heir.id) : 0;
    if (op >= -10) {
      c.meters.cohesion = clamp(c.meters.cohesion + 10);
      text += ' Philadelphia recognizes the new boss.';
      if (philly) addOpinion(s, philly.leaderId, heir.id, 'Came to us first', 10, 1);
      if (blitz && chance(p, 0.5)) { blitz.stopped = 'The Table ordered a ceasefire.'; c.truth.nextHit = false; text += ' The Table orders the shooting stopped.'; }
    } else text += ' Philadelphia takes the envelope and promises nothing.';
  }
  if (blitz) {
    if (move === 'ceasefire' && chance(p, 0.45)) { blitz.stopped = 'A go-between got a ceasefire.'; c.truth.nextHit = false; }
    else if (move === 'escalate') blitz.momentum -= 15;
    else if (move === 'secure') blitz.shield = s.week + 1;
    else if (move === 'disengage') blitz.momentum -= 10;
  }
  // Treasury track: the crisis costs money; a broke family frays.
  if (s.money < 0) c.meters.cohesion = clamp(c.meters.cohesion - 5);
  // Consequences of weak meters.
  if (c.meters.loyalty < 30) {
    const w = capos(s).filter((k) => opinion(s, k.id, heir.id) < 0 && !k.dynasty).sort((a, b) => opinion(s, a.id, heir.id) - opinion(s, b.id, heir.id))[0];
    if (w && chance(p, (30 - c.meters.loyalty) / 60)) {
      const r = c.truth.killer !== 'none' && c.truth.killer !== 'player' && c.truth.killer !== 'law' ? (c.truth.killer as Exclude<FactionId, 'player' | 'none' | 'law'>) : undefined;
      defectTo(ctx, w, r && s.rivals.some((x) => x.id === r && x.kind === 'mob') ? r : undefined, 'desert');
      text += ` ${w.firstName} ${w.lastName} walked out.`;
    }
  }
  c.log.push({ week: s.week, text });
  // The heir can die in the same wave.
  if (c.truth.nextHit && !blitz?.stopped && c.meters.survival < 45 && chance(p, (45 - c.meters.survival) / 120)) {
    const old = heir;
    killCharacter(ctx, old.id, 'killed in the same wave, days after taking the chair', c.truth.killer);
    if (s.gameOver) {
      endCrisis(ctx, 'The house is extinct.');
      return;
    }
    c.wave++;
    c.heirId = s.playerId;
    c.meters.cohesion = clamp(c.meters.cohesion - 15);
    c.meters.survival = clamp(c.meters.survival + 10);
    c.beats = Math.min(6, Math.max(c.beats, c.beat + 2));
    c.log.push({ week: s.week, text: `${displayName(old)} was killed too. ${displayName(player(s))} takes the chair (wave ${c.wave}).` });
    s.cutscenes.push({ key: 'succession', title: 'Again', text: `${displayName(old)} is dead too. ${displayName(player(s))} is the third man in the chair this month.`, week: s.week });
    p.lastBossId = s.playerId;
  }
  if (c.beat >= c.beats) resolveCrisis(ctx);
}

/** The crisis is over: how it ended shapes the new reign. */
export function resolveCrisis(ctx: Ctx): void {
  const s = ctx.s;
  const p = pw(s);
  const c = p.crisis;
  if (!c) return;
  const heir = player(s);
  const m = c.meters;
  const score = m.cohesion + m.loyalty + m.survival / 2 - m.escalation / 2;
  if (score >= 100) {
    respect(ctx, 6, `${heir.firstName} held the family together`, 'event');
    for (const k of crew(s)) addOpinion(s, k.id, heir.id, 'Held us together in the crisis', 10, 1);
    addSuccess(s, heir, `Held the family together after the old boss ${CAUSE_TEXT[c.cause]}`);
    s.cutscenes.push({ key: 'heir_rises', title: 'The heir', text: `${displayName(heir)} walked into the social club and every man stood up.`, week: s.week });
    endCrisis(ctx, `${displayName(heir)} held the family together.`);
  } else if (score >= 60) {
    respect(ctx, -2, 'A shaky start for the new boss', 'event');
    endCrisis(ctx, `${displayName(heir)} kept the chair, barely.`);
  } else {
    respect(ctx, -6, 'The family came out of the crisis divided', 'event');
    for (const k of capos(s)) addOpinion(s, k.id, heir.id, 'Lost control in the crisis', -10, 1);
    // A strong capo may simply take the family from a heir who lost it.
    const rival = capos(s).filter((k) => !k.dynasty && isFree(s, k)).map((k) => ({ k, pr: challengePressure(s, k).score })).sort((a, b) => b.pr - a.pr)[0];
    if (rival && rival.pr >= 35 && chance(p, 0.5)) {
      endCrisis(ctx, `${displayName(heir)} lost the family to ${displayName(rival.k)}.`);
      depose(ctx, rival.k.id, 'the crisis broke the family');
      return;
    }
    endCrisis(ctx, `${displayName(heir)} kept the chair, but the family is divided.`);
  }
}

function endCrisis(ctx: Ctx, text: string): void {
  const s = ctx.s;
  const p = pw(s);
  const c = p.crisis;
  if (!c) return;
  p.crises.push({ week: s.week, text: `${text} (${c.moves.length} beats; cohesion ${c.meters.cohesion}, survival ${c.meters.survival}, escalation ${c.meters.escalation}, loyalty ${c.meters.loyalty})` });
  if (p.crises.length > 10) p.crises = p.crises.slice(-10);
  p.crisis = undefined;
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: `The crisis is over. ${text}`, kind: 'succession' });
  ctx.log.push(`The crisis is over. ${text}`);
  const heir = s.characters[s.playerId];
  if (heir?.alive) addStory(s, heir, text);
}

/** A random-but-plausible heir move, for the headless player. */
export function anyMove(h: { rng: number }): CrisisMove {
  return pick(h, CRISIS_MOVES);
}
