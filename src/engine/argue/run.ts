import { bossWord, genderize } from '../pronouns';
import { displayName, hasTrait, isFree } from '../characters';
import { applyEffects } from '../effects';
import { cloneState } from '../engine';
import { addStory } from '../hierarchy';
import { journal } from '../journal';
import { newCtx, type Ctx } from '../ledger';
import { remember } from '../minds/memory';
import { mindOf } from '../minds/state';
import { addOpinion, changeMeter } from '../relations';
import type { Character, GameState } from '../types';
import { ANSWER, BOSS, DONE, MASK, MEDIATOR, NARR, OPEN, VOICES, fillLine } from './lines';
import { mediatorFor, openingRead, postureNow, replyOdds, voiceOf } from './read';
import { plantSeeds } from './seeds';
import { clamp, ensureArgue, g01, gpick } from './state';
import {
  COOLDOWN, END_LABEL, EVENT_BUDGET, HIST_CAP, MAX_DEPTH, MAX_ROUNDS, SEED_TEXT, HIDDEN_SEEDS,
  type ArgEnd, type ArgKind, type ArgLine, type Argument, type ArgueState, type Reply,
} from './types';
import { firstHand, scheduleHearsay } from './witness';

/**
 * THE ARGUMENT, ROUND BY ROUND. The engine side of the window: who answers,
 * how, what each of the boss's replies does, who in the room speaks up, how
 * it ends, and what it writes into the world. Mutating functions work on a
 * state the caller owns; the pure wrappers (openArgument, argueReply,
 * closeArgument) clone first, like every other window answer.
 *
 * Nobody of the boss's is ever killed or handed over by an argument: the
 * worst it does is a man walking out, a public split, a grudge, a plot that
 * the existing systems may or may not carry forward.
 */

export interface ArgSpec {
  k: ArgKind;
  t: string;
  about?: string;
  room?: string[];
  label: string;
  src?: string;
  depth?: number;
}

const first = (s: GameState, id?: string) => (id ? s.characters[id]?.firstName : undefined);

function names(s: GameState, A: Argument, w?: string) {
  return { me: first(s, A.t), x: first(s, A.about), m: first(s, A.med ?? mediatorFor(s, A)?.id), w: first(s, w) };
}

function say(s: GameState, G: ArgueState, A: Argument, by: string, pool: readonly string[], extra: Partial<ArgLine> = {}, w?: string): ArgLine {
  let text = fillLine(gpick(G, pool), names(s, A, w));
  const c = s.characters[A.t];
  if (c && by === A.t) {
    // His own son or daughter, his wife: "Pop", "Ma" or his name, never "boss".
    const word = bossWord(s, c);
    if (word !== 'Boss') text = text.replace(/,\s*boss\b/gi, `, ${word}`).replace(/^Boss,/, `${word},`);
  } else if (c && !by) text = genderize(text, c);
  const l: ArgLine = { by, t: text, ...extra };
  A.log.push(l);
  return l;
}

/** Why an argument cannot start now (undefined: it can). */
export function cannotArgue(s: GameState, spec: Pick<ArgSpec, 't' | 'depth'>): string | undefined {
  const c = s.characters[spec.t];
  if (!c?.alive || c.id === s.playerId) return 'Nobody to argue with';
  if (!isFree(s, c)) return `${c.firstName} is not around`;
  if (s.argue?.live && !s.argue.live.end) return 'Already in the middle of one';
  if ((s.argue?.cd[c.id] ?? -1) > s.week) return `You and ${c.firstName} had it out already this week`;
  if ((spec.depth ?? 0) > MAX_DEPTH) return 'Enough for one story';
  if (s.gameOver) return 'The game is over';
  return undefined;
}

/** A witness may speak up on his own (one a round, within the scene's budget). */
function interject(s: GameState, G: ArgueState, A: Argument): void {
  if (A.ev >= EVENT_BUDGET || A.end) return;
  const cands = A.room.filter((id) => !A.spoke.includes(id) && s.characters[id]?.alive).map((id) => [id, voiceOf(s, A, id)] as const).filter((x) => !!x[1]);
  if (!cands.length) return;
  const p = (A.round === 0 ? 0.45 : 0.55) + (A.heat >= 60 ? 0.15 : 0);
  if (g01(G) >= p) return;
  const [id, v] = cands[Math.floor(g01(G) * cands.length)];
  A.spoke.push(id);
  A.ev++;
  G.stats.voices++;
  switch (v!) {
    case 'peacemaker': A.heat -= 10; A.hurt -= 4; break;
    case 'hothead': A.heat += 12; A.hurt += 4; break;
    case 'loyalist': A.heat -= 4; A.hurt += 4; break;
    case 'opportunist': break;
  }
  A.heat = Math.round(clamp(A.heat, 0, 100));
  A.hurt = Math.round(clamp(A.hurt, 0, 100));
  say(s, G, A, v === 'opportunist' ? '' : id, VOICES[v!], { v: v! }, id);
}

/** Start an argument (mutates `s`): his first answer, and maybe a voice from the room. */
export function beginArgument(s: GameState, spec: ArgSpec): Argument | undefined {
  if (cannotArgue(s, spec)) return undefined;
  const G = ensureArgue(s);
  const c = s.characters[spec.t];
  const room = [...new Set(spec.room ?? [])].filter((id) => id !== s.playerId && id !== c.id && s.characters[id]?.alive && isFree(s, s.characters[id])).slice(0, 4);
  const rd = openingRead(s, c, spec.k, room);
  const A: Argument = {
    id: `ar${G.n++}`, k: spec.k, t: c.id, ...(spec.about ? { about: spec.about } : {}), label: spec.label.slice(0, 90), w: s.week, room,
    round: 0, heat: rd.heat, hurt: rd.hurt, pos: rd.pos, ...(rd.mask ? { mask: 1 as const } : {}), depth: spec.depth ?? 0, ev: 0, spoke: [], used: [], fear: 0, log: [],
    ...(spec.src ? { src: spec.src } : {}),
  };
  A.log.push({ by: '', t: `${A.label}.` });
  say(s, G, A, c.id, OPEN[A.k][A.pos]);
  // A sharp or suspicious boss notices the smile.
  const boss = s.characters[s.playerId];
  if (A.mask && A.pos === 'smiling' && boss && (hasTrait(boss, 'Paranoid') || boss.attributes.intrigue >= 65)) { say(s, G, A, '', NARR.tell); A.ev++; }
  interject(s, G, A);
  G.live = A;
  G.cd[c.id] = s.week + COOLDOWN;
  G.stats.n++;
  return A;
}

function proud(c: Character): boolean {
  return (hasTrait(c, 'Vengeful') || hasTrait(c, 'Ambitious')) && !hasTrait(c, 'Loyal-to-a-fault');
}

/** Has it reached an end? */
function endOf(A: Argument, c: Character): ArgEnd | undefined {
  const big = (c.faction === 'player' && (c.rank === 'capo' || c.rank === 'underboss' || c.rank === 'consigliere')) || c.dynasty;
  if (A.heat >= 85) return A.room.length && big ? 'split' : 'walkout';
  if (A.heat <= 25) {
    if (A.hurt >= 60 && proud(c)) return 'plot';
    if (A.hurt <= 45 && (A.used.includes('apologize') || A.used.includes('mediate'))) return 'reconciled';
    return 'truce';
  }
  if (A.round >= MAX_ROUNDS) {
    if (A.heat < 50) return A.hurt >= 60 && proud(c) ? 'plot' : 'truce';
    if (A.heat < 70) return 'walkout';
    return A.room.length && big ? 'split' : 'walkout';
  }
  return undefined;
}

/** The boss answers (mutates `s`). Returns the argument (ended or not); undefined when there is none or the reply is blocked. */
export function replyArgument(s: GameState, r: Reply, ctx: Ctx = newCtx(s)): Argument | undefined {
  const G = s.argue;
  const A = G?.live;
  if (!G || !A || A.end) return undefined;
  const c = s.characters[A.t];
  if (!c?.alive) { A.end = 'walkout'; settle(ctx, G, A); return A; }
  const o = replyOdds(s, A, r);
  if (o.blocked) return undefined;
  const ok = g01(G) < o.p;
  A.round++;
  A.used.push(r);
  G.stats.rounds++;
  const med = r === 'mediate' ? mediatorFor(s, A) : undefined;
  if (med) A.med = med.id;
  say(s, G, A, 'boss', BOSS[r], { r, ok: ok ? 1 : 0 });
  if (med) say(s, G, A, med.id, ok ? MEDIATOR.ok : MEDIATOR.no);
  if (A.mask) {
    // He agrees, whatever the boss does: the smile, the handshake. It costs him inside.
    if (r === 'double' || r === 'threaten') { A.hurt += 12; A.fear += r === 'threaten' ? 6 : 3; }
    if (r === 'apologize') A.hurt -= 6;
    A.heat = Math.max(5, A.heat - 15);
    say(s, G, A, c.id, MASK);
    A.end = 'plot';
  } else {
    switch (r) {
      case 'apologize':
        if (ok) { A.heat -= 25; A.hurt -= 20; } else { A.heat -= 5; }
        break;
      case 'double':
        if (ok) { A.heat -= 15; A.hurt += 12; A.fear += 4; } else { A.heat += 22; A.hurt += 8; }
        break;
      case 'threaten':
        if (ok) { A.heat -= 20; A.hurt += 18; A.fear += 10; } else { A.heat += 30; A.hurt += 10; }
        break;
      case 'dismiss':
        if (ok) A.end = A.heat < 45 ? 'truce' : 'walkout';
        else { A.heat += 10; A.end = A.room.length && A.heat >= 50 ? 'split' : 'walkout'; }
        break;
      case 'mediate':
        if (ok) { A.heat -= 30; A.hurt -= 12; } else { A.heat += 6; if (med) addOpinion(s, A.t, med.id, 'Took his side', -3, 1); }
        break;
    }
    A.heat = Math.round(clamp(A.heat, 0, 100));
    A.hurt = Math.round(clamp(A.hurt, 0, 100));
    A.pos = postureNow(c, A);
    const bank = ANSWER[r][ok ? 'ok' : 'no'];
    const own = bank[A.pos];
    say(s, G, A, c.id, own && g01(G) < 0.6 ? own : bank.any);
    if (!A.end) interject(s, G, A);
    if (!A.end) A.end = endOf(A, c);
  }
  if (A.end) settle(ctx, G, A);
  return A;
}

/** What the end writes to the world (opinions, fear, memories, grievance, the room, the rumors, the seeds, Your File). */
function settle(ctx: Ctx, G: ArgueState, A: Argument): void {
  const s = ctx.s;
  const B = s.playerId;
  const c = s.characters[A.t];
  const end = A.end!;
  const nm = names(s, A);
  const narr = end === 'reconciled' ? NARR.hug : end === 'truce' ? NARR.truce : end === 'walkout' ? NARR.walk : end === 'split' ? NARR.split : NARR.plot;
  if (A.ev < EVENT_BUDGET + 2) say(s, G, A, '', narr);
  const doneText = genderize(fillLine(gpick(G, DONE[end]), nm), c);
  if (c?.alive) {
    const OP: Record<ArgEnd, [number, string]> = {
      reconciled: [6, 'Made it right with me, face to face'], truce: [-4, 'Had words with me'], walkout: [-10, 'We had it out and I walked'],
      split: [-18, 'Shamed me in front of the men'], plot: [2, 'Cleared the air'],
    };
    const [v, why] = OP[end];
    addOpinion(s, A.t, B, why, v, end === 'split' ? 1 : 2);
    if (A.fear) changeMeter(s, A.t, B, 'fear', A.fear);
    const gr = end === 'split' ? 20 : end === 'walkout' ? 10 : end === 'plot' ? 25 : end === 'truce' ? 4 : -8;
    changeMeter(s, A.t, B, 'grievance', gr);
    const m = mindOf(s, A.t);
    if (m) {
      remember(m, { w: s.week, k: end === 'reconciled' ? 'favor' : end === 'plot' ? 'betrayal' : 'slight', who: B, t: `${A.label.toLowerCase()}; ${END_LABEL[end].toLowerCase()}`, v: end === 'reconciled' ? 6 : -Math.round(A.hurt / 4) });
      if (end === 'split' || end === 'walkout') m.mood = 'angry';
      if (end === 'plot') m.mood = 'scheming';
    }
    // The capo's own book: a slight or a reward on his reading of the tide.
    const b = s.capos?.books[A.t];
    if (b) {
      if (end === 'reconciled') b.rw += 1;
      else if (end === 'split') b.sl += 2;
      else if (end === 'walkout' || end === 'plot') b.sl += 1;
    }
    addStory(s, c, `${END_LABEL[end]} after ${A.label.replace(/^You /, 'the boss ').toLowerCase()}.`);
  }
  // The boss's standing: an apology in front of the room costs face; a split costs more.
  const respect = (A.used.includes('apologize') && A.room.length ? -1 : 0) + (end === 'split' ? -2 : 0) + (end === 'plot' && A.used.includes('threaten') && A.room.length ? 1 : 0);
  if (respect) applyEffects(ctx, [{ type: 'respect', amount: respect }], { label: A.label, because: `had it out with ${c ? displayName(c) : 'him'}`, category: 'event' });
  firstHand(s, A);
  scheduleHearsay(s, G, A);
  const seeds = plantSeeds(s, G, A);
  const shown = seeds.filter((x) => !HIDDEN_SEEDS.includes(x.k)).map((x) => SEED_TEXT[x.k]);
  A.done = `${END_LABEL[end]}. ${doneText}${shown.length ? ` What may come of it: ${shown.join('; ').toLowerCase()}.` : ''}`;
  const who = c ? displayName(c) : 'him';
  journal(s, {
    t: `${A.label}: ${END_LABEL[end].toLowerCase()}`,
    x: `${doneText} (${A.round} round${A.round === 1 ? '' : 's'} with ${who}${A.room.length ? `, in front of ${A.room.map((id) => first(s, id)).filter(Boolean).join(' and ')}` : ''}.)`,
    p: [A.t, ...A.room, ...(A.about ? [A.about] : [])],
    c: A.k === 'affair' ? 'family' : 'crew',
    src: 'argue', mine: 1,
    ...(s.days && s.days.week === s.week ? { d: s.days.day } : {}),
  });
  const line = `${A.label}: ${END_LABEL[end].toLowerCase()}. ${doneText}`;
  ctx.log.push(line);
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: line, kind: 'decision' });
  G.hist.push({ id: A.id, w: s.week, k: A.k, t: A.t, end, done: A.done, room: A.room.slice() });
  if (G.hist.length > HIST_CAP) G.hist.splice(0, G.hist.length - HIST_CAP);
  G.stats.ends[end] = (G.stats.ends[end] ?? 0) + 1;
}

/* ------------------------------------------------------------------ */
/* Pure wrappers for the window                                        */
/* ------------------------------------------------------------------ */

/** Open the window. Pure: the new state (unchanged when it cannot start). */
export function openArgument(input: GameState, spec: ArgSpec): GameState {
  if (cannotArgue(input, spec)) return input;
  const s = cloneState(input);
  return beginArgument(s, spec) ? s : input;
}

/** The boss answers. Pure. */
export function argueReply(input: GameState, r: Reply): GameState {
  const A = input.argue?.live;
  if (!A || A.end || replyOdds(input, A, r).blocked) return input;
  const s = cloneState(input);
  replyArgument(s, r);
  return s;
}

/** Close the window: an argument still going is ended by sending him off. Pure. */
export function closeArgument(input: GameState): GameState {
  if (!input.argue?.live) return input;
  const s = cloneState(input);
  const G = ensureArgue(s);
  if (G.live && !G.live.end) replyArgument(s, 'dismiss');
  delete G.live;
  return s;
}

/** The weekly turn: a window left open is settled (sent off), an ended one is cleared. */
export function settleStale(ctx: Ctx, G: ArgueState): void {
  const A = G.live;
  if (!A) return;
  if (!A.end) replyArgument(ctx.s, 'dismiss', ctx);
  if (G.live?.end) delete G.live;
}

export { first as firstName };
