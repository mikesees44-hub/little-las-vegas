import { briefing } from '../briefing';
import { capos, displayName, isFree } from '../characters';
import { EDICTS } from '../crewlife';
import { budgetOf, capoLevelOf, DOMAIN_IDS, DOMAINS, LEVEL_LABEL, levelOf, presetOf, PRESETS, type LtDomain, type LtLevel, type LtPreset, type LtSeat } from '../lieutenants';
import { holder } from '../council';
import { inTheRanks } from '../rankView';
import { DEFAULT_POLICY, splitText } from '../tributeState';
import type { EdictId, GameState, PlayerAction } from '../types';
import { plannerOf } from './state';

/**
 * STANDING ORDERS: one page with every rule the boss has set and delegated, editable in one place.
 * Nothing new is kept here: each row reads and writes the system that owns it (lieutenants.ts: who
 * handles what, the budgets, the capos; briefing.ts: the trusted advisors; the envelope's standing split
 * (an order, like the office's); the edicts (an order); the brief's own setting).
 */

export interface StandingOrders {
  low: boolean;
  preset?: LtPreset;
  presets: { id: LtPreset; name: string; blurb: string }[];
  domains: { id: LtDomain; name: string; blurb: string; seat: LtSeat; seatName: string; level: LtLevel }[];
  budgets: { seat: LtSeat; name: string; amount: number }[];
  advisors: { key: string; name: string; title: string; on: boolean }[];
  capos: { id: string; name: string; level: LtLevel }[];
  split: { personal: number; text: string; auto: boolean };
  edicts: { id: EdictId; name: string; text: string; on: boolean }[];
  brief: boolean;
}

export const LEVELS: LtLevel[] = ['handle', 'ask', 'self'];
export { LEVEL_LABEL };

export function standingOrders(s: GameState): StandingOrders {
  const low = inTheRanks(s);
  const seatName = (seat: LtSeat) => { const c = holder(s, seat); return c && isFree(s, c) ? displayName(c) : `No ${seat}`; };
  let advisors: StandingOrders['advisors'] = [];
  try {
    const b = briefing(s);
    advisors = b.seats.filter((x) => !x.empty).map((x) => ({ key: x.key, name: x.name, title: x.title, on: !!s.briefing?.trust[x.key] }));
  } catch { advisors = []; }
  const pol = s.tribute?.policy ?? DEFAULT_POLICY;
  return {
    low,
    preset: low ? undefined : presetOf(s),
    presets: (Object.keys(PRESETS) as LtPreset[]).map((id) => ({ id, name: PRESETS[id].name, blurb: PRESETS[id].blurb })),
    domains: low ? [] : DOMAIN_IDS.map((id) => ({ id, name: DOMAINS[id].name, blurb: DOMAINS[id].blurb, seat: DOMAINS[id].seat, seatName: seatName(DOMAINS[id].seat), level: levelOf(s, id) })),
    budgets: low ? [] : (['underboss', 'consigliere'] as LtSeat[]).map((seat) => ({ seat, name: seatName(seat), amount: budgetOf(s, seat) })),
    advisors: low ? [] : advisors,
    capos: low ? [] : capos(s).filter((c) => isFree(s, c)).map((c) => ({ id: c.id, name: displayName(c), level: capoLevelOf(s, c.id) })),
    split: { personal: Math.round(pol.personal / 100), text: splitText(pol), auto: pol.auto },
    edicts: low ? [] : (Object.keys(EDICTS) as EdictId[]).map((id) => ({ id, name: EDICTS[id].name, text: EDICTS[id].text, on: !!s.edicts?.[id] })),
    brief: plannerOf(s).auto !== false,
  };
}

/** The envelope's standing split as an order (the office's own order): your cut in percent. */
export function splitOrder(s: GameState, personalPct: number, auto?: boolean): PlayerAction {
  const pol = s.tribute?.policy ?? DEFAULT_POLICY;
  const personal = Math.max(0, Math.min(100, Math.round(personalPct))) * 100;
  const reserve = Math.min(pol.reserve, 10000 - personal);
  return { kind: 'tribute', op: { op: 'policy', split: { personal, treasury: 10000 - personal - reserve, reserve }, auto: auto ?? pol.auto } } as PlayerAction;
}

export function edictOrder(id: EdictId, on: boolean): PlayerAction {
  return { kind: 'edict', edict: id, on };
}
