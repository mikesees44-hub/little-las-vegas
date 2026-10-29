import { hashSeed, rand } from '../rng';
import type { GameState } from '../types';
import type { ReactionsState } from './types';

/** The reactions layer, made on first use. */
export function ensureReactions(s: GameState): ReactionsState {
  if (!s.reactions) {
    s.reactions = {
      v: 1, rng: hashSeed(`${s.seed}:reactions`), q: [], log: [], pw: s.week, pops: 0, sulk: {}, pr: {}, pl: -99,
      stats: { n: 0, pops: 0, minor: 0, props: 0, declined: 0, smoothed: 0 },
    };
  }
  const R = s.reactions;
  R.q ??= [];
  R.log ??= [];
  R.sulk ??= {};
  R.pr ??= {};
  R.pl ??= -99;
  R.pw ??= s.week;
  R.pops ??= 0;
  R.stats ??= { n: 0, pops: 0, minor: 0, props: 0, declined: 0, smoothed: 0 };
  return R;
}

/** The reactions' own dice. */
export function r01(R: ReactionsState): number {
  return rand(R);
}

/** A sulking man holds back on his envelope (tribute.ts reads this). */
export function sulkOdds(s: GameState, id: string): number {
  const until = s.reactions?.sulk[id];
  return until !== undefined && until > s.week ? 0.15 : 0;
}
