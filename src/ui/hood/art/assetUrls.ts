/**
 * The one place the big art is referenced by URL. These images live in the
 * published artifact's asset store (`/_blob/...`) and are NOT inlined into the
 * single-file page: they resolve only inside the published artifact, so every
 * use goes through `AssetImg`, which falls back to the inlined or SVG art when
 * the URL is missing or fails to load (local dev, Playwright, offline).
 *
 * Keys whose URL is `undefined` are the user's own art exported to
 * imports/art/final/*.webp, waiting to be uploaded: fill the URL in here and
 * the game picks it up. Nothing else in the code names a URL.
 */
export const ASSET_URLS = {
  // Already in the asset store (31 keys).
  lucky_sevens_arcade: '/_blob/bfd25fc16456180aed155add75bbf8f1',
  anchor_tavern: '/_blob/b739dfd7f2b5a6e1a39eed183b8a9026',
  lobster_seafood_house: '/_blob/29cf5a79d3800ce05d745fd5e76a3a2b',
  doowop_block_turnaround: '/_blob/9a54abea9a752d3ba787f097ec75b7f1',
  starfin_motel_turnaround: '/_blob/cc1c463f263f4d43e374c31b6e9fe086',
  bellavita_restaurant_turnaround: '/_blob/bde836fc6fb1c3264a622524f90c37e3',
  bayview_deli_turnaround: '/_blob/b80cd693db3245408db68de1a443a7a6',
  bayshore_barber: '/_blob/c8e55d0489d17592103eba10e316039d',
  neon_moon_pizza: '/_blob/ee25b195d9a1305b8ba34c98edececca',
  penny_candy_soda: '/_blob/fce5bde233f555ea0690bf7e002af27f',
  neighborhood_twilight_1958: '/_blob/6a9e124cf9fd411c2ce38be237cd01b1',
  spin_city_laundromat: '/_blob/ae04980b97346d5b2d387a9deafc84fe',
  italian_social_club: '/_blob/fda631be76dd61c8eebbf99d3d408b4e',
  shore_cab_garage: '/_blob/1666819545f17d0c52ffd34b1042a163',
  blue_comet_motel: '/_blob/c1157e5fa645cf20a60897c18c561683',
  boardwalk_blue_hour_1958: '/_blob/66d490580e03749f4992a6e2943012c6',
  chemical_bank: '/_blob/760248b18172524035b99cdf055daa9b',
  seaside_fudge: '/_blob/907ab5d77a69719140714233544bc026',
  starlight_scoops_turnaround: '/_blob/54f0772448b0298fa06b55ce19ddfb78',
  starlight_scoops_twilight: '/_blob/7e2505b318bb47ea3a47bb874d9cc5ef',
  shamrock_turnaround: '/_blob/06b8b19431f90c264765c19d130837dc',
  shamrock_twilight: '/_blob/9df33d34d933a070df88ce46db4387b6',
  // Batch 2 (the Red Garter and Hunt's Pier are long gone: real names kept).
  red_garter_turnaround: '/_blob/47eaeb236cc6bb8171e71e8f04b542cb',
  red_garter_interior_twilight: '/_blob/bde2e32996f279c0d8235812d781fbd3',
  boardwalk_fun_shop: '/_blob/0ff6b4fc9576df202684e444a83742c7',
  /** A 1970s-and-later attraction: not used in 1960 (an anachronism). */
  wipeout_slide: '/_blob/620786f99c8ab046201101fcc43fcf3b',
  hunts_pier_golf_entrance: '/_blob/93541d93f15cefbfdc4a44395c0a9379',
  // The walkable Boardwalk (WalkView): the aerial is the ground; Hunt's Pier, the Flyer and the
  // Castle Dungeon are long gone (real names kept). The sprites are transparent.
  walk_aerial_boardwalk: '/_blob/808e66ca93fb49574999f664a2d305c7',
  walk_hunts_flyer: '/_blob/b0ab84a6e77d03f334eeee89da0049e0',
  walk_castle_dungeon: '/_blob/78c2fc492df0d89734d60ee7b769433e',
  walk_pier_beach: '/_blob/a794332636e2db2d58db2be4688a5bde',
  // The user's own art (imports/art/final/<file>.webp), to be uploaded.
  street_7sees: undefined,
  street_crablegs: undefined,
  street_taylor_offshore: undefined,
  street_taylor_rockclub: undefined,
  street_docks_day: undefined,
  street_docks_day2: undefined,
  storefront_lucky_sevens: undefined,
  storefront_anchor_bar: undefined,
  district_rio_grande: undefined,
  district_pier_hub: undefined,
  district_crest_doowop: undefined,
  district_arcade_mile: undefined,
  district_docks_bayside: undefined,
  district_convention_plaza: undefined,
  scene_boardwalk_tram: undefined,
  scene_boss_office: undefined,
  scene_club_stage: undefined,
  scene_capemay_harbor: undefined,
  // Batch 2, signs repainted in the near-miss style (the real businesses still operate).
  storefront_nutty_hut: undefined,
  storefront_old_macks_pizza: undefined,
  storefront_olympia_fascination: undefined,
  storefront_eds_fun_arcade: undefined,
  storefront_casino_arcadia: undefined,
  // Batch 3. Defunct places and public landmarks keep their names; still-operating
  // ones are near misses (Ebb Tyde, Gateway 25 / Kohl Bros., Uncle Vinny's, Pompei's,
  // Sportsland, Lil' Nicky's, Lollypop, Fudge Kitchenette; Pompeo's became Klug's).
  storefront_boardwalk_bazaar: undefined,
  storefront_taffy_tides: undefined,
  storefront_flashback_photo: undefined,
  storefront_surfside_outfitters: undefined,
  motel_ebb_tyde: undefined,
  storefront_schumanns: undefined,
  motel_satellite: undefined,
  storefront_gateway_25: undefined,
  shore_comedy_turnaround: undefined,
  shore_comedy_interior: undefined,
  storefront_romeos_pizzeria: undefined,
  club_oasis: undefined,
  club_stardust: undefined,
  uncle_vinnys_stage: undefined,
  club_quo_vadis: undefined,
  club_rainbow_marquee: undefined,
  club_rainbow_musical_bar: undefined,
  club_riptide: undefined,
  club_hurricane: undefined,
  landmark_nw_city_hall: undefined,
  landmark_hereford_light: undefined,
  storefront_klugs: undefined,
  storefront_sportsland: undefined,
  storefront_lil_nickys: undefined,
  motel_lollypop: undefined,
  sign_lollypop: undefined,
  storefront_fudge_kitchenette: undefined,
  // Transparent building sprites (the Town Explorer cutouts): used as-is on the block map.
  cutout_bank: undefined,
  cutout_barber: undefined,
  cutout_cab: undefined,
  cutout_candy: undefined,
  cutout_fudge: undefined,
  cutout_gift: undefined,
  cutout_laundry: undefined,
  cutout_pizza: undefined,
  cutout_social: undefined,
  cutout_taffy: undefined,
  // Batch 4: the user's transparent three-quarter models (the navy backdrop keyed out
  // where it had one). Preferred as map sprites over the storefront paintings.
  cutout_fairview: undefined,
  cutout_urys_waterfront: undefined,
  cutout_boathouse: undefined,
  cutout_groffs: undefined,
  cutout_boardwalk_chapel: undefined,
  cutout_st_anselms: undefined,
  cutout_holy_redeemer: undefined,
  cutout_wai_kiki: undefined,
  cutout_a_frame_cottage: undefined,
  cutout_malibu: undefined,
  cutout_seafoam_cottage: undefined,
  cutout_bills_corner_deli: undefined,
  cutout_wildwood_high: undefined,
  cutout_lollypop_motel: undefined,
  cutout_klugs: undefined,
  cutout_hereford_light: undefined,
  cutout_hurricane: undefined,
  cutout_nw_city_hall: undefined,
  // The c batch and 108-112 (transparent; near-miss names where the real ones may operate).
  cutout_sea_shell: undefined,
  cutout_curleys: undefined,
  cutout_route_69_diner: undefined,
  cutout_bobby_dees: undefined,
  cutout_shore_motel: undefined,
  cutout_octopus_mini_golf: undefined,
  cutout_shore_house: undefined,
  cutout_beach_house: undefined,
  cutout_starlux: undefined,
  cutout_corner_inn: undefined,
  cutout_seafood_shack: undefined,
  cutout_brick_church: undefined,
  cutout_ship_n_shore: undefined,
  cutout_alp_pizza: undefined,
  cutout_alp_pizza_front: undefined,
  cutout_alp_pizza_corner: undefined,
  cutout_samuels_pancake_house: undefined,
  cutout_samuels_cafe: undefined,
  cutout_boat_tag: undefined,
  /** A steel looping coaster: late era (from 1976) only. */
  cutout_loop_coaster: undefined,
  // Batch 5 (art2): the rest of the user's pictures, so every one has a home.
  // Houses for the residential blocks (transparent models).
  cutout_house_yellow_beach: undefined,
  cutout_victorian_boardinghouse: undefined,
  cutout_shingle_estate: undefined,
  cutout_red_victorian: undefined,
  cutout_white_shore_home: undefined,
  /** A seafood shack by the docks (the navy backdrop keyed out). */
  cutout_ricks_seafood: undefined,
  /** Pacific Avenue's Doo Wop strip at blue hour (Ocean's Club, the Driftwood Lounge): a walk backdrop. */
  street_pacific_neon: undefined,
  /** The Doo Wop blocks from above (THE CARIBBEAN repainted THE CARIBBEE): a backdrop. */
  scene_doowop_neighborhood: undefined,
  /** The Starburst building (pizza window, the Neon arcade, the Starburst lounge). */
  storefront_starburst: undefined,
  /** Atlantic City's boards with casino towers (BALLY'S / CAESAR'S repainted): late era only (1978 on). */
  scene_ac_boardwalk: undefined,
  /** South Jersey from the air (the shore towns pinned): the trip planner's header. */
  scene_region_map: undefined,
  // Batch 5b: the pier wheels (transparent), two Crest motels under near-miss names, and the
  // island from the air. (c94-c96 and c98 are the same pictures as 109, 110, 112 and 113.)
  /** The next pier's wheels (the Giant Wheel, white or lit). */
  cutout_ferris_wheel: undefined,
  cutout_ferris_white: undefined,
  /** PANORAMIC -> PANORAMA (the last tile a star). */
  cutout_panorama_motel: undefined,
  /** RIO -> RIO GRANDE on the pole sign. */
  cutout_rio_grande_motel: undefined,
  /** Photoreal: the island from the air looking north (the title, the walk launcher). */
  scene_island_aerial: undefined,
} satisfies Record<string, string | undefined>;

export type AssetKey = keyof typeof ASSET_URLS;

/**
 * Ready-cut transparent sprites for paintings: the block map draws these
 * as they are, and cuts the painting itself only when the sprite is missing.
 */
export const SPRITE_OF: Partial<Record<AssetKey, AssetKey>> = {
  chemical_bank: 'cutout_bank',
  bayshore_barber: 'cutout_barber',
  shore_cab_garage: 'cutout_cab',
  penny_candy_soda: 'cutout_candy',
  seaside_fudge: 'cutout_fudge',
  storefront_boardwalk_bazaar: 'cutout_gift',
  spin_city_laundromat: 'cutout_laundry',
  neon_moon_pizza: 'cutout_pizza',
  italian_social_club: 'cutout_social',
  storefront_taffy_tides: 'cutout_taffy',
  motel_lollypop: 'cutout_lollypop_motel',
  storefront_klugs: 'cutout_klugs',
  club_hurricane: 'cutout_hurricane',
  landmark_hereford_light: 'cutout_hereford_light',
  landmark_nw_city_hall: 'cutout_nw_city_hall',
};

/** Whether a key is itself a ready-cut transparent sprite (drawn as-is, never cut). */
export const isSprite = (k: AssetKey): boolean => k.startsWith('cutout_');

/** Pixel size of each image (for crops and hotspot frames). */
export const ASSET_SIZE: Partial<Record<AssetKey, [number, number]>> = {
  doowop_block_turnaround: [1600, 874],
  starfin_motel_turnaround: [1536, 1024],
  bellavita_restaurant_turnaround: [1536, 1024],
  bayview_deli_turnaround: [1536, 1024],
  starlight_scoops_turnaround: [1536, 1024],
  shamrock_turnaround: [1536, 1024],
  red_garter_turnaround: [1536, 1024],
  shore_comedy_turnaround: [1536, 1024],
  neighborhood_twilight_1958: [1536, 1024],
  boardwalk_blue_hour_1958: [1600, 874],
  walk_aerial_boardwalk: [1536, 1024],
  walk_hunts_flyer: [1400, 1050],
  walk_castle_dungeon: [1400, 974],
  walk_pier_beach: [1576, 998],
  street_7sees: [1024, 559],
  street_crablegs: [1024, 559],
  street_taylor_offshore: [1024, 559],
  street_taylor_rockclub: [1024, 559],
  street_docks_day: [1024, 559],
  street_docks_day2: [1024, 559],
  street_pacific_neon: [1024, 559],
  scene_doowop_neighborhood: [1024, 559],
  storefront_starburst: [1024, 559],
  scene_boardwalk_tram: [335, 249],
  scene_boss_office: [336, 249],
  scene_club_stage: [335, 249],
  scene_capemay_harbor: [335, 250],
  scene_ac_boardwalk: [335, 250],
  scene_region_map: [336, 250],
  scene_island_aerial: [1536, 1024],
};

/**
 * The four-angle sheets are 2×2 grids; where the dividers fall (measured on
 * the images: the column split is at the middle, the row split a little
 * above it on most sheets). Fractions of the width and height.
 */
export const TURNAROUND_SPLIT: Partial<Record<AssetKey, { cx: number; cy: number }>> = {
  doowop_block_turnaround: { cx: 800 / 1600, cy: 432 / 874 },
  starfin_motel_turnaround: { cx: 767 / 1536, cy: 505 / 1024 },
  bellavita_restaurant_turnaround: { cx: 767 / 1536, cy: 508 / 1024 },
  bayview_deli_turnaround: { cx: 768 / 1536, cy: 502 / 1024 },
  starlight_scoops_turnaround: { cx: 768 / 1536, cy: 511 / 1024 },
  shamrock_turnaround: { cx: 767 / 1536, cy: 510 / 1024 },
  red_garter_turnaround: { cx: 768 / 1536, cy: 512 / 1024 },
  shore_comedy_turnaround: { cx: 768 / 1536, cy: 504 / 1024 },
};

declare global {
  interface Window { __llvAssets?: Partial<Record<string, string>> }
}

/**
 * The URL for an asset, or undefined. `window.__llvAssets` (set only by the
 * Playwright checks, before the page loads) can point keys at test copies.
 */
export function assetUrl(k: AssetKey): string | undefined {
  const o = typeof window !== 'undefined' ? window.__llvAssets?.[k] : undefined;
  return o ?? ASSET_URLS[k];
}
