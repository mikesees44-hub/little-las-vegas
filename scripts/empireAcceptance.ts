import { newBusiness } from '../src/engine/business';
import { dateOfWeek, toDays } from '../src/engine/calendar';
import { createVenue, empireWeek, runCmd, startProject, venueBusiness, venueByKey } from '../src/engine/empire';
import { roomCount, roomsByType, venueBuilding } from '../src/engine/empireBuild';
import { CONCEPTS } from '../src/engine/empireData';
import type { ConceptId, Venue } from '../src/engine/empireState';
import { ensureEcon } from '../src/engine/econState';
import { initEcon } from '../src/engine/econ';
import { money, newCtx } from '../src/engine/ledger';
import { newGame } from '../src/engine/newGame';
import type { GameState } from '../src/engine/types';

/**
 * Module 17's acceptance run, adapted: a fictional Wildwood property bought
 * in 1965 and developed three ways, each simulated five years on the real
 * operating engine (the same code the game runs each week), with the
 * statement posted to a real ledger. Used by tests/empire.test.ts and by
 * `npx tsx scripts/empireAcceptance.ts` for the report.
 */

export type Archetype = 'A' | 'B' | 'C';

export interface Outcome {
  archetype: Archetype;
  name: string;
  concept: ConceptId;
  rooms: number;
  roomMix: Record<string, number>;
  depts: string[];
  staff: number;
  peakStaff: number;
  maxOcc: number;
  minCondition: number;
  /** Condition lost to wear over the five years (before repairs put it back). */
  decay: number;
  years: { year: string; rev: number; opex: number; noi: number; capex: number; occ: number; sat: number; covers: number }[];
  projects: string[];
  managerProjects: number;
  tp: { item: string; used: number; onHand: number; short: number };
  sheets: { item: string; units: number; wear: number };
  towels: { item: string; units: number; wear: number };
  condition: number[];
  reputation: number;
  history: number;
  visuals: number;
  rivals: number;
  ledgerOk: boolean;
  treasuryDelta: number;
  state: GameState;
  venue: Venue;
}

function weekOf(y: number, m: number, d: number): number {
  const target = toDays({ y, m, d });
  let w = 0;
  while (toDays(dateOfWeek(w)) < target) w++;
  return w;
}

/** A game set at May 1965 with the town's lots laid out. */
export function setup1965(seed = 'acceptance'): GameState {
  const s = newGame(seed);
  s.week = weekOf(1965, 5, 1);
  s.date = dateOfWeek(s.week);
  initEcon(s);
  s.money = 400000;
  return s;
}

/** One week of the property's life: the business's takings, the statement, the projects, the managers. */
export function weekOfVenue(s: GameState): { ok: boolean } {
  const ctx = newCtx(s);
  const before = s.money;
  for (const b of s.businesses) {
    if (b.owner !== 'player') continue;
    const r = venueBusiness(ctx, b);
    if (r && r.amt) money(ctx, r.amt, r.label, 'business');
  }
  empireWeek(ctx);
  const sum = ctx.lines.filter((l) => l.stat === 'money').reduce((a, l) => a + l.amount, 0);
  s.week++;
  s.date = dateOfWeek(s.week);
  return { ok: Math.abs(s.money - before - sum) < 1e-6 };
}

export function develop(arch: Archetype, seed = 'acceptance'): Outcome {
  const s = setup1965(seed);
  const e = ensureEcon(s);
  // The fictional property: 4600 Ocean Avenue, Wildwood Crest.
  const lot = e.lots.find((l) => l.zone === 'crest' && l.status === 'sale' && !l.use) ?? e.lots.find((l) => l.zone === 'crest')!;
  lot.address = '4600 Ocean Ave';
  lot.status = 'owned';
  lot.owner = 'player';
  lot.use = 'motel';
  lot.stage = 'open';
  lot.builtYear = 1958;
  lot.condition = 78;
  (lot.history ??= []).push({ year: 1965, week: s.week, owner: 'player', by: 'Wexler Realty', price: 16000, how: 'bought' });
  const b = newBusiness(s, 'motel', 'crest', arch === 'C' ? 'The Starlux Resort' : arch === 'B' ? 'The Shalimar' : 'The Starlite Motel');
  b.id = `b${s.nextId++}`;
  s.businesses.push(b);
  lot.bizId = b.id;
  lot.name = b.name;
  e.managers[b.id] = { source: 'pro', name: 'Walt Brennan', skill: 62, loyalty: 60, honesty: 80, salary: 35, share: 0, oversight: 'monthly', since: s.week, skimmed: 0 };
  let v: Venue;
  if (arch === 'C') {
    v = createVenue(s, {
      concept: 'luxury_resort', rooms: 100, name: b.name, owner: 'player', ownerName: `The ${s.houseName} family`, zone: 'crest', address: lot.address, lotId: lot.id, opKey: b.id,
      builtYear: 1965, condition: 100, found: 3, style: 'midcentury', sign: 'turquoise', extraDepts: ['club', 'spa', 'parking'], lotSqft: 90000,
    });
    b.upkeep = 0;
  } else {
    weekOfVenue(s); // the migration builds the records from the business
    v = venueByKey(s, b.id)!;
    const sp = Object.values(s.empire!.spaces).filter((x) => x.buildingId === venueBuilding(s.empire!, v)!.id && x.type === 'room_std');
    // A 20-room economy motel exactly.
    const n = roomCount(s.empire!, v);
    if (sp[0]) sp[0].units += 20 - n;
    s.empire!.properties[v.propertyId].lotSqft = 30000;
  }
  runCmd(s, { cmd: 'setup', venueId: v.id, presetId: arch === 'A' ? 'balanced' : 'quality', style: 'doowop', sign: arch === 'A' ? 'pink' : 'turquoise' });
  if (arch === 'B') {
    // The boutique plan: build up to forty rooms, a dining room, then the conversion.
    startProject(s, s.empire!, v, 'floor', undefined, 'owner');
    startProject(s, s.empire!, v, 'dining', undefined, 'owner');
  }
  const startMoney = s.money;
  let ok = true;
  let step = 0;
  let peakStaff = 0;
  let minCondition = 100;
  let decay = 0;
  const end = weekOf(1970, 5, 1);
  while (s.week < end) {
    const c0 = venueBuilding(s.empire!, v)!.condition;
    const r = weekOfVenue(s);
    decay += Math.max(0, c0 - venueBuilding(s.empire!, v)!.condition);
    ok &&= r.ok;
    step++;
    peakStaff = Math.max(peakStaff, v.staffIds.length);
    minCondition = Math.min(minCondition, venueBuilding(s.empire!, v)!.condition);
    if (arch === 'B' && step > 20) {
      const busy = Object.values(s.empire!.projects).some((p) => p.venueId === v.id && p.status !== 'done');
      if (!busy) {
        if (v.concept !== 'boutique' && roomCount(s.empire!, v) < 40) startProject(s, s.empire!, v, 'wing', undefined, 'owner');
        else if (!v.amenities.includes('dining')) startProject(s, s.empire!, v, 'dining', undefined, 'owner');
        else if (v.concept !== 'boutique') startProject(s, s.empire!, v, 'to_boutique', undefined, 'owner');
      }
    }
    // The owner approves what the manager proposes when the money is there (Owner mode).
    if (s.date.d <= 7) for (const id of v.proposals.slice(0, 1)) startProject(s, s.empire!, v, id, undefined, 'owner');
  }
  const em = s.empire!;
  const tp = v.stock.toilet_paper;
  return {
    archetype: arch, name: v.name, concept: v.concept, rooms: roomCount(em, v), roomMix: roomsByType(em, v), depts: v.deptIds.map((id) => em.depts[id].kind), staff: v.staffIds.length, peakStaff, minCondition: Math.round(minCondition), decay: Math.round(decay), maxOcc: Math.max(...v.months.map((m) => (m.capacity ? m.roomNights / m.capacity : 0))),
    years: v.years.map((y) => ({ year: y.key, rev: Math.round(y.rev), opex: Math.round(y.opex + y.cogs), noi: Math.round(y.noi), capex: Math.round(y.capex), occ: y.capacity ? Math.round((y.roomNights / y.capacity) * 100) : 0, sat: Math.round(y.sat), covers: y.covers })),
    projects: Object.values(em.projects).filter((p) => p.venueId === v.id).map((p) => `${p.defId}${p.status === 'done' ? '' : ` (${p.status})`}${p.by === 'manager' ? ' [manager]' : ''}`),
    managerProjects: em.properties[v.propertyId].history.filter((h) => h.text.startsWith('The manager started')).length,
    tp: { item: tp?.item ?? '', used: Math.round(tp?.used ?? 0), onHand: Math.round(tp?.onHand ?? 0), short: tp?.short ?? 0 },
    sheets: { item: v.durables.sheets?.item ?? '', units: v.durables.sheets?.units ?? 0, wear: Math.round(v.durables.sheets?.wear ?? 0) },
    towels: { item: v.durables.towels?.item ?? '', units: v.durables.towels?.units ?? 0, wear: Math.round(v.durables.towels?.wear ?? 0) },
    condition: [Math.round(venueBuilding(em, v)!.condition)], reputation: Math.round(v.reputation),
    history: em.properties[v.propertyId].history.length, visuals: venueBuilding(em, v)!.visuals.length,
    rivals: Object.values(em.venues).filter((x) => x.owner !== 'player' && !x.closed).length, ledgerOk: ok, treasuryDelta: s.money - startMoney, state: s, venue: v,
  };
}

const isMain = typeof process !== 'undefined' && process.argv[1]?.endsWith('empireAcceptance.ts');
if (isMain) {
  for (const a of ['A', 'B', 'C'] as Archetype[]) {
    const o = develop(a);
    console.log(`\n${a}. ${o.name} — ${CONCEPTS[o.concept].name}, ${o.rooms} rooms ${JSON.stringify(o.roomMix)}, ${o.staff} staff (peak ${o.peakStaff}), depts ${o.depts.join('/')}`);
    for (const y of o.years) console.log(`  ${y.year}: revenue $${y.rev.toLocaleString()}  costs $${y.opex.toLocaleString()}  operating income $${y.noi.toLocaleString()}  capital $${y.capex.toLocaleString()}  occupancy ${y.occ}%  satisfaction ${y.sat}  covers ${y.covers}`);
    console.log(`  projects: ${o.projects.join(', ')} (manager-started ${o.managerProjects})`);
    console.log(`  toilet paper: ${o.tp.item} used ${o.tp.used} rolls, on hand ${o.tp.onHand}, short weeks ${o.tp.short}; sheets ${o.sheets.item} ×${o.sheets.units} wear ${o.sheets.wear}%; towels ${o.towels.item} ×${o.towels.units} wear ${o.towels.wear}%`);
    const rv = Object.values(o.state.empire!.venues).filter((x) => x.owner !== 'player');
    console.log(`  rivals: ${rv.map((x) => `${x.name} (${x.ownerName}${x.closed ? `, ${x.closed}` : ''}) cash $${Math.round(x.cash ?? 0)} occ ${Math.round((x.last?.occ ?? 0) * 100)}%`).join('; ')}`);
    console.log(`  condition ${o.condition[0]}, reputation ${o.reputation}, history ${o.history} entries, ${o.visuals} looks, ${o.rivals} rival venues, ledger ${o.ledgerOk ? 'reconciles' : 'BROKEN'}, treasury ${o.treasuryDelta >= 0 ? '+' : ''}$${Math.round(o.treasuryDelta).toLocaleString()}`);
  }
}
