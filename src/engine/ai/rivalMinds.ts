import { displayName, player } from '../characters';
import { invested } from '../bossSkills';
import { opinion, getRelation } from '../relations';
import { hashSeed } from '../rng';
import { scoreMoves, type Candidate } from '../rivals';
import { rivalLean } from '../minds/planner';
import { mindOf } from '../minds/state';
import { PLAN_TEXT, GOAL_TEXT } from '../minds/types';
import { KIND_LABEL as THREAT_LABEL, whenText, type Threat } from '../threats';
import { clean } from '../minds/talk';
import { checkText } from './calls';
import type { DeskItem } from '../desk';
import type { FactionId, GameState, Rival, RivalId, RivalMove } from '../types';

/**
 * RIVALS THAT THINK: each rival boss's private thoughts, this week.
 *
 * What he wants, how he sees the boss, and what he means to do next, read
 * off the engine itself so it is TRUE: the move he leans toward is the top of
 * the very candidates rivals.ts scores each week (scoreMoves, weighed by his
 * mind in rivalLean), with its share of the weighted pick; the moves he has
 * already set in motion against the boss's people are the threats on the
 * board (threats.ts) that are his. Nothing here changes what he does.
 *
 * The boss only sees it with a way in: a spy of his inside that family, a
 * man of theirs informing for him, an Ear the boss knows who is close to the
 * man, or a sharp enough nose for intrigue (the skill, or the man himself).
 * Otherwise: "You don't know what he is thinking."
 *
 * The page may ask Claude to voice the note (≤ 60 words) from the brief; the
 * validator is the calls' one (names in the brief only, no numbers, the cap).
 * A plan aimed at the boss also shows on the Desk ("Heard: …") before it lands.
 */

export const THOUGHT_MAX_WORDS = 60;
/** The boss's own nose: intrigue this high (the man), or this many points put into the skill. */
export const NOSE_ATTR = 75;
export const NOSE_POINTS = 6;

export const MOVE_WORDS: Record<RivalMove, string> = {
  expand: 'push into ground that isn\'t his',
  ally: 'make friends with',
  strike: 'hit',
  offer_deal: 'offer a deal to',
  hide: 'lie low',
  bribe: 'spread money around City Hall',
  inform: 'feed the law a story about',
};

const GOAL_WORDS: Record<Rival['goal'], string> = {
  conquer: 'to take the island', enrich: 'to get richer', revenge: 'to get even', legitimacy: 'to look respectable', survive: 'to survive', squeeze: 'to squeeze everyone', headline: 'to make the papers',
};

export interface MindAccess { ok: boolean; via?: string; why?: string }

/** Has the boss a way into this man's head? (the first one found) Pure. */
export function mindAccess(s: GameState, rid: RivalId): MindAccess {
  const r = s.rivals.find((x) => x.id === rid);
  const c = r ? s.characters[r.leaderId] : undefined;
  if (!r || !c?.alive) return { ok: false, why: 'Nobody is running that family' };
  const spy = (s.intrigue?.spies ?? []).find((x) => x.master === 'player' && x.inside === rid && !x.ended && s.characters[x.charId]?.alive);
  if (spy) return { ok: true, via: `${s.characters[spy.charId].firstName}, your man inside` };
  const rat = Object.values(s.characters).find((x) => x.alive && x.faction === rid && x.informantFor === 'player');
  if (rat) return { ok: true, via: `${rat.firstName}, who talks to you` };
  const E = s.ears;
  if (E) {
    const link = E.links.find((l) => l.a === c.id && !l.ended && E.ears[l.b]?.known && E.ears[l.b].status !== 'gone' && s.characters[l.b]?.alive);
    if (link) return { ok: true, via: `${s.characters[link.b].firstName}, who sees him` };
  }
  if (player(s).attributes.intrigue >= NOSE_ATTR || invested(s, 'intrigue') >= NOSE_POINTS) return { ok: true, via: 'your own nose for it' };
  return { ok: false, why: `You don't know what ${c.firstName} is thinking. Get someone close to him.` };
}

export interface RivalThought {
  rival: RivalId;
  leaderId: string;
  name: string;
  family: string;
  /** The move he leans toward, and at whom; his share of the week's pick (0..1). */
  move?: RivalMove;
  target?: FactionId;
  share: number;
  /** What he has already set in motion against the boss's people (threats.ts). */
  plots: Threat[];
  /** The plan or the move is aimed at the boss. */
  aimsAtYou: boolean;
  opinion: number;
  brief: string[];
  names: string[];
  /** The templated note (the fallback). */
  line: string;
}

/** The candidates rivals.ts would weigh for him now, his mind's lean on them; sorted, best first. Pure. */
export function leaning(s: GameState, r: Rival): Candidate[] {
  const cands = scoreMoves(s, r).map((c) => ({ ...c }));
  rivalLean(s, r, cands);
  return cands.sort((a, b) => b.score - a.score);
}

const targetName = (s: GameState, t: FactionId | undefined): string => t === 'player' ? 'you' : s.rivals.find((x) => x.id === t)?.name ?? 'nobody';

function shareOf(s: GameState, r: Rival, cands: Candidate[]): number {
  if (!cands.length) return 0;
  const g = s.characters[r.leaderId]?.traits.includes('Gambler') ? 1 : 2;
  const tot = cands.reduce((a, c) => a + Math.pow(c.score, g), 0);
  return tot > 0 ? Math.pow(cands[0].score, g) / tot : 0;
}

/** His thoughts this week, from the engine's own numbers. Pure (does not check access). */
export function rivalThought(s: GameState, rid: RivalId): RivalThought | undefined {
  const r = s.rivals.find((x) => x.id === rid);
  const c = r ? s.characters[r.leaderId] : undefined;
  if (!r || !c?.alive || r.kind === 'law') return undefined;
  const cands = leaning(s, r);
  const top = cands[0];
  const share = shareOf(s, r, cands);
  const plots = (s.threats?.threats ?? []).filter((t) => t.by === rid && t.due >= s.week && !t.live);
  const op = opinion(s, c.id, s.playerId);
  const g = getRelation(s, c.id, s.playerId)?.grievance ?? 0;
  const m = mindOf(s, c.id);
  const boss = player(s);
  const aims = plots.length > 0 || (!!top && top.target === 'player' && (top.move === 'strike' || top.move === 'expand' || top.move === 'inform'));
  const brief: string[] = [
    `He is ${displayName(c)}, boss of ${r.name} (${c.traits.slice(0, 3).join(', ') || 'no notable traits'}). These are his private thoughts, in his own head, about the boss ${displayName(boss)}.`,
    `What he wants: ${GOAL_WORDS[r.goal]}${m?.goals[0] ? `; right now, ${GOAL_TEXT[m.goals[0].k]}` : ''}.`,
    `How he sees the boss: ${op >= 40 ? 'a friend' : op >= 10 ? 'a man he can do business with' : op > -20 ? 'a man to watch' : op > -50 ? 'a problem' : 'an enemy'}${g >= 30 ? ', and he holds a grudge' : ''}.`,
  ];
  if (m?.plan) brief.push(`His long plan: ${PLAN_TEXT[m.plan.k].split(':')[0].toLowerCase()}${m.plan.t === s.playerId ? ', against the boss' : ''}.`);
  if (top) brief.push(`What he means to do next: ${MOVE_WORDS[top.move]}${top.move === 'hide' || top.move === 'bribe' ? '' : ` ${top.target === 'player' ? 'the boss' : targetName(s, top.target)}`} (${share >= 0.5 ? 'he has made up his mind' : share >= 0.25 ? 'he leans that way' : 'he is turning it over'}).`);
  for (const t of plots.slice(0, 2)) brief.push(`Already set in motion: ${THREAT_LABEL[t.kind].toLowerCase()}${t.targetId && s.characters[t.targetId] ? ` against ${t.targetId === s.playerId ? 'the boss himself' : s.characters[t.targetId].firstName}` : ''}${t.due === s.week ? ` this week${t.dueDay !== undefined ? ` (${whenText(t.dueDay, t.hour)})` : ''}` : `, in ${t.due - s.week} week${t.due - s.week === 1 ? '' : 's'}`}.`);
  const names = [c.firstName, c.lastName, c.nickname, boss.firstName, boss.lastName, ...plots.map((t) => (t.targetId ? s.characters[t.targetId]?.firstName : undefined))].filter((x): x is string => !!x);
  const th: RivalThought = { rival: rid, leaderId: c.id, name: displayName(c), family: r.name, ...(top ? { move: top.move, target: top.target } : {}), share, plots, aimsAtYou: aims, opinion: op, brief, names, line: '' };
  th.line = thoughtLine(s, th);
  return th;
}

/** The templated note (deterministic). */
export function thoughtLine(s: GameState, t: RivalThought): string {
  const boss = player(s).firstName;
  const plot = t.plots[0];
  if (plot) {
    const who = plot.targetId === s.playerId ? boss : plot.targetId ? s.characters[plot.targetId]?.firstName ?? 'his man' : 'his people';
    return `It's in motion. ${THREAT_LABEL[plot.kind]}, ${plot.due === s.week ? 'this week' : 'soon'}, and ${who} won't see it coming. ${t.opinion < 0 ? `${boss} had this coming.` : 'Nothing personal. Business.'}`;
  }
  const v = hashSeed(`${s.seed}|${s.week}|${t.rival}`) % 2;
  const tgt = t.target === 'player' ? boss : t.target ? s.rivals.find((x) => x.id === t.target)?.shortName ?? 'them' : 'them';
  switch (t.move) {
    case 'strike': return v ? `${tgt} is getting comfortable. Comfortable men get careless. Time to remind ${t.target === 'player' ? 'him' : 'them'} who else lives on this island.` : `Enough talk. ${tgt} needs to feel it.`;
    case 'expand': return v ? `${tgt} has more ground than ${t.target === 'player' ? 'he' : 'they'} can hold. I'll take a corner and see who complains.` : `A block here, a bar there. ${tgt} won't miss it until it's gone.`;
    case 'inform': return `Let the law look at ${tgt} for a while. A quiet word in the right ear costs me nothing.`;
    case 'ally': return t.target === 'player' ? `${boss} could be useful. A friendly word now, a deal later.` : `${tgt} and I should be friends. For now.`;
    case 'offer_deal': return `There's money in it for both of us. ${tgt === boss ? boss : tgt} will see sense.`;
    case 'hide': return 'Too many eyes on me. Keep the head down, let the others make noise.';
    case 'bribe': return 'City Hall is for sale. I mean to own a piece before anybody else does.';
    default: return 'Wait and watch. The island always shows you where the weak spot is.';
  }
}

/** What the boss can see: the thought when he has a way in, else why not. Pure. */
export function seenThought(s: GameState, rid: RivalId): { access: MindAccess; thought?: RivalThought } {
  const access = mindAccess(s, rid);
  return access.ok ? { access, thought: rivalThought(s, rid) } : { access };
}

/* ------------------------------------------------------------------ */
/* Claude                                                              */
/* ------------------------------------------------------------------ */

const RULES = `You voice the private thoughts of one man in "Little Las Vegas", a fictional crime drama set in Wildwood, New Jersey, around 1960 (everyone is invented). Write his inner voice, first person, as he sits alone this week.
Rules:
- Write ONLY from the FACTS below. Keep what he plans exactly as given; invent no events, people or places. The only names you may use are: {NAMES}.
- Period voice, early-1960s Jersey Shore: clipped, cold or warm as he feels. No modern words.
- At most 60 words. No numbers, no dollar amounts, no dates.
- Violence only implied. Never give real-world instructions for any crime.
Answer with ONLY a JSON object: {"thought": "..."}`;

export function thoughtPrompt(t: RivalThought): { role: 'user'; content: string }[] {
  return [{ role: 'user', content: `${RULES.replace('{NAMES}', t.names.join(', '))}\n\nFACTS:\n${t.brief.map((b) => `- ${b}`).join('\n')}` }];
}

export function checkThought(s: GameState, t: RivalThought, raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const x = (raw as Record<string, unknown>).thought;
  return typeof x === 'string' ? checkText(s, t, clean(x, 600), THOUGHT_MAX_WORDS) : undefined;
}

/* ------------------------------------------------------------------ */
/* The Desk: "Heard: …"                                                */
/* ------------------------------------------------------------------ */

/** A move aimed at the boss, heard through his way in, before it lands. Pure. */
export function heardOnDesk(s: GameState): DeskItem[] {
  const out: DeskItem[] = [];
  for (const r of s.rivals) {
    if (r.kind === 'law') continue;
    const { access, thought } = seenThought(s, r.id);
    if (!access.ok || !thought?.aimsAtYou) continue;
    const plot = thought.plots[0];
    const what = plot
      ? `${THREAT_LABEL[plot.kind].toLowerCase()}${plot.targetId && s.characters[plot.targetId] ? ` on ${plot.targetId === s.playerId ? 'you' : s.characters[plot.targetId].firstName}` : ''}, ${plot.due === s.week ? 'this week' : `in ${plot.due - s.week} weeks`}`
      : `means to ${MOVE_WORDS[thought.move!]} you`;
    out.push({
      key: `heard:${r.id}`, kind: 'upcoming', title: `Heard: ${s.characters[r.leaderId].firstName} ${plot ? 'has set up' : ''} ${what}`.replace(/\s+/g, ' '),
      detail: `Through ${access.via}. ${thought.line}`, urgent: true, ref: { charId: r.leaderId },
    });
  }
  return out;
}
