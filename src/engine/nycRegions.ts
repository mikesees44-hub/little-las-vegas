import { controllerOf, crewIn } from './nyc';
import { NYC_DISTRICTS } from './nycData';
import { NYC_GEO, pathPoints } from './nycGeo';
import type { GameState } from './types';

/**
 * The New York neighborhoods as generic map regions, for a shared
 * political-map overlay: id, outline rings in the NYC map's coordinates
 * (nycGeo.ts units, the same space NycMap draws in), who holds it, and the
 * player's share there (1 yours, 0.5 a crew working on someone's ground,
 * 0 none). `holder` is 'player', a New York family id (nycData.ts; styles in
 * sides.ts NYC_SIDE_STYLE) or 'none' for open ground.
 */
export interface NycRegion {
  id: string;
  name: string;
  polygons: [number, number][][];
  /** The SVG path of the same rings. */
  d: string;
  holder: string;
  share: number;
  /** Where its label goes. */
  at: [number, number];
}

export function nycRegions(s: GameState): NycRegion[] {
  return NYC_DISTRICTS.map((d) => {
    const g = NYC_GEO.districts[d.id];
    const c = controllerOf(s, d.id);
    const holder = c === 'open' ? 'none' : c;
    return {
      id: d.id, name: d.name, d: g.d, at: g.at,
      polygons: g.d.split('M').filter(Boolean).map((ring) => pathPoints(ring)),
      holder,
      share: holder === 'player' ? 1 : crewIn(s, d.id) ? 0.5 : 0,
    };
  });
}
