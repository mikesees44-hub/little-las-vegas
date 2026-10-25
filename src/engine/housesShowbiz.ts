import { ALL_PEOPLE, type WorldPerson } from '../worldpack';
import type { Stock } from './housesData';
import type { HouseSeed } from './housesHistory';
import type { PackDynasty, PackPerson } from './housesPackData';

/**
 * Show business families from the world pack (all fictional): the stars of
 * the circuit, and every entertainer who has family in the pack (the
 * Domínguez brothers and Carmen Reyes, Billy Winters and his son, the Harris
 * twins, a starlet whose father sits on the bench ...), become houses with
 * trees. Their people keep the pack's ids, so a star who dies in the world
 * (polPeople.ts) dies in the tree, and the other way round, through the one
 * death function.
 *
 * Built from the pack at load time; nothing here is a real performer.
 */

/** A performer this famous has a house of their own even without family in the pack. */
const STAR_FAME = 65;
const KIN = new Set(['parent', 'child', 'spouse', 'sibling', 'grandparent', 'grandchild', 'ex-spouse']);
const INVERSE: Record<string, string> = { parent: 'child', child: 'parent', spouse: 'spouse', 'ex-spouse': 'ex-spouse', sibling: 'sibling', grandparent: 'grandchild', grandchild: 'grandparent' };

const ORIGIN_STOCK: Record<string, Stock> = {
  Irish: 'Irish', WASP: 'OldStock', Black: 'Migration', German: 'German', Polish: 'Polish', Jewish: 'Galician', Italian: 'Neapolitan',
  Greek: 'Neapolitan', PuertoRican: 'Caribbean',
};

let cache: { dynasties: PackDynasty[]; seeds: HouseSeed[] } | undefined;

function build(): { dynasties: PackDynasty[]; seeds: HouseSeed[] } {
  const real = ALL_PEOPLE.filter((p) => !p.tags?.includes('generated'));
  const byId = new Map<string, WorldPerson>(real.map((p) => [p.id, p]));
  // Family ties both ways (the pack often records only one side).
  const ties = new Map<string, [string, string][]>();
  const tie = (a: string, kind: string, b: string) => {
    const l = ties.get(a) ?? ties.set(a, []).get(a)!;
    if (!l.some(([k, o]) => k === kind && o === b)) l.push([kind, b]);
  };
  for (const p of real) {
    if (p.dynastyId) continue;
    for (const r of p.relationships) {
      const o = byId.get(r.id);
      if (!KIN.has(r.kind) || !o || o.dynastyId) continue;
      tie(p.id, r.kind, o.id);
      tie(o.id, INVERSE[r.kind], p.id);
    }
  }
  const seen = new Set<string>();
  const dynasties: PackDynasty[] = [];
  const seeds: HouseSeed[] = [];
  const stars = real.filter((p) => p.institution === 'showbiz' && !p.dynastyId).sort((a, b) => (b.showbiz?.fame ?? 0) - (a.showbiz?.fame ?? 0) || (a.id < b.id ? -1 : 1));
  for (const star of stars) {
    if (seen.has(star.id)) continue;
    // The family: everyone reachable through kin ties.
    const fam: WorldPerson[] = [];
    const q = [star.id];
    const mine = new Set<string>();
    while (q.length) {
      const id = q.shift()!;
      if (mine.has(id)) continue;
      mine.add(id);
      fam.push(byId.get(id)!);
      for (const [, o] of ties.get(id) ?? []) if (!mine.has(o)) q.push(o);
    }
    if (fam.length < 2 && (star.showbiz?.fame ?? 0) < STAR_FAME) continue;
    for (const id of mine) seen.add(id);
    const people = fam.map((p) => packPerson(p, ties.get(p.id) ?? [], fam));
    lateHusbands(people, fam);
    const name = houseName(people);
    const id = `sb_${name.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}`;
    const top = fam.filter((p) => p.showbiz).sort((a, b) => (b.showbiz!.fame - a.showbiz!.fame))[0] ?? star;
    const d: PackDynasty = { id, name, identity: top.publicReputation, powerBase: top.office, people };
    dynasties.push(d);
    // The stock of the blood that carries the name.
    const origin = (fam.find((p) => p.name.last === name && p.sex === 'M') ?? fam.find((p) => p.name.last === name) ?? top).origin;
    const stage = top.nickname && /\s/.test(top.nickname) ? top.nickname : undefined;
    seeds.push({
      id: `h_${id}`, name, type: 'showbiz', seat: top.hometown, stock: ORIGIN_STOCK[origin] ?? 'Irish', pack: d,
      blurb: `${stage ? `${stage} (born ${top.name.first} ${top.name.last}). ` : ''}${top.publicReputation}`,
    });
  }
  return { dynasties, seeds };
}

function packPerson(p: WorldPerson, rel: [string, string][], fam: WorldPerson[]): PackPerson {
  const o: PackPerson = {
    id: p.id, first: p.name.first, last: p.name.last, g: p.sex, by: p.birthYear, origin: p.origin, eth: p.gameEthnicity,
    office: p.office, home: p.hometown, domain: p.domain, rel: rel.filter(([, x]) => fam.some((f) => f.id === x)),
  };
  if (p.name.maiden) o.maiden = p.name.maiden;
  // A star who kept her own name after marrying in: that name is her maiden name.
  else if (p.sex === 'F' && !rel.some(([k]) => k === 'parent') && rel.some(([k, x]) => k === 'spouse' && fam.find((f) => f.id === x)?.name.last !== p.name.last)) o.maiden = p.name.last;
  if (p.nickname) o.nick = p.nickname;
  if (p.deathYear !== undefined && p.deathYear <= 1960) {
    o.dy = p.deathYear;
    if (p.deathCause) o.cause = p.deathCause;
  }
  if (p.careerHistory?.length) o.career = p.careerHistory.map((c) => `${c.title} (${c.year})`).slice(-3);
  return o;
}

const HUSBAND_NAME: Record<string, string> = { Irish: 'Thomas', WASP: 'Charles', Italian: 'Carmine', Jewish: 'Abraham', Black: 'Willie', German: 'Otto', Polish: 'Stanley', PuertoRican: 'José', Greek: 'Nikos' };

/** A mother in the pack with children of her name and no husband recorded is a widow: her late husband goes in the tree. */
function lateHusbands(people: PackPerson[], fam: WorldPerson[]): void {
  for (const p of people.slice()) {
    if (p.g !== 'F' || p.rel.some(([k]) => k === 'spouse' || k === 'parent')) continue;
    const kids = p.rel.filter(([k]) => k === 'child').map(([, x]) => people.find((q) => q.id === x)!).filter((k) => k && k.last === p.last);
    if (!kids.length) continue;
    const w = fam.find((f) => f.id === p.id)!;
    const said = /died in (\d{4})/.exec(`${w.publicReputation} ${w.hiddenPersonality}`);
    const youngest = Math.max(...kids.map((k) => k.by));
    const dy = Math.min(1959, said ? Number(said[1]) : youngest + 10);
    const id = `${p.id}_husband`;
    people.push({
      id, first: HUSBAND_NAME[p.origin] ?? 'John', last: p.last, g: 'M', by: p.by - 4, dy, cause: 'a heart attack', origin: p.origin, eth: p.eth,
      office: '', home: p.home, domain: 'civilian', rel: [['spouse', p.id], ...kids.map((k): [string, string] => ['child', k.id])],
    });
    p.rel.push(['spouse', id]);
    for (const k of kids) k.rel.push(['parent', id]);
  }
}

/** The surname most of the blood carry (the men, and the women born to it). */
function houseName(people: PackPerson[]): string {
  const counts = new Map<string, number>();
  for (const p of people) if (!p.maiden) counts.set(p.last, (counts.get(p.last) ?? 0) + (p.g === 'M' ? 2 : 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ?? people[0].last;
}

/** House seeds for the show business families (housesPack.ts adds them to the pack's dynasties). */
export function showbizSeeds(): HouseSeed[] {
  cache ??= build();
  return cache.seeds;
}

export function showbizDynasties(): PackDynasty[] {
  cache ??= build();
  return cache.dynasties;
}
