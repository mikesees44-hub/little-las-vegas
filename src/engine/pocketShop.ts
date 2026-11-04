import { player } from './characters';
import { adultOn } from './datingState';
import { eveningKindOf, type EveningPlan } from './evening';
import { activeGoomars, goomarTerms } from './goomar';
import { owned as ownedLux, LUX_BY_ID, resaleValue } from './goodlife';
import { declaredWeekly, giftTargets, lavishness, seenWeekly, spendOwned, spendResale, spendUpkeep, spendUpkeepByPot, type GiftTarget } from './spend';
import { SPEND, SPEND_BY_ID, type SpendItem } from './spendData';
import { ownsFloridaPlace } from './spendState';
import type { Character, GameState } from './types';

/**
 * YOUR POCKET, SPENT (the owner's ask: "add the gifts to buy for personal spending: houses, cars, motel
 * rooms for dates, jewelry, Rolexes, apartments for a mistress, a condo in Florida").
 *
 * Not a second store: a door from the Pocket badge into the things that are the boss's own, grouped the
 * way a man thinks about them. Every item is a Spend catalog item (spendData / storeData) and every
 * purchase is the same Spend order (prices, upkeep, the IRS's count, respect, opinions, resale); the
 * nights out are the evening flow (evening.ts: she decides), the goomar is the nightlife arrangement
 * (goomar.ts: she decides). This module only picks and groups them, and says what he owns.
 *
 * Mature content Off hides the room for the night, the goomar and her things.
 */

export type PocketGroup = 'homes' | 'cars' | 'him' | 'her' | 'nights' | 'goomar';

export interface PocketGroupDef {
  id: PocketGroup;
  label: string;
  blurb: string;
  /** Only with Mature content on. */
  mature?: boolean;
}

export const POCKET_GROUPS: PocketGroupDef[] = [
  { id: 'homes', label: 'Homes', blurb: 'His house, a summer place, a place in Florida. Upkeep every week; they hold their value; the IRS sees the big ones.' },
  { id: 'cars', label: 'Cars', blurb: 'A Cadillac impresses the men and the IRS alike. Cars lose value and cost a little every week.' },
  { id: 'him', label: 'For him', blurb: 'The watch, the cufflinks, the suits, the rings. The men notice what the boss wears; so does the man from the IRS.' },
  { id: 'her', label: 'For her', blurb: 'Jewelry and furs for your wife, a woman you are seeing, or a daughter. Pick who it is for: a present for somebody other than your wife can reach your wife.' },
  { id: 'nights', label: 'Nights out', blurb: 'Dinner at the club, a show, a weekend away; with a woman you are seeing, a room for the night or a suite. She decides; the report fades to morning.' },
  { id: 'goomar', label: 'Her apartment', blurb: 'A goomar: her own apartment and an allowance, from your pocket every week. Only with a woman already seeing you, and only if she says yes.', mature: true },
];

export interface PocketShelf { label: string; items: SpendItem[] }

const ids = (...xs: string[]) => xs.map((x) => SPEND_BY_ID[x]).filter((x): x is SpendItem => !!x);

const HOMES: [string, string[]][] = [
  ['His house', ['st_rowhouse', 'st_cresthouse', 'st_waterfront', 'st_mansion', 'st_penthouse', 'st_country', 'st_estate']],
  ['A summer place', ['st_cottage', 'st_capemay', 'sp_stoneharbor', 'st_pocono', 'sp_huntcamp']],
  ['Florida', ['st_miamicondo', 'sp_bayharbor']],
];
const HIM: [string, string[]][] = [
  ['Watches', ['st_hamilton', 'st_seamaster', 'st_speedmaster', 'st_submariner', 'sp_rolex', 'st_cartier', 'st_dayDate', 'sp_patek', 'st_vacheron', 'st_audemars']],
  ['Cufflinks, pins and the little things', ['sp_moneyclip', 'st_tiepin', 'st_lighter', 'sp_cufflinks', 'sp_cigcase', 'sp_stickpin']],
  ['Rings', ['st_ringyou', 'sp_pinky']],
  ['Suits and clothes', ['sp_brooks', 'sp_gators', 'sp_fedoras', 'sp_camel', 'sp_suit', 'st_customshoes', 'sp_cashmere', 'sp_shirts', 'sp_tux', 'st_dinnersuit', 'st_sharkskin', 'st_italiansuit', 'st_ivy', 'sp_suits12']],
];
const NIGHTS = ['st_dinner_bookbinders', 'st_concert', 'st_theater', 'sp_500club', 'sp_broadway', 'st_shoreweekend', 'sp_clubtable'];

/** Is an item hidden by the Mature setting (a mistress's things)? */
export function matureItem(it: SpendItem): boolean {
  return !!it.mature || it.gift === 'goomar' || it.req === 'goomar';
}

/** What a group offers now (gone-by-year and, with Mature content Off, the mistress's things are left out). */
export function pocketShelves(s: GameState, g: PocketGroup): PocketShelf[] {
  const keep = (it: SpendItem) => (it.maxYear ?? 9999) >= s.date.y && (!matureItem(it) || adultOn(s));
  const shelf = (label: string, items: SpendItem[]): PocketShelf => ({ label, items: items.filter(keep) });
  switch (g) {
    case 'homes': return HOMES.map(([l, x]) => shelf(l, ids(...x)));
    case 'cars': return [shelf('Cars', SPEND.filter((it) => it.cat === 'cars' && it.kind === 'own' && it.pot === 'pocket' && !it.needs && it.racer === undefined && it.price >= 300 && (it.minYear ?? 0) <= s.date.y).sort((a, b) => a.price - b.price))];
    case 'him': return HIM.map(([l, x]) => shelf(l, ids(...x)));
    case 'her': {
      const her = SPEND.filter((it) => it.cat === 'jewelry' && (it.gift === 'wife' || it.gift === 'goomar' || it.gift === 'daughter' || it.gift === 'anyone') && !it.each && !it.per);
      return [
        shelf('Jewelry', her.filter((it) => !/mink|chinchilla|sable|stole|fox|lamb|gown|dress/i.test(it.name)).sort((a, b) => a.price - b.price)),
        shelf('Furs and gowns', her.filter((it) => /mink|chinchilla|sable|stole|fox|lamb|gown|dress/i.test(it.name)).sort((a, b) => a.price - b.price)),
      ];
    }
    case 'nights': return [shelf('Out on the town', ids(...NIGHTS))];
    case 'goomar': return [shelf('For her place', ids('st_goomar_flat'))];
  }
}

/** The groups he can open (her apartment only with Mature content on). */
export function pocketGroups(s: GameState): PocketGroupDef[] {
  return POCKET_GROUPS.filter((g) => !g.mature || adultOn(s));
}

/** Who a present in "For her" can be for: his wife, his goomars, the women he is seeing, his daughters. */
export function herTargets(s: GameState): GiftTarget[] {
  return giftTargets(s).filter((t) => t.kind !== 'son');
}

/** The women he is seeing (not his wife, not a professional): the evenings out can be with them. */
export function nightWomen(s: GameState): Character[] {
  const b = player(s);
  if (!b?.alive) return [];
  return giftTargets(s).filter((t) => t.kind === 'lover' || t.kind === 'goomar').map((t) => s.characters[t.id]).filter((c): c is Character => !!c && eveningKindOf(s, c.id) === 'date');
}

/** The evenings the shop offers with her: a room for the night (Mature on), a suite in Atlantic City (Mature on), a night on the town. All the evening flow's own orders. */
export function nightPlans(s: GameState, id: string): { key: string; label: string; plan: EveningPlan }[] {
  const out: { key: string; label: string; plan: EveningPlan }[] = [];
  if (adultOn(s)) {
    out.push({ key: 'motel', label: 'A motel room for the night', plan: { id, kind: 'release', at: 'motel', approach: 'night', stay: true } });
    out.push({ key: 'suite', label: 'A suite in Atlantic City', plan: { id, kind: 'getaway', dest: 'ac', cover: 'business', approach: 'queen', stay: true } });
  }
  out.push({ key: 'town', label: 'A night on the town', plan: { id, kind: 'town', approach: 'something', stay: false } });
  return out;
}

/** Her apartment: each goomar's terms, as the nightlife arrangement keeps them. */
export function goomarPlaces(s: GameState): { id: string; name: string; where: string; weekly: number; since: number; wifeKnows: boolean }[] {
  if (!adultOn(s)) return [];
  return activeGoomars(s).map((g) => {
    const c = s.characters[g.id];
    return { id: g.id, name: c ? `${c.firstName} ${c.lastName}` : 'She', where: g.where ?? goomarTerms(s, g.id).where, weekly: g.rent + g.allowance, since: g.since, wifeKnows: !!g.wifeKnows };
  });
}

/* ------------------------------------------------------------------ */
/* What he owns                                                         */
/* ------------------------------------------------------------------ */

export interface OwnedRow {
  uid: string;
  id: string;
  name: string;
  paid: number;
  worth: number;
  upkeep: number;
  /** Whose it is when it is not his (the wife's diamond, her apartment). */
  holder?: string;
  /** The older Good Life catalog (sold there). */
  legacy?: boolean;
}

/** Everything the pocket bought that is still around: his own, and what he bought for others. */
export function pocketOwned(s: GameState): OwnedRow[] {
  const rows: OwnedRow[] = spendOwned(s).filter((o) => o.pot === 'pocket' && SPEND_BY_ID[o.id]?.kind === 'own').map((o) => {
    const it = SPEND_BY_ID[o.id];
    return { uid: o.uid, id: o.id, name: it.name, paid: o.paid, worth: spendResale(s, o), upkeep: spendUpkeep(s, it), holder: o.holder };
  });
  for (const o of ownedLux(s)) {
    const it = LUX_BY_ID[o.id];
    if (it) rows.push({ uid: o.uid, id: o.id, name: it.name, paid: o.paid, worth: resaleValue(s, o), upkeep: it.upkeep, legacy: true });
  }
  return rows;
}

/** Things he gave away (newest first). */
export function pocketGiven(s: GameState): { week: number; name: string; to: string; worth: number }[] {
  return [...(s.spend?.given ?? [])].reverse().map(([week, id, to, worth]) => ({ week, name: SPEND_BY_ID[id]?.name ?? id, to: s.characters[to] ? `${s.characters[to].firstName} ${s.characters[to].lastName}` : 'somebody', worth }));
}

/** The pocket's weekly bills: the Spend upkeep from the pocket, the goomars' rent and allowance. */
export function pocketWeekly(s: GameState): { upkeep: number; goomars: number; total: number } {
  const upkeep = spendUpkeepByPot(s).pocket;
  const goomars = adultOn(s) ? activeGoomars(s).reduce((a, g) => a + g.rent + g.allowance, 0) : 0;
  return { upkeep, goomars, total: upkeep + goomars };
}

/** What the IRS sees against what his books explain (a laborer's wage plus what his straight businesses explain). */
export function pocketBooks(s: GameState): { declared: number; seen: number; lavish: number; irs: number; florida: boolean } {
  return { declared: declaredWeekly(s), seen: seenWeekly(s), lavish: Math.round(lavishness(s) * 10) / 10, irs: Math.round(s.spend?.irs ?? 0), florida: ownsFloridaPlace(s) };
}
