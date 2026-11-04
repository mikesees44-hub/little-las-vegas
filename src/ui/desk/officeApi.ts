import { createContext, useContext } from 'react';

/**
 * ENTRY POINTS to the weekly flows, for any screen that wants to open them
 * (the Boss's Desk today; an illustrated Boss's Office later): each opens the
 * very same flow the header, the desk and the hubs open. Provided by the App;
 * the defaults do nothing so components render in isolation (tests).
 */
export interface OfficeApi {
  /** The Desk (its home), optionally on one filter ('people' at the door, 'money' for the envelope). */
  openDesk: (filter?: 'all' | 'decisions' | 'capos' | 'lieutenants' | 'money' | 'people') => void;
  /** The envelope meeting: the underboss's audience for this week's report (or the envelope pages). */
  openEnvelope: () => void;
  /** Visitors and requests: the sit-down (the capos' and advisers' business). */
  openVisitors: () => void;
  /** The ledger: the envelope's books page. */
  openLedger: () => void;
  /** The calendar: the week's days (mornings and evenings), at a day. */
  openCalendar: (day?: number) => void;
  /** The Don's datebook (ui/planner): today hour by hour, the week, the month; the week's days are one tap inside it. */
  openDatebook: () => void;
  /** The waiting decisions, one by one. */
  openDecisions: () => void;
  /** The map (closes the drawers). */
  openMap: () => void;
  /** The family photos: the family tree. */
  openFamily: () => void;
  /** The newspaper: the news and the papers. */
  openNews: () => void;
  /** A place by its nav key ("house.court", "ops.travel"); "you.store#share" opens the Store on Share the wealth. */
  openPlace: (key: string) => void;
  /** "Ready to advance?" review (then the week turns, if the player says so). */
  openAdvance: () => void;
}

const noop = () => {};
export const OfficeContext = createContext<OfficeApi>({ openDesk: noop, openEnvelope: noop, openVisitors: noop, openLedger: noop, openCalendar: noop, openDatebook: noop, openDecisions: noop, openMap: noop, openFamily: noop, openNews: noop, openPlace: noop, openAdvance: noop });
export function useOffice(): OfficeApi {
  return useContext(OfficeContext);
}
