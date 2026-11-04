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
  // The owner's title painting: the boardwalk at night, 1960.
  title_boardwalk_1960: '/_blob/5136d0a3b7d5ffc450344c874a8a053e',
  // Already in the asset store (all 148 keys).
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
  street_7sees: '/_blob/e476209e842235a2d4cb1f90e4dc20d6',
  street_crablegs: '/_blob/7831a4ab8aa420d148f6e9ed33f4c559',
  street_taylor_offshore: '/_blob/6f7f04d6e2d4b43e5a24408878f68c62',
  street_taylor_rockclub: '/_blob/968ea41eb3838f5508ce218f3f309b34',
  street_docks_day: '/_blob/f8cbf6cd97aaca76860e080ae8b7ef77',
  street_docks_day2: '/_blob/a2d1dbf84238215a3077f5a31baeef6e',
  storefront_lucky_sevens: '/_blob/b7734bf662039930bd354b9c8abc2951',
  storefront_anchor_bar: '/_blob/c32e7ccd5facd484d7a838ee083af318',
  district_rio_grande: '/_blob/97c2f566ea75c2532aff1bf8f514b6ac',
  district_pier_hub: '/_blob/6e0226cd6bb88520317801322f51cf16',
  district_crest_doowop: '/_blob/6d1431ce827559e83ec5ef78dc288388',
  district_arcade_mile: '/_blob/797541a6c856ecc9057fbf2f6be495f9',
  district_docks_bayside: '/_blob/b2c60435a4f2a672321b54d3bf1c4e84',
  district_convention_plaza: '/_blob/41ade9672902f69adb72a3805ca1eaba',
  scene_boardwalk_tram: '/_blob/f0a677125b35b934c3875a683acd3278',
  scene_boss_office: '/_blob/1258d5297631d626b5e765b2b727e411',
  scene_club_stage: '/_blob/2078bfcc24dd489387ea238686342f0b',
  scene_capemay_harbor: '/_blob/29fd284eea660b026f253a12f7f1cdf6',
  // Batch 2, signs repainted in the near-miss style (the real businesses still operate).
  storefront_nutty_hut: '/_blob/f8177c5cec9fde8ad8f989edce7d742d',
  storefront_old_macks_pizza: '/_blob/c1c681c4c5cc723198f5429ad24f0440',
  storefront_olympia_fascination: '/_blob/3585eefe84d1decfbb7a8f80566a198b',
  storefront_eds_fun_arcade: '/_blob/877346a84028dfe8443becdde961241c',
  storefront_casino_arcadia: '/_blob/5f3adceb2cc9aa3b05c06250b9f930b0',
  // Batch 3. Defunct places and public landmarks keep their names; still-operating
  // ones are near misses (Ebb Tyde, Gateway 25 / Kohl Bros., Uncle Vinny's, Pompei's,
  // Sportsland, Lil' Nicky's, Lollypop, Fudge Kitchenette; Pompeo's became Klug's).
  storefront_boardwalk_bazaar: '/_blob/128cbf8252c452e7fe2ca5d45d31f2c3',
  storefront_taffy_tides: '/_blob/8c3cc80bf7c35656723b51543b09797e',
  storefront_flashback_photo: '/_blob/364b1bd363c8b00851347c3a1126c6f4',
  storefront_surfside_outfitters: '/_blob/3c2a5f3ec1ab9263a66445b28465d7fd',
  motel_ebb_tyde: '/_blob/a2767f8e1d02aeace53299a2ed0f43a6',
  storefront_schumanns: '/_blob/96b0e4926709bac479efabaa44918d71',
  motel_satellite: '/_blob/1b9f3eda3459c7b72a40ba14622bd90b',
  storefront_gateway_25: '/_blob/74c8437d34d7c95a902fc8f82af49039',
  shore_comedy_turnaround: '/_blob/c17fb7475f9fdb7f554f3ecbced5bdb1',
  shore_comedy_interior: '/_blob/d6bdc50c3be5c1e6faec6b6a205535aa',
  storefront_romeos_pizzeria: '/_blob/cd758cad7bd695554cdb1c1b806db3fe',
  club_oasis: '/_blob/4da95ca8d9bada0c67e982b7a6db2e3a',
  club_stardust: '/_blob/f27c87c1785039840a824a760a19c319',
  uncle_vinnys_stage: '/_blob/ce9731311ec1ebee781cf321566e22d0',
  club_quo_vadis: '/_blob/a5f23a20e8e3be46d1694daab880dead',
  club_rainbow_marquee: '/_blob/c4c0e0d7afefbac44f947587830cd263',
  club_rainbow_musical_bar: '/_blob/d785af8951e07fbac35b3bef83765fc9',
  club_riptide: '/_blob/cc4d6bb90aa63de8716fe90b4f9676e0',
  club_hurricane: '/_blob/677bcac445c6d1f013c3fcc4e8b5baf5',
  landmark_nw_city_hall: '/_blob/b889f91a296b10e35c0aea60daff6614',
  landmark_hereford_light: '/_blob/a87529ca34559506e51db5107f7c3e1e',
  storefront_klugs: '/_blob/3a6293840c43f6db0e60d8af2694e317',
  storefront_sportsland: '/_blob/e1a29215011cbe82266063d45d057738',
  storefront_lil_nickys: '/_blob/60ca7149bd9dd82553bd0383f73ad96e',
  motel_lollypop: '/_blob/8934997d1304ac0408e36e25ad3c348d',
  sign_lollypop: '/_blob/c74cf0de8e6321b4ee8f7ad1d0719379',
  storefront_fudge_kitchenette: '/_blob/f17b991573d604629e9c64ebcfce15dc',
  // Transparent building sprites (the Town Explorer cutouts): used as-is on the block map.
  cutout_bank: '/_blob/400aee3770ede48e27011348938f3af9',
  cutout_barber: '/_blob/96f23103e37ac22d35c7ab5b83cb4e19',
  cutout_cab: '/_blob/b3386d4fa2f46ec10cbbe97e81f65c1a',
  cutout_candy: '/_blob/7a269c4bcccd4d9d6f65eb731eb4b1d5',
  cutout_fudge: '/_blob/42b221b5cf468ef07051d72a08da1c95',
  cutout_gift: '/_blob/d49af2f0650fd22c6dd9be32990fcf7a',
  cutout_laundry: '/_blob/e35eef797dd50ee90b53d68391a2b6d0',
  cutout_pizza: '/_blob/508191857a5ffd2cd0c77363c2f637cb',
  cutout_social: '/_blob/dd606e7da85a8a051892e7749971078d',
  cutout_taffy: '/_blob/c40a36209c1f0c66e288759495b457f1',
  // Batch 4: the user's transparent three-quarter models (the navy backdrop keyed out
  // where it had one). Preferred as map sprites over the storefront paintings.
  cutout_fairview: '/_blob/3742d8baed8d6a6f2e09922fab82de8d',
  cutout_urys_waterfront: '/_blob/d76e5738b7bc4b1fb5c4a31006349169',
  cutout_boathouse: '/_blob/7f0c510aa38e0429b72d0489a08d79f4',
  cutout_groffs: '/_blob/0629a6591f3e1aa5482ed0a3aa2dd0bd',
  cutout_boardwalk_chapel: '/_blob/d68da926230f4ee88e5bec1ecc5b806a',
  cutout_st_anselms: '/_blob/6ff7f03710e4407755d787063fc3674e',
  cutout_holy_redeemer: '/_blob/ae53eebeb1603d89f72a50e25b2f2854',
  cutout_wai_kiki: '/_blob/3854c93a98f86dc6451f73a9b3816047',
  cutout_a_frame_cottage: '/_blob/bd087bd48d9a00e4fa3895686cb1ffc7',
  cutout_malibu: '/_blob/2a6d83f6263231f00623fbbdd770ee1d',
  cutout_seafoam_cottage: '/_blob/fc9c4fe08037c4a118e42e866fdf8761',
  cutout_bills_corner_deli: '/_blob/2d3871d8342bad68079cf3cb366d3edd',
  cutout_wildwood_high: '/_blob/a457c4b06951a090bc6f75261a38cce6',
  cutout_lollypop_motel: '/_blob/2dc651f2228c73987d20121ae4f2c2cd',
  cutout_klugs: '/_blob/6c2d45646fad785a689ca572cf7b52cf',
  cutout_hereford_light: '/_blob/e0307f61dc87c06ef4eb5eb4c99465af',
  cutout_hurricane: '/_blob/31087507dd1841d3ac186a46596e219c',
  cutout_nw_city_hall: '/_blob/5cc2ef9756bae0a22f73a723f36babb2',
  // The c batch and 108-112 (transparent; near-miss names where the real ones may operate).
  cutout_sea_shell: '/_blob/cce3681e479aa416ca0b521218e2490f',
  cutout_curleys: '/_blob/d79374a45d05406fcc0e1a545ce74b01',
  cutout_route_69_diner: '/_blob/2c5d19a302c1a6a5615cd588dbc466cb',
  cutout_bobby_dees: '/_blob/6e3f98f1280bf47ced9e011ffaaae03e',
  cutout_shore_motel: '/_blob/fd322d4a38297cc03e00cf6ebafefae7',
  cutout_octopus_mini_golf: '/_blob/ab7314a4d92925ee7c01f621a4b954b7',
  cutout_shore_house: '/_blob/d79cf26383c70f1ea1ec2c7f79651078',
  cutout_beach_house: '/_blob/ddc2471ffb2ed4453ecf10e8c04a000b',
  cutout_starlux: '/_blob/370c4e7d572776747948cf39043e978f',
  cutout_corner_inn: '/_blob/ce1201e0f4725a2aae0ad14b4c254d45',
  cutout_seafood_shack: '/_blob/6418e1ed07fc9952e538efa74967ece6',
  cutout_brick_church: '/_blob/4a838e6aa3a66befb42ed9b7691fac0a',
  cutout_ship_n_shore: '/_blob/ffa35404bb2caca67c77ee430a75b650',
  cutout_alp_pizza: '/_blob/89ac2cfd435705c32d99f5f8f75201fb',
  cutout_alp_pizza_front: '/_blob/88dc3a3ecdf87eb33dc5701256459d83',
  cutout_alp_pizza_corner: '/_blob/fafb97243be30363259bec5ed23916f6',
  cutout_samuels_pancake_house: '/_blob/1b4e0260ef115225130b0f28bbbe5429',
  cutout_samuels_cafe: '/_blob/54de101660925d00fd067f7a67dec546',
  cutout_boat_tag: '/_blob/da0c4c616eac9eee14bbcc70a4e62761',
  /** A steel looping coaster: late era (from 1976) only. */
  cutout_loop_coaster: '/_blob/a16f6ac6bd503ed530ae2e139daeb03e',
  // Batch 5 (art2): the rest of the user's pictures, so every one has a home.
  // Houses for the residential blocks (transparent models).
  cutout_house_yellow_beach: '/_blob/51e3759b067f36493710e8cef8ee590d',
  cutout_victorian_boardinghouse: '/_blob/576464afb8dfb6ebad963d0e08b7e296',
  cutout_shingle_estate: '/_blob/10e9926c679fb03f168f93ed76b01b99',
  cutout_red_victorian: '/_blob/8026213c47dc40b4caaaf0c4ce5c93d3',
  cutout_white_shore_home: '/_blob/f297575a5a2df155c41b68d392bea953',
  /** A seafood shack by the docks (the navy backdrop keyed out). */
  cutout_ricks_seafood: '/_blob/0375c2397a8a9e6291b9163a30549ff3',
  /** Pacific Avenue's Doo Wop strip at blue hour (Ocean's Club, the Driftwood Lounge): a walk backdrop. */
  street_pacific_neon: '/_blob/7a9bf7cdd7686b16d9e124dc125095d0',
  /** The Doo Wop blocks from above (THE CARIBBEAN repainted THE CARIBBEE): a backdrop. */
  scene_doowop_neighborhood: '/_blob/1643d869672f79f64b59b70cec916956',
  /** The Starburst building (pizza window, the Neon arcade, the Starburst lounge). */
  storefront_starburst: '/_blob/0e3a0dae0cae59ce7d82d6abbcda3a25',
  /** Atlantic City's boards with casino towers (BALLY'S / CAESAR'S repainted): late era only (1978 on). */
  scene_ac_boardwalk: '/_blob/71568cd649e508f8dc9372871c849dd6',
  /** South Jersey from the air (the shore towns pinned): the trip planner's header. */
  scene_region_map: '/_blob/b19563fbc58ffc7ea8b5753bef343f47',
  // Batch 5b: the pier wheels (transparent), two Crest motels under near-miss names, and the
  // island from the air. (c94-c96 and c98 are the same pictures as 109, 110, 112 and 113.)
  /** The next pier's wheels (the Giant Wheel, white or lit). */
  cutout_ferris_wheel: '/_blob/294e34fdf9a67fff3087aa068412c616',
  cutout_ferris_white: '/_blob/9c3cfa8d50bd1b7e151425adda321013',
  /** PANORAMIC -> PANORAMA (the last tile a star). */
  cutout_panorama_motel: '/_blob/74a3aa837fed13851fa755d229eae0fe',
  /** RIO -> RIO GRANDE on the pole sign. */
  cutout_rio_grande_motel: '/_blob/2929ad3ca5f5980d16239d59553d26f6',
  /** Photoreal: the island from the air looking north (the title, the walk launcher). */
  scene_island_aerial: '/_blob/9745943082c2d3c28c9923769b95cfe0',
  // The Boss's Office (ui/office): the room upstairs, the club in cutaway, and the club as a
  // transparent 3/4 building for the map.
  office_interior: '/_blob/47678064ebd951bb3aaa629bb66de875',
  social_club_cutaway: '/_blob/50ad4234a3c2b59c7222e69e8bc9c50c',
  social_club_building: '/_blob/5fe16427d4863a49e4d0dc865cdc3e33',
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
  office_interior: [1697, 927],
  social_club_cutaway: [1697, 927],
  social_club_building: [1536, 1024],
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
