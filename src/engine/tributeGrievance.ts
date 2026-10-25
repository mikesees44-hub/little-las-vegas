import { player } from './characters';
import { interval } from './grievances';
import { addStory } from './hierarchy';
import { addOpinion, changeMeter } from './relations';
import { pw, type Grievance } from './powerState';
import { ensureTribute } from './tributeState';
import type { GameState } from './types';

/**
 * Money grievances become persistent storylines: the take hands them to the
 * power layer's grievance ladder (grievances.ts: disappointed → private
 * resentment → faction building → open disagreement → breakdown → crisis),
 * so a man who was denied a fair assessment, held back over his end, or
 * refused a bigger share keeps it, and it climbs at his own pace.
 * Repeats feed the same grievance (severity grows) instead of opening a new one.
 */

export const MONEY_POST = 'money';

export function moneyGrievance(s: GameState, charId: string, why: string, severity: number): Grievance | undefined {
  const c = s.characters[charId];
  if (!c?.alive || charId === s.playerId) return undefined;
  const p = pw(s);
  const t = ensureTribute(s);
  const open = p.grievances.find((g) => g.charId === charId && g.post === MONEY_POST && g.status === 'open');
  const boss = player(s);
  if (open) {
    open.severity = Math.min(100, open.severity + Math.round(severity / 2));
    open.reasons = [...open.reasons, { label: why, value: Math.round(severity / 2) }].slice(-6);
    addStory(s, c, `Still sore about his end of the take: ${why}.`);
    return open;
  }
  const g: Grievance = {
    id: `g${s.nextId++}`, charId, post: MONEY_POST, postLabel: 'a fair end of the take', byId: boss.id, severity: Math.min(100, severity),
    witnesses: 1, week: s.week, stage: 0, status: 'open', reasons: [{ label: why, value: severity }], public: false, next: s.week + interval(s, c),
  };
  p.grievances.push(g);
  p.stats.grievances++;
  (t.moneyGrievances ??= []).push(g.id);
  if (t.moneyGrievances.length > 40) t.moneyGrievances = t.moneyGrievances.slice(-40);
  addOpinion(s, charId, boss.id, 'Cheated on my end', -Math.round(severity / 4), 1);
  changeMeter(s, charId, boss.id, 'grievance', Math.round(severity / 3));
  addStory(s, c, `Has a grievance about his end of the take: ${why}.`);
  return g;
}

/** Settle a man's open money grievance (amends, a better contract). */
export function settleMoneyGrievance(s: GameState, charId: string, how: string): void {
  for (const g of s.power?.grievances ?? []) {
    if (g.charId !== charId || g.post !== MONEY_POST || g.status !== 'open') continue;
    g.status = 'resolved';
    g.resolution = how;
    addStory(s, s.characters[charId], `His grievance over his end was settled: ${how}.`);
  }
}

/** The take's grievances, newest first (UI and the report). */
export function moneyGrievances(s: GameState): Grievance[] {
  const ids = new Set(s.tribute?.moneyGrievances ?? []);
  return (s.power?.grievances ?? []).filter((g) => ids.has(g.id) || g.post === MONEY_POST).sort((a, b) => b.week - a.week);
}
