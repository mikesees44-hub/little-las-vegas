import { loadCityPackage, type CityPackage } from '../../engine/cityPackage';
import wildwoodRaw from './wildwood.json';

/**
 * The town packages that ship with the game. Each one is validated when it
 * loads (a broken package fails loudly in the tests, never silently in play).
 * Adding a town: drop its JSON here and list it — no gameplay code changes.
 */

/** The home town, simulated in full. */
export const WILDWOOD_PACKAGE: CityPackage = loadCityPackage(wildwoodRaw as unknown);

/** Every package, by map-city id. */
export const CITY_PACKAGES: Record<string, CityPackage> = { [WILDWOOD_PACKAGE.townId]: WILDWOOD_PACKAGE };

export function packageForTown(townId: string): CityPackage | undefined {
  return CITY_PACKAGES[townId];
}
