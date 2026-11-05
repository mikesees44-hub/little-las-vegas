import { previewAction } from './actions';
import { FIRST_WINTER_PER_NEW, firstWinterAhead } from './economy';
import { newBusiness, owned, playerSlots } from './business';
import { CATALOG, availableIn } from './catalog';
import { canHold, earnerOf, earnerWeekly, freeEarners, holderOf, suggestFor, yearMult } from './earners';
import { consigliereWay, eaters, openPitches, pitchOdds, pitchTake } from './eat';
import type { Business, BusinessKind, Character, GameState, PlayerAction } from './types';

/**
 * PUT YOUR MONEY TO WORK. One read of every way the Family turns money and men
 * into more money, each with what it costs, what it brings back a week (the
 * year's average, summer and winter together) and how long it takes to pay for
 * itself. Pure: it only reads, and every line carries the existing order.
 */

export interface BuyIdea { kind: BusinessKind; district: string; name: string; where: string; cost: number; weekly: number; payback: number; action: PlayerAction; why?: string; staff: number; winter: number }
export interface Held { b: Business; weekly: number; upkeep: number; net: number; cost: number; weeks: number; earned: number; paidBack: number; holder?: string }
export interface EarnIdea { c: Character; b: Business; weekly: number; action: PlayerAction }

export { yearTake } from './worth';
import { yearTake } from './worth';

/** Weeks to pay for itself (Infinity when it never does). */
export const paybackWeeks = (cost: number, net: number) => (net > 0 ? Math.ceil(cost / net) : Infinity);

/** Every place the Family could buy now, best payback first (one per kind: its best district). */
export function buyIdeas(s: GameState, limit = 6): BuyIdea[] {
  const ds = s.districts.filter((d) => (d.influence.player ?? 0) >= 20 && (() => { const sl = playerSlots(s, d.id); return sl.used < sl.max; })());
  const best = new Map<BusinessKind, BuyIdea>();
  for (const kind of Object.keys(CATALOG) as BusinessKind[]) {
    const def = CATALOG[kind];
    if (def.hidden || def.category === 'property' || !availableIn(kind, s.date.y)) continue;
    for (const d of ds) {
      const b = newBusiness(s, kind, d.id);
      const weekly = Math.round(yearTake(s, { ...b, staffIds: [] }) * (def.staff ? 1 : 1));
      const net = weekly - def.upkeep;
      const action: PlayerAction = { kind: 'buyBusiness', biz: kind, district: d.id } as PlayerAction;
      const why = previewAction(s, action).disabledReason;
      if (why && !/^Needs \$/.test(why)) continue;
      // A place bought before the first winter costs extra to winterize through it (economy.ts FIRST_WINTER_PER_NEW): count it.
      const winter = firstWinterAhead(s) ? FIRST_WINTER_PER_NEW * 30 : 0;
      const idea: BuyIdea = { kind, district: d.id, name: def.name, where: d.name, cost: def.cost, weekly: net, payback: paybackWeeks(def.cost + winter, net), action, why, staff: def.staff ?? 0, winter };
      const cur = best.get(kind);
      if (!cur || idea.payback < cur.payback) best.set(kind, idea);
    }
  }
  return [...best.values()].filter((x) => Number.isFinite(x.payback)).sort((a, b) => a.payback - b.payback || a.cost - b.cost).slice(0, limit);
}

/** Why he can't buy anything at all right now (his rank), or undefined. */
export function buyBlock(s: GameState): string | undefined {
  const d = s.districts[0];
  if (!d) return undefined;
  const why = previewAction(s, { kind: 'buyBusiness', biz: 'pizza', district: d.id } as PlayerAction).disabledReason;
  return why && /rank|capo|made|boss/i.test(why) ? why : undefined;
}

/** What each place you own has done for you: its net a week, and how much of its price it has paid back. */
export function heldReturns(s: GameState): Held[] {
  return owned(s).filter((b) => (b.cost ?? CATALOG[b.kind]?.cost ?? 0) > 0).map((b) => {
    const weekly = yearTake(s, b);
    const upkeep = b.upkeep ?? 0;
    const net = weekly - upkeep;
    const cost = b.cost ?? CATALOG[b.kind].cost;
    const weeks = Math.max(0, s.week - (b.boughtWeek ?? s.week));
    const earned = Math.max(0, net * weeks);
    return { b, weekly, upkeep, net, cost, weeks, earned, paidBack: cost ? Math.min(1, earned / cost) : 1, holder: holderOf(s, b.id) };
  }).sort((a, b) => b.net - a.net);
}

/** Made men and capos with nothing steady of their own, each matched to a free place (the steadiest, biggest first). */
export function earnIdeas(s: GameState): EarnIdea[] {
  const free = freeEarners(s);
  if (!free.length) return [];
  const men = eaters(s).filter((c) => canHold(s, c) && !earnerOf(s, c.id))
    .sort((a, b) => (a.rank === 'capo' ? 0 : 1) - (b.rank === 'capo' ? 0 : 1) || (a.id < b.id ? -1 : 1));
  const taken = new Set<string>();
  const out: EarnIdea[] = [];
  for (const c of men) {
    const b = suggestFor(s, c, taken);
    if (!b) break;
    taken.add(b.id);
    out.push({ c, b, weekly: earnerWeekly(s, b), action: { kind: 'econ', op: { type: 'racket', cmd: { c: 'earner', who: c.id, bizId: b.id } } } as PlayerAction });
  }
  return out;
}

/** The men's own ideas, by what they are worth on average (stake back times the odds). */
export function pitchIdeas(s: GameState) {
  return openPitches(s).filter((p) => p.kind !== 'racket').map((p) => {
    if (p.kind === 'place') {
      const def = CATALOG[p.place!.kind];
      const net = Math.round(def.base * yearMult(p.place!.kind)) - def.upkeep;
      return { p, cost: p.stake, back: net, payback: paybackWeeks(p.stake, net), chance: 1, action: { kind: 'mymen', op: { op: 'pitch', pitch: p.id, how: 'back' } } as PlayerAction };
    }
    const o = pitchOdds(s, p, 'back');
    const take = pitchTake(p, 'back');
    return { p, cost: p.stake, back: Math.round(take * o.chance - p.stake), payback: NaN, chance: o.chance, action: { kind: 'mymen', op: { op: 'pitch', pitch: p.id, how: 'back' } } as PlayerAction };
  });
}

/** Every idle man the consigliere would put to work right now (one order each). */
export function workIdeas(s: GameState) {
  return consigliereWay(s).map(({ job, pick }) => ({ job, pick, c: s.characters[pick.id] }));
}
