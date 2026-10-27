import type { CSSProperties } from 'react';
import { AssetImg } from '../AssetImg';
import type { AssetKey } from './assetUrls';

/**
 * Where the user's scene paintings stand behind the game's moments: the
 * cutscene stills, the Sit-Down and Your Rounds, the title screen, the trip
 * planner and the family's occasions. Every one is optional: when the
 * painting is missing (not uploaded yet, local dev, tests) the drawn art
 * (the noir stills, the plain panels) shows exactly as before.
 */

/** A painted still for a cutscene, under the noir treatment (the drawn still is the fallback; a video still wins). */
export const CUTSCENE_ART: Partial<Record<string, AssetKey[]>> = {
  title: ['scene_island_aerial', 'scene_doowop_neighborhood', 'neighborhood_twilight_1958'],
  made_man: ['scene_boss_office'],
  hit_success: ['street_taylor_rockclub', 'street_7sees'],
  hit_botched: ['street_crablegs'],
  hit_witness: ['street_taylor_offshore'],
  wedding: ['scene_club_stage'],
  heir_rises: ['scene_island_aerial', 'boardwalk_blue_hour_1958'],
  arrest_interrogation: ['street_docks_day2'],
};

/** The noir grade on a painting used as a cutscene still. */
export const NOIR_GRADE = 'grayscale(0.55) sepia(0.25) brightness(0.62) contrast(1.12)';

/** The trip planner's header: Atlantic City's casino boards only from 1978 (no casinos before); else South Jersey from the air. */
export function tripArt(destId: string | undefined, year: number): AssetKey[] {
  if (destId === 'ac' && year >= 1978) return ['scene_ac_boardwalk', 'scene_region_map'];
  return ['scene_region_map'];
}

/** The family's occasions. */
export const ACTIVITY_ART: Partial<Record<string, AssetKey[]>> = {
  fishing: ['scene_capemay_harbor'],
  clambake: ['walk_pier_beach'],
  club500: ['scene_club_stage'],
  wedding: ['scene_club_stage'],
  sunday: ['cutout_shingle_estate'],
};

/** A painting laid behind a panel, faded so the text stays readable; nothing at all when it cannot load. */
export function Backdrop({ k, opacity = 0.28, filter, className = '', contain }: { k: AssetKey | AssetKey[] | undefined; opacity?: number; filter?: string; className?: string; contain?: boolean }) {
  const style: CSSProperties = { opacity, filter };
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden data-testid="backdrop">
      <AssetImg k={k} alt="" className={`h-full w-full ${contain ? 'object-contain' : 'object-cover'}`} style={style} />
    </div>
  );
}
