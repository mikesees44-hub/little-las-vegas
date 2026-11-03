import { ageOn } from '../calendar';
import { crew } from '../characters';
import { newCtx, type Ctx } from '../ledger';
import { resolveEventNow } from '../minds/dialogue';
import { decisionOfChoice, reactionsTo } from '../reactions/compute';
import { landReactions } from '../reactions/apply';
import { ensureReactions } from '../reactions/state';
import type { Decision, ReactionBatch, RxKind, RxRole } from '../reactions/types';
import type { Choice, EventInstance, GameState } from '../types';
import { beginArgument, cannotArgue, settleStale, type ArgSpec } from './run';
import { growSeeds } from './seeds';
import { deliverHearsay } from './witness';
import type { ArgKind } from './types';

/**
 * WHERE ARGUMENTS COME FROM. A heated decision offers one: from the "How
 * they took it" window (the man who took it worst, "Have it out ▸") and from
 * a decision card ("Say it to his face ▸": the decision is settled now and he
 * answers right there). Plus the weekly turn: hearsay arrives, seeds grow.
 */

/** What kind of argument a decision makes, for the man in this role. */
export function kindOf(d: { k?: RxKind; src?: string; label?: string; title?: string }, role: RxRole | 'target'): ArgKind | undefined {
  const text = `${d.src ?? ''} ${d.label ?? d.title ?? ''}`.toLowerCase();
  if (role === 'passed') return 'passover';
  if (/accus|\brat\b|inform|mole|canary/.test(text)) return 'accuse';
  if (/affair|goomar|mistress|cheat/.test(text)) return 'affair';
  switch (d.k) {
    case 'decline': return /^rx_|proposal|idea|proposed|venture|scheme/.test(text.trim()) || (d.src ?? '').startsWith('rx_') ? 'decline' : 'refuse';
    case 'slight': case 'punish': case 'demote': return 'insult';
    case 'ruling': return 'refuse';
  }
  if (/insult|dress|discipline|demand ?respect|threaten|humiliat|slap|chew/.test(text)) return 'insult';
  return undefined;
}

/** A man the boss can have it out with: one of his own (or of the house), grown. */
function arguable(s: GameState, id: string | undefined): boolean {
  const c = id ? s.characters[id] : undefined;
  if (!c?.alive || c.id === s.playerId) return false;
  if (ageOn(c.birth, s.date) < 18) return false;
  return (c.faction === 'player' && c.rank !== 'civilian') || c.dynasty;
}

/** Who else is in the room: the people around the boss who took note (up to two). */
function roomFrom(s: GameState, ids: readonly string[], not: readonly string[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    if (out.length >= 2) break;
    const c = s.characters[id];
    if (!c?.alive || not.includes(id) || id === s.playerId || out.includes(id)) continue;
    if (c.faction === 'player' && c.rank !== 'civilian' && c.rank !== 'associate') out.push(id);
  }
  return out;
}

/** The argument a reaction window offers for one of its people (the man it was about, or the man passed over). */
export function argueOfferFor(s: GameState, b: ReactionBatch, who: string): ArgSpec | undefined {
  const r = b.items.find((x) => x.who === who);
  if (!r || r.v >= 0 || (r.tone !== 'furious' && r.v > -6)) return undefined;
  if (r.role !== 'target' && r.role !== 'passed') return undefined;
  if (!arguable(s, who)) return undefined;
  const k = kindOf({ k: b.k, src: b.src, label: b.title }, r.role);
  if (!k) return undefined;
  const about = r.role === 'passed' ? b.t : b.over;
  const spec: ArgSpec = { k, t: who, ...(about && about !== who ? { about } : {}), room: roomFrom(s, b.items.map((x) => x.who), [who]), label: b.title, ...(b.src ? { src: b.src } : {}), depth: (b.src ?? '').startsWith('scene_argue_') ? 1 : 0 };
  return cannotArgue(s, spec) ? undefined : spec;
}

/** The one man a reaction window offers to have it out with (the worst-hit). */
export function argueFromBatch(s: GameState, b: ReactionBatch): ArgSpec | undefined {
  for (const r of b.items) {
    const spec = argueOfferFor(s, b, r.who);
    if (spec) return spec;
  }
  return undefined;
}

/** Choices that put a man in the ground or in a cell are never talked out here. */
const grave = (ch: Choice) => ch.effects.some((e) => e.type === 'kill' || e.type === 'imprison' || e.type === 'exile');

/** The people at the boss's elbow when a decision is given in person (the underboss, the consigliere, the man's capo). */
function officeRoom(s: GameState, t: string, extra: readonly string[]): string[] {
  const ids = [...extra, s.council?.underboss?.holderId, s.council?.consigliere?.holderId, s.characters[t]?.capoId, ...crew(s).filter((c) => c.rank === 'underboss' || c.rank === 'consigliere').map((c) => c.id)].filter((x): x is string => !!x);
  return roomFrom(s, ids, [t]);
}

/** The argument a decision's answer would start, face to face (undefined: not a heated one). */
export function argueFromChoice(s: GameState, ev: EventInstance, ch: Choice): ArgSpec | undefined {
  if (ch.disabledReason || grave(ch)) return undefined;
  let d: Decision | undefined;
  try { d = decisionOfChoice(s, ev, ch); } catch { d = undefined; }
  if (!d) return undefined;
  const list = reactionsTo(s, d);
  const hit = list.find((r) => (r.role === 'target' || r.role === 'passed') && r.v <= -6 && arguable(s, r.who));
  if (!hit) return undefined;
  const k = kindOf({ k: d.k, src: d.src ?? ev.defId, label: `${ev.title} ${ch.label}` }, hit.role);
  if (!k) return undefined;
  const about = hit.role === 'passed' ? d.t : d.over;
  const spec: ArgSpec = {
    k, t: hit.who, ...(about && about !== hit.who ? { about } : {}), room: officeRoom(s, hit.who, (ev.actors ?? []).filter((x) => x !== hit.who)),
    label: `You ${ch.because}`, src: ev.defId, depth: ev.defId.startsWith('scene_argue_') ? 1 : 0,
  };
  return cannotArgue(s, spec) ? undefined : spec;
}

/** The heated answers of a decision (each could be said to his face). */
export function heatedChoices(s: GameState, ev: EventInstance): { ch: Choice; spec: ArgSpec }[] {
  const out: { ch: Choice; spec: ArgSpec }[] = [];
  for (const ch of ev.choices) {
    const spec = argueFromChoice(s, ev, ch);
    if (spec) out.push({ ch, spec });
  }
  return out;
}

/**
 * Say it to his face: the decision is settled now (the same application as
 * at the week's turn, and its reactions land), then he answers. Pure.
 */
export function faceToFace(input: GameState, iid: string, choiceId: string): GameState {
  const ev = input.pendingEvents.find((e) => e.iid === iid);
  const ch = ev?.choices.find((c) => c.id === choiceId);
  if (!ev || !ch) return input;
  const spec = argueFromChoice(input, ev, ch);
  if (!spec) return input;
  let d: Decision | undefined;
  try { d = decisionOfChoice(input, ev, ch); } catch { d = undefined; }
  const list = d ? reactionsTo(input, d) : [];
  const r = resolveEventNow(input, iid, choiceId);
  if (r.state === input) return input;
  const s = r.state;
  if (d && list.length) {
    // The reactions land, but the argument is their window: no second popup.
    const b = landReactions(newCtx(s), d, list);
    if (b) {
      const R = ensureReactions(s);
      R.q = R.q.filter((x) => x.id !== b.id);
      for (const it of b.items) R.log.push({ w: s.week, title: b.title, who: it.who, v: it.v, why: it.why, tone: it.tone });
    }
  }
  beginArgument(s, spec);
  return s;
}

/** The weekly turn (engine.ts, after the minds think): a window left open is settled, hearsay arrives, seeds grow. */
export function argueWeek(ctx: Ctx): string[] {
  const G = ctx.s.argue;
  if (!G) return [];
  settleStale(ctx, G);
  deliverHearsay(ctx, G);
  const lines = growSeeds(ctx, G);
  if (lines.length) ctx.log.push(...lines);
  return lines;
}
