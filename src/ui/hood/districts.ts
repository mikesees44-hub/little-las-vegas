import type { HoodId } from '../../engine/hoodData';
import type { AssetKey } from './art/assetUrls';
import type { Scene } from './PaintedView';

/**
 * Each neighborhood's card: the name the art goes by and a line of what it is
 * like there in 1960 (the art itself is in art/districtArt.ts). The pier's
 * name is the 1960 one (Marine Pier; "Mariner's" is the operating pier's name today, painted over); the Convention
 * Hall is the old hall on the boards, not a modern center.
 */
export const DISTRICT_CARD: Partial<Record<HoodId, { title: string; line: string }>> = {
  causeway: { title: 'The Rio Grande Avenue gateway', line: 'Over the causeway and under the big neon WILDWOOD sign: everybody who comes to the island comes this way.' },
  boardwalk: { title: 'Marine Pier: the Boardwalk hub', line: 'The wheel, the wooden coaster, the carousel, the tram car. The summer money walks past here.' },
  crest: { title: 'The Crest\'s Doo Wop motels', line: 'Pools, pink doors and a station wagon in every lot. Quiet money, family money.' },
  pacific: { title: 'The arcade mile', line: 'Arcades, pizza, gelato, blade signs all the way down. Loud until two in the morning.' },
  docks: { title: 'The docks and the bayside', line: 'Fishing boats at Otten\'s Harbor, bait shacks, a seafood house on the porch. Everything comes in by water.' },
  downtown: { title: 'The Convention Hall and the plaza', line: 'Shows, conventions, beauty contests and the city\'s own business, right on the boards.' },
};

/**
 * The six districts the user painted, in the order you'd drive in: over the
 * causeway, out to the pier, down to the Crest, back up the arcade mile, the
 * docks, and the hall on the boards. Each has its card art (the asset store's
 * copy first, the inlined one as the fallback) and the street-level view it
 * opens on.
 */
export const DISTRICTS: { id: HoodId; asset: AssetKey; scene: Scene }[] = [
  { id: 'causeway', asset: 'district_rio_grande', scene: 'docks' },
  { id: 'boardwalk', asset: 'district_pier_hub', scene: 'block' },
  { id: 'crest', asset: 'district_crest_doowop', scene: 'twilight' },
  { id: 'pacific', asset: 'district_arcade_mile', scene: 'sees' },
  { id: 'docks', asset: 'district_docks_bayside', scene: 'docks' },
  { id: 'downtown', asset: 'district_convention_plaza', scene: 'bwBlue' },
];
