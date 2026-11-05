import type { DeskUi } from '../../engine/desk';
import type { GameState } from '../../engine/types';
import { DOMAIN_HOMES, homeOfDeskItem } from './homeDomain';
import { needsFor } from './placeFront';
import type { HomeId } from './routes';

/**
 * THE ROUND (STREAMLINE_2 §5.2): in turn mode, a checklist of seven stops a turn: Needs you, then
 * Family, Crew, Money, Law, Rivals, Town. Offered, never forced: ending the turn is always allowed,
 * and what is left is settled by the delegation level, the standing orders, and each event's default.
 *
 * A stop is ticked when he opened its front page and nothing there still waits on him (answered,
 * delegated or left counts). A stop with nothing in it at all is ticked from the start: "Quiet".
 * Pure.
 */
export type RoundStop = 'needs' | Exclude<HomeId, 'desk'>;
export const ROUND_STOPS: RoundStop[] = ['needs', ...DOMAIN_HOMES];

export interface RoundRow { stop: RoundStop; ticked: boolean; open: number; quiet: boolean }

export function roundOf(s: GameState, ui: DeskUi = {}, visited: ReadonlySet<string> = new Set()): RoundRow[] {
  const all = needsFor(s, 'desk', ui);
  const home = new Map(all.map((x) => [x.key, homeOfDeskItem(s, x)]));
  return ROUND_STOPS.map((stop) => {
    const items = stop === 'needs' ? all : all.filter((x) => home.get(x.key) === stop);
    const open = items.filter((x) => !x.done).length;
    const quiet = items.length === 0;
    // "Needs you" is the Desk itself: seen whenever its papers are all answered.
    const seen = stop === 'needs' || visited.has(stop);
    return { stop, open, quiet, ticked: quiet || (seen && open === 0) };
  });
}

/** "4 of 7". */
export function roundCount(rows: readonly RoundRow[]): { done: number; of: number } {
  return { done: rows.filter((r) => r.ticked).length, of: rows.length };
}
