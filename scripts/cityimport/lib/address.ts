/**
 * Street names and addresses, normalised so OSM ("West Pine Avenue"), the
 * assessor ("W PINE AVE"), the game ("Pine Ave") and old directories ("W Pine
 * av") compare equal. Pure.
 */

const SUFFIX: Record<string, string> = {
  avenue: 'Ave', ave: 'Ave', av: 'Ave', aves: 'Ave', boulevard: 'Blvd', blvd: 'Blvd', bl: 'Blvd', bvd: 'Blvd', road: 'Rd', rd: 'Rd', street: 'St', st: 'St',
  drive: 'Dr', dr: 'Dr', lane: 'Ln', ln: 'Ln', place: 'Pl', pl: 'Pl', court: 'Ct', ct: 'Ct', terrace: 'Ter', ter: 'Ter', way: 'Way', boardwalk: 'Boardwalk', bdwk: 'Boardwalk',
};
const DIR: Record<string, string> = { w: 'W', west: 'W', e: 'E', east: 'E', n: 'N', north: 'N', s: 'S', south: 'S' };
const ORD: Record<string, string> = {
  first: '1st', second: '2nd', third: '3rd', fourth: '4th', fifth: '5th', sixth: '6th', seventh: '7th', eighth: '8th', ninth: '9th', tenth: '10th', eleventh: '11th', twelfth: '12th',
  thirteenth: '13th', fourteenth: '14th', fifteenth: '15th', sixteenth: '16th', seventeenth: '17th', eighteenth: '18th', nineteenth: '19th', twentieth: '20th',
  'twenty-first': '21st', 'twenty-second': '22nd', 'twenty-third': '23rd', 'twenty-fourth': '24th', 'twenty-fifth': '25th', 'twenty-sixth': '26th',
};
/** Directory abbreviations of street names seen in shore directories (extend per city). */
const ABBR: Record<string, string> = { pac: 'Pacific', atl: 'Atlantic', nj: 'New Jersey', 'n j': 'New Jersey', ny: 'New York', 'n y': 'New York', schell: 'Schellenger' };

export interface StreetName { dir?: string; base: string; suffix?: string }

const cap = (w: string) => w.replace(/(^|[\s-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());

/** Parses a street name: direction prefix, base, suffix. */
export function parseStreet(raw: string): StreetName {
  let s = raw.toLowerCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
  let dir: string | undefined;
  const d = /^(w|west|e|east|n|north|s|south)\s+(.*)$/.exec(s);
  if (d && d[2].split(' ').length >= 1 && !/^(jersey|york)\b/.test(d[2])) { dir = DIR[d[1]]; s = d[2]; }
  const words = s.split(' ');
  let suffix: string | undefined;
  if (words.length > 1 && SUFFIX[words[words.length - 1]]) suffix = SUFFIX[words.pop()!];
  let base = words.join(' ');
  if (ORD[base]) base = ORD[base];
  if (ABBR[base]) base = ABBR[base];
  return { dir, base: /^\d/.test(base) ? base : cap(base), suffix };
}

/** The key two names compare on: base + suffix (no direction: E/W halves of a cross street are one street). */
export function streetKey(raw: string): string {
  const p = parseStreet(raw);
  return `${p.base}${p.suffix ? ` ${p.suffix}` : ''}`.toLowerCase();
}

/** A display name in the game's style ("Pine Ave"). */
export function streetDisplay(raw: string): string {
  const p = parseStreet(raw);
  return `${p.base}${p.suffix ? ` ${p.suffix}` : ''}`;
}

export interface Address { number: number; numberTo?: number; unit?: string; street: StreetName; raw: string }

/** "115-117 W POPLAR AVE", "3401 New Jersey Avenue", "120 E MAPLE AVE #A". */
export function parseAddress(raw: string): Address | undefined {
  const m = /^\s*(\d+)(?:\s*-\s*(\d+))?([A-Z])?\s+(.+?)(?:\s+(#\s*\w+|unit\s+\w+|\d[A-Z]))?\s*$/i.exec(raw);
  if (!m) return undefined;
  return { number: Number(m[1]), numberTo: m[2] ? Number(m[2]) : undefined, unit: m[5] ?? m[3], street: parseStreet(m[4]), raw };
}

/** Whether two addresses name the same place (number inside the other's range, same street, same direction when both give one). */
export function sameAddress(a: Address, b: Address): boolean {
  if (`${a.street.base}|${a.street.suffix ?? ''}`.toLowerCase() !== `${b.street.base}|${b.street.suffix ?? ''}`.toLowerCase()) {
    // A missing suffix on one side still matches ("Pacific" vs "Pacific Ave").
    if (a.street.base.toLowerCase() !== b.street.base.toLowerCase() || (a.street.suffix && b.street.suffix)) return false;
  }
  if (a.street.dir && b.street.dir && a.street.dir !== b.street.dir) return false;
  const inR = (n: number, x: Address) => n >= x.number && n <= (x.numberTo ?? x.number);
  return inR(a.number, b) || inR(b.number, a) || (a.numberTo !== undefined && inR(a.numberTo, b));
}

export function formatOsmAddress(tags: Record<string, string>): string | undefined {
  if (!tags['addr:street']) return undefined;
  return `${tags['addr:housenumber'] ? `${tags['addr:housenumber']} ` : ''}${tags['addr:street']}`;
}
