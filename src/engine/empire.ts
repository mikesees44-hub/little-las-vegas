import type { ActionPreview } from './actions';
import { isOpen } from './business';
import { CATS, ITEMS_BY_ID, itemAvailable, type ItemCat } from './empireCatalog';
import {
  basePolicy, deptOf, fitOut, layoutBuilding, layoutProblems, newProperty, roomCount, venueBuilding, type VenueSpec,
} from './empireBuild';
import { CONCEPTS, DEPTS, LODGING, SUPPLIERS } from './empireData';
import { BUILTIN_PRESETS, applyPreset, chooseSupplies, forecastWeek, gripes, managerWeek, presetById, presetFrom, presetsOf } from './empireAI';
import { clearMarket, isOpenWeek, makeBid, managerSkill, revenueOf, rollup, runVenueWeek, type Bid, type WeekResult } from './empireOps';
import { PROJECTS_BY_ID, projectOptions } from './empireProjects';
import { charHead, deptStaff, dismissHead, newWorker, promote, removeWorker, staffTarget } from './empireStaff';
import {
  ensureEmpire, xid, type ConceptId, type DeptKind, type EmpireState, type Mode, type OperatingPolicy, type Plan, type Project, type RoomType, type SupplyGroup, type Venue,
} from './empireState';
import { STYLES, designMut, type BuildStyle, type SignColor } from './design';
import { fmtMoney } from './effects';
import { heat, money, respect, type Ctx } from './ledger';
import { OVERSIGHT, managerSkimRate } from './managers';
import { USES_BY_ID, ZONES_BY_ID, inflation, lotName } from './property';
import { chance, hashSeed, pick, rand, randInt } from './rng';
import type { Business, BusinessKind, GameState, PlayerAction } from './types';
import { FACTION_NAMES } from './world';

/**
 * The Empire Designer's hub: one reusable system for every place the family
 * (or a rival) runs. A Deal that signs for a motel, a rooming house or a
 * hotel creates its records here (Property → Building → Floors → Spaces,
 * departments, staff, supplies) and from then on the place runs on its own
 * operating statement, posted to the ledger line by line. Saves from before
 * the designer migrate the same way: the first week finds the places and
 * builds their records.
 *
 * Commands (`EmpireCmd`) change configuration only (concept, policy,
 * presets, supplies, staff, projects started); money moves only when the
 * week turns, through the ledger. The UI applies a command at once with
 * `applyEmpireCmd` (a pure copy); the simulator queues it as an order.
 */

/* ---------------- which places run on the designer ---------------- */

/** Catalog businesses that become venues, and their concept. */
export const BIZ_CONCEPT: Partial<Record<BusinessKind, ConceptId>> = { motel: 'budget_motel', boarding: 'rooming' };
/** Lot uses (not catalog businesses) that become venues. */
export const USE_CONCEPT: Record<string, ConceptId> = { rooming: 'rooming', boardinghouse: 'rooming', flophouse: 'rooming', hotel: 'luxury_resort' };
/** Lot uses that compete for guests when a rival or a private owner runs them. */
const RIVAL_USES: Record<string, ConceptId> = { motel: 'budget_motel', boarding: 'rooming', rooming: 'rooming', boardinghouse: 'rooming', flophouse: 'rooming', hotel: 'boutique' };

const ROOMS_FOR: Record<string, [number, number]> = { motel: [16, 28], boarding: [10, 16], rooming: [10, 14], boardinghouse: [14, 20], flophouse: [24, 30], hotel: [90, 120] };

export function venueByKey(s: GameState, key: string): Venue | undefined {
  const e = s.empire;
  if (!e) return undefined;
  for (const v of Object.values(e.venues)) if (v.opKey === key && !v.closed) return v;
  return undefined;
}

export function venueForLot(s: GameState, lotId: string): Venue | undefined {
  const e = s.empire;
  if (!e) return undefined;
  for (const v of Object.values(e.venues)) if (!v.closed && e.properties[v.propertyId]?.lotId === lotId) return v;
  return undefined;
}

export function playerVenues(s: GameState): Venue[] {
  return Object.values(s.empire?.venues ?? {}).filter((v) => v.owner === 'player' && !v.closed);
}

export function rivalVenues(s: GameState): Venue[] {
  return Object.values(s.empire?.venues ?? {}).filter((v) => v.owner !== 'player' && !v.closed);
}

/* ---------------- creating venues ---------------- */

function hist(s: GameState, e: EmpireState, v: Venue, kind: Parameters<typeof pushHist>[3], text: string): void {
  pushHist(s, e, v.propertyId, kind, text);
}

function pushHist(s: GameState, e: EmpireState, pid: string, kind: 'acquired' | 'built' | 'renovated' | 'converted' | 'staff' | 'sold' | 'note' | 'opened' | 'closed', text: string): void {
  const p = e.properties[pid];
  if (!p) return;
  p.history.push({ week: s.week, year: s.date.y, kind, text });
  if (p.history.length > 80) p.history.splice(0, p.history.length - 80);
}

export function snapshot(s: GameState, e: EmpireState, v: Venue, label: string): void {
  const b = venueBuilding(e, v);
  if (!b) return;
  b.visuals.push({ week: s.week, year: s.date.y, style: b.style, sign: b.sign, stories: b.stories, rooms: roomCount(e, v), label });
  if (b.visuals.length > 20) b.visuals.splice(0, b.visuals.length - 20);
}

/** Creates a venue and all its records. */
export function createVenue(s: GameState, spec: VenueSpec, plan?: Plan): Venue {
  const e = ensureEmpire(s);
  const c = CONCEPTS[spec.concept];
  const p = newProperty(e, spec, s, 0);
  const v: Venue = {
    id: xid(e, 'v'), propertyId: p.id, owner: spec.owner, ownerName: spec.ownerName, name: spec.name, concept: spec.concept, opKey: spec.opKey,
    policy: basePolicy(s, spec.concept, spec.zone), stock: {}, durables: {}, deptIds: [], staffIds: [], amenities: [], reputation: 45 + spec.found * 5 + Math.round(spec.condition / 10),
    opened: s.week, months: [], years: [], capexTotal: 0, proposals: [], gripe: 0, alumni: [],
  };
  e.venues[v.id] = v;
  p.venueId = v.id;
  layoutBuilding(e, p, v, spec);
  if (spec.found >= 2 && c.kind === 'lodging') v.amenities.push('phones');
  if (v.deptIds.some((id) => e.depts[id]?.kind === 'pool')) v.amenities.push('pool');
  if (v.deptIds.some((id) => e.depts[id]?.kind === 'laundry')) v.amenities.push('laundry');
  if (v.deptIds.some((id) => e.depts[id]?.kind === 'dining')) v.amenities.push('dining');
  if (v.deptIds.some((id) => e.depts[id]?.kind === 'bar')) v.amenities.push('lounge');
  if (v.deptIds.some((id) => e.depts[id]?.kind === 'club')) v.amenities.push('club');
  if (v.deptIds.some((id) => e.depts[id]?.kind === 'spa')) v.amenities.push('spa');
  v.policy.mode = plan?.mode ?? 'owner';
  applyPreset(s, e, v, presetById(e, plan?.presetId) ?? BUILTIN_PRESETS[0]);
  fitOut(s, e, v, spec.found, Math.max(0, Math.min(90, 100 - spec.condition)));
  if (spec.found >= 2) for (const cat of ['aircon', 'tv'] as ItemCat[]) if (v.durables[cat] && ITEMS_BY_ID[v.durables[cat].item]?.price) v.amenities.push(cat === 'aircon' ? 'ac' : 'tv');
  for (const g of ['linen', 'paper', 'cleaning', 'food', 'liquor', 'furniture'] as SupplyGroup[]) {
    const sup = SUPPLIERS.find((x) => x.group === g && !x.needsKind)!;
    const id = xid(e, 'sc');
    e.contracts[id] = { id, venueId: v.id, group: g, supplierId: sup.id, since: s.week };
  }
  const infl = inflation(s);
  const rooms = roomCount(e, v);
  p.value = Math.round((rooms * 520 + 1500 * (ZONES_BY_ID[spec.zone]?.land ?? 1)) * infl * (0.6 + 0.4 * spec.condition / 100) / 50) * 50;
  // The first crew and the first order of supplies.
  const f = forecastWeek(s, e, v);
  for (const id of v.deptIds) {
    const d = e.depts[id];
    const n = Math.max(f.open ? staffTarget(e, v, d.kind, f) : 0, ['front', 'maintenance'].includes(d.kind) || (d.kind === 'housekeeping' && rooms) ? 1 : 0);
    for (let i = 0; i < n; i++) newWorker(s, e, v, d, { seasonal: i > 0 && f.inSeason, head: i === 0 && n >= 3 });
  }
  for (const [cat, line] of Object.entries(v.stock)) {
    const cd = CATS[cat as ItemCat];
    const use = cd.driver === 'roomNight' ? f.roomNights : cd.driver === 'cover' ? f.covers : cd.driver === 'drink' ? f.drinks : cd.driver === 'week' ? 1 : 2;
    line.onHand = Math.ceil(use * (cd.use ?? 1) * 1.5);
  }
  e.stats.venues++;
  pushHist(s, e, p.id, spec.builtYear === s.date.y ? 'built' : 'acquired', spec.owner === 'player' ? `${spec.ownerName} took over ${spec.name} (${c.name.toLowerCase()}, ${rooms} rooms)` : `${spec.name}, ${c.name.toLowerCase()} run by ${spec.ownerName}`);
  snapshot(s, e, v, spec.builtYear === s.date.y ? 'Opened' : 'As found');
  return v;
}

function styleFor(e: EmpireState, key: string): { style: BuildStyle; sign: SignColor } {
  const h = { rng: hashSeed(`${e.rng}:${key}`) };
  const st: BuildStyle[] = ['doowop', 'doowop', 'doowop', 'midcentury', 'colonial', 'tiki', 'victorian', 'deco'];
  const sg: SignColor[] = ['pink', 'turquoise', 'red', 'gold', 'green', 'blue', 'white'];
  return { style: pick(h, st), sign: pick(h, sg) };
}

function roomsFor(use: string, key: string): number {
  const [lo, hi] = ROOMS_FOR[use] ?? [16, 24];
  const h = { rng: hashSeed(`rooms:${key}`) };
  return randInt(h, lo, hi);
}

/** Finds the places that should run on the designer and builds their records (the migration). */
export function scanVenues(s: GameState): Venue[] {
  const e = ensureEmpire(s);
  const made: Venue[] = [];
  const econ = s.econ;
  const boss = s.characters[s.playerId];
  const house = `The ${s.houseName} family`;
  // Your businesses (motels, rooming houses).
  for (const b of s.businesses) {
    if (b.owner !== 'player') continue;
    const concept = BIZ_CONCEPT[b.kind];
    if (!concept || venueByKey(s, b.id)) continue;
    const lot = econ?.lots.find((l) => l.bizId === b.id);
    const d = econ?.designs?.[b.id];
    const planKey = lot ? `lot:${lot.id}` : `biz:${b.kind}:${b.districtId}`;
    const plan = e.plans[planKey];
    const look = d?.style ? { style: d.style, sign: d.sign ?? 'pink' } : { style: 'doowop' as BuildStyle, sign: (d?.sign ?? 'pink') as SignColor };
    const zone = lot?.zone ?? (ZONES_BY_ID[b.districtId as keyof typeof ZONES_BY_ID] ? b.districtId : (Object.values(ZONES_BY_ID).find((z) => z.district === b.districtId)?.id ?? 'downtown'));
    const use = lot?.use ?? (b.kind === 'motel' ? 'motel' : 'boarding');
    const v = createVenue(s, {
      concept: plan?.concept && LODGING.includes(plan.concept) ? plan.concept : concept, rooms: roomsFor(use, b.id), name: b.name, owner: 'player', ownerName: house, zone: zone as never,
      address: lot?.address ?? `${b.name}, ${s.districts.find((x) => x.id === b.districtId)?.name ?? 'Wildwood'}`, lotId: lot?.id, opKey: b.id,
      builtYear: lot?.builtYear ?? s.date.y - 6, condition: lot?.condition ?? 80, found: (lot?.condition ?? 80) >= 80 ? 1 : 0, ...look,
    }, plan);
    delete e.plans[planKey];
    b.upkeep = 0;
    if (lot) { lot.name ??= b.name; }
    made.push(v);
    void boss;
  }
  // Buildings you run that are not catalog businesses (a rooming house, a hotel).
  for (const l of econ?.lots ?? []) {
    if ((l.status !== 'owned' && l.status !== 'leased') || l.stage !== 'open' || !l.use || l.bizId) continue;
    const concept = USE_CONCEPT[l.use];
    if (!concept || (l.tenant && !l.operating)) continue;
    const key = `lot:${l.id}`;
    if (venueByKey(s, key)) continue;
    const d = econ?.designs?.[key];
    const plan = e.plans[key];
    const v = createVenue(s, {
      concept: plan?.concept ?? concept, rooms: roomsFor(l.use, l.id), name: l.name ?? USES_BY_ID[l.use].name, owner: 'player', ownerName: house, zone: l.zone, address: l.address,
      lotId: l.id, opKey: key, builtYear: l.builtYear ?? s.date.y, condition: l.condition, found: l.use === 'hotel' ? 2 : l.condition >= 80 ? 1 : 0,
      style: d?.style ?? 'doowop', sign: d?.sign ?? 'pink',
    }, plan);
    delete e.plans[key];
    made.push(v);
  }
  // Places that changed hands: yours sold or seized, a rival's bought by you.
  for (const v of Object.values(e.venues)) {
    if (v.closed) continue;
    const p = e.properties[v.propertyId];
    const lot = p?.lotId ? econ?.lots.find((l) => l.id === p.lotId) : undefined;
    if (v.owner === 'player') {
      const still = v.opKey?.startsWith('lot:') ? !!lot && (lot.status === 'owned' || lot.status === 'leased') : s.businesses.some((b) => b.id === v.opKey && b.owner === 'player');
      if (still) continue;
      if (lot && lot.stage === 'open' && (lot.status === 'rival' || lot.status === 'private')) {
        v.owner = lot.owner === 'city' ? 'private' : (lot.owner as Venue['owner']);
        v.ownerName = lot.status === 'rival' ? FACTION_NAMES[lot.owner as keyof typeof FACTION_NAMES] ?? 'a rival' : 'a private owner';
        v.opKey = undefined;
        v.cash = 1500 * inflation(s);
        v.skill = 55;
        pushHist(s, e, v.propertyId, 'sold', `Sold to ${v.ownerName}`);
      } else {
        v.closed = 'sold';
        for (const id of [...v.staffIds]) { const w = e.staff[id]; if (w) removeWorker(e, v, w, 'The place was sold', s.week); }
        pushHist(s, e, v.propertyId, 'sold', 'Left the family\'s hands');
      }
    } else if (lot && (lot.status === 'owned' || lot.status === 'leased')) {
      // You bought a rival's or a private owner's place: the records come with it.
      v.closed = 'bought';
      pushHist(s, e, v.propertyId, 'sold', `Sold to the ${s.houseName} family`);
      if (p) p.lotId = undefined;
    } else if (lot && lot.status === 'sale') {
      v.closed = 'sold';
    }
  }
  seedRivals(s, e);
  return made;
}

/** The town's other motels and rooming houses run on the same system (once, then new ones as they open). */
export function seedRivals(s: GameState, e: EmpireState): void {
  const econ = s.econ;
  if (!econ) return;
  const monthly = s.date.d <= 7 || !e.rivalsSeeded;
  if (!monthly) return;
  if (!e.rivalsSeeded) {
    // The Doo Wop boom: a handful of the island's private buildings on the beach blocks are motels.
    const motels = econ.lots.filter((l) => (l.status === 'rival' || l.status === 'private') && l.use === 'motel').length;
    const cands = econ.lots.filter((l) => (l.status === 'private' || l.status === 'rival') && l.stage === 'open' && l.use && !RIVAL_USES[l.use] && ['boardwalk', 'crest', 'north', 'pacific'].includes(l.zone));
    for (const l of cands.slice(0, Math.max(0, 5 - motels))) { l.use = 'motel'; l.tenant = `${l.tenant?.split('\'s')[0] ?? 'a local family'}'s motel`; }
  }
  for (const l of econ.lots) {
    if (l.status !== 'rival' && l.status !== 'private') continue;
    if (l.stage !== 'open' || !l.use || !RIVAL_USES[l.use]) continue;
    if (venueForLot(s, l.id)) continue;
    const owner = l.status === 'rival' ? (l.owner as Venue['owner']) : 'private';
    const ownerName = l.status === 'rival' ? FACTION_NAMES[l.owner as keyof typeof FACTION_NAMES] ?? 'a rival' : (l.tenant?.split('\'s')[0] ?? l.developer ?? 'a local family');
    const look = styleFor(e, l.id);
    const h = { rng: hashSeed(`rv:${l.id}`) };
    const concept = RIVAL_USES[l.use];
    const v = createVenue(s, {
      concept, rooms: roomsFor(l.use, l.id), name: l.name ?? rivalName(l.id, concept), owner, ownerName, zone: l.zone, address: l.address, lotId: l.id,
      builtYear: l.builtYear ?? s.date.y - 10, condition: l.condition, found: randInt(h, 0, 2), ...look,
    });
    v.cash = Math.round(4000 * inflation(s));
    v.skill = randInt(h, 40, 75);
    l.name ??= v.name;
    if (e.rivalsSeeded) e.stats.rivalsOpened++;
  }
  e.rivalsSeeded = true;
}

const RIVAL_NAMES = ['The Sea Gull', 'The Ebb Tide', 'The Bel Air', 'The Sand Castle', 'The Royal Hawaiian', 'The Star Lux', 'The Pan American', 'The Caribbean', 'The Lollipop', 'The Satellite', 'The Astronaut', 'The Imperial 500', 'The Shalimar', 'The Waikiki', 'The Ocean Holiday', 'The Bel-Aire Court'];

function rivalName(id: string, concept: ConceptId): string {
  const h = { rng: hashSeed(`rn:${id}`) };
  const n = pick(h, RIVAL_NAMES);
  return concept === 'rooming' ? `${n.replace('The ', '')} Rooms` : concept === 'boutique' ? `${n} Hotel` : `${n} Motel`;
}

/* ---------------- the week ---------------- */

/** Clears the market and runs every venue's week once (called by whichever hook comes first). */
export function ensureMarket(ctx: Ctx): void {
  const s = ctx.s;
  const e = ensureEmpire(s);
  if (e.marketWeek === s.week) return;
  e.marketWeek = s.week;
  scanVenues(s);
  const live = Object.values(e.venues).filter((v) => !v.closed);
  const bids: Bid[] = [];
  const open: Record<string, boolean> = {};
  for (const v of live) {
    const b = v.opKey && !v.opKey.startsWith('lot:') ? s.businesses.find((x) => x.id === v.opKey) : undefined;
    open[v.id] = isOpenWeek(s, v, b ? isOpen(s, b) : true);
    bids.push(makeBid(s, e, v, open[v.id]));
  }
  clearMarket(s, bids.filter((b) => CONCEPTS[b.v.concept].kind === 'lodging'));
  for (const bid of bids) {
    const v = bid.v;
    const cash = v.owner === 'player' ? s.money : v.cash ?? 0;
    const r = runVenueWeek(s, e, v, bid, open[v.id], cash);
    v.last = r.stat;
    (v as Venue & { lastBuys?: { bought: WeekResult['bought']; replaced: WeekResult['replaced'] } }).lastBuys = { bought: r.bought, replaced: r.replaced };
    if (r.breakdown && v.owner === 'player') ctx.log.push(`${v.name}: ${r.breakdown}.`);
    if (v.owner !== 'player') {
      v.cash = (v.cash ?? 0) + r.stat.noi - r.stat.capex;
      v.capexTotal += r.stat.capex;
      rollup(s, v, r.stat);
    }
  }
}

/** Posts a player venue's statement to the ledger. Returns the revenue for the business line (after any skim). */
function postVenue(ctx: Ctx, v: Venue, revenueByCaller: boolean): { amt: number; label: string } {
  const s = ctx.s;
  const e = s.empire!;
  const st = v.last;
  v.posted = s.week;
  if (!st) return { amt: 0, label: v.name };
  const buys = (v as Venue & { lastBuys?: { bought: WeekResult['bought']; replaced: WeekResult['replaced'] } }).lastBuys;
  let revenue = revenueOf(st);
  // A dishonest manager's hand in the till (hidden; the audit finds it).
  const m = v.opKey ? s.econ?.managers[v.opKey] : undefined;
  if (m && revenue > 0) {
    const skim = Math.round(revenue * managerSkimRate(s, m) * 0.35);
    if (skim > 0) {
      revenue -= skim;
      m.skimmed += skim;
      if (m.charId && s.characters[m.charId]) s.characters[m.charId].wealth += skim;
      const econ = s.econ!;
      if (chance(e, OVERSIGHT[m.oversight].detect) && !econ.cooldowns[`skimflag:${v.opKey}`]) econ.cooldowns[`skimflag:${v.opKey}`] = s.week;
    }
  }
  const parts: string[] = [];
  if (st.rev.rooms) parts.push(`${st.roomNights} room-nights at ${fmtMoney(st.adr)}`);
  if (st.covers) parts.push(`${st.covers} covers`);
  if (st.drinks) parts.push(`${st.drinks} drinks`);
  if (st.clubGuests) parts.push(`${st.clubGuests} at the club`);
  const label = `${v.name}: ${parts.join(', ') || 'takings'}`;
  if (!revenueByCaller && revenue) money(ctx, revenue, label, 'business');
  const x = st.exp;
  const staff = v.staffIds.length;
  if (x.payroll) money(ctx, -x.payroll, `${v.name}: payroll (${staff} staff)`, 'cost');
  const supplies = x.supplies + x.linen + st.cogs;
  if (supplies) {
    const top = (buys?.bought ?? []).slice(0, 3).map((b) => `${Math.round(b.units)} ${CATS[b.cat as ItemCat]?.unit ?? ''}${b.units === 1 ? '' : 's'} of ${b.item.toLowerCase()}`).join(', ');
    money(ctx, -Math.round(supplies), `${v.name}: supplies${top ? ` (${top})` : ''}${x.linen ? ', linen' : ''}${st.cogs ? ', food & liquor' : ''}`, 'cost');
  }
  const opx = Object.entries(x).filter(([k]) => !['payroll', 'supplies', 'linen'].includes(k) && !k.endsWith('Adequacy')).reduce((a, [, n]) => a + n, 0);
  if (opx) money(ctx, -Math.round(opx), `${v.name}: utilities ${fmtMoney(x.utilities)}, upkeep ${fmtMoney(x.maintenance)}, taxes & insurance ${fmtMoney(x.taxes + x.insurance)}, licenses ${fmtMoney(x.licenses)}, office & commissions ${fmtMoney((x.admin ?? 0) + (x.commissions ?? 0))}${x.marketing ? `, ads ${fmtMoney(x.marketing)}` : ''}${x.entertainment ? `, the act ${fmtMoney(x.entertainment)}` : ''}`, 'cost');
  if (st.capex) money(ctx, -st.capex, `${v.name}: replaced ${(buys?.replaced ?? []).map((r) => `${r.units} ${CATS[r.cat as ItemCat]?.unit ?? 'units'}s`).join(', ')} (capital)`, 'cost');
  if (m && m.share > 0 && st.noi > 0) {
    const share = Math.round(st.noi * m.share);
    if (share > 0) money(ctx, -share, `Manager's share: ${m.name} (${Math.round(m.share * 100)}% of ${v.name}'s profit)`, 'cost');
  }
  const c = CONCEPTS[v.concept];
  if (c.heat && st.open) heat(ctx, 'local', c.heat, `${v.name}: the vice squad keeps an eye on short stays`, 'heat');
  // HOOK (later phase): the nightlife network operating here under an arrangement with the house.
  if (v.policy.network && st.open) {
    const cut = Math.round(Object.values(st.guests).reduce((a, g) => a + g, 0) * 0.03 * inflation(s));
    if (cut) money(ctx, cut, `${v.name}: the nightlife network's arrangement (abstract)`, 'business');
    heat(ctx, 'local', 0.3, `${v.name}: vice talk about the hotel bar`, 'heat');
  }
  v.capexTotal += st.capex;
  rollup(s, v, st);
  return { amt: revenueByCaller ? revenue : 0, label };
}

/** Hook for economy.runBusinesses: a venue's business posts its own statement; the caller posts the takings. */
export function venueBusiness(ctx: Ctx, b: Business): { amt: number; label: string } | undefined {
  if (!BIZ_CONCEPT[b.kind]) return undefined;
  ensureMarket(ctx);
  const v = venueByKey(ctx.s, b.id);
  if (!v || v.posted === ctx.s.week) return v ? { amt: 0, label: v.name } : undefined;
  return postVenue(ctx, v, true);
}

/** Hook for expectedTake: what the venue made last week (its operating income). */
export function venueTake(s: GameState, b: Business): number | undefined {
  if (!BIZ_CONCEPT[b.kind] || !s.empire) return undefined;
  const v = venueByKey(s, b.id);
  return v ? Math.round(v.last?.noi ?? 0) : undefined;
}

/** The empire's week (after the old economy): post the rest, projects, the managers, staff, rivals. */
export function empireWeek(ctx: Ctx): void {
  const s = ctx.s;
  ensureMarket(ctx);
  const e = s.empire!;
  for (const v of playerVenues(s)) if (v.posted !== s.week) postVenue(ctx, v, false);
  projectsWeek(ctx);
  const log: string[] = [];
  for (const v of Object.values(e.venues)) {
    if (v.closed) continue;
    const want = managerWeek(s, e, v, log);
    if (want.start) startProject(s, e, v, want.start, want.param, 'manager');
    const g = gripes(s, e, v);
    v.gripe = g.length ? v.gripe + 1 : Math.max(0, v.gripe - 1);
    if (v.owner === 'player' && v.gripe >= 10 && v.opKey && s.econ?.managers[v.opKey] && chance(e, 0.05)) {
      const m = s.econ.managers[v.opKey];
      delete s.econ.managers[v.opKey];
      v.gripe = 0;
      const text = `${m.name} quit as manager of ${v.name}: "${g[0]}."`;
      ctx.log.push(text);
      hist(s, e, v, 'staff', text);
    }
  }
  if (s.date.d <= 7) staffMonth(ctx);
  rivalsMonth(ctx);
  syncDesigns(s);
  for (const t of log.slice(0, 3)) ctx.log.push(t);
}

/** Pays the projects week by week; finishes them. */
function projectsWeek(ctx: Ctx): void {
  const s = ctx.s;
  const e = s.empire!;
  for (const p of Object.values(e.projects)) {
    if (p.status === 'done') continue;
    const v = e.venues[p.venueId];
    const def = PROJECTS_BY_ID[p.defId];
    if (!v || v.closed || !def) { delete e.projects[p.id]; continue; }
    const pay = Math.min(p.cost - p.paid, Math.ceil(p.cost / p.weeks));
    if (v.owner === 'player') {
      if (s.money - pay < 3000) { p.status = 'waiting'; continue; }
      money(ctx, -pay, `${v.name}: ${def.name.toLowerCase()} (week ${p.weeks - p.weeksLeft + 1} of ${p.weeks}, capital)`, 'cost');
      v.capexTotal += pay;
      const mo = v.months[v.months.length - 1];
      if (mo) mo.capex += pay;
      const yr = v.years[v.years.length - 1];
      if (yr) yr.capex += pay;
    } else {
      if ((v.cash ?? 0) < pay) { p.status = 'waiting'; continue; }
      v.cash = (v.cash ?? 0) - pay;
      v.capexTotal += pay;
    }
    p.status = 'active';
    p.paid += pay;
    p.weeksLeft--;
    if (p.weeksLeft <= 0) finishProject(ctx, v, p);
  }
  for (const [id, p] of Object.entries(e.projects)) if (p.status === 'done' && s.week - p.started > 260) delete e.projects[id];
}

function finishProject(ctx: Ctx, v: Venue, p: Project): void {
  const s = ctx.s;
  const e = s.empire!;
  const def = PROJECTS_BY_ID[p.defId];
  const text = def.apply(s, e, v, p.param);
  p.status = 'done';
  p.closes = 0;
  if (def.once || ['pool', 'dining', 'lounge', 'club', 'spa', 'laundry', 'ac', 'tv', 'insulation'].includes(def.id)) if (!v.amenities.includes(def.id)) v.amenities.push(def.id);
  const prop = e.properties[v.propertyId];
  if (prop) prop.value = Math.round(prop.value + p.cost * 0.7);
  e.stats.projects++;
  hist(s, e, v, def.kind === 'conversion' ? 'converted' : 'renovated', `${text} (${fmtMoney(p.cost)})`);
  if (['restyle', 'wing', 'floor', 'paint', 'pool', 'to_boutique', 'to_resort', 'to_hourly', 'to_budget', 'club', 'dining'].includes(def.id)) snapshot(s, e, v, text);
  if (v.owner === 'player') {
    ctx.log.push(`${v.name}: ${text}.`);
    s.chronicle.push({ week: s.week, date: { ...s.date }, text: `${v.name}: ${text}.`, kind: 'misc' });
    const b = venueBuilding(e, v);
    if (def.id === 'restyle' && b?.style) respect(ctx, STYLES[b.style].prestige, `${v.name}: the new ${STYLES[b.style].name} look turns heads`, 'event');
    if (def.kind === 'conversion' || def.kind === 'building') respect(ctx, 1, `${v.name}: ${text.toLowerCase()}`, 'event');
  }
}

/** Starts a project (no money yet: it is paid week by week). */
export function startProject(s: GameState, e: EmpireState, v: Venue, defId: string, param: string | undefined, by: 'owner' | 'manager'): Project | undefined {
  const o = projectOptions(s, e, v, param).find((x) => x.def.id === defId);
  if (!o || o.why) return undefined;
  const p: Project = { id: xid(e, 'pj'), venueId: v.id, defId, started: s.week, weeks: o.weeks, weeksLeft: o.weeks, cost: o.cost, paid: 0, closes: o.closes, param, status: 'active', by };
  e.projects[p.id] = p;
  v.proposals = v.proposals.filter((x) => x !== defId);
  hist(s, e, v, 'note', `${by === 'manager' ? 'The manager started' : 'Started'}: ${o.def.name.toLowerCase()} (${fmtMoney(o.cost)}, ${o.weeks} weeks)`);
  return p;
}

/** Staff live their lives: satisfaction, skill, training, quitting, the ambitious leaving to compete. */
function staffMonth(ctx: Ctx): void {
  const s = ctx.s;
  const e = s.empire!;
  for (const w of Object.values(e.staff)) {
    const v = e.venues[w.venueId];
    if (!v || v.closed) { delete e.staff[w.id]; continue; }
    const d = e.depts[w.deptId];
    if (!d) { removeWorker(e, v, w, 'Department closed', s.week); continue; }
    const market = Math.round(DEPTS[d.kind].wage * (w.role === 'head' ? 1.45 : 1) * inflation(s));
    const st = v.last;
    const adq = d.kind === 'housekeeping' ? st?.exp.hkAdequacy ?? 1 : d.kind === 'front' ? st?.exp.frontAdequacy ?? 1 : 1;
    const head = d.headId && d.headId !== w.id ? e.staff[d.headId] : undefined;
    let target = 55 + (w.wage / market - 1) * 90 + (Math.min(1, adq) - 1) * 60 + (head ? (head.skill - 50) / 5 : 0) + (v.policy.training ? 6 : 0);
    if (head?.charId && head.skill < 45) target -= 8;
    w.satisfaction = Math.round(Math.max(0, Math.min(100, w.satisfaction + (target - w.satisfaction) * 0.3)));
    w.xp += 4;
    const grow = 0.4 + (v.policy.training && w.role === 'head' ? 0.6 : 0);
    w.skill = Math.min(95, Math.round((w.skill + grow * (w.skill < 70 ? 1 : 0.4)) * 10) / 10);
    if (v.policy.training && w.role === 'head') w.trained += 4;
    if (w.charId) continue;
    const quit = 0.012 + Math.max(0, 55 - w.satisfaction) / 500 + (w.ambition > 75 && w.skill > 60 ? 0.008 : 0);
    if (chance(e, quit)) {
      const why = w.satisfaction < 40 ? 'Quit: overworked and underpaid' : w.ambition > 75 ? 'Left for a better job up the Boardwalk' : 'Moved on';
      removeWorker(e, v, w, why, s.week);
      e.stats.quits++;
      if (w.role === 'head' && v.owner === 'player') ctx.log.push(`${w.name}, ${DEPTS[d.kind].head.toLowerCase()} at ${v.name}, ${why.toLowerCase()}.`);
      // The ambitious ones open a place of their own.
      if (w.role === 'head' && w.ambition > 80 && w.skill > 65 && s.week - w.since > 52 && chance(e, 0.35)) spinoff(ctx, v, w.name);
    }
  }
}

/** A former head of yours opens a competing motel (Module 6: independent career ambitions). */
function spinoff(ctx: Ctx, from: Venue, name: string): void {
  const s = ctx.s;
  const e = s.empire!;
  const lot = s.econ?.lots.find((l) => l.status === 'sale' && !l.use && ['boardwalk', 'crest', 'north', 'pacific', 'downtown'].includes(l.zone));
  if (!lot) return;
  lot.status = 'private';
  lot.owner = 'private';
  lot.use = 'motel';
  lot.stage = 'open';
  lot.builtYear = s.date.y;
  lot.condition = 100;
  lot.developer = name;
  const last = name.split(' ').slice(-1)[0];
  lot.name = `The ${last} Motor Inn`;
  lot.tenant = `${name}'s motel`;
  const v = createVenue(s, { concept: 'budget_motel', rooms: 18, name: lot.name, owner: 'private', ownerName: name, zone: lot.zone, address: lot.address, lotId: lot.id, builtYear: s.date.y, condition: 100, found: 1, style: 'doowop', sign: 'turquoise' });
  v.cash = Math.round(2000 * inflation(s));
  v.skill = 70;
  e.stats.spinoffs++;
  const text = `${name}, who learned the trade at ${from.name}, opened ${lot.name} on ${lot.address}.`;
  ctx.log.push(text);
  s.chronicle.push({ week: s.week, date: { ...s.date }, text, kind: 'misc' });
}

/** Rivals in trouble close and sell; rivals flush with cash fix up. */
function rivalsMonth(ctx: Ctx): void {
  const s = ctx.s;
  const e = s.empire!;
  for (const v of rivalVenues(s)) {
    v.redWeeks = (v.cash ?? 0) < -3000 * inflation(s) ? (v.redWeeks ?? 0) + 1 : 0;
    if ((v.redWeeks ?? 0) >= 40) {
      v.closed = 'bankrupt';
      e.stats.rivalsClosed++;
      const p = e.properties[v.propertyId];
      const lot = p?.lotId ? s.econ?.lots.find((l) => l.id === p.lotId) : undefined;
      if (lot && lot.status !== 'owned' && lot.status !== 'leased') { lot.status = 'sale'; lot.owner = 'private'; lot.tenant = undefined; }
      for (const id of [...v.staffIds]) { const w = e.staff[id]; if (w) removeWorker(e, v, w, 'The place went under', s.week); }
      pushHist(s, e, v.propertyId, 'closed', `${v.name} went under; the bank put it up for sale`);
      ctx.log.push(`${v.name} (${v.ownerName}) went under and is for sale.`);
    }
  }
}

/** The map reads the econ design records: keep them in step with the buildings (the authoritative record). */
function syncDesigns(s: GameState): void {
  const e = s.empire!;
  for (const v of playerVenues(s)) {
    const b = venueBuilding(e, v);
    if (!b || !v.opKey) continue;
    const d = s.econ?.designs?.[v.opKey];
    if (d?.style === b.style && d?.sign === b.sign) continue;
    const dm = designMut(s, v.opKey);
    if (b.style) dm.style = b.style;
    if (b.sign) dm.sign = b.sign;
  }
}

/* ---------------- commands ---------------- */

export type EmpireCmd =
  | { cmd: 'plan'; key: string; plan: Plan }
  | { cmd: 'setup'; venueId: string; concept?: ConceptId; presetId?: string; mode?: Mode; style?: BuildStyle; sign?: SignColor; name?: string }
  | { cmd: 'mode'; venueId: string; mode: Mode }
  | { cmd: 'preset'; venueId: string; presetId: string }
  | { cmd: 'savePreset'; venueId: string; name: string }
  | { cmd: 'policy'; venueId: string; patch: Partial<Omit<OperatingPolicy, 'rates' | 'supplies' | 'mode'>> }
  | { cmd: 'rate'; venueId: string; room: RoomType; rate: number }
  | { cmd: 'supply'; venueId: string; cat: ItemCat; item: string }
  | { cmd: 'supplier'; venueId: string; group: SupplyGroup; supplierId: string }
  | { cmd: 'project'; venueId: string; defId: string; param?: string }
  | { cmd: 'cancelProject'; projectId: string }
  | { cmd: 'dismiss'; venueId: string; defId: string }
  | { cmd: 'hire'; venueId: string; dept: DeptKind; n?: number; seasonal?: boolean }
  | { cmd: 'staffToTarget'; venueId: string }
  | { cmd: 'fire'; empId: string }
  | { cmd: 'head'; venueId: string; dept: DeptKind; charId?: string; source?: 'family' | 'crew'; empId?: string; pro?: boolean }
  | { cmd: 'wage'; empId: string; wage: number }
  | { cmd: 'spaceStatus'; spaceId: string; status: 'open' | 'closed' };

export function cmdVenue(s: GameState, c: EmpireCmd): Venue | undefined {
  if (!('venueId' in c)) return undefined;
  const v = s.empire?.venues[c.venueId];
  return v && v.owner === 'player' && !v.closed ? v : undefined;
}

/** Why a command cannot be given (undefined when it can). */
export function cmdBlocked(s: GameState, c: EmpireCmd): string | undefined {
  const e = s.empire;
  if (c.cmd === 'plan') return undefined;
  if (c.cmd === 'cancelProject') return e?.projects[c.projectId] && e.venues[e.projects[c.projectId].venueId]?.owner === 'player' ? undefined : 'No such project';
  if (c.cmd === 'fire' || c.cmd === 'wage') { const w = e?.staff[c.empId]; return w && e?.venues[w.venueId]?.owner === 'player' ? undefined : 'Not on your payroll'; }
  if (c.cmd === 'spaceStatus') { const sp = e?.spaces[c.spaceId]; return sp ? undefined : 'No such space'; }
  const v = cmdVenue(s, c);
  if (!v) return 'Not yours';
  if (c.cmd === 'project') return projectOptions(s, e!, v, c.param).find((o) => o.def.id === c.defId)?.why ?? (PROJECTS_BY_ID[c.defId] ? undefined : 'No such project');
  if (c.cmd === 'supply') { const it = ITEMS_BY_ID[c.item]; return !it || it.cat !== c.cat ? 'No such item' : !itemAvailable(it, s.date.y) ? 'Not on the market this year' : undefined; }
  if (c.cmd === 'supplier') { const sp = SUPPLIERS.find((x) => x.id === c.supplierId); return !sp || sp.group !== c.group ? 'No such supplier' : sp.needsKind && !s.businesses.some((b) => b.owner === 'player' && b.kind === sp.needsKind) ? 'You need to own one first' : undefined; }
  if (c.cmd === 'setup' && c.concept && !LODGING.includes(c.concept) && CONCEPTS[v.concept].kind === 'lodging') return 'A hotel converts through a project';
  if (c.cmd === 'head' && c.charId) { const ch = s.characters[c.charId]; return ch?.alive ? undefined : 'Gone'; }
  return undefined;
}

/** Applies a command to a state you may mutate (the order's commit, or the UI's copy). */
export function runCmd(s: GameState, c: EmpireCmd): string {
  const e = ensureEmpire(s);
  if (cmdBlocked(s, c)) return '';
  switch (c.cmd) {
    case 'plan': e.plans[c.key] = { ...e.plans[c.key], ...c.plan }; return 'Plan saved';
    case 'cancelProject': {
      const p = e.projects[c.projectId];
      p.status = 'done';
      p.closes = 0;
      delete e.projects[c.projectId];
      return 'Project cancelled (what was paid is spent)';
    }
    case 'fire': {
      const w = e.staff[c.empId];
      const v = e.venues[w.venueId];
      removeWorker(e, v, w, 'Fired', s.week);
      return `${w.name} fired`;
    }
    case 'wage': { const w = e.staff[c.empId]; w.wage = Math.max(5, Math.round(c.wage)); return `${w.name}: ${fmtMoney(w.wage)}/wk`; }
    case 'spaceStatus': { e.spaces[c.spaceId].status = c.status; return c.status === 'open' ? 'Reopened' : 'Closed off'; }
    default: break;
  }
  const v = cmdVenue(s, c)!;
  switch (c.cmd) {
    case 'setup': {
      if (c.name?.trim()) {
        v.name = c.name.trim().slice(0, 40);
        const b = s.businesses.find((x) => x.id === v.opKey);
        if (b) b.name = v.name;
        const lot = s.econ?.lots.find((l) => l.id === e.properties[v.propertyId]?.lotId);
        if (lot) lot.name = v.name;
      }
      if (c.mode) v.policy.mode = c.mode;
      if (c.presetId) { const p = presetById(e, c.presetId); if (p) applyPreset(s, e, v, p); }
      // The look is free while setting up (it was part of the deal); later it is a restyle project.
      const b = venueBuilding(e, v);
      if (b && !v.setup) { if (c.style) b.style = c.style; if (c.sign) b.sign = c.sign; snapshot(s, e, v, 'Set up'); }
      v.setup = true;
      syncDesigns(s);
      return `${v.name} is set up`;
    }
    case 'mode': v.policy.mode = c.mode; if (c.mode !== 'micro') chooseSupplies(s, e, v); return `Mode: ${c.mode}`;
    case 'preset': { const p = presetById(e, c.presetId); if (p) applyPreset(s, e, v, p); return `Preset: ${p?.name}`; }
    case 'savePreset': {
      const id = `u${e.nextId++}`;
      e.presets[id] = presetFrom(v, id, c.name.trim().slice(0, 30) || `${v.name}'s way`);
      return `Saved preset "${e.presets[id].name}"`;
    }
    case 'policy': Object.assign(v.policy, c.patch); if (c.patch.supplyTier !== undefined && v.policy.mode !== 'micro') chooseSupplies(s, e, v); v.policy.presetId = undefined; return 'Policy changed';
    case 'rate': v.policy.rates[c.room] = Math.max(0.5, Math.round(c.rate * 4) / 4); return `Rate set`;
    case 'supply': v.policy.supplies[c.cat] = c.item; if (v.stock[c.cat]) v.stock[c.cat].item = c.item; return `${CATS[c.cat].name}: ${ITEMS_BY_ID[c.item].name}`;
    case 'supplier': {
      const cur = Object.values(e.contracts).find((x) => x.venueId === v.id && x.group === c.group);
      if (cur) { cur.supplierId = c.supplierId; cur.since = s.week; } else { const id = xid(e, 'sc'); e.contracts[id] = { id, venueId: v.id, group: c.group, supplierId: c.supplierId, since: s.week }; }
      return 'Supplier changed';
    }
    case 'project': { const p = startProject(s, e, v, c.defId, c.param, 'owner'); return p ? `${PROJECTS_BY_ID[c.defId].name} started` : ''; }
    case 'dismiss': v.proposals = v.proposals.filter((x) => x !== c.defId); return 'Not now';
    case 'hire': {
      const d = deptOf(e, v, c.dept);
      if (!d) return '';
      for (let i = 0; i < Math.max(1, Math.min(10, c.n ?? 1)); i++) newWorker(s, e, v, d, { seasonal: c.seasonal });
      return `Hired for ${DEPTS[c.dept].name.toLowerCase()}`;
    }
    case 'staffToTarget': {
      const f = forecastWeek(s, e, v);
      for (const id of v.deptIds) {
        const d = e.depts[id];
        const t = staffTarget(e, v, d.kind, f);
        while (deptStaff(e, d).length < t) newWorker(s, e, v, d, { seasonal: f.inSeason });
      }
      return 'Staffed for the week ahead';
    }
    case 'head': {
      const d = deptOf(e, v, c.dept);
      if (!d) return '';
      if (c.charId) {
        const ch = s.characters[c.charId];
        charHead(s, e, v, d, ch, c.source ?? (ch.dynasty ? 'family' : 'crew'));
        hist(s, e, v, 'staff', `${ch.firstName} ${ch.lastName} now heads ${DEPTS[c.dept].name.toLowerCase()}`);
        return `${ch.firstName} heads ${DEPTS[c.dept].name.toLowerCase()}`;
      }
      if (c.empId) { const w = promote(s, e, v, d, c.empId); return w ? `${w.name} promoted` : ''; }
      if (c.pro) { dismissHead(e, v, d, 'replaced'); const w = newWorker(s, e, v, d, { head: true }); return `${w.name} hired as ${DEPTS[c.dept].head.toLowerCase()}`; }
      dismissHead(e, v, d, 'stepped down');
      return 'Head stepped down';
    }
    default: return '';
  }
}

/** The UI's way: apply a configuration command at once to a copy of the state. */
export function applyEmpireCmd(s: GameState, c: EmpireCmd): GameState {
  const n = structuredClone(s);
  runCmd(n, c);
  return n;
}

export function previewEmpire(s: GameState, c: EmpireCmd): ActionPreview {
  const v = 'venueId' in c ? s.empire?.venues[c.venueId] : undefined;
  const title = c.cmd === 'project' ? `${v?.name ?? 'Venue'}: ${PROJECTS_BY_ID[c.defId]?.name ?? c.defId}` : `${v?.name ?? 'Empire Designer'}: ${c.cmd}`;
  const o = c.cmd === 'project' && v && s.empire ? projectOptions(s, s.empire, v, c.param).find((x) => x.def.id === c.defId) : undefined;
  return {
    title,
    detail: o ? `${o.def.effect}. ${fmtMoney(o.cost)} over ${o.weeks} weeks, paid as the work goes.` : 'A change to how the place is run.',
    effects: [{ type: 'econ', op: { op: 'note', text: o ? `${fmtMoney(o.cost)} over ${o.weeks} weeks (capital)` : 'Takes effect next week' }, label: title }],
    cost: 0, because: title.toLowerCase(), disabledReason: cmdBlocked(s, c), category: 'event',
  };
}

export function commitEmpire(ctx: Ctx, c: EmpireCmd): void {
  const t = runCmd(ctx.s, c);
  if (t) ctx.log.push(t);
}

/* ---------------- the random player's orders ---------------- */

/** A few designer orders the house could give now (Owner mode: approve the manager's projects, now and then a preset). */
export function empireActions(s: GameState): PlayerAction[] {
  const out: PlayerAction[] = [];
  const e = s.empire;
  if (!e) return out;
  for (const v of playerVenues(s)) {
    for (const id of v.proposals.slice(0, 2)) {
      const o = projectOptions(s, e, v).find((x) => x.def.id === id);
      if (o && !o.why && o.cost * 3 < s.money) out.push({ kind: 'econ', op: { type: 'empire', cmd: { cmd: 'project', venueId: v.id, defId: id } } });
    }
    if (s.week % 11 === 0 && v.policy.presetId === 'balanced' && (v.last?.sat ?? 50) > 60 && s.money > 20000) out.push({ kind: 'econ', op: { type: 'empire', cmd: { cmd: 'preset', venueId: v.id, presetId: 'quality' } } });
  }
  return out;
}

/* ---------------- read-outs for the hub ---------------- */

export function venueProblems(s: GameState, v: Venue): string[] {
  const e = s.empire!;
  return [...layoutProblems(e, v, s.date.y), ...gripes(s, e, v)];
}

export function venueSummary(s: GameState, v: Venue) {
  const e = s.empire!;
  const y = v.years.find((x) => x.key === String(s.date.y));
  const prev = v.years.find((x) => x.key === String(s.date.y - 1));
  return { rooms: roomCount(e, v), staff: v.staffIds.length, rep: Math.round(v.reputation), stars: Math.max(1, Math.min(5, Math.round(v.reputation / 20))), ytd: y, lastYear: prev, mgr: managerSkill(s, v) };
}

export { presetsOf, rand, lotName };
