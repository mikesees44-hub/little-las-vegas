import { repairGoals } from './goalRules';
import type { GameState } from './types';

/**
 * Save migrations from the trust pass, run by `upgradeSave` when a game is
 * loaded. Each step only fixes what an older build left behind, and every
 * step can run any number of times. A step that changes play (goals) runs
 * only on a save older than `SCHEMA`, so loading a current save leaves it as
 * it was written. `s.schema` records how far a save has been brought; `ui/save.ts` keeps a backup of the stored save before
 * returning one whose schema moved.
 */
export const SCHEMA = 1;

/** Old faces: one "heavy" gene drove both the beard shadow and the build. Keep the beard they had. */
export function migrateAppearance(s: GameState): number {
  let n = 0;
  for (const c of Object.values(s.characters)) {
    const g = c.appearance?.genes;
    if (g && g.heavy !== undefined && g.beard === undefined) {
      g.beard = g.heavy;
      n++;
    }
  }
  return n;
}

export function migrateTrust(s: GameState): GameState {
  // Cosmetic and equivalent to how an old face is read (`genesOf`): safe on any save.
  try { migrateAppearance(s); } catch { /* a face is cosmetic */ }
  if ((s.schema ?? 0) >= SCHEMA) return s;
  // Schema 0 -> 1. Only saves from before the goal rules carry goals they could
  // never have been given; a current save is loaded exactly as it was written,
  // so saving and loading never changes how the game plays on (the weekly
  // update repairs a goal a rank change closed, for both alike).
  try { repairGoals(s); } catch { /* the weekly update repairs them too */ }
  s.schema = SCHEMA;
  return s;
}
