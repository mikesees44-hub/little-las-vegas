import { createContext, useContext } from 'react';
import { spendTime, timeBlock, unbook, refundTime, absDay } from '../../engine/timeCost';
import { comeHome } from '../../engine/visit';
import type { GameState, PlayerAction } from '../../engine/types';
import { useOrders } from '../components/Orders';
import { useSheet } from '../components/People';
import { useShell } from '../shell/context';
import { useTravel } from '../travel/context';
import { markOrder, orderMark } from './orderMarks';
import type { PlanDo } from './plans';

/**
 * What the Plans panel, the live alerts and the Underboss's picks need from
 * the App that no shared context gives: the windows only the App opens (an
 * urgent meeting, a decision, a day, the sit-down, the envelope), the
 * week's unsent answers, and pausing the clock.
 */
export interface PlansApi {
  answers: Record<string, string>;
  briefSkip: readonly string[];
  urgent: (id: string) => void;
  event: (iid: string) => void;
  decisions: () => void;
  day: (day: number) => void;
  sitdown: () => void;
  envelope: () => void;
  /** Stop the running clock. */
  pause: (why: string) => void;
}

const noop = () => {};
export const PlansContext = createContext<PlansApi>({ answers: {}, briefSkip: [], urgent: noop, event: noop, decisions: noop, day: noop, sitdown: noop, envelope: noop, pause: noop });

export function usePlansApi(): PlansApi {
  return useContext(PlansContext);
}

/** Carry out a row's quick action. Returns false when it could not be done here. */
export function usePlanDo(s: GameState): (d: PlanDo, after?: () => void) => void {
  const api = usePlansApi();
  const shell = useShell();
  const sheet = useSheet();
  const travel = useTravel();
  const { orders, remove, queue } = useOrders();
  return (d, after) => {
    const close = () => after?.();
    switch (d.to) {
      case 'cancelOrder': {
        const a = orders[d.index];
        if (!a) return;
        const m = orderMark(a);
        // The hours come back: a booked day is released; today's hours only if it is still the same day.
        if (m && shell.update) shell.update((cur) => (m.booked !== undefined ? unbook(cur, m.booked, m.hours) : m.abs === absDay(cur) ? refundTime(cur, m.hours, m.late ?? 0, !!m.missedDinner) : cur));
        remove(d.index);
        return;
      }
      case 'today': {
        const a = orders[d.index];
        const m = a ? orderMark(a) : undefined;
        if (!a || m?.booked === undefined || timeBlock(s, a) || !shell.update) return;
        const spent = spendTime(unbook(s, m.booked, m.hours), a);
        markOrder(a, { abs: absDay(s), hours: spent.hours, late: spent.late, missedDinner: spent.missedDinner });
        shell.update((cur) => spendTime(unbook(cur, m.booked!, m.hours), a).state);
        return;
      }
      case 'queue': queue(d.action as PlayerAction); return;
      case 'route': close(); shell.go(d.route); return;
      case 'sheet': close(); sheet.open(d.id); return;
      case 'urgent': close(); api.urgent(d.id); return;
      case 'event': close(); api.event(d.iid); return;
      case 'day': close(); api.day(d.day); return;
      case 'sitdown': close(); api.sitdown(); return;
      case 'envelope': close(); api.envelope(); return;
      case 'city': close(); travel.city?.(); return;
      case 'comeHome': shell.update?.((cur) => comeHome(cur)); return;
      case 'focus': close(); shell.focus(d.focus); return;
      case 'orders': close(); (document.querySelector('[data-testid=orders-button]') as HTMLButtonElement | null)?.click(); return;
    }
  };
}
