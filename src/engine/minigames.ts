/**
 * Registers every mini-game (importing a module registers it), re-exports
 * the framework, and runs the weekly hooks. The engine imports this file.
 */
import './trial';
import './scenes';
import './lowScenes';
import './minigameCards';
import './minigameSitdown';
import './minigameCollect';
import './minigameHeist';
import './minigameSweep';
import './minigameElection';
import type { Ctx } from './ledger';
import { ensureCardSource } from './minigameCards';
import { ensureSitdownSource } from './minigameSitdown';
import { ensureSweepSource } from './minigameSweep';
import { scenesWeek } from './scenes';
export * from './minigame';

/** Weekly: scenes for a new boss, and the event sources (registered lazily: events.ts imports the engine's modules). */
export function minigamesWeek(ctx: Ctx): void {
  ensureCardSource();
  ensureSitdownSource();
  ensureSweepSource();
  scenesWeek(ctx.s);
}
