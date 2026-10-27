import type { OfficeApi } from '../desk/officeApi';

/**
 * The Boss's Office picture (office_interior, 1697 × 927) and its clickable
 * objects, measured on the image in percent of its width and height. Each
 * object opens an existing entry point (desk/officeApi.ts) or one of the
 * office's own panels (the door's visitors, the phone, the chair's briefing),
 * whose buttons in turn open existing flows.
 */
export type OfficePanel = 'door' | 'phone' | 'brief';
export type HotspotEntry = { api: Exclude<keyof OfficeApi, 'openAdvance' | 'openDesk' | 'openVisitors' | 'openDecisions'> } | { panel: OfficePanel };

export interface Hotspot {
  id: 'envelope' | 'ledger' | 'phone' | 'calendar' | 'newspaper' | 'photos' | 'map' | 'door' | 'chair';
  label: string;
  /** What it does, for the list and the screen reader. */
  hint: string;
  icon: string;
  /** Percent of the picture: left, top, width, height. */
  rect: { x: number; y: number; w: number; h: number };
  entry: HotspotEntry;
}

export const OFFICE_ART_SIZE: [number, number] = [1697, 927];

export const HOTSPOTS: Hotspot[] = [
  { id: 'map', label: 'Wall map', hint: 'South Jersey on the wall: go out to the map', icon: '⌖', rect: { x: 9.2, y: 0.5, w: 23.4, h: 33.5 }, entry: { api: 'openMap' } },
  { id: 'photos', label: 'Family photographs', hint: 'Your family: the tree, the heir, the house', icon: '♔', rect: { x: 4.5, y: 35.5, w: 33.5, h: 13 }, entry: { api: 'openFamily' } },
  { id: 'door', label: 'The door', hint: 'Who is waiting outside to see you', icon: '⚑', rect: { x: 55.5, y: 5.5, w: 13, h: 47 }, entry: { panel: 'door' } },
  { id: 'calendar', label: 'Appointment book', hint: 'This week, day by day: mornings and evenings', icon: '◷', rect: { x: 51, y: 55.3, w: 18.5, h: 6 }, entry: { api: 'openCalendar' } },
  { id: 'phone', label: 'Telephone', hint: 'Call your lawyer, your people, the other bosses', icon: '☏', rect: { x: 15.5, y: 56.5, w: 14, h: 18 }, entry: { panel: 'phone' } },
  { id: 'newspaper', label: 'Newspaper', hint: 'The papers and the news', icon: '✎', rect: { x: 3, y: 62, w: 12.3, h: 11 }, entry: { api: 'openNews' } },
  { id: 'ledger', label: 'Ledger', hint: 'The books: the money, the accounts, the agreements', icon: '▤', rect: { x: 32.5, y: 61.5, w: 24.5, h: 12 }, entry: { api: 'openLedger' } },
  { id: 'envelope', label: 'The envelope', hint: 'This week\'s count: hear it, take your cut', icon: '✉', rect: { x: 20.5, y: 70.5, w: 14.5, h: 9.5 }, entry: { api: 'openEnvelope' } },
  { id: 'chair', label: 'The chair across', hint: 'Your underboss: the week\'s briefing', icon: '♜', rect: { x: 85.5, y: 40, w: 14, h: 21 }, entry: { panel: 'brief' } },
];

/**
 * What clicking an object does: one existing entry point, or one of the office's panels. The
 * envelope opens the envelope meeting when there is a report, else the envelope pages (the ledger).
 */
export function openHotspot(h: Hotspot, api: OfficeApi, o: { hasReport: boolean; panel: (p: OfficePanel) => void }): void {
  if ('panel' in h.entry) { o.panel(h.entry.panel); return; }
  if (h.id === 'envelope' && !o.hasReport) { api.openLedger(); return; }
  const f = api[h.entry.api] as () => void;
  f();
}

export const HOTSPOT_BY_ID = Object.fromEntries(HOTSPOTS.map((h) => [h.id, h])) as Record<Hotspot['id'], Hotspot>;

/** The club in cutaway (social_club_cutaway, 1697 × 927): upstairs is the office, downstairs the bar. */
export const CLUB_SPOTS = {
  upstairs: { x: 49, y: 0.5, w: 50.5, h: 40.5 },
  bar: { x: 38, y: 47, w: 61.5, h: 52 },
  front: { x: 11, y: 5, w: 24, h: 80 },
};
