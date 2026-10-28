import { knownSecrets } from '../secrets';
import { opinion } from '../relations';
import type { GameState } from '../types';
import { factText, nameOf, sureWord } from './beliefs';
import { initialAmbition } from './goals';
import { gratitude, grudge } from './memory';
import { planLine } from './planner';
import { drives, moodOf, riskTolerance, satisfaction, urgencies } from './psyche';
import { importance, mindOf } from './state';
import {
  AMBITION_TEXT, GOAL_TEXT, MOOD_TEXT, NEED_LABEL, NEED_TEXT, NEEDS, PLAN_TEXT, SECRET_PLANS,
  type Mind, type Mood, type Motive, type Need,
} from './types';

/**
 * What the screens show of a mind: needs, mood, ambition and goals, what he
 * believes about the boss, what he remembers, what he is up to, and "Why did
 * he do that?". Only what the boss could know: secret acts and secret plans
 * stay "his own business" until the boss has something on him, and what he
 * has heard about others he shares only with a boss he trusts (or in a talk).
 * Hidden truths (is the rumor so?) are never shown.
 */

export interface MindView {
  full: boolean;
  mood: Mood;
  moodText: string;
  valence: number;
  drives: { need: Need; label: string; weight: number; sat: number; urgency: number }[];
  risk: number;
  ambition?: { text: string; progress: number; target?: string };
  goals: string[];
  plan?: string;
  aboutBoss?: string;
  /** What he has heard (shown when he would tell the boss). */
  heard: string[];
  heardHidden: boolean;
  memories: { text: string; v: number; who?: string; week: number }[];
  grudges: { name: string; g: number }[];
  debts: { name: string; g: number }[];
  why: { week: number; text: string; act: string }[];
  hiddenWhy: number;
}

/** "Needs money → wants to put a little aside → believes the boss could go either way → kept a little back". */
export function chainText(m: Pick<Motive, 'n' | 'g' | 'b' | 'a' | 'c'>): string {
  const parts = [`He ${NEED_TEXT[m.n]}`];
  if (m.g) parts.push(/^[a-z]/.test(m.g) ? `wants to ${m.g}` : `working on: ${m.g}`);
  if (m.b) parts.push(`${m.b}`);
  parts.push(`so he ${m.a}${m.c && m.c.startsWith('over ') ? ` (${m.c})` : ''}`);
  return parts.join(' → ');
}

function bossCouldKnow(s: GameState, id: string): boolean {
  return knownSecrets(s, id).length > 0;
}

export function mindView(s: GameState, id: string): MindView | undefined {
  const c = s.characters[id];
  if (!c || id === s.playerId) return undefined;
  const m = mindOf(s, id);
  const lite = !m;
  const look = { bossStrength: 50, threatened: new Set<string>(), turf: {} };
  const d = drives(s, c);
  const sat = m?.sat.length ? m.sat : satisfaction(s, c, look);
  const mm: Pick<Mind, 'mem' | 'plan'> = m ?? { mem: [] };
  const mood = m ? { mood: m.mood, mv: m.mv } : moodOf(c, d, sat, mm, s.week);
  const u = urgencies(d, sat);
  const trusts = opinion(s, id, s.playerId) >= 20;
  const knows = bossCouldKnow(s, id);
  const amb = m?.amb ?? (c.alive ? initialAmbition(s, c) : undefined);
  const secretPlan = m?.plan && SECRET_PLANS.includes(m.plan.k);
  const b = m?.bel[s.playerId];
  const why = (m?.why ?? []).filter((x) => !x.h || knows);
  return {
    full: !lite,
    mood: mood.mood,
    moodText: MOOD_TEXT[mood.mood],
    valence: mood.mv,
    drives: NEEDS.map((n, i) => ({ need: n, label: NEED_LABEL[n], weight: d[n], sat: sat[i] ?? 50, urgency: u[n] })).sort((a, b2) => b2.urgency - a.urgency),
    risk: riskTolerance(s, c, mood.mood),
    ...(amb ? { ambition: { text: AMBITION_TEXT[amb.k], progress: amb.p, ...(amb.t ? { target: nameOf(s, amb.t) } : {}) } } : {}),
    goals: (m?.goals ?? []).map((g) => `${GOAL_TEXT[g.k]}${g.t && g.k !== 'smear' ? ` (${nameOf(s, g.t)})` : ''}`).filter((_, i) => !(m!.goals[i].k === 'skim' || m!.goals[i].k === 'smear') || knows),
    ...(m?.plan ? { plan: secretPlan && !knows ? 'He keeps his business to himself.' : planLine(s, m) ?? PLAN_TEXT[m.plan.k] } : {}),
    ...(b?.t !== undefined ? { aboutBoss: `He ${sureWord(b.tc ?? 0)} you ${b.t >= 25 ? 'have his back' : b.t <= -25 ? 'are against him' : 'could go either way on him'}${b.s !== undefined ? `, and that your crew is ${b.s >= 60 ? 'strong' : b.s <= 35 ? 'weak' : 'middling'}` : ''}.` } : {}),
    heard: trusts ? (m?.facts ?? []).filter((f) => f.src !== 'lie' && f.c >= 0.3).map((f) => `He ${sureWord(f.c)} ${factText(s, f)}${f.from ? ` (from ${nameOf(s, f.from)})` : ''}.`) : [],
    heardHidden: !trusts && (m?.facts.some((f) => f.src !== 'lie' && f.c >= 0.3) ?? false),
    memories: (m?.mem ?? []).slice().sort((a, b2) => Math.abs(b2.v) * b2.s - Math.abs(a.v) * a.s).slice(0, 5)
      .map((x) => ({ text: x.t, v: Math.round(x.v * x.s), ...(x.who ? { who: nameOf(s, x.who) } : {}), week: x.w })),
    grudges: whoFrom(s, m, 'g'),
    debts: whoFrom(s, m, 'd'),
    why: why.slice().reverse().map((x) => ({ week: x.w, text: chainText(x), act: x.a })),
    hiddenWhy: (m?.why.length ?? 0) - why.length,
  };
}

function whoFrom(s: GameState, m: Mind | undefined, kind: 'g' | 'd'): { name: string; g: number }[] {
  if (!m) return [];
  const ids = [...new Set(m.mem.map((x) => x.who).filter((x): x is string => !!x))];
  return ids.map((id) => ({ name: nameOf(s, id), g: kind === 'g' ? grudge(m, id) : gratitude(m, id), alive: s.characters[id]?.alive }))
    .filter((x) => x.g >= 5 && x.alive).sort((a, b) => b.g - a.g).slice(0, 3).map(({ name, g }) => ({ name, g }));
}

/** Is this one of the people with a full mind (or would be)? */
export function hasMind(s: GameState, id: string): boolean {
  if (mindOf(s, id)) return true;
  const c = s.characters[id];
  return !!c && importance(s, c) >= 35;
}

/** The last thing he did and why, in one line (for hover). */
export function lastWhy(s: GameState, id: string): string | undefined {
  const v = mindView(s, id);
  return v?.why[0]?.text;
}
