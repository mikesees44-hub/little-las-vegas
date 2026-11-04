import { ageOn } from './calendar';
import { crew, displayName, isFree, player } from './characters';
import { attr } from './attrs';
import { activeTask } from './council';
import { killCharacter } from './dynasty';
import { shiftInfluence } from './effects';
import { addStory } from './hierarchy';
import type { Acceptance, Reason } from './interactions';
import { money, respect, heat, type Ctx } from './ledger';
import { addOpinion, opinion } from './relations';
import { chance } from './rng';
import { pw, type Blitz } from './powerState';
import { protectionFor } from './protect';
import { playerMuscle } from './war';
import { FACTION_NAMES } from './world';
import type { Character, EventInstance, FactionId, GameState, Rival, RivalId } from './types';
import { knobs } from './difficulty';
import { spareFromWars } from './rankView';

/** A blitz kills the boss only on a second strike within this many weeks of the first (which wounds). */
export const BOSS_SECOND_STRIKE = 8;

/**
 * BLITZ — "going to the mattresses" (design item 2).
 *
 * Any family can launch a coordinated chain of hits on another family's
 * leadership: a capo, another capo, the consigliere, the underboss, then the
 * boss (and the heir, if the boss falls). One hit a week. Every hit raises
 * or lowers the attacker's momentum; at zero the chain stops. Good moves —
 * the mattresses, bodyguards, an informant's warning, hitting back at their
 * boss, the Table — stop it; bad ones let it run.
 *
 * Killing a made man without the Table's consent makes you a legitimate
 * target: his family may blitz you, and nobody at the Table will object.
 */

export const PREP_INFO = {
  intel: { name: 'Intel on their routines', text: 'Where they eat, who drives them, when they are alone.', cost: 1500 },
  crews: { name: 'Hit crews ready', text: 'Two-man teams, clean cars, men from out of town.', cost: 2500 },
  safehouses: { name: 'Safehouses stocked', text: 'Mattresses, canned food, a phone nobody knows.', cost: 1200 },
} as const;
export const MAX_PREP = 3;
export const BODYGUARD_WEEKLY = 150;

/* ---------------- Balance of power ---------------- */

export interface PowerBalance {
  id: FactionId;
  name: string;
  muscle: number;
  money: number;
  men: number;
  allies: number;
  heat: number;
  total: number;
}

function rivalMen(s: GameState, id: RivalId): number {
  let n = 0;
  for (const k in s.characters) {
    const c = s.characters[k];
    if (c.alive && c.faction === id && c.rank !== 'civilian') n++;
  }
  return n;
}

/** One meter per family: muscle, money, men, allies, heat → a total (0-100). */
export function balanceOfPower(s: GameState): PowerBalance[] {
  const mob = s.rivals.filter((r) => r.kind === 'mob');
  const allyCount = (leaderId: string, others: string[]) => others.filter((o) => opinion(s, o, leaderId) >= 20).length;
  const leaders = mob.map((r) => r.leaderId);
  const me: PowerBalance = {
    id: 'player', name: FACTION_NAMES.player === 'Your crew' ? `The house of ${s.houseName}` : FACTION_NAMES.player,
    muscle: Math.round(playerMuscle(s)), money: Math.round(Math.max(0, Math.min(100, s.money / 2000))), men: crew(s).filter((c) => isFree(s, c)).length,
    allies: (s.dyn?.alliances.length ?? 0) + allyCount(s.playerId, leaders), heat: Math.round((s.heat.local + s.heat.family + s.heat.federal) / 3), total: 0,
  };
  const out: PowerBalance[] = [me];
  for (const r of mob) {
    out.push({ id: r.id, name: r.name, muscle: Math.round(r.muscle), money: Math.round(Math.max(0, Math.min(100, r.money / 2000))), men: rivalMen(s, r.id), allies: allyCount(r.leaderId, [s.playerId, ...leaders.filter((l) => l !== r.leaderId)]), heat: Math.round(r.exposure), total: 0 });
  }
  for (const b of out) b.total = Math.round(Math.max(0, Math.min(100, b.muscle * 0.45 + b.money * 0.2 + Math.min(30, b.men * 1.5) * 0.6 + b.allies * 4 - b.heat * 0.15)));
  return out;
}

/* ---------------- Targets ---------------- */

/** Who a blitz on the player goes after, in order. */
export function playerTargets(s: GameState): string[] {
  const caps = crew(s).filter((c) => c.rank === 'capo' && isFree(s, c)).sort((a, b) => b.attributes.leadership - a.attributes.leadership).slice(0, 3);
  const cons = s.council?.consigliere?.holderId ? s.characters[s.council.consigliere.holderId] : undefined;
  const ub = crew(s).find((c) => c.rank === 'underboss' && isFree(s, c));
  const out = [...caps.map((c) => c.id)];
  if (cons?.alive && cons.faction === 'player' && !out.includes(cons.id)) out.push(cons.id);
  if (ub && !out.includes(ub.id)) out.push(ub.id);
  out.push(s.playerId);
  return out.slice(-7);
}

/** A rival family's leadership, lieutenants first, the boss last. */
export function rivalTargets(s: GameState, r: Rival): string[] {
  const lts: Character[] = [];
  for (const k in s.characters) {
    const c = s.characters[k];
    if (c.alive && c.faction === r.id && c.id !== r.leaderId && (c.rank === 'capo' || c.rank === 'underboss' || c.rank === 'consigliere')) lts.push(c);
  }
  return [...lts.slice(0, 5).map((c) => c.id), r.leaderId];
}

export function activeBlitz(s: GameState, attacker?: FactionId, defender?: FactionId): Blitz | undefined {
  return s.power?.blitzes.find((b) => !b.stopped && (!attacker || b.attacker === attacker) && (!defender || b.defender === defender));
}

/* ---------------- The player's blitz ---------------- */

/** The odds the player's blitz takes the whole leadership, with reasons. */
export function blitzOdds(s: GameState, rivalId: RivalId): Acceptance {
  const p = s.power;
  const r = s.rivals.find((x) => x.id === rivalId);
  const reasons: Reason[] = [];
  const add = (label: string, value: number) => { if (Math.round(value)) reasons.push({ label, value: Math.round(value) }); };
  add('Base', 20);
  const prep = p?.prep ?? { intel: 0, crews: 0, safehouses: 0 };
  add('Intel on their routines', prep.intel * 7);
  add('Hit crews ready', prep.crews * 8);
  add('Safehouses stocked', prep.safehouses * 3);
  if (r) add('Your muscle against theirs', (playerMuscle(s) - r.muscle) * 0.4);
  const leak = crew(s).some((c) => c.informantFor === rivalId);
  add(leak ? 'Somebody in your crew talks to them: no surprise' : 'Surprise', leak ? -15 : 12);
  if (r && (p?.warned[r.id] ?? 0) >= s.week) add('They expect it', -15);
  if (s.heat.federal > 60) add('The FBI is watching everyone', -8);
  const chance = Math.max(0.05, Math.min(0.9, reasons.reduce((a, x) => a + x.value, 0) / 100));
  return { chance, reasons };
}

export function blitzDisabled(s: GameState, rivalId: RivalId): string | undefined {
  const r = s.rivals.find((x) => x.id === rivalId);
  if (!r || r.kind !== 'mob') return 'Only a crew can be blitzed';
  if (activeBlitz(s, 'player')) return 'Your men are already in the middle of one';
  if (activeBlitz(s, undefined, 'player')) return 'You are under attack yourself';
  const p = s.power?.prep ?? { intel: 0, crews: 0 };
  if (p.crews < 1) return 'Get hit crews ready first';
  if (crew(s).filter((c) => isFree(s, c) && c.rank !== 'associate').length < 4) return 'Not enough made men';
  return undefined;
}

export function launchBlitz(ctx: Ctx, attacker: FactionId, defender: FactionId, momentum: number, surprise: boolean, odds?: number): Blitz | undefined {
  const s = ctx.s;
  const p = pw(s);
  if (defender === 'player' && attacker !== 'player' && spareFromWars(s)) return undefined;
  const targets = defender === 'player' ? playerTargets(s) : rivalTargets(s, s.rivals.find((r) => r.id === defender)!);
  if (!targets.length) return undefined;
  const b: Blitz = { id: `bz${s.nextId++}`, attacker, defender, targets, idx: 0, momentum, surprise, start: s.week, kills: [], misses: [], odds };
  p.blitzes.push(b);
  p.stats.blitzes++;
  if (defender === 'player') p.stats.blitzesOnYou++;
  const an = attacker === 'player' ? 'You' : FACTION_NAMES[attacker];
  const dn = defender === 'player' ? 'your family' : FACTION_NAMES[defender];
  ctx.log.push(`${an} went to the mattresses against ${dn}: ${targets.length} names on the list.`);
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: `A blitz: ${an} moved on the leadership of ${dn}.`, kind: 'rival' });
  if (attacker === 'player') {
    p.prep = { intel: 0, crews: 0, safehouses: Math.max(0, p.prep.safehouses - 1) };
    const r = s.rivals.find((x) => x.id === defender);
    // Unsanctioned: Philadelphia is not asked.
    if (r) {
      const philly = s.rivals.find((x) => x.id === 'philly');
      if (philly) addOpinion(s, philly.leaderId, s.playerId, 'Went to war without asking the Table', -15, 1);
      heat(ctx, 'family', 6, 'Blitz: Philadelphia was not asked', 'event');
    }
  }
  return b;
}

/** Weeks of quiet after a blitz on the family ends (the attacker waits twice as long). */
export const BLITZ_COOLDOWN = 26;

/** The boss or his blood (`strict`: only the blood a blitz already took counts). */
function isBlood(s: GameState, c: Character | undefined, strict = false): boolean {
  if (!c) return false;
  return !!c.dynasty || (!strict && c.id === s.playerId) || (strict && c.rank === 'boss');
}

/** Defense against a hit on `target` this week (0-0.7). */
function defense(s: GameState, b: Blitz, target: Character): number {
  const p = s.power;
  let d = 0;
  if (b.defender === 'player') {
    if (p?.mattresses) d += 0.25;
    if (p?.bodyguards && (target.id === s.playerId || target.dynasty)) d += 0.2;
    if (target.id === s.playerId && activeTask(s, 'ub_guard')) d += 0.2;
    if (activeTask(s, 'enf_protect')) d += 0.05;
    if ((p?.warned[b.attacker] ?? 0) >= s.week) d += 0.1;
    if ((b.shield ?? 0) >= s.week) d += 0.3;
    // The blood is moved somewhere safe the moment a blitz starts (playtest #4): heirs are hard to find.
    if (target.dynasty && target.id !== s.playerId) d += 0.2;
  } else {
    // A rival family that sees it coming digs in.
    if (!b.surprise) d += 0.15;
  }
  d += Math.max(0, attr(s, target, 'survival') - 50) / 200;
  // Assigned guards (protect.ts), on either side: a share, never immunity.
  d += protectionFor(s, target.id).cut * 0.5;
  return Math.min(0.7, d);
}

/** One step of a blitz: the next name on the list. Returns an event for the player when he is the target. */
export function blitzStep(ctx: Ctx, b: Blitz): void {
  const s = ctx.s;
  if (b.stopped) return;
  // Skip names who are already gone.
  while (b.idx < b.targets.length && !s.characters[b.targets[b.idx]]?.alive) b.idx++;
  // The heir becomes the last target when the boss falls.
  if (b.idx >= b.targets.length) {
    b.stopped = b.kills.length >= b.targets.length - 1 ? 'The list is finished.' : 'Nobody left on the list.';
    finish(ctx, b);
    return;
  }
  const t = s.characters[b.targets[b.idx]];
  // At most one of the blood per blitz on your family: once one has fallen, the rest are in hiding.
  if (b.defender === 'player' && isBlood(s, t) && b.kills.some((id) => isBlood(s, s.characters[id], true))) {
    b.misses.push(t.id);
    ctx.log.push(`Blitz, hit ${b.idx + 1} of ${b.targets.length}: ${displayName(t)} is in hiding; they cannot find him.`);
    b.idx++;
    if (b.idx >= b.targets.length) { b.stopped = 'The list ran out: the family went to ground.'; finish(ctx, b); }
    return;
  }
  const base = b.attacker === 'player' ? 0.35 + (b.odds ?? 0.4) * 0.5 : 0.5;
  let pHit = Math.max(0.08, Math.min(0.9, base + b.momentum / 250 + (b.surprise && b.idx === 0 ? 0.15 : 0) - defense(s, b, t)));
  const p = pw(s);
  const onBoss = b.defender === 'player' && t.id === s.playerId;
  if (onBoss) pHit = Math.min(0.9, pHit * knobs(s).battleDeath);
  const an = b.attacker === 'player' ? 'your crews' : FACTION_NAMES[b.attacker];
  // The first hit that reaches the boss wounds him; only a second strike within 8 weeks kills (DECADE_BALANCE Top 10 #3).
  const landed = chance(p, pHit);
  if (landed && onBoss && s.week - (p.bossStruck ?? -999) > BOSS_SECOND_STRIKE) {
    p.bossStruck = s.week;
    t.health = Math.max(10, t.health - 40);
    b.misses.push(t.id);
    const hit = `Blitz, hit ${b.idx + 1} of ${b.targets.length}: they reached ${displayName(t)}. He was hit and lives; the next time they may not miss.`;
    ctx.log.push(hit);
    s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${FACTION_NAMES[b.attacker]} reached the boss. ${t.firstName} was hit and lived.`, kind: 'rival' });
    b.idx++;
    if (b.idx >= b.targets.length) { b.stopped = 'The list ran out: the boss was hit and the family went to ground.'; finish(ctx, b); }
    return;
  }
  if (landed) {
    const cause = b.attacker === 'player' ? 'killed in your blitz' : `killed in the ${FACTION_NAMES[b.attacker]} blitz`;
    const wasBoss = t.id === s.playerId;
    killCharacter(ctx, t.id, cause, b.attacker);
    b.kills.push(t.id);
    b.momentum = Math.min(100, b.momentum + 10);
    ctx.log.push(`Blitz, hit ${b.idx + 1} of ${b.targets.length}: ${displayName(t)} is dead (${an}).`);
    if (wasBoss && !s.gameOver && b.defender === 'player') {
      // They took the head. The family closes ranks around the new boss: to the mattresses, the heir
      // hidden. A blitz never wipes the dynasty in one wave (playtest #4: seven bosses in a row).
      p.mattresses = p.mattresses ?? s.week;
      b.stopped = 'They took the boss. The family went to the mattresses around the new one.';
      finish(ctx, b);
      return;
    }
    if (b.attacker === 'player' && b.defender !== 'player') {
      const r = s.rivals.find((x) => x.id === b.defender);
      if (r) r.muscle = Math.max(0, r.muscle - 6);
    }
  } else {
    b.misses.push(t.id);
    b.momentum -= 20;
    addStory(s, t, `Survived an attempt on his life (${an}).`);
    ctx.log.push(`Blitz, hit ${b.idx + 1} of ${b.targets.length}: ${displayName(t)} got away.`);
  }
  b.idx++;
  if (b.momentum <= 0) {
    b.stopped = `The chain was broken at hit ${b.idx} of ${b.targets.length}.`;
    finish(ctx, b);
  } else if (b.idx >= b.targets.length) {
    b.stopped = 'The list is finished.';
    finish(ctx, b);
  }
}

function finish(ctx: Ctx, b: Blitz): void {
  const s = ctx.s;
  const won = b.kills.length >= Math.max(1, Math.ceil(b.targets.length * 0.6));
  const tookBoss = b.defender !== 'player' && b.kills.includes(b.targets[b.targets.length - 1]);
  if (b.attacker === 'player' && b.defender !== 'player') {
    const r = s.rivals.find((x) => x.id === b.defender);
    if (r && (won || tookBoss)) {
      r.muscle = Math.max(0, r.muscle - 20);
      r.money = Math.round(r.money * 0.7);
      for (const d of s.districts) {
        if ((d.influence[r.id] ?? 0) > 0) {
          const moved = -shiftInfluence(s, d.id, r.id, -10);
          shiftInfluence(s, d.id, 'player', moved);
        }
      }
      respect(ctx, 8, `Your blitz broke ${r.name}`, 'event');
      s.cutscenes.push({ key: 'succession', title: 'The new order', text: `${r.name} buries its leaders. In Wildwood, they kiss your ring now.`, week: s.week });
    } else if (r) {
      respect(ctx, -4, `Your blitz on ${r.name} fell short`, 'event');
      addOpinion(s, r.leaderId, s.playerId, 'Tried to wipe us out', -40, 0);
      r.feud = true;
    }
  } else if (b.defender === 'player') {
    if (!won) respect(ctx, 4, `You survived the ${FACTION_NAMES[b.attacker]} blitz`, 'event');
    // After a blitz on the family, the other families wait before trying again (and this one longer).
    s.flags.blitzQuietUntil = s.week + BLITZ_COOLDOWN;
    s.flags[`blitzAgain_${b.attacker}`] = s.week + BLITZ_COOLDOWN * 2;
  }
  ctx.log.push(`The blitz is over: ${b.stopped}`);
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: `The blitz ended (${b.kills.length} dead): ${b.stopped}`, kind: 'rival' });
}

/** The player cuts in: what is happening, and the moves that can stop it. */
export function buildBlitzCutIn(s: GameState, b: Blitz): EventInstance {
  const r = s.rivals.find((x) => x.id === b.attacker);
  const label = `The ${FACTION_NAMES[b.attacker]} blitz`;
  const next = s.characters[b.targets[b.idx]];
  const op = (move: 'mattresses' | 'hitback' | 'table' | 'hide' | 'payoff' | 'stand') => ({ type: 'power', op: { op: 'blitzMove', blitzId: b.id, move }, label }) as const;
  const dead = b.kills.map((id) => s.characters[id]?.firstName).filter(Boolean).join(', ');
  const pay = 4000 + b.kills.length * 2000;
  return {
    iid: `ev${s.nextId++}`, defId: 'power_blitz', week: s.week, mandatory: true, priority: 95,
    title: `They are hitting us — hit ${b.idx + 1} of ${b.targets.length}`,
    text: `${r?.name ?? 'Someone'} has gone to the mattresses against your family. ${dead ? `Already dead: ${dead}. ` : ''}Next on their list${next ? `: ${displayName(next)}` : ''}. Momentum is with them (${b.momentum}). Every move you make now decides whether the chain stops here.`,
    defaultChoiceId: 'mattresses', meta: { blitz: b.id, rival: b.attacker },
    actors: next ? [next.id] : undefined,
    choices: [
      { id: 'mattresses', label: 'Go to the mattresses', detail: 'Safehouses for the leadership. The corners go quiet: a quarter of the week\'s take is lost while it lasts.', because: 'took the family to the mattresses', effects: [op('mattresses')] },
      { id: 'hitback', label: `Hit back at ${r ? displayName(s.characters[r.leaderId]) : 'their boss'}`, detail: 'Cut off the head and the chain stops. Miss and it speeds up.', because: 'hit back at the head of the blitz', effects: [op('hitback'), { type: 'heat', bar: 'local', amount: 5, label }] },
      { id: 'table', label: 'Go to Philadelphia for a ceasefire', detail: 'The Table can stop it — if Philadelphia likes you more than them. A favor or $3,000.', because: 'asked the Table to stop the blitz', effects: [{ type: 'money', amount: -3000, label }, op('table')] },
      { id: 'hide', label: next ? `Hide ${next.firstName}` : 'Hide the next man', detail: 'He disappears for a week. The rest stay exposed.', because: `hid ${next?.firstName ?? 'the next man'} from the blitz`, effects: [op('hide')] },
      { id: 'payoff', label: `Pay them to stop (${'$' + pay.toLocaleString('en-US')})`, detail: 'Works on families who want money more than blood.', because: 'paid the blitz to stop', effects: [{ type: 'money', amount: -pay, label }, op('payoff'), { type: 'respect', amount: -5, label }] },
      { id: 'stand', label: 'Stand firm and do nothing different', detail: 'Pride. The list keeps going.', because: 'stood firm against the blitz', effects: [op('stand')] },
    ],
  };
}

/** Monthly: rival AI decides whether a blitz is worth it (goals, grudges, strength — and surprise for the weak). */
export function rivalBlitzMonth(ctx: Ctx): void {
  const s = ctx.s;
  const p = pw(s);
  if (activeBlitz(s) || spareFromWars(s)) return;
  if ((s.flags.blitzQuietUntil ?? 0) > s.week) return;
  const me = playerMuscle(s);
  for (const r of s.rivals.filter((x) => x.kind === 'mob')) {
    const leader = s.characters[r.leaderId];
    if (!leader?.alive) continue;
    if ((s.flags[`blitzAgain_${r.id}`] ?? 0) > s.week) continue;
    const legit = (p.legit[r.id] ?? 0) >= s.week;
    if (s.week < 40 && !legit) continue;
    let score = 0;
    if (r.feud) score += 30;
    if (r.war) score += 20;
    if (legit) score += 45;
    const op = opinion(s, r.leaderId, s.playerId);
    if (op < -30) score += 15;
    if (r.goal === 'conquer' || r.goal === 'revenge') score += 10;
    const ratio = r.muscle / Math.max(10, me);
    const strong = ratio >= 0.8;
    if (!strong) score *= 0.25; // a weaker family needs surprise
    if (ageOn(leader.birth, s.date) > 65) score *= 0.6;
    const pr = (score / 100) * (strong ? 0.07 : 0.03) * knobs(s).aggression;
    if (score < 25 || !chance(p, pr)) continue;
    const surprise = (p.warned[r.id] ?? 0) < s.week;
    const b = launchBlitz(ctx, r.id, 'player', strong ? 40 + Math.round(ratio * 10) : 30, surprise);
    if (b) {
      if (!surprise) ctx.log.push(`Your informant was right: ${r.name} is moving.`);
      break;
    }
  }
}

/** Weekly: an informant may warn you a blitz is coming (spends their surprise). */
export function informantWarnings(ctx: Ctx): void {
  const s = ctx.s;
  const p = pw(s);
  for (const r of s.rivals.filter((x) => x.kind === 'mob')) {
    const ours = Object.values(s.characters).some((c) => c.alive && c.faction === r.id && c.informantFor === 'player');
    if (!ours) continue;
    const legit = (p.legit[r.id] ?? 0) >= s.week;
    if ((r.feud || legit) && chance(p, 0.1)) {
      p.warned[r.id] = s.week + 8;
      ctx.log.push(`Your man inside ${r.name} says they are talking about mattresses.`);
    }
  }
}

/** Detect unsanctioned killings of made men: their family may now come for you. */
export function legitimacyCheck(ctx: Ctx, prevAlive: Set<string>): void {
  const s = ctx.s;
  const p = pw(s);
  for (const id of prevAlive) {
    const c = s.characters[id];
    if (!c || c.alive || c.death?.killer !== 'player') continue;
    const r = s.rivals.find((x) => x.id === c.faction && x.kind === 'mob');
    if (!r || c.rank === 'associate' || c.rank === 'civilian') continue;
    if ((s.sanctions[c.id] ?? 0) >= c.death.week || s.wars.some((w) => w.rival === r.id && w.sanctioned)) continue;
    if (activeBlitz(s, 'player', r.id)) continue;
    p.legit[r.id] = s.week + 52;
    ctx.log.push(`You killed a made man of ${r.name} without the Table's consent. They may come for you, and nobody will object.`);
  }
}

/** Weekly cost of the defenses (the one ledger). */
export function defenseCosts(ctx: Ctx): void {
  const s = ctx.s;
  const p = pw(s);
  if (p.mattresses) {
    const loss = Math.round(Math.max(0, ctx.gross) * 0.25);
    if (loss) money(ctx, -loss, 'The mattresses: the men sleep in safehouses and the corners go quiet', 'cost');
    if (!activeBlitz(s, undefined, 'player') && s.week - p.mattresses >= 6) {
      p.mattresses = undefined;
      ctx.log.push('The men come home from the mattresses.');
    }
  }
  if (p.bodyguards) {
    money(ctx, -BODYGUARD_WEEKLY, 'Bodyguards for the boss and the house', 'cost');
    // Hired by the season: they go home after six months unless someone is shooting.
    if (s.week - p.bodyguards >= 26 && !activeBlitz(s, undefined, 'player')) {
      p.bodyguards = undefined;
      ctx.log.push('The bodyguards\' six months are up; they go home.');
    }
  }
}

export function rivalName(s: GameState, id: FactionId): string {
  return s.rivals.find((r) => r.id === id)?.name ?? FACTION_NAMES[id];
}

export function bossOf(s: GameState): Character {
  return player(s);
}
