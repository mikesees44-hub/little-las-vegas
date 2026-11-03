import { settlesNow } from '../engine/deeds/now';
import { placeById } from '../engine/bizRacket';
import { previewAction, VIA_INFO, type ActionPreview } from '../engine/actions';
import { explainAction } from '../engine/advice';
import { CATALOG } from '../engine/catalog';
import { SEAT_INFO } from '../engine/council';
import { JOBS_BY_ID, targetName } from '../engine/dirtyWork';
import { fmtMoney } from '../engine/effects';
import { SCHEME_INFO } from '../engine/schemes';
import { TALKS, type TalkId } from '../engine/talks';
import type { GameState, PlayerAction } from '../engine/types';
import { verbOf } from './verbs';
import { settlesNow } from '../engine/deeds/now';

/**
 * WHAT AN ORDER MEANS, before the click: who acts, on whom, what it costs and
 * which account pays, when it happens, what is known to follow, and why it
 * can't be done ("Unavailable: already holds this office"). Read off the
 * same preview the order card uses. Pure (no React), so the tests read it.
 */
export interface ActionFacts {
  /** The specific button words: "Invite Donato to dinner — $150", "Discuss business with Sal". */
  button: string;
  /** Who carries it out. */
  actor: string;
  /** Who or what it is aimed at. */
  target?: string;
  /** "$2,000 from Family money" / "$150 from your pocket" / "Costs nothing". */
  cost: string;
  /** When it happens. */
  timing: string;
  /** What is known to follow (effects named by the preview, the odds, the worst risk). */
  consequences: string[];
  /** "Unavailable: …" when it can't be done. */
  unavailable?: string;
}

const first = (s: GameState, id?: string) => {
  const c = id ? s.characters[id] : undefined;
  return c ? (c.id === s.playerId ? 'yourself' : c.nickname ?? c.firstName) : undefined;
};

/** The talk menu as sentences with the man's name in them. */
const TALK_BUTTON: Record<TalkId, (n: string) => string> = {
  meeting: (n) => `Request a meeting with ${n}`,
  job: (n) => `Offer ${n} a job`,
  business: (n) => `Discuss business with ${n}`,
  partner: (n) => `Propose a partnership to ${n}`,
  advice: (n) => `Ask ${n} for advice`,
  grievance: (n) => `Hear out ${n}'s grievance`,
  social: (n) => `Take ${n} out for the evening`,
  negotiate: (n) => `Negotiate the conflict with ${n}`,
  succession: (n) => `Discuss the succession with ${n}`,
};

const INTERACT_BUTTON: Partial<Record<string, (n: string) => string>> = {
  dinner: (n) => `Invite ${n} to dinner`,
  gift_small: (n) => `Send ${n} a gift`,
  gift_large: (n) => `Send ${n} a big gift`,
  demand: (n) => `Demand money from ${n}`,
  threaten: (n) => `Threaten ${n}`,
  recruit: (n) => `Recruit ${n}`,
  favor: (n) => `Ask ${n} for a favor`,
  promote: (n) => `Promote ${n}`,
  demote: (n) => `Demote ${n}`,
  exile: (n) => `Send ${n} away`,
  make: (n) => `Have ${n} made`,
  whack: (n) => `Order the hit on ${n}`,
  bringIn: (n) => `Bring ${n} into the life`,
  bribe: (n) => `Bribe ${n}`,
  expose: (n) => `Expose ${n}`,
  court: (n) => `Court ${n}`,
  proposeMarriage: (n) => `Propose to ${n}`,
};

const withCost = (label: string, p: ActionPreview) => (p.cost > 0 && !label.includes('$') ? `${label} — ${fmtMoney(p.cost)}` : label);

/** The button's words: the order and its object, and the price when it has one. */
export function specificButton(s: GameState, a: PlayerAction, p: ActionPreview = previewAction(s, a)): string {
  if (p.verb) return p.verb;
  if (a.kind === 'talk' && a.op.t === 'ask') {
    const n = first(s, a.op.target) ?? 'him';
    return withCost(TALK_BUTTON[a.op.talk]?.(n) ?? TALKS[a.op.talk].label, p);
  }
  if (a.kind === 'interact') {
    const n = first(s, a.target) ?? 'him';
    const f = INTERACT_BUTTON[a.id];
    if (f) return withCost(f(n), p);
  }
  if (a.kind === 'deed') return withCost(p.title, p);
  if (a.kind === 'appoint') return `Appoint ${first(s, a.charId) ?? 'him'} ${SEAT_INFO[a.seat].name.toLowerCase()}`;
  if (a.kind === 'reassign') return `Move ${first(s, a.charId) ?? 'him'} to ${first(s, a.capoId) ?? 'another'}'s crew`;
  if (a.kind === 'contract') return `Set ${first(s, a.charId) ?? 'his'}'s cut to ${Math.round(a.keep * 100)}%`;
  return withCost(verbOf(a, p).verb, p);
}

function actorOf(s: GameState, a: PlayerAction): string {
  switch (a.kind) {
    case 'scheme': return a.agents.map((id) => first(s, id) ?? '?').join(' and ').replace(/^yourself$/, 'You');
    case 'dirty': return a.op.who === s.playerId ? 'You, personally' : first(s, a.op.who) ?? 'One of your men';
    case 'protect': return a.op.op === 'guard' ? a.op.who.map((id) => first(s, id) ?? '?').join(' and ') : a.op.op === 'investigate' ? first(s, a.op.who) ?? 'One of your men' : 'You';
    case 'work': return a.op.op === 'drop' ? 'You' : a.op.who === s.playerId ? 'You, personally' : first(s, a.op.who) ?? 'One of your men';
    case 'order': return a.via === 'direct' ? 'You, personally' : VIA_INFO[a.via].name.replace(/^Through /, 'Your ').replace(/^Your the /, 'The ');
    case 'econ':
      if (a.op.type === 'racket' && a.op.cmd.c === 'start') return a.op.cmd.runner ? `${first(s, a.op.cmd.runner)} runs it` : 'The best free man runs it';
      return 'Your people, on your word';
    case 'bones': return 'The man making his bones';
    default: return 'You';
  }
}

function targetOfAction(s: GameState, a: PlayerAction): string | undefined {
  const who = (id?: string) => { const c = id ? s.characters[id] : undefined; return c ? `${c.firstName} ${c.lastName}` : undefined; };
  switch (a.kind) {
    case 'interact': case 'deed': return who(a.target);
    case 'scheme': return a.targetId ? who(a.targetId) : a.opts.city ? a.opts.city : a.opts.heist ? `a ${a.opts.heist} job` : undefined;
    case 'talk': return a.op.t === 'ask' ? who(a.op.target) : undefined;
    case 'appoint': return `${who(a.charId)} as ${SEAT_INFO[a.seat].name.toLowerCase()}`;
    case 'contract': case 'reassign': case 'propose': case 'background': case 'policy': return who(a.charId);
    case 'buyBusiness': return `${CATALOG[a.biz].name} in ${s.districts.find((d) => d.id === a.district)?.name ?? a.district}`;
    case 'pushDistrict': return s.districts.find((d) => d.id === a.district)?.name;
    case 'dirty': return targetName(s, a.op.job, a.op.target) ?? JOBS_BY_ID[a.op.job]?.title;
    case 'work': return placeById(s, a.op.place)?.name;
    case 'protect': return a.op.op === 'guard' || a.op.op === 'investigate' ? (a.op.subject === s.playerId ? 'You' : who(a.op.subject)) : undefined;
    case 'econ':
      if (a.op.type === 'racket' && a.op.cmd.c === 'start') { const cmd = a.op.cmd; return `${CATALOG[cmd.kind].name}${cmd.district ? ` in ${s.districts.find((d) => d.id === cmd.district)?.name}` : ''}`; }
      return undefined;
    default: return undefined;
  }
}

function timingOf(s: GameState, a: PlayerAction, p: ActionPreview): string {
  if (settlesNow(s, a)) return 'Now: settled the moment you give it (the dice roll on the spot)';
  if (a.kind === 'scheme') return `Starts when you advance the week; ${SCHEME_INFO[a.scheme].name.toLowerCase()} takes several weeks (you can call it off)`;
  if (a.kind === 'order' && a.via !== 'direct') return 'Passed down this week, carried out next week';
  if (p.effects.some((e) => e.type === 'schedule' && e.key === 'delegated_order')) return 'Carried out next week';
  if (a.kind === 'contract' || a.kind === 'policy' || a.kind === 'edict') return 'From the next week on, every week, until you change it';
  return 'Lands when the week turns (you can cancel it until then)';
}

/** Everything the player should know before the click. Pure. */
export function actionFacts(s: GameState, a: PlayerAction, p: ActionPreview = previewAction(s, a)): ActionFacts {
  const pocket = p.pot === 'pocket';
  const cost = p.cost > 0 ? `${fmtMoney(p.cost)} from ${pocket ? a.fund === 'family' ? 'your pocket (the Family covers what it can\'t)' : 'your pocket' : 'Family money'}` : p.toPocket ? `${fmtMoney(Math.abs(p.toPocket))} ${p.toPocket > 0 ? 'into' : 'out of'} your pocket` : 'Costs nothing up front';
  const consequences: string[] = [];
  const ex = explainAction(s, a);
  for (const g of [...ex.gains, ...ex.costs, ...ex.changes].slice(0, 3)) consequences.push(`${g.text}${g.when !== 'now' ? ` (${g.when})` : ''}`);
  const odds = p.acceptance ?? p.odds;
  if (odds) consequences.push(`${p.acceptance ? 'Will accept' : 'Success'}: about ${Math.round(odds.chance * 100)}% (estimate)`);
  const worst = [...ex.risks].sort((x, y) => y.chance - x.chance)[0];
  if (worst) consequences.push(`Could happen: ${worst.text}`);
  return {
    button: specificButton(s, a, p),
    actor: actorOf(s, a),
    target: targetOfAction(s, a),
    cost,
    timing: timingOf(s, a, p),
    consequences,
    unavailable: p.disabledReason ? `Unavailable: ${p.disabledReason.charAt(0).toLowerCase()}${p.disabledReason.slice(1)}` : undefined,
  };
}
