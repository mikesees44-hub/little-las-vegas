import { repairGoals } from './goalRules';
import type { GameState } from './types';

/**
 * Save migrations from the trust pass, run by `upgradeSave` when a game is
 * loaded. Each step only fixes what an older build left behind, and every
 * step can run any number of times. `s.schema` records how far a save has
 * been brought; `ui/save.ts` keeps a backup of the stored save before
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
  try { migrateAppearance(s); } catch { /* a face is cosmetic */ }
  try { repairGoals(s); } catch { /* the weekly update repairs them too */ }
  if ((s.schema ?? 0) < SCHEMA) s.schema = SCHEMA;
  return s;
}
