import { successionBar } from './aging';
import { ageOn } from './calendar';
import { capos, crew, displayName, hasTrait, isFree, player } from './characters';
import { ALL_ATTRS, ATTR_LABEL, POSTS, addSuccess, growthMonth, trackedPeople, viewAttrs } from './attrs';
import { activeBlitz, blitzDisabled, blitzOdds, blitzStep, buildBlitzCutIn, defenseCosts, informantWarnings, launchBlitz, MAX_PREP, PREP_INFO, rivalBlitzMonth, BODYGUARD_WEEKLY } from './blitz';
import { buildCrisisBeat, crisisMove, MOVE_INFO, startCrisis } from './crisis';
import { holder } from './council';
import { applyEffects } from './effects';
import { buildFinding, audienceWeek, investigateOdds } from './audience';
import { buildFrontDiscovered, buildHandBack, buildPrisonOrder, endFront, frontDisabled, frontMonth, FRONT_INFO, installFront, pickActing } from './front';
import { detectVacancies, grievancesMonth, passedOver, postLabel, wantersFor } from './grievances';
import { ambitionOf, ambitionsMonth, buildHeirMove, challengePressure, DESIGNATION_INFO, GROOM_PATHS, groomingMonth, successionCandidates, WANT_TEXT } from './heir';
import { addStory } from './hierarchy';
import type { ActionPreview } from './actions';
import type { Acceptance } from './interactions';
import { respect, type Ctx } from './ledger';
import { bossInside } from './longgame';
import { addOpinion, changeMeter, opinion } from './relations';
import { chance } from './rng';
import { pw, type PowerAction, type PowerOp } from './powerState';
import { inTheRanks } from './rankView';
import { applyLowOp, commitLow, describeLowOp, previewLow } from './valente';
import { climb, climbDisabled, climbOdds, chooseStation, depose, STATION_INFO, stationMonth, stationWeek, takeover, takeoverOdds } from './station';
import { FACTION_NAMES } from './world';
import { shadowWeek } from './shadow';
import { applyShadowOp, commitShadow, describeShadowOp, previewShadow, shadowActions } from './shadowOps';
import './shadowStories';
import { monthKey } from './calendar';
import type { Character, Effect, EventInstance, GameState, PlayerAction, RivalId } from './types';

/**
 * The POWER pillar's hub: the weekly/monthly ticks, the effect ops (shown as
 * named chips), and the orders (with acceptance odds and reasons).
 *
 *   attrs.ts       expanded attributes, growth, protégés, the success record
 *   heir.ts        the heir paradox, hidden ambitions, public vs secret heir
 *   grievances.ts  the passed-over system
 *   crisis.ts      sudden succession and the crisis phase
 *   blitz.ts       blitzes, the mattresses, the balance of power
 *   front.ts       the puppet boss and the two centers of power in prison
 *   audience.ts    the audience chamber (petitioners who may lie)
 *   station.ts     fall and rise; starting at any rung
 */

function queue(s: GameState, ev: EventInstance | undefined): void {
  if (!ev) return;
  if (s.eventQueue.some((e) => e.defId === ev.defId && (e.meta?.who ?? '') === (ev.meta?.who ?? ''))) return;
  s.eventQueue.push(ev);
}

/** The last thing in the week (after the monthly tick, before the next week's popups). */
export function powerWeek(ctx: Ctx): void {
  const s = ctx.s;
  if (s.gameOver) return;
  const p = pw(s);
  detectSuccession(ctx);
  if (s.gameOver) return;
  detectPrison(ctx);
  // Blitzes: one hit a week each.
  for (const b of p.blitzes) {
    if (b.stopped || b.start >= s.week) continue;
    if (b.attacker === 'player') {
      // The other side may see it coming and dig in.
      const leak = crew(s).some((c) => c.informantFor === b.defender);
      if (chance(p, leak ? 0.3 : 0.08)) {
        b.momentum -= 15;
        ctx.log.push(`${FACTION_NAMES[b.defender]} went to the mattresses: your crews find empty houses.`);
      }
    }
    blitzStep(ctx, b);
    if (s.gameOver) return;
  }
  detectSuccession(ctx);
  if (s.gameOver) return;
  p.blitzes = p.blitzes.filter((b) => !b.stopped || s.week - b.start < 26).slice(-6);
  const onMe = activeBlitz(s, undefined, 'player');
  if (onMe && !p.crisis) queue(s, buildBlitzCutIn(s, onMe));
  informantWarnings(ctx);
  scanDeaths(ctx);
  defenseCosts(ctx);
  stationWeek(ctx);
  detectVacancies(ctx);
  // The monthly part.
  const mk = monthKey(s.date);
  if (p.lastMonth !== mk) {
    p.lastMonth = mk;
    powerMonth(ctx);
  }
  if (p.crisis && !s.eventQueue.some((e) => e.defId === 'power_crisis')) s.eventQueue.push(buildCrisisBeat(s, p.crisis));
  if (!p.crisis) queue(s, audienceWeek(s));
  if (!s.gameOver) shadowWeek(ctx);
}

function powerMonth(ctx: Ctx): void {
  const s = ctx.s;
  const p = pw(s);
  for (const n of growthMonth(s)) ctx.log.push(n);
  ambitionsMonth(ctx);
  queue(s, groomingMonth(ctx));
  for (const ev of grievancesMonth(ctx)) queue(s, ev);
  queue(s, frontMonth(ctx));
  stationMonth(ctx);
  if (s.gameOver) return;
  rivalBlitzMonth(ctx);
  coercionMonth(ctx);
  // Two centers of power while the boss is inside.
  if (p.acting && bossInside(s)) {
    const a = s.characters[p.acting.id];
    if (a?.alive && a.faction === 'player') {
      p.acting.authority = Math.min(100, p.acting.authority + 3);
      if (chance(p, 0.5)) queue(s, buildPrisonOrder(s, a));
    }
  }
  // An heir whose ambition boils over makes his move.
  if (!p.crisis && p.station === 'boss') {
    for (const c of successionCandidates(s)) {
      const a = ambitionOf(s, c);
      if (a.want !== 'chair' || a.intensity < 85) continue;
      if (s.week - (s.flags[`pwr_move_${c.id}`] ?? -999) < 52) continue;
      if (challengePressure(s, c).score < 60) continue;
      s.flags[`pwr_move_${c.id}`] = s.week;
      if (c.dynasty) queue(s, buildHeirMove(s, c));
      else if (c.faction === 'player' && (c.rank === 'capo' || c.rank === 'underboss') && !s.factions.some((f) => f.memberIds.includes(c.id))) {
        const friends = crew(s).filter((o) => o.id !== c.id && opinion(s, o.id, c.id) >= 15 && opinion(s, o.id, s.playerId) < 30);
        if (friends.length) {
          s.factions.push({ id: `f${s.nextId++}`, leaderId: c.id, memberIds: [c.id, ...friends.slice(0, 3).map((x) => x.id)], demand: 'contracts', agenda: 'underboss', candidateId: c.id, since: s.week, stage: 0, stageWeek: s.week, name: `${c.firstName} ${c.lastName}'s people` });
          ctx.log.push(`${displayName(c)} has started gathering men: he wants more than you will give him.`);
        }
      }
      break;
    }
  }
  // Keep the bookkeeping bounded.
  for (const id of Object.keys(p.ambitions)) if (!s.characters[id]?.alive) delete p.ambitions[id];
  for (const id of Object.keys(p.placements)) {
    const c = s.characters[id];
    if (!c?.alive || (c.faction !== 'player' && !c.dynasty)) delete p.placements[id];
  }
}

/** The chair changed hands: a sudden succession starts a crisis. */
function detectSuccession(ctx: Ctx): void {
  const s = ctx.s;
  const p = pw(s);
  if (!p.lastBossId) p.lastBossId = s.playerId;
  if (p.lastBossId === s.playerId) return;
  const old = s.characters[p.lastBossId];
  p.lastBossId = s.playerId;
  // A new boss: whoever was acting for (or fronting for) the old one is no longer that.
  if (p.acting?.id === s.playerId || p.acting) p.acting = undefined;
  p.bossJailed = false;
  if (p.front && (p.front.figureheadId === s.playerId || p.front.type === 'prison')) endFront(ctx, 'the chair changed hands');
  delete p.placements[s.playerId];
  if (p.crisis) {
    p.crisis.heirId = s.playerId;
    p.crisis.wave++;
    return;
  }
  if (!old) return;
  // A natural death or a retirement is a succession, not a crisis.
  if (old.alive || !old.death || old.death.killer === undefined) return;
  const blitz = activeBlitz(s, undefined, 'player');
  const cause = blitz ? 'blitz' : /own capos|faction/.test(old.death.cause) ? 'removed' : /disappear/.test(old.death.cause) ? 'disappeared' : 'killed';
  startCrisis(ctx, cause, old.id, old.death.killer);
}

/** The boss goes inside: an acting boss, two centers of power, a crisis. */
function detectPrison(ctx: Ctx): void {
  const s = ctx.s;
  const p = pw(s);
  const inside = bossInside(s);
  const boss = player(s);
  if (inside && !p.bossJailed) {
    p.bossJailed = true;
    const left = (boss.imprisonedUntil ?? s.week) - s.week;
    const a = pickActing(s);
    if (a && left >= 20) {
      p.acting = { id: a.id, since: s.week, authority: 40 };
      addStory(s, a, 'Became acting boss while the boss is inside.');
      if (!p.front) installFront(ctx, a, 'prison');
      if (!p.crisis) startCrisis(ctx, 'jailed', boss.id, 'law');
    }
  } else if (!inside && p.bossJailed) {
    p.bossJailed = false;
    const a = p.acting ? s.characters[p.acting.id] : undefined;
    if (a?.alive && a.faction === 'player') queue(s, buildHandBack(s, a, p.acting!.authority));
    else p.acting = undefined;
  }
}

/** Unsanctioned killings of made men (their family may come for you), checked once per death. */
function scanDeaths(ctx: Ctx): void {
  const s = ctx.s;
  const p = pw(s);
  const since = s.flags.pwr_scan ?? s.week - 2;
  for (const id in s.characters) {
    const c = s.characters[id];
    if (c.alive || !c.death || c.death.week <= since || c.death.killer !== 'player') continue;
    const r = s.rivals.find((x) => x.id === c.faction && x.kind === 'mob');
    if (!r || c.rank === 'associate' || c.rank === 'civilian') continue;
    if ((s.sanctions[c.id] ?? 0) >= c.death.week || s.wars.some((w) => w.rival === r.id && w.sanctioned)) continue;
    if (p.blitzes.some((b) => b.attacker === 'player' && b.defender === r.id && s.week - b.start < 12)) continue;
    p.legit[r.id] = s.week + 52;
    ctx.log.push(`You killed a made man of ${r.name} without the Table's consent. They may come for you, and nobody will object.`);
  }
  s.flags.pwr_scan = s.week;
}

/** Rivals try to turn the people close to you (adults only; resolved as abstract events). */
function coercionMonth(ctx: Ctx): void {
  const s = ctx.s;
  const p = pw(s);
  const boss = player(s);
  for (const r of s.rivals.filter((x) => x.kind === 'mob')) {
    if (opinion(s, r.leaderId, boss.id) > -20 && !r.feud && !r.war) continue;
    if (!chance(p, 0.03)) continue;
    const close: Character[] = [];
    const wife = boss.spouseId ? s.characters[boss.spouseId] : undefined;
    if (wife?.alive) close.push(wife);
    const friend = crew(s).filter((c) => isFree(s, c)).sort((a, b) => opinion(s, boss.id, b.id) - opinion(s, boss.id, a.id))[0];
    if (friend) close.push(friend);
    close.push(...capos(s).filter((c) => isFree(s, c)));
    const ub = crew(s).find((c) => c.rank === 'underboss');
    if (ub) close.push(ub);
    const t = close.filter((c) => ageOn(c.birth, s.date) >= 18 && !c.informantFor)[Math.floor((s.week * 7 + r.id.length) % Math.max(1, close.length))];
    if (!t) continue;
    const resist = viewAttrs(s, t).v.loyalty / 100 * 0.6 + opinion(s, t.id, boss.id) / 200 + (t.id === wife?.id ? 0.3 : 0) + (hasTrait(t, 'Loyal-to-a-fault') ? 0.4 : 0);
    if (chance(p, Math.max(0.15, Math.min(0.95, resist)))) {
      queue(s, buildCoerced(s, t, r.id));
    } else {
      t.informantFor = r.id;
      addStory(s, t, `${r.name} got to ${t.gender === 'F' ? 'her' : 'him'}.`);
    }
    break;
  }
}

function buildCoerced(s: GameState, t: Character, rival: RivalId): EventInstance {
  const r = s.rivals.find((x) => x.id === rival)!;
  const label = `${r.shortName} got to ${t.firstName}`;
  const op = (reply: 'reward' | 'trap' | 'ignore') => ({ type: 'power', op: { op: 'coerced', charId: t.id, rival, reply }, label }) as const;
  const rel = t.id === player(s).spouseId ? 'your wife' : t.rank === 'underboss' ? 'your underboss' : t.rank === 'capo' ? 'one of your capos' : 'your oldest friend';
  return {
    iid: `ev${s.nextId++}`, defId: 'power_coerced', week: s.week, mandatory: false, priority: 55,
    title: `${r.shortName} reached for ${t.firstName}`,
    text: `${displayName(t)}, ${rel}, tells you: a man from ${r.name} came around with an offer and a warning — money for what ${t.gender === 'F' ? 'she' : 'he'} knows about your movements, and trouble if not. ${t.gender === 'F' ? 'She' : 'He'} said no, and came straight to you.`,
    defaultChoiceId: 'reward', meta: { who: t.id }, actors: [t.id],
    choices: [
      { id: 'reward', label: 'Thank and protect', detail: 'Loyalty remembered.', because: `rewarded ${t.firstName}'s loyalty`, effects: [{ type: 'money', amount: -500, label }, op('reward')] },
      { id: 'trap', label: 'Feed them a story through ' + t.firstName, detail: 'Let them think it worked. Risky for the one who carries it.', because: `set a trap for ${r.shortName} through ${t.firstName}`, effects: [op('trap')] },
      { id: 'ignore', label: 'Tell no one, change nothing', because: `kept quiet about ${r.shortName}'s approach`, effects: [op('ignore')] },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Effect ops                                                          */
/* ------------------------------------------------------------------ */

export function describePowerOp(s: GameState, op: PowerOp): string | undefined {
  switch (op.op) {
    case 'crisis': {
      const d = MOVE_INFO[op.move].d;
      return Object.entries(d).map(([k, v]) => `${k[0].toUpperCase()}${k.slice(1)} ${(v as number) > 0 ? '+' : '−'}${Math.abs(v as number)}`).join(' · ') + (op.move === 'hunt' ? ' · learn who did it' : '');
    }
    case 'blitzMove':
      return { mattresses: 'Blitz momentum −15; safehouses', hitback: 'Kill their boss and the chain stops', table: 'The Table may order a ceasefire', hide: 'Next target hidden this week', payoff: 'They may take the money and stop', stand: 'Blitz momentum +5' }[op.move];
    case 'grievance':
      return { amends: 'Grievance settled', share: 'Bigger end; grievance eased', explain: 'Eases it — if he is patient or loyal', rebuke: 'Fear +20; grievance deepens', exile: 'He leaves the family', post: 'Grievance settled' }[op.resolve];
    case 'promise': {
      const c = s.characters[op.charId];
      return `Promise ${c?.firstName ?? '?'} the chair in ${op.years} years`;
    }
    case 'brokenPromise':
      return { truth: 'The underboss stays heir; the secret heir is dropped', official: 'Secret heir named publicly; underboss passed over', buy: 'Underboss grievance halved', retire: 'Underboss retires', remove: 'Underboss killed' }[op.reply];
    case 'frontReply':
      return { authority: 'Front: his authority +30, your influence −30', pay: 'He becomes a willing front', retire: 'Front ends; he retires', end: 'Front ends', remove: 'Front boss killed', ignore: 'Nothing changes' }[op.reply];
    case 'prisonOrder':
      return { insist: 'Your authority vs his: he may defy you', letrun: 'Acting boss authority +10', replace: 'New acting boss; he resents it' }[op.reply];
    case 'handBack':
      return { thank: 'You take the chair back', share: 'He becomes underboss', force: 'He is exiled' }[op.reply];
    case 'petition':
      return { for: 'Rule for the petitioner', against: 'Rule against', investigate: 'The truth in a week', dismiss: 'Sent away', punish: 'Liar punished (fine, fear)', forgive: 'He owes you (a hook)' }[op.ruling];
    case 'station':
      return `You become ${STATION_INFO[op.station].name.toLowerCase()}`;
    case 'heirMove': {
      const c = s.characters[op.charId];
      return { stepaside: `${c?.firstName ?? '?'} takes the chair; you retire`, promise: 'A promise: two years', refuse: 'His ambition +10', exile: `${c?.firstName ?? '?'} leaves Wildwood` }[op.reply];
    }
    case 'coerced':
      return { reward: 'Opinion +15', trap: 'Feed lies to the rival (may cost them)', ignore: 'Nothing' }[op.reply];
    case 'meter':
      return `${op.meter} ${op.amount > 0 ? '+' : '−'}${Math.abs(op.amount)}`;
    case 'note':
      return op.text;
    case 'shadow':
      return describeShadowOp(s, op.o);
    case 'climbAsked':
      return undefined;
    case 'low':
      return describeLowOp(s, op.o);
  }
}

export function applyPowerOp(ctx: Ctx, op: PowerOp, label: string): void {
  const s = ctx.s;
  const p = pw(s);
  const boss = player(s);
  // Scenes raised before a succession may name the man who is now the boss: they are moot.
  const subject = 'charId' in op ? op.charId : op.op === 'brokenPromise' ? op.ubId : undefined;
  if (subject && subject === s.playerId) return;
  if (op.op === 'grievance' && p.grievances.find((g) => g.id === op.id)?.charId === s.playerId) return;
  switch (op.op) {
    case 'crisis':
      crisisMove(ctx, op.move);
      break;
    case 'blitzMove': {
      const b = p.blitzes.find((x) => x.id === op.blitzId);
      if (!b || b.stopped) break;
      const r = s.rivals.find((x) => x.id === b.attacker);
      if (op.move === 'mattresses') {
        p.mattresses = s.week;
        b.momentum -= 15;
      } else if (op.move === 'hitback') {
        const leader = r ? s.characters[r.leaderId] : undefined;
        const pr = 0.3 + Math.min(0.3, crew(s).filter((c) => isFree(s, c)).length / 60) + p.prep.crews * 0.05;
        if (leader?.alive && chance(p, pr)) {
          // Hitting back kills their boss: the chain stops (single death function).
          applyEffects(ctx, [{ type: 'kill', charId: leader.id, cause: 'killed when the family hit back at the blitz', killer: 'player' }], { label, because: 'hit back at the blitz' });
          b.stopped = 'You hit back and killed their boss. The chain stopped.';
          respect(ctx, 6, label, 'event');
        } else b.momentum += 10;
      } else if (op.move === 'table') {
        const philly = s.rivals.find((x) => x.id === 'philly');
        const mine = philly ? opinion(s, philly.leaderId, boss.id) : 0;
        const theirs = philly && r ? opinion(s, philly.leaderId, r.leaderId) : 0;
        if (mine >= theirs - 5 || chance(p, 0.25)) b.stopped = 'Philadelphia ordered a ceasefire.';
      } else if (op.move === 'hide') {
        b.shield = s.week + 1;
      } else if (op.move === 'payoff') {
        if (chance(p, r && (r.goal === 'enrich' || r.goal === 'squeeze') ? 0.75 : 0.35)) b.stopped = 'They took the money and went home.';
      } else if (op.move === 'stand') b.momentum += 5;
      if (b.momentum <= 0 && !b.stopped) b.stopped = 'Your moves broke their momentum. The chain stopped.';
      if (b.stopped) ctx.log.push(`The blitz is over: ${b.stopped}`);
      break;
    }
    case 'grievance': {
      const g = p.grievances.find((x) => x.id === op.id);
      const c = g ? s.characters[g.charId] : undefined;
      if (!g || !c?.alive || g.status !== 'open') break;
      const x = viewAttrs(s, c).v;
      if (op.resolve === 'amends' || op.resolve === 'post') {
        g.status = 'resolved';
        g.resolution = 'You made it right.';
        addOpinion(s, c.id, boss.id, `Made it right about ${g.postLabel}`, 15, 1);
        changeMeter(s, c.id, boss.id, 'grievance', -25);
      } else if (op.resolve === 'share') {
        if (c.rank === 'capo') c.keep = Math.min(0.5, Math.round(((c.keep ?? 0.3) + 0.05) * 100) / 100);
        else c.wealth += 1000;
        g.severity = Math.max(0, g.severity - 30);
        g.stage = Math.max(0, g.stage - 1);
        if (g.severity < 20) { g.status = 'resolved'; g.resolution = 'A bigger end settled it.'; }
        addOpinion(s, c.id, boss.id, 'Gave me a bigger end', 10, 1);
      } else if (op.resolve === 'explain') {
        if (x.patience >= 55 || x.loyalty >= 60) {
          g.severity = Math.max(0, g.severity - 20);
          g.stage = Math.max(0, g.stage - 1);
          if (g.severity < 20) { g.status = 'resolved'; g.resolution = 'He understood.'; }
        } else if (x.pride >= 60) g.severity = Math.min(100, g.severity + 10);
      } else if (op.resolve === 'rebuke') {
        changeMeter(s, c.id, boss.id, 'fear', 20);
        g.severity = Math.min(100, g.severity + 10);
      } else if (op.resolve === 'exile') {
        g.status = 'exploded';
        g.resolution = 'You threw him out.';
        applyEffects(ctx, [{ type: 'exile', charId: c.id }], { label, because: 'exiled a passed-over man' });
      }
      break;
    }
    case 'promise': {
      const c = s.characters[op.charId];
      if (!c?.alive) break;
      const a = ambitionOf(s, c);
      a.promise = { by: s.week + op.years * 52, made: s.week, text: `the chair within ${op.years} years` };
      a.intensity = Math.max(0, a.intensity - 15);
      a.log.push({ week: s.week, text: `You promised him the chair within ${op.years} years.` });
      addOpinion(s, c.id, boss.id, 'Promised me the chair', 12, 1);
      break;
    }
    case 'brokenPromise': {
      const ub = s.characters[op.ubId];
      const heir = s.characters[op.heirId];
      const d = p.designation;
      if (op.reply === 'truth') {
        d.mode = 'underboss';
        d.secretId = undefined;
        d.grooming = undefined;
        s.successionLaw = 'underboss';
        s.designatedHeirId = undefined;
        if (heir?.alive) passedOver(ctx, 'heir', ub?.id ?? s.playerId, { public: false, wanters: [heir] });
        if (ub?.alive) addOpinion(s, ub.id, boss.id, 'Kept his word to me in the end', 10, 1);
      } else if (op.reply === 'official') {
        d.mode = 'named';
        d.publicId = heir?.id;
        d.secretId = undefined;
        if (heir?.alive && heir.dynasty) {
          s.successionLaw = 'appointed';
          s.designatedHeirId = heir.id;
        }
        if (ub?.alive && heir) passedOver(ctx, 'heir', heir.id, { public: true, wanters: [ub] });
      } else if (op.reply === 'buy') {
        if (ub?.alive) {
          const gs = passedOver(ctx, 'heir', heir?.id ?? s.playerId, { public: false, wanters: [ub] });
          for (const g of gs) g.severity = Math.round(g.severity / 2);
          ub.wealth += 5000;
        }
      } else if (op.reply === 'retire') {
        if (ub?.alive) applyEffects(ctx, [{ type: 'retire', charId: ub.id }], { label, because: 'retired the underboss' });
      } else if (op.reply === 'remove') {
        if (ub?.alive) applyEffects(ctx, [{ type: 'kill', charId: ub.id, cause: 'killed because he found out about the secret heir', killer: 'player' }, { type: 'crewOpinion', amount: -6, reason: 'Killed his own underboss' }], { label, because: 'had the underboss killed' });
      }
      break;
    }
    case 'frontReply': {
      const f = p.front;
      const c = f ? s.characters[f.figureheadId] : undefined;
      if (!f || !c || c.id === s.playerId) break;
      if (op.reply === 'authority') {
        f.authority = Math.min(100, f.authority + 30);
        f.influence = Math.max(0, f.influence - 30);
        f.type = f.type === 'unaware' ? 'willing' : f.type;
        addOpinion(s, c.id, boss.id, 'Gave me real authority', 15, 1);
      } else if (op.reply === 'pay') {
        f.type = 'willing';
        c.wealth += 3000;
      } else if (op.reply === 'retire') {
        endFront(ctx, 'he retired');
        if (c.alive && c.faction === 'player') applyEffects(ctx, [{ type: 'retire', charId: c.id }], { label, because: 'let the front boss retire' });
      } else if (op.reply === 'end') {
        endFront(ctx, 'you took the title back');
        addOpinion(s, c.id, boss.id, 'Took the title away', -15, 1);
      } else if (op.reply === 'remove') {
        endFront(ctx, 'he was removed');
        if (c.alive) applyEffects(ctx, [{ type: 'kill', charId: c.id, cause: 'killed for knowing he was a front', killer: 'player' }], { label, because: 'removed the front boss' });
      } else if (op.reply === 'ignore') {
        if (f.reaction === 'demand' || f.reaction === 'rally') {
          f.type = 'rebellious';
          f.authority = Math.min(100, f.authority + 15);
          f.influence = Math.max(0, f.influence - 15);
        } else if (f.reaction === 'retire') endFront(ctx, 'he retired on his own');
      }
      break;
    }
    case 'prisonOrder': {
      const a = p.acting ? s.characters[p.acting.id] : undefined;
      if (!p.acting || !a?.alive || a.id === s.playerId) break;
      if (op.reply === 'insist') {
        const obey = 0.5 + viewAttrs(s, a).v.loyalty / 200 - p.acting.authority / 200;
        if (chance(p, obey)) {
          p.acting.authority = Math.max(0, p.acting.authority - 10);
          ctx.log.push(`${a.firstName} carried out your orders from prison.`);
        } else {
          p.acting.authority = Math.min(100, p.acting.authority + 10);
          addOpinion(s, s.playerId, a.id, 'Ignored my orders from prison', -15, 1);
          ctx.log.push(`${a.firstName} ignored your orders from prison.`);
        }
      } else if (op.reply === 'letrun') p.acting.authority = Math.min(100, p.acting.authority + 10);
      else if (op.reply === 'replace') {
        const next = crew(s).filter((c) => c.rank === 'capo' && c.id !== a.id && isFree(s, c)).sort((x, y) => opinion(s, y.id, boss.id) - opinion(s, x.id, boss.id))[0];
        if (next) {
          addOpinion(s, a.id, boss.id, 'Replaced me as acting boss', -20, 1);
          passedOver(ctx, 'chair', next.id, { wanters: [a] });
          p.acting = { id: next.id, since: s.week, authority: 30 };
          if (p.front?.type === 'prison') p.front.figureheadId = next.id;
        }
      }
      break;
    }
    case 'handBack': {
      const a = p.acting ? s.characters[p.acting.id] : undefined;
      p.acting = undefined;
      if (p.front?.type === 'prison') endFront(ctx, 'the boss is home');
      if (!a?.alive || a.id === s.playerId || a.faction !== 'player') break;
      if (op.reply === 'thank') {
        addOpinion(s, a.id, boss.id, 'Took back what I held for him', a.attrs && a.attrs.v.ambition > 60 ? -10 : 5, 1);
        addSuccess(s, a, 'Held the family while the boss was inside');
      } else if (op.reply === 'share') {
        if (a.rank !== 'underboss') applyEffects(ctx, [{ type: 'seat', seat: 'underboss', charId: a.id }], { label, because: 'made the acting boss underboss' });
        addOpinion(s, a.id, boss.id, 'Kept me close', 10, 1);
      } else if (op.reply === 'force') {
        applyEffects(ctx, [{ type: 'exile', charId: a.id }], { label, because: 'forced out the acting boss' });
      }
      break;
    }
    case 'petition':
      petitionRuling(ctx, op.id, op.ruling, label);
      break;
    case 'station':
      chooseStation(ctx, op.station);
      break;
    case 'heirMove': {
      const c = s.characters[op.charId];
      if (!c?.alive) break;
      const a = ambitionOf(s, c);
      if (op.reply === 'stepaside') {
        if (c.dynasty) {
          s.successionLaw = 'appointed';
          s.designatedHeirId = c.id;
          applyEffects(ctx, [{ type: 'dyn', op: { op: 'abdicate' } }], { label, because: `stepped aside for ${c.firstName}` });
        }
      } else if (op.reply === 'promise') {
        applyPowerOp(ctx, { op: 'promise', charId: c.id, years: 2 }, label);
      } else if (op.reply === 'refuse') {
        a.intensity = Math.min(100, a.intensity + 10);
        changeMeter(s, c.id, boss.id, 'grievance', 15);
      } else if (op.reply === 'exile') {
        a.intensity = Math.min(100, a.intensity + 20);
        if (c.faction === 'player' && c.rank !== 'civilian') applyEffects(ctx, [{ type: 'exile', charId: c.id }], { label, because: `sent ${c.firstName} away` });
        else {
          addOpinion(s, c.id, boss.id, 'Sent me away', -30, 0);
          c.busyUntil = s.week + 52;
        }
      }
      break;
    }
    case 'coerced': {
      const c = s.characters[op.charId];
      const r = s.rivals.find((x) => x.id === op.rival);
      if (!c?.alive) break;
      if (op.reply === 'reward') addOpinion(s, c.id, boss.id, 'Stood by me when they came', 15, 1);
      else if (op.reply === 'trap' && r) {
        if (chance(p, 0.6)) {
          r.money = Math.max(0, r.money - 3000);
          r.muscle = Math.max(0, r.muscle - 4);
          ctx.log.push(`The story ${c.firstName} carried cost ${r.shortName} a crew and a lot of money.`);
        } else {
          addOpinion(s, r.leaderId, c.id, 'Played us', -30, 0);
          ctx.log.push(`${r.shortName} saw through the story ${c.firstName} carried.`);
        }
      }
      break;
    }
    case 'meter': {
      if (p.crisis) p.crisis.meters[op.meter] = Math.max(0, Math.min(100, p.crisis.meters[op.meter] + op.amount));
      break;
    }
    case 'note':
      break;
    case 'climbAsked':
      p.climbWeek = s.week;
      break;
    case 'low':
      applyLowOp(ctx, op.o, label);
      break;
    case 'shadow':
      applyShadowOp(ctx, op.o);
      break;
  }
  void label;
}

function petitionRuling(ctx: Ctx, id: string, ruling: 'for' | 'against' | 'investigate' | 'dismiss' | 'punish' | 'forgive', label: string): void {
  const s = ctx.s;
  const p = pw(s);
  const rec = p.petitions.find((x) => x.id === id);
  if (!rec) return;
  const c = s.characters[rec.petitionerId];
  const boss = player(s);
  if (ruling === 'investigate') {
    rec.status = 'investigating';
    const odds = investigateOdds(s, rec);
    const caught = !rec.truthful && chance(p, odds.chance);
    if (caught) rec.status = 'caught';
    else if (rec.truthful && chance(p, odds.chance)) rec.status = 'confirmed';
    else rec.status = 'unclear';
    if (caught) p.stats.liarsCaught++;
    s.eventQueue.push(buildFinding(s, rec, caught));
    return;
  }
  if (ruling === 'punish' && c?.alive) {
    rec.ruling = 'punished';
    c.wealth = Math.max(0, c.wealth - 1000);
    changeMeter(s, c.id, boss.id, 'fear', 15);
    addOpinion(s, c.id, boss.id, 'Caught me lying', -10, 1);
    addStory(s, c, 'Caught lying to the boss.');
    return;
  }
  if (ruling === 'forgive' && c?.alive) {
    rec.ruling = 'forgiven';
    applyEffects(ctx, [{ type: 'hook', targetId: c.id, strong: false, reason: 'Lied to you in the back room, and you know it' }], { label, because: 'forgave a liar' });
    return;
  }
  rec.status = rec.status === 'open' || rec.status === 'investigating' ? 'ruled' : rec.status;
  rec.ruling = ruling;
  // Injustice: ruling for a liar wrongs the other man; ruling against the truth wrongs the petitioner.
  const against = rec.againstId ? s.characters[rec.againstId] : undefined;
  if (ruling === 'for' && !rec.truthful && against?.alive && against.faction === 'player') {
    passedOver(ctx, 'justice', c?.id ?? boss.id, { public: true, wanters: [against] });
    respect(ctx, -1, `${label}: the island hears you believed a liar`, 'event');
  } else if (ruling === 'against' && rec.truthful && c?.alive && c.faction === 'player') {
    changeMeter(s, c.id, boss.id, 'grievance', 10);
  } else if (ruling === 'for' && rec.truthful) {
    respect(ctx, 1, `${label}: a fair ruling`, 'event');
  }
}

/* ------------------------------------------------------------------ */
/* Orders                                                              */
/* ------------------------------------------------------------------ */

const note = (text: string): Effect => ({ type: 'power', op: { op: 'note', text }, label: text });

export function previewPower(s: GameState, a: PowerAction): ActionPreview {
  const p = s.power;
  const boss = player(s);
  const base = { effects: [] as Effect[], cost: 0, category: 'event' as const };
  switch (a.op) {
    case 'designate': {
      const info = DESIGNATION_INFO[a.mode];
      const c = a.charId ? s.characters[a.charId] : undefined;
      const ub = crew(s).find((x) => x.rank === 'underboss');
      const winner = a.mode === 'underboss' ? ub : a.mode === 'named' || a.mode === 'unwritten' ? c : undefined;
      const losers = winner ? wantersFor(s, 'heir', winner.id).map((x) => x.firstName) : [];
      const effects: Effect[] = [note(`Heir: ${info.name}${c ? ` — ${c.firstName}` : ''}`)];
      if (losers.length) effects.push(note(`Passed over: ${losers.slice(0, 4).join(', ')}${losers.length > 4 ? '…' : ''}`));
      if (a.mode === 'private') effects.push(note('Secret: grievances wait until it comes out'));
      return {
        ...base, title: `Name the heir: ${info.name}${c ? ` (${c.firstName})` : ''}`, detail: info.text, effects, because: `named the heir (${info.name.toLowerCase()})`,
        disabledReason: info.needsHeir && !c ? 'Choose who' : c && (!c.alive || c.id === boss.id) ? 'Not available' : (a.mode === 'named' || a.mode === 'private' || a.mode === 'unwritten') && c && !c.dynasty ? 'The heir must be of the house (adopt him first)' : (a.mode === 'named' || a.mode === 'private' || a.mode === 'unwritten') && c && successionBar(s, c) ? `Not in the line: ${successionBar(s, c)!.toLowerCase()}` : a.mode === 'underboss' && !ub ? 'There is no underboss' : a.mode === 'private' && !ub ? 'A secret heir needs an underboss to stand in front of him' : undefined,
      };
    }
    case 'groom': {
      const c = s.characters[a.charId];
      const path = GROOM_PATHS[a.path];
      const cost = path.weekly * 6;
      return {
        ...base, title: `Groom ${c?.firstName ?? '?'}: ${path.name.toLowerCase()}`, detail: path.text, cost,
        effects: [...(cost ? [{ type: 'money', amount: -cost } as Effect] : []), note(`Builds ${path.keys.map((k) => ATTR_LABEL[k]).join(', ')}`), note(`Exposure +${path.exposure}/month while this is the secret heir`)],
        because: `put ${c?.firstName ?? 'the heir'} on the path: ${path.name.toLowerCase()}`,
        disabledReason: !c?.alive || !c.dynasty ? 'Only a son or daughter of the house' : ageOn(c.birth, s.date) < 17 ? 'Too young' : p?.designation.grooming?.charId === c.id && p.designation.grooming.path === a.path ? 'Already on this path' : s.money < cost ? `Needs $${cost.toLocaleString('en-US')}` : undefined,
      };
    }
    case 'stopGrooming':
      return { ...base, title: 'Stop the grooming', effects: [note('The heir comes home')], because: 'stopped grooming the heir', disabledReason: p?.designation.grooming ? undefined : 'Nobody is being groomed' };
    case 'place': {
      const c = s.characters[a.charId];
      const post = POSTS[a.post];
      const mentor = post?.mentorSeat ? holder(s, post.mentorSeat) : undefined;
      const hotel = s.businesses.some((b) => b.owner === 'player' && (b.kind === 'motel' || b.kind === 'restaurant' || b.kind === 'boarding'));
      return {
        ...base, title: `Place ${c?.firstName ?? '?'}: ${post?.name.toLowerCase() ?? a.post}`, detail: post?.text,
        effects: [note(`Builds ${post?.keys.map((k) => ATTR_LABEL[k]).join(', ')}`), ...(mentor ? [note(`Mentor: ${mentor.firstName} ${mentor.lastName}`)] : [])],
        warning: 'A protégé who does well gets rich and gathers men who would follow him.',
        because: `placed ${c?.firstName ?? 'a protégé'} to learn: ${post?.name.toLowerCase()}`,
        disabledReason: !c?.alive || c.id === boss.id ? 'Not available' : !(c.faction === 'player' || c.dynasty) ? 'Not one of yours' : ageOn(c.birth, s.date) < 16 ? 'Too young' : post?.mentorSeat && !mentor ? `Nobody holds the ${post.mentorSeat} seat` : mentor?.id === c.id ? 'He cannot mentor himself' : a.post === 'hotel' && !hotel ? 'You need a motel, restaurant or boarding house' : p?.placements[c.id]?.post === a.post ? 'Already there' : undefined,
      };
    }
    case 'unplace':
      return { ...base, title: `Bring ${s.characters[a.charId]?.firstName ?? '?'} back`, effects: [note('He stops learning there')], because: 'ended a placement', disabledReason: p?.placements[a.charId] ? undefined : 'Not placed' };
    case 'read': {
      const c = s.characters[a.charId];
      const cons = holder(s, 'consigliere');
      return {
        ...base, title: `Find out what ${c?.firstName ?? '?'} really wants`, detail: cons ? `${cons.firstName} asks around.` : 'A private detective and a bartender who owes you.', cost: cons ? 200 : 800,
        effects: [{ type: 'money', amount: cons ? -200 : -800 }, note('His hidden ambition, revealed')], because: `found out what ${c?.firstName ?? 'a man'} really wants`,
        disabledReason: !c?.alive ? 'Not available' : p?.ambitions[c.id]?.revealed ? 'You already know' : undefined,
      };
    }
    case 'promise': {
      const c = s.characters[a.charId];
      return {
        ...base, title: `Promise ${c?.firstName ?? '?'} the chair in ${a.years} years`, detail: 'Calms him today. If you are still in the chair when it comes due, it is a broken promise.',
        effects: [{ type: 'opinion', from: a.charId, to: boss.id, amount: 12, reason: 'Promised me the chair' }, { type: 'power', op: { op: 'promise', charId: a.charId, years: a.years } }], because: `promised ${c?.firstName ?? 'him'} the chair in ${a.years} years`,
        disabledReason: !c?.alive ? 'Not available' : p?.ambitions[c.id]?.promise ? 'He already has your promise' : undefined,
      };
    }
    case 'amends': {
      const g = p?.grievances.find((x) => x.id === a.grievanceId);
      const c = g ? s.characters[g.charId] : undefined;
      const cost = a.kind === 'money' ? 500 + Math.round((g?.severity ?? 0) * 30) : 0;
      const acc: Acceptance | undefined = c ? amendsOdds(s, c, g!.severity, a.kind) : undefined;
      return {
        ...base, title: `Make amends to ${c?.firstName ?? '?'} (${a.kind === 'money' ? 'an envelope' : a.kind === 'share' ? 'a bigger end' : 'an apology'})`, cost,
        effects: [...(cost ? [{ type: 'money', amount: -cost } as Effect] : []), { type: 'power', op: { op: 'grievance', id: a.grievanceId, resolve: a.kind === 'share' ? 'share' : 'amends' } }],
        acceptance: acc, refuseEffects: c ? [{ type: 'opinion', from: c.id, to: boss.id, amount: -4, reason: 'Thinks he can buy me', decay: 1 }] : undefined,
        because: `made amends to ${c?.firstName ?? 'a passed-over man'}`,
        disabledReason: !g || g.status !== 'open' || !c?.alive ? 'Nothing to settle' : s.money < cost ? 'Not enough money' : undefined,
      };
    }
    case 'announce':
      return { ...base, title: a.mode === 'public' ? 'Announce appointments in public' : 'Explain appointments privately to the losers', detail: a.mode === 'public' ? 'Clear and fast; the proud are humiliated in front of everyone.' : 'Slower; each man who lost hears it from you first (−8 resentment).', effects: [note(a.mode === 'public' ? 'Public announcements' : 'Private explanations')], because: `chose to announce appointments ${a.mode === 'public' ? 'in public' : 'in private'}`, disabledReason: (p?.announce ?? 'public') === a.mode ? 'Already your way' : undefined };
    case 'prep': {
      const info = PREP_INFO[a.kind];
      const lvl = p?.prep[a.kind] ?? 0;
      return { ...base, title: `Prepare a blitz: ${info.name.toLowerCase()}`, detail: info.text, cost: info.cost, effects: [{ type: 'money', amount: -info.cost }, note(`${info.name} ${lvl} → ${lvl + 1}`)], because: `prepared for a blitz (${info.name.toLowerCase()})`, disabledReason: lvl >= MAX_PREP ? 'As ready as it gets' : s.money < info.cost ? 'Not enough money' : undefined };
    }
    case 'blitz': {
      const r = s.rivals.find((x) => x.id === a.rival);
      const odds = blitzOdds(s, a.rival);
      return {
        ...base, title: `Blitz ${r?.name ?? '?'}: go to the mattresses`, detail: 'One hit a week on their leadership, lieutenants first, the boss last. Each miss costs momentum.',
        effects: [note(`${r ? s.characters[r.leaderId] ? `Targets: their capos, then ${s.characters[r.leaderId].firstName} ${s.characters[r.leaderId].lastName}` : '' : ''}`), { type: 'heat', bar: 'family', amount: 6 }, { type: 'rivalOpinion', rival: 'philly', amount: -15, reason: 'Went to war without asking the Table' }],
        odds, warning: 'Unsanctioned: Philadelphia was not asked. Fail and they will feud with you for good.', because: `launched a blitz on ${r?.name ?? 'a rival'}`,
        disabledReason: blitzDisabled(s, a.rival),
      };
    }
    case 'mattresses':
      return { ...base, title: a.on ? 'Go to the mattresses' : 'Come home from the mattresses', detail: 'Safehouses for the leadership: blitz hits much harder to land. A quarter of each week\'s take is lost while it lasts.', effects: [note(a.on ? 'Hits on your people −25%; income −25%' : 'Income back to normal')], because: a.on ? 'took the family to the mattresses' : 'brought the men home', disabledReason: !!p?.mattresses === a.on ? (a.on ? 'Already there' : 'Not on the mattresses') : undefined };
    case 'bodyguards':
      return { ...base, title: a.on ? `Hire bodyguards for six months ($${BODYGUARD_WEEKLY}/week)` : 'Let the bodyguards go', effects: [note(a.on ? 'You and the house: hits −20%' : 'No bodyguards')], because: a.on ? 'hired bodyguards' : 'let the bodyguards go', disabledReason: !!p?.bodyguards === a.on ? 'No change' : undefined };
    case 'front': {
      const c = s.characters[a.charId];
      return {
        ...base, title: `Make ${c?.firstName ?? '?'} the front boss (${FRONT_INFO[a.type].name.toLowerCase()})`, detail: FRONT_INFO[a.type].text,
        effects: [note('He draws the heat (−1 federal a month, his file grows instead of yours)'), note('The law and the rivals may see through it'), ...(a.type === 'willing' ? [note(`Stipend $${200}/week`)] : [])],
        because: `made ${c?.firstName ?? 'a man'} the front boss`, disabledReason: frontDisabled(s, c, a.type),
      };
    }
    case 'endFront':
      return { ...base, title: 'End the front arrangement', effects: [note('You are boss in name again')], because: 'ended the front', disabledReason: p?.front ? undefined : 'No front boss' };
    case 'consult':
      return { ...base, title: 'Consult the front boss on something real', detail: 'Keeps him believing (suspicion −15), and gives him a little real say.', effects: [note('Suspicion −15 · his authority +5 · your influence −3')], because: 'consulted the front boss', disabledReason: p?.front && p.front.type !== 'prison' ? undefined : 'No front boss' };
    case 'low':
      return previewLow(s, a.a);
    case 'climb': {
      const st = p?.station ?? 'boss';
      // In the ranks of the family above (valente.ts): moving up is a sit-down (or the making), not a roll at the turn.
      if (s.power?.above && inTheRanks(s)) return { ...previewLow(s, { op: 'callIn' }), effects: [{ type: 'power', op: { op: 'low', o: { op: 'callIn' } } }] };
      const over = s.power?.overId ? s.characters[s.power.overId] : undefined;
      return {
        ...base, title: st === 'exile' ? 'Come home and ask to be taken back' : st === 'independent' ? 'Make peace and rejoin the family' : `Ask ${over?.firstName ?? 'the boss'} to move you up`,
        detail: STATION_INFO[st].text, effects: [{ type: 'power', op: { op: 'climbAsked' } }, note('One rung up')],
        acceptance: st === 'boss' ? undefined : climbOdds(s), refuseEffects: [{ type: 'power', op: { op: 'climbAsked' } }, ...(over ? [{ type: 'opinion', from: over.id, to: boss.id, amount: -5, reason: 'Wants too much too fast', decay: 1 } as Effect] : [])],
        because: 'asked to move up', disabledReason: climbDisabled(s),
      };
    }
    case 'takeover': {
      const over = s.power?.overId ? s.characters[s.power.overId] : undefined;
      return {
        ...base, title: `Move on ${over ? displayName(over) : 'the boss'}`, detail: 'Take the family by force. Fail and you are in Florida — if you are lucky.',
        effects: [note('Success: you are the boss'), note('Failure: exile'), { type: 'heat', bar: 'local', amount: 6 }], odds: takeoverOdds(s), because: `moved on ${over?.firstName ?? 'the boss'}`,
        disabledReason: !p || p.station === 'boss' ? 'You are the boss' : !over?.alive ? 'Nobody above you' : p.station === 'exile' ? 'Come home first' : p.station === 'associate' || p.station === 'soldier' ? 'Only a capo or an independent crew can move on the boss' : crew(s).filter((c) => isFree(s, c)).length < 3 ? 'You need at least three men' : undefined,
      };
    }
    case 'shadow':
      return previewShadow(s, a.a);
    case 'audience':
      return { ...base, title: 'Hold court in the back room', detail: 'Let it be known you will hear people this Sunday. Someone with a real problem will come.', cost: 0, effects: [note('A petition next week (some petitioners lie)')], because: 'held court', disabledReason: s.week - (s.flags.pwr_court ?? -99) < 4 ? 'You held court recently' : undefined };
  }
}

export function amendsOdds(s: GameState, c: Character, severity: number, kind: 'money' | 'apology' | 'share'): Acceptance {
  const x = viewAttrs(s, c).v;
  const reasons = [
    { label: 'Base', value: 60 },
    { label: 'How badly he was hurt', value: -Math.round(severity * 0.4) },
    { label: 'Pride', value: -Math.round(Math.max(0, x.pride - 50) * 0.5) },
    { label: kind === 'money' ? 'Greed: he likes envelopes' : kind === 'share' ? 'A real piece' : 'Just words', value: kind === 'money' ? Math.round((x.greed - 40) * 0.4) : kind === 'share' ? 15 : -10 },
    { label: 'What he thinks of you', value: Math.round(opinion(s, c.id, s.playerId) * 0.3) },
  ].filter((r) => r.value !== 0);
  return { chance: Math.max(0.05, Math.min(0.95, reasons.reduce((a, r) => a + r.value, 0) / 100)), reasons };
}

export function commitPower(ctx: Ctx, a: PowerAction): void {
  const s = ctx.s;
  const p = pw(s);
  const boss = player(s);
  switch (a.op) {
    case 'designate': {
      const d = p.designation;
      const ub = crew(s).find((x) => x.rank === 'underboss');
      d.mode = a.mode;
      d.exposure = 0;
      d.exposed = undefined;
      if (a.mode === 'underboss') {
        s.successionLaw = 'underboss';
        d.publicId = ub?.id;
        d.secretId = undefined;
        if (ub) passedOver(ctx, 'heir', ub.id, { public: true });
      } else if (a.mode === 'named' || a.mode === 'unwritten') {
        s.successionLaw = 'appointed';
        s.designatedHeirId = a.charId;
        d.publicId = a.mode === 'named' ? a.charId : undefined;
        d.secretId = a.mode === 'unwritten' ? a.charId : undefined;
        if (a.charId) passedOver(ctx, 'heir', a.charId, { public: a.mode === 'named' });
      } else if (a.mode === 'private') {
        s.successionLaw = 'appointed';
        s.designatedHeirId = a.charId;
        d.publicId = ub?.id;
        d.secretId = a.charId;
      } else if (a.mode === 'multiple' || a.mode === 'committee') {
        s.successionLaw = 'capos_elect';
        d.publicId = undefined;
        d.secretId = undefined;
      } else {
        s.successionLaw = 'blood';
        d.publicId = undefined;
        d.secretId = undefined;
      }
      // The vacancy detector should not fire a second time for this.
      p.posts.heir = s.successionLaw === 'appointed' && d.mode !== 'private' && s.designatedHeirId ? s.designatedHeirId : p.posts.heir;
      if (d.mode === 'private' && p.posts.heir) delete p.posts.heir;
      break;
    }
    case 'groom':
      p.designation.grooming = { charId: a.charId, path: a.path, since: s.week };
      break;
    case 'stopGrooming':
      p.designation.grooming = undefined;
      break;
    case 'place': {
      const post = POSTS[a.post];
      const mentor = post?.mentorSeat ? holder(s, post.mentorSeat) : undefined;
      p.placements[a.charId] = { post: a.post, since: s.week, mentorId: mentor?.id };
      addStory(s, s.characters[a.charId], `Placed to learn: ${post?.name.toLowerCase()}${mentor ? ` under ${mentor.firstName} ${mentor.lastName}` : ''}.`);
      break;
    }
    case 'unplace':
      delete p.placements[a.charId];
      break;
    case 'read': {
      const c = s.characters[a.charId];
      if (c) {
        const am = ambitionOf(s, c);
        am.revealed = true;
        am.log.push({ week: s.week, text: `You learned what he wants: he ${WANT_TEXT[am.want]}.` });
      }
      break;
    }
    case 'announce':
      p.announce = a.mode;
      break;
    case 'prep':
      p.prep[a.kind] = Math.min(MAX_PREP, p.prep[a.kind] + 1);
      break;
    case 'blitz': {
      const odds = blitzOdds(s, a.rival);
      const surprise = !crew(s).some((c) => c.informantFor === a.rival);
      launchBlitz(ctx, 'player', a.rival, Math.round(30 + odds.chance * 50), surprise, odds.chance);
      break;
    }
    case 'mattresses':
      p.mattresses = a.on ? s.week : undefined;
      break;
    case 'bodyguards':
      p.bodyguards = a.on ? s.week : undefined;
      break;
    case 'front': {
      const c = s.characters[a.charId];
      if (c) installFront(ctx, c, a.type);
      break;
    }
    case 'endFront': {
      const c = p.front ? s.characters[p.front.figureheadId] : undefined;
      endFront(ctx, 'you took the title back');
      if (c?.alive) addOpinion(s, c.id, boss.id, 'Took the title away', -10, 1);
      break;
    }
    case 'consult':
      if (p.front) {
        p.front.suspicion = Math.max(0, p.front.suspicion - 15);
        p.front.authority = Math.min(100, p.front.authority + 5);
        p.front.influence = Math.max(0, p.front.influence - 3);
      }
      break;
    case 'low':
      commitLow(ctx, a.a);
      break;
    case 'climb':
      if (!(s.power?.above && inTheRanks(s))) climb(ctx);
      break;
    case 'takeover':
      takeover(ctx, chance(p, takeoverOdds(s).chance));
      break;
    case 'shadow':
      commitShadow(ctx, a.a);
      break;
    case 'audience': {
      s.flags.pwr_court = s.week;
      const ev = audienceWeek(s, true);
      if (ev) s.eventQueue.push(ev);
      break;
    }
    default:
      break;
  }
}

/** Orders for the headless player (some disabled; the sim filters). */
export function powerActions(s: GameState): PlayerAction[] {
  const out: PlayerAction[] = [];
  const p = s.power;
  const w = s.week;
  const house = Object.values(s.characters).filter((c) => c.alive && c.dynasty && c.id !== s.playerId && ageOn(c.birth, s.date) >= 18);
  const pickOf = <T,>(xs: T[]) => (xs.length ? xs[w % xs.length] : undefined);
  const heir = pickOf(house);
  const modes = ['underboss', 'named', 'private', 'unwritten', 'committee', 'none'] as const;
  out.push({ kind: 'power', op: { op: 'designate', mode: modes[w % modes.length], charId: heir?.id } });
  if (heir) out.push({ kind: 'power', op: { op: 'groom', charId: heir.id, path: (['restaurant', 'college', 'consigliere', 'charity', 'properties', 'legit', 'lawschool', 'political'] as const)[w % 8] } });
  const man = pickOf(crew(s).filter((c) => c.rank === 'soldier' || c.rank === 'associate'));
  if (man) out.push({ kind: 'power', op: { op: 'place', charId: man.id, post: (['hotel', 'consigliere', 'street', 'books', 'cityhall'] as const)[w % 5] } });
  const cand = pickOf(successionCandidates(s));
  if (cand) {
    out.push({ kind: 'power', op: { op: 'read', charId: cand.id } });
    if (w % 7 === 0) out.push({ kind: 'power', op: { op: 'promise', charId: cand.id, years: 3 } });
  }
  const g = pickOf((p?.grievances ?? []).filter((x) => x.status === 'open'));
  if (g) out.push({ kind: 'power', op: { op: 'amends', grievanceId: g.id, kind: (['money', 'apology', 'share'] as const)[w % 3] } });
  out.push({ kind: 'power', op: { op: 'announce', mode: w % 2 ? 'public' : 'private' } });
  out.push({ kind: 'power', op: { op: 'prep', kind: (['intel', 'crews', 'safehouses'] as const)[w % 3] } });
  const r = pickOf(s.rivals.filter((x) => x.kind === 'mob'));
  if (r) out.push({ kind: 'power', op: { op: 'blitz', rival: r.id } });
  out.push({ kind: 'power', op: { op: 'mattresses', on: !p?.mattresses } });
  out.push({ kind: 'power', op: { op: 'bodyguards', on: !p?.bodyguards } });
  const elder = pickOf(crew(s).filter((c) => c.rank === 'capo' || c.rank === 'consigliere'));
  if (elder) out.push({ kind: 'power', op: { op: 'front', charId: elder.id, type: (['unaware', 'willing', 'elder'] as const)[w % 3] } });
  out.push({ kind: 'power', op: { op: 'endFront' } }, { kind: 'power', op: { op: 'consult' } }, { kind: 'power', op: { op: 'climb' } }, { kind: 'power', op: { op: 'takeover' } }, { kind: 'power', op: { op: 'audience' } });
  // A rotating handful a week, so the random player's menu stays balanced with the other orders.
  return [...out.filter((_, i) => (i + w) % 4 === 0), ...shadowActions(s)];
}

/** A successful coup may depose the boss instead of killing him (he plays on, lower down). */
export function deposeInsteadOfKill(ctx: Ctx, leaderId: string): boolean {
  const s = ctx.s;
  const p = pw(s);
  const leader = s.characters[leaderId];
  if (!leader?.alive || p.station !== 'boss' || p.crisis) return false;
  const pr = 0.45 + (viewAttrs(s, leader).v.conscience - 50) / 200;
  if (!chance(p, pr)) return false;
  depose(ctx, leader.id, 'a coup by his own capos');
  return true;
}

/** Everyone whose expanded attributes exist (for tests and the sheet). */
export function attrsCoverage(s: GameState): number {
  return trackedPeople(s).filter((c) => c.attrs).length;
}

export { ALL_ATTRS, depose, FACTION_NAMES, postLabel, buildFrontDiscovered };
