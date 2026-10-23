import { newGame } from '../src/engine/newGame';
import { advanceWeek } from '../src/engine/engine';
import { rand } from '../src/engine/rng';
import type { GameState, PlayerChoices } from '../src/engine/types';

/** Random-but-legal choices for every pending event, driven by the game's own RNG copy. */
export function randomChoices(s: GameState, salt = 0): PlayerChoices {
  const h = { rng: (s.rng ^ (0x9e3779b9 + salt)) >>> 0 };
  const choices: Record<string, string> = {};
  for (const ev of s.pendingEvents) {
    const legal = ev.choices.filter((c) => !c.disabledReason);
    choices[ev.iid] = legal[Math.floor(rand(h) * legal.length)].id;
  }
  return { choices };
}

export function playWeeks(seed: string, weeks: number, random = true): GameState {
  let s = newGame(seed);
  for (let i = 0; i < weeks && !s.gameOver; i++) s = advanceWeek(s, random ? randomChoices(s, i) : {}).state;
  return s;
}
