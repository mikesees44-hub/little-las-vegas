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
  // The 22 already in the asset store.
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
  // Batch 2, signs repainted with fictional names (the real ones still operate).
  storefront_peanut_gallery: undefined,
  storefront_marios_pizza: undefined,
  storefront_olympia_fascination: undefined,
  storefront_eddies_fun_palace: undefined,
  storefront_royal_casino_arcade: undefined,
} satisfies Record<string, string | undefined>;

export type AssetKey = keyof typeof ASSET_URLS;

/** Pixel size of each image (for crops and hotspot frames). */
export const ASSET_SIZE: Partial<Record<AssetKey, [number, number]>> = {
  doowop_block_turnaround: [1600, 874],
  starfin_motel_turnaround: [1536, 1024],
  bellavita_restaurant_turnaround: [1536, 1024],
  bayview_deli_turnaround: [1536, 1024],
  starlight_scoops_turnaround: [1536, 1024],
  shamrock_turnaround: [1536, 1024],
  red_garter_turnaround: [1536, 1024],
  neighborhood_twilight_1958: [1536, 1024],
  boardwalk_blue_hour_1958: [1600, 874],
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
