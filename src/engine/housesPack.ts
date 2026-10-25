import { EXTRA_HOUSES, type Stock } from './housesData';
import type { HouseType } from './houses';
import type { HouseSeed } from './housesHistory';
import { PACK_DYNASTIES, type PackDynasty } from './housesPackData';
import { showbizSeeds } from './housesShowbiz';

/**
 * Adapter: the world pack's political, police and fire dynasties (extracted
 * into housesPackData.ts by scripts/houses/extractPack.mts) become house
 * seeds. Their people (founders who died in the 1940s, the 1960 office
 * holders, the heirs) are the anchors; housesHistory.ts generates the
 * generations above them back to the immigrant or old-stock founder, and
 * the brothers, sisters and cousins around them.
 */

const ORIGIN_STOCK: Record<string, Stock> = {
  Irish: 'Irish', WASP: 'OldStock', Black: 'Migration', German: 'German', Polish: 'Polish', Jewish: 'Galician', Italian: 'Neapolitan',
  Greek: 'Neapolitan', PuertoRican: 'Neapolitan',
};

/** Pack dynasties the built-in list does not describe. */
const MORE: Record<string, { type: HouseType; seat: string; stock: Stock }> = {
  montalto: { type: 'police', seat: 'South Philadelphia', stock: 'Calabrian' },
  kilbride: { type: 'police', seat: 'Wildwood', stock: 'Irish' },
  gilhooley: { type: 'fire', seat: 'Wildwood', stock: 'Irish' },
  szymanski: { type: 'police', seat: 'Port Richmond, Philadelphia', stock: 'Polish' },
};

function stockOf(d: PackDynasty): Stock {
  const counts = new Map<string, number>();
  for (const p of d.people) counts.set(p.origin, (counts.get(p.origin) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Irish';
  return ORIGIN_STOCK[top] ?? 'Irish';
}

export function packSeeds(): HouseSeed[] {
  const out: HouseSeed[] = [];
  for (const d of PACK_DYNASTIES) {
    const known = EXTRA_HOUSES.find((x) => x.pack === d.id);
    const more = MORE[d.id];
    const type = known?.type ?? more?.type ?? (d.people.some((p) => p.domain === 'police') ? 'police' : 'political');
    out.push({
      id: known?.id ?? `h_${d.id}`,
      name: singular(d),
      type,
      seat: known?.seat ?? more?.seat ?? d.people[0]?.home ?? 'Wildwood',
      stock: known?.stock ?? more?.stock ?? stockOf(d),
      blurb: known?.blurb ?? d.identity,
      pack: d,
      faction: type === 'police' ? 'law' : undefined,
    });
  }
  // Show business families (housesShowbiz.ts).
  out.push(...showbizSeeds());
  return out;
}

/** "Callahans" -> "Callahan": the surname most of the dynasty's blood carry. */
function singular(d: PackDynasty): string {
  const counts = new Map<string, number>();
  for (const p of d.people) if (!p.maiden) counts.set(p.last, (counts.get(p.last) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? d.name;
}

/** Ids of the pack dynasties (for tests and the adapter's fallback check). */
export const PACK_IDS = PACK_DYNASTIES.map((d) => d.id);
