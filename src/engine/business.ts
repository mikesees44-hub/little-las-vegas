import { EARNER_STEADY, holderOf, yearMult } from './earners';
import { econTakeMult, econWash } from './econ';
import { incomeBoost, racketNetMult, WASH_SCALE } from './money';
import { venueTake } from './empire';
import { perkMod } from './lifestyle';
import { isInSeason } from './calendar';
import { BIZ_NAMES, CATALOG, seasonalMult } from './catalog';
import { crew, displayName, hasTrait, isFree } from './characters';
import { activeTask } from './council';
import type { Business, BusinessKind, Character, GameState } from './types';

/** First unused name for a new place of this kind (pure: no RNG, no ids). */
export function nextBizName(s: GameState, kind: BusinessKind, districtName?: string): string {
  const taken = new Set(s.businesses.map((b) => b.name));
  const free = BIZ_NAMES[kind].find((n) => !taken.has(n));
  if (free) return free;
  let i = 2;
  const base = `${BIZ_NAMES[kind][0]}${districtName ? ` (${districtName})` : ''}`;
  while (taken.has(`${base} #${i}`)) i++;
  return `${base} #${i}`;
}

/** Builds a business record. The id is left empty; applyEffect('addBusiness') allocates it. */
export function newBusiness(s: GameState, kind: BusinessKind, districtId: string, name?: string): Business {
  const d = CATALOG[kind];
  const dist = s.districts.find((x) => x.id === districtId);
  return {
    id: '',
    name: name ?? nextBizName(s, kind, dist?.name),
    kind,
    districtId,
    owner: 'player',
    weeklyBase: d.base,
    upkeep: d.upkeep,
    heat: d.heat,
    category: d.category,
    staffIds: [],
    boughtWeek: s.week,
    cost: d.cost,
  };
}

export function owned(s: GameState): Business[] {
  return s.businesses.filter((b) => b.owner === 'player');
}

export function isOpen(s: GameState, b: Business): boolean {
  return !(b.closedUntil !== undefined && b.closedUntil > s.week);
}

export function ownsKind(s: GameState, kind: BusinessKind, openOnly = false): boolean {
  return owned(s).some((b) => b.kind === kind && (!openOnly || isOpen(s, b)));
}

export function staffNeed(b: Business): number {
  return CATALOG[b.kind].staff;
}

/** 1.0 when fully staffed; an unstaffed racket limps along at 40%. */
export function staffFactor(s: GameState, b: Business): number {
  const need = staffNeed(b);
  if (need === 0) return 1;
  const have = (b.staffIds ?? []).filter((id) => {
    const c = s.characters[id];
    return c && isFree(s, c) && c.faction === 'player' && !isBusy(s, c);
  }).length;
  return 0.4 + 0.6 * Math.min(1, have / need);
}

/** True if a man is away on a job (missions set busyUntil). */
export function isBusy(s: GameState, c: Character): boolean {
  return (c.busyUntil ?? 0) > s.week;
}

/** Men assigned to some business. */
export function staffing(s: GameState): Set<string> {
  const out = new Set<string>();
  for (const b of owned(s)) for (const id of b.staffIds ?? []) out.add(id);
  return out;
}

/** Soldiers and associates free to hustle (not jailed, not on a job, not running a racket). */
export function idleMen(s: GameState): Character[] {
  const busy = staffing(s);
  return crew(s).filter((c) => (c.rank === 'soldier' || c.rank === 'associate') && isFree(s, c) && !isBusy(s, c) && !busy.has(c.id) && !c.specialty);
}

/** Housekeeping: drop dead/jailed/departed staff and fill empty slots from idle men. */
export function autoStaff(s: GameState): string[] {
  const log: string[] = [];
  for (const b of owned(s)) {
    b.staffIds = (b.staffIds ?? []).filter((id) => {
      const c = s.characters[id];
      return c && c.alive && c.faction === 'player' && (c.rank === 'soldier' || c.rank === 'associate') && isFree(s, c);
    });
  }
  for (const b of owned(s)) {
    const need = staffNeed(b);
    while ((b.staffIds ?? []).length < need) {
      const pool = idleMen(s).sort((a, c) => c.attributes.business - a.attributes.business);
      const m = pool[0];
      if (!m) break;
      b.staffIds!.push(m.id);
      log.push(`${displayName(m)} now runs ${b.name}.`);
    }
  }
  return log;
}

/** District control multiplier (60% .. 100%). */
export function controlFactor(s: GameState, b: Business): number {
  const d = s.districts.find((x) => x.id === b.districtId);
  return d ? 0.6 + 0.4 * ((d.influence.player ?? 0) / 100) : 1;
}

/** Expected weekly take this week (before random scores), for the UI and the economy. */
export function expectedTake(s: GameState, b: Business): number {
  if (!isOpen(s, b)) return 0;
  const ven = venueTake(s, b);
  if (ven !== undefined) return ven;
  // A steady earner (earners.ts) pays the same all year: the year's average season, summer and winter alike.
  const held = !!holderOf(s, b.id);
  const mult = held ? yearMult(b.kind) : seasonalMult(b.kind, isInSeason(s.date));
  let v = b.weeklyBase * mult * controlFactor(s, b) * staffFactor(s, b);
  if (b.kind === 'construction' && s.favors > 0) v *= 1.4;
  const runner = (b.staffIds ?? []).map((id) => s.characters[id]).find(Boolean);
  if (runner && hasTrait(runner, 'Gambler') && b.category === 'racket') v *= 0.9;
  v *= econTakeMult(s, b);
  // The money pass (money.ts): rackets pay more, and more again as the family runs more of them.
  if (b.category === 'racket') v *= incomeBoost(s, 'rackets') * racketNetMult(s);
  // A steady earner: the man watches it himself (earners.ts).
  if (held) v *= 1 + EARNER_STEADY;
  return Math.round(v);
}

/** Dirty money the fronts can wash this week. */
export function washCapacity(s: GameState): number {
  let cap = 0;
  for (const b of owned(s)) {
    if (!isOpen(s, b)) continue;
    const d = CATALOG[b.kind];
    if (!d.launder) continue;
    // A seasonal front shut for the winter washes less (an empty motel can only claim so many guests).
    const seasonal = isInSeason(s.date) ? 1 : Math.max(0.35, Math.min(1, d.season[1] / Math.max(0.01, d.season[0]) * 1.5));
    cap += d.launder * seasonal * staffFactor(s, b);
  }
  cap += econWash(s);
  // A bookkeeper (consigliere or specialist with business sense) squeezes more through.
  const books = crew(s).find((c) => c.specialty === 'accountant' && isFree(s, c));
  if (books) cap *= 1.25;
  cap *= 1 + 0.2 * Math.min(1.5, activeTask(s, 'bag_launder'));
  cap *= 1 + perkMod(s, 'launder') / 100;
  // The money pass (money.ts): the fronts claim more customers, in step with the bigger take.
  cap *= WASH_SCALE;
  return Math.round(cap);
}

export function countKind(s: GameState, kind: BusinessKind): number {
  return owned(s).filter((b) => b.kind === kind).length;
}

/** Storefronts in a district (bigger districts hold more). */
export function districtSlots(s: GameState, districtId: string): number {
  const d = s.districts.find((x) => x.id === districtId);
  return d ? Math.max(3, Math.round(d.streetBase / 60)) : 0;
}

/** How many places the crew can run in a district: its share of the storefronts. */
/** Operations with no storefront of their own (an envelope, a sit-down, a second set of books). */
export const NO_SLOT: BusinessKind[] = ['payoff', 'court', 'taxdodge'];

export function playerSlots(s: GameState, districtId: string): { used: number; max: number } {
  const d = s.districts.find((x) => x.id === districtId);
  const max = d ? Math.floor((districtSlots(s, districtId) * (d.influence.player ?? 0)) / 100) : 0;
  const used = owned(s).filter((b) => b.districtId === districtId && CATALOG[b.kind].category !== 'property' && b.kind !== 'bank' && b.kind !== 'casino' && !NO_SLOT.includes(b.kind)).length;
  return { used, max };
}
