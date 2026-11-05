import { ageOn } from '../calendar';
import { displayName, hasTrait, isFree, player } from '../characters';
import { awayReason, today } from '../days';
import { addOpinion, changeMeter, opinion } from '../relations';
import { hashSeed } from '../rng';
import { absDay, spendTime, timeBlock } from '../timeCost';
import type { GameState, PlayerAction } from '../types';
import { FACTION_NAMES } from '../world';
import { factText, nameOf, sureWord } from './beliefs';
import { remember } from './memory';
import { clamp, mindOf } from './state';
import { HEARD_CAP, type Mind, type MindsState } from './types';
import { mindView } from './view';

/**
 * SIT AND TALK. A free conversation with one of the people who matter.
 *
 * The page may ask Claude for his lines (the artifact's `sample` capability,
 * ui/minds/): the prompt carries the setting's rules, his persona (traits,
 * mood, needs, goals, what he believes about the boss, what he remembers of
 * him, the secrets he could tell given how far he trusts him) and the facts
 * of the game, and asks for one strict JSON object. The model NEVER changes
 * the game: everything it returns goes through `validateTalk` (bounded,
 * clamped, whitelisted) and only then through `applyTalk`, which applies the
 * few things a conversation can do: a little opinion and trust, his mood, a
 * memory, the secrets and rumors he chose to tell from the allowlist. When
 * Claude is not there (outside claude.ai, in tests, consent refused, an
 * error), `scriptedReply` answers from his mind instead. A talk costs the
 * boss about an hour; twelve exchanges a talk, five talks a day.
 */

export const TALK_TURNS = 12;
export const TALK_PER_DAY = 5;
export const TALK_HOURS = 1;
/** Most a talk can move his opinion of the boss, all exchanges together (the modifier's cap). */
export const TALK_OPINION_CAP = 12;
export const TALK_REASON = 'Sat and talked with you';
export const MAX_REPLY = 700;
export const MAX_SAY = 400;

export const INTENTS = ['agree', 'refuse', 'threaten', 'bargain', 'confess', 'deflect', 'ask_favor', 'warn', 'flatter', 'complain'] as const;
export type Intent = (typeof INTENTS)[number];
export const INTENT_TEXT: Record<Intent, string> = {
  agree: 'Agrees', refuse: 'Refuses', threaten: 'Threatens', bargain: 'Bargains', confess: 'Confesses', deflect: 'Deflects',
  ask_favor: 'Asks a favor', warn: 'Warns you', flatter: 'Flatters', complain: 'Complains',
};

export interface TalkOutcome {
  reply: string;
  mood: number;
  opinion: number;
  reveals: string[];
  lie: boolean;
  intent: Intent;
}

export interface TalkTurn { role: 'boss' | 'npc'; text: string; out?: TalkOutcome }

/** The order a talk is booked as on the boss's clock (timeCost.ts: `mind:talk`, an hour). Not a queued order. */
export const TALK_ACTION = { kind: 'mind', op: 'talk' } as unknown as PlayerAction;

/* ------------------------------------------------------------------ */
/* Who can talk                                                        */
/* ------------------------------------------------------------------ */

export function talksToday(s: GameState): number {
  const t = s.minds?.talk;
  return t && t.d === absDay(s) ? t.n : 0;
}

/** Can the boss sit down with him now? (why not, if not). Opening a talk needs a full mind. */
export function canTalk(s: GameState, id: string): { ok: boolean; why?: string } {
  const c = s.characters[id];
  if (!c || id === s.playerId) return { ok: false, why: 'Nobody to talk to' };
  if (!c.alive) return { ok: false, why: 'He is gone' };
  if (!mindOf(s, id)) return { ok: false, why: 'Not someone you sit down with yet' };
  if (ageOn(c.birth, s.date) < 16) return { ok: false, why: 'Too young' };
  if (!isFree(s, c)) return { ok: false, why: 'In prison' };
  if (s.gameOver) return { ok: false, why: 'The game is over' };
  const away = awayReason(s, today(s));
  if (away) return { ok: false, why: away };
  if (talksToday(s) >= TALK_PER_DAY) return { ok: false, why: `Enough talking for one day (${TALK_PER_DAY})` };
  const tb = timeBlock(s, TALK_ACTION);
  if (tb) return { ok: false, why: tb };
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* What he could tell                                                  */
/* ------------------------------------------------------------------ */

export interface Revealable { id: string; text: string; kind: 'secret' | 'rumor' }

/**
 * The allowlist: what he COULD choose to tell the boss today, given how far
 * he trusts him. His own secrets only to a boss he loves; what his side knows
 * about others to a boss he likes; the stories he has heard (or made up) to
 * anyone he talks to. Nothing the boss already knows.
 */
export function revealable(s: GameState, id: string): Revealable[] {
  const c = s.characters[id];
  const m = mindOf(s, id);
  if (!c || !m) return [];
  const op = opinion(s, id, s.playerId);
  const out: Revealable[] = [];
  for (const x of s.secrets) {
    if (x.knownBy.includes('player') || !s.characters[x.ownerId]?.alive) continue;
    if (x.ownerId === id) {
      if (op >= 40 && x.kind !== 'informant' && x.kind !== 'plot') out.push({ id: `secret:${x.id}`, text: `his own secret: ${x.text}`, kind: 'secret' });
    } else if (knowsOf(s, c, x.ownerId, x.knownBy) && op >= 15) out.push({ id: `secret:${x.id}`, text: x.text, kind: 'secret' });
  }
  for (const f of m.facts) {
    if (f.src !== 'lie' && f.c < 0.3) continue;
    if (f.src !== 'lie' && op < 0) continue;
    out.push({ id: `rumor:${f.k}:${f.by}${f.on ? `:${f.on}` : ''}`, text: `${f.src === 'lie' ? 'a story he would like you to believe' : `he ${sureWord(f.c)}`}: ${factText(s, f)}`, kind: 'rumor' });
  }
  return out.slice(0, 6);
}

/** Does he know this secret? His side knows it (another family), or it is about his own people (his crew, his capo's crew, his kin). */
function knowsOf(s: GameState, c: import('../types').Character, ownerId: string, knownBy: readonly string[]): boolean {
  if (c.faction !== 'player' && knownBy.includes(c.faction)) return true;
  const o = s.characters[ownerId];
  if (!o) return false;
  if (c.spouseId === o.id || o.spouseId === c.id || c.childrenIds.includes(o.id) || o.childrenIds.includes(c.id) || (!!c.fatherId && c.fatherId === o.fatherId)) return true;
  if (c.faction === 'player' && o.faction === 'player') return o.capoId === c.id || c.capoId === o.id || (!!c.capoId && o.capoId === c.capoId);
  return false;
}

/* ------------------------------------------------------------------ */
/* The prompt                                                          */
/* ------------------------------------------------------------------ */

const RULES = `You are voicing one character in "Little Las Vegas", a fictional mob-family strategy game set in Wildwood, New Jersey, in the summer resort era around 1960 (the boardwalk, the motels, the clubs, Philadelphia's say over the Shore). The player is the boss of a crime family; you speak ONLY as the character described below, talking with the boss in person.

Voice rules:
- Period mob talk, early-1960s Jersey Shore: plain, clipped, wary, warm or cold as he feels. No modern slang, no anachronisms.
- Everyone is fictional. Never name or allude to real people, real crime families or real living persons.
- Violence is only implied, never described. No gore.
- Romance or flirting only between adults, and nothing explicit.
- Never give real-world instructions for crimes (no how-to for weapons, drugs, theft, fraud, hacking, evading police). Talk around it like a careful man.
- Stay in character. If the boss asks for something out of the game's world, answer as the character would ("I don't follow you, boss").
- Keep replies short: 1 to 4 sentences.
- He tells what he chooses to, given his trust. He may lie if it suits him (then set "lie": true). He can only reveal items from the allowlist, by their exact id; anything else he knows nothing about.

Reply with ONLY one JSON object, no other text:
{"reply": string, "mood_delta": integer -10..10, "opinion_delta": integer -5..5, "reveals": [allowlist ids], "lie": boolean, "intent": one of "agree"|"refuse"|"threaten"|"bargain"|"confess"|"deflect"|"ask_favor"|"warn"|"flatter"|"complain"}
Example: {"reply":"Boss, I'd never short you. Ask anybody.","mood_delta":-2,"opinion_delta":0,"reveals":[],"lie":true,"intent":"deflect"}
mood_delta: how this exchange changes his mood. opinion_delta: how it changes what he thinks of the boss (small; respect and fairness raise it, threats and insults lower it).`;

/** His persona and the facts of the game, compact. */
export function personaOf(s: GameState, id: string): string {
  const c = s.characters[id];
  const m = mindOf(s, id);
  const v = mindView(s, id);
  if (!c || !v) return '';
  const boss = player(s);
  const age = ageOn(c.birth, s.date);
  const op = opinion(s, id, s.playerId);
  const role = c.rank === 'civilian' ? (boss.spouseId === id ? 'the boss\'s wife' : c.dynasty ? 'of the boss\'s family' : 'a civilian') : `${c.rank} of ${c.faction === 'player' ? 'the boss\'s crew' : FACTION_NAMES[c.faction]}`;
  const lines: string[] = [];
  lines.push(`CHARACTER: ${displayName(c)}, ${age}, ${c.gender === 'F' ? 'woman' : 'man'}, ${role}.`);
  lines.push(`Traits: ${c.traits.join(', ') || 'none in particular'}. Mood: ${v.moodText} (${v.valence >= 0 ? '+' : ''}${v.valence}).`);
  lines.push(`What drives him now: ${v.drives.slice(0, 3).map((d) => `${d.label.toLowerCase()} (${Math.round(d.urgency * 100)}% urgent)`).join(', ')}. Risk he will take: ${Math.round(v.risk * 100)}%.`);
  if (v.ambition) lines.push(`Ambition: ${v.ambition.text}${v.ambition.target ? ` (${v.ambition.target})` : ''}.`);
  if (m?.goals.length) lines.push(`Goals right now: ${m.goals.map((g) => g.k.replace('_', ' ')).join(', ')}.`);
  if (m?.plan) lines.push(`What he is secretly working on (do not admit it unless he chooses to): ${m.plan.k}${m.plan.t ? ` against/with ${nameOf(s, m.plan.t)}` : ''}.`);
  lines.push(`His opinion of the boss: ${op >= 0 ? '+' : ''}${op} (-100 hate .. +100 devoted).${v.aboutBoss ? ` ${v.aboutBoss.replace(/^He /, 'He ').replace(/you/g, 'the boss').replace(/your/g, 'the boss\'s')}` : ''}`);
  const mem = (m?.mem ?? []).filter((x) => x.who === s.playerId).slice(-4).map((x) => `${x.t} (${x.v > 0 ? 'warm' : 'sore'})`);
  if (mem.length) lines.push(`What he remembers about the boss: ${mem.join('; ')}.`);
  const other = (m?.mem ?? []).filter((x) => x.who && x.who !== s.playerId).sort((a, b) => Math.abs(b.v) * b.s - Math.abs(a.v) * a.s).slice(0, 3).map((x) => `${x.t}`);
  if (other.length) lines.push(`On his mind: ${other.join('; ')}.`);
  lines.push(`Game facts: ${s.date.m}/${s.date.y}, ${s.date.m >= 6 && s.date.m <= 9 ? 'the summer season' : 'the off-season'}. The boss is ${displayName(boss)}. Heat on the family: local ${s.heat.local}, federal ${s.heat.federal}.${s.rivals.filter((r) => r.war).map((r) => ` At war with ${r.name}.`).join('')}`);
  const allow = revealable(s, id);
  lines.push(allow.length ? `Allowlist (he MAY reveal these, by id, if he wants):\n${allow.map((a) => `- ${a.id}: ${a.text}`).join('\n')}` : 'Allowlist: empty (he has nothing to reveal today).');
  return lines.join('\n');
}

export interface TalkPrompt { messages: { role: 'user' | 'assistant'; content: string }[]; allow: string[] }

/** The whole input for one exchange: the standing rules turn, then the talk so far, ending on the boss's words. */
export function buildTalkPrompt(s: GameState, id: string, history: readonly TalkTurn[], say: string): TalkPrompt {
  const allow = revealable(s, id).map((a) => a.id);
  const messages: TalkPrompt['messages'] = [{ role: 'user', content: `${RULES}\n\n${personaOf(s, id)}` }];
  // Only the last exchanges (the rules turn is always kept).
  for (const t of history.slice(-8)) {
    if (t.role === 'boss') messages.push({ role: 'user', content: `The boss says: "${clean(t.text, MAX_SAY)}"` });
    else messages.push({ role: 'assistant', content: JSON.stringify({ reply: t.text, intent: t.out?.intent ?? 'deflect' }) });
  }
  messages.push({ role: 'user', content: `The boss says: "${clean(say, MAX_SAY)}"\nAnswer as ${s.characters[id]?.firstName ?? 'him'}, with only the JSON object.` });
  return { messages, allow };
}

/** Plain text, no control characters, bounded. */
export function clean(t: string, max: number): string {
  // eslint-disable-next-line no-control-regex
  return String(t).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/* ------------------------------------------------------------------ */
/* Validation: the model's answer is data, bounded and whitelisted     */
/* ------------------------------------------------------------------ */

const int = (v: unknown, lo: number, hi: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.round(clamp(n, lo, hi)) : 0;
};

export function validateTalk(raw: unknown, allow: readonly string[]): { ok: true; out: TalkOutcome } | { ok: false; why: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, why: 'not an object' };
  const o = raw as Record<string, unknown>;
  if (typeof o.reply !== 'string') return { ok: false, why: 'no reply' };
  const reply = clean(o.reply, MAX_REPLY);
  if (!reply) return { ok: false, why: 'empty reply' };
  const ok = new Set(allow);
  const reveals = Array.isArray(o.reveals) ? [...new Set(o.reveals.filter((x): x is string => typeof x === 'string' && ok.has(x)))].slice(0, 2) : [];
  const intent = (INTENTS as readonly string[]).includes(String(o.intent)) ? (o.intent as Intent) : 'deflect';
  return {
    ok: true,
    out: { reply, mood: int(o.mood_delta, -10, 10), opinion: int(o.opinion_delta, -5, 5), reveals, lie: o.lie === true, intent },
  };
}

/* ------------------------------------------------------------------ */
/* The fallback: scripted lines from his mind                          */
/* ------------------------------------------------------------------ */

const H = (k: string, n: number) => hashSeed(k) % n;

/** When Claude is not there: an answer from his mind, deterministic, no deltas beyond being listened to. */
export function scriptedReply(s: GameState, id: string, say: string, turn: number): TalkOutcome {
  const c = s.characters[id];
  const v = mindView(s, id);
  const base: TalkOutcome = { reply: '...', mood: 0, opinion: 0, reveals: [], lie: false, intent: 'deflect' };
  if (!c || !v) return base;
  const op = opinion(s, id, s.playerId);
  const t = say.toLowerCase();
  const pickOf = (xs: string[]) => xs[H(`${s.seed}|${id}|${s.week}|${turn}|${t.length}`, xs.length)];
  const top = v.drives[0]?.need;
  if (/\b(rat|rats|informant|feds?|fbi|trust|hear|heard|rumou?r|word)\b/.test(t)) {
    const allow = revealable(s, id).filter((a) => a.kind === 'rumor');
    if (allow.length && op >= 20) {
      const a = allow[0];
      return { ...base, reply: `Since you ask. Word is ${a.text.replace(/^[^:]*: /, '')}. I didn't hear it from me.`, reveals: [a.id], intent: 'warn' };
    }
    return { ...base, reply: pickOf(['I keep my ears open, boss. Nothing yet.', 'People talk. Most of it is nothing.', 'I don\'t carry stories. You know that.']), intent: 'deflect' };
  }
  if (/\b(money|envelope|short|skim|earn|cash)\b/.test(t)) {
    if (top === 'money') return { ...base, reply: pickOf(['Things are tight, I won\'t lie to you. A man\'s got to eat.', 'The summer will fix it. Give me the season.']), intent: 'complain' };
    return { ...base, reply: pickOf(['The envelope\'s right, boss. Every week.', 'Business is business. I got no complaints.']), intent: 'agree' };
  }
  if (/\b(family|wife|kids|son|daughter|mother)\b/.test(t)) {
    return { ...base, reply: pickOf(['Everybody\'s good, thank God. Thanks for asking.', 'The family is the family. You know how it is.']), intent: 'agree', opinion: turn === 0 && op >= 0 ? 1 : 0 };
  }
  if (/\b(want|ambition|future|plans?|crew of your own|capo)\b/.test(t) && v.ambition) {
    return { ...base, reply: op >= 20 ? `Truth? ${v.ambition.text}. Someday. When you say so.` : 'I want what everybody wants. To do my job.', intent: op >= 20 ? 'confess' : 'deflect' };
  }
  const MOOD: Record<string, string[]> = {
    angry: ['I\'m fine. I\'m just tired of eating it, that\'s all.', 'Somebody\'s got something coming. I\'m not saying who.'],
    afraid: ['These days I look over my shoulder twice. You ever get that feeling?', 'Too many new faces around, boss.'],
    grieving: ['I\'m not much company right now. You understand.', 'Some days are harder than others.'],
    greedy: ['There\'s money on this island nobody\'s picking up. Just saying.', 'You know me. Always looking for the next thing.'],
    scheming: ['Everything\'s under control. Don\'t you worry about me.', 'I\'ve got a few things working. Nothing to bother you with.'],
    loyal: ['Whatever you need, boss. You know that.', 'You don\'t even have to ask.'],
    proud: ['It\'s been a good stretch. I\'m not complaining.', 'Things are going our way, boss.'],
    restless: ['Same old, same old. Waiting on something to happen.', 'I could use a change, if I\'m honest.'],
    content: ['Can\'t complain. Nice night for it.', 'All quiet on my end, boss.'],
  };
  return { ...base, reply: pickOf(MOOD[v.mood] ?? MOOD.content), intent: v.mood === 'loyal' ? 'agree' : 'deflect', opinion: turn === 0 && op >= 0 ? 1 : 0 };
}

/* ------------------------------------------------------------------ */
/* Applying a talk (pure transforms for the screens)                   */
/* ------------------------------------------------------------------ */

function cloneMinds(M: MindsState): MindsState {
  return JSON.parse(JSON.stringify(M)) as MindsState;
}

/** Sit down with him: the hour comes off the boss's day and the talk is counted. Returns the new state (unchanged if he can't). */
export function beginTalk(s: GameState, id: string): GameState {
  if (!canTalk(s, id).ok) return s;
  const spent = spendTime(s, TALK_ACTION).state;
  const M = cloneMinds(s.minds!);
  const d = absDay(s);
  M.talk = { d, n: (M.talk?.d === d ? M.talk.n : 0) + 1 };
  M.stats.talks++;
  return { ...spent, minds: M };
}

/**
 * One exchange's outcome, validated, applied: his opinion of the boss (within
 * the talk's cap), trust/grievance by intent, his mood, a memory, and what he
 * chose to tell (whitelisted secrets become known; rumors go into what the boss
 * has heard, true or not). Pure: returns a new state.
 */
export function applyTalk(s: GameState, id: string, out: TalkOutcome): GameState {
  const c = s.characters[id];
  if (!c || !s.minds?.minds[id]) return s;
  const allow = new Set(revealable(s, id).map((a) => a.id));
  const relKey = `${id}>${s.playerId}`;
  const next: GameState = { ...s, relations: { ...s.relations }, minds: cloneMinds(s.minds) };
  const rel = s.relations[relKey];
  if (rel) next.relations[relKey] = { ...rel, modifiers: rel.modifiers.map((x) => ({ ...x })) };
  const back = s.relations[`${s.playerId}>${id}`];
  if (back) next.relations[`${s.playerId}>${id}`] = { ...back, modifiers: back.modifiers.map((x) => ({ ...x })) };
  const M = next.minds!;
  const m: Mind = M.minds[id];
  const op = int(out.opinion, -5, 5);
  if (op) {
    // The talk's own modifier never passes ±TALK_OPINION_CAP, however many exchanges.
    const cur = next.relations[relKey]?.modifiers.find((x) => x.reason === TALK_REASON)?.value ?? 0;
    const room = op > 0 ? Math.max(0, TALK_OPINION_CAP - cur) : Math.min(0, -TALK_OPINION_CAP - cur);
    const d = op > 0 ? Math.min(op, room) : Math.max(op, room);
    if (d) { next.nextId = s.nextId; addOpinion(next, id, s.playerId, TALK_REASON, d, 2); }
  }
  switch (out.intent) {
    case 'agree': changeMeter(next, id, s.playerId, 'trust', 2); break;
    case 'confess': changeMeter(next, id, s.playerId, 'trust', 3); break;
    case 'complain': changeMeter(next, id, s.playerId, 'grievance', -3); break;
    case 'threaten': changeMeter(next, id, s.playerId, 'grievance', 4); addOpinion(next, s.playerId, id, 'Threatened you to your face', -5, 2); break;
    default: break;
  }
  m.mv = Math.round(clamp(m.mv + int(out.mood, -10, 10), -100, 100));
  remember(m, { w: s.week, k: 'talk', who: s.playerId, t: op >= 2 ? 'a good talk with the boss' : op <= -2 ? 'a bad talk with the boss' : 'sat down with the boss', v: op * 2 || 1 });
  if (out.lie) remember(m, { w: s.week, k: 'lie', who: s.playerId, t: 'told the boss a story', v: -1 });
  // What he told: only what is on the allowlist now.
  const reveals = out.reveals.filter((r) => allow.has(r)).slice(0, 2);
  if (reveals.length) {
    next.secrets = s.secrets.slice();
    for (const r of reveals) {
      if (r.startsWith('secret:')) {
        if (out.lie) continue; // a lie reveals nothing he can be held to
        const sid = r.slice(7);
        const i = next.secrets.findIndex((x) => x.id === sid);
        if (i >= 0 && !next.secrets[i].knownBy.includes('player')) next.secrets[i] = { ...next.secrets[i], knownBy: [...next.secrets[i].knownBy, 'player'] };
        const sec = next.secrets[i];
        if (sec) M.heard.push({ w: s.week, from: id, text: `${c.firstName} told you: ${sec.text}.`, c: 1 });
      } else if (r.startsWith('rumor:')) {
        const [, k, by, on] = r.split(':');
        const f = m.facts.find((x) => x.k === k && x.by === by && (x.on ?? '') === (on ?? ''));
        if (f) M.heard.push({ w: s.week, from: id, text: `${c.firstName} says ${factText(next, f)}.`, c: f.src === 'lie' ? 0.6 : f.c });
      }
    }
    if (M.heard.length > HEARD_CAP) M.heard.splice(0, M.heard.length - HEARD_CAP);
  }
  return next;
}

/** What the boss has heard in talks (newest first). */
export function heardInTalks(s: GameState): { w: number; from: string; text: string; sure: string }[] {
  return (s.minds?.heard ?? []).slice().reverse().map((h) => ({ w: h.w, from: nameOf(s, h.from), text: h.text, sure: h.c >= 0.9 ? 'He knows it' : h.c >= 0.5 ? 'He believes it' : 'He has heard it' }));
}

/** Short persona line for the talk window's header. */
export function talkHeader(s: GameState, id: string): string {
  const v = mindView(s, id);
  const c = s.characters[id];
  if (!v || !c) return '';
  return `${v.moodText}${hasTrait(c, 'Paranoid') ? ' · watchful' : ''} · thinks ${opinion(s, id, s.playerId) >= 0 ? '+' : ''}${opinion(s, id, s.playerId)} of you`;
}
