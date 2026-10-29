import { deskQueue, type DeskQueueUi } from '../engine/attention';
import type { GameState } from '../engine/types';

/**
 * THE CLOCK RUNS (Crusader Kings style; the owner's rule: "the clock needs to move"). Pure policy,
 * tested on its own (tests/clock.test.ts):
 *
 *  - Running is the default. The boss pauses (Space) to set up, picks a speed (1-5), or skips ahead
 *    (to the next morning, the next week, the next month).
 *  - Menus never stop it. Only a DECISION CARD (a decision, an urgent meeting, the ready-to-advance
 *    review, the sit-down, a cutscene, a minigame) holds the clock while it is open.
 *  - It pauses itself for what a boss must see, each a setting: a new red item on the Desk, an urgent
 *    meeting, a battle or a war declared, a death in the family, a plot against him uncovered. Every
 *    pause is said once (a red item paused for is not paused for again). Everything routine flows.
 *  - Number keys: 1-5 set the speed only while no decision card is open; inside a card they pick a
 *    choice, as always.
 */
export type ClockSpeed = 0 | 1 | 2 | 3 | 4 | 5;
/** Milliseconds per day at each speed. */
// A CK pace (the playthrough: speed 1 ran two days in five seconds): about five seconds a day at the slowest.
export const CLOCK_MS: Record<Exclude<ClockSpeed, 0>, number> = { 1: 5000, 2: 3000, 3: 1800, 4: 900, 5: 350 };
export const CLOCK_NAME: Record<ClockSpeed, string> = { 0: 'Paused', 1: 'Slow', 2: 'Normal', 3: 'Brisk', 4: 'Fast', 5: 'Fastest' };
/** The speed a new game (and a loaded one) starts at. */
export const DEFAULT_SPEED: ClockSpeed = 2;

/** The auto-pause categories (each a setting; all on by default). */
export type PauseCat = 'red' | 'urgent' | 'war' | 'death' | 'plot';
export const PAUSE_CATS: { cat: PauseCat; key: 'pauseOnRed' | 'pauseOnUrgent' | 'pauseOnWar' | 'pauseOnLife' | 'pauseOnPlot'; label: string }[] = [
  { cat: 'red', key: 'pauseOnRed', label: 'Something red lands on the Desk' },
  { cat: 'urgent', key: 'pauseOnUrgent', label: 'Someone asks for an urgent meeting' },
  { cat: 'war', key: 'pauseOnWar', label: 'A battle, or a war is declared' },
  { cat: 'death', key: 'pauseOnLife', label: 'A death (or a birth) in your house' },
  { cat: 'plot', key: 'pauseOnPlot', label: 'A plot against you is uncovered' },
];

/** The 1-5 keys: the speed they set, only when no decision card is open (inside a card they pick a choice). */
export function speedKey(key: string, cardOpen: boolean): ClockSpeed | undefined {
  if (cardOpen || !/^[1-5]$/.test(key)) return undefined;
  return Number(key) as ClockSpeed;
}

/** Red items on the Desk right now (keys). */
export function redKeys(s: GameState, ui: DeskQueueUi = {}): string[] {
  try { return deskQueue(s, ui).needs.filter((x) => x.tone === 'red').map((x) => x.key); } catch { return []; }
}

export interface PauseWhy { cat: PauseCat; text: string }

/**
 * What happened between two states that the clock should stop for (by category), given the red
 * items already paused for (`acked`). Routine changes return nothing.
 */
export function autoPauses(prev: GameState, next: GameState, acked: ReadonlySet<string>, ui: DeskQueueUi = {}): PauseWhy[] {
  const out: PauseWhy[] = [];
  const urgentNow = new Set((next.threats?.tips ?? []).filter((t) => t.week >= next.week - 1).map((t) => t.id));
  const urgentBefore = new Set((prev.threats?.tips ?? []).map((t) => t.id));
  const reds = redKeys(next, ui).filter((k) => !acked.has(k));
  const newTips = [...urgentNow].filter((id) => !urgentBefore.has(id));
  if (newTips.length) out.push({ cat: 'urgent', text: 'Someone wants to see you, urgently' });
  // Reds beyond the urgent meetings (tips are their own category).
  const otherReds = reds.filter((k) => !k.startsWith('tip:'));
  if (otherReds.length) out.push({ cat: 'red', text: 'Something needs you on the Desk' });
  const wars = (next.wars ?? []).filter((w) => !(prev.wars ?? []).some((v) => v.id === w.id));
  if (wars.length) out.push({ cat: 'war', text: 'War has been declared' });
  else if ((next.army?.history?.length ?? 0) > (prev.army?.history?.length ?? 0)) out.push({ cat: 'war', text: 'A battle was fought' });
  for (const c of Object.values(next.characters)) {
    const was = prev.characters[c.id];
    if (was?.alive && !c.alive && (c.dynasty || c.id === prev.playerId)) { out.push({ cat: 'death', text: `${c.firstName} ${c.lastName} has died` }); break; }
  }
  const plot = (next.schemes ?? []).find((x) => x.owner !== 'player' && x.targetId === next.playerId && x.discovered && !(prev.schemes ?? []).some((y) => y.id === x.id && y.discovered));
  if (plot) out.push({ cat: 'plot', text: 'A plot against you is uncovered' });
  return out;
}

/** The first pause the settings allow (undefined: the clock keeps moving). */
export function firstPause(whys: readonly PauseWhy[], on: (key: PauseCatKey) => boolean): PauseWhy | undefined {
  return whys.find((w) => on(PAUSE_CATS.find((p) => p.cat === w.cat)!.key));
}
export type PauseCatKey = (typeof PAUSE_CATS)[number]['key'];
