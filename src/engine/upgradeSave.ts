import { ensureBones } from './bonesState';
import { ensureEars } from './ears';
import { ensureDirty } from './dirtyWork';
import { ensureDev } from './devState';
import { ensureEcon } from './econState';
import { ensureEmpire } from './empireState';
import { ensureHood } from './hoodState';
import { SEED } from './hoodData';
import { migrateTowns } from './towns';
import { ensureMissions } from './missions';
import { ensureTalks } from './talks';
import { ensureDynState } from './familyState';
import { ensureLedgerBook } from './ledgerbookState';
import { ensureArcs } from './livingStories';
import { ensurePol } from './politics';
import { migrateVice } from './racketLife';
import { ensureRomance, ensureStory } from './storyState';
import { ensureTravel } from './travelState';
import { ensureTribute } from './tributeState';
import { ensureShadow } from './shadowState';
import { migrateTrust } from './trustMigrations';
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
    ['arcs', ensureArcs], ['story', ensureStory], ['romance', ensureRomance], ['travel', ensureTravel], ['pol', ensurePol], ['ears', ensureEars], ['tribute' as keyof GameState, ensureTribute], ['dirty', ensureDirty], ['shadow', ensureShadow], ['dev', ensureDev],
  ];
  for (const [key, step] of steps) {
    if (s[key] === undefined) continue;
    try { step(s); } catch { /* the weekly update will try again */ }
  }
  // The neighborhood records, the talks and the missions are made at load too,
  // so an old save can walk the streets before its first week is played.
  // A save from before a 1960 record was authored gets it too (where its ground is free).
  if (s.hood === undefined || (s.econ?.lots.length && SEED.some((r) => !s.econ!.lots.some((l) => l.id === r[0])))) for (const step of [ensureHood, ensureTalks, ensureMissions]) {
    try { step(s); } catch { /* the weekly update will try again */ }
  }
  // A days plan left from another week (the clock stopped mid-week in an older build) is dropped.
  if (s.days && s.days.week !== s.week) delete s.days;
  // The old player-run call service goes back to the Madam's network.
  try { migrateVice(s); } catch { /* nothing to move */ }
  // Towns away from home: merge a corrected package by stable ids (ownership and debts untouched).
  if (s.towns) try { migrateTowns(s); } catch { /* the weekly update will try again */ }
  // The trust pass: stale goals, the split beard/build gene, the schema stamp.
  migrateTrust(s);
  return s;
}
