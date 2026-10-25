import { capos, crew } from '../../engine/characters';
import { RISE_GOALS } from '../../engine/riseGoals';
import type { GameState } from '../../engine/types';
import type { Route } from './routes';

/**
 * The guided first season, "Memorial Day to Labor Day": one goal at a time,
 * each with a "Show me" that opens the right drawer and pulses the target.
 * Built on the Rise to Power ladder (riseGoals.ts); two UI-only first steps
 * teach the sheet and the council. UI flags live in localStorage.
 */
export interface UiGoalFlags { metUnderboss?: boolean; gaveTask?: boolean }

export interface GuidedGoal {
  id: string;
  title: string;
  hint: string;
  done: boolean;
  show?: { route?: Route; tour?: string; focus?: 'wildwood' };
}

const rise = (id: string) => RISE_GOALS.find((g) => g.id === id)!;
const riseDone = (s: GameState, id: string) => !!s.flags[`rgoal_${id}`] || rise(id).done(s);

export function guidedGoals(s: GameState, ui: UiGoalFlags): GuidedGoal[] {
  const leaking = s.districts.filter((d) => (d.influence.player ?? 0) >= 40 && !(d.capoId && s.characters[d.capoId]?.alive)).length;
  const hasUb = crew(s).some((c) => c.rank === 'underboss');
  const season1: GuidedGoal[] = [
    { id: 'meet', title: 'Meet your people: open your underboss\'s sheet', hint: 'Every face opens the man. Right-click a face for everything you can do to him.', done: !!ui.metUnderboss || !hasUb, show: { route: { panel: 'borgata', section: 'council' }, tour: 'seat-underboss' } },
    { id: 'task', title: 'Give a council seat a job', hint: 'Each seat does one job a week. Pick a task; it is an order, carried out when you advance the week.', done: !!ui.gaveTask, show: { route: { panel: 'borgata', section: 'council' }, tour: 'seat-task' } },
    { id: 'second_racket', title: rise('second_racket').title, hint: 'Click a district on the map, or open Holdings: a bookmaking room or a luncheonette. More places, more envelopes.', done: riseDone(s, 'second_racket'), show: { route: { panel: 'holdings', section: 'rackets' }, tour: 'text:Open a business', focus: 'wildwood' } },
    { id: 'first_summer', title: rise('first_summer').title, hint: 'The Season pays ×2.5 until Labor Day. Watch the This Week card.', done: riseDone(s, 'first_summer'), show: { tour: 'treasury' } },
    { id: 'capos', title: 'Put a capo in every district you hold', hint: 'A district without a capo leaks its take. Compare the candidates and appoint one.', done: leaking === 0 && capos(s).length > 0, show: { route: { panel: 'borgata', section: 'capos' }, tour: 'next-capo' } },
    { id: 'make_a_man', title: rise('make_a_man').title, hint: rise('make_a_man').hint, done: riseDone(s, 'make_a_man'), show: { route: { panel: 'borgata', section: 'membership' } } },
    { id: 'survive_winter', title: rise('survive_winter').title, hint: rise('survive_winter').hint, done: riseDone(s, 'survive_winter') },
  ];
  const season2: GuidedGoal[] = [
    { id: 'philly_notice', title: rise('philly_notice').title, hint: rise('philly_notice').hint, done: riseDone(s, 'philly_notice') },
    { id: 'two_capos', title: rise('two_capos').title, hint: rise('two_capos').hint, done: riseDone(s, 'two_capos'), show: { route: { panel: 'borgata', section: 'chart' } } },
    { id: 'a_dozen', title: rise('a_dozen').title, hint: rise('a_dozen').hint, done: riseDone(s, 'a_dozen'), show: { route: { panel: 'borgata', section: 'membership' } } },
  ];
  return [...season1, ...season2];
}

const KEY = (seed: string) => `llv-goals-${seed}`;
export function loadGoalFlags(seed: string): UiGoalFlags {
  try { return JSON.parse(localStorage.getItem(KEY(seed)) ?? '{}') as UiGoalFlags; } catch { return {}; }
}
export function saveGoalFlags(seed: string, f: UiGoalFlags): void {
  try { localStorage.setItem(KEY(seed), JSON.stringify(f)); } catch { /* not remembered */ }
}
