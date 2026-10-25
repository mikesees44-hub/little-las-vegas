import { ensureBones } from './bonesState';
import { ensureEars } from './ears';
import { ensureEcon } from './econState';
import { ensureEmpire } from './empireState';
import { ensureDynState } from './familyState';
import { ensureLedgerBook } from './ledgerbookState';
import { ensureArcs } from './livingStories';
import { ensurePol } from './politics';
import { ensureRomance, ensureStory } from './storyState';
import { ensureTravel } from './travelState';
import { ensureTribute } from './tributeState';
import type { GameState } from './types';

/**
 * Brings a save from an older build up to date the moment it is loaded, so
 * the screens never meet a missing field before the first week is played.
 * Each layer fills in only what it lacks; a step that fails is skipped.
 */
export function upgradeSave(s: GameState): GameState {
  for (const step of [ensureEcon, ensureEmpire, ensureBones, ensureDynState, ensureLedgerBook, ensureArcs, ensureStory, ensureRomance, ensureTravel, ensurePol, ensureEars, ensureTribute] as ((s: GameState) => unknown)[]) {
    try { step(s); } catch { /* the weekly update will try again */ }
  }
  return s;
}
