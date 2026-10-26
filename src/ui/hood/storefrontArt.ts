import type { AssetKey } from './art/assetUrls';

/**
 * Which of the user's storefront paintings stands for a building: by the
 * record's own name first (the places painted for this game), then by what
 * the place is. `turn` is a four-angle sheet (the Turnaround viewer);
 * `inside` an interior shot shown under it. Undefined: the drawn postcard.
 */
export interface StorefrontArt { key: AssetKey | AssetKey[]; turn?: boolean; inside?: AssetKey }

const BY_NAME: [RegExp, StorefrontArt][] = [
  [/red garter/i, { key: 'red_garter_turnaround', turn: true, inside: 'red_garter_interior_twilight' }],
  [/peanut gallery/i, { key: ['storefront_peanut_gallery', 'seaside_fudge'] }],
  [/mario's/i, { key: ['storefront_marios_pizza', 'neon_moon_pizza'] }],
  [/olympia/i, { key: ['storefront_olympia_fascination', 'lucky_sevens_arcade'] }],
  [/eddie's fun/i, { key: ['storefront_eddies_fun_palace', 'lucky_sevens_arcade'] }],
  [/royal casino/i, { key: ['storefront_royal_casino_arcade', 'lucky_sevens_arcade'] }],
  [/fun shop|novelt/i, { key: 'boardwalk_fun_shop' }],
  [/shamrock/i, { key: 'shamrock_turnaround', turn: true, inside: 'shamrock_twilight' }],
  [/starlight scoops/i, { key: 'starlight_scoops_turnaround', turn: true, inside: 'starlight_scoops_twilight' }],
  [/lucky sevens/i, { key: ['lucky_sevens_arcade', 'storefront_lucky_sevens'] }],
  [/\banchor\b/i, { key: ['anchor_tavern', 'storefront_anchor_bar'] }],
  [/bellavita/i, { key: 'bellavita_restaurant_turnaround', turn: true }],
  [/bayview deli/i, { key: 'bayview_deli_turnaround', turn: true }],
  [/starfin/i, { key: 'starfin_motel_turnaround', turn: true }],
  [/blue comet/i, { key: 'blue_comet_motel' }],
  [/chemical bank/i, { key: 'chemical_bank' }],
  [/shore cab/i, { key: 'shore_cab_garage' }],
  [/spin city/i, { key: 'spin_city_laundromat' }],
  [/penny candy/i, { key: 'penny_candy_soda' }],
  [/moon slice/i, { key: 'neon_moon_pizza' }],
  [/bayshore barber/i, { key: 'bayshore_barber' }],
  [/fudge|sweets|taffy/i, { key: 'seaside_fudge' }],
  [/social club/i, { key: 'italian_social_club' }],
  [/captain's table|fish house|seafood|lobster|clam/i, { key: 'lobster_seafood_house' }],
];

const BY_USE: Record<string, StorefrontArt | StorefrontArt[]> = {
  arcade: [
    { key: ['lucky_sevens_arcade', 'storefront_lucky_sevens'] },
    { key: ['storefront_olympia_fascination', 'lucky_sevens_arcade'] },
    { key: ['storefront_eddies_fun_palace', 'lucky_sevens_arcade'] },
    { key: ['storefront_royal_casino_arcade', 'lucky_sevens_arcade'] },
  ],
  hoodclub: { key: ['anchor_tavern', 'storefront_anchor_bar'] },
  bar: { key: ['anchor_tavern', 'storefront_anchor_bar'] },
  trattoria: { key: 'bellavita_restaurant_turnaround', turn: true },
  barber: { key: 'bayshore_barber' },
  pizza: [{ key: 'neon_moon_pizza' }, { key: ['storefront_marios_pizza', 'neon_moon_pizza'] }],
  pharmacy: { key: 'penny_candy_soda' },
  giftshop: [{ key: 'penny_candy_soda' }, { key: 'seaside_fudge' }, { key: ['storefront_peanut_gallery', 'seaside_fudge'] }],
  souvenir: { key: 'boardwalk_fun_shop' },
  tshirt: { key: 'boardwalk_fun_shop' },
  laundromat: { key: 'spin_city_laundromat' },
  drycleaner: { key: 'spin_city_laundromat' },
  commlaundry: { key: 'spin_city_laundromat' },
  taxigarage: { key: 'shore_cab_garage' },
  garage: { key: 'shore_cab_garage' },
  motel: [{ key: 'blue_comet_motel' }, { key: 'starfin_motel_turnaround', turn: true }],
  office: { key: 'chemical_bank' },
  deli: { key: 'bayview_deli_turnaround', turn: true },
  icecream: { key: 'starlight_scoops_turnaround', turn: true, inside: 'starlight_scoops_twilight' },
  storefront: { key: 'doowop_block_turnaround', turn: true },
  apartments: { key: 'doowop_block_turnaround', turn: true },
};

function h(s: string): number {
  let x = 7;
  for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) % 10007;
  return x;
}

/** The painting for a building (stable per record), if there is one. Empty lots and construction sites keep the drawing. */
export function storefrontArt(it: { key: string; name: string; useId?: string; vacant?: boolean; building?: boolean }): StorefrontArt | undefined {
  if (it.vacant || it.building) return undefined;
  for (const [re, a] of BY_NAME) if (re.test(it.name)) return a;
  const u = it.useId ? BY_USE[it.useId] : undefined;
  if (!u) return undefined;
  return Array.isArray(u) ? u[h(it.key) % u.length] : u;
}
