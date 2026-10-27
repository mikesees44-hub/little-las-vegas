import { withAdded } from './addPlace';
import type { CityPackage } from './cityPackage';
import { WILDWOOD_PACKAGE } from '../worldpack/cities';
import type { GameState } from './types';

/**
 * The home town's package as this game sees it: the shipped Wildwood package
 * plus the places added into this game from the editor (`s.addedPlaces`),
 * merged by stable id (the shipped records win once they ship).
 */
let memo: { key: string; pkg: CityPackage } | undefined;
export function homePackage(s: Pick<GameState, 'addedPlaces'>): CityPackage {
  if (!s.addedPlaces?.wildwood) return WILDWOOD_PACKAGE;
  const key = JSON.stringify(s.addedPlaces.wildwood);
  if (memo && memo.key === key) return memo.pkg;
  const pkg = withAdded(WILDWOOD_PACKAGE, s.addedPlaces);
  memo = { key, pkg };
  return pkg;
}
