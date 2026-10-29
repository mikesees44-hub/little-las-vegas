import { displayName } from '../characters';
import { riskTolerance } from '../minds/psyche';
import { mindOf } from '../minds/state';
import { AMBITION_TEXT, GOAL_TEXT } from '../minds/types';
import { getRelation, opinion } from '../relations';
import { knownSecrets } from '../secrets';
import type { GameState } from '../types';
import { DEEDS } from './catalog';
import { weigh } from './npc';
import { owedBy, tiesOf } from './state';
import { TIE_LABEL, type Axis } from './types';
import { AXIS_WORD, axesOf, leanWords } from './weights';

/**
 * "HOW HE LEANS": the AI weights of one man, in plain words with numbers
 * (Hot-headed +35 toward violence, Greedy +30 toward money, Cowardly −30
 * against risk, Ambitious +25 toward your seat), his ambition and goals, and
 * the top three moves he is weighing about the boss with their scores — the
 * very numbers his choices are made from (npc.ts `weigh`). Fogged by how well
 * the boss knows him: secrets, hooks, his trust, blood and the crew, talks
 * and favors open him up; a stranger shows only his traits.
 */

export interface LeansView {
  /** 0 a stranger · 1 you know his nature · 2 you know what he wants · 3 you can read him. */
  know: 0 | 1 | 2 | 3;
  knowText: string;
  /** What lets you read him (and how much each is worth). */
  knowWhy: { label: string; value: number }[];
  weights: { text: string; value: number }[];
  axes: { axis: Axis; label: string; value: number }[];
  risk?: number;
  ambition?: string;
  goals: string[];
  /** The moves he is weighing about the boss: titles always at 2+, scores and reasons at 3. */
  weighing: { title: string; score?: number; why?: string[]; odds?: number }[];
  ties: { name: string; kind: string; why: string }[];
  owesYou: number;
  youOwe: number;
  /** Lines held back by the fog. */
  hidden: number;
}

const KNOW_TEXT = ['A stranger: you know his face, not his mind.', 'You know his nature.', 'You know what he wants.', 'You can read him like the racing form.'];

/** How well the boss knows him (0-100+), and why. Pure. */
export function knowledge(s: GameState, id: string): { v: number; why: { label: string; value: number }[] } {
  const c = s.characters[id];
  const boss = s.characters[s.playerId];
  const why: { label: string; value: number }[] = [];
  if (!c || !boss) return { v: 0, why };
  const add = (label: string, value: number) => { if (value > 0) why.push({ label, value: Math.round(value) }); };
  if (boss.spouseId === id) add('Your wife', 60);
  else if (c.dynasty) add('Your blood', 40);
  if (c.faction === 'player' && c.rank !== 'civilian') add(c.rank === 'capo' || c.rank === 'underboss' || c.rank === 'consigliere' ? 'One of your top men' : 'One of your crew', c.rank === 'capo' || c.rank === 'underboss' || c.rank === 'consigliere' ? 35 : 20);
  add('Secrets you know', Math.min(50, knownSecrets(s, id).length * 25));
  add('A hook on him', s.hooks.some((h) => h.holder === 'player' && h.targetId === id) ? 20 : 0);
  const rel = getRelation(s, id, s.playerId);
  add('He trusts you', rel ? Math.max(0, (rel.trust - 30) / 2) : 0);
  add('He likes you', Math.max(0, opinion(s, id, s.playerId) - 20) / 3);
  add('Talks with him', Math.min(30, (s.minds?.heard ?? []).filter((h) => h.from === id).length * 10));
  add('Favors between you', Math.min(20, (owedBy(s, id, s.playerId) + owedBy(s, s.playerId, id)) * 10));
  add('Dealings lately', Math.min(20, (s.deeds?.log ?? []).filter((l) => (l.a === id && l.t === s.playerId) || (l.t === id && l.a === s.playerId)).length * 5));
  return { v: why.reduce((a, x) => a + x.value, 0), why: why.sort((a, b) => b.value - a.value) };
}

export function leansView(s: GameState, id: string): LeansView | undefined {
  const c = s.characters[id];
  if (!c?.alive || id === s.playerId) return undefined;
  const k = knowledge(s, id);
  const know: 0 | 1 | 2 | 3 = k.v >= 70 ? 3 : k.v >= 45 ? 2 : k.v >= 20 ? 1 : 0;
  const words = leanWords(c);
  const ax = axesOf(c);
  const axes = (Object.keys(ax) as Axis[]).filter((a) => ax[a]).map((a) => ({ axis: a, label: AXIS_WORD[a], value: ax[a] })).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const m = mindOf(s, id);
  const goals = (m?.goals ?? []).filter((g) => g.k !== 'skim' && g.k !== 'smear').map((g) => `${GOAL_TEXT[g.k]}${g.t ? ` (${s.characters[g.t] ? displayName(s.characters[g.t]) : '?'})` : ''}`);
  const w = know >= 2 ? weigh(s, id, s.playerId).slice(0, 3) : [];
  const weighing = w.map((x) => know >= 3
    ? { title: DEEDS[x.id].name({ s, a: c, t: s.characters[s.playerId], boss: false, tBoss: true }), score: x.score, why: x.why.slice(0, 3).map((r) => `${r.value > 0 ? '+' : '−'}${Math.abs(r.value)} ${r.label}`), odds: Math.round(x.chance * 100) }
    : { title: DEEDS[x.id].name({ s, a: c, t: s.characters[s.playerId], boss: false, tBoss: true }) });
  const ties = tiesOf(s, id).filter((x) => s.characters[x.other]?.alive).map((x) => ({ name: x.other === s.playerId ? 'you' : displayName(s.characters[x.other]), kind: TIE_LABEL[x.tie.k], why: x.tie.y }));
  const shownWeights = know >= 1 ? words.slice(0, 6) : [];
  const hidden = (know < 1 ? words.length : 0) + (know < 2 ? goals.length + (m?.amb ? 1 : 0) + 3 : 0) + (know < 3 && know >= 2 ? w.length : 0);
  return {
    know,
    knowText: KNOW_TEXT[know],
    knowWhy: k.why,
    weights: shownWeights.map((x) => ({ text: x.text, value: x.value })),
    axes: know >= 1 ? axes : [],
    ...(know >= 1 ? { risk: riskTolerance(s, c, m?.mood) } : {}),
    ...(know >= 2 && m?.amb ? { ambition: AMBITION_TEXT[m.amb.k] } : {}),
    goals: know >= 2 ? goals : [],
    weighing: know >= 2 ? weighing : [],
    ties: know >= 1 ? ties : ties.filter((t) => t.kind === TIE_LABEL.feud),
    owesYou: owedBy(s, id, s.playerId),
    youOwe: owedBy(s, s.playerId, id),
    hidden,
  };
}
