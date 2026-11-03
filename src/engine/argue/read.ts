import { crew, displayName, hasTrait, isFree } from '../characters';
import { tieOf } from '../deeds/state';
import { axesOf } from '../deeds/weights';
import { grudge } from '../minds/memory';
import { isSchemer } from '../minds/psyche';
import { mindOf } from '../minds/state';
import { getRelation, opinion } from '../relations';
import type { Character, GameState, Trait } from '../types';
import { clamp } from './state';
import type { ArgKind, Argument, Posture, Reply, Voice } from './types';

/**
 * READING THE MAN. Pure: how hot he comes in, how deep it cuts, how he
 * carries it, what each of the boss's answers is likely to do, who in the
 * room would speak up. Reads his traits, his mood, his opinion of the boss,
 * his fear, his grudges, and what he hides (never shown as such).
 */

const has = (c: Character | undefined, t: Trait) => !!c && hasTrait(c, t);

export function fearOf(s: GameState, id: string): number {
  return getRelation(s, id, s.playerId)?.fear ?? 0;
}

/**
 * Is he secretly working against the boss? (a capo's plot nobody found out,
 * a betrayal he is working, revenge on the boss, a grievance gone to
 * faction-building, a plot in the intrigue layer). Hidden truth: the window
 * never says so; a plotting man smiles and agrees.
 */
export function hiddenPlot(s: GameState, id: string): string | undefined {
  const b = s.capos?.books[id];
  if (b?.plot && !b.plot.known) return `capo:${b.plot.k}`;
  const m = mindOf(s, id);
  if (m?.plan && (m.plan.k === 'betray' || (m.plan.k === 'avenge' && m.plan.t === s.playerId))) return `mind:${m.plan.k}`;
  const g = s.power?.grievances.find((x) => x.charId === id && x.status === 'open' && x.stage >= 2);
  if (g) return 'grievance';
  const p = s.intrigue?.plots.find((x) => x.actorId === id && !x.ended && !x.known && x.kind === 'coup');
  if (p) return 'intrigue:coup';
  return undefined;
}

/** He can hide it: a hothead cannot keep a straight face. */
export function masks(s: GameState, c: Character): boolean {
  if (has(c, 'Hot-headed')) return false;
  return !!hiddenPlot(s, c.id);
}

const BASE_HEAT: Record<ArgKind, number> = { insult: 45, refuse: 28, passover: 40, accuse: 46, affair: 40, decline: 30 };
const BASE_HURT: Record<ArgKind, number> = { insult: 40, refuse: 25, passover: 45, accuse: 55, affair: 30, decline: 28 };

/** How he comes in: temper, hurt, posture, and whether he hides it. */
export function openingRead(s: GameState, c: Character, k: ArgKind, room: readonly string[]): { heat: number; hurt: number; pos: Posture; mask: boolean; why: string[] } {
  const why: string[] = [];
  const ax = axesOf(c);
  const op = opinion(s, c.id, s.playerId);
  const fear = fearOf(s, c.id);
  const m = mindOf(s, c.id);
  const g = m ? grudge(m, s.playerId) : 0;
  let heat = BASE_HEAT[k] + ax.pride / 4;
  let hurt = BASE_HURT[k];
  const T: [Trait, number, string][] = [['Hot-headed', 18, 'Hot-headed'], ['Vengeful', 8, 'Vengeful'], ['Patient', -14, 'Patient'], ['Cowardly', -12, 'Cowardly'], ['Loyal-to-a-fault', -10, 'Loyal to a fault'], ['Charming', -5, 'Charming']];
  for (const [t, v, w] of T) if (has(c, t)) { heat += v; why.push(`${w} ${v > 0 ? '+' : '−'}${Math.abs(v)}`); }
  if (k === 'accuse' && has(c, 'Honest')) { heat += 8; hurt += 10; why.push('Honest: the insult of it'); }
  if (m?.mood === 'angry') { heat += 12; why.push('Already angry'); }
  if (m?.mood === 'afraid') heat -= 10;
  if (m?.mood === 'proud') heat += 6;
  heat -= op / 5;
  if (op <= -20) why.push('Thinks little of you');
  if (op >= 40) why.push('Thinks the world of you');
  heat -= fear / 5;
  if (fear >= 40) why.push('Afraid of you');
  if (g > 0) { heat += Math.min(15, g / 3); if (g >= 15) why.push('Holds old things against you'); }
  // In front of the others: it cuts deeper, and a proud man cannot back down.
  const n = room.length;
  hurt += Math.min(30, 12 * n);
  if (n && ax.pride > 0) heat += 5 * n;
  if (n) why.push(`In front of ${n} ${n === 1 ? 'man' : 'men'}`);
  // A man who really does inform protests too much, and quietly.
  const informs = k === 'accuse' && !!c.informantFor && c.informantFor !== 'player';
  const mask = masks(s, c) || (informs && !has(c, 'Hot-headed'));
  if (mask) heat = Math.min(heat, 22);
  heat = Math.round(clamp(heat, 5, 95));
  hurt = Math.round(clamp(hurt, 5, 95));
  let pos: Posture;
  if (mask && !informs) pos = 'smiling';
  else if (informs || has(c, 'Cowardly') || fear >= 50 || m?.mood === 'afraid') pos = 'scared';
  else if (heat >= 58) pos = 'hot';
  else if (hurt >= 50 && (has(c, 'Loyal-to-a-fault') || op >= 25 || k === 'accuse')) pos = 'hurt';
  else pos = 'cold';
  return { heat, hurt, pos, mask, why };
}

/** The posture after a round (heat moved). */
export function postureNow(c: Character, A: Pick<Argument, 'heat' | 'hurt' | 'pos' | 'mask'>): Posture {
  if (A.mask || A.pos === 'smiling') return A.pos;
  if (A.pos === 'scared' && A.heat < 60) return 'scared';
  if (A.heat >= 58) return 'hot';
  if (A.hurt >= 50 && A.heat >= 25) return 'hurt';
  return has(c, 'Cowardly') && A.heat < 40 ? 'scared' : 'cold';
}

/** The man who can be asked to step in: the consigliere, else the underboss (never the man himself). */
export function mediatorFor(s: GameState, A: Pick<Argument, 't' | 'room'>): Character | undefined {
  const ids: string[] = [];
  const cons = s.council?.consigliere?.holderId;
  const ub = s.council?.underboss?.holderId;
  if (cons) ids.push(cons);
  if (ub) ids.push(ub);
  for (const c of crew(s)) if (c.rank === 'consigliere' || c.rank === 'underboss') ids.push(c.id);
  for (const id of ids) {
    const c = s.characters[id];
    if (c?.alive && c.id !== A.t && c.id !== s.playerId && isFree(s, c)) return c;
  }
  return undefined;
}

/** What a witness does when he speaks up (undefined: he keeps quiet). */
export function voiceOf(s: GameState, A: Pick<Argument, 't' | 'k'>, id: string): Voice | undefined {
  const c = s.characters[id];
  if (!c?.alive) return undefined;
  const tie = tieOf(s, id, A.t)?.k;
  const likes = opinion(s, id, A.t);
  const friend = tie === 'friend' || tie === 'ally' || likes >= 20;
  const m = mindOf(s, id);
  if ((has(c, 'Hot-headed') || has(c, 'Cruel')) && friend) return 'hothead';
  if (s.council?.consigliere?.holderId === id || ((has(c, 'Patient') || has(c, 'Charming') || has(c, 'Pious')) && !has(c, 'Hot-headed'))) return 'peacemaker';
  if ((has(c, 'Ambitious') || has(c, 'Greedy') || m?.mood === 'scheming' || isSchemer(c)) && likes < 10) return 'opportunist';
  if (has(c, 'Loyal-to-a-fault') || opinion(s, id, s.playerId) >= 40) return 'loyalist';
  if (has(c, 'Hot-headed') && tie === 'feud') return 'loyalist';
  return undefined;
}

export interface ReplyOdds { reply: Reply; p: number; why: string[]; hint: string; blocked?: string }

const pct = (n: number) => `${n > 0 ? '+' : '−'}${Math.abs(Math.round(n * 100))}`;

/**
 * The chance each answer lands (calms him, makes him back down, sends him off
 * quietly, lets the mediator talk him down), with the reasons that weigh most.
 * Pure. A man who hides something always seems to come round: the odds shown
 * are what the boss can read, not what is under the smile.
 */
export function replyOdds(s: GameState, A: Argument, r: Reply): ReplyOdds {
  const c = s.characters[A.t];
  const op = opinion(s, A.t, s.playerId);
  const fear = fearOf(s, A.t) + A.fear;
  const m = mindOf(s, A.t);
  const g = m ? grudge(m, s.playerId) : 0;
  const boss = s.characters[s.playerId];
  const w: [string, number][] = [];
  const add = (label: string, v: number) => { if (Math.abs(v) >= 0.02) w.push([label, v]); };
  let p = 0;
  let hint = '';
  let blocked: string | undefined;
  const hot = (A.heat - 50) / 200;
  switch (r) {
    case 'apologize':
      p = 0.55;
      add('He likes you', op / 220);
      add('Old grudges', -g / 120);
      if (has(c, 'Patient') || has(c, 'Charming')) add('Lets things go', 0.12);
      if (has(c, 'Loyal-to-a-fault')) add('Loyal to a fault', 0.12);
      if (has(c, 'Vengeful')) add('Vengeful', -0.16);
      if (A.pos === 'hurt') add('He wants to hear it', 0.1);
      add('His temper', -hot);
      if (A.used.includes('apologize')) add('Said it already', -0.15);
      hint = A.room.length ? 'Calms him; you give ground in front of the room' : 'Calms him; costs you a little face';
      break;
    case 'double':
      p = 0.45;
      add('Afraid of you', fear / 160);
      add('Your standing', (s.respect - 50) / 400);
      if (has(c, 'Cowardly')) add('Cowardly', 0.2);
      if (has(c, 'Loyal-to-a-fault')) add('Loyal to a fault', 0.1);
      if (has(c, 'Hot-headed')) add('Hot-headed', -0.2);
      if (has(c, 'Ambitious')) add('Ambitious', -0.08);
      if (A.room.length && axesOf(c!).pride > 0) add('Proud, in front of the room', -0.08);
      add('His temper', -hot);
      hint = 'He backs down, or it blows up; it cuts deeper either way';
      break;
    case 'threaten':
      p = 0.5;
      add('Afraid of you', fear / 120);
      if (has(c, 'Cowardly')) add('Cowardly', 0.25);
      if (has(c, 'Hot-headed')) add('Hot-headed', -0.25);
      if (has(c, 'Vengeful')) add('Vengeful', -0.1);
      if (boss && hasTrait(boss, 'Cruel')) add('Your reputation', 0.06);
      add('His temper', -hot / 2);
      hint = 'Fear now; a grudge later. If it fails, it gets ugly';
      break;
    case 'dismiss':
      p = 0.62;
      add('His temper', -A.heat / 220);
      add('Afraid of you', fear / 220);
      if (has(c, 'Hot-headed')) add('Hot-headed', -0.15);
      if (has(c, 'Patient')) add('Patient', 0.1);
      if (A.room.length && A.heat >= 55) add('Thrown out in front of the room', -0.12);
      hint = 'Ends it now, one way or another';
      break;
    case 'mediate': {
      const med = mediatorFor(s, A);
      if (!med) { blocked = 'Nobody to step in'; p = 0; break; }
      p = 0.32 + med.attributes.diplomacy / 160;
      add(`${med.firstName}'s way with people`, med.attributes.diplomacy / 160 - 0.3);
      add(`What he thinks of ${med.firstName}`, opinion(s, A.t, med.id) / 180);
      if (has(med, 'Charming') || has(med, 'Patient')) add(`${med.firstName} keeps cool`, 0.1);
      if (has(med, 'Hot-headed')) add(`${med.firstName} is a hothead`, -0.12);
      add('His temper', -hot / 2);
      if (A.used.includes('mediate')) add('Tried it already', -0.2);
      hint = `${displayName(med)} steps in; your hands stay clean`;
      if (A.used.includes('mediate') && A.med === med.id && A.used.filter((x) => x === 'mediate').length >= 2) blocked = `${med.firstName} has said his piece`;
      break;
    }
  }
  for (const [, v] of w) p += v;
  if (A.mask) p = Math.max(p, 0.7);
  const out: ReplyOdds = { reply: r, p: Math.round(clamp(p, 0.05, 0.95) * 100) / 100, why: w.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 3).map(([l, v]) => `${pct(v)} ${l}`), hint };
  if (blocked) out.blocked = blocked;
  return out;
}
