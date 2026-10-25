import { isInSeason, laborDay, memorialDay, monthKey, toDays } from './calendar';
import { CATS, CAT_IDS, ITEMS_BY_ID, itemQ, type ItemCat } from './empireCatalog';
import { catApplies, deptOf, durableUnits, roomCount, roomsByType, seatsOf, venueBuilding, venueSpaces } from './empireBuild';
import { CONCEPTS, HOUSEKEEPING, MAINTENANCE, SEGMENTS, SEGMENT_IDS, SUPPLIERS, type SegmentId } from './empireData';
import { DURABLE_SCALE } from './empireProjects';
import { adequacy, deptStaff, headMult, workload } from './empireStaff';
import { ROOM_TYPES, type DeptKind, type EmpireState, type PeriodStat, type RoomType, type SupplyGroup, type Venue, type WeekStat } from './empireState';
import { STYLES } from './design';
import { inflation } from './property';
import { chance, rand, randInt } from './rng';
import type { GameDate, GameState } from './types';

/**
 * The operating engine (Module 9): every venue's week, player's and rivals'
 * alike. Demand comes from the season (Wildwood's summer is everything),
 * guest segments that weigh price, quality, reputation, style, amenities
 * and the neighborhood, and the competition: the venues the game simulates
 * plus the rest of the island's motels. Revenue is room-nights × rate,
 * covers × check, drinks × price, guests × cover. Costs are payroll, the
 * supplies actually used and reordered, the linen, utilities, upkeep, taxes,
 * insurance, licenses and marketing. Capital (projects, replacements) is
 * kept apart. Nothing here touches the treasury: `empire.ts` posts each
 * player venue's statement to the ledger by name.
 */

/* ---------------- the season ---------------- */

/** Tourist demand this week (1 = the height of August). */
export function seasonCurve(d: GameDate): number {
  const t = toDays(d);
  const md = toDays(memorialDay(d.y));
  const ld = toDays(laborDay(d.y));
  if (t >= md && t < ld) {
    if (t < md + 14) return 0.72;
    if (d.m === 6) return 0.88;
    if (t >= ld - 7) return 0.85;
    return 1;
  }
  if (t >= ld && t < ld + 21) return 0.3;
  if (d.m === 5) return 0.22;
  if (d.m === 9) return 0.18;
  if (d.m === 10) return 0.1;
  if (d.m === 4) return 0.08;
  return 0.04;
}

/** Off-season price (the share of peak rates the market pays). */
export function marketPriceFactor(d: GameDate): number {
  const c = seasonCurve(d);
  return c >= 0.7 ? 1 : c >= 0.25 ? 0.75 : 0.6;
}

/** Closed for the winter (the policy says so and the calendar agrees). */
export function winterClosed(v: Venue, d: GameDate): boolean {
  if (v.policy.winter !== 'close') return false;
  return (d.m === 10 && d.d >= 15) || d.m >= 11 || d.m <= 4;
}

/** Rooms on the island (the market the simulated venues share). */
export function islandRooms(y: number): number {
  return 2400 + 150 * Math.min(14, Math.max(0, y - 1960));
}

/** The shore's economy: good years and bad. */
export function economyFactor(y: number): number {
  if (y >= 1974 && y <= 1975) return 0.85;
  if (y >= 1980 && y <= 1982) return 0.88;
  return 1 + Math.min(0.1, Math.max(0, y - 1960) * 0.006);
}

/* ---------------- what the place offers ---------------- */

const qOf = (v: Venue, cat: ItemCat, y: number) => {
  const d = v.durables[cat] ?? (v.stock[cat] ? { item: v.stock[cat].item, wear: 0 } : undefined);
  const it = d ? ITEMS_BY_ID[d.item] : undefined;
  return it ? itemQ(it, y) * (1 - (d!.wear ?? 0) / 220) : 0;
};

/** Amenity strengths (0..1) the guests weigh. */
export function amenities(e: EmpireState, v: Venue, y: number): Record<string, number> {
  const a: Record<string, number> = {};
  const sp = venueSpaces(e, v).filter((x) => x.construction === 'done');
  if (sp.some((x) => x.type === 'pool')) a.pool = v.stock.pool_chemicals?.short ? 0.6 : 1;
  const ac = v.durables.aircon ? ITEMS_BY_ID[v.durables.aircon.item] : undefined;
  if (ac && ac.price > 30) a.ac = ac.id === 'ac_ptac' ? 1 : 0.85;
  const tv = v.durables.tv?.item;
  if (tv && tv !== 'tv_none') { a.tv = 1; if (tv !== 'tv_bw') a.color_tv = 1; }
  const ph = v.durables.phone?.item;
  if (ph && ph !== 'ph_lobby') a.phone = ph === 'ph_direct' ? 1 : 0.7;
  if (seatsOf(e, v, 'dining')) a.dining = Math.min(1, 0.4 + foodQ(e, v, y) / 120);
  if (seatsOf(e, v, 'lounge')) a.lounge = 1;
  if (seatsOf(e, v, 'club')) a.club = Math.min(1, 0.4 + clubQ(e, v, y) / 120);
  if (sp.some((x) => x.type === 'spa')) a.spa = 1;
  if (sp.some((x) => x.type === 'parking')) a.parking = 1;
  return a;
}

const ROOM_CATS: ItemCat[] = ['mattress', 'pillows', 'sheets', 'blankets', 'bedframe', 'towels', 'furniture', 'fixtures', 'carpet', 'tv', 'aircon', 'phone', 'toilet_paper', 'soap', 'shampoo'];

/** The room product (0..100): what the guest sleeps on, washes with, sits in. */
export function roomQ(v: Venue, y: number): number {
  let w = 0;
  let q = 0;
  for (const cat of ROOM_CATS) {
    if (!v.durables[cat] && !v.stock[cat]) continue;
    const c = CATS[cat];
    w += c.weight;
    let x = qOf(v, cat, y);
    if (c.kind === 'consumable' && v.stock[cat] && v.last?.shortages.includes(cat)) x = 0;
    q += c.weight * x;
  }
  return w ? q / w : 50;
}

export function foodQ(e: EmpireState, v: Venue, y: number): number {
  const parts: [ItemCat, number][] = [['ingredients', 0.5], ['kitchen', 0.2], ['tableware', 0.15], ['glassware', 0.08], ['uniforms', 0.07]];
  const base = parts.reduce((a, [c, wt]) => a + wt * (v.durables[c] || v.stock[c] ? qOf(v, c, y) : 40), 0);
  return base * headMult(e, deptOf(e, v, 'kitchen'));
}

export function clubQ(e: EmpireState, v: Venue, y: number): number {
  const parts: [ItemCat, number][] = [['sound', 0.3], ['lighting', 0.25], ['stage', 0.2], ['seating', 0.25]];
  return parts.reduce((a, [c, wt]) => a + wt * (v.durables[c] ? qOf(v, c, y) : 40), 0) * headMult(e, deptOf(e, v, 'club'));
}

/** The booking manager's reach: which tier of act he can land (0 local band .. 3 a headliner). */
export function actTier(e: EmpireState, v: Venue): number {
  const d = deptOf(e, v, 'club');
  const h = d?.headId ? e.staff[d.headId] : undefined;
  if (!h) return 0;
  return h.skill >= 80 ? 3 : h.skill >= 62 ? 2 : h.skill >= 42 ? 1 : 0;
}

/** The overall quality guests experience (0..100), from the last week's operations. */
export function venueQuality(s: GameState, e: EmpireState, v: Venue, ops?: { hk: number; front: number }): number {
  const y = s.date.y;
  const b = venueBuilding(e, v);
  const sp = venueSpaces(e, v);
  const cond = (b?.condition ?? 70) * 0.5 + (sp.length ? sp.reduce((a, x) => a + x.condition, 0) / sp.length : 70) * 0.5;
  const mgr = managerSkill(s, v);
  const front = ops?.front ?? 1;
  const service = Math.max(0, Math.min(100, 45 * Math.min(1.1, front) * headMult(e, deptOf(e, v, 'front')) + (mgr - 40) * 0.5 + 15));
  const shortPenalty = (v.last?.shortages ?? []).filter((c) => CATS[c as ItemCat]?.critical).length * 6;
  if (CONCEPTS[v.concept].kind !== 'lodging') {
    const core = CONCEPTS[v.concept].kind === 'food' ? foodQ(e, v, y) : CONCEPTS[v.concept].kind === 'club' ? clubQ(e, v, y) : qOf(v, 'liquor', y) * 0.6 + qOf(v, 'bar_equipment', y) * 0.4;
    return Math.max(0, Math.min(100, 0.5 * core + 0.25 * cond + 0.25 * service - shortPenalty));
  }
  const hk = ops?.hk ?? 1;
  const cleanQ = HOUSEKEEPING[v.policy.housekeeping].quality * Math.min(1, hk) * (0.8 + 0.4 * qOf(v, 'cleaning', y) / 100) * headMult(e, deptOf(e, v, 'housekeeping'));
  return Math.max(0, Math.min(100, 0.38 * roomQ(v, y) + 0.25 * cleanQ + 0.2 * cond + 0.17 * service - shortPenalty));
}

/** The manager's skill: the econ manager for your places, the owner's man for rivals; a night clerk otherwise. */
export function managerSkill(s: GameState, v: Venue): number {
  if (v.owner !== 'player') return v.skill ?? 50;
  const m = v.opKey ? s.econ?.managers[v.opKey] : undefined;
  return m ? m.skill * (m.effort ?? 1) : 35;
}

/* ---------------- prices ---------------- */

export function seasonRate(v: Venue, rt: RoomType, d: GameDate): number {
  const peak = v.policy.rates[rt] ?? v.policy.rates.room_std ?? 0;
  const c = seasonCurve(d);
  return peak * (c >= 0.7 ? 1 : c >= 0.25 ? Math.min(1, v.policy.offPct + 0.15) : v.policy.offPct);
}

/** What a segment pays at this venue (upscale guests take the suites). */
function segRate(v: Venue, seg: SegmentId, d: GameDate, rooms: Record<RoomType, number>): number {
  if (seg === 'hourly') return seasonRate(v, 'room_hourly', d);
  const up = SEGMENTS[seg].upscale;
  const std = rooms.room_std ? seasonRate(v, 'room_std', d) : rooms.room_deluxe ? seasonRate(v, 'room_deluxe', d) : seasonRate(v, 'room_hourly', d) * 1.6;
  const upr = rooms.suite && rooms.room_deluxe ? (seasonRate(v, 'suite', d) + seasonRate(v, 'room_deluxe', d)) / 2 : rooms.suite ? seasonRate(v, 'suite', d) : rooms.room_deluxe ? seasonRate(v, 'room_deluxe', d) : std;
  return up * upr + (1 - up) * std;
}

/* ---------------- the market ---------------- */

export interface Bid {
  v: Venue;
  cap: number;
  hourlyCap: number;
  u: Record<SegmentId, number>;
  price: Record<SegmentId, number>;
  got: Record<SegmentId, number>;
  quality: number;
}

/** A guest segment's utility for a venue (logit). */
export function utility(s: GameState, e: EmpireState, v: Venue, seg: SegmentId, price: number, quality: number, am: Record<string, number>): number {
  const g = SEGMENTS[seg];
  const infl = inflation(s);
  const ref = g.ref * infl * marketPriceFactor(s.date);
  const rel = Math.max(0.2, price) / ref;
  // Past a point it is not a choice: a family from Kensington cannot pay resort rates.
  let u = -g.price * Math.log(rel) - Math.max(0, rel - 1.35) ** 2 * g.price * 1.5;
  u += g.quality * (quality - 55) / 25;
  u += g.rep * (v.reputation - 50) / 25;
  for (const [k, w] of Object.entries(g.likes)) u += (w ?? 0) * (am[k] ?? 0);
  const b = venueBuilding(e, v);
  if (b?.style) u += STYLES[b.style].draw * 2 + (g.styles[b.style] ?? 0);
  const zone = e.properties[v.propertyId]?.zone;
  if (zone) u += g.zones[zone] ?? 0;
  u += CONCEPTS[v.concept].fit[seg] ?? 0;
  u += ((b?.condition ?? 70) - 70) / 60 * 0.4;
  const rooms = Math.max(1, roomCount(e, v));
  u += Math.log(1 + v.policy.marketing / (rooms * 0.5 * infl)) * 0.15;
  if (b?.elevator && (seg === 'business' || seg === 'luxury')) u += 0.1;
  if (b?.ramps && seg === 'business') u += 0.05;
  if (v.amenities.includes('keycards') && seg === 'business') u += 0.1;
  return u;
}

/** How common an amenity is among the island's other motels this year (they keep up too). */
export function penetration(a: string, y: number): number {
  const ramp = (from: number, to: number, lo: number, hi: number) => lo + (hi - lo) * Math.max(0, Math.min(1, (y - from) / (to - from)));
  switch (a) {
    case 'tv': return ramp(1958, 1966, 0.35, 0.95);
    case 'color_tv': return ramp(1966, 1974, 0, 0.8);
    case 'ac': return ramp(1958, 1972, 0.12, 0.8);
    case 'pool': return ramp(1958, 1970, 0.3, 0.65);
    case 'phone': return ramp(1960, 1972, 0.25, 0.8);
    case 'parking': return 0.6;
    case 'dining': return 0.15;
    case 'lounge': return 0.12;
    case 'club': return 0.04;
    case 'spa': return 0.02;
    default: return 0;
  }
}

/** The rest of the island's motels, as one average competitor (beachfront, kept up to date). */
export function outsideUtility(seg: SegmentId, y: number): number {
  const g = SEGMENTS[seg];
  let u = 0.2 + 0.08;
  for (const [k, w] of Object.entries(g.likes)) u += (w ?? 0) * penetration(k, y);
  return u;
}

/** Lodging demand by segment this week (room-nights; hourly in stays). */
export function segmentDemand(s: GameState): Record<SegmentId, number> {
  const y = s.date.y;
  const c = seasonCurve(s.date);
  const base = islandRooms(y) * 7 * 0.86 * economyFactor(y);
  const out = {} as Record<SegmentId, number>;
  for (const id of SEGMENT_IDS) {
    const g = SEGMENTS[id];
    if (id === 'hourly') { out[id] = 1100 * (0.65 + 0.35 * c); continue; }
    // Busboys, ride jockeys and lifeguards arrive in May and stay until September.
    if (id === 'workers') { const m = s.date.m; out[id] = 3200 * (m >= 5 && m <= 9 ? 1 : m === 4 || m === 10 ? 0.35 : 0.08); continue; }
    out[id] = base * g.share * Math.max(g.winter * 0.25, c) * (c < 0.7 ? 1 + g.winter * 2 : 1);
  }
  return out;
}

/**
 * Clears the island's lodging market for the week: every open venue bids
 * for each segment; the rest of the island's motels are one big average
 * competitor. A venue that fills up spills its overflow to the others.
 */
export function clearMarket(s: GameState, bids: Bid[]): void {
  const dem = segmentDemand(s);
  const totalCap = bids.reduce((a, b) => a + b.cap, 0);
  const otherCap = Math.max(3500, islandRooms(s.date.y) * 7 - totalCap);
  for (const seg of SEGMENT_IDS) {
    let want = dem[seg];
    const hourly = seg === 'hourly';
    const workers = seg === 'workers';
    const outside = (hourly ? 260 * 7 * 2.4 : workers ? 280 * 7 : otherCap) * Math.exp(hourly || workers ? 0 : outsideUtility(seg, s.date.y));
    for (let pass = 0; pass < 2 && want > 1; pass++) {
      const room = (b: Bid) => (hourly ? b.hourlyCap - b.got.hourly : b.cap - SEGMENT_IDS.filter((x) => x !== 'hourly').reduce((a, x) => a + b.got[x], 0));
      const open = bids.filter((b) => room(b) > 0 && (hourly ? b.hourlyCap > 0 : b.cap > 0) && (!workers || b.v.concept === 'rooming'));
      const att = open.map((b) => (hourly ? b.hourlyCap : b.cap) * Math.exp(b.u[seg]));
      const sum = att.reduce((a, x) => a + x, 0) + outside;
      let spill = 0;
      open.forEach((b, i) => {
        const share = want * att[i] / sum;
        const take = Math.min(share, room(b));
        b.got[seg] += take;
        spill += share - take;
      });
      want = spill;
    }
  }
}

/* ---------------- the week of one venue ---------------- */

export interface WeekCtx {
  s: GameState;
  e: EmpireState;
  /** Whether the place may open this week (a padlock from a raid closes it). */
  canOpen: boolean;
}

function supplierOf(e: EmpireState, v: Venue, group: SupplyGroup) {
  const c = Object.values(e.contracts).find((x) => x.venueId === v.id && x.group === group);
  return SUPPLIERS.find((x) => x.id === c?.supplierId) ?? SUPPLIERS.find((x) => x.group === group)!;
}

/** Room units out of service (projects, breakdowns). */
export function closedRooms(s: GameState, e: EmpireState, v: Venue): number {
  const proj = Object.values(e.projects).filter((p) => p.venueId === v.id && p.status === 'active').reduce((a, p) => a + p.closes, 0);
  const broken = (v.brokenUntil ?? 0) > s.week ? v.brokenRooms ?? 0 : 0;
  return Math.min(roomCount(e, v), proj + broken);
}

export function isOpenWeek(s: GameState, v: Venue, canOpen: boolean): boolean {
  return canOpen && !v.closed && !winterClosed(v, s.date);
}

/** Builds the venue's bid for the market. */
export function makeBid(s: GameState, e: EmpireState, v: Venue, open: boolean): Bid {
  const d = s.date;
  const r = roomsByType(e, v, true);
  const closed = closedRooms(s, e, v);
  const total = r.room_std + r.room_deluxe + r.suite + r.room_hourly;
  const keep = total ? Math.max(0, total - closed) / total : 0;
  const nightly = (r.room_std + r.room_deluxe + r.suite) * keep;
  const hourly = r.room_hourly * keep;
  const turns = CONCEPTS[v.concept].turns;
  const cap = open && CONCEPTS[v.concept].kind === 'lodging' ? nightly * 7 * (v.concept === 'rooming' ? 1 : 1) : 0;
  const hourlyCap = open ? hourly * 7 * turns : 0;
  const quality = venueQuality(s, e, v, { hk: v.last ? Math.min(1, (v.last.exp.hkAdequacy ?? 1)) : 1, front: v.last?.exp.frontAdequacy ?? 1 });
  const am = amenities(e, v, s.date.y);
  const u = {} as Record<SegmentId, number>;
  const price = {} as Record<SegmentId, number>;
  const got = {} as Record<SegmentId, number>;
  for (const seg of SEGMENT_IDS) {
    price[seg] = segRate(v, seg, d, r);
    u[seg] = utility(s, e, v, seg, price[seg], quality, am);
    got[seg] = 0;
  }
  return { v, cap, hourlyCap, u, price, got, quality };
}

export interface WeekResult {
  stat: WeekStat;
  /** Purchases this week, by line (for the ledger label and the Supplies tab). */
  bought: { cat: string; item: string; units: number; cost: number }[];
  replaced: { cat: string; item: string; units: number; cost: number }[];
  breakdown?: string;
}

/**
 * Runs one venue's week after the market cleared: guests, covers, drinks,
 * consumption, deliveries and reorders, linen, wear, payroll, utilities,
 * upkeep, taxes, insurance, licenses, marketing. Mutates the venue's
 * records; returns the statement.
 */
export function runVenueWeek(s: GameState, e: EmpireState, v: Venue, bid: Bid, open: boolean, cash: number): WeekResult {
  const y = s.date.y;
  const infl = inflation(s);
  const curve = seasonCurve(s.date);
  const inS = isInSeason(s.date);
  const c = CONCEPTS[v.concept];
  const notes: string[] = [];
  const guests: Record<string, number> = {};
  let roomNights = 0;
  let roomsRev = 0;
  let stays = 0;
  for (const seg of SEGMENT_IDS) {
    const n = bid.got[seg];
    if (n <= 0) continue;
    if (seg === 'hourly') { stays += n; roomsRev += n * bid.price.hourly; guests.hourly = Math.round(n * 2); continue; }
    roomNights += n;
    roomsRev += n * bid.price[seg];
    guests[seg] = Math.round(n * SEGMENTS[seg].perRoom);
  }
  // Short stays wear a room like half a night each.
  const wearNights = roomNights + stays * 0.5;
  const cap = bid.cap + bid.hourlyCap * 0.5;
  const occ = bid.cap + bid.hourlyCap > 0 ? (roomNights + stays) / (bid.cap + bid.hourlyCap) : 0;
  // Food, drink, the club, the spa.
  const dineSeats = open ? seatsOf(e, v, 'dining') : 0;
  const barSeats = open ? seatsOf(e, v, 'lounge') : 0;
  const clubSeats = open ? seatsOf(e, v, 'club') : 0;
  const fq = dineSeats ? foodQ(e, v, y) : 0;
  const menu = (v.policy.menuPrice ?? 2.75 * infl);
  const refCheck = 2.75 * infl * (v.concept === 'luxury_resort' ? 2 : v.concept === 'boutique' ? 1.5 : 1);
  const foodU = -1.5 * Math.log(menu / refCheck) + 0.9 * (fq - 55) / 25 + 0.3 * (v.reputation - 50) / 25;
  const walkCurve = c.kind === 'lodging' ? curve : 0.35 + 0.65 * curve;
  let covers = 0;
  if (dineSeats) {
    const inhouse = SEGMENT_IDS.reduce((a, seg) => a + (bid.got[seg] * SEGMENTS[seg].perRoom * SEGMENTS[seg].dine), 0) * Math.min(1.3, Math.exp(foodU * 0.6));
    const walk = dineSeats * 7 * (c.kind === 'food' ? 1.95 : 0.8) * walkCurve * 0.55 * Math.exp(foodU);
    covers = Math.min(dineSeats * 7 * 2.2, inhouse + walk);
  }
  const drinkU = -1.4 * Math.log((v.policy.drinkPrice ?? 0.6 * infl) / (0.6 * infl)) + 0.6 * (qOf(v, 'liquor', y) - 55) / 25 + 0.3 * (v.reputation - 50) / 25;
  let clubGuests = 0;
  const ent = v.policy.act?.fee ?? v.policy.entertainment ?? 0;
  if (clubSeats) {
    const cq = clubQ(e, v, y);
    const entU = 0.45 * Math.log(Math.max(0.3, (ent + (v.policy.act?.draw ?? 0) * 100 * infl) / (300 * infl))) + 0.15 * actTier(e, v);
    const clubU = -1.4 * Math.log((v.policy.coverCharge ?? 1.5 * infl) / (1.5 * infl)) + entU + 0.7 * (cq - 55) / 25 + 0.3 * (v.reputation - 50) / 25;
    const inhouse = SEGMENT_IDS.reduce((a, seg) => a + bid.got[seg] * SEGMENTS[seg].perRoom * SEGMENTS[seg].club, 0);
    const walk = clubSeats * 4 * 1.3 * (0.3 + 0.7 * curve) * 0.85 * Math.exp(clubU);
    clubGuests = Math.min(clubSeats * 4 * 1.6, inhouse + walk);
  }
  let drinks = 0;
  if (barSeats || clubSeats) {
    const inhouse = SEGMENT_IDS.reduce((a, seg) => a + bid.got[seg] * SEGMENTS[seg].perRoom * SEGMENTS[seg].drink, 0) * Math.min(1.3, Math.exp(drinkU * 0.5)) * (barSeats ? 1 : 0.3);
    const walk = barSeats * 7 * 2.6 * walkCurve * Math.exp(drinkU) * (c.kind === 'bar' ? 1.0 : 0.7);
    drinks = Math.min((barSeats * 7 * 9) + clubGuests * 2.2, inhouse + walk + clubGuests * 2);
  }
  const spa = open && venueSpaces(e, v).some((x) => x.type === 'spa');
  const spaVisits = spa ? ((guests.couples ?? 0) + (guests.luxury ?? 0)) * 0.12 + (guests.business ?? 0) * 0.04 : 0;
  if (v.stock.ingredients?.short && covers) covers *= 0.6;
  // Staffing: who was needed and who was there.
  const hk = HOUSEKEEPING[v.policy.housekeeping];
  const washes = wearNights * hk.washes * 2;
  const w = { roomNights: wearNights, covers, drinks, clubGuests, spaVisits, washes, open, inSeason: inS };
  const adq: Partial<Record<DeptKind, number>> = {};
  let payroll = 0;
  let overtime = 0;
  for (const id of v.deptIds) {
    const d = e.depts[id];
    if (!d) continue;
    const staff = deptStaff(e, d);
    const wages = staff.reduce((a, x) => a + x.wage, 0);
    // Closed: only the people you kept on (Owner mode lets the seasonal staff go).
    payroll += open ? wages : staff.filter((x) => !x.seasonal).reduce((a, x) => a + x.wage, 0) * (v.policy.winter === 'close' ? 0.25 : 1);
    const need = workload(e, v, d.kind, w);
    const a = adequacy(e, v, d.kind, need);
    adq[d.kind] = a;
    if (open && a < 0.9) overtime += (0.9 - a) * Math.max(wages, 30 * infl) * 0.5;
  }
  if (!deptOf(e, v, 'laundry') && c.kind === 'lodging') adq.laundry = 1;
  // Consumables: use from stock, take deliveries, reorder.
  const bought: WeekResult['bought'] = [];
  const shortages: string[] = [];
  let suppliesCost = 0;
  let cogs = 0;
  const drivers: Record<string, number> = { roomNight: wearNights, cover: covers, drink: drinks, spaVisit: spaVisits, week: open && inS ? 1 : 0 };
  v.avgUse ??= {};
  const smart = v.owner !== 'player' || v.policy.mode !== 'micro';
  const skill = managerSkill(s, v);
  for (const cat of CAT_IDS) {
    const cd = CATS[cat];
    if (cd.kind !== 'consumable' || !catApplies(e, v, cat)) continue;
    const line = (v.stock[cat] ??= { item: v.policy.supplies[cat] ?? '', onHand: 0, onOrder: 0, used: 0, short: 0 });
    if (v.policy.supplies[cat]) line.item = v.policy.supplies[cat];
    const it = ITEMS_BY_ID[line.item];
    if (!it) continue;
    if (line.onOrder > 0 && (line.arrives ?? 0) <= s.week) { line.onHand += line.onOrder; line.onOrder = 0; line.arrives = undefined; }
    const need = (drivers[cd.driver ?? 'roomNight'] ?? 0) * (cd.use ?? 1) * (it.useMult ?? 1) * (it.price === 0 ? 0 : 1);
    const got = Math.min(need, line.onHand);
    line.onHand = Math.round((line.onHand - got) * 100) / 100;
    line.used += got;
    if (need - got > 0.5 && need > 0) { shortages.push(cat); line.short++; e.stats.shortages++; }
    v.avgUse[cat] = (v.avgUse[cat] ?? need) * 0.7 + need * 0.3;
    // The forecast: a sharp manager reads the calendar; micromanaged places reorder by the policy's rule.
    const sup = supplierOf(e, v, cd.group);
    const nextWeek = { ...s.date, d: Math.min(28, s.date.d + 7) };
    const ahead = seasonCurve(nextWeek) / Math.max(0.05, curve);
    // Reopening after the winter, the average says zero: a manager who reads the calendar orders by the rooms.
    const byRooms = cd.driver === 'roomNight' ? roomCount(e, v) * 7 * seasonCurve(nextWeek) * 0.75 * (cd.use ?? 1) * (it.useMult ?? 1) : 0;
    const fc = smart && rand(e) < 0.45 + skill / 140 ? Math.max(v.avgUse[cat] * Math.max(1, ahead), byRooms) : v.avgUse[cat];
    const target = fc * Math.max(1, v.policy.coverWeeks);
    if (line.onHand + line.onOrder < target * 0.7 && target > 0 && (open || ahead > 1)) {
      const qty = Math.ceil(target * 1.25 - line.onHand - line.onOrder);
      const unit = it.price * sup.price * infl;
      const cost = qty * unit;
      if (cost <= cash || v.owner === 'player') {
        line.onOrder += qty;
        line.arrives = s.week + (chance(e, sup.reliable) ? 1 : 2);
        bought.push({ cat, item: it.name, units: qty, cost });
        if (cat === 'ingredients' || cat === 'liquor') cogs += cost; else suppliesCost += cost;
      }
    }
  }
  // Linen: the service by the bundle, or your own laundry's soap.
  let linen = 0;
  if (c.kind === 'lodging' && washes > 0) {
    const sup = supplierOf(e, v, 'linen');
    linen = deptOf(e, v, 'laundry') ? washes * 0.02 * infl : washes * 0.085 * sup.price * infl;
  }
  // Durables wear (linen by washing, the rest by time and use) and get replaced at the policy's line.
  const replaced: WeekResult['replaced'] = [];
  const maint = MAINTENANCE[v.policy.maintenance];
  const rooms = roomCount(e, v);
  const occUse = 0.35 + 0.65 * Math.min(1.2, occ) * (v.concept === 'hourly_motel' ? 1.5 : v.concept === 'rooming' ? 1.3 : 1);
  let capex = 0;
  for (const cat of CAT_IDS) {
    const cd = CATS[cat];
    if (cd.kind !== 'durable' || !catApplies(e, v, cat)) continue;
    const dl = v.durables[cat];
    if (!dl) continue;
    const it = ITEMS_BY_ID[dl.item];
    dl.units = durableUnits(e, v, cat);
    if (!it?.life || it.price === 0) continue;
    if (cd.laundered) dl.wear = Math.min(100, dl.wear + (washes / 2) / Math.max(1, dl.units) / it.life * 100);
    else dl.wear = Math.min(100, dl.wear + 100 / it.life * (open ? occUse : 0.2) * (cd.scope === 'room' ? maint.wear : 1));
    const want = v.policy.supplies[cat] ?? dl.item;
    const nit = ITEMS_BY_ID[want] ?? it;
    if (dl.wear >= v.policy.replaceAt && dl.units > 0) {
      const sup = supplierOf(e, v, cd.group);
      const cost = Math.round(nit.price * dl.units * DURABLE_SCALE * sup.price * infl);
      const reserve = v.owner === 'player' ? cost + 500 * infl : cost;
      if (cash >= reserve) {
        capex += cost;
        replaced.push({ cat, item: nit.name, units: dl.units, cost });
        v.durables[cat] = { item: nit.id, units: dl.units, wear: 0 };
      }
    }
  }
  // The building ages (salt air, guests, deferred work) and sometimes something breaks.
  const b = venueBuilding(e, v);
  const zone = e.properties[v.propertyId]?.zone;
  const salt = zone && ['boardwalk', 'crest', 'north', 'piers', 'ac'].includes(zone) ? 1.2 : 1;
  let repairs = 0;
  let breakdown: string | undefined;
  if (b) {
    b.condition = Math.max(5, b.condition - 0.05 * salt * maint.wear * (0.5 + 0.8 * Math.min(1.2, occ)) * (v.concept === 'hourly_motel' ? 1.3 : 1));
    for (const sp of venueSpaces(e, v)) sp.condition = Math.max(5, sp.condition - 0.06 * maint.wear * (open ? 0.5 + Math.min(1.2, occ) : 0.2));
    if (b.condition < 55 && open && chance(e, (55 - b.condition) / 400)) {
      const what = ['the boiler gave out', 'the roof leaked through two rooms', 'a water main burst under the parking lot', 'the wiring shorted on the second floor', 'the pool pump seized'][randInt(e, 0, 4)];
      repairs += Math.round((80 + rooms * 6) * infl * (0.6 + rand(e)));
      v.brokenUntil = s.week + 2;
      v.brokenRooms = Math.max(1, Math.round(rooms * 0.15));
      breakdown = what;
      notes.push(`Breakdown: ${what}`);
    }
  }
  // The rest of the operating costs.
  const seats = seatsOf(e, v, 'dining') + seatsOf(e, v, 'lounge') + seatsOf(e, v, 'club');
  const acPower = (ITEMS_BY_ID[v.durables.aircon?.item ?? '']?.power ?? 0) * (d6(s.date) ? 1 : 0.15);
  let utilities = open
    ? (rooms * 0.9 + wearNights * (0.16 + acPower * 0.35) + seats * 0.18 + (dineSeats ? 25 : 0) + (clubSeats ? 25 : 0) + (venueSpaces(e, v).some((x) => x.type === 'pool') && inS ? 8 : 0)) * infl
    : (rooms * 0.15 + seats * 0.03) * infl;
  if (v.amenities.includes('insulation')) utilities *= 0.8;
  const upkeep = (rooms * 1.05 + seats * 0.06 + 4) * maint.cost * infl * (open ? 1 : 0.4) + repairs;
  const value = e.properties[v.propertyId]?.value ?? 0;
  const taxes = value * 0.016 / 52;
  const insurance = value * 0.005 / 52 * (b?.sprinklers ? 0.75 : 1) * (v.concept === 'hourly_motel' ? 1.5 : 1);
  const licenses = open || v.policy.winter !== 'close' ? (c.license + (barSeats ? 3 : 0) + (clubSeats ? 4 : 0)) * infl : c.license * infl * 0.5;
  const marketing = open ? v.policy.marketing : v.policy.marketing * 0.2;
  const entertainment = open && clubSeats ? ent : 0;
  const training = v.policy.training * v.deptIds.filter((id) => e.depts[id]?.headId).length;
  // Payroll taxes, workmen's comp and the welfare fund; the bookkeeper, the bank and the lawyer; travel agents' and AAA's commissions.
  payroll *= 1.12;
  // A private owner and his family work the desk themselves.
  if (v.owner !== 'player') payroll *= 0.85;
  // Revenue.
  const dining = covers * menu;
  const bar = drinks * (v.policy.drinkPrice ?? 0.6 * infl);
  const club = clubGuests * (v.policy.coverCharge ?? 1.5 * infl);
  const other = spaVisits * 4 * infl + (venueSpaces(e, v).some((x) => x.type === 'parking') ? (guests.luxury ?? 0) * 0.1 * infl : 0);
  const rev = { rooms: Math.round(roomsRev), dining: Math.round(dining), bar: Math.round(bar), club: Math.round(club), other: Math.round(other) };
  const exp: Record<string, number> = {
    payroll: Math.round(payroll + overtime), supplies: Math.round(suppliesCost), linen: Math.round(linen), utilities: Math.round(utilities), maintenance: Math.round(upkeep),
    taxes: Math.round(taxes), insurance: Math.round(insurance), licenses: Math.round(licenses), marketing: Math.round(marketing), entertainment: Math.round(entertainment), training: Math.round(training),
  };
  const revenue = rev.rooms + rev.dining + rev.bar + rev.club + rev.other;
  const upscale = v.concept === 'luxury_resort' ? 1 : v.concept === 'boutique' ? 0.6 : 0;
  exp.admin = Math.round(revenue * (0.04 + (v.concept === 'luxury_resort' ? 0.12 : 0.08) * upscale));
  // An upscale house sets money aside for its furnishings and pays its management company.
  if (upscale) exp.reserve = Math.round(revenue * 0.06 * upscale);
  exp.commissions = Math.round(rev.rooms * (0.025 + 0.05 * upscale));
  const opex = Object.values(exp).reduce((a, x) => a + x, 0) + Math.round(cogs);
  // Satisfaction and reputation.
  const quality = venueQuality(s, e, v, { hk: adq.housekeeping ?? 1, front: adq.front ?? 1 });
  const avgRate = roomNights + stays > 0 ? roomsRev / (roomNights + stays) : 0;
  const refRate = c.kind === 'lodging' ? (Object.values(c.rates)[0] ?? 7) * infl * marketPriceFactor(s.date) : 0;
  const priceGap = refRate ? Math.max(0, avgRate / refRate - 1.1) * 30 : 0;
  const sat = Math.max(0, Math.min(100, quality - priceGap + (rand(e) - 0.5) * 6));
  const volume = cap > 0 ? (roomNights + stays) / cap : covers + drinks > 0 ? 0.6 : 0;
  if (open && volume > 0.05) v.reputation = Math.max(0, Math.min(100, v.reputation + (sat - v.reputation) * 0.05 * Math.min(1, volume * 2)));
  else v.reputation += (50 - v.reputation) * 0.003;
  const stat: WeekStat = {
    week: s.week, open, capacity: Math.round(bid.cap + bid.hourlyCap), roomNights: Math.round(roomNights + stays), occ: Math.round(occ * 1000) / 1000,
    adr: Math.round(avgRate * 100) / 100, covers: Math.round(covers), drinks: Math.round(drinks), clubGuests: Math.round(clubGuests), guests,
    rev, cogs: Math.round(cogs), exp: { ...exp, hkAdequacy: Math.round((adq.housekeeping ?? 1) * 100) / 100, frontAdequacy: Math.round((adq.front ?? 1) * 100) / 100 },
    capex, noi: Math.round(revenue - opex), quality: Math.round(quality), sat: Math.round(sat), shortages, notes,
  };
  return { stat, bought, replaced, breakdown };
}

/** Summer months, when the air conditioners run. */
function d6(d: GameDate): boolean {
  return d.m >= 6 && d.m <= 9;
}

/** Totals of a week's expenses (excluding the adequacy markers). */
export function opexOf(st: WeekStat): number {
  return Object.entries(st.exp).filter(([k]) => !k.endsWith('Adequacy')).reduce((a, [, x]) => a + x, 0) + st.cogs;
}

export function revenueOf(st: WeekStat): number {
  return st.rev.rooms + st.rev.dining + st.rev.bar + st.rev.club + st.rev.other;
}

/** Rolls a week into the month and the year. */
export function rollup(s: GameState, v: Venue, st: WeekStat): void {
  const add = (list: PeriodStat[], key: string, max: number) => {
    let p = list.find((x) => x.key === key);
    if (!p) { p = { key, rev: 0, cogs: 0, opex: 0, noi: 0, capex: 0, roomNights: 0, capacity: 0, covers: 0, sat: 0, weeks: 0 }; list.push(p); if (list.length > max) list.splice(0, list.length - max); }
    p.rev += revenueOf(st);
    p.cogs += st.cogs;
    p.opex += opexOf(st) - st.cogs;
    p.noi += st.noi;
    p.capex += st.capex;
    p.roomNights += st.roomNights;
    p.capacity += st.capacity;
    p.covers += st.covers;
    p.sat = (p.sat * p.weeks + st.sat) / (p.weeks + 1);
    p.weeks++;
  };
  add(v.months, monthKey(s.date), 36);
  add(v.years, String(s.date.y), 30);
}

export { ROOM_TYPES };
