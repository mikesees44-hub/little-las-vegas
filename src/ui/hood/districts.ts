import type { HoodId } from '../../engine/hoodData';

/**
 * Each neighborhood's card: the name the art goes by and a line of what it is
 * like there in 1960 (the art itself is in art/districtArt.ts). The pier's
 * name is fictional (Mariner's Pier, as its own sign says); the Convention
 * Hall is the old hall on the boards, not a modern center.
 */
export const DISTRICT_CARD: Partial<Record<HoodId, { title: string; line: string }>> = {
  causeway: { title: 'The Rio Grande Avenue gateway', line: 'Over the causeway and under the big neon WILDWOOD sign: everybody who comes to the island comes this way.' },
  boardwalk: { title: 'Mariner\'s Pier: the Boardwalk hub', line: 'The wheel, the wooden coaster, the carousel, the tram car. The summer money walks past here.' },
  crest: { title: 'The Crest\'s Doo Wop motels', line: 'Pools, pink doors and a station wagon in every lot. Quiet money, family money.' },
  pacific: { title: 'The arcade mile', line: 'Arcades, pizza, gelato, blade signs all the way down. Loud until two in the morning.' },
  docks: { title: 'The docks and the bayside', line: 'Fishing boats at Otten\'s Harbor, bait shacks, a seafood house on the porch. Everything comes in by water.' },
  downtown: { title: 'The Convention Hall and the plaza', line: 'Shows, conventions, beauty contests and the city\'s own business, right on the boards.' },
};
