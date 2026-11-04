import type { GameState } from './types';

/**
 * DIFFICULTY PRESETS (imports/queue/EASIER_NOT_SHALLOWER.md item 1): one table of the existing
 * knobs. No option is removed on any level; a preset only decides how forgiving the dice are.
 *
 *  - Story: forgiving. Slower heat, gentler respect decay, rarer flips and hollow crowns, the
 *    rivals slower to move, a bail-out sooner, a boss far harder to kill in a battle.
 *  - Don: the balanced defaults (every multiplier 1, the constants as they stand in their modules).
 *  - Grand Strategy: harsher on every knob.
 *
 * Chosen at New Game, changeable in Settings, stored in the save (`s.difficulty`; absent = 'don').
 * Every module reads its knob here, so the table below is the whole of the difference.
 */

export type Difficulty = 'story' | 'don' | 'grand';

export interface DifficultyKnobs {
  label: string;
  blurb: string;
  /** The heat ramp: × every heat gain (ledger.ts post) and × the IRS ramp (pressure.ts). */
  heatGain: number;
  /** Respect above this slips a point a quiet week (engine.ts). */
  respectKeep: number;
  /** × HOLLOW_CHANCE (feds.ts): the hollow crown. */
  hollow: number;
  /** × a pinched man's odds of taking the deal (feds.ts flipOdds). */
  flip: number;
  /** × a rival's weekly chance to plan a move on you (threats.ts aggression), and his blitzes. */
  aggression: number;
  /** × success draws fire (pressure.ts wealthPressure: the rivals, the FBI, the envelope, the upkeep brake). */
  fire: number;
  /** × the police's weekly chance of a raid or stakeout (threats.ts planPolice). */
  police: number;
  /** Weeks under water before the bail-out is offered (pressure.ts). */
  bailWeeks: number;
  /** × the boss's own risk when a battle breaks through or a blitz reaches him (army.ts, blitz.ts). */
  battleDeath: number;
  /** The clock's pause budget: non-red stops a game day (ui/clockPolicy.ts). */
  dayPauses: number;
}

export const DIFFICULTY: Record<Difficulty, DifficultyKnobs> = {
  story: {
    label: 'Story', blurb: 'Forgiving: slower heat, gentler respect, rarer flips and coups, a bail-out sooner. Every option is still there.',
    heatGain: 0.75, respectKeep: 95, hollow: 0.5, flip: 0.7, aggression: 0.7, fire: 0.6, police: 0.7, bailWeeks: 5, battleDeath: 0.4, dayPauses: 3,
  },
  don: {
    label: 'Don', blurb: 'The balanced game.',
    heatGain: 1, respectKeep: 90, hollow: 1, flip: 1, aggression: 1, fire: 1, police: 1, bailWeeks: 8, battleDeath: 1, dayPauses: 2,
  },
  grand: {
    label: 'Grand Strategy', blurb: 'Harsh: heat climbs faster, men flip sooner, the rivals and the Bureau push harder, and a battle can take you.',
    heatGain: 1.2, respectKeep: 85, hollow: 1.4, flip: 1.25, aggression: 1.25, fire: 1.3, police: 1.25, bailWeeks: 12, battleDeath: 1.6, dayPauses: 2,
  },
};

export const DIFFICULTIES: Difficulty[] = ['story', 'don', 'grand'];

export function difficultyOf(s: Pick<GameState, 'difficulty'> | undefined): Difficulty {
  const d = s?.difficulty;
  return d && d in DIFFICULTY ? d : 'don';
}

export function knobs(s: Pick<GameState, 'difficulty'> | undefined): DifficultyKnobs {
  return DIFFICULTY[difficultyOf(s)];
}

/** Settings: change the preset (pure). */
export function setDifficulty(s: GameState, d: Difficulty): GameState {
  return d in DIFFICULTY ? { ...s, difficulty: d } : s;
}
