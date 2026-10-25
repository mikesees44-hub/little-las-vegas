import { ageOn } from './calendar';
import { crew, displayName, hasTrait, isFree, player } from './characters';
import { attr, viewAttrs } from './attrs';
import { addStory } from './hierarchy';
import { heat, money, type Ctx } from './ledger';
import { addOpinion, opinion } from './relations';
import { chance } from './rng';
import { pw, type FrontBoss, type FrontType } from './powerState';
import type { Character, EventInstance, Faction, GameState } from './types';

/**
 * PUPPET / FRONT BOSS (design item 17). The official Don and the shadow Don
 * are different people. Official authority and real influence are tracked
 * separately. The figurehead draws the heat — until the prosecutor or the
 * rivals see through it — and he may notice he is being bypassed; his
 * personality decides what he does about it.
 *
 * While the real boss is in prison an acting boss runs the street: two
 * centers of power. On release he may not want to give it back.
 */

export const FRONT_INFO: Record<FrontType, { name: string; text: string }> = {
  unaware: { name: 'Unaware figurehead', text: 'He thinks he runs the family. The capos come to you through the back door.' },
  willing: { name: 'Willing figurehead', text: 'He takes the money and the title and the cameras. You take the decisions.' },
  prison: { name: 'Acting boss (you are inside)', text: 'He runs the street while you send orders from prison. Will he give it back?' },
  elder: { name: 'Elder statesman', text: 'An old man everyone respects sits at the head of the table. You sit at his right hand.' },
  rebellious: { name: 'Rebellious figurehead', text: 'He was a front. Now he wants to be the boss.' },
};

export const FRONT_STIPEND = 200;

export function frontDisabled(s: GameState, c: Character | undefined, type: FrontType): string | undefined {
  if (!c?.alive || c.id === s.playerId) return 'Pick a living man of the family';
  if (s.power?.front) return 'There is already a front boss';
  if (c.faction !== 'player' || (c.rank === 'associate' || c.rank === 'civilian') && !c.dynasty) return 'He has to be a made man or of the house';
  if (!isFree(s, c)) return 'He is not free';
  const age = ageOn(c.birth, s.date);
  if (age < 30) return 'Nobody would believe a kid';
  if (type === 'elder' && age < 58) return 'An elder statesman must be an old man';
  if (type === 'unaware' && attr(s, c, 'awareness') >= 70) return 'He is too sharp to fool';
  return undefined;
}

export function installFront(ctx: Ctx, c: Character, type: FrontType): FrontBoss {
  const s = ctx.s;
  const p = pw(s);
  const f: FrontBoss = { figureheadId: c.id, type, since: s.week, authority: type === 'prison' ? 60 : 50, influence: type === 'prison' ? 50 : 80, suspicion: type === 'willing' || type === 'elder' ? 100 : 0, seenByLaw: 0, seenByRivals: 0 };
  p.front = f;
  p.stats.fronts++;
  addStory(s, c, type === 'prison' ? 'Became acting boss while the boss is inside.' : `Became the official boss of the family (${FRONT_INFO[type].name.toLowerCase()}).`);
  if (type !== 'unaware') addOpinion(s, c.id, s.playerId, type === 'prison' ? 'Trusted me with the family' : 'Gave me the title', 15, 1);
  ctx.log.push(`${displayName(c)} is now the official boss of the family. ${FRONT_INFO[type].text}`);
  return f;
}

export function endFront(ctx: Ctx, why: string): void {
  const s = ctx.s;
  const p = pw(s);
  const f = p.front;
  if (!f) return;
  const c = s.characters[f.figureheadId];
  p.front = undefined;
  if (c?.alive) addStory(s, c, `Stopped being the front boss: ${why}`);
  ctx.log.push(`The front is over: ${why}`);
}

/** How he takes it when he learns he is a puppet. */
export function frontReaction(s: GameState, c: Character): 'accept' | 'demand' | 'retire' | 'rally' {
  const x = viewAttrs(s, c).v;
  const age = ageOn(c.birth, s.date);
  if (hasTrait(c, 'Hot-headed') || hasTrait(c, 'Vengeful')) return 'rally';
  if (hasTrait(c, 'Cowardly') || age >= 72) return 'retire';
  if (hasTrait(c, 'Ambitious') || x.pride >= 62 || x.ambition >= 65) return 'demand';
  if (hasTrait(c, 'Loyal-to-a-fault') || hasTrait(c, 'Patient')) return 'accept';
  return x.pride >= 55 ? 'demand' : 'accept';
}

const REACTION_TEXT = {
  accept: 'He shrugs. "I always knew. I like the car." He will keep the title and his mouth shut — for now.',
  demand: 'He wants real authority: his own say over the capos, a seat when decisions are made, or he goes public with what he is.',
  retire: 'He wants out: Florida, his pension, and nobody\'s cameras.',
  rally: 'He is talking to the old capos — the ones who remember when bosses were bosses.',
};

/** Monthly: the front draws heat, the law and rivals look closer, the figurehead notices. */
export function frontMonth(ctx: Ctx): EventInstance | undefined {
  const s = ctx.s;
  const p = pw(s);
  const f = p.front;
  if (!f) return undefined;
  const c = s.characters[f.figureheadId];
  if (!c?.alive || c.faction !== 'player' || c.id === s.playerId) {
    endFront(ctx, c?.alive ? 'he left the family' : 'he died');
    return undefined;
  }
  const boss = player(s);
  // Heat goes to the official boss — until the law sees through it.
  if (f.seenByLaw < 100) {
    if (s.heat.federal > 0) heat(ctx, 'federal', -1, `The front boss, ${c.firstName}, draws the cameras`, 'heat');
    c.evidence = Math.min(100, (c.evidence ?? 0) + 2);
    boss.evidence = Math.max(0, (boss.evidence ?? 0) - 2);
  }
  const lawEye = s.legal && s.legal.stage !== 'quiet' ? 6 : 3;
  f.seenByLaw = Math.min(100, f.seenByLaw + lawEye + Math.round(f.influence / 40));
  f.seenByRivals = Math.min(100, f.seenByRivals + 2 + (s.rivals.some((r) => crew(s).some((m) => m.informantFor === r.id)) ? 6 : 0));
  if (f.seenByLaw >= 100 && !s.flags.front_seen_law) {
    s.flags.front_seen_law = s.week;
    boss.evidence = Math.min(100, (boss.evidence ?? 0) + 10);
    ctx.log.push(`The prosecutor's chart has a new name at the top: yours. The front boss fools nobody downtown any more.`);
  }
  if (f.type === 'willing') money(ctx, -FRONT_STIPEND * 4, `The front boss's stipend (${c.firstName})`, 'cost');
  // He notices being bypassed.
  if (f.type === 'unaware' && !f.discovered) {
    const friends = chance(p, 0.25) ? 8 : 0;
    f.suspicion = Math.min(100, f.suspicion + 5 + Math.max(0, attr(s, c, 'awareness') - 45) / 6 + friends + (f.influence > 70 ? 3 : 0));
    if (f.suspicion >= 100) return discover(ctx, f, c);
  }
  if ((f.type === 'willing' || f.type === 'elder') && !f.reaction && chance(p, (attr(s, c, 'ambition') - 40) / 600)) return discover(ctx, f, c);
  if (f.type === 'rebellious') {
    f.authority = Math.min(100, f.authority + 4);
    f.influence = Math.max(0, f.influence - 3);
  }
  return undefined;
}

export function discover(ctx: Ctx, f: FrontBoss, c: Character): EventInstance {
  const s = ctx.s;
  const p = pw(s);
  f.discovered = s.week;
  f.reaction = frontReaction(s, c);
  p.stats.discoveries++;
  addStory(s, c, 'Found out he was only the front.');
  if (f.type === 'unaware') addOpinion(s, c.id, s.playerId, 'Made a fool of me', -20, 1);
  if (f.reaction === 'rally') rally(ctx, c);
  return buildFrontDiscovered(s, f, c);
}

function rally(ctx: Ctx, c: Character): void {
  const s = ctx.s;
  const old = crew(s).filter((m) => m.id !== c.id && (m.rank === 'capo' || m.rank === 'soldier') && ageOn(m.birth, s.date) >= 45 && opinion(s, m.id, c.id) >= 0 && opinion(s, m.id, s.playerId) < 40);
  if (old.length && !s.factions.some((x) => x.leaderId === c.id)) {
    const f: Faction = { id: `f${s.nextId++}`, leaderId: c.id, memberIds: [c.id, ...old.slice(0, 3).map((m) => m.id)], demand: 'contracts', agenda: 'underboss', candidateId: c.id, since: s.week, stage: 0, stageWeek: s.week, name: 'the old capos' };
    s.factions.push(f);
    ctx.log.push(`${displayName(c)} is rallying the old capos.`);
  }
}

export function buildFrontDiscovered(s: GameState, f: FrontBoss, c: Character): EventInstance {
  const label = 'The front boss';
  const op = (reply: 'authority' | 'pay' | 'retire' | 'end' | 'remove' | 'ignore') => ({ type: 'power', op: { op: 'frontReply', reply }, label }) as const;
  const r = f.reaction ?? 'accept';
  return {
    iid: `ev${s.nextId++}`, defId: 'power_front', week: s.week, mandatory: true, priority: 84,
    title: `${c.firstName} knows he is the puppet`,
    text: `Meetings held without him, capos who look at the floor when he talks, a friend who finally told him he is a joke. ${displayName(c)} knows. ${REACTION_TEXT[r]}`,
    defaultChoiceId: r === 'accept' ? 'ignore' : r === 'retire' ? 'retire' : 'pay', meta: { who: c.id, reaction: r }, actors: [c.id],
    choices: [
      { id: 'authority', label: 'Give him real authority', detail: 'His say over the capos is real now. Your influence shrinks.', because: `gave ${c.firstName} real authority`, effects: [op('authority')] },
      { id: 'pay', label: 'Pay him to keep playing the part ($3,000)', detail: 'He becomes a willing front.', because: `paid ${c.firstName} to stay the front`, effects: [{ type: 'money', amount: -3000, label }, op('pay')] },
      { id: 'retire', label: 'Let him retire', detail: 'The arrangement ends; the cameras turn to you.', because: `let ${c.firstName} retire`, effects: [op('retire')] },
      { id: 'end', label: 'End it and take the title yourself', detail: 'You are the boss in name again.', because: 'ended the front and took the title', effects: [op('end'), { type: 'respect', amount: 2, label }] },
      { id: 'remove', label: 'Remove him', detail: 'Nobody laughs at the family twice.', because: `had ${c.firstName} removed`, effects: [op('remove'), { type: 'heat', bar: 'local', amount: 6, label }] },
      { id: 'ignore', label: 'Do nothing', detail: r === 'accept' ? 'He accepts it.' : 'He will not.', because: `ignored ${c.firstName}'s complaint`, effects: [op('ignore')] },
    ],
  };
}

/* ---------------- Two centers of power: the boss in prison ---------------- */

export function pickActing(s: GameState): Character | undefined {
  const ub = crew(s).find((c) => c.rank === 'underboss' && isFree(s, c));
  if (ub) return ub;
  return crew(s).filter((c) => c.rank === 'capo' && isFree(s, c)).sort((a, b) => b.attributes.leadership - a.attributes.leadership)[0];
}

/** Monthly while inside: an order from prison and an acting boss with his own ideas. */
export function buildPrisonOrder(s: GameState, acting: Character): EventInstance {
  const label = 'Orders from prison';
  const op = (reply: 'insist' | 'letrun' | 'replace') => ({ type: 'power', op: { op: 'prisonOrder', reply }, label }) as const;
  return {
    iid: `ev${s.nextId++}`, defId: 'power_prison', week: s.week, mandatory: false, priority: 58,
    title: 'Two centers of power',
    text: `Your lawyer carries the message out of the visiting room. On the street, ${displayName(acting)} is running things his own way — the capos go to him now, and he decides what reaches you.`,
    defaultChoiceId: 'letrun', meta: { who: acting.id }, actors: [acting.id],
    choices: [
      { id: 'insist', label: 'Insist: your orders, not his', detail: 'Your authority grows if he obeys. He may not.', because: `insisted ${acting.firstName} follow orders from prison`, effects: [op('insist')] },
      { id: 'letrun', label: 'Let him run it', detail: 'The street stays calm. He gets used to the chair.', because: `let ${acting.firstName} run the street`, effects: [op('letrun')] },
      { id: 'replace', label: 'Replace him as acting boss', detail: 'A message that you still decide. He will not like it.', because: `replaced ${acting.firstName} as acting boss`, effects: [op('replace')] },
    ],
  };
}

/** On release: does the acting boss hand it back? */
export function buildHandBack(s: GameState, acting: Character, authority: number): EventInstance {
  const willing = hasTrait(acting, 'Loyal-to-a-fault') || (authority < 55 && !hasTrait(acting, 'Ambitious'));
  const label = 'The handover';
  const op = (reply: 'thank' | 'force' | 'share') => ({ type: 'power', op: { op: 'handBack', reply }, label }) as const;
  return {
    iid: `ev${s.nextId++}`, defId: 'power_handback', week: s.week, mandatory: true, priority: 85,
    title: willing ? 'He hands you the keys' : 'He does not want to give it back',
    text: willing
      ? `${displayName(acting)} meets you at the prison gate with your coat. "It's yours. It was always yours."`
      : `${displayName(acting)} did not come to the prison gate. At the club, the capos stand when he walks in — not when you do. "Things changed while you were away."`,
    defaultChoiceId: willing ? 'thank' : 'share', meta: { who: acting.id, willing: willing ? 1 : 0 }, actors: [acting.id],
    choices: [
      { id: 'thank', label: willing ? 'Thank him, and take it back' : 'Take it back', detail: willing ? 'A good man. Reward him.' : 'He will remember how it ended.', because: `took the chair back from ${acting.firstName}`, effects: [op('thank')] },
      { id: 'share', label: 'Keep him close: make him underboss', detail: 'Shared power. Less trouble now.', because: `kept ${acting.firstName} close`, effects: [op('share')] },
      { id: 'force', label: 'Force him out', detail: 'Exile. His friends will notice.', because: `forced ${acting.firstName} out`, effects: [op('force'), { type: 'respect', amount: 2, label }] },
    ],
  };
}
