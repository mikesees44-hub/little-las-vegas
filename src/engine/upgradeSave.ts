import { ensureMyMen } from './myMen';
import { ensureBones } from './bonesState';
import { ensureEars } from './ears';
import { ensureDating } from './datingState';
import { ensureNightlife } from './nightlife';
import { ensureBonds } from './bondsState';
import { ensureDirty } from './dirtyWork';
import { ensurePaper } from './paper';
import { ensureWork } from './bizRacket';
import { ensureXp } from './crewXp';
import { ensureProtect } from './protect';
import { ensureWomen } from './womenState';
import { ensureHoney } from './honeyState';
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
import { ensureTribute, topUpOldPocket } from './tributeState';
import { ensureShadow } from './shadowState';
import { ensureLiving } from './livingState';
import { ensureHousing } from './housing';
import { ensureMinds } from './minds/state';
import { ensureArmy } from './armyState';
import { ensureDeeds } from './deeds/state';
import { migrateTrust } from './trustMigrations';
import { keepOldDelegation } from './lieutenants';
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
    ['arcs', ensureArcs], ['story', ensureStory], ['romance', ensureRomance], ['travel', ensureTravel], ['pol', ensurePol], ['ears', ensureEars], ['tribute' as keyof GameState, ensureTribute], ['dirty', ensureDirty], ['shadow', ensureShadow], ['dev', ensureDev], ['living', ensureLiving], ['dating', ensureDating], ['nightlife', ensureNightlife], ['bonds', ensureBonds], ['paper', ensurePaper], ['work', ensureWork], ['mymen' as keyof GameState, ensureMyMen], ['xp', ensureXp], ['protect', ensureProtect], ['women', ensureWomen], ['honey', ensureHoney], ['minds', ensureMinds], ['army', ensureArmy], ['deeds', ensureDeeds],
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
  // The town's house lots (by id: a save from before them gets them on the market; who lives there comes with the next week).
  if (s.econ?.lots.length) try { ensureHousing(s); } catch { /* the weekly update will try again */ }
  // A days plan left from another week (the clock stopped mid-week in an older build) is dropped.
  if (s.days && s.days.week !== s.week) delete s.days;
  // The old player-run call service goes back to the Madam's network.
  try { migrateVice(s); } catch { /* nothing to move */ }
  // Towns away from home: merge a corrected package by stable ids (ownership and debts untouched).
  if (s.towns) try { migrateTowns(s); } catch { /* the weekly update will try again */ }
  // A save from before the new delegation defaults keeps its old ones (and gets a one-time offer on the Desk).
  if ((s.schema ?? 0) < 2) try { keepOldDelegation(s); } catch { /* nobody seated yet: the new defaults apply */ }
  // The trust pass: stale goals, the split beard/build gene, the schema stamp.
  migrateTrust(s);
  try { topUpOldPocket(s); } catch { /* nothing to top up */ }
  return s;
}
