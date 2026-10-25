import { ALL_PEOPLE, LADDERS, PEOPLE_BY_ID, SPECIALTY_TO_GAME, YEARLY_INFLOW, engineTraits, generatePerson, type WorldPerson } from '../worldpack';
import type { InstitutionId, LadderId } from '../worldpack';
import { ageOn } from './calendar';
import { killCharacter } from './dynasty';
import type { Ctx } from './ledger';
import { hashSeed, pick, rand, randInt } from './rng';
import { FULL_TIER, addLog, clamp100, mutP, packRow, unpackRow, type Party, type PolPerson, type PolState } from './polState';
import type { Attributes, Character, Craft, GameState, Trait } from './types';

/**
 * The living world: the population imported from the world pack, in two
 * tiers, with autonomous careers (promotions, retirements, scandals, deaths
 * through the one death function), yearly arrivals, street toughs who rise
 * and can be recruited, and entertainers who rise and fade.
 */

const POLITICAL = new Set(['wildwood_city', 'north_wildwood_city', 'crest_borough', 'west_wildwood', 'cape_may_city', 'middle_twp', 'lower_twp', 'cape_may_county', 'cape_may_party_r', 'cape_may_party_d', 'atlantic_county', 'nj_legislature', 'nj_executive', 'nj_agencies', 'nj_party', 'drpa', 'us_congress', 'atlantic_city', 'philadelphia_city', 'philadelphia_ward']);
const POLICE = new Set(['wildwood_pd', 'north_wildwood_pd', 'crest_pd', 'cmc_prosecutor_detectives', 'cmc_sheriff', 'nj_state_police', 'atlantic_city_pd', 'philadelphia_pd', 'fbi_newark', 'fbi_philadelphia', 'federal_other']);
const FEDERAL = new Set(['fbi_newark', 'fbi_philadelphia', 'federal_other', 'us_attorney_nj', 'federal_court']);
const LEGAL = new Set(['cmc_prosecutor', 'atlantic_prosecutor', 'nj_attorney_general', 'us_attorney_nj', 'philadelphia_da', 'municipal_court', 'county_court', 'superior_court', 'nj_supreme_court', 'federal_court', 'philadelphia_courts', 'private_bar', 'bail']);
const INSPECT = new Set(['wildwood_fd', 'north_wildwood_fd', 'crest_fd', 'county_fire', 'state_fire', 'insurance']);

export type PolGroup = 'politics' | 'police' | 'federal' | 'legal' | 'fire' | 'street' | 'showbiz' | 'civilian';
export const GROUP_NAME: Record<PolGroup, string> = {
  politics: 'Politicians', police: 'Police', federal: 'Federal', legal: 'Courts & lawyers', fire: 'Fire & inspectors', street: 'Street', showbiz: 'Show business', civilian: 'Townsfolk',
};
export function groupOf(inst: string): PolGroup {
  if (FEDERAL.has(inst)) return 'federal';
  if (POLITICAL.has(inst)) return 'politics';
  if (POLICE.has(inst)) return 'police';
  if (LEGAL.has(inst)) return 'legal';
  if (INSPECT.has(inst)) return 'fire';
  if (inst === 'street') return 'street';
  if (inst === 'showbiz') return 'showbiz';
  return 'civilian';
}
/** People who hold public trust and can be bought or refuse: cops, feds, prosecutors, judges, inspectors, politicians. */
export function isOfficial(p: Pick<PolPerson, 'inst'>): boolean {
  const g = groupOf(p.inst);
  return g === 'politics' || g === 'police' || g === 'federal' || g === 'legal' || g === 'fire';
}

/** Integrity from the world pack's attributes (higher = harder to buy). */
export function integrityOf(w: WorldPerson): number {
  const a = w.attributes;
  let v = a.morality * 0.55 + (100 - a.corruption) * 0.35 + (100 - a.greed) * 0.1;
  if (w.police?.faction === 'pad') v -= 18;
  if (w.police?.faction === 'reform') v += 10;
  if (w.legal) v = v * 0.5 + (100 - w.legal.reachable) * 0.5;
  if (w.fire?.signsForCash) v -= 15;
  if (FEDERAL.has(w.institution)) v = Math.max(v, 72) + 8;
  return clamp100(v);
}

/** Integrity for an engine character the world did not write (from traits). */
export function integrityFromTraits(traits: readonly Trait[], seed: number): number {
  let v = 50 + ((seed % 21) - 10);
  if (traits.includes('Honest')) v += 32;
  if (traits.includes('Pious')) v += 8;
  if (traits.includes('Greedy')) v -= 25;
  if (traits.includes('Gambler')) v -= 10;
  if (traits.includes('Ambitious')) v -= 5;
  return clamp100(v);
}

export function fromWorld(w: WorldPerson, year: number): PolPerson {
  const a = w.attributes;
  const party: Party | undefined = w.party === 'D' ? 'D' : w.party === 'R' ? 'R' : w.party === 'Ind' ? 'I' : undefined;
  const hist = w.careerHistory;
  const p: PolPerson = {
    id: w.id,
    first: w.name.first,
    last: w.name.last,
    sex: w.sex,
    born: w.birthYear,
    eth: w.gameEthnicity,
    inst: w.institution,
    ladder: w.ladder?.id ?? 'civilian',
    rung: w.ladder?.rung ?? 0,
    since: hist.length ? Math.min(year, hist[hist.length - 1].year) : year - 2,
    title: w.office,
    integrity: integrityOf(w),
    ambition: a.ambition,
    competence: a.competence,
    charisma: a.charisma,
    strength: w.electoralStrength ?? clamp100(a.charisma * 0.5 + a.leadership * 0.3 + 10),
    traits: engineTraits(w),
    alive: true,
    scandal: 0,
    pack: !w.tags?.includes('generated'),
    arrived: w.activeFrom && w.activeFrom > 1960 ? w.activeFrom : 0,
  };
  if (w.nickname) p.nick = w.nickname;
  if (party) p.party = party;
  if (w.dynastyId) p.dyn = w.dynastyId;
  if (w.showbiz) {
    p.fame = w.showbiz.fame;
    p.peak = w.showbiz.peakYear;
  }
  if (w.street) p.street = { pot: w.street.leadershipPotential, with: w.street.currentlyWith, craft: SPECIALTY_TO_GAME[w.street.specialty].craft };
  if (w.deathYear !== undefined && w.deathYear <= year) {
    p.alive = false;
    p.died = { year: w.deathYear, cause: w.deathCause ?? 'natural causes' };
  }
  return p;
}

/** Engine character -> world person (engine officials, the boss's children in politics). */
export function fromCharacter(c: Character, inst: string, ladder: string, rung: number, title: string, year: number): PolPerson {
  const h = hashSeed(c.id);
  const at = c.attributes;
  return {
    id: `pc_${c.id}`,
    first: c.firstName,
    last: c.lastName,
    ...(c.nickname ? { nick: c.nickname } : {}),
    sex: c.gender,
    born: c.birth.y,
    eth: c.ethnicity,
    inst, ladder, rung, since: year - 2, title,
    integrity: integrityFromTraits(c.traits, h),
    ambition: c.traits.includes('Ambitious') ? 75 : 50,
    competence: clamp100((at.business + at.diplomacy + at.intrigue) / 3 * 5),
    charisma: clamp100(at.diplomacy * 5 + (c.traits.includes('Charming') ? 20 : 0)),
    strength: clamp100(at.diplomacy * 2 + at.leadership * 1.5 + (c.traits.includes('Charming') ? 12 : 0) + 15),
    traits: c.traits.slice(),
    alive: c.alive,
    scandal: 0,
    charId: c.id,
    arrived: 0,
  };
}

function importance(p: PolPerson): number {
  if (!p.alive) return -1000;
  let v = 0;
  if (p.seat || p.charId) v += 2000;
  const g = groupOf(p.inst);
  if (g === 'politics') v += 300 + p.rung * 25;
  else if (g === 'legal') v += (p.inst === 'private_bar' || p.inst === 'bail' ? 60 : 220) + p.rung * 20;
  else if (g === 'federal') v += 240 + p.rung * 20;
  else if (g === 'police') v += 120 + p.rung * 35;
  else if (g === 'street') v += 160 + (p.street?.pot ?? 0);
  else if (g === 'showbiz') v += (p.fame ?? 0) * 2;
  else if (g === 'fire') v += 40 + p.rung * 20;
  else v += 20;
  if (p.dyn) v += 120;
  if (p.pack) v += 40;
  return v;
}

/** Puts a person into the right tier (full if room or important). */
export function admit(pol: PolState, p: PolPerson, full: boolean): void {
  if (full) pol.people[p.id] = p;
  else pol.reserve = [...pol.reserve, packRow(p)];
}

/** Initial population: everyone in the pack who is alive and active in 1960. */
export function seedPopulation(pol: PolState, year: number, keep: Set<string>): void {
  const all: PolPerson[] = [];
  for (const w of ALL_PEOPLE) {
    if (w.activeFrom && w.activeFrom > year) {
      pol.future.push(w.id);
      continue;
    }
    if (w.deathYear !== undefined && w.deathYear <= year) continue;
    all.push(fromWorld(w, year));
  }
  all.sort((a, b) => (keep.has(b.id) ? 1e6 : 0) + importance(b) - ((keep.has(a.id) ? 1e6 : 0) + importance(a)) || (a.id < b.id ? -1 : 1));
  const rows: string[] = [];
  all.forEach((p, i) => {
    if (i < FULL_TIER || keep.has(p.id)) pol.people[p.id] = p;
    else rows.push(packRow(p));
  });
  pol.reserve = rows;
}

/** A generated newcomer (deterministic from the game seed). */
export function generated(s: GameState, inst: string, tag: string, opts: { rung?: number; year?: number; party?: Party } = {}): PolPerson {
  const pol = s.pol!;
  const year = opts.year ?? s.date.y;
  const id = `wp${pol.nextGen++}`;
  const w = generatePerson({ institution: inst as InstitutionId, seed: `${s.seed}:${tag}:${id}`, year, id, ladderRung: opts.rung });
  const p = fromWorld(w, year);
  p.pack = false;
  p.arrived = year;
  if (opts.party) p.party = opts.party;
  return p;
}

/** Looks a person up in either tier (reserve rows are unpacked on the fly). */
export function getPerson(s: GameState, id: string): PolPerson | undefined {
  const pol = s.pol;
  if (!pol) return undefined;
  const p = pol.people[id];
  if (p) return p;
  const row = pol.reserve.find((r) => r.startsWith(`${id}|`));
  return row ? unpackRow(row) : undefined;
}

/** Brings a reserve person into the full tier (when he matters: a candidate, a holder, a recruit). */
export function promoteToFull(s: GameState, id: string): PolPerson | undefined {
  const pol = s.pol!;
  if (pol.people[id]) return pol.people[id];
  const idx = pol.reserve.findIndex((r) => r.startsWith(`${id}|`));
  if (idx < 0) return undefined;
  const p = unpackRow(pol.reserve[idx]);
  const w = PEOPLE_BY_ID[id];
  if (w) {
    const full = fromWorld(w, s.date.y);
    Object.assign(p, { traits: full.traits, ambition: full.ambition, competence: full.competence, charisma: full.charisma, nick: full.nick, fame: full.fame, peak: full.peak, street: full.street, pack: true });
  }
  pol.reserve = pol.reserve.filter((_, i) => i !== idx);
  pol.people[id] = p;
  return p;
}

export function age(s: GameState, p: PolPerson): number {
  return s.date.y - p.born;
}

/** Annual chance of dying at an age. */
export function deathOdds(a: number): number {
  return a < 40 ? 0.002 : a < 55 ? 0.008 : a < 65 ? 0.02 : a < 75 ? 0.045 : a < 85 ? 0.1 : 0.22;
}

const CAUSES_OLD = ['heart attack', 'a stroke', 'old age', 'cancer'];
const CAUSES_YOUNG = ['a car wreck on the Parkway', 'a heart attack', 'a boating accident', 'sudden illness'];

/** Gives the pack rung title, e.g. "Lieutenant, Wildwood Police Department". */
export function rungTitle(ladder: string, rung: number, inst: string): string {
  const l = LADDERS[ladder as LadderId];
  const t = l?.rungs[rung]?.title ?? 'Member';
  const instName = INST_SHORT[inst] ?? '';
  return instName ? `${t}, ${instName}` : t;
}
const INST_SHORT: Record<string, string> = {
  wildwood_pd: 'Wildwood PD', north_wildwood_pd: 'North Wildwood PD', crest_pd: 'Crest PD', atlantic_city_pd: 'Atlantic City PD', philadelphia_pd: 'Philadelphia PD',
  nj_state_police: 'NJ State Police', fbi_newark: 'FBI Newark', fbi_philadelphia: 'FBI Philadelphia', federal_other: 'Treasury', cmc_sheriff: 'Cape May Sheriff',
  cmc_prosecutor_detectives: 'County Detectives', cmc_prosecutor: 'Cape May Prosecutor\'s Office', private_bar: 'the bar', wildwood_fd: 'Wildwood FD', street: '',
};

/* ------------------------------------------------------------------ */
/* Careers (yearly)                                                    */
/* ------------------------------------------------------------------ */

export interface YearSummary {
  promotions: string[];
  retirements: string[];
  deaths: string[];
  scandals: string[];
  arrivals: number;
  rising: string[];
}

/** Elected rungs are reached by winning elections, not by promotion. */
function electedRung(ladder: string, rung: number): boolean {
  if (ladder === 'local_politics' || ladder === 'county_politics' || ladder === 'state_politics' || ladder === 'federal_politics' || ladder === 'ward_politics') return rung >= 2 || (ladder === 'county_politics' && rung >= 1) || (ladder === 'state_politics' && rung >= 1) || (ladder === 'federal_politics' && rung >= 1);
  return false;
}

/** People per rung per institution (vacancies gate promotions). */
function rungCounts(pol: PolState): Map<string, number> {
  const m = new Map<string, number>();
  for (const id in pol.people) {
    const p = pol.people[id];
    if (!p.alive || p.retired) continue;
    const k = `${p.inst}:${p.rung}`;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

/**
 * Once a year (first week of January): everybody ages; some are promoted
 * (if there is a vacancy above them), retire, fall into scandal or die
 * (through the one death function). Toughs rise or get taken by a crew;
 * entertainers rise toward their peak and fade after it. Then arrivals and
 * the tier balance.
 */
export function yearlyCareers(ctx: Ctx, onVacate: (seatKey: string, why: string) => void): YearSummary {
  const s = ctx.s;
  const pol = s.pol!;
  const year = s.date.y;
  const out: YearSummary = { promotions: [], retirements: [], deaths: [], scandals: [], arrivals: 0, rising: [] };
  const counts = rungCounts(pol);
  const dying: [string, string][] = [];
  const ids = Object.keys(pol.people).sort();
  for (const id of ids) {
    const p0 = pol.people[id];
    if (!p0.alive || p0.retired) continue;
    if (p0.charId) continue; // engine characters live and die in the main simulation
    const a = year - p0.born;
    if (rand(pol) < deathOdds(a)) {
      dying.push([id, a >= 65 ? pick(pol, CAUSES_OLD) : pick(pol, CAUSES_YOUNG)]);
      continue;
    }
    const lad = LADDERS[p0.ladder as LadderId];
    const r = lad?.rungs[p0.rung];
    // Retirement.
    if (r && r.retireAge > 0 && (a >= r.retireAge || (a >= r.retireAge - 5 && rand(pol) < r.retire))) {
      const p = mutP(s, id)!;
      p.retired = true;
      addLog(p, year, `Retired as ${p.title}`);
      out.retirements.push(`${p.first} ${p.last} (${p.title})`);
      pol.stats.retirements++;
      if (p.seat) onVacate(p.seat, `${p.first} ${p.last} retired`);
      continue;
    }
    if (!r && a > 72 && rand(pol) < 0.25 && !p0.seat) {
      const p = mutP(s, id)!;
      p.retired = true;
      pol.stats.retirements++;
      continue;
    }
    // Scandal.
    if (r && rand(pol) < r.scandal * (1.3 - p0.integrity / 100) * (pol.crackdown ? 1.5 : 1)) {
      const p = mutP(s, id)!;
      p.scandal = clamp100(p.scandal + 30 + randInt(pol, 0, 30));
      p.strength = clamp100(p.strength - 12);
      addLog(p, year, 'A scandal in the papers');
      out.scandals.push(`${p.first} ${p.last}`);
      pol.stats.scandals++;
      if (p.seat && p.scandal >= 70 && rand(pol) < 0.5) {
        pol.stats.resignations++;
        addLog(p, year, 'Resigned under a cloud');
        onVacate(p.seat, `${p.first} ${p.last} resigned in a scandal`);
      }
      continue;
    }
    // Scandals fade.
    if (p0.scandal > 0) mutP(s, id)!.scandal = Math.max(0, p0.scandal - 15);
    // Street toughs: rise, get taken by a crew.
    if (p0.street) {
      const pot = p0.street.pot;
      if (p0.rung < 3 && year - p0.since >= (lad?.rungs[p0.rung]?.minYears ?? 2) && rand(pol) < 0.08 + pot / 400) {
        const p = mutP(s, id)!;
        p.rung += 1;
        p.since = year;
        p.title = ['Kid on the corner', 'Associate', 'Made man', 'Crew chief'][p.rung] ?? p.title;
        addLog(p, year, `Rose to ${p.title.toLowerCase()}${p.street!.with !== 'none' && p.street!.with !== 'player' ? ` with ${p.street!.with}` : ''}`);
        if (pot >= 65) out.rising.push(`${p.first} ${p.last}`);
      }
      if (p0.street.with === 'none' && rand(pol) < 0.07) {
        const p = mutP(s, id)!;
        p.street!.with = pick(pol, ['manno', 'kessler', 'philly'] as const);
        addLog(p, year, `Went to work for ${p.street!.with === 'philly' ? 'Philadelphia' : p.street!.with === 'manno' ? 'the Mannos' : 'Kessler'}`);
      }
      continue;
    }
    // Entertainers rise toward their peak and fade after it.
    if (p0.fame !== undefined) {
      const p = mutP(s, id)!;
      const d = year < (p.peak ?? year) ? randInt(pol, 2, 8) : year === p.peak ? 0 : -randInt(pol, 2, 7);
      p.fame = clamp100((p.fame ?? 0) + d);
      if (d > 4 && (p.fame ?? 0) >= 60) out.rising.push(`${p.first} ${p.last}`);
      if ((p.fame ?? 0) < 8 && a > 45 && rand(pol) < 0.3) {
        p.retired = true;
        addLog(p, year, 'Left the business');
      }
      continue;
    }
    // Promotions (elected rungs are won at the polls).
    if (!lad || !r || p0.rung >= lad.rungs.length - 1 || electedRung(p0.ladder, p0.rung + 1)) continue;
    if (year - p0.since < r.minYears) continue;
    const next = lad.rungs[p0.rung + 1];
    const k = `${p0.inst}:${p0.rung + 1}`;
    if ((counts.get(k) ?? 0) >= Math.max(1, Math.min(next.slots, 6))) continue;
    const odds = r.promote * (0.5 + p0.competence / 100) * (0.7 + p0.ambition / 150);
    if (rand(pol) >= odds) continue;
    const p = mutP(s, id)!;
    counts.set(`${p.inst}:${p.rung}`, (counts.get(`${p.inst}:${p.rung}`) ?? 1) - 1);
    p.rung += 1;
    p.since = year;
    p.title = rungTitle(p.ladder, p.rung, p.inst);
    counts.set(k, (counts.get(k) ?? 0) + 1);
    addLog(p, year, `Promoted: ${p.title}`);
    out.promotions.push(`${p.first} ${p.last} (${p.title})`);
    pol.stats.promotions++;
  }

  // The compact tier: age, retire and die; a few promotions.
  const keepRows: string[] = [];
  for (const row of pol.reserve) {
    const p = unpackRow(row);
    const a = year - p.born;
    if (rand(pol) < deathOdds(a)) {
      dying.push([p.id, a >= 65 ? 'old age' : 'sudden illness']);
      keepRows.push(row);
      continue;
    }
    const lad = LADDERS[p.ladder as LadderId];
    const r = lad?.rungs[p.rung];
    if ((r && r.retireAge > 0 && a >= r.retireAge) || a >= 80) continue; // retires out of the world
    if (lad && r && p.rung < lad.rungs.length - 1 && !electedRung(p.ladder, p.rung + 1) && year - p.since >= r.minYears && rand(pol) < r.promote * 0.6) {
      p.rung += 1;
      p.since = year;
      p.title = rungTitle(p.ladder, p.rung, p.inst);
      pol.stats.promotions++;
      keepRows.push(packRow(p));
      continue;
    }
    keepRows.push(row);
  }
  pol.reserve = keepRows;

  // Deaths go through the one death function.
  for (const [id, cause] of dying) {
    const p = getPerson(s, id);
    if (p && (p.seat || pol.people[id])) out.deaths.push(`${p.first} ${p.last}`);
    killCharacter(ctx, id, cause);
  }

  out.arrivals = arrivals(s, year);
  balanceTiers(s);
  return out;
}

/** The death handler: the one death function calls this for people who are not engine characters. */
export function worldDeath(s: GameState, id: string, cause: string): PolPerson | undefined {
  const pol = s.pol;
  if (!pol) return undefined;
  if (pol.people[id]) {
    const p = mutP(s, id)!;
    if (!p.alive) return undefined;
    p.alive = false;
    p.died = { year: s.date.y, cause };
    addLog(p, s.date.y, `Died: ${cause}`);
    pol.stats.deaths++;
    return p;
  }
  const idx = pol.reserve.findIndex((r) => r.startsWith(`${id}|`));
  if (idx < 0) return undefined;
  const p = unpackRow(pol.reserve[idx]);
  pol.reserve = pol.reserve.filter((_, i) => i !== idx);
  pol.stats.deaths++;
  p.alive = false;
  p.died = { year: s.date.y, cause };
  return p;
}

/** Yearly arrivals: heirs from the pack who come of age, and newcomers by institution. */
function arrivals(s: GameState, year: number): number {
  const pol = s.pol!;
  let n = 0;
  const due = pol.future.filter((id) => (PEOPLE_BY_ID[id]?.activeFrom ?? 0) <= year);
  if (due.length) {
    pol.future = pol.future.filter((id) => !due.includes(id));
    for (const id of due) {
      const w = PEOPLE_BY_ID[id];
      if (!w || (w.deathYear !== undefined && w.deathYear <= year)) continue;
      const p = fromWorld(w, year);
      p.arrived = year;
      admit(pol, p, true);
      n++;
    }
  }
  for (const [inst, k] of Object.entries(YEARLY_INFLOW)) {
    for (let i = 0; i < (k ?? 0); i++) {
      const p = generated(s, inst, `arr${year}`, { rung: 0, year });
      admit(pol, p, inst === 'street' && i < 3);
      n++;
    }
  }
  pol.stats.arrivals += n;
  return n;
}

/** Keeps about FULL_TIER people fully simulated: promotes from the reserve, demotes the least important. */
export function balanceTiers(s: GameState): void {
  const pol = s.pol!;
  const ids = Object.keys(pol.people);
  // Prune the long dead who no longer matter.
  for (const id of ids) {
    const p = pol.people[id];
    if (!p.alive && !p.charId && !p.seat && (p.died?.year ?? 0) < s.date.y - 3 && !pol.ctl[id]) delete pol.people[id];
  }
  const living = Object.values(pol.people).filter((p) => p.alive && !p.retired);
  if (living.length > FULL_TIER + 30) {
    const drop = living
      .filter((p) => !p.seat && !p.charId && !pol.ctl[p.id] && !pol.elections.some((e) => e.candidates.some((c) => c.id === p.id)))
      .sort((a, b) => importance(a) - importance(b) || (a.id < b.id ? -1 : 1))
      .slice(0, living.length - FULL_TIER);
    const rows: string[] = [];
    for (const p of drop) {
      rows.push(packRow(p));
      delete pol.people[p.id];
    }
    pol.reserve = [...pol.reserve, ...rows];
  } else if (living.length < FULL_TIER && pol.reserve.length) {
    const need = FULL_TIER - living.length;
    const ranked = pol.reserve.map((r) => unpackRow(r)).sort((a, b) => importance(b) - importance(a) || (a.id < b.id ? -1 : 1)).slice(0, need);
    for (const p of ranked) promoteToFull(s, p.id);
  }
  // Retired people leave the full tier.
  for (const p of Object.values(pol.people)) {
    if (p.alive && p.retired && !p.seat && !p.charId && !pol.ctl[p.id]) {
      delete pol.people[p.id];
    }
  }
}

/** Head count (both tiers, living). */
export function population(s: GameState): { full: number; compact: number; total: number } {
  const pol = s.pol;
  if (!pol) return { full: 0, compact: 0, total: 0 };
  const full = Object.values(pol.people).filter((p) => p.alive && !p.retired).length;
  return { full, compact: pol.reserve.length, total: full + pol.reserve.length };
}

/* ------------------------------------------------------------------ */
/* Recruiting a street tough into the crew                             */
/* ------------------------------------------------------------------ */

export function toughCost(p: PolPerson): number {
  return Math.round((800 + (p.street?.pot ?? 40) * 25 + p.rung * 600) / 50) * 50;
}

/** Turns a world person into an engine character (no main-stream dice). */
export function materialize(s: GameState, p: PolPerson, opts: { faction: Character['faction']; rank: Character['rank']; office?: string }): Character {
  const pol = s.pol!;
  const w = PEOPLE_BY_ID[p.id];
  const attrs: Attributes = w
    ? { leadership: sk(w.attributes.leadership), business: sk(w.attributes.business), diplomacy: sk(w.attributes.diplomacy), intrigue: sk(w.attributes.intrigue), force: sk(w.attributes.force), discipline: sk(w.attributes.discipline) }
    : { leadership: randInt(pol, 3, 14), business: randInt(pol, 3, 14), diplomacy: randInt(pol, 3, 14), intrigue: randInt(pol, 3, 14), force: randInt(pol, 3, 14), discipline: randInt(pol, 3, 14) };
  const h = hashSeed(p.id);
  const c: Character = {
    id: `c${s.nextId++}`,
    firstName: p.first,
    lastName: p.last,
    gender: p.sex,
    ethnicity: p.eth,
    birth: { y: p.born, m: 1 + (h % 12), d: 1 + ((h >> 4) % 28) },
    health: Math.max(40, 100 - Math.max(0, s.date.y - p.born - 35)),
    conditions: [],
    attributes: attrs,
    traits: p.traits.slice(0, 3),
    ambition: w?.street?.arc ?? 'Make something of himself',
    rank: opts.rank,
    faction: opts.faction,
    wealth: 500,
    dynasty: false,
    childrenIds: [],
    alive: true,
  };
  if (p.nick) c.nickname = p.nick;
  if (opts.office) c.office = opts.office;
  if (p.street) {
    c.craft = p.street.craft as Craft;
    c.record = w?.street?.record ?? 0;
  }
  s.characters[c.id] = c;
  return c;
}
function sk(v: number): number {
  return Math.max(1, Math.min(20, Math.round(v / 5)));
}

/** The age of an engine character in years (for kids in politics). */
export function charAge(s: GameState, c: Character): number {
  return ageOn(c.birth, s.date);
}

