import { isInSeason } from './calendar';
import { CATS, CAT_IDS, itemAtTier } from './empireCatalog';
import { areaReport, deptOf, roomCount, roomsByType, venueBuilding } from './empireBuild';
import { CONCEPTS, DEPTS } from './empireData';
import { seasonCurve, managerSkill, winterClosed } from './empireOps';
import { projectOptions } from './empireProjects';
import { deptStaff, newWorker, promote, removeWorker, staffTarget } from './empireStaff';
import type { EmpireState, OperatingPreset, Venue } from './empireState';
import { inflation } from './property';
import { chance, rand } from './rng';
import type { GameState } from './types';

/**
 * Delegation (Module 11). Owner mode (the default): you make the big calls,
 * the manager runs the rest by a preset — prices, staffing, purchasing,
 * winter, small repairs — and brings you the projects that need your money.
 * Manager mode: you set prices, budgets, policies and staff; he buys and
 * reorders. Micromanage: you choose every item and every reorder line; he
 * just follows them. A manager follows your policy unless he has a reason to
 * disagree; ignore him long enough and he quits. Rivals run on the same code.
 */

export const BUILTIN_PRESETS: OperatingPreset[] = [
  { id: 'balanced', name: 'Balanced (recommended)', builtIn: true, blurb: 'Market prices, a full staff, normal upkeep, closed for the winter. The manager may spend a little on repairs.', policy: { priceStance: 'market', occupancyTarget: 0.85, staffing: 'standard', maintenance: 'normal', winter: 'close', coverWeeks: 2, replaceAt: 85, training: 0 }, tierDelta: 0 },
  { id: 'penny', name: 'Penny-pincher', builtIn: true, blurb: 'Lean staff, cheaper supplies, fix what breaks. Margins now, reputation later.', policy: { priceStance: 'budget', occupancyTarget: 0.92, staffing: 'lean', maintenance: 'defer', winter: 'close', coverWeeks: 1, replaceAt: 98, training: 0 }, tierDelta: -1 },
  { id: 'quality', name: 'Quality house', builtIn: true, blurb: 'Premium prices, generous staff, better supplies, preventive upkeep, training for the heads.', policy: { priceStance: 'premium', occupancyTarget: 0.8, staffing: 'generous', maintenance: 'preventive', winter: 'close', coverWeeks: 3, replaceAt: 70, training: 4 }, tierDelta: 1 },
  { id: 'yearround', name: 'Open all year', builtIn: true, blurb: 'A skeleton crew through the winter for the business travelers and the salesmen.', policy: { priceStance: 'market', occupancyTarget: 0.85, staffing: 'standard', maintenance: 'normal', winter: 'skeleton', coverWeeks: 2, replaceAt: 85, training: 0 }, tierDelta: 0 },
];

export function presetsOf(e: EmpireState): OperatingPreset[] {
  return [...BUILTIN_PRESETS, ...Object.values(e.presets)];
}

export function presetById(e: EmpireState, id?: string): OperatingPreset | undefined {
  return presetsOf(e).find((p) => p.id === id);
}

/** Applies a preset to a venue's policy (prices are set by the manager from the stance). */
export function applyPreset(s: GameState, e: EmpireState, v: Venue, p: OperatingPreset): void {
  const c = CONCEPTS[v.concept];
  Object.assign(v.policy, p.policy);
  v.policy.presetId = p.id;
  v.policy.supplyTier = Math.max(0, Math.min(3, c.tier + (p.tierDelta ?? 0)));
  if (v.policy.mode !== 'micro') chooseSupplies(s, e, v);
  const stance = { budget: 0.88, market: 1, premium: 1.1 }[v.policy.priceStance];
  for (const [k, r] of Object.entries(c.rates)) v.policy.rates[k as keyof typeof c.rates] = Math.round(r * inflation(s) * stance * 4) / 4;
}

/** The manager picks what to buy at the policy's tier (era-appropriate). */
export function chooseSupplies(s: GameState, _e: EmpireState, v: Venue): void {
  for (const cat of CAT_IDS) {
    const cd = CATS[cat];
    // Equipment that the place does not have yet (a TV, air conditioning) comes in by a project, not a reorder.
    if (cd.kind === 'durable' && ['tv', 'aircon', 'phone'].includes(cat)) continue;
    const it = itemAtTier(cat, v.policy.supplyTier, s.date.y);
    if (it && (v.stock[cat] || v.durables[cat] || !v.policy.supplies[cat])) v.policy.supplies[cat] = it.id;
  }
}

/** A snapshot of the policy as a reusable preset. */
export function presetFrom(v: Venue, id: string, name: string): OperatingPreset {
  const p = v.policy;
  const pol: OperatingPreset['policy'] = {
    priceStance: p.priceStance, occupancyTarget: p.occupancyTarget, housekeeping: p.housekeeping, staffing: p.staffing, maintenance: p.maintenance,
    winter: p.winter, marketing: p.marketing, coverWeeks: p.coverWeeks, replaceAt: p.replaceAt, training: p.training, autoCapex: p.autoCapex, offPct: p.offPct,
  };
  return { id, name, blurb: `Saved from ${v.name}`, policy: pol, tierDelta: p.supplyTier - CONCEPTS[v.concept].tier };
}

/* ---------------- the manager's week ---------------- */

/** The forecast the manager staffs for: next week's demand at last season's pace. */
export function forecastWeek(s: GameState, e: EmpireState, v: Venue) {
  const open = !winterClosed(v, s.date) && !v.closed;
  const rooms = roomCount(e, v);
  const next = { ...s.date, d: Math.min(28, s.date.d + 7) };
  const c = Math.max(seasonCurve(s.date), seasonCurve(next));
  const occ = Math.min(1, (v.last?.occ ?? 0.5) * (c / Math.max(0.05, seasonCurve(s.date))) * 0.5 + c * 0.6);
  const rn = rooms * 7 * occ;
  const ratio = v.last && v.last.roomNights > 0 ? 1 : 0;
  return {
    roomNights: rn, covers: (v.last?.covers ?? 0) * (ratio ? c / Math.max(0.1, seasonCurve(s.date)) : 1) || rn * 0.3,
    drinks: (v.last?.drinks ?? 0) || rn * 0.5, clubGuests: v.last?.clubGuests ?? 0, spaVisits: rn * 0.05, washes: rn * 2, open, inSeason: isInSeason(next) || isInSeason(s.date),
  };
}

/** Owner mode: the manager hires for the season and lets the summer staff go after it. */
function staffUp(s: GameState, e: EmpireState, v: Venue, log: string[]): void {
  const f = forecastWeek(s, e, v);
  for (const id of v.deptIds) {
    const d = e.depts[id];
    if (!d) continue;
    const target = f.open ? staffTarget(e, v, d.kind, f) : 0;
    const staff = deptStaff(e, d);
    const year = staff.filter((x) => !x.seasonal);
    if (staff.length < target) {
      const n = Math.min(4, target - staff.length);
      // Core staff are kept on through the winter; the rest are summer hires.
      const core = Math.max(1, Math.round(target * 0.35));
      for (let i = 0; i < n; i++) newWorker(s, e, v, d, { seasonal: year.length + i >= core || DEPTS[d.kind].seasonal });
    } else if (staff.length > target + (f.open ? 1 : 0)) {
      const extra = staff.filter((x) => x.seasonal && x.role !== 'head').sort((a, b) => a.skill - b.skill);
      for (const x of extra.slice(0, staff.length - target)) removeWorker(e, v, x, 'Let go at the end of the season', s.week);
      if (!f.open) for (const x of deptStaff(e, d).filter((x) => x.role !== 'head' && !x.charId)) if (deptStaff(e, d).length > 1 && chance(e, 0.3)) removeWorker(e, v, x, 'Laid off for the winter', s.week);
    }
    if (!d.headId && deptStaff(e, d).length >= 2) {
      const p = promote(s, e, v, d);
      if (p) log.push(`${p.name} was made ${DEPTS[d.kind].head.toLowerCase()}.`);
    }
  }
  void log;
}

/** Prices: the manager steers toward the occupancy target. */
function steerPrices(s: GameState, v: Venue, skill: number): void {
  const last = v.last;
  if (!last || !last.open || last.capacity <= 0 || seasonCurve(s.date) < 0.7) return;
  const c = CONCEPTS[v.concept];
  const infl = inflation(s);
  const t = v.policy.occupancyTarget;
  const noise = (100 - skill) / 100 * 0.04;
  let k = 1;
  if (last.occ > t + 0.05) k = 1.03;
  else if (last.occ < t - 0.12) k = 0.97;
  // A sharp manager moves prices decisively; a weak one dithers.
  if (k !== 1) k = 1 + (k - 1) * (0.5 + skill / 200) + (last.occ > t ? noise : -noise) * 0.25;
  for (const [rt, base] of Object.entries(c.rates)) {
    const cur = v.policy.rates[rt as keyof typeof c.rates] ?? base! * infl;
    const lo = base! * infl * 0.7;
    const hi = base! * infl * 1.35;
    v.policy.rates[rt as keyof typeof c.rates] = Math.round(Math.max(lo, Math.min(hi, cur * k)) * 4) / 4;
  }
}

/** What the manager thinks should be done next (best first). */
export function proposals(s: GameState, e: EmpireState, v: Venue): string[] {
  const out: string[] = [];
  const b = venueBuilding(e, v);
  if (!b) return out;
  const opts = Object.fromEntries(projectOptions(s, e, v).map((o) => [o.def.id, o]));
  const ok = (id: string) => opts[id] && !opts[id].why;
  const kind = CONCEPTS[v.concept].kind;
  if (b.condition < 58 && ok('structural')) out.push('structural');
  if (b.condition < 80 && ok('paint')) out.push('paint');
  if (kind === 'lodging') {
    const worn = ['mattress', 'furniture', 'carpet'].some((c) => (v.durables[c]?.wear ?? 0) > 80);
    if (worn && ok('refurnish')) out.push('refurnish');
    if (s.date.y >= 1959 && ok('ac') && roomCount(e, v) >= 8) out.push('ac');
    if (ok('tv')) out.push('tv');
    if (s.date.y >= 1967 && ok('color_tv')) out.push('color_tv');
    if (ok('pool') && v.concept !== 'hourly_motel' && v.concept !== 'rooming') out.push('pool');
    if (b.stories > 3 && ok('sprinklers')) out.push('sprinklers');
    if (s.date.y >= 1974 && ok('insulation')) out.push('insulation');
    if (v.concept === 'boutique' || v.concept === 'luxury_resort') { if (ok('spa')) out.push('spa'); if (ok('phones')) out.push('phones'); }
    if (roomsByType(e, v).room_std > 16 && (v.last?.occ ?? 0) > 0.95 && ok('remodel')) out.push('remodel');
  }
  void areaReport;
  return out;
}

/** The manager's week for a venue (player in Owner/Manager mode, and every rival). */
export function managerWeek(s: GameState, e: EmpireState, v: Venue, log: string[]): { start?: string; param?: string } {
  const mode = v.owner === 'player' ? v.policy.mode : 'owner';
  const skill = managerSkill(s, v);
  if (mode === 'owner') {
    steerPrices(s, v, skill);
    staffUp(s, e, v, log);
  }
  if (mode !== 'micro') {
    // Keep the supply choices era-appropriate (a discontinued item is replaced by its successor).
    for (const cat of CAT_IDS) {
      const id = v.policy.supplies[cat];
      if (!id) continue;
      const it = itemAtTier(cat, v.policy.supplyTier, s.date.y);
      if (it && mode === 'owner' && ((CATS[cat].kind === 'consumable') || !['tv', 'aircon', 'phone'].includes(cat))) v.policy.supplies[cat] = it.id;
    }
  }
  // Monthly: the manager's proposals.
  if (mode === 'owner' && s.date.d <= 7) {
    const list = proposals(s, e, v);
    v.proposals = list.slice(0, 4);
    const first = list[0];
    if (first) {
      const o = projectOptions(s, e, v).find((x) => x.def.id === first);
      if (o && !o.why && (o.cost <= v.policy.autoCapex || v.owner !== 'player')) {
        const cash = v.owner === 'player' ? s.money - 3000 * inflation(s) : v.cash ?? 0;
        if (cash > o.cost * (v.owner === 'player' ? 1 : 1.3) && (v.owner === 'player' || chance(e, 0.5))) return { start: first };
      }
    }
  }
  return {};
}

/** Manager / Micromanage mode: does he think the owner is wrong? Ignored long enough, he quits. */
export function gripes(s: GameState, e: EmpireState, v: Venue): string[] {
  if (v.owner !== 'player' || v.policy.mode === 'owner') return [];
  const c = CONCEPTS[v.concept];
  const out: string[] = [];
  const infl = inflation(s);
  const std = v.policy.rates.room_std ?? v.policy.rates.room_hourly;
  const base = c.rates.room_std ?? c.rates.room_hourly;
  if (std && base && std > base * infl * 1.6) out.push('The rates are too high for this crowd; the rooms sit empty');
  if (std && base && std < base * infl * 0.7) out.push('We are giving the rooms away');
  if (v.policy.supplyTier < c.tier - 1 || ((v.concept === 'boutique' || v.concept === 'luxury_resort') && v.policy.housekeeping === 'basic')) out.push('This is not the standard the guests pay for');
  if (v.policy.staffing === 'lean' && (v.last?.sat ?? 60) < 45) out.push('The staff are run ragged and the guests can tell');
  if (v.policy.maintenance === 'defer' && (venueBuilding(e, v)?.condition ?? 100) < 50) out.push('The building is falling apart; we have to fix it');
  if (Object.values(v.stock).some((x) => x.short > 3) && v.policy.coverWeeks < 2) out.push('We keep running out of supplies');
  return out;
}

/** A head of the house running a department: the family's opinion of the job. */
export function nepotism(e: EmpireState, v: Venue): string[] {
  const out: string[] = [];
  for (const id of v.deptIds) {
    const d = e.depts[id];
    const h = d?.headId ? e.staff[d.headId] : undefined;
    if (h?.charId && h.skill < 45) out.push(`${h.name} heads ${DEPTS[d!.kind].name.toLowerCase()} because of the family name; the staff resent it`);
  }
  return out;
}

export { deptOf, rand };
