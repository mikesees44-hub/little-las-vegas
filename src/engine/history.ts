import { compareDates } from './calendar';
import type { GameDate, GameState } from './types';

/**
 * Real-world backdrop dates the game reacts to. These are the only real
 * events referenced; real people appear only as distant backdrop (Angelo
 * Bruno is never playable, never quoted).
 */
export interface HistoryDate {
  key: string;
  date: GameDate;
}

export const HISTORY_DATES: Record<string, GameDate> = {
  wireAct: { y: 1961, m: 9, d: 13 },
  valachi: { y: 1963, m: 9, d: 25 },
  omnibus: { y: 1968, m: 6, d: 19 },
  rico: { y: 1970, m: 10, d: 15 },
  referendum1974: { y: 1974, m: 11, d: 5 },
  referendum1976: { y: 1976, m: 11, d: 2 },
  firstCasino: { y: 1978, m: 5, d: 26 },
  brunoKilled: { y: 1980, m: 3, d: 21 },
};

export function reached(s: GameState, key: keyof typeof HISTORY_DATES): boolean {
  return compareDates(s.date, HISTORY_DATES[key]) >= 0;
}
