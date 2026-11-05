import { deskQueue, type DeskQueueUi } from './attention';
import { displayName } from './characters';
import { tipOut } from './threats';
import type { GameState } from './types';

/**
 * WHAT STOPS TIME (pure). The running clock (ui/clockPolicy.ts) and a turn of several weeks
 * (engine/turn.ts, STREAMLINE_2 §5) stop for the same things, each behind its own Settings switch:
 *
 *  - autoPauses: a new red item on the Desk, an urgent meeting, a war or a battle, a death in the
 *    house, a plot against him uncovered (moved here from clockPolicy.ts, which re-exports it).
 *  - crisisAt: the turn's checks between two weeks: the above, plus a warned strike landing next week
 *    (a hit on the boss himself: Dead Man Walking), the Feds at the door (the case moves to a grand
 *    jury, an indictment, a trial; the seven days of a plot), a hurricane coming ashore next week,
 *    and the chair changing hands or the game ending (always).
 *
 * A crisis that is scheduled for the coming week ends the span the week BEFORE it, so the boss is
 * there for it. Nothing here reads anything the boss could not know.
 */

/** The auto-pause categories (each a setting; all on by default). */
export type PauseCat = 'red' | 'urgent' | 'war' | 'death' | 'plot' | 'strike';
export const PAUSE_CATS: { cat: PauseCat; key: 'pauseOnRed' | 'pauseOnUrgent' | 'pauseOnWar' | 'pauseOnLife' | 'pauseOnPlot' | 'pauseOnStrike'; label: string }[] = [
  { cat: 'strike', key: 'pauseOnStrike', label: 'A threat strikes (a raid at 2 a.m., a hit on Friday night): your call, now' },
  { cat: 'red', key: 'pauseOnRed', label: 'Something red lands on the Desk' },
  { cat: 'urgent', key: 'pauseOnUrgent', label: 'Someone asks for an urgent meeting' },
  { cat: 'war', key: 'pauseOnWar', label: 'A battle, or a war is declared' },
  { cat: 'death', key: 'pauseOnLife', label: 'A death (or a birth) in your house' },
  { cat: 'plot', key: 'pauseOnPlot', label: 'A plot against you is uncovered' },
];

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
  // A meeting counts the day it comes out on the clock (threats.ts tipOut), not the day the turn planned it.
  const urgentNow = new Set((next.threats?.tips ?? []).filter((t) => t.week >= next.week - 1 && tipOut(next, t)).map((t) => t.id));
  const urgentBefore = new Set((prev.threats?.tips ?? []).filter((t) => tipOut(prev, t)).map((t) => t.id));
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

/** The turn's stop categories, each with the Settings switch that allows it (off: settled by default, as the clock does). */
export type TurnStopCat = PauseCat | 'feds' | 'storm' | 'dmw' | 'chair';
export const TURN_STOP_KEY: Record<Exclude<TurnStopCat, 'chair'>, string> = {
  red: 'pauseOnRed', urgent: 'pauseOnUrgent', war: 'pauseOnWar', death: 'pauseOnLife', plot: 'pauseOnPlot', strike: 'pauseOnStrike',
  dmw: 'pauseOnStrike', feds: 'pauseOnArrest', storm: 'pauseOnWarning',
};

export interface TurnStop { cat: TurnStopCat; text: string }

const LEGAL_RANK: Record<string, number> = { quiet: 0, investigation: 1, grandjury: 2, indicted: 3, trial: 4, prison: 5, parole: 5 };
const LEGAL_WORDS: Record<string, string> = { grandjury: 'a grand jury is hearing your case', indicted: 'you are indicted', trial: 'your trial is set', prison: 'the verdict is in' };

/**
 * Between two weeks of a turn: the first thing the boss should be there for, or undefined. `on` says
 * whether a Settings switch is on (default: all on); `acked` are red Desk items already stopped for.
 */
export function crisisAt(prev: GameState, next: GameState, opts: { on?: (key: string) => boolean; acked?: ReadonlySet<string>; ui?: DeskQueueUi } = {}): TurnStop | undefined {
  const on = opts.on ?? (() => true);
  if (next.gameOver) return { cat: 'chair', text: 'The game is over' };
  if (next.playerId !== prev.playerId) {
    const c = next.characters[next.playerId];
    return { cat: 'chair', text: `The chair has changed hands${c ? `: ${displayName(c)} sits in it now` : ''}` };
  }
  const out: TurnStop[] = [];
  // A warned strike due in the coming week (the tip is out): be there for its night. Aimed at the boss himself: Dead Man Walking.
  const T = next.threats;
  if (T) {
    for (const tip of T.tips) {
      if (!tipOut(next, tip) || tip.deadline !== next.week) continue;
      const th = tip.threatId ? T.threats.find((x) => x.id === tip.threatId) : undefined;
      if (tip.threatId && !th) continue; // already landed or foiled
      const me = tip.targetId === next.playerId;
      out.push({ cat: me ? 'dmw' : 'strike', text: me ? `${tip.sourceName} says they are coming for you this week` : `${tip.sourceName}'s warning lands this week: ${tip.hint}` });
    }
  }
  // Moved from the clock: red, urgent, war, death, plot.
  for (const w of autoPauses(prev, next, opts.acked ?? new Set(), opts.ui)) out.push(w);
  // The Feds at the door: the case moves up a stage that matters.
  const a = LEGAL_RANK[prev.legal?.stage ?? 'quiet'] ?? 0;
  const b = LEGAL_RANK[next.legal?.stage ?? 'quiet'] ?? 0;
  if (b > a && b >= 2) out.push({ cat: 'feds', text: `The Feds are at the door: ${LEGAL_WORDS[next.legal!.stage] ?? 'the case moved'}` });
  if (!prev.feds?.hollow?.crisis && next.feds?.hollow?.crisis) out.push({ cat: 'dmw', text: 'The seven days: your capos are moving against you' });
  // A hurricane coming ashore in the coming week.
  if (next.flags?.storm_week === next.week && !next.flags?.storm_landed && prev.flags?.storm_week !== prev.week) out.push({ cat: 'storm', text: 'A hurricane comes ashore this week' });
  return out.find((x) => x.cat === 'chair' || on(TURN_STOP_KEY[x.cat as Exclude<TurnStopCat, 'chair'>]));
}
