/**
 * Which Sanborn sheets cover an import area, from a transcribed street index
 * (citydata/<city>/evidence/sanborn-*-index.json): every parcel address is
 * looked up by street, side (E/W/N) and house number. Addresses no entry
 * covers are listed; entries on the same streets just outside the area's
 * ranges name the neighbouring sheets. Nothing is guessed: an uncovered
 * address stays uncovered until the main index or key map is transcribed.
 */
import { parseAddress } from '../lib/address';
import { streetKey } from '../lib/address';

export interface IndexEntry { street: string; dir: string | null; range: [number, number] | null; sheets: string[]; oneSideOnly: boolean; list: string; note?: string }
export interface IndexDoc { schemaVersion: 1; source: Record<string, string>; method: string; whatItIs: string; entries: IndexEntry[] }

export interface SheetPlan {
  covered: { sheet: string; addresses: string[] }[];
  uncovered: { street: string; dir?: string; from: number; to: number; parcels: number }[];
  /** Sheets that list the same streets at other house numbers (neighbouring sheets). */
  neighbours: { sheet: string; why: string[] }[];
}

export function planSheets(doc: IndexDoc, addresses: string[]): SheetPlan {
  const covered = new Map<string, Set<string>>();
  const unc = new Map<string, { street: string; dir?: string; from: number; to: number; parcels: number }>();
  const neigh = new Map<string, Set<string>>();
  for (const raw of addresses) {
    const a = parseAddress(raw);
    if (!a) continue;
    const key = streetKey(`${a.street.base} ${a.street.suffix ?? ''}`);
    const same = doc.entries.filter((e) => streetKey(e.street) === key && (!e.dir || !a.street.dir || e.dir === a.street.dir));
    const hit = same.filter((e) => e.range && a.number >= e.range[0] && a.number <= e.range[1]);
    if (hit.length) { for (const e of hit) for (const s of e.sheets) { const c = covered.get(s) ?? new Set(); c.add(raw); covered.set(s, c); } continue; }
    const k = `${a.street.dir ?? ''} ${a.street.base} ${a.street.suffix ?? ''}`.trim();
    const u = unc.get(k) ?? { street: `${a.street.base}${a.street.suffix ? ` ${a.street.suffix}` : ''}`, dir: a.street.dir, from: a.number, to: a.number, parcels: 0 };
    u.from = Math.min(u.from, a.number); u.to = Math.max(u.to, a.number); u.parcels++;
    unc.set(k, u);
    for (const e of same) for (const s of e.sheets) {
      const n = neigh.get(s) ?? new Set();
      n.add(`${e.dir ? `${e.dir} ` : ''}${e.street} ${e.range ? `${e.range[0]}-${e.range[1]}` : '(no range)'}${e.oneSideOnly ? ' (one side shown)' : ''} [${e.list}]`);
      neigh.set(s, n);
    }
  }
  return {
    covered: [...covered].map(([sheet, s]) => ({ sheet, addresses: [...s].sort() })).sort((a, b) => a.sheet.localeCompare(b.sheet, 'en', { numeric: true })),
    uncovered: [...unc.values()].sort((a, b) => a.street.localeCompare(b.street) || (a.dir ?? '').localeCompare(b.dir ?? '')),
    neighbours: [...neigh].map(([sheet, s]) => ({ sheet, why: [...s].sort() })).sort((a, b) => a.sheet.localeCompare(b.sheet, 'en', { numeric: true })),
  };
}
