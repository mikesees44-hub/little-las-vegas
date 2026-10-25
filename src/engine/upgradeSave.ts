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
import type { GameState } from './types';

/**
 * Brings a save from an older build up to date the moment it is loaded, so
 * the screens never meet a missing field before the first week is played.
 * Each layer fills in only what it lacks; a step that fails is skipped.
 */
export function upgradeSave(s: GameState): GameState {
  // Only layers the save already has are topped up: a missing layer is
  // created by the weekly update itself, so loading never changes the dice.
  const steps: [keyof GameState, (s: GameState) => unknown][] = [
    ['econ', ensureEcon], ['empire', ensureEmpire], ['bones', ensureBones], ['dyn' as keyof GameState, ensureDynState], ['ledgerBook', ensureLedgerBook],
    ['arcs', ensureArcs], ['story', ensureStory], ['romance', ensureRomance], ['travel', ensureTravel], ['pol', ensurePol], ['ears', ensureEars],
  ];
  for (const [key, step] of steps) {
    if (s[key] === undefined) continue;
    try { step(s); } catch { /* the weekly update will try again */ }
  }
  return s;
}
