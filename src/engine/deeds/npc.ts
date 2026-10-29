import { displayName, isFree } from '../characters';
import type { Ctx } from '../ledger';
import { gratitude, grudge } from '../minds/memory';
import { outlook, utilityOf } from '../minds/planner';
import { mindOf } from '../minds/state';
import { GOAL_TEXT, type GoalKind } from '../minds/types';
import { addOpinion, opinion } from '../relations';
import type { Character, GameState } from '../types';
import { DEEDS, type DeedDef } from './catalog';
import { deedPreview, doDeed, type DeedPreview } from './resolve';
import { d01, ensureDeeds, tieOf } from './state';
import { ASK_CAP, TIE_LABEL, type Ask, type DeedId } from './types';
import { vecScore } from './weights';

/**
 * NPC INITIATIVE. The people with minds use the same deeds the boss does:
 * on each other, and on the boss. Each week a few of them (the longest idle
 * first) look over the people around them, weigh every deed they could do
 * (`weigh`: their nature through the weight table, their needs through the
 * minds' utility, their grudges and debts, their ties, their goals, the odds
 * of it working), and the best one, if it is worth it, gets done. Asks aimed
 * at the boss wait for his answer (a popup, within the story director's
 * caps); the rest land, and the feed says so.
 */

/** NPC deeds a week (the most idle first). */
export const ACT_BUDGET = 5;
/** A score below this is not worth doing. */
export const ACT_THRESHOLD = 30;
/** Weeks a man waits between deeds of his own. */
export const ACT_GAP = 3;
/** Weeks an ask waits for the boss before it lapses. */
export const ASK_TTL = 3;

export interface Weighed {
  id: DeedId;
  t: string;
  /** Points: how much he wants to do it (≥ ACT_THRESHOLD: he will, given the chance). */
  score: number;
  /** The biggest parts of the score, in words. */
  why: { label: string; value: number }[];
  chance: number;
  preview: DeedPreview;
}

const GOAL_DEEDS: Partial<Record<GoalKind, DeedId[]>> = {
  get_even: ['insult', 'plantRumor', 'threaten', 'findSecrets'],
  confront: ['insult', 'threaten', 'demandRespect'],
  smear: ['plantRumor', 'fabricateHook'],
  befriend: ['befriend', 'flatter', 'feast', 'alliance'],
  following: ['befriend', 'recognize', 'offerPiece', 'sway'],
  earn: ['askLoan', 'partner', 'callFavor'],
  skim: ['askLoan'],
  prove: ['demandRespect', 'askFavor'],
  serve: ['recognize', 'discipline', 'befriend'],
  protect: ['findSecrets'],
  family: ['askFavor', 'askLoan'],
  indulge: ['court', 'feast'],
  expand: ['alliance', 'sway', 'demandRespect'],
  lielow: ['flatter', 'befriend'],
};

/** Risk of a deed for the minds' utility (hostile and intrigue moves are risky). */
function riskOf(def: DeedDef): number {
  if (def.cat === 'intrigue' && def.hostile) return 0.6;
  if (def.hostile) return 0.45;
  return 0;
}

/**
 * Everything `a` could do to `t`, scored (most wanted first). Pure. Used by
 * the NPCs to choose, and by "How he leans" to show what he is weighing.
 */
export function weigh(s: GameState, aId: string, tId: string): Weighed[] {
  const a = s.characters[aId];
  const t = s.characters[tId];
  if (!a?.alive || !t?.alive || aId === tId) return [];
  const o = outlook(s, aId);
  const m = mindOf(s, aId);
  const op = opinion(s, aId, tId);
  const tie = tieOf(s, aId, tId);
  const toBoss = tId === s.playerId;
  const out: Weighed[] = [];
  for (const def of Object.values(DEEDS)) {
    if (!def.npc || aId === s.playerId) continue;
    if (toBoss && def.npc === 'npc') continue;
    if (!toBoss && def.npc === 'boss') continue;
    const p = deedPreview(s, def.id, aId, tId);
    if (!p || p.blocked) continue;
    const why: { label: string; value: number }[] = [];
    const add = (label: string, value: number) => { if (Math.round(value)) why.push({ label, value: Math.round(value) }); };
    add('His nature', vecScore(a, def.act) * 0.6);
    // Most men are not looking for trouble, and most like a friendly word.
    if (def.friendly) add('Good manners', 12);
    const quarrel = op <= -10 || !!(tie && (tie.k === 'rival' || tie.k === 'feud')) || (m ? grudge(m, tId) >= 5 : false);
    if (def.hostile && !quarrel) add('No quarrel with him', -30);
    add(def.hostile ? (op < 0 ? 'He dislikes him' : 'He likes him') : op >= 0 ? 'He likes him' : 'He dislikes him', def.hostile ? -op * 0.5 : def.friendly ? op * 0.35 : 0);
    if (o) {
      const { u } = utilityOf(o, def.wants, riskOf(def));
      add('What he needs', u * 45);
    }
    if (m) {
      const g = grudge(m, tId);
      const gr = gratitude(m, tId);
      if (def.hostile && g) add('A grudge', Math.min(40, g * 0.8));
      if (def.friendly && gr) add('Gratitude', Math.min(25, gr * 0.6));
      if (def.friendly && g) add('A grudge', -Math.min(30, g * 0.6));
      const goal = m.goals.find((gl) => GOAL_DEEDS[gl.k]?.includes(def.id) && (!gl.t || gl.t === tId));
      if (goal) add(`Wants to ${GOAL_TEXT[goal.k]}`, 15 + 20 * goal.pri);
    }
    if (tie) {
      const hostileTie = tie.k === 'rival' || tie.k === 'feud';
      const v = def.hostile ? (hostileTie ? (tie.k === 'feud' ? 40 : 25) : -40) : def.friendly ? (hostileTie ? -35 : 20) : 0;
      add(TIE_LABEL[tie.k], v);
    }
    if (p.acceptance) add(def.mode === 'consent' ? 'Thinks he would say yes' : 'Thinks it would work', (p.chance - 0.5) * 40);
    // The boss is a dangerous man to cross, and not to be bothered for nothing.
    if (toBoss && def.hostile) add('He is the boss', s.rivals.some((r) => r.leaderId === aId) ? -5 : -35);
    if (toBoss && def.ask) add('Bothering the boss', -10);
    const score = why.reduce((acc, x) => acc + x.value, 0);
    out.push({ id: def.id, t: tId, score: Math.round(score), why: why.sort((x, y) => Math.abs(y.value) - Math.abs(x.value)), chance: p.chance, preview: p });
  }
  return out.sort((x, y) => y.score - x.score || x.id.localeCompare(y.id));
}

/** The people a man looks at when he thinks about what to do (bounded). */
export function circleOf(s: GameState, c: Character): string[] {
  const ids = new Set<string>();
  const boss = s.characters[s.playerId];
  const minds = Object.keys(s.minds?.minds ?? {}).sort();
  if (c.faction === 'player' || c.dynasty || s.rivals.some((r) => r.leaderId === c.id && r.kind === 'mob')) ids.add(s.playerId);
  if (c.capoId) ids.add(c.capoId);
  for (const x of Object.values(s.characters)) if (x.alive && x.capoId === c.id && x.rank !== 'civilian') { ids.add(x.id); if (ids.size > 4) break; }
  for (const [k] of Object.entries(s.deeds?.ties ?? {})) {
    const [p, q] = k.split('|');
    if (p === c.id) ids.add(q);
    else if (q === c.id) ids.add(p);
  }
  const m = mindOf(s, c.id);
  for (const g of m?.goals ?? []) if (g.t) ids.add(g.t);
  if (m?.amb?.t) ids.add(m.amb.t);
  // The boss's wife: rival men and smooth talkers notice her.
  if (boss?.spouseId && c.gender === 'M' && c.id !== boss.spouseId && (c.faction !== 'player' || c.traits.includes('Womanizer'))) ids.add(boss.spouseId);
  for (const id of minds) if (id !== c.id && s.characters[id]?.faction === c.faction) { ids.add(id); if (ids.size > 9) break; }
  ids.delete(c.id);
  return [...ids].filter((id) => s.characters[id]?.alive).slice(0, 10);
}

/** His best move right now over everyone around him (pure). */
export function bestMove(s: GameState, c: Character): Weighed | undefined {
  let best: Weighed | undefined;
  for (const t of circleOf(s, c)) {
    const w = weigh(s, c.id, t)[0];
    if (w && (!best || w.score > best.score || (w.score === best.score && w.t < best.t))) best = w;
  }
  return best;
}

/** One week of NPC initiative. Returns the lines (also in the log). */
export function npcWeek(ctx: Ctx): string[] {
  const s = ctx.s;
  const D = ensureDeeds(s);
  const lines: string[] = [];
  // Asks the boss let lapse: the man takes it as an answer.
  for (const k of D.asks.filter((x) => s.week - x.w > ASK_TTL)) {
    const a = s.characters[k.a];
    if (a?.alive && k.d !== 'clash' && k.d !== 'wife' && k.d !== 'insult') addOpinion(s, a.id, s.playerId, 'The boss never answered me', -4, 1);
    D.asks = D.asks.filter((x) => x !== k);
  }
  const ids = Object.keys(s.minds?.minds ?? {}).filter((id) => s.characters[id]?.alive && isFree(s, s.characters[id]) && id !== s.playerId)
    .sort((x, y) => (D.last[x] ?? -99) - (D.last[y] ?? -99) || x.localeCompare(y));
  let budget = ACT_BUDGET;
  for (const id of ids) {
    if (budget <= 0) break;
    if (s.week - (D.last[id] ?? -99) < ACT_GAP) continue;
    const c = s.characters[id];
    const w = bestMove(s, c);
    D.last[id] = s.week;
    if (!w || w.score < ACT_THRESHOLD) continue;
    // He might, he might not: a sure thing he does; a near thing now and then.
    const p = Math.min(0.85, 0.25 + (w.score - ACT_THRESHOLD) / 60);
    if (d01(D) > p) continue;
    budget--;
    const line = act(ctx, c, w);
    if (line) lines.push(line);
  }
  return lines;
}

function act(ctx: Ctx, c: Character, w: Weighed): string | undefined {
  const s = ctx.s;
  const D = ensureDeeds(s);
  const def = DEEDS[w.id];
  const boss = s.characters[s.playerId];
  // An ask of the boss waits for his answer.
  if (w.t === s.playerId && def.ask) {
    if (D.asks.length >= ASK_CAP || D.asks.some((x) => x.a === c.id)) return undefined;
    const n = w.id === 'askLoan' ? Math.max(500, Math.min(5000, Math.round(Math.max(1000, 6000 - c.wealth) / 500) * 500))
      : w.id === 'askFavor' ? Math.max(300, Math.min(1500, Math.round(c.attributes.leadership * 15 / 100) * 100))
      : w.id === 'offerPiece' ? Math.min(2000, Math.max(500, Math.round(c.wealth * 0.08 / 100) * 100)) : undefined;
    pushAsk(s, { d: w.id, a: c.id, p: Math.round(w.chance * 100), ...(n ? { n } : {}) });
    return `${displayName(c)} wants a word with you.`;
  }
  const res = doDeed(ctx, w.id, c.id, w.t);
  if (!res) return undefined;
  // An insult to the boss wants an answer; a man calling on the boss's wife is noticed.
  const fresh = (key: string) => { if (D.told[key] !== undefined && s.week - D.told[key] < 20) return false; D.told[key] = s.week; return true; };
  if (w.t === s.playerId && w.id === 'insult' && res.r !== 'fail' && fresh(`insult:${c.id}`)) pushAsk(s, { d: 'insult', a: c.id, p: 0, y: res.line });
  if (boss?.spouseId === w.t && (w.id === 'befriend' || w.id === 'flatter' || w.id === 'feast') && (res.r === 'success' || res.r === 'crit') && fresh(`wife:${c.id}`)) pushAsk(s, { d: 'wife', a: c.id, t: w.t, p: 0, y: res.line });
  return res.line;
}

export function pushAsk(s: GameState, k: Omit<Ask, 'id' | 'w'>): void {
  const D = ensureDeeds(s);
  if (D.asks.length >= ASK_CAP) return;
  if (D.asks.some((x) => x.a === k.a && x.d === k.d)) return;
  D.asks.push({ id: `dk${s.nextId++}`, w: s.week, ...k });
  D.stats.asks++;
}
