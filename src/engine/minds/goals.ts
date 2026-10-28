import { hasTrait } from '../characters';
import { opinion } from '../relations';
import type { Character, GameState, PersonalGoal } from '../types';
import { worstGrudge } from './memory';
import { isHothead, isSchemer, topNeeds, urgencies, type Drives } from './psyche';
import { ageOf, clamp, rivalLedBy } from './state';
import { GOAL_CAP, type Ambition, type AmbitionKind, type Goal, type GoalKind, type Mind, type Need } from './types';

/**
 * Wants. One long AMBITION (become capo, take the chair, get out, avenge his
 * blood, marry well, make a score, rule the Shore) that persists and evolves
 * as it is reached or becomes impossible; and up to three short GOALS made
 * from his most urgent needs, coloured by his nature (a hothead confronts,
 * a schemer smears; a coward lies low; a loyalist serves).
 */

const FROM_PERSONAL: Record<PersonalGoal, AmbitionKind> = {
  get_made: 'made', own_bar: 'rich', become_capo: 'capo', get_out: 'out', get_rich: 'rich', take_chair: 'chair',
};

/** The ambition a man starts with, from who he is. */
export function initialAmbition(s: GameState, c: Character): Ambition {
  const w = s.week;
  const r = rivalLedBy(s, c.id);
  if (r) {
    if (r.kind === 'law') return { k: 'crown', p: 10, w };
    return { k: r.goal === 'conquer' || hasTrait(c, 'Ambitious') ? 'crown' : r.goal === 'enrich' ? 'rich' : 'keep', p: 20, w };
  }
  if (c.goal) {
    const k = FROM_PERSONAL[c.goal];
    if (k === 'made' && c.rank !== 'associate') return { k: c.rank === 'capo' ? 'chair' : 'capo', p: 10, w };
    if (k === 'capo' && c.rank === 'capo') return { k: hasTrait(c, 'Ambitious') ? 'chair' : 'rich', p: 10, w };
    return { k, p: 10, w };
  }
  const age = ageOf(s, c);
  if (c.faction !== 'player' || c.rank === 'civilian') {
    if (!c.spouseId && age >= 18 && age <= 40 && (hasTrait(c, 'Charming') || hasTrait(c, 'Ambitious'))) return { k: 'marry', p: 0, w };
    return { k: 'keep', p: 30, w };
  }
  if (age >= 58) return { k: 'out', p: 10, w };
  if (hasTrait(c, 'Ambitious')) return { k: c.rank === 'capo' || c.rank === 'underboss' ? 'chair' : 'capo', p: 5, w };
  if (hasTrait(c, 'Greedy') || hasTrait(c, 'Gambler')) return { k: 'score', p: 0, w };
  return { k: c.rank === 'associate' ? 'made' : 'rich', p: 10, w };
}

/** Progress, and what comes after: an ambition reached gives way to the next. Returns a line when it changes. */
export function evolveAmbition(s: GameState, c: Character, m: Mind): string | undefined {
  const a = m.amb ?? (m.amb = initialAmbition(s, c));
  const r = rivalLedBy(s, c.id);
  const next = (k: AmbitionKind, t?: string): string => {
    const was = a.k;
    m.amb = { k, ...(t ? { t } : {}), p: 0, w: s.week };
    return `${was}->${k}`;
  };
  switch (a.k) {
    case 'made':
      if (c.rank !== 'associate' && c.rank !== 'civilian') return next(hasTrait(c, 'Ambitious') ? 'capo' : 'rich');
      a.p = clamp(Math.round(20 + opinion(s, s.playerId, c.id) / 2 + (c.proposedWeek !== undefined ? 30 : 0)), 0, 95);
      break;
    case 'capo':
      if (c.rank === 'capo' || c.rank === 'underboss') return next(hasTrait(c, 'Ambitious') ? 'chair' : 'rich');
      a.p = clamp(Math.round(10 + opinion(s, s.playerId, c.id) / 2 + (c.rank === 'soldier' ? 20 : 0)), 0, 95);
      break;
    case 'chair':
      a.p = clamp(Math.round((c.rank === 'underboss' ? 40 : c.rank === 'capo' ? 20 : 5) + Math.max(0, -opinion(s, c.id, s.playerId)) / 3), 0, 90);
      break;
    case 'out':
      a.p = clamp(Math.round(c.wealth / 300), 0, 100);
      break;
    case 'avenge': {
      const t = a.t ? s.characters[a.t] : undefined;
      if (!t?.alive) return next(c.faction === 'player' ? (hasTrait(c, 'Ambitious') ? 'capo' : 'rich') : 'keep');
      break;
    }
    case 'marry':
      if (c.spouseId) return next('keep');
      break;
    case 'score':
    case 'rich':
      a.p = clamp(Math.round(r ? r.money / 400 : c.wealth / 200), 0, 100);
      if (a.p >= 100 && a.k === 'score') return next(ageOf(s, c) >= 50 ? 'out' : 'rich');
      break;
    case 'crown':
      a.p = clamp(Math.round(r ? Object.values(s.districts).reduce((x, d) => x + (d.influence[r.id] ?? 0), 0) / s.districts.length : 0), 0, 100);
      break;
    case 'keep':
      break;
  }
  // Late in life the young man's dream gives way.
  if (a.k !== 'out' && a.k !== 'avenge' && c.faction === 'player' && ageOf(s, c) >= 62 && !hasTrait(c, 'Ambitious')) return next('out');
  return undefined;
}

/** Turn a need into a goal, the way this man would. */
function goalFor(s: GameState, c: Character, m: Mind, n: Need, u: number): Goal | undefined {
  const until = s.week + 4 + (isSchemer(c) ? 4 : 0);
  const g = (k: GoalKind, t?: string): Goal => ({ k, n, ...(t ? { t } : {}), pri: Math.round(clamp(u * 2, 0, 1) * 100) / 100, w: s.week, until });
  const rival = rivalLedBy(s, c.id);
  switch (n) {
    case 'money':
      if (rival) return g('earn');
      return hasTrait(c, 'Greedy') && opinion(s, c.id, s.playerId) < 30 ? g('skim') : g('earn');
    case 'respect':
      if (isHothead(c)) { const wg = worstGrudge(s, m); return g('confront', wg?.who); }
      return rival ? g('expand') : g('prove');
    case 'safety':
      return hasTrait(c, 'Paranoid') && !rival ? g('protect') : g('lielow');
    case 'power':
      return rival ? g('expand') : g('following');
    case 'family':
      return g('family');
    case 'pleasure':
      return g('indulge');
    case 'revenge': {
      const wg = worstGrudge(s, m);
      if (!wg) return undefined;
      return isSchemer(c) ? g('smear', wg.who) : g('get_even', wg.who);
    }
    case 'loyalty':
      if (rival) return g('befriend');
      return opinion(s, c.id, s.playerId) >= 0 ? g('serve') : undefined;
  }
  return undefined;
}

/** Re-think the short goals: drop the stale and the met, add from the two most urgent needs. */
export function refreshGoals(s: GameState, c: Character, m: Mind, d: Drives): void {
  const u = urgencies(d, m.sat);
  m.goals = m.goals.filter((g) => g.until >= s.week && u[g.n] >= 0.08 && (!g.t || s.characters[g.t]?.alive));
  for (const n of topNeeds(u, 2)) {
    if (u[n] < 0.1) continue;
    const g = goalFor(s, c, m, n, u[n]);
    if (!g) continue;
    const ex = m.goals.find((x) => x.k === g.k);
    if (ex) { ex.until = g.until; ex.pri = g.pri; if (g.t) ex.t = g.t; continue; }
    m.goals.push(g);
  }
  m.goals.sort((a, b) => b.pri - a.pri || a.k.localeCompare(b.k));
  if (m.goals.length > GOAL_CAP) m.goals = m.goals.slice(0, GOAL_CAP);
}
