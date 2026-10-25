import type { PermitVerdict } from './econ';
import type { Lot } from './econState';
import { controlIndex } from './polIntegrity';
import { holders, nameOf, peekCtl } from './polGov';
import { rand } from './rng';
import type { PolPerson } from './polState';
import type { GameState } from './types';

/**
 * Building permits go through people: the zoning board (the commission for
 * the lot's town) and the building inspector (the county fire marshal's
 * office). A commissioner or an inspector you control speeds the permits
 * through; an honest inspector, when you are hot, holds them up.
 */

const BOARD: Record<string, string> = { north: 'nw_council', crest: 'crest_commission' };

/** The senior building/fire inspector on the island. */
export function inspector(s: GameState): PolPerson | undefined {
  const pol = s.pol;
  if (!pol) return undefined;
  return Object.values(pol.people)
    .filter((p) => p.alive && !p.retired && (p.inst === 'county_fire' || p.inst === 'wildwood_fd'))
    .sort((a, b) => (b.inst === 'county_fire' ? 1 : 0) - (a.inst === 'county_fire' ? 1 : 0) || b.rung - a.rung || (a.id < b.id ? -1 : 1))[0];
}

export function permitAuthority(s: GameState, lot: Lot): PermitVerdict | undefined {
  const pol = s.pol;
  if (!pol) return undefined;
  const ci = (p: PolPerson) => {
    const c = peekCtl(s, p.id);
    return c && !c.flipped ? controlIndex(c) : 0;
  };
  const board = holders(s, BOARD[lot.zone] ?? 'ww_commission').filter((p): p is PolPerson => !!p && p.alive);
  const friend = board.find((p) => ci(p) >= 70);
  if (friend) return { verdict: 'fast', why: `Commissioner ${nameOf(s, friend)} walked the permits through the zoning board` };
  const insp = inspector(s);
  if (!insp) return undefined;
  if (ci(insp) >= 60) return { verdict: 'fast', why: `${nameOf(s, insp)} signed the inspections the day they came in` };
  if (insp.integrity >= 70 && s.heat.local >= 40 && rand(pol) < 0.25) return { verdict: 'blocked', why: `${nameOf(s, insp)}, an honest inspector, will not sign off yet` };
  return undefined;
}
