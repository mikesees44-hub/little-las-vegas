import { MALE_FIRST, SURNAMES } from './names';
import { ensureEcon, eid, type EconState, type Lot, type ZoneId } from './econState';
import { fmtMoney } from './effects';
import { money, type Ctx } from './ledger';
import { newBusiness } from './business';
import {
  BUILD_STAGES, STAGE_COST, STAGE_LABEL, USES, USES_BY_ID, ZONES_BY_ID, buildCost, buildWeeks, inflation, lotName, stageWeeks, supplyChain,
  type PropertyUse,
} from './property';
import { chance, pick, randInt } from './rng';
import type { Character, EventInstance, FactionId, GameState, RivalId } from './types';
import { FACTION_NAMES } from './world';

/**
 * Building on the island: permits, inspections, the supply chain, and
 * everybody else's construction.
 *
 * PERMITS. A build waits on two permits: the building inspector's and the
 * zoning commission's (which meets once a month). Each has a wait and a fee.
 * Shortcuts: an envelope for the inspector, a favor at City Hall, or an
 * official of yours on the commission. Who grants permits is a pluggable hook
 * (`registerPermitAuthority`): by default it is the town's building inspector,
 * a real character; the politics layer can install its own officials.
 *
 * INSPECTIONS. The inspector looks at the framing and the interior; the fire
 * marshal looks at clubs, hotels, motels and theaters before they open. A
 * failed inspection is a stop-work order until the code is fixed (or the
 * inspector is paid). Your own construction company builds better.
 *
 * EVERYONE ELSE. Each month rival families, developers and the city start
 * buildings of their own on vacant lots: doo-wop motels go up along the Crest
 * through the early sixties, stores open, a pavilion goes up on the beach.
 * Old buildings burn. If you own the supply chain, you earn on their builds;
 * your construction company can bid on the city's jobs (and rig the bid), and
 * you can slow a rival's build down.
 */

/* ---------------- the permit authority (pluggable) ---------------- */

export interface PermitAuthority {
  /** The man who signs building permits. */
  inspector?: Character;
  /** Name of the zoning body. */
  zoning: string;
  /** Weeks until each permit comes through for this build. */
  waits: (s: GameState, lot: Lot, use: PropertyUse) => { zoning: number; inspector: number };
  /** An official of yours who can push the zoning permit through (none by default). */
  puppet?: (s: GameState) => Character | undefined;
}

/**
 * A per-lot verdict layered on top (the politics layer's officials): 'fast'
 * pushes the permits through this week, 'blocked' holds them.
 */
export type PermitVerdict = { verdict: 'fast' | 'blocked'; why: string };
export type PermitVerdictFn = (s: GameState, lot: Lot) => PermitVerdict | undefined;
const VERDICTS: PermitVerdictFn[] = [];
export function registerPermitVerdict(fn: PermitVerdictFn): void {
  if (!VERDICTS.includes(fn)) VERDICTS.push(fn);
}
export function permitVerdict(s: GameState, lot: Lot): PermitVerdict | undefined {
  for (const fn of VERDICTS) {
    const v = fn(s, lot);
    if (v) return v;
  }
  return undefined;
}

/**
 * Installments that come due on their own (a building stage, a community
 * project) wait rather than take the last of the treasury: they never leave
 * less than this for the payroll.
 */
export const BUILD_CUSHION = 3000;

type AuthorityFn = (s: GameState) => PermitAuthority;
let authority: AuthorityFn = defaultAuthority;

/** The politics layer (or a test) can install its own permit authority. */
export function registerPermitAuthority(fn: AuthorityFn | undefined): void {
  authority = fn ?? defaultAuthority;
}

export function permitAuthority(s: GameState): PermitAuthority {
  return authority(s);
}

function defaultAuthority(s: GameState): PermitAuthority {
  return {
    inspector: s.econ?.inspector,
    zoning: 'the Wildwood zoning commission',
    waits: (st, lot, use) => defaultWaits(st, lot, use),
  };
}

/** The inspector takes his share of the build's permit weeks; the commission meets on the first of the month. */
export function defaultWaits(s: GameState, lot: Lot, use: PropertyUse): { zoning: number; inspector: number } {
  const w = stageWeeks(buildWeeks(lot, use, s));
  const toMonth = Math.max(1, Math.ceil((29 - s.date.d) / 7));
  return { inspector: w.permits, zoning: lot.status === 'leased' ? 0 : toMonth };
}

/** The town's building inspector, drawn once on the layer's own dice. */
export function ensureInspector(s: GameState): Character | undefined {
  const e = ensureEcon(s);
  if (e.inspector) return e.inspector;
  const eth = pick(e, ['Irish', 'Irish', 'Italian', 'Jewish'] as const);
  const traits = pick(e, [['Honest', 'Patient'], ['Greedy', 'Charming'], ['Gambler'], ['Pious', 'Honest'], ['Greedy'], ['Paranoid', 'Drinker']] as Character['traits'][]);
  const a = () => randInt(e, 30, 70);
  e.inspector = {
    id: 'inspector', firstName: pick(e, MALE_FIRST[eth]), lastName: pick(e, SURNAMES[eth]), gender: 'M', ethnicity: eth,
    birth: { y: s.date.y - randInt(e, 32, 58), m: randInt(e, 1, 12), d: randInt(e, 1, 28) }, health: 80, conditions: [],
    attributes: { leadership: a(), business: a(), diplomacy: a(), intrigue: a(), force: a(), discipline: a() },
    traits, ambition: 'A pension and a quiet life', rank: 'civilian', faction: 'none', wealth: 2000, dynasty: false, childrenIds: [], alive: true,
    office: 'Building inspector',
  };
  return e.inspector;
}

/** What the inspector's envelope costs for this build. */
export function inspectorBribe(s: GameState, lot: Lot): number {
  const u = lot.use ? USES_BY_ID[lot.use] : undefined;
  return Math.round((150 + (u ? buildCost(lot, u, s) * 0.015 : 0)) * inflation(s) / 10) * 10;
}

/** What fixing a failed inspection costs. */
export function fixCost(s: GameState, lot: Lot): number {
  const u = lot.use ? USES_BY_ID[lot.use] : undefined;
  return Math.round((u ? buildCost(lot, u, s) * 0.06 : 300) / 10) * 10;
}

/** Starts construction on a lot (anyone's). */
export function startBuild(s: GameState, lot: Lot, useId: string, developer?: string): void {
  const u = USES_BY_ID[useId];
  lot.use = useId;
  lot.stage = 'permits';
  lot.stageWeek = 0;
  delete lot.tenant;
  lot.started = s.date.y;
  lot.inspected = [];
  delete lot.stopWork;
  lot.developer = developer;
  const w = permitAuthority(s).waits(s, lot, u);
  lot.permit = { zoning: w.zoning, inspector: w.inspector };
}

/** Total weeks a build will take from today, permits included. */
export function scheduleWeeks(s: GameState, lot: Lot, u: PropertyUse): number {
  const w = stageWeeks(buildWeeks(lot, u, s));
  const p = permitAuthority(s).waits(s, lot, u);
  return BUILD_STAGES.slice(1).reduce((a, st) => a + w[st], 0) + Math.max(1, p.zoning, p.inspector);
}

const INSPECTED_AT = ['framing', 'interior'];
const FIRE_CHECK = new Set(['hotel', 'motel', 'boarding', 'boardinghouse', 'rooming', 'flophouse', 'jazzclub', 'supper', 'burlesque', 'gents', 'hoodclub', 'concerthall', 'cinema', 'comedy', 'grindhouse']);

/** Odds a build passes an inspection. */
export function passOdds(s: GameState, lot: Lot): number {
  const mine = lot.status === 'owned' || lot.status === 'leased';
  return Math.min(0.97, 0.8 + (mine ? supplyChain(s).quality : 0.05) + (lot.permit?.bribed ? 0.12 : 0));
}

const CODE_FAILS = ['the wiring is not to code', 'the footings are too shallow', 'the stairs are too steep', 'no fire stops between the floors', 'the plumbing vents into the attic'];
const FIRE_FAILS = ['not enough exits', 'no sprinklers over the kitchen', 'the exit doors open inward', 'occupancy signs missing'];

/**
 * The week of every construction site: permits, inspections, stop-work
 * orders and stage costs (yours go through the ledger; others' don't).
 */
export function constructionWeek(ctx: Ctx, onOpen: (l: Lot) => void): void {
  const s = ctx.s;
  const e = s.econ!;
  const auth = permitAuthority(s);
  for (const l of e.lots) {
    if (!l.stage || l.stage === 'purchase' || l.stage === 'open' || !l.use) continue;
    const mine = l.status === 'owned' || l.status === 'leased';
    const u = USES_BY_ID[l.use];
    const weeks = stageWeeks(buildWeeks(l, u, mine ? s : undefined));
    const st = l.stage;
    delete l.stalled;
    if (l.stopWork) {
      l.stopWork.weeks--;
      l.stalled = `Stop-work order: ${l.stopWork.reason}`;
      if (l.stopWork.weeks > 0) continue;
      delete l.stopWork;
      delete l.stalled;
    }
    if ((l.stageWeek ?? 0) === 0 && mine) {
      // A new stage starts: the inspector comes at framing and interior; the money goes out.
      if (INSPECTED_AT.includes(st) && !(l.inspected ?? []).includes(st)) {
        (l.inspected ??= []).push(st);
        if (!chance(e, passOdds(s, l))) {
          l.stopWork = { weeks: randInt(e, 2, 4), reason: `${auth.inspector ? `${auth.inspector.firstName} ${auth.inspector.lastName} says` : 'the inspector says'} ${pick(e, CODE_FAILS)}` };
          l.stalled = `Stop-work order: ${l.stopWork.reason}`;
          if (mine) {
            e.stats.inspectionsFailed++;
            e.cooldowns[`stop:${l.id}`] = s.week;
            ctx.log.push(`Failed inspection at ${lotName(l)}: ${l.stopWork.reason}. Stop-work order.`);
          }
          continue;
        }
      }
    }
    if (mine && (l.stageWeek ?? 0) === 0) {
      const cost = Math.round(buildCost(l, u, s) * STAGE_COST[st]);
      if (s.money - cost < BUILD_CUSHION) {
        l.stalled = `No money for ${STAGE_LABEL[st].toLowerCase()} (${fmtMoney(cost)}): the contractor waits until it leaves you ${fmtMoney(BUILD_CUSHION)} for the payroll`;
        continue;
      }
      if (st === 'permits' && s.heat.local >= 70 && chance(e, 0.3)) {
        l.stalled = 'The building inspector wants to talk first';
        continue;
      }
      money(ctx, -cost, `Construction: ${lotName(l)} — ${STAGE_LABEL[st].toLowerCase()}`, 'cost');
      l.invested = (l.invested ?? 0) + cost;
    }
    // Others' builds pay your companies if you hold the contract or supply them.
    if (!mine && (l.stageWeek ?? 0) === 0) supplyIncome(ctx, l, u, st);
    if (st === 'permits') {
      // Waiting on the inspector and the commission.
      const p = (l.permit ??= { zoning: 0, inspector: weeks.permits });
      const v = mine ? permitVerdict(s, l) : undefined;
      if (v?.verdict === 'blocked') {
        l.stalled = v.why;
        continue;
      }
      if (v?.verdict === 'fast' && (p.zoning > 0 || p.inspector > 0)) {
        p.zoning = 0;
        p.inspector = 0;
        ctx.log.push(`${lotName(l)}: ${v.why}.`);
      }
      p.zoning = Math.max(0, p.zoning - 1);
      p.inspector = Math.max(0, p.inspector - 1);
      l.stageWeek = (l.stageWeek ?? 0) + 1;
      if (p.zoning > 0 || p.inspector > 0) {
        if (mine) l.stalled = `Waiting on permits: ${p.inspector > 0 ? `inspector ${p.inspector} wk` : 'inspector signed'} · ${p.zoning > 0 ? `zoning ${p.zoning} wk` : 'zoning approved'}`;
        continue;
      }
      l.stage = 'siteprep';
      l.stageWeek = 0;
      continue;
    }
    l.stageWeek = (l.stageWeek ?? 0) + 1;
    if (l.stageWeek >= weeks[st]) {
      const next = BUILD_STAGES[BUILD_STAGES.indexOf(st) + 1];
      l.stageWeek = 0;
      if (next) l.stage = next;
      else if (FIRE_CHECK.has(l.use) && !(l.inspected ?? []).includes('fire') && mine) {
        (l.inspected ??= []).push('fire');
        if (!chance(e, passOdds(s, l) + 0.05)) {
          l.stopWork = { weeks: randInt(e, 1, 3), reason: `the fire marshal: ${pick(e, FIRE_FAILS)}` };
          l.stalled = `Stop-work order: ${l.stopWork.reason}`;
          e.stats.inspectionsFailed++;
          e.cooldowns[`stop:${l.id}`] = s.week;
          ctx.log.push(`The fire marshal will not let ${lotName(l)} open: ${l.stopWork.reason}.`);
          l.stageWeek = weeks.interior; // stays at the end of the interior
          continue;
        }
        onOpen(l);
      } else onOpen(l);
    }
  }
}

/** Your companies' cut of someone else's build. */
function supplyIncome(ctx: Ctx, l: Lot, u: PropertyUse, st: string): void {
  const s = ctx.s;
  const sc = supplyChain(s);
  if (!sc.owned.length) return;
  const total = buildCost(l, u);
  const who = l.developer ?? 'a developer';
  const lines: [string, number][] = [];
  if (l.contractor && sc.owned.includes('construction')) lines.push([`Contract: your crews on ${who}'s ${u.name.toLowerCase()} — ${STAGE_LABEL[l.stage!].toLowerCase()}`, total * STAGE_COST[st] * 0.12]);
  if (st === 'foundation' && sc.owned.includes('concrete')) lines.push([`Contract: your concrete poured the foundation of ${who}'s ${u.name.toLowerCase()}`, total * 0.03]);
  if (st === 'framing' && sc.owned.includes('lumber')) lines.push([`Contract: your yard sold the lumber for ${who}'s ${u.name.toLowerCase()}`, total * 0.025]);
  if ((st === 'siteprep' || st === 'framing') && sc.owned.includes('trucking')) lines.push([`Contract: your trucks hauled for ${who}'s ${u.name.toLowerCase()}`, total * 0.008]);
  for (const [label, amt] of lines) if (amt >= 1) money(ctx, Math.round(amt), label, 'business');
}

/* ---------------- monthly: the town builds ---------------- */

const DEVELOPERS = ['Sid Weintraub', 'the Mahaffey brothers', 'Gus Papadakis', 'Lou Castellano', 'Harry Lenz', 'the Kovacs family', 'Vince DiNardo', 'the Brennan estate', 'a Philadelphia syndicate', 'a Baltimore dentist'];

/** Weight of a use for a builder in a zone and year (the Crest motel boom of 1958–66). */
function useWeight(u: PropertyUse, zone: ZoneId, year: number): number {
  let w = u.cost > 40000 ? 0.2 : 1;
  if (u.id === 'motel' && (zone === 'crest' || zone === 'north' || zone === 'boardwalk') && year <= 1967) w *= 9;
  if (u.id === 'motel' && zone === 'crest') w *= 2;
  if (u.id === 'hotel' && zone === 'ac' && year >= 1977) w *= 6;
  return w;
}

function pickUse(e: EconState, zone: ZoneId, year: number, city: boolean): PropertyUse | undefined {
  const z = ZONES_BY_ID[zone];
  const pool = USES.filter((u) => (u.minYear ?? 0) <= year && (city ? u.npcOnly && (!u.zones || u.zones.includes(zone)) : !u.npcOnly && (u.zones ? u.zones.includes(zone) : z.cats.includes(u.cat))));
  if (!pool.length) return undefined;
  const ws = pool.map((u) => useWeight(u, zone, year));
  let r = ws.reduce((a, b) => a + b, 0) * (randInt(e, 0, 9999) / 10000);
  for (let i = 0; i < pool.length; i++) {
    r -= ws[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/**
 * The month on the market: rivals, developers and the city start buildings;
 * old ones burn; rivals line up to bid on lots; the city puts jobs out for bid.
 * Returns the lot ids that burned (yours get an insurance check through the ledger).
 */
export function townMonth(ctx: Ctx): void {
  const s = ctx.s;
  const e = s.econ!;
  ensureInspector(s);
  const year = s.date.y;
  // New starts: more in the boom years.
  const boom = year <= 1966 ? 1 : 0;
  const starts = randInt(e, 0, 2) + boom;
  for (let i = 0; i < starts; i++) {
    const vacant = e.lots.filter((l) => !l.use && (l.status === 'sale' || l.status === 'private' || l.status === 'rival'));
    if (!vacant.length) break;
    // The Crest fills first in the boom.
    const crest = vacant.filter((l) => l.zone === 'crest');
    const l = boom && crest.length && chance(e, 0.5) ? pick(e, crest) : pick(e, vacant);
    const z = ZONES_BY_ID[l.zone];
    const roll = randInt(e, 0, 99);
    const rivals = s.rivals.filter((r) => r.kind === 'mob' && r.money > 8000 && s.characters[r.leaderId]?.alive);
    const city = roll < 12;
    const rival = !city && (l.owner !== 'private' && l.owner !== 'city' ? s.rivals.find((r) => r.id === l.owner) : roll < 40 && rivals.length ? (z.rival ? rivals.find((r) => r.id === z.rival) ?? pick(e, rivals) : pick(e, rivals)) : undefined);
    const u = pickUse(e, l.zone, year, city);
    if (!u) continue;
    if (city) {
      l.status = 'public';
      l.owner = 'city';
      startBuild(s, l, u.id, 'the city');
    } else if (rival) {
      l.status = 'rival';
      l.owner = rival.id;
      // Rivals build with partners' money; their own treasury is for the street.
      startBuild(s, l, u.id, FACTION_NAMES[rival.id]);
    } else {
      l.status = 'private';
      l.owner = 'private';
      startBuild(s, l, u.id, pick(e, DEVELOPERS));
    }
    // Your construction company may win the job (never the city's: that one is bid).
    if (!city && supplyChain(s).owned.includes('construction')) {
      const p = rival ? 0.25 : 0.45;
      l.contractor = chance(e, p);
      if (l.contractor) e.stats.contractsWon++;
    } else l.contractor = false;
  }
  // Fires: old buildings, bad wiring, insurance.
  for (const l of e.lots) {
    if (l.stage !== 'open' || !l.use) continue;
    const mine = l.status === 'owned' || l.status === 'leased';
    const p = (mine ? 0.0012 : 0.0015) * (l.condition < 50 ? 2 : 1);
    if (!chance(e, p)) continue;
    const u = USES_BY_ID[l.use];
    e.stats.fires++;
    (l.past ??= []).push({ use: l.use, from: l.builtYear ?? 1950, to: year, why: 'burned' });
    const text = `Fire: ${lotName(l)} burned to the ground.`;
    ctx.log.push(text);
    s.chronicle.push({ week: s.week, date: { ...s.date }, text, kind: 'misc' });
    if (mine) {
      const check = Math.round(u.cost * ZONES_BY_ID[l.zone].land * 0.5 * inflation(s) / 50) * 50;
      money(ctx, check, `Insurance: ${lotName(l)} burned (half its value)`, 'event');
      if (l.bizId) s.businesses = s.businesses.filter((b) => b.id !== l.bizId);
      delete l.bizId;
      l.stage = 'purchase';
    } else {
      delete l.stage;
      if (l.status !== 'public') {
        l.status = 'sale';
        l.owner = 'private';
        l.price = Math.round(1500 * ZONES_BY_ID[l.zone].land * inflation(s) / 50) * 50;
      }
    }
    delete l.use;
    delete l.tenant;
    delete l.operating;
    l.condition = 100;
  }
  // Rivals line up to bid on lots in their part of town.
  for (const l of e.lots) {
    if (l.status !== 'sale') { delete l.bidder; continue; }
    if (l.bidder && chance(e, 0.3)) delete l.bidder;
    const z = ZONES_BY_ID[l.zone];
    const near = z.rival ?? (z.district ? (Object.entries(s.districts.find((d) => d.id === z.district)?.influence ?? {}).filter(([f, v]) => f !== 'player' && (v ?? 0) >= 20).map(([f]) => f)[0] as RivalId | undefined) : undefined);
    if (!l.bidder && near && s.rivals.some((r) => r.id === near) && chance(e, 0.15)) l.bidder = near;
  }
  // The city puts a job out for bids.
  e.tenders = e.tenders.filter((t) => t.closes > s.week);
  if (chance(e, 0.35)) {
    const jobs = ['Boardwalk plank replacement', 'A new wing for the grade school', 'Seawall repairs at the Crest', 'Storm sewers on Pacific Avenue', 'The new municipal parking lot', 'Paving New Jersey Avenue', 'A lifeguard headquarters'];
    const value = Math.round(randInt(e, 40, 250) * 100 * inflation(s));
    e.tenders.push({ id: eid(e, 'td'), name: pick(e, jobs), value, weeks: randInt(e, 8, 20), closes: s.week + 4 });
  }
}

/** Weekly payments on contracts you are working. */
export function contractsWeek(ctx: Ctx): void {
  const s = ctx.s;
  const e = s.econ!;
  for (const c of e.contracts) {
    if (c.weeksLeft <= 0) continue;
    money(ctx, c.weekly, `Contract: ${c.name} (${c.weeksLeft} wk left)`, 'business');
    c.weeksLeft--;
  }
  e.contracts = e.contracts.filter((c) => c.weeksLeft > 0);
}

/** Odds your company wins a city bid, with the reasons (rigged bids help). */
export function bidOdds(s: GameState): { chance: number; reasons: { label: string; value: number }[] } {
  const sc = supplyChain(s);
  const reasons: { label: string; value: number }[] = [{ label: 'Base', value: 25 }];
  if (sc.owned.includes('concrete')) reasons.push({ label: 'Your own concrete', value: 8 });
  if (sc.owned.includes('trucking')) reasons.push({ label: 'Your own trucks', value: 4 });
  if (s.businesses.some((b) => b.owner === 'player' && b.kind === 'bidrig')) reasons.push({ label: 'The contractors take turns (bid-rigging)', value: 30 });
  if (s.favors > 0) reasons.push({ label: 'A friend at City Hall', value: 10 });
  if (s.heat.local > 60) reasons.push({ label: 'The papers are watching City Hall', value: -15 });
  const sum = reasons.reduce((a, r) => a + r.value, 0);
  return { chance: Math.max(0.05, Math.min(0.9, sum / 100)), reasons };
}

/** Rival builds you could slow down (you supply them, or the hod carriers listen to you). */
export function canSlow(s: GameState): string | undefined {
  const sc = supplyChain(s);
  if (sc.owned.includes('concrete') || sc.owned.includes('trucking') || s.businesses.some((b) => b.owner === 'player' && (b.kind === 'labor' || b.kind === 'construction'))) return undefined;
  return 'You need a concrete plant, trucks, a construction company or a labor local';
}

/** A popup when one of your sites gets a stop-work order. */
export function stopWorkEvent(s: GameState, lotId: string): EventInstance | undefined {
  const l = s.econ?.lots.find((x) => x.id === lotId);
  if (!l?.stopWork || !(l.status === 'owned' || l.status === 'leased')) return undefined;
  const fix = fixCost(s, l);
  const env = inspectorBribe(s, l);
  const label = `Stop-work order: ${lotName(l)}`;
  const insp = permitAuthority(s).inspector;
  const who = insp ? `${insp.firstName} ${insp.lastName}, the building inspector,` : 'The building inspector';
  return {
    iid: `ev${s.nextId++}`, defId: 'econ_stopwork', title: `Stop-work order at ${l.address}`, week: s.week, mandatory: false, priority: 28,
    text: `${who} chained the site at ${lotName(l)} shut: ${l.stopWork.reason}. ${l.stopWork.weeks} weeks unless something changes.`,
    defaultChoiceId: 'wait',
    choices: [
      { id: 'fix', label: `Fix it to code (${fmtMoney(fix)})`, because: `fixed the code violations at ${l.address}`, effects: [{ type: 'money', amount: -fix, label }, { type: 'econ', op: { op: 'clearStop', lotId: l.id }, label }], disabledReason: s.money < fix ? `Needs ${fmtMoney(fix)}` : undefined },
      { id: 'envelope', label: `An envelope for the inspector (${fmtMoney(env)})`, detail: 'If he is the kind who takes one.', because: `paid off the building inspector at ${l.address}`, effects: [{ type: 'money', amount: -env, label }, { type: 'econ', op: { op: 'bribeStop', lotId: l.id }, label }], disabledReason: s.money < env ? `Needs ${fmtMoney(env)}` : undefined },
      { id: 'wait', label: 'Wait it out', because: `waited out a stop-work order at ${l.address}`, effects: [{ type: 'econ', op: { op: 'note', text: `${l.stopWork.weeks} more weeks` }, label }] },
    ],
  };
}

/** Builds a catalog business for a lot that opens as one. */
export function businessForLot(s: GameState, l: Lot) {
  const u = USES_BY_ID[l.use!];
  const z = ZONES_BY_ID[l.zone];
  const b = newBusiness(s, u.biz!, z.district ?? `zone:${l.zone}`);
  b.id = `b${s.nextId++}`;
  b.cost = u.cost;
  return b;
}

export function rivalName(f: FactionId | 'private' | 'city'): string {
  return f === 'private' ? 'a private owner' : f === 'city' ? 'the city' : FACTION_NAMES[f];
}

