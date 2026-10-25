import { PEOPLE_BY_ID } from '../worldpack';
import type { Ctx } from './ledger';
import { addOpinion } from './relations';
import { hashSeed, rand } from './rng';
import { JURIS_NAME, OFFICE_BY_ID, OFFICE_DEFS, PACK_SEAT, type OfficeDef } from './polData';
import { fromCharacter, fromWorld, generated, getPerson, groupOf, integrityFromTraits, isOfficial, promoteToFull, seedPopulation } from './polPeople';
import { addLog, emptyStats, mIdx, mutP, parseSeat, seatKey, type Ctl, type Party, type PolPerson, type PolState } from './polState';
import type { Character, GameState } from './types';

/**
 * Government: the offices, who holds each seat, terms and the calendar,
 * appointments (the Governor appoints the prosecutor and judges, the mayor
 * the chief), mayors chosen by their commissions, and vacancies (special
 * elections for elected seats, appointments for the rest).
 */

export function officeActive(s: GameState, def: OfficeDef): boolean {
  return !def.needsLaw || s.pol?.laws[def.needsLaw] !== undefined;
}

export function holder(s: GameState, office: string, seat = 0): PolPerson | undefined {
  const id = s.pol?.offices[office]?.holders[seat];
  return id ? s.pol!.people[id] : undefined;
}

export function holders(s: GameState, office: string): (PolPerson | undefined)[] {
  const o = s.pol?.offices[office];
  return o ? o.holders.map((id) => (id ? s.pol!.people[id] : undefined)) : [];
}

/** The display name of a world person, preferring the engine character's current name. */
export function nameOf(s: GameState, p: PolPerson | undefined): string {
  if (!p) return 'Vacant';
  const c = p.charId ? s.characters[p.charId] : undefined;
  const first = c?.firstName ?? p.first;
  const last = c?.lastName ?? p.last;
  const nick = c?.nickname ?? p.nick;
  return nick ? `${first} "${nick}" ${last}` : `${first} ${last}`;
}

/** Which offices a person holds (a mayor also holds his commission seat). */
export function officesOf(s: GameState, personId: string): { office: OfficeDef; seat: number }[] {
  const out: { office: OfficeDef; seat: number }[] = [];
  const pol = s.pol;
  if (!pol) return out;
  for (const def of OFFICE_DEFS) {
    const o = pol.offices[def.id];
    o?.holders.forEach((h, i) => {
      if (h === personId) out.push({ office: def, seat: i });
    });
  }
  return out;
}

/** Default puppet sheet for an official the player has not worked on. */
export function defaultCtl(s: GameState, p: PolPerson): Ctl {
  const yrs = Math.max(0, s.date.y - p.since);
  return {
    personal: 5,
    financial: 0,
    independence: Math.max(20, Math.min(90, 35 + p.rung * 6 + yrs * 2 + (p.integrity - 50) / 3)),
    legitimacy: Math.max(10, Math.min(95, 60 - p.scandal / 2 + (p.strength - 50) / 4)),
    exposure: Math.round(p.scandal / 2),
    resentment: 0,
    since: s.week,
  };
}

/** The puppet sheet (created on first touch). */
export function ctlOf(s: GameState, id: string): Ctl {
  const pol = s.pol!;
  if (!pol.ctl[id]) {
    const p = pol.people[id] ?? promoteToFull(s, id);
    pol.ctl[id] = p ? defaultCtl(s, p) : { personal: 0, financial: 0, independence: 60, legitimacy: 50, exposure: 0, resentment: 0, since: s.week };
  }
  return pol.ctl[id];
}

/** Read-only view (no state change). */
export function peekCtl(s: GameState, id: string): Ctl | undefined {
  const pol = s.pol;
  if (!pol) return undefined;
  if (pol.ctl[id]) return pol.ctl[id];
  const p = pol.people[id];
  return p ? defaultCtl(s, p) : undefined;
}

/* ------------------------------------------------------------------ */
/* Setup                                                               */
/* ------------------------------------------------------------------ */

const ENGINE_OFFICIALS: Record<string, { inst: string; ladder: string; rung: number; title: string; office?: string }> = {
  'City councilman': { inst: 'wildwood_city', ladder: 'local_politics', rung: 2, title: 'Wildwood City Commissioner (Revenue and Finance)', office: 'ww_commission' },
  'State assemblyman': { inst: 'nj_legislature', ladder: 'state_politics', rung: 1, title: 'Assemblyman, Cape May County', office: 'nj_assembly_cm' },
  'County judge': { inst: 'county_court', ladder: 'bench_nj', rung: 2, title: 'Cape May County Court Judge', office: 'cmc_judge' },
  'Chief of Police': { inst: 'wildwood_pd', ladder: 'municipal_police', rung: 5, title: 'Wildwood Chief of Police', office: 'ww_chief' },
  'Police sergeant': { inst: 'wildwood_pd', ladder: 'municipal_police', rung: 2, title: 'Sergeant, Wildwood PD' },
  'IRS agent': { inst: 'federal_other', ladder: 'fbi', rung: 1, title: 'Special Agent, IRS Intelligence' },
};

export function newPolState(s: GameState): PolState {
  return {
    rng: hashSeed(`${s.seed}:politics`),
    people: {}, reserve: [], future: [], offices: {}, ctl: {}, elections: [], results: [], night: [], bills: [], laws: {}, boons: {}, kids: {}, queue: [],
    lastMonth: mIdx(s.date.y, s.date.m), lastYear: s.date.y, nextGen: 1, stats: emptyStats(),
  };
}

/** Builds the government of summer 1960 on top of the population. */
export function initGovernment(s: GameState): void {
  const pol = (s.pol = newPolState(s));
  const year = s.date.y;
  const keep = new Set<string>();
  for (const w of Object.values(PEOPLE_BY_ID)) if (w.seat && PACK_SEAT[w.seat] && !(w.deathYear !== undefined && w.deathYear <= year) && !(w.activeFrom && w.activeFrom > year)) keep.add(w.id);
  seedPopulation(pol, year, keep);
  for (const def of OFFICE_DEFS) {
    pol.offices[def.id] = {
      holders: Array(def.seats).fill(''),
      next: def.firstYear.map((y) => (y ? mIdx(y, def.month) : 0)),
      took: Array(def.seats).fill(0),
    };
  }
  // The engine's own officials take their seats first.
  for (const c of Object.values(s.characters)) {
    if (!c.alive || !c.office) continue;
    const e = ENGINE_OFFICIALS[c.office];
    if (!e) continue;
    const p = fromCharacter(c, e.inst, e.ladder, e.rung, e.title, year);
    if (e.inst === 'wildwood_city' || e.inst === 'nj_legislature') p.party = e.inst === 'nj_legislature' ? 'R' : undefined;
    pol.people[p.id] = p;
    if (e.office) put(s, p.id, e.office, firstFree(pol, e.office), year - 2);
  }
  const law = s.rivals.find((r) => r.kind === 'law');
  const pros = law ? s.characters[law.leaderId] : undefined;
  if (pros?.alive) {
    const p = fromCharacter(pros, 'cmc_prosecutor', 'prosecutor_office', 3, 'Cape May County Prosecutor', year);
    p.party = 'R';
    p.integrity = Math.max(p.integrity, 62);
    pol.people[p.id] = p;
    put(s, p.id, 'cmc_prosecutor', 0, 1957);
  }
  // The pack's 1960 office holders.
  const packHolders = Object.values(PEOPLE_BY_ID).filter((w) => keep.has(w.id)).sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const w of packHolders) {
    const office = PACK_SEAT[w.seat!];
    const def = OFFICE_BY_ID[office];
    if (def.selection === 'chosen') continue;
    let seat = firstFree(pol, office);
    if (w.seat === 'us_senate_nj_b' && !pol.offices[office].holders[1]) seat = 1;
    if (seat < 0) continue;
    if (!pol.people[w.id]) pol.people[w.id] = fromWorld(w, year);
    put(s, w.id, office, seat, pol.people[w.id].since);
  }
  // Mayors chosen by their commissions sit on them too.
  for (const w of packHolders) {
    const office = PACK_SEAT[w.seat!];
    const def = OFFICE_BY_ID[office];
    if (def.selection !== 'chosen' || !def.by) continue;
    if (!pol.people[w.id]) pol.people[w.id] = fromWorld(w, year);
    let seat = pol.offices[def.by].holders.indexOf(w.id);
    if (seat < 0) seat = firstFree(pol, def.by);
    if (seat < 0) seat = def.seats - 1;
    put(s, w.id, def.by, seat, pol.people[w.id].since);
    pol.offices[office].holders[0] = w.id;
    pol.offices[office].took[0] = pol.people[w.id].since;
    const p = mutP(s, w.id)!;
    p.title = def.title;
    p.rung = def.rung;
  }
  // The FBI's man on the shore: the senior pack agent.
  const fbi = Object.values(pol.people).filter((p) => p.inst === 'fbi_newark' && p.alive).sort((a, b) => b.rung - a.rung || (a.id < b.id ? -1 : 1))[0];
  if (fbi && !fbi.seat) put(s, fbi.id, 'fbi_sra', 0, fbi.since);
  // Fill the rest.
  for (const def of OFFICE_DEFS) {
    if (!officeActive(s, def)) continue;
    const o = pol.offices[def.id];
    for (let i = 0; i < def.seats; i++) {
      if (o.holders[i]) continue;
      if (def.selection === 'chosen') {
        chooseFromBody(s, def);
        continue;
      }
      const p = generated(s, def.inst, `seat:${def.id}:${i}`, { rung: Math.max(0, def.rung - 1), year, party: def.partisan ? partyFor(pol, def) : undefined });
      p.born = Math.min(p.born, year - 38);
      pol.people[p.id] = p;
      put(s, p.id, def.id, i, year - 1 - (i % 3));
    }
  }
  // Puppet sheets for the officials the pack ties to a crew.
  for (const p of Object.values(pol.people)) {
    if (!isOfficial(p)) continue;
    const w = PEOPLE_BY_ID[p.id];
    const tie = w?.ties.find((t) => t.kind === 'crime' || t.kind === 'police');
    if (!tie || tie.strength < 30) continue;
    const c = ctlOf(s, p.id);
    if (tie.target === 'player' || tie.target === 'game:player') {
      c.financial = Math.min(100, tie.strength);
      c.personal = 30;
    } else if (['manno', 'feldstein', 'kessler', 'philly'].includes(tie.target)) c.owner = tie.target as Ctl['owner'];
  }
}

function partyFor(pol: PolState, def: OfficeDef): Party {
  return rand(pol) < 0.5 + def.lean * 0.45 ? 'D' : 'R';
}

function firstFree(pol: PolState, office: string): number {
  return pol.offices[office]?.holders.indexOf('') ?? -1;
}

/** Low-level: put a person into a seat (no vacancy handling for whoever held it). */
function put(s: GameState, id: string, office: string, seat: number, took: number): void {
  const pol = s.pol!;
  const def = OFFICE_BY_ID[office];
  const o = pol.offices[office];
  if (!def || !o || seat < 0) return;
  o.holders[seat] = id;
  o.took[seat] = took;
  const p = mutP(s, id);
  if (!p) return;
  p.seat = seatKey(office, seat);
  p.title = def.title;
  if (def.inst !== p.inst || def.rung > p.rung || groupOf(p.inst) === 'politics') {
    p.inst = def.inst;
    p.ladder = def.ladder;
    p.rung = def.rung;
  }
  p.retired = false;
}

/* ------------------------------------------------------------------ */
/* Taking and leaving office                                           */
/* ------------------------------------------------------------------ */

/**
 * Seats a person (after an election or an appointment). Vacates his old seat
 * (an assemblyman elected senator leaves the Assembly), resets his term count
 * on a new office and updates the engine character's office label.
 */
export function assignSeat(s: GameState, id: string, office: string, seat: number, how: string): void {
  const pol = s.pol!;
  const def = OFFICE_BY_ID[office];
  const p0 = pol.people[id] ?? promoteToFull(s, id);
  if (!def || !p0) return;
  const prev = parseSeat(p0.seat);
  const same = prev?.office === office && prev.seat === seat;
  if (p0.seat && !same) {
    const was = OFFICE_BY_ID[prev!.office];
    leaveSeat(s, p0.seat);
    if (was) vacate(s, seatKey(was.id, prev!.seat), `${p0.first} ${p0.last} moved up`, true);
  }
  const old = pol.offices[office].holders[seat];
  if (old && old !== id) leaveSeat(s, seatKey(office, seat));
  put(s, id, office, seat, s.date.y);
  const p = mutP(s, id)!;
  p.terms = same ? (p.terms ?? 1) + 1 : 1;
  p.since = s.date.y;
  addLog(p, s.date.y, `${how}: ${def.title}`);
  if (p.charId) {
    const c = s.characters[p.charId];
    if (c && c.alive && !c.dynasty) c.office = officeLabelFor(office) ?? c.office;
  }
  // A new appointer may clean house among the people who serve at his pleasure.
  for (const d of OFFICE_DEFS) {
    if (d.by !== office || d.termYears !== 0 || d.selection !== 'appointed') continue;
    const o = pol.offices[d.id];
    if (o.holders[0] && rand(pol) < 0.35) o.next[0] = mIdx(s.date.y, s.date.m) + 2;
  }
}

/** Engine office strings (bribes use them). */
function officeLabelFor(office: string): string | undefined {
  return ({ ww_commission: 'City councilman', nj_assembly_cm: 'State assemblyman', cmc_judge: 'County judge', ww_chief: 'Chief of Police' } as Record<string, string>)[office];
}

/** Clears a seat without scheduling anything (the caller does). */
function leaveSeat(s: GameState, key: string): void {
  const pol = s.pol!;
  const k = parseSeat(key);
  if (!k) return;
  const o = pol.offices[k.office];
  const id = o?.holders[k.seat];
  if (!id) return;
  o.holders[k.seat] = '';
  // A mayor chosen from this body loses the mayoralty too.
  for (const d of OFFICE_DEFS) if (d.selection === 'chosen' && d.by === k.office && pol.offices[d.id].holders[0] === id) pol.offices[d.id].holders[0] = '';
  const p = pol.people[id];
  if (p && p.seat === key) {
    const m = mutP(s, id)!;
    m.seat = undefined;
    if (m.charId) {
      const c = s.characters[m.charId];
      if (c?.office && !c.office.startsWith('Former')) c.office = `Former ${c.office.toLowerCase()}`;
    }
  }
}

/**
 * A seat falls empty (death, resignation, a move up). Elected seats get a
 * special election in three months (unless the regular one is near);
 * appointed seats are filled by the appointer next month.
 */
export function vacate(s: GameState, key: string, why: string, alreadyLeft = false): void {
  const pol = s.pol;
  const k = parseSeat(key);
  if (!pol || !k) return;
  const def = OFFICE_BY_ID[k.office];
  if (!def) return;
  if (!alreadyLeft) leaveSeat(s, key);
  const o = pol.offices[k.office];
  const now = mIdx(s.date.y, s.date.m);
  if (def.selection === 'elected') {
    const regular = o.next[k.seat];
    if (!regular || regular - now > 6) {
      const when = now + 3;
      if (!pol.elections.some((e) => e.office === def.id && e.seats.includes(k.seat))) {
        pol.elections.push({ id: `el${s.week}_${def.id}_${k.seat}`, office: def.id, seats: [k.seat], when, special: true, candidates: [] });
        pol.stats.specials++;
      }
    }
  } else if (def.selection === 'appointed' || def.selection === 'life') {
    o.next[k.seat] = now + 1;
  }
  s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${why}: the ${def.title} seat is vacant.`, kind: 'misc' });
}

/* ------------------------------------------------------------------ */
/* Appointments and mayors                                             */
/* ------------------------------------------------------------------ */

/** The appointer's choice: your man if you asked and own the appointer; otherwise the best of the pool. */
export function pickAppointee(s: GameState, def: OfficeDef): PolPerson {
  const pol = s.pol!;
  const appointer = def.by ? holder(s, def.by) : undefined;
  const wish = pol.boons[`appoint:${def.id}`];
  if (wish && wish.until >= s.week) {
    const w = pol.people[wish.label];
    if (w?.alive && !w.seat) {
      delete pol.boons[`appoint:${def.id}`];
      return w;
    }
  }
  const pool = Object.values(pol.people).filter((p) => p.alive && !p.retired && !p.seat && !p.charId && def.pool.includes(p.inst) && s.date.y - p.born >= 32 && s.date.y - p.born <= 68 && p.rung >= Math.max(0, def.rung - 3));
  const score = (p: PolPerson) => p.competence + p.rung * 12 + (appointer?.party && p.party === appointer.party ? 15 : 0) + (p.dyn ? 8 : 0) + rand(pol) * 10;
  const best = pool.map((p) => ({ p, v: score(p) })).sort((a, b) => b.v - a.v || (a.p.id < b.p.id ? -1 : 1))[0]?.p;
  if (best) return best;
  const g = generated(s, def.inst, `appt:${def.id}`, { rung: Math.max(0, def.rung - 1), party: appointer?.party });
  g.born = Math.min(g.born, s.date.y - 40);
  pol.people[g.id] = g;
  return g;
}

/** The commission chooses its mayor: your man if you own a majority, else the strongest. */
export function chooseFromBody(s: GameState, def: OfficeDef): void {
  const pol = s.pol!;
  if (!def.by) return;
  const body = pol.offices[def.by].holders.map((id) => pol.people[id]).filter((p): p is PolPerson => !!p && p.alive);
  if (!body.length) return;
  const owned = body.filter((p) => pol.ctl[p.id] && ctlScore(s, p.id) >= 60);
  const wish = pol.boons[`appoint:${def.id}`];
  let pickP: PolPerson | undefined;
  if (wish && owned.length * 2 > body.length) pickP = body.find((p) => p.id === wish.label);
  if (!pickP && owned.length * 2 > body.length) pickP = owned.sort((a, b) => ctlScore(s, b.id) - ctlScore(s, a.id))[0];
  if (!pickP) pickP = body.slice().sort((a, b) => b.strength - a.strength || (a.id < b.id ? -1 : 1))[0];
  const o = pol.offices[def.id];
  o.holders[0] = pickP.id;
  o.took[0] = s.date.y;
  const p = mutP(s, pickP.id)!;
  p.title = def.title;
  addLog(p, s.date.y, `Chosen ${def.short} by the commission`);
}

function ctlScore(s: GameState, id: string): number {
  const c = s.pol!.ctl[id];
  if (!c) return 0;
  const influence = (c.personal + c.financial) / 2;
  return influence * 0.55 + (100 - c.independence) * 0.3 + (100 - c.resentment) * 0.15 - c.exposure * 0.25;
}

/**
 * Monthly: appointments that come due (term ends, vacancies), mayors to
 * choose, offices created by a law, and the County Prosecutor kept in step
 * with the engine's Prosecutor (the 'law' rival).
 */
export function monthlyGov(ctx: Ctx): string[] {
  const s = ctx.s;
  const pol = s.pol!;
  const now = mIdx(s.date.y, s.date.m);
  const news: string[] = [];
  for (const def of OFFICE_DEFS) {
    if (!officeActive(s, def)) continue;
    const o = pol.offices[def.id];
    if (def.selection === 'chosen') {
      if (!o.holders[0] || !pol.people[o.holders[0]]?.alive) chooseFromBody(s, def);
      continue;
    }
    if (def.selection !== 'appointed' && def.selection !== 'life') continue;
    for (let i = 0; i < def.seats; i++) {
      const due = o.next[i] && o.next[i] <= now;
      const vacant = !o.holders[i];
      if (!due && !vacant) continue;
      const inc = o.holders[i] ? pol.people[o.holders[i]] : undefined;
      const appointer = def.by ? holder(s, def.by) : undefined;
      const keepInc = inc?.alive && !vacant && s.date.y - inc.born < 70 && inc.scandal < 50 && (!appointer?.party || !inc.party || inc.party === appointer.party || rand(pol) < 0.4) && !pol.boons[`appoint:${def.id}`];
      if (keepInc && inc) {
        const p = mutP(s, inc.id)!;
        p.terms = (p.terms ?? 1) + 1;
        addLog(p, s.date.y, `Reappointed ${def.short}`);
      } else {
        const pick = pickAppointee(s, def);
        if (inc && inc.id !== pick.id) leaveSeat(s, seatKey(def.id, i));
        assignSeat(s, pick.id, def.id, i, `Appointed by ${appointer ? nameOf(s, appointer) : 'Washington'}`);
        news.push(`${nameOf(s, pick)} named ${def.title}.`);
        if (def.id === 'cmc_prosecutor') syncProsecutor(ctx, true);
      }
      o.next[i] = def.termYears ? now + def.termYears * 12 : 0;
    }
  }
  syncProsecutor(ctx, false);
  return news;
}

/**
 * The County Prosecutor is also the engine's 'law' rival leader. If the
 * engine replaced him (he died), the new man takes the seat; if politics
 * appointed a new one, he becomes the rival's leader.
 */
export function syncProsecutor(ctx: Ctx, appointed: boolean): void {
  const s = ctx.s;
  const pol = s.pol!;
  const law = s.rivals.find((r) => r.kind === 'law');
  if (!law) return;
  const leader = s.characters[law.leaderId];
  const seatHolder = holder(s, 'cmc_prosecutor');
  if (appointed && seatHolder && seatHolder.charId !== law.leaderId) {
    const c = materializeOfficial(s, seatHolder, 'County Prosecutor');
    if (leader?.alive) {
      leader.faction = 'none';
      leader.office = 'Former County Prosecutor';
      const lp = pol.people[`pc_${leader.id}`];
      if (lp) mutP(s, lp.id)!.seat = undefined;
    }
    law.leaderId = c.id;
    const ci = pol.ctl[seatHolder.id] ? ctlScore(s, seatHolder.id) : 0;
    addOpinion(s, c.id, s.playerId, ci >= 60 ? 'Owes his appointment to your friends' : 'A headline waiting to happen', ci >= 60 ? 20 : -15, 0);
    ctx.log.push(`${c.firstName} ${c.lastName} is the new County Prosecutor.`);
    return;
  }
  if (leader?.alive && (!seatHolder || seatHolder.charId !== leader.id)) {
    let p = pol.people[`pc_${leader.id}`];
    if (!p) {
      p = fromCharacter(leader, 'cmc_prosecutor', 'prosecutor_office', 3, 'Cape May County Prosecutor', s.date.y);
      p.integrity = Math.max(p.integrity, 55);
      pol.people[p.id] = p;
    }
    if (seatHolder && seatHolder.id !== p.id) leaveSeat(s, seatKey('cmc_prosecutor', 0));
    put(s, p.id, 'cmc_prosecutor', 0, s.date.y);
  }
}

/** Gives a world person an engine body (an appointed prosecutor, a recruited tough). */
export function materializeOfficial(s: GameState, p: PolPerson, office: string): Character {
  const h = hashSeed(p.id);
  const c: Character = {
    id: `c${s.nextId++}`,
    firstName: p.first,
    lastName: p.last,
    gender: p.sex,
    ethnicity: p.eth,
    birth: { y: p.born, m: 1 + (h % 12), d: 1 + ((h >> 4) % 28) },
    health: 90,
    conditions: [],
    attributes: { leadership: 10, business: 8, diplomacy: 11, intrigue: 12, force: 5, discipline: 12 },
    traits: p.traits.length ? p.traits.slice(0, 3) : ['Ambitious'],
    ambition: 'A headline, then a bigger office',
    rank: 'civilian',
    faction: 'law',
    wealth: 4000,
    dynasty: false,
    childrenIds: [],
    alive: true,
    office,
  };
  s.characters[c.id] = c;
  const m = mutP(s, p.id)!;
  m.charId = c.id;
  return c;
}

/** "Wildwood" / "Cape May County" ... */
export function jurisName(def: OfficeDef): string {
  return JURIS_NAME[def.juris];
}

/** Integrity of an engine official without a world record (fallback). */
export function engineIntegrity(c: Character): number {
  return integrityFromTraits(c.traits, hashSeed(c.id));
}

export { getPerson };
